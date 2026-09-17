/**
 * pnpm seed — PokeAPI → src/data/*.json (the offline bundle) + supabase/seed.sql.
 *
 * Idempotent and re-runnable: every PokeAPI response is cached in scripts/.cache/, every random choice is seeded,
 * and every generated UUID is derived from a stable name. It never touches a live database.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TYPE_COLORS } from '../src/theme/colors'
import { DEFAULT_CONFIG } from '../src/engine/defaults'
import { createRng } from '../src/engine/rng'
import {
  COMBO_KEYS,
  DIE_TYPES,
  POKE_TYPES,
  type Area,
  type BattleBackground,
  type ComboKey,
  type ComboUpgradeRow,
  type DiceEntry,
  type DiceTypeDef,
  type DieType,
  type DieUpgradeRow,
  type Evolution,
  type Face,
  type ItemDef,
  type Milestone,
  type PokeType,
  type Species,
  type StatusKind,
  type Trainer,
  type TypeChartRow,
} from '../src/engine/types'
import { AREAS, LEGENDARIES, lootPlanFor, RARE_IN_CATCH_ALL, STARTERS, type Mon } from './content'
import { trainerSprite } from './trainer-sprites'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache')
const DATA_DIR = path.join(ROOT, 'src', 'data')
const SQL_FILE = path.join(ROOT, 'supabase', 'seed.sql')
const API = 'https://pokeapi.co/api/v2'
const SPRITE = (dex: number) => `/pokemon/${String(dex).padStart(3, '0')}_front.png`
const ITEM_SPRITE = (key: string) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${key}.png`
const KANTO = 151

/** Battle scene per area: grass on routes and forests, sea on sea routes, water on lakes, rock in caves, default indoors. */
const AREA_BACKGROUNDS: Record<string, BattleBackground> = {
  'Route 1': 'grass',
  'Routes 22 & 2': 'grass',
  'Viridian Forest': 'grass',
  'Route 3': 'grass',
  'Mt. Moon': 'rock',
  'Route 4 & Nugget Bridge': 'grass',
  'Routes 5 & 6': 'grass',
  "Diglett's Cave & Route 11": 'rock',
  'Routes 9 & 10': 'grass',
  'Rock Tunnel': 'rock',
  'Routes 7 & 8': 'grass',
  'Pokémon Tower': 'default',
  'Routes 12–15': 'grass',
  'Cycling Road': 'grass',
  'Safari Zone': 'grass',
  'Silph Co.': 'default',
  'Sea Routes 19 & 20': 'sea',
  'Seafoam Islands': 'water',
  'Pokémon Mansion': 'default',
  'Route 21': 'sea',
  'Victory Road': 'rock',
  'Indigo Plateau': 'default',
  'Power Plant': 'default',
  'Cerulean Cave': 'rock',
  'Faraway Island': 'grass',
}

// ---------------------------------------------------------------- PokeAPI access (cached)

