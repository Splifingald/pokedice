// Pixel icons: each row is a string, each char a palette colour ('.' = transparent). The Pokémon ones (balls, the
// Pokédex, badges, status symbols) are hand-drawn here; the generic UI ones (coin, heart, shop, trophy, settings…) come
// from the "1-bit Pixel Icons" pack, recoloured by scripts/import-icons.ts into packIcons.ts.
import type { CSSProperties } from 'react'
import { ICON_PALETTE } from '@/theme/colors'
import { PACK_ICONS } from './packIcons'

const PAL = ICON_PALETTE
const OUTLINE = '#24304f'
const THEMED_OUTLINE = { fill: 'rgb(var(--c-edge, 36 48 79))' }

/** The tab bar's 16×16 icons have their own tones: navy outline, three tones each, one idea each. */
const NAV_PAL: Record<string, string> = {
  k: '#24304f',
  w: '#ffffff',
  l: '#dfe7f2',
  g: '#b6c3d9',
  r: '#f2553f',
  R: '#c4382a',
  p: '#ff9a85',
  y: '#ffbe2e',
  Y: '#ffe7a8',
  o: '#e08e00',
  G: '#34c97a',
  L: '#a8f0c8',
  c: '#7cc8f0',
  b: '#3a7be0',
  e: '#c8f0d0',
  d: '#5f9a78',
  F: '#f0a060',
  f: '#d8783a',
  H: '#a85a2a',
  S: '#8592ad',
}

export const ICONS = {
  burn: ['....k...', '...kok..', '..koYok.', '.kooYyok', '.koyYyok', '.kooyyok', '..koook.', '...kkk..'],
  frozen: ['...kk...', '..kCck..', '.kCccck.', 'kCcCccck', 'kcccCcck', '.kcccck.', '..kcck..', '...kk...'],
  paralyze: ['....kkk.', '...keek.', '..keek..', '.keeeek.', '.kkeek..', '..kek...', '..kk....', '.k......'],
  poison: ['......k.', '.kk..kPk', 'kppk..k.', 'kpPpk...', 'kpppk.kk', '.kkk.kPk', '.....kpk', '......k.'],
  confuse: ['.kkkkk..', 'km....k.', 'k.kkk.k.', 'k.k.k.k.', 'k.k...k.', 'k.kkkk..', 'k.......', '.kkkkkk.'],
  heal: ['..kkkk..', '..kggk..', 'kkkggkkk', 'kgggwggk', 'kggggggk', 'kkkggkkk', '..kggk..', '..kkkk..'],
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
  dex: ['kkkkkkk.', 'krrrrrrk', 'krwwrrrk', 'krrrrrrk', 'kkkkkkkk', 'kwwwwwwk', 'kwsswwwk', 'kkkkkkkk'],
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
  badge: ['...kk...', '..kyyk..', '.kyYyyk.', 'kyYyyyyk', 'kyyyyyok', '.kyyyok.', '..kyok..', '...kk...'],
  // The tab bar (NAV_PAL): three balls for the team, a red Pokédex (the shop, upgrades, ranks and friends are in PACK_ICONS).
  navTeam: [
    '......kkkk......',
    '.....krrrrk.....',
    '....krprrrrk....',
    '....krrkkrrk....',
    '....kkkwwkkk....',
    '....kwwkkwwk....',
    '.....kwwwwk.....',
    '..kkkkkkkkkkkk..',
    '.krrrrk..krrrrk.',
    'krprrrrkkrprrrrk',
    'krrkkrrkkrrkkrrk',
    'kkkwwkkkkkkwwkkk',
    'kwwkkwwkkwwkkwwk',
    '.kwwwwk..kwwwwk.',
    '..kkkk....kkkk..',
    '................',
  ],
  navDex: [
    '.kkkkkkkkkkkkkk.',
    'kppppppppppppppk',
    'krkkkkrrrrrrrrRk',
    'kkcwcckrwwyyGGRk',
    'kkccbckrwwyyGGRk',
    'kkcbbckrrrrrrrRk',
    'krkkkkrrrrrrrrRk',
    'krrrrrrrrrrrrrRk',
    'krkkkkkkkkkkkrRk',
    'krkeeeeeeeeekrRk',
    'krkeddeeeeeekrRk',
    'krkeeeedddeekrRk',
    'krkkkkkkkkkkkrRk',
    'krrrrrrrrrrrrrRk',
    'kRRRRRRRRRRRRRRk',
    '.kkkkkkkkkkkkkk.',
  ],
  ...PACK_ICONS,
} as const

export type IconName = keyof typeof ICONS

/** Icons drawn in their own palette rather than the shared one. */
const OWN_PALETTE: Partial<Record<IconName, Record<string, string>>> = {
  navShop: NAV_PAL,
  navUpgrades: NAV_PAL,
  navTeam: NAV_PAL,
  navDex: NAV_PAL,
  navRanks: NAV_PAL,
  navFriends: NAV_PAL,
}

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
  const pal = OWN_PALETTE[name] ?? PAL
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
        [...row].map((ch, x) => {
          if (ch === '.') return null
          const fill = color ?? pal[ch]
          // The navy outline follows the theme (a slate one at dusk), or a dark-only shape would vanish there.
          return !color && fill === OUTLINE ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} style={THEMED_OUTLINE} />
          ) : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
          )
        }),
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
