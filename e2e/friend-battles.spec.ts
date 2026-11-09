// Friend Battles (docs/65), against the mocked Supabase: BATTLE in the card of a friend in the game (Offline in the
// others'), the challenge sheet and its waiting screen; a challenge arriving as a banner, accepted, the coin and the
// draft's first pick; a fight on the battle screen with your move sent to the server and the opponent's coming back;
// the page (no rules card: opening it sets the flag) and its record; the switch off. With SHOTS=<dir>, it also saves
// the screenshots of each screen for review.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { applyPvpMove, FRIEND_BATTLES_DEFAULTS, marketShiny, marketWeek, startPvp, type SaveData } from '../src/engine'
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
/** A friend's card (friend_profile), for the one asked. */
const PROFILE = (body: { p_friend?: string }) => {
  const f = FRIENDS.find((x) => x.user_id === body.p_friend) ?? FRIENDS[0]!
  return [
    {
      user_id: f.user_id, name: f.name, avatar: f.avatar, region: 'kanto', area_id: null, updated_at: hoursAgo(1),
      since: '2026-10-03T10:00:00Z',
      regions: [{ region: 'kanto', team: f.team, pokedex: 40, maxLevel: 60, shinies: 0, progress: {}, badges: [], endgame: false }],
      versus: null,
    },
  ]
}
/** BATTLE is in the friend's card (the user's call, 2026-11-07): open Misty's, then BATTLE. */
async function battleMisty(page: Page) {
  await page.getByRole('button', { name: /^Misty,/ }).click()
  await page.getByRole('dialog', { name: 'Misty' }).getByRole('button', { name: 'Battle Misty' }).click()
}
const ON = { ...EVENTS_ON, friendBattles: { ...FRIEND_BATTLES_DEFAULTS, access: 'all' } }
const mon = (dex: number, level = 60) => ({ dex, level, shiny: false })
/** Battle tickets (docs/65 §15) as pvp_home carries them: `n` held, the next at midnight in 5 h. */
const TICKETS = (n: number) => ({ balance: n, cap: 3, daily: 1, nextAt: Date.now() + 5 * 3_600_000 })

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
      friend_profile: PROFILE,
      pvp_here: null,
      pvp_online: [MISTY],
      pvp_home: { current: null, records: [], history: [], tickets: TICKETS(2) },
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

