// "Support me": the developer's three asks, as a rules pop-up (docs/15 §17): join the Discord (the one that matters
// most), invite friends, and support the developer on Ko-fi, under a line saying why the game itself can never be
// paid for (Pokémon is a licence). The trainer menu's and Settings' SUPPORT ME open it whenever the admin has it
// switched on with a Ko-fi link (engine/donation). Once per region, when its 5th badge is won, Home shows a note that
// leads to it (`SupportNotice`; engine/popups.ts `homeNotices`).
import { useState } from 'react'
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
import { NoticeCard } from './NoticeCard'
import { PixelButton } from './PixelButton'
import { RuleList, RulesBanner, type RuleRow, type RulesPicture } from './RulesModal'
import { useInviteShare } from './ShareTutorial'

/** A village under the morning sun: the players' community. */
export const SUPPORT_PICTURE: RulesPicture = { src: artUrl('village'), focus: '50% 58%' }

/**
 * Whether Home may show the region's Support me note yet. A reload starts on the build's content, before the sign-in,
 * the cloud save and the developer's answers are in: any of them can still take the note away (the admin's settings, a
 * region seen on another device), so it waits for them rather than show and vanish.
 */
export function useDonationReady(): boolean {
  const status = useGame((s) => s.auth.status)
  const contentIn = useGame((s) => s.contentAsked)
  const synced = useCloudSync((s) => s.settled)
  const answersIn = useInbox((s) => s.loaded) || !isSupabaseConfigured
  return contentIn && status !== 'unknown' && (status !== 'signed_in' || synced) && answersIn
}

/**
 * Support me on Home, once per region at its 5th badge (docs/43 §7: a note in the page, no longer a pop-up on
 * arrival): the village, one line, and SUPPORT ME, which opens the three asks. ✕ or the asks' OK count as this
 * region's showing (`closeDonation`).
 */
export function SupportNotice() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <SupportNoticeView onClose={closeDonation} onOpen={() => setOpen(true)} />
      <SupportModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** The note itself (the kitchen sink shows it without the admin's config). */
export function SupportNoticeView({ onClose, onOpen }: { onClose: () => void; onOpen: () => void }) {
  const { t } = useT()
  return (
    <NoticeCard
      picture={
        <span
          className="block h-14 w-14 bg-cover shadow-ring-thin"
          style={{
            backgroundImage: `url(${SUPPORT_PICTURE.src})`,
            backgroundPosition: SUPPORT_PICTURE.focus,
            imageRendering: 'pixelated',
          }}
          aria-hidden
        />
      }
      title={t('ui.support.title')}
      onClose={onClose}
      testId="support-notice"
      action={
        <PixelButton size="sm" onClick={onOpen}>
          <PixelIcon name="heart" size={18} className="shrink-0" />
          {t('ui.support.button')}
        </PixelButton>
      }
    >
      {t('ui.home.supportLine')}
    </NoticeCard>
  )
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
