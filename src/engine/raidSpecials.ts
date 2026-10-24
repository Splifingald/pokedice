// The raid overhaul (docs/40, the user's answers of 2026-10-24): every progression raid gets its own numbers, its own
// rules and a last bar of its own, and Arceus's daily raid too. Behind its switch (`raidOverhaulOn`): off, raids play
// exactly as before. This file is the content (which raid has what); engine/raidBattle.ts plays it.
// Mega Evolution and Primal Reversion stay out of the raids of the regions before Kalos (the user's rule): those forms
// are Mega raids of their own, opened after Kalos (MEGA_RAIDS), the only way to get their gem or orb.
import { eventOpenTo } from './events'
import { megaDie } from './forms'
import type { DieType, GameData, PokeType } from './types'

/** Rain and sun raise one type's attacks and lower another's; snow and sandstorm wear down whoever isn't built for them. */
export const RAID_WEATHERS = ['rain', 'sun', 'snow', 'sand', 'harshSun', 'heavyRain', 'strongWinds'] as const
export type RaidWeather = (typeof RAID_WEATHERS)[number]
export type RaidTerrain = 'grassy' | 'misty'

/** What a telegraphed attack does when it fires (charged a round ahead, every `every` rounds). */
export type RaidMove =
  /** Hits every side still in, at full strength. */
  | 'spread'
  /** One strike at ×1.5. */
  | 'strong'
  /** One strike, then 3 Burn stacks on its target. */
  | 'burn'
  /** One strike at ×1.5, then it skips its next strike. */
  | 'recharge'
  /** It vanishes while charging (hits on it do half), then strikes at ×1.5. */
  | 'vanish'
  /** No strike: +2 dice for its next two strikes. */
  | 'charge'
  /** Hits every side, and costs it 5 % of its bar. */
  | 'blast'

export type RaidMod =
  /** A move charged a round ahead, every `every` rounds; 20 % of a bar dealt while it charges interrupts it. */
  | { k: 'telegraph'; every: number; move: RaidMove }
  /** Each new bar opens behind a shield worth `share` of the bar that only combos damage. */
  | { k: 'shield'; share: number }
  /** The first `n` hits on each new bar do half damage. */
  | { k: 'firstHits'; n: number }
  /** End of each round: heals `pct` of its bar, unless it is burned or poisoned ('status') or a combo hit it ('combo'). */
  | { k: 'regen'; pct: number; unless?: 'status' | 'combo' }
  /** Once per bar, the first time it drops below half of the bar, it heals `pct` of the bar. */
  | { k: 'recover'; pct: number }
  /** Each broken bar gives it one more die of this type. */
  | { k: 'barDie'; die: DieType }
  /** Each Pokémon it K.O.s gives it one more die of its first type, up to `max`. */
  | { k: 'koDie'; max: number }
  /** Its hits of these types (any type when absent) are never resisted. */
  | { k: 'neverResisted'; types?: PokeType[] }
  /** It strikes twice: every time at ×`mult`, or every `every` rounds at full strength. */
  | { k: 'twice'; mult: number; every?: number }
  /** End of each round: every side's Pokémon out ('all') or one at random loses `pct` of its max HP. */
  | { k: 'chip'; pct: number; who: 'all' | 'random' }
  /**
   * At each new bar (or only at `bars`, counted from 1), it takes the type that hits the side it faces hardest: one of
   * its menu forms (Arceus's plates, Ogerpon's masks) when it has them, else `types`, its `from` dice turning that type.
   */
  | { k: 'shift'; types?: PokeType[]; from?: DieType[]; count?: number; bars?: number[] }
  /** Attacks of this type do nothing to it, and the first one gives it a die of that type. */
  | { k: 'absorb'; type: PokeType }
  /** Its strikes are ×`mult` (on a target above `above` of its max HP, when set). */
  | { k: 'strikeMult'; mult: number; above?: number }
  /** Its strikes heal it by `pct` of the damage dealt. */
  | { k: 'lifesteal'; pct: number }
  /** A side's next Pokémon to come out loses `pct` of its max HP. */
  | { k: 'hazard'; pct: number }
  /** For its first `rounds` rounds it rolls half its dice (rounded up). */
  | { k: 'slowStart'; rounds: number }
  /** It strikes before each side's turn instead of after. */
  | { k: 'trickRoom' }
  /** It skips its strikes every `n`th round. */
  | { k: 'skipEvery'; n: number }
  /** A combo on it heals the attacker by `pct` of its max HP. */
  | { k: 'comboHeal'; pct: number }
  /** Its strike hits its target and the next side still in. */
  | { k: 'spacialRend' }
  /** Super-effective hits on it are ×`mult`. */
  | { k: 'prism'; mult: number }
  /** The sides' combo bonuses are cut by `pct`. */
  | { k: 'comboCut'; pct: number }
  /** The sides' dice upgrades count `levels` lower. */
  | { k: 'upgradeDrop'; levels: number }
  /** Burns it inflicts last `turns` more turns. */
  | { k: 'burnLonger'; turns: number }
  /** No items in this raid. */
  | { k: 'noItems' }
  /** Its strikes alternate: odd rounds heal the target `heal` of its max HP instead, even rounds hit at ×`mult`. */
  | { k: 'loveHate'; heal: number; mult: number }
  /** Statuses on it last one turn. */
  | { k: 'statusShort' }
  /** One more die of this type from the start. */
  | { k: 'extraDie'; die: DieType }
  /** No weather and no terrain, whatever. */
  | { k: 'airLock' }

