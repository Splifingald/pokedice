# Pokédice — Scaling & Cost Plan (Netlify + Supabase)

> **Status: plan, nothing built.** Goal: keep the game running for thousands, then tens of thousands, of monthly
> players while staying on **Netlify** (hosting) and **Supabase** (auth, saves, boards, content), at the lowest plan that
> holds. No new host, no new backend. Every number marked *measured* was taken from this repository on 2026-10-02;
> every number marked *estimate* comes from the cost model in §3 and should be replaced by the real figures from §2.4
> once they exist.

Companion to `03-BUILD-PLAN.md` (phasing conventions). Earlier load work this builds on: `0026_lighter_load.sql`
(leaderboard cache), `0028_analytics_minimal.sql` (one ping per player per day), the image cache headers in
`netlify.toml`, and the 15-minute cloud sync in `src/store/sync.ts`.

---

## 0. Facts found in the code (read before planning work)

| Fact | Where | Consequence |
|---|---|---|
| The main JS chunk is **2.02 MB, 616 KB gzipped** (*measured*). It holds all 11 languages (`strings.csv`, 449 KB raw), all game data (`src/data/*.json`, 1.34 MB raw / 199 KB gz), framer-motion (395 KB raw), react-router, zod, react-dom | `vite build`, source-map breakdown | One file carries both what never changes (libraries, data) and what changes every week (game code) |
| `__BUILD_ID__` is `define`d into the main chunk and contains `Date.now()`. **Two builds of the same commit give the main chunk two different hashes** (*measured*: `index-Dg9Sbf6O.js`, then `index-CngxK5RR.js`) | `vite.config.ts:43`, `src/store/sync.ts:288` | Every deploy, even a docs-only commit, makes every returning player download the 616 KB again, and `version.json` reloads every open tab |
| Netlify builds and deploys on every push to the production branch; there is no `ignore` rule | `netlify.toml` | Commits that touch only `docs/`, `graphics/`, `scripts/` or `tests/` still cost a production deploy (15 credits) and the re-download above |
| `version.json` is fetched with `no-store` on return to the tab (at most every 10 min) and hourly while visible | `src/store/sync.ts:250–254` | Each check is a billed Netlify web request: several per player per day |
| 3,632 PNGs in `public/` (*measured*: 3,245 Pokémon files, 6.8 MB; 357 trainers, 1.5 MB). Median 2 KB. One request per image, cached 30 days with `stale-while-revalidate` | `public/`, `netlify.toml` | Requests, not bytes, are the image cost. Screens that list many Pokémon (Box, Pokédex, boards, Versus) cost one request per icon |
| All sprite URLs come from one function | `src/components/SpriteImg.tsx:9` (`spriteUrlFor`) | Versioned URLs and sprite sheets can be introduced in one place |
| The Supabase client is lazy-loaded (its own 59 KB gz chunk); no Realtime is used | `src/lib/supabase.ts` | Nothing to fix there |
| `leaderboard()` returns up to **3,000 rows for every region at once**. Each row carries the player's full per-area `progress` map: **~2.2–2.8 KB per row raw** (*measured* on synthetic rows), so **6–8 MB raw** for a full board. Ranking happens in the browser, per tab, per region | `0026_lighter_load.sql:136–162`, `src/lib/leaderboard.ts`, `src/screens/Leaderboard.tsx:58` | At scale this becomes the largest Supabase egress item; every opening of the board re-downloads it (no client cache) |
| `versus_board()` returns up to 1,000 teams and **counts wins with sub-queries on every call** | `0018_versus.sql:106–141` | CPU and egress grow with players × battles |
| Each admin **Publish** bumps `configVersion`; every returning player then reads **every content table** from PostgREST (~1.3 MB raw) once | `src/admin/store.ts:237`, `src/config/remote.ts:35` | One Publish at 10k players ≈ 2+ GB of uncached database egress in a day |
| On every page load of a signed-in player, `reconcile()` downloads the **whole cloud save** to compare it | `src/store/sync.ts:58`, `src/save/cloud.ts:9` | Egress scales with page loads × save size, even when nothing changed |
| `analytics_events` is no longer written but still holds ~300 MB | `0028_analytics_minimal.sql` (optional block at the end) | 60% of the Free plan's 500 MB database |
| Guest feedback is a direct `insert` with the public key | `src/lib/feedback.ts:108` | A bot can fill the table; nothing limits it |

