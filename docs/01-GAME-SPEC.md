# Pokédice — Game Design Specification

**Version:** 1.6 · **Author:** Grégoire · **Status:** built · v1.2 added the Grass Heal face, Multi EXP and starters in the catch-all pool; v1.3 added full Kanto, gyms, secret areas, area type insights and the in-game help; v1.4 added encounter decks, easy areas, and HP-based pacing (damage is exactly the dice); v1.5 added item finds with loot decks, the classic items, one-item-per-turn battles, dice-based catching with Poké Balls, and Pokédollars (₽); v1.6 doubled Pokémon XP (`xpMultiplier`), rolls the dice automatically at the start of each turn, allows a voluntary switch after the roll, and reworked the UI (side / bottom bar, encounter pop-up, Pokédex "where to find it")
**Nature:** personal, non-commercial fan project. No monetisation; Nintendo assets are referenced as public sprite URLs, never redistributed.

This document is the single source of truth for *rules*. `02-DATA-MODEL.md` covers storage and seeding, `03-BUILD-PLAN.md` covers implementation.

---

## 1. Core loop

```
New game  →  choose a starter (Bulbasaur / Charmander / Squirtle, Lv.5)
Map       →  pick an unlocked Area
             └─ Area runs a chain of weighted Encounters, each previewed before you commit
                  ├─ Wild Pokémon    → battle → catch throw (d6 + ball ≥ catch value)
                  ├─ Trainer         → 1–3 battles in a row → Pokédollars
                  ├─ Pokémon Center  → full heal + team swap
                  ├─ Legendary boss  → fixed, once, challenged when the gauge is full
                  └─ Item find       → an item or Pokédollars from the area's loot deck
             └─ XP from every K.O. fills the Area Gauge
             └─ Gauge full → next Area unlocked
₽         →  Upgrade menu (dice + combos, account-wide) and the Poké Mart (stock grows with badges)
Goal      →  clear the areas, then 151/151 in the Pokédex
```

### 1.1 Encounter chain

- Each area defines weights for `wild`, `trainer`, `center`, `item`.
- **Encounter deck** (`game_config.encounterMode = 'deck'`, the default): an area's weight for each kind **is the number of copies of that card in its deck** (v1.6 — e.g. wild 8, Center 1, item 1 is a 10-card deck); kinds the area can't produce (no wild pool / no trainers / no loot) get none. The deck is shuffled, one card is drawn per encounter, and what's left is saved per area; a fresh deck is dealt when it runs out. Every deck therefore holds the area's exact mix, and a Center is never more than 18 encounters away with the bundled 10-card decks. With `encounterMode = 'random'` each encounter is rolled independently from the weights instead (at 10 % Centers, 1 run in 100 goes 43+ encounters without one).
- Forced encounters — the entry Center, an easy-area Center and dev-tool picks — and the challenges the player chooses (gym battles and due legendaries, taken with CHALLENGE / FACE IT on the area screen, or put off with NOT YET) come on top of the deck and use no card. A skipped encounter has used its card.
- **Rounds** (v1.6): going through an area's whole deck is a **round**; the next round deals a fresh, shuffled deck. Every round **opens with a Pokémon Center**, outside the deck (the Center cards inside it still count), unless it would do nothing — every Pokémon, team and Box, at full HP and nobody in the Box to swap in. The area screen's **round gauge** shows one segment per card, with an icon for each encounter already met this round and blanks for what's to come (`game_config.showRoundGauge` hides it). `AreaProgress.round` counts rounds; `drawn` holds the cards met this round; `roundStartXp` is the gauge when it began. A wipe loses the round (§6.4).
- **Forced Center:** the *first* encounter on entering an area is a **Pokémon Center** if and only if at least one team member is below full HP. Otherwise it is drawn normally.
- **Easy areas** (`easyMode`, set per area in admin): whenever a team member is at 0 HP, the next encounter is a Center.
- **Preview before commit.** Every rolled encounter is first shown in a pop-up — wild: sprite, name, level, types, and whether it is a new catch; trainer: name, sprite, and the team size with levels — with the team to pick a lead from. The player then chooses:
  - **FIGHT** — start it.
  - **FLEE** (a wild Pokémon) / **AVOID** (an ordinary trainer) — discard it and roll a different encounter before the battle starts. Free. Not available for the Pokémon Center, a gym battle or a legendary boss.
  - `game_config.skipPolicy` (`'free'` | `'once'` | `'none'`, default `'free'`) exists because free unlimited skipping lets a player fish for ideal matchups. If playtesting shows that's a problem, switch it to `'once'` (one skip per encounter, the second roll is committed).
