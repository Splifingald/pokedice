// The Safari's way out and its price (docs/61 §4): a player's report (2026-11-03) found no HOME on its cards and round
// after round paid by itself, ₽100 each, with no tap that named the price. Every round is now asked first, in a pop-up
// saying its price or that it's free, with HOME beside it.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createRng,
  emptyProgress,
  fleeTrick,
  isSafariArea,
  lureCfg,
  startTrick,
  type GameData,
} from '@/engine'
import { useGame } from '@/store/game'
import { confirmSafariRound, leaveTrick, leaveTrickHome, rollNext, seedRun, startNewGame } from '@/store/run'
import { closeSafariAsk, useSafariAsk } from '@/store/safariAsk'

/** A Safari encounter just over (it ran off), in Kanto's Safari Zone, with `rounds` rounds already begun there. */
function standInSafari(rounds: number, deck: string[] = [], gold = 1000) {
  seedRun(5)
  startNewGame(3)
  const { data, save, run } = useGame.getState()
  const on: GameData = {
    ...data,
    config: { ...data.config, safari: { ...data.config.safari, access: 'all' } },
  }
  const area = on.areas.find((a) => isSafariArea(a) && (a.regionId ?? 'kanto') === 'kanto')!
  const cfg = lureCfg(on, 'safari')
  const state = fleeTrick(startTrick({ dex: 113, level: 25, tier: 'veryRare' }, cfg, createRng(1), 'safari'))!
  useGame.setState({
    data: on,
    save: {
      ...save!,
      gold,
      currentAreaId: area.id,
      areaProgress: {
        ...save!.areaProgress,
        [area.id]: { ...emptyProgress(), safariRounds: rounds, deck: deck as never },
      },
    },
    run: {
      ...run,
      areaId: area.id,
      phase: 'trick',
      encounter: null,
      trick: { id: 1, state, last: null, caught: null },
    },
  })
  return area
}

describe('the Safari round (docs/61 §4)', () => {
  beforeEach(() => {
    useGame.setState({ battle: null })
    closeSafariAsk()
  })
  const ask = () => useSafariAsk.getState().ask
  const phase = () => useGame.getState().run.phase
  const gold = () => useGame.getState().save!.gold

  it('a paid round is asked first, over the area: nothing paid until the pop-up says yes', () => {
    const area = standInSafari(1)
    leaveTrick()
    expect(phase()).toBe('idle')
    expect(gold()).toBe(1000)
    expect(ask()).toEqual({ areaId: area.id, price: 100, next: 100 })
    confirmSafariRound()
    expect(phase()).not.toBe('idle')
    expect(gold()).toBe(900)
    expect(ask()).toBeNull()
  })

  it("Home's CONTINUE asks too: the round is begun only by the pop-up's button", () => {
    const area = standInSafari(1)
    leaveTrickHome()
    rollNext()
    expect(phase()).toBe('idle')
    expect(gold()).toBe(1000)
    expect(ask()?.price).toBe(100)
    // Asked again (the autopilot, a second tap): still one question, nothing paid.
    rollNext()
    expect(gold()).toBe(1000)
    expect(useGame.getState().save!.areaProgress[area.id]!.safariRounds).toBe(1)
  })

  it('the free round is asked as free, saying what the next ones cost', () => {
    const area = standInSafari(0)
    leaveTrick()
    expect(phase()).toBe('idle')
    expect(ask()).toEqual({ areaId: area.id, price: 0, next: 100 })
    confirmSafariRound()
    expect(phase()).not.toBe('idle')
    expect(gold()).toBe(1000)
    expect(useGame.getState().save!.areaProgress[area.id]!.safariRounds).toBe(1)
  })

  it('too few ₽: the yes begins nothing', () => {
    standInSafari(1, [], 40)
    leaveTrick()
    expect(ask()?.price).toBe(100)
    confirmSafariRound()
    expect(phase()).toBe('idle')
    expect(gold()).toBe(40)
  })

  it('mid-round, no question: the round is already paid', () => {
    standInSafari(1, ['wild', 'wild'])
    leaveTrick()
    expect(ask()).toBeNull()
    expect(phase()).not.toBe('idle')
  })

  it('HOME on the result card deals no card, mid-round or not', () => {
    const area = standInSafari(1, ['wild', 'wild'])
    leaveTrickHome()
    const { run, save } = useGame.getState()
    expect(run.phase).toBe('idle')
    expect(run.trick).toBeNull()
    expect(save!.gold).toBe(1000)
    expect(save!.areaProgress[area.id]!.deck).toHaveLength(2)
  })
})
