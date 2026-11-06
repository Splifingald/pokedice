// The Unown Pokédex (docs/41): the page open with the switch and an area where Unown live; each Unown caught a letter
// the page is missing, even a weaker one; the letters kept when the Unown leaves; the prize once, at the 28th; its
// rules once, in the pop-ups' queue.
import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  catchTarget,
  createInstance,
  createRng,
  isAreaUnlocked,
  markUnownDexSeen,
  newSave,
  homeNotices,
  nextOneTimePopup,
  noteUnownDex,
  payUnownDex,
  UNOWN_DEX,
  UNOWN_LETTERS,
  unownArea,
  unownDexOf,
  unownDexOpen,
  unownDexPaid,
  unownDexRulesDue,
  unownLetterFor,
  type GameData,
  type PokemonInstance,
  type PopupContext,
  type SaveData,
  type UnownLetter,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const OFF = makeData()
const ON = makeData({ unownDex: { access: 'all', reward: 1000 } })
const ADMIN_ONLY = makeData({ unownDex: { access: 'admin', reward: 1000 } })

const ruins = ON.areas.find((a) => a.name === 'Ruins of Alph')!
const johto = ON.areas.filter((a) => a.regionId === 'johto')

/** A Johto save standing in the Ruins of Alph, every Johto area cleared and 20 species caught (its conditions met). */
function atRuins(data: GameData = ON): SaveData {
  const base = newSave(7, data, 123, newId)
  const progress = Object.fromEntries(
    johto.map((a) => [
      a.id,
      { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] },
    ]),
  )
  return {
    ...base,
    region: 'johto',
    currentAreaId: ruins.id,
    pokedex: Array.from({ length: 20 }, (_, i) => 152 + i),
    box: [],
    team: [],
    areaProgress: progress,
    leaderboardVisited: true,
    versusRulesSeen: true,
  }
}

const unown = (level: number, letter?: UnownLetter): PokemonInstance => ({
  ...createInstance(UNOWN_DEX, level, ON, newId(), 0),
  ...(letter && { letter }),
})

/** The save with these letters on its page. */
const withLetters = (save: SaveData, letters: readonly UnownLetter[]): SaveData => ({
  ...save,
  unownDex: { ...save.unownDex, johto: [...letters] },
})

const catchUnown = (save: SaveData, level: number, letter: UnownLetter, data: GameData = ON) => {
  const target = catchTarget(save, UNOWN_DEX, level, 'wild', data)
  if (!target) return null
  return applyCatch(save, { dex: UNOWN_DEX, level, letter }, target, data, 0, newId)
}

describe('the content', () => {
  it('has Unown in Johto’s Ruins of Alph, a secret area, and in Mt. Silver’s pool of everything', () => {
    expect(ruins.regionId).toBe('johto')
    expect(ruins.hidden).toBe(true)
    expect(ruins.wildPool.some((w) => w.dex === UNOWN_DEX && w.weight > 0)).toBe(true)
    expect(isAreaUnlocked(atRuins(), ruins.id, ON)).toBe(true)
  })
})

describe('the page', () => {
  it('opens with the switch on once an area where Unown live is opened', () => {
    expect(unownDexOpen(atRuins(), ON)).toBe(true)
    expect(unownArea(atRuins(), ON)?.id).toBe(ruins.id)
    // Elsewhere, the ruins still: Unown come there most often.
    expect(unownArea({ ...atRuins(), currentAreaId: johto[0]!.id }, ON)?.id).toBe(ruins.id)
    expect(unownDexOpen(atRuins(OFF), OFF)).toBe(false)
    // Kanto has no Unown: nothing there.
    expect(unownDexOpen(newSave(7, ON, 123, newId), ON)).toBe(false)
    // A new Johto run: no area where Unown live is open yet.
    expect(unownDexOpen({ ...atRuins(), areaProgress: {}, pokedex: [152] }, ON)).toBe(false)
  })

  it('opens for the admin alone while it is On for admin', () => {
    const save = atRuins(ADMIN_ONLY)
    expect(unownDexOpen(save, ADMIN_ONLY)).toBe(false)
    expect(unownDexOpen(save, { ...ADMIN_ONLY, viewer: { admin: true } })).toBe(true)
  })

  it('lists the letters in the games’ order, whatever order they came in', () => {
    expect(UNOWN_LETTERS).toHaveLength(28)
    expect(unownDexOf(withLetters(atRuins(), ['?', 'b', 'a', '!']))).toEqual(['a', 'b', '!', '?'])
  })
})

