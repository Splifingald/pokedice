// Friends (docs/16) and Discord sign-in (docs/17), against the mocked Supabase: the Friends page and a friend's card,
// adding by friend ID, invite links signed in and out, friends on the leaderboard, and the CONNECT chooser.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { badgeCase, type SaveData } from '../src/engine'
import { FAST, fakeSession, gameData, LEADERBOARD, makeSave, mockSupabase, STORAGE_KEY, SUPABASE, withBadge, type SupabaseMock } from './helpers'

const data = gameData()
const MISTY = '22222222-0000-4000-8000-000000000002'
const BROCK = '22222222-0000-4000-8000-000000000003'
const ERIKA = '22222222-0000-4000-8000-000000000004'
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const FRIENDS = [
  {
    user_id: MISTY, name: 'Misty', avatar: 'green', region: 'kanto', area_id: null, max_level: 24,
    team: [{ dex: 120, level: 21 }, { dex: 121, level: 24 }], since: '2026-10-03T10:00:00Z', updated_at: hoursAgo(2), is_new: true,
  },
  {
    user_id: BROCK, name: 'Brock', avatar: 'kanto/hiker', region: 'kanto', area_id: null, max_level: 14,
    team: [{ dex: 74, level: 12 }, { dex: 95, level: 14 }], since: '2026-10-01T10:00:00Z', updated_at: hoursAgo(24 * 9), is_new: false,
  },
]

function profile(save: SaveData) {
  const won = badgeCase(save, data).slice(0, 2).map((b) => b.trainerId)
  return [
    {
      user_id: MISTY, name: 'Misty', avatar: 'green', region: 'kanto', area_id: save.currentAreaId, updated_at: hoursAgo(2),
      since: '2026-10-03T10:00:00Z',
      regions: [{ region: 'kanto', team: FRIENDS[0]!.team, pokedex: 40, maxLevel: 24, shinies: 1, progress: {}, badges: won, endgame: false }],
      versus: { team: [{ dex: 121, level: 50 }, { dex: 131, level: 50 }, { dex: 134, level: 50 }], attackWins: 3, defenseWins: 2 },
    },
  ]
}

const LOOKUP = [{ name: 'Erika', avatar: 'kanto/lass', region: 'kanto', max_level: 30 }]
const ADDED = [{ status: 'added', user_id: ERIKA, name: 'Erika', avatar: 'kanto/lass' }]

async function boot(page: Page, save: SaveData, opts: { session?: boolean; mock?: SupabaseMock } = {}) {
  const calls = await mockSupabase(page, opts.mock)
  await page.addInitScript(
    ([key, session, s, f]) => {
      if (session) localStorage.setItem(key!, session)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, opts.session === false ? '' : JSON.stringify(fakeSession()), JSON.stringify(save), FAST],
  )
  return calls
}

const friendsMock = (save: SaveData, extra: SupabaseMock['rpc'] = {}): SupabaseMock => ({
  rpc: {
    friend_code: 'K7QM4XD9',
    friend_list: FRIENDS,
    friend_status: [{ ids: [MISTY, BROCK], unseen: [{ id: MISTY, name: 'Misty', avatar: 'green' }] }],
    friend_seen: null,
    friend_profile: profile(save),
    friend_lookup: LOOKUP,
    friend_add: ADDED,
    friend_remove: null,
    ...extra,
  },
})

async function seriousAxe(page: Page, include?: string) {
  let axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa'])
  if (include) axe = axe.include(include)
  const r = await axe.analyze()
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)
}

