// The battle log with the game-feel pass (docs/38): a hit carries how hard it lands to the stage and how it sounds when
// it lands (B2: with a scene too), the foe pauses less between rerolls, and a K.O. is heard — a sting when it opens the
// catch, the fainting Pokémon's cry slower and lower. Without the pass, every step is as it was.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattleState, DamageResult, LogEntry } from '@/engine'

const sounds = vi.hoisted(() => ({
  sfx: [] as string[],
  feel: [] as string[],
  cries: [] as unknown[],
  buzz: [] as string[],
}))
vi.mock('@/audio/sfx', async (orig) => ({
  ...(await orig<typeof import('@/audio/sfx')>()),
  sfx: (n: string) => sounds.sfx.push(n),
}))
vi.mock('@/audio/feel', () => ({ feelSound: (n: string) => sounds.feel.push(n) }))
vi.mock('@/audio/cries', async (orig) => ({
  ...(await orig<typeof import('@/audio/cries')>()),
  playCry: (dex: number, o: unknown) => sounds.cries.push([dex, o]),
}))
vi.mock('@/lib/haptics', () => ({ haptic: (c: string) => sounds.buzz.push(c) }))

const {
  describe: step,
  landHit,
  finalBlow,
  FOE_REROLL_FEEL_MS,
  FOE_REROLL_MS,
} = await import('@/screens/battle/useBattleAnimator')
import type { AnimatorContext } from '@/screens/battle/useBattleAnimator'

const foe = { uid: 'enemy', name: 'Gyarados', maxHp: 100, dex: 130 }
const mine = { uid: 'mine', name: 'Pikachu', maxHp: 50, dex: 25 }
const st = { enemy: foe, player: [mine] } as unknown as BattleState
const ctx = (o: Partial<AnimatorContext> = {}) =>
  ({ kind: 'wild', trainerName: null, catchable: false, ...o }) as AnimatorContext

const result = (effectiveness: number, combo: string | null = null) =>
  ({
    perDie: [{ type: 'electric', value: 6, bonus: 0, multiplier: effectiveness, damage: 6 }],
    combo: combo ? { key: combo } : null,
    attackType: 'electric',
    raw: 0,
    final: 0,
    immune: effectiveness === 0,
    effectiveness,
  }) as unknown as DamageResult
const hit = (amount: number, hpAfter: number, effectiveness = 1, combo: string | null = null): LogEntry => ({
  kind: 'damage',
  side: 'player',
  target: 'enemy',
  targetUid: 'enemy',
  amount,
  hpAfter,
  dice: [],
  result: result(effectiveness, combo),
})

beforeEach(() => {
  sounds.sfx.length = 0
  sounds.feel.length = 0
  sounds.cries.length = 0
  sounds.buzz.length = 0
})

describe('a hit, read for the stage', () => {
  it('carries its weight and its old sound to the scene', () => {
    const s = step(hit(60, 40, 2, 'full_house'), st, ctx())
    expect(s.scene?.hit).toMatchObject({
      tone: 'super',
      sound: 'super',
      power: { tier: 3, super: true, ko: false },
    })
    expect(s.hit).toBe(s.scene?.hit)
    // The no-scene path keeps its sound.
    expect(s.sound).toBe('super')
  })

  it('knows the final blow, and a resisted scratch', () => {
    expect(step(hit(40, 0), st, ctx()).scene?.hit?.power.ko).toBe(true)
    expect(step(hit(1, 99, 0.5), st, ctx()).scene?.hit).toMatchObject({
      tone: 'weak',
      sound: 'hit',
      power: { tier: 0 },
    })
  })

  it('no effect: no scene, no hit', () => {
    const s = step(hit(0, 100, 0), st, ctx())
    expect(s.scene).toBeUndefined()
    expect(s.hit).toBeUndefined()
    expect(s.sound).toBe('error')
  })
})

describe('landing a hit (B2: heard with a scene too)', () => {
  it('without the pass: the old sounds', () => {
    landHit(step(hit(60, 40, 2), st, ctx()).hit!, false)
    landHit(step(hit(1, 99, 0.5), st, ctx()).hit!, false)
    landHit(step(hit(10, 90), st, ctx()).hit!, false)
    expect(sounds.sfx).toEqual(['super', 'hit', 'hit'])
    expect(sounds.feel).toEqual([])
  })

  it('with it: super effective and resisted have their own; a vibration by weight', () => {
    landHit(step(hit(60, 40, 2, 'full_house'), st, ctx()).hit!, true)
    landHit(step(hit(1, 99, 0.5), st, ctx()).hit!, true)
    landHit(step(hit(10, 90), st, ctx()).hit!, true)
    expect(sounds.feel).toEqual(['hit.super', 'hit.resisted'])
    expect(sounds.sfx).toEqual(['hit'])
    expect(sounds.buzz).toEqual(['hit3', 'hit1', 'hit1'])
  })

  it('the final blow thuds and buzzes', () => {
    finalBlow()
    expect(sounds.feel).toEqual(['hit.ko'])
    expect(sounds.buzz).toEqual(['ko'])
  })
})

describe('the pace and the K.O.', () => {
  const reroll = (side: 'player' | 'enemy'): LogEntry => ({
    kind: 'reroll',
    side,
    mask: [true],
    dice: [],
    rerollsLeft: 0,
  })

  it("the foe's reroll pause is shorter with the pass; yours never changes", () => {
    expect(step(reroll('enemy'), st, ctx()).delay).toBe(FOE_REROLL_MS)
    expect(step(reroll('enemy'), st, ctx({ feel: true })).delay).toBe(FOE_REROLL_FEEL_MS)
    expect(step(reroll('player'), st, ctx({ feel: true })).delay).toBe(FOE_REROLL_MS)
    expect(FOE_REROLL_FEEL_MS).toBeLessThan(FOE_REROLL_MS)
  })

  it('a K.O. that opens the catch stings; one that faints cries slower and lower; none of it without the pass', () => {
    const faint: LogEntry = { kind: 'faint', side: 'enemy', uid: 'enemy', dex: 130 }
    step(faint, st, ctx({ catchable: true })).effect?.()
    step(faint, st, ctx()).effect?.()
    expect(sounds.feel).toEqual([])
    expect(sounds.cries).toEqual([])
    step(faint, st, ctx({ catchable: true, feel: true })).effect?.()
    expect(sounds.feel).toEqual(['ko.sting'])
    step(faint, st, ctx({ feel: true })).effect?.()
    expect(sounds.cries).toEqual([[130, { rate: 0.75 }]])
  })
})
