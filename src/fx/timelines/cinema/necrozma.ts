// Necrozma's raid entrance (docs/53): Ultra Megalopolis. A city of thin towers in the dark of Ultra Space, every window
// lit, the Megalo Tower in its middle crowned with a great light: the light the city lives on. A black shape appears in
// that light and starts to eat it; the light streams into it, the orb shrinks, and the city goes dark from its edges in,
// window by window, its last light pulled up off the streets. Black prisms grow round the dark core and each splits a
// beam of light into a rainbow across the sky. The core drops onto the tower's landing pad with its prisms closing on
// it, cracks of light open in it, and the Photon Geyser bursts upward: a pillar of light through the whole sky. The
// reveal; the city's lights come back on round it.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  lerp,
  line,
  Particles,
  pattern,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { hash2, raysCanvas, revealLight } from './alolaKit'
import { AFTER_REVEAL, dGradient, inOrder, tri, type Cinema, type CinemaParams } from './kit'

const T_EAT = 0.95
const T_DRAIN = 1.25
const T_PRISMS = 2.25
const T_DROP = 3.25
const T_CRACKS = 3.5
const T_GEYSER = 3.8
const REVEAL = 4.65
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#fff3a0', '#ffd23a', '#3a2a5a'] as const
const SPEC = ['#ff4a4a', '#ff9a2a', '#ffe23a', '#5ad85a', '#3a9aff', '#9a5aff'] as const

type Prism = { a: number; d: number; len: number; wd: number; t0: number; beam: number }

type S = {
  r: Rng
  fx: Particles
  lit: Canvas
  dark: Canvas
  deck: Canvas
  deckDark: Canvas
  core: Canvas
  rays: Canvas
  prisms: Prism[]
  shakes: [number, number, number][]
}

