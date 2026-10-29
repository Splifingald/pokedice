# Saves overwritten by old pages, and a world closed early (2026-10-29)

Reported on Discord on 2026-10-29: Ceurana found Haunted Hollow started over ("Zones 0/11"), and ysaxxx lost his
legendary raids, his rebattles, Haunted Hollow finished at 100 % and his General upgrades, his Pokémon and regions
intact. Two causes, unrelated to version 2.5 itself; both fixed in 2.5.1.

## 1. What the database and its API logs showed

**Old pages writing saves back.** Since 2026-10-22 the game uploads a save only over the copy it last matched (an
update filtered on the row's stamp; docs/21 §12) and inserts only when it knows of no row. Builds from before then
upload with a plain upsert, written over whatever the row holds. Those pages don't go away: a tab left open on a phone
or a PC resumes on its old code for a few minutes before it reloads, and every upload it makes in that time reads the
save through its old schema — dropping every part its build never knew — and writes it back. In the API logs
(`edge_logs`, a `POST /rest/v1/saves` with no `select=updated_at`):

- 46 players overwritten from 25 to 29 October (20, 15, 5 and 6 new ones a day), out of ~370 playing.
- ysaxxx: a Safari page on his iPhone from before 2026-10-11 (it reads the save without `realm`) wrote at 05:52:10
  UTC; his current page, on the same phone, then took that copy from the browser's storage and uploaded it at 05:52:38.
  Gone: `events` (raids won, rebattles, Haunted Hollow finished) and `general`.
- Hougo: the save rolled back to 2026-10-15, with 15 hours played since. Maxlaflamme: 3 raids. Most of the others kept
  their progress and lost what their old page's build didn't know (bought Mega Gems, wheel tickets, `playedAt`…).
- Two pages at once happen too: on one Android phone the current page's upload went in at 07:33:44.075 and an old
  page's plain upsert over it 7 ms later.

**Ceurana's world, closed by their own phone.** The only save in the database with Haunted Hollow closed but not
finished. Their phone, on the current build, uploaded 167.8 KB at 15:41 UTC on 2026-10-25 and 158.4 KB at 15:56, right
after the app came back to the foreground at 15:52 and 20 minutes after their last catch there: the world's block
deleted and its 30 Pokémon sent home (`events.worldHome`), as at the world's end, a week early. The content was the
latest (no new read then; the admin had only added a wild row at 15:17), so it was the time: the world clock read
`serverNow()`, the device's clock plus the offset from the last reading, and the device's clock can move between two
readings; a reading whose round trip spanned a frozen page could also be off by half of it.

## 2. The fix

| Piece | What it does |
|---|---|
| Migration **0088** `saves_no_overwrite` | An insert where the player's save already exists fails with unique_violation (23505), before an upsert can turn into an update. Old pages' uploads are refused; the game today never inserts over a row and already reads 23505 as "another device saved first, compare again". A first upload, and an Extreme save's first one, insert as before. |
| `decideSync` (src/save/cloud.ts) | Level on progress, a copy without `playedAt` — written by a page from before 2026-10-22 — loses to one with it, however recent its stamp (`writtenSincePlayedAt`). Progress still comes first. |
| `adoptStoredSave` (src/store/sync.ts) | Never takes in a copy another tab stored without `playedAt` when its own has it, and puts its own back on the device, so a reload starts from it. |
| `keepBoth` (src/store/sync.ts) | Whichever copy wins keeps, besides the General upgrades and looks: raids won (`keepRaidsDone`), rebattle tiers (`keepRebattleTiers`, the further one per region), small worlds finished (`keepWorldsDone`) and Mega Gems held (`keepGemsHeld`). None is progress the compare counts. |
| Migration **0089** `raid_progress_mine` | The caller's own raid keys from `raid_progress_done`, which no page can overwrite. At sign-in the game adds back any its save lost (`restoreRaidsDone`, only ever adds): ysaxxx's 7 raids, Maxlaflamme's 3 and the single ones come back by themselves. |
| The world clock (src/store/worlds.ts) | A world closes for its end on `trustedNow()` — the server's last reading carried on the page's own steady clock (store/clock.ts) — never on the device's. Sending a player out of a world switched off loses nothing and keeps `serverNow()`. |
| `syncServerTime` (src/store/serverTime.ts) | A reading whose round trip took more than `MAX_ROUND_TRIP_MS` (20 s) on either clock, or during which the device's clock went back, is dropped; the last one stays. |

Not repaired by this: the parts of a save no server record keeps — General upgrade levels, rebattle progress, a world
finished or under way, bought Mega Gems, days of play rolled back (Hougo). Only a database backup from before the
overwrite has them.

Tests: `tests/saves-no-overwrite-sql.test.ts` (0088 on PGlite: the old upsert refused, every write the game makes kept),
`tests/raids-done-mine-sql.test.ts` (0089), `tests/raids-restore.test.ts`, `tests/engine/keep-for-good.test.ts`,
`tests/sync.test.ts` and `tests/cloud-mark.test.ts` (the old page's copy never wins), `tests/world-clock.test.ts` (the
device's clock past the end closes nothing), `tests/server-time.test.ts`.

## 3. Setting it up

1. Run in the Supabase SQL editor, in this order (each is safe to run again):
   - [`supabase/migrations/0088_saves_no_overwrite.sql`](https://github.com/Splifingald/pokedice/blob/ccr-79644590-8zaznw/supabase/migrations/0088_saves_no_overwrite.sql)
     (already run on the live database on 2026-10-29)
   - [`supabase/migrations/0089_raids_done_mine.sql`](https://github.com/Splifingald/pokedice/blob/ccr-79644590-8zaznw/supabase/migrations/0089_raids_done_mine.sql)
2. `supabase/seed.sql` inlines both (scripts/seed.ts), for a fresh database.
3. Until 0089 runs, the game skips the raids' restore quietly; nothing else waits on it.
