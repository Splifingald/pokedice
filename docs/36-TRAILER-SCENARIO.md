# 36 · The Pokédice trailer

A 22-second trailer for Pokédice, written shot by shot first, then built from the game's own code (`trailer/`,
`pnpm trailer`). Every timecode is in seconds from the start (frames at 60 fps: `f` = s × 60). This file is the
reference for the build; change it here first.

**Status (2026-10-23): built** on `claude/pokedice-trailer-video-5jq0o9`. The video's name: **Pokédice - Web Game
Trailer** (never shown on screen). The user's answers are in §11. It came out 1.5 s longer than the first draft's
20.5 s: the lab needed time for the three Pokémon to be seen and for the question to hold, and the showdown needed
room for the slow die.

## 0. The rules of the trailer

- **About 70 % the game, 30 % trailer** (the user's rule). The Pokémon sprites, the dice, the Daybreak palette, the
  Jersey fonts, the area pictures, the stage and the move / evolution / Mega / Gigantamax / legendary / raid / trade /
  starter effects are the game's (`src/fx/timelines`, `src/components/Die.tsx`, `docs/15-UI-GUIDELINES.md`). On top
  of them, the trailer adds what gameplay footage doesn't have: camera moves, close-ups on the battle area, the dice
  as an overlay, speed lines, impact frames, an ink freeze, a beat-synced edit and music.
- **Always the battle area.** Every shot of acts 2 and 3 is framed on the stage. Menus only appear in act 4, as
  quick cut-ins.
- **Minimal titles.** The full list of words is in §7.
- **Square pixels.** The art is drawn small and scaled up nearest-neighbour: the stage at ×8 to ×10, the dice
  scenes at ×6, the dice overlay at ×4.
- **Format.** 1920×1080, 60 fps, H.264 + AAC. 16:9 first; a vertical cut may come later (§9).

## 1. The beat sheet

| # | Act | From | To | Length | What |
|---|---|---|---|---|---|
| 1 | Title | 0 | 2.5 | 2.5 s | Dice roll onto a table and spell POKÉDICE |
| 2 | Hero journey | 2.5 | 10 | 7.5 s | Charmander vs Bulbasaur → Charmeleon vs Scyther → Charizard vs Mewtwo |
| 3 | Montage | 10 | 15 | 5 s | 1 → 2 → 4 → 8 battle clips filling the screen |
| 4 | Features | 15 | 17.5 | 2.5 s | Friends, Versus, Trading, Co-op raids, Co-op Day Care |
| 5 | The choice | 17.5 | 20 | 2.5 s | Oak's lab, three Poké Balls: "What's your choice?" |
| 6 | End card | 20 | 22 | 2 s | The dice logo, website, Discord |

Total **22 s (1320 frames)**. The music is 120 BPM (a beat is 0.5 s), so the acts start on beats.

---

## 2. Act 1 — the title (0 → 2.5)

A wooden table seen from three-quarters above (oak planks, seams, grain, a pool of morning light, dust in the light),
drawn at 320×180 and shown ×6. The dice are real 3D cubes rendered at that size, so they stay pixel art while they
turn, with the game's die look on every face: the type colour, the ink edge, the light top-left and shaded
bottom-right, pips on whole pixels.

| Die | P | O | K | É | D | I | C | E |
|---|---|---|---|---|---|---|---|---|
| Type | Fire | Water | Grass | Electric | Psychic | Ice | Dragon | Fairy |

The letter is on one face; the other five show pips, so it only appears when the die lands.

| Time | Picture | Sound |
|---|---|---|
| 0–0.12 | Out of black: the eight dice come in from the bottom right, high and spinning, two ghost frames behind each. | The game's `rattle`. |
| 0.12–1.4 | They bounce twice and roll right to left (the turn follows the distance, so each stops turning as it arrives), staggered by 2–3 frames; the camera trails them. They settle in a row on their letters, each turned a little and a step off the line, so POKÉDICE reads but looks thrown. The E wobbles on an edge before it falls flat. | A `land` per bounce. A riser. |
| 1.5 | Impact: the dice flash white for 2 frames, all eight ring gold (the combo ring) and a gold pixel ring rushes out over the table. | `levelup`, the music's downbeat. |
| 1.75–2.3 | The camera pushes in. `A dice battler` comes in under the row. | The title riff. |
| 2.3–2.5 | The É die flies at the camera, spinning, its face filling the screen yellow → cut. | |

## 3. Act 2 — the hero journey (2.5 → 10)

The stage at ×8–×10 on the area's picture, the camera moving between the foe and your Pokémon. The plates: the foe's
top left (name, types, level, HP bar, a trainer's party as red squares), yours bottom right (name, level, HP bar and
numbers). **The dice are an overlay** over a dark band at the bottom: 3D dice thrown in from the left, rolling and
stopping on their faces; picked dice lift with the red ring and are thrown again; the combo's dice ring gold; the
combo chip and the damage (big, white, ink outline, red drop) slam in above them. Then the move plays on the stage
(the game's attack timeline, played faster and from just before its release).

### 3.1 Charmander vs a wild Bulbasaur (2.5 → 4.5)

| Time | Picture | Sound |
|---|---|---|
| 2.5 | Route 1. The camera on Bulbasaur, ×9; the plates slide in. | Bulbasaur's cry. |
| 2.65–3.35 | Three Fire dice land 4 · 4 · 2; the two 4s ring gold: `PAIR`, `14`. | `rattle`, `land`s. |
| 3.35–4.05 | Whip-pan to Charmander, Flamethrower (the fire timeline), whip-pan back: the hit, a screen shake, `-14`, Bulbasaur's HP drains. It faints (sinks and fades). | `super`, `faint`. |
| 4.2–4.5 | Charmander's plate flips to Lv.16; it glows white and the white takes the screen. | `levelup`. |

### 3.2 Charmeleon vs a trainer's Scyther (4.5 → 7)

| Time | Picture | Sound |
|---|---|---|
| 4.5–4.75 | Out of the white: the evolution's burst, Charmeleon standing in its light. | Charmeleon's cry. |
| 4.75 | Cut to Viridian Forest. Scyther (Lv.24, a party of 3) strikes first: Charmeleon's HP drops to yellow. | Scyther's cry, a hit. |
| 5.16–6.3 | Three Fire dice and a Normal one land 6 · 2 · 6 · 3. The 2 and the 3 lift with the red ring and are rerolled → 6 and 3: three 6s ring gold, `THREE OF A KIND`, `38`. | `rattle` × 2. |
| 6.3–6.85 | Flamethrower, `-38`, Scyther faints. The Boulder Badge spins in at the top right. | `super`, `faint`, `gold`. |
| 6.84–7 | The screen burns from the bottom: red, orange, yellow flame tongues. | |

### 3.3 Charizard vs Mewtwo (7 → 10)

| Time | Picture | Sound |
|---|---|---|
| 7–7.8 | Cerulean Cave. Mewtwo's legendary entrance (legend.ts, Mewtwo's own aura), hurried through the dark and the rising silhouette, slowed for the reveal and the name card `MEWTWO LV70 PSYCHIC`. | Heartbeats, Mewtwo's cry, the quake. |
| 7.8–8.05 | Reverse shot, low and close on Charizard; the plates slide in. | Charizard's cry. |
| 8.08–9.4 | Five dice land 5 · 5 · 5 · 5 · 2. The 2 lifts and is rerolled; it turns in slow motion (¼ speed) while the stage dims, then lands on 5: the five ring gold and flash white, gold speed lines, `FIVE OF A KIND`, `126` shaking. | The music stops under the slow die (a heartbeat), then hits when it lands. |
| 9.45–9.94 | Flamethrower. On the hit: a white impact frame (2 frames), Charizard and Mewtwo as ink silhouettes on white with ink speed lines (5 frames), then colour again as Mewtwo's HP empties. | The biggest hit. |
| 9.94–10 | Smash cut to black. | Silence. |

## 4. Act 3 — the montage (10 → 15)

The screen fills with battles, splitting on the beat. Each tile has a 12-px ink border and its star's type colour as a
rim; no titles.

| Clip | What it shows | From the game | Rim |
|---|---|---|---|
| G | **Rayquaza's raid opening**: the alarm with its two hazard tapes, the storm and lightning, the silhouette rising with a glowing outline, the pillar of light, the white-out reveal with shockwaves and embers, `RAID BATTLE / RAYQUAZA` and the five HP bars filling | `RaidIntro.tsx`, redrawn landscape (`trailer/lib/raidIntro.ts`) | Dragon |
| E | **Mega Evolution**: Charizard → Mega Charizard X, on the Indigo Plateau | `megaTimeline` | Fire |
| F | **Gigantamax**: Gengar → G-Max Gengar, in Pokémon Tower | `gmaxTimeline` | Ghost |
| D | **Groudon**: its entrance in a volcano lair | `legendTimeline` | Ground |
| A | **Mew**: its entrance on Faraway Island | `legendTimeline` | Psychic |
| B | **Lugia**: its entrance in a sea cave | `legendTimeline` | Flying |
| C | **Celebi**: its entrance in Ilex Forest | `legendTimeline` | Grass |
| H | **Trading**: the two balls along the cable of light | `tradeTimeline` | Gold |

| Time | Grid | Sound |
|---|---|---|
| 10–11 | **1 tile**: G full screen (the alarm, the storm). | The raid's alarm and storm. |
| 11–12 | **2 tiles**: G (Rayquaza revealed, its name slamming down) and E (Charizard Mega Evolving). | The raid's boom, the Mega. |
| 12–13 | **4 tiles**: G, E, F, D. | Gigantamax, Groudon. |
| 13–14.5 | **8 tiles** (4×2): the four new ones come in white, a beat apart (Mew, Lugia, Celebi, the trade). | The music alone. |
| 14.5–14.8 | The tiles flash gold one after another, like a combo ring running along the dice. | The roll. |
| 14.82–15 | White takes the screen. | |

## 5. Act 4 — the features (15 → 17.5)

Five cut-ins of 0.5 s, hard cuts, each opening on a white frame. The word slams in bottom left (Jersey 25, white, ink
outline, a gold bar under it), always in the same place.

| Time | Picture | Word |
|---|---|---|
| 15 | Three friends' cards slide in on the dotted parchment: trainer sprite, name (the first one golden), friend ID, three menu icons of their Pokémon, the green online dot. | `FRIENDS` |
| 15.5 | The Versus stadium: Red and Green slide in face to face, `VS` slams in gold, each side's dice hop onto the field. | `VERSUS` |
| 16 | The trade's arrival: the ball comes down the beam onto the pad, bounces, opens on Alakazam. | `TRADING` |
| 16.5 | A sea cave: Kyogre with five HP bars, Charizard, Blastoise and Venusaur in front, three trainers' cards cutting in, three dice landing over each ally. | `CO-OP RAIDS` |
| 17 | The Day Care yard: Ditto and a friend's Dragonite (with its `FRIEND'S` tag) hop toward each other, a heart, an Egg pops up and wobbles. | `CO-OP DAY CARE` |

## 6. Act 5 — the choice (17.5 → 20)

The partner moment (docs/15 §18): the lab picture, Oak's table, its three cradles (`StarterScene`).

| Time | Picture | Sound |
|---|---|---|
| 17.5–18.25 | Out of a white frame, the three Poké Balls drop onto their cradles one after another (the lab's own animation, 2.4× faster). The camera pushes in on the table. | The game's drop and land sounds. |
| 18.25–18.85 | Bulbasaur, Charmander and Squirtle pop out of their balls one after another and go back in. | Their cries. |
| 18.9–20 | **Hold** on the three balls and the game's dialogue box: `What's your choice?` types in, then its ▼ blinks. | A blip per letter, the quiet arpeggio. |

## 7. Act 6 — the end card (20 → 22)

| Time | Picture | Sound |
|---|---|---|
| 20 | Cut to ink with the parchment's dot texture. The POKÉDICE dice drop into their crooked row one after another. | A `land` per die, the last chord (D major). |
| 20.45 | The dice ring gold; a gold ring pulses under the row once a second. | |
| 20.4–20.75 | `PLAY FREE IN YOUR BROWSER` (gold), `poke-dice.netlify.app` (big, white), the Discord badge and `discord.gg/XKJQYw3p9`, then `Fan-made · non-commercial. Pokémon © Nintendo / Game Freak / Creatures.` (small). | |
| 21.85–22 | Fade to black. | The chord rings out. |

**Every word on screen**: `A dice battler`; the plates' names and levels; `PAIR`, `THREE OF A KIND`,
`FIVE OF A KIND` and the damage; the game's own name card (`MEWTWO`…) and the raid's (`RAID BATTLE`, `RAYQUAZA`,
the tapes); `VS`; the five feature words; `What's your choice?`; the end card.

## 8. Sound

- **Music** (`trailer/lib/music.ts`): an original chiptune at 120 BPM, synthesised like the game's sound effects
  (pulse, triangle, noise), so nothing is borrowed. D minor through the journey (a chord a fight), the drums out under
  Mewtwo's entrance and under the slow die, a build and a snare roll over the montage, the riff an octave up under the
  features, a quiet arpeggio in the lab, D major on the end card.
- **Sound effects**: the game's own. `src/audio/sfx.ts` is handed an offline audio context whose clock reads the
  trailer's time, so every timeline's cue sounds on the frame it fires; the raid opening's sounds are the game's too.
- **Cries**: Showdown's, as the game plays them.

## 9. A vertical cut (1080×1920), later

Same shots and timing; the stage re-framed on the Pokémon in action, the montage grid 1 → 2 (stacked) → 4 → 8 (2×4).
Not built yet.

## 10. How it's made

- **`trailer/`**, a page Vite serves in development (`/trailer/index.html`). It isn't part of the game's build, so
  nothing ships to players and it has no admin switch. Add `?play` to the address to watch it in real time (no
  sound).
- It reuses the game's code directly: the fx timelines (their fixed 1/60 s steps make every frame reproducible,
  `trailer/lib/run.ts`), the sprites (each animated GIF decoded once and swapped in frame by frame,
  `trailer/lib/sprites.ts`), the area pictures, the lab and the starter scene, the palette, the fonts, the die look.
  The new drawing is the 3D dice (`trailer/lib/cube.ts`), the camera (`trailer/lib/stage.ts`), the plates and
  readouts (`trailer/lib/hud.ts`) and each act (`trailer/acts/`).
- **`pnpm trailer`** (`scripts/trailer.ts`): starts Vite, opens the page in Chromium, draws the frames in order and
  pipes them to ffmpeg, then mixes the sound the page recorded into `trailer/out/pokedice-trailer.mp4` (git-ignored).
  `--stills 0,150,600` writes single frames to `trailer/out/stills/`; `--from 150 --to 540` a silent part. Showdown's
  sprites and cries are fetched once into `scripts/.cache/trailer`. `CHROMIUM_PATH` points at another Chromium when
  Playwright's own isn't installed.
- Needs ffmpeg on the PATH. A full render takes a few minutes.

## 11. Decided (2026-10-23)

1. **Website**: `poke-dice.netlify.app` (https://poke-dice.netlify.app/).
2. **Montage**: no title on screen. "Pokédice - Web Game Trailer" is the video's name.
3. **Format**: 16:9 first.
4. **Charmeleon's opponent**: Scyther.
5. **Look**: at least 70 % like the game; it's a trailer, so not only pure gameplay footage.
