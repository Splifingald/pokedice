/**
 * The battle powers (docs/35): Mega Evolution, Gigantamax and Z-Moves — where each is open, the Mega Gems, the rules
 * pop-ups, and what foes do with them. The battle (engine/battle.ts) only applies what `battlePowersFor` hands it.
 *
 * Each power has a switch (docs/15 §20). Mega Evolution's and Gigantamax's turn on their newer rules; off, they work as
 * they always have (docs/12 §3–4). Z-Moves are new: off, there are none.
 */
import type { CreateBattleOptions, EnemyPlan } from './battle'
import { eventOpenTo } from './events'
import { megaRaidGem } from './raidSpecials'
import { choiceFormsOf, gmaxFormsOf, megaFormsOf, megaOptions } from './forms'
import {
  getRegion,
  inWorldRegion,
  leagueDone,
  realRegions,
  regionCaseOf,
  regionCases,
  regionOf,
  regionsHolding,
} from './regions'
import {
  POWER_KINDS,
  type GameData,
  type ItemDef,
  type PowerKind,
  type RegionId,
  type SaveData,
  type Species,
  type TrainerRole,
} from './types'

/** Mega Evolution's gem rules are on for whoever is playing. */
export const gemRulesOn = (data: GameData): boolean =>
  eventOpenTo(data.config.megaEvolution.gems.access, data)
/** Gigantamax's newer rules are on for whoever is playing. */
export const gmaxBoostOn = (data: GameData): boolean => eventOpenTo(data.config.gigantamax.boost.access, data)
/** Z-Moves are on for whoever is playing. */
export const zMovesOn = (data: GameData): boolean => eventOpenTo(data.config.zMove.access, data)

/** A power's newer rules (Z-Moves': the power itself) are on for whoever is playing. */
export function powerRulesOn(data: GameData, kind: PowerKind): boolean {
  return kind === 'mega' ? gemRulesOn(data) : kind === 'gmax' ? gmaxBoostOn(data) : zMovesOn(data)
}

/** Where a power is won under the newer rules: its region, and which of its badges (1 = the first). */
export function powerHome(data: GameData, kind: PowerKind): { region: RegionId; badge: number } {
  const cfg = data.config
  if (kind === 'mega') return { region: cfg.megaEvolution.region, badge: cfg.megaEvolution.gems.badges }
  if (kind === 'gmax') return { region: cfg.gigantamax.region, badge: cfg.gigantamax.boost.badges }
  return { region: cfg.zMove.region, badge: cfg.zMove.badges }
}

/** The badge that opens a power (Korrina's, Kabu's, Lana's) is won, whatever the switches say. */
export function powerEarned(save: SaveData, data: GameData, kind: PowerKind): boolean {
  const home = powerHome(data, kind)
  const badges = regionCases(save, data).find((c) => c.id === home.region)?.badges ?? []
  return !!badges[home.badge - 1]?.earned
}

/** The leader whose badge opens a power, for the rules' text ("Korrina's badge"). */
export function powerLeader(data: GameData, kind: PowerKind): string {
  const home = powerHome(data, kind)
  return regionCaseOf(data, home.region, [], false)?.badges[home.badge - 1]?.leader ?? ''
}

/**
 * Under the newer rules the power works in `region`: its own region once its badge is won, any other — before it or
 * after — once that region's league is beaten too. Never inside a small world.
 */
export function powerOpenIn(
  save: SaveData,
  data: GameData,
  kind: PowerKind,
  region: RegionId = regionOf(save),
): boolean {
  if (inWorldRegion(save, data) || !powerEarned(save, data, kind)) return false
  return region === powerHome(data, kind).region || leagueDone(save, data, region)
}

/** The older rules: the region started (live or parked), or one after it. A small world is no step of the journey. */
function reached(save: SaveData, data: GameData, regionId: RegionId): boolean {
  const gate = getRegion(data, regionId)
  if (!gate) return false
  const started = new Set<RegionId>([regionOf(save), ...Object.keys(save.parked ?? {})])
  return realRegions(data).some((r) => started.has(r.id) && r.orderIndex >= gate.orderIndex)
}

