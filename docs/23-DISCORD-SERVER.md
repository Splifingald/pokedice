# Pokédice — the Discord server: setup guide

> **What this gives:** the server the game links to, rebuilt for a public player community. That means clear
> channels, staff and ping roles, forums for help, bugs and ideas, safety settings and AutoMod, a "Channels & Roles"
> question for pings and languages, and pinned welcome and rules posts. Four automatic posts come with it: **the daily
> raid** at 00:00 UTC, **the patch notes** of each update once it is live, **each live event** two hours before it
> starts, and **the week's Ko-fi update** every Monday.
>
> **How:** the server is described in one file, `scripts/discord/layout.ts`. `pnpm discord` compares the live server
> with that file and lists the differences without changing anything. `pnpm discord --apply` makes them. It adopts
> what is already there (your `#général` becomes `#🎲-general`, history and all) and never deletes anything.
>
> **Time:** about 20 minutes the first time. Parts 1–4 are yours (Discord's website and app), part 5 is two commands,
> part 7 is GitHub settings.

## The server it builds

| Category | Channels | For |
| --- | --- | --- |
| **Start here** (read-only) | `#👋-welcome` · `#📜-rules` · `#📣-announcements` · `#📝-patch-notes` · `#🔥-daily-raid` · `#🎉-events` · `#💖-support-me` | The welcome and rules posts (by the bot), news, the automatic posts. Announcements, patch notes, the raid and the events are announcement channels, so other servers can follow them. A `#support-me` or `#events` you made yourself is adopted. |
| **Pokédice** | `#🎲-general` · `#🙋-help` (forum) · `#🧠-strategy` · `#🫂-raid-squad` (30 s slowmode) · `#✨-show-off` · `#💬-off-topic` · `#🥖-français` | Chat, questions that stay findable, team building, finding raid friends, best catches, the rest, and French (opt-in: members pick it in Channels & Roles). |
| **Feedback** | `#🐛-bug-reports` (forum) · `#💡-suggestions` (forum, 👍 to vote) | One post per bug or idea, with tags. Status tags (Confirmed, Fixed, Planned, Done…) are moderator-only. |
| **Voice** | 🎧 Lounge · 🐉 Raid Room (3 people, like a raid group) | |
| **Staff** (hidden) | `#🔒-staff-chat` · `#📬-mod-updates` · `#📋-mod-log` | Staff talk, Discord's Community notices, AutoMod's alerts. |

| Role | Is | Can |
| --- | --- | --- |
| **Professor** | admins (you, co-admins) | everything (Administrator) |
| **Gym Leader** | moderators | delete messages, time out, kick, ban, manage threads and tags, see the audit log and Staff |
| **Raid Pings** · **Patch Notes Pings** · **Event Pings** | members who asked | nothing extra: they get pinged by the daily raid, the patch notes, and the live events (and your event news) |

Server settings: members must have a verified e-mail and be on Discord for 5 minutes before talking. Images from
everyone are scanned. Notifications default to mentions only. Discord's join messages land in `#🎲-general`. AutoMod
blocks spam, mass mentions (with a 10-minute timeout) and slurs or sexual content, and reports each block in
`#📋-mod-log`; staff are exempt.

---

## 1. Discord Developer Portal: a bot for the setup

1. Open <https://discord.com/developers/applications>. Use the **Pokédice** application if you made one for Discord
   sign-in ([docs/17](17-DISCORD-SIGN-IN.md)); otherwise **New Application** → `Pokédice` → **Create**.
2. **Installation** (left menu) → **Install Link** → **None** → **Save Changes**. (Discord requires this before the
   next step.)
3. **Bot** (left menu):
   - **Public Bot** → off → **Save Changes**, so only you can add it to a server.
   - **Privileged Gateway Intents**: leave all three off; the setup doesn't need them.
   - **Reset Token** → confirm → **Copy**. Discord shows it once. If you lose it, reset it again.
4. **General Information** → copy the **Application ID**: you need it for the next step.

> **The token is a password for the bot.** It goes in `.env.discord` (step 4) and nowhere else: not in the repo, not
> in a chat, not on Netlify.

## 2. Discord: invite the bot

1. Open this address, with your Application ID in place of `APP_ID`:

   ```
   https://discord.com/oauth2/authorize?client_id=APP_ID&scope=bot&permissions=8
   ```

   `APP_ID` must be the **Application ID**, digits only: not the Public Key just below it. Simpler: do step 4 first
   and run `pnpm discord`. While the bot isn't in the server, it prints this link with the right id and your server
   already picked.
2. Pick the Pokédice server → **Continue** → **Authorize**. Permission `8` is **Administrator**: the bot needs it to
   set channel permissions. It only acts while you run `pnpm discord`; the rest of the time it sits offline.
   Discord says **Invalid Form Body** ("Corps de formulaire non valide")? See [Troubleshooting](#troubleshooting).
3. Discord app → the server → **Server Settings** → **Roles** → drag the bot's role (**Pokédice**) to the **top** of
   the list → **Save**. A bot can only change the roles below its own.

## 3. Discord: switch Community on

Forums, announcement channels and Channels & Roles need it. **Server Settings** → is there a **Community** →
**Overview** entry? Then it's on: skip this step. Otherwise **Enable Community** → **Get Started**:

1. **Safety check:** tick **Verified email required** and **Scan media content from all members** → **Next**.
2. **Set up basics:** Rules channel → **Create one for me**. Community updates channel → **Create one for me** →
   **Next**. The setup adopts both: `#📜-rules` as it is, `#moderator-only` renamed `#📬-mod-updates`.
3. **Finishing touches:** tick all three (mentions-only notifications, no moderation permissions for @everyone, the
   guidelines) → **Finish Set Up**.

## 4. Your computer: `.env.discord`

1. Discord app → **User Settings** → **Advanced** → **Developer Mode** on.
2. Right-click the server's icon → **Copy Server ID**.
3. At the repository's root (the folder with `package.json`), create a file named `.env.discord`:

   ```
   DISCORD_BOT_TOKEN=paste-the-bot-token-here
   DISCORD_GUILD_ID=paste-the-server-id-here
   ```

   Git ignores it (`.env.*` in `.gitignore`). The setup adds the webhook URLs and role ids to it later.

## 5. Preview, then apply

```bash
pnpm discord
```

It prints the server (name, members, Community, the bot's role), then every change: `+` made, `~` changed (with
what), `>` moved. It changes nothing. It also keeps a copy of the server as it found it in `scripts/.cache/discord/`.
Read it through; `!` lines are things only you can fix (see [Troubleshooting](#troubleshooting)). Then:

```bash
pnpm discord --apply
```

It makes each change (`✗` and Discord's reason if one fails), then checks again. It should end with **✓ The server
matches the layout**, and `.env.discord` now also has `DISCORD_RAID_WEBHOOK`, `DISCORD_PATCH_WEBHOOK`,
`DISCORD_RAID_ROLE`, `DISCORD_PATCH_ROLE` and `DISCORD_EVENT_ROLE`. Running it again is safe: what already matches is
left alone.

**Old channels** the layout doesn't know stay where they are. To tidy them away:

```bash
pnpm discord --archive-unmanaged
```

That's the preview again. Then add `--apply`. They move into an **Archive** category at the bottom, read-only. A
private channel stays private, and the history stays. Delete the ones you don't want by hand; the setup never deletes.

## 6. Discord: finishing touches (5 minutes)

- **Server Settings → Onboarding**: the setup filled **Default Channels** and **Questions** (pings, languages).
  Check them in **Preview**. **Server Guide** is the one part Discord doesn't let a bot fill in. Add a welcome sign and
  three to-dos: *Read the rules* → `#📜-rules`, *Say hi* → `#🎲-general`, *Check today's raid* → `#🔥-daily-raid`.
- **Roles**: give **Gym Leader** to your moderators and **Professor** to co-admins (Server Settings → Members →
  `+` next to a name).
- **The invite**: the game's Discord button opens `https://discord.gg/XKJQYw3p9` (Admin → Config → Discord). Keep it
  permanent: Server Settings → **Invites**, check it shows no expiry. If you make a new one, paste it in Admin.
- Optional: **Server Settings → Integrations → Webhooks**. The two posters show Prof. Oak's sprite already; you can
  give them a picture of their own there.

## 7. GitHub: the automatic posts

The four workflows (`.github/workflows/discord-raid.yml`, `discord-patch-notes.yml`, `discord-live.yml` and
`discord-support.yml`) run from `main` only:
GitHub runs scheduled and push workflows from the default branch. They start working once this branch reaches `main`
with version 2. GitHub → the repository → **Settings** → **Secrets and variables** → **Actions**:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `DISCORD_RAID_WEBHOOK` | from `.env.discord` |
| Secret | `DISCORD_PATCH_WEBHOOK` | from `.env.discord` |
| Secret | `DISCORD_EVENTS_WEBHOOK` | from `.env.discord` |
| Secret | `DISCORD_SUPPORT_WEBHOOK` | from `.env.discord` |
| Variable | `DISCORD_RAID_ROLE` | from `.env.discord` (leave it out and the post pings nobody) |
| Variable | `DISCORD_PATCH_ROLE` | from `.env.discord` |
| Variable | `DISCORD_EVENT_ROLE` | from `.env.discord` (the live events ping Event Pings) |
| Variable | `VITE_SUPABASE_URL` | from `.env.local`: public, the site ships it |
| Variable | `VITE_SUPABASE_ANON_KEY` | from `.env.local`: public, the site ships it |

Webhook URLs are **secrets**: anyone holding one can post in that channel. If one leaks, delete the webhook (Server
Settings → Integrations → Webhooks), run `pnpm discord --apply` to make a new one, and update the secret.

Or with the GitHub CLI, from the repository's folder (each `secret set` asks for the value; paste it):

```bash
gh secret set DISCORD_RAID_WEBHOOK
```
```bash
gh secret set DISCORD_PATCH_WEBHOOK
```
```bash
gh variable set DISCORD_RAID_ROLE --body "the-id"
```

…and the same `gh secret set` / `gh variable set` for the others.

## 8. The daily raid post

Every day at about 00:07 UTC (GitHub's schedules can run a few minutes late), `#🔥-daily-raid` gets the day's raid
Pokémon: its name (✨ when shiny), level and HP bars, its lair, its catch value and each ball's odds, a countdown to
the next raid, its animated sprite and its area's picture. It pings Raid Pings. The raid comes from the game's own
calendar over the live content, so it's the raid players get, including your anchors and swaps in Admin → Events.

**Nothing is posted while raids are Off or On for admin** in Admin → Events. Switch them **On for everyone** and the
next midnight posts.

- Preview any day: `pnpm discord:raid --dry` (today) or `pnpm discord:raid --dry --day 2026-12-24`.
- Post by hand (now): `pnpm discord:raid`, or GitHub → Actions → **Discord daily raid** → **Run workflow**.

## 9. Patch notes

Write `patch-notes/YYYY-MM-DD-short-name.md` ([patch-notes/README.md](../patch-notes/README.md) has the format, and
`_template.md` a starting point). When the push that adds it reaches `main`, the workflow waits until Netlify serves
that push (it reads `/version.json`, 15 minutes at most), then posts the note to `#📝-patch-notes` and pings Patch Notes
Pings.

- Preview: `pnpm discord:patch-notes patch-notes/2026-10-20-version-2.md --dry`.
- Post again: GitHub → Actions → **Discord patch notes** → **Run workflow** → the file's path.

## 10. Changing the server later

Edit `scripts/discord/layout.ts`: names, topics, tags, permissions, the welcome and rules texts, the onboarding
questions. Then `pnpm discord`, read, and `pnpm discord --apply`.

What the setup matches and never touches:

- An existing role, category or channel counts as the layout's when its name matches the name or an alias, ignoring
  case, accents, emoji and separators (`Général` = `🎲-general`). It then takes the layout's exact name, emoji
  included: every channel has one in front.
- It never deletes anything. It doesn't touch roles above the bot's, permission bits the layout doesn't know, your
  overwrites for other roles or members, your own forum tags, or your own onboarding questions.
- The welcome and rules posts are the bot's own messages, edited in place. Write your own posts in those channels
  freely. While `#📜-rules` holds posts of yours, the layout's rules post is left out (delete yours and run again to
  use it instead).
- Discord's own AutoMod rule from Community (`Block Mention Spam`) can't be edited by a bot: adjust it by hand.

## 11. The weekly Ko-fi update (`#💖-support-me`)

Every Monday at about 07:43 UTC, `#💖-support-me` gets one short post: **the month's goal**, **what Ko-fi has brought
this month** (with a gauge and the number of supporters), **what next month already holds** from monthly members, and
the Ko-fi link. Next month counts each Ko-fi membership paid within the last 35 days, since it renews; Ko-fi doesn't
say when one is cancelled, so a missed renewal drops out after 35 days. One-off donations count in the month they
were made. Nothing is posted while Support me is off in Admin → Config.

The game's SUPPORT ME pop-up opens the same Ko-fi page (Admin → Config → Support me → **Ko-fi link**).

### Setting it up

1. **Supabase → SQL Editor**: run
   [`supabase/migrations/0071_kofi.sql`](https://github.com/Splifingald/pokedice/blob/claude/modest-thompson-3x5pku/supabase/migrations/0071_kofi.sql)
   (`supabase/seed.sql` carries it too, inlined). It switches the game's link to Ko-fi, and adds the payments table
   and the totals the post reads.
2. **Admin → Config → Support me**: check the Ko-fi link, set the **Monthly goal** and the **Currency** of your Ko-fi
   page (EUR by default). Save, then Publish.
3. **Netlify** → Site configuration → Environment variables: add `KOFI_VERIFICATION_TOKEN` (Ko-fi → Settings → API →
   *Verification Token*). `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there for the push sender
   (docs/27); add them if not. Redeploy.
4. **Ko-fi** → Settings → API → **Webhook URL**: `https://poke-dice.netlify.app/.netlify/functions/kofi-webhook`, then
   **Send Single Donation Test**: Netlify → Logs → Functions → `kofi-webhook` should say `Donation 3 …`. Ko-fi's tests
   use made-up ids, so delete the test row afterwards (Supabase → Table Editor → `kofi_payments`).
5. `pnpm discord --apply` makes `#💖-support-me` (or adopts yours) and its webhook; add `DISCORD_SUPPORT_WEBHOOK` to
   GitHub (step 7).

Payments made before step 4 aren't known: Ko-fi only sends new ones. Preview: `pnpm discord:support --dry`. Post now:
GitHub → Actions → **Discord weekly Ko-fi update** → **Run workflow**.

## 12. Live events (`#🎉-events`)

Two hours before each live event starts, `#🎉-events` gets a short post: its name, what it does with its numbers
(×5 shiny in Kanto, +50% ₽, the shop's items…), when it starts and ends, the badges it needs and its banner. It pings
Event Pings. Every hour at :07 a run takes the events whose "two hours before" falls in its hour and waits for that
moment, so each event is posted once, on time. An event scheduled (and Published) less than two hours before its start
isn't announced: post in `#📣-announcements` by hand. A moved or removed event isn't posted.

**Nothing is posted while live events are Off or On for admin** in Admin → Events.

- Preview: `pnpm discord:live --dry --at 2026-12-24T18:07:00Z` (what the run of that hour would post).
- `pnpm discord --apply` makes `#🎉-events` (or adopts yours) and its webhook; add `DISCORD_EVENTS_WEBHOOK` and
  `DISCORD_EVENT_ROLE` to GitHub (step 7).

---

## Troubleshooting

| What you see | Why, and the fix |
| --- | --- |
| Inviting the bot: **Invalid Form Body** ("Corps de formulaire non valide") | 1. The link's `client_id` isn't the Application ID (still `APP_ID`, the Public Key, a space): let `pnpm discord` print the link (step 2.1). 2. Developer Portal → **Installation** → **Installation Contexts**: **Guild Install** must be ticked. 3. The server requires 2FA for moderation (Server Settings → Safety Setup) and your account has no 2FA: switch it on in User Settings → My Account, or lift the requirement while you invite. |
| `Discord refused the token` | It was reset, or copied wrong. Developer Portal → Bot → **Reset Token** → paste it in `.env.discord`. |
| `The bot isn't in server …` | The invite wasn't completed, or `DISCORD_GUILD_ID` is another server's. It prints the invite link to use. |
| `✗ Community is off` | Step 3. |
| `✗ The bot isn't an Administrator` | Invited without `permissions=8`: open the step 2 link again, or tick Administrator on its role. |
| `! Role "…" sits above the bot's role` | Step 2.3: drag the bot's role to the top, then run again. |
| `✗ 50013 Missing Permissions` | Same: the bot's role isn't at the top. |
| `#help is a text channel and the layout wants a forum` | Discord can't turn a text channel into a forum, so a new forum is made next to it. Archive the old one (`--archive-unmanaged`) once its history no longer matters. |
| The Channels & Roles step fails (`50035`) | Discord's onboarding rules changed or a channel isn't visible to everyone. Everything else is done; set the questions by hand in Server Settings → Onboarding. |
| No raid post at midnight | Raids aren't **On for everyone** in Admin → Events, the secret is missing, or the branch isn't on `main` yet. GitHub → Actions → **Discord daily raid** → the run's log says which. |
| The raid workflow is disabled | GitHub pauses schedules after 60 days without a commit. Actions → **Discord daily raid** → **Enable workflow**. |
| The patch note came before the update | Netlify took more than 15 minutes, or a later push replaced that build. The post goes out anyway. |
