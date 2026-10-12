/**
 * pnpm rebattle-teams — the Elite Rebattle's trainers (docs/18, docs/19 §5.1).
 *
 * For every region with a league, its League I Elite Four and Champion come back in four tiers, three Pokémon each,
 * the ace last:
 * - Bronze: their League I levels + 10;
 * - Silver: + 20;
 * - Gold: + 30;
 * - Diamond: every Pokémon Lv.100.
 * The ace stays; the two others come from the member's full roster in the games (ROSTERS: five or six Pokémon, plus
 * their League I ones), a different pair in every tier where the roster allows, so each rematch brings a different
 * team. A member with too few Pokémon for that is topped up with Pokémon of their type from their region.
 * Kanto's Champion seat is the rival, one version per starter (`rivalOf`), as in the games.
 *
 * Writes src/data/trainers.json (the tier trainers, upserted under stable ids, so a re-run updates the same rows) and
 * the `rebattleLineups` key of src/data/config.json (each region's lineup per tier, a game_config row of its own).
 * Teams and lineups can then be tuned in the admin; re-running overwrites them. Then `pnpm seed-sql`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Area, Region, Species, Trainer, TrainerMon } from '../src/engine'
import { stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'src', 'data')
const readJson = async <T>(f: string): Promise<T> => JSON.parse(await readFile(path.join(DATA, f), 'utf8')) as T
const writeJson = (f: string, v: unknown) => writeFile(path.join(DATA, f), `${JSON.stringify(v, null, 1)}\n`)

export const REBATTLE_TIERS = ['bronze', 'silver', 'gold', 'diamond'] as const
type TierId = (typeof REBATTLE_TIERS)[number]

/** Each tier's levels (added to League I's, or a flat level) and the potions its trainers carry (a Hyper Potion each, like every League trainer). */
const TIER: Record<TierId, { add?: number; level?: number; potions: number }> = {
  bronze: { add: 10, potions: 1 },
  silver: { add: 20, potions: 1 },
  gold: { add: 30, potions: 1 },
  diamond: { level: 100, potions: 1 },
}

/**
 * Kanto's rival, by the player's starter: the games' Champion team (Pidgeot, Alakazam, Rhydon, the two of Gyarados,
 * Exeggutor and Arcanine his starter doesn't cover) with Raichu, the starter that beats the player's last.
 */
export const KANTO_RIVAL: Record<number, number[]> = {
  1: [18, 65, 112, 26, 103, 130, 6],
  4: [18, 65, 112, 26, 103, 59, 9],
  7: [18, 65, 112, 26, 130, 59, 3],
}

/**
 * Each member's roster in the games where they're first met (Emerald, Platinum, Black and White, the Champion Cup…):
 * the Pokémon their rematch teams are drawn from, besides their League I ones. Regional forms by their data id
 * (10111 Alolan Golem, 10104 Alolan Ninetales). Keyed by region and the member's name.
 */
