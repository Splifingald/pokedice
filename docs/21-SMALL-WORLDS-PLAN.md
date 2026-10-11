# Small worlds: plan (for validation)

Status: **validated** (2026-10-11): questions → plan → Visual Lab mockups (`design/visual-lab/worlds.js`, Home tab,
"Small world" preview bar) → validation (§5, answered) → integration next. Branch `feature/events`.

Event type 5 in the special events framework (docs/18): **Small worlds**, priority 1 (first on Home). A small world is a
time-limited, themed region you build in the admin, where the **shiny mythicals** are won: a fresh start on one of its
three starters, its own areas, trainers, shop and rules, and at its end a legendary fight against a shiny mythical.

## 0. Decisions (your answers, 2026-10-11)

| Topic | Decision |
|---|---|
| Switch | **Off / On for admin / On for everyone**, Off by default (like every event type). |
| Start | **Fresh start**: pick one of the world's **3 starters** (set in admin) at Lv.5, the partner pick scene in the world's colours. |
| Keep | **Only the shiny mythical.** When the world closes, everything else in it is gone. |
| Money | **The world's own ₽**: from ₽0, earned and spent there only. |
| Boosters | Each booster type hits **× its multiplier on both sides** (yours and the foes'). Shown on the world's banner and in battle. |
| Dice | **No upgrades: dice and combos = the Pokémon's level ÷ 10**, rounded down (Lv.1–9 = 0, Lv.10–19 = 1, Lv.55 = 5, Lv.100 = 10). |
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
- **Day Care**: closed inside a world (no deposit from it); a world's ₽, bag and Box never leave it.

## 7. Integration phases (after validation)
1. Data and engine: region kind 'world', `smallWorlds` config and switch, area dates, dice by level, XP ×, boosters,
   the world's Mart, enter / leave / close, the mythical out at catch; save; admin editor; unit and SQL tests.
2. What players see: the square and pop-up, the partner pick, the themed Home, battle chips, the end; strings in 10
   languages; e2e and phone layout.
