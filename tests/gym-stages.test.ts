// The gym stages (docs/67): every gym battle in the game's data finds a type, and so a picture, and the leaders whose
// teams mislead (Normal/Flying birds, ties, Agatha's poison team) land on their gym's type.
import { existsSync, readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { gymTypeOf, POKE_TYPES, type PokeType } from '@/engine'
import { gymPicture } from '@/fx/areaArt'
import { makeData } from './fixtures'

const data = makeData()
const gymIds = new Set(data.areas.flatMap((a) => a.gyms ?? []))
const gymTrainers = Object.values(data.trainers).filter((t) => gymIds.has(t.id))
const typeOf = (name: string): PokeType | null => {
  const t = gymTrainers.find((x) => x.name === name)
  if (!t) throw new Error(`no gym trainer named ${name}`)
  return gymTypeOf(t.name, t.team, data)
}

describe('gym stages', () => {
  it('gives every gym battle a type', () => {
    expect(gymTrainers.length).toBeGreaterThan(100)
    for (const t of gymTrainers) expect(gymTypeOf(t.name, t.team, data), t.name).not.toBeNull()
  })

  it("reads a leader's type from the team, ties going to the strongest", () => {
    expect(typeOf('Misty')).toBe('water')
    expect(typeOf('Brock')).toBe('rock') // Geodude and Onix: Rock/Ground both, the ace's first type
    expect(typeOf('Falkner')).toBe('flying') // Pidgey's Normal doesn't count beside Flying
    expect(typeOf('Pryce')).toBe('ice') // Water 2, Ice 2: Piloswine leads
    expect(typeOf('Morty')).toBe('ghost')
    expect(typeOf('Elite Four Lance')).toBe('dragon')
  })

  it('takes the named type over the team for the few that mislead', () => {
    expect(typeOf('Elite Four Agatha')).toBe('ghost')
    expect(typeOf('Champion Lance')).toBe('dragon')
    expect(typeOf('Mela')).toBe('fire')
  })

  it('has one 400 × 268 stage per type', () => {
    for (const type of POKE_TYPES) {
      const pic = gymPicture(type)
      const file = `public${pic?.url}`
      expect(existsSync(file), file).toBe(true)
      const png = PNG.sync.read(readFileSync(file))
      expect([png.width, png.height], file).toEqual([400, 268])
    }
    expect(gymPicture(null)).toBeNull()
  })
})
