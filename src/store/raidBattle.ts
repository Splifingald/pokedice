// The raid fight's driver (docs/19 §6.4): the sides (your raid team, NPC trainers in the empty slots), the opening,
// your turns, the catch. A raid isn't saved mid-fight: leaving or reloading is a free retry, the try already counted.
// The same fight runs the day's raid and a progression raid (docs/24): the team, the friends' teams, the numbers and
// where a catch goes are the raid's own.
import { create } from 'zustand'
import {
  applyProgressRaidCatch,
  applyRaidCatch,
  baitFaces,
  baitFor,
  ballBonus,
  catchValueOf,
  consumeItem,
  countRaidTry,
  createRaid,
  createRng,
  inWorldRegion,
  npcSideSeed,
  npcTeam,
  progressRaidOf,
  progressRaidReachable,
  progressRaidShiny,
  progressRaidState,
  progressRaidTeam,
  raidDispatch,
  raidNpcOffer,
  raidTeam,
  raidTeamCap,
  randomSeed,
  regionOf,
  rollBait,
  rollCatch,
  todayRaid,
  utcDay,
  type CatchRoll,
  type ProgressRaid,
  type RaidEvent,
  type RaidLogEntry,
  type RaidMon,
  type RaidNpcOption,
  type RaidSideSeed,
  type RaidState,
  type RegionId,
  type SaveData,
  type TodayRaid,
} from '@/engine'
import { t } from '@/i18n'
import { avatarOf, playerAvatarId } from '@/lib/avatars'
import { closeProgressRaid, closeRaid, setProgressRaidTeam, setRaidTeam, type RaidFriend } from '@/lib/raid'
import { commitSave, mutateSave, pushToast, useGame } from './game'
import { recordOnServer } from './raid'
import { newId } from './run'
import { serverNow } from './serverTime'
import { pushSaveNow } from './sync'

export type RaidStage = 'intro' | 'fight' | 'catch' | 'result'

export interface RaidCatch {
  /** The throw, once made; `baitOffer` while the player is asked whether to throw a Bait (docs/25). */
  result: (CatchRoll & { ballKey: string | null; baitOffer?: string | null; baited?: 'used' | 'kept' }) | null
  /** Where a caught raid Pokémon went: its home region, whether that's the region being played, or that it waits
   *  locked for its area. */
  region?: string
  live?: boolean
  locked?: boolean
}

/** Which raid a fight is: the day's, or a progression raid by its key (`areaId:dex`). */
export type RaidSource = { kind: 'daily' } | { kind: 'progress'; key: string }

export interface RaidRun {
  /** Changes with every new fight, so the screen starts over. */
  id: number
  source: RaidSource
  /** The friends whose raid teams fight beside you: they get a gift if you catch it. */
  friends: RaidFriend[]
  /** The raid Pokémon and the area it's fought in front of (a progression raid's has no day). */
  raid: TodayRaid
  state: RaidState
  log: RaidLogEntry[]
  stage: RaidStage
  catch: RaidCatch | null
}

export const useRaidRun = create<{ run: RaidRun | null }>(() => ({ run: null }))

/** A raid's key for its group and its NPC offer: `daily`, or a progression raid's key. */
export const sourceKey = (source: RaidSource): string => (source.kind === 'daily' ? 'daily' : source.key)

/**
 * The friends picked for a raid's group (for this visit; empty slots fill with NPCs at the start). One raid's at a time:
 * opening another raid's page starts its group empty.
 */
export const useRaidGroup = create<{ key: string; friends: RaidFriend[] }>(() => ({ key: 'daily', friends: [] }))

/** The friend slots of a raid (two at most). */
export const raidFriendSlots = (): number => Math.min(2, useGame.getState().data.config.events.raid.maxFriends)

/** The group picked for this raid (empty when the group in memory is another raid's). */
export const groupOf = (key: string, group: { key: string; friends: RaidFriend[] }): RaidFriend[] => (group.key === key ? group.friends : [])

