// The leaderboard tabs: an icon each, and only the open one spells out its name. Five: Max level, Progression,
// Pokédex, Shiny and Raids.
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

test('five tabs, named only when open; the Shiny board ranks shinies caught, the Raids board raids won', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' } })))
  await page.goto('/leaderboard')
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(5)
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

  // Raids: a count from the board (a database before 0035 says 0 for everyone).
  await page.getByRole('tab', { name: 'Raids' }).click()
  await expect(page.getByRole('tab', { name: 'Raids' })).toHaveAttribute('aria-selected', 'true')
  await expect(rows.first()).toContainText('raids won')
})

test('Shiny and Raids rank every region together, each trainer once; Max level stays the region’s', async ({ page }) => {
  const mon = { dex: 25, level: 30, shiny: false }
  const at = (region: string, name: string, lead: boolean, p: object) => ({
    region,
    is_me: name === 'Sam',
    name,
    character: 'red',
    team: [mon],
    pokedex: 10,
    max_level: 30,
    progress: {},
    lead,
    ...p,
  })
  await mockSupabase(page, {
    rpc: {
      leaderboard: [
        at('kanto', 'Sam', true, { shinies: 1, shinies_all: 1, raids_won: 2 }),
        // Gold plays Johto only: on no Kanto board, but on the cross-region ones.
        at('johto', 'Gold', true, { shinies: 5, shinies_all: 5, raids_won: 7 }),
        // Blue has played both: one row each, Johto the one standing for him.
        at('kanto', 'Blue', false, { shinies: 1, shinies_all: 3, raids_won: 0 }),
        at('johto', 'Blue', true, { shinies: 2, shinies_all: 3, raids_won: 0 }),
      ],
    },
  })
  await signedIn(page, withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' } })))
  await page.goto('/leaderboard')
  const rows = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.locator('[aria-label^="Rank"]') })
  await expect(rows).toHaveCount(2)
  await expect(page.getByRole('tabpanel')).not.toContainText('Gold')

  await page.getByRole('tab', { name: 'Shiny' }).click()
  await expect(page.getByText('All regions')).toBeVisible()
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Gold')
  await expect(rows.nth(0)).toContainText('5 shinies')
  await expect(rows.nth(1)).toContainText('Blue')
  await expect(rows.nth(1)).toContainText('3 shinies')
  await expect(rows.nth(2)).toContainText('Sam')

  await page.getByRole('tab', { name: 'Raids' }).click()
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Gold')
  await expect(page.getByText('Raids won, in every region.')).toBeVisible()
})
