import { expect, test, type Page } from '@playwright/test'
import { FAST, fakeSession, LEADERBOARD, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

async function signedIn(page: Page, save: object) {
  await page.addInitScript(
    ([key, session, s, f]) => {
      localStorage.setItem(key!, session!)
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), FAST],
  )
}

test('the trainer card picks the look shown on the leaderboard, and keeps the character', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, makeSave(4, { player: { name: 'Sam', character: 'green' } }))
  await page.goto('/map')
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Trainer card' }).click()

  const card = page.getByRole('dialog', { name: 'Trainer card' })
  // No pick yet: the look is the character, Leaf.
  await expect(card.getByRole('img', { name: 'Leaf' })).toBeVisible()
  await card.getByRole('button', { name: 'Choose your look' }).click()
  await expect(card.getByRole('radio', { name: 'Leaf' })).toHaveAttribute('aria-checked', 'true')
  await card.getByRole('radiogroup', { name: 'Johto' }).getByRole('radio', { name: 'Kimono Girl' }).click()
  await expect(card.getByRole('img', { name: 'Kimono Girl' })).toBeVisible()

  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').player))
    .toEqual({ name: 'Sam', character: 'green', avatar: 'johto/kimono-girl' })

  // Changing name or character later keeps the look.
  await card.getByRole('button', { name: 'CHANGE' }).first().click()
  await card.getByRole('radio', { name: 'Character 1' }).click()
  await card.getByRole('button', { name: 'SAVE' }).click()
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').player))
    .toEqual({ name: 'Sam', character: 'red', avatar: 'johto/kimono-girl' })
})

test('the leaderboard draws each trainer with their look', async ({ page }) => {
  await mockSupabase(page)
  const rows = LEADERBOARD.map((r) => (r.name === 'Leaf' ? { ...r, character: 'kanto/hiker' } : r.name === 'Blue' ? { ...r, character: 'kanto/champion-brock' } : r))
  await page.route('**/rest/v1/rpc/leaderboard', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }))
  await signedIn(page, makeSave(4, { player: { name: 'Sam', character: 'red' } }))
  await page.goto('/leaderboard')
  const row = (name: string) => page.getByRole('listitem').filter({ hasText: name }).first().locator('img').first()
  await expect(row('Leaf')).toHaveAttribute('src', '/trainers/classes/hiker.png')
  await expect(row('Sam')).toHaveAttribute('src', '/characters/red.png')
  // Not on the list (a Gym Leader): drawn as Red.
  await expect(row('Blue')).toHaveAttribute('src', '/characters/red.png')
})
