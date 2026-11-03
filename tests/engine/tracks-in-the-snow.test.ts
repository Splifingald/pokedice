// Tracks in the Snow (docs/64 §4.1, Moonlit Glade): the first bush opened is never Stantler's (every first bush, many
// seeds), on the 4 × 4 not one of its 8 neighbours either; each glade holds what the user's design says; the prints
// point at Stantler; out of taps the snow falls (a fresh glade, Stantler hidden again); rounds 1 and 2 end on a wild
// Stantler, round 3 on the shiny boss (a missed throw: it bolts, a fresh glade), caught it closes the glade for good;
// cleared rounds are kept through a wipe; the way in heals; and the switch (off: a plain secret area).
import { describe, expect, it } from 'vitest'
import {
  applyWipe,
  arriveAtTracks,
  canStartTracks,
  createInstance,
  createRng,
  DEFAULT_TRACKS,
  emptyProgress,
  enterWorld,
  hideStantler,
  inTracks,
  instanceMaxHp,
  isAreaClosed,
  isAreaSealed,
  markTracksWonSeen,
  newSave,
  normaliseTracks,
  openBush,
  progressOf,
  startTracks,
  teamSwapsOpen,
  tracksBolt,
  tracksCaught,
  tracksEncounter,
  tracksField,
  tracksFound,
  tracksModeOf,
  tracksNeighbours,
  tracksOutroDue,
  tracksPrintAt,
  tracksPrintDirection,
  tracksQuarryDown,
  tracksStateOf,
  tracksWipe,
  tracksWon,
  type EncounterContext,
  type GameData,
  type SaveData,
  type TracksBush,
  type TracksState,
} from '@/engine'
import { snowglobe } from '../../scripts/content-snowglobe-valley'
import { makeDataWith, newId } from '../fixtures'

const h = snowglobe()
const GLADE = h.areas.find((a) => a.name === 'Moonlit Glade')!
const NOW = Date.parse('2026-12-20T12:00:00.000Z')
const world = { ...h.world, minBadges: 0, previewHours: 48 }
const dataWith = (access: 'off' | 'all') =>
  makeDataWith(
    { areas: h.areas, regions: [h.region] },
    { smallWorlds: { access: 'all', list: [world] }, tracks: { access } },
  )
const data = dataWith('all')
const off = dataWith('off')
const STANTLER = 234

/** Inside Snowglobe Valley, standing in Moonlit Glade with two Pokémon at Lv.30, hurt. */
function atGlade(d: GameData = data): SaveData {
  const s = enterWorld(newSave(4, d, 0, newId), d, world, 179, NOW, newId)!
  const team = [181, 508].map((dex) => {
    const p = createInstance(dex, 30, d, newId(), NOW)
    return { ...p, currentHp: Math.floor(instanceMaxHp(p, d) / 2) }
  })
  return {
    ...s,
    box: team,
    team: team.map((p) => p.id),
    currentAreaId: GLADE.id,
    gold: 300,
    inventory: { potion: 2 },
  }
}
const withTracks = (s: SaveData, tracks: TracksState): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [GLADE.id]: { ...emptyProgress(), tracks } },
})
const begun = (round = 0) => startTracks(withTracks(atGlade(), { active: false, round }), data, GLADE.id)!
const count = (bushes: readonly TracksBush[], b: TracksBush) => bushes.filter((x) => x === b).length
const ctxOf = (s: SaveData): EncounterContext => ({
  area: GLADE,
  progress: progressOf(s, GLADE.id),
  data,
  teamAvgLevel: 30,
  teamHurt: false,
  isFirstInArea: false,
  pokedex: s.pokedex,
})

