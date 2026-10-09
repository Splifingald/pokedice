# Pokédice — UI guidelines (Johto Daybreak)

The rules every screen follows. They describe the **Johto Daybreak** look chosen in the Visual Lab
(`design/visual-lab/`) and how it is built in `src/`. When you add or change UI, follow this page; when a rule here no
longer fits, change the rule here first, then the code.

The game's engine and data decide every rule and number shown. The UI only presents them (see "Numbers" below).

---

## 1. The look in one paragraph

A pale morning sky (`#e9f0f8`, a faint dot texture) under crisp pixel-art frames with **ink outlines** (`#24304f`),
white paper panels, **one red action** per screen (`#f2553f`) and **gold for what's new** (`#ffbe2e`). Everything is
drawn on a pixel grid: square corners cut by a 1–3 pixel stair, never `border-radius`, never blur, never a soft
shadow. Fonts are **Jersey 20** (titles, names, buttons, most text) and **Jersey 15** (labels, numbers, paragraphs).

## 2. Colour tokens

Defined once in `src/theme/colors.ts`, exposed as Tailwind colours (`tailwind.config.ts`). Never write a hex in a
component when a token exists; never invent a near-duplicate.

| Token (Tailwind) | Value | Use | Contrast |
|---|---|---|---|
| `parchment` | `#e9f0f8` | The page ground (with the dot texture) | — |
| `panel` | `#fbfdff` | Panels, sheets, the top bar | — |
| `paper` | `#ffffff` | Cards on a panel, inputs, white buttons | — |
| `ink` | `#24304f` | Text, outlines, selected chips and tabs | 11:1 on panel |
| `muted` | `#5c6a8a` | Secondary text | 5.1:1 panel, 4.7:1 ground |
| `faint` | `#8592ad` | Placeholders, decoration. **Never text** | 3.1:1 |
| `shadow` | `#b6c3d9` | Borders, dashed rules, quiet rings | — |
| `line` / `lip` | `#dde5f0` / `#dfe7f2` | Empty tracks, a card's bottom lip | — |
| `accent` | `#f2553f` | The primary action, the current place, alerts | white on it: 3.4:1 |
| `danger` | `#c4382a` | Red **as text**, and small red controls | 5.2:1 panel, white on it 5.3:1 |
| `danger-light` | `#ff8a7a` | Red as text on ink | 5.7:1 |
| `gold` (`-light`, `-pale`) | `#ffbe2e` (`#ffe7a8`, `#fff4d6`) | New, the lead, combos, rewards | ink on gold 8.9:1 |
| `good` / `good-pale` | `#1d6b43` / `#d8f5e4` | Positive text (bonus, cleared) and its chip | 6.5:1 |
| `hp-green` / `hp-yellow` / `hp-red` / `hp-trail` | `#34c97a` / `#ffbe2e` / `#ff5a4a` / `#ffb3a8` | HP above 50 %, above 20 %, below; the trail of the last hit | — |
| `type-*` | `DAYBREAK_TYPES` | Dice fills, swatches | — |
| `st-*` | burn `#f07a2a`, poison `#b04db0`, frozen `#5fc0e0`, paralyze `#f0cc28`, confuse `#ec5f9e`, heal `#52c052` | Status rings, chips | — |

Rules:

- **White text on the bright red needs 24 px or more** (large text, 3:1). Under 24 px a red control uses the deeper red
  (`frame-deep`, `bg-danger`). `PixelButton` does this by itself, including when a long label shrinks to fit.
- **Type badges** mix the type colour: 32 % into white for the fill, 45 % into deep navy for the text, 75 % into ink
  for the ring (`badgeColors`, OKLab). A test keeps every type at 4.5:1.
- **The data's type colours** (`TYPE_COLORS`) belong to the seed and art scripts. The UI draws types with
  `DAYBREAK_TYPES` through `typeColor()`.
- Dark grounds (ink): text in `panel`, accents in `gold-light`, focus ring in gold.

## 3. Type

