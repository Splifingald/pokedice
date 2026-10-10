// The Day Care, one for every region: the gold widget opening straight into the hatching, Egg now for ₽, and a Pokémon
// left to train and taken back.
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const open = (patch: Partial<SaveData> = {}) =>
  makeSave(4, {
    gold: 500,
    // Twenty species caught open the Day Care.
    pokedex: Array.from({ length: 20 }, (_, i) => i + 1),
    ...patch,
  })

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
}

test('the gold widget opens the Day Care straight into the hatching of the gift Egg', async ({ page }) => {
  await boot(page, open({ dayCare: { residents: [], guests: [], eggClaimed: false, visited: true } }))
  await page.goto('/home')

  await page.getByRole('button', { name: 'Day Care: an Egg is waiting. Open the Day Care and hatch it.' }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await expect(moment.getByText('Oh? The Egg is moving!').first()).toBeVisible()
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await expect(moment.getByText(/hatched from the Egg!/).first()).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(moment).toHaveCount(0)
  // No Egg waits any more, and nothing is sold: the bar counts down to the next check.
  await expect(page.getByText('Next Egg check')).toBeVisible()
  await expect(page.getByText('No pair can make an Egg yet').first()).toBeVisible()
})

test('Egg now pays and hatches at once', async ({ page }) => {
  const data = gameData()
  // Eevee and Jolteon share the Field group: one pair.
  const residents = [133, 135].map((dex, i) => ({
    inst: createInstance(dex, 20, data, `dc-${i}`, 0),
    since: Date.now(),
    region: 'kanto',
  }))
  await boot(page, open({ dayCare: { residents, guests: [], eggClaimed: true, visited: true } }))
  await page.goto('/daycare')

  await expect(page.getByText('1 pair can leave one')).toBeVisible()
  await page.getByRole('button', { name: 'Skip the wait: an Egg now for ₽200' }).click()
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await expect(moment.getByText(/hatched from the Egg!/).first()).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  // ₽200 went (₽10 more may have come back from the Day Care couple).
  await expect(page.getByRole('banner').getByText(/₽\s?3[01]0/).first()).toBeVisible()
})

test('a Pokémon stays at the Day Care and comes back', async ({ page }) => {
  // A second Pokémon in the team: the last one can't be left.
  const save = open({ dayCare: { residents: [], guests: [], eggClaimed: true, visited: true } })
  const pidgey = createInstance(16, 8, gameData(), 'pidgey', 0)
  await boot(page, { ...save, box: [...save.box, pidgey], team: [...save.team, pidgey.id] })
  await page.goto('/daycare')

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
