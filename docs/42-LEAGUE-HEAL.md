# The League's heal between its battles

Every battle of a region's League won (an Elite Four member…) with another still to fight heals the team, as a
Pokémon Center would: each League battle starts with the team as the Center left it, and the gauntlet is about the
fights, not about walking back for a Center between them (the user's ask, 2026-10-27). It sits behind its own admin
switch (docs/15 §20), Off by default.

## 1. Decisions

- **The League alone**: the area that is a region's `leagueAreaId` (Indigo Plateau, the Pokémon League…). A gym, a
  legendary or a trainer elsewhere heals nothing. The Elite Rebattle (docs/19) stays a gauntlet with no Center: it is
  a challenge of its own, with its own rules.
- **Between, not after**: the heal comes when a League battle is won (its trainer's last Pokémon down) and the next
  one waits (`dueGym`). The last one (the Champion) clears the area and heals nothing, as before.
- **As a Pokémon Center**: `centerHeal`, with its rules: the team, the Box and the Day Care's residents, and none in
  Extreme mode while its Centers are off (docs/22).
- **No rules pop-up, no INFO**: it adds nothing to do and no page. It is explained where it happens, on the result
  card, as an item is where it's met (docs/15 §20).

## 2. The engine (`src/engine/run.ts`)

- `leagueHealOn(data)`: the switch (`game_config.leagueHeal.access`, read through `eventOpenTo`).
- `applyVictory`: a gym K.O. that completes its trainer, in a region's League area, with another League battle due and
  a Center that would heal here, heals the save (`centerHeal`) and adds `{ kind: 'league_healed' }` to its events.
  The store and the campaign sim both go through it, one-on-one and double battles alike.

## 3. The screen

- The result card (`VictoryView`) shows **Your team is healed for the next battle!** (`LeagueHealedCard`, the heal
  icon on sky, the heal sound), under the trainer's defeat line. It is on `/kitchen-sink` (`RewardBits`).

## 4. Setting it up

1. Deploy the client (the switch is Off: League battles keep their damage between them, as before).
2. Run `supabase/migrations/0081_league_heal.sql` (the switch's row, Off, and the content version + 1; safe to run
   again):
   https://github.com/Splifingald/pokedice/blob/version/2_4/supabase/migrations/0081_league_heal.sql
   `supabase/seed.sql` carries it too (inlined). Without it, the admin's switch still saves (it inserts the row).
3. Admin → Config → **League heal**: **On for admin** to try it signed in, **On for everyone** to open it. Publish.

## 5. Tests

- `tests/engine/league-heal.test.ts`: the switch (On for admin: the admin only); healed after each Elite Four member,
  with the event; not after the Champion, not with the switch off, not at a gym, not in Extreme mode, not on a K.O.
  before the trainer's last Pokémon.
- `tests/league-heal-sql.test.ts`: migration 0081 on PGlite (Off, the content version + 1, the admin's switch kept on
  a second run) and inlined in `seed.sql`.
