// Gym badges as 12×12 pixel art (the Visual Lab's maps for Kanto, and the same shapes in each badge's colours for the
// other regions), and the crown for clearing a region's last area. Unearned ones are drawn in greys.
import { useT } from '@/i18n/react'
import { slug } from '@/i18n/names'

type Map12 = readonly string[]

/** k outline, w highlight, a body, b light, c shade; the rainbow uses r, u, y, g. */
const SHAPES = {
  gem: [
    '...kkkkkk...',
    '..kbbbaaak..',
    '.kbwbaaaaak.',
    'kbwbaaaaaack',
    'kbbaaaaaaack',
    'kbaaaaaaaack',
    'kaaaaaaaacck',
    'kaaaaaaaacck',
    'kaaaaaaaccck',
    '.kaaaaacccck',
    '..kaacccck..',
    '...kkkkkk...',
  ],
  drop: [
    '.....kk.....',
    '....kbak....',
    '....kbak....',
    '...kbbaak...',
    '..kbwbaaak..',
    '.kbwbaaaaak.',
    '.kbbaaaaack.',
    'kbaaaaaaaack',
    'kaaaaaaaacck',
    '.kaaaaaacck.',
    '..kaaaccck..',
    '...kkkkkk...',
  ],
  bolt: [
    '.....kk.....',
    '.k..kbak..k.',
    '.kk.kbak.kk.',
    '..kkbbaakk..',
    '.kkbwbaaakk.',
    'kbbwbaaaaack',
    'kaaaaaaaccck',
    '.kkaaaaacck.',
    '..kkaaacckk.',
    '.kk.kack.kk.',
    '.k..kcck..k.',
    '.....kk.....',
  ],
  rainbow: [
    '....kkkk....',
    '...krrrrk...',
    '.kkkrrrrkkk.',
    'kuuukrrkyyyk',
    'kuuuukkyyyyk',
    'kuuukwwkyyyk',
    'kuuukwwkyyyk',
    'kuuuukkyyyyk',
    'kuuukggkyyyk',
    '.kkkggggkkk.',
    '...kggggk...',
    '....kkkk....',
  ],
  heart: [
    '............',
    '.kkk....kkk.',
    'kbbak..kbaak',
    'kbwbakkbaaak',
    'kbbaaaaaaaak',
    'kbaaaaaaaack',
    '.kaaaaaaacck',
    '..kaaaaaack.',
    '...kaaaack..',
    '....kaack...',
    '.....kk.....',
    '............',
  ],
  ring: [
    '...kkkkkk...',
    '..kbbbaaak..',
    '.kbwkkkkaak.',
    'kbbk....kack',
    'kbk..kk..kck',
    'kak.kbak.kck',
    'kak.kack.kck',
    'kak..kk..kck',
    'kack....kcck',
    '.kaakkkkccck',
    '..kaacccck..',
    '...kkkkkk...',
  ],
  flame: [
    '.....k......',
    '....kak.....',
    '....kaak....',
    '...kbaak.k..',
    '..kbaaakkak.',
    '..kbayaaaak.',
    '.kbayyyaaak.',
    '.kbayywyaack',
    '.kaayywyyack',
    '.kaaayyyaack',
    '..kaaaaacck.',
    '...kkkkkkk..',
  ],
  leaf: [
    '.....kk.....',
    '....kbak....',
    '...kbwaak...',
    '..kbwbaaak..',
    '.kbbbaaaaak.',
    'kbbaaaaaaack',
    'kaaaaaaaacck',
    '.kaaaaaacck.',
    '..kaaaaacck.',
    '...kaaacck..',
    '....kacck...',
    '.....kk.....',
  ],
  wing: [
    '..........k.',
    '........kkbk',
    '......kkbbak',
    '....kkbbaak.',
    '...kbbwaak..',
    '..kbwbaack..',
    '.kbbaaack...',
    '.kbaaacck...',
    'kbaaacck....',
    'kaaacck.....',
    'kacck.......',
    'kkk.........',
  ],
  star: [
    '.....kk.....',
    '....kbak....',
    '....kbak....',
    'kkkkbwbakkkk',
    'kbbbwbaaaack',
    '.kbbbaaaack.',
    '..kbaaaack..',
    '..kbaaaack..',
    '.kbaaccaack.',
    '.kaack.kcck.',
    'kack....kcck',
    'kk........kk',
  ],
  crystal: [
    '.....kk.....',
    '....kbak....',
    '...kbwaak...',
    '...kbwaak...',
    '..kbwbaaak..',
    '..kbbaaack..',
    '.kbbaaaacck.',
    '.kbaaaaacck.',
    '..kaaaacck..',
    '...kaacck...',
    '....kack....',
    '.....kk.....',
  ],
  fist: [
    '............',
    '..kkkkkkkk..',
    '.kbbkbbkbak.',
    '.kbwkbwkaak.',
    '.kbbkbakaack',
    '.kkkkkkkkack',
    '.kbbbaaaaack',
    '.kbwbaaaaack',
    '.kbaaaaaacck',
    '..kaaaaacck.',
    '...kkkkkkk..',
    '............',
  ],
} satisfies Record<string, Map12>

