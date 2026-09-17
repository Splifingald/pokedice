# Pokédice — Build Plan for Claude Code

Execute the phases in order. Each phase ends with a **verifiable** state — do not start the next phase until the acceptance criteria pass. Read `01-GAME-SPEC.md` and `02-DATA-MODEL.md` first; they are the rules and the schema. When something is ambiguous, follow the spec, and if the spec is silent, add a `game_config` key with a sensible default rather than hard-coding.

---

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite 5 + React 18 + TypeScript (strict)** | fast, Netlify-native, no SSR needed |
| State | **Zustand** (+ `immer`) | small, no boilerplate, easy to persist |
| Styling | **Tailwind CSS** with a custom GBC theme + a small `pixel.css` for panel borders | rapid, and the theme tokens keep the look coherent |
| Animation | **Framer Motion** for UI/layout + a hand-rolled `<ParticleCanvas>` (~150 lines) for hit bursts | Framer alone can't do cheap 200-particle bursts |
| Routing | **React Router 6** | |
| Backend | **Supabase JS v2** — Google OAuth + Postgres | |
| Validation | **Zod** | save-file and admin-form validation |
| Tests | **Vitest** (engine) + **Playwright** (2–3 smoke flows) | the engine is pure and *must* be tested |
| Package manager | **pnpm** | |
| Deploy | **Netlify** | SPA redirect + env vars |

**Non-negotiable rule:** `src/engine/` is pure TypeScript with **zero React and zero I/O**. Every rule in `01-GAME-SPEC.md` lives there, is deterministic given a seeded RNG, and is unit-tested. The UI is a renderer over it. This is what makes the game balanceable and the admin simulator possible.

---

## Repo layout

```
pokedice/
├── public/
│   ├── banners/            # 4 area banners
│   └── fonts/              # Jersey 25 (self-hosted, no FOUT)
├── scripts/
│   ├── seed.ts             # PokeAPI → src/data/*.json + supabase/seed.sql
│   └── .cache/             # PokeAPI response cache (gitignored)
├── supabase/
│   ├── migrations/0001_init.sql
│   └── seed.sql            # generated
├── src/
│   ├── engine/             # PURE — no React, no fetch
│   │   ├── rng.ts          # seedable mulberry32
│   │   ├── dice.ts         # roll, face values, status detection
│   │   ├── combos.ts       # detection + best-payout selection
│   │   ├── typechart.ts
│   │   ├── damage.ts       # the formula, per-die breakdown
│   │   ├── status.ts       # apply/tick/clear
│   │   ├── battle.ts       # BattleState reducer: START/ROLL/REROLL/ATTACK/SWITCH/ITEM
│   │   ├── ai.ts           # greedy reroll heuristic
│   │   ├── progression.ts  # xp, levels, hp curve, milestones, evolution
│   │   ├── encounters.ts   # weighted rolls, area chain
│   │   └── economy.ts      # gold, upgrade costs, shop
│   ├── data/               # generated JSON bundle (committed)
│   ├── config/             # runtime config loader: bundle → supabase hot-swap
│   ├── store/              # zustand slices: save, run, battle, ui
│   ├── save/               # localStorage io, zod schema, migrations, cloud sync, hp regen
│   ├── lib/supabase.ts
│   ├── components/         # Panel, PixelButton, Die, HpBar, TypeBadge, SpriteImg, Toast…
│   ├── screens/            # Title, Map, Area, Battle, Center, Shop, Upgrades, Box, Pokedex, Settings
│   ├── admin/              # the whole admin panel
│   └── setup/              # the deployment tutorial page
└── tests/
```

---

## Phase 0 — Scaffold

- `pnpm create vite pokedice --template react-ts`, add the stack above, `git init`.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. ESLint + Prettier. Path alias `@/`.
- Tailwind configured with the GBC palette and the 18 type colours from `01-GAME-SPEC.md` §10 as named tokens.
- Self-host **Jersey 25** in `public/fonts` with `font-display: swap`.
- `.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`.
- `netlify.toml`: build `pnpm build`, publish `dist`, and the SPA redirect `/* → /index.html 200`.

