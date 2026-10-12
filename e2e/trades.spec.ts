// Trades (docs/23) against the mocked Supabase, on a phone: the rules pop-up once; a poster lists a Pokémon, then
// finds it taken while away ("Trade done!", the scene, what arrived); a taker trades for a listing from the board; a
// guest sees the connect prompt and the newest listings; a shared link opens the listing, signed out too.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { badgeCase, createInstance, DEFAULT_CONFIG, progressOf, type PokemonInstance, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY, type SupabaseMock } from './helpers'

const data = gameData()
const SORA = '33333333-0000-4000-8000-000000000003'
const NOW = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()
const TRADES_ON = { ...EVENTS_ON, trade: { ...DEFAULT_CONFIG.trade, access: 'all' } }

const mon = (id: string, dex: number, level: number): PokemonInstance => ({
  ...createInstance(dex, level, data, id, NOW),
})

/** Two badges (the trades' default): the region's first two gyms won. */
function withBadges(save: SaveData, n = 2): SaveData {
  let s = save
  for (const b of badgeCase(save, data).slice(0, n)) {
    const p = progressOf(s, b.areaId)
    s = { ...s, areaProgress: { ...s.areaProgress, [b.areaId]: { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] } } }
  }
  return s
}

/** A save that can trade: its starter, a Pidgey and a Rattata, two badges. */
function trader(starter: number, pidgeyLevel: number, patch: Partial<SaveData> = {}): SaveData {
  const s = makeSave(starter, { player: { name: 'Sam', character: 'red' } })
  return withBadges({
    ...s,
    box: [...s.box, mon('e2e-pidgey', 16, pidgeyLevel), mon('e2e-rattata', 19, 9)],
    pokedex: [...new Set([...s.pokedex, 16, 19])],
    ...patch,
  })
}

/** A listing row as trade_board / trade_view return it. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'L-sora',
    code: 'K7QM4XD9',
    owner: SORA,
    name: 'Sora',
    avatar: 'green',
    is_me: false,
    is_friend: false,
    dex: 4,
    level: 12,
    shiny: false,
    home_region: 'kanto',
    want: { kind: 'species', dex: 16 },
    visibility: 'public',
    created_at: iso(NOW - 3_600_000),
    ends_at: iso(NOW + 2 * 86_400_000),
    poster: { has: '', forms: [], shiny: [], regions: ['kanto'] },
    ...over,
  }
}

async function boot(page: Page, save: SaveData, mock: SupabaseMock, session = true) {
  await page.setViewportSize({ width: 390, height: 844 })
  const calls = await mockSupabase(page, mock)
  await page.addInitScript(
    ([key, sess, s, f, cfg]) => {
      if (sess) localStorage.setItem(key!, sess)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', cfg!)
      // Prof. Oak's invite (the same 2nd badge) already seen: it would go first.
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [STORAGE_KEY, session ? JSON.stringify(fakeSession()) : '', JSON.stringify(save), FAST, JSON.stringify(TRADES_ON)],
  )
  return calls
}

/** No sideways scroll on a phone. */
async function fitsThePhone(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
}

async function seriousAxe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)
}

