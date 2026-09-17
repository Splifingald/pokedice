import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { PixelButton } from '@/components/PixelButton'
import { isSupabaseConfigured } from '@/lib/supabase'
import { parseSave } from '@/save/schema'
import { pushToast, setSettings, useGame } from '@/store/game'
import { deleteSave, replaceSave } from '@/store/run'
import { useIsAdmin } from '@/store/hooks'
import { checkContent } from '@/store/sync'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'

function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span>
        <span className="text-2xl">{label}</span>
        {hint && <span className="copy block text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`pixel-btn min-h-[44px] min-w-[72px] px-2 py-1 text-xl ${on ? 'bg-hp-green' : 'bg-parchment'}`}
      >
        {on ? 'ON' : 'OFF'}
      </button>
    </label>
  )
}

export function SettingsScreen() {
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
      pushToast('Save copied to the clipboard', 'good')
    } catch {
      pushToast('Clipboard unavailable', 'bad')
    }
  }

  const doImport = () => {
    try {
      const res = parseSave(JSON.parse(importText))
      if (!res.ok) return pushToast(`Invalid save: ${res.error.slice(0, 80)}`, 'bad')
      replaceSave(res.save)
      setImportText('')
      pushToast('Save imported', 'good')
    } catch {
      pushToast('That is not valid JSON', 'bad')
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-5xl">Settings</h1>

      <Panel title="Game">
        <Toggle
          label="Sound effects"
          hint="8-bit SFX, off by default"
          on={settings.sfx}
          onChange={(v) => setSettings({ sfx: v })}
        />
        <Toggle
          label="Multi EXP"
          hint={
            data.config.multiExpShare > 0
              ? `Team members who didn't fight still get ${Math.round(data.config.multiExpShare * 100)} % of the XP.`
              : 'Disabled by the game settings right now.'
          }
          on={settings.multiExp}
          onChange={(v) => setSettings({ multiExp: v })}
        />
        <Toggle
          label="Reduced motion"
          hint="Instant transitions, no shake or particles. Your OS setting is respected too."
          on={settings.reducedMotion}
          onChange={(v) => setSettings({ reducedMotion: v })}
        />
      </Panel>

      {/* Phones have no side bar, so the admin link lives here (admins only). */}
      {isAdmin && (
        <div className="md:hidden">
          <Panel title="Admin">
            <Link to="/admin" className="pixel-btn inline-flex min-h-[44px] items-center bg-ink px-4 text-2xl leading-none text-panel">
              Open the admin
            </Link>
          </Panel>
        </div>
      )}

      <Panel title="Cloud backup">
        {!isSupabaseConfigured || auth.status === 'unavailable' ? (
          <p className="copy text-muted">
            Cloud backup isn't configured on this deployment. Your save lives in this browser.{' '}
            <Link to="/setup" className="underline">
              How to set it up
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="copy">
              {auth.status === 'signed_in'
                ? `Backed up as ${auth.email ?? 'your Google account'}.`
                : 'Connect to back up your save and play on other devices. Optional.'}
            </span>
            <GoogleAccountButton size="sm" />
          </div>
        )}
      </Panel>

      <Panel title="Save file">
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-xl">Advanced: copy, import or delete your save</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <PixelButton size="sm" onClick={() => void copySave()} disabled={!save}>
            Copy save (JSON)
          </PixelButton>
          <PixelButton size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={!save}>
            Delete save
          </PixelButton>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste a save JSON here to import it…"
          className="mt-3 h-24 w-full border-2 border-ink bg-panel p-2 font-mono text-xs"
        />
        <PixelButton size="sm" className="mt-1" disabled={!importText.trim()} onClick={doImport}>
          Import save
        </PixelButton>
        </details>
      </Panel>

      <Panel title="Content">
        <p className="text-lg">
          Game data: <b>{source === 'remote' ? 'live (Supabase)' : 'bundled'}</b> · version {data.config.configVersion}
        </p>
        <PixelButton size="sm" className="mt-1" onClick={() => void checkContent()}>
          Check for updates
        </PixelButton>
      </Panel>

      <p className="copy text-muted">
        Pokédice is a personal, non-commercial fan project. Pokémon © Nintendo / Creatures / GAME FREAK. Sprites via PokeAPI.{' '}
        <Link to="/setup" className="underline">
          Deployment guide
        </Link>
      </p>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your save?">
        <p className="copy mb-4 text-lg">This can't be undone{auth.status === 'signed_in' ? ' (the cloud copy stays until you start a new game)' : ''}.</p>
        <div className="flex justify-end gap-2">
          <PixelButton onClick={() => setConfirmDelete(false)}>Cancel</PixelButton>
          <PixelButton
            variant="danger"
            onClick={() => {
              deleteSave()
              navigate('/')
            }}
          >
            Delete
          </PixelButton>
        </div>
      </Modal>
    </div>
  )
}
