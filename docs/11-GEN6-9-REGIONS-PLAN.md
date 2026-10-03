# Pokédice — Generations 6–9 Plan (Kalos, Alola, Galar, Paldea)

> **Status: built** — Kalos, Alola, Galar and Paldea, one generation at a time on `main` (asked for 2026-10-03).
> Each generation landed whole (species, sprites, content, names, balance, seed.sql) before the next one started.
> Where this document and the code disagree, the code is right; each region's section below says what changed in the
> building.

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

---

## Alola (#722–809) — built

`scripts/content-alola.ts`, `pnpm seed-regions --from 722 --to 809` (the default). 27 areas on the chain, 14 secret.
Routed on **Sun and Moon's levels**, which climb more evenly than Ultra Sun and Ultra Moon's, with USUM's additions on
top (Mina's trial, the Ultra Beasts in Ultra Space, the Ultra Recon Squad, Necrozma's Megalopolis).

**Badges.** The game counts eight badges (the foe upgrade level climbs one per badge, 1 → 9), and the island challenge
has twelve trials and grand trials. Two per island hand over their **Z-Crystal as the badge**: Ilima (Normalium Z) and
Hala (Fightinium Z) on Melemele, Lana (Waterium Z) and Olivia (Rockium Z) on Akala, Sophocles (Electrium Z) and Nanu
(Darkinium Z) on Ula'ula, Mina (Fairium Z) and Hapu (Groundium Z) on Poni. Kiawe, Mallow, Acerola, Guzma, Faba and
Lusamine are fought without one, the way Striaton's first two brothers are. A captain's battle ends on the **totem**
of the trial, at its totem level (Gumshoos 12, Wishiwashi 20, Salazzle 22, Lurantis 24, Vikavolt 29, Mimikyu 33,
Ribombee 45).

**Route.** Melemele: Route 1 → Hau'oli & the Cemetery → Route 2 & the Verdant Cavern (**Ilima**) → Route 3 &
Melemele Meadow → Ten Carat Hill & Kala'e Bay → Route 1 South & Iki Town (**Hala**). Akala: Heahea & Routes 4–6 →
Brooklet Hill (**Lana**) → Routes 7–8 & Wela Volcano (Kiawe) → Lush Jungle (Mallow) → Memorial Hill, Akala Outskirts
& Konikoni (**Olivia**) → Hano Beach & Aether Paradise. Ula'ula: Malie (the Game Corner deck) → Route 10 & Mount
Hokulani (**Sophocles**) → Routes 11–12 & Blush Mountain → Routes 13–14, Haina Desert & Tapu Village → Routes 15–16 &
the Thrifty Megamart (Acerola) → Route 17 & Po Town (Guzma, **Nanu**) → Aether Paradise (Faba, Guzma, Lusamine; the
Master Ball). Poni: Seafolk, Poni Wilds & Ancient Poni Path (**Mina**) → Exeggutor Island & Vast Poni Canyon
(**Hapu**) → Mount Lanakila (Gladion) → **the League** (Hala, Olivia, Acerola, Kahili, then Kukui) → Mount Lanakila II →
League II. After the league: Poni Gauntlet & the Battle Tree (**Blue** and **Red**), the Poké Pelago (catch-all).

**Teams** kept by the user's rule:

| Battle | Real roster | Kept |
|---|---|---|
| Hala (E4) | Hariyama, Primeape, Bewear, Poliwrath 54, Crabominable 55 | Hariyama, Bewear, Crabominable |
| Olivia (E4) | Relicanth, Carbink, Golem, Probopass 54, Lycanroc 55 | Probopass, Golem, Lycanroc |
| Acerola (E4) | Sableye, Drifblim, Dhelmise, Froslass 54, Palossand 55 | Froslass, Dhelmise, Palossand |
| Kahili | Skarmory, Crobat, Oricorio, Mandibuzz 54, Toucannon 55 | Skarmory, Oricorio, Toucannon |
| Kukui | Lycanroc 57, Ninetales, Braviary, Magnezone, Snorlax 56, his starter 58 | Ninetales, Snorlax, Lycanroc (starters never appear in trainer teams) |
| Hapu | Dugtrio, Gastrodon, Flygon 47, Mudsdale 48 | Gastrodon, Flygon, Mudsdale |
| Lusamine | Clefable, Lilligant, Mismagius, Milotic 47, Bewear 48 | Clefable, Milotic, Bewear |

