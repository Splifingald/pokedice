// The nightmare's settings (docs/30), on their own so the raid's numbers can read them without the nightmare's rules,
// as portalMode.ts does for the portal run: an area's `mode` as the admin set it, cleaned and filled from the defaults,
// and the switch that turns it on.
import { eventOpenTo } from './events'
import type { Area, GameData, NightmareFoe, NightmareGift, NightmareMode } from './types'

/**
 * Newmoon Island's nightmare (the user's spec of 2026-10-16, docs/30 §1): seven of Darkrai's nightmares, six of them Dark
 * types, weakest to strongest as the battle AI measures them (`pnpm nightmare-balance rank`: the share of 1-on-1 fights
 * the world's own Pokémon lose to each at the same level, 3 % for Musharna up to 87 % for Honchkrow), a level up each
 * round; a Revive after round 3 and a Max Revive after round 6; the shadow takes 10 % after each round; the raid after
 * it at Lv.70.
 */
export const DEFAULT_NIGHTMARE: NightmareMode = {
  kind: 'nightmare',
  foes: [
    // Musharna: it starts as a dream, its mist still sweet (the only one that isn't a Dark type).
    { dex: 518, level: 62 },
    // Sableye: gem eyes glinting in the dark.
    { dex: 302, level: 63 },
    // Absol: the omen, seen before a disaster.
    { dex: 359, level: 64 },
    // Zoroark: illusions that make the dream feel real.
    { dex: 571, level: 65 },
    // Hydreigon: the three-headed dragon that devours everything in its way.
    { dex: 635, level: 66 },
    // Tyranitar: the armoured tyrant shaking the island.
    { dex: 248, level: 67 },
    // Honchkrow: the boss of the night, Darkrai's herald and the hardest of them all.
    { dex: 430, level: 68 },
  ],
  strikePercent: 10,
  gifts: [
    { round: 3, key: 'revive', qty: 1 },
    { round: 6, key: 'max-revive', qty: 1 },
  ],
  raid: { level: 70, upgradeLevel: 8, bars: 3, teamCap: 70 },
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const int = (v: unknown, fallback: number, min: number, max: number) => Math.round(num(v, fallback, min, max))
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/** A nightmare as the admin left it (a missing or odd number falls back to the default); null when it isn't one. */
export function normaliseNightmare(raw: unknown): NightmareMode | null {
  const r = obj(raw)
  if (r.kind !== 'nightmare') return null
  const d = DEFAULT_NIGHTMARE
  const raid = obj(r.raid)
  const foes: NightmareFoe[] = Array.isArray(r.foes)
    ? r.foes
        .map((x) => obj(x))
        .filter((x) => Number.isInteger(Number(x.dex)) && Number(x.dex) > 0)
        .slice(0, 20)
        .map((x) => ({ dex: Number(x.dex), level: int(x.level, 50, 1, 100) }))
    : d.foes
  const rounds = (foes.length ? foes : d.foes).length
  // One gift a round at most, inside the nightmare's rounds (one past its last is dropped), in round order.
  const gifts: NightmareGift[] = Array.isArray(r.gifts)
    ? r.gifts
        .map((x) => obj(x))
        .filter(
          (x) => typeof x.key === 'string' && x.key && Number(x.round) >= 1 && Number(x.round) <= rounds,
        )
        .map((x) => ({ round: int(x.round, 1, 1, rounds), key: String(x.key), qty: int(x.qty, 1, 1, 99) }))
        .filter((g, i, all) => all.findIndex((o) => o.round === g.round) === i)
        .sort((a, b) => a.round - b.round)
    : d.gifts
  return {
    kind: 'nightmare',
    foes: foes.length ? foes : d.foes,
    strikePercent: num(r.strikePercent, d.strikePercent, 0, 99),
    gifts,
    raid: {
      level: int(raid.level, d.raid.level, 1, 100),
      upgradeLevel: int(raid.upgradeLevel, d.raid.upgradeLevel, 1, 10),
      bars: int(raid.bars, d.raid.bars, 1, 10),
      teamCap: int(raid.teamCap, d.raid.teamCap, 1, 100),
    },
  }
}

/** The nightmare is switched on for whoever is playing (Off by default; docs/15 §20). */
export const nightmareRunsOn = (data: GameData): boolean => eventOpenTo(data.config.nightmare?.access, data)

/** The area's nightmare, when it has one and the switch is on for the player; null otherwise (it plays as before). */
export function nightmareModeOf(
  area: Pick<Area, 'mode'> | undefined | null,
  data: GameData,
): NightmareMode | null {
  if (!area?.mode || !nightmareRunsOn(data)) return null
  return normaliseNightmare(area.mode)
}

/** The raid's numbers of a nightmare area (Lv.70, dice level 8, 3 bars, teams up to Lv.70); null elsewhere. */
export function nightmareRaidRules(data: GameData, areaId: string | undefined): NightmareMode['raid'] | null {
  const area = areaId ? data.areas.find((a) => a.id === areaId) : undefined
  return nightmareModeOf(area, data)?.raid ?? null
}