/** A type's attacks scaled for both sides ('all', an aura) or only its own ('boss'). */
export interface RaidAura {
  type: PokeType
  mult: number
  who: 'all' | 'boss'
}

/** Its last bar (on top of any below-half form it unleashes, Giratina's and Zygarde's). */
export interface RaidFinal {
  /** Dice it gains. */
  dice?: DieType[]
  /** Its strikes hit every side still in, at ×`spread` each. */
  spread?: number
  /** Its end-of-round healing is ×`regen`. */
  regen?: number
  /** `reflect` of the damage it takes goes back to the attacker. */
  reflect?: number
  /** For this many rounds, every hit on it does half. */
  harden?: number
  /** It takes a new type before every strike (Arceus), not once per bar. */
  shiftEvery?: boolean
  /** The form it takes (Ultra Necrozma), its dice kept. */
  form?: number
  /** Its hits land as super effective on every type (Terapagos's Stellar Form). */
  stellar?: boolean
  /** Dice of the type it has shifted to (Rotom's appliance, Ogerpon's mask, Calyrex's steed). */
  shiftDice?: number
}

export type RaidTier =
  'trio' | 'guardian' | 'box' | 'apex' | 'mythic' | 'beast' | 'paradox' | 'minor' | 'mega'

export interface RaidSpecial {
  tier: RaidTier
  /** Its level (the sides' level cap too), HP bars, each bar's HP (× its own max HP) and its dice level. */
  level: number
  bars: number
  barHp: number
  upgradeLevel: number
  weather?: RaidWeather
  terrain?: RaidTerrain
  auras?: RaidAura[]
  mods: RaidMod[]
  final?: RaidFinal
}

const S = (
  tier: RaidTier,
  [level, bars, barHp, upgradeLevel]: [number, number, number, number],
  rest: Partial<Omit<RaidSpecial, 'tier' | 'level' | 'bars' | 'barHp' | 'upgradeLevel'>> = {},
): RaidSpecial => ({ tier, level, bars, barHp, upgradeLevel, mods: [], ...rest })

const tg = (move: RaidMove, every = 3): RaidMod => ({ k: 'telegraph', every, move })
const die = (...dice: DieType[]): RaidFinal => ({ dice })
const own = (type: PokeType, mult = 1.25): RaidAura => ({ type, mult, who: 'boss' })
const aura = (type: PokeType, mult = 1.25): RaidAura => ({ type, mult, who: 'all' })

