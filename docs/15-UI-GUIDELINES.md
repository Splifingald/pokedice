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

**Two themes** (Settings → Theme: Light, Dark, Auto): **Daybreak** (light) and **Dusk** (dark). A new player follows
the device (Auto, `DEFAULT_SETTINGS`); stored settings without a theme (a player from before) stay Light, so nobody's
look changes under them. The themed tokens are CSS variables (`--c-ink` …) generated from `THEMES` by a Tailwind plugin;
`data-theme="dark"` on `<html>` switches them (`src/theme/theme.ts`, and a short script in `index.html` so a dark page
never flashes light: the theme last shown, or on a first visit the device's). The pixel frames and the ground texture
are redrawn in the theme's colours (`frameSpecs(theme)`).

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
| `rich` | `#8a5a00` | `#ffbe2e` | A golden name ("I am just rich", §23): 4.5:1 on every surface in both themes |

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
- **A scope** redraws the same tokens for one part of a page, whatever the player's theme: `.dw-scope`, Distortion
  World's violet night (`SCOPES.distortion` in `colors.ts`; its frames drawn by `frameCss` on `.dw-scope`, like Dusk's),
  on Giratina's area raid's page, pop-ups and fight (§27); `.nm-scope`, the nightmare's moonlit night
  (`SCOPES.nightmare`), on Darkrai's area raid's (§29). Bright fills inside them keep Daybreak's navy, as at dusk;
  `tests/daybreak.test.ts` holds their text to 4.5:1 and their outlines to 3:1.
- **Tests**: `tests/daybreak.test.ts` keeps Dusk's text at 4.5:1 on every surface and outlines at 3:1;
  `e2e/theme.spec.ts` runs axe colour-contrast on every main screen in Dusk. Check a new screen in both
  (`/kitchen-sink` has the theme switch).

## 3. Type

| Role | Font | Size | Notes |
|---|---|---|---|
| Page title (`h1`) | Jersey 25 | 30–40 px (`text-title`, `text-display`) | One `<h1>` per route |
| Section title | Jersey 25 | 24 px | |
| Body, names | Jersey 25 | 20 px (`text-body`); 18 small; 22 large | |
| Buttons | Jersey 25 | 24 px (md), 18 (sm), 26 (lg), 30 (xl) | Uppercase, 0.04em tracking |
| Labels, numbers, captions | Jersey 15 (`font-pixel-sm`) | 16 px (`text-label`) | `tabular-nums` for counters |
| Tags (NEW, a count on a tab) | Jersey 15 | 14 px (`text-tag`) | Never a sentence |
| Paragraphs (2+ lines) | Jersey 15 (`.copy`) | 20 px, line-height 1.35 | |

