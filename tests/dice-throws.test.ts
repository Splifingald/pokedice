// Recorded dice throws (docs/37): every recording, turned for any face, lands that face on top and upright; the same
// roll key always plays the same throw; the dice of one roll each get their own; and the last frame drawn is the
// resting die, pixel for pixel.
import { describe, expect, it } from 'vitest'
import type { Face } from '@/engine'
import { buildDieArt, drawDie, emptyBox, type Box, type Frame } from '@/fx/dice/cube'
import { mApply, mMirror, mMul, qToMat } from '@/fx/dice/math'
import {
  CALM_STEP,
  decodeThrows,
  FACE_N,
  FACE_UP,
  goalOf,
  hashKey,
  newPose,
  pickThrow,
  planThrow,
  samplePlan,
  SHORT_TAIL,
  topFace,
  type Plan,
  type ThrowFile,
} from '@/fx/dice/solve'
import file from '@/fx/dice/throws.json'

const SET = decodeThrows(file as ThrowFile)
const close = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-9) =>
  Array.from(a).every((v, i) => Math.abs(v - b[i]!) < eps)

/** The plan for one recording, as planThrow would build it for a key that hashes to it. */
function planFor(index: number, mirror: boolean, face: number): Plan {
  const rec = SET.throws[index]!
  const mf = mirror ? mMirror(rec.mf) : rec.mf
  const goal = goalOf(face)
  const plan = planThrow(SET, 'any', face, 'full')
  const R = mMul([mf[0]!, mf[3]!, mf[6]!, mf[1]!, mf[4]!, mf[7]!, mf[2]!, mf[5]!, mf[8]!], goal)
  return { ...plan, rec, index, mirror, R, from: 0, duration: (rec.n - 1) / SET.hz, contacts: rec.contacts }
}

describe('the baked throws', () => {
  it('has enough throws, each short enough for the roll step and ending on an exact cube pose', () => {
    expect(SET.throws.length).toBeGreaterThanOrEqual(32)
    for (const t of SET.throws) {
      const seconds = (t.n - 1) / SET.hz
      expect(seconds).toBeGreaterThanOrEqual(0.45)
      expect(seconds).toBeLessThanOrEqual(0.7)
      // A signed permutation: one ±1 in each row and column, a proper rotation.
      for (let r = 0; r < 3; r++)
        expect(
          t.mf
            .slice(r * 3, r * 3 + 3)
            .map(Math.abs)
            .sort(),
        ).toEqual([0, 0, 1])
      expect(t.rest).toBeLessThan(t.n)
      const last = t.f.subarray((t.n - 1) * 7)
      expect(last[1]).toBeCloseTo(0.5, 2)
      expect(close(qToMat([last[3]!, last[4]!, last[5]!, last[6]!]), t.mf, 5e-3)).toBe(true)
      // The recording lands on the face it says, before any turn.
      expect(topFace(t.mf)).toBe(t.up)
    }
  })

  it('stays in its lane: never towards a neighbour, thrown from behind', () => {
    for (const t of SET.throws)
      for (let i = 0; i < t.n; i++) {
        expect(Math.abs(t.f[i * 7]!)).toBeLessThanOrEqual(0.62)
        expect(t.f[i * 7 + 2]!).toBeLessThanOrEqual(0.35)
      }
  })
})

describe('landing on the engine’s face', () => {
  it('every throw × every face × mirror ends with that face on top, its art upright', () => {
    const pose = newPose()
    for (let i = 0; i < SET.throws.length; i++)
      for (const mirror of [false, true])
        for (let face = 0; face < 6; face++) {
          const plan = planFor(i, mirror, face)
          const end = samplePlan(plan, plan.duration, pose)
          expect(end.rest).toBe(true)
          expect(close(mApply(end.m, FACE_N[face]!), [0, 1, 0])).toBe(true)
          expect(close(mApply(end.m, FACE_UP[face]!), [0, 0, -1])).toBe(true)
          // The last moving frame, turned, is already that pose give or take the eased tilt: no snap at the end.
          const before = samplePlan(plan, (plan.rec!.rest - 1) / SET.hz, newPose())
          expect(before.rest).toBe(false)
          expect(mApply(before.m, FACE_N[face]!)[1]).toBeGreaterThan(0.98)
          expect(mApply(before.m, FACE_UP[face]!)[2]).toBeLessThan(-0.98)
          expect(topFace(before.m)).toBe(face)
        }
  })

  it('turns the recording by a symmetry of the cube, so it is the same physical throw', () => {
    for (let face = 0; face < 6; face++) {
      const plan = planThrow(SET, `r1-${face}`, face, 'full')
      for (let r = 0; r < 3; r++)
        expect(
          plan.R.slice(r * 3, r * 3 + 3)
            .map((v) => Math.abs(Math.round(v)))
            .sort(),
        ).toEqual([0, 0, 1])
      expect(close(plan.R.map(Math.round), plan.R)).toBe(true)
    }
  })

  it('lands where the die rests: in its spot, on the floor', () => {
    const plan = planThrow(SET, 'r7-2', 3, 'full')
    const end = samplePlan(plan, plan.duration + 1, newPose())
    expect([end.x, end.y, end.z]).toEqual([0, 0.5, 0])
  })
})

