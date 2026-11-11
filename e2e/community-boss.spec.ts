// The Community Boss (docs/71 §4): a live event on as soon as it's scheduled (no switch of its own, the user's call of
// 2026-11-11). The admin's event reaches the game as content (as live.spec.ts does); the server's answers (boss_state,
// boss_place, boss_take_back: migration 0147) are mocked. Its pop-up leads to its page: the gauges, the arena (yours,
// a friend's, others), placing a Pokémon (the server told, the Pokémon out of the Box) and taking it back, the top;
// a guest is asked to sign in; a phone.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { newLiveEvent, type LiveEvent, type SaveData } from '../src/engine'
import {
  FAST,
  fakeSession,
  makeSave,
  mockSupabase,
  nonJerseyText,
  smallControls,
  STORAGE_KEY,
  SUPABASE,
} from './helpers'

const SHOTS = 'docs/71-short-events'
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })

const START = '2027-07-01T10:00:00.000Z'
const END = '2027-07-04T10:00:00.000Z'
const NOW = '2027-07-02T12:00:00.000Z'
const VERSION = 990_191

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

const boss: LiveEvent = {
  ...newLiveEvent('snorlax', START, END),
  type: 'boss',
  minBadges: 0,
  banner: 'gym-normal',
}

/** What the server holds: the player's slots, as boss_place and boss_take_back leave them. */
type Slot = {
  slot: number
  instId: string
  dex: number
  level: number
  shiny: boolean
  hit: number
  affinity: number
  placedAt: string
}

function server() {
  const slots: Slot[] = []
  const placed: Record<string, unknown>[] = []
  const state = () => ({
    now: NOW,
    ended: false,
    total: 12_500_000,
    lastHour: 3_600_000,
    participants: 212,
    top: [
      { name: 'Misty', damage: 900_000, me: false },
      { name: 'Brock', damage: 700_000, me: false },
      { name: 'Sam', damage: 80_000, me: true },
    ],
    builtAt: NOW,
    me: { damage: 80_000, rank: 3, slots },
    field: [
      ...slots.map((s) => ({ name: 'Sam', dex: s.dex, level: s.level, shiny: false, hit: s.hit, own: true })),
      { name: 'Misty', dex: 6, level: 60, shiny: false, hit: 60, friend: true },
      ...[25, 150, 94, 130, 9].map((dex, i) => ({
        name: `Trainer ${i + 1}`,
        dex,
        level: 40,
        shiny: false,
        hit: 40,
      })),
    ],
    result: null,
  })
  return {
    slots,
    placed,
    rpc: {
      event_time: () => ({ now: NOW, day: NOW.slice(0, 10) }),
      friend_status: [{ ids: [], unseen: [] }],
      boss_state: () => state(),
      boss_place: (b: Record<string, unknown>) => {
        placed.push(b)
        const at = slots.findIndex((s) => s.slot === b.p_slot)
        if (at >= 0) slots.splice(at, 1)
        slots.push({
          slot: Number(b.p_slot),
          instId: String(b.p_inst),
          dex: Number(b.p_dex),
          level: Number(b.p_level),
          shiny: false,
          hit: Number(b.p_level),
          affinity: 1,
          placedAt: NOW,
        })
        return { slot: b.p_slot, hit: b.p_level, affinity: 1 }
      },
      boss_take_back: (b: Record<string, unknown>) => {
        const at = slots.findIndex((s) => s.slot === b.p_slot)
        if (at >= 0) slots.splice(at, 1)
        return at >= 0
      },
    },
  }
}

async function boot(page: Page, save: SaveData, rpc: Record<string, unknown>, signedIn = true) {
  await mockSupabase(page, { rpc })
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
    await new Promise((r) => setTimeout(r, 400))
    const object = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = object ? { value: VERSION } : [{ value: VERSION }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const bundle = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)]))
  bundle.config = { ...bundle.config, configVersion: VERSION, liveEvents: { access: 'all', list: [boss] } }
  await page.addInitScript(
    ([s, f, b, v, key, session]) => {
      if (session) localStorage.setItem(key!, session)
      else localStorage.removeItem(key!)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
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
      signedIn ? JSON.stringify(fakeSession()) : '',
    ],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)

