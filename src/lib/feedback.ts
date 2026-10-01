// Messages to the developer (side menu → Contact the developer), stored in Supabase table `feedback` (migration
// 0019) and read in Admin → Messages. The database fills in who sent it and when; this sends what they wrote, plus a
// little context for bug reports. The admin's answers (migration 0024) come back through my_feedback(): the player's
// own messages, kept here in `useInbox` for the history and the pop-up of answers not seen yet.
import { create } from 'zustand'
import { deviceId } from '@/analytics/track'
import { getLang } from '@/i18n'
import { useGame } from '@/store/game'
import { getSupabase } from './supabase'

export const FEEDBACK_TITLE_MAX = 120
export const FEEDBACK_MESSAGE_MAX = 4000

/** Why a message didn't go: too many sent just now (3 per 10 minutes), or anything else (offline, no Supabase). */
export type FeedbackError = 'rate_limited' | 'failed'

export interface FeedbackRow {
  id: number
  created_at: string
  user_id: string | null
  email: string | null
  device_id: string
  player_name: string | null
  title: string
  message: string
  context: Record<string, unknown>
  read: boolean
  /** The admin's answer (migration 0024); null until there is one. */
  reply?: string | null
  replied_at?: string | null
  /** The player has seen the answer. */
  reply_seen?: boolean
}

/** One of the player's own messages, as my_feedback() returns it. */
export interface MyMessage {
  id: number
  created_at: string
  title: string
  message: string
  reply: string | null
  replied_at: string | null
  reply_seen: boolean
}

/** Answers the player hasn't seen yet, oldest first. */
export const unseenReplies = (messages: MyMessage[]) =>
  messages.filter((m) => m.reply && !m.reply_seen).reverse()

interface Inbox {
  /** Null until the first load comes back (or when it failed). */
  messages: MyMessage[] | null
  loading: boolean
  /** Fetches the player's messages and answers. Quiet on failure: offline, or the migration hasn't been run. */
  load: () => Promise<void>
  /** Marks these answers seen, here at once and in the database in the background. */
  markSeen: (ids: number[]) => void
}

export const useInbox = create<Inbox>((set, get) => ({
  messages: null,
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const client = await getSupabase()
      if (!client) return
      const { data, error } = await client.rpc('my_feedback', { p_device_id: deviceId() })
      if (error) throw new Error(error.message)
      set({ messages: (data ?? []) as MyMessage[] })
    } catch (err) {
      console.warn('[feedback] answers not loaded:', err instanceof Error ? err.message : err)
    } finally {
      set({ loading: false })
    }
  },
  markSeen: (ids) => {
    if (!ids.length) return
    set({
      messages: get().messages?.map((m) => (ids.includes(m.id) ? { ...m, reply_seen: true } : m)) ?? null,
    })
    void (async () => {
      try {
        const client = await getSupabase()
        if (!client) return
        const { error } = await client.rpc('feedback_reply_seen', { p_ids: ids, p_device_id: deviceId() })
        if (error) throw new Error(error.message)
      } catch (err) {
        console.warn('[feedback] answers not marked seen:', err instanceof Error ? err.message : err)
      }
    })()
  },
}))

export async function sendFeedback(title: string, message: string): Promise<FeedbackError | null> {
  try {
    return await insert(title, message)
  } catch (err) {
    console.warn('[feedback] not sent:', err instanceof Error ? err.message : err)
    return 'failed'
  }
}

async function insert(title: string, message: string): Promise<FeedbackError | null> {
  const client = await getSupabase()
  if (!client) return 'failed'
  const { save, data } = useGame.getState()
  const { error } = await client.from('feedback').insert({
    device_id: deviceId(),
    player_name: save?.player?.name?.trim().slice(0, 40) || null,
    title: title.trim().slice(0, FEEDBACK_TITLE_MAX),
    message: message.trim().slice(0, FEEDBACK_MESSAGE_MAX),
    context: {
      lang: getLang(),
      area: save?.currentAreaId ?? null,
      configVersion: data.config.configVersion,
      screen: typeof window === 'undefined' ? null : `${window.innerWidth}×${window.innerHeight}`,
      userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 300),
    },
  })
  if (!error) return null
  console.warn('[feedback] not sent:', error.message)
  return error.message.includes('feedback_rate_limited') ? 'rate_limited' : 'failed'
}
