// Friendship streaks and the Friend Market (docs/59), against the mocked Supabase: the Friends page's Friendship card
// (coins, today's gauge, the streaks to keep today), the badges on the friends' rows, the rules card once, a friend's
// streak on their card, the market (the shiny of the week, the items, limits and coins, a purchase opened like a gift
// into the save and marked applied), a purchase a closed tab left behind put away once, and the switch off.
// With SHOTS=<dir>, it also saves the screenshots of each screen for review.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { marketShiny, marketWeek, type SaveData } from '../src/engine'
import {
  EVENTS_ON,
  FAST,
  fakeSession,
  gameData,
  makeSave,
  mockSupabase,
  STORAGE_KEY,
  type SupabaseMock,
} from './helpers'

const data = gameData()
const MISTY = '22222222-0000-4000-8000-000000000002'
const BROCK = '22222222-0000-4000-8000-000000000003'
const ERIKA = '22222222-0000-4000-8000-000000000004'
const DAY = 86_400_000
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10)
const TODAY = day(0)
const WEEK = marketWeek(TODAY)
const SHINY = marketShiny(WEEK, data)!
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const SHOTS = process.env.SHOTS

const FRIENDS = [
  {
    user_id: MISTY,
    name: 'Misty',
    avatar: 'green',
    region: 'kanto',
    area_id: null,
    max_level: 24,
    team: [
      { dex: 120, level: 21 },
      { dex: 121, level: 24 },
    ],
    since: '2026-10-03T10:00:00Z',
    updated_at: hoursAgo(2),
    is_new: false,
  },
  {
    user_id: BROCK,
    name: 'Brock',
    avatar: 'kanto/hiker',
    region: 'kanto',
    area_id: null,
    max_level: 14,
    team: [
      { dex: 74, level: 12 },
      { dex: 95, level: 14 },
    ],
    since: '2026-10-01T10:00:00Z',
    updated_at: hoursAgo(5),
    is_new: false,
  },
  {
    user_id: ERIKA,
    name: 'Erika',
    avatar: 'kanto/lass',
    region: 'kanto',
    area_id: null,
    max_level: 31,
    team: [
      { dex: 45, level: 31 },
      { dex: 114, level: 28 },
    ],
    since: '2026-09-21T10:00:00Z',
    updated_at: hoursAgo(1),
    is_new: false,
  },
]

const PROFILE = [
  {
    user_id: MISTY,
    name: 'Misty',
    avatar: 'green',
    region: 'kanto',
    area_id: null,
    updated_at: hoursAgo(2),
    since: '2026-10-03T10:00:00Z',
    regions: [
      {
        region: 'kanto',
        team: FRIENDS[0]!.team,
        pokedex: 40,
        maxLevel: 24,
        shinies: 1,
        progress: {},
        badges: [],
        endgame: false,
      },
    ],
    versus: null,
  },
]

type Status = {
  day: string
  week: string
  shiny: number
  balance: number
  earned: number
  total: number
  streaks: { friend: string; streak: number; best: number; lastDay: string; lastKind: string }[]
  today: { friend: string; kind: string; streak: number; coins: number }[]
  bought: Record<string, number>
  pending: { id: string; gifts: unknown }[]
}

const status = (patch: Partial<Status> = {}): Status => ({
  day: TODAY,
  week: WEEK,
  shiny: SHINY,
  balance: 186,
  earned: 9,
  total: 420,
  streaks: [
    { friend: MISTY, streak: 12, best: 12, lastDay: day(-1), lastKind: 'raid' },
    { friend: BROCK, streak: 3, best: 3, lastDay: TODAY, lastKind: 'trade' },
    { friend: ERIKA, streak: 34, best: 34, lastDay: day(-1), lastKind: 'egg' },
  ],
  today: [{ friend: BROCK, kind: 'trade', streak: 3, coins: 3 }],
  bought: { 'rare-candy': 8 },
  pending: [],
  ...patch,
})

const ON = { ...EVENTS_ON, friendship: { ...data.config.friendship, access: 'all' } }

