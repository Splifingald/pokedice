# Side quests from the main games: plan (for validation)

Status: **draft, awaiting the user's go-ahead** (2026-11-01). Branch `ccr-f432a8de-hqqe99`. Order of work: questions
(done, §0) → this plan → Visual Lab mockups for the new scenes (a gift's giver, the Safari screen) → implementation,
one part at a time in the order of §7.

The user's question of 2026-11-01: which unique moments and side quests of the main games (Gen 1 to 4, then every
generation) could make the adventure less monotonous. Today every area plays the same way: draw a card, fight, throw the
catch die, repeat for its rounds, then the gym. The parts below break that rhythm: a rival who turns up, a gift handed
over, a Poké Ball that isn't one, a Pokémon asleep across the road, a Safari with no battles, a legendary that wants the
right Pokémon first.

## 0. Decisions (the user's answers, 2026-11-01)

| Topic | Decision |
|---|---|
| Rivals | Set meetings in **every region**, the rival's team per starter where the original had one. Rivals met today at random in trainer pools leave the pools while the switch is on. |
| Gifts | Gift Pokémon and Eggs from **every generation**, each with a short intro: the giver comes in and hands it over, animated. A pick-one choice only where the Pokémon not taken is still met in the region. |
| NPC trades | **No.** |
| Key items | **No** (no Silph Scope, Poké Flute, Squirtbottle or Devon Scope). |
| Pokémon posing as items | Item cards that turn into **Voltorb or Electrode**, and Gen 5's **Foongus and Amoonguss**. **No Gimmighoul.** |
| Roadblocks | A set **Snorlax** across Kanto's road as a boss (no Poké Flute); **Sudowoodo**, **Kecleon** and Kalos's Snorlax the same way. |
| Safari | The **Trick or Treat system** (docs/29): Bait and Safari Balls, no battle, in **every region that has a Safari**. As in the games it is **not a blocker**: a **secret area of its own**, a mini game, that opens when its route or city is reached; an area merged with another road is **split**. No XP there unless the campaign simulator says the main road got too hard. Tiers by catch value. |
| Regigigas | Snowpoint Temple needs **Regirock, Regice and Registeel caught** (any region's Pokédex). A player who has already been in keeps it open. |
| Not doing | Outbreaks, weekday Pokémon, tides, honey trees, Feebas's spot, rematches, Poké Radar, the other legendary quests, new Poké Balls, Pokérus, the lottery, the Trick House, quizzes, contests, the Battle Frontier's rules, weather, takeovers, partners, the Bug-Catching Contest, gauntlets. |

## 1. Regigigas and the three Regis

### Rules

- A new unlock condition, **species caught**: `{ kind: 'caught', dex: number[] }`, met when every species listed is in a
  Pokédex, **any region's**. The Regis are caught in Hoenn and the Temple is in Sinnoh, and each region keeps its own
  Pokédex (`speciesCaughtEverywhere`, `engine/daycare.ts`, already reads them all). Caught rather than owned, so trading
  a Regi away doesn't shut the Temple again.
- **Snowpoint Temple**: its conditions stay (Routes 216 & 217 and Snowpoint City reached, 130 caught, Lv.65) and the
  Regis join them.
- **Already in**: a secret area checks its conditions every time (`isAreaUnlocked`), so a player who has been in
  Snowpoint Temple without the Regis would find it shut. A secret area the player has already entered stays open, whatever
  its `caught` conditions say.
- The Map's "???" card: "Catch Regirock, Regice and Registeel · 1/3", the three sprites grey until caught.

### Pieces

- Engine: `UnlockCondition` gets `caught`; `conditionStatus` counts it across regions; `isAreaUnlocked` keeps an area
  already entered open.
- Admin → Areas → Unlock conditions: the new kind (a list of Pokémon); `admin/schemas.ts` checks it.
- Strings: the condition's label, ten languages.
- A migration: Snowpoint Temple's `unlock_conditions`, `configVersion` + 1; `supabase/seed.sql` carries it.
- No switch and no rules: content on the secret areas' existing rules (docs/15 §20 is for features players can do).
- Tests: the condition across regions (parked regions included), an area already entered, the label's count.

## 2. Roadblocks: Snorlax, Sudowoodo, Kecleon

### Rules

- Each is its area's **boss** (`legendaryBoss`, docs/01 §4.5): it waits once every round is done; the area clears only
  once it is beaten, so it really blocks the road, as in the games; a fled one comes back; it can never be missed; won,
  then the catch throw. Shiny at the wild odds, as any boss.
- A flag on the boss, `BossDef.roadblock`, gives it its own intro line instead of the legendary's: "A sleeping Pokémon
  blocks the way!" (Snorlax), "The strange tree moved!" (Sudowoodo), "Something invisible is in the way!" (Kecleon).
- It leaves that area's wild pool (the boss replaces it); its other wild spots stay.
- **Already cleared**: an area keeps `cleared`, so the road after it stays open; its rounds are done, so the new boss
  waits on the area screen as a CHALLENGE (`dueBoss`), there to take or leave.

| Region | Area | Boss | Lv | Wild there today | Still wild in |
|---|---|---|---|---|---|
| Kanto | Routes 12–15 | Snorlax | 30 | weight 2 | Cycling Road (Route 16's), Cerulean Cave |
| Johto | Routes 35–37 | Sudowoodo | 20 | weight 3 | Mt. Silver |
| Hoenn | Fortree City & Routes 120–121 | Kecleon | 30 | weight 12 | Routes 118 & 119, Mt. Pyre, the Battle Frontier |
| Kalos | Route 7 & the Connecting Cave | Snorlax | 15 | weight 2 | the Friend Safari |

Catch values: Snorlax 7 (a Poké Ball needs a 6), Sudowoodo 5, Kecleon 2.

### Pieces

- Engine: `BossDef.roadblock`, the intro reads it (`fx/timelines/legend.ts` keeps its darkening and cry).
- A migration: the four bosses and the four pool rows; Admin → Areas → the boss editor shows the flag.
- Strings: three intro lines, ten languages. No switch, no rules: content on the bosses' existing rules.
- Tests: the boss due once the rounds are done, in a cleared area too; the area clears only once it's beaten.

## 3. Pokémon posing as items

### Rules

- A loot row can be a **disguise**: `LootEntry.disguise = { dex, minLevel, maxLevel }`, its `itemKey` the Poké Ball it
  looks like. It is dealt and shown as an item find (the round gauge's item icon, the find's ball); picked up, it
  springs open: "It's a Voltorb!".
- Then a wild battle, as any wild one there: no FLEE, its XP, the catch throw after, the wild shiny odds; lost, a
  normal wipe. Its copies in the loot deck are its weight, as any find's; never once-only.
- **Switch**: Off / On for admin / On for everyone (`game_config.disguises.access`), checked by the server
  (`disguises_open()`). Off: a disguise card is passed over and the loot deck draws again, as with a card the area
  can't produce.
- **Rules**: explained where it happens (docs/15 §20): the reveal says it all, so no rules card and no INFO.

| Region | Area | Disguise | Levels |
|---|---|---|---|
| Kanto | Power Plant | Voltorb, Electrode | the area's wild levels for them |
| Johto | Mahogany Town & the Team Rocket HQ | Voltorb, Electrode | the same |
| Hoenn | Mauville City (New Mauville) | Voltorb | the same |
| Hoenn | The Magma & Aqua Hideouts | Electrode | the area's level range (it isn't wild there) |
| Kalos | Route 13 & the Kalos Power Plant | Voltorb | the area's wild levels |
| Unova | Driftveil City & Route 6; Mistralton City & Route 7 | Foongus | the same |
| Unova | Icirrus City & the Moor of Icirrus; The Giant Chasm | Amoonguss | the same |

### Pieces

- Engine (`engine/encounters.ts`): the item draw returns the disguise as a wild encounter with `disguisedAs`.
- Store: the find's phase hands over to a battle.
- FX: the ball wobbles, pops and the Pokémon bursts out (the catch timeline's break-free, run backwards).
- DB: `area_loot_pool.disguise` (a migration), Admin → Areas → Loot edits it.
- Strings, the kitchen sink (the find, the reveal), tests (the draw, Off passes it over, the battle and the catch).

## 4. Safari areas

### 4.1 Where

| Region | Today | After |
|---|---|---|
| Kanto | "Safari Zone", main road #15: the Safari's 23 Pokémon **and** Fuchsia's Gym (Koga) | **split**: **Fuchsia City** keeps the main road's place, the area's id, progress, Koga, the Gym's trainers and the loot; a new secret **Safari Zone** opens when Fuchsia City is reached |
| Hoenn | "Safari Zone", main road, between Fortree and Mt. Pyre | **secret**, opens when Fortree City & Routes 120–121 is reached (its gate is on Route 121) |
| Sinnoh | "The Great Marsh", main road, after Pastoria | **secret**, opens when Route 212 & Pastoria City is reached; its two Pokémon Rangers move to Pastoria's pool |
| Kalos | "The Friend Safari", already secret (opens with the League reached) | **stays where it is**; its three trainers move to Kiloude City & the Battle Maison |

Johto, Unova, Alola, Galar and Paldea have no Safari among their areas (Galar's Wild Area isn't one).

**Why Fuchsia City keeps the id**: old saves keep what they did there (Koga beaten, the area cleared, Silph Co. open);
the once-only finds already found stay found (`AreaProgress.uniqueFound` is per area), so the Leaf Stone stays a Fuchsia
City find; and the raid event that opens with "the Safari Zone, Kanto" cleared (`events.raid.unlockAreaId`) still
opens at the same point.

**Fuchsia City**: trainers only, like Silph Co.: the Gym's Jugglers and Tamers and Fisherman Elliot (already in the
area's pool but never dealt: its trainer weight is 0 today), a Pokémon Center, its loot; 1 round, then Koga. **The new
Safari Zone**: the old area's 23 wild Pokémon, a loot table of its own (new, so nothing found before is found twice).

### 4.2 The rules

- A Safari area deals only **Safari encounters and item finds**: no battles, no trainers, **no Pokémon Centers** (nothing
  there hurts, so the round's opening Center and the one on the way in are left out too). No gym, no boss.
- A Safari encounter is Trick or Treat's (docs/29) under its own names, pictures and numbers: **Bait** is the Treat (it
  fills the gauge by 10–30; into the flee zone, the Pokémon runs) and the **Safari Ball** is the Trick Ball (a d6
  against the gauge's section; a miss makes it restless, +35). Both free and endless; FLEE at any time. The same tiers,
  sections, flee zones and best-play maths, each with its own admin numbers, starting from Trick's.
- **Who comes**: the area's wild pool by weight, with the new-Pokémon pity as on a wild card (docs/01 §1.1), shiny at
  the wild odds (a Shiny Parade counts); never a roamer. **The tier is its catch value**: 1–3 common, 4–5 rare, 6+ very
  rare. Chansey is very rare; Tauros, Scyther, Pinsir, Kangaskhan, Dratini, Exeggcute, Girafarig and Stantler are rare.
  The admin can set any Pokémon's tier.
- **A catch** is a wild catch there (the team if it has room, else the Box; a stronger one replaces the weakest plain
  copy; a shiny is its own Pokémon), as Trick's.
- **No XP and no ₽** (only item finds' ₽). It never clears (a secret area: `roundsToClear` null); rounds count for its
  gauge and the pity.
- **Switch**: Off / On for admin / On for everyone (`game_config.safari.access`), checked by the server (`safari_open()`,
  as `trick_or_treat_open()`). Off: the Safari areas are still secret areas off the main road, and their cards are
  fought as wild Pokémon, as today, so no species is locked behind the switch.
- **Rules**: a pop-up the first time a Safari encounter begins, and INFO at the foot of its screen, as Trick's
  (docs/15 §28).

### 4.3 The main road without them

- The main road loses about 10 encounters in Hoenn (2 rounds of 5 cards) and 7 in Sinnoh (1 round); in Kanto the
  Safari's 16 become Fuchsia City's trainer round. The campaign simulator (`tests/engine/campaign.test.ts`) measures the
  next gym in each region before and after; if a win rate drops, the area before it gets a round more. Extreme mode's
  road (docs/48) is shorter by the same areas.
- **Old saves**: an area that leaves the road keeps its progress, and a player standing in it stays there (it is open to
  anyone past its city). The area after it now opens behind the one before it (Mt. Pyre behind Fortree, Route 205
  behind Pastoria), so a player who stopped in the Safari can walk on.

### 4.4 Pieces

- Engine: `engine/trickOrTreat.ts` becomes one engine with two themes (`trick`, `safari`): the gauge, the steps and the
  best play once, each theme's config apart; Trick's behaviour and tests stay as they are. A `safari` card in
  `ENCOUNTER_KINDS`; an area with `mode: { kind: 'safari' }` deals its wild cards as Safari encounters while the switch
  is on, and no Centers.
- Content (one migration): Kanto's area split, the three others made secret (unlock, `roundsToClear`, Centers, mode),
  the trainers moved; area names in the ten languages; the new area's banner (`fx/areaArtMap.ts`). `supabase/seed.sql`
  carries it.
- Screens: Trick's screen (`TrickView`) on the grass stage with the Safari's pictures (a Safari Ball and Bait, made from
  the item atlas as the Trick Ball was), its preview card and the round gauge's icon; every state on `/kitchen-sink`.
- Admin: Events → Safari (Trick's tab, themed); Areas → the mode.
- Tests: the split's old save, the main road's unlocks, the deal (no Centers, no trainers), Off fights them, the tiers,
  the best-play targets, the simulator.

## 5. Set moments: rivals and gifts

### 5.1 The engine

- A set moment is **one card at a set point**: `{ id, areaId, round, after, card }` (`round` = rounds done there,
  `after` = cards turned over in that round). When due it comes **on top of the deck and uses no card**, as a forced
  Pokémon Center does, so the deck, the round gauge, the Center rules and Extreme mode don't change. Route 1's set
  opening (docs/46) stays as it is.
- Once per save (`save.moments`). A **rival** comes only while its area isn't cleared (a Lv.9 rival is nothing to a
  Lv.50 team). A **gift** also comes on a later visit to a cleared area, so a save already past it gets it the next time
  it's there. A rival lost to is a normal wipe; the moment waits.
- **Two switches**, Rivals and Gift Pokémon (Off / On for admin / On for everyone, server-checked). The developer's
  gifts (docs/15 §23) are another feature and keep their own.
- **Rules**: explained where they happen (docs/15 §20): no rules card, no INFO.

### 5.2 Rivals

- The rival's sprite slides in with one line, then the usual trainer preview; FIGHT only.
- One team per starter (`Trainer.rivalOf`, as the Champion's today) where the original's rival had one; Hoenn's rival
  is May or Brendan, from the player's look (docs/31).
- While Rivals is on, the rivals now in trainer pools leave them (met only as moments). Off, the pools are as today.

| Region | Rival | Today (a random pool card) | Set moments |
|---|---|---|---|
| Kanto | Blue | Pokémon Tower, Silph Co. | + Routes 22 & 2, Route 4 & Nugget Bridge, Routes 5 & 6 (the S.S. Anne), Route 21 (the last before Victory Road) |
| Johto | Silver | none | Routes 30 & 31, Azalea Town, Ecruteak City & the Burned Tower, Mahogany Town & the Team Rocket HQ, Victory Road |
| Hoenn | May / Brendan | none | Routes 102 & 103, Rustboro City, Slateport City & Route 110, Routes 118 & 119, Lilycove City, Route 124 & Shoal Cave |
| Hoenn | Wally | none | Mauville City, Victory Road |
| Sinnoh | Barry | Route 202 & Jubilife, Hearthome, Canalave & Iron Island, Sunyshore | + Route 201 & Lake Verity |
| Unova | Cheren, Bianca | 5 and 4 areas | the same areas |
| Kalos | Shauna, Tierno, Trevor | 7 areas | the same, + Serena / Calem (to place in the content pass) |
| Alola | Hau, Gladion | 6 and 3 areas | the same |
| Galar | Hop, Bede, Marnie | 5, 3 and 2 areas | the same |
| Paldea | Nemona | Mesagoza | + more meetings (to place in the content pass) |

The teams come from each original's rival battles (the top three at each meeting) in a table for validation before
they're built: about 45 meetings, up to three versions each, written by a script as the content patches are.

### 5.3 Gifts

- **The intro** (Visual Lab first): the giver's sprite walks onto the stage and says one line; then a Poké Ball is
  tossed and opens as the catch's does, or an Egg is handed over; the gift opening's fanfare and shiny stars
  (`fx/timelines/gift.ts`). "You received Eevee!", and it goes where a catch goes (the team if it has room, else
  Add to team? / the Box). Givers' sprites from the trainer atlas, the closest class when a character has none.
- **Eggs** go to the Box hatching, on the fossils' timer (`revivesAt`, docs/01 §4.6), at the Day Care's hatch level
  (`hatchLevel`); the Day Care's own Egg isn't touched.
- **The one choice**, Hitmonlee or Hitmonchan: two Poké Balls with their sprites, types and dice; the other stays wild
  at Victory Road and in Cerulean Cave. The fossils stay finds (Mt. Moon's both, the desert's both): the one not taken
  can't be met anywhere else.
- Every gift species is **already met in its region**, so no regional Pokédex changes and nothing becomes missable; its
  rare wild spots stay. Shiny at the wild odds; the Odd Egg at its own (admin, about 1 in 7 as in Crystal).

| Region | Area | Gift | Giver |
|---|---|---|---|
| Kanto | Mt. Moon | Magikarp, for ₽500 | the salesman in its Pokémon Center |
| Kanto | Routes 7 & 8 | Eevee | Celadon Mansion |
| Kanto | Silph Co. | Lapras · Hitmonlee or Hitmonchan | a Silph employee · the Karate Master |
| Johto | Violet City & Sprout Tower | Togepi Egg | Prof. Elm's aide |
| Johto | Goldenrod City | Eevee | Bill |
| Johto | Route 34 & the Day Care | the Odd Egg (a baby, higher shiny odds) | the Day-Care Man |
| Johto | Cianwood City | Shuckle | Kirk |
| Johto | Blackthorn City & the Dragon's Den | Dratini | the Elder |
| Hoenn | Lavaridge Town | Wynaut Egg | an old lady |
| Hoenn | Routes 118 & 119 | Castform | the Weather Institute |
| Hoenn | Mossdeep City & the Space Center | Beldum | Steven (his letter) |
| Sinnoh | Hearthome City | Happiny Egg | a Hiker |
| Sinnoh | Canalave City & Iron Island | Riolu Egg | Riley |
| Unova | Striaton City & the Dreamyard | the monkey for the starter: Snivy → Panpour, Tepig → Pansage, Oshawott → Pansear | the Dreamyard |
| Kalos | Route 12, Azure Bay & Coumarine City | Lapras | a man on Route 12 |
| Alola | Heahea City & Routes 4–6 | Eevee Egg | Paniola Ranch's nursery |
| Alola | Aether Paradise | Type: Null | Gladion |
| Galar | Route 5 & Hulbury | Toxel Egg | the Route 5 nursery |

Left out (§8): Platinum's Togepi Egg, Eevee and Porygon (not met in Sinnoh), Kalos's Kanto starter and Korrina's Lucario
(not met in Kalos); Paldea has no gift to borrow.

## 6. Switches and rules

| Part | Switch | Rules |
|---|---|---|
| Regigigas | none (content) | none |
| Roadblocks | none (content) | none |
| Pokémon posing as items | `disguises` | explained where it happens |
| Safari | `safari` | a pop-up at the first Safari encounter, INFO on its screen |
| Rivals | `rivals` | explained where it happens |
| Gift Pokémon | `giftMoments` | explained where it happens |

Every switch is Off by default and checked by the server too; every line is in `src/i18n/strings.csv` in the ten
languages (`pnpm i18n:fonts` after the CJK columns); every new component is on `/kitchen-sink` in every state.

## 7. Order of work

1. **Regigigas**: the condition, the admin, one migration.
2. **Roadblocks**: the flag, the intros, one migration.
3. **Pokémon posing as items**: the loot row, the reveal, the switch, one migration.
4. **Safari**: the split and secret areas (one migration), the Trick engine with two themes, the screens, the switch.
5. **Set moments**: the engine and both switches, then the rivals' content (teams validated first), then the gifts
   and their intro (Visual Lab first).

Each part: `pnpm lint && pnpm build && pnpm test` green, the e2e specs it touches, pushed to its branch with a pull
request into the version branch and its Netlify preview; the migrations' links in the reply and in the part's
"Setting it up".

## 8. Open questions

1. **Safari entry**: free, or a price per visit like the games' ₽500? Default: free.
2. **Fuchsia City's deck**: trainers only, like Silph Co.? Default: yes.
3. **Gifts of species a region doesn't have** (Platinum's Togepi, Eevee and Porygon in Sinnoh; Kalos's Kanto starter
   and Lucario): leave them out, or add them (the region's Pokédex grows)? Default: leave them out.
4. **A gift Egg's hatch**: after a few hours (admin), at the Day Care's hatch level? Default: yes, 6 hours.