export const necrozmaCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const m = Math.min(w, h)
    const feet = Math.round(h * 0.62)
    const deckY = feet - 2
    const orb = { x: cx, y: Math.round(h * 0.3) }
    const sz = spriteSize(p.mon)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const coreR = Math.round(m * 0.16)
    /** Where the dark core is: in the orb, then dropping onto the pad. */
    const coreAt = (t: number) => ({
      x: cx,
      y: Math.round(lerp(orb.y, feet - sz.h * 0.5, ease.inQ(span(t, T_DROP, T_DROP + 0.3)))),
    })
    /** How dark the city is, as a reach from its edges in (0 lit, 1 all dark), then back on after the reveal. */
    const reach = (t: number) =>
      ease.inQ(span(t, T_DRAIN, T_DRAIN + 1.1)) * (1 - ease.outQ(span(t, REVEAL + 0.4, REVEAL + 1.6)))
    return {
      id: 'cinema-necrozma',
      dur: DUR,
      setup() {
        const r = rng(800)
        const { lit, dark } = city(w, h, deckY, r)
        const deck = pad(w, h, deckY, true)
        const deckDark = pad(w, h, deckY, false)
        return {
          r,
          fx: new Particles(),
          lit,
          dark,
          deck,
          deckDark,
          core: coreArt(coreR * 2 + 4, r),
          rays: raysCanvas(w, h),
          prisms: Array.from({ length: 6 }, (_, i) => ({
            a: (i / 6) * Math.PI * 2 + 0.3,
            d: m * r.range(0.26, 0.34),
            len: Math.round(m * r.range(0.09, 0.13)),
            wd: Math.round(m * r.range(0.025, 0.04) + 2),
            t0: T_PRISMS + i * 0.14,
            beam: (i / 6) * Math.PI * 2 + r.range(-0.4, 0.4),
          })),
          shakes: p.short
            ? []
            : [
                [T_DROP + 0.3, 0.35, 3],
                [T_GEYSER, 0.85, 4],
                [REVEAL, 0.6, 3],
              ],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        // The city's light pulled up off its streets into the dark core.
        if (t > T_EAT && t < T_DROP && r() < 1.6 * many) {
          const c = coreAt(t)
          const side = r() < 0.5 ? -1 : 1
          const x = cx + side * r.range(0.1, 0.5) * w
          s.fx.add({
            x,
            y: r.range(h * 0.35, deckY),
            vy: -r.range(10, 40),
            home: { x: c.x, y: c.y, k: 320 },
            life: 2,
            size: 1,
            shape: r() < 0.3 ? 'star' : 'px',
            colors: ['#ffffff', '#fff3a0', '#ffd23a'],
          })
        }
        // The geyser throws light upward the whole time it stands.
        if (t > T_GEYSER && t < REVEAL && r() < 2 * many)
          for (let i = 0; i < 2; i++)
            s.fx.add({
              x: cx + r.range(-m * 0.12, m * 0.12),
              y: deckY - r.range(0, 20),
              vy: -r.range(200, 360),
              life: 0.8,
              size: 1,
              shape: 'streak',
              trail: 0.03,
              colors: ['#ffffff', '#fff3a0', SPEC[r.int(0, 5)]!],
            })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 190)
            s.fx.add({
              x: cx,
              y: feet - sz.h / 2,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.5, 1.1),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'star' : 'sq',
              colors: [SPEC[k % 6]!, '#ffffff'],
            })
          }
        if (t > REVEAL + 0.4 && r() < 0.3 * many)
          s.fx.add({
            x: cx + r.range(-sz.w * 0.5, sz.w * 0.5),
            y: feet - r.range(0, sz.h),
            vy: -r.range(6, 16),
            life: 1.2,
            size: 1,
            shape: 'px',
            colors: [SPEC[r.int(0, 5)]!, '#ffffff'],
          })
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#000000'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        // The city, going dark from both edges in: the dark picture laid over the lit one.
        const k = reach(t)
        g.drawImage(s.lit, 0, 0)
        g.drawImage(s.deck, 0, deckY)
        if (k > 0) {
          const xl = Math.round(k * (w / 2 + 2))
          g.drawImage(s.dark, 0, 0, xl, h, 0, 0, xl, h)
          g.drawImage(s.dark, w - xl, 0, xl, h, w - xl, 0, xl, h)
          g.drawImage(s.deckDark, 0, 0, xl, h - deckY, 0, deckY, xl, h - deckY)
          g.drawImage(s.deckDark, w - xl, 0, xl, h - deckY, w - xl, deckY, xl, h - deckY)
          if (xl < w / 2) {
            // The edge of the dark: a line of windows flickering as they go.
            for (const x of [xl, w - xl - 1])
              for (let y = Math.round(h * 0.2); y < deckY; y += 3)
                if (hash2(x, y + Math.floor(t * 20)) > 0.7) rect(g, x, y, 1, 1, '#fff3a0')
          }
        }
        // The sky dims as the light goes, and lifts again after.
        wash(g, '#000002', 0.35 * k, 8)
        drawOrb(g, t)
        // The prisms round the core, their beams split into rainbows.
        const c = coreAt(t)
        drawPrisms(g, s, t, c)
        // The core: black crystal, growing as it eats; cracks of light; then the geyser.
        if (t > T_EAT && t < REVEAL) {
          const q = ease.outC(span(t, T_EAT, T_PRISMS))
          const sc = lerp(0.15, 1, q) * (t > T_DROP ? lerp(1, 0.7, span(t, T_DROP, T_DROP + 0.3)) : 1)
          const cw = Math.max(2, Math.round(s.core.width * sc))
          const jitter = t > T_CRACKS ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0
          // Its light behind it once it cracks, so the black crystal stays black in front.
          if (t > T_CRACKS) {
            const gr = Math.round(coreR * sc * (1.2 + span(t, T_CRACKS, T_GEYSER)))
            g.drawImage(glow(gr, '#fff3a0', 1.4, 0.7), c.x - gr, c.y - gr)
          }
          g.drawImage(s.core, c.x - (cw >> 1) + jitter, c.y - (cw >> 1), cw, cw)
          if (t > T_CRACKS) drawCracks(g, t, c.x + jitter, c.y, Math.round(coreR * sc))
        }
        if (t > T_GEYSER - 0.05 && t < REVEAL + 0.6) drawGeyser(g, t, cx, deckY, m)
        if (t >= REVEAL) {
          revealLight(g, s.rays, t, REVEAL, { x: cx, y: feet - sz.h / 2 }, AURA, Math.max(w, h) * 0.8)
          drawSprite(g, p.mon, cx, feet + Math.round(Math.sin((t - REVEAL) * 2) * 1.5), {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: SPEC[Math.floor(t * 10) % 6],
          })
        }
        s.fx.draw(g)
        g.restore()
        if (within(t, T_GEYSER, T_GEYSER + 0.2))
          screenFlash(g, '#fff8d0', 0.6 * (1 - span(t, T_GEYSER, T_GEYSER + 0.2)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        if (t < 0.45) wash(g, '#000000', 1 - span(t, 0, 0.45), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => tone(82, 2.0, { type: 'sawtooth', vol: 0.02 }))],
          [0.1, quiet(() => hiss(1.2, { freq: 900, type: 'lowpass', vol: 0.03 }))],
          [T_EAT, quiet(() => tone(880, 1.4, { type: 'sine', vol: 0.03, slide: -700 }))],
          [T_EAT + 0.1, quiet(() => hiss(1.4, { freq: 3000, slide: -2600, vol: 0.05 }))],
          [T_DRAIN + 0.3, quiet(() => fxSound('legend.pulse'))],
          [T_DRAIN + 0.9, quiet(() => fxSound('legend.pulse'))],
          ...[0, 1, 2, 3, 4, 5].map(
            (i) =>
              [
                T_PRISMS + i * 0.14,
                quiet(() => tone(1568 + i * 196, 0.25, { type: 'triangle', vol: 0.025, slide: 300 })),
              ] as const,
          ),
          [T_DROP + 0.3, quiet(() => fxSound('impact.hit'))],
          [T_CRACKS, quiet(() => fxSound('legend.heart'))],
          [T_CRACKS + 0.18, quiet(() => fxSound('legend.heart'))],
          [T_CRACKS + 0.05, quiet(() => tone(220, 0.3, { type: 'square', vol: 0.03, slide: 660 }))],
          [T_GEYSER, quiet(() => (fxSound('mega.beam'), hiss(1.2, { freq: 600, slide: 3000, vol: 0.12 })))],
          [T_GEYSER + 0.02, quiet(() => tone(110, 0.9, { type: 'sawtooth', vol: 0.05, slide: 220 }))],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
          [REVEAL + 0.5, quiet(() => tone(1047, 0.6, { type: 'sine', vol: 0.02, slide: 523 }))],
        ] satisfies Cue<S>[]),
    }

    /** The great light on the tower's crown, shrinking as the core eats it, its streams pulled in. */
    function drawOrb(g: G, t: number) {
      const eat = span(t, T_EAT, T_PRISMS + 0.2)
      if (eat >= 1) return
      const R = Math.round(m * 0.13 * (1 - ease.inQ(eat)))
      if (R < 1) return
      // Two glows: a wide thin one, a tight dense one, so it blazes without a big dotted disc.
      const gr = Math.round(R * 2)
      g.drawImage(glow(gr, '#c8a040', 2.2, 0.6), orb.x - gr, orb.y - gr)
      const gi = Math.round(R * 1.4)
      g.drawImage(glow(gi, '#fff3a0', 1.6, 0.9), orb.x - gi, orb.y - gi)
      ellipse(g, orb.x, orb.y, R, R, '#fff8e0')
      ellipse(g, orb.x, orb.y, Math.max(1, R - 2), Math.max(1, R - 2), '#ffffff')
      // Its rays turning, until the dark takes it.
      if (eat < 0.6)
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + t * 0.4
          const l0 = R + 3
          const l1 = R + 6 + ((i * 7) % 5) * 3
          line(
            g,
            orb.x + Math.cos(a) * l0,
            orb.y + Math.sin(a) * l0,
            orb.x + Math.cos(a) * l1,
            orb.y + Math.sin(a) * l1,
            '#fff3a0',
          )
        }
    }

    /** Six black prisms appearing round the core one by one, each splitting a beam into a rainbow. */
    function drawPrisms(g: G, s: S, t: number, c: { x: number; y: number }) {
      if (t < T_PRISMS || t > T_DROP + 0.35) return
      const close = ease.inQ(span(t, T_DROP, T_DROP + 0.3))
      for (const pr of s.prisms) {
        const q = ease.outBack(span(t, pr.t0, pr.t0 + 0.2))
        if (q <= 0) continue
        const a = pr.a + (t - T_PRISMS) * 0.5
        const d = pr.d * (1 - close)
        const px = c.x + Math.cos(a) * d
        const py = c.y + Math.sin(a) * d * 0.8
        // The beam out of it: six bands, fanning slightly, flickering.
        if (close < 0.3 && t > pr.t0 + 0.1) {
          const ba = pr.beam + Math.sin(t * 2 + pr.a) * 0.15
          const len = Math.max(w, h)
          SPEC.forEach((col, i) => {
            if (Math.floor(t * 30 + i) % 7 === 0) return
            const spread = (i - 2.5) * 0.012
            const ex = px + Math.cos(ba + spread) * len
            const ey = py + Math.sin(ba + spread) * len
            const ox = -Math.sin(ba) * (i - 2.5)
            const oy = Math.cos(ba) * (i - 2.5)
            line(g, px + ox, py + oy, ex + ox, ey + oy, col)
          })
        }
        // The prism: a tall black crystal, lit edges in the spectrum.
        const L2 = Math.round(pr.len * q)
        const W2 = Math.round(pr.wd * q)
        const ux = Math.cos(a + 1.2)
        const uy = Math.sin(a + 1.2)
        const tx = px + ux * L2
        const ty = py + uy * L2
        const bx = px - ux * L2
        const by = py - uy * L2
        const nx = -uy * W2
        const ny = ux * W2
        tri(g, tx, ty, px + nx, py + ny, bx, by, '#0a0814')
        tri(g, tx, ty, px - nx, py - ny, bx, by, '#1a1430')
        line(g, tx, ty, px + nx, py + ny, SPEC[Math.floor(t * 8 + pr.a * 3) % 6]!)
        line(g, px - nx, py - ny, bx, by, '#ffffff')
      }
    }
  },
}

