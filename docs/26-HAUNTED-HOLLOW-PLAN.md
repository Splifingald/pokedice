# Haunted Hollow: the first small world, and its Pokémon going home

The user's request of 2026-10-13, answered question by question the same day. Two parts, built in this order:

1. **A new small-world rule** (every world, docs/21): when a world closes, its Pokémon go home, locked by level.
2. **Haunted Hollow**, a ghost-type small world, plus the engine and Home pieces it needs.

Branch `claude/small-world-ghost-event-0ug0zg` (from `feature/version_2`), a PR to `feature/version_2` at the end.

## 1. The rule: the world's Pokémon go home

**Status: built.** `engine/homecoming.ts` (`sendWorldHome` from `closeWorld`, `releaseWorldHome` in the store's settle
chain, `releaseHomer`, `regionBestLevel`), `events.worldHome` and `events.world.home` in the save, the Team screen's
Waiting to unlock section and the waiting Pokémon's sheet (`HomerLock`, Let it go), the rules row and the closing
pop-up's counts (docs/15 §13, §22). Tests: `tests/engine/world-homecoming.test.ts`, `e2e/worlds.spec.ts` (the closing).

Until now only the shiny mythical left a world; everything else closed with it. From now on:

| Question | Answer |
|---|---|
| Who goes | **Everyone** in the world's team and Box when it closes, the partner included, evolved or not. Duplicates merge into the highest level as usual (`placeInBox`), **shinies always stay their own**. |
| When | **When the world closes**: its end, the admin's End now, or the world deleted from the list. |
| Where | The region of its **current species** (`regionOfSpecies`: Dusknoir → Sinnoh, Misdreavus → Johto, Mismagius → Sinnoh). |
| Region not started | It **waits** and joins that region, locked, the moment the region is started. |
| The lock | It waits **apart** from the region's Box until an unlocked Pokémon of that region (team, Box or that region's Day Care residents) reaches its level. **Once lifted, for good.** |
| What a locked one can do | **Nothing but sit**: no team, Day Care, raid teams, Versus, trades, gifts or items. It can be **nicknamed** and **released**. It shows in its region's Box with a lock and "Lv.42 · your best here: Lv.31". |
| Merging with a copy you have | It **waits apart; the day it unlocks the usual rule applies** (a stronger one replaces your plain copy in place, a weaker one merges into it, a shiny is its own). |
| Pokédex | It counts in that region's Pokédex **when it unlocks**, not on arrival. |
| Scope | **Every small world**, no switch of its own (Small worlds has one); the world's rules pop-up says so. |
| The closing pop-up | **A count per region**: "Your Pokémon went home: Kanto 8 · Johto 5 · Sinnoh 3. Each waits until your best there reaches its level." |
| Raid prizes in a world | Like every other Pokémon: **home at the end, level-locked** (shiny Darkrai Lv.60 waits for a Sinnoh Pokémon at Lv.60). |
| The world's mythical (when a world has one) | Unchanged: it leaves at once, unlocked. |

## 2. Haunted Hollow

### 2.1 The world

| Setting | Value |
|---|---|
| Name | **Haunted Hollow** (ten languages) |
| Dates | **Sat 18 Oct 2026 12:00 → Sat 1 Nov 2026 12:00 UTC**; every area open from day one (only the chain and the secret conditions gate them) |
| Entry | **3 badges** |
| Starters | **Drifloon, Golett, Pumpkaboo** at Lv.5 (also wild in the early areas) |
| XP | **×1.5** (the campaign simulator checks that Lv.60 is reachable in the 14 days) |
| Booster | **Ghost ×1.2**, both sides (as boosters work) |
| Colours | main `#4a2f7a` (deep purple), accent `#ff8a2a` (pumpkin), ground `#ece4f6` (lavender) |
| Banner | the existing **haunted** picture (no new art: existing pictures only) |
| Pokémon | **120** species to catch (the ghost lines, their evolutions and pre-evolutions, the bosses, Gen 1–3 fillers) |

### 2.2 The Mart (the world's own ₽)

Poké Ball ₽20 · Great Ball ₽50 · Ultra Ball ₽100 · **Master Ball ₽5,000, 1 per player** · Potion ₽15 · Super Potion ₽35 ·
Hyper Potion ₽80 · **Revive ₽300** · Link Cable ₽1,000 · Dusk Stone, Dawn Stone, Reaper Cloth, Cracked Pot ₽200 each.
No Bait anywhere. No limit except the Master Ball. **A world's Mart sells what its list says, whatever the global item
switch** (the Link Cable is Off in Admin → Config).