/** Opens the first bush, then (the glade known) Stantler's own: found. */
function findStantler(s: SaveData, seed = 1): SaveData {
  const rng = createRng(seed)
  const first = openBush(s, data, GLADE.id, 0, rng)!
  if (first.bush === 'stantler') throw new Error('the first bush was Stantler’s')
  const bushes = tracksStateOf(first.save, GLADE.id).field!.bushes!
  return openBush(first.save, data, GLADE.id, bushes.indexOf('stantler'), rng)!.save
}

describe('Tracks in the Snow: its rules', () => {
  it('is set on Moonlit Glade: three rounds, 3 × 3, 3 × 3, 4 × 4, 5 / 5 / 7 taps, prints on every bush', () => {
    expect(GLADE.mode).toEqual(DEFAULT_TRACKS)
    const mode = tracksModeOf(GLADE, data)!
    expect(mode.rounds.map((r) => [r.size, r.taps, r.wild, r.finds, r.cabins, r.apart])).toEqual([
      [3, 5, 3, 1, 1, false],
      [3, 5, 3, 1, 1, false],
      [4, 7, 5, 2, 1, true],
    ])
    expect(mode.emptyPrintsOnly).toBe(false)
    // The boss of the last round: the shiny Stantler, Lv.30.
    expect(GLADE.legendaryBoss).toEqual([{ dex: STANTLER, level: 30, shiny: true }])
  })

  it('cleans the admin’s numbers: never more contents than bushes, at least a tap, sizes 2 to 6', () => {
    const m = normaliseTracks({
      kind: 'tracks',
      rounds: [{ size: 9, taps: 0, wild: 50, finds: 50, cabins: 50, apart: 'x' }],
      emptyPrintsOnly: true,
    })!
    expect(m.rounds).toEqual([{ size: 6, taps: 1, wild: 35, finds: 0, cabins: 0, apart: false }])
    expect(m.emptyPrintsOnly).toBe(true)
    expect(normaliseTracks({ kind: 'nightmare' })).toBeNull()
    expect(normaliseTracks({ kind: 'tracks' })).toEqual(DEFAULT_TRACKS)
  })

  it('never hides Stantler in the first bush opened, whatever the bush and the seed', () => {
    for (const spec of DEFAULT_TRACKS.rounds)
      for (let first = 0; first < spec.size * spec.size; first++)
        for (let seed = 1; seed <= 150; seed++)
          expect(hideStantler(spec, first, createRng(seed * 7919 + first))[first]).not.toBe('stantler')
  })

  it('on the 4 × 4, never in one of the 8 bushes around the first either', () => {
    const spec = DEFAULT_TRACKS.rounds[2]!
    const seen = new Set<number>()
    for (let first = 0; first < 16; first++) {
      const near = tracksNeighbours(first, 4)
      for (let seed = 1; seed <= 200; seed++) {
        const at = hideStantler(spec, first, createRng(seed * 104729 + first)).indexOf('stantler')
        expect(at).not.toBe(first)
        expect(near).not.toContain(at)
        seen.add(at)
      }
    }
    // …and it can still be anywhere else.
    expect(seen.size).toBe(16)
    // The neighbours: 3 in a corner, 5 on an edge, 8 inside.
    expect(tracksNeighbours(0, 4)).toEqual([1, 4, 5])
    expect(tracksNeighbours(1, 4)).toHaveLength(5)
    expect(tracksNeighbours(5, 4)).toHaveLength(8)
  })

  it('fills each glade as designed: 3 wild, 1 find, 1 cabin, 3 empty on a 3 × 3; 5, 2, 1, 7 on the 4 × 4', () => {
    const [small, , big] = DEFAULT_TRACKS.rounds
    const a = hideStantler(small!, 4, createRng(3))
    expect([
      a.length,
      count(a, 'stantler'),
      count(a, 'wild'),
      count(a, 'find'),
      count(a, 'cabin'),
      count(a, 'empty'),
    ]).toEqual([9, 1, 3, 1, 1, 3])
    const b = hideStantler(big!, 0, createRng(3))
    expect([
      b.length,
      count(b, 'stantler'),
      count(b, 'wild'),
      count(b, 'find'),
      count(b, 'cabin'),
      count(b, 'empty'),
    ]).toEqual([16, 1, 5, 2, 1, 7])
  })

  it('points the prints at Stantler in 8 directions, by row and column', () => {
    // A 3 × 3, Stantler in the middle: every bush around points at it.
    expect([0, 1, 2, 3, 5, 6, 7, 8].map((i) => tracksPrintDirection(i, 4, 3))).toEqual([
      'se',
      's',
      'sw',
      'e',
      'w',
      'ne',
      'n',
      'nw',
    ])
    // Off the diagonal, the quarter's diagonal: never past it.
    expect(tracksPrintDirection(0, 6, 4)).toBe('se')
    expect(tracksPrintDirection(15, 3, 4)).toBe('n')
  })
})

