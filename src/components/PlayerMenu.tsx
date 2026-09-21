import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { useInFight, useIsAdmin } from '@/store/hooks'
import { signInWithGoogle } from '@/store/sync'
import { cx } from '@/theme/util'
import { GoogleMark } from './GoogleAccountButton'
import { PixelIcon, type IconName } from './icons'
import { Modal } from './Modal'
import { PlayerAvatar } from './PlayerAvatar'
import { PlayerProfileModal } from './PlayerProfileModal'
import { SidePanel } from './SidePanel'
import { playerOf } from './TrainerArt'

const HelpContent = lazy(() => import('@/screens/Help').then((m) => ({ default: m.HelpContent })))
const TypesContent = lazy(() => import('@/screens/Types').then((m) => ({ default: m.TypesContent })))

/** One row of the drawer: an icon, a label, and either a route or an action. */
function MenuRow({ icon, mark, label, onClick }: { icon?: IconName; mark?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pixel-btn flex min-h-[44px] w-full items-center gap-3 bg-panel px-3 py-2 text-2xl leading-none"
    >
      {mark ? <GoogleMark /> : icon && <PixelIcon name={icon} size={20} />}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}

/**
 * The header's avatar button and everything behind it: the player's profile, the settings screen,
 * the rules, the type chart, the admin (admins only) and the Google connection. Disabled mid-fight,
 * like the rest of the header.
 */
export function PlayerMenu() {
  const { t } = useT()
  const navigate = useNavigate()
  const inFight = useInFight()
  const isAdmin = useIsAdmin()
  const save = useGame((s) => s.save)
  const auth = useGame((s) => s.auth)
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState(false)
  const [guide, setGuide] = useState(false)
  const [types, setTypes] = useState(false)

  const name = playerOf(save).name
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
        className={cx(
          'flex h-11 w-11 shrink-0 items-center justify-center md:h-9 md:w-9',
          inFight && 'hatched pointer-events-none',
        )}
      >
        <PlayerAvatar size={34} />
      </button>

      <SidePanel
        open={open}
        onClose={() => setOpen(false)}
        title={name || t('ui.profile.title')}
        footer={
          !isSupabaseConfigured || auth.status === 'unavailable' ? (
            <p className="copy text-sm text-muted">{t('ui.nav.saveInBrowser')}</p>
          ) : undefined
        }
      >
        <nav aria-label={t('ui.profile.menuLabel')} className="flex flex-col gap-2.5">
          <MenuRow
            icon="user"
            label={t('ui.profile.title')}
            onClick={() => {
              setOpen(false)
              setProfile(true)
            }}
          />
          <MenuRow icon="gear" label={t('ui.nav.settings')} onClick={go('/settings')} />
          <MenuRow
            icon="book"
            label={t('ui.profile.guide')}
            onClick={() => {
              setOpen(false)
              setGuide(true)
            }}
          />
          <MenuRow
            icon="vs"
            label={t('ui.help.navTypes')}
            onClick={() => {
              setOpen(false)
              setTypes(true)
            }}
          />
          {isAdmin && <MenuRow icon="wrench" label={t('ui.nav.admin')} onClick={go('/admin')} />}
          {canConnect && (
            <MenuRow
              mark
              label={t('ui.account.connect')}
              onClick={() => {
                setOpen(false)
                void signInWithGoogle()
              }}
            />
          )}
        </nav>
      </SidePanel>

      <PlayerProfileModal open={profile} onClose={() => setProfile(false)} />

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
