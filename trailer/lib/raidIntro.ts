// The raid's opening (src/screens/events/RaidIntro.tsx) redrawn for the trailer: the same beats on a landscape 320×180
// stage, stepped on the trailer's clock with seeded randomness instead of the screen's timers. The alarm and its
// hazard tapes, the storm with lightning, the silhouette rising with a glowing outline, the pillar of light, the
// white-out reveal with shockwaves and embers, the name slamming down as the HP bars fill.
import { bolt, canvas, disc, ease, polyline, rng, text, textWidth } from '@/fx/pixel'
import { silhouette, spriteFrame } from '@/fx/sprites'
import { hiss, tone } from '@/audio/sfx'
import { playWith } from './audio'

export const RW = 320
export const RH = 180
const FEET = 150

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  age: number
  c: string
  s: number
}

export class RaidIntroScene {
  readonly cv = canvas(RW, RH)
  private parts: Particle[] = []
  private burst = false
  private last = -1
  private readonly r
  private readonly bolts
  private readonly clouds

  constructor(
    private readonly key: string,
    private readonly name: string,
    seed = 11,
  ) {
    this.r = rng(seed)
    const r = rng(seed + 1)
    this.bolts = [1.15, 1.5, 1.85, 2.2].map((at) => {
      const x0 = 30 + r() * 260
      return { at, pts: bolt(r, x0, -4, x0 + (r() - 0.5) * 90, 110 + r() * 60, 0.3, 5) }
    })
    this.clouds = Array.from({ length: 11 }, (_, i) => ({
      x: r() * 380,
      y: 10 + r() * 90,
      w: 60 + r() * 90,
      h: 12 + r() * 16,
      v: 6 + r() * 14,
      d: i % 3,
    }))
  }

  /** The intro's sounds between two of its times (the game's, at the same moments). */
  private sounds(a: number, b: number) {
    const at = (T: number, fn: () => void) => a < T && b >= T && playWith(fn)
    at(0.08, () => {
      tone(660, 0.18, { type: 'square', vol: 0.05 })
      tone(880, 0.18, { type: 'square', vol: 0.05, at: 0.2 })
      tone(660, 0.18, { type: 'square', vol: 0.05, at: 0.42 })
      tone(880, 0.18, { type: 'square', vol: 0.05, at: 0.62 })
    })
    at(1.05, () => hiss(1.6, { vol: 0.06, freq: 120, type: 'lowpass' }))
    for (const bo of this.bolts) at(bo.at, () => hiss(0.35, { vol: 0.09, freq: 2600, slide: -2300 }))
    at(2.35, () => hiss(0.45, { vol: 0.07, freq: 400, slide: 3000 }))
    at(2.75, () => {
      tone(55, 0.7, { type: 'sawtooth', vol: 0.08, slide: -20 })
      hiss(0.6, { vol: 0.1, freq: 300 })
    })
    at(3.25, () => hiss(0.18, { vol: 0.09, freq: 160 }))
    for (let i = 0; i < 5; i++) at(3.65 + i * 0.25, () => tone(1320 + i * 220, 0.12, { vol: 0.045 }))
  }

