// The #events posts' job (netlify/functions/discord-live.mts, docs/50 §2): each live event's start, and the week's
// calendar on Monday mornings. It runs every minute because GitHub's hourly schedule ran only about 5 times a day and
// missed starts (2026-10-31). Each post is claimed in discord_live_posts first (migration 0106), so a post goes out
// once whatever runs overlap, and a post Discord refused is released for the next minute to try again. With a French
// webhook each post goes to #🥖-français too, under its own key, so one channel refusing never re-posts in the other.
import { liveStartsBetween, liveState, type GameData, type LiveEvent } from '@/engine'
import { frenchData } from '../../scripts/discord/french'
import { liveMessage } from '../../scripts/discord/live-event-post'
import { weekMessage, weekOf } from '../../scripts/discord/live-week-post'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** A start is still posted this long after it: an event Published late, a minute Netlify skipped. */
export const LATE_MS = 2 * HOUR
/** The Monday calendar goes out from 07:23 UTC, as the GitHub workflow did, within the next hour. */
const WEEK_FROM_MS = 7 * HOUR + 23 * MINUTE
const WEEK_UNTIL_MS = WEEK_FROM_MS + HOUR

type LiveConfig = GameData['config']['liveEvents']

export interface LiveJobDeps {
  /** The admin's live events (game_config `liveEvents`): one small read, every minute. */
  events: () => Promise<LiveConfig | null | undefined>
  /** The keys among these already posted. */
  posted: (keys: string[]) => Promise<Set<string>>
  /** The full content, read only when something is to be posted. */
  data: () => Promise<GameData>
  /** Takes the key; false when another run has it already. */
  claim: (key: string) => Promise<boolean>
  release: (key: string) => Promise<void>
  post: (message: unknown) => Promise<void>
  /** Posts to #🥖-français (DISCORD_FRENCH_WEBHOOK); without it, no French post. */
  postFrench?: (message: unknown) => Promise<void>
  roleId?: string
  site?: string
}

export interface LiveJobResult {
  posted: string[]
  failed: string[]
  /** Why nothing was looked at, when that's the case. */
  skipped?: string
}

/** The key of an event's start: a run moved to another start is a new post. */
export const startKey = (e: LiveEvent) => `start:${e.id}:${e.start}`

/** The same post's key in French. */
export const frenchKey = (key: string) => `fr:${key}`

/** The key of the week's calendar on Monday mornings, else null. */
export function weekKey(now: number): string | null {
  const { from } = weekOf(now)
  if (now < from + WEEK_FROM_MS || now >= from + WEEK_UNTIL_MS) return null
  return `week:${new Date(from).toISOString().slice(0, 10)}`
}

/** The runs that have started in the last LATE_MS and aren't over: what a start post is due for. */
export function startsToPost(data: Pick<GameData, 'config'>, now: number): LiveEvent[] {
  return liveStartsBetween(data as GameData, now - LATE_MS, now + 1).filter(
    (e) => liveState(e, now) !== 'ended',
  )
}

export async function runLiveJob(deps: LiveJobDeps, now: number): Promise<LiveJobResult> {
  const result: LiveJobResult = { posted: [], failed: [] }
  const live = await deps.events()
  if (live?.access !== 'all') return { ...result, skipped: `live events are "${live?.access ?? 'off'}"` }

  const week = weekKey(now)
  const english = [
    ...(week ? [week] : []),
    ...startsToPost({ config: { liveEvents: live } } as GameData, now).map(startKey),
  ]
  const wanted = deps.postFrench ? [...english, ...english.map(frenchKey)] : english
  if (!wanted.length) return result
  const done = await deps.posted(wanted)
  if (wanted.every((k) => done.has(k))) return result

  // Something is due: read what players get now, so the post says it.
  const data = await deps.data()
  if (data.config.liveEvents?.access !== 'all')
    return { ...result, skipped: 'live events turned off meanwhile' }
  const send = async (key: string, message: () => unknown, post = deps.post) => {
    if (done.has(key) || !(await deps.claim(key))) return
    const body = message()
    // A week without an event keeps its claim and posts nothing, as the GitHub workflow did.
    if (!body) return
    try {
      await post(body)
      result.posted.push(key)
    } catch (err) {
      result.failed.push(key)
      console.error(`[discord-live] ${key}: ${err instanceof Error ? err.message : String(err)}`)
      await deps.release(key)
    }
  }
  const postFrench = deps.postFrench
  const fr = postFrench ? frenchData(data) : null
  if (week) {
    await send(week, () => weekMessage(data, now, { site: deps.site }))
    if (fr)
      await send(frenchKey(week), () => weekMessage(fr, now, { site: deps.site, lang: 'fr' }), postFrench)
  }
  for (const e of startsToPost(data, now)) {
    await send(startKey(e), () => liveMessage(data, e, { roleId: deps.roleId, site: deps.site }))
    // No ping in French: the Event Pings role is the English channel's.
    if (fr)
      await send(
        frenchKey(startKey(e)),
        () => liveMessage(fr, e, { site: deps.site, lang: 'fr' }),
        postFrench,
      )
  }
  return result
}
