// Extreme mode's Pokémon Centers (docs/47): no healing machine, a boon to pick instead. The team heal is always on
// offer; the others (a full heal on one, a healing item, a Pokébuff, a donor's ₽, Team Rocket's mystery trade) are
// drawn by weight as distinct kinds, among those that can do something now. Centers run out too: a completed area has
// none, a secret area only its first, and a round lost to a K.O. starts over at a Center that only swaps. Every rule
// and number is decided here; the screens only show them.
import { isLegendary } from './breeding'
import { trainerGoldFor } from './economy'
import { eventOpenTo } from './events'
import { isExtreme, healItemsOn } from './extreme'
import { effectiveStats, instanceMaxHp, instanceStats, createInstance } from './progression'
import { regionCases, regionOf, regionSpecies } from './regions'
import { progressOf, teamOf } from './run'
import type { Rng } from './rng'
import type {
  Area,
  CenterBoon,
  CenterBoonKind,
  ExtremeCentersConfig,
  GameData,
  PokemonInstance,
  PokeType,
  SaveData,
} from './types'

const HOUR_MS = 3_600_000
/** Unown's letters have their own Pokédex (docs/41): a mystery trade never hands one over. */
const UNOWN = 201

const cfg = (data: GameData): ExtremeCentersConfig => data.config.extremeCenters

/** The admin's switch (Off / On for admin / On for everyone). */
export const extremeCentersOn = (data: GameData): boolean => eventOpenTo(cfg(data)?.access, data)

/**
 * This save's Pokémon Centers give a boon instead of a heal: an Extreme save, the switch on, and the Extreme admin's
 * "Pokémon Centers" (the main game's Centers) left off.
 */
export const boonCenters = (save: Pick<SaveData, 'mode'>, data: GameData): boolean =>
  isExtreme(save) && !data.config.extreme.centers && extremeCentersOn(data)

/**
 * A boon Center can still come in this area: not once it is completed (or going back to an easy area would heal for
 * free), and in a secret area (it never completes) only the very first one.
 */
export function boonCentersHere(save: SaveData, area: Area, data: GameData): boolean {
  if (!boonCenters(save, data)) return false
  const p = progressOf(save, area.id)
  if (p.cleared) return false
  return area.roundsToClear != null || !p.centerMet
}

/** The team was K.O. here: the round starts over at a Center that only swaps, no boon and no heal. */
export const wipeCenterDue = (save: SaveData, areaId: string, data: GameData): boolean =>
  boonCenters(save, data) && !!progressOf(save, areaId).wiped

/** A Pokémon Center can open this area's next round (the round gauge shows it ahead). */
export const roundCenterHere = (save: SaveData, area: Area, data: GameData): boolean =>
  boonCentersHere(save, area, data) || wipeCenterDue(save, area.id, data)

// ---------------------------------------------------------------- what each boon gives

/** Badges won in the region being played: the potion a Center's item gives gets better with them. */
const badgesHere = (save: SaveData, data: GameData): number =>
  regionCases(save, data).find((r) => r.id === regionOf(save))?.earned ?? 0

/** The best potion the badges allow (the admin's list, the first one when none is reached yet). */
export function centerPotion(save: SaveData, data: GameData): string | null {
  const list = cfg(data).item.potions.filter((p) => data.items[p.key])
  const badges = badgesHere(save, data)
  let best: string | null = list[0]?.key ?? null
  for (const p of list) if (badges >= p.badges) best = p.key
  return best
}

/** What an average trainer of the area pays (its trainers by weight; the area's levels when it has none). */
export function averageTrainerGold(area: Area, data: GameData): number {
  const pool = area.trainerPool.filter((t) => t.weight > 0 && data.trainers[t.trainerId]?.team.length)
  const total = pool.reduce((s, t) => s + t.weight, 0)
  if (!total) return trainerGoldFor(2 * Math.round((area.minLevel + area.maxLevel) / 2), area, false, data)
  const levels = pool.reduce(
    (s, t) => s + (t.weight / total) * data.trainers[t.trainerId]!.team.reduce((n, m) => n + m.level, 0),
    0,
  )
  return trainerGoldFor(levels, area, false, data)
}

/** A donor's ₽ here: `trainers` × an average trainer's. */
export const donorGold = (area: Area, data: GameData): number =>
  Math.max(1, Math.round(cfg(data).donor.trainers * averageTrainerGold(area, data)))

