// Pokémon on a pixel stage (Home's scene, the battle stage): where a sprite's art sits, standing on a feet line, one
// sprite pixel to one art pixel. The picture is the same Showdown sprite every other screen loads (one cached request,
// docs/13-SHOWDOWN-SPRITES.md); the local sprite when Showdown has no such view.
import {
  SHOWDOWN_SCALE,
  showdownView,
  SPRITE_CANVAS,
  SPRITE_METRICS,
  spriteUrlFor,
} from '@/components/SpriteImg'
import itemSheet from '@/assets/item-icons.png'
import itemAtlas from '@/data/item-atlas.json'
import { artBox } from '@/lib/showdown'
import { cached, canvas, clamp, type Canvas, type G } from './pixel'

/** The tallest or widest a Pokémon may stand on a stage (art pixels); bigger art is shrunk. */
export const MAX_ART = 80

export interface StageSprite {
  url: string
  /** Its fallback when the first can't be loaded (offline): the local sprite. */
  fallback: string | null
  /** The image's own size, drawn at `k` art pixels per image pixel. */
  w: number
  h: number
  k: number
  /** The art inside the image (image pixels): its left edge and width, and how many rows lie under its feet. */
  artX: number
  artW: number
  artH: number
  below: number
}

/** A Pokémon's sprite for a stage: the front (a foe, Home) or the back (yours in battle). */
export function stageSprite(dex: number, back: boolean, shiny: boolean): StageSprite {
  const local = spriteUrlFor(dex, back ? 'back' : 'front', shiny)
  const sd = showdownView(dex, back, shiny)
  if (sd) {
    const [x0, y0, x1, y1] = artBox(sd.box)
    const artW = x1 - x0 + 1
    const artH = y1 - y0 + 1
    const k = Math.min(SHOWDOWN_SCALE, MAX_ART / Math.max(artW, artH))
    return {
      url: sd.url,
      fallback: local,
      w: sd.box[0],
      h: sd.box[1],
      k,
      artX: x0,
      artW,
      artH,
      below: sd.box[1] - 1 - y1,
    }
  }
  const m = SPRITE_METRICS[dex]
  const size = m?.size ?? SPRITE_CANVAS
  const box = (back ? m?.backBox : m?.frontBox) ?? [0, 0, size - 1, size - 1]
  const below = m?.[back ? 'back' : 'front'] ?? 0
  const artW = box[2] - box[0] + 1
  const artH = size - below - box[1]
  return {
    url: local,
    fallback: null,
    w: size,
    h: size,
    k: Math.min(1, MAX_ART / Math.max(artW, artH)),
    artX: box[0],
    artW,
    artH,
    below,
  }
}

/** Where to put the image (art pixels) so its art is centred on x and stands on the line y. */
export function placeSprite(s: StageSprite, x: number, y: number) {
  const w = s.w * s.k
  const h = s.h * s.k
  return { left: x - (s.artX + s.artW / 2) * s.k, top: y - h + s.below * s.k, w, h }
}

// ---------------------------------------------------------------------------------------------------------------------
// Sprites drawn on a canvas, for timelines (a hit's white frames, a silhouette, a capture beam).
//
// The animated sprite lives in the page as an <img> (the browser plays the GIF); while an effect needs to draw the
// Pokémon itself, the canvas draws a still copy: the image's first frame, cropped to its art and scaled like the
// stage's. Same URL, so no second download. The canvas never reads pixels back, so Showdown's missing CORS headers
// don't matter (docs/13-SHOWDOWN-SPRITES.md).

const frames = new Map<string, Canvas>()
const loading = new Map<string, Promise<string>>()

/** A sprite's key on the canvas: species, view and shininess. */
export const spriteKey = (dex: number, back: boolean, shiny = false) =>
  `${dex}${back ? 'b' : 'f'}${shiny ? 's' : ''}`

