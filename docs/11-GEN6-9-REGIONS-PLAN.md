# Pokédice — Generations 6–9 Plan (Kalos, Alola, Galar, Paldea)

> **Status: in progress**, built one generation at a time on `main` (asked for 2026-10-03). Each generation lands
> whole (species, sprites, content, names, balance, seed.sql) before the next one starts. Where this document and
> the code disagree, the code is right, and each section gets a "what changed in the building" note when its
> generation ships.

The four regions after Unova, in order: **Kalos** (#650–721, 72 species), **Alola** (#722–809, 88), **Galar**
(#810–905, 96, Hisui's seven included) and **Paldea** (#906–1025, 120). That is 376 species, the sprites of
`docs/10-GEN6-9-SPRITES.md`, and four more runs of the pipeline Unova used (`docs/08-UNOVA-PLAN.md`).

## The brief, and how each part is met

| Ask | How |
|---|---|
| Add the regions generation by generation | One region per pass, in dex order, each chained after the last (`nextRegion`). A pass is committed and pushed to `main` only once lint, tests and build are green. |
| Existing balancing for dice and level-ups | `liveDicePlan` (`scripts/dice-live.ts`), the rules read back from the admin's hand tuning, exactly as Unova. Evolution levels are the games'. No new dice formula. |
| The real games' trainers, gym leaders and champions, with real data | Real names, real Pokémon and the games' levels. Every team is **at most three** (`maxTeamSize`, and every trainer in the game). When a real team is bigger, the three kept are chosen by the user's rule: **Pokémon new to this generation first, then the highest level**. Version-exclusive leaders are fought back to back in one gym, like Striaton's trio. |
| Every Pokémon, or at least its first stage, found in an area that is not the late-game catch-all | Every new species is in some area's wild pool other than the catch-all, or evolves from something that is, or comes out of a fossil. A test enforces it for every region, the old ones included. Legendaries stay area bosses. |
| More aggressive Pokédex and level requirements on secret areas | Every secret area gets **both** a Pokédex gate and a level gate, set from the region's own size (rule below). Unova's secret areas had only a level gate equal to the area's opening level. |

## Sources

- **Wild pools:** PokeAPI's encounter tables (`data/v2/csv/encounters.csv`, on raw.githubusercontent), which hold the
  real per-location encounters of **X/Y**, **Sun/Moon + Ultra Sun/Ultra Moon** and **Sword/Shield** with both DLCs.
  Weights come from the slot rarities, version exclusives merged, levels from the tables. **Scarlet/Violet has no
  encounter data there**, so Paldea's pools are written from the games' area lists by hand and say so.
- **Species, types, stats, evolutions:** the PokeAPI mirror, through `scripts/seed-regions.ts`, as every region.
- **Trainers:** the games' rosters. No machine-readable source is reachable from the sandbox (Bulbapedia, Serebii and
  Smogon are blocked), so teams and levels are written from the games, as Unova's were.
- **Sprites:** already in `graphics/` (`docs/10-GEN6-9-SPRITES.md`): `pnpm pokemon-sprites --publish` and the
  Showdown trainer sets, copied into `public/trainers/classes/<region>/` by `pnpm region-trainers`.

## Routing

| Region | Game | Gyms / trials | League | Post-league |
|---|---|---|---|---|
| Kalos | X/Y | Viola, Grant, Korrina, Ramos, Clemont, Valerie, Olympia, Wulfric | Malva, Siebold, Wikstrom, Drasna, **Diantha** | Victory Road II / League II, Pokémon Village + Kiloude, the catch-all |
| Alola | Ultra Sun / Ultra Moon | The island trials and their captains (Ilima, Lana, Kiawe, Mallow, Sophocles, Acerola, Mina) and the four **kahunas** as the badge battles (Hala, Olivia, Nanu, Hapu) | Hala, Olivia, Acerola, Kahili, then **Kukui** | Ultra Space, Team Rainbow Rocket's grunts, Ultra Beasts, the catch-all |
| Galar | Sword/Shield | Milo, Nessa, Kabu, **Bea + Allister**, Opal, **Gordie + Melony**, Piers, Raihan (version leaders back to back) | The Champion Cup: Marnie, Hop, Bede, then **Leon** | The Isle of Armor, the Crown Tundra, the catch-all |
| Paldea | Scarlet/Violet | Katy, Brassius, Iono, Kofu, Larry, Ryme, Tulip, Grusha (Victory Road), with the Titans and Team Star on the way | Rika, Poppy, Larry, Hassel, then **Geeta**, then **Nemona** | Area Zero, Kitakami, Blueberry Academy, the catch-all |

Each region follows the shape of the four before it: a first area at `minLevel ≤ 3`, `enemyUpgradeLevel` 1 → 9 along
the chain, one round per area past the second (Sinnoh's lesson), a Game Corner (or the region's closest thing), the
Master Ball once in the villains' hideout, an endgame lap (Victory Road II / League II), and a `scalesToTeam`
catch-all with `wild: 'ALL'`.

## Species

`pnpm seed-regions --from <lo> --to <hi>` per region. The script keeps every row outside the range exactly as the
bundle has it, which now includes rows *above* the range too (it used to drop them, which only did no harm because
each new region was the last).

### Evolution triggers new to Gen 6–9

The rules that already exist cover most of them (a level stays a level; a trade becomes Lv.34; friendship Lv.30).
The rest:

| Trigger | Cases | Becomes |
|---|---|---|
| A new held / used item | Sachet (Spritzee), Whipped Dream (Swirlix), Tart / Sweet Apple (Applin), Cracked Pot (Sinistea), Galarica Cuff / Wreath (Galarian Slowpoke: not modelled), Black Augurite (Scyther → Kleavor), Peat Block (Ursaring → Ursaluna), Auspicious / Malicious Armor (Charcadet), Syrupy Apple (Applin → Dipplin), Metal Alloy (Duraludon), Unremarkable Teacup (Poltchageist) | a real item of kind `stone`, region-bound, found once in the right area |
| Affection + a Fairy move | Eevee → **Sylveon** | **Shiny Stone**, the one stone Eevee had no use for (house rule, as Espeon/Umbreon took Sun/Moon Stone) |
| Conditions this game has no notion of (upside-down, rain, weather, spin, critical hits, damage taken, moves used, coins) | Malamar, Goodra, Alcremie, Sirfetch'd, Runerigus, Annihilape, Farigiraf, Dudunsparce, Kingambit, Gholdengo, Palafin… | the level the games give where there is one; otherwise an assigned level near the line's natural one, listed per species in each region's section |
| Galarian / Hisuian / Paldean **form** evolutions of old species | Perrserker, Sirfetch'd, Mr. Rime, Cursola, Runerigus, Obstagoon, Clodsire, Wyrdeer, Kleavor, Ursaluna, Sneasler, Overqwil, Basculegion | grafted onto the old species as a branch, as Gen 4 grafted Electivire onto Electabuzz. `evolutionGate` keeps each inert until the player is in that generation's region |

### Legendaries

All area bosses, never wild, on Unova's catch bands: **7** box legendaries, **6** trios and Ultra Beasts, **5**
mythicals. `LEGEND_KIND` gives them their dice (trio: 3 typed + 2 base; box and mythical: 5 typed).

## Secret areas: the stricter gate

Unova's secret areas opened on an `area` gate plus `maxLevel` equal to the area's own minimum level, and no Pokédex
gate. From Kalos on, every secret area carries **all three**:

- an `area` gate (the story point, as before);
- a **Pokédex** gate, a share of the region's catchable species (`regionSpecies`, counted once the region is built):
  **35 %** for a story-time legendary, **55 %** for a post-league trio or Ultra Beast lair, **70 %** for a box
  legendary, **85 %** for a mythical;
- a **level** gate at the boss's own level (not the area's opening level), so the player has a Pokémon that can
  meet it.

