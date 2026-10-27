// The Mart (docs/43 §5.5): one item tile everywhere, a price that is the purchase (one tap), the item's details with
// ×1 / ×5 / ×10 each a purchase — a sheet on a phone, docked beside the shelf on PC with the Bag standing there while
// nothing is open — and Upgrades' views as one compact row under the Mart's tabs.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import type { SaveData } from '../src/engine'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls } from './helpers'

const save = () => makeSave(4, { gold: 500, inventory: { 'poke-ball': 3, potion: 2 } })

async function boot(page: Page, s: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([v, f]) => {
      localStorage.setItem('pokedice.save', v!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(s), FAST],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData)

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target}`)

test('a phone: the price buys one, the tile opens ×1 / ×5 / ×10 as purchases, the Bag sells', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, save())
  // Home → the top bar's gold (the Mart, on Buy) → the price: two taps to a Poké Ball. (The Mart's tab opens on
  // Upgrades while one is affordable, so an upgrade is two taps too.)
  await page.goto('/home')
  await page.getByRole('link', { name: /Open the Poké Mart/ }).click()
  await expect(page).toHaveURL(/\/shop$/)
  const tile = page.locator('[data-item-tile="poke-ball"]')
  await tile.getByRole('button', { name: /^Buy one Poké Ball, ₽/ }).click()
  await expect.poll(async () => (await stored(page)).inventory['poke-ball']).toBe(4)
  // The count on the tile says it.
  await expect(tile).toContainText('×4')

  // The tile opens its details as a sheet: each quantity is its own purchase, at the foot.
  await tile.locator('[data-open]').click()
  const sheet = page.getByRole('dialog', { name: 'Poké Ball' })
  await expect(sheet.getByText('In your bag: ×4')).toBeVisible()
  const gold = (await stored(page)).gold
  await sheet.getByRole('button', { name: /^Buy 5 Poké Ball, ₽/ }).click()
  await expect.poll(async () => (await stored(page)).inventory['poke-ball']).toBe(9)
  expect((await stored(page)).gold).toBe(gold - 5 * 20)
  // Short of ₽ a quantity stays focusable, says what's missing, and buys nothing.
  await page.evaluate(() => {
    const pd = (
      window as unknown as {
        __pd: { useGame: { setState: (f: (s: { save: SaveData }) => unknown) => void } }
      }
    ).__pd
    pd.useGame.setState((s) => ({ save: { ...s.save, gold: 30 } }))
  })
  await sheet.getByRole('button', { name: /Poké Ball ×5: Need/ }).click({ force: true })
  await expect(page.getByText(/Need ₽70 more/).first()).toBeVisible()
  expect((await stored(page)).inventory['poke-ball']).toBe(9)
  await sheet.getByRole('button', { name: 'Close' }).click()

  // The categories are one row; nothing scrolls sideways; Jersey only; 44 px targets; axe clean.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await nonJerseyText(page)).toEqual([])
  expect(await smallControls(page)).toEqual([])
  expect(await serious(page)).toEqual([])

  // The Bag: the same tiles; one opens and sells.
  await page.getByRole('tab', { name: 'Bag' }).click()
  await page.locator('[data-item-tile="potion"] [data-open]').click()
  await page
    .getByRole('dialog', { name: 'Potion' })
    .getByRole('button', { name: /^Sell 1 Potion for ₽/ })
    .click()
  await expect.poll(async () => (await stored(page)).inventory['potion']).toBe(1)
})

test('PC: the shelf in columns, the Bag docked beside it, the item opened in its place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await boot(page, save())
  await page.goto('/shop')
  await expect(page.getByRole('heading', { name: 'Poké Mart', level: 1 })).toBeVisible()
  // Nothing open: the Bag stands in the pane.
  const bag = page.getByRole('region', { name: 'Bag' })
  await expect(bag.getByRole('button', { name: /Poké Ball/ })).toBeVisible()
  // Four tiles to a row.
  const tops = await page
    .locator('main ul [data-item-tile]')
    .evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  // A tile opens its details in the pane, not over the page.
  await page.locator('[data-item-tile="potion"] [data-open]').first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const pane = page.getByRole('region', { name: 'Potion' })
  await pane.getByRole('button', { name: /^Buy 10 Potion, ₽/ }).click()
  await expect.poll(async () => (await stored(page)).inventory['potion']).toBe(12)
  await pane.getByRole('button', { name: 'Close' }).click()
  await expect(bag).toBeVisible()
  expect(await serious(page)).toEqual([])

  // Upgrades: the Mart's tab, its views a compact row beside Affordable, the cards in columns.
  await page.getByRole('tab', { name: /^Upgrades/ }).click()
  await expect(page).toHaveURL(/tab=upgrades/)
  const views = page.getByRole('tablist', { name: 'Upgrades' })
  await expect(views.getByRole('tab', { name: /^Combos/ })).toHaveAttribute('aria-selected', 'true')
  const affordable = page.getByRole('button', { name: /^Affordable/ })
  const [v, a] = [await views.boundingBox(), await affordable.boundingBox()]
  expect(Math.abs(v!.y - a!.y)).toBeLessThan(8)
  // The cards in columns: three on a 1440 px window.
  const tracks = await page
    .locator('[aria-labelledby="up-combos"] > ul')
    .first()
    .evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').length)
  expect(tracks).toBe(3)
  // The view lives in the address.
  await views.getByRole('tab', { name: /^Dice Types/ }).click()
  await expect(page).toHaveURL(/up=dice/)
  expect(await serious(page)).toEqual([])
})
