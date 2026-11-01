// The battle reducer. The UI dispatches events and renders the returned log — it never recomputes rules.
import { adjustRaidHit, type RaidHit } from './raidHit'
import { aiRerollMask } from './ai'
import { getSpecies } from './data'
import { attackMultiplier, attackType, computeDamage, type AttackMods, type DamageResult, type UpgradeLevels } from './damage'
import { dieValue, rerollMasked, rollAll, type RolledDie } from './dice'
import {
  LESSON_FOE,
  LESSON_THROW,
  lessonBadRoll,
  lessonFirstRoll,
  lessonFoeRoll,
  lessonPairRoll,
  lessonPairValue,
  lessonWindow,
  type LessonHit,
  type RerollLesson,
} from './lesson'
import { reviveHp } from './economy'
import { ARCEUS_DEX, choiceFormDie, choiceFormsOf, gmaxFormsOf, lowHpFormOf, megaDie, megaFormsOf, megaOptions, swapOneDie, weatherFormOf } from './forms'
import { battleSpeed, effectiveStats } from './progression'
import { carriedTalent, TALENT, talentRerolls, type TalentKey } from './talents'
import { potionHeal, shouldUsePotion } from './trainerItems'
import { createRng, type Rng } from './rng'
import {
  applyStatuses,
  clearStatuses,
  confusionLevel,
  consumeStun,
  emptyStatus,
  hasAnyStatus,
  hasStatus,
  statusesFromRoll,
  stunKind,
  tickDot,
  type StatusApplication,
  type StatusState,
} from './status'
import type { CurableStatus, DieType, GameData, PokeType, PowerKind, RaidTypeScale, Species, StatusKind, Weather } from './types'
import { weatherTypeBoost, weatherWear } from './weather'

export type Side = 'player' | 'enemy'
export type BattleKind = 'wild' | 'trainer' | 'boss'
export type BattlePhase =
  | 'player_roll'
  | 'player_reroll'
  /** The player's Pokémon is frozen or paralyzed: cure it with an item, or PASS (the stun eats the turn). */
  | 'player_stunned'
  | 'enemy_turn'
  | 'player_switch'
  | 'won'
  | 'lost'
  | 'fled'
  /** A raid step is over (`single`): the raid takes it from here. */
  | 'done'

export interface Battler {
  uid: string
  dex: number
  /** What the battle calls it: its nickname, or the species (the form) it shows now. */
  name: string
  /** One of your own with a nickname: it keeps it through a Mega Evolution or any other form. */
  nickname?: string
  level: number
  types: PokeType[]
  maxHp: number
  hp: number
  speed: number
  dice: DieType[]
  rerolls: number
  rerollsLeft: number
  status: StatusState
  spriteUrl: string
  shiny: boolean
  /** Its outfit (docs/59), as `outfitOf` gave it: only how it looks (a Gigantamax form shows plain). */
  outfit?: string
  /** A trainer Pokémon's potion, used once (null when used or never given). */
  item?: string | null
  /** Ditto: its dice are a copy of the opponent's, taken again whenever the opponent changes. `ownDice` = its own set. */
  copiesFoe?: boolean
  ownDice?: DieType[]
  /** The species it was sent out as. `dex` is the form it shows now (a Mega, Giratina's Origin Forme, an Arceus type). */
  baseDex?: number
  /**
   * Mega Evolved (or Primal Reversion, Ultra Burst) now. It stays so until the fight ends — or, under the gem rules
   * (docs/35), for `megaTimer`'s turns, or until it leaves the field.
   */
  mega?: boolean
  /** Under the gem rules: its own turns left as a Mega, and how it looked before. */
  megaTimer?: { turns: number; pre: FormSnapshot }
  /** The battle power it has used this battle (docs/35): one each, a Mega, a Gigantamax or a Z-Move. */
  powered?: PowerKind
  /**
   * Up high, under ground or under water after a Flying, Ground or Water Z-Move (docs/35): every attack misses it, and
   * at the start of its next turn it strikes with the roll it kept, as the type its Z-Move took when one was picked.
   */
  away?: { how: ZAway; dice: RolledDie[]; type?: PokeType }
  /** A form taken below half HP (Giratina's Origin Forme…): how it looked and rolled before, for above half again. */
  preForm?: FormSnapshot
  /** A raid Pokémon: its below-half-HP form waits for its last bar (`unleashForm`), whatever its HP does. */
  formHeld?: boolean
  /** Type changes (Arceus, Silvally, Ogerpon) this Pokémon has made this battle. */
  formChanges?: number
  /** Gigantamaxed: its own turns left, and how it looked before (the die it gained goes when it shrinks back). */
  gmax?: { turns: number; pre: FormSnapshot }
  /** Its family's hidden talent (docs/51), yours or a foe's. */
  talent?: TalentKey
  /** The once-a-battle talents it has spent (Sturdy, Mirror, Disguise). */
  talentSpent?: TalentKey[]
  /** A foe's Pressure (docs/51) already took its reroll. */
  pressured?: boolean
  /** Its talent that works on its own (Quick, Extra Reroll…) was said as it first acted (docs/51). */
  announced?: boolean
  /** Attacks it has made this battle (Opener counts the first). */
  attacks?: number
  /** A Totem's or a Titan's look (docs/62): bigger, with its aura. */
  aura?: FoeAura
}

/** A foe bigger than its kind (docs/62): an island trial's Totem, or a Titan's second phase. */
export type FoeAura = 'totem' | 'titan'

export interface FormSnapshot {
  dex: number
  name: string
  types: PokeType[]
  dice: DieType[]
  /** Absent in a battle saved before forms kept their own Speed. */
  speed?: number
}

/** Species that fight with a copy of their opponent's dice (Ditto), rolled on their own and with their own upgrades. */
export const COPIES_FOE_DICE: ReadonlySet<number> = new Set([132])

export interface BattleState {
  kind: BattleKind
  phase: BattlePhase
  turn: number
  actor: Side
  /** Whose turn comes after the pending free switch. */
  nextActor: Side
  player: Battler[]
  activeIndex: number
  enemy: Battler
  dice: RolledDie[]
  selected: boolean[]
  playerLevels: UpgradeLevels
  enemyLevels: UpgradeLevels
  /** Player instance ids that were sent out in this battle. */
  participants: string[]
  canRun: boolean
  /** Extreme mode with the admin's items switch off: no Potion or Revive works. */
  noHealItems?: boolean
  /** The types the player's Arceus may take (its plates, docs/34). Absent = any. */
  plates?: PokeType[]
  lastDamage: DamageResult | null
  /** One item per turn — it doesn't end the turn. */
  itemUsedThisTurn: boolean
  /** The player may Mega Evolve in this fight (they have reached Kalos). Absent = no. */
  megaAllowed?: boolean
  /** The player may Gigantamax in this fight (they have reached Galar). Absent = no. */
  gmaxAllowed?: boolean
  /**
   * Mega Evolutions the player's side has used this battle; Gigantamax counts here too unless `ownLimits` (they share
   * one limit under the older rules).
   */
  megaUsed?: number
  /** Gigantamax and Z-Moves used by the player's side this battle (docs/35). */
  gmaxUsed?: number
  zUsed?: number
  /**
   * The gem rules (docs/35): Mega Evolution only into these forms (the player's gems), at any level. Absent = the older
   * rule (any Mega form, from `megaEvolution.level`).
   */
  megaForms?: number[]
  /** The gem rules: a Mega lasts this many of its own turns, on both sides. Absent = until the battle ends. */
  megaTurns?: number
  /** Gigantamax's newer rules: the dice it gains and the % of max HP it heals, on both sides. Absent = one die, no heal. */
  gmaxBoost?: { dice: number; healPercent: number }
  /** Mega Evolution and Gigantamax have a use each (the newer rules), rather than one shared. */
  ownLimits?: boolean
  /** The player may use a Z-Move in this fight (docs/35). Absent = no. */
  zAllowed?: boolean
  /** …of these types only: the Z-Crystals held (docs/62 §6). Absent = any. */
  zTypes?: PokeType[]
  /**
   * An auto battle: under the older rules no Mega Evolution or Gigantamax on either side; type changers on both pick
   * their type themselves. Under the newer ones (docs/35) the player's side uses its powers by itself.
   */
  auto?: boolean
  /** What the foe does on its first turn — a trainer's ace Mega Evolving or Gigantamaxing — and whether it changes type. */
  enemyPlan?: EnemyPlan
  /** The plan's Mega / Gigantamax has been used. */
  enemyPlanDone?: boolean
  /** The plan's Z-Move has been used. */
  enemyZDone?: boolean
  /**
   * A raid step (engine/raidBattle.ts): one actor's one action, then phase 'done'. No next turn, no K.O. handling, no
   * end of battle and no statuses cleared: the raid decides what a K.O. means and who acts next.
   */
  single?: boolean
  /** A raid side's step: another side's Pokémon in battle with Power Spot (docs/51) boosts this side's hits. */
  allyPowerSpot?: { uid: string; name: string }
  /** …and one with Friend Guard softens the raid Pokémon's hits on this side. */
  allyFriendGuard?: { uid: string; name: string }
  /**
   * A double battle (docs/33): two of each side out at once. `activeIndex` and `enemy` are then the pair in front —
   * the Pokémon whose turn it is and the one it targets — so every rule written for one against one applies to them.
   */
  double?: DoubleState
  /** A raid step's own rules on its hits (docs/40, engine/raidHit.ts), set by the raid; read back once the step is done. */
  raidHit?: RaidHit
  /** A new player's first fight: the reroll lesson's rigged throws (docs/46 §6, engine/lesson.ts). */
  lesson?: RerollLesson
  /** The weather the fight is under (docs/62 §2): its × is on both sides' levels; a sandstorm or snow wears. */
  weather?: Weather
}

/** A double battle's field (docs/33). */
export interface DoubleState {
  /** Every foe of the fight: a wild pair, or the trainer's whole team (those not out yet wait for a free slot). */
  foes: Battler[]
  /** Indexes into `foes` of those out on the field (one or two), left to right. */
  foeSlots: number[]
  /** Indexes into `player` of yours out on the field (one or two), left to right. */
  ownSlots: number[]
  /** Yours out at once at most (a Titan's phases are one on one); absent = two. */
  ownMax?: number
  /** Index into `foes` of the one whose K.O. ends the fight (an island trial's Totem): the others flee. */
  leader?: number
  /** The foes after the first two are allies the leader calls (an island trial's SOS). */
  calls?: boolean
  /** Each foe's phase (a Titan's): one of a later phase comes out only once every earlier one is down. */
  phases?: number[]
  /** Index into `foes` of `enemy`: the foe in front. */
  foeIndex: number
  /** Still to act this round, fastest first (uids). Newcomers wait for the next round. */
  queue: string[]
  round: number
  /** Your K.O.'d Pokémon still to replace from the bench (the player_switch phase). */
  toReplace: number
  /** Foes K.O.'d so far, in order, with yours that were out when each fell: they share its XP in full. */
  kos: DoubleKo[]
  /** The trainer's Mega / Gigantamax / type change, by foe uid (its ace's), and those already used. */
  plans?: Record<string, EnemyPlan>
  plansDone?: string[]
}

export interface DoubleKo {
  uid: string
  /** The species it was sent out as (a Giratina K.O.'d in its Origin Forme is still Giratina). */
  dex: number
  level: number
  shiny: boolean
  fighters: string[]
  /** It carried its family's hidden talent (docs/51). */
  talent?: boolean
}

export interface EnemyPlan {
  /** The Mega (or Primal / Ultra Burst) form it takes. */
  mega?: number | null
  /** The Gigantamax form it takes. */
  gmax?: number | null
  /** It may change type (Arceus, Silvally, Ogerpon) to the one best against your Pokémon. */
  formChanges?: boolean
  /** Its first attack is a Z-Move (docs/35). */
  z?: boolean
}

/** Where a Flying, Ground or Water Z-Move takes its Pokémon for a turn. */
export type ZAway = 'fly' | 'dig' | 'dive'

/**
 * What a Z-Move adds, by the attack's type (docs/35): a status, a heal, a turn away then the strike (Flying, Ground,
 * Water), a reckless blow (Fighting), every status shaken off (Steel), or more damage for every other type.
 */
export type ZEffect = 'freeze' | 'paralyze' | 'burn' | 'heal' | 'confuse' | 'poison' | ZAway | 'reckless' | 'cleanse' | 'power'

export const isAway = (e: ZEffect): e is ZAway => e === 'fly' || e === 'dig' || e === 'dive'

export function zEffectOf(type: PokeType | null): ZEffect {
  switch (type) {
    case 'flying':
      return 'fly'
    case 'ground':
      return 'dig'
    case 'water':
      return 'dive'
    case 'fighting':
      return 'reckless'
    case 'steel':
      return 'cleanse'
    case 'ice':
      return 'freeze'
    case 'electric':
      return 'paralyze'
    case 'fire':
      return 'burn'
    case 'grass':
      return 'heal'
    case 'psychic':
      return 'confuse'
    case 'poison':
      return 'poison'
    default:
      return 'power'
  }
}

export type BattleEvent =
  | { t: 'ROLL' }
  | { t: 'TOGGLE_DIE'; i: number }
  | { t: 'REROLL' }
  | { t: 'ATTACK' }
  | { t: 'USE_ITEM'; key: string; targetUid?: string }
  | { t: 'SWITCH'; instanceId: string }
  | { t: 'AI_TURN' }
  | { t: 'RUN' }
  /** Accept a stunned turn (player_stunned). */
  | { t: 'PASS' }
  /** Give up: every Pokémon of the team is K.O. and the battle is lost. */
  | { t: 'FORFEIT' }
  /** Mega Evolve the Pokémon in battle into this Mega form. It doesn't end the turn. */
  | { t: 'MEGA'; toDex: number }
  /** Gigantamax the Pokémon in battle. It doesn't end the turn. */
  | { t: 'GMAX'; toDex: number }
  /**
   * Attack with a Z-Move (docs/35): the roll as it stands, plus its type's effect. Ends the turn like ATTACK. `type`:
   * a dual-type's pick, one of `zTypeChoices` (absent: the dice's pick).
   */
  | { t: 'ZMOVE'; type?: PokeType }
  /** Arceus, Silvally, Ogerpon: take this form (a type). It doesn't end the turn. */
  | { t: 'CHANGE_FORM'; toDex: number }
  /** A double battle: the foe your Pokémon will attack (docs/33). It doesn't end the turn. */
  | { t: 'TARGET'; uid: string }

