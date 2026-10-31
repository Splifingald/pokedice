# The gift calendar

The user's ask (2026-10-31): *"Build a daily calendar feature for gifts (will be used for advent but should be usable
later too). I should be able to choose start date, number of days and the reward per day. Rewards can contain items,
pokedollars and pokemon. Only 1 reward per day but multiple quantity of the same reward possible. A day missed can be
gathered the next day but not more (so missing 2 days really makes it missed)."* Then: *"It should be part of live
events"*, and *"propose a calendar for 1st of December to 24th"* (§5).

**Status: built** on `version/2_8`, behind its switch, **Off** (docs/15 §20). The migration is **0100**.

## 1. Decisions

| Question | Answer |
|---|---|
| Where it lives | A **live event type**, *Gift calendar* (docs/20), beside the Shiny Parade, the Special Shop, Cash Flow and the Underground: Admin → Events → Live events → New live event → Type |
| Its switch | Its own, `giftCalendar.access` (Off / On for admin / On for everyone, **Off** by default), on top of the live events' one, as the Underground has. It sits in the calendar's editor. Off: no card, no notice, no page, no push, no Discord post |
| Dates | The admin picks **when day 1 opens** (UTC, with their own time beside) and **how many days** (1 to 31). Each next door opens 24 hours later, at the same time. A calendar runs **once** (no yearly or weekly repeat: copy it next year) |
| The end | Set by itself: **the day after the last door** (its catch-up day), so a 24-day Advent from 1 December 00:00 UTC ends on 26 December 00:00 UTC. *End now* still ends it early (every door not opened is then missed) |
| A day's reward | **One** per day: an **item** and how many (1–999), **Pokédollars** (₽1–999,999), or a **Pokémon** (its level, shiny or not, and how many: 1–6, each a Pokémon of its own) |
| Missing a day | A door opens on **its day** or **the next day** (the catch-up, "LAST CHANCE"); **two days on it is missed** for good |
| What the clock is | **The server's** (`event_time`), as every live event: changing the device's clock opens no door early |
| Where a reward lands | **The region being played**, as the developer's gifts do (`placeGifts`, docs/15 §23): its Bag, its ₽, its Box, or the team when there's room. Cash Flow doesn't touch it (a gift, not ₽ earned) |
| Once per player | The doors opened are kept **in the save** (`events.calendarOpened`, per calendar), synced with the cloud like the rest, as the Special Shop's limits are |
| Extreme mode, small worlds | **Neither**: the calendar is the main game's (an Extreme save has its own and would open the doors twice), and no live event reaches inside a small world (docs/21): a player inside one steps out to open the day's door |
| Badges | The live events' *Shown from (badges)* applies (0 = everyone) |
| Several at once | Possible: each its own card and page (`/calendar?id=…`) |
| Surprise | A door to come shows only its number (a wrapped gift); its reward shows once opened. A missed door shows what it held, faded |

## 2. What players see

- **Home**: the live card (the event's picture with three gifts bobbing, the name, a gold GIFTS tag, the line, the time
  left draining). **Gold** while a door waits; its line says which: "Day 5's gift is ready!", "Day 4: last chance!",
  "2 gifts to open!", else "Next door in 5h 12m", then "Every door is open!". A tap opens the calendar's page.
- **The opening is announced** by a Home notice ("Gift Calendar is open!" → the page), until its rules card is read; no
  pop-up over Home (docs/43 §7: a feature with a page of its own).