/** The city, lit and dark: far towers in layers, the Megalo Tower in the middle, every window in the lit one. */
function city(w: number, h: number, deckY: number, r: Rng) {
  const lit = canvas(w, h)
  const dark = canvas(w, h)
  for (const cv of [lit, dark])
    cv.g.drawImage(dGradient(w, deckY + 2, ['#02020a', '#05071a', '#0a0e28', '#141a3a']), 0, 0)
  // A faint glow over the city from its own lights (the lit one only).
  for (let y = Math.round(deckY * 0.6); y < deckY; y += 2)
    for (let x = (y * 3) % 4; x < w; x += 4) rect(lit.g, x, y, 1, 1, '#1a2450')
  const cx = Math.round(w / 2)
  const layers = [
    { n: Math.round(w / 9), top: [0.3, 0.55], bw: [6, 12], body: '#0a0c1c', win: ['#3a4a8a', '#2a3a6a'] },
    {
      n: Math.round(w / 12),
      top: [0.4, 0.7],
      bw: [8, 16],
      body: '#080a16',
      win: ['#8ab0ff', '#5a7ad0', '#fff3a0'],
    },
    {
      n: Math.round(w / 16),
      top: [0.55, 0.82],
      bw: [10, 20],
      body: '#05060e',
      win: ['#ffffff', '#8af0ff', '#fff3a0', '#ff8ae0'],
    },
  ]
  for (const L of layers)
    for (let i = 0; i < L.n; i++) {
      const bw = r.int(L.bw[0]!, L.bw[1]!)
      const x = Math.round(r.range(-6, w + 6) - bw / 2)
      // Leave the middle for the tower.
      if (Math.abs(x + bw / 2 - cx) < w * 0.06) continue
      const top = Math.round(
        deckY - (deckY - h * 0.12) * r.range(L.top[0]!, L.top[1]!) * (1 - Math.abs(x - cx) / w),
      )
      for (const cv of [lit, dark]) {
        rect(cv.g, x, top, bw, deckY - top, L.body)
        rect(cv.g, x, top, 1, deckY - top, '#14183a')
        if (r() < 0.4) rect(cv.g, x + (bw >> 1), top - 5, 1, 5, L.body)
      }
      if (r() < 0.4) rect(dark.g, x + (bw >> 1), top - 5, 1, 1, '#ff3a3a')
      for (let y = top + 2; y < deckY - 1; y += 3)
        for (let xx = x + 2; xx < x + bw - 1; xx += 2)
          if (hash2(xx, y) > 0.45) rect(lit.g, xx, y, 1, 1, L.win[Math.floor(hash2(y, xx) * L.win.length)]!)
    }
  // The Megalo Tower: tall and tapering, its ribs lit, a crown ring at its top where the light sits.
  const top = Math.round(h * 0.3) + Math.round(Math.min(w, h) * 0.13) + 2
  for (let y = top; y < deckY; y++) {
    const q = (y - top) / (deckY - top)
    const half = Math.round(lerp(4, Math.min(w, h) * 0.11, q * q))
    for (const cv of [lit, dark]) {
      rect(cv.g, cx - half, y, half * 2, 1, '#0c0e22')
      rect(cv.g, cx - half, y, 1, 1, '#2a3060')
    }
    if (y % 4 === 0) {
      rect(lit.g, cx - half + 2, y, half * 2 - 4, 1, '#3a5aa8')
      rect(lit.g, cx - 1, y, 2, 1, '#ffffff')
    }
  }
  for (const cv of [lit, dark]) {
    ellipseLine(cv.g, cx, top - 2, 10, 3, '#2a3060')
    rect(cv.g, cx - 1, top - 6, 2, 6, '#2a3060')
  }
  return { lit, dark }
}

