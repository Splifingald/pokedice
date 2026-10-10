import { lazy, Suspense, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { badgeCase, discordUrl, leaderboardUnlocked, versusReadyCount, versusUnlocked, VERSUS_TEAM_SIZE } from '@/engine'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { useInFight, useIsAdmin } from '@/store/hooks'
import { cx } from '@/theme/util'
import { CloudSyncButton } from './CloudSyncButton'
import { ContactModal } from './ContactModal'
import { ConnectMarks, useConnect } from './AccountButton'
import { PixelIcon, type IconName } from './icons'
import { Modal } from './Modal'
import { TrainerLook } from './TrainerLook'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { SidePanel } from './SidePanel'
import { TrainerCard } from './TrainerCard'
import { playerOf } from './TrainerArt'

const HelpContent = lazy(() => import('@/screens/Help').then((m) => ({ default: m.HelpContent })))
const TypesContent = lazy(() => import('@/screens/Types').then((m) => ({ default: m.TypesContent })))

/**
 * One row of the menu: an icon in a tile, a label, a one-line description, and either a route or an action — or
 * `href`, a link out of the game opened in a new tab. `hint`: a short tag at the far end. The label alone names the
 * row; the description is read after it.
 */
function MenuRow({
  icon,
  mark,
  label,
  desc,
  hint,
  href,
  onClick,
}: {
  icon?: IconName
  mark?: boolean
  label: string
  desc?: string
  hint?: string
  href?: string
  onClick?: () => void
}) {
  const descId = useId()
  const className =
    'flex min-h-[56px] w-full items-center gap-2.5 bg-paper pb-2 pl-2 pr-3 pt-1.5 text-left text-ink shadow-card'
  const body = (
    <>
      <span className="grid h-8 w-8 shrink-0 place-items-center bg-sky shadow-ring">
        {mark ? <ConnectMarks size={14} /> : icon && <PixelIcon name={icon} size={18} />}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="truncate text-[20px] font-normal leading-none">{label}</b>
        {desc && (
          <small id={descId} className="font-pixel-sm text-[14px] leading-[1.1] text-muted">
            {desc}
          </small>
        )}
      </span>
      {hint && <em className="light-scope shrink-0 bg-night px-2 pb-[3px] pt-0.5 text-[15px] not-italic text-gold-light">{hint}</em>}
    </>
  )
  const a11y = { 'aria-label': label, 'aria-describedby': desc ? descId : undefined }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className} {...a11y}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className} {...a11y}>
      {body}
    </button>
  )
}

/**
 * The header's avatar button and everything behind it: the player's profile, the settings screen,
 * the rules, the type chart, the admin (admins only), the Google connection and, pinned at the bottom, the community
 * Discord (once the admin has set its link) and Contact the developer. Disabled mid-fight, like the rest of the header.
 */