- **RUN** is additionally available *inside* a wild battle: it ends the encounter immediately with no XP, no Pokédollars, no catch, and rolls the next encounter. Damage taken is kept. Trainer battles and legendary bosses cannot be fled.
- The chain is endless — the player continues until the gauge fills or they leave via the Map.
- Map, Team, Shop, Upgrades, Pokédex and Settings are reachable **between** encounters at any time.

### 1.2 Starting the game

Title → a short intro → pick one of **Bulbasaur, Charmander, Squirtle at level 5**. It goes straight into the team (slots 2 and 3 empty). The chosen starter is marked caught in the Pokédex; the other two are catchable as **rare** encounters in **Cerulean Cave** only (the post-game secret area — added so 151/151 is reachable). They appear in no other pool and in no trainer team.

---

## 2. Battle

### 2.1 Setup

- Player team = up to **3 active Pokémon**. Before each fight the player picks which one to send.
- **Speed** (real base Speed stat) decides who acts first. Tie → player.
- Each Pokémon enters with a **reroll budget = its `rerolls` stat**, spent over the whole battle, not per turn.

### 2.2 A turn

1. **Status tick** — damage-over-time on the acting Pokémon resolves first (Burn, Poison). A K.O. here ends the turn.
2. **Stun check** — if Frozen- or Paralyze-stunned, the turn is skipped and the stun counter decrements.
3. **Roll** — all of the Pokémon's dice are thrown. The game throws them for the player as the turn starts (v1.6):
   items, a voluntary switch and RUN all stay available after the roll. A stunned Pokémon with no item that could help
   skips its turn on its own.
4. **Reroll phase** — the player taps dice to select them and presses REROLL: selected dice are rethrown, unselected are kept. **One press = one reroll spent**, however many dice were selected. Repeat until the budget is empty or the player presses ATTACK. The AI does the same thing internally (§8).
5. **Resolve** — §2.3.
6. **Apply status faces** — §3.2.
7. Turn passes.

A Pokémon at 0 HP faints. Player side: if another active Pokémon is alive, the player picks a replacement — free, does not cost a turn. If all 3 are down → **wipe**, §6.4.

### 2.3 Damage formula

Damage is computed **per die**, because dice carry their own type.

```
dieDamage(d)   = (faceValue(d) + dieUpgradeBonus(d.type)) × typeMultiplier(d.type, defender)
comboDamage    = comboBonus(bestCombo) × typeMultiplier(majorityDieType, defender)
rawDamage      = Σ dieDamage(d) + comboDamage
finalDamage    = max(1, round(rawDamage))
```

- `faceValue` — the rolled face's number. Status faces use their **fallback value** (§3.1).
- `dieUpgradeBonus` — account-wide die track (§5.2), applied **per die, before** the type multiplier. **Base dice have no track and always contribute +0.**
- `typeMultiplier` — Gen 6+ 18-type chart, product over the defender's types: `mult(atk,def1) × mult(atk,def2)` ∈ `{0, 0.25, 0.5, 1, 2, 4}`. A die the defender is immune to contributes **0**.
- `majorityDieType` — the type most represented among the dice in this roll. **Base dice never count as the majority type.** Ties break to: Type 1, then Type 2, then the type of the highest-value die. If the Pokémon rolled only base dice, the combo bonus is untyped (×1).
- **No global multiplier.** What the dice show (after upgrades and type) is what hits — never a hidden scale on the result (v1.4 removed the old `damageScale` knob). Fight length is tuned through HP instead: `hpMultiplier` (§4, default 1.4, admin-editable), plus dice counts and the upgrade tracks.
- Floored at 1, *unless* every die multiplier was 0 — then damage is 0 and the UI says "It doesn't affect [name]…".

**There is deliberately no level term in the damage formula.** A Pokémon's raw output comes only from its dice; the player's damage growth comes from the **upgrade tracks**. Levels give HP, which means an un-upgraded player's fights get steadily *longer* as they progress, and buying upgrades is what pulls them back. That tension is the economy.

**Verified by simulation** — turns to kill in a neutral mirror match, by how far the player has pushed both upgrade tracks (2500 rolls per cell, greedy reroll AI, HP at `hpMultiplier` 1 — at the default 1.4 every HP and turn count is ~1.4× larger):

