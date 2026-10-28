// The shiny Pokédex (docs/39): every shiny the save holds noted under its region and kept when it leaves; the page
// open only with the switch, in a real region whose league is beaten; its rules once, in the pop-ups' queue.
import { describe, expect, it } from 'vitest'
import {
  createInstance,
  getRegion,
  markEventsSeen,
  markShinyDexSeen,
  newSave,
  nextOneTimePopup,
  noteShinyDex,
  progressOf,
  regionOf,
  shinyDexOf,
  shinyDexOpen,
  shinyDexRulesDue,
  type GameData,
  type PokemonInstance,
  type PopupContext,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const ON = makeData()

const fresh = (): SaveData => ({
  ...newSave(7, ON, 123, newId),
  leaderboardVisited: true,
  versusRulesSeen: true,
})
const mon = (dex: number, shiny = false): PokemonInstance => ({
  ...createInstance(dex, 10, ON, newId(), 0),
  ...(shiny && { shiny }),
})

function leagueBeaten(save: SaveData, data: GameData = ON): SaveData {
  const league = getRegion(data, regionOf(save))!.leagueAreaId
  return {
    ...save,
    areaProgress: { ...save.areaProgress, [league]: { ...progressOf(save, league), cleared: true } },
  }
}

describe('noteShinyDex', () => {
  it('notes the live Box’s shinies under the region being played, and nothing else', () => {
    const save = { ...fresh(), box: [mon(16, true), mon(19), mon(16, true), mon(25, true)] }
    expect(shinyDexOf(noteShinyDex(save))).toEqual([16, 25])
  })

  it('keeps a species once it leaves the Box', () => {
    const noted = noteShinyDex({ ...fresh(), box: [mon(25, true)] })
    const gone = noteShinyDex({ ...noted, box: [] })
    expect(shinyDexOf(gone)).toEqual([25])
  })

  it('notes a parked region’s Box and the Day Care under their own regions', () => {
    const save = fresh()
    const live = regionOf(save)
    const parked = {
      johto: { ...save, gold: 0, pokedex: [], box: [mon(152, true)], team: [] },
    } as unknown as SaveData['parked']
    const resident = { inst: mon(155, true), since: 0, region: 'johto' }
    const dayCare = { residents: [resident], guests: [], eggClaimed: false } as unknown as SaveData['dayCare']
    const noted = noteShinyDex({ ...save, box: [mon(1, true)], parked, dayCare })
    expect(shinyDexOf(noted, live)).toEqual([1])
    expect(shinyDexOf(noted, 'johto')).toEqual([152, 155])
  })

  it('leaves a fossil still reviving out, as the Pokédex does', () => {
    const save = { ...fresh(), box: [{ ...mon(138, true), revivesAt: Date.now() + 60_000 }] }
    expect(shinyDexOf(noteShinyDex(save))).toEqual([])
  })

  it('hands the same save back when nothing is new', () => {
    const save = noteShinyDex({ ...fresh(), box: [mon(25, true), mon(19)] })
    expect(noteShinyDex(save)).toBe(save)
    const none = fresh()
    expect(noteShinyDex(none)).toBe(none)
  })
})

describe('the page and its rules', () => {
  it('opens with the region’s league beaten', () => {
    const save = fresh()
    expect(shinyDexOpen(save, ON)).toBe(false)
    expect(shinyDexOpen(leagueBeaten(save), ON)).toBe(true)
  })

  it('shows its rules once, in the queue, never on the Pokédex', () => {
    const save = leagueBeaten(fresh())
    expect(shinyDexRulesDue(save, ON)).toBe(true)
    const ctx: PopupContext = { calm: true, path: '/home', signedIn: false, now: null, shareSeen: true }
    // A league beaten also opens the next region's offer and the rebattle event, ahead of it in the queue.
    expect(nextOneTimePopup(save, ON, ctx)).toBe('regionOffer')
    const ahead = markEventsSeen({ ...save, regionOfferSeen: ['johto'] }, ON)
    expect(nextOneTimePopup(ahead, ON, ctx)).toBe('shinyDex')
    expect(nextOneTimePopup(ahead, ON, { ...ctx, path: '/pokedex' })).toBeNull()
    const seen = markShinyDexSeen(ahead)
    expect(shinyDexRulesDue(seen, ON)).toBe(false)
    expect(nextOneTimePopup(seen, ON, ctx)).toBeNull()
    expect(markShinyDexSeen(seen)).toBe(seen)
  })
})