test("the Friends page: BATTLE in the card of the friend in the game, the challenge sheet, waiting for the answer", async ({
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
  // No card and no button on the rows: the friend in the game says so on their row.
  await expect(page.getByRole('button', { name: /^Misty,/ })).toContainText('Online now')
  await expect(page.getByRole('button', { name: /Friend Battles/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Battle Misty' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Brock,/ }).click()
  const brock = page.getByRole('dialog', { name: 'Brock' })
  await expect(brock.getByRole('button', { name: 'Brock is offline' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(brock).toHaveCount(0)
  await page.getByRole('button', { name: /^Misty,/ }).click()
  const card = page.getByRole('dialog', { name: 'Misty', exact: true })
  const battle = card.getByRole('button', { name: 'Battle Misty' })
  await expect(battle).toBeEnabled()
  await expect(card.getByRole('button', { name: /Friend Battles/ })).toBeVisible()
  await shot(page, 'pvp-friends')

  await battle.click()
  // A phone shows one sheet at a time: the card steps aside for the challenge.
  await expect(card).toHaveCount(0)
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
  expect(sent).toEqual([{ p_friend: MISTY, p_mode: 'draft', p_level: 50 }])
  await shot(page, 'pvp-waiting')
})

test('a challenge arrives: the banner, ACCEPT, the coin, then my first pick goes to the server', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const incoming = info({ side: 'b', a: { id: MISTY, name: 'Misty', avatar: 'green' }, b: { id: ME, name: 'Sam', avatar: 'red' } })
  const drafting = info({
    ...incoming,
    state: 'draft',
    firstPicker: 'b',
    cand: [mon(149, 72), mon(6, 64), mon(94, 66), mon(135, 54), mon(669, 60)],
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
  // The search forgives accents (a player's report: "electhor" didn't find Électhor): "flabebe" finds Flabébé.
  const search = page.getByRole('textbox', { name: 'Search a Pokémon' })
  await search.fill('flabebe')
  await expect(page.getByRole('button', { name: /Flabébé/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Dragonite/ })).toHaveCount(0)
  await search.fill('')
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
  // Two people fight it: no AUTO-MODE (the user's call, 2026-11-03), and never the Bag.
  await expect(page.getByRole('button', { name: /Auto-mode/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Bag/ })).toHaveCount(0)
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

test('a switch on my turn: the pip, GO!, the move sent, my Pokémon in and their turn', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  // Jolteon (fast) leads against Snorlax: my turn first. Blastoise comes in instead.
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
  const moves: { p_seq: number; p_move: { k: string; uid?: string } }[] = []
  await boot(page, save(), {
    pvp_home: { current: fighting, records: [], history: [] },
    pvp_state: () => ({ match: fighting, moves: [] }),
    pvp_move: (body: { p_seq: number; p_move: { k: string } }) => {
      moves.push(body)
      return { seq: body.p_seq, seed: 99 }
    },
  })
  await page.goto('/battles/live')
  await expect(page.getByRole('button', { name: /^attack/i })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: /Blastoise.*Switch in/ }).click()
  await expect(page.getByText('Switch (costs your turn)')).toBeVisible()
  await shot(page, 'pvp-switch', false)
  await page.getByRole('button', { name: 'Send out Blastoise' }).click()
  await expect.poll(() => moves.map((m) => [m.p_seq, m.p_move.k, m.p_move.uid])).toEqual([[1, 'switch', 'a1']])
  // The engine, from the same seed: Blastoise out, the turn spent, Misty's to play.
  const opened = startPvp(fighting.team as never, fighting.foeTeam as never, null, data, 4242)
  const after = applyPvpMove(opened.match, 'a', { k: 'switch', uid: 'a1' }, 99, data).match
  expect(after.activeA).toBe(1)
  await expect(page.getByText("Misty's turn")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /Blastoise.*in battle/ })).toBeVisible()
  const inStore = await page.evaluate(() => {
    const s = (window as unknown as { __pd: { usePvp: { getState: () => { applied: number; engine: { activeA: number; actor: string } } } } }).__pd.usePvp.getState()
    return { applied: s.applied, activeA: s.engine.activeA, actor: s.engine.actor }
  })
  expect(inStore).toEqual({ applied: 1, activeA: 1, actor: after.actor })
})

test('their switch: the one they send in comes out on my screen', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  // Their Jolteon is faster than my Snorlax: Misty moved first, while this game was away, switching to her Starmie.
  const fighting = info({
    state: 'battle',
    mode: 'classic',
    team: [mon(143), mon(9), mon(3)],
    foeTeam: [mon(135), mon(121), mon(130)],
    readyA: true,
    readyB: true,
    seq: 1,
    seed: 777,
    deadline: Date.now() + 45_000,
  })
  const missed = [{ seq: 1, side: 'b', move: { k: 'switch', uid: 'b1' }, seed: 31337 }]
  await boot(page, save(), {
    pvp_home: { current: fighting, records: [], history: [] },
    pvp_state: (body: { p_after?: number }) => ({ match: fighting, moves: (body.p_after ?? 0) < 1 ? missed : [] }),
  })
  await page.goto('/battles/live')
  await expect(page.getByRole('button', { name: 'Starmie: strengths and weaknesses' }).first()).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText('Your turn')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /^attack/i })).toBeEnabled({ timeout: 20_000 })
  await shot(page, 'pvp-their-switch', false)
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
  // The same fight here: the shield (I picked first) cut their first hit.
  const opened = startPvp(fighting.team as never, fighting.foeTeam as never, 'a', data, 777)
  const after = applyPvpMove(opened.match, 'b', { k: 'attack' }, 31337, data).match
  const mine = after.a[0]!
  expect(after.shield?.used).toBe(true)
  await expect(page.getByText(`${mine.hp}/${mine.maxHp}`)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('Bonus Shield used').first()).toBeVisible()
  await shot(page, 'pvp-caught-up', false)
})

test('the page: no rules card (opening it sets the flag), the record and the last battles', async ({ page }) => {
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
  await expect(page.getByRole('region', { name: 'How Friend Battles works' })).toHaveCount(0)
  await expect(page.getByText('vs Misty')).toBeVisible()
  await expect(page.getByText(/You lead 4–3/)).toBeVisible()
  await shot(page, 'pvp-page')
  expect(await seriousAxe(page)).toEqual([])
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').friendBattlesRulesSeen))
    .toBe(true)
})

test('Lv.100: picked in the sheet, sent with the challenge, said on the banner and the match', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const sent: unknown[] = []
  await boot(page, save(), {
    pvp_challenge: (body: unknown) => {
      sent.push(body)
      return info({ level: 100, mode: 'classic' })
    },
  })
  await page.goto('/friends')
  await battleMisty(page)
  const sheet = page.getByRole('dialog', { name: 'Challenge Misty' })
  const levels = sheet.getByRole('radiogroup', { name: 'Pick a level' })
  await expect(levels.getByRole('radio', { name: /Lv\.50/ })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('radio', { name: /Classic/ }).click()
  await levels.getByRole('radio', { name: /Lv\.100/ }).click()
  await expect(sheet.getByText('Lv.100', { exact: true }).last()).toBeVisible()
  await shot(page, 'pvp-sheet-lv100')
  await sheet.getByRole('button', { name: 'Send challenge' }).click()
  await expect.poll(() => sent).toEqual([{ p_friend: MISTY, p_mode: 'classic', p_level: 100 }])
  await expect(page.getByText('Lv.100', { exact: true }).first()).toBeVisible()
})

test('battle tickets: the sheet says the cost; with none, SEND is off and says why', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, save(), { pvp_home: { current: null, records: [], history: [], tickets: TICKETS(0) } })
  await page.goto('/friends')
  await battleMisty(page)
  const sheet = page.getByRole('dialog', { name: 'Challenge Misty' })
  await expect(sheet.getByText(/No battle ticket left/)).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Send challenge' })).toBeDisabled()
  await shot(page, 'pvp-no-ticket')
})

