// The rework's send-out step (docs/15 §6): a fight starts at once, the foe out and the player's pick waiting. Nothing
// is settled until a Pokémon goes out: NOT YET leaves the challenge as it was, GO! sends the one picked.
import { beforeEach, describe, expect, it } from 'vitest'
import { progressOf, teamOf, type PokemonInstance } from '@/engine'
import { useGame } from '@/store/game'
import { enterArea, notYet, replaceSave, rollNext, seedRun, sendOutLead, setForceNext, startNewGame } from '@/store/run'

/** A new game with three Pokémon, standing in the first area with a gym (every area before it cleared). */
function gymArea() {
  seedRun(7)
  startNewGame(1)
  const { save, data } = useGame.getState()
  const at = data.areas.findIndex((a) => a.gyms?.length)
  const area = data.areas[at]!
  const mons: PokemonInstance[] = [1, 25, 16].map((dex, i) => ({
    id: `so-${i}`,
    dex,
    level: 20,
    xp: 0,
    currentHp: 999,
    caughtAt: 0,
  }))
  const areaProgress = Object.fromEntries(
    data.areas.slice(0, at).map((a) => [
      a.id,
      { roundsDone: a.roundsToClear || 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] },
    ]),
  )
  replaceSave({ ...save!, box: mons, team: mons.map((m) => m.id), areaProgress, currentAreaId: area.id })
  expect(enterArea(area.id)).toBe(true)
  return area
}

describe('the send-out step', () => {
  beforeEach(() => setForceNext(null))

  it('a gym starts with the foe out and the pick waiting; NOT YET settles nothing', () => {
    const area = gymArea()
    const before = progressOf(useGame.getState().save!, area.id)
    setForceNext('gym')
    rollNext()
    const { run, battle } = useGame.getState()
    expect(run.encounter?.kind).toBe('gym')
    expect(run.phase).toBe('battle')
    expect(run.pickLead).toBe(true)
    expect(battle).not.toBeNull()
    notYet()
    const after = useGame.getState()
    expect(after.run.phase).toBe('idle')
    expect(after.battle).toBeNull()
    expect(after.run.pickLead).toBe(false)
    // The challenge wasn't fought: the area's record is as it was.
    expect(progressOf(after.save!, area.id)).toEqual(before)
  })

  it('GO! sends the one picked, in the same fight', () => {
    gymArea()
    setForceNext('gym')
    rollNext()
    const pick = teamOf(useGame.getState().save!)[1]!.id
    sendOutLead(pick)
    const { run, battle } = useGame.getState()
    expect(run.pickLead).toBe(false)
    expect(run.phase).toBe('battle')
    expect(battle!.state.player[battle!.state.activeIndex]!.uid).toBe(pick)
    expect(battle!.sendLater).toBe(true)
  })

  it('the lead as picked: the fight goes on as it was dealt', () => {
    gymArea()
    setForceNext('gym')
    rollNext()
    const before = useGame.getState().battle!
    const lead = before.state.player[before.state.activeIndex]!.uid
    sendOutLead(lead)
    const { battle, run } = useGame.getState()
    expect(run.pickLead).toBe(false)
    expect(battle!.id).toBe(before.id)
  })
})
