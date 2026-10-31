# 53 · The legends' cinematics

The user's request, 2026-10-31: the legendary raid intros and the mythical boss intros all looked the same (only their
background and colours changed). Each legend now gets **its own entrance, in its own place, in the game's fantasy**: a
short film on the pixel engine before the fight. A raid's no longer has the warning tapes. It can run a little longer
than the shared one. **Kanto first** (Articuno, Zapdos, Moltres, Mewtwo, and Mew) so the user can judge the quality
before the rest are made, then Johto (the user, the same day: "start doing second generation"). **Status: Gen 1 and
Gen 2 built**, behind its switch, Off.

## 1. Decisions

| Question | Answer |
|---|---|
| Switch | **Off / On for admin / On for everyone** (`game_config.legendCinema`, `legendCinemaOn`), Off by default. A purely visual change (docs/15 §20): no rules pop-up, no INFO, and no server function reads it. Off: the intros are exactly as before |
| Warning tapes | **Gone from every legend's raid** while the switch is on (the red alarm, its beeps and both tapes), including the legends whose own cinematic isn't made yet. The daily non-legend raid keeps its alarm; Giratina's and Darkrai's raids keep their worlds' lines |
| Length | The build-up is longer than the shared one (reveal at 4.3–5 s instead of 2.75 s); the raid intro's words follow the reveal at the same distances as before (`wordsAt`) |
| Skip | As before: from the second time a raid legend is met |
| Which first | Kanto: Articuno, Zapdos, Moltres, Mewtwo (raids) and Mew (a boss fight); then Johto: Lugia and Ho-Oh (raids), Raikou, Entei and Suicune (roamers, met as boss fights) and Celebi (a boss fight). The rest keep the shared entrance until theirs is made |

## 2. The scenes

Each is a timeline in `src/fx/timelines/cinema/` (`kit.ts` holds what they share: dithered dissolves, pixel-filled
shards, a row wobble, rings, cues sorted by time). Times are seconds.

- **Mewtwo — the lab** (`mewtwo.ts`, reveal 4.95). Black; a tank glowing in the dark, Mewtwo floating in its liquid,
  bubbles rising. The tubes flicker on and the camera tilts up the lab: pipes into the tank, consoles (a heart monitor
  bleeping, readouts), cables, older tanks along the wall on a wide screen, a railing in front. The beeps quicken; its
  outline flares, the liquid turns violet, red beacons sweep. The glass cracks three times, the screen shaking harder
  each time, then bursts (4.1): shards and liquid everywhere, the tubes blow and rain sparks. In the dark it rises, and
  the falling shards stop in the air, held by its mind; the reveal blasts them away. It hovers over the broken tank in
  its violet pool.
- **Articuno — Seafoam's ice cavern** (`articuno.ts`, reveal 4.7). Moonlight through a hole in the roof, snow sifting
  down the shaft onto black water, icicles and crystal clusters. The cold comes: the pool freezes from both shores,
  frost grows across the screen's corners, an icicle cracks loose and shatters on the new ice. A huge winged shadow
  crosses the light; Articuno comes down the shaft in silhouette, diamond dust trailing, the snow turning round it. One
  wingbeat: a blizzard gust and a white-out, the reveal. It hovers over the frozen pool, mirrored in the ice.
- **Zapdos — the Power Plant in a storm** (`zapdos.ts`, reveal 4.3). Rain, the plant's windows lit, pylons and sagging
  lines, clouds flickering from inside. A bolt far off; sparks run along the lines, the clouds overhead start turning,
  a bolt hits a pylon. The power is pulled into the sky (arcs climbing from the pylons and chimneys into the storm's
  eye) and the plant goes dark window by window. In the black, Zapdos's outline burns in the eye; a colossal bolt
  drops and Zapdos comes down it. The reveal surges every light back on, white; it hovers crackling, the storm going
  on (lightning no closer than 0.4 s apart: no flash faster than 3 a second).
- **Moltres — Mt. Ember's caldera** (`moltres.ts`, reveal 4.45). An ash sky, black walls lit from below, a lava lake in
  perspective with its crust drifting, embers, heat shimmer. Quakes: rocks break off and splash into the lava, bubbles
  swell and burst. The lake's heart melts open; a pillar of fire erupts with a dark shape rising inside it, then parts
  into two wings of flame. The reveal throws a ring of fire across the screen; it hovers over the lava, burning.
