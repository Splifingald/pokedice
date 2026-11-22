# The Rotom Room and the Rotom Pokédex

The user's brief of 2026-11-21: a secret area in Sinnoh where players find Rotom's forms. It changes weekly, an Electric
area with Pokémon of the week's form's second type, with the form as a boss at its end. First Lv.50–60 after the League;
**moved before the League, Lv.36–44** (the user's call, 2026-11-22). Once caught the area closes until next week; with
every form owned, for good. Like the Unown Pokédex in Johto (docs/41), a Rotom Pokédex, whose completion brings a shiny
normal Rotom. It sits behind its own admin switch (docs/15 §20), Off by default.

Built on `claude/sinnoh-rotom-secret-area-na9l8t`.

## 1. Decisions

The user's answers (2026-11-21) and the calls made on them:

| Question | Call |
|---|---|
| How the week picks its form | **Per player: a form they don't own.** Drawn at the week's start (Monday 00:00 UTC, the Versus league's week) from the week and the save, and **pinned** in the save (`save.rotomRoom`), so a catch mid-week never moves it. Five weeks at most to complete the page. |
| The week's form already owned (a trade, a gift) | **Closed that week**, as after a catch. |
| Where the forms are listed | **The Rotom Pokédex only.** Sinnoh's Pokédex keeps its one Rotom (`regionSpecies` leaves the forms out); catching a form also notes Rotom (#479) there, as an Unown letter notes Unown. |
| The wild Pokémon | **Sinnoh's own species only**, so Sinnoh's Pokédex gains nothing and is the same every week (a test checks every row is met elsewhere in Sinnoh). |
| Where on the road (2026-11-22) | **Lv.36–44, before the League**: it opens once **Lake Valor & Lake Acuity** (Lv.36–44) is reached, as the Great Marsh opens at Pastoria. |
| Defaults taken (not asked) | The boss is the week's form at **Lv.44**, a plain boss fight, catchable (the wild shiny odds apply). The page has **5 entries** (the appliances; the plain Rotom is the prize). The prize is a **shiny Rotom Lv.44** (the room's level, the admin's number), once. The forms can't be traded (as every non-regional form), so the room is where they come from. |

## 2. The content

`scripts/rotom-room.ts` (`pnpm tsx scripts/rotom-room.ts`) writes it into the bundle and writes migrations 0151 (the
content, from the same rows) and 0152 (the switch); then `pnpm showdown-sprites pokemon icons cries --only 10008,10009,10010,10011,10012` and `pnpm seed-sql`.

- **The forms**: species rows of their own (PokeAPI's ids), `form: { of: 479, kind: 'appliance' }` (a new kind: saved
  like a regional form, listed on the Rotom Pokédex rather than the region's). Rotom's own dice schedule on Electric and
  the appliance's type (its Ghost dice become that type), Rotom's HP, their own speed (86), Rotom's egg groups (an Egg
  hatches as Rotom), names in the ten languages, PokeAPI's offline sprites and Showdown's animated ones.

  | Form | Id | Types |
  |---|---|---|
  | Heat Rotom | 10008 | Electric / Fire |
  | Wash Rotom | 10009 | Electric / Water |
  | Frost Rotom | 10010 | Electric / Ice |
  | Fan Rotom | 10011 | Electric / Flying |
  | Mow Rotom | 10012 | Electric / Grass |

- **The room**: **The Rotom Room** (Platinum's locked room of the Galactic Warehouse), Sinnoh, hidden, opens once
  **Lake Valor & Lake Acuity is reached** (an `area` condition). Picture `lair-lab`. 2 rounds of 8 cards (6 wild, 1
  item, 1 Pokémon Center), foes' upgrades 7 (Lake Valor's), wild Lv.36–42, Lake Valor's loot. Its bosses are the five
  forms at Lv.44; the week keeps only its own.
- **The pool** (each week the Electric rows and the week's type; a Pokémon of two such types comes both weeks). Before
  the League, no item-evolved final the road keeps for Lv.50+ (Electabuzz rather than Electivire), and a
  level-evolving species only on its side of its evolution level (a test checks both):
  Electric, always — Luxray, Electabuzz, Lanturn, Pachirisu. Fire — Magmar, Houndoom, Torkoal, Magcargo (from 38).
  Water — Floatzel, Gastrodon, Lumineon, Golduck, Gyarados. Ice — Sneasel, Snorunt (to 41), Mamoswine, Snover (to
  39), Abomasnow (from 40). Flying — Staraptor, Noctowl, Drifblim, Gliscor, Yanmega, Chatot (and Gyarados). Grass —
  Roselia, Tangrowth, Carnivine, Cherrim, Tropius (and Snover, Abomasnow; Tropius in Fan's week too). The admin edits it in Admin → Areas like any
  pool: a row is met in the weeks of its types, whatever is added.

## 3. The engine (`src/engine/rotomRoom.ts`)

- `ROTOM_FORMS` (dex, appliance, type), `isRotomForm`, `rotomRoomOn` (the switch), `rotomPrizeLevel`, `isRotomRoom`,
  `rotomRoomBase` (the room as its content says it, all five weeks).
- **The week**: `rotomFormFor(save, week)` (a form not owned, from a hash of the week and the save's first Pokémon),
  `pinRotomWeek(save, data, now)` (a new week on the server's clock: the form pinned, the room's rounds, deck and boss
  started afresh; only while open, in Sinnoh), `rotomWeekForm`, `rotomWeekCurrent`, `rotomRoomReopensAt`.
- **The room as the week makes it**: `rotomWeekArea(base, data, form)` (rows of other types weigh 0, kept so lists
  know them; the form as its only boss) and `withRotomWeek(data, save)`: the game data as this player sees it — off,
  the room is gone from `areas`; on, this week's. The store applies it (below), so encounters, the boss, Home's lists
  and the Pokédex's "Nearby" all read the week without knowing of it.
- **Closing**: `rotomRoomClosed` (hooked into `isAreaClosed`): the week's form owned, or none pinned yet (the time
  unknown), or `rotomRoomDone` (all five owned, for good).
- **The Rotom Pokédex**: `rotomDexOf`, `addRotomForms`, `noteRotomDex` (Sinnoh's Box, live or parked, and its Day Care
  residents), `rotomDexOpen` (the switch, Sinnoh being played, the room open), `payRotomDex` (the shiny Rotom, once,
  into the Box, the team when there's room), `rotomDexRulesDue` / `markRotomDexSeen` (Home's notice until the page is
  opened). `applyCatch` notes a form, adds Rotom to the Pokédex, pays the prize with the fifth, and adds the run event
  `rotom_form` (`dex`, `found`, `total`, `prizeLevel` with the last).
- Save: `rotomDex`, `rotomDexPaid`, `rotomDexSeen`, `rotomRoom` (`week`, `form`). Config: `rotomRoom` (`access`,
  `prizeLevel`). `GameData.rotomRoomBase`.

**The store**: every save settles through `noteRotomDex` → `pinRotomWeek` (on `trustedNow()`) → `payRotomDex`, with a
toast when the prize comes (`store/game.ts`); the data subscription applies `withRotomWeek` after `withViewer` (a player
standing in the room when it's switched off goes back to Lake Valor & Lake Acuity, the area that opened it);
`useRotomWeekClock` (GameLayout) pins Monday's form as soon as the time is known, then checks each minute; entering the
room asks `rotom_room_open()` for a signed-in player and sends them back if it says no (`store/rotomRoom.ts`).

## 4. What players see

docs/15 §55: the Pokédex's **Rotom** view (the week's card, the five tiles, INFO), Home's banner in the room, CONTINUE's
lines ("Wash Rotom is waiting", "Rotom caught: back {date} with another form", "Every Rotom form caught"), the result
card's line, the shiny Rotom's toast, Home's notice until the page is opened, and the rules in How to play. A Rotom form
is said as a wild Pokémon in battle, never "the legendary".

## 5. Setting it up

1. Deploy the client (the switch is Off: no room, no page; saves start noting their forms).
2. Run, in this order (each safe to run again, the content version + 1 each):
   - `supabase/migrations/0151_rotom_room.sql`: the five forms, the room with its pool, loot and bosses.
     https://github.com/Splifingald/pokedice/blob/claude/sinnoh-rotom-secret-area-na9l8t/supabase/migrations/0151_rotom_room.sql
   - `supabase/migrations/0152_rotom_room_switch.sql`: the switch's row (Off, the prize's level) and
     `rotom_room_open()`.
     https://github.com/Splifingald/pokedice/blob/claude/sinnoh-rotom-secret-area-na9l8t/supabase/migrations/0152_rotom_room_switch.sql

   `supabase/seed.sql` carries both: 0152 inlined, 0151's rows with the bundle's.
3. Admin → Config → **Rotom Room**: the shiny Rotom's level if not 44, then **On for admin** to try it signed in,
   **On for everyone** to open it. Publish.

## 6. Tests

- `tests/engine/rotom-room.test.ts`: the content (the forms' types and dice, the room at Lake Valor & Lake Acuity, Lv.36–44, each species on its side of its evolution level, the
  bosses; the pool Sinnoh's own, each Electric or an appliance's type; Sinnoh's Pokédex with Rotom once, the same every
  week); the switch (off nowhere, admin only, back from the content kept aside, Lake Valor first); the week (a form not
  owned, the same for the same week, pinned on the server's clock and kept, nothing without the time or outside Sinnoh,
  the room afresh); the week's room (its types, its boss, the fights, the boss once the rounds are done); closing (the
  week's form owned, back next Monday with another; all five; no week pinned); the Rotom Pokédex (a catch noted, Rotom
  once, the forms held noted and kept, the shiny Rotom once at the admin's level, a page finished while off paid when it
  opens, Home's notice).
- `tests/rotom-room-sql.test.ts`: migrations 0151 and 0152 (the forms, the room, its pool and loot, Off with the
  prize's level, `rotom_room_open()` for everyone / the admin / an odd value, its grants, a second run keeping the
  admin's edits; seed.sql inlining 0152 and carrying 0151's rows).
- `tests/data.test.ts`: the forms are the one kind of boss besides roadblocks, Titans and mythicals that is never a raid.
- `e2e/rotom-room.spec.ts`: off, nothing; on, the week pinned, the page (card, five forms, INFO, seen), the banner and
  See; caught this week, the banner and CONTINUE say when it's back; all five, the shiny Rotom once.
