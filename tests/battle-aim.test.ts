// A double battle's new target (docs/33): the foe in front changes, the dice on the tray don't roll again.
import { describe, expect, it } from 'vitest'
import type { BattleState, LogEntry } from '@/engine'
import { describe as step, type AnimatorContext, type Fx } from '@/screens/battle/useBattleAnimator'

const st = { enemy: { uid: 'enemy' }, player: [] } as unknown as BattleState
const ctx = {} as AnimatorContext
const tray: Fx['tray'] = { side: 'player', dice: [], keys: ['r1-0', 'r2-1'] }
const fx = { activeUid: 'a', foeUid: 'enemy', tray } as Fx
const play = (e: LogEntry) => {
  const s = step(e, st, ctx)
  return { delay: s.delay, fx: s.apply(fx) }
}

describe('a new target', () => {
  it('swaps the foe in front at once and keeps the dice on the tray', () => {
    const { delay, fx: after } = play({ kind: 'focus', own: 'a', foe: 'enemy-1', aim: true })
    expect(delay).toBe(0)
    expect(after.foeUid).toBe('enemy-1')
    expect(after.activeUid).toBe('a')
    expect(after.tray).toBe(tray)
  })

  it('the pair moving for the next turn clears the tray', () => {
    const { fx: after } = play({ kind: 'focus', own: 'b', foe: 'enemy-1' })
    expect(after.activeUid).toBe('b')
    expect(after.tray).toBeNull()
  })
})
