// Darkrai's nightmare's effects (docs/30, docs/15 §29): the intro holds its end and says its line while the shadow is
// in front of the moon; the strike's beams land at a known time (the screen takes the HP then), the same moment at
// every motion level but quicker when short; the waking roars before its name card; the raid's entrance lands on the
// raid intro's white-out; a haunted foe's rim never blurs or covers it and its smoke holds still when motion is off;
// and the lasting effects follow the motion rules (a calm OS stills them).
import { describe, expect, it, vi } from 'vitest'

// The pixel engine makes a scratch canvas when it loads: a stand-in is enough here (nothing is drawn).
vi.hoisted(() => {
  const g = { imageSmoothingEnabled: false }
  ;(globalThis as { document?: unknown }).document ??= {
    documentElement: {},
    createElement: () => ({ getContext: () => g, width: 0, height: 0 }),
  }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame ??= () => {}
})

const {
  hauntCss,
  hauntLoop,
  moonSpot,
  nightmareIntroTimeline,
  nightmareLevel,
  nightmareStrikeTimeline,
  nightmareWakeTimeline,
  strikeHitAt,
  strikeSlots,
} = await import('@/fx/timelines/nightmare')
const { nightRaidEntranceTimeline } = await import('@/fx/timelines/nightmareRaid')
const { RAID_ENTRANCE_DUR, RAID_ENTRANCE_REVEAL } = await import('@/fx/timelines/portalRaid')
const { fullStage } = await import('@/fx/timelines/portal')
import type { Cue, Hud } from '@/fx/timeline'

/** The cues' times, and what the HUD heard (beats, contacts) firing them all in order. */
function play(cues: readonly Cue<unknown>[]) {
  const heard: [number, string][] = []
  const hud: Hud = {
    beat: (b) => void heard.push([-1, b]),
    contact: () => void heard.push([-1, 'contact']),
  }
  for (const [t, fire] of cues) {
    const before = heard.length
    fire(hud, undefined)
    for (let i = before; i < heard.length; i++) heard[i]![0] = t
  }
  return { times: cues.map(([t]) => t), heard }
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)

