// Idle mode and the play styles (docs/36): a new game never asks how to play (it starts on "Auto on explored areas"),
// and Idle plays the area by itself, catches included — a new Pokémon with the cheapest ball sure to do it (never the
// Master Ball), one already owned left — with no rules pop-up ever. An existing save keeps its old auto-mode as "Auto
// on explored areas" and switches style in Settings (INFO shows the rules); switched off, Settings has no such panel.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyProgress, instanceMaxHp, linearAreas, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const IDLE_ON = { ...EVENTS_ON, idleMode: { access: 'all' } }

async function bootNew(page: Page, config: object) {
  await mockSupabase(page)
  await page.addInitScript(
    ([f, c]) => {
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [FAST, JSON.stringify(config)],
  )
}

async function bootSave(page: Page, save: SaveData, config: object) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, c]) => {
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), JSON.stringify(config)],
  )
}

const settings = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('pokedice.settings') ?? '{}') as Record<string, unknown>,
  )

/** The lab at once (the rework), the third ball's partner picked: LET'S GO! goes by itself, into the first area. */
async function throughTheLab(page: Page) {
  await page.getByRole('button', { name: 'Poké Ball 3 of 3' }).click()
  await page.getByRole('button', { name: 'Pick Squirtle' }).click()
  await expect(page).toHaveURL(/\/area$/)
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData)

test('switched on, a new game asks nothing: the lab first, on "Auto on explored areas"', async ({ page }) => {
  await bootNew(page, IDLE_ON)
  await page.goto('/new')
  await expect(page.getByRole('radiogroup', { name: 'Play style' })).toHaveCount(0)
  await throughTheLab(page)

  expect((await settings(page)).playStyle).toBeUndefined()
  await expect(page.getByRole('dialog', { name: 'Idle mode' })).toHaveCount(0)

  // Settings has the two styles, the default picked.
  await page.goto('/settings')
  const styles = page.getByRole('radiogroup', { name: 'Play style' })
  await expect(styles.getByRole('radio')).toHaveCount(2)
  await expect(styles.getByRole('radio', { name: /^Auto on explored areas/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

/** The team's Pokémon, fully evolved so no evolution adds to the Pokédex. */
const OWN = [3, 4, 6, 9]

/**
 * Three at Lv.50 (a full team: a catch asks "Add to team?"), standing in `areaId` with one wild card on top of its
 * deck, the area before it cleared, Idle on.
 */
function idleAt(areaId: string, patch: Partial<SaveData> = {}): SaveData {
  const data = gameData()
  const [first] = linearAreas(data, 'kanto')
  const base = makeSave(4)
  const lead = base.box.find((p) => p.id === base.team[0])!
  const team = [
    { ...lead, dex: 6, level: 50 },
    { ...lead, id: 'e2e-blastoise', dex: 9, level: 50 },
    { ...lead, id: 'e2e-venusaur', dex: 3, level: 50 },
  ].map((p) => ({ ...p, currentHp: instanceMaxHp(p, data) }))
  const areaProgress = {
    ...(first!.id !== areaId && { [first!.id]: { ...emptyProgress(), cleared: true, roundsDone: 3 } }),
    [areaId]: { ...emptyProgress(), deck: ['wild' as const] },
  }
  return {
    ...base,
    box: [...base.box.filter((p) => p.id !== lead.id), ...team],
    team: team.map((p) => p.id),
    pokedex: OWN,
    currentAreaId: areaId,
    areaProgress,
    settings: { ...base.settings, ...JSON.parse(FAST), playStyle: 'idle', autoMode: true },
    ...patch,
  }
}

/**
 * Into the area from Home, then hands off: the fight, the catch panel (shown, never tapped), the result card come and
 * gone; then Idle paused, so the next card doesn't play.
 */
async function oneWildFight(page: Page) {
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('button', { name: /^(ROLL TO CATCH|CATCH)$|Throw it$/ }).first()).toBeVisible({ timeout: 60_000 })
  // The result in the battle's panel (the rework), named as the old card's title was.
  const victory = page.getByRole('region', { name: 'VICTORY!' })
  await expect(victory).toBeVisible({ timeout: 15_000 })
  await expect(victory).toBeHidden({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Idle mode: ON$/i }).click()
  // The save is written a moment after the store.
  await page.waitForTimeout(1500)
}

test('Idle catches a new Pokémon itself: the cheapest ball sure to catch it, never the Master Ball', async ({
  page,
}) => {
  test.setTimeout(120_000)
  // Routes 22 & 2: Mankey and the Nidoran (catch value 2) need a Poké Ball, as certain as a Great Ball and cheaper;
  // the others (value 1) need no ball at all. None of them owned yet.
  const [, route2] = linearAreas(gameData(), 'kanto')
  const inventory = { 'poke-ball': 5, 'great-ball': 5, 'master-ball': 1 }
  const start = idleAt(route2!.id, { inventory })
  await bootSave(page, start, IDLE_ON)
  await oneWildFight(page)

  const save = await stored(page)
  const caught = save.pokedex.filter((d) => !OWN.includes(d))
  expect(caught).toHaveLength(1)
  const needsBall = [56, 29, 32].includes(caught[0]!)
  expect(save.inventory).toMatchObject({ 'poke-ball': needsBall ? 4 : 5, 'great-ball': 5, 'master-ball': 1 })
  // "Add to team?" answered no, as Idle changes no team: the catch is in the Box.
  expect(save.team).toEqual(start.team)
  expect(save.box.some((p) => p.dex === caught[0] && !save.team.includes(p.id))).toBe(true)
})

test('Idle leaves a Pokémon it already owns: no ball, the weaker copy kept', async ({ page }) => {
  test.setTimeout(120_000)
  // Route 1: Pidgey and Rattata, both owned at Lv.1, so a stronger one would be on offer to replace them.
  const [route1] = linearAreas(gameData(), 'kanto')
  const base = idleAt(route1!.id)
  const weak = [16, 19].map((dex, i) => ({
    ...base.box[0]!,
    id: `e2e-weak-${i}`,
    dex,
    level: 1,
    xp: 0,
    currentHp: 1,
  }))
  const inventory = { 'poke-ball': 5, 'great-ball': 5 }
  await bootSave(
    page,
    { ...base, box: [...base.box, ...weak], pokedex: [...base.pokedex, 16, 19], inventory },
    IDLE_ON,
  )
  await oneWildFight(page)

  const save = await stored(page)
  expect(save.inventory).toMatchObject(inventory)
  expect(save.box.filter((p) => p.id.startsWith('e2e-weak-')).map((p) => p.level)).toEqual([1, 1])
  expect(save.pokedex).toEqual([...OWN, 16, 19])
})

test('Idle moves on by itself once the area is cleared', async ({ page }) => {
  const [first, second] = linearAreas(gameData(), 'kanto')
  const base = makeSave(4)
  // The first area cleared, one find left in its round: the find, then on to the next area, no tap.
  const areaProgress = {
    [first!.id]: { ...emptyProgress(), cleared: true, roundsDone: 3, deck: ['item' as const] },
  }
  const settings = { ...base.settings, ...JSON.parse(FAST), playStyle: 'idle' as const, autoMode: true }
  await bootSave(page, { ...base, areaProgress, settings }, IDLE_ON)
  await page.goto('/home')
  // Cleared, with the next area open: the big button is GO TO it; Stay here plays the find left here first.
  await page.getByRole('button', { name: /^Stay here/ }).click()
  await expect(page.getByText(`Now exploring ${second!.name}`)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^Idle mode: ON$/i })).toBeVisible()
  // The save follows (written a moment later).
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).currentAreaId))
    .toBe(second!.id)
})

