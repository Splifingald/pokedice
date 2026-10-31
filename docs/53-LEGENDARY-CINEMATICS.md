# 53 · The legends' cinematics

The user's request, 2026-10-31: the legendary raid intros and the mythical boss intros all looked the same (only their
background and colours changed). Each legend now gets **its own entrance, in its own place, in the game's fantasy**: a
short film on the pixel engine before the fight. A raid's no longer has the warning tapes. It can run a little longer
than the shared one. **Kanto first** (Articuno, Zapdos, Moltres, Mewtwo, and Mew) so the user can judge the quality
before the rest are made, then Johto (the user, the same day: "start doing second generation"). **Status: Gen 1 and
Gen 2 built**, behind its switch, Off. Then every other generation (the user: "all generations' legendaries and
mythicals + red Gyarados", 2026-10-31): **every legendary and mythical with a raid or a boss fight now has its own**.

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
  The sea falls still, the rain stops in mid-air, the moon breaks through and lays a silver road on the water. Small
  whirlpools open here and there, then drift together into one great whirlpool with light rising from the deep; the sea
  bursts upward in a tower of spray and Lugia rises out of it, the water pouring off its wings.
- **Ho-Oh — the Bell Tower at dawn** (`hooh.ts`, reveal 4.55). A violet sky, the tower's tiers black against it, a lamp
  in each. Its bells ring three times (gold rings of sound); the sun comes up beside it, the sky warms, rays fan out and
  a faint, thin rainbow draws itself across the sky, fading once Ho-Oh is there. Golden feathers fall; a golden shape
  crosses the sky, circles behind the tower's top and swoops down before it, wings flaring in sacred fire. Gold rings
  on the reveal.
- **Red Gyarados — the Lake of Rage** (`gyarados.ts`, reveal 4.5). A clear afternoon, a blue lake under green hills,
  Magikarp leaping (the real sprites, small far off and bigger near), a radio mast on the far shore. The mast's signal
  pulses out in red rings and the Magikarp go wild; a shiny one leaps higher than the rest with a sparkle, stops in the
  air, flickers between its outline and Gyarados's as an evolution does, and crashes in. The sky breaks into a storm,
  the lake erupts, the red Gyarados rises, and the lake turns red from where it rose, in perspective.
- **Raikou — the storm** (`raikou.ts`, boss, reveal 3.95). A plain at night by the Burned Tower's ruin, rain. Lightning
  strikes faster and faster, somewhere else each time; at each strike Raikou's outline crackles for an instant, a
  streak along the ground to the next. The dark; sparks run over the ground to one spot; one great bolt, and it is there.
- **Entei — the Brass Tower burns** (`entei.ts`, boss, reveal 4.4). Ecruteak on a stormy night: the four-tiered Brass
  Tower black and brass against the sky, the town's roofs in front, sleeping volcanoes on the skyline. Lightning strikes
  the spire and the fire runs down it tier by tier; the upper tiers snap off and topple, and the tower sinks into a
  plume of fire and ash. In the hush Ho-Oh crosses the sky and its rainbow light falls on the ashes; they crack and glow
  gold, and Entei climbs out reborn and roars. The volcanoes erupt one after another, and a pillar of Sacred Fire roars
  up round it and blows out into a ring of fire on the reveal. (Ho-Oh is drawn in code: the battle stage loads only the
  foe's sprite.)
- **Suicune — the lake** (`suicune.ts`, boss, reveal 3.95). A murky lake under a full moon, mist on the water. The north
  wind lights an aurora; Suicune runs across the water from the far shore, each footfall a ripple that turns the water
  clear and blue; it bounds onto a rock, and the reveal purifies the whole lake.
- **Celebi — Ilex Forest's shrine** (`celebi.ts`, boss, reveal 4.0). The shrine at night, a clock ticking. Time ripples
  out of it in green rings and the forest turns with each one (spring, summer, autumn, winter, faster and faster) under
  the hands of a great clock of light; the rings close into a portal and Celebi pops out, the forest back in spring.

Hoenn's:

- **The Regis** (`regis.ts`, 4.7): a sealed chamber, a torch finding a Braille tablet that really spells its words and
  lights cell by cell, the light running through the wall's joints, its seven dots lighting in its own pattern; then
  Regirock built from flying boulders, Regice inside a hexagonal ice column over a giant frost snowflake, Registeel
  ringing like a bell three times.
- **Latias, Latios** (`eon.ts`): Southern Island at sunset, a V of foam with nothing at its head (the invisibility
  shimmer), across the sun, down through pink mist (4.6); at night, a sonic boom, across the moon, a shooting star
  skimming at you between walls of spray (4.5).
- **Kyogre** (`kyogre.ts`, 4.8): the α rising from the abyss with each heartbeat, up through the surface into a storm,
  the sea climbing into a wall. **Groudon** (`groudon.ts`, 4.75): a drought sun boiling the land dry, an Ω burnt into
  the ground, the land splitting over lava. **Rayquaza** (`rayquaza.ts`, 4.8): Sky Pillar above the clouds under the
  ozone band, a serpent weaving through the clouds, Dragon Ascent smashing a meteor.
- **Jirachi** (`jirachi.ts`, boss): the Millennium Comet's wishes falling on a sleeping cocoon, a third eye opening.
  **Deoxys** (`deoxys.ts`, boss): a meteor on Birth Island under the aurora, a DNA helix mutating into a glitching body.

Sinnoh's legends (raids):

- **Uxie, Mesprit, Azelf** (`lakes.ts`): Lake Acuity's snowstorm, gold running through the ice's cracks like thoughts,
  the world wiped to a blank page and redrawn (4.7); Lake Verity's mist turning pink with each heartbeat, Mesprit
  glimpsed nearer each time, two ribbons whirling up (4.6); Lake Valor drained to cracked mud, the stones lifting, two
  walls of water crashing together (4.8).
- **Dialga, Palkia** (`spearPillar.ts`): time racing on Spear Pillar (stars wheeling, the sun crossing), a clock of light,
  then time stopping frame by frame into grey and the reveal flooding colour back (4.9); space sagging into a pink well,
  the world folding like a page and tearing over a nebula with Spacial Rend's slashes (4.8).
- **Heatran** (`heatran.ts`, 4.75): Stark Mountain's magma chamber, it crawls upside down across the ceiling clang by
  clang, drops in a crown of magma, Magma Storm.
- **Regigigas** (`regigigas.ts`, 5.0): Snowpoint Temple, the three Regis' lights waking a frozen colossus that drags the
  floor in tug by tug.
- **Giratina** (`giratina.ts`, 4.8, its raid outside portal mode): Turnback Cave flipping upside down as the Distortion
  World seeps in, Giratina rising from a pool of shadow.
- **Cresselia** (`cresselia.ts`, 4.7): Fullmoon Island's moon waning to a crescent that leaves the sky and opens into
  Cresselia.

Sinnoh's mythicals (and Victini):

- **Phione** (`phione.ts`, boss, reveal 3.85). A warm sea at sunset: floating lights drift into a slow whirl, rise in a
  helix, gather into one star that drops into the water, and Phione bobs up.
- **Manaphy** (`manaphy.ts`, boss, reveal 4.0). The Sea Temple Samiya wakes rune by rune; Heart Swap: a pink and a blue
  heart wind round each other, fuse, beat twice and burst with Manaphy inside.
- **Darkrai** (`darkrai.ts`, boss, reveal 4.15). Newmoon Island under a dead moon: the stars go out, the trees' shadows
  creep, eyes open in the woods; Dark Void swallows everything, a cyan eye opens in the black, the dark shatters.
- **Shaymin** (`shaymin.ts`, boss, reveal 3.9). The Flower Paradise under a sour haze: the light gathers into a great
  Gracidea bud, the field blooms pink in a widening ring, Seed Flare bursts the flower open.
- **Victini** (`victini.ts`, boss, reveal 3.85). Liberty Garden's lighthouse at night: its beam turns to fire, victory
  fireworks, the lantern blows, two comets carve a giant blazing V where Victini springs up.
- **Arceus** (`arceus.ts`): the boss fight (reveal 4.3) above Mt. Coronet's clouds, the Azure Flute's notes opening a
  gate to the Hall of Origin, a stairway of light building itself, the plates falling like meteors; the daily raid
  (`arceusRaidCinema`, reveal 5.1) the Hall of Origin building itself out of light, the 17 plates in a turning ring, the
  golden wheel drawn in the sky, Judgment streaking the plates into its hub.

Unova's:

- **The Swords of Justice** (`swords.ts`): Cobalion's blade of light cutting the picture in two in Mistralton Cave
  (4.6); Terrakion slicing a boulder on Victory Road and charging through (4.7); Virizion's six cuts halving the leaves
  held in mid-air in Pinwheel Forest (4.5).
- **The Forces of Nature** (`forces.ts`): Tornadus's tornado over the fields (4.6); Thundurus's thunderhead racing in
  and a cage of bolts (4.5); Landorus's golden cloud turning the burnt fields to wheat (4.7).
- **Reshiram, Zekrom** (`dragonspiral.ts`): Dragonspiral Tower, a white turbine burning the night away into a dome of
  flame (4.7); a generator, black lightning and a plasma sphere in a rainless storm (4.6).
- **Kyurem** (`kyurem.ts`, 4.8): Giant Chasm draining of colour, a void with two yellow eyes, an ice wing that shatters.
- **Keldeo, Meloetta, Genesect** (bosses): a sword of water cutting a lake at sunrise; a song written on a staff in a
  theatre, the Aria then the Pirouette; Team Plasma's lab loading four drives and firing Techno Blast at your Pokémon.

Kalos, and Alola's mythicals:

- **Xerneas** (`xerneas.ts`, raid, reveal 4.8). A dead grey glade: a heartbeat in a great antlered tree, light climbing
  its boughs, Geomancy's rainbow, a wave of life greening the world; the tree becomes a stag of light.
- **Yveltal** (`yveltal.ts`, raid, reveal 4.75). A golden valley and a dark cocoon beating red: it drains the colour from
  the world, splits open, Oblivion Wing turns the valley to stone, Yveltal the only colour left.
- **Zygarde** (`zygarde.ts`, raid, reveal 4.8). Terminus Cave: cells blink on and march to the middle as the hexagonal
  floor lights ring by ring, the Core rises, the cells build its form tile by tile.
- **Diancie** (`diancie.ts`, boss). A diamond mine: pink crystals grow chiming from the walls, the dust is squeezed
  white-hot into a faceted pink diamond that bursts into Diancie.
- **Hoopa** (`hoopa.ts`, boss). Dahara City at dusk: golden rings pop open and things fall out, Hoopa Unbound's hand
  waggles, everything is sucked back in.
- **Volcanion** (`volcanion.ts`, boss). A volcanic valley: geysers of water then fire, the volcano erupts both, steam
  whites out the valley, a steam blast clears it.
- **Magearna** (`magearna.ts`, boss). A workshop shut for 500 years: gears wake, the clock moves, light runs into a red
  glass heart that beats pink and rises.
- **Marshadow** (`marshadow.ts`, boss). A shrine courtyard at night: a shadow snuffs the lanterns one by one, stands up
  in ghost fire, Spectral Thief steals the last light.
- **Zeraora** (`zeraora.ts`, boss). A city at night: a plasma streak zigzags over roofs bursting streetlights, the city
  goes dark, Plasma Fists slam the road.
- **Meltan** (`meltan.ts`, boss). A scrapyard: a crane magnet pulls up the scrap, Meltan swarm out, it all melts into a
  white-hot hex nut that cools to gold.

Alola's legends (raids):

- **The Tapus** (`tapu.ts`): each at its Ruins, the totems' eyes opening, a light becoming the guardian whose shell
  claps shut, its terrain spreading over the plaza; then Koko dashing round as lightning until a giant bolt strikes
  its shell (4.5), Lele's warping world and orbiting stones and butterfly wings (4.65), Bulu's desert turning to meadow
  and its shell slamming down (4.55), Fini's water sphere bursting the mist (4.7).
- **Cosmog** (`cosmog.ts`, 4.4): a nebula over the Altar spiralling down into one tiny cloud of stars that bounces and
  pops. **Solgaleo** (`solgaleo.ts`, 4.6): the Sun Flute, sunrise over the clouds, Sunsteel Strike plunging onto the
  altar. **Lunala** (`lunala.ts`, 4.75): an eclipse, the diamond ring, starry wings across the sky, the Moongeist
  Beam. The Altar is shared (`altar.ts`), as are the group's helpers (`alolaKit.ts`).
- **Necrozma** (`necrozma.ts`, 4.65): Ultra Megalopolis going dark as a black crystal eats its light, prisms splitting
  rainbows, Photon Geyser.
- **The Ultra Beasts** (`ultraBeast.ts`, 4.5, one for all eleven): an Alolan beach glitching, the sky shattering into an
  Ultra Wormhole, the beast coming through with split cyan and magenta edges.

Galar's and Hisui's legends (raids, sharing `gen8kit.ts`'s `raidCinema` wrapper), and Zarude:

- **Zacian, Zamazenta** (`heroes.ts`, 4.6): the Slumbering Weald's fog and a howl; the Rusted Sword shedding its rust
  and one slash cutting the screen and the fog; the Rusted Shield ringing three times and opening into a dome of
  hexagons that holds the fog back until it bursts.
- **Eternatus** (`eternatus.ts`, 4.8): Hammerlocke at night under the Darkest Day, six Dynamax pillars bending their
  light into a crimson core that fires a beam, Eternatus uncoiling down it.
- **Kubfu** (`kubfu.ts`, 4.4): the Master Dojo at dawn, a shadow striking posts faster and faster, one punch breaking a
  stack of tiles and a falling leaf in two.
- **Regieleki, Regidrago** (`splitruins.ts`): the Split-Decision Ruins, a ball of lightning tearing round the hall
  (4.4); the stones lifting into a chained energy dragon that dives into the floor (4.6).
- **Glastrier, Spectrier, Calyrex** (`crowntundra.ts`): a charge raising ice lances (4.5); a ghost galloping across
  the moon (4.5); the harvest thawing the snow and a crown of light settling on the king (4.6).
- **Enamorus** (`enamorus.ts`, 4.6): Hisui's spring, petals funnelling into a giant heart that beats three times.
- **The Galarian birds** (`galarbirds.ts`, by their forms' dex): two eyes in a violet sky glaring the leaves to pieces
  (4.6); a dust trail round the hill and a flying kick out of the sun (4.4); an eclipse with eyes and wings of black
  fire closing like a cloak (4.6).
- **Zarude** (`zarude.ts`, boss): the jungle's eyes opening pair by pair, the troop swinging past, the leader dropping
  down.

Paldea's (raids sharing `gen9kit.ts`'s `raidScene` wrapper), and Pecharunt:

- **The Treasures of Ruin** (`ruin.ts`, 4.6): a sealed shrine, its stakes pulled one by one, the chains snapping; then
  Wo-Chien's tablets and a wave of rot, Chien-Pao's sword and one slash, Ting-Lu's vessel rising from a quake, Chi-Yu's
  beads drawing a ring of fire.
- **Koraidon** (`koraidon.ts`, 4.5): Area Zero's past, an enormous ancient sun; a small shape climbs onto the crater's
  far spire and roars, leaps across the sun's face, ignites into a Collision Course comet and craters the red earth,
  then stands where it struck, the sun behind it. **Miraidon** (`miraidon.ts`, 4.4): Area Zero's future, a neon grid and an Electro Drift circle.
- **The Paradox Pokémon** (`paradox.ts`, 4.5, two scenes): a tear like burning paper onto the far past for the ancient
  ones (1009, 1020, 1021); a time machine printing the Pokémon line by line for the future ones (1010, 1022, 1023).
- **The Loyal Three** (`loyal.ts`, 4.5): Kitakami's plaza, toxic chains coiling up a statue; Okidogi bursting it and
  slamming the plaza, Munkidori's eyes and hypnotic spiral, Fezandipiti's fan of feathers.
- **Ogerpon** (`ogerpon.ts`, 4.5): the Festival of Masks, the lanterns blown out, the four masks lit one per drumbeat.
- **Terapagos** (`terapagos.ts`, 4.5): crystals waking in Tera colours, a honeycomb shell bursting in a Tera Starstorm.
- **Pecharunt** (`pecharunt.ts`, boss): a peach bouncing down a Kitakami road into chains that coil round a mochi stand.

The bosses share their ending (`boss.ts`, `bossCinema`): the burst and rings in their colours, the name card, the scene
dissolving into the battle's ground, the HUD's cues, the send-out. Mew's predates it and has its own copy.

Motion levels (docs/15 §8): full; short (fewer particles, no shake); off (straight to the fight, every cue fired). A
calm OS removes the shakes and flashes, as everywhere. Sounds are synthesised (`tone`, `hiss`, `fxSound`) on the cues.

## 3. Where it plugs in

- `RaidView` picks the legend's cinematic (`RAID_CINEMAS`, by the Mega raid's base) when `legendCinemaOn`; `RaidIntro`
  plays it as its scene, with no tapes or alarm (`legend.quiet`), its words at `wordsAt(cinema.reveal)`. A cinematic
  that shows other Pokémon lists them (`Cinema.sprites`, e.g. Gyarados's Magikarp and its shiny one) and `RaidIntro`
  loads them with the legend's sprite before it plays.
- `BattleView`'s boss intro plays `BOSS_CINEMAS[dex].makeBattle` instead of `legendTimeline` when the switch is on.
- **Admin → Config → Legendary intros**: every cinematic with a **Watch** button (a raid's plays the real raid intro
  with sample sides; a boss's plays on a battle stage), and a Shiny tick. The switch is on the Switches tab.
- The FX lab (`/kitchen-sink/fx`, dev) lists each one, frame by frame.

## 4. Setting it up

1. Merge and deploy the client.
2. Run [`supabase/migrations/0098_legend_cinema.sql`](https://github.com/Splifingald/pokedice/blob/version/2_8/supabase/migrations/0098_legend_cinema.sql)
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

The user's verdicts on the review page (one film per cinematic, a note each), then the switch On for everyone.
