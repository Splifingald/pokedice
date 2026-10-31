# Live events: plan and build

Status: **built** (2026-10-11): questions → plan → Visual Lab mockups (`design/visual-lab/live.js`, Home tab, "Live
event" preview bar) → validation (§6) → integration, phases 1 and 2 (§6b, §6c). Branch `feature/events` only: the user
asked (2026-10-11) not to touch `feature/version_2` until they say so.

Event type 4 in the special events framework (docs/18): **Live events**, priority 2 (above Raids). They change the
whole game for a while, the same for every player, scheduled by you in the admin. No page of their own: a Home square
and a pop-up.

## 0. Decisions (your answers, 2026-10-11)

| Topic | Decision |
|---|---|
| Overlap | ~~One live event at a time.~~ **They may overlap** (2026-10-24, §9): each gets its square on Home; two of a kind add up. Two Undergrounds can't. |
| Scheduling | **Start and end date-times, UTC**, set in the admin; it starts and ends by itself (after a Publish). You can end one early. **Or recurring** (2026-10-24, §9): every year on a date, or on a weekday, every week or on some weeks of the month. |
| Strength | **Free numbers** (shiny ×5, ₽ +50 %…), shown as such to players. |
| Audience | Shown **after a set number of badges** (admin; the events teaser's 3 by default). |
| Pop-up | **Once per event per player**, the first time they're in the game while it runs: banner, title, what it does, time left. **OK**, plus **Go** for a Special Shop (to the shop). |
| Shiny Parade | **Wild encounters only** get the boosted odds, in the chosen **areas**, **region** or the **whole game**. Legendaries stay shiny-locked. |
| Special Shop | Items **at a special price**, items **never sold normally** (Master Ball, Rare Candy, stones…), and **a stock limit per player**. In one region, every region, or a mix (per item). Each event item shows the timer in the shop. |
| Cash Flow | **Every ₽ earned × the multiplier, selling excluded** (no buy/sell loop). |

## 1. What players see

### Home square (priority 2: first among the events)
- The **background** you pick (any area picture or event art, like the other squares' banners), the event's **title**,
  a **timer** ("Ends in 2 d 5 h") and a **gauge** of the time left.
- A tag in its corner per type: `×5 SHINY`, `SALE`, `+50 % ₽`.
- Tapping it: a Shiny Parade or Cash Flow reopens its pop-up; a Special Shop opens the shop.
- Before it starts (once Published), nothing shows; when it ends, the square goes.

### The pop-up (once per event)
- The banner, the title, one to three short lines saying what it does with its numbers ("Shiny Pokémon are 5 times more
  likely in Kanto", "Every ₽ you earn is +50 %"), the time left. **OK**; **Go to the shop** for a Special Shop.
- Queued like the others (after Prof. Oak's tutorials, the event unlock pop-ups).

### In the game, while it runs
- **Shiny Parade:** a small `×5 ✦` chip on the area header in a covered area (and on the encounter pop-up), so the
  boost is visible where it applies.
- **Cash Flow:** the victory card's ₽ line shows `+50 %` beside the amount; a small chip on the purse in the top bar.
- **Special Shop:** a "Special" section at the top of the shop: each item with its event price (the normal price
  struck out when it's a sale), "2 left" for a limited one, and the timer. Items normally sold keep their usual row too.

## 2. Data (admin-owned, game_config row `liveEvents`)

```ts
interface LiveEvent {
  id: string                      // stable, for "seen" and purchase counts
  type: 'shiny' | 'shop' | 'cash'
  start: string; end: string      // ISO, UTC
  endedEarly?: boolean            // "End now" sets end to now
  banner: string                  // picture key, as the other events' banners
  title: Record<Lang, string>     // see §6 question 1
  minBadges: number               // audience (default 3)
  // shiny
  shiny?: { multiplier: number; scope: 'areas' | 'region' | 'all'; areaIds?: string[]; regionId?: string }
  // shop
  shop?: { items: { key: string; price: number; limit: number | null; regions: string[] | 'all' }[] }
  // cash
  cash?: { multiplier: number }   // 1.5 = +50 %
}
```
- One row keeps it simple: the admin's list of past, live and future events (the game only looks at the live one).
- **Save:** `events.liveSeen: string[]` (pop-ups shown) and `events.liveBought: Record<eventId, Record<itemKey, n>>`
  (the per-player limit; a new event starts from zero).

## 3. Engine (pure, `src/engine/liveEvents.ts`)
- `liveEventAt(data, now)`: the event running at that server time, or null. Time is the server's (`serverNow`, already
  used by the wheel and raids), so it starts and ends at the same moment for everyone.
- `liveVisible(save, data, now)`: running and the player has `minBadges` (any region's badge count, like the teaser).
- **Shiny Parade:** `shinyOdds(data, area, live)` = `shinyChance × multiplier` when the area is covered, else
  `shinyChance`; `rollWild` takes it through its context (the shiny lock still wins for legendaries). Day Care eggs,
  trainers, bosses and raids are untouched.
- **Cash Flow:** one `earnedGold(amount, live)` = `round(amount × multiplier)` applied where ₽ is earned: trainer and
  gym victories (run.ts), the Elite Rebattle (rebattle.ts), ₽ found in areas (run.ts), the Game Corner (slots.ts), the
  wheel's ₽ (wheel.ts), the Day Care's ₽ (daycare.ts). Selling (run.ts) stays as it is.
- **Special Shop:** `liveShopItems(save, data, live)`: the event's items for the player's region, each with its price,
  limit and how many they've bought; `buyLiveItem` checks the limit and records it in `events.liveBought`.

## 4. Admin (Events section → "Live events")
- The list, newest first, each with its state (scheduled / live / ended) and **End now** on the live one.
- **New / Edit:** type, title, banner (picture picker + preview of the Home square), start and end (UTC, with the
  player's local time shown beside), badges needed, then the type's settings:
  - Shiny: multiplier, scope (areas: multi-pick / region / all).
  - Shop: item rows (item, price with the normal price beside, limit or none, regions or all).
  - Cash: multiplier.
- Overlap check on save. A preview of the pop-up.

## 5. Tests
- Unit: `liveEventAt` boundaries (start inclusive, end exclusive, ended early), overlap refusal, the shiny odds per
  scope and the legendary lock, `earnedGold` at every source and not on selling, the shop limit, the badge gate,
  save round-trip.
- E2E (server clock mocked like the raids): the pop-up once, the square's timer, a shop purchase up to its limit, a
  Cash Flow victory paying +50 %, a phone layout check of the square, pop-up and shop.

## 6. Settled at validation (2026-10-11)
1. **Titles:** the type's own name, translated ("Shiny Parade", "Special Shop", "Cash Flow"), with automatic details
   ("×5 shiny in Kanto"); an optional custom title per language for an occasion (empty languages show the English one).
2. **Home:** a **square** like the others, first among the event squares (priority 2), not a wide banner.
3. **Region-only shop items:** sold only while the player plays that region.
4. **Cash Flow on the wheel:** yes, the wheel's ₽ count as ₽ earned.

## 6b. Built (phase 1)
- `engine/liveEvents.ts`: `liveEvents` (the admin's list, normalised), `liveState`, `liveEventAt`, `badgesHeld`,
  `liveFor` (running + badges), `liveLeft`, `livePopupDue` / `markLiveSeen`, Cash Flow's `earnedGold` (amount + bonus)
  and `cashReward` (the wheel), the Shiny Parade's `liveCovers` / `shinyBoost`, the Special Shop's `liveShopRows` /
  `buyLiveItem` (a price is never below the Mart's buy-back, so buying to sell back can't pay), and the admin's
  `liveOverlap` / `liveProblems`.
- Cash Flow paid at: trainer and gym victories, ₽ found in areas, the Elite Rebattle, the Game Corner, the Day Care's
  ₽, the wheel (boosted when the spin is taken). The `gold` run event carries `bonus`.
- Shiny Parade: `EncounterContext.shinyBoost`, wild Pokémon only (legendaries stay shiny-locked).
- Store: `store/live.ts` (`currentLive` on the server's clock, `useLive`, `buyLive`, `markLivePopupSeen`).
- Admin → **Live events**: the list (state, Edit, End now, Delete) and the editor as a draft, applied only without
  problems (an overlap is refused).
- Save: `events.liveSeen` (last 50), `events.liveBought`.

## 6c. Built (phase 2) and the switch
- **The switch (the user's rule, 2026-10-11): every event type has Off / On for admin / On for everyone in the admin,
  Off by default** — the Fortune Wheel, Raids, the Elite Rebattle (`events.<id>.access`) and Live events
  (`liveEvents.access`); Small worlds will get one too. "On for admin" shows the event only while the admin is signed in,
  to try it in production first. The store puts who's playing into the game data (`data.viewer.admin`), the engine reads
  it (`eventOpenTo`), and `wheel_spin()` checks the same switch with `is_admin()` (0035). A row saved before this has no
  `access`: the event is off until switched on.
- `screens/events/live.tsx`: Home's **square** (the Day Care's frame and rows, the event's picture behind, a gold ring,
  LIVE, the type's tag, the time left as a draining gauge, red in its last 3 hours), the **pop-up** (once per event, after
  the other pop-ups and never mid-fight; again from the square), `ShinyParadeChip` (area plate, area cards, the encounter
  pop-up; said in the plate's and cards' labels too), `CashChip` (by the purse, the wheel's prize, the Game Corner),
  the victory card's `+50%` beside the ₽.
- The Poké Mart's **Special** section (`screens/Shop.tsx`): the event's picture and timer, its items with the usual price
  struck out or NEVER SOLD, what's left of each player's limit, SOLD OUT. The Shop tab wears SALE.
- Fixed on the way: an opened Mart tile on a phone spilled its quantity picker over the next row (the tile kept its
  closed height); it now grows with what it shows.
- 47 strings × 10 languages (`ui.live.*`). E2E `e2e/live.spec.ts`: the content reaches the game as a newer
  configVersion from the content cache (the way a player gets admin content), on a mocked server clock.
- The dev server reads `pokedice.devConfig` (localStorage JSON over the bundle's config): the e2e tests switch the
  events on with it; a production build has none of it.

## 7. Mockups (Visual Lab, Home tab: the "Live event" preview bar)
1. Home with the Live square for each type, first among the event squares, or **wide** over them (to choose).
2. The pop-up for each type (OK; OK + Go to the shop), with the time left, the end in the player's time and the gauge.
3. The shop with the Special section (a sale, a never-sold item, a limited one, the timer); buying to the limit.
4. In-game chips: the area plate and area cards `×5` with a sparkle (a pixel icon, not a ✦ glyph: Jersey has none), the
   purse `+50 %`, the Shop tab `SALE`, a trainer victory's ₽ counting up with `+50 %`.
5. The admin Live events list (state, End now) and editor (UTC dates with local time, overlap refused, per-type settings).
6. One more question from the mockups: **square or wide** on Home.

## 8. Integration phases (after validation)
1. Engine + config + save + admin editor + tests.
2. Home square, pop-up, in-game chips, shop section; strings in 10 languages; e2e + layout.

## 9. Overlapping and recurring events (2026-10-24)

The user's ask: *"I should be able to schedule overlapping live events. If that happens then each event gets their card
on the home page. I should be able to schedule by date like today or by 'recurring' and select either a specific date
(will happen every year) or day (every week) and specify which week of the month (like first only or second and
fourth)."*

### Overlapping
- **Any events may overlap**, except **two Undergrounds** (a player digs one at a time, with one team, and the server's
  `ug_live()` answers with one). The admin refuses only that overlap, looking two years ahead through recurring runs.
- **Home**: a square per event running for the player (`LiveSquares`), the earliest started first, after the small
  world's and before the other event squares.
- **Pop-ups**: each event's once, one after the other, the earliest started first (`livePopupNext`); a square reopens
  its own (`openLivePopup(id)`).
- **Two of a kind add up** (`LiveSet`: the engine's effects take one event or a list): two Cash Flows add their bonuses
  (+50 % and +50 % = +100 %, on the purse's chip too), two Shiny Parades their boosts where both cover an area
  (×5 and ×3 = ×7). Two Special Shops: a section each in the Mart, each with its own limits (bought by event id).
- Store: `useLive()` → `{ lives, now }`, `currentLive()` → the list, `buyLive(eventId, key, qty)`.

### Recurring
- `LiveEvent.repeat` (null = once, between `start` and `end`, as before):
  - `{ kind: 'yearly', month, day, time, hours }`: every year on that date (a 29 February: leap years only);
  - `{ kind: 'weekly', weekday, weeks, time, hours }`: on that weekday (0 = Sunday), every week (`weeks: []`) or on the
    weeks of the month listed: `1`–`4` (the 1st to the 4th of that weekday in the month) and `'last'`.
  - `time` is "HH:MM" UTC, `hours` its length: at most 168 for a weekly one (it never reaches the next week's), 744
    (31 days) for a yearly one.
- **Each run is an event of its own** for players: id `<id>@<YYYY-MM-DD>` (the UTC date it starts), so its pop-up,
  its shop limits, its push notice, its Discord post and the Underground's team, kits and orbs start afresh each time.
  The engine builds runs from the rule (`liveRuns`, `liveNextRun`, `liveById`, `liveStartsBetween`); the list holds only
  the rule.
- **End now** on a recurring event ends the running run only (`stops`: the run's date → when it ended); it comes back
  next time.
- **Admin**: the editor's **When**: *Once (dates)*, *Every year (a date)*: month, day; *Every week (a weekday)*: the
  weekday and the weeks of the month (Every week, 1st, 2nd, 3rd, 4th, Last), then the start time (UTC) and how many
  hours, with the next three runs (UTC and your time). The list shows each event's run on or next, and a **Comes back**
  column ("The 1st and 3rd Saturday of each month, 20:00 UTC, for 6 h").
- **Server**: `live_run_at(e, t)` (0072) is the engine's `liveRuns` in SQL, and `ug_live()` uses it, so a recurring
  Underground's teams and orbs work as a one-off one's. `tests/live-recurring-sql.test.ts` compares the two over three
  months of moments.
- No new switch: it's the admin's scheduling of the live events, behind their own switch (`liveEvents.access`, §6c),
  and players see nothing new to learn (a square and a pop-up per event, as before).

### Setting it up
1. Run in Supabase → SQL Editor (it redefines `ug_live()`; without it, a recurring Underground doesn't open its teams):
   https://github.com/Splifingald/pokedice/blob/ccr-09f15ba6-0tg5ou/supabase/migrations/0072_live_recurring.sql
   (`supabase/seed.sql` inlines it too, after 0071).
2. Admin → Events → Live events → New live event → **When**, then Save & Publish.


## 10. Live event pictures, picked by default (2026-10-31)

The user's ask: banners made in Gemini (prompts: BASE + one scene, 16:9, the Johto Daybreak style block of
`design/visual-lab/bgs.js`), shrunk like the others, and *"when I select a live event, it automatically picks the right
banner by default"*, the type's own banners as defaults too.

- **The pictures** (`public/backgrounds/live-*.png`, 400 × 223, true pixel art, listed under the admin's **Event
  pictures**). Per type: Shiny Parade (sparkling lakeside meadow, aurora), Cash Flow (coin fountain, treasure on the
  pier), Underground (lantern-lit mine, gems and cart); a Special Shop has none yet. Per occasion: Halloween, winter
  (snowy town, tree, gifts), New Year, spring, summer, celebration. Each keeps its centre calm for the pop-up's big ×5
  / +50 %, its motifs at a quarter and three quarters across.
- **Made with** `pnpm unpixel <in> <out> --px <source width / 400> --width 400`: Gemini drew these on grids 240 to 480
  art pixels wide, and `--width` alone pads or crops a grid to 400 rather than scaling it; `--px` reads the picture on
  a 400-wide grid instead. JPGs are turned into PNGs first.
- **The default** (`liveDefaultBanner`, engine): the occasion of the day halfway through the event wins (UTC: 15 Oct –
  7 Nov Halloween, 1 – 25 Dec winter, 26 Dec – 10 Jan New Year, March – May spring, June – August summer), else the
  type's own (a Special Shop: the celebration). A yearly event takes its date; a weekly one, back all year, its type's.
  The Underground is always its cave, the place players dig in.
- **Admin**: a new event starts with its default; while the picture is the default (or none), changing the dates, the
  type or the repeat moves it to the new one; a picture picked by hand stays. An event saved with no picture gets its
  default the next time it's edited. Players see nothing new to learn: no switch (it's the admin's picture picker,
  behind Live events' own switch).
