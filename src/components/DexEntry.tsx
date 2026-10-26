import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  badgeCase,
  isAreaClosed,
  isTradeEvolution,
  isAreaUnlocked,
  isRaidBoss,
  progressRaidKey,
  progressRaidOf,
  progressRaidState,
  raidRules,
  progressOf,
  eventUnlocked,
  nextRaidsOf,
  eventOn,
  raidHomeArea,
  raidLocked,
  raidRegion,
  utcDay,
  regionOf,
  regionOfArea,
  shopSells,
  type Area,
  type Evolution,
  type GameData,
  type ItemDef,
  type ProgressRaid,
  type RegionId,
  speciesTime,
  wildShare,
  type DayTime,
  nationalDex,
} from '@/engine'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { useDayTime } from '@/store/dayTime'
import { useGame } from '@/store/game'
import { useDetails } from '@/store/hooks'
import { dexNo } from '@/lib/format'
import { useServerNow } from '@/store/serverTime'
import { progressRaidPath } from '@/screens/events/progressRaids'
import { raidDate } from '@/screens/events/shared'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { ItemSprite } from './ItemSprite'
import { evolutionHow, PokemonSheet, useVisibleEvolutions } from './PokemonSheet'
import { MiniSprite, SpriteImg } from './SpriteImg'
import { Chip } from './Chip'
import { CryButton } from './CryButton'
import { Sheet } from './Sheet'
import { TypeBadge } from './TypeBadge'
import { areaStatus, lockReason } from '@/screens/home/areas'
import { AreaStrip } from './AreaStrip'
import { DayNightPill } from './DayNight'
import { travelTo } from '@/store/travel'

interface Spot {
  area: Area
  minLevel: number
  maxLevel: number
  /** Share of the area's wild pool — or of its loot table for a fossil (0 for a legendary). */
  share: number
  legendary: boolean
  /** Set when the species is revived from a fossil found here rather than met in the grass. */
  fossil?: ItemDef
  /**
   * Set when this is where an item (an evolution stone…) turns up in the loot, not a Pokémon. `entryIds` holds every
   * one-time find of it in the area (0059 gave each a twin), so the area shows once with how many there are.
   */
  loot?: { item: ItemDef; entryIds: string[]; unique: boolean }
  /** Set when the area's legendary is a progression raid (docs/24): GO opens the raid's page. */
  raid?: ProgressRaid
  /** Met here only by day or only by night (docs/32). */
  time?: DayTime | null
}

const byRoute = (a: Spot, b: Spot) => Number(a.area.hidden) - Number(b.area.hidden) || a.area.orderIndex - b.area.orderIndex

/**
 * Every area of `region` where a species turns up in the wild or as a legendary, main chain first, secret areas
 * last.
 *
 * Only the region being played: its areas are the only ones the player can reach, the only ones whose lock state
 * `isAreaUnlocked` can answer for (it reads the live region's progress), and the only ones the card's travel button
 * can enter. Listing another region's routes offered a Kanto player a walk to Mount Silver.
 */
