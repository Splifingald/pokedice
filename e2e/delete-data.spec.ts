// Settings → Delete all my data: the red button at the foot of the page, two pop-ups in a row, then the title screen
// with nothing left but the settings. Signed in, the online data goes first (delete_my_data, migration 0038); if it
// can't, nothing is deleted.
import { expect, test, type Page } from '@playwright/test'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

/** The save, a backup, a tip already seen and the settings; and the session when `session`. Only on the first load. */
async function seed(page: Page, session: boolean) {
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  await page.addInitScript(
    ([s, f, auth, key]) => {
      if (sessionStorage.getItem('e2e.seeded')) return
      sessionStorage.setItem('e2e.seeded', '1')
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.save.backups', JSON.stringify([{ at: 1, reason: 'Earlier', save: JSON.parse(s!) }]))
      localStorage.setItem('pokedice.tip.catch', '1')
      localStorage.setItem('pokedice.settings', f!)
      if (auth) localStorage.setItem(key!, auth)
    },
    [JSON.stringify(save), FAST, session ? JSON.stringify(fakeSession()) : '', STORAGE_KEY],
  )
}

const gameKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pokedice.')).sort())

/** The red button, then the first pop-up's Continue: the second pop-up is open. */
async function toLastStep(page: Page) {
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  const first = page.getByRole('dialog', { name: 'Delete all your data?' })
  await first.getByRole('button', { name: 'Continue' }).click()
  await expect(first).toHaveCount(0)
  return page.getByRole('dialog', { name: 'Really delete everything?' })
}

test('signed out: two pop-ups, then everything on this device is gone but the settings', async ({ page }) => {
  await mockSupabase(page)
  await seed(page, false)
  await page.goto('/settings')

  // The last thing on the page.
  const button = page.getByRole('button', { name: 'Delete all my data' })
  const last = page.getByRole('main').getByRole('button').last()
  await expect(last).toHaveText(/Delete all my data/i)

  // Cancel at either step deletes nothing.
  await button.click()
  const first = page.getByRole('dialog', { name: 'Delete all your data?' })
  await expect(first).toContainText('A cloud save stays too')
  await first.getByRole('button', { name: 'Cancel' }).click()
  await expect(first).toHaveCount(0)
  const sure = await toLastStep(page)
  await expect(sure).toContainText("can't be undone")
  await sure.getByRole('button', { name: 'Cancel' }).click()
  await expect(sure).toHaveCount(0)
  expect(await gameKeys(page)).toContain('pokedice.save')

  await (await toLastStep(page)).getByRole('button', { name: 'Delete everything' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'NEW GAME' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0)
  const keys = await gameKeys(page)
  for (const gone of ['pokedice.save', 'pokedice.save.backups', 'pokedice.tip.catch']) expect(keys).not.toContain(gone)
  expect(keys).toContain('pokedice.settings')
})

test('signed in: the online data is deleted first, then this device', async ({ page }) => {
  const calls = await mockSupabase(page, { rpc: { delete_my_data: null } })
  await seed(page, true)
  await page.goto('/settings')
  await expect(page.getByText('Backed up with Google (admin@example.com).')).toBeVisible()

  await page.getByRole('button', { name: 'Delete all my data' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete all your data?' })).toContainText('your cloud save, trainer card')
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('dialog', { name: 'Really delete everything?' }).getByRole('button', { name: 'Delete everything' }).click()

  await expect(page).toHaveURL(/\/$/)
  expect(calls).toContain('POST /rest/v1/rpc/delete_my_data')
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0)
  expect(await gameKeys(page)).not.toContain('pokedice.save')
  // Still signed in: the account stays.
  expect(await page.evaluate((k) => !!localStorage.getItem(k), STORAGE_KEY)).toBe(true)
})

test("signed in: when the online data can't be deleted, nothing is", async ({ page }) => {
  await mockSupabase(page)
  // The database without migration 0038.
  await page.route(`${SUPABASE}/rest/v1/rpc/delete_my_data`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.delete_my_data' }),
    }),
  )
  await seed(page, true)
  await page.goto('/settings')
  await expect(page.getByText('Backed up with Google (admin@example.com).')).toBeVisible()

  await (await toLastStep(page)).getByRole('button', { name: 'Delete everything' }).click()
  await expect(page.getByText("Your online data couldn't be deleted, so nothing was.")).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/settings$/)
  expect(await gameKeys(page)).toEqual(expect.arrayContaining(['pokedice.save', 'pokedice.save.backups', 'pokedice.tip.catch']))
})
