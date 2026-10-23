// Phones play upright (docs/15 §6): held sideways, the game waits behind "Turn your device" until the phone is upright
// again. A tablet held sideways plays on in the wide layout (docs/38 §7, A3a); a computer's wide window never sees it.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FAST, makeSave, mockSupabase } from './helpers'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

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
    await expect(cover).toContainText('hold your phone in portrait')
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

test.describe('a tablet', () => {
  // An iPad Air: 820 px on its short side (the emulated screen is the viewport), a tablet whichever way it is held.
  test.use({ userAgent: IPAD_UA, isMobile: true, hasTouch: true, viewport: { width: 1180, height: 820 } })

  test('held sideways, it plays on in the wide layout: no cover, the side nav', async ({ page }) => {
    await boot(page)
    await page.goto('/home')
    // Really sideways, as the cover reads it.
    expect(await page.evaluate(() => screen.orientation.type)).toContain('landscape')
    await expect(page.getByRole('navigation').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /continue/i }).first()).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Turn your device' })).toHaveCount(0)
    expect(await page.evaluate(() => document.getElementById('root')!.inert)).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.setViewportSize({ width: 820, height: 1180 })
    await expect(page.getByRole('dialog', { name: 'Turn your device' })).toHaveCount(0)
  })
})

test('a computer’s wide window never sees it', async ({ page }) => {
  await boot(page)
  await page.goto('/home')
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Turn your device' })).toHaveCount(0)
})
