// The Fortune Wheel on a canvas (docs/18, the Visual Lab's events.js): drawn at the screen's own resolution, so the
// slices stay round and the prizes stay sharp. A second canvas around it carries the effects that fly out of it: sparks
// off the pegs, the prize popping out of its slice, coins and stars, the jackpot's flash. No React here: the page
// mounts a stage and asks it to spin.
import type { WheelReward } from '@/engine'
import { hiss, tone } from '@/audio/sfx'
import { ICONS } from '@/components/icons'
import { ICON_PALETTE } from '@/theme/colors'
import { ease, icon } from './pixel'
import { loadItemSprite, spriteFrame } from './sprites'

export interface WheelSlice {
  reward: WheelReward
  /** The item's picture (its `spriteUrl`); none for ₽. */
  sprite?: string
  /** What's written on the slice: the ₽ amount, or ×2 for two of an item. */
  label: string
}

/** full: everything · short: a quicker spin, the same show · off: a short turn, no particles, no shake. */
export type WheelMotion = 'full' | 'short' | 'off'

/** The slice colours, two tones taking turns round the wheel. */
const SLICE_COL: Record<string, [string, string]> = {
  gold: ['#ffe7a8', '#ffd76a'],
  'poke-ball': ['#ffc2b8', '#ff8f7f'],
  'great-ball': ['#b8d4ff', '#8ab4ff'],
  'ultra-ball': ['#d6dbe6', '#aab4c8'],
  'master-ball': ['#e2c4ff', '#c58aff'],
}
const OTHER_COL: [string, string] = ['#e3e9f2', '#cfd8e6']
const sliceCol = (r: WheelReward, i: number) => (SLICE_COL[r.kind === 'gold' ? 'gold' : r.key] ?? OTHER_COL)[i % 2]!

/** The big prizes: a flash, a shower of coins and a fanfare. */
export const isJackpot = (r: WheelReward) => r.kind === 'item' && (r.key === 'ultra-ball' || r.key === 'master-ball')

const NAVY = '#24304f'
const FONT = "'Jersey 25', 'Jersey 15', sans-serif"
const FXC = { coin: ['#ffe066', '#ffbe2e', '#c88a1a'], star: ['#ffffff', '#fff6a8', '#ffbe2e', '#7fd6ff', '#ff9ad5'], spark: ['#ffffff', '#fff6a8'] }
const coinIcon = () => icon(ICONS.coin, { ...ICON_PALETTE, k: NAVY }, 1)

type Mode = 'idle' | 'spin' | 'win' | 'won'
interface Particle {
  kind: 'coin' | 'star' | 'spark'
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  age: number
  s: number
  c: string
  spin: number
}
interface BurstOpts {
  at?: { x: number; y: number }
  dir?: number
  spread?: number
  speed?: number
  lift?: number
  g?: number
  life?: number
  size?: number
}

const rad = (d: number) => (d * Math.PI) / 180
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const frame = () => new Promise<number>((r) => requestAnimationFrame(r))

export interface WheelEls {
  /** The wheel's box: its data-phase / data-win attributes drive the CSS (rays, glow, shake). */
  box: HTMLElement
  wheel: HTMLCanvasElement
  fx: HTMLCanvasElement
  pointer: HTMLElement
}

export class WheelStage {
  private rot = 0
  private vel = 0
  private chase = 0
  private mode: Mode = 'idle'
  private win: { k: number; t0: number } | null = null
  private pop: { t0: number; x: number; y: number; reward: WheelReward; sprite?: string } | null = null
  private parts: Particle[] = []
  private flash = 0
  private raf = 0
  private last = 0
  private S = 288
  private F = 400
  private M = 0
  private spriteKeys = new Map<string, string>()
  private stopped = false

  constructor(
    private els: WheelEls,
    private slices: WheelSlice[],
    private motion: WheelMotion,
  ) {}

