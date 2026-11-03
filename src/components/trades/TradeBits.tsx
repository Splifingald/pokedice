// Trades' small parts (docs/23 §2), shared by the page, the sheets, a friend's card and the kitchen sink: what a
// listing wants as a tile, who can see it, the time it has left, one row of the board, why a listing can't be taken,
// in words, and the pick of the Box a traded Pokémon goes to. The engine decides every rule; these only say it.
import type { ReactNode } from 'react'
import {
  homeRegionOf,
  newForTrade,
  regionName,
  takeBlock,
  type LandingOption,
  type ListBlock,
  type MinReason,
  type RegionId,
  type TradeVisibility,
  type TradeWant,
} from '@/engine'
import { useT } from '@/i18n/react'
import { timeLeft } from '@/lib/format'
import { useFriends } from '@/lib/friends'
import { offlineOr } from '@/lib/online'
import { tradeError, type TradeListing } from '@/lib/trades'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { Chip, NewTag, type ChipTone } from '../Chip'
import { FriendTag } from '../friends/FriendBits'
import { PixelIcon } from '../icons'
import { PixelButton } from '../PixelButton'
import type { RulesPicture } from '../RulesModal'
import { MiniSprite } from '../SpriteImg'
import { TrainerName } from '../TrainerName'
import { DexTalentGem } from '../Talent'

/** The rules pop-up's banner: trades happen at the Pokémon Center, as in the games' Cable Club. */
export const TRADES_PICTURE: RulesPicture = { src: '/backgrounds/pokemon-center.png', focus: '50% 40%' }

const VIS_TONE: Record<TradeVisibility, ChipTone> = { public: 'blue', friends: 'green', private: 'dark' }

/** Public / Friends / Private (link). */
export function VisChip({ visibility, className }: { visibility: TradeVisibility; className?: string }) {
  const { t } = useT()
  return (
    <Chip tone={VIS_TONE[visibility]} className={className}>
      {t(`ui.trades.vis.${visibility}`)}
    </Chip>
  )
}

/** A shiny's star, with its name for screen readers. */
export function ShinyStar() {
  const { t } = useT()
  return <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />
}

/** "Charmander", "Any New" (one they don't own) or "Any": what a listing wants, as its tag and its label say it. */
export function useWantWords() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (want: TradeWant) =>
    want.kind === 'species'
      ? (data.species[want.dex]?.name ?? t('ui.common.pokemon'))
      : want.kind === 'notOwned'
        ? t('ui.trades.want.anyNew')
        : t('ui.trades.want.anyShort')
}

/** What a listing wants: the species' icon and name, or one tag, gold "Any New" or plain "Any". */
export function WantTile({ want, big }: { want: TradeWant; big?: boolean }) {
  const words = useWantWords()
  if (want.kind !== 'species')
    return (
      <span
        className={cx(
          // Its own width, in a grid cell too (the listing's sheet).
          'shrink-0 justify-self-start whitespace-nowrap font-normal leading-none shadow-ring-line',
          big ? 'px-2.5 pb-2 pt-1.5 text-[20px]' : 'px-2 pb-1.5 pt-1 text-[16px]',
          want.kind === 'notOwned' ? 'bg-gold text-ink' : 'bg-paper text-ink',
        )}
      >
        {words(want)}
      </span>
    )
  return (
    <span className={cx('flex min-w-0 items-center gap-1', big ? 'text-[20px]' : 'text-[16px]')}>
      <MiniSprite dex={want.dex} size={big ? 40 : 32} className={big ? '-my-1' : '-my-1.5'} />
      <b className="min-w-0 truncate font-normal leading-none">{words(want)}</b>
      {/* "With its hidden talent" (docs/51). */}
      {want.talent && <DexTalentGem dex={want.dex} />}
    </span>
  )
}

