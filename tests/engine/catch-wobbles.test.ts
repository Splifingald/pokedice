// The ball's wobbles (docs/38 B5): a catch wobbles three times, a miss fewer the further it fell short, so the third
// wobble no longer gives the result away.
import { describe, expect, it } from 'vitest'
import { BAIT_WOBBLES, CATCH_WOBBLES, catchShakes, catchWobbles, type CatchRoll } from '@/engine'

const roll = (total: number, need: number, extra: Partial<CatchRoll> = {}): CatchRoll => ({
  die: total,
  bonus: 0,
  total,
  need,
  caught: total >= need,
  ...extra,
})

describe('catchWobbles', () => {
  it('a catch wobbles every time, however it got there', () => {
    expect(catchWobbles(roll(7, 7))).toBe(CATCH_WOBBLES)
    expect(catchWobbles(roll(9, 4))).toBe(CATCH_WOBBLES)
  })

  it('a miss wobbles 3, 2, 1, then 0 times as it falls 1, 2, 3, 4+ short', () => {
    expect([6, 5, 4, 3, 1].map((t) => catchWobbles(roll(t, 7)))).toEqual([3, 2, 1, 0, 0])
  })

  it('so a third wobble is a catch or a miss by one: never the result itself', () => {
    expect(catchWobbles(roll(6, 7))).toBe(catchWobbles(roll(7, 7)))
  })

  it('takes a smaller ceiling (the Bait’s last wobbles)', () => {
    expect([7, 6, 5, 4].map((t) => catchWobbles(roll(t, 7), 2))).toEqual([2, 2, 1, 0])
  })
})

describe('catchShakes', () => {
  it('a throw without a Bait: its own wobbles, none after', () => {
    expect(catchShakes(roll(5, 7))).toEqual({ throw: 2, bait: 0 })
    expect(catchShakes(roll(8, 7))).toEqual({ throw: 3, bait: 0 })
  })

  it('a Bait thrown: the ball’s wobbles from the throw alone, then the Bait’s by its own result', () => {
    // 4 + 1 = 5 < 7 (2 wobbles), then the Bait's +2 makes 7: caught.
    expect(catchShakes(roll(7, 7, { die: 4, bonus: 1, bait: 2 }))).toEqual({ throw: 2, bait: BAIT_WOBBLES })
    // 5 < 7, the Bait's +1 makes 6: one short, both last wobbles.
    expect(catchShakes(roll(6, 7, { bait: 1, caught: false }))).toEqual({ throw: 2, bait: 2 })
    // 4 < 7 (1 wobble), the Bait's +1 makes 5: two short, one last wobble.
    expect(catchShakes(roll(5, 7, { bait: 1, caught: false }))).toEqual({ throw: 1, bait: 1 })
  })
})
