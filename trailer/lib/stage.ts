// The battle stage seen through the trailer's camera: the area picture under the stage (as BattleStage lays it), the
// timeline's 240×160 canvas on top, both scaled with square pixels around a point of the stage.
import { ART_CROP, ART_K, ART_PX, artUrl, battleWindow, loadArt } from '@/fx/areaArt'
import { ART_GEOMETRY } from '@/fx/areaArtMap'
import { H, W } from '@/fx/timeline'
import type { Canvas } from '@/fx/pixel'

export interface Picture {
  img: HTMLImageElement
  /** Where the 240×160 battle window starts in the picture's scene (scene pixels). */
  x: number
  y: number
}

const pictures = new Map<string, Picture>()

/** Load an area picture (public/area-art/<id>.png) and where its battle window sits. */
export async function loadPicture(id: string): Promise<Picture | null> {
  const hit = pictures.get(id)
  if (hit) return hit
  const img = await loadArt(artUrl(id))
  const geo = ART_GEOMETRY[id]
  if (!img || !geo) return null
  const win = battleWindow(geo)
  const p = { img, x: win.x, y: win.y }
  pictures.set(id, p)
  return p
}
export const picture = (id: string) => pictures.get(id) ?? null

/** Camera: the stage point at the centre of the view (stage pixels) and the zoom (screen pixels per stage pixel). */
export interface Cam {
  x: number
  y: number
  z: number
}
export const FULL: Cam = { x: W / 2, y: H / 2, z: 8 }

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export const SCREEN: Box = { x: 0, y: 0, w: 1920, h: 1080 }

// ---------------------------------------------------------------- sharp scaling
// Nearest-neighbour at a fractional scale makes pixels alternate between two widths (5, 6, 5, 6 px…), which reads as
// wobbly art. Sharp scaling avoids it: blow the image up by the whole part of the scale with nearest-neighbour, then
// smooth only the last fraction, so each art pixel keeps one size with at most a one-pixel soft edge.
const upscaled = new WeakMap<CanvasImageSource, Map<number, HTMLCanvasElement>>()
const scratch = new Map<string, HTMLCanvasElement>()

function wholeScale(src: HTMLCanvasElement | HTMLImageElement, n: number, cache: boolean) {
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height
  let c: HTMLCanvasElement | undefined
  if (cache) {
    let m = upscaled.get(src)
    if (!m) upscaled.set(src, (m = new Map()))
    c = m.get(n)
    if (c) return c
    c = document.createElement('canvas')
    m.set(n, c)
  } else {
    const key = `${w * n}x${h * n}`
    c = scratch.get(key)
    if (!c) scratch.set(key, (c = document.createElement('canvas')))
  }
  c.width = w * n
  c.height = h * n
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  g.clearRect(0, 0, c.width, c.height)
  g.drawImage(src, 0, 0, w * n, h * n)
  return c
}

/**
 * Draw pixel art at any size and keep its pixels even: nearest-neighbour at a whole scale, sharp scaling otherwise.
 * `still` caches the blown-up copy (a picture that never changes).
 */
export function sharpDraw(
  g: CanvasRenderingContext2D,
  src: HTMLCanvasElement | HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  still = false,
) {
  const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.width
  const k = w / sw
  g.save()
  if (Math.abs(k - Math.round(k)) < 0.004 || k < 1) {
    g.imageSmoothingEnabled = false
    g.drawImage(src, Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  } else {
    const big = wholeScale(src, Math.floor(k), still)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(big, x, y, w, h)
  }
  g.restore()
}

/**
 * Draw a stage: its picture (or a plain ground), then each canvas layer (a timeline's), through the camera, clipped
 * to the box. `shake` moves the whole view by screen pixels.
 */
export function drawStage(
  g: CanvasRenderingContext2D,
  pic: Picture | null,
  layers: (Canvas | HTMLCanvasElement | null)[],
  cam: Cam,
  box: Box = SCREEN,
  { ground = '#24304f', shake = { x: 0, y: 0 } }: { ground?: string; shake?: { x: number; y: number } } = {},
) {
  g.save()
  g.beginPath()
  g.rect(box.x, box.y, box.w, box.h)
  g.clip()
  g.fillStyle = ground
  g.fillRect(box.x, box.y, box.w, box.h)
  // Whole screen pixels for the stage's origin, so the art pixels stay a constant size.
  const ox = Math.round(box.x + box.w / 2 - cam.x * cam.z + shake.x)
  const oy = Math.round(box.y + box.h / 2 - cam.y * cam.z + shake.y)
  if (pic) {
    // The picture has its own 400 px resolution (1.39 picture pixels per art pixel): drawn at the nearest whole number
    // of screen pixels per picture pixel, scaled about the camera's centre, so it stays crisp. It is a backdrop: a few
    // per cent larger or smaller than the stage on top of it changes nothing anyone sees.
    const k = Math.max(1, Math.round(cam.z / ART_K))
    const f = (k * ART_K) / cam.z
    const cx = box.x + box.w / 2 + shake.x
    const cy = box.y + box.h / 2 + shake.y
    const px0 = cx + (-pic.x - cam.x) * cam.z * f
    const py0 = cy + (-(pic.y + ART_CROP / ART_K) - cam.y) * cam.z * f
    g.imageSmoothingEnabled = false
    g.drawImage(pic.img, Math.round(px0), Math.round(py0), ART_PX * k, pic.img.naturalHeight * k)
  }
  for (const l of layers) if (l) sharpDraw(g, l, ox, oy, l.width * cam.z, l.height * cam.z)
  g.restore()
}

/** Ease between two cameras. */
export const camLerp = (a: Cam, b: Cam, p: number): Cam => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  z: a.z + (b.z - a.z) * p,
})

/** Keep a camera's view inside the picture (it has nothing to show past its edges). */
export function clampCam(cam: Cam, pic: Picture | null, box: Box = SCREEN): Cam {
  const hw = box.w / 2 / cam.z
  const hh = box.h / 2 / cam.z
  const x0 = pic ? -pic.x : 0
  const x1 = pic ? ART_PX / ART_K - pic.x : W
  const y0 = pic ? -(pic.y + ART_CROP / ART_K) : 0
  const y1 = pic ? y0 + pic.img.naturalHeight / ART_K : H
  const cx = x1 - x0 < 2 * hw ? (x0 + x1) / 2 : Math.max(x0 + hw, Math.min(x1 - hw, cam.x))
  const cy = y1 - y0 < 2 * hh ? (y0 + y1) / 2 : Math.max(y0 + hh, Math.min(y1 - hh, cam.y))
  return { x: cx, y: cy, z: cam.z }
}
