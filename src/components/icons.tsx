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
  heal: ['..kkkk..', '..kggk..', 'kkkggkkk', 'kgggwggk', 'kggggggk', 'kkkggkkk', '..kggk..', '..kkkk..'],
  sound: ['...k....', '..kk..k.', 'kkwk.k..', 'kwwk.k.k', 'kwwk.k.k', 'kkwk.k..', '..kk..k.', '...k....'],
  mute: ['...k....', '..kk....', 'kkwk.k.k', 'kwwk..k.', 'kwwk.k.k', 'kkwk....', '..kk....', '...k....'],
  close: ['kk....kk', 'kkk..kkk', '.kkkkkk.', '..kkkk..', '..kkkk..', '.kkkkkk.', 'kkk..kkk', 'kk....kk'],
  ball: ['..kkkk..', '.krrrrk.', 'krrwrrrk', 'kkkwwkkk', 'kwwkkwwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
  potion: ['..kkkk..', '...kk...', '..kwwk..', '.kwbbwk.', 'kbbbbbbk', 'kbwbbbbk', 'kbbbbbbk', '.kkkkkk.'],
  up: ['...kk...', '..kggk..', '.kggggk.', 'kkkggkkk', '..kggk..', '..kggk..', '..kggk..', '..kkkk..'],
  dex: ['kkkkkkk.', 'krrrrrrk', 'krwwrrrk', 'krrrrrrk', 'kkkkkkkk', 'kwwwwwwk', 'kwsswwwk', 'kkkkkkkk'],
  map: ['kkkkkkkk', 'kgggbbbk', 'kgyggbbk', 'kggggbbk', 'kbbgrggk', 'kbbggggk', 'kbbbgggk', 'kkkkkkkk'],
  gear: ['..k..k..', '.kkkkkk.', 'kkssssk.', '.ks..sk.', '.ks..skk', 'kkssssk.', '.kkkkkk.', '..k..k..'],
  dice: ['kkkkkkk.', 'kwwwwwkk', 'kwkwwwkk', 'kwwwwwkk', 'kwwwkwkk', 'kwwwwwkk', 'kkkkkkkk', '.kkkkkkk'],
  sword: ['......kk', '.....kwk', '....kwk.', 'k..kwk..', 'kkkwk...', '.kkk....', '.kkkk...', 'kk..k...'],
  run: ['...kk...', '...kk...', '.kkkkk..', 'k.kk.kk.', '..kk....', '.k..k...', 'k....k..', '........'],
  check: ['........', '.......k', '......kg', 'k....kg.', 'gk..kg..', '.gkkg...', '..gg....', '........'],
  speed: ['kk...kk...', '.kk...kk..', '..kk...kk.', '...kk...kk', '...kk...kk', '..kk...kk.', '.kk...kk..', 'kk...kk...'],
  reroll: ['..kkkk..', '.k....kk', 'k....kkk', 'k.......', '.......k', 'kkk....k', 'kk....k.', '..kkkk..'],
} as const

export type IconName = keyof typeof ICONS

export function PixelIcon({
  name,
  size = 16,
  className,
  style,
  title,
}: {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
  title?: string
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
        [...row].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PAL[ch]} />)),
      )}
    </svg>
  )
}

export const STATUS_ICON: Record<string, IconName> = {
  burn: 'burn',
  frozen: 'frozen',
  paralyze: 'paralyze',
  poison: 'poison',
  confuse: 'confuse',
  heal: 'heal',
}
