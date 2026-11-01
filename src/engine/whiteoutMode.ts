// The whiteout's settings (docs/64 §4.3), on their own as nightmareMode.ts is for the nightmare: an area's `mode` as the
// admin set it, cleaned and filled from the defaults, the switch that turns it on, and the blizzard's wear, which is
// the raids' weather rule (engine/raidSpecials.ts) called as it is, so the general weather system (docs/62) can take
// its place later without the whiteout changing.
import { eventOpenTo } from './events'
import { WEATHER_CHIP, WEATHER_SPARES } from './raidSpecials'
import type { Area, GameData, PokeType, WhiteoutFoe, WhiteoutMode } from './types'

/**
 * Crown Shrine's whiteout (the user's design of 2026-11-01, docs/64 §4.3): three waves of fixed foes, one Ice type in
 * each and no Ghost type anywhere (a team of Normal types could never get past one), every level below Abomasnow's
 * Lv.50; the last wave holds a foe strong against each of the world's starter lines. A bonfire after every wave heals
 * 40 %. The weather is the raids' Snow.
 */
export const DEFAULT_WHITEOUT: WhiteoutMode = {
  kind: 'whiteout',
  waves: [
    // Glalie (Ice) and Bronzong: the shrine's guardians.
    [
      { dex: 362, level: 47 },
      { dex: 437, level: 47 },
    ],
    // Beartic (Ice), Sawsbuck in its winter coat, Absol: the omen in the snow.
    [
      { dex: 614, level: 48 },
      { dex: 586, level: 48 },
      { dex: 359, level: 49 },
    ],
    // Walrein (Ice); Crabominable against Stoutland, Lanturn against Toucannon, Ursaluna against Ampharos.
    [
      { dex: 365, level: 49 },
      { dex: 740, level: 49 },
      { dex: 171, level: 50 },
      { dex: 901, level: 50 },
    ],
  ],
  weather: 'snow',
  bonfirePercent: 40,
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/** A wave as the admin left it: its foes with a dex, levels 1–100, 8 at most. Empty when nothing usable is left. */
const waveOf = (raw: unknown): WhiteoutFoe[] =>
  Array.isArray(raw)
    ? raw
        .map((x) => obj(x))
        .filter((x) => Number.isInteger(Number(x.dex)) && Number(x.dex) > 0)
        .slice(0, 8)
        .map((x) => ({ dex: Number(x.dex), level: Math.round(num(x.level, 50, 1, 100)) }))
    : []

/** A whiteout as the admin left it (a missing or odd value falls back to the default); null when it isn't one. */
export function normaliseWhiteout(raw: unknown): WhiteoutMode | null {
  const r = obj(raw)
  if (r.kind !== 'whiteout') return null
  const d = DEFAULT_WHITEOUT
  // Empty waves are dropped (a wave with nobody in it would be a bonfire after nothing); 10 waves at most.
  const waves = Array.isArray(r.waves)
    ? r.waves
        .map(waveOf)
        .filter((w) => w.length > 0)
        .slice(0, 10)
    : []
  return {
    kind: 'whiteout',
    waves: waves.length ? waves : d.waves,
    weather: r.weather === null ? null : r.weather === 'sand' || r.weather === 'snow' ? r.weather : d.weather,
    bonfirePercent: num(r.bonfirePercent, d.bonfirePercent, 0, 100),
  }
}

/** The whiteout is switched on for whoever is playing (Off by default; docs/15 §20). */
export const whiteoutRunsOn = (data: GameData): boolean => eventOpenTo(data.config.whiteout?.access, data)

/** The area's whiteout, when it has one and the switch is on for the player; null otherwise (it plays as before). */
export function whiteoutModeOf(
  area: Pick<Area, 'mode'> | undefined | null,
  data: GameData,
): WhiteoutMode | null {
  if (!area?.mode || !whiteoutRunsOn(data)) return null
  return normaliseWhiteout(area.mode)
}

/** The types the weather spares (Ice for snow), as the raids have them. */
export const blizzardSpares = (weather: WhiteoutMode['weather']): readonly PokeType[] =>
  (weather && WEATHER_SPARES[weather]) ?? []

/**
 * HP the weather takes at the end of a round from a Pokémon of `types` with `maxHp`: the raids' rule (WEATHER_CHIP of
 * its max HP, rounded, at least 1), none when one of its types is spared or there is no weather.
 */
export function blizzardWear(
  weather: WhiteoutMode['weather'],
  types: readonly PokeType[],
  maxHp: number,
): number {
  if (!weather || maxHp <= 0) return 0
  const spares = blizzardSpares(weather)
  if (types.some((t) => spares.includes(t))) return 0
  return Math.max(1, Math.round(maxHp * WEATHER_CHIP))
}

/** The weather's wear as a whole percent of max HP, for the rules' words (4). */
export const blizzardPercent = (): number => Math.round(WEATHER_CHIP * 100)
