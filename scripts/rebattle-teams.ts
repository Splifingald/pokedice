/**
 * pnpm rebattle-teams — the Elite Rebattle's trainers (docs/18, docs/19 §5.1).
 *
 * For every region with a league, its League I Elite Four and Champion come back in three tiers, three Pokémon each,
 * the ace last:
 * - Bronze: their League I levels + 10, one Pokémon (not the ace) swapped for another of the member's type;
 * - Silver: + 25, a second one swapped;
 * - Gold: Silver's team, every Pokémon Lv.100.
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

export const REBATTLE_TIERS = ['bronze', 'silver', 'gold'] as const
type TierId = (typeof REBATTLE_TIERS)[number]

/** Each tier's levels (added to League I's, or a flat level), swaps, and the potions its trainers carry (a Hyper Potion each, like every League trainer). */
const TIER: Record<TierId, { add?: number; level?: number; swaps: number; potions: number }> = {
  bronze: { add: 10, swaps: 1, potions: 1 },
  silver: { add: 25, swaps: 2, potions: 1 },
  gold: { level: 100, swaps: 2, potions: 1 },
}

/**
 * Kanto's rival, by the player's starter: Raichu, a second partner, and the starter that beats the player's (the
 * League II rival teams these replace).
 */
const KANTO_RIVAL: Record<number, number[]> = { 1: [26, 130, 6], 4: [26, 59, 9], 7: [26, 59, 3] }

/** Never a swap: the Ultra Beasts and the Paradox Pokémon (the data doesn't count them as legendary). */
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const NOT_A_SWAP = new Set([...range(793, 799), ...range(803, 806), ...range(984, 995), ...range(1005, 1010), ...range(1020, 1023)])

/** The lineup the game reads: per region, per tier, the trainer ids in fight order. */
export type RebattleLineups = Record<string, Record<TierId, string[]>>

/** A stable pick from a list: the same trainer and tier always get the same Pokémon. */
function pickStable<T>(items: T[], key: string): T | undefined {
  if (!items.length) return undefined
  let h = 2166136261
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return items[(h >>> 0) % items.length]
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

      /** The member's three, ace last, with this tier's swaps and levels. A swap keyed by the member and slot is the
       *  same Pokémon in every tier that has it: Silver keeps Bronze's swap and adds one. */
      const tierTeam = (key: string, base: TrainerMon[], tier: TierId, swappable = true): TrainerMon[] => {
        const team = [...base].sort((a, b) => a.level - b.level).slice(-3)
        // The member's type: one at least two of their Pokémon share (the ace's first on a tie). Members without one
        // (N, a Champion's mixed team) keep their Pokémon.
        const count = new Map<string, number>()
        for (const m of team) for (const ty of typesOf(m.dex)) count.set(ty, (count.get(ty) ?? 0) + 1)
        const ace = typesOf(team[team.length - 1]?.dex ?? 0)
        const rank = (ty: string) => (ace.includes(ty as never) ? 0 : 1)
        const main = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]))[0]?.[0]
        const out = team.map((m) => ({ ...m }))
        if (swappable && main) {
          const taken = new Set(out.map((m) => m.dex))
          for (let i = 0; i < TIER[tier].swaps && i < out.length - 1; i++) {
            const local = inRegion.filter((s) => !taken.has(s.dex) && typesOf(s.dex).includes(main as never))
            const any = pool.filter((s) => s.dex <= hi && !taken.has(s.dex) && typesOf(s.dex).includes(main as never))
            const pick = pickStable(local.length ? local : any, `${key}:${i}`)
            if (!pick) continue
            taken.add(pick.dex)
            out[i] = { ...out[i]!, dex: pick.dex }
          }
        }
        const t = TIER[tier]
        return out.map((m) => ({ dex: m.dex, level: t.level ?? Math.min(100, m.level + (t.add ?? 0)), ...(m.shiny && { shiny: true }) }))
      }

      for (const tier of REBATTLE_TIERS) {
        const potions = Array.from({ length: TIER[tier].potions }, () => 'hyper-potion')
        for (const m of members) {
          // Kanto's Champion seat: the rival, one version per starter, at the League I Champion's levels.
          if (region.id === 'kanto' && m.role === 'champion') {
            const levels = [...m.team].map((x) => x.level).sort((a, b) => a - b)
            for (const [starter, dexes] of Object.entries(KANTO_RIVAL)) {
              const base = dexes.map((dex, i) => ({ dex, level: levels[i] ?? levels[levels.length - 1]! }))
              const id = stableUuid(`rebattle:${region.id}:${tier}:rival:${starter}`)
              made.push({
                id,
                name: 'Champion Rival',
                spriteUrl: '/characters/green.png',
                team: tierTeam(id, base, tier, false),
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
            team: tierTeam(`${region.id}:${m.id}`, m.team, tier, m.role !== 'champion'),
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