export function whereToFind(dex: number, data: GameData, region: RegionId, now: DayTime | null = null): Spot[] {
  const out: Spot[] = []
  for (const area of data.areas) {
    if (regionOfArea(area) !== region) continue
    const total = area.wildPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
    const hits = area.wildPool.filter((e) => e.dex === dex && e.weight > 0)
    if (hits.length && total) {
      // Where the area keeps the time (docs/32): the share when it's met, and its sun or moon.
      const time = speciesTime(data, area, dex)
      out.push({
        area,
        minLevel: Math.min(...hits.map((h) => h.minLevel)),
        maxLevel: Math.max(...hits.map((h) => h.maxLevel)),
        share: wildShare(data, area, dex, now),
        legendary: false,
        ...(time && { time }),
      })
    }
    const boss = area.legendaryBoss?.find((b) => b.dex === dex)
    const raid = boss && isRaidBoss(data, boss) ? progressRaidOf(data, progressRaidKey(area.id, dex)) : null
    if (raid) {
      const level = raidRules(data, dex, 'progress', area.id).level
      out.push({ area, minLevel: level, maxLevel: level, share: 0, legendary: true, raid })
    } else if (boss) out.push({ area, minLevel: boss.level, maxLevel: boss.level, share: 0, legendary: true })

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
  return out.sort(byRoute)
}

/** Every area of `region` whose loot table holds `itemKey` — same order, and same one-region rule, as `whereToFind`. */
export function whereToFindItem(itemKey: string, data: GameData, region: RegionId): Spot[] {
  const item = data.items[itemKey]
  if (!item) return []
  const out: Spot[] = []
  for (const area of data.areas) {
    if (regionOfArea(area) !== region) continue
    const lootTotal = area.lootPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
    let once: Spot | null = null
    for (const entry of area.lootPool) {
      if (entry.itemKey !== itemKey || entry.weight <= 0) continue
      if (entry.unique && once) {
        once.loot!.entryIds.push(entry.id)
        continue
      }
      const spot: Spot = {
        area,
        minLevel: 0,
        maxLevel: 0,
        share: lootTotal ? entry.weight / lootTotal : 0,
        legendary: false,
        loot: { item, entryIds: [entry.id], unique: entry.unique },
      }
      if (entry.unique) once = spot
      out.push(spot)
    }
  }
  return out.sort(byRoute)
}

/** An area's one-time finds of an item: once or n times, and how many of them are still to be found. */
function lootOnceLine(entryIds: readonly string[], found: readonly string[]) {
  const total = entryIds.length
  const left = entryIds.filter((id) => !found.includes(id)).length
  const line = total > 1 ? t('ui.dex.lootTimes', { n: total }) : t('ui.dex.lootOnce')
  if (!left) return line + t('ui.dex.alreadyFoundSuffix')
  return left < total ? line + t('ui.dex.lootLeftSuffix', { n: left }) : line
}

export const rarity = (share: number) => t(share >= 0.15 ? 'ui.dex.common' : share >= 0.06 ? 'ui.dex.uncommon' : 'ui.dex.rare')

/**
 * One place a species (or an item) turns up: the area's strip, its name, how it shows there, and the same GO as the
 * Areas list (travel there; Home's CONTINUE then plays it). A locked area says why; a secret one keeps its name.
 */
function SpotCard({ spot, onTravel }: { spot: Spot; onTravel?: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  if (!save) return null
  const { area } = spot
  const st = areaStatus(save, data, area)
  const locked = st === 'locked'
  const secret = area.hidden && locked
  // A raid's page stays open after its area closes: the raid is fought there, not in the area.
  const closed = !locked && !spot.raid && isAreaClosed(save, area.id, data)
  const raidState = spot.raid ? progressRaidState(save, data, spot.raid) : null
  const levels = area.scalesToTeam && !spot.fossil
    ? t('ui.dex.scaling')
    : spot.minLevel === spot.maxLevel
      ? t('ui.common.level.short', { n: spot.minLevel })
      : t('ui.map.levelRange', { min: spot.minLevel, max: spot.maxLevel })
  const name = secret ? t('ui.dex.aSecretArea') : area.name
  const go = () => {
    if (spot.raid) {
      onTravel?.()
      return navigate(progressRaidPath(spot.raid))
    }
    if (st !== 'here' && !travelTo(area)) return
    onTravel?.()
    navigate('/home')
  }
  return (
    <li
      className={cx(
        'relative flex min-h-[62px] items-center gap-2 py-1.5 pl-1.5 pr-[78px]',
        locked
          ? 'bg-well text-muted shadow-ring-line'
          : st === 'here'
            ? 'bg-paper shadow-[inset_0_0_0_3px_#ff8a3d]'
            : st === 'cleared'
              ? 'bg-paper shadow-[inset_0_0_0_3px_#34c97a]'
              : 'bg-paper shadow-ring',
      )}
    >
      <AreaStrip
        area={area}
        h={48}
        className={cx('h-12 w-[72px] shrink-0 shadow-halo', locked && 'grayscale-[0.7]', secret && 'blur-[1px]')}
      />
      <span className="grid min-w-0 gap-[3px]">
        <b className="truncate text-[18px] font-normal leading-none">{name}</b>
        <small className="font-pixel-sm text-[16px] leading-tight text-muted">
          {spot.loot
            ? spot.loot.unique
              ? lootOnceLine(spot.loot.entryIds, progressOf(save, area.id).uniqueFound ?? [])
              : t('ui.dex.lootSpot', { rarity: rarity(spot.share) })
            : spot.fossil
              ? t('ui.dex.fossilSpot', { item: spot.fossil.name, levels, rarity: rarity(spot.share) })
              : spot.raid
                ? t('ui.dex.raidSpot', { levels }) +
                  (raidState === 'done' ? t('ui.dex.raidDoneSuffix') : raidState === 'locked' && !locked ? t('ui.dex.raidLockedSuffix') : '')
              : spot.legendary
                ? t('ui.dex.legendarySpot', { levels })
                : t('ui.dex.wildSpot', { levels, rarity: rarity(spot.share) })}
          {locked && ` · ${lockReason(save, data, area) || t('ui.dex.locked')}`}
          {closed && t('ui.dex.closedSuffix')}
        </small>
        {/* Day and night (docs/32): a place where it comes only by day or only by night says so on its own chip. */}
        {spot.time && (
          <span className="flex">
            <DayNightPill time={spot.time} />
          </span>
        )}
      </span>
      {locked || closed ? (
        <span className="absolute right-2.5 top-1/2 grid h-11 w-[60px] -translate-y-1/2 place-items-center bg-well-deep shadow-ring-line" aria-hidden>
          <PixelIcon name="lock" size={16} />
        </span>
      ) : (
        <button
          type="button"
          onClick={go}
          aria-label={
            spot.raid
              ? t('ui.raid.progress.openLabel', { name: data.species[spot.raid.dex]?.name ?? '' })
              : st === 'here'
                ? t('ui.home.playHere', { area: area.name })
                : t('ui.home.goTo', { area: area.name })
          }
          className="pixel-btn frame-dark absolute right-2.5 top-1/2 h-11 w-[60px] -translate-y-1/2 text-[24px] uppercase leading-none tracking-[0.06em]"
        >
          {t('ui.home.go')}
        </button>
      )}
    </li>
  )
}

/** The next days the species is the raid (the shared calendar), normal or shiny; none when raids are off. */
function useRaidRole(dex: number): { day: string; shiny: boolean }[] | null {
  const data = useGame((s) => s.data)
  const now = useServerNow(60_000)
  const today = utcDay(now ?? Date.now())
  const dates = useMemo(() => (eventOn(data, 'raid') ? nextRaidsOf(data, dex, today, 2) : []), [data, dex, today])
  return dates.length ? dates : null
}

/**
 * Where to find it, for Raid Battles: its next raid days, and whether a catch would wait for its area (grey, with the
 * area to complete). GO when it's today's raid and the raids are open.
 */
function RaidSpot({ dex, onTravel }: { dex: number; onTravel?: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const navigate = useNavigate()
  const dates = useRaidRole(dex)
  const now = useServerNow(60_000)
  if (!save || !dates) return null
  const today = utcDay(now ?? Date.now())
  const area = raidHomeArea(data, dex)
  const locked = !!area && raidLocked(save, data, area.id)
  const live = dates[0]!.day === today && eventUnlocked('raid', save, data)
  const when = dates.map((d) => (d.shiny ? t('ui.raid.dexShinyOn', { date: raidDate(d.day) }) : raidDate(d.day))).join(' · ')
  const region = area ? (data.regions.find((r) => r.id === raidRegion(data, area.id))?.name ?? '') : ''
  return (
    <li className={cx('relative flex min-h-[62px] items-center gap-2 py-1.5 pl-1.5', live ? 'bg-paper pr-[78px] shadow-ring' : 'bg-well pr-2 shadow-ring-line')}>
      {area ? (
        <span className="relative h-12 w-[72px] shrink-0" aria-hidden>
          <AreaStrip area={area} h={48} className={cx('h-12 w-[72px] shadow-halo', locked && 'grayscale-[0.7]')} />
          <span className="absolute bottom-0.5 left-0.5 grid h-5 w-5 place-items-center bg-night">
            <PixelIcon name={locked ? 'lock' : 'star'} size={12} />
          </span>
        </span>
      ) : (
        <span className="grid h-12 w-[72px] shrink-0 place-items-center bg-night shadow-halo" aria-hidden>
          <PixelIcon name="star" size={24} />
        </span>
      )}
      <span className="grid min-w-0 gap-[3px]">
        <b className="truncate text-[18px] font-normal leading-none">{t('ui.events.raid.name')}</b>
        <small className="font-pixel-sm text-[16px] leading-tight text-muted">
          {live ? t('ui.raid.dexToday') : t('ui.raid.dexNext', { dates: when })}
          {locked && area && ` ${t('ui.raid.dexLocked', { area: area.name, region })}`}
        </small>
      </span>
      {live && (
        <button
          type="button"
          onClick={() => {
            onTravel?.()
            navigate('/events/raid')
          }}
          aria-label={t('ui.events.open', { name: t('ui.events.raid.name') })}
          className="pixel-btn frame-dark absolute right-2.5 top-1/2 h-11 w-[60px] -translate-y-1/2 text-[24px] uppercase leading-none tracking-[0.06em]"
        >
          {t('ui.home.go')}
        </button>
      )}
    </li>
  )
}

/** The areas of the region being played where `dex` turns up, plus a hint when the run is pinning the player down. */
function useSpots(dex: number) {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const region = save ? regionOf(save) : null
  // Travel waits while an encounter is under way; between encounters every GO works.
  const busy = useGame((s) => s.run.phase !== 'idle')
  const here = save?.currentAreaId
  const now = useDayTime()
  const spots = useMemo(() => (region ? whereToFind(dex, data, region, now) : []), [dex, data, region, now])
  return { spots, travelHint: busy && spots.some((s) => s.area.id !== here) }
}

function SpotList({ spots, onTravel }: { spots: Spot[]; onTravel?: () => void }) {
  return (
    <ul className="grid gap-1.5">
      {spots.map((s) => (
        <SpotCard key={`${s.area.id}-${s.legendary}-${s.fossil?.key ?? ''}-${s.loot?.entryIds[0] ?? ''}`} spot={s} onTravel={onTravel} />
      ))}
    </ul>
  )
}

/**
 * A fold: a 44 px summary row with a pixel chevron, its content under it once opened. The entry's studied parts (the
 * dice and stats, where a stone is found) wait in one, so the hero and where to find it come first (docs/43 §5.6).
 */
export function Fold({
  summary,
  open,
  onToggle,
  children,
  testId,
}: {
  summary: ReactNode
  open?: boolean
  onToggle?: (open: boolean) => void
  children: ReactNode
  testId?: string
}) {
  // Its content is built only once opened: a closed <details> still lays out what it hides in Chrome, and the sheet's
  // dice are the entry's heaviest part.
  const [shown, setShown] = useState(!!open)
  return (
    <details
      className="group shadow-ring-line"
      open={shown}
      onToggle={(e) => {
        setShown(e.currentTarget.open)
        onToggle?.(e.currentTarget.open)
      }}
      data-testid={testId}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-2 py-1 text-[20px] leading-none hover:bg-paper [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="block h-[10px] w-[8px] shrink-0 bg-ink [clip-path:polygon(0_0,100%_50%,0_100%)] group-open:rotate-90"
        />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">{summary}</span>
      </summary>
      {shown && <div className="flex flex-col gap-2 px-2 pb-2 pt-1">{children}</div>}
    </details>
  )
}

/** Where the item an evolution needs comes from: the areas that drop it, and the Poké Mart if it sells it here. */
function ItemSources({ itemKey, onTravel }: { itemKey: string; onTravel?: () => void }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const region = save ? regionOf(save) : null
  const spots = useMemo(() => (region ? whereToFindItem(itemKey, data, region) : []), [itemKey, data, region])
  const item = data.items[itemKey]
  if (!save || !region || !item) return null
  const inShop = shopSells(item, save, region, data)
  const badges = inShop ? badgeCase(save, data).filter((b) => b.earned).length : 0
  // What the Mart still waits for, the way the Shop words it: badges first, then reaching its area.
  const shopNeeds = !inShop
    ? null
    : badges < item.shopBadges
      ? t(`ui.shop.needsBadges.${item.shopBadges === 1 ? 'one' : 'other'}`, { count: item.shopBadges })
      : item.shopArea && !isAreaUnlocked(save, item.shopArea, data)
        ? t('ui.shop.needsArea', {
            area: data.areas.find((a) => a.id === item.shopArea)?.name ?? t('ui.shop.someNewArea'),
          })
        : null
  return (
    <Fold
      summary={
        <>
          <ItemSprite item={item} size={24} />
          <span className="min-w-0">{t('ui.dex.whereToFindItem', { item: item.name })}</span>
        </>
      }
    >
      {spots.length > 0 && <SpotList spots={spots} onTravel={onTravel} />}
      {inShop && (
        <p className="bg-paper p-2 text-lg leading-tight shadow-ring">
          {t('ui.dex.itemInShop')}
          {shopNeeds && <span className="text-muted"> · {shopNeeds}</span>}
        </p>
      )}
      {spots.length === 0 && !inShop && <p className="copy text-muted">{t('ui.dex.itemNowhere')}</p>}
    </Fold>
  )
}

const EVOLVES_TEXT = {
  from: { item: 'ui.dex.evolvesFromItem', level: 'ui.dex.evolvesFromLevel', trade: 'ui.dex.evolvesFromTrade' },
  into: { item: 'ui.dex.evolvesIntoItem', level: 'ui.dex.evolvesIntoLevel', trade: 'ui.dex.evolvesIntoTrade' },
} as const

/**
 * One evolution step as a card naming the other species (a silhouette until it is caught) that opens its entry — and,
 * for a stone, where to find that stone (folded). "From" on the evolved species' entry, "into" on the one that evolves.
 */
function EvolutionStep({
  dex,
  evo,
  direction,
  from,
  onOpenDex,
  onTravel,
}: {
  dex: number
  evo: Evolution
  direction: 'from' | 'into'
  /** The species that evolves (for "into", the entry's own): a trade evolution says so (docs/23). */
  from: number
  onOpenDex?: (dex: number) => void
  onTravel?: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const known = useGame((s) => !!s.save?.pokedex.includes(dex))
  const how = isTradeEvolution(data, from, evo.toDex) ? 'trade' : evo.item ? 'item' : 'level'
  const button = (
    <button
      type="button"
      onClick={() => onOpenDex?.(dex)}
      className="flex min-h-[52px] w-full items-center gap-2 bg-paper px-2 py-1.5 text-left shadow-ring hover:shadow-card-gold"
    >
      <MiniSprite dex={dex} size={40} silhouette={!known} />
      <span className="text-[18px] leading-tight">
        {t(EVOLVES_TEXT[direction][how], {
          name: known ? (data.species[dex]?.name ?? '') : t('ui.common.unknown'),
          how: evolutionHow(evo, data, from),
        })}
      </span>
    </button>
  )
  if (!evo.item || how === 'trade') return <li>{button}</li>
  return (
    <li className="flex flex-col gap-1.5">
      {button}
      <ItemSources itemKey={evo.item} onTravel={onTravel} />
    </li>
  )
}

/**
 * Its evolutions, both ways: what it evolves from and into (the branches this save may see), each a card that opens
 * that entry, a stone's sources folded under its card. Nothing when it neither evolves nor comes from anything.
 */
function Evolutions({
  dex,
  onOpenDex,
  onTravel,
}: {
  dex: number
  onOpenDex?: (dex: number) => void
  onTravel?: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const into = useVisibleEvolutions(data.species[dex]!)
  const from = useMemo(
    () =>
      data.speciesList.flatMap((s) => {
        const evo = s.evolutions.find((e) => e.toDex === dex)
        return evo ? [{ species: s, evo }] : []
      }),
    [data, dex],
  )
  if (!into.length && !from.length) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[22px] leading-none">{t('ui.dex.evolutions')}</h3>
      <ul className="grid gap-1.5">
        {from.map(({ species, evo }) => (
          <EvolutionStep
            key={`f-${species.dex}`}
            dex={species.dex}
            evo={evo}
            direction="from"
            from={species.dex}
            onOpenDex={onOpenDex}
            onTravel={onTravel}
          />
        ))}
        {into.map((e) => (
          <EvolutionStep
            key={`i-${e.toDex}-${e.item ?? e.level}`}
            dex={e.toDex}
            evo={e}
            direction="into"
            from={dex}
            onOpenDex={onOpenDex}
            onTravel={onTravel}
          />
        ))}
      </ul>
    </section>
  )
}

/** Where to find it: its areas, its raid days, or a word that nobody has seen it (unless it only comes by evolving). */
function WhereToFind({ dex, evolvesFrom, onTravel }: { dex: number; evolvesFrom: boolean; onTravel?: () => void }) {
  const { t } = useT()
  const { spots, travelHint } = useSpots(dex)
  const raid = useRaidRole(dex)
  // Evolved-only species: the Evolutions under it say where they come from.
  if (spots.length === 0 && !raid && evolvesFrom) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[22px] leading-none">{t('ui.dex.whereToFindHeading')}</h3>
      {spots.length > 0 && <SpotList spots={spots} onTravel={onTravel} />}
      {raid && (
        <ul className="grid gap-1.5">
          <RaidSpot dex={dex} onTravel={onTravel} />
        </ul>
      )}
      {spots.length === 0 && !raid && <p className="copy text-muted">{t('ui.dex.notSpotted')}</p>}
      {travelHint && <p className="font-pixel-sm text-[16px] text-muted">{t('ui.home.finishFirst')}</p>}
    </section>
  )
}

/**
 * The entry's hero: the sprite on the sky (a silhouette until caught), its types, its cry and the shiny star once
 * caught; uncaught, the one line saying what a catch reveals.
 */
function DexHero({ dex, caught, shiny }: { dex: number; caught: boolean; shiny?: boolean }) {
  const { t } = useT()
  const species = useGame((s) => s.data.species[dex])
  if (!species) return null
  const types = species.type2 ? [species.type1, species.type2] : [species.type1]
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-[104px] w-[112px] shrink-0 place-items-center bg-sky shadow-ring">
        {caught ? <SpriteImg dex={dex} size={96} shiny={shiny} /> : <MiniSprite dex={dex} size={64} silhouette />}
      </div>
      {caught ? (
        <div className="grid min-w-0 flex-1 justify-items-start gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {types.map((ty) => (
              <TypeBadge key={ty} type={ty} />
            ))}
            {shiny && (
              <Chip tone="gold">
                <PixelIcon name="star" size={12} /> {t('ui.mon.shinyTag')}
              </Chip>
            )}
          </div>
          <CryButton dex={dex} name={species.name} />
        </div>
      ) : (
        <p className="font-pixel-sm text-[18px] leading-tight text-muted">{t('ui.dex.catchToLearn')}</p>
      )}
    </div>
  )
}