type Shape = keyof typeof SHAPES
/** a body, b light, c shade (y: the flame's core). */
type Pal = { a: string; b: string; c: string; y?: string }

const P = (a: string, b: string, c: string, y?: string): Pal => ({ a, b, c, ...(y && { y }) })
const GREY = P('#a8aebb', '#d8dce4', '#6f7686')
const BLUE = P('#4aa8ff', '#a9dcff', '#1d5fc8')
const GOLD = P('#ffb23a', '#ffe066', '#d06a1a')
const PINK = P('#ff7ab0', '#ffc2dc', '#c8457e')
const AMBER = P('#e8b44a', '#ffe7a8', '#a87a1a')
const RED = P('#e8481c', '#ff9a5a', '#9a2a14', '#ffd23a')
const GREEN = P('#4aa84a', '#a8e08a', '#2a6e2f')
const ICE = P('#8fdcff', '#e0f6ff', '#3a9ad0')
const PURPLE = P('#9a6ae8', '#d4c0ff', '#5a3aa8')
const BROWN = P('#b87a3a', '#e8c08a', '#7a4a1a')
const DARK = P('#5a5f78', '#9aa0b8', '#2e3248')
const STEEL = P('#8aa4c0', '#d4e0ee', '#4f6888')
const ORANGE = P('#f08a2a', '#ffc27a', '#a8521a')
const TEAL = P('#3ac0b0', '#a0eee0', '#1a7a70')

/** Each badge's shape and colours, by its slug. Kanto's are the lab's own. */
const BADGES: Record<string, [Shape, Pal]> = {
  'boulder-badge': ['gem', GREY],
  'cascade-badge': ['drop', BLUE],
  'thunder-badge': ['bolt', GOLD],
  'rainbow-badge': ['rainbow', GREEN],
  'soul-badge': ['heart', PINK],
  'marsh-badge': ['ring', AMBER],
  'volcano-badge': ['flame', RED],
  'earth-badge': ['leaf', GREEN],
  // Johto
  'zephyr-badge': ['wing', STEEL],
  'hive-badge': ['gem', GOLD],
  'plain-badge': ['gem', PINK],
  'fog-badge': ['ring', PURPLE],
  'storm-badge': ['fist', BROWN],
  'mineral-badge': ['crystal', STEEL],
  'glacier-badge': ['crystal', ICE],
  'rising-badge': ['flame', P('#3a6ae8', '#a0c0ff', '#1a2e98', '#ffd23a')],
  // Hoenn
  'stone-badge': ['gem', BROWN],
  'knuckle-badge': ['fist', ORANGE],
  'dynamo-badge': ['bolt', GOLD],
  'heat-badge': ['flame', RED],
  'balance-badge': ['ring', P('#e85a3a', '#ffb0a0', '#9a2a14')],
  'feather-badge': ['wing', BLUE],
  'mind-badge': ['heart', PURPLE],
  'rain-badge': ['drop', BLUE],
  // Sinnoh
  'coal-badge': ['gem', DARK],
  'forest-badge': ['leaf', GREEN],
  'cobble-badge': ['fist', BROWN],
  'fen-badge': ['drop', TEAL],
  'relic-badge': ['star', AMBER],
  'mine-badge': ['gem', STEEL],
  'icicle-badge': ['crystal', ICE],
  'beacon-badge': ['bolt', GOLD],
  // Unova
  'trio-badge': ['ring', RED],
  'basic-badge': ['gem', GREY],
  'insect-badge': ['leaf', P('#a8c83a', '#e0f08a', '#5a7a1a')],
  'bolt-badge': ['bolt', GOLD],
  'quake-badge': ['fist', BROWN],
  'jet-badge': ['wing', BLUE],
  'freeze-badge': ['crystal', ICE],
  'legend-badge': ['star', AMBER],
  // Kalos
  'bug-badge': ['leaf', P('#a8c83a', '#e0f08a', '#5a7a1a')],
  'cliff-badge': ['gem', BROWN],
  'rumble-badge': ['fist', ORANGE],
  'plant-badge': ['leaf', GREEN],
  'voltage-badge': ['bolt', GOLD],
  'fairy-badge': ['heart', PINK],
  'psychic-badge': ['star', PURPLE],
  'iceberg-badge': ['crystal', ICE],
  // Alola's Z-Crystals
  'normalium-z': ['crystal', GREY],
  'fightinium-z': ['crystal', ORANGE],
  'waterium-z': ['crystal', BLUE],
  'rockium-z': ['crystal', BROWN],
  'electrium-z': ['crystal', GOLD],
  'darkinium-z': ['crystal', DARK],
  'fairium-z': ['crystal', PINK],
  'groundium-z': ['crystal', AMBER],
  // Galar
  'grass-badge': ['leaf', GREEN],
  'water-badge': ['drop', BLUE],
  'fire-badge': ['flame', RED],
  'fighting-badge': ['fist', ORANGE],
  'rock-badge': ['gem', BROWN],
  'dark-badge': ['ring', DARK],
  'dragon-badge': ['flame', P('#6a4ae8', '#b8a8ff', '#3a1a98', '#ffd23a')],
  'electric-badge': ['bolt', GOLD],
  'normal-badge': ['star', GREY],
  'ghost-badge': ['ring', PURPLE],
  'ice-badge': ['crystal', ICE],
}

