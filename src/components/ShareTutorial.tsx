// Prof. Oak's "invite a friend" prompt: once per region, when the player holds its 2nd badge (between fights). INVITE
// shares the player's friend invite link (opening it makes the two of them friends, docs/16); signed out there is no
// friend ID, so it shares the game's own link. The native share sheet on phones, or a copied link where there is none
// (desktop). Remembered in localStorage. The donation pop-up and a special event's unlock pop-up go first when they're
// waiting too.
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  badgeCase,
  dayCareTutorialDue,
  donationDue,
  eventUnlockDue,
  invitesWait,
  leaderboardTutorialDue,
  regionOf,
  versusRulesDue,
} from '@/engine'
import { useT } from '@/i18n/react'
import { formatCode, inviteUrl, loadInviteStatus, loadMyCode, useFriends } from '@/lib/friends'
import { shareOrCopy } from '@/lib/share'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { TrainerSprite } from '@/components/TrainerArt'
import { InviteGaugeCompact, useInviteGauge } from './friends/InviteRewards'

const seenKey = (region: string) => `pokedice.sharePrompt.${region}`
const seen = (region: string) => {
  try {
    return localStorage.getItem(seenKey(region)) === '1'
  } catch {
    return true
  }
}

const seenListeners = new Set<() => void>()

/**
 * The prompt is waiting in this region (its 2nd badge, not seen yet): the one-time pop-ups that come later (Trades'
 * rules) queue behind it, one pop-up at a time.
 */
export function useSharePromptWaiting(): boolean {
  const region = useGame((s) => (s.save ? regionOf(s.save) : null))
  const twoBadges = useGame((s) => !!s.save && badgeCase(s.save, s.data).filter((b) => b.earned).length >= 2)
  const done = useSyncExternalStore(
    (l) => {
      seenListeners.add(l)
      return () => seenListeners.delete(l)
    },
    () => !region || seen(region),
    () => true,
  )
  return twoBadges && !done
}

export function ShareTutorial() {
  const { t } = useT()
  const region = useGame((s) => (s.save ? regionOf(s.save) : null))
  const due = useGame(
    (s) =>
      !!s.save &&
      badgeCase(s.save, s.data).filter((b) => b.earned).length >= 2 &&
      !dayCareTutorialDue(s.save, s.data) &&
      !leaderboardTutorialDue(s.save, s.data) &&
      !donationDue(s.save, s.data) &&
      !eventUnlockDue(s.save, s.data) &&
      // Versus's rules pop-up goes first: one pop-up at a time.
      !versusRulesDue(s.save, s.data),
  )
  const idle = useGame((s) => s.run.phase === 'idle')
  const [closed, setClosed] = useState<string[]>([])
  const open = !!region && due && idle && !closed.includes(region) && !seen(region)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const code = useFriends((s) => s.code)
  // Invite rewards (docs/15 §25): the gauge, signed in; signed out, a line saying an account earns them.
  const gauge = useInviteGauge()
  const rewardsOn = useGame((s) => !!s.save && invitesWait(s.save, s.data) === null)
  const signedOut = useGame((s) => isSupabaseConfigured && s.auth.status === 'signed_out')
  // Fetched as the pop-up opens, not on the tap: a share sheet must open straight from the tap that asked for it.
  useEffect(() => {
    if (open && signedIn) {
      void loadMyCode().catch(() => null)
      void loadInviteStatus()
    }
  }, [open, signedIn])

  const close = () => {
    if (!region) return
    try {
      localStorage.setItem(seenKey(region), '1')
    } catch {
      /* private mode: may show again next visit */
    }
    setClosed((c) => [...c, region])
    seenListeners.forEach((l) => l())
  }

  const share = async () => {
    const invite = signedIn && code
    const shared = invite
      ? await shareOrCopy(
          { title: 'Pokédice', text: t('ui.friends.shareText', { code: formatCode(code) }), url: inviteUrl(code) },
          t('ui.friends.linkCopied'),
        )
      : await shareOrCopy({ title: 'Pokédice', text: t('ui.share.text'), url: window.location.origin }, t('ui.share.copied'))
    // A cancelled share sheet keeps the pop-up.
    if (shared) close()
  }

  return (
    <Modal open={open} onClose={close} title={t('ui.share.title')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <TrainerSprite src="/characters/prof-oak.png" alt={t('ui.newGame.oak')} size={64} className="shrink-0" />
          <p className="text-xl leading-snug">
            <b>{t('ui.oak.prefix')}</b> {t('ui.share.body')}
          </p>
        </div>
        {gauge ? (
          <InviteGaugeCompact gauge={gauge} />
        ) : (
          rewardsOn &&
          signedOut && (
            <p className="m-0 flex items-center gap-2 bg-gold-pale px-2.5 py-2 font-pixel-sm text-[16px] leading-tight text-ink shadow-card-gold">
              <PixelIcon name="gift" size={22} className="shrink-0" />
              {t('ui.invite.connectHint')}
            </p>
          )
        )}
        <div className="flex items-center justify-end gap-2">
          <PixelButton onClick={close}>{t('ui.share.later')}</PixelButton>
          <PixelButton variant="primary" size="lg" onClick={() => void share()}>
            {t('ui.share.button')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
