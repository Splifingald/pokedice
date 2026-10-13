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
  // The same for a wild Pokémon not caught yet: the last rare one of an area comes ×10 as often by the 50th round.
  newPokemonPity: { startRounds: 5, fullRounds: 50, maxMultiplier: 10 },
  // Extreme mode (docs/22): off until the admin switches it on, for the admin alone or for everyone. Opened by the
  // Johto League; no Pokémon Centers and no healing after a lost round; a K.O. rests 12 h and comes back at 1 HP; out
  // of the game, every Pokémon heals 10 % an hour (absences under 2 min don't count). Potions and Revives work.
  // Trades (docs/23): off until the admin switches them on. 4 listings a player, 3 days each, 5 taken a day, arriving
  // at Lv.50 at most, from the 2nd badge. Kadabra, Machoke, Graveler (and Alola's), Haunter, Boldore, Gurdurr,
  // Karrablast, Shelmet, Phantump and Pumpkaboo evolve only by trade; the Ultra Beasts are never tradable.
  trade: {
    access: 'off',
    maxListings: 4,
    listingDays: 3,
    tradesPerDay: 5,
    levelCap: 50,
    minBadges: 2,
    evolveOnTrade: [
      [64, 65],
      [67, 68],
      [75, 76],
      [10110, 10111],
      [93, 94],
      [525, 526],
      [533, 534],
      [588, 589],
      [616, 617],
      [708, 709],
      [710, 711],
    ],
    exclude: [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806],
  },
  // Gifts with the developer's messages (docs/15 §23): off until the admin switches them on.
  gifts: { access: 'off' },
  // Friend invite rewards (docs/15 §25): off until the admin switches them on. Migration 0051 inserts the same row.
  inviteRewards: {
    access: 'off',
    tiers: [
      { friends: 1, gifts: [{ kind: 'item', key: 'rare-candy', qty: 1, region: 'latest' }] },
      { friends: 2, gifts: [{ kind: 'gold', amount: 1000, region: 'latest' }] },
      { friends: 3, gifts: [{ kind: 'pokemon', dex: 132, level: 10, shiny: true, region: 'latest' }] },
      { friends: 4, gifts: [{ kind: 'item', key: 'master-ball', qty: 1, region: 'latest' }] },
    ],
  },
  extreme: {
    access: 'off',
    unlockRegion: 'johto',
    centers: false,
    wipeHeals: false,
    koHours: 12,
    koReviveHp: 1,
    awayHealPctPerHour: 10,
    awayMinMinutes: 2,
    items: true,
  },
  // The special events (docs/18). Each is off until the admin switches it on, for the admin alone or for everyone;
  // before the first opens, Home keeps a locked square from the 3rd Kanto badge. Banners: an event's own picture, or an
  // area picture until it has one.
  events: {
    teaserBadges: 3,
    wheel: {
      access: 'off',
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
      access: 'off',
      priority: 3,
      // The Safari Zone, Kanto.
      unlockAreaId: '2238f26a-2629-5f28-af07-e74cb41d5f7a',
      banner: 'lair-shrine',
      rules: ['raid.daily', 'raid.sides', 'raid.bars', 'raid.catch'],
      // Three bars of 2.2 times its HP at Lv.50, alone (no summons since 2026-10-13: its bars grew instead); upgrades 8
      // for the raid Pokémon, 5 for the sides (Versus's level); you and up to two friends, three Pokémon each, Lv.50 at
      // most. `pnpm raid-balance`: about 56 % wins for three random fully evolved teams (target 50–70 %), as before.
      bars: 3,
      barHp: 2.2,
      barColors: ['#34c97a', '#ffbe2e', '#f2553f'],
      // Super effective is only ×1.3 on the raid Pokémon; its own resisted hits land at ×0.7, and nobody is immune
      // to it (×0.5).
      sideTypes: { super: 1.3, resisted: 0.5, immune: 0 },
      bossTypes: { super: 2, resisted: 0.7, immune: 0.5 },
      level: 50,
      upgradeLevel: 8,
      teamCap: 50,
      sideUpgradeLevel: 5,
      maxFriends: 2,
      helperDailyCap: 5,
      gifts: [
        { key: 'ultra-ball', weight: 40 },
        { key: 'hyper-potion', weight: 25 },
        { key: 'revive', weight: 20 },
        { key: 'rare-candy', weight: 15 },
      ],
      // The mythicals: each its lair's boss (never shiny there) and a shiny raid of the calendar, fought in front of its
      // lair, a catch waiting until the lair is completed. Every other area boss is a progression raid (docs/24,
      // scripts/raid-areas.ts), and a shiny raid of the calendar too.
      pool: [
        { dex: 151, areaId: '050ff505-ff8e-5251-8499-842a2cfc2986' }, // Mew, Faraway Island
        { dex: 251, areaId: '100e6644-3f5b-553a-ad22-e26551b04edc' }, // Celebi, Ilex Shrine
        { dex: 385, areaId: '57008453-b26b-5c52-a88e-e777d39ab364' }, // Jirachi, Birth Island
        { dex: 386, areaId: '57008453-b26b-5c52-a88e-e777d39ab364' }, // Deoxys, Birth Island
        { dex: 489, areaId: '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e' }, // Phione, The Seabreak Path
        { dex: 490, areaId: '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e' }, // Manaphy, The Seabreak Path
        { dex: 491, areaId: '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c' }, // Darkrai, Newmoon Island
        { dex: 492, areaId: 'fc27382b-919d-50d0-9f21-23dd16cf99d0' }, // Shaymin, Flower Paradise
        { dex: 493, areaId: 'df1bb846-fc11-590f-afec-45ef39b63deb' }, // Arceus, The Hall of Origin
        { dex: 494, areaId: '285d4dfb-dd01-59eb-a632-0602a135a88e' }, // Victini, Liberty Garden
        { dex: 647, areaId: 'a536039f-e897-5697-a75e-15d8060e96e3' }, // Keldeo, The Moor of Icirrus Spring
        { dex: 648, areaId: 'f014aa64-1215-5a78-be22-b1ee72f0d1e7' }, // Meloetta, The Castelia Café
        { dex: 649, areaId: 'e3ab5fdf-99ee-5feb-b6fd-1d47352b267e' }, // Genesect, The P2 Laboratory
        { dex: 719, areaId: '64740605-3951-57d0-9217-1d9ad7752eff' }, // Diancie, The Diamond Domain
        { dex: 720, areaId: '532b27a7-bfb1-5b03-ae0f-a611995dffa2' }, // Hoopa, Hoopa's Ring
        { dex: 721, areaId: '9394fdfc-182a-5c7d-92a2-3fb38c339f28' }, // Volcanion, The Nebel Plateau
        { dex: 808, areaId: 'bf277850-73f7-569e-8657-fa5298161229' }, // Meltan, The Mystery Box
        { dex: 809, areaId: 'bf277850-73f7-569e-8657-fa5298161229' }, // Melmetal, The Mystery Box
        { dex: 801, areaId: '28487bdf-d4f4-5fc9-860e-accef6b9677f' }, // Magearna, Magearna's Workshop
        { dex: 802, areaId: 'e8c9b515-3421-5bdb-ade2-b101f1e6885d' }, // Marshadow, Ten Carat Hill's Farthest Hollow
        { dex: 807, areaId: '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4' }, // Zeraora, The Blush Mountain Storm
        { dex: 893, areaId: '4aed8f3a-c216-5713-ac05-5a66d5c6998e' }, // Zarude, The Forest of Focus
        { dex: 1025, areaId: '168b74c9-3359-5581-a214-1f5be8da9b3e' }, // Pecharunt, Kitakami Hall
      ],
      perMon: {},
      // Progression raids: like the day's raid by default (Lv.50, teams capped at 50); Admin → Raids changes them.
      progress: { teamCap: 50, perMon: {} },
      calendar: {
        seeds: [],
        overrides: {},
        // Days that mean something (engine/raidCalendar.ts lays out the rest, legendaries on the weekends).
        anchors: [
          { date: '01-01', dex: 493, shiny: true }, // New Year: Arceus, who shaped the world
          { date: '02-14', dex: 905, shiny: true }, // Valentine's Day: Enamorus, the love-hate Pokémon
          { date: '02-27', dex: 25, shiny: true }, // Pokémon Day: a shiny Pikachu
          { date: '03-20', dex: 492, shiny: true }, // spring equinox: Shaymin, when the Gracidea blooms
          { date: '03-22', dex: 382, shiny: true }, // World Water Day: Kyogre
          { date: '04-01', dex: 720, shiny: true }, // April Fools' Day: Hoopa, the mischief Pokémon
          { date: '04-22', dex: 251, shiny: true }, // Earth Day: Celebi, the voice of the forest
          { date: '06-08', dex: 490, shiny: true }, // World Oceans Day: Manaphy, the prince of the sea
          { date: '06-20', dex: 791, shiny: true }, // summer solstice: Solgaleo, the sun
          { date: '06-21', dex: 648, shiny: true }, // Fête de la Musique: Meloetta
          { date: '07-07', dex: 385, shiny: true }, // Tanabata, the star festival: Jirachi grants wishes
          { date: '07-14', dex: 494, shiny: true }, // Bastille Day's fireworks: Victini, the victory Pokémon
          { date: '08-12', dex: 386, shiny: true }, // the Perseids: Deoxys came on a meteor
          { date: '10-30', dex: 487, shiny: true }, // Halloween eve: Giratina, from the Distortion World
          { date: '10-31', dex: 491, shiny: true }, // Halloween: Darkrai and its nightmares
          { date: '11-01', dex: 802, shiny: true }, // All Saints' Day: Marshadow, of the shadows
          { date: '12-21', dex: 792, shiny: true }, // winter solstice, the longest night: Lunala, the moon
          { date: '12-24', dex: 225, shiny: true }, // Christmas Eve: a shiny Delibird with its presents
          { date: '12-25', dex: 801, shiny: true }, // Christmas: Magearna, made as a gift
          { date: '12-31', dex: 483, shiny: true }, // New Year's Eve: Dialga, master of time
        ],
        // Shiny fillers come from areas starting at Lv.40 or more: a Lv.50 catch never lands in an early area.
        fillerMinLevel: 40,
      },
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
      access: 'off',
      priority: 4,
      unlockAreaId: null,
      banner: 'champion',
      rules: ['rebattle.tiers', 'rebattle.gauntlet', 'rebattle.gold'],
      // League I levels +10 / +20 / +30 / Lv.100 (the trainers' teams, scripts/rebattle-teams.ts); ₽ and upgrades here.
      tiers: [
        { id: 'bronze', gold: 1, upgradeDelta: 1 },
        { id: 'silver', gold: 1.5, upgradeDelta: 2 },
        { id: 'gold', gold: 2, upgradeDelta: 3 },
        { id: 'diamond', gold: 3, upgradeDelta: 'max' },
      ],
    },
  },
  // Filled from src/data/config.json (scripts/rebattle-teams.ts): no lineup, no rebattle in that region.
  rebattleLineups: {},
  // Off until the admin switches it on (for the admin alone, or everyone).
  liveEvents: { access: 'off', list: [] },
  // Off until the admin switches it on (for the admin alone, or everyone).
  smallWorlds: { access: 'off', list: [] },
  // The Link Cable and the Bait (docs/25): off until the admin switches each on.
  itemSwitches: { 'link-cable': 'off', bait: 'off' },
  // The General upgrades (docs/25): off until the admin switches them on. A whole region's combos and dice cost about
  // ₽37,000: Capture Luck from 10 % to 100 % (₽74,000 in all) and the golden name (₽99,999) are long goals; offline
  // earnings, from ₽2 to ₽20 an hour for up to 24 h away, cost ₽6,663 in all and pay themselves back in days.
  general: {
    access: 'off',
    luck: [
      { chance: 10, cost: 1000 },
      { chance: 20, cost: 1800 },
      { chance: 30, cost: 2800 },
      { chance: 40, cost: 4000 },
      { chance: 50, cost: 5500 },
      { chance: 60, cost: 7200 },
      { chance: 70, cost: 9200 },
      { chance: 80, cost: 11500 },
      { chance: 90, cost: 14000 },
      { chance: 100, cost: 17000 },
    ],
    offline: [
      { perHour: 2, cost: 100 },
      { perHour: 4, cost: 175 },
      { perHour: 6, cost: 263 },
      { perHour: 8, cost: 375 },
      { perHour: 10, cost: 500 },
      { perHour: 12, cost: 650 },
      { perHour: 14, cost: 825 },
      { perHour: 16, cost: 1025 },
      { perHour: 18, cost: 1250 },
      { perHour: 20, cost: 1500 },
    ],
    offlineMaxHours: 24,
    richCost: 99999,
  },
}
