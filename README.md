# Pokédice

A dice battler over the original 151 Pokémon, in a Game Boy Color look. Every Pokémon owns 2–6 typed dice; you throw,
keep, reroll, and hit with the per-die type chart plus poker-style combos. Trainers pay gold, gold buys account-wide
upgrades, and the goal is 151/151 in the Pokédex.

> **Personal, non-commercial fan project.** No monetisation. Pokémon and all related names are trademarks of Nintendo,
> Game Freak and Creatures. Sprites are *referenced* from the public [PokeAPI sprites](https://github.com/PokeAPI/sprites)
> repository, never redistributed. Area banners and trainer badges are original, generated pixel art; sound effects are
> synthesised at runtime.

The design lives in [`docs/`](docs): [game spec](docs/01-GAME-SPEC.md) · [data model](docs/02-DATA-MODEL.md) ·
[build plan](docs/03-BUILD-PLAN.md).

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
| `pnpm seed-regions` | Builds Johto and Hoenn on top of the committed bundle: species 152–386, their areas, trainers and regions. Additive — it never drops an existing row |
| `pnpm seed-sql` | Regenerates `supabase/seed.sql` from the committed bundle, without rebuilding the bundle. That one file is all a live database needs — it carries the post-`0001` schema changes too, and is safe to re-run |
| `pnpm art` | Regenerates the 5 area banners and 19 trainer badges in `public/` |
| `pnpm sim` | 1000 random battles + the §2.3 turns-to-kill table (spec methodology and played-out) |
| `pnpm balance [N] [seed]` | Simulated campaign with an upgrade-buying policy (the same engine as the admin Campaign simulator); reports fight length per area. `GOLD=0.8 HP=1.6 pnpm balance` tries other multipliers |
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
- `allowVoluntarySwitch`, `enemyUpgradeLevel`, `goldMultiplier`, `forcedCenterWhenHurt` and `scaleLevelSpread` are
  `game_config` keys (the spec was silent on these).
