# Pokédice — live events on Discord

> **What this gives:** `#🎉-events` on the Discord server follows the live events the admin schedules, by itself:
> **a calendar of the week every Monday**, and **a post as each event starts**, with everything it does and its
> banner. Built like the weekly Ko-fi update ([docs/23 §11](23-DISCORD-SERVER.md#11-the-weekly-ko-fi-update--support-me)):
> a script, a GitHub workflow, the `#🎉-events` webhook. No database change, no new secret.
>
> **Your part:** [Setting it up](#setting-it-up) at the end, about 10 minutes.

## 1. Proposal

### What players see in `#🎉-events`

**Monday, about 08:20 in Paris: the week's calendar.** One post, no ping:

```
3 live events this week!

🗓️ Live events calendar
This week: 28 Dec – 3 Jan
               M T W T F S S
  Special Shop · ████████· ·
  Cash Flow    · · · · ██· ·
  The Undergr… · · · · · ████

🛒 Special Shop: Special prices and rare items in the shop: Master Ball, Raid Ball, Potion +1 more.
   Tue 29 Dec 13:00 → Fri 1 Jan 13:00 · 🏅 8+ badges
💰 Cash Flow: +50% on every ₽ you earn.
   Fri 1 Jan 19:00 → Sat 2 Jan 01:00 · 🔁 every Friday
⛏️ The Underground: Dig for orbs, fossils and plates in the Underground.
   Sat 2 Jan 10:00 → Sun 3 Jan 22:00

Next up: 💰 Cash Flow, in 11 days
Play now
[the first event's banner]
```

- The chart is the calendar: a column per day, a bar on the days each event is on. It fits a phone.
- The times are Discord timestamps: each member reads them in their own time zone and language. The chart's days are
  UTC (the footer says so).
- An event already running on Monday morning shows **🟢 On now, ends in 5 hours**.
- **Next up** names the first event after the week (up to four weeks on), so a quiet week still has something to wait
  for.
- **A week without any event posts nothing**: no "nothing this week" noise.

**When an event starts: its own post**, pinging **Event Pings**:

```
@Event Pings 🛒 Special Shop is live! Ends in 3 days.

🛒 Live event · Special Shop
Special Shop                                         [the first item's sprite]
🛒 In the Special Shop:
• Master Ball ₽500
• Raid Ball ₽1,000 · 3 per trainer
• Potion ₽1,500 · in Johto
Play now
Ends: in 3 days (Fri 1 Jan 13:00) · Who: Trainers with 8+ badges · Comes back: every Friday
Also on: 💰 Cash Flow: the bonuses add up.
[the event's banner]
```

What each kind says in full:

| Kind | The start post lists |
| --- | --- |
| ✨ Shiny Parade | the multiplier, and where: everywhere, the region, or each area (twelve names, then "+N more") |
| 🛒 Special Shop | every item with the price players pay, its per-trainer limit and the regions it's sold in (twelve, then "…and N more") |
| 💰 Cash Flow | the bonus on every ₽ earned, selling excluded |
| ⛏️ The Underground | the Explorakits' price and limit, and the free kits (how many, how often, how many can wait) |

All of them: the title (the admin's English one, else the kind's name), when it ends, the badges it needs, how a
recurring event comes back ("every Friday", "the 1st and last Friday of each month", "every year on 24 December"),
the other events running with it, and the banner picked in Admin → Events. Each kind has its own colour.

### What changes from today

Today each event gets a short post **two hours before** it starts. With the Monday calendar giving the notice, that
post moves **to the start itself** and says much more. So a member gets one ping per event, at the moment they can
play it. (To bring the heads-up back, `LIVE_LEAD_MS` in `scripts/discord/live-event-post.ts` is the lead: `2 * 3600_000`
is the old two hours.)

### When nothing is posted

- Live events are **Off** or **On for admin** in Admin → Events: neither post goes out. That switch is the feature's
  switch, as the daily raid's and the Ko-fi update's are theirs; the game's own screens are unchanged.
- An event moved or removed while the post waits for its start isn't posted. The post reads the live content again
  at the start, so it shows what players get.
- An event added (and Published) after its start hour has begun isn't posted: post in `#📣-announcements` by hand.

## 2. How it's built

| Piece | Does |
| --- | --- |
| `scripts/discord/live-week-post.ts` · `pnpm discord:live-week` | The Monday calendar: the week (Monday 00:00 to Monday 00:00 UTC), its runs not over yet, the chart, the list, "Next up". |
| `.github/workflows/discord-live-week.yml` | Runs it every Monday at 07:23 UTC. **Run workflow** posts it by hand. |
| `scripts/discord/live-event-post.ts` · `pnpm discord:live` | The start posts. Every hour at :07 it takes the events starting before the next :07, waits for each start, reads the content again and posts. A run GitHub starts late posts at once whatever already started in its hour. |
| `.github/workflows/discord-live.yml` | Runs it every hour at :07 (unchanged). |
| `scripts/discord/layout.ts` | `#🎉-events`' topic and the welcome post's line now say "the week's calendar, each start". |

Both read what players get: the live Supabase tables (with the public key), the bundled copy when they can't. A
recurring event's runs are each an event of their own (`<id>@<date>`), as in the game. The numbers come from the
engine (`livePrice`, `kitPrice`, `freeKitRules`, `liveRuns`…), so the posts never disagree with the game.

Tests: `tests/discord.test.ts` (the hour a start belongs to, recurring runs, the week's bounds, the chart, the
message's limits).

## Setting it up

You already have `#🎉-events`, its webhook and the GitHub secrets if the live-event reminders were set up
([docs/23 §12](23-DISCORD-SERVER.md#12-live-events--events)). Then steps 1 and 2 are a check.

1. **The channel and its webhook.** On your computer, at the repository's root:

   ```bash
   pnpm discord
   ```

   It should list one change: `#🎉-events`' new topic (and the welcome post's line). Apply it:

   ```bash
   pnpm discord --apply
   ```

   It ends with **✓ The server matches the layout**. `.env.discord` holds `DISCORD_EVENTS_WEBHOOK` and
   `DISCORD_EVENT_ROLE`.

2. **GitHub** → the repository → **Settings** → **Secrets and variables** → **Actions**. Check these exist (copy the
   values from `.env.discord` and `.env.local`):

   | Kind | Name |
   | --- | --- |
   | Secret | `DISCORD_EVENTS_WEBHOOK` |
   | Variable | `DISCORD_EVENT_ROLE` (the start posts ping Event Pings; leave it out and they ping nobody) |
   | Variable | `VITE_SUPABASE_URL` |
   | Variable | `VITE_SUPABASE_ANON_KEY` |

3. **Preview** on your computer (nothing is posted):

   ```bash
   pnpm discord:live-week --dry
   ```

   prints this week's calendar post. Another week: add `--at 2026-12-21T07:23:00Z`. An event's start post:

   ```bash
   pnpm discord:live --dry --at 2026-12-24T18:07:00Z
   ```

   prints what the run of that hour would post (use the hour your event starts in, at :07 before it).

4. **Admin → Events → Live events**: the switch must be **On for everyone**. Schedule an event, give it a banner, and
   **Publish**.

5. **Merge to `main`.** GitHub only runs scheduled workflows from the default branch, so the new calendar and the
   start posts begin once this branch reaches `main`. Then, to see a post at once: GitHub → **Actions** → **Discord
   weekly live events calendar** → **Run workflow** (tick *force* if live events are still On for admin).

That's it: every Monday the calendar, every start its post.

### If a post is missing

| What you see | Why, and the fix |
| --- | --- |
| No Monday post | No event this week (the run's log says "No live event this week"), live events aren't **On for everyone**, or the secret is missing. GitHub → Actions → **Discord weekly live events calendar** → the run's log says which. |
| No start post | Same checks in **Discord live events**. An event Published after its start hour began isn't posted. |
| The wrong times | The times are each reader's own; the chart's days are UTC. An event at 23:00 UTC is on the next day in Asia. |
| No picture | The event has no banner in Admin → Events, or its picture isn't on the live site yet. |
| The workflows are disabled | GitHub pauses schedules after 60 days without a commit: Actions → the workflow → **Enable workflow**. |
