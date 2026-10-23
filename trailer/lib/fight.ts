// What the trailer's fights share, in every cut: the one stage shot, the dice tray over its dark band, the moves'
// contact times, a faint, the screen shake on a hit, the five of a kind's banner and the flame wipe.
import { play } from './audio'
import { drawTray, restScreen, TRAY_H, TRAY_K, TRAY_W, type TrayPlan } from './dice'
import { bottomShade, OH, OW, outBack, outCubic, rect, span, text, type G } from './draw'
import type { Run } from './run'
import { setArtUnderStage, stageBackground } from '@/fx/scenes'
import { H, W } from '@/fx/timeline'
import { sharpDraw, type Cam } from './stage'

/** The fights' one shot: the whole stage. Every fight, and a legend's entrance, are framed exactly alike. */
export const STAGE: Cam = { x: 120, y: 90, z: 8 }

/**
 * Your Pokémon stands higher than in the game. The game puts its feet 4 px below the stage (a back view cut by the
 * panel under it); in a video, the bottom of the frame is the dice's dark band and a player's control bar, so it stands
 * 12 px up, whole. Every battle timeline over an area picture reads this one cached layout when it builds its stage.
 */
export function liftHero() {
  setArtUnderStage(true)
  stageBackground(W, H).layout.own.y = H - 8
  setArtUnderStage(false)
}

/** When an attack timeline's hit lands on the act's clock: started at `start`, played from `from` at `speed`. */
export const contactOf = (start: number, from: number, speed: number, at = 1.47) => start + (at - from) / speed

/** A Pokémon fainting from time a: it sinks and fades in steps. */
export const faint = (u: number, a: number) => {
  const p = span(u, a, a + 0.25)
  return p > 0 ? { dy: Math.round(26 * p * p), alpha: Math.round((1 - p) * 4) / 4 } : {}
}

/** The tray over a dark band; `zoom` pushes in on die `on` (the slow one). */
export function tray(g: G, plan: TrayPlan, u: number, zoom = 1, on = 0) {
  // Light enough that your Pokémon, bottom left, stays in view behind the dice.
  bottomShade(g, 640, 0.6)
  const cv = drawTray(plan, u)
  if (zoom === 1) sharpDraw(g, cv, 0, 0, TRAY_W * TRAY_K, TRAY_H * TRAY_K)
  else {
    const p = restScreen(plan.fills.length, on)
    const k = TRAY_K * zoom
    // Keep the die where it is, sliding it toward the middle as the camera closes in.
    const tx = p.x + ((960 - p.x) * (zoom - 1)) / 1.6
    const ty = p.y + ((640 - p.y) * (zoom - 1)) / 1.6
    sharpDraw(g, cv, tx - (p.x / TRAY_K) * k, ty - (p.y / TRAY_K) * k, TRAY_W * k, TRAY_H * k)
  }
}

/** Where each of n dice rests on the screen (for the values popping up over them). */
export const diceAt = (n: number) => (i: number) => restScreen(n, i)

/** The screen's shake on a hit at time `at`: whole pixels, decaying. */
export const shakeAt = (u: number, at: number, amp: number, dur = 0.3) => {
  const p = (u - at) / dur
  if (p < 0 || p >= 1) return { x: 0, y: 0 }
  const f = Math.floor((u - at) * 30)
  const k = amp * (1 - p)
  return { x: (f % 2 ? 1 : -1) * Math.round(k), y: ((f >> 1) % 2 ? 1 : -1) * Math.round(k * 0.5) }
}

/** A still scene's canvas at time u. */
export const idleAt = (r: Run, u: number) => (r.at(u), r.draw())

/** FIVE OF A KIND!, huge, slamming in at `land` with its two sounds (`hit` tells when to play them). */
export function fiveBanner(g: G, u: number, land: number, sounded: (t: number) => boolean) {
  if (u < land) return
  const k = 2.2 - 1.2 * outBack(span(u, land, land + 0.2), 2.2)
  const sh = Math.round(Math.sin(u * 70) * 6 * (1 - span(u, land, land + 0.6)))
  g.save()
  g.translate(OW / 2 + sh, 330)
  g.scale(k, k)
  text(g, 'FIVE OF A KIND!', 0, 0, { size: 190, color: '#ffbe2e', align: 'center', base: 'middle', ow: 14, drop: 16, dropColor: '#c4382a' })
  g.restore()
  if (sounded(land)) play('levelup')
  if (sounded(land + 0.18)) play('catch')
}

/** The screen burning from the bottom: three layers of flame tongues, red, orange, yellow. */
export function flameWipe(g: G, p: number, u: number) {
  const layers: [string, number][] = [
    ['#c4382a', 0],
    ['#ee8130', 0.15],
    ['#ffbe2e', 0.3],
  ]
  for (const [c, lag] of layers) {
    const q = Math.max(0, Math.min(1, (p - lag) / (1 - lag)))
    if (q <= 0) continue
    const top = OH * (1.1 - outCubic(q) * 1.45)
    for (let x = 0; x < OW; x += 24) {
      const h = 70 + 55 * Math.sin(x * 0.011 + u * 34 + lag * 9) + 35 * Math.sin(x * 0.037 - u * 21)
      rect(g, x, top - h, 24, OH, c)
    }
  }
}

