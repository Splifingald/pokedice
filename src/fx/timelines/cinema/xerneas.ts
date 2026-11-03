// Xerneas's raid entrance (docs/53): a dead glade in Kalos at night. Grey grass, bare trees, a sky with no colour in
// it; in the middle a great tree, its bare boughs branching like antlers: Xerneas asleep in its tree form. A heartbeat
// in the trunk, quickening; motes of life rise from the dead ground into it and light climbs its veins, bough by bough.
// Geomancy: every tip of the crown lights in its own colour and lifts a rainbow of orbs into the sky. Then life flows
// back: a wave runs out from the tree's foot across the whole glade, and behind it the grass greens, flowers open, the
// trees leaf and blossom, the sky turns deep blue. The tree, all light now, unfolds into a stag of light; the reveal.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  glow,
  lerp,
  line,
  Particles,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../../pixel'
import { drawSprite, silhouette, spriteSize } from '../../sprites'
import { screenFlash, screenShake, skippingNow, within, type Cue, type Timeline } from '../../timeline'
import { drawRays } from '../legend'
import {
  AFTER_REVEAL,
  burstRing,
  dGradient,
  dissolve,
  inOrder,
  pulse,
  tri,
  type Cinema,
  type CinemaParams,
} from './kit'

/** The tree's heart: slow, then racing. */
const BEATS = [0.55, 1.2, 1.75, 2.2, 2.5, 2.72] as const
const T_VEINS = 0.9
const T_GEO = 2.75
const T_LIFE = 3.05
const T_MORPH = 3.8
const REVEAL = 4.8
const DUR = REVEAL + AFTER_REVEAL

const AURA = ['#ffffff', '#c8f0ff', '#3a9af0', '#1a3a6a'] as const
/** Geomancy's colours, one per tip of the crown. */
const BOW = ['#ff5a6a', '#ffb02e', '#ffe85a', '#6ae07a', '#4ad0ff', '#6a7aff', '#d07aff'] as const
const VEIN = ['#ffffff', '#bff4ff', '#6ad8ff'] as const

interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  w: number
  /** How far along the tree from its root (0..1), where the segment starts and ends: the light climbs in that order. */
  o0: number
  o1: number
}

interface Layout {
  cx: number
  horizon: number
  feet: number
  tree: number
}

type S = {
  r: Rng
  fx: Particles
  motes: Particles
  dead: Canvas
  alive: Canvas
  bark: Canvas
  lit: Canvas
  segs: Seg[]
  tips: [number, number][]
  rays: Canvas
  shakes: [number, number, number][]
}

/**
 * The great tree: a trunk splitting into two beams that curve out and back up, tines rising off them, forked at the
 * ends: a stag's antlers in wood. Squeezed to the screen's width so no tine is cut off.
 */
