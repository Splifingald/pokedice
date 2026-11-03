// The race of time and space (docs/64 §4.4) in a small world served as content (as e2e/nightmare.spec.ts does): ENTER
// THE RACE plays the intro at once, held for a tap, then its pop-up (arriving heals; NOT NOW goes Home; READY! starts
// the clock on the server's time); a fork's two gates in their types, the foes of the gate taken, never caught, the clock
// on screen and in the fight; no way out but the area while it runs; the last gate decides the raid (Water: Palkia) and
// HEAL & START RAID opens it; a reload keeps the clock where it was (the save's, on the server's time); out of time while
// away, the next look ends the try; a wipe sends the player back to the start; and a 360×640 phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  DEFAULT_CONFIG,
  DEFAULT_TIME_RACE,
  emptyProgress,
  enterWorld,
  newSmallWorld,
  type Area,
  type BundleRaw,
  type Region,
  type SaveData,
  type SmallWorld,
  type TimeRaceState,
} from '../src/engine'
import { FAST, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

const NOW = '2027-04-22T12:00:00.000Z'
const T0 = Date.parse(NOW)
const VERSION = 990_404

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
  id: 'world-clock',
  name: 'Clockwork',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [92],
  starterLevel: 5,
  leagueAreaId: 'e2e-clock-road',
  nextRegion: null,
  enabled: false,
}
const route1 = (load('areas.json') as Area[]).find(
  (a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto',
)!
const ROAD: Area = {
  ...route1,
  id: 'e2e-clock-road',
  name: 'Clock Road',
  regionId: REGION.id,
  orderIndex: 9500,
  roundsToClear: 1,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
}
const PILLAR = 'e2e-clock-pillar'
/**
 * The race's area: one fork (Fire or Grass), then the last (Water: Palkia, Steel: Dialga), 2 fights after each, all at
 * `level` (Lv.3: easy; Lv.95: a wipe).
 */
const pillarArea = (level: number): Area => ({
  ...ROAD,
  id: PILLAR,
  name: 'Clock Pillar',
  orderIndex: 9501,
  hidden: true,
  unlockConditions: [{ kind: 'pokedex', count: 1 }],
  legendaryBoss: [
    { dex: 483, level: 70, shiny: true, raid: true },
    { dex: 484, level: 70, shiny: true, raid: true },
  ],
  wildPool: [
    { id: 'e2e-cp-fire', dex: 37, weight: 1, minLevel: level, maxLevel: level },
    { id: 'e2e-cp-grass', dex: 43, weight: 1, minLevel: level, maxLevel: level },
    { id: 'e2e-cp-water', dex: 129, weight: 1, minLevel: level, maxLevel: level },
    { id: 'e2e-cp-steel', dex: 81, weight: 1, minLevel: level, maxLevel: level },
  ],
  trainerPool: [],
  lootPool: [],
  mode: { ...DEFAULT_TIME_RACE, forks: [['fire', 'grass']], perFork: 2 },
})
const WORLD: SmallWorld = {
  ...newSmallWorld('clock', REGION.id, '2027-04-18T18:00:00.000Z', '2027-04-28T18:00:00.000Z'),
  title: { en: 'Clockwork' },
  minBadges: 0,
  starters: [92, 63, 79],
  boosters: [],
  mythical: { dex: 0, level: 5, areaId: '' },
}

function bundle(level: number): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  return {
    ...b,
    areas: [...b.areas, ROAD, pillarArea(level)],
    regions: [...(b.regions ?? []), REGION],
    config: {
      ...b.config,
      configVersion: VERSION,
      smallWorlds: { access: 'all', list: [WORLD] },
      timeRace: { access: 'all' },
      events: { ...DEFAULT_CONFIG.events, raid: { ...DEFAULT_CONFIG.events.raid, access: 'all' } },
    },
  }
}
const EASY = 3
const HARD = 95

