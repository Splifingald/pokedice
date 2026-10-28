// Admin → Config made simpler (the user's ask, 2026-10-28): sub-tabs at the top, the Switches tab first with one table
// of every Config feature's Off / On for admin / On for everyone, two columns on a wide screen; a feature's name opens
// its numbers. The admin is signed in; the content comes from a mocked Supabase serving the game's own data.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { bundleToRows } from '../src/config/mapping'
import type { BundleRaw } from '../src/engine'
import { fakeSession, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
const FILES = [
  'pokemon',
  'type-chart',
  'dice-types',
  'areas',
  'trainers',
  'upgrades',
  'items',
  'config',
  'regions',
  'egg-groups',
]
const KEYS = [
  'pokemon',
  'typeChart',
  'diceTypes',
  'areas',
  'trainers',
  'upgrades',
  'items',
  'config',
  'regions',
  'eggGroups',
]
const bundle = Object.fromEntries(FILES.map((f, i) => [KEYS[i], load(`${f}.json`)])) as unknown as BundleRaw
const rows = bundleToRows(bundle) as unknown as Record<string, unknown[]>

async function admin(page: Page) {
  await mockSupabase(page)
  await page.route(`${SUPABASE}/rest/v1/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const table = url.pathname.split('/').pop()!
    if (req.method() !== 'GET' || !(table in rows)) return route.fallback()
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows[table]!.slice(offset, offset + limit)),
    })
  })
  await page.addInitScript(
    ([key, session, save]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', save!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4))],
  )
}

test('Config: the tabs, the switches in two columns, a name opens its numbers', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await admin(page)
  await page.goto('/admin/config')
  const tabs = page.getByRole('navigation', { name: 'Config' })
  await expect(tabs).toBeVisible({ timeout: 30_000 })
  for (const name of ['Switches', 'Game', 'Day Care', 'Trades', 'Battle powers', 'All rows'])
    await expect(tabs.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(tabs.getByRole('button', { name: 'Switches', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // One row per feature: its name and its switch, nothing else; energy and the retired switches are gone.
  await expect(page.getByRole('radiogroup', { name: /: who has it$/ })).toHaveCount(20)
  for (const gone of [
    'Energy',
    'Dice throws',
    'Game feel',
    'Haptics',
    'Battle music',
    'Shiny Pokédex',
    'Raid overhaul',
  ])
    await expect(page.getByRole('radiogroup', { name: `${gone}: who has it` })).toHaveCount(0)
  // Two tables side by side.
  const tables = page.locator('table:has([role="radiogroup"])')
  await expect(tables).toHaveCount(2)
  const [left, right] = [await tables.nth(0).boundingBox(), await tables.nth(1).boundingBox()]
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1)
  expect(Math.abs(right!.y - left!.y)).toBeLessThan(2)
  await page.screenshot({ path: 'test-results/admin-config-switches.png', fullPage: true })

  const trades = page.getByRole('radiogroup', { name: 'Trades: who has it' })
  await trades.getByRole('radio', { name: 'On for admin' }).click()
  await expect(trades.getByRole('radio', { name: 'On for admin' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/^Unsaved: game_config/)).toBeVisible()

  // The name opens its tab: its numbers, no switch there.
  await page.getByRole('button', { name: 'Trades', exact: true }).last().click()
  await expect(page).toHaveURL(/tab=trades/)
  await expect(page.getByText('Open listings at most')).toBeVisible()
  await expect(page.getByRole('radiogroup')).toHaveCount(0)

  await tabs.getByRole('button', { name: 'Game', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pacing & rewards' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'XP curve' })).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-config-game.png', fullPage: true })
})
