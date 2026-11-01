// An encounter under way outlives the page: a reload, the app closed, a phone's browser dropping the tab. The run and
// the battle used to live only in memory, so a reload lost the encounter its card had already been drawn for (the deck
// is in the save) and the next CONTINUE dealt the following one: the round moved on without being
// played. Now they are written with the save on this device (game.ts `onDisk`) and the next load plays on from them.
//
// Both dice streams are kept with them: a fight picked up after a reload rolls exactly what it would have rolled had
// the page stayed, so leaving can't be used to throw again.
import type { BattleState, GameData, LogEntry, ResumeSnapshot, SaveData } from '@/engine'
import type { BattleSlice, RunPhase, RunState } from './game'

export type RngStates = ResumeSnapshot['rng']

/** Where run.ts's two dice streams stand; run.ts registers itself (it imports the store, not the other way round). */
let rngStates: () => RngStates = () => ({ run: 0, battle: 0 })
export function trackRngs(read: () => RngStates) {
  rngStates = read
}

/** The streams of the encounter picked up at load, for run.ts to start from; null when nothing was picked up. */
let resumedRng: RngStates | null = null
export const resumedRngs = (): RngStates | null => resumedRng

/** The run picked up at load, until the first landing on Home has taken the player back into it (takeResumeLanding). */
let landingRun: RunState | null = null

/**
 * The game opens on Home (the installed app's start page): with an encounter picked up and untouched since, the player
 * goes straight back into it, once. True only for the run restored at load, so a Home chosen later stays Home.
 */
export function takeResumeLanding(run: RunState): boolean {
  const back = landingRun !== null && landingRun === run
  landingRun = null
  return back
}

/** The encounter under way, as it goes to storage; undefined between encounters (nothing to pick up). */
export function snapshotOf(run: RunState, battle: BattleSlice | null): ResumeSnapshot | undefined {
  if (!run.areaId || run.phase === 'idle') return undefined
  return {
    v: 1,
    run: { ...run } as unknown as Record<string, unknown>,
    battle: battle && {
      id: battle.id,
      state: battle.state as unknown as Record<string, unknown>,
      log: battle.log,
    },
    rng: rngStates(),
  }
}

const PHASES: readonly RunPhase[] = [
  'preview',
  'battle',
  'catch',
  'victory',
  'center',
  'casino',
  'trick',
  'gift',
  'wipe',
  'stalemate',
]
/** The phases played on the battle screen: nothing to show without the battle. */
const FIGHT: readonly RunPhase[] = ['battle', 'catch', 'victory']

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The run and the battle to play on from, or null when the snapshot doesn't fit this save and this content any more
 * (another device's save came in, an area or a species went away): the encounter is lost then, as it always was.
 * `base` is a fresh run, for fields a snapshot written by an older build doesn't have.
 */
export function restoreSnapshot(
  snap: ResumeSnapshot | undefined,
  save: SaveData,
  data: GameData,
  base: RunState,
): { run: RunState; battle: BattleSlice | null } | null {
  resumedRng = null
  landingRun = null
  if (!snap || snap.v !== 1 || !isObj(snap.run)) return null
  const run = { ...base, ...snap.run } as RunState
  if (typeof run.areaId !== 'string' || !data.areas.some((a) => a.id === run.areaId)) return null
  if (!PHASES.includes(run.phase)) return null
  if (run.phase === 'preview' && !isObj(run.encounter)) return null
  if (run.phase === 'catch' && !isObj(run.catch)) return null
  if (run.phase === 'trick' && !isObj(run.trick)) return null
  if (run.phase === 'gift' && !isObj(run.gift)) return null
  const battle = snap.battle ? battleOf(snap.battle, save, data) : null
  if (snap.battle && !battle) return null
  if (FIGHT.includes(run.phase) && !battle) return null
  resumedRng = snap.rng
  landingRun = run
  return { run, battle }
}

/** The battle as it stood, if every Pokémon in it is still in this save's Box and every species in the content. */
function battleOf(
  b: NonNullable<ResumeSnapshot['battle']>,
  save: SaveData,
  data: GameData,
): BattleSlice | null {
  const state = b.state as unknown as BattleState
  if (
    !Array.isArray(state.player) ||
    !state.player.length ||
    !isObj(state.enemy) ||
    typeof state.phase !== 'string'
  )
    return null
  const box = new Set(save.box.map((p) => p.id))
  if (!state.player.every((p) => isObj(p) && box.has(p.uid) && !!data.species[p.dex])) return null
  const foes = state.double?.foes ?? [state.enemy]
  if (!foes.every((f) => isObj(f) && !!data.species[f.dex])) return null
  // Marked as picked up: the screen opens on the fight as it stands, without replaying its entrances and its log.
  return { id: b.id, state, log: b.log as LogEntry[], resumed: true }
}
