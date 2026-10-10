import type { GameConfig } from './types'

/** Starting values for every game_config key. Anything missing from the DB/bundle falls back to these. */
export const DEFAULT_CONFIG: GameConfig = {
  configVersion: 1,
  // v1.7: about a quarter of the v1.6 curve (XP per K.O. is the foe's level).
  xpCurve: { A: 0.5, B: 1.15, C: 1 },
  xpShareMode: 'fighter',
  maxTeamSize: 3,
  maxLevel: 100,
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
  versusUpgradeLevel: 5,
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
  cloudSyncMinutes: 15,
  maxFriends: 100,
  energy: { enabled: true, max: 50, minutesPerEnergy: 30 },
  status: {
    burn: { threshold: 1, percentPerStack: 4, duration: 3 },
    poison: { threshold: 2, percent: 10, duration: 3 },
    frozen: { threshold: 3, stunTurns: 2 },
    paralyze: { threshold: 2, stunTurns: 1 },
    confuse: { threshold: 2, recoilPercent: 10 },
    heal: { threshold: 2, amount: 'rollTotal' },
  },
  ai: { samples: 200, rerollGainThreshold: 0.08 },
  // Game Corner: every spin shows something. Returns 8.5 ₽ per 10 ₽ on average, plus the Porygon jackpot; a jackpot
  // when Porygon Lv.30+ is already yours refunds the spin, so the machine never becomes a money printer.
  // Raikou, Entei and Suicune, once both tower legendaries are caught: ~2% each per Johto wild encounter.
  roamers: {
    regionId: 'johto',
    requires: [249, 250],
    chance: 0.02,
    level: 40,
    dex: [243, 244, 245],
  },
  slotMachine: {
    cost: 10,
    oneBall: { weight: 50, gold: 1 },
    twoBalls: { weight: 30, gold: 10 },
    threeBalls: { weight: 10, gold: 50 },
    jackpot: { weight: 10, gold: 10 },
    prizeDex: 137,
    prizeLevel: 30,
  },
  // One Day Care for every region (docs/15): two of yours, four friends' visitors, Lv.100 the only XP cap, an Egg-group
  // check every 12 h and Ditto's every 24 h, Egg now for ₽200, ₽10 when a hatchling isn't kept, shiny 1 in 100.
  dayCare: {
    unlockPokedex: 20,
    slots: 2,
    friendSlots: 4,
    xpPerTick: 1,
    tickMinutes: 10,
    breedHours: 12,
    breedDittoHours: 24,
    rushPrice: 200,
    notKeptGold: 10,
    shinyChance: 0.01,
    unownedWeight: 4,
    hatchRank: 3,
    hatchOffset: 5,
    hatchMinLevel: 5,
  },
  // Off until the admin sets a PayPal link and switches it on.
  donation: { enabled: false, paypalUrl: '', round: 0 },
  // No Discord button until the admin sets the invite link.
  discordUrl: '',
  // Mega Evolution opens with Kalos (X and Y's mechanic) and then works in every region: a Lv.50 Pokémon of a species
  // with a Mega form (or a Primal / Ultra Burst one), once per battle for the whole team — Gigantamax included.
  // Trainers do it too, in the games that have it — Hoenn (Omega Ruby / Alpha Sapphire), Kalos, Alola — with their ace.
  megaEvolution: {
    region: 'kalos',
    level: 50,
    perBattle: 1,
    trainerRegions: ['hoenn', 'kalos', 'alola'],
    trainerRoles: ['leader', 'elite', 'champion'],
  },
  // Gigantamax opens with Galar, for the Pokémon's next turn only (fights here are short); Galar's leaders and Champion
  // use it with their ace.
  gigantamax: { region: 'galar', turns: 1, trainerRegions: ['galar'] },
  formChangesPerBattle: 1,
  // A once-only find in a big loot deck can take a hundred rounds to turn up: from the 5th round done in its area, its
  // odds climb to ×10 at the 50th.
  uniquePity: { startRounds: 5, fullRounds: 50, maxMultiplier: 10 },
  // The special events (docs/18). Each one is switched on as it's built (docs/19); until then Home keeps a locked
  // square from the 3rd Kanto badge. Banners borrow area pictures until the event art exists.
  events: {
    teaserBadges: 3,
    wheel: {
      enabled: false,
      priority: 5,
      // Routes 7 & 8 (Celadon), Kanto.
      unlockAreaId: '8cf87ee3-f7a5-568e-bc22-54f643572535',
      banner: 'evening',
      rules: ['wheel.daily', 'wheel.prizes', 'wheel.odds'],
      // Nine equal slices: 4 × ₽10, 2 Poké Balls, a Great, an Ultra and a Master Ball. The odds add up to 100 %.
      prizes: [
        { reward: { kind: 'gold', amount: 10 }, count: 4, odds: 12.5 },
        { reward: { kind: 'item', key: 'poke-ball', qty: 1 }, count: 2, odds: 12.5 },
        { reward: { kind: 'item', key: 'great-ball', qty: 1 }, count: 1, odds: 12.5 },
        { reward: { kind: 'item', key: 'ultra-ball', qty: 1 }, count: 1, odds: 10 },
        { reward: { kind: 'item', key: 'master-ball', qty: 1 }, count: 1, odds: 2.5 },
      ],
    },
    raid: {
      enabled: false,
      priority: 3,
      // The Safari Zone, Kanto.
      unlockAreaId: '2238f26a-2629-5f28-af07-e74cb41d5f7a',
      banner: 'lair-shrine',
      rules: ['raid.daily', 'raid.sides', 'raid.bars', 'raid.catch'],
    },
    rebattle: {
      enabled: false,
      priority: 4,
      unlockAreaId: null,
      banner: 'champion',
      rules: ['rebattle.tiers', 'rebattle.gauntlet', 'rebattle.gold'],
    },
  },
}
