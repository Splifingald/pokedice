// Crown Shrine's whiteout (docs/64 §4.3) in a small world served as content (as e2e/nightmare.spec.ts does): ENTER THE
// BLIZZARD plays the intro at once, held at its end until a tap, then its pop-up with the short rules (arriving heals;
// TEAM and back; BRAVE THE BLIZZARD starts it); its foes come in their waves, can't be caught, and fight in the blizzard
// (its chip, the bag shut with its line); Home's Areas button is locked while the Mart stays open; a bonfire after each
// wave (its heal, TEAM, the last one before the boss); the boss caught plays the end and closes the shrine; a wipe sends
// the player back to wave 1; the switch off leaves a plain secret area; and a 360×640 phone at the bonfire.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  DEFAULT_CONFIG,
  emptyProgress,
  enterWorld,
  newSmallWorld,
  type Area,
  type BundleRaw,
  type Region,
  type SaveData,
  type SmallWorld,
  type WhiteoutFoe,
  type WhiteoutState,
} from '../src/engine'
import { FAST, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

const NOW = '2027-04-22T12:00:00.000Z'
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
  id: 'world-frost',
  name: 'Frost',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [92],
  starterLevel: 5,
  leagueAreaId: 'e2e-frost-road',
  nextRegion: null,
  enabled: false,
}
const route1 = (load('areas.json') as Area[]).find(
  (a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto',
)!
const ROAD: Area = {
  ...route1,
  id: 'e2e-frost-road',
  name: 'Frost Road',
  regionId: REGION.id,
  orderIndex: 9600,
  roundsToClear: 1,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
}
const EASY: WhiteoutFoe[][] = [
  [{ dex: 19, level: 3 }],
  [
    { dex: 19, level: 3 },
    { dex: 16, level: 3 },
  ],
]
const HARD: WhiteoutFoe[][] = [[{ dex: 19, level: 3 }], [{ dex: 248, level: 95 }]]
/** The whiteout's area: `waves` of foes, then shiny Abomasnow Lv.5 (its plain deck under it, for the switch off). */
const shrineArea = (waves: WhiteoutFoe[][]): Area => ({
  ...ROAD,
  id: 'e2e-shrine',
  name: 'Snow Shrine',
  orderIndex: 9601,
  hidden: true,
  unlockConditions: [{ kind: 'pokedex', count: 1 }],
  legendaryBoss: [{ dex: 460, level: 5, shiny: true }],
  wildPool: [{ id: 'e2e-shrine-w', dex: 19, weight: 1, minLevel: 3, maxLevel: 3 }],
  trainerPool: [],
  lootPool: [],
  mode: { kind: 'whiteout', waves, weather: 'snow', bonfirePercent: 40 },
})
const WORLD: SmallWorld = {
  ...newSmallWorld('frost', REGION.id, '2027-04-18T18:00:00.000Z', '2027-04-28T18:00:00.000Z'),
  title: { en: 'Frost' },
  minBadges: 0,
  starters: [92, 63, 79],
  boosters: [],
  mythical: { dex: 0, level: 5, areaId: '' },
}

function bundle(waves: WhiteoutFoe[][], access: 'all' | 'off' = 'all'): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  return {
    ...b,
    areas: [...b.areas, ROAD, shrineArea(waves)],
    regions: [...(b.regions ?? []), REGION],
    config: {
      ...b.config,
      configVersion: VERSION,
      smallWorlds: { access: 'all', list: [WORLD] },
      whiteout: { access },
      events: { ...DEFAULT_CONFIG.events, raid: { ...DEFAULT_CONFIG.events.raid, access: 'all' } },
    },
  }
}
const SHRINE = 'e2e-shrine'

