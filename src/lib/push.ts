// Push notifications in the game (docs/27-PUSH-NOTIFICATIONS.md). This browser's side of them: whether the player said
// yes, the topics they want, the one-time question each feature asks, the browser's permission and subscription, and
// the schedule the server sends from. The engine decides what to announce and when (engine/notify.ts); this file puts
// it in the player's words, with its picture (lib/pushArt.ts), and hands it over only when it changed.
//
// What the player chose is kept on this device (the permission and the subscription are the browser's own): a phone
// can say yes while a computer says no.
import { create } from 'zustand'
import {
  PUSH_TOPICS,
  isExtreme,
  liveShopRows,
  pushCfg,
  pushOn,
  pushPlan,
  type GameData,
  type LiveEvent,
  type PushNotice,
  type PushTopic,
  type SaveData,
} from '@/engine'
import { artUrl, pictureOf } from '@/fx/areaArt'
import { getLang, joinList, t } from '@/i18n'
import { deviceId } from './device'
import { platform, platformTag, pushSupport, type PushSupport } from './platform'
import { monArt, pictureArt, type PushArt } from './pushArt'
import { getSupabase, isSupabaseConfigured } from './supabase'

/** The VAPID public key the push services know the sender by (its private half is the sender's, netlify/). */
export const VAPID_PUBLIC_KEY = (import.meta.env ?? ({} as ImportMetaEnv)).VITE_VAPID_PUBLIC_KEY?.trim() || ''

/**
 * A feature's question, answered: `yes`, `no` (never asked again on that feature), or `install` (an iPhone in a Safari
 * tab was told to add the game to its Home Screen: asked once more when it's opened from there).
 */
export type PushAnswer = 'yes' | 'no' | 'install'

interface PushPrefs {
  /** This browser is subscribed: the player said yes and the browser agreed. */
  on: boolean
  /** Each topic's switch (Settings). Unset = on. */
  topics: Partial<Record<PushTopic, boolean>>
  asked: Partial<Record<PushTopic, PushAnswer>>
  /** The last subscription and schedule the server took: nothing is sent again while they're the same. */
  sentSub?: string
  sentPlan?: string
}

export interface PushState extends PushPrefs {
  permission: NotificationPermission | 'unsupported'
  /** The feature whose question is up, or null. */
  asking: PushTopic | null
  /** Turning on or off, under way. */
  busy: boolean
}

const KEY = 'pokedice.push'
const EMPTY: PushPrefs = { on: false, topics: {}, asked: {} }

function readPrefs(): PushPrefs {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as Partial<PushPrefs>) : {}
    return { ...EMPTY, ...v, topics: { ...v.topics }, asked: { ...v.asked } }
  } catch {
    return { ...EMPTY }
  }
}

function writePrefs(p: PushPrefs) {
  try {
    const { on, topics, asked, sentSub, sentPlan } = p
    localStorage.setItem(KEY, JSON.stringify({ on, topics, asked, sentSub, sentPlan }))
  } catch {
    /* private mode: this session remembers */
  }
}

const permissionNow = (): PushState['permission'] =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

export const usePush = create<PushState>(() => ({
  ...readPrefs(),
  permission: permissionNow(),
  asking: null,
  busy: false,
}))
usePush.subscribe((s, prev) => {
  if (
    s.on !== prev.on ||
    s.topics !== prev.topics ||
    s.asked !== prev.asked ||
    s.sentSub !== prev.sentSub ||
    s.sentPlan !== prev.sentPlan
  )
    writePrefs(s)
})

/** Push can be offered here: the cloud and the keys are set up, the admin's switch is on, the browser can take it. */
export const pushReady = (data: GameData): boolean =>
  isSupabaseConfigured && !!VAPID_PUBLIC_KEY && pushOn(data) && pushSupport() !== 'no'

