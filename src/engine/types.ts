// Core domain types shared by the engine, the seed script and the UI.
// Pure declarations — no runtime dependencies.

import type { Lang } from '@/i18n/langs'

export const POKE_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const
export type PokeType = (typeof POKE_TYPES)[number]
export type DieType = PokeType | 'base'
export const DIE_TYPES: readonly DieType[] = ['base', ...POKE_TYPES]

/** 'heal' is a self-effect (Grass): it never sits on a Pokémon, it resolves on the attack that rolled it. */
export const STATUS_KINDS = ['burn', 'poison', 'frozen', 'paralyze', 'confuse', 'heal'] as const
export type StatusKind = (typeof STATUS_KINDS)[number]

export type Face = { kind: 'number'; value: number } | { kind: 'status'; status: StatusKind; value: number }

export interface DiceTypeDef {
  type: DieType
  label: string
  color: string
  faces: Face[]
  /** A few words on what the die does, shown under its faces ("Stacking burn"). */
  description: string
  upgradeable: boolean
  countsForMajority: boolean
  sortOrder: number
}

export interface DiceEntry {
  type: DieType
  count: number
}

export type MilestoneEffect = 'UPGRADE_DIE' | 'REPLACE_DIE' | 'ADD_REROLL' | 'ADD_DIE' | 'ADD_HP' | 'EVOLVE'
export interface Milestone {
  level: number
  effect: MilestoneEffect
  /** UPGRADE_DIE / REPLACE_DIE / ADD_DIE target type; defaults to the species' Type 1. */
  dieType?: DieType
  /** REPLACE_DIE source type — the die that gets swapped out; defaults to 'base'. */
  fromDieType?: DieType
  /** ADD_REROLL / ADD_HP amount; defaults to 1 / 0. */
  amount?: number
}

export interface Evolution {
  toDex: number
  /** Evolves on reaching this level… */
  level: number | null
  /** …or when this item (an evolution stone's key) is used on it — then `level` is null. */
  item?: string | null
  /** Only while the player is in this region (Pikachu → Alolan Raichu in Alola). */
  region?: RegionId | null
  /** Never while the player is in this region — where a regional form takes its place (Pikachu → Raichu outside Alola). */
  notInRegion?: RegionId | null
}

/**
 * What kind of form a species row is, when it is not a plain species:
 * - `regional`: an Alolan, Galarian, Hisuian or Paldean form — a Pokémon of its own, caught, evolved and kept;
 * - `mega`: a Mega Evolution — battle only, from a Lv.50 Pokémon of species `of` once Mega Evolution is unlocked;
 * - `gmax`: a Gigantamax form — battle only, for a few turns, once Gigantamax is unlocked (never with a Mega);
 * - `battle`: another battle-only look (Giratina's Origin Forme, Arceus's types) the engine switches to mid-fight.
 */
export type FormKind = 'regional' | 'mega' | 'gmax' | 'battle'

export interface SpeciesForm {
  /** The species this is a form of: the national dex number for a regional form, the Pokémon that turns into it otherwise. */
  of: number
  kind: FormKind
  /** The region this form belongs to (its generation, for `regionOfSpecies`). Unset = the region of `of`. */
  region?: RegionId | null
  /**
   * Battle forms only — when the engine switches to it. `lowHp`: below half HP, swapping one `swapDie.from` die for a
   * `swapDie.to` one (Giratina). `choice`: picked from a menu, every die turning into the form's type (Arceus).
   */
  trigger?: 'lowHp' | 'choice' | null
  swapDie?: { from: DieType; to: DieType } | null
  /** A `mega` row that is a Primal Reversion or an Ultra Burst: the same rules, its own name in the game. */
  mechanic?: 'primal' | 'ultra' | null
}

export interface Species {
  dex: number
  name: string
  type1: PokeType
  type2: PokeType | null
  baseHp: number
  maxHp: number
  speed: number
  spriteUrl: string
  dice: DiceEntry[]
  rerolls: number
  /** 1 (always caught) … 9 (legendary): the catch die plus a ball's bonus must reach it. */
  catchValue: number
  evolutions: Evolution[]
  milestones: Milestone[]
  notes?: string | null
  /** Set on every form row (regional, Mega, battle); absent on a plain species. */
  form?: SpeciesForm | null
}

export interface TypeChartRow {
  attacking: PokeType
  defending: PokeType
  multiplier: number
}

export const COMBO_KEYS = [
  'pair',
  'two_pair',
  'three_kind',
  'small_straight',
  'full_house',
  'four_kind',
  'full_straight',
  'five_kind',
] as const
export type ComboKey = (typeof COMBO_KEYS)[number]

export const COMBO_NAMES: Record<ComboKey, string> = {
  pair: 'Pair',
  two_pair: 'Two Pair',
  three_kind: 'Three of a Kind',
  small_straight: 'Small Straight',
  full_house: 'Full House',
  four_kind: 'Four of a Kind',
  full_straight: 'Full Straight',
  five_kind: 'Five of a Kind',
}

export interface ComboUpgradeRow {
  comboKey: ComboKey
  level: number
  bonus: number
  cost: number
}

export interface DieUpgradeRow {
  dieType: PokeType
  level: number
  bonus: number
  cost: number
}

/** 'casino': the Game Corner — a slot machine the player can play as long as they like (Rocket Hideout). */
export const ENCOUNTER_KINDS = ['wild', 'trainer', 'center', 'item', 'casino'] as const
export type EncounterKind = (typeof ENCOUNTER_KINDS)[number]
/** Cards in an area's encounter deck; 'legend' is a fled legendary coming back (one per deck until it's caught). */
export type DeckCard = EncounterKind | 'legend'

export interface WildPoolEntry {
  id: string
  dex: number
  weight: number
  minLevel: number
  maxLevel: number
}

export interface TrainerPoolEntry {
  id: string
  trainerId: string
  weight: number
}

/** One line of an area's loot table: an item (or Pokédollars, itemKey 'money'), how often, how many, once or not. */
export interface LootEntry {
  id: string
  itemKey: string
  weight: number
  /** Found once per save: struck off the area's table after that. */
  unique: boolean
  /** Quantity found (for money: the ₽ amount), drawn between these. */
  minQty: number
  maxQty: number
}

/** Battle scenes (public/battle/*.png). */
export const BATTLE_BACKGROUNDS = ['grass', 'sea', 'water', 'rock', 'default'] as const
export type BattleBackground = (typeof BATTLE_BACKGROUNDS)[number]

export interface BossDef {
  dex: number
  level: number
  /** Victory Road style: the boss triggers when the team's average level reaches this, instead of once every round is done. */
  teamAvgThreshold?: number
  /** Upgrade level this legendary fights at; unset = the area's. */
  upgradeLevel?: number | null
  /** Battle scene for this legendary; unset = the area's. */
  battleBackground?: BattleBackground | null
  /**
   * Always shiny (the Red Gyarados kind of legendary): colours only, nothing about the fight changes. Without it, each
   * appearance rolls the wild odds (`shinyChance`).
   */
  shiny?: boolean
  /**
   * A progression raid (docs/24): fought as a raid in this area once the area is completed, never as a boss, and
   * caught nowhere else here. Only while Raid Battles are switched on for the player; otherwise a boss as before.
   */
  raid?: boolean
}

