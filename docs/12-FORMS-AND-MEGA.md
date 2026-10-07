# Pokédice — Forms and Mega Evolution

Content: `scripts/content-forms.ts`, written into the bundle by `pnpm seed-forms` (`scripts/seed-forms.ts`). Rules:
`src/engine/forms.ts` and the `MEGA` / `CHANGE_FORM` events of `src/engine/battle.ts`.

## 1. Forms are species rows

Every form is a row of `pokemon` numbered past the National Dex, with a `form` column saying what it is:

| Kind | Ids | `form` | Saved? |
|---|---|---|---|
| Regional (Alolan, Galarian, Hisuian, Paldean) — 57 | PokeAPI's (Alolan Rattata 10091) | `{ of: 19, kind: 'regional', region: 'alola' }` | yes: caught, levelled, evolved, in the Pokédex |
| Mega Evolution — 92 | PokeAPI's (Mega Venusaur 10033) | `{ of: 3, kind: 'mega' }` | no: battle only |
| Giratina's Origin Forme | 10007 | `{ of: 487, kind: 'battle', trigger: 'lowHp', swapDie: { from: 'ghost', to: 'dragon' } }` | no |
| Arceus's 17 types | 20001–20017 (PokeAPI has no pokemon id; sprite `493-<type>`) | `{ of: 493, kind: 'battle', trigger: 'choice' }` | no |

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

## 3. Mega Evolution

- **Unlocked** once the player has reached Kalos (started it, live or parked) — `megaEvolution.region` — and then in
  every region. No stone, no item.
- **Lv.50** (`megaEvolution.level`) for every Pokémon with a Mega form. The Pokémon sheet shows it on the levelling
  curve at Lv.50, with each Mega form and the die it adds, once the feature is unlocked.
- In battle, a **MEGA** button sits beside ITEM and SWITCH. One Mega Evolution per battle for the whole team
  (`megaEvolution.perBattle`). It doesn't take the turn; already thrown, the new die is thrown and joins the hand.
- With **several Mega forms** (Charizard, Mewtwo, Raichu X / Y), a prompt shows each one's sprite, name, types and the
  die it adds.
- **The die**: one die of the type the Mega gains (Charizard X: Dragon, Gyarados: Dark); when it gains none, the
  Pokémon's first type (Venusaur: Grass). It may take the Pokémon past `maxDice`.
- The Mega's types, name and sprite last until the battle ends; nothing is saved. Rewards and catches count the
  species sent out. Auto-mode Mega Evolves the first Pokémon that can, into its first form. Versus never does.

Left out: the female Meowstic, the droopy / stretchy Tatsugiri and the Original-Color Magearna Megas (one form of each
species in this game), and **Mega Zygarde**, which PokeAPI has no sprite for yet.

## 4. Battle forms

- **Giratina** (either side) takes its Origin Forme below half HP — one Ghost die becomes a Dragon die, new sprite —
  and returns to its Altered Forme at half or above. Checked after every HP change; a Giratina sent out below half
  starts in it.
- **Arceus** (yours) gets a **TYPE** button: a menu of the 17 other types (and Normal once it has changed). Its type
  and every die — base dice included, the hand already thrown too — become that type. `arceusChangesPerBattle` (2).
