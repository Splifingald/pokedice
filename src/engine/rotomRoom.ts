// The Rotom Room (docs/73): a Sinnoh secret area, open once the League is cleared, where Rotom's five appliance forms
// are caught, one a week. Each player's week has its own form, one they don't own yet (drawn at the week's start and
// pinned in the save), and the room deals that week's Pokémon: the Electric ones and those of the form's type. After
// its rounds comes the form itself, a boss. Caught, the room is closed until next Monday; with all five owned, for
// good. The forms fill the Rotom Pokédex (the region's Pokédex keeps its one Rotom entry), and the fifth brings a shiny
// Rotom, once. Pure: the store brings the time (the server's) and applies the week to the game data.
import { eventOpenTo } from './events'
import { createInstance } from './progression'
import { regionOf } from './regions'
import { isAreaUnlocked, progressOf } from './run'
import type { Area, GameData, PokemonInstance, PokeType, RegionId, SaveData } from './types'
import { weekEndOf, weekId, weekStartOf } from './versusLeague'

export const ROTOM_DEX = 479
/** Rotom's region: the room, its forms and its Pokédex are Sinnoh's. */
export const ROTOM_REGION: RegionId = 'sinnoh'

export type RotomAppliance = 'heat' | 'wash' | 'frost' | 'fan' | 'mow'

/** The five forms in the games' order (PokeAPI's ids): the appliance and the type it takes. */
export const ROTOM_FORMS: readonly { dex: number; appliance: RotomAppliance; type: PokeType }[] = [
  { dex: 10008, appliance: 'heat', type: 'fire' },
  { dex: 10009, appliance: 'wash', type: 'water' },
  { dex: 10010, appliance: 'frost', type: 'ice' },
  { dex: 10011, appliance: 'fan', type: 'flying' },
  { dex: 10012, appliance: 'mow', type: 'grass' },
]

export const ROTOM_FORM_DEXES: readonly number[] = ROTOM_FORMS.map((f) => f.dex)

export const isRotomForm = (dex: number): boolean => ROTOM_FORM_DEXES.includes(dex)

export const rotomFormOf = (dex: number) => ROTOM_FORMS.find((f) => f.dex === dex) ?? null

/** Switched on for whoever is playing (Admin → Config → Rotom Room). Off, the room is nowhere in the game. */
export const rotomRoomOn = (data: GameData): boolean => eventOpenTo(data.config.rotomRoom?.access, data)

/** The level of the shiny Rotom the complete Rotom Pokédex brings (the admin's number). */
export const rotomPrizeLevel = (data: GameData): number =>
  Math.max(1, Math.min(data.config.maxLevel, Math.round(data.config.rotomRoom?.prizeLevel ?? 60)))

/** The Rotom Room: the area whose bosses are Rotom's forms. */
export const isRotomRoom = (area: Pick<Area, 'legendaryBoss'>): boolean =>
  !!area.legendaryBoss?.some((b) => isRotomForm(b.dex))

/** The room as its content says it (all five weeks), whatever this week has made of it in `data`. */
export const rotomRoomBase = (data: GameData): Area | null =>
  data.rotomRoomBase ?? data.areas.find(isRotomRoom) ?? null

// ---------------------------------------------------------------- the Rotom Pokédex

/** The forms owned in Sinnoh, in the games' order: noted as they come, kept when they leave. */
export function rotomDexOf(save: SaveData): number[] {
  const had = new Set(save.rotomDex ?? [])
  return ROTOM_FORM_DEXES.filter((d) => had.has(d))
}

export const rotomDexComplete = (save: SaveData): boolean => rotomDexOf(save).length >= ROTOM_FORMS.length

/** The forms not owned yet. */
export const rotomMissing = (save: SaveData): number[] => {
  const had = new Set(rotomDexOf(save))
  return ROTOM_FORM_DEXES.filter((d) => !had.has(d))
}

/** Notes forms on the Rotom Pokédex, never taking one off. The same save back when nothing is new. */
export function addRotomForms(save: SaveData, dexes: readonly number[]): SaveData {
  const had = save.rotomDex ?? []
  const fresh = [...new Set(dexes)].filter((d) => isRotomForm(d) && !had.includes(d))
  return fresh.length ? { ...save, rotomDex: [...had, ...fresh] } : save
}

const formsIn = (mons: readonly PokemonInstance[]) =>
  mons.filter((p) => isRotomForm(p.dex) && p.revivesAt == null).map((p) => p.dex)