async function boot(page: Page, save: SaveData, rpc: SupabaseMock['rpc'] = {}, cfg: object = ON) {
  const calls = await mockSupabase(page, {
    rpc: {
      friend_code: 'K7QM4XD9',
      friend_list: FRIENDS,
      friend_status: [{ ids: [MISTY, BROCK, ERIKA], unseen: [] }],
      friend_seen: null,
      friend_profile: PROFILE,
      friendship_status: () => status(),
      friend_market_applied: null,
      ...rpc,
    },
  })
  await page.addInitScript(
    ([key, session, s, f, c]) => {
      localStorage.setItem(key!, session!)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
      // The share notice stays out of the screenshots.
      for (const r of ['kanto', 'johto', 'hoenn']) localStorage.setItem(`pokedice.sharePrompt.${r}`, '1')
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), FAST, JSON.stringify(cfg)],
  )
  return calls
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
const shot = async (page: Page, name: string, full = true) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}

async function seriousAxe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)
}

test('the Friends page: the Friendship card, the streaks on the rows, the rules once, a friend’s streak', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  await boot(page, save)
  await page.goto('/friends')

  const rules = page.getByRole('region', { name: 'How Friendship works' })
  await expect(rules).toContainText('Play together, once a day')
  await expect(rules).toContainText(
    'Days 1–3: +3 · Days 4–7: +4 · Days 8–14: +5 · Days 15–30: +6 · Day 31+: +7',
  )
  const card = page.getByTestId('friendship-card')
  await expect(card).toBeVisible()
  await expect(card.getByRole('img', { name: '186 Festival Coins' })).toBeVisible()
  await expect(card.getByRole('meter', { name: '9 of 50 Festival Coins earned today' })).toBeVisible()
  await expect(card).toContainText('1 of 3 streaks kept today')
  // The streaks to keep today, the longest first, each with what today would pay.
  const waiting = card.getByRole('list', { name: 'Streaks to keep today' }).getByRole('listitem')
  await expect(waiting).toHaveCount(2)
  await expect(waiting.nth(0)).toContainText('Erika')
  await expect(waiting.nth(0)).toContainText('+7 today')
  await expect(waiting.nth(1)).toContainText('Misty')
  await expect(waiting.nth(1)).toContainText('+5 today')
  // The rows: a badge each, the state in words.
  await expect(page.getByRole('img', { name: 'Friendship streak: 3 days, kept today' })).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Friendship streak: 12 days, keep it today!' }).first(),
  ).toBeVisible()
  expect(await seriousAxe(page)).toEqual([])
  await shot(page, '1-friends-page-phone')

  await rules.getByRole('button', { name: 'GOT IT' }).click()
  await expect(rules).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).friendship?.rulesSeen).toBe(true)

  // A friend's card: their streak, its tier, what keeps it.
  await page.getByRole('button', { name: /^Misty,/ }).click()
  const streak = page.getByTestId('friend-streak')
  await expect(streak).toContainText('12-day streak')
  await expect(streak).toContainText('Great friends')
  await expect(streak).toContainText('Keep it today with Misty: +5.')
  await shot(page, '2-friend-card-phone', false)
})

