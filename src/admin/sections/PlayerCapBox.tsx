// Admin → Config → Capacity: the player cap (docs/74). Its settings, saved straight to game_config 'ccu' through
// ccu_admin_config() and live at once (no Publish: a content version bump would make every player download the content
// again for one number); the counters, asked every 10 s; and the whitelist (beta_testers, migration 0131), with a
// searchable pick of the signed-in players and a note each. Everything is checked again by the server (is_admin()).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_CONFIG, type PlayerCapConfig } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import { getSupabase } from '@/lib/supabase'
import { cx } from '@/theme/util'
import { AccessSwitch, Box, Field, inputCls, NumInput } from '../widgets'

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const client = await getSupabase()
  if (!client) throw new Error('no database')
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}

function refusal(err: unknown): string {
  const e = err as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883')
    return 'The database has no player cap yet: run supabase/migrations/0157_player_cap.sql.'
  if (e.message?.includes('ccu_no_account')) return 'No account with that id.'
  return `Refused: ${e.message ?? String(err)}`
}

interface Stats {
  active: number
  regular: number
  admin: number
  whitelist: number
  queued: number
  idleQueued: number
  longestWaitSeconds: number
  config: PlayerCapConfig
  at: string
}

/** The counters, asked every 10 s while the page is visible; shared by the settings and the counters' boxes. */
function useStats(): { stats: Stats | null; error: string | null; reload: () => void } {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    call<Stats>('ccu_admin_stats')
      .then((s) => {
        setStats(s)
        setError(null)
      })
      .catch((err) => setError(refusal(err)))
  }, [])
  useEffect(() => {
    reload()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload()
    }, 10_000)
    return () => clearInterval(id)
  }, [reload])
  return { stats, error, reload }
}

const ago = (secs: number) =>
  secs < 90 ? `${secs} s` : secs < 5400 ? `${Math.round(secs / 60)} min` : `${Math.round(secs / 3600)} h`