export type LogEntry =
  /**
   * A hidden talent at work (docs/51): `amount` is what it did (HP healed, damage added; the die copied for Mirror). A
   * talent that changes the numbers alone (Speed, rerolls) logs nothing.
   */
  /**
   * Power Spot's, Friend Guard's: `ally` the one it helped (Static's, Rough Skin's, Pressure's: the foe it hit); `name`
   * its own when it isn't in this fight's teams (a raid's other side). `hurt`: the HP another Pokémon lost to it (Rough
   * Skin).
   */
  | {
      kind: 'talent'
      side: Side
      uid: string
      talent: TalentKey
      amount?: number
      hpAfter?: number
      ally?: string
      name?: string
      hurt?: { side: Side; uid: string; amount: number; hpAfter: number }
      /** Mirror's: the roll it turned (`index` the die that took the highest's face), for the tray to show it. */
      dice?: RolledDie[]
      index?: number
      /** Said as it first acts: a talent that works on its own (`ANNOUNCED_TALENTS`). */
      entry?: true
    }
  /** `double`: a double battle's opening, yours and the foes out (docs/33). */
  | { kind: 'start'; first: Side; double?: { own: string[]; foes: string[] } }
  /** A double battle: the pair in front changed — the Pokémon whose turn it is, and the one it attacks. */
  /** `aim`: you picked another foe to attack, your dice still in hand (the tray stays as it is). */
  | { kind: 'focus'; own: string; foe: string; aim?: true }
  /** A double battle: the trainer's next Pokémon takes the place of one K.O.'d. */
  | { kind: 'foe_out'; uid: string }
  /** The weather wears a Pokémon down at its turn (docs/62 §2): a sandstorm or snow. */
  | { kind: 'weather_tick'; target: Side; targetUid: string; weather: Weather; amount: number; hpAfter: number }
  /** An island trial's Totem calls an ally (docs/62 §6), the one coming out next. */
  | { kind: 'sos'; from: string; uid: string }
  /** A Titan's second phase is coming (docs/62 §7): it ate a Herba Mystica; `commander`: Tatsugiri jumped in. */
  | { kind: 'titan_rise'; uid: string; commander?: boolean }
  /** The leader fell: the foes still out flee (an island trial's allies). */
  | { kind: 'foe_fled'; uid: string }
  | { kind: 'turn'; side: Side; turn: number; uid: string }
  | { kind: 'roll'; side: Side; dice: RolledDie[] }
  | { kind: 'reroll'; side: Side; mask: boolean[]; dice: RolledDie[]; rerollsLeft: number }
  | {
      kind: 'damage'
      side: Side
      target: Side
      targetUid: string
      amount: number
      hpAfter: number
      dice: RolledDie[]
      result: DamageResult
      /** A Z-Move's hit (docs/35); `from`: the strike of one that went away a turn before. */
      z?: { from?: ZAway }
    }
  /** `level`: how confused (1–3); `chance`: what a Freeze or a Paralysis had to land (0–1). */
  | {
      kind: 'status'
      target: Side
      targetUid: string
      status: StatusKind
      stacks?: number
      turns?: number
      level?: number
      chance?: number
    }
  /** A Freeze or a Paralysis that missed its chance. */
  | { kind: 'status_resisted'; target: Side; targetUid: string; status: StatusKind; chance: number }
  | { kind: 'status_tick'; target: Side; targetUid: string; status: 'burn' | 'poison'; amount: number; hpAfter: number }
  /** `pending`: the player may still cure it before the turn is lost. */
  | { kind: 'stunned'; side: Side; uid: string; status: 'frozen' | 'paralyze'; pending?: boolean }
  | { kind: 'faint'; side: Side; uid: string; dex: number }
  | { kind: 'switch'; uid: string; free: boolean }
  /** Ditto took a copy of its opponent's dice. */
  | { kind: 'transform'; side: Side; uid: string; fromUid: string; dice: DieType[] }
  /** `side` 'enemy': a trainer's potion (absent = the player's item). */
  | { kind: 'item'; key: string; targetUid: string; amount: number; hpAfter: number; cured?: CurableStatus[]; rerolls?: number; side?: Side; revived?: boolean }
  | { kind: 'heal'; side: Side; uid: string; amount: number; hpAfter: number }
  /** Confusion recoil: the confused attacker hurts itself after its attack; `z`: a Fighting Z-Move's own force. */
  | { kind: 'recoil'; side: Side; uid: string; amount: number; hpAfter: number; z?: boolean }
  /**
   * A Z-Move (docs/35), just before its hit: the attack's type, what it adds, and whether a chance-based effect (a
   * freeze, a paralysis) landed. The status, heal or bigger hit itself follows in its own entries.
   */
  | { kind: 'zmove'; side: Side; uid: string; type: PokeType | null; effect: ZEffect; landed: boolean }
  /** A Flying, Ground or Water Z-Move: the Pokémon flies up, digs or dives, out of reach until its strike. */
  | { kind: 'away'; side: Side; uid: string; how: ZAway }
  /** An attack missed a Pokémon that is away: up high, under ground or under water. */
  | { kind: 'dodge'; side: Side; uid: string; how: ZAway }
  /** A Steel Z-Move: the Pokémon shook off every status (a stun included). */
  | { kind: 'cleansed'; side: Side; uid: string }
  | { kind: 'end'; result: 'won' | 'lost' | 'fled'; reason?: 'stalemate' | 'forfeit' }
  /**
   * A Pokémon changed form: `mega` (Mega Evolution, Primal Reversion, Ultra Burst — `die` is the die it gained),
   * `gmax` (Gigantamax; `revert` when it shrinks back), `lowHp` (Giratina's Origin Forme…, `revert` when it goes back
   * above half HP), `unleash` (that form on a raid Pokémon's last bar, for good; `die` is the die it gained),
   * `choice` (an Arceus, Silvally or Ogerpon type) or `weather` (Castform's Sunny, Rainy or Snowy Form, docs/62 §3).
   */
  | {
      kind: 'form'
      side: Side
      uid: string
      fromDex: number
      toDex: number
      reason: 'mega' | 'gmax' | 'lowHp' | 'unleash' | 'choice' | 'weather'
      dice: DieType[]
      die?: DieType
      revert?: boolean
      /** Your hand once the new dice were thrown into it mid-turn (`fresh`: those just thrown), for the tray. */
      hand?: { dice: RolledDie[]; fresh: boolean[] }
    }

export interface BattlerSeed {
  uid: string
  dex: number
  level: number
  /**
   * The level its dice and rerolls are figured at, when higher than `level`: in a raid it fights (and shows) at the
   * team cap, but keeps the dice and rerolls of its own level (the user's rule, 2026-10-18).
   */
  diceLevel?: number
  hp: number
  shiny?: boolean
  /** Its outfit (docs/59), as `outfitOf` gave it (the switch read). */
  outfit?: string | null
  item?: string
  nickname?: string
  /** A portal run's extra dice (docs/28), after its typed dice; the whole set kept to `diceCap` dice. */
  extraDice?: DieType[]
  diceCap?: number
  /** The battle power it already used (a Versus fight carries it from one battle to the next, docs/35). */
  powered?: PowerKind
  /** Its family's hidden talent (docs/51): `talentOf` for yours, `carriedTalent` for a foe. */
  talent?: TalentKey | null
}

/** A set of dice with extra ones joining the typed dice (ahead of any base die), the extras cut to stay within `cap`. */
export function withExtraDice(dice: readonly DieType[], extra: readonly DieType[] | undefined, cap = Infinity): DieType[] {
  if (!extra?.length) return [...dice]
  const room = Math.max(0, cap - dice.length)
  const add = extra.slice(0, room)
  const typed = dice.filter((d) => d !== 'base')
  return [...typed, ...add, ...dice.filter((d) => d === 'base')]
}

export function makeBattler(seed: BattlerSeed, data: GameData): Battler {
  const species = getSpecies(data, seed.dex)
  const talent = seed.talent ?? null
  const at = effectiveStats(species, seed.level, data, talent)
  const own = seed.diceLevel != null && seed.diceLevel > seed.level ? effectiveStats(species, seed.diceLevel, data, talent) : at
  const base = own === at ? at : { ...at, dice: own.dice, rerolls: own.rerolls }
  const stats = seed.extraDice?.length ? { ...base, dice: withExtraDice(base.dice, seed.extraDice, seed.diceCap) } : base
  return {
    uid: seed.uid,
    dex: seed.dex,
    name: seed.nickname || species.name,
    ...(seed.nickname && { nickname: seed.nickname }),
    level: seed.level,
    types: stats.types,
    maxHp: stats.maxHp,
    hp: Math.max(0, Math.min(stats.maxHp, seed.hp)),
    speed: battleSpeed(species, seed.level, data, talent),
    dice: stats.dice,
    rerolls: stats.rerolls + talentRerolls(talent),
    rerollsLeft: stats.rerolls + talentRerolls(talent),
    status: emptyStatus(),
    spriteUrl: species.spriteUrl,
    shiny: !!seed.shiny,
    ...(seed.outfit && { outfit: seed.outfit }),
    baseDex: seed.dex,
    ...(seed.item && { item: seed.item }),
    ...(seed.powered && { powered: seed.powered }),
    ...(talent && { talent }),
    // Imposter (docs/51): Ditto's, always carried; any other family an admin gives it copies too.
    ...((COPIES_FOE_DICE.has(seed.dex) || talent === 'imposter') && { copiesFoe: true, ownDice: stats.dice }),
  }
}

/**
 * Ditto copies whoever it faces: the dice of the opponent now in front of it (a copying opponent lends its own set).
 * Called when a battle starts and whenever either side's active Pokémon changes.
 */
export function copyFoeDice(s: BattleState, log: LogEntry[]) {
  const mine = activeBattler(s)
  for (const [side, b, foe] of [
    ['player', mine, s.enemy],
    ['enemy', s.enemy, mine],
  ] as const) {
    if (!b.copiesFoe || b.hp <= 0) continue
    const dice = [...(foe.copiesFoe ? (foe.ownDice ?? foe.dice) : foe.dice)]
    b.dice = dice
    // Imposter (docs/51): Ditto's talent, said as it copies.
    if (b.talent === 'imposter') log.push({ kind: 'talent', side, uid: b.uid, talent: 'imposter' })
    log.push({ kind: 'transform', side, uid: b.uid, fromUid: foe.uid, dice })
  }
}

export interface FoeSeed {
  dex: number
  level: number
  /** × its max HP (a Totem's, a Titan's second phase: docs/62). */
  hpTimes?: number
  /** Dice it gets on top of its own: its aura. */
  extraDice?: DieType[]
  aura?: FoeAura
  /** A Titan's phase (docs/62 §7): see `DoubleState.phases`. */
  phase?: number
  /** Dealt with its family's hidden talent (docs/51). */
  talent?: boolean
  /** As a `BattlerSeed`'s: a Versus defender fights (and shows) at Lv.50 with the dice of its own level. */
  diceLevel?: number
  hp?: number
  shiny?: boolean
  item?: string
}

export interface CreateBattleOptions {
  kind: BattleKind
  team: BattlerSeed[]
  leadUid?: string
  enemy: FoeSeed
  /**
   * A double battle (docs/33): every foe, two out at once (`enemy` is ignored), and yours led by `leadUids`. With
   * `plans` each foe's Mega / Gigantamax / type change, in the same order.
   */
  double?: {
    foes: FoeSeed[]
    leadUids?: string[]
    plans?: (EnemyPlan | null)[]
    /** The foe whose K.O. ends the fight (an island trial's Totem), the others its called allies (docs/62 §6). */
    leader?: number
    calls?: boolean
    /** Foes out at once and yours at most (one each for a Titan, docs/62 §7); absent = two. */
    foeField?: number
    ownField?: number
  }
  /** The area's weather (docs/62 §2), both sides alike; absent = none. */
  weather?: Weather | null
  playerLevels: UpgradeLevels
  enemyLevels: UpgradeLevels
  /** The player has unlocked Mega Evolution (see `megaUnlocked`). */
  megaAllowed?: boolean
  /** The player has unlocked Gigantamax (see `gmaxUnlocked`). */
  gmaxAllowed?: boolean
  /** The player has unlocked Z-Moves (see `zUnlocked`). */
  zAllowed?: boolean
  /** The Z-Crystals held (docs/62 §6): a Z-Move only for a Pokémon of one of these types. Absent = any type. */
  zTypes?: PokeType[]
  /** The newer rules (docs/35, see `battlePowersFor`): the gems' Mega forms and a Mega's turns… */
  megaForms?: number[]
  megaTurns?: number
  /** …and Gigantamax's dice and heal. */
  gmaxBoost?: { dice: number; healPercent: number }
  /** Powers already used by the player's side (a Versus fight carries them from one battle to the next). */
  used?: { mega?: number; gmax?: number; z?: number }
  /** The foe's Mega / Gigantamax / Z-Move / type change (see `enemyPlanFor`). */
  enemyPlan?: EnemyPlan | null
  /**
   * An auto battle. Under the older rules no Mega Evolution or Gigantamax, for either side — only the foe's type
   * change is kept; under the newer ones (docs/35) each power whose rules are on stays, used by the auto player.
   */
  auto?: boolean
  /** No Potion or Revive works (Extreme mode, items switched off). */
  noHealItems?: boolean
  /** The types the player's Arceus may take: its plates (docs/34). Absent = any. Foes are never limited. */
  plates?: PokeType[]
  /** The reroll lesson rigs this fight's second throw and its reroll (docs/46 §6; see `rerollLessonDue`). */
  rerollLesson?: boolean
}

/**
 * Takes on a form's look, types and Speed (the dice are the caller's business). The Speed counts from the next time
 * the order is read: a single battle reads it once, as it opens; a double battle every round.
 */
export function wearForm(b: Battler, form: Species, data: GameData) {
  b.dex = form.dex
  b.name = b.nickname || form.name
  b.types = form.type2 ? [form.type1, form.type2] : [form.type1]
  b.spriteUrl = form.spriteUrl
  b.speed = battleSpeed(form, b.level, data, b.talent)
}

const snapshot = (b: Battler): FormSnapshot => ({
  dex: b.dex,
  name: b.name,
  types: [...b.types],
  dice: [...b.dice],
  speed: b.speed,
})
function restore(b: Battler, pre: FormSnapshot, data: GameData) {
  b.dex = pre.dex
  b.name = pre.name
  b.types = pre.types
  b.dice = pre.dice
  if (pre.speed != null) b.speed = pre.speed
  b.spriteUrl = data.species[pre.dex]?.spriteUrl ?? b.spriteUrl
}

