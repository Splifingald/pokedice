// Push notifications, the game's side (docs/25): which device it is, when a feature asks its question (once, unless
// it was an iPhone that had to install first), what a notice says and shows, and the sender's handling of the push
// services' answers.
import { describe, expect, it, vi } from 'vitest'
import {
  createInstance,
  DEFAULT_CONFIG,
  newLiveEvent,
  newSave,
  type PushNotice,
  type SaveData,
} from '@/engine'
import { setLangInternal } from '@/i18n'
import { detectPlatform, platformTag, pushSupportOf, type PlatformHints } from '@/lib/platform'
import { askDue, payloadOf, planFor, topicOn, wantedTopics } from '@/lib/push'
import { pictureWindow } from '@/lib/pushArt'
import { sendDue, type DueRow } from '../netlify/push/send'
import { makeData, newId } from './fixtures'

const hints = (userAgent: string, over: Partial<PlatformHints> = {}): PlatformHints => ({
  userAgent,
  maxTouchPoints: 0,
  standalone: false,
  ...over,
})
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'

describe('the device', () => {
  it('tells phones from computers, and which system', () => {
    expect(detectPlatform(hints(IPHONE))).toEqual({ os: 'ios', mobile: true, standalone: false })
    expect(detectPlatform(hints(ANDROID))).toMatchObject({ os: 'android', mobile: true })
    expect(detectPlatform(hints(WINDOWS))).toMatchObject({ os: 'windows', mobile: false })
    expect(detectPlatform(hints(LINUX))).toMatchObject({ os: 'linux', mobile: false })
    expect(detectPlatform(hints(IPAD_DESKTOP))).toMatchObject({ os: 'mac', mobile: false })
    // An iPad asking for the desktop site still has a touch screen.
    expect(detectPlatform(hints(IPAD_DESKTOP, { maxTouchPoints: 5 }))).toMatchObject({
      os: 'ios',
      mobile: true,
    })
    // Chromium's own hints win over the user agent.
    expect(detectPlatform(hints('Mozilla/5.0', { uaPlatform: 'Android', uaMobile: true }))).toMatchObject({
      os: 'android',
      mobile: true,
    })
    expect(platformTag(detectPlatform(hints(IPHONE, { standalone: true })))).toBe('ios-app')
    expect(platformTag(detectPlatform(hints(WINDOWS)))).toBe('windows')
  })

  it('an iPhone in a Safari tab is told to install; one from the Home Screen can subscribe', () => {
    const tab = detectPlatform(hints(IPHONE))
    expect(pushSupportOf(tab, { serviceWorker: true, pushManager: false, notification: false })).toBe(
      'install',
    )
    const app = detectPlatform(hints(IPHONE, { standalone: true }))
    expect(pushSupportOf(app, { serviceWorker: true, pushManager: true, notification: true })).toBe('yes')
    const old = detectPlatform(hints(WINDOWS))
    expect(pushSupportOf(old, { serviceWorker: true, pushManager: false, notification: true })).toBe('no')
  })
})

describe('the question', () => {
  const s = (over: Partial<Parameters<typeof askDue>[0]> = {}) => ({
    on: false,
    asked: {},
    permission: 'default' as const,
    ...over,
  })

  it('each feature asks once; a no on one leaves the others to ask', () => {
    expect(askDue(s(), 'raid', 'yes')).toBe(true)
    expect(askDue(s({ asked: { raid: 'no' } }), 'raid', 'yes')).toBe(false)
    expect(askDue(s({ asked: { raid: 'no' } }), 'egg', 'yes')).toBe(true)
    expect(askDue(s({ asked: { raid: 'yes' } }), 'raid', 'yes')).toBe(false)
  })

  it('never while push is on, or blocked, or impossible', () => {
    expect(askDue(s({ on: true }), 'live', 'yes')).toBe(false)
    expect(askDue(s({ permission: 'denied' }), 'live', 'yes')).toBe(false)
    expect(askDue(s(), 'live', 'no')).toBe(false)
  })

  it('an iPhone told to install asks once more from the Home Screen, not before', () => {
    expect(askDue(s(), 'egg', 'install')).toBe(true)
    expect(askDue(s({ asked: { egg: 'install' } }), 'egg', 'install')).toBe(false)
    expect(askDue(s({ asked: { egg: 'install' } }), 'egg', 'yes')).toBe(true)
  })

  it('topics are on unless turned off, and only while push is on', () => {
    expect(wantedTopics({ on: true, topics: { raid: false } })).toEqual(['egg', 'live'])
    expect(topicOn({ on: false, topics: {} }, 'egg')).toBe(false)
  })
})

