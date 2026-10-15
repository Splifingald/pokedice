// Distortion World's portal run (docs/28) in a small world served as content (as e2e/worlds.spec.ts does): CONTINUE
// goes in (the breach held at its end until a tap, its pop-up over it; arriving heals as a Center does; TEAM changes the
// team and comes back to the pop-up; NOT NOW goes back Home, READY! starts the run and shuts the team), the menus are
// shut and a reload comes back into the run, a wild Pokémon that can't be caught, a boon picked and confirmed (BACK, Esc
// spend nothing), the last portal won (the victory: HEAL & START RAID over a green BACK TO THE WORLD, which goes Home,
// then the raid on CONTINUE); HEAL & START RAID (healed, on Giratina's raid page in the Distortion World's look, its
// pop-up too, its fight on the Distortion World's stage); the raid's entrance there can't be skipped; a wipe (the
// portals back to 0, healed, Home again); and a 360×640 phone.
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

const NOW = '2027-04-22T12:00:00.000Z'
const VERSION = 990_202

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
  id: 'world-rift',
  name: 'Rift',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [92],
  starterLevel: 5,
  leagueAreaId: 'e2e-rift-road',
  nextRegion: null,
  enabled: false,
}
const route1 = (load('areas.json') as Area[]).find(
  (a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto',
)!
const ROAD: Area = {
  ...route1,
  id: 'e2e-rift-road',
  name: 'Rift Road',
  regionId: REGION.id,
  orderIndex: 9500,
  roundsToClear: 1,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
}
/** The portal area: 2 portals, a cycle of one wild Pokémon (Rattata Lv.3, or a strong Gengar for the wipe). */
const portalArea = (wild: [number, number]): Area => ({
  ...ROAD,
  id: 'e2e-rift-portal',
  name: 'Torn Rift',
  orderIndex: 9501,
  hidden: true,
  unlockConditions: [{ kind: 'pokedex', count: 1 }],
  legendaryBoss: [{ dex: 487, level: 70, shiny: true, raid: true }],
  wildPool: [{ id: 'e2e-rift-w', dex: wild[0], weight: 1, minLevel: wild[1], maxLevel: wild[1] }],
  trainerPool: [],
  lootPool: [],
  mode: { ...DEFAULT_PORTAL_RUN, portals: 2, wild: 1, items: 0 },
})
const WORLD: SmallWorld = {
  ...newSmallWorld('rift', REGION.id, '2027-04-18T18:00:00.000Z', '2027-04-28T18:00:00.000Z'),
  title: { en: 'Rift' },
  minBadges: 0,
  starters: [92, 63, 79],
  boosters: [],
  mythical: { dex: 0, level: 5, areaId: '' },
}

function bundle(wild: [number, number]): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  return {
    ...b,
    areas: [...b.areas, ROAD, portalArea(wild)],
    regions: [...(b.regions ?? []), REGION],
    config: {
      ...b.config,
      configVersion: VERSION,
      smallWorlds: { access: 'all', list: [WORLD] },
      portalRun: { access: 'all' },
      events: { ...DEFAULT_CONFIG.events, raid: { ...DEFAULT_CONFIG.events.raid, access: 'all' } },
    },
  }
}
const EASY: [number, number] = [19, 3]
const HARD: [number, number] = [94, 90]
const PORTAL = 'e2e-rift-portal'

