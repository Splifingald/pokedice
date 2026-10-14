// Cloud sync: settled with no question asked — areas, then the Pokédex, then this device's own save.
import { describe, expect, it } from 'vitest'
import { applyTake, createInstance, liveBlock, newSave, syncXpCurve, xpToNext, type SaveData } from '@/engine'
import { compareProgress, decideSync, progressTotals, pushKey, sameSave } from '@/save/cloud'
import { parseSave } from '@/save/schema'
import { data, newId } from './fixtures'

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

  it('keeps this device’s save when both got as far', () => {
    expect(decideSync(at(base, 3), at(base, 2))).toBe('local')
    expect(decideSync(at(base, 2), at(base, 3))).toBe('local')
    // Levels, gold and the rest don't count: areas and the Pokédex only.
    const richer: SaveData = { ...base, gold: base.gold + 500, box: base.box.map((p) => ({ ...p, level: p.level + 10 })) }
    expect(decideSync(at(base, 2), at(richer, 3))).toBe('local')
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
