import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  conditionStatus,
  getRegion,
  isAreaUnlocked,
  letterText,
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
  type UnownLetter,
} from '@/engine'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { DexCompleteCard, DexGauge, DexGridList, DexTile } from '@/components/DexGrid'
import { DexSheet } from '@/components/DexEntry'
import { PageHead } from '@/components/PageHead'
import { InfoButton } from '@/components/RulesModal'
import { SearchField } from '@/components/Segmented'
import { RulesCard } from '@/components/RulesCard'
import { DexViewSwitch, ShinyDexRulesModal, useShinyDexRules, type DexView } from '@/components/ShinyDexRules'
import { SplitView } from '@/components/SplitView'
import { SortSelect } from '@/components/TypeSelect'
import { UnownDexRulesModal, UnownSprite, useUnownDexRules } from '@/components/UnownDex'
import { markDexSeen, useDexNew } from '@/lib/dexSeen'
import { dexNo, money } from '@/lib/format'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { markShinyDexSeen, markUnownDexSeen } from '@/store/actions'
import { useDayTime } from '@/store/dayTime'
import { useGame } from '@/store/game'

type Filter = 'all' | 'caught' | 'missing' | 'nearby'

/** The entry open on each page, kept while the game runs: back on the Pokédex, a PC finds the one it left open. */
const lastViewed: Partial<Record<DexView, { dex: number; shiny?: boolean; tile: string }>> = {}

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

/** One tile as the screen sees it: what it shows, and the entry it opens. */
interface TileModel {
  /** Unique on the page (a species' number, or an Unown letter). */
  key: string
  dex: number
  icon?: ReactNode
  name: string | null
  missing: boolean
  near?: boolean
  isNew?: boolean
  star?: boolean
  label: string
  shiny?: boolean
}

/**
 * The Pokédex (docs/43 §5.6): the region's grid, its Shiny view and its Unown view, all one screen laid out the same.
 * Its head carries the progress once, as a gauge; the search and the filter share one row; the grid is dense (a
 * silhouette alone until caught). A tile opens its entry: a bottom sheet on a phone, docked at the grid's right on a PC
 * (`SplitView`), where the first caught (or the last one looked at) stands open and the arrow keys walk the grid.
 */
