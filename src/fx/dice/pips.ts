// A die face's pips, shared by the DOM die (components/Die.tsx) and the thrown cube's face art (fx/dice/cube.ts), so
// the cube lands showing exactly the face the resting die then shows.

/**
 * Which of the nine pip cells (0–8, row by row) each value lights: a die's own 1 to 6. Anything else (0, 7, 8, a
 * negative face) has no pips and shows its number, so it reads at a glance as out of the ordinary.
 */
export const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

/**
 * Pip geometry on whole pixels: one even pip size per die and three fixed columns and rows, so every dot on a die is
 * the same size whatever the die's size (a fractional pip renders as a blur or a lopsided dot).
 */
export function pipLayout(size: number) {
  const pip = Math.max(2, Math.round((size * 0.15) / 2) * 2)
  const margin = Math.round(size * 0.2)
  const at = [margin, Math.round((size - pip) / 2), size - margin - pip]
  return { pip, at }
}

/** The number's size on a face with no pips (Die.tsx's centred number). */
export const numberPx = (size: number) => Math.round(size * 0.62)
