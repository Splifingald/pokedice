# 36 · The Pokédice trailer — scenario

A 20-second trailer for Pokédice, written shot by shot before anything is built. Every timecode is in seconds and in
frames at 60 fps (`f`). The scenario is the reference for the build; change it here first.

**Status (2026-10-23): scenario written, waiting for the user's go.** Nothing is built yet.

## 0. The rules of the trailer

- **About 70 % the game, 30 % trailer.** The Pokémon sprites, the dice, the Daybreak palette, the Jersey fonts, the
  stage, the plates and the move / Mega / Gigantamax / legendary / raid / trade effects come from the game
  (`src/fx/timelines`, `src/components/Die.tsx`, `docs/15-UI-GUIDELINES.md`). On top of them, the trailer adds what
  gameplay footage doesn't have: camera pushes and whip-pans, close-ups on the battle area, speed lines, impact frames,
  light leaks, a beat-synced edit and music.
- **Always the battle area.** Every shot of acts 2 and 3 is framed on the stage (the 240×160 battle scene), never on
  menus. Menus only appear in act 4, and only as quick cut-ins.
- **Minimal titles.** A handful of overlay words, the full list in §7. White Jersey 25 with the ink (`#24304f`)
  2-pixel outline, as the game draws its labels.
- **Pixels stay square.** The art is drawn at a low resolution and scaled by whole numbers only (×6 or ×9 for
  1920×1080), nearest-neighbour. Camera zooms jump between whole scales or happen in the low-res space; nothing is
  ever scaled by a fraction (blurred pixels are the one thing that would make it stop looking like the game).
- **Format.** Master: 1920×1080, 60 fps, H.264 + AAC, about 20 s. A 1080×1920 vertical cut (Shorts / TikTok /
  Discord) comes from the same shots, re-framed (§9).

## 1. The beat sheet

| # | Act | From | To | Length | What |
|---|---|---|---|---|---|
| 1 | Title | 0.00 (f0) | 2.50 (f150) | 2.5 s | Dice roll on a table and spell POKÉDICE |
| 2 | Hero journey | 2.50 (f150) | 9.00 (f540) | 6.5 s | Charmander vs Bulbasaur → Charmeleon vs Scyther → Charizard vs Mewtwo |
| 3 | Montage | 9.00 (f540) | 14.00 (f840) | 5.0 s | A grid of battle clips filling the screen |
| 4 | Features | 14.00 (f840) | 16.50 (f990) | 2.5 s | Friends, Versus, Trading, Co-op raids, Co-op Day Care |
| 5 | The choice | 16.50 (f990) | 18.50 (f1110) | 2.0 s | Oak's lab, three Poké Balls: "What's your choice?" |
| 6 | End card | 18.50 (f1110) | 20.50 (f1230) | 2.0 s | Logo, website, Discord |

Total: **20.5 s (1230 frames)**. The music is 128 BPM: a beat is 0.469 s (28.1 frames), a bar 1.875 s. Every hard
cut below sits on a beat or a half-beat.

---

## 2. Act 1 — the title (0.00 → 2.50)

**Look.** A wooden table seen from three-quarters above, drawn at 320×180 and shown ×6: warm oak planks
(`#c9925a` / `#a8703f` / `#7d4f2b` lines), a soft morning light from the top left, the Daybreak sky blue
(`#e9f0f8`) in the far corners as a vignette. The dice are real 3D cubes rendered at the low resolution (so they look
pixel-art while they turn), with the game's die look: the type colour, the 3D lip, the ink outline. Each die has a
letter on its top face instead of pips, white Jersey 25 on dark colours and ink on light ones (the game's own pip
rule, `pipColor`).

**The eight dice**, left to right, each its own type colour (`DAYBREAK_TYPES`):

| Die | P | O | K | É | D | I | C | E |
|---|---|---|---|---|---|---|---|---|
| Type | Fire | Water | Grass | Electric | Psychic | Ice | Dragon | Fairy |

The other five faces of each die show ordinary pips, so the letter only appears when the die lands.

