// The whiteout (docs/61 §4.3, the user's design of 2026-11-01): Crown Shrine's mode, weather survival. The blizzard
// wears down every Pokémon that isn't an Ice type, both sides, each round of every fight here (whiteoutMode.ts, the
// raids' rule). Waves of fixed foes come one after the other, wild Pokémon that can't be caught; after each wave a
// bonfire heals the team a share of its max HP, and only there can the team change and the bag be used (the bag stays
// shut in battle). After the last bonfire, the area's boss (shiny Abomasnow), in the blizzard too: caught, the
// blizzard lifts and the shrine closes for good; if it gets away, back to the bonfire to face it again. A full K.O.
// sends the player back to wave 1, healed, XP, ₽ and items kept. Until it ends the player can't travel to another
// area (the Mart, the menus and Home stay open). Every number is the area's (`Area.mode`, Admin → Areas), the switch
// the admin's (`whiteout`).
import type { Encounter } from './encounters'
import { fightBosses } from './encounters'
import { instanceMaxHp } from './progression'
import type {
  Area,
  AreaProgress,
  BossDef,
  GameData,
  PokemonInstance,
  SaveData,
  WhiteoutMode,
  WhiteoutState,
} from './types'
import { normaliseWhiteout, whiteoutModeOf } from './whiteoutMode'

export {
  blizzardPercent,
  blizzardSpares,
  blizzardWear,
  DEFAULT_WHITEOUT,
  normaliseWhiteout,
  whiteoutModeOf,
  whiteoutRunsOn,
} from './whiteoutMode'

const EMPTY: WhiteoutState = { active: false, wave: 0, foe: 0 }

const progressAt = (save: SaveData, areaId: string): AreaProgress => ({
  roundsDone: 0,
  cleared: false,
  bossDefeated: false,
  bossesDefeated: [],
  gymsDefeated: [],
  ...save.areaProgress[areaId],
})

const areaOf = (data: GameData, areaId: string | null | undefined): Area | undefined =>
  areaId ? data.areas.find((a) => a.id === areaId) : undefined

const modeAt = (data: GameData, areaId: string | null | undefined): WhiteoutMode | null =>
  whiteoutModeOf(areaOf(data, areaId), data)

/** Where the whiteout stands in this area of the region being played (nothing yet: not in it, no wave won). */
export const whiteoutStateOf = (save: SaveData, areaId: string): WhiteoutState =>
  save.areaProgress[areaId]?.whiteout ?? EMPTY

function withWhiteout(save: SaveData, areaId: string, whiteout: WhiteoutState): SaveData {
  return {
    ...save,
    areaProgress: { ...save.areaProgress, [areaId]: { ...progressAt(save, areaId), whiteout } },
  }
}

const teamOf = (save: SaveData): PokemonInstance[] =>
  save.team.map((id) => save.box.find((p) => p.id === id)).filter((p): p is PokemonInstance => !!p)

const mapTeam = (save: SaveData, f: (p: PokemonInstance) => PokemonInstance): SaveData => {
  const team = new Set(save.team)
  return { ...save, box: save.box.map((p) => (team.has(p.id) ? f(p) : p)) }
}

/** The whole team back to full HP, K.O. or not (BEGIN, the end, a wipe). */
const healTeam = (save: SaveData, data: GameData): SaveData =>
  mapTeam(save, (p) => (data.species[p.dex] ? { ...p, currentHp: instanceMaxHp(p, data) } : p))

/** What a try keeps through its end: how many there were. */
const kept = (w: WhiteoutState): Partial<WhiteoutState> => (w.tries != null ? { tries: w.tries } : {})

/** The boss the blizzard ends on: the area's first boss fought as a boss (shiny Abomasnow), or null. */
export const whiteoutBoss = (area: Area, data: GameData): BossDef | null => fightBosses(area, data)[0] ?? null

/** How many foes the whiteout holds, every wave together. */
export const whiteoutFoeCount = (mode: WhiteoutMode): number => mode.waves.reduce((n, w) => n + w.length, 0)

// ------------------------------------------------------------------ in the whiteout or not

/** The whiteout is under way in this area (switched on, begun, not over). */
export function inWhiteout(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  const area = areaOf(data, areaId)
  return !!area && !!whiteoutModeOf(area, data) && whiteoutStateOf(save, area.id).active
}

/**
 * The area the player can't travel away from: the region being played's current area, while its whiteout is under
 * way. Null everywhere else. As the nightmare's lock, only travel is shut: the Mart, the menus and Home stay open.
 */
export function whiteoutLock(save: SaveData | null, data: GameData): Area | null {
  if (!save) return null
  const area = areaOf(data, save.currentAreaId)
  return area && inWhiteout(save, data, area.id) ? area : null
}

/**
 * The whiteout is over for good: its boss caught, the shrine closed. Whatever the switch says now, as a caught boss
 * stays caught: the area never opens again for this save.
 */
export const whiteoutWon = (save: SaveData, data: GameData, areaId: string): boolean =>
  !!normaliseWhiteout(areaOf(data, areaId)?.mode) && !!whiteoutStateOf(save, areaId).won

