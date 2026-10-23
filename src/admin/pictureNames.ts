// What the admin's picture pickers show: a name and a few words on what each picture holds, so a choice can be made
// without opening the files. The stored value stays the picture's key (`meadow`, `a121`, a /backgrounds/ path).
import type { BattleBackground } from '@/engine'

/** Battle scenes (public/battle), the platforms under the two teams. */
export const BATTLE_SCENE_NAMES: Readonly<Record<BattleBackground, string>> = {
  grass: 'Grass — routes, fields, forests',
  sea: 'Sea — open water, surfing',
  water: 'Pond — lakes, rivers, fresh water',
  rock: 'Rock — caves, mountains, desert',
  default: 'Plain grey — indoors, buildings',
}

interface PictureGroup {
  label: string
  names: Readonly<Record<string, string>>
}

/** Every pickable picture, grouped; area pictures are public/area-art/<key>.png. */
export const PICTURE_GROUPS: readonly PictureGroup[] = [
  {
    label: 'Event pictures',
    names: { '/backgrounds/fortune-wheel.png': 'Fortune Wheel — prize stall at dusk' },
  },
  {
    // Painted once, used by many areas.
    label: 'Shared scenes',
    names: {
      badlands: 'Badlands — red rock arch, dry plain',
      beach: 'Beach — white sand and surf',
      blueberry: 'Blueberry Academy — glass dome by the sea',
      cave: 'Cave — rocky cave with a pool',
      champion: "Champion's Hall — red carpet, arched windows",
      crystal: 'Crystal Cave — glowing crystals',
      daycare: 'Day Care — cottage, garden and pond',
      deepcave: 'Deep Cave — dark cavern',
      desert: 'Desert — dunes and cacti',
      evening: 'Evening Road — path through fields at sunset',
      farm: 'Farm — red barn, windmill, winding road',
      flowers: 'Flower Field — cottage, pond and flowers',
      forest: 'Forest — sunbeams over a trail',
      frontier: 'Battle Frontier — towers and fountain plaza',
      harbour: 'Harbour — dock and lighthouse',
      haunted: 'Haunted Ground — graves and dead trees at night',
      hills: 'Hills — rocks, trees, far mountain',
      icecave: 'Ice Cave — icicles and snow',
      industrial: 'Hideout — dark warehouse hall',
      jungle: 'Jungle — waterfall and palms',
      lake: 'Lake — islet and wooden pier',
      league: 'Pokémon League — white temple steps',
      marsh: 'Marsh — willows, puddles, boardwalk',
      meadow: 'Meadow — green fields and dirt paths',
      mine: 'Mine — rails and lanterns',
      modern: 'City Plaza — skyscrapers and fountain',
      mountain: 'Mountain Path — rocky trail, cave mouth',
      oldforest: 'Old Forest — dense woods with a hut',
      oldtown: 'Old Town — pagoda, cherry trees, stone road',
      sea: 'Sea — turquoise bay with a palm',
      snow: 'Snowfield — snowy pines',
      snowtown: 'Snow Town — chalets and frozen pond',
      tropical: 'Tropical Coast — huts, palms, coast road',
      'ultra-space': 'Ultra Space — crystal spires, galaxy sky',
      village: 'Village — small houses on a green',
      volcano: 'Volcano — lava cracks, smoking crater',
    },
  },
  {
    label: 'Legendary lairs',
    names: {
      'lair-crystal': 'Crystal Grotto — giant crystals and a pool',
      'lair-frozen': 'Frozen Temple — ice-sealed door',
      'lair-island': 'Island Shrine — stone on a grassy islet',
      'lair-lab': 'Laboratory — glowing machine',
      'lair-ruins': 'Sealed Ruins — glyph wall and crystals',
      'lair-sea': 'Sea Cavern — underground waterfall',
      'lair-shrine': 'Forest Shrine — wooden shrine in the woods',
      'lair-summit': 'Sky Summit — broken pillars above the clouds',
      'lair-volcano': 'Magma Chamber — lava falls',
    },
  },
  {
    // Painted for one area each (the key is that area's number).
    label: 'One-of-a-kind places',
    names: {
      a25: 'Power Plant — generators and cables',
      a26: 'Cerulean Cave — crystal cave, stone dais',
      a54: 'Mt. Silver — snowy summit',
      a57: 'Bell Tower — golden pagoda at sunset',
      a93: 'Birth Island — black triangle under the stars',
      a121: 'Old Chateau — haunted dining hall',
      a122: 'Lakes of Sinnoh — glowing lake in a cave',
      a123: 'Turnback Cave — dark vortex between pillars',
      a126: 'Fullmoon Island — moonlit clearing',
      a127: 'Newmoon Island — dead trees, red night sky',
      a128: 'Seabreak Path — sandbar to a lighthouse',
      a129: 'Flower Paradise — flower meadow by a lake',
      a130: 'Hall of Origin — white temple, aurora sky',
      a522: 'Black City & White Forest — city meets forest',
      a551: 'Liberty Garden — lighthouse on a lawn',
      a552: 'Castelia Café — café terrace in the city',
      a554: 'Swords of Justice — mossy cave, sunbeam',
      a555: 'Moor of Icirrus — green moor and ponds',
      a651: 'Flare HQ Depths — red flower machine',
      a652: 'Terminus Cave — mine tunnel',
      a654: "Hoopa's Ring — ring portal over a beach",
      a753: 'Ultra Megalopolis — dark city, tower spire',
      a754: 'Ruins of the Guardians — jungle stone shrines',
      a759: 'Poni Grove — sunlit jungle',
      a761: "Magearna's Workshop — gears and clockwork",
      a762: "Ten Carat Hill's Hollow — cave, one crystal",
      a763: 'Blush Mountain Storm — lightning over wet fields',
      a764: 'Mystery Box — steel room with a box',
      a823: 'Max Lair — red cavern, glowing shards',
      a824: 'Space-Time Rift — swirl over a lake',
      a851: 'Energy Plant Summit — red vortex over a rooftop',
      a852: "Slumbering Weald's Depths — sword shrine in the woods",
      a853: 'Master Dojo — wooden dojo hall',
      a855: 'Crown Shrine — shrine under a snowy tree',
      a856: 'Forest of Focus — stream and sunbeams',
      a857: 'Crimson Mirelands — red mud, dead trees',
      a858: 'Dyna Tree Hill — giant tree in the snow',
      a920: 'Area Zero — crater terraces, crystals, waterfalls',
      a921: 'Kitakami — rice fields, far mountain',
      a952: 'Shrines of Ruin — sealed stone gate at dusk',
      a953: 'Loyalty Plaza — lantern-lit stone square',
      a954: 'Oni Mountain — craggy peak, pale pool',
      a957: 'Kitakami Hall — festival hall at night',
    },
  },
]

const ALL: Readonly<Record<string, string>> = Object.assign({}, ...PICTURE_GROUPS.map((g) => g.names))

/** A picture's name for a picker; a key with none (a new picture, an old path) shows as itself. */
export const pictureName = (key: string): string => ALL[key] ?? key
