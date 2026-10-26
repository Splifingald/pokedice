// Leaving a fight never skips it (src/store/resume.ts): a reload lands back in the same battle at the same point, and
// the title's CONTINUE goes straight back into it. The top bar stays in reach while it plays (docs/15 §12).
import { expect, test, type Page } from '@playwright/test'
import { FAST, makeSave, mockSupabase } from './helpers'

/** The save goes in once: the page's own writes are what a reload must find. */
async function boot(page: Page) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      if (sessionStorage.getItem('e2e.seeded')) return
      sessionStorage.setItem('e2e.seeded', '1')
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      // Prof. Oak's share prompt would cover the screen.
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [JSON.stringify(makeSave(4)), FAST],
  )
}

const attack = (page: Page) => page.getByRole('button', { name: 'ATTACK', exact: true })

/** From Home into a fight, up to the dice thrown and ATTACK ready. */
async function toBattle(page: Page) {
  await page.goto('/home')
  const healing = page.getByRole('dialog', { name: 'Healing…' })
  // isVisible doesn't wait for ATTACK to exist (isEnabled would).
  const ready = async () =>
    (await attack(page)
      .isVisible()
      .catch(() => false)) && (await attack(page).isEnabled())
  for (let i = 0; i < 150 && !(await ready()); i++) {
    if (await healing.isVisible().catch(() => false)) {
      await healing.getByRole('button', { name: 'SKIP ▸▸' }).click()
      continue
    }
    for (const name of ['FIGHT', 'EXPLORE', 'ENTER', 'PICK IT UP', 'CONTINUE', 'SKIP TURN']) {
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

/** What the fight shows: the dice thrown and the battle's line. */
async function fightNow(page: Page) {
  const dice = await page
    .getByRole('group', { name: 'Your dice' })
    .locator('[aria-label]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const message = await page.locator('.battle-line').first().innerText()
  return { dice, message }
}

/** The fight as the page stored it. */
const stored = (page: Page) =>
  page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as {
      resume?: { run: { phase: string }; battle: { log: unknown[]; state: unknown } }
    }
    return save.resume
      ? { phase: save.resume.run.phase, log: save.resume.battle.log.length, state: save.resume.battle.state }
      : null
  })

test('a reload mid-battle lands back in the same fight, at the same point', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page)
  await toBattle(page)
  const before = await fightNow(page)
  expect(before.dice.length).toBeGreaterThan(0)

  await page.reload()
  await expect(page).toHaveURL(/\/area$/)
  await expect(attack(page)).toBeEnabled()
  // The same dice on the tray, the same line in the message box: nothing thrown again, nothing played over.
  expect(await fightNow(page)).toEqual(before)
  const kept = await stored(page)
  expect(kept?.phase).toBe('battle')

  // From the title, CONTINUE goes straight back into it too.
  await page.goto('/')
  await page
    .getByRole('button', { name: /continue/i })
    .first()
    .click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(attack(page)).toBeEnabled()
  expect(await fightNow(page)).toEqual(before)
  expect(await stored(page)).toEqual(kept)
})

test('the top bar stays in reach in battle: what would leave the fight says why', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page)
  await toBattle(page)
  await expect(page.locator('header')).toBeVisible()

  // The gold: focusable, shut, its reason in its name; a tap says it and stays in the fight.
  const gold = page.getByRole('link', { name: /Open the Poké Mart/ })
  await expect(gold).toHaveAttribute('aria-disabled', 'true')
  await expect(gold).toHaveAccessibleName(/Finish the fight first/)
  await gold.focus()
  await expect(gold).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Finish the fight first').first()).toBeVisible()
  await expect(page).toHaveURL(/\/area$/)

  // The trainer menu opens: the guide works, the ways out are listed with the reason.
  await page.getByRole('button', { name: /trainer menu/i }).click()
  const menu = page.getByRole('dialog', { name: 'Trainer card' })
  await expect(menu).toBeVisible()
  const board = menu.getByRole('button', { name: 'Leaderboard', exact: true })
  await expect(board).toHaveAttribute('aria-disabled', 'true')
  await expect(board).toHaveAccessibleDescription('Finish the fight first')
  // (Playwright won't tap what says it's disabled: the tap is forced, as a finger would.)
  await board.click({ force: true })
  await expect(page.getByText('Finish the fight first').first()).toBeVisible()
  await expect(page).toHaveURL(/\/area$/)
  await menu.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'How to play' })).toHaveCount(0)

  // Back to the fight, untouched.
  await expect(attack(page)).toBeEnabled()
})

test('Settings open over the fight: the harmless ones work, what would end it says why, and back is the same fight', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page)
  await toBattle(page)
  const before = await fightNow(page)
  const kept = await stored(page)
  expect(kept?.phase).toBe('battle')
  const toasts = page.getByRole('region', { name: 'Notifications' })

  // The trainer menu's Settings row works mid-fight: Settings open over the battle, which stays where it is.
  await page.getByRole('button', { name: /trainer menu/i }).click()
  const menu = page.getByRole('dialog', { name: 'Trainer card' })
  const row = menu.getByRole('button', { name: 'Settings', exact: true })
  await expect(row).not.toHaveAttribute('aria-disabled', 'true')
  await row.click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toBeVisible()
  await expect(page).toHaveURL(/\/area$/)
  await expect(settings.getByText(/The fight waits while you're here/)).toBeVisible()

  // Something harmless: the theme changes at once.
  await settings.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // What would end the fight is there, shut, its reason in its name; a tap says it and does nothing else.
  // The one Delete (a save, the Extreme save, all the data: docs/38 U8b).
  const wipe = settings.getByRole('button', { name: /^Delete a save or my data/ })
  await expect(wipe).toHaveAttribute('aria-disabled', 'true')
  await expect(wipe).toHaveAccessibleName('Delete a save or my data. Finish the fight first')
  // (Playwright won't tap what says it's disabled: the tap is forced, as a finger would.)
  await wipe.click({ force: true })
  await expect(toasts.getByText('Finish the fight first')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'What do you want to delete?' })).toHaveCount(0)
  await expect(settings.getByRole('button', { name: /^Check for updates/ })).toHaveAccessibleName(
    'Check for updates. Finish the fight first',
  )
  // Keys inside Settings never play the fight behind it (Enter on the battle's page, not on a button, is ATTACK).
  await settings.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')

  // The fight waited: nothing thrown, nothing played while Settings were up.
  expect(await stored(page)).toEqual(kept)

  // BACK TO THE FIGHT: the very same fight, its dice and its message, the setting kept.
  await settings.getByRole('button', { name: 'Back to the fight' }).click()
  await expect(settings).toHaveCount(0)
  await expect(page).toHaveURL(/\/area$/)
  await expect(attack(page)).toBeEnabled()
  expect(await fightNow(page)).toEqual(before)
  expect(await stored(page)).toEqual(kept)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
