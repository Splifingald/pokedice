// Dark mode (Settings → Theme): the switch puts the theme on the page and keeps it after a reload, and every main
// screen keeps its contrast in dusk colours.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()

/** A small team, a Box and some money, so every screen has something on it. */
function save(theme?: 'light' | 'dark' | 'auto'): SaveData {
  const base = makeSave(4, { gold: 1240 })
  const extra = [
    createInstance(25, 21, data, 'th-1', Date.now()),
    createInstance(74, 20, data, 'th-2', Date.now()),
  ]
  return {
    ...base,
    box: [...base.box, ...extra],
    team: [base.team[0]!, extra[0]!.id],
    // Twenty species open the Day Care: one of yours, a friend's Ditto (a pair), and short of ₽ for Egg now.
    pokedex: [...new Set([...base.pokedex, 25, 74, ...Array.from({ length: 20 }, (_, i) => i + 1)])],
    settings: { ...base.settings, ...JSON.parse(FAST), theme },
    dayCare: {
      residents: [{ inst: createInstance(133, 24, data, 'th-dc', Date.now()), since: Date.now(), region: 'kanto' }],
      guests: [{ owner: 'u-lea', ownerName: 'Lea', ownerAvatar: 'red', inst: 'g-1', dex: 132, level: 30, addedAt: 0 }],
      eggClaimed: true,
      visited: true,
    },
  }
}

async function boot(page: Page, s: SaveData) {
  await mockSupabase(page)
  await page.addInitScript((json) => {
    if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', json)
    sessionStorage.setItem('booted', '1')
  }, JSON.stringify(s))
}

test('Settings → Theme: Dark puts dusk on the page and keeps it after a reload', async ({ page }) => {
  await boot(page, save())
  await page.goto('/settings')
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-theme', 'dark')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 23, 42)')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(html).not.toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(233, 240, 248)')
})

test('Auto follows the device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await boot(page, save('auto'))
  await page.goto('/settings')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
})

for (const route of [
  '/home',
  '/team',
  '/shop',
  '/upgrades',
  '/pokedex',
  '/leaderboard',
  '/friends',
  '/settings',
  '/help',
  '/daycare',
]) {
  test(`dark ${route}: every text keeps its contrast`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await boot(page, save('dark'))
    await page.goto(route)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.waitForTimeout(400)
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(
      violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`)),
    ).toEqual([])
  })
}

test('dark: the Pokémon sheet and the Pokédex entry keep their contrast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, save('dark'))
  await page.goto('/team')
  await page
    .getByRole('button', { name: /Pikachu/ })
    .first()
    .click()
  await expect(page.getByRole('dialog', { name: /Pikachu/ })).toBeVisible()
  const sheet = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  expect(sheet.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([])
  await page.goto('/pokedex')
  await page
    .getByRole('button', { name: /Charmander/ })
    .first()
    .click()
  await expect(page.getByRole('dialog', { name: /Charmander/ })).toBeVisible()
  const dex = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  expect(dex.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([])
})
