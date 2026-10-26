// Push notifications (docs/27): each feature asks once, a No on one leaves the others to ask, Enable subscribes and
// hands the server a schedule, Settings shows what's on. A headless browser can't reach a real push service, so the
// browser's subscription and permission are stood in for (PushManager, Notification): granted as a player's tap would.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

const NOW = '2027-04-22T05:00:00.000Z'
const SAFARI = DEFAULT_CONFIG.events.raid.unlockAreaId!
const cleared = { roundsDone: 3, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }

/** Twenty species (the Day Care is open, visited), the Safari Zone cleared (raids are open, their pop-up seen). */
const player = (): SaveData =>
  makeSave(4, {
    gold: 500,
    pokedex: Array.from({ length: 20 }, (_, i) => i + 1),
    dayCare: { residents: [], guests: [], eggClaimed: true, visited: true },
    areaProgress: { [SAFARI]: cleared },
    events: { seen: ['raid'] },
  })

async function boot(page: Page, save: SaveData, settings = FAST) {
  const sent: { fn: string; body: Record<string, unknown> }[] = []
  const log = (fn: string) => (body: Record<string, unknown>) => {
    sent.push({ fn, body })
    return fn === 'push_schedule' ? 3 : null
  }
  await mockSupabase(page, {
    rpc: {
      event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }),
      push_subscribe: log('push_subscribe'),
      push_schedule: log('push_schedule'),
      push_unsubscribe: log('push_unsubscribe'),
    },
  })
  await page.context().grantPermissions(['notifications'])
  await page.addInitScript(
    ([s, f, cfg]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      // Push switched on for everyone, over the events mockSupabase switched on.
      localStorage.setItem('pokedice.devConfig', cfg!)
      // The browser's push service, stood in for: one subscription, kept across pages as a browser keeps it.
      const endpoint = 'https://push.example/e2e'
      const fake = {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
        unsubscribe: async () => (sessionStorage.removeItem('e2e.sub'), true),
      }
      PushManager.prototype.getSubscription = async () =>
        (sessionStorage.getItem('e2e.sub') ? fake : null) as unknown as PushSubscription
      PushManager.prototype.subscribe = async () =>
        (sessionStorage.setItem('e2e.sub', '1'), fake) as unknown as PushSubscription
      // The browser's permission too: some headless builds say 'denied' whatever grantPermissions gave. Unasked until
      // the tap, then granted, kept across pages as the browser keeps it.
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => (sessionStorage.getItem('e2e.perm') ?? 'default') as NotificationPermission,
      })
      Notification.requestPermission = async () => (sessionStorage.setItem('e2e.perm', 'granted'), 'granted')
    },
    [
      JSON.stringify(save),
      settings,
      JSON.stringify({ ...EVENTS_ON, push: { ...DEFAULT_CONFIG.push, access: 'all' } }),
    ],
  )
  return sent
}

