// The dark backdrop of the title and the end card: Daybreak's dusk navy, lighter in the middle in dithered steps, with
// a soft pattern of Poké Ball outlines drifting slowly across it. Drawn in art pixels on a low-res canvas.
import { bayer, canvas, ellipseLine, rect } from '@/fx/pixel'

const STEPS = ['#141d44', '#1a2552', '#212e60', '#28376e']
const LINE = 'rgba(140,160,235,0.16)'
const TILE = 96

const grounds = new Map<string, HTMLCanvasElement>()

/** The ground: four steps of navy around the centre, dithered where they meet. Drawn once per size. */
function ground(w: number, h: number) {
  const key = `${w}x${h}`
  const hit = grounds.get(key)
  if (hit) return hit
  const c = canvas(w, h)
  const img = c.g.createImageData(w, h)
  const cols = STEPS.map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)])
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w * 0.62)
      const dy = (y - h * 0.46) / (h * 0.62)
      const v = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) * (STEPS.length - 0.01) + (bayer(x, y) - 0.5) * 0.6
      const col = cols[Math.max(0, Math.min(STEPS.length - 1, Math.floor(v)))]!
      const i = (y * w + x) * 4
      img.data[i] = col[0]!
      img.data[i + 1] = col[1]!
      img.data[i + 2] = col[2]!
      img.data[i + 3] = 255
    }
  c.g.putImageData(img, 0, 0)
  grounds.set(key, c)
  return c
}

export function pokeballBackdrop(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  g.drawImage(ground(w, h), 0, 0)
  // The pattern: Poké Ball outlines on a staggered grid, drifting down and to the left.
  const ox = (t * 9) % TILE
  const oy = (t * 6) % TILE
  for (let row = -1; row < h / TILE + 2; row++)
    for (let col = -1; col < w / TILE + 2; col++) {
      const cx = Math.round(col * TILE + (row % 2 ? TILE / 2 : 0) - ox)
      const cy = Math.round(row * TILE + oy)
      ball(g, cx, cy, 22)
    }
}

function ball(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ellipseLine(g, cx, cy, r, r, LINE)
  rect(g, cx - r, cy, r - 6, 1, LINE)
  rect(g, cx + 7, cy, r - 6, 1, LINE)
  ellipseLine(g, cx, cy, 6, 6, LINE)
  ellipseLine(g, cx, cy, 2, 2, LINE)
}
