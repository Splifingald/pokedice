// The sky over the battle's grid (docs/43 §5.3). A tall phone had ~200 px of nothing between the 3:2 stage and the
// dice; the stage now grows upward instead: the fight's 240 × 160 grid stays exactly as drawn (every timeline, plate
// and sprite keeps its place), anchored to the panel under it, and this layer shows what lies above it — the area
// picture's own rows (the pictures are taller than the band the battle cuts), then the picture's sky colour; the
// code-drawn Daybreak background, the night and the Distortion World paint their own. Never under the grid: your
// Pokémon stands on the grid's bottom edge, cut by the panel as in the main games, so ground below would cut it in
// mid-field.
import { useEffect, useRef, useState } from 'react'
import { AreaArt } from '@/components/AreaArt'
import { artPlacement, BATTLE_H, BATTLE_W, loadArt, type AreaPicture } from '@/fx/areaArt'
import { bayer, cached, clamp, ellipse, mix, rng, shade, type Canvas } from '@/fx/pixel'
import { DAYBREAK } from '@/fx/scenes'
import { NM } from '@/fx/timelines/nightmare'
import { voidBackdrop } from '@/fx/timelines/portal'
import { SKY_H, skyWindow } from './skyWindow'

const W = BATTLE_W
const H = BATTLE_H
const INK = '#24304f'

/** Deeper towards the top, in ordered dither: a sky (or a cave's ceiling) that goes on, not a band of paint. */
const deepen = (base: string, x: number, y: number, until: number) => {
  const t = clamp((until - y) / Math.max(1, until))
  return bayer(x, y) < t * 0.75 ? mix(base, INK, 0.14) : base
}

/** The Daybreak background's sky, continued above its grid: the morning sun's top half, two clouds, the blue deepening. */
export const daybreakSky = (): Canvas =>
  cached('battle-sky|daybreak', () => {
    const P = DAYBREAK
    const c = shade(W, SKY_H, (x, y) => {
      // The grid's sun (scenes.ts paintDaybreak) is centred near its top edge: its upper half is drawn here, with the
      // same dither, so it reads as one sun across the seam.
      const gy = y - SKY_H
      const d = Math.hypot(x - W * 0.86, gy - H * 0.06) / (H * 0.2)
      if (d < 0.55 || (d < 0.8 && ((x + gy) & 1) === 0) || (d < 1 && (x & 1) === 0 && (gy & 1) === 0))
        return P.sun
      return deepen(P.sky[0], x, y, SKY_H * 0.7)
    })
    for (const [cx, cy, s] of [
      [W * 0.3, SKY_H - 62, 0.9],
      [W * 0.72, SKY_H - 128, 0.7],
    ] as const) {
      const blobs = [
        [-12, 2, 6],
        [-5, -2, 8],
        [4, -3, 7],
        [12, 1, 6],
        [0, 3, 7],
      ].map(([dx, dy, r]) => [cx + dx! * s, cy + dy! * s, Math.max(2, Math.round(r! * s))] as const)
      for (const [bx, by, br] of blobs) ellipse(c.g, bx, by + 1, br, Math.round(br * 0.8), P.cloud[2])
      for (const [bx, by, br] of blobs) ellipse(c.g, bx, by, br, Math.round(br * 0.8), P.cloud[1])
      for (const [bx, by, br] of blobs)
        ellipse(c.g, bx - 1, by - 1, br - 1, Math.round(br * 0.8) - 1, P.cloud[0])
    }
    return c
  })

/** The nightmare's full-moon night (its grid starts on `NM.night` at the top), a few stars over it. */
export const nightSkyAbove = (): Canvas =>
  cached('battle-sky|night', () => {
    const r = rng(77)
    const stars = new Set<number>()
    for (let i = 0; i < 70; i++) stars.add(r.int(0, SKY_H - 1) * W + r.int(0, W - 1))
    return shade(W, SKY_H, (x, y) => (stars.has(y * W + x) ? (y % 3 ? NM.lilac : NM.haze) : NM.night))
  })

/** A flat fill in the picture's own top colour, deepening upward, for the rows above the picture. */
export const toneSky = (tone: string): Canvas =>
  cached(`battle-sky|tone|${tone}`, () => shade(W, SKY_H, (x, y) => deepen(tone, x, y, SKY_H * 0.8)))

const tones = new Map<string, Promise<string | null>>()

/** A picture's top colour: the average of its top rows (same-origin, so its pixels can be read). Null if it can't. */
export function artTone(url: string): Promise<string | null> {
  let p = tones.get(url)
  if (!p) {
    p = loadArt(url).then((im) => {
      if (!im) return null
      try {
        const c = document.createElement('canvas')
        c.width = im.naturalWidth
        c.height = 3
        const g = c.getContext('2d')
        if (!g) return null
        g.drawImage(im, 0, 0)
        const d = g.getImageData(0, 0, c.width, 3).data
        let rr = 0
        let gg = 0
        let bb = 0
        const n = d.length / 4
        for (let i = 0; i < d.length; i += 4) {
          rr += d[i]!
          gg += d[i + 1]!
          bb += d[i + 2]!
        }
        const hex = (v: number) =>
          Math.round(v / n)
            .toString(16)
            .padStart(2, '0')
        return `#${hex(rr)}${hex(gg)}${hex(bb)}`
      } catch {
        return null
      }
    })
    tones.set(url, p)
  }
  return p
}

/** A cached canvas drawn into the page, scaled nearest-neighbour. */
function Painted({ canvas, className }: { canvas: Canvas; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g) return
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, W, SKY_H)
    g.drawImage(canvas, 0, 0)
  }, [canvas])
  return (
    <canvas
      ref={ref}
      width={W}
      height={SKY_H}
      aria-hidden
      className={className ?? 'pixelated absolute inset-0 h-full w-full'}
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

/**
 * The sky layer, placed right above the grid it belongs to (inside the grid's own box, which must be `relative`); the
 * frame around them clips it to the room there is. Decorative: the stage's label already says what's on it.
 */
export function StageSky({ art, world }: { art?: AreaPicture | null; world?: 'distortion' | 'nightmare' }) {
  const [tone, setTone] = useState<string | null>(null)
  const url = !world ? art?.url : undefined
  useEffect(() => {
    setTone(null)
    if (!url) return
    let live = true
    void artTone(url).then((t) => live && setTone(t))
    return () => {
      live = false
    }
  }, [url])
  const fill =
    world === 'nightmare'
      ? nightSkyAbove()
      : world === 'distortion'
        ? voidBackdrop(W, SKY_H)
        : art && tone
          ? toneSky(tone)
          : daybreakSky()
  return (
    <div
      aria-hidden
      data-stage-sky
      className="pointer-events-none absolute inset-x-0 bottom-full overflow-hidden"
      style={{ height: `${(SKY_H / H) * 100}%` }}
    >
      <Painted canvas={fill} />
      {art && !world && tone && (
        // The picture over the sky and the grid together, so its rows meet the grid's own picture without a seam; the
        // box clips it to the sky.
        <div className="absolute inset-x-0 top-0" style={{ height: `${((SKY_H + H) / SKY_H) * 100}%` }}>
          <AreaArt src={art.url} place={artPlacement(skyWindow(art))} />
        </div>
      )}
    </div>
  )
}
