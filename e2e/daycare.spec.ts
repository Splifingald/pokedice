// The Day Care: its Home widget, the free Egg hatching on the spot, and a Pokémon left to train and taken back.
import { expect, test } from '@playwright/test'
import { FAST, makeSave, mockSupabase } from './helpers'

test('the free Egg hatches, then a Pokémon stays at the Day Care and comes back', async ({ page }) => {
  await mockSupabase(page)
  // Twenty species in the Pokédex open the Day Care; the free Egg is still waiting.
  const save = makeSave(4, {
    gold: 500,
    pokedex: Array.from({ length: 20 }, (_, i) => i + 1),
    dayCare: { residents: [], eggClaimed: false, visited: true },
  })
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
  await page.goto('/home')

  // Home's widget says what waits there, and opens the Day Care.
  await page.getByRole('button', { name: /^Day Care: .*an Egg is waiting/ }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  await expect(page.getByRole('heading', { name: 'Pokémon Day Care' })).toBeVisible()

  // The free Egg hatches full screen; Skip goes straight to the hatchling, then Done.
  await page.getByRole('button', { name: 'TAKE THE EGG' }).click()
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await expect(moment.getByText('Oh? The Egg is moving!').first()).toBeVisible()
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await expect(moment.getByText(/hatched from the Egg!/).first()).toBeVisible()
  await expect(moment.getByRole('button', { name: /Another · ₽50/ })).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(moment).toHaveCount(0)
  // The next one is bought.
  await expect(page.getByText('Buy an Egg')).toBeVisible()
  await expect(page.getByRole('button', { name: 'BUY · ₽50' })).toBeVisible()

  // Leave Charmander: the sheet searches the team and the Box.
  await page
    .getByRole('button', { name: /Leave a Pokémon/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Leave which Pokémon?' })
  await sheet.getByLabel('Search your Pokémon').fill('charm')
  await sheet.getByRole('button', { name: /Charmander/ }).click()
  await expect(page.getByText('Charmander is staying at the Day Care.')).toBeVisible()

  // It trains in its slot; TAKE BACK says where it went.
  await page.getByRole('button', { name: 'Take back Charmander' }).click()
  await expect(page.getByText(/Charmander is back!/)).toBeVisible()
})
