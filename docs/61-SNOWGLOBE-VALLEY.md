# Snowglobe Valley: the winter small world

The user's brief of 2026-11-01: a small world for winter, built like Haunted Hollow (docs/26) around the Ice type, with
a special gameplay in each secret area. This file is the record; the visual game design for review is the artifact
https://claude.ai/artifact/KCHnkbKDiL5VKTrcJz8JcN.

Branch `claude/eloquent-galileo-b5uahz` (from `version/2_9`), a PR into `version/2_9`.

**Status:** the content is built (§2–§3, migration 0108, not to run before the user's review). The Gift card and the
five secret-area gameplays (§4) are designed; the user's first review (2026-11-01, notes left on the artifact's
feedback boxes) is folded in (§6), the Hall of Origin not yet reviewed. Until each is built and switched on, its area
plays as a plain secret area (a short deck, then its boss or raid), which is how the content plays today.

## 1. The brief, and the calls made on it

| The user asked | Built as |
|---|---|
| Sat 19 Dec → Sun 3 Jan 2027, 15 days | **Sat 19 Dec 12:00 UTC → Sun 3 Jan 12:00 UTC** (13:00 in Paris), Haunted Hollow's hour: exactly 15 × 24 h. Counted inclusively the dates are 16 days; the review asks. |
| Inspired by Haunted Hollow, Ice instead of Ghost | Its rules (3 badges to enter, the world's ₽ and tracks, Home's secret rows, its Pokémon going home at the end) unchanged; **Ice ×1.2** both sides; **XP ×1.5** |
| 3 Ice starters with Alolan Sandshrew and Alolan Vulpix | Changed by the review: **Rowlet, Popplio, Mareep**, Lv.5 (§6). Alolan Sandshrew and Vulpix stay in the wild |
| About 125 Pokémon | **125** (`regionSpecies`), all but the three legends catchable before Spear Pillar and the Hall of Origin open |
| About 10 areas + the Frost League | **10 areas + the Frost League** (four Elite Four and Champion Nicholas, no badges) |
| 5 secret areas | Moonlit Glade, Evergreen Hill, Crown Shrine, Spear Pillar, Hall of Origin (§2.3) |
| Shiny Stantler, the first secret boss | Moonlit Glade, **20 caught** (Haunted Hollow's first secret's count; the brief named none) |
| Shiny Delibird from 24 Dec | Evergreen Hill, no count, opens **24 Dec 00:00 Paris** (the world's `opens`) |
| Shiny Abomasnow at 50 caught | Crown Shrine, **50 caught** |
| Shiny Dialga or Palkia, the player's choice, after the league and from 25 Dec | Spear Pillar, **Frost League cleared** + **25 Dec 00:00 Paris**; the race's last gate picks (§4.4) |
| Shiny Arceus at 90 caught, from 1 Jan | Hall of Origin, **90 caught** + **1 Jan 00:00 Paris** |
| Each area its own gameplay | Read as **each secret area** (§4); the review asks whether the main areas get one too |

The date gates use the small worlds' per-area opening dates (`SmallWorld.opens`, docs/21): no new unlock condition. A
secret area opens when its conditions hold **and** its date has come, on the server's clock; Home says "Opens Wed 24 Dec,
00:00" in the player's own time until then.

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
| 11 | Frost League | league | 52–60 | five fights | 7 | Elite Four Fjord (Water), Gunnar (Steel), Drasna (Dragon), Holly (Ice), Champion Nicholas (his ace Abomasnow, Lv.60) | — |

The script holds every pool and trainer; the artifact shows them with their sprites.

### 2.3 The secret areas (as content)

| | Area | Picture | Lv. | Opens | Prize |
|---|---|---|---|---|---|
| S1 | Moonlit Glade | a126 | 24–30 | 20 caught | shiny Stantler Lv.30 (boss) |
| S2 | Evergreen Hill | a858 | 34–40 | 24 Dec 00:00 Paris | shiny Delibird Lv.40 (boss) |
| S3 | Crown Shrine | a855 | 48–55 | 50 caught | shiny Abomasnow Lv.50 (boss) |
| S4 | Spear Pillar | lair-summit | 56–64 | Frost League cleared, 25 Dec 00:00 Paris | shiny Dialga and shiny Palkia Lv.70 (raids) |
| S5 | Hall of Origin | a130 | 52–70 | 90 caught, 1 Jan 00:00 Paris | shiny Arceus Lv.70 (raid; Lv.100 once its mode is built) |

Spear Pillar's pool holds the race's types by fork (§4.4), all met elsewhere. The Hall of Origin's pool too.

### 2.4 The Mart

Poké Ball ₽20 · Great Ball ₽50 · Ultra Ball ₽100 · **Master Ball ₽999, 1 per player** · Potion ₽15 · Super Potion ₽35 ·
Hyper Potion ₽80 · Revive ₽300 · Ice Stone, Water Stone, Dawn Stone, Razor Claw, Peat Block ₽200 each. No Link Cable
(no trade evolution here).

## 3. Balance

`pnpm snowglobe-balance [encounters] [seeds]` (`scripts/snowglobe-balance.ts`): the headless campaign through the
world's chain, each starter, XP ×1.5, Ice ×1.2 and the world's own tracks. 3 starters × 5 seeds, 400 encounters, with
the review's starters (Rowlet, Popplio, Mareep):

| Area | Lv. | Arriving Lv. | Wipes a run | Cleared |
|---|---|---:|---:|---:|
| Snowy Trail | 3–7 | 5.0 | 1.2 | 15/15 |
| Pinewood Forest | 7–12 | 8.8 | 2.9 | 15/15 |
| Frozen Pond | 11–16 | 16.2 | 0.4 | 15/15 |
| Holly Village | 15–21 | 20.9 | 1.1 | 15/15 |
| Toy Workshop | 20–26 | 27.8 | 1.5 | 15/15 |
| Icicle Cave | 25–32 | 35.0 | 2.5 | 15/15 |
| Frostbite Harbour | 31–38 | 43.3 | 2.1 | 15/15 |
| Ember Springs | 37–44 | 51.5 | 1.9 | 15/15 |
| Blizzard Pass | 42–50 | 59.2 | 2.5 | 15/15 |
| Aurora Summit | 48–56 | 67.6 | 7.0 | 15/15 |
| Frost League | 52–60 | 81.4 | 7.3 | 15/15 |

The first pass (the Alolan starters) measured three walls, softened: Toy Workshop (Steel and Steel/Fairy wall an Ice
team; foes' upgrades 3 → 2), Ember Springs (Fire; 5 → 4) and Aurora Summit (3 wild · 5 trainers at 5 → 4 · 4 at 4).
With the new starters Pinewood Forest measured 3.7 wipes a run: its trainers and wild Pokémon are a level lower (2.9;
Haunted Hollow's second area makes 2). Haunted Hollow measured the same way today arrives at its league at Lv.76 with
8 wipes a run there.

## 4. The secret areas' gameplays (designed, for review)

Each will be built as Haunted Hollow's were (docs/28, docs/30): the area's `mode`, a pure engine module, its screen
step, its admin box, **its own Off / On for admin / On for everyone switch, Off by default and checked by the server**,
its `RulesCard` and INFO (docs/15 §20), kitchen-sink states, tests and an e2e spec. Off: the area plays as a plain
secret area. Every number below is the admin's.

### 4.0 The Gift card (every main area; the user's design)

- In the ten main areas **the item card becomes a Gift**. Open it for its level's reward, or tap it to make it bigger:
  the next tap breaks it at **20 / 40 / 60 / 80%** from levels 1–4; level 5 is the top. **Owning a Delibird** (team or
  Box) lowers each by 20% (level 1 is safe) and adds a **level 6**.
- **A broken gift is a wild encounter** of the area's pool, fought and caught as usual.
- Rewards (proposed, scaled to the area: its own balls, ₽ by its level): 1. 2 balls · 2. 3 better balls or 2 Super
  Potions · 3. 2 Hyper Potions or ₽ · 4. a Revive or an evolution item · 5. 2 Rare Candies · 6. 3 Rare Candies and a
  Revive. A player who always taps reaches level 5 3.8% of the time (19.2% with a Delibird), level 6 3.8%.
- Its own switch (Off / On for admin / On for everyone), Off by default; Off, the item card stays.

### 4.1 Moonlit Glade: Tracks in the Snow (hide and seek)

- Stantler hides under one of **9 snowy bushes** (3 × 3). A bush holds a wild Pokémon (a fight, catchable), a find, a
  warm cabin (a Pokémon Center) or nothing; once opened it shows **hoofprints pointing at Stantler** (8 directions).
- **5 taps per snowfall**: not found by then, snow falls, the prints vanish, Stantler moves, the bushes refill.
- Found: **Stantler's intro** (as the bosses' intros), then the boss fight, Lv.30. A missed throw sends it to another
  bush. Caught: the outro, and the glade closes. A wipe: back at its edge, healed, XP and items kept.
- The artifact has a playable prototype, with two settings to tune (taps per snowfall; prints on every bush or only
  the empty ones).

### 4.2 Evergreen Hill: Christmas Eve on the hill

- (The Lost Presents were dropped by the review.) A simple deck: 2 wild, 2 trainers, a Pokémon Center and **3 Gift
  cards** (§4.0, Delibird's help included).
- **Delibird's intro** reuses the Gift: after the deck, a different present (silver paper, gold bow, glowing); only
  MAKE IT BIGGER is offered; it grows, shakes and bursts on the last tap: shiny Delibird, Lv.40. Players don't know it
  will break.

### 4.3 Crown Shrine: Whiteout (weather survival)

- The weather is **docs/62's Snow** (the raids' rule): every Pokémon that isn't Ice type loses **4% of its max HP each
  round**, both sides, with its chip, its snowfall and its log line. (Weather is otherwise off in small worlds; this
  area's mode turns it on.)
- **Waves of 2, 3 and 4 foes**, various types, one Ice type in each; the last holds an Ice type and one foe strong
  against each starter line: Glalie · Bronzong (Lv.47); Beartic · Sawsbuck · Absol (48–49); Froslass · Talonflame ·
  Lanturn · Ursaluna (49–50), below Abomasnow's Lv.50 (the user's call, 2026-11-01).
- **A bonfire after every wave, the last just before Abomasnow**: a cozy animated fire with the team around it; it
  heals 40%, and only there can the team change and items be used. **No bag in battle**: "It's too dangerous to open
  the bag here, items might fly away."
- Abomasnow's intro (the crown tree shakes, it steps out), then the boss, Lv.50, in the blizzard. A wipe: back to wave
  1, healed, XP and items kept.

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

### 4.5 Hall of Origin: the Plates of Creation (roguelike)

- Giratina's portal run (docs/28) reworked: the same way in (a Center's heal, team changes until READY!, no way out
  but a full K.O.), but **a map of 8 floors** to climb, choosing each room: wild fight, Elite (harder, pick a Plate from
  three), campfire (heal 30%), find, mystery.
- **Plates**, one per type (17): +10 damage on attacks of that type, or +1 die of that type for one Pokémon (8 at
  most). For the run only.
- Floor 8, **the Judgment**: Cooltrainer Genesis. Won: shiny Arceus raid, **Lv.100, foes' dice 10, 4 HP bars**, teams up
  to Lv.100, **a new Plate each bar** (Normal → Ice → Steel → Dragon, the review asks). A wipe: back to floor 1,
  Plates lost, XP and items kept.

### 4.6 Intros and outros, and closing

Every secret area has an intro and an outro on the pixel FX engine (as docs/53's legends): the moon and a leaping
silhouette, then fresh snow (Moonlit Glade); Delibird dropping presents, then the tree lit (Evergreen Hill); the
blizzard rolling in, then lifting (Crown Shrine); a clock face and a rift, then the legend's roar (Spear Pillar); a
stairway of light, then the Judgment (Hall of Origin). Once its boss is caught a secret area closes for good.

## 5. Setting it up (after the review)

1. Run in the Supabase SQL editor
   [`supabase/migrations/0108_snowglobe_valley.sql`](https://github.com/Splifingald/pokedice/blob/claude/eloquent-galileo-b5uahz/supabase/migrations/0108_snowglobe_valley.sql)
   (generated by `pnpm snowglobe-valley --sql`; safe to run again). It writes the region, areas, pools and trainers,
   adds the world to `smallWorlds` (the switch and the other worlds kept) and bumps `configVersion`.
   `supabase/seed.sql` does not carry it (content migrations aren't inlined there, as Haunted Hollow's).
2. Or, over an admin export: `pnpm snowglobe-valley <in.json> <out.json>`, then `pnpm import-bundle`.

Later changes, once 0108 has run on live, come as patches of their own (as Haunted Hollow's 0055 onwards), never by
regenerating 0108.

## 6. The first review (2026-11-01)

The user's notes, left in the artifact's feedback boxes, each answered there:

| Note | What changed |
|---|---|
| Starters too different, Spheal most | Rowlet, Popplio, Mareep: plain three-stage lines, evolving at about the same levels, none strong against Ice (a test) |
| Ember Springs: no Houndoom line | Gone from the world (a test); Magcargo and Absol take its places |
| Frost League: the Champion's Abomasnow with a Mega Gem | Abomasnow is his ace (last, Lv.60); the gem needs engine work (trainer megas are off in worlds): on the build list |
| A special card in every normal area | The Gift card (§4.0) |
| Moonlit Glade: a prototype; a boss intro; its Pokémon elsewhere | A playable prototype on the artifact; the intro; Stantler, Buneary, Lycanroc on the road |
| Evergreen Hill: not the Lost Presents | Three Gift cards and Delibird's bursting present (§4.2); Delibird and Comfey on the road |
| Crown Shrine | §4.3: docs/62's Snow, waves 2–3–4, bonfires with team and bag, no bag in battle |
| Spear Pillar: animation speed; other types for the replay | §4.4 |
| Every secret area: an intro and an outro | §4.6 |

