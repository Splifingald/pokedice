import { expect, test, type Page } from '@playwright/test'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

const mon = (dex: number, level = 50, shiny = false) => ({ dex, level, shiny })
let ids = 0
const entry = (name: string, patch: Record<string, unknown> = {}) => ({
  user_id: `00000000-0000-4000-8000-00000000000${++ids}`,
  is_me: false,
  name,
  character: 'red',
  team: [mon(129), mon(129), mon(129)],
  levels: { comboLevels: {}, dieLevels: {} },
  version: 1,
  attack_wins: 0,
  defense_wins: 0,
  beaten: false,
  ...patch,
})

/** What the fake `versus_board()` returns: you, a team of Magikarp to beat, and a team already beaten. */
const BOARD = [
  entry('Sam', { is_me: true, team: [mon(6), mon(9), mon(3)], attack_wins: 1, defense_wins: 4 }),
  entry('Blue', { character: 'green', defense_wins: 7 }),
  entry('Leaf', { beaten: true, attack_wins: 3, team: [mon(150), mon(151), mon(149)] }),
]

/** A save with three Pokémon past Lv.50 in the Box (Charizard 72, Blastoise 50, Venusaur 55). */
function readySave() {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const at = (id: string, dex: number, level: number) => ({ id, dex, level, xp: 0, currentHp: 999, caughtAt: 0 })
  return { ...base, box: [...base.box, at('cz', 6, 72), at('bl', 9, 50), at('vn', 3, 55)] }
}

async function signedIn(page: Page, save: object, settings = FAST) {
  await page.addInitScript(
    ([key, session, s, f]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), settings],
  )
}

test('Versus is in the trainer menu, locked until three Pokémon reach Lv.50', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, makeSave(4, { player: { name: 'Sam', character: 'red' } }))
  await page.goto('/map')
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  const row = page.getByRole('dialog').getByRole('button', { name: /Versus/ })
  await expect(row).toContainText('0/3 at Lv.50')
  await row.click()
  await expect(page.getByText('Versus opens when 3 of your Pokémon reach Lv.50.')).toBeVisible()
})

test('fight a team: the result is recorded before the fight plays', async ({ page }) => {
  const calls = await mockSupabase(page)
  const recorded: Record<string, unknown>[] = []
  const teams: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/versus_board', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOARD) }),
  )
  await page.route('**/rest/v1/rpc/versus_record', async (route) => {
    recorded.push(route.request().postDataJSON())
    // Held back a moment: nothing of the fight may show until the result is written.
    await new Promise((r) => setTimeout(r, 600))
    await route.fulfill({ status: 204, body: '' })
  })
  await page.route('**/rest/v1/rpc/versus_set_team', (route) => {
    teams.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '2' })
  })
  await signedIn(page, readySave())
  await page.goto('/versus')

  // Opponents: everyone but you, the team still to beat before the one already beaten.
  const blue = page.getByRole('listitem').filter({ hasText: 'Blue' })
  await expect(blue.getByRole('button', { name: 'Fight Blue' })).toBeEnabled()
  await expect(page.getByRole('listitem').filter({ hasText: 'Leaf' }).getByText('Beaten')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fight Sam' })).toHaveCount(0)

  await blue.getByRole('button', { name: 'Fight Blue' }).click()
  await expect(page.getByText('Getting ready…')).toBeVisible()
  await expect(page.getByText('AUTO-MODE')).toHaveCount(0)
  await expect.poll(() => recorded.length).toBe(1)
  expect(recorded[0]).toMatchObject({ defender: BOARD[1]!.user_id, defender_version: 1, won: true })
  expect(typeof recorded[0]!.seed).toBe('number')

  // Then it plays on auto — no controls to take over — and ends on the result.
  await expect(page.getByText('AUTO-MODE')).toBeVisible()
  await expect(page.getByRole('button', { name: 'STOP' })).toHaveCount(0)
  await expect(page.getByText('VICTORY!')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText("You beat Blue's team!")).toBeVisible()
  await page.getByRole('button', { name: 'BACK TO VERSUS' }).click()
  await expect(page.getByRole('heading', { name: 'Versus' })).toBeVisible()

  // Your team: three picks in fight order, pushed to the cloud save first, then set from it.
  await page.getByRole('tab', { name: 'My team' }).click()
  await page.getByRole('button', { name: /Venusaur/ }).click()
  await page.getByRole('button', { name: /Charizard/ }).click()
  await page.getByRole('button', { name: /Blastoise/ }).click()
  await expect(page.getByRole('button', { name: /Charizard/ })).toContainText('Lv.50 (72)')
  const pushesBefore = calls.filter((c) => c.startsWith('POST /rest/v1/saves')).length
  await page.getByRole('button', { name: 'SAVE TEAM' }).click()
  await expect.poll(() => teams.length).toBe(1)
  expect(teams[0]).toEqual({ ids: ['vn', 'cz', 'bl'] })
  expect(calls.filter((c) => c.startsWith('POST /rest/v1/saves')).length).toBeGreaterThan(pushesBefore)
  await expect(page.getByText('Team saved!')).toBeVisible()

  // The boards: attack wins, then defense wins.
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  const ranks = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.getByLabel(/^Rank/) })
  await expect(ranks.first()).toContainText('Leaf')
  await page.getByRole('tab', { name: 'Defense' }).click()
  await expect(ranks.first()).toContainText('Blue')
  await expect(ranks.nth(1)).toContainText('Sam')
})
