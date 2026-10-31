# 54 · The champions' cinematics

The user's request, 2026-10-31, after every legend got its own entrance (docs/53): "Create special intros for all
League Champions too now". Each League Champion now gets **its own entrance, in its own place, in the game's
fantasy**: a short film on the pixel engine before its fight, in place of the trainer stepping onto the field. Behind
its own switch, Off.

## 1. Decisions

| Question | Answer |
|---|---|
| Switch | **Off / On for admin / On for everyone** (`game_config.championCinema`, `championCinemaOn`), Off by default. A purely visual change (docs/15 §20): no rules pop-up, no INFO, and no server function reads it. Off: the champion steps onto the field as before |
| Who | Every trainer whose role is `champion` (14 people): Blue (and Kanto's rival rematches, shown as Red or Green), Red (Mt. Silver), Lance, Wallace, Steven (Hoenn's Battle Frontier), Cynthia (Sinnoh's League and Undella), Palmer (Sinnoh's Battle Frontier), Ghetsis (Unova's League), Diantha, Kukui, Leon, Geeta, Nemona, Kieran (the BB League) |
| Versions | One scene per person, chosen by its **picture** (`championSceneId`: `champion-lance.png` → lance, `blue-3.png` → blue, a rival's `/characters/…` → blue): the Elite Rebattle's tiers and a rival's other face play the same scene |
| What it shows | The champion's own picture (the one the player meets), its ace (the last of its team) when a scene stages it, and the scene's own signature Pokémon (`extras`: Red's Pikachu, Lance's Dragonite…) |
| The ending | The same for all (`cinema/champion.ts`): the champion standing where its lead will, outlined in its colours; the letterbox; the card (the legend's band with its name, and a tray with a ball for each of its Pokémon, three at most); the scene dissolving into the battle's ground; the champion stepping aside and throwing its lead out. The player's lead is sent at the send-out step, as after any trainer's entrance |
| Length | The reveal at 3.8–5 s, the whole about 7 s |
| Motion | Full; short (an encounter: in full, no shake); off: the trainer steps onto the field as before (no film) |

## 2. The scenes

Each is a timeline in `src/fx/timelines/cinema/champions/` on the 240×160 battle stage. Times are seconds.

<!-- scenes -->

## 3. Where it plugs in

- `BattleView`: a `gym` encounter whose role is `champion`, with the switch on and its scene made, plays
  `championCinemaFor(picture).makeBattle(…)` as the stage's overlay instead of the trainer stepping onto the field; its
  end puts the lead out, and the send-out step follows.
- `sprites.ts` `loadPicture`: a trainer's picture as a canvas sprite, cropped to what it draws, so it stands on its
  feet like a Pokémon's.
- **Admin → Config → Intros**: every champion's with a **Watch** button (its sample picture and team, its card). The
  switch is on the Switches tab (**Champion intros**).
- The FX lab (`/kitchen-sink/fx`, dev) lists each one, frame by frame.

## 4. Setting it up

1. Merge and deploy the client.
2. Run [`supabase/migrations/0099_champion_cinema.sql`](https://github.com/Splifingald/pokedice/blob/version/2_8/supabase/migrations/0099_champion_cinema.sql)
   in the SQL editor (safe to run again; `supabase/seed.sql` carries it inlined). The game works without it: a missing
   row reads as Off.
3. Admin → Config → Switches → **Champion intros**: On for admin to try it (Config → Intros → Watch, or a League), then
   On for everyone. Publish.

## 5. Tests

`tests/champion-cinema-fx.test.ts`: the switch (Off, the admin alone, everyone); the picture → scene rule; **every
champion in the game's data finds its scene**; each scene reveals its champion between 3.8 and 5 s, its sample's
picture exists, its cues are in time order, and its one HUD cue (the lead out) comes after the reveal and before the end.
`e2e/admin-config.spec.ts`: the Switches tab's 25 rows, Champion intros among them.

## 6. Next

The user's verdicts on the review page (one film per champion, a note each), then the switch On for everyone.