/**
 * Mega Evolution is on where the player stands. Gem rules: see `powerOpenIn`. Older rules: once the player has reached
 * `megaEvolution.region` (Kalos), then everywhere, earlier regions included. Never in a small world, for the player
 * and its trainers alike (raids never have it either: see raidBattle's duels).
 */
export function megaUnlocked(save: SaveData, data: GameData): boolean {
  if (inWorldRegion(save, data)) return false
  return gemRulesOn(data)
    ? powerOpenIn(save, data, 'mega')
    : reached(save, data, data.config.megaEvolution.region)
}

/** Gigantamax is on where the player stands: as Mega Evolution, from `gigantamax.region` (Galar). */
export function gmaxUnlocked(save: SaveData, data: GameData): boolean {
  if (inWorldRegion(save, data)) return false
  return gmaxBoostOn(data)
    ? powerOpenIn(save, data, 'gmax')
    : reached(save, data, data.config.gigantamax.region)
}

/** Z-Moves are on where the player stands: switched on, and open here (see `powerOpenIn`). */
export const zUnlocked = (save: SaveData, data: GameData): boolean =>
  zMovesOn(data) && powerOpenIn(save, data, 'z')

// ---------------------------------------------------------------- the gems

/** A Mega Gem: one item per Mega form (Charizardite X, the Red Orb…). */
export const isGem = (
  item: ItemDef | undefined,
): item is ItemDef & { effect: { kind: 'megaGem'; mega: number } } => item?.effect.kind === 'megaGem'

/** Every Mega Gem, in Mega form order. */
export const gemItems = (data: GameData) =>
  Object.values(data.items)
    .filter(isGem)
    .sort((a, b) => a.effect.mega - b.effect.mega)

/** The gem a Mega form needs. */
export const gemOf = (data: GameData, megaDex: number) =>
  gemItems(data).find((g) => g.effect.mega === megaDex)

/** The gems a save holds (item keys). */
export const ownedGems = (save: Pick<SaveData, 'powers'>): string[] => save.powers?.gems ?? []

/**
 * Two copies of one save, one replacing the other (the cloud sync, another tab): a gem either holds stays held — a gem
 * is bought or won once and never used up. The same save back when there's nothing to add.
 */
export function keepGemsHeld(save: SaveData, other: SaveData | null | undefined): SaveData {
  const mine = ownedGems(save)
  const add = (other ? ownedGems(other) : []).filter((key) => !mine.includes(key))
  if (!add.length) return save
  return { ...save, powers: { ...save.powers, gems: [...mine, ...add] } }
}

/** The Mega forms a list of gems opens. */
export function megaFormsOfGems(data: GameData, gems: readonly string[]): number[] {
  return gems.flatMap((k) => {
    const item = data.items[k]
    return isGem(item) && data.species[item.effect.mega] ? [item.effect.mega] : []
  })
}

/**
 * The Mega forms open to a Pokémon of this species: under the gem rules, those whose gem the save holds, at any level;
 * under the older ones, every Mega form from `megaEvolution.level`. The Pokémon sheet shows these.
 */
export function megaFormsFor(save: SaveData, data: GameData, dex: number, level: number): Species[] {
  if (!gemRulesOn(data)) return megaOptions(data, dex, level)
  const held = new Set(megaFormsOfGems(data, ownedGems(save)))
  return megaFormsOf(data, dex).filter((f) => held.has(f.dex))
}

/** The gems a badge comes with (`gems.rewards`): won, never sold. */
const rewardGems = (data: GameData) => new Set(data.config.megaEvolution.gems.rewards.map((r) => r.gem))

/**
 * The regions whose Mart sells a gem: every region where its Pokémon can be had, or one it evolves from (wild, a
 * starter, a legendary, a fossil…: `regionSpecies`). A Pokémon found nowhere has its gem in the Mega region's Mart.
 */
