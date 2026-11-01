# Hidden talents

The user's asks of 2026-10-25 to 2026-10-30, in short: every Pokémon family has one hidden talent. A Pokémon met in the
wild rarely carries it; catching one unlocks the talent for the whole family. The talent's strength follows the family's
(Rattata's line something common, Dragonite's something cool). The talents themselves were picked from a brainstorm
(the artifact <https://claude.ai/artifact/BYkiNrNS95hvTPBvMiGaNk>).

**Status: built** on `version/2_7`, behind its switch, **Off** (docs/15 §20). The migration is
**0095**. Speed by level (docs/52) came with it.

## 1. Decisions

| Question | Answer |
|---|---|
| Talents | **One per evolution family** (`familyOf`: every species joined to the lowest dex by an evolution or a form; a Mega, a Gigantamax and a regional form share their species'). The game's own pick is `src/data/talents.json` (`pnpm talents`); the admin can pick another for any family |
| Rarities | Three (the user's call, 2026-10-30), by the family's strength (its strongest plain member's base stat total): **ultra** for a family with a legendary or mythical, a starter line, a pseudo-legendary, an Ultra Beast or Paradox Pokémon, or **540+**; **rare** for **495–539**; **common** below. Within a rarity, a name that says a type goes to that type (Static to Electric, Poison Heal to Poison); legendaries get Pressure or Fours Pro first; a few families get by hand the ability they have in the games (Pikachu's Static, Mimikyu's Disguise, Machop's Guts…). Today: 220 common, 146 rare, 173 ultra and Ditto's unique one, of 540 families (`pnpm talents` prints it) |
| Wild odds | **5 %** (admin): a wild Pokémon, a ghost (Trick or Treat), a boss, an Egg, a fossil, the Rocket trade, a wheel prize or a gift carries its family's talent |
| Legendaries and mythicals | **Always** carry theirs (a raid's, a small world's mythical too); so does **Ditto** (Imposter, its unique talent: every Ditto, those owned before included) |
| Starter lines | **Never** carry it (from any source), and **always** find it as one of them evolves |
| Evolving | Any other family still locked here has **30 %** (admin) to find it on **each** evolution |
| Unlock | **Per region, for the whole family**: catching one that carries it unlocks it for every Pokémon of that family the player owns there, and every one caught there later |
| A weaker one | Can be caught **whatever its level** while the family is locked; it **merges**: the family learns the talent, the Pokémon is let go ("Its talent passes to your Rattata") |
| What the player sees | A family's talent is "???" until one carrying it is **met**; then its name, greyed until learnt. A wild one with its talent says so before the fight |
| Pokémon owned before | Start at zero, **but** legendaries and mythicals, Ditto and a starter line's evolved members (Ivysaur, Charizard…) carry theirs, owned before or not (the user's call, 2026-10-31: they would have had it, a starter line finding its talent as it evolves). `ownedCarries`, as the save settles; their family unlocks with them |
| Foes | **Use theirs**: wild ones at the odds, a gym leader's, an Elite Four's or a Champion's ace always, any other trainer Pokémon at the odds |
| Versus and raids | **Apply**: the server's team snapshots carry the talent (0095). Raider acts only in raids, Power Spot and Friend Guard in double battles and raids |
| Trades | A traded Pokémon **keeps** its talent (and unlocks its family on arrival). A listing can ask for a species **with its hidden talent** |
| Icon | A small **gem** (a lozenge): green for a common talent, blue for a rare one, gold for an ultra one, red for the unique one, grey for unknown; on the Box, the team, the plates and trades |
| Small worlds, Extreme | **On** in both; Extreme mode keeps its own (its own save) |
| Switch and rules | Off / On for admin / On for everyone; its rules from a tap on the Pokémon sheet's talent box only (no INFO button: the user's call, 2026-10-30; no rules pop-up either, 2026-11-01) |

## 2. The talents (`TALENT` in `src/engine/talents.ts` holds the numbers)

41 talents (the user's set of 2026-10-30). Every bonus to damage, Speed or HP is a percentage, never a flat number, so
it scales. **A talent that does what an ability, item or move of the main games does takes its name** (Sturdy,
Pickup, Leftovers…), so players recognise it; the others are about dice and Pokédice's own systems.

| Rarity | Talent | What it does | Name from |
|---|---|---|---|
| Common | Extra Reroll | +1 reroll every battle | — |
| | Technician | +5 % damage when a Pair pays | ability (was Pair Pro) |
| | Quick | +10 % Speed | — |
| | Thick Hide | +10 % max HP | — |
| | Magma Armor | a freeze holds it 1 turn, not 2 | ability (was Thaw) |
| | Daycare Darling | +50 % Day Care XP | — |
| | Static | when a foe hits it, 10 % to paralyse the attacker | ability |
| | Shed Skin | 30 % to shed its statuses at the end of each of its turns | ability |
| | Limber | can't be paralysed | ability |
| | Poison Heal | poison heals it (as much as it would hurt) | ability |
| | Flame Heal | a burn heals it (as much as it would hurt) | Poison Heal's twin; no ability does it |
| | Rough Skin | a foe that hits it takes 10 % of the damage it dealt | ability |
| Rare | Opener | +10 % damage on its first attack of a battle | — |
| | Finisher | +10 % damage against a foe under 33 % HP | — |
| | Regenerator | heals 10 % after each battle won | ability (was Field Medic) |
| | Natural Cure | its status clears as it leaves the field | ability |
| | Power Spot | +10 % damage to its partner in a double battle, and to the other sides' Pokémon in a raid while it fights | ability (was Companion) |
| | Pay Day | +10 % ₽ for the trainer Pokémon it K.O.s | move |
| | Pickup | 5 % to find an item from the area's loot after a win, shown on the find screen like any find | ability |
| | Mind's Eye | immune foes take ×0.5 instead of 0 (no deadlock) | ability |
| | False Swipe | +1 on the catch die when it lands the K.O. | move (was Gentle Touch) |
| | Intimidate | foes deal −20 % damage to it with their first 2 attacks of the battle | ability |
| | Guts | +25 % damage while it has a status | ability |
| | Shell Bell | heals 10 % of the damage it deals | item |
| | Friend Guard | its partner takes −10 % damage in a double battle, the other sides' Pokémon in a raid | ability |
| | Disguise | the first hit it takes in a battle deals −40 % | ability |
| | Triple Pro | +10 % damage when a Three of a Kind pays | — |
| Ultra | Reroller | a rerolled die never lands on the number it showed | — |
| | Double Reroll | +2 rerolls every battle | — |
| | Mirror | once a battle, the lowest die turns into the highest (on its first attack) | — |
| | Ultra Speed | +20 % Speed | — |
| | Sturdy | once a battle, a K.O. hit leaves it at 1 HP | ability |
| | Leftovers | heals 5 % at the end of each of its turns | item |
| | Raider | +5 % damage in raids | — |
| | Flame Body | Day Care Eggs come twice as fast while it stays there | ability (was Egg Rush) |
| | Amulet Coin | +25 % trainer ₽ while on the team | item |
| | Magic Guard | statuses never hurt it (burn, poison, confusion; nor a Rough Skin) | ability |
| | Skill Link | its combos pay one upgrade level higher; level 10 pays as 11, each level-11 value one more step of the table (Pair 12, Two Pair 15, Three of a Kind 26, Small Straight 28, Full House 40, Four of a Kind 44, Full Straight 58, Five of a Kind 75) | ability |
| | Pressure | each foe that faces it loses 1 reroll, once a battle | ability |
| | Fours Pro | +25 % damage when a Four of a Kind pays | — |
| Unique | Imposter | copies the dice of the foe it faces: Ditto's, and **every Ditto always carries it**, those owned before the switch included | ability |

Triple Pro and Fours Pro (with Technician) make it worth rerolling for a combo. Type Focus and Duelist were dropped on
2026-10-30; a family an admin had set to a dropped or renamed talent falls back to the game's pick.

## 2b. The Talent Candy

The user's ask of 2026-10-30: a Rare Candy reskin (`public/items/talent-candy.png`, the candy turned gold) that reveals
a Pokémon's talent, given only while its talent isn't revealed yet. Used from a Pokémon's sheet (Use an item), it
unlocks the family's talent in that region, as catching one that carries it would; a Pokémon that has it (or with
the switch off) shows it greyed: "Its talent is already revealed". Effect kind `talent` (`applyFieldItem`,
`talentCandyFits`). **Never in the Mart nor any loot**: the admin sells it in a Special Shop live event. Migration 0096
adds its row.

## 3. The rules (`src/engine`)

- **`talents.ts`**: the keys and numbers, the switch (`talentsOn`), families (`familyOf`, `familyMembers`,
  `familyTalent`), `isStarterFamily`, the rolls (`rollTalent`, `rollTalentFor` from an id, `foeTalentChance`), the
  player's families (`save.talents[region]`, `familyUnlocked`, `unlockFamily`, `talentsMet`/`noteTalentMet`), the mirror
  on each Pokémon (`inst.talent`, `syncTalents` as every save settles), the evolution roll (`talentOnEvolve`), False
  Swipe's bonus; Ditto always carries Imposter (`alwaysTalented`, `syncTalents`).
- **Encounters** (`encounters.ts` `dealTalents`, `doubles.ts`): who carries one, drawn as the encounter is dealt; nothing
  drawn while the switch is off, so every seed plays as before.
- **Catching** (`catching.ts`): `catchTarget(…, talent)` gives `learn` for a weaker one; `applyCatch` unlocks and
  returns a `talent` event (`caught` or `passed`).
- **Evolving** (`run.ts` `withEvolveTalents`): battle XP, Rare Candy, a stone or the Link Cable, the level cap; a trade
  evolution draws from the arrival's id (`trade.ts`).
- **Battles** (`battle.ts`): `BattlerSeed.talent` / `FoeSeed.talent`; `makeBattler` (rerolls, Speed via
  `battleSpeed`, HP via `effectiveStats`), `attackModsFor` into `computeDamage`: the attacker's
  (Technician, Triple Pro and Fours Pro via `comboTimes`, Opener, Finisher, Guts, Mind's Eye, Raider, Skill Link via
  `comboUp` and `comboBonus` past the table's last level), a partner's Power Spot, the target's side (Intimidate,
  Disguise, a partner's Friend Guard via `guardTimes`); `DamageResult.talent` says which. After the hit (`hitTalents`):
  Shell Bell, Rough Skin, Static. Statuses: Limber (`shrugs`), Poison Heal, Flame Heal and Magic Guard
  (`statusTicks`, confusion's recoil), Shed Skin (`afterAction`), Magma Armor. Pressure at the turn's start
  (`pressure`). Mirror, Sturdy, Leftovers, Natural Cure, Reroller (`rerollMasked(…, fresh)`), Imposter (`copiesFoe`).
  A `talent` log entry for each (Rough Skin's with `hurt`, the HP the attacker lost).
- **Out of battle**: `applyVictory` (Pay Day, Amulet Coin, Regenerator, Pickup: `regenerator` and `pickup` events),
  `dayCareXp` (Daycare Darling), `breeding.ts` `stepMs` (Flame Body), raids (`RaidMon.talent`; `allyPowerSpot` and
  `allyFriendGuard` for the other sides' Power Spot and Friend Guard).
- **Pickup's find** (`run.ts` `afterWinTalents`): a `pickup` event, nothing paid; the store queues it (`run.pickup`)
  and the next roll shows it as an item find (`FindView`, tagged "Found by …"), picked up as any find.
- **Other arrivals**: `hatchEgg`, `addFossil`, `addRaidMon`, `applyGifts`, a world's mythical, the Rocket trade, the
  wheel's prize, a ghost caught (`TrickState.talent`).

## 3b. How the player sees it (docs/15 §38)

The user's ask of 2026-10-30: clear UX and an animation for each effect when it applies. In battle every talent at
work shows its **plaque** on its owner's side (gem, Pokémon, talent; an ability's pop-up as in the main games), its gem
bursts on the Pokémon and a glint plays; the line under the stage says what it did. The engine logs the talents that
change a hit **before** the hit, and announces the ones that work on their own as their Pokémon first acts
(`ANNOUNCED_TALENTS`). Out of battle: the victory screen's cards (Pay Day, Amulet Coin: `talent_gold`; Regenerator),
the catch's False Swipe line (and the balls' chances with it), the Day Care card's line (Daycare Darling, Flame Body),
Pickup's tag over its find. `/kitchen-sink/talent-lab` fights each one in the real battle screen (dev only; its fights
are checked by `tests/talent-lab.test.ts`).

## 4. The server (0095)

- `game_config.hiddenTalents` (Off) and `talents_open()`.
- `versus_set_team`, `raid_set_team`, `raid_progress_set_team`: the snapshot carries `talent` while the switch is open,
  read from the cloud save.
- Trades: `trade_row` says `talent`; `trade_post` accepts `{kind: 'species', dex, talent: true}` while the switch is
  open; `trade_take` then takes only a Pokémon carrying it.
- `tests/hidden-talents-sql.test.ts` runs it on PGlite.

## 5. Screens

docs/15 §38. Admin → Config → Switches (the switch) and → Hidden talents (the odds, each family's pick).

## 6. Setting it up

1. Run [`supabase/migrations/0094_speed_by_level.sql`](https://github.com/Splifingald/pokedice/blob/version/2_7/supabase/migrations/0094_speed_by_level.sql)
   (Speed by level, docs/52),
   [`supabase/migrations/0095_hidden_talents.sql`](https://github.com/Splifingald/pokedice/blob/version/2_7/supabase/migrations/0095_hidden_talents.sql)
   and [`supabase/migrations/0096_talent_candy.sql`](https://github.com/Splifingald/pokedice/blob/version/2_7/supabase/migrations/0096_talent_candy.sql)
   (the Talent Candy) in the Supabase SQL editor, in that order (`supabase/seed.sql` carries them, inlined).
2. Admin → Config → Switches → Hidden talents: **On for admin** to try it, then **On for everyone**.
