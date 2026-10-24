// How to play's animated cards (docs/38 §8b): the fight they show is the engine's (a real pair, its bonus from the
// config, a catch the ball makes), and the clock they run on loops with a pause, plays once on PLAY, shows the end at
// once with animations off, and never flashes more than 3 times a second.
import { describe, expect, it } from 'vitest'
import { comboBonus } from '@/engine'
import {
  clockStep,
  FLASH_MS,
  FLASHES_MS,
  LOOP_PAUSE_MS,
  makeDemo,
  REROLLED,
  startClock,
  stepTo,
  TICK_MS,
  whiteAt,
  type Clock,
} from '@/screens/help/howTo'
import { data } from './fixtures'

describe('the fight the cards show', () => {
  const demo = makeDemo(data)!

  it('throws the Pokémon’s own dice, and the reroll makes a pair worth its level-1 bonus', () => {
    expect(demo.first.map((d) => d.type)).toEqual(demo.me.dice.slice(0, 3))
    const value = (d: (typeof demo.first)[number]) => d.face.value
    expect(value(demo.first[REROLLED]!)).not.toBe(value(demo.first[0]!))
    expect(value(demo.after[REROLLED]!)).toBe(value(demo.after[0]!))
    expect(demo.hit.combo?.key).toBe('pair')
    expect(demo.hit.combo?.bonus).toBe(comboBonus('pair', 1, data))
    expect(demo.ring).toEqual([0, REROLLED])
  })

  it('shows the damage the engine deals, and leaves the foe standing', () => {
    expect(demo.hit.final).toBeGreaterThan(0)
    expect(demo.hit.final).toBeLessThan(demo.foe.maxHp)
  })

  it('catches with the ball’s help: the die alone would miss', () => {
    const r = demo.catchRoll!
    expect(r.die + r.bonus).toBeGreaterThanOrEqual(r.need)
    expect(r.die).toBeLessThan(r.need)
    expect(r.die).toBeGreaterThanOrEqual(1)
  })
})

const run = (c: Clock, n: number, length: number, loop: boolean) => {
  for (let i = 0; i < n; i++) c = clockStep(c, { kind: 'tick', length, loop })
  return c
}

describe('the cards’ clock', () => {
  it('loops: it steps in ticks, rests on its last frame, then starts over on a new round', () => {
    const c = startClock('loop', 0)
    expect(run(c, 3, 1000, true)).toMatchObject({ t: 3 * TICK_MS, round: 0, running: true })
    const end = (1000 + LOOP_PAUSE_MS) / TICK_MS
    expect(run(c, end - 1, 1000, true).t).toBe(1000 + LOOP_PAUSE_MS - TICK_MS)
    expect(run(c, end, 1000, true)).toMatchObject({ t: 0, round: 1, running: true })
  })

  it('a still waits on its key moment; PLAY plays it once and stays on the end', () => {
    const c = startClock('still', 600)
    expect(c).toMatchObject({ t: 600, running: false })
    expect(run(c, 10, 1000, false)).toEqual(c)
    const played = clockStep(c, { kind: 'play', length: 1000, off: false })
    expect(played).toMatchObject({ t: 0, round: 1, running: true })
    expect(run(played, 100, 1000, false)).toMatchObject({ t: 1000, running: false })
  })

  it('with animations off, PLAY shows the end at once', () => {
    const c = clockStep(startClock('off', 600), { kind: 'play', length: 1000, off: true })
    expect(c).toMatchObject({ t: 1000, running: false })
  })

  it('a new motion level starts the card over the way it now runs', () => {
    const c = clockStep(startClock('loop', 0), { kind: 'reset', mode: 'still', still: 600 })
    expect(c).toMatchObject({ t: 600, running: false, round: 1 })
  })

  it('a hit is two white frames, never more than 3 flashes a second', () => {
    const frames = Array.from({ length: 40 }, (_, i) => whiteAt(1000 + i * TICK_MS, 1000))
    const onsets = frames.flatMap((w, i) => (w && !frames[i - 1] ? [i * TICK_MS] : []))
    expect(onsets).toHaveLength(2)
    expect(onsets[1]! - onsets[0]!).toBeGreaterThanOrEqual(1000 / 3)
    expect(FLASHES_MS).toHaveLength(2)
    expect(FLASH_MS).toBeLessThan(FLASHES_MS[1] - FLASHES_MS[0])
  })

  it('moves in steps on the 2 px grid, from its start to its end', () => {
    const xs = [0, 100, 150, 200, 250, 300, 400].map((t) => stepTo(t, 100, 300, 11, 51))
    expect(xs[0]).toBe(12)
    expect(xs.at(-1)).toBe(52)
    expect(xs.every((x) => x % 2 === 0)).toBe(true)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })
})
