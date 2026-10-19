// The promo trailer's scenes (scripts/record-promo.ts): each one a save and a starting point in the real game, built
// here and opened by the dev-only harness (/__demo/:scene, src/dev/PromoDemo.tsx). They only set the starting state:
// every roll, number and animation is the game's own.
import {
  badgeCase,
  comboDice,
  createInstance,
  createRaid,
  createRng,
  detectCombos,
  dieValue,
  faceOf,
  megaChoices,
  progressOf,
  progressRaidKey,
  reduce,
  uniformLevels,
  type BattleState,
  type ComboKey,
  type Encounter,
  type GameData,
  type LogEntry,
  type PokemonInstance,
  type RaidSideSeed,
  type SaveData,
} from '@/engine'
import type { RaidRun } from '@/store/raidBattle'

/** The scenes' places: Sky Pillar (Rayquaza's raid), Ilex Shrine (Celebi), Lumiose City, Cerulean Cave. */
export const AREA = {
  skyPillar: '4ef12821-79bb-5aa1-ad96-5bd2fbba093f',
  ilexShrine: '100e6644-3f5b-553a-ad22-e26551b04edc',
  lumiose: '6e410147-d926-5e1e-b132-47d7a9470438',
  ceruleanCave: 'a5d11263-453f-5181-9a73-2c30df79d3fc',
} as const

export const PLAYER = { name: 'Alex', character: 'red' as const }

/** A save at the given point: the team (first is the lead), the Box, every track at `upgrade`. */
export function promoSave(
  data: GameData,
  o: {
    team: { dex: number; level: number }[]
    box?: { dex: number; level: number }[]
    areaId: string
    region: string
    upgrade?: number
    now: number
  },
): SaveData {
  let n = 0
  const mon = (m: { dex: number; level: number }): PokemonInstance =>
    createInstance(m.dex, m.level, data, `promo-${++n}`, o.now)
  const team = o.team.map(mon)
  const box = (o.box ?? []).map(mon)
  const levels = uniformLevels(o.upgrade ?? 7)
  return {
    version: 1,
    updatedAt: o.now,
    gold: 24_680,
    pokedex: [...new Set([...team, ...box].map((p) => p.dex))],
    box: [...team, ...box],
    team: team.map((p) => p.id),
    inventory: {},
    comboLevels: levels.comboLevels as SaveData['comboLevels'],
    dieLevels: levels.dieLevels as SaveData['dieLevels'],
    currentAreaId: o.areaId,
    areaProgress: {},
    settings: {
      sfx: true,
      sound: true,
      reducedMotion: false,
      animations: 'full',
      multiExp: true,
      lang: 'en',
    },
    hpScale: data.config.hpMultiplier,
    region: o.region,
    parked: {},
    player: PLAYER,
    // Pop-ups a fresh save would open over the scene.
    leaderboardVisited: true,
    versusRulesSeen: true,
  }
}

const raidMon = (uid: string, dex: number, level: number) => ({
  uid,
  dex,
  level,
  hp: Number.MAX_SAFE_INTEGER,
})

/**
 * Rayquaza's raid as it opens (the intro first): you and two trainers of Hoenn, their leads a Dragonite, a Salamence
 * and a Metagross.
 */
export function rayquazaRaid(data: GameData, areaId: string, look: string | null): RaidRun {
  const trainer = (cls: string) =>
    Object.values(data.trainers).find(
      (t) => t.role === 'trainer' && t.spriteUrl?.includes(`/classes/hoenn/${cls}`) && t.name.includes(' '),
    )
  const ace = trainer('ace-trainer') ?? trainer('dragon-tamer')
  const expert = trainer('expert') ?? trainer('black-belt')
  const sides: RaidSideSeed[] = [
    {
      owner: PLAYER.name,
      look,
      kind: 'me',
      team: [raidMon('s0-0', 149, 70), raidMon('s0-1', 6, 70), raidMon('s0-2', 130, 70)],
    },
    {
      owner: ace?.name ?? 'Ace Trainer',
      look: ace?.spriteUrl ?? null,
      kind: 'npc',
      team: [raidMon('s1-0', 373, 70), raidMon('s1-1', 350, 70), raidMon('s1-2', 282, 70)],
    },
    {
      owner: expert?.name ?? 'Expert',
      look: expert?.spriteUrl ?? null,
      kind: 'npc',
      team: [raidMon('s2-0', 376, 70), raidMon('s2-1', 260, 70), raidMon('s2-2', 306, 70)],
    },
  ]
  const { state, log } = createRaid(
    { boss: { dex: 384, shiny: false }, sides, kind: 'progress', areaId },
    data,
    createRng(384),
  )
  return {
    id: 1,
    source: { kind: 'progress', key: progressRaidKey(areaId, 384) },
    friends: [],
    raid: { day: '', dex: 384, shiny: false, areaId, caught: false, tries: 0 },
    state,
    log,
    stage: 'intro',
    catch: null,
  }
}

/**
 * Two badges won (what Trades ask for), and the place the second one was won as where the player stands, so Home and
 * its widgets show a save in the middle of its region.
 */
