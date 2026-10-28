// Recorded dice throws (docs/37): a battle's dice are thrown in on a canvas each and land as the resting dice, their
// names (the engine's faces) unchanged; a reroll throws only the picked dice.
import { expect, test, type Page } from '@playwright/test'
import { EVENTS_ON, makeSave, mockSupabase } from './helpers'

const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })

async function boot(page: Page) {
  await page.setViewportSize({ width: 360, height: 640 })
  await mockSupabase(page)
  const config = JSON.stringify(EVENTS_ON)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
      // Prof. Oak's share prompt would cover the screen.
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [JSON.stringify(makeSave(4)), MOTION_ON, config],
  )
}

const attack = (page: Page) => page.getByRole('button', { name: 'ATTACK', exact: true })
const tray = (page: Page) => page.getByRole('group', { name: 'Your dice' }).getByRole('button')
/** The throws' canvases: decorative, over the page. */
const canvases = (page: Page) => page.locator('body > canvas[aria-hidden="true"]')

async function toBattle(page: Page) {
  await page.goto('/home')
  const healing = page.getByRole('dialog', { name: 'Healing…' })
  const ready = async () =>
    (await attack(page)
      .isVisible()
      .catch(() => false)) && (await attack(page).isEnabled())
  for (let i = 0; i < 150 && !(await ready()); i++) {
    if (await healing.isVisible().catch(() => false)) {
      await healing.getByRole('button', { name: 'SKIP ▸▸' }).click()
      continue
    }
    for (const name of ['FIGHT', 'EXPLORE', 'ENTER', 'PICK IT UP', 'CONTINUE', 'SKIP TURN']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
  await expect(attack(page)).toBeEnabled()
}

const labels = (page: Page) => tray(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

test('the dice are thrown in, land as the resting dice, and a reroll throws only the picked one', async ({
  page,
}) => {
  await boot(page)
  await toBattle(page)
  // Landed: no canvas left, every face showing.
  await expect(canvases(page)).toHaveCount(0)
  await expect(tray(page).locator('.die, .die-mini').first()).toBeVisible()
  const before = await labels(page)
  expect(before.length).toBeGreaterThan(1)

  await tray(page).nth(0).click()
  await page.getByRole('button', { name: /^REROLL/ }).click()
  // The picked die alone flies: one canvas, its face hidden (its button still in place), the others showing.
  await expect(canvases(page)).toHaveCount(1)
  await expect(tray(page).nth(0).locator('.die, .die-mini')).toHaveCSS('visibility', 'hidden')
  await expect(tray(page).nth(1).locator('.die, .die-mini')).toHaveCSS('visibility', 'visible')
  await expect(tray(page).nth(0)).toBeAttached()
  // The readout waits for the dice, and stays up through the throw with the roll before's numbers.
  await expect(page.getByRole('button', { name: /damage — (show|hide) details$/ })).toBeVisible()
  // Down: the canvas goes, the face shows, the kept die's name is the same.
  await expect(canvases(page)).toHaveCount(0)
  await expect(tray(page).nth(0).locator('.die, .die-mini')).toHaveCSS('visibility', 'visible')
  const after = await labels(page)
  expect(after.slice(1)).toEqual(before.slice(1))
  await expect(attack(page)).toBeEnabled()
})
