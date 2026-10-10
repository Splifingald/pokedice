// Timelines: animations played at 60 fixed steps a second on a 240×160 stage, firing cues at exact times. No React
// here; <StageCanvas> hosts a Player. House rules every timeline follows: anticipation before every release, a 3–5
// frame hit-stop on contact, two white silhouette frames on a hit (never an opacity blink), ordered-dithered light and
// smoke (never blur), particles stepping through a colour ramp, and no screen flash faster than 3 a second.
import { background, type Background, type Layout, type Point } from './scenes'
import { clamp, ease, Particles, rng, text, textWidth, wash, type G, type Rng } from './pixel'
import { drawSprite, spriteSize, type SpriteLook } from './sprites'

export const W = 240
export const H = 160
export const STEP = 1 / 60

/** Which side of the battle a cue speaks about. */
export type Side = 'own' | 'foe'

/**
 * What a timeline tells the screen around it, at exact times. Every hook is optional: the battle listens for the hit
 * landing, the Center for the heal, a dev page for everything. Words are never decided here: the host phrases them
 * (strings live in strings.csv).
 */
export interface Hud {
  /** An attack's hit lands: drain the HP, show the damage. */
  contact?(): void
  /** A status lands on a side (the attack's status face worked). */
  status?(side: Side): void
  /** A Pokémon's plate appears or goes (a catch hides the foe's; an intro shows them). */
  show?(side: Side, on: boolean): void
  /** The team is healed (Pokémon Center). */
  heal?(): void
  /** A form change lands: MEGA / G-MAX on the plate. */
  form?(side: Side, mechanic: 'mega' | 'gmax'): void
  /** A Gigantamax ends: the Pokémon shrinks back. */
  formEnd?(side: Side): void
  /** The ball stopped: caught, or it broke free. */
  catchResult?(caught: boolean): void
  /** A narrative beat, by name (the host may show a line for it). */
  beat?(name: string): void
}

/** A cue: at a time, tell the HUD something. (Method form, so a timeline of any state plays as `Timeline<unknown>`.) */
type CueFn<S> = { fire(hud: Hud, s: S): void }['fire']
export type Cue<S> = readonly [number, CueFn<S>]

export interface Timeline<S = unknown> {
  id: string
  /** Seconds. */
  dur: number
  setup(): S
  step(s: S, t: number, dt: number): void
  draw(g: G, s: S, t: number): void
  /** Sorted by time; built once the state exists (some times depend on it, like when a projectile arrives). */
  cues(s: S): Cue<S>[]
}

// ---------------------------------------------------------------- shared helpers
export const frozenFor = (t: number, wins: readonly (readonly [number, number])[]) =>
  wins.reduce((a, [s, e]) => a + Math.max(0, Math.min(t, e) - s), 0)
