# 15 · Day Care v2: one Day Care for every region, friends' Pokémon, breeding

> **For the human:** start a Claude Code session on this repo and paste:
> *"Read docs/15-DAYCARE-BREEDING.md and carry it out, phase by phase. Start with Phase 0."*
> The rest of this file is written to that session. It replaces the Day Care part of docs/14 (its Phase 6).

---

## What changes, in one screen

| | Today (`src/engine/daycare.ts`) | v2 |
|---|---|---|
| Where | One Day Care **per region**: `dayCare` lives in the region block and is parked with it (`liveBlock`/`withBlock` in `src/engine/regions.ts`) | **One Day Care for every region.** It doesn't reset when a region opens, and the same one shows in every region |
| Opens | 20 species in the live region's Pokédex | 20 species caught, counted **across every region**; once open, open for good |
| Your Pokémon | 2 slots | 2 slots (unchanged) |
| XP | +1 every 10 min, **200 XP cap per stay** | +1 every 10 min, **no cap but Lv.100** |
| Friends | — | **4 friend slots**: invite a Pokémon that is sitting in a friend's Day Care. It visits; nothing changes for the friend |
| Eggs | Free once, then bought for ₽50; hatch on the spot | **Bred.** Every 12 h (admin) each of your Pokémon checks everyone at the Day Care; a compatible pair leaves an Egg. **Ditto pairs with everyone but legendaries, on a slower check: every 24 h (admin).** The first visit's **free Egg stays**; the ₽50 Egg goes |
| Egg now | — | **Skip the wait for ₽200 (admin):** the next check runs now, a pair leaves an Egg, and it hatches right away |
| Compatibility | — | The **real Egg groups** (data from Pokémon Showdown) |
| What hatches | Random, missing species ×4, from the region's pool | Unchanged: still random, not the parents' species |
| Shiny | — | Day Care Eggs have their **own shiny odds** (admin, default 1 %) |
| Home | (the Map has a Day Care entry) | The Home widget shows your two with their XP; with an Egg waiting it turns **gold** with an Egg shaking, and a tap opens the Day Care **straight into the hatching** |

The mockup is the Visual Lab's Home tab (artifact: https://claude.ai/artifact/EtDYmxgAmoFifQWSjtk3nD, source
`design/visual-lab/`). Open the Day Care widget on Home. The preview bar above the phone has **Run the Day Care's 12 h
check** and **Run Ditto's 24 h check**, and its three saves show the three widget states (Mid-game: residents;
Versus opens and League beaten: an Egg waiting, a Ditto visiting). Under the yard, **Egg now · ₽200** skips the wait.

## Phase 0 · Read before writing