describe('the letters', () => {
  it('draws a letter the page is missing, and any once all are found', () => {
    const rng = createRng(1)
    const save = withLetters(
      atRuins(),
      UNOWN_LETTERS.filter((l) => l !== 'q'),
    )
    for (let i = 0; i < 20; i++) expect(unownLetterFor(save, rng)).toBe('q')
    const all = withLetters(atRuins(), UNOWN_LETTERS)
    const drawn = new Set(Array.from({ length: 200 }, () => unownLetterFor(all, rng)))
    expect(drawn.size).toBeGreaterThan(20)
  })

  it('finds all 28 in 28 catches', () => {
    const rng = createRng(9)
    let save = atRuins()
    for (let i = 0; i < 28; i++) {
      const res = catchUnown(save, 20, unownLetterFor(save, rng))
      expect(res).not.toBeNull()
      save = res!.save
    }
    expect(unownDexOf(save)).toEqual([...UNOWN_LETTERS])
  })

  it('lets a weaker Unown be caught while a letter is missing, and not once all are found', () => {
    const owned = (s: SaveData): SaveData => ({
      ...s,
      box: [unown(30, 'a')],
      pokedex: [...s.pokedex, UNOWN_DEX],
    })
    const save = owned(withLetters(atRuins(), ['a']))
    expect(catchTarget(save, UNOWN_DEX, 12, 'wild', ON)).toEqual({ mode: 'new' })
    expect(catchTarget(withLetters(save, UNOWN_LETTERS), UNOWN_DEX, 12, 'wild', ON)).toBeNull()
    // Off, Unown are caught as before: only a stronger one replaces yours.
    const off = owned(withLetters(atRuins(OFF), ['a']))
    expect(catchTarget(off, UNOWN_DEX, 12, 'wild', OFF)).toBeNull()
  })

  it('keeps the caught letter on the Pokémon and on the page, and the Pokédex counts Unown once', () => {
    const res = catchUnown(withLetters(atRuins(), ['a']), 20, 'k')!
    const inst = res.save.box.find((p) => p.id === res.caughtId)!
    expect(inst.letter).toBe('k')
    expect(unownDexOf(res.save)).toEqual(['a', 'k'])
    expect(res.save.pokedex.filter((d) => d === UNOWN_DEX)).toHaveLength(1)
    expect(res.events).toContainEqual({ kind: 'unown_letter', letter: 'k', isNew: true, found: 2, total: 28 })
  })

  it('gives a stronger copy the letter it was caught with', () => {
    const old = unown(10, 'a')
    const save = {
      ...withLetters(atRuins(), UNOWN_LETTERS),
      box: [old],
      pokedex: [...atRuins().pokedex, UNOWN_DEX],
    }
    const res = catchUnown(save, 30, 'z')!
    expect(res.save.box.find((p) => p.id === old.id)?.letter).toBe('z')
  })

  it('says nothing on the result card while the page is off, and still notes the letter', () => {
    const res = catchUnown(atRuins(OFF), 20, 'c', OFF)!
    expect(res.events.some((e) => e.kind === 'unown_letter')).toBe(false)
    expect(unownDexOf(res.save)).toEqual(['c'])
  })
})

describe('noteUnownDex', () => {
  it('notes the Unown held, an Unown without a letter as an A, and keeps letters once it leaves', () => {
    const save = { ...atRuins(), box: [unown(10), unown(12, 'w')] }
    const noted = noteUnownDex(save)
    expect(unownDexOf(noted)).toEqual(['a', 'w'])
    expect(unownDexOf(noteUnownDex({ ...noted, box: [] }))).toEqual(['a', 'w'])
  })

  it('hands the same save back when nothing is new', () => {
    const save = noteUnownDex({ ...atRuins(), box: [unown(10, 'b')] })
    expect(noteUnownDex(save)).toBe(save)
  })
})

describe('the prize', () => {
  it('pays the admin’s ₽ once, with the 28th letter', () => {
    const save = withLetters(
      atRuins(),
      UNOWN_LETTERS.filter((l) => l !== '?'),
    )
    const res = catchUnown(save, 20, '?')!
    expect(res.save.gold).toBe(save.gold + 1000)
    expect(unownDexPaid(res.save)).toBe(true)
    expect(res.events).toContainEqual({
      kind: 'unown_letter',
      letter: '?',
      isNew: true,
      found: 28,
      total: 28,
      reward: 1000,
    })
    expect(payUnownDex(res.save, ON)).toEqual({ save: res.save, paid: 0 })
  })

  it('pays a page finished while the switch was off the day it opens, and never while it is off', () => {
    const done = withLetters(atRuins(OFF), UNOWN_LETTERS)
    expect(payUnownDex(done, OFF).paid).toBe(0)
    const paid = payUnownDex(done, ON)
    expect(paid.paid).toBe(1000)
    expect(paid.save.gold).toBe(done.gold + 1000)
  })

  it('pays nothing short of 28, and the admin’s number', () => {
    expect(payUnownDex(withLetters(atRuins(), ['a', 'b']), ON).paid).toBe(0)
    const rich = makeData({ unownDex: { access: 'all', reward: 2500 } })
    expect(payUnownDex(withLetters(atRuins(rich), UNOWN_LETTERS), rich).paid).toBe(2500)
  })
})

describe('its rules', () => {
  it('are due once the page opens, until seen, and never while it is off', () => {
    const save = atRuins()
    expect(unownDexRulesDue(save, ON)).toBe(true)
    const seen = markUnownDexSeen(save)
    expect(unownDexRulesDue(seen, ON)).toBe(false)
    expect(markUnownDexSeen(seen)).toBe(seen)
    expect(unownDexRulesDue(atRuins(OFF), OFF)).toBe(false)
  })

  it('open as a notice on Home (their rules on the Pokédex), never a pop-up; once seen it goes', () => {
    const save = atRuins()
    const ctx: PopupContext = { calm: true, path: '/home', signedIn: false, now: null, shareSeen: true }
    expect(nextOneTimePopup(save, ON, { ...ctx, showing: 'unownDex' })).not.toBe('unownDex')
    expect(homeNotices(save, ON, ctx)).toContain('unownDex')
    expect(homeNotices(markUnownDexSeen(save), ON, ctx)).not.toContain('unownDex')
  })
})
