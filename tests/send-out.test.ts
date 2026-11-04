// The rework's send-out step (docs/15 §6): a fight starts at once, the foe out and the player's pick waiting. Nothing
// is settled until a Pokémon goes out: NOT YET leaves the challenge as it was, GO! sends the one picked.
import { beforeEach, describe, expect, it } from 'vitest'
import { autoStep, createRng, progressOf, teamOf, type BattleEvent, type PokemonInstance } from '@/engine'
import { useGame } from '@/store/game'
import {
  dispatchBattle,
  enterArea,
  notYet,
  replaceSave,
  rollNext,
  seedRun,
  sendNextFoe,
  sendOutLead,
  setForceNext,
  startNewGame,
} from '@/store/run'

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

/** The engine's auto-player through the store, until the fight in front is over. */
function playBattle() {
  const rng = createRng(5)
  for (let i = 0; i < 5000; i++) {
    const b = useGame.getState().battle
    if (!b || ['won', 'lost', 'fled'].includes(b.state.phase)) return
    const step = autoStep(b.state, useGame.getState().data, rng)
    const e: BattleEvent =
      b.state.phase === 'enemy_turn'
        ? { t: 'AI_TURN' }
        : b.state.phase === 'player_stunned'
          ? { t: 'PASS' }
          : b.state.phase === 'player_roll'
            ? { t: 'ROLL' }
            : b.state.phase === 'player_switch'
              ? { t: 'SWITCH', instanceId: step.state.player[step.state.activeIndex]!.uid }
              : { t: 'ATTACK' }
    dispatchBattle(e)
  }
  throw new Error('battle did not finish')
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

  it("a trainer's next Pokémon comes straight into the fight, the pick yours; the ₽ and the rewards wait for the last one", () => {
    gymArea()
    setForceNext('gym')
    rollNext()
    const enc = useGame.getState().run.encounter
    if (enc?.kind !== 'gym') throw new Error('no gym')
    expect(enc.team.length).toBeGreaterThan(1)
    const lead = useGame.getState().battle!.state.player[0]!.uid
    sendOutLead(lead)
    const gold = useGame.getState().save!.gold
    playBattle()
    let { run, battle } = useGame.getState()
    expect(run.phase).toBe('victory')
    expect(run.events.some((e) => e.kind === 'gold')).toBe(false)
    expect(useGame.getState().save!.gold).toBe(gold)
    expect(run.trainer!.owed!.amount).toBeGreaterThan(0)
    const fought = battle!.state.player[battle!.state.activeIndex]!
    sendNextFoe()
    ;({ run, battle } = useGame.getState())
    expect(run.phase).toBe('battle')
    expect(run.trainer!.index).toBe(1)
    // The send-out step either way: yours that fought still out and picked, another tapped goes instead.
    expect(run.pickLead).toBe(true)
    if (fought.hp > 0) {
      expect(battle!.next).toBe('stay')
      expect(battle!.state.player[battle!.state.activeIndex]!.uid).toBe(fought.uid)
      const other = teamOf(useGame.getState().save!).find((p) => p.currentHp > 0 && p.id !== fought.uid)!.id
      const id = battle!.id
      sendOutLead(other)
      ;({ run, battle } = useGame.getState())
      expect(battle!.id).not.toBe(id)
      expect(battle!.next).toBe('go')
      expect(battle!.state.player[battle!.state.activeIndex]!.uid).toBe(other)
      // Still their second Pokémon, nothing settled again.
      expect(run.trainer!.index).toBe(1)
    } else sendOutLead(teamOf(useGame.getState().save!).find((p) => p.currentHp > 0)!.id)
    for (let i = 1; i < enc.team.length; i++) {
      playBattle()
      if (useGame.getState().run.phase !== 'victory') break
      if (i < enc.team.length - 1) {
        sendNextFoe()
        const b = useGame.getState().battle!
        sendOutLead(b.state.player[b.state.activeIndex]!.uid)
      }
    }
    ;({ run } = useGame.getState())
    expect(run.phase).toBe('victory')
    const paid = run.events.filter((e) => e.kind === 'gold')
    expect(paid).toHaveLength(1)
    expect(useGame.getState().save!.gold - gold).toBe(paid[0]!.kind === 'gold' ? paid[0]!.amount : -1)
    // Every K.O.'s XP on the one card.
    expect(run.events.filter((e) => e.kind === 'xp' && !e.shared).length).toBeGreaterThanOrEqual(enc.team.length)
  })
})
