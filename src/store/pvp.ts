// Friend Battles in the game (docs/65): the challenge waiting for you, the match you're in, and its fight held in
// lockstep with the other game. Every move goes to the server first (pvp_move); it lands here, on both games, with the
// seed the server answered it with, in the order the server gave it — a move missed while the socket was down is read
// back from pvp_state. The deadlines are watched here too: past one, this game asks the server to act for whoever
// didn't (pvp_timeout), and a player gone past the grace loses (pvp_claim).
import { create } from 'zustand'
import {
  applyPvpMove,
  draftAutoPick,
  draftChoices,
  draftTurn,
  markFriendBattlesRulesSeen,
  pvpHash,
  startPvp,
  type DraftMon,
  type PvpEntry,
  type PvpMatch,
  type PvpMode,
  type PvpLevel,
  type PvpMove,
  type PvpSide,
} from '@/engine'
import {
  isLive,
  listen,
  pvpAnswer,
  pvpCancel,
  pvpChallenge,
  pvpClaim,
  pvpError,
  pvpFinish,
  pvpHere,
  pvpHome,
  pvpMove,
  pvpOnline,
  pvpOrder,
  pvpPick,
  pvpPing,
  pvpState,
  pvpTimeout,
  type PvpHome,
  type PvpInfo,
  type PvpMoveRow,
} from '@/lib/pvp'
import { mutateSave, useGame } from './game'

export interface PvpStore {
  /** A challenge to you, waiting for your answer. */
  incoming: PvpInfo | null
  /** The match you're in: your challenge waiting, the draft, the order, the fight, or its end until you leave it. */
  match: PvpInfo | null
  /** Its fight, in lockstep (from the battle on), its log in side a's view, and the last move applied. */
  engine: PvpMatch | null
  log: PvpEntry[]
  applied: number
  /** A move of yours on its way to the server: the screen waits. */
  pending: boolean
  /** Friends in the game now (pvp_online), and when it was asked. */
  online: string[]
  onlineAt: number
  home: PvpHome | null
  /** The server's clock minus this one's, for the deadlines. */
  skew: number
  /** The last refusal, as a code. */
  error: string | null
}

const EMPTY = {
  incoming: null,
  match: null,
  engine: null,
  log: [],
  applied: 0,
  pending: false,
  error: null,
} satisfies Partial<PvpStore>

export const usePvp = create<PvpStore>(() => ({ ...EMPTY, online: [], onlineAt: 0, home: null, skew: 0 }))

/** Now, on the server's clock. */
export const serverNow = () => Date.now() + usePvp.getState().skew

/** The side you play in the match. */
export const mySide = (m: PvpInfo | null): PvpSide => m?.side ?? 'a'
export const foeOf = (m: PvpInfo) => (m.side === 'a' ? m.b : m.a)

const data = () => useGame.getState().data

function keepClock(info: PvpInfo) {
  usePvp.setState({ skew: info.serverNow - Date.now() })
}

/** The fight opened from the match's teams and seed (both games the same). */
function openEngine(info: PvpInfo): { engine: PvpMatch; log: PvpEntry[] } | null {
  if (info.seed == null || !info.foeTeam?.length || !info.team.length) return null
  const teamA = info.side === 'a' ? info.team : info.foeTeam
  const teamB = info.side === 'a' ? info.foeTeam : info.team
  const shield = info.mode === 'draft' ? info.firstPicker : null
  const r = startPvp(teamA, teamB, shield, data(), info.seed, info.cfg.shield, info.level)
  return { engine: r.match, log: r.log }
}

/** Takes a fresh view of the match: the fight opens when the battle has. */
function adopt(info: PvpInfo) {
  keepClock(info)
  const s = usePvp.getState()
  const same = s.match?.id === info.id
  const fresh = !same ? { engine: null, log: [], applied: 0, pending: false } : {}
  usePvp.setState({ match: info, ...fresh, ...(s.incoming?.id === info.id && { incoming: null }) })
  const now = usePvp.getState()
  if (!now.engine && (info.state === 'battle' || info.state === 'done' || info.state === 'void')) {
    const opened = openEngine(info)
    if (opened) usePvp.setState({ engine: opened.engine, log: opened.log, applied: 0 })
    // The fight took a battle ticket from each: the count shown follows.
    if (info.state === 'battle') void loadHome()
  }
}

/** One move, in the server's order. A gap reads the match back. */
function applyRow(row: PvpMoveRow) {
  const s = usePvp.getState()
  if (!s.engine || !s.match) return
  if (row.seq <= s.applied) return
  if (row.seq !== s.applied + 1) {
    void sync()
    return
  }
  const r = applyPvpMove(s.engine, row.side, row.move, row.seed, data())
  usePvp.setState({ engine: r.match, log: r.log.length ? [...s.log, ...r.log] : s.log, applied: row.seq })
  if (r.match.winner) void finish()
}

