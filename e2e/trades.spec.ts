// Trades (docs/23) against the mocked Supabase, on a phone: the rules at the top of the page until GOT IT; a poster lists a Pokémon, then
// finds it taken while away (back Home, "Trade done!" plays by itself, then what arrived; the Done list plays it
// again); a listing taken while you play shows up when you come back Home; a taker trades for a listing from the
// board; a guest sees the connect prompt and the newest listings; a shared link opens the listing, signed out too.
// With Johto started too, a Pokémon both Pokédexes list asks where it goes (on the confirm for a taker, at the end of
// "Trade done!" for a poster), and one above that region's best waits there, locked (docs/23 §1.4).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  badgeCase,
  compileGameData,
  createInstance,
  DEFAULT_CONFIG,
  listOut,
  newRegionBlock,
  progressOf,
  startRegion,
  switchRegion,
  type BundleRaw,
  type PokemonInstance,
  type SaveData,
} from '../src/engine'
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

/** The same save with Johto started on its Lv.5 starter (parked, Kanto live). The helpers' data is Kanto alone. */
function withJohto(save: SaveData): SaveData {
  const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
  const full = compileGameData({
    pokemon: load('pokemon.json'),
    typeChart: load('type-chart.json'),
    diceTypes: load('dice-types.json'),
    areas: load('areas.json'),
    trainers: load('trainers.json'),
    upgrades: load('upgrades.json'),
    items: load('items.json'),
    config: load('config.json'),
    regions: load('regions.json'),
    eggGroups: load('egg-groups.json'),
  } as BundleRaw)
  const johto = full.regions.find((r) => r.id === 'johto')!
  let c = 0
  const block = newRegionBlock(johto, johto.starters[0]!, full, NOW, () => `e2e-j-${++c}`, createInstance)
  return switchRegion(startRegion(save, johto, block), 'kanto')
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

test('a poster: the rules on the page, a listing posted, then taken while away', async ({ page }) => {
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
  await page.goto('/trades')

  // Trades are open: their rules where they apply (docs/43 §7), a card at the top of the page until GOT IT.
  const rules = page.getByRole('region', { name: 'How Trades works' })
  await expect(rules.getByText('You lose the one you trade')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Trades', level: 1 })).toBeAttached()
  const seen = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').trades?.rulesSeen)
  await page.waitForTimeout(800)
  expect(await seen()).toBeFalsy()
  await rules.getByRole('button', { name: 'GOT IT' }).click()
  await expect(rules).toHaveCount(0)
  await expect.poll(seen).toBe(true)
  await expect(page.getByTestId('trade-board').getByText('Charmander')).toBeVisible()
  await fitsThePhone(page)
  expect(await seriousAxe(page)).toEqual([])

  // NEW LISTING, pinned at the foot on a phone (the page's one red action), with the slots used.
  const newListing = page.getByRole('button', { name: /^New listing · 0\/4/ })
  await expect(newListing).toBeInViewport()
  await page.getByRole('tab', { name: /Mine/ }).click()
  await newListing.click()
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

  // Misty took it while we were away: back Home, the scene plays by itself ("Trade done!"), then what arrived.
  phase = 'taken'
  await page.goto('/home')
  const scene = page.getByRole('dialog', { name: 'Trade done!' })
  await expect(scene).toBeVisible()
  await expect(scene.getByText('Misty took your Pidgey.')).toBeVisible()
  await expect(scene.getByRole('img', { name: /Pidgey goes into its ball/ })).toBeVisible()
  await fitsThePhone(page)
  // The scene fades in: axe measures the colours as they are, so a half-faded caption reads under 4.5:1.
  await expect(scene).toHaveCSS('opacity', '1')
  expect(await seriousAxe(page)).toEqual([])
  await scene.getByRole('button', { name: /Skip/i }).click()
  await expect(scene.getByText('Wartortle', { exact: true })).toBeVisible()
  // Lv.12 raised to Wartortle's lowest: Squirtle evolves at 16.
  await expect(scene.getByText(/Squirtle evolves at Lv\.16/)).toBeVisible()
  await scene.getByRole('button', { name: 'Done' }).click()
  await expect(scene).toBeHidden()
  await expect.poll(() => applied.flat()).toContain('L1')

  // Watched: it doesn't play again. The Done list has it, and plays it again on a tap.
  await page.reload()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: 'Trade done!' })).toBeHidden()
  await page.goto('/trades')
  await page.getByRole('tab', { name: /Mine/ }).click()
  await page.getByRole('button', { name: /Misty took your Pidgey.*Watch the trade/ }).click()
  const again = page.getByRole('dialog', { name: 'Trade with Misty' })
  await again.getByRole('button', { name: /Skip/i }).click()
  await expect(again.getByText('Wartortle', { exact: true })).toBeVisible()
  await again.getByRole('button', { name: 'Done' }).click()
  await expect(again).toBeHidden()
})

