import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  enabledRegions,
  getRegion,
  progressOf,
  raidBosses,
  regionAreas,
  regionCases,
  regionOf,
  regionSpecies,
  type Area,
  type Region,
} from '@/engine'
import { useT } from '@/i18n/react'
import { Chip } from '@/components/Chip'
import { PixelIcon } from '@/components/icons'
import { PartnerMoment } from '@/components/PartnerMoment'
import { PixelButton } from '@/components/PixelButton'
import { FilterChips, SearchField, Seg, type SegOption } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useGame } from '@/store/game'
import { SCENE_W } from '@/fx/areaArt'
import { regionPicture } from '@/fx/regionArt'
import { availableRegions, regionOnOffer, startRegion, switchRegion } from '@/store/regions'
import { exploreFirstArea } from '@/store/run'
import { cx } from '@/theme/util'
import { levelText, useLevelSpan } from './AreaPlate'
import { DetailsBody, DetailsFoot, DetailsSub, useDetailsClosed } from './AreaDetails'
import {
  areaSearch,
  areaSpecies,
  areaStatus,
  lockReason,
  playable,
  regionAreaList,
  regionSummary,
  type AreaStatus,
} from './areas'
import { AreaStrip } from '@/components/AreaStrip'
import { ShinyParadeChip, useParadeLabel } from '@/screens/events/live'
import { useInWorld } from '@/screens/events/world'
import { worldName } from '@/store/worlds'
import { CARD_STRIP_H } from './Widget'

export type AreasFilter = 'all' | 'catch' | 'secret' | 'cleared'
type Sort = 'route' | 'level' | 'catch'
/** The sheet's views: an area's details (its first), the region's list, the regions. */
export type AreasView = 'details' | 'list' | 'regions'

/** Each state is an outline: orange where you are, green cleared, grey locked, plain otherwise. */
const CARD: Record<AreaStatus, string> = {
  here: 'bg-paper shadow-[inset_0_0_0_3px_#ff8a3d,inset_0_-5px_0_#ffe0c8] dark:shadow-[inset_0_0_0_3px_#ff8a3d,inset_0_-5px_0_#4a2a14]',
  cleared: 'bg-paper shadow-[inset_0_0_0_3px_#34c97a,inset_0_-5px_0_rgb(var(--c-good-pale))]',
  next: 'bg-paper shadow-card',
  new: 'bg-paper shadow-card',
  open: 'bg-paper shadow-card',
  locked: 'bg-well shadow-ring-line text-muted',
}

/**
 * An area in the region's list, on Home's one card (docs/43 §4): its strip, its name, one status line (levels and
 * catches, or why it's locked) and its state as the outline; GO at its right travels there (or plays, where you are).
 * The row opens the area's details. A search by Pokémon lists the matches under it.
 */
