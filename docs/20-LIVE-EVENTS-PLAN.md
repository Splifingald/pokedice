# Live events: plan (for validation)

Status: **mockups, step 3 of 5** (2026-10-11): questions (done) → this plan (done) → Visual Lab mockups (done:
`design/visual-lab/live.js`, Home tab, "Live event" preview bar) → your validation → integration. Branch
`feature/events`, fast-forwarded into `feature/version_2` once green.

Event type 4 in the special events framework (docs/18): **Live events**, priority 2 (above Raids). They change the
whole game for a while, the same for every player, scheduled by you in the admin. No page of their own: a Home square
and a pop-up.

## 0. Decisions (your answers, 2026-10-11)

| Topic | Decision |
|---|---|
| Overlap | **One live event at a time.** The admin refuses to schedule two that overlap. |
| Scheduling | **Start and end date-times, UTC**, set in the admin; it starts and ends by itself (after a Publish). You can end one early. |
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

## 6. Questions to settle at validation
1. **Titles in 10 languages:** (a) you type the title per language in the admin (English required, others fall back
   to it), or (b) each type has a fixed title from the strings ("Shiny Parade", "Special Shop", "Cash Flow") plus
   automatic details ("in Kanto", "×5") — no typing, always translated. *I'd suggest (b), with an optional custom
   title per language for special occasions.*
2. **Shop items in other regions:** a Special Shop item set to "Kanto" — sold only while playing Kanto, or shown
   everywhere but deliverable only to the Kanto bag? *I'd suggest: sold where the player is playing, if that region is
   in the item's list.*
3. **Cash Flow on the Fortune Wheel's ₽:** included (as all ₽ earned) — confirm.

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
