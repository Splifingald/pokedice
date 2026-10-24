// The attack timelines: Flamethrower, Hydro Pump, Razor Leaf, Thunderbolt and Psychic here (every other type's move
// is in attacks-types.ts), a generic impact in the type's colour for typeless dice, and the one-hit short version
// (Settings → Animations: short). Every one plays either way: the stage speaks of attacker and target, so the foe's
// move flies right to left. Each has its Z-Move (`z`, docs/35): the same move, more powerful — more of it, bigger,
// harder — on the stage's Z look (timeline.ts) and under the Z's own mark (zmove.ts). The game-feel pass (docs/38)
// adds how hard each hit lands (`power`), the K.O.'s boss stop and the `settle` that lets the battle move on (`felt`).
import { fxSound } from '@/audio/sfx'
import type { DieType, StatusKind } from '@/engine/types'
import { STATUS_COLORS } from '@/theme/colors'
import { typeColor } from '@/theme/util'
import {
  bayer,
  canvas,
  cached,
  ease,
  ellipseLine,
  glow,
  lerp,
  mix,
  Particles,
  polyline,
  px,
  rect,
  ring,
  rng,
  shade,
  softEllipse,
  span,
  wash,
  bolt,
  type Canvas,
  type G,
} from '../pixel'
import type { Point } from '../scenes'
import {
  dist,
  H,
  pop,
  quad,
  screenFlash,
  screenShake,
  Stage,
  W,
  within,
  withoutFlashes,
  type Cue,
  type Fighters,
  type Timeline,
} from '../timeline'
import { moreTyped } from './attacks-types'

const FIRE = ['#ffffff', '#fff6b8', '#ffe066', '#ffb23a', '#ff7a1e', '#e8481c', '#b02a1a', '#5a3030']
const WATER = ['#ffffff', '#c8efff', '#8fd3ff', '#4aa8ff', '#1d5fc8']
const ELEC = ['#ffffff', '#fff6a8', '#ffe14d', '#f0b81c']
const PSY = ['#ffffff', '#ffc2f0', '#ff7ad9', '#c04ae0', '#7a2fb0']

export interface AttackParams extends Fighters {
  /** The move's type: its die type. */
  type: DieType
  /** Shown as the damage number when the hit lands. */
  damage?: number | null
  /** A status the hit causes (its threshold was met). */
  status?: StatusKind | null
  /** Short motion: one hit, no typed move. */
  short?: boolean
  /**
   * The game-feel pass (docs/38 F1a): a `settle` cue half a second after the last hit lets the battle move on, and from
   * then the canvas draws only the particles still flying, over the page's own sprites, until the scene ends.
   */
  trim?: boolean
}

/** A Z-Move's take on a number: `n` as drawn, `zn` when the move is a Z-Move's. */
export const zv = (p: AttackParams, n: number, zn: number) => (p.z ? zn : n)

/** The cues every attack shares: the hit landing, then the status. */
export function attackCues<S>(tHit: number, tStatus: number | null, extra: Cue<S>[]): Cue<S>[] {
  const c: Cue<S>[] = [[tHit, (hud) => hud.contact?.()], ...extra]
  if (tStatus != null)
    c.push([tStatus, (hud, s) => hud.status?.((s as unknown as Stage).by === 'own' ? 'foe' : 'own')])
  return c.sort((a, b) => a[0] - b[0])
}

/** The damage number's colours with the game-feel pass: as the page's own numbers say a hit (BattleStage). */
const POP_SUPER = '#ffd23a'
const POP_PLAIN = '#ffffff'
const POP_RESISTED = '#9c9caf'

/**
 * Damage number over the target's head. With a hit's power (docs/38 F3b, F3c) it is twice the size with an ink
 * outline, gold when super effective; a resisted hit's stays small and grey.
 */
export function damagePop(g: G, s: Stage, p: AttackParams, x: number, t: number, t0: number) {
  if (p.damage == null) return
  const y = s.tgt.at.y - s.tgt.size.h - 2
  const w = p.power
  if (!w) return pop(g, `-${p.damage}`, x, y, t, t0, POP_SUPER)
  pop(
    g,
    `-${p.damage}`,
    x,
    y,
    t,
    t0,
    w.super ? POP_SUPER : w.resisted ? POP_RESISTED : POP_PLAIN,
    w.resisted ? 1 : 2,
  )
}

/** The status pops over the target as a flickering tint in its colour. */
export const statusTint = (p: AttackParams, t: number, t0: number) =>
  p.status && t > t0 && t < t0 + 0.8 && Math.floor(t * 12) % 2 === 0
    ? { color: STATUS_COLORS[p.status], a: 0.35 }
    : null

// ---------------------------------------------------------------- Fire: Flamethrower
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

function burnIcon(): Canvas {
  return cached('icon|burn', () => {
    const pal: Record<string, string> = { k: '#1a1423', o: '#ff7a1e', y: '#ffe066', Y: '#fff6b8' }
    return shade(8, 8, (x, y) => {
      const ch = ICON_BURN[y]![x]!
      return ch === '.' ? null : pal[ch]
    })
  })
}

