// The server watch's decisions (netlify/ops/watch.ts, docs/66 §4): the metrics read from Prometheus' text, when a high
// reading is told on Discord (held 10 minutes, repeated hourly, "back to normal" once), the day's peaks, and when the
// database grows one size.
import { describe, expect, it } from 'vitest'
import {
  evaluate,
  nextSize,
  parseMetrics,
  readingsOf,
  type Readings,
  type WatchState,
} from '../netlify/ops/watch'

const SCRAPE = (idle0: number, idle1: number, total: number) => `
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
node_cpu_seconds_total{cpu="0",mode="idle",service_type="db"} ${idle0}
node_cpu_seconds_total{cpu="0",mode="user",service_type="db"} ${total / 2 - idle0}
node_cpu_seconds_total{cpu="1",mode="idle",service_type="db"} ${idle1}
node_cpu_seconds_total{cpu="1",mode="user",service_type="db"} ${total / 2 - idle1}
node_load5{service_type="db"} 1.2
node_memory_MemTotal_bytes{service_type="db"} 1000
node_memory_MemAvailable_bytes{service_type="db"} 250
node_memory_SwapTotal_bytes{service_type="db"} ${1024 * 2 ** 20}
node_memory_SwapFree_bytes{service_type="db"} ${724 * 2 ** 20}
node_filesystem_avail_bytes{mountpoint="/data",service_type="db"} 300
node_filesystem_size_bytes{mountpoint="/data",service_type="db"} 1000
node_filesystem_avail_bytes{mountpoint="/",service_type="db"} 1
node_filesystem_size_bytes{mountpoint="/",service_type="db"} 1000
pg_stat_database_num_backends{datname="postgres",service_type="db"} 30
pg_stat_database_num_backends{datname="template1",service_type="db"} 0
`

const R = (over: Partial<Readings> = {}): Readings => ({
  cpu: 0.2,
  ram: 0.5,
  disk: 0.3,
  connections: 0.4,
  swapMb: 0,
  ...over,
})
const MIN = 60_000
const T0 = Date.UTC(2026, 10, 3, 10, 0)

/** Runs the watch every 5 minutes over these readings; every run's messages. */
function play(readings: Readings[], state: WatchState = {}, start = T0) {
  const said: string[][] = []
  let s = state
  let upgrades = 0
  readings.forEach((r, i) => {
    const res = evaluate(r, s, start + i * 5 * MIN)
    said.push(res.messages)
    if (res.upgrade) {
      upgrades++
      s = { ...res.state, lastUpgradeAt: start + i * 5 * MIN }
    } else s = res.state
  })
  return { said, state: s, upgrades }
}

describe('the server watch', () => {
  it('reads CPU from two scrapes, RAM without the cache, /data, connections over 60', () => {
    const first = readingsOf(parseMetrics(SCRAPE(400, 400, 1000)), null, 60)
    // No previous counters: the load average over two cores.
    expect(first.readings.cpu).toBeCloseTo(0.6)
    expect(first.cpu).toEqual({ idle: 800, total: 1000 })
    expect(first.readings).toMatchObject({ ram: 0.75, disk: 0.7, connections: 0.5, swapMb: 300 })
    // 200 s more, 50 of them idle: 75 % busy.
    const second = readingsOf(parseMetrics(SCRAPE(425, 425, 1200)), first.cpu, 60)
    expect(second.readings.cpu).toBeCloseTo(0.75)
    // Counters reset (a restart): back to the load average, not a negative share.
    expect(readingsOf(parseMetrics(SCRAPE(1, 1, 10)), first.cpu, 60).readings.cpu).toBeCloseTo(0.6)
  })

  it('a one-off spike says nothing; held 10 minutes it is told, then hourly, then "back to normal" once', () => {
    const { said } = play([R({ cpu: 0.95 }), R()])
    expect(said.flat()).toEqual([])
    const hot = Array.from({ length: 14 }, () => R({ cpu: 0.75 }))
    const run = play([...hot, R(), R(), R()])
    const told = run.said.flatMap((m, i) => m.map((x) => [i, x] as const))
    expect(told.map(([i]) => i)).toEqual([1, 13, 15])
    expect(told[0]![1]).toMatch(/^🟠 CPU at 75 % for 10 min/)
    expect(told[2]![1]).toMatch(/^🟢 CPU back to normal/)
  })

  it('warning to critical is told at once; critical back to warning once', () => {
    const { said } = play([
      R({ ram: 0.9 }),
      R({ ram: 0.9 }),
      R({ ram: 0.97 }),
      R({ ram: 0.97 }),
      R({ ram: 0.9 }),
      R({ ram: 0.9 }),
    ])
    expect(said.flat()).toEqual([
      expect.stringMatching(/^🟠 Memory at 90 %/),
      expect.stringMatching(/^🔴 Memory at 97 %/),
      expect.stringMatching(/^🟠 Memory down to 90 %/),
    ])
  })

  it('grows after 15 minutes critical on CPU or memory, at most once a day; not for disk', () => {
    const crit = Array.from({ length: 6 }, () => R({ cpu: 0.95 }))
    expect(play(crit.slice(0, 2)).upgrades).toBe(0)
    expect(play(crit).upgrades).toBe(1)
    expect(play(Array.from({ length: 6 }, () => R({ disk: 0.95 }))).upgrades).toBe(0)
  })

  it('posts the day’s peaks when the UTC day turns', () => {
    const late = Date.UTC(2026, 10, 3, 23, 55)
    const { said } = play([R({ cpu: 0.4 }), R({ cpu: 0.3, ram: 0.6 })], {}, late)
    expect(said[1]).toEqual([
      '📊 Server, 2026-11-03 (UTC) peaks — CPU 40 % · Memory 50 % · Disk 30 % · DB connections 40 %',
    ])
  })

  it('the next size: one step, never past the max', () => {
    expect(nextSize('ci_micro', 'ci_small')).toBe('ci_small')
    expect(nextSize('ci_small', 'ci_small')).toBeNull()
    expect(nextSize(null, 'ci_medium')).toBe('ci_small')
    expect(nextSize('ci_weird', 'ci_large')).toBeNull()
  })
})
