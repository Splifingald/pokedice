# 74 · The player cap (CCU) and its waiting line

> **Your part:** [Setting it up](#setting-it-up) at the end: one SQL file (after your OK), then the switch in
> Admin → Config → Capacity.

The ask, 2026-11-22: limit how many players are in the game at once, with a first-come waiting line, a cap the admin
changes live, and a bypass for the admin and whitelisted players; enforced on the server, so editing the game can't
skip the line.

**Status (2026-11-22): built** on `ccr-964927e7-tli7rh` (from `version/2_9_9`). Migration `0157_player_cap.sql`,
**not run yet**. The switch ships **Off** (docs/15 §20) and the server gate (`enforceWrites`) **off**.

## 1. What players see

- At start, before anything else reaches the server, the game asks for a place (`ccu_join`). Until the answer comes,
  the loading Poké Ball (at most 6 s; past that the game starts and a late "full" still counts).
- **In**: the game, as before. **Full**: the **Waiting line** page instead of the game:
  - "Too many players currently on the game for the server capacity, please try again later." (the exact words, in
    all ten languages), then "**You are #N in line**" (a live region), kept up to date every 15 s;
  - "You'll get in by yourself when it's your turn: keep this tab open.";
  - signed out: "On the whitelist? Sign in to get in now." with CONNECT (Google);
  - **INFO** at its foot: the rules (§20), three rows with the live numbers: room for N players at once (first come,
    first served), keep this tab open (a closed tab gives its spot away after a minute), no input for N minutes (Idle
    mode counts too; if players are waiting, the spot goes to them). Also in How to play → Game features while the
    switch is on for the player.
- Their turn: the game starts by itself, with a toast, "You're in! Have fun."
- **Sent back for idling** (10 minutes with no tap, click, key or wheel, Idle mode playing by itself included, and only
  when someone is waiting): the same line as a pop-up over the game that can't be closed, under "You were idle for 10
  minutes, so your spot went to a waiting player". The game stays as it was underneath (inert, auto-mode paused, as
  under any pop-up) and carries on once back in.
- **No answer** (offline, an older database, the cloud not set up): the game plays as it always has. Saves are on the
  device; once the gate is on, what needs the server is refused until a place is had (and the game asks again).
- The admin panel, the setup guide and the dev pages never wait: they aren't the game.

## 2. The switch and the settings (`game_config` `ccu`)

| Key | Default | |
|---|---|---|
| `access` | `off` | **Off**: everyone gets in and is counted (the counters work, nobody waits). **On for admin**: the admin's own game waits in line like a regular player's, everyone else gets in (try it in production with a low cap). **On for everyone**: the cap |
| `cap` | 30 | Regular players at once. The admin and the whitelist get in over it, and count |
| `enforceWrites` | false | The server gate (§4) |
| `idleMinutes` | 10 | No input this long, and someone waiting: back of the line (regular players only) |
| `heartbeatSeconds` | 30 | In the game: how often it says it's there |
| `queueHeartbeatSeconds` | 15 | Waiting: how often it asks for its turn |
| `staleSeconds` | 90 | Not heard from this long: the place frees (kept ≥ 2 heartbeats + 10 s) |
| `reconnectGraceSeconds` | 60 | A page that said it was closing keeps its place this long, for a reload |

Admin → Config → **Capacity** saves them **live** through `ccu_admin_config()` (no Publish, no content version, no
reload: a version bump would make every player download the content again for one number). The server clamps every
number and stores what it uses. Raising the cap lets the line in at once; **lowering it sends nobody out**: it only
stops letting players in until enough have left. The switch lives on that tab, not in the Switches table (which saves
through Publish).

## 3. How the server decides (`supabase/migrations/0157_player_cap.sql`)

- **`ccu_sessions`** (UNLOGGED, as `online_here`): one row per player, `who` = the account, else `device:` and the
  guest's device id. Every tab and device of a player shares it: **one place per player**. A random 64-hex token,
  `kind` (regular / admin / whitelist: `beta_testers`, signed in), `status` (active / queued), `queued_at` +
  `queue_seq` (first come first served), `last_seen`, `last_input`, `left_at`, `reason` ('idle').
- **`ccu_join(device, previous_token)`**: takes the advisory lock, clears the gone, finds or makes the player's row,
  then lets in who can come in, and answers `{status, token, position, queueLength, reason, cap, heartbeatSeconds…}`.
  The previous token (kept in `localStorage`) keeps a reloaded page's place within the grace, in the game or in line,
  and carries a guest's place to the account they sign in to (never the other way: an account's place stays with its
  other devices; a device signing out gets a place of its own).
- **`ccu_heartbeat(token, had_input, card)`**: stamps the row; a whitelisted player waiting gets in at once; every
  2 s at most, the first heartbeat to get the lock (it never waits for it) clears the gone and moves the line.
  `'gone'` (lost, or signed in or out since): the game joins again with its token. `card`: the players-online card
  (docs/70), so its 5-minute ping **rides on the heartbeat** instead of being a second timer; the answer then carries
  `online`, the count.
