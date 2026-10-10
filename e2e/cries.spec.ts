// Cries come from Showdown, never our host: a Pokémon's sheet plays one on a tap, a battle as each Pokémon comes out,
// and with sound off there is no button and nothing is asked for.
import { expect, test, type Page } from '@playwright/test'
import type { SaveData } from '../src/engine'
import { FAST, makeSave, mockSupabase } from './helpers'

const CRIES = 'https://play.pokemonshowdown.com/audio/cries/'

async function boot(page: Page, save: SaveData, sound: boolean) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify({ ...save, settings: { ...save.settings, sound, sfx: sound } }), FAST],
  )
}

/** Every cry the page asks Showdown for, answered here (as a miss: no sound) so the test needs no network. */
async function recordCries(page: Page) {
  const asked: string[] = []
  await page.route(`${CRIES}**`, (route) => {
    asked.push(route.request().url())
    return route.fulfill({ status: 404, body: '' })
  })
  return asked
}

/** Charmander's sheet, from the Pokédex. `nav`: through the side nav, not a reload (which would reset the save). */
async function openCharmander(page: Page, nav = false) {
  if (nav) await page.getByRole('link', { name: 'Pokédex' }).click()
  else await page.goto('/pokedex')
  await page
    .getByRole('button', { name: /Charmander/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: /Charmander/ })
  await expect(sheet).toBeVisible()
  return sheet
}

test("a Pokémon's sheet plays its cry from Showdown", async ({ page }) => {
  const asked = await recordCries(page)
  await boot(page, makeSave(4), true)
  const sheet = await openCharmander(page)
  expect(asked).toEqual([])
  await sheet.getByRole('button', { name: "Play Charmander's cry" }).click()
  await expect.poll(() => asked).toEqual([`${CRIES}charmander.mp3`])
})

test('a battle plays the foe’s cry, then yours', async ({ page }) => {
  const asked = await recordCries(page)
  await boot(page, makeSave(4), true)
  await page.goto('/home')
  for (let i = 0; i < 200 && !asked.includes(`${CRIES}charmander.mp3`); i++) {
    for (const name of ['CONTINUE', 'EXPLORE', 'NEXT ENCOUNTER', 'ENTER', 'PICK IT UP', 'FIGHT']) {
      const btn = page.getByRole('button', { name, exact: true }).first()
      if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
        await btn.click()
        break
      }
    }
    await page.waitForTimeout(60)
  }
  await expect.poll(() => asked.includes(`${CRIES}charmander.mp3`)).toBe(true)
  // The foe came out first.
  expect(asked.indexOf(`${CRIES}charmander.mp3`)).toBeGreaterThan(0)
})

test('with sound off there is no cry button, and no cry is asked for', async ({ page }) => {
  const asked = await recordCries(page)
  await boot(page, makeSave(4), false)
  const sheet = await openCharmander(page)
  await expect(sheet.getByRole('button', { name: /cry/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // The one Sound switch in Settings brings it back.
  await page.goto('/settings')
  const sound = page.getByRole('switch', { name: /^Sound/ })
  await expect(sound).not.toBeChecked()
  await sound.click()
  await expect(sound).toBeChecked()
  const again = await openCharmander(page, true)
  await expect(again.getByRole('button', { name: "Play Charmander's cry" })).toBeVisible()
  expect(asked).toEqual([])
})
