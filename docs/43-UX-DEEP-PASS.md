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
Phone tab bar:       Team · Mart · ( Home ) · Pokédex · Social
PC rail (left):      Home · Team · Mart · Pokédex · Social
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

### 5.2 Home

- **Before**: the scene with its plate (name, levels, rounds, caught), a CONTINUE bar with AREAS, squares under
  headings; a Support me modal on arrival for a late save.
- **After, phone**: the scene; under it the sections as rows; the PLAY dock pinned at the bottom (CONTINUE with what comes
  next, and the area button with its name and round pips, which opens the Areas sheet). The plate's details are the
  area button's (no second plate on the scene). Notices (Oak's tips, Support me, an invite) are a card above the
  sections, dismissable.
- **After, PC**: the scene as tall as the window on the left; on the right the PLAY dock first, then the sections.
- **Removed**: the plate over the scene (duplicated the area button and the Areas sheet), the Support me / leaderboard /
  invite modals. **Merged**: the area details into the Areas sheet's first view.

### 5.3 The area loop

- **Before**: on tall phones a ~200 px gap between the stage and the dice; on PC the stage and a 380 px panel (docs/42).
- **After, phone**: the stage grows with the screen: the area's picture is shown taller than the 240×160 grid (sky above,
  ground below; the code-drawn background extends its own sky and ground), the fight's grid fixed in its middle, so the
  dice sit right under it, in the thumb's reach. The fight's switch modal (`SwitchRow` rows) becomes the send-out's
  cards. The team row at the foot is the pips on every screen (PC's rows went: the same panel, docs/42).
- **After, PC**: unchanged in shape (docs/42 already made it a layout); keyboard: 1–6 dice, R reroll, Space attack, and now
  B the Bag, S switch, Esc closes, shown discreetly with More details.
- **Kept**: the send-out (the user's decision), the result's auto-advance, the Center's wait.

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

### 5.5 Mart (with Upgrades)

- **Before**: two tabs; the Mart's rows open then BUY (3 taps from Home); effect lines at 13 px; gold shown twice.
- **After**: one Mart: Buy · Upgrades · Bag. A price is the purchase (×1, one tap); a long press or the item's details
  give ×5 / ×10. No page gold (the top bar's). PC: the shelf in four columns, the Bag docked at the right.

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

- **Before**: the yard, the egg bar, slots, the friends' connect panel, Egg checks, a big blue INFO.
- **After**: `StageView` — the yard on top (PC: left), the panel with the egg bar, your two slots and friends' (PC: right).
  Egg checks fold under More details; INFO is the panel's foot button, small.

### 5.8 Social

- **Before**: four pages in three places.
- **After**: one tab, four views (Leaderboard, Versus, Friends, Trades) with a `Seg` at the top on phones and a left list
  on PC, each view laid out over the width (the board and your card side by side).

### 5.9 Settings and the trainer menu

- **Before**: one 672 px column of panels; the drawer of nine rows.
- **After, PC**: Settings in two columns (Game and Language | Cloud, Save, Content); phone: unchanged order, 16 px floor.
  The drawer: the card, then about-you rows, then help, then the foot (Discord, Contact, Support me).

### 5.10 Title, new game, How to play

- **Title**: kept (the audit's cleanest screen); the logo's tagline 16 px.
- **How to play**: 8.3 screens of text become the four animated cards and the rules as collapsed sections (one open at a
  time): 1.6 screens.

### 5.11 Events

The wheel, raids, the rebattle, the Underground, Trick or Treat, the portal and the nightmare keep their screens; their
pages adopt the shell's floor (16 px), and their PC pages use `StageView` where they have a stage (the wheel, the dig).

### 5.12 Pop-ups and toasts

See §7.

## 6. Tap counts

| Task | Before | After |
|---|---|---|
| Home → dice (wild) | 1 | 1 |
| Home → dice (trainer) | 2 (CONTINUE, GO!) | 2 (GO! is the decision) |
| Between encounters (non-decision taps) | 0 | 0 |
| Buy a Poké Ball | 3 (Shop, row, BUY) | 2 (Mart, its price) |
| Buy an upgrade | 2 | 2 |
| Leaderboard | 1 (cup) | 1 (Social) |
| Friends | 3 (you, Friends) — 2 | 1 (Social, Friends) |
| Trades | 2 (you, Trades) | 2 (Social, Trades) |
| Versus | 1 (its square, once open) | 1 |
| A Pokémon's details (PC) | 2 (Team, the card) | 1 (Team: the lead is open) |
| Settings | 2 | 2 |

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

## 8. Not in this pass

Listed in the PR with each screen's before/after; anything left is written here as it is found.
