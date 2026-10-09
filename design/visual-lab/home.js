/*
 * Pokédice Visual Lab: the Home screen prototype (Johto Daybreak, Jersey 20).
 * The team roams the current area seen from the front; CONTINUE is the one big action; areas open in a sheet with
 * search, filters and sorting; the newest secret area and the Day Care sit underneath as widgets.
 */
;(function () {
  'use strict'
  const {
    clamp,
    lerp,
    rng,
    ease,
    rect,
    px,
    ellipse,
    ellipseLine,
    softEllipse,
    glow,
    shade,
    canvas,
    bayer,
    sprite,
    size,
  } = PX
  const W = 288,
    H = 276
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const fold = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[♀♂’'.]/g, '')
      .toLowerCase()

  // ------------------------------------------------------------------ the player's state (a plausible mid-game save)
  const TEAM = [
    { dex: 6, key: 'front-charizard', name: 'Charizard', lv: 36, hp: [126, 126], speed: 14, hop: 1 },
    { dex: 25, key: 'front-pikachu', name: 'Pikachu', lv: 32, hp: [29, 71], speed: 26, hop: 5 },
    { dex: 131, key: 'front-lapras', name: 'Lapras', lv: 30, hp: [140, 140], speed: 9, hop: 0, water: true },
    {
      dex: 143,
      key: 'front-snorlax',
      name: 'Snorlax',
      lv: 31,
      hp: [160, 160],
      speed: 6,
      hop: 0,
      sleepy: true,
    },
    { dex: 65, key: 'front-alakazam', name: 'Alakazam', lv: 33, hp: [90, 90], speed: 12, float: true },
    { dex: 135, key: 'front-jolteon', name: 'Jolteon', lv: 29, hp: [79, 79], speed: 34, hop: 3 },
  ]
  const SAVE = {
    trainer: 'Sam',
    gold: 1240,
    badges: 5,
    current: 15,
    round: 2,
    secretSeen: false,
    dayCare: [
      { dex: 133, name: 'Eevee', lv: 22, gain: 2, xp: 1, ready: true },
      { dex: 147, name: 'Dratini', lv: 18, gain: 1, xp: 0.45, mins: 40 },
    ],
  }
  let K = null
  let caught = new Set()

  /** The Pokédex of this save: everything met on the way here, 61 species, so the Power Plant has just opened. */
  function buildPokedex() {
    const order = []
    for (const a of K.areas)
      if (!a.hidden && a.order <= SAVE.current) for (const d of a.dex) if (!order.includes(d)) order.push(d)
    const want = new Set(TEAM.map((m) => m.dex).concat([133, 147, 1, 4, 7]))
    for (const d of order) if (want.size < 61) want.add(d)
    caught = want
  }
  const areaBy = (order) => K.areas.find((a) => a.order === order)
  function statusOf(a) {
    if (a.hidden) {
      const c = a.unlock[0] || {}
      if (c.kind === 'pokedex')
        return caught.size >= c.n ? (a.name === 'Power Plant' && !SAVE.secretSeen ? 'new' : 'open') : 'locked'
      if (c.kind === 'level') return 'locked'
      if (c.kind === 'area') return 'cleared'
      return 'locked'
    }
    if (a.order === SAVE.current) return 'here'
    if (a.order < SAVE.current) return 'cleared'
    return 'locked'
  }
  function lockReason(a) {
    if (!a.hidden) {
      const prev = K.areas.filter((x) => !x.hidden && x.order < a.order).pop()
      return `Clear ${prev ? prev.name : 'the area before'}`
    }
    const c = a.unlock[0] || {}
    if (c.kind === 'pokedex') return `Catch ${c.n} species · ${caught.size}/${c.n}`
    if (c.kind === 'level')
      return `Raise a Pokémon to Lv.${c.n} · best Lv.${Math.max(...TEAM.map((m) => m.lv))}`
    return 'Secret'
  }
  const toCatch = (a) => a.dex.filter((d) => !caught.has(d))
  const bannerFile = (a) => (a.banner || 'default.png').split('#')[0]
  const bannerFlip = (a) => (a.banner || '').includes('#flip')

  // ------------------------------------------------------------------ scenery per biome (Daybreak palette)
  const BIOME_OF = {
    forest: 'forest',
    swamp: 'marsh',
    cave: 'cave',
    cave_dark: 'cave',
    crystal_cave: 'cave',
    factory: 'plant',
    ocean: 'coast',
    beach: 'coast',
    sunset: 'dusk',
    haunted: 'dusk',
    volcano: 'dusk',
  }
  const biomeOf = (a) => BIOME_OF[bannerFile(a).replace('.png', '')] || 'meadow'
  const OUT = {
    meadow: {
      sky: ['#76bff3', '#8ccbf6', '#a5d8f8', '#bfe4f9', '#d8eef8', '#f1efe6', '#fde4c8'],
      sun: '#fff6d6',
      far: ['#c8d6f0', '#a9bde6', '#93a8d9'],
      hill: ['#bde6a6', '#92d08a', '#6fb978'],
      tree: ['#7cc574', '#55a466', '#3c8457'],
      field: ['#a7de82', '#97d576', '#87cb6b', '#79bf62'],
      tuft: '#5fae55',
      flowers: ['#ffffff', '#ffe36b', '#ff9cc2'],
      cloud: ['#ffffff', '#eaf3fb', '#d3e3f3'],
    },
    dusk: {
      sky: ['#4e4a8c', '#7a5a9e', '#b2689a', '#e0808a', '#f4a07c', '#ffc890', '#ffe0a8'],
      sun: '#ffe9b0',
      far: ['#b58ab8', '#8d6aa4', '#6c5290'],
      hill: ['#b9b878', '#93a064', '#6f8452'],
      tree: ['#8ba25e', '#66804c', '#4a603e'],
      field: ['#c2bc78', '#b0ae6a', '#9ea060', '#8c9258'],
      tuft: '#77804a',
      flowers: ['#ffe0a8', '#ff9cc2', '#ffffff'],
      cloud: ['#ffe9d0', '#f6c8b8', '#d8a0a8'],
    },
  }
  OUT.marsh = OUT.meadow
  OUT.coast = OUT.meadow

  function ridge(n, base, amp, seed, freqs = [0.021, 0.047, 0.11]) {
    const r = rng(seed)
    const ph = freqs.map(() => r() * 6.28)
    return Array.from({ length: n }, (_, x) => {
      let v = 0
      freqs.forEach((f, i) => (v += Math.sin(x * f + ph[i]) / (i + 1)))
      return Math.round(base - Math.abs(v) * amp)
    })
  }
  const vgrad = (cols, y, x, y0, y1) => {
    const t = clamp((y - y0) / Math.max(1, y1 - y0)) * (cols.length - 1)
    const i = Math.floor(t)
    return t - i > bayer(x, y) ? cols[Math.min(cols.length - 1, i + 1)] : cols[i]
  }
  function clouds(g, P, list) {
    for (const [cx, cy, s] of list) {
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
  }

  /** An outdoor area: sky, a far range, hills with a tree line, the field the team walks on. */
  function paintOutdoor(kind) {
    const P = OUT[kind]
    const hy = Math.round(H * 0.34)
    const far = ridge(W, hy + 2, H * 0.12, 7)
    const hill = ridge(W, hy + 12, H * 0.05, 19, [0.018, 0.05, 0.09])
    const coast = kind === 'coast'
    const seaTop = hy + 4,
      seaBot = hy + 34
    const c = shade(W, H, (x, y) => {
      if (y < far[x] && !(coast && y >= seaTop)) {
        let col = vgrad(P.sky, y, x, 0, hy + 4)
        const d = Math.hypot(x - W * 0.84, y - H * 0.07) / (H * 0.17)
        if (d < 0.55 || (d < 0.8 && (x + y) % 2 === 0) || (d < 1 && x % 2 === 0 && y % 2 === 0)) col = P.sun
        return col
      }
      if (coast) {
        if (y < seaBot) {
          // The sea: banded blues with lighter wave rows.
          const k = (y - seaTop) / (seaBot - seaTop)
          if ((y + Math.floor(x / 9)) % 6 === 0 && k > 0.2) return '#d8f1ff'
          return k < 0.3 ? '#7cc8f0' : k < 0.65 ? '#5ab4e8' : '#4aa2dc'
        }
        if (y < seaBot + 3) return (x + y) % 3 ? '#fff8e8' : '#bfe8ff'
        return vgrad(['#f6e2b4', '#efd6a2', '#e8ca92', '#ddbd84'], y, x, seaBot, H)
      }
      if (y < hill[x]) {
        if (y - far[x] < 1) return P.far[0]
        return y > hy + 6 && bayer(x, y) < 0.5 ? P.far[2] : P.far[1]
      }
      const top = hill[x]
      if (y - top < 1) return P.hill[0]
      if (y - top < 5) return bayer(x, y) < (y - top) / 5 ? P.hill[2] : P.hill[1]
      return vgrad(P.field, y, x, top + 4, H)
    })
    const g = c.g
    const r = rng(kind.length * 17 + 3)
    clouds(g, P, [
      [W * 0.18, H * 0.1, 1],
      [W * 0.52, H * 0.05, 0.7],
      [W * 0.66, H * 0.17, 0.85],
    ])
    if (!coast)
      for (let x = 4; x < W; x += r.int(9, 15)) {
        const y = hill[Math.min(W - 1, x)] + 1,
          rr = r.int(4, 7)
        ellipse(g, x, y - rr + 2, rr, rr, P.tree[2])
        ellipse(g, x - 1, y - rr + 1, rr - 1, rr - 1, P.tree[1])
        ellipse(g, x - 2, y - rr, Math.max(1, rr - 3), Math.max(1, rr - 3), P.tree[0])
      }
    const groundTop = coast ? seaBot + 4 : hy + 16
    for (let i = 0; i < W * 0.7; i++) {
      const x = r.int(0, W - 1),
        y = r.int(groundTop, H - 1)
      if (r() < (y - groundTop) / (H - groundTop) + 0.15) {
        const col = coast ? '#d0ae74' : P.tuft
        px(g, x, y, col)
        if (!coast) {
          px(g, x - 1, y - 1, col)
          px(g, x + 1, y - 1, col)
        }
        if (!coast && r() < 0.1) px(g, x, y - 2, r.pick(P.flowers))
        if (coast && r() < 0.05) {
          px(g, x, y, '#ffffff')
          px(g, x + 1, y, '#ff9cc2')
        }
      }
    }
    const world = {
      cv: c,
      walk: { x0: 22, x1: W - 22, y0: Math.round(groundTop + (H - groundTop) * 0.3), y1: H - 8 },
    }
    if (kind === 'marsh') {
      // Safari Zone: a pond on the left where Lapras swims, reeds on its rim.
      const pond = { x: Math.round(W * 0.26), y: Math.round(H * 0.8), rx: 50, ry: 15 }
      ellipse(g, pond.x, pond.y + 2, pond.rx + 2, pond.ry + 2, '#6fb978')
      ellipse(g, pond.x, pond.y, pond.rx, pond.ry, '#5aa9e0')
      ellipse(g, pond.x + 3, pond.y + 3, pond.rx - 8, pond.ry - 5, '#4a96d4')
      ellipseLine(g, pond.x, pond.y, pond.rx, pond.ry, '#bfe6ff', Math.PI * 1.05, Math.PI * 1.9)
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.9 + r() * 1.2),
          x = Math.round(pond.x + Math.cos(a) * (pond.rx + 1)),
          y = Math.round(pond.y + Math.sin(a) * (pond.ry + 1))
        for (let k = 0; k < 3; k++)
          rect(g, x + k * 2 - 2, y - 6 - (k % 2) * 2, 1, 7 + (k % 2) * 2, k === 1 ? '#3c8457' : '#55a466')
        rect(g, x, y - 9, 1, 2, '#8a5a3a')
      }
      world.pond = pond
    }
    world.fg = foreground(kind === 'coast' ? null : P)
    world.dyn = (gg, t) => {
      for (let i = 0; i < 14; i++) {
        const x = ((i * 53.7 + t * (3 + (i % 5))) % (W + 10)) - 5
        const y = H * 0.18 + ((i * 37) % (H * 0.5)) + Math.sin(t * 0.8 + i) * 4
        if ((Math.floor(t * 2 + i) & 3) !== 0) px(gg, x, y, kind === 'dusk' ? '#ffd8a0' : '#fff3b0')
      }
      if (coast)
        for (let i = 0; i < 6; i++) {
          // Glints riding the waves.
          const x = Math.round(((i * 61 + t * 9) % (W + 20)) - 10),
            y = seaTop + 6 + ((i * 7) % 22)
          if (Math.sin(t * 3 + i) > 0.3) rect(gg, x, y, 3, 1, '#ffffff')
        }
      if (world.pond) {
        const p = world.pond
        const k = (t * 0.6) % 1
        ellipseLine(
          gg,
          p.x + 12,
          p.y + 2,
          Math.round(4 + 10 * k),
          Math.round(1 + 3 * k),
          k < 0.6 ? '#bfe6ff' : '#7cc8f0',
        )
      }
    }
    return world
  }
  /** Tall grass along the bottom edge, drawn over the team so they walk through it. */
  function foreground(P) {
    const c = canvas(W, H)
    if (!P) return c
    const g = c.g
    const r = rng(77)
    for (let x = -4; x < W + 4; x += r.int(5, 9)) {
      const h = r.int(5, 11)
      for (let k = 0; k < 4; k++) rect(g, x + k * 2, H - h + (k % 2) * 3, 1, h, k % 2 ? P.hill[2] : P.tuft)
      rect(g, x + 2, H - h - 1, 1, 1, P.hill[0])
    }
    return c
  }
  function paintForest() {
    const hy = Math.round(H * 0.4)
    const c = shade(W, H, (x, y) => {
      if (y < hy) return vgrad(['#9ed8f6', '#c4ecf6', '#e4f6e8'], y, x, 0, H * 0.2)
      return vgrad(['#5fae60', '#56a35a', '#4b9852', '#3f8a4a'], y, x, hy, H)
    })
    const g = c.g
    const r = rng(5)
    // A wall of canopy: three layers of round trees, darker as they recede.
    for (const [base, cols, step] of [
      [H * 0.3, ['#3c8457', '#2f6e49', '#255c3d'], 15],
      [H * 0.36, ['#55a466', '#3c8457', '#2f6e49'], 18],
      [H * 0.42, ['#7cc574', '#55a466', '#3c8457'], 22],
    ])
      for (let x = -10; x < W + 10; x += step + r.int(-3, 3)) {
        const rr = r.int(13, 20),
          y = Math.round(base - r.int(0, 10))
        rect(g, x - 2, y, 4, Math.round(H * 0.06), '#6b4a34')
        ellipse(g, x, y, rr, rr, cols[2])
        ellipse(g, x - 2, y - 2, rr - 3, rr - 3, cols[1])
        ellipse(g, x - 5, y - 6, Math.max(2, rr - 10), Math.max(2, rr - 11), cols[0])
      }
    // Dappled light on the floor.
    for (let i = 0; i < 26; i++)
      softEllipse(
        g,
        r.int(0, W),
        r.int(Math.round(H * 0.52), H),
        r.int(6, 14),
        r.int(2, 4),
        '#8fd27a',
        0.6,
        0.6,
      )
    for (let i = 0; i < 10; i++) {
      const x = r.int(10, W - 10),
        y = r.int(Math.round(H * 0.55), H - 6)
      rect(g, x, y, 1, 3, '#f4ead8')
      rect(g, x - 1, y - 1, 3, 1, i % 2 ? '#ff6a5a' : '#ffbe2e')
    }
    return {
      cv: c,
      walk: { x0: 22, x1: W - 22, y0: Math.round(H * 0.6), y1: H - 8 },
      fg: foreground(OUT.meadow),
      dyn: OUT_DYN_FOREST,
    }
  }
  function OUT_DYN_FOREST(g, t) {
    // Light motes drifting down through the canopy.
    for (let i = 0; i < 12; i++) {
      const y = ((i * 41 + t * 6) % (H * 0.6)) + H * 0.3,
        x = ((i * 67) % W) + Math.sin(t + i) * 4
      if ((Math.floor(t * 3 + i) & 3) !== 0) px(g, x, y, '#fff3b0')
    }
  }
  function paintCave(kind) {
    const plant = kind === 'plant'
    const wallC = plant ? ['#3a4466', '#46527a', '#56638c'] : ['#3a3352', '#4a4166', '#5a507a']
    const floorC = plant ? ['#6a7090', '#5e6484', '#535878'] : ['#7a6e86', '#6e637c', '#625870']
    const hy = Math.round(H * 0.46)
    const c = shade(W, H, (x, y) => (y < hy ? vgrad(wallC, y, x, 0, hy) : vgrad(floorC, y, x, hy, H)))
    const g = c.g
    const r = rng(13)
    rect(g, 0, hy, W, 2, plant ? '#2a3150' : '#2c2640')
    // Stalactites, or pipes in the Power Plant.
    for (let x = 0; x < W; x += r.int(10, 22)) {
      if (plant) {
        rect(g, x, 0, 5, r.int(20, 60), '#7a86aa')
        rect(g, x + 1, 0, 1, 60, '#a8b4d4')
        continue
      }
      const h = r.int(10, 34)
      for (let k = 0; k < h; k++)
        rect(
          g,
          x - Math.round((1 - k / h) * 4),
          k,
          Math.max(1, Math.round((1 - k / h) * 8)),
          1,
          k % 5 ? '#2c2640' : '#5a507a',
        )
    }
    // Crystals (cave) or warning lamps (plant), glowing.
    for (let i = 0; i < 7; i++) {
      const x = r.int(8, W - 8),
        y = r.int(Math.round(hy * 0.45), hy - 6)
      const col = plant ? '#ffd23a' : i % 2 ? '#8ff0ff' : '#ff9ad8'
      g.drawImage(glow(10, col, 1.6, 0.5), x - 10, y - 10)
      for (let k = 0; k < 5; k++)
        rect(g, x - (k > 2 ? 4 - k : k), y - 4 + k, 1 + Math.min(k, 4 - k) * 2, 1, col)
    }
    for (let i = 0; i < 14; i++) {
      const x = r.int(0, W),
        y = r.int(hy + 8, H)
      ellipse(g, x, y, r.int(3, 7), r.int(2, 3), floorC[2])
      rect(g, x - 2, y - 2, 3, 1, floorC[0])
    }
    return {
      cv: c,
      walk: { x0: 22, x1: W - 22, y0: hy + 24, y1: H - 8 },
      fg: canvas(W, H),
      dyn: (gg, t) => {
        if (plant)
          for (let i = 0; i < 3; i++) {
            // Sparks on the Power Plant's pipes.
            const ph = (t * 1.3 + i * 0.37) % 1
            if (ph < 0.12) {
              const x = (i * 97 + 20) % W,
                y = 30 + i * 9
              rect(gg, x - 2, y, 5, 1, '#fff6a8')
              rect(gg, x, y - 2, 1, 5, '#fff6a8')
            }
          }
        else
          for (let i = 0; i < 8; i++) {
            const y = (i * 37 + t * 4) % H,
              x = (i * 53) % W
            if ((Math.floor(t * 2 + i) & 3) === 0) px(gg, x, y, '#cfc4ff')
          }
      },
    }
  }
  const WORLD = {
    meadow: () => paintOutdoor('meadow'),
    dusk: () => paintOutdoor('dusk'),
    marsh: () => paintOutdoor('marsh'),
    coast: () => paintOutdoor('coast'),
    forest: paintForest,
    cave: () => paintCave('cave'),
    plant: () => paintCave('plant'),
  }
  const worldCache = {}
  const worldFor = (biome) => (worldCache[biome] = worldCache[biome] || WORLD[biome]())

  // ------------------------------------------------------------------ the team, roaming
  const BUBBLE = [
    '.xxxxxxxxx.',
    'x.........x',
    'x.........x',
    'x.........x',
    'x.........x',
    'x.........x',
    '.xxxxxxxxx.',
    '...xx......',
    '...x.......',
  ]
  const EMOTE = {
    heart: { c: '#ff5a6e', m: ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'] },
    note: { c: '#3a7be0', m: ['..xx.', '..x.x', '..x..', 'xxx..', 'xx...'] },
    z: { c: '#24304f', m: ['xxxx.', '..x..', '.x...', 'xxxx.', '.....'] },
    bang: { c: '#f2553f', m: ['..x..', '..x..', '..x..', '.....', '..x..'] },
    spark: { c: '#e8a800', m: ['...x.', '..x..', '.xxx.', '..x..', '.x...'] },
  }
  function bubble(kind) {
    return PX.cached(`emote|${kind}`, () => {
      const E = EMOTE[kind]
      return shade(11, 9, (x, y) => {
        const ch = BUBBLE[y][x]
        if (ch === 'x') return '#24304f'
        const inside = y >= 1 && y <= 5 && x >= 1 && x <= 9
        if (!inside && !(y === 6 && x > 0 && x < 10)) return null
        if (y >= 1 && y <= 5 && x >= 3 && x <= 7 && E.m[y - 1][x - 3] === 'x') return E.c
        return inside ? '#ffffff' : null
      })
    })
  }

  class Mon {
    constructor(def, r) {
      Object.assign(this, def)
      this.r = r
      this.anim = r() * 5000
      this.face = r() < 0.5 ? -1 : 1
      this.state = 'idle'
      this.timer = r.range(0.3, 1.8)
      this.phase = 0
      this.hopT = -1
      this.emote = null
      this.tired = def.hp[0] / def.hp[1] < 0.5
      this.sz = size(def.key)
    }
    place(world, others) {
      const p = this.spot(world, others)
      this.x = p.x
      this.y = p.y
    }
    spot(world, others = []) {
      const { x0, x1, y0, y1 } = world.walk
      for (let i = 0; i < 24; i++) {
        let x, y
        if (this.water && world.pond) {
          const a = this.r() * Math.PI * 2,
            k = Math.sqrt(this.r()) * 0.6
          x = world.pond.x + Math.cos(a) * world.pond.rx * k
          y = world.pond.y + Math.sin(a) * world.pond.ry * k + 4
        } else {
          x = lerp(x0 + this.sz.w * 0.3, x1 - this.sz.w * 0.3, this.r())
          y = lerp(y0, y1, this.r())
        }
        const inPond =
          world.pond &&
          !this.water &&
          ((x - world.pond.x) / (world.pond.rx + this.sz.w * 0.55)) ** 2 +
            ((y - world.pond.y) / (world.pond.ry + 12)) ** 2 <
            1
        const crowded = others.some(
          (o) =>
            o !== this &&
            o.x != null &&
            Math.abs(o.x - x) < (o.sz.w + this.sz.w) * 0.32 &&
            Math.abs(o.y - y) < 14,
        )
        if (!inPond && (!crowded || i > 18)) return { x, y }
      }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
    }
    say(kind, t) {
      this.emote = { kind, t0: t }
    }
    update(dt, t, world, mons) {
      const rate = this.tired ? 0.6 : this.state === 'sleep' ? 0.45 : 1
      this.anim += dt * 1000 * rate
      if (this.hopT >= 0 && (this.hopT += dt) > 0.4) this.hopT = -1
      if (this.emote && t - this.emote.t0 > 1.8) this.emote = null
      if (REDUCED) return
      this.timer -= dt
      if (this.state === 'idle') {
        if (this.timer > 0) return
        if (this.sleepy && this.r() < 0.75) {
          this.state = 'sleep'
          this.timer = this.r.range(5, 9)
          return
        }
        this.target = this.spot(world, mons)
        this.state = 'walk'
      } else if (this.state === 'sleep') {
        if (!this.emote && this.r() < dt * 0.8) this.say('z', t)
        if (this.timer <= 0) {
          this.state = 'idle'
          this.timer = this.r.range(1, 2)
        }
      } else if (this.state === 'walk') {
        const dx = this.target.x - this.x,
          dy = this.target.y - this.y,
          d = Math.hypot(dx, dy)
        const sp = this.speed * (this.tired ? 0.55 : 1)
        if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1
        this.phase += dt * (sp / 7)
        if (d < 1.5) {
          this.state = 'idle'
          this.timer = this.r.range(1.2, 3.8)
          this.phase = 0
          // Bumping into a friend: face them and say hello.
          const friend = mons.find(
            (o) =>
              o !== this && o.state === 'idle' && Math.abs(o.x - this.x) < 46 && Math.abs(o.y - this.y) < 18,
          )
          if (friend && this.r() < 0.6) {
            this.face = friend.x > this.x ? 1 : -1
            friend.face = -this.face
            this.say(this.r() < 0.5 ? 'note' : 'heart', t)
            friend.say('note', t + 0.3)
          } else if (this.tired && this.r() < 0.5) this.say('bang', t)
          else if (this.key === 'front-pikachu' && this.r() < 0.4) this.say('spark', t)
          return
        }
        this.x += (dx / d) * Math.min(d, sp * dt)
        this.y += (dy / d) * Math.min(d, sp * dt)
      }
    }
    draw(g, t, world) {
      let lift = 0
      if (this.state === 'walk' && this.hop) lift = Math.abs(Math.sin(this.phase * Math.PI)) * this.hop
      if (this.float) lift = 3 + Math.round(Math.sin(t * 2 + this.anim * 0.001) * 2)
      if (this.hopT >= 0) lift += Math.sin((this.hopT / 0.4) * Math.PI) * 9
      const x = Math.round(this.x),
        y = Math.round(this.y)
      const swim = this.water && world.pond
      if (!swim)
        softEllipse(g, x, y, Math.round(this.sz.w * 0.28), 3, '#24304f', this.float ? 0.25 : 0.4, 0.8)
      if (swim) {
        g.save()
        g.beginPath()
        g.rect(0, 0, W, y - 7)
        g.clip()
      }
      sprite(g, this.key, x, y - Math.round(lift), this.anim, { flip: this.face > 0 })
      if (swim) {
        g.restore()
        ellipseLine(g, x, y - 7, Math.round(this.sz.w * 0.4), 3, '#d8f1ff')
      }
      const top = y - Math.round(lift) - this.sz.h
      if (this.tired && Math.floor(t * 1.5) % 3 === 0) {
        // A sweat drop: tired, heal soon.
        rect(g, x + Math.round(this.sz.w * 0.22), top + 10, 2, 3, '#7cc8f0')
        rect(g, x + Math.round(this.sz.w * 0.22), top + 9, 1, 1, '#ffffff')
      }
      if (this.emote) {
        const p = clamp((t - this.emote.t0) / 0.18)
        if (p > 0 && !(t - this.emote.t0 > 1.5 && Math.floor(t * 12) % 2)) {
          const im = bubble(this.emote.kind)
          const bx = x + Math.round(this.sz.w * 0.12),
            by = top - 6 - Math.round(3 * ease.outBack(p))
          g.drawImage(im, bx, by)
        }
      }
    }
    hit(px0, py0) {
      const w = this.sz.w * 0.8,
        h = this.sz.h
      return px0 > this.x - w / 2 && px0 < this.x + w / 2 && py0 > this.y - h && py0 < this.y + 4
    }
  }

  // ------------------------------------------------------------------ the screen
  let world = null
  let mons = []
  let cv,
    g,
    t = 0,
    last = 0,
    running = false,
    visible = true
  let cardTimer = 0

  function setArea(order, announce) {
    SAVE.current = order
    const a = areaBy(order)
    world = worldFor(biomeOf(a))
    const r = rng(order * 101 + 7)
    mons = TEAM.map((d) => new Mon(d, rng(d.dex * 13 + order)))
    mons.forEach((m) => m.place(world, mons))
    renderArea()
    renderGo()
    $('#hm-cv').setAttribute('aria-label', `Your team in ${a.name}: ${TEAM.map((m) => m.name).join(', ')}`)
    if (announce) toast(`Now exploring ${a.name}`)
    void r
    if (REDUCED) draw()
  }

  function renderArea() {
    const a = areaBy(SAVE.current)
    const st = statusOf(a)
    const left = toCatch(a)
    const rounds = a.rounds || 1
    const done = st === 'cleared' ? rounds : Math.min(rounds, SAVE.round - 1)
    $('#hm-area').innerHTML = `
      <div class="hm-area-row"><b class="hm-area-name">${esc(a.name)}</b><span class="hm-lv">Lv.${a.lv[0]}–${a.lv[1]}</span></div>
      <div class="hm-area-row"><span class="hm-rounds" aria-label="${done} of ${rounds} rounds done">${Array.from({ length: rounds }, (_, i) => `<i class="${i < done ? 'on' : i === done && st !== 'cleared' ? 'now' : ''}"></i>`).join('')}</span>
      <span class="hm-caught" aria-label="${a.dex.length - left.length} of ${a.dex.length} species caught here"><img class="px" alt="" src="${BALL}" />${a.dex.length - left.length}/${a.dex.length}</span></div>`
  }
  function renderGo() {
    const a = areaBy(SAVE.current)
    const st = statusOf(a)
    const sub =
      st === 'cleared'
        ? 'Cleared · free play'
        : `Round ${Math.min(SAVE.round, a.rounds || 1)} of ${a.rounds || 1}`
    $('#hm-go').innerHTML =
      `<span class="hm-go-in"><img class="px" alt="" src="${PLAY}" /><span><b>Continue</b><small>${esc(sub)}</small></span></span>`
    $('#hm-go').setAttribute('aria-label', `Continue in ${a.name}, ${sub}`)
  }

  function renderWidgets() {
    const pp = K.areas.find((a) => a.name === 'Power Plant')
    const secret = $('#hm-secret')
    if (statusOf(pp) === 'new') {
      secret.innerHTML = `<span class="hm-w-head"><b>Secret area</b><span class="hm-new">NEW</span></span>
        <span class="hm-ban"><img class="px" alt="" src="assets/banners/${bannerFile(pp)}" /></span>
        <span class="hm-w-title">${esc(pp.name)}</span><span class="hm-w-sub">60 species caught</span>`
      secret.setAttribute(
        'aria-label',
        'New secret area: Power Plant, unlocked by catching 60 species. Travel there.',
      )
      secret.disabled = false
    } else {
      const fi = K.areas.find((a) => a.name === 'Faraway Island')
      const n = fi.unlock[0].n
      secret.innerHTML = `<span class="hm-w-head"><b>Next secret</b></span>
        <span class="hm-ban dim"><img class="px" alt="" src="assets/banners/${bannerFile(fi)}" /><img class="px lock" alt="" src="${LOCK}" /></span>
        <span class="hm-w-title">${esc(fi.name)}</span><span class="hm-meter"><i style="width:${(caught.size / n) * 100}%"></i></span><span class="hm-w-sub">${caught.size}/${n} species</span>`
      secret.setAttribute(
        'aria-label',
        `Next secret area: ${fi.name}. ${caught.size} of ${n} species caught. Open the areas list.`,
      )
    }
    const ready = SAVE.dayCare.filter((d) => d && d.ready)
    const dc = $('#hm-daycare')
    dc.innerHTML = `<span class="hm-w-head"><b>Day Care</b>${ready.length ? `<span class="hm-new">TAP TO COLLECT</span>` : ''}</span>
      ${SAVE.dayCare
        .map((d) =>
          d
            ? `<span class="hm-dc"><span class="ico" style="background-position:-${((d.dex - 1) % 16) * 40}px -${Math.floor((d.dex - 1) / 16) * 30}px" aria-hidden="true"></span>
               <span class="hm-dc-mid"><span class="hm-dc-name">${esc(d.name)}${d.ready ? '' : ` <em>Lv.${d.lv}</em>`}</span><span class="hm-meter${d.ready ? ' full' : ''}"><i style="width:${d.xp * 100}%"></i></span></span>
               ${d.ready ? '<span class="hm-ready">Ready</span>' : `<span class="hm-dc-time">${d.mins}m</span>`}</span>`
            : `<span class="hm-dc empty"><span class="ico empty" aria-hidden="true"></span><span class="hm-dc-mid"><span class="hm-dc-name">Free slot</span><span class="hm-w-sub">Leave a Pokémon</span></span></span>`,
        )
        .join('')}`
    const words = SAVE.dayCare
      .map((d) =>
        !d ? 'one free slot' : d.ready ? `${d.name} is ready` : `${d.name}, ${d.mins} minutes left`,
      )
      .join('. ')
    dc.setAttribute('aria-label', `Day Care: ${words}.${ready.length ? ' Collect.' : ' Open the Day Care.'}`)
  }

  // ------------------------------------------------------------------ the areas sheet
  const SHEET = { q: '', filter: 'all', sort: 'route' }
  function openSheet(filter) {
    if (filter) SHEET.filter = filter
    const sh = $('#hm-sheet')
    sh.hidden = false
    sh.dataset.open = ''
    renderSheet()
    lastFocus = document.activeElement
    requestAnimationFrame(() => $('#hm-q').focus({ preventScroll: true }))
  }
  let lastFocus = null
  function closeSheet() {
    const sh = $('#hm-sheet')
    sh.hidden = true
    delete sh.dataset.open
    if (lastFocus) lastFocus.focus({ preventScroll: true })
  }
  function renderSheet() {
    const linear = K.areas.filter((a) => !a.hidden)
    const cleared = K.areas.filter((a) => statusOf(a) === 'cleared').length
    const secrets = K.areas.filter((a) => a.hidden)
    const found = secrets.filter((a) => statusOf(a) !== 'locked').length
    $('#hm-sheet-sub').textContent =
      `${cleared} cleared · ${found}/${secrets.length} secrets found · ${caught.size}/151 caught`
    void linear
    const q = fold(SHEET.q.trim())
    const speciesHits = q
      ? Object.entries(K.names)
          .filter(([, n]) => fold(n).includes(q))
          .map(([d]) => Number(d))
      : []
    let list = K.areas.map((a) => {
      const hits = speciesHits.filter((d) => a.dex.includes(d))
      return { a, st: statusOf(a), hits, left: toCatch(a) }
    })
    const counts = {
      all: list.length,
      catch: list.filter((x) => x.st !== 'locked' && x.left.length).length,
      secret: list.filter((x) => x.a.hidden).length,
      cleared: list.filter((x) => x.st === 'cleared').length,
    }
    $$('#hm-chips button').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.f === SHEET.filter))
      $('i', b).textContent = counts[b.dataset.f]
    })
    $$('#hm-sort button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.s === SHEET.sort)))
    if (SHEET.filter === 'catch') list = list.filter((x) => x.st !== 'locked' && x.left.length)
    if (SHEET.filter === 'secret') list = list.filter((x) => x.a.hidden)
    if (SHEET.filter === 'cleared') list = list.filter((x) => x.st === 'cleared')
    if (q) list = list.filter((x) => fold(x.a.name).includes(q) || x.hits.length)
    if (SHEET.sort === 'level') list.sort((x, y) => x.a.lv[0] - y.a.lv[0])
    else if (SHEET.sort === 'catch')
      list.sort((x, y) => y.left.length - x.left.length || x.a.order - y.a.order)
    else list.sort((x, y) => x.a.order - y.a.order)
    const ul = $('#hm-list')
    if (!list.length) {
      ul.innerHTML = `<li class="hm-empty">No area matches “${esc(SHEET.q)}”. Try an area or a Pokémon name, like “Pikachu”.</li>`
      return
    }
    ul.innerHTML = list
      .map(({ a, st, hits, left }) => {
        const locked = st === 'locked'
        const chip = {
          here: '<span class="hm-st here">You’re here</span>',
          cleared: '<span class="hm-st done">Cleared</span>',
          new: '<span class="hm-st new">New</span>',
          open: '<span class="hm-st open">Open</span>',
          locked: '<span class="hm-st lock">Locked</span>',
        }[st]
        const catchLine = locked
          ? `<span class="hm-why"><img class="px" alt="" src="${LOCK}" />${esc(lockReason(a))}</span>`
          : a.dex.length
            ? `<span class="hm-prog"><img class="px" alt="" src="${BALL}" />${a.dex.length - left.length}/${a.dex.length}${left.length ? ` · <b>${left.length} to catch</b>` : ' · all caught'}</span>`
            : `<span class="hm-prog">Trainers only</span>`
        const hitIcons = hits.length
          ? `<span class="hm-hits">${hits
              .slice(0, 6)
              .map(
                (d) =>
                  `<span class="hm-hit${caught.has(d) ? '' : ' new'}"><span class="ico" style="background-position:-${((d - 1) % 16) * 40}px -${Math.floor((d - 1) / 16) * 30}px"></span>${esc(K.names[d])}${caught.has(d) ? '' : ' · new'}</span>`,
              )
              .join('')}</span>`
          : ''
        const label = `${a.name}, levels ${a.lv[0]} to ${a.lv[1]}, ${locked ? 'locked: ' + lockReason(a) : st === 'here' ? 'you are here' : st}`
        return `<li><button type="button" class="hm-card-area${locked ? ' locked' : ''}${st === 'here' ? ' here' : ''}" data-order="${a.order}" ${locked ? 'aria-disabled="true"' : ''} aria-label="${esc(label)}">
          <span class="hm-ban${locked ? ' dim' : ''}${bannerFlip(a) ? ' flip' : ''}"><img class="px" alt="" src="assets/banners/${bannerFile(a)}" />${a.gym ? '<span class="hm-gym">GYM</span>' : ''}</span>
          <span class="hm-ca-row"><b>${esc(a.name)}</b>${chip}</span>
          <span class="hm-ca-row"><span class="hm-lv">Lv.${a.lv[0]}–${a.lv[1]}</span>${catchLine}</span>${hitIcons}</button></li>`
      })
      .join('')
  }

  // ------------------------------------------------------------------ toast, battle wipe, loop
  function toast(msg) {
    const el = $('#hm-toast')
    el.textContent = msg
    el.dataset.on = ''
    clearTimeout(toast.t)
    toast.t = setTimeout(() => delete el.dataset.on, 2400)
  }
  function battleWipe() {
    const a = areaBy(SAVE.current)
    const pool = toCatch(a).length ? toCatch(a) : a.dex
    const d = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 25
    const wipe = $('#hm-wipe')
    wipe.innerHTML = `${Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}<p><span class="ico" style="background-position:-${((d - 1) % 16) * 40}px -${Math.floor((d - 1) / 16) * 30}px"></span>A wild ${esc(K.names[d] || 'Pokémon')} appeared!</p>`
    if (REDUCED) {
      toast(`A wild ${K.names[d]} appeared! Battles live in the Animations tab.`)
      return
    }
    wipe.hidden = false
    wipe.dataset.on = ''
    setTimeout(() => (wipe.dataset.out = ''), 1500)
    setTimeout(() => {
      wipe.hidden = true
      delete wipe.dataset.on
      delete wipe.dataset.out
      toast('Battles play in the Animations tab')
    }, 2050)
  }

  function showCard(m) {
    const card = $('#hm-card')
    const p = m.hp[0] / m.hp[1]
    const note = m.tired ? 'Tired: heal at a Pokémon Center' : m.state === 'sleep' ? 'Napping' : ''
    card.innerHTML = `<span class="hm-card-row"><b>${esc(m.name)}</b><span class="hm-lv">Lv.${m.lv}</span></span>
      <div class="ui-hp"><span class="lbl">HP</span><span class="track"><span class="fill" style="width:${p * 100}%;--hp:${p > 0.5 ? 'var(--hp-hi)' : p > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)'}"></span></span><span class="num">${m.hp[0]}/${m.hp[1]}</span></div>${note ? `<span class="hm-card-note">${note}</span>` : ''}`
    const st = $('#hm-stage').getBoundingClientRect()
    const k = st.width / W
    const x = clamp(m.x * k - 85, 6, st.width - 176)
    const y = Math.max(54, (m.y - m.sz.h - 8) * k - 70)
    card.style.left = `${x}px`
    card.style.top = `${y}px`
    card.hidden = false
    clearTimeout(cardTimer)
    cardTimer = setTimeout(() => (card.hidden = true), 2600)
  }
  function poke(m) {
    m.hopT = 0
    m.say(m.state === 'sleep' ? 'bang' : 'heart', t)
    if (m.state === 'sleep') {
      m.state = 'idle'
      m.timer = 1.5
    }
    showCard(m)
  }

  function draw() {
    g.clearRect(0, 0, W, H)
    g.drawImage(world.cv, 0, 0)
    world.dyn(g, t)
    const order = [...mons].sort((a, b) => a.y - b.y)
    for (const m of order) m.draw(g, t, world)
    g.drawImage(world.fg, 0, 0)
  }
  function frame(now) {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (visible && !$('#home').hidden) {
      t += dt
      for (const m of mons) m.update(dt, t, world, mons)
      draw()
    }
    requestAnimationFrame(frame)
  }

  // Small icons from the game's own maps.
  const ICO = {
    ball: [
      '....kkkk....',
      '..kkrrrrkk..',
      '.krrwrrrrrk.',
      '.krwwrrrrrk.',
      'krrrkkkkrrrk',
      'kkkkkwwkkkkk',
      'kwwwkwwkwwwk',
      'kwwwkkkkwwwk',
      '.kwwwwwwwwk.',
      '.kwwwwwwwwk.',
      '..kkwwwwkk..',
      '....kkkk....',
    ],
    lock: ['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kyyyyyyk', 'kyyykyyk', 'kyyyyyyk', 'kkkkkkkk'],
    play: ['kk......', 'kwkk....', 'kwwwkk..', 'kwwwwwkk', 'kwwwwwkk', 'kwwwkk..', 'kwkk....', 'kk......'],
    map: ['kkkkkkkk', 'kgggbbbk', 'kgyggbbk', 'kggggbbk', 'kbbgrggk', 'kbbggggk', 'kbbbgggk', 'kkkkkkkk'],
    coin: ['..kkkk..', '.kyyyyk.', 'kyYyyyyk', 'kyYyyyyk', 'kyyyyyok', 'kyyyyyok', '.kyooyk.', '..kkkk..'],
    trophy: [
      '..kkkkkkkk..',
      'kkkyyyyyYkkk',
      'k.kyyyyyYk.k',
      'k.kyyyyyYk.k',
      '.kkyyyyyykk.',
      '...kyyyyk...',
      '....kyyk....',
      '.....kk.....',
      '.....kk.....',
      '....kyyk....',
      '...kkkkkk...',
      '...kkkkkk...',
    ],
    potion: ['..kkkk..', '...kk...', '..kwwk..', '.kwbbwk.', 'kbbbbbbk', 'kbwbbbbk', 'kbbbbbbk', '.kkkkkk.'],
    up: ['...kk...', '..kggk..', '.kggggk.', 'kkkggkkk', '..kggk..', '..kggk..', '..kggk..', '..kkkk..'],
    dex: ['kkkkkkk.', 'krrrrrrk', 'krwwrrrk', 'krrrrrrk', 'kkkkkkkk', 'kwwwwwwk', 'kwsswwwk', 'kkkkkkkk'],
    badge: ['...kk...', '..kyyk..', '.kyYyyk.', 'kyYyyyyk', 'kyyyyyok', '.kyyyok.', '..kyok..', '...kk...'],
  }
  const PAL = {
    k: '#24304f',
    w: '#ffffff',
    y: '#ffbe2e',
    Y: '#ffe7a8',
    o: '#ff8a3d',
    r: '#f2553f',
    b: '#5b8def',
    g: '#34c97a',
    s: '#8592ad',
  }
  const url = (name, scale, pal = PAL) => PX.icon(ICO[name], pal, scale).toDataURL()
  let BALL, LOCK, PLAY

  function bind() {
    cv = $('#hm-cv')
    g = cv.getContext('2d')
    g.imageSmoothingEnabled = false
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * W,
        y = ((e.clientY - r.top) / r.height) * H
      const hit = [...mons].sort((a, b) => b.y - a.y).find((m) => m.hit(x, y))
      if (hit) poke(hit)
      else $('#hm-card').hidden = true
    })
    $('#hm-team').innerHTML = TEAM.map(
      (m, i) =>
        `<li><button type="button" data-i="${i}">${esc(m.name)}, Lv.${m.lv}, ${m.hp[0]} of ${m.hp[1]} HP</button></li>`,
    ).join('')
    $$('#hm-team button').forEach((b) => b.addEventListener('click', () => poke(mons[Number(b.dataset.i)])))
    $('#hm-go').addEventListener('click', battleWipe)
    $('#hm-areas').addEventListener('click', () => openSheet())
    $('#hm-secret').addEventListener('click', () => {
      const pp = K.areas.find((a) => a.name === 'Power Plant')
      if (statusOf(pp) === 'new') {
        SAVE.secretSeen = true
        setArea(pp.order, true)
        renderWidgets()
      } else openSheet('secret')
    })
    $('#hm-daycare').addEventListener('click', () => {
      const ready = SAVE.dayCare.map((d, i) => (d && d.ready ? i : -1)).filter((i) => i >= 0)
      if (!ready.length) return toast('The Day Care opens here: drop off, collect, buy an Egg')
      const names = ready.map(
        (i) => `${SAVE.dayCare[i].name} grew to Lv.${SAVE.dayCare[i].lv + SAVE.dayCare[i].gain}`,
      )
      ready.forEach((i) => (SAVE.dayCare[i] = null))
      renderWidgets()
      toast(`${names.join(', ')} · back in your Box`)
    })
    $$('#hm-nav button').forEach((b) =>
      b.addEventListener('click', () =>
        b.dataset.tab === 'home' ? toast('You’re home') : toast(`${b.dataset.tab}: next in the UX pass`),
      ),
    )
    $$('.hm-top [data-soon]').forEach((b) =>
      b.addEventListener('click', () => toast(`${b.dataset.soon}: next in the UX pass`)),
    )
    $('#hm-q').addEventListener('input', (e) => {
      SHEET.q = e.target.value
      renderSheet()
    })
    $$('#hm-chips button').forEach((b) =>
      b.addEventListener('click', () => {
        SHEET.filter = b.dataset.f
        renderSheet()
      }),
    )
    $$('#hm-sort button').forEach((b) =>
      b.addEventListener('click', () => {
        SHEET.sort = b.dataset.s
        renderSheet()
      }),
    )
    $('#hm-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-order]')
      if (!b) return
      if (b.getAttribute('aria-disabled') === 'true') {
        toast(lockReason(areaBy(Number(b.dataset.order))))
        return
      }
      const a = areaBy(Number(b.dataset.order))
      if (a.name === 'Power Plant') {
        SAVE.secretSeen = true
        renderWidgets()
      }
      closeSheet()
      setArea(a.order, true)
    })
    $$('#hm-sheet [data-close]').forEach((b) => b.addEventListener('click', closeSheet))
    $('#hm-sheet').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSheet()
      }
      if (e.key !== 'Tab') return
      // Keep focus inside the sheet while it is open.
      const f = $$('#hm-sheet button:not([aria-disabled="true"]), #hm-sheet input').filter(
        (el) => el.offsetParent,
      )
      if (!f.length) return
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault()
        f[f.length - 1].focus()
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault()
        f[0].focus()
      }
    })
    new IntersectionObserver((es) => (visible = es[0].isIntersecting)).observe(cv)
  }

  async function init() {
    K = await (await fetch('assets/kanto.json')).json()
    buildPokedex()
    BALL = url('ball', 1)
    LOCK = url('lock', 2)
    PLAY = url('play', 3, { k: '#ffffff', w: '#ffffff' })
    $('#hm-ico-map').src = url('map', 3)
    $('#hm-ico-coin').src = url('coin', 2)
    $('#hm-ico-trophy').src = url('trophy', 2)
    $('#hm-ico-badge').src = url('badge', 1)
    $$('#hm-nav [data-ico]').forEach((im) => (im.src = url(im.dataset.ico, 3)))
    bind()
    renderWidgets()
    setArea(SAVE.current, false)
    running = true
    last = performance.now()
    draw()
    requestAnimationFrame(frame)
  }
  window.HOME = { init }
})()