/** The player gets this topic on this device. */
export const topicOn = (s: Pick<PushState, 'on' | 'topics'>, topic: PushTopic): boolean =>
  s.on && s.topics[topic] !== false

export const wantedTopics = (s: Pick<PushState, 'on' | 'topics'>): PushTopic[] =>
  PUSH_TOPICS.filter((x) => topicOn(s, x))

/**
 * A feature's question is due: push is off on this device, the browser hasn't blocked it, and this feature hasn't
 * been answered (an iPhone told to install: once more, from the Home Screen).
 */
export function askDue(
  s: Pick<PushState, 'on' | 'asked' | 'permission'>,
  topic: PushTopic,
  support: PushSupport,
): boolean {
  if (support === 'no' || s.on || s.permission === 'denied') return false
  const a = s.asked[topic]
  return a == null || (a === 'install' && support === 'yes')
}

/** Asks this feature's question (the pop-up, `PushAsk`), unless another is up. */
export function askPush(topic: PushTopic) {
  const s = usePush.getState()
  if (!s.asking && askDue(s, topic, pushSupport())) usePush.setState({ asking: topic })
}

const remember = (topic: PushTopic, answer: PushAnswer) =>
  usePush.setState((s) => ({
    asking: s.asking === topic ? null : s.asking,
    asked: { ...s.asked, [topic]: answer },
  }))

/** "No thanks": this feature never asks again (the others still ask once). Its topic stays off. */
export function declinePush(topic: PushTopic) {
  remember(topic, 'no')
  usePush.setState((s) => ({ topics: { ...s.topics, [topic]: false } }))
}

/** The iPhone's "OK" to the Home Screen steps: asked again once the game is opened from there. */
export const deferPush = (topic: PushTopic) => remember(topic, 'install')

// ---------------------------------------------------------------- the browser's subscription

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg =
    (await navigator.serviceWorker.getRegistration('/')) ??
    (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
  await navigator.serviceWorker.ready
  return reg
}

async function subscription(create: boolean): Promise<PushSubscription | null> {
  if (pushSupport() !== 'yes') return null
  const reg = create ? await registration() : await navigator.serviceWorker.getRegistration('/')
  if (!reg) return null
  const sub = await reg.pushManager.getSubscription()
  if (sub || !create) return sub
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
  })
}

/** Tells the server about this browser (again only when something changed: the owner, the topics, the language). */
async function sendSubscription(sub: PushSubscription, force = false): Promise<void> {
  const s = usePush.getState()
  const client = await getSupabase()
  if (!client) throw new Error('offline')
  const { data: auth } = await client.auth.getSession()
  const json = sub.toJSON()
  const topics = wantedTopics(s)
  const tag = platformTag(platform())
  const print = JSON.stringify([sub.endpoint, auth.session?.user.id ?? deviceId(), topics, getLang(), tag])
  if (!force && print === s.sentSub) return
  const { error } = await client.rpc('push_subscribe', {
    p_device: deviceId(),
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_platform: tag,
    p_lang: getLang(),
    p_topics: topics,
  })
  if (error) throw new Error(error.message)
  // A new owner or new topics: the schedule goes again too.
  usePush.setState({ sentSub: print, sentPlan: undefined })
}

export type EnableResult = 'on' | 'install' | 'denied' | 'failed'

/**
 * Turns push on, from a tap (the browser's own question needs one): asks the browser, subscribes, tells the server.
 * From a feature's question, that feature's topic is on and so is every topic not refused; from Settings, every topic
 * comes back on if all were off.
 */
