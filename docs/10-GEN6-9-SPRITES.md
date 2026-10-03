# Pokédice — Generations 6–9: where the sprites come from

> **Status: sprites downloaded; Kalos, Alola and Galar built on them** (`docs/11-GEN6-9-REGIONS-PLAN.md`). This note began as the research for one question, asked before any
> Kalos, Alola, Galar or Paldea plan is written: X/Y onward are 3D games, so there is no sheet to cut from the way
> Gen 1–5 were. What do we use instead, for the Pokémon and for the trainers, so that #650–1025 look like the 649 we
> already ship? §5 records what has since been fetched into `graphics/`. No species row, area, region or trainer exists in
> `src/data` yet, because no region has been chosen.

## The short answer

The fan community already solved this, in the exact style the game uses. The **Smogon Sprite Project** has
drawn Black/White-style pixel sprites for every Pokémon after #649 (front, back, and shiny of both), and Pokémon
Showdown's artists have drawn BW-style **trainer** sprites for nearly the whole Gen 6–9 cast. The B2W2 sheets are
already Unova's source, so this art is the natural continuation. It is not a downgrade. The renders of the 3D models are
the poor option here: they have hundreds of colours, soft edges and a different light.

| Need | Source | Coverage #650–1025 | Reachable from the sandbox |
|---|---|---|---|
| Pokémon front / back / shiny / back shiny | **PokeAPI `sprites/pokemon/{,back/,shiny/,back/shiny/}{dex}.png`** (Smogon art, 96×96) | **376 / 376**, all four views | yes (raw.githubusercontent) |
| same, upstream | `smogon/sprites` → `src/sprites/gen5/s<name>[-b][-s].png` (pre-trimmed) | 367 / 376 (9 Gen 9 missing, below) | yes (raw.githubusercontent) |
| Box icons | none that matches. Smogon `minisprites/pokemon/gen6` (40×30, one frame) | 159 / 160 for Gen 6–7, 1 for Gen 8, 0 for Gen 9 | yes |
| Trainers (named + classes) | **Pokémon Showdown** `play.pokemonshowdown.com/sprites/trainers/<id>.png`, 80×80 | almost the whole cast (below) | yes, since the host was allowed (it was denied during the research) |

## 1. Pokémon #650–1025

### Source: PokeAPI's default sprites

PokeAPI's top-level `sprites/pokemon/` folder is officially "a complete set of Gen 5 style (Black & White) sprites for
the entire National Dex" (its `CONTRIBUTING_SPRITES.md`). For #650+ it pulls the Smogon community's art and fills
the gaps. Checked file by file for all 376 species:

- **front, back, shiny, back shiny: 376 / 376** (Gen 6: 72, Gen 7: 88, Gen 8: 96, Gen 9: 120).
- Every file is 96×96 RGBA with the art centred and a real alpha channel, so `clearBackground()` is not needed.
- Palettes are true DS pixel art: fronts are ≤16 colours except 3. Backs are a little looser: 27 of them have 17–40
  colours, drawn by other hands. No semi-transparent pixels anywhere.
- `smogon/sprites` (upstream) is the same art pre-trimmed, but it lacks 9 Gen 9 species (Pawmo, Naclstack, Wattrel,
  Toedscruel, Rellor, Rabsca, Farigiraf, Poltchageist, Iron Crown). PokeAPI has all 9, so **PokeAPI is the source** and
  Smogon is only where credit points.

A contact sheet rendered during this research, after the same 96 → 64 fit Unova uses (Serperior, Reshiram and Kyurem
from `public/pokemon` first, for comparison): Chespin, Braixen, Greninja, Xerneas, Zygarde, Rowlet, Incineroar, Lycanroc, Necrozma, Grookey,
Cinderace, Eternatus, Sprigatito, Fuecoco, Quaxly, Koraidon, Miraidon, Terapagos, Pecharunt. The styles are
indistinguishable from Gen 5.

### Size: half the roster overflows 64

| | fronts > 64px | backs > 64px |
|---|---|---|
| Gen 4 (already shipped) | 41 / 107 | — |
| Gen 5 (already shipped) | 63 / 156 | — |
| Gen 6 | 31 / 72 | 32 / 72 |
| Gen 7 | 41 / 88 | 43 / 88 |
| Gen 8 | 55 / 96 | 55 / 96 |
| Gen 9 | 60 / 120 | 52 / 120 |