const RAINBOW = { r: '#f2553f', u: '#5b8def', y: '#ffd23a', g: '#4aa84a' }
/** Not earned yet: every colour a pale grey, the outline a soft blue-grey. */
const OFF: Record<string, string> = {
  k: '#b6c3d9',
  a: '#e3e8f0',
  b: '#eef2f8',
  c: '#cfd8e6',
  w: '#f4f7fb',
  r: '#e3e8f0',
  u: '#e3e8f0',
  y: '#e3e8f0',
  g: '#e3e8f0',
}

const CROWN: Map12 = [
  '............',
  '............',
  'k..k.kk.k..k',
  'kk.kkbbkk.kk',
  'kbkkbwbakkak',
  'kbbbwbaaaaak',
  'kbaaaaaaaack',
  'kaaaaaaaacck',
  'kkkkkkkkkkkk',
  'kyyyyyyyyyyk',
  'kkkkkkkkkkkk',
  '............',
]

function PixelMap({
  map,
  colors,
  size,
  label,
}: {
  map: Map12
  colors: Record<string, string>
  size: number
  label: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {map.flatMap((row, y) =>
        [...row].map((ch, x) => {
          const fill = colors[ch]
          return fill ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} /> : null
        }),
      )}
    </svg>
  )
}

/** A gym badge in pixel form — greys until it's earned (and its label says so). */
export function BadgeIcon({ badge, earned, size = 24 }: { badge: string; earned: boolean; size?: number }) {
  const { t } = useT()
  const key = slug(badge)
  const [shape, pal] = BADGES[key] ?? ['gem', GOLD]
  const name = t(`badge.${key}`)
  const colors = earned ? { k: '#24304f', w: '#ffffff', ...(shape === 'rainbow' ? RAINBOW : pal) } : OFF
  return (
    <PixelMap
      map={SHAPES[shape]}
      colors={colors}
      size={size}
      label={earned ? name : t('ui.profile.badgeLocked', { badge: name })}
    />
  )
}

/** The crown: for clearing the region's last area. */
export function CrownIcon({ earned, size = 24, label }: { earned: boolean; size?: number; label: string }) {
  const colors = earned
    ? { k: '#24304f', w: '#ffffff', a: '#ffbe2e', b: '#ffe7a8', c: '#c88a1a', y: '#f2553f' }
    : OFF
  return <PixelMap map={CROWN} colors={colors} size={size} label={label} />
}
