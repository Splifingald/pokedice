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
  maxDice: 6,
  comboPayoutMode: 'highestDamage',
  skipPolicy: 'free',
  noEscape: true,
  starters: [1, 4, 7],
  starterLevel: 5,
  // Tuned with `pnpm balance` on the full Kanto content: ×1.4 HP keeps main-chain fights at ~2–3.5 turns while every
  // hit stays exactly what the dice show (v1.4); ×0.5 trainer gold paces the upgrades (v1.3).
  hpMultiplier: 1.4,
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
  // XP per K.O. = the foe's level × this, for the Pokémon and the exploration bar alike.
  xpMultiplier: 1,
  showRoundGauge: true,
  showRoundPreview: false,
  status: {
    burn: { threshold: 1, damagePerStack: 1, duration: 3 },
    poison: { threshold: 2, damage: 3, duration: 3 },
    frozen: { threshold: 3, stunTurns: 2 },
    paralyze: { threshold: 2, stunTurns: 1 },
    confuse: { threshold: 2 },
    heal: { threshold: 2, amount: 'rollTotal' },
  },
  ai: { samples: 200, rerollGainThreshold: 0.08 },
}
