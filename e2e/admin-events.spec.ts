// Admin → Events (the user's ask, 2026-10-11): a tab per event; the raid calendar month by month, a day swapped with
// another (today pinned with it), a raid Pokémon's own numbers. The admin is signed in; the content comes from a mocked
// Supabase serving the game's own data.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { bundleToRows } from '../src/config/mapping'
import { DEFAULT_CONFIG, trickBestPlay, type BundleRaw } from '../src/engine'
import { fakeSession, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
const FILES = ['pokemon', 'type-chart', 'dice-types', 'areas', 'trainers', 'upgrades', 'items', 'config', 'regions', 'egg-groups']
const KEYS = ['pokemon', 'typeChart', 'diceTypes', 'areas', 'trainers', 'upgrades', 'items', 'config', 'regions', 'eggGroups']
const bundle = Object.fromEntries(FILES.map((f, i) => [KEYS[i], load(`${f}.json`)])) as unknown as BundleRaw
const rows = bundleToRows(bundle) as unknown as Record<string, unknown[]>

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

async function admin(page: Page) {
  await mockSupabase(page)
  // The admin's tables: the game's own content, page by page.
  await page.route(`${SUPABASE}/rest/v1/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const table = url.pathname.split('/').pop()!
    if (req.method() !== 'GET' || !(table in rows)) return route.fallback()
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[table]!.slice(offset, offset + limit)) })
  })
  await page.addInitScript(
    ([key, session, save]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', save!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4))],
  )
}

test('Events: a tab per event, each Off / On for admin / On for everyone', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await admin(page)
  await page.goto('/admin/events')
  const tabs = page.getByRole('navigation', { name: 'Events' })
  await expect(tabs).toBeVisible({ timeout: 30_000 })
  for (const name of ['General', 'Fortune Wheel', 'Raids', 'Elite Rebattle', 'Live events'])
    await expect(tabs.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
  // Every event ships off.
  await expect(tabs.getByRole('button', { name: 'Fortune Wheel Off' })).toBeVisible()
  await page.getByRole('radiogroup', { name: 'Fortune Wheel: who sees it' }).getByRole('radio', { name: 'On for admin' }).click()
  await expect(tabs.getByRole('button', { name: 'Fortune Wheel Admin' })).toBeVisible()
  await expect(page.getByText(/^Unsaved: game_config/)).toBeVisible()
  // Live events moved under Events.
  await tabs.getByRole('button', { name: /^Live events/ }).click()
  await expect(page).toHaveURL(/tab=live/)
  await expect(page.getByRole('button', { name: 'New live event' })).toBeVisible()
})

test('Trick or Treat: its switch, the tiers’ exact rates, an area’s ghosts prefilled from its wild pool', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await admin(page)
  await page.goto('/admin/events?tab=trick')
  const tabs = page.getByRole('navigation', { name: 'Events' })
  await expect(tabs.getByRole('button', { name: 'Trick or Treat Off' })).toBeVisible({ timeout: 30_000 })
  // The exact rate the engine works out for the defaults (it moves when the tiers are retuned).
  const best = (100 * trickBestPlay(DEFAULT_CONFIG.trickOrTreat, 'common').best).toFixed(1)
  await expect(page.getByTestId('trick-rates-common')).toContainText(`Best play ${best} %`)
  await page.getByRole('radiogroup', { name: 'Trick or Treat: who sees it' }).getByRole('radio', { name: 'On for admin' }).click()
  await expect(tabs.getByRole('button', { name: 'Trick or Treat Admin' })).toBeVisible()
  // Pokémon Tower's ghosts, from its wild pool.
  await page.getByRole('combobox', { name: 'Area', exact: true }).selectOption({ label: 'KANTO · Pokémon Tower · no card' })
  await page.getByRole('button', { name: 'Prefill from the wild pool' }).click()
  await expect(page.getByLabel('Tier').first()).toBeVisible()
  await expect(page.getByText("This area's deck has no Trick or Treat card")).toBeVisible()
  await expect(page.getByText(/^Unsaved: game_config/)).toBeVisible()
})

test('Raids: the calendar, a day swapped by hand (today pinned with it), a raid Pokémon’s own numbers', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await admin(page)
  await page.goto('/admin/events?tab=raids')
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible({ timeout: 30_000 })
  // Today can't change.
  await page.getByRole('button', { name: new RegExp(`^${day(0)}:`) }).click()
  await expect(page.getByText('Today’s raid is being fought: it can’t change.')).toBeVisible()
  // Tomorrow swapped with the day after.
  const a = day(1)
  const b = day(2)
  await page.getByRole('button', { name: new RegExp(`^${a}:`) }).click()
  const panel = page.getByRole('complementary', { name: `Raid of ${a}` })
  const before = (await page.getByRole('button', { name: new RegExp(`^${a}:`) }).getAttribute('aria-label'))!.split(': ')[1]
  await panel.getByLabel('Swap with the day').fill(b)
  await panel.getByRole('button', { name: 'Swap' }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^${b}: ${before}, set by hand$`) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^${a}: .*, set by hand$`) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^${day(0)}: .*, set by hand$`) })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Back to the plan' })).toBeVisible()
  // Its own numbers: five HP bars for this Pokémon only.
  const bars = panel.getByRole('spinbutton', { name: /: HP bars$/ })
  await bars.fill('5')
  await expect(page.getByRole('button', { name: 'With own numbers (1)' })).toBeVisible()
  await expect(page.getByText(/^Unsaved: game_config/)).toBeVisible()
})

