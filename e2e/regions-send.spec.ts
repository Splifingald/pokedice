// Sending a Pokémon to another region (docs/05 decision 9): from its sheet, to any region started, league won or not.
// One above that region's best waits there, locked, the way a small world's Pokémon goes home (docs/26 §1).
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  createInstance,
  newRegionBlock,
  regionSpecies,
  sendPokemonOn,
  startRegion,
  switchRegion,
  type BundleRaw,
  type SaveData,
} from '../src/engine'
import { FAST, makeSave, mockSupabase } from './helpers'

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
const PIDGEY = 16

/** In Kanto with a Lv.40 Pidgey in the Box; Johto started on its Lv.5 starter, its league far ahead. */
function kantoWithJohto(): SaveData {
  const kanto = makeSave(4)
  const pidgey = createInstance(PIDGEY, 40, data, 'e2e-pidgey', Date.now())
  const save = { ...kanto, box: [...kanto.box, pidgey], pokedex: [...kanto.pokedex, PIDGEY] }
  let c = 0
  const block = newRegionBlock(
    johto,
    johto.starters[0]!,
    data,
    Date.now(),
    () => `e2e-j-${++c}`,
    createInstance,
  )
  return switchRegion(startRegion(save, johto, block), 'kanto')
}

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? 'null') as SaveData)

test('a Pokémon above the region’s best is sent there locked, without its league won', async ({ page }) => {
  expect(regionSpecies(data, 'johto').has(PIDGEY)).toBe(true)
  await boot(page, kantoWithJohto())
  await page.goto('/team')
  await page
    .getByRole('button', { name: /Pidgey/ })
    .first()
    .click()
  // A PC: the sheet stands docked beside the Box (docs/43 §5.4), a region named for the Pokémon.
  const sheet = page.getByRole('region', { name: 'Pidgey' })
  await expect(
    sheet.getByText(
      'Pidgey waits in your Johto Box, locked, until one of your Pokémon there reaches Lv.40 (your best: Lv.5).',
    ),
  ).toBeVisible()
  await sheet.getByRole('button', { name: 'Send to Johto' }).click()
  await sheet.getByRole('button', { name: 'Sure? Tap again' }).click()
  await expect(
    page.getByText(
      'Pidgey is waiting in your Johto Box, locked until one of your Pokémon there reaches Lv.40.',
    ),
  ).toBeVisible()

  await expect
    .poll(async () => (await stored(page)).events?.worldHome?.map((h) => [h.inst.dex, h.region, h.from]))
    .toEqual([[PIDGEY, 'johto', 'kanto']])
  const s = await stored(page)
  expect(s.box.map((p) => p.dex)).not.toContain(PIDGEY)
  expect(s.parked?.johto?.box.map((p) => p.dex)).not.toContain(PIDGEY)
})

test('in the region it was sent to, it waits apart with where it came from', async ({ page }) => {
  await boot(page, switchRegion(sendPokemonOn(kantoWithJohto(), data, 'e2e-pidgey', 'johto')!, 'johto'))
  await page.goto('/team')
  await expect(page.getByRole('heading', { name: 'Waiting to unlock' })).toBeVisible()
  await page.getByRole('button', { name: 'Pidgey, Locked until Lv.40' }).click()
  // A PC: the sheet stands docked beside the Box (docs/43 §5.4), a region named for the Pokémon.
  const sheet = page.getByRole('region', { name: 'Pidgey' })
  await expect(sheet.getByText('Locked until Lv.40')).toBeVisible()
  await expect(sheet.getByText('Sent from Kanto')).toBeVisible()
  await expect(
    sheet.getByText(/joins your Johto Box once one of your Pokémon here reaches Lv\.40 \(your best: Lv\.5\)/),
  ).toBeVisible()
})
