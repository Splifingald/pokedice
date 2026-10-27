// Home (docs/43 §5.2): the scene on top with no plate over it, the PLAY dock (the area button and CONTINUE) pinned at
// the foot of a phone and heading the column beside the scene on PC; the Areas sheet opening on the area's details,
// its list and regions as tabs (side by side on PC); one card for everything open; the notices that replaced the
// arrival pop-ups. Every sheet is a proper dialog.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  badgeCase,
  createInstance,
  DEFAULT_CONFIG,
  linearAreas,
  newRegionBlock,
  progressOf,
  regionAreas,
  regionOf,
  startRegion,
  type Region,
  type SaveData,
} from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase, nonJerseyText, smallControls } from './helpers'

const data = gameData()
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PHONE = { width: 390, height: 844 }

async function boot(page: Page, save: SaveData, config: object = {}) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      // Once: a reload keeps what the game saved.
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
      // Prof. Oak's invite already closed: each test meets the notice it is about.
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [JSON.stringify(save), FAST, JSON.stringify(config)],
  )
}

async function seriousAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target}`)
}

/** The first `n` badges of the region being played won. */
function withBadges(save: SaveData, n: number): SaveData {
  let out = save
  for (const b of badgeCase(save, data).slice(0, n)) {
    const p = progressOf(out, b.areaId)
    out = {
      ...out,
      areaProgress: {
        ...out.areaProgress,
        [b.areaId]: { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] },
      },
    }
  }
  return out
}

/** Home's area button: its name starts with the area's. */
const areaButton = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${escape(name)}, `) })

test('a phone: the area\'s banner on the scene, the scene at 70 %, CONTINUE pinned over the tab bar, every target 44 px', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  const save = makeSave(4)
  const area = data.areas.find((a) => a.id === save.currentAreaId)!
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: `Exploring ${area.name}` })).toBeAttached()

  // The area's banner stands on top of the scene, as before (the user's call, 2026-10-27).
  const scene = page.getByRole('region', { name: area.name })
  await expect(scene.getByRole('img')).toBeVisible()
  const button = areaButton(page, area.name)
  const go = page.getByRole('button', { name: 'CONTINUE', exact: true })
  const sceneBox = (await scene.boundingBox())!
  const buttonBox = (await button.boundingBox())!
  const goBox = (await go.boundingBox())!
  expect(buttonBox.y).toBeGreaterThanOrEqual(sceneBox.y - 1)
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(sceneBox.y + sceneBox.height / 2)
  // The scene shows about 70 % of its height (its full shape is 288:276).
  expect(sceneBox.height).toBeLessThan(sceneBox.width * (276 / 288) * 0.75)
  expect(sceneBox.height).toBeGreaterThan(sceneBox.width * (276 / 288) * 0.65)
  // CONTINUE ends right over the 60 px tab bar.
  expect(goBox.y + goBox.height).toBeLessThanOrEqual(PHONE.height - 60)
  expect(goBox.y + goBox.height).toBeGreaterThan(PHONE.height - 60 - 24)
  expect(buttonBox.height).toBeGreaterThanOrEqual(44)
  expect(await smallControls(page)).toEqual([])
  expect(await nonJerseyText(page)).toEqual([])
  expect(await seriousAxe(page)).toEqual([])

  // 360×640: nothing scrolls sideways, CONTINUE still in view.
  await page.setViewportSize({ width: 360, height: 640 })
  await expect(go).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})

test('the area button opens the Areas sheet on its details, and Esc gives focus back to it', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  const save = makeSave(4)
  const area = data.areas.find((a) => a.id === save.currentAreaId)!
  await boot(page, save)
  await page.goto('/home')
  const button = areaButton(page, area.name)
  await button.click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await expect(sheet).toBeVisible()
  // Its first view is the area's details: the tab, the area's name, and the way to play it.
  await expect(sheet.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
  await expect(sheet.getByRole('heading', { name: area.name, level: 3 })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'CONTINUE HERE' })).toBeVisible()
  expect(await seriousAxe(page)).toEqual([])

  // A row of the list opens its details in the same sheet.
  await sheet.getByRole('tab', { name: /All areas/ }).click()
  const first = regionAreas(data, 'kanto')[0]!
  await sheet
    .getByRole('button', { name: new RegExp(`^${escape(first.name)}`) })
    .first()
    .click()
  await expect(sheet.getByRole('heading', { name: first.name, level: 3 })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(button).toBeFocused()
})