---

## 1. Pricing this plan works against (verify before acting)

Read from third-party 2026 summaries; the vendors' own pages could not be opened from the build sandbox. Check
`netlify.com/pricing` and `supabase.com/pricing` before deciding on a plan.

**Netlify (credit-based plans)**

| Plan | Price | Credits / month | When credits run out |
|---|---|---|---|
| Free | $0 | 300 | **Site paused** until the next cycle (hard limit) |
| Personal | $9 | 1,000 | Extra credits bought, or paused |
| Pro | $20 / member | 5,000 | Extra credits bought |

What uses credits: **bandwidth 20 credits / GB**, **web requests 2 credits / 10,000**, **production deploy 15 credits**,
function compute 10 credits / GB-hour (unused here). Free = ~15 GB, or ~1.5 M requests, or 20 deploys — not all three.

**Supabase**

| | Free | Pro ($25 / project, $10 compute credit included) |
|---|---|---|
| Monthly active users (auth) | 50,000 | 100,000, then $0.00325 each |
| Database size | 500 MB | 8 GB, then $0.125 / GB |
| Egress (database / API) | 5 GB | 250 GB, then $0.09 / GB |
| Cached egress (Storage CDN) | 5 GB | 250 GB (separate quota), cheaper overage |
| Compute | Nano, shared CPU, 0.5 GB RAM | Micro, included |
| API requests | unlimited | unlimited |
| Other | Paused after 7 days without activity | Spend cap **on by default**: no overage billed, services restricted instead |

Two things follow. **On Netlify, requests and re-downloads cost money; on Supabase, requests are free and only bytes
cost money.** And **Supabase Storage (public bucket, CDN-cached) has its own egress quota**, separate from the database's.
The plan moves big, shared, rarely-changing reads (content, boards) to Storage files, and cuts Netlify requests and
re-downloads.

---

## 2. The cost model

### 2.1 Netlify, per monthly active player (*estimate*)

Assumptions: a player plays ~8 days a month, loads the page ~2 times on those days, sees ~8 deploys a month, and meets
~250 new images in a month.

| Item | Today | After this plan |
|---|---|---|
| First load (HTML, JS, CSS, latin fonts, first sprites) | ~1.1 MB, ~180 requests | ~0.85 MB, ~60 requests (§4 split, §5 sheets & recompression) |
| Re-downloads after deploys | 8 × 616 KB ≈ **4.9 MB** | ~4 real deploys × ~120 KB ≈ 0.5 MB (§3.1, §3.2, §4.1) |
| `version.json` checks | ~50 requests | ~16 requests (§3.3) |
| HTML loads | ~16 requests | ~16 requests |
| New and stale images | ~150 requests | ~20 (sheets, versioned URLs, service worker §5) |
| **Per player** | **~6 MB, ~370 requests** | **~1.4 MB, ~110 requests** |

Plus the deploys themselves: today ~20 / month × 15 = **300 credits**, the whole Free plan; after §3.2 and batching,
~8 × 15 = 120 credits.

### 2.2 Netlify credits by audience (*estimate*)

| Monthly players | Today | After the plan | Plan needed after |
|---|---|---|---|
| 1,000 | ~530 (over Free → **paused**) | ~170 | Free |
| 3,000 | ~880 | ~270 | Free, tight (it holds up to ~3,500) |
| 10,000 | ~2,300 | ~620 | Personal $9 |
| 30,000 | ~6,300 (over Pro) | ~1,620 | Pro $20 |
| 50,000 | ~10,300 | ~2,620 | Pro $20 |

### 2.3 Supabase egress by audience (*estimate*, 10,000 monthly players, ~3,000 of them signed in and active in 72 h)