/** Levels relative to the team average, both ends included: { min: -15, max: -10 } = 15 to 10 levels below. */
export interface LevelOffsetRange {
  min: number
  max: number
}

/** Per kind of foe; a kind left out (or null) keeps ± game_config.scaleLevelSpread. */
export interface ScaleOffsets {
  wild?: LevelOffsetRange | null
  trainer?: LevelOffsetRange | null
}

export interface Area {
  id: string
  orderIndex: number
  /** Which region's chain this area belongs to. Absent in older data = 'kanto' (see `regionOfArea`). */
  regionId?: RegionId
  name: string
  bannerUrl: string | null
  /** Rounds (full encounter decks) to complete before the gym / legendary waits and the area can clear. Null = never clears (secret areas). */
  roundsToClear: number | null
  minLevel: number
  maxLevel: number
  encounterWeights: Record<EncounterKind, number>
  backtrackMultiplier: number
  legendaryBoss: BossDef[] | null
  scalesToTeam: boolean
  /** scalesToTeam areas: where foe levels fall around the team average. Unset = ± game_config.scaleLevelSpread. */
  scaleOffsets?: ScaleOffsets | null
  /** Easy areas send a Center next whenever a team member is K.O. */
  easyMode: boolean
  /** Upgrade level (dice and combos) of every foe here; null = game_config.enemyUpgradeLevel. */
  enemyUpgradeLevel: number | null
  /** Battle scene of every fight here (trainers and legendaries may override it); null = 'default'. */
  battleBackground: BattleBackground | null
  /** Hidden areas sit outside the linear chain and unlock when every condition holds. */
  hidden: boolean
  unlockConditions: UnlockCondition[] | null
  /** Gym / Elite trainers fought in order once every round is done; all must fall for the area to clear. */
  gyms: string[]
  wildPool: WildPoolEntry[]
  trainerPool: TrainerPoolEntry[]
  lootPool: LootEntry[]
}

export type UnlockCondition =
  | { kind: 'pokedex'; count: number }
  | { kind: 'maxLevel'; level: number }
  /** Another area is open (reached) — e.g. the Rocket Hideout once Celadon's area is. */
  | { kind: 'area'; areaId: string }
  /** Another area is cleared — e.g. a small world's league beaten, every main area done (docs/26 §2.5). */
  | { kind: 'cleared'; areaId: string }

/**
 * The roaming legendaries. They have no area of their own: once every Pokémon in `requires` has been **caught**, each
 * one that is still uncaught has `chance` of replacing any wild encounter in `regionId`. Catch it and it stops
 * appearing; let it flee and it goes back into the pool.
 */
export interface RoamerConfig {
  regionId: RegionId
  /** Species that must be in the Pokédex first — caught, not merely beaten. */
  requires: number[]
  /** Per roamer, per wild encounter. */
  chance: number
  level: number
  dex: number[]
}

/** One slot machine result: its share of spins (a weight) and the Pokédollars it pays. */
export interface SlotOutcome {
  weight: number
  gold: number
}

/**
 * The Game Corner slot machine. Three reels of Poké Balls and the prize Pokémon; the result is drawn from these
 * weights first, then the reels are laid out to show it (1, 2 or 3 balls — or 3 prize Pokémon, the jackpot).
 */
export interface SlotMachineConfig {
  /** Pokédollars per spin. */
  cost: number
  oneBall: SlotOutcome
  twoBalls: SlotOutcome
  threeBalls: SlotOutcome
  /** Three prize Pokémon: the prize joins you (its gold is paid instead when you already own one at that level or above). */
  jackpot: SlotOutcome
  prizeDex: number
  prizeLevel: number
}

/**
 * The Pokémon Day Care, one for every region (docs/15): your Pokémon gain XP in real time, friends' Pokémon visit, and
 * a compatible pair leaves an Egg at each check.
 */
export interface DayCareConfig {
  /** Opens (with a free Egg) once this many distinct species are caught, counted across every region's Pokédex. */
  unlockPokedex: number
  /** How many of your Pokémon can stay at once. */
  slots: number
  /** How many Pokémon from friends' Day Cares can visit at once. */
  friendSlots: number
  /** XP a resident gains every `tickMinutes` of real time, all the way to the level cap. */
  xpPerTick: number
  tickMinutes: number
  /** Hours between two Egg-group checks: each pair sharing a group can leave an Egg. */
  breedHours: number
  /** Hours between two checks of the pairs with a Ditto in them (Ditto pairs with all but legendaries, slower). */
  breedDittoHours: number
  /** ₽ for Egg now: the next check runs at once and its Egg hatches. */
  rushPrice: number
  /** ₽ the Day Care couple gives when a hatchling isn't kept (you own a plain copy at its level or higher). */
  notKeptGold: number
  /** Chance (0–1) that a Day Care Egg hatches shiny (the wild `shinyChance` is separate). */
  shinyChance: number
  /** Eggs favour species missing from the Pokédex: their weight is this, an owned species' is 1. */
  unownedWeight: number
  /** A hatchling's level: the `hatchRank`-th lowest level you own, minus `hatchOffset`, never below `hatchMinLevel`. */
  hatchRank: number
  hatchOffset: number
  hatchMinLevel: number
}

export interface TrainerMon {
  dex: number
  level: number
  /** The potion this Pokémon holds in a fight (at most one): dealt from the trainer's `items` to its strongest. */
  item?: string
  /** Shiny colours (cosmetic only), set per trainer in the admin. */
  shiny?: boolean
}

export type TrainerRole = 'trainer' | 'leader' | 'elite' | 'champion'

export interface Trainer {
  id: string
  name: string
  spriteUrl: string | null
  team: TrainerMon[]
  role: TrainerRole
  /** Gym leaders award a badge. */
  badge: string | null
  /** Upgrade level this trainer's Pokémon fight at; null = the area's. */
  upgradeLevel: number | null
  /** Battle scene for this trainer's fights (a gym's floor…); null = the area's. */
  battleBackground: BattleBackground | null
  /**
   * Potions the trainer carries (item keys; other items are ignored). Each goes to one Pokémon, highest level first —
   * the best potion to the strongest — and it drinks it when a hit could K.O. it. Missing or empty = none.
   */
  items?: string[] | null
  /**
   * Rival version: this trainer only appears to players who started with this Pokémon (1, 4 or 7), under the name and
   * sprite of the character the player didn't pick. An area lists one version per starter; the others are skipped.
   */
  rivalOf?: number | null
}

export type CurableStatus = 'burn' | 'poison' | 'frozen' | 'paralyze' | 'confuse'

export type ItemEffect =
  /** HP, in battle or from the Team screen. */
  | { kind: 'heal'; amount: number }
  /** Status heals — battle only (statuses clear when a battle ends). */
  | { kind: 'cure'; statuses: CurableStatus[] }
  /** Ether / Max Ether: rerolls back, up to the Pokémon's max — battle only. */
  | { kind: 'rerolls'; amount: number }
  /** Revive / Max Revive: brings a K.O.'d Pokémon back with this % of its max HP, in battle or from the Team screen. */
  | { kind: 'revive'; percent: number }
  /** Evolution stones: evolve a Pokémon whose evolution names this item, from the Team screen. */
  | { kind: 'stone' }
  /** Fossils: found, never bought or sold. The Pokémon goes straight to the Box at `level` and revives after `hours`. */
  | { kind: 'fossil'; dex: number; level: number; hours: number }
  /** Rare Candy: levels, from the Team screen. */
  | { kind: 'level'; amount: number }
  /** Poké Balls: added to the catch die. */
  | { kind: 'ball'; bonus: number }
  /** The Link Cable: evolves a Pokémon that only evolves by trade (`trade.evolveOnTrade`), from the Team screen. */
  | { kind: 'link' }
  /**
   * The Bait: after a ball's throw falls short, its own die (these faces) is thrown and added to the total
   * (engine/catching). Never chosen from the bag: the catch offers it.
   */
  | { kind: 'bait'; faces: number[] }