export function gemRegions(data: GameData, gem: ItemDef): RegionId[] {
  if (!isGem(gem)) return []
  const base = data.species[gem.effect.mega]?.form?.of
  const found = base != null ? regionsHolding(data, base) : []
  return found.length ? found : [data.config.megaEvolution.region]
}

export interface GemShelfRow {
  item: ItemDef
  /** The Mega form it opens. */
  mega: Species
  owned: boolean
}

/**
 * The Mart's Mega Gems where the player stands: the gems of the Pokémon found in this region (not a badge's), held ones
 * marked. Null while the shelf is shut: gem rules off, or Mega Evolution not open here yet (Kalos: Korrina's badge;
 * anywhere else: its league).
 */
export function gemShelf(save: SaveData, data: GameData): GemShelfRow[] | null {
  if (!gemRulesOn(data) || !powerOpenIn(save, data, 'mega')) return null
  const region = regionOf(save)
  const rewards = rewardGems(data)
  const owned = new Set(ownedGems(save))
  return gemItems(data)
    // A Mega raid's gem or orb (docs/40) comes only from winning it, never from the Mart.
    .filter((g) => !rewards.has(g.key) && !megaRaidGem(g.key) && gemRegions(data, g).includes(region))
    .flatMap((item) => {
      const mega = data.species[item.effect.mega]
      return mega ? [{ item, mega, owned: owned.has(item.key) }] : []
    })
    .sort((a, b) => (a.mega.form?.of ?? 0) - (b.mega.form?.of ?? 0) || a.mega.dex - b.mega.dex)
}

/** Buy a gem from this region's shelf: once each, with this region's ₽. Null when it can't be bought. */
export function buyGem(save: SaveData, data: GameData, key: string): SaveData | null {
  const row = gemShelf(save, data)?.find((r) => r.item.key === key)
  if (!row || row.owned || save.gold < row.item.price) return null
  return {
    ...save,
    gold: save.gold - row.item.price,
    powers: { ...save.powers, gems: [...ownedGems(save), key] },
  }
}

/** A badge's gem waiting to be handed over, and who gives it (Korrina gives the Lucarionite). */
export interface BadgeGem {
  gem: ItemDef
  leader: string
}

/** The gems the save's badges of the Mega region come with and it doesn't hold yet (gem rules on). */
export function badgeGemsDue(save: SaveData, data: GameData): BadgeGem[] {
  if (!gemRulesOn(data)) return []
  const cfg = data.config.megaEvolution
  const badges = regionCases(save, data).find((c) => c.id === cfg.region)?.badges ?? []
  const owned = new Set(ownedGems(save))
  return cfg.gems.rewards.flatMap((r) => {
    const badge = badges[r.badge - 1]
    const gem = data.items[r.gem]
    return badge?.earned && isGem(gem) && !owned.has(gem.key) ? [{ gem, leader: badge.leader }] : []
  })
}

/**
 * Keeps the powers' part of the save up to date: hands over the badges' gems that are due (a badge won just now, or
 * before the gem rules were on) and notes the powers whose badge is won, for Versus (docs/35 §5). The same save when
 * nothing changed.
 */
export function syncPowers(save: SaveData, data: GameData): { save: SaveData; given: BadgeGem[] } {
  const given = badgeGemsDue(save, data)
  const earned = POWER_KINDS.filter((k) => powerEarned(save, data, k))
  const was = save.powers?.earned ?? []
  const sameEarned = earned.length === was.length && earned.every((k) => was.includes(k))
  if (!given.length && sameEarned) return { save, given }
  const gems = [...ownedGems(save), ...given.map((g) => g.gem.key)]
  return {
    save: {
      ...save,
      powers: { ...save.powers, ...(gems.length && { gems }), ...(earned.length && { earned }) },
    },
    given,
  }
}

/**
 * The first power whose rules pop-up is due: its rules (or Z-Moves) switched on, its badge won, not shown yet, and the
 * player not inside a small world. Mega first, then Gigantamax, then Z-Moves.
 */
