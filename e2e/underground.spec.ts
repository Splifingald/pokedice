// The Underground (docs/34): a live event of its own type, its switch on, reaching the game as content (a newer
// configVersion from the content cache), on the server's clock. Its rules on its page until GOT IT, Home's square with the kits,
// the page, a wall dug to its haul (a plate, an orb), the resumed wall, the orb sold solo for a tenth after a warning,
// the pickaxe striking where tapped, the Mart's Explorakits; a phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_CONFIG,
  newLiveEvent,
  type LiveEvent,
  type SaveData,
  type UndergroundSave,
} from '../src/engine'
import {
  FAST,
  fakeSession,
  makeSave,
  mockSupabase,
  nonJerseyText,
  smallControls,
  STORAGE_KEY,
  SUPABASE,
  type SupabaseMock,
} from './helpers'

const NOW = '2027-04-22T12:00:00.000Z'
const START = '2027-04-20T18:00:00.000Z'
const END = '2027-04-24T18:00:00.000Z'
const VERSION = 990_031
const SHOTS = process.env.UG_SHOTS

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
const FILES = {
  pokemon: 'pokemon.json',
  typeChart: 'type-chart.json',
  diceTypes: 'dice-types.json',
  areas: 'areas.json',
  trainers: 'trainers.json',
  upgrades: 'upgrades.json',
  items: 'items.json',
  config: 'config.json',
  regions: 'regions.json',
  eggGroups: 'egg-groups.json',
}

const dig: LiveEvent = { ...newLiveEvent('ug', START, END), type: 'underground', minBadges: 0 }

async function boot(page: Page, save: SaveData, opts: { session?: boolean; rpc?: SupabaseMock['rpc'] } = {}) {
  await mockSupabase(page, { rpc: { event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }), ...opts.rpc } })
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
    await new Promise((r) => setTimeout(r, 400))
    const object = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = object ? { value: VERSION } : [{ value: VERSION }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const bundle = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)]))
  bundle.config = {
    ...bundle.config,
    configVersion: VERSION,
    liveEvents: { access: 'all', list: [dig] },
    underground: { ...DEFAULT_CONFIG.underground, access: 'all' },
  }
  await page.addInitScript(
    ([s, f, b, v, key, session]) => {
      if (session) localStorage.setItem(key!, session)
      else localStorage.removeItem(key!)
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      const req = indexedDB.open('pokedice', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('content')
      req.onsuccess = () => {
        const db = req.result
        db.transaction('content', 'readwrite')
          .objectStore('content')
          .put({ version: Number(v), build: 'e2e', bundle: JSON.parse(b!) }, 'remote')
      }
    },
    [
      JSON.stringify(save),
      FAST,
      JSON.stringify(bundle),
      String(VERSION),
      STORAGE_KEY,
      opts.session ? JSON.stringify(fakeSession()) : '',
    ],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

/** A save already in the event, its rules seen, with an open 3 × 3 wall one layer deep hiding an orb and a plate. */
function inEvent(gold = 20_000, patch: Partial<UndergroundSave> = {}): SaveData {
  const underground: UndergroundSave = {
    eventId: 'ug',
    freeKits: 2,
    freeAt: Date.parse(NOW) + 5 * 3_600_000,
    boughtKits: 0,
    boughtCount: 0,
    pickaxe: 0,
    bag: { red: { s: 0, m: 0, l: 0 }, blue: { s: 0, m: 0, l: 0 }, green: { s: 0, m: 0, l: 0 } },
    wall: {
      id: 'ug:1',
      cols: 3,
      rows: 3,
      depth: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      things: [
        { kind: 'orbS', x: 0, y: 0, w: 1, h: 1, colour: 'red' },
        { kind: 'plate', x: 2, y: 2, w: 1, h: 1, plate: 'fire' },
      ],
      strikes: 15,
      used: 0,
      neighbourLoss: 1,
    },
    walls: 1,
    hauls: [],
    rulesSeen: true,
    ...patch,
  }
  return makeSave(4, {
    player: { name: 'Sam', character: 'red' },
    gold,
    underground,
    events: { liveSeen: ['ug'] },
  } as Partial<SaveData>)
}

test('its rules on its page until GOT IT, Home’s square with the kits, the page', async ({ page }) => {
  await boot(page, makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 500 }))
  await page.goto('/underground')
  // Its rules where they apply (docs/43 §7): a card at the top of its page, never a pop-up there.
  const card = page.getByRole('region', { name: 'How The Underground works' })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.getByText('Explorakits', { exact: true })).toBeVisible()
  await expect(card.getByText(/3 free every 24 h \(up to 3\)/)).toBeVisible()
  await expect(card.getByText(/your pickaxe die digs that many layers/)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await shot(page, 'rules')
  // Opening the page isn't reading them.
  await page.waitForTimeout(500)
  expect((await stored(page)).events?.liveSeen ?? []).toEqual([])
  await card.getByRole('button', { name: 'Got it' }).click()
  await expect(card).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).events?.liveSeen).toEqual(['ug'])
  expect((await stored(page)).underground?.rulesSeen).toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: 'The Underground' })).toBeVisible()
  await expect(page.getByTestId('ug-kits')).toContainText('3')
  await expect(page.getByText('Free kits full: dig to start the clock')).toBeVisible()
  await expect(page.getByText('Lv.0 / 8 · this event only')).toBeVisible()
  await shot(page, 'page')

  await page.goto('/home')
  const square = page.getByRole('button', {
    name: /^Live event: The Underground, Explorakits: 3\. Ends in 2d [56]h\. Open the Underground$/,
  })
  await expect(square).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('dialog', { name: 'The Underground' })).toHaveCount(0)
  await shot(page, 'home')
  await square.click()
  await expect(page).toHaveURL(/\/underground$/)
  await expect(page.getByRole('region', { name: 'How The Underground works' })).toHaveCount(0)
})