interface ApiPokemon {
  id: number
  types: { slot: number; type: { name: string } }[]
  stats: { base_stat: number; stat: { name: string } }[]
}
interface ApiSpecies {
  id: number
  capture_rate: number
  names: { name: string; language: { name: string } }[]
  evolution_chain: { url: string }
}
interface ApiEvoDetail {
  min_level: number | null
  trigger: { name: string }
  item: { name: string } | null
}
interface ApiChainLink {
  species: { name: string; url: string }
  evolution_details: ApiEvoDetail[]
  evolves_to: ApiChainLink[]
}
interface ApiChain {
  id: number
  chain: ApiChainLink
}
interface ApiType {
  name: string
  damage_relations: {
    double_damage_to: { name: string }[]
    half_damage_to: { name: string }[]
    no_damage_to: { name: string }[]
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson<T>(url: string): Promise<T> {
  const key = url.replace(API, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '.json'
  const file = path.join(CACHE_DIR, key)
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8')) as T
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
      const json = (await res.json()) as T
      await writeFile(file, JSON.stringify(json))
      return json
    } catch (err) {
      lastErr = err
      await sleep(400 * 2 ** attempt)
    }
  }
  throw lastErr
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

const dexFromUrl = (url: string) => Number(url.replace(/\/$/, '').split('/').pop())

// ---------------------------------------------------------------- rules (02-DATA-MODEL §3)

export function hpAtLevel(baseStat: number, level: number): number {
  return Math.floor(((2 * baseStat + 31) * level) / 100) + level + 10
}

/** Gen-1 capture rate (3–255) → catch value for the catch die (d6 + ball): 1 always … 9 legendary. */
export function catchValueFromRate(rate: number): number {
  if (rate >= 255) return 1
  if (rate >= 190) return 2
  if (rate >= 120) return 3
  if (rate >= 75) return 4
  if (rate >= 45) return 5
  if (rate >= 30) return 6
  if (rate >= 20) return 7
  if (rate >= 10) return 8
  return 9
}

export function diceCountFromBst(bst: number): number {
  if (bst < 330) return 2
  if (bst < 430) return 3
  if (bst < 500) return 4
  if (bst < 570) return 5
  return 6
}

export function composeDice(diceCount: number, type1: PokeType, type2: PokeType | null): DiceEntry[] {
  const baseCount = Math.max(1, Math.ceil(diceCount / 3))
  const typedCount = diceCount - baseCount
  let type1Count = typedCount
  let type2Count = 0
  if (type2 && typedCount >= 2) {
    type2Count = Math.max(1, Math.floor(typedCount / 3))
    type1Count = typedCount - type2Count
  }
  const dice: DiceEntry[] = []
  if (type1Count > 0) dice.push({ type: type1, count: type1Count })
  if (type2 && type2Count > 0) dice.push({ type: type2, count: type2Count })
  dice.push({ type: 'base', count: baseCount })
  return dice
}

// ---------------------------------------------------------------- dice schedule (v1.8)
// A Pokémon's dice grow with its evolution stage and level; every new die comes with a reroll.

/** Caterpie and Weedle: their lines gain dice by evolving. */
export const BUG_LINES = new Set([10, 11, 12, 13, 14, 15])

/** Per-family choices (v1.8): Dragonair grows while it waits for Lv.55, Magikarp stays at 1 die, revived fossils start
 * stronger, Mew grows into its 5th die. */
const FAMILY_PLANS: Record<number, DicePlan> = {
  129: { start: 1, adds: [] }, // Magikarp
  138: { start: 2, adds: [] }, // Omanyte
  140: { start: 2, adds: [] }, // Kabuto
  142: { start: 4, adds: [50] }, // Aerodactyl
  148: { start: 3, adds: [40] }, // Dragonair
  151: { start: 4, adds: [40] }, // Mew
}

/** The dice of an n-dice set: 1 = the main type, then the usual mix (base, second type, base, main type…). */
export function diceForCount(n: number, type1: PokeType, type2: PokeType | null): DieType[] {
  if (n <= 1) return [type1]
  return composeDice(n, type1, type2).flatMap((d) => Array.from({ length: d.count }, () => d.type))
}

/** Level a first-stage Pokémon gets its 2nd die: 5, later for weak ones (Rattata, Pidgey, Magikarp…). */
export function secondDieLevel(bst: number): number {
  return bst < 260 ? 8 : bst < 280 ? 7 : bst < 300 ? 6 : 5
}

export interface DicePlan {
  /** Dice on arrival (hatched, caught at any level, or right after evolving). */
  start: number
  /** Levels at which one more die comes, in order. */
  adds: number[]
}

/**
 * How many dice a species has and when it gains more.
 * - first stage of a line: 1 die, a 2nd at Lv.5 (weak ones later); more only by evolving
 * - middle of a 3-stage line: 3 dice on evolving
 * - final of a 3-stage line: 4 dice on evolving, a 5th at Lv.50
 * - Caterpie / Weedle lines: 1 → 2 → 3 by evolving, a 4th at Lv.36, no 5th
 * - final of a 2-stage line: 3 dice, a 4th at Lv.36, a 5th at Lv.50 when strong (BST ≥ 450)
 * - single-stage Pokémon: 1 die, then Lv.5 (weak ones later) / 20 / 36 / 50 when strong; weak ones stop at 3 (Lv.20)
 * - legendaries: 5 dice
 * - FAMILY_PLANS overrides: Magikarp, fossils, Dragonair, Mew
 */
export function dicePlan(dex: number, stage: number, lineLength: number, bst: number, legendary: boolean): DicePlan {
  const strong = bst >= 450
  const family = FAMILY_PLANS[dex]
  if (family) return { start: family.start, adds: [...family.adds] }
  if (legendary) return { start: 5, adds: [] }
  if (BUG_LINES.has(dex)) return stage === 1 ? { start: 1, adds: [] } : stage === 2 ? { start: 2, adds: [] } : { start: 3, adds: [36] }
  const second = secondDieLevel(bst)
  // Non-evolvers: strong ones reach 5 dice by Lv.50, weaker ones (Onix, Ditto, Porygon…) stop at 3.
  if (lineLength === 1) return { start: 1, adds: strong ? [second, 20, 36, 50] : [second, 20] }
  if (stage === 1) return { start: 1, adds: [second] }
  if (lineLength >= 3 && stage === 2) return { start: 3, adds: [] }
  if (lineLength >= 3) return { start: 4, adds: [50] }
  return { start: 3, adds: [36, ...(strong ? [50] : [])] }
}

const groupDice = (dice: DieType[]): DiceEntry[] => {
  const out: DiceEntry[] = []
  for (const t of dice) {
    const e = out.find((d) => d.type === t)
    if (e) e.count += 1
    else out.push({ type: t, count: 1 })
  }
  return out
}

/** The one die `after` has that `before` doesn't. */
const addedDie = (before: DieType[], after: DieType[]): DieType => {
  const left = [...before]
  for (const t of after) {
    const i = left.indexOf(t)
    if (i < 0) return t
    left.splice(i, 1)
  }
  return after[after.length - 1]!
}

export function diceSchedule(
  s: Pick<Species, 'type1' | 'type2' | 'evolutions'>,
  plan: DicePlan,
): Pick<Species, 'dice' | 'rerolls' | 'milestones'> {
  const milestones: Milestone[] = []
  plan.adds.forEach((level, i) => {
    const dieType = addedDie(diceForCount(plan.start + i, s.type1, s.type2), diceForCount(plan.start + i + 1, s.type1, s.type2))
    milestones.push({ level, effect: 'ADD_DIE', dieType }, { level, effect: 'ADD_REROLL', amount: 1 })
  })
  if (s.evolutions.length) milestones.push({ level: Math.min(...s.evolutions.map((e) => e.level)), effect: 'EVOLVE' })
  return { dice: groupDice(diceForCount(plan.start, s.type1, s.type2)), rerolls: plan.start, milestones }
}

/** Apply the dice schedule to every species (stages come from the evolution graph). */
export function applyDiceSchedule(list: Species[], bstOf: (dex: number) => number): Species[] {
  const parent = new Map<number, number>()
  for (const s of list) for (const e of s.evolutions) parent.set(e.toDex, s.dex)
  const byDex = new Map(list.map((s) => [s.dex, s]))
  const stageOf = (dex: number): number => (parent.has(dex) ? 1 + stageOf(parent.get(dex)!) : 1)
  const rootOf = (dex: number): number => (parent.has(dex) ? rootOf(parent.get(dex)!) : dex)
  const depth = (dex: number): number => 1 + Math.max(0, ...(byDex.get(dex)?.evolutions ?? []).map((e) => depth(e.toDex)))
  const legendary = new Set<number>(LEGENDARIES)
  return list.map((s) => ({
    ...s,
    ...diceSchedule(s, dicePlan(s.dex, stageOf(s.dex), depth(rootOf(s.dex)), bstOf(s.dex), legendary.has(s.dex))),
  }))
}

function evolutionLevel(details: ApiEvoDetail[]): { level: number; note: string } {
  const byLevel = details.find((d) => d.trigger.name === 'level-up' && d.min_level)
  if (byLevel?.min_level) return { level: byLevel.min_level, note: '' }
  const byItem = details.find((d) => d.trigger.name === 'use-item')
  if (byItem) return { level: 28, note: `${byItem.item?.name ?? 'stone'} → assigned Lv.28` }
  const byTrade = details.find((d) => d.trigger.name === 'trade')
  if (byTrade) return { level: 34, note: 'trade → assigned Lv.34' }
  return { level: 30, note: 'happiness/other → assigned Lv.30' }
}

// ---------------------------------------------------------------- dice faces (01-GAME-SPEC §3.1)

const N = (value: number): Face => ({ kind: 'number', value })
const S = (status: StatusKind, value: number): Face => ({ kind: 'status', status, value })
const nums = (...v: number[]) => v.map(N)

const FACES: Record<DieType, Face[]> = {
  base: nums(1, 2, 3, 4, 5, 6),
  normal: nums(1, 2, 3, 4, 5, 6),
  water: nums(2, 3, 3, 4, 4, 5),
  fire: [S('burn', 1), ...nums(2, 3, 4, 5, 6)],
  grass: [...nums(1, 2), S('heal', 3), ...nums(4, 5, 6)],
  ice: [S('frozen', 1), ...nums(2, 3, 4, 5, 6)],
  electric: [...nums(1, 2, 3), S('paralyze', 4), ...nums(5, 6)],
  bug: nums(1, 1, 1, 4, 4, 4),
  ghost: nums(0, 0, 3, 5, 6, 7),
  psychic: [...nums(1, 2, 3, 4, 5), S('confuse', 2)],
  dark: nums(1, 1, 3, 4, 5, 7),
  fairy: nums(0, 2, 2, 4, 4, 6),
  steel: nums(3, 3, 3, 4, 4, 4),
  rock: nums(2, 2, 2, 4, 5, 6),
  ground: nums(0, 1, 1, 4, 4, 8),
  fighting: nums(2, 3, 4, 5, 6, 7),
  flying: nums(1, 2, 3, 4, 4, 7),
  poison: [S('poison', 1), ...nums(2, 3, 4, 5, 6)],
  dragon: nums(2, 3, 4, 5, 6, 8),
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const DIE_DESCRIPTIONS: Record<DieType, string> = {
  base: 'Plain 1 to 6',
  normal: 'Steady 1 to 6',
  fire: 'Stacking burn',
  water: 'Reliable, no 1s or 6s',
  electric: 'Chance to paralyze',
  grass: 'Chance to heal',
  ice: 'Chance to freeze',
  fighting: 'Hard hitter, 2 to 7',
  poison: 'Chance to poison',
  ground: 'All or nothing',
  flying: 'Chance of a big 7',
  psychic: 'Chance to confuse',
  bug: 'Only 1s and 4s',
  rock: 'Low but sturdy',
  ghost: 'Blanks or big hits',
  dragon: 'Strong, up to 8',
  dark: 'Risky, up to 7',
  steel: 'Always 3 or 4',
  fairy: 'Even numbers only',
}

function buildDiceTypes(): DiceTypeDef[] {
  return DIE_TYPES.map((type, i) => ({
    type,
    label: cap(type),
    color: TYPE_COLORS[type],
    faces: FACES[type],
    description: DIE_DESCRIPTIONS[type],
    upgradeable: type !== 'base',
    countsForMajority: type !== 'base',
    sortOrder: i,
  }))
}

// ---------------------------------------------------------------- upgrades (01-GAME-SPEC §5.2)

const COMBO_TABLE: Record<ComboKey, { l1: number; per: number; base: number }> = {
  pair: { l1: 2, per: 1, base: 5 },
  two_pair: { l1: 5, per: 1, base: 12 },
  three_kind: { l1: 6, per: 2, base: 15 },
  small_straight: { l1: 8, per: 2, base: 20 },
  full_house: { l1: 10, per: 3, base: 25 },
  four_kind: { l1: 14, per: 3, base: 35 },
  full_straight: { l1: 18, per: 4, base: 45 },
  five_kind: { l1: 25, per: 5, base: 60 },
}
const DIE_BONUS = [0, 1, 2, 3, 4, 6, 8, 10, 12, 15]
const GROWTH = 1.55

function buildUpgrades(): { combos: ComboUpgradeRow[]; dice: DieUpgradeRow[] } {
  const combos: ComboUpgradeRow[] = []
  for (const comboKey of COMBO_KEYS) {
    const t = COMBO_TABLE[comboKey]
    for (let level = 1; level <= 10; level++) {
      combos.push({
        comboKey,
        level,
        bonus: t.l1 + t.per * (level - 1),
        cost: level === 1 ? 0 : Math.round(t.base * GROWTH ** (level - 2)),
      })
    }
  }
  const dice: DieUpgradeRow[] = []
  for (const dieType of POKE_TYPES) {
    for (let level = 1; level <= 10; level++) {
      dice.push({
        dieType,
        level,
        bonus: DIE_BONUS[level - 1]!,
        cost: level === 1 ? 0 : Math.round(10 * GROWTH ** (level - 2)),
      })
    }
  }
  return { combos, dice }
}

// The classic items, by their English names. `shopBadges`: the Poké Mart stocks it once you hold that many badges.
const item = (key: string, name: string, description: string, price: number, effect: ItemDef['effect'], shopBadges: number | null): ItemDef => ({
  key,
  name,
  description,
  spriteUrl: ITEM_SPRITE(key),
  price,
  effect,
  inShop: shopBadges != null,
  shopBadges: shopBadges ?? 0,
})

const ITEMS: ItemDef[] = [
  item('potion', 'Potion', 'Restores 20 HP to one Pokémon.', 15, { kind: 'heal', amount: 20 }, 0),
  item('super-potion', 'Super Potion', 'Restores 50 HP to one Pokémon.', 35, { kind: 'heal', amount: 50 }, 1),
  item('hyper-potion', 'Hyper Potion', 'Restores 120 HP to one Pokémon.', 80, { kind: 'heal', amount: 120 }, 4),
  item('antidote', 'Antidote', 'Cures a poisoned Pokémon. In battle.', 10, { kind: 'cure', statuses: ['poison'] }, 0),
  item('paralyze-heal', 'Paralyze Heal', 'Cures paralysis — the Pokémon can act this very turn. In battle.', 12, { kind: 'cure', statuses: ['paralyze'] }, 0),
  item('burn-heal', 'Burn Heal', 'Cures a burn. In battle.', 12, { kind: 'cure', statuses: ['burn'] }, 1),
  item('ice-heal', 'Ice Heal', 'Thaws a frozen Pokémon — it can act this very turn. In battle.', 12, { kind: 'cure', statuses: ['frozen'] }, 2),
  item('ether', 'Ether', 'Gives the Pokémon in battle one reroll back (up to its maximum).', 40, { kind: 'rerolls', amount: 1 }, 3),
  item('max-ether', 'Max Ether', 'Gives the Pokémon in battle three rerolls back (up to its maximum).', 100, { kind: 'rerolls', amount: 3 }, 6),
  item('rare-candy', 'Rare Candy', 'Raises a Pokémon by one level. Use it from the Team screen.', 300, { kind: 'level', amount: 1 }, null),
  item('poke-ball', 'Poké Ball', 'Adds 1 to the catch die.', 20, { kind: 'ball', bonus: 1 }, 0),
  item('great-ball', 'Great Ball', 'A good ball: adds 2 to the catch die.', 50, { kind: 'ball', bonus: 2 }, 2),
  item('ultra-ball', 'Ultra Ball', 'A high-performance ball: adds 3 to the catch die.', 100, { kind: 'ball', bonus: 3 }, 4),
  item('master-ball', 'Master Ball', 'The best ball there is. It never misses.', 1000, { kind: 'ball', bonus: 9 }, null),
]

// ---------------------------------------------------------------- deterministic UUIDs

export function stableUuid(name: string): string {
  const h = createHash('sha1').update(`pokedice:${name}`).digest('hex')
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

// ---------------------------------------------------------------- main

async function fetchSpecies(): Promise<Species[]> {
  const dexes = Array.from({ length: KANTO }, (_, i) => i + 1)
  console.log('· fetching 151 pokemon + species…')
  const mons = await mapPool(dexes, 8, (d) => getJson<ApiPokemon>(`${API}/pokemon/${d}`))
  const species = await mapPool(dexes, 8, (d) => getJson<ApiSpecies>(`${API}/pokemon-species/${d}`))

  const chainUrls = [...new Set(species.map((s) => s.evolution_chain.url))]
  console.log(`· fetching ${chainUrls.length} evolution chains…`)
  const chains = await mapPool(chainUrls, 8, (u) => getJson<ApiChain>(u))

  const evolutions = new Map<number, Evolution[]>()
  const evoNotes = new Map<number, string[]>()
  const walk = (link: ApiChainLink) => {
    const from = dexFromUrl(link.species.url)
    for (const child of link.evolves_to) {
      const to = dexFromUrl(child.species.url)
      if (from <= KANTO && to <= KANTO) {
        const { level, note } = evolutionLevel(child.evolution_details)
        const list = evolutions.get(from) ?? []
        list.push({ toDex: to, level })
        evolutions.set(from, list)
        if (note) evoNotes.set(from, [...(evoNotes.get(from) ?? []), `→ #${to}: ${note}`])
      }
      walk(child)
    }
  }
  chains.forEach((c) => walk(c.chain))

  const bstOf = new Map<number, number>()
  const list = mons.map((mon, i) => {
    const sp = species[i]!
    const dex = mon.id
    const types = [...mon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name as PokeType)
    const stat = (name: string) => mon.stats.find((s) => s.stat.name === name)?.base_stat ?? 0
    const bst = mon.stats.reduce((sum, s) => sum + s.base_stat, 0)
    bstOf.set(mon.id, bst)
    const hpStat = stat('hp')
    const type1 = types[0]!
    const type2 = types[1] ?? null
    const diceCount = diceCountFromBst(bst)
    const evos = evolutions.get(dex) ?? []
    const name = sp.names.find((n) => n.language.name === 'en')?.name ?? `#${dex}`
    const notes = [`BST ${bst}`, ...(evoNotes.get(dex) ?? [])].join(' · ')
    return {
      dex,
      name,
      type1,
      type2,
      baseHp: hpAtLevel(hpStat, 1),
      maxHp: hpAtLevel(hpStat, 100),
      speed: Math.floor(stat('speed') / 10), // game Speed = base Speed ÷ 10, rounded down
      spriteUrl: SPRITE(dex),
      dice: composeDice(diceCount, type1, type2),
      rerolls: diceCount,
      catchValue: catchValueFromRate(sp.capture_rate),
      evolutions: evos,
      milestones: [],
      notes,
    } satisfies Species
  })
  // Dice, rerolls and milestones follow the evolution stage (see dicePlan).
  return applyDiceSchedule(list, (dex) => bstOf.get(dex) ?? 0)
}

async function fetchTypeChart(): Promise<TypeChartRow[]> {
  console.log('· fetching 18 types…')
  const types = await mapPool([...POKE_TYPES], 6, (t) => getJson<ApiType>(`${API}/type/${t}`))
  const valid = new Set<string>(POKE_TYPES)
  const rows: TypeChartRow[] = []
  for (const t of types) {
    const add = (list: { name: string }[], multiplier: number) => {
      for (const d of list) {
        if (valid.has(d.name))
          rows.push({ attacking: t.name as PokeType, defending: d.name as PokeType, multiplier })
      }
    }
    add(t.damage_relations.double_damage_to, 2)
    add(t.damage_relations.half_damage_to, 0.5)
    add(t.damage_relations.no_damage_to, 0)
  }
  rows.sort((a, b) => a.attacking.localeCompare(b.attacking) || a.defending.localeCompare(b.defending))
  return rows
}

function buildAreasAndTrainers(pokemon: Species[]): { areas: Area[]; trainers: Trainer[] } {
  const rng = createRng(20260913)
  const byDex = new Map(pokemon.map((p) => [p.dex, p]))
  const legendaries = new Set(LEGENDARIES)
  const starters = new Set(STARTERS)
  const areas: Area[] = []
  const trainers: Trainer[] = []

  for (const plan of AREAS) {
    const areaId = stableUuid(`area:${plan.key}`)
    // The catch-all pool (Cerulean Cave) includes the starters so 151/151 is reachable; hand-written pools don't.
    const wildRows =
      plan.wild === 'ALL'
        ? pokemon
            .filter((p) => !legendaries.has(p.dex))
            .map((p) => [p.dex, RARE_IN_CATCH_ALL.has(p.dex) ? 3 : 10, plan.minLevel, plan.maxLevel] as const)
        : plan.wild
    for (const [dex] of wildRows) {
      if (legendaries.has(dex)) throw new Error(`${plan.name}: #${dex} is a legendary`)
      if (plan.wild !== 'ALL' && starters.has(dex)) throw new Error(`${plan.name}: #${dex} is a starter`)
      if (!byDex.has(dex)) throw new Error(`${plan.name}: unknown dex #${dex}`)
    }
    const wildPool = wildRows.map(([dex, weight, minLevel, maxLevel]) => ({
      id: stableUuid(`wild:${plan.key}:${dex}`),
      dex,
      weight,
      minLevel,
      maxLevel,
    }))

    const typesOf = (dex: number): PokeType[] => {
      const s = byDex.get(dex)!
      return s.type2 ? [s.type1, s.type2] : [s.type1]
    }
    const checkTeam = (who: string, team: Mon[]) => {
      if (!team.length || team.length > 3) throw new Error(`${plan.name} / ${who}: teams have 1–3 Pokémon`)
      for (const [dex, level] of team) {
        if (!byDex.has(dex)) throw new Error(`${plan.name} / ${who}: unknown dex #${dex}`)
        if (legendaries.has(dex) || starters.has(dex)) throw new Error(`${plan.name} / ${who}: #${dex} is a legendary or starter`)
        if (level < 1 || level > 100) throw new Error(`${plan.name} / ${who}: bad level ${level}`)
      }
    }

    const trainerPool = plan.trainers.map((tp, i) => {
      const trainerId = stableUuid(`trainer:${plan.key}:${i}:${tp.name}`)
      let team: Mon[]
      if (tp.team) team = tp.team
      else {
        // Generated from the area's pool around the area's level band (Cerulean Cave rescales at runtime anyway).
        const size = tp.size ?? 2
        const n = plan.trainers.length
        const lo = plan.minLevel + 1
        const hi = Math.max(lo, plan.maxLevel - 1)
        const baseLevel = Math.round(lo + ((hi - lo) * i) / Math.max(1, n - 1))
        const matches = (dex: number) => !tp.specialty || typesOf(dex).includes(tp.specialty)
        // Trainers never field a starter.
        const drawable = wildPool.filter((w) => !starters.has(w.dex))
        const specialists = drawable.filter((w) => matches(w.dex))
        const chosen: number[] = []
        const draw = (from: typeof wildPool) => {
          const left = from.filter((w) => !chosen.includes(w.dex))
          const pick = rng.weighted(left, (w) => w.weight)
          if (pick) chosen.push(pick.dex)
        }
        while (chosen.length < size && specialists.some((w) => !chosen.includes(w.dex))) draw(specialists)
        while (chosen.length < size && drawable.some((w) => !chosen.includes(w.dex))) draw(drawable)
        team = chosen.map((dex) => [dex, Math.min(plan.maxLevel, Math.max(plan.minLevel, baseLevel + rng.int(-1, 1)))])
      }
      checkTeam(tp.name, team)
      trainers.push({
        id: trainerId,
        name: tp.name,
        spriteUrl: trainerSprite(tp.name),
        team: team.map(([dex, level]) => ({ dex, level })),
        role: 'trainer',
        badge: null,
        upgradeLevel: null,
        battleBackground: null,
      })
      return { id: stableUuid(`trainerpool:${plan.key}:${i}:${tp.name}`), trainerId, weight: 10 }
    })

    // Gym leaders / Elite Four / Champion: fought in order once the gauge is full; not in the random pool.
    const gyms = (plan.gyms ?? []).map((g, j) => {
      const id = stableUuid(`gym:${plan.key}:${j}:${g.name}`)
      checkTeam(g.name, g.team)
      trainers.push({
        id,
        name: g.name,
        spriteUrl: trainerSprite(g.name, g.role),
        team: g.team.map(([dex, level]) => ({ dex, level })),
        role: g.role,
        badge: g.badge ?? null,
        upgradeLevel: null,
        // Gyms, the Elite Four and the Champion fight indoors.
        battleBackground: 'default',
      })
      return id
    })

    const itemKeys = new Set(ITEMS.map((i) => i.key))
    const lootPool = lootPlanFor(plan).map(([itemKey, weight, minQty, maxQty, once], i) => {
      if (itemKey !== 'money' && !itemKeys.has(itemKey)) throw new Error(`${plan.name}: unknown loot item ${itemKey}`)
      return { id: stableUuid(`loot:${plan.key}:${i}:${itemKey}`), itemKey, weight, unique: !!once, minQty, maxQty }
    })

    areas.push({
      id: areaId,
      orderIndex: plan.orderIndex,
      name: plan.name,
      bannerUrl: `/banners/${plan.banner.scene}.png${plan.banner.flip ? '#flip' : ''}`,
      xpToUnlockNext: plan.xpToUnlockNext,
      minLevel: plan.minLevel,
      maxLevel: plan.maxLevel,
      encounterWeights: plan.weights,
      backtrackMultiplier: plan.backtrackMultiplier,
      legendaryBoss: plan.bosses,
      scalesToTeam: plan.scalesToTeam,
      easyMode: !!plan.easyMode,
      enemyUpgradeLevel: null, // set below, once every area is known
      battleBackground: AREA_BACKGROUNDS[plan.name] ?? 'default',
      hidden: !!plan.hidden,
      unlockConditions: plan.conditions ?? null,
      gyms,
      wildPool,
      trainerPool,
      lootPool,
    })
  }
  assignEnemyUpgradeLevels(areas, trainers)
  return { areas, trainers }
}

/**
 * Balancing rule (not a game rule): foes fight at upgrade level 1 until the first badge can be won, then one level
 * higher after each area that holds a Gym Leader. A secret area takes the level of the last main-route area whose
 * minimum level is at or below its own.
 */
export function assignEnemyUpgradeLevels(areas: Area[], trainers: Trainer[]) {
  const byId = new Map(trainers.map((t) => [t.id, t]))
  const chain = areas.filter((a) => !a.hidden).sort((a, b) => a.orderIndex - b.orderIndex)
  let badges = 0
  for (const a of chain) {
    a.enemyUpgradeLevel = 1 + badges
    badges += a.gyms.filter((id) => byId.get(id)?.role === 'leader' && byId.get(id)?.badge).length
  }
  for (const a of areas.filter((x) => x.hidden)) {
    const like = chain.filter((c) => c.minLevel <= a.minLevel).at(-1) ?? chain[0]
    a.enemyUpgradeLevel = like?.enemyUpgradeLevel ?? 1
  }
}

// ---------------------------------------------------------------- SQL emission

const sqlVal = (v: unknown): string => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  return `'${String(v).replace(/'/g, "''")}'`
}

function upsert(table: string, cols: string[], rows: unknown[][], conflict: string[]): string {
  if (!rows.length) return `-- ${table}: no rows\n`
  const values = rows.map((r) => `  (${r.map(sqlVal).join(', ')})`).join(',\n')
  const updates = cols.filter((c) => !conflict.includes(c))
  const onConflict = updates.length
    ? `on conflict (${conflict.join(', ')}) do update set ${updates.map((c) => `${c} = excluded.${c}`).join(', ')}`
    : `on conflict (${conflict.join(', ')}) do nothing`
  return `insert into ${table} (${cols.join(', ')}) values\n${values}\n${onConflict};\n`
}

export function buildSql(b: {
  pokemon: Species[]
  typeChart: TypeChartRow[]
  diceTypes: DiceTypeDef[]
  areas: Area[]
  trainers: Trainer[]
  upgrades: { combos: ComboUpgradeRow[]; dice: DieUpgradeRow[] }
  items: ItemDef[]
  config: Record<string, unknown>
}): string {
  const parts = [
    '-- Pokédice seed data. Generated by `pnpm seed` — do not edit by hand.',
    '-- Run AFTER the migrations (0001_init.sql, then any later ones). Safe to re-run: every insert is an upsert on a stable key.',
    'begin;',
    upsert(
      'type_chart',
      ['attacking', 'defending', 'multiplier'],
      b.typeChart.map((r) => [r.attacking, r.defending, r.multiplier]),
      ['attacking', 'defending'],
    ),
    upsert(
      'dice_types',
      ['type', 'label', 'color', 'faces', 'description', 'upgradeable', 'counts_for_majority', 'sort_order'],
      b.diceTypes.map((d) => [d.type, d.label, d.color, d.faces, d.description, d.upgradeable, d.countsForMajority, d.sortOrder]),
      ['type'],
    ),
    upsert(
      'pokemon',
      [
        'dex',
        'name',
        'type1',
        'type2',
        'base_hp',
        'max_hp',
        'speed',
        'sprite_url',
        'dice',
        'rerolls',
        'catch_value',
        'evolutions',
        'milestones',
        'notes',
      ],
      b.pokemon.map((p) => [
        p.dex,
        p.name,
        p.type1,
        p.type2,
        p.baseHp,
        p.maxHp,
        p.speed,
        p.spriteUrl,
        p.dice,
        p.rerolls,
        p.catchValue,
        p.evolutions,
        p.milestones,
        p.notes ?? null,
      ]),
      ['dex'],
    ),
    upsert(
      'areas',
      [
        'id',
        'order_index',
        'name',
        'banner_url',
        'xp_to_unlock_next',
        'min_level',
        'max_level',
        'encounter_weights',
        'backtrack_multiplier',
        'legendary_boss',
        'scales_to_team',
        'easy_mode',
        'enemy_upgrade_level',
        'battle_background',
        'hidden',
        'unlock_conditions',
        'gyms',
      ],
      b.areas.map((a) => [
        a.id,
        a.orderIndex,
        a.name,
        a.bannerUrl,
        a.xpToUnlockNext,
        a.minLevel,
        a.maxLevel,
        a.encounterWeights,
        a.backtrackMultiplier,
        a.legendaryBoss,
        a.scalesToTeam,
        a.easyMode,
        a.enemyUpgradeLevel,
        a.battleBackground,
        a.hidden,
        a.unlockConditions,
        a.gyms,
      ]),
      ['id'],
    ),
    upsert(
      'trainers',
      ['id', 'name', 'sprite_url', 'team', 'role', 'badge', 'upgrade_level', 'battle_background'],
      b.trainers.map((t) => [t.id, t.name, t.spriteUrl, t.team, t.role, t.badge, t.upgradeLevel, t.battleBackground]),
      ['id'],
    ),
    upsert(
      'area_wild_pool',
      ['id', 'area_id', 'dex', 'weight', 'min_level', 'max_level'],
      b.areas.flatMap((a) => a.wildPool.map((w) => [w.id, a.id, w.dex, w.weight, w.minLevel, w.maxLevel])),
      ['id'],
    ),
    upsert(
      'area_trainer_pool',
      ['id', 'area_id', 'trainer_id', 'weight'],
      b.areas.flatMap((a) => a.trainerPool.map((t) => [t.id, a.id, t.trainerId, t.weight])),
      ['id'],
    ),
    upsert(
      'area_loot_pool',
      ['id', 'area_id', 'item_key', 'weight', 'unique_find', 'min_qty', 'max_qty'],
      b.areas.flatMap((a) => a.lootPool.map((l) => [l.id, a.id, l.itemKey, l.weight, l.unique, l.minQty, l.maxQty])),
      ['id'],
    ),
    upsert(
      'combo_upgrades',
      ['combo_key', 'level', 'bonus', 'cost'],
      b.upgrades.combos.map((r) => [r.comboKey, r.level, r.bonus, r.cost]),
      ['combo_key', 'level'],
    ),
    upsert(
      'die_upgrades',
      ['die_type', 'level', 'bonus', 'cost'],
      b.upgrades.dice.map((r) => [r.dieType, r.level, r.bonus, r.cost]),
      ['die_type', 'level'],
    ),
    upsert(
      'items',
      ['key', 'name', 'description', 'sprite_url', 'price', 'effect', 'in_shop', 'shop_badges'],
      b.items.map((i) => [i.key, i.name, i.description, i.spriteUrl, i.price, i.effect, i.inShop, i.shopBadges]),
      ['key'],
    ),
    // game_config values are jsonb; wrap scalars so they serialise as JSON too.
    upsert(
      'game_config',
      ['key', 'value'],
      Object.entries(b.config).map(([k, v]) => [k, `__JSON__${JSON.stringify(v)}`]),
      ['key'],
    ).replace(/'__JSON__(.*?)'(?=\)|,)/g, (_m, json: string) => `'${json}'::jsonb`),
    'commit;',
  ]
  return parts.join('\n')
}

async function writeJson(name: string, data: unknown) {
  await writeFile(path.join(DATA_DIR, name), JSON.stringify(data, null, 1) + '\n')
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true })
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(path.dirname(SQL_FILE), { recursive: true })