export async function enablePush(topic: PushTopic | null): Promise<EnableResult> {
  const support = pushSupport()
  if (support === 'install') {
    if (topic) deferPush(topic)
    return 'install'
  }
  if (support !== 'yes') return 'failed'
  // First, still inside the tap: Safari only asks from one.
  const asked = Notification.requestPermission()
  usePush.setState({ busy: true })
  try {
    const permission = await asked
    usePush.setState({ permission })
    if (permission !== 'granted') {
      if (topic) remember(topic, 'no')
      return 'denied'
    }
    const s = usePush.getState()
    const topics = { ...s.topics }
    for (const x of PUSH_TOPICS) if (x === topic || (topic && s.asked[x] !== 'no')) topics[x] = true
    if (!topic && PUSH_TOPICS.every((x) => topics[x] === false)) for (const x of PUSH_TOPICS) topics[x] = true
    usePush.setState({ on: true, topics })
    const sub = await subscription(true)
    if (!sub) throw new Error('no subscription')
    await sendSubscription(sub, true)
    if (topic) remember(topic, 'yes')
    return 'on'
  } catch (err) {
    console.warn('[push] could not turn on', err)
    // The question closes; nothing is remembered, so it can ask again another time.
    usePush.setState((st) => ({ on: false, asking: st.asking === topic ? null : st.asking }))
    return 'failed'
  } finally {
    usePush.setState({ busy: false })
  }
}

/** Turns push off on this device: the browser forgets the subscription and the server drops it. */
export async function disablePush(): Promise<void> {
  usePush.setState({ busy: true, on: false, sentSub: undefined, sentPlan: undefined })
  try {
    const sub = await subscription(false)
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => false)
    const client = await getSupabase()
    await client?.rpc('push_unsubscribe', { p_endpoint: endpoint })
  } catch (err) {
    console.warn('[push] could not turn off', err)
  } finally {
    usePush.setState({ busy: false })
  }
}

/** One topic on or off (Settings). The server hears of it with the next sync. */
export const setPushTopic = (topic: PushTopic, on: boolean) =>
  usePush.setState((s) => ({ topics: { ...s.topics, [topic]: on } }))

// ---------------------------------------------------------------- the words and pictures

const speciesName = (data: GameData, dex: number) => data.species[dex]?.name ?? `#${dex}`

/** A live event's title: the admin's for this language (or English), else its type's name. */
const liveTitle = (e: LiveEvent) =>
  e.title[getLang()]?.trim() || e.title.en?.trim() || t(`ui.live.${e.type}.name`)

/** A live event's line: what it does, in a sentence. */
function liveLine(e: LiveEvent, data: GameData, save: SaveData): string {
  const pct = Math.round((e.cash.multiplier - 1) * 100)
  if (e.type === 'cash') return t('ui.push.live.cash', { pct })
  if (e.type === 'shop') {
    const names = liveShopRows(save, data, e).map((r) => r.item.name)
    return t('ui.push.live.shop', { items: joinList(names.slice(0, 3)) })
  }
  const s = e.shiny
  if (s.scope === 'all') return t('ui.push.live.shinyAll', { n: s.multiplier })
  const place =
    s.scope === 'region'
      ? (data.regions.find((r) => r.id === s.regionId)?.name ?? '')
      : joinList(
          s.areaIds
            .map((id) => data.areas.find((a) => a.id === id)?.name)
            .filter((n): n is string => !!n)
            .slice(0, 2),
        )
  return t('ui.push.live.shinyIn', { n: s.multiplier, place })
}

/** What the service worker shows for a notice (public/sw.js): under 3 KB, the server's limit. */
export interface PushPayload {
  title: string
  body: string
  tag: string
  url: string
  lang: string
  /** The plain pictures, where the worker can't draw `art`. */
  icon?: string
  image?: string
  art?: PushArt
}

