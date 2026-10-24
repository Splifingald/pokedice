// Each legendary raid's entrance scene (docs/39 §5): the place it waits in, its weather, its omen and how it comes out.
// Data only: legendRaid.ts draws it. Pairs and trios share a place in their own colours; the Ultra Beasts share an
// Ultra Wormhole and the Paradox Pokémon a time rift (the user's call: not legendaries, one opening each).

export type LegendOmen =
  | 'freeze'
  | 'storm'
  | 'quake'
  | 'whirl'
  | 'orbit'
  | 'bells'
  | 'braille'
  | 'shimmer'
  | 'fog'
  | 'drain'
  | 'pillar'
  | 'cells'
  | 'prism'
  | 'meteors'
  | 'grid'
  | 'slashes'
  | 'rift'
  | 'bloom'
  | 'chains'

export type LegendWeather =
  | 'none'
  | 'snow'
  | 'rain'
  | 'embers'
  | 'ash'
  | 'leaves'
  | 'petals'
  | 'sparks'
  | 'stars'
  | 'dust'
  | 'motes'
  | 'bubbles'
  | 'feathers'

export interface LegendRaidScene {
  /** The sky, top and bottom (dithered in steps). */
  sky: [string, string]
  /** The ground (or water) under the horizon, and whether it's water (light rolling on it). */
  ground: string
  water?: boolean
  /** The dark that pulses before it comes. */
  night: string
  weather: LegendWeather
  wColors: string[]
  omen: LegendOmen
  oColors: string[]
  /** Its outline, rays and burst: light to dark. */
  aura: [string, string, string, string]
  /** It comes down out of the sky, rises out of the ground or the water, or takes shape where it stands. */
  enter: 'descend' | 'rise' | 'emerge'
  seed?: number
}

type Base = Omit<LegendRaidScene, 'aura' | 'oColors'>
const sc = (base: Base, aura: LegendRaidScene['aura'], oColors: string[]): LegendRaidScene => ({
  ...base,
  aura,
  oColors,
})