| Role | Font | Size | Notes |
|---|---|---|---|
| Page title (`h1`) | Jersey 20 | 30–40 px (`text-title`, `text-display`) | One `<h1>` per route |
| Section title | Jersey 20 | 24 px | |
| Body, names | Jersey 20 | 20 px (`text-body`); 17 small; 22 large | |
| Buttons | Jersey 20 | 24 px (md), 18 (sm), 26 (lg), 30 (xl) | Uppercase, 0.04em tracking |
| Labels, numbers, captions | Jersey 15 (`font-pixel-sm`) | 15 px (`text-label`) | `tabular-nums` for counters |
| Paragraphs (2+ lines) | Jersey 15 (`.copy`) | 20 px, line-height 1.35 | |

- Floor: **no text under 12 px** on any game screen.
- Only the Jersey faces ship (plus the Fusion Pixel CJK subsets). `e2e/layout.spec.ts` fails on any other font.
- CJK: the font stack ends in `var(--font-cjk)`, which follows the element's `lang`. After editing a ja, ko or zh-Hans
  string, run `pnpm i18n:fonts`.
- Strings are never uppercased in the CSV just for looks; buttons uppercase themselves.

## 4. Pixels, shapes and frames

- **The pixel scale is 2 CSS px per art pixel.** Outlines are 2 px, lips 4 px, shadows drop 4 px, all on whole pixels.
- **Frames** (`src/theme/frames.ts` → `src/styles/pixel.css`): every panel, dialogue box and button is a 14×14 pixel
  drawing used as a 9-slice `border-image`, drawn at 2 × devicePixelRatio and redrawn when the ratio changes. The
  middle of the drawing is empty: the element's own `background-color` fills it, so `bg-*` utilities still recolour a
  frame, and contrast checkers see a real background.

  | Class | Drawing | For |
  |---|---|---|
  | `.pixel-panel` | ink outline, highlight, lip, dithered shadow | Panels |
  | `.pixel-panel-dark` | ink fill | Rare dark blocks |
  | `.pixel-dialogue` | outline + an inner pale-blue ring | Messages, narration |
  | `.pixel-btn` (+ `frame-primary` / `frame-deep` / `frame-gold` / `frame-green` / `frame-dark`) | outline, highlight, a 2-row lip, shadow | Buttons |
  | `.hatched`, any disabled `.pixel-btn` | dotted outline, `#eef2f8` fill, muted text | Unavailable |

- **Pressed:** a button moves down 4 px onto its shadow and its frame drops the shadow (`--fr-*-down`).
- **Plates and cards** are flatter: `.pixel-plate` (a 2 px ink ring, a 4 px lip, clipped corners, slightly see-through
  paper over a scene) and `shadow-card` (a 2 px ink ring + lip, for list items on a panel).
- **Clipped corners** (`.pixel-corners`) for chips, pills, tracks and badges.
- Circles only where the thing is round: the avatar, a status badge on a die, the Home ball in the tab bar.

## 5. Components

All live in `src/components/`. Every component, in every state, is on `/kitchen-sink` (dev only): add yours there.

