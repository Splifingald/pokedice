// The title's dice logo (docs/38 §9): eight dice thrown in from past the canvas's right edge that stop exactly on their
// letters, a little crooked; the flash two frames long and never when calm, the floor ring once; the sounds in order;
// and the drawing: a flat die's top face pixel for pixel, its turned letter with every pixel kept once, nothing drawn
// outside the room the page keeps.
import { describe, expect, it } from 'vitest'
import {
  apply,
  BEATS,
  FACES,
  logoBox,
  logoCues,
  logoDice,
  logoFrame,
  LETTERS,
  project,
  restOf,
  restOn,
  SIZE,
  throwAt,
  throwOf,
  type LogoMode,
} from '@/fx/dice/logo'
import { drawDie, drawLogo, faceArt, inkOn, letterDots, topTexel } from '@/fx/dice/logoArt'
import { LOGO_BOX, LOGO_PAD, LOGO_RING_FLAT, type LogoLayout } from '@/fx/dice/logoSize'
import { PALETTE } from '@/theme/colors'

const LAYOUTS: LogoLayout[] = ['wide', 'tall']
const close = (a: readonly number[], b: readonly number[], eps = 1e-9) =>
  a.every((v, i) => Math.abs(v - b[i]!) < eps)

/** The screen box round a die's eight corners. */
function screenBox(d: { pos: readonly number[]; R: Parameters<typeof apply>[0] }) {
  const h = SIZE / 2
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity
  for (const sx of [-h, h])
    for (const sy of [-h, h])
      for (const sz of [-h, h]) {
        const c = apply(d.R, [sx, sy, sz])
        const s = project([d.pos[0]! + c[0], d.pos[1]! + c[1], d.pos[2]! + c[2]])
        x0 = Math.min(x0, s.x)
        x1 = Math.max(x1, s.x)
        y0 = Math.min(y0, s.y)
        y1 = Math.max(y1, s.y)
      }
  return { x0, x1, y0, y1 }
}

describe('the page keeps room for the logo before its chunk loads', () => {
  it('LOGO_BOX is the resting logo’s box', () => {
    for (const layout of LAYOUTS) expect(LOGO_BOX[layout]).toEqual(logoBox(layout))
  })
  it('two rows fit a 360 px phone inside its gutter; one row fits 768 px', () => {
    const w = (l: LogoLayout) => (LOGO_BOX[l].x1 - LOGO_BOX[l].x0) * 2
    expect(w('tall')).toBeLessThanOrEqual(360 - 2 * 16)
    expect(w('wide')).toBeLessThanOrEqual(768 - 2 * 16)
  })
})

describe('the throw', () => {
  for (const layout of LAYOUTS)
    it(`${layout}: every die ends exactly on its letter, flat and crooked, and stays`, () => {
      LETTERS.forEach((_, i) => {
        const th = throwOf(i, layout, 200)
        const [x, y] = restOf(i, layout)
        for (const t of [th.t1, th.t1 + 0.4, 9]) {
          const at = throwAt(th, t)
          expect(close(at.pos, [x, y, SIZE / 2], 1e-6)).toBe(true)
        }
        const at = throwAt(th, th.t1)
        // Face 0, the letter, up; turned by its yaw, and not square.
        expect(close(at.R[2], [0, 0, 1], 1e-9)).toBe(true)
        expect(close(at.R.flat(), restOn(0, Math.atan2(at.R[0][1], at.R[0][0])).flat(), 1e-9)).toBe(true)
        expect(Math.abs(Math.atan2(at.R[0][1], at.R[0][0]))).toBeGreaterThan(0.02)
      })
    })

  it('every die comes in from past the canvas’s right edge, from the player’s side, and goes left', () => {
    for (const layout of LAYOUTS)
      for (const edge of [90, 192, 320])
        LETTERS.forEach((_, i) => {
          const th = throwOf(i, layout, edge)
          const start = logoDice(th.t0, 'throw', layout, edge)[i]!
          expect(screenBox(start).x0).toBeGreaterThan(edge)
          expect(th.from[1]).toBeLessThan(th.to[1])
          expect(th.to[0]).toBeLessThan(th.from[0])
        })
  })

  it('the dice leave the hand one after another and bounce: a fall, two bounces, then a slide', () => {
    const a = throwOf(0, 'wide', 200)
    const b = throwOf(1, 'wide', 200)
    expect(b.t0).toBeGreaterThan(a.t0)
    const { landings } = throwAt(a, 0)
    expect(landings).toHaveLength(3)
    for (const t of landings) expect(throwAt(a, t).pos[2]).toBeCloseTo(SIZE / 2, 6)
    expect(throwAt(a, (landings[0]! + landings[1]!) / 2).pos[2]).toBeGreaterThan(SIZE / 2 + 10)
  })

  it('the canvas’s pads hold the flight: nothing above or below them while a die is over the canvas', () => {
    for (const layout of LAYOUTS)
      for (const edge of [90, 192]) {
        const box = LOGO_BOX[layout]
        for (let t = 0; t < 1.6; t += 1 / 60)
          for (const d of logoDice(t, 'throw', layout, edge)) {
            const s = screenBox(d)
            if (s.x0 > edge) continue
            expect(s.y0).toBeGreaterThan(box.y0 - LOGO_PAD.top)
            expect(s.y1).toBeLessThan(box.y1 + LOGO_PAD.bottom)
          }
        // The drop comes from above, inside the top pad.
        for (let t = 0; t < 1; t += 1 / 60)
          for (const d of logoDice(t, 'drop', layout))
            if (d.show) expect(screenBox(d).y0).toBeGreaterThan(box.y0 - LOGO_PAD.top)
      }
  })
})

