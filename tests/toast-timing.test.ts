// Toasts stay long enough to read (docs/15 §7): 4 s at least, 1.2 s + 70 ms a character beyond; a caller's longer
// time still counts; an error stays until closed; and a toast held (a finger, the pointer, the focus) waits.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, holdToast, pushToast, toastMs, useGame } from '@/store/game'

const shown = () => useGame.getState().toasts.map((t) => t.text)

describe('how long a toast stays', () => {
  it('is 4 s for a short one, then 1.2 s + 70 ms a character', () => {
    expect(toastMs('Content updated')).toBe(4000)
    // 40 characters: exactly 4 s either way.
    expect(toastMs('x'.repeat(40))).toBe(4000)
    expect(toastMs('x'.repeat(100))).toBe(1200 + 7000)
  })

  it('counts characters, not UTF-16 units', () => {
    expect(toastMs('ポ'.repeat(60))).toBe(toastMs('x'.repeat(60)))
    expect(toastMs('😀'.repeat(60))).toBe(toastMs('x'.repeat(60)))
  })

  it('keeps a longer time a caller asks for, never a shorter one', () => {
    expect(toastMs('Short', 'good', 6000)).toBe(6000)
    expect(toastMs('x'.repeat(100), 'info', 4500)).toBe(8200)
    expect(toastMs('Short', 'info', 1000)).toBe(4000)
  })

  it('has no end for an error: it stays until closed', () => {
    expect(toastMs('Not enough Pokédollars', 'bad')).toBeNull()
    expect(toastMs('Not enough Pokédollars', 'bad', 4500)).toBeNull()
  })
})

describe('the toast stack', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGame.setState({ toasts: [] })
  })
  afterEach(() => {
    for (const t of useGame.getState().toasts) dismissToast(t.id)
    vi.useRealTimers()
  })

  it('takes a toast off once its time is up', () => {
    pushToast('Content updated')
    vi.advanceTimersByTime(3999)
    expect(shown()).toEqual(['Content updated'])
    vi.advanceTimersByTime(1)
    expect(shown()).toEqual([])
  })

  it('keeps an error until it is closed', () => {
    pushToast('Sync failed', 'bad')
    vi.advanceTimersByTime(60_000)
    expect(shown()).toEqual(['Sync failed'])
    dismissToast(useGame.getState().toasts[0]!.id)
    expect(shown()).toEqual([])
  })

  it('waits while held, and goes on with the time it had left', () => {
    pushToast('Content updated')
    const id = useGame.getState().toasts[0]!.id
    vi.advanceTimersByTime(3000)
    holdToast(id, true)
    vi.advanceTimersByTime(30_000)
    expect(shown()).toEqual(['Content updated'])
    holdToast(id, false)
    vi.advanceTimersByTime(999)
    expect(shown()).toEqual(['Content updated'])
    vi.advanceTimersByTime(1)
    expect(shown()).toEqual([])
  })

  it('shows four at most, the oldest going first', () => {
    for (const n of [1, 2, 3, 4, 5]) pushToast(`Toast ${n}`, 'bad')
    expect(shown()).toEqual(['Toast 2', 'Toast 3', 'Toast 4', 'Toast 5'])
  })
})
