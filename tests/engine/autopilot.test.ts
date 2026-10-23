// Idle mode and the play styles (docs/36): which areas play themselves under each style and switch, where the
// autopilot goes between areas (on once cleared, one round back after a lost one, then home again), and what it does at
// each step of a run — never an item but Idle's own balls, never a team change; Idle's catch rule (chooseIdleBall).
import { describe, expect, it } from 'vitest'
import {
  autoAvailable,
  autoEvents,
  autoLevel,
  autopilotStep,
  autoTravel,
  chooseIdleBall,
  createBattle,
  createRng,
  emptyProgress,
  linearAreas,
  newGameAsksStyle,
  newSave,
  playStyleOf,
  reduce,
  playStylesOffered,
  regionOf,
  retreatFrom,
  settingsForStyle,
  withDetour,
  type AreaProgress,
  type AutoView,
  type GameData,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const OFF = makeData()
const ON = makeData({ idleMode: { access: 'all' } })
const ADMIN_ONLY = makeData({ idleMode: { access: 'admin' } })

const fresh = (): SaveData => newSave(7, ON, 123, newId)
const chain = linearAreas(ON, regionOf(fresh()))
const [A, B, C, D] = chain as [(typeof chain)[0], (typeof chain)[0], (typeof chain)[0], (typeof chain)[0]]

const progress = (p: Partial<AreaProgress> = {}): AreaProgress => ({ ...emptyProgress(), ...p })
/** The first `n` areas of the chain cleared, standing in `here`. */
function at(here: string, n: number, extra: Record<string, Partial<AreaProgress>> = {}): SaveData {
  const s = fresh()
  const areaProgress = Object.fromEntries(
    chain.slice(0, n).map((a) => [a.id, progress({ cleared: true, roundsDone: 3 })]),
  )
  for (const [id, p] of Object.entries(extra)) areaProgress[id] = progress({ ...areaProgress[id], ...p })
  return { ...s, currentAreaId: here, areaProgress }
}

const view = (phase: AutoView['phase'], areaId: string, more: Partial<AutoView> = {}): AutoView => ({
  phase,
  areaId,
  ...more,
})

/** A species the fresh save hasn't caught (Rattata), and the one it has (its starter, Squirtle). */
const NEW_DEX = 19
const OWNED_DEX = 7
/** The content with this species' catch value set, so each case's chances are known. */
const withValue = (value: number, dex = NEW_DEX): GameData => ({
  ...ON,
  species: { ...ON.species, [dex]: { ...ON.species[dex]!, catchValue: value } },
})
const VALUE5 = withValue(5)

describe('the play style setting', () => {
  it('reads a setting from before the styles as "Auto on explored areas", its switch as it was', () => {
    expect(playStyleOf({})).toBe('explored')
    expect(playStyleOf({ autoMode: true })).toBe('explored')
    expect(playStyleOf({ playStyle: 'idle' })).toBe('idle')
    expect(playStyleOf({ playStyle: 'nonsense' as never })).toBe('explored')
  })

  it('starts Idle on, the other two off', () => {
    expect(settingsForStyle('idle')).toEqual({ playStyle: 'idle', autoMode: true })
    expect(settingsForStyle('explored')).toEqual({ playStyle: 'explored', autoMode: false })
    expect(settingsForStyle('classic')).toEqual({ playStyle: 'classic', autoMode: false })
  })

  it('asks a new game only while the switch is on for the player', () => {
    expect(playStylesOffered(OFF)).toEqual([])
    expect(newGameAsksStyle(OFF)).toBe(false)
    expect(playStylesOffered(ON)).toEqual(['classic', 'explored', 'idle'])
    expect(newGameAsksStyle(ON)).toBe(true)
    expect(newGameAsksStyle(ADMIN_ONLY)).toBe(false)
    expect(newGameAsksStyle({ ...ADMIN_ONLY, viewer: { admin: true } } as GameData)).toBe(true)
  })
})

describe('where auto plays', () => {
  const cleared = at(A.id, 1)
  const notCleared = at(B.id, 1)
  const run = (areaId: string) => ({ areaId })

  it('switch off: auto-mode as it always was, fights only, in cleared areas, whatever the style', () => {
    for (const playStyle of ['classic', 'explored', 'idle'] as const) {
      expect(autoLevel(cleared, OFF, { playStyle, autoMode: true }, run(A.id))).toBe('fights')
      expect(autoLevel(notCleared, OFF, { playStyle, autoMode: true }, run(B.id))).toBe('off')
    }
    expect(autoLevel(cleared, OFF, { autoMode: false }, run(A.id))).toBe('off')
  })

  it('Classic: nowhere', () => {
    expect(autoAvailable(cleared, ON, { playStyle: 'classic' }, A.id)).toBe(false)
    expect(autoLevel(cleared, ON, { playStyle: 'classic', autoMode: true }, run(A.id))).toBe('off')
  })

  it('Auto on explored areas: the whole run in a cleared area once switched on, nothing elsewhere', () => {
    const s = { playStyle: 'explored' as const, autoMode: true }
    expect(autoLevel(cleared, ON, s, run(A.id))).toBe('full')
    expect(autoLevel(notCleared, ON, s, run(B.id))).toBe('off')
    expect(autoLevel(cleared, ON, { ...s, autoMode: false }, run(A.id))).toBe('off')
    // An old setting (no style) is this one.
    expect(autoLevel(cleared, ON, { autoMode: true }, run(A.id))).toBe('full')
  })

  it('Idle: every area, until it is paused; an Elite Rebattle only fights on auto', () => {
    const s = { playStyle: 'idle' as const, autoMode: true }
    expect(autoLevel(notCleared, ON, s, run(B.id))).toBe('full')
    expect(autoLevel(notCleared, ON, { ...s, autoMode: false }, run(B.id))).toBe('off')
    expect(autoLevel(cleared, ON, s, { areaId: A.id, rebattle: { regionId: 'kanto', tier: 0 } })).toBe(
      'fights',
    )
  })
})

describe('the way between areas', () => {
  it('moves on once the area is cleared and the next one is open', () => {
    expect(autoTravel(at(B.id, 2), ON, 'idle', B.id)).toEqual({ areaId: C.id, detour: null })
    // Not cleared yet: it stays.
    expect(autoTravel(at(B.id, 1), ON, 'idle', B.id)).toBeNull()
  })

  it('Auto on explored areas only moves into areas it plays: cleared ones', () => {
    expect(autoTravel(at(A.id, 2), ON, 'explored', A.id)).toEqual({ areaId: B.id, detour: null })
    // B is cleared, C is open but not cleared: B is the last explored area, it stays.
    expect(autoTravel(at(B.id, 2), ON, 'explored', B.id)).toBeNull()
  })

  it('a lost round sends it one area back, for exactly one round, then home again', () => {
    const lost = at(C.id, 2)
    const back = retreatFrom(lost, ON, C.id)
    expect(back).toEqual({ areaId: B.id, detour: { from: C.id, to: B.id, rounds: 3 } })
    const there = { ...withDetour(lost, back.detour), currentAreaId: B.id }
    // In B, round not done yet: it stays (B is cleared and C open, but the detour comes first).
    expect(autoTravel(there, ON, 'idle', B.id)).toBeNull()
    // B's round done: back to C, the detour cleared.
    const done = {
      ...there,
      areaProgress: { ...there.areaProgress, [B.id]: progress({ cleared: true, roundsDone: 4 }) },
    }
    expect(autoTravel(done, ON, 'idle', B.id)).toEqual({ areaId: C.id, detour: null })
    expect(withDetour(done, null).idle?.detour).toBeUndefined()
  })

  it('a round lost during the detour goes one area further back, and comes forward again from there', () => {
    const s = { ...withDetour(at(B.id, 2), { from: C.id, to: B.id, rounds: 3 }), currentAreaId: B.id }
    expect(retreatFrom(s, ON, B.id)).toEqual({ areaId: A.id, detour: { from: B.id, to: A.id, rounds: 3 } })
  })

  it('the first area has nothing before it: the same area again, no detour', () => {
    expect(retreatFrom(at(A.id, 0), ON, A.id)).toEqual({ areaId: A.id, detour: null })
  })

  it('a detour left behind (the player went elsewhere) is forgotten', () => {
    const s = { ...withDetour(at(D.id, 3), { from: C.id, to: B.id, rounds: 3 }), currentAreaId: D.id }
    expect(autopilotStep(s, ON, 'idle', view('idle', D.id))).toEqual({ do: 'forget' })
  })
})

describe('each step of a run', () => {
  const s = at(B.id, 1)

  it('between encounters: on to the next one, unless a pop-up, the energy or a resting team holds it', () => {
    expect(autopilotStep(s, ON, 'idle', view('idle', B.id))).toEqual({ do: 'continue' })
    expect(autopilotStep(s, ON, 'idle', view('idle', B.id, { held: true }))).toEqual({
      do: 'wait',
      why: 'held',
    })
    expect(autopilotStep(s, ON, 'idle', view('idle', B.id, { noEnergy: true }))).toEqual({
      do: 'wait',
      why: 'energy',
    })
    const ko = { ...s, box: s.box.map((p) => ({ ...p, currentHp: 0 })), mode: 'extreme' as const }
    expect(autopilotStep(ko, ON, 'idle', view('idle', B.id))).toEqual({ do: 'wait', why: 'resting' })
  })

  it('between encounters in a cleared area: travels on first', () => {
    expect(autopilotStep(at(B.id, 2), ON, 'idle', view('idle', B.id))).toEqual({
      do: 'travel',
      areaId: C.id,
      detour: null,
    })
  })

  it('takes every card by itself but Trick or Treat, which is a catch of its own', () => {
    for (const kind of ['wild', 'trainer', 'gym', 'boss', 'item', 'center', 'casino'])
      expect(autopilotStep(s, ON, 'idle', view('preview', B.id, { encounter: kind }))).toEqual({
        do: 'engage',
      })
    expect(autopilotStep(s, ON, 'idle', view('preview', B.id, { encounter: 'trick' }))).toEqual({
      do: 'wait',
      why: 'player',
    })
  })

  it('Auto on explored areas stops at catches: the throw, and "Add to team?"', () => {
    const c = { dex: NEW_DEX, throw: 'none' as const }
    expect(autopilotStep(s, ON, 'explored', view('catch', B.id, { catch: c }))).toEqual({
      do: 'wait',
      why: 'player',
    })
    expect(autopilotStep(s, ON, 'explored', view('victory', B.id, { pendingCatch: true }))).toEqual({
      do: 'wait',
      why: 'player',
    })
    expect(autopilotStep(s, ON, 'explored', view('victory', B.id))).toEqual({ do: 'close' })
  })

  it('Idle plays the catch itself: its ball, no Bait, again after Capture Luck, never "Add to team?"', () => {
    const bag = { ...s, inventory: { 'poke-ball': 3, 'great-ball': 1, bait: 2 } }
    const at = (t: 'none' | 'bait' | 'stays' | 'done', dex = NEW_DEX) =>
      autopilotStep(bag, VALUE5, 'idle', view('catch', B.id, { catch: { dex, throw: t } }))
    expect(at('none')).toEqual({ do: 'throw', ball: 'great-ball' })
    expect(at('bait')).toEqual({ do: 'keepBait' })
    expect(at('stays')).toEqual({ do: 'retry' })
    expect(at('done')).toEqual({ do: 'wait', why: 'result' })
    expect(at('none', OWNED_DEX)).toEqual({ do: 'pass', why: 'owned' })
    const shiny = autopilotStep(
      bag,
      VALUE5,
      'idle',
      view('catch', B.id, { catch: { dex: OWNED_DEX, shiny: true, throw: 'none' } }),
    )
    expect(shiny).toEqual({ do: 'throw', ball: 'great-ball' })
    const empty = { ...s, inventory: { 'master-ball': 1 } }
    expect(
      autopilotStep(empty, VALUE5, 'idle', view('catch', B.id, { catch: { dex: NEW_DEX, throw: 'none' } })),
    ).toEqual({ do: 'pass', why: 'noBall' })
    // "Add to team?" answered as CONTINUE answers it: the card closes, the catch to the Box.
    expect(autopilotStep(s, ON, 'idle', view('victory', B.id, { pendingCatch: true }))).toEqual({
      do: 'close',
    })
    expect(autopilotStep(s, ON, 'idle', view('victory', B.id))).toEqual({ do: 'close' })
  })

  it('still waits for the player at Trick or Treat, and for the fight to play', () => {
    expect(autopilotStep(s, ON, 'idle', view('trick', B.id))).toEqual({ do: 'wait', why: 'player' })
    expect(autopilotStep(s, ON, 'idle', view('battle', B.id))).toEqual({ do: 'wait', why: 'fight' })
  })

  it('walks out of the Center (no team swaps), past the Game Corner (no spin) and on after a stalemate', () => {
    for (const phase of ['center', 'casino', 'stalemate'] as const)
      expect(autopilotStep(s, ON, 'idle', view(phase, B.id))).toEqual({ do: 'leave' })
  })

  it('after a full K.O. retreats instead of showing the wipe card', () => {
    expect(autopilotStep(at(C.id, 2), ON, 'idle', view('wipe', C.id))).toEqual({
      do: 'retreat',
      areaId: B.id,
      detour: { from: C.id, to: B.id, rounds: 3 },
    })
  })

  it('never has a step that uses an item (but its balls) or changes the team', () => {
    const phases: AutoView['phase'][] = [
      'idle',
      'preview',
      'battle',
      'catch',
      'victory',
      'center',
      'casino',
      'trick',
      'wipe',
      'stalemate',
    ]
    const kinds = new Set(
      phases.map((p) => autopilotStep(s, ON, 'idle', view(p, B.id, { encounter: 'wild' })).do),
    )
    expect([...kinds].sort()).toEqual(['close', 'continue', 'engage', 'leave', 'retreat', 'wait'])
  })

  it('plays its fights as auto-mode does, with no item from the bag even when one would help', () => {
    const save = { ...s, inventory: { potion: 5, 'full-heal': 5 } }
    const lead = save.box[0]!
    const { state } = createBattle(
      {
        kind: 'wild',
        team: [{ uid: lead.id, dex: lead.dex, level: lead.level, hp: 1 }],
        enemy: { dex: 19, level: 3 },
        playerLevels: { comboLevels: save.comboLevels, dieLevels: save.dieLevels },
        enemyLevels: { comboLevels: save.comboLevels, dieLevels: save.dieLevels },
        auto: true,
      } as Parameters<typeof createBattle>[0],
      ON,
    )
    // The whole fight, played the way the battle screen plays an auto fight: never a USE_ITEM.
    const rng = createRng(7)
    let st = state
    let moves = 0
    for (let i = 0; i < 200 && !['won', 'lost', 'fled'].includes(st.phase); i++) {
      const events = st.phase === 'enemy_turn' ? [{ t: 'AI_TURN' as const }] : autoEvents(st, ON, rng)
      expect(events.some((e) => e.t === 'USE_ITEM')).toBe(false)
      if (!events.length) break
      for (const e of events) st = reduce(st, e, ON, rng).state
      moves++
    }
    expect(moves).toBeGreaterThan(0)
  })
})

describe("Idle's catch: chooseIdleBall", () => {
  const bag = (inventory: Record<string, number>, pokedex = fresh().pokedex) => ({
    pokedex,
    inventory,
    box: fresh().box,
  })

  it('not owned: the ball with the best chance', () => {
    // Catch value 7: a Poké Ball needs a 6 (1/6), a Great Ball a 5 (2/6), an Ultra Ball a 4 (3/6).
    const d = withValue(7)
    expect(chooseIdleBall(bag({ 'poke-ball': 5, 'great-ball': 2, 'ultra-ball': 1 }), d, NEW_DEX)).toEqual({
      ball: 'ultra-ball',
      chance: 0.5,
    })
    expect(chooseIdleBall(bag({ 'poke-ball': 5, 'great-ball': 2 }), d, NEW_DEX)?.ball).toBe('great-ball')
  })

  it('not owned: the cheapest of the balls tied at the best chance', () => {
    // Catch value 3: a Great Ball (needs a 1) and an Ultra Ball are both certain; the Poké Ball isn't (5/6).
    const d = withValue(3)
    expect(chooseIdleBall(bag({ 'poke-ball': 5, 'great-ball': 2, 'ultra-ball': 1 }), d, NEW_DEX)).toEqual({
      ball: 'great-ball',
      chance: 1,
    })
    // Catch value 2: all three certain, so the Poké Ball (20 against 50 and 100).
    expect(
      chooseIdleBall(bag({ 'ultra-ball': 1, 'poke-ball': 5, 'great-ball': 2 }), withValue(2), NEW_DEX),
    ).toEqual({
      ball: 'poke-ball',
      chance: 1,
    })
  })

  it('no ball at all when the catch is already certain without one', () => {
    expect(chooseIdleBall(bag({ 'poke-ball': 5 }), withValue(1), NEW_DEX)).toEqual({ ball: null, chance: 1 })
    expect(chooseIdleBall(bag({}), withValue(1), NEW_DEX)).toEqual({ ball: null, chance: 1 })
  })

  it('never the Master Ball, even when it is the best or the only ball held', () => {
    const d = withValue(9)
    // Value 9: the Master Ball (+10) is certain, the Ultra Ball needs a 6, the Great Ball can't reach it.
    expect(chooseIdleBall(bag({ 'master-ball': 1, 'ultra-ball': 1, 'great-ball': 4 }), d, NEW_DEX)).toEqual({
      ball: 'ultra-ball',
      chance: 1 / 6,
    })
    expect(chooseIdleBall(bag({ 'master-ball': 3 }), d, NEW_DEX)).toBeNull()
    expect(chooseIdleBall(bag({ 'master-ball': 3 }), VALUE5, NEW_DEX)).toBeNull()
  })

  it('owned: no throw, whatever the bag holds', () => {
    const full = bag({ 'poke-ball': 9, 'great-ball': 9, 'ultra-ball': 9 })
    expect(chooseIdleBall(full, withValue(7, OWNED_DEX), OWNED_DEX)).toBeNull()
    expect(chooseIdleBall(full, VALUE5, NEW_DEX)).not.toBeNull()
    expect(chooseIdleBall({ ...full, pokedex: [...full.pokedex, NEW_DEX] }, VALUE5, NEW_DEX)).toBeNull()
  })

  it('a shiny is not the same Pokémon: owned only with a shiny of its species in the Box', () => {
    const full = bag({ 'poke-ball': 9, 'great-ball': 9, 'ultra-ball': 9 })
    // The plain one is in the Pokédex and the Box: a shiny of it is still new.
    expect(chooseIdleBall(full, withValue(7, OWNED_DEX), OWNED_DEX, true)?.ball).toBe('ultra-ball')
    const mon = full.box.find((m) => m.dex === OWNED_DEX)!
    const shinyHeld = { ...full, box: [...full.box, { ...mon, id: 'shiny-copy', shiny: true }] }
    expect(chooseIdleBall(shinyHeld, withValue(7, OWNED_DEX), OWNED_DEX, true)).toBeNull()
    // A shiny in the Box doesn't make the plain one owned when the Pokédex doesn't have it.
    expect(chooseIdleBall({ ...shinyHeld, pokedex: [] }, withValue(7, OWNED_DEX), OWNED_DEX)?.ball).toBe(
      'ultra-ball',
    )
  })

  it('no ball held, or none that could catch it: no throw', () => {
    expect(chooseIdleBall(bag({}), VALUE5, NEW_DEX)).toBeNull()
    // Value 9: a Poké Ball (+1) can never reach it; a ball spent on a sure miss is a ball lost.
    expect(chooseIdleBall(bag({ 'poke-ball': 5, 'great-ball': 2 }), withValue(9), NEW_DEX)).toBeNull()
    // Items that aren't balls don't count.
    expect(chooseIdleBall(bag({ bait: 4, potion: 3 }), VALUE5, NEW_DEX)).toBeNull()
  })

  it('skips a ball the bag holds none of', () => {
    const d = withValue(7)
    expect(chooseIdleBall(bag({ 'ultra-ball': 0, 'great-ball': 0, 'poke-ball': 2 }), d, NEW_DEX)?.ball).toBe(
      'poke-ball',
    )
    expect(chooseIdleBall(bag({ 'ultra-ball': 0, 'poke-ball': 0 }), d, NEW_DEX)).toBeNull()
  })
})