test('the Friends page: a new friend is announced, your ID, your friends, a friend’s card, removing', async ({ page }) => {
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  await boot(page, save, { mock: friendsMock(save) })
  await page.goto('/home')
  await expect(page.getByText('Misty is now your friend!')).toBeVisible()

  // The avatar carries the news; the menu's Friends row too.
  await page.getByRole('button', { name: /new friends: 1/ }).click()
  await page.getByRole('button', { name: 'Friends (1)' }).click()
  await expect(page).toHaveURL(/\/friends$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Friends' })).toBeVisible()
  await expect(page.getByTestId('friend-code')).toHaveText('K7QM-4XD9')

  const misty = page.getByRole('button', { name: /^Misty,/ })
  await expect(misty).toContainText('NEW')
  await expect(page.getByRole('button', { name: /^Brock,/ })).toContainText('9 d ago')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(await seriousAxe(page, 'main')).toEqual([])

  await misty.click()
  const card = page.getByRole('dialog', { name: 'Misty' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Friends since')
  await expect(card).toContainText('Badge case')
  await expect(card).toContainText('Versus team')
  await expect(card).toContainText('3 won · 2 held')
  expect(await seriousAxe(page, '[role="dialog"]')).toEqual([])

  await card.getByRole('button', { name: 'Remove friend' }).click()
  await page.getByRole('dialog', { name: 'Remove Misty?' }).getByRole('button', { name: 'Remove friend' }).click()
  await expect(page.getByText('Misty is no longer your friend.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Misty,/ })).toHaveCount(0)
})

test('add by friend ID: typed any way, previewed, friends at once', async ({ page }) => {
  const save = makeSave(4)
  const calls = await boot(page, save, { mock: friendsMock(save) })
  await page.goto('/friends')
  await page.getByRole('button', { name: 'Add by friend ID' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a friend' })
  await dialog.getByLabel('Friend ID').fill('k7qm 4xd9')
  await expect(dialog.getByLabel('Friend ID')).toHaveValue('K7QM-4XD9')
  await expect(dialog).toContainText('Erika')
  await dialog.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('You and Erika are now friends!')).toBeVisible()
  expect(calls.some((c) => c.startsWith('POST /rest/v1/rpc/friend_add'))).toBe(true)
})

test('add by friend ID: says why it can not', async ({ page }) => {
  const save = makeSave(4)
  await boot(page, save, { mock: friendsMock(save, { friend_lookup: [], friend_add: [{ status: 'not_found' }] }) })
  await page.goto('/friends')
  await page.getByRole('button', { name: 'Add by friend ID' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a friend' })
  await dialog.getByLabel('Friend ID').fill('ZZZZZZZZ')
  await expect(dialog.getByRole('alert')).toHaveText('No trainer has this friend ID.')
  await expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()
})

test('an invite link, signed in: friends at once', async ({ page }) => {
  const save = makeSave(4)
  await boot(page, save, { mock: friendsMock(save) })
  await page.goto('/f/k7qm-4xd9')
  const pop = page.getByRole('dialog', { name: 'New friend!' })
  await expect(pop).toBeVisible()
  await expect(pop).toContainText('You and Erika are now friends!')
  await pop.getByRole('button', { name: 'OK' }).click()
  await expect(page).toHaveURL(/\/friends$/)
})

test('an invite link, signed out: connect first', async ({ page }) => {
  const save = makeSave(4)
  await boot(page, save, { session: false, mock: { rpc: { friend_lookup: LOOKUP } } })
  await page.goto('/f/K7QM4XD9')
  const pop = page.getByRole('dialog', { name: 'Friend invite' })
  await expect(pop).toBeVisible()
  await expect(pop).toContainText('Erika invited you to be friends. Connect to accept.')
  await pop.getByRole('button', { name: 'Not now' }).click()
  await expect(pop).toBeHidden()
  await expect(page.getByText('Friends are kept with your account. Connect to add friends.')).toBeVisible()
})

test('friends on the leaderboard: the blue row and tag, ALL / FRIENDS keeping the ranks', async ({ page }) => {
  const save = withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' } }))
  const board = LEADERBOARD.map((r) => (r.name === 'Leaf' ? { ...r, is_friend: true, friend_id: MISTY } : { ...r, is_friend: false, friend_id: null }))
  await boot(page, save, { mock: friendsMock(save, { leaderboard: board, friend_status: [{ ids: [MISTY], unseen: [] }] }) })
  await page.goto('/leaderboard')
  const rows = page.getByRole('tabpanel').getByRole('listitem').filter({ has: page.locator('[aria-label^="Rank"]') })
  await expect(rows).toHaveCount(3)
  await expect(rows.filter({ hasText: 'Leaf' })).toContainText('Friend')
  await page.getByRole('radio', { name: /Friends/ }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Sam')
  await expect(rows.nth(1)).toContainText('Leaf')
  await expect(rows.nth(1).locator('[aria-label="Rank 3"]')).toBeVisible()
  await page.getByRole('button', { name: "Open Leaf's card" }).click()
  await expect(page.getByRole('dialog', { name: 'Misty' })).toBeVisible()
})

test('Discord on: CONNECT offers Google and Discord', async ({ page }) => {
  const save = makeSave(4)
  await boot(page, save, { session: false, mock: { authSettings: { external: { google: true, discord: true } } } })
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Connect to back up your save' }).first().click()
  const chooser = page.getByRole('dialog', { name: 'Connect' })
  await expect(chooser.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  const going = page.waitForRequest((r) => r.url().startsWith(`${SUPABASE}/auth/v1/authorize`) && r.url().includes('provider=discord'))
  await chooser.getByRole('button', { name: 'Continue with Discord' }).click()
  await going
})

test('Discord off: CONNECT goes straight to Google, as before', async ({ page }) => {
  const save = makeSave(4)
  await boot(page, save, { session: false })
  await page.goto('/settings')
  const going = page.waitForRequest((r) => r.url().startsWith(`${SUPABASE}/auth/v1/authorize`) && r.url().includes('provider=google'))
  await page.getByRole('button', { name: 'Connect to back up your save' }).first().click()
  await going
})

for (const size of [
  { width: 360, height: 640 },
  { width: 1280, height: 900 },
]) {
  test(`the Friends page fits at ${size.width}×${size.height}, in dark too`, async ({ page }) => {
    await page.setViewportSize(size)
    const base = makeSave(4)
    const save = { ...base, settings: { ...base.settings, ...JSON.parse(FAST), theme: 'dark' as const } }
    await boot(page, save, { mock: friendsMock(save, { friend_status: [{ ids: [MISTY, BROCK], unseen: [] }] }) })
    await page.goto('/friends')
    await expect(page.getByTestId('friend-code')).toHaveText('K7QM-4XD9')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.waitForTimeout(300)
    const page1 = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(page1.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([])
    await page.getByRole('button', { name: /^Misty,/ }).click()
    await expect(page.getByRole('dialog', { name: 'Misty' })).toContainText('Versus team')
    await page.waitForTimeout(300)
    const sheet = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(sheet.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([])
  })
}
