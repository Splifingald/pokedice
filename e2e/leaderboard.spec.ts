// The leaderboard tabs: an icon each, and only the open one spells out its name.
import { expect, test, type Page } from '@playwright/test'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY, withBadge } from './helpers'

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

test('four tabs, named only when open; the Shiny board ranks shinies caught', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' } })))
  await page.goto('/leaderboard')
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(4)
  // Max level is open: its name shows, the others are icons with a label for screen readers.
  await expect(page.getByRole('tab', { name: 'Max level' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tablist')).toContainText('Max level')
  await expect(page.getByRole('tablist')).not.toContainText('Shiny')

  await page.getByRole('tab', { name: 'Shiny' }).click()
  await expect(page.getByRole('tab', { name: 'Shiny' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tablist')).toContainText('Shiny')
  await expect(page.getByRole('tablist')).not.toContainText('Max level')
  const rows = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.locator('[aria-label^="Rank"]') })
  await expect(rows.first()).toContainText('Blue')
  await expect(rows.first()).toContainText('3 shinies')
  await expect(rows.nth(1)).toContainText('Sam')
  await expect(rows.nth(1)).toContainText('1 shiny')
})
