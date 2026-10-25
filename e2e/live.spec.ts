// Live events (docs/20): the admin's event reaches the game as content (a newer configVersion, here served from the
// content cache the way a player gets it the second time), on the server's clock. Its pop-up once, Home's square, the
// Shiny Parade's chip on the area, the Special Shop's section and its limit, Cash Flow's chip on the purse; several
// at once, a recurring one's run among them; a phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { newLiveEvent, type LiveEvent, type SaveData } from '../src/engine'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls, STORAGE_KEY, SUPABASE } from './helpers'

const NOW = '2027-04-22T12:00:00.000Z'
const START = '2027-04-20T18:00:00.000Z'
const END = '2027-04-24T18:00:00.000Z'
const VERSION = 990_001

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

const live = (over: Partial<LiveEvent>): LiveEvent => ({ ...newLiveEvent('e2e-live', START, END), minBadges: 0, banner: 'flowers', ...over })
const parade = live({ id: 'parade', type: 'shiny', shiny: { multiplier: 5, scope: 'region', areaIds: [], regionId: 'kanto' } })
const sale = live({
  id: 'sale',
  type: 'shop',
  shop: {
    items: [
      { key: 'master-ball', price: 9000, limit: 1, regions: 'all' },
      { key: 'ultra-ball', price: 75, limit: 10, regions: 'all' },
    ],
  },
})
const cash = live({ id: 'cash', type: 'cash', cash: { multiplier: 1.5 } })

/**
 * The game boots on its bundle, asks for the content version, finds a newer one and plays it from the content cache:
 * the bundle with these live events in its config. The server's clock says NOW.
 */