/** The whiteout can begin here: a whiteout area, switched on, not over, not already under way. */
export function canStartWhiteout(save: SaveData, data: GameData, areaId: string): boolean {
  if (!modeAt(data, areaId)) return false
  const w = whiteoutStateOf(save, areaId)
  return !w.active && !w.won
}

/** At a bonfire now: the team can change and the bag be used, until MOVE ON. */
export function atBonfire(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  return !!areaId && inWhiteout(save, data, areaId) && !!whiteoutStateOf(save, areaId).bonfire
}

/**
 * The bag is shut: in the whiteout's fights (BattleState.noBag, the engine's) and between them too, but at a bonfire.
 * "It's too dangerous to open the bag here, items might fly away."
 */
export function whiteoutBagShut(save: SaveData, data: GameData): boolean {
  const area = whiteoutLock(save, data)
  return !!area && !whiteoutStateOf(save, area.id).bonfire
}

/** Its wave foes can't be caught (the boss can: it's the prize). */
export function whiteoutNoCatch(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  return !!areaId && inWhiteout(save, data, areaId) && !whiteoutStateOf(save, areaId).boss
}

/** The weather of a fight in this area now: the whiteout's, while it's under way; null otherwise. */
export function whiteoutWeather(
  save: SaveData,
  data: GameData,
  areaId: string | null | undefined,
): WhiteoutMode['weather'] {
  return inWhiteout(save, data, areaId) ? (modeAt(data, areaId)?.weather ?? null) : null
}

// ------------------------------------------------------------------ the waves

/**
 * BEGIN (on the way in's pop-up): the team fully healed, wave 1's first foe next, the try counted. Null when it can't
 * begin here.
 */
export function startWhiteout(save: SaveData, data: GameData, areaId: string): SaveData | null {
  if (!canStartWhiteout(save, data, areaId)) return null
  const before = whiteoutStateOf(save, areaId)
  return withWhiteout(healTeam(save, data), areaId, {
    active: true,
    wave: 0,
    foe: 0,
    tries: (before.tries ?? 0) + 1,
  })
}

/** What comes next: a bonfire (a wave just cleared), the wave's next foe, the boss, or nothing (not in it). */
export function whiteoutNext(
  save: SaveData,
  data: GameData,
  areaId: string,
): 'bonfire' | 'foe' | 'boss' | null {
  if (!inWhiteout(save, data, areaId)) return null
  const w = whiteoutStateOf(save, areaId)
  return w.bonfire ? 'bonfire' : w.boss ? 'boss' : 'foe'
}

/** The wave foe under way: its dex and level, its wave (1-based) of how many, its place in the wave (1-based). */
export function whiteoutFoe(
  save: SaveData,
  data: GameData,
  areaId: string,
): { dex: number; level: number; wave: number; waves: number; index: number; size: number } | null {
  const mode = modeAt(data, areaId)
  const w = whiteoutStateOf(save, areaId)
  if (!mode || !w.active || w.boss) return null
  const wave = mode.waves[w.wave]
  const foe = wave?.[w.foe]
  return foe && wave
    ? { ...foe, wave: w.wave + 1, waves: mode.waves.length, index: w.foe + 1, size: wave.length }
    : null
}

/**
 * The next encounter: the wave's foe (always the same one there, never shiny) or, after the last bonfire, the boss.
 * Null outside the whiteout or at a bonfire.
 */
export function whiteoutEncounter(save: SaveData, data: GameData, areaId: string): Encounter | null {
  const next = whiteoutNext(save, data, areaId)
  if (next === 'boss') {
    const area = areaOf(data, areaId)
    const boss = area && whiteoutBoss(area, data)
    return boss && data.species[boss.dex]
      ? { kind: 'boss', dex: boss.dex, level: boss.level, ...(boss.shiny && { shiny: true }) }
      : null
  }
  if (next !== 'foe') return null
  const foe = whiteoutFoe(save, data, areaId)
  if (!foe || !data.species[foe.dex]) return null
  return { kind: 'wild', dex: foe.dex, level: foe.level, isNew: !save.pokedex.includes(foe.dex) }
}

/**
 * A wave foe K.O.: the next foe of its wave is due, or, its last, the wave is cleared and a bonfire is lit (its heal
 * still to give: warmAtBonfire). Null outside the whiteout, at a bonfire or before the boss.
 */
export function winWhiteoutFoe(
  save: SaveData,
  data: GameData,
  areaId: string,
): { save: SaveData; wave: number; waves: number; cleared: boolean } | null {
  const mode = modeAt(data, areaId)
  const w = whiteoutStateOf(save, areaId)
  if (!mode || !w.active || w.bonfire || w.boss) return null
  const size = mode.waves[w.wave]?.length ?? 0
  const foe = w.foe + 1
  if (foe < size)
    return {
      save: withWhiteout(save, areaId, { ...w, foe }),
      wave: w.wave + 1,
      waves: mode.waves.length,
      cleared: false,
    }
  return {
    save: withWhiteout(save, areaId, { ...w, wave: w.wave + 1, foe: 0, bonfire: true, warmed: false }),
    wave: w.wave + 1,
    waves: mode.waves.length,
    cleared: true,
  }
}

