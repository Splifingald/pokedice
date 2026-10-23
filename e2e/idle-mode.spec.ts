// Idle mode and the play styles (docs/36): switched on, a new game asks how to play before anything else, and Idle
// plays the area by itself until a catch waits for the player's throw; switched off, a new game starts as it always
// did. An existing save gets the rules once, keeps its old auto-mode as "Auto on explored areas", and switches style in
// Settings (INFO shows the rules again); switched off, Settings has no such panel.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyProgress, linearAreas, type SaveData } from '../src/engine'
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

/** Prof. Oak's words skipped, a character named, the third ball's partner picked: the game starts on Home. */
async function throughTheLab(page: Page) {
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await page.getByRole('radio', { name: 'Character 2' }).click()
  await page.getByLabel('Your name').fill('Sam')
  await page.getByRole('button', { name: 'NEXT ▸' }).click()
  await page.getByRole('button', { name: 'Poké Ball 3 of 3' }).click()
  await page.getByRole('button', { name: 'Pick Squirtle' }).click()
  await page.getByRole('button', { name: /let's go/i }).click()
  await expect(page).toHaveURL(/\/home$/)
}

test('switched on, a new game asks how to play first; Idle plays on until a catch waits', async ({
  page,
}) => {
  await bootNew(page, IDLE_ON)
  await page.goto('/new')
  await expect(page.getByRole('heading', { name: 'How do you want to play?' })).toBeVisible()
  const styles = page.getByRole('radiogroup', { name: 'Play style' })
  await expect(styles.getByRole('radio')).toHaveCount(3)
  const next = page.getByRole('button', { name: 'NEXT ▸' })
  await expect(next).toBeDisabled()
  await styles.getByRole('radio', { name: /^Idle mode/ }).click()
  await next.click()
  await throughTheLab(page)

  expect(await settings(page)).toMatchObject({ playStyle: 'idle', autoMode: true })
  // The question was its rules: no pop-up on top.
  await expect(page.getByRole('dialog', { name: 'Idle mode' })).toHaveCount(0)

  // One CONTINUE, then hands off: the area plays itself until a wild Pokémon waits for the throw.
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('button', { name: /^(ROLL TO CATCH|CATCH)$/ })).toBeVisible({ timeout: 90_000 })
})

test('Idle moves on by itself once the area is cleared', async ({ page }) => {
  const [first, second] = linearAreas(gameData(), 'kanto')
  const base = makeSave(4)
  // The first area cleared, one find left in its round: the find, then on to the next area, no tap.
  const areaProgress = {
    [first!.id]: { ...emptyProgress(), cleared: true, roundsDone: 3, deck: ['item' as const] },
  }
  const settings = { ...base.settings, ...JSON.parse(FAST), playStyle: 'idle' as const, autoMode: true }
  await bootSave(page, { ...base, areaProgress, settings, idle: { rulesSeen: true } }, IDLE_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page.getByText(`Now exploring ${second!.name}`)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^Idle mode: ON$/i })).toBeVisible()
  // The save follows (written a moment later).
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).currentAreaId))
    .toBe(second!.id)
})

test('switched off, a new game starts with Prof. Oak, as always', async ({ page }) => {
  await bootNew(page, EVENTS_ON)
  await page.goto('/new')
  await expect(page.getByRole('button', { name: 'Skip intro' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How do you want to play?' })).toHaveCount(0)
})

test('an existing save: the rules once, its auto-mode kept as explored areas, and Settings switches the style', async ({
  page,
}) => {
  const base = makeSave(4)
  await bootSave(
    page,
    { ...base, settings: { ...base.settings, ...JSON.parse(FAST), autoMode: true } },
    IDLE_ON,
  )
  await page.goto('/home')
  const rules = page.getByRole('dialog', { name: 'Idle mode' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('You throw the Poké Balls')).toBeVisible()
  await rules.getByRole('button', { name: 'Later' }).click()
  await expect(rules).toBeHidden()

  await page.goto('/settings')
  const styles = page.getByRole('radiogroup', { name: 'Play style' })
  await expect(styles.getByRole('radio', { name: /^Auto on explored areas/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await styles.getByRole('radio', { name: /^Idle mode/ }).click()
  await expect(styles.getByRole('radio', { name: /^Idle mode/ })).toHaveAttribute('aria-checked', 'true')
  expect(await settings(page)).toMatchObject({ playStyle: 'idle', autoMode: true })
  // Arrow keys move the pick, as in every radio group.
  await page.keyboard.press('ArrowUp')
  await expect(styles.getByRole('radio', { name: /^Auto on explored areas/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  expect(await settings(page)).toMatchObject({ playStyle: 'explored', autoMode: false })

  await page.getByRole('button', { name: 'Info: how Idle mode works' }).click()
  await expect(rules).toBeVisible()
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(rules).toBeHidden()

  // Seen once: back Home, no pop-up again.
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
  await bootSave(page, { ...base, settings, idle: { rulesSeen: true } }, IDLE_ON)
  await page.goto('/settings')
  await expect(page.getByRole('radio', { name: /^Idle mode/ })).toHaveAttribute('aria-checked', 'true')
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))).toEqual([])
})
