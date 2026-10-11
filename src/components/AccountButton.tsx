// Cloud accounts: CONNECT (Google or Discord, docs/17), the connected state, DISCONNECT, and Settings → Connected
// accounts. With Discord off in Supabase, CONNECT goes straight to Google as it always did: no chooser, no extra tap.
import { useState } from 'react'
import { AUTH_PROVIDERS, useAuthProviders } from '@/lib/authProviders'
import { useT } from '@/i18n/react'
import { useGame, type AuthProvider } from '@/store/game'
import { linkProvider, providerName, signIn, signOut, unlinkProvider } from '@/store/sync'
import { cx } from '@/theme/util'
import { Chip } from './Chip'
import { PixelIcon } from './icons'
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

/** Discord, as the game draws it elsewhere (Join the Discord): the pixel mark. */
export function DiscordMark({ size = 20 }: { size?: number }) {
  return <PixelIcon name="discord" size={size} />
}

export function ProviderMark({ provider, size = 20 }: { provider: AuthProvider; size?: number }) {
  return provider === 'discord' ? <DiscordMark size={size} /> : <GoogleMark size={size} />
}

/** The marks of every way in this deployment offers, side by side. */
export function ConnectMarks({ size = 18 }: { size?: number }) {
  const providers = useAuthProviders()
  return (
    <span className="inline-flex shrink-0 items-center gap-1" aria-hidden>
      {AUTH_PROVIDERS.filter((p) => providers[p]).map((p) => (
        <ProviderMark key={p} provider={p} size={size} />
      ))}
    </span>
  )
}

/** "Continue with Google / Discord", for every CONNECT in the game. */
export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const providers = useAuthProviders()
  return (
    <Modal open={open} onClose={onClose} title={t('ui.account.chooseTitle')}>
      <div className="flex flex-col gap-3">
        <p className="copy m-0">{t('ui.account.chooseBody')}</p>
        <div className="flex flex-col gap-2">
          {AUTH_PROVIDERS.filter((p) => providers[p]).map((p) => (
            <PixelButton
              key={p}
              className="w-full"
              onClick={() => {
                onClose()
                void signIn(p)
              }}
            >
              <ProviderMark provider={p} />
              {t(p === 'discord' ? 'ui.account.withDiscord' : 'ui.account.withGoogle')}
            </PixelButton>
          ))}
        </div>
        <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">{t('ui.account.chooseNote')}</p>
      </div>
    </Modal>
  )
}

/**
 * What every CONNECT calls: the chooser when there is a choice, else Google at once. Render `chooser` once next to the
 * button.
 */
export function useConnect() {
  const discord = useAuthProviders((s) => s.discord)
  const [open, setOpen] = useState(false)
  return {
    connect: () => (discord ? setOpen(true) : void signIn('google')),
    chooser: <ConnectModal open={open} onClose={() => setOpen(false)} />,
  }
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

/** CONNECT. Renders wherever a sign-in is offered (the title screen, the boards, Settings). */
export function ConnectButton({ size = 'md', className }: { size?: PixelButtonProps['size']; className?: string }) {
  const { t } = useT()
  const { connect, chooser } = useConnect()
  return (
    <>
      <PixelButton size={size} className={className} onClick={connect} aria-label={t('ui.account.connectLabel')}>
        <ConnectMarks />
        {t('ui.account.connect')}
      </PixelButton>
      {chooser}
    </>
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
 * Cloud backup in one button: CONNECT when signed out; a greyed CONNECTED with the profile picture (or the provider's
 * mark) when signed in — clicking it asks before disconnecting. Renders nothing while auth is unknown or unavailable.
 */
export function AccountButton({ size = 'md', className }: { size?: PixelButtonProps['size']; className?: string }) {
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
        className={cx('bg-well-deep text-muted', className)}
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
            className="h-6 w-6 shrink-0 border-2 border-edge object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <ProviderMark provider={auth.provider ?? 'google'} />
        )}
        {t('ui.account.connected')}
      </PixelButton>
      <DisconnectModal open={confirm} onClose={() => setConfirm(false)} />
    </>
  )
}

/**
 * Settings → Connected accounts: each way in this deployment offers (or that the account already has), linked or
 * not, with LINK, and UNLINK while another one is linked. Nothing to show while there is only one way in.
 */
export function ConnectedAccounts() {
  const { t } = useT()
  const auth = useGame((s) => s.auth)
  const offered = useAuthProviders()
  const linked = auth.providers ?? (auth.provider ? [auth.provider] : [])
  const list = AUTH_PROVIDERS.filter((p) => offered[p] || linked.includes(p))
  if (auth.status !== 'signed_in' || list.length < 2) return null
  return (
    <section className="flex flex-col gap-1.5" aria-label={t('ui.account.accounts')}>
      <h3 className="m-0 text-[20px] font-normal leading-none">{t('ui.account.accounts')}</h3>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {list.map((p) => {
          const on = linked.includes(p)
          return (
            <li key={p} className="flex min-h-[52px] items-center gap-2.5 bg-paper py-1.5 pl-2 pr-2 shadow-ring-line">
              <span className="grid h-8 w-8 shrink-0 place-items-center bg-sky shadow-ring">
                <ProviderMark provider={p} size={18} />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <b className="truncate text-[20px] font-normal leading-none">{providerName(p)}</b>
                {on && p === auth.provider && auth.email && (
                  <small className="truncate font-pixel-sm text-[14px] leading-none text-muted">{auth.email}</small>
                )}
              </span>
              <Chip tone={on ? 'done' : 'lock'}>{t(on ? 'ui.account.linked' : 'ui.account.notLinked')}</Chip>
              {!on ? (
                <PixelButton size="sm" onClick={() => void linkProvider(p)} aria-label={`${t('ui.account.link')} ${providerName(p)}`}>
                  {t('ui.account.link')}
                </PixelButton>
              ) : (
                linked.length > 1 && (
                  <PixelButton
                    size="sm"
                    variant="ghost"
                    onClick={() => void unlinkProvider(p)}
                    aria-label={`${t('ui.account.unlink')} ${providerName(p)}`}
                  >
                    {t('ui.account.unlink')}
                  </PixelButton>
                )
              )}
            </li>
          )
        })}
      </ul>
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">{t('ui.account.linkHint')}</p>
    </section>
  )
}
