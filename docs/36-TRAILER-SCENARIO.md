# 36 · The Pokédice trailer

A trailer for Pokédice, written shot by shot first, then built from the game's own code (`trailer/`, `pnpm trailer`).
Every timecode is in seconds from the start (frames at 60 fps: `f` = s × 60). This file is the reference for the
build; change it here first.

**Status (2026-10-23): version 3 built** on `claude/pokedice-trailer-video-5jq0o9`, **60 s**. The video's name:
**Pokédice - Web Game Trailer** (never shown on screen).

Version 1 (22 s) went by too fast to understand, the user said. Version 2 follows their notes (§11): a longer pause on
the title, cleaner letters on the dice and a dark backdrop instead of the table; every roll worked out on screen and
held; the whole evolution; Charizard's five dice with two Flying ones, a long slow motion and a celebration; Rayquaza,
the Mega Evolution and the Gigantamax each full screen; four bosses together, then four raids together, no trade
there; slower features; in the lab, the balls stay shut and the camera closes in on the middle one while it shakes.

Version 3, the user's next notes: no damage formula on screen; Charmander rolls two dice, 3 + 4 = 7, easy to add up
without one; Charmeleon three dice with a pair; MYTHICAL BOSSES; the end card 2 s longer with MOBILE FRIENDLY and
DISCORD COMMUNITY instead of the Discord link, and a better Discord mark; every pixel image clear (§0).

## 0. The rules of the trailer

- **About 70 % the game, 30 % trailer.** The Pokémon sprites, the dice, the Daybreak palette, the Jersey fonts, the
  area pictures, the stage and the move / evolution / Mega / Gigantamax / legendary / raid / trade / starter effects
  are the game's (`src/fx/timelines`, `src/components/Die.tsx`, `docs/15-UI-GUIDELINES.md`). On top of them: camera
  moves, close-ups on the battle area, the dice as an overlay, the damage worked out on screen, speed lines, impact
  frames, an ink freeze, confetti, music.
- **It explains, without a formula.** Every roll shows each die's value, the combo's chip when there is one, and the
  damage, big. The numbers stay simple enough to add up at a glance: 3 + 4 = 7; 5 + 5 + 2 and a pair = 14; five 5s and
  a maxed Five of a Kind (+70, `upgrades.json` level 10) = 95. To keep them that simple, the first two fights leave out
  the type chart's ×2 (Fire on Grass, Fire on Bug); the third is neutral anyway. The captions are the game's own
  battle lines (`strings.csv`).
- **Always the battle area** in the fights and the big moments; menus only in the features, as cut-ins.
- **A still camera** (after version 3, the user: too many camera moves). The title and every fight are one fixed
  shot; Charizard's close-up is a cut, not a move; hits shake the screen lightly. The only camera moves left are the
  ones asked for: the slow-motion push onto Charizard's last die, and the lab's zoom onto the shaking ball.
- **Clear pixels.** The art is drawn small and scaled up nearest-neighbour at whole scales: the stage at ×8 to ×10,
  the title and the end card at ×3 (640×360), the dice overlay at ×4. Anything at a fractional scale — the area
  pictures (400 px for 288 scene pixels), the lab, the Versus stadium, a camera zooming — goes through sharp scaling
  (`sharpDraw`: a whole-number nearest-neighbour blow-up, then a smooth last fraction), so no pixel comes out wider
  than its neighbours. Big Pokémon, which the game shrinks to 80 art pixels by dropping rows, are shrunk smoothly
  with hard edges instead; the raid openings use the sprites at their own size, at ×1 or ×2.
- **Format.** 1920×1080, 60 fps, H.264 + AAC at −14 LUFS. 16:9 first; a vertical cut may come later.

## 1. The beat sheet

