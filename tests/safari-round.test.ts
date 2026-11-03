// The Safari's way out and its price (docs/61 §4): a player's report (2026-11-03) found no HOME on its cards and round
// after round paid by itself, ₽100 each, with no tap that named the price.
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng, emptyProgress, fleeTrick, isSafariArea, lureCfg, startTrick, type GameData } from '@/engine'
import { useGame } from '@/store/game'
import { leaveTrick, leaveTrickHome, rollNext, seedRun, startNewGame } from '@/store/run'

/** A Safari encounter just over (it ran off), in Kanto's Safari Zone, with `rounds` rounds already begun there. */
function standInSafari(rounds: number, deck: string[] = []) {
  seedRun(5)
  startNewGame(3)
  const { data, save, run } = useGame.getState()
  const on: GameData = { ...data, config: { ...data.config, safari: { ...data.config.safari, access: 'all' } } }
  const area = on.areas.find((a) => isSafariArea(a) && (a.regionId ?? 'kanto') === 'kanto')!
  const cfg = lureCfg(on, 'safari')
  const state = fleeTrick(startTrick({ dex: 113, level: 25, tier: 'veryRare' }, cfg, createRng(1), 'safari'))!
  useGame.setState({
    data: on,
    save: {
      ...save!,
      gold: 1000,
      currentAreaId: area.id,
      areaProgress: {
        ...save!.areaProgress,
        [area.id]: { ...emptyProgress(), safariRounds: rounds, deck: deck as never },
      },
    },
    run: { ...run, areaId: area.id, phase: 'trick', encounter: null, trick: { id: 1, state, last: null, caught: null } },
  })
  return area
}

describe('the Safari round (docs/61 §4)', () => {
  beforeEach(() => useGame.setState({ battle: null }))

  it("a paid round isn't begun on the way: the player waits on the area's page, the ₽ untouched", () => {
    standInSafari(1)
    leaveTrick()
    expect(useGame.getState().run.phase).toBe('idle')
    expect(useGame.getState().save!.gold).toBe(1000)
    // The player's own CONTINUE pays it.
    rollNext()
    expect(useGame.getState().run.phase).not.toBe('idle')
    expect(useGame.getState().save!.gold).toBe(900)
  })

  it('a free round still follows at once', () => {
    standInSafari(0)
    leaveTrick()
    expect(useGame.getState().run.phase).not.toBe('idle')
    expect(useGame.getState().save!.gold).toBe(1000)
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
