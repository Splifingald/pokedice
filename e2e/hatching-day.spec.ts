// Hatching Day (docs/71 §2): a live event of type `hatch`, behind its own switch. The admin's event reaches the game as
// content (a newer configVersion from the content cache, as live.spec.ts does), on the server's clock: its pop-up once
// (×3, its two rules, Go to the Day Care), Home's square and the Day Care card's chip and faster Egg check, the Day
// Care page's strip reopening the pop-up; switched off, nothing of it.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createInstance, newLiveEvent, type EventAccess, type LiveEvent, type SaveData } from '../src/engine'
import {
  FAST,
  gameData,
  makeSave,
  mockSupabase,
  nonJerseyText,
  smallControls,
  STORAGE_KEY,
  SUPABASE,
} from './helpers'

/** The doc's pictures (docs/71). */
const SHOTS = 'docs/71-short-events'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

const NOW = '2027-05-14T12:00:00.000Z'
const START = '2027-05-14T10:00:00.000Z'
const END = '2027-05-17T10:00:00.000Z'
const VERSION = 990_171

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

const hatching: LiveEvent = {
  ...newLiveEvent('hatch', START, END),
  type: 'hatch',
  minBadges: 0,
  banner: '/backgrounds/live-hatch.png',
}

/** The game on its bundle, then the content with Hatching Day from the cache; the server's clock says NOW. */
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
    liveEvents: { access: 'all', list: [hatching] },
    hatchingDay: { access },
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

/** An open Day Care with Eevee and Jolteon (one pair, the 12 h clock), its clock just checked. */
function pairSave(): SaveData {
  const data = gameData()
  const residents = [133, 135].map((dex, i) => ({
    inst: createInstance(dex, 20, data, `dc-${i}`, 0),
    since: Date.now(),
    region: 'kanto',
  }))
  return makeSave(4, {
    player: { name: 'Sam', character: 'red' },
    gold: 500,
    pokedex: Array.from({ length: 20 }, (_, i) => i + 1),
    dayCare: { residents, guests: [], eggClaimed: true, visited: true, breedAt: Date.now() },
  })
}

test('its pop-up once, Home’s square and the Day Care’s Egg check 3× sooner, the strip on the Day Care page', async ({
  page,
}) => {
  await boot(page, pairSave())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Hatching Day' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText('Eggs ×3 faster')).toBeVisible()
  await expect(pop.getByText('Shiny Eggs ×4')).toBeVisible()
  await expect(pop.getByText(/^2d 2[12]h left · until /)).toBeVisible()
  await pop.getByRole('button', { name: 'OK' }).click()
  await expect(pop).toBeHidden()

  await expect(
    page.getByRole('button', {
      name: /^Live event: Hatching Day, Eggs ×3 faster · ×4 shiny\. Ends in 2d 2[12]h\. Open$/,
    }),
  ).toBeVisible()
  // The Day Care's card: the chip, and the next Egg check in 4 h instead of 12.
  await expect(page.getByRole('img', { name: 'Hatching Day: Eggs ×3 faster, shiny odds ×4' })).toBeVisible()
  await expect(page.getByText(/Egg check in (3 h 5\d|4 h 00)/)).toBeVisible()

  await page.goto('/daycare')
  const strip = page.getByTestId('hatching-day-strip')
  await expect(strip).toBeVisible({ timeout: 15_000 })
  await expect(strip).toContainText('Eggs ×3 faster · ×4 shiny')
  await strip.click()
  await expect(pop).toBeVisible()
  await expect(pop.getByRole('button', { name: 'Go to the Day Care' })).toBeVisible()
})

test('Go to the Day Care from its pop-up', async ({ page }) => {
  await boot(page, pairSave())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Hatching Day' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await pop.getByRole('button', { name: 'Go to the Day Care' }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  await expect(page.getByTestId('hatching-day-strip')).toBeVisible()
})

test('switched off: no pop-up, no square, no chip, the Egg check on its usual clock', async ({ page }) => {
  await boot(page, pairSave(), 'off')
  await page.goto('/home')
  await expect(page.getByText(/Egg check in (11 h 5\d|12 h 00)/)).toBeVisible({ timeout: 15_000 })
  // Long enough for the content and the server's clock to have arrived.
  await page.waitForTimeout(2000)
  await expect(page.getByRole('dialog', { name: 'Hatching Day' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Live event: Hatching Day/ })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /^Hatching Day:/ })).toHaveCount(0)
  await page.goto('/daycare')
  await expect(page.getByTestId('hatching-day-strip')).toHaveCount(0)
})

test('on a 360×640 phone: the pop-up, the square and the strip fit, in the Jersey fonts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, pairSave())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Hatching Day' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  const box = await pop.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(360)
  expect(await nonJerseyText(page), 'pop-up: fonts').toEqual([])
  // The modal's fade-in and the content swap's toast, gone before the picture.
  await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
  await page.waitForTimeout(500)
  await shot(page, 'hatching-day-popup')
  await pop.getByRole('button', { name: 'OK' }).click()
  const square = page.getByRole('button', { name: /^Live event: Hatching Day/ })
  await square.scrollIntoViewIfNeeded()
  await expect(square).toBeVisible()
  await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
  await shot(page, 'hatching-day-home')
  await page.goto('/daycare')
  const strip = page.getByTestId('hatching-day-strip')
  await expect(strip).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(0)
  expect(await nonJerseyText(page), 'Day Care: fonts').toEqual([])
  expect(await smallControls(page), 'Day Care: controls under 44px').toEqual([])
  await shot(page, 'hatching-day-daycare')
})
