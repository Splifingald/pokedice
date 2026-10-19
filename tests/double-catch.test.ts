// A wild pair's catch (docs/33): the first one K.O.'d waits worn out for the other, then a throw at each, one after the
// other; each "Add to team?" is asked on the rewards screen afterwards, in the order they were caught. A pair of one
// species: the second throw's target is the save as the first left it (one copy per species).
import { describe, expect, it } from 'vitest'
import { createInstance, type BattleState, type LogEntry } from '@/engine'
import { useGame, type CatchState, type CatchThrow } from '@/store/game'
import { finishCatch, resolveCatch, startNewGame } from '@/store/run'
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

describe('a wild pair of one species', () => {
  const PIDGEY = 16
  const pidgey = (uid: string, level: number): CatchState => ({ ...wild(uid), dex: PIDGEY, level })
  /** A new game with the first Pidgey of the pair just caught (or not), and the second one's throw next. */
  function firstThrown(caught: boolean, second: number) {
    startNewGame(1)
    const { save, data, run } = useGame.getState()
    const first = createInstance(PIDGEY, 3, data, 'pidgey-1', 0)
    useGame.setState({
      save: caught ? { ...save!, box: [...save!.box, first], pokedex: [...save!.pokedex, PIDGEY] } : save,
      run: {
        ...run,
        phase: 'catch',
        events: [],
        pendingCatchId: null,
        catch: { ...pidgey('f1', 3), result: caught ? thrown('pidgey-1') : { ...thrown(null), caught: false } },
        // Its target was worked out before the first throw: a Pidgey not owned yet.
        catchQueue: [pidgey('f2', second)],
        catchPending: [],
      },
    })
  }

  it('a stronger second one replaces the first just caught: one Pidgey, one question', () => {
    firstThrown(true, 5)
    finishCatch()
    const now = useGame.getState().run
    expect(now.catch?.uid).toBe('f2')
    expect(now.catch?.target).toEqual({ mode: 'replace', uid: 'pidgey-1', level: 3 })
  })

  it('a second one no stronger is not on offer: straight to the rewards, the first one asked about', () => {
    firstThrown(true, 3)
    finishCatch()
    const now = useGame.getState().run
    expect(now.phase).toBe('victory')
    expect(now.catch).toBeNull()
    expect(now.pendingCatchId).toBe('pidgey-1')
  })

  it('the first one got away: the second is still a new catch', () => {
    firstThrown(false, 2)
    finishCatch()
    const now = useGame.getState().run
    expect(now.catch?.uid).toBe('f2')
    expect(now.catch?.target).toEqual({ mode: 'new' })
  })
})
