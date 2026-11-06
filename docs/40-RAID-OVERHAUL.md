# 40 · The raid overhaul

The user's redesign of the progression raids, October 2026: every legendary raid of the main game gets its own
entrance, its own level and HP bars, its own rules and a last bar of its own; Arceus's daily raid changes plate; and
after Kalos, the raids of the earlier regions' legends that have a Mega or Primal form come back as Mega raids, the only
way to get their gem or orb.

The proposal and the user's answers live in the artifact <https://claude.ai/artifact/QXchFWK3Vy4WeTCNzpqxGW> (one choice
per family of raids; the framework's 18 choices). **Status (2026-10-24): built** on
`claude/raid-improvements-balancing-7h2x2h`, merged into `feature/version_2_3`, behind its switch, Off. (Numbered 40
and migration 0076: the shiny Pokédex took docs/39 and 0075 the same day.)

**Always on since 2026-10-28** (the user's call, when Admin → Config was made simpler): the switch is gone, the game
keeps only the "on" path, and [`supabase/migrations/0084_switches_retired.sql`](https://github.com/Splifingald/pokedice/blob/version/2_4/supabase/migrations/0084_switches_retired.sql) deletes its row
(`supabase/seed.sql` carries it inlined). `raid_overhaul_open()` now
answers true for everyone, so the server takes a Mega raid's key from every player.

## 1. Decisions

| Question | Answer |
|---|---|
| Switch | **Off / On for admin / On for everyone**, Off by default (`game_config.raidOverhaul`, `raidOverhaulOn`). The server reads it for the Mega raids' keys (0076). Off: raids play exactly as before |
| Level | **Its old boss level, at least 50** (Mewtwo 70, Calyrex 80, Terapagos 85), a few box legends nudged up (Lugia/Ho-Oh 55, Kyogre/Groudon/Dialga/Palkia 60) |
| Team cap | **The raid's level**: your Pokémon fight up to it, the NPC partners come at it. The green thumb (recommended) needs that level too |
| Bars | 3 for trios, guardians, Ultra Beasts, Paradox and minor raids; 4 for box legends; 5 for apex raids and Arceus |
| HP per bar | **Tuned per raid** by simulation (§4) so each tier lands on a target with the rules playing |
| Rules | Each raid's own (§3), from a set of mechanics: weather and terrain, telegraphed attacks you can interrupt, combo-only shields, type changes against the side it faces, strikes on every side, healing, dice gained… |
| Dice effects | **Kept out**: weather boosts attacks (×), it doesn't change faces; no "one face is enough" rule (the status faces rework made every status a one-face status); no dice tricks (frozen, eaten or flipped dice, drained rerolls) — the user's answers |
| Last bar | **Every raid has one**: trios +1 die and no strike on everyone; box and apex legends more dice, a form, or a type change, **never a double strike** (the user removed it from every family); Lugia, Ho-Oh, Xerneas and Yveltal no spread either; Kyurem nothing; Arceus no die, a new plate before every strike |
| Mega before Kalos | **None.** Mewtwo, Gyarados, Latias, Latios, Rayquaza, Kyogre, Groudon and Heatran fight their normal form in their raid |
| Mega raids | **After Kalos**, in the same area: the Mega or Primal form, once that raid is caught **and** Mega Evolution is earned in Kalos (Korrina's badge, `powerEarned`). A win gives its gem or orb, the **only way** to get it (off the Mart's shelf with the switch on). Nothing to catch |
| Intros | **Each legendary's own entrance** (§5); the Ultra Beasts share an Ultra Wormhole, the Paradox Pokémon a time rift; red Gyarados and Rotom keep the storm |
| Skip | From the **second** time a legend is met (`events.raidIntrosSeen`); the first plays whole |
| Rules pop-up | Once, when a progression raid is open with the switch on (`popups.ts` `raidRules`); INFO on each raid page shows it again; each raid page lists its own rules |

## 2. Engine (pure, `src/engine`)

- **`raidSpecials.ts`**: the content. `RAID_SPECIALS` (each raid's tier, level, bars, HP per bar, dice level, weather or
  terrain, auras, rules and last bar, by dex), `MEGA_RAIDS` (form, base, gem, numbers and rules), `raidOverhaulOn`,
  `raidSpecialOf`, `megaRaidGem`, `megaRaidDie`, the weather's boosts and wear.
- **`raidCalendar.ts`**: `raidSpecialFor(data, dex, kind, areaId)` — a progression raid of the main game (never a small
  world's, a portal's or a nightmare's raid) or Arceus's daily raid. `raidRules` reads Admin → Raids' own numbers first,
  then the raid's special numbers, then the defaults; `raidTeamCap` the special level.
- **`raidBattle.ts`** plays them:
  - `RaidState.special` (`RaidSpecialState`): the rules and where they stand (a move charging, the shield's HP, halved
    hits left, dice gained, the type taken, the last bar).
  - Turn order: Trick Room puts its strike before each side's turn.
  - Each round: a telegraphed move starts charging a round before it fires (`raid_charge`); the sides' damage while it
    charges is counted, and **20 % of a bar** interrupts it (`raid_interrupt`) and costs it its next strike.
  - Its strike (`strike`): a duel step, its dice as the rules have them (Slow Start's half, Geomancy's two more), with
    the hit's own rules (`bossHit`). Spread strikes are one strike per side still in; Spacial Rend hits the next side.
  - Each step taken back (`afterStep`): the shield's HP, a bounced hit, halved hits used, a combo's healing, an
    absorbed type's die, Recover, Full Metal Body, reflected damage, life drained.
  - End of a round (`endOfRound`): snow and sandstorm wear (4 %, sparing their types), the red sky and meteors, Grassy
    Terrain's healing, its own healing.
  - A new bar (`newBar`): the shield, halved hits, the bar's die, the type change (`shiftType`: a menu form — Arceus's
    plates, Ogerpon's masks — or dice of the type that hits the side it faces hardest).
  - The last bar (`unleash`): the below-half form it already had (Giratina, Zygarde), then the special's form (Ultra
    Necrozma, Urshifu), dice, strikes on every side, doubled healing, reflected damage, Cosmoem's hardening.
  - New log entries: `raid_field`, `raid_charge`, `raid_interrupt`, `raid_move`, `raid_skip`, `raid_tick`, `raid_heal`,
    `raid_shield`, `raid_bounce`, `raid_boost`, `raid_shift`, `raid_final`.
- **`raidHit.ts`**: one hit through the raid's rules, inside the duel (`battle.ts` `resolveAttack`, `BattleState.raidHit`):
  ×multipliers, never resisted, Stellar, Prism Armor, the combo cut, an absorbed or nulled type, Delta Stream, the
  combo-only shield, no status (Misty Terrain), longer burns.
- **`progressRaid.ts`**: Mega raids are progression raids with `mega: { base, gem }` and a key `areaId:formDex`;
  `megaRaidLock` ('base' / 'kalos'), `applyMegaRaidWin` (the gem, `raidsDone`, `raidsWon`), `raidOverhaulRulesDue`.
- **`powers.ts`**: `gemShelf` leaves a Mega raid's gem out with the switch on.
- **`raid.ts`**: `raidRecommended` needs the raid's own level with the switch on.
- Save (`EventsSave`, schema): `raidRulesSeen`, `raidIntrosSeen`.

## 3. The raids

The table is the content of `RAID_SPECIALS` and `MEGA_RAIDS` (level · bars × HP per bar · its dice level).

| Raid | Area | Tier | Lv · bars × HP · dice | Weather, terrain, auras | Rules | Last bar |
|---|---|---|---|---|---|---|
| Articuno | Seafoam Islands | trio | 50 · 3 × 2 · 8 | snow | — | +ice |
| Moltres | Victory Road | trio | 50 · 3 × 1.9 · 8 | sun | — | +fire |
| Zapdos | Power Plant | trio | 50 · 3 × 1.8 · 8 | — | — | +electric |
| Mewtwo | Cerulean Cave | apex | 70 · 5 × 1 · 9 | — | Combo shield 25 %; Charged spread every 3 | +psychic, psychic, hits every side ×0.6 |
| Gyarados | Routes 42 & 43 and the Lake of Rage | minor | 50 · 3 × 1.7 · 8 | — | +1 water die per bar | +water |
| Lugia | Whirl Islands | box | 55 · 4 × 2.3 · 8 | rain | First hit per bar halved; Charged spread every 3 | +flying |
| Ho-Oh | Bell Tower | box | 55 · 4 × 1.4 · 8 | sun | Heals 8 %/round (not when burned/poisoned) | +fire |
| Groudon | The Cave of Origin Depths | box | 60 · 4 × 2 · 8 | sun | Charged spread every 3 | +ground, ground |
| Kyogre | The Seafloor Cavern Depths | box | 60 · 4 × 1.8 · 8 | rain | Charged spread every 3 | +water, water |
| Rayquaza | Sky Pillar | apex | 70 · 5 × 1.3 · 9 | — | Air Lock; Charged strong every 3; Meteor 5 %/round | +dragon, dragon |
| Regirock | The Sealed Chambers I | trio | 55 · 3 × 2.8 · 8 | sand | — | +rock |
| Regice | The Sealed Chambers II | trio | 55 · 3 × 2.3 · 8 | snow | — | +ice |
| Registeel | The Sealed Chambers III | trio | 55 · 3 × 2.4 · 8 | — | Combo shield 15 % | +steel |
| Latias | Southern Island | guardian | 50 · 3 × 2.1 · 8 | — | Recover 15 % once per bar | +dragon |
| Latios | Southern Island II | guardian | 50 · 3 × 2.7 · 8 | — | Charged spread every 3 | +psychic |
| Dialga | Mt. Coronet North & Spear Pillar | box | 60 · 4 × 1.6 · 8 | — | Charged recharge every 3 | +steel, steel |
| Palkia | Mt. Coronet North & Spear Pillar | box | 60 · 4 × 0.6 · 8 | rain | Hits the next side too | +water, water |
| Rotom | The Old Chateau | minor | 50 · 3 × 2.2 · 8 | — | Type change (fire/water/ice/flying/grass) | +1 of its type |
| Uxie | The Lakes of Sinnoh | trio | 50 · 3 × 3.3 · 8 | — | First hit per bar halved | +psychic |
| Mesprit | The Lakes of Sinnoh | trio | 50 · 3 × 3.5 · 8 | — | Combos heal you 5 % | +psychic |
| Azelf | The Lakes of Sinnoh | trio | 50 · 3 × 3 · 8 | — | +1 psychic die per bar | +psychic |
| Giratina | Turnback Cave | apex | 70 · 5 × 0.9 · 8 | — | Charged vanish every 3 | — |
| Heatran | Stark Mountain | guardian | 60 · 3 × 1.5 · 8 | — | Absorbs fire | +fire, hits every side ×0.6 |
| Regigigas | Snowpoint Temple | box | 65 · 4 × 1.7 · 8 | — | Slow Start (3 rounds); ×1.3 above 75 % HP | +rock, ice, steel |
| Cresselia | Fullmoon Island | guardian | 55 · 3 × 1.6 · 8 | — | Heals 8 %/round | +psychic, heals ×2 |
| Reshiram | Dragonspiral Tower's Summit | box | 60 · 4 × 1.6 · 8 | — | fire never resisted; Charged burn every 3 | +fire, fire |
| Zekrom | Dragonspiral Tower's Summit | box | 60 · 4 × 1.6 · 8 | — | electric never resisted; Charged strong every 3 | +electric, electric |
| Cobalion | The Swords of Justice | trio | 55 · 3 × 2.4 · 8 | — | First hit per bar halved | +fighting |
| Terrakion | The Swords of Justice | trio | 55 · 3 × 2.7 · 8 | — | Stealth Rock 8 % | +fighting |
| Virizion | The Swords of Justice | trio | 55 · 3 × 2.9 · 8 | grassy terrain | — | +fighting |
| Tornadus | The Abundant Shrine | guardian | 60 · 3 × 3 · 8 | — | Strikes twice every 3 | +flying |
| Thundurus | The Abundant Shrine | guardian | 60 · 3 × 2.7 · 8 | rain | — | +electric |
| Landorus | The Abundant Shrine | guardian | 60 · 3 × 2.6 · 8 | sand | — | +ground |
| Kyurem | The Giant Chasm | apex | 70 · 5 × 1.2 · 9 | — | Charged spread every 3 | — |
| Xerneas | The Team Flare Secret HQ Depths | box | 65 · 4 × 1.8 · 8 | fairy ×1.25 | Charged charge every 3 | +fairy, fairy |
| Yveltal | The Team Flare Secret HQ Depths | box | 65 · 4 × 0.65 · 8 | dark ×1.25 | Drains 25 % | +dark, dark |
| Zygarde | Terminus Cave | apex | 70 · 5 × 1.4 · 9 | — | Heals 6 %/round (not when a combo hit it); ground never resisted; Charged spread every 3 | — |
| Cosmog | The Lakes of the Sunne and Moone | minor | 50 · 2 × 4 · 8 | — | Teleports every 2 | halved hits 2 rounds |
| Solgaleo | The Altar of the Sunne and Moone | box | 65 · 4 × 1 · 8 | sun | Statuses last 1 turn | +steel, steel |
| Lunala | The Altar of the Sunne and Moone | box | 65 · 4 × 1.25 · 8 | — | First hit per bar halved; Charged spread every 3 | +ghost, ghost |
| Necrozma | Ultra Megalopolis | apex | 70 · 5 × 0.8 · 9 | — | Prism Armor ×0.75; Type change (steel/ghost, bars 2,3) | Ultra Necrozma, +dragon, dragon, hits every side ×0.6 |
| Tapu Koko | The Ruins of the Guardians | trio | 60 · 3 × 2.9 · 8 | electric ×1.25 (its own) | — | +electric |
| Tapu Lele | The Ruins of the Guardians | trio | 60 · 3 × 2.9 · 8 | psychic ×1.25 (its own) | — | +psychic |
| Tapu Bulu | The Ruins of the Guardians | trio | 60 · 3 × 3.6 · 8 | grassy terrain | — | +grass |
| Tapu Fini | The Ruins of the Guardians | trio | 60 · 3 × 2.6 · 8 | misty terrain | — | +water |
| Nihilego | Ultra Space: the Deep Sea & the Jungle | beast | 60 · 3 × 2.7 · 8 | — | Beast Boost (up to +3) | +rock |
| Buzzwole | Ultra Space: the Deep Sea & the Jungle | beast | 60 · 3 × 2 · 8 | — | Beast Boost (up to +3); Drains 25 % | +fighting |
| Pheromosa | Ultra Space: the Desert & the Plant | beast | 62 · 3 × 2.8 · 8 | — | Beast Boost (up to +3); Strikes twice ×0.6 | +bug |
| Xurkitree | Ultra Space: the Desert & the Plant | beast | 62 · 3 × 3.7 · 8 | — | Beast Boost (up to +3) | +electric |
| Celesteela | Ultra Space: the Crater & the Forest | beast | 65 · 3 × 2.8 · 8 | — | Beast Boost (up to +3); First hit per bar halved | +steel |
| Kartana | Ultra Space: the Crater & the Forest | beast | 65 · 3 × 3.1 · 8 | — | Beast Boost (up to +3); Never resisted | +grass |
| Guzzlord | Ultra Space: the Ruin | beast | 70 · 3 × 1.7 · 8 | — | Beast Boost (up to +3) | +dark |
| Stakataka | Poni Grove | beast | 63 · 3 × 2.9 · 8 | — | Beast Boost (up to +3); Trick Room | +steel |
| Blacephalon | Poni Grove | beast | 63 · 3 × 3.7 · 8 | — | Beast Boost (up to +3); Charged blast every 3 | +ghost |
| Poipole | The Ultra Recon Squad | minor | 55 · 3 × 4 · 8 | — | Beast Boost (up to +3) | +poison |
| Eternatus | The Energy Plant Summit | apex | 70 · 5 × 1 · 9 | — | Red sky 4 %/round; Charged spread every 3 | +dragon, dragon |
| Zacian | The Slumbering Weald's Depths | box | 70 · 4 × 2.1 · 8 | — | +1 fairy die; Charged strong every 3 | +steel, steel |
| Zamazenta | The Slumbering Weald's Depths | box | 70 · 4 × 1.5 · 8 | — | Combo shield 20 % | +steel, steel, reflects 20 % |
| Kubfu | The Master Dojo | minor | 55 · 3 × 3.9 · 8 | — | +1 fighting die per bar | Urshifu, +dark |
| Regieleki | The Split-Decision Ruins | guardian | 65 · 3 × 2.2 · 8 | — | Strikes twice ×0.6 | +electric |
| Regidrago | The Split-Decision Ruins | guardian | 65 · 3 × 1.8 · 8 | dragon ×1.25 (its own) | — | +dragon |
| Glastrier | The Crown Shrine | guardian | 75 · 3 × 2.3 · 8 | snow | Beast Boost (up to +3) | +ice |
| Spectrier | The Crown Shrine | guardian | 75 · 3 × 2.8 · 8 | — | Beast Boost (up to +3) | +ghost |
| Calyrex | The Crown Shrine | apex | 80 · 5 × 1 · 9 | — | Type change (ice/ghost); No items | +2 of its type |
| Enamorus | The Crimson Mirelands | guardian | 70 · 4 × 4 · 8 | — | Love (heals) / hate (×1.4) | +fairy, hits every side ×0.6 |
| Galarian Articuno | Dyna Tree Hill | trio | 70 · 3 × 2 · 8 | — | First hit per bar halved | +psychic |
| Galarian Zapdos | Dyna Tree Hill | trio | 70 · 3 × 2.6 · 8 | — | Charged strong every 3 | +fighting |
| Galarian Moltres | Dyna Tree Hill | trio | 70 · 3 × 2.5 · 8 | — | Charged spread every 3 | +dark |
| Koraidon | The Zero Lab | box | 75 · 4 × 1.3 · 8 | sun, fighting ×1.25 (its own) | — | +fighting, fighting |
| Miraidon | The Zero Lab | box | 75 · 4 × 1.1 · 8 | electric ×1.25 (its own) | — | +electric, electric |
| Wo-Chien | The Shrines of Ruin | trio | 60 · 3 × 2.7 · 8 | — | Combos −30 % | +grass |
| Chien-Pao | The Shrines of Ruin | trio | 60 · 3 × 2.5 · 8 | — | Strikes ×1.2 | +ice |
| Ting-Lu | The Shrines of Ruin | trio | 60 · 3 × 1.6 · 8 | — | Your upgrades −2 | +ground |
| Chi-Yu | The Shrines of Ruin | trio | 60 · 3 × 3.4 · 8 | — | Burns +2 turns | +fire |
| Okidogi | Loyalty Plaza | trio | 70 · 3 × 2.3 · 8 | — | Strikes ×1.2 | +fighting |
| Munkidori | Loyalty Plaza | trio | 70 · 3 × 2.5 · 8 | — | First hit per bar halved | +psychic |
| Fezandipiti | Loyalty Plaza | trio | 70 · 3 × 2.5 · 8 | — | Heals 6 %/round | +fairy |
| Ogerpon | Oni Mountain & the Crystal Pool | guardian | 70 · 3 × 2.1 · 8 | — | Type change (its forms) | +1 of its type |
| Walking Wake | The Paradox Sightings | paradox | 75 · 3 × 2.5 · 8 | sun, water ×1.25 (its own) | — | +dragon |
| Iron Leaves | The Paradox Sightings | paradox | 75 · 3 × 2.4 · 8 | grass ×1.25 (its own) | — | +psychic |
| Gouging Fire | The Paradox Sightings | paradox | 75 · 3 × 1.8 · 8 | sun, fire ×1.25 (its own) | — | +dragon |
| Raging Bolt | The Paradox Sightings | paradox | 75 · 3 × 1.9 · 8 | sun, electric ×1.25 (its own) | — | +dragon |
| Iron Boulder | The Paradox Sightings | paradox | 75 · 3 × 2.4 · 8 | rock ×1.25 (its own) | — | +psychic |
| Iron Crown | The Paradox Sightings | paradox | 75 · 3 × 2.3 · 8 | steel ×1.25 (its own) | — | +psychic |
| Terapagos | The Area Zero Underdepths | apex | 85 · 5 × 0.65 · 9 | — | First 2 hits per bar halved; Charged spread every 3 | +normal, normal, hits every side ×0.6, Stellar: super effective on all |
| Arceus | The Hall of Origin (daily raid) | mythic | 70 · 5 × 0.65 · 9 | — | Type change (its forms); Charged spread every 3 | new plate every strike |

**Mega raids** (after Kalos; the win gives the gem or orb):

| Raid | Its raid | Gem | Lv · bars × HP · dice | Weather | Rules | Last bar |
|---|---|---|---|---|---|---|
| Mega Gyarados | Gyarados (Routes 42 & 43 and the Lake of Rage) | Gyaradosite | 60 · 3 × 2.2 · 8 | — | Mega die; +1 dark die per bar | +dark |
| Mega Mewtwo X | Mewtwo (Cerulean Cave) | Mewtwonite X | 75 · 5 × 0.85 · 9 | — | Mega die; Combo shield 25 %; Charged strong every 3 | +fighting, fighting |
| Mega Mewtwo Y | Mewtwo (Cerulean Cave) | Mewtwonite Y | 75 · 5 × 0.9 · 9 | — | Mega die; Combo shield 25 %; Charged spread every 3 | +psychic, psychic, hits every side ×0.6 |
| Mega Latias | Latias (Southern Island) | Latiasite | 60 · 3 × 2.3 · 8 | — | Mega die; Recover 15 % once per bar | +dragon |
| Mega Latios | Latios (Southern Island II) | Latiosite | 60 · 3 × 2.9 · 8 | — | Mega die; Charged spread every 3 | +psychic |
| Primal Kyogre | Kyogre (The Seafloor Cavern Depths) | Blue Orb | 65 · 4 × 1.6 · 8 | heavyRain | Mega die; Charged spread every 3 | +water, water |
| Primal Groudon | Groudon (The Cave of Origin Depths) | Red Orb | 65 · 4 × 1.1 · 8 | harshSun | Mega die; Charged spread every 3 | +ground, ground |
| Mega Rayquaza | Rayquaza (Sky Pillar) | Meteorite | 75 · 5 × 1 · 9 | strongWinds | Mega die; Charged strong every 3; Meteor 5 %/round | +dragon, dragon |
| Mega Heatran | Heatran (Stark Mountain) | Heatranite | 65 · 3 × 1.4 · 8 | — | Mega die; Absorbs fire | +fire, hits every side ×0.6 |

## 4. Balance

`pnpm raid-overhaul-balance [raids=100] [shard] [shards]` (`scripts/raid-overhaul-balance.ts`): your side brings three
Pokémon that hit the raid Pokémon super effectively (the green thumb's rule), the two others are random NPC trainers,
all at the team cap and on the battle AI, **with every rule playing**. `TUNE=1` searches each raid's HP per bar for
its tier's target: minor 70 %, trio 60 %, guardian and Ultra Beast 55 %, Paradox 50 %, box legend 45 %, apex, Arceus and
Mega raids 35 %. About ±8 points of noise at 120 raids. Before the overhaul the same team won anything from 0 % (Dialga,
Giratina) to 100 % (Uxie) at Lv.50, 3 bars × 2.2.

| Tier | Target | Raids | Average | Lowest – highest | Before (Lv.50, 3 × 2.2, no rules) |
|---|---:|---:|---:|---|---:|
| trio | 60 % | 26 | 60 % | 51 – 72 % | 84 % |
| guardian | 55 % | 13 | 55 % | 49 – 62 % | 82 % |
| box | 45 % | 17 | 48 % | 37 – 57 % | 51 % |
| apex | 35 % | 9 | 35 % | 28 – 50 % | 49 % |
| mythic | 35 % | 1 | 33 % | 33 – 33 % | 29 % |
| beast | 55 % | 9 | 55 % | 44 – 63 % | 85 % |
| paradox | 50 % | 6 | 52 % | 46 – 58 % | 90 % |
| minor | 70 % | 5 | 85 % | 71 – 100 % | 88 % |
| mega | 35 % | 9 | 34 % | 28 – 40 % | — |

Each raid, win % with the rules:

Gyarados 71, Articuno 62, Zapdos 53, Moltres 67, Mewtwo 34, Lugia 38, Ho-Oh 55, Regirock 62, Regice 72, Registeel 53, Latias 53, Latios 54, Kyogre 48, Groudon 40, Rayquaza 33, Rotom 76, Uxie 57, Mesprit 65, Azelf 57, Dialga 37, Palkia 56, Heatran 59, Regigigas 42, Giratina 40, Cresselia 55, Arceus 33, Cobalion 68, Terrakion 57, Virizion 56, Tornadus 51, Thundurus 49, Reshiram 52, Zekrom 47, Landorus 62, Kyurem 28, Xerneas 53, Yveltal 55, Zygarde 33, Tapu Koko 53, Tapu Lele 57, Tapu Bulu 51, Tapu Fini 65, Cosmog 100, Solgaleo 55, Lunala 45, Nihilego 53, Buzzwole 63, Pheromosa 61, Xurkitree 47, Celesteela 58, Kartana 62, Guzzlord 49, Necrozma 30, Poipole 100, Stakataka 57, Blacephalon 44, Zacian 44, Zamazenta 57, Eternatus 36, Kubfu 77, Regieleki 59, Regidrago 50, Glastrier 56, Spectrier 56, Calyrex 34, Enamorus 60, Wo-Chien 65, Chien-Pao 53, Ting-Lu 58, Chi-Yu 64, Koraidon 51, Miraidon 49, Walking Wake 57, Iron Leaves 58, Okidogi 56, Munkidori 61, Fezandipiti 54, Ogerpon 57, Gouging Fire 57, Raging Bolt 46, Iron Boulder 49, Iron Crown 48, Terapagos 50, Mega Gyarados 30, Mega Mewtwo X 31, Mega Mewtwo Y 40, Mega Latias 30, Mega Latios 37, Primal Kyogre 39, Primal Groudon 38, Mega Rayquaza 28, Galarian Articuno 68, Galarian Zapdos 57, Galarian Moltres 64, Mega Heatran 33.

## 5. Screens (UI guidelines apply)

- **The raid page** (progression and daily): a "This raid" section under START lists its rules
  (`RaidRules.tsx` `RaidRulesPanel`, `raidRuleRows`): its level and bars, the weather or terrain, the auras, the Mega
  die, each rule, its last bar; the book icon opens the rules pop-up (`RaidRulesInfo`).
- **Mega raids**: the kicker MEGA RAID; locked "Catch {name} first" or "Earn Mega Evolution in Kalos" (with the gem it
  gives); done "You won this Mega raid: the {gem} is yours"; no ball odds; the result card shows the gem.
- **The fight**: every new log entry is told (`raidAnimator.ts` `describeSpecial`), with banners for CHARGING!,
  INTERRUPTED!, UNLEASHED!, LAST BAR!; the boss plate carries the marks (`RaidMarks`): the weather or terrain, a blinking
  CHARGING tag (two steps, still under reduced motion), the shield's HP, the last bar's crown.
- **The entrance** (`fx/timelines/legendRaid.ts`, scenes in `legendRaidScenes.ts`): the pixel engine's, timed like
  Giratina's and Darkrai's (`RAID_ENTRANCE_REVEAL` 2.75 s, 6.2 s) so the raid intro's words land on it. The place in
  dithered steps (water rolling where there is water), its weather, its omen (frost, lightning, a quake, a whirlpool,
  bells, Braille, a ripple, an orbit of plates or rocks, cells, a prism, meteors, a neon grid, blade slashes, a rift,
  light blooming, chains snapping, fog, colour draining), two heartbeats, the legend coming down, rising or taking shape
  in silhouette with its aura's outline, rays and a gleam, the reveal's flash and rings, then it hovers. Motion
  levels: full; short (fewer particles, no shake); off (straight to the fight). Every scene is in the FX lab.
- **Admin → Config**: the Raid overhaul switch. Admin → Raids' progression numbers show the overhaul's as
  placeholders and still win when set.
- Kitchen sink: "Raid overhaul (docs/40)": the marks in each state, each kind of raid's rules, the pop-up.

## 6. Server (migration 0076)

- `game_config.raidOverhaul` = `{"access": "off"}` (kept when there), `raid_overhaul_open()`.
- `raid_mega_base(form)`: the Mega raids' forms and bases (the same list as `MEGA_RAIDS`; a test keeps them in sync).
- `raid_progress_dex(key)`: as before, or with the switch on for the caller a Mega raid's `areaId:formDex` in its raid
  boss's area. Five-digit dexes pass now: the Galarian birds' raids (`areaId:10169`…) were refused before.
- `tests/raid-overhaul-sql.test.ts` (PGlite). `supabase/seed.sql` carries it inlined.

## 7. Setting it up

Now: run 0084 (above) once the client is deployed; nothing to switch. Before it:

1. Merge and deploy the client.
2. Run [`supabase/migrations/0076_raid_overhaul.sql`](https://github.com/Splifingald/pokedice/blob/feature/version_2_3/supabase/migrations/0076_raid_overhaul.sql)
   in the SQL editor (safe to run again; `supabase/seed.sql` carries it inlined).
3. Admin → Config → **Raid overhaul**: On for admin to try it, then On for everyone. Publish.

## 8. Tests

- `tests/engine/raid-overhaul.test.ts`: the switch (off as before, the numbers, the admin's win, Arceus only among the
  daily raids); a hit through the rules (shield, absorb, halving, never resisted); a fight's weather, telegraph,
  shield, last bar, Arceus's plate, a Mega raid's form and die, determinism; every raid and Mega raid plays to its end.
- `tests/engine/mega-raids.test.ts`: which Mega raids, their lock, the win's gem, the Mart's shelf.
- `tests/engine/popups.test.ts`: the rules pop-up's place in the queue.