export const ROSTERS: Record<string, number[]> = {
  'kanto:Elite Four Lorelei': [87, 91, 80, 124, 131],
  'kanto:Elite Four Bruno': [95, 107, 106, 68],
  'kanto:Elite Four Agatha': [94, 42, 93, 24],
  'kanto:Elite Four Lance': [130, 148, 142, 149],
  'johto:Elite Four Will': [178, 124, 103, 80],
  'johto:Elite Four Koga': [168, 49, 205, 89, 169],
  'johto:Elite Four Bruno': [237, 106, 107, 95, 68],
  'johto:Elite Four Karen': [197, 45, 94, 198, 229],
  'johto:Champion Lance': [130, 149, 142, 6],
  'hoenn:Elite Four Sidney': [262, 275, 332, 342, 359],
  'hoenn:Elite Four Phoebe': [356, 354, 302],
  'hoenn:Elite Four Glacia': [364, 362, 365],
  'hoenn:Elite Four Drake': [372, 334, 230, 330, 373],
  'hoenn:Champion Wallace': [321, 73, 272, 340, 130, 350],
  'sinnoh:Elite Four Aaron': [469, 212, 416, 214, 452],
  'sinnoh:Elite Four Bertha': [340, 472, 450, 76, 464],
  'sinnoh:Elite Four Flint': [229, 136, 78, 392, 467],
  'sinnoh:Elite Four Lucian': [122, 196, 437, 65, 475],
  'sinnoh:Champion Cynthia': [442, 407, 423, 468, 448, 350, 445],
  'unova:Elite Four Shauntal': [563, 593, 623, 609],
  'unova:Elite Four Grimsley': [560, 510, 553, 625],
  'unova:Elite Four Caitlin': [518, 561, 579, 576],
  'unova:Elite Four Marshal': [538, 539, 620, 534],
  'unova:N': [565, 584, 567, 571, 601],
  'unova:Ghetsis': [563, 626, 537, 625, 604, 635],
  'kalos:Elite Four Malva': [668, 324, 609, 663],
  'kalos:Elite Four Siebold': [693, 121, 130, 689],
  'kalos:Elite Four Wikstrom': [707, 476, 212, 681],
  'kalos:Elite Four Drasna': [691, 621, 334, 715],
  'kalos:Champion Diantha': [701, 697, 699, 711, 706, 282],
  'alola:Elite Four Hala': [297, 57, 760, 62, 740],
  'alola:Elite Four Olivia': [369, 703, 10111, 476, 745],
  'alola:Elite Four Acerola': [302, 426, 781, 478, 770],
  'alola:Elite Four Kahili': [227, 169, 741, 630, 733],
  'alola:Professor Kukui': [745, 10104, 628, 462, 143],
  'galar:Marnie': [510, 454, 560, 877, 861],
  'galar:Nessa': [279, 768, 847, 834],
  'galar:Bea': [237, 675, 865, 68],
  'galar:Raihan': [526, 330, 844, 884],
  'galar:Champion Leon': [681, 887, 612, 537, 866, 464, 6],
  'paldea:Elite Four Rika': [340, 323, 232, 51, 980],
  'paldea:Elite Four Poppy': [879, 462, 437, 823, 959],
  'paldea:Elite Four Larry': [357, 741, 334, 398, 973],
  'paldea:Elite Four Hassel': [715, 612, 691, 841, 998],
  'paldea:Champion Geeta': [956, 673, 976, 713, 983, 970],
  'paldea:Champion Nemona': [745, 706, 982, 968, 923],
}

/**
 * Fewer than this many Pokémon besides the ace (Emerald's Phoebe and Glacia have two), and the member's type tops the
 * bench up. Three already make three different pairs (Diamond then brings Bronze's back at Lv.100): a member keeps
 * their own Pokémon wherever they have enough.
 */
export const MIN_BENCH = 3

/** Never a top-up: the Ultra Beasts and the Paradox Pokémon (the data doesn't count them as legendary). */
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const NOT_A_SWAP = new Set([...range(793, 799), ...range(803, 806), ...range(984, 995), ...range(1005, 1010), ...range(1020, 1023)])

/** The lineup the game reads: per region, per tier, the trainer ids in fight order. */
export type RebattleLineups = Record<string, Record<TierId, string[]>>