| Matchup | HP | track 1 | track 3 | track 5 | track 7 | track 10 |
|---|---|---|---|---|---|---|
| Charmander L5 (2 dice) | 20 | 2.3 | 1.8 | 1.4 | 1.1 | 0.8 |
| Charmeleon L20 (3 dice) | 59 | 4.0 | 2.9 | 2.2 | 1.6 | 1.1 |
| Charizard L40 (5 dice) | 124 | 4.1 | 3.1 | 2.4 | 1.8 | 1.3 |
| Charizard L60 | 182 | 6.0 | 4.5 | 3.6 | 2.7 | 1.9 |
| Snorlax L50 (5 dice) | 235 | 7.4 | 5.5 | 4.3 | 3.3 | 2.4 |
| Mewtwo L80 (6 dice) | 284 | 7.5 | 5.3 | 4.2 | 3.1 | 2.2 |

Read the diagonal: staying in a healthy **3–5 turn** band means being around track level 1 in the first areas, 3–5 by the mid game, and 7 by the end. **The gold payout rate is what has to deliver that pace** — that is the number to tune in Phase 10, not the damage formula. If late fights drag, trainers are not paying enough; if everything dies in one turn, they are paying too much.

The UI shows the big total; tap/hover reveals the per-die breakdown (`4 FIRE ×2 = 8`).

### 2.4 Combos

Evaluated over the full dice set, using fallback values for status faces.

| Key | Name | Condition | Bonus L1 | Per level |
|---|---|---|---|---|
| `pair` | Pair | 2 dice equal | +2 | +1 |
| `two_pair` | Two Pair | two distinct pairs | +5 | +1 |
| `three_kind` | Three of a Kind | 3 dice equal | +6 | +2 |
| `small_straight` | Small Straight | 4 consecutive values | +8 | +2 |
| `full_house` | Full House | 3 equal + 2 equal | +10 | +3 |
| `four_kind` | Four of a Kind | 4 dice equal | +14 | +3 |
| `full_straight` | Full Straight | 5 consecutive values | +18 | +4 |
| `five_kind` | Five of a Kind | 5 dice equal | +25 | +5 |

**Payout rule — highest *damage*, not highest rank.** Every combo present in the roll is detected, each one's current damage is computed (its upgrade level **and** the majority-type multiplier), and the **single most damaging** one pays. This is deliberate: a player who has taken Pair to level 9 and left Two Pair at level 1 should see their Pair fire.

One combo pays per roll. Straights are scanned over the **distinct sorted face values**, so duplicates don't break them and non-1..6 values participate (`4-5-6-7` is a valid small straight; Ghost's 0 and Ground's 8 can extend runs).

---

## 3. Dice

Every Pokémon owns 2–6 dice. Two categories:

- **Base die** — the plain filler die, faces `1,2,3,4,5,6`. It has **no upgrade track and can never be upgraded**, and it never counts toward the majority type. Off-white with grey pips.
- **Typed dice** — one per type, 18 of them (Normal included). Each has its own 10-level upgrade track and its own colour.

### 3.1 Die faces

| Type | Faces | Avg | Notes |
|---|---|---|---|
| **Base** | 1, 2, 3, 4, 5, 6 | 3.50 | filler, **not upgradeable**, off-white `#f7f2e0` |
| Normal | 1, 2, 3, 4, 5, 6 | 3.50 | same faces as Base but **fully upgradeable**, warm tan `#c8b88a` |
| Water | 2, 3, 3, 4, 4, 5 | 3.50 | low variance |
| Fire | **Burn**, 2, 3, 4, 5, 6 | 3.50 | Burn value 1 |
| Grass | 1, 2, **Heal**, 4, 5, 6 | 3.50 | Heal value 3 (v1.2) |
| Ice | **Frozen**, 2, 3, 4, 5, 6 | 3.50 | Frozen value 1 |
| Electric | 1, 2, 3, **Paralyze**, 5, 6 | 3.50 | Paralyze value 4 |
| Bug | 1, 1, 1, 4, 4, 4 | 2.50 | triples machine |
| Ghost | 0, 0, 3, 5, 6, 7 | 3.50 | high variance |
| Psychic | 1, 2, 3, 4, 5, **Confuse** | 2.83 | Confuse value 2 |
| Dark | 1, 1, 3, 4, 5, 7 | 3.50 | |
| Fairy | 0, 2, 2, 4, 4, 6 | 3.00 | |
| Steel | 3, 3, 3, 4, 4, 4 | 3.50 | guaranteed combo fodder |
| Rock | 2, 2, 2, 4, 5, 6 | 3.50 | |
| Ground | 0, 1, 1, 4, 4, 8 | 3.00 | boom or bust |
| Fighting | 2, 3, 4, 5, 6, 7 | 4.50 | |
| Flying | 1, 2, 3, 4, 4, 7 | 3.50 | |
| Poison | **Poison**, 2, 3, 4, 5, 6 | 3.50 | Poison value 1 |
| **Dragon** | 2, 3, 4, 5, 6, 8 | 4.67 | strongest die in the game, no status |

