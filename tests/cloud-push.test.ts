import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelPush, flushPush, schedulePush } from '@/save/cloud'

describe('cloud push timing', () => {
  afterEach(() => {
    cancelPush()
    vi.useRealTimers()
  })

  it('pushes at most once per 30 s, with the latest save, even while saves keep coming', async () => {
    vi.useFakeTimers()
    const pushed: number[] = []
    for (let i = 1; i <= 10; i++) {
      schedulePush(async () => void pushed.push(i))
      await vi.advanceTimersByTimeAsync(5_000)
    }
    // 50 s of saves every 5 s: one push at 30 s (save 6), the next waiting for 60 s.
    expect(pushed).toEqual([6])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(pushed).toEqual([6, 10])
  })

  it('flushPush sends the waiting save right away, and only once', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    schedulePush(run)
    flushPush()
    await vi.advanceTimersByTimeAsync(60_000)
    flushPush()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('cancelPush drops the waiting save', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    schedulePush(run)
    cancelPush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run).not.toHaveBeenCalled()
  })

  it('pushes run in order: a newer save never lands before an older one', async () => {
    const order: string[] = []
    let release!: () => void
    schedulePush(() => new Promise<void>((r) => (release = () => (order.push('old'), r()))))
    flushPush()
    schedulePush(async () => void order.push('new'))
    flushPush()
    await Promise.resolve()
    expect(order).toEqual([])
    release()
    await vi.waitFor(() => expect(order).toEqual(['old', 'new']))
  })
})
