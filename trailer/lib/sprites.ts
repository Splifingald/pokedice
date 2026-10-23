// Pokémon for the trailer: the game's canvas sprites (fx/sprites), and their animation. In the game the animated GIF
// plays as an <img> over the stage and the canvas draws its first frame; here every frame is the canvas, so the GIF's
// frames are decoded once and swapped in under the same key, frame by frame, on the trailer's clock.
import { loadSprite, putSprite, spriteKey, stageSprite, type StageSprite } from '@/fx/sprites'
import { canvas, type Canvas } from '@/fx/pixel'

// Chromium has ImageDecoder; TypeScript's DOM types don't yet.
interface DecodedFrame {
  image: CanvasImageSource & { duration: number | null; close(): void }
}
interface Decoder {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }
  decode(o: { frameIndex: number }): Promise<DecodedFrame>
  close(): void
}
declare const ImageDecoder: new (o: { data: ArrayBuffer; type: string }) => Decoder

interface Anim {
  frames: Canvas[]
  /** Each frame's start, seconds. */
  starts: number[]
  total: number
}
const anims = new Map<string, Anim>()

/**
 * Cut a frame to its art the way the game does (fx/sprites `crop`), but shrink big Pokémon smoothly: the game's
 * nearest-neighbour shrink (to at most 80 art pixels) drops whole rows and columns. Smoothed, then its edge made hard
 * again, the shape keeps every line.
 */
function cut(image: CanvasImageSource, s: StageSprite, k: number): Canvas {
  const y0 = s.h - s.below - s.artH
  const c = canvas(Math.max(1, Math.round(s.artW * k)), Math.max(1, Math.round(s.artH * k)))
  if (k < 1) {
    c.g.imageSmoothingEnabled = true
    c.g.imageSmoothingQuality = 'high'
  }
  c.g.drawImage(image, s.artX, y0, s.artW, s.artH, 0, 0, c.width, c.height)
  if (k < 1) {
    const d = c.g.getImageData(0, 0, c.width, c.height)
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i]! >= 110 ? 255 : 0
    c.g.putImageData(d, 0, 0)
  }
  return c
}

const natives = new Map<string, Anim>()

/**
 * The hero's line, seen from behind, at its own size: the game shrinks Charizard to 80 art pixels; the trailer keeps
 * every one whole (one sprite pixel, one art pixel), so Charmander, Charmeleon and Charizard grow as they should.
 */
const HEROES = new Set([4, 5, 6, 10034])

/** Load a Pokémon's view for the canvas, with its animation when Showdown draws one. Resolves to its key. */
export async function loadMon(dex: number, back = false, shiny = false): Promise<string> {
  const key = await loadSprite(dex, back, shiny)
  if (anims.has(key)) return key
  const s = stageSprite(dex, back, shiny)
  // Only Showdown's sprites (the local fallbacks are already small and still).
  if (!/pokemonshowdown/.test(s.url)) return key
  try {
    const data = await (await fetch(s.url)).arrayBuffer()
    const animated = /gen5ani/.test(s.url)
    const dec = new ImageDecoder({ data, type: animated ? 'image/gif' : 'image/png' })
    await dec.tracks.ready
    const n = dec.tracks.selectedTrack?.frameCount ?? 1
    const frames: Canvas[] = []
    const full: Canvas[] = []
    const starts: number[] = []
    let t = 0
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i })
      frames.push(cut(image, s, back && HEROES.has(dex) ? 1 : s.k))
      full.push(cut(image, s, 1))
      starts.push(t)
      t += Math.max(0.02, (image.duration ?? 100_000) / 1e6)
      image.close()
    }
    dec.close()
    anims.set(key, { frames, starts, total: t })
    natives.set(key, { frames: full, starts, total: t })
    putSprite(key, frames[0]!)
  } catch {
    // Not decodable: the game's own still stays.
  }
  return key
}

/** A Pokémon's frame at its own size (no shrink), for scenes that have room for it (the raid openings). */
export function nativeFrameOf(key: string, t: number): Canvas | null {
  const a = natives.get(key)
  if (!a) return null
  const local = ((t % a.total) + a.total) % a.total
  let f = 0
  while (f + 1 < a.starts.length && a.starts[f + 1]! <= local) f++
  return a.frames[f]!
}

export const mon = (dex: number, back = false, shiny = false) => spriteKey(dex, back, shiny)

/**
 * Put every animated Pokémon on its frame at time t. `still` keys keep their first frame (an effect that outlines the
 * shape, whose silhouette the game caches from one frame).
 */
export function animateAll(t: number, still: ReadonlySet<string> = new Set()) {
  for (const [key, a] of anims) {
    let f = 0
    if (!still.has(key)) {
      const local = ((t % a.total) + a.total) % a.total
      while (f + 1 < a.starts.length && a.starts[f + 1]! <= local) f++
    }
    putSprite(key, a.frames[f]!)
  }
}

/** A sprite's current frame (for drawing a Pokémon outside a timeline, at any size). */
export function frameOf(key: string, t: number): Canvas | null {
  const a = anims.get(key)
  if (!a) return null
  const local = ((t % a.total) + a.total) % a.total
  let f = 0
  while (f + 1 < a.starts.length && a.starts[f + 1]! <= local) f++
  return a.frames[f]!
}
