# Pokédice Visual Lab

A standalone page for deciding the game's next look, outside the app's build. The chosen direction is **Johto Daybreak with Jersey 20**; it drives every tab except the Style lab. It has four tabs:

- **Home.** The first page of the UX pass, as a working phone prototype:
  - the team roams the current area seen from the front (tap one for its level and HP)
  - area info sits on top, with CONTINUE as the one big action
  - an Areas sheet offers search by area or Pokémon, filters (To catch, Secret, Cleared) and sorting
  - widgets show the newest secret area and the Day Care
  - a game-style tab bar sits at the bottom

  Built on the real Kanto data (`assets/kanto.json`), with the mobile game references next to it.
- **Style lab.** The current game ("Kanto Parchment") and three modern pixel-art directions: Johto Daybreak, Unova Night and Paldea Pop. Each one is shown on the same three phone screens (Map, Battle, Pokémon Center), with a style sheet: palette, type, components and rules. A switch at the top changes the style; hold **C** (or the compare button) to see the current game in the same screens.
- **Animations.** Frame-timed battle effects on a 240×160 stage:
  - Pokémon Center healing
  - catching inside the battle scene
  - five typed attacks: Water, Grass, Fire, Electric, Psychic
  - a legendary encounter (Mewtwo, Articuno, Zapdos, Moltres)

  You can play them at ¼ speed, step frame by frame, jump between beats, and turn on synthesised sound.
- **Moodboards.** Five reference boards. Each has a palette, live technique tiles and linked references, both official and fan-made.

Published as a Claude artifact: https://claude.ai/artifact/EtDYmxgAmoFifQWSjtk3nD

## Run it locally

```bash
node design/visual-lab/serve.mjs   # http://localhost:4173
```

`index.html` is a page fragment (the artifact host adds `<html>/<head>/<body>`); `serve.mjs` wraps it the same way.

## Files

| File | What it holds |
|---|---|
| `pixel.js` | The engine: sprite sheets, ordered dithering, glows, particles, a 5×7 bitmap font, lightning, synthesised sound |
| `scenes.js` | Battle backgrounds per style, the Pokémon Center interior, the procedural Poké Balls (any angle, open lid, button glow) |
| `anims.js` | The eight timelines and the player (60 fixed steps a second, hit-stops, cues for the HUD) |
| `home.js` | The Home prototype: area scenery per biome, the roaming team, the Areas sheet, widgets, toasts |
| `lab.js` | Styles, the 9-slice frame generator (`makeFrame`), the mock screens, the HUD, the moodboards |
| `assets/` | Showdown's Black/White animated sprites as de-duplicated sheets (`sprites.json` = frame order and timings), menu icons (`dex-icons.png`: all 151), the game's area banners, `kanto.json` (areas, levels, wild Pokémon, unlocks from `src/data`), the current grass background |

## Porting notes

- **Frames.** `makeFrame` draws each panel and button as a 14×14 pixel map. It then scales the map by `2 × devicePixelRatio` and uses it as a `border-image`. Replacing `.pixel-panel` / `.pixel-btn` in `src/styles/pixel.css` with these frames is the core of any of the three new styles.
- **Catch in battle.** The catch timeline keeps `BattleView`'s scene and runs entirely on it: worn-out pose, throw, capture beam, drop, catch die, wobbles, then the gotcha stars or the break-free. `CatchView` would become an overlay of controls on top of the scene.
- **Effects.** Every effect follows the same house rules:
  - anticipation before the release
  - a 3–5 frame hit-stop on contact
  - two white silhouette frames on a hit, not opacity blinks
  - dithered light, never blur
  - particles that step through a fixed colour ramp
  - no screen flash faster than 3 a second

  `useBattleAnimator` already gives each hit a target, a colour and a power, so it can drive these effects.

Sprites and icons come from Pokémon Showdown, the same source the game uses and credits. Everything else is drawn in code.
