// The area pictures (public/area-art/<id>.png): one 400 px picture per scene, generated with Gemini and shrunk to
// true pixel art by unpixel. One picture, three uses, as the Visual Lab's Backgrounds tab composed them: Home shows
// the whole scene, lists show strips cut around its horizon, and the battle shows its middle 240 × 160 with the two
// zones drawn on top. Geometry is measured in the Home scene's 288 × 276 art pixels; on screen the picture keeps its
// own 400 px resolution (nearest-neighbour), so thin lines survive. Areas without a picture keep their painted scene,
// which is also what shows while a picture loads.
import { clamp } from './pixel'
import { AREA_ART, ART_GEOMETRY } from './areaArtMap'

/** The Home scene, in art pixels (src/screens/home/scene.ts). */
export const SCENE_W = 288
export const SCENE_H = 276
/** The pictures' width, in their own pixels. */
export const ART_PX = 400
/** Scene art pixels → picture pixels. */
export const ART_K = ART_PX / SCENE_W
/** A square picture is cropped to the scene's 288:276 shape, centred: the picture rows above the scene's top. */
export const ART_CROP = (ART_PX - SCENE_H * ART_K) / 2
/** The battle stage cut from a picture: 240 × 160 scene pixels, centred across, with the horizon halfway down. */
export const BATTLE_W = 240
export const BATTLE_H = 160

export interface ArtGeometry {
  /** Where the land starts (indoors, the foot of the back wall); null where the picture has no clear one. */
  horizon: number | null
  /** Where the team may stand on Home: x0, y0, x1, y1. */
  walk: readonly [number, number, number, number]
  /** Water the swimmers keep to, where the picture clearly has some. */
  pond?: { x: number; y: number; rx: number; ry: number }
}

export interface AreaPicture extends ArtGeometry {
  id: string
  url: string
}

export const artUrl = (id: string) => `/area-art/${id}.png`

/** The professor's lab, the stage of picking a partner (240 × 160, drawn 400 px wide). */
export const LAB_ART = artUrl('moment-lab')

/** The Day Care's yard (docs/15). It isn't an area, so it has no line in AREA_ART; its picture is measured like theirs. */
export function dayCarePicture(): AreaPicture | null {
  const g = ART_GEOMETRY.daycare
  return g ? { id: 'daycare', url: artUrl('daycare'), ...g } : null
}

/** An area's picture, or null: not mapped, or its picture isn't made yet. */
export function pictureOf(areaId: string | null | undefined): AreaPicture | null {
  const id = areaId ? AREA_ART[areaId] : undefined
  const g = id ? ART_GEOMETRY[id] : undefined
  return id && g ? { id, url: artUrl(id), ...g } : null
}

/** The line lists and the battle centre on: the horizon, or the middle when a picture has none. */
export const horizonOf = (p: ArtGeometry) => p.horizon ?? SCENE_H / 2

/** A list strip h tall, centred on the horizon (scene pixels). */
export const stripTop = (horizon: number, h: number) => clamp(Math.round(horizon - h * 0.55), 0, SCENE_H - h)

/** The battle window's top: the horizon halfway down it, or the bottom of the picture when it has no horizon. */
export const battleTop = (p: ArtGeometry) =>
  p.horizon == null ? SCENE_H - BATTLE_H : clamp(Math.round(p.horizon - BATTLE_H / 2), 0, SCENE_H - BATTLE_H)

/**
 * Where to put the picture (as an <img>) so a window of the scene fills a box: left, top, width and height as
 * percentages of the box. The window is in scene pixels; the picture is cropped by its box, never resampled.
 */
export function artPlacement(win: { x: number; y: number; w: number; h: number }) {
  const w = win.w * ART_K
  const h = win.h * ART_K
  return {
    left: `${(-(win.x * ART_K) / w) * 100}%`,
    top: `${(-(ART_CROP + win.y * ART_K) / h) * 100}%`,
    width: `${(ART_PX / w) * 100}%`,
    height: `${(ART_PX / h) * 100}%`,
  }
}

/** The whole Home scene. */
export const homeWindow = () => ({ x: 0, y: 0, w: SCENE_W, h: SCENE_H })
/** The battle's 240 × 160. */
export const battleWindow = (p: ArtGeometry) => ({
  x: (SCENE_W - BATTLE_W) / 2,
  y: battleTop(p),
  w: BATTLE_W,
  h: BATTLE_H,
})

// ---------------------------------------------------------------- loading
const images = new Map<string, Promise<HTMLImageElement | null>>()

/** A picture, loaded once and kept (null if it can't load: offline, a missing file). */
export function loadArt(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const im = new Image()
      im.decoding = 'async'
      im.onload = () => resolve(im)
      im.onerror = () => {
        // Let a later visit try again.
        images.delete(url)
        resolve(null)
      }
      im.src = url
    })
    images.set(url, p)
  }
  return p
}

const strips = new Map<string, string>()

/** A strip already cut, if any. */
export const cachedStrip = (p: AreaPicture, h: number) => strips.get(`${p.id}|${h}`) ?? null

/**
 * A list strip cut from the picture around its horizon, at the picture's own resolution, as an image URL; null if the
 * picture can't load. Its shape is the painted strip's (288 × h), within a pixel.
 */
export async function artStrip(p: AreaPicture, h: number): Promise<string | null> {
  const key = `${p.id}|${h}`
  const hit = strips.get(key)
  if (hit) return hit
  const im = await loadArt(p.url)
  if (!im) return null
  const sh = Math.round(h * ART_K)
  const sy = clamp(Math.round(ART_CROP + stripTop(horizonOf(p), h) * ART_K), 0, im.naturalHeight - sh)
  const c = document.createElement('canvas')
  c.width = im.naturalWidth
  c.height = sh
  const g = c.getContext('2d')
  if (!g) return null
  g.imageSmoothingEnabled = false
  g.drawImage(im, 0, sy, im.naturalWidth, sh, 0, 0, im.naturalWidth, sh)
  const url = c.toDataURL()
  strips.set(key, url)
  return url
}
