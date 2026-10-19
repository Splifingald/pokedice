import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SupportModal } from '@/components/SupportModal'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { PushSettingsPanel } from '@/components/PushSettings'
import { PixelButton } from '@/components/PixelButton'
import { Seg } from '@/components/Segmented'
import { Toggle } from '@/components/Toggle'
import { donationEnabled, extremeOpen, isExtreme, missesTrades } from '@/engine'
import { LANG_LABELS, LANGS, type Lang } from '@/i18n'
import { multiExpText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, setSettings, useGame } from '@/store/game'
import { deleteSave, replaceSave } from '@/store/run'
import { useIsAdmin } from '@/store/hooks'
import { checkContent, deleteAllData, deleteExtremeSave, providerName } from '@/store/sync'
import { otherSave } from '@/store/extreme'
import { ExtremeRulesModal } from '@/components/Extreme'
import { AccountButton, ConnectedAccounts, DisconnectButton } from '@/components/AccountButton'
import { SaveFacts } from '@/components/SaveFacts'
import { backupSave, readBackups, soundOn } from '@/save/storage'

export function SettingsScreen() {
  const { t } = useT()
  const settings = useGame((s) => s.settings)
  const save = useGame((s) => s.save)
  const auth = useGame((s) => s.auth)
  const isAdmin = useIsAdmin()
  const data = useGame((s) => s.data)
  const source = useGame((s) => s.contentSource)
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Only when the admin has it switched on, with a PayPal link.
  const canDonate = donationEnabled(data)
  const [donating, setDonating] = useState(false)

  const copySave = async () => {
    if (!save) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(save))
      pushToast(t('ui.settings.copied'), 'good')
    } catch {
      pushToast(t('ui.settings.clipboardOff'), 'bad')
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[32px] leading-none">{t('ui.settings.title')}</h1>
        {canDonate && (
          <PixelButton variant="primary" size="sm" onClick={() => setDonating(true)}>
            {t('ui.support.button')}
          </PixelButton>
        )}
      </div>

      <Panel title={t('ui.settings.game')}>
        <Toggle
          label={t('ui.settings.sound')}
          hint={t('ui.settings.soundHint')}
          on={soundOn(settings)}
          onChange={(v) => setSettings({ sound: v, sfx: v })}
        />
        <Toggle
          label={t('ui.settings.multiExp')}
          hint={
            data.config.multiExpShare > 0
              ? t('ui.settings.multiExpHint', { share: multiExpText(data) })
              : t('ui.settings.multiExpOff')
          }
          on={settings.multiExp}
          onChange={(v) => setSettings({ multiExp: v })}
        />
        <div className="flex flex-col gap-1.5 py-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xl">{t('ui.settings.animations')}</span>
            <Seg
              label={t('ui.settings.animations')}
              value={settings.animations ?? 'full'}
              onChange={(v) => setSettings({ animations: v })}
              options={[
                { id: 'full', label: t('ui.settings.animFull') },
                { id: 'short', label: t('ui.settings.animShort') },
              ]}
              className="min-w-[12rem]"
            />
          </div>
          <span className="copy block text-muted">{t('ui.settings.animationsHint')}</span>
        </div>
        <div className="flex flex-col gap-1.5 py-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-2xl">{t('ui.settings.theme')}</span>
            <Seg
              label={t('ui.settings.theme')}
              value={settings.theme ?? 'light'}
              onChange={(v) => setSettings({ theme: v })}
              options={[
                { id: 'light', label: t('ui.settings.themeLight') },
                { id: 'dark', label: t('ui.settings.themeDark') },
                { id: 'auto', label: t('ui.settings.themeAuto') },
              ]}
              className="min-w-[15rem]"
            />
          </div>
          <span className="copy block text-muted">{t('ui.settings.themeHint')}</span>
        </div>
        {/* No animations: admins only — but a player who already turned it on still sees it, so they can turn it off. */}
        {(isAdmin || settings.reducedMotion) && (
          <Toggle
            label={t('ui.settings.reducedMotion')}
            hint={t('ui.settings.reducedMotionHint')}
            on={settings.reducedMotion}
            onChange={(v) => setSettings({ reducedMotion: v })}
          />
        )}
      </Panel>

      <PushSettingsPanel />

      <LanguagePanel />

      <Panel title={t('ui.settings.cloud')}>
        {!isSupabaseConfigured || auth.status === 'unavailable' ? (
          <p className="copy text-muted">
            {t('ui.settings.cloudOff')}{' '}
            <Link to="/setup" className="underline">
              {t('ui.settings.cloudHow')}
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="copy">
                {auth.status !== 'signed_in'
                  ? t('ui.settings.cloudConnect')
                  : auth.provider
                    ? t('ui.account.signedInWith', {
                        provider: providerName(auth.provider),
                        who: auth.email ?? t('ui.settings.yourGoogle'),
                      })
                    : t('ui.settings.cloudOn', { who: auth.email ?? t('ui.settings.yourGoogle') })}
              </span>
              {auth.status === 'signed_in' ? <DisconnectButton size="sm" /> : <AccountButton size="sm" />}
            </div>
            <ConnectedAccounts />
          </div>
        )}
      </Panel>

      <Panel title={t('ui.settings.saveFile')}>
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-xl">{t('ui.settings.saveAdvanced')}</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <PixelButton size="sm" onClick={() => void copySave()} disabled={!save}>
            {t('ui.settings.copySave')}
          </PixelButton>
          <PixelButton size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={!save}>
            {t('ui.settings.deleteSave')}
          </PixelButton>
        </div>
        {/* No import here: the cloud save is what the trade server reads, so a pasted save would be a cheat that
            reaches other players (docs/23). Admins keep theirs in Dev Tools. */}
        </details>
      </Panel>

      <ExtremePanel />

      {/* Restoring a backup rewrites the cloud save the trade server reads, like an import: admins only (docs/23). */}
      {isAdmin && <BackupsPanel />}

      <Panel title={t('ui.settings.content')}>
        <p className="text-lg">
          {t('ui.settings.gameData', {
            source: t(source === 'remote' ? 'ui.settings.sourceLive' : 'ui.settings.sourceBundled'),
            version: data.config.configVersion,
          })}
        </p>
        <PixelButton size="sm" className="mt-1" onClick={() => void checkContent()}>
          {t('ui.settings.checkUpdates')}
        </PixelButton>
      </Panel>

      <p className="copy text-muted">
        {t('ui.settings.legal')}{' '}
        <Link to="/setup" className="underline">
          {t('ui.title.deployGuide')}
        </Link>
      </p>

      {/* The bottom of the settings is where a disconnect belongs: out of the way, never a mis-tap. */}
      {auth.status === 'signed_in' && (
        <div className="flex justify-center">
          <DisconnectButton />
        </div>
      )}

      <DeleteData />

      <SupportModal open={donating} onClose={() => setDonating(false)} />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('ui.settings.deleteTitle')}>
        <p className="copy mb-4 text-lg">
          {t('ui.settings.deleteBody', { cloud: auth.status === 'signed_in' ? t('ui.settings.deleteCloudNote') : '' })}
        </p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirmDelete(false)}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton
            variant="danger"
            onClick={() => {
              deleteSave()
              navigate('/')
            }}
          >
            {t('ui.settings.delete')}
          </PixelButton>
        </div>
      </Modal>
    </div>
  )
}

