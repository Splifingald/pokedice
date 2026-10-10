# 14 · Porting the Visual Lab into the game (Johto Daybreak)

> **For the human:** start a Claude Code session on this repo and paste:
> *"Read docs/14-DAYBREAK-PORT.md and carry it out, phase by phase. Start with Phase 0."*
> The rest of this file is written to that session.

---

## Your task

Bring **everything** built in the Visual Lab (`design/visual-lab/`) into the real game (`src/`): the Johto Daybreak
look, the frames and components, the new Home (it replaces the Map page as the landing screen), the restyled tabs, the
new battle screen with its dice tray and canvas stage, the catch inside the scene, the Day Care, Versus, Leaderboard and
Trainer card screens, the new icons, and every animation (Pokémon Center, catch, five typed attacks, legendary
encounters, evolution, Egg hatching, Mega Evolution, Gigantamax).

The lab is the **visual and interaction spec**, and it is working code: read it, run it, and match it. The game's
engine (`src/engine/`) and its data stay the **rules spec**: where the lab and the engine disagree on a number or a
rule, the engine wins. The lab invented some preview data (other trainers, scores, save states); never port those as
data.

Work in phases (below). Each phase ends green (`pnpm lint`, `pnpm build`, `pnpm test`, `pnpm e2e`) and gets its own
commit. Don't start a phase while the previous one is red.

## Phase 0 · Read and run before writing

1. Run the lab: `node design/visual-lab/serve.mjs` → http://localhost:4173. It has four tabs; the **Home** tab is the
   phone prototype (the switch above it previews three saves: Mid-game, Versus opens, League beaten). The
   **Animations** tab plays every timeline at any speed, frame by frame, with its beat sheet. Click through all of it,
   at 390×844 and at 1280×900.
2. Read `design/visual-lab/README.md`, then the lab source, in this order:

   | Lab file | What it holds | Port it into |
   |---|---|---|
   | `index.html` | All the CSS: Daybreak tokens (`.ui-root[data-style='daybreak']`), components (`.ui-*`), Home and pages (`.hm-*`, `.pg-*`), battle (`.bt-*`), Day Care (`.dc-*`), Versus and leaderboard (`.so-*`), trainer card (`.tc-*`). The markup of the phone. | `src/styles/`, `src/theme/`, Tailwind, components |
   | `lab.js` | `FRAME_SPECS.daybreak` + `makeFrame` (the 9-slice pixel frames), `TYPE_MOD` (type colours), `STATUS`, `ICONS`, the die/HP/type-badge components (`die`, `hp`, `typeBadge`, exposed as `window.PDUI`), the battle HUD (`HUD`) and the Animations tab | `src/theme/frames.ts`, `src/components/` |
   | `pixel.js` | The canvas engine: sprite sheets and frame timing, ordered dithering, `glow`, `ring`, `wash`, `ditherFill`, `Particles` (homing, drag, ramps), `bolt`, `polyline`, a 5×7 bitmap font, synthesised sound | `src/fx/pixel.ts` |
   | `scenes.js` | Battle backgrounds per style (`background`, `layoutFor`), the Pokémon Center interior (`center`), procedural Poké Balls (`ball`: any angle, open lid, button glow) | `src/fx/scenes.ts` |
   | `anims.js` | Every timeline (`centerAnim`, `catchAnim`, `fireAnim`, `waterAnim`, `grassAnim`, `electricAnim`, `psychicAnim`, `legendAnim`, `evolveAnim`, `hatchAnim`, `megaAnim`, `gmaxAnim`), the `Stage` (positions, hits, hit-stops, shakes) and the `Player` (60 fixed steps a second, cues to a HUD) | `src/fx/timelines/`, `src/fx/player.ts` |
   | `home.js` | Home: the area scenery per biome (`paintOutdoor`, `paintForest`, `paintCave`, `SCENES`, `PALS`), the team roaming (`Mon`: idle, walk, meet, sing, rest; hearts and notes), the area plate, CONTINUE, the Areas sheet (`renderSheet`, `renderList`, `renderRegions`), the area details (`renderDetail`), the widgets (`renderWidgets`, `renderVersus`), the tab bar and its dots (`renderNavDots`), the 16×16 nav icons (`NAVICO`, `NAVPAL`), dialogs | `src/screens/Home.tsx` + `src/screens/home/*` |
   | `pages.js` | Team, Pokédex, Poké Mart, Upgrades, and the shared Pokémon sheet (`openMon`, `faces`, `openItems`, `openDex`, `whereToFind`) | the existing `Team.tsx`, `Pokedex.tsx`, `Shop.tsx`, `Upgrades.tsx` |
   | `battle.js` | The battle screen: tray, readout, reroll, attack, foe turn, statuses, bag, switching, the catch panel, victory and wipe cards, Versus on auto with SKIP | `src/screens/battle/*` |
   | `daycare.js` | The Day Care page, the drop-off sheet, the Egg and the hatching moment | `src/screens/DayCareScreen.tsx` |
   | `social.js` | Versus (opponents, my team, board), the leaderboard with its Hall of Fame, the trainer card with the badge case and looks (and the 8 badge maps + crown) | `Versus.tsx`, `Leaderboard.tsx`, `PlayerProfileModal.tsx` |
   | `assets/` | `trainers.png` (24 trainer looks, 80×80 cells; the order is `LOOKS` in `battle.js`, head offsets in `LOOK_TOP`), `sprites.json` + sheets (animated Showdown sprites cut into frames) | see Phase 5 for sprites |

