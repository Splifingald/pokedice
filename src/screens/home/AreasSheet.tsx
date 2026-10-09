import { useMemo, useState } from 'react'
import {
  enabledRegions,
  getRegion,
  progressOf,
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
import { PixelButton } from '@/components/PixelButton'
import { FilterChips, SearchField, type SegOption } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { MiniSprite } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { useGame } from '@/store/game'
import { availableRegions, regionOnOffer, startRegion, switchRegion } from '@/store/regions'
import { cx } from '@/theme/util'
import { levelText, useLevelSpan } from './AreaPlate'
import {
  areaSearch,
  areaSpecies,
  areaStatus,
  lockReason,
  regionAreaList,
  regionSummary,
  type AreaStatus,
} from './areas'
import { stripOf } from './scene'

export type AreasFilter = 'all' | 'catch' | 'secret' | 'cleared'
type Sort = 'route' | 'level' | 'catch'

/** Each state is an outline: orange where you are, green cleared, grey locked, plain otherwise. */
const CARD: Record<AreaStatus, string> = {
  here: 'bg-paper shadow-[inset_0_0_0_3px_#ff8a3d,inset_0_-5px_0_#ffe0c8]',
  cleared: 'bg-paper shadow-[inset_0_0_0_3px_#34c97a,inset_0_-5px_0_#d2f3e0]',
  next: 'bg-paper shadow-card',
  new: 'bg-paper shadow-card',
  open: 'bg-paper shadow-card',
  locked: 'bg-[#f1f4f9] shadow-ring-line text-muted',
}

function AreaCard({
  area,
  query,
  onDetails,
  onGo,
}: {
  area: Area
  query: string
  onDetails: () => void
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
  const why = locked ? lockReason(save, data, area) : ''
  const words: Record<AreaStatus, string> = {
    here: t('ui.home.st.here'),
    cleared: t('ui.home.st.cleared'),
    next: t('ui.home.st.next'),
    new: t('ui.home.st.new'),
    open: t('ui.home.st.open'),
    locked: t('ui.home.st.locked', { why }),
  }
  const legend = (area.legendaryBoss ?? []).length > 0
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onDetails}
        aria-label={t('ui.home.cardLabel', { area: area.name, levels: levelText(span), state: words[st] })}
        className={cx('grid w-full gap-[5px] px-1.5 pb-2 pt-1.5 text-left', CARD[st])}
      >
        <span className="relative block leading-[0]">
          <img
            src={stripOf(area.bannerUrl)}
            alt=""
            className={cx('pixelated h-auto w-full', locked && 'brightness-[0.92] grayscale-[0.7]')}
          />
          <span className="absolute left-1 top-1 flex gap-1">
            {st === 'new' && <Chip tone="gold">{t('ui.common.new')}</Chip>}
            {area.gyms.length > 0 && <Chip tone="dark">{t('ui.home.gymTag')}</Chip>}
            {legend && <Chip tone="gold">{t('ui.home.legendTag')}</Chip>}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2 px-1 pr-[70px]">
          <span className="min-w-0 flex-1 text-[21px] leading-none">{area.name}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1 pr-[70px]">
          <span className="whitespace-nowrap font-pixel-sm text-[16px] leading-none text-muted">
            {levelText(span)}
          </span>
          {locked ? (
            <span className="inline-flex min-w-0 items-center gap-1 font-pixel-sm text-[15px] leading-tight text-muted">
              <PixelIcon name="lock" size={14} />
              {why}
            </span>
          ) : species.length ? (
            <span className="inline-flex items-center gap-1 font-pixel-sm text-[15px] leading-none text-muted">
              <PixelIcon name="ball" size={12} />
              {species.length - left.length}/{species.length} ·{' '}
              {left.length ? (
                <b className="font-normal text-danger">{t('ui.home.toCatch', { n: left.length })}</b>
              ) : (
                t('ui.home.allCaught')
              )}
            </span>
          ) : (
            <span className="font-pixel-sm text-[15px] leading-none text-muted">
              {t('ui.home.trainersOnly')}
            </span>
          )}
        </span>
        {hits.length > 0 && (
          <span className="flex flex-wrap gap-x-2.5 gap-y-1 px-0.5 pr-[70px]">
            {hits.slice(0, 6).map((d) => {
              const got = save.pokedex.includes(d)
              return (
                <span
                  key={d}
                  className={cx(
                    'inline-flex items-center font-pixel-sm text-[15px]',
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
          className="absolute bottom-3 right-2.5 grid h-11 w-[60px] place-items-center bg-[#e3e8f0] shadow-ring-line"
          aria-hidden
        >
          <PixelIcon name="lock" size={16} />
        </span>
      ) : (
        <button
          type="button"
          onClick={onGo}
          aria-label={
            st === 'here'
              ? t('ui.home.playHere', { area: area.name })
              : t('ui.home.goTo', { area: area.name })
          }
          className="pixel-btn frame-primary absolute bottom-3 right-2.5 h-11 w-[60px] text-[24px] uppercase leading-none tracking-[0.06em]"
        >
          {t('ui.home.go')}
        </button>
      )}
    </li>
  )
}

/** A region the player has reached: its picture, areas, catches and badges. Tapping it moves there. */
function RegionCard({ region, onBack }: { region: Region; onBack: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const here = regionOf(save) === region.id
  const first = regionAreas(data, region.id)[0]
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
      onClick={() => (here ? onBack() : switchRegion(region.id))}
      aria-label={label}
      className={cx(
        'grid w-full gap-1.5 bg-paper px-1.5 pb-2.5 pt-1.5 text-left',
        here ? 'shadow-[inset_0_0_0_3px_#ff8a3d,inset_0_-5px_0_#ffe0c8]' : 'shadow-card',
      )}
    >
      {first && <img src={stripOf(first.bannerUrl)} alt="" className="pixelated h-auto w-full" />}
      <span className="flex items-center gap-2 px-1">
        <b className="flex-1 text-[24px] font-normal leading-none">{region.name}</b>
        {here && <Chip tone="red">{t('ui.dex.youAreHere')}</Chip>}
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 font-pixel-sm text-[15px] text-muted">
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
  const [pick, setPick] = useState<number | null>(null)
  const starters = region.starters.filter((d) => data.species[d])
  const here = getRegion(data, regionOf(save))?.name ?? ''
  return (
    <section
      aria-labelledby="offer-title"
      className="grid gap-2 bg-[#fff8e0] px-3 pb-3.5 pt-3 shadow-[inset_0_0_0_2px_#24304f,inset_0_0_0_6px_#ffbe2e,inset_0_0_0_8px_#24304f,inset_0_-12px_0_#ffe7a8]"
    >
      <span className="flex flex-wrap items-center gap-2 px-1 pt-1">
        <Chip tone="gold">{t('ui.home.newRegionTag')}</Chip>
        <span className="ml-auto font-pixel-sm text-[15px] text-muted">
          {t('ui.home.regionAreas', { n: regionAreaList(data, region.id).length })} ·{' '}
          {t('ui.home.newPokemon', { n: regionSpecies(data, region.id).size })}
        </span>
      </span>
      <h3 id="offer-title" className="px-1 text-[42px] leading-[0.9]">
        {region.name}
      </h3>
      <p id="offer-pick" className="m-0 px-1 text-[18px]">
        {t('ui.home.pickPartner')}
      </p>
      <div role="radiogroup" aria-labelledby="offer-pick" className="grid grid-cols-3 gap-2 px-1">
        {starters.map((d) => {
          const s = data.species[d]!
          const on = pick === d
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPick(d)}
              className={cx(
                'grid min-w-0 justify-items-center gap-1 bg-paper px-0.5 pb-2 pt-0.5',
                on
                  ? 'bg-[#fffbea] shadow-[inset_0_0_0_3px_#24304f,inset_0_-6px_0_#ffbe2e]'
                  : 'shadow-ring-line',
              )}
            >
              <MiniSprite dex={d} size={64} />
              <b className="max-w-full truncate text-[18px] font-normal leading-none">{s.name}</b>
              <TypeBadge type={s.type1} size="sm" />
            </button>
          )
        })}
      </div>
      <p className="m-0 px-1 font-pixel-sm text-[15px] leading-tight text-muted">
        {t('ui.home.offerNote', { region: here })}
      </p>
      <PixelButton
        variant="primary"
        size="lg"
        className="mx-1 w-[calc(100%-8px)]"
        disabled={pick == null}
        onClick={() => {
          if (pick != null && startRegion(region.id, pick)) onStarted()
        }}
      >
        {pick != null
          ? t('ui.home.startWith', { region: region.name, name: data.species[pick]?.name ?? '' })
          : t('ui.home.pickFirst')}
      </PixelButton>
    </section>
  )
}

/**
 * The Areas sheet: every area of the region as a card (its scene's strip, level range, catches, its state as the
 * outline), searchable by area or by Pokémon, filtered and sorted. A card opens the area's details; GO travels there
 * (or plays, where you are). "Regions" beside the title switches to the regions reached and the one on offer.
 */
export function AreasSheet({
  open,
  onClose,
  view: initialView,
  filter: initialFilter,
  onDetails,
  onPlay,
  onTravel,
}: {
  open: boolean
  onClose: () => void
  view: 'areas' | 'regions'
  filter: AreasFilter
  onDetails: (areaId: string) => void
  onPlay: () => void
  onTravel: (area: Area) => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<AreasFilter>(initialFilter)
  const [sort, setSort] = useState<Sort>('route')
  const [view, setView] = useState(initialView)
  const region = regionOf(save)
  const regionName = getRegion(data, region)?.name ?? ''
  const offer = regionOnOffer()

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

  const regionsBtn = (
    <button
      type="button"
      aria-pressed={view === 'regions'}
      onClick={() => setView((v) => (v === 'regions' ? 'areas' : 'regions'))}
      aria-label={
        view === 'regions' ? t('ui.home.regionsShown', { region: regionName }) : t('ui.home.regions')
      }
      className={cx(
        'inline-flex min-h-[44px] items-center gap-1.5 px-2.5 pb-0.5 text-[18px] leading-none md:min-h-[40px]',
        view === 'regions'
          ? 'bg-ink text-panel shadow-[inset_0_0_0_2px_#24304f,inset_0_3px_0_#11182c]'
          : 'bg-paper shadow-card',
      )}
    >
      <PixelIcon name="map" size={22} />
      {t('ui.home.regions')}
      {offer && view !== 'regions' && <Chip tone="gold">{t('ui.common.new')}</Chip>}
    </button>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={view === 'regions' ? t('ui.home.regions') : regionName}
      titleExtra={regionsBtn}
      sub={
        view === 'regions'
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
        view === 'areas' && (
          <>
            <SearchField id="areas-q" label={t('ui.home.searchAreas')} value={q} onChange={setQ} />
            <FilterChips label={t('ui.home.show')} value={filter} onChange={setFilter} options={filters} />
            <div className="flex items-center gap-1.5 pb-1 shadow-[0_2px_0_#dfe7f2]">
              <span className="font-pixel-sm text-[15px] text-muted" aria-hidden>
                {t('ui.home.sort')}
              </span>
              <FilterChips label={t('ui.home.sort')} value={sort} onChange={setSort} options={sorts} />
            </div>
          </>
        )
      }
    >
      {view === 'areas' ? (
        list.length ? (
          <ul className="flex flex-col gap-2.5 pt-1">
            {list.map(({ a }) => (
              <AreaCard
                key={a.id}
                area={a}
                query={q}
                onDetails={() => onDetails(a.id)}
                onGo={() => (a.id === save.currentAreaId ? onPlay() : onTravel(a))}
              />
            ))}
          </ul>
        ) : (
          <p className="py-4 text-[18px] text-muted">{t('ui.home.noMatch', { q })}</p>
        )
      ) : (
        <div className="flex flex-col gap-3 pt-1">
          {regions.map((r) => (
            <RegionCard key={r.id} region={r} onBack={() => setView('areas')} />
          ))}
          {offer ? (
            <OfferCard region={offer} onStarted={onClose} />
          ) : (
            more && (
              <div className="grid grid-cols-[60px_minmax(0,1fr)] items-center gap-3 bg-[#f1f4f9] p-3 shadow-ring-line">
                <span
                  className="grid h-[60px] w-[60px] place-items-center bg-faint text-[46px] leading-none text-white shadow-[inset_0_0_0_3px_#5c6a8a]"
                  aria-hidden
                >
                  ?
                </span>
                <span className="grid min-w-0 gap-1">
                  <b className="text-[22px] font-normal leading-none">{t('ui.home.regionTeaser')}</b>
                  <small className="font-pixel-sm text-[15px] leading-tight text-muted">
                    {t('ui.home.regionTeaserBody')}
                  </small>
                </span>
              </div>
            )
          )}
          <p className="px-3 text-center font-pixel-sm text-[15px] text-muted">{t('ui.home.regionsFoot')}</p>
        </div>
      )}
    </Sheet>
  )
}
