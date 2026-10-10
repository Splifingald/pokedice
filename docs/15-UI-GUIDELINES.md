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
shadow. Fonts are **Jersey 25** (titles, names, buttons, most text) and **Jersey 15** (labels, numbers, paragraphs).

**Dusk**, the dark theme, is the same lab after sundown: a night-blue ground (`#10172a`), panels a step lighter, pale
ink text and softer slate outlines (`#7d8bb2`) so frames don't glare; red, gold, the HP colours and all the art stay
as they are.

## 2. Colour tokens and themes

Defined once in `src/theme/colors.ts`, exposed as Tailwind colours (`tailwind.config.ts`). Never write a hex in a
component when a token exists; never invent a near-duplicate.

**Two themes** (Settings → Theme: Light, Dark, Auto; unset = Light): **Daybreak** (light) and **Dusk** (dark). The
themed tokens are CSS variables (`--c-ink` …) generated from `THEMES` by a Tailwind plugin; `data-theme="dark"` on
`<html>` switches them (`src/theme/theme.ts`, and a two-line script in `index.html` so a dark page never flashes
light). The pixel frames and the ground texture are redrawn in the theme's colours (`frameSpecs(theme)`).

| Token (Tailwind) | Daybreak | Dusk | Use |
|---|---|---|---|
| `parchment` | `#e9f0f8` | `#10172a` | The page ground (with the dot texture, `dot`) |
| `panel` | `#fbfdff` | `#182139` | Panels, sheets, the top bar |
| `paper` | `#ffffff` | `#1f2944` | Cards on a panel, inputs, white buttons |
| `ink` | `#24304f` | `#e6ecf7` | Text; selected chips and tabs (`bg-ink text-panel`, inverted in Dusk) |
| `edge` | `#24304f` | `#7d8bb2` | Outlines: card rings, frames, `border-edge`, icon outlines. Never text |
| `muted` | `#5c6a8a` | `#a7b2cc` | Secondary text (≥ 4.7:1 / ≥ 5.9:1) |
| `faint` | `#8592ad` | `#6f7c9c` | Placeholders, decoration. **Never text** |
| `shadow` | `#b6c3d9` | `#3e4b6e` | Borders, dashed rules, quiet rings |
| `line` / `lip` | `#dde5f0` / `#dfe7f2` | `#2b3654` / `#151c31` | Empty tracks; a card's bottom lip |
| `well` / `well-deep` | `#f1f4f9` / `#e3e8f0` | `#141b30` / `#283250` | A sunken ground in a card (tiles, empty slots); deeper: locked, unaffordable |
| `sky` / `sky-line` | `#e8f1ff` / `#cfe0fb` | `#1c2a4a` / `#35507e` | The blue tint (trainer card, info) and its rule |
| `cream`, `gold-pale`, `gold-light` | `#fffbea`, `#fff4d6`, `#ffe7a8` | `#28251a`, `#2e2817`, `#7a5a12` | Warm cards (affordable, the lead, a new region); gold tints and lips |
| `sand` / `sand-lip` | `#fff8ec` / `#f3e2c4` | `#2a2520` / `#4a3d2a` | Prof. Oak's notes, the Egg for sale |
| `rose` | `#fff2ef` | `#3a1e24` | The red tint behind a warning |
| `danger` / `danger-light` | `#c4382a` / `#ff8a7a` | `#ff8676` / `#b3352a` | Red **as text**; red text on `bg-ink` |
| `good` / `good-pale` | `#1d6b43` / `#d8f5e4` | `#72dca0` / `#173628` | Positive text and its chip |

The same in both themes: `gold` `#ffbe2e`, `accent` `#f2553f` (white on it 3.4:1), `night` `#24304f` (navy that stays
navy), `crimson` `#c4382a` and `forest` `#1d6b43` (red and green **fills** under white text), `hp-*`, `type-*`
(`DAYBREAK_TYPES`), `st-*` (burn `#f07a2a`, poison `#b04db0`, frozen `#5fc0e0`, paralyze `#f0cc28`, confuse `#ec5f9e`,
heal `#52c052`).