3. Read the game side you will touch: `src/App.tsx`, `src/components/GameLayout.tsx`, `src/components/Hud.tsx`
   (Header, SideNav, BottomNav), `src/components/PlayerMenu.tsx`, `src/styles/pixel.css`, `src/index.css`,
   `src/theme/colors.ts`, `tailwind.config.ts`, `src/components/PixelButton.tsx`, `Die.tsx`, `icons.tsx`, `Modal.tsx`,
   `SheetModal.tsx`, `SidePanel.tsx`, `src/screens/MapScreen.tsx`, `Area.tsx`, `src/store/run.ts`,
   `src/screens/battle/*` (`BattleView.tsx`, `useBattleAnimator.ts`, `CatchView.tsx`, `VictoryView.tsx`),
   `src/components/Evolution.tsx`, `DayCareScreen.tsx`, `Versus.tsx`, `Leaderboard.tsx`, `PlayerProfileModal.tsx`,
   `src/components/SpriteImg.tsx`, `src/lib/showdown.ts`, `src/audio/sfx.ts`, `src/lib/avatars.ts`, and the docs
   `docs/04-UX-PLAN.md`, `docs/12-FORMS-AND-MEGA.md`, `docs/13-SHOWDOWN-SPRITES.md`.
4. Write a short plan back (which files each phase changes, open questions), then start Phase 1.

## Rules that hold in every phase

- **Strings:** `src/i18n/strings.csv` is the only place for text, in all ten columns (en, fr, es, de, it, pt, pt-BR,
  ja, ko, zh-Hans); no empty cell (`tests/i18n.test.ts`). Run `pnpm i18n:fonts` after editing a CJK column. Use
  `useT()` / `t()`; never hard-code a string. Reuse existing keys where the meaning matches (`ui.dayCare.*`,
  `ui.versus.*`, `ui.board.*`, `ui.profile.*`, `ui.battle.mega*`, `ui.log.gmax`…): most of the lab's wording came from
  them.
- **Engine stays pure** (eslint enforces it): no React, store, DOM or fetch in `src/engine`. Presentation reads the
  battle state and its log; it never decides an outcome. Use the engine's helpers for every number shown: damage,
  combos, type multipliers, status thresholds, catch chance, Day Care XP and Egg odds, Versus eligibility, leaderboard
  unlock.
- **Accessibility** (`docs/04-UX-PLAN.md`, `e2e/layout.spec.ts`): controls ≥ 44 px on phones, text ≥ 12 px, one `<h1>`
  per route, axe clean (no serious/critical), nothing scrolls sideways at 360, 375, 768 or 1280, the battle fits
  360×640. Dialogs trap focus, Esc closes the top one, focus returns. Status is never colour alone (chips carry words).
- **Reduced motion:** honour `settings.reducedMotion` and `prefers-reduced-motion` (the `html.reduce-motion` class,
  `MotionConfig`). Every timeline needs a reduced path: jump to its end state, keep the messages, no flashes, no shake,
  the Home team stands still.