### 2.3 Its Pokémon

- **Ghost lines** with their evolutions and pre-evolutions: Gastly, Misdreavus, Sableye, Shuppet, Duskull, Drifloon,
  Snorunt (Glalie and Froslass), Litwick, Honedge, Phantump, Pumpkaboo, Sandygast, Sinistea, Dreepy, Bramblin,
  Greavard, Golett. The item evolutions use the Mart's items (the user's choice); Haunter, Phantump and Pumpkaboo use
  the Link Cable.
- **Dreepy** is a very rare find in the Cavern only (Drakloak and Dragapult by level, 50 and 60).
- **Bosses and raids**: shiny Haunter, Mimikyu, Spiritomb (bosses); shiny Darkrai and Giratina (raids).
- **Fillers**, Gen 1–3 of varied types: **no Normal and no Fighting type** (pure or dual), **no Pokémon that evolves
  with an item**, no legendaries or mythicals, no fossils, no Gen 1–3 starters, **no Dark type before area 5**.

### 2.4 Its areas

Every area's deck is **10 cards** (wild and trainers in varied amounts, **1 item, 1 Pokémon Center**); the game's usual
extra Centers still happen. **The rounds per area come from the campaign simulator.** Easy at first and harder later.
Each area has a clear identity. Existing pictures only.