The numbers are written into each area as plain counts (the admin edits counts, not shares), and listed in each
region's section.

## Engineering, once

| File | Change |
|---|---|
| `scripts/seed-regions.ts` | rows above the range are kept; the new evolution items; the trigger rules above; `LEGEND_KIND`, `LEGENDARY_CATCH`, `PSEUDO_LINES` (Goomy, Jangmo-o, Dreepy, Frigibax), `FOSSIL_ONLY`; a `REGION_PLANS` row per region |
| `scripts/content-<region>.ts` | one per region, the shape of `content-unova.ts` |
| `scripts/region-trainers.ts` | copies each region's `SHOWDOWN` set into `public/trainers/classes/<region>/` under our names |
| `scripts/trainer-sprites.ts` | `SpriteRegion` + `REGION_NAMED` / `REGION_CLASSES` / `PAIRED` per region |
| The 649s | `admin/schemas.ts`, the admin dex input, `setup/SetupPage.tsx`, the tests: raised to each region's top as it lands |
| `tests/region-content.test.ts` | the chain lists; the "found outside the catch-all" rule; the stricter secret-area gate |

## Per region, in order

1. **Species**: `seed-regions --from lo --to hi`, then the dice table of the new range checked by eye.
2. **Sprites**: `pokemon-sprites --publish`; `region-trainers` for the trainer set.
3. **Content**: `content-<region>.ts`.
4. **Names**: `pnpm i18n:names` (Pokémon, items), area and badge names written by hand in the ten languages.
5. **Balance**: `pnpm balance table 6 900 <region>`, iterated on the content file only, until the region sits in
   the envelope the other five do. Results appended to `06-REGION-BALANCE.md`.
6. **Ship**: `supabase/seed.sql`, lint, tests, build, then push to `main`.

## Hand-over

The work starts from the user's export bundle of 2026-10-03 (`Import the live bundle of 2026-10-03`), so the
committed data matches the live database before any region is added. `supabase/seed.sql` is regenerated from the
bundle at the end of each region. If the admin is used between two regions, export again and send the bundle before
the next one, so its edits are not overwritten.

