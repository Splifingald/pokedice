# Hidden talents

The user's asks of 2026-10-25 to 2026-10-30, in short: every Pokémon family has one hidden talent. A Pokémon met in the
wild rarely carries it; catching one unlocks the talent for the whole family. The talent's strength follows the family's
(Rattata's line something common, Dragonite's something cool). The talents themselves were picked from a brainstorm
(the artifact <https://claude.ai/artifact/BYkiNrNS95hvTPBvMiGaNk>).

**Status: built** on `claude/pokemon-talent-system-h3n0tx`, behind its switch, **Off** (docs/15 §20). The migration is
**0094**. Speed by level (docs/50) came with it.

## 1. Decisions

| Question | Answer |
|---|---|
| Talents | **One per evolution family** (`familyOf`: every species joined to the lowest dex by an evolution or a form; a Mega, a Gigantamax and a regional form share their species'). The game's own pick is `src/data/talents.json` (`pnpm talents`); the admin can pick another for any family |
| Tiers | **Super** for a family with a legendary or mythical, a starter line, a pseudo-legendary, an Ultra Beast or Paradox Pokémon, or a member with a base stat total of **500+**; **base** otherwise |
| Wild odds | **5 %** (admin): a wild Pokémon, a ghost (Trick or Treat), a boss, an Egg, a fossil, the Rocket trade, a wheel prize or a gift carries its family's talent |
| Legendaries and mythicals | **Always** carry theirs (a raid's, a small world's mythical too) |
| Starter lines | **Never** carry it (from any source), and **always** find it as one of them evolves |
| Evolving | Any other family still locked here has **30 %** (admin) to find it on **each** evolution |
| Unlock | **Per region, for the whole family**: catching one that carries it unlocks it for every Pokémon of that family the player owns there, and every one caught there later |
| A weaker one | Can be caught **whatever its level** while the family is locked; it **merges**: the family learns the talent, the Pokémon is let go ("Its talent passes to your Rattata") |
| What the player sees | A family's talent is "???" until one carrying it is **met**; then its name, greyed until learnt. A wild one with its talent says so before the fight |
| Pokémon owned before | **None** carries a talent: the switch starts everyone at zero |
| Foes | **Use theirs**: wild ones at the odds, a gym leader's, an Elite Four's or a Champion's ace always, any other trainer Pokémon at the odds |
| Versus and raids | **Apply**: the server's team snapshots carry the talent (0094). Duelist acts only in Versus, Raider only in raids |
| Trades | A traded Pokémon **keeps** its talent (and unlocks its family on arrival). A listing can ask for a species **with its hidden talent** |
| Icon | A small **gem** (a lozenge): gold for a super talent, blue for a base one, grey for unknown; on the Box, the team, the plates and trades |
| Small worlds, Extreme | **On** in both; Extreme mode keeps its own (its own save) |
| Switch and rules | Off / On for admin / On for everyone; a rules pop-up once, then a tap on the Pokémon sheet's talent box (no INFO button: the user's call, 2026-10-30) |

## 2. The talents (`TALENT` in `src/engine/talents.ts` holds the numbers)

| Base | What it does | Super | What it does |
|---|---|---|---|
| Extra Reroll | +1 reroll every battle | Reroller | a rerolled die never lands on the number it showed |
| Pair Pro | a Pair pays +2 | Double Reroll | +2 rerolls every battle |
| Quick | +10 % Speed | Mirror | once a battle, the lowest die turns into the highest (on its first attack) |
| Thick Hide | +10 % max HP | Type Focus | each die of its first type +1 |
| Opener | its first attack of a battle +3 | Ultra Speed | +20 % Speed |
| Finisher | +3 against a foe under 25 % HP | Sturdy | once a battle, a K.O. hit leaves it at 1 HP |
| Field Medic | heals 10 % after each battle won | Leftovers | heals 5 % at the end of each of its turns |
| Natural Cure | its status clears as it leaves the field | Mind's Eye | immune foes take ×0.5 instead of 0 (no deadlock) |
| Thaw | a freeze holds it 1 turn, not 2 | Raider | +5 % damage in raids |
| Duelist | +1 reroll in Versus | Egg Rush | Day Care Eggs come twice as fast while it stays there |
| Pay Day | +10 % ₽ for the trainer Pokémon it K.O.s | Gentle Touch | +1 on the catch die when it lands the K.O. |
| Pickup | 5 % to find a loot item after a win | Amulet Coin | +25 % trainer ₽ while on the team |
| Daycare Darling | +50 % Day Care XP | | |

Egg Rush was "Twin Eggs" (each Egg comes as two); the user chose "Eggs come faster" instead, and the name followed.

## 2b. The Talent Candy

The user's ask of 2026-10-30: a Rare Candy reskin (`public/items/talent-candy.png`, the candy turned gold) that reveals
a Pokémon's talent, given only while its talent isn't revealed yet. Used from a Pokémon's sheet (Use an item), it
unlocks the family's talent in that region, as catching one that carries it would; a Pokémon that has it (or with
the switch off) shows it greyed: "Its talent is already revealed". Effect kind `talent` (`applyFieldItem`,
`talentCandyFits`). **Never in the Mart nor any loot**: the admin sells it in a Special Shop live event. Migration 0095
adds its row.