export interface ItemDef {
  key: string
  name: string
  description: string | null
  spriteUrl: string | null
  price: number
  effect: ItemEffect
  /** Sold in the Poké Mart… */
  inShop: boolean
  /** …once the player holds this many badges… */
  shopBadges: number
  /** …and, when set, once this area is unlocked (e.g. Celadon's Dept. Store on Routes 7 & 8). */
  shopArea?: string | null
  /** The only region that stocks it. Unset = every region does. */
  region?: RegionId | null
  /** Sold once per region and never again, whether or not it has been used since. */
  unique?: boolean
}

export interface StatusRules {
  /** Burn and Poison hurt by a share of the victim's max HP each turn (at least 1): Burn `percentPerStack`% per stack. */
  burn: { threshold: number; percentPerStack: number; duration: number }
  poison: { threshold: number; percent: number; duration: number }
  frozen: { threshold: number; stunTurns: number }
  paralyze: { threshold: number; stunTurns: number }
  /** Confusion: the victim's next attack still lands, then it takes `recoilPercent`% of its max HP as recoil. */
  confuse: { threshold: number; recoilPercent: number }
  /** Heal faces: at the threshold the attacker heals itself, on top of the damage it deals. */
  heal: { threshold: number; amount: 'rollTotal' | 'healFaces' }
}

export type SkipPolicy = 'free' | 'once' | 'none'

export interface EnergyConfig {
  /** Off = encounters are free and the counter is hidden. */
  enabled: boolean
  /** The cap, and what a new save starts with. */
  max: number
  /** Real-time minutes per point regained (offline too). */
  minutesPerEnergy: number
}

/** "Keep the game alive": Prof. Oak's donation pop-up (Admin → Config). */
export interface DonationConfig {
  /** Off = the pop-up never shows. It also stays hidden while `paypalUrl` is empty. */
  enabled: boolean
  /** Where the PayPal button leads (a paypal.me or donate link). */
  paypalUrl: string
  /** Bumped by the admin's reset: every player who has already seen the pop-up gets it once more. */
  round: number
}

/** The special events (docs/18, docs/19), in the order they open: the Fortune Wheel, Raid Battles, the Elite Rebattle. */
export const EVENT_IDS = ['wheel', 'raid', 'rebattle'] as const
export type EventId = (typeof EVENT_IDS)[number]

/**
 * Each event type's switch in the admin (the user's rule, 2026-10-11): off (nowhere in the game), on for the admin only
 * (to try it in production first), on for everyone. Off by default.
 */
export const EVENT_ACCESS = ['off', 'admin', 'all'] as const
export type EventAccess = (typeof EVENT_ACCESS)[number]

/** What every event has, whatever it does (Admin → Events). */
export interface EventDef {
  /** Off = the event is nowhere in the game: no square on Home, no page, no pop-up. Admin = only the admin sees it. */
  access: EventAccess
  /** Order of the squares on Home: lower comes first. */
  priority: number
  /**
   * The area whose clearing opens it, in any region (the wheel: Routes 7 & 8, the raids: the Safari Zone). Null for the
   * rebattle, which each region's league opens for that region.
   */
  unlockAreaId: string | null
  /** Its picture, for the page's banner and the unlock pop-up: an area picture's key (public/area-art) or a path. */
  banner: string
  /** The unlock pop-up's 2–4 rules: strings.csv keys. They read their numbers from this config (engine/events ruleParams). */
  rules: string[]
}

export type WheelReward = { kind: 'gold'; amount: number } | { kind: 'item'; key: string; qty: number }

/** One prize of the Fortune Wheel: it takes `count` equal slices, each won `odds` % of the time. */
export interface WheelPrize {
  reward: WheelReward
  count: number
  odds: number
}

export const REBATTLE_TIER_IDS = ['bronze', 'silver', 'gold', 'diamond'] as const
export type RebattleTierId = (typeof REBATTLE_TIER_IDS)[number]

/** One tier of the Elite Rebattle: its ₽ multiplier and how far above the League's its upgrade level goes. */
export interface RebattleTier {
  id: RebattleTierId
  /** Every K.O. pays a League trainer's ₽ × this (once per Pokémon per tier). */
  gold: number
  /** Upgrade levels above the League's, or 'max' (10). A trainer's own upgrade level wins over it. */
  upgradeDelta: number | 'max'
}

/** A mythical and its lair: its boss area, where its shiny raid of the calendar is fought too. */
export interface RaidPoolEntry {
  dex: number
  areaId: string
}

/** A fixed date of the raid calendar: 'MM-DD', every year (Pokémon Day's shiny Pikachu, Earth Day's Celebi…). */
export interface RaidAnchor {
  date: string
  dex: number
  shiny: boolean
}

/** One raid Pokémon's own numbers (Admin → Events → Raids), over the defaults; a missing one uses the default. */
export interface RaidMonRules {
  bars?: number
  barHp?: number
  level?: number
  upgradeLevel?: number
}

/** What a super-effective, a resisted and a blocked hit land at in a raid, instead of ×2, ×½ and ×0. */
export interface RaidTypeScale {
  super: number
  resisted: number
  immune: number
}

/** A day of the raid calendar set by hand ('YYYY-MM-DD' → its raid). */
export interface RaidOverride {
  dex: number
  shiny: boolean
}

/** Raid Battles' numbers (docs/18 §3). */
export interface RaidConfig {
  /** HP bars, each the boss's full HP at `level`; their colours, first to last. */
  bars: number
  /** Each bar's HP, in the raid Pokémon's own max HP at `level` (1 = one full HP bar each). */
  barHp: number
  barColors: string[]
  /**
   * The raid's type matchups (the user's design, 2026-10-13): the sides' attacks on the raid Pokémon (super effective
   * only ×1.3), and its own on the sides (resisted ×0.7, and nobody is immune: ×0.5).
   */
  sideTypes: RaidTypeScale
  bossTypes: RaidTypeScale
  /** The raid Pokémon's level and dice / combo upgrade level. */
  level: number
  upgradeLevel: number
  /** The sides' Pokémon fight at this level at most, at this upgrade level. */
  teamCap: number
  sideUpgradeLevel: number
  /** Friends a raid can bring (the other sides are NPC trainers). */
  maxFriends: number
  /** Gifts a helper can get a day, and what they are. */
  helperDailyCap: number
  gifts: { key: string; weight: number }[]
  /** The mythicals (each a shiny raid of the calendar, a boss never shiny in its lair) and their lairs. */
  pool: RaidPoolEntry[]
  /**
   * Progression raids (docs/24): an area's raid boss, fought there once the area is completed. Its numbers are the
   * raid's over these: the sides' level cap, and each raid Pokémon's own (level, bars… and its own team cap).
   */
  progress: { teamCap: number; perMon?: Record<string, RaidMonRules & { teamCap?: number }> }
  /**
   * The calendar: its fixed dates, the lowest level a shiny filler's area may start at, the seed (by the day it applies
   * from: a new one re-plans only the days after it) and the days set by hand.
   */
  calendar: {
    anchors: RaidAnchor[]
    fillerMinLevel: number
    seeds?: { from: string; seed: number }[]
    overrides?: Record<string, RaidOverride>
  }
  /** Each raid Pokémon's own numbers, by dex. */
  perMon?: Record<string, RaidMonRules>
  /** Never an NPC ally, on top of legendaries, mythicals and starter lines. */
  exclude: { pseudo: number[]; extra: number[] }
}