export function PokedexScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const wide = useMediaQuery('(min-width: 1024px)')
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [info, setInfo] = useState<'shiny' | 'unown' | null>(null)
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
  // Their rules where they apply (docs/43 §7): a card at the top of the view until GOT IT, then INFO at its foot. The
  // rows are the INFO pop-up's own, one source each.
  const shinySeen = useGame((s) => !!s.save?.shinyDexSeen)
  const unownSeen = useGame((s) => !!s.save?.unownDexSeen)
  const shinyRules = useShinyDexRules()
  const unownRules = useUnownDexRules()
  // What was new on arrival keeps its NEW tag while the screen is open; looking clears the tab bar's dot.
  const newCount = useDexNew()
  const [fresh] = useState(() => new Set(newCount > 0 ? (save?.pokedex.slice(-newCount) ?? []) : []))
  const count = save?.pokedex.length ?? 0
  useEffect(() => markDexSeen(), [count])

  // The entry picked: on a phone the sheet (with the entries opened from it to go back through), on a PC the pane.
  const [picked, setPicked] = useState<{ dex: number; shiny?: boolean; tile: string } | null>(null)
  const [stack, setStack] = useState<number[]>([])
  // The tile the grid's Tab stop sits on (roving focus).
  const [focusKey, setFocusKey] = useState<string | null>(null)
  // The sheet keeps its last entry while it slides away.
  const lastPicked = useRef(picked)
  if (picked) lastPicked.current = picked
  useEffect(() => {
    setPicked(null)
    setStack([])
  }, [dexView])

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
  const region = regionOf(save)
  const regionName = getRegion(data, region)?.name ?? ''
  const unown = dexView === 'unown'
  const shiny = dexView === 'shiny'
  // Known by name: caught at all. Owned: on this page (caught, or owned shiny on the shiny page).
  const caught = new Set(save.pokedex)
  const owned = shiny ? new Set(shinyDexOf(save)) : caught
  // The missing ones you can meet right now.
  const nearby = new Set([...meetable].filter((d) => !owned.has(d)))
  // A regional form sits right after its species (Alolan Rattata after Rattata), under the same number.
  const natOf = (dex: number) => nationalDex(data, dex)

  let tiles: TileModel[]
  let n: number
  let total: number
  let gaugeLabel: string
  let under: ReactNode = null
  let complete: ReactNode = null
  let empty: string | null = null
  let counts: Record<Filter, number> | null = null

  if (unown) {
    // The Unown's page (docs/41): 28 letters in the games' order, each opening the one Unown entry.
    const found = new Set<UnownLetter>(unownDexOf(save))
    total = UNOWN_LETTERS.length
    n = found.size
    gaugeLabel = t('ui.unown.count', { n, total })
    const reward = unownReward(data)
    const area = unownArea(save, data)
    if (n < total && area)
      under =
        reward > 0
          ? t('ui.unown.wherePrize', { area: area.name, amount: money(reward) })
          : t('ui.unown.where', { area: area.name })
    if (n >= total)
      complete = (
        <DexCompleteCard
          title={t('ui.unown.complete')}
          body={
            unownDexPaid(save) && reward > 0
              ? t('ui.unown.completePaid', { total, amount: money(reward) })
              : t('ui.unown.completeBody', { total })
          }
        />
      )
    tiles = UNOWN_LETTERS.map((l) => {
      const got = found.has(l)
      return {
        key: `u-${l}`,
        dex: UNOWN_DEX,
        icon: <UnownSprite letter={l} size={48} silhouette={!got} />,
        name: letterText(l),
        missing: !got,
        label: `${t('ui.unown.name', { letter: letterText(l) })}, ${t(got ? 'ui.unown.found' : 'ui.unown.missing')}`,
      }
    })
  } else {
    // The Pokédex is the region's, always — the one being played, with no way to browse another's. Regions are
    // separate runs, and a page you cannot catch anything for is a list of spoilers, not a checklist. It counts only
    // what this region can actually give you — its pools, bosses, fossils and starters.
    const inRegion = regionSpecies(data, region)
    const pageList = data.speciesList
      .filter((s) => inRegion.has(s.dex))
      .sort((a, b) => natOf(a.dex) - natOf(b.dex) || a.dex - b.dex)
    total = pageList.length
    n = pageList.filter((s) => owned.has(s.dex)).length
    gaugeLabel = t(shiny ? 'ui.dex.shinyOf' : 'ui.dex.caughtOf', { n, total })
    const unlock = shiny ? null : nextDexUnlock(save, data)
    if (unlock)
      under = t(`ui.dex.moreOpens.${unlock.more === 1 ? 'one' : 'other'}`, {
        n: unlock.more,
        area: unlock.name,
      })
    if (n >= total)
      complete = (
        <DexCompleteCard
          title={t(shiny ? 'ui.dex.shinyComplete' : 'ui.dex.complete')}
          body={t(shiny ? 'ui.dex.shinyCompleteBody' : 'ui.dex.completeBody', {
            total,
            where: regionName ? t('ui.dex.completeIn', { region: regionName }) : '',
          })}
        />
      )
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
    counts = {
      all: total,
      caught: n,
      missing: total - n,
      nearby: pageList.filter((s) => nearby.has(s.dex)).length,
    }
    tiles = pageList
      .filter((s) => inFilter(s.dex))
      // A number finds anything; a name only finds what you've caught (the rest has no name yet).
      .filter(
        (s) =>
          !needle ||
          (asNumber != null
            ? String(natOf(s.dex)).startsWith(String(Number(asNumber)))
            : caught.has(s.dex) && searchFold(s.name).includes(needle)),
      )
      .map((s) => {
        const has = caught.has(s.dex)
        // The shiny page: owned shiny gets the Box's star, the rest stays a silhouette (named once caught).
        const star = shiny && owned.has(s.dex)
        const near = nearby.has(s.dex)
        const isNew = !shiny && fresh.has(s.dex)
        const no = dexNo(natOf(s.dex))
        return {
          key: String(s.dex),
          dex: s.dex,
          name: has ? s.name : null,
          missing: !owned.has(s.dex),
          near,
          isNew,
          star,
          shiny: star || undefined,
          label: [
            ...(has ? [s.name, no] : [no, t('ui.sheet.notCaughtYet')]),
            star && t('ui.mon.shiny'),
            near && t('ui.dex.fNearby'),
            isNew && t('ui.common.new'),
          ]
            .filter(Boolean)
            .join(', '),
        }
      })
    if (tiles.length === 0)
      empty =
        asNumber == null && needle
          ? t('ui.dex.nameNeedsCatch')
          : filter === 'nearby'
            ? t('ui.dex.noneCatchable')
            : t('ui.dex.noMatch')
  }

  // On a PC an entry always stands open: the one picked, else the last looked at here, else the first caught.
  const fallback = (() => {
    const last = lastViewed[dexView]
    if (last) return last
    const first = tiles.find((x) => !x.missing) ?? tiles[0]
    return first ? { dex: first.dex, shiny: first.shiny, tile: first.key } : null
  })()
  const current = picked ?? (wide ? fallback : null)
  const tabKey =
    focusKey && tiles.some((x) => x.key === focusKey) ? focusKey : (current?.tile ?? tiles[0]?.key)

  const pick = (x: TileModel) => {
    const p = { dex: x.dex, shiny: x.shiny, tile: x.key }
    lastViewed[dexView] = p
    setPicked(p)
    setStack([])
  }
  // An evolution's card inside an entry: on a PC the grid moves to it; on a phone it opens over, with Back.
  const openDex = (dex: number) => {
    if (wide) {
      const p = { dex, tile: String(dex) }
      lastViewed[dexView] = p
      setPicked(p)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-tile="${dex}"]`)?.scrollIntoView({ block: 'nearest' }),
      )
      return
    }
    if (picked) setStack((s) => [...s, picked.dex])
    setPicked({ dex, tile: String(dex) })
  }
  const back = () => {
    const prev = stack[stack.length - 1]
    if (prev == null) return
    setStack((s) => s.slice(0, -1))
    setPicked({ dex: prev, tile: String(prev) })
  }
  const shown = current ?? (wide ? null : lastPicked.current)

  const title = regionName ? t('ui.dex.titleRegion', { region: regionName }) : t('ui.dex.title')
  const main = (
    <>
      <div className="flex flex-col gap-2">
        {/* The gauge stands beside the title where there's room, and takes the whole row under it on a phone. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <PageHead icon="navDex" title={title} />
          <DexGauge
            n={n}
            total={total}
            label={gaugeLabel}
            className="min-w-[160px] flex-1 lg:max-w-[340px]"
          />
        </div>
        {views.length > 0 && <DexViewSwitch value={dexView} onChange={setDexView} views={views} />}
        {under && <p className="font-pixel-sm text-[18px] leading-tight text-muted">{under}</p>}
      </div>
      {shiny && !shinySeen && (
        <RulesCard
          title={t('ui.dex.shinyTitle')}
          icon="sparkle"
          rules={shinyRules}
          onDone={markShinyDexSeen}
        />
      )}
      {unown && !unownSeen && (
        <RulesCard title={t('ui.unown.title')} icon="navDex" rules={unownRules} onDone={markUnownDexSeen} />
      )}
      {counts && (
        <div className="flex items-center gap-2">
          <SearchField
            id="dex-search"
            className="min-w-0 flex-1"
            value={q}
            onChange={(v) => {
              setQ(v)
              // A search looks through the whole Pokédex.
              if (v.trim()) setFilter('all')
            }}
            label={t('ui.dex.searchLabel')}
            placeholder={t('ui.dex.searchPlaceholder')}
          />
          <SortSelect<Filter>
            label={t('ui.dex.show')}
            value={filter}
            onChange={setFilter}
            className="w-[42%] max-w-[220px] shrink-0"
            options={[
              { id: 'all', label: `${t('ui.dex.fAll')} (${counts.all})` },
              {
                id: 'caught',
                label: `${t(shiny ? 'ui.dex.viewShiny' : 'ui.dex.fCaught')} (${counts.caught})`,
              },
              { id: 'missing', label: `${t('ui.dex.fMissing')} (${counts.missing})` },
              { id: 'nearby', label: `${t('ui.dex.fNearby')} (${counts.nearby})` },
            ]}
          />
        </div>
      )}
      {complete}
      {empty && <p className="copy text-muted">{empty}</p>}
      <DexGridList label={title}>
        {tiles.map((x) => (
          <li key={x.key}>
            <DexTile
              dex={x.dex}
              icon={x.icon}
              iconSize={wide ? 40 : 32}
              name={x.name}
              missing={x.missing}
              near={x.near}
              isNew={x.isNew}
              star={x.star}
              label={x.label}
              nearLabel={t('ui.dex.fNearby')}
              newLabel={t('ui.common.new')}
              selected={wide && current?.tile === x.key}
              tabIndex={x.key === tabKey ? 0 : -1}
              onFocus={() => {
                setFocusKey(x.key)
                // A PC's pane follows the keyboard through the grid.
                if (wide && current?.tile !== x.key) pick(x)
              }}
              onClick={(keyboard) => {
                pick(x)
                // Enter on a PC moves into the entry beside the grid; a phone's sheet takes the focus itself.
                if (wide && keyboard)
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLElement>('[data-dex-entry]')?.focus(),
                  )
              }}
            />
          </li>
        ))}
      </DexGridList>
      {/* The shiny page's INFO sits under the Pokédex and its Shiny view while that page is open (docs/15 §35). */}
      {shinyOpen && !unown && <InfoButton name={t('ui.dex.shinyTitle')} onClick={() => setInfo('shiny')} />}
      {unown && <InfoButton name={t('ui.unown.title')} onClick={() => setInfo('unown')} />}
    </>
  )

  return (
    <div className="mx-auto w-full">
      <SplitView
        main={main}
        detail={
          shown && (
            <DexSheet
              dex={shown.dex}
              shiny={shown.shiny}
              open={wide || !!picked}
              onClose={() => {
                setPicked(null)
                setStack([])
              }}
              onOpenDex={openDex}
              onBack={!wide && stack.length ? back : undefined}
            />
          )
        }
        empty={<p className="copy p-4 text-muted">{t('ui.dex.pickOne')}</p>}
      />
      <ShinyDexRulesModal open={info === 'shiny'} onClose={() => setInfo(null)} />
      <UnownDexRulesModal open={info === 'unown'} onClose={() => setInfo(null)} />
    </div>
  )
}
