# Pokédice: 3D and more natural dice animations (research)

*Research written 2026-10-23; phase 1, the recorded throws, is now in the game behind its switch: see
[§7 Implemented](#7-implemented-recorded-throws-phase-1). Bundle sizes in §1–§6 were measured with esbuild (minify,
tree-shaken, ESM) and `gzip -9` on the npm versions current that day. They are not bundlephobia figures.*

---

## TL;DR

- **Today** a die is a flat DOM square. A single framer-motion tween throws it in: `rotateX 540 → 0`,
  `rotateZ 200 → 0`, a drop from above, `scale 0.6 → 1` and a fade in, with a 1.2 overshoot ease. The final face shows
  for the whole spin. `.die-wrap` has a CSS `filter`, which forces `transform-style: flat`, so the "3D" spin is really a
  card flip. It has no bounce and no shadow, and every die moves the same way. That is why it feels mechanical.
- **Recommended: replay physics throws recorded ahead of time, drawn by a small pixel-art cube renderer on a 2D canvas.**
  - A dev-only script records a few dozen real cannon-es throws into a ~7 KB JSON file. cannon-es is a
    devDependency, so it adds **0 KB** to the runtime bundle.
  - At runtime, a pure function picks a throw and turns the die by one of the cube's symmetry rotations, so the face
    the engine already chose ends on top. The swap can't be seen, because a cube looks the same after that turn.
  - A ~200-line canvas renderer draws the cube at art resolution with `image-rendering: pixelated`. It uses an
    orthographic camera, which makes each face an exact affine `setTransform` of a face bitmap.
  - It adds a dithered shadow, a sound per bounce and a seamless hand-off to the existing `Die` at rest.
  - It looks real, always lands on the engine's value and costs almost nothing in bundle or battery. It also keeps the
    Johto Daybreak rule that every frame looks hand-drawn by a pixel artist (§4, §8).
- **Cheap first step (about a day, 0 KB):** keep the flat `Die` and replace its single tween with keyframes. Add an
  arc with 2–3 shrinking bounces, squash and stretch on contact, a dithered shadow that grows as the die falls, a
  wobble as it settles and random variation per die. The die cycles through its own faces at 12 fps in steps, then
  lands on the result.
