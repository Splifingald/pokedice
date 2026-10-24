// The title's dice logo (logo.ts) in numbers the page needs before the logo's chunk has loaded: the room it keeps, in
// art pixels. Tiny on purpose: the title imports this, and fetches the maths and the renderer only with the game feel on.

/** One row from 768 px; two rows, POKÉ over DICE, on a phone. */
export type LogoLayout = 'wide' | 'tall'

/** A box in whole art pixels from the logo's origin: x0 and y0 in, x1 and y1 out. */
export interface LogoBox {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** The resting logo, its gold rings included (`logoBox` in logo.ts works it out; tests/dice-logo.test.ts compares). */
export const LOGO_BOX: Record<LogoLayout, LogoBox> = {
  wide: { x0: -137, x1: 136, y0: -33, y1: 20 },
  tall: { x0: -73, x1: 73, y0: -56, y1: 42 },
}

/**
 * The canvas reaches past the box: above it for the drops and the spin, below it for the dice coming in from the
 * player's side and their first bounce. Sideways it spans the page, so the dice come in from its edge.
 */
export const LOGO_PAD = { top: 52, bottom: 50 }

/** How flat the floor's gold ring lies (its height over its width): it spreads without reaching the canvas's edges. */
export const LOGO_RING_FLAT: Record<LogoLayout, number> = { wide: 0.15, tall: 0.2 }

/** CSS px per art pixel (docs/15 §4). */
export const ART_PX = 2
