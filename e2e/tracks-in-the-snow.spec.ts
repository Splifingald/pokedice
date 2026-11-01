// Tracks in the Snow (docs/61 §4.1) in a small world served as content (as e2e/nightmare.spec.ts does): ENTER THE
// GLADE plays the intro at once, held for a tap, then its pop-up with the short rules (NOT NOW goes Home; BEGIN THE
// SEARCH starts round 1); the first bush is never Stantler's and shows its hoofprints; out of taps the snow falls (a
// fresh glade); a wild Stantler found in round 1 clears it (the result card); round 3's shiny Stantler, caught with the
// Master Ball, brings the outro and closes the glade for good; a wipe goes back to the glade's edge with its cleared
// rounds kept; a 360×640 phone fits the 4 × 4; and with the switch off the area is a plain secret area.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  DEFAULT_CONFIG,
  DEFAULT_TRACKS,
  emptyProgress,
  enterWorld,
  newSmallWorld,
  type Area,
  type BundleRaw,
  type Region,
  type SaveData,
  type SmallWorld,
  type TracksBush,
  type TracksMode,
  type TracksState,
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
const GLADE = 'e2e-glade'
/** The glade: Stantler at `quarry` levels in its pool, its shiny boss Lv.3, a Rattata in its other bushes. */
const gladeArea = (mode: TracksMode, quarry: number): Area => ({
  ...ROAD,
  id: GLADE,
  name: 'Snowy Glade',
  orderIndex: 9601,
  hidden: true,
  unlockConditions: [{ kind: 'pokedex', count: 1 }],
  legendaryBoss: [{ dex: 234, level: 3, shiny: true }],
  wildPool: [
    { id: 'e2e-glade-w', dex: 19, weight: 1, minLevel: 3, maxLevel: 3 },
    { id: 'e2e-glade-s', dex: 234, weight: 1, minLevel: quarry, maxLevel: quarry },
  ],
  trainerPool: [],
  lootPool: [{ id: 'e2e-glade-l', itemKey: 'potion', weight: 1, unique: false, minQty: 1, maxQty: 1 }],
  mode,
})
const WORLD: SmallWorld = {
  ...newSmallWorld('frost', REGION.id, '2027-04-18T18:00:00.000Z', '2027-04-28T18:00:00.000Z'),
  title: { en: 'Frost' },
  minBadges: 0,
  starters: [92, 63, 79],
  boosters: [],
  mythical: { dex: 0, level: 5, areaId: '' },
}

interface Opts {
  access?: 'off' | 'all'
  mode?: TracksMode
  quarry?: number
}

function bundle({ access = 'all', mode = DEFAULT_TRACKS, quarry = 3 }: Opts = {}): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  return {
    ...b,
    areas: [...b.areas, ROAD, gladeArea(mode, quarry)],
    regions: [...(b.regions ?? []), REGION],
    config: {
      ...b.config,
      configVersion: VERSION,
      smallWorlds: { access: 'all', list: [WORLD] },
      tracks: { access },
      events: { ...DEFAULT_CONFIG.events, raid: { ...DEFAULT_CONFIG.events.raid, access: 'all' } },
    },
  }
}

