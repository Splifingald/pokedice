// A side's next Pokémon after a K.O. (the Raid visual glitch, 2026-10-16): it steps to the front only when it's the next
// to act, never sent out to step straight back for another side's turn.
import { describe, expect, it } from 'vitest'
import { BOSS_UID, type RaidLogEntry } from '@/engine'
import { frontsNext } from '@/screens/events/raidAnimator'

const front = (ally: string, actor: 'ally' | 'boss'): RaidLogEntry => ({ kind: 'raid_front', ally, actor })
const faint: RaidLogEntry = { kind: 'faint', side: 'player', uid: 's0-0', dex: 1 }
const next: RaidLogEntry = { kind: 'raid_next', side: 0, uid: 's0-1' }

describe('a side’s next Pokémon', () => {
  it('waits for its turn when another side plays first', () => {
    const log = [front('s0-0', 'boss'), faint, next, front('s1-0', 'ally')]
    expect(frontsNext(log, 3, 's0-1')).toBe(false)
  })

  it('steps to the front when it’s the next to act', () => {
    const log = [
      front('s0-0', 'ally'),
      faint,
      next,
      { kind: 'turn', side: 'enemy', turn: 1, uid: BOSS_UID } as RaidLogEntry,
      front('s0-1', 'boss'),
    ]
    expect(frontsNext(log, 3, 's0-1')).toBe(true)
  })

  it('stays put when the log has no one in front yet', () => {
    expect(frontsNext([faint, next, { kind: 'raid_end', result: 'lost' }], 2, 's0-1')).toBe(false)
  })
})