describe('Tracks in the Snow: the search', () => {
  it('the way in heals as a Center, the team can change there, and BEGIN starts round 1 on a fresh 3 × 3', () => {
    const s = atGlade()
    expect(canStartTracks(s, data, GLADE.id)).toBe(true)
    const healed = arriveAtTracks(s, data, GLADE.id)
    expect(healed.box.every((p) => p.currentHp === instanceMaxHp(p, data))).toBe(true)
    expect(teamSwapsOpen(s, data, { phase: 'idle', areaId: GLADE.id })).toBe(true)
    const b = startTracks(s, data, GLADE.id)!
    expect(tracksStateOf(b, GLADE.id)).toEqual({
      active: true,
      round: 0,
      field: { taps: 5, bushes: null, opened: [] },
      tries: 1,
    })
    expect(inTracks(b, data, GLADE.id)).toBe(true)
    expect(teamSwapsOpen(b, data, { phase: 'idle', areaId: GLADE.id })).toBe(false)
    expect(startTracks(b, data, GLADE.id)).toBeNull()
  })

  it('a bush opened spends a tap, shows its prints; an opened bush can’t be opened again', () => {
    const b = begun()
    const r = openBush(b, data, GLADE.id, 4, createRng(9))!
    expect(r.bush).not.toBe('stantler')
    const f = tracksStateOf(r.save, GLADE.id).field!
    expect(f.taps).toBe(4)
    expect(f.opened).toEqual([4])
    expect(r.print).toBe(tracksPrintDirection(4, f.bushes!.indexOf('stantler'), 3))
    expect(tracksPrintAt(tracksModeOf(GLADE, data)!, f, 3, 4)).toBe(r.print)
    expect(openBush(r.save, data, GLADE.id, 4, createRng(9))).toBeNull()
    expect(openBush(r.save, data, GLADE.id, 9, createRng(9))).toBeNull()
  })

  it('keeps the prints for empty bushes only when the admin says so', () => {
    const mode = { ...DEFAULT_TRACKS, emptyPrintsOnly: true }
    const bushes = hideStantler(DEFAULT_TRACKS.rounds[0]!, 0, createRng(5))
    const field = { taps: 0, bushes, opened: bushes.map((_, i) => i) }
    bushes.forEach((b, i) => {
      const p = tracksPrintAt(mode, field, 3, i)
      if (b === 'empty') expect(p).not.toBeNull()
      else expect(p).toBeNull()
    })
  })

  it('out of taps, the snow falls: a fresh glade, the prints gone, Stantler hidden again after the next first bush', () => {
    let s = begun()
    const rng = createRng(21)
    const first = openBush(s, data, GLADE.id, 0, rng)!
    s = first.save
    const bushes = tracksStateOf(s, GLADE.id).field!.bushes!
    const others = bushes.map((b, i) => (b === 'stantler' || i === 0 ? -1 : i)).filter((i) => i >= 0)
    for (const i of others.slice(0, 3)) {
      const r = openBush(s, data, GLADE.id, i, rng)!
      expect(r.snowfall).toBe(false)
      s = r.save
    }
    const last = openBush(s, data, GLADE.id, others[3]!, rng)!
    expect(last.snowfall).toBe(true)
    expect(last.print).not.toBeNull()
    expect(tracksStateOf(last.save, GLADE.id)).toMatchObject({
      active: true,
      round: 0,
      field: { taps: 5, bushes: null, opened: [], snowed: true },
    })
    // The next first bush is never Stantler's either, and the snow's note goes with it.
    const again = openBush(last.save, data, GLADE.id, bushes.indexOf('stantler'), createRng(4))!
    expect(again.bush).not.toBe('stantler')
    expect(tracksStateOf(again.save, GLADE.id).field!.snowed).toBeUndefined()
  })

  it('what a bush brings: a wild Pokémon of the pool (never Stantler’s species), a find, a cabin’s heal, nothing', () => {
    const s = begun()
    const rng = createRng(77)
    for (let i = 0; i < 40; i++) {
      const w = tracksEncounter(ctxOf(s), 'wild', false, rng)!.encounter
      expect(w.kind).toBe('wild')
      if (w.kind === 'wild') expect(w.dex).not.toBe(STANTLER)
    }
    const find = tracksEncounter(ctxOf(s), 'find', false, rng)!
    expect(find.encounter.kind).toBe('item')
    expect(find.lootDeck).not.toBeNull()
    expect(tracksEncounter(ctxOf(s), 'cabin', false, rng)!.encounter).toEqual({
      kind: 'center',
      forced: true,
    })
    expect(tracksEncounter(ctxOf(s), 'empty', false, rng)).toBeNull()
  })

  it('rounds 1 and 2: a plain wild Stantler at the pool’s levels; its K.O. clears the round, kept, the next glade fresh', () => {
    const s = findStantler(begun())
    expect(tracksFound(s, data, GLADE.id)).toBe(true)
    // Found: no other bush opens until its fight is over.
    expect(openBush(s, data, GLADE.id, 8, createRng(1))).toBeNull()
    for (let seed = 1; seed < 30; seed++) {
      const enc = tracksEncounter(ctxOf(s), 'stantler', false, createRng(seed))!.encounter
      expect(enc).toMatchObject({ kind: 'wild', dex: STANTLER })
      if (enc.kind === 'wild') {
        expect(enc.shiny).toBeUndefined()
        expect(enc.level).toBeGreaterThanOrEqual(24)
        expect(enc.level).toBeLessThanOrEqual(28)
      }
    }
    const down = tracksQuarryDown(s, data, GLADE.id)!
    expect(down).toMatchObject({ round: 1, total: 3, last: false })
    expect(tracksStateOf(down.save, GLADE.id)).toMatchObject({
      active: true,
      round: 1,
      field: { taps: 5, bushes: null, opened: [] },
    })
    // Round 2 is a 3 × 3 too; its Stantler clears it, and round 3's glade is the 4 × 4.
    const two = tracksQuarryDown(findStantler(down.save, 2), data, GLADE.id)!
    expect(two).toMatchObject({ round: 2, last: false })
    expect(tracksField(two.save, data, GLADE.id)).toMatchObject({
      spec: { size: 4, taps: 7 },
      index: 2,
      last: true,
    })
  })

  it('round 3: the shiny Stantler is the boss, Lv.30; a missed throw sends it to another bush, a fresh 4 × 4', () => {
    const s = findStantler(begun(2), 5)
    expect(tracksEncounter(ctxOf(s), 'stantler', true, createRng(1))!.encounter).toEqual({
      kind: 'boss',
      dex: STANTLER,
      level: 30,
      shiny: true,
    })
    // Its K.O. doesn't win the glade: the catch decides.
    const down = tracksQuarryDown(s, data, GLADE.id)!
    expect(down.last).toBe(true)
    expect(tracksFound(down.save, data, GLADE.id)).toBe(true)
    expect(tracksWon(down.save, data, GLADE.id)).toBe(false)
    const bolted = tracksBolt(down.save, data, GLADE.id)
    expect(tracksStateOf(bolted, GLADE.id)).toMatchObject({
      active: true,
      round: 2,
      field: { taps: 7, bushes: null, opened: [], bolted: true },
    })
    // Nothing to bolt once nothing is found.
    expect(tracksBolt(bolted, data, GLADE.id)).toBe(bolted)
  })

  it('caught, the outro is due and the glade closes for good once it has played', () => {
    const s = tracksQuarryDown(findStantler(begun(2), 5), data, GLADE.id)!.save
    const won = tracksCaught(s, data, GLADE.id)
    expect(tracksStateOf(won, GLADE.id)).toEqual({
      active: false,
      round: 3,
      won: true,
      wonSeen: false,
      tries: 1,
    })
    expect(tracksWon(won, data, GLADE.id)).toBe(true)
    expect(tracksOutroDue(won, data, GLADE.id)).toBe(true)
    expect(isAreaSealed(won, data, GLADE.id)).toBe(true)
    expect(isAreaClosed(won, GLADE.id, data)).toBe(false)
    expect(canStartTracks(won, data, GLADE.id)).toBe(false)
    const seen = markTracksWonSeen(won, GLADE.id)
    expect(tracksOutroDue(seen, data, GLADE.id)).toBe(false)
    expect(isAreaClosed(seen, GLADE.id, data)).toBe(true)
  })

  it('a wipe: back at the glade’s edge, healed, the cleared rounds kept, XP and items kept', () => {
    const s = findStantler(begun(1), 8)
    const ko = { ...s, box: s.box.map((p) => ({ ...p, currentHp: 0 })) }
    const w = applyWipe(ko, GLADE.id, data)
    expect(w).toEqual(tracksWipe(ko, data, GLADE.id))
    expect(tracksStateOf(w, GLADE.id)).toEqual({ active: false, round: 1, tries: 1 })
    expect(w.box.every((p) => p.currentHp === instanceMaxHp(p, data))).toBe(true)
    expect(w.inventory).toEqual(ko.inventory)
    expect(w.gold).toBe(ko.gold)
    // The next way in starts at round 2, on a fresh glade.
    const again = startTracks(w, data, GLADE.id)!
    expect(tracksStateOf(again, GLADE.id)).toMatchObject({
      active: true,
      round: 1,
      field: { bushes: null },
      tries: 2,
    })
  })
})