function growTree(r: Rng, x: number, y: number, size: number, w: number) {
  const segs: Seg[] = []
  const tips: [number, number][] = []
  const push = (x0: number, y0: number, x1: number, y1: number, wd: number, o: number, len: number) =>
    segs.push({ x0, y0, x1, y1, w: Math.max(1, Math.round(wd)), o0: o, o1: o + len })
  /** A tine: two bends up, a fork at its end now and then. */
  const tine = (x0: number, y0: number, a: number, len: number, wd: number, o: number, fork: boolean) => {
    let px = x0
    let py = y0
    for (let i = 0; i < 2; i++) {
      a += (-Math.PI / 2 - a) * 0.35 + r.range(-0.1, 0.1)
      const nx = px + (Math.cos(a) * len) / 2
      const ny = py + (Math.sin(a) * len) / 2
      push(px, py, nx, ny, wd * (1 - i * 0.3), o, len / 2)
      o += len / 2
      px = nx
      py = ny
    }
    if (fork)
      for (const d of [-0.5, 0.5]) {
        const ex = px + Math.cos(a + d) * len * 0.35
        const ey = py + Math.sin(a + d) * len * 0.35
        push(px, py, ex, ey, 1, o, len * 0.35)
        tips.push([Math.round(ex), Math.round(ey)])
      }
    else tips.push([Math.round(px), Math.round(py)])
  }
  const trunk = Math.max(6, Math.round(size * 0.085))
  const tl = size * 0.3
  push(x, y, x, y - tl, trunk, 0, tl)
  // The beams spread wide, low over the trunk, and curl up at their ends.
  const lean = w > 200 ? 1.25 : 1.15
  for (const side of [-1, 1]) {
    let px = x
    let py = y - tl
    let a = -Math.PI / 2 + side * lean
    let o = tl
    let wd = trunk * 0.7
    const n = 6
    const seg = (size * 0.75) / n
    for (let i = 0; i < n; i++) {
      a -= side * (0.12 + r.range(-0.03, 0.03))
      const nx = px + Math.cos(a) * seg
      const ny = py + Math.sin(a) * seg
      push(px, py, nx, ny, wd, o, seg)
      o += seg
      px = nx
      py = ny
      wd *= 0.85
      // Tines rising off its top, upright, the outer ones leaning out a little.
      if (i >= 1 && i < n - 1)
        tine(
          px,
          py,
          -Math.PI / 2 + side * r.range(-0.15, 0.3),
          seg * r.range(1.5, 2.3) * (1 - i * 0.06),
          Math.max(1, wd * 0.7),
          o,
          i % 2 === 0,
        )
    }
    tine(px, py, a, seg * 1.4, wd, o, true)
  }
  // Squeezed into the screen, about the trunk.
  const reach = Math.max(...segs.map((s) => Math.max(Math.abs(s.x0 - x), Math.abs(s.x1 - x))))
  const k = Math.min(1, (w * 0.45) / reach)
  for (const s of segs) {
    s.x0 = x + (s.x0 - x) * k
    s.x1 = x + (s.x1 - x) * k
  }
  for (const tp of tips) tp[0] = Math.round(x + (tp[0] - x) * k)
  const max = Math.max(...segs.map((s) => s.o1))
  for (const s of segs) {
    s.o0 /= max
    s.o1 /= max
  }
  return { segs, tips }
}

/** The tree drawn once: dark bark with a lit edge, or every vein lit (the tree all light, before it unfolds). */
function drawTree(segs: readonly Seg[], w: number, h: number, lit: boolean): Canvas {
  const cv = canvas(w, h)
  const g = cv.g
  const root = segs[0]!
  // The roots, flaring into the ground.
  for (const side of [-1, 1])
    tri(
      g,
      root.x0 + side * root.w * 1.6,
      root.y0 + 2,
      root.x0 + side * (root.w >> 1),
      root.y0 - root.w * 1.4,
      root.x0,
      root.y0 + 1,
      lit ? '#6ad8ff' : '#1c1a24',
    )
  for (const s of segs) line(g, s.x0, s.y0, s.x1, s.y1, lit ? '#4ab0f0' : '#1c1a24', s.w + 2)
  for (const s of segs) line(g, s.x0, s.y0, s.x1, s.y1, lit ? '#ffffff' : '#2e2a38', s.w)
  if (!lit)
    for (const s of segs) if (s.w > 2) line(g, s.x0 - (s.w >> 1), s.y0, s.x1 - (s.w >> 1), s.y1, '#4a4458')
  return cv
}

/**
 * A tree at the glade's edge, reaching out of the frame: bare and grey, or in leaf and blossom. Drawn with its own
 * seed, so both look alike. `side` is the edge it stands at: its boughs lean that way, clear of the middle.
 */
