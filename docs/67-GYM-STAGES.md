# Gym stages: one battle background per gym type

> **Your part:** nothing to set up. No SQL, no switch: it shows in every gym battle once it's live.

The user's ask (2026-11-06): *"I want a special background for each gym type"*, made in Gemini from the prompts on
the Gym Battle Backdrops page, then *"run them through the image process to make them smaller (400px wide) and then
use them for all the gym battles of the corresponding type"*.

It changes only what a gym battle looks like, nothing players can do: no switch and no rules card (docs/15 §20), as
for the live-event pictures.

## 1. The pictures

- 18 files, `public/area-art/gym-<type>.png` (`gym-fire.png`…), one per type, **400 × 268** true pixel art, 14–32 KB
  each, about 420 KB for all 18. A player downloads one at a time, the first time a gym of that type is fought.
- **Made with**: Gemini, 3:2, from the prompts (the Daybreak style block of `design/visual-lab/bgs.js`, a scene per
  type, the battle zones' layout), saved as JPG 2000 × 1342, turned into PNGs, then
  `pnpm unpixel <folder> <out> --px 5 --size 400x268`. Gemini drew each one on its own grid (cells of 4 to 8 px), so
  `--size` alone would crop or pad; `--px 5` reads every picture on the same 400-wide grid.
- **Composed for the stage**: the horizon (the foot of the back wall) halfway down, the gym's centrepiece above it,
  open floor where the game draws the opponent's oval (right, just below the horizon) and the player's (bottom left),
  pillars and tall things at the outer edges.

| Type | Gym | Type | Gym |
|---|---|---|---|
| Normal | The Grand Hall | Flying | Sky Spire |
| Fire | Caldera Forge | Psychic | Astral Sanctum |
| Water | Tidal Cathedral | Bug | Amber Hollow |
| Electric | Dynamo Tower | Rock | Monolith Quarry |
| Grass | Canopy Conservatory | Ghost | Moonlit Mausoleum |
| Ice | Glacier Throne | Dragon | Stormcrown Citadel |
| Fighting | Summit Dojo | Dark | Eclipse Court |
| Poison | Miasma Gardens | Steel | Gearwork Vault |
| Ground | Sunken Colosseum | Fairy | Blossom Palace |

## 2. Which battles

Every **gym battle** (`encounter.kind === 'gym'`): Gym Leaders, the Elite Four, Champions, the Elite Rebattle and the
island trials. Versus stays at the Pokémon League; every other fight keeps its area's picture.

**The type** (`gymTypeOf`, `src/engine/gymType.ts`): trainers have no speciality in the data, so it's read from the
team:

1. A trainer named in `GYM_TYPE_BY_NAME` takes that type: the few whose team says otherwise than their gym (Elite Four
   Agatha → Ghost, Elite Four Koga → Poison, Champion Lance → Dragon, Mela → Fire, Eri → Fighting, Giacomo → Dark,
   Lusamine → Fairy, N → Dark).
2. Otherwise the type most of the team share, each Pokémon counting both its types, except Normal beside another
   type (a Normal/Flying bird counts as Flying: Falkner).
3. A tie goes to the strongest Pokémon (highest level, the last of equals), its first type first: Brock's Rock/Ground
   team is Rock, Pryce's Water/Ice is Ice.

Mixed teams (most Champions) land on their ace's type: Cynthia → Dragon (Garchomp), Leon → Fire (Charizard). A trainer
renamed in the admin, or one only the remote config has, is read from their team.

## 3. In the code

- `gymPicture(type)` (`src/fx/areaArt.ts`) gives the stage as an `AreaPicture` with `stage: true`; `stagePlacement`
  makes a whole-stage picture fill the box (an area's picture still shows its middle 240 × 160).
- `BattleView` picks it for a gym encounter, before the area's picture. The drawn background stands in while it loads.
- Kitchen sink → Battle: a **Stage** dropdown shows the stage on each of the 18.
- Tests: `tests/gym-stages.test.ts` (every gym battle in the data finds a type; the tricky leaders; one 400 × 268 file
  per type), `tests/area-art.test.ts` (the gym stages are 3:2 like the lab).

## Setting it up

Nothing: no migration, no switch. To swap a picture, make a new one from its prompt and run the same `unpixel` command
on it into `public/area-art/gym-<type>.png`.