async function boot(page: Page, save: SaveData, level = EASY, settings = FAST) {
  // The server's clock moves on with the test (a reload reads it again later, as live).
  const bootAt = Date.now()
  await mockSupabase(page, {
    rpc: {
      event_time: () => ({ now: new Date(T0 + Date.now() - bootAt).toISOString(), day: NOW.slice(0, 10) }),
    },
  })
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
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
        req.result
          .transaction('content', 'readwrite')
          .objectStore('content')
          .put({ version: Number(v), build: 'e2e', bundle: JSON.parse(b!) }, 'remote')
      }
    },
    [JSON.stringify(save), settings, JSON.stringify(bundle(level)), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const raceOf = (s: SaveData): TimeRaceState | undefined => s.areaProgress[PILLAR]?.timeRace
let n = 0
const id = () => `e2e-tr-${++n}`

/** Inside the world, standing on the race's area, with `team` (dex, level) as the team; `race` its state. */
function atPillar(team: [number, number][], race?: TimeRaceState): SaveData {
  const data = compileGameData(bundle(EASY))
  const s = enterWorld({ ...makeSave(4), events: { worldSeen: ['clock'] } }, data, WORLD, 92, T0, id)!
  const box = team.map(([dex, level], i) => ({
    id: `mon-${i}`,
    dex,
    level,
    xp: 0,
    currentHp: 9999,
    caughtAt: 0,
  }))
  return {
    ...s,
    box,
    team: box.map((p) => p.id),
    pokedex: [92, ...team.map(([d]) => d)],
    currentAreaId: PILLAR,
    inventory: {},
    areaProgress: { [PILLAR]: { ...emptyProgress(), ...(race && { timeRace: race }) } },
  }
}

async function clickAny(page: Page, names: (string | RegExp)[]): Promise<boolean> {
  for (const name of names) {
    const btn = page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name }).first()
    if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
      await btn.click().catch(() => {})
      return true
    }
  }
  return false
}

/** Plays on (fights, results) until `until` shows. */
async function playUntil(page: Page, until: ReturnType<Page['getByRole']>, ms = 60_000) {
  for (const end = Date.now() + ms; Date.now() < end && !(await until.isVisible().catch(() => false));) {
    await clickAny(page, [
      'FIGHT',
      'SKIP ▸▸',
      /^Send out /,
      'ATTACK',
      'SKIP TURN',
      'GOT IT',
      'CONTINUE',
      'Next ▸',
    ])
    await page.waitForTimeout(120)
  }
  await expect(until).toBeVisible()
}

/** The clock on screen, in seconds. */
async function clockSeconds(page: Page): Promise<number> {
  const name = (await page.getByRole('timer').first().getAttribute('aria-label')) ?? ''
  const m = /(\d+):(\d\d)/.exec(name)
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1
}

test('ENTER THE RACE: the intro held for a tap, its pop-up (healed, NOT NOW), READY! starts the clock; a fork’s gates, the foes of the gate taken and never caught; no way out; the Water gate opens Palkia’s raid', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const save = atPillar([[150, 100]])
  await boot(page, { ...save, box: save.box.map((p) => ({ ...p, currentHp: 10 })) })
  await page.goto('/home')
  const enter = page.getByRole('button', { name: /^Enter the race/ })
  await enter.first().click({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  // The intro at once (motion off: its end), waiting for a tap; its pop-up not up yet.
  const intro = page.getByRole('dialog', { name: 'The Race of Time and Space' })
  await expect(intro.getByText(/Time and space are torn open over Spear Pillar/)).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Into the race' })
  const tap = page.getByRole('button', { name: 'Tap to continue' })
  await expect(tap).toBeFocused()
  await expect(dialog).toBeHidden()
  // Arriving healed the team as a Pokémon Center does; nothing has started.
  await expect.poll(async () => (await stored(page)).box[0]!.currentHp > 10).toBe(true)
  expect(raceOf(await stored(page))?.active ?? false).toBe(false)
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('4 fights in 12:00')).toBeVisible()
  await expect(dialog.getByText('A fork every 2 fights: pick a type')).toBeVisible()
  await expect(dialog.getByText('The last gate: Water for Palkia, Steel for Dialga')).toBeVisible()
  await expect(dialog.getByText('No Center, no catch, no auto: one speed for all')).toBeVisible()
  await expect(dialog.locator('li')).toHaveCount(4)
  await dialog.getByRole('button', { name: 'Not now' }).click()
  await expect(page).toHaveURL(/\/home$/)

  // In again, READY!: the clock starts on the server's time, the first fork opens.
  await enter.first().click()
  await tap.click()
  await dialog.getByRole('button', { name: 'Ready!' }).click()
  await expect
    .poll(async () => raceOf(await stored(page)))
    .toMatchObject({ active: true, fights: 0, tries: 1 })
  const r = raceOf(await stored(page))!
  expect(r.deadline! - r.startedAt!).toBe(12 * 60_000)
  expect(Math.abs(r.startedAt! - T0)).toBeLessThan(60_000)
  await expect(page.getByRole('heading', { name: 'Fork 1/2: pick a gate' })).toBeVisible()
  await expect(page.getByRole('timer').first()).toBeVisible()
  expect(await clockSeconds(page)).toBeGreaterThan(11 * 60)
  await expect(page.getByRole('button', { name: /^Fire gate: / })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Grass gate: / })).toBeVisible()

  // No way out while it runs: Home sends back to the area.
  await page.goto('/home')
  await expect(page).toHaveURL(/\/area$/)

  // The Fire gate: its foes are Vulpix, and none can be caught; the clock runs in the fight too.
  await page.getByRole('button', { name: /^Fire gate: / }).click()
  await expect.poll(async () => raceOf(await stored(page))?.path).toEqual(['fire'])
  await expect(page.getByRole('timer').first()).toBeVisible()
  const last = page.getByRole('heading', { name: 'The last fork: pick your legend' })
  await playUntil(page, last)
  await expect(page.getByRole('button', { name: /^Catch|ROLL TO CATCH|Throw it$/ })).toHaveCount(0)
  expect((await stored(page)).pokedex).not.toContain(37)
  await expect(page.getByRole('button', { name: /^Water gate: .*Opens Palkia’s raid$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Steel gate: .*Opens Dialga’s raid$/ })).toBeVisible()

  // The Water gate, its two fights: time and space settle, Palkia's raid opens.
  await page.getByRole('button', { name: /^Water gate: / }).click()
  const won = page.getByRole('heading', { name: 'Time and space settle' })
  await playUntil(page, won)
  await expect(page.getByText('Shiny Palkia is now available in raids.')).toBeVisible()
  await expect
    .poll(async () => raceOf(await stored(page)))
    .toMatchObject({ active: false, won: [484], fights: 4 })
  const raidBtn = page.getByRole('button', { name: 'Heal & start raid' })
  await expect(page.getByRole('button', { name: 'Back to the world' })).toHaveClass(/frame-green/)
  await raidBtn.click()
  await expect(page).toHaveURL(new RegExp(`/raid/${PILLAR}/484$`))
})

