# Anti-cheat (2026-11-01)

A player's save is their own: it lives in their browser and their cloud row, and the game is playable offline, so
nothing stops someone from editing their own game. That is accepted. What this work stops is an edited save reaching
**other players** (trades, boards, Versus, raids, area versus) and claims nobody could have earned, without adding
server cost: every check is a few lines of SQL in a function or trigger that already runs. No fight is replayed on the
server.

The rule: **your own game is yours to break; anything that reaches another player is checked by the server.**

Every limit was set from the live data of 2026-11-01, well above what any honest player had reached, so nothing
changes for honest play.

## 1. What changed

| Where | Before | Now |
|---|---|---|
| Internal League functions (`versus_league_join`, `_offer`, `_seat_bots`, `_close_week`, `_ensure_week`, `_tick`, `_tick_if_due`, `player_powers`) | Revoked from `public` only, so still callable by anon and authenticated (Supabase grants new functions to both) | Revoked from both; only the server's own functions and jobs call them |
| Trades: species | Any dex number was accepted, and one the receiver's game didn't know froze all their trades | A species the game doesn't have is untradable; the game applies each trade on its own (`src/store/trades.ts`), so one bad trade never holds back the others |
| Trades: what a listing keeps | The whole instance, whatever it held | A clean copy: known fields only, each small, the level a whole number from 1 to 100 (`trade_clean`) |
| Trades: rollbacks and two tabs | Nothing remembered a Pokémon that left; two tabs could give the same one twice | `trade_gone` keeps every Pokémon given in a trade, for good, so it never trades again from its old trainer; a trigger re-checks "already in a trade" under a lock on that player |
| Boards: the card | Name, levels, Pokédex, team, regions and areas copied from the save; the save's own clock dated the card | The name loses invisible characters and stacked accents (`name_clean`); only the game's regions and areas; level ≤ 100; Pokédex ≤ what the region can hold; a team of at most 6 Pokémon the game has; never more gyms than an area has; the card is never dated later than the server's clock |
| Extreme speedrun | The time came from the save, and so did the server's "watch" | The server's clock (`now()`); a run first seen already won gets no time; a time under 30 minutes isn't kept (`extreme.minRunMs` overrides it if ever set) |
| Raids | A raid could be closed won without a fight | It needs a team registered for it at least 30 s before (the game registers it when the fight starts); at most 20 progression raids a UTC day (the record is 13) |
| Versus League | Several matches could run at once; a win could have an empty log; 5 s minimum | One match at a time (starting one ends the unfinished one as the leave it was recorded as); a win needs an attack in its log; `minWinSeconds` 30 (the fastest honest wins take 45 s) |
| Teams others meet (Versus, raids, area versus) | Any dex, battle forms included | Only Pokémon the game has, base or regional form, level 1–100. Area versus skips a bad team quietly (it is written while the save uploads, which must never fail) |
| Versus teams | A team could change without limit, each a new team to beat | At most 30 changes a UTC day; at most 200 fights recorded an hour |
| A ban | Hid the player from the boards only | Hides them from everything shared: their Versus, raid and area versus teams go, their open listings are cancelled (the Pokémon go back), their League trophies this week go to 0, and the triggers refuse new ones until the ban is lifted |
| `saves` | A player could delete their row directly; no size limit | Deleting goes through `delete_my_data` only; a save over 8 MB is refused (the largest honest one is about 1 MB) |
| Push (still Off) | Any `https://` endpoint, any due time | Only the browsers' push services; a notice already overdue isn't kept; the sender gives each push 5 s |
| Guests | Messages and analytics rows limited per device id, which is the guest's own word | At most 20 guest messages every 10 minutes in all; at most 3,000 new guests a day in the analytics (the record is 361) |
| The game's clock (`serverNow`) | The device's clock plus the last offset, so moving it between two readings moved events, the wheel and the Underground's kits | The last reading carried on the page's steady clock (`trustedNow`, as the worlds' clock already was) |
| A raid try | Counted before the fight started | Counted once it has started; a friend's Pokémon the game doesn't know is left out of the fight |

## 2. Seeing a cheater: Admin → Analytics → Suspicious saves

FETCH lists every cloud save with something no honest game has reached, and why: a Box too big for the days played,
too many shinies or Lv.100s, over ₽5,000,000, Rare Candies over 1,000 or Master Balls over 100 or any stack over
9,999, a Pokémon still held after it was traded away, a Pokédex at its region's cap, a save dated in the future. It reads
every save (about a second), so only on demand (`admin_suspicious()`, admin only). A row opens the player's panel, where
**BAN** is.

A flag is a lead, not proof: events and the Shiny Dex explain some shinies, and a duplicate from before 2026-10-29 can be
an old page's rollback (docs/49).

## 3. What stays open, on purpose

- Editing your own save: gold, items, levels for your own game. Blocking it would mean a server-run game and no
  offline play.
- Results of fights played in the browser (Versus, the League, raids) are bounded and checked for shape and time,
  not replayed: replaying them on the server is the cost this work avoids. The suspicious list and the ban are the
  backstop.
- The Day Care, Eggs and fossils still read the device's clock: they settle when the save loads, before the first
  reading of the server's, and offline play needs them.

## 4. Setting it up

1. Run in the Supabase SQL editor, after 0108 (safe to run again):
   [`supabase/migrations/0114_anti_cheat.sql`](https://github.com/Splifingald/pokedice/blob/ccr-47b7b5da-qaz2eu/supabase/migrations/0114_anti_cheat.sql)
2. `supabase/seed.sql` doesn't carry it: it needs the optional features' tables (trades, raids, push, the League, area
   versus), which seed.sql leaves out.
3. It changes one admin setting: the League's `minWinSeconds` goes from 5 to 30 where it was lower.

Tests: `tests/anti-cheat-sql.test.ts` (0114 on PGlite, over every migration before it), `tests/server-time.test.ts`,
`e2e/admin-analytics.spec.ts` (the suspicious list).
