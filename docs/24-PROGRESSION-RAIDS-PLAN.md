# Progression raids — plan

The user's redesign of 2026-10-12. Two kinds of raid from now on:

- **The daily raid** stays as it is (`engine/raidCalendar.ts`): one raid a UTC day, the same for everyone, mostly
  shiny. Its mythical days become **shiny** too (they were normal).
- **Progression raids** are new: every area boss that isn't a mythical becomes a raid, fought **in its area once the
  area is completed**, like a gym leader's challenge once the rounds are done. It is the only way to catch that
  Pokémon. Friends can join with the team they left **on that raid**, and the teams for these raids come from
  **that region's Box** only.

**Mythicals** go back to their lairs as plain boss fights, shiny-locked. They have no progression raid. Their daily
raid days stay, now shiny.

The NPC pop-up changes for **both** kinds: starting with empty friend slots offers **four NPC trainers** (three
Pokémon each), and the player picks as many as there are empty slots. The four stay the same through a refresh. A
new four comes after each try.

**Status (2026-10-12): built** on `ccr-59118050-qhp0wt` (docs/19 has the summary). Where it differs from this plan:
- The red Gyarados (always shiny as a boss) stays **shiny in its raid** and when caught (`progressRaidShiny`); a
  legendary's raid never is.
- The server refuses a key that doesn't name an area's raid boss (`raid_progress_dex`), so `raids_won` can't be
  pumped with made-up keys: at most one count per raid and world.
