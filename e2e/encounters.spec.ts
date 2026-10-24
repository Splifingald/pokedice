// Between encounters: the Pokémon Center's healing (SKIP, and no second jingle after a trip Home), staying in the area
// after an encounter, the action bars pinned over the phone tab bar, and Home's way to the furthest open area.
// Auto-mode switched on in the middle of a cleared area's battle.
import { expect, test, type Page } from '@playwright/test'
import { emptyProgress, instanceMaxHp, linearAreas, regionOf, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })

async function boot(page: Page, save: SaveData, settings = FAST) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), settings],
  )
}

const hurt = (save: SaveData): SaveData => ({ ...save, box: save.box.map((p) => ({ ...p, currentHp: 1 })) })

test('the Pokémon Center: SKIP ends the healing, and back from Home it opens on the team', async ({ page }) => {
  // A tall phone: the page is short, and HOME / CONTINUE still sit right on the tab bar.
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, hurt(makeSave(4)), MOTION_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()

  const healing = page.getByRole('dialog', { name: 'Healing…' })
  await expect(healing).toBeVisible()
  await healing.getByRole('button', { name: /SKIP/ }).click()
  await expect(healing).toHaveCount(0)

  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  const bar = await next.boundingBox()
  const tabs = await page.getByRole('navigation', { name: 'Menus' }).last().boundingBox()
  expect(bar!.y + bar!.height).toBeGreaterThan(tabs!.y - 16)
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(tabs!.y)

  // Home, then back: the team is healed already, so no jingle again.
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByText('You are in the Pokémon Center')).toBeVisible()
  await expect(healing).toHaveCount(0)
})

test('Escape ends the healing too', async ({ page }) => {
  await boot(page, hurt(makeSave(4)), MOTION_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  const healing = page.getByRole('dialog', { name: 'Healing…' })
  await expect(healing).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(healing).toHaveCount(0)
})

test('after an encounter the player stays in the area; HOME is the way back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const data = gameData()
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const area = chain.find((a) => a.lootPool.length && (a.encounterWeights.item ?? 0) > 0)!
  const areaProgress = { ...base.areaProgress }
  for (const a of chain.slice(0, chain.indexOf(area)))
    areaProgress[a.id] = { ...emptyProgress(), roundsDone: a.roundsToClear ?? 0, cleared: true, bossDefeated: true, gymsDefeated: [...a.gyms] }
  // An item on top of the deck: the next encounter is a find.
  areaProgress[area.id] = { ...emptyProgress(), deck: ['wild', 'item'] }
  await boot(page, { ...base, areaProgress, currentAreaId: area.id })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page.getByRole('button', { name: /PICK IT UP/ }).click()

  // Still in the area: the team, and what comes next.
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByText('Back on the trail')).toBeVisible()
  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  await expect(next).toBeEnabled()
  // The round's gauge is on the pinned bar too, right over its buttons.
  const gauges = page.getByRole('img', { name: 'This round: 1 of 2 encounters done' })
  await expect(gauges).toHaveCount(2)
  const barGauge = await gauges.last().boundingBox()
  const nextBox = await next.boundingBox()
  expect(barGauge!.y + barGauge!.height).toBeLessThanOrEqual(nextBox!.y)
  expect(nextBox!.y - (barGauge!.y + barGauge!.height)).toBeLessThan(16)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
})

test('Home offers the furthest open area of the region when the player is behind', async ({ page }) => {
  const data = gameData()
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const areaProgress = Object.fromEntries(chain.slice(0, 2).map((a) => [a.id, { ...emptyProgress(), cleared: true }]))
  await boot(page, { ...base, areaProgress, currentAreaId: chain[0]!.id })
  await page.goto('/home')

  const latest = chain[2]!
  const go = page.getByRole('button', { name: `Go to ${latest.name}` })
  await go.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(latest.name)
  // There now: nothing more to offer.
  await expect(go).toHaveCount(0)
})

