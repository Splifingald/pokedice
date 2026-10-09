/*
 * Pokédice Visual Lab: the Home screen prototype (Johto Daybreak, Jersey 20).
 * The team of three roams the current area seen from the front and keeps itself busy: friends visit each other, Lapras
 * starts a song the others join. CONTINUE is the one big action. The area plate opens the area's details (Pokémon to
 * catch, limited finds); the Areas sheet searches, filters, sorts and switches region. Widgets: the newest secret area,
 * the Day Care, and Versus once three Pokémon reach Lv.50.
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
  // dex-icons.png: 16 columns of 40×30 menu icons, #1 to #251. 'x2' draws one at twice the size.
  const dexPos = (d, k = 1) => `-${((d - 1) % 16) * 40 * k}px -${Math.floor((d - 1) / 16) * 30 * k}px`
  const dexIco = (d, cls = '') =>
    `<span class="ico${cls ? ' ' + cls : ''}" style="background-position:${dexPos(d, cls.includes('x2') ? 2 : 1)}" aria-hidden="true"></span>`
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

  // ------------------------------------------------------------------ the player's state: three saves to preview
  // A team is three Pokémon at most (maxTeamSize). Lapras is the singer: it starts the songs.
  const MONS = [
    { dex: 6, key: 'front-charizard', name: 'Charizard', hpLv: 3.5, speed: 14, hop: 1 },
    { dex: 25, key: 'front-pikachu', name: 'Pikachu', hpLv: 2.22, speed: 24, hop: 4 },
    {
      dex: 131,
      key: 'front-lapras',
      name: 'Lapras',
      hpLv: 4.67,
      speed: 9,
      hop: 0,
      water: true,
      singer: true,
    },
  ]
  const STATES = {
    mid: {
      label: 'Mid-game',
      note: 'Safari Zone, 5 badges, 61 species. The Power Plant has just opened: the Areas button carries a NEW dot and the widget offers the trip.',
      current: 15,
      clearedTo: 14,
      round: 2,
      badges: 5,
      gold: 1240,
      species: 61,
      lv: [36, 32, 30],
      hp: [1, 29 / 71, 1],
      found: { 15: { 'ultra-ball': 1 } },
    },
    versus: {
      label: 'Versus opens',
      note: 'Victory Road with three Pokémon at Lv.50: Versus joins Home as a new widget. Moltres is ready to appear (the team averages Lv.50).',
      current: 21,
      clearedTo: 20,
      round: 1,
      badges: 8,
      gold: 5320,
      species: 97,
      lv: [53, 50, 50],
      hp: [1, 1, 0.62],
      secretSeen: true,
      versus: 'new',
    },
    league: {
      label: 'League beaten',
      note: 'Champion of Kanto. The Areas button turns gold (“New region”) and opens on Johto with its three starters; Versus has a team set.',
      current: 22,
      clearedTo: 22,
      round: 1,
      badges: 8,
      gold: 9870,
      species: 124,
      lv: [58, 55, 54],
      hp: [1, 1, 1],
      secretSeen: true,
      versus: 'set',
      offer: 'johto',
    },
  }
  const SAVE = {}
  let TEAM = []
  const VS = { toBeat: 5, defense: 3, rival: { name: 'Lea', team: [149, 94, 130] } }
  let K = null
  let caught = new Set()

  function loadState(id) {
    const S = STATES[id]
    for (const k of Object.keys(SAVE)) delete SAVE[k]
    Object.assign(SAVE, {
      id,
      trainer: 'Sam',
      secretSeen: false,
      versus: null,
      offer: null,
      offerSeen: false,
      found: {},
      dayCare: [
        { dex: 133, name: 'Eevee', lv: 22, gain: 2, xp: 1, ready: true },
        { dex: 147, name: 'Dratini', lv: 18, gain: 1, xp: 0.45, mins: 40 },
      ],
      ...JSON.parse(JSON.stringify(S)),
    })
    TEAM = MONS.map((m, i) => {
      const max = Math.round(m.hpLv * S.lv[i])
      return { ...m, lv: S.lv[i], hp: [Math.round(max * S.hp[i]), max] }
    })
  }

  /** The Pokédex of this save: everything met on the way here first, then the rest in route order. */
  function buildPokedex() {
    const want = new Set(TEAM.map((m) => m.dex).concat([133, 147, 1, 4, 7]))
    const route = K.areas.filter((a) => !a.hidden).sort((a, b) => a.order - b.order)
    for (const a of route.filter((a) => a.order <= SAVE.current).concat(K.areas))
      for (const d of a.dex) if (want.size < SAVE.species) want.add(d)
    caught = want
  }
  const areaBy = (order) => K.areas.find((a) => a.order === order)
  const bestLv = () => Math.max(...TEAM.map((m) => m.lv))
  const teamAvg = () => Math.round(TEAM.reduce((n, m) => n + m.lv, 0) / TEAM.length)
  /** Cleared: a route area up to the frontier, or a secret area that opens with an area already cleared. */
  function clearedArea(a) {
    if (!a.hidden) return a.order <= SAVE.clearedTo
    const c = a.unlock[0] || {}
    const b = c.kind === 'area' && K.areas.find((x) => x.name === c.name)
    return !!b && b.order <= SAVE.clearedTo
  }
  /** here · cleared · next (the frontier) · new / open (a secret area) · locked */
  function statusOf(a) {
    if (a.order === SAVE.current) return 'here'
    if (clearedArea(a)) return 'cleared'
    if (a.hidden) {
      const c = a.unlock[0] || {}
      if (c.kind === 'pokedex' && caught.size >= c.n)
        return a.name === 'Power Plant' && !SAVE.secretSeen ? 'new' : 'open'
      if (c.kind === 'level' && bestLv() >= c.n) return 'open'
      return 'locked'
    }
    return a.order === SAVE.clearedTo + 1 ? 'next' : 'locked'
  }
  function lockReason(a) {
    if (!a.hidden) {
      const prev = K.areas.filter((x) => !x.hidden && x.order < a.order).pop()
      return `Clear ${prev ? prev.name : 'the area before'}`
    }
    const c = a.unlock[0] || {}
    if (c.kind === 'pokedex') return `Catch ${c.n} species · ${caught.size}/${c.n}`
    if (c.kind === 'level') return `Raise a Pokémon to Lv.${c.n} · best Lv.${bestLv()}`
    if (c.kind === 'area') return `Clear ${c.name}`
    return 'Secret'
  }
  const toCatch = (a) => a.dex.filter((d) => !caught.has(d))
  const roundsOf = (a) => a.rounds || 1
  const roundOf = (a) => (a.order === SAVE.clearedTo + 1 && !a.hidden ? SAVE.round : 1)
  const bannerFile = (a) => (a.banner || 'default.png').split('#')[0]
  const bannerFlip = (a) => (a.banner || '').includes('#flip')
  /** How many of a one-time find the player has picked up. Cleared areas still hold their last find, if they had several. */
  function foundOf(a, u) {
    const f = SAVE.found[a.order]
    if (f && f[u.key] != null) return f[u.key]
    if (!clearedArea(a)) return 0
    return a.unique.length > 1 && u === a.unique[a.unique.length - 1] ? 0 : u.qty
  }
  const findsLeft = (a) => (a.unique || []).filter((u) => foundOf(a, u) < u.qty)
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

  /** A ring widening on still water. */
  function ripple(g, p, t, c1, c2) {
    const k = (t * 0.6) % 1
    ellipseLine(g, p.x + 12, p.y + 2, Math.round(4 + 10 * k), Math.round(1 + 3 * k), k < 0.6 ? c1 : c2)
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
    if (kind === 'marsh' || kind === 'meadow') {
      // A pond on the left where Lapras swims: reeds round it in the Safari Zone, lily pads and stones elsewhere.
      const marsh = kind === 'marsh'
      const pond = {
        x: Math.round(W * 0.26),
        y: Math.round(H * 0.8),
        rx: marsh ? 50 : 44,
        ry: marsh ? 15 : 13,
      }
      ellipse(g, pond.x, pond.y + 2, pond.rx + 2, pond.ry + 2, '#6fb978')
      ellipse(g, pond.x, pond.y, pond.rx, pond.ry, '#5aa9e0')
      ellipse(g, pond.x + 3, pond.y + 3, pond.rx - 8, pond.ry - 5, '#4a96d4')
      ellipseLine(g, pond.x, pond.y, pond.rx, pond.ry, '#bfe6ff', Math.PI * 1.05, Math.PI * 1.9)
      if (marsh)
        for (let i = 0; i < 9; i++) {
          const a = Math.PI * (0.9 + r() * 1.2),
            x = Math.round(pond.x + Math.cos(a) * (pond.rx + 1)),
            y = Math.round(pond.y + Math.sin(a) * (pond.ry + 1))
          for (let k = 0; k < 3; k++)
            rect(g, x + k * 2 - 2, y - 6 - (k % 2) * 2, 1, 7 + (k % 2) * 2, k === 1 ? '#3c8457' : '#55a466')
          rect(g, x, y - 9, 1, 2, '#8a5a3a')
        }
      else {
        for (const [dx, dy] of [
          [-26, 2],
          [22, -4],
          [30, 5],
        ]) {
          ellipse(g, pond.x + dx, pond.y + dy, 4, 2, '#5fae55')
          px(g, pond.x + dx + 1, pond.y + dy, '#4a96d4')
        }
        px(g, pond.x + 22, pond.y - 5, '#ff9cc2')
        for (const [dx, dy, rr] of [
          [-pond.rx - 1, 3, 4],
          [-pond.rx + 6, 9, 3],
          [pond.rx - 2, 6, 5],
        ]) {
          ellipse(g, pond.x + dx, pond.y + dy + 1, rr, rr - 1, '#8592ad')
          ellipse(g, pond.x + dx - 1, pond.y + dy, rr - 1, rr - 2, '#c8d0e0')
        }
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
      if (world.pond) ripple(gg, world.pond, t, '#bfe6ff', '#7cc8f0')
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
    let pond = null
    if (!plant) {
      // An underground pool for Lapras, with the crystals' colours caught on the water.
      pond = { x: Math.round(W * 0.25), y: Math.round(H * 0.83), rx: 46, ry: 12, rim: '#8fb8f0' }
      ellipse(g, pond.x, pond.y + 2, pond.rx + 2, pond.ry + 2, '#2c2640')
      ellipse(g, pond.x, pond.y, pond.rx, pond.ry, '#33508f')
      ellipse(g, pond.x + 3, pond.y + 3, pond.rx - 8, pond.ry - 4, '#2a4278')
      ellipseLine(g, pond.x, pond.y, pond.rx, pond.ry, '#8fb8f0', Math.PI * 1.05, Math.PI * 1.9)
      for (let i = 0; i < 5; i++)
        rect(g, pond.x - 30 + i * 14, pond.y - 2 + (i % 2) * 4, 3, 1, i % 2 ? '#8ff0ff' : '#ff9ad8')
    }
    return {
      cv: c,
      walk: { x0: 22, x1: W - 22, y0: hy + 24, y1: H - 8 },
      pond,
      fg: canvas(W, H),
      dyn: (gg, t) => {
        if (pond) ripple(gg, pond, t, '#8fb8f0', '#5a7cc0')
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

  // ------------------------------------------------------------------ the team: three friends keeping busy
  // Speech bubbles for states (asleep, startled); small floating hearts and notes for feelings.
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
  // Tiny pixel emoji, outlined in navy so they read on any scenery.
  const FLOAT = {
    heart: ['.xx.xx.', 'xhhxxxx', 'xhxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'],
    note: ['..xxx.', '..x.xx', '..x..x', '..x...', '.xx...', 'xxx...', 'xxx...', '.x....'],
  }
  const NOTE_COLS = ['#3a7be0', '#9b5de5', '#22a866', '#f28c28']
  function floatSprite(kind, col) {
    return PX.cached(`float|${kind}|${col}`, () => {
      const m = FLOAT[kind]
      const at = (x, y) => (m[y - 1] && m[y - 1][x - 1]) || '.'
      return shade(m[0].length + 2, m.length + 2, (x, y) => {
        const ch = at(x, y)
        if (ch === 'h') return '#ffffff'
        if (ch === 'x') return col
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (at(x + dx, y + dy) !== '.') return '#24304f'
        return null
      })
    })
  }
  let FX = []
  /** A heart or a note that floats up from (x, y), starting at time t0 (which may be in the future). */
  function emit(kind, x, y, t0, col) {
    FX.push({
      kind,
      x,
      y,
      t0,
      life: 1.5,
      seed: Math.random() * 6.28,
      col: col || (kind === 'heart' ? '#ff5a7a' : NOTE_COLS[Math.floor(Math.random() * 4)]),
    })
  }
  function drawFx(g, t) {
    FX = FX.filter((f) => t - f.t0 < f.life)
    for (const f of FX) {
      const k = (t - f.t0) / f.life
      if (k < 0 || (k > 0.72 && Math.floor(t * 12) % 2)) continue
      const im = floatSprite(f.kind, f.col)
      const x = Math.round(f.x + Math.sin(k * 6 + f.seed) * 2 - im.width / 2)
      const y = Math.round(f.y - (REDUCED ? 4 : 20) * ease.outQ(k) - im.height)
      g.drawImage(im, x, y)
    }
  }

  // The world's rules for walking: stay on the ground, keep out of the pond (Lapras keeps in it).
  const inPond = (world, x, y, pad) => {
    const p = world.pond
    return !!p && ((x - p.x) / (p.rx + pad)) ** 2 + ((y - p.y) / (p.ry + 12)) ** 2 < 1
  }
  function pathClear(world, m, x, y) {
    if (!world.pond || m.water) return true
    const pad = m.sz.w * 0.5
    const n = Math.max(1, Math.ceil(Math.hypot(x - m.x, y - m.y) / 4))
    for (let i = 0; i <= n; i++)
      if (inPond(world, lerp(m.x, x, i / n), lerp(m.y, y, i / n), pad)) return false
    return true
  }
  const swims = (m, world) => m.water && !!world.pond
  /** Too close to stand there: side by side, or hidden behind a taller friend. */
  const tooClose = (m, o, x, y) =>
    o !== m &&
    o.x != null &&
    Math.abs(o.x - x) < (o.sz.w + m.sz.w) * 0.42 &&
    Math.abs(o.y - y) < Math.max(o.sz.h, m.sz.h) * 0.75
  let SONG = null,
    lastSong = -20,
    songs = 0

  class Mon {
    constructor(def, r) {
      Object.assign(this, def)
      this.r = r
      this.anim = r() * 5000
      this.face = r() < 0.5 ? -1 : 1
      this.state = 'idle'
      this.timer = r.range(0.6, 2.4)
      this.phase = 0
      this.hopT = -1
      this.hops = []
      this.bubble = null
      this.with = null
      this.noteAt = 0
      this.tired = def.hp[0] / def.hp[1] < 0.5
      this.sz = size(def.key)
    }
    get free() {
      return this.state === 'idle' && !this.with
    }
    get head() {
      return { x: Math.round(this.x), y: Math.round(this.y - this.sz.h * 0.72) }
    }
    spot(world, others = []) {
      const { x0, x1, y0, y1 } = world.walk
      for (let i = 0; i < 48; i++) {
        let x, y
        if (swims(this, world)) {
          const a = this.r() * Math.PI * 2,
            k = Math.sqrt(this.r()) * 0.6
          x = world.pond.x + Math.cos(a) * world.pond.rx * k
          y = world.pond.y + Math.sin(a) * world.pond.ry * k + 4
        } else {
          x = lerp(x0 + this.sz.w * 0.3, x1 - this.sz.w * 0.3, this.r())
          y = lerp(y0, y1, this.r())
        }
        const wet = !swims(this, world) && inPond(world, x, y, this.sz.w * 0.55)
        const crowded = others.some((o) => tooClose(this, o, x, y))
        if (!wet && (!crowded || i > 40)) return { x, y }
      }
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
    }
    place(world, others) {
      Object.assign(this, this.spot(world, others))
    }
    goTo(x, y, plan = null) {
      this.target = { x, y }
      this.plan = plan
      this.state = 'walk'
    }
    /** A short stroll from where it stands. */
    wander(world, mons) {
      const { x0, x1, y0, y1 } = world.walk
      for (let i = 0; i < 12; i++) {
        if (swims(this, world)) {
          const p = this.spot(world, mons)
          return this.goTo(p.x, p.y)
        }
        const a = this.r() * Math.PI * 2,
          d = this.r.range(24, 70)
        const x = clamp(this.x + Math.cos(a) * d, x0 + this.sz.w * 0.3, x1 - this.sz.w * 0.3)
        const y = clamp(this.y + Math.sin(a) * d * 0.5, y0, y1)
        const crowded = mons.some((o) => tooClose(this, o, x, y))
        if (!crowded && !inPond(world, x, y, this.sz.w * 0.55) && pathClear(world, this, x, y))
          return this.goTo(x, y)
      }
      this.timer = this.r.range(0.8, 1.6)
    }
    /** Walk over to a friend (or, by the pond, meet Lapras at the water's edge). */
    visit(friend, world) {
      const p = world.pond
      if (swims(this, world) || swims(friend, world)) {
        const sea = swims(this, world) ? this : friend,
          land = sea === this ? friend : this
        // Meet at the side of the pond facing the friend, so the two stand side by side rather than one behind the other.
        const a = Math.atan2(clamp((land.y - p.y) / p.ry, -0.45, 0.45), (land.x - p.x) / p.rx)
        const lx = clamp(
            p.x + Math.cos(a) * (p.rx + land.sz.w * 0.5 + 6),
            world.walk.x0 + land.sz.w * 0.3,
            world.walk.x1 - land.sz.w * 0.3,
          ),
          ly = clamp(p.y + Math.sin(a) * (p.ry + 11), world.walk.y0, world.walk.y1)
        if (inPond(world, lx, ly, land.sz.w * 0.45) || !pathClear(world, land, lx, ly)) return false
        sea.goTo(p.x + Math.cos(a) * p.rx * 0.45, p.y + Math.sin(a) * p.ry * 0.45 + 4, 'meet')
        land.goTo(lx, ly, 'meet')
      } else {
        const gap = (this.sz.w + friend.sz.w) * 0.4 + 2
        let side = this.x < friend.x ? -1 : 1
        let x = friend.x + side * gap
        if (x < world.walk.x0 || x > world.walk.x1) x = friend.x - side * gap
        const y = clamp(friend.y + this.r.range(-3, 3), world.walk.y0, world.walk.y1)
        if (inPond(world, x, y, this.sz.w * 0.5) || !pathClear(world, this, x, y)) return false
        this.goTo(x, y, 'meet')
        friend.state = 'wait'
        friend.timer = 9
      }
      this.with = friend
      friend.with = this
      return true
    }
    rest() {
      this.state = 'rest'
      this.timer = this.r.range(4, 6)
    }
    hopAt(at) {
      this.hops.push(at)
    }
    say(kind, t) {
      this.bubble = { kind, t0: t }
    }
    decide(t, world, mons) {
      const free = mons.filter((o) => o !== this && o.free)
      const roll = this.r()
      if (this.tired && roll < 0.3) return this.rest()
      // Lapras opens with a song soon after you land (updateSong); after that, songs come now and then.
      if (!SONG && songs && free.length && t - lastSong > 12 && roll < (this.singer ? 0.3 : 0.06))
        return startSong(this, t, mons)
      if (free.length && roll < 0.66 && this.visit(this.r.pick(free), world)) return
      if (roll < 0.9) return this.wander(world, mons)
      this.face = -this.face
      this.timer = this.r.range(0.8, 1.8)
    }
    update(dt, t, world, mons) {
      const rate = this.tired ? 0.6 : this.state === 'rest' ? 0.35 : 1
      this.anim += dt * 1000 * rate
      if (this.hopT >= 0 && (this.hopT += dt) > 0.36) this.hopT = -1
      if (this.hops.length && t >= this.hops[0]) {
        this.hops.shift()
        this.hopT = 0
      }
      if (this.bubble && t - this.bubble.t0 > 1.8) this.bubble = null
      if (REDUCED) return
      this.timer -= dt
      const s = this.state
      if (s === 'idle') {
        if (this.timer <= 0 && !this.with) this.decide(t, world, mons)
      } else if (s === 'rest') {
        if (!this.bubble && this.r() < dt * 0.7) this.say('z', t)
        if (this.timer <= 0) {
          this.state = 'idle'
          this.timer = this.r.range(1, 2)
        }
      } else if (s === 'wait') {
        // Waiting for a friend on the way: both there, they meet; it took too long, they give up.
        const o = this.with
        if (o && o.state === 'wait' && o.with === this) meet(this, o, t)
        else if (!o || this.timer <= 0) this.part()
      } else if (s === 'meet' || s === 'sing') {
        if (s === 'sing' && SONG && t >= this.noteAt) {
          const h = this.head
          emit('note', h.x + this.face * 6, h.y, t)
          this.noteAt = t + (SONG.leader === this ? 0.42 : 0.6)
        }
        if (s === 'sing' ? !SONG : this.timer <= 0) this.part()
      } else if (s === 'walk') {
        const dx = this.target.x - this.x,
          dy = this.target.y - this.y,
          d = Math.hypot(dx, dy)
        const sp = this.speed * (this.tired ? 0.55 : 1) * (this.plan === 'meet' ? 1.25 : 1)
        if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1
        this.phase += dt * (sp / 7)
        if (d < 1.5) {
          this.phase = 0
          if (this.plan === 'meet' && this.with) {
            this.state = 'wait'
            this.timer = 4
          } else {
            this.state = 'idle'
            this.timer = this.r.range(1.2, 3.6)
            if (this.key === 'front-pikachu' && !this.tired && this.r() < 0.2) this.say('spark', t)
          }
          return
        }
        this.x += (dx / d) * Math.min(d, sp * dt)
        this.y += (dy / d) * Math.min(d, sp * dt)
      }
    }
    /** Done with whatever it was doing together: back to idle, both of them. */
    part() {
      const o = this.with
      this.with = null
      this.state = 'idle'
      this.timer = this.r.range(1.5, 4)
      if (o && o.with === this) {
        o.with = null
        if (o.state !== 'walk') {
          o.state = 'idle'
          o.timer = o.r.range(1.2, 3)
        }
      }
    }
    draw(g, t, world) {
      let lift = 0
      if (this.state === 'walk' && this.hop) lift = Math.abs(Math.sin(this.phase * Math.PI)) * this.hop
      if (this.state === 'sing' && SONG)
        lift = Math.round(Math.abs(Math.sin((t - SONG.t0) * Math.PI * 2.4)) * 2)
      if (this.hopT >= 0) lift += Math.sin((this.hopT / 0.36) * Math.PI) * 8
      const x = Math.round(this.x),
        y = Math.round(this.y)
      const swim = swims(this, world)
      if (!swim) softEllipse(g, x, y, Math.round(this.sz.w * 0.28), 3, '#24304f', 0.4, 0.8)
      if (swim) {
        g.save()
        g.beginPath()
        g.rect(0, 0, W, y - 7)
        g.clip()
      }
      sprite(g, this.key, x, y - Math.round(lift) + (this.state === 'rest' ? 1 : 0), this.anim, {
        flip: this.face > 0,
      })
      if (swim) {
        g.restore()
        ellipseLine(g, x, y - 7, Math.round(this.sz.w * 0.4), 3, world.pond.rim || '#d8f1ff')
      }
      const top = y - Math.round(lift) - this.sz.h
      if (this.tired && Math.floor(t * 1.5) % 3 === 0) {
        // A sweat drop: tired, heal soon.
        rect(g, x + Math.round(this.sz.w * 0.22), top + 10, 2, 3, '#7cc8f0')
        rect(g, x + Math.round(this.sz.w * 0.22), top + 9, 1, 1, '#ffffff')
      }
      if (this.bubble) {
        const p = clamp((t - this.bubble.t0) / 0.18)
        if (p > 0 && !(t - this.bubble.t0 > 1.5 && Math.floor(t * 12) % 2)) {
          const bx = x + Math.round(this.sz.w * 0.12),
            by = top - 6 - Math.round(3 * ease.outBack(p))
          g.drawImage(bubble(this.bubble.kind), bx, by)
        }
      }
    }
    hit(px0, py0) {
      const w = this.sz.w * 0.8,
        h = this.sz.h
      return px0 > this.x - w / 2 && px0 < this.x + w / 2 && py0 > this.y - h && py0 < this.y + 4
    }
  }

  /** Two friends side by side: they face each other, hop in turn, and hearts (sometimes a hum) float up between them. */
  function meet(a, b, t) {
    a.face = b.x > a.x ? 1 : -1
    b.face = -a.face
    a.state = b.state = 'meet'
    a.timer = b.timer = 2
    a.hopAt(t + 0.05)
    b.hopAt(t + 0.3)
    a.hopAt(t + 0.7)
    const kind = a.r() < 0.72 ? 'heart' : 'note'
    const x = Math.round((a.x + b.x) / 2),
      y = Math.min(a.head.y, b.head.y) + 2
    emit(kind, x - 3, y, t + 0.1)
    emit(kind, x + 4, y + 2, t + 0.55)
    emit('heart', x, y - 2, t + 1.0)
  }
  /** One of them starts singing; the others join in, facing the singer, and everyone bobs on the beat. */
  function startSong(leader, t, mons) {
    SONG = { leader, t0: t, t1: t + 4.4 }
    lastSong = t
    songs++
    leader.state = 'sing'
    leader.noteAt = t
    for (const o of mons)
      if (o !== leader && !o.with && (o.state === 'idle' || o.state === 'walk')) {
        o.state = 'sing'
        o.face = leader.x > o.x ? 1 : -1
        o.noteAt = t + o.r.range(0.5, 1.3)
      }
  }
  function updateSong(t, mons) {
    if (!songs && !SONG && t > 3.5 && !REDUCED) {
      // The first song comes early: Lapras stops what it is doing (unless it is with a friend) and starts.
      const lead = mons.find((m) => m.singer && !m.with && (m.state === 'idle' || m.state === 'walk'))
      if (lead) startSong(lead, t, mons)
    }
    if (!SONG || t < SONG.t1) return
    SONG = null
    for (const m of mons)
      if (m.state === 'sing') {
        const h = m.head
        emit('heart', h.x, h.y, t + m.r.range(0, 0.3))
        m.hopAt(t)
        m.state = 'idle'
        m.timer = m.r.range(1.5, 3.5)
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
  const LEAGUE = 22

  function setArea(order, announce) {
    SAVE.current = order
    const a = areaBy(order)
    world = worldFor(biomeOf(a))
    mons = TEAM.map((d) => new Mon(d, rng(d.dex * 13 + order)))
    // The swimmer first: the pond is small, so the others make room around it.
    ;[...mons].sort((a, b) => Number(!!b.water) - Number(!!a.water)).forEach((m) => m.place(world, mons))
    FX = []
    SONG = null
    songs = 0
    renderArea()
    renderGo()
    renderAreasBtn()
    $('#hm-cv').setAttribute('aria-label', `Your team in ${a.name}: ${TEAM.map((m) => m.name).join(', ')}`)
    if (announce) toast(`Now exploring ${a.name}`)
    if (REDUCED) draw()
  }

  const itemIco = (u) =>
    u.i < 0
      ? `<img class="px it coin" alt="" src="${COIN}" />`
      : `<span class="it" style="background-position:-${u.i * 30}px 0" aria-hidden="true"></span>`

  function renderTop() {
    const gold = SAVE.gold.toLocaleString('en-US')
    $('#hm-badges').textContent = `${SAVE.badges}/8`
    $('#hm-gold').textContent = `₽ ${gold}`
    $('#hm-trainer').setAttribute('aria-label', `Trainer menu: ${SAVE.trainer}, ${SAVE.badges} of 8 badges`)
    $('#hm-pill').setAttribute('aria-label', `${gold} Pokédollars. Open the Shop`)
  }

  function renderArea() {
    const a = areaBy(SAVE.current)
    const left = toCatch(a)
    const rounds = roundsOf(a)
    const done = clearedArea(a) ? rounds : roundOf(a) - 1
    const finds = findsLeft(a)
    const el = $('#hm-area')
    el.innerHTML = `
      <span class="hm-area-row"><b class="hm-area-name">${esc(a.name)}</b><span class="hm-lv">Lv.${a.lv[0]}–${a.lv[1]}</span><span class="hm-more" aria-hidden="true"></span></span>
      <span class="hm-area-row"><span class="hm-rounds">${Array.from({ length: rounds }, (_, i) => `<i class="${i < done ? 'on' : i === done ? 'now' : ''}"></i>`).join('')}</span>
      ${a.dex.length ? `<span class="hm-caught"><img class="px" alt="" src="${BALL}" />${a.dex.length - left.length}/${a.dex.length}</span>` : `<span class="hm-caught">${a.gyms && a.gyms.length > 1 ? 'Pokémon League' : 'Trainers only'}</span>`}${finds.length ? `<span class="hm-finds">${itemIco(finds[0])}${finds.length}</span>` : ''}${a.legend ? '<span class="hm-leg">★</span>' : ''}</span>`
    el.setAttribute(
      'aria-label',
      `${a.name}, levels ${a.lv[0]} to ${a.lv[1]}, ${done} of ${rounds} rounds done, ${a.dex.length ? `${a.dex.length - left.length} of ${a.dex.length} species caught` : 'no wild Pokémon'}${finds.length ? `, ${plural(finds.length, 'limited find')} left` : ''}${a.legend ? ', a legendary lives here' : ''}. Open the area details`,
    )
  }
  function renderGo() {
    const a = areaBy(SAVE.current)
    const sub = clearedArea(a) ? 'Cleared · free play' : `Round ${roundOf(a)} of ${roundsOf(a)}`
    $('#hm-go').innerHTML =
      `<span class="hm-go-in"><img class="px" alt="" src="${PLAY}" /><span><b>Continue</b><small>${esc(sub)}</small></span></span>`
    $('#hm-go').setAttribute('aria-label', `Continue in ${a.name}, ${sub}`)
  }

  /** Areas, in three states: plain; a NEW dot (a secret area or a region to see); gold when a new region opens. */
  function renderAreasBtn() {
    const b = $('#hm-areas')
    const gold = !!SAVE.offer && !SAVE.offerSeen
    const fresh = K.areas.some((a) => statusOf(a) === 'new') || !!SAVE.offer
    b.classList.toggle('gold', gold)
    b.innerHTML = `<span><img class="px" alt="" src="${MAP}" /><small>${gold ? 'New region' : 'Areas'}</small></span>${gold ? '<i class="spk" aria-hidden="true"></i><i class="spk" aria-hidden="true"></i><i class="spk" aria-hidden="true"></i>' : fresh ? '<i class="dot new" aria-hidden="true">NEW</i>' : ''}`
    b.setAttribute(
      'aria-label',
      gold
        ? `New region: ${regionName(SAVE.offer)} is open. See it`
        : fresh
          ? `Areas, something new: ${SAVE.offer ? `${regionName(SAVE.offer)} is open` : 'a secret area opened'}`
          : 'Areas: change where you explore',
    )
  }

  function renderWidgets() {
    renderVersus()
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
            ? `<span class="hm-dc">${dexIco(d.dex)}
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

  /** Versus joins Home once three Pokémon reach Lv.50: first to set a team, then to fight. */
  function renderVersus() {
    const el = $('#hm-versus')
    el.hidden = !SAVE.versus
    if (!SAVE.versus) return
    const team = `<span class="hm-vs-team">${TEAM.map((m) => dexIco(m.dex)).join('')}</span>`
    if (SAVE.versus === 'new') {
      el.innerHTML = `<span class="hm-w-head"><b>Versus</b><span class="hm-new">NEW</span></span>
        <span class="hm-vs">${team}<span class="hm-vs-txt"><b>Versus is open!</b><small>3 Pokémon at Lv.50 · fight other trainers</small></span><span class="hm-vs-go">Set team</span></span>`
      el.setAttribute('aria-label', 'New: Versus is open, three of your Pokémon reached Lv.50. Set your team')
    } else {
      el.innerHTML = `<span class="hm-w-head"><b>Versus</b><span class="hm-vs-score">${plural(VS.defense, 'win')} in defense</span></span>
        <span class="hm-vs">${team}<span class="hm-vs-txt"><b>${VS.toBeat} teams to beat</b><small>Fights play on auto at Lv.50</small></span><span class="hm-vs-go">Fight</span></span>`
      el.setAttribute(
        'aria-label',
        `Versus: ${VS.toBeat} teams to beat, ${plural(VS.defense, 'win')} in defense. Fight`,
      )
    }
  }

  function renderTeamList() {
    $('#hm-team').innerHTML = TEAM.map(
      (m, i) =>
        `<li><button type="button" data-i="${i}">${esc(m.name)}, Lv.${m.lv}, ${m.hp[0]} of ${m.hp[1]} HP</button></li>`,
    ).join('')
  }

  // ------------------------------------------------------------------ dialogs (the Areas sheet, an area's details)
  const OPEN = []
  function openDialog(el, focus) {
    el.hidden = false
    OPEN.push({ el, back: document.activeElement })
    requestAnimationFrame(() => (focus || $('.hm-x', el)).focus({ preventScroll: true }))
  }
  function closeDialog(el) {
    const i = OPEN.findIndex((d) => d.el === el)
    if (i < 0) return
    const [d] = OPEN.splice(i, 1)
    el.hidden = true
    if (d.back && d.back.isConnected) d.back.focus({ preventScroll: true })
  }
  const closeAll = () => [...OPEN].reverse().forEach((d) => closeDialog(d.el))

  // ------------------------------------------------------------------ the areas sheet, with the region switcher
  const SHEET = { q: '', filter: 'all', sort: 'route', view: 'areas', starter: 0 }
  const regionName = (id) => (K.regions.find((r) => r.id === id) || {}).name || ''
  function openSheet(o = {}) {
    if (o.filter) SHEET.filter = o.filter
    SHEET.view = o.view || 'areas'
    renderSheet()
    openDialog($('#hm-sheet'), $('#hm-region'))
  }
  function setView(view) {
    SHEET.view = view
    if (view === 'regions' && SAVE.offer && !SAVE.offerSeen) {
      SAVE.offerSeen = true
      renderAreasBtn()
    }
    renderSheet()
    $('#hm-region').focus({ preventScroll: true })
  }
  function renderSheet() {
    const regions = SHEET.view === 'regions'
    $('#hm-areas-view').hidden = regions
    $('#hm-regions').hidden = !regions
    const rb = $('#hm-region')
    rb.setAttribute('aria-expanded', String(regions))
    rb.innerHTML = `<b>${regions ? 'Regions' : 'Kanto'}</b><span class="hm-caret" aria-hidden="true"></span>${!regions && SAVE.offer ? '<span class="hm-new">NEW</span>' : ''}`
    rb.setAttribute(
      'aria-label',
      regions
        ? 'Regions. Back to the areas of Kanto'
        : `Region: Kanto. Change region${SAVE.offer ? `, ${regionName(SAVE.offer)} is new` : ''}`,
    )
    if (regions) {
      $('#hm-sheet-sub').textContent = SAVE.offer
        ? `1 region played · ${regionName(SAVE.offer)} is open`
        : '1 region played · more after the League'
      renderRegions()
      return
    }
    const cleared = K.areas.filter((a) => clearedArea(a)).length
    const secrets = K.areas.filter((a) => a.hidden)
    const found = secrets.filter((a) => statusOf(a) !== 'locked').length
    $('#hm-sheet-sub').textContent =
      `${cleared} cleared · ${found}/${secrets.length} secrets found · ${caught.size}/151 caught`
    renderList()
  }
  function renderList() {
    const q = fold(SHEET.q.trim())
    const speciesHits = q
      ? Object.entries(K.names)
          .filter(([d, n]) => d <= 151 && fold(n).includes(q))
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
          next: '<span class="hm-st open">Next</span>',
          new: '<span class="hm-st new">New</span>',
          open: '<span class="hm-st open">Open</span>',
          locked: '<span class="hm-st lock">Locked</span>',
        }[st]
        const finds = findsLeft(a)
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
                  `<span class="hm-hit${caught.has(d) ? '' : ' new'}">${dexIco(d)}${esc(K.names[d])}${caught.has(d) ? '' : ' · new'}</span>`,
              )
              .join('')}</span>`
          : ''
        const label = `${a.name}, levels ${a.lv[0]} to ${a.lv[1]}, ${locked ? 'locked: ' + lockReason(a) + '. See what’s there' : st === 'here' ? 'you are here' : st === 'next' ? 'next to clear. Travel' : st + '. Travel'}`
        return `<li class="hm-ca-li"><button type="button" class="hm-card-area${locked ? ' locked' : ''}${st === 'here' ? ' here' : ''}" data-order="${a.order}" aria-label="${esc(label)}">
          <span class="hm-ban${locked ? ' dim' : ''}${bannerFlip(a) ? ' flip' : ''}"><img class="px" alt="" src="assets/banners/${bannerFile(a)}" /><span class="hm-tags">${a.gym ? '<span class="hm-gym">GYM</span>' : ''}${a.legend ? '<span class="hm-gym leg">★ LEGEND</span>' : ''}</span></span>
          <span class="hm-ca-row"><b>${esc(a.name)}</b>${chip}</span>
          <span class="hm-ca-row"><span class="hm-lv">Lv.${a.lv[0]}–${a.lv[1]}</span>${catchLine}${!locked && finds.length ? `<span class="hm-finds" title="Limited finds left">${itemIco(finds[0])}${finds.length}</span>` : ''}</span>${hitIcons}</button>
          <button type="button" class="hm-info" data-info="${a.order}" aria-label="Details: ${esc(a.name)}"><span aria-hidden="true">i</span></button></li>`
      })
      .join('')
  }

  const TYPE_COL = { grass: '#34c97a', fire: '#ff7a3d', water: '#3a9be8' }
  function renderRegions() {
    const kanto = K.regions[0],
      next = K.regions.find((r) => r.id === kanto.next)
    const offer = SAVE.offer === next.id
    const here = `<button type="button" class="hm-reg here" data-back aria-label="Kanto, you are here. Back to its areas">
        <span class="hm-ban"><img class="px" alt="" src="assets/banners/plains.png" /></span>
        <span class="hm-reg-row"><b>Kanto</b><span class="hm-st here">You’re here</span></span>
        <span class="hm-reg-stats"><span>${kanto.areas} areas</span><span><img class="px" alt="" src="${BALL}" />${caught.size}/${kanto.species}</span><span><img class="px" alt="" src="${BADGE}" />${SAVE.badges}/8</span>${SAVE.clearedTo >= LEAGUE ? '<span class="hm-ok">League won</span>' : ''}</span>
      </button>`
    const card = offer
      ? offerCard(next)
      : `<div class="hm-reg teaser"><span class="hm-reg-q" aria-hidden="true">?</span><span class="hm-reg-tt"><b>A new region</b><small>Beat the Kanto League at Indigo Plateau to open it.</small>
          <span class="hm-meter" role="img" aria-label="${SAVE.badges} of 8 badges"><i style="width:${(SAVE.badges / 8) * 100}%"></i></span><small>${SAVE.badges}/8 badges, then the League</small></span></div>`
    $('#hm-regions').innerHTML =
      here +
      card +
      `<p class="hm-reg-foot">More regions open one League at a time. Each keeps its own team, Box, bag and gold.</p>`
  }
  function offerCard(r) {
    const pick = SHEET.starter
    return `<section class="hm-reg offer" aria-labelledby="hm-offer-h">
      <span class="hm-reg-row"><span class="hm-st new">NEW REGION</span><span class="hm-reg-stats"><span>${r.areas} areas</span><span>${r.species} new Pokémon</span></span></span>
      <h3 id="hm-offer-h">${esc(r.name)}</h3>
      <p class="hm-reg-pick" id="hm-pick-h">Pick a partner to start with</p>
      <div class="hm-starters" role="radiogroup" aria-labelledby="hm-pick-h">${r.starters
        .map((d) => {
          const ty = K.types[d][0]
          return `<button type="button" role="radio" aria-checked="${pick === d}" data-starter="${d}">${dexIco(d, 'x2')}<b>${esc(K.names[d])}</b><span class="hm-type" style="--c:${TYPE_COL[ty] || '#8592ad'}">${ty}</span></button>`
        })
        .join('')}</div>
      <p class="hm-reg-note">Kanto stays as you left it: its team, Box and bag wait here. Switch back any time.</p>
      <button type="button" class="ui-btn wide${pick ? ' primary' : ''}" id="hm-start"${pick ? '' : ' disabled'}><span>${pick ? `Start ${esc(r.name)} with ${esc(K.names[pick])}` : 'Pick a partner first'}</span></button>
    </section>`
  }

  // ------------------------------------------------------------------ an area's details
  const ENC = {
    wild: ['Wild Pokémon', '#34c97a'],
    item: ['Items', '#ffbe2e'],
    center: ['Pokémon Center', '#ff7aa0'],
    trainer: ['Trainers', '#5b8def'],
    casino: ['Game Corner', '#9b5de5'],
  }
  const rarity = (p) => (p <= 2 ? ['rare', 'Rare'] : p <= 5 ? ['unc', 'Uncommon'] : ['com', 'Common'])
  const DETAIL = { order: 0, mode: 'catch' }
  function openDetail(order) {
    const a = areaBy(order)
    DETAIL.order = order
    DETAIL.mode = toCatch(a).length ? 'catch' : 'all'
    renderDetail()
    openDialog($('#hm-detail'))
    $('#hm-d-body').scrollTop = 0
  }
  function renderDetail() {
    const a = areaBy(DETAIL.order)
    const st = statusOf(a),
      locked = st === 'locked',
      cleared = clearedArea(a)
    const stTxt = {
      here: 'You’re here',
      cleared: 'Cleared',
      next: 'Next to clear',
      new: 'New secret area',
      open: 'Secret area',
      locked: 'Locked',
    }[st]
    $('#hm-d-title').textContent = a.name
    $('#hm-d-sub').textContent = `Lv.${a.lv[0]}–${a.lv[1]} · ${plural(roundsOf(a), 'round')} · ${stTxt}`
    const banner = `<div class="hm-ban hm-d-ban${bannerFlip(a) ? ' flip' : ''}${locked ? ' dim' : ''}"><img class="px" alt="" src="assets/banners/${bannerFile(a)}" />${locked ? `<span class="hm-d-lock"><img class="px" alt="" src="${LOCK}" />Locked</span>` : ''}</div>`

    const facts = []
    if (a.gyms && a.gyms.length) {
      const league = a.gyms.length > 1
      facts.push(
        `<div class="hm-fact"><img class="px" alt="" src="${league ? TROPHY : BADGE3}" /><span class="hm-fact-t"><small>${league ? 'Pokémon League' : 'Gym'}</small><b>${esc(league ? 'Elite Four · Champion' : a.gyms[0].leader)}</b><em>${league ? `${a.gyms.length} battles in a row` : esc(a.gyms[0].badge || '')}</em></span>${cleared ? '<span class="hm-ok">Beaten</span>' : ''}</div>`,
      )
    }
    if (a.legend) {
      const L = a.legend,
        avg = teamAvg(),
        ready = avg >= L.avg
      const when = !L.avg
        ? 'Waits at the end of the area'
        : ready
          ? `Ready: your team averages Lv.${avg}`
          : `Shows up when your team averages Lv.${L.avg} · now Lv.${avg}`
      facts.push(
        `<div class="hm-fact legend">${dexIco(L.d)}<span class="hm-fact-t"><small>Legendary</small><b>${esc(K.names[L.d])} · Lv.${L.lv}</b><em>${when}</em></span>${caught.has(L.d) ? '<span class="hm-ok">Caught</span>' : ready && !locked ? '<span class="hm-st new">Ready</span>' : ''}</div>`,
      )
    }

    const uniq = a.unique || []
    const finds = uniq.length
      ? `<section class="hm-d-sec"><div class="hm-d-h"><h3>Limited finds</h3><span class="hm-d-hint">One time only</span></div><ul class="hm-finds-list">${uniq
          .map((u) => {
            const got = foundOf(a, u),
              rest = u.qty - got
            const money = u.key === 'money'
            const name = money ? `₽${u.qty.toLocaleString('en-US')}` : u.name
            const qty = money ? 'A stash of Pokédollars' : u.qty > 1 ? `${u.qty} in this area` : 'Only one'
            const state =
              rest <= 0
                ? '<span class="hm-ok">Found</span>'
                : got
                  ? `<span class="hm-st new">${rest} of ${u.qty} left</span>`
                  : '<span class="hm-st new">Still here</span>'
            return `<li class="hm-find${rest <= 0 ? ' done' : ''}">${itemIco(u)}<span class="hm-find-t"><b>${esc(name)}</b><small>${qty}</small></span>${state}</li>`
          })
          .join('')}</ul></section>`
      : ''

    const wild = a.wild || []
    const left = wild.filter((w) => !caught.has(w.d))
    const shown = DETAIL.mode === 'catch' ? left : wild
    const tiles = shown
      .map((w) => {
        const got = caught.has(w.d)
        const [rc, rl] = rarity(w.p)
        const unknown = locked && !got
        return `<li class="hm-mon${got ? ' got' : ''}${unknown ? ' unknown' : ''}">${dexIco(w.d)}<b>${unknown ? '???' : esc(K.names[w.d])}</b><span class="hm-rar ${rc}">${rl} · ${w.p}%</span><span class="hm-mon-lv">Lv.${w.lv[0]}–${w.lv[1]}</span>${got ? `<img class="px hm-got" alt="Caught" src="${BALL}" />` : ''}</li>`
      })
      .join('')
    const monsSec = wild.length
      ? `<section class="hm-d-sec"><div class="hm-d-h"><h3>Pokémon</h3><div class="hm-seg" role="radiogroup" aria-label="Show Pokémon"><button type="button" role="radio" data-m="catch" aria-checked="${DETAIL.mode === 'catch'}">To catch <i>${left.length}</i></button><button type="button" role="radio" data-m="all" aria-checked="${DETAIL.mode === 'all'}">All <i>${wild.length}</i></button></div></div>${
          shown.length
            ? `<ul class="hm-mons">${tiles}</ul>`
            : `<p class="hm-d-empty"><img class="px" alt="" src="${BALL}" />All ${wild.length} are in your Pokédex.</p>`
        }</section>`
      : `<section class="hm-d-sec"><div class="hm-d-h"><h3>Pokémon</h3></div><p class="hm-d-empty">No wild Pokémon here: trainers only.</p></section>`

    const enc = Object.entries(a.enc || {}).filter(([k, v]) => v > 0 && ENC[k])
    const tot = enc.reduce((n, [, v]) => n + v, 0)
    const pct = enc.map(([k, v]) => [k, Math.round((v / tot) * 100)]).sort((x, y) => y[1] - x[1])
    const mix = tot
      ? `<section class="hm-d-sec"><div class="hm-d-h"><h3>Each round you meet</h3></div><div class="hm-mix" role="img" aria-label="${pct.map(([k, p]) => `${ENC[k][0]} ${p}%`).join(', ')}">${pct.map(([k, p]) => `<i style="flex:${p};--c:${ENC[k][1]}"></i>`).join('')}</div><ul class="hm-mix-k" aria-hidden="true">${pct.map(([k, p]) => `<li><i style="--c:${ENC[k][1]}"></i>${ENC[k][0]} <b>${p}%</b></li>`).join('')}</ul></section>`
      : ''
    const common = (a.common || []).length
      ? `<section class="hm-d-sec"><div class="hm-d-h"><h3>Also found here</h3><span class="hm-d-hint">Any time</span></div><ul class="hm-common">${a.common.map((c) => `<li>${itemIco(c)}${esc(c.name)}</li>`).join('')}</ul></section>`
      : ''

    $('#hm-d-body').innerHTML =
      banner +
      (facts.length ? `<div class="hm-facts">${facts.join('')}</div>` : '') +
      finds +
      monsSec +
      mix +
      common
    const go = $('#hm-d-go')
    go.disabled = locked
    go.classList.toggle('primary', !locked)
    go.dataset.go = st === 'here' ? 'continue' : 'travel'
    go.innerHTML = `<span>${locked ? `<img class="px" alt="" src="${LOCK3}" />${esc(lockReason(a))}` : st === 'here' ? `<img class="px" alt="" src="${PLAY}" />Continue here` : `<img class="px" alt="" src="${MAP}" />Travel here`}</span>`
  }

  function travel(a) {
    if (a.name === 'Power Plant') SAVE.secretSeen = true
    closeAll()
    setArea(a.order, true)
    renderWidgets()
  }

  // ------------------------------------------------------------------ toast, wipes, loop
  function toast(msg) {
    const el = $('#hm-toast')
    el.textContent = msg
    el.dataset.on = ''
    clearTimeout(toast.t)
    toast.t = setTimeout(() => delete el.dataset.on, 2600)
  }
  function wipe(html, after) {
    const el = $('#hm-wipe')
    el.innerHTML = `${Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}${html}`
    if (REDUCED) return toast(after)
    el.hidden = false
    el.dataset.on = ''
    setTimeout(() => (el.dataset.out = ''), 1600)
    setTimeout(() => {
      el.hidden = true
      delete el.dataset.on
      delete el.dataset.out
      toast(after)
    }, 2150)
  }
  function battleWipe() {
    const a = areaBy(SAVE.current)
    const pool = toCatch(a).length ? toCatch(a) : a.dex
    const d = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 25
    const name = pool.length ? K.names[d] : 'trainer'
    wipe(
      `<p>${pool.length ? dexIco(d) : ''}${pool.length ? `A wild ${esc(name)} appeared!` : 'A trainer wants to battle!'}</p>`,
      'Battles play in the Animations tab',
    )
  }
  function vsWipe() {
    const side = (who, team) =>
      `<span class="hm-vs-side"><span class="hm-vs-icons">${team.map((d) => dexIco(d, 'x2')).join('')}</span><b>${esc(who)}</b></span>`
    wipe(
      `<p class="vs">${side(
        SAVE.trainer,
        TEAM.map((m) => m.dex),
      )}<span class="hm-vs-big">VS</span>${side(VS.rival.name, VS.rival.team)}</p>`,
      'Versus fights play on auto: next in the UX pass',
    )
  }

  function showCard(m) {
    const card = $('#hm-card')
    const p = m.hp[0] / m.hp[1]
    const note = m.tired
      ? 'Tired: heal at a Pokémon Center'
      : m.state === 'rest'
        ? 'Napping'
        : m.state === 'sing'
          ? 'Singing along'
          : ''
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
  /** A tap: it hops, a heart pops out, and its card shows. A napping one wakes up with a start. */
  function poke(m) {
    if (m.state === 'rest') {
      m.state = 'idle'
      m.timer = 1.5
      m.say('bang', t)
    }
    m.hopT = 0
    const h = m.head
    emit('heart', h.x + 3, h.y - 6, t)
    showCard(m)
  }

  function draw() {
    g.clearRect(0, 0, W, H)
    g.drawImage(world.cv, 0, 0)
    world.dyn(g, t)
    const order = [...mons].sort((a, b) => a.y - b.y)
    for (const m of order) m.draw(g, t, world)
    g.drawImage(world.fg, 0, 0)
    drawFx(g, t)
  }
  function frame(now) {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (visible && !$('#home').hidden) {
      t += dt
      for (const m of mons) m.update(dt, t, world, mons)
      updateSong(t, mons)
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
  let BALL, LOCK, LOCK3, PLAY, MAP, COIN, BADGE, BADGE3, TROPHY

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
    $('#hm-team').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]')
      if (b) poke(mons[Number(b.dataset.i)])
    })
    $('#hm-area').addEventListener('click', () => openDetail(SAVE.current))
    $('#hm-go').addEventListener('click', battleWipe)
    $('#hm-areas').addEventListener('click', () =>
      openSheet({ view: SAVE.offer && !SAVE.offerSeen ? 'regions' : 'areas' }),
    )
    $('#hm-secret').addEventListener('click', () => {
      const pp = K.areas.find((a) => a.name === 'Power Plant')
      if (statusOf(pp) === 'new') travel(pp)
      else openSheet({ filter: 'secret' })
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
    $('#hm-versus').addEventListener('click', () => {
      if (SAVE.versus === 'new') {
        SAVE.versus = 'set'
        renderVersus()
        toast(`Team set: ${TEAM.map((m) => m.name).join(', ')} fight as Lv.50 clones`)
      } else vsWipe()
    })
    $$('#hm-nav button').forEach((b) =>
      b.addEventListener('click', () =>
        b.dataset.tab === 'home' ? toast('You’re home') : toast(`${b.dataset.tab}: next in the UX pass`),
      ),
    )
    $$('.hm-top [data-soon]').forEach((b) =>
      b.addEventListener('click', () => toast(`${b.dataset.soon}: next in the UX pass`)),
    )

    // The Areas sheet.
    $('#hm-region').addEventListener('click', () => setView(SHEET.view === 'regions' ? 'areas' : 'regions'))
    $('#hm-q').addEventListener('input', (e) => {
      SHEET.q = e.target.value
      renderList()
    })
    $$('#hm-chips button').forEach((b) =>
      b.addEventListener('click', () => {
        SHEET.filter = b.dataset.f
        renderList()
      }),
    )
    $$('#hm-sort button').forEach((b) =>
      b.addEventListener('click', () => {
        SHEET.sort = b.dataset.s
        renderList()
      }),
    )
    $('#hm-list').addEventListener('click', (e) => {
      const info = e.target.closest('[data-info]')
      if (info) return openDetail(Number(info.dataset.info))
      const b = e.target.closest('[data-order]')
      if (!b) return
      const a = areaBy(Number(b.dataset.order))
      // A locked area can't be travelled to, so its card shows what it holds instead.
      if (statusOf(a) === 'locked') openDetail(a.order)
      else travel(a)
    })
    $('#hm-regions').addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) return setView('areas')
      const s = e.target.closest('[data-starter]')
      if (s) {
        SHEET.starter = Number(s.dataset.starter)
        renderRegions()
        $(`[data-starter="${SHEET.starter}"]`).focus({ preventScroll: true })
        return
      }
      if (e.target.closest('#hm-start')) {
        const r = K.regions.find((x) => x.id === SAVE.offer)
        closeAll()
        toast(`${r.name} with ${K.names[SHEET.starter]}: next in the UX pass`)
      }
    })

    // An area's details.
    $('#hm-d-body').addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]')
      if (!m) return
      DETAIL.mode = m.dataset.m
      renderDetail()
      $(`[data-m="${DETAIL.mode}"]`).focus({ preventScroll: true })
    })
    $('#hm-d-go').addEventListener('click', (e) => {
      const a = areaBy(DETAIL.order)
      if (e.currentTarget.dataset.go === 'continue') {
        closeAll()
        battleWipe()
      } else travel(a)
    })

    // Both sheets are dialogs: Esc closes the top one, Tab stays inside, focus goes back where it came from.
    $$('.hm-sheet').forEach((sh) => {
      $$('[data-close]', sh).forEach((b) => b.addEventListener('click', () => closeDialog(sh)))
      sh.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          closeDialog(sh)
        }
        if (e.key !== 'Tab') return
        const f = $$('button:not([disabled]), input', sh).filter((el) => el.offsetParent)
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault()
          f[f.length - 1].focus()
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault()
          f[0].focus()
        }
      })
    })

    // The preview: three saves, to see each state of Home.
    $$('#hm-states button').forEach((b) => b.addEventListener('click', () => applyState(b.dataset.state)))
    new IntersectionObserver((es) => (visible = es[0].isIntersecting)).observe(cv)
  }

  function applyState(id) {
    closeAll()
    loadState(id)
    buildPokedex()
    SHEET.view = 'areas'
    SHEET.starter = 0
    $$('#hm-states button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.state === id)))
    $('#hm-state-note').textContent = STATES[id].note
    renderTop()
    renderTeamList()
    renderWidgets()
    setArea(SAVE.current, false)
  }

  async function init() {
    K = await (await fetch('assets/kanto.json')).json()
    BALL = url('ball', 1)
    LOCK = url('lock', 2)
    LOCK3 = url('lock', 3)
    PLAY = url('play', 3, { k: '#ffffff', w: '#ffffff' })
    MAP = url('map', 3)
    COIN = url('coin', 2)
    BADGE = url('badge', 1)
    BADGE3 = url('badge', 3)
    TROPHY = url('trophy', 2)
    $('#hm-ico-coin').src = COIN
    $('#hm-ico-trophy').src = TROPHY
    $('#hm-ico-badge').src = BADGE
    $$('#hm-nav [data-ico]').forEach((im) => (im.src = url(im.dataset.ico, 3)))
    bind()
    applyState('mid')
    running = true
    last = performance.now()
    draw()
    requestAnimationFrame(frame)
  }
  window.HOME = { init }
})()
