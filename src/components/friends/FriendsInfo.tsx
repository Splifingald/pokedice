// The Friends page's INFO (the user's call, 2026-11-01): the page opens on the list, with no notes on top; Prof. Oak's
// invite, the invite rewards' rules and friendship's rules wait here, behind the one INFO button at the page's foot.
import type { ReactNode } from 'react'
import { t } from '@/i18n'
import { useT } from '@/i18n/react'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { RuleList } from '@/components/RulesModal'
import { useFriendshipRules } from './Friendship'
import { useInviteRules } from './InviteRewards'

function Part({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      {title && <h3 className="m-0 text-[22px] font-normal leading-none">{title}</h3>}
      {children}
    </section>
  )
}

/** Inviting a friend, then the invite rewards' and friendship's rules while they're on for this player; OK closes. */
export function FriendsInfoModal({
  open,
  onClose,
  invites,
  friendship,
}: {
  open: boolean
  onClose: () => void
  /** The invite rewards are on for this player (their gauge shows). */
  invites: boolean
  /** Friendship streaks are on for this player (their card shows). */
  friendship: boolean
}) {
  useT()
  const inviteRules = useInviteRules()
  const fshipRules = useFriendshipRules()
  return (
    <Modal open={open} onClose={onClose} title={t('ui.friends.title')} className="max-w-md">
      <div className="flex flex-col gap-4">
        <Part>
          <RuleList rules={[{ icon: 'friends', title: t('ui.share.title'), text: t('ui.share.body') }]} />
        </Part>
        {invites && (
          <Part title={t('ui.invite.title')}>
            <RuleList rules={inviteRules} />
          </Part>
        )}
        {friendship && (
          <Part title={t('ui.fship.title')}>
            <RuleList rules={fshipRules} />
          </Part>
        )}
        <PixelButton variant="primary" onClick={onClose}>
          {t('ui.common.ok')}
        </PixelButton>
      </div>
    </Modal>
  )
}
