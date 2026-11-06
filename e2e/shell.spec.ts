// The shell's accessibility fixes (docs/38 §7): each page names itself in the tab's title and takes the focus on its
// <h1> after a move; a dialog puts the page behind it to sleep (inert) while the toasts stay readable; an error toast
// stays until its ✕; and the social screens say "You're offline" when there's no connection.
import { expect, test, type Page } from '@playwright/test'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY, withBadge } from './helpers'

async function boot(page: Page, settings = FAST, signedIn = false) {
  await page.addInitScript(
    ([s, f, key, session]) => {
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      if (session) localStorage.setItem(key!, session)
    },
    [
      JSON.stringify(withBadge(makeSave(4))),
      settings,
      STORAGE_KEY,
      signedIn ? JSON.stringify(fakeSession()) : '',
    ],
  )
}

const inert = (page: Page, selector: string) =>
  page.evaluate((sel) => (document.querySelector(sel) as HTMLElement | null)?.inert ?? null, selector)

test('each page names itself in the tab, and a move puts the focus on its title', async ({ page }) => {
  await mockSupabase(page)
  await boot(page)
  await page.goto('/home')
  await expect(page).toHaveTitle('Home · Pokédice')
  // The first load leaves the focus where the browser put it.
  await expect(page.locator('h1')).not.toBeFocused()

  await page.getByRole('navigation', { name: 'Menus' }).getByRole('link', { name: /^Team/ }).click()
  await expect(page).toHaveTitle('Team · Pokédice')
  await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeFocused()

  await page
    .getByRole('navigation', { name: 'Menus' })
    .getByRole('link', { name: /^Pokédex/ })
    .click()
  await expect(page).toHaveTitle('Pokédex · Pokédice')
  await expect(page.locator('h1')).toBeFocused()
})

test('in French, the tab says so too', async ({ page }) => {
  await mockSupabase(page)
  await boot(page, JSON.stringify({ ...JSON.parse(FAST), lang: 'fr' }))
  await page.goto('/team')
  await expect(page).toHaveTitle('Équipe · Pokédice')
})

test('a dialog puts the page behind it to sleep; the toasts stay readable; closing wakes it', async ({
  page,
}) => {
  await mockSupabase(page)
  await boot(page)
  await page.goto('/team')
  await page.getByRole('heading', { level: 1, name: 'Team' }).waitFor()
  expect(await inert(page, '#root')).toBe(false)

  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Trainer card' })
  await expect(menu).toBeVisible()
  expect(await inert(page, '#root')).toBe(true)
  // The toasts sit beside the dialogs on <body>, awake.
  expect(await inert(page, '[data-stay-live]')).toBe(false)
  await expect(menu.getByRole('button', { name: 'Contact the developer' })).toBeEnabled()

  // From one dialog to the next: the page stays asleep, the new dialog takes the keyboard.
  await menu.getByRole('button', { name: 'Contact the developer' }).click()
  const form = page.getByRole('dialog', { name: 'Contact the developer' })
  await expect(form).toBeVisible()
  expect(await inert(page, '#root')).toBe(true)
  await form.getByLabel('Title').fill('Hello')
  await expect(form.getByLabel('Title')).toHaveValue('Hello')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await inert(page, '#root')).toBe(false)
})

test('an error toast stays until its ✕; the others go by themselves', async ({ page }) => {
  await mockSupabase(page)
  await boot(page)
  await page.goto('/kitchen-sink')
  await page.getByRole('button', { name: 'Toast bad' }).click()
  const toasts = page.getByRole('region', { name: 'Notifications' })
  const error = toasts.getByText('Not enough gold')
  await expect(error).toBeVisible()
  await page.getByRole('button', { name: 'Toast info' }).click()
  await expect(toasts.getByText('Content updated')).toBeVisible()
  await page.waitForTimeout(5000)
  await expect(toasts.getByText('Content updated')).toHaveCount(0)
  await expect(error).toBeVisible()
  const close = toasts.getByRole('button', { name: 'Close' })
  const box = await close.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await close.click()
  await expect(error).toHaveCount(0)
})

test('offline, the leaderboard says so rather than "try again later"', async ({ page }) => {
  await mockSupabase(page)
  await boot(page, FAST, true)
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }))
  await page.route('**/rest/v1/rpc/leaderboard', (route) => route.abort('internetdisconnected'))
  await page.goto('/leaderboard')
  await expect(page.getByText("You're offline. Check your connection.")).toBeVisible()
  await expect(page.getByText("Couldn't load the leaderboard. Try again later.")).toHaveCount(0)
})

test('a new player’s theme follows the device; a player from before keeps Light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await mockSupabase(page)
  // A first visit: nothing stored at all.
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // Settings stored before, without a theme: Light, whatever the device says.
  await boot(page)
  await page.goto('/home')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
})
