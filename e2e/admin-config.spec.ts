// Admin → Config made simpler (the user's ask, 2026-10-28): sub-tabs at the top, the Switches tab first with one table
// of every Config feature's Off / On for admin / On for everyone, two columns on a wide screen; a feature's name opens
// its numbers. The admin is signed in; the content comes from a mocked Supabase serving the game's own data.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { bundleToRows } from '../src/config/mapping'
import type { BundleRaw } from '../src/engine'
import { fakeSession, makeSave, mockSupabase, STORAGE_KEY, SUPABASE, type SupabaseMock } from './helpers'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
const FILES = [
  'pokemon',
  'type-chart',
  'dice-types',
  'areas',
  'trainers',
  'upgrades',
  'items',
  'config',
  'regions',
  'egg-groups',
]
const KEYS = [
  'pokemon',
  'typeChart',
  'diceTypes',
  'areas',
  'trainers',
  'upgrades',
  'items',
  'config',
  'regions',
  'eggGroups',
]
const bundle = Object.fromEntries(FILES.map((f, i) => [KEYS[i], load(`${f}.json`)])) as unknown as BundleRaw
const rows = bundleToRows(bundle) as unknown as Record<string, unknown[]>

async function admin(page: Page, mock: SupabaseMock = {}) {
  const calls = await mockSupabase(page, mock)
  await page.route(`${SUPABASE}/rest/v1/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const table = url.pathname.split('/').pop()!
    if (req.method() !== 'GET' || !(table in rows)) return route.fallback()
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows[table]!.slice(offset, offset + limit)),
    })
  })
  await page.addInitScript(
    ([key, session, save]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', save!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4))],
  )
  return calls
}

test('Config: the tabs, the switches in two columns, a name opens its numbers', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await admin(page)
  await page.goto('/admin/config')
  const tabs = page.getByRole('navigation', { name: 'Config' })
  await expect(tabs).toBeVisible({ timeout: 30_000 })
  for (const name of ['Switches', 'Game', 'Day Care', 'Trades', 'Battle powers', 'All rows'])
    await expect(tabs.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(tabs.getByRole('button', { name: 'Switches', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // One row per feature (25 with the Versus global board, the hidden talents, the legendary intros and real-player
  // battles): its name and its switch, nothing else; energy and the retired switches are gone.
  await expect(page.getByRole('radiogroup', { name: /: who has it$/ })).toHaveCount(25)
  await expect(page.getByRole('radiogroup', { name: 'Hidden talents: who has it' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Legendary intros: who has it' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Real-player battles: who has it' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Versus global board: who has it' })).toBeVisible()
  for (const gone of [
    'Energy',
    'Dice throws',
    'Game feel',
    'Haptics',
    'Battle music',
    'Shiny Pokédex',
    'Raid overhaul',
  ])
    await expect(page.getByRole('radiogroup', { name: `${gone}: who has it` })).toHaveCount(0)
  // Two tables side by side.
  const tables = page.locator('table:has([role="radiogroup"])')
  await expect(tables).toHaveCount(2)
  const [left, right] = [await tables.nth(0).boundingBox(), await tables.nth(1).boundingBox()]
  expect(right!.x).toBeGreaterThan(left!.x + left!.width - 1)
  expect(Math.abs(right!.y - left!.y)).toBeLessThan(2)
  await page.screenshot({ path: 'test-results/admin-config-switches.png', fullPage: true })

  const trades = page.getByRole('radiogroup', { name: 'Trades: who has it' })
  await trades.getByRole('radio', { name: 'On for admin' }).click()
  await expect(trades.getByRole('radio', { name: 'On for admin' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/^Unsaved: game_config/)).toBeVisible()

  // The name opens its tab: its numbers, no switch there.
  await page.getByRole('button', { name: 'Trades', exact: true }).last().click()
  await expect(page).toHaveURL(/tab=trades/)
  await expect(page.getByText('Open listings at most')).toBeVisible()
  await expect(page.getByRole('radiogroup')).toHaveCount(0)

  await tabs.getByRole('button', { name: 'Game', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pacing & rewards' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'XP curve' })).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-config-game.png', fullPage: true })
})

/** A member of a league group as versus_league_admin_board (0086) answers. */
const member = (
  name: string,
  trophies: number,
  rank: number,
  o: { bot?: number; matches?: [number, number, number, number]; target?: number; faced?: number } = {},
) => ({
  userId: o.bot ? null : `00000000-0000-4000-8000-${String(rank).padStart(12, '0')}`,
  botId: o.bot ?? null,
  name,
  avatar: 'red',
  team: [
    { dex: 94, level: 50, shiny: false },
    { dex: 6, level: 50, shiny: false },
    { dex: 445, level: 50, shiny: false },
  ],
  trophies,
  rank,
  botTarget: o.target ?? null,
  joinedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  matches: o.matches ? o.matches.reduce((a, b) => a + b, 0) : 0,
  won: o.matches?.[0] ?? 0,
  lost: o.matches?.[1] ?? 0,
  leaves: o.matches?.[2] ?? 0,
  open: o.matches?.[3] ?? 0,
  lastMatchAt: o.matches ? new Date(Date.now() - 3 * 3_600_000).toISOString() : null,
  faced: o.faced ?? 0,
})
const BOARD = {
  week: '2026-10-26',
  endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  opened: 1,
  closed: false,
  groups: [
    {
      n: 1,
      members: [
        member('Gengar50', 13, 1, { bot: 3, target: 160, faced: 4 }),
        member('Tom', 11, 2, { bot: 8, target: 120, faced: 2 }),
        member('Splifou', 9, 3, { matches: [3, 1, 0, 1], faced: 1 }),
        member('Eevee51', 7, 4, { bot: 12, target: 90 }),
        member('Ella09', 0, 5, {}),
      ],
    },
    { n: 2, members: [member('MISTY', 24, 1, { matches: [4, 0, 0, 0] })] },
  ],
}

test("Versus league: the week's groups, fetched when the admin asks", async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const asked: boolean[] = []
  const calls = await admin(page, {
    rpc: {
      versus_league_admin_board: (body: { p_last?: boolean }) => {
        asked.push(!!body.p_last)
        return body.p_last ? { ...BOARD, week: '2026-10-19', opened: null, closed: true, groups: [] } : BOARD
      },
    },
  })
  await page.goto('/admin/config?tab=versus')
  const box = page.locator('section', { has: page.getByRole('heading', { name: "The week's groups" }) })
  await expect(box).toBeVisible({ timeout: 30_000 })
  // Nothing fetched until the button is pressed.
  await expect(box.getByText('Not fetched yet.')).toBeVisible()
  expect(calls.some((c) => c.includes('versus_league_admin_board'))).toBe(false)

  await box.getByRole('button', { name: 'Fetch the groups' }).click()
  for (const chip of ['2 groups (opened with 1)', '6 in them', '3 players', '3 bots', '2 fought this week'])
    await expect(box.getByText(chip, { exact: true })).toBeVisible()
  await expect(box.getByText('9 matches, 1 being fought')).toBeVisible()
  await expect(box.getByRole('heading', { name: /^Group 1/ })).toContainText(
    '5/20 · 2 players · 3 bots · 5 matches',
  )
  await expect(box.getByRole('heading', { name: /^Group 2/ })).toBeVisible()
  const gengar = box.getByRole('listitem').filter({ hasText: 'Gengar50' })
  await expect(gengar).toContainText('BOT')
  await expect(gengar).toContainText('headed to 160 by Sunday night · fought 4×')
  const me = box.getByRole('listitem').filter({ hasText: 'Splifou' })
  await expect(me).toContainText('PLAYER')
  await expect(me).toContainText('5 matches: 3 won · 1 lost · 0 left · 1 being fought · last 3 h ago')
  await expect(box.getByRole('listitem').filter({ hasText: 'Ella09' })).toContainText(
    'no match this week yet',
  )
  expect(asked).toEqual([false])
  await box.screenshot({ path: 'test-results/admin-versus-groups.png' })

  await box.getByRole('button', { name: 'Last week' }).click()
  await expect(box.getByText('No group that week', { exact: false })).toBeVisible()
  await expect(box.getByText(/Last week, from Monday 2026-10-19 · rewards sent/)).toBeVisible()
  expect(asked).toEqual([false, true])
})

test("Versus league: this week's bot teams, seen and made from the admin's page", async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  let stored: { p_week: string; p_teams: { tier: number }[] } | null = null
  // Before: the week takes last week's set. After the button: its own (0092 versus_league_bot_set).
  const botSet = () =>
    stored
      ? {
          week: '2026-10-26',
          set: '2026-10-26',
          madeAt: new Date().toISOString(),
          tiers: [40, 40, 40, 80],
          due: false,
        }
      : {
          week: '2026-10-26',
          set: '2026-10-19',
          madeAt: '2026-10-19T00:13:00Z',
          tiers: [40, 40, 40, 80],
          due: true,
        }
  await admin(page, {
    rpc: {
      versus_league_bot_set: () => botSet(),
      versus_league_put_bot_teams: (body: Record<string, unknown>) => {
        stored = body as typeof stored
        return stored!.p_teams.length
      },
    },
  })
  await page.goto('/admin/config?tab=versus')
  const box = page.locator('section', {
    has: page.getByRole('heading', { name: 'Versus league', exact: true }),
  })
  await expect(box).toBeVisible({ timeout: 30_000 })

  await box.getByRole('button', { name: "This week's bot teams", exact: true }).click()
  await expect(
    box.getByText(
      "This week's bot teams aren't made yet: its bots take the teams made for the week of 2026-10-19 (40 / 40 / 40 / 80 a tier). The hourly job makes them on the live site, or press Make.",
    ),
  ).toBeVisible()

  await box.getByRole('button', { name: "Make this week's bot teams now" }).click()
  await expect(
    box.getByText(/^200 teams made for the week of 2026-10-26\. This week's own bot teams/),
  ).toBeVisible({
    timeout: 30_000,
  })
  expect(stored!.p_week).toBe('2026-10-26')
  expect([0, 1, 2, 3].map((t) => stored!.p_teams.filter((x) => x.tier === t).length)).toEqual([
    40, 40, 40, 80,
  ])
  await box.screenshot({ path: 'test-results/admin-versus-bot-teams.png' })

  // Made already: pressed again, it says so and stores nothing.
  stored = { ...stored!, p_teams: [] }
  await box.getByRole('button', { name: "Make this week's bot teams now" }).click()
  await expect(
    box.getByText(/^Made already\. This week's own bot teams \(40 \/ 40 \/ 40 \/ 80 a tier\)/),
  ).toBeVisible()
})