function withBadges(data: GameData, save: SaveData, n = 2): SaveData {
  let s = save
  const won = badgeCase(save, data).slice(0, n)
  for (const b of won) {
    const p = progressOf(s, b.areaId)
    s = {
      ...s,
      areaProgress: {
        ...s.areaProgress,
        [b.areaId]: { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] },
      },
    }
  }
  return { ...s, currentAreaId: won[won.length - 1]?.areaId ?? s.currentAreaId }
}

/** Trades open, their rules already seen. */
export function withTrades(data: GameData, save: SaveData): SaveData {
  return { ...withBadges(data, save), trades: { out: [], done: [], rulesSeen: true } }
}

/**
 * The Day Care open (twenty species caught), visited, its gift Egg hatched, and a Pikachu and a Raichu staying: a pair
 * that can make an Egg, so they seek each other out in the yard.
 */
export function withDayCare(data: GameData, save: SaveData, now: number): SaveData {
  const residents = [25, 26].map((dex, i) => ({
    inst: createInstance(dex, 30 + i * 8, data, `promo-dc-${i}`, now),
    since: now,
    region: 'kanto',
  }))
  return {
    ...withBadges(data, save),
    pokedex: [...new Set([...save.pokedex, ...Array.from({ length: 24 }, (_, i) => i + 1)])],
    dayCare: { residents, guests: [], eggClaimed: true, visited: true },
  }
}

// ---------------------------------------------------------------- the YouTube trailer's duels

/** What a duel's turn must show: the engine plays it, the seed only picks which of its turns it is. */
export type DuelGoal =
  /** The first roll lands this combo (its best one), and the attack on it is super effective. */
  | { kind: 'hand'; combo: ComboKey }
  /**
   * The first roll lands `from`; its dice kept, the others rerolled land `to`; then the attack (or the Z-Move)
   * K.O.s the foe.
   */
  | { kind: 'reroll'; from: ComboKey[]; to: ComboKey; finisher: 'attack' | 'z' }
  /** After the roll, the Pokémon Mega Evolves (its first form), and its attack is super effective and K.O.s. */
  | { kind: 'mega' }

export interface Duel {
  areaId: string
  region: string
  /** The lead first. */
  team: { dex: number; level: number }[]
  foe: Extract<Encounter, { kind: 'wild' | 'boss' }>
  /** The foe's HP at the start, a share of its max (a fight already under way). */
  foeHp?: number
  /** Z-Moves open in this battle (they ship switched off). */
  z?: boolean
  goal: DuelGoal
}

/** The trailer's duels, by scene name (/__demo/<name>): a different place, type and combo each. */
export const DUELS: Record<string, Duel> = {
  // A Pair, and Thunderbolt on a Gyarados at the Lake of Rage.
  pair: {
    areaId: 'bcb0a995-0b15-59b4-baad-07e16f5d19b6',
    region: 'johto',
    team: [{ dex: 26, level: 50 }],
    foe: { kind: 'wild', dex: 130, level: 46, isNew: false },
    goal: { kind: 'hand', combo: 'pair' },
  },
  // Three of a Kind, and Ice Beam on a Garchomp in the snow of Route 217.
  three: {
    areaId: 'bbdca5af-2024-5c0c-8278-c7c5966a5be4',
    region: 'sinnoh',
    team: [{ dex: 131, level: 52 }],
    foe: { kind: 'wild', dex: 445, level: 46, isNew: false },
    goal: { kind: 'hand', combo: 'three_kind' },
  },
  // A Small Straight, and Shadow Ball on an Alakazam in the Pokémon Tower.
  straight: {
    areaId: '1e08b1b8-cda6-5046-a40f-5041361f6736',
    region: 'kanto',
    team: [{ dex: 94, level: 50 }],
    foe: { kind: 'wild', dex: 65, level: 46, isNew: false },
    goal: { kind: 'hand', combo: 'small_straight' },
  },
  // A Full House, and Hydro Pump on a Camerupt on Mt. Chimney.
  fullhouse: {
    areaId: '35ba43d5-ed6e-5add-a1ce-4f1d20e34cf4',
    region: 'hoenn',
    team: [{ dex: 9, level: 50 }],
    foe: { kind: 'wild', dex: 323, level: 46, isNew: false },
    goal: { kind: 'hand', combo: 'full_house' },
  },
  // Three of a Kind kept, two dice rerolled into Four of a Kind: Flamethrower on a Scizor in the National Park.
  reroll: {
    areaId: '3aa36df1-1d3e-533b-8f85-32ca0b970b16',
    region: 'johto',
    team: [
      { dex: 6, level: 52 },
      { dex: 149, level: 55 },
      { dex: 26, level: 50 },
    ],
    foe: { kind: 'wild', dex: 212, level: 46, isNew: false },
    goal: { kind: 'reroll', from: ['three_kind'], to: 'four_kind', finisher: 'attack' },
  },
  // Lumiose City: Lucario Mega Evolves, then hits the wild Greninja.
  megahit: {
    areaId: AREA.lumiose,
    region: 'kalos',
    team: [
      { dex: 448, level: 50 },
      { dex: 149, level: 52 },
      { dex: 6, level: 52 },
    ],
    foe: { kind: 'wild', dex: 658, level: 40, isNew: false },
    goal: { kind: 'mega' },
  },
  // The finale: Celebi worn down at its shrine, Charizard's dice rerolled into Five of a Kind, a Z-Move.
  finale: {
    areaId: AREA.ilexShrine,
    region: 'johto',
    team: [
      { dex: 6, level: 55 },
      { dex: 149, level: 55 },
      { dex: 26, level: 50 },
    ],
    foe: { kind: 'boss', dex: 251, level: 50 },
    foeHp: 0.45,
    z: true,
    goal: { kind: 'reroll', from: ['four_kind', 'three_kind'], to: 'five_kind', finisher: 'z' },
  },
}