## 3. The rules (`src/engine`)

- **`talents.ts`**: the keys and numbers, the switch (`talentsOn`), families (`familyOf`, `familyMembers`,
  `familyTalent`), `isStarterFamily`, the rolls (`rollTalent`, `rollTalentFor` from an id, `foeTalentChance`), the
  player's families (`save.talents[region]`, `familyUnlocked`, `unlockFamily`, `talentsMet`/`noteTalentMet`), the mirror
  on each Pokémon (`inst.talent`, `syncTalents` as every save settles), the evolution roll (`talentOnEvolve`), Gentle
  Touch's bonus, the rules pop-up's flag.
- **Encounters** (`encounters.ts` `dealTalents`, `doubles.ts`): who carries one, drawn as the encounter is dealt; nothing
  drawn while the switch is off, so every seed plays as before.
- **Catching** (`catching.ts`): `catchTarget(…, talent)` gives `learn` for a weaker one; `applyCatch` unlocks and
  returns a `talent` event (`caught` or `passed`).
- **Evolving** (`run.ts` `withEvolveTalents`): battle XP, Rare Candy, a stone or the Link Cable, the level cap; a trade
  evolution draws from the arrival's id (`trade.ts`).
- **Battles** (`battle.ts`): `BattlerSeed.talent` / `FoeSeed.talent`; `makeBattler` (rerolls, Speed via
  `battleSpeed`, HP via `effectiveStats`), `attackModsFor` into `computeDamage` (Type Focus, Pair Pro, Opener,
  Finisher, Mind's Eye, Raider: `DamageResult.talent`), Mirror, Sturdy, Thaw, Leftovers, Natural Cure, Reroller
  (`rerollMasked(…, fresh)`), a `talent` log entry for each.
- **Out of battle**: `applyVictory` (Pay Day, Amulet Coin, Field Medic, Pickup: `field_medic` and `pickup` events),
  `dayCareXp` (Daycare Darling), `breeding.ts` `stepMs` (Egg Rush), Versus (`withDuelists`), raids (`RaidMon.talent`).
- **Other arrivals**: `hatchEgg`, `addFossil`, `addRaidMon`, `applyGifts`, a world's mythical, the Rocket trade, the
  wheel's prize, a ghost caught (`TrickState.talent`).

## 4. The server (0094)

- `game_config.hiddenTalents` (Off) and `talents_open()`.
- `versus_set_team`, `raid_set_team`, `raid_progress_set_team`: the snapshot carries `talent` while the switch is open,
  read from the cloud save.
- Trades: `trade_row` says `talent`; `trade_post` accepts `{kind: 'species', dex, talent: true}` while the switch is
  open; `trade_take` then takes only a Pokémon carrying it.
- `tests/hidden-talents-sql.test.ts` runs it on PGlite.

## 5. Screens

docs/15 §38. Admin → Config → Switches (the switch) and → Hidden talents (the odds, each family's pick).

## 6. Setting it up

1. Run [`supabase/migrations/0093_speed_by_level.sql`](https://github.com/Splifingald/pokedice/blob/claude/pokemon-talent-system-h3n0tx/supabase/migrations/0093_speed_by_level.sql)
   (Speed by level, docs/50),
   [`supabase/migrations/0094_hidden_talents.sql`](https://github.com/Splifingald/pokedice/blob/claude/pokemon-talent-system-h3n0tx/supabase/migrations/0094_hidden_talents.sql)
   and [`supabase/migrations/0095_talent_candy.sql`](https://github.com/Splifingald/pokedice/blob/claude/pokemon-talent-system-h3n0tx/supabase/migrations/0095_talent_candy.sql)
   (the Talent Candy) in the Supabase SQL editor, in that order (`supabase/seed.sql` carries them, inlined).
2. Admin → Config → Switches → Hidden talents: **On for admin** to try it, then **On for everyone**.