/** Reads the match and the moves this game hasn't applied. */
export async function sync(id = usePvp.getState().match?.id): Promise<void> {
  if (id == null) return
  try {
    const r = await pvpState(id, usePvp.getState().match?.id === id ? usePvp.getState().applied : 0)
    adopt(r.match)
    for (const m of r.moves) applyRow(m)
  } catch (err) {
    const code = pvpError(err)
    // Not yours any more (another account, the switch turned off): let it go.
    if (code === 'pvp_not_found' || code === 'pvp_off') usePvp.setState({ ...EMPTY })
  }
}

let finishTimer: ReturnType<typeof setTimeout> | null = null

/** The fight is over here: the result and its fingerprint to the server; alone, it settles 30 s later. */
async function finish(): Promise<void> {
  const { engine, match } = usePvp.getState()
  if (!engine?.winner || !match || match.state !== 'battle') return
  try {
    const info = await pvpFinish(match.id, engine.winner, pvpHash(engine))
    adopt(info)
    if (info.state === 'battle') {
      if (finishTimer) clearTimeout(finishTimer)
      finishTimer = setTimeout(() => void finish(), 31_000)
    } else void loadHome()
  } catch (err) {
    console.warn('[pvp] finish failed', err)
  }
}

// ---------------------------------------------------------------- what the screens call

export async function challenge(friend: string, mode: PvpMode, level: PvpLevel = 50): Promise<string | null> {
  try {
    adopt(await pvpChallenge(friend, mode, level))
    usePvp.setState({ error: null })
    return null
  } catch (err) {
    const code = pvpError(err)
    usePvp.setState({ error: code })
    return code
  }
}

export async function answer(accept: boolean): Promise<string | null> {
  const inc = usePvp.getState().incoming
  if (!inc) return null
  usePvp.setState({ incoming: null })
  try {
    const info = await pvpAnswer(inc.id, accept)
    if (accept) adopt(info)
    return null
  } catch (err) {
    return pvpError(err)
  }
}

export async function cancelChallenge(): Promise<void> {
  const m = usePvp.getState().match
  if (!m || m.state !== 'invited' || m.side !== 'a') return
  try {
    adopt(await pvpCancel(m.id))
  } catch (err) {
    console.warn('[pvp] cancel failed', err)
  }
}

export async function pick(mon: Pick<DraftMon, 'dex' | 'shiny'>): Promise<string | null> {
  const m = usePvp.getState().match
  if (!m || usePvp.getState().pending) return null
  usePvp.setState({ pending: true })
  try {
    adopt(await pvpPick(m.id, mon))
    return null
  } catch (err) {
    void sync()
    return pvpError(err)
  } finally {
    usePvp.setState({ pending: false })
  }
}

export async function setOrder(order: number[]): Promise<string | null> {
  const m = usePvp.getState().match
  if (!m || usePvp.getState().pending) return null
  usePvp.setState({ pending: true })
  try {
    adopt(await pvpOrder(m.id, order))
    return null
  } catch (err) {
    void sync()
    return pvpError(err)
  } finally {
    usePvp.setState({ pending: false })
  }
}

/** Your move in the fight: to the server, then here with its seed. Out of turn or mid-flight, nothing happens. */
export async function sendMove(move: PvpMove): Promise<void> {
  const s = usePvp.getState()
  if (!s.match || !s.engine || s.engine.winner || s.pending) return
  const me = mySide(s.match)
  if (move.k !== 'forfeit' && s.engine.actor !== me) return
  usePvp.setState({ pending: true })
  try {
    const r = await pvpMove(s.match.id, s.applied + 1, move)
    applyRow({ seq: r.seq, side: me, move, seed: r.seed })
    if (move.k === 'forfeit') void sync()
  } catch (err) {
    // Another move got there first (the other side's time-out): catch up.
    console.warn('[pvp] move refused', pvpError(err))
    await sync()
  } finally {
    usePvp.setState({ pending: false })
  }
}

/** Battle tickets after a Friend Market purchase (the server's new count), or a fight's start. */
export function setTickets(balance: number) {
  const home = usePvp.getState().home
  if (home?.tickets) usePvp.setState({ home: { ...home, tickets: { ...home.tickets, balance } } })
}

/** Leaves a finished (or refused) match's screen. */
export function leaveMatch() {
  const { match: m, engine } = usePvp.getState()
  // A match still on stays (its banner brings you back); one whose fight is over here can go before the server settles.
  if (m && isLive(m.state) && !engine?.winner) return
  usePvp.setState({ match: null, engine: null, log: [], applied: 0, pending: false })
}

export async function loadHome(): Promise<void> {
  try {
    const home = await pvpHome()
    usePvp.setState({ home })
    const cur = home?.current
    if (!cur) return
    if (cur.side === 'b' && cur.state === 'invited') {
      keepClock(cur)
      usePvp.setState({ incoming: cur })
    } else if (usePvp.getState().match?.id !== cur.id) await sync(cur.id)
  } catch (err) {
    console.warn('[pvp] home not loaded', pvpError(err))
  }
}