- **`ccu_leave(token)`** (on `pagehide`, `fetch` with `keepalive`): the place is kept `reconnectGraceSeconds`, then
  freed. Another tab still beating keeps it.
- **Letting in** (`ccu_admit`, always under `pg_advisory_xact_lock`, so two joins never count at once): (1) whoever the
  cap doesn't apply to; (2) regular players idle past `idleMinutes` to the back of the line, as many as the waiting
  players the free places don't cover, the longest idle first; (3) the free places (cap minus everyone in, whatever
  their kind) to the line in order. A regular player gets in only when fewer than `cap` are in **and** nobody is ahead
  of them. Nothing runs on a timer (no cron): the cleaning is done lazily inside these calls.
- **`ccu_is_active(token)`**: whether a token is an active session's (the gate's check, usable in any policy).
- **The admin's**: `ccu_admin_stats()` (in the game by kind, waiting, sent back for idling, longest wait, the
  settings), `ccu_admin_config(json)`, `ccu_admin_players()` (the signed-in players from analytics' `players`: id,
  name, e-mail), `ccu_whitelist()`, `ccu_whitelist_set(user, note)`, `ccu_whitelist_remove(user)`. Each checks
  `is_admin()`.

## 4. The gate (`enforceWrites`)

`ccu_check_request()` is PostgREST's **pre-request function** (`pgrst.db_pre_request` on the `authenticator` role, set
by the migration): it runs before every Data API request, as the caller. While `enforceWrites` is off it returns at
once. On, a request without the header `x-ccu-token` carrying an **active** session's token is refused with **HTTP 428
`ccu_required`**. The game sends the token on every database request (`src/lib/ccuToken.ts`, the Supabase client's
fetch, and the save sent as a page closes) and, on a 428, asks for its place again.

**Never gated**: the cap's own calls (`ccu_join`, `ccu_heartbeat`, `ccu_leave`, `ccu_is_active`), `is_admin` (the setup
page), `event_time` (the clock), `delete_my_data` and `push_unsubscribe` (what a player must always be able to do);
every **read** of a table but `saves` (the content, `game_config`, `app_signals`: what a waiting game or an older build
reads); the **admin** (`is_admin()`), the **service role** (the Netlify functions); Auth, Realtime and Storage (not
PostgREST). Any fault inside the gate lets the request through: it must never be what takes the game down.

**Gated: everything else.** The client's calls, from `src/` (2026-11-22):

| Area | Calls |
|---|---|
| Saves | `saves` read, insert, update (and the keepalive update on leaving) |
| Players online | `online_ping` (older builds; this one rides the heartbeat), `online_players`, `online_invite` |
| Analytics | `player_ping`, `player_seen` |
| Versus & league | `versus_board`, `versus_record`, `versus_set_team`, `versus_league_home`, `_choices`, `_start`, `_finish`, `_best`, `_global`, `extreme_board`, `leaderboard` |
| Raids | `raid_today`, `raid_set_team`, `raid_close`, `raid_friend_teams`, `raid_gifts_claim`, `raid_progress_mine`, `_set_team`, `_close`, `_friend_teams` |
| Friends & invites | `friend_status`, `friend_list`, `friend_profile`, `friend_add`, `friend_lookup`, `friend_remove`, `friend_seen`, `friend_code`, `friend_code_reset`, `friend_day_cares`, `invite_status`, `invite_record`, `invite_rewards_claim`, `friend_requests`, `friend_request_send`, `friend_request_answer`, `area_versus_offer`, `area_versus_met` |
| Friendship | `friendship_status`, `friendship_egg`, `friendship_raid`, `friend_market_applied` |
| Trades | `trade_board`, `trade_mine`, `trade_post`, `trade_picks`, `trade_cancel`, `trade_remove`, `trade_applied` |
| Friend Battles | `pvp_home`, `pvp_online`, `pvp_here`, `pvp_ping`, `pvp_challenge`, `pvp_answer`, `pvp_cancel`, `pvp_pick`, `pvp_order`, `pvp_move`, `pvp_state`, `pvp_timeout`, `pvp_finish`, `pvp_claim` |
| Underground teams | `ug_team`, `ug_invite`, `ug_answer`, `ug_cancel`, `ug_leave`, `ug_send`, `ug_inbox`, `ug_applied`, `ug_can_sell` |
| Events & gifts | `boss_state`, `boss_place`, `boss_take_back`, `broadcast_claim`, `gift_card_open`, `welcome_back_claim`, `welcome_gift_open`, `side_quest_open`, `tracks_open`, `trick_or_treat_open`, `rotom_room_open` |
| Messages | `feedback` insert, `my_feedback`, `feedback_reply_seen`, `feedback_claim_gifts` |
| Push | `push_subscribe`, `push_schedule` |

