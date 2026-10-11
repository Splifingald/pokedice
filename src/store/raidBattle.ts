// The raid fight's driver (docs/19 §6.4): the sides (your raid team, NPC trainers in the empty slots), the opening,
// your turns, the catch. A raid isn't saved mid-fight: leaving or reloading is a free retry, the try already counted.
import { create } from 'zustand'
import {
  applyRaidCatch,
  ballBonus,
  catchValueOf,
  consumeItem,
  countRaidTry,
  createRaid,
  createRng,
  npcTeam,
  raidDispatch,
  raidHomeRegion,
  raidTeam,
  randomSeed,
  regionOf,
  rollCatch,
  todayRaid,
  utcDay,
  type CatchRoll,
  type RaidEvent,
  type RaidLogEntry,
  type RaidSideSeed,
  type RaidState,
  type TodayRaid,
} from '@/engine'
import { t } from '@/i18n'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { closeRaid, setRaidTeam, type RaidFriend } from '@/lib/raid'
import { commitSave, mutateSave, pushToast, useGame } from './game'
import { recordOnServer } from './raid'
import { newId } from './run'
import { serverNow } from './serverTime'
import { pushSaveNow } from './sync'

export type RaidStage = 'intro' | 'fight' | 'catch' | 'result'

export interface RaidCatch {
  /** The throw, once made. */
  result: (CatchRoll & { ballKey: string | null }) | null
  /** Where a caught raid Pokémon went: its home region, whether that's the region being played, or that it waits
   *  locked for its area. */
  region?: string
  live?: boolean
  locked?: boolean
}

export interface RaidRun {
  /** Changes with every new fight, so the screen starts over. */
  id: number
  /** The friends whose raid teams fight beside you: they get a gift if you catch it. */
  friends: RaidFriend[]
  raid: TodayRaid
  state: RaidState
  log: RaidLogEntry[]
  stage: RaidStage
  catch: RaidCatch | null
}

export const useRaidRun = create<{ run: RaidRun | null }>(() => ({ run: null }))

/** The friends picked for your group on the Raids page (for this visit; empty slots fill with NPCs at the start). */
export const useRaidGroup = create<{ friends: RaidFriend[] }>(() => ({ friends: [] }))

/** Puts a friend in your group (up to the raid's friend slots), or takes them out. */
export function toggleRaidFriend(f: RaidFriend) {
  const { data } = useGame.getState()
  const max = Math.min(2, data.config.events.raid.maxFriends)
  useRaidGroup.setState(({ friends }) =>
    friends.some((x) => x.userId === f.userId)
      ? { friends: friends.filter((x) => x.userId !== f.userId) }
      : friends.length >= max
        ? { friends }
        : { friends: [...friends, f] },
  )
}

/**
 * Registers your raid team on the server for friends to bring (signed in): the save first, since the team is built
 * from the cloud copy. Quiet when it can't (offline); `loud` says so.
 */
export async function syncRaidTeam(loud = false): Promise<boolean> {
  const { save, data, auth } = useGame.getState()
  if (!save || auth.status !== 'signed_in') return false
  const ids = raidTeam(save, data).map((m) => m.id)
  if (!ids.length) return false
  try {
    if (!(await pushSaveNow())) throw new Error('events_no_save')
    await setRaidTeam(ids)
    return true
  } catch (err) {
    console.warn('[raid] team not registered', err)
    if (loud) pushToast(t('ui.raid.teamNotSaved'), 'bad')
    return false
  }
}

let seq = 0
let rng = createRng(randomSeed())

/** Today's raid, if there's one to fight: picked, not caught yet. */
function liveRaid(): TodayRaid | null {
  const { save } = useGame.getState()
  const now = serverNow()
  if (!save || now == null) return null
  const raid = todayRaid(save, utcDay(now))
  return raid && !raid.caught ? raid : null
}

/** The NPC trainers that fill the empty sides: two of the game's trainers, by name and look, with raid teams. */
function npcSides(count: number): RaidSideSeed[] {
  const { save, data } = useGame.getState()
  const regions = save ? [regionOf(save), ...Object.keys(save.parked ?? {})] : [data.regions[0]?.id ?? 'kanto']
  // Trainers with a class name ("Ace Trainer Kai"): never a gym leader, a rival or a named character.
  const classes = Object.values(data.trainers).filter((tr) => tr.role === 'trainer' && tr.spriteUrl?.includes('/classes/') && tr.name.includes(' '))
  const used = new Set<string>()
  return Array.from({ length: count }, (_, i) => {
    const pool = classes.filter((tr) => !used.has(tr.spriteUrl ?? '') && !used.has(tr.name))
    const tr = pool.length ? rng.pick(pool) : null
    if (tr) {
      used.add(tr.spriteUrl ?? '')
      used.add(tr.name)
    }
    const k = i + 1
    return {
      owner: tr?.name ?? t('ui.raid.npcName', { n: k }),
      look: tr?.spriteUrl ?? null,
      kind: 'npc' as const,
      team: npcTeam(data, regions, rng, `s${k}`),
    }
  })
}