/** Each region's rebattle lineups: per tier, the trainer ids in fight order (scripts/rebattle-teams.ts). */
export type RebattleLineups = Record<string, Partial<Record<RebattleTierId, string[]>>>

export interface EventsConfig {
  /** Home shows a locked "Special events" square from this many Kanto badges until the first event opens. */
  teaserBadges: number
  wheel: EventDef & { prizes: WheelPrize[] }
  raid: EventDef & RaidConfig
  rebattle: EventDef & { tiers: RebattleTier[] }
}

/** Live events (docs/20): the kinds the admin can schedule. */
export const LIVE_TYPES = ['shiny', 'shop', 'cash'] as const
export type LiveType = (typeof LIVE_TYPES)[number]

/** One item of a Special Shop: its event price, how many each player may buy (null = no limit), where it's sold. */
export interface LiveShopItem {
  key: string
  price: number
  limit: number | null
  /** Sold while the player plays one of these regions; 'all' = everywhere. */
  regions: RegionId[] | 'all'
}

/**
 * A live event (docs/20): the whole game changes for a while, the same for everyone, between `start` and `end` (ISO,
 * UTC, server time). Only the settings of its `type` count; the others stay so switching type back keeps them.
 */
export interface LiveEvent {
  /** Stable: the pop-up's "seen" and the shop's per-player counts are kept by it. */
  id: string
  type: LiveType
  start: string
  end: string
  /** Its picture on Home, in the pop-up and over the shop's section: an area picture's key or a path. */
  banner: string
  /** A custom title for an occasion, per language (others fall back to English); empty = the type's own name. */
  title: Partial<Record<string, string>>
  /** Shown (and in effect) from this many badges, every region's counted. */
  minBadges: number
  /** Shiny Parade: wild shiny odds × `multiplier` in some areas, one region or everywhere. */
  shiny: { multiplier: number; scope: 'areas' | 'region' | 'all'; areaIds: string[]; regionId: RegionId | null }
  /** Special Shop: its items. */
  shop: { items: LiveShopItem[] }
  /** Cash Flow: every ₽ earned × `multiplier` (1.5 = +50 %), selling excluded. */
  cash: { multiplier: number }
}

export interface GameConfig {
  configVersion: number
  xpCurve: { A: number; B: number; C: number }
  xpShareMode: 'fighter' | 'team'
  maxTeamSize: number
  maxLevel: number
  comboPayoutMode: 'highestDamage' | 'highestRank'
  skipPolicy: SkipPolicy
  /** No way out of a fight: no FLEE / AVOID on the encounter pop-up and no RUN in battle (overrides skipPolicy). */
  noEscape: boolean
  starters: number[]
  starterLevel: number
  /**
   * × every Pokémon's max HP, the player's and the foes' — the fight-length knob. Damage is never scaled: a hit is
   * exactly what the dice show.
   */
  hpMultiplier: number
  /** Global multiplier on trainer gold — the economy's pacing knob (Phase 10). */
  goldMultiplier: number
  /** Extra gold multiplier for gym leaders, the Elite Four and the Champion. */
  gymGoldMultiplier: number
  /** First encounter of an area is a Center when anyone is hurt. */
  forcedCenterWhenHurt: boolean
  /**
   * 'deck': each area deals its encounters from a shuffled deck, so every deck holds the area's exact mix and a Center
   * is never more than two decks away. 'random': every encounter is rolled independently from the weights.
   */
  encounterMode: 'deck' | 'random'
  /** A new game's bag, item key → quantity. */
  startInventory: Record<string, number>
  /** scalesToTeam areas draw enemy levels from teamAverage ± this. */
  scaleLevelSpread: number
  /** Combo and die track level used by every wild/trainer Pokémon (the player's tracks are theirs alone). */
  enemyUpgradeLevel: number
  /** Versus: every combo and die track of both sides is at this level; nobody brings their own upgrades. */
  versusUpgradeLevel: number
  /** Switching the active Pokémon on your own turn (costs the turn). Switching after a faint is always free. */
  allowVoluntarySwitch: boolean
  /** Safety valve: two Pokémon immune to each other's every die would otherwise fight forever. Ends in a stalemate. */
  maxBattleTurns: number
  /** Multi EXP: team members who didn't fight get this fraction of each K.O.'s XP (0 = feature off). Players toggle it. */
  multiExpShare: number
  /** …plus this much per level the bench Pokémon is below the fighter (catch-up)… */
  multiExpGapBonus: number
  /** …up to this share (1 = as much as the fighter). */
  multiExpMaxShare: number
  /** × the XP a K.O. gives (the foe's level × this), to the Pokémon and to the area's exploration alike. */
  xpMultiplier: number
  /** Show the round gauge on the area screen: one segment per card of the area's deck, icons for those already met. */
  showRoundGauge: boolean
  /** Under the round gauge, reveal what's ahead: an icon for each card still in the deck, and the gym / legendary at the end. */
  showRoundPreview: boolean
  /** Chance (0–1) that a wild Pokémon is shiny: only its sprites change. */
  shinyChance: number
  /** Signed-in players' save goes to the cloud at most this often (minutes) while they play; SYNC ONLINE does it now. */
  cloudSyncMinutes: number
  /** Friends each player can have (both sides of a friendship count it). The database reads the same key. */
  maxFriends: number
  /** Energy: 1 per encounter discovered (not gyms, legendaries or Pokémon Centers), refilled over time. */
  energy: EnergyConfig
  status: StatusRules
  ai: { samples: number; rerollGainThreshold: number }
  slotMachine: SlotMachineConfig
  dayCare: DayCareConfig
  roamers: RoamerConfig
  donation: DonationConfig
  /** The community Discord's invite link (Admin → Config): a button in the player menu. Empty = no button. */
  discordUrl: string
  megaEvolution: MegaConfig
  gigantamax: GigantamaxConfig
  /** Arceus, Silvally and Ogerpon can each change type this many times per battle (the TYPE menu). */
  formChangesPerBattle: number
  /** Once-only finds get likelier the more rounds a player has done in their area. */
  uniquePity: PityConfig
  /** Wild Pokémon not caught yet get likelier the more rounds a player has done in their area. */
  newPokemonPity: PityConfig
  /** The special events (docs/18): one game_config row for all of them. */
  events: EventsConfig
  /** The Elite Rebattle's trainers, per region and tier (a row of its own, written by scripts/rebattle-teams.ts). */
  rebattleLineups: RebattleLineups
  /** Extreme mode (docs/22): the second save's rules. */
  extreme: ExtremeConfig
  /** Live events (docs/20): their switch, and the admin's list, past, running and to come; one runs at a time. */
  liveEvents: { access: EventAccess; list: LiveEvent[] }
  /** Trades (docs/23): their switch and numbers, a game_config row of its own that seeding never writes. */
  trade: TradeConfig
  /** Small worlds (docs/21): their switch, and the admin's list, past, running and to come; one runs at a time. */
  smallWorlds: { access: EventAccess; list: SmallWorld[] }
  /** Gifts with the developer's messages (docs/15 §23): their switch. The server reads the same row. */
  gifts: GiftsConfig
  /**
   * Items with a switch of their own (docs/15 §20), by item key: the Link Cable and the Bait (docs/25). An item
   * switched off is nowhere: not sold, not found, not usable. Items without an entry are always on.
   */
  itemSwitches: Record<string, EventAccess>
  /** The General upgrades (docs/25): their switch and numbers, a game_config row of its own that seeding never writes. */
  general: GeneralConfig
  /** Friend invite rewards (docs/15 §25): their switch and the gauge's tiers. The server reads the same row. */
  inviteRewards: InviteRewardsConfig
  /** Push notifications (docs/27): their switch, a game_config row of its own that seeding never writes. */
  push: PushConfig
}

