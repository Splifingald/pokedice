// Core domain types shared by the engine, the seed script and the UI.
// Pure declarations — no runtime dependencies.

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

/** The Pokémon Day Care: a secret place where Pokémon gain XP in real time, and where Eggs are sold. */
export interface DayCareConfig {
  /** Opens (on the Map, with a free Egg) once this many species are in the Pokédex. */
  unlockPokedex: number
  /** How many Pokémon can stay at once. */
  slots: number
  /** XP a resident gains every `tickMinutes` of real time… */
  xpPerTick: number
  tickMinutes: number
  /** …up to this much per stay (it stops gaining until it's picked up). */
  maxXp: number
  /** Pokédollars for an Egg (the first one is free). */
  eggPrice: number
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

export interface GameConfig {
  configVersion: number
  xpCurve: { A: number; B: number; C: number }
  xpShareMode: 'fighter' | 'team'
  maxTeamSize: number
  maxLevel: number
  maxDice: number
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
  /** Energy: 1 per encounter discovered (not gyms, legendaries or Pokémon Centers), refilled over time. */
  energy: EnergyConfig
  status: StatusRules
  ai: { samples: number; rerollGainThreshold: number }
  slotMachine: SlotMachineConfig
  dayCare: DayCareConfig
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
  settings: { sfx: boolean; reducedMotion: boolean; multiExp: boolean; autoMode?: boolean }
  /** The hpMultiplier current HP was last measured against (absent = ×1), so a change keeps every HP %. */
  hpScale?: number
  /** Who the player is: a name and one of the two trainer sprites (absent on older saves = Red, no name). */
  player?: PlayerProfile
  /** The Day Care: who's staying (out of the team and the Box meanwhile), and whether the free Egg was taken. */
  dayCare?: DayCareState
  /** When the admin last edited this save (cheats): that cloud save then wins the next sync, even with less progress. */
  adminEditAt?: number
  /** Energy held at `at` (ms); it refills from there (see engine/energy). Absent = full. */
  energy?: { value: number; at: number }
  /** The player has opened the leaderboard (Prof. Oak sends them there once). */
  leaderboardVisited?: boolean
}

export interface DayCareResident {
  inst: PokemonInstance
  /** When it was dropped off (ms): XP accrues from here, in real time. */
  since: number
}

export interface DayCareState {
  residents: DayCareResident[]
  eggClaimed: boolean
  /** The player has been to the Day Care screen (the unlock tutorial sends them there once). */
  visited?: boolean
}

export type PlayerCharacter = 'red' | 'green'
export interface PlayerProfile {
  name: string
  character: PlayerCharacter
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
}