All face lists are data, editable in admin.

> **Why the Base/Normal split:** mono-Normal Pokémon (Snorlax, Chansey, Tauros, Ditto, Eevee, Porygon, Kangaskhan, Lickitung, Meowth, Rattata) receive **Normal-type** dice from the composition algorithm, which have a full upgrade curve — so they are not trapped on an unupgradeable set. The Base die is only ever filler.

### 3.2 Status effects

All statuses **clear when the battle ends**. HP damage persists (§6).

| Status | Trigger | Effect | Stacking |
|---|---|---|---|
| **Burn** | ≥1 Burn face | 1 damage per stack at the start of the victim's turn, 3 turns | **Stacks.** 3 Burn faces in one roll = 3 stacks. Duration refreshes. |
| **Poison** | **≥2** Poison faces | 3 damage at the start of the victim's turn, 3 turns | **Does not stack.** Re-applying only refreshes the duration. Below the threshold the face is worth 1. |
| **Frozen** | **≥3** Frozen faces in one roll | victim stunned 2 turns | Refreshes, doesn't stack. Below threshold the face is worth 1. |
| **Paralyze** | **≥2** Paralyze faces | victim stunned 1 turn | Refreshes. Below threshold the face is worth 4. |
| **Confuse** | **≥2** Confuse faces | the victim's **next attack** is dealt to itself (full damage, multipliers computed against itself), then confusion clears | Refreshes. Below threshold the face is worth 2. |
| **Heal** | **≥2** Heal faces | a *self*-effect: the **attacker** heals HP equal to the total value of the dice rolled (fallbacks included, no upgrades/multipliers), on top of the damage it deals; capped at max HP. `status.heal.amount = 'healFaces'` heals only the Heal faces' values instead | Nothing to stack. Below threshold the face is worth 3. Does not trigger on a confused self-hit. |

- DoT ticks at the **start of the victim's turn**, before the stun check, and can K.O.
- A stunned Pokémon still ticks DoT and still burns down its stun counter.
- Confusion and stun can coexist; stun resolves first and the skipped turn does **not** consume the confusion.

### 3.3 Dice composition

Each Pokémon's set is a list of `{type, count}` where `type` may be `base` or any of the 18 types. Generation for all 151 is in `02-DATA-MODEL.md` §3.4.

---

## 4. Pokémon & progression

### 4.1 Stats

| Field | Source |
|---|---|
| Dex no., Name, Type 1, Type 2 | PokeAPI |
| Base HP | real HP stat at **level 1** |
| Max HP | real HP stat at **level 100** |
| Speed | real base Speed stat |
| Sprite | `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{dex}.png` |
| Dice | generated, editable |
| Rerolls | generated = dice count, editable |
| Evolutions | `[{toDex, level}]`; **multiple entries → the target is rolled at random** |
| Milestones | `[{level, effect}]` |

**HP at level L** = `round((baseHp + (maxHp − baseHp) × (L − 1) / 99 + milestone +HP) × hpMultiplier)`. `hpMultiplier` (game_config, default 1.4, admin-editable) is the fight-length knob: HP is what gets scaled, never damage. When it changes, every saved Pokémon keeps its HP %.

### 4.2 Level milestones

Every level raises HP by the interpolation above. Specific levels additionally do one of:

- `UPGRADE_DIE` — replace one **base** die with a typed die
- `ADD_REROLL` — +1 reroll budget
- `ADD_DIE` — append a die (type specified; defaults to Type 1)
- `EVOLVE` — become another species: dice set, types, HP curve and rerolls are replaced by the new species'; level, XP and current HP **percentage** carry over

Evolution is **automatic and cannot be cancelled**. It plays on the victory screen: silhouette → flash → new sprite → "X evolved into Y!" → a card showing the new dice set, rerolls and HP. When a species has several evolution targets the game rolls one at random and the animation is the reveal — there is no choice prompt.

### 4.3 XP and levelling

- **XP from a K.O. = the defeated Pokémon's level × `xpMultiplier`** (default **×2** since v1.6 — the curve felt too slow at ×1).
- It goes to the **Pokémon that fought**. The **Area Gauge** fills by the defeated Pokémon's level, *not* multiplied, so areas last as long as before while Pokémon level twice as fast. (`game_config.xpShareMode = 'fighter' | 'team'`, default `'fighter'`.)
- **Multi EXP** (v1.2): team members who didn't fight and aren't fainted get an additional `multiExpShare` (default **30 %**, min 1) of that XP. The gauge still counts the K.O. once. Players toggle it in Settings (**on by default**); the share is a `game_config` value (0 disables the feature).
- **Catching**: XP is awarded for the K.O. as usual; the catch throw comes after it (§4.4). **No Pokédollars.**
- `xpToNext(L) = ceil(A × L^B) + C`, defaults **A = 2, B = 1.15, C = 3**, all in `game_config` with a plotted curve in admin.
- Max level **100**; overflow XP is discarded.

