// Between encounters (the rework, docs/15 §6): the Pokémon Center's healing on its page (nothing to press, once), a find
// on the way, staying in the area after a fight (no tab bar there, HOME the way back), Home's way to the furthest open
// area, the send-out step, and auto-mode switched on in the middle of a cleared area's battle.
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

/** The save's team, every one at `level` (short of evolving) and healed: its fights are won. */
const strong = (save: SaveData, level = 15): SaveData => {
  const box = save.box.map((p) => ({ ...p, level }))
  return { ...save, box: box.map((p) => ({ ...p, currentHp: instanceMaxHp(p, gameData()) })) }
}

/** Plays the fight on screen until its result's buttons show (ATTACK, the catch and its CONTINUE on the way). */
async function winFight(page: Page) {
  const back = page.getByRole('button', { name: '◂ Back', exact: true })
  for (let i = 0; i < 300 && !(await back.isVisible()); i++) {
    for (const name of ['ATTACK', 'CATCH', 'CONTINUE']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
  await expect(back).toBeVisible()
}

test('the Pokémon Center: the healing plays at the top and folds away, nothing to press; HOME / CONTINUE at the foot', async ({
  page,
}) => {
  // A tall phone: the page is short, and HOME / CONTINUE still sit at the screen's foot (no tab bar in an area).
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, hurt(makeSave(4)), MOTION_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()

  const healing = page.getByRole('img', { name: 'Healing…' })
  await expect(healing).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // It folds away by itself, and the team is there.
  await expect(healing).toHaveCount(0, { timeout: 8000 })
  await expect(page.getByRole('heading', { name: /^Team \(/ })).toBeVisible()

  await expect(page.getByRole('navigation', { name: 'Menus' })).toHaveCount(0)
  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  const bar = await next.boundingBox()
  expect(bar!.y + bar!.height).toBeGreaterThan(844 - 24)
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(844)

  // HOME leaves the Center (no tab bar in an area: it is the way out), with the tab bar back on Home.
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('navigation', { name: 'Menus' }).last()).toBeVisible()
})

test('a find on the way is a toast, and the fight after it starts at once', async ({ page }) => {
  const data = gameData()
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const area = chain.find((a) => a.lootPool.length && (a.encounterWeights.item ?? 0) > 0)!
  const areaProgress = { ...base.areaProgress }
  for (const a of chain.slice(0, chain.indexOf(area)))
    areaProgress[a.id] = { ...emptyProgress(), roundsDone: a.roundsToClear ?? 0, cleared: true, bossDefeated: true, gymsDefeated: [...a.gyms] }
  // An item on top of the deck (drawn from the end), a wild Pokémon under it.
  areaProgress[area.id] = { ...emptyProgress(), deck: ['wild', 'item'] }
  await boot(page, strong({ ...base, areaProgress, currentAreaId: area.id }))
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page.getByText(/^You found /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible({ timeout: 20_000 })
})

test('after a fight the player stays in the area: no tab bar, one gauge, HOME the way back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const base = makeSave(4)
  await boot(page, strong({ ...base, areaProgress: { ...base.areaProgress, [base.currentAreaId]: { ...emptyProgress(), deck: ['wild', 'wild'] } } }))
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await winFight(page)
  // The result in the battle's panel, its buttons at the foot.
  await expect(page.getByRole('button', { name: 'Next ▸', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '◂ Back', exact: true }).click()

  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('navigation', { name: 'Menus' })).toHaveCount(0)
  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  await expect(next).toBeEnabled()
  // The round's gauge once, under the area's name; none over the bar.
  await expect(page.getByRole('img', { name: 'This round: 1 of 2 encounters done' })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('navigation', { name: 'Menus' }).last()).toBeVisible()
})

test('Home offers the furthest open area of the region when the player is behind', async ({ page }) => {
  const data = gameData()
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const areaProgress = Object.fromEntries(chain.slice(0, 2).map((a) => [a.id, { ...emptyProgress(), cleared: true }]))
  await boot(page, { ...base, areaProgress, currentAreaId: chain[0]!.id })
  await page.goto('/home')

  const latest = chain[2]!
  // Standing in a cleared area: the big button itself is GO TO (no CONTINUE to replay it), and Stay here keeps the
  // free play.
  const go = page.getByRole('button', { name: `Go to ${latest.name}` })
  await expect(go).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Stay here · Cleared · free play' })).toBeVisible()
  await go.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(latest.name)
  // There now: nothing more to offer.
  await expect(go).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Stay here/ })).toHaveCount(0)
})

test('Stay here keeps the free play of a cleared area when the story goes on elsewhere', async ({ page }) => {
  const data = gameData()
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const areaProgress = Object.fromEntries(chain.slice(0, 2).map((a) => [a.id, { ...emptyProgress(), cleared: true }]))
  await boot(page, { ...base, areaProgress, currentAreaId: chain[0]!.id })
  await page.goto('/home')
  await page.getByRole('button', { name: /^Stay here/ }).click()
  // An encounter of the area the player stands in, its fight under way at once.
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible({ timeout: 20_000 })
})

test("the area's details count the rounds done over the rounds that clear it, past the goal too", async ({ page }) => {
  const data = gameData()
  const base = makeSave(4)
  const route = linearAreas(data, regionOf(base))[0]!
  const need = route.roundsToClear!
  const areaProgress = { ...base.areaProgress, [route.id]: { ...emptyProgress(), roundsDone: need + 1, cleared: true } }
  await boot(page, { ...base, areaProgress, currentAreaId: route.id })
  await page.goto('/home')
  // Home's area button opens the Areas sheet on the area's details (docs/43 §5.2).
  await page.locator('[data-area-button]').click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await expect(sheet.getByRole('heading', { name: route.name, level: 3 })).toBeVisible()
  await expect(sheet).toContainText(`${need + 1}/${need} round`)
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
  // Cleared, with the next area open: the big button goes there, and Stay here plays this one.
  await page.getByRole('button', { name: /^Stay here/ }).click()
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
  // A team of one has no one to pick: straight into the fight, no send-out step (docs/38 U5c).
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /^Send out/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'AUTO-MODE', exact: true })).toHaveCount(0)
})

test('the send-out step: the foe out, the first picked, whole names at 360 px, a tap picks, GO! sends it', async ({
  page,
}) => {
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
  await expect(page).toHaveURL(/\/area$/)
  // No pop-up: the cards under the foe, each with its white INFO, and one GO! at the foot.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  for (const name of ['Bulbasaur', 'Charmander', 'Butterfree']) {
    const el = page.getByRole('main').getByText(name, { exact: true }).last()
    await expect(el).toBeVisible()
    // Not cut: the whole name fits its box.
    expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
    await expect(page.getByRole('button', { name: `${name} info` })).toBeVisible()
  }
  const picked = page.getByRole('main').getByRole('button', { pressed: true })
  await expect(picked).toHaveCount(1)
  await expect(picked).toContainText('Bulbasaur')
  await expect(page.getByRole('button', { name: 'Send out Bulbasaur' })).toBeVisible()
  await page.getByRole('main').getByRole('button', { pressed: false }).filter({ hasText: 'Charmander' }).click()
  await expect(page.getByRole('main').getByRole('button', { pressed: true })).toContainText('Charmander')
  await page.getByRole('button', { name: 'Send out Charmander' }).click()
  await expect(page.getByRole('button', { name: /^Send out/ })).toHaveCount(0)
  await expect(page.getByText(/Go, Charmander!/)).toBeVisible({ timeout: 20_000 })
})
