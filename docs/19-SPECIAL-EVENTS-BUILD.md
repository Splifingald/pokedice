# Special Events: build plan

Status: **decisions taken, ready to build on your go** (2026-10-10). Branch `feature/version_2` (HEAD 9baaf9a).
What to build is decided in `docs/18-SPECIAL-EVENTS-PLAN.md` and shown in the Visual Lab (`design/visual-lab/events.js`, published in the "Pokédice Visual Lab" artifact). This document says **how**: architecture, files, data, SQL, tests and the order of work.

Rules that apply everywhere (CLAUDE.md, memory):
- `src/engine` stays pure: no React, zustand, Supabase, fetch, `window`, `localStorage` (eslint enforces it).
- Every player-facing string goes in `src/i18n/strings.csv`, all 10 languages filled (`tests/i18n.test.ts`); run `pnpm i18n:fonts` after CJK edits.
- Jersey fonts only; phone layout rules of `e2e/layout.spec.ts` (no sideways scroll, ≥ 44 px controls, axe clean).
- Before each commit: `pnpm lint && pnpm build && pnpm test && pnpm e2e`.
- Supabase: one migration per server change, idempotent; anything a fresh database needs goes into `regionsPrelude()` (`scripts/seed.ts`).
- Other sessions are active in this worktree: Battle UI (`BattleView`, `BattleStage`, `useBattleAnimator`), Day Care (`Widgets.tsx`, `strings.csv`, migration 0034). Rebase before touching those files; take the next free migration number.

---

## 1. Architecture at a glance

| Layer | New | Touched |
|---|---|---|
| Engine (pure) | `engine/events.ts` (unlocks, priorities, due pop-up), `engine/wheel.ts`, `engine/raid.ts` (pool, pick, orchestrator), `engine/raidAi.ts`, `engine/rebattle.ts`, `engine/eventTime.ts` | `types.ts` (config + save types), `defaults.ts`, `run.ts` (II-area migration, raid catch), `encounters.ts` (no raid species as bosses), `breeding.ts` (`isLegendary` reused) |
| Save | `SaveData.events` (optional, global) | `save/schema.ts`, `store/game.ts` `settle()` |
| Store | `store/events.ts` (actions), `store/raid.ts` (raid battle driver), `store/serverTime.ts` | `store/run.ts` (rebattle gauntlet as a trainer chain) |
| Cloud | `lib/events.ts` (RPC calls), migration `00NN_events.sql` | `lib/leaderboard.ts` (raids tab) |
| UI | `screens/Events.tsx` (+ `events/WheelPage`, `RaidPage`, `RebattlePage`), `events/Wheel.tsx` (canvas), `events/RaidIntro.tsx`, `events/EventUnlockPopup.tsx`, `events/GiftPopup.tsx`, `home/EventWidgets.tsx` | `App.tsx` routes, `GameLayout.tsx` pop-up queue, `home/Widgets.tsx`, `BattleView.tsx` (raid mode), `BattleStage.tsx` (queues, bars), `Leaderboard.tsx`, Pokédex "where to find" |
| Admin | `admin/sections/EventsSection.tsx` | `AdminApp.tsx` SECTIONS |
| Content | `scripts/rebattle-teams.ts`, `scripts/raid-areas.ts` | `src/data/areas.json`, `trainers.json`, `config.json`, `seed.sql` |

---

## 2. Data model

