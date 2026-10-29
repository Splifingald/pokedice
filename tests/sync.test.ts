// Cloud sync: settled with no question asked — areas, then the Pokédex, then the save played last.
import { describe, expect, it } from 'vitest'
import {
  applyTake,
  closeWorld,
  createInstance,
  emptyProgress,
  enterWorld,
  leaveWorld,
  liveBlock,
  markWorldBye,
  newSave,
  newSmallWorld,
  syncXpCurve,
  xpToNext,
  type Area,
  type PortalState,
  type Region,
  type SaveData,
  type SmallWorld,
} from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { compareProgress, decideSync, progressTotals, pushKey, sameSave } from '@/save/cloud'
import { parseSave } from '@/save/schema'
import { data, makeDataWith, newId } from './fixtures'

const base = newSave(4, data, 1000, newId)
const at = (s: SaveData, updatedAt: number): SaveData => ({ ...s, updatedAt })
const further: SaveData = { ...base, pokedex: [...base.pokedex, 16, 19, 25] }

describe('decideSync', () => {
  it('keeps the only save there is', () => {
    expect(decideSync(null, null)).toBe('none')
    expect(decideSync(base, null)).toBe('local')
    expect(decideSync(null, base)).toBe('cloud')
  })

  it('lets the save with more progress win, whichever was played last', () => {
    expect(decideSync(at(base, 1), at(further, 2))).toBe('cloud')
    expect(decideSync(at(base, 5), at(further, 2))).toBe('cloud')
    expect(decideSync(at(further, 3), at(base, 2))).toBe('local')
    expect(decideSync(at(further, 2), at(base, 5))).toBe('local')
  })

  it('keeps the one played last when both got as far', () => {
    expect(decideSync(at(base, 3), at(base, 2))).toBe('local')
    expect(decideSync(at(base, 2), at(base, 3))).toBe('cloud')
    // Levels, gold, rematches and upgrades aren't progress: an idle device's older save, level on areas and the
    // Pokédex, must not undo them (players lost their General upgrades that way, 2026-10-16).
    const richer: SaveData = {
      ...base,
      gold: base.gold + 500,
      box: base.box.map((p) => ({ ...p, level: p.level + 10 })),
      general: { offline: 4 },
    }
    expect(decideSync(at(base, 2), at(richer, 3))).toBe('cloud')
    expect(decideSync(at(richer, 3), at(base, 2))).toBe('local')
  })

  it('breaks the tie on when each was last played, not last changed (a clock restamps a stale save)', () => {
    const stale = { ...base, updatedAt: 9000, playedAt: 2000 }
    const played = { ...base, updatedAt: 5000, playedAt: 5000 }
    expect(decideSync(stale, played)).toBe('cloud')
    expect(decideSync(played, stale)).toBe('local')
    // Two saves from before playedAt: their stamps stand in.
    expect(decideSync(at(base, 6000), at(base, 5000))).toBe('local')
    expect(decideSync(at(base, 5000), at(base, 6000))).toBe('cloud')
    expect(sameSave(stale, played)).toBe(true)
  })

  it('never lets a copy an old page wrote (no playedAt) win a tie, however recent (2026-10-29)', () => {
    // A page from before 2026-10-22, resumed days later, stamps the save now and drops every part it never knew.
    const stripped: SaveData = { ...at(base, 9000), events: {} }
    const played: SaveData = { ...base, updatedAt: 5000, playedAt: 5000, events: { raidsDone: ['a:150'] } }
    expect(decideSync(stripped, played)).toBe('cloud')
    expect(decideSync(played, stripped)).toBe('local')
    // Progress still comes first: a copy that cleared more is kept, whoever wrote it.
    const ahead: SaveData = { ...stripped, pokedex: [...base.pokedex, 16, 19, 25] }
    expect(decideSync(ahead, played)).toBe('local')
  })

  it('…unless this device never saw a trade the cloud copy did: the Pokémon traded away would come back', () => {
    const given = base.box[0]!
    const traded = applyTake(
      base,
      data,
      { id: 'T1', listed: createInstance(given.dex, given.level, data, 'got', 1000), given, with: 'Misty' },
      2000,
      newId,
    ).save
    expect(compareProgress(base, traded)).toBe(0)
    expect(decideSync(at(base, 9), at(traded, 2))).toBe('cloud')
    expect(decideSync(at(traded, 2), at(base, 9))).toBe('local')
  })

  it('ranks progress by areas cleared first, then gyms, then species', () => {
    const areaId = Object.keys(base.areaProgress)[0] ?? data.areas[0]!.id
    const cleared: SaveData = {
      ...base,
      areaProgress: { ...base.areaProgress, [areaId]: { roundsDone: 1, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] } },
    }
    expect(compareProgress(cleared, further)).toBeGreaterThan(0)
    expect(compareProgress(further, base)).toBeGreaterThan(0)
    expect(compareProgress(base, base)).toBe(0)
  })

  it('counts every region the save holds, not just the one being played', () => {
    const areaId = Object.keys(base.areaProgress)[0] ?? data.areas[0]!.id
    const done = { roundsDone: 9, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: ['g1'] }
    // A finished Kanto, sitting on one device.
    const kanto: SaveData = { ...base, areaProgress: { [areaId]: done }, pokedex: [...base.pokedex, 16, 19, 25] }
    // The same player, having just walked into a fresh second region: one starter, nothing cleared yet.
    const intoJohto: SaveData = {
      ...newSave(4, data, 1000, newId),
      region: 'johto',
      parked: { kanto: { ...liveBlock(kanto) } },
    }

    // Read region by region, Johto looks like a brand new game and Kanto wins. It must not: the two got as far.
    expect(compareProgress(intoJohto, kanto)).toBe(0)
    // One Johto catch more, and Johto is ahead.
    const caught: SaveData = { ...intoJohto, pokedex: [...intoJohto.pokedex, 152] }
    expect(compareProgress(caught, kanto)).toBeGreaterThan(0)
    expect(decideSync(at(kanto, 9), at(caught, 2))).toBe('cloud')

    const totals = progressTotals(intoJohto)
    expect(totals.regions).toBe(2)
    expect(totals.cleared).toBe(1)
    expect(totals.gyms).toBe(1)
    // The two Pokédexes are unioned, not added: the starter is in both.
    expect(totals.species).toBe(new Set([...kanto.pokedex, ...base.pokedex]).size)
  })

  it('ignores bookkeeping when comparing saves', () => {
    // Saves from before passive regen was removed still carry lastRegenTick: not progress either.
    expect(sameSave(at(base, 1), { ...at(base, 9), lastRegenTick: 42 } as typeof base)).toBe(true)
    expect(sameSave(base, further)).toBe(false)
  })

  it('skips a push only when nothing but timestamps changed', () => {
    expect(pushKey(at(base, 1))).toBe(pushKey({ ...at(base, 9), lastRegenTick: 42 } as typeof base))
    expect(pushKey(base)).not.toBe(pushKey(further))
    // Unlike sameSave, a settings change is worth sending.
    const muted: SaveData = { ...base, settings: { ...base.settings, sfx: !base.settings.sfx } }
    expect(pushKey(muted)).not.toBe(pushKey(base))
  })

  it('sees a save back from the cloud as the same save, whatever order Postgres gave its keys', () => {
    // jsonb hands objects back with their keys sorted by length, then bytes — not in the order the game wrote them.
    const jsonbOrder = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(jsonbOrder)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.keys(v)
                .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
                .map((k) => [k, jsonbOrder((v as Record<string, unknown>)[k])]),
            )
          : v
    const [a1, a2] = data.areas.map((a) => a.id).sort().reverse()
    const progress = { roundsDone: 1, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }
    const played: SaveData = {
      ...base,
      inventory: { 'ultra-ball': 2, potion: 3 },
      areaProgress: { [a1!]: progress, [a2!]: progress },
    }
    const res = parseSave(jsonbOrder(JSON.parse(JSON.stringify(played))))
    if (!res.ok) throw new Error('round trip did not parse')
    const back = res.save

    // Signing in again on the same device: nothing to send (src/store/sync.ts reconcile).
    expect(sameSave(played, back)).toBe(true)
    expect(pushKey(played)).toBe(pushKey(back))
  })
})

