// Single source of truth for the palette and the type colours: Johto Daybreak (docs/15-UI-GUIDELINES.md).
// Imported by tailwind.config.ts and the frame generator. The seed script (dice_types.color) and the art script keep
// TYPE_COLORS, the data's own type colours; the UI draws types with DAYBREAK_TYPES.

export const PALETTE = {
  /** The page ground: a pale morning sky, under an 8 px dot texture (frames.ts). */
  parchment: '#e9f0f8',
  /** Text and outlines: 11:1 on panels. */
  ink: '#24304f',
  /** Panels and sheets. */
  panel: '#fbfdff',
  /** Inputs, cards on a panel, white buttons. */
  paper: '#ffffff',
  /** Borders, dashed rules, disabled outlines. Never text. */
  shadow: '#b6c3d9',
  /** Hairlines and empty tracks (meters, pips). */
  line: '#dde5f0',
  /** A panel's inner bottom lip. */
  lip: '#dfe7f2',
  /** Secondary text: 5.1:1 on panels, 4.7:1 on the ground. */
  muted: '#5c6a8a',
  /** Placeholders and decoration only: 3.1:1, too light for text. */
  faint: '#8592ad',
  /** New, lead, combo: the one warm highlight. Ink on gold reads 8.9:1. */
  gold: '#ffbe2e',
  goldLight: '#ffe7a8',
  goldPale: '#fff4d6',
  /** The primary action: CONTINUE, ATTACK, GO. */
  accent: '#f2553f',
  /** Pressed primary, and red as text (5.2:1 on panels). */
  danger: '#c4382a',
  /** Red as text on ink (dark grounds): 5.7:1. */
  dangerLight: '#ff8a7a',
  /** Positive text (bonus previews, cleared): 6.5:1 on panels. */
  good: '#1d6b43',
  goodPale: '#d8f5e4',
  hpGreen: '#34c97a',
  hpYellow: '#ffbe2e',
  hpRed: '#ff5a4a',
  /** The HP the last hit took, before the trail catches up. */
  hpTrail: '#ffb3a8',
  /** The navy that stays navy in both themes: text on gold and other bright fills, the scrim under a dialog. */
  night: '#24304f',
  /** Red and green as fills under white text, the same in both themes (danger and good are text colours). */
  crimson: '#c4382a',
  forest: '#1d6b43',
} as const

/**
 * The colours that change with the theme (Settings → Theme). Light is PALETTE's Daybreak; dark is Dusk, the same
 * lab after sundown. tailwind.config.ts turns each into a CSS variable (`--c-ink` …) and a Tailwind colour, so a
 * component writes `text-ink` or `bg-well` once and reads right in both. Everything else (gold, the HP colours, types,
 * statuses, the art) keeps one value: bright fills keep navy text in both themes (`light-scope`, index.css).
 */
