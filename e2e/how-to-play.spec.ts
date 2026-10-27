// How to play, animated (docs/38 §8b): with the Game feel switch on, the guide opens on four animated cards (throw the
// dice, reroll, deal damage, catch) that fit a phone and loop; under the OS's reduced motion each one is a still with a
// PLAY that plays it once, and with animations off PLAY shows its end; axe finds nothing serious in either theme; the
// trainer menu's guide has them too; with the switch off the guide is the text it was.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { EVENTS_ON, makeSave, mockSupabase, smallControls } from './helpers'

/** The cards' controls under 44 px (the page's own, from before, aren't theirs to fix). */
const smallInCards = async (page: Page) =>
  (await smallControls(page)).filter((c) => /^(PLAY|Play the animation)/i.test(c))

const TITLES = ['Throw the dice', 'Reroll', 'Deal damage', 'Catch']

async function boot(
  page: Page,
  {
    feel = true,
    theme = 'light',
    still = false,
  }: { feel?: boolean; theme?: 'light' | 'dark'; still?: boolean } = {},
) {
  await mockSupabase(page)
  const settings = { sfx: false, sound: false, reducedMotion: still, theme }
  const save = makeSave(4)
  const config = { ...EVENTS_ON, gameFeel: { access: feel ? 'all' : 'off' } }
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
      // Prof. Oak's share prompt would cover the screen.
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [
      JSON.stringify({ ...save, settings: { ...save.settings, ...settings } }),
      JSON.stringify(settings),
      JSON.stringify(config),
    ],
  )
}

const cards = (page: Page) => page.locator('figure')
const card = (page: Page, title: string) =>
  cards(page).filter({ has: page.getByRole('heading', { name: title }) })

async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

for (const size of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`the four cards play at ${size.width}×${size.height}, nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize(size)
    await boot(page)
    await page.goto('/help')
    await expect(page.getByRole('heading', { name: 'The basics', level: 2 })).toBeVisible()
    await expect(cards(page)).toHaveCount(4)
    for (const title of TITLES) {
      const c = card(page, title)
      await expect(c.getByRole('heading', { level: 3, name: title })).toBeVisible()
      await expect(c.getByRole('img').first()).toHaveAttribute('aria-label', /^Animation: /)
    }
    // The rules below, under their own heading, one level down.
    await expect(page.getByRole('heading', { name: 'All the rules', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'The goal', level: 3 })).toBeVisible()
    // It loops: no PLAY, and the reroll card makes its pair, the damage card counts to its number.
    await expect(page.getByRole('button', { name: /^Play the animation/ })).toHaveCount(0)
    await card(page, 'Reroll').scrollIntoViewIfNeeded()
    await expect(card(page, 'Reroll').getByText(/^Pair \+\d+$/)).toBeVisible({ timeout: 8000 })
    await card(page, 'Deal damage').scrollIntoViewIfNeeded()
    await expect(card(page, 'Deal damage').getByText(/^[1-9]\d* DMG$/)).toBeVisible({ timeout: 8000 })
    await card(page, 'Catch').scrollIntoViewIfNeeded()
    await expect(card(page, 'Catch').getByText('Gotcha!')).toBeVisible({ timeout: 8000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(await smallInCards(page)).toEqual([])
  })
}

test('reduced motion: each card is a still with PLAY, which plays it once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page)
  await page.goto('/help')
  for (const title of TITLES) {
    const play = page.getByRole('button', { name: `Play the animation: ${title}` })
    await expect(play).toBeVisible()
    await expect(play).toHaveText('PLAY', { ignoreCase: true })
    const box = (await play.boundingBox())!
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
  }
  expect(await smallInCards(page)).toEqual([])

  // The reroll's still: the picked die, before the pair. PLAY plays it to its pair, and it stays there.
  const reroll = card(page, 'Reroll')
  await expect(reroll.getByText(/^Pair \+\d+$/)).toHaveCount(0)
  await page.waitForTimeout(1000)
  await expect(reroll.getByText(/^Pair \+\d+$/)).toHaveCount(0)
  await reroll.getByRole('button', { name: /^Play the animation/ }).click()
  await expect(reroll.getByText(/^Pair \+\d+$/)).toBeVisible({ timeout: 6000 })
  await page.waitForTimeout(2500)
  await expect(reroll.getByText(/^Pair \+\d+$/)).toBeVisible()

  // The damage's still: counted, the foe's HP full; PLAY lands the hit.
  const hit = card(page, 'Deal damage')
  const meter = hit.locator('[role=meter]')
  await expect(meter).toHaveAttribute('aria-valuenow', '100')
  await hit.getByRole('button', { name: /^Play the animation/ }).click()
  await expect(meter).not.toHaveAttribute('aria-valuenow', '100', { timeout: 8000 })
})

test('animations off: PLAY shows the end at once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, { still: true })
  await page.goto('/help')
  const c = card(page, 'Catch')
  await expect(c.getByText('Gotcha!')).toHaveCount(0)
  await c.getByRole('button', { name: 'Play the animation: Catch' }).click()
  await expect(c.getByText('Gotcha!')).toBeVisible({ timeout: 500 })
})

for (const theme of ['light', 'dark'] as const) {
  test(`axe finds nothing serious on the cards in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await boot(page, { theme })
    await page.goto('/help')
    await expect(cards(page)).toHaveCount(4)
    // Mid-loop: the reroll's pair on screen; then the damage's "+N" over its dice (gold, outlined in ink).
    await expect(card(page, 'Reroll').getByText(/^Pair \+\d+$/)).toBeVisible({ timeout: 8000 })
    expect(await axe(page)).toEqual([])
    const hit = card(page, 'Deal damage')
    await hit.scrollIntoViewIfNeeded()
    await expect(hit.locator('.score-pop').first()).toBeVisible({ timeout: 8000 })
    expect(await axe(page)).toEqual([])
    // And the stills, PLAY and all.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByRole('button', { name: /^Play the animation/ })).toHaveCount(4)
    expect(await axe(page)).toEqual([])
  })
}

test("the trainer menu's guide opens on the cards too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page)
  await page.goto('/home')
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('button', { name: 'How to play' }).click()
  const guide = page.getByRole('dialog', { name: 'How to play' })
  await expect(guide.locator('figure')).toHaveCount(4)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('with the Game feel off, the guide is the rules alone, folded one at a time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, { feel: false })
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'The goal', level: 3 })).toBeVisible()
  await expect(cards(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'The basics' })).toHaveCount(0)
  // One section open at a time: opening Battles closes The goal.
  const goal = page.getByRole('button', { name: 'The goal' })
  const battles = page.getByRole('button', { name: 'Battles' })
  await goal.click()
  await expect(goal).toHaveAttribute('aria-expanded', 'true')
  await battles.click()
  await expect(battles).toHaveAttribute('aria-expanded', 'true')
  await expect(goal).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('The faster Pokémon acts first.')).toBeVisible()
  // Every detail, one tap further.
  await page.getByRole('button', { name: 'Every detail' }).click()
  await expect(page.getByText(/^Keyboard: 1–6 pick dice/)).toBeVisible()
})