### 2.1 Config (`game_config` row `events`, merged over `DEFAULT_CONFIG.events`)
`EventsConfig` in `engine/types.ts`, defaults in `engine/defaults.ts`, edited in the new admin section. One row keeps it to a single `useConfigRow('events')`.
```ts
interface EventsConfig {
  teaserBadges: number                         // 3
  events: Record<'wheel' | 'raid' | 'rebattle' | 'seasonal', {
    enabled: boolean; priority: number          // 5 · 3 · 4 · 1
    unlockAreaId: string | null                 // wheel: Routes 7 & 8 · raid: Safari Zone · rebattle: null (each region's league)
    banner: string                              // picture key (placeholders from public/area-art until event art exists)
    rules: string[]                             // 2–4 strings.csv ids; texts take {numbers} from this config
    schedule?: { start: string; end: string }   // shared events only (seasonal, later)
  }>
  wheel: { slices: { reward: { kind: 'gold'; amount: number } | { kind: 'item'; key: string; qty: number }; count: number; odds: number }[] }
  raid: {
    bars: number; barColors: string[]; startAllies: number; summonPerBreak: number; maxField: number   // 3 · … · 2 · 2 · 2
    level: number; upgradeLevel: number; teamCap: number; maxFriends: number                             // 50 · 7 · 50 · 2
    fallbackShiny: number; repeatHours: number; helperDailyCap: number                                   // 0.3 · 72 · 5
    gifts: { key: string; weight: number }[]
    pool: { dex: number; areaId: string }[]                 // the 23 legendaries and the area that unlocks each
    fallback: { dex: number; regionId: string; areaId: string }[]   // area = where it's fought (its picture)
    exclude: { pseudo: number[]; extra: number[] }          // NPC / summon exclusions on top of legendaries and starters
    npcs: { name: string; look: string; team: number[] }[] | null  // null = generated
  }
  rebattle: {
    tiers: { id: 'bronze' | 'silver' | 'gold'; gold: number; upgradeDelta: number | 'max' }[]   // ×1.5/+1 · ×2/+2 · ×3/max
    regions: Record<string, { trainers: string[][] }>        // per region: tier → 5 trainer ids (the rival slot may list one id per starter)
  }
}
```

### 2.2 Save (`SaveData.events`, optional, global; added to `save/schema.ts` as an optional object)
```ts
interface EventsSave {
  seen?: string[]                                  // unlock pop-ups shown
  wheelDay?: string                                // UTC yyyy-mm-dd of the last spin
  raid?: { day: string; dex: number; shiny: boolean; areaId: string; caught: boolean; tries: number }
  raidHistory?: { day: string; dex: number }[]     // 72 h no-repeat
  raidTeam?: string[]                              // 3 instance ids, any region (like Versus)
  raidPool?: number[]                              // dex unlocked by clearing their areas
  raidsWon?: number                                // caught raids (mirror of the server count)
  rebattle?: Record<string, { tier: number; step: number; done: number; paid: string[] }>   // per region; paid = 'tier:trainerId'
  giftsSeen?: string                               // last gift id shown
}
```
- Gold and items go to the **live region** (gold and bag are per region in `RegionSave`). A caught raid Pokémon goes to its home region's Box (D3).
- Load-time steps in `settle()`: (a) `raidPool` backfill: a pool legendary already caught, or its area cleared, joins the pool; (b) II-area migration (§5.4).

### 2.3 Server (migration `00NN_events.sql`, next free number, added to `regionsPrelude()`)
Tables (RLS on, revoked from anon/authenticated, admin policy, like 0033):
- `event_state(user_id pk, wheel_day date, raid jsonb, raid_history jsonb, raids_won int default 0, updated_at)`.
- `raid_teams(user_id pk, version int, team jsonb [{dex, level, shiny}]×3, ids jsonb, updated_at)`: built server-side from the cloud save, like `versus_teams`.
- `raid_gifts(id identity, helper_id, raider_id, raider_name, dex, item_key, created_at, claimed_at)`: index on (helper_id, created_at).

