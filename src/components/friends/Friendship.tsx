// Friendship streaks and the Friend Market (docs/59; docs/15 §41). The pieces: the Festival Coins plate, a friend's
// streak badge (on their row), the streak's tiers, the Friends page's Friendship card, the streak on a friend's card,
// the market's shelf (the shiny of the week and the items) and the rules. They only show what the engine and the
// server decided; every state is on /kitchen-sink (FriendshipBits).
import type { ReactNode } from 'react'
import {
  friendshipNumbers,
  friendshipTiers,
  marketQtys,
  marketWhy,
  nextStreakDay,
  streakState,
  streakTier,
  type FriendStreak,
  type GameData,
  type MarketRow,
  type StreakState,
} from '@/engine'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PixelIcon } from '../icons'
import { ItemSprite } from '../ItemSprite'
import { PixelButton } from '../PixelButton'
import { RulesModal, type RuleRow } from '../RulesModal'
import { SmallInfo } from '../SmallInfo'
import { SpriteImg } from '../SpriteImg'
import { TrainerName } from '../TrainerName'

/** How many coins, as a navy plate (as the Mart's wallet is gold). */
export function CoinPlate({
  n,
  size = 'md',
  className,
}: {
  n: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { t } = useT()
  return (
    <span
      role="img"
      aria-label={t('ui.fship.coinsLabel', { n })}
      className={cx(
        'light-scope inline-flex shrink-0 items-center gap-1.5 bg-night leading-none text-panel',
        size === 'lg'
          ? 'px-3 pb-[7px] pt-[5px] text-[30px]'
          : size === 'sm'
            ? 'px-2 pb-[3px] pt-[2px] text-[18px]'
            : 'px-2.5 pb-[5px] pt-[3px] text-[20px]',
        className,
      )}
    >
      <PixelIcon name="fcoin" size={size === 'lg' ? 24 : size === 'sm' ? 14 : 18} />
      <span className="tabular-nums">{n.toLocaleString()}</span>
    </span>
  )
}

/** A coin price on a button: the coin, then the number. */
export function CoinPrice({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1 normal-case tabular-nums">
      <PixelIcon name="fcoin" size={16} />
      {n.toLocaleString()}
    </span>
  )
}

/**
 * A friend's streak on their row: a heart and its days. Kept today: rose with the check; waiting (one interaction today
 * keeps it): gold with a "!" — a shape each, never colour alone, and the state in words for screen readers.
 */
export function StreakBadge({ streak, state }: { streak: number; state: StreakState }) {
  const { t } = useT()
  if (state === 'lost' || streak < 1) return null
  return (
    <span
      role="img"
      aria-label={t(state === 'kept' ? 'ui.fship.badgeKept' : 'ui.fship.badgeWaiting', { n: streak })}
      title={t(state === 'kept' ? 'ui.fship.badgeKept' : 'ui.fship.badgeWaiting', { n: streak })}
      className={cx(
        'relative inline-flex h-[30px] shrink-0 items-center gap-1 px-1.5 text-[20px] leading-none',
        state === 'kept'
          ? 'bg-rose text-ink shadow-ring-line'
          : 'light-scope bg-gold text-ink shadow-ring-thin',
      )}
      data-streak={state}
    >
      <PixelIcon name="heart" size={16} />
      <span className="tabular-nums">{streak}</span>
      {state === 'kept' ? (
        <PixelIcon name="check" size={12} className="absolute -right-1.5 -top-1.5" />
      ) : (
        <i
          aria-hidden
          className="absolute -right-1.5 -top-2 grid h-[16px] w-[16px] place-items-center bg-accent font-pixel-sm text-[14px] not-italic leading-none text-white shadow-ring-thin"
        >
          !
        </i>
      )}
    </span>
  )
}

/** The tiers' names, in order (five by default; a sixth tier the admin adds takes the last name). */
export function useTierName() {
  const { t } = useT()
  return (level: number) => (level < 0 ? t('ui.fship.tier.none') : t(`ui.fship.tier.${Math.min(4, level)}`))
}

/** The tiers as a ladder: each its days and coins, the one reached ringed in gold with its name said. */
export function StreakLadder({ streak, data }: { streak: number; data: GameData }) {
  const { t } = useT()
  const tiers = friendshipTiers(data)
  const at = streakTier(streak, data).level
  const name = useTierName()
  return (
    <ol
      className="m-0 grid list-none gap-1 p-0"
      style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}
    >
      {tiers.map((tier, i) => {
        const end = tiers[i + 1] ? tiers[i + 1]!.from - 1 : null
        const days =
          end == null
            ? t('ui.fship.daysFrom', { a: tier.from })
            : t('ui.fship.daysRange', { a: tier.from, b: end })
        const here = i === at
        return (
          <li
            key={tier.from}
            aria-current={here || undefined}
            aria-label={`${name(i)}: ${days}, ${t('ui.fship.perDay', { n: tier.coins })}`}
            className={cx(
              'grid min-w-0 justify-items-center gap-0.5 px-0.5 pb-1 pt-1.5 text-center',
              here
                ? 'light-scope bg-gold text-ink shadow-ring'
                : i < at
                  ? 'bg-rose shadow-ring-line'
                  : 'bg-well shadow-ring-line',
            )}
          >
            <span className="flex items-center gap-0.5 text-[20px] leading-none">
              <PixelIcon name="fcoin" size={14} />+{tier.coins}
            </span>
            <span aria-hidden className="w-full truncate font-pixel-sm text-[16px] leading-none tabular-nums">
              {end == null ? `${tier.from}+` : `${tier.from}–${end}`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Today's coins toward the day's cap, as a gauge. */
export function CapGauge({ earned, cap }: { earned: number; cap: number }) {
  const { t } = useT()
  const pct = cap > 0 ? Math.min(100, (earned / cap) * 100) : 0
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between font-pixel-sm text-[16px] leading-none">
        <span>{t('ui.fship.today')}</span>
        <span className="tabular-nums">{t('ui.fship.todayOf', { n: earned, cap })}</span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={earned}
        aria-label={t('ui.fship.todayLabel', { n: earned, cap })}
        className="h-[12px] bg-night shadow-ring-thin"
      >
        <div className="h-full bg-[#ff6f9c]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** A friend as the Friendship card names them. */
export interface StreakFriend {
  userId: string
  name: string
  rich?: boolean
}

/**
 * The Friends page's Friendship card: the coins, today's gauge, the streaks waiting for today (one interaction keeps
 * each, and what it would pay), the market, and INFO. `status` null: loading, or `failed`.
 */
export function FriendshipCard({
  balance,
  earned,
  streaks,
  friends,
  today,
  onMarket,
  onInfo,
  state = 'ready',
}: {
  balance: number
  earned: number
  streaks: FriendStreak[]
  friends: StreakFriend[]
  today: string
  onMarket: () => void
  onInfo: () => void
  state?: 'loading' | 'ready' | 'error'
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { cap } = friendshipNumbers(data)
  const named = (id: string) => friends.find((f) => f.userId === id)
  const alive = streaks.filter((s) => streakState(s, today) !== 'lost' && named(s.friend))
  const waiting = alive.filter((s) => streakState(s, today) === 'waiting').sort((a, b) => b.streak - a.streak)
  const kept = alive.filter((s) => streakState(s, today) === 'kept').length
  return (
    <section
      aria-labelledby="fship-title"
      className="grid gap-2.5 bg-[linear-gradient(rgb(var(--c-rose)),rgb(var(--c-paper))_75%)] p-2.5 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_5px_#ff6f9c,inset_0_0_0_7px_rgb(var(--c-edge))]"
      data-testid="friendship-card"
    >
      <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
        <PixelIcon name="heart" size={22} />
        <h2 id="fship-title" className="m-0 mr-auto text-[24px] font-normal leading-none">
          {t('ui.fship.title')}
        </h2>
        <CoinPlate n={balance} />
      </div>
      {state === 'loading' && <p className="m-0 px-1 text-[18px] text-muted">{t('ui.common.loading')}</p>}
      {state === 'error' && <p className="m-0 px-1 text-[18px] text-danger">{t('ui.fship.failed')}</p>}
      {state === 'ready' && (
        <>
          <div className="px-1">
            <CapGauge earned={earned} cap={cap} />
          </div>
          {alive.length === 0 ? (
            <p className="copy m-0 px-1 text-[18px] leading-[1.2]">{t('ui.fship.none')}</p>
          ) : (
            <>
              <p className="m-0 px-1 font-pixel-sm text-[16px] leading-tight text-muted">
                {t('ui.fship.counts', { kept, all: alive.length })}
              </p>
              {waiting.length > 0 && (
                <ul className="m-0 grid list-none gap-1 p-0" aria-label={t('ui.fship.waitingTitle')}>
                  {waiting.slice(0, 3).map((s) => {
                    const f = named(s.friend)!
                    const next = nextStreakDay(s, today, data)
                    return (
                      <li
                        key={s.friend}
                        className="flex min-h-[44px] items-center gap-2 bg-paper px-2 py-1 shadow-ring-line"
                      >
                        <StreakBadge streak={s.streak} state="waiting" />
                        <span className="min-w-0 flex-1 truncate text-[19px] leading-none">
                          <TrainerName name={f.name} rich={f.rich} />
                        </span>
                        {next && (
                          <span className="shrink-0 font-pixel-sm text-[16px] leading-none">
                            {t('ui.fship.keepFor', { n: next.coins })}
                          </span>
                        )}
                      </li>
                    )
                  })}
                  {waiting.length > 3 && (
                    <li className="px-1 font-pixel-sm text-[16px] text-muted">
                      {t('ui.fship.moreWaiting', { n: waiting.length - 3 })}
                    </li>
                  )}
                </ul>
              )}
            </>
          )}
          <p className="m-0 px-1 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.fship.how')}</p>
        </>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <PixelButton variant="dark" className="min-w-0" onClick={onMarket} data-testid="open-market">
          <PixelIcon name="navShop" size={20} />
          {t('ui.market.title')}
        </PixelButton>
        <SmallInfo name={t('ui.fship.title')} onClick={onInfo} />
      </div>
    </section>
  )
}

/** The streak on a friend's card: its days and tier, the best, what the next day pays, and how to keep it. */
export function FriendStreakBlock({
  s,
  today,
  name,
}: {
  s: FriendStreak | undefined
  today: string
  name: string
}) {
  const { t } = useT()
  const data = useGame((st) => st.data)
  const tierName = useTierName()
  const state = streakState(s, today)
  const streak = state === 'lost' ? 0 : (s?.streak ?? 0)
  const tier = streakTier(streak, data)
  const next = nextStreakDay(s, today, data)
  return (
    <section
      aria-label={t('ui.fship.title')}
      className="grid gap-2 bg-rose p-2.5 shadow-ring-line"
      data-testid="friend-streak"
    >
      <div className="flex items-center gap-2">
        <PixelIcon name="heart" size={22} />
        <b className="text-[22px] font-normal leading-none">
          {streak > 0 ? t('ui.fship.streakDays', { n: streak }) : t('ui.fship.noStreak')}
        </b>
        {streak > 0 && (
          <span className="ml-auto font-pixel-sm text-[16px] leading-none">{tierName(tier.level)}</span>
        )}
      </div>
      <StreakLadder streak={streak} data={data} />
      <p className="m-0 font-pixel-sm text-[16px] leading-tight">
        {state === 'kept'
          ? tier.next
            ? t('ui.fship.keptNext', { n: tier.toNext, coins: tier.next.coins })
            : t('ui.fship.keptTop')
          : next
            ? t(state === 'waiting' ? 'ui.fship.waitingLine' : 'ui.fship.startLine', {
                name,
                coins: next.coins,
              })
            : null}
        {s && s.best > streak && <> {t('ui.fship.best', { n: s.best })}</>}
      </p>
    </section>
  )
}

/** The rules' rows, with the config's numbers. */
export function useFriendshipRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { tiers, cap } = friendshipNumbers(data)
  const ladder = tiers
    .map((x, i) => {
      const end = tiers[i + 1] ? tiers[i + 1]!.from - 1 : null
      return `${end == null ? t('ui.fship.daysFrom', { a: x.from }) : t('ui.fship.daysRange', { a: x.from, b: end })}: +${x.coins}`
    })
    .join(' · ')
  return [
    { icon: 'trade', title: t('ui.rules.fship.streak.title'), text: t('ui.rules.fship.streak.text') },
    {
      icon: 'fcoin',
      title: t('ui.rules.fship.coins.title'),
      text: t('ui.rules.fship.coins.text', { ladder, cap }),
    },
    { icon: 'calendar', title: t('ui.rules.fship.miss.title'), text: t('ui.rules.fship.miss.text') },
    { icon: 'navShop', title: t('ui.rules.fship.market.title'), text: t('ui.rules.fship.market.text') },
  ]
}

/** INFO: the rules again, with OK. Its banner: two friends' hearts and the coin, drawn in code. */
export function FriendshipRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = useFriendshipRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.fship.title')}
      icon="heart"
      picture={<FriendshipBanner />}
      rules={rules}
    />
  )
}

/** The rules' banner: a rose band, the coin between two hearts. */
export function FriendshipBanner() {
  return (
    <div
      className="absolute inset-0 grid place-items-center bg-[linear-gradient(#ffb3c9,#ff6f9c)]"
      aria-hidden
    >
      <span className="flex items-center gap-4">
        <PixelIcon name="heart" size={44} />
        <PixelIcon name="fcoin" size={72} />
        <PixelIcon name="heart" size={44} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- the market's shelf

const WHY_KEY = { soldOut: 'ui.market.soldOut', tooPoor: 'ui.market.tooPoor' } as const

/** The buttons under a row: ×1, ×5, ×10 within what's left, each its total; sold out or short, they say why. */
function BuyButtons({
  row,
  balance,
  busy,
  onBuy,
}: {
  row: MarketRow
  balance: number
  busy: boolean
  onBuy: (qty: number) => void
}) {
  const { t } = useT()
  const qtys = row.left > 0 ? marketQtys(row) : [1]
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${qtys.length}, minmax(0, 1fr))` }}>
      {qtys.map((q) => {
        const why = marketWhy(row, balance, q)
        const label = row.kind === 'pokemon' ? t('ui.market.buy') : `×${q}`
        return (
          <PixelButton
            key={q}
            size="sm"
            variant={why ? 'secondary' : q === 1 ? 'dark' : 'secondary'}
            className="min-w-0"
            shut={
              why === 'soldOut'
                ? t(WHY_KEY.soldOut)
                : why
                  ? t(WHY_KEY.tooPoor, { n: row.price * q - balance })
                  : busy
                    ? t('ui.market.busy')
                    : null
            }
            aria-label={t('ui.market.buyLabel', { qty: q, price: row.price * q })}
            onClick={() => onBuy(q)}
          >
            {label} <CoinPrice n={row.price * q} />
          </PixelButton>
        )
      })}
    </div>
  )
}

/** "3 of 10 left this week", or SOLD OUT. */
function LeftLine({ row }: { row: MarketRow }) {
  const { t } = useT()
  return row.left > 0 ? (
    <span className="font-pixel-sm text-[16px] leading-none text-muted">
      {t('ui.market.left', { n: row.left, of: row.limit })}
    </span>
  ) : (
    <span className="justify-self-start bg-ink px-1.5 py-0.5 font-pixel-sm text-tag uppercase leading-none text-panel">
      {t('ui.market.soldOut')}
    </span>
  )
}

/** The shiny of the week: big, its sprite shining, its name, level and price. */
export function MarketShinyCard({
  row,
  balance,
  busy,
  onBuy,
  restock,
}: {
  row: MarketRow
  balance: number
  busy: boolean
  onBuy: (qty: number) => void
  /** "Next one in 3d 4h". */
  restock: string
}) {
  const { t } = useT()
  const species = useGame((s) => (row.dex ? s.data.species[row.dex] : undefined))
  return (
    <section
      aria-labelledby="market-shiny"
      className="light-scope grid gap-2 bg-[linear-gradient(#fff4d6,#ffffff_70%)] p-2.5 text-ink shadow-card-gold"
      data-testid="market-shiny"
    >
      <div className="flex items-center gap-2">
        <span className="bg-gold px-1.5 py-0.5 font-pixel-sm text-tag uppercase leading-none shadow-ring-thin">
          {t('ui.market.shinyTag')}
        </span>
        <span className="ml-auto font-pixel-sm text-[16px] leading-none">{restock}</span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={cx(
            'relative grid h-[128px] w-[128px] shrink-0 place-items-center bg-sky shadow-ring-line',
            row.left === 0 && 'opacity-60',
          )}
        >
          {row.dex && <SpriteImg dex={row.dex} size={128} shiny alt="" />}
          <PixelIcon name="sparkle" size={18} className="absolute right-1 top-1" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id="market-shiny" className="m-0 truncate text-[26px] font-normal leading-none">
            {species?.name ?? `#${row.dex}`}
          </h2>
          <span className="font-pixel-sm text-[16px] leading-tight">
            {t('ui.market.shinyLine', { level: row.level ?? 15 })}
          </span>
          <LeftLine row={row} />
        </div>
      </div>
      <BuyButtons row={row} balance={balance} busy={busy} onBuy={onBuy} />
    </section>
  )
}

/** An item on the shelf: its picture, name, what it does, what's left this week, and its buttons. */
export function MarketItemCard({
  row,
  balance,
  busy,
  onBuy,
}: {
  row: MarketRow
  balance: number
  busy: boolean
  onBuy: (qty: number) => void
}) {
  const item = useGame((s) => s.data.items[row.key])
  return (
    <li
      className={cx('grid gap-2 p-2.5', row.left > 0 ? 'bg-paper shadow-card' : 'bg-well shadow-ring-line')}
      data-testid={`market-${row.key}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center bg-well shadow-ring-line">
          <ItemSprite item={item} size={44} />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <b className="truncate text-[22px] font-normal leading-none">{item?.name ?? row.key}</b>
          <span className="font-pixel-sm text-[16px] leading-tight text-muted">{item?.description}</span>
          <LeftLine row={row} />
        </div>
      </div>
      <BuyButtons row={row} balance={balance} busy={busy} onBuy={onBuy} />
    </li>
  )
}

/** The market's plate: the coins, and when the shelf turns over. */
export function MarketHead({
  balance,
  restock,
  children,
}: {
  balance: number
  restock: string
  children?: ReactNode
}) {
  const { t } = useT()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CoinPlate n={balance} size="lg" />
      <span className="grid gap-0.5 leading-none">
        <span className="font-pixel-sm text-[16px] text-muted">{t('ui.market.restock')}</span>
        <b className="text-[20px] font-normal">{restock}</b>
      </span>
      {children}
    </div>
  )
}
