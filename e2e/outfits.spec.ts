// Outfits (docs/59, docs/15 §41): with the switch on and a Santa Pikachu owned, the rules once (Later); its team tile
// says its outfit; its sheet has the outfit's chip, whose tap shows the rules again. Switched off, it reads as a plain
// Pikachu: no pop-up, no chip.
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()
const ON = { ...EVENTS_ON, outfits: { access: 'all' } }
const OFF = { ...EVENTS_ON, outfits: { access: 'off' } }

/** Charmander leads Santa Pikachu. */
function santaSave(): SaveData {
  const base = makeSave(4)
  const pikachu = { ...createInstance(25, 10, data, 'santa-pika', Date.now()), outfit: 'santa' }
  return {
    ...base,
    box: [...base.box, pikachu],
    team: [base.team[0]!, pikachu.id],
    pokedex: [...base.pokedex, 25],
  }
}

async function boot(page: Page, devConfig: object) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(santaSave()), FAST, JSON.stringify(devConfig)],
  )
}

test.use({ viewport: { width: 390, height: 844 } })

test('switched on: the rules once, the tile names the outfit, the sheet’s chip shows the rules again', async ({
  page,
}) => {
  await boot(page, ON)
  await page.goto('/home')
  const rules = page.getByRole('dialog', { name: 'Outfits' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('Evolves only in its outfit')).toBeVisible()
  await rules.getByRole('button', { name: 'Later' }).click()
  await expect(rules).toBeHidden()

  await page.goto('/team')
  const team = page.getByRole('list', { name: 'Your team, in send-out order' })
  // Its card wears the hat beside its name (the menu icon is the plain one).
  await expect(team.getByRole('img', { name: 'Santa hat' })).toBeVisible()
  const tile = team.getByRole('button', { name: /^Pikachu/ })
  await tile.click()
  const sheet = page.getByRole('dialog', { name: 'Pikachu' })
  await sheet.getByRole('button', { name: 'Santa hat: Outfits' }).click()
  await expect(page.getByRole('dialog', { name: 'Outfits' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Outfits' }).getByRole('button', { name: 'OK', exact: true }).click()

  // The rules came once: back Home, no pop-up.
  await page.goto('/home')
  await expect(page.getByRole('dialog', { name: 'Outfits' })).toBeHidden()
})

test('switched off: a plain Pikachu, no rules, no chip', async ({ page }) => {
  await boot(page, OFF)
  await page.goto('/team')
  await expect(page.getByRole('dialog', { name: 'Outfits' })).toBeHidden()
  const tile = page
    .getByRole('list', { name: 'Your team, in send-out order' })
    .getByRole('button', { name: /^Pikachu/ })
  await expect(tile).toBeVisible()
  await expect(page.getByRole('img', { name: 'Santa hat' })).toHaveCount(0)
  await tile.click()
  await expect(
    page.getByRole('dialog', { name: 'Pikachu' }).getByRole('button', { name: /Santa hat/ }),
  ).toHaveCount(0)
})
