// "Support me": the developer's three asks, as a rules pop-up (docs/15 §17): join the Discord (the one that matters
// most), invite friends, and support the developer on Ko-fi, under a line saying why the game itself can never be
// paid for (Pokémon is a licence). The side menu's and Settings' SUPPORT ME open it whenever the admin has it switched
// on with a Ko-fi link (engine/donation). It also shows once per region when its 5th badge is won, between fights, on its
// turn in the one-time pop-ups' queue (engine/popups.ts: after Prof. Oak's tutorials and the developer's answers).
import { discordUrl, donationEnabled, donationUrl } from '@/engine'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { useInbox } from '@/lib/feedback'
import { isSupabaseConfigured } from '@/lib/supabase'
import { closeDonation } from '@/store/actions'
import { useGame } from '@/store/game'
import { useCloudSync } from '@/store/sync'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useMyTurn, useOnScreen } from './popupTurn'
import { RuleList, RulesBanner, type RuleRow, type RulesPicture } from './RulesModal'
import { useInviteShare } from './ShareTutorial'

/** A village under the morning sun: the players' community. */
export const SUPPORT_PICTURE: RulesPicture = { src: artUrl('village'), focus: '50% 58%' }

export function DonationPopup() {
  const turn = useMyTurn('donation')
  // A reload starts on the build's content, before the sign-in, the cloud save and the developer's answers are in: any
  // of them can still take the pop-up away (the admin's settings, a region seen on another device, an answer first), so
  // it waits for them rather than show and vanish.
  const status = useGame((s) => s.auth.status)
  const contentIn = useGame((s) => s.contentAsked)
  const synced = useCloudSync((s) => s.settled)
  const answersIn = useInbox((s) => s.loaded) || !isSupabaseConfigured
  const ready = contentIn && status !== 'unknown' && (status !== 'signed_in' || synced) && answersIn
  const open = ready && turn
  useOnScreen('donation', open)
  return <SupportModal open={open} onClose={() => undefined} />
}

const openTab = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

/** The pop-up itself. Closing it, either way, also counts as this region's showing. */
export function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const kofi = useGame((s) => donationUrl(s.data))
  const discord = useGame((s) => discordUrl(s.data))
  const enabled = useGame((s) => donationEnabled(s.data))
  return (
    <SupportView
      open={open && enabled && !!kofi}
      kofi={kofi ?? ''}
      discord={discord}
      onClose={() => {
        closeDonation()
        onClose()
      }}
    />
  )
}

/** What it shows, from the links it's given (the kitchen sink shows it without the admin's config). */
export function SupportView({
  open,
  onClose,
  kofi,
  discord,
}: {
  open: boolean
  onClose: () => void
  kofi: string
  /** The community Discord's invite; null (none set in the admin) leaves its row out. */
  discord: string | null
}) {
  const { t } = useT()
  const shareInvite = useInviteShare(open)

  const rows: RuleRow[] = [
    ...(discord
      ? [
          {
            icon: 'discord',
            title: t('ui.support.discord.title'),
            text: t('ui.support.discord.text'),
            action: (
              <PixelButton size="sm" onClick={() => openTab(discord)}>
                <PixelIcon name="discord" size={18} />
                {t('ui.nav.discord')}
              </PixelButton>
            ),
          },
        ]
      : []),
    {
      icon: 'friends',
      title: t('ui.support.invite.title'),
      text: t('ui.support.invite.text'),
      action: (
        <PixelButton size="sm" onClick={() => void shareInvite()}>
          <PixelIcon name="friends" size={18} />
          {t('ui.friends.share')}
        </PixelButton>
      ),
    },
    {
      icon: 'heart',
      title: t('ui.support.me.title'),
      text: t('ui.support.me.text'),
      action: (
        <PixelButton size="sm" onClick={() => openTab(kofi)}>
          <PixelIcon name="heart" size={18} />
          {t('ui.support.me.button')}
        </PixelButton>
      ),
    },
  ]

  return (
    <Modal open={open} onClose={onClose} title={t('ui.support.title')} className="max-w-md">
      <div className="flex flex-col gap-3">
        <RulesBanner picture={SUPPORT_PICTURE} />
        <RuleList rules={rows} />
        <PixelButton variant="primary" size="lg" className="mt-1 w-full" onClick={onClose}>
          {t('ui.common.ok')}
        </PixelButton>
      </div>
    </Modal>
  )
}