A function added later is gated too, unless it joins `ccu_ungated()`.

**Rolling out** (the game is live):

1. Run the migration, deploy the build: the switch Off, the gate off. Older builds still open keep working (they send
   no token, and nothing asks for one).
2. Watch Admin → Config → Capacity: "In the game" should follow the players online. "On for everyone, N would be over
   the cap right now" says what the cap would do before it does it.
3. Try it: **On for admin** with a cap under the count: your own game waits in line (the message, the place, INFO);
   raise the cap and it gets in by itself. Set `idleMinutes` to 1 to see the idle trip.
4. **On for everyone** when ready.
5. The gate: a build without the cap must be gone first. Open pages reload by themselves for a newer build (hourly
   `version.json` check, on return to the tab, and any page over a day old: `src/store/sync.ts`); Admin → Reload all
   players does it at once. Then tick the gate and Save (it asks to confirm). Undo: untick and Save.

## 5. What it costs

- Every open game: one tiny call every **30 s** in the game (~120 an hour), **15 s** waiting. The players-online ping
  (12 an hour) now rides on it, so that's ~108 more calls per player-hour than before; the busiest hour so far (87
  players, docs/66) would be ~3 a second. Each is one indexed row update on an UNLOGGED table (no write-ahead log).
- The line moves at most every 2 s, by whichever heartbeat gets there first, never waiting for another.
- The gate: one primary-key lookup per request, and only once `enforceWrites` is on; a `game_config` read before that.
- A waiting game asks for nothing else: no content check, no cloud sync, no analytics, no Realtime.

## 6. Known limits

- **A heartbeat can lie about input**: an edited game can always say it was touched. The idle rule is for the honest
  player who walked away.
- **Device ids are the game's own**: a script making up device ids gets places like players do (the cap holds; the
  line gets longer). Per-IP limits would be the next step if it happens.
- **A phone freezing the tab** loses the place after 90 s, as a closed tab does; back on the tab, the game asks again
  (it may then wait).
- **Signing out** on one device of an account gives that device a place of its own (it may wait); the account's
  other devices keep theirs.
- An older build has no line: until it reloads it plays without counting (and, with the gate on, without the server).

## 7. Tests

- `tests/player-cap-sql.test.ts` (PGlite, the real migration, 0144/0146 for the players-online card): the switch
  (Off counts, On for admin puts the admin in line), the numbers clamped, the admin's calls refused to players; never
  over the cap, first come first served; the admin and the whitelist over the cap, counted, never taking a turn;
  a lower cap sends nobody out; a higher cap lets in at once; a reload within the grace keeps its place (in the game or
  in line), past it the end of the line; a game silent 90 s freed; idle regular players sent back only when someone
  waits (whitelisted ones never); one place per player across tabs and devices; a guest's place carried to their
  account, a whitelisted one in at once (also whitelisted while waiting); signing out gives a place of its own; the
  card stamps `online_here`; the whitelist editor; the gate (off, on: no token, a waiting or made-up one, a lost
  session refused; in the game, the ungated calls, content reads, the admin and the service role through; HTTP 428 in
  PostgREST's format). Safe to run twice.
- `scripts/player-cap-race.sh`: a throwaway local Postgres, 200 joins **at once** on their own connections, then a
  wave of leaves, heartbeats and joins together: never more in than the cap (PGlite has one connection, so it can't).
- `tests/player-cap-client.test.ts`: the answers read safely, the token on database requests only, the 428 passed on,
  a refused header dropped only when the same request goes without it.
- `e2e/player-cap.spec.ts`: full at start, nothing else asked of the server, the exact message and the place, INFO, in
  by itself, the token on every request after, the card on the heartbeat (no `online_ping`); idle, back in line over
  the game, Escape doesn't close it, back in; a server without the cap starts the game as before.
  `e2e/admin-config.spec.ts`: the Capacity tab (the counters, the cap saved live, the whitelist's searchable pick).
- `/kitchen-sink`: the line first, far back and signed in, sent back for idling, asking; the rules.

**By hand** (step 3 above): cap 1, two browsers (one signed out, or a private window): the second sees the message and
"#1", gets in when the first closes its tab (within ~1 minute), and with `idleMinutes` 1 the idle trip; the admin,
signed in, always gets in under On for everyone.

## Setting it up

1. **Run the SQL** in Supabase → SQL Editor, after reading it (it adds the gate's pre-request function to the API;
   `supabase/seed.sql` doesn't carry it). Needs 0131 (`beta_testers`) and 0146 (players online), both run already:
   - <https://github.com/Splifingald/pokedice/blob/ccr-964927e7-tli7rh/supabase/migrations/0157_player_cap.sql>
2. Deploy. Nothing changes for players: the switch is Off.
3. Admin → Config → **Capacity**: follow §4's rollout.
4. Undo the gate entirely (if ever needed), in the SQL editor:
   `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`
