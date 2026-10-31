// The item tutorial (docs/46 §7): the first time the Pokémon in battle is below half HP with a potion that would waste
// at most 5 HP, the hand points at the Bag. A phone must open it (and may close it again: nothing forces the potion);
// a computer, whose Bag is the open column at the side, reads it and presses OK. Once.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

/** Charmander at Lv.20 down to 10 HP (Rattata can't K.O. it), two Potions, past the reroll lesson. */
function hurt(): SaveData {
  const base = makeSave(4, { rerollLesson: 'done' })
  return {
    ...base,
    inventory: { ...base.inventory, potion: 2 },
    box: base.box.map((p, i) => (i === 0 ? { ...p, level: 20, currentHp: 10 } : p)),
  }
}

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [
      JSON.stringify(save),
      FAST,
      // Entering an area hurt would send a Center first: the fight starts hurt instead.
      JSON.stringify({
        ...EVENTS_ON,
        forcedCenterWhenHurt: false,
        openingRounds: { ...DEFAULT_CONFIG.openingRounds, access: 'all' },
      }),
    ],
  )
}

const attack = (page: Page) => page.getByRole('button', { name: 'ATTACK', exact: true })
const bubble = (page: Page) => page.getByRole('status').filter({ hasText: 'PROF. OAK:' })
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))

/** From Home into Route 1's first fight. */
async function toFight(page: Page) {
  await page.goto('/home')
  for (
    let i = 0;
    i < 150 &&
    !(await bubble(page)
      .isVisible()
      .catch(() => false));
    i++
  ) {
    for (const name of ['FIGHT', 'CONTINUE', 'GO!', 'NEXT']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
}

test("a phone: below half HP, the hand has the Bag opened; the potion stays the player's choice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, hurt())
  await toFight(page)
  await expect(bubble(page)).toContainText('You can use potions in battle')
  // Nothing else can be pressed.
  await attack(page)
    .click({ force: true, timeout: 2000 })
    .catch(() => {})
  await expect(bubble(page)).toBeVisible()
  await page.getByRole('button', { name: 'Bag', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(bubble(page)).toHaveCount(0)
  // Closed again without a potion: the turn goes on, and the tutorial is done.
  await page.keyboard.press('Escape')
  await expect(attack(page)).toBeEnabled()
  await expect.poll(async () => (await saved(page)).itemLesson).toBe('done')
  expect((await saved(page)).inventory.potion).toBe(2)
})

test('a computer: the Bag column, then OK', async ({ page }) => {
  await boot(page, hurt())
  await toFight(page)
  await expect(bubble(page)).toContainText('You can use potions in battle')
  await bubble(page).getByRole('button', { name: 'OK' }).click()
  await expect(bubble(page)).toHaveCount(0)
  await expect(attack(page)).toBeEnabled()
  await expect.poll(async () => (await saved(page)).itemLesson).toBe('done')
})

test('above half HP, there is no tutorial', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, { ...hurt(), box: hurt().box.map((p, i) => (i === 0 ? { ...p, currentHp: 999 } : p)) })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(attack(page)).toBeEnabled({ timeout: 20_000 })
  await page.waitForTimeout(1000)
  await expect(bubble(page)).toHaveCount(0)
})