function Counter({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'warn' }) {
  return (
    <div className="flex flex-col bg-paper p-2 shadow-card">
      <span className="font-pixel-sm text-[16px] text-muted">{label}</span>
      <span
        className={cx(
          'text-[34px] leading-none tabular-nums',
          tone === 'good' && 'text-good',
          tone === 'warn' && 'text-danger',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function CountersBox({ stats, error }: { stats: Stats | null; error: string | null }) {
  const cfg = stats?.config
  const over = stats && cfg ? Math.max(0, stats.active - cfg.cap) : 0
  return (
    <Box
      title="Players in the game now"
      icon="user"
      hint="Every open game says it's there every 30 s (15 s while waiting); one gone 90 s no longer counts. Asked again every 10 s."
    >
      {error && <p className="text-base text-danger">{error}</p>}
      {stats && cfg && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Counter
              label={`In the game (cap ${cfg.cap})`}
              value={stats.active}
              tone={stats.active >= cfg.cap ? 'warn' : 'good'}
            />
            <Counter label="Regular" value={stats.regular} />
            <Counter label="Admin" value={stats.admin} />
            <Counter label="Whitelist" value={stats.whitelist} />
            <Counter label="Waiting in line" value={stats.queued} tone={stats.queued ? 'warn' : undefined} />
            <Counter label="Sent back for idling" value={stats.idleQueued} />
            <Counter label="Longest wait" value={stats.queued ? ago(stats.longestWaitSeconds) : '—'} />
          </div>
          {cfg.access !== 'all' && (
            <p className="text-base text-muted">
              The cap is {cfg.access === 'off' ? 'Off' : 'On for admin'}: nobody else waits.{' '}
              {over > 0
                ? `On for everyone, ${over} would be over the cap right now.`
                : 'On for everyone, nobody would wait right now.'}
            </p>
          )}
          <p className="text-base text-muted">As of {new Date(stats.at).toLocaleTimeString()}.</p>
        </>
      )}
      {!stats && !error && <p className="text-base text-muted">Loading…</p>}
    </Box>
  )
}

/** The numbers, as the admin edits them before saving. */
type Draft = PlayerCapConfig

const NUMBERS: { key: keyof Draft; label: string; hint: string; min: number; max: number }[] = [
  {
    key: 'cap',
    label: 'Players at once (cap)',
    hint: 'regular players; the admin and the whitelist get in over it, and count',
    min: 0,
    max: 100000,
  },
  {
    key: 'idleMinutes',
    label: 'Idle minutes',
    hint: 'no input this long, and someone waiting: back of the line',
    min: 1,
    max: 1440,
  },
  {
    key: 'heartbeatSeconds',
    label: 'Heartbeat (s)',
    hint: 'in the game: how often it says it is there',
    min: 10,
    max: 120,
  },
  {
    key: 'queueHeartbeatSeconds',
    label: 'Line heartbeat (s)',
    hint: 'waiting: how often it asks for its turn',
    min: 5,
    max: 120,
  },
  {
    key: 'staleSeconds',
    label: 'Lost after (s)',
    hint: 'not heard from this long: the place frees (at least 2 heartbeats + 10)',
    min: 30,
    max: 900,
  },
  {
    key: 'reconnectGraceSeconds',
    label: 'Reload grace (s)',
    hint: 'a closed page keeps its place this long for a reload',
    min: 0,
    max: 600,
  },
]

function SettingsBox({ stats, reload }: { stats: Stats | null; reload: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const saved = stats?.config ?? null
  const cfg: Draft = draft ?? saved ?? DEFAULT_CONFIG.ccu
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (patch: Partial<Draft>) => setDraft({ ...cfg, ...patch })
  const save = async () => {
    if (!draft) return
    if (draft.enforceWrites && !saved?.enforceWrites) {
      const ok = window.confirm(
        'Turn the server gate on? Games without a place (in line, or a build from before the cap) will have every save, Versus, trade, friend and raid call refused until they get one. Do it a day after the cap was deployed, or after Reload all players.',
      )
      if (!ok) return
    }
    setNote('…')
    try {
      const back = await call<PlayerCapConfig>('ccu_admin_config', { p_cfg: draft })
      setDraft(null)
      setNote(
        `Saved, live now: cap ${back.cap}, ${back.access === 'all' ? 'on for everyone' : back.access === 'admin' ? 'on for admin' : 'off'}, gate ${back.enforceWrites ? 'on' : 'off'}.`,
      )
      reload()
    } catch (err) {
      setNote(refusal(err))
    }
  }
  return (
    <Box
      title="Player cap"
      icon="gear"
      hint="Off: everyone gets in, and is counted. On for admin: your own game waits in line like a regular player's (try it with a low cap), everyone else gets in. On for everyone: the cap. Nobody in the game is ever sent out by a change here. Saved live: no Publish, no reload."
      actions={
        <PixelButton
          size="sm"
          variant={dirty ? 'primary' : 'secondary'}
          disabled={!dirty}
          onClick={() => void save()}
        >
          Save
        </PixelButton>
      }
    >
      <AccessSwitch
        value={cfg.access}
        onChange={(access) => set({ access: access === 'beta' ? 'admin' : access })}
        label="Player cap: who has it"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {NUMBERS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <NumInput
              min={f.min}
              max={f.max}
              value={cfg[f.key] as number}
              onChange={(v) => set({ [f.key]: Math.max(f.min, Math.min(f.max, Math.round(v ?? f.min))) })}
            />
          </Field>
        ))}
      </div>
      <label className="flex items-start gap-2 text-lg">
        <input
          type="checkbox"
          className="mt-1.5"
          checked={cfg.enforceWrites}
          onChange={(e) => set({ enforceWrites: e.target.checked })}
        />
        <span>
          Server gate (enforceWrites)
          <span className="block text-base text-muted">
            On: every save, Versus, raid, trade, friend and players-online call needs a place in the game, so
            editing the game can't skip the line. Content reads, the admin and the account deletion never need
            one. Off while rolling out: the counters above show whether games get their places.
          </span>
        </span>
      </label>
      {note && <p className="text-base text-muted">{note}</p>}
    </Box>
  )
}

interface Account {
  id: string
  name: string | null
  email: string | null
  lastDay?: string | null
}
interface Listed extends Account {
  note: string | null
  addedAt: string
}

const accountLabel = (a: Account) => `${a.name ?? 'Trainer'} ${a.email ?? ''}`

function AccountOption({ a }: { a: Account }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">{a.name ?? 'Trainer'}</span>
      <span className="truncate text-base text-muted">{a.email ?? 'no e-mail'}</span>
    </span>
  )
}

/** One row of the list: the note saves when the field is left. */
function WhitelistRow({
  row,
  onNote,
  onRemove,
}: {
  row: Listed
  onNote: (note: string) => void
  onRemove: () => void
}) {
  const [note, setNote] = useState(row.note ?? '')
  useEffect(() => setNote(row.note ?? ''), [row.note])
  return (
    <tr className="border-t-2 border-line align-middle">
      <td className="py-1.5 pr-2 text-lg">{row.name ?? 'Trainer'}</td>
      <td className="max-w-[14rem] truncate py-1.5 pr-2 text-base text-muted">{row.email ?? '—'}</td>
      <td className="py-1.5 pr-2">
        <input
          className={cx(inputCls, 'min-w-[10rem]')}
          aria-label={`Note for ${row.name ?? 'Trainer'}`}
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (row.note ?? '') && onNote(note)}
        />
      </td>
      <td className="whitespace-nowrap py-1.5 pr-2 text-base text-muted">
        {row.addedAt ? new Date(row.addedAt).toLocaleDateString() : '—'}
      </td>
      <td className="py-1.5 text-right">
        <PixelButton size="sm" onClick={onRemove}>
          Remove
        </PixelButton>
      </td>
    </tr>
  )
}