describe('the intro (Darkrai across the full moon)', () => {
  const size = fullStage(390, 844, 200)

  it('holds its end for the tap; its line while the shadow is in front of the moon, then the name card', () => {
    const tl = nightmareIntroTimeline({ ...size, title: 'Darkrai’s nightmare', mon: '491f' })
    expect(tl.hold).toBe(true)
    const { times, heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
    expect(sorted(times)).toEqual(times)
    const line = heard.find(([, b]) => b === 'line')![0]
    const card = heard.find(([, b]) => b === 'card')![0]
    expect(line).toBeGreaterThan(2)
    expect(card).toBeGreaterThan(line)
    expect(card).toBeLessThan(tl.dur)
  })

  it('short: the same beats in half the time', () => {
    const full = nightmareIntroTimeline({ ...size, title: 'x', mon: '491f' })
    const short = nightmareIntroTimeline({ ...size, title: 'x', mon: '491f', short: true })
    expect(short.dur).toBeLessThan(full.dur * 0.6)
    const at = (tl: typeof full, b: string) =>
      play(tl.cues(undefined as never) as Cue<unknown>[]).heard.find(([, x]) => x === b)![0]
    expect(at(short, 'line')).toBeCloseTo(at(full, 'line') / 2, 5)
  })

  it('the moon fits on the stage, above the words', () => {
    const { c, R } = moonSpot(size.w, size.h - size.inset)
    expect(c.y - R).toBeGreaterThan(0)
    expect(c.y + R).toBeLessThan(size.h - size.inset)
    expect(c.x - R).toBeGreaterThanOrEqual(0)
    expect(c.x + R).toBeLessThanOrEqual(size.w)
  })
})

describe('Darkrai’s strike after a round', () => {
  it('its beams land once, at strikeHitAt (the screen takes the HP then); short lands sooner and ends sooner', () => {
    for (const short of [false, true]) {
      const tl = nightmareStrikeTimeline({ mon: '491f', team: ['94bf', '448bf', '609bf'], h: 120, short })
      const { times, heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
      expect(sorted(times)).toEqual(times)
      const contacts = heard.filter(([, b]) => b === 'contact')
      expect(contacts).toEqual([[strikeHitAt(short), 'contact']])
      expect(tl.dur).toBeGreaterThan(strikeHitAt(short))
      expect(tl.hold).toBeFalsy()
    }
    expect(strikeHitAt(true)).toBeLessThan(strikeHitAt(false))
    expect(nightmareStrikeTimeline({ mon: '491f', team: [], short: true }).dur).toBeLessThan(
      nightmareStrikeTimeline({ mon: '491f', team: [] }).dur,
    )
  })

  it('stands the team side by side along the bottom, smaller past three', () => {
    const three = strikeSlots(3, 240, 120)
    expect(three.map((s) => s.x)).toEqual([40, 120, 200])
    expect(three.every((s) => s.y === 118 && s.k === 0.8)).toBe(true)
    const six = strikeSlots(6, 240, 120)
    expect(six.every((s) => s.k === 0.6 && s.x > 0 && s.x < 240)).toBe(true)
  })
})

describe('the waking (shiny Darkrai)', () => {
  it('roars at the reveal (the screen plays its cry), then shows its name card; no held end', () => {
    for (const short of [false, true]) {
      const tl = nightmareWakeTimeline({ ...fullStage(390, 844, 300), mon: '491fs', name: 'Darkrai', short })
      const { times, heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
      expect(sorted(times)).toEqual(times)
      const beats = heard.map(([, b]) => b)
      expect(beats).toEqual(['roar', 'card'])
      expect(heard[1]![0]).toBeLessThan(tl.dur)
      expect(tl.hold).toBeFalsy()
    }
  })
})

describe('Darkrai’s raid entrance (nightRaidEntranceTimeline)', () => {
  it('lands its reveal on the raid intro’s white-out and lasts as long as the intro', () => {
    const tl = nightRaidEntranceTimeline({ ...fullStage(390, 844), mon: '491fs' })
    expect(tl.dur).toBe(RAID_ENTRANCE_DUR)
    const { times, heard } = play(tl.cues(undefined as never) as Cue<unknown>[])
    expect(sorted(times)).toEqual(times)
    expect(heard).toEqual([[RAID_ENTRANCE_REVEAL, 'roar']])
    expect(tl.hold).toBeFalsy()
  })
})

describe('a haunted foe (its fights, its preview)', () => {
  /** A canvas context that only records the pixels filled, as `x,y,w,h,colour`. */
  function recorder() {
    const calls: string[] = []
    const g = {
      fillStyle: '' as unknown,
      clearRect: () => void calls.splice(0),
      fillRect: (x: number, y: number, w: number, h: number) =>
        void calls.push(`${x},${y},${w},${h},${g.fillStyle}`),
      createPattern: () => null,
    }
    return { g: g as unknown as CanvasRenderingContext2D, calls }
  }
  // The pixel engine's dither tiles want a context that makes image data.
  const scratch = document.createElement('canvas').getContext('2d')!
  Object.assign(scratch, {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  })

  it('its rim: zero-blur drop shadows (they follow the sprite, never cover it), black then violet; deeper as it breathes', () => {
    const css = hauntCss(1.6)
    const shadows = [...css.matchAll(/drop-shadow\((\S+) (\S+) (\S+) (rgb\([^)]*\))\)/g)]
    expect(shadows.length).toBe(7)
    expect(shadows.every((m) => m[3] === '0')).toBe(true)
    // Whole CSS pixels, at least one.
    expect(shadows.every((m) => /^-?[0-9]+(px)?$/.test(m[1]!) && /^-?[0-9]+(px)?$/.test(m[2]!))).toBe(true)
    expect(css).toContain('2px')
    expect(shadows[0]![4]).toMatch(/^rgb\(5 4 9/)
    expect(shadows.at(-1)![4]).toMatch(/^rgb\(90 58 168/)
    expect([...hauntCss(1.6, true).matchAll(/drop-shadow/g)].length).toBe(8)
    expect(hauntCss(0.2)).toContain('1px')
  })

  it('its smoke drifts behind it, around its feet; motion off holds one frame', () => {
    const at = { x: 180, y: 70 }
    const frame = (still: boolean, steps: number) => {
      const loop = hauntLoop(240, 160, at, 48, 52, { still })
      for (let i = 0; i < steps; i++) loop.step(i / 60, 1 / 60)
      const { g, calls } = recorder()
      loop.draw(g, steps / 60)
      return calls
    }
    const now = frame(false, 0)
    expect(now.length).toBeGreaterThan(0)
    expect(frame(false, 120)).not.toEqual(now)
    expect(frame(true, 120)).toEqual(frame(true, 0))
    // The pool and the puffs low down: within its width (and a puff), at its feet.
    const pool = frame(true, 0)
      .map((c) => c.split(',').map(Number))
      .filter(([, y]) => y! >= at.y - 4)
    expect(pool.length).toBeGreaterThan(0)
    expect(pool.every(([x, y]) => Math.abs(x! - at.x) <= 48 && y! <= at.y + 4)).toBe(true)
  })
})

describe('the nightmare’s lasting effects and the motion level', () => {
  it('follow the motion rules: a calm OS or motion off stills them, the short setting lightens them', () => {
    expect(nightmareLevel('full', false)).toBe('full')
    expect(nightmareLevel('short', false)).toBe('short')
    expect(nightmareLevel('full', true)).toBe('off')
    expect(nightmareLevel('short', true)).toBe('off')
    expect(nightmareLevel('off', false)).toBe('off')
  })
})