- Floor (docs/43 §4): **no text under 16 px** on any game screen, tags excepted (14 px); body text 18 px or more.
  Tailwind's own `text-xs` and `text-sm` are 16 px and `text-base` 18 px here, so no stray class goes under the floor.
  A grey caption that only repeats what's beside it goes rather than grows.
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
- **One Egg** (the user's call, 2026-10-27): the games' own (Black and White's, 28×30, `components/eggMap.ts`) in the
  Day Care, its hatching, the pop-ups and the app icon; never one drawn for the game.
- **One check mark** (the user's call, 2026-10-27): `PixelIcon name="check"`, a rounded green square with a thick white
  tick, the same in both themes; never a text ✓ (a gauge's cleared round, a gem held, a picked card).

## 5. Components

All live in `src/components/`. Every component, in every state, is on `/kitchen-sink` (dev only): add yours there.

| Component | When | States |
|---|---|---|
| `PixelButton` | Any action | `primary` (red, the one main action), `secondary` (white), `gold` (one new thing to open: a new region, an Egg), `success` (green: collect), `danger` (destructive, red), `ghost`, `dark`; sizes `sm` (44 px on phones), `md`, `lg` (56 px), `xl` (72 px, the big CTA); disabled; **shut** (`shut={reason}`: a lock such as a fight under way; drawn as disabled but focusable, `aria-disabled`, the reason after its name and in its title, a tap says it in a toast and does nothing else). `.sheen` adds the passing light on a CTA. **A press is felt as the finger lands** (docs/38 §5): the pressed look (`data-down`, as `:active`), the blip and, on `primary`, the haptic come on `pointerdown`; the action waits for the click, so a press that becomes a scroll does nothing; a keyboard's click plays the blip itself. With haptics on, a `primary` `type="button"` on an iPhone wears an invisible native switch over itself (`HapticSwitch`: `aria-hidden`, not focusable) for iOS's system tap |
| `Panel` | A block of content | light, dark, dialogue; optional title row |
| `Dialogue` | Narration, battle messages | Typewriter text (tap to finish), blinking ▼; two lines tall so nothing jumps |
| `Chip` | A short label | `plain`, `gold`, `green` (ready), `done` (cleared), `red` (where you are), `blue` (open), `lock`, `dark` |
| `NewTag`, `LevelTag` | NEW, "Lv.36" | |
| `StatusChip` / `StatusIcons` | A status | Icon + short name (BRN, PAR…) + counter (Burn's stacks, a Freeze's or a Paralysis's chance short of sure, a confusion's ×2 / ×3, a heal's +HP, turns left), ring in the status colour; `lit=false` greys one that won't land. **Status is never colour alone** |
| `Seg` | Two to four views of one thing (tabs) | `tabs` → `role=tablist`; otherwise a radio group. Counts after labels. Arrow keys move |
| `FilterChips` | Narrowing a list | A radio group with counts; scrolls sideways when it runs out of room |
| `SearchField` | Searching a list | 44 px, an ink ring, a top lip, a screen-reader label. The search ignores case and Latin accents (`searchFold`: "evoli" finds Évoli) |
| `TypeSelect` | Narrowing a list of Pokémon to one type (the Box, Versus's picks, the raid team's picks) | One dropdown, "All types" first, only the types the list holds; the picked type's colour beside it |
| `RecommendedThumb` | A Pokémon worth bringing to a raid (`raidRecommended`, docs/18 §3) | The green `thumbUp`, titled "Recommended": inline after a name, or `overlay` on a sprite's bottom-right corner (12 px on 32 px minis) |
| `SortSelect` | Ordering a list of Pokémon from a dropdown (the raid team's picks: Recommended, Highest level, Pokédex No., Name A–Z) | `TypeSelect`'s dropdown with the given options and a screen-reader label; the two share a row, wrapping on a narrow phone |
| `Sheet` | Anything opened from a screen: details, lists, pickers | Phones: from the bottom, grab handle, ✕, 90 % tall at most, `head` (filters) pinned, body scrolls, `footer` pinned. Desktop: a centred panel |
| `Modal` | A short decision or message | Centred framed panel; `dismissable={false}` for a choice that must be made |
| `SidePanel` | The trainer menu drawer | From the right |
| `SettingsOverlay` | Settings opened from the trainer menu under a lock (mid-fight, a portal run: §12) | A `Modal` titled Settings over the page: mid-fight a line saying the fight waits, Settings' panels with what would end the fight shut, BACK TO THE FIGHT pinned at its bottom (BACK under a portal run's lock alone); SUPPORT ME white, as on the page |
| `HpBar` | HP | Track with ink ring; the fill drains over 700 ms, the trail waits 280 ms then follows over 900 ms; numbers for your own, words for a foe's (screen readers) |
| `TypeBadge`, `TypeSwatch` | A type | `md` 20 px, `sm` 16 px (plates) |
| `Die` | A die face | Square corners; pips on whole pixels (`pipLayout`: one even pip size, three fixed columns) at any size; ink pips on light dice, white on dark; status face = white + status ring and a round badge with its icon; `selected` = lifted 6 px with a red outline and a ↻ tag on its top-left corner; `combo` = a gold ring and gold corner brackets (a shape each, never colour alone), with the game feel on its tier's ring (`tier`, docs/38); every ring is a `box-shadow` on the die's body, never a chain of `drop-shadow` filters (a GPU pass each, which froze phones, docs/38 F2b); its wrapper stays flat, never `preserve-3d` (with no filter to flatten it, phones left a landed die undrawn until tapped); `squash` (the last die of a throw down), `jitter` (a pick before the last reroll); `onLand` once it is down; values without a pip layout (0, 7, 8…) show their number, centred on the face; with a `rollKey` it tumbles in, or, with the dice throws on (docs/37), is thrown in as a pixel cube and lands on its face (`useDieThrow`; on `/kitchen-sink` at every motion level, frozen mid-throw) |
| `PageHead` / `Wallet` | A tab's title row | Tab icon, the one `<h1>` (`as="h2"` where the page has its own), a count ("3/3", "81/151") or the gold as a navy plate |
| `SheetSection` | A titled block inside a sheet | 22 px heading, a muted hint on the same row, extra controls |
| `NicknameButton` / `NicknameModal` | Giving one of your Pokémon a nickname (its sheet's title) | The name and a pencil, 44 px tall on phones; the dialog with the field (empty: the species as placeholder; named: selected), the 0/12 counter, the trade line only where trades exist, Cancel / SAVE (§13) |
| `PokeCard` | The one card for a team member everywhere (Team, send-out, Center, between encounters, K.O. switch; docs/43 §4) | `lead` (gold crown tag, said "Lead: sent out first"), `selected` (gold outline: picked, or shown in a docked sheet), fainted (hatched), resting after a K.O. (`KoTag`), a fossil reviving (its gauge), shiny (star), `xp` (a thin XP line under the HP, the Team), `brief`, `label`, `buttonProps` (drag handlers), `className` (a drop target's dashed red outline) |
| `DexTile` / `DexGridList` / `DexGauge` / `DexCompleteCard` / `DexSheet` / `Fold` | The Pokédex and its Shiny and Unown views (docs/43 §5.6) | A dense tile (~64 px phones, ~76 px PC): uncaught = the silhouette alone (number and "Not caught yet" for screen readers only), caught = icon + name (16 px, "…"), NEW gold tag, Nearby as a green word in an uncaught tile's empty line or a map tag on a named one, the shiny star, picked = gold ring + `aria-current`. The grid is one Tab stop; arrows by tile and row, Home/End. The gauge sits in the page head, once. The entry: hero (sprite, types, cry), where to find it, evolutions both ways, "Dice and stats" folded (`Fold`, open with More details) |
| `StagePanel` / `EventDock` / `TicketsMeter` | The events' pages (docs/43 §5.11) | The stage on top and the dock pinned above the tab bar on phones; from 1024 px the stage left (sticky) and the panel and dock docked right in one frame. `TicketsMeter`: tickets as stubs (missing ones dimmed), `role=img` "n of cap tickets" |
| `StageSky` / `Stamp` / `KeyHints` / `SwitchStep` / `ForfeitButton flag` | The area loop (docs/43 §5.3) | `StageSky`: the sky over a fight's grid (Daybreak drawn, the area picture's rows, night, distortion). `Stamp`: a result's moment (big: three held steps from 2×, two white frames, a stepped ring, confetti; small: one step; short: one step; calm/off: at rest). `KeyHints`: the keys at the panel's foot on PC. `SwitchStep`: the send-out's cards for a turn's switch (BACK, GO!, the flag) and a K.O.'s (GO!, the flag). `ForfeitButton flag`: a 56 px flag named FORFEIT |
| `ItemTile` / `PriceButton` / `PricePlate` / `ItemDetail` / `QtyRow` / `QtyButton` / `DetailButton` | An item anywhere in the Mart (docs/43 §5.5) | Price (affordable, short, a sale struck), plates (sold out, held, sell +₽, can't sell, what it waits for), open, disabled, locked, the count's hop, the coin flight |
| `SmallInfo` | A panel's INFO, small and quiet | The same name as the big INFO |
| `GuestTile` | A friend's Pokémon at the Day Care, one line | Send back a 44 px ✕ |
| `BoxFilter` | The Box's one Sort & filter control | A button beside the search (a gold count of what is set). Phones: a bottom sheet with the order (`Seg`) and the type (a radio grid of named swatches), SHOW n and Clear filters. From 768 px: a panel under the button (focus on the current choice, Esc and a click outside close it). A pick applies at once |
| `MonTile` / `TileTag` | A grid of Pokémon (the Box) | Menu icon from the atlas, number, name (16 px), a line under it; `level` (a navy 14 px corner tag, top right); `selected` (gold outline, `aria-current`); `missing` = grey tile + silhouette; corner tags NEW (gold) and Nearby (green). `TILE_GRID` = ~84 px columns |
| `GoldCard` / `CoinFlight` / `XpBar` (`useXpFill`) / `Confetti` / `DexRegisteredCard` / `UpCard` | The rewards' game feel (docs/38 §4) | The gold counting up from 0; its coins flying to the top bar's gold (`data-hud-gold`; playing, none when calm or off); the XP bar in steps (filling, the level-up's white frame, rolled over); the pixel confetti (playing, frozen on frames); a species' first catch registered in the Pokédex; the Upgrades' buttons (navy, the best buy gold with its chip) and a purchase's pop frame by frame (`frozenPop`) |
| `FaceDice` / `StatusLines` | What a die does | Its six faces as real dice, value under each; a status face keeps its ring and badge and gets its short name in a chip. One tinted line per status: when it triggers and what it does, with the live numbers (`statusEffects`) |
| `ItemSprite` | An item's picture | From the item atlas (one request); falls back to the item's own URL for items added since the atlas was built |
| `PixelIcon` | Every icon | Pixel maps drawn as SVG rects: the Pokémon ones hand-drawn in `icons.tsx` (balls, Pokédex, badges, status symbols, the battle Bag's backpack), the generic UI ones (coin, heart, shop, trophy, settings…) from the "1-bit Pixel Icons" pack, recoloured into `packIcons.ts` by `scripts/import-icons.ts` (11–16 px squares; the tab bar's on 16×16). Draw them at 12 px or more. One shared palette (`ICON_PALETTE`); a map may have its own (`OWN_PALETTE`) |
| `TrainerName` / `NameIn` | Another trainer's name anywhere social (§24) | Plain; golden (`rich`: the `rich` token, a sparkle that twinkles, a stepped glint, still under reduced motion). Inline, so `truncate` around it still ends in "…". `NameIn` puts it in a translated sentence ("Misty's"), only the name golden |
| `RulesModal` / `InfoButton` | A feature's rules: once when it unlocks, then from the blue INFO button at the bottom of its page | The special events' pop-up: its picture as a banner (`RulesBanner`), or a banner drawn in code (the gifts'), a NOW OPEN tag on the unlock, 2–4 `RuleList` rows (an icon, a short title, a line with the config's numbers, optionally a small button under it); Later and Let's go! on the unlock, OK from INFO. The Day Care and Versus use it (`FeatureRules.tsx`); the events have their own copies (`EventUnlockPopup`, `EventInfo`), with the same words. INFO is a quiet 48 px button on the sky tint with a blue "i" mark (`.ev-info`), never a competing block; `compact` when it shares a dock row. `RulesCard`: the rules at the top of a feature's page the first time (§20) |
| `ContinueButton` / `StayHere` / `ComingUpView` / `LeaderboardTipModal` | Home (§12, docs/38 §6) | The big button: CONTINUE (the play arrow), a challenge waiting (the sword), greyed out (a tap says why), GO TO {area} behind in the region (the map) with Stay here, a 44 px link, under it; the "Coming up" line for the Day Care, the special events, Versus and a secret area (a level, the Pokédex); Prof. Oak's leaderboard tip with Later (✕ and Later end it for good) and SEE THE LEADERBOARD (`HomeBits`) |
| `RotateCover` / `RotateView` | A phone held sideways (§6) | Over everything, not dismissable: the pixel phone tipping upright in steps (upright and still under reduced motion), the title and a line |
| `ToastStack` / `ToastCard` | A short word on what just happened, or why something didn't (§7) | On `<body>`, beside the dialogs: under the top bar on phones, at the bottom on desktop; four at most. Info (panel) and good (green): a tap closes them, they go after 4 s or 1.2 s + 70 ms a character, waiting while touched, hovered or focused. Error (red): a ✕ (44 px), stays until closed |
| `DiceLogo` | The title with the game feel on (docs/38 §9) | The word POKÉDICE as eight pixel-art dice on a canvas (`role="img"`, named Pokédice, inside the `<h1>`): thrown in and landing crooked on their letters (full), dropped in (short), two-step drops (calm), at rest (off); two rows under 768 px, one from 768; the white flash, the gold rings, the tagline; a tap throws it again. Off: the wordmark and its five dice |
| `HowToPlay` / `ButtonLook` | How to play's animated cards (§17, docs/38 §8b), with the Game feel on | Four `figure`s (throw the dice, reroll, deal damage, catch), each a scene drawn with the battle's own pieces on a 280 × 224 stage, an `h3` and a line: looping (full motion), a still of its key moment with PLAY (calm: it plays once), PLAY showing the end (animations off). `ButtonLook`: a picture of a `PixelButton` (same frame, label fit, pressed look) in a span, for a scene with nothing to press |
| `PageLoading` | A page split out of the main bundle loading (`Lazy` in `App.tsx`) | A Poké Ball drawn in code wobbling in pixel steps (`steps()`), still under calm; "Loading…" for screen readers (`role="status"`) |
| `SupportModal` / `SupportView` | SUPPORT ME (side menu, Settings), and once per region at its 5th badge | A rules pop-up (the village banner) with a button per row: Join the Discord (left out with no link set), Share invite link, Support me on Ko-fi under the line saying Pokémon is a licence so the game is never for sale; a big OK |
| `GiftPresent` / `GiftOpened` / `GiftResult` / `GiftMoment` | A gift from the developer (§23) | Under a message: the wrapped gift (wobbling, still when the OS asks for reduced motion), "3 things inside" and what happens next (close the message, OPEN IT in My messages, or why it waits); opened: what it held; the opening, full screen; what arrived and where |
| `TrickGauge` / `TrickStage` / `NeedDie` / `TrickScreen` / `TrickPlate` / `TrickRecap` / `TrickCard` / `TierChip` / `TrickSprite` / `TrickRulesModal` | Trick or Treat (§28) | The gauge: its value in numbers ("62/100") with what the last Treat or miss added (a gold "+18" that pops in; the added stretch flashes white twice once filled), its sections each in a colour of its own (red for a 6, the hardest, then orange, yellow, green and teal as it gets easier; lilac where no roll can) with a dark line between two, the flee zone striped night with a ghost, bright up to its value and as a pastel past it, the section it is in ringed in gold, the white post where it stands, and under each section the die a Trick Ball needs on a chip of the section's colour (`NeedDie`: the `Die` face with its "+", the face alone where a section is narrow; the current one ringed in gold), then Flees; a `meter`. The stage: the battle's (the area's picture as the battle cuts it, a night sky where there's none), the ghost at its centre floating in pixel steps (still when calm), its shadow, the timelines on top; at rest the ball on the ground (caught) or nobody (fled). The screen in every state (idle, after a Treat, a Treat and a throw playing, a miss, a flee, caught), the plate, the result card (caught: the battle's `CatchCard` with the Trick Ball, NEW, ✦ Shiny, where it went, a secret area; fled), the preview card, the rarity chip (a word, never colour alone), the two pictures, the rules |
| `InviteGaugeBar` / `InviteRewardsCard` / `InviteGaugeCompact` / `InviteReadyModal` | Friend invite rewards (§25) | The gauge: a tile per tier (its reward; gold with the gift wobbling when ready; green with a check once opened), the gold track, the friends each needs; six tiers fit a phone. The Friends page's card (ready with OPEN IT, asking the server, every reward won); the compact one in Prof. Oak's invite; the reward's pop-up (who won their first badge, or a friend) |
| `PortalArt` / `PortalScene` / `PortalEntry` / `DistortionGauge` / `DistortionChoiceView` / `ExtraDie` / `ItemCycle` / `BoonConfirm` / `PortalCloseFx` / `RunBonuses` / `PortalVictoryView` / `GlitchSprite` / `DistortionFx` / `useUiGlitch` | Distortion World's portal run (§27) | The portal and the Distortion World on the pixel engine (turning; still); the breach (playing; held at its end, "Tap to continue ▼") and its pop-up over that end (TEAM / NOT NOW / READY!), back from TEAM (the pop-up at once), the pop-up on its own; the gauge of portals closed (fresh, under way, won); a distortion's boons (three, fewer), their icons (an extra die with its "+", a rare item turning through its items, still), a boon's confirm pop-up (BACK / CONFIRM); a portal closing; the run's bonuses (none, some); the victory (HEAL & START RAID over the green BACK TO THE WORLD); the screen's distortion; a distorted sprite at each motion level (full, short, off); the UI's glitch on a few pieces |
| `PortalRaidBanner` / `PortalRaidCard` (`RaidCard portal`) / `RaidStageArt` / `DistortionGround` / `StageTear` / `RaidNpcPicker portal` / `BattleStage world="distortion"` | Giratina's area raid (§27) | The raid page in the violet night (`.dw-scope`): the portal banner with its plate, the card open and caught, the lock, START, the team; its NPC partners pop-up (the portal and Giratina distorted as its banner); the raid's stage (the Distortion World, Giratina distorted on its island) and a bar's tear. The entrance is on `/kitchen-sink/fx` |
| `MoonScene` / `NightmareGauge` / `NightmareEntry` / `NightmareEntryDialog` / `NightmareIntro` / `NightmareRulesModal` / `HauntSprite` / `BattleStage haunted` / `NightmareStrikeView` / `NightmareVictoryView` | Darkrai's nightmare (§29) | The moon on the pixel engine (moving; still); the gauge of rounds (fresh, under way, won); the way in (the intro playing, held at its end with "Tap to continue ▼", then its pop-up over that end; the pop-up at once, back from TEAM; the pop-up on its own: TEAM / NOT NOW / BEGIN THE NIGHTMARE); the rules pop-up (INFO); a haunted foe (full, short, off; on the night's stage); Darkrai's strike (playing, the cards draining; landed, from Home); the round's result cards (a round, the last, a gift); Home's Areas button locked with its reason; the waking (HEAL & START RAID over the green BACK TO THE WORLD) |
| `NightmareRaidBanner` / `NightmareRaidCard` (`RaidCard nightmare`) / `NightStageArt` / `NightGround` / `StageShadow` / `RaidNpcPicker nightmare` / `BattleStage world="nightmare"` / `NightmareFx` | Darkrai's area raid, and the nightmare's fights (§29) | The raid page in the moonlit night (`.nm-scope`): the moon banner with its plate, the card open and caught, the lock, START, the team; its NPC partners pop-up (the moon and Darkrai as its banner); the stage (the night, the moon behind the foe, smoke rising off its rock) and a bar's shadow; the raid's screen vignette with the shadow over the page. The entrance is on `/kitchen-sink/fx` |
| `LooksRow` / `LooksDot` / `LooksMenu` / `LooksSheet` / `LockedLook` / `OwnedLook` / `LooksRulesModal` | Trainer looks (§17, docs/31) | The row under the trainer card (with and without its red dot); the menu (a new game, some new looks, its list on the unlocked looks, an event's look won, every look unlocked); a locked look of each kind (a catch goal with its bar, an area with how far away, the League, the full Pokédex); an unlocked look with how it was won (from the start, a catch goal, an area, the League, an event); the rules (the first open, INFO) |
| `DayNightButton` / `DayNightChip` / `BattleDayTime` / `DayNightTag` / `DayNightPill` / `DayNightRulesModal` | Day and night in Johto (§30, docs/32) | The top bar's chip by day and by night; the fights' indicator on a stage (day, night); a list's tag (its own half, greyed in the other); the Pokédex places' chip (day only, night only); the rules (the first time, INFO) |
| `DoubleMons` (`BattleStage double`) / `DoublePlates` / `MiniPlate` / `TargetPicker` / `LeadPicker pair` | Double battles (§31) | The stage with four (the pair in front big on the usual spots, their partners smaller behind, each with a shadow; toggled, they change places), one K.O. on each side (greyed plates, 1 v 2); the name-less plates (icon, level, HP, statuses; the one in front ringed in gold; a fallen one greyed); the target picker (live, disabled); the lead picker sending two |
| `UgCave` / `CrackGauge` / `UgWall` / `PickaxeDie` / `PickaxeFaces` / `OrbArt` / `PlateArt` / `ThingIcon` / `HaulList` / `PlateGrid` / `OrbBagTable` / `UgRulesModal` / `UgTeamSeats` | The Underground (§32) | The cave (a square's size; big); the gauge fresh, under way, its last three shaking or calm, collapsed; the wall fresh, half dug with a strike flashing, cleared (glinting), collapsing; the die unrolled and rolled; the faces with the one that came up, and the next level's with its raised face; orbs of every colour and size, plates; the haul with every outcome; the plates none and some; the orb bag; the team seats solo, two, full; the rules (once, INFO) |
| `TeamSwapActions` / `TeamSwapDock` / `SheetActionRow` | The Center's moves (`teamSwapsOpen`: inside a Pokémon Center, at a portal's way in before READY!) | `TeamSwapDock` is the Team sheet's footer where swaps are open: Make lead (red) beside Use an item, Send to the Box a small link; Add to team (red); a full team: "swap X in for:" and the members as one-tap buttons (mini, swap arrow, name); a fossil still reviving: a line saying so. `TeamSwapActions` (the body version) stays for the Center's own sheet. `SheetActionRow`: a quiet button and the main one sharing a `minmax(0,1fr)_minmax(0,1.4fr)` row |
| `PlayStylePicker` / `PlayStylePanel` / `IdleRulesModal` / `AutoModeButton` / `AutopilotNote` | Idle mode and the play styles (§34, docs/36) | The two styles as a radio group of cards (an icon, the name, its line; the picked one on gold-pale with the gold ring and a check; none picked; arrow keys move the pick); Settings' panel with INFO; the rules (INFO only: they never pop up); the area's switch (AUTO-MODE or Idle mode, off and on, with Prof. Oak's tip); the line standing in for a card the autopilot takes (each style's); the catch panel with Idle's pick (`BattleBits`) |

Dialog behaviour (`src/lib/useDialog.ts`, used by `Modal`, `Sheet`, `SidePanel`): focus moves in, **Tab stays inside**,
**the page behind is inert** (`src/lib/inert.ts`: a screen reader's swipe can't leave the dialog either), **Esc closes
the top dialog only**, focus returns to what opened it. The top dialog is the one drawn on top: the highest z-index,
the latest opened among equals (a pop-up that opens under the partner lab, z 90 under 100, waits under it, inert, and
the focus stays up in the lab). Every dialog is portalled to `<body>`: what came before the top one (the game in
`#root`) and every other dialog are inert, what opened after it that isn't a dialog (a moment started from inside it)
stays live, and so do the toasts (`data-stay-live`). The rotate cover holds everything, the toasts included.

## 6. Layout

- Phone first, from **360 px**. Nothing scrolls sideways at 360, 375, 768 or 1280 (`e2e/layout.spec.ts`).
- **Portrait only on phones; tablets turn.** A phone plays upright: the installed app is held upright by its manifest
  (`orientation: portrait`); in a browser tab the game asks for the lock (`lockPortrait`, allowed only in full screen on
  Android, never on iOS) and, while the phone is still sideways, `RotateCover` covers everything: a pixel phone tipping
  upright and "Turn your device", nothing to dismiss, the game behind it inert. A **tablet** (a mobile device whose
  screen is at least 600 CSS px on its short side, `isTabletScreen`) held sideways plays on in the wide layout (the
  side nav from 768 px, columns from 1024 px) and is never asked to lock. The manifest can't tell a tablet from a phone,
  so it keeps the portrait lock for the phones' sake: an Android tablet with the game installed stays upright (iOS
  doesn't read the manifest's orientation). Sideways is the screen's orientation (`screen.orientation`), not the page's
  shape, so a keyboard that makes the page wide never shows it; computers never see it (`platform().mobile`). The rule
  is the device's, not a feature: no admin switch (`e2e/rotate.spec.ts`).
- **No zoom on phones**: `touch-action: pan-x pan-y` on the page (no pinch, no double-tap zoom) and Safari's gesture
  events cancelled (`main.tsx`). Not through the viewport tag, which axe counts as a critical issue.
- **A pop-up is never wider than the screen**: a sheet, the result card or the drawer that is a flex item carries
  `min-w-0`, or one long label would stretch it past the edge; a panel that scrolls is capped already.
- **Two buttons side by side** share a grid of `minmax(0, …)` tracks (`grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]`), never
  plain `fr`: a plain track can't go narrower than its label, so a long translation ran off the edge and squeezed its
  neighbour. In a shrinkable track `PixelButton` shrinks the label to fit (down to 60 %), and when even that is too wide ("NEU
  WERFEN (2)", "振り直す（2）") breaks it on two lines at the largest size that fits: a label is never cut.
- **Action bars** (the Pokémon Center's and the area's HOME / CONTINUE, the Game Corner's LEAVE) are pinned
  at the foot of the screen on phones (`fixed`, `bottom: var(--bottom-nav)`, and room under the page for them), even
  when the page is short; from 768 px they stick to the bottom of the content column. **An area has no tab bar on
  phones** (the rework, 2026-10-25): its bars are the way out (HOME), so `GameLayout` drops the tab bar on `/area`,
  `--bottom-nav` falls to 0 and `--bottom-safe` gives the bars the home indicator's room instead. **The top bar says
  where you are** on `/area` (the user's call, 2026-10-27): the area's name and its round, "2/3", or a check once it's
  cleared, in the bar's empty side (`AreaTitle`).
- **The round gauge sits once, under the area's header** (and at the top of a fight, under the top bar): a plain bar,
  a segment per card, no icons, the round beside it. Never again over an action bar (the rework, 2026-10-25).
- **A step's buttons stay at the foot of the screen on phones** (the rework, 2026-10-25): in a battle's panel the
  attack, the throw, CONTINUE, NEXT / BACK, NOT YET and the Bag-and-team row sit in a `BottomDock` (`sticky`, at the
  screen's bottom whatever is above them, the content scrolling behind); the action bars above are pinned the same way.
  From 1024 px they sit in the flow.
- **No button presses itself** (the user's call, 2026-10-27, replacing "no step is only a button"): a step whose one
  thing to do is a single button (the catch's CATCH or CONTINUE, a sure throw, the wipe's TRY AGAIN, the stalemate, an
  evolution revealed, the partner's LET'S GO, a wild fight's GO!) waits for the player's tap. Only while auto-mode or
  Idle mode plays the area (`autoLevel` not off) does its `AutoButton` load (a gold fill along its foot) and press
  itself; a tap goes sooner, and it waits while a dialog covers it. **Never in a Pokémon Center**, which waits for the
  player's CONTINUE so the Box can be used. A throw that can't miss has no CONTINUE at all: once the ball has landed, the result
  card comes (2026-10-26).
- **A fight's result card follows itself and moves on** (2026-10-26): each piece (XP, a level-up, the Pokédex entry…)
  scrolls into view as it comes, clear of the buttons at the foot; once all is shown, NEXT waits for the tap (its gauge
  fills and goes only while auto-mode or Idle mode plays the area, the user's call of 2026-10-27), BACK still in reach. It waits instead when a new species was caught or a small world's mythical won (its card is looked at, and a full team's
  replace choice, scrolled to, is made), when the area was cleared (the way on is the next area), and in a rebattle.
  No AUTO switch on the card nor in Settings: AUTO-MODE is the fights' own.
- **A region begun opens on its first area**, its first encounter under way (`exploreFirstArea`): a new game's partner
  and a new region's starter lead straight there, never to Home first.
- **Stage first** (docs/42, 2026-10-26): in an area the player acts where it matters (the dice, picking a Pokémon,
  catching, a Center's Box) and otherwise watches the scene. The send-out's GO! waits for the tap, wild or trainer (under
  auto-mode or Idle mode a wild fight's loads and sends the one picked by itself, `SEND_OUT_AUTO_MS`). The battle's message is **one line under the stage** (`BattleLine`), not a dialogue
  box, and keeps its height when empty; the waiting prompt ("What will … do?") shows only with More details.
- **The stage, and the phone's panel beside it** (docs/42 §2): on a phone the stage is on top and the panel under it;
  **from 1024 px the stage takes the screen and the very same panel stands docked at its right** (380 px, as tall as
  the stage, scrolling inside itself), so everything built for a phone's width is right on PC. Nothing under the stage,
  nothing shown twice. The fight's every step (dice, send-out, catch, switch, result) lives in that panel; the Center
  and the page between encounters put the area's scene (`AreaSceneBox`, or the healing) on the left and their panel
  on the right; Home puts the scene on the left and PLAY with what's open on the right. A new full-screen step follows
  the same shape.
- **One tap per decision** (docs/42): where choosing is acting, the choice is the button — a catch's balls are each a
  throw (no radio, no ROLL TO CATCH). Where a pick then GO! is the user's design (the send-out), a K.O.'s switch uses
  the same cards (`LeadPicker members`), not a different list. A rare way out (forfeit) is a small button at the side,
  never a second full-width one.
- **The result is short**: the team's XP in one strip (`TeamXpStrip`), a column each; the rows are More details'.
- **More details** (Settings, off by default, `useDetails`): what only an invested player reads is shown only to those
  who switch it on — the battle history (a button by the Bag) and the key hints, the HP and XP figures (bars alone
  otherwise), a card's type chips (every `PokeCard` is brief without it), the result's rows. A new screen asks the same
  of each number it adds: does a player need it to act, or only to study? Studied things go behind it.
- **The fight's stage keeps its 3:2 picture** (the user's call, 2026-10-27: the sky added above it in docs/43 §5.3 went
  again). On a tall phone the dice come down a little towards the thumb instead (`tall`'s spacer).
- **The round's gauge** (`RoundGauge`; the fight's `strip` on the stage's top edge, 14 px; the page's gauge 20 px; Home's
  `banner`): a segment per card of the round, gold once met (green once the area is cleared), **where you are marked**
  (the user's call, 2026-10-27: on the strip the card being played is white; on the page's gauge the next has a white
  edge), the rest grey; a **heart on each Pokémon Center's segment**, met or still to come, and the next one said to
  screen readers ("Pokémon Center in 2"). The strip lies over the stage's top: the plates and the matchups pop-up start
  under it (`--strip` on the stage), never hidden by it.
- **One stage-and-panel shape everywhere**: an area's steps outside a fight (`src/screens/area/StagePanel`: no tab bar on
  `/area`, the bar pinned over the home indicator) and the events' pages (`src/screens/events/layout` `StagePanel`, the
  dock pinned over the tab bar): phones the scene on top and the bar pinned; from 1024 px the panel framed beside the
  scene, scrolling inside, its actions at its foot. The round's gauge is the fight's strip on the scene's top edge; the
  plate counts rounds.
- **Event pages** use `StagePanel` (docs/43 §5.11): phones stack the stage, the panel and a pinned dock (one red action); PC
  docks the panel beside the stage. A list of things to set up (the raids) docks the picked one's panel beside the list on
  PC and opens its own page on a phone.
- **Pokédex** (docs/43 §5.6): the progress once, as a gauge in the page head; the search and the filter share one row
  (the filter a dropdown); on PC the entry stands docked (`SplitView`), the first caught or the last viewed open, the pane
  following the grid's keyboard focus.
- **Home: the team on top, then what's open, by heading** (docs/42): Events, Secret areas (every one open in the
  region, the newest first), Features (the Day Care, Versus); a heading only shows with something under it.
- **One pop-up at a time, then a rest**: once a one-time pop-up is done the queue waits a minute (`POPUP_GAP_MS`) before
  the next; two never chain.
- **What can't be had yet is folded** (the Mart's locked items, Upgrades' locked ones): one line, opened on a tap.
- Page gutter 12 px; gaps 8–12 px between cards; a panel's padding 12 px.
- **Tap targets ≥ 44 px on phones** (inline links in a sentence excepted). From 768 px, tighter sizes are allowed.
- One `<h1>` per route; headings in order; landmarks (`main`, `nav`).
- **One primary (red) action per screen**, in thumb reach on phones. Gold appears at most once, for something new.
- Lists of things you can open are buttons (whole card), with a keyboard path to every action inside them.
- Full-screen moments (the battle, a hatching, a trade) hide the tab bar and the side nav; all but the battle hide the
  top bar too (the battle keeps it, §12, and fits under it: `--top-bar`). Over Home one is an overlay
  (a trade, the partner): Home keeps its page padding under it, which its scene bleeds into, so nothing jumps or runs
  off the side of a phone behind the moment.
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
- **Toasts last long enough to read** (`toastMs`): 4 s at least, 1.2 s + 70 ms a character beyond (a caller may ask
  for longer, never shorter); the countdown waits while a finger, the pointer or the focus is on one. An **error** (the
  red `bad` tone) stays until its ✕ (44 px): a toast is often the only word on why something didn't happen.
- **Each page names itself**: `document.title` is "Team · Pokédice" in the player's language (`ui.page.title`; the
  area's name on `/area`, "Battle" in a fight, the game's name alone on the title page), and after a move inside the
  game the focus lands on the new page's `<h1>` (`tabIndex=-1`; the ring shows for a keyboard only), unless a dialog
  or a field already has it (`src/lib/pageMeta.ts`, mounted once in `App.tsx`). The first load leaves the focus alone.
- **Dialogs make the page behind inert** (§5), so VoiceOver and TalkBack stay in them.
- Arrow keys in radio groups and tab lists; Enter/Space on everything else.

## 8. Motion

How much the game animates comes from one place, `src/lib/motion.ts`:

| Level | Who sets it | What plays |
|---|---|---|
| `full` | Default | Everything |
| `short` | The player (Settings → Animations), or the OS "reduce motion" | A hit is one generic impact (no typed attack); Mega Evolution and Gigantamax are a white flash and the new sprite; a catch is the throw with its result at once; a quick Pokémon Center. Evolutions, Eggs hatching and encounters (legendary and trainer intros) still play in full |
| `off` | Admins only (Settings → No animations) | Nothing animates: every timeline jumps to its end state, its messages kept |

`calm` (the OS setting, or `off`): no screen shake, no flashing, the Home team stands still, the Game Corner's reels
don't flicker (each waits still on a "?" and stops on the engine's symbol in turn: three steps), a loading page's Poké
Ball doesn't wobble. One exception, the user's
call: Distortion World's lasting distortion (§27) is the world's identity and keeps playing under a calm OS (never faster
than 3 a second); only `off` stills it. The nightmare's lasting effects (§29: the haunted foe, the moon's smoke, the
raid's vignette) are not an exception: a calm OS stills them (`nightmareLevel`). Its intro and waking are scenes, not
lasting effects: under the OS setting they play in half the time, as every scene does.

House rules for every effect and timeline:

- Anticipation before every release; a 3–5 frame **hit-stop** on contact. One longer stop: with the game-feel pass,
  a K.O.'s final blow holds the whole scene 0.25 s on its impact frame (its "boss stop", docs/38 F4a), no flash held on.
- A hit flashes **two white silhouette frames**, never an opacity blink.
- Light and smoke are **ordered-dithered**, never blurred; particles step through a fixed colour ramp.
- **No screen flash faster than 3 a second.**
- Timelines run at **60 fixed steps a second** and fire their cues (message, HP, status, form…) at exact times.
- Durations: a button press 60 ms in 2 steps; a sheet rises in 220 ms; HP 700 ms / 280 ms / 900 ms; dice tumble 600 ms.
- **The game feel** (docs/38 §3, the admin's switch): a die's pick lifts in 2 steps over 60 ms; the last die of a throw
  squashes for two frames; the damage counts up after the dice land (`src/fx/dice/score.ts`: pops 60 ms apart, the
  combo's beat, the count over 300–500 ms; `short` 250 ms in all; `off` the end state); a tier 3+ combo shakes the
  tray 2 px and a tier 4 flashes it once, neither when calm.
- **Dice** (docs/37 §7): without the dice throws, a die tumbles in over 600 ms. With them (the admin's switch), a die
  is thrown in as a pixel cube replaying a recorded throw (0.53–0.70 s × pace, 2 px art pixels, an ink outline, a
  dithered shadow, a click per bounce) that lands square and upright on the engine's face, then the DOM die takes over
  in the same frame; its rings and its lift come with the landing. `short` plays the last bounce and settle (0.32 s);
  the OS's reduced motion, a two-step drop with no spin and no click; `off`, the die at rest at once. The animation
  never picks a face: it is turned to land on the one the engine rolled.
- **The title** (docs/38 §9, the game feel): the logo's dice are thrown in (full), dropped in one after another
  (short), dropped two pixels in two steps with no flash or ring (calm), at rest (off); its sounds wait for the page's
  audio to be open (`audioUnlocked`), never forcing it before a tap.
- Pixel motion steps (`steps()`), it doesn't glide, except HP bars and sheets.
- **Teaching loops** (How to play's cards, docs/38 §8b): a loop plays only at full motion (or the player's Short),
  and sleeps while it is off screen (`IntersectionObserver`) or the tab is hidden; under calm it is a still of its key
  moment with a 44 px PLAY that plays it once; with animations off PLAY shows its end. No sound of its own.

**Timelines** (`src/fx`, no React): a timeline is `setup / step / draw / cues` on a 240×160 stage. A screen plays one
with `<StageCanvas timeline ready hud onEnd label>`: it waits for the sprites (`loadSprite`, at most 1.5 s), plays at
60 fixed steps a second, and sends the cues to the `hud` (`contact` when a hit lands, `status`, `show`, `heal`,
`form`, `catchResult`, `beat`; with the game-feel pass an attack's `settle`, half a second after its last hit, and the
K.O.'s `ko`, docs/38 §2). Timelines never decide words: the screen phrases each cue from strings.csv. With
motion `off` the stage jumps to the end and still fires every cue, so the screen ends up in the same state.

| Timeline | full | short |
|---|---|---|
| Attacks: one move per type (Flamethrower, Hydro Pump, Razor Leaf, Thunderbolt, Psychic in `attacks.ts`; Tackle, jabs and a fist, gusts and a wing slash, Sludge Bomb, earth spikes, Rock Slide, a swarm and X-Scissor, Shadow Ball, Metal Claw, Ice Beam, Dragon Breath, Dark Pulse and Crunch, Moonblast in `attacks-types.ts`); a generic impact for typeless dice. With the game-feel pass (docs/38 §2): every hit scaled by its power (`hitPower`: shake, stop, particles), the damage number at 2× (gold super effective, grey 1× resisted), a settle 0.5 s after the last hit, the K.O.'s boss stop | the typed move | one generic hit |
| A shiny's entrance (game-feel pass, `shiny.ts`): on a clear canvas over the page's sprite, two rings of stars as it lands, twinkles, the shiny chime | in full | in full |
| A Z-Move (§33, `zmove.ts`): the power gathering, then the strike — the type's own move as its Z variant (`z`: more of it, bigger, harder, on a dimmed field, the attacker outlined in gold and the type's light) with the Z's mark on its last hit (a golden Z on the target, rings, a white flash); a Flying, Ground or Water one goes away first and comes back before its strike | the gathering, the Z variant | a flash of the type's colour; the one generic hit with the Z's mark |
| Catch | throw, beam, drop, wobbles, result — the engine's count of wobbles (`catchShakes`): 3 for a catch, for a miss 3, 2, 1 or none as it fell 1, 2, 3 or 4+ short, so the third never gives it away; a buzz with each (`haptic`); with a Bait to offer it holds on the ball lying still (`hold`) and the answer plays on from that frame (`from: 'ground'`: the Bait tossed beside the ball, a heart, its last wobbles, 2 or fewer by the same rule; or straight to the break-free); Capture Luck's stay (`stays`): out of the ball, a "!" and two hops, no flight | throw and drop, result at once (the Bait still lands); a throw that can't miss jumps to its end at every level |
| Pokémon Center | in its picture (`public/backgrounds/pokemon-center.png`): a ball per team member into the machine's slots, the heal jingle (B G♯ ×3, E) | one flash, healed |
| Mega Evolution, Gigantamax | the full change | a white flash and the new sprite |
| A raid Pokémon's form unleashed on its last bar (`unleashTimeline`: Giratina's Origin Forme, §27) | the full change, held on its new form while the words are read | a white flash and the new sprite, held as long |
| Trick or Treat's Treat (`trick.ts`) and Trick Ball (the catch, `ball: 'trick'`) | the perk-up, the Treat's arc with twinkles, the catch (hit-stop, warm frames), three chomps with crumbs and hearts, the gauge's glow, ring and sparks; the Trick Ball as the catch; a flee rises and dithers into wisps, the area dimming | the toss or the throw, then the result at once; a flee is a short dither out |
| Legendary intro, Evolution, Egg hatching, the lab (a partner), a trade | in full | in full |
| The portal run (§27): the breach, a portal closing, the victory | in full | in half the time (a portal closing: 0.9 s) |
| Giratina's raid entrance (§27, `raidEntranceTimeline`), the raid intro in portal mode | in full | in full, its tears the copies only (an encounter) |
| The nightmare (§29): the intro, the waking | in full | in half the time |
| Darkrai's strike after a round (§29, `nightmareStrikeTimeline`) | 2 s: the shadow rises, gathers, the beams | 1 s, straight to the beams |
| Darkrai's raid entrance (§29, `nightRaidEntranceTimeline`) | in full | in full (an encounter) |

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

**Every tap is heard**: a button that isn't a `PixelButton` (the battle's Bag, team pips and history, Upgrades' buy)
plays the same blip (`sfx('button')`), and `PixelButton` plays it as the finger lands (§5).

**Battle music** (docs/38 §5, the admin's switch): an original 8-bit loop synthesised in `src/audio/music.ts` on the
effects' AudioContext, booked ahead on its clock; a fight screen mounts it with `useBattleMusic(playing)`. It needs
Sound, has its own switch and volume under it in Settings (`settings.music`, `settings.musicVolume`), fades out at
the result card, pauses in a hidden tab.

## 10. Words and numbers

- **Strings:** `src/i18n/strings.csv` is the only place for text, in all ten columns (en, fr, es, de, it, pt, pt-BR,
  ja, ko, zh-Hans); no empty cell. Use `useT()` / `t()`. Reuse a key when the meaning matches.
- **Content text** from the data is swapped for the player's language once (`localizeGameData`): species, items and
  their descriptions, areas, badges, a die type's one-line nature (`diceDesc.*`), trainer classes and the named
  characters — gym leaders, Elite Four, champions, rivals, villains — under each language's official name (Brock is
  Pierre in French, Rocko in German); English in Portuguese, which the games never had.
- **Numbers:** every number shown (damage, combos, multipliers, status chances, catch chance, XP, prices, unlocks)
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
  - **Named in the admin**: every picture (and every battle scene) has a name and a few words on what it shows in
    `src/admin/pictureNames.ts`, which the admin's pickers list by group; `tests/admin-picture-names.test.ts` fails on
    a measured picture without one.
- **Offline, say so**: when the device has no connection (`navigator.onLine` false, `useOnline` / `offlineOr` in
  `src/lib/online.ts`), what needs the server — Friends, Trades, the leaderboard, Versus, My messages, signing in and
  the cloud sync — says "You're offline. Check your connection." (`ui.common.offline`) where it would have said
  "couldn't load, try again later"; signing in doesn't leave for a provider's page that can't load. Nothing else changes.

## 12. Navigation, Home and stages

- **Top bar** (`Header` in `src/components/Hud.tsx`): in Johto, the day's sun or the night's moon first (§30); energy on the left; on the right the gold as a navy pill (a tap
  opens the Poké Mart, no "+") and, last, you (name and badge count, then your trainer look → the trainer menu, which
  slides in from that side). The leaderboard's cup left it for the Social tab (docs/43: one way to each place).
  **It stays up in battle, every part of it in reach** (`useHoldFullscreen(true, true)`): nothing is hidden, covered or
  `pointer-events-none`. Mid-fight (and in a portal run) what would leave the fight is shut and says why
  (`useLockReason`): the gold stays focusable (`aria-disabled`), the reason in their name, and a tap says it
  in a toast. The sun or moon and the energy work as ever, and so does the trainer menu: the guide, the type chart,
  Contact and Discord open; the rows that would leave the page or the save (the leaderboard, Friends, Trades, Admin,
  the other save, signing in) stay listed, greyed with a lock and the reason as their line; SYNC ONLINE says
  "Finish the fight first".
  **Settings open mid-fight too, over it** (`SettingsOverlay`, a `Modal`; not their route, which would unmount the
  battle and play its entrance and log again on the way back): the battle stays mounted under them and waits (§14), so
  BACK TO THE FIGHT (or ✕, Esc) is the very same fight, its dice and its message. Sound, animations, the theme, type
  hints, Multi EXP, the play style, notifications, the language, copying the save and the rules work and apply at once
  (a play style that plays the fight takes it over from its next move, once Settings close). What would end the fight
  or leave the page stays listed and shut with the reason (`PixelButton shut`): signing in (it may load the cloud's save
  over this one), disconnecting, linking or unlinking an account (linking leaves for the provider's page), the one
  Delete (the save, the Extreme save or all the data), checking for new content (it swaps the game's data under the
  fight) and the deploy guide's link. The same under a portal run's lock, with its own reason.
  **Settings has one Disconnect and one Delete** (docs/38 U8b): Disconnect in Cloud backup, beside who is signed in;
  the red Delete is the last thing on the page and asks what goes first (`DeleteChooser`: Delete save, Delete my
  Extreme save while one exists, Delete all my data; white rows with red words and a line each), then each asks as it
  always did (the save: one pop-up; the Extreme save and everything: two in a row). SUPPORT ME is the trainer menu's (its
  foot); Settings keeps a quiet white row at the end of its Content panel. From 1024 px Settings is two columns (Game,
  Play style, Notifications | Language, Cloud backup, Extreme, Content, Delete); over a fight it stays one column. The
  language is one dropdown, each option in its own script and `lang`. Disconnect is white (reversible); the one red is
  Delete. **Type hints** (`settings.typeHints`, `useTypeHints`) sit in the Game
  panel, the same switch as the type chart's: unset, they are on until the first badge (`badgesHeld`), and a choice
  made in either place always wins. **Settings' rows have titles only** (the user's call, 2026-10-25): no description
  line under a switch, a choice or a panel, so each title says what it does ("Multi EXP (whole team)", "Animation
  length", "Type matchup hints"); a row that would do nothing goes instead of explaining why (Battle music while Sound
  is off, Multi EXP while the config has no bench share). A rule or a "how" belongs to the panel's INFO.
- **Five places** (docs/43 §3). **Tab bar** (phones; the user's order, 2026-10-27): Shop (the Mart: Buy · Upgrades ·
  Bag), Team, **Home** (in the
  middle, under the thumb: a tab like the others, its Poké Ball icon and label), Pokédex, **Social** (the leaderboard,
  Versus, Friends, Trades). The side rail (desktop) has the same five with Home first, SYNC ONLINE at its foot. A tab's
  hit area is the whole column, at least 60 px tall, even where the drawing is smaller. A tab stays lit on each of its
  views (`/upgrades` is the Mart's; `/leaderboard`, `/versus`, `/friends`, `/trades` are Social's). Its dot: a sale or
  the Underground's kits, else the upgrades you can afford (the Mart); NEW (the Pokédex); what's new with friends and
  trades (Social). `/upgrades` opens the Mart on Upgrades (`?tab=upgrades`, the General's `&up=general`).
- **Social's views** (`SocialTabs`, through `PageHead social="…"`): a strip of the four views on top of each, the
  current one named as the page's `<h1>` (screen readers) so the title isn't written twice; a view not open yet keeps
  its tab with a lock and its page says what opens it. `/social` opens the view with something new, else the
  leaderboard once open, else Friends.
  On phones the strip is one row that never scrolls sideways, each view its icon over its name at 16 px, as wide as its
  name needs; a locked view that isn't the current one shrinks to its icon with a lock (named "X · Locked"). From 1024 px
  each view is two columns (`SocialColumns`): its list on the left and, sticky beside it, what goes with it — your place,
  the boards and the Hall of Fame (leaderboard); your team and the attack/defense board (Versus); the friend picked, the
  first one at first (Friends, `SplitView`); Mine with NEW LISTING (Trades). A view's actions are pinned over the tab bar
  on phones (`SocialDock`): your place (leaderboard), SAVE TEAM (Versus' My team), SHARE INVITE LINK (Friends), NEW
  LISTING · n/4 (Trades), CONNECT signed out. Its room is at the very end of the page (`main:has([data-social-dock])`
  in index.css), so nothing the page lays after its body — an INFO — ends up under it. Adding a friend happens in the page (`AddFriendForm`: the field, the
  preview of who it is, ADD), not a dialog.
- **List and detail** (`SplitView`, docs/43 §2): from 1024 px a screen with a list and a detail docks the detail at
  the list's right (440 px, as tall as the screen, scrolling inside itself); a `Sheet` passed as the detail draws
  itself in the pane (`SheetDock`: no scrim, no focus trap). Phones keep the bottom sheet.
- **Region cards** (Areas sheet → regions): each region's own picture (`public/region-art/<id>.png`, from the Visual
  Lab's region prompts; its first area's strip until it has one), name, counts and GO. A tap moves there and shows
  its areas in the same sheet, from the top (the region you're in just goes back to its areas).
- **One red GO in the Areas sheet** (§6): only the GO of the area Home's big button leads to is red (the one being
  played, or, behind in the region, the one the story goes on in, `AreasSheet`'s `lead`); every other GO is navy
  (`frame-dark`). In the Regions view the new region's own button is the red one while one is on offer, else the GO of
  the region being played.
- **Area screen**: its title opens the area's details (the same details as the Areas sheet's first view, without the travel footer).
  Under the details' name: the levels, the rounds done over the rounds that clear the area ("3/5 rounds"; more can be
  played once it's cleared, "7/5") or "Secret area", and where it stands.
- **Pokémon Center**, laid out as a battle (the rework, 2026-10-25): no area banner, the round's gauge under the top
  bar, then the healing scene (a Poké Ball per team member) — the full scene, the balls set down and the jingle, at
  2.4× (about 2.7 s, the user's call, 2026-10-27) — with nothing to press; once it ends it folds away, **its sign
  stays under the strip** (`CenterSign`: the heart and "Pokémon Center") while you're inside, and the team and the Box
  have the screen, as cards three to a row
  (`PokeCard`, the send-out step's card: a tap opens the details and the team moves). It plays once: back from Home,
  the Center opens on the team (`run.healShown`). Then Home or
  **Continue** (the next encounter), so a run through an area never needs a trip Home; the Center never moves on by
  itself. **Every round opens with a Center**, outside its deck, even with the whole team at full HP (the user's call,
  2026-10-27; not right after one, nor in Extreme mode without Centers): it is the round's first step, on its gauge
  with a heart, met or still to come.
- **Dots only for something you can act on**: the number of upgrades you can afford (9+ at most), a gold NEW for
  Pokédex entries you haven't looked at. The dot is in the link's accessible name, never colour alone.
- **Home** (docs/43 §5.2, the user's feedback of 2026-10-27): the area's scene with the team roaming it and, **on its top,
  the area's banner** (`AreaButton`: the map, the area's name and its levels in the top right corner, then **the round's
  steps across its whole width** (`RoundGauge banner`: met gold, the rest grey, the hearts, "round/total"; the rounds as
  pips where encounters aren't dealt from a deck); NEW when
  a secret area opened; shut by the nightmare with its reason), which opens the Areas sheet. On a phone the scene shows
  **about 70 % of its height** (`SCENE_SHOWN`), its window kept on where the team walks. Under it one notice, then
  Events (the region's **legendary raids open now first**, as cards of their own, then a small world, the live events
  and the rest), Secret areas and Features as Home's one card (`HomeCard`: the picture as a strip on the left, the name,
  one status line, a thin gauge where time or progress runs; gold for one new thing), then the "Coming up" line. The
  **PLAY dock** is CONTINUE (and Stay here, Keep exploring, a green GO TO when they apply). Phones: pinned over the tab
  bar, the page scrolling behind it; 768–1023 px: sticky at the column's foot; from 1024 px: the scene as tall as the
  window on the left (`SceneStage fill`, a box at most 1.15× as tall as wide, kept on where the team walks: `focus`) with **the dock under it, pinned with it,
  always in sight** (the user's call, 2026-10-27; the scene gives it its room), and on the right (clamp(380px, 34%,
  520px)) the area's Pokémon (`HereCard`), the notice and the sections. The encounter itself plays on
  `/area`, and Home stays lit in the menus while it does.
- **The Areas sheet** opens from the area's banner on the area's details (tabs Details · All areas · Regions); a row opens
  its details in the same sheet. From 1024 px it is one wide sheet: the list or the regions on the left, the picked
  area's details on the right, their CONTINUE HERE / TRAVEL HERE navy so the lead GO stays the one red. Area rows have
  Home's card shape: strip, name, one status line (levels · caught · to catch, or why it's locked), GO at the right.
- **Notices** (`NoticeCard`, `homeNotices`): what never needs a pop-up over Home is a card in the page, one at a time: a
  feature with a page opening ("Versus is open!", SEE VERSUS; ✕ hides it for the visit, the page's `RulesCard` ends
  it), Prof. Oak's leaderboard tip, Support me, a region on offer once its pop-up was seen. **His invite is the
  friends list's**, at the top of Friends until ✕ or a share (the user's call, 2026-10-27: not on Home). Never red. **A
  region on offer** is its own picture as the card, "{region} is available", and two buttons: NOT NOW (put away on this
  device for good; the Regions view keeps it) and GO (gold: the professor's lab for that region).
- **After an encounter the player stays in the area** (a trainer, a wild Pokémon, a find, the Center, the Game
  Corner, fleeing): `/area` between encounters (`AreaIdle`) is the area's header, "Back on the trail…", the team (each
  card opens its sheet) and the action bar, HOME or CONTINUE, the next encounter (or the gym or legend waiting, with Keep exploring);
  when the next one can't start, the reason sits over the buttons. Only a full K.O. ends the run and goes back Home,
  and the HOME buttons.
- **Behind in the region** (the furthest open area of the region's main chain is elsewhere: `latestOpenArea`; secret
  areas don't count; not while an encounter is under way): with nothing of its own waiting where the player stands (a
  cleared area's free play), **CONTINUE itself reads GO TO {area}** and travels there, its second line saying what
  waits there (the round, the gym leader, the legend); **Stay here**, a secondary button under it, the dock's width (the
  user's call, 2026-10-27: an underlined word read as a link), keeps the free play
  CONTINUE gave (`ContinueButton`, `StayHere`; docs/38 U4a). With something else here (a gym, a legend, a raid, a
  secret area's rounds, a portal, the nightmare, or a closed area's shut CONTINUE saying why) CONTINUE stays, and a
  green GO TO {area} sits under it. Until the player is there or the whole chain is cleared. On wide screens the scene gives up the height of what
  sits under the big button (Stay here, the green GO TO, Keep exploring), so the whole bar stays on screen without
  scrolling.
- **A team on a widget banner** (Versus) spreads over the room up to what sits beside it (the VS, the
  lock): its usual spacing when there is room, tighter on a phone's half-width widget, and only past 60 % of an icon do
  the icons get smaller (`TeamFan`). It never runs under the VS.
- **Home's cards are only for what is open** (docs/38 U3a): a secret area found and never played (one tap travels
  there), the Day Care, Versus, each open special event, a small world and a live event; each is a button that leads
  somewhere. Nothing locked gets a square: under them **one "Coming up" line** names the next thing to open and how
  close the player is ("Coming up: Day Care · 7/20 caught", `ComingUpView`, from the engine's `comingUp`), in the order
  things usually open: the Day Care, the special events (from the teaser's badge count, naming the area that opens the
  first), Versus, then the secret area closest to opening (the condition still to meet, the first left, as the areas
  list says). A goal is not a feature, so the next secret only shows once the features are open. No line once
  everything is.
- **Stages** (a canvas scene: Home, the battle, a hatching) are a background canvas, the Pokémon as DOM `<img>`s
  (Showdown's animated sprites, no extra request) and an effects canvas on top. A stage root is its own stacking
  context (`isolate`), so its internal z-indexes never rise above sheets and dialogs. The canvas has `role="img"` and a
  label; whatever you can tap on it (a Pokémon) also exists as a button in a hidden list.

## 13. Lists, sheets and buying

- **A Pokémon's sheet** (`SheetModal`, a `Sheet`; docs/43 §5.4): the title is the name (a nickname button), the line
  under it number · level · where it is (Lead, Team slot 2, In the Box). The body leads with a hero (the sprite, types,
  HP and XP as gauges; figures with More details), then what matters now (a waiting Pokémon's lock, Evolve now in gold),
  the dice as real dice with their status lines, **What's next** (upcoming first; the reached ones folded under
  "Reached (n)"), the matchups, the rare moves (Send to region, Trade: quiet, small, with no line under TRADE unless it
  can't be listed), and last a folded **Stats** section
  (Speed, Rerolls, Catch value; open with More details). The footer holds the actions: one red at most (Make lead, Add to
  team), Use an item quiet beside it (the Bag's icon); a Box Pokémon outside a Center has the lock line; where swaps are open,
  `TeamSwapDock`. Let it go is a plain-size danger button at the footer's end, asked twice. Use an item opens a list in
  the same sheet, with Back.
- **The Team has no scene** (the user's call, 2026-10-27): its title, the team's cards, the Box. Home is where the team
  roams.
- **The Team on PC**: from 1024 px the Team is a `SplitView`: the selected Pokémon's sheet stands docked at the right,
  always open (the lead's on arrival); a card or tile swaps it and is outlined in gold. On phones it is the bottom sheet.
- **A small world's Pokémon waiting to unlock** (§22, docs/26 §1) opens the same sheet, its line saying "Waiting to
  unlock", the lock first in its body, and **Let it go** as the only footer action; no Make lead, no item, no Send on.
- **Nicknames**: on one of your own Pokémon's sheets (not a Pokédex entry, not a fossil still reviving) the title is a
  button, the name and a pencil (`NicknameButton`; "Give it a nickname" is its description, so the sheet keeps the
  name as its label). It opens a small `Modal` over the sheet (`NicknameModal`): the field, focused, with the species
  as its placeholder and a counter to 12 characters; Cancel and SAVE; a toast says what changed. Empty, or the
  species' own name, takes the nickname away. Nicknamed, the line under the title starts with the species
  ("Charmander · #004 · Lv.12 · Lead"). The Pokémon then goes by it wherever it is yours: team cards, the Box (its
  search finds a nickname or a species), the Center, Home's scene, battle plates and messages (through a Mega
  Evolution), the XP recap, its evolution ("Blaze evolved into Charmeleon!"), the trade scene and the Done list. It
  goes with it in a trade (§21), and the new trainer can change it. Other players' Pokémon on boards and cards show
  their species. **No switch and no rules pop-up** (§20 doesn't apply, the user's call, 2026-10-12): it is a name on a
  sheet, not something with a page of its own.
- **Explain, don't hide**: something that can't be used right now stays listed, greyed, with the reason in words
  ("Already full", "Fainted: needs a Revive", "Needs a Pokémon with 4+ dice", "6 badges"). Buttons you can't afford
  stay focusable (`aria-disabled`) and say what's missing ("need ₽14"); a tap explains in a toast.
- **Reordering**: drag a card onto another to swap them (pointer events, 8 px before a press becomes a drag; a tap
  still opens the card). Every drag has a button twin for keyboards and screen readers (Make lead).
- **Shelves** (the Poké Mart, docs/43 §5.5): one `ItemTile` for every item the Mart shows: the shelf, the Bag, held gems,
  a Special Shop, the Explorakits, a small world's Mart, the Mega Gems, Coming later. Three to a row on phones
  (`TILE_GRID`), four from 768 px. **The price button is the purchase** (×1, one tap; short of ₽ it stays focusable,
  greyed, a tap says what's missing). A tap on the tile opens `ItemDetail`: a bottom sheet on phones, docked in
  `SplitView`'s pane on PC (the Bag stands there while nothing is open). Its foot holds the quantities, each its own
  purchase (`QtyButton`: ×1 / ×5 / ×10 with its total, fewer under a limit; a limit of one is a single red BUY). Selling
  is ×1 / ×5 / All in green. A purchase is felt: coins from the top bar's gold to the tile (`CoinFlight`, Game feel on,
  never calm/off) and the tile's count hops. Categories are one scrolling chip row; the Mart's tab bar scrolls inside
  itself rather than squeeze a long translation. What isn't sold yet folds under "Coming later", the same tiles greyed
  with what they wait for. The Mart's tab opens on Upgrades while one is affordable (its dot); the top bar's gold opens
  it on Buy: any purchase is two taps from Home.
- **Upgrades** (the Mart's second tab): its views (Combos, Dice Types, General) are a compact chip tab list on one row
  with Affordable (on phones its coin and count), the view in the URL (`&up=`). A card is two columns: the name and its
  "Best buy" chip, **now → next at 22 px**, the track; at its foot **the price is the button, a row the card's full width**
  as the Buy tab's (the user's call, 2026-10-27: a column the card's height read oddly):
  navy (`frame-dark`, never red), the best buy gold (`bestBuy`), grey "need ₽X" when short, MAX, or a lock with its
  reason. Dice cards show their faces; what each status face does is More details'. PC: three columns.
- **Search resets filters**: typing in a search shows everything that matches (the Pokédex's filter goes back to All).
  A Pokédex number finds any entry; a name only finds what has been caught.
- **Grey plates** (`#e3e8f0`, `#f1f4f9`) take ink text: muted grey on them is under 4.5:1.

## 14. The battle

The battle (`src/screens/battle/BattleView.tsx`) is **full screen under the top bar**: `useHoldFullscreen(true, true)`
puts the side nav and the tab bar away while it is mounted and keeps the top bar (§12); the battle takes the rest of
the height (`calc(100dvh - var(--top-bar))`). It must fit a 360×640 phone, top bar included, with nothing to scroll
(`e2e/layout.spec.ts`). From 1024 px the stage takes the screen, as large as the window's height allows, and the
panel stands docked at its right (380 px, framed, as tall as the stage, scrolling inside itself): the line, the dice,
the actions, the Bag and the team as rows with their HP (docs/42 §3). The history is More details' button by the Bag.

- **Stage** (`BattleStage`): 240×160 art pixels, scaled. The background is the area's picture (its middle 240 × 160,
  the horizon halfway down) with two translucent zones on its ground; Versus and areas without a picture keep the
  Daybreak background drawn in code, with its platforms. The two Pokémon are the page's animated sprites (foe front,
  yours from the back), and while a move, a form change or an entrance plays, its timeline's canvas takes over the
  stage. Over a picture the timelines draw no background of their own (`setArtUnderStage`), so the picture stays put
  under every move. Plates sit on the stage: the foe's
  top left (name, level, types, HP as a bar only, status, a trainer's party as small red squares), yours bottom right
  (level, HP with numbers, status). MEGA / G-MAX tags join the plate when the form changes; a timed Mega (the gem
  rules, docs/35) says its turns left ("MEGA ·2").
- **The log drives everything** (`useBattleAnimator`): each entry is a step; a hit is a *scene* the stage plays, and
  the HP waits for the timeline's `contact` cue before it drains; the hit's sound plays there too. Entrances hold the
  log after its opening line. When animations are off, every step lands at once and no scene plays. With the game-feel
  pass (docs/38 §2) a hit's scene hands the stage back at its `settle`, half a second after its last hit: the log moves
  on, the page's sprites are back and the canvas only lets its particles fade over them; a K.O.'d Pokémon sinks through
  its platform in four steps.
- **Panel**, top to bottom, each part keeping its height so nothing jumps: the message box (two lines; "Tap dice to
  throw them again." is added on your turn), the dice tray (your dice up to 54 px — 72 on a phone
  740 px tall or more — and never under 44, lifted with a red outline and a ↻ tag when picked, the combo's dice in a
  gold ring with gold corner brackets; the foe's dice smaller, not buttons, ¾ of yours with the game feel), the readout
  once the last die of the throw is down, kept through a reroll until the new dice land (one line: the damage first
  and big, "26 DMG" — a button: the math, `(sum + bonus) × mult = damage`, shows once, under the readout — the combo
  chip when there is one, how effective it is, a `StatusChip` per status the faces cause, with its counter; Professor
  Oak explains a Freeze's or a Paralysis's chance the first time one is short of sure, once the dice are down; with the
  game feel it counts up, docs/38 §3), the extras (Mega, G-MAX,
  Z-MOVE, Type, Run, AUTO-MODE) only when they exist — the battle powers gold, Z-MOVE's hint saying what this roll's type adds (docs/35) — the actions (REROLL with its count — LAST REROLL in gold with the game feel — ATTACK in
  red; SKIP TURN when stunned; Versus's AUTO note), low in the panel with the room to spare above
  them (in the thumb's reach), then the Bag and the team pips (the history with More details).
- **Auto battles** (auto-mode, Versus) play at the `short` motion level unless animations are off (`MotionCap`).
  Auto-mode is switched in the area (under its header), never from Home; a cleared area's battle has **one switch,
  AUTO-MODE: ON / OFF, in the same place whichever it is** (its extras' row, last; green and pressed while on, ghost
  off; the user's call, 2026-10-27: no note and STOP), which hands the rest of that fight to auto or takes it back and
  sets the setting, like the area's switch. With the play styles on (§34), where it is offered follows the style (`autoAvailable`: Auto
  on explored areas in cleared areas, Idle everywhere), and the catch's result moves on by itself while
  the autopilot runs (Idle throws the ball itself, §34). The fight keeps the rules it started with (its powers, `state.auto`); the switch gives it back. Prof. Oak's tip about it, the first time,
  one line ("Auto mode unlocked: you can play completed areas automatically."), takes the full width above the switch
  (never squeezed into a column beside it).
- **Team pips** on every screen size (the wide rows went, docs/43 §5.3): menu icon + an HP bar, the one in battle ringed
  in gold, fainted ones grey. Tapping one opens the switch **in the panel**: the send-out's cards of those able to come
  in (the tapped one picked), BACK | GO! | the forfeit flag; it costs the turn (the line says so). After a K.O. the same
  cards, GO! and the flag — **with one Pokémon left to come in, it comes in by itself** (the user's call, 2026-10-27).
  With nobody to send in, a pip still opens the step: "No other Pokémon can come in.", BACK and the flag, the fight's
  way out. The Bag's "on whom" is the same cards; one that can't be helped says why.
- **The Pokémon stay animated while a move plays** (`LiveSprite`, the user's call, 2026-10-27): a canvas can draw only
  a GIF's first frame, so the timeline moves and fades the page's own sprites (and whitens a hit with a CSS filter)
  instead of drawing still copies, and draws only what lies on them (a tint, an outline); a look it can't take (a
  wave, a silhouette, coloured copies) draws the still copy for that frame. Over a picture or a world, single battles,
  attacks (a form change keeps its still copies).
- **Keys**: 1–6 dice, R reroll, Space attack, B Bag, S switch, Esc back, Enter the step's red button, 1–n pick a card;
  `aria-keyshortcuts` on the buttons. `KeyHints` on PC only, faint until the panel is hovered or focused, always with
  More details.
- **The Bag** is a `Sheet`: every item usable in battle with what it does and how many you have; one that can't help
  anyone is greyed. One item a turn, and it doesn't end the turn.
- **Raids** (`src/screens/events/RaidView.tsx`) keep the battle's layout and its 360×640 fit. Their bottom row: the
  Bag, **your raid team** as compact pips (`TeamPips compact`, 44 px) — tap one on your turn to switch, which costs the
  turn as in a battle (the dialog lists who can go in) — then the **speed button** and **Give up** (a flag, its name in
  its label). The speed button plays the ally sides' turns at ×1.5 (`RAID_FAST_SPEED`): their delays, scenes
  (`Scene.speed`), HP bars and dice; the raid Pokémon's turns (even striking back at an ally) and yours never change. It shows the
  speed those turns play at (×1 / ×1.5), so its state is a word too, and the setting is kept (`settings.raidFast`).
  A side's next Pokémon after a K.O. goes to the front only when it's the next to act (`frontsNext`); when another
  side plays first, it waits beside the ally in front for its turn, never sent out only to step straight back.
  Giratina's raid, its area in portal mode, plays in the Distortion World (§27): its stage, its look, its entrance.
- **The catch happens on the stage**: the worn-out foe stays on its platform, greyed; the panel shows the balls as a
  row of throws in the dock (each with its chance from `catchChance`, how many you have, "not needed" when a weaker one
  is already certain): one tap on a ball throws it (docs/42 §4). A sure catch or no ball has one button that loads and
  presses itself. The catch timeline plays; the die and the
  result show together on `catchResult`, never before (the die would spoil the wobbles). A throw that can't miss
  (`sureThrow`: its bonus alone reaches the need) has no die and no animation: the stage jumps to the catch's end
  (`StageOverlay.instant`), only the "Gotcha!" sounds, and the result shows at once.
- **The Bait** (docs/25): a throw that fell short, with a Bait in the bag that could still make it, stops with the ball
  lying still after its wobbles; the die shows with the math (`4 + 1 = 5 < 7`), the message asks "So close! Throw a
  Bait to tempt Snorlax?", and a line gives the Bait's die and the odds ("The Bait's die (1, 1, 1, 2, 2, 3) adds to
  your throw: 50% to catch it"). Two buttons: Keep it, and the red THROW BAIT ×2. Thrown, its die (berry pink, smaller)
  sits beside the catch die and joins the math (`4 + 1 + 2 = 7 ≥ 7`). A hopeless Bait is never offered. Raids and
  legendaries too.
- **Capture Luck** (docs/25): a wild Pokémon that broke free may stay: the message says it broke free but didn't run
  away, the stage shows it back on its platform, and the panel's button is THROW AGAIN (back to the ball picker, "Snorlax
  is still here! Pick a ball and throw again."). Once per encounter; never a legendary or a raid.
- **Who goes out** (the encounter preview's `LeadPicker`, and between a trainer's Pokémon): "Send out:" and a card per
  team member, its mini and level, then its **whole name** on a line of its own (a size smaller on a phone when long,
  wrapping rather than "Bulba…"), types, HP, SWITCH and INFO. The one picked is ringed in gold and its button says
  ✓ SENT OUT, **white**: the red is FIGHT's. A team of one has nothing to pick: no "Send out" at all (docs/38 U5c).
- **The time of day** (§30): in a Johto area, a small sun or moon chip on the stage's top right corner.
- **The fight waits while a pop-up is over it** (`useDialogOpen`: any `Modal`, `Sheet` or `SidePanel`, its own menus
  and the top bar's — the trainer menu, Settings, the guide): no throw of its own, no auto-mode move, no skipped turn,
  no catch result moving on, and Space or Enter inside the pop-up never rolls or attacks behind it. The step under way
  still finishes playing. Closing the last pop-up picks up from there, with whatever Settings changed.
- **Leaving never skips a step** (`src/store/resume.ts`): an encounter under way — its preview, the fight (state, log,
  dice already thrown), the catch, the result card, the Center, the Game Corner, a ghost — is written with the save on
  the device (`resume`, beside the save in `pokedice.save`, flushed when the page goes) and a reload or a return puts
  the player straight back in it (the title's CONTINUE and the first Home go to `/area`), at the same point. Both dice
  streams are kept with it, so the fight rolls exactly what staying would have: leaving can't throw again. The screen
  opens on the fight as it stands (`battle.resumed`: no entrance, the log already played). Before, the run lived only in
  memory: the card already drawn was lost and the next CONTINUE dealt the following one. It is only on the device: the
  save in play and the cloud copy never carry it, and one that no longer fits the save (another device's came in) is
  dropped, never the save. Raids are not kept (docs/19 §6.4: leaving one is a free retry, its try already counted).
- **Result cards** rise from the bottom over the panel on every screen size, wild and trainer fights alike, the stage
  still in view: XP per Pokémon, the catch (NEW when
  the species is new to the Pokédex), "Wild battles pay no ₽" when that is why no money came; the gold counts up from
  0. **One way forward**: CONTINUE (what Home's CONTINUE would start), or GO TO NEW AREA in its place when this fight
  cleared the area and opened the story's way forward (`latestOpenArea`), with **Home** the quiet white button beside
  it. With the Game feel switch on (docs/38 §4) the card has its jingles, the XP bars fill in steps and the coins fly to
  the top bar. Between a trainer's Pokémon, the card shows the trainer and the
  sprite of the one about to come out. Versus ends on its own card in the panel: Victory / Defeat and Back to
  Versus — once a fight is done, it's done (no rematch).
- **Versus** plays on auto, to its end: no skip.
- **The stage draws the forms the log has reached** (`Fx.dex`), not the state's: a Gigantamax still attacks as
  itself (the revert comes after), and a trainer's Mega shows only once its scene has played. Mega Evolution and
  Gigantamax play 1.6× faster in battle than drawn in the Visual Lab.

## 15. Day Care and Eggs

One Day Care for every region (docs/15-DAYCARE-BREEDING.md). The page (`src/screens/DayCareScreen.tsx`, its pieces in
`src/screens/daycare/`) is a stage and its panel (docs/42, docs/43 §5.7): the yard on top (PC: left, as tall as the
window, sticky), the panel under it (PC: framed at its right, scrolling inside itself). The panel, in order: the rules
card on the first visit (`DayCareRulesCard`, GOT IT sets `dayCare.visited`); the Egg card (one row, HATCH IT at its end)
or the Egg-now bar; your two slots (`SlotCard`, compact: a 60 px sprite beside the name, level and gain, the XP bar, the
partners, TAKE BACK); friends' Pokémon one line each (`GuestTile`, Send back a 44 px ✕); the free friend slots as one
"+ Add from a friend" line; signed out, one line and a small CONNECT. At its foot the Egg checks, always open (the user's
call, 2026-10-27: no toggle), then INFO the panel's width (`InfoButton`). The push question waits while the rules card is up. What follows describes the
pieces.

- **The yard** (`YardStage`) takes the place and size of Home's scene: its picture (`public/area-art/daycare.png`,
  measured in `ART_GEOMETRY.daycare`; the drawn meadow and cottage stand in while it loads, `dayCareWorld()`), everyone at the Day Care roaming with Home's herd. Pairs that could make an Egg
  seek each other out (`likes`) and send hearts; nobody sings (`quiet`). A tap makes a Pokémon hop with a heart; with
  an Egg waiting, a nest with the Egg shaking sits in the yard and a tap on it hatches. The plate is the page's only
  title: the back arrow, "Day Care", "Every region · 4 Pokémon here". The canvas has a label, and every Pokémon and
  the Egg are buttons in a hidden list.
- **Under the yard, one of two:** the gold **Egg card** while one waits (the Egg shaking, who left it or "A gift for
  your first visit", Hatch it), or the **Egg-now bar**: "Next Egg check", the time left in large type, how many pairs
  could leave one, and the gold EGG NOW with the coin and its price under it (at most 55 % of the row: the countdown
  stays on one line and the button's label shrinks first). Without a pair no clock runs: "On hold" takes the
  countdown's place and the button is disabled. Short of ₽ it stays focusable, the price turns red and a tap says
  what's missing.
- **Slots are compact cards in two columns** (`SlotCard`, the sprite 60 px beside the name): a 4 px band in the slot's colour (pink `#ff5a7a` for your first,
  blue `#5b8def` for your second, grey for a friend's), the head (that colour's heart and "Yours", or the friend's
  trainer head and "Lea's"; a green tag with the levels gained here or New), the animated sprite on a pale tile, the
  name and level, then for yours the XP bar to the next level ("To Lv.25 · came at Lv.22", "Lv.100: it can't grow
  more"), "Pairs with" and the partners' names, each of yours with its heart. The button (Take back, Send back) sits
  at the bottom so both cards' buttons line up. A free slot is a dashed card with a blue +.
- **Friend slots** work once signed in (friends' Day Cares are read when the page or its picker opens, at most once a
  minute). Signed out, the friend list's connect prompt takes their place; without the online service, or on a
  database without migration 0034, they are greyed and say why.
- **Hearts mean "can make an Egg with it"**, always next to a name: a heart is never the only sign.
- **Egg checks** (open at the panel's foot) list the rule, the two clocks (Egg groups, Ditto) with their next time ("waiting for a pair" for a
  clock with none), and every pair with a tag: the shared group and its pace ("Field · every 12 h"), or Ditto's slower
  pace in purple.
- **Pickers** (the shared `Sheet`): Leave which Pokémon? lists every region's Box (the region after the level once
  several are played) by level, lowest or highest first, with a search and, once someone is here, Compatible only;
  the team has the TEAM tag (the last of a region's team greyed with the reason), each row its Egg groups and a pink
  "Compatible with Jolteon" tag in the colour of the slot being filled. Add a friend's Pokémon has a search (friend or
  Pokémon) and a Compatible only toggle, grouped by friend, the best matches first.
- **The Home widget** is the same size in every state: the Day Care's banner (a fixed-shape strip of its yard's
  picture), your two standing on it as icons as tall as the banner (no names), the levels they gained there under each
  (+3 Lv, MAX at the level cap), the gauge to the next Egg check and its time (no gauge and "Waiting for a pair" while
  nobody here can pair). With an Egg waiting it turns gold (`panel-gold`) with an Egg! tag and the Egg shaking on the banner, and a tap
  opens the page straight into the hatching. Locked, the banner is greyed with a lock, and it says how many species are
  caught across every region.
- **Hatching** is full screen (`useHoldFullscreen`): the hatching timeline (with `shiny`, two rings of stars and a
  chime just after the reveal), the message box, Skip (Escape skips to the end); then what hatched (NEW, ✦ Shiny),
  where it went or why it wasn't kept (with the ₽ from the Day Care couple), and Done. The money pill bumps once the
  top bar is back (`bumpGold`).

## 16. Versus and the boards

- **Versus's rules** are the rules pop-up (`VersusRulesModal`): once when Versus opens (three Pokémon at Lv.50,
  `versusRulesSeen` in the save; it queues behind the other one-time pop-ups), and from the INFO button at the bottom of
  its page, locked or not. Opening the page also counts as seen.

- **Screens reached from Home** (Day Care, Versus, the leaderboard) put a back chevron before their title
  (`PageHead onBack`); the tab bar stays.
- **Ranked rows** (`BoardRow`): the rank (gold, silver and bronze squares for 1–3, `RankMedal`), the trainer's look
  (the `TrainerLook` crop, the same crop everywhere a trainer appears), the name with a gold "you" tag, their team as
  menu icons (`TeamIcons`, one atlas), the value at the end. Your row is gold-ringed. A row can carry a line under
  the team (Versus: how many of their Pokémon your team hits super effectively, green at 2+, red at 0) and an action
  in place of the value (FIGHT, or a green Beaten tag that says when you can fight them again).
- **A long board is cut** (`boardWindow`, every board: the leaderboard's five tabs, its Hall of Fame and Versus's
  board): it always shows its real top 100, every friend wherever they are, and you with the 10 trainers ahead of you
  and the 10 behind, all with their real ranks ("You're #N of M" counts the whole board). Each run of rows left out is
  one `BoardGap` between dashed rules, "37 trainers not shown", the last one too. FRIENDS shows only your friends and
  you, as before, with no gaps.
- **Versus locked**: what opens it, a meter n/3, and the three Pokémon closest to Lv.50 with how many levels to go
  (`versusClosest`). Unlocked: tabs Opponents (with the count still to beat) / My team / Leaderboard; Opponents has
  your team strip with Change, a search by trainer *or* Pokémon and To beat / Beaten / All chips with counts. My team
  shows three numbered slots ("Lv.72 → 50") over the eligible list (order badges 1–3), then Clear and Save team. The
  list holds each species once, its shiny apart (`versusChoices`: they fight alike at Lv.50, from whichever region), a
  row its name, ✦ and types (no level: everyone is Lv.50 here); a search, No. / A–Z and a `TypeSelect` order and narrow
  it, and picks they hide stay picked.
- **The leaderboard** (docs/43 §5.8): one board over every region on Shiny and Raids (each trainer on it once: 0054; a
  trainer with no shiny / no raid won isn't on that board); five boards, each its icon over a short name (Level,
  Progression, Pokédex, Shiny, Raids) at 16 px in every language. A heading names the board and its region ("Level ·
  Kanto"). Rows show their measure with a `ScoreMeter` bar where the board has a ceiling (the level cap, the region's
  areas or Pokédex: the count alone, its total said once), and a count with its icon for Shiny and Raids (the words for
  screen readers). Phones pin your place at the foot ("You're #N of M", a tap scrolls to your row and blinks it); PC
  puts your place, the boards (each with what it counts) and the Hall of Fame (its rows inline, a crown in place of the
  rank) beside the ranking, a row one line (name, team, measure side by side). Locked until the first badge.
- **Versus's FIGHT**: one red, the opponent your team hits hardest (`versusEdge`), the others navy (`frame-dark`). PC:
  your team and the board beside the opponents (no Leaderboard tab there); the team editor's Clear / SAVE TEAM sit in a
  `SocialDock`.
- **The weekly league** (docs/44, its own switch): Versus's page keeps its tabs and columns.
  - A header (`LeagueHeader`): your trophies, your place in your group, and a dark chip "Ends in 3d 5h".
  - The 3 opponents offered as stacked `BoardRow`s: the trophies (`TrophyCount`, the trophy icon after the number) and
    the matchup line under the team; one red FIGHT.
  - The group: `LeagueRows` under a This week / Last week `Seg`, tied places sharing a rank, each top-10 place with its
    rewards' pictures under the team (`RewardMark`).
  - The admin alone sees `BotTag` (BOT) on a bot.
  - The fight is the battle screen with `versus.live`: the player's own controls and powers, AUTO-MODE as the panel's
    switch, never the Bag. Its result card (`LeagueResultCard`) shows the trophies won or lost, green or red, beside
    VICTORY! / DEFEAT.

## 17. The trainer card and the menu

- **The avatar opens the trainer card** (the drawer, titled "Trainer card", docs/43 §5.9): the card is compact — the
  look (64 px), the name with a pencil (rename), a badge chip and the team's icons; Money, Pokédex, Best level, Areas,
  Shinies and Versus fold behind "Stats ▾", open by themselves with More details. Menu rows are 48 px, titles only. The
  foot is one row of three tiles (Discord, Support me, Contact). The main rows fit a 360×640 phone without scrolling.
- **A friend's card** is drawn the same way, with their badges as the same one count across every region (no badge
  cases).
- **Invite a friend**: Prof. Oak's pop-up once per region at its 2nd badge; INVITE shares the friend invite link
  (`/f/<code>`, opening it makes you friends), or the game's own link while signed out (no friend ID then). With the
  invite rewards on (§25) it shows the gauge, signed in, or a line saying an account earns them, signed out.
- **Support me** (while the admin has donations on, with a Ko-fi link): the SUPPORT ME button at the bottom of the
  side menu and at the top of Settings (white: red is for the game's actions), and once per region at its 5th badge.
  Three rows, most important first: join the Discord, invite friends (the same link as INVITE), and support the developer on Ko-fi, under a plain line
  that Pokémon is a licence, so Pokédice is never monetized and a donation gives nothing in the game. Never "keep the
  game alive" or hosting costs: the money is for the developer, not the game.
- **Look**: "How other trainers see you…" with Change opening a radio grid of every look, in one block (no region headings); picking one closes it. The same
  crop (`TrainerLook`) is used wherever a trainer appears.
- **Trainer looks** (docs/31, while its switch is on, in the Look block's place): one row under the card (the look
  worn, "27 of 138 unlocked", a **red** dot counting looks unlocked since the menu was last opened, the one red dot
  for "new": it marks a collection to look at, the user's call, 2026-10-17; `crimson` under 24 px) opening a sheet:
  the look worn, the unlocked looks as a radio grid (a tap wears it; gold NEW on the unseen ones), then a list by
  region, the one being played first: a Locked / Unlocked `Seg` with counts and a region dropdown (`SortSelect`: "All
  regions (12)", then each started region with its count; never a row of chips). Locked: nearest goal first (a
  silhouette, the name, the goal with a gold bar or "3 areas away"); Unlocked: the sprite, the name and a check with
  how it was won (the same goal words; Red and Leaf first, "From the start", then the event looks won under their own
  **Events** heading, with All regions only; an event's look is never listed locked, docs/31 §7). A region not started
  is one line; INFO at the bottom. Closing the sheet marks them seen. The top
  bar's avatar carries the red dot when no gold one is there.
- **The menu** under the card: rows with an icon tile, a label and a one-line description (Leaderboard, Friends,
  Trades, **Inbox**, the other save, Settings, How to play, Type chart, Admin for admins, Cloud backup, Connect), then
  pinned at the bottom the Discord and Contact the developer. Versus is not in it: it is Home's widget. The label
  alone names a row; the description is its `aria-describedby`.
- **The menu's pop-ups are sheets** (the user's call, 2026-10-27): How to play, the type chart, the Inbox and Contact the
  developer open as `Sheet`s, the full width of a phone like every other pop-up (wide on PC).
- **How to play** (the menu's row, a `Sheet`; also the `/help` page): `HelpContent`, the rules in words with the live
  numbers (the combos' bonuses, the statuses), its sections linked from a row of chips at the top. With the Game feel
  on (docs/38 §8b) it opens on "The basics", four animated cards (throw the dice, reroll, deal damage, catch: one
  column on phones, 2 × 2 from 1024 px), then the same text under "All the rules", its section titles a level down.
- **Inbox** (docs/38 U6b, `InboxModal`): the developer's messages and gifts on their own, the very My messages view
  that Contact the developer has as a tab (§23); a gold count on the row for answers not seen and gifts not opened.
  Contact the developer keeps its pencil, the Inbox the envelope.

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
  level. Not this one puts it back; another ball swaps it. **The lab picture stays on top; the message box, the card
  and its buttons sit at the bottom of the screen**, under the thumb, above the home indicator (docs/38 P2b).
- **Before it, how to play** (§34): a new game first asks for a play style when the idle mode's switch is on for the
  player; otherwise it starts with Prof. Oak, as always. **Prof. Oak's intro** is the Game Boy's: Oak in the room, the
  text box with SKIP INTRO and NEXT at the bottom of the screen (safe area kept; docs/38 P2a). **Select your
  character** fills the name in with the character's own (`trainerName.red` / `trainerName.leaf`: Red, Leaf, Rojo,
  Hoja…), so NEXT works at once without a phone's keyboard; picking the other character changes it unless the player
  has typed one (docs/38 U1f).
- **Yes**: the partner hops with hearts, the other two balls sink away (`starter.fanfare`), "Charmander is your
  partner! Your Kanto journey begins." and one wide button, Let's go!, which starts the game or the region.
- **Leaving**: a new region has ✕ (Not now) and Esc; a new game has nothing to go back to. With motion `off` the balls
  are already on the table.


## 19. Extreme mode

A second save in a world of its own (docs/22-EXTREME-MODE-PLAN.md), opened by the Johto League once the admin has
switched it on (Off by default; Off / On for admin / On for everyone, like the events). The pieces are in
`src/components/Extreme.tsx`, every state of them on `/kitchen-sink` (`ExtremeBits`).

- **Which world is in play is never in doubt**: a crimson band under the top bar ("Extreme mode · no Pokémon Centers",
  22 px, `ExtremeBand`) and a skull on the trainer's avatar (`ExtremeMark`). Crimson (`bg-crimson`, under `light-scope`)
  and the skull are Extreme mode's only marks; nothing else in the game uses the skull.
- **Its rules** are the rules pop-up (`ExtremeRulesModal`, Mt. Silver's champion hall as its banner): once when it opens
  (Later / Let's go!, which goes straight to the Extreme save), and from INFO on the title card and in Settings.
- **The title** shows the save in play first (CONTINUE, with the skull when it's the Extreme one). From the main save, the
  Extreme card sits under it (`ExtremeTitleCard`: trainer, region, badges, its team, who's resting, PLAY EXTREME or NEW
  EXTREME GAME after the rules, INFO); from the Extreme save, "Continue the main game". Switching always asks first
  (`SwitchSaveModal`) and reloads the page.
- **A resting Pokémon** (K.O., on its 12-hour clock) says when it's back wherever it appears: "K.O. · 11h 42m" with the
  moon (`KoTag`) on cards and in lists, and on its sheet the night panel with the 12-hour track and what a Revive would
  do (`KoPanel`). The countdowns read the server's clock.
- **Nobody able to fight**: CONTINUE greys and says who's back first and when; the resting panel under it
  (`RestingPanel`) offers the two ways out, Team (with how many in the Box can fight) and the Poké Mart.
- **Back in the game**: "While you were away" (`AwayReportModal`) once, between fights: the time away, then one row per
  Pokémon the absence changed — a green bar with the part healed in pale green, "Back from K.O.", "Full", or still
  resting and until when.
- **Friends** are the same in both worlds; in Extreme, a friend without an Extreme save is listed greyed with "Not in
  Extreme mode" and the skull, and doesn't open.

## 20. Every new feature: its switch and its rules

Two rules for every feature that adds something players can do (an event, a mode, Trades…), not only the events
(the user's rule, 2026-10-12).

- **A switch in the admin: Off / On for admin / On for everyone** (`EventAccess`, the `AccessSwitch` widget), **Off by
  default**. Off: the feature is nowhere in the game (no row, no square, no pop-up, no link that works); On for admin:
  only the admin sees it, signed in, to try it in production first; On for everyone: open. The game reads it through
  one helper (`eventOpenTo(access, data)`); **the server checks it too** in every function that acts for a player
  (as `wheel_spin` does), so an old build or a hand-made call can't use a feature that's off. Turning it off keeps
  every player's data as it is.
- **Its rules, once and on demand — where they apply** (docs/43 §7, the user's call of 2026-10-26): a feature with a
  page of its own shows its rules the first time that page opens, as a card at its top (`RulesCard`: an icon, "How
  {name} works", 2–4 `RuleList` rows with the config's numbers, GOT IT, which sets its "seen" flag in the save for
  good), and an **INFO** button at the bottom of its page shows the same rules again (`RulesModal`, OK). Its opening
  is announced on Home as a notice card with a button to its page, never a modal over Home. A feature **with no page**
  of its own (day and night, the battle powers, a small world's opening, Extreme mode, the push question) keeps its
  rules pop-up (`RulesModal`, Later / Let's go!), taking its turn in the one-time pop-ups' queue, below; so do the
  rules shown at their own moment (the portal's and the nightmare's way in, Trick or Treat's first ghost, the gifts',
  the looks'). The Day Care, Versus, the events, Extreme mode, Trades, the gifts (§23), the General upgrades (§24), the invite rewards (§25),
  the shiny Pokédex (§35), the Unown Pokédex (§37), the portal run (§27), idle mode (§34: **no rules pop-up**, the user's explicit exception of 2026-10-23; INFO in Settings → Play style), the small worlds (§22: the world's pop-up, once; INFO at the bottom of Home inside it), finishing a small world early (§22: its offer is its rules pop-up, once; Home's row inside the world is its INFO), Trick or Treat (§28), trainer looks (§17, docs/31), the battle powers (§33), the nightmare (§29: its short rules on its way in's pop-up, every time, as the portal run's), day and night in Johto (§30: its INFO is the top bar's sun or moon, as it has no page), the Underground (§32: its pop-up is its rules, once per event) and push notifications (§26: its rules pop-up is its question, asked once per feature; its INFO is in Settings →
  Notifications) follow it.
- **The one-time pop-ups take turns, in one queue** (`nextOneTimePopup`, src/engine/popups.ts; docs/38 U2a): one at a
  time, only between fights (`run.phase === 'idle'`, no battle, no full-screen moment, no gift being opened), never on
  the page a pop-up leads to (the next one due takes the turn there), and the one on screen keeps its turn while it's
  due. The engine decides whose turn it is from the save and what it can't know (`PopupContext`: the page, signed in,
  the server's clock, what waits outside the save); `PopupQueue` (GameLayout) works it out once for the whole game, and
  each pop-up opens only on its own turn (`useMyTurn`). The order: the away reports (Extreme's, the General upgrades'),
  the offline report, the developer's answers, friends' raid gifts, a new region's offer, Extreme mode, an invite reward
  ready, the portal run, day and night, the battle powers, a small world's opening, its finish and its goodbye, a live
  event (but the Underground: `queuedLives`), a taken trade's scene (Home only), and push
notifications' question last. A new pop-up gets a place in that list, not a list of its own. The rules that open at
  their own moment (the gifts' before the first gift, Trick or Treat's at the first ghost, the portal's and the
  nightmare's on their way in, the looks' at the first open, a world's finish or a live event asked for from Home) stay
  there, and being due holds nothing back. Every "seen" flag stays where it was in the save. What left the queue
  (docs/43 §7: the Day Care, the events, Versus, Trades, the General upgrades, the Shiny and Unown dexes, the invite
  rewards' rules, the raids' overhaul, the Underground, Prof. Oak's tip and invite, Support me) is a Home notice
  (`homeNotices`) and, for a feature with a page, its `RulesCard` there.
- **A passive announcement** (a small world's preview on Home, §22): the switch, but no rules pop-up and no INFO. It has
  nothing to do and no page; it says everything on its face, and the world's own pop-up opens at the start.
- **A rule explained where it happens** (the League's heal between its battles, docs/42): the switch, but no rules
  pop-up and no INFO: it adds nothing to do and no page, and the result card says so the moment it heals.
- **A purely visual change** (the dice throws, docs/37; the game-feel pass, haptics and battle music, docs/38): the
  switch, but no rules pop-up and no INFO: it only changes how something already there looks, sounds or feels, so
  there is nothing to learn or do.
- **A rework with a switch of its own** (the weekly Versus league, docs/44): Off, the feature is what it was. On, its
  page's rules card shows the new rules once more, under their own "seen" flag, to players who knew the feature, and
  Home's notice names the rework.
- **A reworked feature keeps its switch** (the Fortune Wheel's tickets, 2026-10-25): the user chose to rework it in
  place, under the wheel's own switch. Its new rules show once on its page (`events.wheelRulesSeen`) for players who
  had it already; a new player reads them in its unlock pop-up. The Game Corner's slot machine got a switch of its own
  then (`slotMachine.access`, Off): the user took it out of the game for now.
- **Items with a switch** (`game_config.itemSwitches`, `itemOn`): the Link Cable and the Bait (docs/25). Off: not sold,
  not found, not usable, never offered; bags keep theirs. An item is explained where it's met (its description in the
  Mart and the bag; the Bait's die and odds on the catch prompt), so items have no rules pop-up of their own.

## 21. Trades

Players trade through listings, like the games' GTS (docs/23-TRADING-PLAN.md). The pieces are in
`src/components/trades/`, every state of them on `/kitchen-sink` (`TradeKitBits`); the engine (`engine/trade.ts`)
decides every level, landing Box and outcome, and the screens only say them.

- **Where it lives**: the trainer menu's Trades row under Friends (`/trades`), with the gold dot (and on the avatar)
  while a trade that went through is unseen, or "2/4" for listings out. No Home square. A friend's card has a "Their
  trades" list; a Pokémon's sheet has TRADE beside Send on (the main button when there's nowhere to send it), which
  opens New listing with it picked. The trade icon (`trade`, two arrows crossing, gold over blue) marks all of it.
- **The switch and the rules** follow §20: off, the row, the page, the pop-ups and links are gone (the page goes
  Home), except for a player who still has something listed, who sees Mine with a note so it can come back.
  **Inside a small world there are no trades at all** (§22): no row, no page, no TRADE button, and the check, the
  "Trade done!" pop-up and opened links wait until the player is back; nothing in a world's Box is ever offered. The rules
  pop-up (`TradesRulesModal`, the Pokémon Center as its banner) opens once for a signed-in player who can trade.
- **A listing on a board** (`ListingRow`): the listed Pokémon on the left (menu icon, name, ✦, NEW when its landing
  Pokédex lacks it, its region's chip when it isn't the first region, who), "for" and what they want on the right
  (`WantTile`: the species' icon and name, or one tag: gold "Any New" for one they don't own, plain "Any" for
  anything; the listing's sheet says what "Any New" means under it),
  and a line under it: green "You can trade", or why not in plain words (`useTakeWhy`: sign in, friends only, start
  Johto first, no trades left today, you have no Haunter…), the row greyed, and the time left at its far end (so the
  trainer's name keeps its room on a phone). Friends' rows are sky blue with
  the FRIEND tag, yours gold with YOURS, sorted last. A guest's rows have no line.
- **Who can see it** (`VisChip`): Public blue, Friends green, Private (link) navy. **Time left** (`TimeLeft`): "2d 4h"
  and a thin bar of the listing's life, red in its last 6 hours.
- **The listing's sheet** (`ListingSheet`): the sprite large, types, whose, its chips and level, a box with what they
  want (and "You have 2 Pidgey" / "You have no Pidgey"), the time left, then the facts (the level you'd get it at and
  the species' lowest, a trade evolution, the Box it lands in) and one footer: TRADE (or the reason, as a button that
  says it), Connect for a guest, CANCEL / SHARE for yours. TRADE turns the sheet into the **picker** (your Pokémon that
  answer the want, from every region's Box: "You get Charmander Lv.22 (its lowest level)", NEW, STRONGER, ✦ SHINY,
  LOCKED, → Alakazam; blocked ones greyed with why; one that would merge is dimmed with "nothing gained"), then the
  **confirm** (the two Pokémon facing each other ⇄, one plain sentence, **Where it goes** when several of your regions
  list it, the facts as bullets), then the scene. The facts say "Lands in the Box you pick: Kanto, Johto" when there's
  a choice, and that above your best there it waits, locked.
- **The Box pick** (`LandingPick`, docs/23 §1.4): a radio group, a row per region (its name, then what happens there:
  "Joins that Box now" with NEW, STRONGER and "Replaces your Lv.12 there", "nothing gained", ✦ SHINY, or the grey
  LOCKED chip with "Locked until one of yours there reaches Lv.22 (your best: Lv.9)"); the one picked gold, with its
  dot filled. It starts on the first Box where it can play now. On a listing of yours taken while you were away, it is
  the scene's last step (`LandingStepView`: the sprite, "Where does Pikachu go?", SEND IT THERE) before the result;
  Esc doesn't put it off, and until it's made the scene comes back on Home and Mine's Done row says "Pick its Box".
- **New listing** (`NewListingSheet`): three numbered steps on one sheet. A step folds into its pick (gold, with
  Change) once chosen. The species grid shows 3 tiles a row on a phone (112 px tiles on wider screens), a Not owned /
  Owned / All switch with counts and region chips past one region, and 90 tiles at first with "Show more". The
  summary sits gold above the footer's POST, which says what's missing while it can't post.
- **The scene** (`TradeScene`, `tradeTimeline` in `src/fx/timelines/trade.ts`): full screen, held with
  `useHoldFullscreen` so pop-ups wait. The games' trade in three acts joined by their block wipe: your Pokémon says
  goodbye on the link pad (its cry), is drawn into its ball and shoots up; the two balls come out of the gates at either
  end of a cable of light (yours rose, theirs gold), braid along it and cross in the middle (a glint, two rings, sparks,
  a 5-frame hit-stop); theirs comes down a beam onto your pad, bounces, wobbles and opens on the newcomer (its cry,
  white frames, a ring, the shiny's stars). Over the stage, both Pokémon facing each other (Yours ⇄ Misty's); under it,
  the lines in a `Dialogue` text box (beats `sending`, `incoming`, `care`; `bye` and `out` are the cries), each
  Pokémon called by the nickname it carries ("Misty sent Bubbles over!"), each line also in a polite live region. A trade evolution follows with the evolution scene; then what arrived (`TradeResult`:
  sprite, its nickname with the species beside it unless it merged into yours, level, SHINY / NEW / STRONGER / LOCKED, where it went (the Box picked; locked: "It waits in your Johto Box, locked until one of your Pokémon there reaches Lv.22"), the level note, "its Pokédex entry stays") and DONE. SKIP and
  Esc jump to the result. Motion off jumps there at once.
- **Coming back**: a listing taken while you were away waits in the save (`trades.unseen`, `tradesToWatch`) until its
  scene has played: back on Home, once the run is idle and no other one-time pop-up is due, the scene opens by itself
  as **"Trade done!"** with "Misty took your Pidgey." under the title (and stays up to the result). Going back Home with
  a listing out asks the server again (at most once a minute), so a trade made while you play shows up there too. The
  gold dot and the NEW tag in Mine stay until the scene has played (and its Box is picked, `tradesToWatch`); every trade in Mine's Done list is a button that
  plays its scene again. A toast for a listing that came back and for a trade a closed tab left half done.
- **Sharing** (`ShareListingModal`): the message (the Pokémon, shiny or not, its level and what it's wanted for) above
  the link `<site>/t/<code>` with COPY, a line on who can use it, and SHARE (the share sheet on phones). COPY, and SHARE
  where there is no share sheet, copy the message with the link: every link's preview is the same picture. A private listing opens it right after POST. A link opens the listing in its sheet when the
  moment is calm; signed out it asks to connect and keeps the link through the sign-in.

## 22. Small worlds

A time-limited region of its own, built in the admin (docs/21-SMALL-WORLDS-PLAN.md), where a shiny mythical is won. Its
pieces are in `src/screens/events/world.tsx` (the lab in `worldPick.tsx`, styles in `src/styles/world.css`), every state
on `/kitchen-sink` (`WorldBits`). Every rule and number comes from `engine/worlds.ts`; the clocks read the server's time.

- **Its colours**: the admin's three (main, accent, ground) as `--w-main`, `--w-accent`, `--w-ground` (`worldVars`), with
  the ink that reads on each (`textOn`: navy on a light one, white on a dark one). A bad value falls back to Mirage
  Island's purple, pink and lilac. They tint the world's pieces only: the CTA stays red, the money gold, the HP green.
- **WORLD** (`WorldTag`, in the main colour) marks everything of a world; **SHINY MEW** (gold, with the sparkle) is what
  it's for. The mythical is a silhouette glowing in the accent until it's caught, then its shiny colours (`MythicalArt`).
  A world without a mythical is known by its prize (`worldPrize`, docs/26 §2.5: its last shiny raid, SHINY GIRATINA),
  the same way; its rules list its shiny bosses and raids in one row ("Shiny Haunter, Mimikyu, Spiritomb, Darkrai and
  Giratina").
- **Outside, Home's square** (`WorldSquare`) is first among the event squares, on the Live square's frame: the world's
  picture, WORLD and SHINY MEW, the silhouette, the name, the gauge draining and "Areas 3/8 · Ends in 2d 4h" (red in
  the last day). The second line says the partner once the player has been in. A tap goes in (the lab first).
- **Before it starts, its preview** (`WorldPreviewSquareView`, docs/21 §9; its own switch, Off by default): for the
  world's preview hours (48 by default) the same frame stands in the world's slot (`WorldSlot`), its picture greyed and
  dimmed, a slate ring for the accent's, WORLD and SOON, "Starts in" over a ticking clock, the name, the gauge filling
  toward the start in the world's main colour (`PreviewGauge`: red in the last hour, SOON red with it; blinking in the
  last five minutes, still red stripes where motion is calmed) and "Opens {date}". No Pokémon on it. A tap says when it
  starts in a toast; at the start the world's square takes its place on the same tick.
- **The pop-up** (`WorldPopup`): once, between fights, after Prof. Oak's tutorials and the other one-time pop-ups and
  before the live event's (never on the Poké Mart). The banner with the silhouette, the time left and until when, the
  rules (`WorldRules`: XP ×, each booster, the shiny mythical at the end or its shiny prizes, its Pokémon going home),
  Later and Enter.
- **The partner pick** is the lab (§18) in the world's colours (`PartnerMoment` `theme`): the drawn lab in them, the
  picture under a veil of the main colour, the world's name on the ribbon.
- **Inside**, the page wears the world's ground (`.in-world`, faint in dark mode) and a **strip** sits under the top bar
  (`WorldStrip`): its picture, WORLD, its name, the time left (red in the last day) and **Back to Kanto** (the region the
  player came from). It is Home's only way out, and the one way back while the world's content is still on its way
  (`WorldWaiting`). Home shows no region offer and no region switcher; the Areas sheet has no Regions view.
- **Home inside** (`WorldWidgets`) keeps to what the nav bar doesn't reach (the user's call, 2026-10-13): the mythical,
  when the world has one (its silhouette on the world's ground, Lv. · name, where it is: "In Dream Peak", "Waiting:
  fight it!", "In your Kanto Box", "Waits for Johto"; a tap travels to its area once open), then **a row per secret
  area** (`SecretRowView`, docs/26 §2.6), up to six, each two squares wide (`col-span-2`), and **INFO** at the bottom,
  under them (two squares wide): the world's pop-up again, its rules with OK (the user's call, 2026-10-20). The nav bar stays as
  everywhere: the World Mart, the world's own Upgrades, its Team and Pokédex.
- **A secret area's row** is its picture, the whole width (`lv-pic`: darker at the top and the foot), with everything on
  it in `lv-ink` (white, an ink shadow): "Secret area" and a tag at the top, its boss on the right (a silhouette glowing
  in the accent while locked, its shiny colours with the gold glow once open), and on the foot its name, the gauge and
  one gold-light line. **Locked**: the picture greyed, a lock, the gauge and the condition still to meet ("12/20 in
  Pokédex", "Best Lv. 41/60", "Clear Shadow Elite"); a tap says it in a toast. **New** (opened, never played): NEW,
  "Boss: Haunter, Lv.30" (or "Raid: Darkrai, Lv.60"). **Open**: the same with its SHINY chip. **Done**: CAUGHT,
  "Spiritomb caught". Open, new or done, a tap travels there. The line keeps to the name so a phone shows it whole;
  "(Shiny)" is in the label for screen readers.
- **An area waiting for its date** is locked like any other, with "Opens {date}" (the local date and time, `dayTime`).
- **The Poké Mart inside is the World Mart** (`WorldShop`): the world's picture and time left over the admin's list,
  each row with its limit ("8 of 10 left", Sold out), under the usual Buy / Sell tabs: Sell is the world's bag,
  bought back for the world's ₽ (its prices are never below the buy-back, so that can't pay).
- **Upgrades inside** are the world's own tracks (Combos, Dice Types), from level 1, bought with its ₽, like a new
  region's; no General tab inside (its levels hold everywhere, and the world's ₽ are its own). **In battle**, a
  **booster** shows as its own chip, the type's badge and "×1.5" (`BoosterChip`), beside the damage in the readout and
  as its own factor in the damage recap: never hidden in the type's multiplier, never in "super effective".
- **The mythical caught**: its own line on the result card (`WorldMythicalCard`, gold with rays): "The shiny Mew is
  yours!" and where it went ("in your Kanto Box now, to keep", or that it waits for its region).
- **The main game's pages inside** (the events, the Day Care, Versus, by a link or a reload) keep their title and show
  why they wait (`WorldAwayPage`), with Back to Kanto.
- **Closing**: the world gone grey (`WorldByePopup`), once, to whoever played it or saw it open: the mythical kept (or
  "got away"), **where its Pokémon went** ("Your Pokémon went home": "Kanto 8 · Johto 5 · Sinnoh 3", in the regions'
  order, the partner's sprite beside it), and that the world's items and ₽ closed with it. Finished early (below), it
  says "You finished {world}!", its picture in colour and the prize caught, under COMPLETE.
- **Finishing it early** (docs/21 §11; its own switch, Off by default): once every area is done and its Pokédex
  complete, Home inside shows a row first, two squares wide (`WorldFinishRowView`): WORLD and a gold COMPLETE chip over
  the world's picture, "World complete!", "14 areas cleared · Pokédex 124/124" in gold-light and a red **Finish the
  world**. It opens the offer (`WorldFinishView`), which also opens on its own once, between fights, behind the other
  one-time pop-ups: the banner with the prize caught, what was done, three rows (its Pokémon go home, its items and ₽
  close, no way back in), **Not yet** and **Finish the world**. Finishing closes the world as its end does; it stays
  shut for that player, with no square on Home, while it runs for the others.
- **Its Pokémon go home** (docs/26 §1): the rules (`WorldRules`) say so in every world ("Your Pokémon go home": each to
  its own region, locked until your best there reaches its level). In that region's Team screen, under the Box, a
  **Waiting to unlock** section (its count, a line with the region's best now, "Your best: Lv.31") holds them as
  `MonTile`s with `locked` (the tile and its icon greyed, a lock in the corner; "Gengar, Locked until Lv.42" for screen
  readers). Its sheet is the Pokémon's sheet with the lock first (`HomerLock`: "Locked until Lv.42", "Home from
  Haunted Hollow" while the admin still lists the world, "Sent from Kanto" or "Traded by Misty" for one sent on or
  received in a trade (docs/23 §1.4), what it waits for and what it can't do) and only two actions:
  its nickname (the title, as always) and **Let it go** (danger, "Sure? Tap again", a toast). The day it unlocks, a toast
  says so ("Gengar (Lv.42) is unlocked: it joined your Kanto Box!", or one per region for several at once).

## 23. Messages and gifts

The developer answers a player's message (Admin → Messages) or writes to them first (Admin → Analytics → their profile
→ Messages), and either can carry **gifts**: items, each with a quantity (1–999), Pokémon, each with a level and shiny
or not, and Pokédollars (₽1–999,999), at most 20 (migration 0048). Each goes to a region the admin picks or to **the player's latest region**
(the newest one they've started). The engine (`engine/gifts.ts`) decides where each lands and what it becomes; the
pieces are in `src/components/Gifts.tsx`, every state on `/kitchen-sink` (`GiftBits`), the opening on `/kitchen-sink/fx`.

- **The switch and the rules** follow §20: the Gifts switch sits at the top of Admin → Messages (Off by default; the
  server hides gifts and won't open them while it's off, and they wait on their messages). The rules pop-up
  (`GiftRulesModal`, three gifts drawn in code as its banner) opens before the first gift does: Let's go! opens it,
  Later leaves it waiting in My messages. INFO sits at the bottom of My messages.
- **Under the message**: the pop-up of answers (or "A message from the developer!", when the developer wrote first)
  shows the words, then the wrapped gift (`GiftPresent`: gold, the gift wobbling, "3 things inside" — not what: that's
  the opening). Its one button says **OPEN THE GIFT**; closing the message any way opens it. A message with a gift not
  opened yet pops up again until it is (once a page load if it was put off or the server couldn't be reached).
- **Where gifts open**: the main game, outside a small world (docs/21), and for a signed-in player once the sign-in's
  sync has settled. Elsewhere the gift under the message says why it waits ("It opens in your main game", "…once
  you're back in Kanto") and the message closes as usual.
- **Where each one goes**: an item into that region's Bag; ₽ into that region's own ₽ (the money pill bumps when the
  top bar comes back, for the region being played); a Pokémon into its Box as a Pokémon of its own (never merged
  into a copy), at its level within the game's cap and full HP, and into the team when that region is the one being
  played and the team has room. A region the player hasn't started yet sends it to their latest one, and the result
  says so.
- **The opening** (`GiftMoment`, `giftTimeline` in `src/fx/timelines/gift.ts`): full screen, held with
  `useHoldFullscreen` so pop-ups wait. The wrapped box falls onto a warm stage and lands with a squash, wobbles three
  times, each bigger (the anticipation), the bow springs loose, the box crouches and holds four frames, and the lid
  flies off in a burst of light and confetti; then what was inside rises out one by one — items as their pictures, the
  Pokémon as their sprites, a shiny with its two rings of stars — in an arc over the box (six at most; past that the
  last says "+n"; Pokédollars rise as a stack of coins drawn in code), and a short fanfare. The lines (beats `wobble`, `untie`, `opened`) are in the message box below,
  in a polite live region. SKIP and Esc jump to what arrived (`GiftResult`: each thing's picture, name, ×quantity or
  level or ₽, ✦ Shiny, NEW, and where it went: "In your Johto Bag", "Added to your Pokédollars", "Joined your team"),
  then DONE. Motion off jumps there
  at once.
- **My messages** keeps every message with its answer, the developer's own messages, and their gifts: opened ("Opened
  — it held:" and what), or the wrapped gift with OPEN IT (gold), or why it waits. The tab's count adds the gifts not
  opened yet. The trainer menu's **Inbox** row opens it on its own, with the same count (§17).
- **In the admin**, the same gift editor in both places (`GiftEditor`): an item and a quantity, a Pokémon, its level
  and Shiny, or an amount of ₽, each with its region (their latest, or one by name; on a profile, the regions they haven't started say
  where it would go). A message's card says whether its gifts were opened, and when; an opened gift can't be changed.

## 24. The General upgrades and golden names

The Upgrades screen's third tab (docs/25), after Combos and Dice Types, there only while the admin has it on (§20).

- **The tab**: one card each, the combos' and dice' `UpCard`: Capture Luck (10 % a level), Offline earnings (₽2 to
  ₽20 an hour, in whole ₽), I am just rich (one level), the Shiny Charm (its own switch too; the sparkle, "1 in 1,000 →
  1 in 950"). The card says what it does now → at the next level ("None →
  10% chance", "₽10/h → ₽12/h", "Plain name → Golden name"), the pips, the price button or MAX; "I am just rich" shows the player's
  own name, golden, as its picture. The note under the tabs says they're for every region. INFO at the bottom.
- **Its rules pop-up** (`GeneralUnlockPopup`, the Battle Frontier's plaza as its banner): once, from the first badge,
  queued behind the other one-time pop-ups (the world's and the live event's wait for it); opening the tab counts as
  seen. Four rows: Capture Luck, Offline earnings, I am just rich, For every region; five while the Shiny Charm is on
  (its row before the last). A player who read them before the charm was switched on gets the charm's own pop-up once
  (same banner, its title "Shiny Charm", three rows: its odds, where it shines, for every region); opening the tab
  counts as seen too.
- **While you were away** (`OfflineReportModal`): an absence of an hour or more, between fights: the time away, +₽ on a
  warm card with the coin, the rate and the cap. Less than an hour: a toast. Inside a small world it waits.
- **Golden names** (`TrainerName`): the leaderboard (and its Hall of Fame), Versus, friends (list, card, preview), raid
  friends (setup, the ally plate's owner chip, kept light at dusk with `light-scope`), trades (rows, sheet, scene, Done
  list), the Day Care's visitors and its friend picker, and the player's own trainer card. The server says who is
  golden, and only while the switch is on for the one looking. It is decoration: the name is the same words, and a
  screen reader reads just the name.

## 25. Friend invite rewards

Each **new player** someone invites with their invite link (`/f/<code>`, docs/16) who goes on to win their **first
badge** fills that player's gauge; each tier the gauge reaches gives its gifts once. The tiers are the admin's (Admin →
Config → Friend invite rewards: up to six, each a number of friends and its gifts, with the gifts' editor); by default
1 friend a Rare Candy, 2 ₽1,000, 3 a shiny Ditto (Lv.10), 4 a Master Ball. The engine (`engine/invites.ts`) reads the
tiers, places the gauge and puts the gifts away (as `engine/gifts.ts` does a message's); the pieces are in
`src/components/friends/InviteRewards.tsx`, every state on `/kitchen-sink` (`InviteBits`).

- **Who counts** (migration 0051, the server decides): a signed-in player the invite link has just made friends with
  its owner, with no badge in the game that opened it nor on their main card, invited by nobody before (a player is
  invited once, ever), and not someone they invited themselves. They count once their main card first shows a badge
  (their next cloud upload): Extreme mode's badges don't. The friend added that way is told: "Win your first badge and
  Misty gets a reward for inviting you!" Adding by friend ID counts nobody.
- **The switch and the rules** follow §20: Off, no gauge, pop-up or dot, and no invite is counted (what was counted
  and opened stays); On for admin, only the admin sees the gauge and opens rewards, and the players they invite count.
  The rules pop-up (`InviteRulesModal`, friends, a badge and the gift drawn in code as its banner; the tiers listed
  from the config, "1 → Rare Candy · 2 → ₽1,000 …") opens once, and only on the Friends page: the first time a
  signed-in player in the main game opens it with the gauge there (OK; marked seen as it opens). It is not in the
  one-time pop-ups' queue and never opens over another page (the user's call, 2026-10-25). INFO sits at the bottom of
  the Friends page.
- **The gauge**: the tiers evenly spaced (the fill moves evenly between two of them, `inviteFill`), each tile right
  over the end of its stretch of track, the number of friends under it. Gold only for a tier ready to open; a check
  for one opened (it stays opened even if the count drops). The track is a `meter` ("3 of 4 friends with their first
  badge") and the tiles a list with their state in words. The line under it: "2 rewards are ready to open!", "1 more
  friend for Master Ball" or "Every reward is yours"; then the invited friends still on their way, and how a friend
  counts.
- **Where it shows**: at the top of the Friends page, above the friend ID (`InviteRewardsCard`, gold with OPEN IT
  while a reward is ready); in Prof. Oak's invite pop-up (`InviteGaugeCompact`); in the reward's pop-up. Nowhere for a
  player signed out, in Extreme mode or inside a small world. A ready reward adds to the Friends row's dot and the
  avatar's.
- **A reward ready**: between fights, after the rules and the other one-time pop-ups, never over the Friends page,
  once the sign-in's sync has settled: "Invite reward!", who won their first badge (their look and name), the gauge,
  Later (back on the next page load; the Friends page keeps it) and OPEN THE GIFT.
- **Opening** claims every tier reached at once from the server (each handed over once, with the gifts it holds then),
  puts them in the save and plays **the gifts' own opening** (`GiftMoment` with `source="invite"`: "A reward for
  inviting your friends!", then what arrived and where). The status rides with the friend status (game load, return
  to the tab at most every 5 minutes) and is asked again when the Friends page or Prof. Oak's invite opens (at most
  once a minute), only while the switch is on for the player.

  "got away"), and that the partner, the world's Pokémon, items and ₽ closed with it.

## 26. Push notifications

What they say and when, and how they're set up: docs/27-PUSH-NOTIFICATIONS.md. The screens' side:

- **The question comes from the feature, once**: the Day Care page, the raid page and a live event's pop-up (as it
  closes) each ask the first time they open while push is off on this device (`usePushAsk`, `askPush`). It waits
  between fights, never over a full-screen moment, and after the other one-time pop-ups. One pop-up
  (`PushAskModal`): the feature's picture with a gold "Never miss one" tag and the bell, the feature's sentence in
  large type ("Enable push notifications to be notified about upcoming raids"), the rule rows for all three topics
  and "Your choice", then **No thanks** / **Enable** (red). No thanks is final for that feature only.
- **The browser's own prompt only ever follows a tap** on Enable (or Settings' switch): never on load.
- **An iPhone in a Safari tab** sees the Home Screen steps in a blue box (a warning icon, never colour alone) and **OK**
  instead of Enable; it's asked once more from the Home Screen.
- **Settings → Notifications** (`PushSettingsPanel`, under Game): the bell, "This device: Android", the main switch,
  each topic's switch indented under a dashed rule while push is on, and INFO. Blocked by the browser, unsupported or an
  iPhone tab: one line saying so, in words, instead of the switches.
- **Notification pictures** are drawn by the service worker at whole-pixel scales (never a stretched area picture):
  2:1 image, a square icon kept inside the round mask, the white ball badge.
- **A tap while the game is open** moves it to the page between fights; it never reloads the tab.


## 27. The portal run (Distortion World)

An area's special mode (docs/28-DISTORTION-WORLD.md): close Giratina's distortion portals from the inside, in one go.
The pieces are in `src/components/Portal.tsx` and `src/screens/area/PortalRun.tsx`, every state on `/kitchen-sink`
(`PortalBits`); the engine (`engine/portal.ts`) decides every card, boon and number. **Every effect is pixel art on the
game's FX engine**, built like the legend's entrance (§8): the scenes are timelines in `src/fx/timelines/portal.ts`
(on `/kitchen-sink/fx`: the breach over the drawn field and over Distortion World's picture, a portal closing, a wild
Pokémon distorted, the victory), the sprite's distortion is `src/fx/glitch.ts`, and `src/components/PortalFx.tsx` hosts
them on the page. Its palette (`DW`): the void's purples (`#07020d` to `#b05cff`), Giratina's red and gold
(`#e8384a`, `#8a1426`, `#ffc94a`), the rift's teal (`#2fd3c4`), the floating rocks' violet stone and dark moss.
**The world's lasting effects are its identity** (the user, 2026-10-15: "Don't switch the effect off with calm
animations"): the portal turning, the wild Pokémon's distortion, the screen's and the UI's glitches play as in `full`
when the OS asks for calm; the player's Animations → short gives their lighter version; only motion `off` stills them
(`distortionLevel`). The scenes (the breach, a closing, the victory) follow §8 as every timeline does (calm: no quake, no
full-screen flash).

- **The switch and the rules** follow §20: `portalRun` (Admin → Areas → Special mode), Off by default and checked by the
  server for the area's raid; Off, the area plays as before. The rules pop-up (`PortalRulesModal`, the Distortion World as
  its banner: `PortalScene`, four rows from the area's numbers) once, when the area opens for the player, between fights after
  the other one-time pop-ups; Let's go! travels there. INFO sits at the bottom of the area's page.
- **The way in**: CONTINUE there says ENTER THE DISTORTION ("Close 10 portals in a row"). The area's page plays the
  breach full screen (`PortalBreach`, `breachTimeline`, 3.9 s; on a stage of the screen's shape, 2 CSS pixels per art
  pixel on a phone up to 4 on a big screen, the bottom kept for the words): the area's picture (or the drawn field) darkens
  in two pulses, a red point tears, black cracks with a lit lip race out from it (`portal.breach`), the area breaks into
  uneven pixel shards that tumble into the tear (`legend.shatter`), the Distortion World opens behind with rings, a flash
  and a quake: the void's dithered night, far islands floating every which way, rocks drifting upside-down (moss under
  them), the portal turning (dithered rings, Giratina's red-and-gold arms, a dashed gold ring the other way, motes pulled
  in); then the name card (legend.ts's slanted band in the void's purples with red and gold rims, "Distortion portals"
  at 2× when it fits). The line shows from the shards on, in a card of the same colours. **Then it holds its end and
  waits for the player** (the user, 2026-10-15): the open portal keeps turning, its motes and rocks drifting (the
  timeline's `hold`: it goes on drawing past its end), and under the line **"Tap to continue ▼"** (the ▼ blinking, the
  prompt a real button with the focus); a tap anywhere, a click, Enter or Space raises the pop-up over that end. It has no
  SKIP (the user, 2026-10-15): a tap or Esc while it plays does nothing, it plays out; `short` plays it
  in half the time; motion off shows the end at once, still, waiting too. Then its pop-up (`PortalEntryDialog`) **rises
  over the breach's end** (the scene stays under it as its backdrop): at the bottom of the screen and up to 92 % of
  its height (room to read first, the portal above it when there is room; the user, 2026-10-15); the rules scroll inside; then a row with a heart, "Healed as at a Pokémon
  Center: you can still swap Pokémon with your Box before going in." and **TEAM**; the warning in a red-ringed note
  with its icon; **NOT NOW** (Home) and **READY!**. On its own (the kitchen sink) it keeps the Distortion World as its
  banner (`PortalScene`).
- **Arriving there heals, and the team can change until READY!** (the user, 2026-10-15: "like a Pokémon Center"): the
  breach showing heals the team and the Box as a Center does (`arriveAtPortal`, the Center's heal and rules; READY!
  heals the team again, harmlessly). Until READY! the menus stay open, and the Team screen allows the Center's moves
  (`teamSwapsOpen`: at a Center or at a portal's way in, the engine's): no "Swaps at a Center" lock, a Pokémon's sheet
  has the Center's Team section (`TeamSwapActions`: Make lead, Send to the Box, Add to team or swap in for one), and on
  top a dialogue line saying so with **BACK TO THE DISTORTION**. Back on the area (that button, Home's ENTER THE
  DISTORTION), the pop-up is up at once over the breach's end, with no breach or tap to wait for (`run.portalPopup`).
  READY! shuts it all: the run's lock below, and no team changes inside.
- **Inside, there is no way out**: the menus, the gold pill and the avatar are disabled and say "You can't leave
  the distortion until you win or your party is K.O." (`useNavLock`); any other page sends back to the area
  (`PortalGuard`), so does a reload. The area's action bar and the result card have CONTINUE alone, no HOME, the line
  over it. Nothing else changes: the team's sheets, items between fights.
- **The gauge**: the round gauge's place, the same tiles (`DistortionGauge`): a tile per portal, the closed ones lilac
  with a check, the next with the gold edge, "3/10"; an image with "Portals closed: 3/10" for screen readers. On the
  header, over every action bar, on the result card.
- **A distortion** (`DistortionChoiceView`): turned over as soon as the player is back from the card before it (no stop on the area's page first; the user, 2026-10-15), then the team under the boons (`AreaTeam`: who is K.O., how much HP is left), over the run's bonuses. A panel with the void's purple along its top, the small portal turning
  (`PortalArt`, a canvas), "Distortion
  4/10" and "Pick one boon to close this portal", then the boons as big buttons (one column on a phone, three from 768
  px): an icon (a heart; the Pokémon to revive; the type's badge; a die of its type; the first item), a title that names
  what it does ("Heal 30%", "Revive Dusknoir", "Ghost +10", "Extra die: Gengar", "Rare item"), a line with its numbers
  ("6/8 dice", the item odds). Icons: the type bonus is its type's badge; **an extra die** is a die of its type as the
  battle's tray draws one (its 6 face) with a pixel "+" on a gold corner badge (`ExtraDie`); **a rare item** turns
  through the items it can give (the area's odds, so the admin's list), the next every 2 s with a pop in three pixel
  steps (`ItemCycle`, `.portal-pop`; a calm OS keeps it; motion off: the first item, still). Its button's name is
  "Pick: …". **A pick asks first** (`BoonConfirm`, the user's ask of 2026-10-15): a small pop-up "Take this boon?" with
  the boon's icon, title and line, **BACK** (Esc too; back to the boons, nothing spent) and **CONFIRM** (red, with the
  focus, so Enter takes it). CONFIRM closes the portal over the page
  (`PortalCloseFx`, `closeTimeline`, 1.6 s, `short` 0.9 s, catching no tap): it throbs once, spins faster and collapses
  into its middle while its rim breaks into shards pulled in after it (`portal.close`), a white flash where it was, then
  a gold seal ring with eight marks turning round it fades out through the dither; a toast counts the portals sealed.
  Motion off: the sound alone. It waits in the save: a reload shows it again.
- **The run's bonuses** (`RunBonuses`) over the team between encounters: each boost as its type badge and "+20 damage",
  each extra die with whose it is; "None yet" before the first.
- **The wild Pokémon are distorted** (`glitch.ts`, on the battle stage by `useStageDistortion`, on the preview by
  `GlitchSprite`), **on the page's own animated sprite**, so nothing lags behind it (the user, 2026-10-15: the layer
  behind the sprite didn't move with the animated Pokémon, and it was a little too much). Between bursts: a faint rim of
  its own shape, violet and teal a pixel each side (CSS `drop-shadow`s on the sprite, `restCss`), and the void's motes
  rising off it on a canvas over it; no glow or copy behind it. Every 5 s, for 0.35 s in four frames, the sprite itself
  is torn and split (`burstFrame` → `burstCss`): 2–3 bands of rows shifted 2–4 art pixels sideways (1 on the last
  frame; an SVG filter of its own per sprite, `tearPrimitives`: a flood per band whose red says how far its rows move,
  `feDisplacementMap`, hard edges), hard see-through colour copies 1–2 pixels behind (violet, lilac and teal, Giratina's
  red, teal), a violet tint on two frames: the first shader's look, a third softer, still clearly there. `short`: the
  copies only, no tear, no tint; a calm OS: as in full; motion off: the rim alone, still. Never a blur, never faster than
  3 a second. The FX lab draws the same frames on its canvas (`drawDistorted`). The preview shows it too, and
  "Distorted: it can't be caught." in place of the catch hint; no NEW / caught tag.
- **The screen's distortion** (`DistortionFx`, over the page under the dialogs, no taps; a canvas at 3 CSS pixels per
  art pixel): nothing between tears (no frame round the screen: the user, 2026-10-15, "the purple contour on screen is
  too much"); every 6–10 s a tear of 0.45 s in four frames: two or three bands of broken scanlines (lilac, teal), blocks
  of the void displaced along them with lilac and red edges, a few stray pixel blocks, and the page's colours shifted to
  the void's violet for three of the frames (a `mix-blend-mode: color` layer at 35 %). `short`: one thin band every
  12–18 s, no shift; a calm OS: as in full; motion off: nothing.
- **The UI glitches** now and then (`useUiGlitch`, from `DistortionFx`, the player's ask of 2026-10-15): every 5–9 s
  one piece of the page, picked at random (anything tagged `data-glitch`, the page's panels, buttons and pictures such as
  the gauge, the boons, the team's cards and the action bar, the header's title, a toast), plays the wild Pokémon's look
  for 0.35 s, as soft as theirs (`.ui-glitch`: torn sideways by the SVG warp, split into hard see-through violet, teal
  and red copies 1–2 px off, in four steps). One at a time; never inside a pop-up (what the player is reading there
  stays put; the page behind it may glitch), never on what holds the focus, nothing big (over 30 % of the screen) or off
  screen. Classes only: the words and the accessible names don't change. `short`: the copies only, 0.25 s; a calm OS:
  as in full; motion off: none. Tune it in one place (`every`, `dur`, `selector`); the kitchen sink's demo runs it every
  second on a few pieces.
- **The victory** (`PortalVictoryView`, `victoryTimeline`, 6.2 s; `short` 3.1 s): legend.ts's entrance for shiny
  Giratina on the Distortion World: the last portal throbs in two dark pulses, shadow tendrils whip out of it (black, red
  at the tips), two heartbeats, its silhouette rises out of the portal in a flickering red-and-gold outline (what is below
  the portal's middle shows only inside it), red rays turn behind, a gleam; the reveal: a flash, rings, the roar
  (`legend.roar` and its cry, `playCry`), a quake, a burst in Giratina's colours, the shiny sparkle (two rings of stars,
  the shiny chime); the portal behind it collapses and seals (`portal.close`, the gold seal ring); the name card (its
  name at 2×, SHINY and its raid level). Then "Every portal is closed!", the line that it is in the raids now, and
  two buttons under the card (the user, 2026-10-15): **HEAL & START RAID** (red, the main action, with the focus): the
  team and the Box healed as at a Pokémon Center and the victory marked seen (the engine's `portalVictoryToRaid`), then
  the area's raid page (Giratina's, in the world); under it the green **BACK TO THE WORLD** (`success`: Home, where
  CONTINUE is RAID: GIRATINA). No skip, it plays out (the user, 2026-10-15); motion off, it is there at once. It waits in
  the save until seen.
- **A wipe** keeps the wipe card (§14), its line saying the portals closed opened again and the run's bonuses are gone,
  that XP, ₽ and items stay and the team is healed.
- **Giratina's area raid** (the raid of an area in portal mode; the user, 2026-10-15: "themed so it's still in the
  event theme"). Only its look changes: its rules, numbers, server checks and every other raid stay as they are.
  - **Its page** (`ProgressRaidScreen`, `src/screens/events/PortalRaid.tsx`) in Distortion World's violet night
    (`.dw-scope`, §2): the void as the page's ground (`DistortionGround`: a fixed canvas, its rocks drifting; the page's
    own ground steps aside, `html[data-dw-page]`), the portal turning as its banner under the plate, its card on the
    raid's stage with shiny Giratina distorted on its island and the portal right behind it (`PortalRaidCard`), START
    with its sheen, the lock, the team, the group, the ball odds; the screen's tears and the UI's glitches
    (`DistortionFx`, its pieces tagged `data-glitch`).
  - **Its pop-ups** (the NPC partners, the team editor, the friends' sheet) in the violet night with Giratina's red and
    gold along their top and bottom (`.dw-modal`); the NPC partners' has the portal and Giratina distorted as its banner
    (`Modal banner`). Each tears in once as it opens (`useTearIn`: the UI glitch's look on the panel, 0.35 s), then stays
    put while it's read (no glitch inside a pop-up).
  - **Its fight** (`RaidView`): the stage in the Distortion World (`BattleStage world="distortion"`, `RaidStageArt`: the
    void, rocks drifting upside-down, the portal turning far behind Giratina, the floating islands they stand on; the
    timelines draw no background over it), shiny Giratina wearing the wild Pokémon's distortion (the softened level), the
    panel in the violet night, the screen's tears and the UI's glitches, and a tear across the stage when a bar breaks
    (`StageTear`: four frames, one violet shift; calm: no shift). On the last bar Giratina's Origin Forme is unleashed
    (every raid's Giratina, 2026-10-16): the stage's `unleash` scene (`unleashTimeline`: the dark, tendrils,
    heartbeats, its two forms flickering in red and gold, the reveal), and at the reveal (its `contact` cue) the line
    "Giratina's Origin Forme is unleashed! +1 Dragon die!", the gold UNLEASHED! banner and its cry, read while the
    scene holds on the new form (1.6 s).
  - **Its entrance** (`RaidIntro world="distortion"`, `raidEntranceTimeline` in `src/fx/timelines/portalRaid.ts`, on a
    stage of the screen's shape at 3 to 4 CSS pixels per art pixel): two dark pulses, a red point tears and cracks race
    out, the portal opens and turns, shadow tendrils, two heartbeats, shiny Giratina's silhouette rising out of the
    portal in a flickering red-and-gold outline, red rays and a gleam; the reveal on the raid intro's white-out (2.75 s:
    a flash, rings, the roar, a quake), the shiny sparkle; then it hovers in front of the open portal, torn now and then.
    The raid intro's words lie over it at their usual times (its tapes in Giratina's red: "Warning · the portal tears
    open", "Giratina comes through the portal"; the name, the bars, the trainers, GO!). **No Skip** (the user,
    2026-10-15, as the breach and the victory): a tap or Esc does nothing, it plays out (6.2 s); motion off goes straight
    to the fight.
  - Motion: `off`, everything still (the stage and the card one frame, no tears, no glitches); a calm OS keeps them (the
    world's identity); `short`, their lighter versions.
- **The raid's page** before the victory: the lock says to close every portal of the area; the area's details say
  "Opens when every distortion portal is closed".

## 28. Trick or Treat

An encounter card (docs/29-TRICK-OR-TREAT.md): a ghost from the area's list floats in; Treats fill its gauge, a Trick
Ball rolls a d6 against the gauge's section, a miss pushes the gauge up, the flee zone ends it. The engine
(`engine/trickOrTreat.ts`) decides every number and outcome; the pieces are in `src/components/TrickOrTreat.tsx`, the
screen in `src/screens/area/TrickView.tsx` (`TrickScreen`, `TrickRecap`), the animations in `src/fx/timelines/trick.ts`
and the battle's `catch.ts`; every state on `/kitchen-sink` (`TrickBits`), every timeline on `/kitchen-sink/fx`.

- **The switch and the rules** follow §20: Off, the card is never dealt (no tile on the round gauge, no share in the
  area's round mix). The rules pop-up opens the first time a ghost floats in, over the screen (Later / Let's go! both
  carry on); INFO sits at the foot of the panel.
- **The card**: a pumpkin on the round gauge and its preview row; its preview is the ghost on a night tile, its name,
  rarity chip, level, NEW, "Treats and Trick Balls are free and endless", and one red button, TRICK OR TREAT!. The
  card can't be skipped (a card the player meets, like the Game Corner), but on the screen a small **FLEE** leaves the
  ghost be (below).
- **The screen is the battle's** (§14), the user's request of 2026-10-15: full screen (`useHoldFullscreen`: no top bar,
  side nav or tab bar), the battle's column (phones: the whole width; wide screens: up to 700 px, as big as the height
  allows with the panel in view), and it fits a 360×640 phone with nothing to scroll (`e2e/trick-or-treat.spec.ts`).
  - **The stage** on top, the battle's own size and framing (240×160 art pixels scaled, the area's picture cut as the
    battle cuts it), the ghost at its centre as the page's animated sprite, floating a pixel a step, its shadow under
    it; its plate top left as a foe's (`PlateBox`: name, ✦, level, types, the rarity chip; no HP).
  - **The panel**, top to bottom: the message box (the battle's `pixel-dialogue`, a polite live region, the numbers in
    words: "Rolled 4, needed 5+: … The gauge rises by 35!"); the gauge's row: on the left what the last step did (the
    Treat's picture, or the Trick Ball's die, `≥` or `<`, and the die it needed), on the right "+35" and the value
    "62/100"; the gauge; **TREAT** (white, the Treat's picture, "+10 to 30" under it) beside **TRICK BALL** (red, the
    one main action, the die it needs here with its "+" and "33% · miss +35" under it, from the engine), in the
    battle's `1fr / 1.4fr` grid; INFO at the foot, and at its right a small **FLEE** (`PixelButton` `sm`, the run
    icon; the user's call, 2026-10-20) for those who'd rather skip it: it waits while a step plays, and goes straight
    back on the trail with "Got away safely!" (no result card).
  - **The result card** rises over the panel as a battle's (`Overlay`): the title ("Gastly caught!" / "Gastly fled"),
    the catch as the battle's `CatchCard` (the Trick Ball rocking in, the ghost, Gotcha! and NEW, "was caught", where it
    went: the team, the Box, in place of a weaker copy, or into yours) or the ghost greyed with "It vanished into the
    night", a secret area it opened (`SecretAreaCard`), then the round gauge and **CONTINUE** (back on the trail).
- **Motion** (§8), on the battle's stage with the game's pixel FX, never CSS tweens: a step plays as a timeline over the
  stage (`StageCanvas`), the page's sprite hidden meanwhile, as the battle's catch. **The Treat** (`treatTimeline`): the
  ghost perks up, the Treat flies from your side in an arc, a quarter turn at a time, trailing gold twinkles; the ghost
  opens wide, catches it (a 4-frame hit-stop, two warm silhouette frames, a pop of gold), munches (three
  squash-and-stretch chomps, crumbs on the pumpkin ramp, hearts rising), then the gauge fills (`fill` beat: a dithered
  glow behind it, a gold ring bursting out, "+" sparks, a soft warm flash unless calm). **The Trick Ball** is the
  battle's catch timeline with the Trick Ball's picture (`ball: 'trick'`, drawn pixel for pixel from
  `public/items/trick-ball.png`: it turns, opens on its hinge, its button flashes, it darkens once caught), the ghost
  awake at the centre (`at`, `awake`): the same throw arc, beam, drop and bounces, wobbles and vignette, then Gotcha!
  and its stars, or the break-free. The die and the result show together on `catchResult`, never before. A miss that
  leaves it there is Capture Luck's stay ("!" and two hops: restless); one into the flee zone, and too many Treats, end
  in **the ghost's flee** (`ghost`): it shivers, then rises in pixel steps while it dithers away into purple wisps, and
  the area dims under it. The buttons wait while a step plays. `short`: the toss or the throw, then the result at
  once. `off`: the stage jumps to the end, every cue fired, every message kept. `calm`: no idle float, no flash.
- **Sound** (§9): `trick.toss`, `trick.munch`, `trick.fill`, `trick.flee` on the Treat's cues, the catch's own throw,
  open, close, wobble, settle, Gotcha!, break-free and stay on the Trick Ball's, `trick.fill` as a miss pushes the
  gauge and `trick.flee` as the ghost leaves.

## 29. The nightmare (Newmoon Island)

An area's special mode (docs/30-NIGHTMARE-AREA.md), Darkrai's dream: seven fixed rounds, its shadow striking the team
after each, no travel until the player wakes up. Built as the portal run's parallel (§27); the pieces are in
`src/components/Nightmare.tsx`, `src/components/NightmareFx.tsx` and `src/screens/area/NightmareRun.tsx`, every state on
`/kitchen-sink` (`NightmareBits`, `NightmareRaidBits`); the engine (`engine/nightmare.ts`) decides every foe, number and
outcome. **Every effect is pixel art on the game's FX engine** (`src/fx/timelines/nightmare.ts`, `nightmareRaid.ts`; on
`/kitchen-sink/fx`). Its palette (`NM`): the night's blues and purples, the full moon's creams, Darkrai's black smoke
with a lilac edge, its red and its eye's ice blue. **Its lasting effects follow §8** (a calm OS stills them,
`nightmareLevel`), unlike the Distortion World's.

- **The switch and the rules** follow §20: `nightmare` (Admin → Areas → Special mode: nightmare), Off by default and
  checked by the server for the area's raid. **Its rules are short** (the user: "no need for that much details"): four
  one-line `RuleList` rows (a row's text may be left out: the title alone), from the area's numbers and nothing more:
  "7 rounds of nightmares", "Darkrai's shadow takes 10% HP after each round", "Items after rounds 3 and 6", "No travel
  until you wake (the shop stays open)". They are on the way in's pop-up, and from INFO at the bottom of the area's
  page (`NightmareRulesModal`, the moon as its banner).
- **The way in** (`NightmareEntry`): the Distortion World's, piece for piece (§27). CONTINUE on Home says ENTER THE
  NIGHTMARE; it, or any way into the area before the nightmare begins, plays **the intro at once** (`NightmareIntro`,
  full screen: Darkrai's silhouette across the full moon; the line in a night-blue card from the moment the shadow slows
  in front of the moon; held at its end, "Tap to continue ▼" with the focus; no SKIP; motion off, its end at once).
  Arriving heals as a Center does. The tap raises its pop-up over that end, at the bottom, up to 92 % of the screen
  (`NightmareEntryDialog`, "Into the nightmare"): the short rules, "Healed as at a Pokémon Center" with TEAM (the team
  can change until it begins, `teamSwapsOpen`; back from the Team screen the pop-up is up again at once, no intro:
  `run.nightmarePopup`), NOT NOW and BEGIN THE NIGHTMARE (red), which starts round 1. Once under way, a reload or a trip
  Home never plays the intro again; after a wipe the next way in does.
- **The gauge** (`NightmareGauge`): the round gauge's place, a tile per round with a pixel moon (lit once survived, half
  in shadow for the one under way with the gold edge, dark to come), "3/7"; an image with "Nightmare rounds won: 3/7".
- **The foes**: the preview says "Nightmare 3/7" over the name and "A nightmare: it can't be caught." in place of the
  catch hint (no NEW / caught tag); their fights stand under the moon (`BattleStage world="nightmare"`). **Each foe is
  haunted** (`BattleStage haunted`, `HauntSprite` on the preview): a rim of the smoke's black an art pixel round its own
  sprite with a faint violet edge (zero-blur drop shadows, `hauntCss`, following every frame and never over it), its
  black rising a pixel every 1.2 s; behind it a dark pool under its feet and black smoke drifting slowly up
  (`hauntLoop`). Never on the player's side or the HUD; gone while a move plays. Short: no breath, half the smoke; off
  or a calm OS: the rim and one still frame.
- **The result card** adds "Nightmare 3/7 survived" (or "The last nightmare is over!") on a night card, and a round's
  gift on a gold-pale card with the item ("Something glimmers in the dark: Revive!").
- **Darkrai's strike** (`NightmareStrikeView`): after a round, on the area's page: the 2:1 scene over the team's cards;
  when the beams land the engine takes the HP and the cards drain, each flashing twice and shaking (`.nm-struck`; not
  when calm); the line says the share it took; **On to round N** (red, the focus once landed) brings the next foe. It
  waits in the save until it lands, and stays on the page until CONTINUE (`run.nightmareStruck`).
- **The lock**: only travel shuts. Home's **Areas** button turns into a lock (hatched, `aria-disabled`, "Areas: locked
  during the nightmare"; a tap toasts the reason) with the reason under the bar in a well with a lock icon; the green GO
  TO is hidden; the world strip's Back to … is hatched with a lock and says why; the area's action bar keeps HOME and says
  why too. The Mart, the Team, the bag and the menus stay open. **No screen effect meanwhile** (the user: "side screen
  effects make the screen VERY hard to read"): no vignette, no smoke at the edges, no shadow over the page or across the
  moon; only the foes are haunted.
- **The waking** (`NightmareVictoryView`): full screen; "You woke up from your nightmare, Darkrai awaits" in ice blue on
  the night card, the raid line, HEAL & START RAID (red, the focus) over the green BACK TO THE WORLD; no skip.
- **A wipe** keeps the wipe card (§14), its line: the player woke up in a cold sweat, the rounds back to 1, XP, ₽ and
  items kept, the team healed.
- **Darkrai's area raid** wears the nightmare: its page (`.nm-scope`, `data-nightmare-raid`, the night as the page's
  ground, `html[data-nm-page]`, the moon as its banner, `NightmareRaidCard`), its pop-ups (`.nm-modal`, the NPC
  partners' with the moon and Darkrai as its banner, `useShadowIn`), its fight (`BattleStage world="nightmare"`, a bar
  breaking: `StageShadow`), the screen's vignette on its page and fight (`NightmareFx`: the night thickening at the
  edges, smoke at the sides, Darkrai's shadow passing over now and then, a piece of the page darkening as it brushes it,
  `.ui-shadow`) and its entrance (`RaidIntro world="nightmare"`, no Skip, its tapes in the night's blue and
  the moon's cream). Its rules, numbers and server checks are the area's mode's (docs/30 §1).

## 30. Day and night (Johto)

Johto keeps the time (docs/32-DAY-NIGHT.md): 6:00–17:59 the day, 18:00–5:59 the night, on the player's clock; a wild
Pokémon met only in one half comes only then. The pieces are in `src/components/DayNight.tsx`, every state on
`/kitchen-sink` (`DayNightBits`); the engine (`engine/dayNight.ts`) decides the time and who comes.

- **The switch and the rules** follow §20: `dayNight` (Admin → Config → Day and night), Off by default. Wild Pokémon
  are dealt on the device, so no server function reads it. Its rules pop-up (`DayNightRulesModal`: the day's sky and
  sun beside the night's sky and moon as its banner; three rows: day from 6:00 to 18:00, night from 18:00 to 6:00,
  they stay in their areas; the hours in the player's language, `hourOfDay`) shows once, the first time in Johto with
  it on, queued behind the other one-time pop-ups. **Its INFO is the top bar's chip**: the feature has no page.
- **The top bar** (`DayNightButton`): far left, before the energy, only in Johto. A 44 px-tall button around a chip:
  `bg-sky` with the sun by day, `light-scope bg-night` with the moon by night (`DayNightChip`, the `daySun` /
  `nightMoon` icons, 16×16 in the tab bar's palette). Its name says the time and its turn ("It's day in Johto until
  18:00. Tap for the rules."). Re-read every 30 s.
- **The fights** (`BattleDayTime`): the same chip, small (16 px icon), on the stage's top right corner of every fight in
  a Johto area; not in Versus. It never covers a plate and takes no taps.
- **The lists** (the area's details, the area's Pokédex): a 12 px sun or moon by a species met in one half only
  (`DayNightTag`, its name "Day only" / "Night only" as its title), at half opacity while it's the other half; its share
  is the one when it's met. Untagged species show nothing.
- **The Pokédex entry's places** (where to find it): each place where the species comes only by day or only by night
  carries a chip under its line (`DayNightPill`: the sun and "Day only" on `bg-sky`, the moon and "Night only" on
  `light-scope bg-night` in `gold-light`), whatever the time now. The Pokédex's **Nearby** filter counts only what the
  hour brings.

## 31. Double battles

Two of yours against two foes (docs/33-DOUBLE-BATTLES.md). The engine (`engine/doubles.ts`, `engine/battle.ts`)
decides when, who acts, who is hit and every number; the battle screen only moves the pair in front as the log says.
The pieces are in `src/screens/battle/DoublePlates.tsx` and `BattleStage` (`DoubleMons`), every state on
`/kitchen-sink` (`DoubleBits`).

- **The switch** follows §20: `doubleBattles` (Admin → Config → Double battles: the switch, the regions, the wild %),
  Off by default. **No rules pop-up and no INFO** — the one exception to §20's rules, the user's call of 2026-10-17
  ("remove the rules pop up"): the preview's two foes and "Send out two:" say it all. No tag on the preview either.
- **The preview** says so: a wild pair's title is "Two wild Pokémon appeared!" with both cards; a duo trainer "want to
  battle together! (3 Pokémon, two at a time)". **The lead picker sends two** ("Send out two:"): the first two able are
  picked; SWITCH on a third replaces the earlier pick.
- **The stage shows all four.** The pair in front — the Pokémon whose turn it is and its target, or the foe acting and
  the one of yours it aims at — stand on the usual spots at full size, where every move's timeline draws them; their
  partners stand **behind, smaller** (×0.7 / ×0.66, up the stage and to the left, half hidden by the one in front, a
  soft shadow under each). When the turn passes they **slide** to their new spots (0.3 s × pace; at once with animations off).
  The timelines draw no background in a double battle, so those behind stay on the page under them.
- **No names on the plates** (the user: "Pokémon names can be removed from the UI to get space"): each plate is the
  Pokémon's mini icon, its level, its HP bar (numbers on yours only) and statuses, MEGA / G-MAX; foes at the top left,
  yours at the bottom right, in field order (they never jump about), **the one in front ringed in gold**; a K.O.'d one
  greyed until another takes its spot; a trainer's party pips under the foes' when it has more than two. Screen readers
  get the name and level from each plate's label.
- **The target**: on your turn, under the dice, "Attack:" and a radio button per foe standing (its icon and HP bar, the
  picked one ringed in gold with the sword), 44 px tall; tapping the foe behind on the stage picks it too. Hidden with
  one foe left, and in auto mode (which aims by itself).
- The heading and history name every Pokémon out; the opening line names both foes and both of yours; the victory card
  names every foe defeated.
- **A wild pair's catch** (the user, 2026-10-19): a foe that can be caught doesn't faint away when K.O.'d — it stays on
  its spot, **worn out** (greyed, dizzy stars, its plate greyed, not a target), behind the one still fighting, until
  that one falls too. Then a throw at each, **one after the other with nothing between them**: the first K.O.'d slides
  in front for its throw while the other waits worn out behind (it stays through the throw); then the other's. The
  rewards come after both; each "Add to team?" is asked there in turn (CONTINUE sends the one asked to the Box and
  shows the next).
- Switching: the bench only (those out aren't offered); after a K.O. the replacement is picked as in one on one.

## 32. The Underground

A live event type (docs/34): Explorakits open walls, the pickaxe die digs them, orbs, fossils and plates come out.
Its switch is its own (`underground.access`, §20) on top of the live events' one; its numbers are the admin's
(game_config `underground`). Components in `src/components/Underground.tsx`, all on `/kitchen-sink`.

- **The treasures are Platinum's** (`UgSprite`, one sheet: `pnpm underground-sprites`, docs/34 §10): spheres, plates,
  fossils as the game draws them in its wall, pixelated, each filling the tiles it takes as much as its shape allows
  (`fit`), never stretched; elsewhere at a set width (`px`). Orbs, plates and the cave's gems all use them.
- **Art, not theme**: the cave (`UgCave`), the crack gauge and the wall are drawn in code and stay the same in Daybreak
  and Dusk (§2 "Art stays art"). The cave keeps its size on a wide screen: a scene at most 320 px wide, centred, rock
  on both sides. With no picture picked by the admin, it is the live event's picture (Home's square, the Mart's section).
- **Home's square** is the live square (§ docs/20; one per live event running, so it may sit beside a Cash Flow's or
  a Shiny Parade's) with the type's tag (a dark chip, the pickaxe, DIG) and the kits held
  as its line ("Explorakits: 2 · +1 in 5h 12m"); a tap opens `/underground`. The Mart's tab wears KITS while it runs.
- **Its pop-up is its rules** (`UgRulesModal`, the cave as banner): once per event (it also marks the live pop-up
  seen), Later / Let's go! to the page; INFO at the bottom of the page shows it again with OK.
- **The page** (`/underground`): the cave banner with the plate (back, title, time left); Explorakits (warm card: kits
  held, free over cap and bought, the next free kit or "full", BUY KITS and the red DIG A WALL, or RESUME THE WALL);
  the pickaxe (level of max, its faces as dice, the next level's with its raised face ringed in gold, the gold upgrade
  button or what's missing); the team seats; the orb bag (a table, colour × size; SELL in green in a full team; outside
  one, the solo price: a red-ringed warning note with the share and both prices (`UgSoloWarning`), the white "Sell for
  10% · ₽…", then a confirmation before anything sells (`UgSellModal`: both prices, the full one struck, "You give up
  ₽…", KEEP MY ORBS / the red SELL FOR ₽…); with a solo share of 0, hatched with the reason in words); the plates (17 tiles, the held ones in their type's badge colours, a dashed "?"
  for the rest); the end-of-event note; INFO. Outside the event (or before its content arrives) the page says it isn't
  open and offers Back Home, never a silent redirect.
- **The dig** (`/underground/dig`, full screen, `useHoldFullscreen`): the title and LEAVE FOR NOW (the wall waits in the
  save); the crack gauge (`CrackGauge`: a zig-zag band of slanted slabs, one per strike, alternately falling and rising,
  so it's both countable and a crack; intact slabs light rock, broken ones dark holes with a bright crack running
  through them from the right; the rock left red in the last three, shaking unless calm; `role="meter"` with "N strikes
  left", the count over it large, red in the last three); the wall (`UgWall`): what's buried drawn underneath, the tiles
  edge to edge on top (a gap would show what lies beneath), each a button labelled "Row r, column c: n layers" / "dug
  out, part of the …", its depth as rock colour **and** dots; then what's still buried and the kits left; the footer
  with the rolled die (`PickaxeDie`, tumbling), the line that says what the roll did, and the die's faces with the one
  that came up lifted and ringed. At the end: "Everything dug out!" or "The wall collapsed!" and the red SEE THE HAUL.
- **The haul** (`HaulList` in a `Modal`): a line per thing, a new plate first (gold card, NEW, "Arceus can now turn
  Fire!"), then the fossil (to the Box, reviving), orbs (Orb bag / To Dawn, with whose colour it is), and what was lost
  in the rubble (a grey line); DONE and the red NEXT WALL · n.
- **Motion**: the pickaxe strikes **where the finger landed** (a key press: the tile's centre): raised, a wind-up, down
  on the spot at 90 ms (`UG_IMPACT_MS`), a hit-stop, a recoil, frame by frame. Everything waits for that impact: the
  tile flashes two white frames and its hit neighbours one, dust flies in steps, the wall gives (more for a bigger
  roll), the gauge's broken slab flashes and sheds chips, the band jolts, the count bumps, the sounds play. Short: the
  pickaxe's impact frame only and the flashes at once (no dust, give, chips or jolt); off: nothing moves. A thing
  fully dug out glints, and its name pops over it in a gold tag ("Dug out: …!" in the footer's line). The collapse
  drops the tiles in steps (full) or gives one thud (short). Calm stills the shakes, the jolts, the give and the
  glint. Sounds: `ug.strike` (lower the bigger the roll), `ug.found`,
  `ug.collapse`.
- **The team** (`UgTeamPanel`, `UgTeamSheet`): the three seats (you, a friend, a free seat; solo: dashes and the line
  that every orb is yours) and a button: TEAM UP, MANAGE, or a gold INVITATIONS: n. The sheet: invitations to answer
  (gold cards, DECLINE / the green JOIN, the line that joining leaves your team), the seats, your friends with INVITE
  (green), "Invited · waiting" with CANCEL, "In your team"; LEAVE THE TEAM; signed out, the line and the sign-in button.
  A server refusal is a toast in words (team full, friends only, too many invitations).
- **Arceus**: while the Underground is on, the battle's TYPE menu lists the types it may take (its plates) and, after
  them, the locked ones greyed with a lock and their plate's name, and a line on where plates come from; the TYPE
  button shows even with no plate, so the lock is explained. Its sheet says which plates it holds. Foes are untouched.

## 33. The battle powers (Mega Gems, Gigantamax, Z-Moves)

Three switches (docs/35), each Off / On for admin / On for everyone. Off, Mega Evolution and Gigantamax are as before
and there are no Z-Moves. On:

- **Rules, once and on demand**: a power's pop-up (`PowersUnlockPopup`, `PowerRulesModal`: its leader's area as the
  banner, the badge that opens it, what it does with the config's numbers, how Versus and auto battles use it) the first
  time its badge is won, on its turn in the one-time pop-ups' queue (§20; the gifts' and Trick or Treat's rules, which
  open at their own moment, no longer hold it back); Mega Evolution's Let's go! opens the Mart. INFO (`PowerInfo`)
  under the Mart's Mega Gems and on the Pokémon sheet, beside each power's line.
- **In battle**: MEGA, G-MAX and Z-MOVE (`ZMoveButton`) are gold, in the extras row; Z-MOVE comes after the roll and
  ends the turn as ATTACK does. The Z-Move timeline plays before the attack's own (`src/fx/timelines/zmove.ts`; short
  motion: a flash of the type's colour), and the attack's own is the type's move as its Z variant (§9's table). A timed Mega changing back is a flash, no scene.
- **A gem from a badge** is a toast ("Korrina gave you the Lucarionite!"), however long after the badge it comes.
- Never inside a small world: no button, no shelf, no pop-up.

## 34. Idle mode and the play styles

One setting of the one save (docs/36): **Auto on explored areas** (the default) or **Idle**, behind its switch (§20, Off:
none of this shows, auto-mode is a cleared area's fights as before). Every decision is the engine's
(`engine/autopilot.ts`); the screens carry the steps out and pace them. The pieces are in `src/components/IdleMode.tsx`,
every state on `/kitchen-sink` (`IdleBits`).

- **The styles are cards** (`PlayStylePicker`): an icon (map, dice), the name, one line; a radio group, the picked one
  on `gold-pale` with `shadow-card-gold` and a check (never colour alone), arrow keys move it. They are in Settings →
  **Play style**, under Game (`PlayStylePanel`, its INFO under the cards), and nowhere else: a new game asks nothing
  (the user's call, 2026-10-25). A pick there applies at once.
- **The area's switch** says what runs: AUTO-MODE (auto-mode, Auto on explored areas) or **Idle mode** (Idle), ON in
  green, OFF ghost (`AutoModeButton`). Prof. Oak's tip is auto-mode's only. It sits where the style offers auto
  (`autoAvailable`): Auto on explored areas in cleared areas, Idle everywhere but the special areas.
- **While the autopilot runs, the cards it takes don't open**: the encounter preview, the Center's healing scene and its
  team section, the Game Corner. One `pixel-dialogue` line (`AutopilotNote`, `role="status"`) stands in for the moment
  it takes. What it shows for a moment and then closes itself: the area's page between encounters (~1 s), the result
  card (whole at once, 1.6 s), each evolution (played in full, 1.8 s after its reveal), the wipe and stalemate cards.
- **Idle catches by itself** (docs/36 §3.1, `chooseIdleBall`): the catch panel shows the ball it picked, chosen, for
  0.9 s, then the throw plays on the stage as the player's would; a Pokémon it leaves (owned, or no ball that could
  catch it) passes after the same 0.9 s, a toast saying when it was for want of a ball; a Bait offered is kept,
  THROW AGAIN taken 1.4 s after the result; "Add to team?" answered no (to the Box). The style's card says so ("catches
  too: new Pokémon, never with the Master Ball"); the rules are INFO's only: **Idle has no rules pop-up** (the user's
  exception to §20).
- **It stops only for the player's choices**: under Auto on explored areas, the catch panel (the ball, the Bait,
  THROW AGAIN; its result then moves on after 1.4 s) and "Add to team?"; in both styles Trick or Treat, and any
  dialog that is open (a one-time pop-up, a sheet the player opened, Settings opened mid-fight): it waits for it to
  close, the fight's own moves too (§14) and Idle's throw. Never an item but Idle's Poké Balls (never the Master
  Ball), never a team change, never a spin.
- **Between areas**, a toast says each move ("Now exploring…", "Round lost: one round in…", "Round done: back to…").

## 35. The shiny Pokédex

Each region's Pokédex gets a **Shiny** page once its League is beaten (docs/39), behind its switch (§20, Off: the
Pokédex has one page as before). The pieces are in `src/components/ShinyDexRules.tsx`, every state on `/kitchen-sink`
(`ShinyDexBits`).

- **Pokédex / Shiny** is a `Seg` under the page head (`DexViewSwitch`), the shiny option with the sparkle icon; the
  choice is the URL's (`?view=shiny`), so the pop-up's Let's go! lands on it and Back leaves it.
- **The shiny view is the Pokédex's own grid and layout** (`DexTile`, docs/43 §5.6), counting what's owned shiny: the
  head's gauge ("n of N owned shiny"), the filter dropdown (All, Shiny, Missing, Nearby). A tile owned shiny wears the
  star; the others are silhouettes, named once caught, never a colour alone. No NEW tags there.
- Its rules: a `RulesCard` at the top of the view until GOT IT (`shinyDexSeen`, §20); INFO at the bottom of the Pokédex
  while the view is open. Opening the view no longer counts as reading them.

## 36. The raid overhaul

One switch (docs/40, §20), Off: raids as before. On, the engine decides each raid's rules (`engine/raidSpecials.ts`)
and the screens tell them; every piece is on `/kitchen-sink` ("Raid overhaul") and every entrance in the FX lab.

- **The pattern before the fight**: each raid page has a "This raid" card (`RaidRulesPanel`, the `RuleList` rows of
  the events' pop-ups), **always open, with no book beside it** (the user's call, 2026-10-27): its level and bars first,
  then the weather or terrain, each rule, its last bar (crown) last. How the overhaul works is its rules card on the
  Raids page, then the Raids page's INFO (the raids' rules, then the overhaul's rows).
- **A progression raid's page has no banner** (the user's call, 2026-10-27: the card is already the area's picture):
  its plate (back, the kicker, the area · region) lies on the card's top left, the raid Pokémon in its middle. Giratina's
  and Darkrai's keep their worlds' banners.
- **In the fight, the boss plate carries the state** (`RaidMarks`, after its types and statuses): the weather's or
  terrain's icon on `sky`, a CHARGING tag on `accent` that blinks in two steps (still with reduced motion), the shield's
  HP on `paper` with the shield icon, the last bar's crown on `gold`. The log line says what happened; banners only for
  CHARGING!, INTERRUPTED!, UNLEASHED! and LAST BAR!, in the raid's banner tones.
- **A legend's entrance** is the pixel engine's, like Giratina's (§27) and Darkrai's (§29), under the raid intro's
  usual words: its place in dithered steps, never a gradient; its aura's four colours for the outline, the rays and the
  rings. Pairs and trios share a place in their own colours. Skip shows from the second time; motion levels as §8.
- **A Mega raid** is a progression raid with a MEGA RAID kicker; its lock says what opens it, its win shows the gem's
  sprite and name instead of the catch.

## 37. The Unown Pokédex

Where Unown live (Johto's Ruins of Alph), each one caught is one of 28 letters, and they fill a page of their own
(docs/41), behind its switch (§20, Off: no page, no banner). The region's Pokédex keeps its one Unown. The pieces are in
`src/components/UnownDex.tsx`, every state on `/kitchen-sink` (`UnownDexBits`).

- **Pokédex / Shiny / Unown**: the Pokédex's `Seg` (`DexViewSwitch`) gains Unown once an area where Unown live is
  opened, beside Shiny when that page is open too; the choice is the URL's (`?view=unown`).
- **The page** is the Pokédex's grid of 28 tiles (`DexTile`, docs/43 §5.6), in the games' order (A–Z, !, ?): each letter's own sprite
  (`UnownSprite`, Showdown's animated forme, scaled to fit its box) once found, a silhouette (`missing`) until then, the
  letter as its name ("Unown K, found" for screen readers). Over it the count, the gauge, and where to find them with
  the prize; all found, the complete card. No filters or search: 28 tiles need none.
- **Home's banner** (`UnownStripView`) sits above the scene, where a small world's strip does (§22), only while the
  player stands in an area where Unown live: the ruins' picture under `lv-pic`, everything on it in `lv-ink`, the last
  letter found, "Unown Pokédex", **one cell per letter** (`UnownLetterBar`, gold once found, never a colour alone: its
  label says "7/28 letters"), the count and the prize in gold-light, and **See** to the page. Complete: a gold
  COMPLETE chip and the prize earned.
- **The result card**: after an Unown is caught, its line (`UnownLetterCard`): the letter's sprite, "Unown K: a new
  letter!" (or "already on your page") over the count; the last one gold, with the prize.
- Its rules: a `RulesCard` at the top of the Unown view until GOT IT (`unownDexSeen`, §20); INFO at the bottom of the
  Unown view. Opening the view no longer counts as reading them.