export const within = (t: number, a: number, b: number) => t >= a && t < b
export const quad = (a: Point, c: Point, b: Point, p: number): Point => ({
  x: (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * c.x + p * p * b.x,
  y: (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * c.y + p * p * b.y,
})
export const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

let calm = false
/** Calm (the OS asks for reduced motion, or animations are off): no screen shakes, no full-screen flashes. */
export const setCalm = (on: boolean) => void (calm = on)

/** A full-screen flash (a hit landing, a burst): skipped when calm. */
export function screenFlash(g: G, color: string, alpha: number) {
  if (!calm) wash(g, color, alpha)
}

/** The whole stage's shake at t: none when calm. */
export const screenShake = (t: number, list: readonly (readonly [number, number, number])[]) =>
  calm ? { x: 0, y: 0 } : shakeAt(t, list)

/** Screen or sprite shake: alternating whole-pixel offsets, decaying. Each entry [t0, dur, amp]. */
export function shakeAt(t: number, list: readonly (readonly [number, number, number])[]) {
  let x = 0
  let y = 0
  for (const [t0, dur, amp] of list) {
    const p = (t - t0) / dur
    if (p < 0 || p >= 1) continue
    const k = amp * (1 - p)
    const f = Math.floor((t - t0) * 30)
    x += (f % 2 ? 1 : -1) * Math.round(k)
    y += ((f >> 1) % 2 ? 1 : -1) * Math.round(k * 0.4)
  }
  return { x, y }
}

/** Damage number: pops up with an overshoot, holds, then blinks out. */
export function pop(g: G, str: string, x: number, y: number, t: number, t0: number, color = '#ffffff') {
  const p = t - t0
  if (p < 0 || p > 1.3) return
  if (p > 1.0 && Math.floor(p * 20) % 2) return
  const rise = 14 * ease.outBack(clamp(p / 0.3), 2.4)
  text(
    g,
    str,
    clamp(x - textWidth(str) / 2, 3, W - textWidth(str) - 3),
    Math.max(4, y - rise),
    color,
    '#1a1423',
    1,
    '#1a142380',
  )
}

// ---------------------------------------------------------------- the battle stage
export interface Fighters {
  /** Your Pokémon's back sprite key (fx/sprites `spriteKey`). */
  own: string
  /** The foe's front sprite key. */
  foe: string
  /** Who acts: 'own' attacks the foe, 'foe' attacks you. */
  by?: Side
}

interface Hit {
  t0: number
  dur: number
  tint: string | null
  flash: boolean
}

/**
 * The battle stage every battle timeline shares: background, both sprites, hits, shakes, particles. Timelines speak
 * of the attacker and the target, so the same move plays your way or the foe's.
 */
export class Stage {
  bg: Background
  L: Layout
  own: string
  foe: string
  by: Side
  r: Rng
  stops: [number, number][] = []
  screenShakes: [number, number, number][] = []
  targetShakes: [number, number, number][] = []
  hits: Hit[] = []
  fx = new Particles()
  under = new Particles()
  constructor(f: Fighters, seed: number) {
    this.bg = background(W, H)
    this.L = this.bg.layout
    this.own = f.own
    this.foe = f.foe
    this.by = f.by ?? 'own'
    this.r = rng(seed)
  }
  get os() {
    return spriteSize(this.own)
  }
  get fs() {
    return spriteSize(this.foe)
  }
  /** The attacker's / target's sprite key, size and feet point. */
  get atk() {
    return this.by === 'own'
      ? { key: this.own, size: this.os, at: this.L.own }
      : { key: this.foe, size: this.fs, at: this.L.foe }
  }
  get tgt() {
    return this.by === 'own'
      ? { key: this.foe, size: this.fs, at: this.L.foe }
      : { key: this.own, size: this.os, at: this.L.own }
  }
  /** A point on a sprite, as fractions of its box (x mirrored when the foe attacks, so "the front" stays the front). */
  private on(
    side: { size: { w: number; h: number }; at: Point },
    fx: number,
    fy: number,
    dx = 0,
    dy = 0,
    mirror = false,
  ) {
    const s = side.size
    const ux = mirror ? 1 - fx : fx
    return { x: side.at.x - s.w / 2 + s.w * ux + (mirror ? -dx : dx), y: side.at.y - s.h + s.h * fy + dy }
  }
  /** A point on the attacker (its mouth, its cannons) — given for a back sprite facing right. */
  atkAt(fx: number, fy: number, dx = 0, dy = 0) {
    return this.on(this.atk, fx, fy, dx, dy, this.by === 'foe')
  }
  /** A point on the target. */
  tgtAt(fx: number, fy: number, dx = 0, dy = 0) {
    return this.on(this.tgt, fx, fy, dx, dy)
  }
  get tgtC() {
    return this.tgtAt(0.5, 0.5)
  }
  /** Which way the attack travels on x: +1 when you attack (left to right), −1 when the foe does. */
  get dir() {
    return this.by === 'own' ? 1 : -1
  }
  /** Register a hit: hit-stop, white flash, sprite shake, a type-coloured tint, optional screen shake. */
  hit(
    t0: number,
    {
      stop = 0.07,
      shake = 2,
      dur = 0.45,
      tint = null,
      screen = 0,
      flash = true,
    }: {
      stop?: number
      shake?: number
      dur?: number
      tint?: string | null
      screen?: number
      flash?: boolean
    } = {},
  ) {
    if (stop) this.stops.push([t0, t0 + stop])
    this.targetShakes.push([t0, dur, shake])
    if (screen) this.screenShakes.push([t0, dur * 0.8, screen])
    this.hits.push({ t0, dur, tint, flash })
  }
  stopped(t: number) {
    return this.stops.some(([a, b]) => t >= a && t < b)
  }
  /** The target's hit look at time t: two white flash frames, then a tint flicker. */
  hitLook(t: number) {
    let flash = 0
    let tint: { color: string; a: number } | null = null
    for (const h of this.hits) {
      const p = t - h.t0
      if (p < 0 || p > h.dur) continue
      const f = Math.floor(p * 60)
      if (h.flash && (f < 3 || (f >= 6 && f < 8))) flash = 1
      else if (!h.flash && f < 3) tint = { color: h.tint || '#ffffff', a: 0.5 }
      else if (h.tint && Math.floor(p * 15) % 2 === 0) tint = { color: h.tint, a: 0.45 * (1 - p / h.dur) }
    }
    return { flash, tint }
  }
  step(t: number, dt: number) {
    if (this.stopped(t)) return false
    this.fx.update(dt)
    this.under.update(dt)
    return true
  }
  begin(g: G, t: number) {
    const s = screenShake(t, this.screenShakes)
    if (s.x || s.y) g.drawImage(this.bg.cv, 0, 0)
    g.save()
    g.translate(s.x, s.y)
    g.drawImage(this.bg.cv, 0, 0)
    this.bg.dyn(g, t)
  }
  end(g: G) {
    g.restore()
  }
  /** Draw the target with its hit look on top of whatever the timeline asks. */
  drawTarget(g: G, t: number, o: SpriteLook = {}) {
    const sh = shakeAt(t, this.targetShakes)
    const look = this.hitLook(t)
    const side = this.tgt
    // A knock-back is given for a target on the right; yours is pushed left.
    drawSprite(g, side.key, side.at.x + sh.x + (o.dx || 0) * this.dir, side.at.y + (o.dy || 0), {
      ...o,
      flash: Math.max(look.flash, o.flash || 0),
      tint: o.tint || look.tint,
    })
  }
  drawAttacker(g: G, o: SpriteLook = {}) {
    const side = this.atk
    // Offsets are given for an attack going right; the foe's go left.
    drawSprite(g, side.key, side.at.x + (o.dx || 0) * this.dir, side.at.y + (o.dy || 0), o)
  }
  /** Both Pokémon, back to front: the foe's platform is further away, so it is drawn first. */
  drawBoth(g: G, t: number, target: SpriteLook = {}, attacker: SpriteLook = {}) {
    if (this.by === 'own') {
      this.drawTarget(g, t, target)
      this.drawAttacker(g, attacker)
    } else {
      this.drawAttacker(g, attacker)
      this.drawTarget(g, t, target)
    }
  }
}

// ---------------------------------------------------------------- the player
export type MotionLevel = 'full' | 'short' | 'off'

/**
 * Plays one timeline on a canvas: fixed 60 Hz steps, cues fired in order at their times, a speed (¼ for the dev
 * page), single-frame steps, and `skip` — straight to the end state with every cue fired (motion off).
 */
export class Player<S = unknown> {
  g: G
  def: Timeline<S> | null = null
  s: S | null = null
  hud: Hud
  t = 0
  speed = 1
  playing = false
  private acc = 0
  private cueI = 0
  private cueList: Cue<S>[] = []
  private raf = 0
  private last = 0
  onTick: ((t: number) => void) | null = null
  onEnd: (() => void) | null = null
  constructor(cv: HTMLCanvasElement, hud: Hud = {}) {
    this.g = cv.getContext('2d')!
    this.g.imageSmoothingEnabled = false
    this.hud = hud
  }
  load(def: Timeline<S>) {
    this.def = def
    this.reset()
  }
  reset() {
    if (!this.def) return
    this.t = 0
    this.acc = 0
    this.cueI = 0
    this.s = this.def.setup()
    this.cueList = this.def.cues(this.s)
    this.render()
  }
  play() {
    if (!this.def) return
    if (this.t >= this.def.dur) this.reset()
    this.playing = true
    this.last = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame((n) => this.frame(n))
  }
  pause() {
    this.playing = false
    cancelAnimationFrame(this.raf)
    if (this.def) this.render()
  }
  stepFrame() {
    if (!this.def) return
    this.pause()
    if (this.t >= this.def.dur) this.reset()
    this.advance(STEP)
    this.render()
  }
  /** Jump to the end: every remaining cue fires, in order, and the last frame is drawn. */
  skip() {
    if (!this.def) return
    this.pause()
    // Steps are cheap; walking them keeps the end state exactly what playing would have left.
    this.advance(this.def.dur - this.t + STEP)
    this.render()
    this.onEnd?.()
  }
  stop() {
    this.playing = false
    cancelAnimationFrame(this.raf)
  }
  private advance(dt: number) {
    const def = this.def!
    this.acc += dt
    while (this.acc >= STEP - 1e-9) {
      this.acc -= STEP
      this.t += STEP
      def.step(this.s!, this.t, STEP)
      while (this.cueI < this.cueList.length && this.cueList[this.cueI]![0] <= this.t)
        this.cueList[this.cueI++]![1](this.hud, this.s!)
      if (this.t >= def.dur) break
    }
  }
  private frame(now: number) {
    if (!this.playing || !this.def) return
    const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed
    this.last = now
    this.advance(dt)
    this.render()
    if (this.t >= this.def.dur) {
      this.playing = false
      this.onEnd?.()
      return
    }
    this.raf = requestAnimationFrame((n) => this.frame(n))
  }
  render() {
    if (!this.def || this.s == null) return
    this.g.clearRect(0, 0, W, H)
    this.def.draw(this.g, this.s, Math.min(this.t, this.def.dur))
    this.onTick?.(this.t)
  }
}