/** The time a listing has left, and a thin bar of it (red in its last 6 hours). */
export function TimeLeft({
  endsAt,
  days,
  now = Date.now(),
  prefix,
  className,
}: {
  endsAt: number
  /** The listing's whole life, in days (the admin's number): the bar's full width. */
  days: number
  now?: number
  /** "Ends in": the words before the time, when they're wanted. */
  prefix?: boolean
  className?: string
}) {
  const { t } = useT()
  const left = Math.max(0, endsAt - now)
  const k = Math.min(1, left / (Math.max(1, days) * 86_400_000))
  const hot = left < 6 * 3_600_000
  return (
    <span className={cx('flex items-center gap-2', className)}>
      <span className="whitespace-nowrap font-pixel-sm text-[16px] text-muted">
        {prefix ? t('ui.trades.endsIn', { time: timeLeft(left) }) : timeLeft(left)}
      </span>
      <span className="relative block h-1.5 min-w-[40px] flex-1 bg-line shadow-ring-line-thin" aria-hidden>
        <i
          className={cx('absolute inset-y-0 left-0 block', hot ? 'bg-crimson' : 'bg-type-water')}
          style={{ width: `${k * 100}%` }}
        />
      </span>
    </span>
  )
}

/**
 * Why this listing can't be taken from this save, in words, or null when it can: sign in, it's yours, friends only,
 * its region not started, the day's trades used, nothing of yours matching.
 */
export function useTakeWhy() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const friends = useFriends((s) => s.ids)
  return (l: TradeListing, now = Date.now()): string | null => {
    if (!signedIn) return t('ui.trades.why.signIn')
    if (l.isMe) return t('ui.trades.why.yours')
    if (l.visibility === 'friends' && !l.isFriend && !(l.owner && friends.has(l.owner)))
      return t('ui.trades.why.friendsOnly', { name: l.name })
    if (!save) return t('ui.trades.why.nothing')
    const why = takeBlock(save, data, l, now)
    if (why === 'region') {
      const home = homeRegionOf(data, l.dex)
      return t('ui.trades.why.region', { region: home ? regionName(data, home) : '' })
    }
    if (why === 'daily_cap') return t('ui.trades.why.dailyCap')
    if (why === 'no_match')
      return l.want.kind === 'species'
        ? t('ui.trades.why.noSpecies', { name: data.species[l.want.dex]?.name ?? t('ui.common.pokemon') })
        : l.want.kind === 'notOwned'
          ? t('ui.trades.why.hasAll', { name: l.name })
          : t('ui.trades.why.nothing')
    return null
  }
}

/** Why a species can't arrive lower than its minimum: "Squirtle evolves at Lv.16", "met at Lv.3 in Viridian Forest". */
export function useMinWhy() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const name = (dex: number) => data.species[dex]?.name ?? t('ui.common.pokemon')
  return (r: MinReason): string => {
    if (r.kind === 'evolves')
      return t('ui.trades.min.evolves', {
        name: name(r.from),
        level: t('ui.common.level.short', { n: r.level }),
      })
    if (r.kind === 'wild')
      return t('ui.trades.min.wild', {
        area: data.areas.find((a) => a.id === r.areaId)?.name ?? '',
        level: t('ui.common.level.short', { n: r.level }),
      })
    if (r.kind === 'via')
      return t(r.how === 'trade' ? 'ui.trades.min.viaTrade' : 'ui.trades.min.viaItem', { name: name(r.from) })
    return t('ui.trades.min.base')
  }
}

/** What the server (or the network) said no with, in a sentence; "You're offline" when there's no connection. */
export function useTradeErrorText() {
  const { t } = useT()
  return (err: unknown) => offlineOr(t(`ui.trades.error.${tradeError(err)}`))
}

/** Why one of your Pokémon can't be listed or given: legendary, reviving, your last, the other side's region. */
export function useBlockText() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (why: ListBlock, dex: number, owner?: string): string => {
    if (why === 'region') {
      const home = homeRegionOf(data, dex)
      return t('ui.trades.block.region', { name: owner ?? '', region: home ? regionName(data, home) : '' })
    }
    return t(`ui.trades.block.${why}`)
  }
}

/** The listed Pokémon's region, when it isn't the first one: it lands in that Box. */
export function RegionTag({ dex }: { dex: number }) {
  const data = useGame((s) => s.data)
  const home = homeRegionOf(data, dex)
  if (!home || home === data.regions[0]?.id) return null
  return (
    <Chip tone="lock" className="shrink-0">
      {regionName(data, home)}
    </Chip>
  )
}

