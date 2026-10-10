# Pokédice — Forms and Mega Evolution

Content: `scripts/content-forms.ts`, written into the bundle by `pnpm seed-forms` (`scripts/seed-forms.ts`). Rules:
`src/engine/forms.ts` and the `MEGA` / `CHANGE_FORM` events of `src/engine/battle.ts`.

## 1. Forms are species rows

Every form is a row of `pokemon` numbered past the National Dex, with a `form` column saying what it is:

| Kind | Ids | `form` | Saved? |
|---|---|---|---|
| Regional (Alolan, Galarian, Hisuian, Paldean) — 57 | PokeAPI's (Alolan Rattata 10091) | `{ of: 19, kind: 'regional', region: 'alola' }` | yes: caught, levelled, evolved, in the Pokédex |
| Mega Evolution — 92, plus Primal Kyogre / Groudon and Ultra Necrozma | PokeAPI's (Mega Venusaur 10033) | `{ of: 3, kind: 'mega' }`, `mechanic: 'primal' \| 'ultra'` | no: battle only |
| Gigantamax — 32 | PokeAPI's (Gigantamax Charizard 10196) | `{ of: 6, kind: 'gmax' }` | no |
| Below half HP — Giratina, Darmanitan (both), Zygarde, Wishiwashi, Minior | PokeAPI's (Origin Giratina 10007) | `{ of: 487, kind: 'battle', trigger: 'lowHp', swapDie: { from: 'ghost', to: 'dragon' } }` | no |
| Type menu — Arceus ×17, Silvally ×17, Ogerpon's 3 masks | 20001+, 20101+ (no PokeAPI pokemon id; sprites `493-<type>`, `773-<type>`), Ogerpon's PokeAPI's | `{ of: 493, kind: 'battle', trigger: 'choice' }` | no |

PokeAPI's ids keep the sprites (`/pokemon/10091_front.png`) and the names (`pokemon.10091` in `strings.csv`) lined up
with the source. A form shows its species' number (`#019`) and sits right after it on the Pokédex page.

**Sprites** come from PokeAPI's BW-style folder like Gen 6–9's, but **uncut**: the 96×96 canvas is kept as drawn
(`pnpm pokemon-sprites --fetch-forms`), and `sprite-metrics.json` records its `size` and art box. The views scale it:
the battle scene stands it at the same pixel scale as every other sprite (shrinking only art over 80 px), and every
other view centres the art in its box, shrinking only art wider than 64 px.

## 2. Regional forms

A regional form keeps its species' dice schedule (the admin's tuning) on its own types: first type for first type,
second for second, and a dual-typed form of a single-typed species (Alolan Raichu) gets its second type on its second
typed die. HP and speed come from its own stats where they differ; catch value is the species'.

**Where they are caught** — the first stage of every line is in a wild pool of its region:

