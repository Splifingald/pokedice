// Full screen (docs/66): Settings' switch puts the page in the browser's full screen and takes it out, kept on this
// device; Off in the admin, Settings has no such row.
import { expect, test, type Page } from '@playwright/test'
import { EVENTS_ON, makeSave, mockSupabase } from './helpers'

async function boot(page: Page, config: object) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(makeSave(1)), JSON.stringify(config)],
  )
}

const full = (page: Page) => page.evaluate(() => !!document.fullscreenElement)

test('switched on: the switch goes in and out of full screen, and is kept in this browser', async ({
  page,
}) => {
  await boot(page, { ...EVENTS_ON, fullScreen: { access: 'all' } })
  await page.goto('/settings')
  const toggle = page.getByRole('switch', { name: 'Full screen' })
  // A computer's browser: off until the player turns it on.
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => full(page)).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('pokedice.fullscreen'))).toBe('on')
  await page.screenshot({ path: 'test-results/full-screen-settings.png' })

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => full(page)).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('pokedice.fullscreen'))).toBe('off')
})

test('kept on: the next tap after a reload goes back to full screen', async ({ page }) => {
  await boot(page, { ...EVENTS_ON, fullScreen: { access: 'all' } })
  await page.addInitScript(() => localStorage.setItem('pokedice.fullscreen', 'on'))
  await page.goto('/settings')
  await expect(page.getByRole('switch', { name: 'Full screen' })).toHaveAttribute('aria-checked', 'true')
  // The browser lets a page go full screen only inside a tap: none yet.
  expect(await full(page)).toBe(false)
  await page.getByRole('heading', { name: 'Settings', level: 1 }).click()
  await expect.poll(() => full(page)).toBe(true)
})

test('switched off: no row, and a kept choice does nothing', async ({ page }) => {
  await boot(page, EVENTS_ON)
  await page.addInitScript(() => localStorage.setItem('pokedice.fullscreen', 'on'))
  await page.goto('/settings')
  await expect(page.getByRole('switch', { name: 'Sound' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Full screen' })).toHaveCount(0)
  await page.getByRole('heading', { name: 'Settings', level: 1 }).click()
  expect(await full(page)).toBe(false)
})