---

## Kalos (#650–721) — built

`scripts/content-kalos.ts`, `pnpm seed-regions --from 650 --to 721` (the default). 27 areas on the chain, 5 secret.

**Route.** Routes 1 & 2 → Santalune Forest → Route 3 & Santalune (**Viola**) → Routes 4 & 22 → Route 5 & Camphrier →
Route 6 & Parfum Palace → Route 7 & the Connecting Cave → Route 8 & Ambrette → Route 9, the Glittering Cave &
Cyllage (**Grant**; the Jaw and Sail Fossil) → Route 10 & Geosenge → Route 11, Reflection Cave & Shalour
(**Korrina**) → Route 12, Azure Bay & Coumarine (**Ramos**) → Route 13 & the Power Plant → Lumiose City (**Clemont**,
the Game Corner deck) → Route 14 & Laverre (**Valerie**) → Routes 15 & 16 and the Lost Hotel → Dendemille, Route 17
& the Frost Cavern → Route 18 & Anistar (**Olympia**) → Lysandre Labs & the Team Flare HQ (**Xerosic, Lysandre**; the
Master Ball) → Route 19 & Couriway → Route 20, the Pokémon Village & Snowbelle (**Wulfric**) → Route 21 & Victory
Road (Serena's last battle) → **the League** → Victory Road II → League II. After the league: Kiloude City & the
Battle Maison (the four Chatelaines), the Friend Safari (catch-all).

**Wild pools** are X/Y's per route from PokeAPI, versions merged, trimmed to the 7–13 commonest and with base forms
held under their evolution level. Every Gen 6 species has a route outside the catch-all (or comes from its fossil),
and so do the older species X/Y put on Kalos's routes.

**Teams.** The user's rule picks the three when the real roster is bigger:

| Battle | X/Y roster | Kept (new first, then level) |
|---|---|---|
| Malva | Pyroar 63, Torkoal 63, Chandelure 63, Talonflame 65 | Pyroar, Chandelure, Talonflame |
| Siebold | Clawitzer 63, Gyarados 63, Starmie 63, Barbaracle 65 | Clawitzer, Gyarados, Barbaracle |
| Wikstrom | Klefki 63, Probopass 63, Scizor 63, Aegislash 65 | Klefki, Scizor, Aegislash |
| Drasna | Dragalge 63, Druddigon 63, Altaria 63, Noivern 65 | Dragalge, Druddigon, Noivern |
| Diantha | Hawlucha 64, Tyrantrum 65, Aurorus 65, Gourgeist 65, Goodra 66, Gardevoir 68 | Tyrantrum, Aurorus, Goodra |
| Lysandre | Mienshao 51, Honchkrow 51, Pyroar 53, Gyarados 53 | Honchkrow, Gyarados, Pyroar |

Where Pokémon of the same kind tie on level (Malva's, Siebold's and Drasna's 63s, Diantha's three 65s), the one most
associated with that trainer is kept. The leaders (two or three Pokémon each) are their X/Y teams whole. Diantha's Gardevoir is out by
the rule: five of her six are Gen 6.

**Species.** 72 rows from `liveDicePlan`, plus four set by hand to their closest live relative (`DICE_OVERRIDES`):
Scatterbug → Spewpa → Vivillon as Wurmple → Silcoon → Beautifly, and Sylveon as Leafeon and Glaceon. Sylveon
evolves from Eevee with the **Shiny Stone** (the one stone Eevee had no use for). The **Sachet** and **Whipped
Dream** are new Kalos-only items (Route 7, once each); Goomy's line is a pseudo-legendary line; Tyrunt, Amaura and
their evolutions come only from the new **Jaw** and **Sail Fossil**.

**Secret areas.** Kalos's routes borrow from every generation, so its Pokédex is large: **364** catchable species.

| Area | Boss | Gate |
|---|---|---|
| The Team Flare Secret HQ Depths | Xerneas 65, Yveltal 65 | league · Pokédex **255** (70 %) · Lv.65 |
| Terminus Cave | Zygarde 70 | league · Pokédex **255** · Lv.70 |
| The Diamond Domain | Diancie 65 | league · Pokédex **309** (85 %) · Lv.65 |
| Hoopa's Ring | Hoopa 68 | the Diamond Domain · Pokédex **309** · Lv.68 |
| The Nebel Plateau | Volcanion 70 | Hoopa's Ring · Pokédex **309** · Lv.70 |

**Names.** Pokémon and item names from PokeAPI; area names from PokeAPI's official location names in French, Spanish,
German, Italian, Japanese and Korean. PokeAPI has no Chinese for Kalos, so the Chinese town names are the ones the
Chinese wiki (52poke) lists, and the routes, caves and new trainer classes are written by hand. **The Chinese column
and the new class names are best-effort and worth a native speaker's look.**

**Balance** (`pnpm balance table 6 900 kalos unova`, in `06-REGION-BALANCE.md`): inside the envelope, no change needed.
