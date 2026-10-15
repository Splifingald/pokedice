// Trick or Treat (docs/28): a card on top of the area's deck, the preview, the rules once, the ghost over its area
// with its gauge, a Treat, Trick Balls until it's caught or flees, the result and back on the trail; INFO shows the
// rules again; switched off, the card is never played; a 360 × 640 phone keeps everything on screen. Every roll is the
// engine's, so each test follows whichever way the ghost goes.
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

/** Trick Balls until the ghost is caught or flees (a miss pushes the gauge, so it always ends). */
async function playOut(page: Page) {
  const ball = page.getByRole('button', { name: 'Trick Ball', exact: true })
  const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
  for (let i = 0; i < 12 && !(await next.isVisible()); i++) {
    await expect(ball.or(next).first()).toBeEnabled({ timeout: 8000 })
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
  await expect(gauge).toHaveAttribute('aria-valuenow', '0')
  await expect(gauge).toHaveAttribute('aria-valuetext', /a Trick Ball needs 6/)

  await page.getByRole('button', { name: 'Treat', exact: true }).click()
  await expect(page.getByText(/gobbled the Treat|Too many Treats/)).toBeVisible()
  const after = Number(await gauge.getAttribute('aria-valuenow'))
  expect(after).toBeGreaterThanOrEqual(DEFAULT_CONFIG.trickOrTreat.treatMin)
  expect(after).toBeLessThanOrEqual(DEFAULT_CONFIG.trickOrTreat.treatMax)

  const next = await playOut(page)
  const caught = await page.getByText('Gastly caught!').isVisible()
  if (caught) {
    await expect(page.getByText(/joined your team|went to your Box/)).toBeVisible()
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData,
    )
    expect(saved.pokedex).toContain(92)
  } else await expect(page.getByText('Gastly fled')).toBeVisible()
  // The card was the round's: its icon on the gauge over the bar.
  await next.click()
  await expect(page.getByText('Back on the trail')).toBeVisible()

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
})

test('switched off, the card is never played: the next card comes instead', async ({ page }) => {
  await boot(page, withCard(), EVENTS_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: /wild Pokémon/i })).toBeVisible()
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
  for (const name of ['Treat', 'Trick Ball']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(640)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  expect(data.species[92]?.name).toBe('Gastly')
})

test('the kitchen sink shows every piece, with no error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await boot(page, save0)
  await page.goto('/kitchen-sink')
  await expect(page.getByText(/^Trick or Treat: the gauge of each tier/)).toBeVisible({ timeout: 30_000 })
  expect(await page.getByRole('meter', { name: 'Trick or Treat gauge' }).count()).toBeGreaterThanOrEqual(12)
  await page.getByRole('button', { name: 'Rules (first time)' }).click()
  await expect(page.getByRole('dialog', { name: 'Trick or Treat' })).toBeVisible()
  expect(errors).toEqual([])
})
