# Small worlds: plan (for validation)

Status: **integrated** (2026-10-11): questions → plan → Visual Lab mockups (`design/visual-lab/worlds.js`, Home tab,
"Small world" preview bar) → validation (§5, answered) → integration (§8). Branch `feature/small-worlds` (from
`feature/version_2`). Phase 1 (engine, store, save, admin, tests) and phase 2 (what players see) are built; the UI's
rules are in docs/15 §22.

Event type 5 in the special events framework (docs/18): **Small worlds**, priority 1 (first on Home). A small world is a
time-limited, themed region you build in the admin, where the **shiny mythicals** are won: a fresh start on one of its
three starters, its own areas, trainers, shop and rules, and at its end a legendary fight against a shiny mythical.

## 0. Decisions (your answers, 2026-10-11)

| Topic | Decision |
|---|---|
| Switch | **Off / On for admin / On for everyone**, Off by default (like every event type). |
| Start | **Fresh start**: pick one of the world's **3 starters** (set in admin) at Lv.5, the partner pick scene in the world's colours. |
| Keep | **Only the shiny mythical.** When the world closes, everything else in it is gone. *Changed 2026-10-13 (docs/26 §1): its Pokémon now go home too, each to its species' region, locked until that region's best reaches its level; items and ₽ still close with it.* |
| Money | **The world's own ₽**: from ₽0, earned and spent there only. |
| Boosters | Each booster type hits **× its multiplier on both sides** (yours and the foes'). Shown on the world's banner and in battle. |
| Dice | **No upgrades: dice and combos = the Pokémon's level ÷ 10**, rounded down (Lv.1–9 = 0, Lv.10–19 = 1, Lv.55 = 5, Lv.100 = 10). *Changed 2026-10-13 (docs/26): a world has upgrade tracks of its own, from level 1, bought with its ₽; its foes use the area's enemy upgrade level. Dice by level is gone.* |
| XP | × a multiplier (default **×5**), every XP earned in the world. |
| Final fight | **Win, then catch** with the catch dice, like a legendary boss; missed, fight again, until the world closes. |
| Entry | From **N badges** (admin), every region's counted. |
| Time | The event's **end date** (UTC) is the only clock. |

## 1. How it works: a region of its own

The game already keeps each region apart: its own Box, team, bag, ₽, Pokédex page, upgrades and area progress
(`RegionSave`), parked while another region is played. **A small world is a region of a new kind** (`kind: 'world'`):

- **Entering** starts it (first time: the partner pick, then `startRegion`) or switches to it (`switchRegion`); the region
  you were playing is parked as it is. **Back to Kanto** (or wherever you were) switches back. Nothing crosses over
  except the shiny mythical.
- Its **₽, Box, bag and Pokédex** are the world's block: the world's own money falls out of how regions work.
- Its areas and trainers are made in the admin like any region's (Areas and Trainers sections, region = the world),
  with its own pictures, wild pools, trainers and bosses.
- It's never in the region chain: no league offers it, the Regions sheet shows it only while it runs.
- **When it closes**, its block is deleted. A player inside is sent back to their region with a pop-up ("The world has
  closed: thanks for playing"). The shiny mythical was already moved out when it was caught.

## 2. Its rules

- **Areas unlock** like a region's (clear the one before), and/or **from a date-time** (UTC) you set per area, to pace
  it ("Opens Sat 18 Oct, 18:00" on the locked card). With both, both are needed.
- **XP ×5** (admin number): battles and Multi EXP alike.
- **Dice by level** (both sides): a Pokémon's dice and combo levels are its level ÷ 10. The Upgrades tab says so instead
  of selling upgrades; the world's foes follow the same rule (they don't use the game's enemy upgrade level).
- **Booster types**: a list of types and multipliers (e.g. Fire ×1.5, Grass ×1.5). Every hit of those types is
  multiplied, for both sides; the battle readout shows the booster as a chip next to the damage (no hidden numbers).
- **Special shop**: the world's Mart sells only the admin's list (item, price in the world's ₽, limit per player or none).
- **Special trainers**: the world's own trainers (Trainers section), in its areas' trainer pools and as gyms if you want.
- **The final fight**: the last area holds the **shiny mythical** as its boss (its level set in admin). Win, then throw
  balls with the catch dice; a miss leaves it there to fight again. Caught, it leaves the world at once (see §5, Q2).

## 3. What players see

- **Home square** (priority 1, first among the events): the world's banner, its name, `ENDS IN 5d 3h` and a gauge, the
  mythical's silhouette (in colour, shiny, once caught), "Areas 3/8". Tap: enter the world (the first time, the pick).
- **The pop-up**, once when it opens for you: the banner, its rules in short (×5 XP, dice by level, Fire ×1.5, the shiny
  mythical at the end), the time left. **Enter** / Later.
- **Inside the world**: the game's Home in the world's **colours** (admin: a main colour, an accent and the ground tint,
  applied as the theme's variables), its banner under the top bar with the time left, its areas, the world's ₽ in the
  purse. **Back to Kanto** on Home. The other event squares, the Day Care and Versus belong to the main game and wait
  outside (§5, Q5).
- **Battle**: the booster chip on a boosted hit; each Pokémon's dice level shown as its level ÷ 10.
- **The end**: the countdown turns red in the last day; when it closes, the pop-up above.

## 4. Data and admin

```ts
interface SmallWorld {
  id: string                         // its region id too ('world-…')
  regionId: string                   // the world's region (kind 'world'): areas and trainers point at it
  start: string; end: string         // ISO, UTC
  title: Partial<Record<Lang, string>>
  banner: string                     // picture key
  theme: { main: string; accent: string; ground: string }   // colours
  minBadges: number
  starters: [number, number, number]
  xpMultiplier: number               // 5
  boosters: { type: PokeType; multiplier: number }[]
  shop: { key: string; price: number; limit: number | null }[]
  mythical: { dex: number; level: number; areaId: string }   // shiny, the last area's boss
}
// game_config `smallWorlds`: { access: 'off' | 'admin' | 'all'; list: SmallWorld[] }; one runs at a time.
// regions gain `kind?: 'world'`; areas gain `opensAt?: string` (UTC).
```
- **Admin → Small worlds**: the switch, the list (scheduled / live / ended) and the editor: dates, title, banner, the
  three colours with a live preview of the Home square, badges, starters, XP ×, boosters, shop rows, the mythical; links
  to its areas and trainers in their sections (filtered to the world). Checks: dates, the mythical's area in the world,
  three starters, overlaps with another world.

## 5. Settled at validation (2026-10-11)
1. **Pokédex**: world catches stay on the world's own Pokédex page and close with it.
2. **The mythical** is the only Pokémon that leaves the world: it goes to the Box of **its own region in the real
   games** (Mew → Kanto, Celebi → Johto, Victini → Unova…). Not locked to an area there. *My addition, to confirm:* if
   the player hasn't started that region yet, it waits (like a locked raid catch) and joins that region's Box the
   moment the region is started, with a toast.
3. **No event reaches inside a world**: no live event (Shiny Parade, Special Shop, Cash Flow), no Fortune Wheel, Raids
   or Elite Rebattle while playing it (their pages say to leave the world first).
4. **Energy**: the world's encounters cost energy as usual.
5. **Home inside the world**: only the world's things (its banner and countdown, areas, the mythical, its Mart, Back);
   the main game's squares wait outside.
6. **One world at a time**; it may run while a live event runs (which stays outside it).

## 6. Mockups (next step, Visual Lab)
1. Home with the Small world square first, and its pop-up.
2. The partner pick in the world's colours.
3. Home inside the world: themed, its banner and countdown, its areas (one locked until a date), Back to Kanto.
4. A battle with a booster chip and dice by level.
5. The world's Mart.
6. The final fight: the shiny mythical's entrance, the catch.
7. The world closing (the pop-up).
8. The admin editor.

## 6b. Technical design (from a survey of the engine, 2026-10-11)
- **A world is a region row** (Config → Regions: its name, a `dexRange` that overlaps no real region, e.g. `[0, 0]`,
  starter level 5) **named by a world in `smallWorlds.list`** (`regionId`). It is *not* `enabled: false`: the game moves
  a player out of a disabled region on every load. Instead `isWorldRegion(data, id)` keeps worlds out of everything a
  real region is part of: `enabledRegions` / `unlockedRegions` (switcher chips, the Areas sheet's "more to come"),
  `offeredRegion` and the league chain, `sendTargets`, `regionCases` (badges, the leaderboard gate, live events'
  badge count, donations), `reached()` (Mega / Gigantamax), `speciesAllowedIn` / `evolutionGate` (inside a world every
  generation may evolve), `regionOfSpecies`, the Pokédex totals of `speciesCaughtEverywhere` and `progressTotals`,
  `everyBox` (Versus) and `everyInstance` (raid teams). The server's leaderboard keeps only rows with badges, and a
  world has none.
- **Entering**: the first time, the partner pick (`PartnerMoment`) then `newRegionBlock(world region, starter)` +
  `startRegion`; later `switchRegion`. `events.worldFrom` remembers the region to go back to. **Leaving**:
  `switchRegion(worldFrom)`. **Closing** (its end, the switch turned off, or a later world): the block is dropped from
  `parked` (or the player is switched back first), with a pop-up.
- **Area dates**: `SmallWorld.opens: Record<areaId, ISO>`; the store's `enterArea` and the Areas list check them on the
  server's clock (`isAreaUnlocked` stays clock-free).
- **Dice by level**: battle creation passes per-Pokémon levels instead of the save's tracks when the live region is a
  world: `UpgradeLevels` gains `byLevel?: true`, and `computeDamage` reads `floor(level / 10)` for the attacker's dice
  and combos (foes too, ignoring the area's enemy upgrade level). The Upgrades tab says so.
- **XP ×**: `pokemonXp` × the world's `xpMultiplier` for a world area.
- **Boosters**: `UpgradeLevels.typeBoost` (both sides), applied in `computeDamage` after the type multiplier, kept out of
  `effectiveness`, and shown as its own line in the damage recap (`DamageResult.boost`).
- **The mythical**: the last area's boss, `BossDef.shiny` honoured for the world's mythical only (`legendShiny`); a catch
  goes to its home region (`regionOfSpecies`, real regions only) through an exported `addToRegion`, or waits in
  `events.worldPending` until that region is started.
- **No events inside**: `eventUnlocked`, `eventsTeaser`, `liveFor` and the raid / wheel / rebattle pages return nothing
  while the live region is a world.
- **Day Care**: closed inside a world (no deposit from it, and its Pokémon Centers don't heal the Day Care's
  residents); a world's ₽, bag and Box never leave it.

## 7. Integration phases (after validation)
1. Data and engine: region kind 'world', `smallWorlds` config and switch, area dates, dice by level, XP ×, boosters,
   the world's Mart, enter / leave / close, the mythical out at catch; save; admin editor; unit and SQL tests.
2. What players see: the square and pop-up, the partner pick, the themed Home, battle chips, the end; strings in 10
   languages; e2e and phone layout.

## 8. Integration (2026-10-11)

### 8a. Asked before building (answers)
| Question | Answer |
|---|---|
| Extreme mode (docs/22) | **Main save only**: the Extreme save never sees a world. |
| Authoring | **A small helper** in the Small worlds tab (make the world's region, add or copy areas into it, links to Areas). |
| Switching Off | **Off hides, keeps**: Off (or "On for admin" for a player) sends anyone inside back with their place kept; switched on again, they go back in. Only the end date (or End now) closes a world. |
| The mockups | **Kept** as they are, with start/end and area openings as UTC date-times (like Live events), the Home square on the Live square's frame, the booster as its own line in the damage recap. |

### 8b. Phase 1, built
- **Engine**
  - `engine/worldList.ts`: the admin's list (`smallWorlds`, normalised), `worldById`, `worldOfRegion`, `worldOfArea`,
    `isWorldMythical`; `newSmallWorld` (×5 XP, 3 badges).
  - `engine/worlds.ts`: `worldAt` / `worldFor` (running, switched on, main save, badges), `heldWorld` / `inWorld` /
    `currentWorld`, `enterWorld` (first time: `newRegionBlock` + `startRegion` on a partner; later `switchRegion`),
    `leaveWorld`, `worldOver` + `closeWorld`, the pop-ups (`worldPopupDue` / `markWorldSeen`, `worldByeDue` /
    `markWorldBye`), `areaOpensAt` / `areaOpenAt`, `worldBattleLevels`, `worldShopRows` / `buyWorldItem`,
    `catchWorldMythical`, `releaseWorldPending`, `mythicalHome`, the admin's `worldOverlap` / `worldProblems`.
  - Regions: `isWorldRegion`, `realRegions`, `worldRegionOf` (the save's own record, for what has no game data),
    `inWorldRegion`. Worlds are out of `enabledRegions` (so `unlockedRegions`, `regionCases`, the league chain),
    `offeredRegion`, `sendTargets` (empty inside a world), `regionOfSpecies`, `reached()` (Mega / Gigantamax),
    `speciesAllowedIn` (inside a world every generation may evolve), `rescueFromDisabledRegion` (skips worlds),
    `speciesCaughtEverywhere`, `progressTotals`, `everyBox` (Versus) and `everyInstance` (raid teams).
  - Dice by level: `UpgradeLevels.byLevel` + `attackerLevels(levels, level)` (`diceLevelOf` = level ÷ 10, capped at 10),
    used by the reducer for each attack, the foes' reroll AI, the potion check and the battle's damage preview.
  - Boosters: `UpgradeLevels.typeBoost`; `computeDamage` multiplies after the type's multiplier, keeps it out of
    `effectiveness`, and says so in `DamageResult.boost`.
  - XP: `pokemonXp` × the world's `xpMultiplier` in its areas.
  - The mythical: compiled into its area's bosses (`compileGameData`, always shiny); `legendShiny` lets that one boss be
    shiny. A catch goes to its home region's Box through raid.ts's now exported `addToRegion`, or waits in
    `events.worldPending` (joins at `settle` once the region is started, with a toast); the world's Pokédex notes it, so
    its lair closes and it stops coming back. New run event `world_mythical`.
  - No events inside: `eventUnlocked`, `eventsTeaser`, `liveFor` give nothing while a world is played; the Day Care
    (deposit, pick-up, hatching), the usual Mart and upgrades refuse; a pending wheel prize and friends' raid gifts wait
    until the player is out.
- **Store**: `store/worlds.ts` (`enterSmallWorld`, `leaveSmallWorld`, `buyWorld`, the pop-ups' marks, `worldName`,
  `useWorld`) and the world's clock (`startWorldClock`, from `startBackgroundServices`): an ended world closes, a hidden
  one sends the player out; never mid-fight, only on the server's time and with content known to be the latest
  (`contentChecked`, set by the version check). `store/run.ts`: the world's levels in `startBattle`, the area's date in
  `enterArea`, the mythical in `throwBall`.
- **Save**: `events.world` (`id`, `regionId`, `from`, `partner`, `caught`, `bought`, `closed`), `events.worldSeen`,
  `events.worldBye`, `events.worldPending` (zod schema).
- **Admin → Events → Small worlds** (`admin/sections/events/SmallWorldsTab.tsx`): the switch (also on General), the list
  (scheduled / live / ended, Edit, End now, Delete) and the editor as a draft: title (10 languages), picture, UTC dates,
  badges, XP ×, the three colours with a preview of the Home square, the region and its areas (each area's opening
  date, "Edit in Areas"), the three partners, the mythical (Pokémon, level, area), boosters, the Mart's rows. Applied
  only without problems (dates, overlap, region, three partners, the mythical's area in the world…).
- **Admin → Areas**: a Region field per area, a region filter, `?area=` links.
- **Tests**: `tests/engine/small-worlds.test.ts` (30), `e2e/admin-events.spec.ts` (the Small worlds tab).

### 8b'. Phase 2, built
- **Outside** (`screens/events/world.tsx`, the lab in `worldPick.tsx`, `styles/world.css`): Home's square
  (`WorldSquare`, first of the event squares, on the Live square's frame), the pop-up (`WorldPopup`, once, after the
  tutorials and other pop-ups, before the live event's; the live event's waits for it), the partner pick (`WorldPick`:
  `PartnerMoment` with the world's `theme`), the closing pop-up (`WorldByePopup`). All three mounted once in
  `GameLayout`.
- **Inside**: the world's colours (`worldVars`, `.in-world` on the layout), the strip on Home (`WorldStrip`: name, time
  left, Back to Kanto), Home's two squares (`WorldWidgets`: the mythical, the World Mart) in place of every other, no
  region offer or switcher, "Opens {date}" on an area waiting for its date (`home/areas.ts`; CONTINUE's GO TO waits
  for it too), the World Mart (`Shop.tsx`, `WorldShop`), Upgrades' explanation (`Upgrades.tsx`, `WorldUpgrades`), and
  the main game's pages (the events, the Day Care, Versus) saying why they wait (`WorldAwayPage`). The upgrades dot
  stays dark inside.
- **Battle**: the dice level on each plate (`DiceLevelTag`), the booster chip (`BoosterChip`) in the readout and as its
  own factor in the damage recap, the mythical's line on the result card (`WorldMythicalCard`, run event
  `world_mythical`).
- **Strings**: 48 more `ui.world.*` keys (55 in all) in the ten languages. **Kitchen sink**: `WorldBits` (every state of each piece).
- **Tests**: `tests/world-clock.test.ts` (the store's clock: closing, Off, mid-fight), `e2e/worlds.spec.ts` (the
  pop-up, the pick, Home inside, its Mart, Upgrades and an event's page, Back; a battle with the dice levels and a
  booster, an area waiting for its date; the final fight and the catch going to the Kanto Box; the closing; a
  360×640 phone outside and inside).

### 8c. Where it differs from the plan
- **No Config → Regions editor exists** in the admin: the Small worlds tab makes the world's region row itself (id
  `world-<name>`, `dexRange` `[99999, 99999]` — the admin's checks want numbers ≥ 1 and it's past every species and
  form —, partners at Lv.5, `enabled: false`). The world opens it whatever `enabled` says (and the rescue skips
  worlds), so `enabled: false` only keeps a region whose world was deleted out of sight.
- **No `kind: 'world'` column**: being named by a world of the list is what makes a region a world (no migration).
- **Area dates** live in the world (`SmallWorld.opens`), not on the areas table.
- **The mythical is set in the world**, not in Areas → Bosses: one place for it, compiled into its area.
- **Dice level 0 and 1 are both the base track** (the upgrades' own scale: 1 is the start, 10 the last).
- **Closing pop-up**: for whoever played the world, or saw its opening pop-up and never went in.
- **One world per region in the list**: a new edition gets its own region (copy the areas in), or the old world is
  deleted first.
- **Its Mart's prices** are never below the usual buy-back (as the Special Shop's), so buying to sell can't pay.
- **No SQL**: the `smallWorlds` game_config row is written by Publish. The server's leaderboard keeps only rows with
  badges: don't give a world's gym trainers a badge.
- **The strip is Home's**, not under the top bar on every page: the other pages inside are the world's own (the World
  Mart, Upgrades) or say to leave it first, each with the way back. The CTA stays red and the money gold: the world's
  colours tint its own pieces and the page's ground only.
- **Booted inside a world before the content is in** (the game starts on its own bundle, which never holds the admin's
  worlds), Home shows the strip and "The world is on its way" until the content arrives (`WorldWaiting`).
- **A world's partners against its wild Pokémon**: a type that can't touch them (Gastly against Normal types) is a
  stalemate in the world as anywhere; the admin's pools and partners decide it.