test('Small worlds: the switch, a world made with its region and areas, its partners and mythical, refused until sound', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await admin(page)
  await page.goto('/admin/events?tab=worlds')
  const tabs = page.getByRole('navigation', { name: 'Events' })
  await expect(tabs.getByRole('button', { name: 'Small worlds Off' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('radiogroup', { name: 'Small worlds: who sees them' }).getByRole('radio', { name: 'On for admin' }).click()
  await expect(tabs.getByRole('button', { name: 'Small worlds Admin' })).toBeVisible()
  await page.getByRole('button', { name: 'New small world' }).click()
  const add = page.getByRole('button', { name: 'Add to the list' })
  await expect(add).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('No region')
  // The helper makes the region and its first area; two more areas join it.
  await page.getByPlaceholder('Its name, e.g. Mirage Island').fill('Mirage Island')
  await page.getByRole('button', { name: 'Make it' }).click()
  await expect(page.getByRole('cell', { name: '1. Mirage Island 1' })).toBeVisible()
  await page.getByRole('button', { name: '+ New area in this world' }).click()
  await page.getByRole('button', { name: '+ New area in this world' }).click()
  await expect(page.getByRole('cell', { name: '3. Mirage Island 3' })).toBeVisible()
  await expect(page.getByText(/^Unsaved: .*regions/)).toBeVisible()
  // Three partners and the shiny mythical in the last area.
  for (const name of ['Abra', 'Gastly', 'Slowpoke']) {
    await page.getByRole('button', { name: 'Pick a Pokémon…' }).first().click()
    await page.getByRole('combobox', { name: 'Pick a Pokémon…' }).fill(name)
    await page.getByRole('combobox', { name: 'Pick a Pokémon…' }).press('Enter')
  }
  await page.getByRole('button', { name: 'Pick a Pokémon…' }).click()
  await page.getByRole('combobox', { name: 'Pick a Pokémon…' }).fill('151')
  await page.getByRole('combobox', { name: 'Pick a Pokémon…' }).press('Enter')
  await page.getByRole('combobox', { name: /^Its area/ }).selectOption({ label: 'Mirage Island 3' })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await add.click()
  const row = page.getByRole('row', { name: /Mirage Island.*shiny Mew · 3 areas/ })
  await expect(row).toBeVisible()
  await expect(row.getByText('scheduled')).toBeVisible()
})
