import { expect, test, type Page } from '@playwright/test'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

/** Click the first visible, enabled button among `names` (exact accessible names). Returns the one clicked. */
async function clickAny(page: Page, names: string[]): Promise<string | null> {
  for (const name of names) {
    const btn = page.getByRole('button', { name, exact: true }).first()
    if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
      await btn.click()
      return name
    }
  }
  return null
}

test('new game → first battle → win', async ({ page }) => {
  await mockSupabase(page)
  await page.addInitScript((s) => localStorage.setItem('pokedice.settings', s), FAST)
  await page.goto('/')
  await page.getByRole('button', { name: 'NEW GAME' }).click()
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await expect(page.getByRole('heading', { name: 'Select your character' })).toBeVisible()
  await page.getByRole('radio', { name: 'Character 2' }).click()
  await page.getByLabel('Your name').fill('Sam')
  await page.getByRole('button', { name: 'NEXT ▸' }).click()
  await page.getByRole('button', { name: /Squirtle/ }).first().click()
  await page.getByRole('button', { name: 'YES!' }).click()
  await expect(page).toHaveURL(/\/area$/)
  // Prof. Oak shows the leaderboard first.
  await page.getByRole('button', { name: 'SEE THE LEADERBOARD' }).click()
  await expect(page.getByRole('heading', { name: 'Leaderboard', level: 1 })).toBeVisible()
  await page.goto('/area')

  for (let i = 0; i < 400; i++) {
    if (await page.getByText('VICTORY!').isVisible()) break
    await clickAny(page, ['EXPLORE', 'NEXT ENCOUNTER', 'ENTER', 'PICK IT UP', 'ROLL TO CATCH', 'CATCH', 'CONTINUE', 'TRY AGAIN', 'FIGHT', 'SKIP TURN', 'ATTACK'])
    await page.waitForTimeout(60)
  }
  await expect(page.getByText('VICTORY!')).toBeVisible()
  await expect(page.getByText(/\+\d+ XP/).first()).toBeVisible()
})

test('buy an upgrade', async ({ page }) => {
  await mockSupabase(page)
  const save = makeSave(7, { gold: 500 })
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
  await page.goto('/upgrades')
  await expect(page.getByRole('heading', { name: 'Upgrades' })).toBeVisible()
  await page.getByRole('button', { name: /₽5/ }).first().click() // Pair → Lv.2 costs 5
  await expect(page.getByLabel('495 Pokédollars').first()).toBeVisible()
  await expect(page.getByText(/\+3\s*→\s*\+4/).first()).toBeVisible()

  await page.getByRole('tab', { name: 'Dice Types' }).click()
  await page.getByRole('button', { name: /₽10/ }).first().click()
  await expect(page.getByLabel('485 Pokédollars').first()).toBeVisible()
})

test('sign-in flow (mocked Supabase)', async ({ page }) => {
  const calls = await mockSupabase(page)
  await page.addInitScript((s) => localStorage.setItem('pokedice.settings', s), FAST)
  await page.goto('/')

  // 1. CONNECT starts the Google OAuth redirect through Supabase.
  const [req] = await Promise.all([
    page.waitForRequest(/\/auth\/v1\/authorize\?provider=google/),
    page.getByRole('button', { name: /Connect with Google/ }).click(),
  ])
  expect(req.url()).toContain('redirect_to=')

  // 2. Coming back with a session: the local save is pushed (newest wins) and the admin link appears.
  const save = makeSave(4, { gold: 12 })
  await page.addInitScript(
    ([key, session, s, f]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), FAST],
  )
  await page.goto('/settings')
  await expect(page.getByText('Backed up as admin@example.com')).toBeVisible()
  await expect.poll(() => calls.some((c) => c.startsWith('POST /rest/v1/saves'))).toBe(true)

  // 3. The avatar's drawer: signed in, it offers Admin and no Connect.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Admin' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'CONNECT' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // 4. Disconnecting asks first, and keeps the local save.
  await page.getByRole('main').getByRole('button', { name: 'Disconnect' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByText(/local save is kept/)).toBeVisible()
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: 'Kanto' })).toBeVisible()
})

test('the avatar drawer opens the profile, the guide and the settings', async ({ page }) => {
  await mockSupabase(page)
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
  await page.goto('/map')

  // Signed out: the circle in the header is the initial, not a Google picture.
  const avatar = page.getByRole('button', { name: 'Your trainer menu' })
  await expect(avatar).toHaveText('S')

  // The drawer is titled with the player's name, offers CONNECT, and hides Admin from a non-admin.
  await avatar.click()
  await expect(page.getByRole('dialog', { name: 'Sam' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Admin' })).toHaveCount(0)
  await expect(page.getByRole('dialog').getByRole('button', { name: 'CONNECT' })).toBeVisible()

  // The profile: the player's name and the Kanto badge case, every badge still to win.
  await page.getByRole('button', { name: 'Trainer card' }).click()
  const card = page.getByRole('dialog', { name: 'Trainer card' })
  await expect(card.getByText('Sam')).toBeVisible()
  await expect(card.getByRole('heading', { name: 'Badge case' })).toBeVisible()
  await expect(card.getByRole('img', { name: 'Boulder Badge — not earned yet' })).toBeVisible()
  await expect(card.getByText('Badges 0/8')).toBeVisible()
  await page.keyboard.press('Escape')

  // The guide is the rules, in a modal rather than its own screen.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Settings is a route, so the drawer closes behind it.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
