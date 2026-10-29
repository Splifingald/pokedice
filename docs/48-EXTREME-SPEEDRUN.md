# Extreme mode as a speedrun

The user's ask of 2026-10-29: "Now the goal of Extreme mode is to speedrun." Extreme mode (docs/22) opens after
Kanto's League; each region whose League the player has beaten once in the main game opens its own run there. A run is
a race from the region's starter to its League, on a clock that never stops; the League won stops it, and that time is
the score. Runs can be restarted to beat it. Extreme mode's page, from the trainer menu, shows every region, its team,
its clock and best time, and the board. The only board in Extreme is time and progress: no level, Pokédex, shiny or
raid boards.

**Status: built** on `claude/charming-bohr-kbvip4`, for `version/2_5`, under Extreme mode's own switch
(`extreme.access`; Off, nothing of it shows). Engine `src/engine/extremeRuns.ts`; the page `src/screens/Extreme.tsx`
with `src/components/ExtremeRuns.tsx` and `src/components/ExtremeBoard.tsx`; the choice across the save switch
`src/store/extremeRuns.ts`; the board `src/lib/extremeBoard.ts`; migration
`supabase/migrations/0086_extreme_speedrun.sql`. Rules for the screens: docs/15 §19.

## 1. Decisions (the questions asked on 2026-10-29)

