# The Underground: plan (for validation)

Status: **built** (2026-10-17), phases 1 to 4, on `ccr-a3f3bfa6-jmvzyg`. It ships **Off** (Admin → Live events → an
Underground event → the switch). What was built and where it differs from the plan: §10; setting it up: §11.

A new **live event type** (docs/20), inspired by the Sinnoh Underground of Diamond, Pearl and Platinum: players spend
**Explorakits** to dig 6×6 walls with a pickaxe die, before the wall collapses. Buried in them are **orbs** (three
colours, three sizes), **fossils** and **plates**. Plates now gate **Arceus's types**. Players team up by three, one
orb colour each; orbs sell for ₽ only in a full team.

---

## 0. Decisions (the user's answers, 2026-10-17)

| Topic | Decision |
|---|---|
| What it is | A **live event type** ("Underground"), beside Shiny Parade, Special Shop and Cash Flow: scheduled in the admin, one live event at a time |
| Admin numbers | **Everything that can be an admin parameter is one** (§2) |
| Explorakits | One kit = one wall. Sold in **every Poké Mart** while the event runs (a Special section), never in a small world's World Mart. **Free kits on a timer**: 3 every 24 h by default, **one at a time** (one every 8 h), **up to a cap** of 3 waiting. Bought kits don't count toward the cap |
| The wall | **6×6** by default. Each tile has **1, 2 or 3 layers**, unevenly spread. A **number of strikes** before it collapses, shown by a stylised crack gauge like the games' |
| A strike | **Tap a tile, the pickaxe die rolls**: that tile loses the roll's layers, its 4 neighbours lose the roll − 1 (a 1 touches only the tile). One strike = one step of the gauge |
| Buried things | **Shapes**, like the games: small orb 1×1, medium 2×1, large 2×2, fossil 2×2, plate 3×2. A thing is won only when **every tile of it** is dug out before the collapse |
| Orbs | **Red, Blue, Green**; **small, medium, large** |
| Fossils | **Every fossil of the regions the player has opened**. One found goes to the **Box, reviving**, as a fossil find does today (`addFossil`) |
| Plates | **Unique finds**: once a plate is found, it is never buried again for that player. The 17 plates (Fairy's Pixie Plate included) |
| Arceus | **Its type changes are locked until the player holds the plate.** Without plates, the player's Arceus stays Normal; the TYPE menu shows the others locked. **Foe Arceus are untouched** (bosses, trainers). Players who already have an Arceus **get nothing**: the lock applies to everyone |
| Teams | **3 players, friends only, by invite.** Each digs **their own walls, asynchronously**. Each player is **dealt a colour at random** on joining; every orb of that colour, found by anyone in the team, goes to that player |
| Before a full team | **Orbs are kept**, and sell once the team has 3. Solo, a player keeps every colour; in a team of 2, the free colour stays with whoever digs it |
| Selling | Orbs sell for **₽, a price per colour and size** (admin), in the ₽ of the region being played. **Only in a team of 3** |
| Pickaxe | Its die starts at **five 1s and a 2**; **8 upgrades for ₽**, each raising one face by 1, up to **three 2s and three 3s**. **Per event**: back to level 0 at the next one |
| When the event ends | **Unused kits and unsold orbs are lost; the team breaks up.** Plates and revived fossils stay for good |
| Leaving a wall | **Allowed: the wall is saved** and resumes where it was. Its kit was spent when it opened |

Assumed while planning (say if not):

- **The main save only.** Not in Extreme mode (a solo challenge, like Trades), and not from inside a small world: there
  the Underground's square and page say to go back home first. A world's Box never receives a fossil.
- **Signed out**, a player can dig solo (kits, walls, plates, fossils, orbs kept); teams and selling need sign-in.
- **Silvally's Memories and Ogerpon's masks stay as they are**: only Arceus is plate-locked.
- **A wall ends early when everything in it is dug out** (as in the games), with the strikes left unused.

---

## 1. The rules (all in `src/engine/underground.ts`, pure)

### 1.1 Kits

- `kits.free` refills one at a time, every `freePeriodHours / freeAmount` hours (24 / 3 = 8 h), up to `freeCap`. The
  clock is the server's (`serverNow`, as the wheel and raids use). A player's first visit to the event starts them
  at the cap.
- `kits.bought` comes from the Mart's Special section at `kitPrice` ₽, up to `kitLimit` per player per event (empty
  = no limit). Opening a wall spends a free kit first, then a bought one.
