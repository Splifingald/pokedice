# Pokédice — live events on Discord

> **What this gives:** `#🎉-events` on the Discord server follows the live events the admin schedules, by itself:
> **a calendar of the week every Monday**, and **a post as each event starts**, with everything it does and its
> banner. Built like the weekly Ko-fi update ([docs/23 §11](23-DISCORD-SERVER.md#11-the-weekly-ko-fi-update--support-me)):
> a script, a GitHub workflow, the `#🎉-events` webhook. No database change, no new secret.
>
> **Your part:** [Setting it up](#setting-it-up) at the end: about 15 minutes in a browser, from nothing.

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

**In French too:** with the `DISCORD_FRENCH_WEBHOOK` secret, both posts go to `#🥖-français` as well, in French and
without a ping (`scripts/discord/french.ts` gives the game's French names; [docs/23 § 13](23-DISCORD-SERVER.md) has the
setup).

Tests: `tests/discord.test.ts` (the hour a start belongs to, recurring runs, the week's bounds, the chart, the
message's limits, the French posts).

## Setting it up

This starts from nothing and takes about 15 minutes, all in a web browser: no bot, no command line. You need to be an
admin of the Discord server and of the GitHub repository, and to reach the Supabase project and the game's Admin.

> **Already ran the full server setup** ([docs/23](23-DISCORD-SERVER.md), `pnpm discord --apply`)? Then
> `#🎉-events`, its webhook and Event Pings exist: go to step 4 and copy the values from `.env.discord`.

### Step 1 — Discord: the channel

1. In the Discord app, on your server: **+** next to a category's name → **Create Channel** → **Text**.
2. Name it `events` (or `🎉-events`) → **Create Channel**.
3. So only the posts land there: the channel's ⚙️ (**Edit Channel**) → **Permissions** → **@everyone** → **Send
   Messages** ✗ (red) → **Save Changes**.

Already have an events channel? Use it.

### Step 2 — Discord: the webhook (the address the posts are sent to)

1. The channel's ⚙️ (**Edit Channel**) → **Integrations** → **Webhooks** → **New Webhook**.
2. Click the new webhook. Name it exactly **`Pokédice Events`**, so the full server setup reuses it if you ever run
   it. Check its channel is your events channel.
3. **Copy Webhook URL** → **Save Changes**. Keep the URL for step 4.

> **The URL is a password:** anyone holding it can post in the channel. It goes in GitHub's secrets (step 4) and
> nowhere else: not in the repository, not in a chat. If it leaks, delete the webhook, make a new one and update the
> secret.

### Step 3 — Discord: the ping role (optional)

Each start post pings this role, so only the members who want it are notified. Skip this step and the posts ping
nobody.

1. **Server Settings** → **Roles** → **Create Role** → name it `Event Pings` → **Save Changes**. Leave its
   permissions as they are.
2. Its id: **User Settings** → **Advanced** → **Developer Mode** on. Back in **Server Settings** → **Roles**,
   right-click `Event Pings` → **Copy Role ID**. Keep it with the URL.
3. Let members take it. With **Community** on: **Server Settings** → **Onboarding** → **Questions** → add a question
   ("Get pinged for…") with an answer *Live events* that gives `Event Pings`. Without Community, give the role by hand
   (Server Settings → **Members** → `+` next to a name).

### Step 4 — GitHub: give the workflows the addresses

GitHub → the `pokedice` repository → **Settings** → **Secrets and variables** → **Actions**.

1. **Secrets** tab → **New repository secret**:

   | Name | Value |
   | --- | --- |
   | `DISCORD_EVENTS_WEBHOOK` | the webhook URL from step 2 |

2. **Variables** tab → **New repository variable**, one at a time:

   | Name | Value | Where to find it |
   | --- | --- | --- |
   | `DISCORD_EVENT_ROLE` | the role id from step 3 (digits only) | leave it out if you skipped step 3 |
   | `VITE_SUPABASE_URL` | `https://lmauouvrczayxfxsrcqj.supabase.co` (the `pokedice` project) | Supabase → the project → **Project Settings** → **Data API** → *Project URL*. Also in Netlify → Site configuration → Environment variables |
   | `VITE_SUPABASE_ANON_KEY` | the long key starting `eyJ…` | Supabase → **Project Settings** → **API Keys** → **Legacy API keys** tab → **anon** · *public* → Copy. Also in Netlify's environment variables. It's public (the site ships it), so a variable, not a secret. **Never** the `service_role` key |

   Type the names exactly, capitals included. The two Supabase values let the posts read the events you schedule in
   Admin; without them the posts read the game's bundled copy, which has none.

### Step 5 — the game: switch live events on

1. The game → **Admin** → **Events** → the **Live events** switch → **On for everyone**.
2. The **Live events** tab: schedule an event (its kind, start, end, a banner, a title if you like) → save →
   **Publish**.

While the switch is Off or On for admin, nothing is posted.

### Step 6 — GitHub: merge to `main`

GitHub only runs scheduled workflows that are on the default branch (`main`). Once this branch is merged, everything
runs by itself:

| When | Workflow (GitHub → **Actions**) | Posts |
| --- | --- | --- |
| Mondays, 07:23 UTC | **Discord weekly live events calendar** | the week's calendar (nothing on a week without an event) |
| Every hour, at :07 | **Discord live events** | each event that starts in that hour, at its start |

### Step 7 — check it works

1. GitHub → **Actions** → **Discord weekly live events calendar** → **Run workflow** → **Run workflow**. About a
   minute later the calendar is in your channel, as long as an event is on this week. If live events are still On
   for admin, tick **force**.
2. Click the run to read its log: it says what it posted, or why it posted nothing (no event this week, the switch, a
   missing secret).
3. To see a start post: schedule a test event that starts within the next hour → **Publish**. The hourly run posts it
   at its start. Delete the post and the event afterwards.

Done: every Monday the calendar, every start its own post.

### Preview on your computer (optional)

With the repository on your computer (`pnpm install` done, the Supabase pair in `.env.local`), these print the
messages and post nothing:

```bash
pnpm discord:live-week --dry
```

```bash
pnpm discord:live --dry --at 2026-12-24T18:07:00Z
```

The first prints this week's calendar (add `--at 2026-12-21T07:23:00Z` for another week). The second prints what the
run of that hour would post: use :07 of the hour your event starts in.

### If a post is missing

| What you see | Why, and the fix |
| --- | --- |
| No Monday post | No event this week (the run's log says "No live event this week"), live events aren't **On for everyone**, or the secret is missing. GitHub → Actions → **Discord weekly live events calendar** → the run's log says which. |
| The log says "using the bundled content" | `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing or misspelt (step 4), so the posts can't see your events. |
| The log says `Discord POST … → 401` or `→ 404` | The webhook was deleted or its URL is wrong: make a new one (step 2) and update the secret. |
| The post shows `@Event Pings` but nobody is notified | Members don't have the role yet (step 3.3). If they do: Server Settings → Roles → Event Pings → **Allow anyone to @mention this role** on. |
| No start post | Same checks in **Discord live events**. An event Published after its start hour began isn't posted. |
| The wrong times | The times are each reader's own; the chart's days are UTC. An event at 23:00 UTC is on the next day in Asia. |
| No picture | The event has no banner in Admin → Events, or its picture isn't on the live site yet. |
| The workflows are disabled | GitHub pauses schedules after 60 days without a commit: Actions → the workflow → **Enable workflow**. |