| Component | When | States |
|---|---|---|
| `PixelButton` | Any action | `primary` (red, the one main action), `secondary` (white), `gold` (one new thing to open: a new region, an Egg), `success` (green: collect), `danger` (destructive, red), `ghost`, `dark`; sizes `sm` (44 px on phones), `md`, `lg` (56 px), `xl` (72 px, the big CTA); disabled. `.sheen` adds the passing light on a CTA |
| `Panel` | A block of content | light, dark, dialogue; optional title row |
| `Dialogue` | Narration, battle messages | Typewriter text (tap to finish), blinking ▼; two lines tall so nothing jumps |
| `Chip` | A short label | `plain`, `gold`, `green` (ready), `done` (cleared), `red` (where you are), `blue` (open), `lock`, `dark` |
| `NewTag`, `LevelTag` | NEW, "Lv.36" | |
| `StatusChip` / `StatusIcons` | A status | Icon + short name (BRN, PAR…) + counter, ring in the status colour; `lit=false` before its threshold. **Status is never colour alone** |
| `Seg` | Two to four views of one thing (tabs) | `tabs` → `role=tablist`; otherwise a radio group. Counts after labels. Arrow keys move |
| `FilterChips` | Narrowing a list | A radio group with counts; scrolls sideways when it runs out of room |
| `SearchField` | Searching a list | 44 px, an ink ring, a top lip, a screen-reader label |
| `Sheet` | Anything opened from a screen: details, lists, pickers | Phones: from the bottom, grab handle, ✕, 90 % tall at most, `head` (filters) pinned, body scrolls, `footer` pinned. Desktop: a centred panel |
| `Modal` | A short decision or message | Centred framed panel; `dismissable={false}` for a choice that must be made |
| `SidePanel` | The trainer menu drawer | From the right |
| `HpBar` | HP | Track with ink ring; the fill drains over 700 ms, the trail waits 280 ms then follows over 900 ms; numbers for your own, words for a foe's (screen readers) |
| `TypeBadge`, `TypeSwatch` | A type | `md` 20 px, `sm` 16 px (plates) |
| `Die` | A die face | Square corners; pips on whole pixels (`pipLayout`: one even pip size, three fixed columns) at any size; ink pips on light dice, white on dark; status face = white + status ring and a round badge with its icon; `selected` = lifted 6 px with a red outline; `combo` = a gold ring; values without a pip layout show their number |
| `PageHead` / `Wallet` | A tab's title row | Tab icon, the one `<h1>` (`as="h2"` where the page has its own), a count ("3/3", "81/151") or the gold as a navy plate |
| `SheetSection` | A titled block inside a sheet | 22 px heading, a muted hint on the same row, extra controls |
| `MonTile` / `TileTag` | A grid of Pokémon (Box, Pokédex) | Menu icon from the atlas, number, name, a line under it; `missing` = grey tile + silhouette; corner tags NEW (gold) and Nearby (green). `TILE_GRID` = ~84 px columns |
| `FaceDice` / `StatusLines` | What a die does | Its six faces as real dice, value under each; a status face keeps its ring and badge and gets its short name in a chip. One tinted line per status: when it triggers and what it does, with the live numbers (`statusEffects`) |
| `ItemSprite` | An item's picture | From the item atlas (one request); falls back to the item's own URL for items added since the atlas was built |
| `PixelIcon` | Every icon | Pixel maps in `icons.tsx` (8×8, 12×12 and the 16×16 tab-bar set `nav*`), drawn as SVG rects. One shared palette (`ICON_PALETTE`); a map may have its own (`OWN_PALETTE`) |

Dialog behaviour (`src/lib/useDialog.ts`, used by `Modal`, `Sheet`, `SidePanel`): focus moves in, **Tab stays inside**,
**Esc closes the top dialog only**, focus returns to what opened it.

## 6. Layout

- Phone first, from **360 px**. Nothing scrolls sideways at 360, 375, 768 or 1280 (`e2e/layout.spec.ts`).
- Page gutter 12 px; gaps 8–12 px between cards; a panel's padding 12 px.
- **Tap targets ≥ 44 px on phones** (inline links in a sentence excepted). From 768 px, tighter sizes are allowed.
- One `<h1>` per route; headings in order; landmarks (`main`, `nav`).
- **One primary (red) action per screen**, in thumb reach on phones. Gold appears at most once, for something new.
- Lists of things you can open are buttons (whole card), with a keyboard path to every action inside them.
- Full-screen moments (the battle, a hatching) hide the tab bar and the top bar.
- From 768 px the side nav takes ~210 px, so the content is only ~550 px wide: **side-by-side columns start at
  1024 px** (`lg:`), not at `md:`.

## 7. Accessibility

- Contrast: text 4.5:1 (3:1 from 24 px). Check with the table above; axe runs in `pnpm e2e` and fails on serious or
  critical issues.
