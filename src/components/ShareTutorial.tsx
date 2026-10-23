// Prof. Oak's "invite a friend" prompt: once per region, when the player holds its 2nd badge (between fights). INVITE
// shares the player's friend invite link (opening it makes the two of them friends, docs/16); signed out there is no
// friend ID, so it shares the game's own link. The native share sheet on phones, or a copied link where there is none
// (desktop). Remembered in localStorage. It takes its turn in the one-time pop-ups' queue (engine/popups.ts).
import { useEffect, useSyncExternalStore } from 'react'
import { invitesWait, regionOf } from '@/engine'
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
import { useMyTurn, useOnScreen } from './popupTurn'

const seenKey = (region: string) => `pokedice.sharePrompt.${region}`
/** Closed this visit, for a device that can't store it (private mode): it stays closed until the next one. */
const closedNow = new Set<string>()
const seen = (region: string) => {
  if (closedNow.has(region)) return true
  try {
    return localStorage.getItem(seenKey(region)) === '1'
  } catch {
    return true
  }
}

const seenListeners = new Set<() => void>()

/** The prompt was closed in the region being played, on this device: the queue's `shareSeen` (engine/popups.ts). */
export function useShareSeen(): boolean {
  const region = useGame((s) => (s.save ? regionOf(s.save) : null))
  return useSyncExternalStore(
    (l) => {
      seenListeners.add(l)
      return () => seenListeners.delete(l)
    },
    () => !region || seen(region),
    () => true,
  )
}

/**
 * INVITE's share: the friend invite link signed in, the game's own link signed out (no friend ID then). True once
 * shared or copied. The friend ID is fetched while `open`, not on the tap: a share sheet must open straight from the
 * tap that asked for it. Prof. Oak's invite and the Support me pop-up use it.
 */
export function useInviteShare(open: boolean): () => Promise<boolean> {
  const { t } = useT()
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const code = useFriends((s) => s.code)
  useEffect(() => {
    if (open && signedIn) void loadMyCode().catch(() => null)
  }, [open, signedIn])
  return () =>
    signedIn && code
      ? shareOrCopy(
          { title: 'Pokédice', text: t('ui.friends.shareText', { code: formatCode(code) }), url: inviteUrl(code) },
          t('ui.friends.linkCopied'),
        )
      : shareOrCopy({ title: 'Pokédice', text: t('ui.share.text'), url: window.location.origin }, t('ui.share.copied'))
}

export function ShareTutorial() {
  const { t } = useT()
  const region = useGame((s) => (s.save ? regionOf(s.save) : null))
  const open = useMyTurn('share') && !!region
  useOnScreen('share', open)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  // Invite rewards (docs/15 §25): the gauge, signed in; signed out, a line saying an account earns them.
  const gauge = useInviteGauge()
  const rewardsOn = useGame((s) => !!s.save && invitesWait(s.save, s.data) === null)
  const signedOut = useGame((s) => isSupabaseConfigured && s.auth.status === 'signed_out')
  const shareInvite = useInviteShare(open)
  useEffect(() => {
    if (open && signedIn) void loadInviteStatus()
  }, [open, signedIn])

  const close = () => {
    if (!region) return
    try {
      localStorage.setItem(seenKey(region), '1')
    } catch {
      /* private mode: may show again next visit */
    }
    closedNow.add(region)
    seenListeners.forEach((l) => l())
  }

  const share = async () => {
    // A cancelled share sheet keeps the pop-up.
    if (await shareInvite()) close()
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
