// The server watch (docs/66 §4): reads Supabase's metrics every 5 minutes, decides what to tell the admin on Discord,
// and whether the database should grow one size. Pure: netlify/functions/ops-watch.mts fetches and posts.

export type Metric = 'cpu' | 'ram' | 'disk' | 'connections'
export type Level = 'ok' | 'warn' | 'crit'
export const METRICS: readonly Metric[] = ['cpu', 'ram', 'disk', 'connections']

/** Shares in [0, 1]; null when the metrics didn't carry it. */
export type Readings = Record<Metric, number | null> & { swapMb: number | null }

/** Warn / critical, as shares. RAM counts what Postgres holds, not the file cache the OS gives back. */
export const THRESHOLDS: Record<Metric, { warn: number; crit: number }> = {
  cpu: { warn: 0.7, crit: 0.9 },
  ram: { warn: 0.85, crit: 0.95 },
  disk: { warn: 0.8, crit: 0.9 },
  connections: { warn: 0.8, crit: 0.95 },
}

const LABEL = /(\w+)="((?:[^"\\]|\\.)*)"/g

export interface Series {
  labels: Record<string, string>
  value: number
}

/** Prometheus' text format: `name{label="v",…} value` per line, `#` comments. */
export function parseMetrics(text: string): Map<string, Series[]> {
  const out = new Map<string, Series[]>()
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const m = /^([a-zA-Z_:][\w:]*)(\{[^}]*\})?\s+(\S+)/.exec(line)
    if (!m) continue
    const value = Number(m[3])
    if (!Number.isFinite(value)) continue
    const labels: Record<string, string> = {}
    for (const [, k, v] of (m[2] ?? '').matchAll(LABEL)) labels[k!] = v!
    const list = out.get(m[1]!) ?? []
    list.push({ labels, value })
    out.set(m[1]!, list)
  }
  return out
}

const sum = (s: Series[] | undefined, keep: (l: Record<string, string>) => boolean = () => true) =>
  s?.filter((x) => keep(x.labels)).reduce((t, x) => t + x.value, 0)
const first = (m: Map<string, Series[]>, name: string, keep?: (l: Record<string, string>) => boolean) => {
  const s = m.get(name)?.filter((x) => !keep || keep(x.labels))
  return s?.length ? s[0]!.value : undefined
}

/** The CPU counters of one scrape: seconds idle and in total, over every core. */
export interface CpuSample {
  idle: number
  total: number
}

/**
 * The readings of one scrape. CPU is the busy share since the previous scrape's counters (`prev`); without them (the
 * first run, or a restart that reset the counters), the 5-minute load average over the number of cores.
 */
export function readingsOf(
  m: Map<string, Series[]>,
  prev: CpuSample | null,
  maxConnectionsFallback: number,
): { readings: Readings; cpu: CpuSample | null } {
  const cpuSeries = m.get('node_cpu_seconds_total')
  const idle = sum(cpuSeries, (l) => l.mode === 'idle')
  const total = sum(cpuSeries)
  const sample = idle !== undefined && total !== undefined && total > 0 ? { idle, total } : null
  let cpu: number | null = null
  if (sample && prev && sample.total > prev.total && sample.idle >= prev.idle)
    cpu = 1 - (sample.idle - prev.idle) / (sample.total - prev.total)
  else {
    const cores = new Set(cpuSeries?.map((s) => s.labels.cpu)).size
    const load5 = first(m, 'node_load5')
    if (load5 !== undefined && cores > 0) cpu = load5 / cores
  }

  const memTotal = first(m, 'node_memory_MemTotal_bytes')
  const available = first(m, 'node_memory_MemAvailable_bytes')
  const free = first(m, 'node_memory_MemFree_bytes')
  const buffers = first(m, 'node_memory_Buffers_bytes') ?? 0
  const cached = first(m, 'node_memory_Cached_bytes') ?? 0
  let ram: number | null = null
  if (memTotal) {
    if (available !== undefined) ram = 1 - available / memTotal
    else if (free !== undefined) ram = (memTotal - free - buffers - cached) / memTotal
  }
  const swapTotal = first(m, 'node_memory_SwapTotal_bytes')
  const swapFree = first(m, 'node_memory_SwapFree_bytes')
  const swapMb = swapTotal !== undefined && swapFree !== undefined ? (swapTotal - swapFree) / 2 ** 20 : null

  const onData = (l: Record<string, string>) => l.mountpoint === '/data'
  const avail = first(m, 'node_filesystem_avail_bytes', onData)
  const size = first(m, 'node_filesystem_size_bytes', onData)
  const disk = avail !== undefined && size ? 1 - avail / size : null

  const backends = sum(m.get('pg_stat_database_num_backends'))
  const max = first(m, 'pg_settings_max_connections') ?? maxConnectionsFallback
  const connections = backends !== undefined && max > 0 ? backends / max : null

  const clamp = (x: number | null) => (x === null ? null : Math.min(1, Math.max(0, x)))
  return {
    readings: {
      cpu: clamp(cpu),
      ram: clamp(ram),
      disk: clamp(disk),
      connections: clamp(connections),
      swapMb,
    },
    cpu: sample,
  }
}

export const levelOf = (metric: Metric, value: number | null): Level =>
  value === null
    ? 'ok'
    : value >= THRESHOLDS[metric].crit
      ? 'crit'
      : value >= THRESHOLDS[metric].warn
        ? 'warn'
        : 'ok'

interface Track {
  level: Level
  /** Runs in a row at this level. */
  runs: number
  /** The level last told on Discord, and when (ms). */
  told: Level
  toldAt: number
}

