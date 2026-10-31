# Analytics: retention on day 1, 3, 7 and 30, one player per guest who signs in, churn by area

Admin → Analytics (`src/admin/sections/AnalyticsSection.tsx`) measured day-1 retention only, counted a guest who later
signed in as two players, and couldn't say where players stop. Migration 0102 and the page fix the three. It is the
admin's page only: nothing changes for players, so there is no switch and no rules card (docs/15 §20 is about what
players can do). The game sends nothing new: the hourly call it already makes carries one more field.

## 1. What's measured

- **A day played**: a day a player opens the game with a save, in their own time zone (`player_ping`, once a day,
  `src/analytics/ping.ts`). A player is their account when signed in, else their device (`device:<id>`).
- **Day-N retention** (N = 1, 3, 7, 30): of the players whose first day falls in the page's time frame, the share who
  played again **exactly** N calendar days after their first day (the first day is day 0). Not "on or after": a
  player back on day 2 and day 4 counts on neither day 1 nor day 3, as day-1 retention always worked.
- **Pending**: a first day counts only once its day N is over where the admin is (`retentionOn`,
  `src/analytics/retention.ts`): counted while that day runs, the players still to come back that day would be
  missing. Each rate shows "x of y came back" and how many players, from how many first days, wait.
  On the 30-day frame, day 30 is always all pending: choose 90 days or All time to read it.
- **Colours** (`RATE_BANDS`): green, amber, red at lower bars the later the day (40/20 % on day 1, 25/12 on day 3, 15/8
  on day 7, 8/4 on day 30), rough free-to-play benchmarks. The number is always written, so colour never says it alone.
- **One request** on page load, as before: `analytics_retention()` replaces `analytics_d1()` in the page.
  `analytics_d1` stays in the database, unchanged, for the build deployed before this one.

## 2. A guest who signs in is one player

`player_ping` keyed a signed-in player by their account and a guest by their device, so a guest who signed in got a
second row with a later first day, and their guest row looked like a player who never came back (about 17 % of guest
rows had an account on the same device).

- **The merge** (`analytics_merge_player(from, into)`, internal, not callable by players): signed in, `player_ping`
  first moves the row `device:<this device>` into the account: its days (a day both played counts once), its hours
  (players per hour), the earliest first day and the latest last day; the account keeps its own name, email, snapshot
  and area and takes the guest's only where it has none; `days` is recounted; the guest row is deleted. A second ping
  finds nothing to move.
- **The backfill**, once in the migration (and again on a re-run, for any pair made since): every account whose
  `device_id` has a guest row gets it merged the same way.
- **Edges**:
  - `players.device_id` is the **latest** device only, so the backfill can't match a guest row from an account's
    older device. Those stay as they are (a guest who never came back), until that account plays on that device
    again, signed in: then `player_ping` merges it.
  - **A shared device**: the guest's days go to the first account that signs in on it (in the backfill, the account
    that started first). A second account signing in there later finds nothing to take.
  - **Signing out and playing on**: the device starts a new guest row (a "new player" for a while), merged again at
    the next sign-in there.
  - Nothing else keys on `players.player`: messages and gifts to a guest are keyed by device (`feedback.device_id`),
    and the game still shows that device's guest messages once signed in (`my_feedback`), so nothing breaks. The
    admin's profile of a signed-in player now lists them too, from their latest device (`PlayerMessages`'
    `deviceId`). The leaderboard ban and the cheats are for accounts only.

## 3. Churn by area

A panel under Players per hour: **Days away to count as churned** (default 3, 1–365) and **FETCH**. Nothing is asked
before FETCH (`analytics_churn(p_days, p_since)`, admin-only).

- **Churned**: last day played on or before today − N (the server's day, UTC; a player's own day is within one of it).
  Everyone else is **active**.
- **Which players**: those whose first day falls in the page's time frame (`p_since`, the frame's first day; All
  time: everyone), as the retention rates above. The panel says which frame and N a result is for, and asks to fetch
  again when either changed.
- **Per area**: churned (a bar, scaled to the most churned area), active, the churn share, and the average days played
  of each (churned / active). Areas in game order: region by region (`orderIndex`), then each area's `orderIndex`,
  with English names from the bundled game data (`rawData`); an id the game no longer has comes last. The players with
  no area recorded are counted apart ("churned with no known area").
- **"The area they were in when they left"** is `players.last_area`: the area of the last hour they played. The daily
  ping's snapshot sets it, and the hourly `player_seen` now carries `p_area_id` (the save's `currentAreaId`, at the
  save change that sent it) — no new request. An Extreme save sends no area, as it sends no snapshot, so the main
  save's area stays. Before 0102 only the snapshot existed: the migration copies its area, which is where a player
  **started** their last day; it gets sharper as players come back.

## 4. The database (`supabase/migrations/0102_analytics_retention.sql`)

- `players.last_area text`, filled from each snapshot's `areaId`.
- `analytics_merge_player(text, text) → boolean`: internal (revoked from `anon` and `authenticated`).
- `player_ping(text, date, text, jsonb)`: same signature; merges the device's guest row when signed in, sets
  `last_area` from the snapshot.
- `player_seen(p_device_id text, p_area_id text)`: the new call. `player_seen(p_device_id text)`, the deployed build's,
  stays and calls it with no area. An overload, not a defaulted parameter: each call matches exactly one function,
  for PostgREST and SQL alike.
- `analytics_retention() → json`: `{first day: [new players, back on day 1, day 3, day 7, day 30]}`, each check one
  probe of `player_days`' primary key. Admin-only.
- `analytics_churn(p_days int, p_since date default null) → json`: `{today, cutoff, areas: {area id: [churned, active,
  churned's average days, active's]}, unknown: [churned, active]}`. Admin-only; `p_days` from 1 to 365.

## 5. Setting it up

1. Run the migration once in Supabase's SQL editor, **before** deploying the build (the new page calls
   `analytics_retention`; the old build keeps calling `analytics_d1` and `player_seen(text)`, both still there):
   <https://github.com/Splifingald/pokedice/blob/version/2_8/supabase/migrations/0102_analytics_retention.sql>
   (after 0028 and 0042). Safe to run again: a re-run merges only pairs made since. `supabase/seed.sql` doesn't inline
   it (analytics migrations never were).
2. Deploy. Admin → Analytics shows the four rates at once; Churn by area on FETCH.

## 6. Tests

- `tests/retention.test.ts`: day-N maths (pending until day N is over, the frame's bounds, each day's own column), and
  `churnByArea` (game order, unknown areas last, totals, bar scale).
- `tests/analytics-retention-sql.test.ts`: migration 0102 on PGlite: `last_area` from the snapshot; the merge in
  `player_ping` (days, hours, first day, the account's details kept and the guest's as fallback, nothing for a guest
  or a device with no guest row, not callable by players); the backfill (shared device to the earliest account, safe
  to re-run); `player_seen` with an area, without one, and its old one-argument call; `analytics_retention` against
  `analytics_d1`; `analytics_churn` (per area, the frame, the bounds); both admin-only.
- `e2e/admin-analytics.spec.ts`: the four rates from one request per load, and churn fetched only on FETCH, in game
  order, with the frame's first day sent.
