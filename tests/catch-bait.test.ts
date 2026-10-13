// The catch's Bait and Capture Luck (docs/25), through the store actions the catch panel calls.
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, newSave, type SaveData } from '@/engine'
import { initialRun, useGame, type CatchState } from '@/store/game'
import { answerBait, finishCatch, retryCatch, seedRun, throwBall } from '@/store/run'
import { makeData, newId } from './fixtures'

const on = makeData({
  itemSwitches: { 'link-cable': 'all', bait: 'all' },
  general: { ...DEFAULT_CONFIG.general, access: 'all' },
})
// Snorlax: hard to catch, so a Poké Ball often falls short.
const DEX = 143
const wild: CatchState = { dex: DEX, level: 30, kind: 'wild', target: { mode: 'new' }, result: null }

function setup(save: Partial<SaveData>, c: CatchState = wild, data = on) {
  const base = newSave(4, data, 0, newId)
  useGame.setState({
    data,
    save: { ...base, ...save },
    battle: null,
    run: { ...initialRun(), phase: 'catch', catch: c },
  })
}

/** Throws a Poké Ball with seeds in turn until `want` says the throw is the one to look at. */
function throwUntil(
  want: (c: CatchState) => boolean,
  save: Partial<SaveData>,
  c: CatchState = wild,
  data = on,
) {
  for (let seed = 1; seed < 500; seed++) {
    setup(save, c, data)
    seedRun(seed)
    throwBall('poke-ball')
    const now = useGame.getState().run.catch!
    if (want(now)) return now
  }
  throw new Error('no seed gave that throw')
}

beforeEach(() => useGame.setState({ data: on }))

describe('the Bait', () => {
  it('a throw that falls short with a Bait that could make it asks first; Throw adds its die', () => {
    const c = throwUntil((c) => !!c.result?.baitOffer, { inventory: { 'poke-ball': 5, bait: 2 } })
    const asked = c.result!
    expect(asked.baitOffer).toBe('bait')
    expect(asked.caught).toBe(false)
    expect(asked.events).toEqual([])
    // The ball is spent, the Bait not yet; nothing can leave the throw while it asks.
    expect(useGame.getState().save!.inventory['poke-ball']).toBe(4)
    expect(useGame.getState().save!.inventory.bait).toBe(2)
    finishCatch()
    expect(useGame.getState().run.phase).toBe('catch')
    answerBait(true)
    const r = useGame.getState().run.catch!.result!
    expect(r.baitOffer).toBeUndefined()
    expect(r.baited).toBe('used')
    expect([1, 2, 3]).toContain(r.bait)
    expect(r.total).toBe(asked.total + r.bait!)
    expect(r.caught).toBe(r.total >= r.need)
    expect(useGame.getState().save!.inventory.bait).toBe(1)
    if (r.caught) expect(useGame.getState().save!.pokedex).toContain(DEX)
  })

  it('Keep it: the throw stands, the Bait stays in the bag', () => {
    throwUntil((c) => !!c.result?.baitOffer, { inventory: { 'poke-ball': 5, bait: 1 } })
    answerBait(false)
    const r = useGame.getState().run.catch!.result!
    expect(r.baited).toBe('kept')
    expect(r.caught).toBe(false)
    expect(useGame.getState().save!.inventory.bait).toBe(1)
    expect(r.events).toEqual([{ kind: 'fled', dex: DEX }])
  })

  it('no Bait in the bag, or switched off: the throw ends as before', () => {
    // Short by 1 or 2: a Bait would have been offered.
    const near = (c: CatchState) => !!c.result && !c.result.caught && c.result.need - c.result.total <= 2
    const none = throwUntil(near, { inventory: { 'poke-ball': 5 } })
    expect(none.result!.baitOffer).toBeUndefined()
    const off = throwUntil(near, { inventory: { 'poke-ball': 5, bait: 3 } }, wild, makeData())
    expect(off.result!.baitOffer).toBeUndefined()
    expect(off.result!.events).toEqual([{ kind: 'fled', dex: DEX }])
  })
})

describe('Capture Luck', () => {
  it('at 100 %, a wild one that broke free stays once: one more throw, then a miss is a miss', () => {
    const lucky = { inventory: { 'poke-ball': 9 }, general: { luck: 10 } }
    const c = throwUntil((c) => !!c.result && !c.result.caught, lucky)
    expect(c.result!.stays).toBe(true)
    expect(c.result!.events).toEqual([])
    finishCatch()
    expect(useGame.getState().run.phase).toBe('catch')
    retryCatch()
    const again = useGame.getState().run.catch!
    expect(again.retried).toBe(true)
    expect(again.result).toBeNull()
    // The second throw: it can't stay again.
    for (let seed = 1; seed < 500; seed++) {
      useGame.setState((s) => ({ run: { ...s.run, catch: again } }))
      seedRun(seed)
      throwBall('poke-ball')
      const r = useGame.getState().run.catch!.result!
      if (r.caught) continue
      expect(r.stays).toBeUndefined()
      expect(r.events).toEqual([{ kind: 'fled', dex: DEX }])
      return
    }
    throw new Error('never missed')
  })

  it('never for a legendary, nor without the upgrade', () => {
    const boss = throwUntil(
      (c) => !!c.result && !c.result.caught,
      { inventory: { 'poke-ball': 9 }, general: { luck: 10 } },
      {
        ...wild,
        kind: 'boss',
      },
    )
    expect(boss.result!.stays).toBeUndefined()
    const plain = throwUntil((c) => !!c.result && !c.result.caught, { inventory: { 'poke-ball': 9 } })
    expect(plain.result!.stays).toBeUndefined()
  })
})