export interface WatchState {
  cpu?: CpuSample | null
  tracks?: Partial<Record<Metric, Track>>
  lastUpgradeAt?: number
  /** The UTC day the peaks are for, and the peaks so far. */
  day?: string
  peaks?: Partial<Record<Metric, number>>
}

export interface WatchOptions {
  /** Runs in a row before a level is told (2 = 10 minutes): a one-off spike says nothing. */
  sustain: number
  /** A level already told is told again after this long while it lasts (ms). */
  repeatMs: number
  /** Critical runs in a row on CPU or RAM before growing the database (3 = 15 minutes). */
  upgradeAfter: number
  /** At most one size up per this long (ms). */
  upgradeEveryMs: number
}

export const DEFAULT_OPTIONS: WatchOptions = {
  sustain: 2,
  repeatMs: 60 * 60_000,
  upgradeAfter: 3,
  upgradeEveryMs: 24 * 60 * 60_000,
}

const NAMES: Record<Metric, string> = {
  cpu: 'CPU',
  ram: 'Memory',
  disk: 'Disk',
  connections: 'DB connections',
}
const pct = (x: number | null | undefined) =>
  x === null || x === undefined ? '–' : `${Math.round(x * 100)} %`
const RANK: Record<Level, number> = { ok: 0, warn: 1, crit: 2 }

export interface WatchResult {
  state: WatchState
  /** Discord messages to post, in order. */
  messages: string[]
  /** CPU or RAM has been critical long enough, and no upgrade happened lately: grow one size. */
  upgrade: boolean
  /** Something is critical right now (for the optional ping). */
  critical: boolean
}

/** One run: the new state, what to say, whether to grow. */
export function evaluate(
  r: Readings,
  prev: WatchState,
  now: number,
  o: WatchOptions = DEFAULT_OPTIONS,
): WatchResult {
  const messages: string[] = []
  const tracks: Partial<Record<Metric, Track>> = {}
  const day = new Date(now).toISOString().slice(0, 10)

  // The day's peaks; a new UTC day posts yesterday's, so a quiet watch still says it is alive.
  let peaks = prev.day === day ? { ...prev.peaks } : {}
  if (prev.day && prev.day !== day)
    messages.push(
      `📊 Server, ${prev.day} (UTC) peaks — ` +
        METRICS.map((k) => `${NAMES[k]} ${pct(prev.peaks?.[k])}`).join(' · '),
    )
  for (const k of METRICS) {
    const v = r[k]
    if (v !== null) peaks = { ...peaks, [k]: Math.max(peaks[k] ?? 0, v) }
  }

  for (const k of METRICS) {
    const level = levelOf(k, r[k])
    const before = prev.tracks?.[k]
    const runs = before && before.level === level ? before.runs + 1 : 1
    let told = before?.told ?? 'ok'
    let toldAt = before?.toldAt ?? 0
    const held = runs >= o.sustain
    if (level !== 'ok' && held) {
      const worse = RANK[level] > RANK[told]
      const again = level === told && now - toldAt >= o.repeatMs
      if (worse || again) {
        const t = THRESHOLDS[k]
        messages.push(
          `${level === 'crit' ? '🔴' : '🟠'} ${NAMES[k]} at ${pct(r[k])} for ${runs * 5} min ` +
            `(${level === 'crit' ? 'critical' : 'warning'} from ${pct(level === 'crit' ? t.crit : t.warn)}).`,
        )
        told = level
        toldAt = now
      } else if (RANK[level] < RANK[told]) {
        // Down from critical to warning: said once, then the warning's own repeat.
        messages.push(`🟠 ${NAMES[k]} down to ${pct(r[k])}: still high.`)
        told = level
        toldAt = now
      }
    } else if (level === 'ok' && told !== 'ok' && held) {
      messages.push(`🟢 ${NAMES[k]} back to normal (${pct(r[k])}).`)
      told = 'ok'
      toldAt = now
    }
    tracks[k] = { level, runs, told, toldAt }
  }
  if (
    r.swapMb !== null &&
    r.swapMb > 256 &&
    (tracks.ram?.level ?? 'ok') !== 'ok' &&
    tracks.ram?.toldAt === now
  )
    messages.push(`↳ ${Math.round(r.swapMb)} MB in swap: the database is short of memory.`)

  const hot = (['cpu', 'ram'] as const).some(
    (k) => tracks[k]?.level === 'crit' && tracks[k]!.runs >= o.upgradeAfter,
  )
  const upgrade = hot && now - (prev.lastUpgradeAt ?? 0) >= o.upgradeEveryMs
  const critical = METRICS.some((k) => tracks[k]?.level === 'crit')

  return { state: { ...prev, tracks, day, peaks }, messages, upgrade, critical }
}

/** Supabase's compute sizes, smallest first (Management API add-on variants). */
export const COMPUTE_SIZES = [
  'ci_micro',
  'ci_small',
  'ci_medium',
  'ci_large',
  'ci_xlarge',
  'ci_2xlarge',
  'ci_4xlarge',
] as const

/** The next size up from `current`, if it stays at or under `max`; null otherwise. */
export function nextSize(current: string | null, max: string): string | null {
  const i = COMPUTE_SIZES.indexOf((current ?? 'ci_micro') as (typeof COMPUTE_SIZES)[number])
  const cap = COMPUTE_SIZES.indexOf(max as (typeof COMPUTE_SIZES)[number])
  if (i < 0 || cap < 0 || i + 1 > cap) return null
  return COMPUTE_SIZES[i + 1]!
}