Gen 4–5 counts are sprites touching the 64px edge in `public/pokemon`, i.e. the ones `fitCanvas()` shrank.

That is 187 of 376 fronts, about 50 %, against 40 % for Gen 5. The worst reach 96px on a side (Roaring Moon, Raging
Bolt, Noivern, Xerneas, Yveltal, Buzzwole, Xurkitree, Celesteela). `fitCanvas()`'s nearest-neighbour shrink of the overflowers is what Gen 4 and 5
already do, and on the contact sheet it reads fine. So **no new rule is needed**. If the shrink ever looks too rough on
the legendaries, the alternative is a project-wide 80px battle cell. That is a separate engineering change, not part
of this.

### Box icons (`mini_1` / `mini_2`)

No reachable source has the two-frame 32×32 menu icons the game uses:

- Smogon's `minisprites/pokemon/gen6` are Showdown's 40×30 one-frame icons. They exist only up to Gen 7, so using
  them would give three different icon styles across the dex.
- PokeAPI's `versions/generation-viii/icons` (68×56, Sword/Shield) stop at #898, and the art sits in a ~20px corner
  of each canvas.
- Fan packs made for Pokémon Essentials do carry two-frame icons for later generations, but they are distributed
  outside GitHub and credited per artist. None can be fetched here, and their terms would need reading first.

**Recommendation:** keep Unova's rule (`unovaMinis()`): the front, trimmed to a square, with the second frame lifted
one pixel. It is consistent across #494–1025, and when real icons turn up only this step reruns.

### What the script needs

A fourth path in `scripts/pokemon-sprites.ts`, `--fetch-bw <from> <to>`, built from parts that already exist:

1. per dex, GET `{PokeAPI}/sprites/pokemon/{dex}.png`, `back/{dex}.png`, `shiny/{dex}.png`, `back/shiny/{dex}.png`,
   cached under `scripts/.cache` like `--fetch`;
2. `fitCanvas()` each one (trim, bottom-align, shrink only overflowers);
3. `unovaMinis(front)` for the two icon frames;
4. write `NNN_<Name>_{front,back,…}.png` into `graphics/pokemon`, then `--publish` as today.

`padStart(3, '0')` already yields `1000_front.png` for four-digit numbers, and `SpriteImg`, `seed-regions.ts` and
`dexNo()` all handle it, so nothing breaks at #1000. The hard caps that do need raising are content work, not sprite
work: `DEX_MAX` in `seed-regions.ts`, `int(1, 649)` in `admin/schemas.ts`, the admin dex input's `max={649}`, and
`EXPECTED.pokemon` in `setup/SetupPage.tsx`.

**Forms are a decision, not a sprite problem.** PokeAPI files regional forms (Alolan Vulpix, Galarian Ponyta, Hisuian
Zorua, Paldean Wooper…), Megas and Gigantamax under separate `pokemon` ids (10001+), all in the same style. The game
has one row per dex number (the Rotom/Deoxys precedent), so regional forms only matter if an area plan wants them.

## 2. Trainers

### Source: Pokémon Showdown's trainer sprites

The 3D games have no trainer sprites, but Showdown's avatar set does, and it is credited per artist in
`smogon/pokemon-showdown` → `server/chat-commands/avatars.tsx`. The sprites are 80×80, which is exactly the canvas
`region-trainers.ts` already puts Unova on. Showdown is already Unova's fallback (`graphics/trainers/showdown-bw/`), so
for Gen 6–9 it becomes the **only** source, and the code path exists.

Named characters, checked against that list. Every gym leader, Elite Four member, champion, rival, professor and
villain is there, except two Kalos minor characters (Aliana and Celosia; Lysandre, Xerosic, Bryony and Mable are in):

