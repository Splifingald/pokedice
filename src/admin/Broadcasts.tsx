// Admin › Messages › Global messages (docs/69): one message for every player, or only those holding so many badges
// (every region's together), with a title, words (addresses become links, a YouTube address alone on its line the
// video) and gifts if you like. The server writes each player's copy when their game asks (migration 0143,
// broadcast_claim), and it pops up on Home. No switch: a message goes to every player it reaches as soon as it's sent
// (the user's call, 2026-11-08). It can be stopped (no one new gets it) or deleted (every copy goes).
import { useCallback, useEffect, useState } from 'react'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { ReplyBox } from '@/components/ContactModal'
import {
  BROADCAST_BADGES_MAX,
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  broadcastAudienceOk,
  parseGifts,
  type Gift,
} from '@/engine'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { GiftEditor, GiftList } from './GiftEditor'
import { inputCls, NumInput } from './widgets'

async function client() {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase is not configured')
  return c
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** A message as the table holds it. */
export interface BroadcastRow {
  id: number
  created_at: string
  title: string
  body: string
  min_badges: number
  max_badges: number | null
  gifts: Gift[] | null
  active: boolean
}

interface Stats {
  sent: number
  seen: number
  opened: number
}

/** "Every player" / "5 badges or more" / "0 to 2 badges" / "exactly 8 badges". */
export function audienceLabel(min: number, max: number | null): string {
  const b = (n: number) => `${n} badge${n === 1 ? '' : 's'}`
  if (max == null) return min === 0 ? 'Every player' : `${b(min)} or more`
  if (min === max) return `Exactly ${b(min)}`
  return `${min} to ${b(max)}`
}

/** The form: title, words, badges, gifts, and how the player will see it. */
function Composer({ onSent }: { onSent: (row: BroadcastRow) => void }) {
  const data = useGame((s) => s.data)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [min, setMin] = useState<number>(0)
  const [max, setMax] = useState<number | null>(null)
  const [gifts, setGifts] = useState<Gift[]>([])
  const [giving, setGiving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const audience = { minBadges: min, maxBadges: max }
  const rangeOk = broadcastAudienceOk(audience)
  const ready = !!title.trim() && !!body.trim() && rangeOk && !busy

  const send = async () => {
    if (!ready) return
    const who = audienceLabel(min, max).toLowerCase()
    const gift = gifts.length ? ` with ${gifts.length === 1 ? 'a gift' : `${gifts.length} gifts`}` : ''
    if (
      !window.confirm(
        `Send "${title.trim()}"${gift} to ${who === 'every player' ? 'every player' : `players with ${who}`}?`,
      )
    )
      return
    setBusy(true)
    try {
      const { data: row, error } = await (
        await client()
      )
        .from('broadcasts')
        .insert({
          title: title.trim(),
          body: body.trim(),
          min_badges: min,
          max_badges: max,
          gifts: gifts.length ? gifts : null,
        })
        .select('*')
        .single()
      if (error) throw error
      onSent(row as BroadcastRow)
      setTitle('')
      setBody('')
      setMin(0)
      setMax(null)
      setGifts([])
      setGiving(false)
      setPreview(false)
      pushToast('Global message sent: players get it as their game next asks', 'good')
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-lg">
        Title — the pop-up’s
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={BROADCAST_TITLE_MAX}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-lg">
        Message
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BROADCAST_BODY_MAX}
          rows={6}
          className="copy w-full resize-y border-[3px] border-edge bg-panel p-2 text-lg leading-snug"
        />
        <span className="text-base text-muted">
          Addresses (https://… or www.…) become links. A YouTube address on a line of its own becomes the
          video, played in the message. One language: the words are shown as you write them.
        </span>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-36 flex-col text-base">
          At least (badges)
          <NumInput
            value={min}
            min={0}
            max={BROADCAST_BADGES_MAX}
            onChange={(v) => setMin(Math.max(0, Math.min(BROADCAST_BADGES_MAX, Math.round(v ?? 0))))}
          />
        </label>
        <label className="flex w-36 flex-col text-base">
          At most (empty: no top)
          <NumInput
            value={max}
            min={0}
            max={BROADCAST_BADGES_MAX}
            nullable
            onChange={(v) =>
              setMax(v == null ? null : Math.max(0, Math.min(BROADCAST_BADGES_MAX, Math.round(v))))
            }
          />
        </label>
        <span
          className={cx('flex min-h-[34px] items-center text-base', rangeOk ? 'text-muted' : 'text-danger')}
        >
          {rangeOk
            ? `${audienceLabel(min, max)} — every region’s badges together. A player who reaches the range later gets it then, while it runs.`
            : '“At most” can’t be under “at least”.'}
        </span>
      </div>
      {giving ? (
        <GiftEditor
          data={data}
          gifts={gifts}
          onChange={setGifts}
          hint="each player opens them when they close the message"
        />
      ) : (
        <PixelButton size="sm" className="self-start" onClick={() => setGiving(true)}>
          <PixelIcon name="gift" size={18} /> Add a gift for everyone
        </PixelButton>
      )}
      {preview && body.trim() && (
        <div className="flex flex-col gap-1 bg-paper p-3 shadow-card">
          <p className="text-base text-muted">How it reads in the game (the pop-up and My messages):</p>
          <p className="break-words text-2xl leading-tight">{title.trim() || '(no title)'}</p>
          <ReplyBox reply={body.trim()} at={new Date().toISOString()} fromDev />
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <PixelButton size="sm" disabled={!body.trim()} onClick={() => setPreview((p) => !p)}>
          {preview ? 'Hide preview' : 'Preview'}
        </PixelButton>
        <PixelButton size="sm" variant="primary" disabled={!ready} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send to players'}
        </PixelButton>
      </div>
    </div>
  )
}

/** One message sent: what it says, who it reaches, its numbers, Stop / Resume and Delete. */
function BroadcastCard({
  b,
  stats,
  onChange,
  onDelete,
}: {
  b: BroadcastRow
  stats: Stats | undefined
  onChange: (b: BroadcastRow) => void
  onDelete: () => void
}) {
  const data = useGame((s) => s.data)
  const [busy, setBusy] = useState(false)
  const gifts = parseGifts(b.gifts)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setBusy(false)
    }
  }
  const toggle = () =>
    run(async () => {
      const { error } = await (await client()).from('broadcasts').update({ active: !b.active }).eq('id', b.id)
      if (error) throw error
      onChange({ ...b, active: !b.active })
    })
  const remove = () =>
    run(async () => {
      const copies = stats?.sent
        ? ` Its ${stats.sent} copies go from players’ messages too, opened gifts or not.`
        : ''
      if (!window.confirm(`Delete "${b.title}"? This can't be undone.${copies}`)) return
      const { error } = await (await client()).from('broadcasts').delete().eq('id', b.id)
      if (error) throw error
      onDelete()
    })
  return (
    <li className={cx('pixel-panel flex flex-col gap-2 p-3', b.active && 'border-l-[6px] border-l-gold')}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="min-w-0 break-words text-2xl leading-none">
          <span
            className={cx('mr-2 px-1 text-base text-ink shadow-ring-line', b.active ? 'bg-gold' : 'bg-well')}
          >
            {b.active ? 'RUNNING' : 'STOPPED'}
          </span>
          {b.title}
        </h3>
        <span className="ml-auto text-base text-muted">{when(b.created_at)}</span>
      </div>
      <p className="text-lg text-muted">
        {audienceLabel(b.min_badges, b.max_badges)}
        {' · '}
        {stats
          ? `${stats.sent} sent · ${stats.seen} seen${gifts.length ? ` · ${stats.opened} gifts opened` : ''}`
          : 'none sent yet'}
      </p>
      <ReplyBox reply={b.body} at={null} fromDev />
      {gifts.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-lg leading-none">
            <PixelIcon name="gift" size={18} />
            {gifts.length === 1 ? 'A gift for each' : `${gifts.length} gifts for each`}
          </p>
          <GiftList data={data} gifts={gifts} />
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <PixelButton size="sm" disabled={busy} onClick={() => void toggle()}>
          {b.active ? 'Stop (no one new gets it)' : 'Resume'}
        </PixelButton>
        <PixelButton size="sm" variant="danger" disabled={busy} onClick={() => void remove()}>
          Delete
        </PixelButton>
      </div>
    </li>
  )
}

/** The section: the form, and every message sent, newest first. */
export function BroadcastsPanel() {
  const [rows, setRows] = useState<BroadcastRow[] | null>(null)
  const [stats, setStats] = useState<Record<number, Stats>>({})
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await client()
      const { data, error } = await c.from('broadcasts').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setRows((data ?? []) as BroadcastRow[])
      const { data: s, error: e2 } = await c.rpc('broadcast_stats')
      if (e2) throw e2
      setStats(
        Object.fromEntries(
          ((s ?? []) as { id: number; sent: number; seen: number; opened: number }[]).map((r) => [
            Number(r.id),
            { sent: Number(r.sent), seen: Number(r.seen), opened: Number(r.opened) },
          ]),
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured) void load()
  }, [load])

  return (
    <div className="pixel-panel flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-2xl leading-none">
          <PixelIcon name="mail" size={22} />
          Global messages
        </h3>
        <span className="flex-1" />
        <PixelButton size="sm" onClick={() => void load()}>
          Refresh
        </PixelButton>
        <PixelButton
          size="sm"
          variant={writing ? undefined : 'primary'}
          onClick={() => setWriting((w) => !w)}
        >
          {writing ? 'Close the form' : 'Write one'}
        </PixelButton>
      </div>
      <p className="text-base leading-snug text-muted">
        One message for every player, or for those with so many badges (every region’s together). Each player
        who qualifies gets their copy the next time their game asks (on load, on the way to Home, at most
        every 10 minutes), and it pops up on Home. No switch: a message goes out as soon as you send it. Gifts
        need the Gifts switch above.
      </p>
      {writing && (
        <Composer
          onSent={(row) => {
            setRows((cur) => [row, ...(cur ?? [])])
            setWriting(false)
          }}
        />
      )}
      {error ? (
        <p className="text-danger">
          Could not load the global messages: {error}. Has supabase/migrations/0143_broadcasts.sql been run?
        </p>
      ) : !rows ? (
        <p className="text-lg">Loading…</p>
      ) : !rows.length ? (
        <p className="text-lg text-muted">No global message yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((b) => (
            <BroadcastCard
              key={b.id}
              b={b}
              stats={stats[b.id]}
              onChange={(next) => setRows((cur) => cur?.map((r) => (r.id === next.id ? next : r)) ?? cur)}
              onDelete={() => setRows((cur) => cur?.filter((r) => r.id !== b.id) ?? cur)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