function AreaRow({
  area,
  query,
  lead,
  picked,
  onPick,
  onGo,
}: {
  area: Area
  query: string
  /** Its GO is the sheet's one red action: where Home's big button leads (here, or where the story goes on). */
  lead: boolean
  /** Its details are the ones shown beside the list (wide screens). */
  picked: boolean
  onPick: () => void
  onGo: () => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const st = areaStatus(save, data, area)
  const span = useLevelSpan(area)
  const species = areaSpecies(area)
  const left = species.filter((d) => !save.pokedex.includes(d))
  const hits = areaSearch(area, data, query).hits
  const locked = st === 'locked'
  // Nothing left to meet (a league area, every member beaten): no GO that would go nowhere.
  const closed = !locked && st !== 'here' && !playable(save, data, area)
  const why = locked ? lockReason(save, data, area) : ''
  const words: Record<AreaStatus, string> = {
    here: t('ui.home.st.here'),
    cleared: t('ui.home.st.cleared'),
    next: t('ui.home.st.next'),
    new: t('ui.home.st.new'),
    open: t('ui.home.st.open'),
    locked: t('ui.home.st.locked', { why }),
  }
  // An area whose legendary is a progression raid (docs/24) says RAID; one with a boss to fight, LEGEND.
  const raid = raidBosses(area, data).length > 0
  const legend = !raid && (area.legendaryBoss ?? []).length > 0
  // A roadblock (docs/61 §2) gets its own chip: it isn't a legendary.
  const roadblock = legend && (area.legendaryBoss ?? []).every((b) => b.roadblock)
  const parade = useParadeLabel(area)
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onPick}
        aria-haspopup={picked ? undefined : 'true'}
        aria-current={picked ? 'true' : undefined}
        aria-label={
          t('ui.home.cardLabel', { area: area.name, levels: levelText(span), state: words[st] }) + parade
        }
        className={cx(
          'grid min-h-[76px] w-full grid-cols-[minmax(88px,32%)_minmax(0,1fr)] gap-x-3 gap-y-1.5 p-1.5 pr-[78px] text-left',
          CARD[st],
          picked && 'outline outline-[3px] outline-offset-[-1px] outline-gold',
        )}
      >
        <span className="relative row-span-2 block min-h-[60px] overflow-hidden bg-night leading-[0] shadow-ring-thin">
          <AreaStrip
            area={area}
            h={CARD_STRIP_H}
            className={cx(
              'absolute inset-0 h-full w-full object-cover',
              locked && 'brightness-[0.92] grayscale-[0.7]',
            )}
          />
          <span className="absolute left-0.5 top-0.5 flex flex-wrap gap-0.5">
            {st === 'new' && <Chip tone="gold">{t('ui.common.new')}</Chip>}
            {area.gyms.length > 0 && <Chip tone="dark">{t('ui.home.gymTag')}</Chip>}
            {legend && <Chip tone="gold">{t(roadblock ? 'ui.enc.roadblockTag' : 'ui.home.legendTag')}</Chip>}
            {raid && <Chip tone="gold">{t('ui.raid.progress.tag')}</Chip>}
          </span>
        </span>
        <span className="flex min-w-0 flex-col justify-center gap-1 self-center">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[20px] leading-none">{area.name}</span>
            <ShinyParadeChip area={area} />
          </span>
          <span className="flex min-w-0 items-center gap-1 truncate font-pixel-sm text-[16px] leading-tight text-muted">
            {locked ? (
              <>
                <PixelIcon name="lock" size={14} className="shrink-0" />
                <span className="truncate">{why}</span>
              </>
            ) : (
              <>
                <span className="whitespace-nowrap">{levelText(span)}</span>
                {species.length > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <PixelIcon name="ball" size={12} className="shrink-0" />
                    {species.length - left.length}/{species.length}
                    {left.length > 0 && (
                      <b className="truncate font-normal text-danger">
                        · {t('ui.home.toCatch', { n: left.length })}
                      </b>
                    )}
                  </>
                ) : (
                  <span className="truncate">· {t('ui.home.trainersOnly')}</span>
                )}
              </>
            )}
          </span>
        </span>
        {hits.length > 0 && (
          <span className="col-start-2 flex flex-wrap gap-x-2.5 gap-y-1">
            {hits.slice(0, 6).map((d) => {
              const got = save.pokedex.includes(d)
              return (
                <span
                  key={d}
                  className={cx(
                    'inline-flex items-center font-pixel-sm text-[16px]',
                    got ? 'text-ink' : 'text-danger',
                  )}
                >
                  <MiniSprite dex={d} size={28} />
                  {data.species[d]?.name}
                  {!got && ` · ${t('ui.home.newHit')}`}
                </span>
              )
            })}
          </span>
        )}
      </button>
      {locked ? (
        <span
          className="absolute right-2.5 top-[calc(50%-22px)] grid h-11 w-[60px] place-items-center bg-well-deep shadow-ring-line"
          aria-hidden
        >
          <PixelIcon name="lock" size={16} />
        </span>
      ) : closed ? null : (
        <button
          type="button"
          onClick={onGo}
          aria-label={
            st === 'here'
              ? t('ui.home.playHere', { area: area.name })
              : t('ui.home.goTo', { area: area.name })
          }
          className={cx(
            'pixel-btn absolute right-2.5 top-[calc(50%-22px)] h-11 w-[60px] text-[24px] uppercase leading-none tracking-[0.06em]',
            lead ? 'frame-primary' : 'frame-dark',
          )}
        >
          {t('ui.home.go')}
        </button>
      )}
    </li>
  )
}