async function boot(page: Page, list: LiveEvent[], save: SaveData) {
  await mockSupabase(page, { rpc: { event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }) } })
  // Registered after the catch-all, so it answers first: the content version, a moment late (the cache is written).
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
    await new Promise((r) => setTimeout(r, 400))
    const object = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = object ? { value: VERSION } : [{ value: VERSION }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const bundle = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)]))
  bundle.config = { ...bundle.config, configVersion: VERSION, liveEvents: { access: 'all', list } }
  await page.addInitScript(
    ([s, f, b, v, key]) => {
      localStorage.removeItem(key!)
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      const req = indexedDB.open('pokedice', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('content')
      req.onsuccess = () => {
        const db = req.result
        db.transaction('content', 'readwrite').objectStore('content').put({ version: Number(v), build: 'e2e', bundle: JSON.parse(b!) }, 'remote')
      }
    },
    [JSON.stringify(save), FAST, JSON.stringify(bundle), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const playerSave = (gold = 500) => makeSave(4, { player: { name: 'Sam', character: 'red' }, gold })

test('a Shiny Parade: its pop-up once, the square on Home, the ×5 on the area', async ({ page }) => {
  await boot(page, [parade], playerSave())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Shiny Parade' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText('Shiny Pokémon ×5')).toBeVisible()
  await expect(pop.getByText('Shinies 5× likelier in Kanto.')).toBeVisible()
  await expect(pop.getByText(/^2d [56]h left · until /)).toBeVisible()
  await pop.getByRole('button', { name: 'OK' }).click()
  await expect(pop).toBeHidden()
  await expect.poll(async () => (await stored(page)).events?.liveSeen).toEqual(['parade'])

  const square = page.getByRole('button', { name: /^Live event: Shiny Parade, ×5 shiny in Kanto\. Ends in 2d [56]h\. Open$/ })
  await expect(square).toBeVisible()
  await expect(page.getByRole('button', { name: /^Route 1, .* · Shiny odds ×5 here$/ })).toContainText('×5')
  // Seen: a reload doesn't bring it back; the square does.
  await page.reload()
  await expect(square).toBeVisible({ timeout: 15_000 })
  await expect(pop).toBeHidden()
  await square.click()
  await expect(pop).toBeVisible()
})

test('a Special Shop: Go to the shop, a never-sold item bought to its limit', async ({ page }) => {
  await boot(page, [sale], playerSave(20_000))
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Special Shop' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText('Never sold in the shop')).toBeVisible()
  await expect(pop.getByText(/Each player can buy: 1 × Master Ball/)).toBeVisible()
  await pop.getByRole('button', { name: 'Go to the shop' }).click()
  await expect(page).toHaveURL(/\/shop$/)
  const section = page.getByRole('region', { name: 'Special Shop' })
  await expect(section).toBeVisible()
  const master = section.getByRole('button', { name: /^Master Ball/ })
  await expect(master).toContainText('NEVER SOLD')
  await expect(master).toContainText('1 of 1 left')
  await master.click()
  await expect(section.getByText('One per player')).toBeVisible()
  await section.getByRole('button', { name: 'Buy ₽9,000' }).click()
  await expect(master).toContainText('Sold out')
  await expect(master).toBeDisabled()
  await expect.poll(async () => (await stored(page)).events?.liveBought).toEqual({ sale: { 'master-ball': 1 } })
  expect((await stored(page)).gold).toBe(11_000)
  // On sale: the usual price struck out.
  await expect(section.getByRole('button', { name: /^Ultra Ball/ })).toContainText('-25%')
  // The Shop tab says it's on.
  await expect(page.getByRole('link', { name: /Special Shop on now/ }).first()).toBeAttached()
})

test('Cash Flow: its rules, and +50% on the purse', async ({ page }) => {
  await boot(page, [cash], playerSave())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Cash Flow' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText('+50% on every ₽')).toBeVisible()
  await expect(pop.getByText('Selling stays the same')).toBeVisible()
  await pop.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('img', { name: 'Every ₽ you earn +50%' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Live event: Cash Flow, \+50% on every ₽\./ })).toBeVisible()
})

test('several at once: a square each, their pop-ups one after the other, two Cash Flows adding up', async ({ page }) => {
  // NOW is a Thursday: the weekly event's run started at 10:00 UTC today.
  const weekly = live({
    id: 'weekly',
    type: 'cash',
    cash: { multiplier: 1.5 },
    title: { en: 'Thursday Cash' },
    repeat: { kind: 'weekly', weekday: 4, weeks: [], time: '10:00', hours: 12 },
  })
  await boot(page, [parade, cash, weekly], playerSave())
  await page.goto('/home')
  // The earliest started first.
  for (const name of ['Cash Flow', 'Shiny Parade', 'Thursday Cash']) {
    const pop = page.getByRole('dialog', { name })
    await expect(pop).toBeVisible({ timeout: 15_000 })
    await pop.getByRole('button', { name: 'OK' }).click()
    await expect(pop).toBeHidden()
  }
  await expect.poll(async () => (await stored(page)).events?.liveSeen).toEqual(['cash', 'parade', 'weekly@2027-04-22'])
  await expect(page.getByTestId('live-square')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^Live event: Thursday Cash, \+50% on every ₽\. Ends in (10h 0?0m|9h 5\dm)/ })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Every ₽ you earn +100%' })).toBeVisible()
})

test('a player short of its badges sees nothing', async ({ page }) => {
  await boot(page, [{ ...cash, minBadges: 3 }], playerSave())
  await page.goto('/home')
  await expect(page.getByRole('button', { name: /^Live event:/ })).toHaveCount(0)
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: 'Cash Flow' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /you earn/ })).toHaveCount(0)
})

test('on a 360×640 phone: the square, the pop-up and the shop fit, in the Jersey fonts', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, [sale], playerSave(20_000))
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Special Shop' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  const box = await pop.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(360)
  expect(await nonJerseyText(page), 'pop-up: fonts').toEqual([])
  await pop.getByRole('button', { name: 'OK' }).click()
  const square = page.getByRole('button', { name: /^Live event: Special Shop/ })
  await square.scrollIntoViewIfNeeded()
  await expect(square).toBeVisible()
  const sq = await square.boundingBox()
  // The same size as the square beside it, if any: a locked feature has no square (docs/38 U3a).
  const daycare = page.getByRole('button', { name: /^Day Care/ })
  if (await daycare.count()) {
    const dc = await daycare.first().boundingBox()
    expect(Math.abs(sq!.height - dc!.height)).toBeLessThanOrEqual(2)
  }
  for (const route of ['/home', '/shop']) {
    await page.goto(route)
    if (route === '/shop') await expect(page.getByRole('region', { name: 'Special Shop' })).toBeVisible({ timeout: 15_000 })
    else await expect(square).toBeVisible({ timeout: 15_000 })
    // The content swap's "Content updated" toast (166×44) goes first: it isn't the page's.
    await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(0)
    expect(await nonJerseyText(page), `${route}: fonts`).toEqual([])
    expect(await smallControls(page), `${route}: controls under 44px`).toEqual([])
  }
})
