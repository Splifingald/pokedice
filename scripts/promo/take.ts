// One take of the real game for the promo edits (scripts/record-promo.ts, scripts/record-youtube.ts): a scene of the
// dev-only harness (/__demo/:scene) played by a script, every frame kept with its sounds and the marks the script set.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from '@/engine'
import { openCapture, type Capture, type CryNote } from './capture'

export interface Format {
  name: string
  out: string
  width: number
  height: number
  dpr: number
  touch: boolean
}

export const FPS = 60

/** Where a stand-in for Supabase answers (the trades' scene); every other take gets empty answers from it. */
export const SUPABASE = 'http://127.0.0.1:54399'

/** A box on the page, CSS pixels. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Take {
  frames: string[]
  marks: Record<string, number>
  wav: string | null
  cries: CryNote[]
  /** The frames' device pixel ratio, and the page's boxes the script measured (the battle stage, the dice). */
  dpr: number
  boxes: Record<string, Box>
}

export interface Ctx {
  cap: Capture
  f: Format
  dir: string
  frames: string[]
  marks: Record<string, number>
  boxes: Record<string, Box>
}

export interface Scene {
  name: string
  /** This take's page size instead of the format's. */
  size?: Pick<Format, 'width' | 'height' | 'dpr'>
  /** Before the page opens: the Supabase stand-in's answers, for one. */
  setup?: (cap: Capture) => Promise<void>
  /** localStorage entries of its own (a signed-in session). */
  storage?: Record<string, string>
  play: (c: Ctx, url: string) => Promise<void>
  /** After the take: marks read off its frames. */
  after?: (c: Ctx) => void
}

export async function tick(c: Ctx) {
  const png = await c.cap.frame()
  const file = join(c.dir, `${String(c.frames.length).padStart(5, '0')}.png`)
  writeFileSync(file, png)
  c.frames.push(file)
}
export const mark = (c: Ctx, name: string) => void (c.marks[name] = c.frames.length)
export async function hold(c: Ctx, ms: number) {
  for (let i = Math.round((ms * FPS) / 1000); i > 0; i--) await tick(c)
}
/** Frames until the page says so (checked before each one), at most `max` ms of game time. */
export async function until(c: Ctx, expr: string, max = 15_000) {
  for (let i = 0; i < (max * FPS) / 1000; i++) {
    if (await c.cap.page.evaluate(expr)) return
    await tick(c)
  }
  throw new Error(`[${c.f.name}] waited too long for: ${expr}`)
}
/** An element's box on the page, kept under `name`. */
export async function measure(c: Ctx, name: string, selector: string) {
  const box = await c.cap.pumped(c.cap.page.locator(selector).first().boundingBox({ timeout: 15_000 }))
  if (!box) throw new Error(`[${c.f.name}] nothing to measure: ${selector}`)
  c.boxes[name] = box
}

export const store = '(window.__promo && window.__promo.state())'
export const battleLog = `((${store} || {}).battle || { log: [] }).log`
export const hasLog = (kind: string, side?: string) =>
  `${battleLog}.some((e) => e.kind === '${kind}'${side ? ` && e.side === '${side}'` : ''})`
export const buttonOn = (re: string) =>
  `[...document.querySelectorAll('button')].some((b) => ${re}.test(b.textContent.trim()) && !b.disabled)`
export const text = (s: string) => `document.body.innerText.includes(${JSON.stringify(s)})`

export async function record(url: string, format: Format, scene: Scene, dir: string): Promise<Take> {
  const f = scene.size ? { ...format, ...scene.size } : format
  const cap = await openCapture({
    width: f.width,
    height: f.height,
    dpr: f.dpr,
    touch: f.touch,
    fps: FPS,
    audioSeconds: 40,
    storage: {
      // Trades switched on (they ship off), as the dev server reads its config.
      'pokedice.devConfig': JSON.stringify({ trade: { ...DEFAULT_CONFIG.trade, access: 'all' } }),
      // Prof. Oak's "Invite a friend" (once a region's second badge is won) already seen.
      ...Object.fromEntries(
        ['kanto', 'johto', 'hoenn', 'sinnoh', 'kalos'].map((r) => [`pokedice.sharePrompt.${r}`, '1']),
      ),
      ...scene.storage,
    },
  })
  if (scene.setup) await scene.setup(cap)
  else
    await cap.page.route(`${SUPABASE}/**`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
  const c: Ctx = { cap, f, dir, frames: [], marks: {}, boxes: {} }
  try {
    await scene.play(c, url)
    scene.after?.(c)
    const { wav, cries } = await cap.sounds()
    let wavFile: string | null = null
    if (wav) writeFileSync((wavFile = join(dir, 'sound.wav')), wav)
    console.log(
      `[${f.name}] ${scene.name}: ${c.frames.length} frames, marks ${JSON.stringify(c.marks)}, cries ${cries.length}`,
    )
    return { frames: c.frames, marks: c.marks, wav: wavFile, cries, dpr: f.dpr, boxes: c.boxes }
  } finally {
    await cap.close()
  }
}
