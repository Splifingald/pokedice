# Pokédice Visual Lab

A standalone page for deciding the game's next look, outside the app's build. The chosen direction is **Johto Daybreak with Jersey 20**; it drives every tab except the Style lab. It has four tabs:

- **Home.** The first page of the UX pass, as a working phone prototype:
  - the team of three roams the current area seen from the front: friends visit each other, hearts and notes float up, Lapras starts a song the others join (tap one for a hop, a heart and its level and HP)
  - the area plate on top opens the area's details: gym, legendary, one-time finds still there, Pokémon to catch with rarity and levels, the round mix
  - CONTINUE is the one big action
  - an Areas sheet offers search by area or Pokémon, filters (To catch, Secret, Cleared), sorting and a region switcher; a card opens its details, GO travels, the outline gives the state; the Areas button turns gold when a new region opens
  - entering a new region starts the partner pick: in the professor's lab, three Poké Balls drop onto the table, a tap opens one, and the question comes with the Pokémon's type, matchups and dice (`starter.js`)
  - each area has one picture: the scene the team roams on Home, cropped to its middle in lists
  - widgets, two by two: the newest secret area and the Day Care (gold with a shaking Egg when one waits), then Versus (locked until three Pokémon reach Lv.50) and a slot for special events
  - a game-style tab bar sits at the bottom

  - the tab bar works: **Team** (drag to reorder, the Box with search, sort and type filter, a sheet per Pokémon with its dice faces and what it learns next), **Pokédex** (silhouettes, search, All / Caught / Missing / Nearby, where to find with GO), **Poké Mart** (buy and sell by category, quantities, locked stock) and **Upgrades** (combos and dice, pip tracks, an affordable filter)
  - the screens off Home work too:
    - **Battle**, from CONTINUE: a wild Pokémon from the area, full screen. The dice roll by themselves; you tap the ones to throw again, then ATTACK. The readout under the tray shows the combo, the sum, the type multiplier and the status faces, with the engine's rules. The move plays the Animations tab's timeline, and the foe rolls its own dice. Other parts: the bag (one item a turn), switching, burn and poison ticks, a free switch after a K.O., and the catch with the ball picker and chances, then XP.
    - **Day Care**, from its widget: one for every region, open from 20 Pokémon caught. The yard sits on top like Home's, with everyone there roaming. Below it are two slots for your Pokémon, which gain XP up to Lv.100 (the only cap). You can take one back, or leave one from the team or the Box (with search). Four more slots hold friends' Pokémon, invited from their Day Cares; nothing changes for the friend. Pairs follow the real Egg groups, and the pickers tag "Compatible with …" with coloured hearts. Ditto pairs with everyone but legendaries, on a slower check. Every 12 h (Ditto: 24 h) a compatible pair leaves an Egg, and **Egg now** skips the wait for ₽200. It hatches with the Animations tab's timeline into a species weighted toward the ones you're missing, shiny 1 time in 100. The preview bar has buttons to run either check. The integration plan is `docs/15-DAYCARE-BREEDING.md`.
    - **Versus**, from its widget: locked until three Pokémon reach Lv.50 (with who's closest). It has three tabs: My team (three Lv.50 clones, in order), Opponents (search, To beat / Beaten, how many of theirs you hit super effectively, FIGHT) and the Attack / Defense board. A fight plays on its own on the battle stage: the trainer sends out three in turn, and SKIP jumps to the result.
    - **Leaderboard**, from the cup: Max level, Progression, Pokédex, Shiny. It shows your rank on top (tap it to find your row), and a Hall of Fame for trainers who maxed a board out.
    - **Special events**, from their Home widgets (one square per open event, in priority order: the raid of the day with its timer and tries, the next Elite Four member to fight, a carousel of wheel prizes): the Fortune Wheel (one free spin a day, equal slices, odds behind the Info button), Raid Battles (your three plus two friends' or NPC teams against a Lv.50 raid Pokémon with HP bars and up to two summons, then the catch), legendary raids in their own areas once cleared (a region-only team left on each raid, friends bring theirs; the plan is `docs/24-PROGRESSION-RAIDS-PLAN.md`), the four-trainer NPC picker on START and the Elite Rebattle (three gauntlet tiers). Each opens with a pop-up the first time. A second preview bar picks which events are open, today's raid, and replays the pop-ups; an admin mock beside the phone edits the same numbers. The plan is `docs/18-SPECIAL-EVENTS-PLAN.md`; the mockup is also published on its own: https://claude.ai/artifact/YQBKNUaEzpGaUojcga8cfA
    - **Live events** (event type 4, priority 2): one at a time, the same for everyone, scheduled in the admin. A Home square first among the events (the admin's picture, LIVE and the type's tag, the title, the time left and a gauge; or a wide banner over the squares), a pop-up once per event (OK, or Go to the shop), and the event where it applies: a Shiny Parade's ×5 chip on the area plate and cards, a Special Shop section at the top of the Mart (sale prices struck out, items the Mart never sells, stock per trainer, its timer), Cash Flow's +50 % on the purse and on a victory's ₽. A third preview bar picks the event, how far into it you are and the square's size; the admin mock lists the events and edits them (dates in UTC, overlap refused). The plan is `docs/20-LIVE-EVENTS-PLAN.md`.
    - **Small worlds** (event type 5, priority 1): a time-limited themed region where the shiny mythicals are won. Its square first on Home (the picture in the world's accent ring, the mythical's silhouette, areas cleared, the time left), its pop-up (XP ×5, dice by level, the booster types, the shiny mythical), the partner pick among three, Home inside the world in its colours (a banner strip with the time left and Back to Kanto, the area's picture, the booster chips, the world's own ₽, the mythical and World Mart squares), the world's areas (one opening on a date), a battle with dice by level and a booster chip, the World Mart, Upgrades explaining dice by level, the final fight and its catch, the world closing. A fourth preview bar goes outside or inside and picks how far in; the admin mock edits the world (switch Off / On for admin / On for everyone, colours, starters, boosters, the mythical, area dates). The plan is `docs/21-SMALL-WORLDS-PLAN.md`.
    - **Trades**, from the trainer card's menu (Friends and Trades rows, new to the lab): like the games' GTS, put a Pokémon up, say what you want for it (a species, any I don't own, anything), and anyone allowed takes it while you're away. The board (search, All / Friends / New for me / I can trade, Tradable first / Ending soon / Newest, rows greyed with the reason), your four slots with Share and Cancel and the trades done, a listing's sheet (the level rule with the species' minimum and why), the picker (You get Kadabra Lv.30, NEW, STRONGER, → Alakazam, nothing gained), the confirm, the trade scene and a trade evolution, New listing in three steps (your Pokémon, a species grid with Not owned / Owned / All, who sees it), share links, a friend's card with Their trades, Trade on a Pokémon's sheet beside Send on. A fifth preview bar signs in or out, starts Johto, fills the daily cap and plays a listing taken while away, one running out, the shared links; the admin mock edits the switch, the numbers and the trade-evolution list, and removes listings. The plan is `docs/23-TRADING-PLAN.md`.
    - **Trainer card**, from the avatar: your look (the game's trainer sprites), name, money, Pokédex, best level, areas, shinies, Versus record, the badge case with the crown, and the menu.

  A switch above the phone previews three saves: Mid-game, Versus opens, League beaten. Built on the real Kanto data (`assets/kanto.json`), with the mobile game references next to it.
- **Style lab.** The current game ("Kanto Parchment") and three modern pixel-art directions: Johto Daybreak, Unova Night and Paldea Pop. Each one is shown on the same three phone screens (Map, Battle, Pokémon Center), with a style sheet: palette, type, components and rules. A switch at the top changes the style; hold **C** (or the compare button) to see the current game in the same screens.
- **Animations.** Frame-timed battle effects on a 240×160 stage:
  - Pokémon Center healing
  - catching inside the battle scene
  - five typed attacks: Water, Grass, Fire, Electric, Psychic
  - a legendary encounter (Mewtwo, Articuno, Zapdos, Moltres)
  - an evolution (Charmeleon → Charizard at Lv.36, Eevee → Jolteon with a Thunder Stone)
  - an Egg hatching (the Gen 5 Egg, into Dratini or Eevee)
  - a Mega Evolution on the battle stage (Charizard into Mega Charizard X or Y): the Key Stone and the Mega Stone linked by two strands of light, a sphere in the seven colours, the change inside, the burst and the Mega symbol; +1 die of the type it gains, until the battle ends
  - the partner pick (Johto when a region opens, Kanto for a new game): in the professor's lab: a welcome ribbon, three Poké Balls dropping onto their cradles one after another, the choice, the yes, the other two flying home
  - a Gigantamax (Pikachu or Lapras): recalled into the ball, Dynamax energy swelling it, thrown up behind the field under a crimson sky, a giant red silhouette rising in steps, then the G-Max form with its cloud crown; +1 die of its first type for its next turn
  - a trade (Pikachu for Totodile across regions, a shiny Eevee arriving, Kadabra arriving): yours turns red and goes into its ball, the ball shoots up a link of light, the other comes down it, wobbles and opens on the newcomer, "Take good care of…"; the Evolution list has Kadabra → Alakazam, the trade evolution that follows

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
| `anims.js` | The timelines (Center, catch, five attacks, legendary, evolution, hatching, Mega Evolution, Gigantamax) and the player (60 fixed steps a second, hit-stops, cues for the HUD) |
| `home.js` | The Home prototype: area scenery per biome, the team and how they get along, the area details, the Areas sheet with the region switcher, widgets, toasts, the three preview saves |
| `pages.js` | The tabs behind Home: Team, Pokédex, Poké Mart, Upgrades, and the shared Pokémon sheet |
| `battle.js` | The playable battle: the engine's damage, combo, type and status rules, the dice tray, the catch, and Versus on auto |
| `daycare.js` | The Day Care: the yard, your two and four friends' slots, Egg-group compatibility (Ditto slower), the checks, the hatching moment |
| `starter.js` | The partner pick when a region opens: drives the Animations tab's starter scene from taps and keys, the question with type, matchups and dice |
| `social.js` | Versus (team, opponents, board), the leaderboard with its Hall of Fame, the trainer card with the badge case and looks |
| `events.js` | Special events (docs/18): the Home event stack, the Events page (Fortune Wheel, Raid Battles with a playable 3-sides raid, Elite Rebattle gauntlet), unlock pop-ups, the helper gift, and the admin mock beside the phone. Sprites and backgrounds in `assets/ev/` |
| `raids.css` | Legendary raids (docs/24): Keep exploring under CONTINUE, the raid's button in the area details, the Raids page's list by region, a legendary raid's page, the four-trainer NPC picker. The logic is in `events.js` and `home.js` |
| `worlds.js` | Small worlds (docs/21): the square and pop-up, the partner pick, the world's themed Home, its areas, a battle, the World Mart, the final fight, the closing, the preview bar and the admin mock |
| `trades.js` | Trades (docs/23): the rules of the plan's §6 on the lab's data, the Trades page (board, your listings, done), a listing's sheet, the picker and confirm, the trade scene with a trade evolution, New listing, sharing, friends' cards, the pop-up when a listing was taken, the preview bar and the admin mock |
| `live.js` | Live events (docs/20): the Home square, the pop-up, the Mart's Special section, the Shiny Parade and Cash Flow chips, a Cash Flow victory, the preview bar and the admin mock |
| `lab.js` | Styles, the 9-slice frame generator (`makeFrame`), the mock screens, the HUD, the moodboards |
| `assets/` | Showdown's Black/White animated sprites as de-duplicated sheets (`sprites.json` = frame order and timings; Kadabra, Wartortle, Pidgey and Magikarp added for Trades), menu icons (`dex-icons.png`: #1 to #251), item icons (`items.png`), trainer looks (`trainers.png`: Red, Leaf and 22 trainer classes, 80×80, from `public/`), `game.json` (from `src/data`: species dice, stats, milestones and evolutions, shop items, upgrade tracks, die faces), `kanto.json` (from `src/data`: areas with levels, wild Pokémon and their odds, gyms, legendaries, one-time and common finds, the round mix, unlocks; regions with their starters), the current grass background |

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

Pokémon sprites and icons come from Pokémon Showdown, and the trainer sprites are the ones in the game's `public/` folder; both are what the game already uses and credits. Everything else is drawn in code.