/** A friend's side: their registered raid team, played by the battle AI. */
function friendSide(f: RaidFriend, k: number): RaidSideSeed {
  const cap = useGame.getState().data.config.events.raid.teamCap
  return {
    owner: f.name,
    look: avatarOf(f.avatar).src,
    kind: 'friend',
    userId: f.userId,
    team: f.team.slice(0, 3).map((m, i) => ({ uid: `s${k}-${i}`, dex: m.dex, level: Math.min(m.level, cap), hp: Number.MAX_SAFE_INTEGER, shiny: m.shiny })),
  }
}

/**
 * Starts today's raid: you, the friends picked (their raid teams), and NPC trainers in the sides left. The try counts
 * now. Signed in, your own raid team is registered for your friends on the way.
 */
export function startRaid(friends: RaidFriend[] = useRaidGroup.getState().friends): boolean {
  const { save, data } = useGame.getState()
  const raid = liveRaid()
  if (!save || !raid) return false
  const team = raidTeam(save, data)
  if (!team.length) return false
  rng = createRng(randomSeed())
  const me: RaidSideSeed = {
    owner: save.player?.name || t('ui.raid.you'),
    look: avatarOf(playerAvatarId(save.player)).src,
    kind: 'me',
    team: team.map((m, i) => ({ uid: `s0-${i}`, dex: m.dex, level: m.level, hp: Number.MAX_SAFE_INTEGER, shiny: m.shiny })),
  }
  const picked = friends.filter((f) => f.team.length > 0).slice(0, 2)
  const sides = [me, ...picked.map((f, i) => friendSide(f, i + 1)), ...npcSides(2 - picked.length)]
  const { state, log } = createRaid(
    { boss: { dex: raid.dex, shiny: raid.shiny }, sides, regionId: raidHomeRegion(data, raid) },
    data,
    rng,
  )
  mutateSave((s) => countRaidTry(s, raid.day))
  useRaidRun.setState({ run: { id: ++seq, friends: picked, raid, state, log, stage: 'intro', catch: null } })
  void syncRaidTeam()
  return true
}

/** The opening has played (or was skipped). */
export function raidIntroDone() {
  const run = useRaidRun.getState().run
  if (run?.stage === 'intro') useRaidRun.setState({ run: { ...run, stage: 'fight' } })
}

/** Your move on your turn. An item comes out of the bag when it's used. */
export function raidAct(e: RaidEvent) {
  const run = useRaidRun.getState().run
  const { save, data } = useGame.getState()
  if (!run || run.stage !== 'fight' || !save) return
  if (e.t === 'USE_ITEM' && (save.inventory[e.key] ?? 0) <= 0) return
  const r = raidDispatch(run.state, e, data, rng)
  if (r.state === run.state) return
  if (e.t === 'USE_ITEM' && r.log.some((l) => l.kind === 'item' && !l.side)) mutateSave((s) => consumeItem(s, e.key))
  useRaidRun.setState({ run: { ...run, state: r.state, log: [...run.log, ...r.log] } })
}

/** The fight has played out: the catch when it was won, else the result. */
export function raidFightOver() {
  const run = useRaidRun.getState().run
  if (!run || run.stage !== 'fight') return
  if (run.state.phase === 'won') useRaidRun.setState({ run: { ...run, stage: 'catch', catch: { result: null } } })
  else if (run.state.phase === 'lost') useRaidRun.setState({ run: { ...run, stage: 'result' } })
}

/** Tells the server today's raid is caught (signed in): the Raids leaderboard counts it, the friends who helped get a gift. */
async function closeOnServer(helpers: string[]) {
  if (useGame.getState().auth.status !== 'signed_in') return
  try {
    // The server must know today's raid first (a player who signed in after it was set).
    const raid = useRaidRun.getState().run?.raid
    if (raid) await recordOnServer(raid)
    await closeRaid(helpers)
  } catch (err) {
    console.warn('[raid] close failed', err)
    pushToast(t('ui.raid.closeFailed'), 'bad')
  }
}

/** One throw at the worn-out raid Pokémon. Caught: it goes to its home region's Box. Missed: it flees, the raid stays open. */
export function throwRaidBall(ballKey: string | null) {
  const run = useRaidRun.getState().run
  const { save, data } = useGame.getState()
  if (!run || run.stage !== 'catch' || run.catch?.result || !save) return
  const ball = ballKey ? data.items[ballKey] : undefined
  if (ballKey && (!ball || ball.effect.kind !== 'ball' || (save.inventory[ballKey] ?? 0) <= 0)) return
  let next = ballKey ? (consumeItem(save, ballKey) ?? save) : save
  const roll = rollCatch(catchValueOf(data, run.raid.dex), ballBonus(ball), rng)
  let landing: Pick<RaidCatch, 'region' | 'live' | 'locked'> = {}
  if (roll.caught) {
    const today = todayRaid(next, run.raid.day) ?? run.raid
    const res = applyRaidCatch(next, data, today, Date.now(), newId)
    next = res.save
    landing = { region: res.region, live: res.live, locked: res.locked }
    void closeOnServer(run.friends.map((f) => f.userId))
  }
  commitSave(next)
  useRaidRun.setState({ run: { ...run, catch: { result: { ...roll, ballKey }, ...landing } } })
}

/** The throw has played: the result card. */
export function raidCatchShown() {
  const run = useRaidRun.getState().run
  if (run?.stage === 'catch' && run.catch?.result) useRaidRun.setState({ run: { ...run, stage: 'result' } })
}

/** Leaves the raid for the Raids page. */
export function leaveRaid() {
  useRaidRun.setState({ run: null })
}