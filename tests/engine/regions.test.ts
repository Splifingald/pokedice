import { describe, expect, it } from 'vitest'
import { badgeCase, linearAreas, newSave, progressOf, regionCases, type SaveData } from '@/engine'
import { data } from '../fixtures'

let n = 0
const newId = () => `r${n++}`
const fresh = () => newSave(4, data, 1000, newId)

const chain = linearAreas(data)
const last = chain[chain.length - 1]!

/** `withProgress` is internal to the engine; the tests patch one area's progress by hand. */
const patch = (save: SaveData, areaId: string, p: Partial<ReturnType<typeof progressOf>>): SaveData => ({
  ...save,
  areaProgress: { ...save.areaProgress, [areaId]: { ...progressOf(save, areaId), ...p } },
})

describe('region cases', () => {
  it('puts the whole Kanto chain in one region', () => {
    const [kanto, ...rest] = regionCases(fresh(), data)
    expect(rest).toEqual([])
    expect(kanto!.id).toBe('kanto')
    expect(kanto!.nameKey).toBe('ui.map.region')
    expect(kanto!.badges).toEqual(badgeCase(fresh(), data))
  })

  it('is unlocked from the start, with no badge and no crown', () => {
    const kanto = regionCases(fresh(), data)[0]!
    expect(kanto.unlocked).toBe(true)
    expect(kanto.earned).toBe(0)
    expect(kanto.endgameCleared).toBe(false)
  })

  it('counts a badge once its gym leader falls', () => {
    const first = badgeCase(fresh(), data)[0]!
    const save = patch(fresh(), first.areaId, { gymsDefeated: [first.trainerId] })
    const kanto = regionCases(save, data)[0]!
    expect(kanto.earned).toBe(1)
    expect(kanto.badges.find((b) => b.trainerId === first.trainerId)!.earned).toBe(true)
  })

  it('crowns the region only once its last area is cleared', () => {
    const save = fresh()
    expect(regionCases(save, data)[0]!.endgameCleared).toBe(false)
    const done = patch(save, last.id, { cleared: true })
    expect(regionCases(done, data)[0]!.endgameCleared).toBe(true)
  })
})
