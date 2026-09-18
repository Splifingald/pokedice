// Sends analytics events to Supabase in small batches. Never blocks the game: events wait in localStorage while
// offline (capped), and any failure just retries on the next flush.
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { onSaveCommitted, useGame } from '@/store/game'
import { diffSaves, snapshotOf, SYSTEM_KINDS, type SystemKind, type TrackedEvent } from './events'

const QUEUE_KEY = 'pokedice.analytics.queue'
const DEVICE_KEY = 'pokedice.analytics.device'
const MAX_QUEUED = 500
const FLUSH_MS = 15_000

interface QueuedRow {
  created_at: string
  user_id: string | null
  device_id: string
  player_name: string | null
  email: string | null
  kind: TrackedEvent['kind']
  params: TrackedEvent['params']
}

const store = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function deviceId(): string {
  const ls = store()
  let id = ls?.getItem(DEVICE_KEY) ?? null
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      ls?.setItem(DEVICE_KEY, id)
    } catch {
      /* private mode: a per-session id is fine */
    }
  }
  return id
}

let queue: QueuedRow[] = []
const loadQueue = () => {
  try {
    queue = JSON.parse(store()?.getItem(QUEUE_KEY) ?? '[]') as QueuedRow[]
  } catch {
    queue = []
  }
}
const persistQueue = () => {
  try {
    store()?.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    /* storage full: the in-memory queue still flushes */
  }
}

export function track(events: TrackedEvent[]) {
  if (!isSupabaseConfigured || !events.length) return
  const { auth, save } = useGame.getState()
  const signedIn = auth.status === 'signed_in'
  const base = {
    created_at: new Date().toISOString(),
    user_id: signedIn ? auth.userId : null,
    device_id: deviceId(),
    player_name: save?.player?.name?.trim() || null,
    email: signedIn ? auth.email : null,
  }
  queue = [...queue, ...events.map((e) => ({ ...base, kind: e.kind, params: e.params }))].slice(-MAX_QUEUED)
  persistQueue()
}

let flushing = false
export async function flushAnalytics() {
  if (flushing || !queue.length) return
  flushing = true
  const batch = queue.slice(0, 100)
  try {
    const client = await getSupabase()
    if (!client) return
    const { error } = await client.from('analytics_events').insert(batch)
    // A database without migration 0008 refuses the background kinds (check violation, 23514): drop those rows so
    // they can't hold up the player's real events, which go out on the next flush.
    if (error?.code === '23514' && batch.some((r) => SYSTEM_KINDS.includes(r.kind as SystemKind))) {
      queue = queue.filter((r) => !SYSTEM_KINDS.includes(r.kind as SystemKind))
      persistQueue()
      return
    }
    if (error) throw error
    queue = queue.slice(batch.length)
    persistQueue()
  } catch (err) {
    console.info('[analytics] will retry:', err instanceof Error ? err.message : err)
  } finally {
    flushing = false
  }
}

let loggedInAs: string | null = null
/** One "login" per page load per account (called by the auth flow). */
export function trackLogin(userId: string) {
  if (loggedInAs === userId) return
  loggedInAs = userId
  track([{ kind: 'login', params: { method: 'session' } }])
  void flushAnalytics()
}

// ---------------------------------------------------------------- playtime & snapshots

const TICK_S = 15
/** Played time counts while the tab is visible and the player touched or typed in the last 2 minutes. */
const IDLE_MS = 2 * 60_000
const PLAYTIME_EVERY_S = 5 * 60
const SNAPSHOT_EVERY_MS = 10 * 60_000

let lastInput = Date.now()
let unsent = 0
let lastSnapshot = ''

function sendPlaytime(min = 1) {
  if (unsent < min) return
  track([{ kind: 'playtime', params: { seconds: unsent } }])
  unsent = 0
}

/** The player's current state, only when it changed since the last one sent. */
function sendSnapshot() {
  const { save, data } = useGame.getState()
  if (!save) return
  const snap = snapshotOf(save, data)
  const key = JSON.stringify(snap)
  if (key === lastSnapshot) return
  lastSnapshot = key
  track([{ kind: 'snapshot', params: snap }])
}

function startPlaytime() {
  const input = () => (lastInput = Date.now())
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel'])
    window.addEventListener(ev, input, { passive: true, capture: true })
  setInterval(() => {
    if (document.visibilityState !== 'visible' || Date.now() - lastInput > IDLE_MS) return
    unsent += TICK_S
    if (unsent >= PLAYTIME_EVERY_S) sendPlaytime()
  }, TICK_S * 1000)
  setTimeout(sendSnapshot, 5_000)
  setInterval(sendSnapshot, SNAPSHOT_EVERY_MS)
}

let started = false
export function startAnalytics() {
  if (started || !isSupabaseConfigured) return
  started = true
  loadQueue()
  onSaveCommitted((next, prev) => {
    const { data, battle, run } = useGame.getState()
    const where = run.phase === 'catch' ? 'catch' : battle ? 'battle' : 'field'
    track(diffSaves(prev, next, data, where))
  })
  setInterval(() => void flushAnalytics(), FLUSH_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    sendPlaytime()
    sendSnapshot()
    void flushAnalytics()
  })
  startPlaytime()
  void flushAnalytics()
}
