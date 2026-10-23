// Small 3D helpers for the recorded dice throws (docs/37): vectors [x, y, z], quaternions [w, x, y, z] and 3×3
// rotation matrices stored row-major in 9 numbers. y is up; the camera looks straight down, screen right is +x and
// screen down is +z. Pure: the bake script, the solver and the renderer share them.

export type Vec3 = readonly [number, number, number]
export type Quat = readonly [number, number, number, number]
/** A 3×3 matrix, row-major (9 numbers). */
export type Mat3 = ArrayLike<number>

export const vAdd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vSub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vMul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const vDot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vCross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const vLen = (a: Vec3) => Math.hypot(a[0], a[1], a[2])

export const qMul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
]

export const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3])
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

export const qAxisAngle = (axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2) / (vLen(axis) || 1)
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s]
}

/** Spherical interpolation, written into `out` (4 numbers from `at`) so the playback loop allocates nothing. */
export function qSlerpInto(
  a: ArrayLike<number>,
  ai: number,
  b: ArrayLike<number>,
  bi: number,
  t: number,
  out: number[] | Float64Array,
) {
  const aw = a[ai]!,
    ax = a[ai + 1]!,
    ay = a[ai + 2]!,
    az = a[ai + 3]!
  let bw = b[bi]!,
    bx = b[bi + 1]!,
    by = b[bi + 2]!,
    bz = b[bi + 3]!
  let d = aw * bw + ax * bx + ay * by + az * bz
  // q and −q are the same turn: take the short way round.
  if (d < 0) {
    bw = -bw
    bx = -bx
    by = -by
    bz = -bz
    d = -d
  }
  let wa: number, wb: number
  if (d > 0.9995) {
    wa = 1 - t
    wb = t
  } else {
    const th = Math.acos(d)
    const s = Math.sin(th)
    wa = Math.sin((1 - t) * th) / s
    wb = Math.sin(t * th) / s
  }
  const w = aw * wa + bw * wb,
    x = ax * wa + bx * wb,
    y = ay * wa + by * wb,
    z = az * wa + bz * wb
  const l = Math.hypot(w, x, y, z) || 1
  out[0] = w / l
  out[1] = x / l
  out[2] = y / l
  out[3] = z / l
}

export const qSlerp = (a: Quat, b: Quat, t: number): Quat => {
  const out = [0, 0, 0, 0]
  qSlerpInto(a, 0, b, 0, t, out)
  return out as unknown as Quat
}

/** The rotation matrix of a unit quaternion, written into `out`. */
export function qToMatInto(w: number, x: number, y: number, z: number, out: number[] | Float64Array) {
  out[0] = 1 - 2 * (y * y + z * z)
  out[1] = 2 * (x * y - w * z)
  out[2] = 2 * (x * z + w * y)
  out[3] = 2 * (x * y + w * z)
  out[4] = 1 - 2 * (x * x + z * z)
  out[5] = 2 * (y * z - w * x)
  out[6] = 2 * (x * z - w * y)
  out[7] = 2 * (y * z + w * x)
  out[8] = 1 - 2 * (x * x + y * y)
}

export const qToMat = (q: Quat): number[] => {
  const out = new Array<number>(9)
  qToMatInto(q[0], q[1], q[2], q[3], out)
  return out
}

/** A rotation matrix back to a unit quaternion (Shepperd's method: stable whichever axis dominates). */
export function matToQuat(m: Mat3): Quat {
  const tr = m[0]! + m[4]! + m[8]!
  let w: number, x: number, y: number, z: number
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    w = s / 4
    x = (m[7]! - m[5]!) / s
    y = (m[2]! - m[6]!) / s
    z = (m[3]! - m[1]!) / s
  } else if (m[0]! > m[4]! && m[0]! > m[8]!) {
    const s = Math.sqrt(1 + m[0]! - m[4]! - m[8]!) * 2
    w = (m[7]! - m[5]!) / s
    x = s / 4
    y = (m[1]! + m[3]!) / s
    z = (m[2]! + m[6]!) / s
  } else if (m[4]! > m[8]!) {
    const s = Math.sqrt(1 + m[4]! - m[0]! - m[8]!) * 2
    w = (m[2]! - m[6]!) / s
    x = (m[1]! + m[3]!) / s
    y = s / 4
    z = (m[5]! + m[7]!) / s
  } else {
    const s = Math.sqrt(1 + m[8]! - m[0]! - m[4]!) * 2
    w = (m[3]! - m[1]!) / s
    x = (m[2]! + m[6]!) / s
    y = (m[5]! + m[7]!) / s
    z = s / 4
  }
  return qNorm([w, x, y, z])
}

export const mApply = (m: Mat3, v: Vec3): Vec3 => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
]

/** a · b, written into `out` (which must not be a or b). */
export function mMulInto(a: Mat3, b: Mat3, out: number[] | Float64Array) {
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!
}

export const mMul = (a: Mat3, b: Mat3): number[] => {
  const out = new Array<number>(9)
  mMulInto(a, b, out)
  return out
}

export const mT = (a: Mat3): number[] => [a[0]!, a[3]!, a[6]!, a[1]!, a[4]!, a[7]!, a[2]!, a[5]!, a[8]!]

/** The mirror through the x = 0 plane, D·M·D with D = diag(−1, 1, 1): a throw seen in a mirror is still a throw. */
export const mMirror = (m: Mat3): number[] => [
  m[0]!,
  -m[1]!,
  -m[2]!,
  -m[3]!,
  m[4]!,
  m[5]!,
  -m[6]!,
  m[7]!,
  m[8]!,
]
