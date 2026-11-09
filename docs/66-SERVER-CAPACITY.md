# Server capacity: how many players, the Versus board cache, the load test, the server watch

> **Your part:** [Setting it up](#setting-it-up) at the end: two SQL files, a few Netlify settings, about 15 minutes.

The game decides every battle in the browser (`src/engine`), so a player costs the server only small requests: a
save upload when the save changes, the hourly analytics ping, and reads for Versus, friends, trades. This page says how
much room that leaves, what was done to make more, how to measure it for real, and what watches it now.

None of it is something players see or choose: there is no switch and no rules card (docs/15 §20 is about what
players can do). The watch does nothing until its Netlify settings are there.

## 1. Where we stand (2026-11-03)

| | |
|---|---|
| Players a day (30-day average / peak) | 396 / 722 |
| Players in 30 days | 2,264 (802 signed-in accounts) |
| Most players in one hour (8 days) | 87 |
| Database CPU since 2026-10-11 | ~2 % of one core on average |
| Database | Supabase Pro, Micro compute (2 shared cores, 1 GB, 60 connections), 149 MB |

What gives first, in order:

1. **Realtime: 500 connections at once** on Pro with the spend cap on (10,000 with it off; a bigger database doesn't
   raise it). Every visible tab joins the `app` channel (`src/store/sync.ts`), for the admin's "Reload all" only. A tab
   refused just misses that signal and tries again 5 minutes later: nothing breaks. Roughly 500–1,000 players in the
   busiest hour. Supabase emails when it's hit; its metrics don't carry it, so the watch (§4) can't see it.
2. **CPU and memory on Micro**: shared, burstable cores. §2 removed ~80 % of the database's work.

Players online (docs/70) adds one tiny call every 5 minutes per visible tab, ~12 per hour of play,
on an unlogged table; no Realtime.
3. Far away: 100k signed-in players a month, 8 GB of database, 250 GB of egress a month (Pro's quotas).

## 2. The Versus board, built at most once every 15 minutes (migration 0139)

`versus_board()` took **~0.7 s a call** and was **~80 % of all database time** (156k calls in 23 days): for each of
the ~330 teams, `player_powers()` read the player's whole save (25 kB compressed) for its `powers`, and asked the
power switches again for each row.

Now `versus_board_cache` keeps, per realm, what is the same for everyone: each team's attack and defense wins, the
raw `powers` of its save, and whether its owner has a rich card. `versus_board_stats(realm)` builds it again when it is
15 minutes old: one call builds it (an advisory lock), the others meanwhile get the previous build. Building it takes
**85 ms** on the live data; a call that reads it, a few ms.

| From the cache (up to 15 minutes old) | Live, on every call |
|---|---|
| The other players' attack and defense wins | Who is on the board, their team, its version, the order |
| Their gems and badges (raw), their rich card | Names and trainer looks |
| | "Beaten" (yours), your own row in full |
| | A team newer than the last build (counted live) |

- **Your own row is never from the cache**: your wins go up at once, and the board shows your new team back to the
  game, which checks it (`versus_not_saved`).
- **The switches stay per caller**: the cache holds raw powers; each call applies `power_open()` and `general_open()`
  for the one asking (an admin-only switch still shows the gems to the admin alone), through
  `versus_powers_shown()`, the same shaping as `player_powers()`.
- **A fight is never against a stale team**: teams and versions are live, so `versus_team_changed` stays as rare as
  before. A defender's gems can be up to 15 minutes old in the fight.
- A made-up realm name keeps no row. Players can't read the cache or call the builder (revoked from `anon` and
  `authenticated`, as 0114 does for internal functions).
- Home's Versus widget keeps its board 15 minutes instead of 10 (`versusBoardCached`), the server's own pace.
- seed.sql inlines 0139 after 0064, so running seed.sql again keeps the cached board.
- Tested: `tests/versus-board-cache-sql.test.ts` (PGlite).

## 3. The load test (`pnpm load-test`)

It plays the game's real requests for more and more players and says how many it held. The request mix
(`scripts/load-test/plan.ts`, `MIX`) is what a player sent per hour of play in the live game's last 24 hours (edge
logs and `pg_stat_statements`): ~33 requests per player-hour, plus a full content download now and then.