| Region | Forms | Where |
|---|---|---|
| Alola | Rattata, Sandshrew, Vulpix, Diglett, Meowth, Geodude, Grimer, Exeggutor and their lines | replace the plain species in Alola's pools (as in Sun and Moon); Pikachu, Exeggcute and Cubone evolve into Alolan Raichu, Exeggutor and Marowak there |
| Galar | Meowth, Ponyta, Slowpoke, Farfetch'd, Mr. Mime, Corsola, Zigzagoon, Darumaka, Yamask, Stunfisk | replace the plain species in Galar's pools; Koffing and Mime Jr. evolve into Galarian Weezing and Mr. Mime there; Galarian Slowpoke on the Isle of Armor with the Galarica Cuff and Wreath |
| Galar — legendary birds | Galarian Articuno, Zapdos, Moltres | **Dyna Tree Hill**, a new secret area after the Crown Tundra (Pokédex 173, Lv.70) |
| Hisui (Galar's Space-Time Rift) | Growlithe, Voltorb, Qwilfish, Sneasel, Zorua; Cyndaquil, Oshawott, Rowlet, Petilil, Rufflet, Goomy, Bergmite | the Rift; Quilava, Dewott, Dartrix, Petilil (Sun Stone, found there), Rufflet and Goomy evolve into the Hisuian forms in Galar, Bergmite into either Avalugg |
| Paldea | Wooper; Tauros's three breeds | Area One (Wooper), Area Two (the breeds, the plain Tauros at weight 0), the Terarium (all, beside the plain ones, plus Hisuian Sneasel so Sneasler stays reachable) |

The catch-all areas (the Poké Pelago, the Max Lair, the Terarium) keep their plain species and add the forms.

**Evolutions.** `Evolution.region` makes an evolution happen only in that region and `Evolution.notInRegion` keeps the
one it stands in for out of it: Pikachu + Thunder Stone is Alolan Raichu in Alola, Raichu anywhere else. The Gen 8–9
evolutions that used to be grafted onto plain species now start from the form, as in the games: Galarian Meowth →
Perrserker, Galarian Farfetch'd → Sirfetch'd, Galarian Mr. Mime → Mr. Rime, Galarian Corsola → Cursola, Galarian
Linoone → Obstagoon, Galarian Yamask → Runerigus, Hisuian Qwilfish → Overqwil, Hisuian Sneasel → Sneasler, Paldean
Wooper → Clodsire. Trainers of Alola, Galar and Paldea use the forms their games give them (Nanu's Persian, Olivia's
Golem, Kukui's Ninetales, Hau's Raichu, Opal's Weezing, Bede's Rapidash, Klara's Slowbro, Avery's Slowking…).

## 3. Mega Evolution, Primal Reversion, Ultra Burst

- **Unlocked** once the player has reached Kalos (started it, live or parked) — `megaEvolution.region` — and then in
  every region. No stone, no item.
- **Lv.50** (`megaEvolution.level`) for every Pokémon with a Mega form. The Pokémon sheet shows it on the levelling
  curve at Lv.50, with each Mega form and the die it adds, once the feature is unlocked.
- In battle, a **MEGA** button sits beside ITEM and SWITCH (**PRIMAL** for Kyogre and Groudon, **ULTRA BURST** for
  Necrozma — the same rules). One per battle for the whole team (`megaEvolution.perBattle`), **shared with
  Gigantamax**. It doesn't take the turn; already thrown, the new die is thrown and joins the hand.
- With **several Mega forms** (Charizard, Mewtwo, Raichu X / Y), a prompt shows each one's sprite, name, types and the
  die it adds.
- **The die**: one die of the type the Mega gains (Charizard X: Dragon, Gyarados: Dark); when it gains none, the
  Pokémon's first type (Venusaur: Grass).
- The Mega's types, name and sprite last until the battle ends; nothing is saved. Rewards and catches count the
  species sent out.

Left out: the female Meowstic, the droopy / stretchy Tatsugiri and the Original-Color Magearna Megas (one form of each
species in this game), and **Mega Zygarde**, which PokeAPI has no sprite for yet.

## 4. Gigantamax

- **Unlocked** once the player has reached Galar (`gigantamax.region`), then everywhere; no level.
- A **G-MAX** button beside MEGA: the Gigantamax look and +1 die of the Pokémon's first type for **its next turn**
  (`gigantamax.turns`), then it shrinks back — or when it leaves the field. **Never in the same battle as a Mega**: the
  two share the one per battle.
- The Pokémon sheet says so under the curve, once Galar is reached. 32 forms (the low-key Toxtricity and Rapid Strike
  Urshifu ones are left out, as one form of each is in this game).

## 5. Battle forms

- **Below half HP** — Giratina (Origin Forme: Ghost → Dragon), Darmanitan (Zen Mode: Fire → Psychic; the Galarian one
  Ice → Fire), Zygarde (Complete: Ground → Dragon), Wishiwashi (School: a base die → Water), Minior (Core: Rock →
  Flying): either side, one die swapping type and a new sprite, back at half HP or above. Checked after every HP change;
  sent out below half, it starts in the form. A Mega or Gigantamax Pokémon keeps that look instead.
- **TYPE menu** — Arceus (17 Plates), Silvally (17 Memories) and Ogerpon (3 masks): its type and every die — base dice
  included, the hand already thrown too — become the type (an Ogerpon mask's: Water, Fire, Rock). **Once per battle**
  (`formChangesPerBattle`) for each Pokémon: an Arceus and a Silvally on one team change once each.

## 6. Trainers, and auto battles

- **Foes use them too** where the games did, and never before the player has the mechanic (`enemyPlanFor`):
  - a Gym Leader's, Elite Four member's or Champion's **ace** (its highest level, the last of them if tied) Mega
    Evolves on its first turn in **Hoenn, Kalos and Alola** (`megaEvolution.trainerRegions` / `trainerRoles`) — at
    Lv.50, like yours, so in practice from the Elite Four on — and Gigantamaxes in **Galar**
    (`gigantamax.trainerRegions`);
  - a foe Arceus, Silvally or Ogerpon — a legendary boss or a trainer's — takes the type that hits your Pokémon
    hardest, once, when that beats every type it rolls;
  - the below-half-HP forms work for both sides.
- **Auto battles** (auto-mode in a cleared area, Versus) have none of these on either side, except the below-half-HP
  forms, which are not a choice — and, in auto-mode, the Arceus, Silvally and Ogerpon of both sides: at the start of its
  turn each takes the type that hits the other side hardest, when that beats every type it rolls now (at random among
  equally good ones), within its `formChangesPerBattle`.
