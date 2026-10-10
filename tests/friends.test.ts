// The friend list's client side (docs/16): the friend ID's format, parsing what the database returns, the errors in
// words, toasts once per new friend, the invite kept a week, and a friend's badge case drawn like your own.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { regionCaseOf, regionCases } from '@/engine'
import { clearInvite, readInvite, saveInvite } from '@/lib/friendInvite'
import {
  formatCode,
  friendError,
  inviteUrl,
  isCode,
  normalizeCode,
  parseFriendDayCares,
  parseFriendList,
  parseProfile,
  parseStatus,
  takeUntold,
} from '@/lib/friends'
import { data, newId } from './fixtures'
import { newSave } from '@/engine'

/** localStorage for the node test environment. */
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = memoryStorage()
})
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('friend IDs', () => {
  it('reads a typed code the forgiving way, like the database', () => {
    expect(normalizeCode('k7qm-4xd9')).toBe('K7QM4XD9')
    expect(normalizeCode(' K7QM 4XD9 ')).toBe('K7QM4XD9')
    expect(normalizeCode('o1il-oooo')).toBe('01110000')
    expect(isCode(normalizeCode('k7qm-4xd9'))).toBe(true)
    expect(isCode('K7QM4XD')).toBe(false)
    expect(isCode('K7QM4XDU')).toBe(false) // no U in Crockford base32
  })

  it('shows a code in two halves and links to /f/', () => {
    expect(formatCode('K7QM4XD9')).toBe('K7QM-4XD9')
    expect(inviteUrl('K7QM4XD9', 'https://poke-dice.netlify.app')).toBe('https://poke-dice.netlify.app/f/K7QM4XD9')
  })
})

describe('parsing', () => {
  it('fills every gap in a friend row', () => {
    const [f] = parseFriendList([{ user_id: 'u1', name: ' ', avatar: 'nope', team: [{ dex: 25, level: 9 }, { dex: 0 }], is_new: 1 }])
    expect(f).toEqual({
      userId: 'u1',
      name: 'Trainer',
      avatar: 'red',
      region: null,
      areaId: null,
      maxLevel: 0,
      team: [{ dex: 25, level: 9, shiny: false }],
      since: null,
      updatedAt: null,
      isNew: true,
    })
  })

  it('reads friend_status, with or without friends', () => {
    expect(parseStatus([{ ids: ['a', 'b'], unseen: [{ id: 'b', name: 'MISTY', avatar: 'green' }] }])).toEqual({
      ids: ['a', 'b'],
      unseen: [{ id: 'b', name: 'MISTY', avatar: 'green' }],
    })
    expect(parseStatus([])).toEqual({ ids: [], unseen: [] })
  })

  it('reads a profile, and nothing for someone who is not a friend', () => {
    expect(parseProfile([])).toBeNull()
    const p = parseProfile([
      {
        user_id: 'u1',
        name: 'ASH',
        avatar: 'green',
        region: 'kanto',
        since: '2026-10-03T10:00:00Z',
        regions: [{ region: 'kanto', badges: ['t1'], endgame: true, progress: { a: { cleared: true, gyms: 1 } }, team: [] }],
        versus: null,
      },
    ])!
    expect(p.since).toBe(Date.parse('2026-10-03T10:00:00Z'))
    expect(p.regions[0]).toMatchObject({ region: 'kanto', badges: ['t1'], endgame: true, progress: { a: { cleared: true, gyms: 1 } } })
    expect(p.versus).toBeNull()
  })

  it('names the errors a player can act on', () => {
    expect(friendError({ message: 'friends_rate_limited' })).toBe('rate_limited')
    expect(friendError({ message: 'friends_reset_too_soon' })).toBe('reset_too_soon')
    expect(friendError({ code: 'PGRST202', message: 'Could not find the function' })).toBe('not_set_up')
    expect(friendError(new Error('network'))).toBe('failed')
  })
})

describe('announcing new friends', () => {
  it('says each new friend once per device and account', () => {
    const misty = { id: 'm', name: 'MISTY', avatar: 'green' }
    const brock = { id: 'b', name: 'BROCK', avatar: 'red' }
    expect(takeUntold('me', [misty])).toEqual([misty])
    expect(takeUntold('me', [misty])).toEqual([])
    expect(takeUntold('me', [misty, brock])).toEqual([brock])
    expect(takeUntold('someone-else', [misty])).toEqual([misty])
  })
})

describe('invite links', () => {
  it('keeps a good code for a week', () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    expect(saveInvite('k7qm-4xd9', now)).toBe('K7QM4XD9')
    expect(readInvite(now + 6 * 24 * 3_600_000)).toBe('K7QM4XD9')
    expect(readInvite(now + 8 * 24 * 3_600_000)).toBeNull()
    expect(readInvite(now)).toBeNull() // forgotten once expired
  })

  it('ignores a broken link', () => {
    expect(saveInvite('hello')).toBeNull()
    expect(readInvite()).toBeNull()
    saveInvite('K7QM4XD9')
    clearInvite()
    expect(readInvite()).toBeNull()
  })
})

describe('a friend’s badge case', () => {
  it('matches the one your own save draws, from the badges won and the crown alone', () => {
    const save = newSave(1, data, 1000, newId)
    const kanto = data.regions.find((r) => r.id === 'kanto')!
    const gyms = data.areas.filter((a) => a.regionId === 'kanto' && a.gyms.length).slice(0, 2)
    const won = gyms.flatMap((a) => a.gyms.filter((id) => data.trainers[id]?.badge))
    const progress = Object.fromEntries(gyms.map((a) => [a.id, { cleared: true, gymsDefeated: a.gyms }]))
    const mine = regionCases({ ...save, areaProgress: { ...save.areaProgress, ...progress, [kanto.leagueAreaId]: { cleared: true } } } as typeof save, data)[0]!
    expect(regionCaseOf(data, 'kanto', won, true)).toEqual(mine)
    expect(regionCaseOf(data, 'nowhere', [], false)).toBeNull()
  })
})

describe("friends' Day Cares (0034)", () => {
  it('parses friend_day_cares() rows with a default for every field, dropping what can not be used', () => {
    const rows = parseFriendDayCares([
      {
        owner: 'u1',
        name: 'Lea',
        avatar: 'not-a-look',
        day_care: [
          { inst: 'a', dex: 133, level: 24, xp: 3, since: 1000, shiny: true },
          { inst: 'b', dex: '135', level: 300 },
          { inst: '', dex: 1 },
          { dex: 0, inst: 'c' },
        ],
      },
      { owner: 'u2', name: '  ', day_care: [] },
      { name: 'nobody', day_care: [{ inst: 'x', dex: 1 }] },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.owner).toBe('u1')
    expect(rows[0]!.name).toBe('Lea')
    expect(rows[0]!.mons).toEqual([
      { inst: 'a', dex: 133, level: 24, xp: 3, since: 1000, shiny: true },
      { inst: 'b', dex: 135, level: 100, xp: 0, since: 0, shiny: false },
    ])
    expect(parseFriendDayCares(null)).toEqual([])
  })

  it('a database without 0034 reads as not set up', () => {
    expect(friendError({ code: 'PGRST202', message: 'Could not find the function public.friend_day_cares' })).toBe('not_set_up')
  })
})
