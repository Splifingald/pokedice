// Admin → Messages: what players sent through the side menu → Contact the developer (table feedback, migration 0019,
// admin-only reads via RLS), and what you wrote to a player from their profile (0048). Newest first; answer (0025: the
// player sees it, and it marks the message read), with gifts if you like (0048: items and Pokémon, opened when the
// player closes the message), mark read / unread, or delete. A player's profile lists theirs with the same cards.
import { PixelIcon } from '@/components/icons'
import { useCallback, useEffect, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { welcomeBackNote, type Gift, type SaveData } from '@/engine'
import { FEEDBACK_MESSAGE_MAX, type FeedbackRow } from '@/lib/feedback'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { GiftEditor, GiftList, GiftsSwitch } from '../GiftEditor'

export async function client() {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase is not configured')
  return c
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Who sent it (or, for yours, who it's for): trainer name, then the Google account, or "guest" and the device id. */
function sender(m: FeedbackRow) {
  const name = m.player_name || 'No name'
  if (m.email) return `${name} · ${m.email}`
  if (m.from_admin && m.user_id) return `${name} · signed-in player`
  return `${name} · guest ${m.device_id.slice(0, 8)}`
}

/** The words as stored, or, for a welcome back the server wrote (docs/56), what they stand for. */
function replyText(reply: string) {
  const note = welcomeBackNote(reply)
  return note
    ? `Welcome back (sent by the game): away ${note.days} days, the ${note.minDays}-day tier. The player reads it in their language.`
    : reply
}

const sameGifts = (a: Gift[] | null | undefined, b: Gift[]) => JSON.stringify(a ?? []) === JSON.stringify(b)

/** The gifts on a message, and whether the player has opened them. */
function GiftsLine({ m }: { m: FeedbackRow }) {
  const data = useGame((s) => s.data)
  if (!m.gifts?.length) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-lg leading-none">
        <b className="flex items-center gap-1.5 font-normal">
          <PixelIcon name="gift" size={18} />
          {m.gifts.length === 1 ? 'A gift' : `${m.gifts.length} gifts`}
        </b>
        <span className={cx('text-base', m.gifts_claimed_at ? 'text-good' : 'text-muted')}>
          {m.gifts_claimed_at ? `Opened ${when(m.gifts_claimed_at)}` : 'Not opened yet'}
        </span>
      </p>
      <GiftList data={data} gifts={m.gifts} />
    </div>
  )
}

/** One message: what the player wrote (none for yours), the answer, its gifts, and what you can do with it. */
export function MessageCard({
  m,
  onChange,
  onDelete,
  save,
}: {
  m: FeedbackRow
  onChange: (m: FeedbackRow) => void
  onDelete: () => void
  /** The player's save when known (their profile): the gift editor says where each gift would land. */
  save?: SaveData | null
}) {
  const data = useGame((s) => s.data)
  const [busy, setBusy] = useState(false)
  // The answer being written, or null when the editor is closed.
  const [draft, setDraft] = useState<string | null>(null)
  const [gifts, setGifts] = useState<Gift[]>(m.gifts ?? [])
  const [giving, setGiving] = useState(false)
  const opened = !!m.gifts_claimed_at
  const context = Object.entries(m.context ?? {}).filter(([, v]) => v !== null && v !== '')
  const mine = !!m.from_admin

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
  const open = () => {
    setDraft(m.reply ?? '')
    setGifts(m.gifts ?? [])
    setGiving(!!m.gifts?.length)
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
      // Only what changed: an opened gift stays as it was opened (the database keeps it so anyway).
      const patch: { reply: string; gifts?: Gift[] | null } = { reply }
      if (!opened && !sameGifts(m.gifts, gifts)) patch.gifts = gifts.length ? gifts : null
      // The database stamps the time, marks it read and shows it to the player again.
      const { data: row, error } = await (
        await client()
      )
        .from('feedback')
        .update(patch)
        .eq('id', m.id)
        .select('*')
        .single()
      if (error) throw error
      onChange({ ...m, ...patch, ...(row as Partial<FeedbackRow>), read: true })
      setDraft(null)
      pushToast(patch.gifts?.length ? 'Answer and gifts sent' : 'Answer sent', 'good')
    })
  const remove = () =>
    run(async () => {
      const unopened = m.gifts?.length && !opened ? ' Its gifts have not been opened: they go too.' : ''
      if (!window.confirm(`Delete "${m.title}"? This can't be undone.${unopened}`)) return
      const { error } = await (await client()).from('feedback').delete().eq('id', m.id)
      if (error) throw error
      onDelete()
    })

  return (
    <li className={cx('pixel-panel flex flex-col gap-2 p-3', !m.read && 'border-l-[6px] border-l-gold')}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="min-w-0 break-words text-2xl leading-none">
          {!m.read && <span className="mr-2 text-base text-danger">NEW</span>}
          {mine && <span className="mr-2 bg-sky px-1 text-base text-ink shadow-ring-line">FROM YOU</span>}
          {m.title}
        </h3>
        <span className="ml-auto text-base text-muted">{when(m.created_at)}</span>
      </div>
      <p className="text-lg text-muted">
        {mine ? 'To ' : ''}
        {sender(m)}
      </p>
      {!mine && <p className="copy whitespace-pre-wrap break-words text-lg leading-snug">{m.message}</p>}
      {m.reply && draft === null && (
        <div className="border-2 border-edge bg-gold/30 p-2">
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-lg leading-none">
            <b>{mine ? 'Your message' : 'Your answer'}</b>
            <span className="text-base text-muted">
              {m.replied_at ? when(m.replied_at) : ''}
              {m.reply_seen ? ' · seen' : ' · not seen yet'}
            </span>
          </p>
          <p className="copy mt-1 whitespace-pre-wrap break-words text-lg leading-snug">{replyText(m.reply)}</p>
        </div>
      )}
      {draft === null && <GiftsLine m={m} />}
      {draft !== null && (
        <>
          <label className="flex flex-col gap-1 text-lg">
            {mine ? 'Message' : 'Answer'} — the player sees it the next time they open the game
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={FEEDBACK_MESSAGE_MAX}
              rows={5}
              autoFocus
              className="copy w-full resize-y border-[3px] border-edge bg-panel p-2 text-lg leading-snug"
            />
          </label>
          {opened ? (
            <GiftsLine m={m} />
          ) : giving ? (
            <GiftEditor data={data} gifts={gifts} onChange={setGifts} save={save} />
          ) : (
            <PixelButton size="sm" className="self-start" disabled={busy} onClick={() => setGiving(true)}>
              <PixelIcon name="gift" size={18} /> Add a gift
            </PixelButton>
          )}
        </>
      )}
      {context.length > 0 && (
        <p className="break-words font-mono text-xs text-muted">
          {context.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {draft === null ? (
          <PixelButton size="sm" variant="primary" disabled={busy} onClick={open}>
            {mine ? 'Edit message' : m.reply ? 'Edit answer' : 'Reply'}
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
              {mine ? 'Save message' : 'Send answer'}
            </PixelButton>
          </>
        )}
        {!mine && (
          <PixelButton size="sm" disabled={busy} onClick={() => void toggleRead()}>
            {m.read ? 'Mark unread' : 'Mark read'}
          </PixelButton>
        )}
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
        <h2 className="flex items-center gap-2 text-4xl leading-none">
          <PixelIcon name="mail" size={26} />
          Messages
        </h2>
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
      <div className="pixel-panel flex flex-col gap-1 p-3">
        <GiftsSwitch />
        <p className="text-base leading-snug text-muted">
          Gifts ride on an answer here, or on a message you write from a player's profile (Analytics → a
          player). Saved with Save changes.
        </p>
      </div>

      {error ? (
        <div className="pixel-panel flex flex-col gap-2 p-4">
          <p className="text-danger">Could not load messages: {error}</p>
          <p>
            Has supabase/migrations/0019_feedback.sql been run? Answers need 0025_feedback_replies.sql too,
            gifts 0048_message_gifts.sql.
          </p>
        </div>
      ) : !rows ? (
        <p className="text-xl">Loading…</p>
      ) : !shown.length ? (
        <p className="text-xl text-muted">{unreadOnly ? 'No unread messages.' : 'No messages yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((m) => (
            <MessageCard
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
