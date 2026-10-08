// Pokémon Showdown's sprites: the one source for every Pokémon and trainer picture (docs/13-SHOWDOWN-SPRITES.md).
// Shared by the components and by scripts/showdown-sprites.ts, which writes the tables these read.

export const SHOWDOWN_SPRITES = 'https://play.pokemonshowdown.com/sprites'

/** A sprite's views, in the order `ShowdownEntry.v` lists them. */
export const SHOWDOWN_VIEWS = ['front', 'back', 'front-shiny', 'back-shiny'] as const
export type ShowdownView = (typeof SHOWDOWN_VIEWS)[number]

/**
 * Pixel-art animated GIFs per view (`gen5ani`: Black/White's animated sprites, and the community's in that style), and
 * Showdown's static pixel-art set (`gen5`) where no animation is drawn yet. Never the `ani` set: those are renders of
 * the 3D models, not pixel art.
 */
export const ANI_DIRS: Record<ShowdownView, string> = {
  front: 'gen5ani',
  back: 'gen5ani-back',
  'front-shiny': 'gen5ani-shiny',
  'back-shiny': 'gen5ani-back-shiny',
}
export const GEN5_DIRS: Record<ShowdownView, string> = {
  front: 'gen5',
  back: 'gen5-back',
  'front-shiny': 'gen5-shiny',
  'back-shiny': 'gen5-back-shiny',
}

/**
 * Canvas width and height, then the box [x0, y0, x1, y1] of every pixel any frame makes opaque — left out when that is
 * the whole canvas, as it is for every animated sprite (Showdown trims them).
 */
export type ShowdownBox =
  [w: number, h: number] | [w: number, h: number, x0: number, y0: number, x1: number, y1: number]

/** The opaque box of a `ShowdownBox`, whole canvas when it has none. */
export const artBox = (b: ShowdownBox): [x0: number, y0: number, x1: number, y1: number] =>
  b.length === 6 ? [b[2], b[3], b[4], b[5]] : [0, 0, b[0] - 1, b[1] - 1]

export interface ShowdownEntry {
  /** Showdown's sprite id: `pikachu`, `charizard-megax`, `arceus-fire`. */
  id: string
  /** One letter per view (front, back, front shiny, back shiny): `a` animated, `g` static, `-` none on Showdown. */
  v: string
  /** Cell in the icon sheet (src/assets/pokemon-icons.png): Showdown's icon number. */
  i: number
  f?: ShowdownBox
  b?: ShowdownBox
  /** The shiny views' boxes, only where they differ from the plain ones. */
  fs?: ShowdownBox
  bs?: ShowdownBox
}

/** The icon sheet (src/assets/pokemon-icons.png): Showdown's own, 40×30 menu icons, ICON_COLS to a row. */
export const ICON_W = 40
export const ICON_H = 30
export const ICON_COLS = 12

/** The trainer sheets (src/assets/trainers/<region>.png): Showdown's 80×80 trainers, TRAINER_COLS to a row. */
export const TRAINER_CELL = 80
export const TRAINER_PITCH = TRAINER_CELL + 2
export const TRAINER_COLS = 10

export const showdownSpriteUrl = (id: string, view: ShowdownView, kind: 'a' | 'g') =>
  kind === 'a'
    ? `${SHOWDOWN_SPRITES}/${ANI_DIRS[view]}/${id}.gif`
    : `${SHOWDOWN_SPRITES}/${GEN5_DIRS[view]}/${id}.png`
