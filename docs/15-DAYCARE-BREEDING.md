# 15 · Day Care v2: one Day Care for every region, friends' Pokémon, breeding

> **For the human:** start a Claude Code session on this repo and paste:
> *"Run `git fetch origin claude/modest-knuth-ph81n4`, read `docs/15-DAYCARE-BREEDING.md` from it
> (`git show origin/claude/modest-knuth-ph81n4:docs/15-DAYCARE-BREEDING.md`) and carry it out, phase by phase. Start
> with its Branches section, then Phase 0."*
> The rest of this file is written to that session.

---

## Your task

Rebuild the Pokémon Day Care to the rules below, in the real game, on top of the Daybreak port. Every decision is
settled (end of this file); don't ask again. If something isn't covered, do what the lab does and say so in the
commit message.

| | Today (after the Daybreak port) | v2 |
|---|---|---|
| Where | One Day Care **per region**: `dayCare` lives in the region block and is parked with it (`liveBlock`/`withBlock` in `src/engine/regions.ts`) | **One Day Care for every region.** It doesn't reset when a region opens, and the same one shows in every region |
| Opens | 20 species in the live region's Pokédex | 20 species caught, counted **across every region**; once open, open for good |
| Your Pokémon | 2 slots | 2 slots |
| XP | +1 every 10 min, **200 XP cap per stay**, READY when full | +1 every 10 min, **no cap but Lv.100** |
| Friends | — | **4 friend slots**: invite a Pokémon that is sitting in a friend's Day Care. It visits; nothing changes for the friend |
| Eggs | Free once, then bought for ₽50 | **Bred.** Every 12 h each of your Pokémon checks everyone at the Day Care; a compatible pair leaves an Egg. **Ditto pairs with everyone but legendaries, on a slower check: every 24 h.** The free first Egg stays; the ₽50 Egg goes |
| Egg now | — | **Skip the wait for ₽200:** the next check runs now, a pair leaves an Egg, and it hatches right away |
| Compatibility | — | The **real Egg groups** (data from Pokémon Showdown) |
| What hatches | Random, missing species ×4, from the region's pool | Unchanged: random, not the parents' species. **When it isn't kept** (you already own one at its level or higher), **the Day Care couple gives ₽10** |
| Shiny | — | Day Care Eggs have their **own shiny odds**, 1 % by default |
| Home widget | Residents with XP to the cap | Your two with XP to the next level; with an Egg waiting it turns **gold** with an Egg shaking, and a tap opens the Day Care **straight into the hatching** |

Every number above (12 h, 24 h, ₽200, ₽10, 1 %, 20, 2, 4) is an admin setting.

**The mockup** is the Visual Lab's Home tab: https://claude.ai/artifact/EtDYmxgAmoFifQWSjtk3nD (source
`design/visual-lab/` on `claude/modest-knuth-ph81n4`).
- Open the Day Care widget.
- The preview bar above the phone has **Run the Day Care's 12 h check** and **Run Ditto's 24 h check**.
- Its three saves show the widget's states: Mid-game shows residents; Versus opens and League beaten show an Egg
  waiting and a Ditto visiting.

## Branches

- **Work from `origin/ccr-43d48ce2-umtc1l`**, the Daybreak port: Home, the restyled `DayCareScreen`, the scene and
  roaming engine, the hatch timeline. Check `main` first: if it already has `src/screens/home/Widgets.tsx`, the port
  is merged, so start from `main` instead.
- **Merge `origin/claude/modest-knuth-ph81n4`** into your branch first. It brings this doc and the current lab, and
  touches nothing but `design/visual-lab/` and `docs/`. It merges cleanly.
- **The friend list** is `origin/ccr-236e82f4-kl0h33` (docs/16-FRIENDS-PLAN.md, migration `0033_friends.sql`), still
  in progress. Phases 1–3 and 5 don't need it. Phase 4 does: merge it (or `main`, once it has landed) before you start
  Phase 4.

## Phase 0 · Read and run before writing