/** A player with a team of two and two more in the Box (one can go: never the last of the team). */
function playerSave(): SaveData {
  return makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 500 })
}

test('its pop-up leads to the page: gauges, the arena, place a Pokémon and take it back, the top', async ({
  page,
}) => {
  const s = server()
  const save = playerSave()
  const extra = { ...save.box[0]!, id: 'spare', dex: 66, level: 5 }
  await boot(page, { ...save, box: [...save.box, extra] }, s.rpc)
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Community Boss: Snorlax' })
  await expect(pop).toBeVisible({ timeout: 15_000 })
  await pop.getByRole('button', { name: 'Go to the boss' }).click()
  await expect(page).toHaveURL(/\/boss\?id=snorlax$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Community Boss: Snorlax' })).toBeVisible()
  // 12.5M dealt: the first gauge (10M) broken, the second partway.
  await expect(page.getByRole('region', { name: 'Boss gauges: 1 of 5 broken' })).toBeVisible()
  await expect(page.getByTestId('boss-friend')).toHaveCount(1)
  await expect(page.getByTestId('boss-other')).toHaveCount(5)
  await expect(page.getByTestId('boss-trainers')).toHaveText('212 trainers')
  await expect(page.getByTestId('boss-top')).toContainText('Misty')

  // Place Machop (Fighting on Normal: ×2) in slot 1.
  await page.getByRole('button', { name: 'Place a Pokémon (1)' }).click()
  const picker = page.getByRole('dialog', { name: 'Slot 1: pick a Pokémon' })
  await expect(picker.getByTestId('boss-picker')).toBeVisible()
  await picker.getByRole('button', { name: /Machop/ }).click()
  await expect(picker).toBeHidden()
  expect(s.placed[0]).toMatchObject({ p_event: 'snorlax', p_slot: 0, p_inst: 'spare', p_dex: 66, p_level: 5 })
  await expect.poll(async () => (await stored(page)).box.some((p) => p.id === 'spare')).toBe(false)
  await expect(page.getByTestId('boss-own')).toHaveCount(1)
  // Taken back: home to the Box.
  await page.getByRole('button', { name: 'Take back' }).click()
  await expect.poll(async () => (await stored(page)).box.some((p) => p.id === 'spare')).toBe(true)
  await expect(page.getByRole('button', { name: 'Place a Pokémon (1)' })).toBeVisible()
})

test('a guest is asked to sign in, and still sees the boss', async ({ page }) => {
  const s = server()
  await boot(page, playerSave(), s.rpc, false)
  await page.goto('/boss?id=snorlax')
  await expect(page.getByText('Sign in to take part.')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('boss-arena')).toBeVisible()
})

test('on a 360×640 phone: the page fits, in the Jersey fonts, 44 px targets', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const s = server()
  const save = playerSave()
  await boot(
    page,
    { ...save, box: [...save.box, { ...save.box[0]!, id: 'spare', dex: 66, level: 5 }] },
    s.rpc,
  )
  await page.goto('/boss?id=snorlax')
  await expect(page.getByTestId('boss-arena')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Place a Pokémon (1)' }).click()
  await page
    .getByRole('dialog', { name: 'Slot 1: pick a Pokémon' })
    .getByRole('button', { name: /Machop/ })
    .click()
  await expect(page.getByTestId('boss-own')).toHaveCount(1)
  await expect(page.getByText('Content updated')).toHaveCount(0, { timeout: 10_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(0)
  expect(await nonJerseyText(page), 'fonts').toEqual([])
  expect(await smallControls(page), 'controls under 44px').toEqual([])
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  await shot(page, 'community-boss')
})