function crop(img: HTMLImageElement, s: StageSprite, fromFallback: boolean): Canvas {
  // The fallback is the local 64px sprite, whose box is in its own metrics: use its whole image, scaled.
  if (fromFallback) {
    const c = canvas(
      Math.round(img.naturalWidth * Math.min(1, s.k)),
      Math.round(img.naturalHeight * Math.min(1, s.k)),
    )
    c.g.drawImage(img, 0, 0, c.width, c.height)
    return c
  }
  const y0 = s.h - s.below - s.artH
  const c = canvas(Math.max(1, Math.round(s.artW * s.k)), Math.max(1, Math.round(s.artH * s.k)))
  c.g.drawImage(img, s.artX, y0, s.artW, s.artH, 0, 0, c.width, c.height)
  return c
}

/** Load one view of a Pokémon for the canvas; resolves to its key (also when it fails: it then draws nothing). */
export function loadSprite(dex: number, back: boolean, shiny = false): Promise<string> {
  const key = spriteKey(dex, back, shiny)
  if (frames.has(key)) return Promise.resolve(key)
  let p = loading.get(key)
  if (p) return p
  const s = stageSprite(dex, back, shiny)
  p = new Promise<string>((res) => {
    const img = new Image()
    let fallback = false
    img.onload = () => {
      frames.set(key, crop(img, s, fallback))
      res(key)
    }
    img.onerror = () => {
      if (!fallback && s.fallback) {
        fallback = true
        img.src = s.fallback
      } else res(key)
    }
    img.src = s.url
  })
  loading.set(key, p)
  return p
}

/** Register a ready-made frame under a key (forms drawn in code, tests). */
export const putSprite = (key: string, frame: Canvas) => void frames.set(key, frame)

/** A loaded sprite's own canvas (undefined until it has loaded), to draw at any scale. */
export const spriteFrame = (key: string): Canvas | undefined => frames.get(key)

/** The drawn size of a sprite (its art box); 48×48 until it has loaded. */
export function spriteSize(key: string): { w: number; h: number } {
  const f = frames.get(key)
  return f ? { w: f.width, h: f.height } : { w: 48, h: 48 }
}

/** The sprite's shape filled with one colour. */
export function silhouette(key: string, color: string): Canvas | null {
  const src = frames.get(key)
  if (!src) return null
  return cached(`sil|${key}|${color}|${src.width}x${src.height}`, () => {
    const c = canvas(src.width, src.height)
    c.g.drawImage(src, 0, 0)
    c.g.globalCompositeOperation = 'source-in'
    c.g.fillStyle = color
    c.g.fillRect(0, 0, c.width, c.height)
    return c
  })
}

export interface SpriteLook {
  /** Scale (squash, stretch, shrinking into a ball). */
  sx?: number
  sy?: number
  alpha?: number
  /** 0..1 white silhouette on top (a hit). */
  flash?: number
  /** A colour silhouette on top (status glow, capture beam). */
  tint?: { color: string; a: number } | null
  /** Draw the silhouette only, in this colour. */
  sil?: string
  /** A 1-px outline around the shape (auras). */
  outline?: string
  /** Per-row horizontal offsets (psychic warping). */
  wave?: { amp: number; len?: number; phase?: number }
  /** Coloured copies behind (chromatic split, afterimages). */
  ghost?: { dx?: number; dy?: number; color: string; a?: number }[]
  /** Mirrored (front sprites look left). */
  flip?: boolean
  dx?: number
  dy?: number
}

const scratch = canvas(160, 160)