export const THEMES = {
  light: {
    parchment: PALETTE.parchment,
    ink: PALETTE.ink,
    /** Outlines: card rings, frames, dividers. The ink itself in light; a softer slate in dark, so frames don't glare. */
    edge: PALETTE.ink,
    panel: PALETTE.panel,
    paper: PALETTE.paper,
    shadow: PALETTE.shadow,
    line: PALETTE.line,
    lip: PALETTE.lip,
    muted: PALETTE.muted,
    faint: PALETTE.faint,
    'gold-light': PALETTE.goldLight,
    'gold-pale': PALETTE.goldPale,
    danger: PALETTE.danger,
    'danger-light': PALETTE.dangerLight,
    good: PALETTE.good,
    'good-pale': PALETTE.goodPale,
    /** A sunken ground inside a card: tiles, dex cells, empty slots. */
    well: '#f1f4f9',
    /** Deeper: locked tiles, prices you can't pay, the unavailable. */
    'well-deep': '#e3e8f0',
    /** The blue tint: the trainer card, menu tiles, info. */
    sky: '#e8f1ff',
    'sky-line': '#cfe0fb',
    /** The red tint behind a warning (no energy, a fainted lead). */
    rose: '#fff2ef',
    /** The warm card: something you can afford, the next region, the lead. */
    cream: '#fffbea',
    /** Prof. Oak's notes and the Egg on sale: paper, and its lip. */
    sand: '#fff8ec',
    'sand-lip': '#f3e2c4',
    /** The dot of the ground's texture. */
    dot: '#dde7f3',
    /** The dialogue box's inner ring. */
    'dialog-ring': '#cfe0f4',
  },
  dark: {
    parchment: '#10172a',
    ink: '#e6ecf7',
    edge: '#7d8bb2',
    panel: '#182139',
    paper: '#1f2944',
    shadow: '#3e4b6e',
    line: '#2b3654',
    lip: '#151c31',
    muted: '#a7b2cc',
    faint: '#6f7c9c',
    'gold-light': '#7a5a12',
    'gold-pale': '#2e2817',
    danger: '#ff8676',
    'danger-light': '#b3352a',
    good: '#72dca0',
    'good-pale': '#173628',
    well: '#141b30',
    'well-deep': '#283250',
    sky: '#1c2a4a',
    'sky-line': '#35507e',
    rose: '#3a1e24',
    cream: '#28251a',
    sand: '#2a2520',
    'sand-lip': '#4a3d2a',
    dot: '#1a2238',
    'dialog-ring': '#35507e',
  },
} as const satisfies Record<'light' | 'dark', Record<string, string>>

export type ThemeName = keyof typeof THEMES
export type ThemeColor = keyof (typeof THEMES)['light']

/** Status effects: the ring of a die face that carries one, its badge, and its chip under the tray. */
export const STATUS_COLORS = {
  burn: '#f07a2a',
  poison: '#b04db0',
  frozen: '#5fc0e0',
  paralyze: '#f0cc28',
  confuse: '#ec5f9e',
  heal: '#52c052',
} as const

/** The data's type colours (dice_types.color in the seed, the art script). The UI uses DAYBREAK_TYPES. */
export const TYPE_COLORS = {
  base: '#f7f2e0',
  normal: '#c8b88a',
  fire: '#ca6e29',
  water: '#547acc',
  electric: '#d2b125',
  grass: '#68a941',
  ice: '#80b8b6',
  fighting: '#a52722',
  poison: '#8b3589',
  ground: '#c0a256',
  flying: '#907acf',
  psychic: '#d44873',
  bug: '#8d9d16',
  rock: '#9b892e',
  ghost: '#624a80',
  dragon: '#5e2dd6',
  dark: '#5f4a3c',
  steel: '#9c9caf',
  fairy: '#b67193',
} as const

/** Daybreak's type colours: the familiar bright ones. Dice fill with them; badges mix them (TypeBadge). */
export const DAYBREAK_TYPES = {
  base: '#f4f6fb',
  normal: '#a8a77a',
  fire: '#ee8130',
  water: '#6390f0',
  electric: '#f7d02c',
  grass: '#7ac74c',
  ice: '#96d9d6',
  fighting: '#c22e28',
  poison: '#a33ea1',
  ground: '#e2bf65',
  flying: '#a98ff3',
  psychic: '#f95587',
  bug: '#a6b91a',
  rock: '#b6a136',
  ghost: '#735797',
  dragon: '#6f35fc',
  dark: '#705746',
  steel: '#b7b7ce',
  fairy: '#d685ad',
} as const

/** The pixel icons' palette: one letter per colour (icons.tsx, and the canvas painters). */
export const ICON_PALETTE: Record<string, string> = {
  k: PALETTE.ink,
  w: '#ffffff',
  y: '#ffbe2e',
  Y: '#ffe7a8',
  o: '#ff8a3d',
  r: '#f2553f',
  b: '#5b8def',
  c: '#7fd6d0',
  C: '#d4f3f0',
  p: '#a24bc4',
  P: '#e3a6f2',
  g: '#34c97a',
  s: '#8592ad',
  e: '#ffd23a',
  m: '#ff6f9c',
}