**Status: built** in `scripts/content-haunted-hollow.ts` (`pnpm haunted-hollow <in.json> <out.json>` adds it to an
admin export), checked by `tests/content/haunted-hollow.test.ts`: 120 to catch (the world's Pokédex counts them), all
but Giratina catchable before the Distortion World opens, no Normal or Fighting type, no Dark type before area 5, 10
cards in every main deck and 6 in a secret one, each with one item and one Center. Pictures: existing ones only
(`src/fx/areaArtMap.ts`). Names in the ten languages (`area.*`, `region.world-haunted-hollow`).

| # | Area | Picture | Lv. | Deck (wild · trainers · item · Center) | Rounds | Foes’ upgrades | Wild | Trainers | Boss / raid | Finds |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Dusk Road | evening | 3–7 | 7 · 1 · 1 · 1 | 1 | 1 | Caterpie, Weedle, Hoppip, Metapod (rare), Kakuna (rare), Drifloon (rare), Gastly (rare) | Bug Catcher Toby (Caterpie 5, Weedle 5); Youngster Wes (Hoppip 6); Lass Ivy (Weedle 4, Hoppip 5) | — | — |
| 2 | Foggy Marsh | a857 | 7–12 | 6 · 2 · 1 · 1 | 1 | 1 | Wooper, Grimer, Surskit, Gastly, Golett, Skiploom (rare) | Fisherman Moss (Wooper 10, Surskit 9); Channeler Nell (Gastly 10, Gastly 10); Camper Reed (Grimer 11); Picnicker Fen (Hoppip 10, Wooper 11) | — | — |
| 3 | Whispering Woods | a852 | 11–16 | 6 · 2 · 1 · 1 | 1 | 2 | Phantump, Pumpkaboo, Bramblin, Venonat, Spinarak, Pineco, Butterfree (rare), Beedrill (rare) | Bug Catcher Ash (Venonat 14, Spinarak 14); Hex Maniac Wren (Phantump 15, Pumpkaboo 15); Aroma Lady Fern (Pineco 15, Bramblin 15) | — | — |
| 4 | Lantern Town | oldtown | 15–21 | 5 · 3 · 1 · 1 | 1 | 2 | Litwick, Ponyta, Mareep, Spoink, Shuppet, Flaaffy (rare), Misdreavus (rare) | Kindler Blaze (Ponyta 18, Litwick 18); Psychic Iris (Spoink 18, Shuppet 19); Channeler Hilda (Shuppet 18, Litwick 19, Gastly 18); Gentleman Orson (Mareep 19, Flaaffy 20) | — | Dusk Stone (once) |
| 5 | Old Quarry | a652 | 20–26 | 5 · 3 · 1 · 1 | 1 | 3 | Golett, Geodude, Aron, Cubone, Poochyena, Graveler (rare), Lairon (rare) | Hiker Rocco (Geodude 23, Golett 24); Ruin Maniac Pell (Cubone 24, Aron 24); Worker Gus (Geodude 24, Aron 25, Golett 24); Punk Guy Vex (Poochyena 25, Cubone 25) | — | — |
| 6 | Frozen Lake | snow | 25–32 | 5 · 3 · 1 · 1 | 1 | 3 | Snorunt, Swinub, Spheal, Smoochum, Jynx (rare) | Skier Holly (Snorunt 29, Swinub 29); Ace Trainer Neve (Spheal 29, Smoochum 29, Snorunt 30); Psychic Ilse (Jynx 30, Smoochum 28); Hex Maniac Rime (Snorunt 30, Haunter 30) | — | Dawn Stone (once) |
| 7 | Sunken Shore | beach | 31–38 | 4 · 4 · 1 · 1 | 1 | 4 | Sandygast, Wingull, Krabby, Chinchou, Corphish, Kingler (rare), Crawdaunt (rare) | Swimmer Coral (Chinchou 34, Krabby 34); Fisherman Pike (Corphish 35, Krabby 35); Sailor Brine (Wingull 35, Corphish 36, Krabby 35); Beauty Pearl (Sandygast 36, Chinchou 35); Picnicker Sandy (Sandygast 34, Wingull 34) | — | — |
| 8 | Rusted Armory | industrial | 37–44 | 4 · 4 · 1 · 1 | 1 | 5 | Honedge, Voltorb, Koffing, Beldum, Skarmory, Doublade (rare), Metang (rare) | Scientist Volt (Voltorb 41, Koffing 41, Electrode 42); Engineer Rust (Skarmory 41, Honedge 41); Ninja Boy Kage (Honedge 41, Doublade 42); Super Nerd Ohm (Beldum 41, Voltorb 41, Weezing 42); Punk Girl Smog (Koffing 42, Weezing 42) | — | Link Cable (once) |
| 9 | Windy Cliffs | mountain | 42–50 | 4 · 4 · 1 · 1 | 1 | 4 | Drifloon, Zubat, Numel, Bagon, Golbat, Drifblim (rare), Brambleghast (rare), Shelgon (rare) | Bird Keeper Gale (Drifblim 47, Golbat 47); Hiker Crag (Numel 46, Camerupt 47); Dragon Tamer Ryu (Bagon 46, Shelgon 48); Backpacker Sky (Drifloon 46, Golbat 46, Numel 46); Ace Trainer Kite (Drifblim 48, Shelgon 48, Camerupt 47) | — | Revive, Rare Candy (once) |
| 10 | Spirit Mountain | lair-summit | 48–56 | 3 · 5 · 1 · 1 | 1 | 5 | Duskull, Misdreavus, Houndour, Wynaut, Banette, Absol, Wobbuffet (rare), Dusclops (rare), Houndoom (rare) | Sage Kaito (Wobbuffet 52, Banette 52); Channeler Yumi (Dusclops 52, Misdreavus 51, Banette 51); Hex Maniac Morgana (Mismagius 53, Dusclops 52); Psychic Orin (Wobbuffet 52, Jynx 52); Cooltrainer Raven (Houndoom 53, Absol 53, Drifblim 52); Punk Guy Ash (Houndoom 52, Mightyena 52) | — | Revive, Rare Candy |
| 11 | Shadow Elite | league | 52–60 | — | 0 | 7 | — | Elite Four Vesper (Crobat 53, Muk 53, Gengar 54); Elite Four Rime (Froslass 55, Walrein 55, Mamoswine 56); Elite Four Orin (Metagross 57, Wobbuffet 56, Jynx 56); Elite Four Morwen (Chandelure 58, Dusknoir 57, Aegislash 58); Champion Nyx (Tyranitar 60, Weavile 59, Zoroark 60) | — | — |
| S1 | Cemetery | haunted | 24–30 | 3 · 1 · 1 · 1 | 1 | 3 | Greavard, Duskull, Gastly, Cubone, Haunter, Houndstone (rare) | Channeler Agnes (Gastly 27, Duskull 27, Haunter 28) | shiny Haunter Lv.30 | Reaper Cloth (once) |
| S2 | Haunted House | a121 | 34–40 | 2 · 2 · 1 · 1 | 1 | 5 | Sinistea, Shuppet, Haunter, Misdreavus, Lampent, Banette, Gourgeist (rare) | Maid Lenore (Sinistea 38, Banette 38); Butler Grimsby (Lampent 39, Haunter 38) | shiny Mimikyu Lv.40 | Cracked Pot (once) |
| S3 | Cavern | deepcave | 48–55 | 3 · 1 · 1 · 1 | 1 | 6 | Sableye, Golbat, Lairon, Graveler, Golurk, Aggron (rare), Dreepy (very rare) | Ruin Maniac Dirk (Sableye 52, Golurk 53, Aggron 54) | shiny Spiritomb Lv.50 | Revive, Rare Candy |
| S4 | Newmoon Island | a127 | 58–64 | 3 · 1 · 1 · 1 | 1 | 7 | Cacnea, Mightyena, Houndoom, Crawdaunt, Cacturne, Absol | Punk Girl Noctis (Houndoom 62, Cacturne 62, Absol 63) | shiny Darkrai Lv.60 (raid) | Revive |
| S5 | Distortion World | a123 | 65–70 | 3 · 1 · 1 · 1 | 1 | 8 | Gengar, Chandelure, Aegislash, Dusknoir, Trevenant, Mismagius, Dragapult (rare) | Hex Maniac Umbra (Gengar 68, Chandelure 68, Dusknoir 69) | shiny Giratina Lv.70 (raid) | Revive, Rare Candy |


The secret areas open with: **Cemetery** 20 different Pokémon caught · **Haunted House** 50 · **Cavern** a Pokémon at
Lv.60 · **Newmoon Island** the Shadow Elite beaten (`cleared`) · **Distortion World** 119 caught (all but Giratina).
The Shadow Elite: Vesper (Poison), Rime (Ice), Orin (Psychic), Morwen (Ghost), then Champion Nyx (Dark), on Koga's,
Glacia's, Will's, Phoebe's and Karen's pictures; no badges.

**Balance** (the campaign simulator, 3 starters × 3 seeds, 400 encounters each): every run clears the chain. One round
per area (two made the team outgrow the areas: Lv.33 arriving in Lantern Town). The team arrives a few levels above
each area early on, the fights get harder from Windy Cliffs (about 6 to 10 wipes per run there and on Spirit Mountain,
the Dark and Ghost types the theme brings), and the Shadow Elite falls in about 13 tries. About 300 encounters clear
the chain; the foes' upgrade levels climb from 1 to 7 (the world's own tracks keep pace with its ₽: dice 6 to 8 by
Windy Cliffs).

