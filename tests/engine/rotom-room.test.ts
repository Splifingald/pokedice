// The Rotom Room (docs/73): the content (the five forms, the room after Sinnoh's League, Sinnoh's own Pokémon); the
// switch (off, the room is nowhere); each player's week (a form they don't own, pinned at the week's start, the room
// starting afresh); the room as the week makes it (Electric and the form's type, the form as its only boss); closed
// once the week's form is owned, for good with all five; the Rotom Pokédex (noted, kept, Rotom once in the Pokédex) and
// its shiny Rotom, once.
import { describe, expect, it } from 'vitest'
import {
  applyCatch,
  catchTarget,
  createInstance,
  dueBoss,
  homeNotices,
  isAreaClosed,
  isAreaUnlocked,
  markRotomDexSeen,
  newSave,
  noteRotomDex,
  payRotomDex,
  pinRotomWeek,
  regionSpecies,
  ROTOM_DEX,
  ROTOM_FORM_DEXES,
  ROTOM_FORMS,
  rotomDexOf,
  rotomDexOpen,
  rotomFormFor,
  rotomRoomBase,
  rotomRoomClosed,
  rotomRoomReopensAt,
  rotomWeekArea,
  rotomWeekForm,
  wildOdds,
  withRotomWeek,
  type GameData,
  type SaveData,
} from '@/engine'
import { makeData, newId } from '../fixtures'

const OFF = makeData()
const ON = makeData({ rotomRoom: { access: 'all', prizeLevel: 60 } })
const ADMIN_ONLY = makeData({ rotomRoom: { access: 'admin', prizeLevel: 60 } })

const room = ON.areas.find((a) => a.name === 'The Rotom Room')!
const sinnoh = ON.areas.filter((a) => a.regionId === 'sinnoh' && !a.hidden)
const LEAGUE = '5dc66787-c27b-5d67-8d66-4df0f1aa1041'

// Mondays 00:00 UTC.
const MON_23 = Date.parse('2026-11-23T00:00:00Z')
const WEEK = 7 * 86_400_000

/** A Sinnoh save, its whole chain cleared (League included), standing in the room. */
function inSinnoh(over: Partial<SaveData> = {}): SaveData {
  const base = newSave(387, ON, 123, newId)
  const progress = Object.fromEntries(
    sinnoh.map((a) => [
      a.id,
      { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] },
    ]),
  )
  return {
    ...base,
    region: 'sinnoh',
    currentAreaId: room.id,
    areaProgress: progress,
    leaderboardVisited: true,
    versusRulesSeen: true,
    ...over,
  }
}

const catchForm = (save: SaveData, dex: number, data: GameData = ON) =>
  applyCatch(save, { dex, level: 60 }, catchTarget(save, dex, 60, 'boss', data)!, data, 0, newId)

