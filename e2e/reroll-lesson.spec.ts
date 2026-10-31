// The reroll lesson (docs/46 §6): in a new player's first fight on Route 1, the first throw is an average hit that
// leaves Rattata standing, the second the worst the dice can do; the hand has them pick both dice and REROLL, the reroll lands a pair of 4s, its combo bonus is shown, and ATTACK
// ends it, once. Nothing but the step's own control can be pressed meanwhile.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG } from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

async function boot(page: Page, access: 'all' | 'off' = 'all') {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [
      JSON.stringify(makeSave(4)),
      FAST,
      JSON.stringify({ ...EVENTS_ON, openingRounds: { ...DEFAULT_CONFIG.openingRounds, access } }),
    ],
  )
}

const attack = (page: Page) => page.getByRole('button', { name: 'ATTACK', exact: true })
const tray = (page: Page) => page.getByRole('group', { name: 'Your dice' }).getByRole('button')
const bubble = (page: Page) => page.getByRole('status').filter({ hasText: 'PROF. OAK:' })

/** From Home into the next fight, with ATTACK to press. */
async function toFight(page: Page) {
  const ready = async () =>
    (await attack(page)
      .isVisible()
      .catch(() => false)) && (await attack(page).isEnabled())
  for (let i = 0; i < 150 && !(await ready()); i++) {
    // Switched off, the deck is shuffled: a find or a Center may come first.
    const healing = page.getByRole('dialog', { name: 'Healing…' })
    if (await healing.isVisible().catch(() => false)) await healing.getByRole('button', { name: 'SKIP ▸▸' }).click()
    for (const name of ['FIGHT', 'EXPLORE', 'ENTER', 'PICK IT UP', 'CONTINUE', 'GO!', 'NEXT']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
  await expect(attack(page)).toBeEnabled()
}

test('the second throw is bad, the hand mends it with a reroll of both dice, a pair of 4s, ATTACK', async ({
  page,
}) => {
  await boot(page)
  await page.goto('/home')
  await toFight(page)
  // The first throw is the player's own: no guide.
  await expect(bubble(page)).toHaveCount(0)
  await attack(page).click()
  // The first hit leaves Rattata standing: the second throw comes after its turn.
  await expect(bubble(page)).toBeVisible({ timeout: 30_000 })

  // 1. The bad throw: pick both dice. ATTACK can't be pressed.
  await expect(bubble(page)).toContainText('a bad roll')
  await attack(page).click({ force: true, timeout: 2000 }).catch(() => {})
  await expect(tray(page)).toHaveCount(2)
  await tray(page).nth(0).click()
  await expect(bubble(page)).toContainText('a bad roll')
  await tray(page).nth(1).click()

  // 2. Both picked: REROLL.
  await expect(bubble(page)).toContainText('Now REROLL')
  await page.getByRole('button', { name: /^REROLL \(\d\)$/ }).click()

  // 3. A pair of 4s, its bonus shown: ATTACK.
  await expect(bubble(page)).toContainText('A pair!')
  await expect(bubble(page)).toContainText('+2 damage')
  await expect(tray(page).nth(0)).toHaveAccessibleName(/4/)
  await expect(tray(page).nth(1)).toHaveAccessibleName(/4/)
  await expect(page.getByText('Pair +2')).toBeVisible()
  await attack(page).click()
  await expect(bubble(page)).toHaveCount(0)
  // The pair finishes Rattata: worn out, to be caught.
  await expect(page.getByText('The wild Rattata is worn out!')).toBeVisible({ timeout: 15_000 })

  // Once: done in the save.
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
  await expect.poll(async () => (await saved()).rerollLesson).toBe('done')
})

test('switched off, the second throw is left to chance and there is no guide', async ({ page }) => {
  await boot(page, 'off')
  await page.goto('/home')
  await toFight(page)
  await attack(page).click()
  await page.waitForTimeout(1500)
  await expect(bubble(page)).toHaveCount(0)
})