**Done when:** `pnpm dev` serves a blank themed page in Jersey 25, `pnpm build` and `pnpm lint` are clean.

---

## Phase 1 — Data & seeding

Implement `scripts/seed.ts` exactly per `02-DATA-MODEL.md` §3. Also write `supabase/migrations/0001_init.sql` (schema + RLS from §2).

**Done when:**
- `pnpm seed` produces `src/data/pokemon.json` with **151 entries**, every one having a dice set summing to 2–6, a sprite URL, HP curve and milestones.
- A test asserts: Squirtle = 1 water + 1 base; Charizard = 2 fire + 1 flying + 2 base with 5 rerolls; Mewtwo = 4 psychic + 2 base; Charmeleon has 3 dice; Snorlax's typed dice are `normal` (upgradeable), not `base`; Dragonite carries Dragon dice.
- `type-chart.json` round-trips: Water→Fire = 2, Normal→Ghost = 0, Fighting→Ghost = 0, Dragon→Fairy = 0, Electric→Ground = 0.
- The **5** areas, their pools and trainers exist; every referenced dex number is 1–151; **no legendary appears in any wild pool** and each is attached as a `legendary_boss`; the 3 starters appear in no wild pool.
- `dice_types` has **19** rows (`base` + 18 types); `die_upgrades` has **180** rows and none for `base`.
- Banners and trainer badges are generated into `public/banners/` and `public/trainers/`.

---

## Phase 2 — Engine (the important one)

Build `src/engine/` per `01-GAME-SPEC.md` §2–§5 and §8. Every function takes its config as an argument — no imports from `src/data` inside the engine.

`battle.ts` exposes a reducer:
```ts
type BattleEvent =
  | {t:'ROLL'} | {t:'TOGGLE_DIE', i:number} | {t:'REROLL'}
  | {t:'ATTACK'} | {t:'USE_ITEM', key:string} | {t:'SWITCH', instanceId:string}
  | {t:'AI_TURN'}
function reduce(state: BattleState, e: BattleEvent, cfg: Config, rng: Rng): { state: BattleState, log: LogEntry[] }
```
`log` is a list of typed animation instructions (`{kind:'damage', amount, effectiveness, perDie:[…]}`, `{kind:'status', …}`, `{kind:'faint', …}`) — the UI renders the log, it never recomputes rules.

**Unit tests (Vitest) — write these, they are the safety net:**
- damage: per-die typing, 4× stacking, immunity → 0, `max(1,…)` floor, `damageScale` applied last; **no level term anywhere in the formula**
- combos: every one of the 8 detected correctly; straights over non-contiguous duplicate values; **payout picks highest damage, not highest rank** (test: Pair at L9 beats Two Pair at L1 in the same roll)
- status: burn stacks and poison doesn't; frozen needs 3 in one roll; paralyze needs 2; **confuse needs 2**; DoT ticks before the stun check and can K.O.; a stun does not consume a pending confusion; everything clears at battle end
- fallback values: burn=1, frozen=1, paralyze=4, **confuse=2**, poison=1, and that they participate in combo detection
- base dice: contribute +0 upgrade bonus always, and never set the attack type (v1.8: they still take its multiplier); an all-base roll is untyped (×1)
- rerolls: budget is per battle, one press = one reroll regardless of dice selected
- progression: HP interpolation endpoints, xp curve monotonic, milestone application, evolution swaps species and keeps HP %, branching evolution picks uniformly under a fixed seed
- AI: never rerolls a satisfied status threshold; is deterministic under a fixed seed

**Done when:** `pnpm test` is green with ≥90 % statement coverage on `src/engine/`, and a headless script can simulate 1000 battles without throwing.

---

## Phase 3 — Save, state, sync

