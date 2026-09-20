import { useState } from 'react'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { signInWithGoogle, signOut } from '@/store/sync'
import { cx } from '@/theme/util'
import { Modal } from './Modal'
import { PixelButton, type PixelButtonProps } from './PixelButton'

/** The Google "G" (the multicolour mark Google asks sign-in buttons to use). */
export function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** The "are you sure" behind every disconnect, wherever the button lives. */
function DisconnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const email = useGame((s) => s.auth.email)
  return (
    <Modal open={open} onClose={onClose} title={t('ui.account.disconnectTitle')}>
      <p className="copy mb-4 text-lg">
        {t('ui.account.disconnectBody', { who: email ? t('ui.account.backedUpAs', { who: email }) : '' })}
      </p>
      <div className="flex justify-end gap-2">
        <PixelButton onClick={onClose}>{t('ui.common.cancel')}</PixelButton>
        <PixelButton
          variant="danger"
          onClick={() => {
            onClose()
            void signOut()
          }}
        >
          {t('ui.account.disconnect')}
        </PixelButton>
      </div>
    </Modal>
  )
}

/** CONNECT with Google. Renders wherever a sign-in is offered (the drawer, the side bar). */
export function ConnectButton({ size = 'md', className }: { size?: PixelButtonProps['size']; className?: string }) {
  const { t } = useT()
  return (
    <PixelButton size={size} className={className} onClick={() => void signInWithGoogle()} aria-label={t('ui.account.connectLabel')}>
      <GoogleMark />
      {t('ui.account.connect')}
    </PixelButton>
  )
}

/** DISCONNECT, with the confirmation. Only useful while signed in — renders nothing otherwise. */
export function DisconnectButton({ size = 'md', className }: { size?: PixelButtonProps['size']; className?: string }) {
  const { t } = useT()
  const status = useGame((s) => s.auth.status)
  const [confirm, setConfirm] = useState(false)
  if (status !== 'signed_in') return null
  return (
    <>
      <PixelButton size={size} variant="danger" className={className} onClick={() => setConfirm(true)}>
        {t('ui.account.disconnect')}
      </PixelButton>
      <DisconnectModal open={confirm} onClose={() => setConfirm(false)} />
    </>
  )
}

/**
 * Cloud backup in one button: CONNECT (Google) when signed out; a greyed CONNECTED with the profile picture when
 * signed in — clicking it asks before disconnecting. Renders nothing while auth is unknown or unavailable.
 */
export function GoogleAccountButton({ size = 'md', className }: { size?: PixelButtonProps['size']; className?: string }) {
  const { t } = useT()
  const auth = useGame((s) => s.auth)
  const [confirm, setConfirm] = useState(false)
  const [broken, setBroken] = useState(false)
  if (auth.status === 'signed_out') return <ConnectButton size={size} className={className} />
  if (auth.status !== 'signed_in') return null
  const avatar = auth.avatarUrl && !broken ? auth.avatarUrl : null
  return (
    <>
      <PixelButton
        size={size}
        className={cx('bg-[#d9d3c3] text-muted', className)}
        onClick={() => setConfirm(true)}
        title={auth.email ?? undefined}
        aria-label={t('ui.account.connectedLabel', { who: auth.email ?? t('ui.settings.yourGoogle') })}
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            width={24}
            height={24}
            referrerPolicy="no-referrer"
            className="h-6 w-6 shrink-0 border-2 border-ink object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <GoogleMark />
        )}
        {t('ui.account.connected')}
      </PixelButton>
      <DisconnectModal open={confirm} onClose={() => setConfirm(false)} />
    </>
  )
}
