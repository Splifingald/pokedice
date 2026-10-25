// Friend invite rewards (docs/15 §25): the gauge (at the top of the Friends page, in Prof. Oak's invite pop-up and in the
// reward's own pop-up), its rules (once, the first time on the Friends page, then INFO at its bottom), and the
// pop-up that says a reward is ready. Every number — the tiers, the fill, what each one holds — is the engine's
// (engine/invites.ts); the opening is the developer's gifts' own (GiftMoment).
import {
  inviteGauge,
  inviteTiers,
  invitesWait,
  type Gift,
  type InviteGauge,
  type InviteGaugeTier,
} from '@/engine'
import { useT } from '@/i18n/react'
import { useFriends } from '@/lib/friends'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { useGiftMoment } from '@/store/gifts'
import { openInviteRewards, putOffInviteRewards, useInviteRewards } from '@/store/invites'
import { useCloudSync } from '@/store/sync'
import { cx } from '@/theme/util'
import { GiftIcon, useGiftText } from '../Gifts'
import { PixelIcon } from '../icons'
import { Modal } from '../Modal'
import { PixelButton } from '../PixelButton'
import { useMyTurn, useOnScreen } from '../popupTurn'
import { RulesModal, type RuleRow } from '../RulesModal'
import { FriendPreview } from './FriendBits'

/**
 * The player's invite gauge, or null where the rewards don't exist for them: the switch off, signed out, the Extreme
 * save or a small world (rewards are the main game's), or before the server has answered.
 */
export function useInviteGauge(): InviteGauge | null {
  const data = useGame((s) => s.data)
  const here = useGame(
    (s) =>
      isSupabaseConfigured &&
      s.auth.status === 'signed_in' &&
      !!s.save &&
      invitesWait(s.save, s.data) === null,
  )
  const status = useFriends((s) =>
    s.userId && s.userId === useGame.getState().auth.userId ? s.invites : null,
  )
  return here && status ? inviteGauge(status, data) : null
}

/** A tier's reward in a few words: "Rare Candy", "Ultra Ball ×5", "₽1,000", "Ditto Lv.10 ✦ Shiny", and "+2" more. */
export function useRewardText() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const giftText = useGiftText()
  const one = (g: Gift) =>
    g.kind === 'item' && g.qty === 1 ? (data.items[g.key]?.name ?? g.key) : giftText(g)
  return (gifts: readonly Gift[]) =>
    gifts.length > 1
      ? t('ui.invite.andMore', { reward: one(gifts[0]!), n: gifts.length - 1 })
      : gifts[0]
        ? one(gifts[0])
        : ''
}

