# 43 · The deep pass: one game, five places, one design system

The user's brief (2026-10-26): rework the UX and UI of the whole game, every menu, screen and pop-up, on phone and PC.
Two passes (docs/42 and the one before) trimmed and docked; this one restructures. §1 is the audit, §2 the principles,
§3 the new map, §4 the design system, §5 each screen before and after, §6 the tap counts, §7 the pop-ups (with a
proposal that waits for the user), §8 what is left.

## 1. The audit

A script (`scripts/ux-audit/tour.cjs`, kept with this pass) opened 25 screens and sheets with four saves — a fresh game
(one Pokémon), early (1 badge, a team of three), mid (3 badges, the Day Care open, 28 in the Box), late (the League won,
the events open, Versus open, 60 in the Box) — at 390×844, 360×640 and 1440×900, every pop-up that opened on arrival
kept. For each: a full-page screenshot, the text under 16 px, the controls on screen and in all, what is below the fold,
the controls under 44 px, the width the content really takes on PC, and axe's serious and critical findings. A second
script (`loop.cjs`) played the core loop and timed every tap.

| Screen (save) | Text under 16 px (390) | Controls in view / all (390) | Page heights at 390 / 360 | Content width at 1440 | axe |
|---|---|---|---|---|---|
| Title | 0 | 7/7 | 1 / 1.3 | 1440 | 0 |
| Home (fresh) | 8 | 12/12 | 1 / 1 | 1192 | 0 |
| Home (mid) | 11 | 15/15 | 1 / 1.2 | 1192 | 1 (the Upgrades dot) |
| Home (late) | 26 | 24/27 | 1.8 / 2.3 | 1192 | 0 — **Support me modal on arrival** |
| Areas sheet | 64 | 33/59 | 1 / 1.2 | sheet | 0 |
| Area details | 36 | 30/30 | 1 / 1.2 | sheet | 0 |
| Trainer menu | 24 | 26/27 | 1 / 1.2 | drawer | 0 |
| Team (mid) | 73 | 25/48 | 1.8 / 2.9 | **768 of 1152** | 1 |
| Team (late) | 140 | 30/85 | 2.8 / 4.6 | **768 of 1152** | 0 |
| Poké Mart | 42 | 27/27 | 1.1 / 1.5 | **768 of 1152** | 1 |
| Upgrades | 33 | 14/14 | 1 / 1 | **768 of 1152** | 1 |
| Pokédex | **328** | 37/164 | **5.3 / 9.1** | 1024 | 1 |
| Day Care | 20 | 13/15 | 1.5 / 1.9 | 1128 | 1 |
| Friends | 7 | 10/10 | 1 / 1 | **672 of 1152** | 1 |
| Leaderboard | 7 | 15/15 | 1 / 1 | **672 of 1152** | 1 |
| Versus | 12 | 19/19 | 1 / 1 | **672 of 1152** | 0 |
| Settings | 7 | 28/35 | 2 / 2.8 | **672 of 1152** | 1 |
| Fortune Wheel | 15 | 19/19 | 1 / 1.2 | 1128 | 0 — two pop-ups queued |
| Raids | 47 | 16/24 | 2.1 / 2.8 | 1128 | 0 |
| Elite Rebattle | 25 | 14/16 | 1.4 / 1.8 | 1128 | 0 |
| How to play | 10 | 1/9 | **8.3 / 11.9** | 744 | 0 |

What it shows, beyond the numbers:

- **Too many places.** Five tabs, a top bar with three ways out (gold → Mart, cup → leaderboard, you → menu), a side
  nav, a drawer of nine rows. The leaderboard is reachable from the cup and the drawer; Friends and Trades only from the
  drawer (3 taps from Home); Versus only from a Home square; Upgrades and the Mart are two tabs for one thing (spending
  gold), each repeating the gold already in the top bar.
- **PC is a phone in a window.** Team, Mart, Upgrades, Settings, Friends, the leaderboard and Versus are a 672–768 px
  column in a 1152 px main, the rest of a 1440 window empty. The side nav's ground stops at the fold on a long page.
- **Small grey print everywhere.** Every screen but the title has text under 16 px: the Pokédex 328 pieces of it (a
  "#012 ???" under every silhouette), the Box 140, the Mart's effect lines at 13 px, the tab bar's labels at 15 px.
- **A Pokémon has seven looks**: `PokeCard`, the Team's cards (`TeamCards`, sprite at 80 px, XP strip, order tag),
  `MonCard`, `SwitchRow`, `TeamPips`, `TeamColumn`, `MonTile` — and a sheet header of its own.
- **The core loop is already lean** (docs/42): from Home one tap reaches the dice on a wild fight, two on a trainer's
  (the send-out is a decision); between encounters no tap is not a decision (the result moves on by itself, the wild
  send-out goes by itself). The loop's weight is in the battle's layout (§5.3), not its taps.
- **Buying is three taps from Home** (the Mart tab, the row to open it, BUY); an upgrade two.
- **Arrival pop-ups**: the late save opened Home under Support me; the wheel's page under its rules then the next one
  queued. A request for money is not a decision the player came to make.
