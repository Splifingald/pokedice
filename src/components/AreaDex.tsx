import { useMemo } from 'react'
import { nationalDex, type Area, type GameData } from '@/engine'
import { dexNo } from '@/lib/format'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { AreaStrip } from './AreaStrip'
import { rarity } from './DexEntry'
import { SpriteImg } from './SpriteImg'

export interface AreaMon {
  dex: number
  kind: 'wild' | 'legendary' | 'fossil'
  /** Share of the wild pool (or, for a fossil, of the loot table); 0 for a legendary. */
  share: number
}

/** Every Pokémon an area can give: its wild ones by Pokédex number, then its legendaries, then its fossils. */
export function areaPokemon(area: Area, data: GameData): AreaMon[] {
  const wildTotal = area.wildPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
  const wild = new Map<number, number>()
  for (const e of area.wildPool) if (e.weight > 0) wild.set(e.dex, (wild.get(e.dex) ?? 0) + e.weight)
  const out: AreaMon[] = [...wild]
    .sort(([a], [b]) => a - b)
    .map(([dex, w]) => ({ dex, kind: 'wild', share: wildTotal ? w / wildTotal : 0 }))
  for (const b of area.legendaryBoss ?? []) out.push({ dex: b.dex, kind: 'legendary', share: 0 })
  const lootTotal = area.lootPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
  for (const e of area.lootPool) {
    const effect = data.items[e.itemKey]?.effect
    if (e.weight <= 0 || effect?.kind !== 'fossil') continue
    out.push({ dex: effect.dex, kind: 'fossil', share: lootTotal ? e.weight / lootTotal : 0 })
  }
  // A species both wild and a boss (or dug up twice) shows once, as its first listing.
  return out.filter((m, i) => out.findIndex((o) => o.dex === m.dex) === i)
}

/** An area's Pokémon as a Pokédex page: silhouettes until caught, each tappable for its full entry. */
export function AreaDex({ areaId, onOpenDex }: { areaId: string; onOpenDex: (dex: number) => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const pokedex = useGame((s) => s.save?.pokedex)
  const area = data.areas.find((a) => a.id === areaId)
  const mons = useMemo(() => (area ? areaPokemon(area, data) : []), [area, data])
  if (!area) return null
  const caught = new Set(pokedex ?? [])
  const wild = mons.filter((m) => m.kind === 'wild')
  return (
    <div className="flex flex-col gap-3">
      {/* The area's scene strip, cut from the same picture as Home's. */}
      <AreaStrip area={area} h={40} className="-mx-1 block h-auto w-[calc(100%+0.5rem)] max-w-none" />
      <div>
        <h2 className="text-[32px] leading-none">{area.name}</h2>
        <p className="text-lg text-muted">
          {area.scalesToTeam
            ? t('ui.map.levelTeam')
            : t('ui.map.levelRange', { min: area.minLevel, max: area.maxLevel })}
          {wild.length > 0 &&
            ` · ${t('ui.map.speciesCaught', { caught: wild.filter((m) => caught.has(m.dex)).length, total: wild.length })}`}
        </p>
      </div>
      {mons.length === 0 ? (
        <p className="copy text-muted">{t('ui.areaDex.none')}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 xs:grid-cols-4">
          {mons.map((m) => {
            const has = caught.has(m.dex)
            return (
              <li key={m.dex}>
                <button
                  type="button"
                  onClick={() => onOpenDex(m.dex)}
                  className={cx(
                    'pixel-panel flex w-full flex-col items-center p-1 hover:bg-paper',
                    !has && 'bg-parchment',
                  )}
                  title={has ? data.species[m.dex]?.name : t('ui.dex.whereToFind')}
                >
                  <span className="self-start font-mono text-xs text-muted">{dexNo(nationalDex(data, m.dex))}</span>
                  <SpriteImg dex={m.dex} size={64} silhouette={!has} />
                  <span className="w-full truncate text-center text-base leading-none">
                    {has ? data.species[m.dex]?.name : t('ui.common.unknown')}
                  </span>
                  <span
                    className={cx(
                      'text-sm leading-none',
                      m.kind === 'legendary' ? 'text-danger' : 'text-muted',
                    )}
                  >
                    {m.kind === 'legendary'
                      ? t('ui.areaDex.legendary')
                      : m.kind === 'fossil'
                        ? t('ui.areaDex.fossil')
                        : rarity(m.share)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