- **Sound:** extend `src/audio/sfx.ts` with named sounds for the new cues (the lab synthesises them in `Sound.tone` /
  `Sound.noise` calls inside each timeline's `init()`); respect `settings.sfx`.
- **Nothing is lost.** The lab only prototyped Kanto and wild/Versus fights. Keep every existing feature working and
  restyled: energy (EnergyPill), cloud sync, the Casino and slot machine, trainer and gym battles, the rival,
  CHALLENGE / decline, the round gauge, auto mode, multi EXP, shinies, all regions (Johto → Paldea) and their badge
  cases, forms, fossils, tutorials (Day Care, Leaderboard, Share), donation and reply popups, admin, settings, help,
  types chart, Discord and contact.
- **Style:** pnpm, Prettier (no semicolons, single quotes, width 110), `@/` imports, comments that say why. Keep
  components small; the lab's single files are prototypes, not a structure to copy.
- **Commits:** one per phase (or per screen inside a big phase), plain-sentence messages. Never push to `main`.

## Phase 1 · The Daybreak foundation

**Fonts.** Daybreak uses **Jersey 20** for titles, names, buttons and most text, and **Jersey 15** for labels, numbers
and paragraph copy. Add Jersey 20 (`public/fonts/*.woff2`, latin + latin-ext, `@font-face` in `src/index.css`, preload
in `index.html`, a Tailwind font utility). Keep the CJK fallback (Fusion Pixel). Update the font check in
`e2e/layout.spec.ts` to allow Jersey 20. Retire Jersey 25 only where Daybreak replaces it.

**Tokens** (`src/theme/colors.ts` → Tailwind). From `.ui-root[data-style='daybreak']` in the lab's `index.html`:

| Token | Value |
|---|---|
| background | `#e9f0f8`, with an 8 px tile texture (dots `#dde7f3` where `(x+y)%8==0 && x%4==0`, `TEX.daybreak` in `lab.js`) |
| panel / paper | `#fbfdff`, white `#ffffff` |
| ink (text, outlines) | `#24304f` (11:1 on paper) |
| muted | `#5c6a8a`; faint `#8592ad`; lines `#b6c3d9`, `#dde5f0`, `#dfe7f2` |
| accent / primary | `#f2553f` (pressed `#c4382a`) |
| gold (new, lead, combo) | `#ffbe2e` (light `#ffe7a8`, `#fff4d6`) |
| HP | high `#34c97a`, mid `#ffbe2e`, low `#ff5a4a`; trail `#ffb3a8` |
| types | `TYPE_MOD` in `lab.js` (badges: `color-mix` 32 % on white, text 45 % on `#141a33`, ring 75 % on ink) |
| statuses | burn `#f07a2a`, poison `#b04db0`, frozen `#5fc0e0`, paralyze `#f0cc28`, confuse `#ec5f9e`, heal `#52c052` |

Sizes: base text 20 px, small 17, labels 15, titles 30–40, buttons 22 uppercase with 0.04em tracking.

**Frames.** Port `makeFrame` and `FRAME_SPECS.daybreak` (`panel`, `dialog`, `btn`, `primary`, `gold`, `off`) as
crisp 9-slice `border-image` frames, generated per device pixel ratio (the lab builds them at runtime at
`2 × devicePixelRatio`) or pre-rendered at 2× and 3× by a script. Pressed states sink by the shadow offset. These
replace `.pixel-panel`, `.pixel-btn`, `.pixel-dialogue` and `.hatched` in `src/styles/pixel.css`.

**Components** (restyle in place, keep their APIs where possible):
- `PixelButton`: primary (red), secondary (white), **gold** (new: "New region", Take the Egg), disabled (`off`,
  dotted). Big primary CTA = 56–72 px tall.
- Panels, dialogue box (typewriter text, caret), chips, segmented tabs (`.hm-seg`), filter chips with counts
  (`.hm-chips`), search fields, sheets (`.hm-sheet`: bottom sheet on phones, grab handle, ✕).
- HP bar: track, fill, trail; the fill drains over 700 ms and the trail follows after 280 ms over 900 ms.
- Type badges, status chips (word + colour), the level tag.
- **Dice** (`Die.tsx`): the Daybreak die from `lab.js` `die()` + the `.ui-die` CSS. Sharp square corners, pips on an
  integer grid (`round()` so every pip is the same size at any die size), type colour fill, a status face = ring in
  the status colour + a round badge with the status icon, selected = lifted with a red outline, combo = gold ring.
- Icons (`src/components/icons.tsx`): the new 16×16 nav icons (`NAVICO` + `NAVPAL` in `home.js`: Mart bag, die going
  up, three balls for Team, red Pokédex, podium for the leaderboard), the lab's small icons (`ICO` in `home.js`: ball,
  lock, play, map, coin, badge, trophy, star) and the status icons (`ICONS` in `lab.js`, `frozen` included).
