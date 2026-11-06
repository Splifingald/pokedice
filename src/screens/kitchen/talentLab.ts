// The Talent Lab's fights (docs/51, dev only): one set-up per talent that acts in battle, and the seed that shows it.
// Pure (no React), so a test can check that every one of them shows its talent.
import {
  createBattle,
  createRng,
  emptyStatus,
  reduce,
  uniformLevels,
  type BattleEvent,
  type BattleState,
  type GameData,
  type LogEntry,
  type StatusState,
  type TalentKey,
} from '@/engine'

export interface Mon {
  dex: number
  level: number
  talent?: TalentKey
  /** Share of its max HP it starts with. */
  hp?: number
  status?: Partial<StatusState>
}

export interface Scenario {
  team: Mon[]
  foe: Mon
  /** A double battle: both foes. */
  foes?: Mon[]
  /** Your move on your first turn, instead of attacking (Natural Cure's switch). */
  first?: (s: BattleState) => BattleEvent
}

const poisoned = { poison: { turns: 4 } }
const burned = { burn: { stacks: 1, turns: 4 } }

/** One fight per talent that acts in battle. */
export const LAB: Partial<Record<TalentKey, Scenario>> = {
  extraReroll: { team: [{ dex: 19, level: 30, talent: 'extraReroll' }], foe: { dex: 16, level: 28 } },
  doubleReroll: { team: [{ dex: 130, level: 40, talent: 'doubleReroll' }], foe: { dex: 25, level: 38 } },
  quick: { team: [{ dex: 17, level: 30, talent: 'quick' }], foe: { dex: 19, level: 30 } },
  ultraSpeed: { team: [{ dex: 135, level: 40, talent: 'ultraSpeed' }], foe: { dex: 26, level: 40 } },
  thickHide: { team: [{ dex: 28, level: 35, talent: 'thickHide' }], foe: { dex: 56, level: 33 } },
  reroller: { team: [{ dex: 150, level: 60, talent: 'reroller' }], foe: { dex: 143, level: 60 } },
  technician: { team: [{ dex: 53, level: 45, talent: 'technician' }], foe: { dex: 143, level: 60 } },
  triplePro: { team: [{ dex: 6, level: 80, talent: 'triplePro' }], foe: { dex: 143, level: 90 } },
  foursPro: { team: [{ dex: 149, level: 100, talent: 'foursPro' }], foe: { dex: 143, level: 100 } },
  skillLink: { team: [{ dex: 91, level: 70, talent: 'skillLink' }], foe: { dex: 143, level: 80 } },
  opener: { team: [{ dex: 5, level: 40, talent: 'opener' }], foe: { dex: 143, level: 50 } },
  finisher: { team: [{ dex: 68, level: 50, talent: 'finisher' }], foe: { dex: 143, level: 60, hp: 0.3 } },
  guts: { team: [{ dex: 67, level: 45, talent: 'guts', status: burned }], foe: { dex: 143, level: 55 } },
  mindsEye: { team: [{ dex: 20, level: 40, talent: 'mindsEye' }], foe: { dex: 93, level: 40 } },
  powerSpot: {
    team: [
      { dex: 25, level: 40 },
      { dex: 133, level: 40, talent: 'powerSpot' },
    ],
    foe: { dex: 19, level: 38 },
    foes: [
      { dex: 19, level: 38 },
      { dex: 16, level: 38 },
    ],
  },
  friendGuard: {
    team: [
      { dex: 25, level: 40 },
      { dex: 35, level: 40, talent: 'friendGuard' },
    ],
    foe: { dex: 56, level: 42 },
    foes: [
      { dex: 56, level: 42 },
      { dex: 66, level: 42 },
    ],
  },
  naturalCure: {
    team: [
      { dex: 121, level: 45, talent: 'naturalCure', status: poisoned },
      { dex: 7, level: 40 },
    ],
    foe: { dex: 143, level: 50 },
    first: (s) => ({ t: 'SWITCH', instanceId: s.player[1]!.uid }),
  },
  static: { team: [{ dex: 4, level: 45 }], foe: { dex: 26, level: 45, talent: 'static' } },
  shedSkin: {
    team: [{ dex: 24, level: 40, talent: 'shedSkin', status: poisoned }],
    foe: { dex: 143, level: 50 },
  },
  limber: { team: [{ dex: 26, level: 45 }], foe: { dex: 106, level: 45, talent: 'limber' } },
  poisonHeal: {
    team: [{ dex: 7, level: 35 }],
    foe: { dex: 286, level: 50, talent: 'poisonHeal', hp: 0.6, status: poisoned },
  },
  flameHeal: {
    team: [{ dex: 7, level: 35 }],
    foe: { dex: 59, level: 50, talent: 'flameHeal', hp: 0.6, status: burned },
  },
  roughSkin: { team: [{ dex: 6, level: 55 }], foe: { dex: 445, level: 60, talent: 'roughSkin' } },
  intimidate: { team: [{ dex: 26, level: 50 }], foe: { dex: 130, level: 50, talent: 'intimidate' } },
  shellBell: { team: [{ dex: 9, level: 50, talent: 'shellBell', hp: 0.5 }], foe: { dex: 143, level: 55 } },
  disguise: { team: [{ dex: 6, level: 45 }], foe: { dex: 778, level: 45, talent: 'disguise' } },
  magicGuard: {
    team: [{ dex: 7, level: 35 }],
    foe: { dex: 36, level: 50, talent: 'magicGuard', status: poisoned },
  },
  pressure: { team: [{ dex: 144, level: 60, talent: 'pressure' }], foe: { dex: 59, level: 55 } },
  sturdy: { team: [{ dex: 74, level: 12, talent: 'sturdy' }], foe: { dex: 149, level: 70 } },
  leftovers: { team: [{ dex: 143, level: 50, talent: 'leftovers', hp: 0.5 }], foe: { dex: 19, level: 40 } },
  mirror: { team: [{ dex: 149, level: 60, talent: 'mirror' }], foe: { dex: 143, level: 70 } },
  magmaArmor: { team: [{ dex: 126, level: 45, talent: 'magmaArmor' }], foe: { dex: 124, level: 50 } },
  imposter: { team: [{ dex: 132, level: 45, talent: 'imposter' }], foe: { dex: 6, level: 45 } },
}