Named shadows (prefer them to an arbitrary `shadow-[…]`): `shadow-ring` (2px edge), `ring-thin`, `ring-line`,
`ring-line-thin`, `card` (ring + lip), `card-gold` (ring + gold ring), `card-gold-lip`, `card-warm` (ring + gold lip),
`field` (an input: ring + top lip), `halo` (outside), `ledge` (2px under).

Rules:

- **A themed colour inside an arbitrary value** is `rgb(var(--c-NAME))` (`shadow-[inset_0_0_0_3px_rgb(var(--c-edge))]`,
  `color-mix(in oklab, ${c} 14%, rgb(var(--c-paper)))` for a tint of a type or status colour). A pale hex tint in a
  component is a bug in Dusk: it becomes a bright patch under light text.
- **Bright fills keep Daybreak's colours for what's on them**: `bg-gold`, `bg-hp-green`, `bg-hp-yellow` and anything
  with `light-scope` bring the light variables back (navy text and outlines). Put `light-scope` on any other bright
  fill (medals, type-coloured cells).
- **Night chips**: a chip that is dark in both themes (the wallet, energy, prices, a hint, the Hall of Fame card) is
  `light-scope bg-night` with `text-gold-light` (or `text-gold`, `text-panel`). Selected tabs and table headers are
  `bg-ink text-panel` and invert in Dusk. Scrims are `bg-night/55`; HP and gauge tracks are `bg-night`.
- **`dark:`** (bound to `data-theme`) is for the rare one-off that needs its own dusk value; tokens come first.
- **Art stays art**: scenes (Home, battle, the lab, painted backgrounds), sprites, dice, badges and trainer pictures
  look the same in both themes. Icons keep their colours, but their navy outline follows `edge`. An uncaught
  Pokémon's silhouette is `var(--silhouette)`: black in Daybreak, pale in Dusk.
- **White text on the bright red needs 24 px or more** (large text, 3:1). Under 24 px a red control uses the deeper red
  (`frame-deep`, `bg-crimson`). `PixelButton` does this by itself, including when a long label shrinks to fit.
- **Type badges** mix the type colour: 32 % into white for the fill, 45 % into deep navy for the text, 75 % into ink
  for the ring (`badgeColors`, OKLab). A test keeps every type at 4.5:1; they are bright chips in both themes.
- **The data's type colours** (`TYPE_COLORS`) belong to the seed and art scripts. The UI draws types with
  `DAYBREAK_TYPES` through `typeColor()`.
- Dark grounds (night): text in `panel`, accents in `gold-light`, focus ring in gold.
- **Tests**: `tests/daybreak.test.ts` keeps Dusk's text at 4.5:1 on every surface and outlines at 3:1;
  `e2e/theme.spec.ts` runs axe colour-contrast on every main screen in Dusk. Check a new screen in both
  (`/kitchen-sink` has the theme switch).

## 3. Type

| Role | Font | Size | Notes |
|---|---|---|---|
| Page title (`h1`) | Jersey 25 | 30–40 px (`text-title`, `text-display`) | One `<h1>` per route |
| Section title | Jersey 25 | 24 px | |
| Body, names | Jersey 25 | 20 px (`text-body`); 17 small; 22 large | |
| Buttons | Jersey 25 | 24 px (md), 18 (sm), 26 (lg), 30 (xl) | Uppercase, 0.04em tracking |
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
| Attacks: one move per type (Flamethrower, Hydro Pump, Razor Leaf, Thunderbolt, Psychic in `attacks.ts`; Tackle, jabs and a fist, gusts and a wing slash, Sludge Bomb, earth spikes, Rock Slide, a swarm and X-Scissor, Shadow Ball, Metal Claw, Ice Beam, Dragon Breath, Dark Pulse and Crunch, Moonblast in `attacks-types.ts`); a generic impact for typeless dice | the typed move | one generic hit |
| Catch | throw, beam, drop, wobbles, result | throw and drop, result at once |
| Pokémon Center | three balls, six-beat jingle | one flash, healed |
| Mega Evolution, Gigantamax | the full change | a white flash and the new sprite |
| Legendary intro, Evolution, Egg hatching, the lab (a partner) | in full | in full |