/**
 * Each progression raid's (and Arceus's daily raid's) numbers and rules, by its Pokémon's dex. The numbers come from
 * `pnpm raid-overhaul-balance` (scripts/raid-overhaul-balance.ts): each tier's win-rate target with a team of counters.
 */
export const RAID_SPECIALS: Readonly<Record<number, RaidSpecial>> = {
  // Kanto
  144: S('trio', [50, 3, 2.0, 8], { weather: 'snow', final: die('ice') }),
  145: S('trio', [50, 3, 1.8, 8], { final: die('electric') }),
  146: S('trio', [50, 3, 1.9, 8], { weather: 'sun', final: die('fire') }),
  150: S('apex', [70, 5, 1.0, 9], {
    mods: [{ k: 'shield', share: 0.25 }, tg('spread')],
    final: { dice: ['psychic', 'psychic'], spread: 0.6 },
  }),
  // Johto
  130: S('minor', [50, 3, 1.7, 8], { mods: [{ k: 'barDie', die: 'water' }], final: die('water') }),
  249: S('box', [55, 4, 2.3, 8], {
    weather: 'rain',
    mods: [{ k: 'firstHits', n: 1 }, tg('spread')],
    final: die('flying'),
  }),
  250: S('box', [55, 4, 1.4, 8], {
    weather: 'sun',
    mods: [{ k: 'regen', pct: 0.08, unless: 'status' }],
    final: die('fire'),
  }),
  // Hoenn
  383: S('box', [60, 4, 2.0, 8], { weather: 'sun', mods: [tg('spread')], final: die('ground', 'ground') }),
  382: S('box', [60, 4, 1.8, 8], { weather: 'rain', mods: [tg('spread')], final: die('water', 'water') }),
  384: S('apex', [70, 5, 1.3, 9], {
    mods: [{ k: 'airLock' }, tg('strong'), { k: 'chip', pct: 0.05, who: 'random' }],
    final: die('dragon', 'dragon'),
  }),
  377: S('trio', [55, 3, 2.8, 8], { weather: 'sand', final: die('rock') }),
  378: S('trio', [55, 3, 2.3, 8], { weather: 'snow', final: die('ice') }),
  379: S('trio', [55, 3, 2.4, 8], { mods: [{ k: 'shield', share: 0.15 }], final: die('steel') }),
  380: S('guardian', [50, 3, 2.1, 8], { mods: [{ k: 'recover', pct: 0.15 }], final: die('dragon') }),
  381: S('guardian', [50, 3, 2.7, 8], { mods: [tg('spread')], final: die('psychic') }),
  // Sinnoh
  483: S('box', [60, 4, 1.6, 8], { mods: [tg('recharge')], final: die('steel', 'steel') }),
  484: S('box', [60, 4, 0.6, 8], {
    weather: 'rain',
    mods: [{ k: 'spacialRend' }],
    final: die('water', 'water'),
  }),
  479: S('minor', [50, 3, 2.2, 8], {
    mods: [{ k: 'shift', types: ['fire', 'water', 'ice', 'flying', 'grass'], from: ['ghost'] }],
    final: { shiftDice: 1 },
  }),
  480: S('trio', [50, 3, 3.3, 8], { mods: [{ k: 'firstHits', n: 1 }], final: die('psychic') }),
  481: S('trio', [50, 3, 3.5, 8], { mods: [{ k: 'comboHeal', pct: 0.05 }], final: die('psychic') }),
  482: S('trio', [50, 3, 3.0, 8], { mods: [{ k: 'barDie', die: 'psychic' }], final: die('psychic') }),
  487: S('apex', [70, 5, 0.9, 8], { mods: [tg('vanish')] }),
  485: S('guardian', [60, 3, 1.5, 8], {
    mods: [{ k: 'absorb', type: 'fire' }],
    final: { dice: ['fire'], spread: 0.6 },
  }),
  486: S('box', [65, 4, 1.7, 8], {
    mods: [
      { k: 'slowStart', rounds: 3 },
      { k: 'strikeMult', mult: 1.3, above: 0.75 },
    ],
    final: die('rock', 'ice', 'steel'),
  }),
  488: S('guardian', [55, 3, 1.6, 8], {
    mods: [{ k: 'regen', pct: 0.08 }],
    final: { dice: ['psychic'], regen: 2 },
  }),
  // Unova
  643: S('box', [60, 4, 1.6, 8], {
    mods: [{ k: 'neverResisted', types: ['fire'] }, tg('burn')],
    final: die('fire', 'fire'),
  }),
  644: S('box', [60, 4, 1.6, 8], {
    mods: [{ k: 'neverResisted', types: ['electric'] }, tg('strong')],
    final: die('electric', 'electric'),
  }),
  638: S('trio', [55, 3, 2.4, 8], { mods: [{ k: 'firstHits', n: 1 }], final: die('fighting') }),
  639: S('trio', [55, 3, 2.7, 8], { mods: [{ k: 'hazard', pct: 0.08 }], final: die('fighting') }),
  640: S('trio', [55, 3, 2.9, 8], { terrain: 'grassy', final: die('fighting') }),
  641: S('guardian', [60, 3, 3.0, 8], { mods: [{ k: 'twice', mult: 1, every: 3 }], final: die('flying') }),
  642: S('guardian', [60, 3, 2.7, 8], { weather: 'rain', final: die('electric') }),
  645: S('guardian', [60, 3, 2.6, 8], { weather: 'sand', final: die('ground') }),
  // The user's call: no last bar for Kyurem.
  646: S('apex', [70, 5, 1.2, 9], { mods: [tg('spread')] }),
  // Kalos
  716: S('box', [65, 4, 1.8, 8], {
    auras: [aura('fairy')],
    mods: [tg('charge')],
    final: die('fairy', 'fairy'),
  }),
  717: S('box', [65, 4, 0.65, 8], {
    auras: [aura('dark')],
    mods: [{ k: 'lifesteal', pct: 0.25 }],
    final: die('dark', 'dark'),
  }),
  718: S('apex', [70, 5, 1.4, 9], {
    mods: [
      { k: 'regen', pct: 0.06, unless: 'combo' },
      { k: 'neverResisted', types: ['ground'] },
      tg('spread'),
    ],
  }),
  // Alola
  789: S('minor', [50, 2, 4.0, 8], { mods: [{ k: 'skipEvery', n: 2 }], final: { harden: 2 } }),
  791: S('box', [65, 4, 1.0, 8], {
    weather: 'sun',
    mods: [{ k: 'statusShort' }],
    final: die('steel', 'steel'),
  }),
  792: S('box', [65, 4, 1.25, 8], {
    mods: [{ k: 'firstHits', n: 1 }, tg('spread')],
    final: die('ghost', 'ghost'),
  }),
  800: S('apex', [70, 5, 0.8, 9], {
    mods: [
      { k: 'prism', mult: 0.75 },
      { k: 'shift', types: ['steel', 'ghost'], from: ['psychic'], count: 2, bars: [2, 3] },
    ],
    final: { form: 10157, dice: ['dragon', 'dragon'], spread: 0.6 },
  }),
  785: S('trio', [60, 3, 2.9, 8], { auras: [own('electric')], final: die('electric') }),
  786: S('trio', [60, 3, 2.9, 8], { auras: [own('psychic')], final: die('psychic') }),
  787: S('trio', [60, 3, 3.6, 8], { terrain: 'grassy', final: die('grass') }),
  788: S('trio', [60, 3, 2.6, 8], { terrain: 'misty', final: die('water') }),
  793: S('beast', [60, 3, 2.7, 8], { mods: [{ k: 'koDie', max: 3 }], final: die('rock') }),
  794: S('beast', [60, 3, 2, 8], {
    mods: [
      { k: 'koDie', max: 3 },
      { k: 'lifesteal', pct: 0.25 },
    ],
    final: die('fighting'),
  }),
  795: S('beast', [62, 3, 2.8, 8], {
    mods: [
      { k: 'koDie', max: 3 },
      { k: 'twice', mult: 0.6 },
    ],
    final: die('bug'),
  }),
  796: S('beast', [62, 3, 3.7, 8], { mods: [{ k: 'koDie', max: 3 }], final: die('electric') }),
  797: S('beast', [65, 3, 2.8, 8], {
    mods: [
      { k: 'koDie', max: 3 },
      { k: 'firstHits', n: 1 },
    ],
    final: die('steel'),
  }),
  798: S('beast', [65, 3, 3.1, 8], {
    mods: [{ k: 'koDie', max: 3 }, { k: 'neverResisted' }],
    final: die('grass'),
  }),
  799: S('beast', [70, 3, 1.7, 8], { mods: [{ k: 'koDie', max: 3 }], final: die('dark') }),
  805: S('beast', [63, 3, 2.9, 8], {
    mods: [{ k: 'koDie', max: 3 }, { k: 'trickRoom' }],
    final: die('steel'),
  }),
  806: S('beast', [63, 3, 3.7, 8], { mods: [{ k: 'koDie', max: 3 }, tg('blast')], final: die('ghost') }),
  803: S('minor', [55, 3, 4.0, 8], { mods: [{ k: 'koDie', max: 3 }], final: die('poison') }),
  // Galar
  890: S('apex', [70, 5, 1.0, 9], {
    mods: [{ k: 'chip', pct: 0.04, who: 'all' }, tg('spread')],
    final: die('dragon', 'dragon'),
  }),
  888: S('box', [70, 4, 2.1, 8], {
    mods: [{ k: 'extraDie', die: 'fairy' }, tg('strong')],
    final: die('steel', 'steel'),
  }),
  889: S('box', [70, 4, 1.5, 8], {
    mods: [{ k: 'shield', share: 0.2 }],
    final: { dice: ['steel', 'steel'], reflect: 0.2 },
  }),
  // Kubfu's last bar: it becomes Urshifu (Single Strike), with a Dark die.
  891: S('minor', [55, 3, 3.9, 8], {
    mods: [{ k: 'barDie', die: 'fighting' }],
    final: { form: 892, dice: ['dark'] },
  }),
  894: S('guardian', [65, 3, 2.2, 8], { mods: [{ k: 'twice', mult: 0.6 }], final: die('electric') }),
  895: S('guardian', [65, 3, 1.8, 8], { auras: [own('dragon')], final: die('dragon') }),
  896: S('guardian', [75, 3, 2.3, 8], { weather: 'snow', mods: [{ k: 'koDie', max: 3 }], final: die('ice') }),
  897: S('guardian', [75, 3, 2.8, 8], { mods: [{ k: 'koDie', max: 3 }], final: die('ghost') }),
  898: S('apex', [80, 5, 1.0, 9], {
    mods: [{ k: 'shift', types: ['ice', 'ghost'], from: ['grass', 'base'] }, { k: 'noItems' }],
    final: { shiftDice: 2 },
  }),
  905: S('guardian', [70, 4, 4, 8], {
    mods: [{ k: 'loveHate', heal: 0.05, mult: 1.4 }],
    final: { dice: ['fairy'], spread: 0.6 },
  }),
  10169: S('trio', [70, 3, 2.0, 8], { mods: [{ k: 'firstHits', n: 1 }], final: die('psychic') }),
  10170: S('trio', [70, 3, 2.6, 8], { mods: [tg('strong')], final: die('fighting') }),
  10171: S('trio', [70, 3, 2.5, 8], { mods: [tg('spread')], final: die('dark') }),
  // Paldea
  1007: S('box', [75, 4, 1.3, 8], {
    weather: 'sun',
    auras: [own('fighting')],
    final: die('fighting', 'fighting'),
  }),
  1008: S('box', [75, 4, 1.1, 8], { auras: [own('electric')], final: die('electric', 'electric') }),
  1001: S('trio', [60, 3, 2.7, 8], { mods: [{ k: 'comboCut', pct: 0.3 }], final: die('grass') }),
  1002: S('trio', [60, 3, 2.5, 8], { mods: [{ k: 'strikeMult', mult: 1.2 }], final: die('ice') }),
  1003: S('trio', [60, 3, 1.6, 8], { mods: [{ k: 'upgradeDrop', levels: 2 }], final: die('ground') }),
  1004: S('trio', [60, 3, 3.4, 8], { mods: [{ k: 'burnLonger', turns: 2 }], final: die('fire') }),
  1014: S('trio', [70, 3, 2.3, 8], { mods: [{ k: 'strikeMult', mult: 1.2 }], final: die('fighting') }),
  1015: S('trio', [70, 3, 2.5, 8], { mods: [{ k: 'firstHits', n: 1 }], final: die('psychic') }),
  1016: S('trio', [70, 3, 2.5, 8], { mods: [{ k: 'regen', pct: 0.06 }], final: die('fairy') }),
  1017: S('guardian', [70, 3, 2.1, 8], { mods: [{ k: 'shift' }], final: { shiftDice: 1 } }),
  1009: S('paradox', [75, 3, 2.5, 8], { weather: 'sun', auras: [own('water')], final: die('dragon') }),
  1020: S('paradox', [75, 3, 1.8, 8], { weather: 'sun', auras: [own('fire')], final: die('dragon') }),
  1021: S('paradox', [75, 3, 1.9, 8], { weather: 'sun', auras: [own('electric')], final: die('dragon') }),
  1010: S('paradox', [75, 3, 2.4, 8], { auras: [own('grass')], final: die('psychic') }),
  1022: S('paradox', [75, 3, 2.4, 8], { auras: [own('rock')], final: die('psychic') }),
  1023: S('paradox', [75, 3, 2.3, 8], { auras: [own('steel')], final: die('psychic') }),
  1024: S('apex', [85, 5, 0.65, 9], {
    mods: [{ k: 'firstHits', n: 2 }, tg('spread')],
    final: { dice: ['normal', 'normal'], spread: 0.6, stellar: true },
  }),
  // Arceus, the daily raid (a mythical): the user's design, 5 bars so it changes plate often; no die on its last bar,
  // where it changes plate before every strike. 1.5× its HP per bar was asked; with its plates and Judgment playing,
  // the sims won 0 % there, so each bar is 0.65× (33 %, docs/40 §4).
  493: S('mythic', [70, 5, 0.65, 9], { mods: [{ k: 'shift' }, tg('spread')], final: { shiftEvery: true } }),
}

