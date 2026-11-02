// Friend Battles (docs/65), against the mocked Supabase: the Friends page's card and a BATTLE button on the friend in the
// game (Offline on the others), the challenge sheet and its waiting screen; a challenge arriving as a banner, accepted,
// the coin and the draft's first pick; a fight on the battle screen with your move sent to the server and the
// opponent's coming back; the page's rules card once and its record; the switch off. With SHOTS=<dir>, it also saves
// the screenshots of each screen for review.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { applyPvpMove, FRIEND_BATTLES_DEFAULTS, startPvp, type SaveData } from '../src/engine'
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
const ME = '11111111-2222-4333-8444-555555555555'
const MISTY = '22222222-0000-4000-8000-000000000002'
const BROCK = '22222222-0000-4000-8000-000000000003'
const SHOTS = process.env.SHOTS
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const friend = (user_id: string, name: string, avatar: string) => ({
  user_id,
  name,
  avatar,
  region: 'kanto',
  area_id: null,
  max_level: 60,
  team: [{ dex: 121, level: 60 }],
  since: '2026-10-03T10:00:00Z',
  updated_at: hoursAgo(1),
  is_new: false,
  in_realm: true,
})
const FRIENDS = [friend(MISTY, 'Misty', 'green'), friend(BROCK, 'Brock', 'kanto/hiker')]
const ON = { ...EVENTS_ON, friendBattles: { ...FRIEND_BATTLES_DEFAULTS, access: 'all' } }
const mon = (dex: number, level = 60) => ({ dex, level, shiny: false })

/** A match as pvp_public returns it, from my side `side`. */
function info(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    mode: 'draft',
    state: 'invited',
    side: 'a',
    a: { id: ME, name: 'Sam', avatar: 'red' },
    b: { id: MISTY, name: 'Misty', avatar: 'green' },
    firstPicker: null,
    picks: [],
    cand: null,
    team: null,
    foeTeam: null,
    readyA: false,
    readyB: false,
    seq: 0,
    seed: null,
    deadline: Date.now() + 100_000,
    now: Date.now(),
    winner: null,
    reason: null,
    createdAt: Date.now(),
    cfg: FRIEND_BATTLES_DEFAULTS,
    ...over,
  }
}

async function boot(page: Page, save: SaveData, rpc: SupabaseMock['rpc'] = {}, cfg: object = ON) {
  const calls = await mockSupabase(page, {
    rpc: {
      friend_code: 'K7QM4XD9',
      friend_list: FRIENDS,
      friend_status: [{ ids: [MISTY, BROCK], unseen: [], beta: false }],
      friend_seen: null,
      pvp_here: null,
      pvp_online: [MISTY],
      pvp_home: { current: null, records: [], history: [] },
      pvp_ping: null,
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
      for (const r of ['kanto', 'johto', 'hoenn']) localStorage.setItem(`pokedice.sharePrompt.${r}`, '1')
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), FAST, JSON.stringify(cfg)],
  )
  return calls
}

const shot = async (page: Page, name: string, full = true) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}

async function seriousAxe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)
}

const save = () => makeSave(4, { player: { name: 'Sam', character: 'red' }, friendBattlesRulesSeen: true })