function sideTree(g: G, x: number, base: number, ht: number, side: number, alive: boolean, seed: number) {
  const r = rng(seed)
  const bark = alive ? '#2a1e18' : '#1e1c24'
  const wd = Math.max(5, Math.round(ht * 0.08))
  rect(g, x - (wd >> 1), base - ht, wd, ht, bark)
  rect(g, x + side * (wd >> 1), base - ht, 1, ht, alive ? '#4a3424' : '#34323c')
  const ends: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const y = base - ht * r.range(0.4, 0.95)
    // Most boughs reach out of the frame; the short ones reach in.
    const dir = i % 3 === 2 ? -side : side
    const len = ht * r.range(0.2, 0.4) * (dir === side ? 1 : 0.5)
    const ex = x + dir * len
    const ey = y - len * r.range(0.4, 0.9)
    line(g, x, y, ex, ey, bark, 2)
    line(g, ex, ey, ex + dir * len * 0.3, ey - len * 0.45, bark)
    ends.push([ex, ey])
  }
  ends.push([x, base - ht])
  if (!alive) return
  // In leaf: clumps of green with a lit top, white and pink blossom on them.
  for (const [ex, ey] of ends) {
    const rr = Math.round(ht * r.range(0.11, 0.16))
    ellipse(g, ex, ey + 2, rr, Math.round(rr * 0.7), '#14402a')
    ellipse(g, ex - 1, ey, rr - 2, Math.round(rr * 0.55), '#22683a')
    ellipse(g, ex - 2, ey - 2, Math.max(1, rr - 5), Math.round(rr * 0.3), '#3a9a4a')
    for (let k = 0; k < 5; k++)
      rect(g, ex + r.range(-rr, rr), ey + r.range(-rr * 0.5, rr * 0.4), 1, 1, k % 2 ? '#ffd0e8' : '#ffffff')
  }
}

/** The glade: dead (grey, bare, no colour) or alive (deep blue sky, leaves, grass, flowers), the same shapes. */
function glade(w: number, h: number, L: Layout, alive: boolean): Canvas {
  const r = rng(716)
  const cv = canvas(w, h)
  const g = cv.g
  const hz = L.horizon
  g.drawImage(
    dGradient(
      w,
      hz,
      alive ? ['#040a1c', '#0a1c40', '#123e66', '#1e6a7a'] : ['#0a0a0e', '#141418', '#202026', '#2e2c34'],
    ),
    0,
    0,
  )
  for (let i = 0; i < 60; i++) {
    const x = r.range(0, w)
    const y = r.range(0, hz * 0.7)
    const c = r()
    if (alive) rect(g, x, y, 1, 1, c < 0.2 ? '#ffffff' : c < 0.6 ? '#8ac8ff' : '#4a7ab0')
    else if (c < 0.15) rect(g, x, y, 1, 1, '#3a3a40')
  }
  // The moon behind the tree's crown: a grey stone in the dead sky, silver once it lives.
  const m = Math.round(Math.min(w, h) * 0.17)
  const my = Math.round(L.feet - L.tree * 0.78)
  // Alive it is a cool blue, so the tree of light and the stag still stand out on it.
  if (alive) g.drawImage(glow(m * 2, '#2a6aa0', 1.5, 0.5), L.cx - m * 2, my - m * 2)
  ellipse(g, L.cx, my, m, m, alive ? '#6aa8d0' : '#3a3840')
  ellipse(g, L.cx + 2, my - 1, m - 2, m - 2, alive ? '#80bce0' : '#44424a')
  for (const [dx, dy, rr] of [
    [-0.4, -0.2, 0.22],
    [0.3, 0.35, 0.16],
    [0.1, -0.5, 0.1],
  ] as const)
    ellipse(
      g,
      L.cx + dx * m,
      my + dy * m,
      Math.round(m * rr),
      Math.round(m * rr),
      alive ? '#d0e4f4' : '#36343c',
    )
  // The far wood: a ragged line of crowns (in leaf) or of bare tops.
  for (let x = 0; x < w; x++) {
    const y = Math.round(hz - 10 - Math.abs(Math.sin(x / 7)) * 6 - Math.sin(x / 23) * 4 - ((x * 7) % 3))
    rect(g, x, y, 1, hz - y, alive ? '#0c2a26' : '#111015')
    if (alive && (x * 5) % 7 === 0) rect(g, x, y, 1, 1, '#1e5a40')
  }
  if (!alive)
    for (let x = 3; x < w; x += 9) {
      const top = hz - 22 - ((x * 13) % 9)
      line(g, x, hz - 8, x + ((x * 3) % 5) - 2, top, '#111015')
      line(g, x + 1, top + 6, x + 5, top + 1, '#111015')
    }
  // The ground: in perspective, rows of grass.
  g.drawImage(
    dGradient(w, h - hz, alive ? ['#1a4a2a', '#123a20', '#0a2414'] : ['#302e34', '#222026', '#141316']),
    0,
    hz,
  )
  rect(g, 0, hz, w, 1, alive ? '#3a8a4a' : '#34323a')
  for (let i = 0; i < Math.round((w * (h - hz)) / 60); i++) {
    const y = Math.round(hz + 2 + (h - hz - 2) * r() ** 1.3)
    const x = r.range(0, w)
    const near = (y - hz) / (h - hz)
    const ht = 1 + Math.round(near * 3)
    const c = r()
    rect(g, x, y - ht, 1, ht, alive ? (c < 0.5 ? '#3a9a4a' : '#2a7a3a') : c < 0.5 ? '#4a4652' : '#36343e')
    const fl = r()
    if (alive && fl < 0.22) {
      // A flower: a plus of petals round a bright eye.
      const col = BOW[Math.floor(r() * BOW.length)]!
      const s = near > 0.5 ? 1 : 0
      rect(g, x - s, y - ht - 1, 1 + s * 2, 1, col)
      rect(g, x, y - ht - 1 - s, 1, 1 + s * 2, col)
      rect(g, x, y - ht - 1, 1, 1, '#fff6c8')
    } else r()
  }
  // Two trees framing the glade (cropped on a narrow phone).
  const base = Math.round(hz + (h - hz) * 0.18)
  const ht = Math.round(Math.min(h * 0.5, 120))
  const edge = Math.min(w * 0.46, 150)
  sideTree(g, Math.round(L.cx - edge), base, ht, -1, alive, 7)
  sideTree(g, Math.round(L.cx + edge), base + 4, Math.round(ht * 0.9), 1, alive, 11)
  return cv
}

