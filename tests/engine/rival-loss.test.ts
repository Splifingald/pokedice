// A rival lost to (docs/61 §5.4): with its switch on, the team is healed as a lost round heals it, the meeting is met
// and the area goes on where it was (its deck, cards turned over and rounds kept). Off, it is a wipe, as before.
import { describe, expect, it } from 'vitest'
import {
  applyRivalLoss,
  applyWipe,
  compileGameData,
  dueRival,
  emptyProgress,
  instanceMaxHp,
  newSave,
  progressOf,
  rivalLossForgiven,
  rivalLossHealOn,
  type AreaProgress,
  type GameData,
  type SaveData,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'

const base = compileGameData(BUNDLE)
const withConfig = (patch: Partial<GameData['config']>): GameData => ({ ...base, config: { ...base.config, ...patch } })
const rivals = { ...base.config.rivals, access: 'all' as const }
const OFF = withConfig({ rivals })
const ON = withConfig({ rivals, rivalLossHeal: { access: 'all' } })
const ADMIN_ONLY = withConfig({ rivals, rivalLossHeal: { access: 'admin' } })

let n = 0
const id = () => `id-${++n}`
const cerulean = base.areas.find((a) => a.name === 'Route 4 & Nugget Bridge' && (a.regionId ?? 'kanto') === 'kanto')!

/** On Nugget Bridge with Blue's meeting due (one round done, two cards turned over), the whole team K.O. */
function beaten(data: GameData, mode?: 'extreme'): SaveData {
  const s = newSave(1, data, 0, id)
  const p: AreaProgress = {
    ...emptyProgress(),
    roundsDone: 1,
    deck: ['wild', 'wild', 'trainer'],
    drawn: ['wild', 'wild'],
  }
  return {
    ...s,
    ...(mode && { mode }),
    currentAreaId: cerulean.id,
    areaProgress: { ...s.areaProgress, [cerulean.id]: p },
    box: s.box.map((m) => ({ ...m, currentHp: 0 })),
  }
}

const meeting = (s: SaveData, data: GameData) => dueRival(s, cerulean, progressOf(s, cerulean.id), data)!
const allFull = (s: SaveData, data: GameData) =>
  s.team.every((uid) => {
    const m = s.box.find((x) => x.id === uid)!
    return m.currentHp === instanceMaxHp(m, data)
  })

describe('a rival lost to (docs/61 §5.4)', () => {
  it('is Off by default, and the admin alone sees it On for admin', () => {
    expect(rivalLossHealOn(base)).toBe(false)
    expect(rivalLossHealOn(ON)).toBe(true)
    expect(rivalLossHealOn(ADMIN_ONLY)).toBe(false)
    expect(rivalLossHealOn({ ...ADMIN_ONLY, viewer: { admin: true } } as GameData)).toBe(true)
  })

  it('forgives only a set meeting, and only with the switch on', () => {
    const m = meeting(beaten(ON), ON)
    expect(rivalLossForgiven(ON, m.id)).toBe(true)
    expect(rivalLossForgiven(OFF, m.id)).toBe(false)
    // Any other trainer (no moment) still wipes.
    expect(rivalLossForgiven(ON, undefined)).toBe(false)
    expect(rivalLossForgiven(ON, null)).toBe(false)
  })

  it('heals the team, meets the rival and keeps the round where it was', () => {
    const s = beaten(ON)
    const m = meeting(s, ON)
    const after = applyRivalLoss(s, ON, m.id)
    expect(allFull(after, ON)).toBe(true)
    expect(after.moments?.done).toContain(m.id)
    expect(dueRival(after, cerulean, progressOf(after, cerulean.id), ON)).toBeNull()
    expect(progressOf(after, cerulean.id)).toEqual(progressOf(s, cerulean.id))
    expect(after.gold).toBe(s.gold)
  })

  it('unlike a wipe, which drops the round and leaves the rival waiting', () => {
    const s = beaten(OFF)
    const m = meeting(s, OFF)
    const wiped = applyWipe(s, cerulean.id, OFF)
    expect(progressOf(wiped, cerulean.id).drawn).toEqual([])
    expect(wiped.moments?.done ?? []).not.toContain(m.id)
  })

  it('heals nobody in Extreme mode while its wipes heal nobody: the team rests, the area still goes on', () => {
    const s = beaten(ON, 'extreme')
    const m = meeting(s, ON)
    const after = applyRivalLoss(s, ON, m.id)
    expect(after.box.every((p) => p.currentHp === 0)).toBe(true)
    expect(after.moments?.done).toContain(m.id)
    expect(progressOf(after, cerulean.id).drawn).toEqual(['wild', 'wild'])
  })
})