- Focus ring: 3 px ink, 2 px offset (gold on ink).
- Never colour alone: statuses carry words, states carry a word or an icon (READY, NEW, a lock with its reason).
- Disabled things say why, in words, next to them.
- Live text (battle messages, toasts) is in an `aria-live` region. Canvases have a `role="img"` and a label, and
  anything you can do on a canvas also exists as a button.
- Arrow keys in radio groups and tab lists; Enter/Space on everything else.

## 8. Motion

How much the game animates comes from one place, `src/lib/motion.ts`:

| Level | Who sets it | What plays |
|---|---|---|
| `full` | Default | Everything |
| `short` | The player (Settings → Animations), or the OS "reduce motion" | A hit is one generic impact (no typed attack); Mega Evolution and Gigantamax are a white flash and the new sprite; a catch is the throw with its result at once; a quick Pokémon Center. Evolutions, Eggs hatching and encounters (legendary and trainer intros) still play in full |
| `off` | Admins only (Settings → No animations) | Nothing animates: every timeline jumps to its end state, its messages kept |

`calm` (the OS setting, or `off`): no screen shake, no flashing, the Home team stands still.

House rules for every effect and timeline:

- Anticipation before every release; a 3–5 frame **hit-stop** on contact.
- A hit flashes **two white silhouette frames**, never an opacity blink.
- Light and smoke are **ordered-dithered**, never blurred; particles step through a fixed colour ramp.
- **No screen flash faster than 3 a second.**
- Timelines run at **60 fixed steps a second** and fire their cues (message, HP, status, form…) at exact times.
- Durations: a button press 60 ms in 2 steps; a sheet rises in 220 ms; HP 700 ms / 280 ms / 900 ms; dice tumble 600 ms.
- Pixel motion steps (`steps()`), it doesn't glide, except HP bars and sheets.

**Timelines** (`src/fx`, no React): a timeline is `setup / step / draw / cues` on a 240×160 stage. A screen plays one
with `<StageCanvas timeline ready hud onEnd label>`: it waits for the sprites (`loadSprite`, at most 1.5 s), plays at
60 fixed steps a second, and sends the cues to the `hud` (`contact` when a hit lands, `status`, `show`, `heal`,
`form`, `catchResult`, `beat`). Timelines never decide words: the screen phrases each cue from strings.csv. With
motion `off` the stage jumps to the end and still fires every cue, so the screen ends up in the same state.

