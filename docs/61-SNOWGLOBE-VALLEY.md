# Snowglobe Valley: the winter small world

The user's brief of 2026-11-01: a small world for winter, built like Haunted Hollow (docs/26) around the Ice type, with
a special gameplay in each secret area. This file is the record; the visual game design for review is the artifact
https://claude.ai/artifact/KCHnkbKDiL5VKTrcJz8JcN.

Branch `claude/eloquent-galileo-b5uahz` (from `version/2_9`), a PR into `version/2_9`.

**Status:** the content is built (§2–§3, migration 0120, not to run before the user's review). Built, each behind its
own switch (Off): the Gift card and Evergreen Hill's present (§4.0, §4.2, migration 0121), Moonlit Glade's Tracks in
the Snow (§4.1, migration 0122), Crown Shrine's whiteout (§4.3, migration 0123), Spear Pillar's race of time and space
(§4.4, migration 0124) and the Hall of Origin's Stairway of Plates (§4.5, no migration of its own). The user's reviews
(2026-11-01, notes left on the artifact's feedback boxes) are folded in (§6). Until each gameplay is switched on, its
area plays as a plain secret area (a short deck, then its boss or raid).

## 1. The brief, and the calls made on it

| The user asked | Built as |
|---|---|
| Sat 19 Dec → Sun 3 Jan 2027, 15 days | **Sat 19 Dec 12:00 UTC → Sun 3 Jan 12:00 UTC** (13:00 in Paris), Haunted Hollow's hour: exactly 15 × 24 h. Counted inclusively the dates are 16 days; the review asks. |
| Inspired by Haunted Hollow, Ice instead of Ghost | Its rules (3 badges to enter, the world's ₽ and tracks, Home's secret rows, its Pokémon going home at the end) unchanged; **Ice ×1.2** both sides; **XP ×1.5** |
| 3 Ice starters with Alolan Sandshrew and Alolan Vulpix | Changed by the reviews: **Mareep, Lillipup, Pikipek**, Lv.5 (§6). Alolan Sandshrew and Vulpix stay in the wild |
| About 125 Pokémon | **125** (`regionSpecies`), all but the three legends catchable before Spear Pillar and the Hall of Origin open |
| About 10 areas + the Frost League | **10 areas + the Frost League** (four Elite Four and Champion Nicholas, no badges) |
| 5 secret areas | Moonlit Glade, Evergreen Hill, Crown Shrine, Spear Pillar, Hall of Origin (§2.3) |
| Shiny Stantler, the first secret boss | Moonlit Glade, **20 caught** (Haunted Hollow's first secret's count; the brief named none) |
| Shiny Delibird from 24 Dec | Evergreen Hill, no count, opens **24 Dec 12:00 UTC** (the world's `opens`) |
| Shiny Abomasnow at 50 caught | Crown Shrine, **50 caught** |
| Shiny Dialga or Palkia, the player's choice, after the league and from 25 Dec | Spear Pillar, **Frost League cleared** + **25 Dec 12:00 UTC**; the race's last gate picks (§4.4) |
| Shiny Arceus at 90 caught, from 1 Jan | Hall of Origin, **90 caught** + **1 Jan 12:00 UTC** |
| Each area its own gameplay | Read as **each secret area** (§4); the review asks whether the main areas get one too |

The date gates use the small worlds' per-area opening dates (`SmallWorld.opens`, docs/21): no new unlock condition. A
secret area opens when its conditions hold **and** its date has come, on the server's clock; Home says "Opens Thu 24 Dec,
13:00" (in Paris) in the player's own time until then.

## 2. The content

`scripts/content-snowglobe-valley.ts` (`pnpm snowglobe-valley`), built with `scripts/world-content.ts`, the builder it
shares with Haunted Hollow (its output unchanged, byte for byte). Names in the ten languages (`area.*`,
`region.world-snowglobe-valley`); pictures are existing ones only (`src/fx/areaArtMap.ts`).

### 2.1 Its rules

- Every area holds an Ice type (wild or on a trainer).
- Every item evolution uses an item the Mart sells: Ice Stone, Water Stone, Dawn Stone, Razor Claw, Peat Block.
- No legendary or mythical but the prizes; no fossil; no starter of another region.
- A level-evolving species is wild only below its evolution level, its evolution only above it.
- Every Pokémon of Moonlit Glade, Evergreen Hill and Crown Shrine is also found on the road: a secret area closes once
  its boss is caught.
- No Houndour line (the user: it led Haunted Hollow's picks).
- No Ghost type a player must get past (a league or a Crown Shrine wave): a team of Normal types can't touch one, and
  the simulator's all-Normal Lillipup runs stalled on Elite Four Holly's Froslass until it became a Walrein.
- Every deck: 10 cards in a main area, 6 in a secret one, each with 1 item and 1 Pokémon Center.

### 2.2 The road

| # | Area | Picture | Lv. | Deck (wild · trainers) | Foes' upgrades | Its Ice | Found once |
|---|---|---|---|---|---|---|---|
| 1 | Snowy Trail | snow | 3–7 | 7 · 1 | 1 | Snom, Swinub, Cubchoo | — |
| 2 | Pinewood Forest | forest | 7–12 | 6 · 2 | 1 | Snover, Cubchoo, Alolan Vulpix | — |
| 3 | Frozen Pond | lake | 11–16 | 6 · 2 | 2 | Seel, Shellder, Snorunt, Spheal | Water Stone |
| 4 | Holly Village | snowtown | 15–21 | 5 · 3 | 2 | Vanillite | Ice Stone |
| 5 | Toy Workshop | a761 | 20–26 | 5 · 3 | 2 | Galarian Darumaka | — |
| 6 | Icicle Cave | icecave | 25–32 | 5 · 3 | 3 | Bergmite, Sneasel, Cryogonal, Swinub, Snorunt, Alolan Sandshrew (rare), Frigibax (very rare) | Dawn Stone, Razor Claw |
| 7 | Frostbite Harbour | harbour | 31–38 | 4 · 4 | 4 | Cetoddle, Eiscue, Sealeo, Dewgong, Lapras (rare) | — |
| 8 | Ember Springs | volcano | 37–44 | 4 · 4 | 4 | Sealeo (bathing) | Peat Block |
| 9 | Blizzard Pass | mountain | 42–50 | 4 · 4 | 4 | Glalie, Beartic, Vanillish, Crabominable, Mamoswine, Froslass | — |
| 10 | Aurora Summit | a54 | 48–56 | 4 · 4 | 4 | Weavile, Walrein, Avalugg, Frosmoth, Jynx, Vanilluxe, Alolan Sandslash and Ninetales (rare) | — |
| 11 | Frost League | league | 52–60 | five fights | 7 | Elite Four Fjord (Water), Gunnar (Steel), Drasna (Dragon), Holly (Ice: Walrein, Glalie, Alolan Ninetales; no Ghost), Champion Nicholas (his ace Abomasnow, Lv.60, Mega Evolves with the Abomasite he holds) | — |

The script holds every pool and trainer; the artifact shows them with their sprites.

### 2.3 The secret areas (as content)

| | Area | Picture | Lv. | Opens | Prize |
|---|---|---|---|---|---|
| S1 | Moonlit Glade | a126 | 24–30 | 20 caught | shiny Stantler Lv.30 (boss) |
| S2 | Evergreen Hill | a858 | 34–40 | 24 Dec 12:00 UTC | shiny Delibird Lv.40 (boss) |
| S3 | Crown Shrine | a855 | 48–55 | 50 caught | shiny Abomasnow Lv.50 (boss) |
| S4 | Spear Pillar | lair-summit | 56–64 | Frost League cleared, 25 Dec 12:00 UTC | shiny Dialga and shiny Palkia Lv.70 (raids) |
| S5 | Hall of Origin | a130 | 52–70 | 90 caught, 1 Jan 12:00 UTC | shiny Arceus Lv.90 (raid) |

Spear Pillar's pool holds the race's types by fork (§4.4), all met elsewhere. The Hall of Origin's pool too.

### 2.4 The Mart

Poké Ball ₽20 · Great Ball ₽50 · Ultra Ball ₽100 · **Master Ball ₽999, 1 per player** · Potion ₽15 · Super Potion ₽35 ·
Hyper Potion ₽80 · Revive ₽300 · Ice Stone, Water Stone, Dawn Stone, Razor Claw, Peat Block ₽200 each. No Link Cable
(no trade evolution here).

## 3. Balance

`pnpm snowglobe-balance [encounters] [seeds]` (`scripts/snowglobe-balance.ts`): the headless campaign through the
world's chain, each starter, XP ×1.5, Ice ×1.2 and the world's own tracks. 3 starters × 5 seeds, 400 encounters, with
the starters of the third review (Mareep, Lillipup, Pikipek):

| Area | Lv. | Arriving Lv. | Wipes a run | Cleared |
|---|---|---:|---:|---:|
| Snowy Trail | 3–7 | 5.0 | 2.7 | 15/15 |
| Pinewood Forest | 7–12 | 9.4 | 2.9 | 15/15 |
| Frozen Pond | 11–16 | 16.1 | 0.1 | 15/15 |
| Holly Village | 15–21 | 20.4 | 0.7 | 15/15 |
| Toy Workshop | 20–26 | 26.1 | 2.9 | 15/15 |
| Icicle Cave | 25–32 | 35.5 | 1.7 | 15/15 |
| Frostbite Harbour | 31–38 | 42.7 | 2.0 | 15/15 |
| Ember Springs | 37–44 | 50.8 | 1.9 | 15/15 |
| Blizzard Pass | 42–50 | 58.6 | 3.5 | 15/15 |
| Aurora Summit | 48–56 | 68.5 | 7.8 | 15/15 |
| Frost League | 52–60 | 83.3 | 4.8 | 15/15 |

How it got here: the first pass (the Alolan starters) measured three walls, softened (Toy Workshop's foes' upgrades
3 → 2, Ember Springs' 5 → 4, Aurora Summit 3 wild · 5 trainers at 5 → 4 · 4 at 4). The review's starters are weaker
early: Pinewood Forest's trainers and wild Pokémon went a level lower, Snowy Trail's Starly, Hoothoot and Snom became
rarer (they beat a Grass or lone starter) and its trainers a level lower. The first two areas stay the roughest stretch
(about 3 wipes a run each, against 0.4 and 2 in Haunted Hollow): one Lv.5 Pokémon alone against the wild. Starters
measured and left out: Bounsweet (Grass: 4–9 wipes on the first trail, 2 of 5 runs missed the league), Abra (Kadabra
evolves by trade here), Shinx (fine, but a second Electric), Venipede, Starly and Pidgey (runs missed the league).
Haunted Hollow measured the same way today arrives at its league at Lv.76 with 8 wipes a run there.

## 4. The secret areas' gameplays (designed, for review)

Each will be built as Haunted Hollow's were (docs/28, docs/30): the area's `mode`, a pure engine module, its screen
step, its admin box, **its own Off / On for admin / On for everyone switch, Off by default and checked by the server**,
its `RulesCard` and INFO (docs/15 §20), kitchen-sink states, tests and an e2e spec. Off: the area plays as a plain
secret area. Every number below is the admin's.

### 4.0 The Gift card (every main area; the user's design) — built

**Built** (2026-11-01, Trick or Treat's architecture, docs/29). It ships **Off** (Admin → Events → Gift card); docs/15
§45 is its UI.

- In the ten main areas **the item card becomes a Gift**. Open it for its level's reward, or tap it to make it bigger:
  the next tap breaks it at **20 / 40 / 60 / 80%** from levels 1–4; level 5 is the top. **Owning a Delibird** (team or
  Box) lowers each by 20% (level 1 is safe) and adds a **level 6**.
- **A broken gift is a wild encounter** of the area's pool, fought and caught as usual.
- Rewards (balanced; scaled to the area): 1. **2 of the area's balls** (the best ball its loot pool holds, a Poké Ball
  when none) · 2. **3 of the ball above it** or **2 Super Potions** · 3. **2 Hyper Potions** or **₽ (the area's lowest
  level × 15**, the user's call) · 4. **a Revive** or **an evolution item the world's Mart sells** · 5. **3 Rare Candies** (the user's
  call, up from the proposed 2) · 6. **3 Rare Candies and a Revive**. Where a level has two, one is drawn as the gift
  appears and the player sees it before choosing (OPEN shows what it gives now, a line shows the next level's). A
  player who always taps reaches level 5 3.8% of the time (19.2% with a Delibird), level 6 3.8%. Every number is the
  admin's.
- Its own switch (Off / On for admin / On for everyone), Off by default and checked by the server; Off, the item card
  stays.

**How a deck says it deals gifts**, for any area: its encounter weight **`gift`** (Admin → Areas → Encounter deck:
Gift card). While the switch is on for the player and the area has wild Pokémon, its `gift` copies are dealt **in place
of its item cards** (`deckCounts`: item 0); off, the item cards as before, and a gift left in a deck dealt while on is
set aside like any card the area can't produce. Each main area of this world has `gift: 1`, so its deck stays 10 cards
either way.

**What was built** (files):

- **Engine** `src/engine/giftCard.ts`: the switch (`giftOn`, `giftDealable`), the odds (`giftBreakChance`, `giftTop`,
  `giftReachOdds`), Delibird (`hasGiftHelper`: dex 225 in the save's team or Box), the rewards as they land in the area
  (`giftBalls`, `giftEvolutionItems`, `giftPart`, `drawGiftRewards`), one gift (`startGift`, `growGift`, `openGift`,
  `applyGiftOpen`, which puts the reward in the bag as a find would), a boss's present (`startBossPresent`,
  `bossInPresent`), the rules (`giftCardRulesDue`). `src/engine/encounters.ts`: the encounter `{ kind: 'gift' }`,
  `rollGift`, `rollGiftWild` (a broken gift's wild Pokémon: the area's own pool, its levels, shiny odds and talents, never
  a roaming legendary), the `gift` deck card in place of the item cards, the random mode's weights. Types and defaults:
  `GiftCardConfig`, `GiftRewardPart`, `GiftCardSave`, `ENCOUNTER_KINDS` + `gift`, `encounterWeights.gift`,
  `BossDef.present`, `DEFAULT_CONFIG.giftCard`. Extreme's race turns it off; the campaign simulator walks past it.
- **Store** (`src/store/run.ts`): the phase `gift`, `run.gift` (`GiftRun`: the present, the last tap, what OPEN gave,
  what came out); `growPresent`, `openPresent`, `fightFromPresent`, `leavePresent`; a gift card goes straight to its
  screen, a broken one into the wild battle, a resumed reload comes back to it (`store/resume.ts`).
  `src/store/giftCard.ts`: the server's check, as Trick or Treat's.
- **Screens**: `src/screens/area/GiftView.tsx` (laid out as the battle, `GiftScreen`, `GiftRecap`), the pieces in
  `src/components/GiftCard.tsx` (the stage, plate, level gauge, reward lines, Delibird's chip, preview card, rules),
  the round gauge's gift tile and the area's round mix (only while dealt), the encounter preview while the server is
  asked. Animations `src/fx/timelines/present.ts` (it lands, grows, breaks or bursts, opens); sounds `present.*` in
  `src/audio/sfx.ts`; strings `ui.giftCard.*`, `ui.card.gift`, `ui.home.kind.gift`, `ui.enc.titleGift` in the ten
  languages. Every state on `/kitchen-sink` (`GiftCardBits`), every take on `/kitchen-sink/fx`.
- **Admin**: Events → Gift card (`src/admin/sections/events/GiftCardTab.tsx`; `GIFT_SCHEMA` in `src/admin/schemas.ts`),
  Areas → Encounter deck's Gift card and a boss's "Out of a present", Dev tools' forced next card.
- **Server**: migration **0121** (`supabase/migrations/0121_gift_card.sql`): the `giftCard` row (Off) and
  `gift_card_open()`, inlined in `supabase/seed.sql`.
- **Content**: `scripts/content-snowglobe-valley.ts` gives the ten main areas `gift: 1` (0120 regenerated).
- **Tests**: `tests/engine/gift-card.test.ts` (odds, a Monte Carlo of the engine's taps, Delibird, levels, rewards, a
  broken gift's wild Pokémon, the card only while on, a boss's present, the rules), `tests/gift-card-sql.test.ts`
  (PGlite: the row, the server's switch, a second run, seed.sql), `tests/content/snowglobe-valley.test.ts` (the decks
  on and off), `e2e/gift-card.spec.ts`.

### 4.1 Moonlit Glade: Tracks in the Snow (hide and seek, three rounds)

- **Three rounds** (the user's second review): rounds 1 and 2 on a **3 × 3** glade, each ending on a **normal Stantler**
  (a wild encounter, catchable); round 3 on a **4 × 4** glade, ending on the **shiny Stantler** (its intro, then the boss
  fight, Lv.30). A cleared round is kept through a wipe or a trip Home.
- A bush holds a wild Pokémon (a fight, catchable), a find, a warm cabin (a Pokémon Center) or nothing; once opened it
  shows **hoofprints pointing at Stantler** (8 directions).
- **The first bush opened is never Stantler**: it is placed only after that first tap. On the 4 × 4 it is never next to
  that first bush either (not one of its 8 neighbours), so the last round always takes a little hunting.
- **Taps per snowfall**: 5 on a 3 × 3, 7 on the 4 × 4 (the admin's numbers). Out of taps: snow falls, the prints vanish,
  Stantler moves, the bushes refill, and the first-bush rule holds again.
- Caught: the outro, and the glade closes. A wipe: back at its edge, healed, XP and items kept.
- The artifact's prototype plays all three rounds, with the taps (both sizes) and the prints (every bush, or only the
  empty ones) to tune.

**Built** (branch `claude/eloquent-galileo-b5uahz`), behind its switch `tracks`, **Off**. The rules as above, every
number the admin's (Admin → Areas → Moonlit Glade → **Special mode: Tracks in the Snow**: each round's bushes a side,
taps a snowfall, wild / finds / cabins, "not next to the first", and "hoofprints on empty bushes only"). How it plays:

- **The way in** as the nightmare's (docs/30 §1): Home's CONTINUE says **ENTER THE GLADE**; the intro (the moon rises,
  a reindeer's silhouette leaps across it into the bushes, "Tap to continue ▼"), then the pop-up with four short rules,
  TEAM (healed as at a Center, the team can change), NOT NOW and **BEGIN THE SEARCH** (the server asked first for a
  signed-in player: `tracks_open()`). No travel lock: a trip Home keeps the glade as it was.
- **The bushes**: Stantler is hidden on the glade's first tap, anywhere but that bush (and on the 4 × 4 not one of its 8
  neighbours; on a glade too small for that, anywhere but the first). Then the wild Pokémon, finds and cabins are
  shuffled over the other bushes, the first one included. **The prints** point by row and column: straight when
  Stantler shares the bush's row or column, else the diagonal of its quarter, so they never send the player past it. A
  wild bush is a fight of the area's pool (never Stantler's species: Stantler is only ever the one found), a find its
  loot, a cabin a Pokémon Center's heal.
- **Stantler found**: rounds 1 and 2, a plain wild Stantler at its pool levels (24–28), never shiny; its K.O. clears the
  round (the result card says so), caught or not. Round 3, the area's boss (shiny Stantler Lv.30) with **its own
  entrance** on the battle stage (it rears up under the moon, its coat flashing gold). Fled, a draw, a missed throw: it
  **bolts** (a fresh glade of the same round). Caught: the outro (the bushes settle, fresh snow covers the prints), the
  glade **sealed** (`isAreaSealed`), then **closed for good** once the outro has played (`isAreaClosed`).
- **A wipe**: back at the glade's edge (its way in), the team healed, XP, ₽, items and the cleared rounds kept; the
  glade being searched is gone, a fresh one next time.
- Off: the area plays as a plain secret area (its short deck, then its boss), as before. A glade in a save is kept.

Files: engine `src/engine/tracks.ts`, `src/engine/tracksMode.ts` (hooks in `run.ts`: `isAreaSealed`, `isAreaClosed`,
`applyWipe`, `arriveAtTracks`, `teamSwapsOpen`, the `tracks_round` event); store `src/store/run.ts` (`beginTracks`,
`tapBush`, `meetBush`, `finishTracksOutro`; the found Stantler's K.O. and catch in `settleBattle` / `settleThrow`),
`src/store/tracks.ts` (the server's check); UI `src/components/Tracks.tsx`, `src/screens/area/TracksRun.tsx`,
`src/styles/tracks.css` (docs/15 §46); scenes `src/fx/timelines/tracks.ts`, `src/fx/timelines/cinema/stantler.ts`,
sounds `tracks.*` in `src/audio/sfx.ts`; admin `src/admin/sections/TracksModeBox.tsx`; kitchen sink
`src/screens/kitchen/TracksBits.tsx`; migration `supabase/migrations/0122_tracks_in_the_snow.sql`. Tests
`tests/engine/tracks-in-the-snow.test.ts`, `tests/tracks-in-the-snow-sql.test.ts`, `e2e/tracks-in-the-snow.spec.ts`.

### 4.2 Evergreen Hill: Christmas Eve on the hill — built

- (The Lost Presents were dropped by the review.) A simple deck: 2 wild, 2 trainers, a Pokémon Center and **3 Gift
  cards** (§4.0, Delibird's help included), no item card: its content says `{ wild: 2, trainer: 2, gift: 3 }` (and the
  item card and Center every deck gets), so while the Gift card is on its gifts take the item card's place (8 cards),
  and off it plays as a plain secret area (6 cards, its item card).
- **Delibird's intro** reuses the Gift: after the deck, a different present (silver paper, gold bow, glowing); only
  MAKE IT BIGGER is offered; it grows, shakes and bursts on the last tap: shiny Delibird, Lv.40. Players don't know it
  will break.

**Built** (2026-11-01) on the Gift card's own switch: the boss is marked **`present: true`** (`BossDef.present`, Admin →
Areas → the boss's "Out of a present"; usable by any area's boss). Its challenge (FACE IT, where the boss normally
comes) opens the present screen (`startBossPresent`: a silver present at level 1, no OPEN, no odds, no INFO, "What could
be inside?"); each MAKE IT BIGGER grows it a level, the 5th tap (`giftCard.bossTaps`) bursts it: it strains, rips and
bursts in silver and gold, shiny Delibird pops out with its cry, then **FIGHT!** is the area's `legendaryBoss` fight as
usual (Lv.40, caught as any boss). A returning Delibird (it fled the catch) is a plain card of the deck. Off, the boss
comes as it always did. The present plays again on each new challenge (after a wipe). Files: as §4.0's
(`src/fx/timelines/present.ts`'s `burst`, `GiftView`'s boss state, `challenge()` and `beginBossPresent` in
`src/store/run.ts`), and `tests/content/snowglobe-valley.test.ts` checks the deck and the boss.

### 4.3 Crown Shrine: Whiteout (weather survival)

**Built** (its switch `whiteout`, Off). Engine `src/engine/whiteout.ts` and `whiteoutMode.ts` (the area's settings,
`DEFAULT_WHITEOUT`, the blizzard's wear), the wear in the battle engine (`src/engine/battle.ts`: `weather`, `noBag`, the
`weather` log entry), its hooks in `src/engine/run.ts` (`teamSwapsOpen`, `applyWipe`, `isAreaClosed` / `isAreaSealed`,
`applyFieldItem`, `arriveAtWhiteout`), the run in `src/store/run.ts`; UI `src/components/Whiteout.tsx` and
`src/screens/area/WhiteoutRun.tsx`, its scenes on the pixel engine `src/fx/timelines/whiteout.ts` and Abomasnow's
entrance `src/fx/timelines/cinema/abomasnow.ts`, its sounds (`whiteout.*` in `src/audio/sfx.ts`); admin
`src/admin/sections/WhiteoutModeBox.tsx` (Admin → Areas → Special mode: whiteout); migration
`supabase/migrations/0123_whiteout.sql` (inlined in `supabase/seed.sql`); the mode on Crown Shrine in
`scripts/content-snowglobe-valley.ts` (so 0120 writes it). Tests `tests/engine/whiteout.test.ts`,
`tests/whiteout-fx.test.ts`, `tests/whiteout-sql.test.ts`, `e2e/whiteout.spec.ts`. Its screens: docs/15 §47.

- The weather is **docs/62's Snow** (the raids' rule): every Pokémon that isn't Ice type loses **4% of its max HP each
  round**, both sides, with its chip, its snowfall and its log line. (Weather is otherwise off in small worlds; this
  area's mode turns it on.) *Built on the raids' rule as it stands* (`WEATHER_CHIP` and `WEATHER_SPARES` in
  `src/engine/raidSpecials.ts`, called through `blizzardWear` in `whiteoutMode.ts`): when docs/62's general weather
  system lands, `blizzardWear` is the one place to point at it. The admin picks the weather (snow, a sandstorm or
  none); the share is the rule's, not a number of the area's.
- A round is two turns: the wear falls once both sides have had theirs, on both Pokémon out (yours first), and can
  K.O. either; a fight neither side could otherwise win ends that way rather than as a stalemate.
- **Waves of 2, 3 and 4 foes**, various types, one Ice type in each; the last holds an Ice type and one foe strong
  against each starter line: Glalie · Bronzong (Lv.47); Beartic · Sawsbuck · Absol (48–49); Walrein · Crabominable
  (vs Stoutland) · Lanturn (vs Toucannon) · Ursaluna (vs Ampharos) (49–50), below Abomasnow's Lv.50 (the user's call,
  2026-11-01). No Ghost type.
- **A bonfire after every wave, the last just before Abomasnow**: a cozy animated fire with the team around it; it
  heals 40%, and only there can the team change and items be used. **No bag in battle**: "It's too dangerous to open
  the bag here, items might fly away."
- Abomasnow's intro (the crown tree shakes, it steps out), then the boss, Lv.50, in the blizzard. A wipe: back to wave
  1, healed, XP and items kept.
- As built (the user's design, 2026-11-01): wave 1 Glalie 47, Bronzong 47 · wave 2 Beartic 48, Sawsbuck 48, Absol 49 ·
  wave 3 Walrein 49, Crabominable 49, Lanturn 50, Ursaluna 50 (wild, not catchable, always in that order; the admin's).
  The way in heals as a Center does and opens with the intro (the blizzard rolls in, eyes glow in the crown tree), then
  a pop-up with six short rules, TEAM until it begins, NOT NOW and BRAVE THE BLIZZARD. A bonfire after every wave
  heals **40 % of max HP to every team member still standing** (a K.O. one stays K.O.: the bag is open there, a
  Revive brings it back; my call, the design said "heals the team 40%"); the heal is given once, a reload doesn't give
  it twice. In battle the bag stays shut (the engine refuses items), between fights too but at a bonfire. No travel
  while it's under way (the nightmare's lock: the Mart and menus stay open). The boss caught: the outro, and the shrine
  closes for good (`isAreaClosed`, whatever the switch says later). **The boss beaten but not caught** (a throw that
  fails, or none): back to wave 1, as a wipe (the user's call), the team healed and the way in's intro again. Switch Off: the plain secret area (its 6-card deck, then its boss).

### 4.4 Spear Pillar: the Race of Time and Space (time trial with forks)

- **15 fights in 12:00** from READY!, the clock on the server's time (it runs on with the app closed). Healed at the
  start, no Pokémon Center, the foes can't be caught (all met elsewhere).
- **A fork every 3 fights**, two gates, the next three foes of the chosen type: Fire or Grass · Dark or Psychic · Dragon
  or Ice · Electric or Ground · **Water or Steel**. Each gate also holds a find: an item or a time shard (+0:30).
- The last gate decides the raid: **Water → shiny Palkia, Steel → shiny Dialga**; Lv.70, foes' dice 8, 3 HP bars, teams
  up to Lv.70.
- Out of time or a wipe: back to the start, healed, XP and items kept, no limit.
- **One animation speed for everyone**: inside the race every fight plays at the quick speed whatever the player's
  setting, and auto-battle is off; the timer is tuned on it (the user's call, 2026-11-01).
- **One replay** once that legend is caught, with **other types**: Normal or Fairy · Rock or Flying · Bug or Dragon ·
  Ice or Dark, then only the other gate. Foes +4 levels, **10:00**. The pool holds both runs' types.

**Built** (2026-11-01, Off by default: its switch `timeRace`, Admin → Areas → Spear Pillar → Special mode: race of time
and space). The screens' rules: docs/15 §48.

- Engine: `src/engine/timeRaceMode.ts` (`DEFAULT_TIME_RACE`, every number above, `normaliseTimeRace`, `timeRaceRunsOn`,
  `timeRaceModeOf`, `timeRaceRaidRules`) and `src/engine/timeRace.ts`. The state is in the area's progress
  (`AreaProgress.timeRace`: `active`, `startedAt` and `deadline` on the server's time, `fights`, `path`, `gates`, `met`,
  `shards`, `won` (the legends opened, in order), `wonSeen`, `left`, `tries`), so the clock lives in the save and runs on
  with the app closed: `startTimeRace` (READY!: healed, the clock from now), `timeRacePlan` (the first race, or the replay:
  its forks, the other legend's gate alone at the end, +4 levels, 10:00), `openTimeRaceFork` / `pickTimeRaceGate` (a
  shard moves the deadline, an item goes into the bag), `timeRaceEncounter` (the gate's type from the pool, no species
  twice in a stretch while the pool allows), `winTimeRaceFight` (in time it counts; the last opens the last gate's legend;
  past the clock it counts for nothing), `timeRaceTimeUp` and `timeRaceWipe` (back to the start, healed, XP and items
  kept), `timeRaceLock`, `timeRaceNoCatch`, `timeRaceSealed` (only its raids, until the legend won is caught: then the
  replay), `timeRaceBattleSpeed` (short motion at 1 / 1.5 the pace, inside a try only). `run.ts`: `isAreaSealed`,
  `applyWipe`, `arriveAtTimeRace`, `teamSwapsOpen`, `timeRaceVictoryToRaid`, the `time_race_fight` run event. The raids:
  `progressRaidState` opens each of the area's two raids on its own legend's win (never on the rounds); `raidRules` and
  `raidTeamCap` read the mode's raid numbers (Lv.70, dice 8, 3 bars, teams up to Lv.70); `autoAvailable` is off in the
  area; the autopilot, area Versus and double battles stay out of it.
- Store and screens: `src/store/run.ts` (`beginTimeRace`, `pickRaceGate`, `timeRaceExpired`, `openDueTimeRaceFork`,
  `finishTimeRaceVictory`, `healAndStartTimeRaceRaid`, the fight's win and loss), `src/screens/area/TimeRaceRun.tsx` (the
  guard: every page sends back to the area while a try runs, the clock ends it at 0:00 there), `src/components/TimeRace.tsx`,
  `src/fx/timelines/timeRace.ts`, the sounds `race.*` in `src/audio/sfx.ts`, a `clock` icon; in `Area.tsx`,
  `RoundGauge.tsx`, `BattleView.tsx` (one speed, the clock in its corner), `VictoryView.tsx`, `ContinueBar.tsx`,
  `AreaDetails.tsx`, `Team.tsx`, `ProgressRaidScreen.tsx`; kitchen sink `TimeRaceBits`, FX lab presets. Admin:
  `src/admin/sections/TimeRaceModeBox.tsx`. Strings `ui.timeRace.*` in the ten languages.
- Server: migration `supabase/migrations/0124_time_race.sql` (the switch's row, Off; `time_race_open()`;
  `raid_progress_time_race`, `raid_progress_time_race_won` and 0060's `raid_progress_special_locked` extended: a race
  area's raid takes teams and closes only once the cloud save's `timeRace.won` holds its legend, while the switch is on
  for the caller; Spear Pillar's mode where it has none). `supabase/seed.sql` carries it (inlined in its schema part; its
  Spear Pillar patch is a no-op there).
- Tests: `tests/engine/time-race.test.ts`, `tests/time-race-sql.test.ts`, `e2e/time-race.spec.ts`.
- Calls made in building it: a gate's find shows on the gate before the pick (the choice is the type and the find);
  the gates' items are Hyper Potion ×2, Revive, Max Revive (40/35/10), a shard 35 % of the time; fleeing a fight
  (where the game allows it) brings another foe of the same type and costs the time; READY! needs the server's time (the
  device's clock stands in only for a step taken before it was ever read on the page); the admins' No animations
  stays off for them.

### 4.5 Hall of Origin: the Stairway of Plates (Giratina's run, kept)

- The user's review: **keep it like the Giratina event.** Distortion World's portal run as it is (docs/28: the way in,
  cycles of 5 wild Pokémon and a find, then a boon pick of 3, no Center, no way out but a full K.O.), dressed for Arceus:
  10 landings of a stairway of light, each ended by an altar; the type-damage boon is a Plate.
- **Every type is among its Pokémon**: 22 species, all met on the road, not catchable here (a test checks the 18 types).
- The 10th altar: shiny Arceus. The raid: **Lv.90**, foes' dice 10, 4 HP bars, teams up to Lv.90, its Plate changing on
  each bar: Normal → Ice → Steel → Dragon (agreed).

**Built** (2026-11-01): the portal run as it is, with a look on its mode. Its screens: docs/15 §49.

- **Engine**: `PortalRunMode.skin` (`'distortion' | 'plates'`; absent: Distortion World's, so Haunted Hollow's mode reads
  exactly as before) and `raid.barTypes` (the raid Pokémon's type as each bar starts) in `src/engine/types.ts`, cleaned
  by `normalisePortal` (`src/engine/portalMode.ts`: `portalSkin`, `PLATE_BARS`). The run's rules don't read the look.
  The raid: `createRaid` takes the area's `barTypes` (a progression raid of a portal area only), `takePlate` puts on the
  bar's type form at the start and after each broken bar (`raidPlate` in `battle.ts`: Arceus's form of that type, every
  die that type; nothing when it has that type already or has no type forms), logged as a `form` with
  `reason: 'plate'`. Its rules pop-up has its own flag (`platesRulesSeen`, `portalRulesSeen(save, skin)`,
  `markPortalRulesSeen`), so a Distortion World veteran still sees it once.
- **Content**: `HALL_OF_ORIGIN_RUN` in `scripts/content-snowglobe-valley.ts` (Distortion World's numbers, `skin:
  'plates'`, raid Lv.90 · dice 10 · 4 bars · teams up to Lv.90 · Normal, Ice, Steel, Dragon), on the Hall of Origin;
  migration 0120 regenerated (it writes each area's `mode`).
- **Screens**: `src/components/portalSkin.ts` (the look's context, `skinKey`, the prize, `plateKey`),
  `src/components/Portal.tsx` and `PortalFx.tsx` (every piece reads the look), `src/fx/timelines/plates.ts` (the way in,
  the altar, an altar lit, the victory, the raid's Plate), `src/fx/glitch.ts` (the light on its Pokémon),
  `src/styles/portal.css` (`.plates-panel`, `.plates-fx-tint`, `.ui-gleam`), the run's screens (`PortalRun.tsx`, the
  gauge, Home's CONTINUE, the area's details, the Team screen's way back, the preview, the wipe card, the toasts, the
  menus' lock), the raid's (the plain look for the Hall's raid, its lock; the `plate` scene, line, banner and history
  row). Words: `ui.plates.*`, `ui.raid.log.plate`, `ui.raid.plateBanner`, `ui.hist.plate`, ten languages.
- **Admin**: Areas → Special mode: portal run → **Its look** (Distortion World / Stairway of Plates) and the raid's type
  on each bar ("The Hall of Origin's Plates" fills Normal, Ice, Steel, Dragon).
- **Server**: nothing changes, **no migration 0125**. 0057's checks key off the area's mode, not its look: the raid is
  locked until the run is won (`raid_progress_special_locked`, 0060's, which reads any portal mode); the teams are capped
  at Lv.90 in the fight by the game (no team is capped on the server since 0065), and the raid's level, dice and bars
  are the game's, as for Giratina. The look and the bars' types live in the same
  `areas.mode` jsonb, written by 0120.
- **Switch**: the portal run's (`portalRun`, Off / On for admin / On for everyone, shared with Distortion World as the
  same feature); Off, the Hall plays as a plain secret area (its deck, then its raid).
- **Tests**: `tests/engine/stairway-of-plates.test.ts` (the skin leaves Distortion World's mode as it was, the Hall's run
  is Distortion World's, the raid at Lv.90 / 90 / 4 bars, the Plates bar by bar, its rules flag),
  `tests/plates-words.test.ts` (the Plates' names, the look's words, their placeholders),
  `tests/content/snowglobe-valley.test.ts` (the Hall's mode); `e2e/stairway.spec.ts` (the way in, a blessing, the
  gauge, the victory, the rules for a veteran, the raid's first Plate).

### 4.6 Intros and outros, and closing

Every secret area has an intro and an outro on the pixel FX engine (as docs/53's legends): the moon and a leaping
silhouette, then fresh snow (Moonlit Glade); Delibird dropping presents, then the tree lit (Evergreen Hill); the
blizzard rolling in, then lifting (Crown Shrine); a clock face and a rift, then the legend's roar (Spear Pillar); a
stairway of light, then the Judgment (Hall of Origin). Once its boss is caught a secret area closes for good.

## 5. Setting it up (after the review)

The Stairway of Plates (§4.5) needs no SQL of its own: 0120 carries the Hall of Origin's mode (its look, its numbers and
its raid's Plates). Once 0120 has run: Admin → Areas → Hall of Origin → Special mode: portal run, check its look and
numbers, then the portal runs' switch **On for admin** to try it, **On for everyone** to open it (the switch is shared
with Distortion World's run). Publish.

1. Run in the Supabase SQL editor
   [`supabase/migrations/0120_snowglobe_valley.sql`](https://github.com/Splifingald/pokedice/blob/claude/eloquent-galileo-b5uahz/supabase/migrations/0120_snowglobe_valley.sql)
   (generated by `pnpm snowglobe-valley --sql`; safe to run again). It writes the region, areas, pools and trainers,
   adds the world to `smallWorlds` (the switch and the other worlds kept) and bumps `configVersion`.
   `supabase/seed.sql` does not carry it (content migrations aren't inlined there, as Haunted Hollow's).
2. Or, over an admin export: `pnpm snowglobe-valley <in.json> <out.json>`, then `pnpm import-bundle`.
3. **The Gift card** (§4.0, §4.2): run
   [`supabase/migrations/0121_gift_card.sql`](https://github.com/Splifingald/pokedice/blob/claude/eloquent-galileo-b5uahz/supabase/migrations/0121_gift_card.sql)
   in the Supabase SQL editor (after 0120: the decks' `gift` copies and Delibird's `present` are in 0120's content). It
   adds the `giftCard` row (Off, an admin's own row kept), `gift_card_open()` (the switch as the server reads it) and
   bumps `configVersion`. Safe to run again. `supabase/seed.sql` carries it too (inlined). Then Admin → Events → Gift
   card: **On for admin** to try it, then **On for everyone**.
4. **Tracks in the Snow** (§4.1): run in the Supabase SQL editor, after 0120,
   [`supabase/migrations/0122_tracks_in_the_snow.sql`](https://github.com/Splifingald/pokedice/blob/claude/eloquent-galileo-b5uahz/supabase/migrations/0122_tracks_in_the_snow.sql)
   (its switch `tracks`, Off, and `tracks_open()`; safe to run again). `supabase/seed.sql` carries it too (inlined).
   Moonlit Glade's mode itself comes with 0120. Then Admin → Areas → Moonlit Glade → Special mode: Tracks in the Snow:
   the switch **On for admin** to try it, **On for everyone** to open it. Publish.
5. **Crown Shrine's whiteout** (§4.3): deploy the client (the switch is Off: nothing changes for anyone), then run
   [`supabase/migrations/0123_whiteout.sql`](https://github.com/Splifingald/pokedice/blob/claude/eloquent-galileo-b5uahz/supabase/migrations/0123_whiteout.sql)
   (after 0120; safe to run again). It gives Crown Shrine its whiteout when it has no mode yet, adds the switch
   `game_config.whiteout` Off, creates `whiteout_open()` and bumps `configVersion`. `supabase/seed.sql` carries it too
   (inlined in its schema part). Then Admin → Areas → Crown Shrine → **Special mode: whiteout**: check the waves, the
   weather and the bonfires' heal; the switch **On for admin** to try it, **On for everyone** to open it. Publish.
6. **The race of time and space** (§4.4), once the client is deployed: run in the Supabase SQL editor
   [`supabase/migrations/0124_time_race.sql`](https://github.com/Splifingald/pokedice/blob/claude/eloquent-galileo-b5uahz/supabase/migrations/0124_time_race.sql)
   (after 0060 and 0120; safe to run again): the switch `timeRace` (Off), Spear Pillar's race where it has no mode yet,
   and the server's checks on Dialga's and Palkia's raids. `supabase/seed.sql` carries it too (inlined). Then Admin →
   Areas → Spear Pillar → Special mode: race of time and space: check the numbers, the switch **On for admin** to try
   it, **On for everyone** to open it. Publish.

Later changes, once 0120 has run on live, come as patches of their own (as Haunted Hollow's 0055 onwards), never by
regenerating 0120.

## 6. The first review (2026-11-01)

The user's notes, left in the artifact's feedback boxes, each answered there:

| Note | What changed |
|---|---|
| Starters too different, Spheal most | Rowlet, Popplio, Mareep: plain three-stage lines, evolving at about the same levels, none strong against Ice (a test); replaced by the third review |
| Ember Springs: no Houndoom line | Gone from the world (a test); Magcargo and Absol take its places |
| Frost League: the Champion's Abomasnow with a Mega Gem | Abomasnow is his ace (last, Lv.60) and he holds an Abomasite: a gem among a trainer's items makes its ace Mega Evolve whatever the region or a small world (`enemyPlanFor`, `tests/engine/trainer-mega-gem.test.ts`). Built |
| A special card in every normal area | The Gift card (§4.0) |
| Moonlit Glade: a prototype; a boss intro; its Pokémon elsewhere | A playable prototype on the artifact; the intro; Stantler, Buneary, Lycanroc on the road |
| Evergreen Hill: not the Lost Presents | Three Gift cards and Delibird's bursting present (§4.2); Delibird and Comfey on the road |
| Crown Shrine | §4.3: docs/62's Snow, waves 2–3–4, bonfires with team and bag, no bag in battle |
| Spear Pillar: animation speed; other types for the replay | §4.4 |
| Every secret area: an intro and an outro | §4.6 |

### The second and third reviews (2026-11-01)

| Note | What changed |
|---|---|
| Spear Pillar: quick speed, no auto-battle | §4.4 |
| Crown Shrine: the waves' levels are fine | Kept |
| Moonlit Glade: three rounds, 3 × 3, 3 × 3, 4 × 4; the first bush never Stantler, never next to it on the 4 × 4 | §4.1 and the prototype |
| Starters: no game starters | Mareep, Lillipup, Pikipek (§3 for the measures) |
| Hall of Origin: like Giratina's, every type, raid Lv.90, the 4 Plate bars | §4.5 |

