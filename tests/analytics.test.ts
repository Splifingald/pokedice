import { describe, expect, it } from 'vitest'
import { diffSaves, foldLevelUps } from '@/analytics/events'
import { buyComboUpgrade, buyItem, linearAreas, newSave, type SaveData } from '@/engine'
import { data, newId } from './fixtures'

const base = (): SaveData => ({ ...newSave(1, data, 0, newId), gold: 10_000 })
const kinds = (xs: { kind: string }[]) => xs.map((x) => x.kind)

describe('diffSaves', () => {
  it('reports a new game, not progress, when the Pokémon are all new', () => {
    const s = base()
    expect(diffSaves(null, s, data)).toEqual([
      { kind: 'game_started', params: { starterDex: 1, character: null } },
    ])
    expect(kinds(diffSaves(base(), s, data))).toEqual(['game_started'])
    expect(diffSaves(s, null, data)).toEqual([])
  })

  it('reports level-ups and evolutions with their parameters', () => {
    const s = base()
    const mon = s.box[0]!
    const next = { ...s, box: [{ ...mon, level: mon.level + 3, dex: 2 }] }
    expect(diffSaves(s, next, data)).toEqual([
      { kind: 'level_up', params: { uid: mon.id, dex: 2, from: mon.level, to: mon.level + 3 } },
      { kind: 'evolved', params: { uid: mon.id, fromDex: 1, toDex: 2, level: mon.level + 3 } },
    ])
  })

  it('reports a Poké Mart purchase with its cost', () => {
    const s = base()
    const key = Object.values(data.items).find((i) => i.inShop)!.key
    const next = buyItem(s, key, 2, data)!
    expect(diffSaves(s, next, data)).toEqual([
      { kind: 'item_bought', params: { key, qty: 2, cost: s.gold - next.gold } },
    ])
  })

  it('reports items used, with where, and never counts loot as bought', () => {
    const s = { ...base(), inventory: { potion: 3 } }
    expect(diffSaves(s, { ...s, inventory: { potion: 1 } }, data, 'battle')).toEqual([
      { kind: 'item_used', params: { key: 'potion', qty: 2, where: 'battle' } },
    ])
    expect(diffSaves(s, { ...s, inventory: { potion: 4 } }, data)).toEqual([])
  })

  it('reports an upgrade with its track, levels and cost', () => {
    const s = base()
    const next = buyComboUpgrade(s, 'pair', data)!
    expect(diffSaves(s, next, data)).toEqual([
      { kind: 'upgrade', params: { track: 'combo', key: 'pair', from: 1, to: 2, cost: s.gold - next.gold } },
    ])
  })

  it('reports areas unlocked and badges won', () => {
    const s = base()
    const chain = linearAreas(data)
    const gymArea = chain.find((a) => a.gyms.some((id) => data.trainers[id]?.badge))!
    const gymId = gymArea.gyms.find((id) => data.trainers[id]?.badge)!
    const progress = { roundsDone: 1, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [gymId] }
    const next = { ...s, areaProgress: { ...s.areaProgress, [gymArea.id]: progress } }
    const events = diffSaves(s, next, data)
    const t = data.trainers[gymId]!
    expect(events).toContainEqual({
      kind: 'badge',
      params: { trainerId: gymId, leader: t.name, badge: t.badge, areaId: gymArea.id },
    })
    const after = chain[chain.indexOf(gymArea) + 1]!
    expect(events).toContainEqual({
      kind: 'area_unlocked',
      params: { areaId: after.id, area: after.name, hidden: after.hidden },
    })
  })
})

describe('foldLevelUps', () => {
  const row = (kind: string, params: object, user_id: string | null = 'u1', device_id = 'd1') => ({
    created_at: 't',
    kind,
    params,
    user_id,
    device_id,
  })
  const up = (uid: string, from: number, to: number, dex = 1) => row('level_up', { uid, dex, from, to })

  it("folds a Pokémon's queued level-ups into one, keeping the first one's place and time", () => {
    const queue = [up('a', 5, 6), row('item_used', { key: 'potion' }), up('b', 3, 4)]
    const out = foldLevelUps(queue, [up('a', 6, 7, 2), up('a', 7, 9, 2), up('c', 1, 2)])
    expect(out).toEqual([up('a', 5, 9, 2), row('item_used', { key: 'potion' }), up('b', 3, 4), up('c', 1, 2)])
  })

  it('leaves rows already being sent alone, and never mixes players', () => {
    const queue = [up('a', 5, 6)]
    expect(foldLevelUps(queue, [up('a', 6, 7)], 1)).toEqual([up('a', 5, 6), up('a', 6, 7)])
    const other = row('level_up', { uid: 'a', dex: 1, from: 6, to: 7 }, null)
    expect(foldLevelUps(queue, [other])).toEqual([up('a', 5, 6), other])
  })
})