  const pokemon = await fetchSpecies()
  const typeChart = await fetchTypeChart()
  const diceTypes = buildDiceTypes()
  const upgrades = buildUpgrades()
  const { areas, trainers } = buildAreasAndTrainers(pokemon)
  const config: Record<string, unknown> = { ...DEFAULT_CONFIG }

  const bundle = { pokemon, typeChart, diceTypes, areas, trainers, upgrades, items: ITEMS, config }
  await writeJson('pokemon.json', pokemon)
  await writeJson('type-chart.json', typeChart)
  await writeJson('dice-types.json', diceTypes)
  await writeJson('areas.json', areas)
  await writeJson('trainers.json', trainers)
  await writeJson('upgrades.json', upgrades)
  await writeJson('items.json', ITEMS)
  await writeJson('config.json', config)
  await writeFile(SQL_FILE, buildSql(bundle))

  console.log(
    `✓ ${pokemon.length} pokemon · ${typeChart.length} type-chart rows · ${diceTypes.length} dice types · ` +
      `${areas.length} areas · ${trainers.length} trainers · ${upgrades.combos.length} combo rows · ` +
      `${upgrades.dice.length} die rows · ${ITEMS.length} items`,
  )
  console.log(`✓ wrote src/data/*.json and supabase/seed.sql`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