export const xerneasCinema: Cinema = {
  reveal: REVEAL,
  dur: DUR,
  make(p: CinemaParams): Timeline<S> {
    const w = p.w ?? 240
    const h = p.h ?? 160
    const cx = Math.round(w / 2)
    const L: Layout = {
      cx,
      horizon: Math.round(h * 0.5),
      feet: Math.round(h * 0.63),
      tree: Math.round(Math.min(h * 0.44, 112)),
    }
    const sz = spriteSize(p.mon)
    const many = p.short ? 0.4 : 1
    const quiet = (f: () => void) => () => void (!skippingNow() && f())
    const mid = L.feet - Math.round(L.tree * 0.45)
    const heart = L.feet - Math.round(L.tree * 0.2)
    return {
      id: 'cinema-xerneas',
      dur: DUR,
      setup() {
        const r = rng(716)
        const { segs, tips } = growTree(r, cx, L.feet, L.tree, w)
        return {
          r,
          fx: new Particles(),
          motes: new Particles(),
          dead: glade(w, h, L, false),
          alive: glade(w, h, L, true),
          bark: drawTree(segs, w, h, false),
          lit: drawTree(segs, w, h, true),
          segs,
          tips,
          rays: canvas(w, h),
          shakes: p.short ? [] : [[REVEAL, 0.5, 2]],
        }
      },
      step(s, t, dt) {
        const r = s.r
        s.fx.update(dt)
        s.motes.update(dt)
        // Motes of life rising out of the dead ground and drawn into the trunk.
        if (t > 0.6 && t < T_GEO && r() < lerp(0.3, 1.4, span(t, 0.6, T_GEO)) * many)
          s.motes.add({
            x: r.range(0, w),
            y: r.range(L.horizon + 4, h),
            vy: -r.range(6, 16),
            home: { x: cx, y: L.feet - 6, k: lerp(40, 160, span(t, 0.6, T_GEO)) },
            life: 2.4,
            size: 1,
            shape: r() < 0.3 ? 'plus' : 'px',
            colors: ['#4a7a8a', '#8ad0e0', '#bff4ff'],
          })
        // Geomancy: an orb of each colour lifting off every tip.
        if (t > T_GEO && t < T_MORPH + 0.4 && r() < 0.9 * many)
          for (let i = 0; i < 2; i++) {
            const k = Math.floor(r() * s.tips.length)
            const [x, y] = s.tips[k]!
            s.fx.add({
              x,
              y,
              vx: r.range(-10, 10),
              vy: -r.range(20, 45),
              drag: 0.6,
              life: r.range(0.9, 1.6),
              size: 2,
              size1: 0,
              shape: r() < 0.5 ? 'disc' : 'star',
              colors: [BOW[k % BOW.length]!, '#ffffff'],
            })
          }
        // Life flowing back: sprouts and petals bursting up along the wave's front.
        const R = waveR(t, w, h)
        if (R > 0 && R < Math.max(w, h) * 1.2)
          for (let i = 0; i < 6 * many; i++) {
            const a = r() * Math.PI * 2
            const x = cx + Math.cos(a) * R
            const y = L.feet + Math.sin(a) * R * 0.75
            if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue
            const ground = y > L.horizon
            s.fx.add({
              x,
              y,
              vx: r.range(-10, 10),
              vy: -r.range(15, 40),
              ay: ground ? 60 : 0,
              life: r.range(0.5, 0.9),
              size: 2,
              shape: ground && r() < 0.6 ? 'leaf' : 'star',
              spin: r.range(-4, 4),
              colors: ground ? ['#7ae07a'] : [BOW[Math.floor(r() * BOW.length)]!, '#ffffff'],
              light: '#d0ffa0',
              dark: '#2a7a3a',
            })
          }
        // Life's own stream: motes running out from the foot of the tree along the ground.
        if (t > T_LIFE && t < REVEAL + 2 && r() < 0.7 * many)
          s.motes.add({
            x: cx + r.range(-6, 6),
            y: L.feet + r.range(-2, 4),
            vx: r.range(-90, 90),
            vy: r.range(-6, 14),
            drag: 1.2,
            life: 1.2,
            size: 1,
            shape: 'px',
            colors: ['#ffffff', '#d0ffa0', '#7ae07a'],
          })
        // Once it stands: petals in the air, fireflies.
        if (t > REVEAL && r() < 0.35 * many)
          s.motes.add({
            x: r.range(0, w),
            y: -3,
            vx: r.range(4, 14),
            vy: r.range(12, 22),
            life: 8,
            size: 2,
            shape: 'leaf',
            spin: r.range(-3, 3),
            colors: ['#ffd0e8'],
            light: '#ffffff',
            dark: '#e070a0',
          })
        if (within(t, REVEAL, REVEAL + dt))
          for (let k = 0; k < 60 * many; k++) {
            const a = r() * Math.PI * 2
            const v = r.range(60, 180)
            s.fx.add({
              x: cx,
              y: L.feet - (sz.h >> 1),
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              drag: 2.5,
              life: r.range(0.6, 1.1),
              size: 2,
              shape: k % 3 ? 'star' : 'leaf',
              spin: 4,
              colors: k % 3 ? [BOW[k % BOW.length]!, '#ffffff'] : ['#ffd0e8'],
              light: '#ffffff',
              dark: '#e070a0',
            })
          }
      },
      draw(g, s, t) {
        const sh = screenShake(t, s.shakes)
        g.fillStyle = '#060608'
        g.fillRect(0, 0, w, h)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.dead, 0, 0)
        // The wave of life: the living glade drawn row by row inside a widening, ragged ellipse.
        const R = waveR(t, w, h)
        if (R > 0) drawWave(g, s.alive, cx, L.feet, R, t, w, h)
        // The tree's heart: its glow beating, stronger each beat.
        const beat = Math.max(
          0,
          ...BEATS.map((b, i) => (1 - span(t, b, b + 0.35)) * (t >= b ? 0.4 + i * 0.1 : 0)),
        )
        const gr = Math.round(L.tree * 0.4)
        // Its strength in eighths: the glows are cached by it.
        const hk = Math.round(Math.min(0.85, 0.15 + beat + span(t, T_GEO, T_MORPH) * 0.4) * 8) / 8
        if (t < REVEAL) g.drawImage(glow(gr, t > T_GEO ? '#3a9af0' : '#2a6a8a', 1.6, hk), cx - gr, heart - gr)
        s.motes.draw(g)
        // The tree: bark with its veins lighting bough by bough; all light once Geomancy wakes it; then it unfolds.
        const unfold = ease.ioS(span(t, T_MORPH, T_MORPH + 0.65))
        if (t < T_GEO) {
          g.drawImage(s.bark, 0, 0)
          drawVeins(g, s.segs, ease.inQ(span(t, T_VEINS, T_GEO)), t, beat)
        } else if (unfold < 1) {
          dissolve(g, s.bark, 1 - unfold)
          dissolve(g, s.lit, (1 - unfold) * span(t, T_GEO, T_GEO + 0.15))
          // Each tip its own colour, a light at the end of every tine.
          s.tips.forEach(([x, y], i) => {
            const c = BOW[i % BOW.length]!
            const at = T_GEO + (i % 5) * 0.04
            const k = (1 - unfold) * span(t, at, at + 0.15)
            if (k <= 0) return
            // Each lights with a pop of its own colour, then burns on, breathing.
            burstRing(g, x, y, span(t, at, at + 0.45), 22, 2, c)
            const rr = 6 + Math.round(2 * pulse(t * 3 + i * 0.37, 0, 1))
            g.drawImage(glow(rr, c, 1.1, Math.round(8 * k) / 8), x - rr, y - rr)
            rect(g, x - 1, y - 2, 3, 5, c)
            rect(g, x - 2, y - 1, 5, 3, c)
            rect(g, x, y - 1, 1, 3, '#ffffff')
            rect(g, x - 1, y, 3, 1, '#ffffff')
          })
        }
        // The stag of light coming out of the tree's light, then outlined in Geomancy's colours.
        if (t >= T_MORPH && t < REVEAL) {
          const sil = silhouette(p.mon, '#e8fbff')
          if (sil) {
            const x = cx - (sil.width >> 1)
            const y = L.feet - sil.height
            if (unfold < 1) dissolve(g, sil, unfold, x, y)
            else
              drawSprite(g, p.mon, cx, L.feet, {
                sil: '#e8fbff',
                outline: BOW[Math.floor(t * 14) % BOW.length]!,
              })
          }
        }
        // Geomancy's pulse out of the crown, and life's ring out of the root.
        for (let i = 0; i < 3; i++)
          burstRing(
            g,
            cx,
            mid,
            span(t, T_GEO + i * 0.12, T_GEO + i * 0.12 + 0.7),
            Math.max(w, h) * 0.6,
            2,
            BOW[(i * 2 + 1) % BOW.length]!,
          )
        if (t >= REVEAL) {
          const k = span(t, REVEAL, REVEAL + 0.4) * lerp(0.55, 0.22, span(t, REVEAL + 0.4, REVEAL + 1.4))
          drawRays(s.rays, { x: cx, y: L.feet - (sz.h >> 1) }, t, '#8ad8ff', k)
          g.drawImage(s.rays, 0, 0)
          const ar = Math.round(Math.min(w, h) * 0.3)
          g.drawImage(glow(ar, AURA[2], 1.5, 0.4), cx - ar, L.feet - (sz.h >> 1) - ar)
          drawSprite(g, p.mon, cx, L.feet, {
            flash: Math.max(0, 1 - span(t, REVEAL + 0.05, REVEAL + 0.45)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : BOW[Math.floor(t * 4) % BOW.length]!,
          })
        }
        for (const [d, c] of [
          [0, AURA[0]],
          [0.1, '#d0ffa0'],
          [0.2, AURA[2]],
        ] as const)
          burstRing(
            g,
            cx,
            L.feet - (sz.h >> 1),
            span(t, REVEAL + d, REVEAL + d + 0.6),
            Math.max(w, h) * 0.75,
            3,
            c,
          )
        s.fx.draw(g)
        g.restore()
        if (within(t, T_LIFE, T_LIFE + 0.25))
          screenFlash(g, '#d0ffa0', 0.35 * (1 - span(t, T_LIFE, T_LIFE + 0.25)))
        if (within(t, REVEAL, REVEAL + 0.35))
          screenFlash(g, '#ffffff', 0.9 * (1 - span(t, REVEAL, REVEAL + 0.35)))
        // The dead glade is darker than night until the life comes back.
        if (t < T_LIFE + 0.6) wash(g, '#000000', 0.2 * (1 - span(t, T_LIFE, T_LIFE + 0.6)), 8)
        if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      },
      cues: () =>
        inOrder([
          [0.05, quiet(() => tone(55, 2.6, { type: 'sine', vol: 0.04 }))],
          ...BEATS.map(
            (b, i) =>
              [
                b,
                quiet(() => (fxSound('legend.heart'), i > 2 && tone(110, 0.2, { type: 'sine', vol: 0.05 }))),
              ] as const,
          ),
          [T_VEINS, quiet(() => hiss(1.8, { freq: 500, slide: 1800, vol: 0.03 }))],
          [
            T_GEO,
            quiet(() =>
              [523, 587, 659, 784, 880, 1047, 1319].forEach((f, i) =>
                tone(f, 0.35, { type: 'triangle', vol: 0.03, at: i * 0.05 }),
              ),
            ),
          ],
          [
            T_LIFE,
            quiet(() => {
              hiss(1.2, { freq: 2600, slide: -1800, vol: 0.05 })
              for (const f of [262, 330, 392, 523]) tone(f, 1.6, { type: 'sine', vol: 0.025 })
            }),
          ],
          [
            T_MORPH,
            quiet(() => (fxSound('psychic.focus'), tone(392, 0.9, { type: 'sine', vol: 0.04, slide: 400 }))),
          ],
          [REVEAL, (hud) => (quiet(() => fxSound('legend.roar'))(), hud.beat?.('roar'))],
        ] satisfies Cue<S>[]),
    }
  },
}