async function boot(page: Page, save: SaveData, wild: [number, number] = EASY, settings = FAST) {
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
    [JSON.stringify(save), settings, JSON.stringify(bundle(wild)), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const portalOf = (s: SaveData): PortalState | undefined => s.areaProgress[PORTAL]?.portal
let n = 0
const id = () => `e2e-p-${++n}`

/** Inside the world, standing at the portal area, with `team` (dex, level) as the team; `portal` the run's state. */
function atPortal(team: [number, number][], portal?: PortalState): SaveData {
  const data = compileGameData(bundle(EASY))
  const s = enterWorld(
    { ...makeSave(4), events: { worldSeen: ['rift'] } },
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
    currentAreaId: PORTAL,
    portalRulesSeen: true,
    areaProgress: { [PORTAL]: { ...emptyProgress(), ...(portal && { portal }) } },
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
    await clickAny(page, ['FIGHT', 'SKIP ▸▸', 'ATTACK', 'SKIP TURN', 'GOT IT', 'CONTINUE'])
    await page.waitForTimeout(120)
  }
  await expect(until).toBeVisible()
}

test('the way in: the breach waits for a tap, its pop-up over its end; arriving heals; TEAM changes the team until READY!, which locks the area; its Pokémon can’t be caught, a confirmed boon closes a portal, the last one wins and opens the raid', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const save = atPortal([[150, 100]])
  // Mewtwo in the team and Pikachu in the Box, both hurt.
  const pika = { id: 'mon-box', dex: 25, level: 40, xp: 0, currentHp: 5, caughtAt: 0 }
  await boot(page, { ...save, box: [...save.box.map((p) => ({ ...p, currentHp: 10 })), pika] })
  await page.goto('/home')
  const enter = page.getByRole('button', { name: /^Enter the distortion/ })
  await enter.first().click({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  // The breach holds its end (motion off: at once) and waits for a tap; the pop-up isn't up yet.
  const dialog = page.getByRole('dialog', { name: 'Into the distortion' })
  const tap = page.getByRole('button', { name: 'Tap to continue' })
  await expect(tap).toBeVisible()
  await expect(tap).toBeFocused()
  await expect(dialog).toBeHidden()
  // Arriving healed the team and the Box, as a Pokémon Center does, before READY!.
  await expect.poll(async () => (await stored(page)).box.map((p) => p.currentHp > 10)).toEqual([true, true])
  expect(portalOf(await stored(page))?.active ?? false).toBe(false)
  // Enter goes on, as a tap does: the pop-up rises over the breach's end.
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(page.locator('.portal-breach canvas')).toBeVisible()
  await expect(
    dialog.getByText(
      'Are you sure you want to enter? You cannot leave the area unless all your party is K.O.',
    ),
  ).toBeVisible()
  await expect(dialog.getByText('Close 2 portals')).toBeVisible()
  await dialog.getByRole('button', { name: 'Not now' }).click()
  await expect(page).toHaveURL(/\/home$/)
  expect(portalOf(await stored(page))?.active ?? false).toBe(false)

  // In again: TEAM, where the team can change as at a Center (no run yet, the menus open).
  await enter.first().click()
  await tap.click()
  await dialog.getByRole('button', { name: 'Team' }).click()
  await expect(page).toHaveURL(/\/team$/)
  await expect(page.getByText('Swaps at a Center')).toHaveCount(0)
  await page
    .getByRole('button', { name: /^Pikachu/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Add to team' }).click()
  await expect.poll(async () => (await stored(page)).team).toEqual(['mon-0', 'mon-box'])
  // Back: the pop-up again at once, no breach to wait for.
  await page.getByRole('button', { name: 'Back to the distortion' }).click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Ready!' }).click()
  // The run under way, with the team as it was changed; healed.
  await expect.poll(async () => portalOf(await stored(page))?.active).toBe(true)
  const s = await stored(page)
  expect(s.team).toEqual(['mon-0', 'mon-box'])
  expect(s.box[0]!.currentHp).toBeGreaterThan(10)
  // The wild Pokémon's preview: it can't be caught.
  await expect(page.getByText('Distorted: it can’t be caught.')).toBeVisible()

  // The menus are shut, and a page elsewhere sends back to the area: no more team changes.
  await expect(page.getByRole('link', { name: /^Team/ }).first()).toHaveAttribute('aria-disabled', 'true')
  await page.goto('/team')
  await expect(page).toHaveURL(/\/area$/)
  await page.goto('/shop')
  await expect(page).toHaveURL(/\/area$/)

  // Win the fight (no throw comes), then the distortion's boons.
  const choice = page.getByRole('heading', { name: 'Distortion 1/2' })
  await playUntil(page, choice)
  await expect(page.getByRole('button', { name: /^Catch|ROLL TO CATCH/ })).toHaveCount(0)
  const picks = page.getByRole('button', { name: /^Pick: / })
  expect(await picks.count()).toBeGreaterThan(0)
  // A pick asks first: BACK spends nothing; another one, CONFIRM takes it.
  const confirm = page.getByRole('dialog', { name: 'Take this boon?' })
  await picks.first().click()
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Back' }).click()
  await expect(confirm).toBeHidden()
  expect(portalOf(await stored(page))?.closed).toBe(0)
  await picks.last().click()
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(async () => portalOf(await stored(page))?.closed).toBe(1)
  await expect(page.getByRole('img', { name: 'Portals closed: 1/2' }).first()).toBeVisible()

  // A reload comes back into the run.
  await page.goto('/home')
  await expect(page).toHaveURL(/\/area$/)

  // The next cycle: a fight, then the last distortion wins.
  const won = page.getByRole('heading', { name: 'Every portal is closed!' })
  await playUntil(page, won)
  await expect(
    page.getByText('Shiny Giratina came through the last one: it is now available in raids.'),
  ).toBeVisible()
  // The save is written a moment later.
  await expect
    .poll(async () => portalOf(await stored(page)))
    .toMatchObject({ won: true, active: false, closed: 2 })
  // HEAL & START RAID, the main action, over the green BACK TO THE WORLD (the user, 2026-10-15).
  const raidBtn = page.getByRole('button', { name: 'Heal & start raid' })
  const backBtn = page.getByRole('button', { name: 'Back to the world' })
  await expect(raidBtn).toBeVisible()
  await expect(raidBtn).toHaveClass(/frame-primary/)
  await expect(backBtn).toHaveClass(/frame-green/)
  expect((await raidBtn.boundingBox())!.y).toBeLessThan((await backBtn.boundingBox())!.y)
  await backBtn.click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: /^RAID: GIRATINA/i }).first()).toBeVisible()
  await expect.poll(async () => portalOf(await stored(page))?.wonSeen).toBe(true)
})

/** The last portal's cycle under way: CONTINUE turns over the last distortion, and the run is won. */
const lastPortal: PortalState = { active: true, closed: 1, deck: ['distortion'], tries: 1 }

/** Through the victory to Giratina's raid page with HEAL & START RAID. */
async function healAndStart(page: Page) {
  await page.goto('/home')
  await expect(page).toHaveURL(/\/area$/, { timeout: 15_000 })
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .last()
    .click()
  await expect(page.getByRole('heading', { name: 'Every portal is closed!' })).toBeVisible()
  await page.getByRole('button', { name: 'Heal & start raid' }).click()
  await expect(page).toHaveURL(new RegExp(`/raid/${PORTAL}/487$`))
}

test('HEAL & START RAID: the team and the Box healed, the victory seen, Giratina’s raid page in the Distortion World’s look, its pop-up and its fight too', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const save = atPortal([[150, 100]], lastPortal)
  // Mewtwo hurt in the team, Pikachu hurt in the Box: the victory heals the team only, the button the Box too.
  const pika = { id: 'mon-box', dex: 25, level: 40, xp: 0, currentHp: 5, caughtAt: 0 }
  await boot(page, { ...save, box: [...save.box.map((p) => ({ ...p, currentHp: 10 })), pika] })
  await healAndStart(page)
  await expect.poll(async () => portalOf(await stored(page))).toMatchObject({ won: true, wonSeen: true })
  const s = await stored(page)
  expect(s.box.find((p) => p.id === 'mon-box')!.currentHp).toBeGreaterThan(5)
  expect(s.box.find((p) => p.id === 'mon-0')!.currentHp).toBeGreaterThan(10)
  // The page wears the Distortion World: its violet night, the void behind, the raid open to start.
  const raidPage = page.locator('[data-portal-raid].dw-scope')
  await expect(raidPage).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Legendary raid' })).toBeVisible()
  await expect(page.locator('canvas.dw-ground')).toBeAttached()
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-dw-page'))).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // Its pop-up too: the NPC partners in the violet night, the portal as its banner.
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  await expect(pop).toHaveClass(/dw-scope/)
  const cards = pop.getByRole('button', { name: /, Lv\.100$/ })
  await expect(cards).toHaveCount(4)
  await cards.nth(0).click()
  await cards.nth(2).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  // The fight on the Distortion World's stage (motion off: no entrance), Giratina distorted.
  await expect(page.getByRole('heading', { name: 'Raid battle: Giratina' })).toBeAttached()
  await expect(page.locator('section[data-portal-raid].dw-scope')).toBeVisible()
  await expect(page.locator('section[data-portal-raid] .portal-glitch-host')).toBeAttached()
  // Leaving the raid's page puts the page's own ground back.
  await page.getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Give up' }).click()
})

test('Giratina’s raid entrance plays out: no Skip, a tap or Esc does nothing (the user, 2026-10-15)', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const save = atPortal([[150, 100]], lastPortal)
  // Animations on (the entrance plays); the victory before it plays out too.
  await boot(page, save, EASY, JSON.stringify({ sfx: false, sound: false, reducedMotion: false }))
  await healAndStart(page)
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  const cards = pop.getByRole('button', { name: /, Lv\.100$/ })
  await cards.nth(0).click()
  await cards.nth(1).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  const intro = page.getByRole('dialog', { name: 'Raid battle: Giratina' })
  await expect(intro).toBeVisible()
  await expect(intro).toHaveClass(/dw/)
  await expect(intro.getByRole('button', { name: 'Skip' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await intro.click({ position: { x: 20, y: 200 } })
  await page.waitForTimeout(1500)
  await expect(intro).toBeVisible()
  // It ends on its own (6.2 s), into the fight.
  await expect(intro).toBeHidden({ timeout: 12_000 })
  await expect(page.locator('section[data-portal-raid].dw-scope')).toBeVisible()
})

test('a wipe: the portals closed go back to 0, the boons are lost, XP and items kept, the team healed, back Home', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const portal: PortalState = {
    active: true,
    closed: 1,
    deck: ['distortion', 'wild'],
    boosts: { water: 10 },
    tries: 1,
  }
  const save = { ...atPortal([[129, 5]], portal), inventory: { potion: 3 } }
  await boot(page, save, HARD)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/area$/, { timeout: 15_000 })
  // The run's bonus shows.
  await expect(page.getByRole('heading', { name: 'This run’s bonuses' })).toBeVisible()
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .last()
    .click()
  const wipe = page.getByText(/The 1 portals you closed have opened again/)
  await playUntil(page, wipe)
  await expect
    .poll(async () => portalOf(await stored(page)))
    .toEqual({ active: false, closed: 0, deck: [], tries: 1 })
  const s = await stored(page)
  expect(s.inventory.potion).toBe(3)
  expect(s.box[0]!.currentHp).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'TRY AGAIN' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: /^Enter the distortion/ }).first()).toBeVisible()
})