test('a reload keeps the clock where it was (the save’s deadline, on the server’s time), held in its area on its fork', async ({
  page,
}) => {
  test.setTimeout(90_000)
  // Started 7 minutes ago: 5 minutes left, on the fork after the first two fights.
  const running: TimeRaceState = {
    active: true,
    startedAt: T0 - 7 * 60_000,
    deadline: T0 + 5 * 60_000,
    fights: 2,
    path: ['grass'],
    gates: null,
    tries: 1,
  }
  await boot(page, atPillar([[150, 100]], running))
  await page.goto('/home')
  // Held in its area: straight back to it, its fork open, the clock at about 5:00.
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('heading', { name: 'The last fork: pick your legend' })).toBeVisible()
  // (The clock shows once the server's time is read.)
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 15_000 })
  const first = await clockSeconds(page)
  expect(first).toBeGreaterThan(4 * 60)
  expect(first).toBeLessThanOrEqual(5 * 60)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The last fork: pick your legend' })).toBeVisible()
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 15_000 })
  const again = await clockSeconds(page)
  // The same clock, a few seconds on: not 12:00 again, not stopped while the page was gone.
  expect(again).toBeLessThanOrEqual(first)
  expect(again).toBeGreaterThan(first - 60)
  expect(raceOf(await stored(page))?.deadline).toBe(T0 + 5 * 60_000)
})

test('out of time while the app was closed: the next look ends the try, back to the start, its card says so', async ({
  page,
}) => {
  test.setTimeout(60_000)
  // Started 13 minutes ago, 12 on the clock: out by a minute.
  const late: TimeRaceState = {
    active: true,
    startedAt: T0 - 13 * 60_000,
    deadline: T0 - 60_000,
    fights: 2,
    path: ['grass'],
    gates: null,
    tries: 1,
  }
  await boot(page, atPillar([[150, 100]], late))
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Out of time!' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/The clock ran out after 2 of 4 fights/)).toBeVisible()
  await expect
    .poll(async () => raceOf(await stored(page)))
    .toMatchObject({ active: false, fights: 0, path: [] })
})

test('a wipe: back to the start, healed, the clock gone; a 360×640 phone fits the fork', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 360, height: 640 })
  const fork: TimeRaceState = {
    active: true,
    startedAt: T0,
    deadline: T0 + 12 * 60_000,
    fights: 0,
    path: [],
    tries: 1,
  }
  await boot(page, atPillar([[19, 3]], fork), HARD)
  await page.goto('/area')
  const heading = page.getByRole('heading', { name: 'Fork 1/2: pick a gate' })
  await expect(heading).toBeVisible({ timeout: 15_000 })
  // The two gates side by side, inside the screen.
  for (const name of [/^Fire gate: /, /^Grass gate: /]) {
    const box = (await page.getByRole('button', { name }).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  await page.getByRole('button', { name: /^Grass gate: / }).click()
  const wipe = page.getByText(/Your whole party is K\.O\. after 0 of 4 fights: back to the start of the race/)
  await playUntil(page, wipe, 90_000)
  await expect
    .poll(async () => raceOf(await stored(page)))
    .toMatchObject({ active: false, fights: 0, path: [] })
  const s = await stored(page)
  expect(s.box[0]!.currentHp).toBeGreaterThan(0)
})
