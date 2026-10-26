// The sky's geometry (docs/43 §5.3), apart from its painting so it can be tested without a canvas.
import { BATTLE_H, BATTLE_W, battleTop, SCENE_W, type ArtGeometry } from '@/fx/areaArt'

/** Art pixels of sky drawn above the grid: a 430 × 932 phone needs ~170, a 1440 × 900 window ~35. */
export const SKY_H = 200

/** The picture's window behind the sky and the grid together, in Home scene pixels: the grid's own, grown upward. */
export const skyWindow = (p: ArtGeometry) => ({
  x: (SCENE_W - BATTLE_W) / 2,
  y: battleTop(p) - SKY_H,
  w: BATTLE_W,
  h: SKY_H + BATTLE_H,
})