describe('the beats', () => {
  it('full: the flash is two frames at 1.5 s, the gold rings stay, the floor ring spreads once', () => {
    const at = (t: number) => logoFrame(t, 'throw', 'tall', 120)
    expect(at(1.49).dice.some((d) => d.flash || d.ring)).toBe(false)
    expect(at(1.5).dice.every((d) => d.flash && d.ring)).toBe(true)
    expect(at(1.5 + 1 / 60).dice.every((d) => d.flash)).toBe(true)
    expect(at(1.5 + 2 / 60).dice.some((d) => d.flash)).toBe(false)
    expect(at(5).dice.every((d) => d.ring && !d.flash)).toBe(true)
    expect(at(1.49).ring).toBeNull()
    const r1 = at(1.6).ring!
    const r2 = at(2.0).ring!
    expect(r2.r).toBeGreaterThan(r1.r)
    expect(r2.density).toBeLessThan(r1.density)
    expect(at(2.1).ring).toBeNull()
    expect(at(9).ring).toBeNull()
  })

  it('calm and off: no flash and no floor ring, ever; the gold rings once formed', () => {
    for (const mode of ['calm', 'rest'] as LogoMode[])
      for (let t = 0; t < 3; t += 1 / 60) {
        const f = logoFrame(t, mode, 'tall')
        expect(f.dice.some((d) => d.flash)).toBe(false)
        expect(f.ring).toBeNull()
      }
    expect(logoFrame(0, 'rest', 'tall').done).toBe(true)
    expect(logoFrame(0, 'rest', 'tall').dice.every((d) => d.ring)).toBe(true)
    expect(logoFrame(0, 'rest', 'tall').tagline).toBe(1)
    expect(logoFrame(0, 'calm', 'tall').dice).toHaveLength(1)
  })

  it('the tagline comes in four steps, after the landing; the last frame is the logo at rest', () => {
    for (const mode of ['throw', 'drop', 'calm'] as LogoMode[]) {
      const b = BEATS[mode]
      const seen = new Set<number>()
      for (let t = 0; t <= b.end + 0.5; t += 1 / 120) seen.add(logoFrame(t, mode, 'wide').tagline)
      expect([...seen].every((a) => [0, 0.25, 0.5, 0.75, 1].includes(a))).toBe(true)
      expect(logoFrame(b.combo - 0.01, mode, 'wide').tagline).toBe(0)
      const last = logoFrame(b.end, mode, 'wide')
      expect(last.done).toBe(true)
      expect(last.dice).toHaveLength(8)
      const rest = logoFrame(0, 'rest', 'wide')
      last.dice.forEach((d, i) => {
        expect(close(d.pos, rest.dice[i]!.pos, 1e-6)).toBe(true)
        expect(close(d.R.flat(), rest.dice[i]!.R.flat(), 1e-6)).toBe(true)
      })
    }
  })

  it('the sounds: a rattle, a click on each die’s first two contacts, a chime; calm only the chime; off none', () => {
    const full = logoCues('throw')
    expect(full[0]!.cue).toBe('rattle')
    expect(full.filter((c) => c.cue === 'land')).toHaveLength(16)
    expect(full.at(-1)).toEqual({ t: BEATS.throw.combo, cue: 'chime' })
    expect([...full].sort((a, b) => a.t - b.t)).toEqual(full)
    expect(logoCues('drop').filter((c) => c.cue === 'land')).toHaveLength(8)
    expect(logoCues('calm')).toEqual([{ t: BEATS.calm.combo, cue: 'chime' }])
    expect(logoCues('rest')).toEqual([])
  })
})