| Item | Today | After the plan |
|---|---|---|
| Leaderboard (10 openings / player / month) | full board ~0.7 MB gz per open → **~70 GB** | region-only compact rows + 5-min client cache → ~3 GB (§6.2 A); ~0 database egress with snapshots (§6.2 B, Storage quota instead) |
| Versus board | ~5–10 GB | ~1 GB (§6.3) |
| Content Publish (per publish) | ~2 GB | ~0 database egress (§6.1, Storage quota) |
| Save compare on page load | ~4 GB (save size × loads) | ~1 GB (§6.4) |
| Ping, feedback, auth | < 0.5 GB | < 0.5 GB |
| **Total** | **~80+ GB → Pro, close to the 250 GB cap at 30k** | **~5 GB → Free is at its limit, Pro has 50× headroom** |

Database size: saves × average save size (measure, §2.4). At 50 KB per save, 10,000 signed-in players = 500 MB, which
already fills Free. **Plan on Supabase Pro ($25) from roughly 2,000–3,000 regular players**, whatever the egress.

### 2.4 Measure first (half a day, before Phase 1 ships)

The estimates above carry a factor-of-two uncertainty. Replace them with real figures:

- **Netlify** → Usage & billing: credits used, split by bandwidth / requests / deploys, for the last 30 days. Count the
  production deploys of the last month.
- **Supabase** → Reports / Usage: egress per day, database size, MAU, CPU.
- **Supabase SQL editor**:
  ```sql
  -- largest tables
  select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_catalog.pg_statio_user_tables
  order by pg_total_relation_size(relid) desc limit 15;
  -- save size
  select count(*), pg_size_pretty(avg(pg_column_size(data))::bigint) avg, pg_size_pretty(max(pg_column_size(data))::bigint) max from saves;
  -- leaderboard rows and payload today
  select count(*), pg_size_pretty(sum(pg_column_size(progress) + pg_column_size(team))::bigint) from leaderboard_cache;
  -- heaviest queries (pg_stat_statements is on by default)
  select calls, round(total_exec_time) ms, left(query, 80) from pg_stat_statements order by total_exec_time desc limit 10;
  ```
- **Players**: monthly active players from Admin → Analytics (`player_days`).

Write the figures into §8 and recompute §2.2 / §2.3.

---

## 3. Phase 1 — Stop paying for deploys (≈ 1 day, highest return)

### 3.1 A build id that only changes when the code does

- `vite.config.ts`: drop the `define: { __BUILD_ID__ }`. In `buildVersion()`, use `generateBundle(_, bundle)` to find
  the entry chunk (`chunk.isEntry`) and write `version.json` as `{ "build": "<entry file name>" }`. Rollup's hash of the
  entry already reflects every chunk it imports, so any code or data change gives a new name, and an unchanged build
  gives the same one.
- `src/store/sync.ts`: compare against the page's own entry script
  (`document.querySelector('script[type="module"][src*="/assets/index-"]')`) instead of `__BUILD_ID__`. Delete the
  declaration in `src/vite-env.d.ts`.
- **Result:** a rebuild with no code change re-downloads nothing and reloads no tab.
- Tests: extend `tests/sync.test.ts` for "same entry → no reload, other entry → reload when safe".

### 3.2 Don't deploy what players can't see

- `netlify.toml`, under `[build]`:
  ```toml
  # Exit 0 = skip the build. Only what ends up in dist/ triggers a deploy.
  ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- src public index.html package.json pnpm-lock.yaml vite.config.ts tailwind.config.ts postcss.config.js tsconfig.json tsconfig.node.json netlify.toml"
  ```
- In the Netlify UI → Build & deploy: check whether branch deploys and deploy previews are on for `claude/*`
  branches, and whether they are billed on your plan. If they are, limit them to the production branch.
- Habit: merge to the production branch in batches (for example once a day, or once per finished feature), not after
  every small fix. Each deploy costs 15 credits plus the players' re-downloads.

### 3.3 Fewer `version.json` checks