/**
 * New dice go with the other typed dice, ahead of any base die; thrown into the hand when the hand is out. Returns the
 * hand for the log in that case, so the tray throws only the new dice and keeps the others where they lie.
 */
function addDice(s: BattleState, side: Side, b: Battler, die: DieType, count: number, data: GameData, rng: Rng) {
  const hand = side === 'player' && s.phase === 'player_reroll'
  const fresh = s.dice.map(() => false)
  for (let n = 0; n < count; n++) {
    const at = b.dice.filter((d) => d !== 'base').length
    b.dice.splice(at, 0, die)
    if (!hand) continue
    const i = Math.min(at, s.dice.length)
    s.dice.splice(i, 0, rollAll([die], data, rng)[0]!)
    s.selected.splice(i, 0, false)
    fresh.splice(i, 0, true)
  }
  return hand ? { hand: { dice: [...s.dice], fresh } } : {}
}

/**
 * Mega Evolution (Primal Reversion, Ultra Burst): its look and types, and a die — until the battle ends, or under the
 * gem rules (docs/35) for `megaTurns` of its own turns, the one it Mega Evolves in included.
 */
function megaEvolve(s: BattleState, side: Side, b: Battler, mega: Species, data: GameData, rng: Rng, log: LogEntry[]) {
  const base = data.species[b.baseDex ?? b.dex]
  if (!base) return
  const pre = snapshot(b)
  const die = megaDie(base, mega)
  wearForm(b, mega, data)
  b.mega = true
  b.powered = 'mega'
  if (s.megaTurns) b.megaTimer = { turns: Math.max(1, s.megaTurns), pre }
  const thrown = addDice(s, side, b, die, 1, data, rng)
  log.push({
    kind: 'form',
    side,
    uid: b.uid,
    fromDex: pre.dex,
    toDex: b.dex,
    reason: 'mega',
    dice: [...b.dice],
    die,
    ...thrown,
  })
}

/** A timed Mega's turns are over, or it left the field: its look, types and dice from before. */
function endMega(side: Side, b: Battler, data: GameData, log: LogEntry[]) {
  if (!b.megaTimer) return
  const fromDex = b.dex
  restore(b, b.megaTimer.pre, data)
  delete b.megaTimer
  delete b.mega
  log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'mega', dice: [...b.dice], revert: true })
}

/**
 * Gigantamax: its look and a die of its first type, for `gigantamax.turns` of its own turns. Under the newer rules
 * (docs/35, `gmaxBoost`) it gains that many dice instead, and heals a share of its max HP, which it keeps.
 */
function gigantamax(s: BattleState, side: Side, b: Battler, form: Species, data: GameData, rng: Rng, log: LogEntry[]) {
  const base = data.species[b.baseDex ?? b.dex]
  if (!base) return
  const pre = snapshot(b)
  const die = megaDie(base, form)
  wearForm(b, form, data)
  const thrown = addDice(s, side, b, die, Math.max(1, s.gmaxBoost?.dice ?? 1), data, rng)
  b.gmax = { turns: Math.max(1, data.config.gigantamax.turns), pre }
  b.powered = 'gmax'
  log.push({
    kind: 'form',
    side,
    uid: b.uid,
    fromDex: pre.dex,
    toDex: b.dex,
    reason: 'gmax',
    dice: [...b.dice],
    die,
    ...thrown,
  })
  const heal = s.gmaxBoost ? Math.round((b.maxHp * s.gmaxBoost.healPercent) / 100) : 0
  if (heal > 0 && b.hp > 0 && b.hp < b.maxHp) {
    const before = b.hp
    b.hp = Math.min(b.maxHp, b.hp + heal)
    log.push({ kind: 'heal', side, uid: b.uid, amount: b.hp - before, hpAfter: b.hp })
  }
}

/** Back to its size: the look and the dice it had before. */
function endGmax(side: Side, b: Battler, data: GameData, log: LogEntry[]) {
  if (!b.gmax) return
  const fromDex = b.dex
  restore(b, b.gmax.pre, data)
  delete b.gmax
  log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'gmax', dice: [...b.dice], revert: true })
}

/** One of its own turns has gone by: a Gigantamax Pokémon shrinks back after its last, a timed Mega changes back. */
function tickGmax(s: BattleState, side: Side, data: GameData, log: LogEntry[]) {
  const b = side === 'player' ? activeBattler(s) : s.enemy
  if (b.hp <= 0) return
  if (b.gmax) {
    b.gmax.turns -= 1
    if (b.gmax.turns <= 0) endGmax(side, b, data, log)
  }
  if (b.megaTimer) {
    b.megaTimer.turns -= 1
    if (b.megaTimer.turns <= 0) endMega(side, b, data, log)
  }
}

/** A type picked from the menu (Arceus, Silvally, Ogerpon): its look, and every die — the hand too — takes the type. */
function changeForm(s: BattleState, side: Side, b: Battler, form: Species, data: GameData, log: LogEntry[]) {
  const fromDex = b.dex
  const type = choiceFormDie(form)
  wearForm(b, form, data)
  b.dice = b.dice.map(() => type)
  if (side === 'player') s.dice = s.dice.map((d) => ({ ...d, type }))
  log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'choice', dice: [...b.dice] })
}

/** The type forms open to this battler (its own form among them once it has taken another). */
function typeForms(b: Battler, data: GameData): Species[] {
  const base = b.baseDex ?? b.dex
  const forms = choiceFormsOf(data, base)
  if (!forms.length) return []
  const own = data.species[base]
  return [...(own ? [own] : []), ...forms].filter((f) => f.dex !== b.dex)
}

/**
 * The type forms whose type hits `target` hardest, when that beats every type `b` rolls now (an Arceus facing a
 * Pokémon its Normal dice can't touch turns Fighting, or whatever is best). Empty when none does better.
 */
function bestTypeForms(b: Battler, target: Battler, forms: Species[], data: GameData): Species[] {
  const score = (t: PokeType) => attackMultiplier(t, target.types, data)
  let bestScore = Math.max(0, ...b.dice.filter((d): d is PokeType => d !== 'base').map(score))
  let best: Species[] = []
  for (const f of forms) {
    const sc = score(choiceFormDie(f))
    if (sc > bestScore) {
      best = [f]
      bestScore = sc
    } else if (sc === bestScore && best.length) best.push(f)
  }
  return best
}

/** The foe's pick: a type form best against your Pokémon — the first of them, or in an auto battle one at random. */
function foeTypeForm(s: BattleState, b: Battler, target: Battler, data: GameData, rng: Rng): Species | null {
  const best = bestTypeForms(b, target, typeForms(b, data), data)
  if (!best.length) return null
  return s.auto ? rng.pick(best) : best[0]!
}

/**
 * A raid Pokémon's type change (docs/40: Arceus's plates, Ogerpon's masks): the menu form whose type hits `target`
 * hardest, when it beats what it rolls now; every die takes the type. Null when none does better (or it has none).
 */
export function raidFormShift(b: Battler, target: Battler, data: GameData): Extract<LogEntry, { kind: 'form' }> | null {
  const form = bestTypeForms(b, target, typeForms(b, data), data)[0]
  if (!form) return null
  const fromDex = b.dex
  const type = choiceFormDie(form)
  wearForm(b, form, data)
  b.dice = b.dice.map(() => type)
  return { kind: 'form', side: 'enemy', uid: b.uid, fromDex, toDex: b.dex, reason: 'choice', dice: [...b.dice] }
}

/** Auto-mode's pick for the Pokémon in battle: a type form best against the foe, at random among equals. */
export function autoTypeForm(s: BattleState, data: GameData, rng: Rng): Species | null {
  const best = bestTypeForms(activeBattler(s), s.enemy, formChoices(s, data), data)
  return best.length ? rng.pick(best) : null
}

/**
 * Giratina's Origin Forme: below half HP it takes it, one Ghost die turning Dragon; back at half or above it returns
 * to its Altered Forme. Checked for both sides whenever HP may have moved. A K.O.'d Pokémon keeps the look it fell in.
 */
function checkHpForms(s: BattleState, data: GameData, log: LogEntry[]) {
  const foes = s.double?.foes ?? [s.enemy]
  for (const [side, b] of [...s.player.map((p) => ['player', p] as const), ...foes.map((f) => ['enemy', f] as const)]) {
    // A Mega or Gigantamax Pokémon keeps that look whatever its HP; a raid Pokémon's waits for its last bar.
    if (b.hp <= 0 || b.mega || b.gmax || b.formHeld) continue
    const low = b.hp * 2 < b.maxHp
    if (low && !b.preForm) {
      const form = lowHpFormOf(data, b.dex)
      if (!form) continue
      const swap = form.form?.swapDie
      b.preForm = snapshot(b)
      const fromDex = b.dex
      wearForm(b, form, data)
      if (swap) b.dice = swapOneDie(b.dice, swap.from, swap.to)
      log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'lowHp', dice: [...b.dice] })
    } else if (!low && b.preForm) {
      const fromDex = b.dex
      restore(b, b.preForm, data)
      delete b.preForm
      log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'lowHp', dice: [...b.dice], revert: true })
    }
  }
}

/**
 * A raid Pokémon's last bar (docs/28, the user's call of 2026-10-16): its below-half-HP form is unleashed for
 * good, and it gains a die of the type the form brings (Giratina's Origin Forme: one more Dragon die) where a
 * battle swaps one. Null for a Pokémon with no such form, or already in it.
 */
export function unleashForm(b: Battler, data: GameData): Extract<LogEntry, { kind: 'form' }> | null {
  const form = lowHpFormOf(data, b.baseDex ?? b.dex)
  if (!form || b.dex === form.dex) return null
  const die = form.form?.swapDie?.to ?? form.type1
  const fromDex = b.dex
  wearForm(b, form, data)
  // With the other typed dice, ahead of any base die.
  b.dice.splice(b.dice.filter((d) => d !== 'base').length, 0, die)
  return {
    kind: 'form',
    side: 'enemy',
    uid: b.uid,
    fromDex,
    toDex: b.dex,
    reason: 'unleash',
    dice: [...b.dice],
    die,
  }
}

/**
 * The player's side has spent this power for the battle. Under the older rules Mega Evolution and Gigantamax share one
 * use; under the newer ones (docs/35) each has its own, and Z-Moves always do.
 */
export function powerSpent(s: BattleState, kind: PowerKind, data: GameData): boolean {
  const per = data.config.megaEvolution.perBattle
  if (kind === 'z') return (s.zUsed ?? 0) >= data.config.zMove.perBattle
  if (!s.ownLimits) return (s.megaUsed ?? 0) >= per
  return ((kind === 'mega' ? s.megaUsed : s.gmaxUsed) ?? 0) >= per
}

/** The Pokémon in battle may still take a power: alive, not already powered (one per Pokémon), not in a low-HP form. */
const canPower = (a: Battler) => !a.powered && !a.mega && !a.gmax && a.hp > 0 && !a.preForm

/** The Mega forms the Pokémon in battle could take right now (empty when it can't Mega Evolve). */
export function megaChoices(s: BattleState, data: GameData): Species[] {
  if (!s.megaAllowed || powerSpent(s, 'mega', data)) return []
  if (s.phase !== 'player_roll' && s.phase !== 'player_reroll') return []
  const a = activeBattler(s)
  if (!canPower(a)) return []
  const base = a.baseDex ?? a.dex
  // The gem rules: the forms the player's gems open, at any level.
  const forms = s.megaForms
  return forms ? megaFormsOf(data, base).filter((f) => forms.includes(f.dex)) : megaOptions(data, base, a.level)
}

/** The Gigantamax form the Pokémon in battle could take right now (its use shared with the Mega's under the older rules). */
export function gmaxChoices(s: BattleState, data: GameData): Species[] {
  if (!s.gmaxAllowed || powerSpent(s, 'gmax', data)) return []
  if (s.phase !== 'player_roll' && s.phase !== 'player_reroll') return []
  const a = activeBattler(s)
  if (!canPower(a)) return []
  return gmaxFormsOf(data, a.baseDex ?? a.dex)
}

/**
 * The Pokémon in battle could attack with a Z-Move now: after the roll, once per battle, not already powered — or,
 * a Steel-type, while frozen or paralyzed (its Z-Move shakes the stun off).
 */
/** The types this Pokémon's Z-Move may take: its own, those whose Z-Crystal is held (docs/62 §6). */
export const zTypesOf = (s: BattleState, b: Battler): PokeType[] => (s.zTypes ? b.types.filter((t) => s.zTypes!.includes(t)) : b.types)

export function canZMove(s: BattleState, data: GameData): boolean {
  if (!s.zAllowed || powerSpent(s, 'z', data)) return false
  const a = activeBattler(s)
  // With Z-Crystals, only for a Pokémon of a type whose crystal is held.
  const allowed = zTypesOf(s, a)
  if (!allowed.length) return false
  const when = s.phase === 'player_reroll' || (s.phase === 'player_stunned' && allowed.includes('steel'))
  return when && canPower(a)
}

/**
 * The types the player may give the Z-Move (docs/35): a Pokémon with two types picks either (the user's ask of
 * 2026-10-29), whatever the dice show; with one, the dice pick as for ATTACK (empty: nothing to pick). Stunned, only
 * its Steel one shakes the stun off, so there is nothing to pick either.
 */
export function zTypeChoices(s: BattleState, data: GameData): PokeType[] {
  if (!canZMove(s, data) || s.phase !== 'player_reroll') return []
  const types = zTypesOf(s, activeBattler(s))
  return types.length > 1 ? [...types] : []
}

/**
 * What the Z-Move would do with the roll on the table, as `type` (one of `zTypeChoices`; absent, the dice's pick): its
 * effect and its hit, before any chance is rolled — for the player to compare the types before picking one.
 */
export function zMovePreview(
  s: BattleState,
  data: GameData,
  type?: PokeType,
): { effect: ZEffect; result: DamageResult } {
  const a = activeBattler(s)
  let result = computeDamage(s.dice, a.types, s.enemy.types, s.playerLevels, data, type, attackModsFor(s, a, s.enemy))
  // A copy of the raid's rules: running a hit through them marks them (absorbed, bounced).
  if (s.raidHit) result = adjustRaidHit(result, { ...s.raidHit }, s.playerLevels.typeScale)
  const effect = zEffectOf(result.attackType)
  return { effect, result: zForce(result, effect, data) }
}

