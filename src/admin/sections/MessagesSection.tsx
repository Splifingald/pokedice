// Admin → Messages: what players sent through the side menu → Contact the developer (table feedback, migration 0019,
// admin-only reads via RLS). Newest first; answer (migration 0025: the player sees it, and it marks the message read),
// mark read / unread, or delete.
import { useCallback, useEffect, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { FEEDBACK_MESSAGE_MAX, type FeedbackRow } from '@/lib/feedback'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { pushToast } from '@/store/game'
import { cx } from '@/theme/util'

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

/** Who sent it: trainer name, then the Google account, or "guest" and the start of the device id. */
function sender(m: FeedbackRow) {
  const name = m.player_name || 'No name'
  return m.email ? `${name} · ${m.email}` : `${name} · guest ${m.device_id.slice(0, 8)}`
}

function Message({
  m,
  onChange,
  onDelete,
}: {
  m: FeedbackRow
  onChange: (m: FeedbackRow) => void
  onDelete: () => void
}) {
  const [busy, setBusy] = useState(false)
  // The answer being written, or null when the editor is closed.
  const [draft, setDraft] = useState<string | null>(null)
  const context = Object.entries(m.context ?? {}).filter(([, v]) => v !== null && v !== '')

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
  const toggleRead = () =>
    run(async () => {
      const { error } = await (await client()).from('feedback').update({ read: !m.read }).eq('id', m.id)
      if (error) throw error
      onChange({ ...m, read: !m.read })
    })
  const sendReply = () =>
    run(async () => {
      const reply = draft?.trim() ?? ''
      if (!reply) return
      // The database stamps the time, marks it read and shows it to the player again.
      const { data, error } = await (
        await client()
      )
        .from('feedback')
        .update({ reply })
        .eq('id', m.id)
        .select('*')
        .single()
      if (error) throw error
      onChange({ ...m, ...(data as Partial<FeedbackRow>), reply, read: true })
      setDraft(null)
      pushToast('Answer sent', 'good')
    })
  const remove = () =>
    run(async () => {
      if (!window.confirm(`Delete "${m.title}"? This can't be undone.`)) return
      const { error } = await (await client()).from('feedback').delete().eq('id', m.id)
      if (error) throw error
      onDelete()
    })

  return (
    <li className={cx('pixel-panel flex flex-col gap-2 p-3', !m.read && 'border-l-[6px] border-l-gold')}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="min-w-0 break-words text-2xl leading-none">
          {!m.read && <span className="mr-2 text-base text-danger">NEW</span>}
          {m.title}
        </h3>
        <span className="ml-auto text-base text-muted">{when(m.created_at)}</span>
      </div>
      <p className="text-lg text-muted">{sender(m)}</p>
      <p className="copy whitespace-pre-wrap break-words text-lg leading-snug">{m.message}</p>
      {m.reply && draft === null && (
        <div className="border-2 border-ink bg-gold/30 p-2">
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-lg leading-none">
            <b>Your answer</b>
            <span className="text-base text-muted">
              {m.replied_at ? when(m.replied_at) : ''}
              {m.reply_seen ? ' · seen' : ' · not seen yet'}
            </span>
          </p>
          <p className="copy mt-1 whitespace-pre-wrap break-words text-lg leading-snug">{m.reply}</p>
        </div>
      )}
      {draft !== null && (
        <label className="flex flex-col gap-1 text-lg">
          Answer — the player sees it the next time they open the game
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={FEEDBACK_MESSAGE_MAX}
            rows={5}
            autoFocus
            className="copy w-full resize-y border-[3px] border-ink bg-panel p-2 text-lg leading-snug"
          />
        </label>
      )}
      {context.length > 0 && (
        <p className="break-words font-mono text-xs text-muted">
          {context.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {draft === null ? (
          <PixelButton size="sm" variant="primary" disabled={busy} onClick={() => setDraft(m.reply ?? '')}>
            {m.reply ? 'Edit answer' : 'Reply'}
          </PixelButton>
        ) : (
          <>
            <PixelButton size="sm" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </PixelButton>
            <PixelButton
              size="sm"
              variant="primary"
              disabled={busy || !draft.trim()}
              onClick={() => void sendReply()}
            >
              Send answer
            </PixelButton>
          </>
        )}
        <PixelButton size="sm" disabled={busy} onClick={() => void toggleRead()}>
          {m.read ? 'Mark unread' : 'Mark read'}
        </PixelButton>
        <PixelButton size="sm" variant="danger" disabled={busy} onClick={() => void remove()}>
          Delete
        </PixelButton>
      </div>
    </li>
  )
}

export function MessagesSection() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { data, error } = await (
        await client()
      )
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      setRows((data ?? []) as FeedbackRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured) void load()
  }, [load])

  if (!isSupabaseConfigured)
    return <p className="text-xl">Messages need Supabase — this admin is running offline.</p>

  const unread = rows?.filter((m) => !m.read).length ?? 0
  const shown = (rows ?? []).filter((m) => !unreadOnly || !m.read)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-4xl leading-none">Messages</h2>
        {rows && (
          <span className="text-xl text-muted">
            {rows.length} total · {unread} unread
          </span>
        )}
        <span className="flex-1" />
        <div className="flex gap-1" role="group" aria-label="Show">
          {[
            { id: false, label: 'All' },
            { id: true, label: 'Unread' },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={unreadOnly === f.id}
              onClick={() => setUnreadOnly(f.id)}
              className={cx('pixel-btn px-2 py-0.5 text-lg', unreadOnly === f.id ? 'bg-gold' : 'bg-panel')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <PixelButton size="sm" onClick={() => void load()}>
          Refresh
        </PixelButton>
      </div>

      {error ? (
        <div className="pixel-panel flex flex-col gap-2 p-4">
          <p className="text-danger">Could not load messages: {error}</p>
          <p>
            Has supabase/migrations/0019_feedback.sql been run? Answers need 0025_feedback_replies.sql too.
          </p>
        </div>
      ) : !rows ? (
        <p className="text-xl">Loading…</p>
      ) : !shown.length ? (
        <p className="text-xl text-muted">{unreadOnly ? 'No unread messages.' : 'No messages yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((m) => (
            <Message
              key={m.id}
              m={m}
              onChange={(next) => setRows((cur) => cur?.map((r) => (r.id === next.id ? next : r)) ?? cur)}
              onDelete={() => setRows((cur) => cur?.filter((r) => r.id !== m.id) ?? cur)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