- Zod save schema + migration hook (`version` field, so v2 can migrate).
- `localStorage` read/write, debounced 500 ms.
- **HP regen on load:** `hours = (now - lastRegenTick)/3.6e6`; each Pokémon heals `floor(hours × 0.05 × maxHp)`, capped at maxHp; a fainted one revives if it lands above 0; `lastRegenTick = now`. Do this before rendering.
- Zustand slices: `save` (persistent), `run` (current area/encounter, transient), `battle` (mirrors engine state), `ui`.
- Cloud sync: on sign-in fetch `saves`; compare `updatedAt`; **newest wins silently** with a toast naming the winner. Push debounced 2 s after any save mutation. Never block the UI on the network.

**Done when:** a save survives reload; killing the tab mid-battle loses only the battle, not progression; regen visibly works when you fake `lastRegenTick` two hours back.

---

## Phase 4 — Design system & shell

Build the reusable pieces before the screens:
`Panel`, `PixelButton`, `Dialogue`, `TypeBadge`, `HpBar` (animated drain, colour thresholds), `SpriteImg` (pixelated, dex→URL, skeleton), `Die` (18 type skins, face rendering incl. status glyphs, selected/rolling/locked states), `Gauge`, `GoldPill`, `Toast`, `Modal`, `SearchSelect`.

App shell: title screen (new game / continue / sign in), persistent HUD (gold, area name, gauge, buttons for Map · Team · Shop · Upgrades · Pokédex · Settings), and the responsive layout from §10.

**Done when:** a Storybook-less `/kitchen-sink` dev route shows every component in every state, at 360 px and 1440 px, and the reduced-motion setting kills all animation.

---

## Phase 5 — Battle screen

The showpiece. Drives the Phase 2 engine and renders its log.

- Enemy panel (sprite, name, level, types, HP bar, status icons with turn counters), player panel likewise.
- Dice tray: dice tumble in with staggered 3D CSS (~600 ms), land on their face. Tap to select (pixel highlight + lift). `REROLL (n left)` button and `ATTACK` button. Keyboard: `1..6` toggle, `R` reroll, `Space` attack.
- Live combo readout under the tray: "TWO PAIR — +5" updates as dice change, with the projected damage total.
- On attack: dice fly at the target, type-coloured particle burst, damage number punches out, HP drains, screen shake scaled by effectiveness, "SUPER EFFECTIVE!" / "Not very effective…" banner.
- Status application animations (flame overlay, ice crust, sparks, purple bubbles, swirl).
- Faint: white flash, sprite fades and drops, then the switch prompt or the win/lose resolution.
- Victory: XP bar fill on the fighter, gauge fill, gold count-up, level-up card, milestone card (`+1 DIE!`), evolution sequence (silhouette → flash → new sprite), catch sequence on a first encounter.

**Done when:** a full trainer fight (3 Pokémon) is playable start to finish on desktop and on a 360 px viewport without layout break, and the whole thing is playable with reduced motion on.

---

## Phase 6 — The run: areas, encounters, center, shop, upgrades, box

- **Title / new game:** intro, then the starter picker — three cards (Bulbasaur, Charmander, Squirtle) showing sprite, types, dice set and rerolls, so the choice is informed. Level 5, straight into the team.
- **Map:** chain of area cards, locked ones greyed with their gauge requirement, cleared ones marked and tagged "rewards ×0.5". Victory Road shown as endless once unlocked.
- **Area screen:** banner, gauge, "Next encounter" button. Encounter rolled by `engine/encounters.ts` with the forced-Center-first rule from §1.1.
- **Encounter preview card:** what's coming (wild sprite + level + types + a NEW! tag if uncaught; or trainer name + team size and levels) with ENGAGE / SKIP per §1.1. SKIP is hidden for Centers and boss encounters.
- **RUN** button inside wild battles only.
- **Legendary boss:** forced when the gauge fills (or at the team-average thresholds in Victory Road) — darkened screen, name card, un-skippable, un-fleeable, caught on victory, re-offered after a loss.
- **Pokémon Center encounter:** heal animation (the Pokémon Center jingle beat), team management (drag/tap between Box and the 3 team slots), continue.
- **Shop:** HUD-accessible, 3 potions, buy/confirm, inventory shown; items usable in battle (costs the turn) and from the team screen (free).
- **Upgrades:** two tabs (Combos / Dice). Each row: name, current level pips 1–10, current bonus → next bonus, cost, BUY. Locked rows grey out when gold is short. Dice tab groups by type with the type colour and shows how many of your owned Pokémon carry that die — a genuinely useful decision aid.
- **Box / Pokédex:** grid of all 151, caught ones in colour with level, uncaught as dark silhouettes. Detail sheet: sprite, types, HP, speed, dice set laid out visually, rerolls, next milestone, and a "set as team member" action when at a Center.
- **Catch flow:** empty team slot → joins the team automatically; full team → an "Add to team?" swap prompt on the catch screen.
- **Wipe handling** per §6.4.
- **Pokédex completion** screen with `n/151` and a completion card at 151.