- Add every new component in every state to `/kitchen-sink`.

**Done when** `/kitchen-sink` shows the Daybreak set and every route still works.

## Phase 2 · Home replaces the Map as the landing screen

Build `src/screens/Home.tsx` from `home.js` and make it the game's landing route (redirect `/map` to it, keep deep links
working). It is the area hub; everything the Map and Area screens did stays reachable from it.

- **Top bar:** your look (a crop of your trainer sprite, see Phase 9) + name + badges count → opens the Trainer card;
  energy pill (keep it); gold pill with **+** → Poké Mart; the cup → leaderboard (locked until the first badge, as
  today). No logo needed here.
- **The scene:** the current area's own scenery seen from the front (`SCENES` per banner key, `PALS` palettes,
  `paintOutdoor` / `paintForest` / `paintCave`, mirrored variants), drawn on a canvas, with the team (**three at most**)
  roaming it: they idle, walk, visit each other (hop, little hearts), the singer starts a song and the others join
  (notes rise), a tired one (fainted or low HP) sweats and naps. Tap one: it hops, a heart pops, its card shows (name,
  level, HP, a note). The team is also a keyboard list of buttons. Reduced motion: they stand still.
- **Area plate** (top of the scene): area name, level range, rounds done, species caught here. Tap → the **area
  details** sheet: gym, the legendary and when it shows up, one-time finds still there, Pokémon to catch with rarity,
  odds, levels and a caught mark, what a round brings. Footer: Continue here / Travel here / why it's locked.
- **CONTINUE:** the one big primary button, with what comes next under it ("Round 3 of 8", "Cleared · free play"). It
  runs the existing flow in `src/store/run.ts` (`rollNext` → preview → `engage`): wild battle, trainer, Pokémon
  Center, Casino, challenge. Those views stay; restyle them.
- **Areas button** with three states: plain, a NEW dot (a secret area opened), and **gold "New region"** (the next
  region is open after the League). It opens the **Areas sheet**: search by area *or by Pokémon* ("Pikachu" finds where
  it lives), chips All / To catch / Secret / Cleared with counts, sort Route / Level / Most to catch. Each card shows
  the area's scene crop (one picture per area: the Home scene, cropped to its middle, no separate banner), level
  range, catch count, and its state as the outline: **orange** where you are, **green** cleared, grey locked (with
  the lock reason), plain for the next one. A **GO** button travels (or plays, if it is where you are); the card opens
  the details. Next to the region name, a **Regions** button (map icon) switches to the region view: the regions
  reached, and the next one with its three starters once offered.