/**
 * Push notifications (docs/27-PUSH-NOTIFICATIONS.md): a Day Care Egg, the day's raid, a live event starting. The server
 * reads the same row: it takes no subscription and sends nothing while the switch is off.
 */
export interface PushConfig {
  /** The switch (docs/15 §20): off (nowhere in the game), on for the admin only, on for everyone. Off by default. */
  access: EventAccess
  /** The local hour the day's raid is announced at (it opens at midnight UTC, the middle of the night for many). */
  raidHour: number
  /** No Egg is announced between these local hours (from, to): it waits until `to`. Equal hours = no quiet time. */
  quietHours: [number, number]
}

/**
 * Friend invite rewards (docs/15 §25): each new player a player invites (their invite link) who wins their first badge
 * fills a gauge; each tier reached gives its gifts once, opened like the developer's gifts.
 */
export interface InviteRewardsConfig {
  /** The switch (docs/15 §20): off (nowhere in the game, no invite counted), on for the admin only, on for everyone. */
  access: EventAccess
  /** The gauge's stops, fewest friends first (engine/invites.ts cleans them): `friends` invited with a badge → `gifts`. */
  tiers: InviteTier[]
}

/** One stop on the invite gauge: this many invited players with their first badge, and what it gives. */
export interface InviteTier {
  friends: number
  gifts: Gift[]
}

/** The invite rewards a save has opened (docs/15 §25). */
export interface InvitesSave {
  /** Tiers (by their number of friends) whose gifts are in this save already: a tier is put in once. */
  done: number[]
  /** The rules pop-up has been shown (once, when the rewards open; INFO on the Friends page shows it again). */
  rulesSeen?: boolean
}

/** Gifts with the developer's messages (docs/15 §23). */
export interface GiftsConfig {
  /** The switch (docs/15 §20): off (no gift shows or opens; they wait), on for the admin only, on for everyone. */
  access: EventAccess
}

/** A gift's region: a region's id, or `'latest'`, the newest region the player has started (engine/gifts.ts). */
export type GiftRegion = string

/**
 * One gift on a message, as the admin set it (Admin → Messages, or a player's profile): an item and how many, a
 * Pokémon at a level, shiny or not, or Pokédollars. Each goes to its region's Bag, Box or ₽.
 */
export type Gift =
  | { kind: 'item'; key: string; qty: number; region: GiftRegion }
  | { kind: 'pokemon'; dex: number; level: number; shiny?: boolean; region: GiftRegion }
  | { kind: 'gold'; amount: number; region: GiftRegion }

/** The gifts a save has opened (docs/15 §23). */
export interface GiftsSave {
  /** Messages whose gifts are in this save already (the last 100): a gift is put in once. */
  done: number[]
  /** The rules pop-up has been shown (once, before the first gift opens; INFO shows it again). */
  rulesSeen?: boolean
}

/**
 * The Upgrades screen's General tab (docs/25): slow, very expensive upgrades bought with any region's ₽ and kept for
 * every region. The server reads `access` too (the golden name).
 */
export interface GeneralConfig {
  /** The switch (docs/15 §20): off (nowhere in the game), on for the admin only, on for everyone. Off by default. */
  access: EventAccess
  /** Capture Luck, one row per level: % chance a wild Pokémon that broke free stays for one more throw, and its price. */
  luck: { chance: number; cost: number }[]
  /** Offline earnings, one row per level: ₽ per hour spent out of the game, and its price. */
  offline: { perHour: number; cost: number }[]
  /** An absence earns for this many hours at most. */
  offlineMaxHours: number
  /** "I am just rich": its price. A golden name in every social feature, nothing else. */
  richCost: number
}

/** Trades (docs/23-TRADING-PLAN.md): listings, like the games' GTS. The server reads the same row. */
export interface TradeConfig {
  /** The switch (docs/15 §20): off (nowhere in the game), on for the admin only, on for everyone. Off by default. */
  access: EventAccess
  /** Open listings a player can have at once. */
  maxListings: number
  /** A listing nobody takes ends after this many days, and its Pokémon comes back. */
  listingDays: number
  /** Listings a player can take per UTC day. */
  tradesPerDay: number
  /** A traded Pokémon arrives at the level of the one given, at most this (unless its species only exists higher). */
  levelCap: number
  /** Badges needed to post or take, every region's counted together. */
  minBadges: number
  /** Trade evolutions, [from, to]: they evolve the moment they arrive in a trade, and never by level. */
  evolveOnTrade: [number, number][]
  /** Never tradable, on top of legendaries and mythicals (the Ultra Beasts by default). */
  exclude: number[]
}

/** One booster of a small world: every hit of this type, both sides', × `multiplier`. */
export interface WorldBooster {
  type: PokeType
  multiplier: number
}

/** One row of a small world's Mart: its price in the world's ₽, how many each player may buy (null = no limit). */
export interface WorldShopItem {
  key: string
  price: number
  limit: number | null
}

/**
 * A small world (docs/21): a time-limited, themed region of its own, built in the admin, where a shiny mythical is won.
 * Its region row (Config → Regions) holds its areas and trainers, which point at it like any region's; the rest of what
 * makes it a world is here. Between `start` and `end` (ISO, UTC, server time) it can be entered; when it ends, all of it
 * is gone but the mythical.
 */
export interface SmallWorld {
  /** Stable: a save keeps the world it holds by it. */
  id: string
  /** Its region: a region row whose dexRange overlaps no real region. */
  regionId: RegionId
  start: string
  end: string
  /** A custom title per language (others fall back to English); empty = the region's name. */
  title: Partial<Record<string, string>>
  /** Its picture on Home, in the pop-ups and over its Mart: an area picture's key or a path. */
  banner: string
  /** The colours Home wears inside it: the main colour, an accent, the ground's tint (CSS colours). */
  theme: { main: string; accent: string; ground: string }
  /** Shown (and open) from this many badges, every region's counted. */
  minBadges: number
  /** The three partners offered for the fresh start (at the region's starter level). */
  starters: number[]
  /** × every XP earned in the world. */
  xpMultiplier: number
  boosters: WorldBooster[]
  /** What its Mart sells, and nothing else. */
  shop: WorldShopItem[]
  /** The shiny mythical: the boss of `areaId` (an area of the world), at `level`. */
  mythical: { dex: number; level: number; areaId: string }
  /** Areas that open at a date-time (ISO, UTC) as well as when the one before is cleared. */
  opens: Record<string, string>
}

