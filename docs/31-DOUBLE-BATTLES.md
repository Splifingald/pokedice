# Double battles (2 v 2)

**Status:** built · **Asked:** the user, 2026-10-17 ("a 2v2 battle feature in Hoenn and above"), refined with them the
same day. UI rules: `docs/15-UI-GUIDELINES.md` §30.

Two of yours against two foes. Every round all four act once, fastest first; the one whose turn it is stands big in
front, the others smaller behind. You pick which foe your Pokémon attacks; foes attack one of yours at random.

## 1. Decisions (with the user)

| Question | Answer |
|---|---|
| Where | The regions ticked in admin (Hoenn → Paldea by default). |
| Wild | 10 % of the wild encounters there come as a pair (admin number). |
| Trainers | Trainers flagged **Duo** in admin (Twins, Young Couples, Interviewers…) with 2 or more Pokémon, always. A first pass flagged the ones whose look is a pair, and real-game pairs were added from Hoenn on (§4). |
| Gym leaders | Never, except **Tate & Liza** (Hoenn's 7th badge), always. |
| Elite Four, Champions, legendaries, raids, Versus, Elite Rebattle | Never. |
| Extreme mode, small worlds, the portal run, the nightmare | Never. |
| Turn order | Every round, all four by Speed (a tie goes to yours, then left before right). |
| Your attacks | You pick the target (one foe left: it's that one). |
| Foe attacks | A random one of yours out. |
| Statuses | On the target hit; Heal stays on the attacker. |
| Items | You pick which of yours (as in one-on-one). |
| Ditto | Copies the dice of the Pokémon it aims at. |
| One of yours K.O. | A free replacement from the bench, your pick; with none left, the other fights on alone (1 v 2). |
| Only one able at the start | It fights both, 1 v 2. |
| XP | Each K.O. gives its full XP to **both** of yours out when it fell. |
| Catching | After a wild pair, a throw at each one, one after the other. |
| Money | Trainers pay per K.O. as before (gyms × the gym multiplier). |
| Names | Hidden in double battles only: the plates show the Pokémon's icon, level, HP and statuses. |
| Rules pop-up, tag | None (the user, after seeing it in game): no rules pop-up, no INFO, no DOUBLE BATTLE tag on the preview. |
| The one not acting | Behind, smaller, up the stage and to the left of the one in front. |

## 2. Engine (pure)

- **`engine/doubles.ts`** decides when: `doublesOn` (the switch, `eventOpenTo`), `doublesIn(data, region)`,
  `fightsDouble(trainer)` (duo, 2+ Pokémon, never elite / champion) and **`asDouble(encounter, ctx, save, rng)`**: a wild
  card rolls `wildChance` and, on a hit, a second wild Pokémon from the area's pool (`rollWild`, the new-Pokémon pity
  included; a roamer instead means no pair), stored as `partner`; a duo trainer or Tate & Liza get `double: true`. It
  touches nothing (the rng included) while the switch is off, the region isn't ticked, in Extreme mode, a small world,
  an area with a special mode or an Elite Rebattle fight. The store calls it when a card is drawn (`rollNext`) and when
  a gym is challenged, so the preview says so.
- **`engine/battle.ts`**: `createBattle({ …, double: { foes, leadUids, plans } })` makes a `BattleState` with
  `double: DoubleState` (every foe, the slots out on each side, the round's queue, the K.O.s with yours that were out).
  `activeIndex` and `enemy` are **the pair in front** — whose turn it is and its target — so every one-on-one rule
  (the roll, damage, statuses, items, Mega / Gigantamax / type changes, potions) runs on them unchanged. New: the
  `TARGET` event; the `focus` (the pair in front changed) and `foe_out` (the trainer's next one comes out) log entries;
  `start.double`. A trainer's whole team is **one battle** (two out, the others waiting for a free spot), not a
  gauntlet. The turn cap is `maxBattleTurns × 2` (four take turns); the stalemate check covers everyone.
- **`engine/run.ts`**: `VictoryInput.fighterUids` — both of yours get the full XP (`awardBattleXp`); Multi EXP compares
  with the higher of the two.
- **`engine/sim.ts`** (auto mode): aims at the foe its dice hit hardest, the weakest of those; switches in only from
  the bench.

## 3. Store and screens

- `store/run.ts`: `engage(leads)` with the two leads picked; `startBattle(…, double)` (each foe's plan, the ace's
  Mega / Gigantamax); **`settleDouble`** pays each K.O. (`applyVictory` with `fighterUids`) whatever the end — as each
  K.O. of a one-by-one gauntlet is kept — then the wipe, the stalemate, or the rewards; won, each wild one that can be
  caught gets its throw (`run.catch`, then `run.catchQueue`; "Add to team?" is answered before the next throw).
- Screens (§30 of docs/15): the stage with four, the name-less plates, the target picker, the lead picker sending two, the victory card naming every foe, the history.

## 4. Content: duo trainers

`scripts/patch-double-battles.ts` is the one source of the duo data (`pnpm seed-regions` reapplies it through
`withDuos`, so a rebuilt region keeps them).

- **Flagged** (their look is a pair): Tate & Liza (Hoenn), Twins Amy & May (Johto), Twins Amy (Sinnoh), Twins Kumi & Amy
  and Backers Ami & Eli (Unova), Twins Mia & Pia (Kalos).
- **Added**, one area each at its trainers' levels, weight 10, 2–3 Pokémon (teams cap at 3): Hoenn 8 (Twins Amy & Liv,
  Twins Gina & Mia, Crush Kin Mik & Kia, Interviewers Gabby & Ty and their rematch, Young Couple Lois & Hal, Sis and Bro
  Lila & Roy, Cool Couple Lea & Jed), Sinnoh 4, Unova 4, Kalos 3, Alola 3, Galar 3, Paldea 3. The later games have few
  such pairs: those names are made up in the same style. Alola, Galar and Paldea borrow Kalos's pair sprites.

## 5. Server (migration 0061)

Battles are played in the client like every battle: no server function acts for a double battle, so there is nothing
for the server to refuse; the switch is read from `game_config.doubleBattles` like every content setting. The
migration adds `trainers.duo` (with the six flags, once), the new trainers and their pool rows (where their area
exists), the `doubleBattles` row (Off, Hoenn → Paldea, 10 %) and `configVersion + 1`.

## 6. Setting it up

1. Deploy the client (the switch is Off: nothing changes for anyone).
2. Run `supabase/migrations/0061_double_battles.sql` (after 0060; safe to run again):
   https://github.com/Splifingald/pokedice/blob/ccr-54f4f353-lh3o5s/supabase/migrations/0061_double_battles.sql
   `supabase/seed.sql` carries it too (inlined). Until it has run, Admin's remote check reports the missing
   `trainers.duo` column and saving trainers fails.
   - Or, for an export: `tsx scripts/patch-double-battles.ts <in.json> <out.json>`, then `pnpm import-bundle`.
3. Admin → Config → **Double battles**: tick the regions, set the wild %, then the switch **On for admin** to try it,
   **On for everyone** to open it. Admin → Trainers → **Duo (2 v 2)** flags more pairs. Publish.

## 7. Tests

`tests/engine/double-battle.test.ts` (the field, the order, targeting, random foe targets, replacements, 1 v 2, the
win and its K.O.s, auto to the end on 30 seeds, when a battle is double, the XP for both),
`tests/double-battles-content.test.ts`, `tests/double-battles-sql.test.ts`, `e2e/double-battles.spec.ts` (a wild pair
from the preview to the rewards at phone size, the switch off, the kitchen sink).
