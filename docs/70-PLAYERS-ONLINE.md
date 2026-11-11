# 70 · Players online

The ask, 2026-11-09: "At the bottom of the side menu, above the save sync button add the amount of players currently
online. If it isn't too costly."

The second ask, 2026-11-11: "Add a small eye icon and button next to the counter with text "view" that opens a pop up
that lists the online players. Up to 30, if you need to chose take those that are the closest in terms of
progression."

**Status (2026-11-09): built** on `ccr-d1834cae-4wnqoz` (from `version/2_9_7`). The user's call the same day: **no
switch, on for everyone** (an exception to docs/15 §20, as global messages, docs/69). Migration
`0144_players_online.sql`. **The list (2026-11-11)**: built on the same branch, from `version/2_9_7`; migration
`0146_players_online_list.sql` (0145 is Friend Battles' switch cooldown). It shares the count's no-switch call.

## 1. What players see

- At the foot of the side menu (the avatar's drawer), just above **SYNC ONLINE**: a green dot (a friend online's,
  docs/65) and "**12 players online**" (one: "1 player online"), in all ten languages. Guests see it too: SYNC ONLINE
  is only for signed-in players, so for a guest the line is the last thing in the list.
- "Online" means the game open on a visible tab in the last 6 minutes, guests included: the account when signed in,
  else the guest's device. An account on two devices counts once; a guest who signs in may count twice for a few
  minutes.
- Hidden until the server has answered (no "0", no placeholder): offline, or before the migration is run.
- **VIEW** at the line's end (a white `sm` button, an eye drawn for it, `PixelIcon` `eye`): a pop-up, **Players
  online**, lists them, each with their look, their name and their badges (a badge icon and the count), most badges
  first; your own row is gold with the board's "you" tag. **Up to 30**: when more are online, the 30 **closest to you
  in badges** (every region's badges together, the main save's, as global messages count them, docs/69; then the most
  recently heard from), and a line over the list says so. Loading, a failure in words ("You're offline" when it is),
  and "Nobody to show yet" are its other states. It asks the server each time it opens.
- Each one's card is the game's word, sent with the 5-minute call: the name (12 characters, "Trainer" when empty, as
  the leaderboard does), the look, the badges. No id, account or device leaves the server. A game from before the list
  (an older build still open) is counted but not listed until it reloads.
- **No switch, no rules and no INFO** (docs/15 §20): there is nothing to do or learn, the line says it all.

## 2. No switch

On for everyone from the start (the user's call, 2026-11-09). The first version had the admin's Off / On for admin /
On for everyone switch; the migration removes its `game_config` row and function if they were run.

## 3. What it costs

One tiny call, `online_ping(device id, name, look, badges)` (`src/store/online.ts`):

- every **5 minutes while the tab is visible**, on coming back to the tab (at most once per 5 minutes), and on opening
  the menu when the last answer is over a minute old. A hidden tab makes none.
- About **12 calls per hour of play**, against ~33 today (docs/66 §3): roughly a third more requests, each one row
  written and a count over a few hundred rows; the answer is one number. At the busiest hour so far (87 players) that's
  ~17 calls a minute, nothing for the database (docs/66 §1: ~2 % of one core).
- **No Realtime**: Supabase Presence would have told every tab of every join and leave (players × players messages)
  and used up the 500 Realtime connections (docs/66 §1) a second time.
- The table is **UNLOGGED** (no write-ahead log for a number that's gone in minutes; a database restart empties it,
  which costs at most 6 minutes of a smaller count), and rows older than an hour are cleared on 1 call in 20.
- The list is one more call, `online_players(device id)`, only when VIEW is pressed: at most 30 small rows, read from
  the same few hundred.

## 4. The database (`supabase/migrations/0144_players_online.sql`, `0146_players_online_list.sql`)

- No switch: the first version's `game_config` `playersOnline` row and `players_online_access()` go.
- `online_here (who text primary key, at timestamptz)`, unlogged, players can't touch it (RLS, admin only).
- `online_ping(p_device_id text) returns int`, for anon and authenticated: stamps the caller (`auth.uid()`, else
  `device:` and the device id; a device id over 80 characters counts as nobody) and returns the players stamped in the
  last 6 minutes.
- 0146: `online_here` gets `name`, `look`, `badges` (null for an older build's row). `online_ping` takes the card
  (`p_name`, `p_look`, `p_badges`, all optional: the one-argument function goes, so an older build's call lands on
  this one); a name is trimmed to 12 characters ("Trainer" when empty), a look must look like an avatar id
  (`[a-z0-9/_-]`, else none: the game draws Red), badges 0–999 (else no card). `online_players(p_device_id text)
  returns jsonb`, for anon and authenticated: `[{name, look, badges, me}]`, up to 30 rows with a card heard from in
  the last 6 minutes, the closest to the caller's badges first (a caller with no card is taken as 0), returned most
  badges first.

## 5. Setting it up

1. Run the migrations in Supabase's SQL editor, in this order (each safe to run again; `supabase/seed.sql` carries
   neither). Once 0146 has run, don't run 0144 again: it would bring back the one-argument `online_ping` beside the
   new one.
   - <https://github.com/Splifingald/pokedice/blob/version/2_9_7/supabase/migrations/0144_players_online.sql>
   - <https://github.com/Splifingald/pokedice/blob/ccr-d1834cae-4wnqoz/supabase/migrations/0146_players_online_list.sql>
2. That's all: the line shows in every game from the next deploy (before 0144, it stays hidden; before 0146, VIEW says
   it couldn't load the list).

## 6. Tests

- `tests/players-online-sql.test.ts` (PGlite, 0001/0144/0146): no switch (the first version's row and function gone);
  each account or device counted once, for 6 minutes; a hand-made device id counts as nobody; each card as sent (the
  name cut, an odd look dropped, "Trainer"), most badges first, the caller marked, no ids; an older build's ping
  counted but not listed; odd badges are no card; over 30, the closest in badges; a caller with no card taken as 0;
  safe to run twice.
- `/kitchen-sink` (Social and Settings, deep pass): the line for one player and for many, with VIEW; the pop-up's
  inside loading, failed, with nobody, with a few players, and cut to the 30 closest.
