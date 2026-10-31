// Admin → Analytics → Players per hour (the user's ask, 2026-10-11): the database is asked only when the button is
// pressed, and the answer shows as one bar per hour of the last 24, with every hour in the table under it. Then
// retention on day 1, 3, 7 and 30 from the page's one request, and churn by area on demand (docs/55).
import { expect, test, type Page } from '@playwright/test'
import { fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

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
  const calls = await mockSupabase(page, { rpc: { analytics_retention: {}, analytics_hourly: hourly } })
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

/** 'YYYY-MM-DD', `n` days from today in the local time zone (the browser's, so the page's). */
const localDay = (n: number) => {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

async function openAnalytics(page: Page, rpc: Record<string, unknown>) {
  await page.setViewportSize({ width: 1280, height: 1000 })
  const calls = await mockSupabase(page, { rpc })
  await page.addInitScript(
    ([key, session, save]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', save!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4))],
  )
  await page.goto('/admin/analytics')
  return calls
}

test('Retention: day 1, 3, 7 and 30 from the one request of the page', async ({ page }) => {
  test.setTimeout(120_000)
  // [new, back on day 1, day 3, day 7, day 30]: a first day 40 days ago, one 5 days ago, one today.
  const cohorts = {
    [localDay(-40)]: [10, 6, 4, 3, 2],
    [localDay(-5)]: [4, 2, 1, 0, 0],
    [localDay(0)]: [3, 0, 0, 0, 0],
  }
  const calls = await openAnalytics(page, { analytics_retention: cohorts, analytics_d1: {} })
  const hero = page.getByRole('region', { name: 'Retention' })
  const tile = (day: number) => hero.getByRole('group', { name: `Day ${day}`, exact: true })
  // 30 days: the first day 40 days ago is out of the frame.
  await expect(tile(1)).toContainText('50%', { timeout: 30_000 })
  await expect(tile(1)).toContainText('2 of 4 came back')
  await expect(tile(1)).toContainText('Pending: 3 players from 1 first day')
  await expect(tile(7)).toContainText('Nobody to measure yet')
  await expect(tile(7)).toContainText('Pending: 7 players from 2 first days')
  // One request for the four rates with each load of the players (the dev server's StrictMode loads twice).
  const loads = calls.filter((c) => c.startsWith('GET /rest/v1/players?')).length
  expect(loads).toBeGreaterThan(0)
  expect(calls.filter((c) => c.includes('/rpc/analytics_retention'))).toHaveLength(loads)
  expect(calls.filter((c) => c.includes('/rpc/analytics_d1'))).toHaveLength(0)

  await page.getByRole('group', { name: 'Time frame' }).getByRole('button', { name: 'All time' }).click()
  await expect(tile(1)).toContainText('57%')
  await expect(tile(1)).toContainText('8 of 14 came back')
  await expect(tile(3)).toContainText('36%')
  await expect(tile(3)).toContainText('5 of 14 came back')
  await expect(tile(7)).toContainText('30%')
  await expect(tile(7)).toContainText('3 of 10 came back')
  await expect(tile(30)).toContainText('20%')
  await expect(tile(30)).toContainText('2 of 10 came back')
  await expect(tile(30)).toContainText('Pending: 7 players from 2 first days')
})

test('Churn by area: fetched on demand, in game order', async ({ page }) => {
  test.setTimeout(120_000)
  const kanto = gameData()
    .areas.filter((a) => (a.regionId ?? 'kanto') === 'kanto')
    .sort((a, b) => a.orderIndex - b.orderIndex)
  const [a1, a2, a3] = kanto
  const asked: unknown[] = []
  const calls = await openAnalytics(page, {
    analytics_retention: {},
    analytics_churn: (body: unknown) => {
      asked.push(body)
      return {
        today: localDay(0),
        cutoff: localDay(-5),
        // Out of order, as the database sends them, with an area the game no longer has.
        areas: {
          [a3!.id]: [2, 6, 1.5, 9],
          'gone0000-0000-4000-8000-000000000000': [1, 0, 3, null],
          [a1!.id]: [12, 4, 2.25, 7],
          [a2!.id]: [6, 6, 3, 5],
        },
        unknown: [4, 2],
      }
    },
  })
  const panel = page.getByRole('region', { name: 'Churn by area' })
  await expect(panel).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByText('Press Fetch to count the churned players by area.')).toBeVisible()
  // Opening the tab doesn't ask.
  await page.waitForTimeout(1000)
  expect(calls.filter((c) => c.includes('/rpc/analytics_churn'))).toHaveLength(0)

  const days = panel.getByLabel('Days away to count as churned')
  await expect(days).toHaveValue('3')
  await days.fill('0')
  await expect(panel.getByText('Days away: a whole number from 1 to 365.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Fetch' })).toBeDisabled()
  await days.fill('5')
  await panel.getByRole('button', { name: 'Fetch' }).click()

  await expect(panel.getByRole('table')).toBeVisible()
  // The page's frame (30 days, today included) on first day.
  expect(asked).toEqual([{ p_days: 5, p_since: localDay(-29) }])
  await expect(panel.getByRole('columnheader', { name: 'Kanto' })).toBeVisible()
  await expect(panel.locator('tbody tr td:first-child')).toHaveText([
    a1!.name,
    a2!.name,
    a3!.name,
    'Area gone0000',
  ])
  const first = panel.locator('tbody tr', { hasText: a1!.name })
  await expect(first.locator('td')).toHaveText([a1!.name, '12', '4', '75%', '2.3 / 7'])
  // 21 churned in known areas and 4 with none; 16 + 2 active.
  await expect(panel.getByText('25 churned', { exact: true })).toBeVisible()
  await expect(panel.getByText('18 still active', { exact: true })).toBeVisible()
  await expect(panel.getByText('4 churned with no known area', { exact: true })).toBeVisible()
  expect(calls.filter((c) => c.includes('/rpc/analytics_churn'))).toHaveLength(1)
})
