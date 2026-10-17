// The Underground (docs/31): a live event of its own type, its switch on, reaching the game as content (a newer
// configVersion from the content cache), on the server's clock. Its rules pop-up once, Home's square with the kits,
// the page, a wall dug to its haul (a plate, an orb), the resumed wall, the Mart's Explorakits; a phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_CONFIG,
  newLiveEvent,
  type LiveEvent,
  type SaveData,
  type UndergroundSave,
} from '../src/engine'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls, STORAGE_KEY, SUPABASE } from './helpers'

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

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page, { rpc: { event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }) } })
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
    ([s, f, b, v, key]) => {
      localStorage.removeItem(key!)
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
    [JSON.stringify(save), FAST, JSON.stringify(bundle), String(VERSION), STORAGE_KEY],
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

test('its rules once, Home’s square with the kits, the page', async ({ page }) => {
  await boot(page, makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 500 }))
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'The Underground' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText('Explorakits', { exact: true })).toBeVisible()
  await expect(pop.getByText(/3 free kits every 24 h \(up to 3 waiting\)/)).toBeVisible()
  await expect(pop.getByText(/6×6 tiles, 1 to 3 layers deep/)).toBeVisible()
  await shot(page, 'rules')
  await pop.getByRole('button', { name: "Let's go!" }).click()
  await expect(page).toHaveURL(/\/underground$/)
  await expect.poll(async () => (await stored(page)).events?.liveSeen).toEqual(['ug'])
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
  await expect(pop).toBeHidden()
  await shot(page, 'home')
  await square.click()
  await expect(page).toHaveURL(/\/underground$/)
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
  await expect(page.getByRole('button', { name: 'Selling opens in a team of 3' })).toBeVisible()
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