/**
 * A region the player has reached: its picture, areas, catches and badges, and GO. Tapping it moves there and shows
 * its areas, in the same sheet (the region you're in just goes back to its areas).
 */
function RegionCard({ region, lead, onDone }: { region: Region; lead: boolean; onDone: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const here = regionOf(save) === region.id
  const first = regionAreas(data, region.id)[0]
  const picture = regionPicture(region.id)
  const species = regionSpecies(data, region.id)
  const dex = new Set(here ? save.pokedex : (save.parked?.[region.id]?.pokedex ?? []))
  const caught = [...species].filter((d) => dex.has(d)).length
  const rc = regionCases(save, data).find((r) => r.id === region.id)
  const label = here
    ? t('ui.home.regionHere', { region: region.name })
    : t('ui.home.regionGo', { region: region.name })
  return (
    <button
      type="button"
      onClick={() => (here || switchRegion(region.id)) && onDone()}
      aria-label={label}
      className={cx(
        'grid w-full gap-1.5 bg-paper px-1.5 pb-2.5 pt-1.5 text-left',
        here
          ? 'shadow-[inset_0_0_0_3px_#ff8a3d,inset_0_-5px_0_#ffe0c8] dark:shadow-[inset_0_0_0_3px_#ff8a3d,inset_0_-5px_0_#4a2a14]'
          : 'shadow-card',
      )}
    >
      {picture ? (
        <img
          src={picture.url}
          alt=""
          width={400}
          height={78}
          className="pixelated h-auto w-full object-cover"
          // A banner, cut like the areas' strips (AreaStrip, 288 × 56), on the region's landmark.
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `${SCENE_W} / 56`,
            objectPosition: `50% ${picture.focus}%`,
          }}
        />
      ) : (
        first && <AreaStrip area={first} className="h-auto w-full" />
      )}
      <span className="flex items-center gap-2 px-1">
        <b className="flex-1 text-[24px] font-normal leading-none">{region.name}</b>
        {here && <Chip tone="red">{t('ui.dex.youAreHere')}</Chip>}
        {/* The whole card is the button; GO says so. */}
        <span
          aria-hidden
          className={cx(
            'pixel-btn grid h-11 w-[60px] shrink-0 place-items-center text-[24px] uppercase leading-none tracking-[0.06em]',
            lead ? 'frame-primary' : 'frame-dark',
          )}
        >
          {t('ui.home.go')}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 font-pixel-sm text-[16px] text-muted">
        <span>{t('ui.home.regionAreas', { n: regionAreaList(data, region.id).length })}</span>
        <span className="inline-flex items-center gap-1">
          <PixelIcon name="ball" size={12} />
          {caught}/{species.size}
        </span>
        {rc && (
          <span className="inline-flex items-center gap-1">
            <PixelIcon name="badge" size={12} />
            {rc.earned}/{rc.badges.length}
          </span>
        )}
        {rc?.endgameCleared && <Chip tone="done">{t('ui.home.leagueWon')}</Chip>}
      </span>
    </button>
  )
}

