import { getSpecies } from './data'
import { expandDice } from './dice'
import { evolutionsIn } from './forms'
import type { Rng } from './rng'
import { TALENT, talentOf, type TalentKey } from './talents'
import type { DieType, Evolution, GameConfig, GameData, Milestone, PokeType, PokemonInstance, Species } from './types'

/** xpToNext(L) = ceil(A × L^B) + C */
export function xpToNext(level: number, cfg: GameConfig): number {
  const { A, B, C } = cfg.xpCurve
  return Math.ceil(A * level ** B) + C
}

/** HP at level L = round(baseHp + (maxHp − baseHp) × (L − 1) / 99) */
export function hpCurve(species: Species, level: number): number {
  return Math.round(species.baseHp + ((species.maxHp - species.baseHp) * (level - 1)) / 99)
}

/**
 * Speed = the species' base Speed stat + `speedPerLevel` (1) × level (docs/50), so a Pokémon trained past its foe's
 * level catches up with faster species. A tie still goes to the player (`startBattle`).
 */
export function battleSpeed(species: Species, level: number, data: GameData, talent?: TalentKey | null): number {
  const speed = species.speed + Math.round((data.config.speedPerLevel ?? 1) * level)
  // Quick and Ultra Speed (docs/51): a share more.
  const up = talent === 'quick' ? TALENT.quick : talent === 'ultraSpeed' ? TALENT.ultraSpeed : 0
  return up ? Math.round(speed * (1 + up)) : speed
}

export interface EffectiveStats {
  dice: DieType[]
  rerolls: number
  maxHp: number
  types: PokeType[]
  /** Milestones that actually changed something, up to this level. */
  applied: Milestone[]
}

/**
 * A Pokémon's dice, rerolls and max HP are derived from its species and level — every non-EVOLVE milestone at or
 * below the level is applied in order, then HP is scaled by `hpMultiplier`. Nothing about the dice set is stored in
 * the save.
 */
/** `talent`: Thick Hide's (docs/51) is more max HP. */
export function effectiveStats(species: Species, level: number, data: GameData, talent?: TalentKey | null): EffectiveStats {
  const dice = expandDice(species.dice)
  let rerolls = species.rerolls
  let hpBonus = 0
  const applied: Milestone[] = []
  const ms = [...species.milestones].filter((m) => m.level <= level).sort((a, b) => a.level - b.level)
  for (const m of ms) {
    switch (m.effect) {
      // UPGRADE_DIE is REPLACE_DIE with 'base' as the source — kept so older data still loads.
      case 'UPGRADE_DIE':
      case 'REPLACE_DIE': {
        const from = m.effect === 'UPGRADE_DIE' ? 'base' : (m.fromDieType ?? 'base')
        const to = m.dieType ?? species.type1
        const i = dice.indexOf(from)
        if (i < 0 || from === to) break
        dice.splice(i, 1)
        // Keep base dice at the end so the tray reads typed-first.
        if (to === 'base') dice.push(to)
        else dice.splice(dice.filter((d) => d !== 'base').length, 0, to)
        applied.push(m)
        break
      }
      case 'ADD_REROLL':
        rerolls += m.amount ?? 1
        applied.push(m)
        break
      case 'ADD_DIE':
        // Keep base dice at the end so the tray reads typed-first.
        dice.splice(dice.filter((d) => d !== 'base').length, 0, m.dieType ?? species.type1)
        applied.push(m)
        break
      case 'ADD_HP':
        hpBonus += m.amount ?? 0
        applied.push(m)
        break
      case 'EVOLVE':
        break
    }
  }
  return {
    dice,
    rerolls,
    maxHp: Math.max(
      1,
      Math.round((hpCurve(species, level) + hpBonus) * data.config.hpMultiplier * (talent === 'thickHide' ? 1 + TALENT.thickHide : 1)),
    ),
    types: species.type2 ? [species.type1, species.type2] : [species.type1],
    applied,
  }
}

