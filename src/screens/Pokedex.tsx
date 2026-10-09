import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import {
  conditionStatus,
  getRegion,
  isAreaUnlocked,
  nationalDex,
  regionOf,
  regionOfArea,
  regionSpecies,
  type GameData,
  type SaveData,
} from '@/engine'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { PixelIcon } from '@/components/icons'
import { MonTile, TILE_GRID, TileTag } from '@/components/MonTile'
import { PageHead } from '@/components/PageHead'
import { FilterChips, SearchField } from '@/components/Segmented'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { markDexSeen, useDexNew } from '@/lib/dexSeen'
import { dexNo } from '@/lib/format'
import { useGame } from '@/store/game'

type Filter = 'all' | 'caught' | 'missing' | 'nearby'

/** The secret area of this region that opens at a Pokédex count, and how many more catches it needs. */
function nextDexUnlock(save: SaveData, data: GameData): { name: string; more: number } | null {
  let best: { name: string; more: number } | null = null
  for (const a of data.areas) {
    if (!a.hidden || regionOfArea(a) !== regionOf(save) || isAreaUnlocked(save, a.id, data)) continue
    const unmet = (a.unlockConditions ?? []).filter((c) => !conditionStatus(c, save, data).met)
    const c = unmet[0]
    if (unmet.length !== 1 || c?.kind !== 'pokedex') continue
    const s = conditionStatus(c, save, data)
    const more = s.target - s.current
    if (more > 0 && (!best || more < best.more)) best = { name: a.name, more }
  }
  return best
}