### 4.4 Catching

- After a wild (or legendary) Pokémon is K.O.'d, the player may throw the **catch die** — a d6 — with **one ball** from the bag: Poké Ball +1, Great Ball +2, Ultra Ball +3, Master Ball +9. If `die + bonus ≥ catch value` the Pokémon is caught; otherwise it **flees**. The player may also let it go without throwing.
- Every species has a **catch value** 1–9 (`pokemon.catch_value`, admin-editable; 1 = always caught). It is seeded from the Gen 1 capture rate: ≥ 255 → 1, ≥ 190 → 2, ≥ 120 → 3, ≥ 75 → 4, ≥ 45 → 5, ≥ 30 → 6, ≥ 20 → 7, ≥ 10 → 8, below → 9 (the legendary birds and Mewtwo). With a bare d6, values 7–9 need a ball.
- **Who can be caught:** a species not in the Pokédex yet, or — wild only — a **stronger copy** of one you own (higher level than your weakest copy). That catch **replaces** the weaker copy in place: same team slot, the new level, full HP, XP reset.
- Caught **at the level it was met**, at full HP.
- **Where it goes:**
  - team has an empty slot → it **joins the team immediately**;
  - team is full → **"Add to team?"**, letting the player swap it in for one of the 3 on the spot (the replaced Pokémon goes to the Box). Declining sends it to the Box.
  - The Pokémon Center remains the place for full, unhurried team management.
- Losing (or fleeing) the fight → no throw; the species stays catchable.

### 4.5 Legendary bosses

Articuno, Zapdos, Moltres, Mewtwo and Mew are **not** in wild pools. Each is attached to one area as a `legendaryBossDex`. When that area's gauge reaches 100 %, the next encounter is **forced** to be that legendary, at a fixed level, un-skippable and un-fleeable, with a dedicated intro (darkened screen, cry, name card).

- Win → XP awarded, the area's next-area unlock is granted, then the catch throw (catch value 9: an Ultra Ball with a 6, or a Master Ball). **If it flees, it comes back:** until it's caught, every encounter deck dealt in that area holds one extra "legend" card that brings it back at the same level.
- Lose → normal wipe handling (§6.4), and the boss can be challenged again right away (a full gauge stays full). It is never missable.
- An area with no `legendaryBossDex` simply unlocks the next area when the gauge fills.

---

## 5. Economy & upgrades

### 5.1 Pokédollars (₽)

- **Trainers pay Pokédollars:** `₽ = Σ levels of the trainer's Pokémon you defeated` × `goldMultiplier` (gym battles × `gymGoldMultiplier` too). Item finds can also turn up Pokédollars (§5.4). Internally the save field and config keys keep the name `gold`.
- Wild fights, catches and legendary bosses pay none.
- Replaying a cleared area applies its `backtrackMultiplier` (**default 0.5**) to both Pokédollars and XP.

### 5.2 Upgrade menu (account-wide, always accessible)

Two tracks, both global — they apply to every Pokémon owned, present and future.

**Combo track** — 8 combos × 10 levels, bonuses per §2.4.
Cost to reach level L: `round(base × 1.55^(L−2))`, `base` = `{pair 5, two_pair 12, three_kind 15, small_straight 20, full_house 25, four_kind 35, full_straight 45, five_kind 60}`. Level 1 is free (owned from the start).

**Die track** — **18 typed dice × 10 levels**. The bonus is added to *each* die of that type before the type multiplier.
- Bonus per level: `[0, 1, 2, 3, 4, 6, 8, 10, 12, 15]` — flattened so that all ten levels stay relevant across a full playthrough rather than being exhausted by the mid game
- Cost to reach level L: `round(10 × 1.55^(L−2))`
- **The Base die has no track.** It is not listed in the upgrade menu.

Every number is a seeded database row and fully editable in admin — these are starting points, not commitments.

### 5.3 Poké Mart (HUD-accessible between encounters)

Each item has `in_shop` and `shop_badges` (admin-editable, with its effect and price): it's sold once the player holds that many badges.

