// ADD FRIENDS' pop-up (the user's call, 2026-11-07): everything about making friends in one place, out of the Friends
// page's way — the invite rewards on top, your friend ID with COPY, adding someone's ID, resetting yours (rare, and it
// breaks every link already shared: quiet), and SHARE INVITE LINK, the pop-up's one red action, pinned at its foot.
import { useState } from 'react'
import { useT } from '@/i18n/react'
import { formatCode, friendError, inviteUrl, resetMyCode, useFriends, type FriendNotice } from '@/lib/friends'
import { copyText, shareOrCopy } from '@/lib/share'
import { pushToast } from '@/store/game'
import { openInviteRewards, useInviteRewards } from '@/store/invites'
import { Modal } from '../Modal'
import { PixelButton } from '../PixelButton'
import { Sheet } from '../Sheet'
import { AddFriendForm, useAddText } from './AddFriendModal'
import { InviteRewardsCard, useInviteGauge } from './InviteRewards'

export function AddFriendsSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  /** A friend just added: the page opens their card. */
  onAdded?: (friend: FriendNotice) => void
}) {
  const { t } = useT()
  const errorText = useAddText()
  const code = useFriends((s) => s.code)
  // Invite rewards (docs/15 §25), while they're on for this player.
  const gauge = useInviteGauge()
  const rewardsBusy = useInviteRewards((s) => s.busy)
  const [resetting, setResetting] = useState(false)

  const share = () => {
    if (!code) return
    void shareOrCopy(
      { title: 'Pokédice', text: t('ui.friends.shareText', { code: formatCode(code) }), url: inviteUrl(code) },
      t('ui.friends.linkCopied'),
    )
  }

  const reset = async () => {
    try {
      const fresh = await resetMyCode()
      pushToast(t('ui.friends.resetDone', { code: formatCode(fresh) }), 'good')
      setResetting(false)
    } catch (err) {
      const why = friendError(err)
      pushToast(why === 'reset_too_soon' ? t('ui.friends.resetTooSoon') : errorText(why), 'bad')
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={t('ui.friends.addFriends')}
        footer={
          <PixelButton variant="primary" size="lg" className="w-full" disabled={!code} onClick={share}>
            {t('ui.friends.share')}
          </PixelButton>
        }
      >
        <div className="flex flex-col gap-3" data-testid="add-friends">
          {gauge && (
            <InviteRewardsCard gauge={gauge} busy={rewardsBusy} onOpen={() => void openInviteRewards()} />
          )}
          <section
            aria-label={t('ui.friends.yourId')}
            className="grid gap-2 bg-[linear-gradient(rgb(var(--c-sky)),rgb(var(--c-paper))_70%)] p-2.5 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_5px_#5b8def,inset_0_0_0_7px_rgb(var(--c-edge))]"
          >
            <span className="px-1 pt-1 font-pixel-sm text-[16px] uppercase tracking-[0.06em] text-[#2f5fb8] dark:text-[#8fb4ff]">
              {t('ui.friends.yourId')}
            </span>
            <div className="flex items-center gap-2 px-1 pb-1">
              <b
                className="min-w-0 flex-1 text-[30px] font-normal tabular-nums leading-none tracking-[0.08em]"
                data-testid="friend-code"
              >
                {code ? formatCode(code) : '····-····'}
              </b>
              <PixelButton
                size="sm"
                disabled={!code}
                aria-label={t('ui.friends.copyLabel')}
                onClick={() => code && void copyText(formatCode(code), t('ui.friends.copied'), t('ui.friends.copyFailed'))}
              >
                {t('ui.friends.copy')}
              </PixelButton>
            </div>
          </section>
          <AddFriendForm
            onAdded={(f) => {
              onClose()
              onAdded?.(f)
            }}
          />
          <div className="flex justify-center">
            <PixelButton size="sm" variant="ghost" disabled={!code} onClick={() => setResetting(true)}>
              {t('ui.friends.reset')}
            </PixelButton>
          </div>
        </div>
      </Sheet>
      <Modal open={resetting} onClose={() => setResetting(false)} title={t('ui.friends.resetTitle')}>
        <p className="copy mb-4 text-lg">{t('ui.friends.resetBody')}</p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setResetting(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton variant="danger" onClick={() => void reset()}>
            {t('ui.friends.reset')}
          </PixelButton>
        </div>
      </Modal>
    </>
  )
}

/**
 * ADD FRIENDS, the Friends page's one red action. While an invite reward waits in its pop-up, a gold count says so
 * (the reward lives there now, not on the page), and the button's name reads it out.
 */
export function AddFriendsButton({
  onClick,
  size,
  className,
  readyCount,
}: {
  onClick: () => void
  size?: 'sm'
  className?: string
  /** The kitchen sink's stand-in for the player's ready rewards. */
  readyCount?: number
}) {
  const { t, tPlural } = useT()
  const gaugeReady = useInviteGauge()?.ready.length ?? 0
  const ready = readyCount ?? gaugeReady
  return (
    <PixelButton
      variant="primary"
      size={size}
      className={className}
      onClick={onClick}
      aria-label={
        ready > 0
          ? `${t('ui.friends.addFriends')}, ${tPlural('ui.invite.ready', ready, { n: ready })}`
          : t('ui.friends.addFriends')
      }
      data-testid="add-friends-open"
    >
      {t('ui.friends.addFriends')}
      {ready > 0 && (
        <span
          aria-hidden
          className="light-scope grid h-[22px] min-w-[22px] place-items-center bg-gold px-1 font-pixel-sm text-[16px] leading-none text-ink shadow-ring-thin"
        >
          {ready}
        </span>
      )}
    </PixelButton>
  )
}

