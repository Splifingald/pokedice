// The Rotom Room and the Rotom Pokédex (docs/73) against the mocked Supabase, on a phone: switched off, the room is
// nowhere (no banner, no Rotom page); on, the week's form is pinned once the time is known, the page shows it and the
// five forms, INFO shows the rules, opening the page ends Home's notice, Home's banner sits above the scene in the room;
// this week's form caught, CONTINUE and the banner say when it's back; all five, the shiny Rotom comes once.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  createInstance,
  EVENT_IDS,
  linearAreas,
  newRegionBlock,
  progressOf,
  ROTOM_FORM_DEXES,
  startRegion,
  weekId,
  type BundleRaw,
  type SaveData,
} from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
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
const sinnoh = data.regions.find((r) => r.id === 'sinnoh')!
const room = data.areas.find((a) => a.name === 'The Rotom Room')!

/** A Sinnoh save, its whole chain (the League too) cleared, standing in the Rotom Room. */
function inRoom(patch: Partial<SaveData> = {}): SaveData {
  let c = 0
  const block = newRegionBlock(sinnoh, sinnoh.starters[0]!, data, Date.now(), () => `e2e-s-${++c}`, createInstance)
  const s = { ...startRegion(makeSave(4), sinnoh, block), regionOfferSeen: ['sinnoh', 'unova'] }
  const team = s.box.map((p) => ({ ...p, level: 62 }))
  return {
    ...s,
    box: team,
    currentAreaId: room.id,
    areaProgress: {
      ...s.areaProgress,
      ...Object.fromEntries(linearAreas(data, 'sinnoh').map((a) => [a.id, { ...progressOf(s, a.id), cleared: true }])),
    },
    events: { seen: [...EVENT_IDS] },
    dayCare: { residents: [], guests: [], eggClaimed: false, ...s.dayCare, visited: true },
    leaderboardVisited: true,
    versusRulesSeen: true,
    shinyDexSeen: true,
    ...patch,
  }
}

const ROTOM_ON = { ...EVENTS_ON, rotomRoom: { access: 'all', prizeLevel: 60 } }

async function boot(page: Page, save: SaveData, config: object = ROTOM_ON) {
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

const banner = (page: Page) => page.getByRole('region', { name: 'Rotom Pokédex', exact: true })
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
const thisWeek = () => weekId(Date.now())

test('switched off: no room, no banner, no Rotom page', async ({ page }) => {
  await boot(page, inRoom({ currentAreaId: sinnoh.leagueAreaId! }), EVENTS_ON)
  await page.goto('/home')
  await page.waitForTimeout(600)
  await expect(banner(page)).toHaveCount(0)
  await page.goto('/pokedex?view=rotom')
  await expect(page.getByRole('radio', { name: 'Rotom' })).toHaveCount(0)
  expect((await stored(page)).rotomRoom).toBeUndefined()
})

test('on: the week’s form pinned, the page with its card and five forms, INFO, then the banner on Home', async ({ page }) => {
  await boot(page, inRoom({ rotomDex: [10008] }))
  await page.goto('/pokedex')
  // The week's form is pinned once the time is known: one the player doesn't own.
  await expect.poll(async () => (await stored(page)).rotomRoom?.week).toBe(thisWeek())
  const form = (await stored(page)).rotomRoom.form as number
  expect(ROTOM_FORM_DEXES.filter((d) => d !== 10008)).toContain(form)
  const name = data.species[form]!.name

  await page.getByRole('radiogroup', { name: 'Which Pokédex' }).getByRole('radio', { name: 'Rotom' }).click()
  await expect(page).toHaveURL(/\/pokedex\?view=rotom/)
  await expect.poll(async () => (await stored(page)).rotomDexSeen).toBe(true)
  await expect(page.getByRole('img', { name: '1/5 forms' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Heat Rotom, caught' })).toBeVisible()
  await expect(page.getByRole('button', { name: `${name}, not caught yet` })).toBeVisible()
  await expect(page.getByRole('button', { name: /Rotom, (caught|not caught yet)$/ })).toHaveCount(5)
  await expect(page.locator(`[data-rotom-week="${form}"]`)).toContainText(name)
  await expect(page.getByText(new RegExp(`This week in The Rotom Room: ${name}`))).toBeVisible()
  await expect(page.getByText(/Catch all 5 for a shiny Rotom \(Lv\.60\)/)).toBeVisible()

  await page.getByRole('button', { name: /Rotom Pokédex/ }).click()
  const info = page.getByRole('dialog', { name: 'Rotom Pokédex' })
  await expect(info).toBeVisible()
  await expect(info).toContainText('A form each week')
  await info.getByRole('button', { name: 'OK', exact: true }).click()

  await page.goto('/home')
  await expect(banner(page)).toBeVisible()
  await expect(banner(page)).toContainText(`This week: ${name} · 1/5 forms`)
  const box = await banner(page).boundingBox()
  expect(box!.width).toBeLessThanOrEqual(360)
  await banner(page).getByRole('button', { name: 'See' }).click()
  await expect(page).toHaveURL(/\/pokedex\?view=rotom/)
})

test('this week’s form caught: closed until Monday, the banner and CONTINUE say so', async ({ page }) => {
  const save = inRoom({
    rotomDex: [10008, 10009],
    pokedex: [...inRoom().pokedex, 10008, 10009, 479],
    rotomRoom: { week: thisWeek(), form: 10009 },
  })
  await boot(page, save)
  await page.goto('/home')
  await expect(banner(page)).toContainText(/Caught · back /)
  await expect(page.getByText(/Rotom caught: back .* with another form/)).toBeVisible()
  await page.goto('/pokedex?view=rotom')
  await expect(page.getByText(/This week's Rotom is caught\. Back .* with another form\./)).toBeVisible()
})

test('all five: the shiny Rotom joins once, the room closed for good', async ({ page }) => {
  const save = inRoom({ rotomDex: [...ROTOM_FORM_DEXES] })
  await boot(page, save)
  await page.goto('/pokedex?view=rotom')
  await expect(page.getByText('ROTOM POKÉDEX COMPLETE!')).toBeVisible()
  await expect(page.getByText('All 5 forms caught: a shiny Rotom (Lv.60) joined you.')).toBeVisible()
  await expect.poll(async () => (await stored(page)).rotomDexPaid).toBe(true)
  const shiny = (s: SaveData) => s.box.filter((p) => p.dex === 479 && p.shiny)
  expect(shiny(await stored(page))).toHaveLength(1)
  await page.goto('/home')
  await expect(banner(page)).toContainText('Complete')
  await page.reload()
  await expect(banner(page)).toBeVisible()
  expect(shiny(await stored(page))).toHaveLength(1)
})