| Item | Effect | Used | Price ₽ | Badges |
|---|---|---|---|---|
| Potion | +20 HP | battle, Team screen | 15 | 0 |
| Super Potion | +50 HP | battle, Team screen | 35 | 1 |
| Hyper Potion | +120 HP | battle, Team screen | 80 | 4 |
| Antidote | cures poison | battle | 10 | 0 |
| Paralyze Heal | cures paralysis | battle | 12 | 0 |
| Burn Heal | cures a burn | battle | 12 | 1 |
| Ice Heal | cures freezing | battle | 12 | 2 |
| Ether | +1 reroll (up to the max) | battle | 40 | 3 |
| Max Ether | +3 rerolls (up to the max) | battle | 100 | 6 |
| Poké Ball | +1 to the catch die | catch | 20 | 0 |
| Great Ball | +2 | catch | 50 | 2 |
| Ultra Ball | +3 | catch | 100 | 4 |
| Rare Candy | +1 level (with milestones and evolution) | Team screen | — | found only |
| Master Ball | never misses (+9) | catch | — | found only (Silph Co.) |

- **In battle: one item per turn** — before or after the roll, or while stunned — and it **doesn't end the turn**. A frozen or paralyzed Pokémon gets a choice when its turn starts: cure it (Ice Heal / Paralyze Heal — the turn then goes ahead) or skip the turn.
- A new game starts with **5 Poké Balls and 2 Potions** (`game_config.startInventory`).
- Inventory is part of the save.

### 5.4 Item finds

- `item` is a fourth encounter kind — default **1 card per 10-card encounter deck**. An item find draws from the area's **loot deck**: its loot table (`area_loot_pool`: an item or `money`, weight, quantity range, once-only flag) where each weight is that find's number of copies (a once-only find: one), shuffled exactly like the encounter deck; what's left is saved per area.
- The loot grows with the journey: Potions, Poké Balls and small change early; Great Balls and status heals mid-game; Hyper Potions, Ultra Balls, Max Ethers, Rare Candy and bigger Pokédollar finds late. **Once-only finds** — a Rare Candy in Mt. Moon, the Nugget's ₽250 on Nugget Bridge, the Master Ball in Silph Co.… — leave the table once found (one card per deck at most until then).
- Picking it up is the whole encounter; it can't be skipped.

---

## 6. HP, healing and failure

1. **HP persists** across encounters and across areas.
2. **Pokémon Center** encounter: full heal for team and box, team-swap UI, then continue. Forced as the first encounter of an area when anyone is hurt, and — in easy areas — whenever a team member is K.O. (§1.1).
3. **Passive regen: +5 % of max HP per hour**, wall-clock, applied on load to every Pokémon including fainted ones. A fainted Pokémon that regens above 0 revives.
4. **Wipe** (all 3 active at 0 HP): **the round is lost**. Return to the **start of the current area**, **team fully healed**; the area gauge goes back to where it stood **when the round began** (`AreaProgress.roundStartXp`, noted each time a deck is dealt; 0 before any round), and **a full gauge stays full**. The deck is dropped, so the next encounter starts a **new, freshly shuffled round**. Pokémon levels and XP, items and Pokédollars are all kept. The area gauge shows the round's start as a red mark. (v1.6; it used to cost half the gauge.)

---

## 7. Areas

| Field | Meaning |
|---|---|
| `orderIndex` | position in the chain |
| `name`, `bannerUrl` | display |
| `xpToUnlockNext` | gauge target (`null` = endless) |
| `minLevel` / `maxLevel` | wild encounter band |
| `encounterWeights` | `{wild, trainer, center, item}` — the mix of each encounter deck (§1.1); admin shows the resulting card counts |
| `backtrackMultiplier` | default 0.5 |
| `legendaryBossDex` | optional, §4.5 |
| `scalesToTeam` | boolean — if true, enemy levels track the team's average (Cerulean Cave) |
| `easyMode` | boolean — a Center comes next whenever a team member is K.O. (§1.1) |
| `hidden`, `unlockConditions` | secret areas outside the linear chain, opened by conditions (§7.3) |
| `gyms` | ordered trainer ids (gym leader / Elite Four / Champion), challenged once the gauge is full (§7.2) |
| wild pool | `[{dex, weight, minLevel, maxLevel}]` |
| trainer pool | `[{trainerId, weight}]` |

A **Trainer** is `{name, spriteUrl, team: [{dex, level} × 1–3]}`. Between each of a trainer's Pokémon the player may switch freely.

Areas unlock in order; any unlocked area is replayable from the Map at reduced rewards.

### 7.1 Seeded content — Kanto in order of discovery (v1.3)