`calm` (OS reduce motion, or animations off) also removes screen shakes and full-screen flashes; a hit keeps its two
white sprite frames. Every timeline is on `/kitchen-sink/fx` (dev): replay, ¼ speed, one-frame steps, the end state,
your side or the foe's, the cue log. Sounds are named in `src/audio/sfx.ts` (`fxSound`), one per cue.

## 9. Sound

8-bit sounds are synthesised in `src/audio/sfx.ts` (no sample files). Each cue has a name; add new ones there.
The Pokémon cries are Showdown's MP3s, played from its CDN by `src/audio/cries.ts`: in battle as each Pokémon comes
out and when a Mega has its own cry, and from the speaker button on a Pokémon's sheet (`CryButton`, hidden while
sound is off). Details in [docs/13 → Cries](13-SHOWDOWN-SPRITES.md#cries).

**One switch for both**, Settings → Sound (`settings.sound`, read through `soundOn`): on by default, and on for
saves from before it (unset = on). `settings.sfx` is the old effects-only switch, kept in step for older builds; don't
read it. Sound off means no sound and no cry request at all.

## 10. Words and numbers

- **Strings:** `src/i18n/strings.csv` is the only place for text, in all ten columns (en, fr, es, de, it, pt, pt-BR,
  ja, ko, zh-Hans); no empty cell. Use `useT()` / `t()`. Reuse a key when the meaning matches.
- **Numbers:** every number shown (damage, combos, multipliers, status thresholds, catch chance, XP, prices, unlocks)
  comes from the engine's helpers (`src/engine`). The UI never recomputes a rule.

## 11. Web requests

Players shouldn't have to make many requests:

- **Draw in code** whatever can be: frames, the ground texture, icons, badges, Poké Balls, the Egg, and the stand-in
  area scenes and battle background (the painted area pictures, below, replace them where they exist). They cost no
  request at all.
- **Atlases** for sets of small pictures: the Pokémon menu icons (`src/assets/pokemon-icons.png`), the trainers (one
  sheet per region), the item icons (`src/assets/item-icons.png`, rebuilt by `pnpm item-sprites` when items change).
  One request, cached for a year (hashed Vite assets).
- **Menu icons draw at 1.5× the size asked** (`MiniSprite`): they read too small at their nominal size, so the
  component scales them everywhere; callers keep passing the nominal size.
- **Grids use icons, not sprites**: the Box and the Pokédex show menu icons from the atlas (a 151-entry Pokédex costs
  one request). Showdown's animated sprites are for the places where one Pokémon is the subject: team cards, a
  Pokémon's sheet, the scene.
- **Pokémon sprites** come from Pokémon Showdown's CDN: one request per sprite actually shown, cached by the browser;
  never a request for a view Showdown doesn't have (`src/data/showdown-sprites.json`); only the current area's fronts
  are preloaded.
- **Cries** come from Showdown's CDN too: one request per cry actually played (~9 KB), cached by the browser; never
  preloaded, never one for a cry Showdown doesn't have (a form without its own plays its species'), none while sound
  is off.
