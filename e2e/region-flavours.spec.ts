// The region flavours (docs/62), played in the game with their switches on: rain on Routes 118 & 119 and its rules,
// the Route 111 desert's sandstorm wearing a Pokémon down, Galar's weather of the day, a Kalos horde and its pips, the
// Verdant Cavern's island trial, Klawf's Titan fight, and the kitchen sink's states. Each step leaves its picture in
// docs/62-region-flavours/ (the doc shows them).
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  compileGameData,
  createInstance,
  DEFAULT_CONFIG,
  emptyProgress,
  instanceMaxHp,
  linearAreas,
  newRegionBlock,
  startRegion,
  type BundleRaw,
  type RegionId,
  type SaveData,
} from '../src/engine'
import { makeSave, mockSupabase } from './helpers'

const SHOTS = 'docs/62-region-flavours'
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
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })
/** Motion on (the rain falls, the aura pulses), sound off. */
const SETTINGS = JSON.stringify({ sfx: false, sound: false })

const ON = {
  hoennWeather: { ...DEFAULT_CONFIG.hoennWeather, access: 'all' },
  galarWeather: { ...DEFAULT_CONFIG.galarWeather, access: 'all' },
  hordes: { ...DEFAULT_CONFIG.hordes, access: 'all', chance: 100, mixedChance: 0 },
  trials: { ...DEFAULT_CONFIG.trials, access: 'all' },
  titans: { ...DEFAULT_CONFIG.titans, access: 'all' },
}

/**
 * A save that has started `regionId`, standing in `name` with every area of the road before it cleared, its team (two
 * of its starter's line) raised to the area and healed, with this progress there.
 */
function standingIn(regionId: RegionId, name: string, progress: Partial<SaveData['areaProgress'][string]>, patch: Partial<SaveData> = {}): SaveData {
  const region = data.regions.find((r) => r.id === regionId)!
  let c = 0
  const block = newRegionBlock(region, region.starters[0]!, data, Date.now(), () => `e2e-${regionId}-${++c}`, createInstance)
  const base = { ...startRegion(makeSave(4), region, block), regionOfferSeen: data.regions.map((r) => r.id) }
  const road = linearAreas(data, regionId).sort((a, b) => a.orderIndex - b.orderIndex)
  const target = data.areas.find((a) => a.name === name && a.regionId === regionId)!
  const areaProgress: SaveData['areaProgress'] = {}
  for (const a of road) {
    if (a.orderIndex >= target.orderIndex) break
    areaProgress[a.id] = { ...emptyProgress(), cleared: true, roundsDone: a.roundsToClear ?? 1 }
  }
  areaProgress[target.id] = { ...emptyProgress(), ...progress }
  const lead = base.box.find((p) => base.team.includes(p.id))!
  const level = Math.max(lead.level, target.maxLevel + 4)
  const two = [lead, { ...lead, id: `${lead.id}-b`, dex: region.starters[1] ?? lead.dex }].map((p) => {
    const raised = { ...p, level }
    return { ...raised, currentHp: instanceMaxHp(raised, data) }
  })
  return {
    ...base,
    box: [...two, ...base.box.filter((p) => p.id !== lead.id)],
    team: two.map((p) => p.id),
    pokedex: [...new Set([...base.pokedex, ...two.map((p) => p.dex)])],
    currentAreaId: target.id,
    areaProgress,
    ...patch,
  }
}

async function boot(page: Page, save: SaveData, at = new Date('2026-11-01T12:00:00Z')) {
  await mockSupabase(page, { rpc: { event_time: { now: at.toISOString() } } })
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), SETTINGS, JSON.stringify(ON)],
  )
}

const goOn = async (page: Page) => {
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
}

/** The weather's rules, the first time in an area with weather: Let's go! closes them. */
async function passWeatherRules(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /Let's go/i }).click()
}

test.use({ viewport: { width: 1280, height: 860 } })