/** The tower's landing pad in perspective: a dark deck, guide lines and a ring, glowing (or not). */
function pad(w: number, h: number, deckY: number, on: boolean): Canvas {
  const H = h - deckY
  const cv = canvas(w, H)
  const g = cv.g
  g.drawImage(dGradient(w, H, ['#14182e', '#0c0f20', '#06070f']), 0, 0)
  const cx = w / 2
  const lc = on ? '#3ac8ff' : '#141c34'
  rect(g, 0, 0, w, 1, on ? '#8af0ff' : '#2a3060')
  for (let k = -8; k <= 8; k++) line(g, cx + k * 10, 0, cx + k * 44, H, k % 2 ? '#10142a' : lc)
  for (let i = 1; i < 6; i++) rect(g, 0, Math.round(H * (i / 6) ** 1.5), w, 1, '#10142a')
  const ry = Math.max(3, Math.round(H * 0.12))
  ellipseLine(g, cx, ry + 3, Math.round(w * 0.22), ry, on ? '#fff3a0' : '#2a2a40')
  ellipseLine(g, cx, ry + 3, Math.round(w * 0.16), Math.round(ry * 0.7), on ? '#3ac8ff' : '#1a1c34')
  if (on) for (let x = 2; x < w; x += 9) rect(g, x, 2, 3, 1, '#fff3a0')
  return cv
}

