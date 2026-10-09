/*
 * Pokédice Visual Lab: the animations. Each one is a timeline at 60 steps a second on a 240×160 stage:
 *   setup(env) → state · step(state, t, dt) · draw(g, state, t) · cues [[t, fn(hud, state)]] · beats (the beat sheet).
 * Rules the whole set follows: anticipation before every release, a hit-stop of 3–5 frames on contact, white
 * silhouette flashes instead of opacity blinks, dithered light instead of blur, and nothing strobes faster than 3 Hz.
 */
;(function () {
  'use strict'
  const {
    clamp,
    lerp,
    span,
    ease,
    rng,
    mix,
    rect,
    px,
    line,
    ellipse,
    ellipseLine,
    softEllipse,
    glow,
    ring,
    ditherFill,
    wash,
    text,
    textWidth,
    sprite,
    size,
    Particles,
    bolt,
    polyline,
    Sound,
    bayer,
    canvas,
    silhouette,
    frameOf,
  } = PX
  const W = 240,
    H = 160
  const STEP = 1 / 60

  // ---------------------------------------------------------------- shared helpers
  const frozenFor = (t, wins) => wins.reduce((a, [s, e]) => a + Math.max(0, Math.min(t, e) - s), 0)
  const within = (t, a, b) => t >= a && t < b
  /** Screen or sprite shake: alternating whole-pixel offsets, decaying. Each entry [t0, dur, amp]. */
  function shakeAt(t, list) {
    let x = 0,
      y = 0
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
  const quad = (a, c, b, p) => ({
    x: (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * c.x + p * p * b.x,
    y: (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * c.y + p * p * b.y,
  })
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
  const say = (msg) => (hud) => hud.say(msg)

  /** Damage number: pops up with an overshoot, holds, then blinks out. */
  function pop(g, str, x, y, t, t0, color = '#ffffff') {
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

  /** The battle stage every battle animation shares: background, sprites, hits, shakes, particles. */
  class Stage {
    constructor(env, own, foe, seed) {
      this.env = env
      this.bg = SCN.background(env.style, W, H)
      this.L = this.bg.layout
      this.own = own
      this.foe = foe
      this.r = rng(seed)
      this.stops = []
      this.screenShakes = []
      this.foeShakes = []
      this.hits = []
      this.fx = new Particles()
      this.under = new Particles()
    }
    get os() {
      return size(this.own)
    }
    get fs() {
      return size(this.foe)
    }
    /** A point on the attacker's back sprite, as fractions of its box. */
    ownAt(fx, fy, dx = 0, dy = 0) {
      const s = this.os
      return { x: this.L.own.x - s.w / 2 + s.w * fx + dx, y: this.L.own.y - s.h + s.h * fy + dy }
    }
    foeAt(fx, fy, dx = 0, dy = 0) {
      const s = this.fs
      return { x: this.L.foe.x - s.w / 2 + s.w * fx + dx, y: this.L.foe.y - s.h + s.h * fy + dy }
    }
    get foeC() {
      return this.foeAt(0.5, 0.5)
    }
    /** Register a hit: hit-stop, white flash, sprite shake, a type-coloured tint, optional screen shake. */
    hit(t0, { stop = 0.07, shake = 2, dur = 0.45, tint = null, screen = 0, flash = true } = {}) {
      if (stop) this.stops.push([t0, t0 + stop])
      this.foeShakes.push([t0, dur, shake])
      if (screen) this.screenShakes.push([t0, dur * 0.8, screen])
      this.hits.push({ t0, dur, tint, flash })
    }
    stopped(t) {
      return this.stops.some(([a, b]) => t >= a && t < b)
    }
    clock(t) {
      return (t - frozenFor(t, this.stops)) * 1000
    }
    /** The foe's hit look at time t: two white flash frames, then a tint flicker. */
    foeHitLook(t) {
      let flash = 0,
        tint = null
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
    step(t, dt) {
      if (this.stopped(t)) return false
      this.fx.update(dt)
      this.under.update(dt)
      return true
    }
    begin(g, t) {
      const s = shakeAt(t, this.screenShakes)
      if (s.x || s.y) g.drawImage(this.bg.cv, 0, 0)
      g.save()
      g.translate(s.x, s.y)
      g.drawImage(this.bg.cv, 0, 0)
      this.bg.dyn(g, t)
    }
    end(g) {
      g.restore()
    }
    drawFoe(g, t, o = {}) {
      const sh = shakeAt(t, this.foeShakes)
      const look = this.foeHitLook(t)
      const opt = Object.assign({}, o, {
        flash: Math.max(look.flash, o.flash || 0),
        tint: o.tint || look.tint,
      })
      sprite(g, this.foe, this.L.foe.x + sh.x + (o.dx || 0), this.L.foe.y + (o.dy || 0), this.clock(t), opt)
    }
    drawOwn(g, t, o = {}) {
      sprite(g, this.own, this.L.own.x + (o.dx || 0), this.L.own.y + (o.dy || 0), this.clock(t), o)
    }
  }

  // ---------------------------------------------------------------- attacks
  const FIRE = ['#ffffff', '#fff6b8', '#ffe066', '#ffb23a', '#ff7a1e', '#e8481c', '#b02a1a', '#5a3030']
  const WATER = ['#ffffff', '#c8efff', '#8fd3ff', '#4aa8ff', '#1d5fc8']
  const ELEC = ['#ffffff', '#fff6a8', '#ffe14d', '#f0b81c']
  const PSY = ['#ffffff', '#ffc2f0', '#ff7ad9', '#c04ae0', '#7a2fb0']

  const ATTACKS = {
    fire: {
      own: 'back-charizard',
      foe: 'front-scyther',
      ownName: 'Charizard',
      foeName: 'Scyther',
      move: 'Flamethrower',
      ownLv: 36,
      foeLv: 34,
      foeTypes: ['bug', 'flying'],
      ownTypes: ['fire', 'flying'],
      status: 'BRN',
      statusName: 'burned',
      dice: [
        ['fire', 6],
        ['fire', 1, 'burn'],
        ['flying', 6],
        ['base', 3],
      ],
      combo: 'Pair +3',
      mult: 2,
      dmg: 38,
      hp: [1, 0.46],
      mouth: [0.86, 0.3],
    },
    water: {
      own: 'back-blastoise',
      foe: 'front-arcanine',
      ownName: 'Blastoise',
      foeName: 'Arcanine',
      move: 'Hydro Pump',
      ownLv: 36,
      foeLv: 35,
      foeTypes: ['fire'],
      ownTypes: ['water'],
      dice: [
        ['water', 5],
        ['water', 4],
        ['water', 4],
        ['base', 6],
      ],
      combo: 'Pair +3',
      mult: 2,
      dmg: 44,
      hp: [1, 0.4],
      cannons: [
        [0.2, 0.12],
        [0.78, 0.1],
      ],
    },
    grass: {
      own: 'back-venusaur',
      foe: 'front-golem',
      ownName: 'Venusaur',
      foeName: 'Golem',
      move: 'Razor Leaf',
      ownLv: 36,
      foeLv: 38,
      foeTypes: ['rock', 'ground'],
      ownTypes: ['grass', 'poison'],
      dice: [
        ['grass', 4],
        ['grass', 4],
        ['poison', 2],
        ['base', 1],
      ],
      combo: 'Pair +3',
      mult: 4,
      dmg: 56,
      hp: [1, 0.3],
      flower: [0.5, 0.14],
    },
    electric: {
      own: 'back-pikachu',
      foe: 'front-gyarados',
      ownName: 'Pikachu',
      foeName: 'Gyarados',
      move: 'Thunderbolt',
      ownLv: 32,
      foeLv: 30,
      foeTypes: ['water', 'flying'],
      ownTypes: ['electric'],
      status: 'PAR',
      statusName: 'paralyzed',
      dice: [
        ['electric', 4, 'paralyze'],
        ['electric', 4, 'paralyze'],
        ['electric', 5],
        ['base', 2],
      ],
      combo: 'Pair +3',
      mult: 4,
      dmg: 72,
      hp: [1, 0.22],
      head: [0.5, 0.3],
    },
    psychic: {
      own: 'back-alakazam',
      foe: 'front-machamp',
      ownName: 'Alakazam',
      foeName: 'Machamp',
      move: 'Psychic',
      ownLv: 40,
      foeLv: 38,
      foeTypes: ['fighting'],
      ownTypes: ['psychic'],
      status: 'CNF',
      statusName: 'confused',
      dice: [
        ['psychic', 5],
        ['psychic', 5],
        ['psychic', 2, 'confuse'],
        ['base', 4],
      ],
      combo: 'Pair +3',
      mult: 2,
      dmg: 38,
      hp: [1, 0.48],
      spoons: [
        [0.1, 0.4],
        [0.9, 0.38],
      ],
    },
  }

  /** Cues every attack shares: dice, the move name, the hit, the verdict, the status. */
  function attackCues(A, tHit, tVerdict, tStatus) {
    const c = [
      [0, (hud) => hud.roll(A.dice, `${A.combo} · ×${A.mult}`)],
      [0.3, say(`${A.ownName} used ${A.move}!`)],
      [tHit, (hud) => hud.hp('foe', A.hp[1])],
      [tVerdict, say(A.mult > 1 ? "It's super effective!" : 'A solid hit!')],
    ]
    if (A.status)
      c.push([
        tStatus,
        (hud) => {
          hud.status('foe', A.status)
          hud.say(`${A.foeName} is ${A.statusName}!`)
        },
      ])
    return c.sort((a, b) => a[0] - b[0])
  }
  const attackHud = (A) => ({
    foe: { name: A.foeName, lv: A.foeLv, types: A.foeTypes, hp: A.hp[0] },
    own: { name: A.ownName, lv: A.ownLv, hp: 0.86, max: 120 },
    msg: `What will ${A.ownName} do?`,
  })

  // ---- Fire: Flamethrower
  function fireAnim() {
    const A = ATTACKS.fire
    return {
      id: 'fire',
      dur: 4.2,
      hud: () => attackHud(A),
      beats: [
        [0, 'Roll', 'The dice land: two 6s make a Pair; the 1 is a Burn face.'],
        [
          0.5,
          'Inhale',
          'Embers spiral into the mouth; Charizard rears back 2 px. The glow grows from 2 to 9 px.',
        ],
        [0.95, 'Release', 'A particle stream: white core to soot over half a second, rising with the heat.'],
        [1.4, 'Contact', '5-frame hit-stop, two white frames on Scyther, a warm flash on the screen.'],
        [2.05, 'Engulf', 'Flame tongues climb the target, smoke curls off the top.'],
        [2.7, 'Burn', 'BRN lands in the HUD with the status line.'],
      ],
      setup(env) {
        const s = new Stage(env, A.own, A.foe, 11)
        s.M = s.ownAt(...A.mouth)
        s.T = s.foeAt(0.45, 0.5)
        s.tHit = 0.95 + dist(s.M, s.T) / 215
        s.hit(s.tHit, { stop: 0.08, shake: 2, dur: 1.1, tint: '#ff7a1e', screen: 1 })
        s.smoke = new Particles()
        return s
      },
      step(s, t, dt) {
        if (!s.step(t, dt)) return
        s.smoke.update(dt)
        const r = s.r
        if (within(t, 0.5, 0.95))
          for (let i = 0; i < 2; i++) {
            const a = r() * Math.PI * 2,
              d = r.range(12, 20)
            s.fx.add({
              x: s.M.x + Math.cos(a) * d,
              y: s.M.y + Math.sin(a) * d,
              home: { x: s.M.x, y: s.M.y, k: 900 },
              vx: -Math.sin(a) * 30,
              vy: Math.cos(a) * 30,
              life: 0.5,
              shape: 'px',
              colors: ['#ffe08a', '#ff9a3c', '#ff6a1e'],
            })
          }
        if (within(t, 0.95, 2.05)) {
          const base = Math.atan2(s.T.y - s.M.y, s.T.x - s.M.x)
          for (let i = 0; i < 6; i++) {
            const a = base + r.range(-0.11, 0.11) + Math.sin(t * 25) * 0.04
            const sp = r.range(185, 240)
            // Flames swell as they travel, then burn down to soot past the target.
            s.fx.add({
              x: s.M.x + r.range(-1, 1),
              y: s.M.y + r.range(-1, 1),
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              ay: -50,
              drag: 0.6,
              life: r.range(0.4, 0.55),
              size: r.int(1, 2),
              size1: r.int(4, 6),
              shape: 'disc',
              colors: FIRE,
            })
          }
        }
        if (within(t, s.tHit, 2.15))
          for (let i = 0; i < 2; i++) {
            const a = -Math.PI / 2 + r.range(-1.2, 1.4)
            s.fx.add({
              x: s.T.x + r.range(-6, 6),
              y: s.T.y + r.range(-6, 6),
              vx: Math.cos(a) * r.range(30, 70) + 20,
              vy: Math.sin(a) * r.range(30, 70),
              ay: -60,
              life: r.range(0.25, 0.4),
              size: r.int(1, 3),
              size1: 0,
              shape: 'disc',
              colors: FIRE.slice(1),
            })
          }
        if (within(t, 2.05, 3.1)) {
          const fs = s.fs
          const fade = 1 - span(t, 2.7, 3.1)
          for (let k = 0; k < 7; k++) {
            if (r() > 0.7 * fade) continue
            const x = s.L.foe.x + (k - 3) * fs.w * 0.13 + r.range(-3, 3)
            s.fx.add({
              x,
              y: s.L.foe.y - 2 - r.range(0, fs.h * 0.25),
              vx: r.range(-8, 8),
              vy: -r.range(60, 110),
              life: r.range(0.3, 0.55),
              size: r.int(3, 4),
              size1: 0,
              shape: 'disc',
              colors: FIRE.slice(1, 7),
            })
          }
          if (Math.floor(t * 60) % 4 === 0)
            s.smoke.add({
              x: s.L.foe.x + r.range(-10, 10),
              y: s.L.foe.y - fs.h * 0.8,
              vx: r.range(-6, 6),
              vy: -r.range(18, 30),
              life: 0.9,
              size: 2,
              size1: 6,
              shape: 'smoke',
              colors: ['#7a6464', '#5a4a4a'],
              density: 0.8,
            })
        }
      },
      draw(g, s, t) {
        s.begin(g, t)
        softEllipse(g, s.L.foe.x, s.L.foe.y, 18, 4, '#00000055', 0.35)
        s.drawFoe(
          g,
          t,
          s.hits.length && t > 2.6 ? { tint: { color: '#ff6a1e', a: Math.sin(t * 9) > 0.6 ? 0.25 : 0 } } : {},
        )
        s.smoke.draw(g)
        const pull = within(t, 0.5, 2.05)
          ? -2 * ease.outQ(span(t, 0.5, 0.95)) + (t > 0.95 && Math.floor(t * 30) % 2 ? 1 : 0)
          : 0
        s.drawOwn(g, t, { dx: pull, dy: -pull * 0.5 })
        if (within(t, 0.5, 2.05)) {
          const k = t < 0.95 ? ease.outQ(span(t, 0.5, 0.95)) : 1 - span(t, 1.9, 2.05)
          const R = Math.round(2 + 7 * k)
          g.drawImage(glow(R, '#ff9a3c', 1.2), Math.round(s.M.x - R), Math.round(s.M.y - R))
          const r2 = Math.max(1, Math.round(R / 2))
          g.drawImage(glow(r2, '#fff3b0', 1), Math.round(s.M.x - r2), Math.round(s.M.y - r2))
        }
        s.fx.draw(g)
        if (t > 2.65 && t < 3.6) {
          // The burn mark pops over the target.
          const p = span(t, 2.65, 2.9)
          g.drawImage(
            PX.icon(ICON_BURN, { k: '#1a1423', o: '#ff7a1e', y: '#ffe066', Y: '#fff6b8' }),
            Math.round(s.L.foe.x - 4),
            Math.round(s.L.foe.y - s.fs.h - 6 - 6 * ease.outBack(p)),
          )
        }
        pop(g, `-${A.dmg}`, s.T.x, s.L.foe.y - s.fs.h - 2, t, s.tHit + 0.04, '#ffd23a')
        s.end(g)
        if (within(t, s.tHit, s.tHit + 2 / 60)) wash(g, '#fff1c4', 0.45)
      },
      cues: null,
      init(s) {
        this.cues = attackCues(A, s.tHit, 2.4, 2.8)
          .concat([
            [0.5, () => Sound.noise(0.45, { freq: 400, slide: 1200, vol: 0.05 })],
            [0.95, () => Sound.noise(1.1, { freq: 900, type: 'lowpass', vol: 0.09 })],
            [s.tHit, () => Sound.noise(0.25, { freq: 300, vol: 0.12 })],
          ])
          .sort((a, b) => a[0] - b[0])
      },
    }
  }
  const ICON_BURN = [
    '....k...',
    '...kok..',
    '..koYok.',
    '.kooYyok',
    '.koyYyok',
    '.kooyyok',
    '..koook.',
    '...kkk..',
  ]

  // ---- Water: Hydro Pump
  function waterAnim() {
    const A = ATTACKS.water
    const T_ON = 0.95,
      T_OFF = 1.95,
      HEAD = 0.12
    return {
      id: 'water',
      dur: 4.0,
      hud: () => attackHud(A),
      beats: [
        [0, 'Roll', 'Water dice: 5, 4, 4. A Pair, doubled against Arcanine.'],
        [0.5, 'Charge', 'Droplets orbit into both cannons; a cold glow builds at each muzzle.'],
        [0.95, 'Jet', 'Two pressurised jets in four blues with a white core; the edges ripple at 45 Hz.'],
        [1.07, 'Contact', 'Hit-stop, knock-back of 3 px, a splash crown and a foam ring on the ground.'],
        [2.0, 'Drench', 'Bubbles rise off the target and pop; water drips from its feet.'],
      ],
      setup(env) {
        const s = new Stage(env, A.own, A.foe, 23)
        s.C = A.cannons.map(([x, y]) => s.ownAt(x, y))
        s.T = s.foeAt(0.4, 0.48)
        s.hit(T_ON + HEAD, { stop: 0.08, shake: 2, dur: 0.95, tint: '#4aa8ff', screen: 2 })
        return s
      },
      step(s, t, dt) {
        if (!s.step(t, dt)) return
        const r = s.r
        if (within(t, 0.5, 0.95))
          for (const C of s.C) {
            const a = r() * Math.PI * 2,
              d = r.range(8, 14)
            s.fx.add({
              x: C.x + Math.cos(a) * d,
              y: C.y + Math.sin(a) * d,
              home: { x: C.x, y: C.y, k: 700 },
              vx: -Math.sin(a) * 40,
              vy: Math.cos(a) * 40,
              life: 0.45,
              shape: 'px',
              colors: ['#e6f7ff', '#8fd3ff', '#3f9bff'],
            })
          }
        if (within(t, T_ON, T_OFF))
          for (const C of s.C)
            for (let i = 0; i < 2; i++) {
              const k = r()
              const p = { x: lerp(C.x, s.T.x, k), y: lerp(C.y, s.T.y, k) }
              s.fx.add({
                x: p.x,
                y: p.y,
                vx: r.range(-30, 30),
                vy: -r.range(20, 70),
                ay: 260,
                life: 0.32,
                size: 1,
                shape: 'drop',
                colors: WATER.slice(0, 4),
              })
            }
        if (within(t, T_ON + HEAD, T_OFF + 0.05))
          for (let i = 0; i < 3; i++)
            s.fx.add({
              x: s.T.x + r.range(-4, 4),
              y: s.T.y + r.range(-6, 6),
              vx: r.range(10, 90),
              vy: -r.range(40, 150),
              ay: 330,
              life: r.range(0.35, 0.6),
              size: r.int(1, 2),
              shape: r() < 0.5 ? 'drop' : 'sq',
              colors: WATER,
            })
        if (within(t, 2.0, 3.4) && Math.floor(t * 60) % 4 === 0) {
          const fs = s.fs
          s.fx.add({
            x: s.L.foe.x + r.range(-fs.w * 0.35, fs.w * 0.35),
            y: s.L.foe.y - r.range(4, fs.h * 0.8),
            vx: r.range(-4, 4),
            vy: -r.range(14, 28),
            life: r.range(0.7, 1.1),
            size: r.int(1, 3),
            shape: 'bubble',
            colors: ['#d8f4ff', '#a8e4ff'],
          })
          s.fx.add({
            x: s.L.foe.x + r.range(-fs.w * 0.3, fs.w * 0.3),
            y: s.L.foe.y - r.range(2, 10),
            vy: 20,
            ay: 220,
            life: 0.4,
            size: 1,
            shape: 'drop',
            colors: ['#8fd3ff', '#4aa8ff'],
          })
        }
      },
      draw(g, s, t) {
        s.begin(g, t)
        // Foam rings spreading on the ground while the jets hit.
        for (let k = 0; k < 4; k++) {
          const p = span(t, T_ON + HEAD + k * 0.22, T_ON + HEAD + k * 0.22 + 0.6)
          if (p > 0 && p < 1 && t < T_OFF + 0.6)
            ellipseLine(
              g,
              s.L.foe.x,
              s.L.foe.y,
              Math.round(10 + 34 * p),
              Math.round(3 + 8 * p),
              p < 0.6 ? '#e8f8ff' : '#a8e4ff',
            )
        }
        const push = within(t, T_ON + HEAD, T_OFF + 0.3)
          ? Math.round(
              3 * ease.outQ(span(t, T_ON + HEAD, T_ON + HEAD + 0.2)) * (1 - span(t, T_OFF, T_OFF + 0.3)),
            )
          : 0
        s.drawFoe(g, t, {
          dx: push,
          tint: t > 2.0 && t < 3.0 && Math.floor(t * 8) % 2 ? { color: '#4aa8ff', a: 0.2 } : null,
        })
        const recoil = within(t, 0.85, T_OFF) ? -2 + (Math.floor(t * 30) % 2) : 0
        s.drawOwn(g, t, { dx: recoil, dy: -recoil * 0.5 })
        if (within(t, 0.5, T_OFF)) {
          const k = t < T_ON ? ease.outQ(span(t, 0.5, T_ON)) : 0.8
          const R = Math.round(2 + 4 * k)
          for (const C of s.C) g.drawImage(glow(R, '#8fd3ff', 1.1), Math.round(C.x - R), Math.round(C.y - R))
        }
        if (within(t, T_ON, T_OFF + 0.15)) {
          const head = ease.outQ(span(t, T_ON, T_ON + HEAD))
          const tail = ease.inQ(span(t, T_OFF, T_OFF + 0.15))
          s.C.forEach((C, i) =>
            jet(g, C, { x: s.T.x + (i ? 3 : -3), y: s.T.y + (i ? 2 : -3) }, tail, head, t + i * 0.37),
          )
        }
        s.fx.draw(g)
        pop(g, `-${A.dmg}`, s.T.x + 6, s.L.foe.y - s.fs.h - 2, t, T_ON + HEAD + 0.04, '#ffd23a')
        s.end(g)
      },
      init() {
        this.cues = attackCues(A, T_ON + HEAD, 2.2, 0).concat([
          [0.5, () => Sound.noise(0.4, { freq: 2400, slide: -1200, vol: 0.04 })],
          [T_ON, () => Sound.noise(1.05, { freq: 1800, q: 0.6, vol: 0.08 })],
        ])
      },
    }
  }
  /** A high-pressure jet between two points: four blues and a white core, its width rippling along its length. */
  function jet(g, a, b, from, to, t) {
    const len = dist(a, b)
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    const nx = -Math.sin(ang),
      ny = Math.cos(ang)
    const s0 = Math.floor(from * len),
      s1 = Math.ceil(to * len)
    for (let s = s0; s <= s1; s++) {
      const w = 2.4 + Math.sin(s * 0.35 - t * 45) * 0.9 + (s / len) * 1.2
      const cx = a.x + Math.cos(ang) * s,
        cy = a.y + Math.sin(ang) * s
      for (let o = -Math.ceil(w); o <= Math.ceil(w); o++) {
        const q = Math.abs(o) / w
        if (q > 1.05) continue
        const col = q < 0.22 ? '#ffffff' : q < 0.5 ? '#bfeaff' : q < 0.8 ? '#4aa8ff' : '#1d5fc8'
        px(g, Math.round(cx + nx * o), Math.round(cy + ny * o), col)
      }
    }
  }

  // ---- Grass: Razor Leaf
  function grassAnim() {
    const A = ATTACKS.grass
    const N = 12,
      LAUNCH = 1.0,
      GAP = 0.05,
      FLIGHT = 0.3
    const arrive = (i) => LAUNCH + i * GAP + FLIGHT
    const SLASH = arrive(N - 1) + 0.08
    return {
      id: 'grass',
      dur: 3.9,
      hud: () => attackHud(A),
      beats: [
        [0, 'Roll', 'Grass 4 and 4, a Pair; ×4 against Rock/Ground.'],
        [0.45, 'Rustle', 'The flower shudders 1 px; twelve leaves burst upward in a fan.'],
        [0.8, 'Aim', 'The leaves hang, spinning, then turn to face the target.'],
        [
          1.0,
          'Volley',
          'Each leaf flies a curved path with a two-step trail, one every 50 ms. Chip hits tint and shake; only the slash flashes white.',
        ],
        [SLASH, 'Slash', 'A crescent wipes across Golem: 8-frame reveal, dithered fade, big hit-stop.'],
        [SLASH + 0.3, 'Fall', 'Torn leaf pieces sway down.'],
      ],
      setup(env) {
        const s = new Stage(env, A.own, A.foe, 37)
        s.F = s.ownAt(...A.flower)
        s.T = s.foeAt(0.5, 0.5)
        const r = s.r
        s.leaves = Array.from({ length: N }, (_, i) => {
          const a = -Math.PI / 2 + (i / (N - 1) - 0.5) * 2.2
          const d = r.range(18, 30)
          return {
            up: { x: s.F.x + Math.cos(a) * d * 1.3, y: s.F.y + Math.sin(a) * d - 8 },
            spin: r.range(10, 18) * (r() < 0.5 ? -1 : 1),
            target: { x: s.T.x + r.range(-10, 10), y: s.T.y + r.range(-10, 10) },
            bob: r() * 6,
            hit: false,
          }
        })
        for (let i = 0; i < N; i++)
          s.hit(arrive(i), { stop: i === 0 ? 0.04 : 0, shake: 1, dur: 0.12, tint: '#68c94a', flash: false })
        s.hit(SLASH, { stop: 0.09, shake: 3, dur: 0.6, tint: '#68c94a', screen: 2 })
        return s
      },
      leafPos(s, i, t) {
        const L = s.leaves[i]
        if (t < 0.55) return null
        if (t < LAUNCH + i * GAP) {
          const p = ease.outC(span(t, 0.55, 0.9))
          const hov = Math.sin(t * 5 + L.bob) * 1.5
          return { x: lerp(s.F.x, L.up.x, p), y: lerp(s.F.y, L.up.y, p) + hov, angle: t * L.spin }
        }
        const p = span(t, LAUNCH + i * GAP, arrive(i))
        if (p >= 1) return null
        const c = { x: (L.up.x + L.target.x) / 2, y: Math.min(L.up.y, L.target.y) - 28 - i * 2 }
        const q = quad(L.up, c, L.target, ease.inQ(p))
        q.angle = Math.atan2(L.target.y - L.up.y, L.target.x - L.up.x)
        return q
      },
      step(s, t, dt) {
        if (!s.step(t, dt)) return
        const r = s.r
        for (let i = 0; i < N; i++) {
          const L = s.leaves[i]
          if (!L.hit && t >= arrive(i)) {
            L.hit = true
            s.fx.add({
              x: L.target.x,
              y: L.target.y,
              life: 0.18,
              size: 3,
              size1: 1,
              shape: 'star',
              colors: ['#ffffff', '#d8ffb0'],
            })
            for (let k = 0; k < 4; k++)
              s.fx.add({
                x: L.target.x,
                y: L.target.y,
                vx: r.range(-60, 60),
                vy: r.range(-60, 30),
                life: 0.25,
                shape: 'px',
                colors: ['#c8f58a', '#5ec04a'],
              })
          }
        }
        if (t >= SLASH && t < SLASH + STEP * 1.5)
          for (let k = 0; k < 9; k++)
            s.fx.add({
              x: s.T.x + r.range(-14, 14),
              y: s.T.y + r.range(-12, 8),
              vx: r.range(-20, 20),
              vy: r.range(-40, -10),
              ay: 40,
              drag: 1.5,
              life: r.range(1.2, 1.8),
              shape: 'leaf',
              angle: r() * 6,
              spin: r.range(-6, 6),
              colors: ['#5ec04a', '#4aa83a'],
            })
        if (within(t, 0.45, 0.6))
          s.fx.add({
            x: s.F.x + r.range(-6, 6),
            y: s.F.y + r.range(-3, 3),
            vx: r.range(-20, 20),
            vy: -r.range(20, 50),
            life: 0.3,
            shape: 'px',
            colors: ['#d8ffb0', '#8be06a'],
          })
      },
      draw(g, s, t) {
        s.begin(g, t)
        s.drawFoe(g, t)
        const rustle = within(t, 0.45, 0.62) ? (Math.floor(t * 40) % 2 ? 1 : -1) : 0
        s.drawOwn(g, t, { dx: rustle })
        if (within(t, 0.4, 1.0)) {
          const R = Math.round(2 + 5 * ease.outQ(span(t, 0.4, 0.6)) * (1 - span(t, 0.85, 1.0)))
          g.drawImage(glow(R, '#b8f07a', 1.2), Math.round(s.F.x - R), Math.round(s.F.y - R))
        }
        for (let i = 0; i < N; i++) {
          // Two-step trail: where the leaf was 2 and 4 frames ago.
          for (const [lag, col] of [
            [0.05, '#e8ffc8'],
            [0.025, '#a8ec7a'],
          ]) {
            const q = this.leafPos(s, i, t - lag)
            if (q && t >= LAUNCH + i * GAP) rect(g, Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2, col)
          }
          const p = this.leafPos(s, i, t)
          if (p) PX_LEAF(g, p.x, p.y, p.angle)
        }
        if (within(t, SLASH, SLASH + 0.42))
          slash(g, s.T, span(t, SLASH, SLASH + 0.13), span(t, SLASH + 0.13, SLASH + 0.42))
        s.fx.draw(g)
        pop(g, `-${A.dmg}`, s.T.x, s.L.foe.y - s.fs.h - 2, t, SLASH + 0.04, '#ffd23a')
        s.end(g)
        if (within(t, SLASH, SLASH + 2 / 60)) wash(g, '#f0ffd8', 0.4)
      },
      init() {
        const c = attackCues(A, SLASH, SLASH + 0.5, 0)
        for (let i = 0; i < N; i++)
          c.push([arrive(i), () => Sound.tone(900 + i * 40, 0.05, { type: 'square', vol: 0.025 })])
        c.push([SLASH, () => Sound.noise(0.3, { freq: 3000, slide: -2000, vol: 0.08 })])
        this.cues = c.sort((a, b) => a[0] - b[0])
      },
    }
  }
  /** A leaf as a pixel shader at any angle: tapered lens, dark outline, lit upper half, a midrib. */
  function leafSprite(a) {
    const step = Math.round((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8)) % 16
    return PX.cached(`leaf|${step}`, () => {
      const ang = (step * Math.PI) / 8,
        ca = Math.cos(ang),
        sa = Math.sin(ang)
      return PX.shade(13, 13, (x, y) => {
        const dx = x - 6,
          dy = y - 6
        const u = dx * ca + dy * sa,
          v = -dx * sa + dy * ca
        const half = (k) => 2.3 * Math.sqrt(Math.max(0, 1 - Math.pow(k / 5, 2))) * (k > 0 ? 1 - k / 9 : 1)
        const hw = half(u)
        if (Math.abs(v) > hw + 0.35 || Math.abs(u) > 5.2) return null
        if (Math.abs(v) > hw - 0.65 || Math.abs(u) > 4.6) return '#24552a'
        if (Math.abs(v) < 0.45 && u > -3.5) return '#3f8f3a'
        return v < 0 ? '#c8f58a' : '#5ec04a'
      })
    })
  }
  function PX_LEAF(g, x, y, a) {
    const im = leafSprite(a)
    g.drawImage(im, Math.round(x) - 6, Math.round(y) - 6)
  }
  /** A crescent slash across a point: drawn in over `p`, dithered out over `q`. */
  function slash(g, c, p, q) {
    const a0 = -2.7,
      a1 = 0.5
    const aEnd = lerp(a0, a1, ease.outC(p))
    const steps = 60
    for (let i = 0; i <= steps; i++) {
      const a = lerp(a0, a1, i / steps)
      if (a > aEnd) break
      const k = Math.sin((i / steps) * Math.PI)
      const x = c.x + Math.cos(a) * 22,
        y = c.y + Math.sin(a) * 15
      const keep = 1 - q
      if (keep < bayer(Math.round(x), Math.round(y))) continue
      rect(g, Math.round(x), Math.round(y), 1, 1, '#ffffff')
      if (k > 0.35) rect(g, Math.round(x), Math.round(y) + 1, 1, 1, '#d8ffb0')
      if (k > 0.7) rect(g, Math.round(x), Math.round(y) + 2, 1, 1, '#8be06a')
    }
  }

  // ---- Electric: Thunderbolt
  function electricAnim() {
    const A = ATTACKS.electric
    const STRIKES = [1.1, 1.38, 1.62]
    return {
      id: 'electric',
      dur: 4.2,
      hud: () => attackHud(A),
      beats: [
        [0, 'Roll', 'Two Paralyze faces (4s) make a Pair and trigger paralysis.'],
        [0.4, 'Charge', 'The scene dims to 55 %; small arcs crackle around Pikachu, who flickers yellow.'],
        [0.95, 'Hop', 'A 5 px hop: the release.'],
        [
          1.1,
          'Strikes',
          'Three bolts from the sky, 280 ms apart, each lighting the scene as it lands. One soft screen flash only.',
        ],
        [1.8, 'Static', 'Sparks crawl over Gyarados; the yellow pulse says paralysis before the text does.'],
      ],
      setup(env) {
        const s = new Stage(env, A.own, A.foe, 51)
        s.P = s.ownAt(...A.head)
        s.T = s.foeAt(0.5, 0.42)
        STRIKES.forEach((t0, i) =>
          s.hit(t0, { stop: 0.05, shake: 3, dur: i === 2 ? 0.7 : 0.25, tint: '#ffe14d', screen: 2 }),
        )
        return s
      },
      step(s, t, dt) {
        if (!s.step(t, dt)) return
        const r = s.r
        for (const t0 of STRIKES)
          if (t >= t0 && t < t0 + STEP * 1.5)
            for (let k = 0; k < 12; k++) {
              const a = r() * Math.PI * 2,
                sp = r.range(40, 120)
              s.fx.add({
                x: s.T.x,
                y: s.T.y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                drag: 3,
                life: r.range(0.2, 0.35),
                size: r.int(1, 2),
                shape: r() < 0.5 ? 'plus' : 'sq',
                colors: ELEC,
              })
            }
        if (within(t, 0.4, 1.05) && Math.floor(t * 60) % 3 === 0)
          s.fx.add({
            x: s.P.x + r.range(-14, 14),
            y: s.P.y + r.range(-10, 8),
            vx: r.range(-20, 20),
            vy: r.range(-30, 0),
            life: 0.15,
            size: 1,
            shape: 'plus',
            colors: ELEC,
          })
      },
      draw(g, s, t) {
        // Dim the world; a landing bolt lifts it for its own frames. Sprites dim less than the field.
        const strikeNow = STRIKES.some((t0) => within(t, t0, t0 + 0.1))
        const dim = 0.55 * ease.outQ(span(t, 0.4, 0.9)) * (1 - span(t, 1.85, 2.4))
        const d = strikeNow ? dim * 0.35 : dim
        s.begin(g, t)
        wash(g, '#0a0c24', d)
        const para =
          t > 1.8 && t < 3.6 ? { color: '#ffe14d', a: 0.15 + 0.2 * (Math.sin(t * 14) > 0 ? 1 : 0) } : null
        s.drawFoe(g, t, { tint: para || (d > 0.05 ? { color: '#0a0c24', a: d * 0.55 } : null) })
        const hop = -Math.round(5 * Math.sin(Math.PI * span(t, 0.95, 1.15)))
        const charging = within(t, 0.4, 1.05)
        s.drawOwn(g, t, {
          dy: hop,
          tint:
            charging && Math.floor(t * 15) % 2
              ? { color: '#ffe14d', a: 0.45 }
              : d > 0.05
                ? { color: '#0a0c24', a: d * 0.45 }
                : null,
        })
        s.end(g)
        const sh = shakeAt(t, s.screenShakes)
        g.save()
        g.translate(sh.x, sh.y)
        if (charging && Math.floor(t * 20) % 2 === 0) {
          const rr = rng(Math.floor(t * 20))
          for (let k = 0; k < 2; k++) {
            const a = rr() * Math.PI * 2
            const p0 = { x: s.P.x + Math.cos(a) * 10, y: s.P.y + Math.sin(a) * 9 }
            const pts = bolt(rr, p0.x, p0.y, p0.x + Math.cos(a) * 9, p0.y + Math.sin(a) * 8, 0.5, 3)
            polyline(g, pts, '#ffe14d')
          }
        }
        STRIKES.forEach((t0, i) => {
          if (!within(t, t0 - 0.02, t0 + 0.12)) return
          const rr = rng(97 + i * 13 + Math.floor(t * 30))
          const sx = s.T.x + (i - 1) * 9
          const pts = bolt(rr, sx, -6, s.T.x, s.T.y, 0.28, 5)
          polyline(g, pts, '#7a5a10', 5)
          polyline(g, pts, '#ffe14d', 3)
          polyline(g, pts, '#ffffff', 1)
          const m = pts[Math.floor(pts.length * 0.45)]
          const br = bolt(rr, m[0], m[1], m[0] + rr.range(-30, 30), m[1] + rr.range(10, 30), 0.4, 3)
          polyline(g, br, '#ffe14d', 1)
          g.drawImage(glow(14, '#fff6a8', 1.3, 0.9), Math.round(s.T.x - 14), Math.round(s.T.y - 14))
        })
        if (t > 1.8 && t < 3.6 && Math.floor(t * 60) % 5 === 0) {
          const rr = rng(Math.floor(t * 60))
          const fs = s.fs
          const x0 = s.L.foe.x + rr.range(-fs.w * 0.35, fs.w * 0.35),
            y0 = s.L.foe.y - rr.range(6, fs.h * 0.85)
          polyline(g, bolt(rr, x0, y0, x0 + rr.range(-8, 8), y0 + rr.range(-8, 8), 0.6, 2), '#fff6a8')
        }
        s.fx.draw(g)
        pop(g, `-${A.dmg}`, s.T.x, s.L.foe.y - s.fs.h - 2, t, STRIKES[0] + 0.04, '#ffd23a')
        g.restore()
        if (within(t, STRIKES[0], STRIKES[0] + 2 / 60)) wash(g, '#ffffff', 0.35)
      },
      init() {
        const c = attackCues(A, STRIKES[0], 2.1, 2.7)
        c.push([0.4, () => Sound.noise(0.6, { freq: 3000, q: 4, vol: 0.03 })])
        STRIKES.forEach((t0) =>
          c.push([
            t0,
            () => {
              Sound.noise(0.3, { freq: 2500, slide: -2200, vol: 0.1 })
              Sound.tone(70, 0.3, { type: 'sawtooth', vol: 0.05, slide: -30 })
            },
          ]),
        )
        this.cues = c.sort((a, b) => a[0] - b[0])
      },
    }
  }

  // ---- Psychic: Psychic
  function psychicAnim() {
    const A = ATTACKS.psychic
    const LIFT = 1.0,
      SLAM = 2.12
    return {
      id: 'psychic',
      dur: 4.4,
      hud: () => attackHud(A),
      beats: [
        [0, 'Roll', 'Psychic 5 and 5; the third die shows the Confuse face.'],
        [0.4, 'Focus', 'Both spoons glow; rings ripple out of Alakazam and the world tints violet.'],
        [
          0.9,
          'Warp',
          'Every row of the screen slides on a sine (3 px, 14-row wave), the gen 3–5 Psychic look.',
        ],
        [1.0, 'Lift', 'Machamp floats 6 px with a pink/cyan split behind it.'],
        [SLAM, 'Slam', 'It drops 8 px in 4 frames: hit-stop, a fast ring and a pink flash.'],
        [2.3, 'Daze', 'Three stars circle its head: confusion, readable without text.'],
      ],
      setup(env) {
        const s = new Stage(env, A.own, A.foe, 63)
        s.S = A.spoons.map(([x, y]) => s.ownAt(x, y))
        s.O = s.ownAt(0.5, 0.45)
        s.T = s.foeAt(0.5, 0.5)
        s.hit(SLAM, { stop: 0.09, shake: 3, dur: 0.6, tint: '#ff7ad9', screen: 3 })
        s.layer = canvas(W, H)
        return s
      },
      step(s, t, dt) {
        if (!s.step(t, dt)) return
        const r = s.r
        if (t >= SLAM && t < SLAM + STEP * 1.5)
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2
            s.fx.add({
              x: s.T.x,
              y: s.T.y,
              vx: Math.cos(a) * 90,
              vy: Math.sin(a) * 60,
              drag: 4,
              life: 0.5,
              size: 2,
              size1: 0,
              shape: 'star',
              colors: PSY.slice(0, 4),
              core: '#ffffff',
            })
          }
        if (within(t, 0.4, 2.0) && Math.floor(t * 60) % 6 === 0)
          for (const S of s.S)
            s.fx.add({
              x: S.x + r.range(-2, 2),
              y: S.y,
              vy: -r.range(10, 25),
              life: 0.6,
              size: 1,
              shape: 'star',
              colors: ['#ffc2f0', '#ff7ad9'],
            })
      },
      draw(gOut, s, t) {
        const g = s.layer.g
        g.clearRect(0, 0, W, H)
        s.begin(g, t)
        const lift =
          t < SLAM
            ? -6 * ease.ioS(span(t, LIFT, LIFT + 0.4)) + (t > LIFT + 0.4 ? Math.round(Math.sin(t * 9)) : 0)
            : 2 * (1 - span(t, SLAM + 0.1, SLAM + 0.4))
        const lifting = within(t, LIFT, SLAM)
        s.drawFoe(g, t, {
          dy: Math.round(lift),
          outline: lifting && Math.floor(t * 15) % 2 ? '#ff7ad9' : null,
          ghost: lifting
            ? [
                { dx: -2, color: '#ff4fa8', a: 0.5 },
                { dx: 2, color: '#4fe0ff', a: 0.5 },
              ]
            : null,
        })
        s.drawOwn(g, t, {
          tint: within(t, 0.4, 1.0) && Math.floor(t * 12) % 2 ? { color: '#ff7ad9', a: 0.3 } : null,
        })
        for (const S of s.S)
          if (within(t, 0.4, 2.1)) {
            const R = 2 + (Math.floor(t * 8) % 2)
            g.drawImage(glow(R + 2, '#ff7ad9', 1.2), Math.round(S.x - R - 2), Math.round(S.y - R - 2))
          }
        for (let k = 0; k < 3; k++) {
          const p = span(t, 0.45 + k * 0.2, 1.05 + k * 0.2)
          if (p > 0 && p < 1) {
            const R = Math.round(4 + 40 * ease.outQ(p))
            g.drawImage(ring(R, 2, '#d65cff', 1 - p), Math.round(s.O.x - R - 1), Math.round(s.O.y - R - 1))
          }
        }
        const sp = span(t, SLAM, SLAM + 0.3)
        if (sp > 0 && sp < 1) {
          const R = Math.round(6 + 30 * ease.outC(sp))
          g.drawImage(ring(R, 3, '#ff7ad9', 1 - sp), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
          if (R > 10)
            g.drawImage(
              ring(R - 6, 1, '#ffffff', 1 - sp),
              Math.round(s.T.x - R + 5),
              Math.round(s.T.y - R + 5),
            )
        }
        if (within(t, 2.3, 3.9)) {
          // Confusion: three stars on an orbit over its head.
          const top = s.L.foe.y - s.fs.h - 4
          for (let k = 0; k < 3; k++) {
            const a = t * 4 + (k * Math.PI * 2) / 3
            const x = s.L.foe.x + Math.cos(a) * 13,
              y = top + Math.sin(a) * 4
            rect(g, Math.round(x) - 1, Math.round(y), 3, 1, '#ffe14d')
            rect(g, Math.round(x), Math.round(y) - 1, 1, 3, '#ffe14d')
            if (Math.sin(a) > 0) rect(g, Math.round(x), Math.round(y), 1, 1, '#ffffff')
          }
        }
        s.fx.draw(g)
        pop(g, `-${A.dmg}`, s.T.x, s.L.foe.y - s.fs.h - 2, t, SLAM + 0.04, '#ffd23a')
        s.end(g)
        const tint = 0.35 * ease.outQ(span(t, 0.4, 0.9)) * (1 - span(t, 2.4, 3.0))
        wash(g, '#4a1f7a', tint)
        // The warp: each row slides on a sine; the amplitude swells and settles.
        const amp = 3 * Math.sin(Math.PI * span(t, 0.9, 2.1))
        gOut.clearRect(0, 0, W, H)
        gOut.drawImage(s.layer, 0, 0)
        if (amp > 0.3) {
          for (let y = 0; y < H; y++) {
            const off = Math.round(Math.sin((y / 14) * Math.PI * 2 + t * 12) * amp)
            gOut.drawImage(s.layer, 0, y, W, 1, off, y, W, 1)
          }
        }
        if (within(t, SLAM, SLAM + 2 / 60)) wash(gOut, '#ffd6f4', 0.45)
      },
      init() {
        const c = attackCues(A, SLAM, SLAM + 0.45, 2.85)
        c.push([
          0.4,
          () => {
            Sound.tone(220, 1.4, { type: 'sine', vol: 0.05, slide: 220 })
            Sound.tone(223, 1.4, { type: 'sine', vol: 0.04, slide: 260 })
          },
        ])
        c.push([SLAM, () => Sound.noise(0.35, { freq: 500, vol: 0.1 })])
        this.cues = c.sort((a, b) => a[0] - b[0])
      },
    }
  }

  // ---------------------------------------------------------------- catch (in battle)
  function catchAnim(opts = {}) {
    const kind = opts.ball || 'great'
    const B = SCN.BALLS[kind]
    const need = 5
    const caught = kind === 'master' || opts.outcome !== 'fail'
    const die = caught ? clamp(need - B.bonus + 1, 1, 6) : clamp(need - B.bonus - 1, 1, 6)
    const T_THROW = 0.8,
      T_HIT = 1.35,
      T_OPEN = 1.43,
      T_ABS = 1.55,
      T_CLOSE = 1.98,
      T_DROP = 2.05
    const T_ROLL = 2.8,
      WOB = caught ? [3.7, 4.55, 5.4] : [3.7, 4.55],
      T_END = caught ? 6.05 : 5.3
    const dur = caught ? 7.6 : 7.4
    return {
      id: 'catch',
      dur,
      hud: () => ({
        foe: { name: 'Eevee', lv: 25, types: ['normal'], hp: 0 },
        own: { name: 'Pikachu', lv: 32, hp: 0.74, max: 64 },
        msg: 'Eevee is worn out!',
      }),
      beats: [
        [
          0,
          'Worn out',
          'After a K.O. the foe stays on its platform: lower, greyed, animation at 35 % speed, stars circling.',
        ],
        [T_THROW, 'Throw', 'The ball arcs in from bottom left, spinning, with a two-ghost trail.'],
        [T_HIT, 'Contact', 'Hit-stop on contact; Eevee flashes white.'],
        [
          T_OPEN,
          'Capture beam',
          'The lid swings open, red light floods the silhouette, and it shrinks into the ball.',
        ],
        [T_DROP, 'Drop', 'The ball falls with two bounces (9 px, then 3 px) and a dust puff on each.'],
        [T_ROLL, 'Catch roll', `The catch die: ${die} + ${B.bonus} (${B.name}) against ${need}.`],
        [
          WOB[0],
          'Wobbles',
          'Each wobble tilts left then right, the button glowing red. Stillness between them is the tension.',
        ],
        [
          T_END,
          caught ? 'Gotcha' : 'Break free',
          caught
            ? 'Click: three stars burst in a fan, the ball darkens to say “locked”.'
            : 'The ball bursts, both halves fly, Eevee pops back with a flash and runs.',
        ],
      ],
      setup(env) {
        const s = new Stage(env, 'back-pikachu', 'front-eevee', 71)
        s.CP = s.foeAt(0.5, 0.45)
        s.ground = s.L.foe.y - 6
        s.start = { x: -10, y: H + 6 }
        s.ctrl = { x: W * 0.36, y: 6 }
        s.stops.push([T_HIT, T_HIT + 0.08])
        return s
      },
      ballPos(s, t) {
        if (t < T_THROW) return null
        if (t < T_HIT) {
          const p = span(t, T_THROW, T_HIT)
          return Object.assign(quad(s.start, s.ctrl, s.CP, ease.outQ(p)), { a: -p * 14 })
        }
        if (t < T_DROP)
          return {
            x: s.CP.x,
            y: s.CP.y - 2 * ease.outQ(span(t, T_OPEN, T_ABS)) + 2 * span(t, T_CLOSE, T_DROP),
            a: 0,
          }
        // Fall and two bounces.
        const tt = t - T_DROP
        const fall = 0.26,
          b1 = 0.22,
          b2 = 0.12
        let y
        if (tt < fall) y = lerp(s.CP.y, s.ground, ease.inQ(tt / fall))
        else if (tt < fall + b1) y = s.ground - 9 * Math.sin(Math.PI * ((tt - fall) / b1))
        else if (tt < fall + b1 + b2) y = s.ground - 3 * Math.sin(Math.PI * ((tt - fall - b1) / b2))
        else y = s.ground
        return { x: s.CP.x, y, a: 0 }
      },
      wobble(t) {
        for (const w of WOB) {
          const p = span(t, w, w + 0.42)
          if (p > 0 && p < 1)
            return 0.55 * Math.sin(p * Math.PI * 2) * Math.pow(1 - p, 0.6) * (p < 0.5 ? 1 : 0.8)
        }
        return 0
      },
      step(s, t, dt) {
        if (!s.step(t, dt)) return
        const r = s.r
        const bp = this.ballPos(s, t)
        if (within(t, T_ABS, T_CLOSE - 0.05)) {
          const k = 1 - span(t, T_ABS, T_CLOSE)
          const fs = s.fs
          for (let i = 0; i < 4; i++)
            s.fx.add({
              x: s.L.foe.x + r.range(-fs.w / 2, fs.w / 2) * k,
              y: s.L.foe.y - r.range(0, fs.h) * k,
              home: { x: bp.x, y: bp.y, k: 1600 },
              life: 0.4,
              size: 1,
              shape: 'streak',
              trail: 0.02,
              colors: ['#ffffff', '#ff9aa8', '#ff3b5c'],
            })
        }
        const contacts = [T_DROP + 0.26, T_DROP + 0.48, T_DROP + 0.6]
        for (const c of contacts)
          if (t >= c && t < c + STEP * 1.5)
            for (const d of [-1, 1])
              for (let i = 0; i < 3; i++)
                s.under.add({
                  x: bp.x + d * r.range(3, 6),
                  y: s.ground + 5,
                  vx: d * r.range(15, 35),
                  vy: -r.range(5, 18),
                  drag: 3,
                  life: 0.45,
                  size: 1,
                  size1: 3,
                  shape: 'smoke',
                  colors: ['#d9cdb4', '#b8ab92'],
                  density: 1,
                })
        if (caught && t >= T_END && t < T_END + STEP * 1.5) {
          for (let k = 0; k < 10; k++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: bp.x,
              y: bp.y,
              vx: Math.cos(a) * 50,
              vy: Math.sin(a) * 40,
              drag: 3,
              life: 0.5,
              size: 1,
              shape: 'plus',
              colors: ['#ffffff', '#ffe066'],
            })
          }
        }
        if (!caught && t >= T_END + 0.15 && t < T_END + 0.15 + STEP * 1.5)
          for (let k = 0; k < 18; k++) {
            const a = r() * Math.PI * 2,
              sp = r.range(40, 110)
            s.fx.add({
              x: bp.x,
              y: bp.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              drag: 3,
              life: 0.45,
              size: 1,
              shape: 'sq',
              colors: ['#ffffff', '#ff9aa8', '#ff3b5c'],
            })
          }
        if (!caught && within(t, 6.0, 6.7) && Math.floor(t * 60) % 3 === 0)
          s.under.add({
            x: s.L.foe.x + this.fleeX(t) - 8,
            y: s.L.foe.y,
            vx: -20,
            vy: -6,
            drag: 2,
            life: 0.4,
            size: 1,
            size1: 3,
            shape: 'smoke',
            colors: ['#d9cdb4', '#b8ab92'],
          })
      },
      fleeX(t) {
        return 70 * ease.inQ(span(t, 6.05, 6.7))
      },
      draw(g, s, t) {
        s.begin(g, t)
        const bp = this.ballPos(s, t)
        // Foe: worn out, absorbed, or back out and fleeing.
        const back = !caught && t >= T_END + 0.15
        const fs = s.fs
        if (t < T_ABS) {
          s.drawFoe(g, t, {
            dy: 3,
            rate: 0.35,
            tint:
              t < T_OPEN
                ? { color: '#6b6480', a: 0.22 }
                : { color: '#ff3b5c', a: span(t, T_OPEN, T_OPEN + 0.08) },
            flash: within(t, T_HIT, T_HIT + 0.07) ? 1 : 0,
          })
        } else if (t < T_CLOSE) {
          const k = 1 - ease.inC(span(t, T_ABS, T_CLOSE - 0.04))
          if (k > 0.02) {
            const y = lerp(bp.y + fs.h * k * 0.5, s.L.foe.y + 3, k)
            sprite(g, s.foe, lerp(bp.x, s.L.foe.x, k), y, s.clock(t), {
              sx: k,
              sy: k,
              sil: Math.floor(t * 30) % 2 ? '#ff3b5c' : '#ffffff',
            })
          }
        } else if (back) {
          const p = span(t, T_END + 0.15, T_END + 0.4)
          const k = ease.outBack(p, 2)
          const hop = t > 6.0 ? -Math.round(Math.abs(Math.sin((t - 6.0) * 10)) * 4) : 0
          const alpha = 1 - span(t, 6.4, 6.75)
          if (alpha > 0)
            sprite(g, s.foe, s.L.foe.x + this.fleeX(t), s.L.foe.y + hop, s.clock(t), {
              sx: k,
              sy: k,
              flash: 1 - span(t, T_END + 0.25, T_END + 0.6),
              alpha,
            })
        }
        s.under.draw(g)
        s.drawOwn(g, t)
        // Dizzy stars while worn out.
        if (t < T_HIT) {
          const top = s.L.foe.y - fs.h + 2
          for (let k = 0; k < 3; k++) {
            const a = t * 3.2 + (k * Math.PI * 2) / 3
            const x = Math.round(s.L.foe.x + Math.cos(a) * 11),
              y = Math.round(top + Math.sin(a) * 3)
            rect(g, x - 1, y, 3, 1, '#ffe066')
            rect(g, x, y - 1, 1, 3, '#ffe066')
          }
        }
        // The ball.
        if (bp && !(back && t > T_END + 0.15)) {
          // Ghost trail while it flies.
          if (t < T_HIT)
            for (const [lag, col] of [
              [0.05, '#ffffff'],
              [0.025, '#ffffff'],
            ]) {
              const q = this.ballPos(s, t - lag)
              if (q) rect(g, Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2, col)
            }
          let open = 0
          if (within(t, T_OPEN, T_CLOSE)) open = ease.outBack(span(t, T_OPEN, T_OPEN + 0.08))
          if (within(t, T_CLOSE, T_CLOSE + 0.05)) open = 1 - span(t, T_CLOSE, T_CLOSE + 0.05)
          const wob = this.wobble(t)
          const rattling = !caught && within(t, T_END - 0.05, T_END + 0.15)
          const glowing = WOB.some((w) => within(t, w, w + 0.42)) || rattling
          const done = caught && t >= T_END
          const btn = done
            ? within(t, T_END, T_END + 0.12)
              ? '#ffffff'
              : '#7a7090'
            : glowing
              ? Math.floor(t * 20) % 2
                ? '#ff3b5c'
                : '#ff8a9a'
              : '#ffffff'
          const im = SCN.ball(kind, bp.a + wob, { open, button: btn, dim: done ? 1 : 0 })
          const rx = rattling ? (Math.floor(t * 60) % 2 ? 2 : -2) : Math.round(wob * 4)
          if (t > T_DROP) softEllipse(g, bp.x, s.ground + 6, 6, 2, '#00000066', 0.6)
          g.drawImage(im, Math.round(bp.x - im.width / 2 + rx), Math.round(bp.y - im.height / 2))
          if (open > 0.3) {
            // The capture beam: red lines from the ball's mouth to the silhouette, flickering.
            const rr = rng(Math.floor(t * 30))
            for (let k = 0; k < 4; k++) {
              const tx = s.L.foe.x + rr.range(-fs.w * 0.35, fs.w * 0.35),
                ty = s.L.foe.y - rr.range(4, fs.h * 0.9)
              line(g, bp.x, bp.y - 3, tx, ty, k % 2 ? '#ff3b5c' : '#ffd0d8')
            }
          }
        }
        // Close flash ring.
        const cp = span(t, T_CLOSE, T_CLOSE + 0.18)
        if (cp > 0 && cp < 1) {
          const R = Math.round(3 + 10 * ease.outC(cp))
          g.drawImage(ring(R, 2, '#ffffff', 1 - cp), Math.round(s.CP.x - R - 1), Math.round(s.CP.y - R - 1))
        }
        // Burst: two halves flying apart.
        if (back && t < T_END + 0.9) {
          const p = t - (T_END + 0.15)
          const im = SCN.ball(kind, p * 8, {})
          const half = Math.floor(im.height / 2)
          const bx = s.CP.x,
            by = s.ground
          if (Math.floor(p * 20) % 2 || p < 0.4) {
            g.drawImage(
              im,
              0,
              0,
              im.width,
              half,
              Math.round(bx - im.width / 2 - 45 * p),
              Math.round(by - im.height / 2 - 90 * p + 200 * p * p),
              im.width,
              half,
            )
            g.drawImage(
              im,
              0,
              half,
              im.width,
              im.height - half,
              Math.round(bx - im.width / 2 + 40 * p),
              Math.round(by - 70 * p + 200 * p * p),
              im.width,
              im.height - half,
            )
          }
        }
        // Gotcha stars: a fan of three.
        if (caught && t >= T_END) {
          const p = span(t, T_END, T_END + 0.5)
          if (p < 1 && !(p > 0.7 && Math.floor(t * 20) % 2))
            for (const a of [-2.1, -1.57, -1.05]) {
              const d = 16 * ease.outBack(p, 2)
              const x = Math.round(bp.x + Math.cos(a) * d),
                y = Math.round(bp.y + Math.sin(a) * d)
              rect(g, x - 2, y, 5, 1, '#ffe066')
              rect(g, x, y - 2, 1, 5, '#ffe066')
              rect(g, x - 1, y - 1, 3, 3, '#ffe066')
              rect(g, x, y, 1, 1, '#ffffff')
            }
        }
        s.fx.draw(g)
        s.end(g)
        // Wobble tension: the edges darken a little more with each wobble.
        const v =
          WOB.filter((w) => t > w).length *
          0.09 *
          (t < T_END + 0.2 ? 1 : 1 - span(t, T_END + 0.2, T_END + 0.6))
        if (v > 0) vignette(g, v)
        if (!caught && within(t, T_END + 0.15, T_END + 0.15 + 2 / 60)) wash(g, '#ffffff', 0.55)
      },
      init() {
        const c = [
          [0, (hud) => hud.chip(`Catch: d6 + ${B.bonus} ≥ ${need}`)],
          [0.4, say(`You threw a ${B.name}!`)],
          [T_THROW, () => Sound.noise(0.3, { freq: 1500, slide: 1500, vol: 0.04 })],
          [T_OPEN, () => Sound.tone(500, 0.3, { type: 'square', vol: 0.04, slide: 700 })],
          [T_ABS, (hud) => hud.show('foe', false)],
          [T_CLOSE, () => Sound.tone(1200, 0.06, { vol: 0.04 })],
          [
            T_ROLL,
            (hud) => hud.roll([['base', die]], `${die} + ${B.bonus} = ${die + B.bonus} · need ${need}`),
          ],
          [
            T_ROLL + 0.6,
            say(
              die + B.bonus >= need
                ? `Rolled ${die} + ${B.bonus} = ${die + B.bonus}. Just enough…`
                : `Rolled ${die} + ${B.bonus} = ${die + B.bonus}. Not enough…`,
            ),
          ],
        ]
        for (const w of WOB)
          c.push(
            [w, () => Sound.tone(180, 0.05, { type: 'square', vol: 0.06 })],
            [w + 0.4, () => Sound.tone(140, 0.04, { type: 'square', vol: 0.05 })],
          )
        if (caught)
          c.push(
            [
              T_END,
              () => {
                Sound.tone(880, 0.12, { vol: 0.05 })
                Sound.tone(1320, 0.3, { vol: 0.05, at: 0.12 })
              },
            ],
            [T_END + 0.05, say('Gotcha! Eevee was caught!')],
            [T_END + 0.4, (hud) => hud.chip('New Pokédex entry · #133')],
          )
        else
          c.push(
            [T_END + 0.15, () => Sound.noise(0.25, { freq: 900, vol: 0.1 })],
            [
              T_END + 0.2,
              (hud) => {
                hud.show('foe', true)
                hud.say('Oh no! It broke free!')
              },
            ],
            [
              6.45,
              (hud) => {
                hud.say('Eevee fled!')
                hud.show('foe', false)
              },
            ],
          )
        this.cues = c.sort((a, b) => a[0] - b[0])
      },
    }
  }
  /** Darken toward the edges with dither: the vignette keeps the pixel grid. */
  function vignette(g, a) {
    // Four banded rings of darkness toward the corners: stepped, never dithered over the sprites.
    const k = Math.round(a * 20)
    const c = PX.cached(`vig|${k}`, () => {
      const v = PX.canvas(W, H)
      const img = v.g.createImageData(W, H)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))
          const band = Math.floor(clamp((d - 0.8) / 0.5) * 3) / 3
          const i = (y * W + x) * 4
          img.data[i] = 11
          img.data[i + 1] = 8
          img.data[i + 2] = 20
          img.data[i + 3] = Math.round(band * (k / 20) * 1.6 * 255)
        }
      v.g.putImageData(img, 0, 0)
      return v
    })
    g.drawImage(c, 0, 0)
  }

  // ---------------------------------------------------------------- legendary encounter
  const LEGENDS = {
    mewtwo: {
      key: 'front-mewtwo',
      name: 'Mewtwo',
      lv: 70,
      types: ['psychic'],
      aura: ['#ffffff', '#f0c8ff', '#c26bf0', '#5b2391'],
      fx: 'psy',
      night: '#12081f',
    },
    articuno: {
      key: 'front-articuno',
      name: 'Articuno',
      lv: 50,
      types: ['ice', 'flying'],
      aura: ['#ffffff', '#c8f4ff', '#5fc0e0', '#235f8c'],
      fx: 'snow',
      night: '#071425',
    },
    zapdos: {
      key: 'front-zapdos',
      name: 'Zapdos',
      lv: 50,
      types: ['electric', 'flying'],
      aura: ['#ffffff', '#fff3a0', '#ffd23a', '#8a6a10'],
      fx: 'spark',
      night: '#100e22',
    },
    moltres: {
      key: 'front-moltres',
      name: 'Moltres',
      lv: 50,
      types: ['fire', 'flying'],
      aura: ['#ffffff', '#ffe08a', '#ff8a1e', '#9a2a16'],
      fx: 'ember',
      night: '#1c0806',
    },
  }
  function legendAnim(opts = {}) {
    const Lg = LEGENDS[opts.legend || 'mewtwo']
    const T_WIPE = 0.75,
      T_DARK = 1.35,
      T_SIL = 2.0,
      T_RAYS = 2.55,
      T_REVEAL = 3.2,
      T_BANNER = 3.55,
      T_OUT = 4.75,
      T_HUD = 5.25,
      T_SEND = 5.9,
      T_POP = 6.25
    return {
      id: 'legend',
      dur: 7.9,
      hud: () => ({
        foe: { name: Lg.name, lv: Lg.lv, types: Lg.types, hp: 1, show: false },
        own: { name: 'Charizard', lv: 52, hp: 1, max: 156, show: false },
        msg: '',
      }),
      beats: [
        [0, 'Unease', 'Two dark pulses over the field: the world holds its breath.'],
        [T_WIPE, 'Shatter', `Diamond shards close in from the edges, edged in ${Lg.name}'s aura colour.`],
        [T_DARK, 'Presence', 'Darkness, drifting element particles, two heartbeat glows.'],
        [
          T_SIL,
          'Silhouette',
          'The field returns at 30 %; a black silhouette rises 6 px with a flickering aura line.',
        ],
        [T_RAYS, 'Rays', 'Light wedges turn behind it; a gleam sweeps across the silhouette.'],
        [T_REVEAL, 'Reveal', 'One white flash, full colour, two shockwaves, roar arcs and a 0.8 s quake.'],
        [
          T_BANNER,
          'Name card',
          'Letterbox bars and a sweeping banner with the name in 2× pixel type and a glint.',
        ],
        [T_HUD, 'Battle', 'Bars retract, the foe box slides in, Charizard is sent out with a pop.'],
      ],
      setup(env) {
        const s = new Stage(env, 'back-charizard', Lg.key, 83)
        s.C = s.foeAt(0.5, 0.5)
        s.mouth = s.foeAt(0.25, 0.3)
        s.screenShakes.push([T_REVEAL, 0.8, 3])
        s.amb = new Particles()
        s.rays = canvas(W, H)
        return s
      },
      step(s, t, dt) {
        s.step(t, dt)
        s.amb.update(dt)
        const r = s.r
        if (t > T_DARK - 0.3) {
          const n = t > T_REVEAL ? 2 : 1
          for (let i = 0; i < n; i++) if (r() < (Lg.fx === 'snow' ? 0.5 : 0.22)) emitElement(s.amb, Lg, r)
        }
        if (t >= T_REVEAL && t < T_REVEAL + STEP * 1.5)
          for (let k = 0; k < 40; k++) {
            const a = r() * Math.PI * 2,
              sp = r.range(40, 140)
            s.fx.add({
              x: s.C.x,
              y: s.C.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              drag: 2.5,
              life: r.range(0.5, 0.9),
              size: r.int(1, 2),
              shape: Lg.fx === 'snow' ? 'flake' : Lg.fx === 'psy' ? 'star' : 'sq',
              colors: Lg.aura.slice(0, 3),
            })
          }
        if (t >= T_POP && t < T_POP + STEP * 1.5)
          for (let k = 0; k < 12; k++) {
            const a = r() * Math.PI * 2
            s.fx.add({
              x: s.L.own.x,
              y: s.L.own.y - 50,
              vx: Math.cos(a) * 70,
              vy: Math.sin(a) * 50,
              drag: 4,
              life: 0.4,
              size: 1,
              shape: 'plus',
              colors: ['#ffffff', '#ffd0d8'],
            })
          }
      },
      draw(g, s, t) {
        const A = Lg.aura
        // Darkness: two pulses, full black after the shatter, then a slow, partial return.
        let dark = Math.max(
          0.75 * Math.sin(Math.PI * span(t, 0.1, 0.35)),
          0.75 * Math.sin(Math.PI * span(t, 0.42, 0.67)),
        )
        if (t >= T_DARK && t < T_SIL) dark = 1
        if (t >= T_SIL) dark = lerp(1, 0.68, span(t, T_SIL, T_SIL + 0.6))
        if (t >= T_REVEAL) dark = lerp(0.68, 0.4, span(t, T_REVEAL, T_REVEAL + 0.5))
        if (t >= T_OUT) dark = lerp(0.4, 0.22, span(t, T_OUT, T_OUT + 0.6))
        const sh = shakeAt(t, s.screenShakes)
        if (sh.x || sh.y) g.drawImage(s.bg.cv, 0, 0)
        g.save()
        g.translate(sh.x, sh.y)
        g.drawImage(s.bg.cv, 0, 0)
        s.bg.dyn(g, t)
        if (dark > 0) wash(g, Lg.night, dark, 16)
        // Everything that carries light sits above the darkness: rays, the legendary, the aura, the particles.
        if (t > T_RAYS) {
          drawRays(
            s.rays,
            s.C,
            t,
            A[t > T_REVEAL ? 3 : 2],
            span(t, T_RAYS, T_RAYS + 0.5) * (t > T_OUT ? 0.4 : t > T_REVEAL + 0.4 ? 0.6 : 1),
          )
          g.drawImage(s.rays, 0, 0)
        }
        if (t >= T_SIL) {
          if (t < T_REVEAL) {
            const rise = Math.round(6 * (1 - ease.outC(span(t, T_SIL, T_SIL + 0.8))))
            sprite(g, s.foe, s.L.foe.x, s.L.foe.y + rise, s.clock(t), {
              sil: '#06040c',
              outline: Math.floor(t * 12) % 3 === 0 ? A[1] : A[2],
            })
            const gp = span(t, T_RAYS + 0.2, T_RAYS + 0.55)
            if (gp > 0 && gp < 1) gleam(g, s, t, gp)
          } else
            sprite(g, s.foe, s.L.foe.x, s.L.foe.y, s.clock(t), {
              flash: 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4),
              outline: Math.floor(t * 8) % 2 ? A[2] : A[3],
            })
        }
        if (t >= T_SEND && t < T_POP) {
          const p = span(t, T_SEND, T_POP)
          const b = quad(
            { x: -8, y: H + 8 },
            { x: s.L.own.x - 10, y: H * 0.35 },
            { x: s.L.own.x, y: s.L.own.y - 50 },
            ease.outQ(p),
          )
          const im = SCN.ball('poke', -p * 12)
          g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2))
        }
        if (t >= T_POP) {
          const k = ease.outBack(span(t, T_POP, T_POP + 0.22), 2.2)
          s.drawOwn(g, t, { sx: k, sy: k, flash: 1 - span(t, T_POP + 0.1, T_POP + 0.45) })
        }
        for (const d of [0, 0.14]) {
          const p = span(t, T_REVEAL + d, T_REVEAL + d + 0.6)
          if (p > 0 && p < 1) {
            const R = Math.min(130, Math.round(8 + 120 * ease.outC(p)))
            g.drawImage(ring(R, 3, A[1], 1 - p), Math.round(s.C.x - R - 1), Math.round(s.C.y - R - 1))
          }
        }
        for (const d of [0.05, 0.2, 0.35]) {
          const p = span(t, T_REVEAL + d, T_REVEAL + d + 0.45)
          if (p > 0 && p < 1)
            ellipseLine(
              g,
              s.mouth.x,
              s.mouth.y,
              Math.round(6 + 26 * p),
              Math.round(5 + 20 * p),
              A[0],
              Math.PI * 0.72,
              Math.PI * 1.28,
            )
        }
        s.fx.draw(g)
        s.amb.draw(g)
        g.restore()
        if (within(t, T_WIPE, T_DARK)) shatter(g, span(t, T_WIPE, T_DARK), A)
        if (t >= T_DARK && t < T_SIL)
          for (const hb of [1.55, 1.85]) {
            // Heartbeats: a glow where it waits.
            const p = span(t, hb, hb + 0.3)
            if (p > 0 && p < 1)
              g.drawImage(
                glow(30, A[3], 1.3, 0.7 * Math.sin(Math.PI * p)),
                Math.round(s.C.x - 30),
                Math.round(s.C.y - 30),
              )
          }
        if (within(t, T_REVEAL, T_REVEAL + 0.3))
          wash(g, '#ffffff', 0.8 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
        const bars = Math.round(
          16 * (ease.outC(span(t, T_BANNER - 0.15, T_BANNER + 0.1)) - ease.inC(span(t, T_OUT, T_OUT + 0.4))),
        )
        if (bars > 0) {
          rect(g, 0, 0, W, bars, '#05030a')
          rect(g, 0, H - bars, W, bars, '#05030a')
        }
        if (within(t, T_BANNER, T_OUT + 0.3))
          banner(g, t, Lg, span(t, T_BANNER, T_BANNER + 0.28), span(t, T_OUT - 0.05, T_OUT + 0.25))
      },
      init() {
        this.cues = [
          [0.1, () => Sound.tone(55, 0.3, { type: 'sine', vol: 0.12 })],
          [0.42, () => Sound.tone(55, 0.3, { type: 'sine', vol: 0.12 })],
          [T_WIPE, () => Sound.noise(0.6, { freq: 4000, slide: -3500, vol: 0.05 })],
          [1.55, () => Sound.tone(48, 0.25, { type: 'sine', vol: 0.14 })],
          [1.85, () => Sound.tone(48, 0.25, { type: 'sine', vol: 0.14 })],
          [
            T_REVEAL,
            () => {
              Sound.tone(180, 0.9, { type: 'sawtooth', vol: 0.07, slide: -120 })
              Sound.tone(184, 0.9, { type: 'sawtooth', vol: 0.05, slide: -130 })
              Sound.noise(0.8, { freq: 600, type: 'lowpass', vol: 0.1 })
            },
          ],
          [
            T_HUD,
            (hud) => {
              hud.show('foe', true)
              hud.say(`A wild ${Lg.name.toUpperCase()} appeared!`)
            },
          ],
          [T_SEND, (hud) => hud.say('Go! Charizard!')],
          [T_POP, (hud) => hud.show('own', true)],
          [T_POP, () => Sound.tone(700, 0.15, { vol: 0.04, slide: 500 })],
        ]
      },
    }
  }
  function emitElement(P, Lg, r) {
    const A = Lg.aura
    if (Lg.fx === 'snow')
      P.add({
        x: r.range(0, W + 40),
        y: -4,
        vx: -r.range(8, 16),
        vy: r.range(16, 30),
        life: 7,
        size: r.int(1, 3),
        shape: 'flake',
        colors: [A[0], A[1]],
      })
    else if (Lg.fx === 'ember')
      P.add({
        x: r.range(0, W),
        y: H + 2,
        vx: r.range(-6, 6),
        vy: -r.range(18, 36),
        ax: Math.sin(r() * 6) * 4,
        life: r.range(2.5, 4),
        size: 1,
        shape: 'sq',
        colors: [A[0], A[1], A[2], A[3]],
      })
    else if (Lg.fx === 'spark')
      P.add({
        x: r.range(0, W),
        y: r.range(0, H),
        life: r.range(0.1, 0.25),
        size: r.int(1, 2),
        shape: 'plus',
        colors: [A[0], A[1], A[2]],
      })
    else
      P.add({
        x: r.range(0, W),
        y: r.range(H * 0.3, H),
        vy: -r.range(6, 14),
        life: r.range(1.2, 2.2),
        size: r() < 0.75 ? 1 : 2,
        shape: 'star',
        colors: [A[3], A[2], A[1], A[2], A[3]],
      })
  }
  function drawRays(cv, c, t, color, k) {
    const g = cv.g
    g.clearRect(0, 0, W, H)
    if (k <= 0) return
    const img = g.createImageData(W, H)
    const d = img.data
    const [r0, g0, b0] = PX.rgba(color)
    const n = 9
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - c.x,
          dy = y - c.y
        const a = Math.atan2(dy, dx) + t * 0.35
        const wedge = ((((a / (Math.PI * 2)) * n) % 1) + 1) % 1
        if (wedge > 0.42) continue
        const dd = Math.hypot(dx, dy)
        const v = k * clamp(1 - dd / 150) * (0.55 + 0.45 * Math.sin((wedge * Math.PI) / 0.42))
        if (v * 0.85 <= bayer(x, y)) continue
        const i = (y * W + x) * 4
        d[i] = r0
        d[i + 1] = g0
        d[i + 2] = b0
        d[i + 3] = 255
      }
    g.putImageData(img, 0, 0)
  }
  /** A white gleam band sweeping across the silhouette (diagonal, 4 px wide). */
  function gleam(g, s, t, p) {
    const m = size(s.foe)
    const f = frameOf(s.foe, s.clock(t))
    const sil = silhouette(s.foe, f, '#ffffff')
    const tmp = PX.cached('gleamTmp', () => canvas(160, 160))
    tmp.g.clearRect(0, 0, 160, 160)
    tmp.g.drawImage(sil, 0, 0)
    tmp.g.globalCompositeOperation = 'destination-in'
    tmp.g.fillStyle = '#fff'
    const x0 = lerp(-m.h, m.w + 4, p)
    tmp.g.beginPath()
    tmp.g.moveTo(x0, 0)
    tmp.g.lineTo(x0 + 4, 0)
    tmp.g.lineTo(x0 + 4 - m.h * 0.5, m.h)
    tmp.g.lineTo(x0 - m.h * 0.5, m.h)
    tmp.g.fill()
    tmp.g.globalCompositeOperation = 'source-over'
    const rise = Math.round(6 * (1 - ease.outC(span(t, 2.0, 2.8))))
    g.drawImage(tmp, Math.round(s.L.foe.x - m.w / 2), Math.round(s.L.foe.y - m.h + rise))
  }
  /** Diamond shards closing in from the edges; their rims glow in the aura colour. */
  function shatter(g, p, A) {
    const cell = 16
    for (let cy = 0; cy < H + cell; cy += cell)
      for (let cx = 0; cx < W + cell; cx += cell) {
        const ex = Math.abs(cx - W / 2) / (W / 2),
          ey = Math.abs(cy - H / 2) / (H / 2)
        const edge = 1 - Math.min(1, Math.max(ex, ey))
        const q = clamp((p - edge * 0.62) / 0.38)
        if (q <= 0) continue
        const r = Math.round(ease.outQ(q) * cell)
        const col = q < 0.5 ? A[3] : '#05030a'
        for (let dy = -r; dy <= r; dy++) {
          const hw = r - Math.abs(dy)
          rect(g, cx - hw, cy + dy, hw * 2 + 1, 1, col)
        }
      }
  }
  /** The name card: a slanted band sweeping in, the name at 2×, a glint across the letters. */
  function banner(g, t, Lg, pin, pout) {
    const A = Lg.aura
    const x = Math.round(-W * (1 - ease.outExpo(pin)) + W * ease.inC(pout))
    const y0 = 96,
      h = 30
    for (let y = 0; y < h; y++) {
      const slant = Math.round((h - y) * 0.6)
      const col =
        y === 0 || y === h - 1
          ? A[1]
          : y < 3
            ? A[2]
            : bayer(y, y * 3) < y / h
              ? A[3]
              : mix(A[3], '#05030a', 0.35)
      rect(g, x + slant - 10, y0 + y, W + 20, 1, col)
    }
    const name = Lg.name.toUpperCase()
    const tx = x + 18,
      ty = y0 + 8
    text(g, name, tx, ty, '#ffffff', '#05030a', 2)
    // Glint: a diagonal band redrawing the letters in the light colour.
    const gp = span(t, 3.95, 4.3)
    if (gp > 0 && gp < 1) {
      g.save()
      g.beginPath()
      const gx = tx + lerp(-20, textWidth(name, 2) + 20, gp)
      g.moveTo(gx, ty - 2)
      g.lineTo(gx + 6, ty - 2)
      g.lineTo(gx - 2, ty + 16)
      g.lineTo(gx - 8, ty + 16)
      g.clip()
      text(g, name, tx, ty, A[1], null, 2)
      g.restore()
    }
    const lv = `LV${Lg.lv}`
    text(g, lv, x + W - 18 - textWidth(lv), y0 + 7, A[1], '#05030a')
    const tp = Lg.types.map((s) => s.toUpperCase()).join(' ')
    text(g, tp, x + W - 18 - textWidth(tp), y0 + 17, '#ffffff', '#05030a')
  }

  // ---------------------------------------------------------------- Pokémon Center
  function centerAnim() {
    const BALL_KINDS = ['poke', 'poke', 'great', 'ultra', 'poke', 'great']
    const PLACE = (i) => 0.7 + i * 0.2
    const NOTES = [2.1, 2.35, 2.6, 2.85, 3.2, 3.55]
    const LIFT = (i) => 4.7 + i * 0.1
    return {
      id: 'center',
      dur: 6.4,
      hud: () => ({ team: true, msg: 'Welcome to the Pokémon Center!' }),
      beats: [
        [0, 'Welcome', 'Fade in from white; Chansey waits behind the counter.'],
        [
          0.7,
          'Place',
          'Six balls drop into the cradles with a bounce, one every 200 ms; each seat lights up.',
        ],
        [2.1, 'Jingle', 'Six beats: each lights one ball, sends a note up and spikes the heart monitor.'],
        [3.55, 'Healed', 'All six flash together; hearts and crosses rise from the machine.'],
        [3.65, 'Refill', 'HP bars refill one after another; statuses clear; a fainted Pokémon comes back.'],
        [3.9, 'Joy', 'Chansey hops twice.'],
        [4.7, 'Return', 'The balls lift out of the cradles in order.'],
      ],
      setup(env) {
        const s = {
          env,
          r: rng(5),
          fx: new Particles(),
          P: SCN.CENTER[env.style],
          bg: SCN.center(env.style, W, H),
        }
        return s
      },
      step(s, t, dt) {
        s.fx.update(dt)
        const r = s.r
        NOTES.forEach((tn, i) => {
          if (t >= tn && t < tn + STEP * 1.5) {
            const [x, y] = SCN.SLOTS[i]
            s.fx.add({
              x: x + 2,
              y: y - 6,
              vx: r.range(-6, 6),
              vy: -26,
              life: 1.1,
              shape: 'note',
              colors: [s.P.light, s.P.light, '#ffffff'],
            })
          }
        })
        if (t >= NOTES[5] && t < NOTES[5] + STEP * 1.5)
          for (let k = 0; k < 14; k++)
            s.fx.add({
              x: r.range(90, 150),
              y: r.range(80, 96),
              vx: r.range(-12, 12),
              vy: -r.range(20, 45),
              drag: 0.6,
              life: r.range(1.0, 1.6),
              shape: k % 3 ? 'heart' : 'cross',
              colors: k % 3 ? ['#ff7aa0', '#ff9ab8'] : ['#4ad07a'],
            })
        SCN.SLOTS.forEach(([x, y], i) => {
          if (t >= PLACE(i) + 0.22 && t < PLACE(i) + 0.22 + STEP * 1.5)
            s.fx.add({ x, y: y - 3, life: 0.2, size: 3, size1: 1, shape: 'star', colors: ['#ffffff'] })
        })
      },
      draw(g, s, t) {
        const P = s.P
        g.drawImage(s.bg, 0, 0)
        // Heart monitor: a scrolling trace that spikes on each note.
        for (let x = 35; x < 69; x++) {
          const ts = t - (69 - x) * 0.012
          let v = 0
          for (const tn of NOTES) {
            const d = ts - tn
            if (d > 0 && d < 0.08) v = Math.max(v, Math.round(Math.sin((d / 0.08) * Math.PI * 2) * 7))
          }
          const beat = ts > 0.3 ? Math.round(Math.max(0, Math.sin(ts * 7.5) - 0.92) * 30) : 0
          px(g, x, 33 - v - beat, P.light)
        }
        if (t > 3.9) {
          // Done: a heart on the monitor.
          const m = ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..']
          for (let r = 0; r < 5; r++)
            for (let q = 0; q < 5; q++) if (m[r][q] === 'x') px(g, 62 + q, 24 + r, '#ff7aa0')
        }
        // Chansey behind the counter, hopping when it's done.
        const hop = t > 3.9 && t < 4.4 ? -Math.round(Math.abs(Math.sin((t - 3.9) * Math.PI * 4)) * 4) : 0
        sprite(g, 'front-chansey', 194, 106 + hop, t * 1000)
        g.drawImage(s.bg, 0, 100, W, H - 100, 0, 100, W, H - 100)
        if (within(t, NOTES[5], NOTES[5] + 0.7)) {
          // The heal bloom sits behind the balls, so the balls stay crisp on top of it.
          const p = span(t, NOTES[5], NOTES[5] + 0.7)
          g.drawImage(glow(40, '#ffe0ec', 1.5, 0.8 * (1 - p)), 120 - 40, 92 - 40)
        }
        // Light bar on top of the machine.
        const pulse = NOTES.some((tn) => within(t, tn, tn + 0.12)) || within(t, NOTES[5], NOTES[5] + 0.5)
        rect(g, 106, 77, 28, 3, pulse ? '#ffffff' : t > 2 && t < 3.8 ? P.light : P.machine[0])
        // The balls.
        SCN.SLOTS.forEach(([x, y], i) => {
          const t0 = PLACE(i)
          if (t < t0) return
          const lift = span(t, LIFT(i), LIFT(i) + 0.3)
          if (lift >= 1) return
          if (lift > 0.5 && Math.floor(t * 30) % 2) return
          const drop = ease.outBounce(span(t, t0, t0 + 0.25))
          const by = lerp(y - 30, y - 2, drop) - 26 * ease.inQ(lift)
          const lit = t > t0 + 0.22
          if (lit && lift === 0) ellipse(g, x, y + 1, 5, 2, P.light)
          const n = NOTES.findIndex((tn) => within(t, tn, tn + 0.15))
          const flash = n === i || within(t, NOTES[5], NOTES[5] + 0.3)
          const im = SCN.ball(BALL_KINDS[i], 0, {
            R: 5,
            button: flash ? '#ffffff' : lit ? P.light : '#ffffff',
          })
          if (flash) g.drawImage(glow(9, '#ffffff', 1.6, 0.85), x - 9, Math.round(by - 9))
          g.drawImage(im, Math.round(x - im.width / 2), Math.round(by - im.height / 2))
          if (flash && n === i) rect(g, x - 1, Math.round(by) - 1, 2, 2, '#ffffff')
        })
        s.fx.draw(g)
        if (t < 0.5) wash(g, '#ffffff', 1 - span(t, 0, 0.5))
        if (within(t, NOTES[5], NOTES[5] + 2 / 60)) wash(g, '#ffe6f0', 0.5)
      },
      init() {
        const c = [
          [3.65, (hud) => hud.heal()],
          [3.9, say('Your Pokémon are fighting fit!')],
          [5.2, say('We hope to see you again!')],
        ]
        SCN.SLOTS.forEach((_, i) =>
          c.push([PLACE(i) + 0.22, () => Sound.tone(660 + i * 70, 0.06, { vol: 0.03 })]),
        )
        const MEL = [523, 659, 784, 659, 880, 1047]
        NOTES.forEach((tn, i) =>
          c.push([
            tn,
            () => {
              Sound.tone(MEL[i], i === 5 ? 0.6 : 0.2, { type: 'square', vol: 0.05 })
              Sound.tone(MEL[i] / 2, i === 5 ? 0.6 : 0.2, { type: 'triangle', vol: 0.05 })
            },
          ]),
        )
        this.cues = c.sort((a, b) => a[0] - b[0])
      },
    }
  }

  // ---------------------------------------------------------------- the player
  class Player {
    constructor(cv, hud) {
      this.cv = cv
      this.g = cv.getContext('2d')
      this.g.imageSmoothingEnabled = false
      this.hud = hud
      this.speed = 1
      this.playing = false
      this.loop = false
      this.raf = 0
      this.onTick = null
      this.onEnd = null
    }
    load(def, env) {
      this.def = def
      this.env = env
      this.reset()
    }
    reset() {
      this.t = 0
      this.acc = 0
      this.cueI = 0
      this.s = this.def.setup(this.env)
      this.def.init(this.s)
      this.hud.reset(this.def.hud())
      this.render()
    }
    play() {
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
      this.pause()
      if (this.t >= this.def.dur) this.reset()
      this.advance(STEP)
      this.render()
    }
    advance(dt) {
      this.acc += dt
      while (this.acc >= STEP - 1e-9) {
        this.acc -= STEP
        this.t += STEP
        this.def.step(this.s, this.t, STEP)
        const cues = this.def.cues
        while (this.cueI < cues.length && cues[this.cueI][0] <= this.t) cues[this.cueI++][1](this.hud, this.s)
        if (this.t >= this.def.dur) break
      }
    }
    frame(now) {
      if (!this.playing) return
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed
      this.last = now
      this.advance(dt)
      this.render()
      if (this.t >= this.def.dur) {
        this.playing = false
        this.onEnd && this.onEnd()
        if (this.loop)
          setTimeout(() => {
            if (!this.playing && this.loop && this.t >= this.def.dur) this.play()
          }, 900)
        return
      }
      this.raf = requestAnimationFrame((n) => this.frame(n))
    }
    render() {
      this.g.clearRect(0, 0, W, H)
      this.def.draw(this.g, this.s, this.t)
      this.onTick && this.onTick(this.t)
    }
  }

  const MAKE = {
    center: centerAnim,
    catch: catchAnim,
    fire: fireAnim,
    water: waterAnim,
    grass: grassAnim,
    electric: electricAnim,
    psychic: psychicAnim,
    legend: legendAnim,
  }
  window.ANIM = { W, H, MAKE, Player, ATTACKS, LEGENDS, Stage, shakeAt }
})()
