/**
 * Records the dice throws the game replays (docs/37, "Recorded throws"):
 *
 *   pnpm bake:dice
 *
 * A small rigid-body simulation (a unit cube, a floor, impulses at its corners; the Dice Lab prototype's, docs/37-dice)
 * throws a die into its lane again and again from a fixed seed. It keeps the throws that settle flat, stay in their
 * lane and fit the battle's roll step; turns each whole path about the vertical so the die rests square; eases the
 * last few degrees of tilt out so the last frame is exactly flat; and holds that pose a moment, so the hand-over to the
 * resting DOM die can't be seen. The game turns each throw by a cube symmetry at run time to land on the engine's face
 * (src/fx/dice/solve.ts), so which face a recording lands on doesn't matter.
 *
 * Writes src/fx/dice/throws.json: whole numbers, 30 frames a second, the same file on every run. No runtime
 * dependency: the game only reads the file, lazily.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  matToQuat,
  mApply,
  qAxisAngle,
  qMul,
  qNorm,
  qSlerp,
  qToMat,
  vAdd,
  vCross,
  vDot,
  vLen,
  vMul,
  vSub,
  type Quat,
  type Vec3,
} from '../src/fx/dice/math'
import { CORNERS, FACE_N, FACE_UP, type ThrowFile } from '../src/fx/dice/solve'

const OUT = resolve(import.meta.dirname, '../src/fx/dice/throws.json')
const SEED = 1996
const COUNT = 48
/** Simulation steps a second, and every how many steps a frame is kept (60 a second while baking). */
const STEP_HZ = 240
const KEEP = 4
const FRAME_HZ = STEP_HZ / KEEP
/** Stored frames a second: every other baked frame; the game slerps between them. */
const OUT_HZ = 30
/** The whole throw, hand-over included (s): it must fit the battle's roll step (750 ms × pace, useBattleAnimator). */
const MIN_S = 0.45
const MAX_S = 0.7
/** Baked frames the leftover tilt is eased out over, then baked frames the still pose is held. */
const EASE = 8
const HOLD = 4
/** A neighbour's lane starts this far to either side (die widths), and the throw comes from behind, never beside. */
const LANE = 0.62
const MIN_BACK = 0.8
const MAX_PAST = 0.35
const POS_SCALE = 100
const ROT_SCALE = 1000

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Frame {
  p: Vec3
  q: Quat
}

interface Sim {
  frames: Frame[]
  /** Hard contacts: seconds from the start. */
  contacts: number[]
}