/** A Pokémon's dice count without any Pokébuff (what the cap reads). */
const diceCount = (inst: PokemonInstance, data: GameData): number =>
  data.species[inst.dex] ? instanceStats(inst, data).dice.length : 0

/** The Pokébuff is on: its die joins its battles until it runs out. */
export const buffActive = (inst: Pick<PokemonInstance, 'buff'>, now: number): boolean =>
  !!inst.buff && inst.buff.until > now

/** Time left on a Pokébuff (ms), or null when it has none running. */
export const buffLeft = (inst: Pick<PokemonInstance, 'buff'>, now: number): number | null =>
  buffActive(inst, now) ? inst.buff!.until - now : null

/** A team member's Pokébuff die for a battle, and the cap it is kept under; null when it has none running. */
export function buffDiceFor(
  save: SaveData,
  data: GameData,
  uid: string,
  now: number,
): { extraDice: PokeType[]; diceCap: number } | null {
  if (!isExtreme(save)) return null
  const inst = save.box.find((p) => p.id === uid)
  return inst && buffActive(inst, now)
    ? { extraDice: [inst.buff!.type], diceCap: cfg(data).buff.maxDice }
    : null
}

/** Its evolution stage: first of a line, in the middle, or final (a Pokémon that never evolves is final). */
export function evolutionStage(data: GameData, dex: number): 'first' | 'middle' | 'final' {
  const s = data.species[dex]
  if (!s?.evolutions.length) return 'final'
  return data.speciesList.some((o) => o.evolutions.some((e) => e.toDex === dex)) ? 'middle' : 'first'
}

/** How strong a species is at a level, in the game's own numbers: max HP × dice (what it takes and what it throws). */
export function fightValue(data: GameData, dex: number, level: number): number {
  const s = data.species[dex]
  if (!s) return 0
  const st = effectiveStats(s, level, data)
  return st.maxHp * st.dice.length
}

/**
 * What Team Rocket may hand over for this Pokémon: species of the region being played, at its evolution stage and
 * `levels` higher, never a legendary or a mythical, a form row, an Unown or its own species; those whose fight value
 * is within `band` % of its own when any is, else the five closest.
 */
export function rocketPool(save: SaveData, data: GameData, inst: PokemonInstance): number[] {
  const level = Math.min(data.config.maxLevel, inst.level + cfg(data).rocket.levels)
  const stage = evolutionStage(data, inst.dex)
  const own = fightValue(data, inst.dex, level)
  const candidates = [...regionSpecies(data, regionOf(save))]
    .filter((dex) => {
      const s = data.species[dex]
      return (
        !!s &&
        !s.form &&
        dex !== inst.dex &&
        dex !== UNOWN &&
        !isLegendary(data, dex) &&
        evolutionStage(data, dex) === stage
      )
    })
    .map((dex) => ({ dex, gap: own ? Math.abs(fightValue(data, dex, level) - own) / own : 0 }))
    .sort((a, b) => a.gap - b.gap || a.dex - b.dex)
  const band = Math.max(0, cfg(data).rocket.band) / 100
  const close = candidates.filter((c) => c.gap <= band)
  return (close.length ? close : candidates.slice(0, 5)).map((c) => c.dex)
}

/** Who a boon that names no one can go to: a full heal, any Pokémon not at full HP; Team Rocket, a team member. */
export function boonTargets(save: SaveData, data: GameData, kind: CenterBoonKind): PokemonInstance[] {
  if (kind === 'full')
    return [...teamOf(save), ...save.box.filter((p) => !save.team.includes(p.id))].filter(
      (p) => data.species[p.dex] && p.revivesAt == null && p.currentHp < instanceMaxHp(p, data),
    )
  if (kind === 'rocket')
    return teamOf(save).filter((p) => data.species[p.dex] && rocketPool(save, data, p).length)
  return []
}

// ---------------------------------------------------------------- the offers

const DRAWN: Exclude<CenterBoonKind, 'heal'>[] = ['full', 'item', 'buff', 'donor', 'rocket']

/** The team members a Pokébuff could go to: below the dice cap. */
const buffable = (save: SaveData, data: GameData): PokemonInstance[] =>
  teamOf(save).filter((p) => data.species[p.dex] && diceCount(p, data) < cfg(data).buff.maxDice)

