# Pokédice — one sprite source: Pokémon Showdown

> **Status: built.** Every Pokémon and trainer picture in the game comes from [Pokémon Showdown](https://pokemonshowdown.com).
> Before this, the game mixed six sources: FireRed/LeafGreen, Emerald, Platinum, B2W2, the Smogon/PokeAPI Black/White-style
> set and Showdown's Gen 6–9 trainers. Each region looked different, at a different canvas size. `pnpm showdown-sprites`
> rebuilds everything below.

## What the game shows

| Picture | Source | Where it lives | Requests per player |
|---|---|---|---|
| Pokémon, battle and every screen (front, back, both shiny) | Showdown's **pixel-art animated** sprites, `sprites/gen5ani{,-back}{,-shiny}/<id>.gif`: Black/White's own for #1–649, the community's in the same style after. Where no animation is drawn yet, Showdown's static pixel-art set, `sprites/gen5…/<id>.png` | **Showdown's CDN**, loaded directly. Nothing is copied into the repo | one per sprite actually shown, all served by Showdown (none by our host), cached by the browser |
| Box / menu icons (`MiniSprite`) | Showdown's icon sheet, `sprites/pokemonicons-sheet.png`: 40×30, every Pokémon and form | `src/assets/pokemon-icons.png`, the sheet as it is (390 KB) | **one**, ever: a hashed `/assets/` file, cached for a year |
| Trainers, the two player characters, Professor Oak (`TrainerSprite`) | Showdown's trainer sprites, `sprites/trainers/<id>.png`, 80×80 | `src/assets/trainers/<region>.png`: one sheet per region of every sprite the game names | **one per region** played, ever: hashed, cached for a year |
| Cries (not a picture: see [Cries](#cries)) | Showdown's cries, `audio/cries/<id>.mp3`, ~9 KB each | **Showdown's CDN**, loaded directly. Nothing is copied into the repo | one per cry actually played, all served by Showdown (none by our host), cached by the browser; none while sound is off |

**Pixel art only.** Showdown also serves `sprites/ani/`, animations rendered from the 3D models. Those are not pixel
art and clash with the game's look, so they are never used. Coverage of the pixel-art set:

| | animated (all four views) | animated front | static pixel art only |
|---|---|---|---|
| #1–649 | 649 / 649 | 649 | 0 |
| #650–1025 | 159 / 376 | 217 | 159 |
| forms | 76 / 227 | 114 | 96 (17 have no front at all) |

`public/trainers/classes/**` and `public/characters/{red,green,prof-oak}.png` also hold the Showdown sprites, one file
each. The game only loads those for a URL outside the sheets: a `sprite_url` someone typed in admin.

Unchanged: the throw strips (`/characters/<c>-throw.png`), drawn from FireRed/LeafGreen's back sprites. Showdown has no
trainer back sprites. The player characters keep FireRed/LeafGreen's Red and Leaf (`red-gen3`, `leaf-gen3`) so that
front and back match.

### Keeping requests down

The brief was to make as few web requests as possible:

- **No request for a sprite that doesn't exist.** `src/data/showdown-sprites.json` records, per dex and view, whether
  Showdown has it animated (`a`), static (`g`) or not at all (`-`). The game asks for exactly that file. It never tries
  the GIF and then the PNG.
- **Pokémon cost our host nothing.** About 3,700 animated GIFs (~175 MB) stay on Showdown's CDN
  (`cache-control: max-age=691200`), which is also why they are not committed.
- **Icons and trainers are sheets.** A Box of 30 Pokémon used to cost 30 requests, and so did a screen of trainers;
  now each costs one, and the sheets are content-hashed Vite assets under `/assets/`, which `netlify.toml` already
  caches as immutable. The 1,252 `NNN_mini.png` files are gone.
- `preloadSprites` still warms only the current area's fronts, which the player is about to see anyway.

### Cries

`src/audio/cries.ts` plays Showdown's cry MP3s straight from its CDN (`cache-control: max-age=2678400`, 31 days), so
they cost our host nothing either: 1,123 cries, about 10 MB, none of it in the repo.

- **Where:** the battle, as each Pokémon comes out (the foe's, then yours; yours again on each switch); a Mega
  Evolution, Primal Reversion or Ultra Burst once the new form stands there, in place of the jingle, when Showdown
  has that form's own cry (96 do; the Gigantamax forms and Curly Mega Tatsugiri have none, so they keep the jingle);
  and the speaker button on a Pokémon's sheet (`CryButton`). Nothing while a Versus replay is skipped through.
- **When:** only as one plays: nothing is fetched ahead, and nothing at all while sound is off (Settings → Sound, one
  switch for the cries and the 8-bit sounds, on by default).
- **No request for a cry that doesn't exist.** `pnpm showdown-sprites cries` checks every entry's
  `audio/cries/<id>.mp3`. The 129 forms without their own (regional forms, Gigantamax, the Arceus and Silvally types,
  Ogerpon's masks…) get their species' id as `c`; a form with none at all would get `c: ''` and stay silent.
- **One player:** a single audio element, so a new cry cuts the last one off; when a battle opens with both Pokémon
  out at once, yours waits for the foe's. iOS only lets an element play on its own after a tap has touched it, so
  the first tap anywhere calls `load()` on it (no request).
- **Misses:** a cry that can't load (offline, Showdown down or blocking us) is simply not heard: no retry, no
  message, and the next one plays.

### Offline and misses

`SpriteImg`'s chain: Showdown's sprite → the local sprite (`public/pokemon/NNN_<view>.png`, the old PokeAPI-based set,
kept as the offline fallback) → the species' own `sprite_url` (one added in admin) → `?`. A view Showdown doesn't have
starts at the local sprite, so that miss costs no request either.

Showdown has no sprite at all for 17 of the newest Megas (Heatran, Darkrai, Magearna, Zeraora, Meowstic, Raichu X
and Y, Staraptor, Scolipede, Scrafty, Eelektross, Pyroar, Malamar, Barbaracle, Dragalge, Falinks, Curly Tatsugiri),
and no back for 5 others. Those views show the local sprite. The script lists them when it
runs (`no Showdown sprite: …`). When Showdown draws them, a re-run picks them up.

## Placement

Showdown's pixel-art sprites are drawn for Black/White's 96 px canvas. Most GIFs are trimmed to their art, from 32 px
(Aron) to 153 px (Lugia).

- **Battle** (`cellBox` in `BattleView.tsx`): the art stands on the platform's feet line, one sprite pixel to one scene
  pixel (`SHOWDOWN_SCALE` = 1), as Unova's B2W2 sprites always were. Its pixels line up with the backgrounds', and a
  Charizard stands taller than a Pikachu, as in the games. Anything past `MAX_ART` (80 scene pixels) is shrunk, as Gen
  4–5's overflowers were before.
- **Everywhere else** (`showdownPlacement`): the art is centred in its box, as if a 96 px canvas filled the box. It is
  shrunk only if it doesn't fit.
- Rendering stays `image-rendering: pixelated`, like the rest of the game.

## On a canvas (the animation timelines)

The battle stage, the Pokémon Center, evolutions and Egg hatching are drawn on a pixel canvas by timelines
(`src/fx`, docs/15 §8), and a timeline needs to draw the Pokémon itself: two white frames on a hit, a red silhouette
shrinking into a ball, a white silhouette flickering between two forms. Three ways were weighed:

1. **Decode the GIFs at runtime** (`ImageDecoder`, or a GIF decoder library) into frame sheets. Every frame on
   canvas, but Showdown sends no CORS headers, so the bytes can't be read in the page without a proxy; and a decoder
   is code and memory for every sprite shown.
2. **Pre-built frame sheets** (extend `pnpm showdown-sprites` the way the Visual Lab's `sheets.py` did). Every frame,
   but a second copy of every animated sprite to host and download: the very requests this project removes.
3. **The browser animates, the canvas borrows a still** — chosen. Outside an effect the animated GIF is an ordinary
   `<img>` layered on the stage (Home's scene does this) and the browser plays it. While an effect needs the Pokémon,
   the canvas draws `drawImage(img)`'s still frame (the GIF's first frame), cropped to the art box this table already
   holds and scaled like the stage (`src/fx/sprites.ts`: `loadSprite`, `drawSprite`). Same URL as the `<img>`, so
   the browser cache answers it: no second download, no proxy. The canvas never reads pixels back (silhouettes and
   tints are compositing operations), so the missing CORS headers don't matter.

The cost: during an effect the Pokémon holds its first pose instead of animating; effects are short and busy, and
the white frames, silhouettes and tints are what the eye follows there. Forms come from the same table
(`charizard-megax`, `pikachu-gmax`…); most have only a static `g` sprite, which the canvas draws the same way.

## Ids

- **Pokémon**: Showdown's sprite id is its base species as an id, plus `-` and the forme as an id: `mrmime`,
  `charizard-megax`, `vulpix-alola`. `scripts/showdown-sprites.ts` matches every row of `pokemon.json` against
  Showdown's `data/pokedex.json`. For a base species it uses the dex number. For a form it uses the PokeAPI name, so
  `10034 charizard-mega-x` → `Charizard-Mega-X`. `FORM_IDS` covers the 11 forms where PokeAPI names a default Showdown
  leaves out (`tauros-paldea-combat-breed` → `tauros-paldeacombat`). Our own Arceus and Silvally ids (20001+) take the
  type: `arceus-fire`.
- **Icons**: Showdown's own rule (`Dex.getPokemonIconNum`): the forme's entry in `BattlePokemonIconIndexes`, else the
  species' number.
- **Trainers**: `TRAINERS` in the script maps each of our 323 Kanto–Unova sprite files (plus the characters) to a
  Showdown id. Kalos onward already came from Showdown (`region-trainers.ts --showdown`). The rule: Showdown's
  **unsuffixed** sprite, its default Diamond/Pearl–Black/White-era look, so every region reads alike. A region's own era
  stands in where Showdown has nothing unsuffixed or the character looked different there:
  - Kanto's `-gen3` FireRed/LeafGreen sprites for Channeler, Engineer, Painter, Rocker, Tamer, Crush Kin, Lorelei and
    Agatha, and Blue's three rival stages (`blue-gen3`, `blue-gen3two`, `blue-gen3champion`);
  - Hoenn's `-gen6` Omega Ruby/Alpha Sapphire cast (Archie, Maxie, Phoebe, Tate & Liza, Hex Maniac, Kindler,
    Triathlete);
  - Sinnoh's child Caitlin (`caitlin-gen4`). `lady-gen4` stands in for the Socialite, which has no sprite of its own.

  Every pairing was checked on a contact sheet against the old sprite. A few old cuts showed another class than their
  name (Kanto's Channeler and Rocker, for example). The Showdown id follows the name, so those now show the class they
  are named after.

## Re-running

```bash
pnpm showdown-sprites            # all four steps
pnpm showdown-sprites pokemon    # after adding species or forms (then `cries`)
pnpm showdown-sprites cries      # which cries Showdown has: one HEAD request per id, cached
pnpm showdown-sprites trainers   # after adding trainers or social looks
```

Downloads are cached under `scripts/.cache/showdown`, 404s included, so a re-run is offline. The first full run fetches
about 200 MB. `tests/showdown-sprites.test.ts` checks the following: every species has an entry and its own cry, every
borrowed cry is one Showdown has, every sprite a trainer, avatar or character names is in a sheet, and every cell is
inside its sheet.

## Credits

- **Pokémon**: Pokémon Showdown's pixel-art sprites (`play.pokemonshowdown.com/sprites/gen5ani`, `gen5`), maintained
  by the Showdown and Smogon sprite contributors. #1–649 are Black/White's own. The Black/White-style sprites after
  #649, animated and static, are the [Smogon Sprite Project](https://github.com/smogon/sprites)'s work.
- **Icons**: Showdown's menu icon sheet (`pokemonicons-sheet.png`).
- **Cries**: the games' cries as Pokémon Showdown serves them (`play.pokemonshowdown.com/audio/cries`).
- **Trainers**: Showdown's trainer sprites, credited per artist in `smogon/pokemon-showdown` →
  `server/chat-commands/avatars.tsx`. Kanto–Unova uses 193 from Showdown's main set, plus Kyledove (Aqua Grunt, Hex
  Maniac, Kindler, Triathlete, Professor Oak, Schoolboy, Schoolgirl), Brumirage (Archie, Phoebe, Tate & Liza),
  Hyo-oppa (Maxie), Gnomowladny (Sidney), Beliot419 (Wally), Grapo (Glacia) and ZacWeavile (Magma Grunt). Kalos onward
  is credited in [docs/10 §6](10-GEN6-9-SPRITES.md#6-credits).