test('switched off, a new game starts in the lab, as always (the rework: no intro first)', async ({ page }) => {
  await bootNew(page, EVENTS_ON)
  await page.goto('/new')
  await expect(page.getByRole('button', { name: 'Poké Ball 1 of 3' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Play style' })).toHaveCount(0)
})

test('an existing save: no rules pop-up, its auto-mode kept as explored areas, Settings switches the style', async ({
  page,
}) => {
  const base = makeSave(4)
  await bootSave(
    page,
    { ...base, settings: { ...base.settings, ...JSON.parse(FAST), autoMode: true } },
    IDLE_ON,
  )
  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true }).first()).toBeVisible()
  // Idle has no rules pop-up, ever (the user's ask): its rules are INFO's, in Settings.
  const rules = page.getByRole('dialog', { name: 'Idle mode' })
  await expect(rules).toHaveCount(0)

  await page.goto('/settings')
  const styles = page.getByRole('radiogroup', { name: 'Play style' })
  await expect(styles.getByRole('radio', { name: /^Auto on explored areas/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await styles.getByRole('radio', { name: /^Idle mode/ }).click()
  await expect(styles.getByRole('radio', { name: /^Idle mode/ })).toHaveAttribute('aria-checked', 'true')
  expect(await settings(page)).toMatchObject({ playStyle: 'idle', autoMode: true })
  await expect(rules).toHaveCount(0)
  // Arrow keys move the pick, as in every radio group.
  await page.keyboard.press('ArrowUp')
  await expect(styles.getByRole('radio', { name: /^Auto on explored areas/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  expect(await settings(page)).toMatchObject({ playStyle: 'explored', autoMode: false })

  await page.getByRole('button', { name: 'Info: how Idle mode works' }).click()
  await expect(rules).toBeVisible()
  await expect(rules.getByText('It catches by itself')).toBeVisible()
  await expect(rules.getByText(/never the Master Ball/)).toBeVisible()
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(rules).toBeHidden()

  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true }).first()).toBeVisible()
  await expect(rules).toHaveCount(0)
})

test('switched off, Settings has no play style and no rules pop up', async ({ page }) => {
  await bootSave(page, makeSave(4), EVENTS_ON)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Play style' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Idle mode' })).toHaveCount(0)
})

test('the cards keep their contrast in dusk, and the page no serious issue', async ({ page }) => {
  const base = makeSave(4)
  const settings = { ...base.settings, ...JSON.parse(FAST), theme: 'dark' as const, playStyle: 'idle' as const }
  await bootSave(page, { ...base, settings }, IDLE_ON)
  await page.goto('/settings')
  await expect(page.getByRole('radio', { name: /^Idle mode/ })).toHaveAttribute('aria-checked', 'true')
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))).toEqual([])
})