- Fonts are subset by unicode range; only Jersey 25 (latin) is preloaded.
- Before adding an image file, ask whether code can draw it, or whether it belongs in an atlas.
- **Area pictures** (`public/area-art/<id>.png`): one painted picture per *scene* (87 shared scenes, lairs and
  landmarks for 295 areas), 400 px of true pixel art (Gemini, then `unpixel`), as the Visual Lab's Backgrounds tab
  composed them: **one picture, three uses**. Home shows the whole scene; lists show a strip cut around its horizon
  (`AreaStrip`); the battle shows its middle 240 × 160 with the two zones drawn on top, translucent. The files are used
  exactly as unpixel wrote them (PNG, ~22 KB): never resized, re-encoded or resampled to 288 or 240 on screen — they
  are laid over their box at their own resolution, nearest-neighbour (`artPlacement`).
  - **Code, not data**: the area → picture map is `src/fx/areaArtMap.ts`, keyed by area id (areas can come from the
    remote config; `bannerUrl` and the database don't decide it), with each picture's measurements in scene pixels:
    the horizon, the box the team walks in, and a pond only where the picture clearly has water to swim in. A
    picture with no clear horizon has `horizon: null`: lists cut its middle and the battle takes its bottom.
  - **Loaded when seen**: Home and the battle load the current area's picture; a strip loads its picture once it
    scrolls into view, is cut once and kept. A list costs one request per distinct picture on screen, never one per
    card.
  - **Nothing jumps**: the code-drawn scene stands in while a picture loads, when it fails, and for areas without one.
    The team's ground comes from the picture's measurements from the start, a strip keeps the same shape, and the
    picture steps in over the stand-in.
  - **Adding one**: a new area needs its line in `areaArtMap.ts`; a new picture needs measuring. `tests/area-art.test.ts`
    checks every area has a picture, every picture a file 400 px wide, and lists the ones still to make.

## 12. Navigation, Home and stages

- **Top bar** (`Header` in `src/components/Hud.tsx`): energy on the left; on the right the gold as a navy pill (a tap
  opens the Poké Mart, no "+"), the cup (→ the leaderboard; greyed until the first badge, and a tap says what opens
  it) and, last, you (name and badge count, then your trainer look → the trainer menu, which slides in from that side).
  Everything in it is disabled mid-fight and says why.
- **Tab bar** (phones): Poké Mart, Upgrades, **Home** (in the middle, under the thumb: a tab like the others, its Poké Ball icon and label), Team,
  Pokédex. The side nav (desktop) has the same entries with Home first. A tab's hit area is the whole column, at
  least 60 px tall, even where the drawing is smaller.
- **Region cards** (Areas sheet → regions): each region's own picture (`public/region-art/<id>.png`, from the Visual
  Lab's region prompts; its first area's strip until it has one), name, counts and GO. A tap moves there and closes
  the sheet.
- **Area screen**: its title opens the area's details (the same sheet as Home's plate, without the travel footer).
- **Pokémon Center**: the healing scene (a Poké Ball per team member) at phone size (420 px at most on wide screens), then Home or **Next
  encounter**, so a run through an area never needs a trip Home.
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