/** A stable hash: the same trainer always gets the same picks, run after run. */
function hash(key: string): number {
  let h = 2166136261
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** A stable pick from a list. */
function pickStable<T>(items: T[], key: string): T | undefined {
  return items.length ? items[hash(key) % items.length] : undefined
}

/**
 * The two Pokémon beside the ace, tier by tier: a pair not used yet whose members have come out least, so the bench
 * goes round before anyone comes back. The bench is shuffled per member first (stably), so tiers don't all open on the
 * roster's first two. Fewer than two on the bench: whatever there is, every tier.
 */
export function benchPairs<T>(bench: T[], tiers: number, key: string): T[][] {
  const order = bench
    .map((m, i) => ({ m, k: hash(`${key}:${i}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.m)
  if (order.length < 2) return Array.from({ length: tiers }, () => order.slice())
  const pairs: [number, number][] = []
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) pairs.push([i, j])
  const used = new Set<number>()
  const out = order.map(() => 0)
  const picked: T[][] = []
  for (let t = 0; t < tiers; t++) {
    let best = -1
    for (let p = 0; p < pairs.length; p++) {
      if (used.has(p) && used.size < pairs.length) continue
      const [i, j] = pairs[p]!
      if (best < 0 || out[i]! + out[j]! < out[pairs[best]![0]]! + out[pairs[best]![1]]!) best = p
    }
    used.add(best)
    const [i, j] = pairs[best]!
    out[i]!++
    out[j]!++
    picked.push([order[i]!, order[j]!])
  }
  return picked
}

function main() {
  return (async () => {
    const [areas, trainers, regions, species, eggs] = await Promise.all([
      readJson<Area[]>('areas.json'),
      readJson<Trainer[]>('trainers.json'),
      readJson<Region[]>('regions.json'),
      readJson<Species[]>('pokemon.json'),
      readJson<Record<string, { l?: number }>>('egg-groups.json'),
    ])
    const byId = new Map(trainers.map((t) => [t.id, t]))
    const sp = new Map(species.map((s) => [s.dex, s]))
    const typesOf = (dex: number) => {
      const s = sp.get(dex)
      return s ? [s.type1, s.type2].filter((x): x is NonNullable<typeof x> => !!x) : []
    }
    // Every region's starters and what they evolve into: a partner never turns up in someone else's team.
    const starterLines = new Set<number>()
    const grow = (dex: number) => {
      if (starterLines.has(dex)) return
      starterLines.add(dex)
      for (const e of sp.get(dex)?.evolutions ?? []) grow(e.toDex)
    }
    for (const r of regions) for (const dex of r.starters) grow(dex)
    // Swaps come from fully evolved, non-legendary species, no alternate forms, no starter lines.
    const pool = species.filter(
      (s) => s.dex < 10000 && !s.evolutions.length && !eggs[String(s.dex)]?.l && !starterLines.has(s.dex) && !NOT_A_SWAP.has(s.dex),
    )

    const lineups: RebattleLineups = {}
    const made: Trainer[] = []
    for (const region of regions) {
      const league = areas.find((a) => a.id === region.leagueAreaId)
      if (!league || !league.gyms.length) continue
      const members = league.gyms.map((id) => byId.get(id)).filter((t): t is Trainer => !!t && t.team.length > 0)
      const [lo, hi] = region.dexRange
      const inRegion = pool.filter((s) => s.dex >= lo && s.dex <= hi)
      const lineup = Object.fromEntries(REBATTLE_TIERS.map((t) => [t, [] as string[]])) as Record<TierId, string[]>

      /** The member's three per tier, ace last: League I's levels (raised by the tier), League I's ace, and a pair
       *  from the bench — the roster and League I's others, topped up with the member's type when too few. */
      const tierTeams = (key: string, league: TrainerMon[], roster: number[]): Record<TierId, TrainerMon[]> => {
        const team = [...league].sort((a, b) => a.level - b.level).slice(-3)
        const ace = team[team.length - 1]!
        const bench = [...new Set([...roster, ...team.map((m) => m.dex)])].filter((dex) => dex !== ace.dex && sp.has(dex))
        if (bench.length < MIN_BENCH) {
          // The member's type: one at least two of their Pokémon share (the ace's first on a tie), else the ace's.
          const count = new Map<string, number>()
          for (const dex of [ace.dex, ...bench]) for (const ty of typesOf(dex)) count.set(ty, (count.get(ty) ?? 0) + 1)
          const aceTypes = typesOf(ace.dex)
          const rank = (ty: string) => (aceTypes.includes(ty as never) ? 0 : 1)
          const main =
            [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]))[0]?.[0] ??
            aceTypes[0]
          for (let i = 0; bench.length < MIN_BENCH && main && i < MIN_BENCH; i++) {
            const taken = new Set([ace.dex, ...bench])
            const local = inRegion.filter((s) => !taken.has(s.dex) && typesOf(s.dex).includes(main as never))
            const any = pool.filter((s) => s.dex <= hi && !taken.has(s.dex) && typesOf(s.dex).includes(main as never))
            const pick = pickStable(local.length ? local : any, `${key}:top-up:${i}`)
            if (pick) bench.push(pick.dex)
          }
        }
        const pairs = benchPairs(bench, REBATTLE_TIERS.length, key)
        return Object.fromEntries(
          REBATTLE_TIERS.map((tier, ti) => {
            const t = TIER[tier]
            const lvl = (level: number) => t.level ?? Math.min(100, level + (t.add ?? 0))
            const others = pairs[ti]!.map((dex, i) => ({ dex, level: lvl(team[i]?.level ?? ace.level) }))
            return [tier, [...others, { dex: ace.dex, level: lvl(ace.level), ...(ace.shiny && { shiny: true }) }]]
          }),
        ) as Record<TierId, TrainerMon[]>
      }

      // Every member's four teams first: a member's tiers are drawn together, so no two match.
      const teamsOf = new Map<string, Record<TierId, TrainerMon[]>>()
      for (const m of members) {
        if (region.id === 'kanto' && m.role === 'champion') {
          const levels = [...m.team].map((x) => x.level).sort((a, b) => a - b)
          for (const [starter, dexes] of Object.entries(KANTO_RIVAL)) {
            const league = dexes.slice(-3).map((dex, i) => ({ dex, level: levels[i] ?? levels[levels.length - 1]! }))
            teamsOf.set(`rival:${starter}`, tierTeams(`${region.id}:rival:${starter}`, league, dexes))
          }
          continue
        }
        const roster = ROSTERS[`${region.id}:${m.name}`]
        if (!roster) console.warn(`  no roster for ${region.id}:${m.name}: League I team and their type only`)
        teamsOf.set(m.id, tierTeams(`${region.id}:${m.id}`, m.team, roster ?? []))
      }

      for (const tier of REBATTLE_TIERS) {
        const potions = Array.from({ length: TIER[tier].potions }, () => 'hyper-potion')
        for (const m of members) {
          // Kanto's Champion seat: the rival, one version per starter, at the League I Champion's levels.
          if (region.id === 'kanto' && m.role === 'champion') {
            for (const starter of Object.keys(KANTO_RIVAL)) {
              const id = stableUuid(`rebattle:${region.id}:${tier}:rival:${starter}`)
              made.push({
                id,
                name: 'Champion Rival',
                spriteUrl: '/characters/green.png',
                team: teamsOf.get(`rival:${starter}`)![tier],
                role: 'champion',
                badge: null,
                upgradeLevel: null,
                battleBackground: m.battleBackground,
                items: potions,
                rivalOf: Number(starter),
              })
              lineup[tier].push(id)
            }
            continue
          }
          const id = stableUuid(`rebattle:${region.id}:${tier}:${m.id}`)
          made.push({
            id,
            name: m.name,
            spriteUrl: m.spriteUrl,
            team: teamsOf.get(m.id)![tier],
            role: m.role,
            badge: null,
            upgradeLevel: null,
            battleBackground: m.battleBackground,
            items: potions,
          })
          lineup[tier].push(id)
        }
      }
      lineups[region.id] = lineup
    }

    const madeIds = new Set(made.map((t) => t.id))
    const next = [...trainers.filter((t) => !madeIds.has(t.id)), ...made]
    await writeJson('trainers.json', next)
    const config = await readJson<Record<string, unknown>>('config.json')
    await writeJson('config.json', { ...config, rebattleLineups: lineups })
    console.log(`✓ ${made.length} rebattle trainers in ${Object.keys(lineups).length} regions (trainers.json, config.json rebattleLineups)`)
  })()
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