/** A Mega raid (after Kalos): the Pokémon of an earlier region's raid in its Mega or Primal form, and the item it gives. */
export interface MegaRaid {
  /** The form it fights in (a species row of kind 'mega'). */
  form: number
  /** Its raid's Pokémon. */
  base: number
  /** The gem or orb a win gives: the only way to get it. */
  gem: string
  special: RaidSpecial
}

const mega = (
  form: number,
  base: number,
  gem: string,
  numbers: [number, number, number, number],
  rest: Parameters<typeof S>[2] = {},
) => ({
  form,
  base,
  gem,
  special: S('mega', numbers, rest),
})

/** The Mega raids, by the form's dex (their raid key's number). Numbers from the same balance script. */
export const MEGA_RAIDS: Readonly<Record<number, MegaRaid>> = Object.fromEntries(
  [
    mega(10043, 150, 'mewtwonite-x', [75, 5, 0.85, 9], {
      mods: [{ k: 'shield', share: 0.25 }, tg('strong')],
      final: die('fighting', 'fighting'),
    }),
    mega(10044, 150, 'mewtwonite-y', [75, 5, 0.9, 9], {
      mods: [{ k: 'shield', share: 0.25 }, tg('spread')],
      final: { dice: ['psychic', 'psychic'], spread: 0.6 },
    }),
    mega(10041, 130, 'gyaradosite', [60, 3, 2.2, 8], {
      mods: [{ k: 'barDie', die: 'dark' }],
      final: die('dark'),
    }),
    mega(10062, 380, 'latiasite', [60, 3, 2.3, 8], {
      mods: [{ k: 'recover', pct: 0.15 }],
      final: die('dragon'),
    }),
    mega(10063, 381, 'latiosite', [60, 3, 2.9, 8], { mods: [tg('spread')], final: die('psychic') }),
    mega(10079, 384, 'meteorite', [75, 5, 1.0, 9], {
      weather: 'strongWinds',
      mods: [tg('strong'), { k: 'chip', pct: 0.05, who: 'random' }],
      final: die('dragon', 'dragon'),
    }),
    mega(10077, 382, 'blue-orb', [65, 4, 1.6, 8], {
      weather: 'heavyRain',
      mods: [tg('spread')],
      final: die('water', 'water'),
    }),
    mega(10078, 383, 'red-orb', [65, 4, 1.1, 8], {
      weather: 'harshSun',
      mods: [tg('spread')],
      final: die('ground', 'ground'),
    }),
    mega(10311, 485, 'heatranite', [65, 3, 1.4, 8], {
      mods: [{ k: 'absorb', type: 'fire' }],
      final: { dice: ['fire'], spread: 0.6 },
    }),
  ].map((m) => [m.form, m]),
)