RPCs (security definer, `set search_path = public`, `p_*` params, errors `events_<reason>`):
- `event_time()` → `{now, day, seconds_to_midnight}`: **granted to anon too**, so guests read real time.
- `wheel_spin()` → `{slice, day}`: refuses a second spin the same UTC day; rolls the slice from `game_config.events.wheel`.
- `raid_today(p_candidates jsonb)` → the day's raid; the first call of the UTC day stores the pick (validated: in the candidates, not in the last `repeatHours`), later calls return it.
- `raid_set_team(p_ids text[])` → version (mirrors `versus_set_team`).
- `raid_friend_teams()` → friends' registered raid teams (uses `friend_ids_of`).
- `raid_close(p_caught bool, p_helpers uuid[])` → marks today's raid caught, `raids_won + 1`, writes one `raid_gifts` row per helper (daily cap per helper enforced here).
- `raid_gifts_claim()` → unclaimed gifts for the caller, marks them claimed.
- `leaderboard()` redefined (same columns + `raids_won`), read from `event_state` by user.

Guests: no row; their state lives in `SaveData.events`, and they only need `event_time()`.

---

## 3. Shared pieces (phase 1)

1. **Server time** (`store/serverTime.ts` + `engine/eventTime.ts`)
   - On boot and every 10 min: `event_time()` RPC; fallback the `Date` header of a `HEAD /` to the site. Keep `offset = server − Date.now()`.
   - `nowUtc()`, `utcDay()`, `msToUtcMidnight()` read through the offset. Unknown time (offline) → event cards say "Connect to the internet" and actions wait.
2. **Engine `events.ts`**
   - `eventUnlocked(id, save, data)`: wheel/raid = their `unlockAreaId` cleared in the save (the region block that owns the area, also when parked); rebattle = any region's league area cleared.
   - `activeEvents(save, data, now)` sorted by priority; `eventNeedsAttention(id, …)` (free spin, raid not caught, tier not started).
   - `eventUnlockDue(save, data)`: the newest unlocked event not in `events.seen`; older ones are marked seen at the same time.
   - `teaserDue`: `badges ≥ teaserBadges` in Kanto and no event yet.
   - `ruleParams(id, config)`: the numbers the rule strings interpolate.
