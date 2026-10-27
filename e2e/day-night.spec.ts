// Day and night in Johto (docs/32, docs/15 §30): with the switch on, a Johto save gets its rules once, then the top
// bar's far left shows the moon at night and the sun by day, on the player's clock; a tap shows the rules again; a
// 360-wide phone still fits the top bar. Switched off, or in Kanto, there is no sun or moon.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  createInstance,
  newRegionBlock,
  startRegion,
  type BundleRaw,
  type SaveData,
} from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
// The game reads regions.json too; the helpers' data is Kanto alone.
const data = compileGameData({
  pokemon: load('pokemon.json'),
  typeChart: load('type-chart.json'),
  diceTypes: load('dice-types.json'),
  areas: load('areas.json'),
  trainers: load('trainers.json'),
  upgrades: load('upgrades.json'),
  items: load('items.json'),
  config: load('config.json'),
  regions: load('regions.json'),
  eggGroups: load('egg-groups.json'),
} as BundleRaw)
const johto = data.regions.find((r) => r.id === 'johto')!

/** A Kanto save that has just started Johto, on its first starter. */
function inJohto(): SaveData {
  let c = 0
  const block = newRegionBlock(
    johto,
    johto.starters[0]!,
    data,
    Date.now(),
    () => `e2e-j-${++c}`,
    createInstance,
  )
  return { ...startRegion(makeSave(4), johto, block), regionOfferSeen: ['johto'] }
}

const ON = { ...EVENTS_ON, dayNight: { access: 'all' } }
const NIGHT = new Date('2026-10-17T22:30:00+02:00')
const DAY = new Date('2026-10-17T10:15:00+02:00')

test.use({ timezoneId: 'Europe/Paris' })

async function boot(page: Page, save: SaveData, at: Date, devConfig: object = ON) {
  // The server's clock says the same as the page's, so the hour is the one asked for.
  await mockSupabase(page, { rpc: { event_time: { now: at.toISOString() } } })
  await page.clock.install({ time: at })
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), FAST, JSON.stringify(devConfig)],
  )
}

const timeButton = (page: Page) => page.getByRole('button', { name: /in Johto until/ })

test('at night in Johto: the rules once, the moon far left, a tap shows the rules again', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, inJohto(), NIGHT)
  await page.goto('/home')

  const rules = page.getByRole('dialog', { name: 'Day and night' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText(/Night from/)).toBeVisible()
  await rules.getByRole('button', { name: 'Later' }).click()
  await expect(rules).toBeHidden()

  const chip = timeButton(page)
  await expect(chip).toHaveAccessibleName(/It's night in Johto until 6:00 AM/)
  await expect(chip.locator('[data-day-time]')).toHaveAttribute('data-day-time', 'night')
  // Far left: nothing in the top bar before it.
  const bar = page.locator('header').first()
  const chipBox = (await chip.boundingBox())!
  const barBox = (await bar.boundingBox())!
  expect(chipBox.x - barBox.x).toBeLessThan(16)
  // The phone's width still holds the whole bar.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)

  await chip.click()
  await expect(rules).toBeVisible()
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(rules).toBeHidden()

  // Seen, in the save: it won't show by itself again.
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').dayNight?.rulesSeen),
    )
    .toBe(true)
})

test('by day in Johto: the sun', async ({ page }) => {
  await boot(page, { ...inJohto(), dayNight: { rulesSeen: true } }, DAY)
  await page.goto('/home')
  const chip = timeButton(page)
  await expect(chip).toHaveAccessibleName(/It's day in Johto until 6:00 PM/)
  await expect(chip.locator('[data-day-time]')).toHaveAttribute('data-day-time', 'day')
})

test('the Pokédex: each place says when it comes, and Nearby counts only what the hour brings', async ({
  page,
}) => {
  await boot(page, { ...inJohto(), dayNight: { rulesSeen: true } }, DAY)
  await page.goto('/pokedex')
  // By day, Route 29's Hoothoot (night only) isn't nearby; Sentret (day only) is.
  // The filter shares the search's row as one dropdown (docs/43 §5.6).
  const show = page.getByRole('combobox', { name: 'Show' })
  await show.selectOption('nearby')
  await expect(page.getByRole('button', { name: /#161/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /#163/ })).toHaveCount(0)

  await show.selectOption('all')
  await page.getByRole('button', { name: /#163/ }).click()
  const place = page.getByRole('listitem').filter({ hasText: 'Route 29' }).first()
  await expect(place.locator('[data-day-time="night"]')).toHaveText('Night only')
})

test('switched off, or in Kanto: no sun or moon, no rules', async ({ page }) => {
  await boot(page, inJohto(), NIGHT, EVENTS_ON)
  await page.goto('/home')
  await expect(page.getByRole('button', { name: /CONTINUE|GO TO/ }).first()).toBeVisible()
  await expect(timeButton(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Day and night' })).toHaveCount(0)

  const kanto = await page.context().newPage()
  await boot(kanto, makeSave(4), NIGHT)
  await kanto.goto('/home')
  await expect(kanto.getByRole('button', { name: /CONTINUE|GO TO/ }).first()).toBeVisible()
  await expect(timeButton(kanto)).toHaveCount(0)
})
