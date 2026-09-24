// Hand-drawn pixel icons: each row is a string, each char a palette colour ('.' = transparent).
import type { CSSProperties } from 'react'

const PAL: Record<string, string> = {
  k: '#2a2438',
  w: '#f7f2e0',
  y: '#e8b44a',
  Y: '#fbeeb0',
  o: '#ca6e29',
  r: '#c2452d',
  b: '#547acc',
  c: '#80b8b6',
  C: '#c6e7ef',
  p: '#8b3589',
  P: '#c77ac5',
  g: '#4aa84a',
  s: '#6b6480',
  e: '#d2b125',
  m: '#d44873',
}

export const ICONS = {
  coin: ['..kkkk..', '.kyyyyk.', 'kyYyyyyk', 'kyYyyyyk', 'kyyyyyok', 'kyyyyyok', '.kyooyk.', '..kkkk..'],
  heart: ['.kk..kk.', 'krrkkrrk', 'krwrrrrk', 'krrrrrrk', '.krrrrk.', '..krrk..', '...kk...', '........'],
  star: ['...kk...', '...yy...', 'kkyYyykk', '.kyyyyk.', '..kyyk..', '.kykkyk.', '.kk..kk.', '........'],
  lock: ['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kyyyyyyk', 'kyyykyyk', 'kyyyyyyk', 'kkkkkkkk'],
  burn: ['....k...', '...kok..', '..koYok.', '.kooYyok', '.koyYyok', '.kooyyok', '..koook.', '...kkk..'],
  frozen: ['...C....', '.C.c.C..', '..ccc...', 'CccwccC.', '..ccc...', '.C.c.C..', '...C....', '........'],
  paralyze: ['....kkk.', '...keek.', '..keek..', '.keeeek.', '.kkeek..', '..kek...', '..kk....', '.k......'],
  poison: ['......k.', '.kk..kPk', 'kppk..k.', 'kpPpk...', 'kpppk.kk', '.kkk.kPk', '.....kpk', '......k.'],
  confuse: ['.kkkkk..', 'km....k.', 'k.kkk.k.', 'k.k.k.k.', 'k.k...k.', 'k.kkkk..', 'k.......', '.kkkkkk.'],
  energy: ['....kkk.', '...kYyk.', '..kYyk..', '.kYyyyk.', '.kkkyk..', '..kyk...', '.kyk....', '.kk.....'],
  heal: ['..kkkk..', '..kggk..', 'kkkggkkk', 'kgggwggk', 'kggggggk', 'kkkggkkk', '..kggk..', '..kkkk..'],
  sound: ['...k....', '..kk..k.', 'kkwk.k..', 'kwwk.k.k', 'kwwk.k.k', 'kkwk.k..', '..kk..k.', '...k....'],
  mute: ['...k....', '..kk....', 'kkwk.k.k', 'kwwk..k.', 'kwwk.k.k', 'kkwk....', '..kk....', '...k....'],
  close: ['kk....kk', 'kkk..kkk', '.kkkkkk.', '..kkkk..', '..kkkk..', '.kkkkkk.', 'kkk..kkk', 'kk....kk'],
  ball: [
    '....kkkk....',
    '..kkrrrrkk..',
    '.krrwrrrrrk.',
    '.krwwrrrrrk.',
    'krrrkkkkrrrk',
    'kkkkkwwkkkkk',
    'kwwwkwwkwwwk',
    'kwwwkkkkwwwk',
    '.kwwwwwwwwk.',
    '.kwwwwwwwwk.',
    '..kkwwwwkk..',
    '....kkkk....',
  ],
  potion: ['..kkkk..', '...kk...', '..kwwk..', '.kwbbwk.', 'kbbbbbbk', 'kbwbbbbk', 'kbbbbbbk', '.kkkkkk.'],
  flag: ['kkkkkk..', 'kwwwwwkk', 'kwwwwwwk', 'kwwwwwwk', 'kkkkkkkk', 'k.......', 'k.......', 'k.......'],
  thumbUp: ['...kk...', '..kggk..', '..kgk...', 'kkkgkkkk', 'kgkggggk', 'kgkgggkk', 'kgkggggk', 'kkkkkkk.'],
  thumbDown: ['kkkkkkk.', 'krkrrrrk', 'krkrrrkk', 'krkrrrrk', 'kkkrkkkk', '..krk...', '..krrk..', '...kk...'],
  up: ['...kk...', '..kggk..', '.kggggk.', 'kkkggkkk', '..kggk..', '..kggk..', '..kggk..', '..kkkk..'],
  dex: ['kkkkkkk.', 'krrrrrrk', 'krwwrrrk', 'krrrrrrk', 'kkkkkkkk', 'kwwwwwwk', 'kwsswwwk', 'kkkkkkkk'],
  map: ['kkkkkkkk', 'kgggbbbk', 'kgyggbbk', 'kggggbbk', 'kbbgrggk', 'kbbggggk', 'kbbbgggk', 'kkkkkkkk'],
  gear: ['..k..k..', '.kkkkkk.', 'kkssssk.', '.ks..sk.', '.ks..skk', 'kkssssk.', '.kkkkkk.', '..k..k..'],
  crown: [
    'k....kk....k',
    'kk..kyyk..kk',
    'kyk.kyyk.kyk',
    'kyykyyyykyyk',
    'kyyyyyyyyyyk',
    'kyYyyrryyyyk',
    'kyyyyrryyyyk',
    'kyyyyyyyyyok',
    'kkkkkkkkkkkk',
  ],
  masterball: [
    '....kkkk....',
    '..kkppppkk..',
    '.kpPppppPpk.',
    '.kPPPppPPPk.',
    'kpPpPPPPpPpk',
    'kkkkkwwkkkkk',
    'kwwwkwwkwwwk',
    'kwwwkkkkwwwk',
    '.kwwwwwwwwk.',
    '.kwwwwwwwwk.',
    '..kkwwwwkk..',
    '....kkkk....',
  ],
  box: [
    '.kkkkkkkkkk.',
    'kyyyyyyyyyyk',
    'kyyyYYYYyyyk',
    'kkkkkkkkkkkk',
    '.koookkoook.',
    '.kooykkyook.',
    '.kooookoook.',
    '.kooooooook.',
    '.kooooooook.',
    '.kkkkkkkkkk.',
  ],
  vs: [
    'rr...rr.kkkk',
    'rr...rrkk...',
    'rr...rrkk...',
    'rr...rr.kkk.',
    '.rr.rr....kk',
    '.rr.rr....kk',
    '..rrr...kkk.',
    '...r..kkkk..',
  ],
  // Status glyphs for dice faces: one colour, details cut out as holes, so they read as silhouettes on any die.
  glyphBurn: [
    '....k.....',
    '....kk....',
    '...kkk..k.',
    '...kkkk.k.',
    '..kkkkkkk.',
    '.kkkk.kkkk',
    '.kkk...kkk',
    '.kkk...kkk',
    '..kkk.kkk.',
    '...kkkkk..',
  ],
  glyphPoison: [
    '..kkkkkk..',
    '.kkkkkkkk.',
    'kkkkkkkkkk',
    'k...kk...k',
    'k...kk...k',
    'kkkkkkkkkk',
    '.kkk..kkk.',
    '..kkkkkk..',
    '..k.kk.k..',
    '..kkkkkk..',
  ],
  glyphFrozen: [
    '....kk....',
    '.k..kk..k.',
    '..k.kk.k..',
    '...kkkk...',
    'kkkkkkkkkk',
    'kkkkkkkkkk',
    '...kkkk...',
    '..k.kk.k..',
    '.k..kk..k.',
    '....kk....',
  ],
  glyphParalyze: [
    '.....kkkk.',
    '....kkkk..',
    '...kkkk...',
    '..kkkk....',
    '.kkkkkkkk.',
    '.....kkk..',
    '....kkk...',
    '...kkk....',
    '..kk......',
    '.k........',
  ],
  glyphConfuse: [
    'kkkkkkkkk.',
    'k.......k.',
    'k.kkkkk.k.',
    'k.k...k.k.',
    'k.k.k.k.k.',
    'k.k.kkk.k.',
    'k.k.....k.',
    'k.kkkkkkk.',
    'k.........',
    'kkkkkkkkkk',
  ],
  glyphHeal: [
    '...kkkk...',
    '...kkkk...',
    '...kkkk...',
    'kkkkkkkkkk',
    'kkkkkkkkkk',
    'kkkkkkkkkk',
    'kkkkkkkkkk',
    '...kkkk...',
    '...kkkk...',
    '...kkkk...',
  ],
  // Line icons use 2px strokes on a 12px grid so they stay legible at small sizes.
  history: [
    'kk.kkkkkkkkk',
    'kk.kkkkkkkkk',
    '............',
    'kk.kkkkkkkkk',
    'kk.kkkkkkkkk',
    '............',
    'kk.kkkkkkkkk',
    'kk.kkkkkkkkk',
    '............',
    'kk.kkkkkkkkk',
    'kk.kkkkkkkkk',
  ],
  dice: [
    'kkkkkkkkkk.',
    'kwwwwwwwwkk',
    'kwkkwwwwwkk',
    'kwkkwwwwwkk',
    'kwwwwwwwwkk',
    'kwwwwwwwwkk',
    'kwwwwwkkwkk',
    'kwwwwwkkwkk',
    'kwwwwwwwwkk',
    'kkkkkkkkkkk',
    '.kkkkkkkkkk',
  ],
  sword: [
    '.........kkk',
    '........kwwk',
    '.......kwwk.',
    '......kwwk..',
    '.....kwwk...',
    'k...kwwk....',
    'kk.kwwk.....',
    '.kkkwk......',
    '..kkk.......',
    '.kkkkk......',
    'kkk..kk.....',
    'kk..........',
  ],
  run: [
    '......kkk...',
    '......kkk...',
    '...kkkkk....',
    '..kk.kkkk...',
    '.kk..kkk.kk.',
    '.....kkk....',
    '....kk.kk...',
    '...kk...kk..',
    '..kk.....kk.',
    '.kk......kk.',
    'kk..........',
  ],
  check: [
    '..........kk',
    '.........kkk',
    '........kkk.',
    '.......kkk..',
    'kk....kkk...',
    'kkk..kkk....',
    '.kkkkkk.....',
    '..kkkk......',
    '...kk.......',
  ],
  speed: [
    'kk....kk....',
    'kkk...kkk...',
    '.kkk...kkk..',
    '..kkk...kkk.',
    '...kkk...kkk',
    '...kkk...kkk',
    '..kkk...kkk.',
    '.kkk...kkk..',
    'kkk...kkk...',
    'kk....kk....',
  ],
  trophy: [
    '..kkkkkkkk..',
    'kkkYyyyyokkk',
    'k.kYyyyyok.k',
    'k.kYyyyyok.k',
    '.kkYyyyyokk.',
    '...kyyyyok..',
    '....kyyok...',
    '.....kk.....',
    '....kyyk....',
    '...kkkkkk...',
    '...kyyyyk...',
    '...kkkkkk...',
  ],
  reroll: [
    '...kkkkk....',
    '.kkkkkkkk...',
    '.kk...kkkkkk',
    'kk.....kkkk.',
    'kk......kk..',
    'kk..........',
    '..........kk',
    '..kk......kk',
    '.kkkk.....kk',
    'kkkkkk...kk.',
    '...kkkkkkkk.',
    '....kkkkk...',
  ],
  user: ['..kkkk..', '.kwwwwk.', '.kwwwwk.', '.kwwwwk.', '..kkkk..', '.kbbbbk.', 'kbbbbbbk', 'kbbbbbbk'],
  book: ['kkkkkkkk', 'kwwwkwwk', 'kwwwkwwk', 'kwkwkwkk', 'kwwwkwwk', 'kwkwkwkk', 'kwwwkwwk', 'kkkkkkkk'],
  wrench: ['....kkk.', '...kssk.', '...ksskk', '..kssk..', '.kssk...', 'kssk....', 'kssk....', '.kkk....'],
} as const

export type IconName = keyof typeof ICONS

export function PixelIcon({
  name,
  size = 16,
  className,
  style,
  title,
  color,
}: {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
  title?: string
  /** Draw every pixel in this one colour: a silhouette (e.g. status faces on dice). */
  color?: string
}) {
  const rows = ICONS[name]
  const h = rows.length
  const w = rows[0]!.length
  return (
    <svg
      width={size}
      height={(size * h) / w}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color ?? PAL[ch]} />)),
      )}
    </svg>
  )
}

/** The one-colour glyph a status face shows on a die. */
export const STATUS_GLYPH: Record<string, IconName> = {
  burn: 'glyphBurn',
  frozen: 'glyphFrozen',
  paralyze: 'glyphParalyze',
  poison: 'glyphPoison',
  confuse: 'glyphConfuse',
  heal: 'glyphHeal',
}

export const STATUS_ICON: Record<string, IconName> = {
  burn: 'burn',
  frozen: 'frozen',
  paralyze: 'paralyze',
  poison: 'poison',
  confuse: 'confuse',
  heal: 'heal',
}