/** Puts a friend in a raid's group (up to its friend slots), or takes them out. */
export function toggleRaidFriend(f: RaidFriend, key = 'daily') {
  const max = raidFriendSlots()
  useRaidGroup.setState((g) => {
    const friends = groupOf(key, g)
    return {
      key,
      friends: friends.some((x) => x.userId === f.userId)
        ? friends.filter((x) => x.userId !== f.userId)
        : friends.length >= max
          ? friends
          : [...friends, f],
    }
  })
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

/**
 * Leaves your team on a progression raid on the server, for your friends to bring (signed in): the save first, since
 * the team is built from the cloud copy. Quiet when it can't (offline); `loud` says so.
 */
export async function syncProgressRaidTeam(raid: ProgressRaid, loud = false): Promise<boolean> {
  const { save, data, auth } = useGame.getState()
  if (!save || auth.status !== 'signed_in') return false
  const ids = progressRaidTeam(save, data, raid).map((m) => m.id)
  if (!ids.length) return false
  try {
    if (!(await pushSaveNow())) throw new Error('events_no_save')
    await setProgressRaidTeam(raid.key, raid.region, ids)
    return true
  } catch (err) {
    console.warn('[raid] progression team not registered', err)
    if (loud) pushToast(t('ui.raid.teamNotSaved'), 'bad')
    return false
  }
}

/** The regions an NPC's Pokémon come from: the day's raid, every region started; a progression raid, its own. */
function npcRegions(source: RaidSource): RegionId[] {
  const { save, data } = useGame.getState()
  if (source.kind === 'progress') {
    const raid = progressRaidOf(data, source.key)
    if (raid) return [raid.region]
  }
  return save ? [regionOf(save), ...Object.keys(save.parked ?? {})] : [data.regions[0]?.id ?? 'kanto']
}

/** The save's key for a raid's NPC offer: the day's raid's changes with the day. */
const offerKey = (source: RaidSource): string => (source.kind === 'daily' ? `daily:${liveRaid()?.day ?? ''}` : source.key)

/**
 * The four NPC trainers offered for this raid's empty slots (docs/24). They come from a seed kept in the save for this
 * raid, drawn now if there's none yet, so a reload offers the same four; each try draws a new one (`startFight`).
 */
export function ensureNpcOffer(source: RaidSource): RaidNpcOption[] {
  const key = offerKey(source)
  let seed = useGame.getState().save?.events?.raidNpc
  if (!seed || seed.key !== key) {
    const fresh = { key, seed: randomSeed() }
    mutateSave((s) => ({ ...s, events: { ...s.events, raidNpc: fresh } }))
    seed = fresh
  }
  return raidNpcOffer(useGame.getState().data, npcRegions(source), seed.seed)
}

/** The NPC trainers that fill the empty sides when none were picked: game trainers, by name and look, with raid teams. */
function npcSides(count: number, source: RaidSource, level: number): RaidSideSeed[] {
  const { data } = useGame.getState()
  const regions = npcRegions(source)
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
      team: npcTeam(data, regions, rng, `s${k}`, level),
    }
  })
}

/** A friend's side: their raid team (a progression raid: the one they left on it), played by the battle AI. */
function friendSide(f: RaidFriend, k: number, cap: number): RaidSideSeed {
  return {
    owner: f.name,
    look: avatarOf(f.avatar).src,
    kind: 'friend',
    userId: f.userId,
    team: f.team.slice(0, 3).map((m, i) => ({ uid: `s${k}-${i}`, dex: m.dex, level: Math.min(m.level, cap), hp: Number.MAX_SAFE_INTEGER, shiny: m.shiny })),
  }
}

/**
 * The fight starts: you, the friends picked (their teams), the NPC trainers picked from the offer, and (when fewer were
 * picked than slots are empty) game trainers in the sides left. Every try draws a new NPC offer for the next one.
 */
function startFight(
  source: RaidSource,
  raid: TodayRaid,
  team: RaidMon[],
  friends: RaidFriend[],
  npcs: RaidNpcOption[],
  cap: number,
) {
  const { save, data } = useGame.getState()
  if (!save) return
  rng = createRng(randomSeed())
  const me: RaidSideSeed = {
    owner: save.player?.name || t('ui.raid.you'),
    look: avatarOf(playerAvatarId(save.player)).src,
    kind: 'me',
    team: team.map((m, i) => ({
      uid: `s0-${i}`,
      dex: m.dex,
      level: m.level,
      hp: Number.MAX_SAFE_INTEGER,
      shiny: m.shiny,
      nickname: m.nickname,
    })),
  }
  const picked = friends.filter((f) => f.team.length > 0).slice(0, 2)
  const chosen = npcs.slice(0, 2 - picked.length).map((o, i) => npcSideSeed(o, picked.length + i + 1, cap, t('ui.raid.npcName', { n: picked.length + i + 1 })))
  const sides = [me, ...picked.map((f, i) => friendSide(f, i + 1, cap)), ...chosen, ...npcSides(2 - picked.length - chosen.length, source, cap)]
  const { state, log } = createRaid(
    {
      boss: { dex: raid.dex, shiny: raid.shiny },
      sides,
      kind: source.kind === 'progress' ? 'progress' : 'daily',
      areaId: raid.areaId,
    },
    data,
    rng,
  )
  // This try used these four; the next one is offered four new ones.
  mutateSave((s) => ({ ...s, events: { ...s.events, raidNpc: { key: offerKey(source), seed: randomSeed() } } }))
  useRaidRun.setState({ run: { id: ++seq, source, friends: picked, raid, state, log, stage: 'intro', catch: null } })
}

/**
 * Starts today's raid with the friends and the NPC trainers picked. The try counts now. Signed in, your own raid team
 * is registered for your friends on the way.
 */
export function startRaid(npcs: RaidNpcOption[] = [], friends: RaidFriend[] = groupOf('daily', useRaidGroup.getState())): boolean {
  const { save, data } = useGame.getState()
  const raid = liveRaid()
  // Inside a small world no event reaches (docs/21).
  if (!save || !raid || inWorldRegion(save, data)) return false
  const team = raidTeam(save, data)
  if (!team.length) return false
  mutateSave((s) => countRaidTry(s, raid.day))
  startFight({ kind: 'daily' }, raid, team, friends, npcs, data.config.events.raid.teamCap)
  void syncRaidTeam()
  return true
}