test('Hoenn: rain on Routes 118 & 119, its rules once, its chip, and a fight under it', async ({ page }) => {
  const save = standingIn('hoenn', 'Routes 118 & 119', { deck: ['wild', 'wild'], drawn: ['center'] })
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByRole('dialog', { name: "Hoenn's weather" })).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, '1-weather-rules-hoenn')
  await passWeatherRules(page, "Hoenn's weather")
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page.locator('[data-battle-weather="rain"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-weather-button="rain"]')).toBeVisible()
  await page.waitForTimeout(2500)
  await shot(page, '1-weather-rain-battle')
})

test('Hoenn: the Route 111 desert’s sandstorm wears a Pokémon down at its turn', async ({ page }) => {
  const save = standingIn('hoenn', 'Route 111 Desert & Mirage Tower', { deck: ['wild', 'wild'], drawn: ['center'] }, {
    flavours: { seen: ['hoennWeather'] },
  })
  await boot(page, save)
  await goOn(page)
  await expect(page.locator('[data-battle-weather="sand"]')).toBeVisible({ timeout: 20_000 })
  // Sent out, it is worn at its turn (the desert's Ground and Rock Pokémon are spared).
  await page.getByRole('button', { name: /^Send out/ }).first().click()
  await expect(page.getByText(/buffeted by the sandstorm/).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(300)
  await shot(page, '1-weather-sandstorm')
})

test('Hoenn: Castform takes its Rainy Form in the rain', async ({ page }) => {
  const base = standingIn('hoenn', 'Routes 118 & 119', { deck: ['wild', 'wild'], drawn: ['center'] }, { flavours: { seen: ['hoennWeather'] } })
  // Castform leads (the Weather Institute's gift).
  const lead = base.box.find((p) => p.id === base.team[0])!
  const shape = { ...lead, dex: 351, nickname: undefined }
  // Healed to its own max HP: a hurt team meets a Pokémon Center first.
  const castform = { ...shape, currentHp: instanceMaxHp(shape, data) }
  const save = { ...base, box: base.box.map((p) => (p.id === lead.id ? castform : p)), pokedex: [...base.pokedex, 351] }
  await boot(page, save)
  await goOn(page)
  await expect(page.locator('[data-battle-weather="rain"]')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /^Send out Castform/ }).first().click()
  await expect(page.getByText(/Castform became Water type/).first()).toBeVisible({ timeout: 30_000 })
  // A wild Castform here changes too, its line after yours.
  await page.waitForTimeout(3000)
  await shot(page, '1-weather-castform')
})

test('Galar: the Wild Area’s weather of the day, in its rules, by its name and in a fight', async ({ page }) => {
  const save = standingIn('galar', 'The Wild Area: Rolling Fields & Dappled Grove', { deck: ['wild', 'wild'], drawn: ['center'] })
  // A rainy day in the Rolling Fields (the server's clock says so; the weather is the day's, the same for everyone).
  await boot(page, save, new Date('2026-11-05T12:00:00Z'))
  await page.goto('/home')
  await expect(page.getByRole('dialog', { name: "Galar's weather" })).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, '2-weather-rules-galar')
  await passWeatherRules(page, "Galar's weather")
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page.locator('[data-weather-button="rain"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-battle-weather="rain"]')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(2500)
  await shot(page, '2-weather-galar-battle')
})

