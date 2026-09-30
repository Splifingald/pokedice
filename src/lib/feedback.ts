// Messages to the developer (side menu → Contact the developer), stored in Supabase table `feedback` (migration
// 0019) and read in Admin → Messages. The database fills in who sent it and when; this sends what they wrote, plus a
// little context for bug reports.
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
}

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