// Places shared by pairs and trios.
const ICE_CAVE: Base = {
  sky: ['#0c2238', '#2f6c8f'],
  ground: '#9fd2e6',
  water: true,
  night: '#06111d',
  weather: 'snow',
  wColors: ['#ffffff', '#c8f4ff'],
  omen: 'freeze',
  enter: 'descend',
}
const SEALED: Base = {
  sky: ['#1b1712', '#4a3d2a'],
  ground: '#5a4b36',
  night: '#0c0a07',
  weather: 'dust',
  wColors: ['#c9b38a', '#8a7650'],
  omen: 'braille',
  enter: 'emerge',
}
const LAKE: Base = {
  sky: ['#101a33', '#33508a'],
  ground: '#3c6aa8',
  water: true,
  night: '#070c19',
  weather: 'motes',
  wColors: ['#fff6c8', '#ffe08a'],
  omen: 'bells',
  enter: 'emerge',
}
const GLADE: Base = {
  sky: ['#0f2416', '#2f5a35'],
  ground: '#3b6b2e',
  night: '#07120a',
  weather: 'leaves',
  wColors: ['#7ac74c', '#3f8a2a'],
  omen: 'slashes',
  enter: 'descend',
}
const SHRINE_STORM: Base = {
  sky: ['#14162a', '#3a3f63'],
  ground: '#5b6b3a',
  night: '#090a14',
  weather: 'rain',
  wColors: ['#b8c8ff', '#7d8bb2'],
  omen: 'storm',
  enter: 'descend',
}
const RUINS: Base = {
  sky: ['#1a1220', '#3d2a45'],
  ground: '#4a3b30',
  night: '#0c070f',
  weather: 'dust',
  wColors: ['#d9b8ff', '#8a6aa8'],
  omen: 'pillar',
  enter: 'emerge',
}
const RUIN_SHRINE: Base = {
  sky: ['#120a18', '#2e1a3a'],
  ground: '#3a2a26',
  night: '#08040b',
  weather: 'ash',
  wColors: ['#a87bd4', '#5b2391'],
  omen: 'chains',
  enter: 'emerge',
}
const LOYALTY: Base = {
  sky: ['#160d22', '#3a2350'],
  ground: '#4b3a2a',
  night: '#0a0612',
  weather: 'motes',
  wColors: ['#ffb84d', '#ff7a3a'],
  omen: 'chains',
  enter: 'descend',
}
const DYNA_TREE: Base = {
  sky: ['#20160c', '#5a3d22'],
  ground: '#4a6b2e',
  night: '#0f0a05',
  weather: 'leaves',
  wColors: ['#c8a050', '#7ac74c'],
  omen: 'whirl',
  enter: 'descend',
}
const ULTRA: Base = {
  sky: ['#070b1e', '#2a1a52'],
  ground: '#1c1438',
  night: '#03040d',
  weather: 'stars',
  wColors: ['#ffffff', '#c8b8ff'],
  omen: 'rift',
  enter: 'emerge',
}
const PARADOX: Base = {
  sky: ['#0a0710', '#27162e'],
  ground: '#2a2230',
  night: '#040306',
  weather: 'motes',
  wColors: ['#ffffff', '#ffd23a'],
  omen: 'rift',
  enter: 'emerge',
}
const ALTAR: Base = {
  sky: ['#0e1430', '#3a3a78'],
  ground: '#6a6a8a',
  night: '#060815',
  weather: 'stars',
  wColors: ['#ffffff', '#fff3a0'],
  omen: 'bloom',
  enter: 'descend',
}
const SPEAR_PILLAR: Base = {
  sky: ['#0c0f1c', '#2c2f4a'],
  ground: '#5a5a6a',
  night: '#05060c',
  weather: 'snow',
  wColors: ['#ffffff', '#b8c8e0'],
  omen: 'chains',
  enter: 'descend',
}
const DRAGONSPIRAL: Base = {
  sky: ['#101216', '#383c48'],
  ground: '#4a4a52',
  night: '#060709',
  weather: 'ash',
  wColors: ['#c8c8d8', '#8a8a9a'],
  omen: 'pillar',
  enter: 'descend',
}
const FLARE: Base = {
  sky: ['#140c0c', '#3a1f1f'],
  ground: '#2c2424',
  night: '#090505',
  weather: 'motes',
  wColors: ['#ffb0b0', '#ff6a6a'],
  omen: 'bloom',
  enter: 'rise',
}
const WEALD: Base = {
  sky: ['#0f1a1a', '#2c4a46'],
  ground: '#2f4a2a',
  night: '#060c0c',
  weather: 'motes',
  wColors: ['#d8fff0', '#8af0c8'],
  omen: 'fog',
  enter: 'emerge',
}
const ZERO_LAB: Base = {
  sky: ['#08101a', '#1a3040'],
  ground: '#1c2a33',
  night: '#03070b',
  weather: 'sparks',
  wColors: ['#ffffff', '#8af0ff'],
  omen: 'grid',
  enter: 'emerge',
}
const CROWN: Base = {
  sky: ['#0e1824', '#3a5470'],
  ground: '#d8e8f0',
  night: '#060c12',
  weather: 'snow',
  wColors: ['#ffffff', '#c8e0f0'],
  omen: 'fog',
  enter: 'emerge',
}