/** Draw a Pokémon with its feet at (x, y), centred on x. */
export function drawSprite(g: G, key: string, x: number, y: number, o: SpriteLook = {}) {
  const frame = frames.get(key)
  if (!frame) return
  const fw = frame.width
  const fh = frame.height
  const sx = o.sx ?? 1
  const sy = o.sy ?? 1
  const w = Math.max(1, Math.round(fw * sx))
  const h = Math.max(1, Math.round(fh * sy))
  const dx = Math.round(x - w / 2)
  const dy = Math.round(y - h)
  if (scratch.width < fw + 2 || scratch.height < fh + 2) {
    scratch.width = Math.max(scratch.width, fw + 2)
    scratch.height = Math.max(scratch.height, fh + 2)
    scratch.g.imageSmoothingEnabled = false
  }
  const s = scratch.g
  s.clearRect(0, 0, fw + 2, fh + 2)
  if (o.outline)
    for (const [ox, oy] of [
      [0, 1],
      [2, 1],
      [1, 0],
      [1, 2],
    ] as const)
      s.drawImage(silhouette(key, o.outline)!, ox, oy)
  if (o.sil) s.drawImage(silhouette(key, o.sil)!, 1, 1)
  else s.drawImage(frame, 1, 1)
  if (o.tint && o.tint.a > 0) {
    s.globalAlpha = clamp(o.tint.a)
    s.drawImage(silhouette(key, o.tint.color)!, 1, 1)
    s.globalAlpha = 1
  }
  if (o.flash && o.flash > 0) {
    s.globalAlpha = clamp(o.flash)
    s.drawImage(silhouette(key, '#ffffff')!, 1, 1)
    s.globalAlpha = 1
  }
  const prevA = g.globalAlpha
  if (o.ghost)
    for (const gh of o.ghost) {
      g.globalAlpha = prevA * (gh.a ?? 0.5)
      g.drawImage(silhouette(key, gh.color)!, dx + Math.round(gh.dx || 0), dy + Math.round(gh.dy || 0), w, h)
    }
  g.globalAlpha = prevA * (o.alpha ?? 1)
  if (o.wave && o.wave.amp) {
    const { amp, len = 12, phase = 0 } = o.wave
    for (let r = 0; r < fh + 2; r++) {
      const off = Math.round(Math.sin(((r + phase) / len) * Math.PI * 2) * amp)
      g.drawImage(
        scratch,
        0,
        r,
        fw + 2,
        1,
        dx - 1 + off,
        dy - 1 + Math.round(r * sy),
        Math.round((fw + 2) * sx),
        Math.max(1, Math.round(sy)),
      )
    }
  } else if (o.flip) {
    g.save()
    g.translate(dx - Math.round(sx) + Math.round((fw + 2) * sx), 0)
    g.scale(-1, 1)
    g.drawImage(
      scratch,
      0,
      0,
      fw + 2,
      fh + 2,
      0,
      dy - Math.round(sy),
      Math.round((fw + 2) * sx),
      Math.round((fh + 2) * sy),
    )
    g.restore()
  } else
    g.drawImage(
      scratch,
      0,
      0,
      fw + 2,
      fh + 2,
      dx - Math.round(sx),
      dy - Math.round(sy),
      Math.round((fw + 2) * sx),
      Math.round((fh + 2) * sy),
    )
  g.globalAlpha = prevA
}

// ---------------------------------------------------------------------------------------------------------------------
// Items on a canvas (an evolution stone floating down): cut from the item atlas when it has the picture.

let sheetImg: Promise<HTMLImageElement | null> | null = null
const loadSheet = () =>
  (sheetImg ??= new Promise((res) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = itemSheet
  }))

/** Load an item picture (its `spriteUrl`) as a canvas sprite; resolves to its key. */
export async function loadItemSprite(url: string): Promise<string> {
  const key = `item|${url}`
  if (frames.has(key)) return key
  const n = (itemAtlas.index as Record<string, number | undefined>)[url]
  const img: HTMLImageElement | null =
    n != null
      ? await loadSheet()
      : await new Promise((res) => {
          const im = new Image()
          im.onload = () => res(im)
          im.onerror = () => res(null)
          im.src = url
        })
  if (!img) return key
  const cell = itemAtlas.cell
  const c = canvas(n != null ? cell : img.naturalWidth, n != null ? cell : img.naturalHeight)
  if (n != null)
    c.g.drawImage(
      img,
      (n % itemAtlas.cols) * cell,
      Math.floor(n / itemAtlas.cols) * cell,
      cell,
      cell,
      0,
      0,
      cell,
      cell,
    )
  else c.g.drawImage(img, 0, 0)
  frames.set(key, c)
  return key
}
