// Darkrai's nightmare (docs/30) in a small world served as content (as e2e/portal.spec.ts does): ENTER THE NIGHTMARE
// plays the intro at once, held at its end until a tap, then its pop-up with the short rules (arriving heals; NOT NOW
// goes Home; TEAM and back; BEGIN starts it), as the Distortion World's breach; its foes, haunted, come in their order and can't be caught; Home's Areas button is locked with its reason while the
// Mart stays open; after a round, Darkrai's strike takes 10 % of each one's max HP, a gift lands in the bag; the last
// round wakes the player (HEAL & START RAID over a green BACK TO THE WORLD); HEAL & START RAID opens Darkrai's raid in
// the nightmare's look (its page, its pop-up, its fight); the raid's entrance can't be skipped; a wipe sends the rounds
// back to 0 and frees the player; and a 360×640 phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  DEFAULT_CONFIG,
  DEFAULT_NIGHTMARE,
  emptyProgress,
  enterWorld,
  instanceMaxHp,
  newSmallWorld,
  type Area,
  type BundleRaw,
  type NightmareState,
  type Region,
  type SaveData,
  type SmallWorld,
} from '../src/engine'
import { FAST, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

const NOW = '2027-04-22T12:00:00.000Z'
const VERSION = 990_303

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
  id: 'world-dream',
  name: 'Dream',
  orderIndex: 99,
  dexRange: [99999, 99999],
  starters: [92],
  starterLevel: 5,
  leagueAreaId: 'e2e-dream-road',
  nextRegion: null,
  enabled: false,
}
const route1 = (load('areas.json') as Area[]).find(
  (a) => a.name === 'Route 1' && (a.regionId ?? 'kanto') === 'kanto',
)!
const ROAD: Area = {
  ...route1,
  id: 'e2e-dream-road',
  name: 'Dream Road',
  regionId: REGION.id,
  orderIndex: 9500,
  roundsToClear: 1,
  legendaryBoss: null,
  gyms: [],
  hidden: false,
  unlockConditions: null,
}
/** The nightmare's area: two rounds of `foe` (dex, level), a Revive after round 1. */
const dreamArea = (foe: [number, number]): Area => ({
  ...ROAD,
  id: 'e2e-dream-isle',
  name: 'Dream Isle',
  orderIndex: 9501,
  hidden: true,
  unlockConditions: [{ kind: 'pokedex', count: 1 }],
  legendaryBoss: [{ dex: 491, level: 60, shiny: true, raid: true }],
  wildPool: [{ id: 'e2e-dream-w', dex: 19, weight: 1, minLevel: 3, maxLevel: 3 }],
  trainerPool: [],
  lootPool: [],
  mode: {
    ...DEFAULT_NIGHTMARE,
    foes: [
      { dex: foe[0], level: foe[1] },
      { dex: foe[0], level: foe[1] },
    ],
    gifts: [{ round: 1, key: 'revive', qty: 1 }],
  },
})
const WORLD: SmallWorld = {
  ...newSmallWorld('dream', REGION.id, '2027-04-18T18:00:00.000Z', '2027-04-28T18:00:00.000Z'),
  title: { en: 'Dream' },
  minBadges: 0,
  starters: [92, 63, 79],
  boosters: [],
  mythical: { dex: 0, level: 5, areaId: '' },
}

function bundle(foe: [number, number]): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  return {
    ...b,
    areas: [...b.areas, ROAD, dreamArea(foe)],
    regions: [...(b.regions ?? []), REGION],
    config: {
      ...b.config,
      configVersion: VERSION,
      smallWorlds: { access: 'all', list: [WORLD] },
      nightmare: { access: 'all' },
      events: { ...DEFAULT_CONFIG.events, raid: { ...DEFAULT_CONFIG.events.raid, access: 'all' } },
    },
  }
}
const EASY: [number, number] = [19, 3]
const HARD: [number, number] = [248, 95]
const DREAM = 'e2e-dream-isle'

