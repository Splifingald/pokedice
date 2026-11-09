# 70 · Players online

The ask, 2026-11-09: "At the bottom of the side menu, above the save sync button add the amount of players currently
online. If it isn't too costly."

**Status (2026-11-09): built** on `ccr-d1834cae-4wnqoz` (from `version/2_9_7`), **Off** until the admin switches it on. Migration
`0144_players_online.sql`.

## 1. What players see

- At the foot of the side menu (the avatar's drawer), just above **SYNC ONLINE**: a green dot (a friend online's,
  docs/65) and "**12 players online**" (one: "1 player online"), in all ten languages. Guests see it too: SYNC ONLINE
  is only for signed-in players, so for a guest the line is the last thing in the list.
- "Online" means the game open on a visible tab in the last 6 minutes, guests included: the account when signed in,
  else the guest's device. An account on two devices counts once; a guest who signs in may count twice for a few
  minutes.
- Hidden until the server has answered (no "0", no placeholder), when the switch is closed to the player, offline, or
  before the migration is run.
- **No rules and no INFO** (docs/15 §20, as a passive announcement): there is nothing to do or learn, the line says it
  all.

## 2. The switch

Admin › Config › Feature switches › **Players online (side menu)**: Off / On for admin / On for everyone, **Off by
default**. The server reads the same row (`game_config.playersOnline`):

- **Off**: the game makes no call, and a call from an old build or by hand writes nothing and gets nothing.
- **On for admin**: every game says it's open (so the number is real), but only the admin, signed in, is told and sees
  the line.
- **On for everyone**: everyone sees it.

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

- `game_config` `playersOnline`: `{"access": "off"}`, left alone when there; `configVersion` + 1.
- `online_here (who text primary key, at timestamptz)`, unlogged, players can't touch it (RLS, admin only).
- `online_ping(p_device_id text) returns int`, for anon and authenticated: the switch Off → null, nothing written;
  else stamps the caller (`auth.uid()`, else `device:` and the device id; a device id over 80 characters counts as
  nobody), and returns the players stamped in the last 6 minutes when the switch is open to the caller (`access_open`,
  0131), else null.

## 5. Setting it up

1. Run the migration in Supabase's SQL editor (after 0131; safe to run again; `supabase/seed.sql` doesn't carry it):
   <https://github.com/Splifingald/pokedice/blob/ccr-d1834cae-4wnqoz/supabase/migrations/0144_players_online.sql>
2. Admin › Config › Feature switches › **Players online (side menu)** → On for admin, Save, Publish; open the side menu
   to check the number. Then On for everyone.

## 6. Tests

- `tests/players-online-sql.test.ts` (PGlite, 0001/0144): lands Off; Off writes and answers nothing; On for admin
  counts every game but tells only the admin; On for everyone counts each account or device once, for 6 minutes; a
  hand-made device id counts as nobody; safe to run twice.
- `/kitchen-sink` (Social and Settings, deep pass): the line for one player and for many.