test('the Friend Market: the shiny of the week, the shelf, a purchase opened like a gift', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' }, friendship: { rulesSeen: true } })
  const buys: unknown[] = []
  const applied: unknown[] = []
  let current = status()
  await boot(page, save, {
    friendship_status: () => current,
    friend_market_buy: (body: { p_key: string; p_qty: number }) => {
      buys.push(body)
      current = { ...current, balance: current.balance - 30, bought: { ...current.bought, 'rare-candy': 10 } }
      return {
        id: 'buy-1',
        key: body.p_key,
        gifts: [{ kind: 'item', key: 'rare-candy', qty: body.p_qty, region: 'latest' }],
        balance: 156,
      }
    },
    friend_market_applied: (body: unknown) => {
      applied.push(body)
      return null
    },
  })
  await page.goto('/friends')
  await page.getByTestId('open-market').click()
  await expect(page).toHaveURL(/\/market$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Friend Market' })).toBeVisible()
  const shiny = page.getByTestId('market-shiny')
  await expect(shiny).toContainText(data.species[SHINY]!.name)
  await expect(shiny).toContainText('Lv.15')
  await expect(shiny.getByRole('button', { name: /Buy 1 for 150 Festival Coins/ })).toBeVisible()
  const candy = page.getByTestId('market-rare-candy')
  await expect(candy).toContainText('2 of 10 left this week')
  // ×10 is more than what's left: only ×1 shows (×5 too, it's short).
  await expect(candy.getByRole('button', { name: /Buy 10/ })).toHaveCount(0)
  const balls = page.getByTestId('market-friend-ball')
  await expect(balls).toContainText('Friend Ball')
  await expect(balls).toContainText('20 of 20 left this week')
  expect(await seriousAxe(page)).toEqual([])
  await shot(page, '3-market-phone')

  const before = save.inventory['rare-candy'] ?? 0
  await candy.getByRole('button', { name: 'Buy 1 for 15 Festival Coins' }).click()
  const moment = page.getByRole('dialog', { name: 'From the Friend Market!' })
  await expect(moment).toBeVisible()
  await moment.getByRole('button', { name: /skip/i }).click()
  await expect(moment.getByText('Rare Candy')).toBeVisible()
  await shot(page, '4-market-purchase-phone', false)
  await moment.getByRole('button', { name: 'Done' }).click()
  expect(buys).toEqual([{ p_key: 'rare-candy', p_qty: 1 }])
  await expect.poll(async () => (await stored(page)).inventory['rare-candy']).toBe(before + 1)
  await expect.poll(async () => (await stored(page)).friendship?.applied).toEqual(['buy-1'])
  await expect.poll(() => applied).toEqual([{ p_ids: ['buy-1'] }])
  await expect(candy).toContainText('1 of 10 left this week')
})

test('the market on a wide screen, and the shiny too dear', async ({ page }) => {
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' }, friendship: { rulesSeen: true } })
  await boot(page, save, { friendship_status: () => status({ balance: 40, bought: { 'talent-candy': 2 } }) })
  await page.goto('/market')
  const shiny = page.getByTestId('market-shiny')
  await expect(
    shiny.getByRole('button', { name: /Buy 1 for 150 Festival Coins.*Need 110 more coins/ }),
  ).toBeVisible()
  await expect(page.getByTestId('market-talent-candy')).toContainText('Sold out this week')
  await shot(page, '5-market-desktop')
})

test('a purchase a closed tab left behind is put away once', async ({ page }) => {
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' }, friendship: { rulesSeen: true } })
  const pending = [{ id: 'buy-9', gifts: [{ kind: 'item', key: 'friend-ball', qty: 5, region: 'latest' }] }]
  let applied = false
  await boot(page, save, {
    friendship_status: () => status({ pending: applied ? [] : pending }),
    friend_market_applied: () => {
      applied = true
      return null
    },
  })
  await page.goto('/friends')
  const moment = page.getByRole('dialog', { name: 'From the Friend Market!' })
  await expect(moment).toBeVisible()
  await moment.getByRole('button', { name: /skip/i }).click()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => (await stored(page)).inventory['friend-ball']).toBe(5)
  await expect.poll(() => applied).toBe(true)
})

test('switched off: no card, no badges, the market goes back to Friends', async ({ page }) => {
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const calls = await boot(page, save, {}, EVENTS_ON)
  await page.goto('/friends')
  await expect(page.getByRole('button', { name: /^Misty,/ })).toBeVisible()
  await expect(page.getByTestId('friendship-card')).toHaveCount(0)
  await expect(page.getByRole('img', { name: /Friendship streak/ })).toHaveCount(0)
  await page.goto('/market')
  await expect(page).toHaveURL(/\/friends$/)
  expect(calls.some((c) => c.includes('friendship_status'))).toBe(false)
})