- **Widgets, two by two:** the newest secret area (travels in one tap; when none is new, the next secret's progress);
  the **Day Care** (residents with XP bars and time to full, READY when full; opens the Day Care); **Versus** under the
  secret area (locked: "n/3 at Lv.50" with a meter; new: NEW + "Set team"; set: teams to beat, defense wins, Fight);
  an empty **Special events** slot under the Day Care ("Coming later").
- **Tab bar** (phones; the desktop SideNav gets the same items and icons): Shop, Upgrades, **Home in the middle** (a
  raised Poké Ball), Team, Pokédex. Dots only for things you can act on: the number of affordable upgrades ("9+"
  max), a gold NEW for a new Pokédex entry.

**Done when** a new game and an existing save both land on Home, CONTINUE reaches every encounter kind, and the old
Map's features (region bar, badges, secret areas, Day Care card) all live somewhere on Home.

## Phase 3 · The four tabs

Restyle from `pages.js` (keep each screen's existing logic and helpers such as `sortBox`, `groupOf`, `whereToFind`):

- **Team:** the team as three cards (sprite, HP, XP bar, mini dice), the lead in gold. **Drag one onto another** to
  change the order, plus a "Make lead" button in the Pokémon sheet for keyboard and screen-reader users. Say once at
  the top that swaps happen at a Pokémon Center (follow the engine's rule). The Box: search, sort (number, level,
  newest), type chips. The **Pokémon sheet**: animated sprite, types, stats, **every die face drawn as a real die**
  (status faces visible: ring, badge and the status name), what it learns next (milestones), items to use.
- **Pokédex:** tiles with silhouettes for missing ones; filters All / Caught / Missing / **Nearby** (catchable in an
  open area); a number finds anything, a name only what you've caught; a search resets the filter to All. A missing
  entry shows where it lives, with the same GO as the Areas list.
- **Poké Mart:** Buy / Sell tabs, category chips (Balls first), a row opens a ×1 / ×5 / ×10 picker; the button gives
  the total, or how much is missing. Items that need more badges wait under "Coming later" with the badge count.
- **Upgrades:** Combos / Dice tabs. Each card: example dice (combos) or the die's **six faces as real dice** (dice),
  a 10-pip track, bonus now → next, the price. Status faces say what they do with the game's numbers. An
  **Affordable** toggle; locked ones say why.

## Phase 4 · The battle screen

Rebuild `BattleView` from `battle.js` and the `.bt-*` CSS, on a **240×160 canvas stage** (today 240×112) drawn with
the Phase 5 engine. The battle is full screen: no header, no tab bar. It must fit 360×640.

- **Stage + plates:** Daybreak background (`scenes.js` `background('daybreak')`), the foe front sprite on its
  platform, yours from the back. Foe plate: name, level, type badges, HP bar, status chip (and, in Versus, three
  party balls). Your plate: level, HP bar with numbers, status chip. The foe's HP **lags until the hit lands** in the
  animation, then drains.
- **Message box** under the stage (two lines tall so nothing jumps).
- **Dice tray:** your dice tumble and land on their own; "What will X do? Tap dice to throw them again." Tapping a die
  lifts it (red outline) to reroll; the combo's dice wear a gold ring. Under the tray, the **readout**: the combo chip
  with its bonus (or "No combo"), `(sum + bonus) × mult = damage` with the damage big, "super effective" / "not very
  effective" / "no effect", and status chips `BRN 1/1`… lit when the threshold is met. All from the engine.
- **Actions:** REROLL (with the count left) and ATTACK (primary). Under them: the **Bag** (one item a turn, doesn't
  end the turn; a sheet listing usable items with what they do) and the **team pips** (icon + HP) to switch. After a
  K.O., "Who goes out next?" with the switchable pips pulsing.
- **The foe's turn:** its dice appear smaller in the tray, it rerolls when it has nothing, then strikes (lunge,
  hit-stop, white frames, shake, damage number).
- **Moves:** each hit plays the typed attack timeline for its type (Phase 5). Mega and G-MAX buttons (today's
  `megaChoices` / `gmaxChoices`) play the Mega Evolution / Gigantamax timelines, then show MEGA / G-MAX on your plate
  and the die gained ("+1 Dragon die · until the battle ends", "+1 Electric die for its next turn").
- **Catch, in the scene** (replaces `CatchView`'s separate screen): the worn-out foe stays on its platform, greyed and
  slowed; a ball picker shows each ball's **chance** (`clamp((7 − (cv − bonus)) / 6)`), how many you have, and "not
  needed" when a weaker ball already makes it certain; "Leave it" if the rules allow skipping; one throw plays the
  catch timeline with the catch die and wobbles. Then a result card.
- **Victory card:** XP per Pokémon that fought, the catch (with NEW), "Wild battles pay no gold" where true; Home /
  Next encounter. **Wipe card** with the engine's wipe rules and Try again.
- **Versus fight** (`VersusFightView`): the opponent's trainer sprite slides in, "X wants to battle!", sends out three
  in turn ("X sent out Y!"), both sides on auto, an AUTO note and **SKIP ▸▸** (the result is decided when the fight
  starts, so skipping only fast-forwards the replay). End: Victory / Defeat, Rematch, Back to Versus.
- Keep the battle history, auto mode, trainer and boss intros (the legendary timelines serve as the boss intro for
  Mewtwo, Articuno, Zapdos and Moltres), forfeit, and every log message the animator plays today.

Hook the stage into `useBattleAnimator`: its log cursor already says who hits whom, with which type and power; map
those events to timelines instead of `ParticleCanvas.burst`. Types without a dedicated timeline get a generic impact in
the type's colour that follows the same house rules. When a K.O. ends a turn (including burn or poison at the end of
a turn), nothing else of that turn may play after it (the lab hit exactly this bug).

## Phase 5 · The animation engine and every timeline

Port `pixel.js`, `scenes.js` and `anims.js` to TypeScript under `src/fx/` (no React inside; a thin
`<StageCanvas>` component hosts a `Player`). Keep the house rules, they are the point:

- anticipation before every release; a 3–5 frame hit-stop on contact; two white silhouette frames on a hit, never an
  opacity blink; light and smoke ordered-dithered, never blurred; particles step through a fixed colour ramp; no
  screen flash faster than 3 a second.
- 60 fixed steps a second; cues fire at exact times to the HUD (`say`, `hp`, `status`, `show`, `chip`, `form`, `heal`).

**Sprites on canvas.** Timelines need frame access, which `<img src=*.gif>` doesn't give. Options: decode Showdown's
`gen5ani` GIFs at runtime (`ImageDecoder` where available, otherwise a small GIF decoder such as `gifuct-js`) into
frame sheets with an LRU cache, falling back to the static `gen5` PNG and then to `/pokemon/NNN_*.png` offline; or
extend `scripts/showdown-sprites.ts` to pre-build sheets the way the lab's `sheets.py` did (union bounding box,
de-duplicated frames, merged durations, ≤ 16 columns). Pick one, write the reason in `docs/13-SHOWDOWN-SPRITES.md`.
Forms (Mega, Gigantamax) come from the same table (`charizard-megax`, `pikachu-gmax`…; most have only static `g`
sprites: use them).

