import type { GameConfig } from './types'

/** Starting values for every game_config key. Anything missing from the DB/bundle falls back to these. */
export const DEFAULT_CONFIG: GameConfig = {
  configVersion: 1,
  // v1.7: about a quarter of the v1.6 curve (XP per K.O. is the foe's level).
  xpCurve: { A: 0.5, B: 1.15, C: 1 },
  xpShareMode: 'fighter',
  regenPercentPerHour: 5,
  maxTeamSize: 3,
  maxLevel: 100,
  maxDice: 5,
  comboPayoutMode: 'highestDamage',
  skipPolicy: 'free',
  noEscape: true,
  starters: [1, 4, 7],
  starterLevel: 5,
  // Tuned with `pnpm balance` on the full Kanto content: ×1 HP keeps main-chain fights at ~3 turns with the v1.8 dice
  // schedule (×1.4 before it) while every hit stays exactly what the dice show; ×0.5 trainer gold paces the upgrades (v1.3).
  hpMultiplier: 1,
  goldMultiplier: 0.5,
  gymGoldMultiplier: 2,
  forcedCenterWhenHurt: true,
  encounterMode: 'deck',
  // Professor Oak's parting gift.
  startInventory: { 'poke-ball': 5, potion: 2 },
  scaleLevelSpread: 3,
  enemyUpgradeLevel: 1,
  allowVoluntarySwitch: true,
  maxBattleTurns: 150,
  multiExpShare: 0.3,
  // A bench Pokémon 14+ levels behind the fighter gets as much XP as the fighter did.
  multiExpGapBonus: 0.05,
  multiExpMaxShare: 1,
  // XP per K.O. = the foe's level × this, for the Pokémon and the exploration bar alike.
  xpMultiplier: 1,
  showRoundGauge: true,
  showRoundPreview: false,
  shinyChance: 0.01,
  status: {
    burn: { threshold: 1, damagePerStack: 1, duration: 3 },
    poison: { threshold: 2, damage: 3, duration: 3 },
    frozen: { threshold: 3, stunTurns: 2 },
    paralyze: { threshold: 2, stunTurns: 1 },
    confuse: { threshold: 2, recoilPercent: 10 },
    heal: { threshold: 2, amount: 'rollTotal' },
  },
  ai: { samples: 200, rerollGainThreshold: 0.08 },
  // Game Corner: every spin shows something. Returns 8.5 ₽ per 10 ₽ on average, plus the Porygon jackpot; a jackpot
  // when Porygon Lv.30+ is already yours refunds the spin, so the machine never becomes a money printer.
  slotMachine: {
    cost: 10,
    oneBall: { weight: 50, gold: 1 },
    twoBalls: { weight: 30, gold: 10 },
    threeBalls: { weight: 10, gold: 50 },
    jackpot: { weight: 10, gold: 10 },
    prizeDex: 137,
    prizeLevel: 30,
  },
  dayCare: {
    unlockPokedex: 20,
    slots: 2,
    xpPerTick: 1,
    tickMinutes: 30,
    maxXp: 500,
    eggPrice: 50,
    unownedWeight: 3,
    hatchRank: 3,
    hatchOffset: 5,
    hatchMinLevel: 5,
  },
}