### 2.5 Engine pieces the event needs

**Status: built** (`tests/engine/world-event-pieces.test.ts`). Where it says more than the list below:
- A boss caught is noted in its area's progress (`AreaProgress.bossesCaught`, `noteBossCaught`); in a small world
  `bossCaught` reads that, elsewhere the Pokédex. A missed throw brings it back until it's caught there.
- A world's raid fights at its boss's own level and caps the teams there (`worldRaidLevel` in `raidRules` /
  `raidTeamCap`, given the raid's area), so its Giratina is Lv.70 while Sinnoh's keeps the admin's numbers.
- The world's prizes (`worldPrizes`, `worldPrize`, `worldPrizeCaught`): its mythical, then its bosses and raids marked
  shiny, in area order. The square outside and the pop-up show the one it's known by (its mythical, else its last
  shiny raid: Giratina); its rules list the others. The admin can't save a world with no prize at all.
- Inside a small world the item switches don't apply (`itemOnFor`): its Mart's list, its loot and its bag are the
  admin's own choice for it.

- **A world boss can be caught until that boss is caught**, whatever the Pokédex says (today a boss is catchable only
  when its species is missing, and Gastly becomes Haunter at Lv.25).
- **Shiny raid prizes**: a world's raid boss marked shiny stays shiny (today a legendary's raid never is). The single
  mythical becomes **optional**: a world may have none, one, or raids instead.
- **A new unlock condition, an area cleared** (`{ kind: 'cleared', areaId }`), for Newmoon Island.
- **The world's Mart ignores the global item switch.**

### 2.6 Home inside a world, and its upgrades

The user's calls of 2026-10-13, after the first build:
- **The nav bar stays** inside a world: its Mart, Team, Pokédex and Upgrades are reached there.
- **Real dice upgrades in every world**: its own tracks from level 1, bought with its ₽ (dice by level is gone); its
  foes use the area's enemy upgrade level; the boosters stay on both sides (`withWorldBoost`). No General tab inside.
- **Home inside shows its secret areas only** (and the mythical's square for a world that has one): **one row per
  secret area** (up to 6), two squares wide, **the picture across the whole row** with the name, the gauge and the
  line over its darkened foot, readable on any picture; locked (greyed, the boss a silhouette, the condition), new,
  open, done (CAUGHT).
- The way back is unchanged: the strip's Back to Kanto.

**Status: built** (`worldSecrets` in `engine/worlds.ts`, `SecretRowView`, docs/15 §22, `e2e/worlds.spec.ts`).

### 2.7 Delivery

The content comes as **a bundle file** (the user's export with the world added), for `pnpm import-bundle`. The code
(rule, engine pieces, Home) comes in a PR to `feature/version_2`.