describe('Tracks in the Snow: the switch', () => {
  it('off, the glade is a plain secret area: no way in, no search, its deck and boss as before', () => {
    const s = atGlade(off)
    expect(tracksModeOf(GLADE, off)).toBeNull()
    expect(canStartTracks(s, off, GLADE.id)).toBe(false)
    expect(startTracks(s, off, GLADE.id)).toBeNull()
    expect(arriveAtTracks(s, off, GLADE.id)).toBe(s)
    expect(teamSwapsOpen(s, off, { phase: 'idle', areaId: GLADE.id })).toBe(false)
    // A search kept in a save is left alone, and does nothing.
    const kept = withTracks(s, { active: true, round: 1, field: { taps: 5, bushes: null, opened: [] } })
    expect(inTracks(kept, off, GLADE.id)).toBe(false)
    expect(openBush(kept, off, GLADE.id, 0, createRng(1))).toBeNull()
    expect(tracksStateOf(applyWipe(kept, GLADE.id, off), GLADE.id)).toEqual(tracksStateOf(kept, GLADE.id))
    const won = withTracks(s, { active: false, round: 3, won: true, wonSeen: true })
    expect(isAreaSealed(won, off, GLADE.id)).toBe(false)
    expect(isAreaClosed(won, GLADE.id, off)).toBe(false)
  })
})
