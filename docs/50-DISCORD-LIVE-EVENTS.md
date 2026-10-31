# Pokédice — live events on Discord

> **What this gives:** `#🎉-events` on the Discord server follows the live events the admin schedules, by itself:
> **a calendar of the week every Monday**, and **a post as each event starts**, with everything it does and its
> banner. A Netlify scheduled function sends both, every minute ([§3](#3-from-github-to-netlify-2026-10-31)), through
> the `#🎉-events` webhook, and a small table (migration 0098) keeps each post to one.
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
- An event added (and Published) more than two hours after its start isn't posted: post in `#📣-announcements` by
  hand. Up to two hours late, it's posted within the minute.

## 2. How it's built

| Piece | Does |
| --- | --- |
| `netlify/functions/discord-live.mts` | Netlify runs it every minute, on the published site. Each minute it reads the admin's live events (one small read); when a start or the Monday calendar is due and not posted yet, it reads the content and posts. |
| `netlify/discord/live.ts` | What is due: each run that started in the last two hours and isn't over, and the week's calendar on Mondays between 07:23 and 08:23 UTC. Takes each post's key in `discord_live_posts` before sending, and gives it back if Discord refuses, so the next minute tries again. |
| `supabase/migrations/0098_discord_live_posts.sql` | The table of posts sent (`start:<run>:<start>`, `week:<Monday>`). The service role alone reads it. |
| `scripts/discord/live-week-post.ts` · `pnpm discord:live-week` | The Monday calendar's message (`weekMessage`): the week (Monday 00:00 to Monday 00:00 UTC), its runs not over yet, the chart, the list, "Next up". |
| `scripts/discord/live-event-post.ts` · `pnpm discord:live` | The start post's message (`liveMessage`). As a script, it prints (or posts by hand) the starts of a given hour. |
| `.github/workflows/discord-live.yml`, `discord-live-week.yml` | No schedule any more: **Run workflow** prints the message in the run's log (untick **dry** to post it, only while the Netlify job is off). |
| `scripts/discord/layout.ts` | `#🎉-events`' topic and the welcome post's line now say "the week's calendar, each start". |

Both read what players get: the live Supabase tables (with the public key), the bundled copy when they can't. A
recurring event's runs are each an event of their own (`<id>@<date>`), as in the game. The numbers come from the
engine (`livePrice`, `kitPrice`, `freeKitRules`, `liveRuns`…), so the posts never disagree with the game.

Tests: `tests/discord.test.ts` (recurring runs, the week's bounds, the chart, the message's limits) and
`tests/discord-live-job.test.ts` (each start once and within the minute, late Publishes, the switch, a refused post
tried again, the Monday calendar once).

## 3. From GitHub to Netlify (2026-10-31)

The posts first came from GitHub workflows scheduled every hour. GitHub ran that hourly schedule only about 5 times a
day (38 runs in 8 days), so a start was posted only when a run happened to fall in its hour. Netlify's scheduled
functions run on time (the push sender's every 5 minutes, the Versus bots' every hour), so the job moved there, every
minute, with a table so overlapping runs never post twice. The GitHub workflows stay, without a schedule, to preview
the messages.

## Setting it up

This starts from nothing and takes about 15 minutes, all in a web browser: no bot, no command line. You need to be an
admin of the Discord server and of the Netlify site, and to reach the Supabase project and the game's Admin.

> **Set up before 2026-10-31?** The posts moved from GitHub to Netlify ([§3](#3-from-github-to-netlify-2026-10-31)):
> do steps 4 and 5 only, with the webhook URL and role id the GitHub settings already hold.

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
3. **Copy Webhook URL** → **Save Changes**. Keep the URL for step 5.

> **The URL is a password:** anyone holding it can post in the channel. It goes in Netlify's environment variables (step 5) and
> GitHub's secrets (step 6) and nowhere else: not in the repository, not in a chat. If it leaks, delete the webhook,
> make a new one and update both.

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

### Step 4 — Supabase: the table of posts sent

Supabase → the `pokedice` project → **SQL Editor** → **New query** → paste
[`supabase/migrations/0098_discord_live_posts.sql`](https://github.com/Splifingald/pokedice/blob/claude/tender-maxwell-vhhevv/supabase/migrations/0098_discord_live_posts.sql)
→ **Run**. Safe to run again. (`supabase/seed.sql` doesn't carry it.)

### Step 5 — Netlify: give the job the addresses

Netlify → the `poke-dice` site → **Site configuration** → **Environment variables** → **Add a variable**, one at a
time:

| Key | Value |
| --- | --- |
| `DISCORD_EVENTS_WEBHOOK` | the webhook URL from step 2 (tick **Contains secret values**) |
| `DISCORD_EVENT_ROLE` | the role id from step 3 (digits only); leave it out if you skipped step 3 |

`VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are there already, for the push sender. A new variable reaches the
job at the next deploy: **Deploys** → **Trigger deploy** → **Deploy site** if nothing else is deploying.

### Step 6 — GitHub: the same addresses, for the previews (optional)

The GitHub workflows only print the messages now. To have them read your events, GitHub → the `pokedice` repository →
**Settings** → **Secrets and variables** → **Actions**.

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

   Type the names exactly, capitals included. The two Supabase values let the previews read the events you schedule
   in Admin; without them they read the game's bundled copy, which has none.

### Step 7 — the game: switch live events on

1. The game → **Admin** → **Events** → the **Live events** switch → **On for everyone**.
2. The **Live events** tab: schedule an event (its kind, start, end, a banner, a title if you like) → save →
   **Publish**.

While the switch is Off or On for admin, nothing is posted.

### Step 8 — merge to `main`

Netlify runs scheduled functions on the published site only (not on Deploy Previews). Once this reaches `main` and the
site is live, everything runs by itself:

| When | Posts |
| --- | --- |
| Mondays, from 07:23 UTC | the week's calendar (nothing on a week without an event) |
| Within the minute of each start | that event, with everything it does |

### Step 9 — check it works

1. Schedule a test event that starts in a few minutes → **Publish**. Within a minute of its start the post is in your
   channel. Delete the post and the event afterwards.
2. Netlify → **Logs** → **Functions** → `discord-live`: each post shows as `[discord-live] { posted: [...] }`; a
   missing setting as `not configured: …`.
3. To see the Monday calendar's message any day: GitHub → **Actions** → **Discord weekly live events calendar** →
   **Run workflow** (keep **dry** ticked) → the run's log prints it.

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
| No Monday post | No event this week, live events aren't **On for everyone**, or a Netlify variable is missing (the function's log says `not configured: …`). |
| The function's log says `discord_live_posts: …` | The migration of step 4 hasn't run. |
| The log says `Discord POST … → 401` or `→ 404` | The webhook was deleted or its URL is wrong: make a new one (step 2) and update `DISCORD_EVENTS_WEBHOOK` in Netlify, then redeploy. |
| The post shows `@Event Pings` but nobody is notified | Members don't have the role yet (step 3.3). If they do: Server Settings → Roles → Event Pings → **Allow anyone to @mention this role** on. |
| No start post | Same checks in the function's log. An event Published more than two hours after its start isn't posted. |
| The wrong times | The times are each reader's own; the chart's days are UTC. An event at 23:00 UTC is on the next day in Asia. |
| No picture | The event has no banner in Admin → Events, or its picture isn't on the live site yet. |