/** One stop's tile: the reward's picture (or the gift, wobbling, once it's ready), a check once opened. */
function TierTile({ tier, size }: { tier: InviteGaugeTier; size: number }) {
  const first = tier.gifts[0]!
  return (
    <span
      className={cx(
        'relative grid shrink-0 place-items-center',
        tier.state === 'ready'
          ? 'light-scope bg-gold shadow-card'
          : tier.state === 'claimed'
            ? 'bg-good-pale shadow-ring-line'
            : 'bg-well-deep shadow-ring-line',
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {tier.state === 'ready' ? (
        <PixelIcon name="gift" size={Math.round(size * 0.66)} className="egg-shake" />
      ) : (
        <span className={cx(tier.state === 'claimed' && 'opacity-70')}>
          <GiftIcon g={first} size={Math.round(size * 0.7)} />
        </span>
      )}
      {first.kind === 'pokemon' && first.shiny && tier.state !== 'ready' && (
        <PixelIcon name="sparkle" size={12} className="absolute left-0.5 top-0.5" />
      )}
      {tier.gifts.length > 1 && (
        <span className="absolute bottom-0 left-0 bg-paper px-0.5 font-pixel-sm text-[12px] leading-none text-ink shadow-ring-line">
          +{tier.gifts.length - 1}
        </span>
      )}
      {tier.state === 'claimed' && (
        <span className="absolute -top-2 right-0 grid h-[18px] w-[18px] place-items-center bg-paper shadow-ring-line">
          <PixelIcon name="check" size={12} />
        </span>
      )}
    </span>
  )
}

/**
 * The gauge: one stop per tier (its reward over the end of its stretch of track), the track filling in gold, and how
 * many friends each stop needs under it. The tiles are a list for screen readers; the track is a meter.
 */
export function InviteGaugeBar({ gauge, compact = false }: { gauge: InviteGauge; compact?: boolean }) {
  const { t, tPlural } = useT()
  const reward = useRewardText()
  const n = gauge.tiers.length
  if (!n) return null
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }
  // Past four stops they share less room: a phone still fits six.
  const size = (compact ? 40 : 48) - (n > 4 ? 8 : 0)
  return (
    <div className="grid gap-1.5" data-testid="invite-gauge">
      <ol className="m-0 grid list-none gap-0 p-0" style={cols} aria-label={t('ui.invite.tiersLabel')}>
        {gauge.tiers.map((tier) => (
          <li
            key={tier.friends}
            className="flex justify-end pt-2"
            aria-label={`${tPlural('ui.invite.friends', tier.friends, { n: tier.friends })}: ${reward(tier.gifts)}. ${t(`ui.invite.state.${tier.state}`)}`}
          >
            <TierTile tier={tier} size={size} />
          </li>
        ))}
      </ol>
      <div
        role="meter"
        aria-label={t('ui.invite.title')}
        aria-valuemin={0}
        aria-valuemax={gauge.goal}
        aria-valuenow={Math.min(gauge.count, gauge.goal)}
        aria-valuetext={t('ui.invite.meter', { n: gauge.count, goal: gauge.goal })}
        className="relative h-[14px] bg-night p-[3px] shadow-[inset_0_0_0_2px_rgb(var(--c-edge))]"
      >
        <div
          className="h-full bg-gold transition-[width] duration-700 ease-out"
          style={{ width: `${gauge.fill * 100}%` }}
        />
        {gauge.tiers.slice(0, -1).map((tier, i) => (
          <span
            key={tier.friends}
            aria-hidden
            className="absolute bottom-0 top-0 w-[2px] bg-edge"
            style={{ left: `calc(${((i + 1) / n) * 100}% - 1px)` }}
          />
        ))}
      </div>
      <div className="grid font-pixel-sm text-[14px] leading-none text-muted" style={cols} aria-hidden>
        {gauge.tiers.map((tier) => (
          <span key={tier.friends} className="flex items-center justify-end gap-1 tabular-nums">
            <PixelIcon name="friends" size={12} />
            {tier.friends}
          </span>
        ))}
      </div>
    </div>
  )
}

/** What the gauge says under it: a reward ready, how many more friends the next one needs, or that all are won. */
function useGaugeLine() {
  const { t, tPlural } = useT()
  const reward = useRewardText()
  return (gauge: InviteGauge) =>
    gauge.ready.length
      ? tPlural('ui.invite.ready', gauge.ready.length, { n: gauge.ready.length })
      : gauge.next
        ? tPlural('ui.invite.next', gauge.toNext, { n: gauge.toNext, reward: reward(gauge.next.gifts) })
        : t('ui.invite.allDone')
}

/**
 * The Friends page's block, above everything: the gauge, the line under it (with OPEN IT once a reward is ready), the
 * invited friends still on their way, and how a friend counts.
 */
export function InviteRewardsCard({
  gauge,
  onOpen,
  busy,
}: {
  gauge: InviteGauge
  onOpen?: () => void
  busy?: boolean
}) {
  const { t, tPlural } = useT()
  const line = useGaugeLine()
  const ready = gauge.ready.length > 0
  return (
    <section
      aria-labelledby="invite-rewards-title"
      className={cx(
        'grid gap-2.5 px-3 pb-3 pt-2.5',
        ready ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
      )}
    >
      <h2
        id="invite-rewards-title"
        className="m-0 flex items-center gap-2 text-[22px] font-normal leading-none"
      >
        <PixelIcon name="gift" size={22} />
        <span className="min-w-0 flex-1">{t('ui.invite.title')}</span>
        <span className="font-pixel-sm text-[17px] tabular-nums text-muted">
          {Math.min(gauge.count, gauge.goal)}/{gauge.goal}
        </span>
      </h2>
      <InviteGaugeBar gauge={gauge} />
      <div className="flex min-h-[44px] items-center gap-2">
        <p className="m-0 min-w-0 flex-1 text-[19px] leading-[1.15]" aria-live="polite">
          {line(gauge)}
        </p>
        {ready && onOpen && (
          <PixelButton size="sm" variant="gold" disabled={busy} onClick={onOpen}>
            {t('ui.gift.openIt')}
          </PixelButton>
        )}
      </div>
      {gauge.pending > 0 && (
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-ink">
          {tPlural('ui.invite.pending', gauge.pending, { n: gauge.pending })}
        </p>
      )}
      <p className="m-0 font-pixel-sm text-[15px] leading-tight text-muted">{t('ui.invite.how')}</p>
    </section>
  )
}

/** The gauge as Prof. Oak's invite pop-up shows it: the gauge and its line, compact. */
export function InviteGaugeCompact({ gauge }: { gauge: InviteGauge }) {
  const { t } = useT()
  const line = useGaugeLine()
  return (
    <div className="grid gap-2 bg-paper px-2.5 pb-2.5 pt-2 shadow-ring-line">
      <p className="m-0 flex items-center gap-1.5 text-[19px] leading-none">
        <PixelIcon name="gift" size={18} />
        <span className="min-w-0 flex-1">{t('ui.invite.title')}</span>
        <span className="font-pixel-sm text-[15px] tabular-nums text-muted">
          {Math.min(gauge.count, gauge.goal)}/{gauge.goal}
        </span>
      </p>
      <InviteGaugeBar gauge={gauge} compact />
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-ink">{line(gauge)}</p>
    </div>
  )
}

/** The rules pop-up's banner, drawn in code: friends, a badge and the gift on the night strip. */
function InviteBanner() {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-3 bg-night pb-3" aria-hidden>
      <PixelIcon name="friends" size={52} className="mb-2" />
      <PixelIcon name="badge" size={36} className="mb-5" />
      <PixelIcon name="gift" size={84} className="-mb-1" />
      <PixelIcon name="sparkle" size={18} className="mb-16" />
    </div>
  )
}