**Done when:** a fresh save can be played from area 1 to unlocking area 2 entirely through the UI, with no dev tools, and a wipe behaves exactly as specified.

---

## Phase 7 — Auth & cloud

- Supabase Google OAuth, redirect back to the app, session persisted.
- Sign-in is **optional and never blocking**; the title screen and settings both offer it, worded as "back up your save".
- Sync per Phase 3. Sign-out keeps the local save.
- `useIsAdmin()` → session email matches `VITE_ADMIN_EMAIL`; only then is the Admin link rendered and the `/admin` route reachable.

**Done when:** signing in on a second browser pulls the save; editing on one and reloading the other resolves by timestamp; signing out and back in loses nothing.

---

## Phase 8 — Admin panel (`/admin`)

Route-guarded, and every write already protected by RLS. Sections: **Pokémon · Areas · Trainers · Dice · Upgrades · Items · Type Chart · Config · Simulator**.

Shared table component with the quality-of-life features that make this worth using:
- sticky header, column sort, text filter, pagination, **inline cell editing** with per-cell dirty highlight
- an explicit **Save changes / Discard** bar — never write on blur
- **SearchSelect everywhere**: choosing a Pokémon shows sprite + dex + name + type badges in both the list and the closed state; choosing a type shows its colour swatch
- duplicate row, delete with confirm, bulk edit of the selected rows
- CSV import/export per table
- undo of the last save (keeps a snapshot in memory)
- validation with Zod, errors shown in the cell, save blocked while invalid

Section specifics:
- **Pokémon** — dice editor is a visual widget: chips per die with a type dropdown and a live preview of the die's 6 faces, plus computed "average roll damage" and "average vs. a neutral 100 HP target" so you can feel a change. Milestone editor as a level timeline you can click to add markers. Evolution editor with sprite previews.
- **Areas** — drag to reorder, encounter weights as sliders that display normalised percentages summing to 100 %, wild pool and trainer pool as sub-tables with weight sliders and a computed "% chance to meet" column.
- **Dice** — 6 face slots per die, each either a number or a status (with its fallback value), a live-rendered die preview in the type colour, and the computed average.
- **Upgrades** — the 10 levels of a track edited as a small chart + table side by side, with a "fill from formula (base, growth)" helper so you can reshape a whole curve in two numbers.
- **Config** — typed form for `damageScale`, xp curve A/B/C (with a plotted curve and "levels reachable per hour" estimate), wipe penalty, regen rate, share mode.
- **Simulator** — pick two Pokémon and levels, pick upgrade levels, run **N = 1000** engine battles headlessly, and report win rate, median turns, median damage per turn, and a histogram of turn counts. This is how the game actually gets balanced; build it, it is one screen and it pays for itself.
- **Dev Tools tab** (admin-only, operates on *your own save*) — set gold, unlock all areas, fill the current gauge, catch any Pokémon, set any Pokémon's level, max/reset all upgrades, force the next encounter type, reset the save, export/import the save as JSON. Balancing a 100-level game without this is not realistic; build it early in the phase, not last.
- **Publish** button — bumps `configVersion`. **Export bundle** — downloads the JSON files for committing.