/**
 * Starts a progression raid (docs/24): its team from its region's Box, the friends who left a team on it, the NPC
 * trainers picked. Only while it's open (its area completed, not caught yet). Signed in, your team is left on it.
 */
export function startProgressRaid(key: string, npcs: RaidNpcOption[] = [], friends: RaidFriend[] = groupOf(key, useRaidGroup.getState())): boolean {
  const { save, data } = useGame.getState()
  const raid = progressRaidOf(data, key)
  if (!save || !raid || !progressRaidReachable(save, data, raid) || progressRaidState(save, data, raid) !== 'open') return false
  const team = progressRaidTeam(save, data, raid)
  if (!team.length) return false
  const ref: TodayRaid = { day: '', dex: raid.dex, shiny: progressRaidShiny(data, raid), areaId: raid.areaId, caught: false, tries: 0 }
  startFight({ kind: 'progress', key }, ref, team, friends, npcs, raidTeamCap(data, raid.dex, 'progress', raid.areaId))
  void syncProgressRaidTeam(raid)
  return true
}

/** The same raid again, with the same friends and these NPC trainers (a new offer: the last try used the old one). */
export function raidAgain(npcs: RaidNpcOption[] = []): boolean {
  const run = useRaidRun.getState().run
  if (!run) return false
  return run.source.kind === 'progress' ? startProgressRaid(run.source.key, npcs, run.friends) : startRaid(npcs, run.friends)
}

/** The empty sides a raid would start with: its friend slots minus the friends picked who have a team. */
export const emptySlots = (friends: RaidFriend[]): number => Math.max(0, raidFriendSlots() - friends.filter((f) => f.team.length > 0).length)

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

/** Tells the server the raid is caught (signed in): the Raids leaderboard counts it, the friends who helped get a gift. */
async function closeOnServer(source: RaidSource, helpers: string[]) {
  if (useGame.getState().auth.status !== 'signed_in') return
  try {
    if (source.kind === 'progress') return await closeProgressRaid(source.key, helpers)
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
  const next = ballKey ? (consumeItem(save, ballKey) ?? save) : save
  const roll = rollCatch(catchValueOf(data, run.raid.dex), ballBonus(ball), rng)
  // Short, with a Bait that could still make it: the player is asked first (docs/25).
  const bait = baitFor(roll, next, data)
  if (bait) {
    commitSave(next)
    useRaidRun.setState({ run: { ...run, catch: { result: { ...roll, ballKey, baitOffer: bait } } } })
    return
  }
  settleRaidThrow(next, roll, ballKey)
}

/** The Bait thrown (its die adds to the throw) or kept (the throw stands). Raids have no Capture Luck. */
export function answerRaidBait(use: boolean) {
  const run = useRaidRun.getState().run
  const { save, data } = useGame.getState()
  const r = run?.catch?.result
  if (!save || !r?.baitOffer) return
  const spent = use ? consumeItem(save, r.baitOffer) : null
  const { ballKey, baitOffer, baited: _b, ...roll } = r
  const thrown = spent ? rollBait(roll, baitFaces(data.items[baitOffer]), rng) : roll
  settleRaidThrow(spent ?? save, thrown, ballKey, spent ? 'used' : 'kept')
}

/** Caught: it goes to its home region's Box. Missed: it flees, the raid stays open. */
function settleRaidThrow(save: SaveData, roll: CatchRoll, ballKey: string | null, baited?: 'used' | 'kept') {
  const run = useRaidRun.getState().run
  const { data } = useGame.getState()
  if (!run) return
  let next = save
  let landing: Pick<RaidCatch, 'region' | 'live' | 'locked'> = {}
  if (roll.caught) {
    const source = run.source
    const raid = source.kind === 'progress' ? progressRaidOf(data, source.key) : null
    if (raid) {
      const res = applyProgressRaidCatch(next, data, raid, Date.now(), newId)
      next = res.save
      landing = { region: res.region, live: res.live, locked: false }
    } else {
      const today = todayRaid(next, run.raid.day) ?? run.raid
      const res = applyRaidCatch(next, data, today, Date.now(), newId)
      next = res.save
      landing = { region: res.region, live: res.live, locked: res.locked }
    }
    void closeOnServer(source, run.friends.map((f) => f.userId))
  }
  commitSave(next)
  useRaidRun.setState({ run: { ...run, catch: { result: { ...roll, ballKey, ...(baited && { baited }) }, ...landing } } })
}

/** The throw has played: the result card. */
export function raidCatchShown() {
  const run = useRaidRun.getState().run
  if (run?.stage === 'catch' && run.catch?.result && !run.catch.result.baitOffer)
    useRaidRun.setState({ run: { ...run, stage: 'result' } })
}

/** Leaves the raid for the Raids page. */
export function leaveRaid() {
  useRaidRun.setState({ run: null })
}