| # | Part | From | To | What |
|---|---|---|---|---|
| 1 | Title | 0 | 4 | Dice roll and spell POKÉDICE, long hold |
| 2 | Fight 1 | 4 | 9 | Charmander vs Bulbasaur: two dice, 3 + 4 = 7 |
| 3 | Evolution | 9 | 12 | Charmander → Charmeleon, the whole morph |
| 4 | Fight 2 | 12 | 17 | Charmeleon vs Scyther: three dice, a pair, 14 |
| 5 | Fight 3 | 17 | 26.5 | Mewtwo's entrance; Charizard's five 5s in slow motion, a celebration, 95 |
| 6 | Rayquaza | 26.5 | 31 | Its raid opening, full screen |
| 7 | Mega Evolution | 31 | 34 | Charizard → Mega Charizard X, full screen |
| 8 | Gigantamax | 34 | 37 | Gengar → G-Max Gengar, full screen |
| 9 | Bosses | 37 | 40.5 | Mew, Celebi, Jirachi, Shaymin, together: MYTHICAL BOSSES |
| 10 | Raids | 40.5 | 44 | Lugia, Groudon, Palkia, Zacian, together |
| 11 | Features | 44 | 50 | Friends, Versus, Trading, Co-op raids, Co-op Day Care, 1.2 s each |
| 12 | The choice | 50 | 54.5 | Oak's lab: the balls drop, the middle one shakes, "What's your choice?" |
| 13 | End card | 54.5 | 60 | The dice logo, website, MOBILE FRIENDLY, DISCORD COMMUNITY |

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

## 3. The fights (4 → 26.5)

The stage at ×8–×10 on the area's picture. The plates: the foe's top left, yours bottom right. The dice are an
overlay over a dark band at the bottom: thrown in from the left, rolling, stopping on their faces; each die's value
pops up over it; picked dice lift with the red ring and are thrown again; the combo's dice ring gold and its chip
appears; the damage slams in above them. No formula.

### Fight 1, Charmander vs a wild Bulbasaur (4 → 9)

| Time | Picture | Sound |
|---|---|---|
| 4 | Route 1; the plates slide in; `What will Charmander do?` | Bulbasaur's cry. |
| 4.7–5.2 | Two Fire dice land 3 · 4; the values pop up. | `rattle`, `land`s. |
| 5.65 | `7` slams in. Held to 6.8. | |
| 6.8–7.7 | Flamethrower, `-7`, Bulbasaur faints. | `super`, `faint`. |
| 8–9 | `Charmander grew to Lv.16!`; it glows white and the white takes the screen. | `levelup`. |

### The evolution (9 → 12)

The game's evolution, nearly whole (1.9× its speed): the light gathers, the silhouette morphs, the burst, Charmeleon
standing in its light. `What? Charmander is evolving!`, then `Charmander evolved into Charmeleon!` and its cry.

### Fight 2, Charmeleon vs a trainer's Scyther (12 → 17)

| Time | Picture | Sound |
|---|---|---|
| 12–12.9 | Viridian Forest. Scyther (a party of 3) strikes first. | Scyther's cry, a hit. |
| 13–13.55 | Two Fire dice and a Normal one land 5 · 5 · 2; the values pop up. | `rattle`. |
| 13.95 | The two 5s ring gold, the `PAIR` chip. | `gold`. |
| 14.35 | `14` slams in. Held to 15.4. | |
| 15.4–16.75 | Flamethrower, `-14`, Scyther faints, the Boulder Badge spins in; the screen burns from the bottom. | `super`, `faint`, `gold`. |

### Fight 3, Charizard vs Mewtwo (17 → 26.5)

| Time | Picture | Sound |
|---|---|---|
| 17–18.8 | Cerulean Cave: Mewtwo's legendary entrance, its name card. | Heartbeats, its cry. |
| 18.8–19.5 | Low and close on Charizard. | Its cry. |
| 19.6–20.3 | Five dice, **three Fire and two Flying**, land 5 · 5 · 5 · 5 · 2. | |
| 20.7–21.4 | `Tap dice to throw them again.` The 2 (a Flying die) lifts and is thrown again. | |
| 21.55–23.92 | **The slow motion**: the camera closes in on that die as it turns at a twelfth of its speed, the stage dark and pulsing with a heartbeat. | The music stops: a heartbeat, a long riser. |
| 23.92 | It lands on 5: five 5s. The dice flash white and ring gold, gold rays turn behind them, confetti bursts, the dice hop, **FIVE OF A KIND!** slams in huge. | A fanfare in D major. |
| 24.82 | `95` slams in under it. | |
| 25.6–26.5 | Flamethrower; on the hit a white impact frame, then the two as ink silhouettes on white, then colour as Mewtwo's HP empties; cut to black. | The biggest hit. |