describe('the content', () => {
  it('has the five forms as species of their own: Electric and the appliance’s type, saved like a regional form', () => {
    const types = ROTOM_FORMS.map((f) => [ON.species[f.dex]!.type1, ON.species[f.dex]!.type2])
    expect(types).toEqual([
      ['electric', 'fire'],
      ['electric', 'water'],
      ['electric', 'ice'],
      ['electric', 'flying'],
      ['electric', 'grass'],
    ])
    for (const f of ROTOM_FORMS) {
      expect(ON.species[f.dex]!.form).toEqual({ of: ROTOM_DEX, kind: 'appliance' })
      expect(ON.species[f.dex]!.dice.map((d) => d.type)).toEqual(['electric', f.type])
    }
  })

  it('opens the room in Sinnoh once its League is cleared, Lv.50–60, the five forms its bosses at Lv.60', () => {
    expect(room.regionId).toBe('sinnoh')
    expect(room.hidden).toBe(true)
    expect(room.unlockConditions).toEqual([{ kind: 'cleared', areaId: LEAGUE }])
    expect(room.legendaryBoss!.map((b) => [b.dex, b.level])).toEqual(ROTOM_FORM_DEXES.map((d) => [d, 60]))
    for (const w of room.wildPool) expect([w.minLevel, w.maxLevel]).toEqual([50, 58])
  })

  it('deals only Sinnoh’s own Pokémon, each Electric or of an appliance’s type, two or more of each type', () => {
    const without = { ...ON, areas: ON.areas.filter((a) => a.id !== room.id) }
    const sinnohDex = regionSpecies(without, 'sinnoh')
    for (const w of room.wildPool) {
      expect(sinnohDex.has(w.dex)).toBe(true)
      const sp = ON.species[w.dex]!
      const types = [sp.type1, sp.type2]
      expect(types.some((t) => t === 'electric' || ROTOM_FORMS.some((f) => f.type === t))).toBe(true)
    }
    for (const f of ROTOM_FORMS) {
      const own = room.wildPool.filter((w) =>
        [ON.species[w.dex]!.type1, ON.species[w.dex]!.type2].includes(f.type),
      )
      expect(own.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('keeps Rotom once on Sinnoh’s Pokédex: the forms are on the Rotom Pokédex only', () => {
    const dex = regionSpecies(withRotomWeek(ON, inSinnoh()), 'sinnoh')
    expect(dex.has(ROTOM_DEX)).toBe(true)
    for (const d of ROTOM_FORM_DEXES) expect(dex.has(d)).toBe(false)
    // The same Pokédex whatever the week: every species of the room is met elsewhere in Sinnoh too.
    const weeks = ROTOM_FORM_DEXES.map(
      (form) =>
        regionSpecies(withRotomWeek(ON, inSinnoh({ rotomRoom: { week: '2026-11-23', form } })), 'sinnoh')
          .size,
    )
    expect(new Set(weeks).size).toBe(1)
  })
})

describe('the switch', () => {
  it('off, the room is nowhere: not in the areas, no page', () => {
    const seen = withRotomWeek(OFF, inSinnoh())
    expect(seen.areas.some((a) => a.id === room.id)).toBe(false)
    expect(rotomDexOpen(inSinnoh(), OFF)).toBe(false)
    const save = inSinnoh()
    expect(pinRotomWeek(save, OFF, MON_23)).toBe(save)
  })

  it('on for the admin, only the admin', () => {
    expect(rotomDexOpen(inSinnoh(), ADMIN_ONLY)).toBe(false)
    expect(rotomDexOpen(inSinnoh(), { ...ADMIN_ONLY, viewer: { admin: true } })).toBe(true)
  })

  it('turned on again, the room comes back from the content kept aside', () => {
    const off = withRotomWeek(OFF, inSinnoh())
    const on = withRotomWeek({ ...off, config: ON.config }, inSinnoh())
    expect(on.areas.some((a) => a.id === room.id)).toBe(true)
    expect(rotomRoomBase(on)).toEqual(room)
  })

  it('opens after Sinnoh’s League only', () => {
    const before = inSinnoh()
    before.areaProgress = {
      ...before.areaProgress,
      [LEAGUE]: { ...before.areaProgress[LEAGUE]!, cleared: false },
    }
    expect(isAreaUnlocked(before, room.id, ON)).toBe(false)
    expect(rotomDexOpen(before, ON)).toBe(false)
    expect(isAreaUnlocked(inSinnoh(), room.id, ON)).toBe(true)
  })
})

describe('each player’s week', () => {
  it('draws a form the player doesn’t own, the same for the same week and save', () => {
    const save = inSinnoh({ rotomDex: [10008, 10010] })
    for (let w = 0; w < 30; w++) {
      const week = new Date(MON_23 + w * WEEK).toISOString().slice(0, 10)
      const form = rotomFormFor(save, week)!
      expect([10009, 10011, 10012]).toContain(form)
      expect(rotomFormFor(save, week)).toBe(form)
    }
    expect(rotomFormFor(inSinnoh({ rotomDex: [...ROTOM_FORM_DEXES] }), '2026-11-23')).toBeNull()
  })

  it('pins it at the week’s start on the server’s clock, and keeps it all week', () => {
    const pinned = pinRotomWeek(inSinnoh(), ON, MON_23 + 3600_000)
    expect(pinned.rotomRoom?.week).toBe('2026-11-23')
    expect(ROTOM_FORM_DEXES).toContain(rotomWeekForm(pinned))
    // Later the same week, nothing moves, even once caught.
    const caught = { ...pinned, pokedex: [...pinned.pokedex, rotomWeekForm(pinned)!] }
    expect(pinRotomWeek(caught, ON, MON_23 + 5 * 86_400_000)).toBe(caught)
    // Unknown time, or another region: nothing pinned.
    expect(pinRotomWeek(inSinnoh(), ON, null).rotomRoom).toBeUndefined()
    expect(pinRotomWeek(inSinnoh({ region: 'johto' }), ON, MON_23).rotomRoom).toBeUndefined()
  })

  it('starts the room afresh for a new week: its rounds and its boss', () => {
    const played = inSinnoh({ rotomRoom: { week: '2026-11-16', form: 10008 } })
    played.areaProgress = {
      ...played.areaProgress,
      [room.id]: {
        roundsDone: 2,
        cleared: true,
        bossDefeated: true,
        bossesDefeated: [10008],
        gymsDefeated: [],
        drawn: [],
      },
    }
    const next = pinRotomWeek(played, ON, MON_23)
    expect(next.areaProgress[room.id]).toMatchObject({ roundsDone: 0, cleared: false, bossesDefeated: [] })
  })
})

describe('the room as the week makes it', () => {
  it('deals the Electric Pokémon and those of the week’s type, and the form as its only boss', () => {
    for (const f of ROTOM_FORMS) {
      const area = rotomWeekArea(room, ON, f.dex)
      for (const w of area.wildPool) {
        const sp = ON.species[w.dex]!
        const met = [sp.type1, sp.type2].some((t) => t === 'electric' || t === f.type)
        expect(w.weight > 0).toBe(met)
      }
      expect(area.legendaryBoss!.map((b) => b.dex)).toEqual([f.dex])
    }
    // The same object for the same week, so the data built on it doesn't change.
    expect(rotomWeekArea(room, ON, 10009)).toBe(rotomWeekArea(room, ON, 10009))
  })

  it('meets only those in a fight, and its boss once every round is done', () => {
    const save = inSinnoh({ rotomRoom: { week: '2026-11-23', form: 10011 } })
    const data = withRotomWeek(ON, save)
    const area = data.areas.find((a) => a.id === room.id)!
    const odds = wildOdds({
      area,
      progress: { roundsDone: 0, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] },
      data,
      pokedex: [],
      hour: null,
      weather: null,
    })
    for (const o of odds.filter((o) => o.weight > 0)) {
      const sp = data.species[o.entry.dex]!
      expect([sp.type1, sp.type2].some((t) => t === 'electric' || t === 'flying')).toBe(true)
    }
    const done = { roundsDone: 2, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }
    expect(dueBoss(area, done, 60, data)?.dex).toBe(10011)
  })
})

describe('closing', () => {
  it('is open with this week’s form still to catch, closed once it’s owned, until next Monday', () => {
    const save = inSinnoh({ rotomRoom: { week: '2026-11-23', form: 10012 } })
    const data = withRotomWeek(ON, save)
    expect(isAreaClosed(save, room.id, data)).toBe(false)
    const caught = catchForm(save, 10012, data).save
    expect(isAreaClosed(caught, room.id, data)).toBe(true)
    expect(rotomRoomReopensAt(caught)).toBe(MON_23 + WEEK)
    // Next Monday, another form, open again.
    const next = pinRotomWeek(caught, data, MON_23 + WEEK)
    expect(rotomWeekForm(next)).not.toBe(10012)
    expect(isAreaClosed(next, room.id, withRotomWeek(data, next))).toBe(false)
  })

  it('closes for good with all five owned, and waits while no week is pinned', () => {
    const all = inSinnoh({ rotomDex: [...ROTOM_FORM_DEXES], rotomRoom: { week: '2026-11-23', form: null } })
    expect(rotomRoomClosed(all, ON, room.id)).toBe(true)
    expect(rotomRoomReopensAt(all)).toBeNull()
    expect(rotomRoomClosed(inSinnoh(), ON, room.id)).toBe(true)
    expect(rotomRoomClosed(inSinnoh(), OFF, room.id)).toBe(false)
  })
})

describe('the Rotom Pokédex', () => {
  it('notes a form caught, and Rotom once on the Pokédex', () => {
    const r = catchForm(inSinnoh(), 10009)
    expect(rotomDexOf(r.save)).toEqual([10009])
    expect(r.save.pokedex).toContain(ROTOM_DEX)
    expect(r.events).toContainEqual({ kind: 'rotom_form', dex: 10009, found: 1, total: 5 })
  })

  it('notes the forms the save holds, and keeps them when they leave', () => {
    const mon = createInstance(10010, 55, ON, newId(), 0)
    const held = noteRotomDex(inSinnoh({ box: [mon], team: [mon.id] }))
    expect(rotomDexOf(held)).toEqual([10010])
    expect(rotomDexOf(noteRotomDex({ ...held, box: [], team: [] }))).toEqual([10010])
  })

  it('brings a shiny Rotom with the fifth form, once, at the admin’s level', () => {
    const four = inSinnoh({ rotomDex: [10008, 10009, 10010, 10011], box: [], team: [] })
    const r = catchForm(four, 10012)
    const shiny = r.save.box.filter((p) => p.dex === ROTOM_DEX && p.shiny)
    expect(shiny).toHaveLength(1)
    expect(shiny[0]!.level).toBe(60)
    expect(r.save.rotomDexPaid).toBe(true)
    expect(r.events).toContainEqual({ kind: 'rotom_form', dex: 10012, found: 5, total: 5, prizeLevel: 60 })
    expect(payRotomDex(r.save, ON, 0, newId).prize).toBeNull()
    const lv70 = makeData({ rotomRoom: { access: 'all', prizeLevel: 70 } })
    expect(payRotomDex({ ...four, rotomDex: [...ROTOM_FORM_DEXES] }, lv70, 0, newId).prize?.level).toBe(70)
  })

  it('a page completed while off brings it the day it opens', () => {
    const full = inSinnoh({ rotomDex: [...ROTOM_FORM_DEXES] })
    expect(payRotomDex(full, OFF, 0, newId).prize).toBeNull()
    expect(payRotomDex(full, ON, 0, newId).prize?.shiny).toBe(true)
  })

  it('is announced on Home until its page is opened', () => {
    expect(homeNotices(inSinnoh(), ON, {})).toContain('rotomDex')
    expect(homeNotices(markRotomDexSeen(inSinnoh()), ON, {})).not.toContain('rotomDex')
    expect(homeNotices(inSinnoh(), OFF, {})).not.toContain('rotomDex')
  })
})
