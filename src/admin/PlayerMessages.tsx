// Admin → Analytics → a player's profile → Messages: write to the player first (a title, the words, gifts if you like:
// docs/15 §23), and every message between you, with the same cards as Admin → Messages. A signed-in player gets it on
// their account, wherever they play; a guest on the device their daily ping came from.
import { useCallback, useEffect, useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { PixelIcon } from '@/components/icons'
import type { Gift, SaveData } from '@/engine'
import { FEEDBACK_MESSAGE_MAX, FEEDBACK_TITLE_MAX, type FeedbackRow } from '@/lib/feedback'
import { isSupabaseConfigured } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'
import { GiftEditor } from './GiftEditor'
import { client, MessageCard } from './sections/MessagesSection'
import { inputCls } from './widgets'

/** Who the analytics key names: a signed-in player's account, or a guest's device ('device:<id>'). */
export function playerTarget(player: string): { userId: string | null; deviceId: string } {
  return player.startsWith('device:')
    ? { userId: null, deviceId: player.slice('device:'.length) }
    : { userId: player, deviceId: '' }
}

export function PlayerMessages({
  player,
  name,
  save,
  deviceId,
}: {
  player: string
  name: string
  save?: SaveData | null
  /** A signed-in player's latest device: its guest messages show too (below). */
  deviceId?: string | null
}) {
  const data = useGame((s) => s.data)
  const target = playerTarget(player)
  // A guest who signs in becomes one player with their account in Analytics (0102, docs/57), and the game still shows
  // that device's guest messages once signed in (my_feedback), so the profile shows them too.
  const guestDevice = target.userId ? deviceId || null : null
  const [rows, setRows] = useState<FeedbackRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [words, setWords] = useState('')
  const [gifts, setGifts] = useState<Gift[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const q = (await client())
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      const { data: got, error } = await (target.userId
        ? guestDevice
          ? q.or(
              `user_id.eq.${target.userId},and(user_id.is.null,device_id.eq."${guestDevice.replace(/["\\]/g, '\\$&')}")`,
            )
          : q.eq('user_id', target.userId)
        : q.is('user_id', null).eq('device_id', target.deviceId))
      if (error) throw error
      setRows((got ?? []) as FeedbackRow[])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [target.userId, target.deviceId, guestDevice])

  useEffect(() => {
    if (isSupabaseConfigured) void load()
  }, [load])

  if (!isSupabaseConfigured) return <p className="text-lg text-muted">Messages need Supabase.</p>

  const ready = !!title.trim() && !!words.trim() && !busy
  const send = async () => {
    if (!ready) return
    setBusy(true)
    try {
      // The database checks you're the admin, stamps the time and keeps the row for this player only (0048).
      const { data: row, error } = await (
        await client()
      )
        .from('feedback')
        .insert({
          from_admin: true,
          user_id: target.userId,
          device_id: target.deviceId,
          player_name: name.slice(0, 40),
          title: title.trim().slice(0, FEEDBACK_TITLE_MAX),
          message: '',
          reply: words.trim().slice(0, FEEDBACK_MESSAGE_MAX),
          gifts: gifts.length ? gifts : null,
        })
        .select('*')
        .single()
      if (error) throw error
      setRows((cur) => [row as FeedbackRow, ...(cur ?? [])])
      setTitle('')
      setWords('')
      setGifts([])
      pushToast(gifts.length ? `Message and gifts sent to ${name}` : `Message sent to ${name}`, 'good')
    } catch (e) {
      pushToast(e instanceof Error ? e.message : String(e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base leading-snug text-muted">
        {target.userId
          ? `${name} gets it on their account, the next time they open the game (or come back to it).`
          : `${name} plays as a guest: they get it on the device they last played on.`}{' '}
        Gifts open when they close the message.
        {guestDevice &&
          " Below: their account's messages, and their device's from when they played there as a guest."}
      </p>
      <label className="flex flex-col gap-1 text-base">
        Title
        <input
          className={inputCls}
          value={title}
          maxLength={FEEDBACK_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-base">
        Message
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          maxLength={FEEDBACK_MESSAGE_MAX}
          rows={4}
          className="copy w-full resize-y border-[3px] border-edge bg-panel p-2 text-lg leading-snug"
        />
      </label>
      <GiftEditor data={data} gifts={gifts} onChange={setGifts} save={save} />
      <div className="flex justify-end">
        <PixelButton size="sm" variant="primary" disabled={!ready} onClick={() => void send()}>
          <PixelIcon name="mail" size={18} /> Send to {name}
        </PixelButton>
      </div>
      {err && (
        <p className="text-danger">
          Could not load the messages: {err} (gifts and messages from you need 0048_message_gifts.sql)
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((m) => (
            <MessageCard
              key={m.id}
              m={m}
              save={save}
              onChange={(next) => setRows((cur) => cur?.map((r) => (r.id === next.id ? next : r)) ?? cur)}
              onDelete={() => setRows((cur) => cur?.filter((r) => r.id !== m.id) ?? cur)}
            />
          ))}
        </ul>
      )}
      {rows && !rows.length && <p className="text-base text-muted">No messages between you yet.</p>}
    </div>
  )
}