/** How far the wave of life has run from the tree's foot (0 before it starts). */
const waveR = (t: number, w: number, h: number) =>
  t < T_LIFE ? 0 : lerp(4, Math.max(w, h) * 1.25, ease.outQ(span(t, T_LIFE, T_LIFE + 1.3)))

/** The living glade inside the wave, row by row (a ragged edge, never a smooth curve), its front a bright line. */
function drawWave(g: G, alive: Canvas, cx: number, cy: number, R: number, t: number, w: number, h: number) {
  const ry = R * 0.75
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(h, Math.ceil(cy + ry)); y++) {
    const dy = (y - cy) / ry
    const rag = Math.sin(y * 0.9 + t * 7) * 2 + ((y * 7) % 3)
    const hw = Math.round(R * Math.sqrt(Math.max(0, 1 - dy * dy)) + rag)
    if (hw <= 0) continue
    const x0 = Math.max(0, cx - hw)
    const x1 = Math.min(w, cx + hw)
    if (x1 <= x0) continue
    g.drawImage(alive, x0, y, x1 - x0, 1, x0, y, x1 - x0, 1)
    if (R < Math.max(w, h) * 1.15) {
      rect(g, cx - hw, y, 2, 1, (y & 1) === 0 ? '#d0ffa0' : '#7ae07a')
      rect(g, cx + hw - 2, y, 2, 1, (y & 1) === 0 ? '#d0ffa0' : '#7ae07a')
    }
  }
}

/** Light climbing the tree's veins to `q` of its height, each beat flaring it. */
function drawVeins(g: G, segs: readonly Seg[], q: number, t: number, beat: number) {
  if (q <= 0) return
  for (const s of segs) {
    if (s.o0 >= q) continue
    const f = Math.min(1, (q - s.o0) / (s.o1 - s.o0))
    const x1 = lerp(s.x0, s.x1, f)
    const y1 = lerp(s.y0, s.y1, f)
    const c = beat > 0.3 ? VEIN[0] : s.w > 4 ? VEIN[2] : VEIN[1]
    line(g, s.x0, s.y0, x1, y1, c, s.w > 5 ? 2 : 1)
    // The front of the light: a spark where it has got to.
    if (f < 1) rect(g, x1 - 1, y1 - 1, 3, 3, Math.floor(t * 20) % 2 ? '#ffffff' : VEIN[1])
  }
}
