// Prof. Oak's "invite a friend" note: once per region, when the player holds its 2nd badge, a card on Home (docs/43 §7:
// no longer a pop-up). INVITE shares the player's friend invite link (opening it makes the two of them friends,
// docs/16); signed out there is no friend ID, so it shares the game's own link. The native share sheet on phones, or a
// copied link where there is none (desktop). Remembered in localStorage, per region (engine/popups.ts `homeNotices`).
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { invitesWait, regionOf } from '@/engine'
import { useT } from '@/i18n/react'
import { formatCode, inviteUrl, loadInviteStatus, loadMyCode, useFriends } from '@/lib/friends'
import { shareOrCopy } from '@/lib/share'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { PixelIcon } from './icons'
import { NoticeCard, OakFace } from './NoticeCard'
import { PixelButton } from './PixelButton'
import { InviteGaugeCompact, useInviteGauge } from './friends/InviteRewards'

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

/** The note was closed in the region being played, on this device: `shareSeen` for `homeNotices`. */
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
          {
            title: 'Pokédice',
            text: t('ui.friends.shareText', { code: formatCode(code) }),
            url: inviteUrl(code),
          },
          t('ui.friends.linkCopied'),
        )
      : shareOrCopy(
          { title: 'Pokédice', text: t('ui.share.text'), url: window.location.origin },
          t('ui.share.copied'),
        )
}

/**
 * Prof. Oak's invite on Home: his line, the invite rewards' gauge (signed in) or what an account would earn, and INVITE.
 * ✕ puts it away for this region; a share that went through does too (a cancelled one keeps it).
 */
export function ShareNotice() {
  const region = useGame((s) => (s.save ? regionOf(s.save) : null))
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  // Invite rewards (docs/15 §25): the gauge, signed in; signed out, a line saying an account earns them.
  const gauge = useInviteGauge()
  const rewardsOn = useGame((s) => !!s.save && invitesWait(s.save, s.data) === null)
  const signedOut = useGame((s) => isSupabaseConfigured && s.auth.status === 'signed_out')
  const shareInvite = useInviteShare(true)
  useEffect(() => {
    if (signedIn) void loadInviteStatus()
  }, [signedIn])

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
    if (await shareInvite()) close()
  }
  return (
    <ShareNoticeView
      onClose={close}
      onShare={() => void share()}
      extra={gauge ? <InviteGaugeCompact gauge={gauge} /> : rewardsOn && signedOut ? <ConnectHint /> : null}
    />
  )
}

/** "An account earns invite rewards": the line in place of the gauge while signed out. */
export function ConnectHint() {
  const { t } = useT()
  return (
    <p className="m-0 flex items-center gap-2 bg-gold-pale px-2.5 py-2 font-pixel-sm text-[16px] leading-tight text-ink shadow-card-gold">
      <PixelIcon name="gift" size={22} className="shrink-0" />
      {t('ui.invite.connectHint')}
    </p>
  )
}

/** The note itself (the kitchen sink shows it without the friends service). */
export function ShareNoticeView({
  onClose,
  onShare,
  extra,
}: {
  onClose: () => void
  onShare: () => void
  extra?: ReactNode
}) {
  const { t } = useT()
  return (
    <NoticeCard
      tone="oak"
      picture={<OakFace />}
      title={t('ui.share.title')}
      onClose={onClose}
      testId="share-notice"
      action={
        <PixelButton size="sm" onClick={onShare}>
          <PixelIcon name="friends" size={18} className="shrink-0" />
          {t('ui.share.button')}
        </PixelButton>
      }
    >
      <b className="font-normal">{t('ui.oak.prefix')}</b> {t('ui.share.body')}
      {extra && <div className="mt-2">{extra}</div>}
    </NoticeCard>
  )
}
