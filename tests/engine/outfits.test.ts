// Outfits (docs/59): a Pokémon dressed up (Santa Pikachu), behind its switch. Only its look changes; it evolves only
// into a species wearing the same outfit; it comes as a gift (the developer's, the gift calendar's).
import { describe, expect, it } from 'vitest'
import {
  applyGifts,
  calendarGifts,
  catchTarget,
  cleanOutfit,
  createInstance,
  GIFT_LATEST,
  levelEvolutions,
  linkEvolution,
  newSave,
  normaliseCalendarReward,
  outfitAllowsEvolution,
  outfitChoices,
  outfitOf,
  outfitsOn,
  parseGifts,
  receiveTrade,
  releaseDuplicates,
  stoneEvolution,
  type Gift,
  type SaveData,
} from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from '../fixtures'

const NOW = 1_000_000
const on = makeData({ gifts: { access: 'all' }, outfits: { access: 'all' } })
const off = makeData({ gifts: { access: 'all' }, outfits: { access: 'off' } })
const kanto = (d = on): SaveData => newSave(4, d, NOW, newId)
const santa = (o: Partial<Extract<Gift, { kind: 'pokemon' }>> = {}): Gift => ({
  kind: 'pokemon',
  dex: 25,
  level: 10,
  outfit: 'santa',
  region: GIFT_LATEST,
  ...o,
})

describe('the switch', () => {
  it('is off by default; on for the admin alone, or for everyone', () => {
    expect(outfitsOn(makeData())).toBe(false)
    expect(outfitsOn(on)).toBe(true)
    const admin = makeData({ outfits: { access: 'admin' } })
    expect(outfitsOn(admin)).toBe(false)
    expect(outfitsOn({ ...admin, viewer: { admin: true } } as typeof admin)).toBe(true)
  })

  it('off, an outfit Pokémon looks plain but keeps its tag', () => {
    const p = { ...createInstance(25, 10, on, newId(), NOW), outfit: 'santa' }
    expect(outfitOf(on, p)).toBe('santa')
    expect(outfitOf(off, p)).toBeNull()
    expect(p.outfit).toBe('santa')
  })
})

describe('what wears what', () => {
  it('Santa is drawn on Pikachu only', () => {
    expect(outfitChoices(25)).toEqual(['santa'])
    expect(outfitChoices(26)).toEqual([])
    expect(cleanOutfit('santa', 25)).toBe('santa')
    expect(cleanOutfit('santa', 26)).toBeUndefined()
    expect(cleanOutfit('tuxedo', 25)).toBeUndefined()
    expect(cleanOutfit(7, 25)).toBeUndefined()
  })

  it('a species without the outfit drawn shows plain, even with the tag', () => {
    expect(outfitOf(on, { dex: 26, outfit: 'santa' })).toBeNull()
  })
})

describe('evolution', () => {
  it('a plain Pokémon evolves as ever; Santa Pikachu stays a Pikachu (no Raichu wears the hat)', () => {
    expect(outfitAllowsEvolution({}, 26)).toBe(true)
    expect(outfitAllowsEvolution({ outfit: 'santa' }, 26)).toBe(false)
    expect(outfitAllowsEvolution({ outfit: 'santa' }, 10100)).toBe(false) // Alolan Raichu either
  })

  it('the rule holds with the switch off too, so turning it back on never finds a Raichu it can’t draw', () => {
    // The rule reads only the tag: the same answer whatever the switch says.
    expect(outfitAllowsEvolution({ outfit: 'santa' }, 26)).toBe(false)
  })
})

