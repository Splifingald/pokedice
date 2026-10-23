# 36 · The Pokédice trailer

A trailer for Pokédice, written shot by shot first, then built from the game's own code (`trailer/`, `pnpm trailer`).
Every timecode is in seconds from the start (frames at 60 fps: `f` = s × 60). This file is the reference for the
build; change it here first.

**Status (2026-10-23): version 2 built** on `claude/pokedice-trailer-video-5jq0o9`, **61 s**. The video's name:
**Pokédice - Web Game Trailer** (never shown on screen).

Version 1 (22 s) went by too fast to understand, the user said. Version 2 follows their notes (§11): a longer pause on
the title, cleaner letters on the dice and a dark backdrop instead of the table; every roll worked out on screen and
held; the whole evolution; Charizard's five dice with two Flying ones, a long slow motion and a celebration; Rayquaza,
the Mega Evolution and the Gigantamax each full screen; four bosses together, then four raids together, no trade
there; slower features; in the lab, the balls stay shut and the camera closes in on the middle one while it shakes.

## 0. The rules of the trailer

- **About 70 % the game, 30 % trailer.** The Pokémon sprites, the dice, the Daybreak palette, the Jersey fonts, the
  area pictures, the stage and the move / evolution / Mega / Gigantamax / legendary / raid / trade / starter effects
  are the game's (`src/fx/timelines`, `src/components/Die.tsx`, `docs/15-UI-GUIDELINES.md`). On top of them: camera
  moves, close-ups on the battle area, the dice as an overlay, the damage worked out on screen, speed lines, impact
  frames, an ink freeze, confetti, music.