test("the area's details count the rounds done over the rounds that clear it, past the goal too", async ({ page }) => {
  const data = gameData()
  const base = makeSave(4)
  const route = linearAreas(data, regionOf(base))[0]!
  const need = route.roundsToClear!
  const areaProgress = { ...base.areaProgress, [route.id]: { ...emptyProgress(), roundsDone: need + 1, cleared: true } }
  await boot(page, { ...base, areaProgress, currentAreaId: route.id })
  await page.goto('/home')
  await page.getByRole('button', { name: /Open the area details/ }).click()
  await expect(page.getByRole('dialog', { name: route.name })).toContainText(`${need + 1}/${need} round`)
})

test("a cleared area's battle can go on auto midway, and STOP hands it back", async ({
  page,
}) => {
  const base = makeSave(4)
  const area = base.currentAreaId
  const progress = (cleared: boolean) => ({ ...emptyProgress(), cleared, deck: ['wild' as const, 'wild' as const] })
  const autoMode = page.getByRole('button', { name: 'AUTO-MODE', exact: true })
  const stop = page.getByRole('button', { name: 'STOP', exact: true })
  const attack = page.getByRole('button', { name: 'ATTACK', exact: true })

  await boot(page, { ...base, areaProgress: { ...base.areaProgress, [area]: progress(true) } })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page.getByRole('button', { name: /FIGHT/ }).first().click()
  // Your turn, played by hand: the dice wait for ATTACK, and AUTO-MODE sits among the extras.
  await expect(attack).toBeVisible({ timeout: 20_000 })
  await expect(stop).toHaveCount(0)
  await autoMode.click()
  // On auto: the note and STOP instead of the controls, the setting kept for the next fights.
  await expect(page.getByText('Both sides fight on their own.')).toBeVisible()
  await expect(autoMode).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.settings')!).autoMode)).toBe(true)
  // STOP, if the fight is still on, gives the controls back (and AUTO-MODE again).
  if (await stop.isVisible()) {
    await stop.click()
    await expect(autoMode).toBeVisible()
  }
})

test("an area that isn't cleared has no AUTO-MODE in its battles", async ({ page }) => {
  const base = makeSave(4)
  const area = base.currentAreaId
  await boot(page, { ...base, areaProgress: { ...base.areaProgress, [area]: { ...emptyProgress(), deck: ['wild'] } } })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  // A team of one has no one to pick: no "Send out" (docs/38 U5c).
  const preview = page.getByRole('dialog', { name: 'You encountered a wild Pokémon!' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Send out:')).toHaveCount(0)
  await page.getByRole('button', { name: /FIGHT/ }).first().click()
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'AUTO-MODE', exact: true })).toHaveCount(0)
})

test('the preview sends out the lead: a white SENT OUT, whole names at 360 px, SWITCH picks another', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const base = makeSave(1)
  const lead = base.box[0]!
  // At full HP: a hurt team would open the round with a Pokémon Center.
  const mons = [
    { ...lead, id: 'e2e-charmander', dex: 4 },
    { ...lead, id: 'e2e-butterfree', dex: 12 },
  ].map((p) => ({ ...p, currentHp: instanceMaxHp(p, gameData()) }))
  await boot(page, {
    ...base,
    box: [...base.box, ...mons],
    team: [...base.team, ...mons.map((p) => p.id)],
    areaProgress: { ...base.areaProgress, [base.currentAreaId]: { ...emptyProgress(), deck: ['wild'] } },
  })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  const preview = page.getByRole('dialog', { name: 'You encountered a wild Pokémon!' })
  await expect(preview.getByText('Send out:', { exact: true })).toBeVisible()
  for (const name of ['Bulbasaur', 'Charmander', 'Butterfree']) {
    const el = preview.getByText(name, { exact: true })
    await expect(el).toBeVisible()
    // Not cut: the whole name fits its box.
    expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  }
  const picked = preview.getByRole('button', { pressed: true })
  await expect(picked).toHaveCount(1)
  await expect(picked).toHaveText(/SENT OUT/i)
  await expect(picked).not.toHaveClass(/frame-primary|frame-deep/)
  await preview.getByRole('button', { name: 'Send out Charmander' }).click()
  await expect(preview.getByRole('button', { name: 'Send out Charmander' })).toHaveAttribute('aria-pressed', 'true')
  await expect(preview.getByRole('button', { name: 'Send out Bulbasaur' })).toHaveText(/SWITCH/i)
})