test('a 360×640 phone: a distortion’s boons fit, nothing scrolls sideways, and the menus say why they are shut', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const portal: PortalState = {
    active: true,
    closed: 0,
    deck: [],
    offers: [{ kind: 'heal', percent: 30 }, { kind: 'boost', type: 'psychic', amount: 10 }, { kind: 'item' }],
    tries: 1,
  }
  const save = atPortal([[150, 100]], portal)
  await boot(page, { ...save, box: save.box.map((p) => ({ ...p, currentHp: 50 })) })
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Distortion 1/2' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Pick: Psychic +10' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('link', { name: /^Team/ }).first()).toHaveAttribute('aria-disabled', 'true')
  // The confirm pop-up: Esc goes back with nothing spent; CONFIRM holds the focus and takes it.
  const confirm = page.getByRole('dialog', { name: 'Take this boon?' })
  await page.getByRole('button', { name: 'Pick: Psychic +10' }).click()
  await expect(confirm.getByText('+10 damage on every Psychic attack, for this run.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  expect(portalOf(await stored(page))?.boosts).toBeUndefined()
  await page.getByRole('button', { name: 'Pick: Psychic +10' }).click()
  await expect(confirm.getByRole('button', { name: 'Confirm' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(async () => portalOf(await stored(page))?.boosts).toEqual({ psychic: 10 })
  await expect(page.getByText('+10 damage')).toBeVisible()
})
