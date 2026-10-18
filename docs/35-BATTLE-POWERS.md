# Battle powers: Mega Gems, Gigantamax, Z-Moves

Status: **built** (2026-10-18) on `ccr-92f0fa53-9n0srr`, merged into `feature/version_2`; the migration is **0064**. Everything ships **Off**: three
switches in Admin → Config → "Battle powers" (docs/15 §20). Off, Mega Evolution and Gigantamax work as docs/12 §3–4
describe, and there are no Z-Moves.

The user's request, and the answers to the questions asked before building it:

| Power | Opens | What it does | Limit |
|---|---|---|---|
| **Mega Evolution** (gem rules) | Kalos, 3rd badge (Korrina) | Needs the Pokémon's **gem**; +1 die (as before) for **3 of its turns** or until it leaves the field; **no level** | 1 per battle |
| **Gigantamax** (newer rules) | Galar, 3rd badge (Kabu) | **+2 dice** of its first type and **30 % of its HP back**, for its next turn | 1 per battle |
| **Z-Move** (new) | Alola, 3rd badge (Lana's Waterium Z) | Attacks with the roll as it stands, plus its type's effect | 1 per battle |

- **Everywhere else** (earlier regions and later ones alike), each power works once its home badge is won **and** that
  region's League is beaten. **Never in a small world.**
- The three can share a battle, **never a Pokémon**: one power per Pokémon.

## 1. The rules (all in `src/engine`)

### 1.1 Where each opens — `engine/powers.ts`

- `powerEarned(save, data, kind)`: the badge of `powerHome` (Kalos 3, Galar 3, Alola 3; admin-editable) is won.
- `powerOpenIn(save, data, kind, region)`: earned, not in a small world, and the region is the home one or its League is
  beaten (`leagueDone`).
- `megaUnlocked` / `gmaxUnlocked` read the newer rules while their switch is on (`gemRulesOn`, `gmaxBoostOn`), the older
  ones (`reached`: the region started) while it's off. `zUnlocked` needs its switch (`zMovesOn`).
- `battlePowersFor(save, data)` is what a battle gets: `megaAllowed`, `gmaxAllowed`, `zAllowed`, and under the newer
  rules `megaForms` (the gems' Mega forms), `megaTurns` and `gmaxBoost` (dice, heal).

### 1.2 Mega Gems — `engine/powers.ts`, `src/data/items.json`

- **One item per Mega form**, effect `{ kind: 'megaGem', mega: <the form's dex> }`: 95 of them, Charizardite X and Y,
  Mewtwonite X and Y, Raichunite X and Y apart; Primal Kyogre's **Blue Orb**, Primal Groudon's **Red Orb**, Ultra
  Necrozma's **Ultranecrozium Z** and Mega Rayquaza's **Meteorite** play the same part. Names in every language come from
  PokeAPI's item names (Portuguese takes the English ones, as the games do); the Legends: Z-A gems' pictures are
  PokeAPI's 160 px art shrunk to 30 × 30 pixel art in `public/items/`.
- Held in **`save.powers.gems`**, for every region of the save; never in a bag, **never sold** (`sellPrice` is 0).
- **Badges hand some over** (`megaEvolution.gems.rewards`): Korrina's (3rd) the **Lucarionite**, the 6th
  **Charizardite Y**, the 7th **Venusaurite**, the 8th **Blastoisinite**. `syncPowers` runs on every save commit
  (`settle`, store/game.ts): a badge won now, or before the switch was on (an older save), hands its gem over with a
  toast ("Korrina gave you the Lucarionite!").
- **The Mart sells the others** (`gemShelf`): ₽1,000 each (the item's price), **once**. A region's Mart sells the gems of
  every Pokémon that can be had there, or one it evolves from (`regionSpecies`: wild, starter, legendary, fossil, roamer,
  raid); a Pokémon found nowhere has its gem in Kalos's Mart. The badges' gems are never sold. The shelf opens where Mega
  Evolution does: Kalos from Korrina's badge, any other region once its League is beaten.

### 1.3 In battle — `engine/battle.ts`

- **Separate uses** under the newer rules (`ownLimits`): `megaUsed`, `gmaxUsed`, and `zUsed` (always its own). Under the
  older rules Mega and Gigantamax still share one.
- **One power per Pokémon** (`Battler.powered`): a Pokémon that Mega Evolved can't Gigantamax or use a Z-Move, even once
  its Mega has worn off.
- **A timed Mega** (`megaTimer`): its own turns, the one it Mega Evolves in included (like Gigantamax's turn). After the
  last it changes back — look, types, the die — with a flash and "X's Mega Evolution wore off!". It changes back when it
  leaves the field too. The plate's MEGA chip says the turns left ("MEGA ·2").
- **Gigantamax's boost**: `gmaxBoost.dice` dice of the form's die type (its first type) instead of one, and
  `healPercent` % of its max HP, kept after it shrinks back. For `gigantamax.turns` turns, as before.
- **Z-Move** (`ZMOVE` event, `canZMove`): after the roll, instead of ATTACK. The attack's type (`attackType`, the one the
  dice pick against this foe) decides its effect (`zEffectOf`), rolled before the hit:

  | Type | Effect (config `zMove`) |
  |---|---|
  | Ice | `freezeChance` (30) % to freeze |
  | Electric | `paralyzeChance` (50) % to paralyze |
  | Fire | `burnStacks` (2) Burn stacks |
  | Grass | heals `healPercent` (20) % of the user's max HP |
  | Psychic | confusion |
  | Poison | poison |
  | Flying / Ground / Water | **a turn away** — flown up, dug in, dived (`Battler.away`): every attack misses it (`dodge`), nothing it carries lands; at the start of its next turn it **strikes** with the roll it kept |
  | Fighting | `recklessPercent` (40) % more damage, then `recklessRecoilPercent` (20) % of what it dealt back as recoil |
  | Steel | every status of the user shaken off before the blow (`cleansed`); a Steel-type may use its Z-Move **while frozen or paralyzed**: the stun and every status go, it throws its dice and strikes |
  | any other, or base dice only | `damagePercent` (20) % more damage on the Z-Move itself |

  (The user's additions of 2026-10-18 for Flying, Ground, Water, Fighting and Steel.) An attack with no effect (an
  immunity) lands nothing. The log says it first (`zmove` entry: type, effect, landed). On the stage, every Z-Move has
  animations of its own (`src/fx/timelines/zmove.ts`): the power gathering (the stage dims, light of the type rises, a
  golden Z draws itself and blazes), then **the Z strike** in place of the move's usual one — a sphere of the type's
  light with a Z at its heart crossing the field and bursting on the target (hit-stop, white frames, three rings, a
  flash, a quake). A Flying, Ground or Water one plays its going away (shooting up, sinking into the ground, diving),
  hides the Pokémon on the stage while it's away, and its strike starts with it coming back down, up or out.

### 1.4 Foes and auto battles

- Foes: as before, a leader's, Elite Four member's or Champion's ace **Mega Evolves without a gem** (Lv.50, in Hoenn,
  Kalos, Alola) and Gigantamaxes in Galar — now for 3 turns, and with the boost, when those rules are on. In **Alola** the
  ace uses a **Z-Move** on its first attack (`enemyPlanFor`: `plan.z`, `zMove.trainerRegions`). Never before the player
  has the power there.
- **Auto battles** (a cleared area's auto mode, Versus): under the newer rules the auto player uses each power whose rules
  are on (`autoEvents`): the first Pokémon able to **Mega Evolves** on its first turn (it holds its gem); otherwise the
  first able to **Gigantamax** does; a Pokémon that took neither attacks with the **Z-Move** at its first attack. Under the
  older rules auto battles still have no Mega or Gigantamax.

## 2. The screens

- **The battle**: a gold **Z-MOVE** button with MEGA and G-MAX (after the roll; a Steel-type's also while it's
  stunned, when the turn then waits for the player instead of passing), its hint saying what this roll's type adds
  ("Electric: 50% chance to paralyze the foe"). MEGA's and G-MAX's hints say the newer rules' numbers.
- **The Mart** (Buy): a **Mega Gems** shelf under the stock — the gem, its Mega's icon and name, ₽1,000 or HELD; a line
  instead while the shelf is shut here ("…once you have beaten this region's League"); INFO at its foot. The bag (Sell)
  lists the gems held, "Can't sell".
- **The Pokémon sheet**: under the gem rules Mega Evolution leaves the Lv.50 curve for a line per Mega form — its die and
  its gem, held ✓ or needed — with INFO; the Gigantamax line says the boost; a Z-Move line (once open) with INFO.
- **Rules**: each power's pop-up once its badge is won with its switch on (`powerRulesDue`, Mega first), queued behind
  every other one-time pop-up; Mega's Let's go! opens the Mart. Its picture is the leader's area.
- `/kitchen-sink`: "Battle powers" (plates, Z-MOVE hints, the shelf open / poor / shut / empty, the rules);
  `/kitchen-sink/fx`: the Z-Move's power gathering and strike (yours and a trainer's), and each going away with its
  strike back.

## 3. Versus

- Each side brings its powers (`VersusPowers`: gems, Gigantamax's and Z-Moves' badges won). Yours come from your save
  (`versusPowersOf`); the defender's from the board (`versus_board`'s `powers`, read live from their save, so a gem bought
  after the team was set counts).
- **The whole fight is one battle**: each power once per side, one per Pokémon, carried from one defender to the next.
  The defender's Pokémon each get a plan: Mega if the side holds its gem, else Gigantamax, else a Z-Move, while unused.
- The fight is computed by the attacker with the switches as they are for the attacker; the server only shows a
  player's powers while the switch is on for whoever asks.

## 4. The switches and the server — `supabase/migrations/0064_battle_powers.sql`

- `game_config.megaEvolution.gems.access`, `gigantamax.boost.access`, `zMove.access`: Off / On for admin / On for
  everyone (Admin → Config → "Battle powers", with the badges, the turns, the badge gems, the dice, the heal and the
  Z-Move numbers). Off keeps every gem held.
- `power_open(kind)`: the switch as the server reads it. `player_powers(user, realm)`: the gems (strings only) and the
  badges (`powers.earned`) from that realm's save, emptied for a switch that's off for the caller.
- `versus_board`: a last `powers` column (dropped and made again with its grants, as 0049 did).
- The 95 gem rows, inserted if missing.

## 5. Setting it up

1. Run the migration in Supabase → SQL Editor:
   https://github.com/Splifingald/pokedice/blob/feature/version_2/supabase/migrations/0064_battle_powers.sql
   (after 0063). It adds the gems, the switches' server check and the Versus board's powers. Safe to run again.
   `supabase/seed.sql` carries it too (inlined last), and its item rows hold the gems.
2. Admin → Config → **Battle powers**: each switch **On for admin** to try it, then **On for everyone**.