- **If true WebGL 3D is wanted later:** use three.js core, about 129 KB gz as a lazy chunk, with the same recorded
  throws. Render to a low-resolution target and scale it up with nearest-neighbour to keep the pixel look. Avoid
  `@3d-dice/dice-box` (687 KB gz plus wasm, and it can't force a result) and react-three-fiber with Rapier
  (about 1.8 MB gz, and r3f v9 needs React 19).

---

## 1. What the code does today

| Area | Finding |
|---|---|
| Component | `src/components/Die.tsx`: a `motion.span` (an image) or a `motion.button` (in the battle tray) wrapping `<span class="die">`. The face is DOM: pips placed on whole pixels (`pipLayout`), a centred number for values with no pip layout (0, 7, 8…), and a round status badge (`PixelIcon`, drawn from pixel-row arrays). |
| Faces | Data-driven and editable in admin (`GameData.diceTypes[type].faces`, `Face = number \| status`). There are **19 die types** (`base` plus 18 Pokémon types), each in its type colour, and 6 faces each. Status faces carry a ring and a badge. **Face art can't be baked ahead of time**: it has to be drawn from data at runtime. |
| Roll animation | `initial: {rotateX: 540, rotateZ: 200, y: -1.2·size, scale: .6, opacity: 0}` goes to rest in `0.6 · pace` s with ease `[0.2, 0.9, 0.3, 1.2]`. `rollKey` change remounts and replays it (`key={rollKey}`). `delay = i·0.05` staggers the tray. |
| Why it looks flat | `.die-wrap` has `filter: drop-shadow(...)` (`src/styles/pixel.css`). Any `filter` forces `transform-style: flat` even with `preserve-3d` ([MDN transform-style](https://developer.mozilla.org/docs/Web/CSS/transform-style), [Codrops](https://tympanus.net/codrops/?p=21812)). The rotation is a single plane flipping like a coin, with the final face visible throughout. There is no gravity arc, no contact, no shadow and no settle. |
| Who decides values | The engine: `src/engine/dice.ts` `rollDie`, `rollAll` and `rerollMasked` use the seeded `Rng`. The log entries `{kind:'roll'}` and `{kind:'reroll', mask}` drive the UI. **The animation must land on a value it is given and must never call the engine RNG.** |
| Tray and reroll | `useBattleAnimator.ts`: `roll` gives every die a fresh key (`r<id>-i`), with an animator delay of 750 ms and the `rattle` sfx. `reroll` gives fresh keys **only to masked dice** and the others keep theirs (700 ms). A Mega's extra die tumbles alone (commit e3035a7). `BattlePanel.tsx` `DiceTray` renders up to about 8 dice, 44–54 px, with the foe's dice ≤ 40 px. |
| Other uses | Title (5 dice with `rollKey`), `CatchPanel` (catch die and Bait die), `Underground` `PickaxeDie`, `TrickView`, and Kitchen Sink "Die — 19 skins" (reroll replays). Static dice (sheets, history, admin) have no `rollKey`. |
| Motion levels | `src/lib/motion.ts`: `full`, `short` (player setting or OS reduce motion) and `off` (admin). `calm` means no shake or flashing. The `Die` ignores `useMotion` and only reads `usePace()`. With `off`, `<MotionConfig reducedMotion="always">` makes framer skip transforms. Under the OS setting (`'user'`), framer also drops the transforms, so the dice just appear. Guideline: "dice tumble 600 ms", "Pixel motion steps (`steps()`), it doesn't glide". |
| Rendering stack | DOM plus framer-motion 11 (already shipped, about 36 KB gz). The pixel engine (`src/fx/pixel.ts`, `timeline.ts`, `StageCanvas.tsx`) uses a 2D canvas at native art resolution scaled with `image-rendering: pixelated`. It runs fixed 60 Hz timelines with cues and ordered dithering. **There is no WebGL, three.js or physics anywhere.** |
| Sound | `src/audio/sfx.ts` synthesises sounds. `rattle` (5 noise bursts) plays once per roll. A `land` blip exists and suits a sound per bounce. |
| Rules from CLAUDE.md that apply | The engine stays pure. A new feature gets the admin's Off / On for admin / On for everyone switch, off by default and checked by the server too. Every new component goes on `/kitchen-sink` in every state, and timelines go on `/kitchen-sink/fx`. Strings go in `strings.csv`. |

---

## 2. How to land on a value that is already decided

Every approach that looks real comes down to one of three techniques:

1. **Tween to a known orientation.** Store the rotation that shows each face, add a few full turns and ease to it
   ([GitSquared/diceroll](https://github.com/GitSquared/diceroll/blob/master/README.md),
   [DEV guide](https://dev.to/learncomputer/create-your-own-interactive-3d-dice-roller-a-step-by-step-guide-34b3),
   [Tuts+ three.js](https://code.tutsplus.com/3d-in-the-browser-with-threejs--CRS-200640c/rolling-the-dice)).
   It is exact and simple, but the motion is scripted and reads as an animation.
2. **Simulate, then relabel the faces and replay.** Run the physics to rest without showing it, read which face ended
   on top, swap the face materials so the wanted value sits there, reset and replay it on screen.
   - `threejs-dice` does this in `prepareValues` and `shiftUpperValue`
     ([source](https://raw.githubusercontent.com/byWulf/threejs-dice/master/lib/dice.js)).
   - `dice-box-threejs` does it with `roll("6d6@4,4,…")` and `swapDiceFace`
     ([repo](https://github.com/3d-dice/dice-box-threejs)).
   - It relies on the physics being deterministic between the hidden run and the visible one. A known trap is a replay
     that lands differently ([html5gamedevs thread](https://www.html5gamedevs.com/topic/32589-simulate-outcome-of-physics-object-movement/)).
3. **Record, then rotate by a symmetry.** Record the throw, then apply a fixed rotation from the cube's 24 symmetries
   so the chosen face ends on top. The shape is unchanged, so the trajectory and the collisions stay valid. Castle Game
   Engine's dice demo works this way, with the whole simulation taking about 1/50 s
   ([forum](https://forum.castle-engine.io/t/dice-throwing-demo-recording-physics-simulation/1861)).

   If the throws are recorded **offline**, there is no determinism risk at runtime and no physics engine is shipped.
   This is the technique recommended below.

**Two pitfalls to plan for:**

- A die can end **cocked**, leaning on a wall. Reject such recordings, which is easy offline.
- The resting **yaw** is arbitrary. Normalise it so the die settles square and upright, matching the flat `Die`, and so
  numbers like "7" and status icons read upright.

---

## 3. The options compared

Sizes are min+gz, measured here unless marked.

| # | Approach | Lands on a set value | Runtime cost | Mobile perf and battery | Custom faces (types, status, numbers) | Reduced motion | Licence and upkeep | Effort here |
|---|---|---|---|---|---|---|---|---|
| A | **Better 2D/2.5D keyframes** (framer-motion keyframes or springs: arc, bounces, squash and stretch, shadow, wobble, stepped face cycling) | Trivial: the final face is the result | **0 KB** (framer already shipped) | Excellent (transforms only) | Reuses `FaceArt` as is | `short`: one drop and bounce. `calm`: no spin. `off`: framer skips it | MIT, active | **0.5–1 day** |
| B | **CSS 3D cube**: 6 DOM faces with `preserve-3d`, eased to a stored orientation, or driven per frame by `matrix3d` from recorded quaternions | Technique 1, or 3 when driven by recordings | 0 KB | Good. GPU layers, but 6 faces × 8 dice × pips is about 400 nodes. iOS needs care with `backface-visibility` | Reuses `FaceArt` on each face | Same as A | n/a | 2–3 days. The `filter` rings must move off the 3D node (it forces flat) and edges get antialiased, which breaks the pixel rule |
| C | **Recorded throws plus a pixel canvas cube renderer** (recommended) | Technique 3, exact, tested offline | **0 KB of libraries**. About 3–5 KB of code plus about 7 KB gz of throw JSON (lazy) | Excellent: tiny 2D canvas, only during about 0.7 s, no WebGL context | Each face rasterised once to a small offscreen canvas from data (pips, number, status icon from `ICONS` rows), then mapped by affine `setTransform` (exact under an orthographic camera) | `full`: whole throw. `short`: the tail (last bounce and settle) or the throw at about 1.6×. `calm`/`off`: no throw | Own code. cannon-es is MIT and used only at dev time | **4–6 days** |
| D | **three.js core plus the same recordings** (or live cannon-es), low-res render target with nearest upscale, or [`RenderPixelatedPass`](https://threejs.org/docs/pages/RenderPixelatedPass.html) | Technique 3 (or 2) | three core **~129 KB gz** (+ cannon-es **~23 KB gz** if live). Lazy-loaded chunk | OK. One shared WebGL context is a must (Android Chrome allows about 8 per domain, Safari about 8–16; [WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=200031), [summary](https://bugnet.io/blog/how-to-fix-too-many-active-webgl-contexts-oldest-context-will-be-lost)). Shaders compile on the first roll; context loss when backgrounded on iOS; more GPU than C | `CanvasTexture` per face, built from data | Same levels; WebGL never starts at `off` | MIT, very active (three 0.186, Sep 2026) | 5–8 days |
| E | [`@3d-dice/dice-box-threejs`](https://github.com/3d-dice/dice-box-threejs) | Yes: `roll('6d6@4,4,…')` (technique 2) | **~139 KB gz**, bundling its own **three ^0.143** (a duplicate if three is added later) | As D | Colour sets and textures. `labels` arrays, but not built for type-coloured pixel faces with status badges | Up to you | MIT. **Last npm publish Oct 2022** | 2–3 days to wire up, then a fight with the look |
| F | [`@3d-dice/dice-box`](https://fantasticdice.games/docs/usage/config) (BabylonJS + ammo.js in a worker) | **No forced results** (notation in, result out; [docs](https://fantasticdice.games/docs/usage/config), [v1.1 notes](https://fantasticdice.games/blog/version-1.1)) | **~687 KB gz** of JS plus a 124 KB gz `ammo.wasm` plus theme assets | Heavy | Themes, and non-numeric faces since 1.1 | Up to you | MIT. Last publish Aug 2024 | Not suitable (can't land on the engine's value) |
| G | react-three-fiber + `@react-three/rapier` | Technique 2 or 3 | r3f **~227 KB gz** + Rapier compat (inlined wasm) **~1.6 MB gz** | Heavy for a dice tray | `CanvasTexture` | Up to you | MIT and Apache-2.0, active. **r3f 9 and rapier 2 need React 19** (the repo is on 18, so r3f 8 and rapier 1 would be needed) | 6–10 days. Overkill |
| H | Sprite sheets, Lottie or Rive | Only a tumble with blank or blurred faces that cuts to the real face at rest (faces are data-driven: 19 types × admin-edited faces) | Lottie light **~47 KB gz**. dotLottie 13 KB + **484 KB gz wasm**. Rive lite 56 KB + **322 KB gz wasm**. A palette-swapped sprite sheet is just a PNG | Fine | Faces can't be drawn mid-tumble unless blank | Easy | MIT runtimes. Rive's editor is a paid tool | 2–4 days plus art time. A hand-drawn pixel sheet could look good, but it repeats and can't show the faces mid-roll |

**Variants of C worth knowing:**

- The recordings are independent of the renderer. The same JSON could drive B (CSS `matrix3d`) or D (three.js) later,
  so C is not a dead end.
- Rejected ideas:
  - Running cannon-es live at runtime (+23 KB) adds nothing over recordings except collisions between dice, and dice
    in separate lanes don't need them.
  - Rapier is too large for this use.

---

## 4. Proof that the recordings work (prototype, not in the repo)

A 60-line cannon-es 0.20 script was run in Node.
Setup:

- A 1-unit die, a floor and four walls forming one die's lane.
- Restitution 0.3, damping 0.35, gravity −50.
- Each frame stores `[x, y, z, qx, qy, qz, qw]` at 2 decimals, every 2nd 60 Hz step.

Results:

- **24 throws took 16–55 stored frames, about 0.5–1.8 s, 1.0 s on average.** Throws longer than the budget are
  dropped, or played faster (see §5).
- **JSON: 29 KB raw, 7.2 KB gzipped.** 48 throws at 3 decimals and every step came to 49 KB gz, so quantising and
  halving the frame rate matter. Missing frames are filled in with slerp.
- The top face was spread across all six faces. Contact frames, with impact > 2, came out at 2–6 per throw. They
  become the bounce sounds and the squash frames.
- The output was **bit-identical across runs** (same md5), so the file is reproducible from a seed.
- 1 of 24 throws ended cocked against a wall (y = 0.68 instead of 0.5). The bake script has to reject those, and reject
  any throw whose up-face normal is under 0.99.

---

## 5. Recommendation and integration sketch

### 5.1 Phased plan

| Phase | What | Ships behind |
|---|---|---|
| **0: quick win** (about 1 day) | Keyframes in `Die.tsx` (see 5.6). Delete `opacity` and the 540° flip | The admin switch (Off / On for admin / On for everyone) |
| **1: recorded 3D throws** (4–6 days) | Bake script, pure solver with tests, pixel cube renderer, `Die` overlay, sound per bounce, motion levels, Kitchen Sink | The same switch. When it's off, phase 0 runs |
| **2: optional** | Throws shared across a tray layer (dice in one box that touch), or a lazy three.js renderer fed by the same JSON | Only if phase 1 still looks too flat |

### 5.2 New files (phase 1)

| File | Pure? | Role |
|---|---|---|
| `scripts/bake-dice.ts` (`pnpm bake-dice`) | dev | Uses cannon-es (**devDependency**). Seeded throws in a lane box. Rejects throws that end cocked, ring against walls or settle outside 0.45–0.75 s. **Normalises the final yaw** by turning the whole path about the vertical axis so the die rests square. Stores 30 Hz quantised frames and contact frames. Writes `src/fx/dice/throws.json` (about 5–8 KB gz, imported lazily) |
| `src/fx/dice/solve.ts` | pure (`src/fx` is React-free) | `planThrow(key, faceIndex, level)` returns `{frames: {x, y, z, q}[], contacts: number[]}`. It picks a throw by a **hash of `rollKey`**, never the engine `Rng`, and multiplies it by the 4 yaw turns and a mirror. It then computes `R`, the cube symmetry that maps `faceNormal[faceIndex]` to the recording's final up face, choosing among the 4 the one that leaves the face's art **upright**. It applies `q_vis(t) = q_rec(t) · R`. |
| `src/fx/dice/solve.test.ts` | vitest | For every throw × face × variant, the last frame shows that face up and upright. Same key in, same throw out. `short` level output is shorter than `full`. |
| `src/fx/dice/cube.ts` | pure drawing on a 2D context | Orthographic top-down camera with a small fake perspective (scale = 1 + k·height). Rotates 8 corners and culls back faces. For each visible face, `ctx.setTransform(a, b, c, d, e, f)` maps the face's square bitmap to its exact parallelogram. Shading is 3 stepped tones from the normal, matching the `.die` light top-left and dark bottom-right. Adds an ink outline and an ordered-dither shadow that shrinks and fades with height. Draws at art pixels with `imageSmoothingEnabled = false` |
| `src/fx/dice/faceBitmap.ts` | pure plus OffscreenCanvas | Rasterises a `Face` to an N×N bitmap: type colour, ink or white pips via the same `pipLayout`, the number in the pixel font, the status badge from `ICONS` rows. Cached per `(type, face, size, colour)` |
| `src/components/DieThrow.tsx` | React | A `<canvas aria-hidden>` overlay above the die, about 3 × size tall and pointer-events none. It plays `planThrow` on rAF at a fixed 60 Hz like `Player`, scaled by `usePace()`. It fires `sfx.land` on contact frames and calls `onSettled`. |

### 5.3 Changes to existing code

- **`Die.tsx`** keeps the same API (`rollKey`, `delay`, `selected`, `combo`, `onClick`…).
  - When `rollKey` changes and the feature is on, it renders the resting `<span class="die">` with
    `visibility: hidden`, so the layout doesn't move and the button stays focusable, and mounts `DieThrow` over it.
  - On `onSettled` it unhides and removes the canvas. The last recorded frame is the flat top-down die at the same
    pixel size, so the hand-off is seamless. One squash frame (`scaleY .9` for 2 steps) can sell the landing.
  - Keep `aria-label` on the button. The canvas is decorative because the readout and the tray's `aria-live` message
    already say what was rolled.
- **`pixel.css`**: unchanged. The selection, combo and status rings stay on the DOM die after the hand-off. While a die
  is airborne it can't be selected anyway.
- **`useBattleAnimator.ts`**:
  - Keep the per-die keys as they are. Rerolling only the masked dice already falls out of this: only dice with a
    fresh key throw, and the kept dice stay as DOM.
  - Replace the single `rattle` with the per-contact `land` blips from `DieThrow`, at most 3 sounds per 100 ms across
    the tray, plus a softer `rattle` at release.
  - Check the step `delay`s (750 / 700 ms) against the chosen throw budget, or have the bake target ≤ 0.6 s at
    `full` so nothing else moves.
- **Lanes**: each die throws in its own lane above its slot, so dice don't collide and kept dice are never touched.
  Starts are staggered by `i · 50 ms` and each die gets a different throw, mirror and yaw from its key, so the tray
  reads as one natural throw.
- **Other call sites** get the new throw for free through `Die`: Title, Catch, Bait, Pickaxe, Trick and Kitchen Sink.
  Mini dice (`size < 40`, the foe's) can use the tail of a throw only, to keep the player's dice the focus.

### 5.4 Motion levels (to add to §8 of `docs/15-UI-GUIDELINES.md`)

| Level | Throw |
|---|---|
| `full` | The whole recorded throw (about 0.5–0.75 s × pace), shadow, a sound per bounce, squash on landing |
| `short` (player setting, auto battles via `MotionCap`, raid speed button through pace) | Only the last bounce and the settle (about 0.25–0.3 s), or the whole throw at about 1.6× |
| OS reduce motion (`calm`) | No tumbling in the air: the die drops 1–2 art pixels onto its shadow in 2 steps and shows its face. No sound per bounce |
| `off` | Nothing: the die is at rest at once (as today) |

### 5.5 Kitchen Sink and gating

- **Kitchen Sink**: in `/kitchen-sink` "Die — 19 skins" the reroll button replays the new throw. Add a row for each
  motion level and every face kind (pips, 0/7/8, every status). In `/kitchen-sink/fx` add a "Dice throw" entry with
  replay, ¼ speed, single-frame steps and "show the recording's raw top face" for debugging.
- **Gating**: the admin's Off / On for admin / On for everyone switch, off by default, checked by the server, as
  CLAUDE.md asks. It is purely visual, so a rules pop-up and INFO button probably don't apply. Confirm that with the
  user against §20.
- **Engine**: no change. The animation receives `faceIndex` from `RolledDie`, which the engine produced.

### 5.6 Phase 0 detail (the cheap fallback, in `Die.tsx` only)

- Replace `initial`/`animate` with keyframes. Take amplitudes and timing from a hash of `rollKey`, so no two dice
  match:
  - **y**: `[-1.4s, 0, -0.35s, 0, -0.1s, 0]` with times `[0, .42, .62, .78, .9, 1]`.
  - **Squash on each contact**: `scaleX [1, 1.18, 1, 1.08, 1]` and `scaleY [1, .8, 1, .92, 1]` at the contact times.
    Keep the squash short, 2 steps.
  - **rotateZ**: a spin that dies off, ending in a −8° → +4° → 0 wobble.
- While airborne, **cycle through the die's own faces** (`data.diceTypes[type].faces`, random order from the hash) at
  12 fps in steps, and lock to the result at first contact. This is the classic 2D dice tell, and it reads as rolling
  far better than a flip.
- Add a **shadow**: a dithered `motion.span` under the die, which needs a small `.die-shadow` pattern class. Its
  `scaleX` and opacity grow as the die falls (stepped).
- Drop `opacity: 0 → 1` and the `rotateX 540` flip. A die that fades in looks unreal.
- Use `ease: steps` or `times` frames in line with "pixel motion steps". Read `useMotion()`:
  - `short`: one bounce.
  - `calm`: the drop and squash only.
  - `off`: none.

---

## 6. Why not just add a 3D library?

- **The look.** The guidelines want pixel art: no blur, no soft shadows, motion in steps, every frame
  "one a pixel artist could have drawn". Smooth-shaded WebGL dice, or antialiased CSS 3D cubes, clash with the 2 px ink
  outlines and dithered light. A small orthographic cube drawn at art resolution with 3 stepped tones looks like a
  Game Boy Advance-era sprite that happens to be truly 3D.
- **Cost.** C costs about 10 KB in all. D costs about 129–152 KB gz, E about 139 KB gz, F about 800 KB+ and G about
  1.8 MB gz, all for a feature on screen for under a second per turn.
- **Control.** The engine's value has to land exactly, upright and in the tray's 360×640 layout, with pace, motion
  levels and auto-mode. The library options either can't force a result (F), are four years stale with a pinned old
  three (E), or need React 19 (G).
- **Testability.** Recordings plus a pure solver can be unit-tested in vitest: "every throw × face lands on that face".
  Live physics can't be tested that way.

---

## 7. Implemented: recorded throws (phase 1)

Option C, as the Dice Lab prototype's third panel (`docs/37-dice/dice-lab.html`) showed it, ported into modules.
Phase 0 (the keyframe bounce) was skipped: with the switch off, the dice tumble exactly as before.

### 7.1 What a player sees

Every die thrown with a roll key (the battle tray, yours and the foe's; the catch die and the Bait's; the pickaxe; Trick
or Treat; the title; the Kitchen Sink) comes in from about three dice above its spot as a small pixel cube: it tumbles,
bounces one to three times with a click each, slides and settles flat, square and upright on the face the engine
rolled. Then the normal die takes over in the same frame, and only then do its rings (a pick, a combo, a status) and
its lift show. Rerolling the picked dice throws only those: they are the dice with fresh roll keys. A Mega's extra die
throws alone, the same way.

### 7.2 How it is built

| File | Pure? | Role |
|---|---|---|
| `scripts/bake-dice.ts` (`pnpm bake:dice`) | dev | The prototype's rigid-body simulation (a unit cube, a floor, impulses at its corners; no dependency). Seeded throws, released high and far back. Keeps a throw only if it settles flat (up-normal ≥ 0.99), stays in its lane (|x| ≤ 0.62 die, thrown from behind, never more than 0.35 die past its spot) and lasts **0.45–0.70 s** in all. Turns the whole path about the vertical so the die rests square, eases the last few degrees of tilt out over 8 frames, snaps the last pose to an exact cube symmetry and holds it 4 frames (the hand-over). Writes `src/fx/dice/throws.json`: 48 throws, 30 frames a second (slerped in between), positions × 100 and quaternions × 1000 as whole numbers, each frame as its change from the one before, and the contacts worth a sound in ms. The same file on every run (same md5) |
| `src/fx/dice/math.ts`, `pips.ts` | pure | Vectors, quaternions and 3×3 matrices (the playback ones write into scratch, no allocation); the pip layout, moved out of `Die.tsx` so the DOM die and the cube draw the same face |
| `src/fx/dice/solve.ts` | pure | `planThrow(set, key, face, level)`: the recording comes from a **hash of the die's roll key** (FNV-1a with a final mix; never the engine's RNG), skipping the recordings other dice in the air are playing, plus a mirror bit. `R = Mfᵀ · goal`, where goal puts the face's normal up and its art's top towards the top of the screen: a rotation of the cube onto itself, so the turned recording is the same physical throw. `samplePlan` gives the pose at any moment, exactly the resting pose from the held frames on |
| `src/fx/dice/cube.ts` | pure | The renderer, into a canvas-sized pixel buffer at **1 pixel = 1 CSS px, drawn in 2 px blocks** (the art pixel) whose grid sits on the resting die's corner. Orthographic top-down camera with the prototype's fake perspective (× (1 + 0.09·height)) and lift (0.55·height up the screen). Each visible face is an exact affine image of its face art, sampled per block; three stepped shades from the light (top left), ink untouched; a one-block ink outline round the silhouette; an ordered-dither floor shadow that shrinks and thins with height. Face art is built once per look from the same data as `Die.tsx`: the type colour (or a die's own colour, the Bait's), `.die`'s light and dark rows (none under 40 px, as `.die-mini`), the 2 px ink edge, the pips at `pipLayout`, a number in the pixel font, a status face's badge folded inside its top right corner, a locked die's 80 % |
| `src/fx/dice/player.ts` | DOM | Lazy (with the JSON). **One requestAnimationFrame loop** for every die in the air: it reads every die's place first, then draws. Each die has its own small canvas (3 dice wide, 5 tall), `position: fixed` over its resting die, `aria-hidden`, `pointer-events: none`, `image-rendering: pixelated`, under the top bar (z 35; over the pop-up when the die is in one). It clears and uploads only what the last frame and this one drew. A `land` click per contact, at most one every 40 ms across the tray |
| `src/components/useDieThrow.ts` | React | Used by `Die.tsx`, whose props are unchanged. With the switch on and a roll key, the face (`.die`) is hidden with `visibility` (its place and the button's focus kept) and the throw starts; on landing it shows again in the same frame as the canvas goes. A pick's or a combo's lift waits for the landing. The chunk is fetched as soon as any die renders with the switch on; a first throw waits at most 400 ms for it, then the die simply shows |

**The last frame is the resting die.** The held pose is not sampled in blocks: the face art is copied pixel for pixel
onto the die's spot, with `.die-wrap`'s 3 px drop shadow under it, so the hand-over can't be seen. Where `pipLayout`
puts a pip on an odd pixel (44, 50 and 54 px dice), the blocks in flight can't, so those pips move by 1 px as the die
comes to rest, inside the throw, never at the hand-over. A status face's ring and its badge outside the corner are the
DOM die's (a filter round the whole die): they appear on landing, with the badge moving from inside the corner to its
place, which reads as the status lighting up.

**Timing.** The battle's roll step is 750 ms (a reroll's 700) × pace (`useBattleAnimator.ts`); the throws last 0.53–0.70 s
at 1×, plus the tray's 50 ms stagger per die: as long as the old 0.6 s tumble with its stagger. The throw plays at the
battle's pace: auto battles (`AUTO_PACE`, ⅔) and Versus play faster, and idle mode's autopilot plays its fights as auto
battles, capped at `short` (`MotionCap`), so its dice play only their last 0.32 s at ⅔: about 0.2 s.

### 7.3 Motion levels and sound

| Level | Throw |
|---|---|
| `full` | The whole recorded throw at the battle's pace, a click per bounce |
| `short` (the setting, auto battles, Versus) | The last 0.32 s: the last bounce and the settle |
| The OS asks for less motion (`calm`) | No tumble: the resting face 2 art pixels above its shadow, then 1, then down (67 ms each). No click |
| `off` (admin) | At rest at once, as before |

### 7.4 The switch, and no rules pop-up

**Always on since 2026-10-28** (the user's call, when Admin → Config was made simpler): the switch is gone, the game
keeps only the "on" path, and [`supabase/migrations/0081_switches_retired.sql`](https://github.com/Splifingald/pokedice/blob/claude/beautiful-hopper-t3trh9/supabase/migrations/0081_switches_retired.sql) deletes its row
(`supabase/seed.sql` carries it inlined). What follows is how it was gated until then.

Admin → Config → **Dice throws**: Off / On for admin / On for everyone, **Off by default** (`config.diceThrows`,
`diceThrowsOn`). Off: the dice tumble as before (the framer tween, untouched). It changes how dice look, never what they
roll, so the game alone reads it: no server function acts for it, and there is nothing for the server to check.
It is purely visual, with nothing to learn or do, so it has **no rules pop-up and no INFO button** (§20 of the UI
guidelines: like a passive announcement).

### 7.5 Kitchen Sink

`/kitchen-sink` → "Dice throws", whatever the switch says (`DiceLabContext`): a tray at each motion level (full, short,
the calm drop, off) with THROW ALL, a reroll of the picked dice only and slow motion (¼); frozen frames at 0.10, 0.25,
0.40 and 0.55 s; every status face; the foe's 40 px dice; the dice at rest; and under each tray which recording each die
plays (its number, mirrored or not, the face it would show unturned, its length).

### 7.6 Size and cost

Measured with `vite build`: the lazy chunk (`player-*.js`: the throws, the solver, the renderer, the loop) is
**35.7 kB, 14.8 kB gzipped**; the main chunk grows by 1.9 kB (0.7 kB gzipped). No new dependency. At run time a die's
canvas is about 160 × 270 px for a 54 px die, drawn only while it flies; a frame samples one block per art pixel of
the cube's box (at most about 1,600 for a 54 px die, against three faces) and allocates nothing but the browser's
own `DOMRect`s.

### 7.7 Setting it up

Now: run 0081 (above) once the client is deployed; nothing to switch. Before it:

1. Deploy the client (the switch is Off: nothing changes for anyone).
2. Run `supabase/migrations/0069_dice_throws.sql` (the switch's row, Off, and the content version + 1; safe to run
   again): https://github.com/Splifingald/pokedice/blob/claude/gifted-cray-t73mqb/supabase/migrations/0069_dice_throws.sql
   (the branch this was made for; the same path on whichever branch it is pushed to). `supabase/seed.sql` carries it too
   (inlined). Without it, the admin's switch still saves (it inserts the row).
3. Admin → Config → **Dice throws**: **On for admin** to try it signed in, **On for everyone** to open it. Publish.

To record new throws (other ranges, more of them), change `scripts/bake-dice.ts` and run `pnpm bake:dice`; the tests
check whatever it writes.

### 7.8 Tests

- `tests/dice-throws.test.ts`: every throw × every face × mirror ends with that face up and its art upright, and the
  frame before the held pose already shows that face (no snap); R is a cube symmetry; the same key plays the same
  throw; eight dice of a roll never share a recording, over 50 rolls; keys spread over the recordings and both
  mirrors; `short` is the end of the same throw, `calm` a two-step drop with no clicks; every recording is 0.45–0.70 s,
  in its lane and ends on an exact cube pose; the resting pose is drawn pixel for pixel on the die's spot; a frame in
  the air is whole 2 px blocks with an ink outline; the switch (off, admin only, everyone).
- `tests/dice-throws-sql.test.ts`: migration 0069 on PGlite (Off, the version + 1, the admin's choice kept on a second
  run, inlined in `seed.sql`).
- `e2e/dice-throws.spec.ts`: a real battle on a 360×640 phone. Switch on: the dice land with no canvas left; a reroll
  of one picked die gives one canvas, that die's face hidden (its button still there) and the others showing; then
  the canvas goes, the face shows, the kept dice keep their names. Switch off: no canvas ever.

---

## Sources

- Repo: `src/components/Die.tsx`, `src/components/DiceSet.tsx`, `src/components/FaceDice.tsx`,
  `src/styles/pixel.css` (§Dice), `src/engine/dice.ts`, `src/engine/types.ts`,
  `src/screens/battle/BattlePanel.tsx`, `src/screens/battle/useBattleAnimator.ts`,
  `src/screens/battle/BattleView.tsx`, `src/lib/motion.ts`, `src/lib/pace.ts`, `src/App.tsx` (MotionConfig),
  `src/fx/pixel.ts`, `src/components/StageCanvas.tsx`, `src/audio/sfx.ts`, `src/components/icons.tsx`,
  `docs/15-UI-GUIDELINES.md` §1, §4, §7, §8, §14, §20, `package.json`.
- dice-box-threejs (predetermined `@` notation, MIT): https://github.com/3d-dice/dice-box-threejs
- Fantastic Dice dice-box docs and v1.1 notes: https://fantasticdice.games/docs/usage/config and https://fantasticdice.games/blog/version-1.1
- threejs-dice (`prepareValues` and `shiftUpperValue` relabelling): https://github.com/byWulf/threejs-dice, with source at
  https://raw.githubusercontent.com/byWulf/threejs-dice/master/lib/dice.js. Forks: https://github.com/BreadMoirai/threejs-dice, https://github.com/eipporko/threejs-dice
- Reading the landed face from the face normals: https://github.com/brainfkt/3dice
- Replay determinism pitfall: https://www.html5gamedevs.com/topic/32589-simulate-outcome-of-physics-object-movement/
- Castle Game Engine dice demo (record, then rotate to the chosen face): https://forum.castle-engine.io/t/dice-throwing-demo-recording-physics-simulation/1861
- Texture-swap and pre-rendered alternatives: https://irrlicht.sourceforge.io/forum/viewtopic.php?p=291746
- three.js and cannon-es dice tutorial (Codrops): https://tympanus.net/codrops/?p=69521
- Tween-to-result three.js tutorial: https://code.tutsplus.com/3d-in-the-browser-with-threejs--CRS-200640c/rolling-the-dice
- CSS 3D dice: https://github.com/GitSquared/diceroll/blob/master/README.md, https://dev.to/learncomputer/create-your-own-interactive-3d-dice-roller-a-step-by-step-guide-34b3, https://alvaromontoro.com/blog/67992/single-element-dice-with-css
- `filter` flattens `preserve-3d`: https://developer.mozilla.org/docs/Web/CSS/transform-style, https://tympanus.net/codrops/?p=21812
- three.js pixelation: https://threejs.org/docs/pages/RenderPixelatedPass.html
- WebGL context limits: https://bugs.webkit.org/show_bug.cgi?id=200031, https://bugnet.io/blog/how-to-fix-too-many-active-webgl-contexts-oldest-context-will-be-lost
- npm packages: https://www.npmjs.com/package/three, https://www.npmjs.com/package/cannon-es, https://www.npmjs.com/package/@dimforge/rapier3d-compat, https://www.npmjs.com/package/@react-three/fiber, https://www.npmjs.com/package/@react-three/rapier, https://www.npmjs.com/package/@3d-dice/dice-box, https://www.npmjs.com/package/@3d-dice/dice-box-threejs, https://www.npmjs.com/package/lottie-web, https://www.npmjs.com/package/@lottiefiles/dotlottie-web, https://www.npmjs.com/package/@rive-app/canvas-lite
