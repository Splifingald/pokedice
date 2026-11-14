# Sudden death

A fight where nobody gets hurt went on to the turn cap (`maxBattleTurns`) and ended in a stalemate: no winner, no
reward, a long wait. Now, after **10 turns in a row that hurt nobody**, sudden death starts: **every Pokémon loses 25 %
of its max HP as each of its turns starts**, to the end of the fight, so someone falls (the user's ask, 2026-11-14).
It sits behind its own admin switch (docs/15 §20), Off by default.

## 1. Decisions

- **A turn** is one Pokémon's turn, as the engine counts them (`turn`, the log's `turn` entries): in a one-on-one
  fight, yours then the foe's; in a double battle, each of the four's.
- **Damage is any HP lost**, whatever dealt it: an attack, a confusion recoil, a burn or poison tick, a sandstorm. A heal
  (a potion, Leftovers) is not damage and doesn't stop the count; neither is a K.O.'s send-out. As each turn begins the
  engine compares every Pokémon's HP with what it was as the turn before began.
- **Once on, it stays on** to the end of the fight: a hit landing afterwards doesn't stop it. Simple to read, and the
  fight always ends.
- **Each Pokémon, on its own turn**: the toll comes as its turn starts, after its burn, poison and weather, before it
  throws. 25 % of its max HP, rounded up, so four of its turns K.O. it at most. Magic Guard doesn't stop it (it would
  stall the fight again). A Pokémon sent in afterwards pays it too.
- **Everywhere a fight runs on `beginTurn`**: wild, trainers, gyms, the League, Versus, double battles, the auto and idle
  fights, the campaign sim. **Not** the raids' steps nor Friend Battles' (duel steps, `single`): they keep their own
  rules and count (a raid's `RAID_MAX_STEPS`).
- **A real deadlock** (nobody on either side can ever hurt the other, `deadlocked`) still ends at once as a stalemate,
  as before: sudden death is for the fights that could be won but stall. With sudden death on, a fight is never called
  a deadlock (someone is going to fall). The turn cap stays, as the last safety valve.
- **No rules pop-up, no INFO**: it adds nothing to do and no page. It is explained where it happens, in the battle's
  line (docs/15 §20, "a rule explained where it happens").

## 2. The engine (`src/engine/battle.ts`)

- `suddenDeathOn(data)`: the switch (`game_config.suddenDeath.access`, read through `eventOpenTo`).
- `suddenDeathRules(data)`: `turns` (10) and `share` (0.25), the row's own when it has them, else
  `SUDDEN_DEATH_DEFAULTS`.
- `watchCalm`, at the top of every turn (`beginTurn`, `beginDoubleTurn`): keeps `state.calm` (the calm turns in a row and
  every Pokémon's HP as the last turn began). At `turns`, it sets `state.suddenDeath` and logs
  `{ kind: 'sudden_death', turns, pct }`.
- `suddenDeathTick`, after the status and weather ticks: `{ kind: 'sudden_death_tick', target, targetUid, amount,
  hpAfter }`; a K.O. there ends the turn as a burn's does.

## 3. The screen

- The battle's line says it when it starts: **"10 turns without damage: sudden death! Every Pokémon loses 25% of its
  HP each turn."** (`ui.log.suddenDeath`, a small shake), then at each toll **"Sudden death wears {name} down!"**
  (`ui.log.suddenDeathTick`, the HP drains with its number). More details' history lists each toll ("was worn down by
  sudden death").

## 4. Setting it up

1. Deploy the client (the switch is Off: fights stall to the turn cap, as before).
2. Run `supabase/migrations/0149_sudden_death.sql` (the switch's row, Off, and the content version + 1; safe to run
   again):
   https://github.com/Splifingald/pokedice/blob/claude/pokemon-damage-10-turns-l34t2e/supabase/migrations/0149_sudden_death.sql
   `supabase/seed.sql` carries it too (inlined). Without it, the admin's switch still saves (it inserts the row).
3. Admin → Config → Switches → **Sudden death (no damage for 10 turns)**: **On for admin** to try it signed in, **On
   for everyone** to open it. Publish. Its numbers can be changed in the row (All rows): `turns`, `share`.

## 5. Tests

- `tests/engine/sudden-death.test.ts`: a stall (Gastly against Rattata, Squirtle on the bench) reaches the turn cap
  with the switch off; on, it starts after 10 calm turns, said once, each turn after starting with a quarter of max HP,
  and someone falls; On for admin; a hurt turn starts the count again; the row's numbers.
- `tests/sudden-death-sql.test.ts`: migration 0149 on PGlite (Off, the content version + 1, the admin's switch kept on
  a second run) and inlined in `seed.sql`.