test('battle tickets: the page counts them; the Friend Market sells them, credited at once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const DAY = new Date().toISOString().slice(0, 10)
  const WEEK = marketWeek(DAY)
  const bought: unknown[] = []
  await boot(
    page,
    save(),
    {
      friendship_status: () => ({
        day: DAY,
        week: WEEK,
        shiny: marketShiny(WEEK, data),
        balance: 120,
        earned: 0,
        total: 120,
        streaks: [],
        today: [],
        bought: {},
        pending: [],
      }),
      friend_market_buy: (body: unknown) => {
        bought.push(body)
        return { id: 'b1', key: 'battle-ticket', gifts: [], balance: 110, tickets: 3 }
      },
    },
    { ...ON, friendship: { ...data.config.friendship, access: 'all' } },
  )
  await page.goto('/battles')
  const card = page.getByRole('region', { name: 'Battle tickets' })
  await expect(card.getByRole('img', { name: '2 battle tickets' })).toBeVisible()
  await expect(card).toContainText('+1 at midnight')
  await shot(page, 'pvp-tickets-card')
  await card.getByRole('button', { name: 'Buy more' }).click()
  await expect(page).toHaveURL(/\/market$/)
  const ticket = page.getByTestId('market-battle-ticket')
  await expect(ticket).toContainText('Battle ticket')
  await expect(ticket).toContainText('You hold 2')
  await shot(page, 'pvp-market-ticket')
  await ticket.getByRole('button', { name: 'Buy 1 for 10 Heart Scales' }).click()
  await expect.poll(() => bought).toEqual([{ p_key: 'battle-ticket', p_qty: 1 }])
  await expect(page.getByText('+1 battle tickets!')).toBeVisible()
  await expect(ticket).toContainText('You hold 3')
  // Nothing to open: the server holds them.
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test("switched off: no BATTLE on the page or in a friend's card, the page goes back to Friends", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const calls = await boot(page, save(), {}, EVENTS_ON)
  await page.goto('/friends')
  await expect(page.getByText('Misty')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Battle Misty' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Friend Battles/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^Misty,/ }).click()
  await expect(page.getByRole('dialog', { name: 'Misty' })).toContainText('Friends since')
  await expect(page.getByTestId('friend-battle')).toHaveCount(0)
  await page.goto('/battles')
  await expect(page).toHaveURL(/\/friends$/)
  expect(calls.filter((c) => c.includes('/rpc/pvp_'))).toEqual([])
})
