// Phones and tablets play upright (docs/15 §6): held sideways, the game waits behind "Turn your device" until the
// device is upright again. A computer's wide window never sees it.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FAST, makeSave, mockSupabase } from './helpers'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function boot(page: Page) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(makeSave(4)), FAST],
  )
}

test.describe('a phone', () => {
  test.use({ userAgent: IPHONE_UA, isMobile: true, hasTouch: true, viewport: { width: 844, height: 390 } })

  test('held sideways, the game waits behind the cover; upright, it plays', async ({ page }) => {
    await boot(page)
    await page.goto('/home')
    const cover = page.getByRole('dialog', { name: 'Turn your device' })
    await expect(cover).toBeVisible()
    await expect(cover).toContainText('hold your phone or tablet in portrait')
    // The game behind it can't be reached.
    expect(await page.evaluate(() => document.getElementById('root')!.inert)).toBe(true)
    const axe = await new AxeBuilder({ page }).analyze()
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(cover).toHaveCount(0)
    expect(await page.evaluate(() => document.getElementById('root')!.inert)).toBe(false)

    await page.setViewportSize({ width: 844, height: 390 })
    await expect(cover).toBeVisible()
  })
})

test('a computer’s wide window never sees it', async ({ page }) => {
  await boot(page)
  await page.goto('/home')
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Turn your device' })).toHaveCount(0)
})
