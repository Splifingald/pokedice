import { getSpecies } from './data'
import { expandDice } from './dice'
import type { Rng } from './rng'
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
export function effectiveStats(species: Species, level: number, data: GameData): EffectiveStats {
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
        if (dice.length >= data.config.maxDice) break
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
    maxHp: Math.max(1, Math.round((hpCurve(species, level) + hpBonus) * data.config.hpMultiplier)),
    types: species.type2 ? [species.type1, species.type2] : [species.type1],
    applied,
  }
}

export function instanceStats(inst: Pick<PokemonInstance, 'dex' | 'level'>, data: GameData): EffectiveStats {
  return effectiveStats(getSpecies(data, inst.dex), inst.level, data)
}

export function instanceMaxHp(inst: Pick<PokemonInstance, 'dex' | 'level'>, data: GameData): number {
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

/** Species change: dice, types, HP curve and rerolls follow the new species; level, XP and HP % carry over. */
/**
 * The evolution this item (a stone) triggers on this Pokémon, if any. `allowDex` gates cross-generation branches on
 * the region they come from (see engine/regions.ts, `evolutionGate`); with none passed every branch is on the table.
 */
export function stoneEvolution(
  inst: PokemonInstance,
  itemKey: string,
  data: GameData,
  allowDex?: (dex: number) => boolean,
): number | null {
  const e = data.species[inst.dex]?.evolutions.find(
    (x) => x.item === itemKey && data.species[x.toDex] && (allowDex?.(x.toDex) ?? true),
  )
  return e ? e.toDex : null
}

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
 * Level-ups, milestone cards and automatic (uncancellable) evolution by level (stone evolutions wait for their stone).
 * A branching evolution prefers a species not yet in the Pokédex (see preferUnowned).
 * `evolve: false` (Day Care XP) levels up without evolving; the next level-up in battle then evolves it.
 */
export function gainXp(
  inst: PokemonInstance,
  amount: number,
  data: GameData,
  rng: Rng,
  opts: { evolve?: boolean; owned?: readonly number[]; allowDex?: (dex: number) => boolean } = {},
): { inst: PokemonInstance; events: ProgressEvent[] } {
  const cfg = data.config
  const events: ProgressEvent[] = []
  let cur: PokemonInstance = { ...inst }
  if (cur.level >= cfg.maxLevel) return { inst: { ...cur, xp: 0 }, events }
  cur.xp += Math.max(0, Math.floor(amount))

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
    const species = getSpecies(data, cur.dex)
    const ready =
      opts.evolve === false
        ? []
        : species.evolutions.filter(
            (e) => e.level != null && e.level <= cur.level && data.species[e.toDex] && (opts.allowDex?.(e.toDex) ?? true),
          )
    if (ready.length) {
      const target = ready.length === 1 ? ready[0]! : rng.pick(preferUnowned(ready, opts.owned))
      const fromDex = cur.dex
      cur = evolve(cur, target.toDex, data)
      events.push({ kind: 'evolve', uid: cur.id, fromDex, toDex: cur.dex, level: cur.level })
    }
  }
  if (cur.level >= cfg.maxLevel) cur.xp = 0 // overflow is discarded
  return { inst: cur, events }
}

export function averageLevel(levels: readonly number[]): number {
  if (!levels.length) return 1
  return levels.reduce((s, l) => s + l, 0) / levels.length
}