/**
 * Extreme mode (docs/22): a second save, opened by a league, with no Pokémon Centers, K.O.s that last hours, and
 * healing only while the player is out of the game.
 */
export interface ExtremeConfig {
  /**
   * The admin's switch, as for the events: off (nowhere: no pop-up, no title card, no menu row; Extreme saves are
   * kept), on for the admin only (to try it in production first), on for everyone. Off by default.
   */
  access: EventAccess
  /** The region whose league opens it in the main save ("the second league"). */
  unlockRegion: RegionId
  /** Pokémon Centers in the encounter deck, as in the main game. */
  centers: boolean
  /** A lost round heals the team, as in the main game. */
  wipeHeals: boolean
  /** Real hours a K.O. Pokémon rests before it comes back. */
  koHours: number
  /** The HP it comes back with. */
  koReviveHp: number
  /** % of max HP healed per hour spent out of the game (0 = never). */
  awayHealPctPerHour: number
  /** Absences shorter than this (minutes) don't heal. */
  awayMinMinutes: number
  /** Potions and Revives can be used. */
  items: boolean
}

/**
 * Pity for what a player hasn't got from an area yet: past `startRounds` rounds done there, the chance that an item
 * find is one of its once-only finds (`uniquePity`), or that a wild Pokémon is one not caught yet (`newPokemonPity`),
 * rises linearly to `maxMultiplier` × its usual odds at `fullRounds`, and stays there. It never passes 100 %.
 */
export interface PityConfig {
  /** Rounds done in the area before the odds start to rise (×1 up to here). */
  startRounds: number
  /** Rounds done at which the odds reach `maxMultiplier`. */
  fullRounds: number
  /** × the usual odds from `fullRounds` on. 1 = no pity. */
  maxMultiplier: number
}

/** Gigantamax: a button in battle once the player has reached `region`; never in the same battle as a Mega. */
export interface GigantamaxConfig {
  region: RegionId
  /** It lasts this many of the Pokémon's own turns, then it shrinks back (or when it leaves the field). */
  turns: number
  /** Trainers Gigantamax their ace in these regions (leaders, Elite Four, Champions), once the player has it too. */
  trainerRegions: RegionId[]
}

/** Mega Evolution: no stone, no item — a button in battle, once the player has reached `region`. */
export interface MegaConfig {
  /** Starting this region (or being past it) turns Mega Evolution on, in every region. */
  region: RegionId
  /** The Pokémon must be at least this level. */
  level: number
  /** Mega Evolutions (or Gigantamax) per battle, for the whole team. */
  perBattle: number
  /** Trainers Mega Evolve their ace in these regions (leaders, Elite Four, Champions), once the player has it too. */
  trainerRegions: RegionId[]
  /** Trainer roles that use Mega Evolution and Gigantamax. */
  trainerRoles: TrainerRole[]
}

// ---------------------------------------------------------------- save data (01-GAME-SPEC §9)

export interface PokemonInstance {
  id: string
  dex: number
  level: number
  /** XP accumulated towards the next level. */
  xp: number
  currentHp: number
  caughtAt: number
  /** Shiny colours (cosmetic only). */
  shiny?: boolean
  /** A fossil being revived: it waits in the Box until this time (ms) — no team, no items, no Day Care, not in the Pokédex yet. */
  revivesAt?: number
  /** The fossil item it came from (for its picture while it revives). */
  fossil?: string
  /** Extreme mode: when it was K.O. (ms, server time). It rests until `koHours` later. Absent = not on the clock. */
  koAt?: number
  /** The name its trainer gave it (`engine/nickname.ts`). It goes with it in a trade; absent = its species' name. */
  nickname?: string
}

export interface AreaProgress {
  /** Rounds completed here (a round counts once its last card is dealt with; a wipe loses the round in progress). */
  roundsDone: number
  /** The current round has already been counted (its deck ran out): don't count it twice. */
  roundCounted?: boolean
  /** Exploration XP from before rounds replaced the gauge: converted to `roundsDone` on load, then dropped. */
  xp?: number
  cleared: boolean
  bossDefeated: boolean
  /** Dex numbers of this area's legendary bosses already beaten. */
  bossesDefeated: number[]
  /**
   * Dex numbers of this area's bosses caught here. In a small world each boss is its own catch (docs/26 §2.5), so it
   * stays catchable until this says so, whatever the Pokédex holds; elsewhere the Pokédex decides.
   */
  bossesCaught?: number[]
  /** Trainer ids of this area's gym / Elite battles already won. */
  gymsDefeated: string[]
  /** Encounter cards left in this area's current deck (drawn from the end). Dealt afresh when empty. */
  deck?: DeckCard[]
  /** Loot entry ids left in this area's loot deck. */
  lootDeck?: string[]
  /** Unique loot entries already found here. */
  uniqueFound?: string[]
  /** Rounds started here. A round is one full encounter deck, opened by a Pokémon Center when one would help. */
  round?: number
  /** Cards met so far this round, in order (the round gauge shows them). */
  drawn?: DeckCard[]
  /** The last encounter here was a Pokémon Center: the next one can't be (no two Centers in a row). */
  lastCenter?: boolean
}

export interface SaveData {
  version: 1
  updatedAt: number
  gold: number
  pokedex: number[]
  box: PokemonInstance[]
  team: string[]
  inventory: Record<string, number>
  comboLevels: Record<ComboKey, number>
  dieLevels: Record<PokeType, number>
  currentAreaId: string
  areaProgress: Record<string, AreaProgress>
  settings: {
    /** Superseded by `sound` (src/save/storage.ts). */
    sfx: boolean
    sound?: boolean
    reducedMotion: boolean
    animations?: 'full' | 'short'
    multiExp: boolean
    autoMode?: boolean
    /** Raids: the ally sides' turns at 1.5× speed. */
    raidFast?: boolean
    lang?: Lang
    theme?: 'light' | 'dark' | 'auto'
  }
  /** The hpMultiplier current HP was last measured against (absent = ×1), so a change keeps every HP %. */
  hpScale?: number
  /** Who the player is: a name and one of the two trainer sprites (absent on older saves = Red, no name). */
  player?: PlayerProfile
  /**
   * The Day Care, one for every region whichever is live: who's staying (out of their region's team and Box
   * meanwhile), friends' visitors, the two check clocks and the Egg waiting.
   */
  dayCare?: DayCareState
  /** Residents the Day Care sent home when it had too many (the move to one Day Care): one toast, then cleared. */
  dayCareNotice?: { dex: number[] }
  /** When the admin last edited this save (cheats): that cloud save then wins the next sync, even with less progress. */
  adminEditAt?: number
  /** Energy held at `at` (ms); it refills from there (see engine/energy). Absent = full. */
  energy?: { value: number; at: number }
  /** The player has opened the leaderboard (Prof. Oak sends them there once). */
  leaderboardVisited?: boolean
  /** Versus's rules pop-up has been shown (once, when Versus opens; its INFO button shows them again). */
  versusRulesSeen?: boolean
  /** The region being played. Absent on saves from before the second region = 'kanto'. */
  region?: RegionId
  /** The regions not being played, each holding everything that region owns. */
  parked?: Partial<Record<RegionId, RegionSave>>
  /** Legacy: regions folded forward by a league, back when that happened. Read by nothing — regions never pool now. */
  merged?: RegionId[]
  /** Keys of the `unique` items the Mart has already sold here. They never come back, used or not. */
  boughtUnique?: string[]
  /** The regions whose donation pop-up was shown, in the admin's current reset round (engine/donation). */
  donationSeen?: { round: number; regions: RegionId[] }
  /** The regions whose "a new region is open" pop-up has been closed: it opens by itself once per region. */
  regionOfferSeen?: RegionId[]
  /** The special events (docs/18): what's been seen and done. Shared by every region; absent = nothing yet. */
  events?: EventsSave
  /** Which save this is (docs/22). Absent = the main one, so every save from before is main. */
  mode?: SaveMode
  /** An Extreme save's away-healing bookkeeping. */
  extreme?: ExtremeSave
  /** Main save: when the unlock league was first seen done. Extreme mode stays open from then on. */
  extremeUnlockedAt?: number
  /** Main save: Extreme mode's rules pop-up has been shown (once, when it opens; INFO shows it again). */
  extremeRulesSeen?: boolean
  /** Trades (docs/23): listed Pokémon, the trades already applied, the last ones done. Absent = never traded. */
  trades?: TradesSave
  /** Gifts from the developer (docs/15 §23): the ones opened, and the rules seen. Absent = none yet. */
  gifts?: GiftsSave
  /** Friend invite rewards (docs/15 §25): the tiers opened, and the rules seen. Absent = none yet. */
  invites?: InvitesSave
  /** The General upgrades (docs/25), for every region of this save. Absent = none bought. */
  general?: GeneralSave
}

