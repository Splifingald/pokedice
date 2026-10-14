// Admin → Config → Push notifications (docs/27): the three-way switch, the raid's hour and the quiet hours, then what
// the server knows: how many devices said yes, on which systems, what's waiting, and the last delivery (notices
// waiting past their time mean the sender is missing its settings on Netlify).
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_CONFIG, type PushConfig } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { agoText } from '@/lib/ago'
import { VAPID_PUBLIC_KEY } from '@/lib/push'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { AccessSwitch, Box, Field, NumInput } from '../widgets'
import { useConfigRow } from './ConfigSection'

interface PushStats {
  subscriptions: number
  players: number
  platforms: Record<string, number>
  topics: Record<string, number>
  waiting: number
  lastRun: string | null
  lastSent: number | null
}

const TOPIC_NAME: Record<string, string> = { egg: 'Day Care Eggs', raid: 'Daily raids', live: 'Live events' }

function usePushStats() {
  const [stats, setStats] = useState<PushStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const client = await getSupabase()
    if (!client) return setError('No Supabase in this build.')
    const { data, error: err } = await client.rpc('push_stats')
    if (err)
      setError(
        /push_stats|function/.test(err.message)
          ? 'Run supabase/migrations/0053_push.sql first.'
          : err.message,
      )
    else {
      setError(null)
      setStats(data as PushStats)
    }
  }, [])
  useEffect(() => {
    if (isSupabaseConfigured) void load()
  }, [load])
  return { stats, error, load }
}

export function PushBox() {
  const [raw, setRaw] = useConfigRow('push')
  const cfg: PushConfig = { ...DEFAULT_CONFIG.push, ...(raw ?? {}) }
  const set = (patch: Partial<PushConfig>) => setRaw({ ...cfg, ...patch })
  const { stats, error, load } = usePushStats()
  const hour = (v: number | null | undefined) => Math.max(0, Math.min(23, Math.round(v ?? 0)))
  const list = (o: Record<string, number> | undefined, names: Record<string, string> = {}) =>
    Object.entries(o ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${names[k] ?? k} ${n}`)
      .join(' · ') || '—'
  return (
    <Box
      title="Push notifications"
      icon="bell"
      hint="A Day Care Egg, the day's raid, a live event starting, sent to a player's phone or computer while the game is closed. Each feature asks once; players turn each topic off in Settings. The server checks the switch too."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg">Who gets them</span>
        <AccessSwitch
          value={cfg.access ?? 'off'}
          onChange={(access) => set({ access })}
          label="Push notifications: who gets them"
        />
        <span className="text-base text-muted">
          {cfg.access === 'all'
            ? 'Every player is asked, once per feature.'
            : cfg.access === 'admin'
              ? 'Only you are asked and sent anything (to try it first).'
              : 'Off: no question, no Settings row, nothing sent. Subscriptions are kept.'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Raid announced at" hint="the player's local hour, 0–23">
          <NumInput min={0} max={23} value={cfg.raidHour} onChange={(v) => set({ raidHour: hour(v) })} />
        </Field>
        <Field label="No Egg from" hint="local hour: it waits until…">
          <NumInput
            min={0}
            max={23}
            value={cfg.quietHours[0]}
            onChange={(v) => set({ quietHours: [hour(v), cfg.quietHours[1]] })}
          />
        </Field>
        <Field label="…until" hint="the same hour twice = never quiet">
          <NumInput
            min={0}
            max={23}
            value={cfg.quietHours[1]}
            onChange={(v) => set({ quietHours: [cfg.quietHours[0], hour(v)] })}
          />
        </Field>
      </div>
      <div className="grid gap-1 text-lg">
        {!VAPID_PUBLIC_KEY && (
          <p className="m-0 text-danger">
            This build has no VITE_VAPID_PUBLIC_KEY: players can't subscribe (docs/27 → Setting it up).
          </p>
        )}
        {error ? (
          <p className="m-0 text-danger">{error}</p>
        ) : stats ? (
          <>
            <p className="m-0">
              {stats.subscriptions} devices, {stats.players} players · {stats.waiting} notices waiting
            </p>
            <p className="m-0 text-muted">Systems: {list(stats.platforms)}</p>
            <p className="m-0 text-muted">Topics: {list(stats.topics, TOPIC_NAME)}</p>
            <p className={stats.lastRun ? 'm-0 text-muted' : 'm-0 text-danger'}>
              {stats.lastRun
                ? `Last delivery ${agoText(Date.parse(stats.lastRun), Date.now())}: ${stats.lastSent ?? 0} sent.`
                : "Nothing delivered yet. Notices waiting past their time? Check the sender's Netlify settings (docs/27)."}
            </p>
          </>
        ) : (
          <p className="m-0 text-muted">Loading…</p>
        )}
        <div>
          <PixelButton size="sm" onClick={() => void load()}>
            Refresh
          </PixelButton>
        </div>
      </div>
    </Box>
  )
}