/** A Pokémon's own: its hidden talent (docs/51) counts. */
export function instanceStats(inst: Pick<PokemonInstance, 'dex' | 'level' | 'talent'>, data: GameData): EffectiveStats {
  return effectiveStats(getSpecies(data, inst.dex), inst.level, data, talentOf(data, inst))
}

export function instanceMaxHp(inst: Pick<PokemonInstance, 'dex' | 'level' | 'talent'>, data: GameData): number {
  return instanceStats(inst, data).maxHp
}

export function createInstance(dex: number, level: number, data: GameData, id: string, now: number): PokemonInstance {
  const lv = Math.max(1, Math.min(data.config.maxLevel, Math.round(level)))
  return { id, dex, level: lv, xp: 0, currentHp: instanceMaxHp({ dex, level: lv }, data), caughtAt: now }
}

export type ProgressEvent =
  | { kind: 'level_up'; uid: string; dex: number; level: number; maxHp: number }
  | { kind: 'milestone'; uid: string; dex: number; level: number; milestone: Milestone }
  | { kind: 'evolve'; uid: string; fromDex: number; toDex: number; level: number }
  /**
   * A family's hidden talent unlocked (docs/51) through this Pokémon: `caught` with it, `passed` from a weaker one caught
   * and let go, `evolved` as it evolved, `candy` given a Talent Candy.
   */
  | { kind: 'talent'; uid: string; dex: number; talent: TalentKey; how: 'caught' | 'passed' | 'evolved' | 'candy' }

/**
 * Which species may be evolved into, and — for a regional evolution — the region the player stands in (see
 * `evolutionGate` in regions.ts, which builds one).
 */
export type EvolutionGateLike = ((dex: number) => boolean) & { region?: string }

/**
 * The evolution this item (a stone) triggers on this Pokémon, if any. `allowDex` gates cross-generation branches on
 * the region they come from (see engine/regions.ts, `evolutionGate`); with none passed every branch is on the table.
 */
export function stoneEvolution(
  inst: PokemonInstance,
  itemKey: string,
  data: GameData,
  allowDex?: EvolutionGateLike,
): number | null {
  const e = evolutionsIn(data.species[inst.dex]?.evolutions ?? [], allowDex?.region).find(
    (x) => x.item === itemKey && data.species[x.toDex] && (allowDex?.(x.toDex) ?? true),
  )
  return e ? e.toDex : null
}

/** Species change: dice, types, HP curve and rerolls follow the new species; level, XP and HP % carry over. */
export function evolve(inst: PokemonInstance, toDex: number, data: GameData): PokemonInstance {
  const oldMax = instanceMaxHp(inst, data)
  const next = { ...inst, dex: toDex }
  const newMax = instanceMaxHp(next, data)
  const pct = oldMax > 0 ? inst.currentHp / oldMax : 1
  let hp = Math.round(pct * newMax)
  if (inst.currentHp > 0) hp = Math.max(1, hp)
  next.currentHp = Math.min(newMax, hp)
  return next
}

/**
 * A branching evolution prefers a species the player has not caught yet — Eevee, Tyrogue, Wurmple, Nincada and the
 * rest. Once every branch is owned they are all equally likely again, so a full Pokédex still sees variety. With no
 * Pokédex to consult (the simulator, the Day Care) every branch stays on the table.
 */
export function preferUnowned(ready: Evolution[], owned?: readonly number[]): Evolution[] {
  if (!owned) return ready
  const set = new Set(owned)
  const fresh = ready.filter((e) => !set.has(e.toDex))
  return fresh.length ? fresh : ready
}

/**
 * A trade evolution (docs/23 §1.5): the pair is on the admin's list (game_config `trade.evolveOnTrade`). It happens the
 * moment the Pokémon arrives in a trade, and never by level, whatever its evolution's level says.
 */
export const isTradeEvolution = (data: GameData, fromDex: number, toDex: number): boolean =>
  !!data.config.trade?.evolveOnTrade?.some(([a, b]) => a === fromDex && b === toDex)

