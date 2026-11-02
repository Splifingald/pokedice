// Friend Battles' small pieces (docs/65; docs/15 §50): the countdown to a step's deadline (a gauge and the seconds),
// the mode's tag, the two trainers face to face, and the rules (the page's card, INFO's pop-up).
import { useEffect, useState } from 'react'
import { friendBattlesConfig, type PvpMode } from '@/engine'
import { PixelIcon } from '@/components/icons'
import { RulesModal, type RuleRow } from '@/components/RulesModal'
import { TrainerLook } from '@/components/TrainerLook'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import type { PvpPlayer } from '@/lib/pvp'
import { useGame } from '@/store/game'
import { serverNow } from '@/store/pvp'
import { cx } from '@/theme/util'

/** Seconds left to `deadline` (the server's clock), ticking. */
export function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (deadline == null) return
    const id = setInterval(() => setNow(serverNow()), 250)
    return () => clearInterval(id)
  }, [deadline])
  return deadline == null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** A dark chip with the seconds left: red text under 10. */
export function TimeChip({ seconds, className }: { seconds: number | null; className?: string }) {
  const { t } = useT()
  if (seconds == null) return null
  return (
    <span
      className={cx(
        'light-scope inline-flex shrink-0 items-center gap-1 bg-night px-2 py-0.5 font-pixel-sm text-[18px] tabular-nums leading-none',
        seconds <= 10 ? 'text-danger-light' : 'text-gold-light',
        className,
      )}
      role="timer"
      aria-label={t('ui.pvp.secondsLeft', { n: seconds })}
    >
      <PixelIcon name="clock" size={14} />
      {clock(seconds)}
    </span>
  )
}

/** The step's time as a gauge (full at `total` seconds) with the seconds under it. */
export function TimeGauge({ seconds, total, label }: { seconds: number | null; total: number; label?: string }) {
  if (seconds == null) return null
  const pct = Math.max(0, Math.min(100, (seconds / Math.max(1, total)) * 100))
  return (
    <div className="grid w-full gap-1">
      <div className="relative h-2.5 bg-night shadow-ring-thin" aria-hidden>
        <span className={cx('absolute inset-y-0 left-0', seconds <= 10 ? 'bg-accent' : 'bg-[#5fa8f0]')} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between font-pixel-sm text-[16px] leading-none text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{clock(seconds)}</span>
      </div>
    </div>
  )
}

/** Seconds since the other player's game last called, ticking (null when unknown). */
export function useAwaySeconds(seen: number | null): number | null {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(id)
  }, [])
  return seen == null ? null : Math.max(0, Math.floor((now - seen) / 1000))
}

/** After this long without a word from the other game, it says so. */
export const AWAY_NOTICE_S = 30

/** The other player lost connection: if they're not back by the grace's end, you win (docs/65). */
export function DropNotice({ name, left, total, className }: { name: string; left: number; total: number; className?: string }) {
  const { t } = useT()
  return (
    <div
      role="status"
      className={cx(
        'grid gap-1.5 bg-paper p-2.5 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_4px_rgb(var(--c-sky-line))]',
        className,
      )}
    >
      <b className="text-[20px] font-normal leading-none">{t('ui.pvp.drop.title', { name })}</b>
      <span className="font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.pvp.drop.text', { name })}</span>
      <TimeGauge seconds={left} total={total} label={t('ui.pvp.drop.wait')} />
    </div>
  )
}

/** CLASSIC (blue) or DRAFT (gold). */
export function ModeTag({ mode, className }: { mode: PvpMode; className?: string }) {
  const { t } = useT()
  return (
    <span
      className={cx(
        'light-scope pixel-corners inline-flex shrink-0 items-center px-1.5 py-px font-pixel-sm text-[14px] uppercase leading-none tracking-[0.04em]',
        mode === 'draft' ? 'bg-gold text-ink' : 'bg-[#2f6bc4] text-white',
        className,
      )}
    >
      {t(mode === 'draft' ? 'ui.pvp.mode.draft' : 'ui.pvp.mode.classic')}
    </span>
  )
}

/** A trainer's look, big, with their name under it. */
export function TrainerBadge({ player, label, dim, size = 88 }: { player: PvpPlayer; label?: string; dim?: boolean; size?: number }) {
  return (
    <span className="grid justify-items-center gap-1">
      <span className="grid place-items-center bg-sky shadow-ring" style={{ width: size, height: size }}>
        <TrainerLook
          src={avatarOf(player.avatar).src}
          w={size - 8}
          h={size - 4}
          className={cx(dim && 'opacity-60 grayscale')}
        />
      </span>
      <span className="max-w-[120px] truncate text-[20px] leading-none">{label ?? player.name}</span>
    </span>
  )
}

/** Two trainers face to face, VS between. */
export function VsRow({ me, foe, foeDim }: { me: PvpPlayer; foe: PvpPlayer; foeDim?: boolean }) {
  const { t } = useT()
  return (
    <div className="flex items-center justify-center gap-4">
      <TrainerBadge player={me} label={t('ui.pvp.you')} />
      <span
        aria-hidden
        className="font-pixel text-[44px] leading-none text-accent [-webkit-text-stroke:2px_rgb(var(--c-edge))]"
      >
        VS
      </span>
      <TrainerBadge player={foe} dim={foeDim} />
    </div>
  )
}

/** The rules: the page's card the first time, INFO's pop-up after (docs/15 §20). */
export function useFriendBattleRules(): RuleRow[] {
  const { t } = useT()
  const cfg = friendBattlesConfig(useGame((s) => s.data))
  return [
    { icon: 'vs', title: t('ui.rules.pvp.challenge.title'), text: t('ui.rules.pvp.challenge.text', { n: Math.round(cfg.expiry / 60) || 1 }) },
    { icon: 'dice', title: t('ui.rules.pvp.modes.title'), text: t('ui.rules.pvp.modes.text') },
    { icon: 'shield', title: t('ui.rules.pvp.shield.title'), text: t('ui.rules.pvp.shield.text', { pct: 100 - cfg.shield }) },
    { icon: 'clock', title: t('ui.rules.pvp.turn.title', { n: cfg.turn }), text: t('ui.rules.pvp.turn.text') },
  ]
}

export function FriendBattleRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const rules = useFriendBattleRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.pvp.title')}
      icon="vs"
      picture={<FriendBattleBanner />}
      rules={rules}
    />
  )
}

/** The rules' banner: two Poké Balls facing off on a sky band, VS between them. */
export function FriendBattleBanner() {
  const ball = (
    <span className="relative block h-14 w-14 rounded-full bg-[linear-gradient(#f2553f_0_45%,#24304f_45%_55%,#fff_55%)] shadow-[0_0_0_3px_#24304f]">
      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_#24304f]" />
    </span>
  )
  return (
    <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(#bfe0ff,#7fb6ef)]" aria-hidden>
      <span className="flex items-center gap-5">
        {ball}
        <span className="font-pixel text-[40px] leading-none text-accent [-webkit-text-stroke:2px_#24304f]">VS</span>
        {ball}
      </span>
    </div>
  )
}