Rosters follow Red/Blue/FireRed/LeafGreen (version exclusives merged; gifts and static Pokémon such as Eevee, Lapras,
Snorlax, the fossils or Porygon are rare wild encounters nearby). Gauges are sized for ~15–20 K.O.s per area.

| # | Area | Wild Lv | Gauge | Gate |
|---|---|---|---|---|
| 1 | Route 1 | 2–5 | 50 | — |
| 2 | Routes 22 & 2 | 3–7 | 80 | — |
| 3 | Viridian Forest | 4–8 | 110 | **Brock** (Boulder Badge) |
| 4 | Route 3 | 5–10 | 150 | — |
| 5 | Mt. Moon | 7–12 | 190 | — |
| 6 | Route 4 & Nugget Bridge | 9–15 | 230 | **Misty** (Cascade) |
| 7 | Routes 5 & 6 (S.S. Anne) | 12–18 | 280 | **Lt. Surge** (Thunder) |
| 8 | Diglett's Cave & Route 11 | 13–22 | 320 | — |
| 9 | Routes 9 & 10 | 14–22 | 340 | — |
| 10 | Rock Tunnel | 15–23 | 360 | — |
| 11 | Routes 7 & 8 (Celadon, Rocket Hideout) | 17–26 | 420 | **Erika** (Rainbow) |
| 12 | Pokémon Tower | 15–25 | 420 | — |
| 13 | Routes 12–15 | 22–30 | 480 | — |
| 14 | Cycling Road | 24–32 | 520 | — |
| 15 | Safari Zone (Fuchsia) | 24–33 | 560 | **Koga** (Soul) |
| 16 | Silph Co. — trainers only | 29–41 | 500 | **Sabrina** (Marsh) |
| 17 | Sea Routes 19 & 20 | 28–38 | 600 | — |
| 18 | Seafoam Islands | 30–40 | 640 | **Articuno** Lv.50 |
| 19 | Pokémon Mansion (Cinnabar) | 32–42 | 700 | **Blaine** (Volcano) |
| 20 | Route 21 (Viridian Gym) | 30–40 | 720 | **Giovanni** (Earth) |
| 21 | Victory Road | 38–47 | 820 | **Moltres** Lv.50 |
| 22 | Indigo Plateau — trainers only | 45–55 | 400 | **Elite Four** Lorelei → Bruno → Agatha → Lance → **Champion** Blue |

**Secret areas** (hidden, condition-based):

| Area | Condition | Notes |
|---|---|---|
| Power Plant | 50 Pokémon in the Pokédex | Electric Pokémon; **Zapdos** Lv.50 when the gauge fills |
| Cerulean Cave | a Pokémon at Lv.55+ | endless, `scalesToTeam` (team avg ± 3), every non-legendary species incl. the starters (rare), trainers for gold; **Mewtwo** Lv.70 at team average 60 |
| Faraway Island | 150 Pokémon in the Pokédex | **Mew** Lv.65 waits on arrival |

Cerulean Cave is the grinding ground, the gold farm and the guaranteed place to finish the Pokédex.

### 7.2 Gyms

Gym leaders, the Elite Four and the Champion are trainers with a `role` (`leader` / `elite` / `champion`) listed in an
area's ordered `gyms`. Once the gauge is full the player can **CHALLENGE** them, one after another, whenever they choose — or keep exploring first: a full gauge stays full (v1.6). Once a gym battle starts there's no running,
fought as a trainer gauntlet (switch freely between their Pokémon). Each uses its real top-3 team. Leaders award their
**badge**; every gym battle pays `gymGoldMultiplier` (×2) gold. Losing is a normal wipe; they wait for a rematch. An area
clears when its gauge is full **and** every gym battle and gauge legendary is won.

### 7.3 Unlocks

- **Linear** areas open in `orderIndex` order when the previous linear area is cleared.
- **Hidden** areas sit outside that chain and open when every `unlockCondition` holds:
  `{kind:'pokedex', count}` (species caught) or `{kind:'maxLevel', level}` (highest level owned). The Map shows them as
  "???" with progress bars, and a "secret area appeared" card plays the moment one opens.

### 7.4 Area insights

The Map and the area header show each area's **Encounter types** — its 2–3 main types, weighted over its wild pool and
trainer teams — and the **Recommended types**: the attacking types that hit those foes hardest, to help build a team
(`game_config.showRecommendedTypes` switches the recommendation off for everyone). A gym trainer's type is shown on the
Map only when it makes up at least 40 % of its team (a primary type counts 1, a secondary ½), so a mixed team such as
Champion Blue's shows none. An area whose wild species are all caught gets a check mark and a green outline.