1. Run the lab (`node design/visual-lab/serve.mjs` → http://localhost:4173), Home tab, at 390×844 and 1280×900:
   - open the Day Care from its widget;
   - invite a friend's Pokémon (try **Compatible only** and the search);
   - run both checks, then hatch from the widget, from the gold card and by tapping the Egg in the yard;
   - press **Egg now**, with and without enough gold (set `HOME.api.SAVE.gold = 120` in the console);
   - take one of yours back and leave another;
   - in the Animations tab, play Egg hatching with **Shiny**.
2. Read the lab side:
   - `design/visual-lab/daycare.js`, all of it: `compatible()`, `pairs()`, `nextCheck()`, the cards, `rushBar`/`rush`,
     the pickers, `runCheck`, `hatch`;
   - in `home.js`: `renderDayCareW`, `makeYard`, `SCENES.daycare`, the `daycare` branch of `paintOutdoor`, the `likes`
     and `quiet` options of `Mon`, and the `DC` settings;
   - in `index.html`: the CSS blocks `/* Day Care */` and `/* Day Care v2 … */`;
   - in `anims.js`: the `shiny` option of `hatchAnim` (`T_SHINY`, the two star rings, the chime).
3. Read the game side, on your branch:
   - engine: `src/engine/daycare.ts` (the port added `dayCareFullAt`), `src/engine/regions.ts` (`liveBlock`,
     `withBlock`, `newRegionBlock`), `src/engine/types.ts` (`DayCareConfig`, `DayCareState`, `DayCareResident`,
     `RegionSave`), `src/engine/catching.ts` (the shiny rule: a shiny always joins as its own Pokémon);
   - save: `src/save/schema.ts` (`dayCareSchema`, `regionBlockSchema`, `parseSave`, `repairBlock`);
   - store: `src/store/actions.ts` (`leaveAtDayCare`, `pickUpFromDayCare`, `hatchDayCareEgg`);
   - screens: `src/screens/DayCareScreen.tsx` (`Resident`, `LeaveSheet`, `HatchMoment`, `EggCard`),
     `src/screens/home/Widgets.tsx` (`DayCareWidget`), `src/screens/home/scene.ts` (`SCENES`, `paintOutdoor`),
     `src/screens/home/team.ts` (`Mon`, `Herd`), `src/screens/home/SceneStage.tsx`, `src/components/DayCareTutorial.tsx`;
   - fx: `src/fx/timelines/moments.ts` (`hatchTimeline`);
   - admin: `src/admin/sections/ConfigSection.tsx` (`DayCareBox`), `src/data/config.json`;
   - tests: `tests/engine/daycare.test.ts`, `tests/daybreak.test.ts`, `e2e/daycare.spec.ts`, `e2e/home.spec.ts`.
4. Write a short plan back (the files each phase changes), then start Phase 1.

Rules that hold throughout (as in docs/14):
- The engine stays pure: no `Date.now()`, no `Math.random()`, no network in `src/engine/`. Time, randomness and
  friends' data come in as arguments.
- Every string goes in `src/i18n/strings.csv`, in all ten languages, with no empty cell. Run `pnpm i18n:fonts` after
  editing a CJK column.
- Each phase ends green (`pnpm lint`, `pnpm build`, `pnpm test`, `pnpm e2e`) and gets its own commit.

## Phase 1 · Data: Egg groups, genders, legendaries

The game has no Egg groups yet. Add them as static data, the way `showdown-sprites.json` is static: they are canon,
not something an admin edits.

- New script `scripts/egg-groups.ts` (`pnpm egg-groups`). It reads Showdown's `pokedex.json`
  (https://play.pokemonshowdown.com/data/pokedex.json), cached under `scripts/.cache/showdown` like
  `showdown-sprites.ts`. It writes `src/data/egg-groups.json`, keyed by dex for every species in `pokemon.json`:
  `{ "133": { "g": ["Field"] }, "132": { "g": ["Ditto"] }, "81": { "g": ["Mineral"], "s": "N" }, "128": { "g": ["Field"], "s": "M" }, "150": { "g": ["Undiscovered"], "s": "N", "l": 1 } }`.
  - `g` is Showdown's `eggGroups` as is ("Water 1", "Human-Like", "Undiscovered"…).
  - `s` is Showdown's `gender`, present only when the species is fixed: `"M"`, `"F"` or `"N"` (genderless).
  - `l: 1` marks legendaries and mythicals: Showdown's `tags` holds `Sub-Legendary`, `Restricted Legendary` or
    `Mythical` (94 species).
  - Use the base species' entry. Forms share their base's groups in every case Pokédice has.
- Load it in `src/engine/data.ts` into `GameData` as
  `eggGroups: Record<number, { g: string[]; s?: 'M' | 'F' | 'N'; l?: 1 }>`. It is about 30 KB raw, 5 KB gzipped.
- Test:
  - every dex in `pokemon.json` has an entry;
  - Ditto (132) is `["Ditto"]` and Eevee (133) is `["Field"]`;
  - Magnemite (81) is genderless and Tauros (128) male-only;
  - Mewtwo (150), Celebi (251) and Manaphy (490) are legendary.

## Phase 2 · Engine

All in `src/engine/daycare.ts`, with types in `types.ts`. Split it into `daycare.ts` + `breeding.ts` if it grows past
~350 lines.

### Compatibility

```ts
export const isDitto = (data: GameData, dex: number) => (data.eggGroups[dex]?.g ?? []).includes('Ditto')
export const isLegendary = (data: GameData, dex: number) => data.eggGroups[dex]?.l === 1
/** A pair with a Ditto in it is checked on the slower clock (breedDittoHours). */
export const slowPair = (data: GameData, a: number, b: number) => isDitto(data, a) || isDitto(data, b)
export function compatible(data: GameData, a: number, b: number): boolean
export function sharedGroups(data: GameData, a: number, b: number): string[] // for the UI: "Field", "Dragon"
```

The rules, in this order (as `compatible()` in `daycare.js`):

1. Either one is a Ditto → **true, unless the other is legendary or mythical.** Babies and another Ditto pair with it.
2. Either one is in `Undiscovered` → false.
3. Either one is genderless (`s: 'N'`) → false (only Ditto breeds with them).
4. Both have the same fixed gender (two male-only, or two female-only) → false. Pokédice has no genders: this is the
   closest to the games without them.
5. Otherwise → true when they share an Egg group.

So **a legendary never pairs with anyone.** 92 of the 94 are Undiscovered (rule 2). Manaphy and Phione are Water 1 /
Fairy but genderless (rule 3), and rule 1 refuses them to Ditto.

### XP: Lv.100 is the only cap

- `dayCareXp` loses `maxXp`: `ticks × xpPerTick`, uncapped.
- `residentNow` already stops at `config.maxLevel` through `gainXp`.
- `nextDayCareTick` returns null once the resident is at `maxLevel`.
- Delete `dayCareFullAt`: nothing is ever "full" now.
- Add `dayCareLevelProgress(res, now, data)`: `{ level, xp, toNext }`, for the bar to the next level.

### One Day Care for every region

- `DayCareState` leaves `RegionSave` and stays at the top level of `SaveData`, whichever region is live.
  - `liveBlock` and `withBlock` stop carrying it.
  - `newRegionBlock` never creates one.
- Each resident remembers where it came from: `DayCareResident { inst, since, region: RegionId }`.
  - **Leaving** a Pokémon takes it from the live region's team or Box, as today.
  - **Taking back** puts it in **that region's** Box: the live one through the top level, a parked one through
    `save.parked[region]`. It joins the team only when its region is live and the team has room.
  - The toast says where: "Eevee is back in your Kanto Box".
- `isDayCareOpen(save, data)` counts the distinct species across the live Pokédex and every parked one, against
  `unlockPokedex`. Pokédexes only grow, so once open, it stays open.
- `dayCareTutorialDue` reads the shared state, so it fires once ever, not once per region.

### Friends' Pokémon (guests)

A guest is a **snapshot** in your save of a Pokémon sitting in a friend's Day Care. Your save never holds the
friend's instance and never writes to their save.

```ts
export interface DayCareGuest {
  owner: string      // the friend's user id
  ownerName: string  // for "Lea's", as it was when invited
  ownerAvatar: string
  inst: string       // the friend's instance id, to check it is still there
  dex: number
  level: number      // its level when last refreshed
  shiny?: boolean
  addedAt: number
}
```

- `DayCareState.guests: DayCareGuest[]` holds at most `friendSlots` (4), with no empty entries: the UI draws the
  empty slots.
- `inviteGuest(save, guest, data)` refuses, with a reason, when the slots are full or the same `owner` + `inst` is
  already here.
- `removeGuest(save, owner, inst)`.
- `refreshGuests(save, live, now)` takes `live`, what the server says is in those friends' Day Cares now (Phase 4):
  - the guests no longer there leave;
  - the others get their level updated;
  - it returns the ones that left, for one toast: "Jolteon went home to Lea".

  Offline, nothing is refreshed, and the snapshot still breeds.

### The checks and the Egg

New state on `DayCareState`:

```ts
breedAt?: number   // when the last Egg-group check ran (ms)
dittoAt?: number   // when the last Ditto check ran (ms)
egg?: { at: number; parents?: [string, string]; gift?: true }   // parents for display: "Eevee", "Ditto (Noor)"
```

`pairs(save, data)` lists every pair the checks look at:
- each of your Pokémon with everyone else at the Day Care (your other one and every guest), each pair once;
- each pair is tagged `slow` when it has a Ditto;
- a guest × guest pair never counts: your Pokémon do the checking.

`processDayCare(save, data, now, rng): { save, laid?: true }` runs both clocks:

```
gift: if the Day Care is open, !eggClaimed and no Egg waits → egg = { at: now, gift: true }
for each clock (Egg groups: breedHours, the plain pairs; Ditto: breedDittoHours, the slow pairs):
  lastAt ??= now
  due = floor((now − lastAt) / interval)
  if due ≥ 1:
    lastAt += due × interval          // missed checks collapse into one: one Egg waits at a time anyway
    if no Egg waits and this clock's pairs aren't empty:
      egg = { at: lastAt, parents: a random pair from this clock's list }
```

- The store calls it:
  - at app start;
  - on `visibilitychange` back to visible;
  - when the Day Care page opens;
  - from one timer set to `nextCheckAt(save, data)`.
- It is idempotent: twice at the same `now` changes nothing.
- `nextCheckAt` is the next due time of a clock that has pairs, the sooner of the two; with no pairs, the Egg-group
  clock. The widget and the Egg-now bar show it ("in 7 h 14").

### Egg now (skip the wait)

`rushEgg(save, data, now, rng): { save } | { refused: 'egg' | 'pair' | 'gold' }`:

- It refuses when an Egg already waits (`egg`), when no pair can make one (`pair`), or when `gold < rushPrice`
  (`gold`).
- Otherwise it takes `rushPrice` and runs **now** the clock that `nextCheckAt` points to:
  - that clock starts over from `now`;
  - a random pair from that clock leaves the Egg;
  - the other clock keeps running.
- The store hatches the Egg at once (`hatchEgg`). The player sees one moment: pay, the hatching, the result.

### Hatching

`hatchEgg(save, data, rng, now, newId)` keeps today's rules:
- the species comes from `eggOdds` (the live region's pool, missing species × `unownedWeight`);
- the level comes from `hatchLevel`;
- one copy per species is kept.

What changes:
- It needs `dayCare.egg` and clears it. A gift Egg also sets `eggClaimed`.
- Nothing is paid: the `opts.free` / `paid` paths and `eggPrice` go.
- **Shiny:** `rng.chance(config.dayCare.shinyChance)`. A shiny hatchling is a Pokémon of its own (the catching rule):
  it never replaces a copy, nothing holds it back, so it is always kept.
- **Not kept, a little money:** when the hatchling isn't kept (`kept` false: you own a plain copy at its level or
  higher), the Day Care couple gives `notKeptGold` (₽10): `save.gold += notKeptGold`.
- `Hatch` returns `shiny` and `gold` (the ₽ given, 0 when kept), for the moment and the result card.

## Phase 3 · Save, migration, config, admin

### Save schema (`src/save/schema.ts`)

- `dayCareSchema` gains:
  - `residents[].region` (optional on parse);
  - `guests` (default `[]`);
  - `breedAt` and `dittoAt` (optional);
  - `egg` (optional).

  `eggClaimed` and `visited` stay.
- `regionBlockSchema` keeps `dayCare` optional, **only for reading old saves**. Nothing writes it any more.

### Migration (in `parseSave`, idempotent, no version bump)

1. Gather the Day Cares:
   - a top-level one without tagged residents belongs to `save.region` (before v2, the live region's Day Care sat
     there);
   - each `parked[r].dayCare` belongs to `r`.
2. Tag every resident with its region. A resident already tagged keeps its tag.
3. Merge them into the top-level Day Care:
   - `visited` and `eggClaimed` are OR-ed;
   - `guests` starts as `[]`;
   - `breedAt` and `dittoAt` stay unset, so the first `processDayCare` sets them.
4. **More than `slots` residents** (two regions each had two): keep the `slots` that have stayed longest (oldest
   `since`). Send the others home to their region's Box, with their Day Care XP applied (`residentNow`) and fully
   healed. Set `dayCareNotice`, and the next screen shows one toast: "The Day Care now has room for 2: Pidgey and
   Rattata went back to your Box with their levels".
5. Delete `parked[r].dayCare`.
6. Repair: an instance is in a Box or at the Day Care, never both. Check each resident against its own region's Box.

Old clients would strip the new fields when they load and save again. After deploying, use **Admin → Reload all
players** (`force_reload`, migration 0029).

### Config (`src/data/config.json`, `DayCareConfig`, the engine defaults)

| Key | Default | Note |
|---|---|---|
| `unlockPokedex` | 20 | now counted across every region |
| `slots` | 2 | |
| `friendSlots` | 4 | new |
| `xpPerTick`, `tickMinutes` | 1, 10 | |
| ~~`maxXp`~~ | — | removed: Lv.100 is the only cap |
| `breedHours` | 12 | new: the Egg-group check |
| `breedDittoHours` | 24 | new: Ditto's check |
| `rushPrice` | 200 | new: Egg now, in ₽ |
| `notKeptGold` | 10 | new: ₽ from the Day Care couple when a hatchling isn't kept |
| `shinyChance` | 0.01 | new: Day Care Eggs only (the wild `shinyChance` is separate) |
| ~~`eggPrice`~~ | — | removed |
| `unownedWeight`, `hatchRank`, `hatchOffset`, `hatchMinLevel` | 4, 3, 5, 5 | unchanged |

The live `game_config` row `dayCare` lacks the new keys: make sure the loader merges the defaults under it, as
`DayCareBox` already does.

### Admin (`DayCareBox`)

- Fields:
  - Opens at (species, **all regions**), Slots, **Friend slots**;
  - XP per tick, Tick (minutes);
  - **Egg check (hours)**, **Ditto check (hours)**, **Egg now (₽)**, **Not kept (₽)**;
  - **Shiny chance (%)**, shown as a percentage and stored as 0–1;
  - Unowned weight and the three hatch numbers.
- Drop Max XP and Egg price.
- The summary line becomes: "N XP a day. Residents level up to Lv.100 and never evolve here. With a compatible pair,
  about N Eggs a week (Ditto pairs: N)".
- The per-region Egg pools stay as they are.

## Phase 4 · Friends (after the friend list's 0033)

Merge the friend list first (see Branches). Its design is in docs/16:
- friendships are mutual and instant (`friendships`, `friend_ids_of(uid)`);
- what other players see of you lives on **player cards**, written by a trigger on `saves` once per cloud push
  (`player_card_write`);
- no Realtime;
- the client is `src/lib/friends.ts` with the `useFriends` store.

Follow the same pattern: friends read cards, never saves.

### Migration `supabase/migrations/0034_day_care.sql`

1. **Cards per region, fixed for the shared Day Care.** `player_card_write` (0033) reads `dayCare.residents` from
   each region block, for `max_level` and `shinies`. After Phase 3, the Day Care sits at the top level, so every
   resident would count for the live region. Redefine the function: read `p_data -> 'dayCare' -> 'residents'` once,
   and count each resident for `coalesce(r ->> 'region', live)`. Ship this with Phase 3 if 0033 is already live.
2. **What the friend picker needs**, on the card: `alter table player_cards add column if not exists day_care jsonb
   not null default '[]'`. `player_card_write` fills it with
   `[{ inst, dex, level, xp, since, shiny }]` from the top-level residents. Use the same 2-entry limit as the slots,
   and a `pg_column_size` check like `player_card_regions_small`.
3. **The read:**

   ```sql
   -- My friends' Day Cares: friends only, from their cards (no save is read).
   create or replace function friend_day_cares()
   returns table (owner uuid, name text, avatar text, day_care jsonb)
   language sql stable security definer set search_path = public as $$
     select c.user_id, c.name, c.avatar, c.day_care
     from friend_ids_of(auth.uid()) f
     join player_cards c on c.user_id = f.id
     where jsonb_array_length(c.day_care) > 0
   $$;
   revoke all on function friend_day_cares() from public, anon;
   grant execute on function friend_day_cares() to authenticated;
   ```

4. The same in `0016_regions.sql`, the way 0033 did, so that re-running `supabase/seed.sql` keeps it. Then
   `pnpm seed-sql`.

### Client

- `src/lib/friends.ts`: `fetchFriendDayCares()` parses the rows in the `parseLeaderboard` style (a default for every
  field, the look through `avatarOf`).
- The current level comes from `level`, `xp` and `since` through the engine's `residentNow`: the SQL does no game
  maths.
- Call it when the Day Care page opens and when the friend picker opens: at most once a minute, never on a timer.
  Feed the result to `refreshGuests`.
- A database without 0034 returns PGRST202: the friend slots then say "Friends' Day Cares aren't set up on this
  server yet" (the `leaderboardError` pattern).
- Guests (not signed in): the friend slots show the friend list's connect prompt.

Until this phase, the four friend slots are drawn disabled ("Friends' Pokémon · with the friend list"). The engine
and its tests already handle guests.

## Phase 5 · UI

Match the lab, at 390 and at desktop width. Restyle the port's `DayCareScreen` and `DayCareWidget`; don't start over.

### Home widget (`DayCareWidget`, the lab's `renderDayCareW`)

| State | Shows | Tap |
|---|---|---|
| Locked (under 20 caught, all regions) | the lock, "12/20 caught", a meter, "Opens for every region" | toast "The Day Care opens at 20 Pokémon caught, in every region" |
| Residents | each of your two: icon, name, Lv, an XP bar to the next level (or "Free slot · Leave a Pokémon"); then "+2 friends' Pokémon · Egg check in 7 h 14" | opens the Day Care page; the widget never acts on the Pokémon |
| **Egg waiting** | the **gold** frame, an "EGG!" tag, the Egg **shaking** in place of the Pokémon, "An Egg is waiting!", "Tap to hatch it" | opens the Day Care page **and starts the hatching** about 450 ms later |

### The Day Care page

Laid out like Home, with no CONTINUE and no Areas button. The name shows **once**.

1. **The yard**, the size and place of Home's scene, right under the top bar (`SceneStage`):
   - the scene: a meadow with a pond, a white fence, and the Day Care cottage on the hill (orange roof, chimney,
     flower boxes, an Egg on the sign). Port `SCENES.daycare` and the `daycare` branch of `paintOutdoor` into
     `src/screens/home/scene.ts`.
   - everyone at the Day Care roams with `Herd`/`Mon`: your two and the guests.
   - pairs **seek each other out**: a `likes` list per Pokémon, and 75 % of its visits go to a compatible one. They
     send hearts, and nobody sings (`quiet`).
   - tapping a Pokémon makes it hop with a heart.
   - the plate is the page's only title: the back arrow, "Day Care", and under it "Every region · 4 Pokémon here".
   - with an Egg waiting, a **nest with the Egg shaking** sits in the yard; tapping it hatches.
2. **Under the yard**, one of two:
   - the **Egg card**, while one waits:
     - gold, the Egg shaking, "An Egg is waiting!";
     - "Eevee and Ditto (Noor) left it. It hatches into a young Pokémon, often one you don't have yet."; the gift says
       "A gift for your first visit" instead;
     - **Hatch it**.
   - otherwise the **Egg-now bar**:
     - "Next Egg check", "in 7 h 14" in large type, "3 pairs can leave one" (or "No pair can make an Egg yet");
     - a gold **EGG NOW** button with the coin and "₽200";
     - disabled without a pair; short of gold, the price turns red and a tap says "Need ₽80 more".
3. **Your Pokémon · 2/2**: "They gain 1 XP every 10 min, even while you're away, all the way to Lv.100." **Two
   columns**, one card per slot:
   - a 4 px band across the top in the slot's colour: pink `#ff5a7a` for the first, blue `#5b8def` for the second;
   - the head: that colour's heart, "Yours", and a green tag with the levels gained here ("+2 Lv", or "New");
   - the animated sprite on a pale tile;
   - the name and Lv, an XP bar to the next level, "To Lv.25 · came at Lv.22" (at Lv.100: "Lv.100: it can't grow
     more");
   - "Pairs with" and the partners' names ("Pairs with all but legendaries" for a Ditto, "No partner here yet");
   - **Take back** at the bottom, so both cards' buttons line up.

   An empty slot is a dashed card: "+", "Leave a Pokémon", "From your team or your Box".
4. **Friends' Pokémon · 2/4**: "Invite a Pokémon from a friend's Day Care to make Eggs with yours. It stays theirs:
   nothing changes for your friend." Two columns, with the same card:
   - a grey band, then the head: the owner's trainer head and "Lea's";
   - the animated sprite on a pale tile, the name and Lv;
   - "Pairs with" and your Pokémon it pairs with, each with its heart ("♥ Eevee ♥ Dratini"), or "No match with
     yours";
   - **Send back** at the bottom.

   An empty slot is a dashed card: "+", "Add from a friend", "A Pokémon from their Day Care".
5. **Egg checks**:
   - the title "Egg checks";
   - the rule: "Every 12 h, each of your Pokémon checks everyone here: a pair from the same Egg group leaves an Egg.
     Ditto pairs with everyone but legendaries, slower: its pairs are checked every 24 h. One Egg waits at a time.";
   - the two clocks: "Egg groups · every 12 h · next in 7 h 14" and "Ditto · every 24 h · next in 19 h 14";
   - every pair: the heart, "Eevee + Jolteon Lea's", and a tag with the shared group and its pace ("Field · every
     12 h", or "Ditto · every 24 h" in purple);
   - or "No pair can make an Egg yet. Invite a friend's Pokémon from the same Egg group, or a Ditto: the picker shows
     which."

### The pickers (the shared bottom sheet)

- **Add a friend's Pokémon:**
  - a search (friend or Pokémon) and a **Compatible only** toggle;
  - grouped by friend (look, name, "2 Pokémon at the Day Care"), the best matches first;
  - each row: the icon, name, Lv and Egg groups, and a tag:
    - **"Compatible with Eevee and Dratini"**, with each one's coloured heart;
    - for a Ditto, "Compatible with all but legendaries · 24 h";
    - "No match with yours";
    - "Invited" (disabled).
- **Leave which Pokémon?**:
  - search;
  - those that pair with someone already here come first, then the team (TEAM tag; your last team member is
    disabled), then the Box;
  - the tag is "Compatible with Jolteon", in the colour of the slot being filled.

### The hatching

- `hatchTimeline` gains `shiny?: boolean`, as `hatchAnim` in the lab:
  - the shiny sprite;
  - just after the reveal (the lab's `T_SHINY`, 0.35 s before its `T_HATCHED`) and 0.25 s later, two rings of star
    particles;
  - a two-tone chime;
  - the line "A shiny Eevee hatched from the Egg!".
- Skip, and Escape skips to the end.
- The result card: NEW, ✦ SHINY, and where it went. When it isn't kept: "You already have a stronger Paras: the
  Day Care couple will look after this one, and they give you ₽10 for your trouble." The money pill in the header
  bumps.

### Remove

- The Buy / ₽50 Egg UI and "Another · ₽50". The free first Egg keeps its card, as the gift.
- "full in 18 h 14" and READY: with no cap, nothing is ever full.

## Phase 6 · Tests

`tests/engine/daycare.test.ts`, `tests/save/*`, the e2e specs.

- **Compatibility table:**

  | Pair | Compatible? | Why |
  |---|---|---|
  | Eevee × Jolteon | ✓ | Field |
  | Eevee × Dratini | ✗ | no shared group |
  | Dratini × Gyarados | ✓ | Dragon |
  | Ditto × Snorlax | ✓ | Ditto, slow |
  | Ditto × Magnemite | ✓ | Ditto, slow |
  | Ditto × Pichu | ✓ | Ditto, slow (babies aren't legendary) |
  | Ditto × Ditto | ✓ | Ditto, slow |
  | Ditto × Mewtwo | ✗ | legendary |
  | Ditto × Celebi | ✗ | mythical |
  | Manaphy × Ditto | ✗ | mythical |
  | Manaphy × Lapras | ✗ | genderless (shares Water 1) |
  | Magnemite × Voltorb | ✗ | genderless |
  | Tauros × Tauros | ✗ | both male-only |
  | Tauros × Miltank | ✓ | male × female, Field |
  | Chansey × Blissey | ✗ | both female-only (both Fairy) |
  | Pichu × Pikachu | ✗ | Undiscovered |
- **XP:** XP past the old 200 keeps levelling; it stops at Lv.100; `nextDayCareTick` is null at Lv.100.
- **Checks:**
  - nothing before 12 h; one Egg at 12 h with a pair;
  - none without a pair, but the clock still advances;
  - a waiting Egg blocks the next one;
  - Ditto pairs only on the 24 h clock, plain pairs only on the 12 h one;
  - 3 days away give one Egg, not six;
  - idempotent;
  - guest × guest never breeds.
- **Egg now:**
  - refused with an Egg waiting, without a pair, or short of gold, and nothing changes;
  - otherwise ₽200 less, an Egg from the next clock's pairs, that clock restarted at `now`, the other untouched.
- **The gift:**
  - a save that never claimed the free Egg gets one when the Day Care opens;
  - hatching it sets `eggClaimed`;
  - a save that already claimed it never gets another.
- **Hatch:**
  - shiny when `rng.chance` hits (a stub rng), and the shiny is always kept;
  - not kept (a plain copy at its level or higher): +`notKeptGold` and `gold` in the result; kept, replacing or new:
    no money; a shiny never brings money (it is always kept);
  - the Egg is cleared;
  - the species comes from the live region's pool.
- **Regions:**
  - left in Kanto, then a switch to Johto: the resident is still there;
  - taken back in Johto: it goes to Kanto's parked Box;
  - the Day Care opens at 20 distinct species across two regions (12 + 8 different).
- **Migration:**
  - two regions with two residents each: the two oldest stay, the other two go home with their levels, and a notice
    is set;
  - the tags are right;
  - parked `dayCare` is gone;
  - `parseSave` twice gives the same save.
- **Guests:** inviting is capped at `friendSlots`, with no duplicates; `refreshGuests` drops the missing ones and
  updates levels.
- **SQL (Phase 4):** a card counts each resident in its own region; `friend_day_cares()` returns friends only.
- **e2e:**
  - the widget opens the page;
  - the gold widget opens into the hatching;
  - Egg now pays and hatches;
  - leave and take back;
  - the friend slots are disabled before Phase 4 and work after it.

## Order of work and commits

1. Phase 1, the data.
2. Phases 2–3, engine + save + migration + config/admin, with their tests. One commit; the game still plays.
3. Phase 5, the UI, with the friend slots disabled.
4. Phase 4, friends, once 0033 is merged: the SQL, then the slots switched on.

Each ends green: `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm e2e`. Add a README "Rule additions" entry for
0034 ("run once on the live database"), as 0033 did.

## Decisions (all settled, 10 Oct 2026)

| # | Question | Answer |
|---|---|---|
| D1 | Bought and free Eggs | The free first Egg stays (the gift); the ₽50 Egg goes |
| D2 | Ditto | Pairs with everyone but legendaries and mythicals; babies and another Ditto pair with it |
| D3 | Eggs at once | One Egg waits at a time; checks meanwhile leave nothing |
| D4 | Who checks | Your two with everyone; guest × guest pairs don't count |
| D5 | A guest leaves | When its owner takes it back, or the friendship ends: seen at the next refresh |
| D6 | Regions | Leave from the live region only; a Pokémon goes back to its own region's Box ("regions never pool") |
| D7 | Migration overflow | Keep the two that have stayed longest, send the rest home with their levels |
| D8 | Unlock | 20 distinct species across every region's Pokédex |
| D9 | Clocks | Two clocks (12 h Egg groups, 24 h Ditto), not one per pair |
| D10 | The Egg's species | The live region's pool, as today, wherever the parents came from |
| D11 | Egg now | ₽200, hatches at once, restarts the clock it skipped (it buys the check early, not an extra one) |
| D12 | Legendaries | Never pair with anyone (follows from D2 and the Egg groups) |
| D13 | A hatchling you don't keep | The Day Care couple gives ₽10 (`notKeptGold`, admin): whenever it isn't kept, at its level or under your copy's |
