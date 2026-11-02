// Playtime (docs/57 §3.2): what counts as played, the seconds waiting for the next call, and how the admin reads them.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addPlaytime,
  formatPlaytime,
  IDLE_MS,
  markPlaytimeSent,
  movePlaytime,
  pendingSeconds,
  playedMs,
  TICK_MS,
} from '@/analytics/playtime'

describe('playedMs', () => {
  const t0 = 1_000_000
  it('counts the time since the last tick while on screen and in use', () => {
    expect(playedMs(t0 + TICK_MS, t0, t0, true)).toBe(TICK_MS)
  })
  it('counts nothing while hidden', () => {
    expect(playedMs(t0 + TICK_MS, t0, t0, false)).toBe(0)
  })
  it('stops IDLE_MS after the last input', () => {
    const input = t0 - IDLE_MS + 5000
    expect(playedMs(t0 + TICK_MS, t0, input, true)).toBe(5000)
    expect(playedMs(t0 + TICK_MS, t0, t0 - IDLE_MS - 1, true)).toBe(0)
  })
  it('never counts more than two ticks: a long gap is a sleeping device', () => {
    expect(playedMs(t0 + 60 * 60_000, t0, t0 + 60 * 60_000, true)).toBe(2 * TICK_MS)
  })
  it('counts nothing for a clock gone back', () => {
    expect(playedMs(t0 - 1000, t0, t0, true)).toBe(0)
  })
})

/** localStorage, as the browser has it (the tests run in Node). */
function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('the seconds waiting', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))

  it('add up per player, in whole seconds', () => {
    addPlaytime('device:a', 14.6)
    addPlaytime('device:a', 15.6)
    addPlaytime('u1', 3)
    expect(pendingSeconds('device:a')).toBe(30)
    expect(pendingSeconds('u1')).toBe(3)
    expect(pendingSeconds('nobody')).toBe(0)
  })

  it('keep what was counted while the call was out', () => {
    addPlaytime('u1', 100)
    const sent = pendingSeconds('u1')
    addPlaytime('u1', 15)
    markPlaytimeSent('u1', sent)
    expect(pendingSeconds('u1')).toBe(15)
    markPlaytimeSent('u1', 15)
    expect(pendingSeconds('u1')).toBe(0)
  })

  it("follow a guest who signs in to the account's", () => {
    addPlaytime('device:a', 40)
    addPlaytime('u1', 2)
    movePlaytime('device:a', 'u1')
    expect(pendingSeconds('u1')).toBe(42)
    expect(pendingSeconds('device:a')).toBe(0)
  })

  it('survive a broken entry', () => {
    localStorage.setItem('pokedice.analytics.playtime', '{"u1": "x", "u2": 5}')
    expect(pendingSeconds('u1')).toBe(0)
    expect(pendingSeconds('u2')).toBe(5)
  })
})

describe('formatPlaytime', () => {
  it('reads as hours and minutes', () => {
    expect(formatPlaytime(0)).toBe('0 min')
    expect(formatPlaytime(30)).toBe('< 1 min')
    expect(formatPlaytime(45 * 60)).toBe('45 min')
    expect(formatPlaytime(12 * 3600 + 5 * 60 + 59)).toBe('12 h 05 min')
  })
})
