# Speed by level

The user's ask of 2026-10-30: "Pokémon speed should now increase with level, each level gives 1 speed value. Base speed
value is currently defined by dividing by 10 and rounding the real speed value of each Pokémon. Let's forget that, base
speed is = Real pokemon speed value + pokemon level now. This way an overlevelled pokemon will always go faster."

**Status: built** on `version/2_7`. A balance change: **no switch and no rules pop-up** (the
user's answer). The migration is **0094**.

## 1. Decisions

| Question | Answer |
|---|---|
| Formula | **Speed = the species' base Speed stat + `speedPerLevel` × level**, `speedPerLevel` = 1 (Admin → Config → Game → Pacing & rewards) |
| Switch | **None**, no pop-up: the Speed hint and How to play say the rule |
| Sheet | An owned Pokémon's Speed tile shows the total with "base + Lv." under it ("120", "90 + Lv.30"); the Pokédex without a Pokémon shows the species' base |
| Forms | A Mega, Gigantamax, type or HP form fights at **its own** base Speed (+ level), read the next time the order is: a double battle's next round. A single battle reads it once, as it opens |
| Capped levels | The level the Pokémon fights at (raids, Versus at Lv.50) |
| Ties | Still the player's; in a double battle the player's side first |
| Ditto | Keeps its own Speed (Transform copies dice only) |
| Talents | Quick and Ultra Speed (docs/51) give +10 % and +20 % Speed |

What it changes: Speed only decides who acts first in a single battle and the order of all four each round of a double
battle. Raids, the AI and Idle mode don't read it. In Versus every Pokémon fights at Lv.50, so the level adds the same
to everyone. A level lead overturns the species' order only when it is bigger than the gap in base Speed: Lv.30 Snorlax
(30 + 30 = 60) is still slower than Lv.20 Pikachu (90 + 20 = 110). Ties, about 1 pair in 10 on the old ÷ 10 values,
fall to about 1 in 100.

## 2. The rules (`src/engine`)

- `battleSpeed(species, level, data)` (`progression.ts`): `species.speed + round(speedPerLevel × level)`.
- `makeBattler` (`battle.ts`) sets `Battler.speed` from it; `wearForm` takes the form's (with `data`) and the form
  snapshot keeps the Speed so a form's end gives it back (`restore`; a battle saved before has none and keeps its own).
- `startBattle` (who opens, a tie to the player) and `roundOrder` (doubles) read `Battler.speed` as before.

## 3. The data

- `pokemon.speed` (`src/data/pokemon.json`, the Supabase table) holds the **real base Speed stat** from PokeAPI's
  `pokemon_stats.csv`, the forms' own where they have one; Arceus's types and Silvally's memories take their species'.
  Six rows had been tuned by hand on the old scale (the Squirtle line, its Mega and Gigantamax, Weedle) and now carry the
  real stat too.
- The seed scripts (`seed.ts`, `seed-regions.ts`, `seed-forms.ts`) write the real stat.

## 4. Setting it up

1. Run [`supabase/migrations/0094_speed_by_level.sql`](https://github.com/Splifingald/pokedice/blob/version/2_7/supabase/migrations/0094_speed_by_level.sql)
   in the Supabase SQL editor (`supabase/seed.sql` carries it too, inlined). It rewrites every Pokémon's `speed` with
   the real stat, adds `speedPerLevel` (1) and bumps `configVersion`. Until it runs, a game reading the database gets
   the old ÷ 10 values plus the level, so the level weighs far more than intended.
