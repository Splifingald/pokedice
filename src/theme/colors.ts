// Single source of truth for the GBC palette and the type colours.
// Imported by tailwind.config.ts, the seed script (dice_types.color) and the art script.

export const PALETTE = {
  parchment: '#e8e0c8',
  ink: '#2a2438',
  panel: '#f7f2e0',
  /** Borders and drop shadows only — too light for text on parchment (4.2:1). */
  shadow: '#6b6480',
  /** Secondary text: 5.9:1 on parchment, 6.9:1 on panels. */
  muted: '#554d6a',
  gold: '#e8b44a',
  /** Text and button fill: 5.0:1 as text on parchment, 5.9:1 under panel-coloured text. */
  danger: '#a8341f',
  /** Danger as text on ink (dark grounds). */
  dangerLight: '#ea7a5e',
  /** Positive text (bonus previews): 5.7:1 on panels. */
  good: '#2f6b36',
  hpGreen: '#4aa84a',
  hpYellow: '#e8c44a',
  hpRed: '#c2452d',
} as const

/** Status effects: the outline of a die face that carries one, and its counter under the tray. */
export const STATUS_COLORS = {
  burn: '#f07a2a',
  poison: '#b04db0',
  frozen: '#5fc0e0',
  paralyze: '#f0cc28',
  confuse: '#ec5f9e',
  heal: '#52c052',
} as const

/** Standard type colours darkened ~15 % to sit on parchment. Normal is the spec's warm tan. */
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