/** What this species evolves into when traded, or null. */
export function tradeEvolutionOf(data: GameData, dex: number): number | null {
  const pair = data.config.trade?.evolveOnTrade?.find(([a, b]) => a === dex && data.species[b])
  return pair ? pair[1] : null
}

/**
 * The Link Cable (docs/25): the trade evolution this Pokémon would have in a trade, without one — gated like
 * `stoneEvolution` on the region being played. Null when it has none.
 */
export function linkEvolution(inst: Pick<PokemonInstance, 'dex'>, data: GameData, allowDex?: EvolutionGateLike): number | null {
  const to = tradeEvolutionOf(data, inst.dex)
  return to != null && (allowDex?.(to) ?? true) ? to : null
}

/**
 * The evolutions by level this Pokémon has reached (several for a branching one), gated like `stoneEvolution`. Trade
 * evolutions never come this way (see isTradeEvolution).
 */
export function levelEvolutions(inst: PokemonInstance, data: GameData, allowDex?: EvolutionGateLike): Evolution[] {
  return evolutionsIn(getSpecies(data, inst.dex).evolutions, allowDex?.region).filter(
    (e) =>
      e.level != null &&
      e.level <= inst.level &&
      data.species[e.toDex] &&
      (allowDex?.(e.toDex) ?? true) &&
      !isTradeEvolution(data, inst.dex, e.toDex),
  )
}

/**
 * Level-ups, milestone cards and automatic (uncancellable) evolution by level (stone evolutions wait for their stone).
 * A branching evolution prefers a species not yet in the Pokédex (see preferUnowned).
 * A Pokémon already at or past its evolution level evolves on any XP it earns, without waiting for a level: one caught
 * above it (Johto's Pupitar comes N.55-70, it evolves at 55) or levelled in the Day Care.
 * `evolve: false` (Day Care XP) levels up without evolving; the next XP in battle then evolves it.
 */
export function gainXp(
  inst: PokemonInstance,
  amount: number,
  data: GameData,
  rng: Rng,
  opts: { evolve?: boolean; owned?: readonly number[]; allowDex?: EvolutionGateLike } = {},
): { inst: PokemonInstance; events: ProgressEvent[] } {
  const cfg = data.config
  const events: ProgressEvent[] = []
  let cur: PokemonInstance = { ...inst }
  if (cur.level >= cfg.maxLevel) return { inst: { ...cur, xp: 0 }, events }
  const gained = Math.max(0, Math.floor(amount))
  cur.xp += gained

  const tryEvolve = () => {
    if (opts.evolve === false) return
    const ready = levelEvolutions(cur, data, opts.allowDex)
    if (!ready.length) return
    const target = ready.length === 1 ? ready[0]! : rng.pick(preferUnowned(ready, opts.owned))
    const fromDex = cur.dex
    cur = evolve(cur, target.toDex, data)
    events.push({ kind: 'evolve', uid: cur.id, fromDex, toDex: cur.dex, level: cur.level })
  }
  // Overdue: past its evolution level before this XP came in.
  if (gained > 0) tryEvolve()

  let guard = 0
  while (cur.level < cfg.maxLevel && cur.xp >= xpToNext(cur.level, cfg) && guard++ < 200) {
    cur.xp -= xpToNext(cur.level, cfg)
    const before = instanceStats(cur, data)
    cur.level += 1
    const after = instanceStats(cur, data)
    if (cur.currentHp > 0) cur.currentHp = Math.min(after.maxHp, cur.currentHp + Math.max(0, after.maxHp - before.maxHp))
    events.push({ kind: 'level_up', uid: cur.id, dex: cur.dex, level: cur.level, maxHp: after.maxHp })
    for (const m of after.applied.slice(before.applied.length)) {
      events.push({ kind: 'milestone', uid: cur.id, dex: cur.dex, level: cur.level, milestone: m })
    }
    tryEvolve()
  }
  if (cur.level >= cfg.maxLevel) cur.xp = 0 // overflow is discarded
  return { inst: cur, events }
}

export function averageLevel(levels: readonly number[]): number {
  if (!levels.length) return 1
  return levels.reduce((s, l) => s + l, 0) / levels.length
}