- **It explains.** Every roll shows each die's value, then the game's formula: (the dice + the combo's bonus) × the
  type's multiplier = the damage, using the game's real numbers (combo bonuses from `upgrades.json`, the type chart).
  The captions are the game's own battle lines (`strings.csv`).
- **Always the battle area** in the fights and the big moments; menus only in the features, as cut-ins.
- **Square pixels.** The art is drawn small and scaled up nearest-neighbour: the stage at ×8 to ×17, the title and the
  end card at ×3 (640×360), the dice overlay at ×4.
- **Format.** 1920×1080, 60 fps, H.264 + AAC at −14 LUFS. 16:9 first; a vertical cut may come later.

## 1. The beat sheet

| # | Part | From | To | What |
|---|---|---|---|---|
| 1 | Title | 0 | 4 | Dice roll and spell POKÉDICE, long hold |
| 2 | Fight 1 | 4 | 10 | Charmander vs Bulbasaur: a pair, explained |
| 3 | Evolution | 10 | 13 | Charmander → Charmeleon, the whole morph |
| 4 | Fight 2 | 13 | 20 | Charmeleon vs Scyther: a reroll, three of a kind |
| 5 | Fight 3 | 20 | 29.5 | Mewtwo's entrance; Charizard's five 5s in slow motion, a celebration |
| 6 | Rayquaza | 29.5 | 34 | Its raid opening, full screen |
| 7 | Mega Evolution | 34 | 37 | Charizard → Mega Charizard X, full screen |
| 8 | Gigantamax | 37 | 40 | Gengar → G-Max Gengar, full screen |
| 9 | Bosses | 40 | 43.5 | Mew, Celebi, Jirachi, Shaymin, together |
| 10 | Raids | 43.5 | 47 | Lugia, Groudon, Palkia, Zacian, together |
| 11 | Features | 47 | 53 | Friends, Versus, Trading, Co-op raids, Co-op Day Care, 1.2 s each |
| 12 | The choice | 53 | 57.5 | Oak's lab: the balls drop, the middle one shakes, "What's your choice?" |
| 13 | End card | 57.5 | 61 | The dice logo, website, Discord |

The music is 120 BPM (a beat is 0.5 s).

---

## 2. Title (0 → 4)

Daybreak's dusk navy, lighter in the middle in dithered steps, with a soft pattern of Poké Ball outlines drifting
across it (`trailer/lib/backdrop.ts`). The dice are real 3D cubes drawn at 640×360, with the game's die look on every
face; the letters are the game's own bitmap font (three texels a dot), so their edges are straight.

| Die | P | O | K | É | D | I | C | E |
|---|---|---|---|---|---|---|---|---|
| Type | Fire | Water | Grass | Electric | Psychic | Ice | Dragon | Fairy |

| Time | Picture | Sound |
|---|---|---|
| 0–1.4 | The dice come in from the bottom right, bounce and roll right to left, and settle a little crooked on their letters; the E wobbles on an edge. | `rattle`, a `land` per bounce, a riser. |
| 1.5 | The dice flash white and ring gold; a gold ring rushes out over the floor. | `levelup`, the downbeat. |
| 1.75–3.7 | The camera pushes in and drifts; `A dice battler` comes in under the row and holds. | The riff, a held chord. |
| 3.7–4 | The É die flies at the camera and fills the screen. | A snare pickup. |

## 3. The fights (4 → 29.5)

The stage at ×8–×10 on the area's picture. The plates: the foe's top left, yours bottom right. The dice are an
overlay over a dark band at the bottom: thrown in from the left, rolling, stopping on their faces; each die's value
pops up over it; picked dice lift with the red ring and are thrown again; the combo's dice ring gold. Above them the
damage builds term by term, each combo and multiplier named in a chip over its number, then the result slams in.

### Fight 1, Charmander vs a wild Bulbasaur (4 → 10)

| Time | Picture | Sound |
|---|---|---|
| 4 | Route 1; the plates slide in; `What will Charmander do?` | Bulbasaur's cry. |
| 4.7–5.3 | Three Fire dice land 4 · 4 · 2; the values pop up. | `rattle`, `land`s. |
| 5.6–6.9 | `(4 + 4 + 2` · `+ 2)` under **PAIR** (the two 4s ring gold) · `× 2` under **SUPER EFFECTIVE** (Fire on Grass) · `= 24`. Held to 7.7. | |
| 7.7–8.6 | Flamethrower, `-24`, Bulbasaur faints. | `super`, `faint`. |
| 8.9–10 | `Charmander grew to Lv.16!`; it glows white and the white takes the screen. | `levelup`. |

### The evolution (10 → 13)

The game's evolution, nearly whole (1.9× its speed): the light gathers, the silhouette morphs, the burst, Charmeleon
standing in its light. `What? Charmander is evolving!`, then `Charmander evolved into Charmeleon!` and its cry.

### Fight 2, Charmeleon vs a trainer's Scyther (13 → 20)

| Time | Picture | Sound |
|---|---|---|
| 13–13.9 | Viridian Forest. Scyther (a party of 3) strikes first; Charmeleon's HP drops to yellow. | Scyther's cry, a hit. |
| 14–14.6 | Three Fire dice and a Normal one land 6 · 2 · 6 · 3. | `rattle`. |
| 15–16.4 | `Tap dice to throw them again.` The 2 and the 3 lift with the red ring, are thrown again and land 6 and 3. | `rattle`. |
| 16.7–17.9 | `(6 + 6 + 6 + 3` · `+ 6)` under **THREE OF A KIND** · `× 2` under **SUPER EFFECTIVE** · `= 54`. Held to 18.6. | |
| 18.6–19.75 | Flamethrower, `-54`, Scyther faints, the Boulder Badge spins in. | `super`, `faint`, `gold`. |
| 19.75–20 | The screen burns from the bottom. | |

### Fight 3, Charizard vs Mewtwo (20 → 29.5)

| Time | Picture | Sound |
|---|---|---|
| 20–21.8 | Cerulean Cave: Mewtwo's legendary entrance, its name card. | Heartbeats, its cry. |
| 21.8–22.5 | Low and close on Charizard. | Its cry. |
| 22.6–23.3 | Five dice, **three Fire and two Flying**, land 5 · 5 · 5 · 5 · 2. | |
| 23.7–24.4 | `Tap dice to throw them again.` The 2 (a Flying die) lifts and is thrown again. | |
| 24.55–26.92 | **The slow motion**: the camera closes in on that die as it turns at a twelfth of its speed, the stage dark and pulsing with a heartbeat. | The music stops: a heartbeat, a long riser. |
| 26.92 | It lands on 5: five 5s. The dice flash white and ring gold, gold rays turn behind them, confetti bursts, the dice hop, **FIVE OF A KIND!** slams in huge. | A fanfare in D major. |
| 27.4–28.3 | `5 + 5 + 5 + 5 + 5` · `+ 70` under **FIVE OF A KIND** (maxed, as a Charizard this far along has it) · `= 95`. | |
| 28.6–29.5 | Flamethrower; on the hit a white impact frame, then the two as ink silhouettes on white, then colour as Mewtwo's HP empties; cut to black. | The biggest hit. |

## 4. The big moments (29.5 → 47)

| Time | Picture |
|---|---|
| 29.5–34 | **Rayquaza's raid opening**, full screen (`RaidIntro.tsx`, redrawn landscape in `trailer/lib/raidIntro.ts`): the alarm and its hazard tapes, the storm and lightning, the silhouette rising, the pillar of light, the reveal, `RAID BATTLE / RAYQUAZA` and its five HP bars filling. |
| 34–37 | **Mega Evolution**, full screen, on the Indigo Plateau: Charizard → Mega Charizard X. `Charizard Mega Evolved into Mega Charizard X!` |
| 37–40 | **Gigantamax**, full screen, in Pokémon Tower: Gengar → G-Max Gengar. `Gengar Gigantamaxed!` |
| 40–43.5 | **Four legendary bosses** in a 2×2 grid, their entrances a beat apart: Mew (Faraway Island), Celebi (Ilex Forest), Jirachi (a summit), Shaymin (a flower field). A `LEGENDARY BOSSES` chip where the tiles meet. |
| 43.5–47 | **Four raids** in a 2×2 grid, each one's raid opening: Lugia, Groudon, Palkia, Zacian. A `RAIDS WITH FRIENDS` chip. White takes the screen at the end. |

Each tile has a 12-px ink border and its star's type colour as a rim; each part opens on a white frame.

## 5. The features (47 → 53)

Five cut-ins of 1.2 s. The word slams in bottom left (Jersey 25, white, ink outline, a gold bar under it).

| Time | Picture | Word |
|---|---|---|
| 47 | Three friends' cards slide in: trainer sprite, name (the first golden), friend ID, their Pokémon, the online dot. | `FRIENDS` |
| 48.2 | The Versus stadium: Red and Green slide in, `VS` slams in, each side's dice hop onto the field. | `VERSUS` |
| 49.4 | The trade's arrival: the ball comes down the beam, bounces, opens on Alakazam. | `TRADING` |
| 50.6 | A sea cave: Kyogre with five HP bars, Charizard, Blastoise and Venusaur, three trainers' cards, three dice landing over each ally, the last bar draining. | `CO-OP RAIDS` |
| 51.8 | The Day Care yard: Ditto and a friend's Dragonite (its `FRIEND'S` tag) hop toward each other, a heart, an Egg pops up and wobbles. | `CO-OP DAY CARE` |

## 6. The choice (53 → 57.5)

| Time | Picture | Sound |
|---|---|---|
| 53–54.2 | Oak's lab (`StarterScene` on the lab picture): the three Poké Balls drop onto their cradles. They stay shut. | The game's drop and land sounds. |
| 54.3–56 | The camera closes in on the middle ball (×8 → ×17) while it shakes in bursts, like one about to open. | A rattle per shake, a quiet arpeggio. |
| 55.7–57.5 | The game's dialogue box: `What's your choice?` types in, its ▼ blinks. | A blip per letter, the music hangs on its A chord. |

## 7. End card (57.5 → 61)

The title's navy backdrop. The POKÉDICE dice drop into their crooked row, ring gold, a gold ring pulses under them;
`PLAY FREE IN YOUR BROWSER`, `poke-dice.netlify.app`, the Discord badge and `discord.gg/XKJQYw3p9`, the fan-made
line. Fade to black at 60.7–61. The last chord in D major rings out.

## 8. Sound

- **Music** (`trailer/lib/music.ts`): original, synthesised like the game's sound effects. D minor through the fights,
  D major for the evolution, the five of a kind and the end card; a light groove under each explained roll, the
  drums out under Mewtwo's entrance and the slow die, a build through the big moments, the riff an octave up under the
  features, a quiet arpeggio in the lab.
- **Sound effects**: the game's own, on the frame each cue fires (`src/audio/sfx.ts` gets an offline audio context
  whose clock reads the trailer's time). **Cries**: Showdown's.

## 9. A vertical cut (1080×1920), later

Not built yet.

## 10. How it's made

- **`trailer/`**: a page Vite serves in development (`/trailer/index.html`), not part of the game's build, so nothing
  ships to players and it has no admin switch. `?play` plays it in real time (no sound).
- It reuses the game's code: the fx timelines (fixed 1/60 s steps make every frame reproducible, `trailer/lib/run.ts`),
  the sprites (each animated GIF decoded once and swapped in frame by frame, `trailer/lib/sprites.ts`), the area
  pictures, the lab and its starter scene, the palette, the fonts, the bitmap font, the die look. New drawing: the 3D
  dice (`cube.ts`), the backdrop, the camera (`stage.ts`), the plates, the damage working and the celebration
  (`hud.ts`), each act (`trailer/acts/`).
- **`pnpm trailer`** (`scripts/trailer.ts`): starts Vite (no live reload), opens the page in Chromium, draws the frames
  in order and pipes them to ffmpeg, mixes the recorded sound to −14 LUFS into `trailer/out/pokedice-trailer.mp4`
  (git-ignored). `--stills 0,150,600` writes single frames; `--from 150 --to 540` a silent part. Showdown's sprites
  and cries are fetched once into `scripts/.cache/trailer`. `CHROMIUM_PATH` points at another Chromium. Needs ffmpeg.
- The dice are the trailer's own 3D renderer. The game is getting its own 3D dice ("Recorded throws", docs/37, on
  another branch); once that lands, the trailer can switch to it if wanted.

## 11. The user's decisions (2026-10-23)

1. **Website**: `poke-dice.netlify.app`. **Discord**: `discord.gg/XKJQYw3p9`.
2. No title over the montage; "Pokédice - Web Game Trailer" is the video's name.
3. 16:9 first. Charmeleon's opponent: Scyther. At least 70 % like the game.
4. After version 1: slower everywhere so the dice are understood, and longer is fine; a longer pause on the title;
   less jagged letters; a dark blue backdrop with soft Poké Ball patterns instead of the table; longer evolution;
   Charizard with two Flying dice, five 5s, a huge slow motion and a big celebration; Rayquaza, Mega and Gigantamax
   full screen; four bosses (Mew, Celebi, Jirachi, Shaymin) then four raids (Lugia, Groudon, Palkia, Zacian), no trade
   in the montage; slower features; the lab's balls don't open, the camera zooms on the middle one while it shakes.
