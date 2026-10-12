// Small worlds (docs/21): the admin's world reaches the game as content (a newer configVersion, served from the content
// cache the way a player gets it the second time), with its region and areas, on the server's clock. Its pop-up and
// square, the partner pick, Home inside (the strip, its squares, its Mart, Upgrades, an event's page), a battle there
// (dice by level, the booster), the final fight and the catch that goes home, the closing, and a phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  catchWorldMythical,
  compileGameData,
  emptyProgress,
  enterWorld,
  newSmallWorld,
  type Area,
  type BundleRaw,
  type Region,
  type SaveData,
  type SmallWorld,
} from '../src/engine'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls, STORAGE_KEY, SUPABASE } from './helpers'

const NOW = '2027-04-22T12:00:00.000Z'
const START = '2027-04-18T18:00:00.000Z'
const END = '2027-04-28T18:00:00.000Z'
const AFTER = '2027-04-29T12:00:00.000Z'
const VERSION = 990_101

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

const REGION: Region = {
  id: 'world-mirage',
  name: 'Mirage Island',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [92],
  starterLevel: 5,
  leagueAreaId: 'e2e-lair',
  nextRegion: null,
  enabled: false,
}
const base = load('areas.json') as Area[]
const route1 = base.find((a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto')!
const area = (id: string, name: string, order: number): Area => ({
  ...route1,
  id,
  name,
  regionId: REGION.id,
  orderIndex: 9000 + order,
  roundsToClear: 1,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
})
const AREAS = [area('e2e-marsh', 'Mirage Marsh', 1), area('e2e-path', 'Twilight Path', 2), area('e2e-lair', 'Dream Peak', 3)]

const WORLD: SmallWorld = {
  ...newSmallWorld('mirage', REGION.id, START, END),
  title: { en: 'Mirage Island' },
  banner: 'flowers',
  theme: { main: '#5b3a9e', accent: '#ff6f9c', ground: '#efe6fb' },
  minBadges: 0,
  starters: [63, 92, 79],
  xpMultiplier: 5,
  boosters: [{ type: 'psychic', multiplier: 1.5 }],
  shop: [
    { key: 'ultra-ball', price: 150, limit: 10 },
    { key: 'great-ball', price: 60, limit: null },
  ],
  mythical: { dex: 151, level: 5, areaId: 'e2e-lair' },
  opens: { 'e2e-path': '2027-05-30T18:00:00.000Z' },
}

/** The game's own content with the world in it, switched on for everyone (the wheel too, to see its page inside). */
function bundle(): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  const events = (b.config as { events?: Record<string, Record<string, unknown>> }).events ?? {}
  return {
    ...b,
    areas: [...b.areas, ...AREAS],
    regions: [...(b.regions ?? []), REGION],
    config: {
      ...b.config,
      configVersion: VERSION,
      smallWorlds: { access: 'all', list: [WORLD] },
      events: { ...events, wheel: { ...events.wheel, access: 'all' } },
    },
  }
}
const DATA = compileGameData(bundle())

/**
 * The game boots on its bundle, asks for the content version, finds a newer one and plays it from the content cache.
 * The server's clock says `now`.
 */
async function boot(page: Page, save: SaveData, now = NOW, settings = FAST) {
  await mockSupabase(page, { rpc: { event_time: () => ({ now, day: now.slice(0, 10) }) } })
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
    await new Promise((r) => setTimeout(r, 300))
    const object = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = object ? { value: VERSION } : [{ value: VERSION }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.addInitScript(
    ([s, f, b, v, key]) => {
      localStorage.removeItem(key!)
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      const req = indexedDB.open('pokedice', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('content')
      req.onsuccess = () => {
        const db = req.result
        db.transaction('content', 'readwrite').objectStore('content').put({ version: Number(v), bundle: JSON.parse(b!) }, 'remote')
      }
    },
    [JSON.stringify(save), settings, JSON.stringify(bundle()), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const kanto = () => makeSave(4, { player: { name: 'Sam', character: 'red' } })
let n = 0
const id = () => `e2e-w-${++n}`

/** A save already inside the world on its partner (Gastly unless said), `patch` over the world's block. */
function inside(patch: (s: SaveData) => SaveData = (s) => s, partner = 92): SaveData {
  const s = enterWorld({ ...kanto(), events: { worldSeen: ['mirage'] } }, DATA, WORLD, partner, Date.parse(NOW), id)!
  return patch(s)
}

/** Click the first visible, enabled button among `names`. */
async function clickAny(page: Page, names: (string | RegExp)[]): Promise<boolean> {
  for (const name of names) {
    const btn = page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name }).first()
    if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
      await btn.click()
      return true
    }
  }
  return false
}

test('the world opens: its pop-up, the partner pick, Home inside, its Mart and Upgrades, then back to Kanto', async ({ page }) => {
  await boot(page, kanto())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Mirage Island' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await expect(pop.getByText('XP ×5')).toBeVisible()
  await expect(pop.getByText('Dice follow the level')).toBeVisible()
  await expect(pop.getByText('Psychic ×1.5')).toBeVisible()
  await expect(pop.getByText('A shiny Mew at the end')).toBeVisible()
  await expect(pop.getByText(/^6d \d+h left · until /)).toBeVisible()
  await pop.getByRole('button', { name: 'Enter' }).click()

  // The fresh start: the lab, three partners.
  const lab = page.getByRole('dialog', { name: 'Pick your partner in Mirage Island' })
  await expect(lab).toBeVisible()
  await lab.getByRole('button', { name: 'Poké Ball 2 of 3' }).click()
  await lab.getByRole('button', { name: 'Pick Gastly' }).click()
  await lab.getByRole('button', { name: /let's go/i }).click()
  await expect(lab).toHaveCount(0)

  // Inside: its strip, its first area, its squares; no main-game square.
  await expect(page.getByRole('button', { name: 'Back to Kanto' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Exploring Mirage Marsh' })).toBeAttached()
  await expect(page.getByRole('button', { name: /^The shiny Mew, Lv\.5: In Dream Peak$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^World Mart: ₽0 of the world's own ₽\. Open$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Day Care/ })).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).region).toBe(REGION.id)
  let s = await stored(page)
  expect(s.box.map((p) => [p.dex, p.level])).toEqual([[92, 5]])
  expect(s.gold).toBe(0)
  expect(s.events?.world).toMatchObject({ id: 'mirage', from: 'kanto', partner: 92 })

  // Its Mart sells its list only; Upgrades explains the dice.
  await page.goto('/shop')
  await expect(page.getByRole('heading', { name: 'World Mart', level: 1 })).toBeVisible()
  await expect(page.getByText('10 of 10 left')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Sell' })).toHaveCount(0)
  await page.goto('/upgrades')
  await expect(page.getByRole('heading', { name: 'Dice follow the level here' })).toBeVisible()
  await expect(page.getByText('Lv.5 → dice level 0')).toBeVisible()
  // No event reaches inside.
  await page.goto('/events/wheel')
  await expect(page.getByRole('heading', { name: "You're in Mirage Island" })).toBeVisible()

  await page.getByRole('button', { name: 'Back to Kanto' }).click()
  await expect.poll(async () => (await stored(page)).region).toBe('kanto')
  s = await stored(page)
  expect(s.parked?.[REGION.id]?.box[0]?.dex).toBe(92)
  await page.goto('/home')
  await expect(page.getByRole('button', { name: /^Mirage Island, small world: Areas 0\/3, with Gastly\. Ends in 6d \d+h\. Enter$/ })).toBeVisible()
})

test('a battle inside: dice follow the level on the plates, the booster on a psychic hit; an area waits for its date', async ({ page }) => {
  test.setTimeout(90_000)
  // On Abra: a psychic hit lands on the marsh's Normal types (Gastly and a Rattata can't touch each other).
  const save = inside((s) => ({ ...s, areaProgress: { 'e2e-marsh': { ...emptyProgress(), cleared: true, roundsDone: 1 } } }), 63)
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Exploring Mirage Marsh' })).toBeAttached({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Back to Kanto' })).toBeVisible()
  // Twilight Path is next in the chain, but waits for its date.
  await page.getByRole('button', { name: /^Areas/ }).first().click()
  await expect(page.getByText(/^Opens .*May/).first()).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^CONTINUE/ }).first().click()
  await expect(page).toHaveURL(/\/area$/)
  for (let i = 0; i < 20 && !(await page.getByRole('img', { name: /^Dice level 0: Lv\.5 ÷ 10$/ }).first().isVisible()); i++) {
    await clickAny(page, ['FIGHT', 'GOT IT'])
    await page.waitForTimeout(150)
  }
  await expect(page.getByRole('img', { name: /^Dice level 0: Lv\.5 ÷ 10$/ }).first()).toBeVisible()
  // Abra's first psychic attack: the booster beside its damage.
  const boost = page.getByRole('img', { name: 'Psychic booster: its hits ×1.5' }).first()
  for (const until = Date.now() + 40_000; Date.now() < until && !(await boost.isVisible()); ) {
    await clickAny(page, ['ATTACK', 'SKIP ▸▸', 'SKIP TURN', 'GOT IT', 'FIGHT', 'CONTINUE'])
    await page.waitForTimeout(120)
  }
  await expect(boost).toBeVisible()
})

test('the final fight: the shiny Mew, beaten and caught, goes to the Kanto Box', async ({ page }) => {
  test.setTimeout(120_000)
  const save = inside((s) => {
    const mew2 = { id: 'mewtwo', dex: 150, level: 100, xp: 0, currentHp: 9999, caughtAt: 0 }
    const done = { ...emptyProgress(), cleared: true, roundsDone: 1 }
    return {
      ...s,
      box: [...s.box, mew2],
      team: ['mewtwo', ...s.team],
      inventory: { ...s.inventory, 'master-ball': 1 },
      currentAreaId: 'e2e-lair',
      areaProgress: { 'e2e-marsh': done, 'e2e-path': done, 'e2e-lair': { ...emptyProgress(), roundsDone: 1 } },
    }
  })
  await boot(page, save)
  await page.goto('/home')
  await page.getByRole('button', { name: /^FACE IT/ }).first().click({ timeout: 15_000 })
  const won = page.getByText('The shiny Mew is yours!')
  for (const until = Date.now() + 80_000; Date.now() < until && !(await won.isVisible()); ) {
    const master = page.getByRole('radio', { name: /^Master Ball/ })
    if (await master.isVisible().catch(() => false)) await master.check().catch(() => {})
    await clickAny(page, ['FIGHT', 'SKIP ▸▸', 'ATTACK', 'SKIP TURN', 'GOT IT', 'CATCH', 'ROLL TO CATCH', 'CONTINUE'])
    await page.waitForTimeout(120)
  }
  await expect(won).toBeVisible()
  await expect(page.getByText("It left the world with you: it's in your Kanto Box now, to keep.")).toBeVisible()
  const s = await stored(page)
  expect(s.box.some((p) => p.dex === 151)).toBe(false)
  expect(s.parked?.kanto?.box.find((p) => p.dex === 151)).toMatchObject({ shiny: true, level: 5 })
  expect(s.events?.world?.caught).toBe(true)
})

test('the world closes: back in Kanto, everything of it gone but the mythical, and a pop-up once', async ({ page }) => {
  const caught = catchWorldMythical(inside(), DATA, 'e2e-lair', { dex: 151, level: 5 }, Date.parse(NOW), id)!.save
  await boot(page, caught, AFTER)
  await page.goto('/home')
  const bye = page.getByRole('dialog', { name: 'Mirage Island has closed' })
  await expect(bye).toBeVisible({ timeout: 15_000 })
  await expect(bye.getByText('You kept a shiny Mew')).toBeVisible()
  await expect(bye.getByText("Gastly, the world's Pokémon, items and ₽ closed with it.")).toBeVisible()
  await bye.getByRole('button', { name: 'OK' }).click()
  await expect(bye).toHaveCount(0)
  // The save is written a moment later.
  await expect.poll(async () => (await stored(page)).events?.worldBye).toEqual(['mirage'])
  const s = await stored(page)
  expect(s.region).toBe('kanto')
  expect(s.parked?.[REGION.id]).toBeUndefined()
  expect(s.events?.world).toBeUndefined()
  expect(s.events?.worldBye).toEqual(['mirage'])
  expect(s.box.find((p) => p.dex === 151)).toMatchObject({ shiny: true })
  await expect(page.getByRole('button', { name: /small world/ })).toHaveCount(0)
})

/** Nothing scrolls sideways, every word in Jersey; on the page itself (`controls`), no control under 44px. */
const phone = async (page: Page, controls = true) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await nonJerseyText(page)).toEqual([])
  if (!controls) return
  // The content swap's "Content updated" toast (166×44) goes first: it isn't the page's.
  await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
  expect(await smallControls(page)).toEqual([])
}

test('a 360×640 phone: the pop-up and the square fit, in Jersey, the square with big enough controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, kanto())
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Mirage Island' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  // The pop-up is the game's own dialog (its buttons as every pop-up's): inside the screen, in Jersey.
  const box = (await pop.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(360)
  await phone(page, false)
  await pop.getByRole('button', { name: 'Later' }).click()
  await expect(page.getByRole('button', { name: /small world/ })).toBeVisible()
  await phone(page)
})

test('a 360×640 phone inside: Home and its Mart fit, in Jersey, with big enough controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, inside())
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Exploring Mirage Marsh' })).toBeAttached({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Back to Kanto' })).toBeVisible()
  await phone(page)
  await page.goto('/shop')
  await expect(page.getByRole('heading', { name: 'World Mart', level: 1 })).toBeVisible()
  await phone(page)
})
