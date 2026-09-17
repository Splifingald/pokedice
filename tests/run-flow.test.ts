// Headless end-to-end: a fresh save played from area 1 to unlocking area 2 purely through store actions.
import { describe, expect, it } from 'vitest'
import { autoStep, createRng, instanceMaxHp, isAreaUnlocked, progressOf, teamOf, type BattleEvent } from '@/engine'
import { useGame } from '@/store/game'
import {
  afterWipe,
  continueAfterVictory,
  dispatchBattle,
  engage,
  enterArea,
  finishCatch,
  finishCenter,
  throwBall,
  resolveCatch,
  rollNext,
  seedRun,
  skipEncounter,
  startNewGame,
  canSkipCurrent,
} from '@/store/run'

/** Turn the engine's auto-player into store dispatches (the UI does the same thing with clicks). */
function playBattle() {
  const rng = createRng(99)
  for (let i = 0; i < 5000; i++) {
    const b = useGame.getState().battle
    if (!b || ['won', 'lost', 'fled'].includes(b.state.phase)) return
    const before = b.state
    const step = autoStep(before, useGame.getState().data, rng)
    // Replay the auto-player's choice through the store so rewards/persistence run.
    const e: BattleEvent =
      before.phase === 'enemy_turn'
        ? { t: 'AI_TURN' }
        : before.phase === 'player_stunned'
          ? { t: 'PASS' }
        : before.phase === 'player_roll'
          ? { t: 'ROLL' }
          : before.phase === 'player_switch'
            ? { t: 'SWITCH', instanceId: step.state.player[step.state.activeIndex]!.uid }
            : step.log.some((l) => l.kind === 'reroll')
              ? { t: 'REROLL' }
              : { t: 'ATTACK' }
    if (e.t === 'REROLL') {
      const mask = (step.log.find((l) => l.kind === 'reroll') as { mask: boolean[] }).mask
      mask.forEach((m, idx) => m && dispatchBattle({ t: 'TOGGLE_DIE', i: idx }))
    }
    dispatchBattle(e)
  }
  throw new Error('battle did not finish')
}

