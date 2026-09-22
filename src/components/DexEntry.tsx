import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAreaUnlocked, regionOf, regionOfArea, type Area, type GameData, type ItemDef, type RegionId } from '@/engine'
import { dexNo } from '@/lib/format'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { enterArea } from '@/store/run'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { evolutionHow, PokemonSheet } from './PokemonSheet'
import { SpriteImg } from './SpriteImg'
import { AreaBanner } from '@/components/AreaBanner'

interface Spot {
  area: Area
  minLevel: number
  maxLevel: number
  /** Share of the area's wild pool — or of its loot table for a fossil (0 for a legendary). */
  share: number
  legendary: boolean
  /** Set when the species is revived from a fossil found here rather than met in the grass. */
  fossil?: ItemDef
}

/**
 * Every area of `region` where a species turns up in the wild or as a legendary, main chain first, secret areas
 * last.
 *
 * Only the region being played: its areas are the only ones the player can reach, the only ones whose lock state
 * `isAreaUnlocked` can answer for (it reads the live region's progress), and the only ones the card's travel button
 * can enter. Listing another region's routes offered a Kanto player a walk to Mount Silver.
 */
export function whereToFind(dex: number, data: GameData, region: RegionId): Spot[] {
  const out: Spot[] = []
  for (const area of data.areas) {
    if (regionOfArea(area) !== region) continue
    const total = area.wildPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
    const hits = area.wildPool.filter((e) => e.dex === dex && e.weight > 0)
    if (hits.length && total) {
      out.push({
        area,
        minLevel: Math.min(...hits.map((h) => h.minLevel)),
        maxLevel: Math.max(...hits.map((h) => h.maxLevel)),
        share: hits.reduce((sum, h) => sum + h.weight, 0) / total,
        legendary: false,
      })
    }
    const boss = area.legendaryBoss?.find((b) => b.dex === dex)
    if (boss) out.push({ area, minLevel: boss.level, maxLevel: boss.level, share: 0, legendary: true })

    // Omanyte, Kabuto and Aerodactyl are wild nowhere: they are dug out of an area's loot table as a fossil, and
    // without this the only Pokémon in the game you have to go looking for had no entry telling you where.
    const lootTotal = area.lootPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
    for (const entry of area.lootPool) {
      if (entry.weight <= 0) continue
      const item = data.items[entry.itemKey]
      if (item?.effect.kind !== 'fossil' || item.effect.dex !== dex) continue
      out.push({
        area,
        // A fossil revives at its own level, whatever the area does to wild ones.
        minLevel: item.effect.level,
        maxLevel: item.effect.level,
        share: lootTotal ? entry.weight / lootTotal : 0,
        legendary: false,
        fossil: item,
      })
    }
  }
  return out.sort((a, b) => Number(a.area.hidden) - Number(b.area.hidden) || a.area.orderIndex - b.area.orderIndex)
}

const rarity = (share: number) => t(share >= 0.15 ? 'ui.dex.common' : share >= 0.06 ? 'ui.dex.uncommon' : 'ui.dex.rare')