test('All areas lists the region, and its search finds areas by Pokémon; Regions is a tab of the same sheet', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  const save = makeSave(4)
  await boot(page, save)
  await page.goto('/home')
  await areaButton(page, data.areas.find((a) => a.id === save.currentAreaId)!.name).click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await sheet.getByRole('tab', { name: /All areas/ }).click()
  const cards = sheet.getByRole('list').first().getByRole('listitem')
  const all = await cards.count()
  expect(all).toBeGreaterThan(5)

  await sheet.getByLabel('Search an area or a Pokémon').fill('pikachu')
  await expect(sheet.getByRole('button', { name: /^Viridian Forest/ })).toBeVisible()
  expect(await cards.count()).toBeLessThan(all)
  expect(await smallControls(page)).toEqual([])
  expect(await seriousAxe(page)).toEqual([])

  await sheet.getByRole('tab', { name: 'Regions' }).click()
  await expect(page.getByRole('dialog', { name: 'Regions' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('PC: the scene as tall as the window on the left, PLAY on the right; the sheet shows the list and the details side by side', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const save = makeSave(4)
  const area = data.areas.find((a) => a.id === save.currentAreaId)!
  await boot(page, save)
  await page.goto('/home')
  const scene = (await page.getByRole('region', { name: area.name }).boundingBox())!
  const go = (await page.getByRole('button', { name: 'CONTINUE', exact: true }).boundingBox())!
  expect(go.x).toBeGreaterThan(scene.x + scene.width)
  expect(go.y).toBeLessThan(300)
  // As tall as the window, less the top bar and the page's padding.
  expect(scene.height).toBeGreaterThan(900 - 56 - 80)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

  await areaButton(page, area.name).click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await expect(sheet.getByRole('heading', { name: area.name, level: 3 })).toBeVisible()
  const rows = sheet.getByRole('list').first().getByRole('listitem')
  expect(await rows.count()).toBeGreaterThan(5)
  // A row shows its details beside the list, which stays.
  const first = regionAreas(data, 'kanto')[0]!
  await sheet
    .getByRole('button', { name: new RegExp(`^${escape(first.name)}`) })
    .first()
    .click()
  await expect(sheet.getByRole('heading', { name: first.name, level: 3 })).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(5)
  expect(await seriousAxe(page)).toEqual([])
})

test('the Areas sheet has one red GO, where the story goes on; the others are navy', async ({ page }) => {
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const cleared = { roundsDone: 1, cleared: true, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] }
  const areaProgress = Object.fromEntries(chain.slice(0, 3).map((a) => [a.id, cleared]))
  await boot(page, { ...base, areaProgress, currentAreaId: chain[0]!.id })
  await page.goto('/home')
  await areaButton(page, chain[0]!.name).click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  const gos = sheet.getByRole('button', { name: /^(Go to|Play) / })
  expect(await gos.count()).toBeGreaterThan(2)
  // Nothing else red in the sheet: the details beside the list play or travel in navy.
  await expect(sheet.locator('.frame-primary')).toHaveCount(1)
  const red = sheet.locator('button.frame-primary', { hasText: 'GO' })
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
  const save = startRegion(done, johto, block)
  await boot(page, save)
  await page.goto('/home')
  // Johto's areas aren't in the helpers' data: the button by its mark.
  await page.locator('[data-area-button]').click()
  await page.getByRole('dialog', { name: 'Johto' }).getByRole('tab', { name: 'Regions' }).click()

  const regions = page.getByRole('dialog', { name: 'Regions' })
  await regions.getByRole('button', { name: 'Kanto: switch to this region and see its areas' }).click()
  // The toast first: it goes after a few seconds. The sheet stays open on Kanto's areas, focus on the list's tab.
  await expect(page.getByText('Welcome back to Kanto')).toBeVisible()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await expect(sheet).toBeVisible()
  await expect(
    sheet.getByRole('button', { name: new RegExp(`^${escape(regionAreas(data, 'kanto')[0]!.name)}`) }),
  ).toBeVisible()
  await expect(sheet.getByRole('tab', { name: /All areas/ })).toBeFocused()

  // The region you're in goes back to its areas too.
  await sheet.getByRole('tab', { name: 'Regions' }).click()
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

test("Home's cards are only for what's open; the line under them names what opens next", async ({
  page,
  browser,
}) => {
  await boot(page, makeSave(4))
  await page.goto('/home')
  // A new game: nothing is open yet, so no card at all (no locked Day Care, Versus or events placeholder), and one
  // line naming the next thing to open.
  const cards = page.getByRole('region', { name: 'Shortcuts' }).getByRole('button')
  await expect(cards).toHaveCount(0)
  await expect(page.getByText(/^Coming up: Day Care/)).toBeVisible()
  await expect(page.getByText('Special events')).toHaveCount(0)
  expect(await seriousAxe(page)).toEqual([])

  // Twenty species caught (the Day Care's rules already read): its card, and the line moves on.
  // A context of its own: the first page's save stays in its own storage.
  const later = await (await browser.newContext()).newPage()
  const caught = Array.from({ length: 20 }, (_, i) => i + 1)
  const dayCare = { residents: [], guests: [], eggClaimed: false, visited: true }
  await boot(later, makeSave(4, { pokedex: caught, dayCare }))
  await later.goto('/home')
  const open = later.getByRole('region', { name: 'Shortcuts' }).getByRole('button')
  await expect(open).toHaveCount(1)
  await expect(open.first()).toHaveAccessibleName(/^Day Care/)
  await expect(later.getByText(/^Coming up: Day Care/)).toHaveCount(0)
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
  // LET'S GO! waits for the tap (no button presses itself, 2026-10-27); Johto begins in its first area, its first
  // encounter under way (never Home).
  await lab.getByRole('button', { name: /^let's go/i }).click()
  await expect(lab).toHaveCount(0, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/area$/)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').region))
    .toBe('johto')
})

test('a region put off waits on Home as its picture: GO opens the lab, NOT NOW puts it away', async ({ page }) => {
  const league = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
  const save = makeSave(4)
  const won = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
  await boot(page, { ...save, areaProgress: { ...save.areaProgress, [league]: won } })
  await page.goto('/home')
  await page.getByRole('dialog', { name: 'Johto awaits' }).getByRole('button', { name: 'Not yet' }).click()
  const notice = page.getByRole('region', { name: 'Johto is available' })
  await expect(notice).toBeVisible()
  // GO: the professor's lab for Johto, at once.
  await notice.getByRole('button', { name: 'GO', exact: true }).click()
  const lab = page.getByRole('dialog', { name: 'Pick your partner in Johto' })
  await expect(lab).toBeVisible()
  await lab.getByRole('button', { name: 'Not now' }).click()
  // NOT NOW: the notice goes for good on this device (the Regions view keeps the offer).
  await notice.getByRole('button', { name: 'Not now', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Johto is available' })).toHaveCount(0)
})

test('Support me is a notice on Home at the 5th badge, never a pop-up; its flag keeps it away', async ({
  page,
}) => {
  const donation = { ...DEFAULT_CONFIG.donation, enabled: true, kofiUrl: 'https://ko-fi.com/example' }
  await boot(page, withBadges(makeSave(4), 5), { donation })
  await page.goto('/home')
  const notice = page.getByRole('region', { name: 'Support me' })
  await expect(notice).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // SUPPORT ME opens the three asks; their OK counts as this region's showing.
  await notice.getByRole('button', { name: 'SUPPORT ME', exact: true }).click()
  const asks = page.getByRole('dialog', { name: 'Support me' })
  await asks.getByRole('button', { name: 'OK' }).click()
  await expect(notice).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).donationSeen?.regions))
    .toEqual(['kanto'])
  await page.reload()
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeVisible()
  await expect(notice).toHaveCount(0)
})
