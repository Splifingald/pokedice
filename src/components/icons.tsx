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

/** The Trades arrows: the tab bar's gold, and a lighter blue than its own. */
const TRADE_PAL: Record<string, string> = {
  k: '#24304f',
  y: '#ffbe2e',
  Y: '#ffe7a8',
  o: '#e08e00',
  b: '#5b8def',
  c: '#a9dcff',
  d: '#3a5fc0',
}

/** A wrapped gift (docs/15 §23): a red box, a gold ribbon and its bow. */
const GIFT_PAL: Record<string, string> = {
  k: '#24304f',
  w: '#ffffff',
  r: '#f2553f',
  R: '#c4382a',
  y: '#ffbe2e',
  Y: '#ffe7a8',
  o: '#e08e00',
}

/** The Heart Scale: the item sprite's own pearly colours, its outline the edge's navy. */
const HEART_SCALE_PAL: Record<string, string> = {
  k: '#24304f',
  a: '#ceceef',
  b: '#efefef',
  c: '#ceefef',
  d: '#7b7b9c',
  e: '#efcece',
  f: '#c5e6c5',
}

/** The battle Bag: a red flap with a gold buckle over a tan backpack, its front pocket and brown straps. */
const BAG_PAL: Record<string, string> = {
  k: '#24304f',
  r: '#f2553f',
  R: '#c4382a',
  p: '#ff9a85',
  y: '#ffbe2e',
  Y: '#ffe7a8',
  o: '#e08e00',
  F: '#f0a060',
  f: '#d8783a',
  H: '#a85a2a',
}

/** Trick or Treat (docs/29): a jack-o'-lantern, its glow and its stem. */
const PUMPKIN_PAL: Record<string, string> = {
  k: '#24304f',
  o: '#ff8a3d',
  O: '#d8641a',
  y: '#ffe066',
  g: '#34c97a',
}

/** The Underground's pickaxe and Explorakit (docs/34): steel, a wooden handle, a leather kit. */
const DIG_PAL: Record<string, string> = {
  k: '#24304f',
  d: '#7a7c96',
  s: '#b7b7ce',
  S: '#e6e8f2',
  h: '#a87a48',
  H: '#7a5230',
  b: '#c88a3a',
  B: '#8a5a1c',
  y: '#ffe7a8',
}