export function PokedexScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [view, setView] = useState<SheetView | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  // What was new on arrival keeps its NEW tag while the screen is open; looking clears the tab bar's dot.
  const newCount = useDexNew()
  const [fresh] = useState(() => new Set(newCount > 0 ? (save?.pokedex.slice(-newCount) ?? []) : []))
  const count = save?.pokedex.length ?? 0
  useEffect(() => markDexSeen(), [count])

  // Missing species you can meet right now: in a wild pool (or as a legendary) of an area you've opened.
  const nearby = useMemo(() => {
    const set = new Set<number>()
    if (!save) return set
    for (const a of data.areas) {
      // "Nearby" means without leaving: an unlocked area of the region you are standing in.
      if (regionOfArea(a) !== regionOf(save) || !isAreaUnlocked(save, a.id, data)) continue
      for (const w of a.wildPool) if (w.weight > 0 && !save.pokedex.includes(w.dex)) set.add(w.dex)
      for (const b of a.legendaryBoss ?? []) if (!save.pokedex.includes(b.dex)) set.add(b.dex)
    }
    return set
  }, [save, data])

  if (!save) return null
  const caught = new Set(save.pokedex)
  // The Pokédex is the region's, always — the one being played, with no way to browse another's. Regions are
  // separate runs, and a page you cannot catch anything for is a list of spoilers, not a checklist.
  const region = regionOf(save)
  const regionName = getRegion(data, region)?.name ?? ''
  // It counts only what this region can actually give you — its pools, bosses, fossils and starters.
  const inRegion = regionSpecies(data, region)
  // A regional form sits right after its species (Alolan Rattata after Rattata), under the same number.
  const natOf = (dex: number) => nationalDex(data, dex)
  const pageList = data.speciesList
    .filter((s) => inRegion.has(s.dex))
    .sort((a, b) => natOf(a.dex) - natOf(b.dex) || a.dex - b.dex)
  const total = pageList.length
  const n = pageList.filter((s) => caught.has(s.dex)).length
  const unlock = nextDexUnlock(save, data)
  const needle = searchFold(q.trim())
  const asNumber = /^#?\d+$/.test(needle) ? needle.replace('#', '') : null
  const inFilter = (dex: number) =>
    filter === 'all'
      ? true
      : filter === 'caught'
        ? caught.has(dex)
        : filter === 'missing'
          ? !caught.has(dex)
          : nearby.has(dex)
  const list = pageList
    .filter((s) => inFilter(s.dex))
    // A number finds anything; a name only finds what you've caught (the rest is still ???).
    .filter(
      (s) =>
        !needle ||
        (asNumber != null
          ? String(natOf(s.dex)).startsWith(String(Number(asNumber)))
          : caught.has(s.dex) && searchFold(s.name).includes(needle)),
    )
  const counts: Record<Filter, number> = {
    all: total,
    caught: n,
    missing: total - n,
    nearby: pageList.filter((s) => nearby.has(s.dex)).length,
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <PageHead
        icon="navDex"
        title={regionName ? t('ui.dex.titleRegion', { region: regionName }) : t('ui.dex.title')}
        count={`${n}/${total}`}
      />
      <div className="grid gap-1">
        <span
          className="pixel-corners block h-2 bg-line shadow-ring"
          role="img"
          aria-label={t('ui.dex.caughtOf', { n, total })}
        >
          <i className="block h-full bg-gold" style={{ width: `${(n / Math.max(1, total)) * 100}%` }} />
        </span>
        {unlock && (
          <small className="font-pixel-sm text-[15px] text-muted">
            {t(`ui.dex.moreOpens.${unlock.more === 1 ? 'one' : 'other'}`, {
              n: unlock.more,
              area: unlock.name,
            })}
          </small>
        )}
      </div>

      {n >= total && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="pixel-panel-dark flex flex-col items-center gap-2 p-5 text-center"
        >
          <PixelIcon name="star" size={40} />
          <div className="text-5xl text-gold">{t('ui.dex.complete')}</div>
          <div className="text-2xl">
            {t('ui.dex.completeBody', {
              total,
              where: regionName ? t('ui.dex.completeIn', { region: regionName }) : '',
            })}
          </div>
        </motion.div>
      )}

      <SearchField
        id="dex-search"
        value={q}
        onChange={(v) => {
          setQ(v)
          // A search looks through the whole Pokédex.
          if (v.trim()) setFilter('all')
        }}
        label={t('ui.dex.searchLabel')}
        placeholder={t('ui.dex.searchPlaceholder')}
      />
      <FilterChips
        label={t('ui.dex.show')}
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: t('ui.dex.fAll'), count: counts.all },
          { id: 'caught', label: t('ui.dex.fCaught'), count: counts.caught },
          { id: 'missing', label: t('ui.dex.fMissing'), count: counts.missing },
          { id: 'nearby', label: t('ui.dex.fNearby'), count: counts.nearby },
        ]}
      />

      {list.length === 0 && (
        <p className="copy text-muted">
          {asNumber == null && needle
            ? t('ui.dex.nameNeedsCatch')
            : filter === 'nearby'
              ? t('ui.dex.noneCatchable')
              : t('ui.dex.noMatch')}
        </p>
      )}
      <ul className={TILE_GRID}>
        {list.map((s) => {
          const has = caught.has(s.dex)
          const near = nearby.has(s.dex)
          const isNew = fresh.has(s.dex)
          const no = dexNo(natOf(s.dex))
          return (
            <li key={s.dex}>
              <MonTile
                dex={s.dex}
                number={no}
                name={has ? s.name : t('ui.common.unknown')}
                missing={!has}
                label={[
                  has ? s.name : t('ui.common.unknown'),
                  no,
                  near && t('ui.dex.fNearby'),
                  isNew && t('ui.common.new'),
                ]
                  .filter(Boolean)
                  .join(', ')}
                onClick={() => setView({ kind: 'dex', dex: s.dex })}
                tags={
                  <>
                    {near && <TileTag tone="near">{t('ui.dex.fNearby')}</TileTag>}
                    {isNew && <TileTag tone="new">{t('ui.common.new')}</TileTag>}
                  </>
                }
              />
            </li>
          )
        })}
      </ul>

      <SheetModal view={view} onClose={() => setView(null)} />
    </div>
  )
}
