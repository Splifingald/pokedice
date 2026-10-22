// A Mega Evolution mid-turn (after the roll): only its new die tumbles onto the tray, and the next reroll throws only the
// dice picked (BioHaZarK's report, 2026-10-19: the whole hand rolled twice).
import { describe, expect, it } from 'vitest'
import type { BattleState, LogEntry, RolledDie } from '@/engine'
import { describe as step, type AnimatorContext, type Fx } from '@/screens/battle/useBattleAnimator'

const st = { enemy: { uid: 'enemy' }, player: [] } as unknown as BattleState
const ctx = { speciesName: () => 'Lucario', megaMechanic: () => null, gmaxTurns: 3 } as unknown as AnimatorContext
const die = (type: string, face: number) => ({ type, face }) as unknown as RolledDie
const tray: Fx['tray'] = { side: 'player', dice: [die('fighting', 2), die('base', 3)], keys: ['old-0', 'old-1'] }
const fx = { activeUid: 'a', foeUid: 'enemy', tray, dex: {} } as unknown as Fx

const mega: LogEntry = {
  kind: 'form',
  side: 'player',
  uid: 'a',
  fromDex: 448,
  toDex: 10059,
  reason: 'mega',
  dice: ['fighting', 'steel', 'base'],
  die: 'steel',
  hand: { dice: [die('fighting', 2), die('steel', 5), die('base', 3)], fresh: [false, true, false] },
}

describe('a Mega Evolution after the roll', () => {
  it('throws only its new die onto the tray', () => {
    const s = step(mega, st, ctx)
    const after = s.land!(s.apply(fx), true)
    expect(after.tray!.dice).toEqual(mega.kind === 'form' && mega.hand!.dice)
    expect(after.tray!.keys[0]).toBe('old-0')
    expect(after.tray!.keys[2]).toBe('old-1')
    expect(['old-0', 'old-1']).not.toContain(after.tray!.keys[1])
  })

  it('the next reroll throws only the dice picked', () => {
    const s = step(mega, st, ctx)
    const formed = s.land!(s.apply(fx), true)
    const reroll: LogEntry = {
      kind: 'reroll',
      side: 'player',
      mask: [true, false, false],
      dice: [die('fighting', 6), die('steel', 5), die('base', 3)],
      rerollsLeft: 1,
    }
    const after = step(reroll, st, ctx).apply(formed)
    expect(after.tray!.keys[0]).not.toBe(formed.tray!.keys[0])
    expect(after.tray!.keys.slice(1)).toEqual(formed.tray!.keys.slice(1))
  })
})
