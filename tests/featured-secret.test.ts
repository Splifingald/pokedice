// Home's secret area widget: the next secret to find while one is left, never "all found" before they are.
import { describe, expect, it } from 'vitest'
import {
  conditionStatus,
  emptyProgress,
  isAreaUnlocked,
  newSave,
  regionOfArea,
  type Area,
  type GameData,
  type RegionId,
  type SaveData,
} from '@/engine'
import { featuredSecret } from '@/screens/home/areas'
import { data, newId } from './fixtures'

const inRegion = (region: RegionId): SaveData => ({ ...newSave(7, data, 123, newId), region })
const secretsOf = (d: GameData, region: RegionId) =>
  d.areas.filter((a) => a.hidden && regionOfArea(a) === region)
const regions = [...new Set(data.areas.filter((a) => a.hidden).map(regionOfArea))]
const unmet = (save: SaveData, a: Area) =>
  (a.unlockConditions ?? []).filter((c) => !conditionStatus(c, save, data).met).length

describe('featuredSecret', () => {
  it.each(regions)(
    'shows a locked secret on a new game in %s, even when each wants several things',
    (region) => {
      const save = inRegion(region)
      const f = featuredSecret(save, data)
      expect(f).not.toBeNull()
      if (!f || f.fresh) throw new Error('expected a locked secret')
      // The condition it counts is one still to meet, and no other secret has fewer left.
      expect(f.area.unlockConditions).toContain(f.cond)
      expect(conditionStatus(f.cond, save, data).met).toBe(false)
      const fewest = Math.min(
        ...secretsOf(data, region)
          .filter((a) => !isAreaUnlocked(save, a.id, data))
          .map((a) => unmet(save, a)),
      )
      expect(unmet(save, f.area)).toBe(fewest)
    },
  )

  describe('once the secrets open', () => {
    // Every secret open from the start, so what's left to find is up to each test.
    const open: GameData = {
      ...data,
      areas: data.areas.map((a) => (a.hidden ? { ...a, unlockConditions: [] } : a)),
    }
    const secrets = secretsOf(open, 'kanto')
    const played = (save: SaveData, areas: Area[]): SaveData => ({
      ...save,
      areaProgress: Object.fromEntries(areas.map((a) => [a.id, emptyProgress()])),
    })

    it('travels to a secret found and never played', () => {
      expect(featuredSecret(inRegion('kanto'), open)).toMatchObject({ fresh: true })
    })

    it('still shows the one left to find, wanting two things, when the others are found and played', () => {
      const last = secrets.at(-1)!
      const d: GameData = {
        ...open,
        areas: open.areas.map((a) =>
          a.id === last.id
            ? {
                ...a,
                unlockConditions: [
                  { kind: 'pokedex' as const, count: 9999 },
                  { kind: 'maxLevel' as const, level: 999 },
                ],
              }
            : a,
        ),
      }
      const f = featuredSecret(played(inRegion('kanto'), secrets), d)
      expect(f).toMatchObject({ fresh: false, area: { id: last.id } })
    })

    it('is nothing once every secret of the region is found and played', () => {
      expect(featuredSecret(played(inRegion('kanto'), secrets), open)).toBeNull()
    })
  })
})
