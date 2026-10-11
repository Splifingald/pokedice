// Home's green GO TO: the furthest area of the region's main chain the player can play, when they stand elsewhere.
import { describe, expect, it } from 'vitest'
import { emptyProgress, latestOpenArea, linearAreas, newSave, regionOf, type SaveData } from '@/engine'
import { data, newId } from './fixtures'

const fresh = () => newSave(7, data, 123, newId)
const chain = linearAreas(data, regionOf(fresh()))
const cleared = (save: SaveData, n: number): SaveData => ({
  ...save,
  areaProgress: Object.fromEntries(chain.slice(0, n).map((a) => [a.id, { ...emptyProgress(), cleared: true }])),
})

describe('latestOpenArea', () => {
  it('is nothing on a new game: the player stands in the only open area', () => {
    expect(latestOpenArea(fresh(), data)).toBeNull()
  })

  it('points to the furthest open area of the chain while the player is behind', () => {
    const save = { ...cleared(fresh(), 3), currentAreaId: chain[1]!.id }
    expect(latestOpenArea(save, data)?.id).toBe(chain[3]!.id)
  })

  it('is nothing once the player is there', () => {
    const save = { ...cleared(fresh(), 3), currentAreaId: chain[3]!.id }
    expect(latestOpenArea(save, data)).toBeNull()
  })

  it('never points to a secret area, and is offered from one', () => {
    const secret = data.areas.find((a) => a.hidden && (a.regionId ?? 'kanto') === regionOf(fresh()))!
    const save = { ...cleared(fresh(), 3), currentAreaId: secret.id }
    expect(latestOpenArea(save, data)?.id).toBe(chain[3]!.id)
  })

  it('is nothing once every area of the chain is cleared', () => {
    const save = { ...cleared(fresh(), chain.length), currentAreaId: chain[0]!.id }
    expect(latestOpenArea(save, data)).toBeNull()
  })
})
