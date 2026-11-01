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

/** The global board: every group's players this week (Kenta07 from another group), no bots. */
const GLOBAL = {
  week: HOME.week,
  endsAt: HOME.endsAt,
  rows: [row('Kenta07', 212, 1), row('Blue', 60, 2), row('Sam', 24, 3, true), row('Lina', 24, 3)],
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

async function leagueOn(page: Page, save: object, league: object = {}) {
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
      JSON.stringify({
        ...EVENTS_ON,
        versusLeague: { ...DEFAULT_CONFIG.versusLeague, access: 'all', ...league },
      }),
    ],
  )
}

async function fakeLeague(page: Page) {
  const sent: Record<string, Record<string, unknown>[]> = { start: [], finish: [], best: [] }
  await mockSupabase(page, {
    rpc: {
      versus_board: BOARD,
      versus_league_home: (b: Record<string, unknown>) =>
        b.p_last ? { ...HOME, joined: false, trophies: 0, rows: [] } : HOME,
      versus_league_global: GLOBAL,
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
      // The most trophies ever held, in any week (migration 0097).
      versus_league_best: (b: Record<string, unknown>) => {
        sent.best!.push(b)
        return 152
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
  // The global board waits on its own switch (Off here).
  await expect(side.getByRole('radio', { name: 'Global' })).toHaveCount(0)

  // A phone: the group is the third tab.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  await expect(page.getByRole('tabpanel').getByText('Blue')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-phone-board.png`, fullPage: true })
})

test('the global board, its switch on: every group’s players, for the glory (no rewards)', async ({
  page,
}) => {
  await fakeLeague(page)
  await leagueOn(page, { ...readySave(), versusLeagueRulesSeen: true }, { globalAccess: 'all' })
  await page.goto('/versus')
  const aside = page.getByRole('complementary')
  // Not only your group any more: the panel is the Leaderboard.
  await expect(aside.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await aside.getByRole('radio', { name: 'Global' }).click()
  await expect(aside.getByText('No rewards here: just the glory.', { exact: false })).toBeVisible()
  const board = aside.getByRole('list', { name: 'Global' })
  await expect(board.getByText('Kenta07')).toBeVisible()
  await expect(board.getByLabel('212 trophies')).toBeVisible()
  // Nothing to win: no Raid Balls or Rare Candies drawn.
  await expect(board.getByLabel(/Wins \d+ Raid Ball/)).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-global-pc.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Leaderboard' }).click()
  await page.getByRole('tabpanel').getByRole('radio', { name: 'Global' }).click()
  await expect(page.getByRole('tabpanel').getByText('Kenta07')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-global-phone.png`, fullPage: true })
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

test('a match by hand: after a K.O. with two left, the two come up as cards and GO! sends the one picked', async ({
  page,
}) => {
  await fakeLeague(page)
  await leagueOn(page, { ...readySave(), versusLeagueRulesSeen: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/versus')
  // Kenta07's Mewtwo, Mew and Dragonite: the first of yours falls before their three do.
  await page.getByRole('button', { name: 'Fight Kenta07' }).click()
  const next = page.getByText('Choose your next Pokémon')
  for (let i = 0; i < 300 && !(await next.isVisible()); i++) {
    for (const name of ['ATTACK', 'SKIP TURN']) {
      const b = page.getByRole('button', { name, exact: true })
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
  await expect(next).toBeVisible()
  // The league's Pokémon are clones, in no Box: the step still finds them.
  await expect(page.getByText('No other Pokémon can come in.')).toHaveCount(0)
  const go = page.getByRole('button', { name: /^Send out / })
  await expect(go).toBeVisible()
  await expect(page.getByRole('button', { name: 'INFO' })).toHaveCount(2)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-ko-switch.png` })
  // INFO is the clone as it fights (its HP, dice, stats), with nowhere to go from there.
  await page.getByRole('button', { name: 'Blastoise info' }).click()
  const sheet = page.getByRole('dialog', { name: 'Blastoise' })
  await expect(sheet.getByText(/Lv\.50 · HP \d+\/\d+/)).toBeVisible()
  await expect(sheet.getByText('Dice', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Where to find it')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /Pokédex entry|nickname/i })).toHaveCount(0)
  await expect(sheet.getByRole('link')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await go.click()
  await expect(next).toHaveCount(0)
  // Blastoise is out, and the fight goes on.
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible({ timeout: 30_000 })
})

test("the trainer card's Versus line: the most trophies ever held, not the old board's wins (phone)", async ({
  page,
}) => {
  const sent = await fakeLeague(page)
  await leagueOn(page, { ...readySave(), versusLeagueRulesSeen: true })
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/home')
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  const card = page.getByRole('dialog', { name: 'Trainer card' })
  await card.getByRole('button', { name: 'Stats', exact: true }).click()
  const stats = card.locator('#card-stats')
  await expect(stats.getByRole('term').filter({ hasText: 'Versus best' })).toBeVisible()
  const line = stats.getByRole('definition').filter({ has: page.getByLabel('152 trophies') })
  await expect(line).toBeVisible()
  await expect(stats).not.toContainText(' won · ')
  // Whole on a 360 px phone, not cut short.
  expect(await line.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  // Your own: no friend asked about (dev's StrictMode may ask twice).
  expect(sent.best!.length).toBeGreaterThan(0)
  expect(sent.best!.every((b) => !('p_user' in b))).toBe(true)
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/card-versus-best.png` })
})

test("Monday: the week's rewards pop up as the league's, in its own words, and open as a gift", async ({
  page,
}) => {
  const gifts = [
    { kind: 'gold', amount: 169, region: 'current' },
    { kind: 'item', key: 'raid-ball', qty: 2, region: 'current' },
  ]
  await mockSupabase(page, {
    rpc: {
      my_feedback: [
        {
          id: 9001,
          created_at: new Date().toISOString(),
          title: 'versus_league',
          message: '',
          reply: `@versus_league:${JSON.stringify({ week: '2026-10-19', rank: 2, trophies: 169, size: 20 })}`,
          replied_at: new Date().toISOString(),
          reply_seen: false,
          from_admin: true,
          gifts,
          gifts_claimed: false,
        },
      ],
      feedback_claim_gifts: [{ id: 9001, gifts }],
    },
  })
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
      JSON.stringify({ ...readySave(), versusLeagueRulesSeen: true, gifts: { done: [], rulesSeen: true } }),
      FAST,
      JSON.stringify({ ...EVENTS_ON, versusLeague: { access: 'all' }, gifts: { access: 'all' } }),
    ],
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/home')
  const popup = page.getByRole('dialog', { name: 'Your Versus league week' })
  await expect(popup).toBeVisible({ timeout: 20_000 })
  await expect(popup.getByText('Your place in your group and your rewards.', { exact: false })).toBeVisible()
  await expect(
    popup.getByText('You finished #2 of 20 in your group with 169 trophies.', { exact: false }),
  ).toBeVisible()
  // Not the developer's words.
  await expect(page.getByText('A message from the developer!')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/league-reward-popup.png` })
  await popup.getByRole('button', { name: /open the gift/i }).click()
  await expect(page.getByText('Raid Ball', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
})