**Done when:** you can change Charizard's dice, hit Publish, reload the game, and see it; and the simulator reports a plausible win rate for an even matchup.

---

## Phase 9 — Setup tutorial page (`/setup`)

A styled in-app page (same GBC look), publicly readable, written for someone who has never used Supabase. It must be **copy-pasteable end to end**:

1. **Netlify** — connect the GitHub repo, build command `pnpm build`, publish dir `dist`, note the site URL.
2. **Supabase** — create a project, where to find the Project URL and the **anon** key (and the explicit warning to never use the service_role key in the front end).
3. **SQL** — a copy button for `0001_init.sql` and one for `seed.sql`, with a note on running them in the SQL editor in that order.
4. **Google Cloud Console** — create an OAuth 2.0 Client ID (Web), authorised JavaScript origin = the Netlify URL, authorised redirect URI = `https://<project>.supabase.co/auth/v1/callback`. Screenshot-level step list.
5. **Supabase → Authentication → Providers → Google** — paste the client ID and secret, enable.
6. **Supabase → Authentication → URL Configuration** — Site URL = the Netlify URL, plus `http://localhost:5173` in Additional Redirect URLs for local dev.
7. **Netlify env vars** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL=gregoire.ftn@gmail.com`. Redeploy.
8. **Verify** — a live checklist on the page that actually runs checks: env vars present, Supabase reachable, tables found, row counts per table, current session email, admin match yes/no. Green ticks and red crosses, not prose.
9. **Troubleshooting** — redirect_uri_mismatch, "relation does not exist", RLS denying writes, blank page after OAuth redirect (missing SPA redirect rule).

**Done when:** following the page from an empty account produces a working deployment with admin access.

---

## Phase 10 — Polish, balance, ship

- Sound: **SFX only, muted by default**, clear toggle in HUD and Settings. ~10 short CC0 8-bit samples (dice rattle, dice land, hit, super-effective, faint, level-up, catch, gold, button, error), total under 300 KB. No music in v1.
- Playwright smoke tests: new game → first battle → win; buy an upgrade; sign-in flow mocked.
- Lighthouse ≥90 performance on mobile. Route-split `/admin` and `/setup` out of the main bundle. Preload sprites for the current area's pool only.
- Error boundary with a "copy save to clipboard" escape hatch.
- **Balance pass with the simulator.** Reproduce the turns-to-kill table in `01-GAME-SPEC.md` §2.3 first, as a regression check on the engine. Then the real work: **tune the gold payout rate**, since with no level term in the damage formula, upgrade pace is the *only* thing keeping fight length in the 3–5 turn band as levels climb. Add a "simulated run" mode that plays N encounters with a plausible spending policy and reports fight length over time — if it drifts above 6 turns, trainers pay too little. Also confirm a correct type matchup roughly halves the turn count and a bad one roughly doubles it, then tune the xp curve so area 1 takes ~10 minutes.
- `README.md`: what it is, the non-commercial fan-project disclaimer, local dev, `pnpm seed`, and a link to `/setup`.

---

## Order of attack if time is short

Phases 0 → 1 → 2 → 3 → 4 → 5 → 6 gives a complete, playable, offline game with no backend at all. Phases 7 → 8 → 9 add the account and the editor on top. Do not reorder — the engine before the UI is what keeps this buildable.

---

## Things deliberately left for you to decide later

1. **Item encounters** — the encounter type exists at weight 0; what drops, and how often, is a v2 conversation.
2. `skipPolicy` — starts at `'free'`. If playtesting shows players fishing for ideal matchups, switch it to `'once'` in config; no code change needed.
3. The exact **area names, banners and trainer names** — the 5 seeded areas ship with generated placeholder art and flavour names, all editable in admin.
4. Whether **Victory Road's** legendary thresholds (team-average 40 / 55 / 70) are the right pacing — check with the simulator once the game is playable.
5. Whether the **Bug die** (`1,1,1,4,4,4`, avg 2.50) and **Psychic die** (avg 2.83) are too weak in raw damage given their combo reliability — a simulator question, not a design one.
