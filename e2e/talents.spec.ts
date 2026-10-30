// Hidden talents (docs/51, docs/15 §38): with the switch on, the rules once (Later); a Pokémon carrying its family's
// talent wears the gem on its Box tile and its card; its sheet's Talent section names it, INFO shows the rules again; a
// Pokémon of a family never met says "???". Switched off, no gem, no section, no pop-up.
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()
const ON = {
  ...EVENTS_ON,
  hiddenTalents: { access: 'all', wildChance: 0.05, evolveChance: 0.3, families: {} },
}

/** Charmander leads Rattata (Pickup, unlocked in Kanto) and Pidgey (never met). */
function talentSave(): SaveData {
  const base = makeSave(4)
  const rattata = { ...createInstance(19, 12, data, 'tal-rattata', Date.now()), talent: true }
  const pidgey = createInstance(16, 10, data, 'tal-pidgey', Date.now() + 1)
  return {
    ...base,
    box: [...base.box, rattata, pidgey],
    team: [base.team[0]!, rattata.id, pidgey.id],
    pokedex: [...base.pokedex, 19, 16],
    talents: { kanto: [19] },
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
    [JSON.stringify(talentSave()), FAST, JSON.stringify(devConfig)],
  )
}

test.use({ viewport: { width: 390, height: 844 } })

test('switched on: the rules once, the gem on the Box and the card, the sheet names it', async ({ page }) => {
  await boot(page, ON)
  await page.goto('/home')
  const rules = page.getByRole('dialog', { name: 'Hidden talents' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('One talent per family')).toBeVisible()
  await rules.getByRole('button', { name: 'Later' }).click()
  await expect(rules).toBeHidden()

  await page.goto('/team')
  await expect(page.getByRole('img', { name: 'Hidden talent: Pickup' }).first()).toBeVisible()
  await page
    .getByRole('list', { name: 'Your team, in send-out order' })
    .getByRole('button', { name: /^Rattata/ })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Rattata' })
  await expect(sheet.getByRole('heading', { name: 'Hidden talent' })).toBeVisible()
  await expect(sheet.getByText('Pickup', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: /Hidden talents/ }).click()
  await expect(page.getByRole('dialog', { name: 'Hidden talents' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Hidden talents' })
    .getByRole('button', { name: 'OK', exact: true })
    .click()

  // The rules came once: back Home, no pop-up.
  await page.goto('/home')
  await expect(page.getByRole('dialog', { name: 'Hidden talents' })).toBeHidden()
})

test('a family never met: "???" on the sheet', async ({ page }) => {
  await boot(page, ON)
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem('pokedice.save')!)
    localStorage.setItem('pokedice.save', JSON.stringify({ ...s, talentRulesSeen: true }))
  })
  await page.goto('/team')
  await page
    .getByRole('list', { name: 'Your team, in send-out order' })
    .getByRole('button', { name: /^Pidgey/ })
    .click()
  const sheet = page.getByRole('dialog', { name: 'Pidgey' })
  await expect(sheet.getByText('???', { exact: true })).toBeVisible()
})

test('switched off: no gem, no section, no pop-up', async ({ page }) => {
  await boot(page, EVENTS_ON)
  await page.goto('/team')
  await expect(page.getByRole('img', { name: /Hidden talent/ })).toHaveCount(0)
  await page
    .getByRole('list', { name: 'Your team, in send-out order' })
    .getByRole('button', { name: /^Rattata/ })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Rattata' }).getByRole('heading', { name: 'Hidden talent' }),
  ).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Hidden talents' })).toHaveCount(0)
})