**Completion:** a Pokédex screen tracks `n/151`. Reaching 151 shows a completion card. That is the stated goal of the game.

UI language: **English**. Pokémon names: English.

---

## 8. Enemy AI

Wild and trainer Pokémon obey **exactly the same rules** — same dice, combos, reroll budget and statuses. No cheating; difficulty comes from levels and team composition in the area data.

Reroll heuristic, one pass per available reroll:
1. Compute the current roll's damage.
2. Build candidate keep-sets: the largest matching group; any straight draw of ≥3 distinct consecutive values; all dice with face value ≥5; any status face that has already met its threshold (**always kept**).
3. Estimate expected damage after rerolling the complement, via a cheap Monte-Carlo (200 samples, per-die-type face tables precomputed).
4. Reroll the best candidate's complement if its expected damage beats the current damage by **>8 %**; otherwise attack now.

---

## 9. Save data

Local-first. `localStorage` is always written. When signed in with Google the same blob is pushed to Supabase (debounced 2 s) and pulled on load; **newest `updatedAt` wins silently**, with a small toast naming which side won.

```ts
type Save = {
  version: 1
  updatedAt: number              // epoch ms
  lastRegenTick: number          // epoch ms, for the 5%/h regen
  gold: number
  pokedex: number[]              // dex numbers caught
  box: PokemonInstance[]         // every caught Pokémon
  team: string[]                 // up to 3 instance ids, order matters
  inventory: Record<string, number>
  comboLevels: Record<ComboKey, number>   // 1..10
  dieLevels: Record<DieType, number>      // 1..10, no entry for 'base'
  currentAreaId: string
  areaProgress: Record<string, { xp: number; cleared: boolean; bossDefeated: boolean }>
  settings: { sfx: boolean; reducedMotion: boolean; multiExp: boolean }
}

type PokemonInstance = {
  id: string        // uuid
  dex: number
  level: number
  xp: number
  currentHp: number
  caughtAt: number
}
```

Validated with Zod on load; a failure falls back to a fresh save and archives the broken blob under `pokedice.save.corrupt`.

---

## 10. Presentation

### 10.1 Visual direction — Game Boy Color / GBA cartridge

- Font: **Jersey 25** (self-hosted) throughout; pixel mono fallback for numbers.
- Palette: parchment `#e8e0c8`, ink `#2a2438`, panel `#f7f2e0`, shadow `#6b6480`, gold `#e8b44a`, danger `#c2452d`, HP green `#4aa84a` → yellow `#e8c44a` → red `#c2452d`.
- Panels: 3 px `#2a2438` border, 2 px inner light border, hard drop shadow, border-radius ≤ 2 px. Dialogue-box framing for all narration.
- 18 type colours (standard Pokémon type colours darkened ~15 % to sit on parchment) drive dice, badges and particles. Base dice are off-white with grey pips; Normal-type dice are warm tan — visibly different at a glance.
- **Art assets are generated, not sourced.** Five 1024×256 area banners are drawn programmatically in the GBC palette (original work, committed as PNGs in `public/banners/`). Trainers get a generic pixel silhouette badge tinted by their specialty type. Both are plain URL fields in admin, so real art can replace them at any time without a code change.
- Sprites: `image-rendering: pixelated`, 3× desktop / 2× mobile.
- Animations: dice tumble-and-settle (CSS 3D, ~600 ms staggered), damage numbers punch and float, HP bars drain on an eased tween, type-coloured particle burst on hit, screen shake scaled by effectiveness, white flash on K.O.
- `prefers-reduced-motion` and the in-game setting collapse everything to instant transitions.
- Layout: desktop = fixed 3-panel battle scene (enemy top-right, player bottom-left, dice tray along the bottom). Mobile stacks to one column with the tray pinned to the bottom safe area. Minimum width 360 px.

### 10.2 Audio — SFX only, off by default

~10 short CC0 8-bit samples, total under 300 KB: dice rattle, dice land, hit, super-effective, faint, level-up, catch, gold, button, error. **Muted by default** (browsers block autoplay anyway) with a clear toggle in the HUD and in Settings. No music in v1.

---

## 11. Admin

Access requires Google sign-in **and** email `gregoire.ftn@gmail.com`, enforced twice: a client route guard and an RLS policy on every config table (`02-DATA-MODEL.md` §2.1). Full panel spec in `03-BUILD-PLAN.md` Phase 8.

---

## 12. Out of scope for v1

- Revives, Full Heal, Escape Rope and the other classic items
- Abilities, held items, moves, natures, IVs/EVs
- Music
- Multiplayer, leaderboards
- Pokémon beyond #151
