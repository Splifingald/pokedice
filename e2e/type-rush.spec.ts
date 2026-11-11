// Type Rush (docs/71 §3): a live event on as soon as it's scheduled (no switch of its own, the user's call of
// 2026-11-11). The admin's event reaches the game as content (a newer configVersion from the content cache, as
// live.spec.ts does), on the server's clock. Its pop-up on its first turn validates what's done (steps ticked, points
// in the gauge, the reward reached given); Home's square wears a red dot while something waits; after the end, a last
// pop-up settles what was done in time; a phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { newLiveEvent, type LiveEvent, type RushProgress, type SaveData } from '../src/engine'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls, STORAGE_KEY, SUPABASE } from './helpers'

const SHOTS = 'docs/71-short-events'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

const START = '2027-06-10T10:00:00.000Z'
const END = '2027-06-13T10:00:00.000Z'
const DURING = '2027-06-11T12:00:00.000Z'
const AFTER = '2027-06-14T09:00:00.000Z'
const VERSION = 990_181

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

const fireRush: LiveEvent = {
  ...newLiveEvent('fire-rush', START, END),
  type: 'rush',
  minBadges: 0,
  banner: 'gym-fire',
}

/** The game on its bundle, then the content with the Type Rush from the cache; the server's clock says `now`. */
async function boot(page: Page, save: SaveData, now = DURING) {
  await mockSupabase(page, { rpc: { event_time: () => ({ now, day: now.slice(0, 10) }) } })
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
    liveEvents: { access: 'all', list: [fireRush] },
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

/** A player who caught 20 Fire Pokémon and K.O.'d 10 foes with them: 60 points waiting, the first reward reached. */
function doneSave(seen = false): SaveData {
  const progress: RushProgress = {
    type: 'fire',
    end: END,
    counts: { catch: 20, ko: 10, damage: 1240 },
    done: {},
    points: 0,
    given: 0,
  }
  return makeSave(4, {
    player: { name: 'Sam', character: 'red' },
    gold: 500,
    inventory: { 'poke-ball': 2 },
    events: { rush: { 'fire-rush': progress }, ...(seen && { liveSeen: ['fire-rush'] }) },
  })
}

test('its first turn validates what’s done: steps ticked, 60 points, 10 Poké Balls; the next steps follow', async ({
  page,
}) => {
  await boot(page, doneSave())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Fire Rush' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText('Fire hits +20% · Ends in')).toBeVisible()
  // What arrived, and the gauge at 60.
  await expect(pop.getByTestId('rush-arrived')).toContainText('Received: Poké Ball ×10', { timeout: 10_000 })
  await expect(pop.getByRole('region', { name: 'Reward gauge: 60 of 300 points' })).toBeVisible()
  // The catch quest is done for good; the K.O. one shows its next step, its counter kept.
  await expect(
    pop.getByRole('listitem', { name: 'K.O. foes with Fire Pokémon: 10 of 25, 15 points' }),
  ).toBeVisible()
  await expect(pop.getByRole('listitem', { name: 'Catch Fire Pokémon: done' })).toBeVisible()
  await expect.poll(async () => (await stored(page)).events?.rush?.['fire-rush']?.points).toBe(60)
  expect((await stored(page)).inventory['poke-ball']).toBe(12)
  // INFO: its rules, with the type and the boost.
  await pop
    .getByRole('button', { name: /Fire Rush/ })
    .first()
    .click()
  // The rules open over it (both are titled by the event): the last dialog is theirs.
  const rules = page.getByRole('dialog', { name: 'Fire Rush' }).last()
  await expect(rules.getByText('Your Fire attacks deal more damage while it lasts.')).toBeVisible()
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('dialog', { name: 'Fire Rush' })).toHaveCount(1)
  await page.getByRole('dialog', { name: 'Fire Rush' }).getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('dialog', { name: 'Fire Rush' })).toHaveCount(0)
  // Collected: no red dot on the square.
  const square = page.getByRole('button', { name: /^Live event: Fire Rush, Fire hits \+20% · quests\./ })
  await expect(square).toBeVisible()
  await expect(page.getByTestId('rush-dot')).toHaveCount(0)
})

test('something waiting: a red dot on the square; opening it collects', async ({ page }) => {
  await boot(page, doneSave(true))
  await page.goto('/home')
  const square = page.getByRole('button', { name: /^Live event: Fire Rush, 2 to collect: open me!\./ })
  await expect(square).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('rush-dot')).toBeVisible()
  await square.click()
  const pop = page.getByRole('dialog', { name: 'Fire Rush' })
  await expect(pop.getByTestId('rush-arrived')).toContainText('Poké Ball ×10', { timeout: 10_000 })
  await pop.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByTestId('rush-dot')).toHaveCount(0)
})

test('after the end: a last pop-up collects what was done in time', async ({ page }) => {
  await boot(page, doneSave(true), AFTER)
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Fire Rush is over' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText("It's over: what you did in time still counts.")).toBeVisible()
  await expect(pop.getByTestId('rush-arrived')).toContainText('Poké Ball ×10', { timeout: 10_000 })
  await pop.getByRole('button', { name: 'OK' }).click()
  await expect(pop).toBeHidden()
  await page.reload()
  await page.waitForTimeout(3000)
  await expect(page.getByRole('dialog', { name: 'Fire Rush is over' })).toHaveCount(0)
})

test('on a 360×640 phone: the pop-up and the square fit, in the Jersey fonts', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, doneSave())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Fire Rush' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
  await expect(pop.getByTestId('rush-arrived')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  const box = await pop.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(360)
  expect(await nonJerseyText(page), 'pop-up: fonts').toEqual([])
  expect(await smallControls(page), 'pop-up: controls under 44px').toEqual([])
  await shot(page, 'type-rush-popup')
  await pop.getByRole('button', { name: 'OK' }).click()
  const square = page.getByRole('button', { name: /^Live event: Fire Rush/ })
  await square.scrollIntoViewIfNeeded()
  await shot(page, 'type-rush-home')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(0)
})