**The timelines** (beat sheets are in the lab's Animations tab; generalise each to any species via parameters):

| Timeline | Where it plays in the game |
|---|---|
| Pokémon Center (three balls on the tray, the jingle on six beats, the team list refilling) | `CenterView` |
| Catch (worn-out pose, throw arc, contact hit-stop, capture beam, drop with two bounces, catch die, wobbles, gotcha stars or break-free) | the catch in the battle scene |
| Flamethrower, Hydro Pump, Razor Leaf, Thunderbolt, Psychic | attacks of those types; others get the generic impact |
| Legendary encounter (Mewtwo, Articuno, Zapdos, Moltres) | boss intros |
| Evolution (silhouette, flicker that speeds up, rays, burst, reveal; with a stone it floats down first) | replaces `EvolutionSequence` in `src/components/Evolution.tsx` |
| Egg hatching (nest, three wobbles, cracks, light, burst, hello hop, hearts) | `HatchModal` in the Day Care |
| Mega Evolution (Key Stone ↔ Mega Stone strands in seven colours, a sphere, the change inside, cracks, shatter, the Mega symbol; MEGA on the plate, the die gained) | MEGA in battle, both for you and for a trainer's ace |
| Gigantamax (red recall into the ball, Dynamax energy swells it, thrown up under a crimson sky, a red silhouette rising in steps, the G-Max form with its cloud crown and a shockwave; G-MAX on the plate, the die for its next turn; on `ui.log.gmaxEnd` it shrinks back) | G-MAX in battle |

Each one: a reduced-motion end state, sound cues through `sfx.ts`, and a dev page (extend `/kitchen-sink` or add
`/kitchen-sink/fx`) that plays any timeline with replay, ¼ speed and frame step, like the lab's Animations tab.

## Phase 6 · Day Care

Restyle `DayCareScreen` from `daycare.js`, with the engine's `src/engine/daycare.ts` for every number (2 slots,
+1 XP every 10 min, 200 XP a stay, the Egg ₽50 and free once, hatch level = your 3rd lowest level − 5, at least 5,
missing species weighted ×4, one copy per species kept):

