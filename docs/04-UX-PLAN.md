# Pokédice — Readability & Accessibility Pass

Audit of the game UI on 14 Sep 2026 (v1.3 content), and the plan to fix what it found.

**Status.** Phases 1 and 2 shipped on 14 Sep 2026. Re-running the same 46 captures: **0 axe violations of any rule**,
colour contrast included (was 1,577 serious nodes), and **no text under 12px on any game screen** (was 4.4px).

- Phase 1: ARIA names, landmarks and one `<h1>` per route, heading order, static dice as images (starter screen: 36
  undersized targets → 0), ink/gold focus ring.
- Phase 2: text-safe `muted` (#554d6a), darker `danger` (#a8341f), `good` (#2f6b36) and `danger-light` (#ea7a5e, on ink)
  tokens; type badges and chart headers get a per-type fill computed to clear 4.5:1 (`badgeColors` in `theme/util.ts`);
  12px floor; Atkinson Hyperlegible Next (self-hosted) for paragraphs via `.copy`; type-coloured pips replace the
  3-letter dice chips; status-die corner values only on dice ≥ 40px, as an ink-on-panel chip; disabled = hatched +
  dashed at full text contrast (`.hatched`), with the reason where there is one ("need 120 more" on Upgrades).

**Method.** 23 screens and states, each captured at 1280×800 (desktop) and 375×812 (phone): 46 captures, using a fresh
save and a mid-game save (6 areas cleared, 2 badges, a gym due). Every capture was scanned with axe-core (WCAG 2.1 A/AA +
best practice) and measured for rendered text under 14px, interactive targets under 44×44px and horizontal overflow.

| Figure | Value |
|---|---|
| Captures | 46 (23 screens × 2 viewports) |
| axe rules failed | 12 distinct rules, 1,577 "serious" nodes |
| Low-contrast text | 637 nodes on 40 of 46 captures |
| Horizontal overflow at 375px | none |

## What already works — keep it

- Reduced motion is honoured (in-game setting and OS); sound is off by default.
- Battle keyboard shortcuts (1–6, R, Space) and an `aria-live` battle message.
- HP is shown as a bar **and** numbers; nothing scrolls sideways on a phone.
- The gym preview is the clearest screen in the game: one title, one reward, one team, one action. Use it as the reference.

## Findings

Priority: **P1** fix first (blocks people or fails WCAG AA widely) · **P2** next · **P3** polish.

### Contrast & colour

| P | Finding | Evidence | Fix |
|---|---|---|---|
| P1 | Type badges fail text contrast (WCAG 1.4.3) | Light text on mid-tone type colours: Fire `#f7f2e0` on `#ca6e29` = 3.24:1, others 3.3–3.8:1 at 14px | Choose badge text by best measured ratio; darken each type's *badge* shade until ≥ 4.5:1 (dice keep the brighter colour, ≥ 3:1) |
| P1 | Secondary text on parchment ≈ 4.2:1 | `shadow` `#6b6480` used as text on `#e8e0c8` everywhere | Add a text-only `muted` token `#554d6a` (5.9:1); keep `#6b6480` for borders and shadows |
| P2 | Disabled = 45 % opacity | Disabled buttons and locked areas drop below 3:1 and read as broken (Potion at full HP) | Disabled pattern (dashed border, hatched fill) + the reason in words ("Full HP") |
| P2 | Focus ring nearly invisible (2.4.7, 1.4.11) | Gold dashed outline on parchment ≈ 1.6:1 | 3px ink outline with a gold inner ring |

### Type

| P | Finding | Evidence | Fix |
|---|---|---|---|
| P1 | Text far below readable sizes | Under 14px on 21 of 23 screens; smallest 4.4px (die numerals in Upgrades). Dice chips 6.6–9px, die corner values 4–5px, Pokédex numbers 10px (151 per page), XP counters 10px | Floor of 12px for numerals/labels, 16px for body; replace 3-letter die chips with type-coloured pips plus one legend |
| P2 | One pixel face for everything | Jersey 25 carries multi-line prose (Help is 4,919px tall on a phone; Setup; descriptions) | Body face for paragraphs of 2+ lines (Atkinson Hyperlegible Next); Jersey 25 stays for headings, buttons, numbers ≥ 18px |

### Touch targets

| P | Finding | Evidence | Fix |
|---|---|---|---|
| P1 | HUD controls under 44px on every in-game phone screen | Nav 36×28, help 31×32, sound 34×42, logo link 97×24, area link 91×18 | Bottom tab bar on phones (48px, icon + label); top row = area, gold, help, sound at 44px |
| P2 | Static dice exposed as buttons | 22×22 disabled `<button>`s in starter cards / sheets (36 on the starter screen) | Render non-interactive dice as `<span role="img">` |
| P3 | Small secondary controls | Team ▲▼ 32px, Help section links 28px | 44px hit areas |

### Semantics & ARIA

| P | Finding | Evidence | Fix |
|---|---|---|---|
| P1 | `aria-label` on plain spans (4.1.2) | 868 nodes: type-chart cells, upgrade pips | Real (visually hidden) text in cells; pips as one `role="img"` "Level 3 of 10" |
| P1 | Unnamed meters and dialogs | HUD gauge meter has an empty name on 16 captures; untitled modals (starter confirm, help) | `aria-label="Area gauge 280 of 280"`; `aria-labelledby` on the modal title |
| P2 | Landmarks & headings (1.3.1, 2.4.6) | No `<main>`/`<h1>` on title, intro, help, setup, battle; Help jumps h1 → h3; Map puts `div`s between `<ol>` and `<li>` (44 nodes) | Page shell with `<main>` and one `<h1>`; `motion.li`; h2 in Help |
| P3 | Small leftovers | Setup code blocks not keyboard-scrollable; empty admin table header | `tabindex="0"` + label; name the actions column |

### Layout & hierarchy

| P | Finding | Evidence | Fix |
|---|---|---|---|
| P1 | The Map is a 6,685px scroll at mid-game | Every one of 25 areas is a full card; locked areas are faded but still show full detail | "Next up" card for the current area; cleared areas as one-line rows (name · badge · rewards ×0.5); locked areas as a compact list; secrets as a strip; header "Area 7 of 22 · 2/8 badges" |
| P2 | Pokédex is 5,425px on a phone and ambiguous | Loading checkerboards look like "missing"; caught-but-evolved species say "seen" | Silhouette placeholder for uncaught; skeleton only while loading; correct "caught" label; dense list mode; jump by 25 |
| P2 | Team actions float away from their Pokémon | "Info" / "Potion" buttons sit below the list | Actions inside each card; disabled Potion states why |
| P2 | Battle controls compete on phones | Six controls; REROLL disabled with no reason | Primary row ROLL/ATTACK + REROLL; ITEM/SWITCH/RUN on one quieter row; hint "Tap dice to pick them for a reroll" |
| P3 | Help is one long scroll on phones | Chart cells 28px wide | Section tabs; lookup first; full chart behind "Show full chart" |

## The plan

1. **Semantics & quick wins — ~1 day.** All ARIA fixes above, landmarks and `<h1>`s, modal names, Map list structure,
   static dice, new focus ring. *Done when* axe reports 0 serious nodes on all 46 captures except colour contrast.
2. **Contrast & type system — 2–3 days.** Text-safe tokens (`muted`, per-type badge shades), 12px floor, body face,
   die-chip redesign, disabled pattern. *Done when* colour-contrast = 0 and no rendered text under 12px outside admin.
3. **Layout for scale — 3–5 days.** Condensed Map, phone tab bar, Team card actions, Pokédex modes, battle control
   grouping, Help tabs. *Done when* the mid-game Map fits in 3 phone screens and every game tap target is ≥ 44px.
4. **Keep it fixed — ~1 day.** axe in the Playwright suite (fail on serious/critical), a contrast unit test over every
   type-colour pair, captures at 360 / 375 / 768 / 1280, one NVDA + VoiceOver pass on new game → first win.

## Definition of done

| Metric | Audit | After phase 1 | After phase 2 | Target |
|---|---|---|---|---|
| axe serious nodes (46 captures) | 1,577 | 639 (all colour contrast) | **0** | 0 |
| Smallest rendered text (game screens) | 4.4px | 4.4px | **12px** (paragraphs 16px) | ≥ 12px (body ≥ 16px) |
| Phone tap targets under 44px (HUD, per screen) | 7 | 7 | 7 | 0 |
| Mid-game Map height, desktop | 6,685px | 6,685px | 6,685px | ≤ 2,400px |
| Focus indicator contrast | ≈ 1.6:1 | ≈ 12:1 (ink) · ≈ 8:1 gold on dark panels | unchanged | ≥ 3:1 |

The admin panel is desktop-first and was measured but not prioritised; it gets phases 1–2 only.

## v1.6 review — touch & density (15 Sep 2026)

A second review after the v1.6 rework (published as the “Pokédice v1.6 Review” artifact) replaced phases 3–4 above.
**All four of its phases shipped on 15 Sep 2026:**

1. **Touch & wording** — 44px controls on phones (`PixelButton` sm/md grow below 768px; top bar 44px; sound moved to
   Settings), dice sized by how many are thrown (44–64px), 48px REROLL / ATTACK, AVOID for trainers, “Pokémon Center”
   everywhere, one Pokédollar pill.
2. **Phone density** — Poké Mart rows by category with ×1/×5/×10; Map cards stack on phones and locked areas are one-line
   rows; the Pokémon Center has a sticky CONTINUE and sheet-based team actions; Pokédex search, #001…#126 jump bar and a
   “catchable now” filter.
3. **Between fights** — a team HP strip on the area screen (tap to heal), the gym waiting at the end of the gauge, “a
   Pokémon Center within N encounters” (never the deck's contents); tap-to-advance victory cards with a SKIP button;
   “Make lead” and Box sort/search; a “why?” damage chip; the save file under an Advanced fold; Help chips and the full
   type chart behind a toggle.
4. **Keep it fixed** — `e2e/layout.spec.ts`: 7 game screens at 360×640, 375×812, 768×1024 and 1280×900 must not scroll
   sideways, phone controls must be ≥ 44px (inline links exempt), axe (WCAG 2 A/AA) must report no serious/critical
   issue, and a battle must fit 360×640 without scrolling. It runs in `pnpm e2e` and passes.