| Timeline | full | short |
|---|---|---|
| Attacks (Flamethrower, Hydro Pump, Razor Leaf, Thunderbolt, Psychic; a generic impact in the type's colour for the rest) | the typed move | one generic hit |
| Catch | throw, beam, drop, wobbles, result | throw and drop, result at once |
| Pokémon Center | three balls, six-beat jingle | one flash, healed |
| Mega Evolution, Gigantamax | the full change | a white flash and the new sprite |
| Legendary intro, Evolution, Egg hatching | in full | in full |

`calm` (OS reduce motion, or animations off) also removes screen shakes and full-screen flashes; a hit keeps its two
white sprite frames. Every timeline is on `/kitchen-sink/fx` (dev): replay, ¼ speed, one-frame steps, the end state,
your side or the foe's, the cue log. Sounds are named in `src/audio/sfx.ts` (`fxSound`), one per cue.

## 9. Sound

8-bit sounds are synthesised in `src/audio/sfx.ts` (no sample files). Each cue has a name; add new ones there.
Sound is off by default and always respects `settings.sfx`.

## 10. Words and numbers

- **Strings:** `src/i18n/strings.csv` is the only place for text, in all ten columns (en, fr, es, de, it, pt, pt-BR,
  ja, ko, zh-Hans); no empty cell. Use `useT()` / `t()`. Reuse a key when the meaning matches.
- **Numbers:** every number shown (damage, combos, multipliers, status thresholds, catch chance, XP, prices, unlocks)
  comes from the engine's helpers (`src/engine`). The UI never recomputes a rule.

## 11. Web requests

Players shouldn't have to make many requests:

- **Draw in code** whatever can be: frames, the ground texture, icons, badges, Poké Balls, the Egg, area scenes and
  battle backgrounds. They cost no request at all.
- **Atlases** for sets of small pictures: the Pokémon menu icons (`src/assets/pokemon-icons.png`), the trainers (one
  sheet per region), the item icons (`src/assets/item-icons.png`, rebuilt by `pnpm item-sprites` when items change).
  One request, cached for a year (hashed Vite assets).
- **Grids use icons, not sprites**: the Box and the Pokédex show menu icons from the atlas (a 151-entry Pokédex costs
  one request). Showdown's animated sprites are for the places where one Pokémon is the subject: team cards, a
  Pokémon's sheet, the scene.
- **Pokémon sprites** come from Pokémon Showdown's CDN: one request per sprite actually shown, cached by the browser;
  never a request for a view Showdown doesn't have (`src/data/showdown-sprites.json`); only the current area's fronts
  are preloaded.
- Fonts are subset by unicode range; only Jersey 20 (latin) is preloaded.
- Before adding an image file, ask whether code can draw it, or whether it belongs in an atlas.

## 12. Navigation, Home and stages

- **Top bar** (`Header` in `src/components/Hud.tsx`): you (trainer look, name, badges → the trainer menu), energy, gold
  as a navy pill whose red "+" opens the Poké Mart, and the cup (→ the leaderboard; greyed until the first badge, and a
  tap says what opens it). Everything in it is disabled mid-fight and says why.
- **Tab bar** (phones): Poké Mart, Upgrades, **Home** (a raised Poké Ball in the middle, under the thumb), Team,
  Pokédex. The side nav (desktop) has the same entries with Home first. A tab's hit area is the whole column, at
  least 60 px tall, even where the drawing is smaller.
- **Dots only for something you can act on**: the number of upgrades you can afford (9+ at most), a gold NEW for
  Pokédex entries you haven't looked at. The dot is in the link's accessible name, never colour alone.
- **Home is the area hub** (`/home`; `/map` redirects there): the area's scene with your team roaming in it, the area
  plate (name, levels, rounds, caught → the area's details), AREAS (the area list, its search also finds Pokémon,
  filters and the Regions view in the same sheet) and one big CONTINUE whose second line says what comes next
  (round n of m, the gym leader, the legend, a new region). The encounter itself plays on `/area`; an idle `/area`
  goes back Home, and Home stays lit in the menus while it plays.
- Home's widgets show what's next (the next secret, the Day Care, Versus, events) and are buttons when they lead
  somewhere; a locked one says what opens it and how far you are.
- **Stages** (a canvas scene: Home, the battle, a hatching) are a background canvas, the Pokémon as DOM `<img>`s
  (Showdown's animated sprites, no extra request) and an effects canvas on top. A stage root is its own stacking
  context (`isolate`), so its internal z-indexes never rise above sheets and dialogs. The canvas has `role="img"` and a
  label; whatever you can tap on it (a Pokémon) also exists as a button in a hidden list.

## 13. Lists, sheets and buying

- **A Pokémon's sheet** (`SheetModal`, a `Sheet`): the title is the name, the line under it says number · level · where
  it is (Lead, Team slot 2, In the Box). The footer holds what you can do: Make lead and Use an item for a team member,
  the Center rule (with a lock) and Use an item for one in the Box. Use an item opens a list in the same sheet, with
  Back. The body leads with what matters now: HP and XP, Speed / Rerolls / Catch value, every die as real dice, then
  **What's next** (milestones still ahead, the next one tagged NEXT, each with how close it is); milestones already
  reached fold away under a summary.
- **Explain, don't hide**: something that can't be used right now stays listed, greyed, with the reason in words
  ("Already full", "Fainted: needs a Revive", "Needs a Pokémon with 4+ dice", "6 badges"). Buttons you can't afford
  stay focusable (`aria-disabled`) and say what's missing ("need ₽14"); a tap explains in a toast.
- **Reordering**: drag a card onto another to swap them (pointer events, 8 px before a press becomes a drag; a tap
  still opens the card). Every drag has a button twin for keyboards and screen readers (Make lead).
- **Shelves** (the Poké Mart): one row open at a time; an open row shows the description, a ×1 / ×5 / ×10 segmented
  picker and one button that names the total ("Buy ₽500") or what's missing ("Need ₽40 more"). Category chips put the
  most-used group first (Balls). What isn't sold yet waits under "Coming later" with what it waits for.
- **Search resets filters**: typing in a search shows everything that matches (the Pokédex's filter goes back to All).
  A Pokédex number finds any entry; a name only finds what has been caught.
- **Grey plates** (`#e3e8f0`, `#f1f4f9`) take ink text: muted grey on them is under 4.5:1.

## 14. The battle

The battle (`src/screens/battle/BattleView.tsx`) is **full screen**: `useHoldFullscreen()` puts the top bar, the side
nav and the tab bar away while it is mounted. It must fit a 360×640 phone with nothing to scroll
(`e2e/layout.spec.ts`). On desktop the column is at most 560 px wide (narrower on short screens, so the actions stay
in view) and the battle history sits beside it from 1024 px.

- **Stage** (`BattleStage`): 240×160 art pixels, scaled. The Daybreak background is drawn in code (no image), the two
  Pokémon are the page's animated sprites on their platforms (foe front, yours from the back), and while a move, a
  form change or an entrance plays, its timeline's canvas takes over the stage. Plates sit on the stage: the foe's
  top left (name, level, types, HP as a bar only, status, a trainer's party as small red squares), yours bottom right
  (level, HP with numbers, status). MEGA / G-MAX tags join the plate when the form changes.
- **The log drives everything** (`useBattleAnimator`): each entry is a step; a hit is a *scene* the stage plays, and
  the HP waits for the timeline's `contact` cue before it drains. Entrances hold the log after its opening line.
  When animations are off, every step lands at once and no scene plays.
- **Panel**, top to bottom, each part keeping its height so nothing jumps: the message box (two lines; "Tap dice to
  throw them again." is added on your turn), the dice tray (your dice up to 54 px and never under 44, lifted with a
  red outline when picked, the combo's dice in a gold ring; the foe's dice smaller, not buttons), the readout (combo
  chip or "No combo", `(sum + bonus) × mult = damage` with the damage big — a button for the breakdown — how
  effective it is, a `StatusChip` per status face, lit once its threshold is met), the extras (Mega, G-MAX, Type,
  Run) only when they exist, the actions (REROLL with its count, ATTACK in red; SKIP TURN when stunned; the AUTO note
  with STOP or SKIP ▸▸), then the Bag, the team pips and the history.
- **Team pips**: menu icon + an HP bar, the one in battle ringed in gold, fainted ones grey. Tapping one switches
  (it costs the turn; the dialog also holds Forfeit). After a K.O. the message asks "Choose your next Pokémon" and
  the pips that can go out pulse (two steps, not a glide; still when the OS asks for reduced motion).
- **The Bag** is a `Sheet`: every item usable in battle with what it does and how many you have; one that can't help
  anyone is greyed. One item a turn, and it doesn't end the turn.
- **The catch happens on the stage**: the worn-out foe stays on its platform, greyed; the panel shows a radio group
  of balls (each with its chance from `catchChance`, how many you have, "not needed" when a weaker one is already
  certain), the catch math (`d6 + bonus ≥ need`), and one throw. The catch timeline plays; the die shows on its
  `roll` beat and the result on `catchResult`. A throw that can't miss has no die.
- **Result cards** rise from the bottom over the panel, the stage still in view: XP per Pokémon, the catch (NEW when
  the species is new to the Pokédex), "Wild battles pay no ₽" when that is why no money came; **Home** and **Next
  encounter** (what Home's CONTINUE would start). Versus ends on its own card in the panel: Victory / Defeat,
  Rematch, Back to Versus.
- **Versus** plays on auto; SKIP ▸▸ only fast-forwards the replay, since the result was recorded before it started.