/** The next region, once offered: pick a partner from its three starters and go. */
function OfferCard({ region, onStarted }: { region: Region; onStarted: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const [picking, setPicking] = useState(false)
  const navigate = useNavigate()
  const starters = region.starters.filter((d) => data.species[d])
  const here = getRegion(data, regionOf(save))?.name ?? ''
  return (
    <section
      aria-labelledby="offer-title"
      className="grid gap-2 bg-cream px-3 pb-3.5 pt-3 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_6px_#ffbe2e,inset_0_0_0_8px_rgb(var(--c-edge)),inset_0_-12px_0_rgb(var(--c-gold-light))]"
    >
      <span className="flex flex-wrap items-center gap-2 px-1 pt-1">
        <Chip tone="gold">{t('ui.home.newRegionTag')}</Chip>
        <span className="ml-auto font-pixel-sm text-[16px] text-muted">
          {t('ui.home.regionAreas', { n: regionAreaList(data, region.id).length })} ·{' '}
          {t('ui.home.newPokemon', { n: regionSpecies(data, region.id).size })}
        </span>
      </span>
      <h3 id="offer-title" className="px-1 text-[42px] leading-[0.9]">
        {region.name}
      </h3>
      <p className="m-0 px-1 text-[18px]">{t('ui.home.pickPartner')}</p>
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 px-1" aria-label={t('ui.home.pickPartner')}>
        {starters.map((d) => {
          const s = data.species[d]!
          return (
            <li
              key={d}
              className="grid min-w-0 justify-items-center gap-1 bg-paper px-0.5 pb-2 pt-0.5 shadow-ring-line"
            >
              <MiniSprite dex={d} size={64} />
              <b className="max-w-full truncate text-[18px] font-normal leading-none">{s.name}</b>
              <TypeBadge type={s.type1} size="sm" />
            </li>
          )
        })}
      </ul>
      <p className="m-0 px-1 font-pixel-sm text-[16px] leading-tight text-muted">
        {t('ui.home.offerNote', { region: here })}
      </p>
      {/* The choice itself happens in the professor's lab: the three balls drop onto the table. */}
      <PixelButton
        variant="primary"
        size="lg"
        className="mx-1 w-[calc(100%-8px)]"
        onClick={() => setPicking(true)}
      >
        {t('ui.partner.enter', { region: region.name })}
      </PixelButton>
      {picking && (
        <PartnerMoment
          starters={starters}
          regionId={region.id}
          regionName={region.name}
          level={data.config.starterLevel}
          onLeave={() => setPicking(false)}
          onPick={(dex) => {
            setPicking(false)
            if (!startRegion(region.id, dex)) return
            onStarted()
            // The rework: a region begun opens on its first area, not Home.
            if (exploreFirstArea()) navigate('/area')
          }}
        />
      )}
    </section>
  )
}

/** An area's details as a view of the Areas sheet: its name (the sheet's title is the region's), the line under it, the body. */
function DetailsView({ area }: { area: Area }) {
  return (
    <div className="grid gap-2.5 pt-1">
      <div className="grid gap-1">
        <h3 className="m-0 text-[28px] font-normal leading-none">{area.name}</h3>
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          <DetailsSub area={area} />
        </p>
      </div>
      <DetailsBody key={area.id} area={area} />
    </div>
  )
}

/**
 * The Areas sheet (docs/43 §5.2), opened from Home's area button: the area's details first (where you are, or the one
 * picked), the region's list (every area as a row, searchable by area or by Pokémon, filtered and sorted) and the
 * regions reached with the one on offer, as tabs. From 1024 px the list and the details stand side by side in one
 * wide sheet, the details of the row picked beside it. One red GO (docs/15 §6): the `lead` area's, where Home's big
 * button leads; the others are navy.
 */
export function AreasSheet({
  open,
  onClose,
  view: initialView,
  filter: initialFilter,
  area: initialArea,
  lead,
  onPlay,
  onTravel,
}: {
  open: boolean
  onClose: () => void
  view: AreasView
  filter: AreasFilter
  /** The area whose details show first: where the player is. */
  area: string
  /** The area whose GO is red: the one being played, or, behind in the region, the one the story goes on in. */
  lead: string
  onPlay: () => void
  onTravel: (area: Area) => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const split = useMediaQuery('(min-width: 1024px)')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<AreasFilter>(initialFilter)
  const [sort, setSort] = useState<Sort>('route')
  const [view, setView] = useState<AreasView>(initialView)
  const [pickedId, setPicked] = useState(initialArea)
  const tabsRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const region = regionOf(save)
  // Inside a small world the sheet is the world's alone: its name, no Regions view, nothing on offer (docs/21).
  const { inside, world } = useInWorld()
  const regionName = inside ? worldName(world, data) : (getRegion(data, region)?.name ?? '')
  const offer = inside ? null : regionOnOffer()
  const picked =
    data.areas.find((a) => a.id === pickedId) ?? data.areas.find((a) => a.id === save.currentAreaId) ?? null
  const closed = useDetailsClosed(picked)
  const foot =
    picked && !closed ? <DetailsFoot area={picked} onPlay={onPlay} onTravel={onTravel} quiet={split} /> : null
  // On a wide sheet the details are always beside the list: its tabs are the list's and the regions'.
  const shown: AreasView = split && view === 'details' ? 'list' : view

  const all = useMemo(
    () => regionAreaList(data, region).map((a) => ({ a, st: areaStatus(save, data, a) })),
    [data, region, save],
  )
  const toCatch = (a: Area) => areaSpecies(a).filter((d) => !save.pokedex.includes(d)).length
  const counts: Record<AreasFilter, number> = {
    all: all.length,
    catch: all.filter((x) => x.st !== 'locked' && toCatch(x.a) > 0).length,
    secret: all.filter((x) => x.a.hidden).length,
    cleared: all.filter((x) => progressOf(save, x.a.id).cleared).length,
  }
  let list = all
  if (filter === 'catch') list = list.filter((x) => x.st !== 'locked' && toCatch(x.a) > 0)
  if (filter === 'secret') list = list.filter((x) => x.a.hidden)
  if (filter === 'cleared') list = list.filter((x) => progressOf(save, x.a.id).cleared)
  if (q.trim())
    list = list.filter((x) => {
      const s = areaSearch(x.a, data, q)
      return s.name || s.hits.length > 0
    })
  const order = (a: Area) => all.findIndex((x) => x.a.id === a.id)
  list = [...list].sort((x, y) =>
    sort === 'level'
      ? x.a.minLevel - y.a.minLevel || order(x.a) - order(y.a)
      : sort === 'catch'
        ? toCatch(y.a) - toCatch(x.a) || order(x.a) - order(y.a)
        : order(x.a) - order(y.a),
  )
  const sum = regionSummary(save, data)
  const regions = availableRegions()
  const more = enabledRegions(data).length > regions.length

  const filters: SegOption<AreasFilter>[] = [
    { id: 'all', label: t('ui.home.fAll'), count: counts.all },
    { id: 'catch', label: t('ui.home.fCatch'), count: counts.catch },
    { id: 'secret', label: t('ui.home.fSecret'), count: counts.secret },
    { id: 'cleared', label: t('ui.home.fCleared'), count: counts.cleared },
  ]
  const sorts: SegOption<Sort>[] = [
    { id: 'route', label: t('ui.home.sRoute') },
    { id: 'level', label: t('ui.home.sLevel') },
    { id: 'catch', label: t('ui.home.sCatch') },
  ]
  const tabs: SegOption<AreasView>[] = [
    ...(split ? [] : [{ id: 'details' as const, label: t('ui.home.tabDetails') }]),
    { id: 'list', label: t('ui.home.tabAreas'), count: all.length },
    ...(inside
      ? []
      : [
          {
            id: 'regions' as const,
            label: (
              <>
                {t('ui.home.regions')}
                {offer && view !== 'regions' && <Chip tone="gold">{t('ui.common.new')}</Chip>}
              </>
            ),
          },
        ]),
  ]

  const toTop = () => {
    bodyRef.current?.closest('[role="region"]')?.scrollTo({ top: 0 })
    bodyRef.current?.querySelectorAll('[data-pane]').forEach((el) => el.scrollTo({ top: 0 }))
  }
  // A row opens its details: in place on a phone (from the top), beside the list on a wide sheet.
  const pick = (id: string) => {
    setPicked(id)
    if (!split) {
      setView('details')
      toTop()
    }
  }
  // A region card lands on that region's areas from the top, a stale search cleared, its current area's details
  // picked, and the focus stays in the sheet (on the list's tab) rather than falling to the page.
  const showAreas = () => {
    toTop()
    setQ('')
    setPicked(useGame.getState().save?.currentAreaId ?? pickedId)
    setView('list')
    tabsRef.current?.querySelector<HTMLButtonElement>('[data-id="list"]')?.focus()
  }

  const listHead = (
    <>
      <SearchField id="areas-q" label={t('ui.home.searchAreas')} value={q} onChange={setQ} />
      <FilterChips label={t('ui.home.show')} value={filter} onChange={setFilter} options={filters} />
      <div className="flex items-center gap-1.5 pb-1 shadow-[0_2px_0_rgb(var(--c-lip))]">
        <span className="font-pixel-sm text-[16px] text-muted" aria-hidden>
          {t('ui.home.sort')}
        </span>
        <FilterChips label={t('ui.home.sort')} value={sort} onChange={setSort} options={sorts} />
      </div>
    </>
  )
  const listEl = list.length ? (
    <ul className="flex flex-col gap-2 pt-1">
      {list.map(({ a }) => (
        <AreaRow
          key={a.id}
          area={a}
          query={q}
          lead={a.id === lead}
          picked={split && a.id === picked?.id}
          onPick={() => pick(a.id)}
          onGo={() => (a.id === save.currentAreaId ? onPlay() : onTravel(a))}
        />
      ))}
    </ul>
  ) : (
    <p className="py-4 text-[18px] text-muted">{t('ui.home.noMatch', { q })}</p>
  )
  const regionsEl = (
    <div className="flex flex-col gap-3 pt-1">
      {regions.map((r) => (
        // The new region's own button is the red one while one is on offer; else the region being played's GO.
        <RegionCard key={r.id} region={r} lead={!offer && r.id === region} onDone={showAreas} />
      ))}
      {offer ? (
        <OfferCard region={offer} onStarted={onClose} />
      ) : (
        more && (
          <div className="grid grid-cols-[60px_minmax(0,1fr)] items-center gap-3 bg-well p-3 shadow-ring-line">
            <span
              className="grid h-[60px] w-[60px] place-items-center bg-faint text-[46px] leading-none text-white shadow-[inset_0_0_0_3px_rgb(var(--c-muted))]"
              aria-hidden
            >
              ?
            </span>
            <span className="grid min-w-0 gap-1">
              <b className="text-[22px] font-normal leading-none">{t('ui.home.regionTeaser')}</b>
              <small className="font-pixel-sm text-[16px] leading-tight text-muted">
                {t('ui.home.regionTeaserBody')}
              </small>
            </span>
          </div>
        )
      )}
      <p className="px-3 text-center font-pixel-sm text-[16px] text-muted">{t('ui.home.regionsFoot')}</p>
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={shown === 'regions' ? t('ui.home.regions') : regionName}
      // The wide sheet is as tall as it may be, so its two panes scroll each on their own.
      className={split ? 'h-[85vh] !max-w-[1080px]' : undefined}
      sub={
        shown === 'regions'
          ? offer
            ? t('ui.home.regionsSubOffer', { n: regions.length, region: offer.name })
            : t('ui.home.regionsSub', { n: regions.length })
          : t('ui.home.sheetSub', {
              cleared: sum.cleared,
              found: sum.secretsFound,
              secrets: sum.secrets,
              caught: sum.caught,
              species: sum.species,
            })
      }
      head={
        <>
          {tabs.length > 1 && (
            <div ref={tabsRef} className={cx(split && 'w-[calc(48.5%-8px)]')}>
              <Seg tabs label={t('ui.home.areasViews')} value={shown} onChange={setView} options={tabs} />
            </div>
          )}
          {!split && shown === 'list' && listHead}
        </>
      }
      footer={!split && shown === 'details' ? foot : undefined}
    >
      <div
        ref={bodyRef}
        className={cx(split && '-mb-4 grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4')}
      >
        {split ? (
          <>
            <div data-pane className="pixel-scroll min-h-0 overflow-y-auto pb-4 pr-1">
              {shown === 'list' ? (
                <>
                  <div className="sticky top-0 z-[1] flex flex-col gap-2 bg-panel pb-2">{listHead}</div>
                  {listEl}
                </>
              ) : (
                regionsEl
              )}
            </div>
            <section
              aria-label={picked?.name}
              className="mb-4 flex min-h-0 flex-col bg-paper shadow-[inset_0_0_0_2px_rgb(var(--c-line))]"
            >
              <div data-pane className="pixel-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
                {picked && <DetailsView area={picked} />}
              </div>
              {foot && <div className="shrink-0 px-3 py-2.5 shadow-[0_-2px_0_rgb(var(--c-lip))]">{foot}</div>}
            </section>
          </>
        ) : shown === 'details' ? (
          picked && <DetailsView area={picked} />
        ) : shown === 'list' ? (
          listEl
        ) : (
          regionsEl
        )}
      </div>
    </Sheet>
  )
}
