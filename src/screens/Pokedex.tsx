import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  conditionStatus,
  getRegion,
  isAreaUnlocked,
  nationalDex,
  regionOf,
  regionOfArea,
  regionSpecies,
  shinyDexOf,
  shinyDexOpen,
  type GameData,
  type SaveData,
  areaKeepsTime,
  UNOWN_DEX,
  UNOWN_LETTERS,
  unownArea,
  unownDexOf,
  unownDexOpen,
  unownDexPaid,
  unownReward,
  wildPoolAt,
} from '@/engine'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { PixelIcon } from '@/components/icons'
import { MonTile, TILE_GRID, TileTag } from '@/components/MonTile'
import { PageHead } from '@/components/PageHead'
import { InfoButton } from '@/components/RulesModal'
import { FilterChips, SearchField } from '@/components/Segmented'
import { DexViewSwitch, ShinyDexRulesModal, type DexView } from '@/components/ShinyDexRules'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { UnownDexGrid, UnownDexRulesModal } from '@/components/UnownDex'
import { markDexSeen, useDexNew } from '@/lib/dexSeen'
import { dexNo, money } from '@/lib/format'
import { markShinyDexSeen, markUnownDexSeen } from '@/store/actions'
import { useDayTime } from '@/store/dayTime'
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

/**
 * The Unown's page (docs/41): the letters found as the Pokédex's gauge, where they live (and the prize) or the complete
 * card, then the 28 tiles. The Pokédex itself keeps one Unown.
 */
function UnownDexPage({ save, data, onOpen }: { save: SaveData; data: GameData; onOpen: () => void }) {
  const { t } = useT()
  const found = unownDexOf(save)
  const total = UNOWN_LETTERS.length
  const n = found.length
  const reward = unownReward(data)
  const area = unownArea(save, data)
  return (
    <>
      <div className="grid gap-1">
        <span
          className="pixel-corners block h-2 bg-line shadow-ring"
          role="img"
          aria-label={t('ui.unown.count', { n, total })}
        >
          <i className="block h-full bg-gold" style={{ width: `${(n / total) * 100}%` }} />
        </span>
        {n < total && area && (
          <small className="font-pixel-sm text-[15px] text-muted">
            {reward > 0
              ? t('ui.unown.wherePrize', { area: area.name, amount: money(reward) })
              : t('ui.unown.where', { area: area.name })}
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
          <div className="text-[40px] leading-none text-gold">{t('ui.unown.complete')}</div>
          <div className="text-2xl">
            {unownDexPaid(save) && reward > 0
              ? t('ui.unown.completePaid', { total, amount: money(reward) })
              : t('ui.unown.completeBody', { total })}
          </div>
        </motion.div>
      )}
      <UnownDexGrid found={found} onOpen={onOpen} />
    </>
  )
}