| Time | Frames | Picture | Sound |
|---|---|---|---|
| 0.00–0.20 | f0–12 | Black. A hand-less throw: the eight dice enter from the bottom right, high and spinning, motion-smeared (two ghost frames behind each). | The game's `rattle`, thrown. |
| 0.20–1.20 | f12–72 | They hit the table and tumble right to left, bouncing twice each, staggered by 3 frames. The camera trails them with a slight pan (in low-res pixels, whole steps). Pip faces flash by. | One `land` per bounce (16 short hits, panned left/right with each die). |
| 1.20–1.60 | f72–96 | They slow down and settle in a row, each on its letter. **The misalignment**: each die rests turned −8° to +8° and up to 2 art pixels off the line, so POKÉDICE reads clearly but looks thrown, not typeset. The last die (E) wobbles once on an edge before it falls flat. | Last `land`, then a beat of silence. |
| 1.60–1.75 | f96–105 | Impact frame: the dice flash white for 2 frames, a gold ring (the combo ring, `#ffbe2e`) pulses out from under all eight at once — a full straight combo. | A gold `levelup` chord, the music's downbeat hits. |
| 1.75–2.40 | f105–144 | The camera pushes in (×6 → ×9, one jump on the beat) onto the row. Below it, small: `A dice battler` in Jersey 15 fades in (muted `#5c6a8a`). Dust particles drift in the light. | Music: the intro riff. |
| 2.40–2.50 | f144–150 | Transition: the É die (Electric) is thrown again — it lifts off the table toward the camera and fills the screen yellow → cut. | Whoosh. |

---

## 3. Act 2 — the hero journey (2.50 → 9.00)

Three fights, each a little bigger than the last. Framing: the stage close-up (×9, a 213×120 window of the 240×160
stage, the camera on the foe then sliding to your Pokémon), the plates kept on screen. **The dice are an overlay**,
not the game's panel: four to six dice, 72 px each (×9 of an 8-px die), in a row along the bottom third over a dark
gradient, thrown in from the left, rolling, stopping on their faces; the combo dice ring gold; the damage number
slams in above them (big Jersey 25, white on ink outline). Then the attack plays on the stage.

### 3.1 Charmander vs Bulbasaur — the first fight (2.50 → 4.50, 2.0 s)

