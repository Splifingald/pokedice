// A Z-Move's strike (docs/35): each type's own move, more powerful — the HP drains once on the move's contact, the Z's
// mark lands on its last hit, the comeback from the sky, the ground or the water plays first, and every hit stops
// longer and shakes harder than the plain move's.
import { describe, expect, it, vi } from 'vitest'

// The pixel engine draws on canvases: a stand-in whose every call does nothing is enough to build the timelines.
vi.hoisted(() => {
  const noop = () => {}
  const g: object = new Proxy(
    { imageSmoothingEnabled: false },
    {
      get: (o, k) =>
        k in o
          ? (o as Record<string | symbol, unknown>)[k]
          : k === 'getImageData' || k === 'createImageData'
            ? (_x: number, _y: number, w = 1, h = 1) => ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h,
              })
            : k === 'canvas'
              ? { width: 240, height: 160 }
              : noop,
      set: () => true,
    },
  )
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => {}
})

const { attackTimeline } = await import('@/fx/timelines/attacks')
const { zStrikeTimeline } = await import('@/fx/timelines/zmove')
import type { DieType } from '@/engine/types'
import type { Hud, Stage, Timeline } from '@/fx/timeline'

const TYPES: DieType[] = [
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
  'base',
]

/** When each cue speaks to the HUD, by hook (sound cues say nothing). */
function heard<S>(tl: Timeline<S>) {
  const s = tl.setup()
  const out: [string, number][] = []
  for (const [t, fire] of tl.cues(s)) {
    const hud: Hud = { contact: () => out.push(['contact', t]), status: () => out.push(['status', t]) }
    // The sound cues reach the audio module, which has no context here and stays quiet.
    fire(hud, s)
  }
  return { s, out, times: tl.cues(s).map(([t]) => t) }
}

describe('the Z-Move strike', () => {
  for (const type of TYPES)
    it(`${type}: its own move, contact once, the Z's mark on the last hit`, () => {
      const plain = attackTimeline({ own: 'a', foe: 'b', by: 'own', type }) as Timeline<Stage>
      const z = zStrikeTimeline({ own: 'a', foe: 'b', side: 'own', type, damage: 50 })
      expect(z.id).toBe(`z-${plain.id}`)
      const { s, out, times } = heard(z)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(out.filter(([k]) => k === 'contact')).toHaveLength(1)
      expect(s.fin).toBe(s.move.lastHit)
      expect(s.fin).toBeLessThan(z.dur)
      // Harder: the move's hits shake more than the plain one's.
      const p = plain.setup()
      const shake = (st: Stage) => Math.max(...st.targetShakes.map(([, , a]) => a))
      expect(shake(s.move)).toBeGreaterThan(shake(p))
    })

  it('back from the sky, the ground or the water first: the move plays after the comeback', () => {
    const plain = heard(zStrikeTimeline({ own: 'a', foe: 'b', side: 'foe', type: 'ground' }))
    const back = heard(zStrikeTimeline({ own: 'a', foe: 'b', side: 'foe', type: 'ground', from: 'dig' }))
    const contact = (h: typeof plain) => h.out.find(([k]) => k === 'contact')![1]
    expect(contact(back) - contact(plain)).toBeCloseTo(0.5)
    expect(back.s.fin - plain.s.fin).toBeCloseTo(0.5)
    // Already dark from the comeback: the move's dim doesn't come down again.
    expect(back.s.move.zIn).toBe(0)
  })

  it('short motion: the one hit, undimmed, with the mark', () => {
    const z = zStrikeTimeline({ own: 'a', foe: 'b', side: 'own', type: 'fire', short: true })
    const { s, out } = heard(z)
    expect(z.id).toBe('z-hit')
    expect(s.move.z).toBeNull()
    expect(out.filter(([k]) => k === 'contact')).toHaveLength(1)
  })
})
