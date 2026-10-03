# Pokédice

A dice battler over the original 151 Pokémon, in a Game Boy Color look. Every Pokémon owns 2–6 typed dice; you throw,
keep, reroll, and hit with the per-die type chart plus poker-style combos. Trainers pay gold, gold buys account-wide
upgrades, and the goal is 151/151 in the Pokédex.

> **Personal, non-commercial fan project.** No monetisation. Pokémon and all related names are trademarks of Nintendo,
> Game Freak and Creatures. Sprites are *referenced* from the public [PokeAPI sprites](https://github.com/PokeAPI/sprites)
> repository, never redistributed. Area banners and trainer badges are original, generated pixel art; sound effects are
> synthesised at runtime. Made by Splifingald.

The design lives in [`docs/`](docs): [game spec](docs/01-GAME-SPEC.md) · [data model](docs/02-DATA-MODEL.md) ·
[build plan](docs/03-BUILD-PLAN.md) · [Sinnoh plan](docs/07-SINNOH-PLAN.md) · [Unova plan](docs/08-UNOVA-PLAN.md) · [Gen 6–9 plan](docs/11-GEN6-9-REGIONS-PLAN.md) ·
[Gen 6–9 sprite sources](docs/10-GEN6-9-SPRITES.md).

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

The game is fully playable offline with no backend: all content is bundled in `src/data/`. Cloud saves (Google sign-in)
and the admin panel need Supabase — the in-app guide at **`/setup`** walks through it end to end (Netlify, Supabase,
SQL, Google OAuth, env vars) and runs live checks.

For local cloud/admin work, copy `.env.example` to `.env.local` and fill it in. Without it, `/admin` still opens in
**offline mode** during `pnpm dev` (edits apply to your session; *Export bundle* makes them permanent).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm preview` | Vite dev server / production build (type-checked) / preview |
| `pnpm test` · `pnpm coverage` | Vitest — engine, data, save and a headless area-1 → area-2 run |
| `pnpm e2e` | Playwright smoke tests (new game → win, buy an upgrade, mocked sign-in). Uses the installed Edge on Windows; elsewhere run `npx playwright install chromium` first |
| `pnpm lint` · `pnpm format` | ESLint (also enforces that `src/engine` stays pure) · Prettier |
| `pnpm seed` | Reports how far the committed bundle has drifted from what the generator (PokeAPI + `scripts/content.ts`, Kanto only) would produce. Writes nothing. `pnpm seed --force` does the old destructive regeneration — see [docs/02](docs/02-DATA-MODEL.md#3-generating-the-386) |
| `pnpm seed-regions` | Builds the regions after Kanto on top of the committed bundle: species, their areas, trainers and regions. Additive — it never drops an existing row, above or below the range. Defaults to the newest region (`--from 906 --to 1025`, Paldea); pass another range to regenerate an earlier one, which throws away its admin tuning |
| `pnpm pull-remote` | Says how far the committed bundle has fallen behind Supabase, where admin tuning lands first. Writes nothing. `pnpm pull-remote --write` then overwrites `src/data/*.json` and `supabase/seed.sql` with the live rows — the same check and the same refusals as Admin → "Pull from Supabase". Run it before adding content |
| `pnpm sync` | Pull Supabase, rebuild the regions on top, regenerate `supabase/seed.sql`, run the tests — in that order, stopping at the first failure. The one command to run before applying `seed.sql` to a live database |
| `pnpm seed-sql` | Regenerates `supabase/seed.sql` from the committed bundle, without rebuilding the bundle. That one file is all a live database needs — it carries the post-`0001` schema changes too, and is safe to re-run |
| `pnpm art` | Regenerates the 5 area banners and 19 trainer badges in `public/` |
| `pnpm sim` | 1000 random battles + the §2.3 turns-to-kill table (spec methodology and played-out) |
| `pnpm balance [N] [seed]` | Simulated campaign with an upgrade-buying policy (the same engine as the admin Campaign simulator); reports fight length per area. `GOLD=0.8 HP=1.6 pnpm balance` tries other multipliers |
| `pnpm balance table` | Every starter of every region over seeds 1–6 — the summary table of [docs/06](docs/06-REGION-BALANCE.md) |
| `pnpm import-bundle <file>` | Turns an admin *Export bundle* download into `src/data/*.json` + `seed.sql` to commit |

## Architecture

- **`src/engine/`** — every rule, pure TypeScript: no React, no I/O, no bundled data (lint-enforced). Deterministic under
  a seeded RNG, ~99 % test coverage. The battle is a reducer `reduce(state, event, data, rng) → { state, log }`; the UI
  only animates the log.
- **Content** — bundled JSON first (playable in <100 ms, offline), then a background fetch of the Supabase config tables;
  if `configVersion` differs the content hot-swaps. Supabase down ⇒ the game still works.
- **Saves** — `localStorage` always (Zod-validated, debounced, corrupt saves archived), optional cloud copy per Google
  account, newest `updatedAt` wins. Passive regen (5 %/h) is applied on load.
- **Admin** — writes straight to Supabase with the user's JWT; Postgres RLS (`is_admin()`) is the real gate.
  *Publish* bumps `configVersion`. Includes a simulator — one battle, a team in one area, or a whole campaign, run in a Web Worker on the unsaved working copy with what-if overrides, charts and CSV export — and dev tools.

```
src/engine   rules          src/store    zustand (content, save, run, battle, ui)
src/data     bundle         src/save     schema, storage, cloud sync
src/config   bundle ⇄ DB    src/screens  game screens (battle, area, map, …)
src/admin    admin panel    src/setup    /setup guide
scripts/     seed, art, sim, balance, import-bundle
supabase/    migrations/0001_init.sql, seed.sql (generated)
```

## Rule additions since spec v1.1

- **Grass Heal face** — Grass dice are `1, 2, Heal, 4, 5, 6`. Two Heal faces in one roll heal the attacker by the total of
  the dice rolled, on top of the damage (admin: `status.heal.amount` can switch to "Heal faces only").
- **Multi EXP** — on by default, player toggle in Settings; team members who didn't fight get 30 % of the K.O. XP
  (`multiExpShare` in admin, 0 disables).
- **Full Kanto (v1.3)** — 22 areas in order of discovery (Route 1 → Indigo Plateau) with the original rosters; the 8 Gym
  Leaders, Elite Four and Champion with their real top-3 teams gate their areas once the gauge is full; three **secret
  areas** open on conditions: Power Plant (50 caught), Cerulean Cave (a Lv.55 Pokémon), Faraway Island (150 caught).
- **Starters in Cerulean Cave** — Bulbasaur, Charmander and Squirtle are rare encounters in the post-game catch-all
  cave (and nowhere else), so 151/151 is reachable.
- **Area insights & help** — each area shows its encounter types (the "recommended types" were removed in v1.7); the `?` button in the top bar opens the rules and the
  type chart.
- **XP (v1.7)** — a K.O. gives the foe's level × `xpMultiplier` (1), to the Pokémon and to the area's exploration bar
  alike; the level curve (A 0.5, C 1) and the exploration targets are about ¼ of v1.6's.
- **v1.7** — Speed is the base stat ÷ 10 (rounded down; ties go to the player); `noEscape` (on by default) removes
  FLEE / AVOID / RUN; `showRoundPreview` (off by default) shows the cards ahead; each die type has a short description.
- **v1.8 dice schedule** — Pokémon start with 1 die and gain dice by level and evolution (2nd at Lv.5, Lv.6–8 for weak
  species; 3-stage lines 1–2 → 3 → 4 → 5th at Lv.50; Caterpie / Weedle 1 → 2 → 3 → 4th at Lv.36; legendaries 5; max 5).
- **v1.8 attack type** — a whole attack (every die, base dice and the combo) takes the effectiveness of the Pokémon's
  best dice type against the foe; a no-effect attack inflicts no status; hopeless fights end as a stalemate at once.
- **Deck weights are copies (v1.6)** — an area's encounter weights and loot weights are the number of copies of each
  card in its deck (the old `encounterDeckSize` / `lootDeckSize` scaling is gone).
- **Pacing** — `hpMultiplier` 1 (fight length; 1.4 before the v1.8 dice schedule) and `goldMultiplier` 0.5 (economy), tuned with `pnpm balance` on the Kanto content. Damage has no global multiplier: a hit is exactly what the dice show (× type effectiveness, + the combo bonus).
- `maxBattleTurns` (150) ends fights between two mutually-immune Pokémon in a no-reward stalemate.
- **Versus** — trainer menu → Versus, open once 3 Pokémon reach Lv.50. A player leaves a team of three (cloned from
  any region's Box, capped at Lv.50) that others fight on auto at 1.75× speed. Nobody brings their own upgrades: both
  sides fight at `versusUpgradeLevel` (admin → Config, default 5). The whole fight is computed from a seed and recorded
  *before* it plays, so leaving halfway changes nothing. A team can be beaten once per attacker (retries until then);
  changing it opens it to everyone again. Two boards: teams beaten in attack, and opponents held off in defense (each
  attacker once per team). Needs `supabase/migrations/0018_versus.sql` run once on the live database.
- **Trainer look** — trainer card → *Leaderboard & Versus* → CHANGE: the picture other players see on the leaderboard
  (ranked rows and Hall of Fame), the Versus board and across the field in a Versus fight. Red and Leaf, plus every
  Kanto and Johto trainer class (no Gym Leaders, Elite Four, Champions or Team Rocket); the list is
  `src/lib/avatars.ts`. It is stored as `player.avatar` in the save and is the character until picked; the character
  still throws the Poké Balls and decides the rival. Needs `supabase/migrations/0022_player_avatar.sql` run once on
  the live database.
- **Leaderboard activity** — a player whose save hasn't changed in 72 hours drops off every board (ranked rows and
  Hall of Fame) until they play again; you always see your own rows. Needs
  `supabase/migrations/0023_leaderboard_inactive.sql` run once on the live database (re-running `supabase/seed.sql`
  does it too).
- **Leaderboard badge** — the trophy button and `/leaderboard` stay locked until the player's first gym badge (any
  region), and a region's board only lists trainers with at least one badge there. Prof. Oak's share prompt comes with
  the region's 2nd badge. Needs `supabase/migrations/0024_leaderboard_badge.sql` run once on the live database
  (re-running `supabase/seed.sql` does it too).
- **Contact the developer** — trainer menu (side panel) → Contact the developer, at the bottom: a title and a description, stored
  in Supabase table `feedback` and read in Admin → Messages (mark read / unread, delete). The database fills in who
  sent it (Google account or guest device) and allows 3 messages per player per 10 minutes. Needs
  `supabase/migrations/0019_feedback.sql` run once on the live database.
- **Answers to messages** — Admin → Messages → REPLY writes an answer on a message and marks it read. The player finds
  every message they sent and its answer under Contact the developer → *My messages* (their Google account's, plus the
  ones sent as a guest from that browser), and an answer they haven't seen yet pops up the next time they open the
  game. Needs `supabase/migrations/0025_feedback_replies.sql` run once on the live database.
- **Admin → Analytics** sums up the all-time figures (retention, each player's top level and furthest area) in the
  database, from running totals kept up to date as events come in, so the page stays quick however many events pile
  up. Needs `supabase/migrations/0020_analytics_summaries.sql` then `0021_analytics_rollups.sql` run once on the live
  database.
- **Database load** — the leaderboard is kept in a small cache table, rebuilt at most once a minute, instead of reading
  every active save on every visit (your own rows are still live), and the analytics running totals are updated once
  per batch of events rather than once per event. Needs `supabase/migrations/0026_lighter_load.sql` run once on the
  live database, after 0021 (re-running `supabase/seed.sql` brings the leaderboard part too). Re-running 0021 would
  put the per-event trigger back: run 0026 again after it.
- **Analytics upkeep** — `supabase/migrations/0027_analytics_slim.sql` drops two unused indexes on `analytics_events`
  and adds `analytics_prune()`. The game also keeps content downloaded from Supabase in IndexedDB, so a live
  configVersion ahead of the build costs each player one download per version, not one per visit.
- **Minimal analytics** — the game no longer sends events. It makes one call per player per day, `player_ping()`, which
  records the day and refreshes the player's row (name, and a small snapshot of their game). Admin → Analytics shows
  day-1 retention and the players; clicking one opens their profile — a Google player's from their cloud save, a
  guest's from that day's snapshot — with the leaderboard ban and the cheats. Needs
  `supabase/migrations/0028_analytics_minimal.sql` run once on the live database: it fills the new tables from the old
  analytics (retention keeps its history) and stops `analytics_events` taking inserts. The block at the end of the
  file drops the old tables when you no longer want them.
- **Cloud sync** — a signed-in player's save goes to Supabase at most once every `cloudSyncMinutes` (Admin → Config,
  default 15) while they play, and when the page closes; no longer every 30 s or on every tab switch. SYNC ONLINE, at
  the bottom of the side bar (in the avatar's drawer on phones), shows the last sync and syncs now — the same
  compare-and-settle as at sign-in — then rests 5 minutes. A save that already matches the cloud isn't re-uploaded.
- **Fewer web requests** — the images in `public/` (`pokemon`, `trainers`, `banners`, `battle`, `characters`) are kept in
  the browser for a month (`netlify.toml`) instead of being re-checked with Netlify on every visit. They have no content
  hash, so a *replaced* image can take up to a month to reach returning players: give it a new name, or a `?v=` in its
  URL, when that matters. A Pokémon's two Box-icon frames are one image, `NNN_mini.png` (frame 1 left, frame 2 right),
  so a menu icon is one request instead of two.
- **Open tabs pick up new builds** — every build writes `version.json` (its id, also baked into the code). An open tab
  checks it when the player comes back to it (at most every 10 min) and every hour while it stays open, and reloads
  when the build changed; a page more than a day old reloads anyway. The reload waits until nothing would be lost (no
  fight, encounter or catch decision on screen). Tabs opened before this build can't be reached: they update on
  their next reload, or after a day away.
- `allowVoluntarySwitch`, `enemyUpgradeLevel`, `goldMultiplier`, `forcedCenterWhenHurt` and `scaleLevelSpread` are
  `game_config` keys (the spec was silent on these).