export function PokedexScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [view, setView] = useState<SheetView | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [info, setInfo] = useState(false)
  // The shiny page (docs/39): there once the region's league is beaten. `?view=shiny` opens on it (its pop-up's GO).
  const shinyOpen = useGame((s) => !!s.save && shinyDexOpen(s.save, s.data))
  // The Unown's letters (docs/41): there once an area where Unown live is opened. `?view=unown` opens on it.
  const unownOpen = useGame((s) => !!s.save && unownDexOpen(s.save, s.data))
  const views = [...(shinyOpen ? (['shiny'] as const) : []), ...(unownOpen ? (['unown'] as const) : [])]
  const [params, setParams] = useSearchParams()
  const asked = params.get('view')
  const dexView: DexView =
    asked === 'shiny' && shinyOpen ? 'shiny' : asked === 'unown' && unownOpen ? 'unown' : 'all'
  const setDexView = (v: DexView) => setParams(v === 'all' ? {} : { view: v }, { replace: true })
  // Seeing the page is reading what it is: its pop-up won't open later.
  useEffect(() => {
    if (dexView === 'shiny') markShinyDexSeen()
    if (dexView === 'unown') markUnownDexSeen()
  }, [dexView])
  const [unownInfo, setUnownInfo] = useState(false)
  // What was new on arrival keeps its NEW tag while the screen is open; looking clears the tab bar's dot.
  const newCount = useDexNew()
  const [fresh] = useState(() => new Set(newCount > 0 ? (save?.pokedex.slice(-newCount) ?? []) : []))
  const count = save?.pokedex.length ?? 0
  useEffect(() => markDexSeen(), [count])

  // In Johto with day and night on (docs/32): the half of the day it is, so "right now" leaves out the other half's.
  const now = useDayTime()
  // Species you can meet right now: in a wild pool (or as a legendary) of an area you've opened.
  const meetable = useMemo(() => {
    const set = new Set<number>()
    if (!save) return set
    for (const a of data.areas) {
      // "Nearby" means without leaving: an unlocked area of the region you are standing in.
      if (regionOfArea(a) !== regionOf(save) || !isAreaUnlocked(save, a.id, data)) continue
      for (const w of wildPoolAt(a, areaKeepsTime(data, a) ? now : null)) if (w.weight > 0) set.add(w.dex)
      for (const b of a.legendaryBoss ?? []) set.add(b.dex)
    }
    return set
  }, [save, data, now])

  if (!save) return null
  if (dexView === 'unown')
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <PageHead
          icon="navDex"
          title={t('ui.unown.title')}
          count={`${unownDexOf(save).length}/${UNOWN_LETTERS.length}`}
        />
        <DexViewSwitch value={dexView} onChange={setDexView} views={views} />
        <UnownDexPage save={save} data={data} onOpen={() => setView({ kind: 'dex', dex: UNOWN_DEX })} />
        <InfoButton name={t('ui.unown.title')} onClick={() => setUnownInfo(true)} />
        <UnownDexRulesModal open={unownInfo} onClose={() => setUnownInfo(false)} />
        <SheetModal view={view} onClose={() => setView(null)} />
      </div>
    )
  const shiny = dexView === 'shiny'
  // Known by name: caught at all. Owned: on this page (caught, or owned shiny on the shiny page).
  const caught = new Set(save.pokedex)
  const owned = shiny ? new Set(shinyDexOf(save)) : caught
  // The missing ones you can meet right now.
  const nearby = new Set([...meetable].filter((d) => !owned.has(d)))
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
  const n = pageList.filter((s) => owned.has(s.dex)).length
  const unlock = shiny ? null : nextDexUnlock(save, data)
  const needle = searchFold(q.trim())
  const asNumber = /^#?\d+$/.test(needle) ? needle.replace('#', '') : null
  const inFilter = (dex: number) =>
    filter === 'all'
      ? true
      : filter === 'caught'
        ? owned.has(dex)
        : filter === 'missing'
          ? !owned.has(dex)
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
      {views.length > 0 && <DexViewSwitch value={dexView} onChange={setDexView} views={views} />}
      <div className="grid gap-1">
        <span
          className="pixel-corners block h-2 bg-line shadow-ring"
          role="img"
          aria-label={t(shiny ? 'ui.dex.shinyOf' : 'ui.dex.caughtOf', { n, total })}
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
          <div className="text-[40px] leading-none text-gold">
            {t(shiny ? 'ui.dex.shinyComplete' : 'ui.dex.complete')}
          </div>
          <div className="text-2xl">
            {t(shiny ? 'ui.dex.shinyCompleteBody' : 'ui.dex.completeBody', {
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
          { id: 'caught', label: t(shiny ? 'ui.dex.viewShiny' : 'ui.dex.fCaught'), count: counts.caught },
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
          // The shiny page: owned shiny gets the Box's star, the rest stays a silhouette (named once caught).
          const star = shiny && owned.has(s.dex)
          const near = nearby.has(s.dex)
          const isNew = !shiny && fresh.has(s.dex)
          const no = dexNo(natOf(s.dex))
          return (
            <li key={s.dex}>
              <MonTile
                dex={s.dex}
                number={no}
                name={has ? s.name : t('ui.common.unknown')}
                missing={!owned.has(s.dex)}
                label={[
                  has ? s.name : t('ui.common.unknown'),
                  no,
                  star && t('ui.mon.shiny'),
                  near && t('ui.dex.fNearby'),
                  isNew && t('ui.common.new'),
                ]
                  .filter(Boolean)
                  .join(', ')}
                onClick={() => setView({ kind: 'dex', dex: s.dex, ...(star && { shiny: true }) })}
                tags={
                  <>
                    {star && <PixelIcon name="star" size={12} className="absolute left-[5px] top-[5px]" />}
                    {near && <TileTag tone="near">{t('ui.dex.fNearby')}</TileTag>}
                    {isNew && <TileTag tone="new">{t('ui.common.new')}</TileTag>}
                  </>
                }
              />
            </li>
          )
        })}
      </ul>

      {shinyOpen && <InfoButton name={t('ui.dex.shinyTitle')} onClick={() => setInfo(true)} />}
      <ShinyDexRulesModal open={info} onClose={() => setInfo(false)} />
      <SheetModal view={view} onClose={() => setView(null)} />
    </div>
  )
}
