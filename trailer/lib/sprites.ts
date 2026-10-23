// Pokémon for the trailer: the game's canvas sprites (fx/sprites), and their animation. In the game the animated GIF
// plays as an <img> over the stage and the canvas draws its first frame; here every frame is the canvas, so the GIF's
// frames are decoded once and swapped in under the same key, frame by frame, on the trailer's clock.
import { loadSprite, putSprite, spriteKey, stageSprite } from '@/fx/sprites'
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

/** Load a Pokémon's view for the canvas, with its animation when Showdown draws one. Resolves to its key. */
export async function loadMon(dex: number, back = false, shiny = false): Promise<string> {
  const key = await loadSprite(dex, back, shiny)
  if (anims.has(key)) return key
  const s = stageSprite(dex, back, shiny)
  if (!/gen5ani/.test(s.url)) return key
  try {
    const data = await (await fetch(s.url)).arrayBuffer()
    const dec = new ImageDecoder({ data, type: 'image/gif' })
    await dec.tracks.ready
    const n = dec.tracks.selectedTrack?.frameCount ?? 1
    const frames: Canvas[] = []
    const starts: number[] = []
    let t = 0
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i })
      // The same crop and scale as the game's still (fx/sprites `crop`).
      const y0 = s.h - s.below - s.artH
      const c = canvas(Math.max(1, Math.round(s.artW * s.k)), Math.max(1, Math.round(s.artH * s.k)))
      c.g.drawImage(image, s.artX, y0, s.artW, s.artH, 0, 0, c.width, c.height)
      frames.push(c)
      starts.push(t)
      t += Math.max(0.02, (image.duration ?? 100_000) / 1e6)
      image.close()
    }
    dec.close()
    anims.set(key, { frames, starts, total: t })
  } catch {
    // No animation: the still stays.
  }
  return key
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