test('the Friends page: the card, BATTLE on the friend in the game, the challenge sheet, waiting for the answer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const sent: unknown[] = []
  await boot(page, save(), {
    pvp_challenge: (body: unknown) => {
      sent.push(body)
      return info()
    },
  })
  await page.goto('/friends')
  await expect(page.getByRole('button', { name: /Friend Battles/ })).toBeVisible()
  const battle = page.getByRole('button', { name: 'Battle Misty' })
  await expect(battle).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Brock is offline' })).toBeDisabled()
  await expect(page.getByText('Online now')).toBeVisible()
  await shot(page, 'pvp-friends')

  await battle.click()
  const sheet = page.getByRole('dialog', { name: 'Challenge Misty' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('radio', { name: /Draft/ })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('radio', { name: /Classic/ }).click()
  await sheet.getByRole('radio', { name: /Draft/ }).click()
  await shot(page, 'pvp-sheet')
  expect(await seriousAxe(page)).toEqual([])
  await sheet.getByRole('button', { name: 'Send challenge' }).click()

  await expect(page).toHaveURL(/\/battles\/live$/)
  await expect(page.getByText('Waiting for Misty…').first()).toBeVisible()
  expect(sent).toEqual([{ p_friend: MISTY, p_mode: 'draft' }])
  await shot(page, 'pvp-waiting')
})

test('a challenge arrives: the banner, ACCEPT, the coin, then my first pick goes to the server', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const incoming = info({ side: 'b', a: { id: MISTY, name: 'Misty', avatar: 'green' }, b: { id: ME, name: 'Sam', avatar: 'red' } })
  const drafting = info({
    ...incoming,
    state: 'draft',
    firstPicker: 'b',
    cand: [mon(149, 72), mon(6, 64), mon(94, 66), mon(135, 54)],
    deadline: Date.now() + 120_000,
  })
  const picks: unknown[] = []
  await boot(page, save(), {
    pvp_home: { current: incoming, records: [], history: [] },
    pvp_answer: () => drafting,
    pvp_pick: (body: unknown) => {
      picks.push(body)
      return { ...drafting, picks: [{ side: 'b', ...mon(149, 72) }] }
    },
  })
  await page.goto('/home')
  const banner = page.getByRole('alertdialog', { name: 'Misty challenges you!' })
  await expect(banner).toBeVisible()
  await shot(page, 'pvp-banner', false)
  await banner.getByRole('button', { name: 'Accept' }).click()

  await expect(page).toHaveURL(/\/battles\/live$/)
  await expect(page.getByText('Tails! You pick first')).toBeVisible()
  await shot(page, 'pvp-coin')
  await expect(page.getByText('Your pick', { exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Dragonite/ }).click()
  await shot(page, 'pvp-draft')
  await page.getByRole('button', { name: 'Pick Dragonite' }).click()
  await expect.poll(() => picks).toEqual([{ p_match: 7, p_dex: 149, p_shiny: false }])
  await expect(page.getByText('Misty is picking…')).toBeVisible()
})

test('the fight: my ATTACK goes to the server with its number, and its seed plays it on the battle screen', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  // Jolteon (fast) leads against Snorlax: my turn first.
  const fighting = info({
    state: 'battle',
    mode: 'classic',
    team: [mon(135), mon(9), mon(3)],
    foeTeam: [mon(143), mon(94), mon(130)],
    readyA: true,
    readyB: true,
    seed: 4242,
    deadline: Date.now() + 45_000,
  })
  const moves: { p_seq: number; p_move: { k: string } }[] = []
  await boot(page, save(), {
    pvp_home: { current: fighting, records: [], history: [] },
    pvp_state: (body: { p_after?: number }) => ({ match: fighting, moves: body.p_after ? [] : [] }),
    pvp_move: (body: { p_seq: number; p_move: { k: string } }) => {
      moves.push(body)
      return { seq: body.p_seq, seed: 99 }
    },
  })
  await page.goto('/battles/live')
  await expect(page.getByText('Your turn')).toBeVisible({ timeout: 20_000 })
  const attack = page.getByRole('button', { name: /^attack/i })
  await expect(attack).toBeEnabled({ timeout: 20_000 })
  await shot(page, 'pvp-fight', false)
  await attack.click()
  await expect.poll(() => moves.map((m) => [m.p_seq, m.p_move.k])).toEqual([[1, 'attack']])
  // The same fight, played here by the engine from the same seeds: whose turn it is now on screen says the game played
  // it the same (Snorlax's, Misty's — unless the hit paralyzed it and its turn passed).
  const opened = startPvp(fighting.team as never, fighting.foeTeam as never, null, data, 4242)
  const after = applyPvpMove(opened.match, 'a', { k: 'attack' }, 99, data).match
  const foeHp = after.b[after.activeB]!.hp
  expect(foeHp).toBeLessThan(opened.match.b[0]!.hp)
  if (after.actor === 'b') await expect(page.getByText("Misty's turn")).toBeVisible({ timeout: 20_000 })
  // Paralyzed, its turn passed: mine again, once the hit has played.
  else await expect(attack).toBeEnabled({ timeout: 20_000 })
  const inStore = await page.evaluate(() => {
    const s = (window as unknown as { __pd: { usePvp: { getState: () => { applied: number; engine: { b: { hp: number }[]; actor: string } } } } }).__pd.usePvp.getState()
    return { applied: s.applied, hp: s.engine.b[0]!.hp, actor: s.engine.actor }
  })
  expect(inStore).toEqual({ applied: 1, hp: foeHp, actor: after.actor })
  // The foe's HP bar says what the engine says (a foe's bar is in quarters, rounded up).
  const max = opened.match.b[0]!.maxHp
  const meter = page.getByRole('button', { name: 'Snorlax: strengths and weaknesses' }).getByRole('meter')
  await expect
    .poll(async () => Number(await meter.first().getAttribute('aria-valuenow')))
    .toBe(Math.ceil((foeHp / max) * 4) * 25)
  await expect(page.getByRole('button', { name: 'Jolteon: strengths and weaknesses' }).first()).toBeVisible()
  await shot(page, 'pvp-after-attack', false)
})

