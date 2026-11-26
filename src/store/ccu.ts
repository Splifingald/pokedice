// The player cap (docs/74): before anything else asks the server for anything, the game asks for a place
// (ccu_join, migration 0157). In, it plays, and says it's still there every 30 s (ccu_heartbeat, with whether the
// player touched anything since: Idle mode playing by itself is no input). Full, it waits in line, saying so every
// 15 s, and gets in by itself when its turn comes. The server decides everything; this only asks, keeps the token
// (src/lib/ccuToken.ts, sent with every request) and shows the answer.
//
// A game that can't get an answer (offline, an older database, the cloud not set up) plays anyway, as it always has:
// saves are on the device, and once the gate is on (enforceWrites) the server refuses what needs a place.
import { create } from 'zustand'
import { t } from '@/i18n'
import { ccuToken, onCcuRequired, setCcuToken } from '@/lib/ccuToken'
import { deviceId } from '@/lib/device'
import { getSupabase, isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase'
import { pushToast, useGame } from './game'
import { onlineAnswered, onlineCard, onlineCardDue, routeOnlineThroughHeartbeat } from './online'

/**
 * checking: asking at start (nothing else runs yet); active: in the game; queued: in line; open: no answer to go by
 * (offline, the cap not on this server), so the game plays as before.
 */
export type CcuStatus = 'checking' | 'active' | 'queued' | 'open'

export interface CcuView {
  status: CcuStatus
  /** In line: this player's place (1 is next) and how many wait. */
  position: number | null
  queueLength: number | null
  /** Sent to the back of the line for being idle (the line says why). */
  idle: boolean
  idleMinutes: number
  /** How many players the game takes at once (the rules' number). */
  cap: number | null
}

export const useCcu = create<CcuView>(() => ({
  status: 'checking',
  position: null,
  queueLength: null,
  idle: false,
  idleMinutes: 10,
  cap: null,
}))

/** The server's answer to a join or a heartbeat. */
export interface CcuAnswer {
  status: 'active' | 'queued' | 'gone'
  token: string | null
  position: number | null
  queueLength: number | null
  idle: boolean
  heartbeatSeconds: number
  queueHeartbeatSeconds: number
  idleMinutes: number
  cap: number | null
  online: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** Seconds the server asked for, kept to what a timer can sensibly do. */
const secs = (v: unknown, d: number) => Math.min(300, Math.max(5, num(v) ?? d))

/** Null when it isn't one (a server without the cap, a stand-in that answers anything). */
export function parseCcuAnswer(v: unknown): CcuAnswer | null {
  const o = (v ?? {}) as Record<string, unknown>
  if (o.status !== 'active' && o.status !== 'queued' && o.status !== 'gone') return null
  const token = typeof o.token === 'string' && /^[0-9a-f]{16,128}$/.test(o.token) ? o.token : null
  if (o.status !== 'gone' && !token) return null
  return {
    status: o.status,
    token,
    position: num(o.position),
    queueLength: num(o.queueLength),
    idle: o.reason === 'idle',
    heartbeatSeconds: secs(o.heartbeatSeconds, 30),
    queueHeartbeatSeconds: secs(o.queueHeartbeatSeconds, 15),
    idleMinutes: num(o.idleMinutes) ?? 10,
    cap: num(o.cap),
    online: num(o.online),
  }
}

/** The start waits this long for the first answer; past it the game starts, and a late "full" still counts. */
export const BOOT_WAIT_MS = 6000
/** After a failed ask: again after 30 s, then twice as long each time, up to 5 minutes. */
const RETRY_FIRST_MS = 30_000
const RETRY_MAX_MS = 5 * 60_000
/** The gate's refusals (HTTP 428) ask again at most this often. */
const REQUIRED_GAP_MS = 10_000

let timer: ReturnType<typeof setTimeout> | undefined
let joining: Promise<void> | null = null
let beating = false
let hadInput = false
let retryMs = RETRY_FIRST_MS
let lastRequired = 0
/** The next heartbeat carries the players-online card (asked for by the side menu, docs/70). */
let cardAsked = false
/** A heartbeat with the card failed on the server (players online not set up): the card goes the old way. */
let cardBroken = false

function schedule(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void beat(), ms)
}

function scheduleJoin() {
  clearTimeout(timer)
  timer = setTimeout(() => void join(), retryMs)
  retryMs = Math.min(RETRY_MAX_MS, retryMs * 2)
}

const notDeployed = (err: unknown) => {
  const e = err as { code?: string; status?: number }
  return e?.code === 'PGRST202' || e?.code === '42883' || e?.status === 404
}

/** No answer to go by: play on (unless already in line, which stays until the server says otherwise). */
function noAnswer(retry: boolean) {
  const { status } = useCcu.getState()
  if (status === 'checking') useCcu.setState({ status: 'open' })
  if (retry) scheduleJoin()
}

function apply(a: CcuAnswer) {
  retryMs = RETRY_FIRST_MS
  if (a.token) setCcuToken(a.token)
  const was = useCcu.getState().status
  useCcu.setState({
    status: a.status === 'active' ? 'active' : 'queued',
    position: a.status === 'queued' ? a.position : null,
    queueLength: a.status === 'queued' ? a.queueLength : null,
    idle: a.status === 'queued' && a.idle,
    idleMinutes: a.idleMinutes,
    cap: a.cap,
  })
  if (a.status === 'active' && was === 'queued') pushToast(t('ui.ccu.in'), 'good')
  if (a.online != null) onlineAnswered(a.online)
  schedule((a.status === 'active' ? a.heartbeatSeconds : a.queueHeartbeatSeconds) * 1000)
}

/** Asks for a place, with the token this browser kept (a reload within the grace keeps its place). */
export function join(): Promise<void> {
  joining ??= (async () => {
    const client = await getSupabase()
    if (!client) return noAnswer(false)
    try {
      const { data, error } = await client.rpc('ccu_join', {
        p_device_id: deviceId(),
        p_previous_token: ccuToken(),
      })
      if (error) {
        // An older database: no cap to wait for, and no use asking again on this page.
        if (notDeployed(error)) return noAnswer(false)
        throw error
      }
      const a = parseCcuAnswer(data)
      if (!a || a.status === 'gone') return noAnswer(false)
      apply(a)
    } catch {
      noAnswer(true)
    }
  })().finally(() => {
    joining = null
  })
  return joining
}

/** Still here: in the game or in line. 'gone' (lost, or signed in or out since): join again, keeping the token. */
async function beat(): Promise<void> {
  if (!ccuToken()) return join()
  if (beating || joining) return
  beating = true
  const input = hadInput
  hadInput = false
  const card =
    useCcu.getState().status === 'active' && !cardBroken && (cardAsked || onlineCardDue())
      ? onlineCard()
      : null
  cardAsked = false
  try {
    const client = await getSupabase()
    if (!client) return
    const { data, error } = await client.rpc('ccu_heartbeat', {
      p_token: ccuToken(),
      p_had_input: input,
      p_card: card,
    })
    if (error) {
      if (notDeployed(error)) return noAnswer(false)
      if (card) cardBroken = true
      throw error
    }
    const a = parseCcuAnswer(data)
    if (!a) return noAnswer(false)
    if (a.status === 'gone') {
      beating = false
      return join()
    }
    apply(a)
  } catch {
    hadInput ||= input
    const { status } = useCcu.getState()
    schedule((status === 'queued' ? 15 : 30) * 1000)
  } finally {
    beating = false
  }
}

/** The page closing: the place is kept a minute for a reload, then freed (best effort, it may never arrive). */
function leave() {
  const token = ccuToken()
  if (!token || !SUPABASE_URL || typeof fetch !== 'function') return
  fetch(`${SUPABASE_URL}/rest/v1/rpc/ccu_leave`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  }).catch(() => {})
}