## 4. The big moments (26.5 → 44)

| Time | Picture |
|---|---|
| 26.5–31 | **Rayquaza's raid opening**, full screen (`RaidIntro.tsx`, redrawn landscape in `trailer/lib/raidIntro.ts`): the alarm and its hazard tapes, the storm and lightning, the silhouette rising, the pillar of light, the reveal, `RAID BATTLE / RAYQUAZA` and its five HP bars filling. |
| 31–34 | **Mega Evolution**, full screen, on the Indigo Plateau: Charizard → Mega Charizard X. `Charizard Mega Evolved into Mega Charizard X!` |
| 34–37 | **Gigantamax**, full screen, in Pokémon Tower: Gengar → G-Max Gengar. `Gengar Gigantamaxed!` |
| 37–40.5 | **Four mythical bosses** in a 2×2 grid, their entrances a beat apart: Mew (Faraway Island), Celebi (Ilex Forest), Jirachi (a summit), Shaymin (a flower field). A `MYTHICAL BOSSES` chip where the tiles meet. |
| 40.5–44 | **Four raids** in a 2×2 grid, each one's raid opening: Lugia, Groudon, Palkia, Zacian. A `RAIDS WITH FRIENDS` chip. White takes the screen at the end. |

Each tile has a 12-px ink border and its star's type colour as a rim; each part opens on a white frame.

## 5. The features (44 → 50)

Five cut-ins of 1.2 s. The word slams in bottom left (Jersey 25, white, ink outline, a gold bar under it).

| Time | Picture | Word |
|---|---|---|
| 44 | Three friends' cards slide in: trainer sprite, name (the first golden), friend ID, their Pokémon, the online dot. | `FRIENDS` |
| 45.2 | The Versus stadium: Red and Green slide in, `VS` slams in, each side's dice hop onto the field. | `VERSUS` |
| 46.4 | The trade's arrival: the ball comes down the beam, bounces, opens on Alakazam. | `TRADING` |
| 47.6 | A sea cave: Kyogre with five HP bars, Charizard, Blastoise and Venusaur, three trainers' cards, three dice landing over each ally, the last bar draining. | `CO-OP RAIDS` |
| 48.8 | The Day Care yard: Ditto and a friend's Dragonite (its `FRIEND'S` tag) hop toward each other, a heart, an Egg pops up and wobbles. | `CO-OP DAY CARE` |

## 6. The choice (50 → 54.5)

| Time | Picture | Sound |
|---|---|---|
| 50–51.2 | Oak's lab (`StarterScene` on the lab picture): the three Poké Balls drop onto their cradles. They stay shut. | The game's drop and land sounds. |
| 51.3–53 | The camera closes in on the middle ball (×8 → ×17) while it shakes in bursts, like one about to open. | A rattle per shake, a quiet arpeggio. |
| 52.7–54.5 | The game's dialogue box: `What's your choice?` types in, its ▼ blinks. | A blip per letter, the music hangs on its A chord. |

## 7. End card (54.5 → 60)

The title's navy backdrop. The POKÉDICE dice drop into their crooked row, ring gold, a gold ring pulses under them;
`PLAY FREE IN YOUR BROWSER`, `poke-dice.netlify.app`, then two badges side by side — a pixel phone and **MOBILE
FRIENDLY**, Discord's mark (redrawn in pixels: its blurple badge and white face) and **DISCORD COMMUNITY** — and the
fan-made line. No Discord link. Fade to black at 59.7–60. The last chord in D major, then a slow arpeggio, ring out.

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
5. After version 2: no damage formula; Charmander two dice, 3 + 4 = 7; Charmeleon three dice with a pair; Charizard
   as is, without the formula; MYTHICAL BOSSES; the end card 2 s longer, MOBILE FRIENDLY and DISCORD COMMUNITY instead
   of the Discord link, a better Discord logo; every pixel image clear, whatever the zoom or the aspect ratio.