/** The types the Pokémon in battle could take right now (empty when it has none, or the change is spent). */
export function formChoices(s: BattleState, data: GameData): Species[] {
  if (s.phase !== 'player_roll' && s.phase !== 'player_reroll') return []
  const a = activeBattler(s)
  // Each Pokémon has its own changes for the battle.
  if (a.hp <= 0 || (a.formChanges ?? 0) >= data.config.formChangesPerBattle) return []
  const forms = typeForms(a, data)
  // Arceus takes only the types of the plates held (docs/34); its Normal self is always there to go back to.
  if (!s.plates || (a.baseDex ?? a.dex) !== ARCEUS_DEX) return forms
  return forms.filter((f) => f.dex === ARCEUS_DEX || s.plates!.includes(choiceFormDie(f)))
}

/** Arceus's types still locked for the player (docs/34): the forms it has no plate for. Empty for anyone else. */
export function lockedTypeForms(s: BattleState, data: GameData): Species[] {
  const a = activeBattler(s)
  if (!s.plates || (a.baseDex ?? a.dex) !== ARCEUS_DEX) return []
  return choiceFormsOf(data, ARCEUS_DEX).filter((f) => !s.plates!.includes(choiceFormDie(f)))
}

const other = (s: Side): Side => (s === 'player' ? 'enemy' : 'player')
export const activeBattler = (s: BattleState): Battler => s.player[s.activeIndex]!

/**
 * The powers a battle starts with. An auto battle keeps only the powers under the newer rules (docs/35) — the gems'
 * Mega Evolution, the boosted Gigantamax, Z-Moves — on both sides; the foe's type change always.
 */
function battlePowersOf(opts: CreateBattleOptions): Partial<BattleState> {
  const auto = !!opts.auto
  const mega = !!opts.megaAllowed && (!auto || !!opts.megaForms)
  const gmax = !!opts.gmaxAllowed && (!auto || !!opts.gmaxBoost)
  const plan = opts.enemyPlan
  const foe: EnemyPlan = {
    ...(plan?.formChanges && { formChanges: true }),
    ...(plan?.mega && (!auto || opts.megaForms) && { mega: plan.mega }),
    ...(plan?.gmax && (!auto || opts.gmaxBoost) && { gmax: plan.gmax }),
    ...(plan?.z && { z: true }),
  }
  return {
    ...(auto && { auto: true }),
    ...(mega && { megaAllowed: true }),
    ...(gmax && { gmaxAllowed: true }),
    ...(opts.zAllowed && { zAllowed: true }),
    ...(opts.zAllowed && opts.zTypes && { zTypes: [...opts.zTypes] }),
    ...(opts.megaForms && { megaForms: [...opts.megaForms] }),
    ...(opts.megaTurns && { megaTurns: opts.megaTurns }),
    ...(opts.gmaxBoost && { gmaxBoost: { ...opts.gmaxBoost } }),
    ...((opts.megaForms || opts.gmaxBoost) && { ownLimits: true }),
    ...(opts.used?.mega && { megaUsed: opts.used.mega }),
    ...(opts.used?.gmax && { gmaxUsed: opts.used.gmax }),
    ...(opts.used?.z && { zUsed: opts.used.z }),
    ...(Object.keys(foe).length && { enemyPlan: foe }),
  }
}

/** A foe as it fights: its talent carried, and a Totem's or a Titan's HP, aura dice and look (docs/62). */
function foeBattler(f: FoeSeed, uid: string, data: GameData): Battler {
  const b = makeBattler(
    {
      uid,
      dex: f.dex,
      level: f.level,
      diceLevel: f.diceLevel,
      hp: f.hp ?? Infinity,
      shiny: f.shiny,
      item: f.item,
      talent: carriedTalent(data, f.dex, f.talent),
      ...(f.extraDice?.length && { extraDice: f.extraDice }),
    },
    data,
  )
  if (f.hpTimes && f.hpTimes > 0 && f.hpTimes !== 1) {
    b.maxHp = Math.max(1, Math.round(b.maxHp * f.hpTimes))
    b.hp = Math.min(b.maxHp, f.hp ?? b.maxHp)
  }
  if (f.aura) b.aura = f.aura
  return b
}

/** Both sides' levels under the weather (docs/62 §2): its × on attacks of its types, for each alike. */
function withWeather(levels: UpgradeLevels, w: Weather | null | undefined): UpgradeLevels {
  const boost = weatherTypeBoost(w)
  return w && Object.keys(boost).length ? { ...levels, weather: { kind: w, boost } } : levels
}

export function createBattle(opts: CreateBattleOptions, data: GameData): { state: BattleState; log: LogEntry[] } {
  if (opts.double && opts.double.foes.length > 1) return createDouble(opts, opts.double, data)
  const player = opts.team.map((t) => makeBattler(t, data))
  let activeIndex = player.findIndex((b) => b.uid === opts.leadUid && b.hp > 0)
  if (activeIndex < 0) activeIndex = player.findIndex((b) => b.hp > 0)
  if (activeIndex < 0) throw new Error('No able Pokémon to send out')
  const enemy = foeBattler(opts.enemy, 'enemy', data)
  const lead = player[activeIndex]!
  const first: Side = lead.speed >= enemy.speed ? 'player' : 'enemy' // tie → player
  const state: BattleState = {
    kind: opts.kind,
    phase: 'player_roll',
    turn: 0,
    actor: first,
    nextActor: first,
    player,
    activeIndex,
    enemy,
    dice: [],
    selected: [],
    playerLevels: withWeather(opts.playerLevels, opts.weather),
    enemyLevels: withWeather(opts.enemyLevels, opts.weather),
    ...(opts.weather && { weather: opts.weather }),
    participants: [lead.uid],
    canRun: opts.kind === 'wild' && !data.config.noEscape,
    ...(opts.noHealItems && { noHealItems: true }),
    ...(opts.plates && { plates: [...opts.plates] }),
    lastDamage: null,
    itemUsedThisTurn: false,
    ...battlePowersOf(opts),
    ...(opts.rerollLesson && { lesson: { step: 'wait', throws: 0 } }),
  }
  const log: LogEntry[] = [{ kind: 'start', first }]
  // A Giratina sent out below half HP is already in its Origin Forme.
  checkHpForms(state, data, log)
  // Castform takes the weather's form (docs/62 §3).
  weatherForms(state, data, log)
  copyFoeDice(state, log)
  beginTurn(state, first, data, log)
  return { state, log }
}

function finish(s: BattleState, result: 'won' | 'lost' | 'fled', log: LogEntry[], reason?: 'stalemate' | 'forfeit') {
  s.phase = result
  s.dice = []
  s.selected = []
  // All statuses clear when the battle ends; HP damage persists.
  for (const b of s.player) b.status = emptyStatus()
  s.enemy.status = emptyStatus()
  for (const f of s.double?.foes ?? []) f.status = emptyStatus()
  log.push(reason ? { kind: 'end', result, reason } : { kind: 'end', result })
}

/** Handles K.O.s. Returns true when the flow stopped (battle over or a switch is required). */
function checkKnockouts(s: BattleState, log: LogEntry[]): boolean {
  if (s.enemy.hp <= 0) {
    log.push({ kind: 'faint', side: 'enemy', uid: s.enemy.uid, dex: s.enemy.dex })
    finish(s, 'won', log)
    return true
  }
  const a = activeBattler(s)
  if (a.hp <= 0) {
    log.push({ kind: 'faint', side: 'player', uid: a.uid, dex: a.dex })
    if (s.player.some((b) => b.hp > 0)) {
      s.phase = 'player_switch'
      s.dice = []
      s.selected = []
      return true
    }
    finish(s, 'lost', log)
    return true
  }
  return false
}

/**
 * Whether `atk`'s attacks can hurt `def` at all (v1.8: the whole attack takes its best dice type's effectiveness),
 * through a raid's matchups when it has them.
 */
export function canHurt(atk: Battler, def: Battler, data: GameData, scale?: RaidTypeScale): boolean {
  // Mind's Eye (docs/51): nothing is immune to it.
  if (atk.talent === 'mindsEye' && atk.dice.length) return true
  const dice = atk.dice.map((type) => ({ type, faceIndex: 0 }))
  return attackMultiplier(attackType(dice, atk.types, def.types, data), def.types, data, scale) > 0
}

/**
 * Nobody can ever lose: the foe can't hurt the active Pokémon, no Pokémon on the team can hurt the foe, and no
 * burn / poison / confusion is left to change that. The fight ends as a stalemate at once instead of at the turn cap.
 */
function deadlocked(s: BattleState, data: GameData): boolean {
  const me = activeBattler(s)
  const foe = s.enemy
  if (me.hp <= 0 || foe.hp <= 0) return false
  const pending = (b: Battler) => !!b.status.burn || !!b.status.poison || confusionLevel(b.status) > 0
  if (pending(me) || pending(foe) || canHurt(foe, me, data)) return false
  return !s.player.some((p) => p.hp > 0 && canHurt(p, foe, data))
}

/** A raid step has had its action (or lost it to a stun or a K.O. at its start). */
function endStep(s: BattleState) {
  s.phase = 'done'
  s.dice = []
  s.selected = []
}

/**
 * A raid step: `side` takes one turn in this one-on-one duel. It starts like any turn (the DoT ticks, then the stun
 * check: the player may still cure it) and ends with phase 'done' after its one action.
 */
export function startDuelStep(s: BattleState, side: Side, data: GameData, log: LogEntry[], rng?: Rng) {
  s.single = true
  copyFoeDice(s, log)
  beginTurn(s, side, data, log, rng)
}

/** Turn start: DoT tick (can K.O.), then the stun check (skips the turn), then the actor may act. */
/** `rng`: for a chance status (Freeze, Paralysis) carried by a strike from a turn away; absent at a battle's start. */
function beginTurn(s: BattleState, side: Side, data: GameData, log: LogEntry[], rng?: Rng) {
  if (s.double) return beginDoubleTurn(s, data, log, rng)
  const rules = data.config.status
  for (let guard = 0; guard < 50; guard++) {
    // A raid keeps its own count of turns.
    if (!s.single && (s.turn >= data.config.maxBattleTurns || deadlocked(s, data))) {
      // No rewards, no wipe; HP damage is kept like a RUN.
      finish(s, 'fled', log, 'stalemate')
      return
    }
    s.turn += 1
    s.actor = side
    s.dice = []
    s.selected = []
    s.itemUsedThisTurn = false
    const b = side === 'player' ? activeBattler(s) : s.enemy
    log.push({ kind: 'turn', side, turn: s.turn, uid: b.uid })
    announce(b, side, log)
    pressure(b, side === 'player' ? s.enemy : activeBattler(s), side, log)

    const ticks = statusTicks(b, side, rules, log)
    const worn = weatherTick(s, b, side, log)
    if (ticks || worn) checkHpForms(s, data, log)
    if (b.hp <= 0 && s.single) return endStep(s)
    if (b.hp <= 0) {
      // A K.O. here ends the turn.
      if (checkKnockouts(s, log) && s.phase === 'player_switch') s.nextActor = other(side)
      return
    }

    // Back from up high, under ground or under water (a Z-Move, docs/35): it strikes with the roll it kept.
    if (b.away) {
      const { how, dice, type } = b.away
      delete b.away
      s.dice = dice
      s.selected = dice.map(() => false)
      return resolveAttack(s, side, data, log, rng, how, type)
    }

    const stun = stunKind(b.status)
    if (stun && side === 'player') {
      // The player may cure it first (Ice Heal, Paralyze Heal) — or PASS, which spends the stunned turn.
      s.phase = 'player_stunned'
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun, pending: true })
      return
    }
    if (stun) {
      b.status = consumeStun(b.status)
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun })
      if (s.single) return endStep(s)
      side = other(side)
      continue
    }
    s.phase = side === 'player' ? 'player_roll' : 'enemy_turn'
    return
  }
}

function afterAction(s: BattleState, side: Side, data: GameData, log: LogEntry[], rng?: Rng) {
  tickGmax(s, side, data, log)
  // Leftovers (docs/51): the Pokémon that just acted heals a little at the end of its turn.
  const actor = side === 'player' ? activeBattler(s) : s.enemy
  if (actor.talent === 'leftovers' && actor.hp > 0 && actor.hp < actor.maxHp) {
    const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(actor.maxHp * TALENT.leftovers)))
    actor.hp += amount
    log.push({ kind: 'talent', side, uid: actor.uid, talent: 'leftovers', amount, hpAfter: actor.hp })
  }
  // Shed Skin (docs/51): a chance to shed its statuses at the end of its turn.
  if (actor.talent === 'shedSkin' && actor.hp > 0 && hasAnyStatus(actor.status)) {
    if ((rng ?? createRng(s.turn)).next() < TALENT.shedSkin) {
      actor.status = emptyStatus()
      log.push({ kind: 'talent', side, uid: actor.uid, talent: 'shedSkin' })
    }
  }
  if (s.single) return endStep(s)
  if (s.double) {
    if (!doubleKnockouts(s, log)) beginDoubleTurn(s, data, log, rng)
    return
  }
  if (checkKnockouts(s, log)) {
    if (s.phase === 'player_switch') s.nextActor = other(side)
    return
  }
  beginTurn(s, other(side), data, log, rng)
}

// ---------------------------------------------------------------- Double battles (docs/33)
//
// Two of each side out at once. Every round, all of them act once, fastest first (a tie goes to yours). The one whose
// turn it is and the one it attacks are the pair in front — `activeIndex` and `enemy` — so the rules above (the roll,
// the damage, statuses, items, forms) work on them unchanged; these functions only move the pair and run the round.

/** The foe uid of each of a trainer's or wild pair's Pokémon: the first keeps the one-on-one's. */
const foeUid = (i: number) => (i === 0 ? 'enemy' : `enemy-${i}`)

/** Yours out on the field. */
export const ownOnField = (s: BattleState): Battler[] => (s.double ? s.double.ownSlots.map((i) => s.player[i]!) : [activeBattler(s)])
/** The foes out on the field. */
export const foesOnField = (s: BattleState): Battler[] => (s.double ? s.double.foeSlots.map((i) => s.double!.foes[i]!) : [s.enemy])