| Region | Cast on Showdown (examples) |
|---|---|
| Kalos | Viola, Grant, Korrina, Ramos, Clemont, Valerie, Olympia, Wulfric · Malva, Siebold, Wikstrom, Drasna · Diantha · Calem, Serena, Shauna, Tierno, Trevor · Sycamore · Lysandre, Xerosic, Flare grunts ♂/♀ · AZ |
| Alola | Ilima, Lana, Kiawe, Mallow, Sophocles, Acerola, Mina · Hala, Olivia, Nanu, Hapu · Molayne, Kahili · Kukui, Hau, Gladion, Lillie · Guzma, Plumeria, Skull grunts ♂/♀ · Lusamine, Faba, Wicke |
| Galar | Milo, Nessa, Kabu, Bea, Allister, Opal, Gordie, Melony, Piers, Raihan · Leon · Hop, Marnie, Bede · Sonia, Magnolia · Rose, Oleana · Yell grunts ♂/♀ · Victor, Gloria |
| Paldea | Katy, Brassius, Iono, Kofu, Larry, Ryme, Tulip, Grusha · Rika, Poppy, Hassel, Geeta · Nemona, Arven, Penny · Clavell, Jacq · Star grunts + bosses (Giacomo, Mela, Atticus, Ortega, Eri) · Kieran, Carmine, Drayton, Lacey, Crispin, Amarys · Florian, Juliana |

Trainer **classes** are thinner the later the generation. Distinct class sprites by suffix: `-gen6` 83 (+14 `-gen6xy`,
2 `-gen6oras`), `-gen7` 35, `-gen8` 30, `-gen9` 23, plus unsuffixed XY/SM-only classes (Butler, Cabbie, Café Master,
Furisode Girl ×4, Garçon, Punk Guy/Girl, Sky Trainer, Bellhop, Golfer, Firefighter, Trial Guide…). Kalos is covered
almost class for class. For Alola, Galar and Paldea, a few routes will reuse the region's generic Ace Trainer / Youngster
/ Lass / Hiker, or an earlier generation's sprite of the same class. Each plan lists that per area, as Sinnoh's did.

### The blocker, now cleared: the host was denied

*Resolved: the host was added to the environment's allowed domains, and option 1 below is what was built (§5).*
During the research, `play.pokemonshowdown.com` was refused by this environment's network policy (403 at the proxy), and the trainer PNGs
are not in any GitHub repo the sandbox can reach. Two ways through:

1. **Allow the host.** Add `play.pokemonshowdown.com` to the environment's allowed domains (cloud environment menu →
   Edit → Network access), and a `--showdown` path in `region-trainers.ts` downloads by id into
   `graphics/trainers/showdown-<region>/`, cached and committed like the B2W2 sheet.
2. **Commit them by hand.** Download the ids each region plan lists and commit them under the same folders, as
   `graphics/trainers/showdown-bw/` was done for Unova. The script then only reads local files.

Either way the rest is existing code: `SpriteRegion` gains `'kalos' | 'alola' | 'galar' | 'paldea'`, with
`REGION_NAMED` / `REGION_CLASSES` blocks. A miss still ends at `/trainers/default.png`.

### Player characters and social looks

- Calem/Serena, Elio/Selene, Victor/Gloria and Florian/Juliana all exist as Showdown sprites, so they can join
  `src/lib/avatars.ts` as look groups next to Kanto and Johto. Same rule as there: classes, no leaders.
- As **playable characters** they are out of scope, as Lucas/Dawn and Hilbert/Hilda were: the game needs a 5-frame
  throw strip (`/characters/<c>-throw.png`), and no source has one.

## 3. Credit and permission

This is the one real difference from Gen 1–5. Those sprites are Nintendo's art. The Gen 6–9 sprites are **named fans'
work**:

- The `smogon/sprites` README: the later-generation BW sprites "were created by artists in the community. The license
  for these community-created sprites is still being determined … please talk to us first before using them."
- Showdown credits each trainer sprite to its artist (Beliot419, Gnomowladny, Brumirage, ZacWeavile, Kyledove, Hyooppa,
  Grapo, Horo…).

For a personal, non-commercial fan project this is very likely fine, but it should be done properly:

