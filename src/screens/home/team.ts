// The team on Home: three friends keeping busy on the area's scenery (from the Visual Lab's home.js). They idle, walk,
// visit each other (they hop in turn, little hearts float up), the singer starts a song the others join (notes rise),
// a tired one (fainted or under half HP) sweats and naps. A tap makes one hop with a heart.
// Logic and canvas drawing only: the sprites themselves are <img>s the browser animates (SceneStage.tsx), so a Pokémon's
// animated GIF costs the one request it already did.
import {
  clamp,
  ease,
  ellipseLine,
  lerp,
  rect,
  rng,
  shade,
  cached,
  type G,
  type Rng,
} from '@/fx/pixel'
import type { World } from './scene'

export interface MonDef {
  uid: string
  dex: number
  types: readonly string[]
  hp: number
  maxHp: number
  /** The sprite's art size, in art pixels. */
  w: number
  h: number
  /**
   * The ones it could make an Egg with (the Day Care's yard, by uid): most of its visits go to them, and their
   * meetings always end in hearts.
   */
  likes?: readonly string[]
}

type State = 'idle' | 'walk' | 'wait' | 'meet' | 'sing' | 'rest'
type Emote = 'z' | 'bang' | 'spark'

const SING = ['fairy', 'normal', 'water', 'psychic']

export class Mon {
  readonly def: MonDef
  readonly r: Rng
  x = 0
  y = 0
  face: 1 | -1
  state: State = 'idle'
  timer: number
  phase = 0
  hopT = -1
  hops: number[] = []
  bubble: { kind: Emote; t0: number } | null = null
  with: Mon | null = null
  noteAt = 0
  target: { x: number; y: number } | null = null
  plan: 'meet' | null = null
  readonly tired: boolean
  readonly water: boolean
  singer = false
  readonly speed: number
  readonly hop: number
  readonly sz: { w: number; h: number }

  constructor(def: MonDef, r: Rng, world: World) {
    this.def = def
    this.r = r
    this.face = r() < 0.5 ? -1 : 1
    this.timer = r.range(0.6, 2.4)
    this.tired = def.maxHp > 0 && def.hp / def.maxHp < 0.5
    this.sz = { w: def.w, h: def.h }
    this.water = def.types.includes('water') && !!world.pond
    // Small ones scurry and hop; big ones lumber; swimmers glide.
    this.speed = this.water ? 9 : clamp(Math.round(30 - def.w * 0.2), 9, 24)
    this.hop = this.water ? 0 : def.w < 50 ? 4 : def.w < 70 ? 2 : 1
  }

  get free() {
    return this.state === 'idle' && !this.with
  }
  get head() {
    return { x: Math.round(this.x), y: Math.round(this.y - this.sz.h * 0.72) }
  }