export function useInviteRules(): RuleRow[] {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const reward = useRewardText()
  const list = inviteTiers(data)
    .map((tier) => `${tier.friends} → ${reward(tier.gifts)}`)
    .join(' · ')
  return [
    { icon: 'friends', title: t('ui.rules.inv.link.title'), text: t('ui.rules.inv.link.text') },
    { icon: 'badge', title: t('ui.rules.inv.badge.title'), text: t('ui.rules.inv.badge.text') },
    { icon: 'gift', title: t('ui.rules.inv.tiers.title'), text: list },
    { icon: 'star', title: t('ui.rules.inv.open.title'), text: t('ui.rules.inv.open.text') },
  ]
}

/** The rewards' rules, on the Friends page: once the first time in, then from INFO (OK). */
export function InviteRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.invite.title')}
      picture={<InviteBanner />}
      icon="gift"
      rules={useInviteRules()}
      onGo={onGo}
    />
  )
}

/** A reward is waiting to pop up (one ready, not put off this visit): the queue's `inviteReward` (engine/popups.ts). */
export function useInviteRewardWaiting(): boolean {
  const ready = useInviteGauge()?.ready.length ?? 0
  const putOff = useInviteRewards((s) => s.putOff)
  return ready > 0 && !putOff
}

/**
 * A reward is ready (an invited friend won their first badge): between fights, on its turn in the one-time pop-ups'
 * queue (engine/popups.ts: right after the rewards' rules), who did it, the gauge, and OPEN THE GIFT, which plays the
 * gifts' opening. Later keeps it on the Friends page until the next visit.
 */
export function InviteRewardPopup() {
  const gauge = useInviteGauge()
  const latest = useFriends((s) => s.invites?.latest ?? null)
  const turn = useMyTurn('inviteReward')
  const busy = useInviteRewards((s) => s.busy)
  const gifts = useGiftMoment((s) => s.busy || !!s.rulesFor || !!s.opening)
  // Opened once the sign-in's sync has settled, so the cloud copy can't replace what the gifts went into.
  const synced = useCloudSync((s) => s.settled)
  const open = turn && !!gauge && !gifts && synced
  useOnScreen('inviteReward', open)
  if (!gauge || !gauge.ready.length) return null
  return (
    <InviteReadyModal
      open={open}
      gauge={gauge}
      latest={latest}
      busy={busy}
      onLater={putOffInviteRewards}
      onOpen={() => void openInviteRewards()}
    />
  )
}

/** The reward's pop-up itself: who won their first badge, the gauge, Later and OPEN THE GIFT. */
export function InviteReadyModal({
  open,
  gauge,
  latest,
  busy,
  onLater,
  onOpen,
}: {
  open: boolean
  gauge: InviteGauge
  latest: { name: string; avatar: string } | null
  busy?: boolean
  onLater: () => void
  onOpen: () => void
}) {
  const { t, tPlural } = useT()
  return (
    <Modal open={open} onClose={onLater} title={t('ui.invite.readyTitle')}>
      <div className="flex flex-col gap-3">
        {latest && <FriendPreview name={latest.name} avatar={latest.avatar} />}
        <p className="copy m-0">
          {latest ? t('ui.invite.readyBody', { name: latest.name }) : t('ui.invite.readyBodyAnon')}
        </p>
        <InviteGaugeCompact gauge={gauge} />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2.5 pt-1">
          <PixelButton onClick={onLater}>{t('ui.events.later')}</PixelButton>
          <PixelButton variant="primary" disabled={busy} onClick={onOpen}>
            {tPlural('ui.gift.open', Math.max(1, gauge.ready.length))}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