describe('run flow', () => {
  it('plays area 1 to unlocking area 2', () => {
    seedRun(2024)
    startNewGame(7)
    const { data } = useGame.getState()
    const [a1, a2] = data.areas
    expect(enterArea(a2!.id)).toBe(false) // locked
    expect(enterArea(a1!.id)).toBe(true)

    let battles = 0
    let wipes = 0
    for (let step = 0; step < 3000 && !isAreaUnlocked(useGame.getState().save!, a2!.id, data); step++) {
      const { run } = useGame.getState()
      if (run.phase === 'idle') rollNext()
      else if (run.phase === 'preview') {
        if (canSkipCurrent() && run.encounter?.kind === 'wild' && run.encounter.level > 4 && step % 3 === 0) skipEncounter()
        else engage()
      } else if (run.phase === 'battle') {
        battles++
        playBattle()
      } else if (run.phase === 'catch') {
        // Throw with a Poké Ball while the starter kit lasts, bare-handed after that.
        if (!run.catch?.result) throwBall((useGame.getState().save!.inventory['poke-ball'] ?? 0) > 0 ? 'poke-ball' : null)
        else finishCatch()
      } else if (run.phase === 'victory') {
        if (run.pendingCatchId) resolveCatch(null)
        continueAfterVictory()
      } else if (run.phase === 'center') finishCenter()
      else if (run.phase === 'wipe') {
        wipes++
        afterWipe()
      } else if (run.phase === 'stalemate') throw new Error('unexpected stalemate')
    }
    const save = useGame.getState().save!
    expect(isAreaUnlocked(save, a2!.id, data)).toBe(true)
    expect(progressOf(save, a1!.id).cleared).toBe(true)
    expect(save.pokedex.length).toBeGreaterThan(1)
    expect(teamOf(save).length).toBeGreaterThan(1)
    expect(battles).toBeGreaterThanOrEqual(5)
    // every Pokémon's HP stays within bounds
    for (const p of save.box) {
      expect(p.currentHp).toBeGreaterThanOrEqual(0)
      expect(p.currentHp).toBeLessThanOrEqual(instanceMaxHp(p, data))
    }
    expect(wipes).toBeGreaterThanOrEqual(0)
  })

  it('fleeing goes back to the area screen instead of dealing the next encounter', () => {
    seedRun(11)
    startNewGame(4)
    const { data } = useGame.getState()
    data.config.noEscape = false
    try {
      enterArea(data.areas[0]!.id)
      for (let i = 0; i < 50 && useGame.getState().run.encounter?.kind !== 'wild'; i++) {
        rollNext()
        const kind = useGame.getState().run.encounter?.kind
        if (kind === 'center') {
          engage()
          finishCenter()
        } else if (kind !== 'wild') useGame.setState((s) => ({ run: { ...s.run, phase: 'idle', encounter: null } }))
      }
      expect(canSkipCurrent()).toBe(true)
      skipEncounter()
      expect(useGame.getState().run).toMatchObject({ phase: 'idle', encounter: null })
    } finally {
      data.config.noEscape = true
    }
  })

  it('a wipe loses the round: the gauge goes back to the round start, gold kept, team healed', () => {
    seedRun(7)
    startNewGame(1)
    const { data } = useGame.getState()
    const a1 = data.areas[0]!
    enterArea(a1.id)
    const s = useGame.getState().save!
    // Mid-round: it began at 6, the gauge is at 14 (of 15), a wild Pokémon is the next card.
    useGame.setState({
      save: {
        ...s,
        gold: 42,
        areaProgress: {
          [a1.id]: {
            xp: 14,
            roundStartXp: 6,
            round: 1,
            deck: ['center', 'item', 'wild', 'wild'],
            drawn: ['wild'],
            cleared: false,
            bossDefeated: false,
            bossesDefeated: [],
            gymsDefeated: [],
          },
        },
      },
    })
    // find a wild encounter and lose it on purpose
    for (let i = 0; i < 50 && useGame.getState().run.encounter?.kind !== 'wild'; i++) {
      rollNext()
      if (useGame.getState().run.encounter?.kind === 'center') {
        engage()
        finishCenter()
      }
    }
    expect(useGame.getState().run.encounter?.kind).toBe('wild')
    engage()
    const b = useGame.getState().battle!
    useGame.setState({ battle: { ...b, state: { ...b.state, player: b.state.player.map((p) => ({ ...p, hp: 1 })) } } })
    for (let i = 0; i < 200 && useGame.getState().run.phase === 'battle'; i++) {
      const st = useGame.getState().battle!.state
      if (st.phase === 'enemy_turn') dispatchBattle({ t: 'AI_TURN' })
      else if (st.phase === 'player_roll') {
        dispatchBattle({ t: 'USE_ITEM', key: 'none' }) // no inventory → ignored
        dispatchBattle({ t: 'ROLL' })
      }
      else if (st.phase === 'player_reroll') dispatchBattle({ t: 'ATTACK' })
      else if (st.phase === 'player_switch') dispatchBattle({ t: 'SWITCH', instanceId: st.player.find((p) => p.hp > 0)!.uid })
      // keep our side at 1 HP so it goes down
      const cur = useGame.getState().battle
      if (cur && cur.state.enemy.hp < 2) useGame.setState({ battle: { ...cur, state: { ...cur.state, enemy: { ...cur.state.enemy, hp: 999, maxHp: 999 } } } })
    }
    expect(useGame.getState().run.phase).toBe('wipe')
    const after = useGame.getState().save!
    expect(after.gold).toBe(42)
    expect(progressOf(after, a1.id)).toMatchObject({ xp: 6, deck: [], drawn: [] }) // next encounter: a new round
    for (const p of teamOf(after)) expect(p.currentHp).toBe(instanceMaxHp(p, data))
    afterWipe()
    expect(useGame.getState().run.firstInArea).toBe(true)
  })
})
