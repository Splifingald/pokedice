// Trick or Treat (docs/29, docs/15 §28): a card on top of the area's deck, the preview, the rules once, the screen laid
// out as the battle (full screen: the stage with the ghost and its plate, the message, the gauge with its value and
// what the last step added, TREAT and TRICK BALL), a Treat, Trick Balls until it's caught or flees, the result card
// and back on the trail; INFO shows the rules again; with animations on, the buttons wait and the die shows once the
// ball stops; switched off, the card is never played; a 360 × 640 phone keeps everything on screen, axe finds nothing
// serious. Every roll is the engine's, so each test follows whichever way the ghost goes.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })
const data = gameData()
const save0 = makeSave(4)
const AREA = save0.currentAreaId
/** Trick or Treat switched on for everyone, Gastly the area's one ghost. */
const TRICK_ON = {
  ...EVENTS_ON,
  trickOrTreat: {
    ...DEFAULT_CONFIG.trickOrTreat,
    access: 'all',
    areas: { [AREA]: [{ dex: 92, tier: 'common' }] },
  },
}

/** The save with a Trick or Treat card on top of its area's deck. */
const withCard = (s: SaveData = save0): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [AREA]: { ...emptyProgress(), deck: ['wild', 'trick'] } },
})

async function boot(page: Page, save: SaveData, devConfig: object | null = TRICK_ON, settings = FAST) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      if (c) localStorage.setItem('pokedice.devConfig', c)
    },
    [JSON.stringify(save), settings, devConfig ? JSON.stringify(devConfig) : ''],
  )
}

/** The step has played: TRICK BALL is back, or it's over and the result card's CONTINUE is up. */
async function settled(page: Page) {
  const ball = page.getByRole('button', { name: 'Trick Ball', exact: true })
  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  await expect(async () => {
    if (await next.isVisible()) return
    expect(await ball.isEnabled()).toBe(true)
  }).toPass({ timeout: 12_000 })
}

/** Trick Balls until the ghost is caught or flees (a miss pushes the gauge, so it always ends). */
async function playOut(page: Page) {
  const ball = page.getByRole('button', { name: 'Trick Ball', exact: true })
  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  for (let i = 0; i < 12 && !(await next.isVisible()); i++) {
    await settled(page)
    if (await next.isVisible()) break
    await ball.click()
  }
  await expect(next).toBeVisible({ timeout: 8000 })
  return next
}

test('a Trick or Treat card: the preview, the rules once, a Treat, Trick Balls, the result, back on the trail', async ({
  page,
}) => {
  await boot(page, withCard())
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()

  const preview = page.getByRole('dialog', { name: /trick or treat/i })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Gastly', { exact: true })).toBeVisible()
  await expect(preview.getByText('Common')).toBeVisible()
  await preview.getByRole('button', { name: /trick or treat!/i }).click()

  // The rules, the first time a ghost floats in.
  const rules = page.getByRole('dialog', { name: 'Trick or Treat' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('Trick Balls', { exact: true })).toBeVisible()
  await rules.getByRole('button', { name: /let's go/i }).click()
  await expect(rules).toHaveCount(0)

  // The ghost over its area, and its gauge.
  await expect(page.getByRole('img', { name: /Gastly \(Lv\.\d+\) floats over the area/ })).toBeVisible()
  const gauge = page.getByRole('meter', { name: 'Trick or Treat gauge' })
  // It starts anywhere in the first section (0–39 for a common ghost), at random.
  const start = Number(await gauge.getAttribute('aria-valuenow'))
  expect(start).toBeGreaterThanOrEqual(0)
  expect(start).toBeLessThan(40)
  await expect(gauge).toHaveAttribute('aria-valuetext', /a Trick Ball needs 6/)

  // Laid out as the battle: full screen (no tab bar), the plate on the stage, the gauge's value in numbers.
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('group', { name: /Gastly/ })).toBeVisible()
  await expect(page.getByText('/100', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Needs 6' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Treat', exact: true }).click()
  await expect(page.getByText(/gobbled the Treat|Too many Treats/)).toBeVisible()
  await settled(page)
  const added = Number(await gauge.getAttribute('aria-valuenow')) - start
  expect(added).toBeGreaterThanOrEqual(DEFAULT_CONFIG.trickOrTreat.treatMin)
  expect(added).toBeLessThanOrEqual(DEFAULT_CONFIG.trickOrTreat.treatMax)
  // What it added, beside the value.
  await expect(page.getByText(`+${added}`, { exact: true })).toBeVisible()

  const next = await playOut(page)
  // The result card, as a battle's.
  await expect(page.getByRole('dialog', { name: /Gastly (caught!|fled)/ })).toBeVisible()
  const caught = await page.getByText('Gastly caught!').isVisible()
  if (caught) {
    await expect(page.getByRole('dialog').getByText('Gotcha!')).toBeVisible()
    await expect(page.getByText(/joined your team|went to your Box/)).toBeVisible()
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData,
    )
    expect(saved.pokedex).toContain(92)
  } else await expect(page.getByText('Gastly fled')).toBeVisible()
  // Back on the area's page (the rework: no line about it), its CONTINUE for the next card.
  await next.click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeVisible()

  // A second ghost: no rules pop-up this time, and INFO shows them again.
  const later = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData,
  )
  expect(later.trickOrTreat?.rulesSeen).toBe(true)
})