describe('gifts', () => {
  it('a gift brings Santa Pikachu, its outfit on it', () => {
    const s = kanto()
    const res = applyGifts(s, on, 8, [santa()], NOW, newId)!
    const added = [
      ...res.save.box,
      ...res.save.team.map((id) => res.save.box.find((p) => p.id === id)),
    ].filter((p) => p && !s.box.some((q) => q.id === p.id))
    expect(added[0]).toMatchObject({ dex: 25, level: 10, outfit: 'santa' })
  })

  it('with outfits off, the same gift brings a plain Pikachu', () => {
    const s = kanto(off)
    const res = applyGifts(s, off, 8, [santa()], NOW, newId)!
    const added = res.save.box.filter((p) => !s.box.some((q) => q.id === p.id))
    expect(added).toHaveLength(1)
    expect(added[0]!.dex).toBe(25)
    expect(added[0]!.outfit).toBeUndefined()
  })

  it('the server’s gifts keep a known outfit on the species that wears it, and drop any other', () => {
    expect(parseGifts([santa()])).toEqual([santa()])
    const [raichu, odd] = parseGifts([santa({ dex: 26 }), santa({ outfit: 'tuxedo' })])
    expect(raichu).toEqual({ kind: 'pokemon', dex: 26, level: 10, region: GIFT_LATEST })
    expect(odd).toEqual({ kind: 'pokemon', dex: 25, level: 10, region: GIFT_LATEST })
  })

  it('a calendar day can give Santa Pikachu, each one in its hat', () => {
    const r = normaliseCalendarReward({ kind: 'pokemon', dex: 25, level: 10, outfit: 'santa', qty: 2 })
    expect(r).toEqual({ kind: 'pokemon', dex: 25, level: 10, outfit: 'santa', qty: 2 })
    expect(calendarGifts(r!).map((g) => g.kind === 'pokemon' && g.outfit)).toEqual(['santa', 'santa'])
    expect(normaliseCalendarReward({ kind: 'pokemon', dex: 26, level: 10, outfit: 'santa', qty: 1 })).toEqual(
      {
        kind: 'pokemon',
        dex: 26,
        level: 10,
        qty: 1,
      },
    )
  })
})

describe('the save', () => {
  it('keeps a known outfit and drops an unknown one, never the Pokémon', () => {
    const s = kanto()
    const [first] = s.box
    const raw = JSON.parse(JSON.stringify(s)) as SaveData
    raw.box = [
      { ...first!, id: 'a', outfit: 'santa' },
      { ...first!, id: 'b', outfit: 'tuxedo' },
    ]
    const res = parseSave(raw)
    if (!res.ok) throw new Error(res.error)
    const parsed = res.save
    expect(parsed.box.find((p) => p.id === 'a')?.outfit).toBe('santa')
    expect(parsed.box.find((p) => p.id === 'b')).toBeDefined()
    expect(parsed.box.find((p) => p.id === 'b')?.outfit).toBeUndefined()
  })
})

describe('its own Pokémon, like a shiny', () => {
  it('a stronger plain Pikachu never lets it go; a weaker plain one still goes', () => {
    const s = kanto()
    const santaMon = { ...createInstance(25, 5, on, 'santa', NOW), outfit: 'santa' }
    const strong = createInstance(25, 30, on, 'strong', NOW)
    const weak = createInstance(25, 3, on, 'weak', NOW)
    const res = releaseDuplicates({ ...s, box: [...s.box, santaMon, strong, weak] })
    expect(res.released.map((p) => p.id)).toEqual(['weak'])
    expect(res.save.box.map((p) => p.id)).toEqual(expect.arrayContaining(['santa', 'strong']))
  })

  it('a wild Pikachu never overwrites it: it joins as its own when the outfit one is all you have', () => {
    const s = kanto()
    const santaMon = { ...createInstance(25, 5, on, 'santa', NOW), outfit: 'santa' }
    const owned = { ...s, box: [...s.box, santaMon], pokedex: [...s.pokedex, 25] }
    expect(catchTarget(owned, 25, 40, 'wild', on)).toEqual({ mode: 'new' })
  })
})

describe('evolving', () => {
  it('Santa Pikachu reaches no evolution by level or by Thunder Stone; a plain one does by stone', () => {
    const plain = createInstance(25, 60, on, 'p', NOW)
    const santaMon = { ...plain, id: 's', outfit: 'santa' }
    expect(stoneEvolution(plain, 'thunder-stone', on)).toBe(26)
    expect(stoneEvolution(santaMon, 'thunder-stone', on)).toBeNull()
    expect(levelEvolutions(santaMon, on)).toEqual([])
    expect(linkEvolution(santaMon, on)).toBeNull()
  })

  it('a trade keeps its outfit', () => {
    const s = kanto()
    const mon = { ...createInstance(25, 12, on, 'traded', NOW), outfit: 'santa' }
    const got = receiveTrade(s, on, mon, 12, NOW, newId, { region: 'kanto' })
    // Above a new save's levels, it waits outside the Box (`worldHome`) until the team catches up: its outfit with it.
    const inst =
      got.save.box.find((p) => p.id === got.instId) ??
      got.save.events?.worldHome?.find((h) => h.inst.id === got.instId)?.inst
    expect(inst?.outfit).toBe('santa')
  })
})
