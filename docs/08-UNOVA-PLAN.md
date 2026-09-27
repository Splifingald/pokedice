# Pokédice — Generation 5 Plan (Unova)

> **Status: plan, approved 2026-09-27** (Black/White routing; the three Striaton leaders are fought back to back). Companion to `07-SINNOH-PLAN.md`, whose shape this follows step for step. Where the two differ,
> the difference is called out: new sprite sources, and **dice balanced on the live game's patterns instead of
> `dicePlan()`** (the user's instruction for this region).

The fifth region is **Unova, #494–649** (156 species), routed on **Black/White**. BW is the natural choice for this
game: its main story uses *only* Gen 5 Pokémon, so the region's Pokédex is exactly `dexRange` and is finishable without
borrowing. (B2W2 mixes in older species and rearranges the gyms; its sheets are still the sprite source — the art is
the same.)

Unova is content, not engineering, like Sinnoh: one more `content-unova.ts`, two sprite passes, a species run of
`seed-regions.ts`, and the `493`s raised to `649`. Gen 5 grafts **no** evolution onto an earlier generation, and every
Gen 5 stone evolution uses a stone the game already has.

---

## 0. What was found before planning

| Finding | Consequence |
|---|---|
| The sheets pasted in chat are **lossy WebP downscales** (≈1,200 colours in one 80px cell where a sprite has <16; the trainer sheet is 388px wide) | Not cut from. The **originals on The Spriters Resource download losslessly**: trainers `asset/48033` (1034×5332 PNG) and the four Pokémon sheets `asset/48088` front, `48084` back, `48089` front shiny, `48085` back shiny (768×2369 RGBA each, ≤16 colours per cell). They get committed under `graphics/`. |
| The live database was ahead of the repo (130 areas / 568 trainers against 128 / 560 on `main`) | Pulled with `pnpm pull-remote --write` before anything else; it is identical to the user's export bundle of 2026-09-27 (same row counts, same dice on all 493 species). |
| Sinnoh's live dice are **hand-tuned** — 64 of 107 species no longer match `dicePlan()` | That tuning is the pattern Unova follows (§3b). |
| **`pnpm sync` would revert that tuning.** It runs `seed-regions`, whose default range is 387–493, which regenerates Sinnoh's species rows and areas from the formula and `content-sinnoh.ts` | The default range moves to Unova's 494–649, so a re-run only ever rebuilds the region being added. Sinnoh becomes a kept region, exactly like Johto and Hoenn became when Sinnoh landed. |

---

## Step 1 — Sprites

### 1a. Pokémon #494–649

Source: the four B2W2 sheets (`graphics/pokemon/b2w2-{front,back,front-shiny,back-shiny}.png`). Geometry, decoded off
the files: **96×96 cells, 8 columns, 103px row pitch** (a 7px label strip under each cell, printing the dex number and
form suffix: `521-F`, `550-00`, `585-03`…), 23 rows = 184 slots. The four sheets share one layout, so one slot map
serves all four — front and front shiny from one pair, back and back shiny from the other. Transparent backgrounds
behind the art are flat colours per cell, taken by the existing `clearBackground()`.

A new path, `pnpm pokemon-sprites --unova`, next to `--fetch` and `--platinum`:

- **Slot map decoded from the labels**, like `PLATINUM_SLOTS`, one slot per dex: the male or `-00` form — Unfezant ♂,
  Red-Striped Basculin, Standard-mode Darmanitan, Spring Deerling / Sawsbuck, ♂ Frillish / Jellicent, Incarnate
  Tornadus / Thundurus / Landorus, plain Kyurem, Ordinary Keldeo, Aria Meloetta, plain Genesect. Self-check: 156
  labels, strictly increasing, 494→649, none missing.
- **96 → 64.** Same rule Gen 4 used for 80 → 64: trim the background, bottom-align in a 64×64 canvas, and give only the
  overflowers a nearest-neighbour downscale. Gen 5 art is bigger than Gen 4's, so more species overflow (Serperior,
  Emboar, the dragons, the legendaries) — acceptable, and it is what Gen 4 already does.
