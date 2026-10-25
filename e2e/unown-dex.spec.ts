// The Unown Pokédex (docs/41) against the mocked Supabase, on a phone: switched off, nothing (no banner in the Ruins of
// Alph, no Unown page); on, its rules pop up once (Let's go! opens the page), the page shows the 28 letters with the
// ones found, INFO shows the rules again, Home's banner sits above the scene in the ruins and leads to the page; a page
// finished while the switch was off pays its prize the day it opens, once.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  createInstance,
  EVENT_IDS,
  linearAreas,
  newRegionBlock,
  progressOf,
  startRegion,
  UNOWN_LETTERS,
  type BundleRaw,
  type SaveData,
} from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
// The game reads regions.json too; the helpers' data is Kanto alone.
const data = compileGameData({
  pokemon: load('pokemon.json'),
  typeChart: load('type-chart.json'),
  diceTypes: load('dice-types.json'),
  areas: load('areas.json'),
  trainers: load('trainers.json'),
  upgrades: load('upgrades.json'),
  items: load('items.json'),
  config: load('config.json'),
  regions: load('regions.json'),
  eggGroups: load('egg-groups.json'),
} as BundleRaw)
const johto = data.regions.find((r) => r.id === 'johto')!
const ruins = data.areas.find((a) => a.name === 'Ruins of Alph')!

/** A Johto save standing in the Ruins of Alph, its conditions met (Route 32 reached, 20 caught). */
function atRuins(patch: Partial<SaveData> = {}): SaveData {
  let c = 0
  const block = newRegionBlock(johto, johto.starters[0]!, data, Date.now(), () => `e2e-j-${++c}`, createInstance)
  const s = { ...startRegion(makeSave(4), johto, block), regionOfferSeen: ['johto'] }
  // Reaching an area is clearing the one before it: every Johto area up to it.
  const reach = ruins.unlockConditions!.flatMap((k) => (k.kind === 'area' ? [k.areaId] : []))
  const chain = linearAreas(data, 'johto')
  const last = Math.max(...reach.map((id) => chain.findIndex((a) => a.id === id)))
  const before = chain.slice(0, last).map((a) => a.id)
  return {
    ...s,
    currentAreaId: ruins.id,
    pokedex: [...new Set([...s.pokedex, ...Array.from({ length: 20 }, (_, i) => 152 + i)])],
    areaProgress: {
      ...s.areaProgress,
      ...Object.fromEntries(before.map((id) => [id, { ...progressOf(s, id), cleared: true }])),
    },
    events: { seen: [...EVENT_IDS] },
    // The Day Care's tutorial comes first in the queue for a save that has never been there.
    dayCare: { residents: [], guests: [], eggClaimed: false, ...s.dayCare, visited: true },
    unownDex: { johto: ['a', 'b'] },
    ...patch,
  }
}

const UNOWN_ON = { ...EVENTS_ON, unownDex: { access: 'all', reward: 1000 } }

async function boot(page: Page, save: SaveData, config: object = UNOWN_ON) {
  await page.setViewportSize({ width: 360, height: 640 })
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, cfg]) => {
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', cfg!)
    },
    [JSON.stringify(save), FAST, JSON.stringify(config)],
  )
}

const banner = (page: Page) => page.getByRole('region', { name: 'Unown Pokédex' })

test('switched off: no banner in the ruins, no Unown page, nothing pops up', async ({ page }) => {
  await boot(page, atRuins(), EVENTS_ON)
  await page.goto('/home')
  await page.waitForTimeout(600)
  await expect(page.getByRole('dialog', { name: 'Unown Pokédex' })).toHaveCount(0)
  await expect(banner(page)).toHaveCount(0)
  await page.goto('/pokedex?view=unown')
  await expect(page.getByRole('radio', { name: 'Unown' })).toHaveCount(0)
})

test('the rules once, Let’s go! to the page, the letters found, INFO, then the banner on Home', async ({ page }) => {
  await boot(page, atRuins())
  await page.goto('/home')
  const rules = page.getByRole('dialog', { name: 'Unown Pokédex' })
  await expect(rules).toBeVisible()
  await expect(rules).toContainText('28 letters')
  await expect(rules).toContainText('Always a new one')
  await expect(rules).toContainText('₽1,000')
  await rules.getByRole('button', { name: /Let's go/i }).click()

  await expect(page).toHaveURL(/\/pokedex\?view=unown/)
  await expect(
    page.getByRole('radiogroup', { name: 'Which Pokédex' }).getByRole('radio', { name: 'Unown' }),
  ).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('img', { name: '2/28 letters' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unown A, found' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unown B, found' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unown ?, not found yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Unown .*, (found|not found yet)$/ })).toHaveCount(28)
  await expect(page.getByText(/Every Unown you catch in Ruins of Alph is a new letter/)).toBeVisible()

  await page.getByRole('button', { name: /Unown Pokédex/ }).click()
  const info = page.getByRole('dialog', { name: 'Unown Pokédex' })
  await expect(info).toBeVisible()
  await info.getByRole('button', { name: 'OK', exact: true }).click()

  // Home, standing in the ruins: the banner above the scene, its count, and the way to the page.
  await page.goto('/home')
  await expect(banner(page)).toBeVisible()
  await expect(banner(page)).toContainText('2/28 letters · ₽1,000 for all')
  await page.waitForTimeout(400)
  await expect(page.getByRole('dialog', { name: 'Unown Pokédex' })).toHaveCount(0)
  const box = await banner(page).boundingBox()
  expect(box!.width).toBeLessThanOrEqual(360)
  await banner(page).getByRole('button', { name: 'See' }).click()
  await expect(page).toHaveURL(/\/pokedex\?view=unown/)
})

test('a page finished while it was off pays its prize the day it opens, once', async ({ page }) => {
  const done = atRuins({ unownDex: { johto: [...UNOWN_LETTERS] } })
  await boot(page, done)
  // Its page (where the rules don't pop up): seeing it is reading them, which writes the save.
  await page.goto('/pokedex?view=unown')
  await expect(page.getByText('UNOWN POKÉDEX COMPLETE!')).toBeVisible()
  await expect(page.getByText('All 28 letters found: ₽1,000 earned.')).toBeVisible()
  await expect(page.getByRole('button', { name: /, found$/ })).toHaveCount(28)
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
  await expect.poll(async () => (await stored()).unownDexSeen).toBe(true)
  expect((await stored()).gold).toBe(done.gold + 1000)
  expect((await stored()).unownDexPaid).toEqual(['johto'])
  await page.goto('/home')
  await expect(banner(page)).toContainText('All found · ₽1,000 earned')
  // Once: a reload pays nothing more.
  await page.reload()
  await expect(banner(page)).toBeVisible()
  expect((await stored()).gold).toBe(done.gold + 1000)
})