3. **Home** (`home/EventWidgets.tsx`, wired in `home/Widgets.tsx` after Versus)
   - One square per active event, same `Widget` frame and grid: `RaidWidget` (sprite, time left, tries, LIVE/CAUGHT tag), `RebattleWidget` (next opponent's portrait, tier medal, fight n of 5), `WheelWidget` (prize carousel, icons only, CSS marquee; reduced motion = static row), `EventsTeaser` (dashed, locked).
   - Ticking text via `useNow(30_000)`; the carousel never re-mounts on a tick.
4. **Events screen** (`/events/:id`, inside `GameLayout`)
   - Banner header (`EventBanner`: picture + title + live status + back button to `/home`), then the event's page. No tabs between events.
5. **Unlock pop-up** (`events/EventUnlockPopup.tsx`, mounted last in `GameLayout`'s queue, after Share)
   - Banner picture, 2–4 rule rows (`t(key, ruleParams)`), Later / Let's go. Store action `markEventSeen(id)`.
6. **Admin** (`admin/sections/EventsSection.tsx`, `SECTIONS` + `events`)
   - Boxes: Events (enabled, priority, unlock area picker, banner picker with preview, rule ids) · Wheel (slices table, live wheel preview, sum check) · Raids (all numbers, colours, pool and fallback lists with area pickers, exclusions, gifts table, NPC list) · Rebattle (tiers; per region a 3 × 5 grid of trainer pickers, linking to the Trainers section) · Dev tools (reset my spin, rotate my raid, reset rebattle, grant a gift: on the admin's own save via `admin/playerSave.ts`).

---

## 4. Fortune Wheel (phase 2)

- **Engine `wheel.ts`**: `wheelSlices(config)` (round-robin so equal prizes never touch; the lab's algorithm), `pickSlice(slices, rng)` (guests), `wheelReward(slice)`, `canSpin(save, day)`.
- **Store `spinWheel()`**: signed in → `wheel_spin()` RPC (server picks); guest → `pickSlice` with the server-time day. Then `commitSave`: gold or item into the live region, `events.wheelDay = day`. The animation is given the slice index **before** the commit, and the reward card shows after it.
- **UI `events/Wheel.tsx`**: a port of the lab's canvas wheel.
  - Wheel canvas at device resolution, effects canvas around it, CSS rays and halo.
  - Marquee bulbs, wind-up, out-quart spin with motion blur and sparks, teeter, land shake, slice blink/dim, prize pop-out, coin/star bursts, jackpot (Ultra/Master Ball) flash and shower.
  - Sounds through the game's existing sound helper (cries/sfx module); reduced motion = short spin, no particles.
- **Page**: wheel, Info (odds sheet), Spin / "Come back tomorrow · next spin in …".
- **Tests**: slices order and counts, odds normalisation, one spin per UTC day (guest and signed-in paths with a mocked RPC), reward applied once.

---

## 5. Elite Rebattle (phase 3)

### 5.1 Content
- **`scripts/rebattle-teams.ts`** (writes `trainers.json` + `config.json` `events.rebattle.regions`): for each region with a league, from the League I Elite Four and Champion:
  - Bronze: League I levels + 10, one Pokémon swapped for another of the member's type; Silver: + 25, another swap; Gold: everyone Lv.100. **Three Pokémon max per trainer**, the ace last.
  - Champion slot: Kanto uses the rival per starter (`rivalOf` 1/4/7, the three existing League II rival trainers re-teamed per tier); other regions use their League I champion's stronger copy.
  - Trainer `upgradeLevel` = league level + `upgradeDelta` (max = 10); potions like League II (`gymPotions` rule).
  - Stable ids (`stableUuid`), so re-running the script updates the same rows. Teams are then tuned in the admin.

### 5.2 Engine `rebattle.ts`
- `rebattleState(save, regionId)`, `rebattleOpen(save, data, regionId)` (league I cleared), `currentFoe`, `nextTier`.
- `rebattleGold(trainer, tier, data)` = `trainerGoldFor(level, leagueArea, false, data, true) × tier.gold`, **0 if `paid` already has `tier:trainerId`**.
- `onWin` → step + 1, mark paid; after the champion → `done`, next tier. `onLoss` → step 0 (paid kept).

### 5.3 Store: the gauntlet
- Reuses the trainer chain: a new encounter kind `rebattle` on the league area. `run.trainer` walks the five trainers of the tier; between fights **no Center**, items allowed; HP carries over.
- `applyVictory` with a `rebattle` flag: gold from `rebattleGold`, XP as usual, **no badge, no area progress, no gym record**.
- A loss: the gauntlet resets to the first trainer; the team is healed like a wipe, without the area effects of `applyWipe` (decision D5).
- `isAreaClosed`/`dueGym` untouched: the rebattle never goes through the area deck.

### 5.4 Removing Victory Road II and League II
- **Areas**: Kanto 23/24, Johto 52/53, Sinnoh 117/118, Unova 519/520, Kalos 624/625, Alola 724/725 (Mount Lanakila II), Galar 819/820. Hoenn and Paldea have none. Johto's Mt. Silver (54) then follows Indigo Plateau (51) by itself (linear chain).
- **Trainers** used only there: VR II pools and League II gyms/pools (listed in the research notes), except Kanto's three rival champions, which move into the rebattle.
- **Where to delete**: `src/data/areas.json` / `trainers.json` / pools; `content*.ts` scripts and seed background maps so a re-run doesn't bring them back; `areaArtMap.ts` lines; tests (`data.test.ts` Kanto chain of 24 → 22, `rival.test.ts` moved to the rebattle).
- **Live database**: `seed.sql` only upserts, so the rows stay. Either delete them in the admin (Publish runs deletes), or a one-off `00NN_remove_league_ii.sql` with the ids (pools first, then areas, then trainers). Plan: the SQL file, run once, listed in the hand-over.
- **Saves** (`settle()`, new `migrateLeagueII`): a `currentAreaId` (live or parked block) on a deleted area moves to that region's league area; progress rows for deleted areas are dropped. **Without this, `setContent` sends the player to Kanto Route 1.** Pokémon, items, gold are untouched; no rebattle credit.
- **Side effects to check**: `lib/leaderboard.ts` `clearedRegion` (every linear area cleared → Hall of Fame) now ends at the league; the crown is already the league I clear (`regionCases`); `legacyGauge.ts` keeps its Kanto ids harmlessly.

### 5.5 UI
- Rebattle page: region chips (live region active; others "Travel to … to fight", decision D2), tier medals (bronze diamond, silver pentagon, gold hexagon, CSS clip-paths), gauntlet ladder with paid marks, rules, Start / Continue.
- The fights are normal `BattleView` trainer fights. A tier clear shows the medal card (stamp + confetti).

---

## 6. Raids (phases 4–6)

### 6.1 Content and the raid pool (phase 4)
- **`scripts/raid-areas.ts`**: for the 23 pool species, remove them from `legendaryBoss` and store `events.raid.pool [{dex, areaId}]`.
- **Areas left empty** (decision D1). Faraway Island, Birth Island, Southern Island II, Fullmoon Island, Seabreak Path, Flower Paradise and the Hall of Origin have `roundsToClear: null` and most have no wild pool, so today they would never clear, or their deck would be one Center card. Plan: `roundsToClear: 1` for all 21 areas, and a small wild pool per area from the region's late-game species (proposed by the script, tuned in admin).
- **Unlock**: `applyVictory`/`clearIfDone` emits `area_cleared` → the engine adds the area's pool species to `events.raidPool` and emits a `raid_unlocked` event (Victory recap line + the "Raid unlocked!" moment).
- **Saves**: backfill (§2.2).
- **Encounters**: raid species never come back as `legend` cards (`legendCards`/`fledLegendary` filter the pool).

### 6.2 Picking the raid (phase 4)
- `engine/raid.ts`:
  - `raidCandidates(save, data, now)`: pool not owned → else pool shinies not owned → else fallback (regions reached), excluding the last `repeatHours`.
  - `pickRaid(candidates, seed, cfg)` (fallback shiny roll).
- **Store `loadRaid()`**: signed in → `raid_today(candidates)`; guest → `pickRaid` seeded by day. The result goes in `events.raid` (day, dex, shiny, areaId).
- **Exclusion set** (NPCs and summons), `raidExcluded(data, cfg)`: `isLegendary` (egg-groups `l: 1`) + `cfg.exclude.extra` (Ultra Beasts, paradox, Rotom…) + `cfg.exclude.pseudo` + every species in a starter line (regions' `starters` expanded through evolutions, as in `daycare.ts`) + not fully evolved (`evolutions.length > 0`).

### 6.3 The raid battle engine (phase 5)
The battle reducer is strictly one side against one enemy (`BattleState.player[]` vs `enemy`). Rather than rewriting it, **the raid is an orchestrator over one-on-one duel steps**:
- **`RaidState`**: `sides[3]` (owner, look, mons with HP/status, active index, out), `foes` (the boss with `bars`, `bar`, plus `summons[maxField]`), `points`, `round` (speed-ordered queue), `front {foe, own}`, `lastTarget`, `log`, `seed`.
- **Each turn is a real battle step**:
  - `duelFor(attacker, target)` builds a `BattleState` with `createBattle` semantics (player = attacker side's active, enemy = target), with the raid's levels (`uniformLevels(teamCap)`, the boss at `upgradeLevel`).
  - The turn runs through `reduce` (`ROLL`/`REROLL`/`ATTACK`, or `AI_TURN` for foes, `autoEvents` for allies).
  - The orchestrator copies HP and statuses back.
  - So damage, combos, type effectiveness, statuses and upgrade levels are exactly the normal game's.
- **Rules**:
  - Turn order by speed over every active Pokémon (tie: player).
  - Foes target a random active side, never the one they hit last (unless it's the only one).
  - Allies target the boss unless a summon is within one hit.
- **Bars**: the boss's HP is one bar. At 0 with bars left, refill (carry the overflow), `points += summonPerBreak`. At the last bar → won.
- **Summons**: `startAllies` at the start; a free slot at the start of the boss's turn costs 1 point; max `maxField`. Species: the boss's region, `raidExcluded` out, no type shared with the boss, Lv. `level`.
- **End**: win → summons flee → catch phase (`catchTarget(..., 'boss')` + `rollCatch`); all sides out → lost.
- **Tests**: turn order, never twice the same target, bar overflow, summon points and cap, ally targeting, determinism with a seed, a full sim win rate.
- **Balance**: `pnpm balance` gets a raid section (sample teams × NPC sides × each pool species), targeting ~50–70 % wins for a fair team at Lv.50.

### 6.4 The raid screen (phase 5)
- **`store/raid.ts`**: `startRaid()` (empty slots → NPC pop-up first), `raidDispatch(e)` for the player's turn, auto-advance for the others, `throwRaidBall(key)`, `leaveRaid()`. `holdReload()` while in a raid. The raid isn't saved mid-fight (a reload = a free retry).
- **`BattleView` raid mode**, like the existing `versus?: VersusReplay` prop: `raid?: RaidDriver`.
  - The front pair comes from the orchestrator's duel state, so the classic display, dice tray, readout and animations are reused as they are.
  - Additions in `BattleStage`: the foe plate shows the bar segments + "×N" + summon points (new `RaidBossPlate`); the own plate shows the owner tag and party balls; **queues** top right (foes, tap to target) and bottom left (allies).
  - Front swaps: slide out/in; a queued target steps forward for the hit, then back.
  - Background: `pictureOf(raid.areaId)` (the unlocking area; fallback raids use their configured area).
- **`events/RaidIntro.tsx`**: the opening (alarm tapes, storm, silhouette, pillar, white-out, name slam with bars, trainer cut-ins, GO!), canvas + CSS. ~6 s, Skip, reduced motion skips it.
- **Catch**: as in a boss fight. Success → `raid_close(true, helpers)`, `raidsWon + 1`, and the Pokémon goes to its **home region's Box**: the region of the area that unlocked the raid (a fallback raid: its configured region). If that region isn't the live one, it goes into the parked block's Box (`save.parked[region].box`), and the catch screen says so ("Mew was sent to your Kanto Box"). Failure → the raid stays open.

### 6.5 Social (phase 6)
- Raid team: `raid_set_team` on save (like Versus); the Raids page's team editor (any region, Lv.50 cap shown).
- Friends: `raid_friend_teams()` in the group picker; empty slots stay empty until Start, then the NPC pop-up ("The empty slots in your group will be filled with NPC, invite friends next time!").
- Gifts: on boot and on focus, `raid_gifts_claim()` → `GiftPopup` (queued with the others): item into the live region's bag, "gifts today n/cap".
- Leaderboard: `LeaderboardTab` + `'raids'` (`lib/leaderboard.ts` sort key, `Leaderboard.tsx` TABS), value `raids_won` (decision D4).

### 6.6 Pokédex
- "Where to find it" gets a Raid Battles row for pool and fallback species: "Clear Faraway Island to unlock its raid" (lock) / "In your raid pool" (GO → `/events/raid`) / "Shows up when your raid pool has nothing left · shiny 30 %".

---

## 7. Strings
Namespaces:
- `ui.events.*`: banner, status lines, teaser, unlock pop-up, rules with `{params}`.
- `ui.wheel.*`, `ui.raid.*` (including `ui.raid.err.<code>`), `ui.rebattle.*`.
- `ui.board.tabRaids`.

All in en/fr/es/de/it/pt/pt-BR/ja/ko/zh-Hans. Tier names (Bronze/Silver/Gold) are translated; Pokémon and trainer names come localized from data.

---

## 8. Tests
- **Unit** (`tests/engine/`):
  - `events.test.ts` (unlocks, priorities, due pop-up order, teaser)
  - `wheel.test.ts`
  - `raid-pick.test.ts` (pool → shiny → fallback, 72 h, region gates, exclusions)
  - `raid-battle.test.ts` (§6.3)
  - `rebattle.test.ts` (pay-once, loss reset, tier unlock, rival per starter)
  - `league-ii-migration.test.ts`
  - schema round-trip of `SaveData.events`
- **SQL** (`tests/events-sql.test.ts`, PGlite like `friends-sql.test.ts`): one spin per day, `raid_today` stable within a day, `raid_close` gift cap, `raids_won`, leaderboard column, anon can call only `event_time`.
- **E2E**:
  - `e2e/events.spec.ts`: widgets by save state, unlock pop-up, wheel spin (mocked RPC), rebattle win/lose, raid start with NPC pop-up, a fast raid to the catch.
  - `layout.spec.ts`: `/events/wheel`, `/events/raid`, `/events/rebattle` added to `ROUTES`.
  - Raid battle fits 360×640.

---

## 9. Order of work
Each phase ends green (lint, build, test, e2e) and is one commit (or a few) on `feature/version_2`.

| # | Phase | Main content | Depends on |
|---|---|---|---|
| 1 | Framework | config + save types, server time, `events.ts`, Home squares + teaser, `/events/:id` with banner, unlock pop-up queue, admin section shell, strings, migration (tables + `event_time`) | – |
| 2 | Fortune Wheel | engine, `wheel_spin`, canvas wheel + effects, odds sheet, admin wheel box | 1 |
| 3 | Elite Rebattle | teams script, II-area removal + save migration + SQL delete file, gauntlet in the store, page, medals, admin grid | 1 |
| 4 | Raids: content & pick | legendaries out of their areas, area rounds/pools, `raidPool` + backfill, `raid_unlocked` moment, candidates/pick/exclusions, `raid_today`, Pokédex rows | 1 |
| 5 | Raids: battle | orchestrator + tests + balance, `BattleView` raid mode, queues/plates/swaps, intro, catch, NPC pop-up, `raid_close` | 4 (and the Battle UI session's edits landed) |
| 6 | Raids: social | raid team, friends' teams, gifts + pop-up, leaderboard Raids tab | 5 |
| 7 | Polish & hand-over | juice pass, sounds, e2e/axe, `pnpm balance` numbers, full SQL hand-over (new migrations in `regionsPrelude`, the II delete file, `seed.sql` regenerated) | all |

**Hand-over (manual, for you)**:
1. Run the new migrations on Supabase.
2. Run the II-area delete file once.
3. Admin → Publish (or `seed.sql`) for the new content.
4. Deploy.

---

## 10. Decisions (taken 2026-10-10)
- **D1 · Legendary-only areas:** 1 round each, with a small wild pool from the region's late-game species (proposed by `scripts/raid-areas.ts`, tuned in admin). Clearing the round unlocks the raid.
- **D2 · Rebattle and regions:** only the **live region's** rebattle can be fought; the others show their progress and "Travel to … to fight".
- **D3 · A caught raid Pokémon** goes to its **home region's Box** (the region of its unlocking area), with a message telling the player where it went.
- **D4 · Raids leaderboard:** one global count, shown the same in every region's Raids tab.
- **D5 · Losing a rebattle:** the gauntlet restarts at the first trainer, the team is healed (like a wipe), the ₽ won is kept, nothing else changes.
- **D6 · Exclusions:** two admin lists in the Events config: `exclude.pseudo` (the pseudo-legendaries) and `exclude.extra` (Ultra Beasts, paradox Pokémon, Rotom), on top of `isLegendary` and the regions' starter lines.