/** The dice and stats stay open from one entry to the next once opened: a PC walking the grid compares them. */
let statsOpen = false

/**
 * A Pokédex entry (docs/43 §5.6): the hero, where to find it, its evolutions; once caught, its dice and stats folded
 * under them (open from the start with More details on).
 */
export function DexEntry({
  dex,
  shiny,
  onOpenDex,
  onTravel,
}: {
  dex: number
  /** From the shiny Pokédex (docs/39): its shiny colours, and the best shiny one owned if there's one. */
  shiny?: boolean
  onOpenDex?: (dex: number) => void
  onTravel?: () => void
}) {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const details = useDetails()
  const evolvesFrom = useMemo(
    () => data.speciesList.some((s) => s.evolutions.some((e) => e.toDex === dex)),
    [data, dex],
  )
  if (!save || !data.species[dex]) return null
  const caught = save.pokedex.includes(dex)
  const mine = save.box.filter((p) => p.dex === dex && (!shiny || p.shiny))
  const best = (mine.length ? mine : save.box.filter((p) => p.dex === dex)).sort((a, b) => b.level - a.level)[0]
  return (
    <div className="flex flex-col gap-4">
      <DexHero dex={dex} caught={caught} shiny={shiny} />
      <WhereToFind dex={dex} evolvesFrom={evolvesFrom} onTravel={onTravel} />
      <Evolutions dex={dex} onOpenDex={onOpenDex} onTravel={onTravel} />
      {caught && (
        <Fold
          summary={t('ui.dex.diceStats')}
          open={details || statsOpen}
          onToggle={(o) => (statsOpen = o)}
          testId="dex-details"
        >
          <PokemonSheet dex={dex} inst={best} shiny={shiny || undefined} onOpenDex={onOpenDex} hero={false} />
        </Fold>
      )}
    </div>
  )
}

/**
 * The Pokédex's entry as a sheet (docs/43 §5.6): from the bottom on a phone, docked beside the grid in a `SplitView`
 * on a PC. Named by the species once caught, by its number until then. `onBack` while an evolution's entry was opened
 * from another.
 */
export function DexSheet({
  dex,
  shiny,
  open,
  onClose,
  onOpenDex,
  onBack,
}: {
  dex: number
  shiny?: boolean
  open: boolean
  onClose: () => void
  onOpenDex: (dex: number) => void
  onBack?: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const caught = useGame((s) => !!s.save?.pokedex.includes(dex))
  const no = dexNo(nationalDex(data, dex))
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={caught ? (data.species[dex]?.name ?? no) : no}
      sub={caught ? no : t('ui.sheet.notCaughtYet')}
    >
      <div className="flex flex-col gap-3" data-dex-entry={dex} tabIndex={-1}>
        {onBack && (
          <button type="button" className="min-h-[44px] self-start text-[20px] underline" onClick={onBack}>
            {t('ui.sheet.backStack')}
          </button>
        )}
        <DexEntry key={dex} dex={dex} shiny={shiny} onOpenDex={onOpenDex} onTravel={onClose} />
      </div>
    </Sheet>
  )
}