1. ask Smogon (the README's own request) before shipping the Pokémon art;
2. add a credits block to the README's disclaimer and the in-app about/help, naming the Smogon Sprite Project
   contributors and the Showdown trainer artists;
3. drop the README's "never redistributed" wording, which no longer holds for any region: `public/pokemon` is
   committed.

## 4. Decisions for the user

1. **Source for Pokémon:** PokeAPI's BW-style set (recommended; complete) — or wait for the 9 missing on Smogon.
2. **Box icons:** front-derived, as Unova (recommended) — or mixed real icons up to Gen 7/8.
3. **Trainer download:** allow `play.pokemonshowdown.com` in the environment (recommended) — or commit files by hand.
4. **Credit:** ask Smogon first, then add the credits block (recommended before anything is merged).
5. **Which region next**, and with it which game to route on (X/Y, Sun/Moon vs USUM, Sword/Shield
   with or without DLC, Scarlet/Violet with or without DLC). That decides which trainer ids each plan needs, so it
   comes before any sprite pass.

## 5. What is in the repo now

### Pokémon #650–1025: `pnpm pokemon-sprites --fetch-bw [from] [to]`

- Source: PokeAPI `sprites/pokemon/{,back/,shiny/,back/shiny/}{dex}.png`, cached under `scripts/.cache/pokeapi`.
- Each view goes through `fitCanvas()` (trim, bottom-align in 64×64, shrink only the overflowers), and `mini_1` / `mini_2`
  come from `unovaMinis(front)`. Decisions 1 and 2 above are taken as recommended.
- English names: PokeAPI `data/v2/csv/pokemon_species.csv` + `pokemon_species_names.csv`. `fileName()` now also drops
  `:` and accents, so the names stay ASCII: `772_Type-Null`, `669_Flabebe`. None of #1–649 changes.
- **2256 files** in `graphics/pokemon` (376 species × 6). **None missing.**
- **Not published.** `--publish` iterates `src/data/pokemon.json`, which stops at 649, so it neither copies these nor
  writes their metrics. It will copy them once a region plan adds the species rows (and raises the caps listed in §1).

### Trainers: `pnpm region-trainers --showdown [kalos|alola|galar|paldea…]`

- Downloads by Showdown id into `graphics/trainers/showdown-<region>/<id>.png`, cached under `scripts/.cache/showdown`.
  It checks every file is 80×80 and not empty. Nothing is written to `public/`.
- `SHOWDOWN` in `scripts/region-trainers.ts` is the mapping table (our sprite name → Showdown id) per region, in the
  shape of `UNOVA_SHOWDOWN`. A region plan copies from it, as `cutUnova()` does for Unova's four fallbacks.

| Region | Named cast | Classes | Total | Downloaded |
|---|---|---|---|---|
| Kalos | 34: 8 leaders, E4, Diantha, Calem/Serena, Shauna/Tierno/Trevor, Sycamore, Dexio/Sina (XY look), Lysandre, Xerosic, Bryony, Mable, Flare grunts ♂/♀, AZ, Emma/Essentia, the four Chatelaines | 99 | 133 | 133 |
| Alola | 42: 7 captains, 4 kahunas, Molayne, Kahili, Kukui, Elio/Selene, Hau, Gladion, Lillie, Burnet, Samson Oak, Guzma, Plumeria, Skull grunts ♂/♀, Lusamine, Faba, Wicke, Ultra Recon Squad ×4, Rainbow Rocket grunts ♂/♀, the `-gen7` guests (Anabel, Blue, Red, Colress, Cynthia, Grimsley), Ryuki, the Masked Royal | 50 | 92 | 92 |
| Galar | 31: 10 leaders plus Bede and Marnie as leaders, Leon, Victor/Gloria, Hop, Marnie, Bede, Sonia, Magnolia, Rose, Oleana, Yell grunts ♂/♀, Sordward, Shielbert, Ball Guy, Mustard, Klara, Avery, Peony | 30 | 61 | 61 |
| Paldea | 42: 8 leaders, Rika, Poppy, Hassel, Geeta, Florian/Juliana, Nemona, Arven, Penny, Clavell, Jacq, Sada, Turo, the 5 Star bosses, Star grunts ♂/♀ (Scarlet and Violet looks), Kieran, Carmine, Perrin, Ogre Clan, Drayton, Lacey, Crispin, Amarys, Briar | 23 | 65 | 65 |

**351 / 351 downloaded.** The only gaps in the named casts are **Aliana and Celosia** (Kalos). Avatars.tsx has no sprite for them.

Naming follows the older regions: `elite-` / `champion-` prefixes, `-m` / `-f` where a class has both sexes, plain names
for one-sex classes. Specific to Gen 6–9:

- **Kalos holds every `-gen6` class, ORAS-era ones included** (Kindler, Ninja Boy, Triathletes, Bug Maniac…). The plan
  picks per area. Where XY and ORAS each have a sprite, the plain name is XY's and the other gets `-oras`. Avatars.tsx
  suffixes the pairs inconsistently: `X-gen6xy` + `X-gen6` for 14 classes (so plain `-gen6` is read as ORAS there),
  but `X-gen6` + `X-gen6oras` for Lass and Lady. The contact sheet bears this out.
- **Paldea's Scarlet and Violet variants** are both kept: plain for Scarlet (`-s`), `-violet` for Violet (`-v`).
- One sprite per character. Alternative poses (`kukui-stand`, `hau-stance`, `lillie-z`, `lusamine-nihilego`,
  `leon-tower`, the `-masters`, `-league`, `-festival`, `-dojo`, `-tundra` outfits) are left out. They are a one-line
  addition each.

**Left out on purpose:**

- The ORAS **Hoenn** cast with a `-gen6` suffix (Roxanne, Brawly, Flannery, Norman, Winona, Tate & Liza, Wallace,
  Phoebe, Steven, Maxie, Archie) and the unsuffixed ORAS Aqua/Magma grunts. They are Hoenn, not Kalos, and belong to a
  Hoenn refresh if that ever happens.
- Unsuffixed classes whose game avatars.tsx does not tell, because Kyledove's Gen 6 batch mixes in Gen 8 ids:
  `chef`, `cook`, `delinquent`, `freediver`, `gardener`, `leaguestaff(f)`, `owner`, `postman`, `railstaff`, `schoolboy`,
  `schoolgirl`, `scubadiver`, `streetthug`, `teammates`, `tourist(f/f2)`. Each region plan can check them against the
  game it routes on and add the ones it needs. The unsuffixed ids in Kyledove's Gen 7 batch are all Sun/Moon, so
  Alola takes them all.
- Legends: Z-A (Lumiose: `az-lza`, `emma-lza`, `naveen`, `lida`, `canari`, `corbeau`, `jacinthe`, `urbain`, `taunie`…) and
  Legends: Arceus (Hisui). Neither is a region plan yet.

## 6. Credits

Required by the artists' and Smogon's terms (§3). This list is the source for the README / about-page credits block,
which is **not written yet**: Smogon has to be asked first.

**Pokémon #650–1025 (2256 files):** the **Smogon Sprite Project** (`smogon/sprites`), the community artists who drew
Black/White-style sprites for Generations 6–9, as distributed by PokeAPI (`PokeAPI/sprites`, which fills the gaps
Smogon has not drawn yet). Smogon's README asks to be contacted before use; that request is still open.

**Trainers (351 files):** Pokémon Showdown's trainer sprites. Each artist below is credited in `avatars.tsx` as
Showdown names them:

| Artist | Kalos | Alola | Galar | Paldea | Total |
|---|---|---|---|---|---|
| **Kyledove** ([@DoveKyle](https://twitter.com/DoveKyle)) | 105 | 32 | 29 | 57 | 223 |
| **Beliot419** ([deviantart.com/beliot419](https://www.deviantart.com/beliot419)) | — | 49 | — | — | 49 |
| **Brumirage** ([@Brumirage](https://twitter.com/Brumirage)) | 2 | 3 | 31 | — | 36 |
| **Gnomowladny** | 18 | 2 | — | — | 20 |
| **ZacWeavile** | 6 | 6 | 1 | 8 | 21 |
| **Horo** | 1 | — | — | — | 1 |
| no artist named (`OFFICIAL_AVATARS` main set) | 1 (Clemont) | — | — | — | 1 |

Showdown also credits **hyo-oppa**, **Grapo**, **Fifty Shades of Rez**, **Selena**, **wisteriapurple**, **Flamibane** and
**RADU** for other avatars. None of their sprites is in this pass. Credit them if a later pass adds any (Hyo-oppa's are
the ORAS Brendan/May/Maxie. Grapo's include Glacia and Peonia, a Crown Tundra character Galar could add).