function createDouble(
  opts: CreateBattleOptions,
  double: NonNullable<CreateBattleOptions['double']>,
  data: GameData,
): { state: BattleState; log: LogEntry[] } {
  const player = opts.team.map((t) => makeBattler(t, data))
  // A Titan's phases are one on one (docs/62 §7): one of yours out at a time.
  const ownMax = Math.max(1, Math.min(2, double.ownField ?? 2))
  // The leads picked, then whoever is able, two at most; one alone fights both (docs/33).
  const ownSlots: number[] = []
  for (const uid of [...(double.leadUids ?? []), ...(opts.leadUid ? [opts.leadUid] : []), ...player.map((b) => b.uid)]) {
    const i = player.findIndex((b) => b.uid === uid && b.hp > 0)
    if (i >= 0 && !ownSlots.includes(i) && ownSlots.length < ownMax) ownSlots.push(i)
  }
  if (!ownSlots.length) throw new Error('No able Pokémon to send out')
  const foes = double.foes.map((f, i) => foeBattler(f, foeUid(i), data))
  // A Titan's phases (docs/62 §7): those of the first phase come out; a later one waits for them all to fall.
  const phases = double.foes.map((f) => f.phase ?? 1)
  const phased = phases.some((p) => p !== phases[0])
  const foeMax = Math.max(1, Math.min(2, double.foeField ?? 2))
  const foeSlots = foes.map((_, i) => i).filter((i) => phases[i] === Math.min(...phases)).slice(0, foeMax)
  const plans: Record<string, EnemyPlan> = {}
  double.plans?.forEach((p, i) => {
    // An auto battle keeps a foe's powers whose newer rules are on (docs/35), as one on one does.
    if (p && foes[i])
      plans[foes[i]!.uid] = opts.auto
        ? {
            ...(p.formChanges && { formChanges: true }),
            ...(p.mega && opts.megaForms && { mega: p.mega }),
            ...(p.gmax && opts.gmaxBoost && { gmax: p.gmax }),
            ...(p.z && { z: true }),
          }
        : p
  })
  const state: BattleState = {
    kind: opts.kind,
    phase: 'player_roll',
    turn: 0,
    actor: 'player',
    nextActor: 'player',
    player,
    activeIndex: ownSlots[0]!,
    enemy: foes[0]!,
    dice: [],
    selected: [],
    playerLevels: withWeather(opts.playerLevels, opts.weather),
    enemyLevels: withWeather(opts.enemyLevels, opts.weather),
    ...(opts.weather && { weather: opts.weather }),
    participants: ownSlots.map((i) => player[i]!.uid),
    canRun: opts.kind === 'wild' && !data.config.noEscape,
    ...(opts.noHealItems && { noHealItems: true }),
    lastDamage: null,
    itemUsedThisTurn: false,
    ...(opts.auto
      ? { auto: true }
      : { ...(opts.megaAllowed && { megaAllowed: true }), ...(opts.gmaxAllowed && { gmaxAllowed: true }) }),
    double: {
      foes,
      foeSlots,
      ownSlots,
      ...(ownMax < 2 && { ownMax }),
      ...(double.leader != null && foes[double.leader] && { leader: double.leader }),
      ...(double.calls && { calls: true }),
      ...(phased && { phases }),
      foeIndex: 0,
      queue: [],
      round: 0,
      toReplace: 0,
      kos: [],
      ...(Object.keys(plans).length > 0 && { plans }),
    },
  }
  const order = roundOrder(state)
  const first: Side = order[0]?.side ?? 'player'
  const log: LogEntry[] = [
    { kind: 'start', first, double: { own: ownOnField(state).map((b) => b.uid), foes: foesOnField(state).map((b) => b.uid) } },
  ]
  // An island trial (docs/62 §6): the Totem calls its first ally as the fight opens.
  const lead = state.double!.leader
  if (state.double!.calls && lead != null)
    for (const i of foeSlots) if (i !== lead) log.push({ kind: 'sos', from: foes[lead]!.uid, uid: foes[i]!.uid })
  checkHpForms(state, data, log)
  // Castform takes the weather's form (docs/62 §3).
  weatherForms(state, data, log)
  // Every Ditto out copies the Pokémon facing it.
  for (const [side, row, facing] of [
    ['player', ownOnField(state), foesOnField(state)],
    ['enemy', foesOnField(state), ownOnField(state)],
  ] as const)
    row.forEach((b, i) => copyDiceOf(b, side, facing[Math.min(i, facing.length - 1)]!, log))
  beginDoubleTurn(state, data, log)
  return { state, log }
}

/** Who acts this round, fastest first; a tie goes to yours, then left before right. */
function roundOrder(s: BattleState): { side: Side; uid: string }[] {
  const d = s.double!
  const all = [
    ...d.ownSlots.map((i, at) => ({ side: 'player' as Side, b: s.player[i]!, at })),
    ...d.foeSlots.map((i, at) => ({ side: 'enemy' as Side, b: d.foes[i]!, at })),
  ].filter((x) => x.b.hp > 0)
  all.sort((a, b) => b.b.speed - a.b.speed || (a.side === b.side ? 0 : a.side === 'player' ? -1 : 1) || a.at - b.at)
  return all.map((x) => ({ side: x.side, uid: x.b.uid }))
}

/** The pair in front: yours at `own`, the foe at `foe` (indexes into `player` and `double.foes`); said when it moves. */
function setFront(s: BattleState, own: number, foe: number, log: LogEntry[], aim = false) {
  const d = s.double!
  const changed = s.activeIndex !== own || d.foeIndex !== foe
  s.activeIndex = own
  d.foeIndex = foe
  s.enemy = d.foes[foe]!
  if (changed) log.push({ kind: 'focus', own: s.player[own]!.uid, foe: s.enemy.uid, ...(aim && { aim: true as const }) })
}

/** Ditto takes `foe`'s dice (a copying foe lends its own set), said only when that changes them. */
function copyDiceOf(b: Battler, side: Side, foe: Battler, log: LogEntry[]) {
  if (!b.copiesFoe || b.hp <= 0) return
  const dice = [...(foe.copiesFoe ? (foe.ownDice ?? foe.dice) : foe.dice)]
  if (dice.length === b.dice.length && dice.every((d, i) => d === b.dice[i])) return
  b.dice = dice
  if (b.talent === 'imposter') log.push({ kind: 'talent', side, uid: b.uid, talent: 'imposter' })
  log.push({ kind: 'transform', side, uid: b.uid, fromUid: foe.uid, dice })
}

/** The Pokémon in front on `side` copies the one it faces (Ditto). */
function copyTarget(s: BattleState, side: Side, log: LogEntry[]) {
  const mine = activeBattler(s)
  if (side === 'player') copyDiceOf(mine, 'player', s.enemy, log)
  else copyDiceOf(s.enemy, 'enemy', mine, log)
}

/** The first able foe out, for yours to aim at when its last target fell. */
function firstFoe(s: BattleState): number {
  const d = s.double!
  return d.foeSlots.find((i) => d.foes[i]!.hp > 0) ?? d.foeSlots[0] ?? d.foeIndex
}

/** The foe in front picks one of yours out at random, and brings its own plan (a trainer's ace). */
function aimAtRandom(s: BattleState, rng: Rng, log: LogEntry[]) {
  const d = s.double!
  const able = d.ownSlots.filter((i) => s.player[i]!.hp > 0)
  if (able.length) setFront(s, able.length === 1 ? able[0]! : rng.pick(able), d.foeIndex, log)
  const plan = d.plans?.[s.enemy.uid]
  if (plan) s.enemyPlan = plan
  else delete s.enemyPlan
  s.enemyPlanDone = !!d.plansDone?.includes(s.enemy.uid)
  copyTarget(s, 'enemy', log)
}

/** Nobody out can hurt anyone on the other side, nobody on the bench could change that, and no DoT is pending. */
function doubleDeadlocked(s: BattleState, data: GameData): boolean {
  const d = s.double!
  const own = ownOnField(s).filter((b) => b.hp > 0)
  const foes = foesOnField(s).filter((b) => b.hp > 0)
  if (!own.length || !foes.length) return false
  const pending = (b: Battler) => !!b.status.burn || !!b.status.poison || confusionLevel(b.status) > 0
  if ([...own, ...foes].some(pending)) return false
  if (foes.some((f) => own.some((o) => canHurt(f, o, data)))) return false
  return !s.player.some((p) => p.hp > 0 && d.foes.some((f) => f.hp > 0 && canHurt(p, f, data)))
}

/** The next one to act this round (a new round when everyone has), or null when nobody is left to. */
function nextActor(s: BattleState): { side: Side; index: number } | null {
  const d = s.double!
  for (let guard = 0; guard < 2; guard++) {
    while (d.queue.length) {
      const uid = d.queue.shift()!
      const own = d.ownSlots.find((i) => s.player[i]!.uid === uid && s.player[i]!.hp > 0)
      if (own != null) return { side: 'player', index: own }
      const foe = d.foeSlots.find((i) => d.foes[i]!.uid === uid && d.foes[i]!.hp > 0)
      if (foe != null) return { side: 'enemy', index: foe }
    }
    d.round += 1
    d.queue = roundOrder(s).map((x) => x.uid)
  }
  return null
}

/** The next turn of the round: its actor moves to the front, then the DoT tick and the stun check as in any turn. */
function beginDoubleTurn(s: BattleState, data: GameData, log: LogEntry[], rng?: Rng) {
  const rules = data.config.status
  for (let guard = 0; guard < 50; guard++) {
    // Four Pokémon take turns: the cap counts every one of them, so it is twice a single battle's.
    const next = s.turn >= data.config.maxBattleTurns * 2 || doubleDeadlocked(s, data) ? null : nextActor(s)
    if (!next) {
      finish(s, 'fled', log, 'stalemate')
      return
    }
    const side = next.side
    if (side === 'player') {
      // Yours faces the foe in front (the last one to act), or the first foe left.
      const foe = s.double!.foeSlots.includes(s.double!.foeIndex) && s.enemy.hp > 0 ? s.double!.foeIndex : firstFoe(s)
      setFront(s, next.index, foe, log)
    } else setFront(s, s.activeIndex, next.index, log)
    if (side === 'player') copyTarget(s, 'player', log)
    s.turn += 1
    s.actor = side
    s.nextActor = side
    s.dice = []
    s.selected = []
    s.itemUsedThisTurn = false
    const b = side === 'player' ? activeBattler(s) : s.enemy
    log.push({ kind: 'turn', side, turn: s.turn, uid: b.uid })
    announce(b, side, log)
    pressure(b, side === 'player' ? s.enemy : activeBattler(s), side, log)

    const ticks = statusTicks(b, side, rules, log)
    const worn = weatherTick(s, b, side, log)
    if (ticks || worn) checkHpForms(s, data, log)
    if (b.hp <= 0) {
      // A K.O. here ends the turn.
      if (doubleKnockouts(s, log)) return
      continue
    }
    // Back from a Z-Move's turn away (docs/35): it strikes the one in front with the roll it kept.
    if (b.away) {
      const { how, dice, type } = b.away
      delete b.away
      s.dice = dice
      s.selected = dice.map(() => false)
      return resolveAttack(s, side, data, log, rng, how, type)
    }
    const stun = stunKind(b.status)
    if (stun && side === 'player') {
      s.phase = 'player_stunned'
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun, pending: true })
      return
    }
    if (stun) {
      b.status = consumeStun(b.status)
      log.push({ kind: 'stunned', side, uid: b.uid, status: stun })
      continue
    }
    s.phase = side === 'player' ? 'player_roll' : 'enemy_turn'
    return
  }
  finish(s, 'fled', log, 'stalemate')
}

/**
 * K.O.s on the field: a fallen foe makes way for the trainer's next one, a fallen one of yours for one from your bench
 * (your pick: the player_switch phase), or leaves its side to fight on alone. Returns true when the flow stopped
 * (the battle is over or you pick a replacement).
 */
function doubleKnockouts(s: BattleState, log: LogEntry[]): boolean {
  const d = s.double!
  const fighters = d.ownSlots.map((i) => s.player[i]!.uid)
  const phaseOf = (k: number) => d.phases?.[k] ?? 1
  let leaderDown = false
  for (const [at, i] of [...d.foeSlots].entries()) {
    const f = d.foes[i]!
    if (f.hp > 0) continue
    log.push({ kind: 'faint', side: 'enemy', uid: f.uid, dex: f.dex })
    d.kos.push({ uid: f.uid, dex: f.baseDex ?? f.dex, level: f.level, shiny: f.shiny, fighters, ...(f.talent && { talent: true }) })
    const slot = d.foeSlots.indexOf(i)
    if (d.leader === i) leaderDown = true
    // A foe never out yet (alive and off the field) takes its place, in the same spot: of a later phase (a Titan's
    // second) only once every foe of the earlier one is down; an island trial's allies only while the Totem stands.
    const lowest = Math.min(...d.foes.map((x, k) => (x.hp > 0 ? phaseOf(k) : Infinity)))
    const reserve =
      leaderDown || (d.leader != null && d.foes[d.leader]!.hp <= 0)
        ? -1
        : d.foes.findIndex((x, k) => x.hp > 0 && !d.foeSlots.includes(k) && phaseOf(k) <= lowest)
    if (reserve >= 0) {
      d.foeSlots[slot] = reserve
      if (phaseOf(reserve) > phaseOf(i))
        log.push({ kind: 'titan_rise', uid: d.foes[reserve]!.uid, ...(d.phases!.filter((p) => p === phaseOf(i)).length > 1 && { commander: true }) })
      else if (d.calls && d.leader != null) log.push({ kind: 'sos', from: d.foes[d.leader]!.uid, uid: d.foes[reserve]!.uid })
      log.push({ kind: 'foe_out', uid: d.foes[reserve]!.uid })
      const facing = ownOnField(s).filter((b) => b.hp > 0)
      if (facing.length) copyDiceOf(d.foes[reserve]!, 'enemy', facing[Math.min(at, facing.length - 1)]!, log)
    } else d.foeSlots.splice(slot, 1)
  }
  // The Totem down (docs/62 §6): the trial is won, and its allies still out flee.
  if (leaderDown || (d.leader != null && d.foes[d.leader]!.hp <= 0)) {
    for (const k of d.foeSlots) if (d.foes[k]!.hp > 0) log.push({ kind: 'foe_fled', uid: d.foes[k]!.uid })
    finish(s, 'won', log)
    return true
  }
  if (!d.foes.some((f) => f.hp > 0)) {
    finish(s, 'won', log)
    return true
  }
  if (!d.foeSlots.includes(d.foeIndex) || s.enemy.hp <= 0) setFront(s, s.activeIndex, firstFoe(s), log)
  let fallen = 0
  for (const i of [...d.ownSlots]) {
    const b = s.player[i]!
    if (b.hp > 0) continue
    log.push({ kind: 'faint', side: 'player', uid: b.uid, dex: b.dex })
    d.ownSlots.splice(d.ownSlots.indexOf(i), 1)
    fallen += 1
  }
  if (!s.player.some((b) => b.hp > 0)) {
    finish(s, 'lost', log)
    return true
  }
  if (fallen) {
    const bench = s.player.filter((b, k) => b.hp > 0 && !d.ownSlots.includes(k)).length
    d.toReplace = Math.min(fallen, bench, (d.ownMax ?? 2) - d.ownSlots.length)
    if (d.toReplace > 0) {
      s.phase = 'player_switch'
      s.dice = []
      s.selected = []
      return true
    }
    if (!d.ownSlots.includes(s.activeIndex)) setFront(s, d.ownSlots[0]!, d.foeIndex, log)
  }
  return false
}

