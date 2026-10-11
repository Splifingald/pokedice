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
  // Extreme mode (docs/20): opened by the Johto League; no Pokémon Centers and no healing after a lost round; a K.O.
  // rests 12 h and comes back at 1 HP; out of the game, every Pokémon heals 10 % an hour (absences under 2 min don't
  // count). Potions and Revives work.
  extreme: {
    enabled: true,
    unlockRegion: 'johto',
    centers: false,
    wipeHeals: false,
    koHours: 12,
    koReviveHp: 1,
    awayHealPctPerHour: 10,
    awayMinMinutes: 2,
    items: true,
  },
  // The special events (docs/18). Each one is switched on as it's built (docs/19); before the first opens, Home keeps
  // a locked square from the 3rd Kanto badge. Banners: an event's own picture, or an area picture until it has one.
  events: {
    teaserBadges: 3,
    wheel: {
      enabled: true,
      priority: 5,
      // Routes 7 & 8 (Celadon), Kanto.
      unlockAreaId: '8cf87ee3-f7a5-568e-bc22-54f643572535',
      // A carnival booth with the big wheel at dusk (349 × 144, the wheel on the right, clear of the title plate).
      banner: '/backgrounds/fortune-wheel.png',
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
      enabled: true,
      priority: 3,
      // The Safari Zone, Kanto.
      unlockAreaId: '2238f26a-2629-5f28-af07-e74cb41d5f7a',
      banner: 'lair-shrine',
      rules: ['raid.daily', 'raid.sides', 'raid.bars', 'raid.catch'],
      // Three bars of twice its HP at Lv.50, two summons to start and two points a break, two beside it at most;
      // upgrades 8 for the raid's side, 5 for yours (Versus's level); you and up to two friends, three Pokémon each,
      // Lv.50 at most. `pnpm raid-balance`: about 60 % wins for three random fully evolved teams (target 50–70 %).
      bars: 3,
      barHp: 2,
      barColors: ['#34c97a', '#ffbe2e', '#f2553f'],
      startAllies: 2,
      summonPerBreak: 2,
      maxField: 2,
      level: 50,
      upgradeLevel: 8,
      teamCap: 50,
      sideUpgradeLevel: 5,
      maxFriends: 2,
      fallbackShiny: 0.3,
      repeatHours: 72,
      helperDailyCap: 5,
      gifts: [
        { key: 'ultra-ball', weight: 40 },
        { key: 'hyper-potion', weight: 25 },
        { key: 'revive', weight: 20 },
        { key: 'rare-candy', weight: 15 },
      ],
      // The mythicals of the raid pool: clearing their area unlocks their raid (scripts/raid-areas.ts took them out of
      // those areas' bosses).
      pool: [
        { dex: 151, areaId: '050ff505-ff8e-5251-8499-842a2cfc2986' }, // Mew, Faraway Island
        { dex: 251, areaId: '100e6644-3f5b-553a-ad22-e26551b04edc' }, // Celebi, Ilex Shrine
        { dex: 385, areaId: '57008453-b26b-5c52-a88e-e777d39ab364' }, // Jirachi, Birth Island
        { dex: 386, areaId: '57008453-b26b-5c52-a88e-e777d39ab364' }, // Deoxys, Birth Island
        { dex: 384, areaId: '4ef12821-79bb-5aa1-ad96-5bd2fbba093f' }, // Rayquaza, Sky Pillar
        { dex: 381, areaId: '07e40731-d45b-4e84-8c81-df5470d2f0c3' }, // Latios, Southern Island II
        { dex: 489, areaId: '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e' }, // Phione, The Seabreak Path
        { dex: 490, areaId: '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e' }, // Manaphy, The Seabreak Path
        { dex: 492, areaId: 'fc27382b-919d-50d0-9f21-23dd16cf99d0' }, // Shaymin, Flower Paradise
        { dex: 493, areaId: 'df1bb846-fc11-590f-afec-45ef39b63deb' }, // Arceus, The Hall of Origin
        { dex: 488, areaId: '1bef9b55-6556-5a47-b728-8dc5dba851c7' }, // Cresselia, Fullmoon Island
        { dex: 494, areaId: '285d4dfb-dd01-59eb-a632-0602a135a88e' }, // Victini, Liberty Garden
        { dex: 647, areaId: 'a536039f-e897-5697-a75e-15d8060e96e3' }, // Keldeo, The Moor of Icirrus Spring
        { dex: 648, areaId: 'f014aa64-1215-5a78-be22-b1ee72f0d1e7' }, // Meloetta, The Castelia Café
        { dex: 649, areaId: 'e3ab5fdf-99ee-5feb-b6fd-1d47352b267e' }, // Genesect, The P2 Laboratory
        { dex: 719, areaId: '64740605-3951-57d0-9217-1d9ad7752eff' }, // Diancie, The Diamond Domain
        { dex: 720, areaId: '532b27a7-bfb1-5b03-ae0f-a611995dffa2' }, // Hoopa, Hoopa's Ring
        { dex: 721, areaId: '9394fdfc-182a-5c7d-92a2-3fb38c339f28' }, // Volcanion, The Nebel Plateau
        { dex: 808, areaId: 'bf277850-73f7-569e-8657-fa5298161229' }, // Meltan, The Mystery Box
        { dex: 801, areaId: '28487bdf-d4f4-5fc9-860e-accef6b9677f' }, // Magearna, Magearna's Workshop
        { dex: 802, areaId: 'e8c9b515-3421-5bdb-ade2-b101f1e6885d' }, // Marshadow, Ten Carat Hill's Farthest Hollow
        { dex: 807, areaId: '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4' }, // Zeraora, The Blush Mountain Storm
        { dex: 893, areaId: '4aed8f3a-c216-5713-ac05-5a66d5c6998e' }, // Zarude, The Forest of Focus
      ],
      // The pseudo-legendaries and a few powerful Pokémon, from when their region is reached.
      fallback: [
        { dex: 149, regionId: 'kanto' },
        { dex: 130, regionId: 'kanto' },
        { dex: 131, regionId: 'kanto' },
        { dex: 143, regionId: 'kanto' },
        { dex: 248, regionId: 'johto' },
        { dex: 373, regionId: 'hoenn' },
        { dex: 376, regionId: 'hoenn' },
        { dex: 445, regionId: 'sinnoh' },
        { dex: 448, regionId: 'sinnoh' },
        { dex: 635, regionId: 'unova' },
        { dex: 637, regionId: 'unova' },
        { dex: 706, regionId: 'kalos' },
        { dex: 681, regionId: 'kalos' },
        { dex: 784, regionId: 'alola' },
        { dex: 887, regionId: 'galar' },
        { dex: 998, regionId: 'paldea' },
        { dex: 983, regionId: 'paldea' },
      ],
      exclude: {
        // Every pseudo-legendary line.
        pseudo: [
          147, 148, 149, 246, 247, 248, 371, 372, 373, 374, 375, 376, 443, 444, 445, 633, 634, 635, 704, 705, 706, 782, 783,
          784, 885, 886, 887, 996, 997, 998,
        ],
        // The Ultra Beasts and the Paradox Pokémon.
        extra: [
          793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995,
          1005, 1006, 1007, 1008, 1009, 1010, 1020, 1021, 1022, 1023,
        ],
      },
    },
    rebattle: {
      enabled: true,
      priority: 4,
      unlockAreaId: null,
      banner: 'champion',
      rules: ['rebattle.tiers', 'rebattle.gauntlet', 'rebattle.gold'],
      // League I levels +10 / +25 / Lv.100 (the trainers' teams, scripts/rebattle-teams.ts); ₽ and upgrades here.
      tiers: [
        { id: 'bronze', gold: 1.5, upgradeDelta: 1 },
        { id: 'silver', gold: 2, upgradeDelta: 2 },
        { id: 'gold', gold: 3, upgradeDelta: 'max' },
      ],
    },
  },
  // Filled from src/data/config.json (scripts/rebattle-teams.ts): no lineup, no rebattle in that region.
  rebattleLineups: {},
}