async function boot(page: Page, save: SaveData, opts: Opts = {}, settings = FAST) {
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
    [JSON.stringify(save), settings, JSON.stringify(bundle(opts)), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const tracksOf = (s: SaveData): TracksState | undefined => s.areaProgress[GLADE]?.tracks
let n = 0
const id = () => `e2e-t-${++n}`

/** Inside the world, standing on the glade with `team` (dex, level) as the team; `tracks` its state. */
function atGlade(team: [number, number][], tracks?: TracksState, extra: Partial<SaveData> = {}): SaveData {
  const data = compileGameData(bundle())
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
    currentAreaId: GLADE,
    inventory: {},
    areaProgress: { [GLADE]: { ...emptyProgress(), ...(tracks && { tracks }) } },
    ...extra,
  }
}

/** A glade of `size` with Stantler at `at`, everything else empty: the next tap there finds it. */
const hidden = (size: number, at: number): TracksBush[] =>
  Array.from({ length: size * size }, (_, i) => (i === at ? 'stantler' : 'empty'))

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

/** Plays on (fights, throws with the best ball there is, results) until `until` shows. */
async function playUntil(page: Page, until: ReturnType<Page['getByRole']>, ms = 60_000, hold: string[] = []) {
  for (const end = Date.now() + ms; Date.now() < end && !(await until.isVisible().catch(() => false));) {
    const ball = page.getByRole('button', { name: /^(Master Ball|Poké Ball).*Throw it$/ }).first()
    if (await ball.isVisible().catch(() => false)) {
      await ball.click().catch(() => {})
      continue
    }
    const names: (string | RegExp)[] = [
      'FIGHT',
      'SKIP ▸▸',
      /^Send out /,
      'ATTACK',
      'SKIP TURN',
      'GOT IT',
      'CATCH',
      'ROLL TO CATCH',
      'CONTINUE',
      'Next ▸',
    ]
    // `hold`: the buttons left alone (the result card's Next while its lines come in one by one).
    await clickAny(
      page,
      names.filter((n) => typeof n !== 'string' || !hold.includes(n)),
    )
    await page.waitForTimeout(120)
  }
  await expect(until).toBeVisible()
}

const bush = (page: Page, i: number) => page.locator(`[data-bush="${i}"]`)

test('ENTER THE GLADE: the intro held for a tap, its pop-up and rules; the first bush is never Stantler’s and shows its prints; out of taps the snow falls', async ({
  page,
}) => {
  test.setTimeout(120_000)
  // Round 1 with nothing in its bushes but Stantler, 3 taps: no fight comes in the way.
  const mode: TracksMode = {
    ...DEFAULT_TRACKS,
    rounds: [
      { size: 3, taps: 3, wild: 0, finds: 0, cabins: 0, apart: false },
      ...DEFAULT_TRACKS.rounds.slice(1),
    ],
  }
  const save = atGlade([[150, 100]])
  await boot(page, { ...save, box: save.box.map((p) => ({ ...p, currentHp: 10 })) }, { mode })
  await page.goto('/home')
  const enter = page.getByRole('button', { name: /^Enter the glade/ })
  await enter.first().click({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  // The intro at once (motion off: its end), waiting for a tap; arriving healed the team.
  const intro = page.getByRole('dialog', { name: 'Tracks in the Snow' })
  await expect(intro.getByText('Hoofprints in the fresh snow… Stantler is hiding in the glade')).toBeVisible()
  const tap = page.getByRole('button', { name: 'Tap to continue' })
  await expect(tap).toBeFocused()
  await expect.poll(async () => (await stored(page)).box[0]!.currentHp).toBeGreaterThan(10)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Into the glade' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('3 rounds: find Stantler, the shiny one last')).toBeVisible()
  await expect(dialog.getByText('Every bush you open shows hoofprints pointing at it')).toBeVisible()
  await expect(
    dialog.getByText('3 taps (7 in the last glade) before the snow falls and it moves'),
  ).toBeVisible()
  await expect(dialog.getByText('Bushes hide wild Pokémon, finds and warm cabins')).toBeVisible()
  await expect(dialog.locator('li')).toHaveCount(4)
  await dialog.getByRole('button', { name: 'Not now' }).click()
  await expect(page).toHaveURL(/\/home$/)
  expect(tracksOf(await stored(page))?.active ?? false).toBe(false)

  // In again: BEGIN THE SEARCH, round 1's 3 × 3, every tap left.
  await enter.first().click()
  await tap.click()
  await dialog.getByRole('button', { name: 'Begin the search' }).click()
  await expect
    .poll(async () => tracksOf(await stored(page)))
    .toMatchObject({ active: true, round: 0, tries: 1 })
  expect((await stored(page)).tracksRulesSeen).toBe(true)
  await expect(page.getByRole('heading', { name: 'Round 1/3' })).toBeVisible()
  await expect(page.locator('[data-bush]')).toHaveCount(9)
  await expect(page.locator('[data-taps="3"]')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Rounds cleared: 0/3' }).first()).toBeVisible()

  // The first bush: never Stantler's, its prints pointing at it.
  await bush(page, 4).click()
  await expect.poll(async () => tracksOf(await stored(page))?.field?.opened).toEqual([4])
  const bushes = tracksOf(await stored(page))!.field!.bushes!
  expect(bushes[4]).toBe('empty')
  expect(bushes.filter((b) => b === 'stantler')).toHaveLength(1)
  await expect(bush(page, 4)).toHaveAttribute(
    'aria-label',
    /^Snowy bush, row 2, column 2, Nothing, Hoofprints point /,
  )
  await expect(bush(page, 4)).toBeDisabled()
  await expect(page.locator('[data-taps="2"]')).toBeVisible()

  // Two more bushes, not Stantler's: out of taps, the snow falls, a fresh glade.
  const others = bushes.map((b, i) => (b === 'empty' && i !== 4 ? i : -1)).filter((i) => i >= 0)
  await bush(page, others[0]!).click()
  await expect.poll(async () => tracksOf(await stored(page))?.field?.opened.length).toBe(2)
  await bush(page, others[1]!).click()
  await expect(page.getByText('Snow falls: the prints are gone, and Stantler has moved.')).toBeVisible()
  await expect
    .poll(async () => tracksOf(await stored(page))?.field)
    .toEqual({ taps: 3, bushes: null, opened: [], snowed: true })
  await expect(page.locator('[data-bush]:disabled')).toHaveCount(0)
  await expect(page.locator('[data-held]')).toHaveCount(0)
})

test('round 1: Stantler found, a wild one; its K.O. clears the round (the result card) and round 2’s glade waits', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const state: TracksState = {
    active: true,
    round: 0,
    field: { taps: 5, bushes: hidden(3, 2), opened: [] },
    tries: 1,
  }
  await boot(page, atGlade([[150, 100]], state, { inventory: { 'poke-ball': 3 } }))
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Round 1/3' })).toBeVisible()
  await bush(page, 2).click()
  // The result card says the round is cleared (its lines come one by one: Next waits for it).
  await playUntil(page, page.getByText('Round 1/3 cleared: Stantler found!'), 60_000, ['Next ▸'])
  // On: round 2's glade, its gauge one round on.
  await playUntil(page, page.getByRole('heading', { name: 'Round 2/3' }))
  await expect
    .poll(async () => tracksOf(await stored(page)))
    .toMatchObject({ active: true, round: 1, field: { taps: 5, bushes: null, opened: [] } })
  // The top bar counts the glade's rounds.
  await expect(page.locator('[data-area-title]')).toContainText('2/3')
  await expect(page.getByRole('img', { name: 'Rounds cleared: 1/3' }).first()).toBeVisible()
  // INFO: the same rules again.
  await page.getByRole('button', { name: 'Info: how Tracks in the Snow works' }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Tracks in the Snow' })
      .getByText('Bushes hide wild Pokémon, finds and warm cabins'),
  ).toBeVisible()
})

test('round 3: the shiny Stantler, caught with the Master Ball: the outro, then the glade is closed for good', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const state: TracksState = {
    active: true,
    round: 2,
    field: { taps: 7, bushes: hidden(4, 15), opened: [] },
    tries: 1,
  }
  await boot(page, atGlade([[150, 100]], state, { inventory: { 'master-ball': 1 } }))
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Round 3/3' })).toBeVisible()
  await expect(page.getByText('The shiny Stantler hides here')).toBeVisible()
  await bush(page, 15).click()
  const outro = page.getByRole('heading', { name: 'The glade is quiet again' })
  await playUntil(page, outro, 100_000)
  await expect(page.getByText('Fresh snow covers the prints. Shiny Stantler is yours.')).toBeVisible()
  const s = await stored(page)
  expect(tracksOf(s)).toMatchObject({ won: true, active: false, round: 3 })
  expect(s.areaProgress[GLADE]!.bossesCaught).toEqual([234])
  expect(s.box.some((p) => p.dex === 234 && p.shiny)).toBe(true)
  await page.getByRole('button', { name: 'Back to the world' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect.poll(async () => tracksOf(await stored(page))?.wonSeen).toBe(true)
})

test('a wipe in the glade: back at its edge, healed, its cleared round kept; ENTER THE GLADE again at round 2', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const state: TracksState = {
    active: true,
    round: 1,
    field: { taps: 5, bushes: hidden(3, 0), opened: [] },
    tries: 1,
  }
  await boot(page, atGlade([[129, 5]], state), { quarry: 95 })
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  await bush(page, 0).click()
  await playUntil(page, page.getByText(/^Back at the glade’s edge, your team healed\./))
  await expect.poll(async () => tracksOf(await stored(page))).toEqual({ active: false, round: 1, tries: 1 })
  expect((await stored(page)).box[0]!.currentHp).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'TRY AGAIN' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('button', { name: /^Enter the glade/ }).first()).toBeVisible()
  await expect(page.getByText('Round 2/3: find Stantler').first()).toBeVisible()
})

test('a 360×640 phone: the 4 × 4 glade fits, each bush at least 44 px, nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const state: TracksState = {
    active: true,
    round: 2,
    field: { taps: 7, bushes: null, opened: [] },
    tries: 1,
  }
  await boot(page, atGlade([[150, 100]], state))
  await page.goto('/home')
  await page
    .getByRole('button', { name: /^CONTINUE/ })
    .first()
    .click({ timeout: 15_000 })
  await expect(page.locator('[data-bush]')).toHaveCount(16)
  for (let i = 0; i < 16; i++) {
    const box = (await bush(page, i).boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('switched off: the glade is a plain secret area (no way in, its cards dealt as before)', async ({
  page,
}) => {
  await boot(page, atGlade([[150, 100]]), { access: 'off' })
  await page.goto('/home')
  const go = page.getByRole('button', { name: /^CONTINUE/ }).first()
  await expect(go).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Enter the glade/ })).toHaveCount(0)
  await go.click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.locator('[data-tracks]')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Tracks in the Snow' })).toHaveCount(0)
})