- `src/store/sync.ts`: `VERSION_ON_RETURN_MS` 10 min → **60 min**; `VERSION_WHILE_OPEN_MS` 1 h → **6 h**. The 24-hour
  page age (`MAX_PAGE_AGE_MS`) stays as the safety net. With fewer, batched deploys, nobody waits long for a new build.

### 3.4 Free the database

- Run the optional block at the end of `0028_analytics_minimal.sql` (drops `analytics_events`, ~300 MB). Take a
  backup first if the raw history matters.

**Phase 1 acceptance:** two builds of the same commit produce the same `index-*.js`; a docs-only push shows "Build
skipped" in Netlify; database size drops by ~300 MB.

---

## 4. Phase 2 — Smaller downloads (≈ 1–2 days)

### 4.1 Split the main chunk by how often each part changes

`vite.config.ts` → `build.rollupOptions.output.manualChunks`:

| Chunk | Contents | Changes when |
|---|---|---|
| `vendor` | react, react-dom, react-router(-dom), zustand, immer | a dependency upgrade |
| `motion` | framer-motion | a dependency upgrade |
| `zod` | zod | a dependency upgrade |
| `data` | `src/data/*.json` (~199 KB gz) | game content is synced into the build |
| entry + routes | game code | most deploys |

Expected after a code-only deploy: ~100–150 KB gz to re-download instead of 616 KB. The first visit is about the
same size (a little better compression per file, a few more requests).

### 4.2 Load one language, not eleven

- A build step (extend `scripts/i18n-*.ts`, or a small Vite plugin) splits `src/i18n/strings.csv` into one JSON per
  language. English stays bundled as the fallback for missing keys. The others load with
  `import.meta.glob('./strings/*.json')`.
- `src/main.tsx`: wait for the player's language before the first render (one ~40 KB file, requested in parallel with
  the `data` chunk). Settings → Language waits for the new file before switching.
- Saves ~400 KB raw from every first load and from every deploy that touches strings.

### 4.3 Optional trims

- framer-motion: `LazyMotion` + `m` with `domAnimation` instead of `motion` (typically less than half the size).
- Confirm that `SetupPage` (875 KB, it inlines `supabase/seed.sql`) and `AdminApp` are only reached by their lazy
  routes. They are today (`src/App.tsx:27`); keep it that way.

**Phase 2 acceptance:** `vite build` shows a main entry under ~150 KB gz. A deploy that changes one screen changes
only the entry and that screen's chunk names. Lighthouse first load no slower than today.

---

## 5. Phase 3 — Game resources (sprites, fonts) (≈ 2 days)

### 5.1 Recompress the PNGs losslessly

- `oxipng -o max --strip safe` over `public/` (and over what `scripts/*-sprites.ts` writes, so new sprites stay
  small). Pixel art usually loses 10–30% at identical pixels. Keep PNG: no format risk, and every tool in `scripts/`
  already reads it.

### 5.2 Versioned image URLs, cached for a year

- `spriteUrlFor` (and the trainer, banner, battle and character helpers) append `?v=<SPRITES_VERSION>`, a constant
  bumped whenever an existing image is replaced.
- `netlify.toml`: those folders go to `public, max-age=31536000, immutable`. This removes the monthly revalidation
  requests, and fixes the "replacing an image takes a month" note in `netlify.toml`.

### 5.3 Sprite sheets where many icons show at once

- A `scripts/` step packs the Box icons (`*_mini.png`) into one sheet per generation (~151 icons per file), plus a
  small JSON of offsets (alongside `sprite-metrics.json`).
- `MiniSprite` draws from the sheet with `background-position` (`image-rendering: pixelated` as today).
- The Box, Pokédex, Leaderboard and Versus screens then cost ~1–5 requests instead of up to several hundred. Front,
  back and shiny sprites stay one file each: a battle shows only a few, and `preloadSprites` already warms the
  current area's pool.

### 5.4 A service worker for repeat visits (runtime cache only)