/**
 * The red button at the very bottom: everything the game keeps about the player, in this browser and online, deleted
 * (both saves, docs/22). Two pop-ups in a row so it is never a mis-tap: what goes, then a last "really?". Then the
 * title screen, from scratch. `extreme`: the Extreme save only, from its own section.
 */
function DeleteData({ scope = 'all' }: { scope?: 'all' | 'extreme' }) {
  const { t } = useT()
  const online = useGame((s) => s.auth.status === 'signed_in')
  const playingExtreme = useGame((s) => isExtreme(s.save))
  const hasExtreme = playingExtreme || isExtreme(otherSave())
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [busy, setBusy] = useState(false)
  const all = scope === 'all'
  const close = () => {
    if (!busy) setStep(0)
  }
  const wipe = async () => {
    setBusy(true)
    // A reload, not a navigation: the stores still hold the old save, friends and events in memory.
    if (await (all ? deleteAllData() : deleteExtremeSave())) return window.location.assign('/')
    setBusy(false)
    setStep(0)
    pushToast(t('ui.settings.wipeFailed'), 'bad')
  }
  const body = all
    ? [t(online ? 'ui.settings.wipeBodyOnline' : 'ui.settings.wipeBodyLocal'), hasExtreme ? t('ui.settings.wipeBothNote') : '']
        .filter(Boolean)
        .join(' ')
    : t('ui.extreme.settings.deleteBody')
  return (
    <div className={all ? 'flex justify-center' : 'flex'}>
      {/* Full width on phones, so a long translation shrinks to fit instead of pushing the page sideways. */}
      <PixelButton variant="danger" size={all ? 'md' : 'sm'} className={all ? 'w-full sm:w-auto' : undefined} onClick={() => setStep(1)}>
        {t(all ? 'ui.settings.wipe' : 'ui.extreme.settings.delete')}
      </PixelButton>

      <Modal open={step === 1} onClose={close} title={t(all ? 'ui.settings.wipeTitle' : 'ui.extreme.settings.deleteTitle')}>
        <p className="copy mb-4 text-lg">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <PixelButton onClick={close}>{t('ui.common.cancel')}</PixelButton>
          <PixelButton variant="danger" onClick={() => setStep(2)}>
            {t('ui.common.continue')}
          </PixelButton>
        </div>
      </Modal>

      <Modal open={step === 2} onClose={close} dismissable={!busy} title={t('ui.settings.wipeSureTitle')}>
        <p className="copy mb-4 text-lg">{t('ui.settings.wipeSureBody')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <PixelButton onClick={close} disabled={busy}>
            {t('ui.common.cancel')}
          </PixelButton>
          <PixelButton variant="danger" onClick={() => void wipe()} disabled={busy}>
            {t(busy ? 'ui.settings.wiping' : 'ui.settings.wipeConfirm')}
          </PixelButton>
        </div>
      </Modal>
    </div>
  )
}

/** Extreme mode (docs/22): what it is, its rules, and deleting its save. Once it's open, or a save of it exists. */
function ExtremePanel() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [rules, setRules] = useState(false)
  const extreme = isExtreme(save)
  const other = otherSave()
  const hasSave = extreme || isExtreme(other)
  if (!extreme && !hasSave && !extremeOpen(save, data)) return null
  return (
    <Panel title={t('ui.extreme.name')}>
      <p className="copy text-muted">{t('ui.extreme.settings.hint')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PixelButton size="sm" onClick={() => setRules(true)} aria-label={t('ui.extreme.infoLabel')}>
          {t('ui.extreme.settings.rules')}
        </PixelButton>
        {hasSave && <DeleteData scope="extreme" />}
      </div>
      <ExtremeRulesModal open={rules} onClose={() => setRules(false)} />
    </Panel>
  )
}

/** Saves replaced by a cloud sync (or a restore) on this device — a wrong choice can be undone here. */
function BackupsPanel() {
  const { t } = useT()
  const current = useGame((s) => s.save)
  const [list, setList] = useState(() => readBackups())
  const [confirm, setConfirm] = useState<number | null>(null)
  if (!list.length) return null
  return (
    <Panel title={t('ui.settings.backups')}>
      <p className="copy mb-2 text-muted">{t('ui.settings.backupsHint')}</p>
      <ul className="flex flex-col gap-2">
        {list.map((b) => {
          // Going back to before a trade would give back the Pokémon traded away: a duplicate (docs/23).
          const traded = !!current && missesTrades(b.save, current)
          return (
            <li key={b.at} className="flex flex-wrap items-center gap-3 bg-paper p-2 shadow-ring">
              <div className="min-w-0 flex-1">
                <div className="text-lg leading-tight">{b.reason}</div>
                <div className="text-base text-muted">{t('ui.settings.setAside', { when: new Date(b.at).toLocaleString() })}</div>
                <SaveFacts save={b.save} />
                {traded && <div className="copy text-muted">{t('ui.settings.restoreTraded')}</div>}
              </div>
              <PixelButton
                size="sm"
                variant={confirm === b.at ? 'danger' : 'secondary'}
                disabled={traded}
                onClick={() => {
                  if (confirm !== b.at) return setConfirm(b.at)
                  if (current) backupSave(current, t('ui.settings.beforeRestore'))
                  replaceSave({ ...b.save, updatedAt: Date.now() })
                  setConfirm(null)
                  setList(readBackups())
                  pushToast(t('ui.settings.restored'), 'good')
                }}
              >
                {t(confirm === b.at ? 'ui.settings.replaceMine' : 'ui.settings.restore')}
              </PixelButton>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/** The whole game — menus, Pokémon, trainers, items — follows this. */
function LanguagePanel() {
  const { t } = useT()
  const lang = useGame((s) => s.settings.lang)
  return (
    <Panel title={t('ui.settings.language')}>
      <div role="radiogroup" aria-label={t('ui.settings.language')} className="flex flex-wrap gap-2">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            lang={l}
            onClick={() => setSettings({ lang: l as Lang })}
            // font-pixel re-reads --font-cjk here, so each label draws in its own language's CJK face (`lang` alone
            // would inherit the page's: a font stack is resolved once, on <body>).
            className={`pixel-btn font-pixel min-h-[44px] px-3 py-1 text-2xl leading-none ${lang === l ? 'bg-gold' : 'bg-parchment'}`}
          >
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>
      <p className="copy mt-2 text-muted">{t('ui.settings.languageHint')}</p>
    </Panel>
  )
}