test('a listing taken while you play: back Home, the scene', async ({ page }) => {
  const listed = mon('e2e-pidgey', 16, 12)
  const base = trader(4, 12)
  const save = listOut(
    { ...base, trades: { out: [], done: [], rulesSeen: true } },
    data,
    'e2e-pidgey',
    { id: 'L2', code: 'EF56GH78', endsAt: NOW + 3 * 86_400_000, want: { kind: 'any' }, visibility: 'public' },
    NOW,
  )!
  let taken = false
  const mineRow = () => ({
    id: 'L2',
    code: 'EF56GH78',
    role: 'owner',
    status: taken ? 'taken' : 'open',
    mon: listed,
    from_region: 'kanto',
    want: { kind: 'any' },
    visibility: 'public',
    created_at: iso(NOW),
    ends_at: iso(NOW + 3 * 86_400_000),
    taker_mon: taken ? mon('brock-onix', 95, 20) : null,
    with: taken ? 'Brock' : '',
  })
  await page.clock.install({ time: NOW })
  await boot(page, save, { rpc: { trade_board: [], trade_mine: () => [mineRow()], trade_applied: null } })
  await page.goto('/trades')
  await page.getByRole('tab', { name: /Mine/ }).click()
  await expect(page.getByTestId('trade-slots').getByText('Pidgey')).toBeVisible()

  // Brock takes it while we're still in the game; a minute on, we go back Home.
  taken = true
  await page.clock.fastForward(61_000)
  await page.getByRole('link', { name: 'Home', exact: true }).first().click()
  const scene = page.getByRole('dialog', { name: 'Trade done!' })
  await expect(scene).toBeVisible()
  await expect(scene.getByText('Brock took your Pidgey.')).toBeVisible()
  await scene.getByRole('button', { name: /Skip/i }).click()
  await expect(scene.getByText('Onix', { exact: true })).toBeVisible()
  await scene.getByRole('button', { name: 'Done' }).click()
  await expect(scene).toBeHidden()
})

test('a taker: from the board to the picker, the confirm, the scene', async ({ page }) => {
  // A Lv.30 in the Box: Charmander Lv.22 arrives at once (above the region's best, it would wait, locked).
  const kanto = trader(1, 22)
  const save = { ...kanto, box: [...kanto.box, mon('e2e-ace', 9, 30)] }
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
  // The scene (it plays in full here: these saves keep animations on), skipped.
  const scene = page.getByRole('dialog', { name: 'Trade with Sora' })
  await expect(scene.getByRole('img', { name: /Pidgey goes into its ball/ })).toBeVisible()
  await scene.getByRole('button', { name: /Skip/i }).click()
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
  // Social's strip has no Trades view.
  await page.goto('/friends')
  const strip = page.getByRole('navigation', { name: 'Social' })
  await expect(strip.getByRole('link', { name: /^Friends/ })).toBeVisible()
  await expect(strip.getByRole('link', { name: /^Trades/ })).toHaveCount(0)
})

test('PC: the board, and your listings beside it with NEW LISTING on top', async ({ page }) => {
  const save = trader(4, 12, { trades: { out: [], done: [], rulesSeen: true } } as Partial<SaveData>)
  await boot(page, save, { rpc: { trade_board: [row(), row({ id: 'L2', dex: 25, want: { kind: 'any' } })] } })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/trades')
  await expect(page.getByTestId('trade-board').getByText('Charmander')).toBeVisible()
  const side = page.getByRole('complementary')
  await expect(side.getByRole('heading', { name: 'Mine' })).toBeVisible()
  await expect(side.getByRole('button', { name: /^New listing · 0\/4/ })).toBeVisible()
  await expect(side.getByTestId('trade-slots')).toBeVisible()
  // No tabs on PC: both are on screen.
  await expect(page.getByRole('tab', { name: /Mine/ })).toHaveCount(0)
  expect(await seriousAxe(page)).toEqual([])
})

