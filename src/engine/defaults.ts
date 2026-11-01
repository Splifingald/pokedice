import { GIFT_MOMENTS, RIVAL_MEETINGS } from './momentsContent'
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
  // Speed = base Speed stat + level (docs/52): each level is worth one point of Speed.
  speedPerLevel: 1,
  goldMultiplier: 0.5,
  gymGoldMultiplier: 2,
  forcedCenterWhenHurt: true,
  encounterMode: 'deck',
  // Professor Oak's parting gift.
  startInventory: { 'poke-ball': 5, potion: 2 },
  scaleLevelSpread: 3,
  enemyUpgradeLevel: 1,
  versusUpgradeLevel: 5,
  // The weekly Versus league (docs/44): off until the admin switches it on (the numbers: engine/versusLeague.ts).
  versusLeague: { access: 'off' },
  // Real-player battles in areas (docs/54): off until the admin switches it on (the numbers: engine/areaVersus.ts).
  areaVersus: { access: 'off' },
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
  // A fossil revives shiny 1 in 10 (the user's call, 2026-10-30), whatever the Shiny Charm does to the wild odds.
  fossilShinyChance: 0.1,
  cloudSyncMinutes: 15,
  maxFriends: 100,
  status: {
    burn: { threshold: 1, percentPerStack: 4, duration: 3 },
    poison: { percent: 5, duration: 5 },
    frozen: { sureAt: 3, stunTurns: 2 },
    paralyze: { sureAt: 2, stunTurns: 1 },
    confuse: { recoilPercentPerFace: 10, maxFaces: 3 },
  },
  ai: { samples: 200, rerollGainThreshold: 0.08 },
  // Raikou, Entei and Suicune, once both tower legendaries are caught: ~2% each per Johto wild encounter.
  roamers: {
    regionId: 'johto',
    requires: [249, 250],
    chance: 0.02,
    level: 40,
    dex: [243, 244, 245],
  },
  // Game Corner: every spin shows something. Returns 8.5 ₽ per 10 ₽ on average, plus the Porygon jackpot; a jackpot
  // when Porygon Lv.30+ is already yours refunds the spin, so the machine never becomes a money printer. Off since
  // 2026-10-25 (the user's call): the Fortune Wheel's jackpot gives Porygon now.
  slotMachine: {
    access: 'off',
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
    unlockPokedex: 10,
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
  // Off until the admin sets a Ko-fi link and switches it on.
  donation: { enabled: false, kofiUrl: '', monthlyGoal: 0, currency: 'EUR', startMonth: '', raisedBefore: 0, round: 0 },
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
    // The gem rules (docs/35), off until the admin opens them: Korrina's badge opens Mega Evolution in Kalos, a league
    // anywhere else; a Mega needs its gem and lasts 3 turns. Korrina hands over the Lucarionite, as in X and Y; the
    // three Kanto starters' gems come with the last three badges.
    gems: {
      access: 'off',
      badges: 3,
      turns: 3,
      rewards: [
        { badge: 3, gem: 'lucarionite' },
        { badge: 6, gem: 'charizardite-y' },
        { badge: 7, gem: 'venusaurite' },
        { badge: 8, gem: 'blastoisinite' },
      ],
    },
  },
  // Gigantamax opens with Galar, for the Pokémon's next turn only (fights here are short); Galar's leaders and Champion
  // use it with their ace. Its newer rules (docs/35), off until the admin opens them: Kabu's badge, two dice and a 30 %
  // heal, a use of its own beside the Mega's.
  gigantamax: {
    region: 'galar',
    turns: 1,
    trainerRegions: ['galar'],
    boost: { access: 'off', badges: 3, dice: 2, healPercent: 30 },
  },
  // Z-Moves (docs/35), off until the admin opens them: Lana's trial opens them in Alola, a league anywhere else. Once per
  // battle, the attack's type brings an effect; Alola's leaders, Elite Four and Champion use one with their ace.
  zMove: {
    access: 'off',
    region: 'alola',
    badges: 3,
    perBattle: 1,
    freezeChance: 30,
    paralyzeChance: 50,
    burnStacks: 2,
    healPercent: 20,
    recklessPercent: 40,
    recklessRecoilPercent: 20,
    damagePercent: 20,
    trainerRegions: ['alola'],
  },
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
  // Welcome-back gifts (docs/58): off until the admin switches them on. Migration 0103 inserts the same row (and its
  // SQL test keeps the two the same). Only the highest tier reached is given, at most once every 14 days.
  welcomeBack: {
    access: 'off',
    cooldownDays: 14,
    tiers: [
      {
        minDays: 3,
        gifts: [
          { kind: 'gold', amount: 300, region: 'latest' },
          { kind: 'item', key: 'great-ball', qty: 5, region: 'latest' },
          { kind: 'item', key: 'super-potion', qty: 3, region: 'latest' },
          { kind: 'item', key: 'rare-candy', qty: 1, region: 'latest' },
        ],
      },
      {
        minDays: 7,
        gifts: [
          { kind: 'gold', amount: 1000, region: 'latest' },
          { kind: 'item', key: 'ultra-ball', qty: 5, region: 'latest' },
          { kind: 'item', key: 'hyper-potion', qty: 3, region: 'latest' },
          { kind: 'item', key: 'revive', qty: 2, region: 'latest' },
          { kind: 'item', key: 'rare-candy', qty: 2, region: 'latest' },
        ],
      },
      {
        minDays: 14,
        gifts: [
          { kind: 'gold', amount: 2500, region: 'latest' },
          { kind: 'item', key: 'ultra-ball', qty: 10, region: 'latest' },
          { kind: 'item', key: 'max-revive', qty: 3, region: 'latest' },
          { kind: 'item', key: 'max-ether', qty: 2, region: 'latest' },
          { kind: 'item', key: 'rare-candy', qty: 5, region: 'latest' },
        ],
      },
    ],
  },
  extreme: {
    access: 'off',
    // The speedrun (docs/48): Kanto's League opens it, and each region's League its run.
    unlockRegion: 'kanto',
    centers: false,
    wipeHeals: false,
    koHours: 12,
    koReviveHp: 1,
    awayHealPctPerHour: 10,
    awayMinMinutes: 2,
    items: true,
  },
  // Extreme mode's Pokémon Centers (docs/47): a boon to pick instead of a heal, the team heal always on offer. The
  // user's numbers of 2026-10-28.
  extremeCenters: {
    access: 'off',
    offers: 3,
    heal: { percent: 30 },
    full: { weight: 30 },
    item: {
      weight: 30,
      potion: 82,
      revive: 15,
      maxRevive: 3,
      potions: [
        { key: 'potion', badges: 0 },
        { key: 'super-potion', badges: 3 },
        { key: 'hyper-potion', badges: 6 },
      ],
    },
    // Never before the region's 2nd badge (the user, 2026-10-29).
    buff: { weight: 20, hours: 24, maxDice: 8, badges: 2 },
    donor: { weight: 10, trainers: 3 },
    rocket: { weight: 10, levels: 3, band: 10 },
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
      // A ticket a spin (the user's design, 2026-10-25): one free every 12 h, 4 held at most, ₽200 each while under 4,
      // and a spin pays back ₽150 at most on average (tests/engine/wheel.test.ts holds every stage to it).
      tickets: { everyHours: 12, cap: 4, price: 200, maxAverage: 150 },
      // Eleven slices, worth ₽118 a spin on average (items at their Mart price); the jackpot's slice makes twelve.
      slices: [
        { reward: { kind: 'gold', amount: 50 }, count: 3, odds: 13 },
        { reward: { kind: 'gold', amount: 100 }, count: 2, odds: 12.5 },
        { reward: { kind: 'item', key: 'great-ball', qty: 2 }, count: 1, odds: 10 },
        { reward: { kind: 'gold', amount: 150 }, count: 1, odds: 10 },
        { reward: { kind: 'item', key: 'ultra-ball', qty: 2 }, count: 1, odds: 8 },
        { reward: { kind: 'item', key: 'rare-candy', qty: 1 }, count: 1, odds: 5 },
        { reward: { kind: 'gold', amount: 500 }, count: 1, odds: 2.5 },
        { reward: { kind: 'gold', amount: 1000 }, count: 1, odds: 0.5 },
      ],
      // Porygon at 10 %; once caught, a shiny Porygon at 1 %; once that's caught, a Master Ball at 0.25 % for good.
      // Averages a spin: ₽136, ₽147, ₽120 (Porygon counted at ₽300, the shiny at ₽3,000).
      jackpot: [
        { reward: { kind: 'pokemon', dex: 137, level: 30 }, odds: 10, value: 300 },
        { reward: { kind: 'pokemon', dex: 137, level: 30, shiny: true }, odds: 1, value: 3000 },
        { reward: { kind: 'item', key: 'master-ball', qty: 1 }, odds: 0.25, value: 1000 },
      ],
    },
    raid: {
      access: 'off',
      priority: 3,
      // Fuchsia City, Kanto (the area that held the Safari Zone until docs/61 split it off: the same id, the same point).
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
  smallWorlds: { access: 'off', previewAccess: 'off', finishAccess: 'off', list: [] },
  // Push notifications (docs/27): off until the admin switches them on. The day's raid is announced at 9:00 the
  // player's time, and no Egg wakes anyone between 22:00 and 8:00.
  push: { access: 'off', raidHour: 9, quietHours: [22, 8] },
  // The areas' portal run (docs/28): off until the admin switches it on. Migration 0057 inserts the same row.
  portalRun: { access: 'off' },
  // The areas' nightmare (docs/30): off until the admin switches it on. Migration 0060 inserts the same row.
  nightmare: { access: 'off' },
  // Trainer looks (docs/31): off until the admin switches them on; the old free list stays meanwhile.
  looks: { access: 'off' },
  // Day and night in Johto (docs/32): off until the admin switches it on. Migration 0061 inserts the same row.
  dayNight: { access: 'off' },
  // Idle mode and the play styles (docs/36): off until the admin switches it on; auto-mode stays as it was meanwhile.
  // Migration 0068 inserts the same row.
  idleMode: { access: 'off' },
  // The League's heal between its battles (docs/42): off until the admin switches it on. Migration 0081 inserts the
  // same row.
  leagueHeal: { access: 'off' },
  // Hidden talents (docs/51): off until the admin switches them on. Migration 0094 inserts the same row.
  hiddenTalents: { access: 'off', wildChance: 0.05, evolveChance: 0.3, families: {} },
  // The legends' own cinematics (docs/53): off until the admin switches it on. Migration 0098 inserts the same row.
  legendCinema: { access: 'off' },
  // The gift calendar (docs/55): off until the admin switches it on. Migration 0100 inserts the same row.
  giftCalendar: { access: 'off' },
  // The champions' own cinematics (docs/56): off until the admin switches it on. Migration 0101 inserts the same row.
  championCinema: { access: 'off' },
  // Friendship streaks and the Friend Market (docs/60): off until the admin switches it on. 3 to 7 Heart Scales a
  // streak day by tier, 50 a day at most; the market's weekly shelf and the shiny of the week turning through Pokémon
  // that grow with friendship. Migration 0107 holds the same numbers (friendship_defaults()).
  friendship: {
    access: 'off',
    tiers: [
      { from: 1, coins: 3 },
      { from: 4, coins: 4 },
      { from: 8, coins: 5 },
      { from: 15, coins: 6 },
      { from: 31, coins: 7 },
    ],
    dailyCap: 50,
    market: [
      { key: 'friend-ball', price: 5, limit: 20 },
      { key: 'rare-candy', price: 15, limit: 10 },
      { key: 'talent-candy', price: 60, limit: 2 },
    ],
    shiny: { price: 150, level: 15, pool: [175, 133, 172, 173, 174, 447, 440, 446, 427, 298, 433, 527] },
    ballBoost: [1, 2, 3, 4, 5],
  },
  // Outfits (docs/59): off until the admin switches it on. Migration 0105 inserts the same row.
  outfits: { access: 'off' },
  // The Unown Pokédex (docs/41): off until the admin switches it on; ₽1,000 for the 28th letter. Migration 0080 inserts
  // the same row.
  unownDex: { access: 'off', reward: 1000 },
  // Route 1's set opening (docs/46): off until the admin switches it on. Two rounds met in a set order, ending with
  // Youngster Joey's Rattata (₽10); the rounds after them are shuffled as before. Migration 0081 inserts the switch's row.
  openingRounds: {
    access: 'off',
    areaId: '3585c2a5-43bc-50c9-9818-e148404cabf8',
    rounds: [
      [
        { kind: 'wild', dex: 19, level: 2 },
        { kind: 'wild', dex: 16, level: 2 },
        { kind: 'item', itemKey: 'poke-ball', qty: 2 },
        { kind: 'center' },
        { kind: 'wild', dex: 19, level: 3 },
        { kind: 'trainer', trainerId: '251c41f0-3e55-56a0-bb95-7a33ea96b68f', prize: 10 },
      ],
      [
        { kind: 'wild', dex: 16, level: 4 },
        { kind: 'wild', dex: 19, level: 3 },
        { kind: 'item', itemKey: 'potion', qty: 1 },
        { kind: 'wild', dex: 43, level: 4 },
        { kind: 'wild', dex: 16, level: 5 },
      ],
    ],
  },
  // Double battles (docs/33): off until the admin switches them on; from Hoenn on, 10 % of the wild encounters.
  // Migration 0062 inserts the same row.
  doubleBattles: { access: 'off', regions: ['hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'], wildChance: 10 },
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
    // Before any level is bought, so every player's first absence pays a little and the upgrade has something to grow
    // from (₽24 a day at most, half of level 1).
    offlineBase: 1,
    offlineMaxHours: 24,
    richCost: 99999,
    // The Shiny Charm (the user's numbers, 2026-10-18): from the base 1 in 1,000 to 1 in 333, ₽69,000 in all, a
    // goal as long as Capture Luck. Off on its own switch too.
    charmAccess: 'off',
    charm: [
      { oneIn: 950, cost: 1000 },
      { oneIn: 900, cost: 1500 },
      { oneIn: 850, cost: 2000 },
      { oneIn: 800, cost: 3000 },
      { oneIn: 750, cost: 4000 },
      { oneIn: 700, cost: 5000 },
      { oneIn: 625, cost: 7500 },
      { oneIn: 550, cost: 10000 },
      { oneIn: 450, cost: 15000 },
      { oneIn: 333, cost: 20000 },
    ],
  },
  // Trick or Treat (docs/29): off until the admin switches it on; the areas' ghost lists come with their content
  // (Haunted Hollow's from migration 0056). The numbers were set by the exact best play and a Monte Carlo of simpler
  // plays (tests/engine/trick-or-treat.test.ts, docs/29 §3): best play catches about 3 common ghosts in 4, a rare one
  // about 3 in 5 and a very rare one about 1 in 3, and no fixed recipe (Trick Balls only, one or two Treats first,
  // Treats up to the best section) comes within 4 points. A miss pushing the gauge by 35 is what keeps Balls only from
  // winning: at the first idea's +10 they caught 98 % of common ghosts, and the Treats were never worth giving.
  // Pokémon posing as items (docs/61 §3): a find that springs out as Voltorb. Off until the admin opens it.
  disguises: { access: 'off' },
  // Set moments (docs/61 §5): the rivals' meetings and the gifts are the game's own (momentsContent.ts, written by
  // scripts/patch-side-quests.ts); the database holds their switches, Off. A gift Egg hatches in 6 hours.
  rivals: { access: 'off', meetings: RIVAL_MEETINGS },
  giftMoments: { access: 'off', eggHours: 6, gifts: GIFT_MOMENTS },
  // The Safari (docs/61 §4): Trick or Treat's gauge with Bait and Safari Balls, its numbers starting from Trick's (the
  // same measured best play: about 7 common Pokémon in 10, 4 rare ones in 7, a very rare one in 3). The first round in
  // each Safari area is free, then ₽100 a round (the user's call, 2026-11-01). `areas`: each Safari's tier overrides;
  // a Pokémon not listed takes its tier from its catch value.
  safari: {
    access: 'off',
    freeRounds: 1,
    roundPrice: 100,
    treatMin: 10,
    treatMax: 30,
    failPush: 35,
    tiers: {
      common: {
        weight: 6,
        flee: 90,
        sections: [
          { from: 0, need: 6 },
          { from: 40, need: 5 },
          { from: 75, need: 4 },
          { from: 80, need: 3 },
        ],
      },
      rare: {
        weight: 3,
        flee: 85,
        sections: [
          { from: 0, need: 6 },
          { from: 40, need: 5 },
          { from: 75, need: 4 },
        ],
      },
      veryRare: {
        weight: 1,
        flee: 65,
        sections: [
          { from: 0, need: 6 },
          { from: 45, need: 5 },
        ],
      },
    },
    areas: {},
  },
  trickOrTreat: {
    access: 'off',
    treatMin: 10,
    treatMax: 30,
    failPush: 35,
    tiers: {
      common: {
        weight: 6,
        flee: 90,
        sections: [
          { from: 0, need: 6 },
          { from: 40, need: 5 },
          { from: 75, need: 4 },
          { from: 80, need: 3 },
        ],
      },
      rare: {
        weight: 3,
        flee: 85,
        sections: [
          { from: 0, need: 6 },
          { from: 40, need: 5 },
          { from: 75, need: 4 },
        ],
      },
      veryRare: {
        weight: 1,
        flee: 65,
        sections: [
          { from: 0, need: 6 },
          { from: 45, need: 5 },
        ],
      },
    },
    areas: {},
  },
  // The Underground (docs/34): off until the admin switches it on. Shapes follow Platinum's treasures, whose large
  // sphere is half again the small one: small orb 1×1, medium 2×2, large 3×3, a plate 3×2, a fossil 2×2. A 6×6 wall of 1–3 layers (30 / 40 / 30 %) hides 2–4
  // things and takes 15 strikes. Free kits: 3 a day, one every 8 h, at most 3 waiting. The pickaxe's 8 levels each
  // raise one face by 1, from five 1s and a 2 to three 2s and three 3s. Prices are a first guess for the balance pass
  // (tests/engine/underground.test.ts reports a wall's yield per pickaxe level).
  underground: {
    access: 'off',
    kits: { price: 1000, limit: 10, freeAmount: 3, freePeriodHours: 24, freeCap: 3 },
    wall: { cols: 6, rows: 6, strikes: 15, layers: [30, 40, 30], itemsMin: 2, itemsMax: 4, neighbourLoss: 1 },
    loot: {
      weights: { orbS: 40, orbM: 25, orbL: 10, fossil: 8, plate: 3 },
      shapes: {
        orbS: { w: 1, h: 1 },
        orbM: { w: 2, h: 2 },
        orbL: { w: 3, h: 3 },
        fossil: { w: 2, h: 2 },
        plate: { w: 3, h: 2 },
      },
      colours: { red: 34, blue: 33, green: 33 },
    },
    prices: {
      red: { s: 100, m: 300, l: 800 },
      blue: { s: 100, m: 300, l: 800 },
      green: { s: 100, m: 300, l: 800 },
    },
    pickaxe: [
      { faces: [1, 1, 1, 1, 1, 2], price: 0 },
      { faces: [1, 1, 1, 1, 2, 2], price: 500 },
      { faces: [1, 1, 1, 2, 2, 2], price: 1000 },
      { faces: [1, 1, 2, 2, 2, 2], price: 1500 },
      { faces: [1, 2, 2, 2, 2, 2], price: 2500 },
      { faces: [2, 2, 2, 2, 2, 2], price: 4000 },
      { faces: [2, 2, 2, 2, 2, 3], price: 6000 },
      { faces: [2, 2, 2, 2, 3, 3], price: 8000 },
      { faces: [2, 2, 2, 3, 3, 3], price: 10000 },
    ],
    sellNeedsFull: true,
    // Outside a full team, orbs sell for a tenth of their price: teaming up stays worth it.
    soloShare: 10,
  },
}