/** The General upgrades bought (docs/25), and the offline earnings' clock. */
export interface GeneralSave {
  /** Capture Luck's level (0 = none). */
  luck?: number
  /** Offline earnings' level (0 = none). */
  offline?: number
  /** "I am just rich": a golden name in the social features. */
  rich?: boolean
  /** The page went hidden or closed here (server time, ms): offline earnings run from then until the return. */
  awayFrom?: number
  /** Time (ms) the last absence spent towards a ₽ it didn't reach: it counts in the next one. */
  carryMs?: number
  /** The General tab's rules pop-up has been shown (once; INFO shows it again). */
  rulesSeen?: boolean
}

/** What a listing asks for (docs/23 §1.1): one species, any the poster doesn't own, or anything. */
export type TradeWant = { kind: 'species'; dex: number } | { kind: 'notOwned' } | { kind: 'any' }

export const TRADE_VISIBILITY = ['public', 'friends', 'private'] as const
/** Who sees a listing: the trade board (every signed-in player), friends only, or only people with its link. */
export type TradeVisibility = (typeof TRADE_VISIBILITY)[number]

/** A Pokémon on the trade board: out of its Box, frozen, still yours until the trade is done. */
export interface TradeOut {
  /** The server's listing id. */
  listing: string
  /** Its link's code. */
  code: string
  /** The region whose Box it left: it goes back there. */
  region: RegionId
  mon: PokemonInstance
  at: number
  endsAt: number
  want: TradeWant
  visibility: TradeVisibility
}

/** How a Pokémon that arrived was kept (the catch rule, docs/23 §1.4). */
export type TradeOutcome = 'new' | 'replaced' | 'merged' | 'shiny'

/** One trade done, for the Done list: who with, what went and what came. */
export interface TradeLogEntry {
  id: string
  at: number
  /** 'poster': your listing was taken; 'taker': you took theirs. */
  role: 'poster' | 'taker'
  /** The other trainer's name as it was then… */
  with: string
  /** …and whether it shone gold ("I am just rich", docs/25). */
  withRich?: boolean
  gave: { dex: number; level: number; shiny?: boolean; nickname?: string }
  /** The species that arrived, at the level it arrived at (before a trade evolution), and the name it came with. */
  got: { dex: number; level: number; shiny?: boolean; nickname?: string }
  evolvedTo?: number
  outcome: TradeOutcome
}

export interface TradesSave {
  out: TradeOut[]
  /** Trade ids already applied to this save (the last 50): a trade is applied exactly once. */
  done: string[]
  /** The last trades done, newest first. */
  log?: TradeLogEntry[]
  /** Your listings taken while you were away, not looked at yet: the gold dot. */
  unseen?: string[]
  /** The rules pop-up has been shown (once; INFO shows it again). */
  rulesSeen?: boolean
}

export type SaveMode = 'main' | 'extreme'

/** Time spent out of the game, waiting to heal (all in ms, server time). */
export interface ExtremeSave {
  /** The page went hidden or closed here, and hasn't been back since. */
  awayFrom?: number
  /** Absences already over but not healed yet (the player came back mid-fight, or the real time wasn't known). */
  pending?: [number, number][]
}

/** The special events' state in a save. Every field is optional: absent means "never". */
export interface EventsSave {
  /** Events whose unlock pop-up has been shown (or that opened alongside the one that was). */
  seen?: EventId[]
  /** The UTC day (yyyy-mm-dd) of the last Fortune Wheel spin. */
  wheelDay?: string
  /** That spin's prize until it's paid (when the wheel stops, or on the next start if the page closed mid-spin). */
  wheelPending?: WheelReward
  /** The Elite Rebattle, per region. */
  rebattle?: Record<string, RebattleProgress>
  /** Today's raid, and the last week's (the repeat window reads it). */
  raid?: TodayRaid
  raidHistory?: { day: string; dex: number }[]
  /** Pool species unlocked (also worked out from cleared areas and catches; this keeps what a moment announced). */
  raidPool?: number[]
  /** Raid Pokémon caught before completing their area: each joins its region's Box once that area is completed. */
  raidLocked?: RaidLock[]
  /** Your raid team: three instance ids, any region's Box (until set, your three highest-level Pokémon). */
  raidTeam?: string[]
  /** Raids won, a raid being won when its Pokémon is caught (the server keeps the count the leaderboard shows). */
  raidsWon?: number
  /** Progression raids caught (docs/24), by key (`areaId:dex`): each closes for good. */
  raidsDone?: string[]
  /** The team left on each progression raid, by key: three instance ids from that raid's region's Box. */
  raidTeams?: Record<string, string[]>
  /**
   * The NPC trainers offered on START with empty slots: drawn from this seed for this raid (`daily:YYYY-MM-DD` or a
   * progression raid's key), so a reload offers the same four; each try draws a new seed.
   */
  raidNpc?: { key: string; seed: number }
  /** Live events whose pop-up has been shown (ids). */
  liveSeen?: string[]
  /** Special Shop purchases, per live event id then item key: what counts against each item's limit. */
  liveBought?: Record<string, Record<string, number>>
  /** The small world this save holds (its block is the live region or a parked one), or the one that just closed. */
  world?: WorldSave
  /** Small worlds whose opening pop-up has been shown (ids). */
  worldSeen?: string[]
  /** Small worlds whose closing pop-up has been shown (ids). */
  worldBye?: string[]
  /** Shiny mythicals won in a small world, waiting for their home region to be started. */
  worldPending?: WorldCatch[]
  /**
   * A closed small world's Pokémon gone home (docs/26 §1), each waiting in its region, locked, until that region has a
   * Pokémon at its level (`engine/homecoming.ts`). Not in any Box or Pokédex until then.
   */
  worldHome?: WorldHomer[]
}