- **Stage** (`BattleStage`): 240×160 art pixels, scaled. The background is the area's picture (its middle 240 × 160,
  the horizon halfway down) with two translucent zones on its ground; Versus and areas without a picture keep the
  Daybreak background drawn in code, with its platforms. The two Pokémon are the page's animated sprites (foe front,
  yours from the back), and while a move, a form change or an entrance plays, its timeline's canvas takes over the
  stage. Over a picture the timelines draw no background of their own (`setArtUnderStage`), so the picture stays put
  under every move. Plates sit on the stage: the foe's
  top left (name, level, types, HP as a bar only, status, a trainer's party as small red squares), yours bottom right
  (level, HP with numbers, status). MEGA / G-MAX tags join the plate when the form changes.
- **The log drives everything** (`useBattleAnimator`): each entry is a step; a hit is a *scene* the stage plays, and
  the HP waits for the timeline's `contact` cue before it drains. Entrances hold the log after its opening line.
  When animations are off, every step lands at once and no scene plays.
- **Panel**, top to bottom, each part keeping its height so nothing jumps: the message box (two lines; "Tap dice to
  throw them again." is added on your turn), the dice tray (your dice up to 54 px and never under 44, lifted with a
  red outline when picked, the combo's dice in a gold ring; the foe's dice smaller, not buttons), the readout (combo
  chip or "No combo", the damage alone and big — a button: the math, `(sum + bonus) × mult = damage`, shows once,
  under the readout — how effective it is, a `StatusChip` per status face, lit once its threshold is met), the extras (Mega, G-MAX, Type,
  Run) only when they exist, the actions (REROLL with its count, ATTACK in red; SKIP TURN when stunned; the AUTO note
  with STOP, none in Versus), then the Bag, the team pips and the history.
- **Auto battles** (auto-mode, Versus) play at the `short` motion level unless animations are off (`MotionCap`).
  Auto-mode is switched in the area (under its header), never from Home.
- **Team pips**: menu icon + an HP bar, the one in battle ringed in gold, fainted ones grey. Tapping one switches
  (it costs the turn; the dialog also holds Forfeit). After a K.O. the message asks "Choose your next Pokémon",
  the pips that can go out pulse (two steps, not a glide; still when the OS asks for reduced motion), and the actions
  become a list right under the stage: each Pokémon that can go out with its level, HP, types and dice, then Forfeit.
- **The Bag** is a `Sheet`: every item usable in battle with what it does and how many you have; one that can't help
  anyone is greyed. One item a turn, and it doesn't end the turn.
- **The catch happens on the stage**: the worn-out foe stays on its platform, greyed; the panel shows a radio group
  of balls (each with its chance from `catchChance`, how many you have, "not needed" when a weaker one is already
  certain), the catch math (`d6 + bonus ≥ need`), and one throw. The catch timeline plays; the die and the
  result show together on `catchResult`, never before (the die would spoil the wobbles). A throw that can't miss has
  no die.
- **Result cards** rise from the bottom over the panel on every screen size, wild and trainer fights alike, the stage
  still in view: XP per Pokémon, the catch (NEW when
  the species is new to the Pokédex), "Wild battles pay no ₽" when that is why no money came; **Home** and **Next
  encounter** (what Home's CONTINUE would start). Between a trainer's Pokémon, the card shows the trainer and the
  sprite of the one about to come out. Versus ends on its own card in the panel: Victory / Defeat and Back to
  Versus — once a fight is done, it's done (no rematch).
- **Versus** plays on auto, to its end: no skip.
- **The stage draws the forms the log has reached** (`Fx.dex`), not the state's: a Gigantamax still attacks as
  itself (the revert comes after), and a trainer's Mega shows only once its scene has played. Mega Evolution and
  Gigantamax play 1.6× faster in battle than drawn in the Visual Lab.

## 15. Day Care and Eggs

- **Residents** are cards: the animated sprite, the name (READY in green once the stay is full), "Lv.20 → Lv.22",
  the stay's XP bar (blue, green when full) and one muted line: "18 of 200 XP · +1 XP in 8 min · full in 30 h 18".
  TAKE BACK is the card's own button (red once it is ready); what happened is said in a toast (XP and levels gained,
  back in the team or in the Box).
- **An empty slot** is a dashed button with a blue +: "Leave a Pokémon / From your team or your Box". It opens a
  sheet with a search: the team first (TEAM tag), then the Box, lowest level first; a Pokémon that can't stay is
  greyed with the reason (your last team member, still a fossil).
- **The Egg card**: gold when the free Egg waits ("1 FREE" by the heading), cream otherwise; two facts as small tags
  (hatches at Lv.N, how many species you're missing and their odds, from `eggOdds`), and one button: Take the Egg,
  Buy · ₽50, or "Need ₽x more" (focusable, explains in a toast).
- **Hatching** is full screen (`useHoldFullscreen`): the hatching timeline, the message box, Skip; then what hatched
  (NEW when it's new to the Pokédex), where it went, Done and Another · ₽50 when you can afford one.

## 16. Versus and the boards

- **Screens reached from Home** (Day Care, Versus, the leaderboard) put a back chevron before their title
  (`PageHead onBack`); the tab bar stays.
- **Ranked rows** (`BoardRow`): the rank (gold, silver and bronze squares for 1–3, `RankMedal`), the trainer's look
  (the `TrainerLook` crop, the same crop everywhere a trainer appears), the name with a gold "you" tag, their team as
  menu icons (`TeamIcons`, one atlas), the value at the end. Your row is gold-ringed. A row can carry a line under
  the team (Versus: how many of their Pokémon your team hits super effectively, green at 2+, red at 0) and an action
  in place of the value (FIGHT, or a green Beaten tag that says when you can fight them again).
- **Versus locked**: what opens it, a meter n/3, and the three Pokémon closest to Lv.50 with how many levels to go
  (`versusClosest`). Unlocked: tabs Opponents (with the count still to beat) / My team / Leaderboard; Opponents has
  your team strip with Change, a search by trainer *or* Pokémon and To beat / Beaten / All chips with counts. My team
  shows three numbered slots ("Lv.72 → 50") over the eligible list (order badges 1–3), then Clear and Save team.
- **The leaderboard**: the region's name as the head's count; four tabs that are icons, only the open one spelling
  out its name (four names don't fit a phone in every language); a gold card with your look, the board's one-line
  note and "You're #N of M" (tap: your row scrolls into view and blinks) or "You're in the Hall of Fame"; a navy
  **Hall of Fame** button with the crown, how many maxed the board out and their faces, opening a sheet with the
  board's `ui.board.hallBody.*` text and their rows (a crown in place of the rank). Locked until the first badge.

## 17. The trainer card and the menu

- **The avatar opens the trainer card** (the drawer, titled "Trainer card"): a blue-framed card with "TRAINER CARD"
  and an ID number, your look at 2×, your name with Change, then Money, Pokédex, Best level, Areas, Shinies and your
  Versus record (or Locked) as a dotted list, and your team's icons with levels.
- **Badge case** per region reached (`regionCases`), on a friend's card only (yours is the count on the top bar): a navy case, each badge 12×12 pixel art at 3× (`BadgeIcon`:
  Kanto's are the lab's maps, other regions use the same shapes in their own colours), then the **crown**
  (`CrownIcon`) for clearing the region's last area. Unearned ones are grey at 40 % and their label says "not earned
  yet".
- **Look**: "How other trainers see you…" with Change opening a radio grid of every look, in one block (no region headings); picking one closes it. The same
  crop (`TrainerLook`) is used wherever a trainer appears.
- **The menu** under the card: rows with an icon tile, a label and a one-line description (Leaderboard, Versus with
  "0/3 at Lv.50" while locked, Settings, How to play, Type chart, Admin for admins, Cloud backup, Connect). The label
  alone names a row; the description is its `aria-describedby`.

## 18. Picking a partner (the lab)

- **One moment for every partner** (`PartnerMoment`): a new game and every new region open the professor's lab full
  screen (`useHoldFullscreen`), on top of whatever opened it (a `useDialog`, so Tab stays in and Esc answers it
  first). The lab is the lab picture (`moment-lab.png`), with "WELCOME TO" and the region on a ribbon; if it hasn't
  loaded with the sprites (1.5 s at most), the code-drawn lab in the region's colours (`labColors`) takes its place
  for the whole moment. Either way the balls rest on that lab's own cradles (`starterSeats`, measured on the picture).
- **The drop**: three Poké Balls fall onto the table, one after another (`starter.drop`, `starter.land`); a tap on the
  stage lands them at once. Then "Choose your partner! Tap a Poké Ball."
- **The balls are the buttons**: three transparent buttons over the balls ("Poké Ball 2 of 3"); hover or focus lifts
  one. Opening one lets its Pokémon out (`starter.open`) and asks "Do you want to pick Charmander?" in the message
  box, with a card under it: its types, what it hits hard, what hits it hard, its dice and rerolls at the starting
  level. Not this one puts it back; another ball swaps it.
- **Yes**: the partner hops with hearts, the other two balls sink away (`starter.fanfare`), "Charmander is your
  partner! Your Kanto journey begins." and one wide button, Let's go!, which starts the game or the region.
- **Leaving**: a new region has ✕ (Not now) and Esc; a new game has nothing to go back to. With motion `off` the balls
  are already on the table.

