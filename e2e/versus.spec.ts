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

/** Three Pokémon past Lv.50: Charizard 72 and Venusaur 55 in Kanto's Box, Blastoise 50 left in Johto's. */
function readySave() {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const at = (id: string, dex: number, level: number) => ({ id, dex, level, xp: 0, currentHp: 999, caughtAt: 0 })
  const johto = { gold: 0, pokedex: [9], box: [at('bl', 9, 50)], team: ['bl'], inventory: {}, comboLevels: base.comboLevels, dieLevels: base.dieLevels, currentAreaId: '', areaProgress: {} }
  return { ...base, box: [...base.box, at('cz', 6, 72), at('vn', 3, 55)], parked: { johto } }
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

test('Versus is on Home, locked until three Pokémon reach Lv.50', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, makeSave(4, { player: { name: 'Sam', character: 'red' } }))
  await page.goto('/home')
  // Its widget, not the trainer menu: the menu no longer lists it.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: /Versus/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  const widget = page.getByRole('button', { name: /0\/3 at Lv\.50/ })
  await expect(widget).toContainText('0/3 at Lv.50')
  await widget.click()
  await expect(page.getByText('Versus opens when 3 of your Pokémon reach Lv.50.')).toBeVisible()
})

test('fight a team: the result is recorded before the fight plays', async ({ page }) => {
  await mockSupabase(page)
  const recorded: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/versus_board', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOARD) }),
  )
  await page.route('**/rest/v1/rpc/versus_record', async (route) => {
    recorded.push(route.request().postDataJSON())
    // Held back a moment: nothing of the fight may show until the result is written.
    await new Promise((r) => setTimeout(r, 600))
    await route.fulfill({ status: 204, body: '' })
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
  // It plays to its end: no SKIP, and once it's done there's no rematch.
  await expect(page.getByRole('button', { name: 'Skip ▸▸' })).toHaveCount(0)
  await expect(page.getByText('VICTORY!')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText("You beat Blue's team!")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rematch' })).toHaveCount(0)
  await page.getByRole('button', { name: 'BACK TO VERSUS' }).click()
  await expect(page.getByRole('heading', { name: 'Versus' })).toBeVisible()

  // The boards: attack wins, then defense wins.
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  const ranks = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.getByLabel(/^Rank/) })
  await expect(ranks.first()).toContainText('Leaf')
  await page.getByRole('tab', { name: 'Defense' }).click()
  await expect(ranks.first()).toContainText('Blue')
  await expect(ranks.nth(1)).toContainText('Sam')
})

/** A fake Versus server that keeps what it is sent: the board shows the team you set, as the real one does. */
async function versusServer(page: Page, opts: { forgets?: boolean } = {}) {
  const teams: { ids: string[] }[] = []
  let mine: ReturnType<typeof entry> | null = null
  await page.route('**/rest/v1/rpc/versus_board', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...(mine ? [mine] : []), BOARD[1]]) }),
  )
  await page.route('**/rest/v1/rpc/versus_set_team', (route) => {
    const body = route.request().postDataJSON() as { ids: string[] }
    teams.push(body)
    const version = (mine?.version ?? 0) + 1
    if (!opts.forgets) mine = entry('Sam', { is_me: true, ids: body.ids, version, team: [mon(3), mon(6), mon(9)] })
    return route.fulfill({ status: 200, contentType: 'application/json', body: String(version) })
  })
  return teams
}

test('set your team: three picks in fight order, saved from the cloud save, and still picked after a reload', async ({ page }) => {
  const calls = await mockSupabase(page)
  const teams = await versusServer(page)
  await signedIn(page, readySave())
  await page.goto('/versus')

  // No team yet: the opponents list asks for one.
  await expect(page.getByText('Set your team first')).toBeVisible()
  await page.getByRole('tab', { name: 'My team' }).click()
  await expect(page.getByText('No team yet.')).toBeVisible()
  await page.getByRole('button', { name: /Venusaur/ }).click()
  await page.getByRole('button', { name: /Charizard/ }).click()
  await page.getByRole('button', { name: /Blastoise/ }).click()
  // Every region's Box can send a Pokémon: each says where it comes from.
  await expect(page.getByRole('button', { name: /Charizard/ })).toContainText('Lv.50 (72) · Kanto')
  await expect(page.getByRole('button', { name: /Blastoise/ })).toContainText('Johto')
  await page.getByRole('button', { name: 'SAVE TEAM' }).click()

  await expect(page.getByText('Team saved!')).toBeVisible()
  expect(teams).toEqual([{ ids: ['vn', 'cz', 'bl'] }])
  // The team is built from the cloud save, so it must be there: pushed by the first sync. An unchanged save isn't
  // pushed a second time (only its timestamps would differ).
  expect(calls.filter((c) => c.startsWith('POST /rest/v1/saves')).length).toBeGreaterThan(0)
  // The picks stay, the button says the team is saved, and the team shows at the top.
  await expect(page.getByRole('button', { name: 'TEAM SAVED', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Venusaur/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('No team yet.')).toHaveCount(0)

  // Back later: the saved team is still picked, and the opponents can be fought.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Fight Blue' })).toBeEnabled()
  await page.getByRole('tab', { name: 'My team' }).click()
  await expect(page.getByRole('button', { name: 'TEAM SAVED', exact: true })).toBeDisabled()
  for (const name of ['Venusaur', 'Charizard', 'Blastoise'])
    await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveAttribute('aria-pressed', 'true')

  // Changing a pick makes it savable again.
  await page.getByRole('button', { name: /Blastoise/ }).click()
  await expect(page.getByRole('button', { name: 'SAVE TEAM' })).toBeDisabled()
})

test("a team the server doesn't show back is not called saved", async ({ page }) => {
  await mockSupabase(page)
  await versusServer(page, { forgets: true })
  await signedIn(page, readySave())
  await page.goto('/versus')
  await page.getByRole('tab', { name: 'My team' }).click()
  for (const name of ['Venusaur', 'Charizard', 'Blastoise']) await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'SAVE TEAM' }).click()
  await expect(page.getByText(/the server doesn't show it back/)).toBeVisible()
  await expect(page.getByText('Team saved!')).toHaveCount(0)
})