test('Kalos: a horde, its rules once, its banner, then two at a time', async ({ page }) => {
  const save = standingIn('kalos', 'Route 3 & Santalune City', { deck: ['wild', 'wild'], drawn: ['center'] })
  await boot(page, save)
  await goOn(page)
  await expect(page.getByRole('dialog', { name: 'Hordes' })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(400)
  await shot(page, '3-horde-rules')
  await page.getByRole('dialog', { name: 'Hordes' }).getByRole('button', { name: /Let's go/i }).click()
  await expect(page.locator('[data-horde="5"]')).toBeVisible()
  await page.waitForTimeout(800)
  await shot(page, '3-horde-preview')
  await page.getByRole('button', { name: /FIGHT/ }).click()
  await expect(page.getByText(/A horde of wild/).first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await shot(page, '3-horde-battle')
})

test('Alola: the Verdant Cavern’s trial, Totem Gumshoos calling its ally', async ({ page }) => {
  const route2 = data.areas.find((a) => a.name === 'Route 2 & the Verdant Cavern')!
  const save = standingIn('alola', 'Route 2 & the Verdant Cavern', { roundsDone: route2.roundsToClear ?? 1, drawn: ['center'] })
  await boot(page, save)
  await page.goto('/home')
  await page.getByRole('button', { name: /CHALLENGE CAPTAIN ILIMA/ }).first().click()
  await expect(page.getByRole('dialog', { name: 'Island trials' })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(400)
  await shot(page, '4-trial-rules')
  await page.getByRole('dialog', { name: 'Island trials' }).getByRole('button', { name: /Let's go/i }).click()
  await expect(page.locator('[data-trial="trial-verdant-cavern"]')).toBeVisible()
  // Its Z-Crystal: Normal-type Z-Moves.
  await expect(page.locator('[data-crystal="normal"]')).toBeVisible()
  await page.waitForTimeout(800)
  await shot(page, '4-trial-card')
  await page.getByRole('button', { name: /FIGHT/ }).click()
  await expect(page.getByText(/called for help/).first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(600)
  await shot(page, '4-trial-battle')
})

test('Alola: one trial per type, Plumeria’s at Hano Beach and its Poisonium Z', async ({ page }) => {
  const hano = data.areas.find((a) => a.name === 'Hano Beach & Aether Paradise')!
  const save = standingIn('alola', 'Hano Beach & Aether Paradise', { roundsDone: hano.roundsToClear ?? 1, drawn: ['center'] }, {
    flavours: { seen: ['trials'] },
  })
  await boot(page, save)
  await page.goto('/home')
  await page.getByRole('button', { name: /CHALLENGE TOTEM TOXAPEX/ }).first().click()
  await expect(page.locator('[data-trial="trial-hano-beach"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-crystal="poison"]')).toBeVisible()
  await page.waitForTimeout(800)
  await shot(page, '4-trial-poison-card')
})

test('Paldea: Klawf, the Stony Cliff Titan', async ({ page }) => {
  const cortondo = data.areas.find((a) => a.name === 'South Province (Area Three) & Cortondo')!
  const save = standingIn('paldea', 'South Province (Area Three) & Cortondo', {
    roundsDone: cortondo.roundsToClear ?? 1,
    gymsDefeated: cortondo.gyms,
    drawn: ['center'],
  })
  await boot(page, save)
  await page.goto('/home')
  await page.getByRole('button', { name: /FACE IT/ }).first().click()
  await expect(page.getByRole('dialog', { name: 'Titans' })).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(400)
  await shot(page, '5-titan-rules')
  await page.getByRole('dialog', { name: 'Titans' }).getByRole('button', { name: /Let's go/i }).click()
  await expect(page.locator('[data-titan="950"]')).toBeVisible()
  await page.waitForTimeout(800)
  await shot(page, '5-titan-card')
  await page.getByRole('button', { name: /FIGHT/ }).click()
  await expect(page.getByText(/The Titan Klawf attacks/).first()).toBeVisible({ timeout: 20_000 })
  // Past the boss's entrance, to the stage.
  await page.waitForTimeout(7000)
  await shot(page, '5-titan-battle')
})

test('the kitchen sink: every state of the region flavours', async ({ page }) => {
  await boot(page, makeSave(1))
  await page.goto('/kitchen-sink')
  const heading = page.getByRole('heading', { name: /The region flavours \(docs\/62\)/ })
  await heading.scrollIntoViewIfNeeded()
  await page.waitForTimeout(3000)
  const top = await heading.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 12)
  const next = page.getByRole('heading', { name: /^Trick or Treat: the gauge/ })
  const bottom = await next.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 24)
  const width = await page.evaluate(() => document.documentElement.clientWidth)
  await page.screenshot({ path: `${SHOTS}/0-kitchen-sink.png`, fullPage: true, clip: { x: 0, y: top, width, height: bottom - top } })
})
