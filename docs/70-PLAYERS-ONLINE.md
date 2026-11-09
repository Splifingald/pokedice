# 70 · Players online

The ask, 2026-11-09: "At the bottom of the side menu, above the save sync button add the amount of players currently
online. If it isn't too costly."

**Status (2026-11-09): built** on `ccr-d1834cae-4wnqoz` (from `version/2_9_7`). The user's call the same day: **no
switch, on for everyone** (an exception to docs/15 §20, as global messages, docs/69). Migration
`0144_players_online.sql`.

## 1. What players see

- At the foot of the side menu (the avatar's drawer), just above **SYNC ONLINE**: a green dot (a friend online's,
  docs/65) and "**12 players online**" (one: "1 player online"), in all ten languages. Guests see it too: SYNC ONLINE
  is only for signed-in players, so for a guest the line is the last thing in the list.
- "Online" means the game open on a visible tab in the last 6 minutes, guests included: the account when signed in,
  else the guest's device. An account on two devices counts once; a guest who signs in may count twice for a few
  minutes.
- Hidden until the server has answered (no "0", no placeholder): offline, or before the migration is run.
- **No switch, no rules and no INFO** (docs/15 §20): there is nothing to do or learn, the line says it all.

## 2. No switch

On for everyone from the start (the user's call, 2026-11-09). The first version had the admin's Off / On for admin /
On for everyone switch; the migration removes its `game_config` row and function if they were run.

## 3. What it costs

One tiny call, `online_ping(device id)` (`src/store/online.ts`):

- every **5 minutes while the tab is visible**, on coming back to the tab (at most once per 5 minutes), and on opening
  the menu when the last answer is over a minute old. A hidden tab makes none.
- About **12 calls per hour of play**, against ~33 today (docs/66 §3): roughly a third more requests, each one row
  written and a count over a few hundred rows; the answer is one number. At the busiest hour so far (87 players) that's
  ~17 calls a minute, nothing for the database (docs/66 §1: ~2 % of one core).
- **No Realtime**: Supabase Presence would have told every tab of every join and leave (players × players messages)
  and used up the 500 Realtime connections (docs/66 §1) a second time.
- The table is **UNLOGGED** (no write-ahead log for a number that's gone in minutes; a database restart empties it,
  which costs at most 6 minutes of a smaller count), and rows older than an hour are cleared on 1 call in 20.

## 4. The database (`supabase/migrations/0144_players_online.sql`)

- No switch: the first version's `game_config` `playersOnline` row and `players_online_access()` go.
- `online_here (who text primary key, at timestamptz)`, unlogged, players can't touch it (RLS, admin only).
- `online_ping(p_device_id text) returns int`, for anon and authenticated: stamps the caller (`auth.uid()`, else
  `device:` and the device id; a device id over 80 characters counts as nobody) and returns the players stamped in the
  last 6 minutes.

## 5. Setting it up

1. Run the migration in Supabase's SQL editor (safe to run again; `supabase/seed.sql` doesn't carry it):
   <https://github.com/Splifingald/pokedice/blob/ccr-d1834cae-4wnqoz/supabase/migrations/0144_players_online.sql>
2. That's all: the line shows in every game from the next deploy (before the migration, it stays hidden).

## 6. Tests

- `tests/players-online-sql.test.ts` (PGlite, 0001/0144): no switch (the first version's row and function gone); each
  account or device counted once, for 6 minutes; a hand-made device id counts as nobody; safe to run twice.
- `/kitchen-sink` (Social and Settings, deep pass): the line for one player and for many.
