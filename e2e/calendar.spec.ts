// The gift calendar (docs/55): a live event of type `calendar`, behind its own switch. The admin's calendar reaches the
// game as content (a newer configVersion from the content cache, as live.spec.ts does), on the server's clock: Home's
// card (gold while a door waits) and notice, the page's rules card, yesterday's door (the catch-up) and today's opened
// into the gifts' opening, their rewards in the save, the next door shut; switched off, nothing; a phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { calendarEnd, newLiveEvent, type EventAccess, type LiveEvent, type SaveData } from '../src/engine'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls, STORAGE_KEY, SUPABASE } from './helpers'

// Day 2 of the calendar, at 10:00 UTC: day 1's door is yesterday's (last chance), day 2's today's.
const START = '2027-12-01T00:00:00.000Z'
const NOW = '2027-12-02T10:00:00.000Z'
const VERSION = 990_101

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
const FILES = {
  pokemon: 'pokemon.json',
  typeChart: 'type-chart.json',
  diceTypes: 'dice-types.json',
  areas: 'areas.json',
  trainers: 'trainers.json',
  upgrades: 'upgrades.json',
  items: 'items.json',
  config: 'config.json',
  regions: 'regions.json',
  eggGroups: 'egg-groups.json',
}

const advent: LiveEvent = {
  ...newLiveEvent('advent', START, calendarEnd(START, 4)),
  type: 'calendar',
  minBadges: 0,
  banner: '/backgrounds/live-winter.png',
  title: { en: 'Advent Calendar' },
  calendar: {
    days: [
      { kind: 'gold', amount: 1000 },
      { kind: 'item', key: 'rare-candy', qty: 3 },
      { kind: 'pokemon', dex: 225, level: 10, qty: 1 },
      { kind: 'item', key: 'master-ball', qty: 1 },
    ],
  },
}

/** The game on its bundle, then the content with this calendar from the cache; the server's clock says NOW. */
async function boot(page: Page, save: SaveData, access: EventAccess = 'all') {
  await mockSupabase(page, { rpc: { event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }) } })
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
    await new Promise((r) => setTimeout(r, 400))
    const object = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = object ? { value: VERSION } : [{ value: VERSION }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const bundle = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)]))
  bundle.config = {
    ...bundle.config,
    configVersion: VERSION,
    liveEvents: { access: 'all', list: [advent] },
    giftCalendar: { access },
  }
  await page.addInitScript(
    ([s, f, b, v, key]) => {
      localStorage.removeItem(key!)
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      const req = indexedDB.open('pokedice', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('content')
      req.onsuccess = () => {
        const db = req.result
        db.transaction('content', 'readwrite')
          .objectStore('content')
          .put({ version: Number(v), build: 'e2e', bundle: JSON.parse(b!) }, 'remote')
      }
    },
    [JSON.stringify(save), FAST, JSON.stringify(bundle), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const playerSave = () => makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 500 })

/** A door's opening: SKIP to what arrived, then DONE. */
async function throughTheOpening(page: Page, day: number) {
  const moment = page.getByRole('dialog', { name: `Day ${day}’s gift!` })
  await expect(moment).toBeVisible()
  await moment.getByRole('button', { name: 'Skip' }).click()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(moment).toBeHidden()
}

test('Home’s card leads to the calendar: its rules once, yesterday’s door and today’s opened, the next shut', async ({
  page,
}) => {
  await boot(page, playerSave())
  await page.goto('/home')
  const card = page.getByRole('button', {
    name: /^Live event: Advent Calendar, 2 gifts to open!\. Ends in 3d 1[34]h\. Open the calendar$/,
  })
  await expect(card).toBeVisible({ timeout: 15_000 })
  // No pop-up over Home: a notice says it opened, its page has its rules.
  await expect(page.getByText('Gift Calendar is open!')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await card.click()
  await expect(page).toHaveURL(/\/calendar\?id=advent$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Advent Calendar' })).toBeVisible()

  const rules = page.getByRole('region', { name: 'How Advent Calendar works' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('Missed a day?')).toBeVisible()
  await rules.getByRole('button', { name: 'GOT IT' }).click()
  await expect(rules).toBeHidden()
  await expect.poll(async () => (await stored(page)).events?.calendarRulesSeen).toBe(true)

  await expect(page.getByRole('img', { name: /^Day 3: opens in 1[34]h/ })).toBeVisible()
  await expect(page.getByTestId('cal-progress')).toHaveText('0 of 4 opened')

  // Yesterday's door first (the dock picks it: it closes sooner).
  await page.getByRole('button', { name: 'Day 1: yesterday’s gift, last chance. Open it' }).click()
  await throughTheOpening(page, 1)
  await expect.poll(async () => (await stored(page)).gold).toBe(1500)
  await expect(page.getByRole('img', { name: 'Day 1: opened, ₽1,000' })).toBeVisible()

  await page.getByRole('button', { name: 'Open day 2' }).click()
  await throughTheOpening(page, 2)
  await expect.poll(async () => (await stored(page)).inventory['rare-candy']).toBe(3)
  await expect.poll(async () => (await stored(page)).events?.calendarOpened).toEqual({ advent: [1, 2] })
  await expect(page.getByTestId('cal-progress')).toHaveText('2 of 4 opened')
  await expect(page.getByRole('button', { name: /^Next door in 1[34]h/ })).toBeDisabled()

  // Back Home: the card says when the next door opens, and isn't gold any more.
  await page.goto('/home')
  await expect(
    page.getByRole('button', { name: /^Live event: Advent Calendar, Next door in 1[34]h/ }),
  ).toBeVisible({
    timeout: 15_000,
  })
})

test('the calendar is nowhere while its switch is off', async ({ page }) => {
  // Off: no card, no notice, the page says none runs (the missed doors are the engine's tests).
  await boot(page, playerSave(), 'off')
  await page.goto('/home')
  await expect(page.getByRole('button', { name: /^Live event: Advent/ })).toHaveCount(0)
  await page.waitForTimeout(1500)
  await expect(page.getByText('Gift Calendar is open!')).toHaveCount(0)
  await page.goto('/calendar')
  await expect(page.getByText('No gift calendar is running right now.', { exact: false })).toBeVisible({
    timeout: 15_000,
  })
})

test('on a 360×640 phone: the card and the page fit, in the Jersey fonts', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, { ...playerSave(), events: { calendarRulesSeen: true, calendarOpened: { advent: [1] } } })
  await page.goto('/home')
  const card = page.getByRole('button', { name: /^Live event: Advent Calendar, Day 2’s gift is ready!/ })
  await card.scrollIntoViewIfNeeded()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await page.goto('/calendar')
  await expect(page.getByRole('button', { name: 'Open day 2' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/cal-phone.png`, fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, '/calendar scrolls sideways').toBeLessThanOrEqual(0)
  expect(await nonJerseyText(page), '/calendar: fonts').toEqual([])
  expect(await smallControls(page), '/calendar: controls under 44px').toEqual([])
})