/** Friends in the game now; at most every 20 s unless forced. */
export async function loadOnline(force = false): Promise<void> {
  if (!force && Date.now() - usePvp.getState().onlineAt < 20_000) return
  usePvp.setState({ onlineAt: Date.now() })
  try {
    usePvp.setState({ online: await pvpOnline() })
  } catch {
    // Offline or before 0131: nobody shows as online.
  }
}

export const seeFriendBattlesRules = () => mutateSave(markFriendBattlesRulesSeen)

// ---------------------------------------------------------------- the service (GameLayout keeps it running)

/** A challenge or a state change arrived on your inbox. */
async function onInbox(id: number) {
  const s = usePvp.getState()
  if (s.match?.id === id) return sync(id)
  try {
    const r = await pvpState(id, 0)
    const info = r.match
    keepClock(info)
    if (info.side === 'b' && info.state === 'invited') usePvp.setState({ incoming: info })
    else if (usePvp.getState().incoming?.id === id) usePvp.setState({ incoming: null })
    if (info.side === 'b' && isLive(info.state) && info.state !== 'invited') {
      adopt(info)
      for (const m of r.moves) applyRow(m)
    }
  } catch {
    // Gone already.
  }
}

let inboxLeave: (() => void) | null = null
let inboxUser: string | null = null
let matchLeave: (() => void) | null = null
let matchTopic: number | null = null
let lastTimeout = ''
let lastAuto = ''
let lastClaim = 0
let lastPing = 0
/** When the match's topic (or a read) last brought news: silent too long, the store reads the match itself. */
let lastHeard = Date.now()
const QUIET_MS = 8_000

/** Joins (or leaves) your inbox: while the feature is open to you and you're signed in. */
export async function keepInbox(user: string | null) {
  if (user === inboxUser) return
  inboxLeave?.()
  inboxLeave = null
  inboxUser = user
  if (!user) {
    usePvp.setState({ ...EMPTY, home: null, online: [] })
    return
  }
  const leave = await listen(`pvp-inbox:${user}`, {
    onChallenge: (p) => void onInbox(p.id),
    onState: (p) => void onInbox(p.id),
    onStatus: (joined) => {
      if (joined) void loadHome()
    },
  })
  if (inboxUser === user) inboxLeave = leave
  else leave()
}

/** Joins the match's topic while one is live, and leaves it after. */
export async function keepMatchTopic() {
  const m = usePvp.getState().match
  const want = m && isLive(m.state) ? m.id : null
  if (want === matchTopic) return
  matchLeave?.()
  matchLeave = null
  matchTopic = want
  if (want == null) return
  const leave = await listen(`pvp:${want}`, {
    onMove: (row) => {
      lastHeard = Date.now()
      applyRow(row)
    },
    onState: () => {
      lastHeard = Date.now()
      void sync(want)
    },
    onStatus: (joined) => {
      if (joined) void sync(want)
    },
  })
  if (matchTopic === want) matchLeave = leave
  else leave()
}

/** Tells the server you're in the game (friends see "Online now"). */
export async function here() {
  try {
    await pvpHere()
  } catch {
    // Offline or before 0131.
  }
}

/**
 * Once a second while a match is live: your draft pick made for you just before your time runs out (the strongest
 * left), the server asked to act past a deadline, a ping every 20 s, and a claim when the other has been gone too long.
 */
export function tick() {
  const s = usePvp.getState()
  const m = s.match
  if (!m || !isLive(m.state) || m.deadline == null) return
  const now = serverNow()
  const me = mySide(m)
  if (Date.now() - lastPing > 20_000) {
    lastPing = Date.now()
    void pvpPing(m.id).catch(() => {})
  }
  // Realtime dropped or never joined (a blocked socket): the match read every few seconds instead, so nobody is stuck.
  if (Date.now() - lastHeard > QUIET_MS) {
    lastHeard = Date.now()
    void sync(m.id)
  }
  // My pick, about to time out: the strongest left rather than the server's highest level.
  if (m.state === 'draft' && draftTurn(m.firstPicker ?? 'a', m.picks.length) === me && now > m.deadline - 1500) {
    const key = `${m.id}:${m.picks.length}`
    if (lastAuto !== key && !s.pending) {
      lastAuto = key
      const mine = m.picks.filter((p) => p.side === me)
      const theirs = m.picks.filter((p) => p.side !== me)
      const best = draftAutoPick(draftChoices(m.cand, mine, theirs), data())
      if (best) void pick(best)
    }
  }
  if (now > m.deadline + 1500) {
    const key = `${m.id}:${m.state}:${m.deadline}:${s.applied}`
    if (lastTimeout !== key) {
      lastTimeout = key
      void pvpTimeout(m.id, m.state === 'battle' ? s.applied : undefined)
        .then((info) => {
          adopt(info)
          return sync(m.id)
        })
        .catch(() => {})
    }
  }
  // Past a deadline, the other may be gone: the server gives the win once they've been away longer than the grace (it
  // knows when each game last called), whatever time-outs played meanwhile.
  if (now > m.deadline && Date.now() - lastClaim > 15_000) {
    lastClaim = Date.now()
    void pvpClaim(m.id)
      .then((info) => adopt(info))
      .catch(() => {})
  }
}
