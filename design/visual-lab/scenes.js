/*
 * Pokédice Visual Lab: scenery. Battle backgrounds for each style, the Pokémon Center interior and the Poké Balls.
 * Static layers are painted once per (style, size) and cached; `dyn` adds what moves (stars, pollen, rim lights).
 */
;(function () {
  'use strict'
  const {
    bayer,
    canvas,
    shade,
    rect,
    ellipse,
    ellipseLine,
    softEllipse,
    glow,
    rng,
    clamp,
    mix,
    cached,
    px,
    line,
  } = PX

  const IMG = {}
  function loadImage(key, src) {
    return new Promise((res) => {
      const im = new Image()
      im.onload = () => {
        IMG[key] = im
        res(im)
      }
      im.onerror = () => res(null)
      im.src = src
    })
  }

  /** Vertical dithered gradient through a list of colours. */
  const vgrad = (cols, y, x, y0, y1) => {
    const t = clamp((y - y0) / Math.max(1, y1 - y0)) * (cols.length - 1)
    const i = Math.floor(t)
    return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)] : cols[i]
  }
  /** A ridge line: a sum of seeded sines, one height per column. */
  function ridge(W, base, amp, seed, freqs = [0.021, 0.047, 0.11]) {
    const r = rng(seed)
    const ph = freqs.map(() => r() * 6.28)
    const out = []
    for (let x = 0; x < W; x++) {
      let v = 0
      freqs.forEach((f, i) => (v += Math.sin(x * f + ph[i]) / (i + 1)))
      out.push(Math.round(base - Math.abs(v) * amp))
    }
    return out
  }

  // ------------------------------------------------------------------ style palettes for the scenery
  const LOOK = {
    daybreak: {
      sky: ['#76bff3', '#8ccbf6', '#a5d8f8', '#bfe4f9', '#d8eef8', '#f1efe6', '#fde4c8'],
      sun: '#fff6d6',
      cloud: ['#ffffff', '#eaf3fb', '#d3e3f3'],
      far: ['#c8d6f0', '#a9bde6', '#93a8d9'],
      hill: ['#bde6a6', '#92d08a', '#6fb978'],
      tree: ['#7cc574', '#55a466', '#3c8457'],
      field: ['#a7de82', '#97d576', '#87cb6b', '#79bf62'],
      tuft: '#5fae55',
      flowers: ['#ffffff', '#ffe36b', '#ff9cc2'],
      pad: { lip: '#5ea653', top: '#b2e68e', rim: '#e6fcc8', shade: '#8fcf72', tuft: '#79c063' },
      contact: '#3f7d47',
      motes: '#fff3b0',
    },
    night: {
      sky: ['#05071a', '#090d24', '#0f1433', '#171a45', '#231d58', '#36256a', '#4f2f76'],
      star: ['#d9e1ff', '#8f9ad8', '#5b64a8'],
      moon: '#f4f0cf',
      city: ['#0a0c20', '#141838', '#232a5a'],
      windows: ['#ffd36b', '#7ef3ff', '#ff7fb0'],
      ground: ['#0d1b2e', '#0b1626', '#09111e'],
      grid: '#14304a',
      pad: {
        lip: '#070b18',
        top: '#16244a',
        ring: '#24406e',
        rim: '#3ef0ff',
        rim2: '#a9fbff',
        glow: '#1a6a86',
      },
      contact: '#03050c',
      motes: ['#3ef0ff', '#ff4f9a'],
    },
    pop: {
      burst: ['#ffd84d', '#ffc629'],
      dots: '#ffad1f',
      cloud: ['#ffffff', '#ece3ff'],
      ink: '#1a1423',
      ground: ['#4bd37f', '#3cc070'],
      pad: { lip: '#249a58', top: '#7fe39a', rim: '#c8f8d4', ink: '#1a1423' },
      contact: '#1a1423',
      spark: '#ffffff',
    },
  }

  // ------------------------------------------------------------------ battle backgrounds
  function layoutFor(style, W, H) {
    if (style === 'current') return { foe: { x: 176, y: H - 112 + 70 }, own: { x: 72, y: H - 112 + 116 } }
    return {
      foe: { x: Math.round(W * 0.72), y: Math.round(H * 0.6) },
      own: { x: Math.round(W * 0.27), y: H + 4 },
    }
  }

  function paintCurrent(W, H) {
    const c = canvas(W, H)
    rect(c.g, 0, 0, W, H, '#e8f0f0')
    if (IMG.grass) c.g.drawImage(IMG.grass, Math.round((W - 240) / 2), H - 112)
    return c
  }

  function paintDaybreak(W, H, L) {
    const P = LOOK.daybreak
    const hy = Math.round(H * 0.5)
    const far = ridge(W, hy + 2, H * 0.16, 7)
    const hill = ridge(W, hy + 10, H * 0.08, 19, [0.018, 0.05, 0.09])
    const c = shade(W, H, (x, y) => {
      if (y < far[x]) {
        let col = vgrad(P.sky, y, x, 0, hy + 4)
        // Morning sun, top right: a dithered warm bloom on the sky only.
        // Morning sun, top right: a solid core and one 50 % dithered band; no noisy falloff.
        const d = Math.hypot(x - W * 0.86, y - H * 0.06) / (H * 0.2)
        if (d < 0.55 || (d < 0.8 && (x + y) % 2 === 0) || (d < 1 && x % 2 === 0 && y % 2 === 0)) col = P.sun
        return col
      }
      if (y < hill[x]) {
        // Distant range: lit edge on its top two pixels, atmospheric shade at its foot.
        if (y - far[x] < 1) return P.far[0]
        return y > hy + 4 && bayer(x, y) < 0.5 ? P.far[2] : P.far[1]
      }
      const top = hill[x]
      if (y - top < 1) return P.hill[0]
      if (y - top < 5) return bayer(x, y) < (y - top) / 5 ? P.hill[2] : P.hill[1]
      return vgrad(P.field, y, x, top + 4, H)
    })
    const g = c.g
    const r = rng(42)
    // Clouds: overlapping discs, white tops, a cool underside.
    for (const [cx, cy, s] of [
      [W * 0.18, H * 0.16, 1],
      [W * 0.5, H * 0.09, 0.7],
      [W * 0.66, H * 0.24, 0.85],
    ]) {
      const blobs = [
        [-12, 2, 6],
        [-5, -2, 8],
        [4, -3, 7],
        [12, 1, 6],
        [0, 3, 7],
      ].map(([dx, dy, rr]) => [cx + dx * s, cy + dy * s, Math.max(2, Math.round(rr * s))])
      for (const [bx, by, br] of blobs) ellipse(g, bx, by + 1, br, Math.round(br * 0.8), P.cloud[2])
      for (const [bx, by, br] of blobs) ellipse(g, bx, by, br, Math.round(br * 0.8), P.cloud[1])
      for (const [bx, by, br] of blobs)
        ellipse(g, bx - 1, by - 1, br - 1, Math.round(br * 0.8) - 1, P.cloud[0])
    }
    // Tree line along the hills.
    for (let x = 4; x < W; x += r.int(9, 15)) {
      const y = hill[Math.min(W - 1, x)] + 1,
        rr = r.int(4, 7)
      ellipse(g, x, y - rr + 2, rr, rr, P.tree[2])
      ellipse(g, x - 1, y - rr + 1, rr - 1, rr - 1, P.tree[1])
      ellipse(g, x - 2, y - rr, Math.max(1, rr - 3), Math.max(1, rr - 3), P.tree[0])
    }
    // Grass tufts and flowers, sparser near the horizon.
    for (let i = 0; i < W * 0.6; i++) {
      const x = r.int(0, W - 1),
        y = r.int(hy + 12, H - 1)
      if (r() < (y - hy) / (H - hy)) {
        px(g, x, y, P.tuft)
        px(g, x - 1, y - 1, P.tuft)
        px(g, x + 1, y - 1, P.tuft)
        if (r() < 0.12) px(g, x, y - 2, r.pick(P.flowers))
      }
    }
    pad(g, L.foe.x, L.foe.y + 2, 46, 11, P.pad)
    pad(g, L.own.x, L.own.y - 4, 72, 16, P.pad)
    return c
  }

  function pad(g, x, y, rx, ry, p) {
    ellipse(g, x, y + 3, rx, ry, p.lip)
    ellipse(g, x, y, rx, ry, p.top)
    softEllipse(g, x + 4, y + 2, rx - 6, ry - 3, p.shade, 0.55, 0.6)
    ellipseLine(g, x, y, rx, ry, p.rim, Math.PI * 1.05, Math.PI * 1.95)
    const r = rng(x * 31 + y)
    for (let i = 0; i < rx / 2; i++) {
      const a = r() * Math.PI * 2,
        d = Math.sqrt(r()) * 0.85
      const tx = Math.round(x + Math.cos(a) * rx * d),
        ty = Math.round(y + Math.sin(a) * ry * d)
      px(g, tx, ty, p.tuft)
      px(g, tx + 1, ty - 1, p.tuft)
    }
  }

  function paintNight(W, H, L) {
    const P = LOOK.night
    const hy = Math.round(H * 0.5)
    const r = rng(9)
    const c = shade(W, H, (x, y) => {
      if (y < hy) return vgrad(P.sky, y, x, 0, hy)
      return vgrad(P.ground, y, x, hy, H)
    })
    const g = c.g
    // Moon: a crescent with a wide dithered halo.
    const mx = Math.round(W * 0.15),
      my = Math.round(H * 0.15)
    g.drawImage(glow(26, '#2b2f6e', 1.4, 0.8), mx - 26, my - 26)
    g.drawImage(glow(16, '#3d3f86', 1.6, 0.8), mx - 16, my - 16)
    ellipse(g, mx, my, 8, 8, P.moon)
    ellipse(g, mx + 4, my - 3, 7, 7, P.sky[1])
    // Stars, denser near the top.
    for (let i = 0; i < W * 0.45; i++) {
      const x = r.int(0, W - 1),
        y = Math.round(Math.pow(r(), 1.6) * hy * 0.9)
      px(g, x, y, r() < 0.15 ? P.star[0] : r() < 0.5 ? P.star[1] : P.star[2])
    }
    // Castelia-style skyline on the horizon, windows lit at random.
    let x = -2
    while (x < W) {
      const w = r.int(6, 16),
        h = r.int(8, 30) * (Math.abs(x - W * 0.55) < W * 0.2 ? 1.3 : 1)
      rect(g, x, hy - h, w, h + 1, P.city[0])
      rect(g, x, hy - h, w, 1, P.city[2])
      rect(g, x, hy - h, 1, h, P.city[1])
      for (let wy = hy - h + 3; wy < hy - 1; wy += 3)
        for (let wx = x + 2; wx < x + w - 1; wx += 2) if (r() < 0.22) px(g, wx, wy, r.pick(P.windows))
      x += w + r.int(0, 2)
    }
    // A perspective grid on the ground, Pokémon World Tournament style.
    for (let i = -12; i <= 12; i++) line(g, W / 2 + i * 6, hy + 1, W / 2 + i * 60, H + 40, P.grid)
    for (let k = 1; k < 7; k++) {
      const y = Math.round(hy + 2 + Math.pow(k / 6, 2) * (H - hy))
      for (let xx = 0; xx < W; xx += 2) px(g, xx + (k & 1), y, P.grid)
    }
    const nightPad = (cx, cy, rx, ry) => {
      softEllipse(g, cx, cy + 2, rx + 8, ry + 4, P.pad.glow, 0.5, 0.8)
      ellipse(g, cx, cy + 3, rx, ry, P.pad.lip)
      ellipse(g, cx, cy, rx, ry, P.pad.top)
      ellipseLine(g, cx, cy, Math.round(rx * 0.66), Math.round(ry * 0.66), P.pad.ring)
      ellipseLine(g, cx, cy, Math.round(rx * 0.33), Math.round(ry * 0.33), P.pad.ring)
    }
    nightPad(L.foe.x, L.foe.y + 2, 46, 11)
    nightPad(L.own.x, L.own.y - 4, 72, 16)
    return c
  }

  function paintPop(W, H, L) {
    const P = LOOK.pop
    const hy = Math.round(H * 0.58)
    const cx = W * 0.7,
      cy = H * 0.32
    const c = shade(W, H, (x, y) => {
      if (y < hy) {
        // Sunburst: 18 wedges around a point behind the foe; halftone dots grow toward the bottom left.
        const a = Math.atan2(y - cy, x - cx) + Math.PI
        const col = Math.floor((a / (Math.PI * 2)) * 18) % 2 ? P.burst[0] : P.burst[1]
        const cell = 6,
          gx = Math.floor(x / cell),
          gy = Math.floor(y / cell)
        const k = clamp(1 - Math.hypot(gx * cell - 0, gy * cell - hy) / (W * 0.7))
        const dx = x - (gx * cell + 3),
          dy = y - (gy * cell + 3)
        if (k > 0 && dx * dx + dy * dy < k * k * 9) return P.dots
        return col
      }
      if (y === hy) return P.ink
      return Math.floor((y - hy) / 5) % 2 ? P.ground[1] : P.ground[0]
    })
    const g = c.g
    // Flat comic clouds with a one-pixel ink line.
    for (const [x, y, s] of [
      [W * 0.15, H * 0.14, 1],
      [W * 0.42, H * 0.26, 0.75],
    ]) {
      const blobs = [
        [-10, 2, 6],
        [-3, -2, 8],
        [6, -1, 7],
        [13, 2, 5],
      ].map(([dx, dy, rr]) => [x + dx * s, y + dy * s, Math.max(2, Math.round(rr * s))])
      for (const [bx, by, br] of blobs) ellipse(g, bx, by, br + 1, Math.round(br * 0.75) + 1, P.ink)
      for (const [bx, by, br] of blobs) ellipse(g, bx, by, br, Math.round(br * 0.75), P.cloud[0])
      for (const [bx, by, br] of blobs)
        rect(g, bx - br + 2, by + Math.round(br * 0.4), br * 2 - 3, 1, P.cloud[1])
    }
    const popPad = (x, y, rx, ry) => {
      ellipse(g, x + 3, y + 5, rx + 1, ry + 1, P.ink)
      ellipse(g, x, y + 2, rx + 1, ry + 1, P.ink)
      ellipse(g, x, y + 2, rx, ry, P.pad.lip)
      ellipse(g, x, y, rx, ry, P.pad.top)
      ellipseLine(g, x, y, rx + 1, ry + 1, P.ink)
      ellipse(
        g,
        x - Math.round(rx * 0.35),
        y - Math.round(ry * 0.35),
        Math.round(rx * 0.3),
        Math.max(1, Math.round(ry * 0.25)),
        P.pad.rim,
      )
    }
    popPad(L.foe.x, L.foe.y + 2, 44, 10)
    popPad(L.own.x, L.own.y - 4, 70, 15)
    return c
  }

  const PAINT = { current: paintCurrent, daybreak: paintDaybreak, night: paintNight, pop: paintPop }

  /** A battle background: { cv, layout, dyn(g, t) }. */
  function background(style, W, H) {
    return cached(`bg|${style}|${W}|${H}|${!!IMG.grass}`, () => {
      const L = layoutFor(style, W, H)
      const cv = PAINT[style](W, H, L)
      return { cv, layout: L, dyn: DYN[style] ? (g, t) => DYN[style](g, t, W, H, L) : () => {} }
    })
  }

  const DYN = {
    daybreak(g, t, W, H) {
      // Pollen drifting in the light.
      for (let i = 0; i < 14; i++) {
        const sp = 3 + (i % 5)
        const x = ((i * 53.7 + t * sp) % (W + 10)) - 5
        const y = H * 0.25 + ((i * 37) % (H * 0.6)) + Math.sin(t * 0.8 + i) * 4
        if ((Math.floor(t * 2 + i) & 3) !== 0) px(g, x, y, LOOK.daybreak.motes)
      }
    },
    night(g, t, W, H, L) {
      const P = LOOK.night
      // Twinkles: a few stars flare into crosses on their own beat.
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.6 + i * 0.37) % 1
        if (ph > 0.18) continue
        const x = (i * 71 + 13) % W,
          y = (i * 29 + 7) % Math.round(H * 0.4)
        const s = ph < 0.06 || ph > 0.12 ? 1 : 2
        rect(g, x - s, y, s * 2 + 1, 1, P.star[0])
        rect(g, x, y - s, 1, s * 2 + 1, P.star[0])
      }
      // Neon rims on the platforms breathe.
      const on = Math.sin(t * 2.4) > 0
      ellipseLine(g, L.foe.x, L.foe.y + 2, 46, 11, on ? P.pad.rim : P.pad.rim2)
      ellipseLine(g, L.own.x, L.own.y - 4, 72, 16, on ? P.pad.rim : P.pad.rim2)
      // Motes rising off the ground.
      for (let i = 0; i < 10; i++) {
        const life = (t * 0.25 + i * 0.13) % 1
        const x = ((i * 47 + 11) % W) + Math.sin(t + i) * 3
        const y = H - life * H * 0.55
        if (life < 0.9) px(g, x, y, P.motes[i % 2])
      }
    },
    pop(g, t, W, H) {
      // Sparkles pop in and out around the scene.
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.7 + i * 0.25) % 1
        if (ph > 0.3) continue
        const x = (i * 83 + 30) % W,
          y = 12 + ((i * 41) % Math.round(H * 0.45))
        const s = ph < 0.1 ? 1 : ph < 0.2 ? 3 : 2
        rect(g, x - s - 1, y - 1, s * 2 + 3, 3, LOOK.pop.ink)
        rect(g, x - 1, y - s - 1, 3, s * 2 + 3, LOOK.pop.ink)
        rect(g, x - s, y, s * 2 + 1, 1, LOOK.pop.spark)
        rect(g, x, y - s, 1, s * 2 + 1, LOOK.pop.spark)
      }
    },
  }

  /** Area banner art: a wide strip of the same scenery, no platforms. */
  function banner(style, W, H) {
    return cached(`banner|${style}|${W}|${H}|${!!IMG.plains}`, () => {
      if (style === 'current') {
        const c = canvas(118, 16)
        if (IMG.plains) c.g.drawImage(IMG.plains, 0, 0)
        return c
      }
      // Paint a tall scene and keep its horizon band.
      const full = PAINT[style](W, H * 3, { foe: { x: -999, y: -999 }, own: { x: -999, y: -999 } })
      const c = canvas(W, H)
      c.g.drawImage(full, 0, -Math.round(H * 1.05))
      return c
    })
  }

  // ------------------------------------------------------------------ Poké Balls
  const BALLS = {
    poke: { top: ['#ff8a78', '#ec3b33', '#a8231f'], name: 'Poké Ball', bonus: 1 },
    great: {
      top: ['#7fb3ff', '#3474e0', '#1f4aa0'],
      mark: ['#ff6b5e', '#d8312a'],
      name: 'Great Ball',
      bonus: 2,
    },
    ultra: {
      top: ['#5b5b6e', '#2d2d3a', '#18181f'],
      mark: ['#ffe066', '#e8b425'],
      name: 'Ultra Ball',
      bonus: 3,
    },
    master: {
      top: ['#b88af0', '#7d3fc4', '#4f2388'],
      mark: ['#ff8fc8', '#e0438f'],
      name: 'Master Ball',
      bonus: 10,
    },
  }
  const BOTTOM = ['#ffffff', '#e9e9f2', '#b9b9cc']
  const OUT = '#1b1626'

  /**
   * A ball as a pixel shader: any rotation, any opening, button colour, and `dim` for the darkened caught look.
   * R is the radius in pixels (6 in battle).
   */
  function ball(kind, angle = 0, o = {}) {
    const R = o.R || 6
    const open = o.open || 0
    const btn = o.button || '#ffffff'
    const dim = o.dim || 0
    const deg = Math.round((angle * 180) / Math.PI / 5) * 5
    const key = `ball|${kind}|${deg}|${Math.round(open * 8)}|${btn}|${Math.round(dim * 4)}|${R}`
    return cached(key, () => {
      const B = BALLS[kind]
      const S = 2 * R + 5 + Math.round(open * R * 1.4)
      const c0 = (S - 1) / 2
      const a = (deg * Math.PI) / 180,
        ca = Math.cos(a),
        sa = Math.sin(a)
      const oa = -open * 1.25 // the lid swings back around the hinge
      const hinge = [-R, 0]
      const col = (u, v, top) => {
        const d = Math.hypot(u, v)
        if (d > R + 0.45) return null
        if (d > R - 0.55) return OUT
        if (Math.abs(v) < 1.05) return OUT
        const bd = Math.hypot(u, v)
        if (bd < 2.6) return bd < 1.5 ? btn : OUT
        if (top === false && v < 0) return null
        if (top === true && v > 0) return null
        const ramp = v < 0 ? B.top : BOTTOM
        // Light from the top left: highlight, body, shade.
        const l = (-u * 0.7 - v * 0.9) / R
        let c = l > 0.55 ? ramp[0] : u * 0.6 + v * 0.8 > R * 0.55 ? ramp[2] : ramp[1]
        if (v < 0 && B.mark) {
          if (kind === 'great' && Math.abs(u) > R * 0.42 && v < -1.5 && v > -R * 0.75)
            c = l > 0.3 ? B.mark[0] : B.mark[1]
          if (kind === 'ultra' && Math.abs(u) > R * 0.3 && Math.abs(u) < R * 0.62 && v < -1.5)
            c = l > 0.2 ? B.mark[0] : B.mark[1]
          if (
            kind === 'master' &&
            (Math.hypot(u + R * 0.48, v + R * 0.42) < 1.7 || Math.hypot(u - R * 0.48, v + R * 0.42) < 1.7)
          )
            c = B.mark[0]
          if (kind === 'master' && Math.abs(u) < 0.6 && v < -R * 0.4 && v > -R * 0.8) c = '#ffffff'
        }
        if (Math.hypot(u + R * 0.42, v + R * 0.5) < 1.2) c = '#ffffff'
        return dim ? mix(c, '#3a3450', dim * 0.45) : c
      }
      return shade(S, S, (x, y) => {
        // Undo the ball's own rotation.
        const dx = x - c0,
          dy = y - c0 + Math.round(open * R * 0.5)
        const u = dx * ca + dy * sa,
          v = -dx * sa + dy * ca
        if (open <= 0) return col(u, v, null)
        const bottom = v >= 0 ? col(u, v, false) : null
        if (bottom) return bottom
        // The lid: rotate the point back around the hinge before sampling the top half.
        const hu = u - hinge[0],
          hv = v - hinge[1]
        const tu = hu * Math.cos(-oa) - hv * Math.sin(-oa) + hinge[0]
        const tv = hu * Math.sin(-oa) + hv * Math.cos(-oa) + hinge[1]
        return tv <= 0.4 ? col(tu, tv, true) : null
      })
    })
  }

  // ------------------------------------------------------------------ Pokémon Center interior
  const CENTER = {
    current: {
      wall: ['#f7f2e0', '#e8e0c8', '#d9cfb2'],
      band: ['#e86a5a', '#c2452d'],
      counter: ['#fbeeb0', '#e8b44a', '#b98a2c'],
      front: ['#e8e0c8', '#cfc5a8'],
      floor: ['#e8e0c8', '#d9cfb2'],
      machine: ['#6b6480', '#4a435e', '#2a2438'],
      glass: '#80b8b6',
      ink: '#2a2438',
      light: '#e8b44a',
    },
    daybreak: {
      wall: ['#fff8f6', '#ffeae6', '#f6d6d2'],
      band: ['#ff8fa3', '#f0627e'],
      counter: ['#ffffff', '#ffd8df', '#e9a8b6'],
      front: ['#ffc2cd', '#f3a2b3'],
      floor: ['#f4f1fb', '#e6e2f3'],
      machine: ['#8aa0c8', '#5d74a3', '#24304f'],
      glass: '#a9f0e4',
      ink: '#24304f',
      light: '#5fe0c8',
    },
    night: {
      wall: ['#1d1f3f', '#171936', '#10122a'],
      band: ['#ff2e6e', '#b0164a'],
      counter: ['#39408a', '#262c66', '#151a40'],
      front: ['#1b2048', '#121636'],
      floor: ['#0f1328', '#0b0e20'],
      machine: ['#2b3366', '#1a2048', '#05060d'],
      glass: '#3ef0ff',
      ink: '#05060d',
      light: '#3ef0ff',
    },
    pop: {
      wall: ['#fff6e5', '#ffe9c2', '#ffd890'],
      band: ['#ff4f9a', '#d92c78'],
      counter: ['#ffffff', '#ffd84d', '#e0a800'],
      front: ['#7b4dff', '#5b2fe0'],
      floor: ['#ffe9c2', '#ffd890'],
      machine: ['#00c2a8', '#00957f', '#1a1423'],
      glass: '#c8fff6',
      ink: '#1a1423',
      light: '#ff4f9a',
    },
  }
  // One cradle per team member: a team is three Pokémon at most.
  const SLOTS = [
    [102, 93],
    [120, 93],
    [138, 93],
  ]

  function center(style, W, H) {
    return cached(`center|${style}|${W}|${H}`, () => {
      const P = CENTER[style]
      const c = shade(W, H, (x, y) => {
        if (y < 104) {
          if (y >= 60 && y < 70)
            return y === 60 ? P.band[0] : y >= 68 ? P.band[1] : P.band[0 + ((x + y) % 7 === 0 ? 1 : 0)]
          if (x % 30 === 0) return P.wall[2]
          return vgrad(P.wall, y, x, 0, 104)
        }
        // Floor: tiles, darker in the counter's shadow.
        const tile = (Math.floor(x / 12) + Math.floor((y - 104) / 6)) % 2 ? P.floor[0] : P.floor[1]
        return y < 132 && bayer(x, y) < (132 - y) / 40 ? P.floor[1] : tile
      })
      const g = c.g
      // The Poké Ball emblem on the back wall.
      const ex = Math.round(W / 2),
        ey = 30
      const soft = mix(P.band[0], P.wall[0], 0.45)
      g.drawImage(
        shade(45, 45, (x, y) => {
          const dx = x - 22,
            dy = y - 22,
            d = Math.hypot(dx, dy)
          if (d > 21.4) return null
          if (d > 19.4 || Math.abs(dy) < 2 || (d < 6.5 && d > 4.2)) return P.wall[2]
          if (d <= 4.2) return P.wall[0]
          return dy < 0 ? soft : P.wall[0]
        }),
        ex - 22,
        ey - 22,
      )
      // Wall monitor that will carry the heart line.
      rect(g, 32, 20, 40, 26, P.ink)
      rect(g, 34, 22, 36, 22, P.machine[2])
      rect(g, 50, 46, 4, 10, P.ink)
      // Counter: top lit edge, body, front panel with seams.
      rect(g, 0, 100, W, 3, P.counter[0])
      rect(g, 0, 103, W, 3, P.counter[1])
      rect(g, 0, 106, W, 1, P.counter[2])
      rect(g, 0, 107, W, 24, P.front[0])
      for (let x = 6; x < W; x += 16) rect(g, x, 108, 1, 22, P.front[1])
      rect(g, 0, 130, W, 2, P.ink)
      // Healing machine.
      rect(g, 84, 80, 72, 24, P.ink)
      rect(g, 86, 81, 68, 21, P.machine[1])
      rect(g, 86, 81, 68, 2, P.machine[0])
      rect(g, 86, 100, 68, 2, P.machine[2])
      for (const [sx, sy] of SLOTS) {
        ellipse(g, sx, sy + 1, 7, 4, P.machine[2])
        ellipseLine(g, sx, sy + 1, 7, 4, P.machine[0], Math.PI * 0.1, Math.PI * 0.9)
      }
      rect(g, 104, 76, 32, 5, P.ink)
      rect(g, 106, 77, 28, 3, P.machine[0])
      return c
    })
  }

  window.SCN = { IMG, loadImage, LOOK, background, layoutFor, banner, ball, BALLS, center, CENTER, SLOTS }
})()