```
pnpm load-test setup              # once: 20 test accounts (loadtest-NN@pokedice-load.test) and their saves
pnpm load-test run --production   # the steps; Ctrl+C stops it at any time
pnpm load-test cleanup            # deletes the test accounts and everything they wrote
```

- **Steps**: 50 players at once, ×1.5 each step (`--start`, `--factor`), up to `--max` (default 1000; 3000 at most on
  the live game), 60 s each (`--step`). It stops at the first step whose p95 goes over 800 ms (`--p95`) or whose errors
  go over 1 % (`--errors`), and prints the last step that held: **players playing at the same moment**.
- **Each request** leaves at a random moment (as real players' do), from one of the test accounts, and is timed until
  its answer. The table names the slowest kind of request at each step: what gives first.
- **Settings** (`.env.local` or the environment): `LOAD_TEST_SERVICE_KEY` (Supabase → Project Settings → API Keys, a
  secret key; setup, run and cleanup sign the test accounts in with it, no email is sent);
  `LOAD_TEST_SUPABASE_URL` / `LOAD_TEST_ANON_KEY` to test another project (default: the game's `VITE_` pair).
- **Against the live game** it asks for `--production`. Run it at a quiet hour (the busiest are around 14:00 UTC): it
  does slow the game for real players while it pushes, until it stops. The test accounts can show on the leaderboard
  while they exist (as "LOADTEST n"); `cleanup` removes them. The analytics pings are left out, so they never count as
  players.
- **What it can't see**: browsers add a CORS preflight to ~30 % of requests (Node doesn't), and Realtime's 500 isn't
  tested (pushing it would turn real players' tabs away).
- **A copy instead of the live game** isn't one command yet: the migrations don't replay cleanly on an empty project
  (an old ordering issue, before 0139). A Supabase branch with a copy of the schema (`pg_dump --schema-only`) works.
- Tested: `tests/load-test-plan.test.ts` (the mix, the random gaps, percentiles, the verdict).

## 4. The server watch (`netlify/functions/ops-watch.mts`, every 5 minutes)

It reads the database's metrics from Supabase (`/customer/v1/privileged/metrics`, Prometheus text) and posts on a
private Discord channel. The decisions are `netlify/ops/watch.ts` (tested: `tests/ops-watch.test.ts`); its memory is
the one row of `ops_watch_state` (migration 0140).

| | Warning | Critical |
|---|---|---|
| CPU (busy share since the last run) | 70 % | 90 % |
| Memory (without the OS's file cache) | 85 % | 95 % |
| Disk (`/data`) | 80 % | 90 % |
| DB connections (of 60) | 80 % | 95 % |

- A level is told once it has **held 10 minutes** (a one-off spike says nothing), again **every hour** while it lasts,
  at once when it gets **worse**, and **"back to normal"** once. Critical pings you (`DISCORD_OPS_PING`).
- **Every day** (the first run after midnight UTC), yesterday's peaks: a quiet channel still says the watch is alive.
- Metrics not answering (the database down or restarting) is told once an hour.
- **Growing the database**: when CPU or memory has been **critical 15 minutes**, at most once a day. By default it only
  says so (with where to click). With `OPS_AUTOSCALE=upgrade` it grows the database itself, **one size**, never past
  `OPS_AUTOSCALE_MAX` (default `ci_small`, about $5 a month more than Micro), never down. Each change restarts the
  database: **about 2 minutes of downtime**, which is why it is off by default. It never grows for disk (Supabase
  grows the disk itself at 90 %) nor for connections or Realtime (a bigger size doesn't fix those).

| Size | About a month | Memory | Connections |
|---|---|---|---|
| Micro (now) | $10 (covered by Pro's credit) | 1 GB | 60 |
| Small | $15 | 2 GB | 90 |
| Medium | $60 | 4 GB | 120 |
| Large | $110 | 8 GB, 2 dedicated cores | 160 |

Supabase itself emails quota and spend-cap overages, and a low disk-IO budget; Netlify emails at 50 / 75 / 100 % of
its monthly credits. For email alerts on CPU and memory too, Supabase → Integrations → Grafana Cloud (free tier) can
scrape the same metrics and send its own alerts by email.

## 5. More room, next (not done here)

From a read of the live logs and the code (2026-11-03), most requests first:

1. **Content downloaded again after every deploy** (~1,100 full downloads a day, ~2.5 MB each): the bundled
   `configVersion` (77) is far behind the live one (212), and the content cache is keyed on the build id
   (`src/config/contentCache.ts`). Ship the live content (`pnpm pull-remote --write`) and key the cache on the content
   version. About half the egress.
2. **One "inbox" call on returning to the tab** instead of 8 (`friend_status`, `invite_status`, `friend_requests`,
   `friendship_status`, `my_feedback`, `raid_gifts_claim`, `trade_mine`, `app_signals`): ~15k requests a day.
3. **`event_time` every 10 minutes even in hidden tabs** (`src/store/serverTime.ts`): 17 % of all requests. Skip it
   while hidden; read the time from responses already made.
4. **Save uploads re-parse the 80 kB save in triggers** (`saves_card`, `saves_area_versus`): ~187 kB of WAL each. Run
   them only when the card's fields changed.
5. **`leaderboard()`**: 1.5 MB per call; cache it like the Versus board.
6. **`trade_mine()` writes on every read** (expiry and cleanup): move them to a cron job.
7. **Netlify cache headers** for `/area-art/*`, `/items/*`, `/backgrounds/*`, `/region-art/*`, `/icons/*`: they are
   re-checked on every visit.
8. Realtime's `app` channel only carries "Reload all": the same stamp in the inbox call (2) would free every
   connection, at the cost of "Reload all" reaching tabs within minutes rather than at once.

## Setting it up

1. **Run the SQL**, in Supabase → SQL Editor, in this order (seed.sql carries 0139 too):
   - [`0139_versus_board_cache.sql`](https://github.com/Splifingald/pokedice/blob/ccr-039bc7d7-fl6rao/supabase/migrations/0139_versus_board_cache.sql)
   - [`0140_ops_watch.sql`](https://github.com/Splifingald/pokedice/blob/ccr-039bc7d7-fl6rao/supabase/migrations/0140_ops_watch.sql)
2. **Discord**: make a private channel (e.g. `#server-watch`) → Edit Channel → Integrations → Webhooks → New Webhook →
   Copy Webhook URL. Turn on mobile notifications for that channel to get the alerts on your phone.
3. **Supabase**: Project Settings → API Keys → create a secret key named `ops-watch` (`sb_secret_…`).
4. **Netlify** → Site configuration → Environment variables:
   - `SUPABASE_METRICS_KEY` = the secret key of step 3
   - `DISCORD_OPS_WEBHOOK` = the URL of step 2
   - optional `DISCORD_OPS_PING` = your Discord user id (Settings → Advanced → Developer Mode, then right-click your
     name → Copy User ID)
   - optional, to let it grow the database itself: `OPS_AUTOSCALE=upgrade`, `OPS_AUTOSCALE_MAX=ci_small`, and
     `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens; a scoped token needs only "Add-ons: read-write")
   (`VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are there already.)
5. The watch runs on the published site only (as every scheduled function): it starts with the deploy of `main`. Its
   first message is the next day's peaks; Netlify → Logs → Functions → `ops-watch` shows each run before that.
6. **Supabase → Organization → Billing**: whether the spend cap is on decides Realtime's 500 or 10,000 (§1).
7. **The load test**, when you want a number: `.env.local` gets `LOAD_TEST_SERVICE_KEY` (a secret key), then §3's
   three commands at a quiet hour.