| Time | Frames | Picture | Sound |
|---|---|---|---|
| 2.50–2.80 | f150–168 | Route 1 (the area's own picture under the stage). Wild Bulbasaur Lv.5 on the far platform, Charmander from the back. Its plate slides in. Camera on Bulbasaur, ×9. | Bulbasaur's cry. |
| 2.80–3.50 | f168–210 | Overlay: **three** red Fire dice thrown, they land on 4 · 4 · 2 → the two 4s ring gold (PAIR). `14` slams in. | `rattle`, three `land`, a soft gold `ding`. |
| 3.50–4.20 | f210–252 | Whip-pan to Charmander: Ember (the game's fire move timeline). Back on Bulbasaur: `contact` cue, the hit shake, "It's super effective!" flash, the HP bar drains to zero. | `super` hit. |
| 4.20–4.50 | f252–270 | Bulbasaur faints (drops out). An XP bar fills on a mini result card rising from the bottom; it flips to **Lv.16**, and Charmander glows white → cut on the white. | `faint`, `levelup`. |

### 3.2 Charmeleon vs Scyther — the climb (4.50 → 6.50, 2.0 s)

| Time | Frames | Picture | Sound |
|---|---|---|---|
| 4.50–4.75 | f270–285 | Out of the white: the evolution timeline's last frames — the silhouette pops into **Charmeleon**. Hard cut on the beat to a forest area (Viridian Forest picture) with a trainer's **Scyther** Lv.24 in front of it. The foe's plate shows the trainer's party as red squares. | Charmeleon's cry. |
| 4.75–5.10 | f285–306 | Scyther strikes first: a slash crosses the screen, Charmeleon's HP drops to yellow. Quick, the camera shakes. | Hit. |
| 5.10–5.80 | f306–348 | Overlay: **four** dice — three Fire and one Normal. First throw: 6 · 2 · 6 · 3. Two dice lift with the red outline (picked), **REROLL**: they tumble again → 6 · 6 · 6 · 3 → the three 6s ring gold (**THREE OF A KIND**). `38` slams in, bigger than before. | `rattle` × 2, the gold chord a third higher. |
| 5.80–6.50 | f348–390 | Flamethrower: the fire timeline, but framed ×9 so the stream crosses the whole screen. Scyther takes it, flashes, faints. On its fall, a badge (Boulder) spins in a corner for 6 frames — the "you're progressing" beat — then the screen burns orange from the bottom → cut. | `super`, `faint`, a short cheer sting. |

### 3.3 Charizard vs Mewtwo — the showdown (6.50 → 9.00, 2.5 s)

| Time | Frames | Picture | Sound |
|---|---|---|---|
| 6.50–7.20 | f390–432 | The legendary entrance timeline, cut to its best 0.7 s: the dark pulses, darkness with heartbeats, **Mewtwo's** silhouette rising in its purple aura (legend.ts gives Mewtwo its own aura), light rays, the reveal flash. Name card `MEWTWO Lv.70` slams in. Cerulean Cave stage. | Heartbeat ×2, Mewtwo's cry, the quake. |
| 7.20–7.45 | f432–447 | Reverse shot: **Charizard** (back sprite) on its platform, the camera low, wings filling the frame. Its plate: Lv.68, HP full. | Charizard's cry. |
| 7.45–8.30 | f447–498 | Overlay: **five** dice, the biggest throw yet (they come in faster, with motion smears). They land 5 · 5 · 5 · 5 · 2 → reroll the 2 → **5** → five of a kind, the five dice ring gold and the whole overlay flashes: the top combo, shown as the game's chip (`FIVE OF A KIND`). `126` slams in, then shakes. Slow-motion on the last die (it rolls at ¼ speed for 10 frames, on the edge between 2 and 5). | The music drops out under the slow die — one heartbeat — then hits again when it lands. |
| 8.30–9.00 | f498–540 | Fire Blast: the fire timeline at full motion, then trailer extras on top: a full-screen white impact frame (2 frames), an ink-on-white freeze of the two silhouettes (4 frames, manga-style), back to colour with Mewtwo's HP bar emptying. Smash cut to black on the beat. | The biggest hit in the mix, cut to silence for one half-beat. |

---

## 4. Act 3 — the montage (9.00 → 14.00)

**One idea**: the screen fills with battles. It starts with one clip full screen and splits on every beat until
eight battle stages play at once in a 4×2 grid — all of them framed on the battle area, each with a thin ink border
and the type colour of its star as a 2-px inner rim. No titles over the clips; one word over the whole grid at the end.

**The eight clips** (each is the game's own timeline, cut to its most striking second, re-framed close):

| Clip | What it shows | From the game | Rim |
|---|---|---|---|
| A | **Mew boss** — the mythical's lair: Mew's legendary entrance, pink aura, the silhouette rising | `legend.ts` | Psychic |
| B | **Lugia** — its raid: Lugia over a stormy sea stage, wind and Aeroblast | the raid intro + `legend.ts` | Flying |
| C | **Celebi** — its lair in the forest: green aura, leaves spiralling, the gleam | `legend.ts` | Grass |
| D | **Groudon** — its raid: the ground cracks, lava light, the quake shake | the raid intro + `legend.ts` | Ground |
| E | **Mega Evolution** — Charizard → **Mega Charizard X** (blue flames, black skin): the keystone flash, the DNA shell, the burst | `forms.ts` `megaTimeline` | Dragon |
| F | **Gigantamax** — **Gengar** → G-Max Gengar: the red clouds, the body growing past the frame | `forms.ts` `gmaxTimeline` | Ghost |
| G | **Rayquaza raid intro** — the alarm, hazard tapes, the storm with lightning, the green silhouette with its glowing outline, the pillar of light, `RAYQUAZA` slamming down as the HP bars fill | `RaidIntro.tsx` | Dragon |
| H | **Trading** — the two balls braiding along the cable of light and crossing in the middle with a flash | `trade.ts` | Gold |

| Time | Frames | Grid | Notes |
|---|---|---|---|
| 9.00–9.94 | f540–596 | **1 tile**: G, the Rayquaza raid intro, full screen. | Two beats. The siren and the storm open the act. |
| 9.94–10.88 | f596–653 | **2 tiles** (side by side): G keeps playing left, E (Mega) slides in right. | Split on the beat with a vertical white wipe. |
| 10.88–11.81 | f653–709 | **4 tiles** (2×2): G, E, F (Gigantamax), D (Groudon). | Each tile shows the stage at ×4 (960×640, cropped to 960×540). |
| 11.81–13.50 | f709–810 | **8 tiles** (4×2): every clip, each starting on its own half-beat, left to right, top to bottom, so the grid fills like a dice tray. | Each tile shows the stage at ×2 (480×320, cropped to 480×270). |
| 13.50–14.00 | f810–840 | The 8 tiles flash gold one after another (like the combo ring running along the dice), then all at once. Over the grid, centred: **`1025 POKÉMON · 9 REGIONS`**. Then the grid collapses into the centre tile → cut. | The music's build peaks. |

## 5. Act 4 — the features (14.00 → 16.50)

Five cut-ins of 0.5 s each (exactly a beat and a little: 30 frames), hard cuts, each a single strong picture with one
word on it. They are the only shots that aren't the battle stage, but each still shows Pokémon first, UI second
(the screens are cropped tight, never a whole page).

| Time | Frames | Feature | Picture | Word |
|---|---|---|---|---|
| 14.00–14.50 | f840–870 | **Friend list** | Three friends' trainer cards slide in on top of each other (their trainer sprites, golden names, their lead Pokémon's menu icons), a friend ID chip, the "Add friend" button pressed. | `FRIENDS` |
| 14.50–15.00 | f870–900 | **Versus** | The Versus background (`public/backgrounds/versus.png`), two trainers face to face, a `VS` slam between them, a split second of the auto-battle with dice on both sides. | `VERSUS` |
| 15.00–15.50 | f900–930 | **Trading** | The last act of the trade: the ball comes down the beam onto your pad, wobbles, opens on the newcomer with sparkles. | `TRADE` |
| 15.50–16.00 | f930–960 | **Co-op raids** | A raid stage with the raid Pokémon in the back and **three** allies in front (you and two friends), the three trainers' faces cutting in like in the raid intro, everyone's dice rolling at once. | `RAID TOGETHER` |
| 16.00–16.50 | f960–990 | **Co-op Day Care** | The Day Care yard: your Pokémon and a friend's guest Pokémon (with the friend tag) walking together, a heart pops, an Egg appears between them and wobbles. | `DAY CARE` |

The five words stack in the same place (bottom left, Jersey 25, white on ink), each replaced by the next, so the
eye stays put.

## 6. Act 5 — the choice (16.50 → 18.50)

The lab from the partner moment (`PartnerMoment`, docs/15 §18): the lab picture (`moment-lab.png`), Oak's table,
the three Poké Balls.

| Time | Frames | Picture | Sound |
|---|---|---|---|
| 16.50–17.10 | f990–1026 | Cut to the lab. The three balls drop onto their cradles one after another (`starter.drop`, `starter.land`) — in the trailer faster: 8 frames apart. | Three `land`s. The music drops to the intro riff, quieter. |
| 17.10–17.70 | f1026–1062 | The camera pushes in on the table. Above each ball, a quick ghost of its Pokémon: **Bulbasaur**, **Charmander**, **Squirtle** flash out of their balls for 6 frames each, left to right, and back in. | Three cries, short. |
| 17.70–18.50 | f1062–1110 | **Freeze.** The three balls on the table, the game's message box at the bottom with its arrow blinking: **`What's your choice?`** (the trailer's line, in the game's dialogue font and frame). Hold. | Silence but a soft room tone, and the dialogue `blip`s while the text types. |

## 7. Act 6 — the end card (18.50 → 20.50)

| Time | Frames | Picture | Sound |
|---|---|---|---|
| 18.50–18.80 | f1110–1128 | The message box slides away; the lab dims to ink (`#24304f`) with the 8-px dot texture of the parchment. The eight POKÉDICE dice from act 1 drop back in a row in the middle, already on their letters, slightly crooked as before. | The eight `land`s in a roll, then the logo chord. |
| 18.80–20.50 | f1128–1230 | The end card, still: | The music's last chord rings out. |

The end card, top to bottom, centred:

1. The **POKÉDICE dice row** (the logo), with the gold combo ring under it pulsing slowly (once a second).
2. `PLAY FREE IN YOUR BROWSER` — Jersey 15, gold (`#ffbe2e`).
3. The website: **`{SITE_URL}`** — Jersey 25, white, big. *(To fill: the live Netlify address — it isn't in the repo.)*
4. The Discord: a pixel Discord icon + **`discord.gg/XKJQYw3p9`** (the invite in docs/23).
5. Bottom, small, muted: `Fan-made · non-commercial. Pokémon © Nintendo / Game Freak / Creatures.`

**All the overlay words of the trailer** (besides the logo and the end card): `A dice battler`, `14`, `38`, `126`
(the damage numbers, as the game shows them), `FIVE OF A KIND`, `1025 POKÉMON · 9 REGIONS`, the five feature words,
`What's your choice?`. Nothing else.

## 8. Sound

- **Music**: an original chiptune at 128 BPM, synthesised like the game's sound effects (square + triangle + noise
  channels), so nothing is borrowed. Shape: intro riff (act 1) → driving beat (act 2) with a stop under the slow
  die → a 16-bar-feel build over the montage (act 3) → the same riff, one octave up, under the features (act 4) →
  drops to the riff alone in the lab (act 5) → final chord (act 6).
- **Sound effects**: the game's own (`src/audio/sfx.ts`: `rattle`, `land`, `hit`, `super`, `faint`, `levelup`,
  `catch`, `gold`…), rendered offline. **Cries**: the Pokémon cries the game loads from Showdown's audio server.
- **Mix**: music −14 LUFS overall, effects on top, the dice always audible (they are the game's identity).

## 9. The vertical cut (1080×1920)

Same shots and timing. The stage close-ups are re-framed (×9, a 120×213 window following the active Pokémon); the dice
overlay moves to the bottom quarter; the act 3 grid becomes 1 → 2 (stacked) → 4 (2×2) → 8 (2×4); the end card stacks
as is.

## 10. How it's made (for the build)

- **A trailer page** rendered frame by frame, outside the game's routes (a separate dev-only Vite entry,
  `trailer/index.html`, so nothing ships to players and no admin switch is needed). It reuses the game's code
  directly: the fx timelines (their 60 fixed steps a second make every frame deterministic), the sprite loader, the
  palette, the fonts, the Die look. Act 1's dice are the only new 3D: a small cube renderer drawing to the 320×180
  canvas.
- **One clock**: the page draws frame `n` on request (`window.renderFrame(n)`), never in real time.
- **Capture**: Playwright opens the page and screenshots every frame (1230 PNGs), the sound is rendered offline
  (`OfflineAudioContext`) to a WAV with the same timeline, then `ffmpeg` joins them into `pokedice-trailer.mp4`
  (and the vertical one).
- **Sprites**: the game loads its animated Pokémon from Showdown's sprite server; the capture needs that server
  reachable (or the sprites cached beforehand).

## 11. To decide before the build

1. **The website address** for the end card (`{SITE_URL}`).
2. **The montage title**: `1025 POKÉMON · 9 REGIONS` (every region, Kanto to Paldea), or `151 POKÉMON` to keep the
   trailer on Kanto.
3. **Format**: 16:9 master + 9:16 cut (proposed), or only one of them.
4. Charmeleon's fight: **Scyther** (proposed, a trainer's) — or another Pokémon you prefer.
