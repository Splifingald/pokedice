# 71 — Short events: Hatching Day, Type Rush, Community Boss

Status: **plan validated** by the user (2026-11-11), built one by one on `claude/great-cannon-5792yi` (from
`version/2_9_7`): **all three built**, Hatching Day (§2.4), Type Rush (§3.8) and the Community Boss (§4.6), each on
as soon as it's scheduled (no switch, §1).

The user's ask (2026-11-11): ideas for short events of 2 to 4 days; then three picks, refined with the built-in
questions the same day. All three are **live events** (docs/20): three new types beside the Shiny Parade, the Special
Shop, Cash Flow, the Underground and the gift calendar. So they get, without new work, the admin's dates (or a
repeat), the badge minimum, the Home square with its timer, the start pop-up, the calendar view and the `#🎉-events`
posts on Discord (docs/50).

## 0. Decisions (the user's answers, 2026-11-11)

| Topic | Decision |
|---|---|
| Switches | **None** for the three (the user, 2026-11-11): the admin schedules one or doesn't. |
| **Hatching Day** | Like Cash Flow or the Shiny Parade: while it runs, Day Care Eggs come **×3 faster** and are **×4 more often shiny** (both admin numbers, those by default). |
| Which Eggs are boosted | Eggs **cracked during it** (that's when the hatchling is rolled), even one laid before. |
| Flame Body | **Multiplies**: Flame Body's ×2 and the event's ×3 make ×6. |
| Its banner | A Gemini picture (prompt in §6.1). |
| **Type Rush** | The admin picks a type. That type **hits +20 % harder** (admin, 20 % by default), and players get **quests about that type**, each with a counter; quests pay **Rush points** that fill a **reward gauge**. |
| Who is boosted | **The player's Pokémon only** (foes of that type hit as usual). |
| Where the boost counts | **Adventure fights** (wild, trainers, gyms, secret areas), **raids**, **Versus against the AI** (and Area Versus). **Not** Friend Battles (two real players, two sets of rules). Not Extreme mode or small worlds (no live event reaches them). |
| Quest kinds | **Catch**, **K.O.**, **evolve** (the ask), plus **deal damage**, **hatch Eggs**, **combos** and **raids won**. |
| Who writes the quests | **A default list** fills a new Type Rush (its type set by itself); the admin changes, adds or deletes. |
| Chained quests | "Catch 10" then "Catch 20": the second shows only once the first is done, and starts at 10/20 (one counter). |
| Claiming | **A red dot on the banner** when something is done. **Opening the banner validates** the done quests by itself: a green tick, the points fly into the gauge, then the rewards reached are given, with a small animation. No CLAIM button. |
| Done just before the end, banner never opened | **A last pop-up** the next time the player opens the game: the same validation and animation. Nothing done in time is lost. |
| Reward gauge | Set in the admin: **any item of the game, ₽, or a Pokémon** (level, shiny or not, **with its hidden talent or not**). |
| The pop-up | The gauge at the top, the quests below, **closest to completion first**. |
| Type and repeat | **The admin picks the type**; a weekly repeat can **rotate through a list of types**. **One Type Rush at a time.** |
| Its banner | **An area picture** the admin picks (as other live events), the type's icon drawn over it in code. |
| **Community Boss** | A huge boss that **never hits back**: a bag of HP in **several coloured HP gauges**. The community places Pokémon to hit it. Each gauge broken earns a reward, **sent at the end** of the event. Rewards can be Pokémon (shiny or not, talent or not). |
| How it's hit | Each player places **3 Pokémon**. They hit **one by one, every 3 seconds, in turn**. A hit = **its level × its type affinity**. |
| When it hits | **All the time**, from placing to the end, game closed or not: **the server counts** the hits from the time elapsed. |
| Type affinity | The Pokémon's **best type** against the boss's types, read on the **type chart** (×4, ×2, ×1, ×½, ×¼). An immunity counts **×¼**, not 0, so no Pokémon is useless. |
| The placed Pokémon | **Away, like the Day Care**: out of the team and the Box until the end, or until taken back (their damage so far kept). They can be swapped; the new one hits from then. |
| Who gets the rewards | **Every participant** (placed at least one Pokémon), whatever their share. |
| HP gauges | **The admin sets** how many and the HP of each (and each one's reward), helped by **an estimate** of how long each would take. |
| The boss page | Beyond the boss, its gauges and the player's 3 Pokémon hitting: **my damage** (and share), **top players**, **a live counter** (trainers taking part, damage in the last hour), **the rewards** on their gauges (earned ones ticked). |
| The boss view | **The big boss at the centre, about 20 Pokémon around it**, taking turns to step in and attack. Not every player's: **the player's own** next to them, then **their friends'** first, then others. |
| Its banner | **A full background** (an area picture the admin picks), **the boss's small menu icon** on top, not the animated fight sprite. |

## 1. What the three share

- **Three new live types**: `LIVE_TYPES` gains `'hatch'`, `'rush'` and `'boss'` (`src/engine/types.ts`); each one's
  settings live on the `LiveEvent` as the others' do (`hatch`, `rush`, `boss`), so changing the type in the admin keeps
  them. `newLiveEvent` gives each its defaults.
- **No switch of their own** (the user's call, 2026-11-11: "I chose to schedule them or not", an exception to docs/15
  §20): scheduling one in the admin is turning it on, and nothing runs while none is scheduled. The live events' own
  switch (`liveEvents.access`) still covers them all, as it covers Cash Flow and the Shiny Parade. So no
  `game_config` row and no server check for a switch: the Community Boss's server functions check that the event is
  scheduled and running instead.
- **Server time** (`event_time`), as every live event: changing the device's clock starts nothing early.
- **The engine decides every rule and number** (`src/engine/hatchingDay.ts`, `typeRush.ts`, `communityBoss.ts`, pure).
  The screens show the state; the server alone counts the boss's damage (§4.3).
- **Rules** (docs/15 §20): Hatching Day has no page, so its **start pop-up is its rules** (once per run, as Cash
  Flow's), and the Home square reopens it. Type Rush's view is its pop-up: **INFO at its foot**. The Community Boss
  has a page: **INFO at its foot**, opening the page sets its seen flag. All three get a row in How to play's
  **Game features**. Short rules: one sentence or two each, ≈ 80 characters.
- **Text** only in `src/i18n/strings.csv`, the ten languages filled. **Every new component on `/kitchen-sink`** in
  every state.
- **Discord** (docs/50): each new type gets its emoji and its one-line description in the weekly calendar and the
  start post (🥚 Hatching Day: "Eggs come 3× faster and are 4× more often shiny." · 🔥 Type Rush: "Fire Pokémon hit
  20 % harder, and Fire quests fill a reward gauge." · 👹 Community Boss: "Everyone hits Steelix together: break its
  gauges for rewards.").

## 2. Hatching Day

### 2.1 Rules

- **Faster Eggs**: every Day Care Egg clock (`breed`, `ditto`) runs **× `speed`** (3 by default) while the event runs:
  `stepMs` (`src/engine/breeding.ts`) divides its interval by Flame Body's ×2 *and* the event's ×3. Everything that
  reads it follows: `processDayCare`, `nextClock`, `nextCheckAt`, `nextCheckProgress` (Home's gauge to the next Egg).
  They take the live set, as `hatchChoices` already does.
- **At the start and the end**: the interval changes for the clock as it stands (it's read at each check), so a check
  that was 6 h away at the start comes 2 h after its last one instead. Missed checks still collapse into one Egg (one
  Egg waits at a time).
- **Shinier Eggs**: an Egg **cracked while it runs** rolls its shininess at `dayCare.shinyChance × shiny` (4 by
  default, capped at 100 %): `rollHatchling` / `crackEgg` take the live set. An Egg already cracked keeps what it rolled.
- **Egg now** (`rushEgg`) keeps its price: it buys the check early, as before.
- **Two at once** add their bonuses, as Cash Flow's do (×3 and ×3 make ×5).
- **Not** the side quests' gift Eggs (docs/61: they hatch after a set 6 h in the Box), not Extreme mode, not a small
  world (its Egg waits outside, as today).

### 2.2 What players see

- **The start pop-up** (once per run, in the one-time queue as a live event): the banner, big **×3** and **×4 ✦**,
  "Day Care Eggs come 3 times faster." / "Eggs that hatch are 4 times more often shiny.", the time left, **OK** and
  **Go to the Day Care**.
- **The Home square**: the banner, the title, the timer and its gauge; a tag `×3 🥚`. Tapping it reopens the pop-up.
- **At the Day Care**: a chip by the Egg's gauge, `×3 · ×4 ✦`, with the time left; the gauge runs visibly faster. The
  Home Day Care widget's countdown follows.
- **A shiny hatched** during the event: the hatch scene is the usual one (a shiny already has its own sparkle).

### 2.3 Admin

Admin → Events → Live events → Type **Hatching Day**: *Egg speed* (× 1 to 10, default 3), *Shiny odds* (× 1 to 20,
default 4), with the line "A pair makes an Egg about every 4 h instead of 12 h" from `breedHours`.

### 2.4 Built (2026-11-11)

- **Engine**: `LIVE_TYPES` has `'hatch'`; `LiveEvent.hatch` `{ speed, shiny }`; `hatchSpeed` / `hatchShiny`
  (`src/engine/liveEvents.ts`, two add up). `breeding.ts` divides each clock's interval by it (`stepMs`, after Flame
  Body's), so `processDayCare`, `nextClock`, `nextCheckAt`, `nextCheckProgress`, `clockDueAt` and `rushEgg` take the
  live set; `rollHatchling` / `crackEgg` multiply the Day Care's shiny odds (capped at 1). The next Egg's push notice
  reads the events running when it's planned (`eggNotice`). The admin can't save one at ×1 and ×1.
- **Store**: the callers pass `currentLive()`. The Day Care's timer is set for the next check; a Hatching Day starting
  or ending while the game is open changes when that is, so the once-a-minute background check re-runs the Day Care
  when the speed differs from the one the timer was set with (`followHatchingDay`).
- **Screens** (docs/15 §52): the live pop-up (×3, two rows, **Go to the Day Care**), Home's square, the chip on the
  Day Care card's yard, the strip on the Day Care page (it reopens the pop-up). The push notice opens `/daycare`.
- **Admin**: the type and its numbers (`src/admin/sections/HatchingDayBox.tsx`), its colour in the calendar; the
  picture in *Event pictures*. Built first with a switch, taken out the same day (§1): no migration.
- **Discord**: 🥚, its line and details, in English and French (`scripts/discord/live-event-post.ts`).
- **Different from the plan**: no row in How to play's *Game features*: like Cash Flow and the Shiny Parade, its
  numbers are each event's own, so its pop-up is its rules, reopened from Home's square and the Day Care strip.
- **The picture**: until the Gemini one (§6.1), `public/backgrounds/live-hatch.png` is a stand-in cropped from the Day
  Care yard (`public/area-art/daycare.png`). Replace the file itself: every Hatching Day picks it by default.
- **Tests**: `tests/engine/hatchingDay.test.ts`; `e2e/hatching-day.spec.ts` (its pictures in `docs/71-short-events/`);
  the admin's in `e2e/admin-events.spec.ts`; the kitchen sink's `HatchingDayBits`.

## 3. Type Rush

### 3.1 Data (on the live event)

```ts
type RushQuestKind = 'catch' | 'ko' | 'evolve' | 'damage' | 'hatch' | 'combo' | 'raid'

interface RushQuest {
  id: string                       // stable: the save's counters are kept by it
  kind: RushQuestKind
  combo?: ComboKey | 'any'         // a combo quest: which combo counts
  steps: { target: number; points: number }[]   // 10 → 20 → 50, each paying its points
}

rush: {
  type: PokeType
  rotate: PokeType[]               // a weekly repeat: run n takes rotate[n % length]; empty = always `type`
  boost: number                    // × the player's attacks of the type (1.2 = +20 %)
  quests: RushQuest[]
  gauge: { at: number; reward: CalendarReward }[]   // a reward at so many Rush points
}
```

`CalendarReward`'s Pokémon gains `talent?: boolean` (§5), so the gauge holds any item, ₽ or a Pokémon (level, shiny,
outfit, talent).

### 3.2 The default list (a new Type Rush starts with it)

| Quest | Steps (points) |
|---|---|
| Catch {type} Pokémon | 5 (10) → 10 (15) → 20 (25) |
| K.O. foes with {type} Pokémon | 10 (10) → 25 (15) → 50 (25) |
| Evolve {type} Pokémon | 1 (10) → 3 (15) → 5 (25) |
| Deal damage with {type} Pokémon | 2,000 (10) → 5,000 (15) → 10,000 (25) |
| Hatch {type} Pokémon | 1 (15) → 3 (25) |
| Land combos with {type} Pokémon | any combo: 5 (10) → 15 (15) → 30 (25) |
| Win raids with a {type} Pokémon on the team | 1 (15) → 3 (25) |

All seven quests pay **330 points**. The default gauge: **50** 10 Poké Balls · **100** 3 Rare Candies · **175** ₽5,000 ·
**250** 5 Ultra Balls · **300** a Pokémon of the type, Lv.30, with its hidden talent (the admin picks which; the default
list leaves that row for them to fill, and the admin's check asks for it). The last reward sits below the total, so a
player can miss a step or two and still reach it. The admin changes everything.

### 3.3 What counts (the engine's `rushFacts`)

A Pokémon **is of the type** when either of its types is. Counted only **while the run is live** (the server's
clock), in the fights where the boost counts (§0), plus the Day Care:

- **catch**: a Pokémon of the type caught (a wild one, a trainer fight's catch, a raid's, the Safari's). Not a gift,
  a hatch or a trade.
- **ko**: a foe K.O.'d by a hit of one of the player's Pokémon of the type.
- **evolve**: a Pokémon evolves, the type being the one before *or* after (Eevee → Vaporeon counts for Water and
  Normal).
- **damage**: the damage dealt by the player's Pokémon of the type (the hit as dealt, after the boost).
- **hatch**: a hatchling of the type.
- **combo**: a combo landed by one of the player's Pokémon of the type (the quest's combo, or any).
- **raid**: a raid won (its Pokémon caught) with a Pokémon of the type on the raid team.

The store reports the facts from what it already handles (the battle log's hits and K.O.s, the catch, the evolution,
the hatch, the raid's end); `countRush(save, run, facts)` adds them to the save. No fight's outcome changes but the
boost's.

### 3.4 The boost

The player's side gets `rush: { type, multiplier }` on its `UpgradeLevels` (`src/engine/damage.ts`), multiplied in
after the type's multiplier as a small world's booster and the weather are, and **shown in the damage recap** as its
own line ("Type Rush ×1.2"). Never on the foe's side. Not in Friend Battles (`friendBattle.ts` builds its own levels).

### 3.5 The save

`save.events.rush[runId] = { counts, done, points, given }`: each quest's counter, the steps validated per quest, the
points banked, the gauge rewards given. Synced with the cloud as the rest of the save (as the calendar's doors).

### 3.6 What players see

- **The Home square**: the banner (the admin's area picture) with **the type's icon and colour** drawn over it, the
  title ("Fire Rush"), the timer, a tag `+20 % 🔥`, and **a red dot** when a step is done and not validated, or a
  reward is reached and not given.
- **The start**: the Type Rush pop-up itself opens in the one-time queue, once per run (its first opening validates
  nothing yet: counts start at 0).
- **The pop-up** (tap the square):
  1. **The reward gauge** at the top: a bar of Rush points, the rewards as tiles along it (a Pokémon by its menu icon,
     ✦ for shiny, a talent mark), those given ticked.
  2. **The quests** below, each card showing its current step: "Catch Fire Pokémon · 7 / 10 · +10 pts". **Closest to
     completion first** (count ÷ target). A chain shows **one step at a time**; when it's done, the next replaces it,
     counter kept (10 / 20). A chain finished for good sinks to the bottom, greyed, "Done".
  3. **INFO** at the foot.
- **Opening it with something done** plays, in order: each done step ticks **green**, its points fly up into the
  gauge, the gauge fills; each reward reached pops out of its tile (a small reveal, as the calendar's door) and lands
  ("Added to your Bag", "Charmander joined your Box"); the card slides to its next step. A tap skips the animation.
  The rewards land where the developer's gifts do (`placeGifts`: the region being played).
- **After the end**: the next time the player opens the game, if a step was done in time and not validated, a last
  pop-up **"Fire Rush is over"** runs the same validation (place in the queue: right after the live events').
  Ended runs are kept 30 days in the save for that, then dropped.
- **In fights**: a small `🔥 +20 %` chip on the player's side of the battle header while it runs.

### 3.7 Admin

Type **Type Rush**: the type (18 chips), *Rotate each week* (types in order, shown on a repeating event), the boost
(%, default 20), the quest list (add a kind, its steps and points, reorder, delete; "Reset to the default list"), the
gauge (a row per reward: points, then the reward picker the calendar uses, with the new talent box). A check refuses
**two Type Rushes overlapping** (`liveProblems`), a gauge whose last reward is beyond the points the quests can pay,
and an empty quest list.

### 3.8 Built (2026-11-11)

- **Engine** (`src/engine/typeRush.ts`): the defaults (`defaultRushQuests`, `defaultRushGauge` with a Pokémon of each
  type, `RUSH_TYPE_MON`), `normaliseRush`, `rushType` (a rotation: the run's week since 1970, so every weekly run
  moves one step), `rushBoost` / `withRush`, `countRush` (facts, only while it runs), `rushCards` (one step at a time,
  closest to done first, finished last), `rushPending` (the red dot), `validateRush` (steps, points, then rewards
  through `placeGifts`), `rushToSettle` (the last pop-up), `rushFightFacts` (a fight's or a raid's log), and
  `rushProblems`. `liveEvents.ts`: the type, its defaults, one at a time (`liveOverlap`), its picture.
- **The boost** is on **the hit's type** (`UpgradeLevels.rush`, `computeDamage`, after the type's multiplier, as the
  weather's), on the player's side only: adventure fights (`startBattle`), raids (the player's own side, not a
  friend's or an NPC's: `RaidState.rush`), Versus and the League (`VersusSides.rush`). Friend Battles never get it.
  The recap shows it as its own chip (`RushBoostChip`).
- **What counts** (`src/store/typeRush.ts`): a fight's hits, combos and K.O.s are held and counted once when it ends
  (one save write a fight, not one a hit); catches (the throw, a raid's), evolutions (after a win, a stone, a Rare
  Candy, at the level cap), hatches and raids won are counted with the commit they come with. **Not counted**: the
  Safari's catches (its own engine, docs/61 §4) and trade evolutions.
- **The save**: `events.rush[runId]` (`RushProgress`), in the save's schema (`src/save/schema.ts`) so it syncs; kept
  30 days after the end.
- **Screens** (docs/15 §53): Home's card (its type's die, badge and +20 % over the gym stage, the red dot and a gold
  card while something waits, "2 to collect: open me!"), the pop-up (`src/screens/events/rush.tsx`: the gauge, what
  arrived, the cards, INFO, OK; validation plays as it opens, skipped by a tap, at once without motion), the last
  pop-up after the end (`RushEndPopup`, its own turn in the queue: `rushEnd`, after the live events').
- **Admin**: `src/admin/sections/RushBox.tsx`; the calendar's reward row is shared (`RewardKindSelect`,
  `RewardFields`), with the new **Hidden talent** box (the calendar has it too).
- **Discord** (⚡, its type and boost, its rewards) and **push** (its type and boost), in English and French.
- **The picture**: its type's gym stage by default (`gym-<type>`, docs/67's pictures), its type's die and badge drawn
  over it.
- **No migration**: everything is in the save and the live events' row. The gifts' talent check on the server comes
  with the Community Boss.
- **Tests**: `tests/engine/typeRush.test.ts`; `e2e/type-rush.spec.ts` (its pictures in `docs/71-short-events/`); the
  admin's in `e2e/admin-events.spec.ts`; the kitchen sink's `TypeRushBits`.

## 4. Community Boss

### 4.1 Data (on the live event)

```ts
boss: {
  dex: number                       // the boss's species (its types are the species')
  shiny: boolean
  form?: string                     // a form's key, when the species has forms
  gauges: { hp: number; color: BossColor; reward: CalendarReward }[]   // in order: the first is broken first
}
```

`BossColor` is one of a set palette (green, yellow, orange, red, purple, blue, pink, black), each gauge a different
one by default in that order. At most **10 gauges** (the rewards go out in one message: 20 gifts at most). A Community
Boss **runs once** (no weekly or yearly repeat: the server works out its end from the event's dates) and **one at a
time**.

### 4.2 The hits

- Each player has **3 slots**. A slot holds one of their Pokémon (any region's Box or team; not an Egg, not a
  Day Care resident, not one on a Versus or raid team in use).
- **The rhythm**: the 3 slots take turns, one hit every 3 seconds, so **each slot hits every 9 seconds** (a slot left
  empty skips its turn: the other two don't hit faster).
- **A hit** = the Pokémon's **level × its affinity**: the best of its types against the boss's types on the type
  chart (×4, ×2, ×1, ×½, ×¼); a type the boss is immune to counts **×¼**. Rounded down, at least 1.
- **A slot's damage** = ⌊(time placed ÷ 9 s)⌋ × its hit, up to the event's end or until it's taken back. A level-50
  Pokémon with ×2 deals 100 a hit, 40,000 an hour; a full slot set of those, 120,000 an hour.
- **Swapping** a slot closes the old Pokémon's placement (its damage kept) and starts the new one from then. Taking
  one back returns it to its Box at once.
- **The placed Pokémon are away**: they leave the Box and the team (`save.events.boss[runId].placed`, as the Day
  Care's residents), and come back to their region's Box when the event ends or they're taken back. No XP while away
  (the Day Care is for that).

### 4.3 The server (migration, number taken at build time: about **0148**)

The damage is the server's alone: the game can't write it.

- No switch (§1): every function checks that the event is a scheduled Community Boss, running at the server's time.
- **`boss_slots`**: `event_id`, `user_id`, `slot` (0–2), `dex`, `level`, `shiny`, `affinity`, `inst_id`,
  `placed_at`, `removed_at` (null while placed). Row-level security: a player reads their own; nobody writes but the
  functions.
- **`boss_place(event_id, slot, inst_id, dex, level, shiny)`**: refused outside the event's dates (read from
  `game_config` `liveEvents`), for a guest (rewards and the board need an account), for a level above `maxLevel` or
  above the player's best level on their trainer card (`player_cards`, 0033) when they have one. **The server works
  out the affinity** from `pokemon.type1/type2` and `type_chart` (both in the database since 0001): the game sends no
  number it could inflate. Closes the slot's previous placement.
- **`boss_take_back(event_id, slot)`**: closes the placement.
- **`boss_state(event_id)`**: the community's damage, the gauges broken, trainers taking part, the last hour's
  damage, the top 10 (trainer name, damage), the caller's damage, share and slots, and **the field** (§4.4): up to
  20 placed Pokémon for the arena, the caller's first, then **their friends'** (`friendships`), most recently placed
  first, then **others** drawn at random to fill it. Each one: its species, shininess, level, its trainer's name and
  whether they're a friend (never an instance id). The others come from a sample of 40 kept on the cached row and
  drawn again each minute, so the crowd changes as the page refreshes and no caller costs a scan. The totals come from **a
  cached row rebuilt at most once a minute** (as the Versus board's, docs/66 §2), so a thousand players opening the
  page cost one sum a minute. The damage is a closed formula over the slot rows: nothing is written per hit.
- **`boss_settle(event_id)`** (service role, idempotent, a `boss_results` row per event): after the end, the gauges
  broken and, for **every participant**, one developer's message (as global messages' copies, 0143) titled "Steelix:
  4 gauges broken!" carrying the rewards of every broken gauge. The players open it as any gift. The **scheduled
  Netlify function that already posts live events every minute** (docs/50) calls it once an event has ended.
- A gift Pokémon gains **`talent`** (§5): 0048's check (`feedback_gifts_ok`) accepts it.

### 4.4 What players see

- **The Home square**: a **full background** (the admin's area picture) with **the boss's menu icon** big in the
  middle (pixelated, its shiny colours if shiny), the title ("Community Boss: Steelix"), the timer, and a thin strip
  of the gauges left. Tapping opens the page.
- **The start**: the live event's pop-up, once per run: the banner, "Place 3 Pokémon: they hit Steelix every few
  seconds, even while you're away.", **Go**.
- **The page** (`/boss?id=…`), top to bottom:
  1. **The gauges**: the boss's HP gauges **stacked by colour** (the current one in front, "×4" left behind it, as a
     fighting game's), the HP of the current one, the rewards on their gauges (a tile each; earned ones ticked).
  2. **The arena**: the area's background, **the boss big at the centre** (its animated sprite, standing still: it
     never attacks), and **about 20 Pokémon around it** in a ring (`BOSS_FIELD = 20`) from the server's field:
     - **the player's 3 at the front**, nearest the viewer, a gold ring under each;
     - **their friends' next to them**, each with the friend mark (as the Friends page's);
     - **other trainers'** filling the rest of the ring.

     They **take turns**: one at a time steps toward the boss, hits (a number pops on the boss, in colour when super
     effective) and steps back, then the next. The player's own keep their real rhythm (one of the 3 every 3 seconds,
     their numbers in gold, the real hit); the others are a show, one every ~0.6 s, with their real hit. A tap on any
     Pokémon names it: "Lv.48 Lucario · MISTY". When the field refreshes (every minute), those who left fade out and
     newcomers hop in; the player's and friends' stay in place.
     *Requests stay few* (docs/15): the boss and the player's 3 are animated sprites; the others are **menu icons**
     from the icon sheet (no request each), drawn 2× and bobbing.
  3. **Your 3 slots**, under the arena: an empty one **PLACE**; a placed one its icon, its hit and affinity ("Lv.50 ×2
     = 100 a hit"), **SWAP** and **TAKE BACK**.
  4. **Your damage**: your total, your share of the community's.
  5. **The community**: trainers taking part, damage in the last hour.
  6. **Top players**: the top 10, your rank under it if you're not in it (friends marked).
  7. **INFO** at the foot.
- **Before placing**: the arena shows the crowd already there (friends first), the front row empty with three dashed
  spots and **PLACE**: "Your Pokémon join here."
- **The live feel**: the community's bar moves on from the last hour's pace between reads; every minute the page reads
  `boss_state` again (the totals and the field), and the server's numbers win.
- **The picker**: the Box (every region's), sorted by hit (level × affinity), each with its "×2" chip; a guest sees
  "Sign in to take part."
- **The end**: the page says "The event is over: 4 gauges broken. Your rewards are in your messages." Placed Pokémon
  are back in their Box. The message pops up like any developer's message with gifts.

### 4.5 Admin

Type **Community Boss**: the species (search), shiny, form; the gauges (add up to 10: HP, colour, reward with the
calendar's picker and the talent box); **the estimate**: *Expected participants* (prefilled with the accounts active
in the last 7 days) and *Average hit* (prefilled 60), giving per gauge "≈ 9 h at 80 trainers" and for the whole boss
"broken in about 2 days 6 h". During the event: the live numbers (`boss_state`) and **End now**. After: the result and
**Send the rewards again** if settling failed.

### 4.6 Built (2026-11-11)

- **Server** (migration `0146_community_boss.sql`): `boss_event` (the event from the `liveEvents` row),
  `boss_affinity` (the game's chart: both types multiplied, kept between ×½ and ×2 as `engine/typechart.ts` does, an
  immunity ×¼), `boss_slots`, `boss_place` / `boss_take_back` (signed in; refused outside the dates, above the trainer
  card's best level or the game's cap, for an unknown species; one Pokémon in one slot), `boss_state` (the cache
  rebuilt at most once a minute: total, last hour, trainers, the top 10, a random sample of 40; the caller's damage,
  rank and slots, live; the field: own, friends', others, at most 20), `boss_settle` (once: the gauges broken, one
  developer's message per participant with those rewards, at most 20 gifts) and `boss_settle_due`, which the new
  scheduled function `netlify/functions/community-boss.mts` calls every 5 minutes. The gifts' check (0048) already
  takes a Pokémon's `talent`, so it needed no change.
- **Different from the plan**: the affinity follows the game's chart, so no ×4 or ×¼ from two types (×2 and ×½ at
  most), an immunity still ×¼. A boss's rewards are messages only while the developer's gifts are on (Admin → Config
  → Gifts, as for every message with gifts). The arena's Pokémon are all menu icons (the boss alone is an animated
  sprite): one request for the whole crowd. No post on Discord at the end (its start post and the calendar have it).
  The admin's estimate takes the trainers by hand (50 by default), not from the analytics.
- **Engine** (`src/engine/communityBoss.ts`): the boss's settings and checks (one at a time, runs once, at most 10
  gauges, 20 gifts), `bossAffinity` / `bossHit` / `bossDealt` (the server's rules, for what the screens show),
  `bossStanding` (the gauges from a total), `bossEstimate`, `bossCandidates` (every region's Box, the Day Care's
  rule, best hit first), `placeOnBoss` / `takeBackFromBoss` / `bossHomecoming` (the placed Pokémon in the save's
  `events.boss`, in its schema; each remembers the event's end, so it comes home then even before the content loads).
- **Store** (`src/store/communityBoss.ts`): the server first, then the save; the page reads `boss_state` every
  minute; the homecoming runs at start, when the tab comes back and every minute.
- **Screens** (docs/15 §54): `/boss?id=…` (`src/screens/events/Boss.tsx`), Home's card (the boss's icon on the
  picture, a tap opens the page), the start pop-up with **Go to the boss** (its page open counts as seen).
- **Tests**: `tests/community-boss-sql.test.ts` (PGlite), `tests/engine/communityBoss.test.ts`,
  `e2e/community-boss.spec.ts` (the server mocked; its picture in `docs/71-short-events/`), the admin's in
  `e2e/admin-events.spec.ts`, the kitchen sink's `BossBits`.

## 5. Rewards that are Pokémon

`CalendarReward` and the message's `Gift` gain **`talent?: boolean`**: with it, the Pokémon arrives with its family's
hidden talent (as a legendary does); without it, the gifts' usual roll at the wild odds (docs/51). `placeGifts`
(`src/engine/gifts.ts`) sets it; the reward picker gets a **Hidden talent** box (shown while hidden talents are on).
Shared by the Type Rush gauge, the Community Boss and the gift calendar.

## 6. Banners

- **Hatching Day**: a new picture, `public/backgrounds/live-hatch.png` (400 × 223, as the other live pictures),
  listed under the admin's Event pictures and the type's default (`LIVE_BANNERS`, `TYPE_BANNER`). Prompt in §6.1;
  then `pnpm unpixel <the Gemini file> public/backgrounds/live-hatch.png --px <its width ÷ 400> --width 400`.
- **Type Rush**: the admin's area picture (defaults to the type's gym area when one exists, else the celebration
  picture), **the type's icon and colour** drawn over it by the game.
- **Community Boss**: the admin's area picture, full, with **the boss's menu icon** on top (the icon sheet, 2× or 3×,
  pixelated).

### 6.1 Gemini prompt: Hatching Day

```
Pixel-art banner for a Pokémon-style mobile game: "Hatching Day", a short live event where Eggs at the Day Care come three times faster and hatch shiny more often. Generic: no named place, no people, no logo.
The place: a sunny nursery meadow in the golden light of early morning, seen from the front at eye level. At about one quarter across, a big round straw nest on the grass holding three large cream Eggs with soft green and pink speckles, one of them glinting with tiny four-point sparkles. At about three quarters across, a small wooden hatchery hut with a warm orange roof, a lamp glowing in its open window and a wicker basket of Eggs on its step. Between them, the middle of the picture stays open and calm: soft lawn, a low white picket fence far behind, a pale sky with a few round clouds and a gentle sunrise glow on the horizon. A few broken shell halves and daisies in the foreground grass. Warm, hopeful and cosy.
Palette: early-morning gold. Sky pale azure #BFE4F9 warming to peach #FFE3C2 and cream #FFF6E4 at the horizon, round clouds white with #F3D9C6 undersides; far hills periwinkle #C8D6F0. Lawn #A7DE82 to #79BF62 with tufts #5FAE55. Straw nest #E8C27A with shade #C99A52 and highlight #F6DCA0. Eggs cream #FBF3E2 shaded #E8D8B8, speckles green #9BE3A0 and pink #FF9CC2; sparkles pale gold #FFF3B0. Hut walls warm wood #C98A5A and #A0704A, roof orange #F07A3A with a light ridge #FFB070, window glow #FFE07A. Fence white #FFFFFF shaded #C8DCC0. Daisies white and yellow #FFE07A. The darkest colour deep navy #24304F.

Format: one landscape image (16:9). It will be shrunk to 400 × 223 pixels, so draw it as if on a 400 × 225 canvas enlarged with nearest-neighbour: every art pixel a clean square block about 4 to 5 screen pixels wide.
Composition: a front-facing, eye-level view; the horizon one straight, level line a little below the middle. Keep the centre third calm, light and empty (the game prints a big "×3" and "×4" over it); the nest sits at about one quarter across and the hut at about three quarters; nothing important in the top-left corner (the title plate goes there).

Style: "Johto Daybreak", the look of the game Pokédice. Crisp, low-resolution pixel art in the spirit of Pokémon HeartGold/SoulSilver and Black/White backdrops, redrawn brighter and calmer. A strict square pixel grid, every art pixel the same size, hard edges, no anti-aliasing, no blur and no smooth gradients: colour transitions use ordered (Bayer checkerboard) dithering. A limited palette of about 32 colours with 2–3 shading steps per material. No black outlines around the scenery: shapes read through flat colour, a lighter highlight row along top edges, and cool bluish shadows. The darkest colour anywhere is deep navy #24304F, never pure black. Airy, optimistic and readable at a small size.
Avoid: any characters, people, Pokémon or animals; battle platforms, circles or rings drawn on the ground; text, letters, numbers, signs with writing, logos, watermarks, signatures; UI, frames or borders; photorealism, 3D rendering, painterly brushwork, smooth gradients, blur, noise, anti-aliasing; isometric or top-down views; a tilted horizon. No creature hatching or peeking out of an Egg, no faces or hearts drawn on the Eggs, no incubator machine with screens or buttons.
```

(Attach a current live banner, e.g. `public/backgrounds/live-shiny.png`, as the style reference and add the line: "A
style reference image is attached: match its pixel size, palette family, ordered dithering and level of detail
exactly. Do not copy its layout or subject.")

## 7. Tests

- **Engine** (`tests/engine/`): `hatchingDay.test.ts` (the clock ×3 and ×6 with Flame Body, two events adding up, the
  shiny roll ×4 only when cracked during it, nothing touched off); `typeRush.test.ts` (each fact counted only for
  the type and while live, chains showing one step and keeping the counter, the order by completion, validation
  paying points and rewards once, the end's settle, the rotation of a weekly run, the admin checks);
  `communityBoss.test.ts` (the arena's order: own, friends, others, at most 20; the hit and affinity with ×¼ for immunity, a slot's damage over time and after a swap,
  the gauges broken from a total, the estimate); `damage.test.ts` (the boost on the player's side only, its recap
  line).
- **SQL** (`tests/community-boss-sql.test.ts`, as the Friend Battles' one): the affinity from the type chart, the
  level cap, the formula, settling once.
- **e2e**: `e2e/hatching-day.spec.ts`, `e2e/type-rush.spec.ts` (the red dot, opening validates with the animation,
  the next step at 10/20, the last pop-up after the end), `e2e/community-boss.spec.ts` (placing, swapping, the page's
  numbers with a mocked `boss_state`), each with the admin's editor; the kitchen sink's new components.

## 8. Build order

One by one, each its own pull request into the version branch with its Netlify preview, each validated before the
next:

1. **Hatching Day** (small): the type, the clock and the shiny roll, the pop-up and chips, the admin row, the
   picture. No migration.
2. **Type Rush** (medium): the quests and facts, the boost, the pop-up and its animation, the last pop-up, the admin
   editor, the talent on reward Pokémon (§5). No migration (the gifts' talent check comes with the Community Boss).
3. **Community Boss** (large): the server (§4.3), the page, the picker, the banner, the admin with the estimate,
   the settle in the scheduled function, Discord.

## 9. Defaults I took (say if not)

- **Hatching Day**: the side quests' gift Eggs aren't sped up (they have a fixed 6 h).
- **Type Rush**: catches by trade, gift or hatch don't count as "catch" (hatches have their own quest). Rush points
  aren't a currency to spend: they only fill the gauge.
- **Community Boss**: guests can't take part (the server needs an account to count and reward them); placed
  Pokémon earn no XP; a Community Boss runs once, never on a repeat; the end result is also posted in `#🎉-events`
  ("Steelix: 4 of 5 gauges broken by 212 trainers!").
- **The arena**: other trainers' Pokémon are menu icons (only the boss and the player's 3 load an animated sprite);
  the crowd is drawn again every minute; friends always come before strangers, however many friends have placed.
- **Names**: Hatching Day, Type Rush (shown as "{Type} Rush": "Fire Rush"), Community Boss. French: *Jour d'éclosion*,
  *Ruée {type}* (« Ruée Feu »), *Boss communautaire*.

## 10. Setting it up

### Hatching Day

Nothing to run in Supabase.

1. The picture: make it in Gemini with §6.1's prompt, then
   `pnpm unpixel <the Gemini file> public/backgrounds/live-hatch.png --px <its width ÷ 400> --width 400` (it replaces
   the stand-in).
2. Admin → Events → Live events → **New live event** → Type **Hatching Day**: its dates (or a weekly repeat), the Egg
   speed and shiny odds, *Add to the list*, then **Save & Publish**. It runs for everyone from its start (the live
   events' own switch must be on, as for any live event).

### Type Rush

Nothing to run in Supabase.

1. Admin → Events → Live events → **New live event** → Type **Type Rush**: its dates (2 to 4 days), its type (or, for
   a weekly one, *Rotate each week*), the boost, the quests and the gauge (the default list is there to start from),
   *Add to the list*, then **Save & Publish**. It runs for everyone from its start.

### Community Boss

1. Run the migration in Supabase → SQL Editor:
   https://github.com/Splifingald/pokedice/blob/claude/great-cannon-5792yi/supabase/migrations/0146_community_boss.sql
   (it isn't in `supabase/seed.sql`: it holds server functions, as Friend Battles' do).
2. The developer's gifts must be on (Admin → Config → Gifts: *On for everyone*), or the rewards wait unseen in the
   messages.
3. Netlify: nothing new to set. The scheduled function uses `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`,
   there already for the push sender; it runs on the published site only (on a Deploy Preview, use the admin's **Send
   the rewards now** after the end).
4. Admin → Events → Live events → **New live event** → Type **Community Boss**: its dates (2 to 4 days), the boss, its
   gauges and rewards (check the estimate against the dates), a picture (an area picture: its stage), *Add to the
   list*, then **Save & Publish**.