/**
 * Notes every form Sinnoh holds: its Box (live or parked) and the Day Care's residents from Sinnoh. A catch notes its
 * own (`applyCatch`); this fills it from what the save holds whatever brought it. Called as every save settles.
 */
export function noteRotomDex(save: SaveData): SaveData {
  const box =
    regionOf(save) === ROTOM_REGION
      ? save.box
      : (save.parked?.[ROTOM_REGION]?.box ?? ([] as PokemonInstance[]))
  const care = (save.dayCare?.residents ?? []).filter((r) => (r.region ?? regionOf(save)) === ROTOM_REGION)
  return addRotomForms(save, [...formsIn(box), ...formsIn(care.map((r) => r.inst))])
}

/** The page is there: the switch, and the room opened (Sinnoh's League cleared) while playing Sinnoh. */
export function rotomDexOpen(save: SaveData, data: GameData): boolean {
  if (!rotomRoomOn(data) || regionOf(save) !== ROTOM_REGION) return false
  const room = rotomRoomBase(data)
  return !!room && roomUnlocked(save, room, data)
}

/** The room's conditions, read on the room as its content says it (it may be out of `data.areas` while off). */
function roomUnlocked(save: SaveData, room: Area, data: GameData): boolean {
  const here = data.areas.some((a) => a.id === room.id) ? data : { ...data, areas: [...data.areas, room] }
  return isAreaUnlocked(save, room.id, here)
}

export const rotomDexPaid = (save: SaveData): boolean => !!save.rotomDexPaid

/**
 * The prize, once: the page open, all five forms owned, not given yet. A shiny Rotom joins Sinnoh's Box (the team when
 * there's room), at the admin's level. The same save back and null otherwise.
 */
export function payRotomDex(
  save: SaveData,
  data: GameData,
  now: number,
  newId: () => string,
): { save: SaveData; prize: PokemonInstance | null } {
  if (rotomDexPaid(save) || !rotomDexOpen(save, data) || !rotomDexComplete(save)) return { save, prize: null }
  const prize: PokemonInstance = {
    ...createInstance(ROTOM_DEX, rotomPrizeLevel(data), data, newId(), now),
    shiny: true,
  }
  const joined = save.team.length < data.config.maxTeamSize
  return {
    save: {
      ...save,
      box: [...save.box, prize],
      team: joined ? [...save.team, prize.id] : save.team,
      pokedex: save.pokedex.includes(ROTOM_DEX) ? save.pokedex : [...save.pokedex, ROTOM_DEX],
      rotomDexPaid: true,
    },
    prize,
  }
}

/** Home's notice until the page is opened once (docs/15 §20). */
export const rotomDexRulesDue = (save: SaveData, data: GameData): boolean =>
  !save.rotomDexSeen && rotomDexOpen(save, data)

export const markRotomDexSeen = (save: SaveData): SaveData =>
  save.rotomDexSeen ? save : { ...save, rotomDexSeen: true }

// ---------------------------------------------------------------- the week

/** The form is owned: on the Rotom Pokédex, or caught (the Pokédex says so before the page notes it). */
const owns = (save: SaveData, dex: number) => rotomDexOf(save).includes(dex) || save.pokedex.includes(dex)

/** A string's hash (FNV-1a), for the week's draw: the same week and save always give the same form. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * The form of a week for this player: one they don't own, drawn from the week and their save (their first Pokémon's
 * id, so two players with the same forms missing don't always share a week). Null once all five are owned.
 */
export function rotomFormFor(save: SaveData, week: string): number | null {
  const missing = ROTOM_FORM_DEXES.filter((d) => !owns(save, d))
  if (!missing.length) return null
  return missing[hash(`${week}:${save.box[0]?.id ?? ''}`) % missing.length]!
}

/** This week's form as pinned in the save (null: none pinned, or all owned). */
export const rotomWeekForm = (save: SaveData): number | null => save.rotomRoom?.form ?? null

/**
 * Pins the week's form when a new week has begun (on the server's clock, `now`; nothing while it's unknown), and
 * starts the room afresh for it: its rounds, its deck and its boss. Only while the room is open to a player in Sinnoh,
 * where its progress lives. The same save back when nothing changes.
 */