  spot(world: World, others: Mon[] = []) {
    const { x0, x1, y0, y1 } = world.walk
    for (let i = 0; i < 48; i++) {
      let x: number
      let y: number
      if (this.water && world.pond) {
        const a = this.r() * Math.PI * 2
        const k = Math.sqrt(this.r()) * 0.6
        x = world.pond.x + Math.cos(a) * world.pond.rx * k
        y = world.pond.y + Math.sin(a) * world.pond.ry * k + 4
      } else {
        x = lerp(x0 + this.sz.w * 0.3, x1 - this.sz.w * 0.3, this.r())
        y = lerp(y0, y1, this.r())
      }
      const wet = !this.water && inPond(world, x, y, this.sz.w * 0.55)
      const crowded = others.some((o) => tooClose(this, o, x, y))
      if (!wet && (!crowded || i > 40)) return { x, y }
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
  }

  goTo(x: number, y: number, plan: 'meet' | null = null) {
    this.target = { x, y }
    this.plan = plan
    this.state = 'walk'
  }

  /** A short stroll from where it stands. */
  wander(world: World, mons: Mon[]) {
    const { x0, x1, y0, y1 } = world.walk
    for (let i = 0; i < 12; i++) {
      if (this.water) {
        const p = this.spot(world, mons)
        return this.goTo(p.x, p.y)
      }
      const a = this.r() * Math.PI * 2
      const d = this.r.range(24, 70)
      const x = clamp(this.x + Math.cos(a) * d, x0 + this.sz.w * 0.3, x1 - this.sz.w * 0.3)
      const y = clamp(this.y + Math.sin(a) * d * 0.5, y0, y1)
      const crowded = mons.some((o) => tooClose(this, o, x, y))
      if (!crowded && !inPond(world, x, y, this.sz.w * 0.55) && pathClear(world, this, x, y))
        return this.goTo(x, y)
    }
    this.timer = this.r.range(0.8, 1.6)
  }

  /** Walk over to a friend (or, by the pond, meet a swimmer at the water's edge). */
  visit(friend: Mon, world: World): boolean {
    const p = world.pond
    if ((this.water || friend.water) && p) {
      const sea = this.water ? this : friend
      const land = sea === this ? friend : this
      if (land.water) return false
      // Meet at the side of the pond facing the friend, so the two stand side by side rather than one behind the other.
      const a = Math.atan2(clamp((land.y - p.y) / p.ry, -0.45, 0.45), (land.x - p.x) / p.rx)
      const lx = clamp(
        p.x + Math.cos(a) * (p.rx + land.sz.w * 0.5 + 6),
        world.walk.x0 + land.sz.w * 0.3,
        world.walk.x1 - land.sz.w * 0.3,
      )
      const ly = clamp(p.y + Math.sin(a) * (p.ry + 11), world.walk.y0, world.walk.y1)
      if (inPond(world, lx, ly, land.sz.w * 0.45) || !pathClear(world, land, lx, ly)) return false
      sea.goTo(p.x + Math.cos(a) * p.rx * 0.45, p.y + Math.sin(a) * p.ry * 0.45 + 4, 'meet')
      land.goTo(lx, ly, 'meet')
    } else {
      const gap = (this.sz.w + friend.sz.w) * 0.4 + 2
      const side = this.x < friend.x ? -1 : 1
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
  hopAt(at: number) {
    this.hops.push(at)
  }
  say(kind: Emote, t: number) {
    this.bubble = { kind, t0: t }
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

  /** Inside its body: the tap test. */
  hit(x: number, y: number) {
    const w = this.sz.w * 0.8
    return x > this.x - w / 2 && x < this.x + w / 2 && y > this.y - this.sz.h && y < this.y + 4
  }
}

const inPond = (world: World, x: number, y: number, pad: number) => {
  const p = world.pond
  return !!p && ((x - p.x) / (p.rx + pad)) ** 2 + ((y - p.y) / (p.ry + 12)) ** 2 < 1
}
function pathClear(world: World, m: Mon, x: number, y: number) {
  if (!world.pond || m.water) return true
  const pad = m.sz.w * 0.5
  const n = Math.max(1, Math.ceil(Math.hypot(x - m.x, y - m.y) / 4))
  for (let i = 0; i <= n; i++) if (inPond(world, lerp(m.x, x, i / n), lerp(m.y, y, i / n), pad)) return false
  return true
}
/** Too close to stand there: side by side, or hidden behind a taller friend. */
const tooClose = (m: Mon, o: Mon, x: number, y: number) =>
  o !== m &&
  Math.abs(o.x - x) < (o.sz.w + m.sz.w) * 0.42 &&
  Math.abs(o.y - y) < Math.max(o.sz.h, m.sz.h) * 0.95

// ------------------------------------------------------------------ bubbles and floating hearts and notes
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
const EMOTE: Record<Emote, { c: string; m: string[] }> = {
  z: { c: '#24304f', m: ['xxxx.', '..x..', '.x...', 'xxxx.', '.....'] },
  bang: { c: '#f2553f', m: ['..x..', '..x..', '..x..', '.....', '..x..'] },
  spark: { c: '#e8a800', m: ['...x.', '..x..', '.xxx.', '..x..', '.x...'] },
}
const bubble = (kind: Emote) =>
  cached(`emote|${kind}`, () => {
    const E = EMOTE[kind]
    return shade(11, 9, (x, y) => {
      const ch = BUBBLE[y]![x]
      if (ch === 'x') return '#24304f'
      const inside = y >= 1 && y <= 5 && x >= 1 && x <= 9
      if (!inside && !(y === 6 && x > 0 && x < 10)) return null
      if (y >= 1 && y <= 5 && x >= 3 && x <= 7 && E.m[y - 1]![x - 3] === 'x') return E.c
      return inside ? '#ffffff' : null
    })
  })

// Tiny pixel emoji, outlined in navy so they read on any scenery.
const FLOAT = {
  heart: ['.xx.xx.', 'xhhxxxx', 'xhxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'],
  note: ['..xxx.', '..x.xx', '..x..x', '..x...', '.xx...', 'xxx...', 'xxx...', '.x....'],
}
const NOTE_COLS = ['#3a7be0', '#9b5de5', '#22a866', '#f28c28']
const floatSprite = (kind: keyof typeof FLOAT, col: string) =>
  cached(`float|${kind}|${col}`, () => {
    const m = FLOAT[kind]
    const at = (x: number, y: number) => m[y - 1]?.[x - 1] ?? '.'
    return shade(m[0]!.length + 2, m.length + 2, (x, y) => {
      const ch = at(x, y)
      if (ch === 'h') return '#ffffff'
      if (ch === 'x') return col
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        if (at(x + dx, y + dy) !== '.') return '#24304f'
      return null
    })
  })

interface Float {
  kind: keyof typeof FLOAT
  x: number
  y: number
  t0: number
  life: number
  seed: number
  col: string
}

/** Where to draw a Pokémon this frame: feet at (x, y) art pixels, raised by `lift`. */
export interface Pose {
  x: number
  y: number
  lift: number
  /** Looks right (front sprites look left). */
  flip: boolean
  /** Swimming: the bottom of the sprite is under water, from `y - 7`. */
  swim: boolean
  z: number
}

/** The whole team and everything they do together. */
export class Herd {
  readonly world: World
  readonly mons: Mon[]
  t = 0
  private fx: Float[] = []
  private song: { leader: Mon; t0: number; t1: number } | null = null
  private lastSong = -20
  private songs = 0
  private readonly r: Rng
  /** Stand still: no roaming, no songs (reduced motion). */
  calm: boolean
  /** Nobody sings (the Day Care's yard: it's about the pairs). */
  readonly quiet: boolean

  constructor(world: World, defs: MonDef[], seed: number, calm: boolean, quiet = false) {
    this.world = world
    this.calm = calm
    this.quiet = quiet
    this.r = rng(seed)
    this.mons = defs.map((d, i) => new Mon(d, rng(d.dex * 13 + seed + i), world))
    const singer = [...this.mons].sort((a, b) => singRank(a) - singRank(b))[0]
    if (singer) singer.singer = true
    // The swimmers first: the pond is small, so the others make room around it.
    ;[...this.mons]
      .sort((a, b) => Number(b.water) - Number(a.water))
      .forEach((m) => Object.assign(m, m.spot(world, this.mons)))
  }

  private emit(kind: keyof typeof FLOAT, x: number, y: number, t0: number, col?: string) {
    this.fx.push({
      kind,
      x,
      y,
      t0,
      life: 1.5,
      seed: this.r() * 6.28,
      col: col ?? (kind === 'heart' ? '#ff5a7a' : this.r.pick(NOTE_COLS)),
    })
  }

  /** Two friends side by side: they face each other, hop in turn, and hearts (sometimes a hum) float up between them. */
  private meet(a: Mon, b: Mon) {
    const t = this.t
    a.face = b.x > a.x ? 1 : -1
    b.face = a.face === 1 ? -1 : 1
    a.state = b.state = 'meet'
    a.timer = b.timer = 2
    a.hopAt(t + 0.05)
    b.hopAt(t + 0.3)
    a.hopAt(t + 0.7)
    // A pair that could make an Egg always sends hearts.
    const pair = a.def.likes?.includes(b.def.uid)
    const kind = pair || a.r() < 0.72 ? 'heart' : 'note'
    const x = Math.round((a.x + b.x) / 2)
    const y = Math.min(a.head.y, b.head.y) + 2
    this.emit(kind, x - 3, y, t + 0.1)
    this.emit(kind, x + 4, y + 2, t + 0.55)
    this.emit('heart', x, y - 2, t + 1.0)
  }

  /** One of them starts singing; the others join in, facing the singer, and everyone bobs on the beat. */
  private startSong(leader: Mon) {
    const t = this.t
    this.song = { leader, t0: t, t1: t + 4.4 }
    this.lastSong = t
    this.songs++
    leader.state = 'sing'
    leader.noteAt = t
    for (const o of this.mons)
      if (o !== leader && !o.with && (o.state === 'idle' || o.state === 'walk')) {
        o.state = 'sing'
        o.face = leader.x > o.x ? 1 : -1
        o.noteAt = t + o.r.range(0.5, 1.3)
      }
  }

  private updateSong() {
    if (this.quiet) return
    const t = this.t
    if (!this.songs && !this.song && t > 3.5 && !this.calm && this.mons.length > 1) {
      // The first song comes early: the singer stops what it is doing (unless it is with a friend) and starts.
      const lead = this.mons.find((m) => m.singer && !m.with && (m.state === 'idle' || m.state === 'walk'))
      if (lead) this.startSong(lead)
    }
    if (!this.song || t < this.song.t1) return
    this.song = null
    for (const m of this.mons)
      if (m.state === 'sing') {
        const h = m.head
        this.emit('heart', h.x, h.y, t + m.r.range(0, 0.3))
        m.hopAt(t)
        m.state = 'idle'
        m.timer = m.r.range(1.5, 3.5)
      }
  }

  private decide(m: Mon) {
    const free = this.mons.filter((o) => o !== m && o.free)
    const roll = m.r()
    if (m.tired && roll < 0.3) return m.rest()
    // The singer opens with a song soon after you land; after that, songs come now and then.
    if (
      !this.quiet &&
      !this.song &&
      this.songs &&
      free.length &&
      this.t - this.lastSong > 12 &&
      roll < (m.singer ? 0.3 : 0.06)
    )
      return this.startSong(m)
    // At the Day Care, a Pokémon goes to one it can make an Egg with, more often than not.
    const mates = m.def.likes ? free.filter((o) => m.def.likes!.includes(o.def.uid)) : []
    if (mates.length && roll < 0.75 && m.visit(m.r.pick(mates), this.world)) return
    if (free.length && roll < 0.66 && m.visit(m.r.pick(free), this.world)) return
    if (roll < 0.9) return m.wander(this.world, this.mons)
    m.face = m.face === 1 ? -1 : 1
    m.timer = m.r.range(0.8, 1.8)
  }

  update(dt: number) {
    this.t += dt
    const t = this.t
    for (const m of this.mons) {
      if (m.hopT >= 0 && (m.hopT += dt) > 0.36) m.hopT = -1
      if (m.hops.length && t >= m.hops[0]!) {
        m.hops.shift()
        m.hopT = 0
      }
      if (m.bubble && t - m.bubble.t0 > 1.8) m.bubble = null
      if (this.calm) continue
      m.timer -= dt
      const s = m.state
      if (s === 'idle') {
        if (m.timer <= 0 && !m.with) this.decide(m)
      } else if (s === 'rest') {
        if (!m.bubble && m.r() < dt * 0.7) m.say('z', t)
        if (m.timer <= 0) {
          m.state = 'idle'
          m.timer = m.r.range(1, 2)
        }
      } else if (s === 'wait') {
        // Waiting for a friend on the way: both there, they meet; it took too long, they give up.
        const o = m.with
        if (o && o.state === 'wait' && o.with === m) this.meet(m, o)
        else if (!o || m.timer <= 0) m.part()
      } else if (s === 'meet' || s === 'sing') {
        if (s === 'sing' && this.song && t >= m.noteAt) {
          const h = m.head
          this.emit('note', h.x + m.face * 6, h.y, t)
          m.noteAt = t + (this.song.leader === m ? 0.42 : 0.6)
        }
        if (s === 'sing' ? !this.song : m.timer <= 0) m.part()
      } else if (s === 'walk' && m.target) {
        const dx = m.target.x - m.x
        const dy = m.target.y - m.y
        const d = Math.hypot(dx, dy)
        const sp = m.speed * (m.tired ? 0.55 : 1) * (m.plan === 'meet' ? 1.25 : 1)
        if (Math.abs(dx) > 2) m.face = dx > 0 ? 1 : -1
        m.phase += dt * (sp / 7)
        if (d < 1.5) {
          m.phase = 0
          if (m.plan === 'meet' && m.with) {
            m.state = 'wait'
            m.timer = 4
          } else {
            m.state = 'idle'
            m.timer = m.r.range(1.2, 3.6)
            if (m.def.types.includes('electric') && !m.tired && m.r() < 0.2) m.say('spark', t)
          }
          continue
        }
        m.x += (dx / d) * Math.min(d, sp * dt)
        m.y += (dy / d) * Math.min(d, sp * dt)
      }
    }
    if (!this.calm) this.updateSong()
    this.fx = this.fx.filter((f) => t - f.t0 < f.life)
  }

  pose(m: Mon): Pose {
    let lift = 0
    if (m.state === 'walk' && m.hop) lift = Math.abs(Math.sin(m.phase * Math.PI)) * m.hop
    if (m.state === 'sing' && this.song)
      lift = Math.round(Math.abs(Math.sin((this.t - this.song.t0) * Math.PI * 2.4)) * 2)
    if (m.hopT >= 0) lift += Math.sin((m.hopT / 0.36) * Math.PI) * 8
    return {
      x: Math.round(m.x),
      y: Math.round(m.y) + (m.state === 'rest' ? 1 : 0),
      lift: Math.round(lift),
      flip: m.face > 0,
      swim: m.water,
      z: Math.round(m.y),
    }
  }

  /** Under the sprites: the scene's moving bits (no contact shadows: the Pokémon stand on the picture as drawn). */
  drawBack(g: G) {
    this.world.dyn(g, this.t)
  }

  /** Over the sprites: the water's edge on swimmers, the tall grass, sweat drops, bubbles and floating hearts and notes. */
  drawFront(g: G) {
    const t = this.t
    for (const m of this.mons) {
      const p = this.pose(m)
      if (m.water)
        ellipseLine(g, p.x, p.y - 7, Math.round(m.sz.w * 0.4), 3, this.world.pond?.rim ?? '#d8f1ff')
    }
    g.drawImage(this.world.fg, 0, 0)
    for (const m of this.mons) {
      const p = this.pose(m)
      const top = p.y - p.lift - m.sz.h
      if (m.tired && Math.floor(t * 1.5) % 3 === 0) {
        // A sweat drop: tired, heal soon.
        rect(g, p.x + Math.round(m.sz.w * 0.22), top + 10, 2, 3, '#7cc8f0')
        rect(g, p.x + Math.round(m.sz.w * 0.22), top + 9, 1, 1, '#ffffff')
      }
      if (m.bubble) {
        const k = clamp((t - m.bubble.t0) / 0.18)
        if (k > 0 && !(t - m.bubble.t0 > 1.5 && Math.floor(t * 12) % 2)) {
          g.drawImage(
            bubble(m.bubble.kind),
            p.x + Math.round(m.sz.w * 0.12),
            top - 6 - Math.round(3 * ease.outBack(k)),
          )
        }
      }
    }
    for (const f of this.fx) {
      const k = (t - f.t0) / f.life
      if (k < 0 || (k > 0.72 && Math.floor(t * 12) % 2)) continue
      const im = floatSprite(f.kind, f.col)
      const x = Math.round(f.x + Math.sin(k * 6 + f.seed) * 2 - im.width / 2)
      const y = Math.round(f.y - (this.calm ? 4 : 20) * ease.outQ(k) - im.height)
      g.drawImage(im, x, y)
    }
  }

  /** A tap: it hops, a heart pops out. A napping one wakes up with a start. */
  poke(m: Mon) {
    if (m.state === 'rest') {
      m.state = 'idle'
      m.timer = 1.5
      m.say('bang', this.t)
    }
    m.hopT = 0
    const h = m.head
    this.emit('heart', h.x + 3, h.y - 6, this.t)
  }

  hitTest(x: number, y: number): Mon | null {
    return [...this.mons].sort((a, b) => b.y - a.y).find((m) => m.hit(x, y)) ?? null
  }
}

/** Who leads the songs: a fairy, a normal type, a swimmer or a psychic one, in that order; the lead otherwise. */
const singRank = (m: Mon) => {
  const i = SING.findIndex((t) => m.def.types.includes(t))
  return i < 0 ? SING.length : i
}