/** A duel's save: its team, and a stronger copy of the foe already caught (so it faints, the K.O. flash, at 0 HP). */
export function duelSave(data: GameData, d: Duel, now: number): SaveData {
  const save = promoSave(data, { team: d.team, areaId: d.areaId, region: d.region, now })
  const owned = createInstance(d.foe.dex, Math.min(100, d.foe.level + 5), data, 'promo-owned', now)
  return { ...save, box: [...save.box, owned], pokedex: [...new Set([...save.pokedex, owned.dex])] }
}

/** The turn a seed plays, as the recording presses it. */
export interface DuelPlan {
  seed: number
  /** The dice rerolled (indexes on the tray). */
  reroll: number[]
  first: number[]
  final: number[]
  damage: number
  score: number
}

/** The battle RNG `seedRun(seed)` installs (store/run.ts). */
const battleRngOf = (seed: number) => createRng(seed ^ 0x9e3779b9)

const best = (values: number[]): ComboKey | null => detectCombos(values).at(-1) ?? null

/** Plays one seed's turn on the engaged battle; null when it isn't the goal's. */
function tryDuel(start: BattleState, data: GameData, goal: DuelGoal, seed: number): DuelPlan | null {
  const rng = battleRngOf(seed)
  let s = start
  // The foe's turn first when it is the faster.
  for (let i = 0; i < 3 && s.phase === 'enemy_turn'; i++) s = reduce(s, { t: 'AI_TURN' }, data, rng).state
  if (s.phase !== 'player_roll') return null
  const before = s.player[s.activeIndex]!.hp
  s = reduce(s, { t: 'ROLL' }, data, rng).state
  const values = () => s.dice.map((d) => dieValue(d, data))
  const statusFaces = () => s.dice.filter((d) => faceOf(d, data).kind === 'status').length
  const first = values()
  let score = 0
  let reroll: number[] = []
  if (goal.kind === 'hand') {
    if (best(first) !== goal.combo) return null
  } else if (goal.kind === 'reroll') {
    const from = best(first)
    if (!from || !goal.from.includes(from)) return null
    score += goal.from.length - goal.from.indexOf(from)
    const keep = new Set(comboDice(first, from))
    reroll = first.map((_, i) => i).filter((i) => !keep.has(i))
    for (const i of reroll) s = reduce(s, { t: 'TOGGLE_DIE', i }, data, rng).state
    s = reduce(s, { t: 'REROLL' }, data, rng).state
    if (best(values()) !== goal.to) return null
  } else {
    const mega = megaChoices(s, data)[0]
    if (!mega) return null
    s = reduce(s, { t: 'MEGA', toDex: mega.dex }, data, rng).state
  }
  const final = values()
  score -= statusFaces()
  const finisher = goal.kind === 'reroll' && goal.finisher === 'z' ? 'ZMOVE' : 'ATTACK'
  const end = reduce(s, { t: finisher }, data, rng)
  const hit = end.log.find((e): e is Extract<LogEntry, { kind: 'damage' }> => e.kind === 'damage' && e.side === 'player')
  if (!hit || hit.result.effectiveness < 1.5) return null
  const ko = end.log.some((e) => e.kind === 'faint' && e.side === 'enemy')
  if (goal.kind !== 'hand' && !ko) return null
  // The quick hands: a hit that doesn't end the fight reads as one of many; the player's own HP untouched reads cleaner.
  if (goal.kind === 'hand' && ko) score -= 1
  if (start.player[start.activeIndex]!.hp === before) score += 1
  // High faces read as a better roll.
  score += Math.max(...final) / 6
  return { seed, reroll, first, final, damage: hit.amount, score }
}

/** The best seed for a duel's goal on the battle as engaged (the store's own state: nothing to keep in step). */
export function planDuel(start: BattleState, data: GameData, goal: DuelGoal, count = 40_000): DuelPlan | null {
  let found: DuelPlan | null = null
  for (let seed = 1; seed <= count; seed++) {
    const p = tryDuel(start, data, goal, seed)
    if (p && (!found || p.score > found.score)) found = p
  }
  return found
}