const markInput = () => {
  hadInput = true
}

let started = false
/** At start, before anything else reaches the server (the gate in App.tsx waits for the answer). */
export function startCcu() {
  if (started) return
  started = true
  if (!isSupabaseConfigured) {
    useCcu.setState({ status: 'open' })
    return
  }
  // A call the gate refused: this page's place is gone (lost while frozen in the background): ask again.
  onCcuRequired(() => {
    if (Date.now() - lastRequired < REQUIRED_GAP_MS) return
    lastRequired = Date.now()
    void beat()
  })
  // The players-online ping rides on the heartbeat while in the game (docs/70).
  routeOnlineThroughHeartbeat((minGap) => {
    if (useCcu.getState().status !== 'active' || !ccuToken() || cardBroken) return false
    if (onlineCardDue(minGap)) {
      cardAsked = true
      void beat()
    }
    return true
  })
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'])
    window.addEventListener(type, markInput, { capture: true, passive: true })
  window.addEventListener('pagehide', leave)
  // Back from the back-forward cache, or back to a tab a phone froze: the place may be gone; ask at once.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void join()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && useCcu.getState().status !== 'checking') void beat()
  })
  window.addEventListener('online', () => {
    if (useCcu.getState().status === 'open') void join()
  })
  // Signed in or out: the place goes with the player (the heartbeat says 'gone', and the join carries it over).
  useGame.subscribe((s, prev) => {
    if (s.auth.userId !== prev.auth.userId && prev.auth.status !== 'unknown') void beat()
  })
  setTimeout(() => {
    if (useCcu.getState().status === 'checking') useCcu.setState({ status: 'open' })
  }, BOOT_WAIT_MS)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    useCcu.setState({ status: 'open' })
    return
  }
  void join()
}

/** Tests: forget everything. */
export function resetCcu() {
  clearTimeout(timer)
  joining = null
  beating = false
  hadInput = false
  retryMs = RETRY_FIRST_MS
  lastRequired = 0
  cardAsked = false
  cardBroken = false
  started = false
  useCcu.setState({
    status: 'checking',
    position: null,
    queueLength: null,
    idle: false,
    idleMinutes: 10,
    cap: null,
  })
}