describe('what a notice says and shows', () => {
  const data = makeData({ push: { ...DEFAULT_CONFIG.push, access: 'all' } })
  const save = newSave(4, data, 0, newId)

  it("the Day Care's: the pair's names, the yard with both on it, the Egg as the icon", () => {
    setLangInternal('en')
    const n: PushNotice = {
      topic: 'egg',
      key: 'egg:1',
      at: 1,
      parents: [
        { dex: 25, name: 'Pikachu' },
        { dex: 52, name: 'Meowth', shiny: true },
      ],
    }
    const p = payloadOf(n, save, data)
    expect(p.body).toBe('Pikachu and Meowth have found something at the Day Care!')
    expect(p.url).toBe('/daycare')
    expect(p.icon).toBe('/icons/egg-192.png')
    expect(p.art?.mons).toEqual([
      { src: '/pokemon/025_front.png' },
      { src: '/pokemon/052_front_shiny.png', shiny: true },
    ])
    expect(p.art?.bg?.src).toBe('/area-art/daycare.png')
  })

  it("the raid's: its Pokémon by name, shiny said in words, in the player's language", () => {
    setLangInternal('fr')
    const n: PushNotice = {
      topic: 'raid',
      key: 'raid:2026-10-14',
      at: 1,
      day: '2026-10-14',
      dex: 150,
      shiny: true,
      areaId: 'x',
    }
    const p = payloadOf(n, save, data)
    expect(p.title).toBe(`Raid du jour : ${data.species[150]!.name} chromatique ✦`)
    expect(p.lang).toBe('fr')
    expect(p.url).toBe('/events/raid')
    expect(p.art?.icon).toEqual({ src: '/pokemon/150_front_shiny.png', shiny: true })
    setLangInternal('en')
  })

  it("a live event's: its name and what it does", () => {
    setLangInternal('en')
    const e = {
      ...newLiveEvent('e', '2026-10-14T10:00:00Z', '2026-10-15T10:00:00Z'),
      type: 'cash' as const,
      cash: { multiplier: 1.5 },
    }
    const p = payloadOf({ topic: 'live', key: 'live:e', at: 1, event: e }, save, data)
    expect(p.title).toBe('Cash Flow has begun!')
    expect(p.body).toContain('+50%')
  })

  it('each payload stays well under the server’s 3 KB', () => {
    const s: SaveData = {
      ...save,
      pokedex: Array.from({ length: 200 }, (_, i) => i + 1),
      dayCare: {
        residents: [133, 135].map((dex, i) => ({
          inst: createInstance(dex, 20, data, `r${i}`, 0),
          since: 0,
          region: 'kanto',
        })),
        guests: [],
        eggClaimed: true,
      },
    }
    for (const n of planFor(s, data, Date.parse('2026-10-14T06:00:00Z'), ['egg', 'raid', 'live']))
      expect(new TextEncoder().encode(JSON.stringify(n.payload)).length).toBeLessThan(1500)
  })

  it('cuts a 2:1 window of a measured picture where the land is', () => {
    const w = pictureWindow('daycare')!
    expect(w.bg).toMatchObject({ w: 400, h: 200 })
    expect(w.bg.y).toBeGreaterThanOrEqual(0)
    expect(w.bg.y + w.bg.h).toBeLessThanOrEqual(400)
    expect(w.ground).toBeGreaterThan(0.5)
    expect(pictureWindow('/backgrounds/versus.png')).toBeNull()
  })
})

describe('the sender', () => {
  const row = (endpoint: string): DueRow => ({
    notice: 1,
    endpoint,
    p256dh: 'k',
    auth: 'a',
    payload: { title: endpoint },
  })
  const fail = (statusCode: number) => Object.assign(new Error('push'), { statusCode })

  it('sends each due notice, drops the gone subscriptions, reports once', async () => {
    const report = vi.fn(async () => {})
    const push = vi.fn(async (sub: { endpoint: string }, _body: string) => {
      if (sub.endpoint.endsWith('gone')) throw fail(410)
      if (sub.endpoint.endsWith('404')) throw fail(404)
      if (sub.endpoint.endsWith('busy')) throw fail(500)
      return {}
    })
    const result = await sendDue({
      due: async () => [row('a'), row('b-gone'), row('c-404'), row('d-busy')],
      push,
      report,
    })
    expect(result).toEqual({ sent: 1, gone: 2, failed: 1 })
    expect(report).toHaveBeenCalledOnce()
    expect(report).toHaveBeenCalledWith(['a'], ['b-gone', 'c-404'])
    expect(push.mock.calls[0]![1]).toBe(JSON.stringify({ title: 'a' }))
  })

  it('a quiet run makes no second request', async () => {
    const report = vi.fn(async () => {})
    expect(await sendDue({ due: async () => [], push: vi.fn(), report })).toEqual({
      sent: 0,
      gone: 0,
      failed: 0,
    })
    expect(report).not.toHaveBeenCalled()
  })
})
