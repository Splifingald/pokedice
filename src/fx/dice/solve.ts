// Recorded dice throws (docs/37): which recording a die plays, and how it is turned so the engine's face lands on top.
// Pure: no DOM, no React, no engine RNG. The engine has already chosen the face; this only decides how the landing on
// it looks, from a hash of the die's roll key, so the same roll always plays the same throw.
import { mMirror, mMul, mMulInto, mT, qSlerpInto, qToMatInto, vCross, type Mat3, type Vec3 } from './math'

/** Where each of a die's six faces sits on the cube, and which way its art's top points. Opposite faces: 0/5, 1/4, 2/3. */
export const FACE_N: readonly Vec3[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [-1, 0, 0],
  [0, -1, 0],
]
export const FACE_UP: readonly Vec3[] = [
  [0, 0, -1],
  [0, 1, 0],
  [0, 1, 0],
  [0, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
]
/** Each face's art's right: up × normal, so a face seen from outside is never mirrored. */
export const FACE_RIGHT: readonly Vec3[] = FACE_N.map((n, f) => vCross(FACE_UP[f]!, n))

/** The cube's eight corners, a unit cube round its centre. */
export const CORNERS: readonly Vec3[] = [-0.5, 0.5].flatMap((x) =>
  [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z): Vec3 => [x, y, z])),
)

/** The baked file (scripts/bake-dice.ts → throws.json): whole numbers, so it is small and the same on every run. */
export interface ThrowFile {
  v: 1
  /** Frames stored a second. */
  hz: number
  /** Stored value = round(value × scale). */
  pos: number
  rot: number
  throws: {
    /** The face the recording itself lands on (before any turn): a check, and the Kitchen Sink's debug line. */
    up: number
    /** The recording's last pose as a whole-number matrix (a cube symmetry: one ±1 per row and column). */
    mf: number[]
    /** The first frame of the still pose the throw ends on. */
    rest: number
    /** Contacts worth a sound, in ms from the throw's start. */
    c: number[]
    /**
     * Per frame: x, y, z (y = the centre's height; x and z from the resting spot), then the quaternion w, x, y, z.
     * The first frame as is, every later one as its change from the frame before.
     */
    f: number[]
  }[]
}

export interface Throw {
  n: number
  f: Float64Array
  rest: number
  mf: number[]
  up: number
  /** Seconds from the throw's start. */
  contacts: number[]
}

export interface ThrowSet {
  hz: number
  throws: Throw[]
}

export function decodeThrows(file: ThrowFile): ThrowSet {
  return {
    hz: file.hz,
    throws: file.throws.map((t) => {
      const n = t.f.length / 7
      const f = new Float64Array(t.f.length)
      const sum = [0, 0, 0, 0, 0, 0, 0]
      for (let i = 0; i < n; i++)
        for (let k = 0; k < 7; k++) {
          sum[k] = sum[k]! + t.f[i * 7 + k]!
          f[i * 7 + k] = sum[k]! / (k < 3 ? file.pos : file.rot)
        }
      return { n, f, rest: t.rest, mf: t.mf, up: t.up, contacts: t.c.map((ms) => ms / 1000) }
    }),
  }
}

