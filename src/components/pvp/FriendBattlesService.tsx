// Friend Battles' background work (docs/65), mounted with the game shell while the feature is open to the player and
// they're signed in: "I'm in the game" every minute (friends see Online now), the inbox topic (a challenge arriving),
// the match's topic and its once-a-second watch while one is live. And the banners (docs/15 §50): a challenge to
// answer — never over a fight, it waits for the fight's end — and, away from its page, the match still on.
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { friendBattlesFor, type PvpMode } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { TrainerLook } from '@/components/TrainerLook'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { isLive, type PvpPlayer } from '@/lib/pvp'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame, pushToast } from '@/store/game'
import { useInFight } from '@/store/hooks'
import { answer, foeOf, here, keepInbox, keepMatchTopic, loadHome, tick, usePvp } from '@/store/pvp'
import { ModeTag, TimeGauge, useSecondsLeft } from './FriendBattleBits'
import { challengeError } from './ChallengeSheet'
import { cx } from '@/theme/util'

const HERE_MS = 60_000

export function FriendBattlesService() {
  const userId = useGame((s) => (s.auth.status === 'signed_in' ? s.auth.userId : null))
  const open = useGame((s) => friendBattlesFor(s.save, s.data))
  const on = isSupabaseConfigured && !!userId && open
  const matchId = usePvp((s) => (s.match && isLive(s.match.state) ? s.match.id : null))
  const matchState = usePvp((s) => s.match?.state ?? null)

  // The inbox and "I'm here", while it's on for this player.
  useEffect(() => {
    void keepInbox(on ? userId : null)
    if (!on) return
    void here()
    void loadHome()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void here()
    }, HERE_MS)
    const back = () => {
      if (document.visibilityState === 'visible') {
        void here()
        void loadHome()
      }
    }
    document.addEventListener('visibilitychange', back)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', back)
    }
  }, [on, userId])
  useEffect(() => () => void keepInbox(null), [])

  // The match's topic and its watch.
  useEffect(() => {
    void keepMatchTopic()
    if (matchId == null) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [matchId, matchState])

  return on ? <Banners /> : null
}

function Banners() {
  const { t } = useT()
  const navigate = useNavigate()
  const path = useLocation().pathname
  const inFight = useInFight()
  const incoming = usePvp((s) => s.incoming)
  const match = usePvp((s) => s.match)
  const seconds = useSecondsLeft(incoming?.deadline ?? null)

  if (incoming && !inFight && seconds !== 0) {
    const from = incoming.a
    const accept = async () => {
      const code = await answer(true)
      if (code) pushToast(challengeError(t, code, from.name, incoming.mode), 'bad')
      else navigate('/battles/live')
    }
    return (
      <ChallengeCard
        from={from}
        mode={incoming.mode}
        seconds={seconds}
        total={incoming.cfg.expiry}
        onAccept={() => void accept()}
        onNo={() => void answer(false)}
        className="fixed inset-x-2.5 top-[calc(var(--top-bar,56px)+6px)] z-[80] mx-auto"
      />
    )
  }

  // A match on, away from its page: back to it (an outgoing challenge too).
  if (match && isLive(match.state) && path !== '/battles/live' && !inFight) {
    return (
      <MatchOnCard
        foe={foeOf(match)}
        waiting={match.state === 'invited'}
        onGo={() => navigate('/battles/live')}
        className="fixed inset-x-2.5 top-[calc(var(--top-bar,56px)+6px)] z-[80] mx-auto"
      />
    )
  }
  return null
}

/** A challenge to answer: who, the mode, the time left, NO and ACCEPT. */
export function ChallengeCard({
  from,
  mode,
  seconds,
  total,
  onAccept,
  onNo,
  className,
}: {
  from: PvpPlayer
  mode: PvpMode
  seconds: number | null
  total: number
  onAccept: () => void
  onNo: () => void
  className?: string
}) {
  const { t } = useT()
  return (
    <div
      role="alertdialog"
      aria-label={t('ui.pvp.challenged', { name: from.name })}
      className={cx(
        'grid max-w-md gap-2.5 bg-paper p-3 pb-3.5 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_4px_rgb(var(--c-sky-line)),0_6px_0_rgb(36_48_79/0.35)]',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-14 w-14 shrink-0 place-items-center bg-sky shadow-ring">
          <TrainerLook src={avatarOf(from.avatar).src} w={48} h={52} />
        </span>
        <span className="grid min-w-0 gap-1">
          <b className="text-[22px] font-normal leading-none">{t('ui.pvp.challenged', { name: from.name })}</b>
          <span className="flex items-center gap-1.5">
            <ModeTag mode={mode} />
            <span className="font-pixel-sm text-[16px] text-muted">{t('ui.pvp.chip.size')}</span>
          </span>
        </span>
      </div>
      <TimeGauge seconds={seconds} total={total} label={t('ui.pvp.toAnswer')} />
      <div className="flex gap-2">
        <PixelButton className="flex-1" onClick={onNo}>
          {t('ui.pvp.no')}
        </PixelButton>
        <PixelButton variant="primary" className="flex-[2]" onClick={onAccept}>
          {t('ui.pvp.accept')}
        </PixelButton>
      </div>
    </div>
  )
}

/** A match still on, away from its page: BACK TO IT. */
export function MatchOnCard({
  foe,
  waiting,
  onGo,
  className,
}: {
  foe: PvpPlayer
  waiting: boolean
  onGo: () => void
  className?: string
}) {
  const { t } = useT()
  return (
    <div
      className={cx(
        'flex max-w-md items-center gap-2 bg-paper p-2 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),0_4px_0_rgb(36_48_79/0.3)]',
        className,
      )}
    >
      <TrainerLook src={avatarOf(foe.avatar).src} w={36} h={40} />
      <span className="min-w-0 flex-1 truncate text-[18px] leading-tight">
        {waiting ? t('ui.pvp.waitingFor', { name: foe.name }) : t('ui.pvp.onWith', { name: foe.name })}
      </span>
      <PixelButton size="sm" variant="primary" onClick={onGo}>
        {t('ui.pvp.backTo')}
      </PixelButton>
    </div>
  )
}