const SCENES: Record<number, LegendRaidScene> = {
  // Kanto
  144: sc(ICE_CAVE, ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'], ['#ffffff', '#9fe0f4']),
  145: sc(
    {
      sky: ['#0d0e1c', '#2a2c44'],
      ground: '#3a3a44',
      night: '#06060c',
      weather: 'sparks',
      wColors: ['#fff3a0', '#ffd23a'],
      omen: 'storm',
      enter: 'descend',
    },
    ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'],
    ['#fff6c8', '#fff3a0'],
  ),
  146: sc(
    {
      sky: ['#1c0806', '#5a1e10'],
      ground: '#3a1a10',
      night: '#0e0403',
      weather: 'embers',
      wColors: ['#ffd23a', '#ff8a1e', '#c4382a'],
      omen: 'quake',
      enter: 'rise',
    },
    ['#ffffff', '#ffe08a', '#ff8a1e', '#9a2a16'],
    ['#ff8a1e', '#ffd23a'],
  ),
  150: sc(
    {
      sky: ['#0c0616', '#2a1442'],
      ground: '#1c1030',
      water: true,
      night: '#06030c',
      weather: 'motes',
      wColors: ['#e8c8ff', '#c26bf0'],
      omen: 'orbit',
      enter: 'emerge',
    },
    ['#ffffff', '#f0c8ff', '#c26bf0', '#5b2391'],
    ['#6a5a7a', '#5a4a6a', '#7a6a8a', '#4a3a5a'],
  ),
  // Johto
  249: sc(
    {
      sky: ['#0a1426', '#2a4a78'],
      ground: '#1f4a7a',
      water: true,
      night: '#050a14',
      weather: 'rain',
      wColors: ['#c8e0ff', '#8ab0e0'],
      omen: 'whirl',
      enter: 'rise',
    },
    ['#ffffff', '#e0ecff', '#8ab0e0', '#2a4a78'],
    ['#ffffff', '#c8e0ff'],
  ),
  250: sc(
    {
      sky: ['#2a1a10', '#d89040'],
      ground: '#5a3a22',
      night: '#140a05',
      weather: 'feathers',
      wColors: ['#ff6a3a', '#ffd23a', '#7ac74c', '#6390f0'],
      omen: 'bells',
      enter: 'descend',
    },
    ['#ffffff', '#fff3a0', '#ff8a1e', '#a83a10'],
    ['#ffd23a', '#ff8a1e', '#ff6a6a', '#7ac74c', '#6390f0'],
  ),
  // Hoenn
  383: sc(
    {
      sky: ['#1a0604', '#6a1a08'],
      ground: '#3a1206',
      night: '#0c0302',
      weather: 'embers',
      wColors: ['#ffd23a', '#ff6a1e', '#c4382a'],
      omen: 'quake',
      enter: 'rise',
    },
    ['#ffffff', '#ffd0a0', '#ff4a1e', '#7a1606'],
    ['#ff6a1e', '#ffd23a'],
  ),
  382: sc(
    {
      sky: ['#06101e', '#14305a'],
      ground: '#1a3a6a',
      water: true,
      night: '#030810',
      weather: 'rain',
      wColors: ['#c8e0ff', '#6390f0'],
      omen: 'storm',
      enter: 'rise',
    },
    ['#ffffff', '#c8e0ff', '#3a7af0', '#10306a'],
    ['#ffffff', '#c8e0ff'],
  ),
  384: sc(
    {
      sky: ['#050816', '#1c2a5a'],
      ground: '#4a5a6a',
      night: '#02040b',
      weather: 'stars',
      wColors: ['#ffffff', '#c8f0d8'],
      omen: 'meteors',
      enter: 'descend',
    },
    ['#ffffff', '#c8ffd8', '#3ac87a', '#145a30'],
    ['#ffffff', '#ffe08a'],
  ),
  377: sc(SEALED, ['#ffffff', '#f0d8a0', '#c8a050', '#6a4a20'], ['#ffd23a', '#ff8a1e']),
  378: sc(
    { ...SEALED, ground: '#7ab0c8', weather: 'snow', wColors: ['#ffffff', '#c8f4ff'] },
    ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'],
    ['#c8f4ff', '#5fc0e0'],
  ),
  379: sc(
    { ...SEALED, ground: '#7a7a8a', weather: 'sparks', wColors: ['#ffffff', '#d0d0e0'] },
    ['#ffffff', '#e0e0f0', '#9a9ab0', '#4a4a5a'],
    ['#ffd23a', '#ffffff'],
  ),
  380: sc(
    {
      sky: ['#2a1420', '#d8806a'],
      ground: '#1f4a6a',
      water: true,
      night: '#140810',
      weather: 'motes',
      wColors: ['#ffd0d8', '#ff9ab0'],
      omen: 'shimmer',
      enter: 'emerge',
    },
    ['#ffffff', '#ffd0d8', '#e05a6a', '#7a1f2a'],
    ['#ffffff', '#ffd0d8'],
  ),
  381: sc(
    {
      sky: ['#06081a', '#1c2a5a'],
      ground: '#14284a',
      water: true,
      night: '#030410',
      weather: 'stars',
      wColors: ['#ffffff', '#c8d8ff'],
      omen: 'shimmer',
      enter: 'emerge',
    },
    ['#ffffff', '#c8d8ff', '#5a7ae0', '#1f2a6a'],
    ['#ffffff', '#c8d8ff'],
  ),
  // Sinnoh
  483: sc(SPEAR_PILLAR, ['#ffffff', '#c8e0ff', '#5a8ae0', '#1f3a7a'], ['#c4382a', '#8a1a14']),
  484: sc(
    { ...SPEAR_PILLAR, weather: 'motes', wColors: ['#ffd0f0', '#e08ac8'] },
    ['#ffffff', '#ffd0f0', '#d06ab0', '#6a1f5a'],
    ['#c4382a', '#8a1a14'],
  ),
  480: sc(
    { ...LAKE, sky: ['#14182a', '#5a6a8a'], ground: '#8ab0c8', weather: 'snow', wColors: ['#ffffff'] },
    ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'],
    ['#ffd23a', '#fff3a0'],
  ),
  481: sc(LAKE, ['#ffffff', '#ffd0f0', '#ff6ab0', '#8a1f5a'], ['#ff6ab0', '#ffd0f0']),
  482: sc(
    { ...LAKE, sky: ['#0c0c1a', '#3a2a3a'], ground: '#5a3a3a' },
    ['#ffffff', '#c8d8ff', '#3a6af0', '#1a2a6a'],
    ['#3a6af0', '#c8d8ff'],
  ),
  487: sc(
    {
      sky: ['#06020c', '#1c0a2a'],
      ground: '#1a1020',
      night: '#030106',
      weather: 'ash',
      wColors: ['#a87bd4', '#5b2391'],
      omen: 'rift',
      enter: 'rise',
    },
    ['#ffe58a', '#ffbe2e', '#c4382a', '#5a0a14'],
    ['#c4382a', '#ffbe2e'],
  ),
  485: sc(
    {
      sky: ['#1a0604', '#5a1a0a'],
      ground: '#2a1006',
      night: '#0c0302',
      weather: 'embers',
      wColors: ['#ffd23a', '#ff6a1e'],
      omen: 'quake',
      enter: 'descend',
    },
    ['#ffffff', '#ffd0a0', '#e05a1e', '#6a1a06'],
    ['#ff6a1e', '#ffd23a'],
  ),
  486: sc(
    {
      sky: ['#10141c', '#3a4658'],
      ground: '#c8d8e8',
      night: '#06080c',
      weather: 'snow',
      wColors: ['#ffffff', '#c8e0f0'],
      omen: 'braille',
      enter: 'emerge',
    },
    ['#ffffff', '#f0f0e0', '#c8c890', '#5a5a3a'],
    ['#c8a050', '#5fc0e0', '#9a9ab0'],
  ),
  488: sc(
    {
      sky: ['#0a0c1e', '#2a2a5a'],
      ground: '#2a3a2a',
      night: '#05060f',
      weather: 'feathers',
      wColors: ['#ffd0f0', '#fff3a0'],
      omen: 'bloom',
      enter: 'descend',
    },
    ['#ffffff', '#ffd0f0', '#e08ac8', '#5a2a6a'],
    ['#fff3a0', '#ffd0f0'],
  ),
  // Unova
  643: sc(DRAGONSPIRAL, ['#ffffff', '#e0f0ff', '#8ac8ff', '#2a4a7a'], ['#ffffff', '#c8e8ff']),
  644: sc(
    { ...DRAGONSPIRAL, weather: 'sparks', wColors: ['#8af0ff', '#3ac8ff'], omen: 'storm' },
    ['#c8f0ff', '#3ac8ff', '#1a2a5a', '#05070c'],
    ['#8af0ff', '#ffffff'],
  ),
  638: sc(GLADE, ['#ffffff', '#c8e0ff', '#5a8ae0', '#1f3a7a'], ['#c8e0ff', '#9a9ab0', '#ffffff']),
  639: sc(
    { ...GLADE, weather: 'dust', wColors: ['#c8a050', '#8a7650'] },
    ['#ffffff', '#f0d8a0', '#a07040', '#4a2a10'],
    ['#c8a050', '#ffffff', '#8a7650'],
  ),
  640: sc(GLADE, ['#ffffff', '#c8ffd8', '#3ac87a', '#145a30'], ['#7ac74c', '#ffffff', '#3ac87a']),
  641: sc(
    { ...SHRINE_STORM, weather: 'leaves', wColors: ['#7ac74c', '#c8a050'], omen: 'whirl' },
    ['#ffffff', '#c8ffd8', '#5ac88a', '#1a4a2a'],
    ['#ffffff', '#c8ffd8'],
  ),
  642: sc(SHRINE_STORM, ['#ffffff', '#c8d8ff', '#6a8af0', '#1a2a6a'], ['#fff6c8', '#c8d8ff']),
  645: sc(
    {
      ...SHRINE_STORM,
      sky: ['#2a1c0c', '#c8a050'],
      ground: '#a08040',
      weather: 'dust',
      wColors: ['#ffe08a', '#c8a050'],
      omen: 'bloom',
    },
    ['#ffffff', '#ffe08a', '#e0a040', '#6a4010'],
    ['#ffd23a', '#ffe08a'],
  ),
  646: sc(
    {
      sky: ['#0a1018', '#3a4a5a'],
      ground: '#c8d8e8',
      night: '#05080c',
      weather: 'snow',
      wColors: ['#ffffff', '#c8e0f0'],
      omen: 'freeze',
      enter: 'emerge',
    },
    ['#ffffff', '#c8f0ff', '#5ab0d0', '#1a3a4a'],
    ['#ffffff', '#9fd2e6'],
  ),
  // Kalos
  716: sc(
    FLARE,
    ['#ffffff', '#c8f0ff', '#3a9af0', '#1a3a6a'],
    ['#ff6a6a', '#ffd23a', '#7ac74c', '#3a9af0', '#c26bf0'],
  ),
  717: sc({ ...FLARE, omen: 'drain' }, ['#ffd0d0', '#ff4a4a', '#7a1414', '#1a0404'], ['#3a3a3a']),
  718: sc(
    {
      sky: ['#0a120a', '#2a3a1a'],
      ground: '#2a2a1a',
      night: '#050905',
      weather: 'motes',
      wColors: ['#8aff8a', '#3ac83a'],
      omen: 'cells',
      enter: 'emerge',
    },
    ['#ffffff', '#c8ffc8', '#3ac83a', '#145a14'],
    ['#8aff8a', '#3ac83a', '#145a14'],
  ),
  // Alola
  789: sc(
    {
      sky: ['#06081e', '#1c1a4a'],
      ground: '#1a2a5a',
      water: true,
      night: '#030410',
      weather: 'stars',
      wColors: ['#ffffff', '#c8b8ff'],
      omen: 'whirl',
      enter: 'emerge',
    },
    ['#ffffff', '#c8d8ff', '#6a6af0', '#1a1a5a'],
    ['#c8b8ff', '#ffffff'],
  ),
  791: sc(
    { ...ALTAR, sky: ['#2a1a0c', '#e0a040'] },
    ['#ffffff', '#fff3a0', '#ffa03a', '#7a3a0a'],
    ['#ffd23a', '#fff3a0', '#ffffff'],
  ),
  792: sc(ALTAR, ['#ffffff', '#e0c8ff', '#8a5ad0', '#2a1a5a'], ['#c8b8ff', '#ffffff', '#8a5ad0']),
  800: sc(
    {
      sky: ['#04040a', '#14142a'],
      ground: '#1a1a2a',
      night: '#020205',
      weather: 'none',
      wColors: [],
      omen: 'prism',
      enter: 'emerge',
    },
    ['#ffffff', '#fff3a0', '#ffd23a', '#2a2a3a'],
    ['#ff6a6a', '#ffd23a', '#7ac74c', '#3a9af0', '#c26bf0'],
  ),
  785: sc(RUINS, ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'], ['#ffd23a', '#fff3a0']),
  786: sc(RUINS, ['#ffffff', '#ffd0f0', '#ff6ab0', '#8a1f5a'], ['#ff6ab0', '#ffd0f0']),
  787: sc(RUINS, ['#ffffff', '#c8ffd8', '#3ac87a', '#145a30'], ['#3ac87a', '#c8ffd8']),
  788: sc(RUINS, ['#ffffff', '#c8e0ff', '#5a9ae0', '#1f3a7a'], ['#c8e0ff', '#ffffff']),
  // Galar
  890: sc(
    {
      sky: ['#1a0408', '#7a1420'],
      ground: '#2a0a10',
      night: '#0c0204',
      weather: 'ash',
      wColors: ['#ff6a8a', '#c4382a'],
      omen: 'pillar',
      enter: 'descend',
    },
    ['#ffffff', '#ffb0c8', '#e03a6a', '#5a0a20'],
    ['#ff3a5a', '#ffb0c8'],
  ),
  888: sc(WEALD, ['#ffffff', '#c8e0ff', '#3a7af0', '#1a2a6a'], ['#d8fff0', '#ffffff']),
  889: sc(WEALD, ['#ffffff', '#ffc8c8', '#e04a4a', '#6a1a1a'], ['#d8fff0', '#ffffff']),
  891: sc(
    {
      sky: ['#1a1410', '#5a4a3a'],
      ground: '#6a5a40',
      night: '#0c0a08',
      weather: 'petals',
      wColors: ['#ffd0e0', '#ff9ab0'],
      omen: 'slashes',
      enter: 'emerge',
    },
    ['#ffffff', '#f0e0c8', '#a07a50', '#4a3420'],
    ['#ffffff', '#f0e0c8', '#a07a50'],
  ),
  894: sc(
    { ...SEALED, ground: '#5a5030', weather: 'sparks', wColors: ['#fff3a0', '#ffd23a'], omen: 'storm' },
    ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'],
    ['#fff3a0', '#ffffff'],
  ),
  895: sc(
    { ...SEALED, ground: '#3a2a4a', weather: 'motes', wColors: ['#c8a0ff', '#8a5ad0'] },
    ['#ffffff', '#e0c8ff', '#8a3ad0', '#2a0a4a'],
    ['#8a3ad0', '#c8a0ff'],
  ),
  896: sc(CROWN, ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'], ['#ffffff', '#c8e0f0']),
  897: sc(
    {
      ...CROWN,
      sky: ['#04060e', '#1a1a3a'],
      ground: '#3a4a6a',
      weather: 'motes',
      wColors: ['#8ab0ff', '#5a6af0'],
    },
    ['#ffffff', '#c8d0ff', '#5a5ad0', '#1a1a4a'],
    ['#8ab0ff', '#ffffff'],
  ),
  898: sc(
    { ...CROWN, weather: 'motes', wColors: ['#c8ffd8', '#7ac74c'], omen: 'bloom' },
    ['#ffffff', '#c8ffd8', '#3ac87a', '#145a30'],
    ['#7ac74c', '#c8ffd8', '#ffd23a'],
  ),
  905: sc(
    {
      sky: ['#2a0c1a', '#a03a6a'],
      ground: '#3a2a2a',
      night: '#14060c',
      weather: 'petals',
      wColors: ['#ffd0e0', '#ff9ab0'],
      omen: 'storm',
      enter: 'descend',
    },
    ['#ffffff', '#ffd0e0', '#ff6aa0', '#6a1a3a'],
    ['#ffd0e0', '#ffffff'],
  ),
  10169: sc(DYNA_TREE, ['#ffffff', '#e0c8ff', '#a06af0', '#3a1a6a'], ['#c8a050', '#7ac74c']),
  10170: sc(DYNA_TREE, ['#ffffff', '#ffd0a0', '#ff8a3a', '#6a2a0a'], ['#c8a050', '#7ac74c']),
  10171: sc(DYNA_TREE, ['#ffd0f0', '#c26bf0', '#5b2391', '#1a0a2a'], ['#c8a050', '#7ac74c']),
  // Paldea
  1007: sc(
    {
      ...ZERO_LAB,
      sky: ['#1a0604', '#6a1a10'],
      weather: 'embers',
      wColors: ['#ffd23a', '#ff6a1e'],
      omen: 'bloom',
    },
    ['#ffffff', '#ffd0a0', '#e04a2a', '#5a0a06'],
    ['#ff6a1e', '#ffd23a'],
  ),
  1008: sc(ZERO_LAB, ['#ffffff', '#c8d0ff', '#6a5af0', '#1a1a5a'], ['#8af0ff', '#c26bf0']),
  1001: sc(RUIN_SHRINE, ['#ffffff', '#d8f0a0', '#7aa03a', '#2a3a10'], ['#a87bd4', '#5b2391']),
  1002: sc(
    { ...RUIN_SHRINE, weather: 'snow', wColors: ['#ffffff', '#c8e0f0'] },
    ['#ffffff', '#c8f0ff', '#5ab0d0', '#1a3a4a'],
    ['#a87bd4', '#5b2391'],
  ),
  1003: sc(RUIN_SHRINE, ['#ffffff', '#f0d8a0', '#a07040', '#4a2a10'], ['#a87bd4', '#5b2391']),
  1004: sc(
    { ...RUIN_SHRINE, weather: 'embers', wColors: ['#ffd23a', '#ff6a1e'] },
    ['#ffffff', '#ffd0a0', '#e04a2a', '#5a0a06'],
    ['#a87bd4', '#5b2391'],
  ),
  1014: sc(LOYALTY, ['#ffffff', '#d0ffa0', '#7ac74c', '#2a4a10'], ['#a33ea1', '#d070d0']),
  1015: sc(LOYALTY, ['#ffffff', '#ffd0f0', '#c26bf0', '#5b2391'], ['#a33ea1', '#d070d0']),
  1016: sc(LOYALTY, ['#ffffff', '#ffe0f0', '#e08ac8', '#6a2a5a'], ['#a33ea1', '#d070d0']),
  1017: sc(
    {
      sky: ['#0c0a1a', '#2a2a4a'],
      ground: '#2a3a2a',
      night: '#06050d',
      weather: 'motes',
      wColors: ['#ffb84d', '#ff7a3a'],
      omen: 'orbit',
      enter: 'descend',
    },
    ['#ffffff', '#c8ffd8', '#3ac87a', '#145a30'],
    ['#3a9a7a', '#3a6af0', '#e04a2a', '#9a8a6a'],
  ),
  1024: sc(
    {
      sky: ['#06061a', '#1a1a3a'],
      ground: '#2a2a4a',
      night: '#030308',
      weather: 'stars',
      wColors: ['#ffffff', '#c8f0ff'],
      omen: 'prism',
      enter: 'rise',
    },
    ['#ffffff', '#fff3a0', '#8ac8ff', '#2a2a5a'],
    ['#ff6a6a', '#ffd23a', '#7ac74c', '#3a9af0', '#c26bf0'],
  ),
  // Arceus, the daily raid: the Hall of Origin, its 17 plates turning.
  493: sc(
    {
      sky: ['#e8eef8', '#9aa8c8'],
      ground: '#f0f0f8',
      night: '#2a2a3a',
      weather: 'motes',
      wColors: ['#ffffff', '#ffe08a'],
      omen: 'orbit',
      enter: 'descend',
    },
    ['#ffffff', '#ffe08a', '#c8a050', '#4a3a1a'],
    [
      '#ee8130',
      '#6390f0',
      '#f7d02c',
      '#7ac74c',
      '#96d9d6',
      '#c22e28',
      '#a33ea1',
      '#e2bf65',
      '#a98ff3',
      '#f95587',
      '#a6b91a',
      '#b6a136',
      '#735797',
      '#6f35fc',
      '#705746',
      '#b7b7ce',
      '#d685ad',
    ],
  ),
}

/** The Ultra Beasts' shared opening (an Ultra Wormhole) and the Paradox Pokémon's (a time rift, past or future). */
const UB_SCENE = sc(ULTRA, ['#ffffff', '#e0c8ff', '#a06af0', '#2a0a5a'], ['#c8b8ff', '#ffffff'])
const PAST = sc(PARADOX, ['#ffffff', '#ffd0a0', '#e04a2a', '#5a0a06'], ['#e04a2a', '#ffd0a0'])
const FUTURE = sc(
  { ...PARADOX, wColors: ['#ffffff', '#8af0ff'] },
  ['#ffffff', '#c8f0ff', '#3ac8ff', '#0a2a4a'],
  ['#3ac8ff', '#c8f0ff'],
)
for (const d of [793, 794, 795, 796, 797, 798, 799, 805, 806, 803]) SCENES[d] = UB_SCENE
for (const d of [1009, 1020, 1021]) SCENES[d] = PAST
for (const d of [1010, 1022, 1023]) SCENES[d] = FUTURE

/** The scenes, by the raid Pokémon's dex (a Mega raid uses its base's: the same place). */
export const LEGEND_RAID_SCENES: Readonly<Record<number, LegendRaidScene>> = SCENES
