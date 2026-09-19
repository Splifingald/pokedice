import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HelpButton } from '@/components/HelpButton'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { PixelButton } from '@/components/PixelButton'
import { multiExpText } from '@/engine'
import { isSupabaseConfigured } from '@/lib/supabase'
import { parseSave } from '@/save/schema'
import { mutateSave, pushToast, setSettings, useGame } from '@/store/game'
import { deleteSave, replaceSave } from '@/store/run'
import { useIsAdmin } from '@/store/hooks'
import { checkContent } from '@/store/sync'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import { SaveFacts } from '@/components/SyncConflictModal'
import { backupSave, readBackups } from '@/save/storage'
import { playerOf, TrainerSprite } from '@/components/TrainerArt'
import { CharacterSelect } from './NewGame'

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

      <Panel title="How to play">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="copy text-muted">The rules, the dice, status effects and the type chart.</p>
          <HelpButton size="md" label />
        </div>
      </Panel>

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
              ? `Team members who didn't fight still get ${multiExpText(data)}.`
              : 'Disabled by the game settings right now.'
          }
          on={settings.multiExp}
          onChange={(v) => setSettings({ multiExp: v })}
        />
        {/* Admins only — but a player who already turned it on still sees it, so they can turn it off. */}
        {(isAdmin || settings.reducedMotion) && (
          <Toggle
            label="Reduced motion"
            hint="Instant transitions, no shake or particles. Your OS setting is respected too."
            on={settings.reducedMotion}
            onChange={(v) => setSettings({ reducedMotion: v })}
          />
        )}
      </Panel>

      {save && <CharacterPanel />}

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

      <BackupsPanel />

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

/** Saves replaced by a cloud sync (or a restore) on this device — a wrong choice can be undone here. */
function BackupsPanel() {
  const [list, setList] = useState(() => readBackups())
  const [confirm, setConfirm] = useState<number | null>(null)
  if (!list.length) return null
  return (
    <Panel title="Save backups">
      <p className="copy mb-2 text-muted">Saves replaced on this device, newest first. Restoring one replaces your current save (which is kept here too).</p>
      <ul className="flex flex-col gap-2">
        {list.map((b) => (
          <li key={b.at} className="flex flex-wrap items-center gap-3 border-2 border-ink bg-panel p-2">
            <div className="min-w-0 flex-1">
              <div className="text-lg leading-tight">{b.reason}</div>
              <div className="text-base text-muted">Saved aside {new Date(b.at).toLocaleString()}</div>
              <SaveFacts save={b.save} />
            </div>
            <PixelButton
              size="sm"
              variant={confirm === b.at ? 'danger' : 'secondary'}
              onClick={() => {
                if (confirm !== b.at) return setConfirm(b.at)
                const current = useGame.getState().save
                if (current) backupSave(current, 'Your save before restoring a backup')
                replaceSave({ ...b.save, updatedAt: Date.now() })
                setConfirm(null)
                setList(readBackups())
                pushToast('Backup restored', 'good')
              }}
            >
              {confirm === b.at ? 'Replace my save?' : 'Restore'}
            </PixelButton>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function CharacterPanel() {
  const save = useGame((s) => s.save)
  const [editing, setEditing] = useState(false)
  const me = playerOf(save)
  return (
    <Panel title="Your character">
      {editing ? (
        <CharacterSelect
          initial={save?.player}
          submitLabel="SAVE"
          compact
          onDone={(player) => {
            mutateSave((s) => ({ ...s, player }))
            setEditing(false)
          }}
        />
      ) : (
        <div className="flex items-center gap-3">
          <TrainerSprite src={`/characters/${me.character}.png`} size={64} />
          <span className="flex-1 text-2xl">{me.name || 'No name yet'}</span>
          <PixelButton onClick={() => setEditing(true)}>CHANGE</PixelButton>
        </div>
      )}
    </Panel>
  )
}