1. Run the lab (`node design/visual-lab/serve.mjs` → http://localhost:4173), Home tab, at 390×844 and 1280×900:
   - open the Day Care from its widget;
   - invite a friend's Pokémon (try the **Compatible only** toggle and the search);
   - run both checks, then hatch from the widget, from the gold card and by tapping the Egg in the yard;
   - press **Egg now** (₽200), with and without enough gold;
   - take one of yours back and leave another.
2. Read the lab side:
   - `design/visual-lab/daycare.js` (the whole page, `compatible()`, `pairs()`, the pickers, the checks, the hatch);
   - in `home.js`: `renderDayCareW`, `makeYard`, `SCENES.daycare`, the `daycare` branch of `paintOutdoor`, the `likes`
     and `quiet` options of `Mon`;
   - in `index.html`: the CSS blocks `/* Day Care */` and `/* Day Care v2 … */`;
   - in `anims.js`: the `shiny` option of `hatchAnim`.
3. Read the game side:
   - `src/engine/daycare.ts`, `src/engine/regions.ts` (`liveBlock`, `withBlock`, `newRegionBlock`), `src/engine/types.ts`
     (`DayCareConfig`, `DayCareState`, `DayCareResident`, `RegionSave`);
   - `src/save/schema.ts` (`dayCareSchema`, `regionBlockSchema`, `parseSave`, `repairBlock`);
   - `src/store/actions.ts` (`leaveAtDayCare`, `pickUpFromDayCare`, `hatchDayCareEgg`);
   - `src/screens/DayCareScreen.tsx`, `src/components/DayCareTutorial.tsx`, `src/screens/MapScreen.tsx` (its Day Care
     entry);
   - `src/admin/sections/ConfigSection.tsx` (`DayCareBox`), `src/data/config.json`;
   - `src/engine/catching.ts` (the shiny rule: a shiny always joins as its own Pokémon);
   - `tests/engine/daycare.test.ts`.
4. Check where docs/14 stands. If its Phase 2 (Home) has landed, the widget goes on Home. If not, put the widget's three
   states on the Map's Day Care entry, and Home picks them up when it lands.
5. Ask the human about any **open decision** (end of this file) that isn't settled yet, then start Phase 1. Ask once,
   all together.

The engine stays pure: no `Date.now()`, no `Math.random()`, no network inside `src/engine/`. Time, randomness and
friends' data come in as arguments.

## Phase 1 · Data: Egg groups and genders

The game has no Egg groups yet. Add them as static data, the way `showdown-sprites.json` is static: they are canon,
not something an admin edits.

- New script `scripts/egg-groups.ts` (`pnpm egg-groups`). It reads Showdown's `pokedex.json`
  (https://play.pokemonshowdown.com/data/pokedex.json), cached under `scripts/.cache/showdown` like
  `showdown-sprites.ts`. It writes `src/data/egg-groups.json`, keyed by dex for every species in `pokemon.json`:
  `{ "133": { "g": ["Field"] }, "132": { "g": ["Ditto"] }, "81": { "g": ["Mineral"], "s": "N" }, "128": { "g": ["Field"], "s": "M" } }`.
  - `g` is Showdown's `eggGroups` as is ("Water 1", "Human-Like", "Undiscovered"…).
  - `s` is Showdown's `gender`, present only when the species is fixed: `"M"`, `"F"` or `"N"` (genderless).
  - `l: 1` for legendaries and mythicals: Showdown's `tags` holds `Sub-Legendary`, `Restricted Legendary` or `Mythical`.
    Ditto doesn't pair with them.
  - Use the base species' entry. Forms share their base's groups in every case Pokédice has.
- Load it in `src/engine/data.ts` into `GameData` as
  `eggGroups: Record<number, { g: string[]; s?: 'M' | 'F' | 'N'; l?: 1 }>`.
  The size is about 30 KB raw, 5 KB gzipped.
- Test: every dex in `pokemon.json` has an entry; Ditto (132) is `["Ditto"]`; Eevee (133) is `["Field"]`; Magnemite
  (81) is genderless; Tauros (128) is male-only; Mewtwo (150) and Celebi (251) are legendary.

## Phase 2 · Engine

All in `src/engine/daycare.ts` (split it into `daycare.ts` + `breeding.ts` if it grows past ~350 lines), with types
in `types.ts`.

### Compatibility

```ts
export const isDitto = (data: GameData, dex: number) => (data.eggGroups[dex]?.g ?? []).includes('Ditto')
/** A pair with a Ditto in it is checked on the slower clock (breedDittoHours). */
export const slowPair = (data: GameData, a: number, b: number) => isDitto(data, a) || isDitto(data, b)
export function compatible(data: GameData, a: number, b: number): boolean
```

The rules, in this order (same as `compatible()` in `daycare.js`):

1. Either one is a Ditto → **true unless the other is a legendary or mythical** (`l`). Ditto pairs with everyone else,
   babies and another Ditto included.
2. Either one is in `Undiscovered` → false.
3. Either one is genderless (`s: 'N'`) → false (only Ditto breeds with them).
4. Both have the same fixed gender (two male-only, or two female-only) → false. Pokédice has no genders, so this is
   the closest to the games without them.
5. Otherwise → true when they share an Egg group.

Also export `sharedGroups(data, a, b): string[]` for the UI ("Field", "Water 1 · Dragon").

### XP: Lv.100 is the only cap

- Drop `maxXp` from `dayCareXp`: `ticks × xpPerTick`, uncapped.
- `residentNow` already stops at `config.maxLevel` through `gainXp`.
- `nextDayCareTick` returns null once `residentNow(...).level >= maxLevel`.
- Add `dayCareLevelProgress(res, now, data)`: `{ level, xp, toNext }`, for the bar "to Lv.N+1".
- `withdrawPokemon` is unchanged apart from the destination (below).

### One Day Care for every region

- `DayCareState` moves out of `RegionSave` and stays at the top level of `SaveData`, for every region.
  - `liveBlock` and `withBlock` stop carrying it.
  - `newRegionBlock` never creates one.
- Each resident remembers where it came from:
  `DayCareResident { inst, since, region: RegionId }`.
  - **Taking back** puts it into **that region's** Box: the live one through the top level, a parked one through
    `save.parked[region]`. The team only when it is the live region and the team has room.
  - The toast says where: "Eevee is back in your Kanto Box".
- **Leaving** a Pokémon takes it from the live region's team or Box (as today).
- `isDayCareOpen(save, data)`: the distinct species across the live Pokédex and every parked one, ≥ `unlockPokedex`.
  Pokédexes only grow, so once open it stays open.
- `dayCareTutorialDue` reads the global state, so it fires once ever, not once per region.

### Friends' Pokémon (guests)

A guest is a **snapshot** in your save of a Pokémon sitting in a friend's Day Care. Your save never holds the
friend's instance and never writes to their save.

```ts
export interface DayCareGuest {
  owner: string      // the friend's user id
  ownerName: string  // for "Lea's", as it was when invited
  inst: string       // the friend's instance id, to check it is still there
  dex: number
  level: number      // its level when last refreshed
  shiny?: boolean
  addedAt: number
}
```

- `DayCareState.guests: DayCareGuest[]`, at most `friendSlots` (4). There are no empty entries; the UI draws the empty
  slots.
- `inviteGuest(save, guest, data)`: refuses (with a reason) when full, or when the same `owner` + `inst` is already
  here.
- `removeGuest(save, owner, inst)`.
- `refreshGuests(save, live, now)`: `live` is what the server says is in those friends' Day Cares right now (Phase 4).
  - Guests that are no longer there leave.
  - The ones that are still there get their level updated.
  - It returns the ones that left, for one toast: "Jolteon went home to Lea".
  - Offline, nothing is refreshed, and the snapshot still breeds.

### The checks and the Egg

New state on `DayCareState`:

```ts
breedAt: number                  // when the last Egg-group check ran (ms)
dittoAt: number                  // when the last Ditto check ran (ms)
egg?: { at: number; parents: [string, string] }   // display only: "Eevee", "Ditto (Noor)"
```

`pairs(save, data)` lists every pair the checks look at:

- each of your Pokémon with everyone else at the Day Care (your other one and every guest), each pair once;
- each pair is tagged `slow` when it has a Ditto;
- guest × guest never counts: "your Pokémon do the check".

`processDayCare(save, data, now, rng): { save, laid?: Egg }` runs both clocks:

```
for each clock (Egg groups: breedHours, the non-slow pairs; Ditto: breedDittoHours, the slow pairs):
  due = floor((now − lastAt) / interval)
  if due ≥ 1:
    lastAt += due × interval            // missed checks collapse into one: one Egg waits at a time anyway
    if no Egg waits and the clock's pairs aren't empty:
      egg = { at: lastAt, parents: a random pair from that clock's list }
```

- Call it from the store at app start, on `visibilitychange` back to visible, when the Day Care page opens, and from
  one timer set to the earliest next due time (`nextCheckAt(save, data)`).
- It is idempotent: calling it twice at the same `now` changes nothing.
- When a clock has never run (a fresh or migrated save), `breedAt` and `dittoAt` start at `now`.
- `nextCheckAt` gives the next due time **of a clock that has pairs** (the soonest of the two), else the Egg-group
  clock. It is the time the widget and the yard plate show ("Egg check in 7 h 14").

### Hatching

`hatchEgg(save, data, rng, now, newId)` keeps today's rules:

- the species comes from `eggOdds` (the live region's pool, missing species × `unownedWeight`);
- the level from `hatchLevel`;
- one copy per species kept.

Changes:

- It needs `dayCare.egg`, and clears it.
- No Egg is bought any more: the `paid` path and `eggPrice` go.
- **The free first Egg stays.** While `eggClaimed` is false and no Egg waits, `processDayCare` puts one there:
  `egg = { at: now, gift: true }`. Hatching it sets `eggClaimed`. The unlock tutorial still ends with a hatch, and the
  gift takes the one Egg place until it hatches.
- **Shiny:** `rng.chance(config.dayCare.shinyChance)`. A shiny hatchling is a Pokémon of its own (the catching rule):
  - it never replaces a copy;
  - it is never held back by one;
  - so it is always kept.
- Return `shiny` in `Hatch`, for the hatching moment and the result card.

### Egg now (skip the wait)

`rushEgg(save, data, now, rng): { save, egg } | { refused: 'egg' | 'pair' | 'gold' }`:

- Refused when an Egg already waits (`egg`), when no pair can make one (`pair`), or when `gold < rushPrice`
  (`gold`).
- Otherwise it takes `rushPrice` and runs the clock the bar counts down to (`nextCheckAt`'s) **now**: that clock
  starts over from `now`, and a random pair from it leaves the Egg.
- The store hatches it right away (`hatchEgg`), so the player sees one moment: pay → the hatching → the result.
- The other clock keeps running.

## Phase 3 · Save, migration, config, admin

### Save schema (`src/save/schema.ts`)

- `dayCareSchema`:
  - `residents[].region` (optional on parse);
  - `guests` (default `[]`);
  - `breedAt`, `dittoAt` (optional);
  - `egg` (optional): `{ at, parents?: [string, string], gift?: true }`;
  - keep `eggClaimed` and `visited`.
- `regionBlockSchema` keeps `dayCare` **optional, for reading old saves only**. Nothing writes it any more.

### Migration (in `parseSave`, idempotent, no version bump needed)

1. Gather the Day Cares:
   - the top-level one belongs to `save.region` (a save from before v2 kept the live region's Day Care there);
   - each `parked[r].dayCare` belongs to `r`.
2. Tag every resident with its region (one already tagged keeps its tag).
3. Merge them into the top-level Day Care:
   - `visited` and `eggClaimed` are OR-ed;
   - `guests` is `[]`;
   - `breedAt` and `dittoAt` stay unset, so the first `processDayCare` sets them.
4. **More than `slots` residents** (two regions each had two): keep the `slots` that have stayed longest (oldest
   `since`). Send the others home to their region's Box, with their Day Care XP applied (`residentNow`) and fully
   healed. Set a `dayCareNotice` so the next screen shows one toast: "The Day Care now has room for 2: Pidgey and
   Rattata went back to your Box with their levels".
5. Delete `parked[r].dayCare`.
6. `repairBlock` and the top-level repair keep their rule: an instance is in a Box or at the Day Care, never both. Run
   the rule against the resident's own region's Box.

Old clients would strip the new fields when they load and save again. Ship this with **Admin → Reload all players**
(`force_reload`, migration 0029) right after deploy.

### Config (`src/data/config.json`, `DayCareConfig`, `DEFAULT_CONFIG`)

| Key | Default | Note |
|---|---|---|
| `unlockPokedex` | 20 | now counted across every region |
| `slots` | 2 | |
| `friendSlots` | 4 | new |
| `xpPerTick`, `tickMinutes` | 1, 10 | |
| ~~`maxXp`~~ | — | removed: Lv.100 is the only cap |
| `breedHours` | 12 | new: the Egg-group check |
| `breedDittoHours` | 24 | new: Ditto's check |
| `shinyChance` | 0.01 | new: Day Care Eggs only (the wild `shinyChance` is separate) |
| `rushPrice` | 200 | new: Egg now, in ₽ |
| ~~`eggPrice`~~ | — | removed: Eggs are bred (the first one is still free) |
| `unownedWeight`, `hatchRank`, `hatchOffset`, `hatchMinLevel` | 4, 3, 5, 5 | unchanged |

The remote `game_config` row `dayCare` may lack the new keys: make sure the loader merges `DEFAULT_CONFIG.dayCare`
under it, as `DayCareBox` already does.

### Admin (`DayCareBox`)

- Fields:
  - Opens at (species, **all regions**), Slots, **Friend slots**, XP per tick, Tick (minutes);
  - **Egg check (hours)**, **Ditto check (hours)**, **Egg now (₽)**, **Shiny chance (%)**: show it as a percentage,
    store it as 0–1;
  - Unowned weight, the three hatch numbers.
- Drop Max XP and Egg price.
- Replace the cap sentence with: "N XP a day. Residents level up to Lv.100 and never evolve here. With a compatible
  pair, about N Eggs a week (Ditto pairs: N)".
- The per-region Egg pools stay as they are.

## Phase 4 · Friends (depends on the friend list)

The friend list is being planned in another session. The Day Care needs exactly two things from it:

1. **Who my friends are:** accepted friendships, with each friend's user id, display name and avatar (the trainer
   look).
2. **What is in their Day Cares:** a new security-definer function, in the friend list's migration or in its own
   right after it:

```sql
-- What my friends have at their Day Care: read-only, accepted friends only, nothing but what the picker shows.
create or replace function friend_day_cares()
returns table (owner uuid, name text, avatar text, inst_id text, dex int, level int, xp int, since bigint, shiny boolean)
language sql stable security definer set search_path = public as $$
  select s.user_id, <friend name>, <friend avatar>,
         r->'inst'->>'id', (r->'inst'->>'dex')::int, (r->'inst'->>'level')::int, (r->'inst'->>'xp')::int,
         (r->>'since')::bigint, coalesce((r->'inst'->>'shiny')::boolean, false)
  from saves s
  join <friendships> f on <s.user_id is an accepted friend of auth.uid()>
  cross join lateral jsonb_array_elements(coalesce(s.data->'dayCare'->'residents', '[]'::jsonb)) r
$$;
revoke all on function friend_day_cares() from public, anon;
grant execute on function friend_day_cares() to authenticated;
```

- It reads the top-level Day Care only. A friend who hasn't opened v2 yet shows nothing until they do. That is fine:
  their client migrates the save on the next load.
- The client computes the current level from `level`, `xp` and `since` with the same `residentNow` the engine uses.
  The function does no game maths.
- One call when the Day Care page opens, and when the friend picker opens. Never on a timer. Cache it for the
  session.
- Feed the result to `refreshGuests`.

Until the friend list ships, build everything else: the four friend slots show as "Friends' Pokémon · with the friend
list" (disabled), and the engine and tests already handle guests.

## Phase 5 · UI

Match the lab. Every string is in `src/i18n/strings.csv`, in all ten columns.

### Home widget (`renderDayCareW` in `home.js`)

| State | Shows | Tap |
|---|---|---|
| Locked (under 20 caught, all regions) | lock, "12/20 caught", a meter, "Opens for every region" | toast "The Day Care opens at 20 Pokémon caught, in every region" |
| Residents | each of your two: icon, name, Lv, XP bar to the next level (or "Free slot · Leave a Pokémon"); then "+2 friends' Pokémon · Egg check in 7 h 14" | opens the Day Care page (the widget never acts on the Pokémon itself) |
| **Egg waiting** | **gold** frame, an "EGG!" tag, the Egg **shaking** in place of the Pokémon, "An Egg is waiting!", "Tap to hatch it" | opens the Day Care page **and starts the hatching** about 450 ms later |

### The Day Care page (`render` in `daycare.js`)

Laid out like Home, with no CONTINUE and no Areas button, and the name said once.

1. **The yard**, the size and place of Home's scene, right under the top bar:
   - a meadow with a pond, a white fence, and the Day Care cottage on the hill (orange roof, chimney, flower boxes, an
     Egg on the sign): `SCENES.daycare` and the `daycare` branch of `paintOutdoor`;
   - everyone at the Day Care roams with Home's `Mon` engine (your two and the guests);
   - pairs **seek each other out** (`likes`: 75 % of their visits go to a compatible Pokémon) and send hearts;
   - no songs (`quiet`);
   - tapping a Pokémon makes it hop with a heart;
   - the plate is the page's only title: the back arrow, "Day Care", and under it "Every region · 4 Pokémon here";
   - with an Egg waiting, a **nest with the Egg shaking** sits in the yard; tapping it hatches.
2. Under the yard, one of two:
   - **Egg card** (while one waits): gold, the Egg shaking, "An Egg is waiting!", "Eevee and Ditto (Noor) left it. It
     hatches into a young Pokémon, often one you don't have yet." (the gift: "A gift for your first visit"),
     **Hatch it**;
   - otherwise the **Egg-now bar**: "Next Egg check", "in 7 h 14" large, "3 pairs can leave one" (or "No pair can make
     an Egg yet"), and a gold **EGG NOW** button with the coin and "₽200". It is disabled without a pair. Short of
     gold, the price turns red and a tap says "Need ₽80 more".
3. **Your Pokémon · 2/2**: "They gain 1 XP every 10 min, even while you're away, all the way to Lv.100." **Two
   columns**, one card per slot:
   - a 4 px band across the top in the slot's colour (pink `#ff5a7a` for the first, blue `#5b8def` for the second);
   - the head: that colour's heart, "Yours", and a green tag with the levels gained here ("+2 Lv", or "New");
   - the animated sprite on a pale tile;
   - the name and Lv, an XP bar to the next level, "To Lv.25 · came at Lv.22" (at Lv.100: "Lv.100: it can't grow
     more");
   - "Pairs with" and the partners' names ("Pairs with all but legendaries" for a Ditto, "No partner here yet");
   - **Take back** at the bottom, so both cards' buttons line up.

   An empty slot is a dashed card: "+", "Leave a Pokémon", "From your team or your Box".
4. **Friends' Pokémon · 2/4**: "Invite a Pokémon from a friend's Day Care to make Eggs with yours. It stays theirs:
   nothing changes for your friend." Two columns, the same card:
   - a grey band, and the head: the owner's trainer head and "Lea's";
   - the animated sprite on a pale tile, the name and Lv;
   - "Pairs with" and your Pokémon it pairs with, each with its heart ("♥ Eevee ♥ Dratini"), or "No match with
     yours";
   - **Send back** at the bottom.

   An empty slot is a dashed card: "+", "Add from a friend", "A Pokémon from their Day Care".
5. **Egg checks:**
   - the title "Egg checks" (the countdown is already in the bar above);
   - the rule ("Every 12 h, each of your Pokémon checks everyone here… Ditto pairs with everyone but legendaries,
     slower: its pairs are checked every 24 h. One Egg waits at a time.");
   - the two clocks ("Egg groups · every 12 h · next in 7 h 14", "Ditto · every 24 h · next in 19 h 14");
   - every pair: the heart, "Eevee + Jolteon Lea's", and a tag with the shared group and its pace ("Field · every
     12 h", in purple "Ditto · every 24 h");
   - or "No pair can make an Egg yet…".

### The pickers (the shared bottom sheet)

- **Add a friend's Pokémon:**
  - a search (friend or Pokémon) and a **Compatible only** toggle;
  - grouped by friend (look, name, "2 Pokémon at the Day Care"), the friends with the best match first;
  - each row: the icon, name, Lv and Egg groups, and a tag:
    - **"Compatible with Eevee and Dratini"**, with each one's coloured heart;
    - Ditto: "Compatible with all but legendaries · 24 h";
    - "No match with yours";
    - "Invited" (disabled).
- **Leave which Pokémon?**:
  - search; those that pair with someone already here come first, then the team (TEAM tag; your last team member is
    disabled), then the Box;
  - the tag is "Compatible with Jolteon", in the colour of the slot being filled.

### The hatching

- The timeline from docs/14 Phase 5 (`hatchAnim`), with the new `shiny` beat: the shiny sprite, two rings of stars,
  a chime and "A shiny Eevee hatched from the Egg!".
- Skip, and Escape skips to the end.
- The result card: NEW, ✦ SHINY, and where it went.

### Remove

- The Buy / ₽50 Egg UI and "Another · ₽50" (the free first Egg keeps its card, as the gift).
- "full in 18 h 14" and READY: no cap means no "full".

## Phase 6 · Tests (`tests/engine/daycare.test.ts`, plus `tests/save/*`)

- **Compatibility table:**

  | Pair | Compatible? | Why |
  |---|---|---|
  | Eevee × Jolteon | ✓ | Field |
  | Eevee × Dratini | ✗ | no shared group |
  | Dratini × Gyarados | ✓ | Dragon |
  | Ditto × Snorlax | ✓ | Ditto, slow |
  | Ditto × Magnemite | ✓ | Ditto, slow |
  | Magnemite × Voltorb | ✗ | genderless |
  | Tauros × Tauros | ✗ | both male-only |
  | Tauros × Miltank | ✓ | male × female, Field |
  | Chansey × Blissey | ✗ | both female-only (both Fairy) |
  | Pichu × Pikachu | ✗ | Undiscovered |
  | Ditto × Pichu | ✓ | Ditto, slow (babies aren't legendary) |
  | Ditto × Ditto | ✓ | Ditto, slow |
  | Ditto × Mewtwo | ✗ | legendary |
  | Ditto × Celebi | ✗ | mythical |
- **XP:** XP beyond the old 200 keeps levelling; it stops at Lv.100; `nextDayCareTick` is null at Lv.100.
- **Checks:**
  - nothing before 12 h; one Egg at 12 h with a pair;
  - none without a pair, but the clock still advances;
  - a waiting Egg blocks the next one;
  - Ditto pairs only on the 24 h clock and plain pairs only on the 12 h one;
  - 3 days away gives one Egg, not six;
  - idempotent;
  - guest × guest never breeds.
- **Hatch:** shiny when `rng.chance` hits (a stub rng), and the shiny is always kept; the Egg is cleared; the species
  comes from the live region's pool.
- **The gift:** a save that never claimed the free Egg gets one when the Day Care opens; hatching it sets
  `eggClaimed`; a save that already claimed it never gets another.
- **Egg now:** refused with an Egg waiting, without a pair, or short of gold (nothing changes); otherwise ₽200 less,
  an Egg from the next clock's pairs, that clock restarted at `now`, the other untouched.
- **Regions:**
  - leaving in Kanto, switching to Johto: the resident is still there;
  - taking it back in Johto puts it in Kanto's parked Box;
  - opening at 20 distinct species across two regions (12 + 8 different).
- **Migration:**
  - two regions with two residents each → two kept (the oldest), two home with their levels, a notice;
  - tags are right;
  - parked `dayCare` is gone;
  - `parseSave` twice gives the same save.
- **Guests:** inviting is capped at `friendSlots`, no duplicates; `refreshGuests` drops the missing ones and updates
  levels.
- **e2e** (`pnpm e2e`):
  - widget → page;
  - the gold widget opens into the hatching;
  - Egg now pays and hatches;
  - leave and take back;
  - the friend slots are disabled before Phase 4.

## Order of work and commits

1. Data (Phase 1).
2. Engine + save + migration + config/admin (Phases 2–3), with the tests: one commit, the game still plays.
3. UI without friends (Phase 5, the friend slots disabled).
4. Friends (Phase 4) once the friend list has shipped, then switch the slots on.

Each ends green: `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm e2e`.

## Decisions

Settled by the human:

- **D1 · Eggs:** the free first Egg stays (the gift); the ₽50 Egg goes.
- **D2 · Ditto** pairs with everyone **but legendaries and mythicals**. Babies and another Ditto still pair with it.
- **Egg now** costs ₽200 (admin) and hatches right away.

Still open (ask the human; the defaults are what the lab shows):

- **D3 · One Egg waits at a time.** Checks while an Egg waits leave nothing. Default yes.
- **D4 · Who checks.** Your two with everyone; guest × guest pairs don't count. Default yes, as asked ("the player's
  Pokémon do a compatibility check with all the Pokémon in the Day Care").
- **D5 · A guest leaves** when its owner takes it back, or when the friendship ends. It is seen at the next refresh.
  Default yes.
- **D6 · Leaving and taking back across regions.**
  - Default: leave from the live region only; a Pokémon goes back to the Box of the region it came from.
  - The alternative, letting a Pokémon move between regions this way, breaks "regions never pool".
- **D7 · Migration overflow.** Default: keep the two that have stayed longest, send the rest home with their levels.
- **D8 · Unlock count.** Default: 20 distinct species across every region's Pokédex.
- **D9 · Two clocks** (12 h for Egg groups, 24 h for Ditto), rather than a clock per pair. Default: two clocks.
- **D10 · The Egg's species** comes from the live region's pool, as today, wherever the parents came from. Default yes.
- **D11 · Egg now restarts the clock it skips.** Default: yes, so ₽200 buys the check early, not an extra one.
