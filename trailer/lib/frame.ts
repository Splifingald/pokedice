// The frame a cut is drawn in. Landscape (1920×1080: the trailer, the social cut) lays the dice, the plates and the
// readouts over the stage; portrait (1080×1920: the vertical cut for TikTok, Shorts and Reels) stacks them — a header,
// the whole stage, the game's line, the dice on their own band, the REROLL button — and keeps clear of what those apps
// draw over a video: their tabs at the top, their caption at the bottom, their buttons down the right.
import { canvas } from '@/fx/pixel'
import { pokeballBackdrop } from './backdrop'
import { GOLD, INK, OH, OW, rect, setCanvasSize, text, type G } from './draw'
import type { Box, Cam } from './stage'

interface Point {
  x: number
  y: number
}

export interface Frame {
  portrait: boolean
  w: number
  h: number
  /** Where the battle stage shows, and its camera: the fights' one shot, every fight and a legend's entrance alike. */
  stage: Box
  cam: Cam
  /** The ink freeze's camera, on the hit. */
  inkCam: Cam
  /** Top left of the dice canvas (480×270 at ×4) on the screen. */
  tray: Point
  /** The top of the dark band behind the dice over the stage (none when they have their own band). */
  shade: number | null
  /** How close the big roll pushes in (a whole ×4·zoom keeps the dice crisp), and where it slides the row to. */
  zoom: number
  zoomTo: Point
  caption: Point
  foe: Point
  own: Point
  /** FIVE OF A KIND!: its lines, their size, the first line's centre and the step between lines. */
  banner: { lines: string[]; size: number; x: number; y: number; step: number }
  damage: Point
  damageSmall: Point
  button: Box
  /** The celebration's centre: the dice row. */
  burst: Point
  /** The combo chip (PAIR) and the badge won from a trainer. */
  combo: Point
  badge: Point
  /** Where the 2×2 grids of the montage go, and the zoom of a boss's stage in a tile. */
  grid: Box
  gridZoom: number
  /** A feature's word: its baseline's left end and size. */
  word: { x: number; y: number; size: number }
}

export const LANDSCAPE: Frame = {
  portrait: false,
  w: 1920,
  h: 1080,
  stage: { x: 0, y: 0, w: 1920, h: 1080 },
  cam: { x: 120, y: 90, z: 8 },
  inkCam: { x: 140, y: 88, z: 10 },
  tray: { x: 0, y: 0 },
  shade: 640,
  zoom: 1.5,
  zoomTo: { x: 960, y: 640 },
  caption: { x: 960, y: 64 },
  foe: { x: 48, y: 48 },
  own: { x: 1920 - 48 - 560, y: 1080 - 48 - 150 },
  banner: { lines: ['FIVE OF A KIND!'], size: 190, x: 960, y: 330, step: 0 },
  damage: { x: 960, y: 640 },
  damageSmall: { x: 960, y: 700 },
  button: { x: 1450, y: 880, w: 380, h: 100 },
  burst: { x: 960, y: 900 },
  combo: { x: 960, y: 560 },
  badge: { x: 1920 - 200, y: 230 },
  grid: { x: 0, y: 0, w: 1920, h: 1080 },
  gridZoom: 4,
  word: { x: 96, y: 1000, size: 150 },
}

// The stage at ×5 is 1200 px wide: 12 stage pixels of each side fall outside the 1080 px, nothing that matters.
const STAGE_Y = 330
export const PORTRAIT: Frame = {
  portrait: true,
  w: 1080,
  h: 1920,
  stage: { x: 0, y: STAGE_Y, w: 1080, h: 800 },
  cam: { x: 120, y: 80, z: 5 },
  inkCam: { x: 120, y: 80, z: 5 },
  // The row's baseline (tray y 228) at 1430, its middle at 540: 760 px wide, clear of the apps' buttons on the right.
  tray: { x: 540 - 960, y: 1430 - 912 },
  shade: null,
  zoom: 1.25,
  zoomTo: { x: 540, y: 1250 },
  caption: { x: 540, y: STAGE_Y + 800 + 30 },
  foe: { x: 36, y: STAGE_Y + 30 },
  own: { x: 1080 - 36 - 560, y: STAGE_Y + 800 - 30 - 150 },
  banner: { lines: ['FIVE OF', 'A KIND!'], size: 180, x: 540, y: STAGE_Y + 250, step: 170 },
  damage: { x: 540, y: STAGE_Y + 600 },
  damageSmall: { x: 540, y: STAGE_Y + 420 },
  button: { x: 540 - 190, y: 1485, w: 380, h: 100 },
  burst: { x: 540, y: 1430 },
  combo: { x: 540, y: 1210 },
  badge: { x: 880, y: STAGE_Y + 200 },
  // Square tiles of 540: a stage at ×3 shows 180×180 of it.
  grid: { x: 0, y: STAGE_Y, w: 1080, h: 1080 },
  gridZoom: 3,
  word: { x: 60, y: 1520, size: 120 },
}

/** The frame in use: landscape unless a page sets another before drawing. */
export const F: Frame = { ...LANDSCAPE }

export function setFrame(f: Frame) {
  Object.assign(F, f)
  setCanvasSize(f.w, f.h)
}

let ground: ReturnType<typeof canvas> | null = null

/**
 * What lies around the stage in portrait: the title's navy with its drifting Poké Balls (at ×3, like the title), the
 * POKÉDICE name above the stage, and the stage's ink edge. Nothing in landscape, where the stage fills the frame.
 */
export function surround(g: G, t: number) {
  if (!F.portrait) return
  ground ??= canvas(OW / 3, OH / 3)
  pokeballBackdrop(ground.g, ground.width, ground.height, t)
  g.imageSmoothingEnabled = false
  g.drawImage(ground, 0, 0, OW, OH)
  text(g, 'POKÉDICE', OW / 2, F.stage.y - 64, { size: 104, align: 'center', ow: 9, drop: 9, spacing: 6 })
  text(g, 'ROLL · BATTLE · CATCH', OW / 2, F.stage.y - 18, {
    size: 34,
    font: 'Jersey 15',
    color: GOLD,
    align: 'center',
    ow: 4,
    spacing: 6,
  })
}

/** Where a stage point (stage pixels) lands on the screen, through a camera centred in a box. */
export const toScreen = (cam: Cam, box: Box, x: number, y: number) => ({
  x: box.x + box.w / 2 + (x - cam.x) * cam.z,
  y: box.y + box.h / 2 + (y - cam.y) * cam.z,
})

/** The stage's ink edge (portrait), drawn over the stage. */
export function stageEdge(g: G) {
  if (!F.portrait) return
  const { x, y, w, h } = F.stage
  rect(g, x, y - 8, w, 8, INK)
  rect(g, x, y + h, w, 8, INK)
}
