// Home, the area hub that replaced the Map: the area plate opens its details, AREAS opens the area list (with a
// search that finds Pokémon too), CONTINUE plays the area, and every sheet is a proper dialog.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import type { SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

async function seriousAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target}`)
}

test('the area plate opens its details, and Esc gives focus back to it', async ({ page }) => {
  const save = makeSave(4)
  const area = data.areas.find((a) => a.id === save.currentAreaId)!
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: `Exploring ${area.name}` })).toBeAttached()

  const plate = page.getByRole('button', { name: new RegExp(`^${escape(area.name)}`) }).first()
  await plate.click()
  const sheet = page.getByRole('dialog', { name: area.name })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'CONTINUE HERE' })).toBeVisible()
  expect(await seriousAxe(page)).toEqual([])

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(plate).toBeFocused()
})

test('AREAS lists the region, and its search finds areas by Pokémon', async ({ page }) => {
  await boot(page, makeSave(4))
  await page.goto('/home')
  await page.getByRole('button', { name: 'Areas: change where you explore' }).click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await expect(sheet).toBeVisible()
  const cards = sheet.getByRole('list').first().getByRole('listitem')
  const all = await cards.count()
  expect(all).toBeGreaterThan(5)

  await sheet.getByLabel('Search an area or a Pokémon').fill('pikachu')
  await expect(sheet.getByRole('button', { name: /^Viridian Forest/ })).toBeVisible()
  expect(await cards.count()).toBeLessThan(all)
  expect(await seriousAxe(page)).toEqual([])

  // The Regions view is a switch inside the same sheet.
  await sheet.getByRole('button', { name: 'Regions' }).click()
  await expect(page.getByRole('dialog', { name: 'Regions' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('CONTINUE plays the area on /area, and an idle /area goes back Home', async ({ page }) => {
  await boot(page, makeSave(4))
  await page.goto('/area')
  await expect(page).toHaveURL(/\/home$/)
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await expect(page).toHaveURL(/\/area$/)
  // Home stays lit in the menus while an encounter plays: it is where you are.
  await expect(page.getByRole('link', { name: 'Home', exact: true }).first()).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test("Home's widgets say what's next: the Day Care's unlock and how close Versus is", async ({ page }) => {
  await boot(page, makeSave(4))
  await page.goto('/home')
  // A locked widget says what opens it and how far you are; a tap says it again.
  const dayCare = page.getByRole('button', { name: 'Day Care: opens at 20 Pokémon caught, 1 so far' })
  await expect(dayCare).toContainText('1/20 caught')
  await expect(dayCare).toContainText('Opens for every region')
  await dayCare.click()
  await expect(page.getByText('The Day Care opens at 20 Pokémon caught, in every region')).toBeVisible()
  const versus = page.getByRole('button', { name: /Versus opens when 3 of your Pokémon reach Lv\.50/ })
  await expect(versus).toContainText('0/3 at Lv.50')
  expect(await seriousAxe(page)).toEqual([])
})

test('a new region: its partner is picked in the lab, from three Poké Balls', async ({ page }) => {
  // Kanto's league is won: Johto is on offer, and its pop-up opens by itself.
  const league = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
  const save = makeSave(4)
  const won = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
  await boot(page, { ...save, areaProgress: { ...save.areaProgress, [league]: won } })
  await page.goto('/home')
  await page.getByRole('button', { name: 'Go to Johto' }).click()

  const lab = page.getByRole('dialog', { name: 'Pick your partner in Johto' })
  await expect(lab).toBeVisible()
  // A ball opens; "not this one" puts it back, and another one is asked about.
  await lab.getByRole('button', { name: 'Poké Ball 1 of 3' }).click()
  await expect(lab.getByText('Do you want to pick Chikorita?')).toBeVisible()
  expect(await seriousAxe(page)).toEqual([])
  await lab.getByRole('button', { name: 'Not this one' }).click()
  await lab.getByRole('button', { name: 'Poké Ball 2 of 3' }).click()
  await lab.getByRole('button', { name: 'Pick Cyndaquil' }).click()
  await lab.getByRole('button', { name: /let's go/i }).click()
  await expect(lab).toHaveCount(0)
  // Johto begins at its first area.
  await expect(page.getByRole('heading', { name: 'Exploring Route 29' })).toBeAttached()
})
