import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { PixelButton } from '@/components/PixelButton'
import { Toggle } from '@/components/Toggle'
import { LANG_LABELS, LANGS, type Lang } from '@/i18n'
import { multiExpText } from '@/i18n/text'
import { useT } from '@/i18n/react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { parseSave } from '@/save/schema'
import { pushToast, setSettings, useGame } from '@/store/game'
import { deleteSave, replaceSave } from '@/store/run'
import { useIsAdmin } from '@/store/hooks'
import { checkContent } from '@/store/sync'
import { DisconnectButton, GoogleAccountButton } from '@/components/GoogleAccountButton'
import { SaveFacts } from '@/components/SyncConflictModal'
import { backupSave, readBackups } from '@/save/storage'

export function SettingsScreen() {
  const { t } = useT()
  const settings = useGame((s) => s.settings)
  const save = useGame((s) => s.save)
  const auth = useGame((s) => s.auth)
  const isAdmin = useIsAdmin()
  const data = useGame((s) => s.data)
  const source = useGame((s) => s.contentSource)
  const navigate = useNavigate()
  const [importText, setImportText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const copySave = async () => {
    if (!save) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(save))
      pushToast(t('ui.settings.copied'), 'good')
    } catch {
      pushToast(t('ui.settings.clipboardOff'), 'bad')
    }
  }

  const doImport = () => {
    try {
      const res = parseSave(JSON.parse(importText))
      if (!res.ok) return pushToast(t('ui.settings.invalidSave', { error: res.error.slice(0, 80) }), 'bad')
      replaceSave(res.save)
      setImportText('')
      pushToast(t('ui.settings.imported'), 'good')
    } catch {
      pushToast(t('ui.settings.notJson'), 'bad')
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-5xl">{t('ui.settings.title')}</h1>

      <Panel title={t('ui.settings.game')}>
        <Toggle
          label={t('ui.settings.sfx')}
          hint={t('ui.settings.sfxHint')}
          on={settings.sfx}
          onChange={(v) => setSettings({ sfx: v })}
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
        {/* Admins only — but a player who already turned it on still sees it, so they can turn it off. */}
        {(isAdmin || settings.reducedMotion) && (
          <Toggle
            label={t('ui.settings.reducedMotion')}
            hint={t('ui.settings.reducedMotionHint')}
            on={settings.reducedMotion}
            onChange={(v) => setSettings({ reducedMotion: v })}
          />
        )}
      </Panel>

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="copy">
              {auth.status === 'signed_in'
                ? t('ui.settings.cloudOn', { who: auth.email ?? t('ui.settings.yourGoogle') })
                : t('ui.settings.cloudConnect')}
            </span>
            {auth.status === 'signed_in' ? <DisconnectButton size="sm" /> : <GoogleAccountButton size="sm" />}
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
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={t('ui.settings.importPlaceholder')}
          className="mt-3 h-24 w-full border-2 border-ink bg-panel p-2 font-mono text-xs"
        />
        <PixelButton size="sm" className="mt-1" disabled={!importText.trim()} onClick={doImport}>
          {t('ui.settings.importSave')}
        </PixelButton>
        </details>
      </Panel>

      <BackupsPanel />

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

/** Saves replaced by a cloud sync (or a restore) on this device — a wrong choice can be undone here. */
function BackupsPanel() {
  const { t } = useT()
  const [list, setList] = useState(() => readBackups())
  const [confirm, setConfirm] = useState<number | null>(null)
  if (!list.length) return null
  return (
    <Panel title={t('ui.settings.backups')}>
      <p className="copy mb-2 text-muted">{t('ui.settings.backupsHint')}</p>
      <ul className="flex flex-col gap-2">
        {list.map((b) => (
          <li key={b.at} className="flex flex-wrap items-center gap-3 border-2 border-ink bg-panel p-2">
            <div className="min-w-0 flex-1">
              <div className="text-lg leading-tight">{b.reason}</div>
              <div className="text-base text-muted">{t('ui.settings.setAside', { when: new Date(b.at).toLocaleString() })}</div>
              <SaveFacts save={b.save} />
            </div>
            <PixelButton
              size="sm"
              variant={confirm === b.at ? 'danger' : 'secondary'}
              onClick={() => {
                if (confirm !== b.at) return setConfirm(b.at)
                const current = useGame.getState().save
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
        ))}
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
            className={`pixel-btn min-h-[44px] px-3 py-1 text-2xl leading-none ${lang === l ? 'bg-gold' : 'bg-parchment'}`}
          >
            {LANG_LABELS[l]}
          </button>
        ))}
      </div>
      <p className="copy mt-2 text-muted">{t('ui.settings.languageHint')}</p>
    </Panel>
  )
}
