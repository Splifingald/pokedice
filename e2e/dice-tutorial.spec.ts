// The dice tutorial (docs/46 §5): after Youngster Joey's ₽10, the hand walks a new player to their starter's type die
// (Home, its Shop tab, Upgrades, Dice Types, the die) and back to Route 1, once; nothing else can be pressed.
// SHOTS_DIR set: each step's screen is saved there too.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

const ROUTE1 = DEFAULT_CONFIG.openingRounds.areaId

/** Charmander after Route 1's first round: Joey beaten, ₽10 in the purse, the Fire die at Lv.1. */
function afterJoey(patch: Partial<SaveData> = {}): SaveData {
  const base = makeSave(4)
  return {
    ...base,
    gold: 10,
    currentAreaId: ROUTE1,
    areaProgress: {
      ...base.areaProgress,
      [ROUTE1]: { ...emptyProgress(), roundsDone: 1, round: 1, roundCounted: true, deck: [] },
    },
    ...patch,
  }
}

async function boot(page: Page, save: SaveData, access: 'all' | 'off' = 'all') {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [
      JSON.stringify(save),
      FAST,
      JSON.stringify({ ...EVENTS_ON, openingRounds: { ...DEFAULT_CONFIG.openingRounds, access } }),
    ],
  )
}

const shot = async (page: Page, name: string) => {
  const dir = process.env.SHOTS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` })
}

const bubble = (page: Page) => page.getByRole('status').filter({ hasText: 'PROF. OAK:' })

test('the hand walks a new player to the Fire die and back to Route 1, once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, afterJoey())
  await page.goto('/home')

  // 1. On Home: the bottom bar's Shop tab; nothing else can be pressed.
  await expect(bubble(page)).toContainText('You won ₽10!')
  await expect(bubble(page)).toContainText('Charmander')
  await expect(bubble(page)).toContainText('Tap Shop')
  await shot(page, '1-shop')
  await page.getByRole('link', { name: 'Pokédex' }).last().click({ force: true })
  await page.locator('[data-hud-gold]').click({ force: true })
  await expect(page).toHaveURL(/\/home$/)
  await page.locator('nav [data-guide="nav-shop"]:visible').click()

  // 2. The Mart: Upgrades (its tab's dot may have opened it there already).
  await expect(page).toHaveURL(/\/shop/)
  if (!/tab=upgrades/.test(page.url())) {
    await expect(bubble(page)).toContainText(/Open Upgrades|open Upgrades/)
    await shot(page, '2-upgrades')
    await page.locator('#mart-upgrades').click()
  }

  // 3. Dice Types (the Mart may have opened on Upgrades already: its nav dot leads there).
  await expect(bubble(page)).toContainText('Open Dice Types')
  await shot(page, '3-dice')
  await page.locator('#up-dice').click()

  // 4. The Fire die, ₽10.
  await expect(bubble(page)).toContainText('Upgrade the Fire die for ₽10')
  await shot(page, '4-buy')
  await page.locator('[data-guide="buy-die-fire"]').click()

  // 5. Bought: back to Route 1.
  await expect(bubble(page)).toContainText('Your Fire die is Lv.2 now')
  await expect(page.locator('[data-hud-gold]')).toContainText('₽ 0')
  await shot(page, '5-back')
  await page.getByRole('button', { name: 'BACK TO Route 1' }).click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(bubble(page)).toHaveCount(0)
  await shot(page, '6-area')

  // Once: done for good in the save, and Home has no hand either.
  await page.getByRole('button', { name: /^home$/i }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true }).first()).toBeVisible()
  await expect(bubble(page)).toHaveCount(0)
  // The save's write is debounced: wait for it rather than read it at once.
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
  await expect.poll(async () => (await saved()).diceTutorial).toBe('done')
  expect((await saved()).dieLevels.fire).toBe(2)
})

test("on PC, away from Home: Home first, then the side rail's Shop", async ({ page }) => {
  await boot(page, afterJoey())
  await page.goto('/team')
  await expect(bubble(page)).toContainText('First, head Home')
  await shot(page, 'pc-1-home')
  await page.locator('nav [data-guide="nav-home"]:visible').click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(bubble(page)).toContainText('Tap Shop')
  await shot(page, 'pc-2-shop')
  await page.locator('nav [data-guide="nav-shop"]:visible').click()
  if (!/tab=upgrades/.test(page.url())) await page.locator('#mart-upgrades').click()
  await page.locator('#up-dice').click()
  await expect(bubble(page)).toContainText('Upgrade the Fire die')
  await shot(page, 'pc-4-buy')
})

test('switched off, or before Joey is beaten, there is no tutorial', async ({ page }) => {
  await boot(page, afterJoey(), 'off')
  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true }).first()).toBeVisible()
  await expect(bubble(page)).toHaveCount(0)
})
