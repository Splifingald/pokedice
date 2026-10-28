// The game feel's dice and readout (docs/38 §3) in a real battle: on a tall phone the dice are bigger, the readout
// counts up to the engine's damage once the dice are down ("N DMG", no grey NO COMBO), a picked die wears its ↻ tag,
// the last reroll says so in gold; and on a 360×640 phone the battle still fits.
import { expect, test, type Page } from '@playwright/test'
import { EVENTS_ON, makeSave, mockSupabase, smallControls } from './helpers'

const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })

async function boot(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
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
const damage = (page: Page) => page.getByRole('button', { name: /damage — (show|hide) details$/ })

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

/** The readout's count ends on the engine's number: the one its button is named after. */
async function countedToTheEnd(page: Page) {
  const name = (await damage(page).getAttribute('aria-label')) ?? ''
  const n = Number(/^(\d+) damage/.exec(name)?.[1])
  expect(Number.isInteger(n)).toBe(true)
  await expect(damage(page).locator('b')).toHaveText(`${n} DMG`)
}

test('a tall phone: bigger dice, the count-up to the engine damage, a pick, LAST REROLL', async ({
  page,
}) => {
  await boot(page, 390, 844)
  await toBattle(page)
  await expect(damage(page)).toBeVisible()
  await countedToTheEnd(page)
  await expect(page.getByText('NO COMBO')).toHaveCount(0)
  // Two dice on a 390 px tray: the tall phone's 72 px.
  const box = await tray(page).first().boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(64)
  // The actions sit low, right over the Bag row.
  const atk = await attack(page).boundingBox()
  const history = await page.getByRole('button', { name: 'Battle history' }).boundingBox()
  expect(history!.y - (atk!.y + atk!.height)).toBeLessThan(40)

  await tray(page).nth(0).click()
  await expect(tray(page).nth(0)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^REROLL \(2\)$/ }).click()
  // The readout stays up while the picked die is thrown again, then counts to the new number.
  await expect(damage(page)).toBeVisible()
  await expect(attack(page)).toBeEnabled()
  await countedToTheEnd(page)
  await expect(page.getByRole('button', { name: 'LAST REROLL' })).toBeVisible()
})

test('a 360×640 phone: the battle still fits', async ({ page }) => {
  await boot(page, 360, 640)
  await toBattle(page)
  await page.waitForTimeout(1200)
  const gotIt = page.getByRole('button', { name: 'GOT IT' })
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click()
  const box = await attack(page).boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(640)
  const history = await page.getByRole('button', { name: 'Battle history' }).boundingBox()
  expect(history!.y + history!.height).toBeLessThanOrEqual(640)
  const scroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  expect(scroll).toBeLessThanOrEqual(0)
  expect(await smallControls(page)).toEqual([])
})