export function pinRotomWeek(save: SaveData, data: GameData, now: number | null): SaveData {
  if (now == null || regionOf(save) !== ROTOM_REGION || !rotomDexOpen(save, data)) return save
  const week = weekId(now)
  if (save.rotomRoom?.week === week) return save
  const room = rotomRoomBase(data)!
  const form = rotomFormFor(save, week)
  const had = save.areaProgress[room.id]
  const fresh = had && {
    ...had,
    roundsDone: 0,
    roundCounted: false,
    cleared: false,
    bossDefeated: false,
    bossesDefeated: [],
    round: 0,
    deck: [],
    drawn: [],
  }
  return {
    ...save,
    rotomRoom: { week, form },
    ...(fresh && { areaProgress: { ...save.areaProgress, [room.id]: fresh } }),
  }
}

/** The pinned week is this one: the room's state is current. */
export const rotomWeekCurrent = (save: SaveData, now: number | null): boolean =>
  now != null && save.rotomRoom?.week === weekId(now)

/** All five forms owned: the room is closed for good. */
export const rotomRoomDone = (save: SaveData): boolean => ROTOM_FORM_DEXES.every((d) => owns(save, d))

/**
 * The room is closed: all five forms owned (for good), or this week's form owned (until next Monday), or no week
 * pinned yet (the time isn't known). Only the Rotom Room, only while on.
 */
export function rotomRoomClosed(save: SaveData, data: GameData, areaId: string): boolean {
  if (areaId !== rotomRoomBase(data)?.id || !rotomRoomOn(data)) return false
  if (rotomRoomDone(save)) return true
  const form = rotomWeekForm(save)
  return form == null || owns(save, form)
}

/** When the room opens again with next week's form (the Monday 00:00 UTC after the pinned week), or null. */
export function rotomRoomReopensAt(save: SaveData): number | null {
  const week = save.rotomRoom?.week
  if (!week || rotomRoomDone(save)) return null
  const at = Date.parse(`${week}T00:00:00Z`)
  return Number.isNaN(at) ? null : weekEndOf(weekStartOf(at))
}

/** This week's form was caught here (the room's boss beaten and kept). */
export function rotomCaughtThisWeek(save: SaveData, data: GameData): boolean {
  const form = rotomWeekForm(save)
  const room = rotomRoomBase(data)
  return form != null && !!room && owns(save, form) && progressOf(save, room.id).bossesDefeated.includes(form)
}

// ---------------------------------------------------------------- the room as this week makes it

/** A species is met in the week of this form: Electric, or of the form's type. */
export function metInRotomWeek(data: GameData, dex: number, form: number | null): boolean {
  const sp = data.species[dex]
  const type = rotomFormOf(form ?? 0)?.type
  if (!sp) return false
  const types = [sp.type1, sp.type2]
  return types.includes('electric') || (!!type && types.includes(type))
}

const weekAreas = new WeakMap<Area, Map<string, Area>>()

/**
 * The room for a week: the rows of other types weigh 0 (kept, so its lists still know them) and its boss is the week's
 * form alone (none without one). The same object for the same room and form, so the data built on it stays the same.
 */
export function rotomWeekArea(base: Area, data: GameData, form: number | null): Area {
  let byForm = weekAreas.get(base)
  if (!byForm) weekAreas.set(base, (byForm = new Map()))
  const key = String(form)
  const had = byForm.get(key)
  if (had) return had
  const area: Area = {
    ...base,
    wildPool: base.wildPool.map((w) => (metInRotomWeek(data, w.dex, form) ? w : { ...w, weight: 0 })),
    legendaryBoss: (base.legendaryBoss ?? []).filter((b) => b.dex === form),
  }
  if (!area.legendaryBoss!.length) area.legendaryBoss = null
  byForm.set(key, area)
  return area
}

/**
 * The game data as this player sees the room: off, it is gone (no row, no square, no link that works); on, it is this
 * week's (`rotomWeekArea`, the form pinned in the save). The room as its content says it is kept in `rotomRoomBase`,
 * so applying this again (a new week, the switch turned) starts from it. The same data back when nothing changes.
 */
export function withRotomWeek(data: GameData, save: SaveData | null): GameData {
  const base = rotomRoomBase(data)
  if (!base) return data
  const at = data.areas.findIndex((a) => a.id === base.id)
  const want = rotomRoomOn(data) ? rotomWeekArea(base, data, save ? rotomWeekForm(save) : null) : null
  const current = at >= 0 ? data.areas[at]! : null
  if (current === want && data.rotomRoomBase === base) return data
  const areas = data.areas.filter((a) => a.id !== base.id)
  if (want) areas.splice(at >= 0 ? at : areas.length, 0, want)
  return { ...data, areas, rotomRoomBase: base }
}