- 0045 is also folded into `seed.sql`'s prelude (its transaction lines dropped), like 0039 and 0040.
- The progression raid's result card has its own lines (no "midnight UTC"): `ui.raid.progress.result.*`.
- **Small worlds** (docs/21, merged from `feature/version_2`; the user's rule): a world's area bosses can be raids too,
  tied to that world. One is reachable only from inside it (`progressRaidReachable`), its team comes from the world's
  Box and its catch stays in the world; a real region's raid isn't reachable from inside a world, and the Raids page's
  list leaves worlds out. 0046 makes the server take a raid's Box from its area's region (a world's region id is the
  admin's choice, which 0045's check refused).

## 1. Decisions (asked 2026-10-12)

| Question | Answer |
|---|---|
| A legendary's boss fight | **Replaced by the raid.** The boss no longer blocks completing the area; the raid opens when the area is completed, and is the only way to catch it. |
| Which bosses | **Every area boss but the mythicals: 85** (67 legendaries, plus the Ultra Beasts, the Paradox Pokémon, Rotom and the red Gyarados). |
| Old saves that caught it from its boss fight | **Counts as done** (CAUGHT on the raid), but they can still leave a team on it for their friends. |
| Level | **Like the daily raid: Lv.50, teams capped at Lv.50.** Admin can change it, per raid Pokémon too. |
| Tries | **Unlimited**; the raid closes on the catch. |
| Region rule | **That region's Box**: the team and Box of the region the raid is in, played now or parked. Not the Day Care. |
| Mythicals in the daily calendar | **Stay, as shiny raids** (the 12 fixed dates too). |
| NPC pop-up | **Both kinds of raid; the four stay until the raid starts, then a new four per try.** |
| Raikou, Entei, Suicune | **Keep roaming**, shiny-locked, no progression raid (they have no area). |
| Helpers | **Same as daily**: a gift per helper on a catch (within the daily gift cap), and the catch counts on the Raids leaderboard. |
| Where | **A RAID button in the completed area** (CONTINUE's challenge slot), and a **list on the Raids page** by region. |

## 2. Content

### 2.1 Which boss is a raid
`BossDef` gets **`raid?: boolean`**: "fought as a progression raid once the area is completed, never as a boss". It
lives in the `legendary_boss` jsonb column, so the database needs no new column. Admin → Areas gets a **Raid**
checkbox per boss.

`pnpm raid-areas` (`scripts/raid-areas.ts`, rewritten; `seed-regions` keeps calling it):

1. **The mythicals go home.** Each pool mythical becomes its lair's boss again, with the level and unlock it had
   before the raids (00c4b09): Mew 65, Celebi 50 (after the round), Jirachi 60 and Deoxys 65, Phione 50 and Manaphy 55,
   Darkrai 60, Shaymin 60, Arceus 70, Victini 30, Keldeo 55, Meloetta 50, Genesect 60 (after the round), Diancie 65,
   Hoopa 68, Volcanion 70, Meltan 40 (Melmetal by evolving it at Lv.50), Magearna 65, Marshadow 67, Zeraora 70,
   Zarude 70, Pecharunt 88. No `raid` flag. The lair keeps its round of wild Pokémon.
2. **Every other boss gets `raid: true`** (85).
3. **Every area with a raid must be completable**: an area without rounds never completes (`roundsComplete` needs
   `roundsToClear`), so its raid would never open.
   - Cerulean Cave, Southern Island, Southern Island II and Fullmoon Island get **1 round** (like the other endgame
     areas).
   - The **27 areas with nothing to play** (the Lakes of Sinnoh, the Altar of the Sunne and Moone, the Crown Shrine,
     the Shrines of Ruin…) get **one round of wild Pokémon**, built the way the mythical lairs' round was: four
     species from the region's areas closest in level, fully evolved first, at the area's levels.
4. Safe to run again.

### 2.2 The daily calendar
- `raidEntries`: the mythicals' entries become shiny (`entry(d, true, 'mythical')`).
- The 12 mythical fixed dates (Arceus 01‑01, Shaymin 03‑20, Hoopa 04‑01, Celebi 04‑22, Manaphy 06‑08, Meloetta 06‑21,
  Jirachi 07‑07, Victini 07‑14, Deoxys 08‑12, Darkrai 10‑31, Marshadow 11‑01, Magearna 12‑25) become shiny, in
  `defaults.ts`, `config.json` and the live config.
  - Why: a fixed date takes its Pokémon out of the year's pool only when the dex **and** the shiny flag match. Left
    normal, those 12 would come twice a year and the whole year would be shuffled again.
  - Flipping both keeps every day's Pokémon where it is: only the mythical days turn shiny. A test pins the dex
    order of 2026 and 2027.

## 3. Engine (pure, `src/engine`)

### 3.1 Bosses and clearing
- **Progression raids follow the Raid Battles switch** (Admin → Events: Off / On for admin / On for everyone), not the
  Safari Zone that opens the daily raid: the Power Plant's Zapdos can come before it. Switched off for a player, a raid
  boss is a plain boss fight as before, so "On for admin" can try it all first and nothing is ever uncatchable.
- `fightBosses(area)` (the bosses fought as bosses) and `raidBosses(area)` (the raids), in `encounters.ts`.
  - `dueBoss`, `fledLegendary` and the legend deck card read `fightBosses`.
  - `clearIfDone` (`run.ts`) only waits for round bosses that aren't raids.
  - The round gauge, the area details, Home's CONTINUE and the campaign sim follow.
- **Old saves**: an area whose rounds and gyms were done, waiting only on a boss that is now a raid, completes on
  load (`settleClears`, beside `migrateRounds` in the store's load chain). A save mid-way through a raid boss's
  encounter finishes it as before.
- **Shiny lock** unchanged: every legendary and mythical met in an area is never shiny (`shinyLocked`).

### 3.2 Progression raids (`engine/progressRaid.ts`)
- **A raid's key** is `areaId:dex`.
- `progressRaids(data)`: every raid boss of every area, with its key, dex, area and region.
- `progressRaidState(save, data, key)`: one of
  - `locked`: the area isn't completed, in its region, played or parked;
  - `open`;
  - `done`: the key is in `events.raidsDone`, or the save beat that boss and has the species in that region's
    Pokédex (it was caught from the boss fight, before this change).
- `progressRaidTeam(save, data, key)`: the team left on that raid (`events.raidTeams[key]`, instance ids). Until one
  is set: that region's three highest levels. Only Pokémon in that region's team and Box, not resting (Extreme mode),
  at their own levels: the fight caps them at the raid's team cap, all but their dice and rerolls (docs/18 §3,
  since 2026-10-18).
- `progressRaidRegionMons(save, data, region)`: the editor's candidates.
- `applyProgressRaidCatch`: the Pokémon joins its region's Box at once (the area is completed by definition; it
  reuses `addToRegion`), the key goes into `raidsDone`, and `raidsWon` + 1.
- **Numbers**: `raidRules(data, dex, 'progress')`.
  - Order: `raid.progress.perMon[dex]`, then `raid.progress` (`teamCap`, and any default it sets), then the raid
    defaults (`bars`, `barHp`, `level` 50…).
  - The daily raid's `perMon` stays the daily raid's.

### 3.3 The NPC offer (both kinds)
- `raidNpcOffer(data, regions, seed)`: four NPC trainers, each a class trainer's name and look plus three allowed
  Pokémon at the team cap. It is deterministic from the seed and replaces the store's `npcSides`.
  - The daily raid draws from the regions the player has started.
  - A progression raid draws from its own region.
- `events.raidNpc = { key, seed }` in the save.
  - Written the first time the pop-up opens for that raid (`daily:YYYY-MM-DD` or the progression key), so a refresh
    shows the same four.
  - Replaced when a try starts, so the next try offers a new four.

### 3.4 Save (`EventsSave`, zod schema)
- `raidsDone?: string[]`: the progression raids caught (at most 200). Never undone: a sync keeps the ones either copy
  has, and at sign-in the game adds back any the server recorded in `raid_progress_done` and the save lost
  (`raid_progress_mine`, migration 0089; docs/49).
- `raidTeams?: Record<string, string[]>`: the team left on each progression raid (three ids each).
- `raidNpc?: { key: string; seed: number }`.

## 4. Server (migration 0045, generated by `pnpm progress-raids-sql`)

- **Content**:
  - `update areas`: `legendary_boss`, `rounds_to_clear` and `encounter_weights` of the changed areas;
  - `insert into area_wild_pool` for the new rounds, under stable ids;
  - in the `events` row of `game_config`: the mythical fixed dates turn shiny (`jsonb_set` on the dates whose dex is
    in `raid.pool`, so other admin edits stay) and `raid.progress` is added when missing.
- **`raid_progress_teams (user_id, realm, raid_key, region, team, ids, updated_at)`**, primary key
  `(user_id, realm, raid_key)`.
  - `raid_progress_set_team(p_key, p_region, p_ids, p_realm)` builds the team from the cloud save, from that region's
    Box only: the top-level `box` when the save is playing that region, else `parked → region → box`.
- **`raid_progress_friend_teams(p_key, p_realm)`**: the friends who left a team on this raid, with how many times
  each has helped you.
- **`raid_progress_close(p_key, p_helpers, p_realm)`**:
  - once per player and key (`raid_progress_done`);
  - `raids_won` + 1;
  - helper gifts within `helperDailyCap`, shared with `raid_close` (the gift draw moves into one function both call).
- `delete_my_data` also clears the two new tables.
- A PGlite test covers it all (`tests/progress-raids-sql.test.ts`).

## 5. Screens (UI guidelines apply; every new piece on `/kitchen-sink`)

- **The area**
  - The area details' Legendary section lists a raid with a RAID tag and its state:
    - "Opens when the area is completed" (lock);
    - "Raid open" (GO);
    - "Caught" (done).
  - Home's CONTINUE: once the area is completed and a raid there is open, its challenge slot becomes **RAID:
    ARTICUNO** (like a gym's), with Keep exploring. Several open raids in one area (the Lakes of Sinnoh): the next one
    in order.
- **The progression raid page**, `/raid/:areaId/:dex`:
  - the area's banner and back arrow;
  - the raid card (no timer; CAUGHT once done);
  - START, or the lock with what to complete;
  - **your {region} team for this raid** (the editor lists that region's Box only);
  - your group (the friends who left a team on this raid);
  - the ball odds.
  - The fight is the daily raid's `RaidView`. The catch goes straight to the region's Box: "Articuno joined your Johto
    Box".
- **The Raids page**:
  - under the daily raid, **Legendary raids**: one chip per started region (the live one first);
  - each raid is a row: icon, name, area, a state chip (Locked · {area}, Open, Caught) and a team mark;
  - a row opens the raid's page.
- **The NPC picker** (`RaidNpcPicker`, a `Modal`) on START with empty slots, daily and progression alike:
  - "{n} empty slots: pick {n} trainers to fight beside you";
  - four cards (the trainer, their three Pokémon with levels and types); a tap toggles a card and numbers it;
  - Back, and START, which waits for the right count.
- **The Pokédex** ("where to find"): a raid boss reads "Raid · {area}" with its state.

## 6. Admin

- Areas → bosses: the **Raid** checkbox.
- Events → Raids → **Progression raids**:
  - the team cap;
  - each raid Pokémon's own numbers (level, bars, HP per bar, upgrade level, team cap; no summons since 2026-10-13);
  - the list of the 85 raids by region with their areas.
- The Mythicals box's hint: "a shiny raid of the calendar; its lair's boss, never shiny there".

## 7. Strings

New `ui.raid.*` keys in all ten languages:
- the RAID button;
- the states;
- the region team;
- the Legendary raids list;
- the picker's title, body and START;
- the catch line.

Run `pnpm i18n:fonts` after editing the CJK columns.

## 8. Tests

- **Engine**:
  - raid bosses don't block clearing;
  - `settleClears`;
  - states and the "done" rule for old saves;
  - region-limited teams;
  - the catch;
  - the NPC offer is deterministic, four trainers × three Pokémon, from the right region;
  - mythical bosses never shiny;
  - mythical calendar days shiny with the same dex order.
- **Data**:
  - every non-mythical boss is a raid;
  - every raid area is completable;
  - the mythicals are their lairs' bosses (tests/data, raid-pick, region-content updated).
- **SQL**: `tests/progress-raids-sql.test.ts`.
- **e2e**: a progression raid from a completed area, and the picker on START (with the dev config), with axe.

## 9. Hand-over

1. Deploy the client first: an older client would show a raid boss as a plain boss. Until 0045 runs, the new client
   plays as before (no area boss is flagged a raid yet) and keeps the calendar's order: a mythical's fixed date takes
   its one day a year whether it is shiny yet or not (checked against the live export of 2026-10-12: 2026 and 2027
   unchanged day for day; only the mythicals' colours differ).
2. Run `supabase/migrations/0045_progress_raids.sql` (safe to run again). Raid Battles are on for everyone on live, so
   the progression raids open at once. Best not on a mythical's fixed date (01-01, 03-20, 04-01, 04-22, 06-08, 06-21,
   07-07, 07-14, 08-12, 10-31, 11-01, 12-25): that day's raid would turn shiny mid-day for whoever hasn't loaded it.
3. Run `supabase/migrations/0046_progress_raids_worlds.sql` (safe to run again).
4. Admin → Publish, so every client reloads the config.

0045 went live on 2026-10-12, as `0044_progress_raids.sql` (Trades took 0044 on `feature/version_2` the same day, so
these moved up a number; same content, nothing to run again), and before the client: until the client is deployed, the
one out reads the mythicals' fixed dates as new raids and lays the calendar out differently from 2026-10-14 (10-12 and
10-13 are set by hand). Deploy before 2026-10-14 00:00 UTC; the new client lays it out as before.

Trades' 0044 can run before or after 0046: both clear trades' and raids' rows in Delete my data, each only for the
tables already there.
