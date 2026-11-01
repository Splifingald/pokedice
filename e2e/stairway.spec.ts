// The Stairway of Plates (docs/61 §4.5): Distortion World's portal run dressed for Arceus, in a small world served as
// content (as e2e/portal.spec.ts does, whose rules it shares). The way in in its own words (CLIMB THE STAIRWAY, the
// stairway's pop-up), its Pokémon in light that can't be caught, an altar's blessings confirmed, the landings' gauge,
// the victory (shiny Arceus down the stairs); its own rules pop-up for a Distortion World veteran; and its raid: the
// usual look, Arceus announcing its first bar's Plate as the fight starts.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  DEFAULT_CONFIG,
  DEFAULT_PORTAL_RUN,
  emptyProgress,
  enterWorld,
  newSmallWorld,
  type Area,
  type BundleRaw,
  type PortalState,
  type Region,
  type SaveData,
  type SmallWorld,
} from '../src/engine'
import { FAST, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

const NOW = '2027-01-02T12:00:00.000Z'
const VERSION = 990_493

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
  id: 'world-glow',
  name: 'Glow',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [92],
  starterLevel: 5,
  leagueAreaId: 'e2e-glow-road',
  nextRegion: null,
  enabled: false,
}
const route1 = (load('areas.json') as Area[]).find(
  (a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto',
)!
const ROAD: Area = {
  ...route1,
  id: 'e2e-glow-road',
  name: 'Glow Road',
  regionId: REGION.id,
  orderIndex: 9500,
  roundsToClear: 1,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
}
const HALL = 'e2e-glow-hall'
/** The Hall: 2 altars, a landing of one wild Rattata (Lv.3); its raid's first bar Ice, its second Steel. */
const HALL_AREA: Area = {
  ...ROAD,
  id: HALL,
  name: 'Hall of Light',
  orderIndex: 9501,
  hidden: true,
  unlockConditions: [{ kind: 'pokedex', count: 1 }],
  legendaryBoss: [{ dex: 493, level: 90, shiny: true, raid: true }],
  wildPool: [{ id: 'e2e-glow-w', dex: 19, weight: 1, minLevel: 3, maxLevel: 3 }],
  trainerPool: [],
  lootPool: [],
  mode: {
    ...DEFAULT_PORTAL_RUN,
    skin: 'plates',
    portals: 2,
    wild: 1,
    items: 0,
    raid: { level: 90, upgradeLevel: 10, bars: 4, teamCap: 90, barTypes: ['ice', 'steel'] },
  },
}
const WORLD: SmallWorld = {
  ...newSmallWorld('glow', REGION.id, '2026-12-19T12:00:00.000Z', '2027-01-03T12:00:00.000Z'),
  title: { en: 'Glow' },
  minBadges: 0,
  starters: [92, 63, 79],
  boosters: [],
  mythical: { dex: 0, level: 5, areaId: '' },
}

function bundle(): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  return {
    ...b,
    areas: [...b.areas, ROAD, HALL_AREA],
    regions: [...(b.regions ?? []), REGION],
    config: {
      ...b.config,
      configVersion: VERSION,
      smallWorlds: { access: 'all', list: [WORLD] },
      // The Stairway answers to its own switch (docs/61 §4.5), Distortion World's left Off to prove it.
      platesRun: { access: 'all' },
      portalRun: { access: 'off' },
      events: { ...DEFAULT_CONFIG.events, raid: { ...DEFAULT_CONFIG.events.raid, access: 'all' } },
    },
  }
}

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page, { rpc: { event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }) } })
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
    [JSON.stringify(save), FAST, JSON.stringify(bundle()), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const portalOf = (s: SaveData): PortalState | undefined => s.areaProgress[HALL]?.portal
let n = 0
const id = () => `e2e-s-${++n}`

/** Inside the world, at the Hall (or `at` elsewhere), with Mewtwo Lv.100; `portal` the run's state. */
function atHall(portal?: PortalState, at = HALL): SaveData {
  const data = compileGameData(bundle())
  const s = enterWorld(
    { ...makeSave(4), events: { worldSeen: ['glow'] } },
    data,
    WORLD,
    92,
    Date.parse(NOW),
    id,
  )!
  const box = [{ id: 'mon-0', dex: 150, level: 100, xp: 0, currentHp: 9999, caughtAt: 0 }]
  return {
    ...s,
    box,
    team: ['mon-0'],
    pokedex: [92, 150],
    currentAreaId: at,
    platesRulesSeen: true,
    areaProgress: { [HALL]: { ...emptyProgress(), ...(portal && { portal }) } },
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

test('the stairway in its own words: the way in, its Pokémon in light and never caught, an altar’s blessing, the landings climbed, shiny Arceus at the top', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await boot(page, atHall())
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^Climb the stairway/ })
    .first()
    .click({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  // The way in waits for a tap over its end, the white-gold sky (not the void) under it.
  await page.getByRole('button', { name: 'Tap to continue' }).click()
  const dialog = page.getByRole('dialog', { name: 'Onto the stairway' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.portal-breach.bg-\\[\\#fff6dc\\]')).toBeAttached()
  await expect(dialog.getByText('Climb 2 landings')).toBeVisible()
  await expect(dialog.getByText('A blessing per altar')).toBeVisible()
  await dialog.getByRole('button', { name: 'Ready!' }).click()
  await expect.poll(async () => portalOf(await stored(page))?.active).toBe(true)

  // Its wild Pokémon wear light, and can't be caught here.
  await expect(page.getByText('Of the Hall of Origin: it can’t be caught here.')).toBeVisible()
  // The menus say why they're shut, in its words.
  await expect(page.getByRole('link', { name: /^Team/ }).first()).toHaveAttribute(
    'title',
    'You can’t leave the stairway until you reach the top or your party is K.O.',
  )

  // An altar: its blessings, a pick confirmed.
  const altar = page.getByRole('heading', { name: 'Altar 1/2' })
  await playUntil(page, altar)
  await expect(page.getByText('Pick one blessing to light this altar.')).toBeVisible()
  await page
    .getByRole('button', { name: /^Pick: / })
    .last()
    .click()
  const confirm = page.getByRole('dialog', { name: 'Take this blessing?' })
  await confirm.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(async () => portalOf(await stored(page))?.closed).toBe(1)
  await expect(page.getByRole('img', { name: 'Landings climbed: 1/2' }).first()).toBeVisible()

  // The last altar: shiny Arceus comes down the stairway.
  const won = page.getByRole('heading', { name: 'All 2 altars are lit!' })
  await playUntil(page, won)
  await expect(
    page.getByText('Shiny Arceus came down the stairway of light: it is now available in raids.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Back to the world' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: /^RAID: ARCEUS/i }).first()).toBeVisible()
})

test('a Distortion World veteran still gets the Stairway of Plates’ rules once', async ({ page }) => {
  // Seen Distortion World's rules last Halloween, never the stairway's: Home, between fights.
  const save = { ...atHall(undefined, 'e2e-glow-road'), portalRulesSeen: true, platesRulesSeen: undefined }
  await boot(page, save)
  await page.goto('/home')
  const rules = page.getByRole('dialog', { name: 'Stairway of Plates' })
  await expect(rules).toBeVisible({ timeout: 15_000 })
  await expect(rules.getByText('Climb 2 landings')).toBeVisible()
  await expect(rules.getByText(/shiny Arceus comes to the raids/)).toBeVisible()
  await rules.getByRole('button', { name: 'Later' }).click()
  await expect.poll(async () => (await stored(page)).platesRulesSeen).toBe(true)
})

test('its raid: the usual look, and Arceus takes its first bar’s Plate as the fight starts', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await boot(page, atHall({ active: true, closed: 1, deck: ['distortion'], tries: 1 }))
  await page.goto('/home')
  await expect(page).toHaveURL(/\/area$/, { timeout: 15_000 })
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .last()
    .click()
  await expect(page.getByRole('heading', { name: 'All 2 altars are lit!' })).toBeVisible()
  await page.getByRole('button', { name: 'Heal & start raid' }).click()
  await expect(page).toHaveURL(new RegExp(`/raid/${HALL}/493$`))
  // Not Distortion World's violet night: the Hall's raid wears the usual look.
  await expect(page.locator('[data-portal-raid]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  const cards = pop.getByRole('button', { name: /, Lv\.\d+$/ })
  await cards.nth(0).click()
  await cards.nth(1).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Raid battle: Arceus' })).toBeAttached({ timeout: 15_000 })
  await expect(page.getByText('Arceus takes the Icicle Plate! It is now Ice type!').first()).toBeVisible({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Give up' }).click()
})