describe('which throw a die plays', () => {
  it('is the same for the same roll key, every time', () => {
    const a = planThrow(SET, 'r42-1', 2, 'full')
    const b = planThrow(SET, 'r42-1', 2, 'full')
    expect([a.index, a.mirror, a.R]).toEqual([b.index, b.mirror, b.R])
    expect(hashKey('r42-1')).toBe(hashKey('r42-1'))
  })

  it('differs between the dice of one roll', () => {
    for (let roll = 0; roll < 50; roll++) {
      const taken = new Set<number>()
      for (let i = 0; i < 8; i++) {
        const { index } = pickThrow(SET.throws.length, `r${roll}-${i}`, taken)
        expect(taken.has(index)).toBe(false)
        taken.add(index)
      }
    }
  })

  it('spreads keys over the recordings and both mirrors', () => {
    const seen = new Set<number>()
    let mirrored = 0
    for (let i = 0; i < 400; i++) {
      const p = pickThrow(SET.throws.length, `r${i}-0`)
      seen.add(p.index)
      if (p.mirror) mirrored++
    }
    expect(seen.size).toBeGreaterThan(SET.throws.length * 0.8)
    expect(mirrored).toBeGreaterThan(120)
    expect(mirrored).toBeLessThan(280)
  })
})

describe('motion levels', () => {
  it('short plays only the end of the throw; calm is a two-step drop with no bounce sounds', () => {
    for (let i = 0; i < 20; i++) {
      const full = planThrow(SET, `k${i}`, 1, 'full')
      const short = planThrow(SET, `k${i}`, 1, 'short')
      expect(short.index).toBe(full.index)
      expect(short.duration).toBeLessThan(full.duration)
      expect(short.duration).toBeLessThanOrEqual(SHORT_TAIL + 1e-9)
      expect(short.contacts.every((c) => c >= 0 && c <= short.duration)).toBe(true)
    }
    const calm = planThrow(SET, 'k1', 4, 'calm')
    expect(calm.duration).toBeCloseTo(2 * CALM_STEP)
    expect(calm.contacts).toEqual([])
    const pose = newPose()
    expect(samplePlan(calm, 0, pose).drop).toBe(2)
    expect(samplePlan(calm, CALM_STEP * 1.5, pose).drop).toBe(1)
    expect(samplePlan(calm, calm.duration, pose).drop).toBe(0)
    expect(close(pose.m, goalOf(4))).toBe(true)
  })
})

describe('the cube renderer', () => {
  const faces: Face[] = [1, 2, 3, 4, 5, 6].map((value) => ({ kind: 'number', value }))
  const look = { size: 48, fill: '#f4f6fb', pip: '#24304f', mini: false, alpha: 1, faces }
  const frame = (): Frame => ({ buf: new Uint32Array(144 * 216), w: 144, h: 216 })

  it('draws the resting pose as the face art, pixel for pixel, on the die’s spot', () => {
    const art = buildDieArt(look)
    const fb = frame()
    const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    emptyBox(box)
    const plan = planThrow(SET, 'r3-0', 4, 'full')
    drawDie(fb, 48, 144, samplePlan(plan, plan.duration, newPose()), art, 4, box)
    const src = art.faces[4]![1]!
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) expect(fb.buf[(144 + y) * 144 + 48 + x]).toBe(src[y * 48 + x])
    // Its five pips, in the pip colour, where Die.tsx puts them (pipLayout(48): 8 px pips at 10, 20, 30).
    expect(fb.buf[(144 + 24) * 144 + 48 + 24]).toBe(fb.buf[(144 + 12) * 144 + 48 + 12])
    expect(box).toEqual({ x0: 48, y0: 144, x1: 96, y1: 144 + 51 })
  })

  it('draws a frame in the air in whole 2 px art pixels, inside its canvas, with an ink outline', () => {
    const art = buildDieArt(look)
    const fb = frame()
    const box: Box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    emptyBox(box)
    const plan = planThrow(SET, 'r3-0', 4, 'full')
    drawDie(fb, 48, 144, samplePlan(plan, plan.duration * 0.6, newPose()), art, 4, box)
    let ink = 0
    for (let y = 0; y < fb.h; y += 2)
      for (let x = 0; x < fb.w; x += 2) {
        const c = fb.buf[y * fb.w + x]!
        // A block is one colour.
        expect([
          fb.buf[y * fb.w + x + 1],
          fb.buf[(y + 1) * fb.w + x],
          fb.buf[(y + 1) * fb.w + x + 1],
        ]).toEqual([c, c, c])
        if (c === art.ink) ink++
      }
    expect(ink).toBeGreaterThan(20)
    expect(box.x0).toBeGreaterThanOrEqual(0)
    expect(box.x1).toBeLessThanOrEqual(fb.w + 2)
  })
})