/** The dark core: a cluster of black crystal spikes, facets catching a little colour. Drawn once. */
function coreArt(size: number, r: Rng): Canvas {
  const cv = canvas(size, size)
  const g = cv.g
  const c = size / 2
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r.range(-0.2, 0.2)
    const len = c * r.range(0.7, 1)
    const wd = c * r.range(0.25, 0.4)
    const tx = c + Math.cos(a) * len
    const ty = c + Math.sin(a) * len
    const nx = -Math.sin(a) * wd
    const ny = Math.cos(a) * wd
    tri(g, c + nx, c + ny, c - nx, c - ny, tx, ty, i % 2 ? '#0a0814' : '#16122a')
    line(g, c + nx * 0.5, c + ny * 0.5, tx, ty, i % 3 ? '#2a2448' : SPEC[i % 6]!)
  }
  ellipse(g, c, c, Math.round(c * 0.45), Math.round(c * 0.45), '#05040a')
  return cv
}

/** Light breaking out of the core through cracks, more of them every beat. */
function drawCracks(g: G, t: number, x: number, y: number, R: number) {
  const n = 3 + Math.floor(span(t, T_CRACKS, T_GEYSER) * 6)
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + 0.5
    const r1 = R * (0.7 + 0.3 * Math.sin(i * 5))
    let px = x
    let py = y
    for (let s = 1; s <= 3; s++) {
      const nx = x + (Math.cos(a + (s % 2 ? 0.3 : -0.3)) * (r1 * s)) / 3
      const ny = y + (Math.sin(a + (s % 2 ? 0.3 : -0.3)) * (r1 * s)) / 3
      line(g, px, py, nx, ny, s === 1 ? '#ffffff' : '#fff3a0')
      px = nx
      py = ny
    }
  }
}