function fireAnim(p: AttackParams): Timeline<Stage & { M: Point; T: Point; tHit: number; smoke: Particles }> {
  const T_STATUS = 2.8
  return {
    id: 'fire',
    dur: 4.2,
    setup() {
      const st = new Stage(p, 11)
      const M = st.atkAt(0.82, 0.3)
      const T = st.tgtAt(0.45, 0.5)
      const tHit = 0.95 + dist(M, T) / 215
      st.hit(tHit, { stop: 0.08, shake: 2, dur: 1.1, tint: '#ff7a1e', screen: 1 })
      // The Z: the fire stands up off the target as a pillar once the stream has gone through.
      if (p.z) st.hit(2.1, { stop: 0.06, shake: 3, dur: 0.8, tint: '#ffb23a', screen: 2 })
      return Object.assign(st, { M, T, tHit, smoke: new Particles() })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      s.smoke.update(dt)
      const r = s.r
      if (within(t, 0.5, 0.95))
        for (let i = 0; i < 2; i++) {
          const a = r() * Math.PI * 2
          const d = r.range(12, 20)
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
        const wide = zv(p, 0.11, 0.2)
        for (let i = 0; i < zv(p, 6, 11); i++) {
          const a = base + r.range(-wide, wide) + Math.sin(t * 25) * 0.04
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
            size: r.int(1, zv(p, 2, 3)),
            size1: zv(p, r.int(4, 6), r.int(7, 10)),
            shape: 'disc',
            colors: FIRE,
          })
        }
      }
      if (within(t, s.tHit, 2.15))
        for (let i = 0; i < zv(p, 2, 4); i++) {
          const a = -Math.PI / 2 + r.range(-1.2, 1.4)
          s.fx.add({
            x: s.T.x + r.range(-6, 6),
            y: s.T.y + r.range(-6, 6),
            vx: Math.cos(a) * r.range(30, 70) + 20 * s.dir,
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
        const fs = s.tgt.size
        const at = s.tgt.at
        const fade = 1 - span(t, 2.7, 3.1)
        // The Z's pillar: more columns, packed closer, rising higher and fatter.
        const cols = zv(p, 7, 11)
        for (let k = 0; k < cols; k++) {
          if (r() > 0.7 * fade) continue
          const x = at.x + (k - (cols - 1) / 2) * fs.w * zv(p, 0.13, 0.085) + r.range(-3, 3)
          s.fx.add({
            x,
            y: at.y - 2 - r.range(0, fs.h * 0.25),
            vx: r.range(-8, 8),
            vy: -zv(p, r.range(60, 110), r.range(110, 190)),
            life: r.range(0.3, 0.55),
            size: zv(p, r.int(3, 4), r.int(4, 6)),
            size1: 0,
            shape: 'disc',
            colors: FIRE.slice(1, 7),
          })
        }
        if (Math.floor(t * 60) % 4 === 0)
          s.smoke.add({
            x: at.x + r.range(-10, 10),
            y: at.y - fs.h * 0.8,
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
      softEllipse(g, s.tgt.at.x, s.tgt.at.y, 18, 4, '#00000055', 0.35)
      const pull = within(t, 0.5, 2.05)
        ? -2 * ease.outQ(span(t, 0.5, 0.95)) + (t > 0.95 && Math.floor(t * 30) % 2 ? 1 : 0)
        : 0
      s.drawBoth(
        g,
        t,
        p.status && t > 2.6 ? { tint: { color: '#ff6a1e', a: Math.sin(t * 9) > 0.6 ? 0.25 : 0 } } : {},
        { dx: pull, dy: -pull * 0.5 },
      )
      s.smoke.draw(g)
      if (within(t, 0.5, 2.05)) {
        const k = t < 0.95 ? ease.outQ(span(t, 0.5, 0.95)) : 1 - span(t, 1.9, 2.05)
        const R = Math.round(2 + zv(p, 7, 12) * k)
        g.drawImage(glow(R, '#ff9a3c', 1.2), Math.round(s.M.x - R), Math.round(s.M.y - R))
        const r2 = Math.max(1, Math.round(R / 2))
        g.drawImage(glow(r2, '#fff3b0', 1), Math.round(s.M.x - r2), Math.round(s.M.y - r2))
      }
      s.fx.draw(g)
      if (p.status === 'burn' && t > 2.65 && t < 3.6) {
        // The burn mark pops over the target.
        const q = span(t, 2.65, 2.9)
        g.drawImage(
          burnIcon(),
          Math.round(s.tgt.at.x - 4),
          Math.round(s.tgt.at.y - s.tgt.size.h - 6 - 6 * ease.outBack(q)),
        )
      }
      damagePop(g, s, p, s.T.x, t, s.tHit + 0.04)
      s.end(g)
      if (within(t, s.tHit, s.tHit + 2 / 60)) screenFlash(g, '#fff1c4', 0.45)
    },
    cues: (s) =>
      attackCues(s.tHit, p.status ? T_STATUS : null, [
        [0.5, () => fxSound('fire.inhale')],
        [0.95, () => fxSound('fire.stream')],
        [s.tHit, () => fxSound('fire.hit')],
      ]),
  }
}

// ---------------------------------------------------------------- Water: Hydro Pump
/**
 * A high-pressure jet between two points: four blues and a white core, its width rippling along its length (`wide`
 * times as thick for a Z-Move).
 */
function jet(g: G, a: Point, b: Point, from: number, to: number, t: number, wide = 1) {
  const len = dist(a, b)
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  const s0 = Math.floor(from * len)
  const s1 = Math.ceil(to * len)
  for (let s = s0; s <= s1; s++) {
    const w = (2.4 + Math.sin(s * 0.35 - t * 45) * 0.9 + (s / len) * 1.2) * wide
    const cx = a.x + Math.cos(ang) * s
    const cy = a.y + Math.sin(ang) * s
    for (let o = -Math.ceil(w); o <= Math.ceil(w); o++) {
      const q = Math.abs(o) / w
      if (q > 1.05) continue
      const col = q < 0.22 ? '#ffffff' : q < 0.5 ? '#bfeaff' : q < 0.8 ? '#4aa8ff' : '#1d5fc8'
      px(g, Math.round(cx + nx * o), Math.round(cy + ny * o), col)
    }
  }
}

function waterAnim(p: AttackParams): Timeline<Stage & { C: Point[]; T: Point }> {
  const T_ON = 0.95
  const T_OFF = 1.95
  const HEAD = 0.12
  const T_GEYSER = T_OFF + 0.05
  return {
    id: 'water',
    dur: 4.0,
    setup() {
      const st = new Stage(p, 23)
      // One jet from the mouth; a Pokémon built for it (Blastoise) fires from both shoulders.
      const C = BLASTOISE.has(st.atk.key.replace(/\D+$/, ''))
        ? [st.atkAt(0.2, 0.12), st.atkAt(0.78, 0.1)]
        : [st.atkAt(0.78, 0.3)]
      const T = st.tgtAt(0.4, 0.48)
      st.hit(T_ON + HEAD, { stop: 0.08, shake: 2, dur: 0.95, tint: '#4aa8ff', screen: 2 })
      // The Z: the water goes on up under the target, a geyser that throws it.
      if (p.z) st.hit(T_GEYSER, { stop: 0.06, shake: 3, dur: 0.7, tint: '#8fd3ff', screen: 2 })
      return Object.assign(st, { C, T })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const r = s.r
      if (within(t, 0.5, 0.95))
        for (const C of s.C) {
          const a = r() * Math.PI * 2
          const d = r.range(8, 14)
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
            s.fx.add({
              x: lerp(C.x, s.T.x, k),
              y: lerp(C.y, s.T.y, k),
              vx: r.range(-30, 30),
              vy: -r.range(20, 70),
              ay: 260,
              life: 0.32,
              size: 1,
              shape: 'drop',
              colors: WATER.slice(0, 4),
            })
          }
      if (p.z && within(t, T_GEYSER, T_GEYSER + 0.6))
        for (let i = 0; i < 4; i++)
          s.fx.add({
            x: s.tgt.at.x + r.range(-s.tgt.size.w * 0.3, s.tgt.size.w * 0.3),
            y: s.tgt.at.y,
            vx: r.range(-25, 25),
            vy: -r.range(150, 240),
            ay: 330,
            life: r.range(0.45, 0.7),
            size: r.int(1, 3),
            shape: r() < 0.5 ? 'drop' : 'sq',
            colors: WATER,
          })
      if (within(t, T_ON + HEAD, T_OFF + 0.05))
        for (let i = 0; i < zv(p, 3, 6); i++)
          s.fx.add({
            x: s.T.x + r.range(-4, 4),
            y: s.T.y + r.range(-6, 6),
            vx: r.range(10, 90) * s.dir,
            vy: -r.range(40, 150),
            ay: 330,
            life: r.range(0.35, 0.6),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'drop' : 'sq',
            colors: WATER,
          })
      if (within(t, 2.0, 3.4) && Math.floor(t * 60) % 4 === 0) {
        const fs = s.tgt.size
        const at = s.tgt.at
        s.fx.add({
          x: at.x + r.range(-fs.w * 0.35, fs.w * 0.35),
          y: at.y - r.range(4, fs.h * 0.8),
          vx: r.range(-4, 4),
          vy: -r.range(14, 28),
          life: r.range(0.7, 1.1),
          size: r.int(1, 3),
          shape: 'bubble',
          colors: ['#d8f4ff', '#a8e4ff'],
        })
        s.fx.add({
          x: at.x + r.range(-fs.w * 0.3, fs.w * 0.3),
          y: at.y - r.range(2, 10),
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
      for (let k = 0; k < zv(p, 4, 7); k++) {
        const q = span(t, T_ON + HEAD + k * 0.22, T_ON + HEAD + k * 0.22 + 0.6)
        if (q > 0 && q < 1 && t < T_OFF + zv(p, 0.6, 1.4))
          ellipseLine(
            g,
            s.tgt.at.x,
            s.tgt.at.y,
            Math.round(10 + zv(p, 34, 52) * q),
            Math.round(3 + zv(p, 8, 12) * q),
            q < 0.6 ? '#e8f8ff' : '#a8e4ff',
          )
      }
      const push = within(t, T_ON + HEAD, T_OFF + 0.3)
        ? Math.round(
            3 * ease.outQ(span(t, T_ON + HEAD, T_ON + HEAD + 0.2)) * (1 - span(t, T_OFF, T_OFF + 0.3)),
          )
        : 0
      const recoil = within(t, 0.85, T_OFF) ? -2 + (Math.floor(t * 30) % 2) : 0
      s.drawBoth(
        g,
        t,
        {
          dx: push,
          tint:
            statusTint(p, t, 2.0) ??
            (t > 2.0 && t < 3.0 && Math.floor(t * 8) % 2 ? { color: '#4aa8ff', a: 0.2 } : null),
        },
        { dx: recoil, dy: -recoil * 0.5 },
      )
      if (within(t, 0.5, T_OFF)) {
        const k = t < T_ON ? ease.outQ(span(t, 0.5, T_ON)) : 0.8
        const R = Math.round(2 + zv(p, 4, 7) * k)
        for (const C of s.C) g.drawImage(glow(R, '#8fd3ff', 1.1), Math.round(C.x - R), Math.round(C.y - R))
      }
      if (within(t, T_ON, T_OFF + 0.15)) {
        const head = ease.outQ(span(t, T_ON, T_ON + HEAD))
        const tail = ease.inQ(span(t, T_OFF, T_OFF + 0.15))
        s.C.forEach((C, i) =>
          jet(
            g,
            C,
            { x: s.T.x + (i ? 3 : -3), y: s.T.y + (i ? 2 : -3) },
            tail,
            head,
            t + i * 0.37,
            zv(p, 1, 1.9),
          ),
        )
      }
      // The Z's geyser: a column of water up through the target, thinning as it falls back.
      const gq = p.z ? span(t, T_GEYSER, T_GEYSER + 0.75) : 0
      if (gq > 0 && gq < 1) {
        const top = Math.round(s.tgt.at.y - (s.tgt.size.h + 30) * ease.outQ(Math.min(1, gq * 3)))
        const half = Math.round(s.tgt.size.w * 0.32 * (1 - ease.inQ(gq)))
        for (let x = -half; x <= half; x++)
          for (let y = top; y <= s.tgt.at.y; y++) {
            const k = Math.abs(x) / Math.max(1, half)
            const X = Math.round(s.tgt.at.x + x + Math.sin(y * 0.3 + t * 30) * 1.2)
            if (gq > 0.5 && (gq - 0.5) * 2 > bayer(X, y)) continue
            px(g, X, y, k < 0.25 ? '#ffffff' : k < 0.6 ? '#bfeaff' : k < 0.85 ? '#4aa8ff' : '#1d5fc8')
          }
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x + 6 * s.dir, t, T_ON + HEAD + 0.04)
      s.end(g)
    },
    cues: () =>
      attackCues(T_ON + HEAD, p.status ? 2.0 : null, [
        [0.5, () => fxSound('water.charge')],
        [T_ON, () => fxSound('water.jet')],
        ...(p.z ? [[T_GEYSER, () => fxSound('water.jet')] as const] : []),
      ]),
  }
}
/** Species whose Hydro Pump comes from two shoulder cannons (Blastoise and its Mega). */
const BLASTOISE = new Set(['9', '10036', '10197'])

// ---------------------------------------------------------------- Grass: Razor Leaf
/** A leaf as a pixel shader at any angle: tapered lens, dark outline, lit upper half, a midrib. */
function leafSprite(a: number): Canvas {
  const stepN = Math.round((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 8)) % 16
  return cached(`leaf|${stepN}`, () => {
    const ang = (stepN * Math.PI) / 8
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    return shade(13, 13, (x, y) => {
      const dx = x - 6
      const dy = y - 6
      const u = dx * ca + dy * sa
      const v = -dx * sa + dy * ca
      const half = (k: number) =>
        2.3 * Math.sqrt(Math.max(0, 1 - Math.pow(k / 5, 2))) * (k > 0 ? 1 - k / 9 : 1)
      const hw = half(u)
      if (Math.abs(v) > hw + 0.35 || Math.abs(u) > 5.2) return null
      if (Math.abs(v) > hw - 0.65 || Math.abs(u) > 4.6) return '#24552a'
      if (Math.abs(v) < 0.45 && u > -3.5) return '#3f8f3a'
      return v < 0 ? '#c8f58a' : '#5ec04a'
    })
  })
}

/** A crescent slash across a point: drawn in over `p`, dithered out over `q`, `k` times as wide. */
function slash(g: G, c: Point, p: number, q: number, dir: number, k0 = 1) {
  const a0 = -2.7
  const a1 = 0.5
  const aEnd = lerp(a0, a1, ease.outC(p))
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    const a = lerp(a0, a1, i / steps)
    if (a > aEnd) break
    const k = Math.sin((i / steps) * Math.PI)
    const x = Math.round(c.x + Math.cos(a) * 22 * k0 * dir)
    const y = Math.round(c.y + Math.sin(a) * 15 * k0)
    if (1 - q < bayer(x, y)) continue
    rect(g, x, y, 1, 1, '#ffffff')
    if (k > 0.35) rect(g, x, y + 1, 1, 1, '#d8ffb0')
    if (k > 0.7) rect(g, x, y + 2, 1, 1, '#8be06a')
  }
}

interface Leaf {
  up: Point
  spin: number
  target: Point
  bob: number
  hit: boolean
}

function grassAnim(p: AttackParams): Timeline<Stage & { F: Point; T: Point; leaves: Leaf[] }> {
  // The Z: a storm of leaves, and two crescents.
  const N = zv(p, 12, 22)
  const LAUNCH = 1.0
  const GAP = zv(p, 0.05, 0.032)
  const FLIGHT = 0.3
  const arrive = (i: number) => LAUNCH + i * GAP + FLIGHT
  const SLASH = arrive(N - 1) + 0.08
  const leafPos = (s: { F: Point; leaves: Leaf[] }, i: number, t: number) => {
    const L = s.leaves[i]!
    if (t < 0.55) return null
    if (t < LAUNCH + i * GAP) {
      const q = ease.outC(span(t, 0.55, 0.9))
      const hov = Math.sin(t * 5 + L.bob) * 1.5
      return { x: lerp(s.F.x, L.up.x, q), y: lerp(s.F.y, L.up.y, q) + hov, angle: t * L.spin }
    }
    const q = span(t, LAUNCH + i * GAP, arrive(i))
    if (q >= 1) return null
    const c = { x: (L.up.x + L.target.x) / 2, y: Math.min(L.up.y, L.target.y) - 28 - i * 2 }
    const pt = quad(L.up, c, L.target, ease.inQ(q))
    return { ...pt, angle: Math.atan2(L.target.y - L.up.y, L.target.x - L.up.x) }
  }
  return {
    id: 'grass',
    dur: 3.9,
    setup() {
      const st = new Stage(p, 37)
      const F = st.atkAt(0.5, 0.14)
      const T = st.tgtAt(0.5, 0.5)
      const r = st.r
      const leaves = Array.from({ length: N }, (_, i): Leaf => {
        const a = -Math.PI / 2 + (i / (N - 1) - 0.5) * zv(p, 2.2, 2.8)
        const d = r.range(18, zv(p, 30, 40))
        return {
          up: { x: F.x + Math.cos(a) * d * 1.3, y: F.y + Math.sin(a) * d - 8 },
          spin: r.range(10, 18) * (r() < 0.5 ? -1 : 1),
          target: { x: T.x + r.range(-10, 10), y: T.y + r.range(-10, 10) },
          bob: r() * 6,
          hit: false,
        }
      })
      for (let i = 0; i < N; i++)
        st.hit(arrive(i), { stop: i === 0 ? 0.04 : 0, shake: 1, dur: 0.12, tint: '#68c94a', flash: false })
      st.hit(SLASH, { stop: 0.09, shake: 3, dur: 0.6, tint: '#68c94a', screen: 2 })
      return Object.assign(st, { F, T, leaves })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const at = s.passed(t)
      const r = s.r
      for (let i = 0; i < N; i++) {
        const L = s.leaves[i]!
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
      if (at(SLASH))
        for (let k = 0; k < zv(p, 9, 18); k++)
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
      const rustle = within(t, 0.45, 0.62) ? (Math.floor(t * 40) % 2 ? 1 : -1) : 0
      s.drawBoth(g, t, { tint: statusTint(p, t, SLASH + 0.4) }, { dx: rustle })
      if (within(t, 0.4, 1.0)) {
        const R = Math.round(2 + 5 * ease.outQ(span(t, 0.4, 0.6)) * (1 - span(t, 0.85, 1.0)))
        g.drawImage(glow(R, '#b8f07a', 1.2), Math.round(s.F.x - R), Math.round(s.F.y - R))
      }
      for (let i = 0; i < N; i++) {
        // Two-step trail: where the leaf was 2 and 4 frames ago.
        for (const [lag, col] of [
          [0.05, '#e8ffc8'],
          [0.025, '#a8ec7a'],
        ] as const) {
          const q = leafPos(s, i, t - lag)
          if (q && t >= LAUNCH + i * GAP) rect(g, Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2, col)
        }
        const q = leafPos(s, i, t)
        if (q) g.drawImage(leafSprite(q.angle), Math.round(q.x) - 6, Math.round(q.y) - 6)
      }
      if (within(t, SLASH, SLASH + 0.42))
        slash(g, s.T, span(t, SLASH, SLASH + 0.13), span(t, SLASH + 0.13, SLASH + 0.42), s.dir, zv(p, 1, 1.6))
      if (p.z && within(t, SLASH + 0.06, SLASH + 0.48))
        slash(g, s.T, span(t, SLASH + 0.06, SLASH + 0.19), span(t, SLASH + 0.19, SLASH + 0.48), -s.dir, 1.1)
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, SLASH + 0.04)
      s.end(g)
      if (within(t, SLASH, SLASH + 2 / 60)) screenFlash(g, '#f0ffd8', 0.4)
    },
    cues: () => {
      const c: Cue<Stage & { F: Point; T: Point; leaves: Leaf[] }>[] = []
      for (let i = 0; i < N; i++) c.push([arrive(i), () => fxSound('leaf.chip', i)])
      c.push([SLASH, () => fxSound('leaf.slash')])
      return attackCues(SLASH, p.status ? SLASH + 0.4 : null, c)
    },
  }
}

// ---------------------------------------------------------------- Electric: Thunderbolt
function electricAnim(p: AttackParams): Timeline<Stage & { P: Point; T: Point }> {
  // The Z: five bolts, faster, the last one a pillar of lightning.
  const STRIKES = p.z ? ([1.1, 1.3, 1.48, 1.64, 1.9] as const) : ([1.1, 1.38, 1.62] as const)
  const LAST = STRIKES.length - 1
  return {
    id: 'electric',
    dur: 4.2,
    setup() {
      const st = new Stage(p, 51)
      const P = st.atkAt(0.5, 0.3)
      const T = st.tgtAt(0.5, 0.42)
      STRIKES.forEach((t0, i) =>
        st.hit(t0, { stop: 0.05, shake: 3, dur: i === LAST ? 0.7 : 0.25, tint: '#ffe14d', screen: 2 }),
      )
      return Object.assign(st, { P, T })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const at = s.passed(t)
      const r = s.r
      for (const t0 of STRIKES)
        if (at(t0))
          for (let k = 0; k < zv(p, 12, 20); k++) {
            const a = r() * Math.PI * 2
            const sp = r.range(40, 120)
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
      const end = STRIKES[LAST]!
      const dim = 0.55 * ease.outQ(span(t, 0.4, 0.9)) * (1 - span(t, end + 0.25, end + 0.8))
      const d = strikeNow ? dim * 0.35 : dim
      s.begin(g, t)
      wash(g, '#0a0c24', d)
      const para =
        p.status === 'paralyze' && t > 1.8 && t < 3.6
          ? { color: '#ffe14d', a: 0.15 + 0.2 * (Math.sin(t * 14) > 0 ? 1 : 0) }
          : null
      const hop = -Math.round(5 * Math.sin(Math.PI * span(t, 0.95, 1.15)))
      const charging = within(t, 0.4, 1.05)
      s.drawBoth(
        g,
        t,
        { tint: para || statusTint(p, t, 1.8) || (d > 0.05 ? { color: '#0a0c24', a: d * 0.55 } : null) },
        {
          dy: hop,
          tint:
            charging && Math.floor(t * 15) % 2
              ? { color: '#ffe14d', a: 0.45 }
              : d > 0.05
                ? { color: '#0a0c24', a: d * 0.45 }
                : null,
        },
      )
      s.end(g)
      const sh = screenShake(t, s.screenShakes)
      g.save()
      g.translate(sh.x, sh.y)
      if (charging && Math.floor(t * 20) % 2 === 0) {
        const rr = rng(Math.floor(t * 20))
        for (let k = 0; k < zv(p, 2, 4); k++) {
          const a = rr() * Math.PI * 2
          const p0 = { x: s.P.x + Math.cos(a) * 10, y: s.P.y + Math.sin(a) * 9 }
          polyline(g, bolt(rr, p0.x, p0.y, p0.x + Math.cos(a) * 9, p0.y + Math.sin(a) * 8, 0.5, 3), '#ffe14d')
        }
      }
      STRIKES.forEach((t0, i) => {
        const pillar = p.z && i === LAST
        if (!within(t, t0 - 0.02, t0 + (pillar ? 0.3 : 0.12))) return
        const rr = rng(97 + i * 13 + Math.floor(t * 30))
        const sx = s.T.x + (pillar ? 0 : (i - (STRIKES.length - 1) / 2) * 9)
        const pts = bolt(rr, sx, -6, s.T.x, s.T.y, 0.28, 5)
        // A Z-Move's bolts are twice as thick; its last a pillar, with two more round it.
        const w = pillar ? 4 : p.z ? 2 : 1
        polyline(g, pts, '#7a5a10', 4 + w)
        polyline(g, pts, '#ffe14d', 2 + w)
        polyline(g, pts, '#ffffff', w)
        if (pillar)
          for (const o of [-14, 14])
            polyline(g, bolt(rr, s.T.x + o, -6, s.T.x + o * 0.4, s.T.y, 0.35, 4), '#ffe14d', 2)
        const m = pts[Math.floor(pts.length * 0.45)]!
        polyline(
          g,
          bolt(rr, m[0], m[1], m[0] + rr.range(-30, 30), m[1] + rr.range(10, 30), 0.4, 3),
          '#ffe14d',
          1,
        )
        const R = pillar ? 26 : 14
        g.drawImage(glow(R, '#fff6a8', 1.3, 0.9), Math.round(s.T.x - R), Math.round(s.T.y - R))
      })
      if (p.status === 'paralyze' && t > 1.8 && t < 3.6 && Math.floor(t * 60) % 5 === 0) {
        const rr = rng(Math.floor(t * 60))
        const fs = s.tgt.size
        const x0 = s.tgt.at.x + rr.range(-fs.w * 0.35, fs.w * 0.35)
        const y0 = s.tgt.at.y - rr.range(6, fs.h * 0.85)
        polyline(g, bolt(rr, x0, y0, x0 + rr.range(-8, 8), y0 + rr.range(-8, 8), 0.6, 2), '#fff6a8')
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, STRIKES[0] + 0.04)
      g.restore()
      if (within(t, STRIKES[0], STRIKES[0] + 2 / 60)) screenFlash(g, '#ffffff', 0.35)
    },
    cues: () =>
      attackCues(STRIKES[0], p.status ? 2.7 : null, [
        [0.4, () => fxSound('thunder.charge')],
        ...STRIKES.map((t0) => [t0, () => fxSound('thunder.strike')] as const),
      ]),
  }
}

// ---------------------------------------------------------------- Psychic: Psychic
function psychicAnim(p: AttackParams): Timeline<Stage & { S: Point[]; O: Point; T: Point; layer: Canvas }> {
  const LIFT = 1.0
  const SLAM = 2.12
  const SLAM2 = SLAM + 0.5
  const LAND = p.z ? SLAM2 : SLAM
  return {
    id: 'psychic',
    dur: 4.4,
    setup() {
      const st = new Stage(p, 63)
      const S = [st.atkAt(0.1, 0.4), st.atkAt(0.9, 0.38)]
      const O = st.atkAt(0.5, 0.45)
      const T = st.tgtAt(0.5, 0.5)
      st.hit(SLAM, { stop: 0.09, shake: 3, dur: 0.6, tint: '#ff7ad9', screen: 3 })
      // The Z: lifted higher, slammed twice.
      if (p.z) st.hit(SLAM2, { stop: 0.08, shake: 3, dur: 0.6, tint: '#ff7ad9', screen: 3 })
      return Object.assign(st, { S, O, T, layer: canvas(W, H) })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const at = s.passed(t)
      const r = s.r
      const n = zv(p, 16, 24)
      for (const t0 of p.z ? [SLAM, SLAM2] : [SLAM])
        if (at(t0))
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2
            s.fx.add({
              x: s.T.x,
              y: s.T.y,
              vx: Math.cos(a) * zv(p, 90, 130),
              vy: Math.sin(a) * zv(p, 60, 85),
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
      // A Z-Move's lifts it higher, and after the first slam heaves it up once more.
      const hi = zv(p, 6, 14)
      const lift =
        t < SLAM
          ? -hi * ease.ioS(span(t, LIFT, LIFT + 0.4)) + (t > LIFT + 0.4 ? Math.round(Math.sin(t * 9)) : 0)
          : p.z && t < SLAM2
            ? -hi * Math.sin(Math.PI * span(t, SLAM + 0.1, SLAM2))
            : 2 * (1 - span(t, LAND + 0.1, LAND + 0.4))
      const lifting = within(t, LIFT, LAND)
      s.drawBoth(
        g,
        t,
        {
          dy: Math.round(lift),
          outline: lifting && Math.floor(t * 15) % 2 ? '#ff7ad9' : undefined,
          ghost: lifting
            ? [
                { dx: -2, color: '#ff4fa8', a: 0.5 },
                { dx: 2, color: '#4fe0ff', a: 0.5 },
              ]
            : undefined,
          tint: statusTint(p, t, SLAM + 0.5),
        },
        { tint: within(t, 0.4, 1.0) && Math.floor(t * 12) % 2 ? { color: '#ff7ad9', a: 0.3 } : null },
      )
      for (const S of s.S)
        if (within(t, 0.4, 2.1)) {
          const R = 2 + (Math.floor(t * 8) % 2)
          g.drawImage(glow(R + 2, '#ff7ad9', 1.2), Math.round(S.x - R - 2), Math.round(S.y - R - 2))
        }
      for (let k = 0; k < zv(p, 3, 5); k++) {
        const q = span(t, 0.45 + k * 0.2, 1.05 + k * 0.2)
        if (q > 0 && q < 1) {
          const R = Math.round(4 + zv(p, 40, 60) * ease.outQ(q))
          g.drawImage(ring(R, 2, '#d65cff', 1 - q), Math.round(s.O.x - R - 1), Math.round(s.O.y - R - 1))
        }
      }
      for (const t0 of p.z ? [SLAM, SLAM2] : [SLAM]) {
        const sp = span(t, t0, t0 + 0.3)
        if (sp <= 0 || sp >= 1) continue
        const R = Math.round(6 + zv(p, 30, 44) * ease.outC(sp))
        g.drawImage(ring(R, 3, '#ff7ad9', 1 - sp), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
        if (R > 10)
          g.drawImage(ring(R - 6, 1, '#ffffff', 1 - sp), Math.round(s.T.x - R + 5), Math.round(s.T.y - R + 5))
      }
      if (p.status === 'confuse' && within(t, 2.3, 3.9)) {
        // Confusion: three stars on an orbit over its head.
        const top = s.tgt.at.y - s.tgt.size.h - 4
        for (let k = 0; k < 3; k++) {
          const a = t * 4 + (k * Math.PI * 2) / 3
          const x = Math.round(s.tgt.at.x + Math.cos(a) * 13)
          const y = Math.round(top + Math.sin(a) * 4)
          rect(g, x - 1, y, 3, 1, '#ffe14d')
          rect(g, x, y - 1, 1, 3, '#ffe14d')
          if (Math.sin(a) > 0) rect(g, x, y, 1, 1, '#ffffff')
        }
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, SLAM + 0.04)
      s.end(g)
      const tint = 0.35 * ease.outQ(span(t, 0.4, 0.9)) * (1 - span(t, LAND + 0.3, LAND + 0.9))
      wash(g, '#4a1f7a', tint)
      // The warp: each row slides on a sine; the amplitude swells and settles.
      const amp = zv(p, 3, 6) * Math.sin(Math.PI * span(t, 0.9, LAND - 0.02))
      gOut.clearRect(0, 0, W, H)
      gOut.drawImage(s.layer, 0, 0)
      if (amp > 0.3)
        for (let y = 0; y < H; y++) {
          const off = Math.round(Math.sin((y / 14) * Math.PI * 2 + t * 12) * amp)
          gOut.drawImage(s.layer, 0, y, W, 1, off, y, W, 1)
        }
      if (within(t, SLAM, SLAM + 2 / 60)) screenFlash(gOut, '#ffd6f4', 0.45)
    },
    cues: () =>
      attackCues(SLAM, p.status ? LAND + 0.73 : null, [
        [0.4, () => fxSound('psychic.focus')],
        [SLAM, () => fxSound('psychic.slam')],
        ...(p.z ? [[SLAM2, () => fxSound('psychic.slam')] as const] : []),
      ]),
  }
}

// ---------------------------------------------------------------- every other type: a generic impact
/**
 * Anticipation (a pull back), a lunge, contact with a hit-stop and two white frames, a burst and a dithered ring in
 * the type's colour, the target shaken. `short` is the same hit with no wind-up (Settings → Animations: short).
 */
function impactAnim(
  p: AttackParams,
  short: boolean,
): Timeline<Stage & { T: Point; tHit: number; col: string }> {
  const WIND = short ? 0 : 0.35
  const LUNGE = short ? 0.12 : 0.22
  const tHit = WIND + LUNGE
  const dur = short ? 0.9 : 1.7
  return {
    id: short ? 'hit' : 'impact',
    dur,
    setup() {
      const st = new Stage(p, 71)
      const col = p.type === 'base' ? '#ffffff' : typeColor(p.type)
      st.hit(tHit, {
        stop: 0.07,
        shake: 3,
        dur: 0.45,
        tint: col === '#ffffff' ? null : col,
        screen: short ? 1 : 2,
      })
      return Object.assign(st, { T: st.tgtAt(0.5, 0.5), tHit, col })
    },
    step(s, t, dt) {
      if (!s.step(t, dt)) return
      const at = s.passed(t)
      const r = s.r
      if (at(s.tHit))
        for (let k = 0; k < (short ? 8 : zv(p, 14, 28)); k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(50, zv(p, 130, 190))
          s.fx.add({
            x: s.T.x,
            y: s.T.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            drag: 4,
            life: r.range(0.25, 0.4),
            size: r.int(1, 2),
            shape: r() < 0.4 ? 'star' : 'sq',
            colors: ['#ffffff', mix(s.col, '#ffffff', 0.5), s.col],
          })
        }
    },
    draw(g, s, t) {
      s.begin(g, t)
      // Pull back, then a quick lunge toward the target and back.
      const back = WIND ? -3 * ease.outQ(span(t, 0, WIND)) : 0
      const lunge = zv(p, 8, 12) * Math.sin(Math.PI * span(t, WIND, tHit + 0.18))
      s.drawBoth(
        g,
        t,
        { tint: statusTint(p, t, tHit + 0.3) },
        { dx: Math.round(back + lunge), dy: -Math.round(lunge * 0.3) },
      )
      const q = span(t, tHit, tHit + 0.35)
      if (q > 0 && q < 1) {
        const R = Math.round(4 + zv(p, 22, 36) * ease.outC(q))
        g.drawImage(ring(R, zv(p, 2, 3), s.col, 1 - q), Math.round(s.T.x - R - 1), Math.round(s.T.y - R - 1))
      }
      s.fx.draw(g)
      damagePop(g, s, p, s.T.x, t, tHit + 0.04)
      s.end(g)
    },
    cues: () =>
      attackCues(tHit, p.status ? tHit + 0.3 : null, [
        ...(WIND ? [[0.05, () => fxSound('impact.windup')] as const] : []),
        [tHit, () => fxSound('impact.hit')],
      ]),
  }
}

const TYPED: Partial<Record<DieType, (p: AttackParams) => Timeline<never>>> = {
  fire: fireAnim as never,
  water: waterAnim as never,
  grass: grassAnim as never,
  electric: electricAnim as never,
  psychic: psychicAnim as never,
  // Every other type's move lives in attacks-types.ts.
  ...(moreTyped() as Partial<Record<DieType, (p: AttackParams) => Timeline<never>>>),
}

/** The timeline for one hit: the typed move when there is one, else the generic impact; short motion → one hit. */
export function attackTimeline(p: AttackParams): Timeline<unknown> {
  const make = TYPED[p.type]
  const tl = p.short ? impactAnim(p, true) : make ? make(p) : impactAnim(p, false)
  return felt(tl as Timeline<Stage>, p) as Timeline<unknown>
}

/** How long the K.O.'s final blow holds the whole scene still (docs/38 F4a): Sakurai's "boss stop", kept short. */
export const BOSS_STOP = 0.25
/** The frame it holds: the final blow's own, the target a white silhouette and the burst just out. */
const IMPACT = 1.5 / 60

/** Every particle system a scene owns (the stage's, and a move's own smoke): what still flies once it has settled. */
const particlesOf = (s: object) => Object.values(s).filter((v): v is Particles => v instanceof Particles)

/**
 * The game-feel pass on a move (docs/38): the K.O.'s boss stop, its clock held still on the final blow's impact frame
 * (nothing steps, no full-screen flash held on), and `settle` — after it, nothing new spawns and only what already
 * flies is drawn, fading out over the page's sprites. Neither asked: the move exactly as drawn.
 */
function felt(tl: Timeline<Stage>, p: AttackParams): Timeline<Stage> {
  const hold = p.power?.ko ? BOSS_STOP : 0
  if (!hold && !p.trim) return tl
  const frozen = (s: Stage, t: number) => t >= s.freezeAt && t < s.freezeAt + hold
  // The move's own clock: still through the stop, then on from where it stood.
  const local = (s: Stage, t: number) => (t < s.freezeAt ? t : frozen(s, t) ? s.freezeAt : t - hold)
  return {
    ...tl,
    dur: tl.dur + hold,
    setup() {
      const s = tl.setup()
      if (hold) s.freezeAt = s.lastHit + IMPACT
      return s
    },
    step(s, t, dt) {
      if (s.tail) for (const ps of particlesOf(s)) ps.update(dt)
      else if (!frozen(s, t)) tl.step(s, local(s, t), dt)
    },
    draw(g, s, t) {
      if (s.tail) for (const ps of particlesOf(s)) ps.draw(g)
      else if (frozen(s, t)) withoutFlashes(() => tl.draw(g, s, s.freezeAt))
      else tl.draw(g, s, local(s, t))
    },
    cues(s) {
      const later = (t0: number) => (t0 > s.freezeAt ? t0 + hold : t0)
      const c: Cue<Stage>[] = tl.cues(s).map(([t0, fire]) => [later(t0), fire] as const)
      if (hold) c.push([s.freezeAt, (hud) => hud.ko?.()])
      if (p.trim)
        c.push([
          later(s.settleAt),
          (hud, st) => {
            st.tail = true
            hud.settle?.()
          },
        ])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}

/** The move types that have their own timeline (the dev page lists them). */
export const TYPED_MOVES = Object.keys(TYPED) as DieType[]