export function powerRulesDue(save: SaveData, data: GameData): PowerKind | null {
  if (inWorldRegion(save, data)) return null
  const seen = save.powers?.seen ?? []
  return (
    POWER_KINDS.find((k) => !seen.includes(k) && powerRulesOn(data, k) && powerEarned(save, data, k)) ?? null
  )
}

export function markPowerRulesSeen(save: SaveData, kind: PowerKind): SaveData {
  const seen = save.powers?.seen ?? []
  if (seen.includes(kind)) return save
  return { ...save, powers: { ...save.powers, seen: [...seen, kind] } }
}

// ---------------------------------------------------------------- what a battle gets

/** The powers a fight in this save starts with: what's open here, and the newer rules that are on. */
export function battlePowersFor(
  save: SaveData,
  data: GameData,
): Pick<
  CreateBattleOptions,
  'megaAllowed' | 'gmaxAllowed' | 'zAllowed' | 'megaForms' | 'megaTurns' | 'gmaxBoost'
> {
  const gems = gemRulesOn(data)
  const boost = gmaxBoostOn(data) ? data.config.gigantamax.boost : null
  return {
    megaAllowed: megaUnlocked(save, data),
    gmaxAllowed: gmaxUnlocked(save, data),
    zAllowed: zUnlocked(save, data),
    ...(gems && {
      megaForms: megaFormsOfGems(data, ownedGems(save)),
      megaTurns: data.config.megaEvolution.gems.turns,
    }),
    ...(boost && { gmaxBoost: { dice: boost.dice, healPercent: boost.healPercent } }),
  }
}

/** A Versus side's powers (docs/35 §5): the gems its save holds, and whether it has won Gigantamax's and Z-Moves' badges. */
export interface VersusPowers {
  gems: string[]
  gmax: boolean
  z: boolean
}

/** The powers a save brings to Versus: only those whose rules are on for whoever is playing. */
export function versusPowersOf(save: SaveData, data: GameData): VersusPowers {
  const earned = POWER_KINDS.filter((k) => powerEarned(save, data, k))
  return {
    gems: gemRulesOn(data) ? ownedGems(save) : [],
    gmax: gmaxBoostOn(data) && earned.includes('gmax'),
    z: zMovesOn(data) && earned.includes('z'),
  }
}

// ---------------------------------------------------------------- foes

/**
 * What a foe does with these mechanics. A type changer (Arceus, Silvally, Ogerpon) picks its type against yours. A
 * trainer's ace — a leader's, the Elite Four's, a Champion's: the last of its strongest — Gigantamaxes in Galar, Mega
 * Evolves (Primal Reversion, Ultra Burst) in the regions whose games have it (Hoenn, Kalos, Alola), at Lv.50 and with
 * no gem, and uses a Z-Move in Alola. Only once the player has the mechanic too: a foe never shows one first.
 */
export function enemyPlanFor(
  save: SaveData,
  data: GameData,
  foe: { dex: number; level: number },
  trainer: { regionId: RegionId; role: TrainerRole; ace: boolean } | null,
): EnemyPlan | null {
  const plan: EnemyPlan = {}
  if (choiceFormsOf(data, foe.dex).length) plan.formChanges = true
  const cfg = data.config
  if (trainer?.ace && cfg.megaEvolution.trainerRoles.includes(trainer.role)) {
    const gmax = gmaxFormsOf(data, foe.dex)[0]
    const mega = megaOptions(data, foe.dex, foe.level)[0]
    if (gmax && gmaxUnlocked(save, data) && cfg.gigantamax.trainerRegions.includes(trainer.regionId))
      plan.gmax = gmax.dex
    else if (mega && megaUnlocked(save, data) && cfg.megaEvolution.trainerRegions.includes(trainer.regionId))
      plan.mega = mega.dex
    else if (zUnlocked(save, data) && cfg.zMove.trainerRegions.includes(trainer.regionId)) plan.z = true
  }
  return Object.keys(plan).length ? plan : null
}