/** The raid overhaul's switch (docs/40): Off, On for admin, On for everyone. The server reads the same row (0076). */
export const raidOverhaulOn = (data: GameData): boolean => eventOpenTo(data.config.raidOverhaul?.access, data)

/** A raid's rules with the overhaul on: a progression raid's (or a Mega raid's) by its dex, Arceus's daily raid. */
export function raidSpecialOf(data: GameData, dex: number, kind: 'daily' | 'progress'): RaidSpecial | null {
  if (!raidOverhaulOn(data)) return null
  if (kind === 'daily') return dex === 493 ? (RAID_SPECIALS[493] ?? null) : null
  return MEGA_RAIDS[dex]?.special ?? RAID_SPECIALS[dex] ?? null
}

/** A Mega raid's gem or orb, with the overhaul on: never sold, the raid's win is the only way to get it. */
export const megaRaidGem = (data: GameData, key: string): boolean =>
  raidOverhaulOn(data) && Object.values(MEGA_RAIDS).some((m) => m.gem === key)

/** The die a Mega raid's Pokémon starts with on top of its own, the one Mega Evolving gives (Mega Mewtwo X: Fighting). */
export function megaRaidDie(data: GameData, form: number): DieType | null {
  const m = MEGA_RAIDS[form]
  const base = m && data.species[m.base]
  const f = data.species[form]
  return base && f ? megaDie(base, f) : null
}

/** The weather's type boosts: × on a type's attacks, for both sides. */
export function weatherBoosts(weather: RaidWeather | undefined): Partial<Record<PokeType, number>> {
  switch (weather) {
    case 'rain':
      return { water: 1.25, fire: 0.75 }
    case 'sun':
      return { fire: 1.25, water: 0.75 }
    case 'harshSun':
      return { fire: 1.25, water: 0.5 }
    case 'heavyRain':
      return { water: 1.25 }
    default:
      return {}
  }
}

/** The types snow and sandstorm spare (they wear down everyone else's Pokémon at the end of each round). */
export const WEATHER_SPARES: Partial<Record<RaidWeather, PokeType[]>> = {
  snow: ['ice'],
  sand: ['rock', 'ground', 'steel'],
}

/** Snow and sandstorm's wear, of max HP per round. */
export const WEATHER_CHIP = 0.04
/** Grassy terrain's healing, of max HP per round. */
export const GRASSY_HEAL = 0.04
/** A telegraphed move is interrupted by this share of a bar dealt while it charges. */
export const INTERRUPT_SHARE = 0.2