- `vite-plugin-pwa` (Workbox, `generateSW`):
  - **Precache only the app shell** (`index.html`, `assets/*.js|css`, the latin fonts), never all 3,600 images.
  - **Cache-first runtime caching** for `/pokemon/`, `/trainers/`, `/banners/`, `/battle/`, `/characters/`, `/fonts/`.
  - **Network-only** for `/version.json` and anything on `*.supabase.co`.
- An image a player has seen once is never requested from Netlify again, and the game opens offline. Hook the
  service worker's update into the existing "reload when safe" flow (`reloadWhenSafe`), so a new worker never
  interrupts a fight.
- Test on iOS Safari and in private windows (no service worker): the game must work the same without it.

**Phase 3 acceptance:** opening the Box with 300 Pokémon makes ≤ 10 image requests. A second visit after clearing
the HTTP cache (service worker kept) makes 0 image requests. `public/` is smaller by the measured oxipng gain.

---

## 6. Phase 4 — Supabase load at scale (≈ 3–4 days)

### 6.1 Content through Storage, not tables

- A migration creates a public Storage bucket `content` with read access for everyone and write access for the admin
  only (`is_admin()`).
- Admin → **Publish** (`src/admin/store.ts`) also uploads the whole bundle as `content/v<configVersion>.json`, with
  `cacheControl: '31536000'` (the file never changes under its name).
- `fetchContentUpdate` (`src/config/remote.ts`) keeps the one-row `configVersion` read, then fetches the public file.
  If the file is missing (an older publish), it falls back to reading the tables as today.
- Keep folding published content into the build (`pnpm sync`) after content changes settle, so new players start on
  the current content and never hot-swap.
- **Result:** a Publish costs the database almost nothing. The download comes from the Storage CDN, on the cached
  egress quota.

### 6.2 Leaderboard

**Step A — smaller and less often (SQL + client):**

- `leaderboard(p_region text)`: only the region the player is looking at. That is all the screen shows
  (`src/screens/Leaderboard.tsx:70`).
- Compact rows: instead of the full `progress` map, send what the ranking actually uses per row: areas cleared on the
  region's main route, gym battles won, the frontier area id, and "region cleared". Compute them in SQL from the
  `areas` table when `leaderboard_cache` is rebuilt (`0026`), and keep `src/lib/leaderboard.ts` ranking on those
  fields. ~150 B per row instead of ~2.5 KB.
- Client cache: keep the last board per region in memory and `sessionStorage` for 5 minutes. Reopening the screen
  within that window costs nothing. A sign-in change still refetches.
- Estimated: ~40× fewer bytes per opening, about half the openings.

**Step B — static snapshots (when §2.3 says the board is still the top egress item):**

- An Edge Function `publish-boards`, run every 5 minutes by `pg_cron` + `pg_net` (~8,600 calls a month, far under the
  free quota). It reads `leaderboard_cache` and writes `boards/<region>.json` to a public bucket with
  `cache-control: max-age=300`.
- A new `my_leaderboard_rows()` RPC returns only the caller's own rows, live, so a player always sees themselves up to
  date (the promise `0026` already keeps).
- The client merges the snapshot with its own rows.
- **Result:** database CPU and egress for the board stop growing with the number of players. The Storage CDN serves
  the shared part.

### 6.3 Versus board

- Store `attack_wins` and `defense_wins` on the team row, kept up to date by `versus_record()`, instead of counting
  `versus_battles` on every `versus_board()` call. One migration backfills them from the existing battles.
- The same 5-minute client cache as §6.2 A. Later, the same snapshot as §6.2 B if it grows.

### 6.4 Don't download the save to learn it hasn't changed

- `reconcile()` first reads only `saves.updated_at` for the user (a few bytes). If it equals the local save's
  `updatedAt`, and this device made that push, the result is `'same'` with no full download. Otherwise it proceeds
  as today.
- `cloudSyncMinutes` (Admin → Config, 15 today) is the lever if write volume ever matters: 20–30 minutes halves the
  pushes, and closing the page still pushes immediately (`flushPush`).

### 6.5 Growth and abuse

