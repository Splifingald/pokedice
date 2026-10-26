// The leaderboard's five boards, each its icon and its name (docs/43 §5.8): Level, Progression, Pokédex, Shiny and
// Raids — on a 360 px phone too. PC: the boards, your place and the Hall of Fame beside the ranking; a phone pins your
// place at the foot.
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

test('Prof. Oak’s leaderboard tip comes with the first badge, and Later (or ✕) ends it for good', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, withBadge(makeSave(4, { leaderboardVisited: false })))
  await page.goto('/home')
  const tip = page.getByRole('dialog', { name: 'The leaderboard' })
  await expect(tip).toBeVisible()
  // A tip, not a choice to make: it can be closed, and SEE THE LEADERBOARD is still there.
  await expect(tip.getByRole('button', { name: 'Close' })).toBeVisible()
  await expect(tip.getByRole('button', { name: 'SEE THE LEADERBOARD' })).toBeVisible()
  await tip.getByRole('button', { name: 'Later' }).click()
  await expect(tip).toHaveCount(0)
  await expect(page).toHaveURL(/\/home$/)
  // Saved in the save: a reload doesn't bring it back.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).leaderboardVisited)).toBe(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeVisible()
  await expect(tip).toHaveCount(0)
})

test('five boards, each named; the Shiny board ranks shinies caught, the Raids board raids won', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' } })))
  await page.goto('/leaderboard')
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(5)
  // Every board says its name (PC adds what it counts under it), the open one marked.
  await expect(page.getByRole('tab', { name: /^Level/ })).toHaveAttribute('aria-selected', 'true')
  for (const name of ['Level', 'Progression', 'Pokédex', 'Shiny', 'Raids'])
    await expect(page.getByRole('tablist')).toContainText(name)
  await expect(page.getByRole('tab', { name: /^Level/ })).toContainText('Your highest-level Pokémon.')
  // PC: your place beside the ranking.
  await expect(page.getByRole('complementary').getByRole('button', { name: /You're #2 of 3/ })).toBeVisible()

  await page.getByRole('tab', { name: /^Shiny/ }).click()
  await expect(page.getByRole('tab', { name: /^Shiny/ })).toHaveAttribute('aria-selected', 'true')
  const rows = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.locator('[aria-label^="Rank"]') })
  await expect(rows.first()).toContainText('Blue')
  // The count and the star, its words for screen readers.
  await expect(rows.first().getByRole('img', { name: '3 shinies' })).toBeVisible()
  await expect(rows.nth(1)).toContainText('Sam')
  await expect(rows.nth(1).getByRole('img', { name: '1 shiny' })).toBeVisible()

  // Raids: a count from the board (a database before 0035 says 0 for everyone); nobody here has won one, and a trainer
  // with none isn't on the board.
  await page.getByRole('tab', { name: /^Raids/ }).click()
  await expect(page.getByRole('tab', { name: /^Raids/ })).toHaveAttribute('aria-selected', 'true')
  await expect(rows).toHaveCount(0)
  await expect(page.getByText('No trainers yet — be the first!')).toBeVisible()
})

test('a phone: the five boards fit 360 px, named at 16 px, and your place is pinned at the foot', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await mockSupabase(page)
  await signedIn(page, withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' } })))
  await page.goto('/leaderboard')
  await expect(page.getByRole('tab')).toHaveCount(5)
  for (const name of ['Level', 'Progression', 'Pokédex', 'Shiny', 'Raids'])
    await expect(page.getByRole('tab', { name })).toBeVisible()
  // No board's name under 16 px, and nothing scrolls sideways.
  const sizes = await page.getByRole('tab').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el.querySelector('span')!).fontSize)))
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  const strip = await page.getByRole('tablist').boundingBox()
  expect(strip!.x + strip!.width).toBeLessThanOrEqual(360)
  // Your place, pinned over the tab bar: a tap finds your row.
  const place = page.getByRole('button', { name: /You're #2 of 3/ })
  await expect(place).toBeInViewport()
  await place.click()
  await expect(page.locator('li[aria-current="true"]')).toBeInViewport()
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

  await page.getByRole('tab', { name: /^Shiny/ }).click()
  await expect(page.getByRole('tabpanel').getByText('All regions')).toBeVisible()
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Gold')
  await expect(rows.nth(0).getByRole('img', { name: '5 shinies' })).toBeVisible()
  await expect(rows.nth(1)).toContainText('Blue')
  await expect(rows.nth(1).getByRole('img', { name: '3 shinies' })).toBeVisible()
  await expect(rows.nth(2)).toContainText('Sam')

  // Blue has won no raid: he isn't on the Raids board.
  await page.getByRole('tab', { name: /^Raids/ }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Gold')
  await expect(rows.nth(1)).toContainText('Sam')
  await expect(page.getByRole('tabpanel')).not.toContainText('Blue')
  await expect(page.getByText('Raids won, in every region.')).toBeVisible()
})

test('a long board shows its top 100, you with the 10 either side, and your friends, with the real ranks', async ({ page }) => {
  // 250 trainers on the Max level board, best first: Sam is #180, Erika (a friend) #140.
  const rows = Array.from({ length: 250 }, (_, i) => {
    const name = i === 179 ? 'Sam' : i === 139 ? 'Erika' : `T${i + 1}`
    return {
      region: 'kanto',
      is_me: name === 'Sam',
      name,
      character: 'red',
      // All under the level cap (no Hall of Fame); the Pokédex breaks the tie, so every rank is its own.
      team: [{ dex: 25, level: 50 }],
      pokedex: 300 - i,
      max_level: 50,
      progress: {},
      is_friend: name === 'Erika',
      friend_id: name === 'Erika' ? '00000000-0000-0000-0000-0000000000e1' : null,
    }
  })
  await mockSupabase(page, { rpc: { leaderboard: rows } })
  await signedIn(page, withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' } })))
  await page.goto('/leaderboard')
  const ranked = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.locator('[aria-label^="Rank"]') })
  // 100 + Erika + Sam with 10 either side.
  await expect(ranked).toHaveCount(122)
  await expect(page.getByText("You're #180 of 250")).toBeVisible()
  await expect(ranked.nth(100)).toContainText('Erika')
  await expect(ranked.nth(100).getByLabel('Rank 140')).toBeVisible()
  await expect(ranked.nth(101).getByLabel('Rank 170')).toBeVisible()
  await expect(ranked.nth(111)).toContainText('Sam')
  await expect(page.getByText('39 trainers not shown')).toBeVisible()
  await expect(page.getByText('29 trainers not shown')).toBeVisible()
  await expect(page.getByText('60 trainers not shown')).toBeVisible()
})