- Each resident: animated sprite, name, Lv now → Lv after, an XP bar to the cap, "+1 XP in 4 min · full in 18 h 14",
  READY in green when full; **Take back** (to the team if there's room, otherwise the Box; the toast says which).
- An empty slot: "Leave a Pokémon" → a sheet with search: the team first (TEAM tag; your last team member disabled),
  then the Box, lowest level first.
- **Eggs:** the Egg sprite, "An Egg for you!" (free) or "Buy an Egg", facts (hatches at Lv.N, how many you don't have
  and the ×4 odds), Take the Egg / Buy · ₽50 / "Need ₽x more". It hatches **right there**: the hatching timeline full
  screen over the page, a Skip button, then the result (NEW tag, and where it went: team, Box, kept a stronger one,
  replaced your weaker one), Done and "Another · ₽50".

## Phase 7 · Versus

Restyle `Versus.tsx` from `social.js` (data stays in Supabase via `src/lib/versus.ts`; the lab's opponents are fake):

- **Locked:** "Versus opens when 3 of your Pokémon reach Lv.50", a meter n/3, and the three closest Pokémon with how
  many levels to go.
- **Tabs:** Opponents (count to beat) / My team / Leaderboard.
- **Opponents:** your team strip with Change; search by trainer *or Pokémon*; chips To beat / Beaten / All with
  counts; each row: their look, name, their three at Lv.50, "You hit n of 3 super effectively" (green ≥ 2, red 0),
  FIGHT or a Beaten tag (its hint: when they change their team you can fight again).
- **My team:** three numbered slots in order (sprite, name, "Lv.53 → 50"), the eligible list (Lv.50+, across
  regions, as `versusCandidates`) with order badges, Clear and Save team ("Team saved" when unchanged). The rules text
  from `ui.versus.rules`.
- **Leaderboard:** Attack (teams beaten, each counts once) / Defense (fights won in defense), ranked rows with you
  highlighted.

## Phase 8 · Leaderboard

Restyle `Leaderboard.tsx`: tabs Max level / Progression / Pokédex / Shiny; a card on top with your look and "You're #N
of M" (tap it to scroll to your row, which flashes) or "You're in the Hall of Fame"; a **Hall of Fame** button (their
faces, the count) opening a sheet with the tab's `ui.board.hallBody.*` text; rows with rank medals for 1–3 (gold,
silver, bronze squares), the look crop, name (+ "you"), their team icons, the value. Locked until the first badge, as
today.

## Phase 9 · Trainer card and looks

Make the trainer card (today `PlayerProfileModal`, opened from `PlayerMenu`) look like `trainerRender` in `social.js`,
and open it from the avatar in the top bar. Keep the menu's other entries (Versus, Settings, Guide, Types, Cloud
backup / Connect, Admin, Discord, Contact).

- The card: your **look** at 2× (crop of the trainer sprite), name with Change (inline rename), ID No., money,
  Pokédex, best level, areas cleared, shinies, Versus record (or Locked), your team with levels.
- **Badge case:** per region reached (`regionCases`), 8 badges as pixel art (the 12×12 maps in `social.js`
  `BADGES`; draw the other regions' badges the same way) and the **crown** ("for clearing the region's last area").
  Unearned ones are grey and labelled "not earned yet" for screen readers.
- **Look picker:** "How other trainers see you. Your character in battle doesn't change." A grid (radiogroup) of the
  looks from `src/lib/avatars.ts`, using the game's trainer sprites. The same crop is used everywhere a trainer
  appears: the top-bar avatar, leaderboard and Versus rows, the Versus intro on the stage.
- The menu as rows with icons and one-line descriptions.

## Phase 10 · Sweep

- Restyle what's left so nothing looks like the old theme: Pokémon Center view, Casino, the encounter preview,
  challenge, tutorials, toasts, settings, help, types chart, admin, new game, title.
- Update `e2e/*.spec.ts` for the new screens and labels (`layout.spec.ts`: fonts, 44 px, 360×640 battle;
  `smoke.spec.ts`; `versus.spec.ts`; `leaderboard.spec.ts`; `avatar.spec.ts`), and add e2e coverage for Home
  (CONTINUE, Areas sheet search, area details, widgets) and the Day Care hatch.
- Update `README.md` and `docs/04-UX-PLAN.md` to describe the new UI.

## Checking your work

At the end of every phase:

1. `pnpm lint && pnpm build && pnpm test && pnpm e2e` all green (install Playwright's Chromium first if needed).
2. Run the game and the lab side by side at 390×844 and 1280×900, and screenshot the same screens with Playwright;
   fix what differs, unless the engine says otherwise.
3. Check 360×640 (battle), reduced motion on, sound off, keyboard only (Tab, Enter, Esc), and one CJK language.
4. Report what you changed, what you deliberately did differently from the lab and why, and anything left for the
   next phase.