/**
 * The whitelist: beta_testers. Always let in past the cap (signed in), and shown every feature set "On for beta
 * testers" (docs/65 §3): one list for both.
 */
export function WhitelistBox() {
  const [list, setList] = useState<Listed[] | null>(null)
  const [players, setPlayers] = useState<Account[]>([])
  const [pick, setPick] = useState<Account | null>(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => {
    call<Listed[]>('ccu_whitelist')
      .then((l) => setList(Array.isArray(l) ? l : []))
      .catch((err) => setMsg(refusal(err)))
  }, [])
  useEffect(() => {
    load()
    call<Account[]>('ccu_admin_players')
      .then((p) => setPlayers(Array.isArray(p) ? p : []))
      .catch((err) => setMsg(refusal(err)))
  }, [load])
  const listed = useMemo(() => new Set(list?.map((l) => l.id)), [list])
  const options = useMemo(() => players.filter((p) => !listed.has(p.id)), [players, listed])
  const add = async () => {
    if (!pick) return
    try {
      await call('ccu_whitelist_set', { p_user: pick.id, p_note: note.trim() || null })
      setMsg(`${pick.name ?? 'Trainer'} is on the whitelist.`)
      setPick(null)
      setNote('')
      load()
    } catch (err) {
      setMsg(refusal(err))
    }
  }
  const saveNote = async (row: Listed, text: string) => {
    try {
      await call('ccu_whitelist_set', { p_user: row.id, p_note: text.trim() || null })
      setMsg(`Note saved for ${row.name ?? 'Trainer'}.`)
      load()
    } catch (err) {
      setMsg(refusal(err))
    }
  }
  const remove = async (row: Listed) => {
    try {
      await call('ccu_whitelist_remove', { p_user: row.id })
      setMsg(`${row.name ?? 'Trainer'} is off the whitelist.`)
      load()
    } catch (err) {
      setMsg(refusal(err))
    }
  }
  return (
    <Box
      title="Whitelist & beta testers"
      icon="user"
      hint={`Signed in, they always get in, even over the cap (and count), and see every feature set "On for beta testers". You always do. Removing one sends nobody out. ${list ? `${list.length} on the list.` : ''}`}
    >
      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        {/* Not a <label>: the picker is a button, which would take the label's words as its name. */}
        <div className="flex flex-col gap-0.5">
          <span className="text-lg leading-none">Signed-in player</span>
          <SearchSelect
            options={options}
            value={pick}
            onChange={setPick}
            getKey={(a) => a.id}
            getLabel={accountLabel}
            renderOption={(a) => <AccountOption a={a} />}
            placeholder="Search a name or an e-mail…"
          />
          <span className="text-sm text-muted">{options.length} to pick from, by name or e-mail</span>
        </div>
        <Field label="Note">
          <input
            className={inputCls}
            value={note}
            maxLength={200}
            placeholder="Why (streamer, tester…)"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <PixelButton size="sm" type="submit" disabled={!pick}>
          Add
        </PixelButton>
      </form>
      {msg && <p className="text-base text-muted">{msg}</p>}
      {list && list.length === 0 && <p className="text-base text-muted">Nobody on the whitelist yet.</p>}
      {list && list.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left font-pixel-sm text-[16px] text-muted">
                <th className="pb-1 pr-2 font-normal">Player</th>
                <th className="pb-1 pr-2 font-normal">E-mail</th>
                <th className="pb-1 pr-2 font-normal">Note</th>
                <th className="pb-1 pr-2 font-normal">Added</th>
                <th className="pb-1 font-normal">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <WhitelistRow
                  key={row.id}
                  row={row}
                  onNote={(text) => void saveNote(row, text)}
                  onRemove={() => void remove(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  )
}

/** The Capacity tab: the settings and the counters side by side on a wide screen, the whitelist under them. */
export function PlayerCapTab() {
  const { stats, error, reload } = useStats()
  return (
    <div className="grid items-start gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <SettingsBox stats={stats} reload={reload} />
        <CountersBox stats={stats} error={error} />
      </div>
      <WhitelistBox />
    </div>
  )
}