- **Mew — the forest** (`mew.ts`, the battle stage, reveal 4.3). A deep forest at golden dusk, light slanting through
  the canopy. A pink light darts between the far trees like a fairy, then Mew itself hops from trunk to trunk, nearer
  each time, a ribbon of pink and violet trailing behind it; it peeks out from behind the nearest tree, zigzags across
  the clearing, loops round the stage and curls up in a bubble where it will stand. The bubble pops on the reveal; the
  name card comes (legend.ts's `banner`), the forest dissolves into the battle's own ground, and your Pokémon is sent
  out, with the same HUD cues as the shared entrance (`show foe`, `appeared`, `sendOut`, `show own`).

Johto's:

- **Lugia — the Whirl Islands** (`lugia.ts`, reveal 4.6). A storm at sea: swells, rain, black rocks, lightning far off.
  The sea falls still, the rain stops in mid-air, the moon breaks through and lays a silver road on the water. A
  whirlpool opens with light rising from the deep; the sea bursts upward in a tower of spray and Lugia rises out of it,
  the water pouring off its wings.
- **Ho-Oh — the Bell Tower at dawn** (`hooh.ts`, reveal 4.55). A violet sky, the tower's tiers black against it, a lamp
  in each. Its bells ring three times (gold rings of sound); the sun comes up beside it, the sky warms, rays fan out and
  a rainbow draws itself across the sky. Rainbow feathers fall; a golden shape crosses the sky, circles behind the
  tower's top and swoops down before it, wings flaring in sacred fire. Rainbow rings on the reveal.
- **Raikou — the storm** (`raikou.ts`, boss, reveal 3.95). A plain at night by the Burned Tower's ruin, rain. Lightning
  strikes faster and faster, somewhere else each time; at each strike Raikou's outline crackles for an instant, a
  streak along the ground to the next. The dark; sparks run over the ground to one spot; one great bolt, and it is there.
- **Entei — the Burned Tower on fire** (`entei.ts`, boss, reveal 4.0). Charred posts and beams, the night through the
  broken roof. Flames come up through the floor into a wall of fire; a burning beam crashes down; the fire whirls up
  into the roof's light; on a high beam a shape in the flames roars, then leaps down in an arc of fire and lands in a
  ring of flame.
- **Suicune — the lake** (`suicune.ts`, boss, reveal 3.95). A murky lake under a full moon, mist on the water. The north
  wind lights an aurora; Suicune runs across the water from the far shore, each footfall a ripple that turns the water
  clear and blue; it bounds onto a rock, and the reveal purifies the whole lake.
- **Celebi — Ilex Forest's shrine** (`celebi.ts`, boss, reveal 4.0). The shrine at night, a clock ticking. Time ripples
  out of it in green rings and the forest turns with each one (spring, summer, autumn, winter, faster and faster) under
  the hands of a great clock of light; the rings close into a portal and Celebi pops out, the forest back in spring.

The bosses share their ending (`boss.ts`, `bossCinema`): the burst and rings in their colours, the name card, the scene
dissolving into the battle's ground, the HUD's cues, the send-out. Mew's predates it and has its own copy.

Motion levels (docs/15 §8): full; short (fewer particles, no shake); off (straight to the fight, every cue fired). A
calm OS removes the shakes and flashes, as everywhere. Sounds are synthesised (`tone`, `hiss`, `fxSound`) on the cues.

## 3. Where it plugs in

- `RaidView` picks the legend's cinematic (`RAID_CINEMAS`, by the Mega raid's base) when `legendCinemaOn`; `RaidIntro`
  plays it as its scene, with no tapes or alarm (`legend.quiet`), its words at `wordsAt(cinema.reveal)`.
- `BattleView`'s boss intro plays `BOSS_CINEMAS[dex].makeBattle` instead of `legendTimeline` when the switch is on.
- **Admin → Config → Legendary intros**: every cinematic with a **Watch** button (a raid's plays the real raid intro
  with sample sides; a boss's plays on a battle stage), and a Shiny tick. The switch is on the Switches tab.
- The FX lab (`/kitchen-sink/fx`, dev) lists each one, frame by frame.

## 4. Setting it up

1. Merge and deploy the client.
2. Run [`supabase/migrations/0097_legend_cinema.sql`](https://github.com/Splifingald/pokedice/blob/claude/legendary-boss-intros-1sgk6u/supabase/migrations/0097_legend_cinema.sql)
   in the SQL editor (safe to run again; `supabase/seed.sql` carries it inlined). The game works without it: a missing
   row reads as Off.
3. Admin → Config → Switches → **Legendary intros**: On for admin to try it (Config → Legendary intros → Watch), then On
   for everyone. Publish.

## 5. Tests

`tests/legend-cinema-fx.test.ts`: the switch (Off, the admin alone, everyone); the raid intro's words at their old times
without a cinematic and after each cinematic's reveal; every raid cinematic's cues in time order, its roar on its
reveal, a longer build-up than the shared one; every boss's entrance shows the foe, sends yours out and shows it, in
that order, after the reveal. `e2e/admin-config.spec.ts`: the Switches tab's 24 rows, Legendary intros among them.

## 6. Next

Hoenn and the other regions, once Gen 1's and Gen 2's are approved.