export const ICONS = {
  // Hidden talents (docs/51): a cut gem, green for a common talent, blue for a rare one, gold for an ultra one, red for the
  // unique one (Ditto's), grey while it’s unknown.
  talent: [
    '....kk....',
    '...kwYk...',
    '..kwYyyk..',
    '.kwYyyyok.',
    'kYyyyyyook',
    'kyyyyyoook',
    '.kyyyoook.',
    '..kyoook..',
    '...kook...',
    '....kk....',
  ],
  talentBase: [
    '....kk....',
    '...kwck...',
    '..kwccbk..',
    '.kwccccbk.',
    'kcccccbbbk',
    'kcccccbbbk',
    '.kcccbbbk.',
    '..kcbbbk..',
    '...kbbk...',
    '....kk....',
  ],
  talentCommon: [
    '....kk....',
    '...kwLk...',
    '..kwLGdk..',
    '.kwLGGGdk.',
    'kLGGGGdddk',
    'kGGGGGdddk',
    '.kGGGdddk.',
    '..kGdddk..',
    '...kddk...',
    '....kk....',
  ],
  talentUnique: [
    '....kk....',
    '...kwpk...',
    '..kwprrk..',
    '.kwprrrRk.',
    'kprrrrRRRk',
    'krrrrrRRRk',
    '.krrrRRRk.',
    '..krRRRk..',
    '...kRRk...',
    '....kk....',
  ],
  talentLocked: [
    '....kk....',
    '...kwlk...',
    '..kwlllk..',
    '.kwllllgk.',
    'klllllgggk',
    'klllllgggk',
    '.klllgggk.',
    '..klgggk..',
    '...kggk...',
    '....kk....',
  ],
  gift: [
    '..kkk..kkk..',
    '.kyYykkyYyk.',
    '.kyokyykoyk.',
    '..kkkyykkk..',
    'kkkkkyokkkkk',
    'krwrryyrrrrk',
    'kRRRRyoRRRRk',
    'kkkkkyokkkkk',
    '.krrryyrrrk.',
    '.krrryyrrrk.',
    '.kRRRyoRRRk.',
    '.kkkkkkkkkk.',
  ],
  /** A Heart Scale (docs/59): the Friend Market's currency, the games' own item sprite (Gen IV, 18 × 15). */
  heartScale: [
    '....kkkk..........',
    '...kaaaak.........',
    '..kabbbbbk........',
    '..kaccccbk........',
    '.dacccccckkkkk....',
    '.kaeeeeecccebakk..',
    '.kabbbbeecccebaak.',
    'dabfffbbeeccebaabk',
    'dafffffbeeccebaabk',
    'kaccccfbeeccebaabk',
    'kcbcccfbeeccebafbk',
    'kcbbccfbeecebabbk.',
    'kcbbccbeecebbbkk..',
    'kcbbbbbbbbbkkk....',
    'kkkkkkkkkkk.......',
  ],
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
  // A shiny's twinkle (the Shiny Parade's chips): a four-point star.
  sparkle: ['....k....', '...kyk...', '...kyk...', '.kkyYykk.', 'kyyYwYyyk', '.kkyYykk.', '...kyk...', '...kyk...', '....k....'],
  // How to play's finger (docs/38 §8b): a pointing glove, its fingertip at the top, 5 pixels in from the left.
  tap: [
    '....kk.......',
    '...kwwk......',
    '...kwlk......',
    '...kwlk......',
    '...kwlkkk....',
    '...kwlkwlkkk.',
    '.kkkwlkwlkwlk',
    'kwlkwwwwwwwlk',
    'kwwwwwwwwwwlk',
    '.kwwwwwwwwwlk',
    '.kwwwwwwwwwlk',
    '..kwwwwwwwlk.',
    '...kwwwwwlk..',
    '...kkkkkkkk..',
  ],
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
  // The battle's Bag: a backpack, its flap buckled shut, a pocket on the front, straps at its sides.
  bag: [
    '......kkkk......',
    '.....kk..kk.....',
    '....kkkkkkkk....',
    '...krrrrrrrrk...',
    '..krpprrrrrrRk..',
    '..kprrrrrrrrRk..',
    '.kkprrrrrrrrRkk.',
    'kHkRRRkkkkRRRkHk',
    'kHkFFFkYykFFfkHk',
    'kHkFFFkyokFFfkHk',
    'kHkFFFFkkFFFfkHk',
    'kHkFrrrrrrrrfkHk',
    'kHkFrprrrrrRfkHk',
    'kHkFRRRRRRRRfkHk',
    '.kkffffffffffkk.',
    '..kkkkkkkkkkkk..',
  ],
  // Extreme mode (docs/22): its emblem, and a Pokémon resting after a K.O.
  skull: ['..kkkkkk..', '.kwwwwwwk.', 'kwwwwwwwwk', 'kwkkwwkkwk', 'kwkkwwkkwk', 'kwwwkkwwwk', '.kwwwwwwk.', '..kwwwwk..', '..kwkkwk..', '...kkkk...'],
  moon: ['..kkkk..', '.kyykk..', 'kyyk....', 'kyk.....', 'kyk.....', 'kyyk....', '.kyykk..', '..kkkk..'],
  // The raids' calendar: two rings, a red header, a grid of days.
  calendar: [
    '..k.....k..',
    'kkwkkkkkwkk',
    'krkrrrrrkrk',
    'krrrrrrrrrk',
    'kkkkkkkkkkk',
    'kwwwwwwwwwk',
    'kwkwkwkwkwk',
    'kwwwwwwwwwk',
    'kwkwkwkwkwk',
    'kwwwwwwwwwk',
    'kwkwkwwwwwk',
    'kkkkkkkkkkk',
  ],
  // The raid's speed button: two arrows side by side, pointing on (fast forward).
  fastForward: [
    'k.....k....',
    'kk....kk...',
    'kkk...kkk..',
    'kkkk..kkkk.',
    'kkkkk.kkkkk',
    'kkkk..kkkk.',
    'kkk...kkk..',
    'kk....kk...',
    'k.....k....',
  ],
  // Push notifications (docs/27): a gold bell with its clapper, a ring of sound on each side.
  bell: [
    '.......k.......',
    '......kYk......',
    '.....kYyyk.....',
    '.k..kYyyyyk..k.',
    'k...kYyyyyk...k',
    'k..kYyyyyyyk..k',
    'k..kYyyyyyyk..k',
    '.k.kYyyyyyyk.k.',
    '..kYyyyyyyyyk..',
    '.kYyyyyyyyyyyk.',
    '.kkkkkkkkkkkkk.',
    '......kok......',
    '.......k.......',
  ],
  // Trades (docs/23): two arrows crossing, gold over blue, drawn like the tab bar's.
  trade: [
    '.........k......',
    '........kYk.....',
    '.kkkkkkkkYYk....',
    'kYYYYYYYYYYYk...',
    'kyyyyyyyyyyyyk..',
    'koooooooooook...',
    '.kkkkkkkkook....',
    '......k.kok.....',
    '.....kck.k......',
    '....kcckkkkkkkk.',
    '...kccccccccccck',
    '..kbbbbbbbbbbbbk',
    '...kdddddddddddk',
    '....kddkkkkkkkk.',
    '.....kdk........',
    '......k.........',
  ],
  // A pencil: tap to rename (a Pokémon's nickname).
  pencil: [
    '........kkk.',
    '.......kmmmk',
    '......kmmmk.',
    '.....ksssk..',
    '....kYyok...',
    '...kYyok....',
    '..kYyok.....',
    '.kYYYk......',
    'kYYk........',
    'kk..........',
  ],
  // Day and night (docs/32): the top bar's and the fights' sun (6:00–17:59) and moon (18:00–5:59), 16×16.
  daySun: [
    '.......oo.......',
    '.......oo.......',
    '..oo........oo..',
    '..ooo......ooo..',
    '...o..kkkk..o...',
    '.....kYYYyk.....',
    '....kYYyyyyk....',
    'oo..kYyyyyyk..oo',
    'oo..kyyyyyok..oo',
    '....kyyyyook....',
    '.....kyyook.....',
    '...o..kkkk..o...',
    '..ooo......ooo..',
    '..oo........oo..',
    '.......oo.......',
    '.......oo.......',
  ],
  nightMoon: [
    '................',
    '..........y.....',
    '.....kk..yYy....',
    '...kkYk...y.....',
    '..kYYk..........',
    '.kYYYk......y...',
    '.kYYYk.....yYy..',
    '.kYYYYk.....y...',
    '.kYYYYk.........',
    '.kYYYYYk........',
    '.kYYYYyykkkkk...',
    '.kYYYyyyyyyyk...',
    '..kYyyyyyyyk....',
    '...kkyyyyykk....',
    '.....kkkkk......',
    '................',
  ],
  // Trick or Treat (docs/29): its card (a jack-o'-lantern), and the flee zone's ghost.
  pumpkin: [
    '....kkk....',
    '....kgk....',
    '.kkkkkkkkk.',
    'kooOoooOook',
    'koyyoOoyyok',
    'kooOoyoOook',
    'koyyyyyyyok',
    'kooyOyOyook',
    '.kooOoooOk.',
    '..kkkkkkk..',
  ],
  ghost: [
    '...kkkk...',
    '.kkwwwwkk.',
    '.kwwwwwwk.',
    'kwwkwwkwwk',
    'kwwkwwkwwk',
    'kwwwwwwwwk',
    'kwwwkkwwwk',
    'kwwwwwwwwk',
    'kwwwwwwwwk',
    'kwkwwkkwkk',
    'kk.kk..kk.',
  ],
  // A steel head curving round to two points, bound in leather to a wooden handle.
  pickaxe: [
    '.kkkkkk.........',
    'kSSSSSSkk.......',
    '.kkddSSSSk......',
    '...kkdssSSk.....',
    '.....kdssSSk....',
    '......kddsSSk...',
    '.......kddsSSk..',
    '......kBBddsSSk.',
    '.....kHbbkdssSk.',
    '....kHHhk.kdsSSk',
    '...kHHhk...kdSSk',
    '..kHHhk.....kdSk',
    '.kHHhk......kdSk',
    '.kHhk........kSk',
    '..kk.........kSk',
    '..............k.',
  ],
  // The same pickaxe at 12 px, for chips and lines (the 16 px one loses pixels there).
  pickaxeSm: [
    '.kkkk.......',
    'kSSSSkk.....',
    '.kkdSSSk....',
    '...kddSSk...',
    '....kddSSk..',
    '....kBBdSSk.',
    '...kHbBkdSk.',
    '..kHhk.kdSSk',
    '.kHhk...kdSk',
    'kHhk.....kSk',
    'kHk......kSk',
    '.k........k.',
  ],
  kit: [
    '....kkkk....',
    '...k....k...',
    '...k....k...',
    'kkkkkkkkkkkk',
    'kBBBBBBBBBBk',
    'kbbbbbbbbbbk',
    'kbbbbkkbbbbk',
    'kbbbkyykbbbk',
    'kbbbbkkbbbbk',
    'kbbbbbbbbbbk',
    'kBBBBBBBBBBk',
    'kkkkkkkkkkkk',
  ],
  // A Fortune Wheel ticket: a gold stub, notched at the sides, torn along its perforation.
  ticket: [
    '............',
    '............',
    'kkkkkkkkkkkk',
    'kYYYYYYYkYYk',
    'kyyyyyyy.yyk',
    '.kyrrryykyk.',
    '.kyrrryy.yk.',
    'kyyyyyyykyyk',
    'kyyyyyyy.yyk',
    'kkkkkkkkkkkk',
    '............',
    '............',
  ],
  ...PACK_ICONS,
  // Every check mark: a rounded green square, a thick white tick (the user's call, 2026-10-27), over the pack's tick.
  check: [
    '..GGGGGGGGGG..',
    '.GGGGGGGGGGGG.',
    'GGGGGGGGGGGGGG',
    'GGGGGGGGGGwwGG',
    'GGGGGGGGGwwwGG',
    'GGGGGGGGwwwGGG',
    'GGwwGGGwwwGGGG',
    'GGwwwGwwwGGGGG',
    'GGGwwwwwGGGGGG',
    'GGGGwwwGGGGGGG',
    'GGGGGwGGGGGGGG',
    'GGGGGGGGGGGGGG',
    '.GGGGGGGGGGGG.',
    '..GGGGGGGGGG..',
  ],
} as const

export type IconName = keyof typeof ICONS

/** The check mark's green square and white tick: the same in both themes. */
const CHECK_PAL: Record<string, string> = { G: '#24a05c', w: '#ffffff' }

/** Icons drawn in their own palette rather than the shared one. */
const OWN_PALETTE: Partial<Record<IconName, Record<string, string>>> = {
  navShop: NAV_PAL,
  navUpgrades: NAV_PAL,
  navTeam: NAV_PAL,
  navDex: NAV_PAL,
  navRanks: NAV_PAL,
  navFriends: NAV_PAL,
  trade: TRADE_PAL,
  gift: GIFT_PAL,
  heartScale: HEART_SCALE_PAL,
  bag: BAG_PAL,
  pumpkin: PUMPKIN_PAL,
  pickaxe: DIG_PAL,
  pickaxeSm: DIG_PAL,
  kit: DIG_PAL,
  daySun: NAV_PAL,
  nightMoon: NAV_PAL,
  check: CHECK_PAL,
  talent: NAV_PAL,
  talentBase: NAV_PAL,
  talentCommon: NAV_PAL,
  talentUnique: NAV_PAL,
  talentLocked: NAV_PAL,
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