async function boot(page: Page, save: SaveData, foe: [number, number] = EASY, settings = FAST) {
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
    [JSON.stringify(save), settings, JSON.stringify(bundle(foe)), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const dreamOf = (s: SaveData): NightmareState | undefined => s.areaProgress[DREAM]?.nightmare
let n = 0
const id = () => `e2e-n-${++n}`

/** Inside the world, standing on the nightmare's area, with `team` (dex, level) as the team; `nightmare` its state. */
function atDream(team: [number, number][], nightmare?: NightmareState, rulesSeen = true): SaveData {
  const data = compileGameData(bundle(EASY))
  const s = enterWorld(
    { ...makeSave(4), events: { worldSeen: ['dream'] } },
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
    currentAreaId: DREAM,
    nightmareRulesSeen: rulesSeen,
    inventory: {},
    areaProgress: { [DREAM]: { ...emptyProgress(), ...(nightmare && { nightmare }) } },
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
    // The rework: the send-out step's GO!, and the result's Next ▸ in the old card's CONTINUE's place.
    await clickAny(page, ['FIGHT', 'SKIP ▸▸', /^Send out /, 'ATTACK', 'SKIP TURN', 'GOT IT', 'CONTINUE', 'Next ▸'])
    await page.waitForTimeout(120)
  }
  await expect(until).toBeVisible()
}

test('ENTER plays the intro at once, held for a tap, then its pop-up with the short rules (as the breach); Areas locked but the Mart open; a haunted foe; the strike after a round; a gift; the last round wakes the player', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const save = atDream([[150, 100]], undefined, false)
  const pika = { id: 'mon-box', dex: 25, level: 40, xp: 0, currentHp: 5, caughtAt: 0 }
  await boot(page, { ...save, box: [...save.box.map((p) => ({ ...p, currentHp: 10 })), pika] })
  await page.goto('/home')
  const enter = page.getByRole('button', { name: /^Enter the nightmare/ })
  await enter.first().click({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  // The intro straight away (motion off: its end at once), waiting for a tap; the pop-up isn't up yet.
  const intro = page.getByRole('dialog', { name: 'Darkrai’s nightmare' })
  await expect(
    intro.getByText('You feel a shadow breathing down your neck, the nightmare begins'),
  ).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Into the nightmare' })
  const tap = page.getByRole('button', { name: 'Tap to continue' })
  await expect(tap).toBeFocused()
  await expect(dialog).toBeHidden()
  // Arriving healed the team and the Box, as a Pokémon Center does, before BEGIN; nothing has begun.
  await expect.poll(async () => (await stored(page)).box.map((p) => p.currentHp > 10)).toEqual([true, true])
  expect(dreamOf(await stored(page))?.active ?? false).toBe(false)
  // Enter goes on, as a tap does: the pop-up rises over the intro's end, its rules four short lines.
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(page.locator('.nm-intro canvas')).toBeVisible()
  await expect(dialog.getByText('2 rounds of nightmares')).toBeVisible()
  await expect(dialog.getByText('Darkrai’s shadow takes 10% HP after each round')).toBeVisible()
  await expect(dialog.getByText('An item after round 1')).toBeVisible()
  await expect(dialog.getByText('No travel until you wake (the shop stays open)')).toBeVisible()
  await expect(dialog.locator('li')).toHaveCount(4)
  await dialog.getByRole('button', { name: 'Not now' }).click()
  await expect(page).toHaveURL(/\/home$/)
  expect(dreamOf(await stored(page))?.active ?? false).toBe(false)

  // In again: the intro again, then TEAM, where the team can change as at a Center.
  await enter.first().click()
  await tap.click()
  await dialog.getByRole('button', { name: 'Team' }).click()
  await expect(page).toHaveURL(/\/team$/)
  await page
    .getByRole('button', { name: /^Pikachu/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Add to team' }).click()
  await expect.poll(async () => (await stored(page)).team).toEqual(['mon-0', 'mon-box'])
  // Back: the pop-up again at once, no intro to wait for; BEGIN starts it, round 1's foe next.
  await page.getByRole('button', { name: 'Back to the nightmare' }).click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Begin the nightmare' }).click()
  await expect
    .poll(async () => dreamOf(await stored(page)))
    .toMatchObject({ active: true, round: 0, tries: 1 })
  await expect.poll(async () => (await stored(page)).nightmareRulesSeen).toBe(true)
  // The first round's foe: its round, and it can't be caught.
  await expect(page.getByText('Nightmare 1/2').first()).toBeVisible()
  await expect(page.getByText('A nightmare: it can’t be caught.')).toBeVisible()
  // …and a dark shadow haunts it (the rim on its own sprite).
  await expect(page.locator('.nm-haunt-host img').first()).toHaveCSS('filter', /drop-shadow/)
  // No screen effect in the area: no vignette, no shadow over the page.
  await expect(page.locator('.nm-fx')).toHaveCount(0)

  // Home: the Areas button is locked and says why; the Mart stays open.
  await page.goto('/home')
  await expect(page).toHaveURL(/\/home$/)
  const areas = page.getByRole('button', { name: 'Areas: locked during the nightmare' })
  await expect(areas).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText(/Darkrai’s nightmare holds you on Dream Isle/).first()).toBeVisible()
  // aria-disabled but still a button: a tap says why (a toast) and opens no sheet.
  await areas.click({ force: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/shop')
  await expect(page).toHaveURL(/\/shop$/)

  // Back to it: win round 1 (no throw), its gift, then Darkrai's strike.
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click()
  const strike = page.getByRole('heading', { name: 'Round 1/2: Darkrai strikes!' })
  await playUntil(page, strike)
  await expect(page.getByRole('button', { name: /^Catch|ROLL TO CATCH/ })).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).inventory.revive).toBe(1)
  // The strike lands: 10 % of max HP, rounded, never a K.O.
  await expect(page.getByText('Every Pokémon on your team lost 10% of its max HP.')).toBeVisible()
  // The save is written a moment later.
  await expect.poll(async () => dreamOf(await stored(page))?.strike ?? false).toBe(false)
  const s = await stored(page)
  const mon = s.box[0]!
  const max = instanceMaxHp(mon, compileGameData(bundle(EASY)))
  expect(dreamOf(s)).toMatchObject({ active: true, round: 1, gifted: [1] })
  expect(mon.currentHp).toBeLessThanOrEqual(max - Math.round(max / 10))
  await expect(page.getByRole('img', { name: 'Nightmare rounds won: 1/2' }).first()).toBeVisible()

  // On to round 2: its win wakes the player.
  await page.getByRole('button', { name: 'On to round 2' }).click()
  const woke = page.getByRole('heading', { name: 'You woke up from your nightmare, Darkrai awaits' })
  await playUntil(page, woke)
  await expect(page.getByText('Shiny Darkrai is now available in raids.')).toBeVisible()
  await expect
    .poll(async () => dreamOf(await stored(page)))
    .toMatchObject({ won: true, active: false, round: 2 })
  const raidBtn = page.getByRole('button', { name: 'Heal & start raid' })
  const backBtn = page.getByRole('button', { name: 'Back to the world' })
  await expect(raidBtn).toHaveClass(/frame-primary/)
  await expect(backBtn).toHaveClass(/frame-green/)
  expect((await raidBtn.boundingBox())!.y).toBeLessThan((await backBtn.boundingBox())!.y)
  await backBtn.click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: /^RAID: DARKRAI/i }).first()).toBeVisible()
  // Awake: free to travel again.
  await expect(page.getByRole('button', { name: 'Areas: locked during the nightmare' })).toHaveCount(0)
})

/** The last round under way: CONTINUE brings its foe, and its win wakes the player. */
const lastRound: NightmareState = { active: true, round: 1, gifted: [1], tries: 1 }

/** Through the last round and the waking to Darkrai's raid page with HEAL & START RAID. */
async function healAndStart(page: Page) {
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  await playUntil(
    page,
    page.getByRole('heading', { name: 'You woke up from your nightmare, Darkrai awaits' }),
  )
  await page.getByRole('button', { name: 'Heal & start raid' }).click()
  await expect(page).toHaveURL(new RegExp(`/raid/${DREAM}/491$`))
}

test('HEAL & START RAID: the team and the Box healed, Darkrai’s raid page in the nightmare’s look, its pop-up and its fight too', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const save = atDream([[150, 100]], lastRound)
  const pika = { id: 'mon-box', dex: 25, level: 40, xp: 0, currentHp: 5, caughtAt: 0 }
  await boot(page, { ...save, box: [...save.box, pika] })
  await healAndStart(page)
  await expect.poll(async () => dreamOf(await stored(page))).toMatchObject({ won: true, wonSeen: true })
  expect((await stored(page)).box.find((p) => p.id === 'mon-box')!.currentHp).toBeGreaterThan(5)
  await expect(page.locator('[data-nightmare-raid].nm-scope')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Legendary raid' })).toBeVisible()
  await expect(page.locator('canvas.nm-ground')).toBeAttached()
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-nm-page'))).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  await expect(pop).toHaveClass(/nm-scope/)
  const cards = pop.getByRole('button', { name: /, Lv\.70$/ })
  await expect(cards).toHaveCount(4)
  await cards.nth(0).click()
  await cards.nth(2).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Raid battle: Darkrai' })).toBeAttached()
  await expect(page.locator('section[data-nightmare-raid].nm-scope')).toBeVisible()
  await page.getByRole('button', { name: 'Give up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Give up' }).click()
})

test('Darkrai’s raid entrance plays out: no Skip, a tap or Esc does nothing', async ({ page }) => {
  test.setTimeout(120_000)
  const save = atDream([[150, 100]], lastRound)
  await boot(page, save, EASY, JSON.stringify({ sfx: false, sound: false, reducedMotion: false }))
  await healAndStart(page)
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  const cards = pop.getByRole('button', { name: /, Lv\.70$/ })
  await cards.nth(0).click()
  await cards.nth(1).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  const intro = page.getByRole('dialog', { name: 'Raid battle: Darkrai' })
  await expect(intro).toBeVisible()
  await expect(intro).toHaveClass(/\bnm\b/)
  await expect(intro.getByRole('button', { name: 'Skip' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await intro.click({ position: { x: 20, y: 200 } })
  await page.waitForTimeout(1500)
  await expect(intro).toBeVisible()
  await expect(intro).toBeHidden({ timeout: 12_000 })
  await expect(page.locator('section[data-nightmare-raid].nm-scope')).toBeVisible()
})

test('a wipe wakes the player: the rounds back to 0, the gift kept, the team healed, free to travel', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const state: NightmareState = { active: true, round: 1, gifted: [1], tries: 1 }
  const save = { ...atDream([[129, 5]], state), inventory: { revive: 1 } }
  await boot(page, save, HARD)
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  const wipe = page.getByText(/You woke up in a cold sweat\. The 1 rounds you had won are lost/)
  await playUntil(page, wipe)
  await expect
    .poll(async () => dreamOf(await stored(page)))
    .toEqual({ active: false, round: 0, gifted: [1], tries: 1 })
  const s = await stored(page)
  expect(s.inventory.revive).toBe(1)
  expect(s.box[0]!.currentHp).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'TRY AGAIN' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: /^Enter the nightmare/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Areas: locked during the nightmare' })).toHaveCount(0)
})

test('a 360×640 phone: Darkrai’s strike fits, nothing scrolls sideways, and the locked Areas button says why', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const save = atDream(
    [
      [150, 100],
      [25, 40],
      [6, 50],
    ],
    { active: true, round: 1, strike: true, tries: 1 },
  )
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'Areas: locked during the nightmare' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(/Darkrai’s nightmare holds you on Dream Isle/).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('heading', { name: 'Round 1/2: Darkrai strikes!' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'On to round 2' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect.poll(async () => dreamOf(await stored(page))?.strike).toBeFalsy()
})