/**
 * A switch in a double battle: after a K.O., a free one into the empty spot; on your turn, the Pokémon whose turn it
 * is goes back for one from the bench (or, with a spot empty, the bench one joins it), and the turn ends.
 */
function doubleSwitch(s: BattleState, uid: string, data: GameData, log: LogEntry[], rng?: Rng): boolean {
  const d = s.double!
  const idx = s.player.findIndex((b) => b.uid === uid)
  const target = s.player[idx]
  if (!target || target.hp <= 0 || d.ownSlots.includes(idx)) return false
  const enter = () => {
    if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
  }
  if (s.phase === 'player_switch') {
    d.ownSlots.push(idx)
    enter()
    log.push({ kind: 'switch', uid: target.uid, free: true })
    d.toReplace -= 1
    const facing = foesOnField(s).filter((f) => f.hp > 0)
    if (facing.length) copyDiceOf(target, 'player', facing[Math.min(d.ownSlots.length - 1, facing.length - 1)]!, log)
    if (d.toReplace > 0 && s.player.some((b, k) => b.hp > 0 && !d.ownSlots.includes(k))) return true
    d.toReplace = 0
    if (!d.ownSlots.includes(s.activeIndex)) setFront(s, idx, d.foeIndex, log)
    beginDoubleTurn(s, data, log, rng)
    return true
  }
  if ((s.phase !== 'player_roll' && s.phase !== 'player_reroll') || !data.config.allowVoluntarySwitch) return false
  const outgoing = activeBattler(s)
  naturalCure(outgoing, 'player', log)
  if (d.ownSlots.length >= (d.ownMax ?? 2)) {
    // A Gigantamax Pokémon shrinks back when it leaves the field.
    if (outgoing.gmax) endGmax('player', outgoing, data, log)
    d.ownSlots[d.ownSlots.indexOf(s.activeIndex)] = idx
  } else d.ownSlots.push(idx)
  enter()
  log.push({ kind: 'switch', uid: target.uid, free: false })
  s.activeIndex = idx
  log.push({ kind: 'focus', own: target.uid, foe: s.enemy.uid })
  copyTarget(s, 'player', log)
  s.dice = []
  s.selected = []
  // The outgoing one's turn is spent; the newcomer waits for the next round.
  if (!doubleKnockouts(s, log)) beginDoubleTurn(s, data, log, rng)
  return true
}

/**
 * Recoil a confused attacker takes after its attack: `status.confuse.recoilPercentPerFace` of its max HP per level of
 * confusion (the Confuse faces that caused it, `maxFaces` at most), at least 1. 0 when not confused.
 */
export function confusionRecoil(maxHp: number, level: number, data: GameData): number {
  const r = data.config.status.confuse
  const lv = Math.min(Math.max(0, Math.floor(level)), Math.max(1, r.maxFaces))
  if (lv <= 0) return 0
  return Math.max(1, Math.round((maxHp * lv * r.recoilPercentPerFace) / 100))
}

/**
 * A Z-Move (docs/35): what the attack's type adds, and whether a chance-based effect lands — rolled before the hit, so
 * the log can say it first. Every other type hits `damagePercent` % harder.
 */
function zMoveOf(result: DamageResult, data: GameData, rng: Rng): { effect: ZEffect; landed: boolean; result: DamageResult } {
  const cfg = data.config.zMove
  const effect = zEffectOf(result.attackType)
  const chance = effect === 'freeze' ? cfg.freezeChance : effect === 'paralyze' ? cfg.paralyzeChance : 100
  const landed = !result.immune && rng.next() * 100 < chance
  return { effect, landed, result: zForce(result, effect, data) }
}

/** A Z-Move's own force on its hit: `damagePercent` % more for a type with no effect of its own, Fighting's more. */
function zForce(result: DamageResult, effect: ZEffect, data: GameData): DamageResult {
  const cfg = data.config.zMove
  const more = effect === 'power' ? cfg.damagePercent : effect === 'reckless' ? cfg.recklessPercent : 0
  if (!more || result.immune) return result
  const final = Math.max(1, Math.round((result.final * (100 + more)) / 100))
  return { ...result, final, zPercent: more }
}

/**
 * What a Z-Move's effect does once its hit has landed (`dealt`): the status on the foe, the heal on the user, or a
 * Fighting Z-Move's recoil, a share of what it dealt.
 */
function applyZEffect(effect: ZEffect, atk: Battler, def: Battler, side: Side, dealt: number, data: GameData, log: LogEntry[]) {
  const cfg = data.config.zMove
  if (effect === 'power' || effect === 'cleanse' || isAway(effect)) return
  if (effect === 'reckless') {
    if (dealt <= 0 || atk.hp <= 0) return
    const amount = Math.max(1, Math.round((dealt * cfg.recklessRecoilPercent) / 100))
    atk.hp = Math.max(0, atk.hp - amount)
    log.push({ kind: 'recoil', side, uid: atk.uid, amount, hpAfter: atk.hp, z: true })
    return
  }
  if (effect === 'heal') {
    const amount = Math.round((atk.maxHp * cfg.healPercent) / 100)
    if (amount <= 0 || atk.hp <= 0 || atk.hp >= atk.maxHp) return
    const before = atk.hp
    atk.hp = Math.min(atk.maxHp, atk.hp + amount)
    log.push({ kind: 'heal', side, uid: atk.uid, amount: atk.hp - before, hpAfter: atk.hp })
    return
  }
  if (def.hp <= 0) return
  const status: StatusKind = effect === 'freeze' ? 'frozen' : effect
  if (shrugs(def, status)) return void log.push({ kind: 'talent', side: other(side), uid: def.uid, talent: 'limber' })
  // A Psychic Z-Move confuses as much as a full hand of Confuse faces.
  const level = effect === 'confuse' ? Math.max(1, data.config.status.confuse.maxFaces) : undefined
  const app = effect === 'burn' ? { status, stacks: cfg.burnStacks } : { status, level }
  def.status = applyStatuses(def.status, [app], data.config.status)
  log.push({
    kind: 'status',
    target: other(side),
    targetUid: def.uid,
    status,
    ...(effect === 'burn' && { stacks: cfg.burnStacks }),
    ...(level && { level }),
  })
}

/** Confusion: the attack still lands (or misses), then the attacker takes recoil (a % of its max HP) and it clears. */
function confusedRecoil(atk: Battler, side: Side, data: GameData, log: LogEntry[]) {
  const level = confusionLevel(atk.status)
  if (!level) return
  atk.status = { ...atk.status, confused: 0 }
  // Magic Guard (docs/51): no status hurts it.
  if (atk.talent === 'magicGuard') return void log.push({ kind: 'talent', side, uid: atk.uid, talent: 'magicGuard' })
  const amount = confusionRecoil(atk.maxHp, level, data)
  atk.hp = Math.max(0, atk.hp - amount)
  log.push({ kind: 'recoil', side, uid: atk.uid, amount, hpAfter: atk.hp })
}

/** The attack's end: forms by HP, the hand cleared, the turn over. */
function endAttack(s: BattleState, side: Side, data: GameData, log: LogEntry[], rng?: Rng) {
  checkHpForms(s, data, log)
  s.dice = []
  s.selected = []
  afterAction(s, side, data, log, rng)
}

/**
 * A sandstorm's or snow's wear at the start of a Pokémon's turn (docs/62 §2): 4 % of its max HP unless its type is
 * spared (it can K.O.); Magic Guard takes none. True when it wore.
 */
function weatherTick(s: BattleState, b: Battler, side: Side, log: LogEntry[]): boolean {
  if (!s.weather || s.single || b.hp <= 0) return false
  const amount = Math.min(b.hp, weatherWear(s.weather, b.types, b.maxHp))
  if (amount <= 0) return false
  if (b.talent === 'magicGuard') {
    log.push({ kind: 'talent', side, uid: b.uid, talent: 'magicGuard' })
    return false
  }
  b.hp -= amount
  log.push({ kind: 'weather_tick', target: side, targetUid: b.uid, weather: s.weather, amount, hpAfter: b.hp })
  return true
}

/**
 * Castform's Forecast (docs/62 §3): as a fight under sun, rain or snow starts, each Castform on either side takes the
 * weather's form, its dice of its own type turning into the form's. Said for those out on the field; those on the bench
 * are in it as they come out.
 */
function weatherForms(s: BattleState, data: GameData, log: LogEntry[]) {
  if (!s.weather) return
  const out = new Set([...ownOnField(s), ...foesOnField(s)].map((b) => b.uid))
  const foes = s.double?.foes ?? [s.enemy]
  for (const [side, b] of [...s.player.map((p) => ['player', p] as const), ...foes.map((f) => ['enemy', f] as const)]) {
    const form = weatherFormOf(data, b.baseDex ?? b.dex, s.weather)
    if (!form || b.dex === form.dex) continue
    const own = data.species[b.dex]?.type1
    const fromDex = b.dex
    wearForm(b, form, data)
    b.dice = b.dice.map((d) => (d === own ? (form.type1 as DieType) : d))
    if (out.has(b.uid)) log.push({ kind: 'form', side, uid: b.uid, fromDex, toDex: b.dex, reason: 'weather', dice: [...b.dice] })
  }
}

/** Magma Armor (docs/51): the turns a freeze holds it. */
const MAGMA_ARMOR_TURNS = 1

/** Natural Cure (docs/51): its statuses clear as it leaves the field. */
function naturalCure(b: Battler, side: Side, log: LogEntry[]) {
  if (b.talent !== 'naturalCure' || b.hp <= 0 || !hasAnyStatus(b.status)) return
  b.status = emptyStatus()
  log.push({ kind: 'talent', side, uid: b.uid, talent: 'naturalCure' })
}

/**
 * The burn and poison at the start of a turn (they can K.O.): Poison Heal and Flame Heal turn theirs into a heal, Magic
 * Guard takes none (docs/51). True when anything ticked.
 */
function statusTicks(b: Battler, side: Side, rules: GameData['config']['status'], log: LogEntry[]): boolean {
  const { state, ticks } = tickDot(b.status, rules, b.maxHp)
  b.status = state
  for (const t of ticks) {
    const heals = (t.status === 'poison' && b.talent === 'poisonHeal') || (t.status === 'burn' && b.talent === 'flameHeal')
    if (heals) {
      const amount = Math.min(b.maxHp - b.hp, t.amount)
      if (amount <= 0) continue
      b.hp += amount
      log.push({ kind: 'talent', side, uid: b.uid, talent: b.talent!, amount, hpAfter: b.hp })
    } else if (b.talent === 'magicGuard') {
      log.push({ kind: 'talent', side, uid: b.uid, talent: 'magicGuard' })
    } else {
      b.hp = Math.max(0, b.hp - t.amount)
      log.push({ kind: 'status_tick', target: side, targetUid: b.uid, status: t.status, amount: t.amount, hpAfter: b.hp })
    }
  }
  return ticks.length > 0
}

/**
 * The talents that work on their own, with no moment of their own (docs/51): said once, as the Pokémon first acts, so
 * the player sees them at work (the rerolls it has, its Speed, its HP, its rerolls that never repeat).
 */
export const ANNOUNCED_TALENTS: readonly TalentKey[] = [
  'extraReroll',
  'doubleReroll',
  'quick',
  'ultraSpeed',
  'thickHide',
  'reroller',
]

function announce(b: Battler, side: Side, log: LogEntry[]) {
  if (b.announced || !b.talent || !ANNOUNCED_TALENTS.includes(b.talent) || b.hp <= 0) return
  b.announced = true
  log.push({ kind: 'talent', side, uid: b.uid, talent: b.talent, entry: true })
}

/** Pressure (docs/51): the first turn a Pokémon takes facing it, it loses a reroll (once a battle). */
function pressure(b: Battler, foe: Battler, side: Side, log: LogEntry[]) {
  if (foe.talent !== 'pressure' || foe.hp <= 0 || b.hp <= 0 || b.pressured) return
  b.pressured = true
  b.rerollsLeft = Math.max(0, b.rerollsLeft - TALENT.pressure)
  log.push({ kind: 'talent', side: other(side), uid: foe.uid, talent: 'pressure', ally: b.uid })
}

/** Limber (docs/51): no paralysis lands on it. */
const shrugs = (b: Battler, status: StatusKind) => status === 'paralyze' && b.talent === 'limber'

/**
 * A hit that dealt `dealt` (docs/51): Shell Bell heals the attacker a share of it; the target's Rough Skin hurts the
 * attacker back (not through Magic Guard); its Static may paralyse the attacker (not through Limber).
 */
function hitTalents(
  atk: Battler,
  def: Battler,
  side: Side,
  dealt: number,
  rules: GameData['config']['status'],
  log: LogEntry[],
  rng: Rng,
) {
  const foe = other(side)
  if (atk.talent === 'shellBell' && atk.hp > 0 && atk.hp < atk.maxHp) {
    const amount = Math.min(atk.maxHp - atk.hp, Math.max(1, Math.round(dealt * TALENT.shellBell)))
    atk.hp += amount
    log.push({ kind: 'talent', side, uid: atk.uid, talent: 'shellBell', amount, hpAfter: atk.hp })
  }
  if (def.talent === 'roughSkin' && atk.hp > 0) {
    if (atk.talent === 'magicGuard') log.push({ kind: 'talent', side, uid: atk.uid, talent: 'magicGuard' })
    else {
      const amount = Math.max(1, Math.round(dealt * TALENT.roughSkin))
      atk.hp = Math.max(0, atk.hp - amount)
      log.push({
        kind: 'talent',
        side: foe,
        uid: def.uid,
        talent: 'roughSkin',
        ally: atk.uid,
        hurt: { side, uid: atk.uid, amount, hpAfter: atk.hp },
      })
    }
  }
  if (def.talent === 'static' && atk.hp > 0 && atk.status.paralyze <= 0 && rng.next() < TALENT.static) {
    if (shrugs(atk, 'paralyze')) return void log.push({ kind: 'talent', side, uid: atk.uid, talent: 'limber' })
    log.push({ kind: 'talent', side: foe, uid: def.uid, talent: 'static', ally: atk.uid })
    atk.status = applyStatuses(atk.status, [{ status: 'paralyze' }], rules)
    log.push({ kind: 'status', target: side, targetUid: atk.uid, status: 'paralyze', turns: rules.paralyze.stunTurns })
  }
}

