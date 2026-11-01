// Celebi's entrance (docs/53), on the battle stage: Ilex Forest's little shrine at night, fireflies. A clock ticks. Time
// ripples out of the shrine in green rings and the forest turns with each one, spring, summer, autumn, winter, faster
// and faster, under the hands of a great clock of light turning round the shrine. The rings close into a portal above
// it, leaves whirling in; Celebi pops out of it, and the forest settles back into spring.
import { fxSound, hiss, tone } from '@/audio/sfx'
import {
  canvas,
  ease,
  ellipse,
  ellipseLine,
  glow,
  line,
  Particles,
  rect,
  span,
  type Canvas,
} from '../../pixel'
import { drawSprite } from '../../sprites'
import { H, W } from '../../timeline'
import { bossCinema } from './boss'
import { burstRing, dGradient, dissolve, tri } from './kit'

const REVEAL = 4.0
/** The time ripples: each turns the season. */
const PULSES = [1.3, 1.85, 2.3, 2.65, 2.92, 3.14, 3.32] as const
const T_PORTAL = 3.35
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
type Season = (typeof SEASONS)[number]

type X = { woods: Record<Season, Canvas>; amb: Particles }

const LOOK: Record<Season, { canopy: [string, string, string]; ground: string; dots: string }> = {
  spring: { canopy: ['#1c3a24', '#2e5a34', '#ffb0d8'], ground: '#2a4a26', dots: '#ffd0f0' },
  summer: { canopy: ['#12301a', '#1f5a2a', '#5aa03a'], ground: '#244a1e', dots: '#fff6c8' },
  autumn: { canopy: ['#3a1a0c', '#8a3a12', '#e08a2a'], ground: '#4a2a14', dots: '#ffbe2e' },
  winter: { canopy: ['#2a3a4a', '#6a8aa0', '#f0f8ff'], ground: '#c8d8e8', dots: '#ffffff' },
}

/** Ilex Forest at night in one season: trunks, canopy, the shrine on its stones, the ground. */
function woods(season: Season): Canvas {
  const L = LOOK[season]
  const cv = canvas(W, H)
  const g = cv.g
  g.drawImage(dGradient(W, H, ['#050a10', '#0a1a1c', '#12282a', '#0a1414']), 0, 0)
  for (let x = 2; x < W; x += 14 + ((x * 7) % 9)) {
    const wd = 4 + ((x * 3) % 5)
    rect(g, x, 0, wd, 124, '#0e1c18')
    rect(g, x + wd - 1, 0, 1, 124, '#1e3a30')
  }
  for (let i = 0; i < 42; i++) {
    const x = (i * 47) % (W + 20)
    const y = ((i * 13) % 34) - 4
    const rx = 10 + ((i * 7) % 10)
    ellipse(g, x, y + 2, rx, Math.round(rx * 0.5), L.canopy[0])
    ellipse(g, x, y, rx - 2, Math.round(rx * 0.42), L.canopy[1])
    for (let k = 0; k < 4; k++) rect(g, x - rx / 2 + ((k * 11 + i) % rx), y - 2 + (k % 3), 2, 1, L.canopy[2])
  }
  rect(g, 0, 122, W, H - 122, L.ground)
  for (let x = 0; x < W; x += 3) rect(g, x, 121 - ((x * 5) % 3), 1, 2, L.canopy[1])
  for (let i = 0; i < 24; i++) rect(g, (i * 61) % W, 126 + ((i * 17) % 30), 1, 1, L.dots)
  // The shrine: stone steps, a little wooden house with a gabled roof.
  const sx = 176
  rect(g, sx - 22, 118, 44, 4, '#4a4a52')
  rect(g, sx - 18, 114, 36, 4, '#5a5a62')
  rect(g, sx - 12, 96, 24, 18, '#5a3a22')
  rect(g, sx - 12, 96, 24, 1, '#8a5a32')
  rect(g, sx - 3, 104, 6, 10, '#2a1a10')
  tri(g, sx - 17, 97, sx + 17, 97, sx, 86, '#3a2416')
  rect(g, sx - 17, 96, 34, 2, '#6a4426')
  if (season === 'winter') {
    tri(g, sx - 15, 95, sx + 15, 95, sx, 87, '#f0f8ff')
    rect(g, sx - 12, 95, 24, 1, '#ffffff')
  }
  return cv
}