/** The small world a save holds: which, where it was entered from, and what happened there. */
export interface WorldSave {
  /** The world (SmallWorld.id). */
  id: string
  /** Its region: the block of that id is the world's Box, bag, ₽ and areas. */
  regionId: RegionId
  /** The region to go back to. */
  from: RegionId
  /** The partner picked for the fresh start. */
  partner: number
  /** Its shiny mythical has been caught (it left the world at once). */
  caught?: boolean
  /** Its Mart's purchases, item key → how many (each row's limit counts them). */
  bought?: Record<string, number>
  /** The world has closed: its block is gone; this stays until its closing pop-up has been shown. */
  closed?: boolean
  /** How many of its Pokémon went home to each region when it closed (its closing pop-up says so). */
  home?: Record<RegionId, number>
}

/** A closed small world's Pokémon, waiting in its home region until that region's best reaches its level. */
export interface WorldHomer {
  /** The Pokémon as it left the world (healed); its level is the level it waits for. */
  inst: PokemonInstance
  /** The region of its species, where it waits and arrives. */
  region: RegionId
  /** The world it came from. */
  worldId: string
}

/** A shiny mythical won in a small world, waiting for its home region to be started. */
export interface WorldCatch {
  dex: number
  level: number
  shiny: boolean
  /** The world it was won in. */
  worldId: string
}

/** A raid catch waiting for its area: it joins that area's region's Box once the area is completed. */
export interface RaidLock {
  dex: number
  shiny: boolean
  areaId: string
  /** The UTC day it was caught. */
  day: string
}

/** The day's raid: the UTC day, the species and whether it's shiny, the area it's fought in front of. */
export interface TodayRaid {
  day: string
  dex: number
  shiny: boolean
  areaId: string
  caught: boolean
  tries: number
}

/** Where a player stands in one region's Elite Rebattle. */
export interface RebattleProgress {
  /** Tiers cleared (0–3). */
  done: number
  /** The next trainer of the current tier's gauntlet (0 = its first). */
  step: number
  /** The K.O.s already paid: `tier:trainerId:index` (each Pokémon pays once per tier). */
  paid: string[]
}

/**
 * Everything a region owns. The live region's copy is the top level of `SaveData` — so no engine or screen code
 * needs to know regions exist — and the others sit parked in `SaveData.parked`.
 */
export interface RegionSave {
  gold: number
  pokedex: number[]
  box: PokemonInstance[]
  team: string[]
  inventory: Record<string, number>
  comboLevels: Record<ComboKey, number>
  dieLevels: Record<PokeType, number>
  currentAreaId: string
  areaProgress: Record<string, AreaProgress>
  boughtUnique?: string[]
}

export interface DayCareResident {
  inst: PokemonInstance
  /** When it was dropped off (ms): XP accrues from here, in real time. */
  since: number
  /** The region it was left from: taking it back puts it in that region's Box (regions never pool). */
  region: RegionId
}

/**
 * A friend's Pokémon visiting: a snapshot of one sitting in their Day Care (docs/15, Phase 4). The save never holds
 * the friend's instance and never writes to their save; it stays theirs.
 */
export interface DayCareGuest {
  /** The friend's user id. */
  owner: string
  /** For "Lea's", as it was when invited. */
  ownerName: string
  ownerAvatar: string
  /** The friend's instance id, to check it is still there. */
  inst: string
  dex: number
  /** Its level when last refreshed. */
  level: number
  shiny?: boolean
  addedAt: number
}

/** One parent of an Egg, for "Eevee and Ditto (Noor) left it": the species, and whose it is when it's a visitor. */
export interface EggParent {
  dex: number
  /** The friend's name, for a guest. */
  owner?: string
}

export interface DayCareState {
  residents: DayCareResident[]
  /** Friends' Pokémon visiting, at most `friendSlots`, no empty entries (the UI draws the free slots). */
  guests: DayCareGuest[]
  /** The gift Egg (the first one) has been hatched. */
  eggClaimed: boolean
  /** The player has been to the Day Care screen (the unlock tutorial sends them there once). */
  visited?: boolean
  /** When the last Egg-group check ran (ms). */
  breedAt?: number
  /** When the last Ditto check ran (ms). */
  dittoAt?: number
  /** The Egg waiting to hatch: one at a time. `gift` is the free first one. */
  egg?: { at: number; parents?: [EggParent, EggParent]; gift?: true }
}

export type PlayerCharacter = 'red' | 'green'
export interface PlayerProfile {
  name: string
  character: PlayerCharacter
  /** The look on the leaderboard and in Versus (src/lib/avatars). Absent: the character. */
  avatar?: string
}

/** The raw bundle — exactly the shape of src/data/*.json (camelCase DB rows). */
export interface BundleRaw {
  pokemon: Species[]
  typeChart: TypeChartRow[]
  diceTypes: DiceTypeDef[]
  areas: Area[]
  trainers: Trainer[]
  upgrades: { combos: ComboUpgradeRow[]; dice: DieUpgradeRow[] }
  items: ItemDef[]
  config: Record<string, unknown>
  /** Absent in bundles from before the second region: everything is then Kanto. */
  regions?: Region[]
  /** Static canon, not content: src/config/bundle.ts adds it (src/data/egg-groups.json), the database never has it. */
  eggGroups?: Record<string, EggGroupEntry>
}

/**
 * A species' breeding data, from Pokémon Showdown (`pnpm egg-groups`): its Egg groups as Showdown names them ("Water
 * 1", "Undiscovered"…), its gender when fixed (M, F or N for genderless), and `l: 1` for legendaries and mythicals.
 */
export interface EggGroupEntry {
  g: string[]
  s?: 'M' | 'F' | 'N'
  l?: 1
}

export type RegionId = string

/**
 * A region is a self-contained run of the game: its own chain of areas, its own starters, its own Pokédex page and
 * leaderboard. The player keeps only their character when they move on.
 */
export interface Region {
  id: RegionId
  name: string
  orderIndex: number
  /** The National Dex span this region's Pokédex page shows, inclusive. */
  dexRange: [number, number]
  starters: number[]
  starterLevel: number
  /** Clearing this area (every gym and round done) is "the league is done": it offers the next region. */
  leagueAreaId: string
  /** The region this one's league unlocks; null for the last. */
  nextRegion: RegionId | null
  /** Off = invisible everywhere: no prompt, no switcher chip, no Pokédex page, no board. Kanto is always on. */
  enabled: boolean
}

/** Compiled, lookup-friendly form every engine function receives. */
export interface GameData {
  species: Record<number, Species>
  speciesList: Species[]
  diceTypes: Record<DieType, DiceTypeDef>
  /** key `${attacking}>${defending}`, absent = 1 */
  typeChart: Record<string, number>
  comboUpgrades: Record<ComboKey, ComboUpgradeRow[]>
  dieUpgrades: Record<PokeType, DieUpgradeRow[]>
  items: Record<string, ItemDef>
  areas: Area[]
  trainers: Record<string, Trainer>
  config: GameConfig
  /** Every region, in order. Always at least Kanto. */
  regions: Region[]
  /** Breeding data by dex (engine/daycare.ts): empty when a bundle came without it, and then nothing pairs. */
  eggGroups: Record<number, EggGroupEntry>
  /** Who's playing, set by the store: the admin sees the events switched on for the admin only. Absent = a player. */
  viewer?: { admin: boolean }
}
