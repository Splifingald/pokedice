// The Egg clocks through the store: every save it takes in is settled, so a clock starts the moment a pair forms and
// resets the moment it breaks up, whichever action made the change (engine rule: syncEggClocks, breeding.ts).
import { describe, expect, it } from 'vitest'
import { createInstance, dayCareOf, newSave, type SaveData } from '@/engine'
import { leaveAtDayCare, pickUpFromDayCare } from '@/store/actions'
import { commitSave, useGame } from '@/store/game'
import { newId } from './fixtures'

describe('Egg clocks in the store', () => {
  it('start when a pair is left at the Day Care, and reset when one goes home', () => {
    const { data } = useGame.getState()
    const s = newSave(4, data, 0, newId)
    const [eevee, jolteon] = [createInstance(133, 20, data, 'eevee', 0), createInstance(135, 20, data, 'jolteon', 0)]
    const open: SaveData = {
      ...s,
      pokedex: Array.from({ length: data.config.dayCare.unlockPokedex }, (_, i) => i + 1),
      box: [...s.box, jolteon],
      dayCare: { residents: [{ inst: eevee, since: 0, region: 'kanto' }], guests: [], eggClaimed: true, visited: true },
    }
    commitSave(open)
    const care = () => dayCareOf(useGame.getState().save!)
    // Eevee alone: nothing runs.
    expect(care().breedAt).toBeUndefined()

    const before = Date.now()
    expect(leaveAtDayCare('jolteon')).toBe(true)
    expect(care().breedAt).toBeGreaterThanOrEqual(before)
    expect(care().dittoAt).toBeUndefined()

    expect(pickUpFromDayCare('jolteon')).not.toBeNull()
    expect(care()).not.toHaveProperty('breedAt')
  })
})
