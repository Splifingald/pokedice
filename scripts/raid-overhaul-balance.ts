/**
 * pnpm raid-overhaul-balance [raids per Pokémon=100] [shard=0] [shards=1]
 * The raid overhaul's win rates (docs/40), its rules playing: your side brings three Pokémon that hit the raid Pokémon
 * super effectively (the green thumb's rule), the two others are random NPC trainers, all at the raid's team cap and
 * on the battle AI. Prints each raid's win rate with RAID_SPECIALS' numbers against its tier's target.
 * TUNE=1 searches each raid's HP per bar (its level, bars and dice level kept) for its tier's target and prints the
 * number to put in the table. ONLY=150,249 limits it to those raids.
 */
import { BUNDLE } from '../src/config/bundle'
import {
  compileGameData,
  createRng,
  MEGA_RAIDS,
  npcTeam,
  RAID_SPECIALS,
  raidAllyAllowed,
  raidRecommended,
  raidTeamCap,
  simulateRaid,
  type GameData,
  type RaidSpecial,
  type RaidTier,
} from '../src/engine'

/** Each tier's target with the rules on: about 10–15 points under the numbers-only targets of the plan. */
export const TARGET: Record<RaidTier, number> = {
  minor: 70,
  trio: 60,
  guardian: 55,
  beast: 55,
  paradox: 50,
  box: 45,
  apex: 35,
  mythic: 35,
  mega: 35,
}

const N = Number(process.argv[2] ?? 100)
const shard = Number(process.argv[3] ?? 0)
const shards = Number(process.argv[4] ?? 1)
const only = process.env.ONLY?.split(',').map(Number)

const base = compileGameData(BUNDLE)
const regions = base.regions.map((r) => r.id)
const pool = base.speciesList.map((s) => s.dex).filter(raidAllyAllowed(base))
const areaOf = (dex: number) =>
  base.areas.find((a) => a.legendaryBoss?.some((b) => b.dex === (MEGA_RAIDS[dex]?.base ?? dex) && b.raid))?.id

/** The game data with this raid's HP per bar set (its own numbers otherwise). */
function withBarHp(dex: number, barHp: number): GameData {
  const raid = base.config.events.raid
  return {
    ...base,
    config: {
      ...base.config,
      events: {
        ...base.config.events,
        raid: {
          ...raid,
          progress: { ...raid.progress, perMon: { ...raid.progress.perMon, [dex]: { barHp } } },
          perMon: { ...raid.perMon, [dex]: { barHp } },
        },
      },
    },
  }
}

function winRate(data: GameData, dex: number, seed: number): number {
  const kind = dex === 493 ? 'daily' : 'progress'
  const areaId = kind === 'daily' ? undefined : areaOf(dex)
  const cap = raidTeamCap(data, dex, kind, areaId)
  const target = MEGA_RAIDS[dex]?.form ?? dex
  const counters = pool.filter((d) => raidRecommended(data, { dex: d, level: cap }, target, cap))
  const src = counters.length >= 3 ? counters : pool
  const rng = createRng(seed)
  let wins = 0
  for (let i = 0; i < N; i++) {
    const picks: number[] = []
    while (picks.length < 3) {
      const d = rng.pick(src)
      if (!picks.includes(d)) picks.push(d)
    }
    const sides = [
      {
        owner: 'Me',
        look: null,
        kind: 'me' as const,
        team: picks.map((d, j) => ({ uid: `s0-${j}`, dex: d, level: cap, hp: Number.MAX_SAFE_INTEGER })),
      },
      ...[1, 2].map((k) => ({
        owner: `S${k}`,
        look: null,
        kind: 'npc' as const,
        team: npcTeam(data, regions, rng, `s${k}`, cap),
      })),
    ]
    if (simulateRaid({ boss: { dex, shiny: false }, sides, kind, areaId }, data, rng).won) wins++
  }
  return Math.round((wins / N) * 100)
}

const raids: [number, RaidSpecial][] = [
  ...Object.entries(RAID_SPECIALS).map(([d, s]) => [Number(d), s] as [number, RaidSpecial]),
  ...Object.values(MEGA_RAIDS).map((m) => [m.form, m.special] as [number, RaidSpecial]),
].filter(([d], i) => (!only || only.includes(d)) && i % shards === shard)

for (const [dex, sp] of raids) {
  const seed = 5000 + dex
  const target = TARGET[sp.tier]
  const now = winRate(base, dex, seed)
  let line = `${String(dex).padStart(5)} ${(base.species[dex]?.name ?? '?').padEnd(20)} ${sp.tier.padEnd(9)} ${sp.bars}×${sp.barHp}: ${now}% (target ${target})`
  if (process.env.TUNE) {
    // HP per bar between 0.5 and 4: more HP, fewer wins (the same seed throughout).
    let lo = 0.5
    let hi = 4
    for (let it = 0; it < 7; it++) {
      const mid = (lo + hi) / 2
      if (winRate(withBarHp(dex, mid), dex, seed) >= target) lo = mid
      else hi = mid
    }
    const hp = Math.round(lo * 10) / 10
    line += ` → barHp ${hp}: ${winRate(withBarHp(dex, hp), dex, seed)}%`
  }
  console.log(line)
}