- **Dead space on tall phones**: the battle at 390×844 leaves ~200 px between the stage and the dice (the tour's
  screenshot `loop-early-390-stall`).

## 2. Principles

1. **Five places.** Everything lives in one of Home, Team, Mart, Pokédex, Social. A feature is a tab, a section of one, or
   a square on Home; nothing is reachable only from the drawer.
2. **The thing, then what to do with it.** Every screen is a visual on top (a scene, a stage, a grid) and its actions at
   the foot (phones: pinned; PC: a docked panel). One red action at most.
3. **List and detail side by side on PC, a sheet on phones.** One layout (`SplitView`) for the Team, the Mart, the
   Pokédex, Social and Settings: on a PC the detail stands docked at the right of its list (as the fight's panel does,
   docs/42), so opening a Pokémon or an item never covers what you picked it from.
4. **One component per thing**, in a few sizes (§4). A Pokémon is a `Mon`; an item a tile; an area a strip.
5. **16 px is the floor, 18 the body.** Grey small print either grows or goes. Numbers only where they decide something;
   the rest is More details' (docs/42), which stays the invested player's switch.
6. **A tap is a decision.** Choosing is acting (a price is a purchase, a ball a throw); defaults are right most of the
   time (the lead, ×1); a step with one button presses itself (`AutoButton`), except the Pokémon Center.
