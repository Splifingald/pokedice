// Idle mode and the play styles (docs/36): which areas play themselves under each style and switch, where the
// autopilot goes between areas (on once cleared, one round back after a lost one, then home again), and what it does at
// each step of a run — never an item, never a team change, only a catch waiting for the player.
import { describe, expect, it } from 'vitest'
import {
  autoAvailable,
  autoEvents,
  autoLevel,
  autopilotStep,
  autoTravel,
  createBattle,
  createRng,
  emptyProgress,
  idleRulesDue,
  linearAreas,
  markIdleRulesSeen,
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

  it('shows its rules once, while it is on', () => {
    const s = fresh()
    expect(idleRulesDue(s, OFF)).toBe(false)
    expect(idleRulesDue(s, ON)).toBe(true)
    expect(idleRulesDue(markIdleRulesSeen(s), ON)).toBe(false)
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

  it('stops only at catches: the throw, and "Add to team?"', () => {
    expect(autopilotStep(s, ON, 'idle', view('catch', B.id))).toEqual({ do: 'wait', why: 'player' })
    expect(autopilotStep(s, ON, 'idle', view('trick', B.id))).toEqual({ do: 'wait', why: 'player' })
    expect(autopilotStep(s, ON, 'idle', view('victory', B.id, { pendingCatch: true }))).toEqual({
      do: 'wait',
      why: 'player',
    })
    expect(autopilotStep(s, ON, 'idle', view('victory', B.id))).toEqual({ do: 'close' })
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

  it('never has a step that uses an item or changes the team', () => {
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