describe('XP from an older curve', () => {
  it('is settled at once: levels owed are granted, nothing else changes', () => {
    const p = base.box[0]!
    const owed = xpToNext(p.level, data.config) + xpToNext(p.level + 1, data.config)
    const stale: SaveData = { ...base, box: [{ ...p, xp: owed }] }
    const synced = syncXpCurve(stale, data)
    expect(synced.box[0]).toMatchObject({ level: p.level + 2, xp: 0 })
    expect(syncXpCurve(base, data)).toBe(base)
  })
})

describe('a small world held open (2026-10-22)', () => {
  const T0 = Date.parse('2026-11-01T18:00:00.000Z')
  const iso = (ms: number) => new Date(ms).toISOString()
  const REGION: Region = {
    id: 'world-mirage',
    name: 'Mirage Island',
    orderIndex: 99,
    dexRange: [99999, 99999],
    starters: [63],
    starterLevel: 5,
    leagueAreaId: 'w-lair',
    nextRegion: null,
    enabled: false,
  }
  const route1 = BUNDLE.areas.find((a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto')!
  const area = (id: string, order: number): Area => ({
    ...route1,
    id,
    name: id,
    regionId: REGION.id,
    orderIndex: 9000 + order,
    legendaryBoss: null,
    gyms: [],
    hidden: false,
    unlockConditions: null,
  })
  const MARSH = area('w-marsh', 1)
  const LAIR = area('w-lair', 2)
  const RIFT = area('w-rift', 3)
  const WORLD: SmallWorld = { ...newSmallWorld('mirage', REGION.id, iso(T0), iso(T0 + 864e6)), minBadges: 0, starters: [63] }
  const wd = makeDataWith({ regions: [REGION], areas: [MARSH, LAIR, RIFT] }, { smallWorlds: { access: 'all', list: [WORLD] } })
  const at = (s: SaveData, updatedAt: number): SaveData => ({ ...s, updatedAt })

  const kanto = newSave(4, wd, T0, newId)
  /** Inside the world: two areas done (one of them a portal run won) and ten species caught there. */
  const inside: SaveData = (() => {
    const s = enterWorld(kanto, wd, WORLD, 63, T0, newId)!
    const won = { active: false, won: true } as unknown as PortalState
    return {
      ...s,
      pokedex: [...s.pokedex, 1, 4, 7, 10, 13, 16, 19, 21, 23],
      areaProgress: { [MARSH.id]: { ...emptyProgress(), cleared: true }, [RIFT.id]: { ...emptyProgress(), portal: won } },
    }
  })()
  const outside = leaveWorld(inside, wd)!

  it('counts its areas done and its own Pokédex, apart from the regions, inside it or out', () => {
    for (const s of [inside, outside]) {
      expect(progressTotals(s).world).toEqual({ id: WORLD.id, cleared: 2, gyms: 0, species: 10 })
      expect(progressTotals(s).species).toBe(progressTotals(kanto).species)
    }
    expect(progressTotals(kanto).world).toBeNull()
  })

  it('a world nearly finished on one device beats a stale one that never went in, stamped later or a catch ahead', () => {
    const pc = at(kanto, T0 + 864e5)
    expect(decideSync(pc, at(inside, T0 + 1000))).toBe('cloud')
    expect(decideSync(at(outside, T0 + 1000), pc)).toBe('local')
    const pcCaught = { ...pc, pokedex: [...pc.pokedex, 150] }
    expect(decideSync(pcCaught, at(outside, T0 + 1000))).toBe('cloud')
  })

  it('a copy done with the world is ahead of an older one still holding it open, its progress there left out', () => {
    const closed = closeWorld(outside, wd)
    expect(closed.events?.world?.closed).toBe(true)
    // Level on the regions (the partner coming home adds nothing here), the world's lifecycle decides.
    const level = { ...closed, pokedex: outside.pokedex }
    expect(compareProgress(level, outside)).toBeGreaterThan(0)
    expect(compareProgress(outside, level)).toBeLessThan(0)
    expect(decideSync(at(outside, T0 + 864e5), at(level, T0 + 1000))).toBe('cloud')
    // Its closing pop-up shown, the record goes: still done with it.
    const bye = markWorldBye(closed, WORLD.id)
    expect(decideSync(at(bye, T0 + 1000), at(outside, T0 + 864e5))).toBe('local')
  })
})