- Both counters belong to the event's id: a new event id starts from zero (free kits at the cap).

### 1.2 Dealing a wall: `dealWall(cfg, save, data, rng)`

1. **Layers**: each tile gets 1, 2 or 3 by the admin's shares (default 30 / 40 / 30 %).
2. **How many things**: between `itemsMin` and `itemsMax` (2–4).
3. **Each thing** is drawn by weight from the loot table (§2.3), then placed by shape where it fits without
   overlapping (a few tries; a thing that can't fit is redrawn as a small orb).
   - **An orb**: its size is the row drawn, its colour by the colour odds.
   - **A fossil**: one of the fossil items whose species belongs to a region the player has opened
     (`unlockedRegions`, `regionOfSpecies`).
   - **A plate**: one the player doesn't hold and that isn't already in this wall. With all 17, the plate weight
     goes to orbs.
4. The wall, its layers, its things and its strikes used are saved (`underground.wall`), so it resumes after a reload
   or a "leave for now".

### 1.3 A strike: `strike(wall, tile, roll, cfg)`

- The tile loses `roll` layers, each of its 4 neighbours loses `roll − neighbourLoss` (default 1), never below 0.
- One strike used. The pickaxe die is the player's level's six faces (§2.4); the roll uses the game's `Rng`.
- `wallState(wall)`: `digging`, `cleared` (every thing fully dug out) or `collapsed` (no strikes left and something
  still buried). A thing counts only if all its tiles are at 0.

### 1.4 The haul: `wallHaul(wall, team)` then `applyHaul(save, haul, data, now)`

- **A plate** joins `save.plates` (for good). Arceus can take its type from then on.
- **A fossil** goes to the Box through `addFossil`, reviving after its hours, as a fossil find does.
- **An orb of my colour, or of a colour nobody in my team holds** → my orb bag. **An orb of a teammate's colour** →
  sent to them (§3), shown as "Sent to Dawn".
- Things not fully dug out are lost ("Lost in the rubble").
- The haul is applied once (keyed by the wall's id).

### 1.5 Pickaxe, selling, the end

- `pickaxeUpgrade(save, cfg)`: pays the next level's price in ₽, level + 1, at most the table's last level.
- `sellOrbs(save, cfg, teamFull)`: refused unless the team is full (the server says so, §3); pays each orb's price
  into the live region's ₽, empties the bag. Cash Flow can't stack with it (one live event at a time).
- `settleUnderground(save, live)`: when the save's event id is no longer the live Underground, kits, the orb bag,
  the pickaxe and any open wall go. Plates stay.

### 1.6 Arceus and the plates

- `battle.ts`'s `typeForms` filters the **player's** choices by the plates held: `CreateBattleOptions.plates`, carried
  by the player's battlers. The foe's side has no filter, so a foe Arceus still picks any type (`bestTypeForms`).
- `PokemonSheet`'s list of Arceus's forms shows the locked ones with their plate's name.
- One plate per type (`PLATES` in the engine: Flame → Fire, Splash → Water, Meadow → Grass, Zap → Electric,
  Icicle → Ice, Fist → Fighting, Toxic → Poison, Earth → Ground, Sky → Flying, Mind → Psychic, Insect → Bug,
  Stone → Rock, Spooky → Ghost, Draco → Dragon, Dread → Dark, Iron → Steel, Pixie → Fairy). The plates are not
  items: they can't be sold, given or bought.

---

## 2. The admin's numbers (game_config row `underground`)

The live event's own row (in `liveEvents.list`, type `'underground'`) holds what every live event has: dates, banner,
title, badges to see it. The Underground's rules live in their own row, so every Underground event uses them and the
server can read them.

```ts
interface UndergroundConfig {
  access: EventAccess                      // Off / On for admin / On for everyone; off by default (docs/15 §20)
  kits: { price: number; limit: number | null; freeAmount: number; freePeriodHours: number; freeCap: number }
  wall: {
    cols: number; rows: number             // 6 × 6
    strikes: number                        // 15
    layers: [number, number, number]       // shares of 1, 2, 3 layers: 30, 40, 30
    itemsMin: number; itemsMax: number     // 2, 4
    neighbourLoss: number                  // 1: neighbours take roll − 1
  }
  loot: {
    weights: { orbS: number; orbM: number; orbL: number; fossil: number; plate: number }   // 40, 25, 10, 8, 3
    colours: { red: number; blue: number; green: number }                                   // 34, 33, 33
  }
  prices: Record<'red' | 'blue' | 'green', { s: number; m: number; l: number }>              // 100, 300, 800
  pickaxe: { faces: number[]; price: number }[]   // level 0..8, see 2.4
  team: { size: number; sellNeedsFull: boolean }  // 3, true
}
```

### 2.4 The pickaxe (defaults, every face and price editable, levels can be added or removed)

| Level | Die faces | Price (₽) |
|---|---|---|
| 0 | 1 1 1 1 1 2 | start |
| 1 | 1 1 1 1 2 2 | 500 |
| 2 | 1 1 1 2 2 2 | 1,000 |
| 3 | 1 1 2 2 2 2 | 1,500 |
| 4 | 1 2 2 2 2 2 | 2,500 |
| 5 | 2 2 2 2 2 2 | 4,000 |
| 6 | 2 2 2 2 2 3 | 6,000 |
| 7 | 2 2 2 2 3 3 | 8,000 |
| 8 | 2 2 2 3 3 3 | 10,000 |

Prices, the kit price (₽1,000), the 15 strikes and the orb prices are starting values for a balance pass: a
simulation in `tests/underground.test.ts` reports what a wall yields on average at each pickaxe level, so the admin
can tune them knowing what a kit is worth.

### 2.5 Admin screen

Admin → Events → Live events: the type list gains **Underground**. Its editor shows the usual dates, banner, title
and badges, then an **Underground settings** box (`src/admin/sections/UndergroundBox.tsx`) over the `underground` row:
the switch, kits, the wall, the loot weights and colour odds, the orb prices, the pickaxe table and the team rules,
with problems listed (shares that don't make 100 are scaled, a shape larger than the wall is refused, a pickaxe face
below 1 is refused).

---

## 3. Server (one migration, `0061_underground.sql` or the next free number when built; `seed.sql` carries it)

A save is written only by its owner, so what crosses between players goes through a server inbox, like trades and raid
gifts: the server records it, the receiving game applies it to its own save and says so, once.

- `game_config` row `underground`, inserted if missing (the defaults of `engine/defaults.ts`, kept equal by a test).
- `ug_open()`: the switch (`is_admin()` for On for admin) and a running Underground live event, on the server's clock.
  Every function below refuses when it says no.
- **Teams**: `ug_teams` (one per creator per event), `ug_members` (team, player, colour, one team per player per event),
  `ug_invites`. Functions: `ug_team()` (my team, my seats, my invitations), `ug_invite(friend)` (friends only:
  `friendships`), `ug_answer(invite, yes)` (joining deals a free colour at random; joining another team leaves the
  old one), `ug_leave()`.
- **Orbs between teammates**: `ug_orb_gifts` (from, to, colour, size, wall id, applied). `ug_send(wall_id, orbs)` routes
  each orb to the teammate holding its colour, at most `itemsMax` orbs per wall id and one call per wall id.
  `ug_inbox()` lists the orbs owed to me; `ug_applied(ids)` marks them applied.
- **Selling**: `ug_can_sell()` says whether my team is full; the game checks it before `sellOrbs`.
- **The end**: every function refuses once the event is over; rows of ended events are tidied by the next call.
  `delete_my_data` drops my seats, invitations and owed orbs.

What stays in the save, as for the rest of the game: kits, walls, the bag, the pickaxe, plates and fossils. The trust
is the same as for ₽ earned in battle; the server owns only what involves another player.

---

## 4. Save

```ts
underground?: {
  eventId: string
  freeKits: number; freeAt: number          // the next free kit's server time
  boughtKits: number; boughtCount: number   // held, and bought this event (the limit)
  pickaxe: number                           // level
  bag: Record<'red' | 'blue' | 'green', { s: number; m: number; l: number }>
  wall: Wall | null                         // the open wall, saved after every strike
  hauls: string[]                           // wall ids applied (last 50)
  seen: boolean                             // the rules pop-up
}
plates?: PokeType[]                         // for good, outside the event block
```

`settleUnderground` on load and when the live event changes (§1.5).

---

## 5. What players see (docs/15 gets a section for it, §30)

1. **Home**: the live event's square, the Underground variant: the cave picture drawn in code, LIVE, kits held and the
   next free kit, the time left as a draining gauge. Tap: the Underground page. A KITS tag on the Mart tab while kits
   are on sale.
2. **The rules pop-up** (`RulesModal`, once per event, again from INFO): kits, the wall, orbs and teams, plates and
   fossils, with the config's numbers; Later / Let's dig!
3. **The Underground page** (`/events/underground`): kits (free / bought, the refill gauge, BUY KITS, the red DIG A
   WALL, or RESUME WALL when one is open); the pickaxe (level of 8, its die, the next level's die, the price); the team
   (three seats, colours, Manage); the orb bag (colour × size, its worth, SELL locked with the reason until the team is
   full); the 17 plates; the fossils dug up; INFO.
4. **The dig** (full screen): the crack gauge (one section per strike, cracking from the right, red and shaking in its
   last 3), the wall (each tile a button with its depth in dots as well as colour, and its row, column and layers
   for screen readers), what's buried (found or still buried), the roll with the die's six faces. At the end: the
   wall collapsed / everything dug out, then the haul.
5. **The haul**: each thing with where it went (orb bag, Sent to Dawn, the Box reviving, plate NEW with the type
   Arceus can now take), what was lost, DONE / NEXT WALL.
6. **The team sheet**: seats and colours, invitations to answer, friends to invite (not in a team, invited, in a full
   team), leave the team.
7. **The Poké Mart**: the Explorakit in the live Special section (price, quantity, what's left of the limit, timer).
8. **Arceus's TYPE menu**: the types whose plate is held, the others locked with their plate's name and a line on
   where plates come from.

Effects on the pixel engine (`src/fx/timelines/underground.ts`) at the three motion levels: a strike (the pickaxe
swings, dust, the tile cracks; short: the tile flashes), a thing fully dug out (a glint), the collapse (the wall
shakes and falls in steps; short: one shake; off: the end state). Sounds synthesised: the clink of a strike, a lower
one for a 3, the rumble of the collapse.

Every new component on `/kitchen-sink` in every state. Strings `ui.underground.*` in the ten languages, the plate
names too; `pnpm i18n:fonts` after the CJK columns.

---

## 6. Tests

- **Unit** (`tests/underground.test.ts`): free kits refill one at a time, the cap, a new event id; buying to the
  limit; `dealWall` (no overlaps, inside the wall, counts, layer shares over many walls, owned plates and all-17,
  fossils only from opened regions); `strike` (roll and neighbours, edges, never below 0); cleared / collapsed;
  the haul by team (solo, two, three; an orb with no owner); selling refused without a full team; pickaxe levels and
  prices; the end of the event (kits, bag, pickaxe, wall gone, plates kept); the yield simulation per pickaxe level.
- **Battle**: a player's Arceus without plates gets no type choice; with Flame and Iron, those two only; a foe Arceus
  still changes freely.
- **SQL** (`tests/underground-sql.test.ts`): the migration's defaults equal `engine/defaults.ts`.
- **E2E** (`e2e/underground.spec.ts`, mocked server clock and a seeded wall): the square, the pop-up once, a dig to a
  haul, resume after a reload, the Mart row, Arceus's locked menu; the layout checks at 360 px.

---

## 7. Phases (after validation)

1. **Engine, config, save, admin, the Arceus lock**, with their tests.
2. **Solo play**: the square, the rules, the page, the dig with its effects and sounds, the haul, the Mart row, the
   locked TYPE menu; strings; kitchen sink; docs/15 §30.
3. **Teams**: the migration, the team sheet, orbs between teammates, selling.
4. Balance pass on the yield simulation; the admin tunes the numbers.

---

## 8. References

The Underground of Diamond, Pearl and Platinum and the Grand Underground of Brilliant Diamond and Shining Pearl:
[Bulbapedia: The Underground](https://bulbapedia.bulbagarden.net/wiki/Underground),
[Bulbapedia: Grand Underground](https://m.bulbapedia.bulbagarden.net/wiki/Grand_Underground),
[Bulbapedia: Mining](https://bulbapedia.bulbagarden.net/wiki/Mining),
[Fandom: Underground](https://pokemon.fandom.com/wiki/Underground). Taken from them: the cleft meter that cracks
across the top, the three rock depths, treasures as shapes that count only once fully uncovered, the spheres' colours
and sizes, the plates.

## 9. Mockups

The design canvas: https://claude.ai/artifact/15u6vZUEW93yT7rsXLYLjV. Home's square, the rules pop-up, the
Underground page, a playable wall (its Tweaks set the pickaxe level and the strikes), the haul, the team sheet, the
Mart, Arceus's TYPE menu and the admin.

## 10. Built

- **Engine** `src/engine/underground.ts` (pure): kits (`refillKits`, `buyKits`, `openWall`), `dealWall` /
  `dealWallWith`, `strikeWall` / `strike`, `wallStatus`, the haul (`wallHaul`, `applyHaul`, the save's outbox,
  `receiveOrbs`, `clearOutbox`), the pickaxe (`pickaxeLevels`, `nextPickaxe`, `upgradePickaxe`), selling (`canSell`,
  `sellOrbs`), `settleUnderground`, the rules seen, `plateTypes`, and the yield simulation (`plainStrikeTile`,
  `wallYield`). Arceus: `CreateBattleOptions.plates`, `formChoices` filtered, `lockedTypeForms` (`battle.ts`).
- **Config** `game_config.underground` (`UndergroundConfig`, `DEFAULT_CONFIG.underground`); the live event type
  `'underground'` (`LIVE_TYPES`). **Save** `underground` (the event's block) and `plates`.
- **Admin** `src/admin/sections/UndergroundBox.tsx`, under an Underground live event: the switch and every number,
  with the yield table per pickaxe level.
- **Game** `src/store/underground.ts` (the save's actions, the settle loop in `GameLayout`), `src/store/ugTeams.ts`
  (teams, the orbs both ways, selling confirmed by the server); screens `src/screens/events/Underground.tsx` (the page,
  `/underground`), `UndergroundDig.tsx` (`/underground/dig`), `UndergroundTeam.tsx` (seats and the team sheet); pieces
  `src/components/Underground.tsx`, `src/styles/underground.css`; Home's live square, the rules pop-up, the Mart's
  section, KITS on the shop tab, the push line, the TYPE menu and Arceus's sheet. Docs/15 §30; the kitchen sink.
- **Server** `supabase/migrations/0061_underground.sql`, inlined into `supabase/seed.sql`.
- **Tests** `tests/engine/underground.test.ts` (29), `tests/underground-sql.test.ts` (9, PGlite),
  `e2e/underground.spec.ts` (5).

Differences from the plan:

- **Kit limit**: 0 means no limit (a null is lost when the admin's row is merged over the defaults).
- **The plate lock follows the Underground's switch**: Off, Arceus changes type as before (docs/15 §20: a feature
  switched off is nowhere in the game). On, the lock applies to everyone, whether an event is running or not.
- **Orbs owed to teammates wait in the save** (`underground.outbox`) until the server takes them, and orbs received
  are kept by id (`underground.received`), so a reload never loses or doubles any.
- **Versus is untouched**: its battles are replayed by both players from a seed, so neither side's Arceus is locked
  there.
- **Opening `/underground` before the event's content has arrived** shows "isn't open right now" rather than sending
  the player Home; the page fills in once the event is known.

### The yield, with the defaults (2,000 walls per level, `wallYield`)

| Pickaxe | Things dug out (of ~3) | ₽ in orbs | Fossils | Plates | Walls cleared |
|---|---|---|---|---|---|
| Lv.0 | 1.0 | 274 | 0.17 | 0.05 | 5 % |
| Lv.3 | 2.1 | 526 | 0.25 | 0.11 | 35 % |
| Lv.5 | 2.7 | 651 | 0.27 | 0.11 | 72 % |
| Lv.8 | 2.9 | 671 | 0.30 | 0.11 | 90 % |

With the defaults a bought kit (₽1,000) never pays for itself in orbs: kits are bought for plates and fossils, and
there is no ₽ loop. A plate comes about once in 9 walls with a good pickaxe; at 3 free kits a day, a week's event
gives one or two. The admin sets the rate (the plate weight, the kit price, the strikes).

## 11. Setting it up

1. Run the migration on Supabase (SQL editor):
   https://github.com/Splifingald/pokedice/blob/ccr-a3f3bfa6-jmvzyg/supabase/migrations/0061_underground.sql
   (`supabase/seed.sql` carries it too, inlined: a database built from it needs nothing else).
2. Admin → Live events → New: type **Underground**, its dates (one live event at a time), its badges and picture
   (empty: the cave drawn in code). Under it, the Underground's settings: tune the numbers, then the switch **On for
   admin** to try it, **On for everyone** to open it. Save & Publish.
3. Teams need players signed in and friends with each other; signed out, players dig solo.