test('back after a reload: the moves missed are read back and played the same as the other game did', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  // Their Jolteon is faster than my Snorlax: Misty moved first while this game was away.
  const fighting = info({
    state: 'battle',
    mode: 'draft',
    firstPicker: 'a',
    team: [mon(143), mon(9), mon(3)],
    foeTeam: [mon(135), mon(94), mon(130)],
    seq: 1,
    seed: 777,
    deadline: Date.now() + 45_000,
  })
  const missed = [{ seq: 1, side: 'b', move: { k: 'attack' }, seed: 31337 }]
  await boot(page, save(), {
    pvp_home: { current: fighting, records: [], history: [] },
    pvp_state: (body: { p_after?: number }) => ({ match: fighting, moves: (body.p_after ?? 0) < 1 ? missed : [] }),
  })
  await page.goto('/battles/live')
  // The same fight here: the shield (I picked first) halved their first hit.
  const opened = startPvp(fighting.team as never, fighting.foeTeam as never, 'a', data, 777)
  const after = applyPvpMove(opened.match, 'b', { k: 'attack' }, 31337, data).match
  const mine = after.a[0]!
  expect(after.shield?.used).toBe(true)
  await expect(page.getByText(`${mine.hp}/${mine.maxHp}`)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('Bonus Shield used').first()).toBeVisible()
  await shot(page, 'pvp-caught-up', false)
})

test('the page: its rules card once, the record and the last battles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, makeSave(4, { player: { name: 'Sam', character: 'red' } }), {
    pvp_home: {
      current: null,
      records: [{ id: MISTY, name: 'Misty', avatar: 'green', wins: 4, losses: 3, draws: 0 }],
      history: [
        { id: 3, mode: 'draft', at: Date.now() - 1_200_000, foe: { id: MISTY, name: 'Misty', avatar: 'green' }, result: 'win', reason: 'ko' },
      ],
    },
  })
  await page.goto('/battles')
  await expect(page.getByRole('heading', { name: 'Friend Battles', level: 1 })).toBeVisible()
  const card = page.getByRole('region', { name: 'How Friend Battles works' })
  await expect(card).toBeVisible()
  await expect(page.getByText('vs Misty')).toBeVisible()
  await expect(page.getByText(/You lead 4–3/)).toBeVisible()
  await shot(page, 'pvp-page')
  expect(await seriousAxe(page)).toEqual([])
  await card.getByRole('button', { name: 'Got it' }).click()
  await expect(card).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').friendBattlesRulesSeen))
    .toBe(true)
})

test('switched off: no card, no BATTLE, the page goes back to Friends', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const calls = await boot(page, save(), {}, EVENTS_ON)
  await page.goto('/friends')
  await expect(page.getByText('Misty')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Battle Misty' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Friend Battles/ })).toHaveCount(0)
  await page.goto('/battles')
  await expect(page).toHaveURL(/\/friends$/)
  expect(calls.filter((c) => c.includes('/rpc/pvp_'))).toEqual([])
})
