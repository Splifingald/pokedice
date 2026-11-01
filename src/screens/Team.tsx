import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  homersIn,
  teamSwapsOpen,
  nightmareModeOf,
  timeRaceModeOf,
  whiteoutModeOf,
  atBonfire,
  tracksModeOf,
  monName,
  POKE_TYPES,
  regionOf,
  teamOf,
  type PokemonInstance,
  type PokeType,
  outfitOf,
} from '@/engine'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import { BoxFilter, sortBox, type BoxSort } from '@/components/BoxSort'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { MonTile, TILE_GRID } from '@/components/MonTile'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { SearchField } from '@/components/Segmented'
import { SheetModal, type SheetView } from '@/components/SheetModal'
import { SplitView } from '@/components/SplitView'
import { countdown } from '@/lib/format'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { cx } from '@/theme/util'
import { TeamCards } from './team/TeamCards'
import { InstTalentGem } from '@/components/Talent'
import { outfitName } from '@/components/Outfit'
import { skinKey, useRunSkin } from '@/components/portalSkin'

type Sort = Exclude<BoxSort, 'type'>
const SORTS: readonly Sort[] = ['dex', 'level', 'newest']

/**
 * The Team (docs/43 §5.4): its title, the team as the one Pokémon
 * card, the Box as tiles under one filter row. A Pokémon opens its sheet: a bottom sheet on a phone; on a PC
 * (`SplitView`) the sheet stands docked at the right, always open — the lead's until another card or tile is picked —
 * with its actions at the pane's foot.
 */
