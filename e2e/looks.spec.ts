// Trainer looks (docs/31) on a phone: switched off, the old free picker is still under the trainer card; on, a look
// not unlocked comes off, the row's rules pop up once (Let's go! opens the menu), the red dot counts the new looks
// on the avatar and the row, a look is worn from the grid, closing the menu takes the dot away, and in dusk every
// text keeps its contrast.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { regionSpecies, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const LOOKS_ON = { ...EVENTS_ON, looks: { access: 'all' } }

const save = (patch: Partial<SaveData> = {}, theme?: 'dark'): SaveData => {
  // The Day Care opens with the Pokédex these saves hold: been there already, so its tutorial stays away.
  const s = makeSave(4, {
    player: { name: 'Sam', character: 'green' },
    dayCare: { residents: [], guests: [], eggClaimed: true, visited: true },
    ...patch,
  })
  return { ...s, settings: { ...s.settings, ...JSON.parse(FAST), theme } }
}

/** Twenty of Kanto's Pokédex caught: the Youngster and the Lass are unlocked. */
const twenty = () => [...regionSpecies(gameData(), 'kanto')].slice(0, 20)

async function boot(page: Page, s: SaveData, config: object = LOOKS_ON) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSupabase(page)
  await page.addInitScript(
    ([sv, cfg]) => {
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', sv!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.devConfig', cfg!)
    },
    [JSON.stringify(s), JSON.stringify(config)],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData)

test('switched off, the free picker stays and nothing is taken off', async ({ page }) => {
  await boot(page, save({ player: { name: 'Sam', character: 'green', avatar: 'kanto/hiker' } }), EVENTS_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  const card = page.getByRole('dialog', { name: 'Trainer card' })
  await expect(card.getByRole('button', { name: 'Choose your look' })).toBeVisible()
  await expect(card.getByRole('button', { name: /Trainer looks/ })).toHaveCount(0)
  expect((await stored(page)).player?.avatar).toBe('kanto/hiker')
})

test('on: a look not unlocked comes off, the rules once, the menu and its red dot', async ({ page }) => {
  await boot(
    page,
    save({ pokedex: twenty(), player: { name: 'Sam', character: 'green', avatar: 'kanto/hiker' } }),
  )
  await page.goto('/home')
  // The Hiker isn't unlocked: back to the character, Leaf.
  await expect.poll(async () => (await stored(page)).player).toEqual({ name: 'Sam', character: 'green' })

  // Two looks unlocked and not seen: the avatar's dot says so.
  await page.getByRole('button', { name: 'Trainer menu, something new: 2' }).click()
  const card = page.getByRole('dialog', { name: 'Trainer card' })
  await expect(card.getByRole('button', { name: 'Choose your look' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Trainer looks, new: 2' }).click()

  // The rules, the first time.
  const rules = page.getByRole('dialog', { name: 'Trainer looks' })
  await expect(rules).toContainText('Catch and explore')
  await rules.getByRole('button', { name: /Let's go/i }).click()
  await expect.poll(async () => (await stored(page)).looks?.rulesSeen).toBe(true)

  const menu = page.getByRole('dialog', { name: 'Trainer looks' })
  const grid = menu.getByRole('radiogroup', { name: 'Unlocked' })
  await expect(grid.getByRole('radio')).toHaveCount(4)
  await expect(grid.getByRole('radio', { name: 'Leaf' })).toHaveAttribute('aria-checked', 'true')
  await expect(grid.getByRole('radio', { name: 'Lass · NEW' })).toBeVisible()
  // Locked: the next goals of Kanto, the one being played; Johto not started, one line.
  await expect(menu.getByText('Catch 35 Kanto Pokémon').first()).toBeVisible()
  await expect(menu.getByText('Reach Viridian Forest')).toBeVisible()
  await expect(menu.getByText('13 looks · start Johto to see them')).toBeVisible()

  await grid.getByRole('radio', { name: 'Lass · NEW' }).click()
  await expect.poll(async () => (await stored(page)).player?.avatar).toBe('kanto/lass')
  await expect(grid.getByRole('radio', { name: 'Lass · NEW' })).toHaveAttribute('aria-checked', 'true')

  // Closing the menu: the looks are seen, the dots go.
  await menu.getByRole('button', { name: 'Close' }).click()
  await expect(card.getByRole('button', { name: 'Trainer looks', exact: true })).toBeVisible()
  await expect
    .poll(async () => (await stored(page)).looks?.seen?.sort())
    .toEqual(['kanto/lass', 'kanto/youngster'])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Your trainer menu' })).toBeVisible()

  // INFO shows the rules again.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await card.getByRole('button', { name: 'Trainer looks', exact: true }).click()
  await page.getByRole('button', { name: 'Info: how Trainer looks works' }).click()
  await expect(page.getByRole('dialog', { name: 'Trainer looks' }).last()).toContainText(
    'Champions and collectors',
  )
})

test('the menu in dusk keeps every text readable', async ({ page }) => {
  await boot(page, save({ pokedex: twenty(), looks: { rulesSeen: true } }, 'dark'))
  await page.goto('/home')
  await page.getByRole('button', { name: /Trainer menu/ }).click()
  await page.getByRole('button', { name: /Trainer looks/ }).click()
  await expect(page.getByRole('radiogroup', { name: 'Unlocked' })).toBeVisible()
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  expect(
    violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`)),
  ).toEqual([])
})