- **Box icons: the front sprite, for now** (the user's call — the sheets carry none). `mini_1` is the front trimmed to
  a square around the art, so the Pokémon fills its 32px menu slot instead of shrinking to half size; `mini_2` is the
  same image one art-pixel higher, so the menus still get the 0.3 s hop every other Pokémon has. When real icons
  turn up, only this step reruns.
- `--publish` as usual → `public/pokemon/494_*.png` … `649_*.png` (6 per species, 936 files) and
  `src/data/sprite-metrics.json` at 649 keys.

**Acceptance:** 936 new files, no halo of sheet colour, and in battle a Snivy, a Serperior and a Reshiram stand on
the platform, unclipped.

### 1b. Trainers

The B2W2 trainer sheet is a different animal from the HGSS/DPPt ones: **no labels**, and each block holds a trainer's
loose animation parts *plus one assembled figure* at its right edge (two for the pairs — Twins, Double Team). Blocks
are ~258×130 in a 4-column grid on flat per-block colours.

`region-trainers.ts` gains a `cutUnova()`:

1. find each block by its flat background colour;
2. inside a block, take the **tallest connected shape** (the assembled figure — the loose parts are all small) and
   centre it on an 80×80 canvas, bottom-aligned like the other regions;
3. name it through a hand-written `UNOVA` map (block index → sprite name), confirmed by eye against a contact sheet,
   which is how Sinnoh's class cells were checked.

Named characters: Cheren, Bianca, N, Ghetsis, the Striaton trio (Cilan, Chili, Cress), Lenora, Burgh, Elesa, Clay,
Skyla, Brycen, Drayden, Iris, the Elite Four (Shauntal, Grimsley, Caitlin, Marshal), Alder, the Seven Sages and the
Plasma grunts. Classes: the BW set (Ace Trainer, Backpacker, Baker, Battle Girl, Biker, Black Belt, Clerk, Cyclist,
Doctor, Fisherman, Harlequin, Hiker, Lady, Lass, Musician, Nurse, Nursery Aide, Parasol Lady, Pilot, Pokéfan, Pokémon
Breeder, Pokémon Ranger, Preschooler, Psychic, Rich Boy, Roughneck, School Kid, Scientist, Smasher, Socialite, Twins,
Waitress, Worker, Youngster…).

**Fallback**, for any named leader the B2W2 sheet turns out not to carry (it is B2W2's cast, where Cilan, Lenora,
Brycen and Alder are only guests): Pokémon Showdown hosts BW battle sprites by name (`cilan.png`, `lenora.png`,
`brycen.png`, `alder.png`, `n.png`, `ghetsis-gen5bw.png`, `plasmagrunt-gen5bw.png`… — verified reachable, 80×80).
Showdown has almost no Gen 5 *class* sprites, which is why it is the fallback and not the source.

`trainer-sprites.ts`: `SpriteRegion` gains `'unova'`, with `REGION_NAMED.unova` and `REGION_CLASSES.unova`.
Output to `public/trainers/classes/unova/`; a miss still ends at `/trainers/default.png`.

### 1c. Hilbert / Hilda as playable characters — *out of scope*, as Lucas and Dawn were.

---

## Step 2 — Species data for #494–649

`seed-regions.ts --from 494 --to 649`, which becomes the default. Species, types, stats, capture rates and chains
from the PokeAPI mirror; HP, speed and catch value from the existing helpers (unchanged — the user asked for dice and
evolutions to follow the game, and these already do).

### 2a. Evolutions

Canonical levels, as every region has them (the live data never moved a level: Ivysaur 32, Gabite 48, Chimchar 14…).
The existing trigger rules cover Gen 5 without new items:

| Trigger | Gen 5 cases | Becomes |
|---|---|---|
| Stone the game already has | Pansage/Pansear/Panpour (Leaf/Fire/Water), Munna (Moon), Minccino (Shiny), Cottonee/Petilil (Sun), Lampent (Dusk), Eelektrik (Thunder) | item evolution |
| Trade | Boldore → Gigalith, Gurdurr → Conkeldurr, Karrablast → Escavalier, Shelmet → Accelgor | Lv.34, the existing trade rule (Haunter, Machoke…) |
| Friendship | Woobat → Swoobat, Swadloon → Leavanny | Lv.30, the existing rule (Buneary, Riolu, Budew…) |

The stones get Unova in their descriptions and a `shopArea` in Unova, the way each region re-opens them.

### 2b. Fossils and legendaries

- `cover-fossil` → Tirtouga (564) and `plume-fossil` → Archen (566), revived at Lv.20 after 24 h, found once in the
  Relic Castle area; 564–567 join `FOSSIL_ONLY`.
- `LEGENDARY_CATCH` on the established bands: **7** Reshiram (643), Zekrom (644), Kyurem (646); **6** Cobalion,
  Terrakion, Virizion (638–640), Tornadus, Thundurus, Landorus (641, 642, 645); **5** the mythicals Victini (494),
  Keldeo (647), Meloetta (648), Genesect (649). All go into `LEGENDARIES`.

### 2c. Dice — the live game's patterns, not `dicePlan()`

`dicePlan()` gives a first stage 1 die, every 2-stage final `3 + [36, 50]`, every non-evolver `1 + [5, 20, 36, 50]`
and every legendary 5. The live game says otherwise. Read off Sinnoh (64 of 107 species retuned by hand) and checked
against Johto and Hoenn, which agree:

| Kind | Live pattern | Examples (live) |
|---|---|---|
| **Starter**, stage 1 | **2** main-type dice, no base | Turtwig, Chimchar, Piplup |
| Starter, stage 2 | 3 = 2 main + 1 base; the base **becomes the 2nd type at Lv.24** (main type if single) | Grotle 24 base→ground, Prinplup 24 base→water |
| Starter, stage 3 | 4, **no base** — 2 + 2 when dual-typed; **+1 die at Lv.50** | Torterra grass 2 · ground 2, Infernape fire 2 · fighting 2 |
| Weak stage 1 (BST < 300) | 1 die, a base die at **Lv.8** (Lv.6 when BST ≥ 260) | Starly, Bidoof, Kricketot, Shinx 6 |
| …that evolves late (≥ Lv.30) | plus a 3rd die around **Lv.21–22** | Chingling 8/22, Finneon 8/21, Bonsly 6/22 |
| 3-stage middle (non-starter) | 3 = main + 2nd type + base, base → 2nd type at **Lv.24** | Staravia, Luxio |
| 3-stage final | 4, no base when dual-typed, **+1 at Lv.50** | Staraptor, Luxray (3 + base: single type) |
| Stage 1 of a 2-stage line, BST ≥ 300 | **2** dice | Cherubi, Shellos, Cranidos |
| …evolving at Lv.26 or later | plus a 3rd die at **Lv.18–26**, roughly 10 below the evolution | Buizel 18 (evolves 26), Stunky 20 (34), Bronzor 24 (33), Skorupi 24 (40), Snover 25 (40) |
| 2-stage final | **3 + [36–40, 50]** — 36 for fast evolvers, 38–40 for late ones | Floatzel 37/50, Gastrodon 38/50, Honchkrow 40/50 |
| …strong (BST ≥ 490, or a slow evolver ≥ 480) | **4 + [50]** | Hippowdon, Drapion, Toxicroak, Abomasnow, Rampardos |
| …weak (BST < 430) | 2 + [20–26, 40] | Bibarel 26/40, Kricketune 20/40 |
| Pseudo-legendary line | 2 → 3 + [40] → 4 + [55] | Gible, Gabite, Garchomp |
| Non-evolver, BST ≥ 450 | 2 + [20–22, 40, 50] | Spiritomb 22/40/50 |
| Non-evolver, BST 400–450 | 2 + [20] (a 4th at ~40 if ≥ 440) | Pachirisu 21, Chatot 20, Carnivine 20/40 |
| Legendary trio | **5**, 3 main + 2 base | Uxie, Mesprit, Azelf |
| Box legendary / top mythical | **5 typed**, no base, no adds (3 + 2 when dual-typed) | Dialga steel 3 · dragon 2, Darkrai dark 5 |

Two more rules the tuning shows everywhere: **rerolls = dice on arrival**, +1 with every added die (as today); and
**added dice are typed** — a Lv.50 die is the main or second type, a base die only ever arrives early.

Implemented as `unovaDicePlan()` in `seed-regions.ts` — the table above as code, plus a short `UNOVA_OVERRIDES` list
for species the rules misread (a line whose BST sits on a band edge, a Magikarp-style joke Pokémon). It produces the full dice/milestone rows, including the `REPLACE_DIE` milestones `dicePlan()` never writes. **The
resulting 156-row table goes into this document at the end of Step 2**, so it can be read and argued with row by row
before the balance pass.

Gen 5 cases mapped onto the table:

| Line | Kind → plan |
|---|---|
| Snivy / Tepig / Oshawott lines | starter. Tepig's line is fire → fire/fighting, exactly Chimchar's: Pignite base → fighting at 24, Emboar fire 2 · fighting 2. Snivy's and Oshawott's stay single-typed, like Piplup's: Servine / Dewott base → main type at 24, Serperior / Samurott 3 main + 1 base |
| Patrat, Lillipup (3-stage), Purrloin, Pidove (3-stage), Sewaddle, Venipede, Tympole, Timburr, Roggenrola, Gothita, Solosis, Vanillite, Klink, Litwick, Tynamo, Joltik… | weak / normal lines per BST and evolution level |
| Axew → Fraxure → Haxorus, Deino → Zweilous → Hydreigon, Larvesta → Volcarona | pseudo-legendary (Deino starts at 1 + [8]: BST 300, evolves at 50) |
| Sigilyph, Audino, Throh, Sawk, Basculin, Maractus, Emolga, Alomomola, Cryogonal, Stunfisk, Druddigon, Bouffalant, Heatmor, Durant | non-evolvers by BST |
| Victini, Keldeo, Meloetta, Genesect | top mythical: 5 typed |
| Cobalion/Terrakion/Virizion, Tornadus/Thundurus/Landorus | trio: 5, 3 typed + 2 base |
| Reshiram, Zekrom, Kyurem | box: 5 typed |

### 2d. The resulting table

Generated by `liveDicePlan` (`scripts/dice-live.ts`): dice on arrival, then the level milestones (`+type` is a die and its reroll, `a→b` a die turning into another).

| # | Pokémon | Dice | Milestones | Evolves |
|---|---|---|---|---|
| 494 | Victini | psychic ×3, fire ×2 | — | — |
| 495 | Snivy | grass ×2 | — | Lv.17 → Servine |
| 496 | Servine | grass ×2, base | Lv.24 base→grass | Lv.36 → Serperior |
| 497 | Serperior | grass ×3, base | Lv.50 +grass | — |
| 498 | Tepig | fire ×2 | — | Lv.17 → Pignite |
| 499 | Pignite | fire ×2, base | Lv.24 base→fighting | Lv.36 → Emboar |
| 500 | Emboar | fire ×2, fighting ×2 | Lv.50 +fire | — |
| 501 | Oshawott | water ×2 | — | Lv.17 → Dewott |
| 502 | Dewott | water ×2, base | Lv.24 base→water | Lv.36 → Samurott |
| 503 | Samurott | water ×3, base | Lv.50 +water | — |
| 504 | Patrat | normal | Lv.8 +base, Lv.15 base→normal | Lv.20 → Watchog |
| 505 | Watchog | normal ×2 | Lv.26 +normal, Lv.40 +normal | — |
| 506 | Lillipup | normal | Lv.7 +base | Lv.16 → Herdier |
| 507 | Herdier | normal ×2, base | Lv.24 base→normal | Lv.32 → Stoutland |
| 508 | Stoutland | normal ×3, base | Lv.50 +normal | — |
| 509 | Purrloin | dark | Lv.6 +base, Lv.15 base→dark | Lv.20 → Liepard |
| 510 | Liepard | dark ×2, base | Lv.36 +dark | — |
| 511 | Pansage | grass ×2 | Lv.20 +base | leaf-stone → Simisage |
| 512 | Simisage | grass ×2, base | Lv.40 +grass, Lv.50 +grass | — |
| 513 | Pansear | fire ×2 | Lv.20 +base | fire-stone → Simisear |
| 514 | Simisear | fire ×2, base | Lv.40 +fire, Lv.50 +fire | — |
| 515 | Panpour | water ×2 | Lv.20 +base | water-stone → Simipour |
| 516 | Simipour | water ×2, base | Lv.40 +water, Lv.50 +water | — |
| 517 | Munna | psychic | Lv.6 +base, Lv.20 +psychic | moon-stone → Musharna |
| 518 | Musharna | psychic ×2, base | Lv.40 +psychic, Lv.50 +psychic | — |
| 519 | Pidove | normal | Lv.7 +base, Lv.16 base→flying | Lv.21 → Tranquill |
| 520 | Tranquill | normal, flying, base | Lv.25 base→flying | Lv.32 → Unfezant |
| 521 | Unfezant | normal ×2, flying ×2 | Lv.50 +normal | — |
| 522 | Blitzle | electric | Lv.6 +base, Lv.20 base→electric | Lv.27 → Zebstrika |
| 523 | Zebstrika | electric ×2, base | Lv.38 +electric, Lv.50 +electric | — |
| 524 | Roggenrola | rock | Lv.6 +base, Lv.20 base→rock | Lv.25 → Boldore |
| 525 | Boldore | rock ×2, base | Lv.29 base→rock | Lv.34 → Gigalith |
| 526 | Gigalith | rock ×3, base | Lv.50 +rock | — |
| 527 | Woobat | psychic, flying | Lv.18 +psychic | Lv.30 → Swoobat |
| 528 | Swoobat | psychic, flying | Lv.30 +psychic, Lv.40 +flying | — |
| 529 | Drilbur | ground ×2 | Lv.19 +base | Lv.31 → Excadrill |
| 530 | Excadrill | ground ×2, steel | Lv.38 +steel, Lv.50 +ground | — |
| 531 | Audino | normal ×2 | Lv.20 +normal, Lv.40 +normal | — |
| 532 | Timburr | fighting ×2 | — | Lv.25 → Gurdurr |
| 533 | Gurdurr | fighting ×2, base | Lv.29 base→fighting | Lv.34 → Conkeldurr |
| 534 | Conkeldurr | fighting ×3, base | Lv.50 +fighting | — |
| 535 | Tympole | water | Lv.6 +base, Lv.20 base→water | Lv.25 → Palpitoad |
| 536 | Palpitoad | water, ground, base | Lv.29 base→ground | Lv.36 → Seismitoad |
| 537 | Seismitoad | water ×2, ground ×2 | Lv.50 +water | — |
| 538 | Throh | fighting ×2 | Lv.24 +fighting, Lv.40 +base, Lv.50 +fighting | — |
| 539 | Sawk | fighting ×2 | Lv.24 +fighting, Lv.40 +base, Lv.50 +fighting | — |
| 540 | Sewaddle | bug, grass | — | Lv.20 → Swadloon |
| 541 | Swadloon | bug, grass, base | Lv.24 base→grass | Lv.30 → Leavanny |
| 542 | Leavanny | bug ×2, grass ×2 | Lv.50 +bug | — |
| 543 | Venipede | bug | Lv.7 +base, Lv.17 base→poison | Lv.22 → Whirlipede |
| 544 | Whirlipede | bug, poison, base | Lv.26 base→poison | Lv.30 → Scolipede |
| 545 | Scolipede | bug ×2, poison ×2 | Lv.50 +bug | — |
| 546 | Cottonee | grass | Lv.6 +base, Lv.20 +grass | sun-stone → Whimsicott |
| 547 | Whimsicott | grass ×2, fairy | Lv.40 +fairy, Lv.50 +grass | — |
| 548 | Petilil | grass | Lv.6 +base, Lv.20 +grass | sun-stone → Lilligant |
| 549 | Lilligant | grass ×2, base | Lv.40 +grass, Lv.50 +grass | — |
| 550 | Basculin | water ×2 | Lv.24 +water, Lv.40 +base, Lv.50 +water | — |
| 551 | Sandile | ground | Lv.6 +base, Lv.20 base→dark | Lv.29 → Krokorok |
| 552 | Krokorok | ground, dark, base | Lv.33 base→dark | Lv.40 → Krookodile |
| 553 | Krookodile | ground ×2, dark ×2 | Lv.50 +ground | — |
| 554 | Darumaka | fire ×2 | Lv.23 +base | Lv.35 → Darmanitan |
| 555 | Darmanitan | fire ×2, base | Lv.40 +fire, Lv.50 +fire | — |
| 556 | Maractus | grass ×2 | Lv.24 +grass, Lv.40 +base, Lv.50 +grass | — |
| 557 | Dwebble | bug, rock | Lv.22 +bug | Lv.34 → Crustle |
| 558 | Crustle | bug ×2, rock | Lv.38 +rock, Lv.50 +bug | — |
| 559 | Scraggy | dark, fighting | Lv.26 +dark | Lv.39 → Scrafty |
| 560 | Scrafty | dark ×2, fighting, base | Lv.50 +fighting | — |
| 561 | Sigilyph | psychic, flying | Lv.24 +flying, Lv.40 +base, Lv.50 +psychic | — |
| 562 | Yamask | ghost ×2 | Lv.22 +base | Lv.34 → Cofagrigus |
| 563 | Cofagrigus | ghost ×2, base | Lv.38 +ghost, Lv.50 +ghost | — |
| 564 | Tirtouga | water, rock | Lv.25 +water | Lv.37 → Carracosta |
| 565 | Carracosta | water ×2, rock, base | Lv.50 +rock | — |
| 566 | Archen | rock, flying | Lv.25 +rock | Lv.37 → Archeops |
| 567 | Archeops | rock ×2, flying ×2 | Lv.50 +flying | — |
| 568 | Trubbish | poison ×2 | Lv.24 +base | Lv.36 → Garbodor |
| 569 | Garbodor | poison ×2, base | Lv.40 +poison, Lv.50 +poison | — |
| 570 | Zorua | dark ×2 | Lv.18 +base | Lv.30 → Zoroark |
| 571 | Zoroark | dark ×2, base | Lv.38 +dark, Lv.50 +dark | — |
| 572 | Minccino | normal ×2 | Lv.20 +base | shiny-stone → Cinccino |
| 573 | Cinccino | normal ×2, base | Lv.40 +normal, Lv.50 +normal | — |
| 574 | Gothita | psychic | Lv.6 +base, Lv.22 +psychic | Lv.32 → Gothorita |
| 575 | Gothorita | psychic ×2, base | Lv.36 base→psychic | Lv.41 → Gothitelle |
| 576 | Gothitelle | psychic ×3, base | Lv.50 +psychic | — |
| 577 | Solosis | psychic | Lv.6 +base, Lv.22 +psychic | Lv.32 → Duosion |
| 578 | Duosion | psychic ×2, base | Lv.36 base→psychic | Lv.41 → Reuniclus |
| 579 | Reuniclus | psychic ×3, base | Lv.50 +psychic | — |
| 580 | Ducklett | water, flying | Lv.23 +water | Lv.35 → Swanna |
| 581 | Swanna | water ×2, flying | Lv.40 +flying, Lv.50 +water | — |
| 582 | Vanillite | ice ×2 | Lv.23 +base | Lv.35 → Vanillish |
| 583 | Vanillish | ice ×2, base | Lv.40 +ice | Lv.47 → Vanilluxe |
| 584 | Vanilluxe | ice ×4 | Lv.50 +ice | — |
| 585 | Deerling | normal, grass | Lv.22 +normal | Lv.34 → Sawsbuck |
| 586 | Sawsbuck | normal ×2, grass | Lv.38 +grass, Lv.50 +normal | — |
| 587 | Emolga | electric, flying | Lv.20 +electric | — |
| 588 | Karrablast | bug ×2 | Lv.22 +base | Lv.34 → Escavalier |
| 589 | Escavalier | bug ×2, steel | Lv.38 +steel, Lv.50 +bug | — |
| 590 | Foongus | grass | Lv.6 +base, Lv.28 +grass | Lv.39 → Amoonguss |
| 591 | Amoonguss | grass ×2, poison, base | Lv.50 +poison | — |
| 592 | Frillish | water, ghost | Lv.26 +water | Lv.40 → Jellicent |
| 593 | Jellicent | water ×2, ghost, base | Lv.50 +ghost | — |
| 594 | Alomomola | water ×2 | Lv.24 +water, Lv.40 +base, Lv.50 +water | — |
| 595 | Joltik | bug, electric | Lv.24 +bug | Lv.36 → Galvantula |
| 596 | Galvantula | bug ×2, electric | Lv.40 +electric, Lv.50 +bug | — |
| 597 | Ferroseed | grass, steel | Lv.26 +grass | Lv.40 → Ferrothorn |
| 598 | Ferrothorn | grass ×2, steel, base | Lv.50 +steel | — |
| 599 | Klink | steel ×2 | Lv.26 +base | Lv.38 → Klang |
| 600 | Klang | steel ×2, base | Lv.41 +steel | Lv.49 → Klinklang |
| 601 | Klinklang | steel ×3, base | Lv.50 +steel | — |
| 602 | Tynamo | electric | Lv.7 +base, Lv.28 +electric | Lv.39 → Eelektrik |
| 603 | Eelektrik | electric ×2, base | Lv.43 base→electric | thunder-stone → Eelektross |
| 604 | Eelektross | electric ×3, base | Lv.50 +electric | — |
| 605 | Elgyem | psychic ×2 | Lv.26 +base | Lv.42 → Beheeyem |
| 606 | Beheeyem | psychic ×3, base | Lv.50 +psychic | — |
| 607 | Litwick | ghost | Lv.7 +base, Lv.28 +ghost | Lv.41 → Lampent |
| 608 | Lampent | ghost, fire, base | Lv.45 base→fire | dusk-stone → Chandelure |
| 609 | Chandelure | ghost ×2, fire ×2 | Lv.50 +ghost | — |
| 610 | Axew | dragon ×2 | Lv.26 +base | Lv.38 → Fraxure |
| 611 | Fraxure | dragon ×3 | Lv.40 +dragon | Lv.48 → Haxorus |
| 612 | Haxorus | dragon ×4 | Lv.55 +dragon | — |
| 613 | Cubchoo | ice ×2 | Lv.25 +base | Lv.37 → Beartic |
| 614 | Beartic | ice ×3, base | Lv.50 +ice | — |
| 615 | Cryogonal | ice ×2 | Lv.24 +ice, Lv.40 +base, Lv.50 +ice | — |
| 616 | Shelmet | bug ×2 | Lv.22 +base | Lv.34 → Accelgor |
| 617 | Accelgor | bug ×2, base | Lv.38 +bug, Lv.50 +bug | — |
| 618 | Stunfisk | ground, electric | Lv.24 +electric, Lv.40 +base, Lv.50 +ground | — |
| 619 | Mienfoo | fighting ×2 | Lv.26 +base | Lv.50 → Mienshao |
| 620 | Mienshao | fighting ×3, base | Lv.50 +fighting | — |
| 621 | Druddigon | dragon ×2 | Lv.24 +dragon, Lv.40 +base, Lv.50 +dragon | — |
| 622 | Golett | ground, ghost | Lv.26 +ground | Lv.43 → Golurk |
| 623 | Golurk | ground ×2, ghost, base | Lv.50 +ghost | — |
| 624 | Pawniard | dark, steel | Lv.26 +dark | Lv.52 → Bisharp |
| 625 | Bisharp | dark ×2, steel, base | Lv.50 +steel | — |
| 626 | Bouffalant | normal ×2 | Lv.24 +normal, Lv.40 +base, Lv.50 +normal | — |
| 627 | Rufflet | normal, flying | Lv.26 +normal | Lv.54 → Braviary |
| 628 | Braviary | normal ×2, flying ×2 | Lv.50 +flying | — |
| 629 | Vullaby | dark, flying | Lv.26 +dark | Lv.54 → Mandibuzz |
| 630 | Mandibuzz | dark ×2, flying ×2 | Lv.50 +flying | — |
| 631 | Heatmor | fire ×2 | Lv.24 +fire, Lv.40 +base, Lv.50 +fire | — |
| 632 | Durant | bug, steel | Lv.24 +steel, Lv.40 +base, Lv.50 +bug | — |
| 633 | Deino | dark, dragon | Lv.26 +dark | Lv.50 → Zweilous |
| 634 | Zweilous | dark ×2, dragon | Lv.50 +dark | Lv.64 → Hydreigon |
| 635 | Hydreigon | dark ×2, dragon ×2 | Lv.55 +dark | — |
| 636 | Larvesta | bug, fire | Lv.26 +bug | Lv.59 → Volcarona |
| 637 | Volcarona | bug ×2, fire ×2 | Lv.50 +fire | — |
| 638 | Cobalion | steel ×2, fighting, base ×2 | — | — |
| 639 | Terrakion | rock ×2, fighting, base ×2 | — | — |
| 640 | Virizion | grass ×2, fighting, base ×2 | — | — |
| 641 | Tornadus | flying ×3, base ×2 | — | — |
| 642 | Thundurus | electric ×2, flying, base ×2 | — | — |
| 643 | Reshiram | dragon ×3, fire ×2 | — | — |
| 644 | Zekrom | dragon ×3, electric ×2 | — | — |
| 645 | Landorus | ground ×2, flying, base ×2 | — | — |
| 646 | Kyurem | dragon ×3, ice ×2 | — | — |
| 647 | Keldeo | water ×3, fighting ×2 | — | — |
| 648 | Meloetta | normal ×3, psychic ×2 | — | — |
| 649 | Genesect | bug ×3, steel ×2 | — | — |

---

## Step 3 — Region content: `scripts/content-unova.ts`

Same shape as `content-sinnoh.ts`: `AreaPlan[]` from `area()` and `DECK`, orderIndex **501+**, wild pools on BW's
routes (version exclusives merged), leaders and the Elite Four with their real top Pokémon, `enemyUpgradeLevel` 1 → 9
inside the region, first area at `minLevel ≤ 3`, at most two areas after the league, legendaries only as area bosses.
Banners and battle backgrounds from the existing sets — **no new art needed** (desert → `dunes`, Chargestone →
`crystal_cave`, Dragonspiral → `snow_mountains`, bridges → `bridge`).

Main chain, ~22 areas:

1. Route 1 & Nuvema Town → 2. Route 2 & Accumula Town → 3. Striaton City & the Dreamyard (**Cilan, Chili and Cress, all three in a row** — the user's choice; data only) →
4. Route 3 & Wellspring Cave → 5. Nacrene City & Pinwheel Forest (**Lenora**) → 6. Skyarrow Bridge & Castelia City
(**Burgh**) → 7. Route 4, the Desert Resort & Relic Castle (Cover / Plume Fossil) → 8. Nimbasa City & Route 5
(**Elesa**) → 9. Driftveil City & Route 6 (**Clay**) → 10. Chargestone Cave → 11. Mistralton City & Route 7
(**Skyla**) → 12. Celestial Tower → 13. Twist Mountain → 14. Icirrus City & the Moor of Icirrus (**Brycen**) →
15. Dragonspiral Tower → 16. Route 9 & Opelucid City (**Drayden**) → 17. Route 10 & Victory Road →
18. **The Pokémon League** (Shauntal, Grimsley, Caitlin, Marshal, then **N** and **Ghetsis** at N's Castle — BW's
story ends there, so they are the league's last two battles) → 19. Routes 11–14 & Undella Town (**Champion Alder**,
post-league) → 20. Black City & White Forest (catch-all, `DECK.endgame` — BW's two version-exclusive places, one area).

Secret areas, one boss each: Liberty Garden (Victini), Dragonspiral Tower's summit (Reshiram *and* Zekrom — versions
merged), the Giant Chasm (Kyurem), Mistralton Cave · Rumination Field · Trial Chamber (Cobalion, Virizion, Terrakion),
the Abundant Shrine (Tornadus, Thundurus, Landorus), the Moor's hidden spring (Keldeo), Castelia's café
(Meloetta), the P2 Laboratory (Genesect).

People: **Cheren and Bianca** recur as ordinary named trainers (the way Barry does — the `rivalOf` mechanism renames a
trainer to Red/Green, which is Kanto's rival, not Unova's). **Team Plasma** grunts through Pinwheel Forest, Castelia,
Relic Castle, Driftveil and Dragonspiral, the Sages as mini-bosses. Levels follow BW (Striaton 12–14 … Drayden 41–43,
Elite Four ~48–50, N 50–52, Ghetsis 52–54), then Step 6 tunes rounds the way Sinnoh's did.

`seed-regions.ts`: a fifth `REGION_PLANS` row (`id: 'unova'`, `orderIndex: 4`, `dexRange: [494, 649]`,
`starters: [495, 498, 501]`, `spriteRegion: 'unova'`, `leagueKey: 'un-pokemon-league'`), and `nextRegion` re-links
itself (Sinnoh → Unova) as it already does.

---

## Step 4 — The `493`s

| File | Change |
|---|---|
| `src/admin/schemas.ts:31,139` | `int(1, 493)` → `int(1, 649)` |
| `src/admin/sections/TableSections.tsx:237` | `max={493}` → `649` |
| `src/setup/SetupPage.tsx:62` | `pokemon: 649`, `regions: 5` |
| `package.json` `sync` | message says Unova; the range default protects Sinnoh |
| `tests/data.test.ts` | 649 rows, legendary list + 494, 638–649 |
| `tests/region-content.test.ts` | chains end `…, 'sinnoh', 'unova'` / `…, 'unova', null` |
| `tests/engine/daycare.test.ts` | a Unova egg case |
| `tests/admin-cheats.test.ts` | the "unknown region" case moves past `unova` |

No engine, store or screen change is expected — if one looks necessary, re-read `05-REGIONS-PLAN.md` §4 first.

## Step 5 — Names in four languages

`pnpm i18n:names` (already on the mirror) for `pokemon.494`…`649` and the two fossils; area and badge names
(Trio, Basic, Insect, Bolt, Quake, Jet, Freeze, Legend) written by hand in en/fr/es/de in `src/i18n/strings.csv`.

## Step 6 — Balance

`pnpm balance` / `pnpm balance table`, iterating on `content-unova.ts` numbers only, until Unova sits in the envelope
the other four do (chain wipes, turns a fight, encounters to the league — Sinnoh's first build needed one round per
area past the second). Results appended to `06-REGION-BALANCE.md`. Unova's known risks: Unova-only species means
**no easy early type coverage**, and gym 1 is three leaders of three types back to back — watch its wipe rate first, and three strong box
legendaries in the post-league.

## Step 7 — Ship

Regenerated `src/data/*.json` and `supabase/seed.sql` committed together with the scripts that made them; `pnpm test`,
`pnpm build`, `pnpm e2e`. Then one hand-over step for the user: run the new `supabase/seed.sql` in the SQL editor.

---

## Order of work

| # | Step | Shape |
|---|---|---|
| 1 | Pokémon sprites from the B2W2 sheets | decoded geometry, slot map from labels, 96→64 |
| 2 | Trainer sprites from the B2W2 sheet | shape detection + an eyeballed map, Showdown fallback |
| 3 | Species 494–649, fossils, dice on the live patterns | the dice table lands in this doc |
| 4 | `content-unova.ts` | the bulk of the typing |
| 5 | `493`s and tests | mechanical |
| 6 | Names ×4 languages | script + hand-written areas |
| 7 | Balance, report, seed.sql | iteration |

Each step lands as its own commit on `claude/gen5-unova`.