export function TeamScreen() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  // Inside a Pokémon Center, or at a portal's way in (docs/28), the team can change (the engine says where): a
  // Pokémon's sheet then has the Center's moves at its foot.
  const swaps = useGame((s) => !!s.save && teamSwapsOpen(s.save, s.data, s.run))
  const atPortal = useGame((s) => swaps && s.run.phase === 'idle')
  // The Stairway of Plates' way in says it in its own words (docs/61 §4.5).
  const skin = useRunSkin()
  // …or the nightmare's way in (docs/30): its own words.
  const atNightmare = useGame(
    (s) =>
      atPortal &&
      !!nightmareModeOf(
        s.data.areas.find((a) => a.id === s.run.areaId),
        s.data,
      ),
  )
  // …or the race of time and space's (docs/61 §4.4).
  const atRace = useGame(
    (s) =>
      atPortal &&
      !!timeRaceModeOf(
        s.data.areas.find((a) => a.id === s.run.areaId),
        s.data,
      ),
  )
  // …or the whiteout's (docs/61 §4.3): its way in, or a bonfire between its waves (the bag open there too).
  const atWhiteout = useGame(
    (s) =>
      atPortal &&
      !!whiteoutModeOf(
        s.data.areas.find((a) => a.id === s.run.areaId),
        s.data,
      ),
  )
  // …or Tracks in the Snow's (docs/61 §4.1).
  const atGlade = useGame(
    (s) => atPortal && !!tracksModeOf(s.data.areas.find((a) => a.id === s.run.areaId), s.data),
  )
  const atCamp = useGame((s) => atWhiteout && !!s.save && atBonfire(s.save, s.data, s.run.areaId))
  const hint = atCamp
    ? 'ui.whiteout.teamHintBonfire'
    : atNightmare || atWhiteout
      ? 'ui.nightmare.teamHint'
      : atGlade
        ? 'ui.tracks.teamHint'
        : atRace
          ? 'ui.timeRace.teamHint'
          : skinKey(skin, 'ui.portal.teamHint')
  const back = atCamp
    ? 'ui.whiteout.backToBonfire'
    : atWhiteout
      ? 'ui.whiteout.backToWayIn'
      : atNightmare
        ? 'ui.nightmare.backToWayIn'
        : atGlade
          ? 'ui.tracks.backToWayIn'
          : atRace
            ? 'ui.timeRace.backToWayIn'
            : skinKey(skin, 'ui.portal.backToPortal')
  const navigate = useNavigate()
  const now = useNow(30_000)
  const wide = useMediaQuery('(min-width: 1024px)')
  const [view, setView] = useState<SheetView | null>(null)
  const [sort, setSort] = useState<Sort>('dex')
  const [type, setType] = useState<PokeType | 'all'>('all')
  const [q, setQ] = useState('')
  if (!save) return null
  const team = teamOf(save)
  const name = (p: PokemonInstance) => monName(p, data)
  const speciesName = (p: PokemonInstance) => data.species[p.dex]?.name ?? t('ui.common.unknown')
  const typesOf = (p: PokemonInstance) => {
    const s = data.species[p.dex]
    return s ? [s.type1, ...(s.type2 ? [s.type2] : [])] : []
  }
  const boxAll = save.box.filter((p) => !save.team.includes(p.id))
  const boxTypes = POKE_TYPES.filter((ty) => boxAll.some((p) => typesOf(p).includes(ty)))
  const needle = searchFold(q)
  const box = sortBox(
    boxAll.filter(
      (p) =>
        (!needle || [name(p), speciesName(p)].some((n) => searchFold(n).includes(needle))) &&
        (type === 'all' || typesOf(p).includes(type)),
    ),
    sort,
    data,
  )
  const narrowed = !!needle || type !== 'all'
  const clear = () => {
    setQ('')
    setType('all')
  }
  const open = (p: PokemonInstance) => setView({ kind: 'inst', id: p.id })
  // A closed small world's Pokémon waiting here until this region's best reaches their level (docs/26 §1).
  const waiting = homersIn(save, regionOf(save))
  // The one on view still exists (one sent away, traded or let go is gone): else, on a PC, the lead's.
  const live =
    view &&
    (view.kind === 'inst'
      ? save.box.some((p) => p.id === view.id)
      : view.kind === 'homer'
        ? waiting.some((h) => h.inst.id === view.id)
        : true)
      ? view
      : null
  const shown: SheetView | null = live ?? (wide && team[0] ? { kind: 'inst', id: team[0].id } : null)
  const current = wide && shown && (shown.kind === 'inst' || shown.kind === 'homer') ? shown.id : null

  const main = (
    <>
      {/* No scene here (the user's call, 2026-10-27): Home already shows the team roaming; the Team is for managing it. */}
      <PageHead icon="navTeam" title={t('ui.team.title')} />

      {/* At a portal's way in: healed, the Box open, and the way back to its pop-up. */}
      {atPortal && (
        <div className="pixel-dialogue flex flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center">
          <p className="m-0 flex flex-1 items-center gap-3 text-[20px] leading-[1.15]">
            <PixelIcon name="heart" size={24} className="shrink-0" />
            <span>{t(hint)}</span>
          </p>
          <PixelButton variant="primary" className="shrink-0" onClick={() => navigate('/area')}>
            {t(back)}
          </PixelButton>
        </div>
      )}

      <TeamCards team={team} onOpen={open} selected={current} />

      <section className="flex flex-col gap-2" aria-labelledby="box-title">
        <h2 id="box-title" className="mt-1 flex items-baseline gap-2 text-[24px] leading-none">
          {t('ui.team.boxHeading')}
          <span className="font-pixel-sm text-[18px] text-muted">
            {narrowed ? t('ui.team.boxShown', { shown: box.length, total: boxAll.length }) : boxAll.length}
          </span>
        </h2>
        {boxAll.length > 1 && (
          // One filter row: the search, then the order and the type in one menu.
          <div className="flex items-center gap-2">
            <SearchField
              id="box-search"
              value={q}
              onChange={setQ}
              label={t('ui.team.searchBoxLabel')}
              placeholder={t('ui.team.searchBox')}
              className="min-w-0 flex-1 lg:max-w-[360px]"
            />
            <BoxFilter
              sort={sort}
              onSort={setSort}
              sorts={SORTS}
              type={type}
              onType={setType}
              types={boxTypes}
              shown={box.length}
            />
          </div>
        )}
        {boxAll.length === 0 ? (
          <p className="copy flex items-center gap-2 bg-well px-3 py-2.5 shadow-ring-line">
            <PixelIcon name="box" size={20} className="shrink-0" />
            {t('ui.team.boxEmpty')}
          </p>
        ) : (
          box.length === 0 && (
            <div className="flex flex-col items-start gap-1 bg-well px-3 py-2.5 shadow-ring-line">
              <p className="copy">{q ? t('ui.team.boxNoMatch', { query: q }) : t('ui.team.boxNoType')}</p>
              <button type="button" className="min-h-[44px] text-[20px] underline md:min-h-[36px]" onClick={clear}>
                {t('ui.team.clearFilters')}
              </button>
            </div>
          )
        )}
        <ul className={cx(TILE_GRID, 'lg:grid-cols-[repeat(auto-fill,minmax(80px,1fr))]')}>
          {box.map((p) => {
            const fossil = p.revivesAt != null && p.fossil ? data.items[p.fossil] : undefined
            const reviving = p.revivesAt != null
            const left = reviving ? Math.max(0, p.revivesAt! - now) : 0
            const until = left > 0 ? countdown(left) : t('ui.mon.soon')
            const level = t('ui.common.level.short', { n: p.level })
            return (
              <li key={p.id}>
                <MonTile
                  dex={p.dex}
                  name={name(p)}
                  level={reviving ? undefined : level}
                  sub={reviving ? until : undefined}
                  selected={current === p.id}
                  icon={reviving ? <ItemSprite item={fossil} size={40} /> : undefined}
                  label={[
                    name(p),
                    p.nickname ? speciesName(p) : null,
                    p.shiny ? t('ui.mon.shiny') : null,
                    outfitOf(data, p) ? outfitName(p.outfit!) : null,
                    reviving ? t('ui.mon.revivesIn', { time: until }) : level,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => open(p)}
                  tags={
                    <>
                      {p.shiny && <PixelIcon name="star" size={12} className="absolute left-[5px] top-[5px]" />}
                      {/* Its outfit (docs/59): the box icon is the plain one, so a hat in the corner says which. */}
                      {outfitOf(data, p) && <PixelIcon name="santaHat" size={14} className="absolute right-[5px] top-[5px]" />}
                      {/* Its hidden talent (docs/51): under the star, or in its place. */}
                      <InstTalentGem inst={p} className={cx('absolute left-[6px]', p.shiny ? 'top-[20px]' : 'top-[5px]')} />
                    </>
                  }
                />
              </li>
            )
          })}
        </ul>
      </section>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="waiting-title">
          <h2 id="waiting-title" className="mt-1 flex items-baseline gap-2 text-[24px] leading-none">
            {t('ui.team.waitingHeading')}
            <span className="font-pixel-sm text-[18px] text-muted">{waiting.length}</span>
          </h2>
          <ul className={cx(TILE_GRID, 'lg:grid-cols-[repeat(auto-fill,minmax(80px,1fr))]')}>
            {waiting.map(({ inst: p }) => (
              <li key={p.id}>
                <MonTile
                  dex={p.dex}
                  name={name(p)}
                  level={t('ui.common.level.short', { n: p.level })}
                  locked
                  selected={current === p.id}
                  label={[
                    name(p),
                    p.nickname ? speciesName(p) : null,
                    p.shiny ? t('ui.mon.shiny') : null,
                    outfitOf(data, p) ? outfitName(p.outfit!) : null,
                    t('ui.mon.lockedUntil', { n: p.level }),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => setView({ kind: 'homer', id: p.id })}
                  tags={
                    <>
                      {p.shiny && <PixelIcon name="star" size={12} className="absolute left-[5px] top-[5px]" />}
                      {/* Its outfit (docs/59): the box icon is the plain one, so a hat in the corner says which. */}
                      {outfitOf(data, p) && <PixelIcon name="santaHat" size={14} className="absolute right-[5px] top-[5px]" />}
                      {/* Its hidden talent (docs/51): under the star, or in its place. */}
                      <InstTalentGem inst={p} className={cx('absolute left-[6px]', p.shiny ? 'top-[20px]' : 'top-[5px]')} />
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-none">
      <SplitView
        main={main}
        detail={<SheetModal view={shown} onClose={() => setView(null)} manage swaps={swaps} />}
      />
    </div>
  )
}
