# Pokédice — Generation 4 Plan (Sinnoh)

> **Status: planned.** Nothing below is built yet. Companion to `05-REGIONS-PLAN.md` (which is the record of how
> Johto and Hoenn were added) and `06-REGION-BALANCE.md` (the numbers they were balanced to). Where this document and
> the code disagree, the code is right.

Integration plan for the fourth region: **Sinnoh, #387–493**, played on Platinum. The shape of the feature is already
decided and built — a region is a swappable block of save fields, the engine never learns what a region is, and the
chain, the Pokédex, the Box and the Day Care are all region-scoped. Sinnoh is therefore **mostly content**, not
engineering: one more row in `regions.json`, one more `content-*.ts`, two sprite passes, and a short list of hardcoded
`386`s to raise.

The two sheets the work starts from are committed: `graphics/trainers/dppt.png` (the DPPt trainer sheet, same ripper
and same layout as `hgss.png`) and `graphics/pokemon/platinum.png` (the Platinum Pokémon sheet — front, back, shiny
and two-frame Box icons, all 107 species).

---

## 0. What the code already does for free (read before planning work)

| Fact | Where | Consequence for Sinnoh |
|---|---|---|
| The engine reads `data.regions` as data; no region id is hardcoded in `src/` | `src/engine/regions.ts` | Adding a fourth row is enough — no engine change for the region itself |
| `linearAreas(data, regionId)` scopes the chain by `area.regionId` | `src/engine/data.ts` | Sinnoh's chain works the moment its areas carry `regionId: 'sinnoh'` |
| A region owns its Pokédex through `dexRange`, and `regionOfSpecies` reads it | `src/engine/regions.ts:53` | `[387, 493]` gives Sinnoh its dex, its Box rule and its Day Care eggs |
| Cross-generation evolutions **wait for their generation** (`evolutionGate`) | `src/engine/regions.ts:275`, `05-REGIONS-PLAN.md` §4 | Electabuzz → Electivire, Eevee → Leafeon and the other 20-odd Gen 4 branches can be grafted onto Kanto/Johto/Hoenn species safely: they stay inert until the player is in Sinnoh |
| `seed-regions.ts` is **additive** — it keeps every committed row and only appends | `scripts/seed-regions.ts` | The admin tuning already baked into `src/data/*.json` survives a Sinnoh seed |
| Region chaining is a linked list (`nextRegion`) | `src/data/regions.json` | Hoenn's `nextRegion` flips from `null` to `'sinnoh'`; Sinnoh's is `null` |
| Trainer sprites are per-region folders resolved by name | `scripts/trainer-sprites.ts` | `SpriteRegion` gains `'sinnoh'`, and a `REGION_NAMED` / `REGION_CLASSES` block comes with it |

**The one thing that is not free:** Gen 4 Pokémon sprites are not in `pret/pokeemerald`, which is where all 386
current sprites come from. Step 1a cuts them from the Platinum sheet instead and reconciles two sprite sizes. That is
the highest-risk part of this plan.

---

## Step 1 — Sprites

### 1a. Pokémon #387–493

The source is the **Platinum sprite sheet**, committed at `graphics/pokemon/platinum.png` — ripped by Random Talking
Bush, hosted by The Spriters Resource. It carries everything the game needs, which the PokeAPI mirror did not:

| Per species, the sheet gives | The game needs |
|---|---|
| front, **2 animation frames** | front |
| back, **2 animation frames** | back |
| a second row of every one of those, in the **shiny palette** | front shiny, back shiny |
| **2 box-icon frames** in the label band | `miniature_1`, `miniature_2` |
| a battle-intro shadow silhouette | — (skipped) |

Geometry, decoded off the file rather than eyeballed:

- **3241×3511**, truecolor without alpha — backgrounds are the flat sheet colours (`#93BBEC` light blue, `#54A54B`
  green where the sprite is unchanged from Diamond/Pearl), exactly like the FR/LG sheet the script's older path
  already handles with `clearBackground()`
- cells **80×80**, column pitch **81** from `x = 1` → **40 columns** (`1 + 81×40 = 3241`)
- **18 block rows**, pitch **195** from `y = 34`: a 34px label band, then two cell rows at `+0` and `+81`
- **a species is 4 columns × 2 rows**: cols 0–1 front frames, cols 2–3 back frames; row 0 normal, row 1 shiny —
  10 species slots per block row, 180 in total for Gen 4's 107 species
