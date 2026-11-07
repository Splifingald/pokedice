// A rival's team matched to the player (docs/61 §5.5, the user's ask, 2026-11-03: "adapt the rival team levels and
// pokemon evolution stage to the player so it stays fair, with different adaptation options"). The rival's set meeting
// (docs/61 §5.2) is written for a player on the game's own path; a player ahead or behind it meets a team fitted to the
// team they bring. Two choices of the admin's: how the levels follow (`levels`) and how the species follow
// (`stages`). Every rule is here; the store deals the fitted team and the battle log says so.
import { eventOpenTo } from './events'
import { evolutionsIn } from './forms'
import { isTradeEvolution } from './progression'
import { evolutionGate, regionOf } from './regions'
import type {
  GameData,
  PokemonInstance,
  RivalLevelMode,
  RivalMatchConfig,
  RivalStageMode,
  SaveData,
} from './types'

export const RIVAL_LEVEL_MODES = [
  'asWritten',
  'cap',
  'mirror',
  'pairs',
] as const satisfies readonly RivalLevelMode[]
export const RIVAL_STAGE_MODES = [
  'asWritten',
  'byLevel',
  'player',
] as const satisfies readonly RivalStageMode[]

export const RIVAL_MATCH_DEFAULTS: RivalMatchConfig = {
  access: 'off',
  levels: 'cap',
  margin: 1,
  stages: 'byLevel',
}

/** The admin's choices over the defaults; an unknown mode or an odd number keeps its default. */
export function rivalMatchConfig(data: GameData): RivalMatchConfig {
  const raw = data.config.rivalMatch ?? {}
  const d = RIVAL_MATCH_DEFAULTS
  const margin = Number(raw.margin)
  return {
    access: raw.access ?? d.access,
    levels: (RIVAL_LEVEL_MODES as readonly string[]).includes(raw.levels as string) ? raw.levels! : d.levels,
    // A margin below zero is a rival kept under the player; ±20 is already far past fair.
    margin: Number.isFinite(margin) ? Math.max(-20, Math.min(20, Math.round(margin))) : d.margin,
    stages: (RIVAL_STAGE_MODES as readonly string[]).includes(raw.stages as string) ? raw.stages! : d.stages,
  }
}

/** The switch (docs/15 §20): Off, the rivals' teams are as written. */
export const rivalMatchOn = (data: GameData): boolean => eventOpenTo(data.config.rivalMatch?.access, data)

export interface RivalMon {
  dex: number
  level: number
}

const clampLevel = (level: number, maxLevel: number) => Math.max(1, Math.min(maxLevel, Math.round(level)))

/** The team the player brings: the rival fights these, not the Box (a Lv.60 in the PC doesn't fight). */
function playerTeam(save: SaveData): PokemonInstance[] {
  const byId = new Map(save.box.map((p) => [p.id, p]))
  return save.team.map((id) => byId.get(id)).filter((p): p is PokemonInstance => !!p)
}

/**
 * The levels, by the admin's mode (`margin` levels above the player's, or below with a negative one):
 * - `cap`: never stronger — a team whose best stands above the player's best + margin is scaled down by one ratio, its
 *   best on that cap (the real-player level match's rule, docs/54 §9); a team already within reach is as written.
 * - `mirror`: always level — the team scaled, up or down, so its best lands on the player's best + margin.
 * - `pairs`: Pokémon for Pokémon — the rival's strongest at the player's strongest + margin, its second at the
 *   player's second, and so on; a rival with more Pokémon than the player fields the rest at the player's weakest.
 * The team keeps its order (its lead leads) and, under `cap` and `mirror`, its proportions.
 */
export function matchLevels(
  team: readonly RivalMon[],
  own: readonly number[],
  cfg: Pick<RivalMatchConfig, 'levels' | 'margin'>,
  maxLevel: number,
): RivalMon[] {
  if (cfg.levels === 'asWritten' || !own.length || !team.length) return team.map((m) => ({ ...m }))
  const mine = [...own].sort((a, b) => b - a)
  if (cfg.levels === 'pairs') {
    const order = team.map((m, i) => ({ m, i })).sort((a, b) => b.m.level - a.m.level || a.i - b.i)
    const level = new Map(
      order.map(({ i }, rank) => [i, mine[Math.min(rank, mine.length - 1)]! + cfg.margin]),
    )
    return team.map((m, i) => ({ ...m, level: clampLevel(level.get(i)!, maxLevel) }))
  }
  const target = clampLevel(mine[0]! + cfg.margin, maxLevel)
  const top = Math.max(...team.map((m) => m.level))
  const ratio = cfg.levels === 'mirror' || top > target ? target / top : 1
  return ratio === 1
    ? team.map((m) => ({ ...m }))
    : team.map((m) => ({ ...m, level: clampLevel(m.level * ratio, maxLevel) }))
}

const prevoIndex = new WeakMap<GameData, Map<number, { dex: number; level: number | null }>>()

/** The species this one evolves from and the level it does it at (null: a stone, a trade, a friendship), or null. */
function prevoOf(data: GameData, dex: number): { dex: number; level: number | null } | null {
  let index = prevoIndex.get(data)
  if (!index) {
    index = new Map()
    // A form row (a Mega, Alolan Raichu) is never anyone's earlier stage: the plain species are.
    for (const s of data.speciesList) {
      if (s.form) continue
      for (const e of s.evolutions)
        if (!index.has(e.toDex)) index.set(e.toDex, { dex: s.dex, level: e.level })
    }
    prevoIndex.set(data, index)
  }
  return index.get(dex) ?? null
}

