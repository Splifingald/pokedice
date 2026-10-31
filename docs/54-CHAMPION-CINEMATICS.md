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

Kanto and Johto:

- **Blue — the Indigo Plateau** (`blue.ts`, reveal 4.55, extras Pidgeot). The League at sunset above Victory Road;
  the great doors bang open and the camera rushes into the dark hall, where he stands with his back to us against a
  sunset window. The lamps snap on pair by pair, quicker and quicker, down the red carpet; Pidgeot swoops in and beats a
  gust down the hall twice; he spins round on his heel, pointing, and two spotlights snap onto him. Kanto's rival
  rematches play it with Red's or Green's picture.
- **Red — Mt. Silver's summit** (`red.ts`, 4.7, Pikachu drawn in the scene). A night blizzard; the camera climbs to the
  storm wrapped round the summit, a yellow flicker in it; a lone figure at the cliff's edge, back to us, Pikachu's
  cheeks sparking on his shoulder. Pikachu's Thunder tears the storm open in a ring on dawn over a sea of clouds; in the
  silence he slowly turns, three dots appear over his head one by one (shapes, no text), the sun comes up behind him.
- **Lance — the Indigo Plateau in a storm** (`lance.ts`, 4.6, Dragonite). Lightning shows a giant Dragonite shadow in
  the clouds; three Dragonite burst out in formation, the lead dives over the camera and Lance drops from it, his cape
  spread like crimson wings, and lands in a crouch that cracks the dais; Dragonite's Hyper Beam blows a hole in the
  storm and its light reaches him.

Hoenn:

- **Wallace — Sootopolis's crater lake** (`wallace.ts`, 4.5, Milotic). Dawn, a water show: one drop rings the still
  lake, five jets leap up in turn and dance, Milotic circles under the water and leaps across the crater painting a
  rainbow; its splash rises into a curtain of water, his silhouette behind it, and the curtain parts like a theatre's
  in glitter. Milotic rises beside him.
- **Steven — Meteor Falls' deepest chamber** (`steven.ts`, 4.6, Metagross). Moonlight through the cavern roof on a
  black shape: Metagross's three footfalls light its eyes and the ore veins; its magnetism tears every gem out of the
  rock to hang in the air; Steven walks out of a tunnel through his floating collection, a sapphire drifts into his
  hand, and his Key Stone fires threads of light to every stone.

Sinnoh and Unova:

- **Cynthia — the Sinnoh League's hall** (`cynthia.ts`, 4.7, Garchomp; the Unova Cynthia too). A piano; the lake
  guardians' windows light; she stands still against a violet rose window while Garchomp tears round her three times,
  each pass lighting a myth window (Dialga, Palkia, Giratina); it slams down at her side and Arceus's gold wheel blazes
  behind her like a halo.
- **Palmer — the Battle Tower** (`palmer.ts`, 4.6, Rhyperior). The glass lift shoots up the tower's face through the
  clouds to its floodlit art-deco crown; on the top floor the lamps climb, ding, the doors part on him in a blaze of
  light; Rhyperior looms out of the glare and stomps; three big laughs roll gold shockwaves across the floor; confetti.
- **Ghetsis — N's Castle** (`ghetsis.ts`, 4.7, Hydreigon). The Unova League at night; green cracks race across the
  plaza and the castle rises out of the ground around it, Plasma banners unfurling to a drumbeat; Hydreigon climbs onto
  the moon, its heads lighting one by one; in the storm each lightning flash shows the robed figure nearer, only his red
  eye between flashes.

Kalos, Alola, Galar and Paldea:

- **Diantha — a Lumiose premiere** (`diantha.ts`, 4.75, Gardevoir and Mega Gardevoir). The camera tilts down from a
  glittering Prism Tower to the opera house; its doors open on her silhouette; she comes down the red carpet as the
  press's cameras pop; her Key Stone flashes, a rainbow helix links her to Gardevoir and a sphere of light bursts into
  Mega Gardevoir; follow-spots meet on her.
- **Kukui — Mount Lanakila's summit** (`kukui.ts`, 4.6, Lycanroc). Dusk above Alola's sunset sea, a figure on a rock
  spire against a huge moon; Lycanroc howls, the four Tapu crests light and ropes of light turn the court into a
  wrestling ring; he moonsaults across the moon and lands with a quake, his Z-Ring flares, rings of Z-Power climb round
  him, Lycanroc's Stormshards burst up and shatter.
- **Leon — Wyndon Stadium** (`leon.ts`, 4.8, Gigantamax Charizard). Champion Cup night: the floodlights bang on bank
  by bank; a Gigantamax Charizard rises behind the stand and roars the roof alight; a hatch opens in the pitch and he
  rises on a lift through pyro jets; the whole crowd strikes his pose; confetti cannons.
- **Geeta — the League's rooftop court** (`geeta.ts`, 4.75, Glimmora and Kingambit). Sunset above Mesagoza, flags
  snapping; Kingambit black against the sun; she walks out of the glare down the court, the wind drops dead, she lifts
  the Tera Orb and a Tera crystal grows and bursts, Glimmora terastallized under its jewel.
- **Nemona — the Academy's grand stairs** (`nemona.ts`, 4.5, Pawmot). Golden hour; the bell rings and she races Pawmot
  up, Pawmot a streak of lightning lighting each lamp, pigeons bursting off the steps; at the top she leaps the last
  flight, twirls and lands, and Pawmot throws an arc of lightning to her raised fist.
- **Kieran — Blueberry Academy's Terarium** (`kieran.ts`, 4.6, Hydrapple). The camera sinks from the surface to the
  dome under the sea; its lights die band by band; a lift door opens on his silhouette, one blue spotlight; his shadow
  grows and warps into Hydrapple's, red-eyed, and Hydrapple steps out of it; his Tera Orb lights teal and crystals
  spike up through the cracked floor.

Shakes: a scene shakes its own layers with `screenShake(t, st.screenShakes)`, or sets `shake` and the wrapper shakes
the whole stage (Lance's, Wallace's). Flashes no faster than 3 a second, none within 0.34 s of the reveal's.

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