/** FNV-1a, then a final mix so every bit of the key moves the low bits a modulo reads. */
export function hashKey(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * `full`: the whole throw. `short`: only its last bounce and settle. `calm` (the OS asks for less motion): no
 * tumbling at all, the die drops two art pixels onto its shadow in two steps.
 */
export type ThrowLevel = 'full' | 'short' | 'calm'

/** `short` plays this much of the end of the throw (s): the last bounce and the settle. */
export const SHORT_TAIL = 0.32
/** `calm`'s two steps, each this long (s). */
export const CALM_STEP = 1 / 15

/** The pose that shows face `face` on top, its art upright: local right → +x, up → −z (screen up), normal → +y. */
export function goalOf(face: number): number[] {
  const r = FACE_RIGHT[face]!,
    u = FACE_UP[face]!,
    n = FACE_N[face]!
  // W·Lᵀ, with L's columns the face's right, up and normal, and W the world's (+x, −z, +y).
  return [r[0], r[1], r[2], n[0], n[1], n[2], -u[0], -u[1], -u[2]]
}

/**
 * Which recording a die plays and whether it is mirrored: from its roll key, skipping the recordings other dice in
 * the air already play, so the dice of one roll never move alike.
 */
export function pickThrow(count: number, key: string, taken: ReadonlySet<number> = new Set()) {
  const h = hashKey(key)
  let index = h % count
  for (let i = 0; i < count && taken.has(index); i++) index = (index + 1) % count
  return { index, mirror: ((h >>> 20) & 1) === 1 }
}

export interface Plan {
  level: ThrowLevel
  /** null for `calm`: no recording, only the drop. */
  rec: Throw | null
  hz: number
  index: number
  mirror: boolean
  face: number
  goal: number[]
  /** The cube symmetry every frame is turned by: M(t)·R ends on `goal`. */
  R: number[]
  /** Seconds into the recording where playback starts (`short` skips to the end). */
  from: number
  /** How long it plays (s), from `from` to the hand-over to the resting die. */
  duration: number
  /** Contacts worth a sound, in seconds from the start of playback. */
  contacts: number[]
}

/**
 * The throw a die plays to land on `face` (an index into its type's six faces). R = Mfᵀ·goal is a rotation of the
 * cube onto itself, so the turned recording is the same physical throw: same path, same bounces.
 */
export function planThrow(
  set: ThrowSet,
  key: string,
  face: number,
  level: ThrowLevel,
  taken?: ReadonlySet<number>,
): Plan {
  const goal = goalOf(face)
  if (level === 'calm' || !set.throws.length)
    return {
      level: 'calm',
      rec: null,
      hz: set.hz,
      index: -1,
      mirror: false,
      face,
      goal,
      R: goal,
      from: 0,
      duration: 2 * CALM_STEP,
      contacts: [],
    }
  const { index, mirror } = pickThrow(set.throws.length, key, taken)
  const rec = set.throws[index]!
  const mf = mirror ? mMirror(rec.mf) : rec.mf
  const end = (rec.n - 1) / set.hz
  const from = level === 'short' ? Math.max(0, end - SHORT_TAIL) : 0
  return {
    level,
    rec,
    hz: set.hz,
    index,
    mirror,
    face,
    goal,
    R: mMul(mT(mf), goal),
    from,
    duration: end - from,
    contacts: rec.contacts.filter((c) => c >= from && c < end).map((c) => c - from),
  }
}

/** Where the die is at one moment: its centre (x, z from the resting spot, y its height; 0.5 = on the floor). */
export interface Pose {
  x: number
  y: number
  z: number
  /** Its rotation, turned by R. */
  m: Float64Array
  /** Exactly the resting pose: the renderer copies the resting face pixel for pixel. */
  rest: boolean
  /** `calm`'s drop: art pixels above the floor. */
  drop: number
}

export const newPose = (): Pose => ({ x: 0, y: 0.5, z: 0, m: new Float64Array(9), rest: true, drop: 0 })

// Scratch for samplePlan: playback runs every frame and must not allocate.
const sq = new Float64Array(4)
const sm = new Float64Array(9)

/** The pose `t` seconds into playback, written into `out`. Past the end it is the resting pose. */
export function samplePlan(plan: Plan, t: number, out: Pose): Pose {
  const rec = plan.rec
  const at = Math.max(0, Math.min(t, plan.duration))
  const f = rec ? (plan.from + at) * plan.hz : 0
  if (!rec || f >= rec.rest) {
    out.x = 0
    out.y = 0.5
    out.z = 0
    out.m.set(plan.goal)
    out.rest = true
    out.drop = rec ? 0 : at < CALM_STEP ? 2 : at < 2 * CALM_STEP ? 1 : 0
    return out
  }
  const a = Math.floor(f)
  const b = Math.min(rec.n - 1, a + 1)
  const s = f - a
  const F = rec.f
  out.x = F[a * 7]! + (F[b * 7]! - F[a * 7]!) * s
  out.y = F[a * 7 + 1]! + (F[b * 7 + 1]! - F[a * 7 + 1]!) * s
  out.z = F[a * 7 + 2]! + (F[b * 7 + 2]! - F[a * 7 + 2]!) * s
  qSlerpInto(F, a * 7 + 3, F, b * 7 + 3, s, sq)
  qToMatInto(sq[0]!, sq[1]!, sq[2]!, sq[3]!, sm)
  if (plan.mirror) {
    out.x = -out.x
    sm[1] = -sm[1]!
    sm[2] = -sm[2]!
    sm[3] = -sm[3]!
    sm[6] = -sm[6]!
  }
  mMulInto(sm, plan.R, out.m)
  out.rest = false
  out.drop = 0
  return out
}

/** The face a rotation shows on top (the one whose normal points most nearly up). */
export function topFace(m: Mat3): number {
  let best = 0
  let up = -2
  for (let f = 0; f < 6; f++) {
    const n = FACE_N[f]!
    const y = m[3]! * n[0] + m[4]! * n[1] + m[5]! * n[2]
    if (y > up) {
      up = y
      best = f
    }
  }
  return best
}