/** One throw, simulated until the die is still (or given up on). */
function simulate(rnd: () => number): Sim | null {
  const G = -42,
    REST = 0.32,
    MU = 0.45,
    I = 1 / 6,
    dt = 1 / STEP_HZ
  // Released high and far back, moving fast: the die comes in through the top of its lane (about three dice up), as
  // into the prototype's tray, and still settles inside the roll step.
  let pos: Vec3 = [(rnd() - 0.5) * 0.6, 2.8 + rnd() * 0.6, -3.2 - rnd() * 0.6]
  let vel: Vec3 = [(rnd() - 0.5) * 1.2, 0.5 + rnd() * 1, 4.2 + rnd() * 1.2]
  let q = qNorm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5])
  let w: Vec3 = [(rnd() - 0.5) * 30, (rnd() - 0.5) * 14, (rnd() - 0.5) * 30]
  const frames: Frame[] = []
  const contacts: number[] = []
  let still = 0
  for (let step = 0; step < STEP_HZ * 1.6; step++) {
    vel = [vel[0], vel[1] + G * dt, vel[2]]
    pos = vAdd(pos, vMul(vel, dt))
    q = qNorm(qMul(qAxisAngle(w, vLen(w) * dt), q))
    const m = qToMat(q)
    let pen = 0
    let touching = false
    let hard = false
    for (const c of CORNERS) {
      const r = mApply(m, c)
      if (pos[1] + r[1] >= 0) continue
      touching = true
      pen = Math.max(pen, -(pos[1] + r[1]))
      let vp = vAdd(vel, vCross(w, r))
      if (vp[1] >= 0) continue
      const rn = vCross(r, [0, 1, 0])
      // No bounce on a resting contact, or it jitters forever.
      const e = vp[1] < -2 ? REST : 0
      if (vp[1] < -2) hard = true
      const j = (-(1 + e) * vp[1]) / (1 + vDot(rn, rn) / I)
      vel = vAdd(vel, [0, j, 0])
      w = vAdd(w, vMul(vCross(r, [0, j, 0]), 1 / I))
      vp = vAdd(vel, vCross(w, r))
      const vt: Vec3 = [vp[0], 0, vp[2]]
      const vtl = vLen(vt)
      if (vtl > 1e-6) {
        const tn = vMul(vt, 1 / vtl)
        const rt = vCross(r, tn)
        const jt = Math.min(vtl / (1 + vDot(rt, rt) / I), MU * j)
        vel = vSub(vel, vMul(tn, jt))
        w = vSub(w, vMul(vCross(r, tn), jt / I))
      }
    }
    if (hard) contacts.push(step * dt)
    pos = [pos[0], pos[1] + pen, pos[2]]
    const ld = touching ? 2.2 : 0.3
    const ad = touching ? 3.2 : 0.3
    vel = vMul(vel, 1 - ld * dt)
    w = vMul(w, 1 - ad * dt)
    if (step % KEEP === 0) frames.push({ p: pos, q })
    if (touching && vLen(vel) < 0.15 && vLen(w) < 0.4) still++
    else still = 0
    // Still for 0.1 s: cut the stillness off again, the hold below stands in for it.
    if (still > 24) return { frames: frames.slice(0, Math.max(2, frames.length - 4)), contacts }
  }
  return null
}

const round = (v: number, s: number) => Math.round(v * s) || 0