- **The page** (`/calendar`): the picture with its plate (back, the name, the time left); **its rules** as a card at
  the top the first time (GOT IT, `events.calendarRulesSeen`, once for every calendar); **the doors** in rows of 4 on a
  phone, 6 from 640 px, with "6 of 24 opened · 2 missed"; a gold line on what to do now; the dock's red **OPEN DAY n**
  (yesterday's door first: it closes sooner), or a disabled "Next door in …", and **INFO** (the rules again).
- **A door** (`CalendarDoorTile`): shut (a navy gift tied with a gold ribbon, its number on a tag; "Day 13: opens in 3d
  2h"); today's (gold, its gift wobbling, OPEN); yesterday's (cream, a red ring, LAST CHANCE); opened (what it held,
  ×n, Lv., ₽, a check); missed (hatched, what it held faded, "Missed").
- **Opening one** plays the developer's gifts' opening (`GiftMoment`, full screen), its first line "Day 5's gift!", then
  what arrived and where it went; DONE.
- **Push** (docs/27): the live events' start notice ("Gift Calendar has begun! A new gift every day for 24 days…"),
  opening `/calendar`. **Discord** (docs/50): the start post and the week's calendar list it (🎁).

## 3. Code

- **Engine** `src/engine/calendar.ts` (pure): `calendarOn`, `calendarsFor` (switch, Extreme, badges, small world),
  `calendarEnd`, `calendarToday`, `calendarDoors` (each door's state), `calendarReady`, `calendarNextAt`,
  `openCalendarDay` (the reward into the save, the day kept; the last 12 calendars' doors kept), `calendarGifts`,
  `calendarRulesDue` / `markCalendarRulesSeen`, and the admin's `normaliseCalendarReward`, `resizeCalendar`,
  `calendarProblems` (in `liveProblems`). `liveEvents.ts`: the `calendar` type, `liveTypeOn` (its switch, also read by
  the push schedule and the Discord scripts), a calendar never in an Extreme save, never recurring.
- **Types**: `LiveEvent.calendar.days: CalendarReward[]`, `GameConfig.giftCalendar`, `EventsSave.calendarOpened` /
  `calendarRulesSeen` (and the save schema).
- **Store** `src/store/calendar.ts`: `useCalendars`, `openCalendarDoor` (then `GiftMoment` with `source: 'calendar'`),
  `calendarRulesSeen`.
- **UI**: `src/components/Calendar.tsx` (doors, grid, the reward's icon and words, the rules), `src/styles/calendar.css`,
  `src/screens/events/Calendar.tsx` (the page), the live card in `EventWidgets.tsx` / `live.tsx`, the notice in
  `screens/home/Notices.tsx`; every state on `/kitchen-sink` (`CalendarBits`).
- **Admin** `src/admin/sections/CalendarBox.tsx` under the live event's editor: the switch, *Days*, a row per day (its
  UTC date, Item / Pokédollars / Pokémon and their fields), and **Fill with the Advent proposal (24 days)**.
- **Strings**: `ui.live.calendar.*`, `ui.cal.*`, `ui.rules.cal.*`, `ui.push.live.calendar`, ten languages.
- **Tests**: `tests/engine/calendar.test.ts`, `e2e/calendar.spec.ts`.

## 4. Setting it up

1. Run in Supabase → SQL Editor (the switch's row, Off; `supabase/seed.sql` inlines it too, after 0098):
   https://github.com/Splifingald/pokedice/blob/version/2_8/supabase/migrations/0100_gift_calendar.sql
2. Admin → Events → Live events → **New live event** → Type **Gift calendar**. Set **Day 1 opens (UTC)**: for Advent at
   midnight in France, **30 Nov 23:00 UTC** (Paris is UTC+1 in winter); 1 Dec 00:00 UTC opens it at 01:00 there.
3. **Fill with the Advent proposal (24 days)**, or set *Days* and each day by hand. A custom title (e.g. "Advent
   Calendar" / "Calendrier de l'Avent") if you like; the picture follows the dates (Advent's is the winter town).
4. Switch **Gift calendars** to *On for admin*, Add to the list, **Save & Publish**, and try it signed in as admin;
   then *On for everyone* and Save & Publish again.

## 5. The Advent proposal (1 – 24 December)

Winter Pokémon, two stones that evolve two of them, Rare Candies, two Master Balls and ₽11,000 over the month, a shiny
Delibird on the 24th. ₽ in this game is small (a trainer pays half the levels it fielded; an Ultra Ball costs ₽100), so
₽1,000–5,000 is a real gift. The admin's button fills exactly this (`ADVENT_PROPOSAL`).

| Day | Gift | Day | Gift |
|---|---|---|---|
| 1 | ₽1,000 | 13 | Master Ball ×1 |
| 2 | Ultra Ball ×10 | 14 | Spheal Lv.18 |
| 3 | Swinub Lv.10 | 15 | ₽3,000 |
| 4 | Rare Candy ×3 | 16 | Snover Lv.20 |
| 5 | Ice Stone ×1 (for day 12) | 17 | Max Ether ×5 |
| 6 | Snorunt Lv.12 | 18 | Dawn Stone ×1 (Snorunt → Froslass) |
| 7 | Max Revive ×3 | 19 | Frigibax Lv.20 |
| 8 | ₽2,000 | 20 | Rare Candy ×10 |
| 9 | Cubchoo Lv.15 | 21 | Lapras Lv.25 |
| 10 | Rare Candy ×5 | 22 | ₽5,000 |
| 11 | Hyper Potion ×10 | 23 | Master Ball ×1 |
| 12 | Eevee Lv.15 (+ day 5's Ice Stone = Glaceon) | 24 | ✦ Shiny Delibird Lv.30 |