/** How many forms come before this one in its line: Charmander 0, Charmeleon 1, Charizard 2 (Pichu 0, Pikachu 1). */
export function stageIndex(data: GameData, dex: number): number {
  let n = 0
  for (let p = prevoOf(data, dex); p && n < 4; p = prevoOf(data, p.dex)) n++
  return n
}

/**
 * The species a Pokémon of this line becomes as its level moves from `written` to `level`, as one of the player's
 * would be. Brought down, it goes back through the evolutions the new level undoes (a Lv.40 Charizard at Lv.20 is a
 * Charmeleon; a written Lv.12 Pikachu stays one, its Pichu evolving at 30 never undone). Raised, it evolves along each
 * level evolution it has reached (a Charmander raised to Lv.40 is a Charizard; the first such evolution of a branching
 * one, as the region allows it). A stone's or a trade's evolution has no level to go by: it stays as it is. A level
 * left as written leaves the species as written. A battle form (a Mega) is left alone.
 */
export function stageForLevel(
  data: GameData,
  save: SaveData,
  dex: number,
  written: number,
  level: number,
): number {
  const form = data.species[dex]?.form
  if ((form && form.kind !== 'regional') || level === written) return dex
  let cur = dex
  if (level < written) {
    for (
      let p = prevoOf(data, cur), guard = 0;
      p && p.level != null && level < p.level && p.level <= written && guard < 4;
      guard++
    ) {
      cur = p.dex
      p = prevoOf(data, cur)
    }
    return cur
  }
  const gate = evolutionGate(save, data)
  for (let guard = 0; guard < 4; guard++) {
    const from = cur
    const next = evolutionsIn(data.species[from]?.evolutions ?? [], regionOf(save)).find(
      (e) =>
        e.level != null &&
        e.level <= level &&
        data.species[e.toDex] &&
        gate(e.toDex) &&
        !isTradeEvolution(data, from, e.toDex),
    )
    if (!next) break
    cur = next.toDex
  }
  return cur
}

/**
 * Back down its line through each evolution `level` stands below (a Charizard at Lv.30 is a Charmeleon, at Lv.14 a
 * Charmander), whatever it was written at: a real player's team brought down never keeps a form its level couldn't
 * have (docs/54 §9). A stone's or a trade's evolution has no level to undo; a battle form (a Mega) is left alone.
 */
export function stageAtLevel(data: GameData, dex: number, level: number): number {
  const form = data.species[dex]?.form
  if (form && form.kind !== 'regional') return dex
  let cur = dex
  for (let p = prevoOf(data, cur), guard = 0; p && p.level != null && level < p.level && guard < 4; guard++) {
    cur = p.dex
    p = prevoOf(data, cur)
  }
  return cur
}

/** Back down its line until it is no further evolved than `max` (Charizard → Charmander at 0). */
function capStage(data: GameData, dex: number, max: number): number {
  let cur = dex
  for (let guard = 0; guard < 4 && stageIndex(data, cur) > max; guard++) {
    const p = prevoOf(data, cur)
    if (!p) break
    cur = p.dex
  }
  return cur
}

/**
 * The species, by the admin's mode, for a team whose levels moved from `written`'s (same order):
 * - `byLevel`: each follows its level as one of the player's would (`stageForLevel`).
 * - `player`: the same, then never further evolved than the player's most evolved team member (a team of first forms
 *   meets first forms).
 */
export function matchStages(
  team: readonly RivalMon[],
  written: readonly RivalMon[],
  save: SaveData,
  own: readonly PokemonInstance[],
  cfg: Pick<RivalMatchConfig, 'stages'>,
  data: GameData,
): RivalMon[] {
  if (cfg.stages === 'asWritten') return team.map((m) => ({ ...m }))
  const byLevel = team.map((m, i) => ({
    ...m,
    dex: stageForLevel(data, save, m.dex, written[i]?.level ?? m.level, m.level),
  }))
  if (cfg.stages === 'byLevel' || !own.length) return byLevel
  const max = Math.max(...own.map((p) => stageIndex(data, p.dex)))
  return byLevel.map((m) => ({ ...m, dex: capStage(data, m.dex, max) }))
}

/**
 * The rival's team fitted to the player (docs/61 §5.5): the levels, then the species at those levels. `matched` says
 * whether anything changed, for the rival's line in the log. With the switch off, or no team to go by, it's as written.
 */
export function matchRivalTeam(
  team: readonly RivalMon[],
  save: SaveData | null | undefined,
  data: GameData,
): { team: RivalMon[]; matched: boolean } {
  const own = save ? playerTeam(save) : []
  if (!save || !rivalMatchOn(data) || !own.length)
    return { team: team.map((m) => ({ ...m })), matched: false }
  const cfg = rivalMatchConfig(data)
  const levelled = matchLevels(
    team,
    own.map((p) => p.level),
    cfg,
    data.config.maxLevel,
  )
  const out = matchStages(levelled, team, save, own, cfg, data)
  const matched = out.some((m, i) => m.level !== team[i]!.level || m.dex !== team[i]!.dex)
  return { team: out, matched }
}
