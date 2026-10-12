// Admin → Analytics → Players per hour (the user's ask, 2026-10-11): the database is asked only when the button is
// pressed, and the answer shows as one bar per hour of the last 24, with every hour in the table under it.
import { expect, test } from '@playwright/test'
import { fakeSession, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

// The 2026-10-10/11 counts read from the API logs, oldest first; the last hour is the one in progress.
const PLAYERS = [96, 92, 92, 94, 87, 87, 67, 38, 26, 19, 12, 11, 8, 26, 38, 67, 81, 91, 94, 106, 115, 121, 118, 48]
const GUESTS = [21, 25, 21, 22, 19, 20, 21, 7, 4, 2, 3, 5, 2, 9, 9, 14, 27, 28, 32, 28, 30, 35, 41, 29]

test('Players per hour: counted on demand, one bar per hour', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 1000 })
  const hourMs = 3_600_000
  const last = Math.floor(Date.now() / hourMs) * hourMs
  const hourly = {
    hours: PLAYERS.map((n, i) => [new Date(last - (23 - i) * hourMs).toISOString(), n, GUESTS[i]]),
    total: 412,
    since: new Date(last - 7 * 24 * hourMs).toISOString(),
  }
  const calls = await mockSupabase(page, { rpc: { analytics_d1: {}, analytics_hourly: hourly } })
  await page.addInitScript(
    ([key, session, save]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', save!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4))],
  )
  await page.goto('/admin/analytics')

  const panel = page.getByRole('region', { name: 'Players per hour' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByText('Press Check to count the players of the last 24 hours.')).toBeVisible()
  // Opening the tab doesn't ask.
  await page.waitForTimeout(1000)
  expect(calls.filter((c) => c.includes('/rpc/analytics_hourly'))).toHaveLength(0)

  await panel.getByRole('button', { name: 'Check' }).click()
  // Exactly: at some hours the table's labels and counts run together into "…412…" too.
  await expect(panel.getByText('412', { exact: true })).toBeVisible()
  expect(calls.filter((c) => c.includes('/rpc/analytics_hourly'))).toHaveLength(1)
  await expect(panel.getByText(/^Peak/)).toContainText('121')
  await expect(panel.getByText(/^This hour so far/)).toContainText('48')
  await expect(panel.getByRole('img', { name: /Players per hour over the last 24 hours: peak 121/ })).toBeVisible()

  await panel.getByText('Table', { exact: true }).click()
  const rows = panel.getByRole('table').locator('tbody tr')
  await expect(rows).toHaveCount(24)
  // Newest first: 48 players, 29 of them guests.
  await expect(rows.first().locator('td')).toHaveText([/–/, '48', '19', '29'])

  await panel.getByRole('button', { name: 'Check again' }).click()
  await expect.poll(() => calls.filter((c) => c.includes('/rpc/analytics_hourly')).length).toBe(2)
})
