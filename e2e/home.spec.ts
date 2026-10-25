// Home, the area hub that replaced the Map: the area plate opens its details, AREAS opens the area list (with a
// search that finds Pokémon too), CONTINUE plays the area, and every sheet is a proper dialog.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  createInstance,
  linearAreas,
  newRegionBlock,
  regionAreas,
  regionOf,
  startRegion,
  type Region,
  type SaveData,
} from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

async function seriousAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target}`)
}

test('the area plate opens its details, and Esc gives focus back to it', async ({ page }) => {
  const save = makeSave(4)
  const area = data.areas.find((a) => a.id === save.currentAreaId)!
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: `Exploring ${area.name}` })).toBeAttached()

  const plate = page.getByRole('button', { name: new RegExp(`^${escape(area.name)}`) }).first()
  await plate.click()
  const sheet = page.getByRole('dialog', { name: area.name })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'CONTINUE HERE' })).toBeVisible()
  expect(await seriousAxe(page)).toEqual([])

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(plate).toBeFocused()
})

test('AREAS lists the region, and its search finds areas by Pokémon', async ({ page }) => {
  await boot(page, makeSave(4))
  await page.goto('/home')
  await page.getByRole('button', { name: 'Areas: change where you explore' }).click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await expect(sheet).toBeVisible()
  const cards = sheet.getByRole('list').first().getByRole('listitem')
  const all = await cards.count()
  expect(all).toBeGreaterThan(5)

  await sheet.getByLabel('Search an area or a Pokémon').fill('pikachu')
  await expect(sheet.getByRole('button', { name: /^Viridian Forest/ })).toBeVisible()
  expect(await cards.count()).toBeLessThan(all)
  expect(await seriousAxe(page)).toEqual([])

  // The Regions view is a switch inside the same sheet.
  await sheet.getByRole('button', { name: 'Regions' }).click()
  await expect(page.getByRole('dialog', { name: 'Regions' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the Areas sheet has one red GO, where the story goes on; the others are navy', async ({ page }) => {
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const cleared = { roundsDone: 1, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }
  const areaProgress = Object.fromEntries(chain.slice(0, 3).map((a) => [a.id, cleared]))
  await boot(page, { ...base, areaProgress, currentAreaId: chain[0]!.id })
  await page.goto('/home')
  await page.getByRole('button', { name: 'Areas: change where you explore' }).click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  const gos = sheet.getByRole('button', { name: /^(Go to|Play) / })
  expect(await gos.count()).toBeGreaterThan(2)
  const red = sheet.locator('button.frame-primary', { hasText: 'GO' })
  await expect(red).toHaveCount(1)
  await expect(red).toHaveAccessibleName(`Go to ${chain[3]!.name}`)
  await expect(sheet.getByRole('button', { name: `Play ${chain[0]!.name}` })).toHaveClass(/frame-dark/)
})

test("a region's GO opens that region's areas, in the same sheet", async ({ page }) => {
  // Kanto's league is won and Johto begun: Kanto waits, parked, in the Regions view.
  const league = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
  const kanto = makeSave(4)
  const won = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
  // The helpers' data has Kanto alone (no regions.json), so Johto's row comes from the file the game reads.
  const rows: Region[] = JSON.parse(
    readFileSync(new URL('../src/data/regions.json', import.meta.url), 'utf8'),
  )
  const johto = rows.find((r) => r.id === 'johto')!
  let c = 0
  const block = newRegionBlock(
    johto,
    johto.starters[1]!,
    data,
    Date.now(),
    () => `e2e-j-${++c}`,
    createInstance,
  )
  // Elite Rebattle's pop-up, which a won league opens, already seen.
  const done: SaveData = {
    ...kanto,
    areaProgress: { ...kanto.areaProgress, [league]: won },
    events: { seen: ['rebattle'] },
  }
  await boot(page, startRegion(done, johto, block))
  await page.goto('/home')
  await page.getByRole('button', { name: 'Areas: change where you explore' }).click()
  await page.getByRole('dialog', { name: 'Johto' }).getByRole('button', { name: 'Regions' }).click()

  const regions = page.getByRole('dialog', { name: 'Regions' })
  await regions.getByRole('button', { name: 'Kanto: switch to this region and see its areas' }).click()
  // The sheet stays open on Kanto's areas, focus on the Regions switch.
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await expect(sheet).toBeVisible()
  await expect(page.getByText('Welcome back to Kanto')).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: new RegExp(`^${escape(regionAreas(data, 'kanto')[0]!.name)}`) }),
  ).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Regions' })).toBeFocused()

  // The region you're in goes back to its areas too.
  await sheet.getByRole('button', { name: 'Regions' }).click()
  await regions.getByRole('button', { name: 'Kanto, you are here. Back to its areas' }).click()
  await expect(sheet).toBeVisible()
  expect(await seriousAxe(page)).toEqual([])
})

test('CONTINUE plays the area on /area, and an idle /area goes back Home', async ({ page }) => {
  await boot(page, makeSave(4))
  await page.goto('/area')
  await expect(page).toHaveURL(/\/home$/)
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await expect(page).toHaveURL(/\/area$/)
  // In an area the page's own buttons are the way out (the rework): no tab bar.
  await expect(page.getByRole('navigation', { name: 'Menus' })).toHaveCount(0)
})

test("Home's squares are only for what's open, with no line about what opens next", async ({ page }) => {
  await boot(page, makeSave(4))
  await page.goto('/home')
  // A new game: nothing is open yet, so no square at all (no locked Day Care, Versus or events placeholder), and no
  // "Coming up" line either (the rework: less text).
  await expect(page.getByText(/^Coming up:/)).toHaveCount(0)
  const squares = page.getByRole('region', { name: 'Shortcuts' }).getByRole('button')
  await expect(squares).toHaveCount(0)
  await expect(page.getByText('Special events')).toHaveCount(0)
  expect(await seriousAxe(page)).toEqual([])

  // Twenty species caught (the Day Care's rules already read): its square, and the line moves on to Versus.
  const later = await page.context().newPage()
  const caught = Array.from({ length: 20 }, (_, i) => i + 1)
  const dayCare = { residents: [], guests: [], eggClaimed: false, visited: true }
  await boot(later, makeSave(4, { pokedex: caught, dayCare }))
  await later.goto('/home')
  const open = later.getByRole('region', { name: 'Shortcuts' }).getByRole('button')
  await expect(open).toHaveCount(1)
  await expect(open.first()).toHaveAccessibleName(/^Day Care/)
})

test('a new region: its partner is picked in the lab, from three Poké Balls', async ({ page }) => {
  // Kanto's league is won: Johto is on offer, and its pop-up opens by itself.
  const league = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
  const save = makeSave(4)
  const won = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
  await boot(page, { ...save, areaProgress: { ...save.areaProgress, [league]: won } })
  await page.goto('/home')
  await page.getByRole('button', { name: 'Go to Johto' }).click()

  const lab = page.getByRole('dialog', { name: 'Pick your partner in Johto' })
  await expect(lab).toBeVisible()
  // A ball opens; "not this one" puts it back, and another one is asked about.
  await lab.getByRole('button', { name: 'Poké Ball 1 of 3' }).click()
  await expect(lab.getByText('Do you want to pick Chikorita?')).toBeVisible()
  expect(await seriousAxe(page)).toEqual([])
  await lab.getByRole('button', { name: 'Not this one' }).click()
  await lab.getByRole('button', { name: 'Poké Ball 2 of 3' }).click()
  await lab.getByRole('button', { name: 'Pick Cyndaquil' }).click()
  // LET'S GO! loads and goes by itself: Johto begins in its first area, its first encounter under way (never Home).
  await expect(lab).toHaveCount(0, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').region)).toBe('johto')
})
