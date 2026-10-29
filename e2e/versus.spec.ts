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

test('Versus is on Home once three Pokémon reach Lv.50; until then its page says what opens it', async ({ page }) => {
  await mockSupabase(page)
  await signedIn(page, makeSave(4, { player: { name: 'Sam', character: 'red' } }))
  await page.goto('/home')
  // Its square, not the trainer menu: the menu no longer lists it.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: /Versus/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  // Locked, it has no square on Home (the "Coming up" line counts it once its turn comes); its page says what opens it.
  await expect(page.getByRole('button', { name: /Versus/ })).toHaveCount(0)
  await page.goto('/versus')
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

  // PC: the boards beside the opponents (docs/43 §5.8) — attack wins, then defense wins — and your team above them.
  const side = page.getByRole('complementary')
  await expect(side.getByRole('heading', { name: 'Your team' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Leaderboard' })).toHaveCount(0)
  const ranks = side.getByRole('listitem').filter({ has: page.getByLabel(/^Rank/) })
  await expect(ranks.first()).toContainText('Leaf')
  await side.getByRole('tab', { name: 'Defense' }).click()
  await expect(ranks.first()).toContainText('Blue')
  await expect(ranks.nth(1)).toContainText('Sam')

  // A phone: the board is the third tab.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  const phoneRanks = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.getByLabel(/^Rank/) })
  await expect(phoneRanks.first()).toContainText('Leaf')
})

test('one red FIGHT: the opponent your team hits hardest; the others navy', async ({ page }) => {
  await mockSupabase(page)
  const board = [...BOARD, entry('Erika', { team: [mon(1), mon(2), mon(3)] }), entry('Brock', { team: [mon(74), mon(95), mon(76)] })]
  await page.route('**/rest/v1/rpc/versus_board', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(board) }),
  )
  await signedIn(page, readySave())
  await page.goto('/versus')
  const fights = page.getByRole('button', { name: /^Fight / })
  await expect(fights).toHaveCount(3)
  // One red (primary, its deep red at this size), the rest navy (docs/15 §6, as the Areas sheet's GOs).
  await expect(page.locator('button.frame-deep', { hasText: 'FIGHT' })).toHaveCount(1)
  await expect(page.locator('button.frame-dark', { hasText: 'FIGHT' })).toHaveCount(2)
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
    // At each Pokémon's own level, as the server keeps it (0090).
    const team = body.ids.map((id) => ({ vn: mon(3, 55), cz: mon(6, 72), bl: mon(9, 50) })[id] ?? mon(129))
    if (!opts.forgets) mine = entry('Sam', { is_me: true, ids: body.ids, version, team })
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
  // A row of the list (a slot's name starts with its place).
  const row = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })
  // Highest level first: past Lv.50 a Pokémon keeps its own level's dice and rerolls.
  await expect(page.locator('ul > li > button[aria-pressed]').first()).toContainText('Charizard')
  await row('Venusaur').click()
  await row('Charizard').click()
  await row('Blastoise').click()
  // Every region's Box can send a Pokémon (Blastoise waits in Johto's). A row shows its types and its level; a slot,
  // the level it fights at.
  await expect(row('Charizard')).toContainText('Fire')
  await expect(row('Charizard')).toContainText('Lv.72')
  await expect(page.getByRole('button', { name: 'Place 2: Charizard' })).toContainText('Lv.72 → 50')
  // The slots swap: a tap on one then the other…
  await page.getByRole('button', { name: 'Place 1: Venusaur' }).click()
  await expect(page.getByRole('button', { name: 'Place 1: Venusaur' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Place 3: Blastoise' }).click()
  await expect(page.getByRole('button', { name: 'Place 1: Blastoise' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Place 3: Venusaur' })).toBeVisible()
  // …or one dragged onto the other.
  const from = (await page.getByRole('button', { name: 'Place 1: Blastoise' }).boundingBox())!
  const to = (await page.getByRole('button', { name: 'Place 3: Venusaur' }).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Place 1: Venusaur' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Place 3: Blastoise' })).toBeVisible()
  // The type filter and A–Z narrow and reorder the list; the picks stay picked.
  await page.getByRole('combobox', { name: 'Filter by type' }).selectOption('water')
  await expect(page.locator('ul > li > button[aria-pressed]')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Filter by type' }).selectOption('all')
  await page.getByRole('radio', { name: 'A–Z' }).click()
  await expect(page.locator('ul > li > button[aria-pressed]').first()).toContainText('Blastoise')
  await page.getByRole('button', { name: 'SAVE TEAM' }).click()

  await expect(page.getByText('Team saved!')).toBeVisible()
  expect(teams).toEqual([{ ids: ['vn', 'cz', 'bl'] }])
  // The team is built from the cloud save, so it must be there: pushed by the first sync. An unchanged save isn't
  // pushed a second time (only its timestamps would differ).
  expect(calls.filter((c) => c.startsWith('POST /rest/v1/saves')).length).toBeGreaterThan(0)
  // The picks stay, the button says the team is saved, and the team shows at the top.
  await expect(page.getByRole('button', { name: 'TEAM SAVED', exact: true })).toBeDisabled()
  await expect(row('Venusaur')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('No team yet.')).toHaveCount(0)

  // Back later: the saved team is still picked, and the opponents can be fought.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Fight Blue' })).toBeEnabled()
  await page.getByRole('tab', { name: 'My team' }).click()
  await expect(page.getByRole('button', { name: 'TEAM SAVED', exact: true })).toBeDisabled()
  for (const name of ['Venusaur', 'Charizard', 'Blastoise']) await expect(row(name)).toHaveAttribute('aria-pressed', 'true')

  // Changing a pick makes it savable again.
  await row('Blastoise').click()
  await expect(page.getByRole('button', { name: 'SAVE TEAM' })).toBeDisabled()
})

test("Home's widget keeps your Versus team while the board can't be reached", async ({ page }) => {
  await mockSupabase(page)
  // Your row as the server gives it: auth.uid() is the signed-in user's id.
  const board = [{ ...BOARD[0], user_id: '11111111-2222-4333-8444-555555555555' }, ...BOARD.slice(1)]
  let down = false
  await page.route('**/rest/v1/rpc/versus_board', (route) =>
    down
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"down"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(board) }),
  )
  await signedIn(page, readySave())
  await page.goto('/home')
  const mine = page.getByRole('button', { name: 'Versus: 1 attack wins, 4 defense wins. Fight' })
  await expect(mine).toBeVisible()
  down = true
  await page.reload()
  await expect(mine).toBeVisible()
  await expect(page.getByRole('button', { name: 'Versus is open: set your team' })).toHaveCount(0)
})

test("a team the server doesn't show back is not called saved", async ({ page }) => {
  await mockSupabase(page)
  await versusServer(page, { forgets: true })
  await signedIn(page, readySave())
  await page.goto('/versus')
  await page.getByRole('tab', { name: 'My team' }).click()
  for (const name of ['Venusaur', 'Charizard', 'Blastoise'])
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await page.getByRole('button', { name: 'SAVE TEAM' }).click()
  await expect(page.getByText(/the server doesn't show it back/)).toBeVisible()
  await expect(page.getByText('Team saved!')).toHaveCount(0)
})

test('Versus opening: its rules at the top of its page until GOT IT, then behind the INFO button', async ({ page }) => {
  await mockSupabase(page)
  await page.route('**/rest/v1/rpc/versus_board', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOARD) }),
  )
  await signedIn(page, { ...readySave(), versusRulesSeen: false })
  await page.goto('/versus')
  // Rules where they apply (docs/43 §7): a card on the page, not a pop-up.
  const card = page.getByRole('region', { name: 'How Versus works' })
  await expect(card.getByText('Same for everyone')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Opening the page doesn't count as reading them: the flag stays unset until GOT IT.
  const seen = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').versusRulesSeen)
  await page.waitForTimeout(800)
  expect(await seen()).toBeFalsy()
  await card.getByRole('button', { name: 'GOT IT' }).click()
  await expect(card).toHaveCount(0)

  // The same rules from the page's INFO button, without the "now open" tag.
  await page.getByRole('button', { name: 'Info: how Versus works' }).click()
  const info = page.getByRole('dialog', { name: 'Versus' })
  await expect(info.getByText('Auto battles')).toBeVisible()
  await expect(info.getByText('Now open')).toHaveCount(0)
  await info.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(info).toHaveCount(0)

  // Seen, and saved: the card doesn't come back.
  await expect.poll(seen).toBe(true)
  await expect(card).toHaveCount(0)
})
