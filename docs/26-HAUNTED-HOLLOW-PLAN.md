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

| # | Area | Identity |
|---|---|---|
| 1 | Dusk Road | the simple road |
| 2 | Foggy Marsh | |
| 3 | Whispering Woods | |
| 4 | Lantern Town | |
| 5 | Old Quarry | |
| 6 | Frozen Lake | |
| 7 | Sunken Shore | |
| 8 | Rusted Armory | |
| 9 | Windy Cliffs | |
| 10 | Spirit Mountain | |
| 11 | **Shadow Elite** | the league: **only the five fights** (no round), Lv.52 → 60, three Pokémon each, no badges. Poison, Ice, Psychic, Ghost, then **Dark** (Tyranitar, Weavile, Zoroark; counted as the champion). New names on existing Elite pictures. |

Secret areas, **short** (a small deck with a few species found only there) **then the boss or raid**:

| # | Secret area | Boss | Opens when |
|---|---|---|---|
| S1 | Cemetery | shiny **Haunter** Lv.30 | 20 different Pokémon caught |
| S2 | Haunted House | shiny **Mimikyu** Lv.40 | 50 different Pokémon caught |
| S3 | Cavern | shiny **Spiritomb** Lv.50 | a Pokémon reaches Lv.60 |
| S4 | Newmoon Island | shiny **Darkrai** raid Lv.60 | the Shadow Elite beaten (every main area done) |
| S5 | Distortion World | shiny **Giratina** raid Lv.70 | every Pokémon of the world caught but Giratina (119) |

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
