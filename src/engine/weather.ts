// The region flavours' weather (docs/62 §2–4): Hoenn's fixed weather and Galar's weather of the day. What a weather does
// in battle is the raids' own rules (raidSpecials.ts), so rain means the same thing everywhere: Water ×1.25 and Fire
// ×0.75 for both sides, a sandstorm or snow wearing 4 % of max HP off each Pokémon it doesn't spare at its turn. Fog,
// overcast skies and ash are only seen. In Galar the day's weather also brings its types out more (`poolTimes`).
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { WEATHER_CHIP, WEATHER_SPARES, weatherBoosts } from './raidSpecials'
import { regionOfArea } from './regions'
import { createRng } from './rng'
import { worldOfArea } from './worldList'
import {
  WEATHER_KINDS,
  type Area,
  type AreaWeather,
  type GameData,
  type PokeType,
  type SaveData,
  type Weather,
  type WeatherConfig,
} from './types'

/** Hoenn's fixed weather is switched on for whoever is playing. */
export const hoennWeatherOn = (data: GameData): boolean => eventOpenTo(data.config.hoennWeather?.access, data)
/** Galar's weather of the day is switched on for whoever is playing. */
export const galarWeatherOn = (data: GameData): boolean => eventOpenTo(data.config.galarWeather?.access, data)

/** Which region's weather an area has (and its config), or null for a region with none. */
export function weatherConfigOf(area: Pick<Area, 'regionId'>, data: GameData): { key: 'hoennWeather' | 'galarWeather'; cfg: WeatherConfig } | null {
  const region = regionOfArea(area)
  if (region === 'hoenn' && data.config.hoennWeather) return { key: 'hoennWeather', cfg: data.config.hoennWeather }
  if (region === 'galar' && data.config.galarWeather) return { key: 'galarWeather', cfg: data.config.galarWeather }
  return null
}

/** The area's weather as its region's config sets it, while the switch is on; null with none. */
export function areaWeatherOf(area: Area, data: GameData): AreaWeather | null {
  const of = weatherConfigOf(area, data)
  if (!of || !eventOpenTo(of.cfg.access, data)) return null
  const w = of.cfg.areas?.[area.id]
  return w && (w.fixed || w.alternate?.length || (w.daily && Object.keys(w.daily).length)) ? w : null
}

const DAY_MS = 86_400_000
/** The UTC day a time falls in (Galar's weather changes at UTC midnight, the same moment for everyone). */
export const weatherDay = (now: number): number => Math.floor(now / DAY_MS)
/** When the day's weather next changes. */
export const nextWeatherChange = (now: number): number => (weatherDay(now) + 1) * DAY_MS

/** A string's hash (FNV-1a): the day's seed for an area. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The weather of the day in an area, from its odds: the same for everyone on that UTC day. */
export function dailyWeather(areaId: string, now: number, odds: Partial<Record<Weather, number>>): Weather {
  const rows = WEATHER_KINDS.map((w) => ({ w, weight: Math.max(0, Number(odds[w]) || 0) })).filter((r) => r.weight > 0)
  if (!rows.length) return 'clear'
  return createRng(hash(`${weatherDay(now)}|${areaId}`)).weighted(rows, (r) => r.weight)?.w ?? 'clear'
}

/**
 * The weather in this area now, or null where there is none: the switch off, an area with a mode (the portal, the
 * nightmare, a Safari), a small world, or Extreme mode. `round`: the area's rounds done (two weathers take turns).
 */
export function weatherAt(area: Area | null | undefined, data: GameData, at: { now: number; round?: number; save?: SaveData | null }): Weather | null {
  if (!area || area.mode || worldOfArea(data, area) || isExtreme(at.save)) return null
  const w = areaWeatherOf(area, data)
  if (!w) return null
  if (w.fixed) return w.fixed
  if (w.alternate?.length) return w.alternate[Math.max(0, Math.floor(at.round ?? 0)) % w.alternate.length]!
  return w.daily ? dailyWeather(area.id, at.now, w.daily) : null
}

/** The area's weather changes with the day (Galar's), rather than never or a round at a time. */
export const weatherIsDaily = (area: Area, data: GameData): boolean => {
  const w = areaWeatherOf(area, data)
  return !!w && !w.fixed && !w.alternate?.length && !!w.daily
}

/** × on attacks of each type under this weather: rain's and a thunderstorm's, the sun's (the raids' numbers). */
export function weatherTypeBoost(w: Weather | null | undefined): Partial<Record<PokeType, number>> {
  if (w === 'rain' || w === 'thunderstorm') return weatherBoosts('rain')
  if (w === 'sun') return weatherBoosts('sun')
  return {}
}

/** The types a sandstorm or snow spares; null for a weather that wears nobody. */
export function weatherSpares(w: Weather | null | undefined): readonly PokeType[] | null {
  if (w === 'sand') return WEATHER_SPARES.sand ?? null
  if (w === 'snow') return WEATHER_SPARES.snow ?? null
  return null
}

/** HP a Pokémon of these types loses to the weather at its turn: 4 % of its max HP (at least 1), or 0. */
export function weatherWear(w: Weather | null | undefined, types: readonly PokeType[], maxHp: number): number {
  const spared = weatherSpares(w)
  if (!spared || types.some((t) => spared.includes(t))) return 0
  return Math.max(1, Math.round(maxHp * WEATHER_CHIP))
}

/** The weather changes something in battle (rather than only being seen). */
export const weatherInBattle = (w: Weather | null | undefined): boolean =>
  Object.keys(weatherTypeBoost(w)).length > 0 || !!weatherSpares(w)

/** The types each weather brings out more in Galar (its spawns, docs/62 §2). */
export const WEATHER_FAVOURS: Record<Weather, readonly PokeType[]> = {
  clear: [],
  overcast: ['normal', 'dark'],
  rain: ['water', 'electric', 'bug'],
  thunderstorm: ['electric', 'water'],
  sun: ['fire', 'grass'],
  sand: ['rock', 'ground', 'steel'],
  snow: ['ice'],
  fog: ['ghost', 'psychic', 'fairy'],
  ash: [],
}

/** × the weight of a wild Pokémon of these types under the day's weather: Galar's `poolTimes`, else 1. */
export function weatherPoolTimes(area: Area, data: GameData, w: Weather | null | undefined, types: readonly PokeType[]): number {
  if (!w || regionOfArea(area) !== 'galar') return 1
  const times = Number(data.config.galarWeather?.poolTimes)
  if (!(times > 0) || times === 1) return 1
  return types.some((t) => WEATHER_FAVOURS[w].includes(t)) ? times : 1
}