test('a wall dug to its haul: the plate for Arceus, an orb in the bag', async ({ page }) => {
  await boot(page, inEvent())
  await page.goto('/underground')
  await page.getByRole('button', { name: 'Resume the wall' }).click({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/underground\/dig$/)
  await expect(page.getByRole('meter', { name: 'Strikes before the wall collapses' })).toHaveAttribute(
    'aria-valuenow',
    '15',
  )
  await shot(page, 'dig-start')
  await page.getByRole('button', { name: 'Row 1, column 1: 1 layer' }).click()
  await expect(
    page.getByRole('button', { name: 'Row 1, column 1: dug out, part of the Small Red Orb' }),
  ).toBeVisible()
  // Leaving keeps the wall; it resumes where it was.
  await page.getByRole('button', { name: 'Leave for now' }).click()
  await expect(page).toHaveURL(/\/underground$/)
  await page.getByRole('button', { name: 'Resume the wall' }).click()
  await expect(page.getByRole('meter', { name: 'Strikes before the wall collapses' })).toHaveAttribute(
    'aria-valuenow',
    '14',
  )
  await page.getByRole('button', { name: 'Row 3, column 3: 1 layer' }).click()
  await expect(page.getByText('Everything dug out!')).toBeVisible()
  await shot(page, 'dig-cleared')
  await page.getByRole('button', { name: 'See the haul' }).click()
  const haul = page.getByRole('dialog', { name: '2 things dug out' })
  await expect(haul).toBeVisible()
  await expect(haul.getByText('Flame Plate')).toBeVisible()
  await expect(haul.getByText('Arceus can now turn Fire!')).toBeVisible()
  await expect(haul.getByText('Small Red Orb')).toBeVisible()
  await shot(page, 'haul')
  await expect.poll(async () => (await stored(page)).plates).toEqual(['fire'])
  const s = await stored(page)
  expect(s.underground!.bag.red.s).toBe(1)
  expect(s.underground!.wall).toBeNull()
  await haul.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/underground$/)
  await expect(page.getByText('1 / 17 found')).toBeVisible()
  // Solo, the orb sells for a tenth, said before and asked again before anything sells.
  await expect(
    page.getByRole('note').filter({ hasText: 'only 10% of their price (₽10 instead of ₽100)' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Sell for 10% · ₽10' }).click()
  const confirm = page.getByRole('dialog', { name: 'Sell for only 10%?' })
  await expect(confirm.getByText('You give up ₽90. A sale can’t be undone.')).toBeVisible()
  await shot(page, 'sell-solo')
  await confirm.getByRole('button', { name: 'Keep my orbs' }).click()
  await expect(confirm).toBeHidden()
  expect((await stored(page)).underground!.bag.red.s).toBe(1)
  const gold = (await stored(page)).gold
  await page.getByRole('button', { name: 'Sell for 10% · ₽10' }).click()
  await confirm.getByRole('button', { name: 'Sell for ₽10' }).click()
  await expect.poll(async () => (await stored(page)).gold).toBe(gold + 10)
  expect((await stored(page)).underground!.bag.red.s).toBe(0)
})

test('the pickaxe strikes where the finger lands, and the gauge cracks a slab', async ({ page }) => {
  await boot(page, inEvent())
  await page.goto('/underground/dig')
  const tile = page.getByRole('button', { name: 'Row 2, column 2: 1 layer' })
  await expect(tile).toBeVisible({ timeout: 15_000 })
  const box = (await tile.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75)
  const pick = page.locator('.ug-pick')
  await expect(pick).toHaveCount(1)
  // The pickaxe's tip sits on the spot tapped, not the tile's centre.
  const wall = (await page.locator('.ug-wall').boundingBox())!
  const spot = await pick.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  expect(Math.abs(spot.x - (box.x + box.width * 0.25))).toBeLessThan(2)
  expect(Math.abs(spot.y - (box.y + box.height * 0.75))).toBeLessThan(2)
  expect(spot.x).toBeGreaterThan(wall.x)
  await expect(page.getByRole('meter', { name: 'Strikes before the wall collapses' })).toHaveAttribute(
    'aria-valuenow',
    '14',
  )
  await expect(page.locator('.ug-slab.broken')).toHaveCount(1)
  await expect(page.locator('.ug-slab')).toHaveCount(15)
  await shot(page, 'dig-strike')
})

test('the Mart sells Explorakits while it runs', async ({ page }) => {
  await boot(page, inEvent(5_000, { wall: null }))
  await page.goto('/shop')
  const section = page.getByRole('region', { name: 'The Underground' })
  await expect(section).toBeVisible({ timeout: 15_000 })
  await expect(section.getByText('Explorakit', { exact: true })).toBeVisible()
  await section.getByRole('button', { name: 'Buy ₽1,000' }).click()
  await expect.poll(async () => (await stored(page)).underground?.boughtKits).toBe(1)
  expect((await stored(page)).gold).toBe(4_000)
  await shot(page, 'mart')
})

test('a phone: the page, the dig and the haul fit, Jersey only, 44 px controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, inEvent())
  await page.goto('/underground')
  await expect(page.getByTestId('ug-kits')).toBeVisible({ timeout: 15_000 })
  expect(await nonJerseyText(page), 'page: fonts').toEqual([])
  expect(await smallControls(page), 'page: controls under 44px').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await shot(page, 'phone-page')
  await page.getByRole('button', { name: 'Resume the wall' }).click()
  await expect(page.getByRole('meter', { name: 'Strikes before the wall collapses' })).toBeVisible()
  expect(await nonJerseyText(page), 'dig: fonts').toEqual([])
  expect(await smallControls(page), 'dig: controls under 44px').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await shot(page, 'phone-dig')
})

test('signed in, in a full team: a teammate’s orb arrives, the orbs sell, a finished wall’s orbs go to the server', async ({
  page,
}) => {
  const me = '11111111-2222-4333-8444-555555555555'
  const sent: unknown[] = []
  const applied: unknown[] = []
  const team = {
    event: 'ug',
    team: 't1',
    me: 'red',
    seats: [
      { colour: 'red', id: me, name: 'Sam' },
      { colour: 'blue', id: 'u2', name: 'Dawn' },
      { colour: 'green', id: 'u3', name: 'Barry' },
    ],
    invites: [],
    sent: [],
  }
  const save = inEvent(1_000, {
    wall: null,
    outbox: [{ wallId: 'ug:0', orbs: [{ colour: 'blue', size: 'm', to: 'u2' }] }],
  })
  await boot(page, save, {
    session: true,
    rpc: {
      ug_team: team,
      ug_inbox: [{ id: 'g1', from: 'Dawn', orbs: [{ colour: 'red', size: 'l' }] }],
      ug_applied: (body: Record<string, unknown>) => {
        applied.push(body)
        return null
      },
      ug_send: (body: Record<string, unknown>) => {
        sent.push(body)
        return 1
      },
      ug_can_sell: true,
    },
  })
  await page.goto('/underground')
  await expect(page.getByTestId('ug-kits')).toBeVisible({ timeout: 15_000 })
  const seats = page.getByRole('region', { name: 'Your team' })
  await expect(seats.getByText('Dawn')).toBeVisible()
  await expect(seats.getByText('Barry')).toBeVisible()
  // Dawn's large red orb lands once; the owed wall leaves the outbox.
  await expect.poll(async () => (await stored(page)).underground?.bag.red.l).toBe(1)
  expect(applied).toEqual([{ p_ids: ['g1'] }])
  expect(sent).toEqual([{ p_wall: 'ug:0', p_orbs: [{ colour: 'blue', size: 'm' }] }])
  await expect.poll(async () => (await stored(page)).underground?.outbox).toEqual([])
  await shot(page, 'team')
  await page.getByRole('button', { name: 'Sell orbs · ₽800' }).click()
  await expect.poll(async () => (await stored(page)).gold).toBe(1_800)
  expect((await stored(page)).underground!.bag.red.l).toBe(0)
})