/**
 * HP a bonfire gives back to a Pokémon with `hp` of `max`: `percent` % of its max HP, rounded, at least 1, up to its
 * max. A K.O. one stays K.O. (a Revive from the bag, there, brings it back).
 */
export function bonfireHp(hp: number, max: number, percent: number): number {
  if (hp <= 0 || percent <= 0 || hp >= max) return hp
  return Math.min(max, hp + Math.max(1, Math.round((max * percent) / 100)))
}

/**
 * The bonfire warms the team, once: every team member still standing gets its share back (bonfireHp). `heals`: who got
 * what, in team order. Null when no bonfire's heal is due.
 */
export function warmAtBonfire(
  save: SaveData,
  data: GameData,
  areaId: string,
): { save: SaveData; heals: { uid: string; from: number; to: number }[] } | null {
  const mode = modeAt(data, areaId)
  const w = whiteoutStateOf(save, areaId)
  if (!mode || !w.active || !w.bonfire || w.warmed) return null
  const heals: { uid: string; from: number; to: number }[] = []
  for (const p of teamOf(save)) {
    if (!data.species[p.dex]) continue
    heals.push({
      uid: p.id,
      from: p.currentHp,
      to: bonfireHp(p.currentHp, instanceMaxHp(p, data), mode.bonfirePercent),
    })
  }
  const warmed = mapTeam(save, (p) => {
    const h = heals.find((x) => x.uid === p.id)
    return h ? { ...p, currentHp: h.to } : p
  })
  return { save: withWhiteout(warmed, areaId, { ...w, warmed: true }), heals }
}

/**
 * MOVE ON from a bonfire: its heal given first if it wasn't, then the next wave's first foe, or, past the last wave,
 * the boss. Null when not at a bonfire.
 */
export function leaveBonfire(save: SaveData, data: GameData, areaId: string): SaveData | null {
  const mode = modeAt(data, areaId)
  if (!mode || !atBonfire(save, data, areaId)) return null
  const warmed = warmAtBonfire(save, data, areaId)?.save ?? save
  const w = whiteoutStateOf(warmed, areaId)
  const { bonfire: _b, warmed: _w, ...rest } = w
  return withWhiteout(warmed, areaId, { ...rest, ...(w.wave >= mode.waves.length && { boss: true }) })
}

/** This bonfire is the last one, the boss after it. */
export function lastBonfire(save: SaveData, data: GameData, areaId: string): boolean {
  const mode = modeAt(data, areaId)
  const w = whiteoutStateOf(save, areaId)
  return !!mode && !!w.bonfire && w.wave >= mode.waves.length
}

// ------------------------------------------------------------------ how it ends

/**
 * The boss caught: the blizzard lifts, for good. The team is healed and the shrine is closed from now on
 * (`whiteoutWon`). The outro is due (`wonSeen` false).
 */
export function winWhiteout(save: SaveData, data: GameData, areaId: string): SaveData {
  const mode = modeAt(data, areaId)
  const w = whiteoutStateOf(save, areaId)
  if (!mode || !w.active) return save
  return withWhiteout(healTeam(save, data), areaId, {
    active: false,
    wave: mode.waves.length,
    foe: 0,
    won: true,
    wonSeen: false,
    ...kept(w),
  })
}

/**
 * The boss beaten but not caught (it broke free, or no ball was thrown): back at the last bonfire, its heal already
 * given, the team and the bag open again; MOVE ON brings the boss back.
 */
export function whiteoutBossGotAway(save: SaveData, data: GameData, areaId: string): SaveData {
  const w = whiteoutStateOf(save, areaId)
  if (!inWhiteout(save, data, areaId) || !w.boss) return save
  const { boss: _b, ...rest } = w
  return withWhiteout(save, areaId, { ...rest, bonfire: true, warmed: true })
}

/** The outro has played. */
export function markWhiteoutWonSeen(save: SaveData, areaId: string): SaveData {
  const w = whiteoutStateOf(save, areaId)
  return w.won && !w.wonSeen ? withWhiteout(save, areaId, { ...w, wonSeen: true }) : save
}

/** The outro is due here. */
export const whiteoutVictoryDue = (save: SaveData, data: GameData, areaId: string): boolean =>
  whiteoutWon(save, data, areaId) && !whiteoutStateOf(save, areaId).wonSeen

/**
 * The whole team K.O. in the blizzard: back to wave 1. XP, ₽ and items stay, the team is healed, the lock lifts (the
 * next way in plays the intro again), no limit on tries. Unchanged outside it.
 */
export function whiteoutWipe(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!inWhiteout(save, data, areaId)) return save
  return withWhiteout(healTeam(save, data), areaId, {
    active: false,
    wave: 0,
    foe: 0,
    ...kept(whiteoutStateOf(save, areaId)),
  })
}
