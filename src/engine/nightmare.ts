// The nightmare (docs/30, the user's spec of 2026-10-16): Newmoon Island's mode. Darkrai pulls the player into its
// dream: a fixed line of its nightmares, one a round, weakest to strongest, wild Pokémon that can't be caught. After
// each round but the last, Darkrai's shadow strikes the whole team (a share of each one's max HP, never a K.O.); some
// rounds leave an item in the bag (once for good). Until it ends the player can't travel to another area, though the
// Mart, the menus and Home stay open. The last round won wakes the player for good and opens the area's raid (shiny
// Darkrai); a full K.O. wakes them too, the rounds back to 0. Every number is the area's (`Area.mode`, Admin → Areas),
// the switch the admin's (`nightmare`).
import type { Encounter } from './encounters'
import { nightmareModeOf } from './nightmareMode'
import { instanceMaxHp } from './progression'
import type {
  Area,
  AreaProgress,
  GameData,
  NightmareMode,
  NightmareState,
  PokemonInstance,
  SaveData,
} from './types'

export {
  DEFAULT_NIGHTMARE,
  nightmareModeOf,
  nightmareRaidRules,
  nightmareRunsOn,
  normaliseNightmare,
} from './nightmareMode'

const EMPTY: NightmareState = { active: false, round: 0 }

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

const modeAt = (data: GameData, areaId: string | null | undefined): NightmareMode | null =>
  nightmareModeOf(areaOf(data, areaId), data)

/** Where the nightmare stands in this area of the region being played (nothing yet: not in it, no round won). */
export const nightmareStateOf = (save: SaveData, areaId: string): NightmareState =>
  save.areaProgress[areaId]?.nightmare ?? EMPTY

function withNightmare(save: SaveData, areaId: string, nightmare: NightmareState): SaveData {
  return {
    ...save,
    areaProgress: { ...save.areaProgress, [areaId]: { ...progressAt(save, areaId), nightmare } },
  }
}

const teamOf = (save: SaveData): PokemonInstance[] =>
  save.team.map((id) => save.box.find((p) => p.id === id)).filter((p): p is PokemonInstance => !!p)

const mapTeam = (save: SaveData, f: (p: PokemonInstance) => PokemonInstance): SaveData => {
  const team = new Set(save.team)
  return { ...save, box: save.box.map((p) => (team.has(p.id) ? f(p) : p)) }
}

/** The whole team back to full HP, K.O. or not (the way in, waking up). */
const healTeam = (save: SaveData, data: GameData): SaveData =>
  mapTeam(save, (p) => (data.species[p.dex] ? { ...p, currentHp: instanceMaxHp(p, data) } : p))

/** The nightmare's rounds: one per foe. */
export const nightmareRounds = (mode: NightmareMode): number => mode.foes.length

// ------------------------------------------------------------------ in the nightmare or not

/** The nightmare is under way in this area (switched on, begun, not over). */
export function inNightmare(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  const area = areaOf(data, areaId)
  return !!area && !!nightmareModeOf(area, data) && nightmareStateOf(save, area.id).active
}

/**
 * The area the player can't travel away from: the region being played's current area, while its nightmare is under
 * way. Null everywhere else. Unlike the portal run's lock, only travel is shut: the Mart, the menus and Home stay open.
 */
export function nightmareLock(save: SaveData | null, data: GameData): Area | null {
  if (!save) return null
  const area = areaOf(data, save.currentAreaId)
  return area && inNightmare(save, data, area.id) ? area : null
}

/** The nightmare is over for good: the area is only its raid now. */
export const nightmareWon = (save: SaveData, data: GameData, areaId: string): boolean =>
  !!modeAt(data, areaId) && !!nightmareStateOf(save, areaId).won

/** The nightmare can begin here: a nightmare area, switched on, not over, not already under way. */
export function canStartNightmare(save: SaveData, data: GameData, areaId: string): boolean {
  if (!modeAt(data, areaId)) return false
  const n = nightmareStateOf(save, areaId)
  return !n.active && !n.won
}

/** Its foes can't be caught (they are Darkrai's nightmares): no throw after a win. */
export const nightmareNoCatch = (
  save: SaveData,
  data: GameData,
  areaId: string | null | undefined,
): boolean => inNightmare(save, data, areaId)

// ------------------------------------------------------------------ the rounds

/**
 * BEGIN THE NIGHTMARE: the team fully healed, round 1 next, the try counted. Null when it can't begin here. The gifts
 * already given stay given.
 */
export function startNightmare(save: SaveData, data: GameData, areaId: string): SaveData | null {
  if (!canStartNightmare(save, data, areaId)) return null
  const before = nightmareStateOf(save, areaId)
  return withNightmare(healTeam(save, data), areaId, {
    active: true,
    round: 0,
    ...(before.gifted?.length && { gifted: [...before.gifted] }),
    tries: (before.tries ?? 0) + 1,
  })
}

/** What comes next in the nightmare: Darkrai's strike (due after a round), the next foe, or nothing (not in it). */
export function nightmareNext(save: SaveData, data: GameData, areaId: string): 'strike' | 'foe' | null {
  if (!inNightmare(save, data, areaId)) return null
  return nightmareStateOf(save, areaId).strike ? 'strike' : 'foe'
}

/** The foe of the round under way (1-based `round` in the result), or null outside the nightmare. */
export function nightmareFoe(
  save: SaveData,
  data: GameData,
  areaId: string,
): { dex: number; level: number; round: number; total: number } | null {
  const mode = modeAt(data, areaId)
  const n = nightmareStateOf(save, areaId)
  if (!mode || !n.active) return null
  const foe = mode.foes[n.round]
  return foe ? { ...foe, round: n.round + 1, total: nightmareRounds(mode) } : null
}