- the label band holds, **right-aligned to the end of that species' 4 columns**: a 16px shadow cell, then the two
  32×32 box-icon frames at pitch 33, spanning `y = 1…32`. For the first block that is `x = 242`, `259`, `292`;
  for the second, `566`, `583`, `616`

So `scripts/pokemon-sprites.ts` gains a third path, `--sheet-platinum`, next to the FR/LG cutter and the pokeemerald
fetcher. No network, no `.pal` parsing (shiny is a second row of real pixels), and the two-frame Box icons are kept.

Two things still to handle:

1. **80×80 → 64×64.** Every committed sprite is 64×64 and the battle scene assumes it. Do not scale: trim the flat
   background, then paste the trimmed art into a 64×64 canvas, horizontally centred and **bottom-aligned**, so the
   Pokémon still stands on its platform. The big Gen 4 art — Torterra, Dialga, Palkia, Giratina, Rhyperior and the
   other overflowers — gets a nearest-neighbour downscale to fit, which keeps the pixel look. Then
   `--publish` as usual, regenerating `src/data/sprite-metrics.json` (493 keys).
2. **A position map, because the slots are not one per species.** Gendered pairs take two slots (the Starly, Bidoof,
   Kricketot, Shinx, Combee, Buizel, Hippopotas, Gible, Finneon, Snover lines and the rest the sheet labels
   *Male* / *Female*) and so do forms (Burmy and Wormadam cloaks, Shellos and Gastrodon seas, Cherrim, the Rotom
   appliances, Giratina Origin, Shaymin Sky, and Arceus's 18 plates across the last two block rows). The bundle has
   no form concept, so the map picks **one slot per dex number** — male, Plant Cloak, West Sea, Land Forme, Altered
   Forme, plain Rotom, plain Arceus — and the rest of the sheet is simply not cut. The map is a literal in the
   script, checked by eye against the sliced output, the same way `region-trainers.ts` does it for Johto.

The sheet also carries the Egg, Substitute and the unused sprites; none are cut.

**Fallback, if the sheet turns out to be wrong somewhere:** PokeAPI's mirror has the same Platinum art per dex number
(`sprites/pokemon/versions/generation-iv/platinum/{dex}.png` and its `back/`, `shiny/`, `back/shiny/` siblings, all
verified reachable at 80×80). It has no two-frame Box icon, which is the whole reason it is second choice now.

**Acceptance:** 642 new files under `public/pokemon`, `sprite-metrics.json` has 493 keys, no sprite carries a halo of
sheet-blue, and the battle scene shows a Turtwig, a Dialga and a Bidoof standing on the platform — not floating, not
clipped — with the Box icons still bobbing.

### 1b. Trainers

`graphics/trainers/dppt.png` has **exactly the same geometry as `hgss.png`** — same ripper, same 973px width,
verified by decoding the file:

- cells **80×80**, column pitch **81** from `x = 1` (12 columns, `1 + 81×12 = 973`)
- row pitch **98** from `y = 18`, the 18px bands being the section labels printed on the sheet
- **16 rows**; rows 0–14 follow the pitch, the last row starts at **`y = 1504`** (the `UNUSED` block carries a
  two-line label), so it is special-cased rather than computed
- a named character owns **three consecutive cells** (three battle poses) and the first pose is the one used — the
  same rule `region-trainers.ts` already applies to Johto

So Sinnoh is a third branch in `scripts/region-trainers.ts` next to `fetchJohto` (sheet) and `fetchHoenn` (decomp),
sharing the HGSS cutter with different constants (`Y0 = 18`, `ROW = 98`, `COL = 81`, `CELL = 80`, last row pinned).

Draft position map, to be confirmed by eye against the sliced output — the occupied-cell census below matched the
sheet's printed labels row for row, so the bands are right even where an individual cell still needs checking:

| Row (`y`) | Band on the sheet | Cells to cut |
|---|---|---|
| 0 (18) | Lucas · Dawn · Barry · Other trainers 1 | `lucas [0,0]`, `dawn [0,1]`, `barry [0,2]`, classes from col 5 |
| 1–6 (116–606) | Other trainers 2–7 | the class sprites (rows 5, 6 are short: 9 and 7 cells) |
| 7 (704) | Roark · Gardenia · Maylene · Crasher Wake | `roark [7,0]`, `gardenia [7,3]`, `maylene [7,6]`, `crasher-wake [7,9]` |
| 8 (802) | Fantina · Byron · Candice · Volkner | `fantina [8,0]`, `byron [8,3]`, `candice [8,6]`, `volkner [8,9]` |
| 9 (900) | Aaron · Bertha · Flint · Lucian | `elite-aaron [9,0]`, `elite-bertha [9,3]`, `elite-flint [9,6]`, `elite-lucian [9,9]` |
| 10 (998) | Team Galactic · Cyrus | grunts `[10,0] [10,1]`, commanders `[10,2] [10,3] [10,4]`, `cyrus [10,5]` |
| 11 (1096) | Cynthia · Cheryl · Riley · Marley | `champion-cynthia [11,0]`, `cheryl [11,3]`, `riley [11,6]`, `marley [11,9]` |
| 12 (1194) | Buck · Mira | `buck [12,0]`, `mira [12,3]` |
| 13 (1292) | Palmer · Argenta · Thorton · Dahlia | the Battle Frontier brains |
| 14 (1390) | Caitlin · Darach | `caitlin [14,0]`, `darach [14,3]` |
| 15 (1504) | Unused | skipped |

Output goes to `public/trainers/classes/sinnoh/`, and `scripts/trainer-sprites.ts` gains:

- `SpriteRegion` → `'kanto' | 'johto' | 'hoenn' | 'sinnoh'`
- a `REGION_NAMED.sinnoh` block: the eight leaders, the four Elite Four, `Champion Cynthia`, `Rival Barry`, `Cyrus`,
  `Mars` / `Jupiter` / `Saturn`, and the Frontier Brains
- a `REGION_CLASSES.sinnoh` list, longest-prefix-first, covering the DPPt classes (Ace Trainer, Aroma Lady, Artist,
  Battle Girl, Bird Keeper, Black Belt, Bug Catcher, Camper, Collector, Cowgirl, Cyclist, Dragon Tamer, Fisherman,
  Galactic Grunt, Gentleman, Hiker, Idol, Jogger, Lady, Lass, Ninja Boy, Parasol Lady, Picnicker, Pokéfan, Pokémon
  Breeder, Pokémon Ranger, Psychic, Rich Boy, Roughneck, Ruin Maniac, Sailor, School Kid, Scientist, Skier, Socialite,
  Swimmer, Tuber, Veteran, Waiter, Worker, Youngster), each falling back to the closest sheet cell where DPPt has no
  sprite of its own

`regionTrainerSprite()` already ends at `/trainers/default.png`, so a miss is a plain sprite, never a broken image.

**Acceptance:** `pnpm region-trainers` writes the Sinnoh folder, and every `spriteUrl` in the seeded Sinnoh trainer
rows resolves to a file that exists (a test already asserts this shape for Johto and Hoenn — extend it).

### 1c. Lucas and Dawn as playable characters — *out of scope*

The sheet carries Lucas, Dawn and their DP variants, and `public/characters/` holds only `red` and `green`. Adding
them touches `SaveData.character`, the leaderboard, the throw-animation strips and the New Game screen, none of which
Sinnoh needs. Noted here as a follow-up, deliberately not planned.

---

## Step 2 — Species data for #387–493

`scripts/seed-regions.ts` does this today for 152–386. Generalise it rather than copy it:

- `FIRST_NEW_DEX` / `DEX_MAX` become a `{ from, to }` per run — `--from 387 --to 493`, defaulting to today's values so
  a re-run is still idempotent.
- Species, types, stats, capture rates and evolution chains come from the same **PokeAPI static mirror**
  (`raw.githubusercontent.com/PokeAPI/api-data`). Verified reachable; `pokeapi.co` itself is still unreachable from
  here, which matters again in Step 5.
- Dice, HP, catch value and the dice schedule are the existing pure helpers from `seed.ts` (`hpAtLevel`,
  `catchValueFromRate`, `diceCountFromBst`, `composeDice`, `applyDiceSchedule`). Nothing about the balance formula
  changes for Gen 4.

### 2a. The Gen 4 evolution items

This is the interesting half. Gen 4 adds ~20 evolutions **onto earlier-generation species**, which is exactly the
case `graftEvolutions()` and `evolutionGate` were built for. Add to `EVO_ITEMS`:

`dawn-stone`, `dusk-stone`, `shiny-stone`, `oval-stone`, `razor-claw`, `razor-fang`, `electirizer`, `magmarizer`,
`protector`, `dubious-disc`, `reaper-cloth`

and to `NEW_ITEMS` as `stone(...)` rows (200 ₽, `inShop: false` until a Sinnoh `shopArea` turns them on, the way
Celadon gates Kanto's stones). The grafts they drive, all of them inert until the player reaches Sinnoh:

| Item | Grafts onto |
|---|---|
| Electirizer / Magmarizer | Electabuzz → Electivire · Magmar → Magmortar |
| Protector | Rhydon → Rhyperior |
| Dubious Disc | Porygon2 → Porygon-Z |
| Reaper Cloth | Dusclops → Dusknoir |
| Razor Claw / Razor Fang | Sneasel → Weavile · Gligar → Gliscor |
| Dusk Stone | Misdreavus → Mismagius · Murkrow → Honchkrow |
| Shiny Stone | Roselia → Roserade · Togetic → Togekiss |
| Dawn Stone | Kirlia → Gallade · Snorunt → Froslass |
| Oval Stone | Happiny → Chansey |

Level and location-based Gen 4 evolutions (Magneton → Magnezone, Nosepass → Probopass, Lickitung → Lickilicky,
Tangela → Tangrowth, Yanma → Yanmega, Aipom → Ambipom, Piloswine → Mamoswine, Eevee → Leafeon / Glaceon) have no item
in this game. `evolutionOf()` already assigns a level to a trigger it does not understand; give the two Eevee
branches a **forced item** (`leaf-stone` for Leafeon, an ice-flavoured stone for Glaceon) via `FORCED_ITEM`, keeping
the rule Johto set — every Eevee branch is item-driven, so a levelling Eevee never pre-empts the stones.

### 2b. Fossils and legendary catch values

- Two fossils, same shape as Hoenn's: `skull-fossil` → Cranidos (408), `armor-fossil` → Shieldon (410), revived at
  Lv.20 after 24 h, never wild, and their evolutions (Rampardos 409, Bastiodon 411) added to `FOSSIL_ONLY` so the
  catch-all area cannot hand them out.
- `LEGENDARY_CATCH` gains the Gen 4 set, on Kanto's bands: **7** for Dialga (483), Palkia (484), Giratina (487) and
  Arceus (493); **6** for Uxie/Mesprit/Azelf (480–482), Heatran (485), Regigigas (486), Cresselia (488); **5** for
  the mythicals Manaphy (490), Darkrai (491), Shaymin (492) and Phione (489).
- Rotom's forms are one species here (#479), as the bundle has no form concept.

**Acceptance:** `src/data/pokemon.json` holds 493 rows, every Gen 4 row has dice and a catch value, the grafted
branches appear on their Kanto/Johto/Hoenn parents, and `tests/engine/cross-region-evolution.test.ts` shows an
Electabuzz that cannot become Electivire until its trainer is in Sinnoh.

---

## Step 3 — Region content: `scripts/content-sinnoh.ts`

Same shape as `content-johto.ts` and `content-hoenn.ts` — an `AreaPlan[]` using the `area()` helper and the `DECK`
card shapes, routed on **Platinum**. Sinnoh areas sit at **orderIndex 401+**, after Hoenn's 301+.

Target **~30 areas**, matching Hoenn's 32, ending with the league and a post-league lap. The route order:

1. Route 201 & Lake Verity → 2. Jubilife City & Route 203 → 3. Oreburgh Gate & Mine (**Roark**) → 4. Routes 204–205 &
Ravaged Path → 5. Eterna Forest → 6. Eterna City (**Gardenia**, Galactic Building) → 7. Cycling Road & Route 207 →
8. Mt. Coronet South → 9. Hearthome City (**Fantina**) → 10. Routes 208–210 & Solaceon Ruins → 11. Veilstone City
(**Maylene**, Game Corner, Galactic HQ) → 12. Routes 212–213 & Pastoria (**Crasher Wake**) → 13. The Great Marsh →
14. Route 214 & Valley Windworks → 15. Celestic Town & Route 210 North → 16. Canalave City (**Byron**) & Iron Island
→ 17. Lake Valor & Lake Acuity → 18. Routes 216–217 & Snowpoint (**Candice**) → 19. Mt. Coronet North & Spear Pillar
→ 20. Sunyshore City (**Volkner**) → 21. Victory Road → 22. **Pokémon League** (Aaron, Bertha, Flint, Lucian,
Champion Cynthia) → 23. Fight Area & Routes 225–226 → 24. Stark Mountain → 25. Turnback Cave → 26. Fullmoon &
Newmoon Island → 27. Snowpoint Temple → 28. Flower Paradise → 29. Hall of Origin → 30. The Battle Frontier
(catch-all, `DECK.endgame`).

Rules the existing regions set, which Sinnoh keeps:

- **`enemyUpgradeLevel` climbs 1 → 9 inside the region**, never across regions (`tests/region-content.test.ts`
  asserts it).
- The first area opens at `minLevel ≤ 3`; at most two areas come after the league.
- **Legendaries are never in a wild pool** — each is a `BossDef` on an area: Dialga/Palkia at Spear Pillar, Giratina
  in Turnback Cave, the lake trio at their lakes, Heatran at Stark Mountain, Regigigas at Snowpoint Temple (gated on
  the three Regis, which live in Hoenn — either drop the gate or make it a `pokedex` condition), Cresselia on
  Fullmoon, Darkrai on Newmoon, Shaymin at Flower Paradise, Arceus at the Hall of Origin as the last thing in the
  region.
- **Team Galactic** is the villainous team: grunts in the Valley Windworks, the Eterna Building and the Veilstone HQ,
  Mars / Jupiter / Saturn as mini-bosses, Cyrus at Spear Pillar.
- **Rival Barry** recurs, using `src/engine/rival.ts`'s existing per-region rival hook.
- The catch-all endgame area offers everything reachable in the region plus Gen 4 and its starters, minus the
  fossil-only lines — `catchAllFor()` handles this once `content-sinnoh.ts` is wired into `REGION_PLANS`.
- `backgrounds` maps each area name to one of the five `BattleBackground`s (`grass`, `rock`, `sea`, `water`,
  `default`) and each `banner.scene` to an existing file in `public/banners/` — Sinnoh's snow routes and Mt. Coronet
  are the reason `snow_mountains.png`, `cave.png` and `crystal_cave.png` already exist, so **no new art is needed**.

Then in `scripts/seed-regions.ts`: a fourth `REGION_PLANS` entry (`id: 'sinnoh'`, `orderIndex: 3`,
`dexRange: [387, 493]`, `starters: [387, 390, 393]`, `spriteRegion: 'sinnoh'`, `leagueKey: 'si-pokemon-league'`,
`nextRegion: null`), and Hoenn's `nextRegion` flipped to `'sinnoh'`.

---

## Step 4 — The `386`s, and the rest of the code

The runtime is region-agnostic; what is not is a short list of constants and expectations. All of them:

| File | Change |
|---|---|
| `src/data/regions.json` | Hoenn `nextRegion: 'sinnoh'`; a fourth row for Sinnoh (written by the seed, not by hand) |
| `src/admin/schemas.ts:31,139` | `int(1, 386)` → `int(1, 493)` for the fossil dex and the `pokedex` unlock count |
| `src/admin/sections/TableSections.tsx:237` | `max={386}` → `493` |
| `src/setup/SetupPage.tsx:62` | `EXPECTED` → `pokemon: 493`, `regions: 4` |
| `supabase/` | a `0017_sinnoh.sql` **only if** a column changes — Sinnoh needs none, so expect this to be just a regenerated `supabase/seed.sql` via `pnpm seed-sql` |
| `tests/data.test.ts:30` | 386 → 493, and the legendary list gains 480–493 |
| `tests/region-content.test.ts:17` | the id and `nextRegion` chains gain `sinnoh` |
| `tests/engine/daycare.test.ts` | a Sinnoh egg case (387 ≤ dex ≤ 493) |
| `tests/admin-cheats.test.ts` | the "unknown region throws" case picks a genuinely unknown id |
| `e2e/` | no change expected; run it to confirm |

Nothing in `src/engine/`, `src/store/` or `src/screens/` is expected to change. **If a step here wants an engine
edit, stop and re-read `05-REGIONS-PLAN.md` §4 — the region feature was built so that this step stays data-only.**

---

## Step 5 — Names, in four languages

`src/i18n/strings.csv` needs `pokemon.387` … `pokemon.493` and an `item.*` row per new stone and fossil, in English,
French, Spanish and German. `pnpm i18n:names` writes exactly those rows and leaves the rest of the sheet alone — but
it fetches from `pokeapi.co`, **which is unreachable from CI and from this sandbox** (verified: connection fails,
while the `PokeAPI/api-data` mirror answers 200). Point `scripts/i18n-names.ts` at the mirror, whose
`pokemon-species/{dex}/index.json` carries the same `names` array. That is a one-line base-URL change plus the
`/index.json` suffix, and it fixes the script for the existing 386 rows too.

**Acceptance:** `pnpm test` passes `tests/i18n.test.ts` (no missing keys), and the French UI shows *Tortipouss*, not
`pokemon.387`.

---

## Step 6 — Balance

Same loop as `06-REGION-BALANCE.md`: `pnpm sim` / `pnpm balance` over 200 seeds per starter, iterating on
`content-sinnoh.ts` numbers only — never on engine code — until Sinnoh's wipe rate and encounters-per-area sit inside
Kanto's envelope. Sinnoh's specific risks, from its source games:

- **Its own levels run low.** Platinum's league is around Lv.60 where Emerald's is around Lv.55; the curve is fine,
  but the early game (Roark at Lv.14) is a known wall. Watch the first four areas' wipe rate.
- **Four strong legendaries in the post-league** could flatten the catch-all area. Keep them bosses with their own
  areas, as Hoenn does.
- **The three-stage starters evolve late** (Lv.16/32 vs Kanto's 16/36 — similar), so no special handling expected.

Commit the regenerated `src/data/*.json` and `supabase/seed.sql` **together**, and append the Sinnoh results to
`06-REGION-BALANCE.md` rather than starting a new report.

---

## Order of work, and what each step costs

| # | Step | Depends on | Shape of the work |
|---|---|---|---|
| 1 | `region-trainers.ts` → Sinnoh sprites from `dppt.png` | nothing | one script branch + a position map; self-contained, verifiable by eye |
| 2 | `pokemon-sprites.ts` → the Platinum sheet cutter and the 80→64 reconciliation | nothing | the riskiest step; do it early so surprises surface early |
| 3 | `seed-regions.ts` → species 387–493, items, fossils, grafts | 2 (sprite paths) | mostly generalising constants |
| 4 | `content-sinnoh.ts` → 30 areas, trainers, gyms, bosses | 1, 3 | the bulk of the typing; no cleverness, follow Hoenn |
| 5 | The `386`s and the tests | 3, 4 | mechanical |
| 6 | `i18n:names` on the mirror | 3 | one-line fix, four languages |
| 7 | Balance and the report | all | iteration, not authoring |

Each step lands as its own commit on `claude/gen4-sinnoh-integration-rnbpz3`, with the regenerated `src/data/*.json`
in the same commit as the script that regenerated it.

---

## Decisions taken

1. **Sinnoh is content, not engineering.** If an engine edit looks necessary, the region feature is being worked
   around rather than used.
2. **Pokémon sprites are cut from the Platinum sheet**, bottom-aligned into 64×64 — the pokeemerald decomp does not
   cover Gen 4, and the sheet beats PokeAPI's per-dex files because it carries the shiny row and the two-frame Box
   icons. PokeAPI stays the documented fallback.
3. **One slot per dex number.** The sheet's gendered pairs and form variants are real art the bundle has no concept
   of; the position map takes male / Plant Cloak / West Sea / Land Forme / Altered Forme / plain Rotom / plain
   Arceus, and the rest is left on the sheet.
4. **The Gen 4 evolution items are real items**, not assigned levels — it is what makes Electivire, Magmortar,
   Rhyperior, Dusknoir, Weavile, Gliscor, Honchkrow, Mismagius, Roserade, Togekiss, Gallade and Froslass a reason to
   play Sinnoh with an old Box, and `evolutionGate` already keeps them inert until then.
5. **Regigigas is not gated on the Regis.** Its Hoenn prerequisite does not survive the region split; it is a plain
   area boss at Snowpoint Temple.
6. **Rotom is one species**, and the Deoxys precedent (one row, extra sprites) is not repeated.
7. **Lucas and Dawn stay out**, along with the Battle Frontier as a mechanic — the Frontier is an area with Brains as
   trainers, nothing more.
8. **`i18n-names.ts` moves to the mirror** as part of this work, because the sheet cannot be regenerated otherwise.