7. **Inform in place.** Non-blocking news is a card in the page or a toast, never a modal; modals are for rules (the
   user's standing rule) and for costly, irreversible choices.

## 3. The map

```
Phone tab bar:       Mart · Team · ( Home ) · Pokédex · Social   (the user's order, 2026-10-27)
PC rail (left):      Home · Mart · Team · Pokédex · Social
Top bar:             [sun/moon] [energy] ……………… [₽ gold → Mart] [you → trainer menu]

Home ─ the area's scene, the team roaming
     ├ PLAY dock: CONTINUE (the next encounter) + the area button (→ Areas sheet: the area, then the region's list)
     ├ Events · Secret areas · Features (Day Care, Versus) — one row each, a strip, a name, one status line
     └ notices (Prof. Oak's tips, Support me, an invite) — cards in the page, dismissable, never modals
Team ─ banner (the team roaming) · the team · the Box (search, sort, type) → a Pokémon (docked on PC / sheet on phone)
Mart ─ Buy · Upgrades · Bag (one place to spend gold) → an item (docked on PC / sheet on phone)
Pokédex ─ the grid (filters) → an entry (docked / sheet); Shiny and Unown dexes as views of it
Social ─ Leaderboard · Versus · Friends · Trades (tabs; the ones not open yet say what opens them)
Trainer menu ─ the card and looks · Inbox · Settings · How to play · Type chart · Cloud backup · Discord · Contact · Support me
/area ─ the stage and its panel (every step of an encounter), no tab bar on phones
```

What moved and why:

- **The Mart and Upgrades are one tab** (Buy, Upgrades, Bag): both are "spend gold", both repeated the gold, and the
  affordable-upgrades dot now sits on the one Mart tab. `/upgrades` opens the Mart on Upgrades.
- **Social is a tab**: the leaderboard (was the cup and a drawer row), Versus (was a Home square only), Friends and Trades
  (were drawer rows, three taps deep). Versus keeps its Home square (it is a feature) and gains a tab.
- **The cup leaves the top bar**: one way to the leaderboard. The top bar keeps the two things you look at often: your
  gold and you.
- **The drawer is about you**: the card, your looks, your messages, your settings and help. Nothing to play in it.
- **SUPPORT ME leaves the side rail** for the drawer's foot (a rare action out of the way, principle 2).

## 4. The design system

| Object | One component | Sizes | Where |
|---|---|---|---|
| A Pokémon | `PokeCard` (the send-out's card, now everyone's) | `card` (sprite, name, level, HP gauge; selectable, a slot tag), `tile` (`MonTile`: icon, name, level; grids), `pip` (`TeamPips`: icon + HP sliver; the fight's team row on every screen) | Team, Center, between encounters, send-out, K.O. switch, the fight's switch (was `SwitchRow`), the Box, the Pokédex, pickers |
| An item | `ItemTile` | `tile` (sprite, name, one effect line, count, price or action), `row` in the Bag sheet | Mart Buy and Bag, the battle's Bag, rewards |
| An area | `AreaStrip` row (the strip cut around its horizon, the name, one status line) | `row`, `card` (Home's squares) | Areas sheet, Home's events, secret areas and features |
| A reward | `RewardChip` (icon + amount) | | the result, raids, the wheel, gifts |
| An action bar | `BottomDock` (phones: pinned over the home indicator; PC: the docked panel's foot) | one primary, ≤ 2 quiet ones | everywhere an action ends a screen |
| A place | `SplitView` (list + docked detail on PC, sheet on phones) and `StageView` (a stage + its panel) | | §5 |

Type scale (tailwind tokens, `docs/15 §3`): `label` 16, `small` 18, `body` 20, `large` 22; Tailwind's `xs` and `sm`
are raised to 16 and `base` to 18, so a stray class can't go under the floor. Tags (NEW, a count on a tab) may be 14.

## 5. Every screen, before and after

Each entry: before (from the audit), after on a phone, after on PC, and what was removed, merged, moved or added.

### 5.1 Shell

- **Before**: five tabs (Shop, Upgrades, Home, Team, Pokédex); a top bar with gold, the cup and you; a side nav with
  SUPPORT ME and SYNC ONLINE; the drawer with nine rows.
- **After, phone**: tabs Team · Mart · Home · Pokédex · Social, 16 px labels; the top bar: day/night, energy, gold, you.
- **After, PC**: a rail of the same five, full height (its ground no longer stops at the fold), SYNC ONLINE at its foot;
  SUPPORT ME in the drawer; main as wide as the screen up to 1440 px, every screen laying itself out in it (§5.4–5.9).
- **Removed**: the cup, Upgrades' tab, the drawer's Leaderboard, Friends and Trades rows. **Added**: Social. **Moved**:
  SUPPORT ME to the drawer.

### 5.2 Home, the Areas sheet, notices

- **Before**: a plate over the scene (name, levels, rounds, caught), squares of mixed sizes under headings, CONTINUE in a
  bar with a 76 px AREAS button; a late save opened under a Support me modal; dead space on PC.
- **After, phone**: the scene full width, no plate; under it one notice card, then Events, Secret areas and Features as
  one row card each (`HomeCard`: a strip picture, the name and a tag, one status line, a thin gauge where something
  runs; gold for one new thing), then the "Coming up" line. The **PLAY dock** is pinned over the tab bar: the area
  button (≥56 px: the map, the area's name, its rounds as pips with "0/1", its levels; NEW when a secret area opened;
  shut by the nightmare with its reason) over CONTINUE (red, its second line). At 390×844 the scene and the dock are the
  first screen.
- **After, PC**: the scene sticky and as tall as the window on the left (cropped at most ~8 % a side); on the right
  (380–520 px) the dock, the area's Pokémon (`HereCard`, uncaught first, opening the details), the notice, the sections.
- **The Areas sheet** absorbs the area details: tabs Details · All areas · Regions; it opens on the current area's
  details (CONTINUE HERE / TRAVEL HERE in its footer); a row (strip, name, "Lv · caught/total · n to catch" or why it's
  locked, GO) shows its details in place. PC: one 1080 px sheet, the list left and the details right (their footer navy,
  so the lead GO stays the one red). Each Pokémon's odds % and the round mix are More details'.
- **Notices** (`NoticeCard`, `homeNotices` in the engine): one at a time, never red, ✕ 44 px — a feature with a page
  opening ("Versus is open!" → its page, where the `RulesCard` ends it), Prof. Oak's leaderboard tip, his invite,
  Support me, a region on offer once its pop-up was seen. The rules modals of the Day Care, the events, Versus, Trades,
  the General upgrades, the Shiny and Unown dexes, the invite rewards, the raids' overhaul and the Underground left the
  queue; nothing opens on arrival any more.
- **Removed**: the plate on Home, the AREAS square, the arrival modals (Support me, the tip, the invite), RegionBar's
  banner and switcher. **Merged**: the details into the Areas sheet; every square into one card.
- **Taps**: Home → dice 1 → 1; the area's details 1 → 1; the area list 1 → 2 on phones (1 on PC, side by side); a modal
  to dismiss on arrival 1 → 0.

### 5.3 The area loop

- **Before**: on a 390×844 phone ~200 px of nothing between the 3:2 stage and the dice; on PC the stage 1012×675 with
  room under it, the panel's team as rows; a turn's switch a modal of `SwitchRow` rows with a full-width FORFEIT; the
  Bag's "on whom" the same rows; the page between encounters with two gauges (the plate's and the round's).
- **The stage grows upward** (`StageSky`): the frame is as tall as the panel leaves (`max(3:2, 100dvh − top bar −
  330 px)`; at 390×844 a 458 px frame for the 260 px grid), the 240×160 grid anchored at its foot, untouched (same
  timelines, plates, sprites), and above it the area picture's own rows, then its top colour deepening in dither (the
  drawn Daybreak paints its sun and clouds, the nightmare its stars, the Distortion World its void). Never below: your
  Pokémon stands on the grid's bottom edge. Fixed per screen, so the stage never jumps between steps. ATTACK sits in the
  lower half; 360×640 still fits with nothing to scroll. Trick or Treat grows the same way.
- **PC**: the stage as tall as the window (812 px at 1440×900); the panel's team is the pips as on phones (one design,
  `TeamColumn` gone); dice up to 72 px; a discreet key line at the panel's foot (on hover or focus; always with More
  details; never on phones).
- **One way to pick a Pokémon**: the turn's switch is the send-out's cards in the panel (the tapped pip picked, "Switch
  (costs your turn)", BACK | GO! | the forfeit flag), no dialog; the K.O.'s the same without BACK; the Bag's "on whom"
  the same cards, one that can't be helped saying why.
- **Keys**: 1–6 dice, R reroll, Space attack, and now B the Bag, S switch, Esc back, Enter the step's red button, 1–n a
  card (`aria-keyshortcuts` on the buttons).
- **Game feel**: a result's big moments stamp down (`Stamp`: a badge, Champion, an area cleared, a medal — held steps,
  two white frames, a stepped ring, confetti; a catch or a secret area one step); short one step, calm at rest; never
  blocking. The catch card's ball rocks in steps. Screen readers hear "Victory!".
- **No single-button screen**: the Game Corner's and Trick or Treat's preview with nothing to choose loads and goes
  (`AutoButton`); a double battle's preview picks on the send-out's cards.
- **Between encounters and the Center** (`StagePanel` for `/area`): phones the scene on top and the bar pinned; from
  1024 px, between encounters, the panel framed beside the scene, as tall, scrolling inside, the bar at its foot, the
  scene in the fight's 3:2 box (`SceneStage fill`), so it fits the window. **The Center is stacked on every screen**
  (`StagePanel stacked`, the user's call, 2026-10-28): its healing plays at the top (on PC at a size the window holds)
  and folds away, and the team and the Box take the page's width, six to a row; no picture of the area beside them.
  One gauge: the fight's strip on the scene's top edge. The Center's Box uses the Team's Sort & filter, its sheet the
  Team's swap dock.
- **Kept** (the user's decisions): the send-out's cards and GO!, wild fights going by themselves, the result moving on
  (but after a new species and an area cleared), the Center waiting, no tab bar in an area.
- **Taps**: Home → dice 1 (wild) / 2 (trainer); between encounters 0 non-decision taps; the Game Corner with nothing to
  skip 1 → 0; a switch 2 (pip, GO!) or S, Enter. First ATTACK at 6.6 s from Home (was 8.2 s, the loop script, early save).

### 5.4 Team and the Pokémon sheet

- **Before** (team-mid / team-late): a 168 px banner, a title row ("Team 3/3") with a big "Swaps at a Center" chip,
  three tall `TeamCards` (80 px sprite, order tag, HP figures, XP strip, dice squares), then the Box: a search, a 3-way
  sort and a type dropdown on separate rows, tiles with 13 px levels; on PC the sheet a modal, the content a 768 px
  column in 1152. 1.8 / 2.8 screens tall at 390 (mid / late).
- **After, phone**: the banner (the team roaming, the user's decision) carries the page's `<h1>` as a plate in its
  corner — no title row, no "3/3", no swaps chip. The team as three `PokeCard`s (the one card: the lead's crown tag, a
  thin XP line, the HP gauge; drag to reorder kept). The Box's heading counts it ("Box 28", "Box 2 of 60" narrowed),
  one filter row (the search, then **Sort & filter**: a sheet with the order and the type as named swatches, SHOW n;
  a gold count on the button says what's set). Tiles: 16 px names, the level a corner tag. Empty states say what to do
  (an empty Box says where catches go; no match offers Clear filters).
- **After, PC**: `SplitView` — left, the banner (232 px, the whole team in view), the cards, the Box 8+ columns wide;
  right, docked and always open, the selected Pokémon's sheet (the lead's on arrival); a card or tile swaps it in place,
  outlined in gold. Sort & filter is a panel under its button (keyboard: arrows, Esc).
- **The sheet**: a hero (sprite, types, HP and XP as gauges; figures with More details), then what matters now (a
  waiting Pokémon's lock; Evolve now in gold, no longer a second red), the dice, What's next (the reached milestones
  folded under "Reached (n)"), matchups, the rare moves (Send to region, Trade: quiet), and a folded **Stats** section
  (open with More details). The footer: one red at most (Make lead / Add to team), Use an item quiet beside it; at a
  Center `TeamSwapDock` (a full team: "swap X in for:" and the members as one-tap buttons). Let it go a plain-size
  danger button at the end, still asked twice.
- **Removed**: the title row, the count, the swaps chip (the rule sits at a Box Pokémon's sheet foot), `TeamCards`' own
  look, the sort bar and the type row, the "Leads the team" line. **Merged**: sort and type; the title into the banner.
  **Added**: the docked sheet on PC, Clear filters.
- **Taps**: a Pokémon's details on PC 2 → 0 (the lead is open), the next one 2 → 1 (no close); sorting 1 → 2 (one menu
  for sort and type); a Center swap stays 2.

### 5.5 The Mart (Buy · Upgrades · Bag)

- **Before**: two tabs (the Poké Mart, Upgrades), each repeating the top bar's gold; a 2-up shelf whose rows opened then
  BUY (3 taps from Home); effect lines at 13 px; each live sale, kit, world shelf and gem shelf its own expander; on PC a
  768 px column in 1152; Upgrades' cards with the now → next line small and the button small.
- **After, phone**: one Mart, its tabs Buy · Upgrades · Bag (the page title for screen readers, the tabs say where you
  are). Categories one scrolling chip row; the shelf three to a row (the mid save's whole shelf on one 390×844 screen).
  **One `ItemTile`** for the shelf, the Bag, held gems, Special Shops (struck price, −%, NEVER SOLD, "x of y left"), the
  Explorakit, a small world's Mart, the Mega Gems and Coming later: the sprite, the name, one effect line, a ×N tag and
  **the price, which is the purchase** (×1, one tap; short of ₽ it says what's missing). The tile opens `ItemDetail` with
  ×1 / ×5 / ×10, **each a purchase** with its total (pick-then-BUY is gone). A purchase is felt: coins fly from the top
  bar's gold to the tile, its count hops.
- **After, PC**: `SplitView` — the shelf four columns wide, the Bag docked at its right; an opened item's details and
  quantities take the pane.
- **Upgrades**: Combos / Dice Types / General a compact chip tab list on the row with Affordable (not a second
  full-width tab bar); a card in two columns — the name and Best buy, **now → next at 22 px**, the track; the price the
  card's full-height button (navy, the best buy gold, "need ₽X" grey, MAX, a lock). The status faces' lines are More
  details'. PC: three columns.
- **Removed**: the page wallet, the per-section expanders, the inline segmented + BUY, a fossil's pop-up (a toast).
  **Merged**: the Mart and Upgrades; seven tile designs into one.
- **Taps**: a Poké Ball 3 → 2 (the gold, its price); ×5 4 → 3; an upgrade 2 → 2 (the Mart's tab opens on Upgrades while
  one is affordable, its dot saying so).

### 5.6 Pokédex, the Shiny and Unown Pokédex

- **Before**: at 390 px a grid 5.3 screens tall (9.1 at 360), 328 pieces of text under 16 px ("#012 ???" under every
  silhouette); the progress twice ("32/151" and a bar); a search, then four filter chips on a row of their own; the entry
  a modal holding the whole Pokémon sheet before "where to find it"; on PC a modal over a 1024 px grid; the Shiny and
  Unown dexes page variants with heads and gauges of their own, their rules pop-ups in the queue.
- **After, phone**: the head says it once, as a gauge ("32 of 151 caught"); a `Seg` switches Pokédex / Shiny / Unown
  (only the views open); one row holds the search and the filter (a dropdown with counts). The grid is five to a row: an
  uncaught species is its silhouette alone (its number for screen readers), a caught one its icon and name; NEW gold,
  Nearby a green word. 2.7 screens at 390 (was 5.3); text under 16 px: none but the tab's badge (was 328). The entry is a
  sheet: a hero (sprite, types, cry), **where to find it** (area strips with a navy GO, raid days), **evolutions both
  ways** (cards that open that entry), and "Dice and stats" folded (open with More details).
- **After, PC**: `SplitView` — the grid nine columns wide, the entry docked (the last viewed or the first caught open).
  The grid is one Tab stop: arrows move by tile and row, Home/End, the pane follows the focus, Enter moves into it.
- **Shiny and Unown**: views of the same screen with the same tile and gauge; their rules a `RulesCard` at the top of
  the view until GOT IT, INFO at the foot.
- **Removed**: the "#NNN ???" lines, the second progress, the chips row, the modal on PC, the big "complete" card.
  **Merged**: three views into one layout and one tile (`DexTile`). **Moved**: the studied numbers and a stone's sources
  into folds.
- **Taps**: an entry on PC 2 → 1 (one is open), the next 2 → 1 (a click or an arrow); the Nearby filter 1 → 2 (a
  dropdown, so search and filter share one row).

### 5.7 Day Care

- **Before**: the yard, the Egg bar, tall slot cards (76 px tiles), a big gold connect panel, Egg checks always open, a
  big blue INFO; on arrival its rules pop-up, then the invite, one after the other.
- **After, phone**: the yard on top, then the panel: the rules card on the first visit; the Egg card (one row, HATCH IT at
  its end) or the Egg-now bar; your two slots compact (a 60 px sprite beside the name, level and "+N Lv", the XP bar,
  the partners, TAKE BACK); friends' Pokémon one line each, Send back a 44 px ✕ (one tap); the free friend slots one
  "+ Add from a friend" line; signed out, one line and a small CONNECT; at the foot the Egg checks folded (open with More
  details) beside a small INFO. At 390×844 the yard, the Egg bar and both TAKE BACKs are on the first screen.
- **After, PC**: the yard on the left, as tall as the window allows, sticky; the panel framed on the right, scrolling
  inside itself.
- **No chain**: nothing pops up on arrival (the rules are the card; the push question waits while it's up).

### 5.8 Social

- **Before**: four pages in three places (the cup, the drawer, a Home square); each a 672 px column on PC; the
  leaderboard's five tabs icons only but the open one; a red FIGHT on every Versus row; adding a friend through a dialog.
- **The strip** (`SocialTabs`): one row that never scrolls sideways, each view its icon over its name at 16 px; a locked
  view shrinks to its icon with a lock. Links with `aria-current` (each view is its own route), not a tablist. On PC it
  stays a row (the rail is already the list of places). `SocialColumns` gives each view two columns from 1024 px;
  `SocialDock` pins a view's action over the tab bar on phones.
- **Leaderboard**: five boards, each named (Level, Progression, Pokédex, Shiny, Raids) in every language; a heading names
  the board and its region; rows carry a `ScoreMeter` where the board has a ceiling, a count and its icon for Shiny and
  Raids. Phones pin your place at the foot (a tap scrolls to your row; CONNECT signed out). PC: the ranking one line a
  row (85 → 64 px), and beside it your place, the boards (each with what it counts) and the Hall of Fame inline.
  Removed: the score repeated in your card, "/151" on every row, the words on every count.
- **Versus**: one red FIGHT — the opponent your team hits hardest; the others navy. PC: your team and the board beside
  the opponents, always in view; phones: Clear / SAVE TEAM pinned. The intro and the editor's rules sentence went to
  INFO; the rules a `RulesCard` until GOT IT.
- **Friends**: the list first; your ID with COPY; adding a friend in the page (the field, who the code is, ADD: one dialog
  less); SHARE INVITE LINK the one red, pinned. PC: `SplitView`, the picked friend's card docked (the first one open).
- **Trades**: the search and a sort dropdown on one row, empty slots quiet dashed placeholders, NEW LISTING · n/4 the
  one red (pinned on phones, on top of Mine docked beside the board on PC).
- **Taps**: add a friend 2 → 1; a friend's card on PC 1 → 0; your row on the board scroll → 1; a new listing on phones 2 → 1;
  the Versus board on PC 1 → 0; the language 1 → 2 (a dropdown: a rare choice).

### 5.9 Settings and the trainer menu

- **Settings, PC**: two columns (Game, Play style, Notifications | Language, Cloud backup, Extreme, Content, Delete),
  the whole page in 1440×900. **Phone**: the same groups in one column, the Animation and Theme rows on one line each.
  Language is one dropdown (each option in its own script); Save file and Content merged into one panel; DISCONNECT white
  (reversible), the one red is Delete; SUPPORT ME a quiet row at the end (its home is the trainer menu's foot).
- **The trainer menu**: the card compact (a 64 px look, the name with a pencil, a badge chip, the team's icons; the
  stats behind "Stats ▾", open with More details), 48 px rows, the foot one row of three tiles (Discord, Support me,
  Contact). At 360×640 the main rows fit above the foot.

### 5.10 Title, new game, How to play, the type chart

- **Title**: kept — the audit's cleanest screen (one screen, nothing under 16 px); only its footer links grew to 44 px.
- **New game (the lab)**: Prof. Oak is in the lab's message box (his portrait, his welcome while the balls drop, SKIP
  INTRO beside it), so his separate monologue screen is gone; on PC the lab on the left, the message, card and buttons
  on the right. Taps stay NEW GAME → a ball → PICK → the dice (3): PICK stays because the partner is for good and its
  card is what the choice is made on.
- **How to play**: from 8.3 screens at 390 to 1.3 — the four animated cards swipe sideways in their own box (2×2 from
  640 px), then "All the rules" as seven folded sections, one open at a time, each opening on one to three short lines;
  the full text and tables behind "Every detail". PC: the cards and the rules side by side. The chip nav is gone.
- **The type chart**: two tabs — Pick a type (18 type buttons, the answer as an attack card and a defence card) and the
  chart (36×44 px cells at 16–18 px, scrolling in its own box with its first row and column pinned).

### 5.11 Events

- **One shape** (`StagePanel`): on phones the stage, the panel, and a dock pinned above the tab bar (one red action); from
  1024 px the stage on the left and the panel and dock docked at its right in one frame. INFO became a quiet 48 px
  button with an "i" (it was a 64 px blue block competing with the page's action), everywhere it appears.
- **Fortune Wheel**: tickets as stubs, the jackpot beside them, the wheel sized to the screen; SPIN red in the dock with
  BUY A TICKET and INFO; PC the wheel left, Tickets and Jackpot cards right. INFO is one sheet with the rules and the
  odds (the tip line went into the rules).
- **Raids**: 2.1 → 1.6 screens at 390, 47 → 1 small text. The boss card; the team as three cards (they are the picker's
  button); the group as three seats; "This raid" rules folded; START red in the dock. PC: the raids in two columns with
  the picked one's panel docked (a legendary raid set up in place: 2 taps and a page change → 1 tap). Ball odds, tries
  and hints are More details'. The team picker's candidates are cards.
- **Raid battle**: on PC the stage as large as the window allows and the panel docked at 400 px; on phones the dice,
  actions and team row at the foot.
- **Elite Rebattle**: the gauntlet is a hall — five trainers on the League's carpet, the next one forward and ringed,
  the beaten greyed with a check; the panel holds the next trainer and the medal track; levels and ₽ are More details'.
- **The Underground**: the kits and the pickaxe as the stage, the team, orb bag and plates as the panel, DIG A WALL red
  in the dock; the dig on PC: the wall as tall as the window, the gauge, the buried list and the die docked beside it.
- **Rules**: the wheel, raids, the rebattle and the Underground show their `RulesCard` at the top of their page until
  GOT IT; opening the page no longer counts.

### 5.12 Pop-ups and toasts

See §7.

## 6. Tap counts and the measures, before → after

| Task | Before | After |
|---|---|---|
| Home → dice (wild / trainer) | 1 / 2 | 1 / 2 (GO! is the decision) |
| Between encounters (non-decision taps) | 0 | 0 |
| First ATTACK from Home (loop script, early save) | 8.2 s | 6.6 s |
| Buy a Poké Ball | 3 (Shop, row, BUY) | 2 (the gold, its price) |
| Buy ×5 | 4 | 3 |
| Buy an upgrade | 2 | 2 (the Mart's tab opens on Upgrades while one is affordable) |
| The leaderboard / Versus | 1 / 1 | 1 / 1 (Social) |
| Friends / Trades | 2 (you, the row) | 1–2 (Social, the view) |
| Add a friend | 2 (ADD BY ID, ADD) | 1 (ADD in the page) |
| A Pokémon's details on PC (the lead / the next) | 2 / 2 | 0 / 1 |
| A Pokédex entry on PC (one / the next) | 2 / 2 | 1 / 1 (or an arrow) |
| A modal to dismiss on arriving Home (late save) | 1 | 0 |
| A feature opening (its rules) | 1 forced modal | 0 (a notice; its page's card) |
| The Game Corner with nothing to skip | 1 | 0 |
| Title → first dice | 3 | 3 (PICK kept: the partner is for good) |

| Measure (390×844 unless said) | Before | After |
|---|---|---|
| Text under 16 px, Home / Team / Mart / Pokédex | 11 / 73 / 42 / 328 | 1 / 29 / 1 / 1 (only 14 px tags: "9+", the Box's levels) |
| Pokédex page height (390 / 360) | 5.3 / 9.1 screens | 3.2 / 4.2 |
| How to play (390 / 360) | 8.3 / 11.9 screens | 1.3 / 1.8 |
| Team (late) at 390 / 360 | 2.8 / 4.6 | 2.3 / 3.8 |
| Raids at 390 | 2.1, 47 small texts | 1.6, 1 |
| Content width on PC (Team, Mart, Settings, Friends, the board, Versus) | 672–768 px of 1152 | the whole 1192 px main, in columns or a docked pane |
| axe serious/critical, all toured screens and sizes | 2 (the tab's red dot) | 0 |
| Pop-ups opening on arrival (late save) | Support me | none |
| The battle at 390×844 | ~200 px between the stage and the dice | none: the stage's sky fills it |

## 7. Pop-ups

Today ~28 one-time pop-ups take turns (`PopupQueue`). This pass:

- **Moves to the page** what asks nothing of the player: Support me (its 5th-badge pop-up → a Home notice card), Prof.
  Oak's leaderboard tip and the invite (→ Home notice cards). They stay once-only and keep their "seen" flags.
- **Keeps** the feature rules pop-ups as modals (CLAUDE.md, the user's rule) and the region offer.
- **Rules where they apply** (proposed here, approved by the user on 2026-10-26): a feature with a page of its own shows
  its rules the first time that page opens, as a card at its top (`RulesCard`: the same rows as its pop-up, GOT IT puts
  it away for good, setting the same "seen" flag), and its INFO button afterwards. Home no longer opens under a rules
  modal: the feature's opening is a notice card on Home with a button to its page. Features with no page of their own
  (day and night, the battle powers, a small world's opening, Extreme mode, the push question) and the rules shown at
  their own moment (the portal's and the nightmare's way in, Trick or Treat's first ghost, the gifts', the looks') keep
  their pop-ups.

## 7b. The user's feedback on the preview (2026-10-27)

| Feedback | Done |
|---|---|
| The lab: the Pokémon didn't appear out of its ball | Not reproduced here (dark theme, reduced motion, slow or failed sprites all draw it). Made robust: a sprite whose download failed is asked again, and until the canvas has it the page's own sprite stands on the cradle |
| The fight: your Pokémon didn't appear | In the screenshot it had fainted (0 HP): a K.O.'d Pokémon sinks off its platform, by design |
| The fight: the sky added above the stage was unused room — keep the background as before | The stage is its 3:2 picture again (`StageSky` removed), Trick or Treat's too; the tall phone's small spacer brings the dice towards the thumb as before |
| Team: no scene with the team roaming | Removed: the title, the cards, the Box. (It replaces the brief's "banner with the team roaming" on the Team) |
| Home: the area's banner on top of the scene, as before | The area button stands on the scene's top and opens the Areas sheet; the dock is CONTINUE |
| Home: the team's scene about 70 % | On phones the scene shows 70 % of its height, its window kept on where the team walks |
| Home: the new region's card simpler | The region's picture as the card, "Johto is available", NOT NOW and GO (GO opens the lab) |
| Home: legendary raids in Events, first | Each legendary raid open in the region is its own card, first in Events |
| The trainer menu's pop-ups full width | How to play, the type chart, the Inbox and Contact are sheets |
| The round's strip: thicker, an icon on the Pokémon Centers | 14 px (20 px on the page's gauge), a heart on each Center's segment, met or still to come |
| No self-pressing buttons | Every `AutoButton` (GO!, CATCH/CONTINUE, TRY AGAIN, LET'S GO, an evolution…) and the result's NEXT wait for the tap; they press themselves only while auto-mode or Idle mode plays the area |

### The second round (2026-10-27)

| Feedback | Done |
|---|---|
| The fight: the round's strip hid the top of the foe's plate | The plates (and the matchups pop-up) start under the strip (`--strip` on the stage) |
| The round's gauge should say where you are | The card being played is white on the strip; the next has a white edge on the page's gauge; met gold (green once cleared), the rest grey |
| A Pokémon's sheet: no line under TRADE | Gone; a line stays only when it can't be listed, saying why |
| Home's banner: the round's steps across its width, grey ahead, the levels top right | `RoundGauge banner` under the name, the levels in the top right corner |
| The raid page: no banner over the card, the back on the picture; the Pokémon in the middle | The plate lies on the card; big sprites load at once and move on to the local sprite when a request hangs (`SPRITE_PATIENCE_MS`, the card and the canvas's) |
| The raid page: no book, "This raid" always open | Done; the overhaul's rows ride with the Raids page's INFO |
| Upgrades: the price as a tall column read oddly | The price is a row at the card's foot, as the Buy tab's |

### The third round (2026-10-27)

| Feedback | Done |
|---|---|
| A fight's Pokémon switched between animated and still at each attack | The move moves the page's animated sprites (`LiveSprite`); the canvas draws only what lies on them |
| Inside areas, the top bar: the area's name and its round | `AreaTitle`: the name, "2/3" or a check once cleared |
| The Centers on the gauge, even the one outside the deck; a Center even at full HP | Every round opens with its Center, recorded as the round's first step; the gauge shows it ahead |
| The Center's animation a bit longer, a banner while inside | The full scene at 2.4× (about 2.7 s); `CenterSign` under the strip |
| The friend invite only on the friends list | Off Home; at the top of Friends until ✕ or a share |
| The tab bar: Shop, Team, Home, Pokédex, Social | Done (the PC rail: Home, Shop, Team, Pokédex, Social) |
| Use an item: the Bag's icon | Done |
| Auto-mode in a fight: one button with its states | AUTO-MODE: ON / OFF in the same place; no note and STOP |
| The last Pokémon after a K.O. comes in by itself; the forfeit still a tap away | Sent at once; a pip opens BACK and the flag even with nobody to send |
| Prof. Oak's auto-mode tip: one line | "Auto mode unlocked: you can play completed areas automatically." |
| Trades: INFO out of reach under NEW LISTING | A Social dock's room is at the page's very end (`main:has([data-social-dock])`) |
| PC Home: CONTINUE under the scene, always in sight | The dock under the scene, pinned with it |
| The trainer card: Stats over the team | The row wraps; the team keeps its width |
| Auto-mode changes area on its own | Never: only Idle moves on (and falls back) |
| Stay here looked like a link | A secondary button, the dock's width |
| One check mark | `PixelIcon check`: a rounded green square, a thick white tick |
| A real Pokémon Egg | Black and White's sprite, one map for the Day Care, the hatching and the app icon |
| The Day Care's Egg checks: no toggle, INFO full width | Open at the panel's foot, `InfoButton` under them |

### The fourth round (2026-10-28)

| Feedback | Done |
|---|---|
| On PC, the Center showed the area with the team behind the cards: taller than the window, and unneeded | The Center is stacked on PC too: the healing at the top, then the team and the Box over the page's width, six to a row (`StagePanel stacked`) |
| (The same overflow between encounters) | The scene in the fight's 3:2 box on PC (`SceneStage fill`, its focus on where the team walks); the strip and the plate over the box |
| A find looked skipped: only a toast | A step of its own (`FindView`): the area's ground, the find dropping into the middle (falling, a thud and dust, bounces, a twinkle), its rarity ("Common / Uncommon / Rare find", `findRarity`), what it is and does, PICK IT UP |

## 8. Not in this pass

| Left | Why |
|---|---|
| Two `StagePanel`s (the area's, with no tab bar, and the events') | The same shape, two docks (over the home indicator in an area, over the tab bar elsewhere); one component is the next step |
| A double battle's preview before the fight | Moving it into the fight's send-out needs the run's pair send-out (`store/run.ts`) |
| The Dice Types view on a phone is long (17 cards) | Its cards are one each; a fold by "carried by your team" is the next idea |
| The docked item detail on PC doesn't take the focus or close on Esc | The pane isn't a dialog; a keyboard reaches it by Tab |
| A friend's card keeps its stats grid | Only your own card was made compact |
| The Center on a phone, a small Box: room under it | The user's rule folds the healing away; the scene stays off |
