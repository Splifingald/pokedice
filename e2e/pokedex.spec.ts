// The Pokédex (docs/43 §5.6) against the mocked Supabase. On a phone: the progress once, as the head's gauge; the
// search and the filter in one row; a dense grid where an uncaught species is its silhouette alone (its number for
// screen readers) and a caught one its icon and name; the entry a bottom sheet (hero, where to find it, evolutions both
// ways, the dice and stats folded). On a PC: the entry docked beside the grid, the first caught open, the arrow keys
// walking the grid with the entry following, Enter moving into it.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls } from './helpers'

/** Charmander's game with Caterpie, Pikachu and, the latest catch, Eevee (NEW on the grid). */
function save() {
  const s = makeSave(4)
  return { ...s, pokedex: [...new Set([...s.pokedex, 10, 25, 133])] }
}

async function boot(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await mockSupabase(page)
  const s = save()
  await page.addInitScript(
    ([json, f, seen]) => {
      if (!sessionStorage.getItem('booted')) {
        localStorage.setItem('pokedice.save', json!)
        // Everything but the last catch was looked at already: Eevee is NEW.
        localStorage.setItem('pokedice.dexSeen.kanto', seen!)
      }
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(s), FAST, String(s.pokedex.length - 1)],
  )
}

const tile = (page: Page, name: string | RegExp) => page.getByRole('button', { name })

test('phone: a dense grid, the gauge in the head, the entry as a sheet', async ({ page }) => {
  await boot(page, { width: 390, height: 844 })
  await page.goto('/pokedex')
  await expect(page.getByRole('heading', { level: 1, name: 'Pokédex Kanto' })).toBeVisible()
  // The progress, once: the head's gauge.
  await expect(page.getByRole('img', { name: /^4 of \d+ caught$/ })).toBeVisible()

  // Uncaught: the silhouette alone, its number and "not caught" for screen readers only.
  const bulbasaur = tile(page, '#001, Not caught yet')
  await expect(bulbasaur).toBeVisible()
  await expect(bulbasaur).toHaveText('')
  // Caught: the icon and the name; the latest catch wears NEW.
  await expect(tile(page, 'Charmander, #004')).toHaveText('Charmander')
  await expect(tile(page, 'Eevee, #133, NEW')).toContainText('NEW')

  // At least five to a row on a 390 px phone.
  const lefts = await page
    .locator('[data-tile]')
    .evaluateAll((els) => {
      const top = els[0]!.getBoundingClientRect().top
      return els.filter((e) => e.getBoundingClientRect().top === top).length
    })
  expect(lefts).toBeGreaterThanOrEqual(5)

  // The search and the filter share one row.
  const search = page.getByRole('searchbox', { name: /Search the Pokédex/ })
  const show = page.getByRole('combobox', { name: 'Show' })
  const [a, b] = [await search.boundingBox(), await show.boundingBox()]
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(4)
  await show.selectOption('caught')
  await expect(page.locator('[data-tile]')).toHaveCount(4)
  await show.selectOption('all')
  await search.fill('pika')
  await expect(page.locator('[data-tile]')).toHaveCount(1)
  await search.fill('')

  expect(await smallControls(page)).toEqual([])
  expect(await nonJerseyText(page)).toEqual([])
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])

  // An uncaught entry: the hero, where to find it, its evolutions; an evolution opens over it, Back returns.
  await bulbasaur.click()
  const sheet = page.getByRole('dialog', { name: '#001' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Not caught yet')
  await expect(sheet.getByRole('heading', { name: 'Where to find it' })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Evolutions' })).toBeVisible()
  await sheet.getByRole('button', { name: /Evolves into \?\?\? at Lv\.16/ }).click()
  await expect(page.getByRole('dialog', { name: '#002' })).toBeVisible()
  await page.getByRole('dialog', { name: '#002' }).getByRole('button', { name: /Back/ }).click()
  await expect(page.getByRole('dialog', { name: '#001' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A caught entry: the dice and stats wait folded; a stone's sources fold under its evolution.
  await tile(page, /^Eevee, #133/).click()
  const eevee = page.getByRole('dialog', { name: 'Eevee' })
  await expect(eevee).toBeVisible()
  await expect(eevee.getByRole('heading', { name: 'Dice' })).toHaveCount(0)
  await expect(eevee.getByText(/^Where to find the .* Stone$/).first()).toBeVisible()
  await eevee.getByText('Dice and stats').click()
  await expect(eevee.getByRole('heading', { name: 'Dice' })).toBeVisible()
  expect(await smallControls(page)).toEqual([])
  const sheetAxe = await new AxeBuilder({ page }).analyze()
  expect(
    sheetAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id),
  ).toEqual([])
})

test('PC: the entry docked beside the grid, the arrows walking it', async ({ page }) => {
  await boot(page, { width: 1440, height: 900 })
  await page.goto('/pokedex')
  // The first caught stands open, docked: no dialog over the grid.
  const pane = page.locator('aside:has([data-dex-entry])')
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText('Charmander')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile(page, 'Charmander, #004')).toHaveAttribute('aria-current', 'true')

  // One Tab stop for the grid; the arrows move through it and the entry follows.
  await tile(page, 'Charmander, #004').focus()
  await page.keyboard.press('ArrowRight')
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText('#005')
  await page.keyboard.press('ArrowLeft')
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText('Charmander')
  const cols = await page.locator('[data-tile]').evaluateAll((els) => {
    const top = els[0]!.getBoundingClientRect().top
    return els.filter((e) => e.getBoundingClientRect().top === top).length
  })
  await page.keyboard.press('ArrowDown')
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText(`#${String(4 + cols).padStart(3, '0')}`)
  await page.keyboard.press('End')
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText('#151')
  await page.keyboard.press('Home')
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText('#001')
  // Enter moves into the entry.
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-dex-entry]'))).toBe(true)

  // An evolution's card moves the grid's pick.
  await pane.getByRole('button', { name: /Evolves into \?\?\? at Lv\.16/ }).click()
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText('#002')
  await expect(tile(page, '#002, Not caught yet')).toHaveAttribute('aria-current', 'true')

  expect(await nonJerseyText(page)).toEqual([])
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})