test('a taker with Johto started picks the Box on the confirm; above Johto’s best it waits there, locked', async ({
  page,
}) => {
  // A Lv.40 in Kanto: Pikachu Lv.22 could play there at once. Johto has only its Lv.5 starter.
  const kanto = trader(1, 22)
  const save = withJohto({ ...kanto, box: [...kanto.box, mon('e2e-ace', 9, 40)] })
  await boot(page, { ...save, trades: { out: [], done: [], rulesSeen: true } }, {
    rpc: {
      trade_board: [row({ dex: 25 })],
      trade_mine: [],
      trade_take: { id: 'L-sora', listed: mon('sora-pikachu', 25, 9), given: mon('e2e-pidgey', 16, 22), with: 'Sora' },
      trade_applied: null,
    },
  })
  await page.goto('/trades')
  await page.getByTestId('trade-board').getByRole('button', { name: /Pikachu/ }).click()
  await expect(page.getByText('Lands in the Box you pick: Kanto, Johto')).toBeVisible()
  await page.getByRole('button', { name: 'Trade', exact: true }).click()
  await page.getByTestId('trade-picker').getByRole('button', { name: /Pidgey/ }).click()

  // The pick starts on Kanto, where it plays now; Johto says it would wait, locked.
  const pick = page.getByRole('radiogroup', { name: 'Where Pikachu goes' })
  await expect(pick.getByRole('radio', { name: /Kanto/ })).toHaveAttribute('aria-checked', 'true')
  await expect(pick.getByRole('radio', { name: /Johto/ })).toContainText('Locked until one of yours there reaches Lv.22')
  await fitsThePhone(page)
  expect(await seriousAxe(page)).toEqual([])
  await pick.getByRole('radio', { name: /Johto/ }).click()
  await expect(pick.getByRole('radio', { name: /Johto/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/Your best in Johto is Lv\.5/)).toBeVisible()
  await page.getByRole('button', { name: 'Trade', exact: true }).click()

  const scene = page.getByRole('dialog', { name: 'Trade with Sora' })
  await scene.getByRole('button', { name: /Skip/i }).click()
  await expect(scene.getByText(/It waits in your Johto Box, locked until one of your Pokémon there reaches Lv\.22/)).toBeVisible()
  await scene.getByRole('button', { name: 'Done' }).click()
  const waiting = () =>
    page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').events?.worldHome ?? []) as {
          region: string
          tradedBy?: string
          inst: { dex: number; level: number }
        }[],
    )
  await expect.poll(waiting).toEqual([
    expect.objectContaining({ region: 'johto', tradedBy: 'Sora', inst: expect.objectContaining({ dex: 25, level: 22 }) }),
  ])
})

test('a poster with Johto started picks the Box at the end of "Trade done!"', async ({ page }) => {
  const listed = mon('e2e-pidgey', 16, 12)
  const kanto = trader(4, 12)
  const base = withJohto({ ...kanto, box: [...kanto.box, mon('e2e-ace', 9, 40)] })
  const save = listOut(
    { ...base, trades: { out: [], done: [], rulesSeen: true } },
    data,
    'e2e-pidgey',
    { id: 'L3', code: 'JK12LM34', endsAt: NOW + 3 * 86_400_000, want: { kind: 'any' }, visibility: 'public' },
    NOW,
  )!
  await boot(page, save, {
    rpc: {
      trade_board: [],
      trade_mine: [
        {
          id: 'L3',
          code: 'JK12LM34',
          role: 'owner',
          status: 'taken',
          mon: listed,
          from_region: 'kanto',
          want: { kind: 'any' },
          visibility: 'public',
          created_at: iso(NOW),
          ends_at: iso(NOW + 3 * 86_400_000),
          taker_mon: mon('misty-pikachu', 25, 30),
          with: 'Misty',
        },
      ],
      trade_applied: null,
    },
  })
  await page.goto('/home')
  const scene = page.getByRole('dialog', { name: 'Trade done!' })
  await expect(scene).toBeVisible()
  await scene.getByRole('button', { name: /Skip/i }).click()

  // The pick, before the result: Kanto first (it plays there now), Johto locked. Esc doesn't put it off.
  await expect(scene.getByText('Where does Pikachu go?')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(scene).toBeVisible()
  const pick = scene.getByRole('radiogroup', { name: 'Where Pikachu goes' })
  await expect(pick.getByRole('radio', { name: /Kanto/ })).toHaveAttribute('aria-checked', 'true')
  await expect(pick.getByRole('radio', { name: /Johto/ })).toContainText('LOCKED')
  await fitsThePhone(page)
  expect(await seriousAxe(page)).toEqual([])
  await scene.getByRole('button', { name: 'Send it there' }).click()
  await expect(scene.getByText(/It joined your Kanto Box, and your Pokédex/)).toBeVisible()
  await scene.getByRole('button', { name: 'Done' }).click()
  await expect(scene).toBeHidden()
  const stored = () =>
    page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('pokedice.save') ?? '{}')
      return { landing: s.trades?.landing ?? null, pikachu: (s.box as { dex: number }[]).some((p) => p.dex === 25) }
    })
  await expect.poll(stored).toEqual({ landing: null, pikachu: true })

  // Picked: it doesn't ask again.
  await page.reload()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: 'Trade done!' })).toBeHidden()
})