export function PlayerMenu() {
  const { t } = useT()
  const navigate = useNavigate()
  const inFight = useInFight()
  const isAdmin = useIsAdmin()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const auth = useGame((s) => s.auth)
  const discord = useGame((s) => discordUrl(s.data))
  const [open, setOpen] = useState(false)
  const [guide, setGuide] = useState(false)
  const [types, setTypes] = useState(false)
  const [contact, setContact] = useState(false)
  const { connect, chooser } = useConnect()

  const name = playerOf(save).name
  const badges = save ? badgeCase(save, data) : []
  const earned = badges.filter((b) => b.earned).length
  // Versus shows from the start, with how far the player is from opening it (3 Pokémon at Lv.50).
  const versusOpen = !!save && versusUnlocked(save, data)
  const versusReady = save ? Math.min(versusReadyCount(save, data), VERSUS_TEAM_SIZE) : 0
  const boardOpen = !!save && leaderboardUnlocked(save, data)
  // The Connect row only makes sense when cloud backup exists on this deployment and nobody is signed in.
  const canConnect = isSupabaseConfigured && auth.status === 'signed_out'

  const go = (to: string) => () => {
    setOpen(false)
    navigate(to)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !inFight && setOpen(true)}
        aria-disabled={inFight || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('ui.profile.menuLabel')}
        title={t(inFight ? 'ui.nav.finishFight' : 'ui.profile.menuLabel')}
        className={cx('flex min-h-[44px] min-w-0 items-center gap-2 text-left', inFight && 'pointer-events-none opacity-60')}
      >
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center overflow-hidden rounded-full bg-[#7fb4ff] shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_#4f86d8]">
          <TrainerLook src={avatarOf(playerAvatarId(save?.player)).src} w={30} h={30} />
        </span>
        <span className="grid min-w-0 leading-none">
          <b className="truncate text-[20px] font-normal">{name || t('ui.profile.title')}</b>
          <small className="flex items-center gap-[3px] font-pixel-sm text-[15px] text-muted">
            <PixelIcon name="badge" size={8} />
            {earned}/{badges.length}
          </small>
        </span>
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={t('ui.profile.title')}
        footer={
          <div className="flex flex-col gap-2">
            {(!isSupabaseConfigured || auth.status === 'unavailable') && (
              <p className="copy text-sm text-muted">{t('ui.nav.saveInBrowser')}</p>
            )}
            {discord && <MenuRow icon="discord" label={t('ui.nav.discord')} href={discord} onClick={() => setOpen(false)} />}
            {/* Messages go to Supabase, so a deployment without it has no one to send them to. */}
            {isSupabaseConfigured && (
              <MenuRow
                icon="mail"
                label={t('ui.contact.button')}
                onClick={() => {
                  setOpen(false)
                  setContact(true)
                }}
              />
            )}
          </div>
        }
      >
        <TrainerCard />
        <nav aria-label={t('ui.profile.menuLabel')} className="mt-3 flex flex-col gap-1.5">
          <MenuRow
            icon={boardOpen ? 'trophy' : 'lock'}
            label={t('ui.board.title')}
            desc={boardOpen ? t('ui.menu.board') : t('ui.nav.boardLocked')}
            onClick={go('/leaderboard')}
          />
          <MenuRow
            icon={versusOpen ? 'sword' : 'lock'}
            label={t('ui.nav.versus')}
            desc={t('ui.menu.versus')}
            hint={versusOpen ? undefined : t('ui.versus.lockedCount', { n: versusReady })}
            onClick={go('/versus')}
          />
          <MenuRow icon="gear" label={t('ui.nav.settings')} desc={t('ui.menu.settings')} onClick={go('/settings')} />
          <MenuRow
            icon="book"
            label={t('ui.profile.guide')}
            desc={t('ui.menu.guide')}
            onClick={() => {
              setOpen(false)
              setGuide(true)
            }}
          />
          <MenuRow
            icon="vs"
            label={t('ui.help.navTypes')}
            desc={t('ui.menu.types')}
            onClick={() => {
              setOpen(false)
              setTypes(true)
            }}
          />
          {isAdmin && <MenuRow icon="wrench" label={t('ui.nav.admin')} desc={t('ui.menu.admin')} onClick={go('/admin')} />}
          <CloudSyncButton />
          {canConnect && (
            <MenuRow
              mark
              label={t('ui.account.connect')}
              desc={t('ui.menu.connect')}
              onClick={() => {
                setOpen(false)
                connect()
              }}
            />
          )}
        </nav>
      </SidePanel>

      <ContactModal open={contact} onClose={() => setContact(false)} />

      {chooser}

      <Modal open={guide} onClose={() => setGuide(false)} title={t('ui.settings.howToPlay')} className="max-w-3xl">
        <Suspense fallback={<p className="text-xl">{t('ui.common.loading')}</p>}>
          <HelpContent />
        </Suspense>
      </Modal>

      <Modal open={types} onClose={() => setTypes(false)} title={t('ui.help.navTypes')} className="max-w-3xl">
        <Suspense fallback={<p className="text-xl">{t('ui.common.loading')}</p>}>
          <TypesContent />
        </Suspense>
      </Modal>
    </>
  )
}