- Feedback: replace the direct insert with an RPC `send_feedback()` that checks length and limits each device / user
  to ~5 messages a day. Revoke `insert` on `feedback` from `anon`. If bots show up anyway, add Cloudflare Turnstile
  (free) in front of it.
- Retention jobs (`pg_cron`, monthly): delete `players` guest rows inactive for 12 months, `versus_battles` older than
  90 days (once §6.3 keeps the counters). Keep `player_days`: it is small (~15 MB per 10k players per month) and feeds
  retention.
- Review `pg_stat_statements` once a month (query in §2.4).

**Phase 4 acceptance:** with the seed data plus 5,000 synthetic saves, one leaderboard opening transfers < 100 KB from
the database. A Publish causes no table reads from clients that have the Storage file. A page load of an unchanged
signed-in save transfers < 1 KB from `saves`.

---

## 7. Phase 5 — Plans, monitoring and when to upgrade

### 7.1 Which plan, when

| Monthly players | Netlify | Supabase | Monthly cost |
|---|---|---|---|
| < 2,000 | Free (after Phases 1–3) | Free (after §3.4; keep an eye on database size) | **$0** |
| 2,000 – 10,000 | Personal $9 | **Pro $25**, spend cap on | **$34** |
| 10,000 – 50,000 | Pro $20 (or Personal while under 1,000 credits) | Pro $25, spend cap on | **$45** |
| 50,000 + | Pro $20 + extra credits if needed | Pro $25; MAU above 100k billed | ~$45–80 |

Without the plan, the same 10,000 players need Netlify Pro, and Supabase Pro with leaderboard egress growing toward
the 250 GB cap. Past ~30,000 players they mean overage on both.

### 7.2 The one outage to avoid

**Netlify Free pauses the site when its 300 credits run out.** Upgrade to Personal before it can happen: at 70% of
the month's credits, not at 100%. Turn on Netlify's usage notifications.

### 7.3 Weekly check (5 minutes)

| Signal | Where | Act at |
|---|---|---|
| Netlify credits this cycle | Usage & billing | 70% before the 20th of the cycle → upgrade, or find the cause |
| Supabase egress / day | Usage | > 60% of the plan's monthly quota ÷ 30 |
| Supabase database size | Usage | 80% of the plan |
| Supabase CPU | Reports → Database | sustained > 70% (the Nano stall on 2026-10-01 is the reference) |
| Monthly players | Admin → Analytics | crossing a row of §7.1 |

---

## 8. Order of work and what to fill in

| # | Step | Effort | Saves |
|---|---|---|---|
| 1 | Measure (§2.4) | ½ day | — (sets the baseline) |
| 2 | Phase 1: build id, build ignore, fewer checks, drop `analytics_events` | 1 day | Most of the Netlify bill; 300 MB of database |
| 3 | §6.2 A leaderboard: region + compact rows + client cache | 1 day | Most of the Supabase egress |
| 4 | §6.1 content through Storage | ½ day | The Publish spikes |
| 5 | Phase 2: chunk split, one language | 1–2 days | Re-downloads, first load |
| 6 | Phase 3: oxipng, versioned URLs, sheets, service worker | 2 days | Image requests |
| 7 | §6.3 Versus counters, §6.4 save check, §6.5 feedback RPC | 1–2 days | CPU, egress, abuse |
| 8 | §6.2 B board snapshots | 1 day | Only when §7.3 shows the board is still the top item |

Baseline to record after step 1:

| Figure | Value |
|---|---|
| Monthly players | _ |
| Netlify credits, last 30 days (bandwidth / requests / deploys) | _ / _ / _ |
| Production deploys, last 30 days | _ |
| Supabase egress, last 30 days | _ |
| Database size; `saves` avg / max save | _ ; _ / _ |
| `leaderboard_cache` rows | _ |

### Deliberately out of scope

- Moving hosting or backend off Netlify / Supabase (asked to stay).
- Self-hosting Supabase, or a second database.
- Cutting features (boards, Versus, cloud saves) to save cost: none of them is expensive once built as above.