| Question | Answer |
|---|---|
| A run starts with | **From zero**: the region's starter (picked in the lab) at its level, a new game's ₽ and bag, dice and combo upgrades at level 1. |
| The clock | **Real time, always running**, game open or closed, on the server's clock, from the start to the League won. A 12-hour K.O. and healing while away cost time. |
| The board | **One per region**: the players whose League is won there, fastest best time first; then the runs still going, most badges first. A player's best run counts. |
| Extreme saves from before | **Kept as runs, their clocks starting at the update** (their real start isn't known). A region whose League was already won has no time until it's restarted. |
| Online features in Extreme | **None: a pure race.** No special events (wheel, raids, rebattle), live events, gifts, invite rewards, Versus, Day Care or trades. Friends stay (the same list as the main game). |
| Rules that stay | The **12-hour K.O.**, **healing while away**, the **boon Centers** (docs/47) and **Potions and Revives**. |
| The menu | **The trainer menu, in both saves** (the side panel from the avatar): "Extreme mode · Your runs, their times, the board", once Kanto's League is beaten. |
| Restart | **Erased, best time kept**: the run's team, Box, items and ₽ go, its clock starts over; asked twice. |
| Unlock | **Kanto's League** opens Extreme mode (was Johto's; the admin's `extreme.unlockRegion`). Each region's run opens with that region's League beaten in the main save. |

## 2. The rules (all in `src/engine/extremeRuns.ts`)

- `extremeRegions(main, data)`: the regions whose run can be played: the main save has beaten their League (and
  Extreme mode is on for the player). `extremeRegionList(data)`: every real region, in order (the page shows the locked
  ones too).
- A run lives in the Extreme save: its region's block (live or parked, as regions always were) and
  `save.extreme.runs[region] = { id, startedAt, finishedAt?, best?, untimed? }`. `runOf`, `runState` (none, running,
  won), `runTime(run, now)` (start to League, or to now).
- `beginRun(x, data, region, starter, now, newId, player)`: a fresh block (`newRegionBlock`) for the region, played;
  the first run makes the Extreme save (that region alone; the player's name and look from the main save). A new run
  id, `startedAt: now`, the best time kept. Boons waiting at a Center go (they were the old run's).
- `openRun(x, region)`: plays a run already started (`switchRegion`).
- `settleRuns(x, data, now)` (in the store's `settle`, on the server's clock; nothing moves while it's unknown): a run
  whose League is won stops its clock and keeps the best time; a region played before runs gets one, its clock from
  now (its League already won: `untimed`, no time). `runsWon(before, after)`: a League just won, for its toast.
- Regions don't lead to each other in Extreme: no region offer after a League (`offeredRegion`), nothing sent from one
  run to another (`sendTargets`).
- A pure race: `isDayCareOpen` and `versusUnlocked` are false for an Extreme save; `raceData(data)` turns off the
  special events and the live events in the game data of a page playing the Extreme save (the store applies it on
  boot and with every new content or language, `withViewer`). Gifts and invite rewards never open in Extreme already
  (they wait for the main game and say so), and trades are main-save only. The Social tab has no Versus there, and its
  board is the Extreme one.

## 3. The board (migration 0086, `src/lib/extremeBoard.ts`)

- Each Extreme region's card row keeps its run as the server saw it: `run_id`, `run_seen` (the first upload of that
  run), `run_claimed` (the start the save claims), `run_won` (the first upload with its League won) and `best_ms`.
- A run's time is the **longer of** the save's own (League won minus start) and what the server watched (from its
  first upload to the one with its League won), so a save can't claim a faster run than the server saw go by; the best
  is the shortest of those. A restart (a new run id) starts the server's watch over and keeps the best. An `untimed` run
  gets no time.
- `extreme_board()`: every Extreme region row with a best time (kept for good), or a run going whose player was seen in
  the last 72 hours (or the caller's own). `rankExtremeBoard(rows, region)`: best times first, fastest first (equal
  times share a rank); then the runs going without one, most badges first, the earliest seen first.

## 4. The screens

- **Extreme page** (`/extreme`): the title with the skull, a line ("Race each region from its starter to its League.
  The clock never stops."), the rules card the first time (`RulesCard`, `extremePageSeen`), the regions as cards
  (`RunCard`: locked with what opens it; not started with START; on the clock with its team, badges and the clock
  ticking, PLAY and RESTART; League won with its time in green; the best time with a trophy; the run played now
  outlined in crimson with "Playing"), then the board (`ExtremeBoard`, a strip of the regions open over it), INFO at the
  bottom (the rules pop-up).
- START and RESTART open the lab (`PartnerMoment`) on the region's starters; RESTART asks twice first
  (`RestartRunModal`). From the main save, any choice switches to the Extreme save, and the choice is carried out once
  the sign-in's sync is over (`useRunIntent`), straight into the run.
- **The trainer menu**: "Extreme mode" opens the page from either save; in Extreme, "Main game" switches back.
- **Extreme mode opens** (the one-time pop-up, after Kanto's League): its rules, now led by "A race per region"; Let's
  go! opens the page. The title's Extreme card: NEW EXTREME GAME opens the page too.
- **A League won** in a run: a toast, "Kanto League won! Your time is on the board."
- Every piece is on `/kitchen-sink` (`ExtremeRunBits`).

## 5. Setting it up

1. Deploy the client.
2. Run `supabase/migrations/0086_extreme_speedrun.sql` (the run columns, the server's clock for runs, the board's
   function, Kanto as the unlock; safe to run again):
   https://github.com/Splifingald/pokedice/blob/version/2_5/supabase/migrations/0086_extreme_speedrun.sql
   `supabase/seed.sql` carries it too (inlined).
3. Admin → Config → Switches → **Extreme mode**: On for admin to try it, On for everyone to open it.

## 6. Tests

- `tests/engine/extreme-runs.test.ts`: Kanto's League opens it and each League its region; a first run is a new save
  in that region alone; a second joins it and the first stays parked; the League won stops the clock and keeps the
  best; a restart wipes the run, keeps the best, beats it only when faster; a region from before gets its run (no time
  when its League was won); the save keeps the runs; no region offer, nothing sent, no Day Care, no Versus; the race
  data.
- `tests/extreme-speedrun-sql.test.ts`: 0086 on PGlite: Kanto as the unlock, a run on the board, its time, a restart
  keeping the best, a save that claims a faster run than the server watched, an untimed League, a main save writing no
  run, the ranking, inlined in `seed.sql`.
- `e2e/extreme.spec.ts`: the unlock's Let's go! opens the page; START in the lab plays the run.