export const celebiCinema = bossCinema<X>({
  id: 'cinema-celebi',
  reveal: REVEAL,
  seed: 251,
  aura: ['#ffffff', '#d0ffa0', '#7ac74c', '#2a5a1a'],
  flash: '#e8ffd0',
  setup() {
    return {
      woods: {
        spring: woods('spring'),
        summer: woods('summer'),
        autumn: woods('autumn'),
        winter: woods('winter'),
      },
      amb: new Particles(),
    }
  },
  step(s, t, dt) {
    const r = s.r
    s.amb.update(dt)
    const season = seasonAt(t)
    // Each season's own air: petals, fireflies, leaves, snow.
    if (r() < 0.5)
      s.amb.add(
        season === 'spring'
          ? {
              x: r.range(0, W),
              y: -2,
              vx: r.range(4, 12),
              vy: r.range(10, 20),
              life: 6,
              size: 2,
              shape: 'leaf',
              spin: r.range(-3, 3),
              colors: ['#ffb0d8'],
              light: '#ffe0f0',
              dark: '#e070a0',
            }
          : season === 'summer'
            ? {
                x: r.range(0, W),
                y: r.range(40, 120),
                vx: r.range(-5, 5),
                vy: r.range(-5, 5),
                life: 1.5,
                size: 1,
                shape: 'px',
                colors: ['#fff6a0', '#c8ff70', '#3a6a1a'],
              }
            : season === 'autumn'
              ? {
                  x: r.range(0, W),
                  y: -2,
                  vx: r.range(6, 16),
                  vy: r.range(14, 24),
                  life: 6,
                  size: 2,
                  shape: 'leaf',
                  spin: r.range(-4, 4),
                  colors: ['#e08a2a'],
                  light: '#ffbe2e',
                  dark: '#8a3a12',
                }
              : {
                  x: r.range(0, W),
                  y: -2,
                  vx: -r.range(4, 10),
                  vy: r.range(14, 26),
                  life: 7,
                  size: r.int(1, 2),
                  shape: 'flake',
                  colors: ['#ffffff', '#c8e0f0'],
                },
      )
    // Leaves drawn into the portal.
    if (t > T_PORTAL && t < REVEAL && r() < 0.9)
      s.fx.add({
        x: r() < 0.5 ? r.range(0, 40) : r.range(W - 40, W),
        y: r.range(20, 120),
        home: { x: s.L.foe.x, y: s.L.foe.y - 30, k: 260 },
        life: 1,
        size: 2,
        shape: 'leaf',
        spin: 6,
        colors: ['#7ac74c'],
        light: '#d0ffa0',
        dark: '#2a5a1a',
      })
  },
  back(g, s, t, k) {
    if (k <= 0) return
    // The season, dissolving into the next at each ripple.
    const i = PULSES.filter((p) => t >= p).length
    const from = SEASONS[(i + 3) % 4]!
    const to = SEASONS[i % 4]!
    const settled = t >= REVEAL ? 'spring' : to
    if (t >= REVEAL) dissolve(g, s.woods.spring, k)
    else {
      dissolve(g, s.woods[from], k)
      const last = PULSES[i - 1] ?? 0
      dissolve(g, s.woods[settled], i ? k * span(t, last, last + 0.18) : k)
    }
    s.amb.draw(g)
    if (k < 0.5) return
    // The clock of light round the shrine: its ticks, its two hands turning faster and faster.
    const ck = span(t, 1.0, 1.6) * (1 - span(t, REVEAL, REVEAL + 0.6))
    if (ck > 0) {
      const cx = s.L.foe.x
      const cy = s.L.foe.y - 30
      const R = 46
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * Math.PI * 2
        rect(g, cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.85, 2, 2, h % 3 ? '#7ac74c' : '#d0ffa0')
      }
      const spin = t ** 3 * 0.9
      line(g, cx, cy, cx + Math.cos(spin) * R * 0.85, cy + Math.sin(spin) * R * 0.72, '#d0ffa0')
      line(g, cx, cy, cx + Math.cos(spin / 12) * R * 0.55, cy + Math.sin(spin / 12) * R * 0.47, '#7ac74c', 2)
    }
    for (const p of PULSES) burstRing(g, s.L.foe.x, s.L.foe.y - 30, span(t, p, p + 0.6), 150, 2, '#7ac74c')
    // The portal: green rings closing in, a light at their heart.
    if (t > T_PORTAL && t < REVEAL + 0.2) {
      const q = span(t, T_PORTAL, REVEAL)
      const cx = s.L.foe.x
      const cy = s.L.foe.y - 30
      g.drawImage(
        glow(Math.round(10 + 16 * q), '#d0ffa0', 1.3, 0.7),
        cx - Math.round(10 + 16 * q),
        cy - Math.round(10 + 16 * q),
      )
      for (let k2 = 0; k2 < 3; k2++) {
        const rr = Math.round((22 - k2 * 6) * ease.outBack(q))
        if (rr > 0)
          ellipseLine(
            g,
            cx,
            cy,
            rr,
            Math.round(rr * 0.9),
            k2 === 1 ? '#ffffff' : '#7ac74c',
            t * (3 + k2),
            t * (3 + k2) + Math.PI * 1.5,
          )
      }
    }
  },
  before(g, s, t) {
    // Out of the portal: tiny, then itself.
    if (t < REVEAL - 0.25) return
    const q = ease.outBack(span(t, REVEAL - 0.25, REVEAL), 2)
    drawSprite(g, s.foe, s.L.foe.x, s.L.foe.y, { sx: q, sy: q, sil: '#ffffff', outline: '#7ac74c' })
  },
  sounds: [
    ...Array.from(
      { length: 10 },
      (_, i) =>
        [
          0.2 + i * 0.5 * Math.max(0.3, 1 - i * 0.08),
          () => tone(i % 2 ? 1760 : 1568, 0.04, { type: 'square', vol: 0.02 }),
        ] as const,
    ),
    ...PULSES.map(
      (p, i) => [p, () => tone(392 + i * 60, 0.4, { type: 'sine', vol: 0.04, slide: 300 })] as const,
    ),
    [T_PORTAL, () => fxSound('psychic.focus')],
    [
      REVEAL,
      () => (
        hiss(0.15, { freq: 3000, vol: 0.05 }),
        [1568, 1976, 2349, 3136].forEach((f, i) =>
          tone(f, 0.18, { type: 'triangle', vol: 0.03, at: i * 0.06 }),
        )
      ),
    ],
  ],
})

/** The season at t: spring, then turning with each ripple; spring again once it is here. */
const seasonAt = (t: number): Season =>
  t >= REVEAL ? 'spring' : SEASONS[PULSES.filter((p) => t >= p).length % 4]!