test('a poster: the rules once, a listing posted, then taken while away', async ({ page }) => {
  const save = trader(4, 12)
  let phase: 'none' | 'open' | 'taken' = 'none'
  const posted: Record<string, unknown>[] = []
  const applied: unknown[] = []
  const mineRow = (status: string) => ({
    id: 'L1',
    code: 'AB12CD34',
    role: 'owner',
    status,
    mon: mon('e2e-pidgey', 16, 12),
    from_region: 'kanto',
    want: { kind: 'any' },
    visibility: 'public',
    created_at: iso(NOW),
    ends_at: iso(NOW + 3 * 86_400_000),
    taker_mon: status === 'taken' ? mon('misty-wartortle', 8, 34) : null,
    with: status === 'taken' ? 'Misty' : '',
  })
  await boot(page, save, {
    rpc: {
      trade_board: [row()],
      trade_mine: () => (phase === 'none' ? [] : [mineRow(phase)]),
      trade_post: (body: Record<string, unknown>) => {
        posted.push(body)
        phase = 'open'
        return { id: 'L1', code: 'AB12CD34', ends_at: iso(NOW + 3 * 86_400_000), region: 'kanto' }
      },
      trade_applied: (body: Record<string, unknown>) => {
        applied.push(body.p_ids)
        return null
      },
    },
  })
  await page.goto('/home')

  // Trades have opened: their rules, once, with a button straight there.
  const rules = page.getByRole('dialog', { name: 'Trades' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('You lose the one you trade')).toBeVisible()
  await rules.getByRole('button', { name: "Let's go!" }).click()
  await expect(page).toHaveURL(/\/trades$/)
  await expect(page.getByRole('heading', { name: 'Trades', level: 1 })).toBeVisible()
  await expect(page.getByTestId('trade-board').getByText('Charmander')).toBeVisible()
  await fitsThePhone(page)
  expect(await seriousAxe(page)).toEqual([])

  // Mine: an empty slot opens New listing.
  await page.getByRole('tab', { name: /Mine/ }).click()
  await page.getByRole('button', { name: 'New listing' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'New listing' })
  await sheet.getByRole('button', { name: 'Pidgey, Lv.12' }).click()
  await sheet.getByRole('radio', { name: 'Anything' }).click()
  await expect(sheet.getByText(/Pidgey leaves your Box now/)).toBeVisible()
  await fitsThePhone(page)
  await sheet.getByTestId('trade-post').click()
  await expect(page.getByText('Pidgey is on the trade board')).toBeVisible()
  expect(posted[0]).toMatchObject({ p_inst: 'e2e-pidgey', p_want: { kind: 'any' }, p_visibility: 'public' })
  // It left the Box and waits in a slot.
  await expect(page.getByTestId('trade-slots').getByText('Pidgey')).toBeVisible()
  // The save is written a moment later.
  const inBox = () =>
    page.evaluate(() =>
      (JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').box ?? []).some(
        (p: { id: string }) => p.id === 'e2e-pidgey',
      ),
    )
  await expect.poll(inBox).toBe(false)

  // Misty took it while we were away: the pop-up, the scene, what arrived.
  phase = 'taken'
  await page.reload()
  const pop = page.getByRole('dialog', { name: 'Trade done!' })
  await expect(pop).toBeVisible()
  await expect(pop.getByText('Misty took your Pidgey.')).toBeVisible()
  await pop.getByRole('button', { name: 'See it' }).click()
  const scene = page.getByRole('dialog', { name: 'Trade with Misty' })
  await expect(scene.getByText('Wartortle', { exact: true })).toBeVisible()
  // Lv.12 raised to Wartortle's lowest: Squirtle evolves at 16.
  await expect(scene.getByText(/Squirtle evolves at Lv\.16/)).toBeVisible()
  await scene.getByRole('button', { name: 'Done' }).click()
  await expect(scene).toBeHidden()
  await expect.poll(() => applied.flat()).toContain('L1')
  await page.getByRole('tab', { name: /Mine/ }).click()
  await expect(page.getByText('Misty took your Pidgey')).toBeVisible()
})

test('a taker: from the board to the picker, the confirm, the scene', async ({ page }) => {
  const save = trader(1, 22)
  const applied: unknown[] = []
  await boot(page, { ...save, trades: { out: [], done: [], rulesSeen: true } }, {
    rpc: {
      trade_board: [row(), row({ id: 'L-far', code: 'ZZ99ZZ99', dex: 158, home_region: 'johto', name: 'Ethan' })],
      trade_mine: [],
      trade_take: {
        id: 'L-sora',
        listed: mon('sora-charmander', 4, 12),
        given: mon('e2e-pidgey', 16, 22),
        with: 'Sora',
      },
      trade_applied: (body: Record<string, unknown>) => {
        applied.push(body.p_ids)
        return null
      },
    },
  })
  await page.goto('/trades')
  const board = page.getByTestId('trade-board')
  // A Johto Pokémon for a Kanto-only save: greyed, with why.
  await expect(board.getByText('Start Johto first')).toBeVisible()
  await board.getByRole('button', { name: /Charmander/ }).click()
  const sheet = page.getByTestId('listing-sheet')
  await expect(sheet.getByText('You have 1 Pidgey')).toBeVisible()
  await page.getByRole('button', { name: 'Trade', exact: true }).click()
  const picker = page.getByTestId('trade-picker')
  await expect(picker.getByText(/You get Charmander Lv\.22/)).toBeVisible()
  await fitsThePhone(page)
  await picker.getByRole('button', { name: /Pidgey/ }).click()
  await expect(page.getByText(/Pidgey Lv\.22 leaves your Box for good/)).toBeVisible()
  await page.getByRole('button', { name: 'Trade', exact: true }).click()
  const scene = page.getByRole('dialog', { name: 'Trade with Sora' })
  await expect(scene.getByText(/It joined your Kanto Box/)).toBeVisible()
  await scene.getByRole('button', { name: 'Done' }).click()
  await expect.poll(() => applied.flat()).toContain('L-sora')
  const box = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').box as { id: string; dex: number; level: number }[],
    )
  await expect.poll(async () => (await box()).some((p) => p.id === 'e2e-pidgey')).toBe(false)
  expect((await box()).find((p) => p.dex === 4)?.level).toBe(22)
})

test('a guest: the connect prompt and the newest listings; a shared link opens the listing', async ({ page }) => {
  const save = trader(4, 12)
  await boot(
    page,
    save,
    { rpc: { trade_board: [row(), row({ id: 'L2', dex: 25, want: { kind: 'any' } })], trade_view: row({ visibility: 'private' }) } },
    false,
  )
  await page.goto('/trades')
  await expect(page.getByText('Trade Pokémon with other trainers')).toBeVisible()
  await expect(page.getByText('On the board now')).toBeVisible()
  await expect(page.getByRole('button', { name: /Pikachu/ })).toBeVisible()
  await fitsThePhone(page)

  await page.goto('/t/k7qm-4xd9')
  await expect(page.getByTestId('listing-sheet')).toBeVisible()
  await expect(page.getByText('Sora wants to trade. Connect to take part.')).toBeVisible()
  await expect(page.getByText(/from a link/)).toBeVisible()
})

test('switched off, Trades are nowhere: no menu row, and the page goes Home', async ({ page }) => {
  const save = trader(4, 12)
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSupabase(page)
  await page.addInitScript(
    ([key, sess, s, f]) => {
      localStorage.setItem(key!, sess!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), FAST],
  )
  await page.goto('/trades')
  await expect(page).toHaveURL(/\/home$/)
  await page.getByRole('button', { name: /trainer menu/i }).click()
  await expect(page.getByRole('button', { name: 'Friends' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Trades/ })).toHaveCount(0)
})
