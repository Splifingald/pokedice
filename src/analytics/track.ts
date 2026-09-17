// Sends analytics events to Supabase in small batches. Never blocks the game: events wait in localStorage while
// offline (capped), and any failure just retries on the next flush.
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { onSaveCommitted, useGame } from '@/store/game'
import { diffSaves, type AnalyticsEvent } from './events'

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
  kind: AnalyticsEvent['kind']
  params: AnalyticsEvent['params']
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

export function track(events: AnalyticsEvent[]) {
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
    if (document.visibilityState === 'hidden') void flushAnalytics()
  })
  void flushAnalytics()
}