function seedOf(m: Mon, uid: string) {
  return { uid, dex: m.dex, level: m.level, hp: 9999, ...(m.talent && { talent: m.talent }) }
}

/** The fight as the scenario sets it up, before anything happens. */
export function setUp(sc: Scenario, data: GameData) {
  const L = uniformLevels(1)
  const { state, log } = createBattle(
    {
      kind: 'wild',
      team: sc.team.map((m, i) => seedOf(m, `lab-${i}`)),
      enemy: { dex: sc.foe.dex, level: sc.foe.level },
      ...(sc.foes && {
        double: { foes: sc.foes.map((f) => ({ dex: f.dex, level: f.level })), leadUids: ['lab-0', 'lab-1'] },
      }),
      playerLevels: L,
      enemyLevels: L,
    },
    data,
  )
  const dress = (b: BattleState['player'][number], m: Mon) => {
    if (m.talent) b.talent = m.talent
    if (m.hp != null) b.hp = Math.max(1, Math.floor(b.maxHp * m.hp))
    if (m.status) b.status = { ...emptyStatus(), ...m.status }
  }
  sc.team.forEach((m, i) => dress(state.player[i]!, m))
  if (state.double) sc.foes?.forEach((m, i) => dress(state.double!.foes[i]!, m))
  else dress(state.enemy, sc.foe)
  if (state.double) state.enemy = state.double.foes[state.double.foeIndex]!
  return { state, log }
}

/** Your move in the lab, as Enter plays it: roll, attack, pass a stunned turn, send the next one out. */
export function playerMove(s: BattleState, sc: Scenario, firstDone: boolean): BattleEvent | null {
  if (s.phase === 'player_roll') return sc.first && !firstDone ? sc.first(s) : { t: 'ROLL' }
  if (s.phase === 'player_reroll') return { t: 'ATTACK' }
  if (s.phase === 'player_stunned') return { t: 'PASS' }
  if (s.phase === 'player_switch') {
    const next = s.player.find((b) => b.hp > 0 && b.uid !== s.player[s.activeIndex]?.uid)
    return next ? { t: 'SWITCH', instanceId: next.uid } : null
  }
  if (s.phase === 'enemy_turn') return { t: 'AI_TURN' }
  return null
}

export const shows = (key: TalentKey) => (e: LogEntry) => e.kind === 'talent' && e.talent === key

/** The first seed whose fight shows the talent within its first moves (a chance talent, a combo). */
export function findSeed(key: TalentKey, sc: Scenario, data: GameData): number {
  for (let seed = 1; seed < 400; seed++) {
    let { state, log } = setUp(sc, data)
    if (log.some(shows(key))) return seed
    const rng = createRng(seed)
    let firstDone = false
    for (let step = 0; step < 24; step++) {
      const e = playerMove(state, sc, firstDone)
      if (!e) break
      if (e.t === 'SWITCH' && state.phase === 'player_roll') firstDone = true
      const r = reduce(state, e, data, rng)
      state = r.state
      log = r.log
      if (log.some(shows(key))) return seed
    }
  }
  return 1
}