/** A recording squared, eased and held, or null when it isn't one the game can use. */
function bake(sim: Sim): ThrowFile['throws'][number] | null {
  const fr = sim.frames
  const last = fr[fr.length - 1]!
  const m = qToMat(last.q)
  let up = 0
  let best = -2
  FACE_N.forEach((n, f) => {
    const y = mApply(m, n)[1]
    if (y > best) {
      best = y
      up = f
    }
  })
  // Cocked against something, or not settled flat.
  if (best < 0.99) return null
  // Turn the whole path about the vertical through the resting spot, so the die settles square to the screen.
  const side = mApply(m, FACE_UP[up]!)
  const th = Math.atan2(side[2], side[0])
  const psi = -(th - Math.round(th / (Math.PI / 2)) * (Math.PI / 2))
  const Y = qAxisAngle([0, 1, 0], -psi)
  const Ym = qToMat(Y)
  const rest = last.p
  const path: Frame[] = fr.map((f) => {
    const d = mApply(Ym, [f.p[0] - rest[0], 0, f.p[2] - rest[2]])
    return { p: [d[0], f.p[1], d[2]], q: qNorm(qMul(Y, f.q)) }
  })
  // The leftover tilt (a few degrees) eased out over the last frames, so the last one is exactly flat.
  const lq = path[path.length - 1]!.q
  const v = mApply(qToMat(lq), FACE_N[up]!)
  const axis = vCross(v, [0, 1, 0])
  const tilt = qAxisAngle(vLen(axis) > 1e-9 ? axis : [1, 0, 0], Math.acos(Math.min(1, v[1])))
  for (let k = path.length - EASE; k < path.length; k++) {
    const f = path[k]!
    const s = (k - (path.length - 1 - EASE)) / EASE
    path[k] = {
      q: qNorm(qMul(qSlerp([1, 0, 0, 0], tilt, s), f.q)),
      p: [f.p[0], f.p[1] + (0.5 - f.p[1]) * s, f.p[2]],
    }
  }
  // The last pose, exactly: a cube symmetry on the floor at the resting spot, held a moment.
  const mf = qToMat(path[path.length - 1]!.q).map((x) => Math.round(x) || 0)
  const still: Frame = { p: [0, 0.5, 0], q: matToQuat(mf) }
  path[path.length - 1] = still
  for (let i = 0; i < HOLD; i++) path.push(still)
  // In its lane: never towards a neighbour's, thrown from behind, not rolling far past its spot.
  if (path.some((f) => Math.abs(f.p[0]) > LANE || f.p[2] > MAX_PAST) || path[0]!.p[2] > -MIN_BACK) return null
  // Every other frame, counted back from the end so the still pose is kept exactly.
  const keep: Frame[] = []
  for (let i = path.length - 1; i >= 0; i -= FRAME_HZ / OUT_HZ) keep.unshift(path[i]!)
  const seconds = (keep.length - 1) / OUT_HZ
  if (seconds < MIN_S || seconds > MAX_S) return null
  const firstStill = keep.findIndex((f) => f === still)
  // The throw starts with the first kept frame: contacts shift with it, and none after the die is still.
  const t0 = (path.length - 1 - (keep.length - 1) * (FRAME_HZ / OUT_HZ)) / FRAME_HZ
  const contacts: number[] = []
  for (const c of sim.contacts) {
    const ms = Math.round((c - t0) * 1000)
    if (ms < 0 || ms > (firstStill / OUT_HZ) * 1000) continue
    // One sound per bounce: corners hitting within 60 ms of each other are the same bounce.
    if (contacts.length && ms - contacts[contacts.length - 1]! < 60) continue
    contacts.push(ms)
  }
  return {
    up,
    mf,
    rest: firstStill,
    c: contacts,
    f: deltas(
      keep.flatMap((f) => [
        round(f.p[0], POS_SCALE),
        round(f.p[1], POS_SCALE),
        round(f.p[2], POS_SCALE),
        ...f.q.map((x) => round(x, ROT_SCALE)),
      ]),
    ),
  }
}

/** Every frame after the first as its change from the one before: small numbers, a fifth smaller once gzipped. */
const deltas = (abs: number[]) => abs.map((v, i) => (i < 7 ? v : v - abs[i - 7]!))

function main() {
  const rnd = mulberry32(SEED)
  const throws: ThrowFile['throws'] = []
  let tries = 0
  for (; throws.length < COUNT && tries < 5000; tries++) {
    const sim = simulate(rnd)
    const t = sim && bake(sim)
    if (t) throws.push(t)
  }
  if (throws.length < COUNT) throw new Error(`Only ${throws.length} usable throws in ${tries} tries`)
  const file: ThrowFile = { v: 1, hz: OUT_HZ, pos: POS_SCALE, rot: ROT_SCALE, throws }
  // One throw a line: readable diffs, and still small.
  const body = throws.map((t) => '    ' + JSON.stringify(t)).join(',\n')
  writeFileSync(
    OUT,
    `{\n  "v": 1,\n  "hz": ${file.hz},\n  "pos": ${file.pos},\n  "rot": ${file.rot},\n  "throws": [\n${body}\n  ]\n}\n`,
  )
  const secs = throws.map((t) => (t.f.length / 7 - 1) / OUT_HZ)
  const ups = [0, 1, 2, 3, 4, 5].map((f) => throws.filter((t) => t.up === f).length)
  console.log(
    `${throws.length} throws from ${tries} tries: ${Math.min(...secs).toFixed(2)}–${Math.max(...secs).toFixed(2)} s, ` +
      `contacts ${Math.min(...throws.map((t) => t.c.length))}–${Math.max(...throws.map((t) => t.c.length))}, ` +
      `raw top faces ${ups.join('/')} → ${OUT}`,
  )
}

main()