**Species.** 88 rows from `liveDicePlan`, no overrides needed. The odd triggers: Type: Null → Silvally at Lv.45 (found
on Poni at 40–44), Poipole → Naganadel at Lv.60, Meltan → Melmetal at Lv.50; Charjabug and Crabrawler evolve with the
Thunder and the Ice Stone (the later games' rule, and the Ice Stone is found once on Mount Lanakila); Cosmog →
Cosmoem at 43 → Solgaleo **or** Lunala at 53, rolled like any branch. Jangmo-o's line is a pseudo-legendary line.

**Secret areas.** Alola's Pokédex: **359** catchable species.

| Area | Boss | Gate |
|---|---|---|
| The Lakes of the Sunne and Moone | Cosmog 40 | Aether Paradise · Pokédex **126** (35 %) · Lv.40 |
| The Ruins of the Guardians | Tapu Koko, Lele, Bulu, Fini 60 | league · **197** (55 %) · Lv.60 |
| Ultra Space: the Deep Sea & the Jungle | Nihilego, Buzzwole 60 | league · **197** · Lv.60 |
| Ultra Space: the Desert & the Plant | Pheromosa, Xurkitree 62 | the Deep Sea · **197** · Lv.62 |
| Ultra Space: the Crater & the Forest | Celesteela, Kartana 65 | the Desert · **197** · Lv.65 |
| Ultra Space: the Ruin | Guzzlord 70 | the Crater · **197** · Lv.70 |
| Poni Grove | Stakataka, Blacephalon 63 | league · **197** · Lv.63 |
| The Altar of the Sunne and Moone | Solgaleo, Lunala 65 | league · **251** (70 %) · Lv.65 |
| Ultra Megalopolis | Necrozma 70 | the Altar · **251** · Lv.70 |
| The Ultra Recon Squad | Poipole 55 | Ultra Megalopolis · **197** · Lv.55 |
| Magearna's Workshop | Magearna 65 | league · **305** (85 %) · Lv.65 |
| Ten Carat Hill's Farthest Hollow | Marshadow 67 | the Workshop · **305** · Lv.67 |
| The Blush Mountain Storm | Zeraora 70 | the Hollow · **305** · Lv.70 |
| The Mystery Box | Meltan 40 | the Storm · **305** · Lv.70 |

**Names.** PokeAPI has every Alola place name in all seven languages, Chinese included. The Z-Crystals' French,
Spanish, German and Italian names and the new trainer classes are written by hand and are best-effort.

**Balance**: two rounds on the four areas before Mount Lanakila (Po Town, Aether Paradise, Seafolk, Vast Poni), and a
fix to the simulator itself — see `06-REGION-BALANCE.md`.

---

## Galar (#810–905) — built

`scripts/content-galar.ts`, `pnpm seed-regions --from 810 --to 905` (the default). 20 areas on the chain, 4 side areas
after the league, 7 secret.

**Route.** Postwick, Route 1 & the Slumbering Weald → Wedgehurst & Route 2 → the Wild Area → Motostoke, Route 3 & the
Galar Mine (Bede; the Game Corner deck) → Route 4 & Turffield (**Milo**) → Route 5 & Hulbury (**Nessa**) → Galar Mine
No. 2 & Motostoke Stadium (**Kabu**) → Motostoke Outskirts & the Wild Area South → Hammerlocke & Route 6 (Cara Liss's
fossils) → Stow-on-Side (Allister, then **Bea**) → Glimwood Tangle & Ballonlea (**Opal**) → Routes 7 & 8 →
Steamdrift Way & Circhester (Melony, then **Gordie**) → Route 9 & Spikemuth (**Piers**) → Hammerlocke Hills & the Lake
of Outrage (**Raihan**) → Route 10 & Wyndon → Rose Tower & the Energy Plant (Oleana, Rose; the Master Ball) → **the
Champion Cup** (Marnie, Nessa, Bea, Raihan, then Leon) → the Wild Area II → the Champion Cup II. After the league: the
Isle of Armor, the Crown Tundra, the Max Lair (catch-all) and the Space-Time Rift.

**Version leaders, back to back.** Sword's and Shield's exclusive leaders are both fought, as Striaton's brothers
are: Allister then Bea (Fighting Badge), Melony then Gordie (Rock Badge). Galar's trainers are Galar's own classes —
Sword and Shield have no Ace Trainers or Veterans, so the strong ones are Macro Cosmos Clerks, Models and Hikers.

**Teams** kept by the user's rule:

| Battle | Real roster | Kept |
|---|---|---|
| Bea | Hitmontop, Pangoro 34, Sirfetch'd 35, Machamp 36 | Pangoro, Sirfetch'd, Machamp |
| Allister | Yamask, Mimikyu 34, Cursola 35, Gengar 36 | Mimikyu, Cursola, Gengar |
| Opal | Weezing, Mawile 36, Togekiss 37, Alcremie 38 | Weezing, Togekiss, Alcremie |
| Melony | Frosmoth 40, Darmanitan, Eiscue 41, Lapras 42 | Frosmoth, Eiscue, Lapras |
| Gordie | Barbaracle, Shuckle 40, Stonjourner 41, Coalossal 42 | Barbaracle, Stonjourner, Coalossal |
| Piers | Scrafty 44, Malamar, Skuntank 45, Obstagoon 46 | Malamar, Skuntank, Obstagoon |
| Raihan | Gigalith, Sandaconda 46, Flygon 47, Duraludon 48 | Sandaconda, Flygon, Duraludon |
| Rose | Escavalier, Ferrothorn, Perrserker, Klinklang 61, Copperajah 63 | Ferrothorn, Perrserker, Copperajah |
| Leon | Aegislash, Dragapult 62, Haxorus 63, Mr. Rime / Rhyperior / Seismitoad 64, Charizard 65 (his starter left out) | Dragapult, Mr. Rime, Charizard |

**Hisui.** Gen 8's range holds Hisui's seven (#899–905), and Sword and Shield have none of them nor Stantler or
Teddiursa. They come in through **the Space-Time Rift**, a side area the league opens: Legends: Arceus's Obsidian
Fieldlands, with the Black Augurite and the Peat Block found there once. Enamorus is its secret area beyond.

**Species.** 96 rows from `liveDicePlan`, plus Blipbug's line set as Wurmple's. The form evolutions of old species are
grafted on and stay inert outside Galar: Meowth → Perrserker (a 50/50 branch with Persian at 28), Farfetch'd →
Sirfetch'd (Lv.30), Mr. Mime → Mr. Rime (42), Corsola → Cursola (38), Yamask → Runerigus (34, a branch with
Cofagrigus), Linoone → Obstagoon (35), Stantler → Wyrdeer (30), Scyther → Kleavor (Black Augurite), Ursaring →
Ursaluna (Peat Block), Basculin → Basculegion (30), Sneasel → Sneasler (40; the Razor Claw stays Weavile's), Qwilfish
→ Overqwil (30). New items, all Galar-only: Tart Apple, Sweet Apple, Cracked Pot, Scroll of Darkness, Black Augurite,
Peat Block, and the four fossil pairs (Dracozolt, Arctozolt, Dracovish, Arctovish come only from them). Dreepy's line
is a pseudo line. PokeAPI has no Gen 8 item sprites: they come from pokesprite, and the three Hisui items borrow the
Dread Plate's, Hard Stone's and Damp Mulch's icons.

**Secret areas.** Galar's Pokédex: **314** catchable species.

| Area | Boss | Gate |
|---|---|---|
| The Energy Plant Summit | Eternatus 65 | league · Pokédex **220** (70 %) · Lv.65 |
| The Slumbering Weald's Depths | Zacian, Zamazenta 70 | the Summit · **220** · Lv.70 |
| The Master Dojo | Kubfu 55 | the Isle of Armor · **173** (55 %) · Lv.55 |
| The Split-Decision Ruins | Regieleki, Regidrago 65 | the Crown Tundra · **173** · Lv.65 |
| The Crown Shrine | Glastrier, Spectrier 75, Calyrex 80 | the Ruins · **220** · Lv.75 |
| The Forest of Focus | Zarude 70 | the Isle of Armor · **267** (85 %) · Lv.70 |
| The Crimson Mirelands | Enamorus 70 | the Space-Time Rift · **173** · Lv.70 |

**Names.** French and German place names from PokeAPI; the Chinese, Korean and Spanish town names checked against
search results (化朗镇, 펄롱마을, Pueblo Yarda…). **The Italian Galar place names could not be checked, so the Italian
column keeps the English ones**; the rest of the generic terms are written by hand and are best-effort.

**Balance**: in the envelope with one change (the Energy Plant back to one round) — see `06-REGION-BALANCE.md`.

---

## Paldea (#906–1025) — built

`scripts/content-paldea.ts`, `pnpm seed-regions --from 906 --to 1025` (the default). 20 areas on the chain, 3 side
areas after the league, 7 secret.

**Route.** Scarlet and Violet's three stories are open-world; here they are woven into one chain by their levels.
Cabo Poco, the Poco Path & the Inlet Grotto → Los Platos & South Province (Area One) → Mesagoza & South Province
(Area Two) (Nemona; the Game Corner deck) → South Province (Area Three) & Cortondo (**Katy**; Klawf) → South Province
(Area Six) & Artazon (**Brassius**) → West Province (Area One) & the Segin Squad's Base (Giacomo; Bombirdier) → East
Province (Areas One & Two) & Levincia (**Iono**) → the Schedar Squad's Base & East Province (Area Three) (Mela;
Orthworm; Charcadet's armors) → the Asado Desert & Cascarrafa (**Kofu**) → Tagtree Thicket & the Navi Squad's Base
(Atticus) → West Province (Area Two) & Medali (**Larry**) → the Dalizapa Passage & Montenevera (**Ryme**) → the
Alfornada Cavern & Alfornada (**Tulip**) → Glaseado Mountain (**Grusha**; the Ice Stone) → North Province (Area Three)
& the Ruchbah Squad's Base (Ortega) → North Province (Area Two) & the Caph Squad's Base (Eri; the Master Ball) →
Casseroya Lake (Dondozo and Tatsugiri) → **the Pokémon League** (Rika, Poppy, Larry, Hassel, Geeta, then Nemona) →
the Way Home (Arven, Penny) → Area Zero (the professor's AI). After the league: the Land of Kitakami, Blueberry
Academy & the BB League, and the Terarium (catch-all).

**Titans and Team Star.** The titans are wild Pokémon, so each sits in its own area's pool at its titan level, rare
(weight 2): Klawf 16, Bombirdier 20, Orthworm 29, Dondozo 56–57 with Tatsugiri. The Quaking Earth titan is a Great
Tusk or an Iron Treads; it is not put in the Lv.24–31 desert, where it would be a Lv.45 wall, and both are in Area
Zero. Team Star's five bosses fight as leaders without a badge (Striaton's precedent), so the eight gym badges still
take the foe upgrade level from 1 to 9; each ends on its squad's Starmobile, a Revavroom. Paldea's trainers are Gen 9
classes (Showdown has no student sprites): Team Star Grunts, Office Workers, Cooks, Cabbies, Waiters, Bodybuilders,
Dragon Tamers…

**Teams** kept by the user's rule (Gen 9 first, then the highest level):

| Battle | Real roster | Kept |
|---|---|---|
| Iono | Wattrel 23, Bellibolt 23, Luxio 23, Mismagius 24 | Wattrel, Bellibolt, Mismagius |
| Ryme | Banette 41, Mimikyu 41, Houndstone 41, Toxtricity 42 | Mimikyu, Houndstone, Toxtricity |
| Tulip | Farigiraf 44, Gardevoir 44, Espathra 44, Florges 45 | Farigiraf, Espathra, Florges |
| Grusha | Frosmoth 47, Beartic 47, Cetitan 47, Altaria 48 | Frosmoth, Cetitan, Altaria |
| Atticus | Skuntank 32, Muk 32, Revavroom 33, Navi Starmobile 32 | Muk, Revavroom, the Starmobile |
| Ortega | Azumarill, Wigglytuff, Dachsbun, Ruchbah Starmobile | Azumarill, Dachsbun, the Starmobile |
| Eri | Toxicroak 55, Passimian 55, Lucario 55, Annihilape 56, Caph Starmobile 56 | Lucario, Annihilape, the Starmobile |
| Rika | Whiscash, Camerupt, Donphan, Dugtrio 57, Clodsire 58 | Donphan, Camerupt, Clodsire |
| Poppy | Copperajah, Magnezone, Bronzong, Corviknight 58, Tinkaton 59 | Copperajah, Corviknight, Tinkaton |
| Larry (Elite Four) | Tropius, Oricorio, Altaria, Staraptor 59, Flamigo 60 | Altaria, Staraptor, Flamigo |
| Hassel | Noivern, Haxorus, Dragalge, Flapple 60, Baxcalibur 61 | Haxorus, Flapple, Baxcalibur |
| Geeta | Espathra, Gogoat, Veluza, Avalugg, Kingambit 61, Glimmora 62 | Espathra, Kingambit, Glimmora |
| Nemona | Lycanroc, Goodra, Dudunsparce, Orthworm, Pawmot 65, her starter 66 (left out) | Dudunsparce, Orthworm, Pawmot |
| Arven | Greedent 58, Cloyster 59, Scovillain 60, Toedscruel 61, Garganacl 62, Mabosstiff 63 | Toedscruel, Garganacl, Mabosstiff |
| Penny | Umbreon, Vaporeon, Jolteon, Flareon, Leafeon 62, Sylveon 63 | Umbreon, Vaporeon, Sylveon |
| Sada / Turo's AI | six paradox Pokémon each, 66–67 | Slither Wing, Flutter Mane, Roaring Moon / Iron Hands, Iron Moth, Iron Valiant |
| Kieran (Kitakami) | Shiftry 71, Probopass 71, Poliwrath, Yanmega, Dipplin 72, Gliscor 76 | Dipplin, Poliwrath, Gliscor |
| Crispin | Talonflame, Rotom, Exeggutor 77–78, Magmortar, Camerupt 78, Blaziken 79 | Camerupt, Magmortar, Blaziken |
| Amarys | Dugtrio, Skarmory 83, Empoleon, Scizor, Reuniclus 84, Metagross 85 | Empoleon, Scizor, Metagross |
| Lacey | Granbull, Whimsicott 78, Primarina, Slowbro, Alcremie 79, Excadrill 80 | Primarina, Alcremie, Excadrill |
| Drayton | Flygon, Dragonite 78, Sceptile, Haxorus, Kingdra 79, Archaludon 80 | Haxorus, Kingdra, Archaludon |
| Kieran (BB Champion) | Dragonite, Politoed 80, Porygon-Z, Grimmsnarl, Incineroar 81, Hydrapple 82 | Incineroar, Grimmsnarl, Hydrapple |

Katy, Brassius, Kofu, Larry, Giacomo and Mela have three or fewer and are kept whole. Where a source gave no level
for every member (Ortega's), the levels follow the battle's band (50–51). The two BB League levels are the games' as
the guides list them (Amarys's are a band above the others', as given).

**Species.** 120 rows from `liveDicePlan`; Frigibax's line is a pseudo line. Grafted onto old species and inert
outside Paldea: Primeape → Annihilape (Lv.35, Rage Fist), Wooper → Clodsire (Lv.20, a branch with Quagsire),
Girafarig → Farigiraf and Dunsparce → Dudunsparce (Lv.32, their moves), Bisharp → Kingambit (Lv.60), Applin → Dipplin
(Syrupy Apple), Duraludon → Archaludon (Metal Alloy). Gen 9's own odd triggers: Maushold at 25 (an in-battle level-up),
Gholdengo at 40, Hydrapple at 45, Pawmot, Brambleghast, Rabsca at the assigned Lv.30 (steps walked). New items, all
Paldea-only: Auspicious and Malicious Armor (East Province), Syrupy Apple and Unremarkable Teacup (Kitakami), Metal
Alloy (Blueberry Academy); the Ice Stone is found once on Glaseado Mountain for Cetitan. Neither PokeAPI nor pokesprite
has Gen 9 item sprites, so they borrow the Protector's, Reaper Cloth's, Sweet Apple's, Chipped Pot's and Metal Coat's.

**Wild pools.** PokeAPI has no Scarlet/Violet encounter tables, so every pool is written by hand from the games'
areas, at first-meeting levels, with base forms kept below their evolution level. The paradox Pokémon are all in Area
Zero, both versions' at once (Roaring Moon and Iron Valiant rarer); Kitakami's and the Terarium's species are in their
side areas. Every Gen 9 species, or the first stage of its line, has a home outside the Terarium (the test holds it).

**Secret areas.** Paldea's Pokédex: **352** catchable species.

| Area | Boss | Gate |
|---|---|---|
| The Zero Lab | Koraidon, Miraidon 72 | Area Zero · Pokédex **246** (70 %) · Lv.72 |
| The Shrines of Ruin | Wo-Chien, Chien-Pao, Ting-Lu, Chi-Yu 60 | league · **194** (55 %) · Lv.60 |
| Loyalty Plaza | Okidogi, Munkidori, Fezandipiti 70 | Kitakami · **194** · Lv.70 |
| Oni Mountain & the Crystal Pool | Ogerpon 70 | Loyalty Plaza · **194** · Lv.70 |
| The Paradox Sightings | Walking Wake, Iron Leaves, Gouging Fire, Raging Bolt, Iron Boulder, Iron Crown 75 | Blueberry Academy · **194** · Lv.75 |
| The Area Zero Underdepths | Terapagos 85 | Blueberry Academy · **246** · Lv.85 |
| Kitakami Hall | Pecharunt 88 | the Underdepths · **299** (85 %) · Lv.88 |

**Names.** French and German place names are PokeAPI's (Cuchalaga, Mesaledo, Levalendura…). Japanese place names are
written where known (テーブルシティ, ハッコウシティ, ナッペ山…); where a Japanese name was not known the row keeps the
best-known part and drops the rest. **Spanish, Italian and Portuguese keep the English place names, and Korean and
Chinese do too except for the region and the three Chinese towns the search confirmed (桌台市, 深钵镇, 酿光市)** —
the wikis that list them (Bulbapedia, 52poke, Serebii) are blocked from the sandbox. Character names: Japanese for
all; Korean for the gym leaders, Nemona, Arven and Penny; the rest keep the English name where it could not be
checked.

**Balance**: two rounds at Casseroya Lake, the last area before the league — see `06-REGION-BALANCE.md`.