/** The kinds a Center could offer besides the team heal now, with weight (an empty list: the heal alone). */
export function eligibleBoons(save: SaveData, data: GameData): Exclude<CenterBoonKind, 'heal'>[] {
  const c = cfg(data)
  return DRAWN.filter((k) => {
    if (c[k].weight <= 0) return false
    if (k === 'full' || k === 'rocket') return boonTargets(save, data, k).length > 0
    if (k === 'item')
      return (
        healItemsOn(save, data) &&
        (!!centerPotion(save, data) || !!data.items.revive || !!data.items['max-revive'])
      )
    if (k === 'buff') return c.buff.hours > 0 && buffable(save, data).length > 0
    return true
  })
}

/** The healing item a Center's item boon gives, drawn now: the potion, a Revive or a Max Revive by the admin's odds. */
function drawCenterItem(save: SaveData, data: GameData, rng: Rng): string | null {
  const c = cfg(data).item
  const choices = [
    { key: centerPotion(save, data), w: c.potion },
    { key: data.items.revive ? 'revive' : null, w: c.revive },
    { key: data.items['max-revive'] ? 'max-revive' : null, w: c.maxRevive },
  ].filter((x): x is { key: string; w: number } => !!x.key && x.w > 0)
  return rng.weighted(choices, (x) => x.w)?.key ?? null
}

function makeBoon(
  kind: Exclude<CenterBoonKind, 'heal'>,
  save: SaveData,
  data: GameData,
  area: Area,
  rng: Rng,
): CenterBoon | null {
  switch (kind) {
    case 'full':
      return { kind }
    case 'rocket':
      return { kind }
    case 'donor':
      return { kind, gold: donorGold(area, data) }
    case 'item': {
      const itemKey = drawCenterItem(save, data, rng)
      return itemKey ? { kind, itemKey } : null
    }
    case 'buff': {
      const p = rng.pick(buffable(save, data))
      const sp = data.species[p.dex]!
      return { kind, uid: p.id, type: rng.pick([sp.type1, ...(sp.type2 ? [sp.type2] : [])]) }
    }
  }
}

/** A Center's boons: the team heal first, then the others drawn by weight, distinct kinds, up to `offers` in all. */
export function drawCenterBoons(save: SaveData, data: GameData, area: Area, rng: Rng): CenterBoon[] {
  const c = cfg(data)
  const out: CenterBoon[] = [{ kind: 'heal', percent: c.heal.percent }]
  const left = eligibleBoons(save, data)
  while (out.length < Math.max(1, c.offers) && left.length) {
    const kind = rng.weighted(left, (k) => c[k].weight)
    if (!kind) break
    left.splice(left.indexOf(kind), 1)
    const boon = makeBoon(kind, save, data, area, rng)
    if (boon) out.push(boon)
  }
  return out
}

/** The boons waiting for the pick in this area, or null. */
export function pendingBoons(save: SaveData, areaId: string): CenterBoon[] | null {
  const c = save.extreme?.center
  return c && c.areaId === areaId && c.offers.length ? c.offers : null
}

/**
 * A boon Center is met: its boons are drawn and wait in the save for the pick, so a reload shows the same ones. A
 * Center after a K.O. (`wipe`) has none. The same save outside Extreme's boon Centers or with boons already waiting.
 */
export function openBoonCenter(
  save: SaveData,
  data: GameData,
  areaId: string,
  reason: 'fainted' | 'round' | 'wipe' | undefined,
  rng: Rng,
): SaveData {
  const area = data.areas.find((a) => a.id === areaId)
  if (!area || !boonCenters(save, data) || reason === 'wipe' || pendingBoons(save, areaId)) return save
  return {
    ...save,
    extreme: { ...save.extreme, center: { areaId, offers: drawCenterBoons(save, data, area, rng) } },
  }
}

/** The boons waiting go (the player left the area without picking one). */
export function dropBoons(save: SaveData): SaveData {
  if (!save.extreme?.center) return save
  const { center: _c, ...rest } = save.extreme
  return { ...save, extreme: rest }
}

// ---------------------------------------------------------------- the pick

export interface BoonPicked {
  save: SaveData
  boon: CenterBoon
  /** The Rocket Trade: who went, who came. */
  rocket?: { gave: PokemonInstance; got: PokemonInstance }
}

