import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG } from '../src/engine'
import { EVENTS_ON, FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

// The weekly Versus league (docs/44), against a fake server: the opponents offered, the group's board, and a match
// fought on AUTO, its result sent and answered with trophies.

const SHOTS = process.env.E2E_SHOTS
const mon = (dex: number, level = 50, shiny = false) => ({ dex, level, shiny })
const ME = '11111111-2222-4333-8444-555555555555'

/** Versus's own board: your team (the league fights with it). */
const BOARD = [
  {
    user_id: ME,
    is_me: true,
    name: 'Sam',
    character: 'red',
    team: [mon(6), mon(9), mon(3)],
    version: 1,
    attack_wins: 0,
    defense_wins: 0,
    beaten: false,
  },
]
const CHOICES = [
  {
    slot: 1,
    name: 'Blue',
    avatar: 'green',
    team: [mon(129), mon(129), mon(129)],
    powers: { gems: [], gmax: false, z: false },
    trophies: 20,
    rich: false,
    is_bot: null,
  },
  {
    slot: 2,
    name: 'Kenta07',
    avatar: 'kanto/lass',
    team: [mon(150), mon(151), mon(149)],
    powers: { gems: [], gmax: false, z: false },
    trophies: 35,
    rich: false,
    is_bot: null,
  },
  {
    slot: 3,
    name: 'Lina',
    avatar: 'red',
    team: [mon(10), mon(13), mon(16)],
    powers: { gems: [], gmax: false, z: false },
    trophies: 12,
    rich: true,
    is_bot: null,
  },
]
const row = (name: string, trophies: number, rank: number, isMe = false) => ({
  id: `00000000-0000-4000-8000-0000000000${String(rank).padStart(2, '0')}`,
  isMe,
  name,
  avatar: 'red',
  team: [mon(25), mon(26), mon(130)],
  trophies,
  rank,
  rich: false,
  bot: null,
})
const HOME = {
  week: '2026-10-26',
  endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  joined: true,
  trophies: 24,
  closed: false,
  pending: null,
  rows: [row('Blue', 60, 1), row('Sam', 24, 2, true), row('Lina', 24, 2), row('Theo', 3, 4)],
}

/** Three Pokémon past Lv.50: what opens Versus. */
function readySave() {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const at = (id: string, dex: number, level: number) => ({
    id,
    dex,
    level,
    xp: 0,
    currentHp: 999,
    caughtAt: 0,
  })
  return { ...base, box: [...base.box, at('cz', 6, 72), at('vn', 3, 55), at('bl', 9, 60)] }
}

async function leagueOn(page: Page, save: object) {
  await page.addInitScript(
    ([key, session, s, f, cfg]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', cfg!)
    },
    [
      STORAGE_KEY,
      JSON.stringify(fakeSession()),
      JSON.stringify(save),
      FAST,
      JSON.stringify({ ...EVENTS_ON, versusLeague: { ...DEFAULT_CONFIG.versusLeague, access: 'all' } }),
    ],
  )
}

async function fakeLeague(page: Page) {
  const sent: Record<string, Record<string, unknown>[]> = { start: [], finish: [] }
  await mockSupabase(page, {
    rpc: {
      versus_board: BOARD,
      versus_league_home: (b: Record<string, unknown>) =>
        b.p_last ? { ...HOME, joined: false, trophies: 0, rows: [] } : HOME,
      versus_league_choices: CHOICES,
      versus_league_start: (b: Record<string, unknown>) => {
        sent.start!.push(b)
        const c = CHOICES.find((x) => x.slot === b.p_slot)!
        return [{ match_id: 77, seed: 4242, ...c }]
      },
      versus_league_finish: (b: Record<string, unknown>) => {
        sent.finish!.push(b)
        return b.p_outcome === 'won' ? [{ delta: 10, trophies: 34 }] : [{ delta: 0, trophies: 24 }]
      },
    },
  })
  return sent
}

test('the league: trophies and the week, 3 opponents with theirs, the group ranked with its rewards', async ({
  page,
}) => {
  await fakeLeague(page)
  await leagueOn(page, readySave())
  await page.goto('/versus')
  // Its rules, once, at the top (players who knew Versus read the league's).
  await expect(page.getByText('How Versus league works')).toBeVisible()
  await expect(page.getByLabel('24 trophies').first()).toBeVisible()
  await expect(page.getByText('#2 of 4 in your group')).toBeVisible()
  await expect(page.getByText(/Ends in [23]d/)).toBeVisible()
  // The opponents: their trophies and teams; one red FIGHT.
  for (const c of CHOICES) await expect(page.getByRole('button', { name: `Fight ${c.name}` })).toBeEnabled()
  await expect(page.getByLabel('35 trophies')).toBeVisible()
  await expect(page.locator('button.frame-deep', { hasText: 'FIGHT' })).toHaveCount(1)
  // Nobody is told who's a bot.
  await expect(page.getByText('BOT')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-pc.png`, fullPage: true })

  // PC: the group beside the opponents; ties share a rank; the top 10's rewards.
  const side = page.getByRole('complementary')
  await expect(side.getByRole('heading', { name: 'Your group' })).toBeVisible()
  await expect(side.getByLabel(/Wins 5 Raid Balls and 10 Rare Candies/)).toBeVisible()
  await side
    .getByRole('radio', { name: 'Last week' })
    .or(side.getByRole('button', { name: 'Last week' }))
    .first()
    .click()
  await expect(side.getByText("You didn't play in the league last week.")).toBeVisible()

  // A phone: the group is the third tab.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  await expect(page.getByRole('tabpanel').getByText('Blue')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-phone-board.png`, fullPage: true })
})

test('a match: recorded as it starts, fought (here on AUTO, no Bag), its result sent and answered in trophies', async ({
  page,
}) => {
  const sent = await fakeLeague(page)
  await leagueOn(page, { ...readySave(), versusLeagueRulesSeen: true })
  await page.goto('/versus')
  await page.getByRole('button', { name: 'Fight Blue' }).click()
  await expect.poll(() => sent.start!.length).toBe(1)
  expect(sent.start![0]).toEqual({ p_slot: 1 })

  // The player's fight: AUTO is theirs to turn on, off at the start; no Bag in Versus.
  const autoBtn = page.getByRole('button', { name: /Auto-mode: OFF/i })
  await expect(autoBtn).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^Bag/ })).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-fight.png` })
  await autoBtn.click()
  await expect(page.getByRole('button', { name: /Auto-mode: ON/i })).toBeVisible()

  await expect(page.getByText('VICTORY!')).toBeVisible({ timeout: 90_000 })
  await expect.poll(() => sent.finish!.length).toBe(1)
  const f = sent.finish![0]!
  expect(f).toMatchObject({ p_match: 77, p_outcome: 'won', p_foe_left: 0 })
  expect(f.p_left).toBeGreaterThanOrEqual(1)
  const moves = f.p_moves as { t: string }[]
  expect(moves.length).toBeGreaterThan(0)
  expect(moves.some((m) => ['USE_ITEM', 'TOGGLE_DIE', 'ROLL', 'AI_TURN'].includes(m.t))).toBe(false)
  await expect(page.getByText('+10')).toBeVisible()
  await expect(page.getByText('You have 34 trophies.')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-result.png` })
  await page.getByRole('button', { name: 'BACK TO VERSUS' }).click()
  await expect(page.getByRole('button', { name: 'Fight Blue' })).toBeVisible()
})