/** Mirror (docs/51): the lowest die becomes a copy of the highest. Null when they already match. */
function mirrorDice(dice: readonly RolledDie[], data: GameData): { dice: RolledDie[]; value: number; index: number } | null {
  if (dice.length < 2) return null
  const values = dice.map((d) => dieValue(d, data))
  const hi = values.indexOf(Math.max(...values))
  const lo = values.indexOf(Math.min(...values))
  if (values[hi] === values[lo]) return null
  return { dice: dice.map((d, i) => (i === lo ? { ...dice[hi]! } : d)), value: values[hi]!, index: lo }
}

/**
 * What the hidden talents (docs/51) do to this attack. The attacker's own: Technician (a Pair), Triple Pro and Fours
 * Pro (Three and Four of a Kind), Opener (its first
 * attack), Finisher (a foe under a third of its HP), Guts (it has a status), Mind's Eye, Raider (a raid's fight), Skill
 * Link (its combo a level up). A partner's Power Spot. The target's: Intimidate (the attacker's first attacks),
 * Disguise (the first hit it takes), a partner's Friend Guard. Undefined when nothing.
 */
export function attackModsFor(s: BattleState, atk: Battler, def: Battler): AttackMods | undefined {
  const t = atk.talent
  const own: AttackMods | undefined =
    t === 'technician'
      ? { talent: t, comboTimes: { key: 'pair', times: 1 + TALENT.technician } }
      : t === 'triplePro'
        ? { talent: t, comboTimes: { key: 'three_kind', times: 1 + TALENT.triplePro } }
        : t === 'foursPro'
          ? { talent: t, comboTimes: { key: 'four_kind', times: 1 + TALENT.foursPro } }
      : t === 'opener' && (atk.attacks ?? 0) === 0
        ? { talent: t, times: 1 + TALENT.opener }
        : t === 'finisher' && def.hp < def.maxHp * TALENT.finisherBelow
          ? { talent: t, times: 1 + TALENT.finisher }
          : t === 'guts' && hasAnyStatus(atk.status)
            ? { talent: t, times: 1 + TALENT.guts }
            : t === 'mindsEye'
              ? { talent: t, immuneAs: TALENT.mindsEye }
              : t === 'raider' && s.single
                ? { talent: t, times: 1 + TALENT.raider }
                : t === 'skillLink'
                  ? { talent: t, comboUp: TALENT.skillLink }
                  : undefined
  let mods = own
  const times = (m: AttackMods | undefined, x: number): AttackMods => ({ ...m, times: (m?.times ?? 1) * x })
  const partner = powerSpotOf(s, atk)
  if (partner) mods = { ...times(mods, 1 + TALENT.powerSpot), powerSpot: partner }
  const guards: { key: TalentKey; uid: string }[] = []
  let guardTimes = 1
  if (def.talent === 'intimidate' && (atk.attacks ?? 0) < TALENT.intimidateHits) {
    guardTimes *= 1 - TALENT.intimidate
    guards.push({ key: 'intimidate', uid: def.uid })
  }
  if (def.talent === 'disguise' && !def.talentSpent?.includes('disguise')) {
    guardTimes *= 1 - TALENT.disguise
    guards.push({ key: 'disguise', uid: def.uid })
  }
  const guard = friendGuardOf(s, def)
  if (guard) {
    guardTimes *= 1 - TALENT.friendGuard
    guards.push({ key: 'friendGuard', uid: guard })
  }
  return guards.length ? { ...mods, guardTimes, guards } : mods
}

/**
 * Power Spot (docs/51): the partner on the field that boosts this attacker. In a double battle, the other one of its
 * side still standing; in a raid, any other side's Pokémon in battle (`allyPowerSpot`, set by the raid for its sides'
 * hits). A Pokémon never boosts itself.
 */
function powerSpotOf(s: BattleState, atk: Battler): string | undefined {
  if (s.allyPowerSpot && s.player.some((p) => p.uid === atk.uid)) return s.allyPowerSpot.uid
  return partnerWith(s, atk, 'powerSpot')
}

/** Friend Guard (docs/51): the partner that softens the hits this Pokémon takes, as Power Spot's twin. */
function friendGuardOf(s: BattleState, def: Battler): string | undefined {
  if (s.allyFriendGuard && s.player.some((p) => p.uid === def.uid)) return s.allyFriendGuard.uid
  return partnerWith(s, def, 'friendGuard')
}

/** In a double battle, the other Pokémon on `b`'s side of the field, still standing, that carries `talent`. */
function partnerWith(s: BattleState, b: Battler, talent: TalentKey): string | undefined {
  if (!s.double) return undefined
  const mine = ownOnField(s).some((x) => x.uid === b.uid)
  const field = mine ? ownOnField(s) : foesOnField(s)
  return field.find((x) => x.uid !== b.uid && x.hp > 0 && x.talent === talent)?.uid
}

/**
 * An attack with the hand on the table. `z`: true for a Z-Move (docs/35), or where a Flying, Ground or Water one went
 * — the strike it comes back with, from the roll it kept. `zType`: the type the player picked for it.
 */
function resolveAttack(
  s: BattleState,
  side: Side,
  data: GameData,
  log: LogEntry[],
  rng?: Rng,
  z: boolean | ZAway = false,
  zType?: PokeType,
) {
  const atk = side === 'player' ? activeBattler(s) : s.enemy
  const def = side === 'player' ? s.enemy : activeBattler(s)
  const levels = side === 'player' ? s.playerLevels : s.enemyLevels
  // Mirror (docs/51): once a battle, its lowest die turns into its highest before the attack.
  const mirrored = atk.talent === 'mirror' && !atk.talentSpent?.includes('mirror') ? mirrorDice(s.dice, data) : null
  if (mirrored) {
    s.dice = mirrored.dice
    atk.talentSpent = [...(atk.talentSpent ?? []), 'mirror']
    log.push({ kind: 'talent', side, uid: atk.uid, talent: 'mirror', amount: mirrored.value, dice: mirrored.dice, index: mirrored.index })
  }
  const dice = s.dice

  let result = computeDamage(dice, atk.types, def.types, levels, data, z ? zType : undefined, attackModsFor(s, atk, def))
  atk.attacks = (atk.attacks ?? 0) + 1
  // A raid's own rules on this hit (docs/40): shields, halved hits, hits never resisted…
  if (s.raidHit) result = adjustRaidHit(result, s.raidHit, levels.typeScale)
  const zMove = z === true && rng ? zMoveOf(result, data, rng) : null
  if (zMove) {
    result = zMove.result
    log.push({ kind: 'zmove', side, uid: atk.uid, type: result.attackType, effect: zMove.effect, landed: zMove.landed })
    // Up, down or under: out of reach for a turn, the roll kept for the strike at the start of its next one.
    if (isAway(zMove.effect)) {
      atk.away = { how: zMove.effect, dice: [...dice], ...(zType && { type: zType }) }
      log.push({ kind: 'away', side, uid: atk.uid, how: zMove.effect })
      return endAttack(s, side, data, log, rng)
    }
    // Steel: every status shaken off before the blow (so a confusion costs nothing either).
    if (zMove.effect === 'cleanse' && hasAnyStatus(atk.status)) {
      atk.status = emptyStatus()
      log.push({ kind: 'cleansed', side, uid: atk.uid })
    }
  }
  // The target is away: the attack misses, and nothing it carries lands.
  if (def.away) {
    log.push({ kind: 'dodge', side: other(side), uid: def.uid, how: def.away.how })
    confusedRecoil(atk, side, data, log)
    return endAttack(s, side, data, log, rng)
  }
  def.hp = Math.max(0, def.hp - result.final)
  // Sturdy (docs/51): once a battle, the hit that would K.O. it leaves it at 1 HP.
  const sturdy = def.hp === 0 && result.final > 0 && def.talent === 'sturdy' && !def.talentSpent?.includes('sturdy')
  if (sturdy) {
    def.hp = 1
    def.talentSpent = [...(def.talentSpent ?? []), 'sturdy']
  }
  // The talents that changed the hit are said first, then it lands (an ability's pop-up, as in the main games).
  if (result.talent?.key) log.push({ kind: 'talent', side, uid: atk.uid, talent: result.talent.key })
  for (const g of result.talent?.guards ?? []) {
    // Disguise (docs/51): spent on the first hit it takes.
    if (g.key === 'disguise') def.talentSpent = [...(def.talentSpent ?? []), 'disguise']
    log.push({
      kind: 'talent',
      side: other(side),
      uid: g.uid,
      talent: g.key,
      amount: result.talent!.saved,
      ...(g.uid !== def.uid && { ally: def.uid }),
      ...(s.allyFriendGuard?.uid === g.uid && { name: s.allyFriendGuard.name }),
    })
  }
  if (result.talent?.powerSpot)
    log.push({
      kind: 'talent',
      side,
      uid: result.talent.powerSpot,
      talent: 'powerSpot',
      ally: atk.uid,
      ...(s.allyPowerSpot?.uid === result.talent.powerSpot && { name: s.allyPowerSpot.name }),
    })
  s.lastDamage = result
  log.push({
    kind: 'damage',
    side,
    target: other(side),
    targetUid: def.uid,
    amount: result.final,
    hpAfter: def.hp,
    dice,
    result,
    ...(z && { z: typeof z === 'string' ? { from: z } : {} }),
  })
  if (sturdy) log.push({ kind: 'talent', side: other(side), uid: def.uid, talent: 'sturdy' })
  if (result.final > 0) hitTalents(atk, def, side, result.final, data.config.status, log, rng ?? createRng(s.turn))
  const all = statusesFromRoll(dice, data, levels)
  // An attack with no effect inflicts nothing either; nor one a raid's shield or terrain stopped (docs/40).
  if (def.hp > 0 && !result.immune && !s.raidHit?.bounced && !s.raidHit?.noStatus) {
    // Freeze and Paralysis land on their chance (each face adds to it); a sure one draws nothing.
    const chanceRng = rng ?? createRng(s.turn)
    const apps: StatusApplication[] = []
    for (const a of all) {
      if (a.status === 'heal') continue
      if (shrugs(def, a.status)) {
        log.push({ kind: 'talent', side: other(side), uid: def.uid, talent: 'limber' })
        continue
      }
      const chance = a.chance ?? 1
      if (chance >= 1 || chanceRng.next() < chance) apps.push(a)
      else log.push({ kind: 'status_resisted', target: other(side), targetUid: def.uid, status: a.status, chance })
    }
    // A raid Pokémon's burns that last longer (Beads of Ruin, docs/40).
    const longer = s.raidHit?.burnLonger ?? 0
    if (longer) for (const a of apps) if (a.status === 'burn' && a.turns != null) a.turns += longer
    def.status = applyStatuses(def.status, apps, data.config.status)
    // Magma Armor (docs/51): a freeze holds it one turn only.
    if (def.talent === 'magmaArmor' && def.status.frozen > MAGMA_ARMOR_TURNS && apps.some((a) => a.status === 'frozen')) {
      def.status = { ...def.status, frozen: MAGMA_ARMOR_TURNS }
      log.push({ kind: 'talent', side: other(side), uid: def.uid, talent: 'magmaArmor' })
    }
    for (const a of apps)
      log.push({
        kind: 'status',
        target: other(side),
        targetUid: def.uid,
        status: a.status,
        stacks: a.stacks,
        turns: a.turns,
        ...(a.level && { level: a.level }),
        ...(a.chance != null && { chance: a.chance }),
      })
  }
  if (zMove?.landed) applyZEffect(zMove.effect, atk, def, side, result.final, data, log)
  // Heal faces: the attacker restores HP on top of the damage it dealt.
  const heal = all.find((a) => a.status === 'heal')
  if (heal?.amount && atk.hp > 0 && atk.hp < atk.maxHp) {
    const before = atk.hp
    atk.hp = Math.min(atk.maxHp, atk.hp + heal.amount)
    log.push({ kind: 'heal', side, uid: atk.uid, amount: atk.hp - before, hpAfter: atk.hp })
  }
  confusedRecoil(atk, side, data, log)
  endAttack(s, side, data, log, rng)
}

const NOOP = (state: BattleState) => ({ state, log: [] as LogEntry[] })

/** A throw's damage to the foe in front, as `a`'s attack would deal it: what the reroll lesson weighs its throws by. */
const lessonHit =
  (s: BattleState, a: Battler, data: GameData): LessonHit =>
  (dice) =>
    computeDamage(dice, a.types, s.enemy.types, s.playerLevels, data, undefined, attackModsFor(s, a, s.enemy)).final

