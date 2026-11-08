# 68 · The Gym Leaders' entrance

The user's request, 2026-11-08, after every League Champion got its own entrance (docs/56): *"Create a generic but
impressive gym champion battle intro. The only thing that changes: color theme depending on the type, name and sprite
of the champion."* (a French "champion d'arène" is a Gym Leader). One film for every Gym Leader, on the pixel engine,
before its fight, in place of the trainer stepping onto the field. Behind its own switch, Off.

## 1. Decisions

| Question | Answer |
|---|---|
| Switch | **Off / On for admin / On for everyone** (`game_config.gymCinema`, `gymCinemaOn`), Off by default. A purely visual change (docs/15 §20): no rules, no INFO, and no server function reads it. Off: the leader steps onto the field as before |
| Who | Every trainer whose role is `leader` (Gym Leaders, Kahunas, Captains and Totems' trainers, the Battle Chatelaines…). The Elite Four keep the trainer stepping in; Champions keep their own films (docs/56) |
| What changes | **Only** the gym type's colours (`gymTypeOf`, docs/67: the same type as the gym's stage picture), the leader's picture and its name on the card. The film is the same for all |
| The colours | From the type's Daybreak colour (`DAYBREAK_TYPES`): its light, itself, its deep, and the ramps every surface is lit along (`gymTheme`) |
| The ending | The champions' (`cinema/champion.ts`): the leader where its lead will stand, outlined; the card with its name and a ball per Pokémon; the dissolve into the gym's own stage picture; the throw |
| Length | The reveal at 4.15 s, the whole about 7.2 s |
| Motion | Full; short (an encounter: in full, no shake); off: the trainer steps onto the field as before (no film) |

## 2. The film

`src/fx/timelines/cinema/gymLeader.ts`, on the 240×160 battle stage, a stadium drawn pixel by pixel in perspective
(the floor's tiles, the court's lines, the stands, the crest), the camera creeping then rushing down the court so the
leader ends at its own size where its lead will stand. Times are seconds.

- **0–0.4** · The dark: a stadium, its crest dim on the far wall, a figure at the far end of the court.
- **0.4, 0.68, 0.94** · Three pairs of floodlights bang on, near to far, each a thud and a small shake, pooling the
  court in the type's light, their beams hanging in the air.
- **1.12–1.95** · The court's lines race from the camera to the leader, a white head on them; the LED ribbon along the
  barrier starts running.
- **2.0–2.46** · The crest ignites behind the leader: its ring, its eight-pointed star, its gem, three rising notes and a
  burst of sparks; it starts to turn. The leader is a black shape rimmed in its light.
- **2.62–3.52** · A slanted band slices across the screen on the leader's face at twice its size, speed lines streaming
  past, its afterimage trailing; it snaps shut on a white line.
- **3.52–4.15** · Every beam swings onto the leader, light streams in from the edges, the crest spins faster and the
  camera rushes down the court.
- **4.15** · The reveal (the type's light flash, the shared burst rings): a column of light onto the leader, a streak
  across the screen, a shockwave over the floor, the crowd's cameras flashing; then the shared ending.

Flashes: one full-screen, at the reveal; the crowd's camera flashes are single pixels.

## 3. Where it plugs in

- `BattleView`: a `gym` encounter whose role is `leader`, with the switch on and its gym type known, plays
  `gymCinemaFor(type).makeBattle(…)` as the stage's overlay (the same path as a champion's).
- **Admin → Config → Intros → Gym Leader intros**: a row per type with a **Watch** button (its sample leader of that
  type, on its gym stage). The switch is on the Switches tab (**Gym Leader intros**).
- The FX lab (`/kitchen-sink/fx`, dev) lists all 18, frame by frame.

## 4. Setting it up

1. Merge and deploy the client.
2. Run [`supabase/migrations/0141_gym_cinema.sql`](https://github.com/Splifingald/pokedice/blob/version/2_9_5/supabase/migrations/0141_gym_cinema.sql)
   in the SQL editor (safe to run again; `supabase/seed.sql` carries it inlined). The game works without it: a missing
   row reads as Off.
3. Admin → Config → Switches → **Gym Leader intros**: On for admin to try it (Config → Intros → Watch, or a gym), then
   On for everyone. Publish.

## 5. Tests

`tests/gym-cinema-fx.test.ts`: the switch (Off, the admin alone, everyone); all 18 types, each in its own colours;
**every Gym Leader in the game's data finds its type's film**; each type's sample is a real leader of the game, revealed
between 3.8 and 5 s, its cues in time order, its one HUD cue (the lead out) after the reveal; migration 0141 and its
copy in `seed.sql`. `e2e/admin-config.spec.ts`: the Switches tab's 43 rows, Gym Leader intros among them; the Intros
tab's 18 types, one watched.
