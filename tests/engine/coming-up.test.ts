// Home's "Coming up" line (engine/comingUp.ts, docs/15 §12): the next thing to open and how close the player is, in the
// order things usually open, once each square stands only for what is open.
import { describe, expect, it } from 'vitest'
import {
  comingUp,
  createInstance,
  emptyProgress,
  linearAreas,
  newSave,
  regionCaseOf,
  type GameData,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'

const start = (): SaveData => newSave(7, data, 1, newId)
const caught = (save: SaveData, n: number): SaveData => ({
  ...save,
  pokedex: Array.from({ length: n }, (_, i) => i + 1),
})
const kantoBadges = (save: SaveData, n: number): SaveData => {
  const progress: SaveData['areaProgress'] = { ...save.areaProgress }
  for (const b of regionCaseOf(data, 'kanto', [], false)!.badges.slice(0, n)) {
    const p = progress[b.areaId] ?? emptyProgress()
    progress[b.areaId] = { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] }
  }
  return { ...save, areaProgress: progress }
}
const atFifty = (save: SaveData, n: number): SaveData => ({
  ...save,
  box: [...save.box, ...[1, 4, 7].slice(0, n).map((dex) => createInstance(dex, 50, data, newId(), 1))],
})
/** Every event's area cleared: the events are all open. */
const eventsOpen = (save: SaveData, d: GameData): SaveData => ({
  ...save,
  areaProgress: {
    ...save.areaProgress,
    ...Object.fromEntries(
      Object.values(d.config.events)
        .map((e) => (e as { unlockAreaId?: string }).unlockAreaId)
        .filter((id): id is string => !!id)
        .map((id) => [id, { ...emptyProgress(), roundsDone: 1, cleared: true }]),
    ),
  },
})

describe('comingUp', () => {
  it('a new game: the Day Care, and how many species it still wants', () => {
    expect(comingUp(start(), data)).toEqual({
      kind: 'dayCare',
      current: 1,
      target: data.config.dayCare.unlockPokedex,
    })
  })

  it('then Versus, while the events have no area to name yet', () => {
    const save = caught(start(), 20)
    expect(comingUp(save, data)).toEqual({ kind: 'versus', current: 0, target: 3 })
    expect(comingUp(atFifty(save, 2), data)).toEqual({ kind: 'versus', current: 2, target: 3 })
  })

  it('the special events first once the teaser names the area that opens them', () => {
    const save = kantoBadges(caught(start(), 20), data.config.events.teaserBadges)
    const next = comingUp(save, data)
    expect(next?.kind).toBe('events')
    if (next?.kind === 'events')
      expect(linearAreas(data, 'kanto').some((a) => a.id === next.areaId)).toBe(true)
  })

  it('last, the secret area closest to opening; nothing once all of it is open', () => {
    const save = eventsOpen(atFifty(caught(start(), 20), 3), data)
    const next = comingUp(save, data)
    expect(next?.kind).toBe('secret')
    if (next?.kind === 'secret') expect(next.status.met).toBe(false)
    const open: GameData = {
      ...data,
      areas: data.areas.map((a) => (a.hidden ? { ...a, unlockConditions: [] } : a)),
    }
    expect(comingUp(save, open)).toBeNull()
  })
})