/**
 * One listing on the board (or a friend's card): the Pokémon on the left (name, shiny star, NEW when it's not in your
 * Pokédex, its region, who, the time left), what they want on the right, and under it why you can't take it, or "You
 * can trade". Friends' rows are sky blue, yours gold. The whole row opens the listing.
 */
export function ListingRow({
  listing: l,
  why,
  onOpen,
  guest,
  now = Date.now(),
}: {
  listing: TradeListing
  why: string | null
  onOpen: () => void
  /** For a guest: no "why" line (the page asks them to connect). */
  guest?: boolean
  now?: number
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const words = useWantWords()
  const name = data.species[l.dex]?.name ?? t('ui.common.pokemon')
  const fresh = !l.isMe && !!save && newForTrade(save, data, l.dex)
  const owner = l.isMe ? t('ui.trades.you') : l.name || t('ui.friends.someone')
  const ok = !why
  const label = [
    t('ui.trades.rowLabel', {
      mon: `${name}${l.shiny ? `, ${t('ui.mon.shiny')}` : ''}`,
      level: t('ui.common.level.short', { n: l.level }),
      who: owner,
      want: words(l.want),
      time: timeLeft(l.endsAt - now),
    }),
    fresh ? t('ui.trades.newForYou') : '',
    l.isMe || guest ? '' : (why ?? t('ui.trades.canTrade')),
  ]
    .filter(Boolean)
    .join('. ')
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        className={cx(
          'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 pb-1.5 pl-1.5 pr-2.5 pt-1 text-left',
          l.isMe
            ? 'bg-gold-pale shadow-card-gold'
            : l.isFriend
              ? 'bg-sky pl-2.5 shadow-[inset_5px_0_0_#5b8def,inset_0_0_0_2px_#5b8def]'
              : !ok && !guest
                ? 'bg-well shadow-ring-line'
                : 'bg-paper shadow-ring-line',
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <MiniSprite dex={l.dex} size={40} className="-my-1 shrink-0" />
          <span className="grid min-w-0 gap-0.5">
            <b className="flex min-w-0 items-center gap-1 text-[19px] font-normal leading-none">
              <span className="truncate">{name}</span>
              {l.shiny && <ShinyStar />}
              {l.talent && <DexTalentGem dex={l.dex} />}
              {fresh && <NewTag className="shrink-0" />}
            </b>
            <small className="flex min-w-0 items-center gap-1 font-pixel-sm text-[16px] leading-tight text-muted">
              <RegionTag dex={l.dex} />
              {l.isMe ? (
                <span className="shrink-0 bg-gold px-[5px] pb-px text-[16px] leading-tight text-ink">
                  {t('ui.trades.yoursTag')}
                </span>
              ) : (
                <TrainerName name={owner} rich={l.rich} className="truncate" />
              )}
              {l.isFriend && !l.isMe && <FriendTag />}
            </small>
          </span>
        </span>
        <span className="flex max-w-[42vw] items-center gap-1.5 sm:max-w-[240px]" aria-hidden>
          <span className="font-pixel-sm text-[16px] text-muted">{t('ui.trades.for')}</span>
          <WantTile want={l.want} />
        </span>
        {/* Why (or "You can trade") on the left, the time left on the right: the trainer's name keeps its room. */}
        <span
          aria-hidden
          className="col-span-2 flex items-baseline gap-2 font-pixel-sm text-[16px] leading-tight"
        >
          {!guest && !l.isMe && (
            <span className={cx('min-w-0 flex-1', ok ? 'text-good' : 'text-ink')}>
              {ok ? t('ui.trades.canTrade') : why}
            </span>
          )}
          <span className="ml-auto shrink-0 text-muted">{timeLeft(l.endsAt - now)}</span>
        </span>
      </button>
    </li>
  )
}

/**
 * NEW PICKS under the board's picks (docs/23 §2.1): the day's left on it ("2/2 today"); greyed with a line when every
 * listing you can take is already shown, and "New picks tomorrow" once the day's are used.
 */
export function NewPicksButton({
  left,
  max,
  more,
  busy,
  onClick,
}: {
  /** NEW PICKS left today, of `max` a day. */
  left: number
  max: number
  /** Other listings you can take than the ones shown. */
  more: boolean
  busy?: boolean
  onClick: () => void
}) {
  const { t } = useT()
  return (
    <div className="grid gap-1.5">
      <PixelButton size="sm" className="w-full" disabled={!left || !more || busy} onClick={onClick}>
        <PixelIcon name="dice" size={16} />
        {left
          ? `${t('ui.trades.newPicks')} · ${t('ui.trades.today', { n: left, max })}`
          : t('ui.trades.picksTomorrow')}
      </PixelButton>
      {!more && !!left && (
        <p className="m-0 text-center font-pixel-sm text-[16px] leading-[1.15] text-muted">
          {t('ui.trades.picksAll')}
        </p>
      )}
    </div>
  )
}

/** A heading over a list, with its count ("Done 3"). */
export function ListHead({ id, children, count }: { id?: string; children: ReactNode; count?: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 id={id} className="m-0 text-[24px] font-normal leading-none">
        {children}
      </h2>
      {count != null && <span className="font-pixel-sm text-[16px] text-muted">{count}</span>}
    </div>
  )
}

/**
 * The pick of the Box a traded Pokémon goes to, when more than one region you've started lists it in its Pokédex
 * (docs/23 §1.4): a radio row per region, its name and what happens there (it joins, NEW, STRONGER, nothing gained),
 * or, above your best there, that it waits locked until one of yours reaches its level. On the confirm (a taker) and
 * on the scene's last step (a listing of yours taken while you were away).
 */
export function LandingPick({
  name,
  level,
  options,
  value,
  onChange,
  disabled,
}: {
  /** The Pokémon arriving (its nickname, or what it evolved into). */
  name: string
  /** The level it arrives at: the one it waits for where it's locked. */
  level: number
  /** `level` on an option: it arrives at a level of its own there (a Day Care hatchling: docs/15), shown by its name. */
  options: (LandingOption & { level?: number })[]
  value: RegionId | null
  onChange: (region: RegionId) => void
  disabled?: boolean
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const lv = (n: number) => t('ui.common.level.short', { n })
  const line = (o: LandingOption) =>
    o.outcome === 'locked'
      ? t('ui.trades.land.locked', { level: lv(level), best: lv(o.best) })
      : o.outcome === 'merged' && o.mine != null
        ? t('ui.trades.pick.nothingGained', { level: lv(o.mine) })
        : o.outcome === 'replaced' && o.mine != null
          ? t('ui.trades.land.replaces', { level: lv(o.mine) })
          : t('ui.trades.land.joins')
  return (
    <div role="radiogroup" aria-label={t('ui.trades.land.label', { name })} className="grid gap-1.5">
      {options.map((o) => {
        const on = o.region === value
        return (
          <button
            key={o.region}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.region)}
            data-testid={`landing-${o.region}`}
            className={cx(
              'flex min-h-[52px] w-full items-center gap-2 py-1.5 pl-2 pr-2.5 text-left',
              on ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-ring-line hover:shadow-ring',
            )}
          >
            {/* The radio's dot: filled when it's the one picked. */}
            <span className="grid size-4 shrink-0 place-items-center bg-paper shadow-ring" aria-hidden>
              {on && <i className="block size-2 bg-ink" />}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <b className="truncate text-[19px] font-normal leading-none">{regionName(data, o.region)}</b>
                {o.level != null && (
                  <span className="shrink-0 font-pixel-sm text-[16px] leading-none text-muted">
                    {lv(o.level)}
                  </span>
                )}
              </span>
              <small className="font-pixel-sm text-[16px] leading-tight text-muted">{line(o)}</small>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              {o.outcome === 'locked' ? (
                <Chip tone="lock">
                  <PixelIcon name="lock" size={12} />
                  {t('ui.map.locked')}
                </Chip>
              ) : (
                <>
                  {o.isNew && <NewTag />}
                  {o.outcome === 'replaced' && <Chip tone="green">{t('ui.trades.stronger')}</Chip>}
                  {o.outcome === 'shiny' && <Chip tone="gold">{t('ui.trades.shinyTag')}</Chip>}
                </>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