export function payloadOf(n: PushNotice, save: SaveData, data: GameData): PushPayload {
  const base = { tag: n.key, lang: getLang() }
  if (n.topic === 'egg') {
    const [a, b] = n.parents
    return {
      ...base,
      title: t('ui.push.egg.title'),
      body: t('ui.push.egg.body', { a: a.name, b: b.name }),
      url: '/daycare',
      icon: '/icons/egg-192.png',
      image: artUrl('daycare'),
      art: { ...pictureArt('daycare'), mons: n.parents.map((p) => monArt(p.dex, p.shiny)), height: 0.42 },
    }
  }
  if (n.topic === 'raid') {
    const name = speciesName(data, n.dex)
    const pic = pictureOf(n.areaId)?.id ?? data.config.events.raid.banner
    const mon = monArt(n.dex, n.shiny)
    return {
      ...base,
      title: t(n.shiny ? 'ui.push.raid.titleShiny' : 'ui.push.raid.title', { name }),
      body: t(n.shiny ? 'ui.push.raid.bodyShiny' : 'ui.push.raid.body', { name }),
      url: '/events/raid',
      icon: mon.src,
      image: pictureArt(pic).bg?.src,
      art: { ...pictureArt(pic), mons: [mon], height: 0.55, icon: mon },
    }
  }
  const e = n.event
  return {
    ...base,
    title: t('ui.push.live.title', { name: liveTitle(e) }),
    body: liveLine(e, data, save),
    url: e.type === 'shop' ? '/shop' : '/home',
    ...(e.banner && { image: pictureArt(e.banner).bg?.src, art: pictureArt(e.banner) }),
  }
}

// ---------------------------------------------------------------- keeping the server's schedule up to date

/** Minutes east of UTC at a moment, by the device's zone. */
const localOffset = (ms: number) => -new Date(ms).getTimezoneOffset()

/** The schedule for this player now: their notices, in their words. The Extreme save and a small world plan nothing new. */
export function planFor(save: SaveData, data: GameData, now: number, topics: readonly PushTopic[]) {
  return pushPlan(save, data, now, localOffset, topics).map((n) => ({
    key: n.key,
    topic: n.topic,
    at: new Date(n.at).toISOString(),
    payload: payloadOf(n, save, data),
  }))
}

let syncing: Promise<void> | null = null

/**
 * Brings the server up to date with this device: the browser's subscription (renewed if the browser dropped it, or
 * dropped from here if the player blocked notifications since), then the schedule. Each is sent only when it changed.
 * The Extreme save keeps the main save's schedule: it plans from the main save only.
 */
export function syncPush(save: SaveData | null, data: GameData, now: number | null): Promise<void> {
  syncing ??= (async () => {
    try {
      const s = usePush.getState()
      if (!s.on || !pushReady(data)) return
      const permission = permissionNow()
      if (permission !== s.permission) usePush.setState({ permission })
      if (permission !== 'granted') {
        // Blocked from the browser's settings since: it's off here too.
        usePush.setState({ on: false, sentSub: undefined, sentPlan: undefined })
        return
      }
      const sub = await subscription(true)
      if (!sub) return
      await sendSubscription(sub)
      if (!save || isExtreme(save) || now == null) return
      const plan = planFor(save, data, now, wantedTopics(usePush.getState()))
      const print = JSON.stringify(plan)
      if (print === usePush.getState().sentPlan) return
      const client = await getSupabase()
      if (!client) return
      const { error } = await client.rpc('push_schedule', {
        p_device: deviceId(),
        p_endpoint: sub.endpoint,
        p_notices: plan,
      })
      if (error) {
        // The server forgot this browser (a reset, a deleted account): tell it again next time.
        if (/push_not_subscribed/.test(error.message)) usePush.setState({ sentSub: undefined })
        throw new Error(error.message)
      }
      usePush.setState({ sentPlan: print })
    } catch (err) {
      console.warn('[push] sync failed', err)
    } finally {
      syncing = null
    }
  })()
  return syncing
}

/** The rules' numbers, for the pop-up and Settings: the raid hour and the quiet hours, as clock times. */
export function pushHours(data: GameData) {
  const cfg = pushCfg(data)
  const clock = (h: number) =>
    new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString(getLang(), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    })
  return { raid: clock(cfg.raidHour), quietFrom: clock(cfg.quietHours[0]), quietTo: clock(cfg.quietHours[1]) }
}