function SpotCard({ spot, onTravel }: { spot: Spot; onTravel?: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const runArea = useGame((s) => s.run.areaId)
  const navigate = useNavigate()
  if (!save) return null
  const { area } = spot
  const unlocked = isAreaUnlocked(save, area.id, data)
  const secret = area.hidden && !unlocked
  const levels = area.scalesToTeam && !spot.fossil
    ? t('ui.dex.scaling')
    : spot.minLevel === spot.maxLevel
      ? t('ui.common.level.short', { n: spot.minLevel })
      : t('ui.map.levelRange', { min: spot.minLevel, max: spot.maxLevel })
  return (
    <li className="pixel-panel overflow-hidden p-0">
      {area.bannerUrl && (
        <AreaBanner url={area.bannerUrl} className={cx('h-16', !unlocked && 'opacity-70 grayscale', secret && 'blur-[1px]')} />
      )}
      <div className="flex flex-wrap items-center gap-2 p-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-2xl leading-none">
            {!unlocked && <PixelIcon name="lock" size={16} title={t('ui.dex.locked')} />}
            <span className="truncate">{secret ? t('ui.dex.aSecretArea') : area.name}</span>
          </div>
          <div className="text-lg text-muted">
            {spot.fossil
              ? t('ui.dex.fossilSpot', { item: spot.fossil.name, levels, rarity: rarity(spot.share) })
              : spot.legendary
                ? t('ui.dex.legendarySpot', { levels })
                : t('ui.dex.wildSpot', { levels, rarity: rarity(spot.share) })}
            {!unlocked && t('ui.dex.lockedSuffix')}
          </div>
        </div>
        {unlocked && runArea === area.id && (
          <span className="border-2 border-ink bg-gold px-1.5 text-base leading-tight text-ink">{t('ui.dex.youAreHere')}</span>
        )}
        {unlocked && !runArea && (
          <PixelButton
            size="sm"
            variant="primary"
            onClick={() => {
              if (!enterArea(area.id)) return
              onTravel?.()
              navigate('/area')
            }}
          >
            {t('ui.dex.goThere')}
          </PixelButton>
        )}
      </div>
    </li>
  )
}

/** An uncaught species: its silhouette, and where it can be found (or what it evolves from). */
function MissingEntry({ dex, onOpenDex, onTravel }: { dex: number; onOpenDex?: (dex: number) => void; onTravel?: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const pokedex = save?.pokedex
  const region = save ? regionOf(save) : null
  const runArea = useGame((s) => s.run.areaId)
  const spots = useMemo(() => (region ? whereToFind(dex, data, region) : []), [dex, data, region])
  const from = data.speciesList
    .map((s) => ({ species: s, evo: s.evolutions.find((e) => e.toDex === dex) }))
    .filter((x) => !!x.evo)
  const runName = runArea ? data.areas.find((a) => a.id === runArea)?.name : null
  const canTravelSomewhere = spots.some((s) => s.area.id !== runArea)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SpriteImg dex={dex} size={112} silhouette className="border-[3px] border-ink bg-parchment" />
        <div className="min-w-0">
          <div className="font-mono text-sm text-muted">{dexNo(dex)}</div>
          <div className="text-4xl leading-none">{t('ui.common.unknown')}</div>
          <p className="copy text-muted">{t('ui.dex.notCaught')}</p>
        </div>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-2xl">{t('ui.dex.whereToFindHeading')}</h3>
        {spots.length > 0 && (
          <ul className="flex flex-col gap-2">
            {spots.map((s) => (
              <SpotCard key={`${s.area.id}-${s.legendary}`} spot={s} onTravel={onTravel} />
            ))}
          </ul>
        )}
        {from.map(({ species, evo }) => {
          const known = pokedex?.includes(species.dex)
          return (
            <button
              key={species.dex}
              type="button"
              onClick={() => onOpenDex?.(species.dex)}
              className="pixel-panel flex w-full items-center gap-2 p-2 text-left hover:bg-white"
            >
              <SpriteImg dex={species.dex} size={48} silhouette={!known} />
              <span className="text-xl leading-tight">
                {t(evo!.item ? 'ui.dex.evolvesFromItem' : 'ui.dex.evolvesFromLevel', {
                  name: known ? species.name : t('ui.common.unknown'),
                  how: evolutionHow(evo!, data),
                })}
              </span>
            </button>
          )
        })}
        {spots.length === 0 && from.length === 0 && <p className="copy text-muted">{t('ui.dex.notSpotted')}</p>}
        {runName && canTravelSomewhere && <p className="copy text-muted">{t('ui.dex.exploringHint', { area: runName })}</p>}
      </section>
    </div>
  )
}

/** A Pokédex entry: the full sheet once caught, otherwise where to find it. */
export function DexEntry({ dex, onOpenDex, onTravel }: { dex: number; onOpenDex?: (dex: number) => void; onTravel?: () => void }) {
  const save = useGame((s) => s.save)
  if (!save) return null
  if (!save.pokedex.includes(dex)) return <MissingEntry dex={dex} onOpenDex={onOpenDex} onTravel={onTravel} />
  const best = save.box.filter((p) => p.dex === dex).sort((a, b) => b.level - a.level)[0]
  return <PokemonSheet dex={dex} inst={best} onOpenDex={onOpenDex} />
}
