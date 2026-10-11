// Admin → Events (the user's ask, 2026-10-11): a tab per event; the raid calendar month by month, a day swapped with
// another (today pinned with it), a raid Pokémon's own numbers. The admin is signed in; the content comes from a mocked
// Supabase serving the game's own data.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { bundleToRows } from '../src/config/mapping'
import type { BundleRaw } from '../src/engine'
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