/** The Photon Geyser: a pillar of light up out of the pad through the whole sky, rainbow at its edges. */
function drawGeyser(g: G, t: number, cx: number, deckY: number, m: number) {
  const up = ease.outC(span(t, T_GEYSER - 0.05, T_GEYSER + 0.12))
  const fade = 1 - span(t, REVEAL, REVEAL + 0.6)
  const half = Math.round(m * 0.13 * up * fade * (1 + 0.08 * Math.sin(t * 40)))
  if (half < 1) return
  const top = Math.round(lerp(deckY, -4, up))
  // Its foot: a splash of light on the pad.
  ellipse(g, cx, deckY + 2, half * 2, Math.max(2, Math.round(half * 0.4)), pattern(g, '#fff3a0', 10))
  rect(g, cx - half - 6, top, 6, deckY - top, pattern(g, SPEC[4], 6))
  rect(g, cx + half, top, 6, deckY - top, pattern(g, SPEC[0], 6))
  rect(g, cx - half, top, half * 2, deckY - top, '#fff3a0')
  rect(g, cx - Math.round(half * 0.7), top, Math.round(half * 1.4), deckY - top, '#fffbe8')
  rect(g, cx - Math.round(half * 0.35), top, Math.round(half * 0.7), deckY - top, '#ffffff')
  // Rainbow fringes, three a side.
  for (let i = 0; i < 3; i++) {
    rect(g, cx - half - 1 - i, top, 1, deckY - top, SPEC[3 + i]!)
    rect(g, cx + half + i, top, 1, deckY - top, SPEC[2 - i]!)
  }
  // Rings of light climbing it.
  for (let k = 0; k < 4; k++) {
    const y = deckY - ((t * 260 + k * 50) % Math.max(1, deckY - top))
    ellipseLine(g, cx, y, half + 4, Math.max(1, Math.round(half * 0.25)), '#ffffff')
  }
}
