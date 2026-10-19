// A wild pair's catch (docs/33): the first one K.O.'d waits worn out for the other, then a throw at each, one after the
// other; each "Add to team?" is asked on the rewards screen afterwards, in the order they were caught.
import { describe, expect, it } from 'vitest'
import type { BattleState, LogEntry } from '@/engine'
import { useGame, type CatchState, type CatchThrow } from '@/store/game'
import { finishCatch, resolveCatch } from '@/store/run'
import { describe as step, type AnimatorContext, type Fx } from '@/screens/battle/useBattleAnimator'

const st = {
  enemy: { uid: 'f1', name: 'Zigzagoon' },
  player: [],
  double: { foes: [] },
} as unknown as BattleState
const fx = { activeUid: 'a', foeUid: 'f1', fainted: {}, wornOut: {}, tray: null } as unknown as Fx
const faint: LogEntry = { kind: 'faint', side: 'enemy', uid: 'f1', dex: 263 }

describe('a wild pair K.O.', () => {
  it('a foe on offer stays worn out on the field, one not on offer faints away', () => {
    const ctx = { kind: 'wild', catchable: (uid: string) => uid === 'f1' } as unknown as AnimatorContext
    const worn = step(faint, st, ctx).apply(fx)
    expect(worn.wornOut.f1).toBe(true)
    expect(worn.fainted.f1).toBeUndefined()
    const gone = step({ ...faint, uid: 'f2' }, st, ctx).apply(fx)
    expect(gone.fainted.f2).toBe(true)
    expect(gone.wornOut.f2).toBeUndefined()
  })
})

const thrown = (pendingCatchId: string | null): CatchThrow => ({
  caught: true,
  die: 6,
  total: 6,
  need: 3,
  bonus: 0,
  ballKey: null,
  events: [],
  pendingCatchId,
})
const wild = (uid: string): CatchState => ({
  uid,
  dex: 263,
  level: 5,
  kind: 'wild',
  target: { mode: 'new' },
  result: null,
})

describe('a wild pair caught', () => {
  it('throws at the second before the rewards, then asks "Add to team?" for each in turn', () => {
    const run = useGame.getState().run
    useGame.setState({
      run: {
        ...run,
        phase: 'catch',
        events: [],
        pendingCatchId: null,
        catch: { ...wild('f1'), result: thrown('caught-1') },
        catchQueue: [wild('f2')],
        catchPending: [],
      },
    })
    finishCatch()
    let now = useGame.getState().run
    // The second throw comes straight after the first, the first catch's question held back.
    expect(now.phase).toBe('catch')
    expect(now.catch?.uid).toBe('f2')
    expect(now.pendingCatchId).toBeNull()
    useGame.setState({ run: { ...now, catch: { ...now.catch!, result: thrown('caught-2') } } })
    finishCatch()
    now = useGame.getState().run
    expect(now.phase).toBe('victory')
    expect(now.pendingCatchId).toBe('caught-1')
    resolveCatch(null)
    expect(useGame.getState().run.pendingCatchId).toBe('caught-2')
    expect(useGame.getState().run.phase).toBe('victory')
    resolveCatch(null)
    expect(useGame.getState().run.pendingCatchId).toBeNull()
  })
})
