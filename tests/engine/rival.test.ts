// The endgame rival Champion: one version per starter, met as the character the player didn't pick.
import { describe, expect, it } from 'vitest'
import {
  applyVictory,
  challengeEncounter,
  createRng,
  dueGym,
  emptyProgress,
  gymsFor,
  isAreaUnlocked,
  newSave,
  playerSideOf,
  progressOf,
  type Area,
  type SaveData,
} from '@/engine'
import { data, newId } from '../fixtures'

const byName = (name: string): Area => data.areas.find((a) => a.name === name)!
const INDIGO = byName('Indigo Plateau')
const ROAD2 = byName('Victory Road II')
const INDIGO2 = byName('Indigo Plateau II')

const save = (starter: number, character?: 'red' | 'green'): SaveData =>
  newSave(starter, data, 0, newId, character ? { name: 'ASH', character } : undefined)
/** Every round done and the Elite Four beaten: the Champion is next. */
const atChampion = (s: SaveData): SaveData => {
  const elite = INDIGO2.gyms.filter((id) => data.trainers[id]!.role === 'elite')
  return { ...s, areaProgress: { [INDIGO2.id]: { ...emptyProgress(), roundsDone: INDIGO2.roundsToClear!, gymsDefeated: elite } } }
}

describe('endgame chain', () => {
  it('Victory Road II opens once the first Indigo Plateau is won, then Indigo Plateau II', () => {
    const s = save(1)
    expect(isAreaUnlocked(s, ROAD2.id, data)).toBe(false)
    const won = { ...s, areaProgress: { [INDIGO.id]: { ...emptyProgress(), cleared: true } } }
    expect(isAreaUnlocked(won, ROAD2.id, data)).toBe(true)
    expect(isAreaUnlocked(won, INDIGO2.id, data)).toBe(false)
  })
})

describe('rival Champion', () => {
  it.each([
    [1, 6, 130],
    [4, 9, 59],
    [7, 3, 59],
  ])('a player who started with #%i faces #%i (Lv.80) with #%i and Raichu', (starter, ace, second) => {
    const s = atChampion(save(starter))
    const enc = challengeEncounter(INDIGO2, progressOf(s, INDIGO2.id), data, 70, playerSideOf(s))!
    expect(enc).toMatchObject({ kind: 'gym', role: 'champion', index: 5, total: 5 })
    if (enc.kind !== 'gym') throw new Error('not a gym')
    expect(enc.team).toEqual([
      { dex: 26, level: 75 },
      { dex: second, level: 76 },
      // The ace holds the Champion's Hyper Potion.
      { dex: ace, level: 80, item: 'hyper-potion' },
    ])
  })

  it('is the character the player did not pick', () => {
    const asRed = atChampion(save(4, 'red'))
    expect(dueGym(INDIGO2, progressOf(asRed, INDIGO2.id), data, playerSideOf(asRed))).toMatchObject({
      name: 'Champion Green',
      spriteUrl: '/characters/green.png',
    })
    const asGreen = atChampion(save(4, 'green'))
    expect(dueGym(INDIGO2, progressOf(asGreen, INDIGO2.id), data, playerSideOf(asGreen))).toMatchObject({
      name: 'Champion Red',
      spriteUrl: '/characters/red.png',
    })
  })

  it('beating your version clears the area; the other versions never stand in the way', () => {
    let s = atChampion(save(7, 'red'))
    const champ = gymsFor(INDIGO2, data, playerSideOf(s)).at(-1)!
    const team = data.trainers[champ]!.team
    for (let i = 0; i < team.length; i++) {
      const r = applyVictory(
        s,
        {
          areaId: INDIGO2.id,
          kind: 'gym',
          enemyDex: team[i]!.dex,
          enemyLevel: team[i]!.level,
          fighterUid: s.team[0]!,
          gymTrainerId: champ,
          gymComplete: i === team.length - 1,
        },
        data,
        createRng(1),
        0,
        newId,
      )
      s = r.save
      if (i === team.length - 1) {
        expect(r.events).toContainEqual(expect.objectContaining({ kind: 'gym_defeated', name: 'Champion Green', role: 'champion' }))
        expect(r.events).toContainEqual({ kind: 'area_cleared', areaId: INDIGO2.id, nextAreaId: null })
      }
    }
    expect(progressOf(s, INDIGO2.id).cleared).toBe(true)
  })
})
