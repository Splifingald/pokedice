// Route 1's set opening (docs/42): switched on, a new player's first cards there come in their set order.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, type SaveData } from '../src/engine'
import { FAST, makeSave, mockSupabase } from './helpers'

const ON = JSON.stringify({ openingRounds: { ...DEFAULT_CONFIG.openingRounds, access: 'all' } })

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), FAST, ON],
  )
}

test('switched on, Route 1 opens with Rattata Lv.2, on a gauge of six cards', async ({ page }) => {
  await boot(page, makeSave(4))
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByText('Rattata', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Lv.2', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('img', { name: /1 of 6/ })).toBeVisible()
})

test("the first round's last card is Youngster Joey and his Rattata Lv.4", async ({ page }) => {
  const base = makeSave(4)
  const route1 = DEFAULT_CONFIG.openingRounds.areaId
  const p = {
    ...emptyProgress(),
    round: 1,
    opening: 0,
    deck: ['trainer' as const],
    drawn: ['wild', 'wild', 'item', 'center', 'wild'] as SaveData['areaProgress'][string]['drawn'],
  }
  await boot(page, { ...base, currentAreaId: route1, areaProgress: { ...base.areaProgress, [route1]: p } })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page.getByText('Youngster Joey').first()).toBeVisible()
  await expect(page.getByText('Lv.4', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Pays ₽10 for the win.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'This round is complete' })).toBeVisible()
})