test("the Day Care's rules, then its question: never one straight after the other (docs/43 §7)", async ({ page }) => {
  // Twenty species and never been in: the rules are due on Home; their Let's go! leads to the page that asks.
  await boot(page, { ...player(), dayCare: undefined })
  await page.goto('/home')
  await page.getByRole('dialog', { name: 'Day Care' }).getByRole('button', { name: "Let's go!" }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  await page.waitForTimeout(2000)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The next visit asks, as any visit does (once the first visit's gift Egg, opened from Home, has hatched).
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  await page.getByRole('button', { name: /^Day Care/ }).first().click()
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()
})

test('each feature asks once; No thanks is for good there; Enable subscribes and sends the schedule', async ({
  page,
}) => {
  const sent = await boot(page, player())
  await page.goto('/daycare')
  const ask = page.getByRole('dialog', { name: 'Notifications' })
  await expect(
    ask.getByText('Enable push notifications to be told when your Day Care Pokémon find an Egg.'),
  ).toBeVisible()
  for (const rule of ['Day Care Eggs', 'Daily raids', 'Live events', 'Your choice'])
    await expect(ask.getByText(rule, { exact: true })).toBeVisible()
  await ask.getByRole('button', { name: 'No thanks' }).click()
  await expect(ask).toHaveCount(0)

  // Not again on the Day Care.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Day Care' }).first()).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(ask).toHaveCount(0)

  // The raids still ask, once.
  await page.goto('/events/raid')
  await expect(ask.getByText('Enable push notifications to be notified about upcoming raids.')).toBeVisible()
  await ask.getByRole('button', { name: 'Enable' }).click()
  await expect(ask).toHaveCount(0)
  await expect(page.getByText('Notifications on.')).toBeVisible()

  // The server heard of this browser with the topics not refused, then got the schedule: the days' raids.
  const subscribe = sent.find((c) => c.fn === 'push_subscribe')!
  expect(subscribe.body).toMatchObject({
    p_endpoint: 'https://push.example/e2e',
    p_topics: ['raid', 'live'],
    p_lang: 'en',
  })
  await expect
    .poll(() => sent.filter((c) => c.fn === 'push_schedule').length, { timeout: 15_000 })
    .toBeGreaterThan(0)
  const notices = sent.find((c) => c.fn === 'push_schedule')!.body.p_notices as {
    key: string
    topic: string
    payload: { title: string; url: string }
  }[]
  expect(notices.length).toBeGreaterThan(0)
  expect(notices.every((n) => n.topic === 'raid' && n.key.startsWith('raid:'))).toBe(true)
  expect(notices[0]!.payload.title).toMatch(/^Today's raid: /)
  expect(notices[0]!.payload.url).toBe('/events/raid')

  // Settings: on, the Day Care's topic off (it was refused), the others on.
  await page.goto('/settings')
  const panel = page.locator('.pixel-panel', { has: page.getByText('This device:') })
  await expect(panel.getByRole('switch', { name: /Push notifications/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  const topic = (name: string) => panel.locator('label', { hasText: name }).getByRole('switch')
  await expect(topic('Day Care Eggs')).toHaveAttribute('aria-checked', 'false')
  await expect(topic('Daily raids')).toHaveAttribute('aria-checked', 'true')

  // Off again: the server drops this browser.
  await panel.getByRole('switch', { name: /Push notifications/ }).click()
  await expect(page.getByText('Notifications off on this device.')).toBeVisible()
  await expect.poll(() => sent.some((c) => c.fn === 'push_unsubscribe')).toBe(true)
})

test('switched off by the admin: no question, no Settings panel', async ({ page }) => {
  await boot(page, player())
  await page.addInitScript(
    (cfg) => localStorage.setItem('pokedice.devConfig', cfg),
    JSON.stringify(EVENTS_ON),
  )
  await page.goto('/events/raid')
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toHaveCount(0)
  await page.goto('/settings')
  await expect(page.getByText('This device:')).toHaveCount(0)
})

for (const theme of ['light', 'dark'] as const)
  test(`every text keeps its contrast (${theme}): the question, then Settings`, async ({ page }) => {
    await boot(page, player(), JSON.stringify({ ...JSON.parse(FAST), theme }))
    const contrast = async (scope: string) =>
      (
        await new AxeBuilder({ page }).include(scope).withRules(['color-contrast']).analyze()
      ).violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`))
    await page.goto('/events/raid')
    const ask = page.getByRole('dialog', { name: 'Notifications' })
    await expect(ask.getByRole('button', { name: 'Enable' })).toBeVisible()
    await page.waitForTimeout(400)
    expect(await contrast('[role=dialog]')).toEqual([])
    await ask.getByRole('button', { name: 'Enable' }).click()
    await expect(page.getByText('Notifications on.')).toBeVisible()
    await page.goto('/settings')
    await expect(page.getByText('This device:')).toBeVisible()
    expect(await contrast('main')).toEqual([])
  })