/**
 * The next round's encounter: its foe, always the same one for that round, never shiny. Null outside the nightmare,
 * while Darkrai's strike is due, or past the last round.
 */
export function nightmareEncounter(save: SaveData, data: GameData, areaId: string): Encounter | null {
  if (nightmareNext(save, data, areaId) !== 'foe') return null
  const foe = nightmareFoe(save, data, areaId)
  if (!foe || !data.species[foe.dex]) return null
  return { kind: 'wild', dex: foe.dex, level: foe.level, isNew: !save.pokedex.includes(foe.dex) }
}

/** The gift a round's win gives (its item known to the game), or null. */
export function nightmareGiftAt(mode: NightmareMode, round: number, data: GameData) {
  const g = mode.gifts.find((x) => x.round === round)
  return g && data.items[g.key] && g.qty > 0 ? g : null
}

/**
 * A round is won (its foe K.O.): the round counts; its gift goes into the bag the first time ever; then Darkrai's
 * strike is due, or, the last round, the player wakes up (`victory`). Unchanged (null) outside the nightmare.
 */
export function winNightmareRound(
  save: SaveData,
  data: GameData,
  areaId: string,
): {
  save: SaveData
  round: number
  total: number
  gift: { key: string; qty: number } | null
  victory: boolean
} | null {
  const mode = modeAt(data, areaId)
  const n = nightmareStateOf(save, areaId)
  if (!mode || !n.active || n.strike) return null
  const round = n.round + 1
  const total = nightmareRounds(mode)
  const due = nightmareGiftAt(mode, round, data)
  const gift = due && !n.gifted?.includes(round) ? { key: due.key, qty: due.qty } : null
  let next = save
  let state: NightmareState = { ...n, round }
  if (gift) {
    next = {
      ...next,
      inventory: { ...next.inventory, [gift.key]: (next.inventory[gift.key] ?? 0) + gift.qty },
    }
    state = { ...state, gifted: [...(n.gifted ?? []), round] }
  }
  if (round >= total)
    return {
      save: winNightmare(withNightmare(next, areaId, state), data, areaId),
      round,
      total,
      gift,
      victory: true,
    }
  if (mode.strikePercent > 0) state = { ...state, strike: true }
  return { save: withNightmare(next, areaId, state), round, total, gift, victory: false }
}

/**
 * HP Darkrai's shadow takes from a Pokémon with `hp` of `max`: `percent` % of its max HP, rounded, at least 1, but it
 * never K.O.s (it stops at 1 HP); a K.O. one has nothing to lose. The HP left.
 */
export function nightmareStrikeHp(hp: number, max: number, percent: number): number {
  if (hp <= 0 || percent <= 0) return hp
  const loss = Math.max(1, Math.round((max * percent) / 100))
  return Math.max(1, hp - loss)
}

/**
 * Darkrai's shadow strikes (due after a round): every team member loses its share (nightmareStrikeHp), and the next
 * round can come. `hits`: who lost what, in team order. Null when no strike is due.
 */
export function applyNightmareStrike(
  save: SaveData,
  data: GameData,
  areaId: string,
): { save: SaveData; hits: { uid: string; from: number; to: number }[] } | null {
  const mode = modeAt(data, areaId)
  const n = nightmareStateOf(save, areaId)
  if (!mode || !n.active || !n.strike) return null
  const hits: { uid: string; from: number; to: number }[] = []
  for (const p of teamOf(save)) {
    if (!data.species[p.dex]) continue
    const to = nightmareStrikeHp(p.currentHp, instanceMaxHp(p, data), mode.strikePercent)
    hits.push({ uid: p.id, from: p.currentHp, to })
  }
  const struck = mapTeam(save, (p) => {
    const h = hits.find((x) => x.uid === p.id)
    return h ? { ...p, currentHp: h.to } : p
  })
  return { save: withNightmare(struck, areaId, { ...n, strike: false }), hits }
}

// ------------------------------------------------------------------ how it ends

/**
 * Every round won: the player wakes up, for good. The team is healed, and the area is only its raid now
 * (`nightmareWon`). The waking's moment is due (`wonSeen` false).
 */
export function winNightmare(save: SaveData, data: GameData, areaId: string): SaveData {
  const mode = modeAt(data, areaId)
  const n = nightmareStateOf(save, areaId)
  return withNightmare(healTeam(save, data), areaId, {
    active: false,
    round: mode ? nightmareRounds(mode) : n.round,
    won: true,
    wonSeen: false,
    ...(n.gifted?.length && { gifted: n.gifted }),
    ...(n.tries != null && { tries: n.tries }),
  })
}

/** The waking's moment has played. */
export function markNightmareWonSeen(save: SaveData, areaId: string): SaveData {
  const n = nightmareStateOf(save, areaId)
  return n.won && !n.wonSeen ? withNightmare(save, areaId, { ...n, wonSeen: true }) : save
}

/** The waking's moment is due here. */
export const nightmareVictoryDue = (save: SaveData, data: GameData, areaId: string): boolean =>
  nightmareWon(save, data, areaId) && !nightmareStateOf(save, areaId).wonSeen

/**
 * The whole team K.O. in the nightmare: the player wakes up in a cold sweat. XP, ₽ and items stay (the gifts too, never
 * given twice), the rounds go back to 0, the team is healed, and the player is free to go. Unchanged outside it.
 */
export function nightmareWipe(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!inNightmare(save, data, areaId)) return save
  const n = nightmareStateOf(save, areaId)
  return withNightmare(healTeam(save, data), areaId, {
    active: false,
    round: 0,
    ...(n.gifted?.length && { gifted: n.gifted }),
    ...(n.tries != null && { tries: n.tries }),
  })
}