  /** Draw the scene at its time T (seconds), stepping its particles from the last call. */
  draw(T: number, audible = true) {
    if (T < this.last) {
      this.parts = []
      this.burst = false
      this.last = -1
    }
    if (audible) this.sounds(this.last, T)
    const steps = this.last < 0 ? 0 : Math.round((T - this.last) * 60)
    this.last = T
    const g = this.cv.g
    const r = this.r
    const full = spriteFrame(this.key)
    const sil = silhouette(this.key, '#0b0e1e')
    const glow = silhouette(this.key, '#ffbe2e')
    const K = 1.5
    const sw = Math.round((full?.width ?? 64) * K)
    const sh = Math.round((full?.height ?? 64) * K)
    const shake = T > 2.75 && T < 3.25 ? Math.round(Math.sin(T * 97) * 4 * (3.25 - T) * 2) : 0
    g.save()
    g.translate(shake, Math.round(shake / 2))
    if (T < 1) {
      g.fillStyle = '#05060d'
      g.fillRect(-10, -10, RW + 20, RH + 20)
      g.fillStyle = `rgba(242,85,63,${0.18 + 0.18 * Math.max(0, Math.sin(T * 14))})`
      g.fillRect(-10, -10, RW + 20, RH + 20)
    } else {
      const sky = g.createLinearGradient(0, 0, 0, RH)
      sky.addColorStop(0, '#120a22')
      sky.addColorStop(0.55, '#3a1030')
      sky.addColorStop(1, '#170a1a')
      g.fillStyle = sky
      g.fillRect(-10, -10, RW + 20, RH + 20)
      for (const c of this.clouds) {
        const x = ((c.x - T * c.v) % 420) - 50
        g.fillStyle = ['rgba(8,6,18,0.7)', 'rgba(40,18,52,0.6)', 'rgba(90,40,80,0.35)'][c.d]!
        g.beginPath()
        g.ellipse(Math.round(x), Math.round(c.y), Math.round(c.w / 2), Math.round(c.h / 2), 0, 0, Math.PI * 2)
        g.fill()
      }
      for (const b of this.bolts) {
        const e = T - b.at
        if (e < 0 || e > 0.16) continue
        g.fillStyle = `rgba(220,200,255,${0.5 * (1 - e / 0.16)})`
        g.fillRect(-10, -10, RW + 20, RH + 20)
        polyline(g, b.pts.map(([x, y]) => [Math.round(x) + 1, Math.round(y)] as [number, number]), '#9a6bff', 3)
        polyline(g, b.pts.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]), '#ffffff', 1)
      }
      g.fillStyle = '#0b0710'
      g.beginPath()
      g.ellipse(RW / 2, FEET + 30, 190, 40, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#24142c'
      g.fillRect(-10, FEET + 2, RW + 20, 2)
    }
    if (T >= 1.3 && T < 2.75 && sil && glow) {
      const e = Math.min(1, (T - 1.3) / 1.0)
      const y = FEET - sh + Math.round((1 - ease.outQ(e)) * 140)
      const x = Math.round(RW / 2 - sw / 2)
      g.globalAlpha = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(T * 10))
      for (const [ox, oy] of [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ] as const)
        g.drawImage(glow, x + ox, y + oy, sw, sh)
      g.globalAlpha = 1
      g.drawImage(sil, x, y, sw, sh)
    }
    if (T >= 2.35 && T < 3.0) {
      const e = Math.min(1, (T - 2.35) / 0.4)
      const w = Math.round(4 + 86 * ease.inQ(e))
      const a = T < 2.75 ? 1 : 1 - (T - 2.75) / 0.25
      const gr = g.createLinearGradient(RW / 2 - w / 2, 0, RW / 2 + w / 2, 0)
      gr.addColorStop(0, 'rgba(255,190,46,0)')
      gr.addColorStop(0.3, `rgba(255,220,120,${0.7 * a})`)
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`)
      gr.addColorStop(0.7, `rgba(255,220,120,${0.7 * a})`)
      gr.addColorStop(1, 'rgba(255,190,46,0)')
      g.fillStyle = gr
      g.fillRect(RW / 2 - w / 2, -10, w, FEET + 14)
    }
    if (T >= 2.75 && full) {
      const bob = Math.round(Math.sin(T * 3) * 2)
      const ar = 52 + Math.sin(T * 5) * 4
      disc(g, RW / 2, FEET - 52, Math.round(ar), 'rgba(255,190,46,0.18)')
      disc(g, RW / 2, FEET - 52, Math.round(ar - 16), 'rgba(255,230,160,0.16)')
      const k = T < 2.95 ? 1 + 0.25 * (1 - (T - 2.75) / 0.2) : 1
      const w = Math.round(sw * k)
      const h = Math.round(sh * k)
      g.drawImage(full, Math.round(RW / 2 - w / 2), FEET - h + bob, w, h)
      for (let i = 0; i < 3; i++) {
        const e = (T - 2.75 - i * 0.14) / 0.7
        if (e < 0 || e > 1) continue
        g.strokeStyle = i === 1 ? `rgba(255,190,46,${1 - e})` : `rgba(255,255,255,${1 - e})`
        g.lineWidth = 3 - 2 * e
        g.beginPath()
        g.ellipse(RW / 2, FEET, 10 + 220 * e, 4 + 40 * e, 0, 0, Math.PI * 2)
        g.stroke()
      }
      if (!this.burst) {
        this.burst = true
        for (let i = 0; i < 80; i++) {
          const a = r() * Math.PI * 2
          const v = 1 + r() * 4
          this.parts.push({
            x: RW / 2,
            y: FEET - 50,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 1.5,
            g: 0.09,
            life: 1.4,
            age: 0,
            c: ['#ffffff', '#ffe066', '#ffbe2e', '#c58aff'][i % 4]!,
            s: 1 + (i % 3),
          })
        }
      }
      for (let k2 = 0; k2 < steps; k2++)
        if (r() < 0.6)
          this.parts.push({ x: 40 + r() * 240, y: FEET + 6, vx: (r() - 0.5) * 0.4, vy: -0.6 - r() * 0.8, g: 0, life: 2, age: 0, c: '#ff9a5a', s: 1 })
    }
    for (let k2 = 0; k2 < steps; k2++)
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i]!
        p.age += 1 / 60
        if (p.age > p.life) {
          this.parts.splice(i, 1)
          continue
        }
        p.vy += p.g
        p.x += p.vx
        p.y += p.vy
      }
    for (const p of this.parts) {
      g.globalAlpha = Math.min(1, (p.life - p.age) * 2)
      g.fillStyle = p.c
      g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s)
    }
    g.globalAlpha = 1
    g.restore()
    if (T >= 2.7 && T < 3.05) {
      g.fillStyle = `rgba(255,255,255,${1 - (T - 2.7) / 0.35})`
      g.fillRect(0, 0, RW, RH)
    }
    this.words(T)
    return this.cv
  }

  /** The tapes in the alarm, then the name and the bars, in the game's bitmap font. */
  private words(T: number) {
    const g = this.cv.g
    if (T < 1.05) {
      const inP = ease.outC(Math.min(1, T / 0.3))
      const outP = T > 0.9 ? (T - 0.9) / 0.15 : 0
      tape(g, 50, -1, inP, outP, 'WARNING - RAID BATTLE', T)
      tape(g, 118, 1, inP, outP, 'A POWERFUL POKEMON APPEARS', T)
    }
    if (T >= 3.25) {
      const p = Math.min(1, (T - 3.25) / 0.2)
      const s = Math.max(3, Math.round(6 - 3 * ease.outBack(p, 1.6)))
      const w = textWidth(this.name, s)
      text(g, 'RAID BATTLE', RW / 2 - textWidth('RAID BATTLE', 1) / 2, 10, '#ffbe2e', '#24304f', 1)
      text(g, this.name, RW / 2 - w / 2, 22, '#fbfdff', '#24304f', s, '#c4382a')
      for (let i = 0; i < 5; i++) {
        const f = Math.max(0, Math.min(1, (T - 3.6 - i * 0.25) / 0.24))
        const bx = RW / 2 - (5 * 30 - 4) / 2 + i * 30
        g.fillStyle = '#fbfdff'
        g.fillRect(bx - 1, 49, 28, 7)
        g.fillStyle = '#24304f'
        g.fillRect(bx, 50, 26, 5)
        g.fillStyle = ['#34c97a', '#34c97a', '#ffbe2e', '#ffbe2e', '#ff5a4a'][i]!
        g.fillRect(bx + 1, 51, Math.round(24 * f), 3)
      }
    }
  }
}

function tape(g: CanvasRenderingContext2D, y: number, dir: number, inP: number, outP: number, words: string, T: number) {
  const off = Math.round(dir * (1 - inP) * -400 + dir * outP * 400)
  g.save()
  g.translate(RW / 2 + off, y)
  g.rotate(-0.12)
  g.fillStyle = '#24304f'
  g.fillRect(-260, -11, 520, 22)
  // Hazard stripes, scrolling.
  g.beginPath()
  g.rect(-258, -9, 516, 18)
  g.clip()
  g.fillStyle = '#ffbe2e'
  const shift = Math.round((T * 60 * dir) % 16)
  for (let x = -280; x < 280; x += 16) {
    g.beginPath()
    g.moveTo(x + shift, -9)
    g.lineTo(x + 8 + shift, -9)
    g.lineTo(x + shift, 9)
    g.lineTo(x - 8 + shift, 9)
    g.closePath()
    g.fill()
  }
  const w = textWidth(words, 1)
  g.fillStyle = '#24304f'
  g.fillRect(-w / 2 - 5, -7, w + 10, 14)
  g.fillStyle = '#ffbe2e'
  g.fillRect(-w / 2 - 5, -7, w + 10, 1)
  g.fillRect(-w / 2 - 5, 6, w + 10, 1)
  text(g, words, -w / 2, -3, '#ffe7a8', null, 1)
  g.restore()
}