  /** Starts drawing. `spun`: today's spin is gone, the lights rest in their "come back tomorrow" pattern. */
  start(spun: boolean) {
    this.mode = spun ? 'won' : 'idle'
    this.resize()
    this.loadSprites()
    void document.fonts?.load(`20px ${FONT}`)
    this.last = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.loop)
  }

  stop() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
  }

  setSlices(slices: WheelSlice[]) {
    this.slices = slices
    this.loadSprites()
  }

  setMotion(motion: WheelMotion) {
    this.motion = motion
  }

  /** Back to the resting lights (a new day's spin, or after a reward card). */
  setSpun(spun: boolean) {
    if (this.mode === 'spin' || this.mode === 'win') return
    this.mode = spun ? 'won' : 'idle'
    if (!spun) this.win = null
  }

  /** Both canvases at device pixels; the effects canvas reaches past the wheel so things can fly out of it. */
  resize() {
    const { wheel, fx } = this.els
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    const css = wheel.getBoundingClientRect().width || 288
    this.S = Math.max(64, Math.round(css * dpr))
    wheel.width = wheel.height = this.S
    const fr = fx.getBoundingClientRect()
    this.F = Math.round((fr.width || css * 1.44) * dpr)
    this.M = Math.round(((fr.width || css * 1.44) - css) / 2) * dpr
    fx.width = this.F
    fx.height = Math.round((fr.height || css * 1.6) * dpr)
  }

  private loadSprites() {
    for (const s of this.slices)
      if (s.sprite && !this.spriteKeys.has(s.sprite))
        void loadItemSprite(s.sprite).then((key) => this.spriteKeys.set(s.sprite!, key))
  }

  private itemFrame(sprite: string | undefined) {
    const key = sprite && this.spriteKeys.get(sprite)
    return key ? spriteFrame(key) : undefined
  }

  private get calm() {
    return this.motion === 'off'
  }

  // ------------------------------------------------------------------ drawing

  /** The marquee: a slow chase when idle, a fast one while it turns, everything blinking on a win. */
  private light(i: number, t: number): 0 | 1 | 2 {
    if (this.mode === 'won') return i % 2 ? 1 : 0
    if (this.mode === 'win') return Math.floor(t * 9) % 2 ? 2 : 1
    const ph = Math.floor(this.chase)
    if ((i + ph) % 3 === 0) return this.mode === 'spin' ? 2 : 1
    return this.mode === 'spin' && (i + ph) % 3 === 1 ? 1 : 0
  }

  private loop = (now: number) => {
    if (this.stopped || !this.els.wheel.isConnected) return
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.chase += dt * (this.mode === 'spin' ? 4 + Math.abs(this.vel) * 0.9 : 3)
    let win: { k: number; flash: number; dim: number } | null = null
    if (this.win && (this.mode === 'win' || this.mode === 'won')) {
      const e = (now - this.win.t0) / 1000
      win = {
        k: this.win.k,
        flash: this.mode === 'won' ? 0 : e < 0.9 ? (Math.floor(e * 7) % 2 ? 1 : 0.15) : 0.25 + 0.15 * Math.sin(e * 6),
        dim: this.mode === 'won' ? 1 : Math.min(1, e * 2.5),
      }
    }
    this.drawWheel(now / 1000, win)
    this.drawFx(dt, now)
    this.raf = requestAnimationFrame(this.loop)
  }

  /**
   * The outer ring stands still and carries the marquee bulbs; the disc inside turns: slices, pegs, the prizes upright
   * (item art at a whole-number scale, so it stays sharp) and the amounts. u scales everything from the 288 px it is
   * designed at.
   */
  private drawWheel(t: number, win: { k: number; flash: number; dim: number } | null) {
    const g = this.els.wheel.getContext('2d')
    if (!g) return
    const sl = this.slices
    const n = Math.max(1, sl.length)
    const S = this.S
    const rot = this.rot
    const u = S / 288
    const c = S / 2
    const R = S / 2 - 1
    const step = 360 / n
    g.clearRect(0, 0, S, S)
    g.save()
    g.imageSmoothingEnabled = true
    const disc = (r: number, fill: string | null, stroke?: string, lw = 1) => {
      g.beginPath()
      g.arc(c, c, r, 0, Math.PI * 2)
      if (fill) {
        g.fillStyle = fill
        g.fill()
      }
      if (stroke) {
        g.strokeStyle = stroke
        g.lineWidth = lw
        g.stroke()
      }
    }
    // The ring: navy edge, a gold band with its bulbs, a navy inner edge.
    disc(R, NAVY)
    disc(R - 3 * u, '#e8a21c')
    disc(R - 5 * u, '#ffbe2e')
    const r = R - 15 * u
    disc(r + 2.5 * u, NAVY)
    const nb = n * 3
    for (let i = 0; i < nb; i++) {
      const a = rad(-90 + (i + 0.5) * (360 / nb))
      const br = R - 8.5 * u
      const x = c + Math.cos(a) * br
      const y = c + Math.sin(a) * br
      const st = this.light(i, t)
      if (st) {
        g.beginPath()
        g.arc(x, y, 6 * u, 0, Math.PI * 2)
        g.fillStyle = st === 2 ? 'rgba(255,255,255,0.55)' : 'rgba(255,240,160,0.45)'
        g.fill()
      }
      g.beginPath()
      g.arc(x, y, 3 * u, 0, Math.PI * 2)
      g.fillStyle = st === 2 ? '#ffffff' : st ? '#fff6c0' : '#b8862a'
      g.fill()
      g.lineWidth = Math.max(1, 1.2 * u)
      g.strokeStyle = '#7a5410'
      g.stroke()
    }
    // The slices; at speed, ghost passes behind smear them along the turn.
    const slicesAt = (rr: number, alpha: number) => {
      g.globalAlpha = alpha
      sl.forEach((sx, i) => {
        g.beginPath()
        g.moveTo(c, c)
        g.arc(c, c, r, rad(-90 + i * step + rr), rad(-90 + (i + 1) * step + rr))
        g.closePath()
        g.fillStyle = sliceCol(sx.reward, i)
        g.fill()
      })
      g.globalAlpha = 1
    }
    const blur = this.calm ? 0 : Math.min(40, Math.abs(this.vel) * 1.6)
    if (blur > 1.5) for (let j = 3; j >= 1; j--) slicesAt(rot - (blur * j) / 3, 0.35)
    slicesAt(rot, blur > 1.5 ? 0.85 : 1)
    sl.forEach((_, i) => {
      const a0 = rad(-90 + i * step + rot)
      const a1 = rad(-90 + (i + 1) * step + rot)
      g.beginPath()
      g.arc(c, c, r, a0, a1)
      g.arc(c, c, r - 8 * u, a1, a0, true)
      g.closePath()
      g.fillStyle = 'rgba(255,255,255,0.35)'
      g.fill()
    })
    // Slice edges and pegs.
    g.strokeStyle = NAVY
    g.lineWidth = Math.max(1, 2.5 * u)
    for (let i = 0; i < n; i++) {
      const a = rad(-90 + i * step + rot)
      g.beginPath()
      g.moveTo(c, c)
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r)
      g.stroke()
    }
    for (let i = 0; i < n; i++) {
      const a = rad(-90 + i * step + rot)
      const pr = r - 4 * u
      g.beginPath()
      g.arc(c + Math.cos(a) * pr, c + Math.sin(a) * pr, 2.8 * u, 0, Math.PI * 2)
      g.fillStyle = '#fbfdff'
      g.fill()
      g.lineWidth = 1.5 * u
      g.stroke()
    }
    // Upright prizes: their slice turns, they don't.
    const k = Math.max(1, Math.round(u * 1.5))
    const fs = Math.round(22 * u)
    g.font = `${fs}px ${FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    sl.forEach((sx, i) => {
      const a = rad((i + 0.5) * step + rot)
      const ri = r * 0.64
      const x = Math.round(c + Math.sin(a) * ri)
      const y = Math.round(c - Math.cos(a) * ri)
      const label = sx.label
      const art = sx.reward.kind === 'item' ? this.itemFrame(sx.sprite) : undefined
      if (art) {
        const sz = art.width * k
        g.imageSmoothingEnabled = false
        g.drawImage(art, Math.round(x - sz / 2), Math.round(y - sz / 2 - (label ? 6 * u : 0)), sz, sz)
        g.imageSmoothingEnabled = true
      }
      if (label) {
        const ly = sx.reward.kind === 'gold' ? y : y + 14 * u
        g.lineWidth = Math.max(2, 4 * u)
        g.strokeStyle = '#fbfdff'
        g.strokeText(label, x, ly)
        g.fillStyle = NAVY
        g.fillText(label, x, ly)
      }
    })
    // The win: the others sink into shadow, the winning slice blinks white.
    if (win) {
      sl.forEach((_, i) => {
        const isWin = i === win.k
        const alpha = isWin ? win.flash * 0.75 : win.dim * 0.55
        if (alpha <= 0) return
        g.beginPath()
        g.moveTo(c, c)
        g.arc(c, c, r, rad(-90 + i * step + rot), rad(-90 + (i + 1) * step + rot))
        g.closePath()
        g.fillStyle = isWin ? `rgba(255,255,255,${alpha})` : `rgba(20,26,48,${alpha})`
        g.fill()
      })
      if (win.dim > 0) {
        g.beginPath()
        g.moveTo(c, c)
        g.arc(c, c, r, rad(-90 + win.k * step + rot), rad(-90 + (win.k + 1) * step + rot))
        g.closePath()
        g.lineWidth = 5 * u
        g.strokeStyle = '#ffbe2e'
        g.stroke()
      }
    }
    // The hub.
    disc(24 * u, '#fbfdff', NAVY, Math.max(1, 3 * u))
    disc(9 * u, '#f2553f', NAVY, Math.max(1, 2 * u))
    g.restore()
  }

  private center() {
    return { x: this.F / 2, y: this.M + this.S / 2 }
  }

  private burst(kind: Particle['kind'], n: number, o: BurstOpts = {}) {
    if (this.calm) return
    const c = o.at ?? this.center()
    const u = this.S / 288
    const cols = FXC[kind]
    for (let i = 0; i < n; i++) {
      const a = o.dir != null ? o.dir + (Math.random() - 0.5) * (o.spread ?? 1) : Math.random() * Math.PI * 2
      const sp = (o.speed ?? 6) * (0.4 + Math.random()) * u
      this.parts.push({
        kind,
        x: c.x,
        y: c.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.lift ?? 0) * u,
        g: (o.g ?? 0.25) * u,
        life: o.life ?? 1.2 + Math.random() * 0.6,
        age: 0,
        s: (o.size ?? 3) * u * (0.7 + Math.random() * 0.6),
        c: cols[Math.floor(Math.random() * cols.length)]!,
        spin: Math.random() * Math.PI,
      })
    }
  }

  private drawFx(dt: number, now: number) {
    const g = this.els.fx.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, this.els.fx.width, this.els.fx.height)
    const u = this.S / 288
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]!
      p.age += dt
      if (p.age > p.life) {
        this.parts.splice(i, 1)
        continue
      }
      p.vy += p.g
      p.x += p.vx
      p.y += p.vy
      p.vx *= 0.985
      p.spin += dt * 8
      const a = Math.min(1, (p.life - p.age) * 3)
      g.globalAlpha = a
      if (p.kind === 'coin') {
        // A spinning coin: its width follows the spin.
        const w = Math.max(1, Math.abs(Math.cos(p.spin)) * p.s * 2)
        g.fillStyle = '#7a5410'
        g.fillRect(Math.round(p.x - w / 2 - u), Math.round(p.y - p.s - u), Math.round(w + 2 * u), Math.round(p.s * 2 + 2 * u))
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - p.s), Math.round(w), Math.round(p.s * 2))
      } else if (p.kind === 'spark') {
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.s), Math.round(p.s))
        g.globalAlpha = a * 0.4
        g.fillRect(Math.round(p.x - p.vx), Math.round(p.y - p.vy), Math.round(p.s), Math.round(p.s))
      } else {
        // A four-point star.
        const s = Math.round(p.s * (0.8 + 0.4 * Math.sin(p.spin)))
        g.fillStyle = p.c
        g.fillRect(Math.round(p.x - s), Math.round(p.y - s / 3), s * 2, Math.round((s * 2) / 3))
        g.fillRect(Math.round(p.x - s / 3), Math.round(p.y - s), Math.round((s * 2) / 3), s * 2)
      }
    }
    g.globalAlpha = 1
    // The prize, out of its slice and up to the middle, big.
    if (this.pop) {
      const e = Math.min(1, (now - this.pop.t0) / 650)
      const c = this.center()
      const p = ease.outBack(e, 1.6)
      const x = this.pop.x + (c.x - this.pop.x) * ease.outQ(e)
      const y = this.pop.y + (c.y - this.pop.y) * ease.outQ(e)
      const k = Math.max(1, Math.round(u * (1.5 + 2.5 * Math.min(1, p))))
      const art = this.pop.reward.kind === 'gold' ? coinIcon() : this.itemFrame(this.pop.sprite)
      // The coin is an 8 px icon: scaled to the size an item's 32 px picture would be.
      const sz = 32 * k
      const bob = e >= 1 ? Math.sin(now / 180) * 3 * u : 0
      const gr = g.createRadialGradient(x, y + bob, 0, x, y + bob, sz)
      gr.addColorStop(0, 'rgba(255,240,160,0.95)')
      gr.addColorStop(1, 'rgba(255,190,46,0)')
      g.fillStyle = gr
      g.beginPath()
      g.arc(x, y + bob, sz, 0, Math.PI * 2)
      g.fill()
      if (art) {
        g.imageSmoothingEnabled = false
        const d = this.pop.reward.kind === 'gold' ? Math.round(sz * 0.6) : sz
        g.drawImage(art, Math.round(x - d / 2), Math.round(y + bob - d / 2), d, d)
        g.imageSmoothingEnabled = true
      }
    }
    if (this.flash > 0) {
      // A burst of light from the wheel, fading out before the canvas's edges so it has no corners.
      const c = this.center()
      const reach = Math.min(this.els.fx.width, this.els.fx.height) / 2
      const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach)
      gr.addColorStop(0, `rgba(255,255,255,${this.flash})`)
      gr.addColorStop(0.55, `rgba(255,250,220,${this.flash * 0.7})`)
      gr.addColorStop(1, 'rgba(255,240,160,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, this.els.fx.width, this.els.fx.height)
      this.flash = Math.max(0, this.flash - dt * 2.2)
    }
  }

  // ------------------------------------------------------------------ the spin

  /**
   * Spins to slice `k`: the wind-up, the launch and its long ease out with a teeter, the land (a clack, a shake, the
   * slice blinking while the rest go dark), then the prize popping out with coins and stars. Resolves when the show is
   * over and the reward card can come.
   */
  async spin(k: number): Promise<void> {
    if (this.mode === 'spin' || this.mode === 'win') return
    const { box, pointer } = this.els
    const n = Math.max(1, this.slices.length)
    const s = 360 / n
    const reward = this.slices[k]?.reward ?? { kind: 'gold', amount: 0 }
    const jackpot = isJackpot(reward)
    const calm = this.calm
    const long = this.motion === 'full'
    const flick = () => {
      if (calm) return
      pointer.classList.remove('flick')
      void pointer.offsetWidth
      pointer.classList.add('flick')
    }
    this.win = null
    this.pop = null
    // 1. The wind-up: it creaks back a little, the lights speed up.
    this.mode = 'spin'
    box.dataset.phase = 'spinning'
    delete box.dataset.win
    if (!calm) {
      const t0 = performance.now()
      const r0 = this.rot
      let creaked = false
      for (;;) {
        const e = Math.min(1, (performance.now() - t0) / 420)
        this.rot = r0 - 16 * ease.outQ(e)
        if (e > 0.3 && !creaked) {
          creaked = true
          tone(180, 0.08, { type: 'square', vol: 0.03 })
        }
        if (e >= 1 || this.stopped) break
        await frame()
      }
    }
    // 2. The launch: a whoosh, then a long ease out to a third of a slice past the target, and a teeter back onto it.
    hiss(0.6, { vol: 0.07, freq: 600, slide: 2400 })
    const jitter = (Math.random() - 0.5) * s * 0.6
    const start = this.rot
    const turns = calm ? 2 : long ? 7 : 4
    const end = start - (((start % 360) + 360) % 360) + 360 * turns - (k + 0.5) * s + jitter
    const total = end - start
    const T = calm ? 600 : long ? 5600 : 2800
    let last = Math.floor(start / s)
    let prev = start
    const t0 = performance.now()
    for (;;) {
      const t = Math.min(1, (performance.now() - t0) / T)
      const over = (s * 0.33) / total
      const p = t < 0.9 ? (1 - Math.pow(1 - t / 0.9, 4)) * (1 + over) : 1 + over * (1 - ease.ioS((t - 0.9) / 0.1))
      this.rot = start + total * p
      this.vel = this.rot - prev
      prev = this.rot
      const cur = Math.floor(this.rot / s)
      if (cur !== last) {
        last = cur
        tone(1600 - 900 * t, 0.025, { vol: 0.035 })
        flick()
        // Sparks where the pointer scrapes the pegs, more at speed.
        const c = this.center()
        this.burst('spark', Math.min(6, 1 + Math.round(Math.abs(this.vel) / 3)), {
          at: { x: c.x, y: this.M + 14 * (this.S / 288) },
          dir: -Math.PI / 2,
          spread: 2.2,
          speed: 4,
          g: 0.2,
          life: 0.5,
          size: 2.5,
        })
      }
      box.style.setProperty('--spin', `${Math.min(1, Math.abs(this.vel) / 14)}`)
      if (t >= 1 || this.stopped) break
      await frame()
    }
    this.vel = 0
    this.rot = end
    box.style.setProperty('--spin', '0')
    // 3. The land: a clack, a shake, the winning slice blinks while the rest go dark.
    tone(220, 0.09, { type: 'square', vol: 0.05 })
    hiss(0.12, { vol: 0.05, freq: 1800 })
    box.dataset.phase = 'landed'
    box.dataset.win = jackpot ? 'jackpot' : 'win'
    this.mode = 'win'
    this.win = { k, t0: performance.now() }
    await wait(calm ? 100 : 750)
    // 4. The prize pops out of its slice and grows in the middle; coins and stars fly.
    const c = this.center()
    const u = this.S / 288
    this.pop = { t0: performance.now(), x: c.x, y: c.y - (this.S / 2 - 15 * u) * 0.64, reward, sprite: this.slices[k]?.sprite }
    tone(660, 0.1, { vol: 0.05, slide: 600 })
    await wait(calm ? 50 : 420)
    if (reward.kind === 'gold') this.burst('coin', 26, { speed: 7, lift: 4, g: 0.3, size: 4 })
    this.burst('star', jackpot ? 46 : 22, { speed: jackpot ? 9 : 6, g: 0.05, size: jackpot ? 5 : 4, life: 1.4 })
    if (jackpot) {
      if (!calm) this.flash = 0.9
      this.burst('coin', 40, { speed: 9, lift: 5, g: 0.32, size: 4 })
      ;[523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, { vol: 0.05, at: i * 0.1 }))
      // A shower from the top for a while.
      for (let i = 0; i < 6; i++)
        setTimeout(
          () =>
            this.burst('coin', 8, {
              at: { x: Math.random() * this.F, y: 0 },
              dir: Math.PI / 2,
              spread: 0.6,
              speed: 2,
              g: 0.3,
              size: 4,
              life: 2,
            }),
          200 * i,
        )
    } else {
      tone(880, 0.08, { vol: 0.045 })
      tone(1320, 0.18, { vol: 0.045, at: 0.08 })
    }
    await wait(calm ? 100 : jackpot ? 1700 : 1150)
    // 5. Over: the slice stays marked, the lights rest.
    this.pop = null
    this.mode = 'won'
  }
}