async function boot(page: Page, save: SaveData, b: BundleRaw = bundle(EASY), settings = FAST) {
  await mockSupabase(page, { rpc: { event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }) } })
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
    const object = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = object ? { value: VERSION } : [{ value: VERSION }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.addInitScript(
    ([s, f, bb, v, key]) => {
      localStorage.removeItem(key!)
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      const req = indexedDB.open('pokedice', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('content')
      req.onsuccess = () => {
        req.result
          .transaction('content', 'readwrite')
          .objectStore('content')
          .put({ version: Number(v), build: 'e2e', bundle: JSON.parse(bb!) }, 'remote')
      }
    },
    [JSON.stringify(save), settings, JSON.stringify(b), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const whiteOf = (s: SaveData): WhiteoutState | undefined => s.areaProgress[SHRINE]?.whiteout
let n = 0
const id = () => `e2e-w-${++n}`

/** Inside the world, standing on the shrine, with `team` (dex, level) as the team; `whiteout` its state. */
function atShrine(team: [number, number][], whiteout?: WhiteoutState, rulesSeen = true): SaveData {
  const data = compileGameData(bundle(EASY))
  const s = enterWorld(
    { ...makeSave(4), events: { worldSeen: ['frost'] } },
    data,
    WORLD,
    92,
    Date.parse(NOW),
    id,
  )!
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
    currentAreaId: SHRINE,
    whiteoutRulesSeen: rulesSeen,
    inventory: { 'master-ball': 1, potion: 2 },
    areaProgress: { [SHRINE]: { ...emptyProgress(), ...(whiteout && { whiteout }) } },
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

test('ENTER plays the intro then its pop-up; the waves in the blizzard with the bag shut; Areas locked, the Mart open; a bonfire after each wave; the boss caught closes the shrine', async ({
  page,
}) => {
  // A long walk: the cold dev server's first load, three waves' fights and the boss's catch.
  test.setTimeout(300_000)
  const save = atShrine([[150, 100]], undefined, false)
  const pika = { id: 'mon-box', dex: 25, level: 40, xp: 0, currentHp: 5, caughtAt: 0 }
  await boot(page, { ...save, box: [...save.box.map((p) => ({ ...p, currentHp: 10 })), pika] })
  await page.goto('/home')
  const enter = page.getByRole('button', { name: /^Enter the blizzard/ })
  await enter.first().click({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  // The intro straight away (motion off: its end at once), waiting for a tap; the pop-up isn't up yet.
  const intro = page.getByRole('dialog', { name: 'Whiteout' })
  await expect(intro.getByText('The blizzard rolls in, and eyes glow in the crown tree')).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Into the blizzard' })
  const tap = page.getByRole('button', { name: 'Tap to continue' })
  await expect(tap).toBeFocused()
  await expect(dialog).toBeHidden()
  // Arriving healed the team and the Box, as a Pokémon Center does; nothing has begun.
  await expect.poll(async () => (await stored(page)).box.map((p) => p.currentHp > 10)).toEqual([true, true])
  expect(whiteOf(await stored(page))?.active ?? false).toBe(false)
  // Enter goes on: the pop-up over the intro's end, its rules six short lines.
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  for (const line of [
    '2 waves of foes that can’t be caught',
    'The blizzard takes 4% HP each round from all but Ice types, foes too',
    'A bonfire after each wave: +40% HP, team changes and items',
    'No bag in battle',
    'Then Abomasnow: catch it to end the blizzard',
    'No travel until it ends (the shop stays open)',
  ])
    await expect(dialog.getByText(line)).toBeVisible()
  await expect(dialog.locator('li')).toHaveCount(6)

  // TEAM: the team can change before it begins; back, the pop-up again at once.
  await dialog.getByRole('button', { name: 'Team' }).click()
  await expect(page).toHaveURL(/\/team$/)
  await page
    .getByRole('button', { name: /^Pikachu/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Add to team' }).click()
  await expect.poll(async () => (await stored(page)).team).toEqual(['mon-0', 'mon-box'])
  await page.getByRole('button', { name: 'Back to the blizzard' }).click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Brave the blizzard' }).click()
  await expect
    .poll(async () => whiteOf(await stored(page)))
    .toMatchObject({ active: true, wave: 0, foe: 0, tries: 1 })
  await expect.poll(async () => (await stored(page)).whiteoutRulesSeen).toBe(true)
  // The first foe: its wave and place, and it can't be caught.
  await expect(page.getByText('Wave 1/2 · 1/1').first()).toBeVisible()
  await expect(page.getByText('Lost in the blizzard: it can’t be caught.')).toBeVisible()

  // Home: the Areas button is locked and says why; the Mart stays open.
  await page.goto('/home')
  const areas = page.getByRole('button', { name: 'Areas: locked during the blizzard' })
  await expect(areas).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText(/The blizzard holds you at Snow Shrine/).first()).toBeVisible()
  await page.goto('/shop')
  await expect(page).toHaveURL(/\/shop$/)

  // Into the fight: the blizzard's chip, and the bag that won't open.
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click()
  await clickAny(page, ['FIGHT'])
  await expect(page.locator('[data-battle-weather="snow"]')).toBeVisible()
  // On a computer the Bag is a column at the side: its items greyed, and why over them.
  const shut = 'It’s too dangerous to open the bag here, items might fly away'
  await expect(page.getByRole('note').filter({ hasText: shut })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Potion/ }).first()).toBeDisabled()
  // The wave's last foe down: its card, then the bonfire.
  const camp = page.getByRole('heading', { name: 'Bonfire 1/2' })
  await playUntil(page, camp)
  await expect(page.getByRole('button', { name: /^Catch|ROLL TO CATCH|Throw it$/ })).toHaveCount(0)
  await expect(
    page.getByText('Its warmth gave every Pokémon still standing 40% of its max HP back.'),
  ).toBeVisible()
  await expect
    .poll(async () => whiteOf(await stored(page)))
    .toMatchObject({ wave: 1, bonfire: true, warmed: true })
  await expect(page.getByRole('img', { name: 'Waves cleared: 1/2' }).first()).toBeVisible()
  // TEAM from the bonfire: its own words, and back to it (no second heal).
  await page.locator('[data-bonfire]').getByRole('button', { name: 'Team' }).click()
  await expect(page).toHaveURL(/\/team$/)
  await expect(page.getByText(/At the bonfire: swap Pokémon with your Box/)).toBeVisible()
  await page.getByRole('button', { name: 'Back to the bonfire' }).click()
  await expect(camp).toBeVisible()

  // Wave 2, then the last bonfire, then the boss.
  await page.getByRole('button', { name: 'On to wave 2' }).click()
  const last = page.getByRole('heading', { name: 'The last bonfire' })
  await playUntil(page, last)
  await page.getByRole('button', { name: 'Face the crown tree' }).click()
  await expect.poll(async () => whiteOf(await stored(page))?.boss).toBe(true)
  // The boss beaten: the Master Ball's throw (it never misses), and the end.
  const throwIt = page.getByRole('button', { name: /^Master Ball.*Throw it$/ })
  await playUntil(page, throwIt)
  await throwIt.click()
  const end = page.getByRole('heading', { name: 'The blizzard lifts' })
  await playUntil(page, end)
  await expect(
    page.getByText('Shiny Abomasnow is yours. Sunlight falls on Snow Shrine, closed for good.'),
  ).toBeVisible()
  await expect.poll(async () => whiteOf(await stored(page))).toMatchObject({ won: true, active: false })
  const back = page.getByRole('button', { name: 'Back to the world' })
  await expect(back).toHaveClass(/frame-green/)
  await back.click()
  await expect(page).toHaveURL(/\/home$/)
  await expect.poll(async () => whiteOf(await stored(page))?.wonSeen).toBe(true)
  // Free to travel again, and the shrine closed for good.
  await expect(page.getByRole('button', { name: 'Areas: locked during the blizzard' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Enter the blizzard/ })).toHaveCount(0)
})

test('a wipe in the blizzard sends the player back to wave 1, healed, items kept, free to go', async ({
  page,
}) => {
  test.setTimeout(120_000)
  // Wave 1 is behind them; wave 2's Tyranitar Lv.95 is too much for a Pidgeot Lv.20.
  const save = atShrine([[18, 20]], { active: true, wave: 1, foe: 0, tries: 1 })
  await boot(page, save, bundle(HARD))
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  const wipe = page.getByText(/The blizzard swallowed your team\. The 1 waves you had cleared are lost/)
  await playUntil(page, wipe, 90_000)
  await expect
    .poll(async () => whiteOf(await stored(page)))
    .toEqual({ active: false, wave: 0, foe: 0, tries: 1 })
  const s = await stored(page)
  expect(s.inventory['master-ball']).toBe(1)
  expect(s.box[0]!.currentHp).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(/\/home$/)
  // The lock lifted: the next way in plays the intro again.
  await expect(page.getByRole('button', { name: 'Areas: locked during the blizzard' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Enter the blizzard/ }).first()).toBeVisible()
})

test('switched off, the shrine plays as a plain secret area', async ({ page }) => {
  await boot(page, atShrine([[150, 100]]), bundle(EASY, 'off'))
  await page.goto('/home')
  await expect(page.getByRole('button', { name: /^CONTINUE/ }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Enter the blizzard/ })).toHaveCount(0)
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('dialog', { name: 'Whiteout' })).toHaveCount(0)
  await expect(page.locator('[data-battle-weather="snow"]')).toHaveCount(0)
  expect(whiteOf(await stored(page))).toBeUndefined()
})

test('a 360×640 phone: the bonfire fits, its way on in reach; the Bag button says why it stays shut', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  // Mewtwo alone, so the fight starts with no send-out pick.
  await boot(page, {
    ...atShrine([[150, 100]], { active: true, wave: 1, foe: 0, bonfire: true, warmed: true, tries: 1 }),
    inventory: { potion: 2 },
  })
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Bonfire 1/2' })).toBeVisible()
  const on = page.getByRole('button', { name: 'On to wave 2' })
  await expect(on).toBeEnabled()
  await on.scrollIntoViewIfNeeded()
  await expect(on).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  // On a phone the Bag is a button: in the blizzard it stays shut and says why.
  await on.click()
  await clickAny(page, ['FIGHT'])
  await expect(page.locator('[data-battle-weather="snow"]')).toBeVisible()
  const bag = page.getByRole('button', { name: 'Bag' }).first()
  await expect(bag).toBeEnabled()
  await bag.click()
  await expect(
    page.getByText('It’s too dangerous to open the bag here, items might fly away').first(),
  ).toBeVisible()
})
