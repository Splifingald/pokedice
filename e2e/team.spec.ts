// The Team (docs/43 §5.4): the banner with the team roaming, the team as the one Pokémon card, the Box as tiles under
// one filter row (the search, then Sort & filter), a Pokémon's sheet as a bottom sheet on a phone and docked at the
// right on a PC, the lead's open from the start, its actions at its foot.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase, nonJerseyText, smallControls } from './helpers'

const data = gameData()

/** Charmander leads Pikachu and Geodude; seven in the Box, two of them Fire (Vulpix, Growlithe). */
function teamSave(): SaveData {
  const base = makeSave(4, { gold: 500 })
  let n = 0
  const mk = (dex: number, level: number) => createInstance(dex, level, data, `team-${++n}`, Date.now() + n)
  const extra = [mk(25, 21), mk(74, 20), mk(17, 20), mk(19, 14), mk(37, 6), mk(58, 12), mk(27, 15), mk(10, 9), mk(1, 8)]
  return {
    ...base,
    box: [...base.box, ...extra],
    team: [base.team[0]!, extra[0]!.id, extra[1]!.id],
    pokedex: [...new Set([...base.pokedex, ...extra.map((p) => p.dex)])],
    inventory: { potion: 2 },
  }
}

async function boot(page: Page, save: SaveData = teamSave()) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? 'null') as SaveData)

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target}`)

const card = (page: Page, name: RegExp) =>
  page.getByRole('list', { name: 'Your team, in send-out order' }).getByRole('button', { name })

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('one filter row: Sort & filter narrows the Box in one sheet, Clear filters brings it all back', async ({ page }) => {
    await boot(page)
    await page.goto('/team')
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible()
    // The count is the cards' (no "3/3" over them); the Center's rule is the sheet's, not a chip here.
    await expect(page.getByText('3/3')).toHaveCount(0)
    await expect(card(page, /^Charmander, Lv\.\d+, HP \d+\/\d+, lead$/)).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Box/ })).toContainText('7')

    // No segmented bar, no type dropdown: one button, which opens a sheet with both.
    await expect(page.getByRole('radiogroup', { name: 'Sort the Box' })).toHaveCount(0)
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await page.getByRole('button', { name: 'Sort & filter' }).click()
    const sheet = page.getByRole('dialog', { name: 'Sort & filter' })
    await sheet.getByRole('radio', { name: 'Level' }).click()
    await sheet.getByRole('radio', { name: 'Fire' }).click()
    await expect(sheet.getByRole('button', { name: 'Show 2' })).toBeVisible()
    expect(await smallControls(page)).toEqual([])
    await sheet.getByRole('button', { name: 'Show 2' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sort & filter: 2 set' })).toBeFocused()
    await expect(page.getByRole('heading', { name: /^Box/ })).toContainText('2 of 7')
    // By level: Growlithe (Lv.12) before Vulpix (Lv.6).
    const tiles = page.locator('#box-title ~ ul button')
    await expect(tiles).toHaveCount(2)
    await expect(tiles.nth(0)).toHaveAccessibleName(/^Growlithe, Lv\.12/)
    await expect(tiles.nth(1)).toHaveAccessibleName(/^Vulpix, Lv\.6/)

    // A search that finds nothing says so, and how out: Clear filters.
    await page.getByRole('searchbox', { name: 'Search the Box by name' }).fill('zzz')
    await expect(page.getByText('No Pokémon in the Box match “zzz”.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(tiles).toHaveCount(7)

    expect(await smallControls(page)).toEqual([])
    expect(await nonJerseyText(page)).toEqual([])
    expect(await serious(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  })

  test('a card opens the sheet: Make lead is its one red action, Use an item beside it', async ({ page }) => {
    await boot(page)
    await page.goto('/team')
    await card(page, /^Pikachu/).click()
    const sheet = page.getByRole('dialog', { name: 'Pikachu' })
    await expect(sheet.getByText(/^#025 · Lv\.21 · Team slot 2$/)).toBeVisible()
    // The studied numbers are folded; the dice and what's next are not.
    await expect(sheet.getByRole('heading', { name: 'Dice' })).toBeVisible()
    await expect(sheet.getByText('Speed', { exact: true })).toBeHidden()
    await sheet.locator('summary', { hasText: 'Stats' }).click()
    await expect(sheet.getByText('Speed', { exact: true })).toBeVisible()
    // Speed is the species' base Speed plus the level (docs/52): Pikachu's 90 at Lv.21.
    await expect(sheet.getByText('90 + Lv.21', { exact: true })).toBeVisible()
    await expect(sheet.getByText('111', { exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Use an item' })).toBeVisible()
    expect(await smallControls(page)).toEqual([])
    expect(await serious(page)).toEqual([])
    await sheet.getByRole('button', { name: 'Make lead' }).click()
    await expect(page.getByText('Pikachu leads now')).toBeVisible()
    await expect.poll(async () => (await stored(page)).team[0]).toBe('team-1')
    await expect(card(page, /^Pikachu, .*, lead$/)).toBeVisible()
  })

  test('drag a card onto another to swap them', async ({ page }) => {
    await boot(page)
    await page.goto('/team')
    const from = (await card(page, /^Geodude/).boundingBox())!
    const to = (await card(page, /^Charmander/).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, { steps: 4 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect(page.getByText('Geodude leads now')).toBeVisible()
    await expect.poll(async () => (await stored(page)).team[0]).toBe('team-2')
    // The drag opened nothing.
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('on a PC', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the sheet stands docked: the lead’s from the start, a tile or a card swaps it, no pop-up', async ({ page }) => {
    await boot(page)
    await page.goto('/team')
    const lead = page.getByRole('region', { name: 'Charmander' })
    await expect(lead).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // The lead's sheet: nothing to make lead, Use an item at its foot.
    await expect(lead.getByRole('button', { name: 'Make lead' })).toHaveCount(0)
    await expect(lead.getByRole('button', { name: 'Use an item' })).toBeVisible()

    // A Box tile: its sheet in the same pane, the tile marked as the one shown; the Center's rule at its foot.
    const tile = page.locator('#box-title ~ ul button', { hasText: 'Vulpix' })
    await tile.click()
    const vulpix = page.getByRole('region', { name: 'Vulpix' })
    await expect(vulpix).toBeVisible()
    await expect(tile).toHaveAttribute('aria-current', 'true')
    await expect(vulpix.getByText('To bring Vulpix into your team, visit a Pokémon Center.')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // A card: Make lead, and the pane follows the new lead.
    await card(page, /^Geodude/).click()
    await page.getByRole('region', { name: 'Geodude' }).getByRole('button', { name: 'Make lead' }).click()
    await expect.poll(async () => (await stored(page)).team[0]).toBe('team-2')
    await expect(page.getByRole('region', { name: 'Geodude' })).toBeVisible()
    expect(await serious(page)).toEqual([])
    expect(await nonJerseyText(page)).toEqual([])
  })

  test('Sort & filter is a panel under its button; Esc closes it and gives the focus back', async ({ page }) => {
    await boot(page)
    await page.goto('/team')
    const button = page.getByRole('button', { name: 'Sort & filter' })
    await button.click()
    const panel = page.getByRole('dialog', { name: 'Sort & filter' })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('radio', { name: 'No.' })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(panel.getByRole('radio', { name: 'Level' })).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sort & filter: 1 set' })).toBeFocused()
  })

  test('at a Pokémon Center the full team’s swap is one tap on who leaves', async ({ page }) => {
    await boot(page)
    await page.goto('/team')
    // window.__pd comes with store/run's own import, after the first paint (src/main.tsx): wait for it.
    await page.waitForFunction(() => '__pd' in window)
    await page.evaluate(() => {
      const pd = (window as unknown as { __pd: { useGame: { setState: (f: (s: { run: object }) => object) => void } } })
        .__pd
      pd.useGame.setState((s) => ({ run: { ...s.run, phase: 'center' } }))
    })
    await page.locator('#box-title ~ ul button', { hasText: 'Vulpix' }).click()
    const sheet = page.getByRole('region', { name: 'Vulpix' })
    await expect(sheet.getByText('Your team is full — swap Vulpix in for:')).toBeVisible()
    await sheet.getByRole('button', { name: 'Swap Vulpix in for Geodude, who goes to the Box' }).click()
    await expect.poll(async () => (await stored(page)).team).toEqual(['e2e-1', 'team-1', 'team-5'])
  })
})
