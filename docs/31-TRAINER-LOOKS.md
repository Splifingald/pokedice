# Trainer looks

Status: **built** (2026-10-17) on `ccr-cc700e0c-73q9vw`. It ships **Off**: one switch in Admin → Config → "Trainer
looks" (docs/15 §20). No migration: nothing on the server changes (see [The server](#the-server)).

The look is what other trainers see: on the leaderboard, in Versus, on a friend's card and in a friend's Day Care. It
is not the character (Red or Leaf), who throws the Poké Balls and decides the rival.

Before this, the trainer card's Change opened a free list of 75 Kanto and Johto trainer classes. With the switch on,
looks become a collection of **138**: Red and Leaf from the start, then 10 to 20 per region, each unlocked by playing
that region. On top of those, **event looks** (§7) are won in an event and kept for good: the first is Halloween 2026's.

## 1. The rules (`src/engine/looks.ts`)

- **Every look but Red and Leaf belongs to a region** (the prefix of its id, `johto/sage`) and reads only that
  region's progress: its live block, or its parked one (`switchRegion` lifts it out to look).
- **Four kinds of goal**:

  | Kind | Unlocks when | Shown as |
  |---|---|---|
  | `catch` | this many of the region's Pokédex page caught (`regionSpecies`: the count the trainer card and the Pokédex page show) | a gold bar, "27/45" |
  | `reach` | this area of the region is open (`isAreaUnlocked`: the area before it in the chain cleared, or a secret area's conditions met) | "3 areas away" while it's in the chain |
  | `champion` | the region's League beaten (`leagueDone`) | the goal alone |
  | `complete` | every Pokémon of the region's Pokédex page caught | a gold bar |

- **The ladder, every region**: its Youngster at 10 caught, trainer classes where they belong (a Channeler at Pokémon
  Tower, a Pilot at Mistralton City), catch goals up to about ¾ of the old regional dex, the rival at Victory Road,
  the generation's two heroes for the League, an older or alternate outfit for the full Pokédex. Size: about one look
  per 7.5 Pokémon of the region's own generation, kept between 10 and 20.
- **No Gym Leader, Elite Four member, Champion or villain team** (as the free list had none); rivals and heroes are in.
- **Nothing is stored but what was seen** (and the event looks granted outright, §7): unlocks are worked out from
  progress every time (`lookStates`, memoized per save object). Progress only grows, so a look never locks again. `save.looks.seen` lists the unlocked looks already
  seen in the menu (the red dot is the rest, `newLooks`); `save.looks.rulesSeen` the rules pop-up.
- **Wearing** (`wearLook`): only an unlocked look. **A look not unlocked comes off** while the switch is on
  (`settleLook`, run on every save the store takes in): the avatar is dropped, so the player shows as their character,
  Red or Leaf (the user's call: the old free picks go back to the base look).
- **Extreme mode** (docs/22): looks are earned in the main save and worn in both. The Extreme save reads the main
  save's progress (`looksProgress`, `mainForLooks` in the store) and shows no red dot or NEW tags (nothing unlocks there).
- **Switch off**: the old free list and picker, as before; `settleLook` does nothing; `looks.seen` stays in saves.

## 2. The screens (docs/15 §17)

- **The row under the trainer card** (in place of the old Look block): the look worn, "Trainer looks", "27 of 138
  unlocked", and the **red dot** with the count of new looks (9+ at most; `crimson`, as white text this small isn't
  readable on the bright red). The avatar in the top bar carries the same red dot while no gold one is there; both
  counts are in its name ("Trainer menu, something new: 2").
- **The first time**, the row opens the rules pop-up (`LooksRulesModal`: a line-up of heroes on the night sky, 4 rows,
  Later / Let's go!, which goes on to the menu); after that, the menu.
- **The menu** (`LooksSheet` → `LooksMenu`), a sheet:
  - the look worn at 1.25×, its name, and who sees it;
  - **Unlocked**: every unlocked look as a radio grid ("6/138"); a tap wears it at once; NEW (gold) on the ones not
    seen yet;
  - **The list**: Locked / Unlocked (a `Seg` with counts) and a region dropdown ("All regions (12)", then each
    started region with what it holds in that view), then the looks by region, the one being played first ("Johto ·
    playing now"):
    - **Locked**, each sorted nearest goal first: a silhouette (`var(--silhouette)`), the name, the goal and its bar
      or "areas away";
    - **Unlocked** (`OwnedLook`), in the ladder's order: the sprite, the name and, after a check, how it was won (the
      goal's words: "Catch 20 Kanto Pokémon", "Become the Kanto Champion"); Red and Leaf first, "From the start", with
      All regions only;
  - a region not started is one line ("13 looks · start Johto to see them"): its looks stay a surprise;
  - the blue INFO button: the rules again.
  - Closing it marks every unlocked look seen: the NEW tags and the dots go.
- **Names**: a class or a character's name, with ♂ / ♀ where both exist (Swimmer ♀) or the outfit
  (`ui.looks.outfit`: "Red (Game Boy)", "May (Sapphire)").
- Every piece, in every state, is on `/kitchen-sink` (`LooksBits`).

## 3. The sprites

36 new Showdown sprites (the heroes, Blue, Wally, Lillie, Carmine and the outfits), added to
`scripts/showdown-sprites.ts`'s tables (Gen 6–9 regions got their own tables for them) and packed into the region
sheets by `pnpm showdown-sprites trainers`. The menu costs one request per region sheet, as any screen of trainers.

## 4. The server

Nothing new: the look already travels in the save (`player.avatar`), which the leaderboard, friends' cards and Day
Cares read, and every reader turns an unknown id into Red (`avatarOf`). No function acts for the player on this
feature, so there is nothing for the server to gate; a hand-edited save wearing a locked look is as trusted as any
other save field.

## 5. Setting it up

1. Admin → Config → **Trainer looks**: On for admin, try it, then On for everyone. Save, then Publish.
2. No SQL to run for the looks themselves. Halloween 2026's look (§7) has one, to run once:
   [`0072_halloween_2026_look.sql`](https://github.com/Splifingald/pokedice/blob/ccr-57978ca3-fag4wr/supabase/migrations/0072_halloween_2026_look.sql).

## 6. The sets

### Kanto (20)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Kanto Pokémon |
| Bug Catcher | Reach Viridian Forest |
| Lass | Catch 20 Kanto Pokémon |
| Hiker | Reach Mt. Moon |
| Sailor | Reach Routes 5 & 6 |
| Camper | Catch 35 Kanto Pokémon |
| Picnicker | Catch 35 Kanto Pokémon |
| Channeler | Reach Pokémon Tower |
| Biker | Reach Cycling Road |
| Scientist | Reach Silph Co. |
| Swimmer ♂ | Reach Sea Routes 19 & 20 |
| Swimmer ♀ | Reach Sea Routes 19 & 20 |
| Burglar | Reach Pokémon Mansion |
| Beauty | Catch 75 Kanto Pokémon |
| Cooltrainer ♂ | Catch 100 Kanto Pokémon |
| Cooltrainer ♀ | Catch 100 Kanto Pokémon |
| Blue | Reach Victory Road |
| Chase | Become the Kanto Champion (Indigo Plateau) |
| Elaine | Become the Kanto Champion (Indigo Plateau) |
| Red (Game Boy) | Complete the Kanto Pokédex |

### Johto (13)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Johto Pokémon |
| Sage | Reach Violet City & Sprout Tower |
| Guitarist | Reach Goldenrod City |
| Bug Catcher | Reach National Park |
| Firebreather | Reach Ecruteak City & the Burned Tower |
| School Kid | Catch 25 Johto Pokémon |
| Black Belt | Reach Cianwood City |
| Poké Fan | Catch 45 Johto Pokémon |
| Kimono Girl | Catch 70 Johto Pokémon |
| Silver | Reach Victory Road |
| Ethan | Become the Johto Champion (Indigo Plateau) |
| Lyra | Become the Johto Champion (Indigo Plateau) |
| Kris | Complete the Johto Pokédex |

### Hoenn (18)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Hoenn Pokémon |
| Bug Catcher | Reach Petalburg Woods & Route 104 |
| Hiker | Reach Dewford Town & Granite Cave |
| Triathlete | Reach Slateport City & Route 110 |
| Guitarist | Reach Mauville City |
| Kindler | Reach Route 112, Fiery Path & Mt. Chimney |
| Collector | Catch 30 Hoenn Pokémon |
| Ninja Boy | Reach Routes 113–115 & Meteor Falls |
| Bird Keeper | Reach Fortree City & Routes 120–121 |
| Hex Maniac | Reach Mt. Pyre & Routes 122–123 |
| Rich Boy | Catch 60 Hoenn Pokémon |
| Lady | Catch 60 Hoenn Pokémon |
| Battle Girl | Catch 90 Hoenn Pokémon |
| Wally | Reach Victory Road |
| Brendan | Become the Hoenn Champion (Ever Grande City) |
| May | Become the Hoenn Champion (Ever Grande City) |
| Brendan (Ruby) | Complete the Hoenn Pokédex |
| May (Sapphire) | Complete the Hoenn Pokédex |

### Sinnoh (14)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Sinnoh Pokémon |
| Worker | Reach Oreburgh City & the Mine |
| Aroma Lady | Reach Eterna Forest |
| Cyclist | Reach Cycling Road & Routes 206–207 |
| Artist | Reach Hearthome City |
| School Kid | Catch 25 Sinnoh Pokémon |
| Ruin Maniac | Reach Route 209 & the Solaceon Ruins |
| Idol | Catch 50 Sinnoh Pokémon |
| Skier | Reach Routes 216 & 217 and Snowpoint City |
| Barry | Reach Victory Road |
| Lucas | Become the Sinnoh Champion (The Pokémon League) |
| Dawn | Become the Sinnoh Champion (The Pokémon League) |
| Rei | Complete the Sinnoh Pokédex |
| Akari | Complete the Sinnoh Pokédex |

### Unova (20)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Unova Pokémon |
| Waiter | Reach Striaton City & the Dreamyard |
| Waitress | Reach Striaton City & the Dreamyard |
| Backpacker ♂ | Reach Route 3 & Wellspring Cave |
| School Kid | Catch 25 Unova Pokémon |
| Clerk | Reach Skyarrow Bridge & Castelia City |
| Backpacker ♀ | Reach Route 4, the Desert Resort & Relic Castle |
| Harlequin | Reach Nimbasa City & Route 5 |
| Dancer | Catch 45 Unova Pokémon |
| Pilot | Reach Mistralton City & Route 7 |
| Psychic | Reach Celestial Tower |
| Nurse | Catch 70 Unova Pokémon |
| Veteran | Catch 100 Unova Pokémon |
| Cheren | Reach Route 10 & Victory Road |
| Bianca | Reach Route 10 & Victory Road |
| N | Catch 125 Unova Pokémon |
| Hilbert | Become the Unova Champion (The Pokémon League) |
| Hilda | Become the Unova Champion (The Pokémon League) |
| Nate | Complete the Unova Pokédex |
| Rosa | Complete the Unova Pokédex |

### Kalos (10)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Kalos Pokémon |
| Roller Skater | Reach Route 5 & Camphrier Town |
| Butler | Reach Route 6 & Parfum Palace |
| Maid | Reach Route 6 & Parfum Palace |
| Furisode Girl | Catch 35 Kalos Pokémon |
| Punk Girl | Reach Routes 15 & 16 and the Lost Hotel |
| Shauna | Reach Route 21 & Victory Road |
| Calem | Become the Kalos Champion (The Pokémon League) |
| Serena | Become the Kalos Champion (The Pokémon League) |
| Trevor | Complete the Kalos Pokédex |

### Alola (12)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Alola Pokémon |
| Trial Guide | Reach Route 2 & the Verdant Cavern |
| Lillie | Catch 30 Alola Pokémon |
| Firefighter | Reach Routes 7 & 8 and Wela Volcano Park |
| Golfer | Reach Malie City & Malie Garden |
| Gladion | Reach Aether Paradise |
| Surfer | Reach Seafolk Village, Poni Wilds & Ancient Poni Path |
| Hau | Reach Mount Lanakila |
| Elio | Become the Alola Champion (The Pokémon League) |
| Selene | Become the Alola Champion (The Pokémon League) |
| Elio (Ultra) | Complete the Alola Pokédex |
| Selene (Ultra) | Complete the Alola Pokédex |

### Galar (13)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Galar Pokémon |
| Backpacker | Reach The Wild Area: Rolling Fields & Dappled Grove |
| Worker | Reach Motostoke, Route 3 & the Galar Mine |
| Musician | Catch 30 Galar Pokémon |
| Bede | Reach Glimwood Tangle & Ballonlea |
| Madame | Catch 55 Galar Pokémon |
| Marnie | Reach Route 9 & Spikemuth |
| Reporter | Catch 75 Galar Pokémon |
| Hop | Reach Route 10 & Wyndon |
| Victor | Become the Galar Champion (Wyndon Stadium & the Champion Cup) |
| Gloria | Become the Galar Champion (Wyndon Stadium & the Champion Cup) |
| Victor (Dojo) | Complete the Galar Pokédex |
| Gloria (Dojo) | Complete the Galar Pokédex |

### Paldea (16)

| Look | Unlocks |
|---|---|
| Youngster | Catch 10 Paldea Pokémon |
| Backpacker | Reach Los Platos & South Province (Area One) |
| Artist | Reach South Province (Area Six) & Artazon |
| Musician | Catch 30 Paldea Pokémon |
| Cook | Reach The Asado Desert & Cascarrafa |
| Office Worker ♂ | Reach West Province (Area Two) & Medali |
| Office Worker ♀ | Reach West Province (Area Two) & Medali |
| Nemona | Catch 60 Paldea Pokémon |
| Arven | Reach The Way Home |
| Penny | Reach The Way Home |
| Florian | Become the Paldea Champion (The Pokémon League) |
| Juliana | Become the Paldea Champion (The Pokémon League) |
| Kieran | Reach The Land of Kitakami |
| Carmine | Reach The Land of Kitakami |
| Florian (Blueberry) | Complete the Paldea Pokédex |
| Juliana (Blueberry) | Complete the Paldea Pokédex |

## 7. Event looks

An event's prize, won there and **kept for good**, whatever happens to the event afterwards. The user's request of
2026-10-24, for Haunted Hollow (docs/26).

| Question | Answer |
|---|---|
| The first | **Halloween 26 Pokémaniac** (`events/halloween-2026-pokemaniac`): the Gen 3 Poké Maniac in a costume of **shiny Giratina** (Altered Forme: the gold body, the silver crest and claws, the black wings with teal spikes), drawn for the game from his sprite and the colours of Giratina's own shiny sprite. `public/trainers/classes/events/`, packed into its own sheet (`src/assets/trainers/events.png`, the `events` sheet of the atlas: one cell, as `pnpm showdown-sprites trainers` would pack it; it is not a Showdown sprite, so that script leaves the file alone). |
| Who gets it | Whoever **catches Haunted Hollow's shiny Giratina**: its Distortion World raid won (`events.raidsDone` holds `cfff57e0…:487`, which stays in the save after the world closes). And, once, by SQL, **everyone already holding a shiny Giratina** (below). |
| Its goal | "Completed Haunted Hollow Halloween 2026 event" (`ui.looks.goal.event.halloween-2026`), the user's words. |
| In the menu | **Listed only once won**: under its own **Events** heading in the Unlocked list (with All regions, after Red and Leaf), in the unlocked grid, NEW and the red dot as any look just unlocked. Never in the Locked list, and not counted in "27 of 138" until won: after the event nobody can work towards it, so it isn't a goal. |
| The switch | The Trainer looks one: it is a look like the others. Nothing else to switch on. |
| The rules (engine) | An unlock of its own kind, `{ kind: 'event', event, raids }`: open when a raid it names is in `events.raidsDone`, or its id is in `looks.earned`. Read from the main save's progress, like every look (the Extreme save wears what the main one won). |

### The SQL grant (0072)

[`0072_halloween_2026_look.sql`](https://github.com/Splifingald/pokedice/blob/ccr-57978ca3-fag4wr/supabase/migrations/0072_halloween_2026_look.sql)
adds the look to `looks.earned` in the **main** save of every player who, in either save, holds a shiny Giratina
(the live Box or a parked region's, the Day Care, a closed world's homers or pending catches, a raid's locked prize,
a trade still listed) or won the Distortion World's raid. Not today's raid boss, a friend's Day Care guest, a trade log
or an encounter left half-way. It isn't in `seed.sql`: a fresh database has no players.

- **Why it lasts**: the save it writes is stamped now (the row and `updatedAt`), so every device sees the cloud copy
  moved and compares again; whichever copy wins, the look granted to either is kept (`keepLooksEarned`, beside
  `keepGeneralBought`, in the sync and between tabs). A device played on meanwhile wins on progress and keeps it.
- **Safe to run again**: whoever already has it is left alone. Run it once more after Haunted Hollow ends (1 Nov 2026)
  for anyone who caught their Giratina in an Extreme save in the meantime (the game only reads the main save's raids).
- Tests: `tests/halloween-look-sql.test.ts` (PGlite), `tests/engine/looks.test.ts`, `tests/cloud-mark.test.ts`.