test('INFO shows the rules again; with animations on, a Treat plays and the buttons wait for it', async ({
  page,
}) => {
  await boot(page, withCard({ ...save0, trickOrTreat: { rulesSeen: true } }), TRICK_ON, MOTION_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page
    .getByRole('dialog', { name: /trick or treat/i })
    .getByRole('button', { name: /trick or treat!/i })
    .click()
  await expect(page.getByRole('dialog', { name: 'Trick or Treat' })).toHaveCount(0)

  const treat = page.getByRole('button', { name: 'Treat', exact: true })
  await treat.click()
  // Mid-animation: both buttons wait.
  await expect(treat).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Trick Ball', exact: true })).toBeDisabled()
  await expect(page.getByText(/gobbled the Treat|Too many Treats/)).toBeVisible()

  await page.getByRole('button', { name: /Info/ }).last().click()
  const rules = page.getByRole('dialog', { name: 'Trick or Treat' })
  await expect(rules).toBeVisible()
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(rules).toHaveCount(0)

  // A Trick Ball, played: the buttons wait through the throw and the wobbles; the die shows once the ball stops.
  await settled(page)
  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  if (await next.isVisible()) return
  const ball = page.getByRole('button', { name: 'Trick Ball', exact: true })
  await ball.click()
  await expect(ball).toBeDisabled()
  await expect(page.getByRole('img', { name: /^Catch die: \d$/ })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /^Catch die: \d$/ })).toBeVisible({ timeout: 12_000 })
  await expect(page.getByText(/Gotcha!|broke free|vanished/).first()).toBeVisible()
})

test('FLEE leaves the ghost be: straight back on the trail, nothing caught', async ({ page }) => {
  await boot(page, withCard({ ...save0, trickOrTreat: { rulesSeen: true } }))
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page
    .getByRole('dialog', { name: /trick or treat/i })
    .getByRole('button', { name: /trick or treat!/i })
    .click()
  await page.getByRole('button', { name: 'FLEE', exact: true }).click()
  await expect(page.getByText('Got away safely!')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trick Ball', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /Gastly (caught!|fled)/ })).toHaveCount(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData)
  expect(saved.pokedex).not.toContain(92)
})

test('switched off, the card is never played: the next card comes instead', async ({ page }) => {
  await boot(page, withCard(), EVENTS_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  // A wild Pokémon instead, straight into its fight (the rework: no preview).
  await expect(page.getByRole('heading', { level: 1, name: /^Battle: .* against a wild / })).toBeAttached({ timeout: 15_000 })
  await expect(page.getByRole('dialog', { name: /trick or treat/i })).toHaveCount(0)
})

test('a 360 × 640 phone: the stage, the gauge and both buttons fit, nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, withCard({ ...save0, trickOrTreat: { rulesSeen: true } }))
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page
    .getByRole('dialog', { name: /trick or treat/i })
    .getByRole('button', { name: /trick or treat!/i })
    .click()
  for (const name of ['Treat', 'Trick Ball', 'FLEE', 'Trick or Treat gauge']) {
    const el = name.endsWith('gauge')
      ? page.getByRole('meter', { name })
      : page.getByRole('button', { name, exact: true })
    const box = await el.boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(640)
    if (!name.endsWith('gauge')) expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  // The stage on top, as wide as the screen, as the battle's.
  const stage = await page.getByRole('img', { name: /floats over the area/ }).boundingBox()
  expect(stage!.y).toBeLessThan(4)
  expect(stage!.width).toBeGreaterThanOrEqual(355)
  // INFO at the foot, still on screen.
  const info = await page.getByRole('button', { name: /Info/ }).last().boundingBox()
  expect(info!.y + info!.height).toBeLessThanOrEqual(640)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  expect(data.species[92]?.name).toBe('Gastly')
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([])

  // The result card fits too.
  const next = await playOut(page)
  // Once it has risen.
  await expect(async () => {
    const card = await next.boundingBox()
    expect(card!.y + card!.height).toBeLessThanOrEqual(640)
  }).toPass({ timeout: 5000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test('the kitchen sink shows every piece, with no error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await boot(page, save0)
  await page.goto('/kitchen-sink')
  await expect(page.getByText(/^Trick or Treat: the gauge of each tier/)).toBeVisible({ timeout: 30_000 })
  expect(await page.getByRole('meter', { name: 'Trick or Treat gauge' }).count()).toBeGreaterThanOrEqual(12)
  // The screen in each of its states, and the result cards.
  for (const state of [
    'Idle',
    'After a Treat (+23)',
    'A throw playing: wobbles, Gotcha! (loops)',
    'Fled after a miss',
  ])
    await expect(page.getByText(state, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'The caught result card' }).click()
  const card = page.getByRole('dialog', { name: 'Gastly caught!' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: 'Rules (first time)' }).click()
  await expect(page.getByRole('dialog', { name: 'Trick or Treat' })).toBeVisible()
  expect(errors).toEqual([])
})