describe('the drawing', () => {
  const frame = (w: number, h: number) => ({ buf: new Uint32Array(w * h), w, h })
  const px = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0
  }

  it('the letters: the game’s 5×7 font at three pixels a dot; É keeps its accent; white letters on dark dice', () => {
    const e = letterDots('E', 28)
    const é = letterDots('É', 28)
    expect(e.k).toBe(3)
    expect(é.dots.length).toBe(e.dots.length + 2)
    const top = Math.min(...é.dots.slice(0, -2).map(([, y]) => y))
    expect(é.dots.slice(-2).every(([, y]) => y + 3 <= top)).toBe(true)
    expect(inkOn('#6f35fc')).toBe('#ffffff')
    expect(inkOn('#f7d02c')).toBe(PALETTE.ink)
  })

  it('a die lying flat shows its top face pixel for pixel', () => {
    const fb = frame(60, 60)
    const d = {
      pos: [0, 0, SIZE / 2] as const,
      R: restOn(0, 0),
      fill: '#ee8130',
      faces: ['P', 6, 3, 4, 2, 5],
      size: SIZE,
      show: true,
    }
    drawDie(fb, 30, 40, d)
    const art = faceArt('#ee8130', 'P', SIZE)
    const c = project([0, 0, SIZE])
    const x0 = 30 + c.x - SIZE / 2
    const y0 = 40 + c.y - SIZE / 2
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) expect(fb.buf[(y0 + y) * fb.w + x0 + x]).toBe(art[y * SIZE + x])
  })

  it('a turned top face keeps every pixel of its art exactly once (Paeth’s three shears)', () => {
    for (const yaw of [0.08, -0.05, 0.1, -0.1]) {
      const t = { x: 0, y: 0, sx: -Math.tan(yaw / 2), sy: Math.sin(yaw) }
      const seen = new Uint8Array(SIZE * SIZE)
      for (let y = -24; y < 24; y++)
        for (let x = -24; x < 24; x++) {
          const i = topTexel(t, x + 0.5, y + 0.5, SIZE)
          if (i >= 0) seen[i]!++
        }
      expect(seen.every((n) => n === 1)).toBe(true)
    }
  })

  it('the resting logo stays in its box (shadows aside), ringed in gold, and the floor ring inside the canvas', () => {
    const shadow = ((Math.round(0.42 * 255) << 24) | (79 << 16) | (48 << 8) | 36) >>> 0
    for (const layout of LAYOUTS) {
      const box = LOGO_BOX[layout]
      const W = box.x1 - box.x0 + 40
      const H = LOGO_PAD.top + (box.y1 - box.y0) + LOGO_PAD.bottom
      const ox = 20 - box.x0
      const oy = LOGO_PAD.top - box.y0
      const fb = frame(W, H)
      drawLogo(fb, logoFrame(0, 'rest', layout), ox, oy)
      let gold = 0
      const outside: string[] = []
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const c = fb.buf[y * W + x]!
          if (!c || c === shadow) continue
          if (c === px(PALETTE.gold)) gold++
          const [bx, by] = [x - ox, y - oy]
          if (bx < box.x0 || bx >= box.x1 || by < box.y0 || by >= box.y1) outside.push(`${bx},${by}`)
        }
      expect(outside).toEqual([])
      expect(gold).toBeGreaterThan(8 * 50)
      // The widest ring, three pixels thick, still lies inside the canvas above and below.
      const ry = 300 * LOGO_RING_FLAT[layout] + 3
      expect(oy - ry).toBeGreaterThan(0)
      expect(oy + ry).toBeLessThan(H)
    }
  })

  it('a face’s art: the type colour, the ink edge, the letter on top and pips on the others', () => {
    const art = faceArt('#7ac74c', 'K', SIZE)
    expect(art[0]).toBe(px(PALETTE.ink))
    expect(art[SIZE * SIZE - 1]).toBe(px(PALETTE.ink))
    expect(art[14 * SIZE + 3]).toBe(px('#7ac74c'))
    expect([...faceArt('#7ac74c', 5, SIZE)].filter((c) => c === px(PALETTE.ink)).length).toBeGreaterThan(
      [...faceArt('#7ac74c', 1, SIZE)].filter((c) => c === px(PALETTE.ink)).length,
    )
    expect(FACES[0]!.n).toEqual([0, 0, 1])
  })
})
