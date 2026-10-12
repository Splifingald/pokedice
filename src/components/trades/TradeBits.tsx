// Trades' small parts (docs/23 §2), shared by the page, the sheets, a friend's card and the kitchen sink: what a
// listing wants as a tile, who can see it, the time it has left, one row of the board, and why a listing can't be
// taken, in words. The engine decides every rule; these only say it.
import type { ReactNode } from 'react'
import {
  homeRegionOf,
  newForTrade,
  regionName,
  takeBlock,
  type ListBlock,
  type MinReason,
  type TradeVisibility,
  type TradeWant,
} from '@/engine'
import { useT } from '@/i18n/react'
import { timeLeft } from '@/lib/format'
import { useFriends } from '@/lib/friends'
import { tradeError, type TradeListing } from '@/lib/trades'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { Chip, NewTag, type ChipTone } from '../Chip'
import { FriendTag } from '../friends/FriendBits'
import { PixelIcon } from '../icons'
import type { RulesPicture } from '../RulesModal'
import { MiniSprite } from '../SpriteImg'

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

/** "Charmander", "any I don't own" or "anything", in a sentence. */
export function useWantWords() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (want: TradeWant, owner?: string) =>
    want.kind === 'species'
      ? (data.species[want.dex]?.name ?? t('ui.common.pokemon'))
      : want.kind === 'notOwned'
        ? owner
          ? t('ui.trades.want.notOwnedBy', { name: owner })
          : t('ui.trades.want.notOwned')
        : t('ui.trades.want.any')
}

/** What a listing wants, as a tile: the species' icon and name, or a NEW / ANY tile. `owner`: whose want it is. */
export function WantTile({ want, owner, big }: { want: TradeWant; owner?: string; big?: boolean }) {
  const { t } = useT()
  const words = useWantWords()
  const pic =
    want.kind === 'species' ? (
      <MiniSprite dex={want.dex} size={big ? 40 : 32} className={big ? '-my-1' : '-my-1.5'} />
    ) : (
      <span
        aria-hidden
        className={cx(
          'grid shrink-0 place-items-center font-pixel-sm leading-none shadow-ring-line',
          big ? 'h-10 w-12 text-[15px]' : 'h-8 w-10 text-[13px]',
          want.kind === 'notOwned' ? 'bg-gold text-ink' : 'bg-well text-ink',
        )}
      >
        {want.kind === 'notOwned' ? t('ui.common.new') : t('ui.trades.want.anyTile')}
      </span>
    )
  return (
    <span className={cx('flex min-w-0 items-center gap-1', big ? 'text-[20px]' : 'text-[16px]')}>
      {pic}
      <b className="min-w-0 truncate font-normal leading-none">{words(want, owner)}</b>
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
      <span className="whitespace-nowrap font-pixel-sm text-[15px] text-muted">
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

/** What the server (or the network) said no with, in a sentence. */
export function useTradeErrorText() {
  const { t } = useT()
  return (err: unknown) => t(`ui.trades.error.${tradeError(err)}`)
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
      want: words(l.want, l.isMe ? undefined : l.name),
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
              {fresh && <NewTag className="shrink-0" />}
            </b>
            <small className="flex min-w-0 items-center gap-1 font-pixel-sm text-[14px] leading-tight text-muted">
              <RegionTag dex={l.dex} />
              {l.isMe ? (
                <span className="shrink-0 bg-gold px-[5px] pb-px text-[13px] leading-tight text-ink">
                  {t('ui.trades.yoursTag')}
                </span>
              ) : (
                <span className="truncate">{owner}</span>
              )}
              {l.isFriend && !l.isMe && <FriendTag />}
            </small>
          </span>
        </span>
        <span className="flex max-w-[42vw] items-center gap-1.5 sm:max-w-[240px]" aria-hidden>
          <span className="font-pixel-sm text-[13px] text-muted">{t('ui.trades.for')}</span>
          <WantTile want={l.want} owner={l.isMe ? undefined : l.name} />
        </span>
        {/* Why (or "You can trade") on the left, the time left on the right: the trainer's name keeps its room. */}
        <span
          aria-hidden
          className="col-span-2 flex items-baseline gap-2 font-pixel-sm text-[14px] leading-tight"
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