export function reduce(
  state: BattleState,
  e: BattleEvent,
  data: GameData,
  rng: Rng,
): { state: BattleState; log: LogEntry[] } {
  const terminal = state.phase === 'won' || state.phase === 'lost' || state.phase === 'fled' || state.phase === 'done'
  if (terminal) return NOOP(state)
  const s = structuredClone(state)
  const log: LogEntry[] = []
  if (s.double) s.enemy = s.double.foes[s.double.foeIndex]!

  switch (e.t) {
    case 'ROLL': {
      if (s.phase !== 'player_roll') return NOOP(state)
      const a = activeBattler(s)
      s.dice = rollAll(a.dice, data, rng)
      // The reroll lesson: the first throw an average hit that leaves the foe for the pair to finish; the second the
      // worst these dice can do, with a reroll left to mend it and a pair to land.
      const lesson = s.lesson
      if (lesson?.step === 'wait') {
        lesson.throws += 1
        if (lesson.throws === 1) s.dice = lessonFirstRoll(a.dice, data, lessonHit(s, a, data), s.enemy.hp) ?? s.dice
        else if (
          lesson.throws >= LESSON_THROW &&
          a.rerollsLeft > 0 &&
          s.dice.length >= 2 &&
          lessonPairValue(a.dice, data) != null
        ) {
          s.dice = lessonBadRoll(a.dice, data)
          lesson.step = 'reroll'
        }
      }
      s.selected = s.dice.map(() => false)
      s.phase = 'player_reroll'
      log.push({ kind: 'roll', side: 'player', dice: s.dice })
      break
    }
    case 'TOGGLE_DIE': {
      if (s.phase !== 'player_reroll' || e.i < 0 || e.i >= s.dice.length) return NOOP(state)
      s.selected[e.i] = !s.selected[e.i]
      break
    }
    case 'REROLL': {
      const a = activeBattler(s)
      if (s.phase !== 'player_reroll' || a.rerollsLeft <= 0 || !s.selected.some(Boolean)) return NOOP(state)
      // One press = one reroll spent, however many dice were selected.
      const mask = [...s.selected]
      // The reroll lesson's reroll lands its pair; any other is thrown as usual.
      const rigged = s.lesson?.step === 'reroll' ? lessonPairRoll(s.dice, mask, data) : null
      let next = rigged ?? rerollMasked(s.dice, mask, data, rng, a.talent === 'reroller')
      // A reroll of the lesson's first throw stays in its window: the foe left standing, for the pair to finish.
      if (!rigged && s.lesson?.step === 'wait' && s.lesson.throws === 1) {
        const hit = lessonHit(s, a, data)
        const window = lessonWindow(a.dice, data, hit, s.enemy.hp)
        const fits = (d: RolledDie[]) => !window || (hit(d) >= window.min && hit(d) <= window.max)
        for (let i = 0; i < 50 && !fits(next); i++) next = rerollMasked(s.dice, mask, data, rng, a.talent === 'reroller')
        if (!fits(next)) next = s.dice
      }
      s.dice = next
      if (s.lesson?.step === 'reroll') s.lesson.step = 'attack'
      a.rerollsLeft -= 1
      s.selected = s.dice.map(() => false)
      log.push({ kind: 'reroll', side: 'player', mask, dice: s.dice, rerollsLeft: a.rerollsLeft })
      break
    }
    case 'ATTACK': {
      if (s.phase !== 'player_reroll') return NOOP(state)
      // The lesson's throw attacked with: it's over, mended or not.
      if (s.lesson && (s.lesson.step === 'reroll' || s.lesson.step === 'attack')) s.lesson.step = 'done'
      resolveAttack(s, 'player', data, log, rng)
      break
    }
    case 'ZMOVE': {
      if (!canZMove(s, data)) return NOOP(state)
      if (e.type && !zTypeChoices(s, data).includes(e.type)) return NOOP(state)
      const a = activeBattler(s)
      // A two-type Pokémon with one of its crystals: its Z-Move takes that type (docs/62 §6).
      const only = s.zTypes && a.types.length > 1 ? zTypesOf(s, a) : []
      // Stunned, it is a Steel-type's own Z-Move that shakes the stun off, whatever its other type.
      const type = s.phase === 'player_stunned' ? 'steel' : (e.type ?? (only.length === 1 ? only[0] : undefined))
      // A Steel-type frozen or paralyzed: its Z-Move shakes off the stun and every status, then it throws and strikes.
      if (s.phase === 'player_stunned') {
        a.status = emptyStatus()
        log.push({ kind: 'cleansed', side: 'player', uid: a.uid })
        s.dice = rollAll(a.dice, data, rng)
        s.selected = s.dice.map(() => false)
        log.push({ kind: 'roll', side: 'player', dice: s.dice })
      }
      s.zUsed = (s.zUsed ?? 0) + 1
      a.powered = 'z'
      resolveAttack(s, 'player', data, log, rng, true, type)
      break
    }
    case 'USE_ITEM': {
      // One item per turn — before the roll, after it, or while stunned. It doesn't end the turn.
      const phaseOk = s.phase === 'player_roll' || s.phase === 'player_reroll' || s.phase === 'player_stunned'
      if (!phaseOk || s.itemUsedThisTurn) return NOOP(state)
      const item = data.items[e.key]
      const target = s.player.find((b) => b.uid === (e.targetUid ?? activeBattler(s).uid))
      if (!item || !target) return NOOP(state)
      const fx = item.effect
      if (s.noHealItems && (fx.kind === 'heal' || fx.kind === 'revive')) return NOOP(state)
      // Only a revive works on a K.O.'d Pokémon (a benched one: the active can't be K.O. on your turn), and only on one.
      if ((fx.kind === 'revive') !== target.hp <= 0) return NOOP(state)
      if (fx.kind === 'revive') {
        target.hp = reviveHp(fx.percent, target.maxHp)
        target.status = emptyStatus()
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount: target.hp, hpAfter: target.hp, revived: true })
        // A double battle with a spot empty (yours fought on alone): it stands back up there, and acts from next round.
        const d = s.double
        const at = s.player.indexOf(target)
        if (d && d.ownSlots.length < (d.ownMax ?? 2) && !d.ownSlots.includes(at)) {
          d.ownSlots.push(at)
          if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
        }
      } else if (fx.kind === 'heal') {
        if (target.hp >= target.maxHp) return NOOP(state)
        const amount = Math.min(fx.amount, target.maxHp - target.hp)
        target.hp += amount
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount, hpAfter: target.hp })
      } else if (fx.kind === 'cure') {
        const cured = fx.statuses.filter((k) => hasStatus(target.status, k))
        if (!cured.length) return NOOP(state)
        target.status = clearStatuses(target.status, cured)
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount: 0, hpAfter: target.hp, cured })
        // Cured of the stun that was about to eat the turn: the turn goes ahead.
        if (s.phase === 'player_stunned' && target === activeBattler(s) && !stunKind(target.status)) s.phase = 'player_roll'
      } else if (fx.kind === 'rerolls') {
        const gained = Math.min(fx.amount, target.rerolls - target.rerollsLeft)
        if (gained <= 0) return NOOP(state)
        target.rerollsLeft += gained
        log.push({ kind: 'item', key: item.key, targetUid: target.uid, amount: 0, hpAfter: target.hp, rerolls: gained })
      } else return NOOP(state) // Rare Candy and balls aren't battle items
      s.itemUsedThisTurn = true
      checkHpForms(s, data, log)
      break
    }
    case 'MEGA': {
      const a = activeBattler(s)
      const mega = megaChoices(s, data).find((m) => m.dex === e.toDex)
      if (!mega) return NOOP(state)
      megaEvolve(s, 'player', a, mega, data, rng, log)
      s.megaUsed = (s.megaUsed ?? 0) + 1
      break
    }
    case 'GMAX': {
      const a = activeBattler(s)
      const form = gmaxChoices(s, data).find((m) => m.dex === e.toDex)
      if (!form) return NOOP(state)
      gigantamax(s, 'player', a, form, data, rng, log)
      if (s.ownLimits) s.gmaxUsed = (s.gmaxUsed ?? 0) + 1
      else s.megaUsed = (s.megaUsed ?? 0) + 1
      break
    }
    case 'CHANGE_FORM': {
      const a = activeBattler(s)
      const form = formChoices(s, data).find((f) => f.dex === e.toDex)
      if (!form) return NOOP(state)
      changeForm(s, 'player', a, form, data, log)
      a.formChanges = (a.formChanges ?? 0) + 1
      break
    }
    case 'PASS': {
      if (s.phase !== 'player_stunned') return NOOP(state)
      const a = activeBattler(s)
      a.status = consumeStun(a.status)
      tickGmax(s, 'player', data, log)
      if (s.single) endStep(s)
      else if (s.double) {
        if (!doubleKnockouts(s, log)) beginDoubleTurn(s, data, log, rng)
      } else beginTurn(s, 'enemy', data, log, rng)
      break
    }
    case 'SWITCH': {
      if (s.double) {
        if (!doubleSwitch(s, e.instanceId, data, log, rng)) return NOOP(state)
        break
      }
      const idx = s.player.findIndex((b) => b.uid === e.instanceId)
      const target = s.player[idx]
      if (!target || target.hp <= 0 || idx === s.activeIndex) return NOOP(state)
      const outgoing = activeBattler(s)
      const switchable = s.phase === 'player_switch' || ((s.phase === 'player_roll' || s.phase === 'player_reroll') && data.config.allowVoluntarySwitch)
      // A Gigantamax Pokémon shrinks back when it leaves the field; so does a timed Mega (the gem rules) change back.
      if (switchable && outgoing.gmax) endGmax('player', outgoing, data, log)
      if (switchable && outgoing.megaTimer) endMega('player', outgoing, data, log)
      if (switchable) naturalCure(outgoing, 'player', log)
      if (s.phase === 'player_switch') {
        s.activeIndex = idx
        if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
        log.push({ kind: 'switch', uid: target.uid, free: true })
        copyFoeDice(s, log)
        beginTurn(s, s.nextActor, data, log, rng)
      } else if ((s.phase === 'player_roll' || s.phase === 'player_reroll') && data.config.allowVoluntarySwitch) {
        // Before or after the roll (the UI rolls for you): the dice are dropped and the turn ends.
        s.activeIndex = idx
        if (!s.participants.includes(target.uid)) s.participants.push(target.uid)
        log.push({ kind: 'switch', uid: target.uid, free: false })
        copyFoeDice(s, log)
        afterAction(s, 'player', data, log, rng)
      } else return NOOP(state)
      break
    }
    case 'TARGET': {
      if (!s.double || (s.phase !== 'player_roll' && s.phase !== 'player_reroll')) return NOOP(state)
      const i = s.double.foes.findIndex((f) => f.uid === e.uid)
      if (i < 0 || i === s.double.foeIndex || !s.double.foeSlots.includes(i) || s.double.foes[i]!.hp <= 0) return NOOP(state)
      setFront(s, s.activeIndex, i, log, true)
      // Ditto copies the foe it aims at, while its dice are still in its hand.
      if (s.phase === 'player_roll') copyTarget(s, 'player', log)
      break
    }
    case 'FORFEIT': {
      for (const b of s.player) b.hp = 0
      finish(s, 'lost', log, 'forfeit')
      break
    }
    case 'RUN': {
      if (!s.canRun || (s.phase !== 'player_roll' && s.phase !== 'player_reroll')) return NOOP(state)
      finish(s, 'fled', log)
      break
    }
    case 'AI_TURN': {
      if (s.phase !== 'enemy_turn') return NOOP(state)
      // A double battle: the foe attacks one of yours at random (docs/33), with its own plan if it is the ace.
      if (s.double) aimAtRandom(s, rng, log)
      const en = s.enemy
      const target = activeBattler(s)
      // A trainer's ace Mega Evolves or Gigantamaxes on its first turn; a type changer picks the type best against you.
      const plan = s.enemyPlan
      if (plan && !s.enemyPlanDone && en.hp > 0) {
        const mega = plan.mega ? data.species[plan.mega] : undefined
        const gmax = plan.gmax ? data.species[plan.gmax] : undefined
        if (mega && !en.powered) megaEvolve(s, 'enemy', en, mega, data, rng, log)
        else if (gmax && !en.powered) gigantamax(s, 'enemy', en, gmax, data, rng, log)
        s.enemyPlanDone = true
        if (s.double) s.double.plansDone = [...(s.double.plansDone ?? []), en.uid]
      }
      if (plan?.formChanges && (en.formChanges ?? 0) < data.config.formChangesPerBattle) {
        const form = foeTypeForm(s, en, target, data, rng)
        if (form) {
          changeForm(s, 'enemy', en, form, data, log)
          en.formChanges = (en.formChanges ?? 0) + 1
        }
      }
      // A trainer's potion goes down first, once, when the next hit could K.O. — it doesn't cost the turn.
      const heal = en.item ? potionHeal(en.item, data) : 0
      if (
        heal > 0 &&
        shouldUsePotion(
          {
            hp: en.hp,
            maxHp: en.maxHp,
            attackerDice: target.dice,
            attackerTypes: target.types,
            defenderTypes: en.types,
            attackerLevels: s.playerLevels,
          },
          data,
          rng,
        )
      ) {
        const amount = Math.min(heal, en.maxHp - en.hp)
        en.hp += amount
        log.push({ kind: 'item', key: en.item!, targetUid: en.uid, amount, hpAfter: en.hp, side: 'enemy' })
        en.item = null
        checkHpForms(s, data, log)
      }
      // The reroll lesson's fight: the foe's throws are set (LESSON_FOE), so the fight plays the same for everyone.
      const lesson = s.lesson && s.lesson.step !== 'done' ? s.lesson : null
      const foePlan = lesson ? LESSON_FOE[lesson.foeThrows ?? 0] : undefined
      if (lesson) lesson.foeThrows = (lesson.foeThrows ?? 0) + 1
      const setThrow = foePlan ? lessonFoeRoll(en.dice, foePlan.value, data) : null
      s.dice = setThrow ?? rollAll(en.dice, data, rng)
      log.push({ kind: 'roll', side: 'enemy', dice: s.dice })
      const setReroll = setThrow && foePlan?.reroll != null ? lessonFoeRoll(en.dice, foePlan.reroll, data) : null
      if (setReroll && en.rerollsLeft > 0) {
        const mask = s.dice.map(() => true)
        s.dice = setReroll
        en.rerollsLeft -= 1
        log.push({ kind: 'reroll', side: 'enemy', mask, dice: s.dice, rerollsLeft: en.rerollsLeft })
      }
      for (let guard = 0; guard < 20 && !setThrow && en.rerollsLeft > 0; guard++) {
        const mask = aiRerollMask({
          dice: s.dice,
          attackerTypes: en.types,
          defenderTypes: target.types,
          levels: s.enemyLevels,
          data,
          rng,
          targetHp: target.hp,
        })
        if (!mask || !mask.some(Boolean)) break
        s.dice = rerollMasked(s.dice, mask, data, rng, s.enemy.talent === 'reroller')
        en.rerollsLeft -= 1
        log.push({ kind: 'reroll', side: 'enemy', mask, dice: s.dice, rerollsLeft: en.rerollsLeft })
      }
      // A trainer's ace attacks with its Z-Move the first time it can (docs/35): never on a Pokémon already powered.
      const z = !!plan?.z && !s.enemyZDone && !en.powered
      if (z) {
        s.enemyZDone = true
        en.powered = 'z'
      }
      resolveAttack(s, 'enemy', data, log, rng, z)
      break
    }
  }
  return { state: s, log }
}

export interface BattleOutcome {
  result: 'won' | 'lost' | 'fled' | 'ongoing'
  /** Remaining HP of every player battler, by instance id. */
  hp: Record<string, number>
  participants: string[]
  /** The Pokémon active at the end — the one that earns XP in 'fighter' mode. */
  fighterUid: string
  /** A double battle: every foe K.O.'d, in order, with yours that were out (docs/33). */
  kos?: DoubleKo[]
}

export function battleOutcome(s: BattleState): BattleOutcome {
  const result = s.phase === 'won' || s.phase === 'lost' || s.phase === 'fled' ? s.phase : 'ongoing'
  return {
    result,
    hp: Object.fromEntries(s.player.map((b) => [b.uid, b.hp])),
    participants: [...s.participants],
    fighterUid: activeBattler(s).uid,
    ...(s.double && { kos: s.double.kos.map((k) => ({ ...k, fighters: [...k.fighters] })) }),
  }
}