const mapBox = (save: SaveData, f: (p: PokemonInstance) => PokemonInstance): SaveData => ({
  ...save,
  box: save.box.map(f),
})

/**
 * The player takes one of the boons waiting: it applies (`target` names who a full heal or Team Rocket's trade is for)
 * and the boons go. Null for a pick that isn't on offer or a target it can't go to. `now` is the time a Pokébuff counts
 * from, `newId` the id of Team Rocket's Pokémon.
 */
export function pickCenterBoon(
  save: SaveData,
  data: GameData,
  areaId: string,
  index: number,
  target: string | null,
  rng: Rng,
  now: number,
  newId: () => string,
  shinyChance = data.config.shinyChance ?? 0,
): BoonPicked | null {
  const boon = pendingBoons(save, areaId)?.[index]
  if (!boon) return null
  const c = cfg(data)
  let next = dropBoons(save)
  let rocket: BoonPicked['rocket']
  switch (boon.kind) {
    case 'heal':
      next = mapBox(next, (p) => {
        if (p.currentHp <= 0 || p.revivesAt != null || !data.species[p.dex]) return p
        const max = instanceMaxHp(p, data)
        return {
          ...p,
          currentHp: Math.min(max, p.currentHp + Math.max(1, Math.round((max * boon.percent) / 100))),
        }
      })
      break
    case 'full': {
      if (!target || !boonTargets(save, data, 'full').some((p) => p.id === target)) return null
      next = mapBox(next, (p) => {
        if (p.id !== target) return p
        const { koAt: _k, ...rest } = p
        return { ...rest, currentHp: instanceMaxHp(p, data) }
      })
      break
    }
    case 'item':
      next = {
        ...next,
        inventory: { ...next.inventory, [boon.itemKey]: (next.inventory[boon.itemKey] ?? 0) + 1 },
      }
      break
    case 'donor':
      next = { ...next, gold: next.gold + boon.gold }
      break
    case 'buff': {
      const until = now + Math.max(0, c.buff.hours) * HOUR_MS
      if (!next.box.some((p) => p.id === boon.uid)) return null
      // A second Pokébuff on the same Pokémon puts its clock back to the start: never two dice.
      next = mapBox(next, (p) => (p.id === boon.uid ? { ...p, buff: { type: boon.type, until } } : p))
      break
    }
    case 'rocket': {
      const gave = teamOf(save).find((p) => p.id === target)
      const pool = gave ? rocketPool(save, data, gave) : []
      if (!gave || !pool.length) return null
      const dex = rng.pick(pool)
      const base = createInstance(dex, gave.level + c.rocket.levels, data, newId(), now)
      const shiny = shinyChance > 0 && rng.next() < shinyChance
      const got: PokemonInstance = shiny ? { ...base, shiny } : base
      // It takes the place of the one that went, in the team and its order.
      next = {
        ...next,
        box: [...next.box.filter((p) => p.id !== gave.id), got],
        team: next.team.map((id) => (id === gave.id ? got.id : id)),
        pokedex: next.pokedex.includes(dex) ? next.pokedex : [...next.pokedex, dex],
      }
      rocket = { gave, got }
      break
    }
  }
  return { save: next, boon, ...(rocket && { rocket }) }
}

/** The Centers' rules pop-up has been shown. */
export const markCenterRulesSeen = (save: SaveData): SaveData =>
  save.extreme?.centerRulesSeen ? save : { ...save, extreme: { ...save.extreme, centerRulesSeen: true } }

/** The Centers' rules pop-up opens by itself at the first boon Center. */
export const centerRulesDue = (save: SaveData | null, data: GameData): boolean =>
  !!save && boonCenters(save, data) && !save.extreme?.centerRulesSeen

/** The numbers the rules pop-up and the admin panel show. */
export function centerBoonRules(data: GameData) {
  const c = cfg(data)
  const weights = DRAWN.map((k) => Math.max(0, c[k].weight))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  return {
    offers: Math.max(1, c.offers),
    heal: c.heal.percent,
    buffHours: c.buff.hours,
    rocketLevels: c.rocket.levels,
    /** Each drawn kind's share of the draw, in % (rounded), in the order of `DRAWN`. */
    odds: Object.fromEntries(DRAWN.map((k, i) => [k, Math.round((100 * weights[i]!) / total)])) as Record<
      Exclude<CenterBoonKind, 'heal'>,
      number
    >,
  }
}
