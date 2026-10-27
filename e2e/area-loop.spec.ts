// The area loop's deep pass (docs/43 §5.3): the stage's 3:2 picture on a tall phone and GO! waiting for the tap, the turn's switch on the send-out's cards (no dialog, BACK, the forfeit flag), the battle's
// keys (S, Esc, B, Enter), the Bag's "on whom" as cards, and the PC's discreet key line with the pips as the team row.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyProgress, instanceMaxHp, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase, nonJerseyText, smallControls } from './helpers'

/** A team of three at full HP, a Potion in the bag, and a wild Pokémon next. */
function threeTeam(): SaveData {
  const base = makeSave(1)
  const lead = base.box[0]!
  const mons = [
    { ...lead, id: 'e2e-charmander', dex: 4 },
    { ...lead, id: 'e2e-squirtle', dex: 7 },
  ]
  const box = [...base.box, ...mons].map((p) => ({
    ...p,
    level: 12,
    currentHp: instanceMaxHp({ ...p, level: 12 }, gameData()),
  }))
  return {
    ...base,
    box,
    team: box.map((p) => p.id),
    inventory: { ...base.inventory, potion: 2 },
    areaProgress: {
      ...base.areaProgress,
      [base.currentAreaId]: { ...emptyProgress(), deck: ['wild', 'wild', 'wild'] },
    },
  }
}

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
}

/** Home → the fight's dice, GO! pressed at the send-out. */
async function toDice(page: Page) {
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page.getByRole('button', { name: /^Send out / }).click()
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeEnabled({ timeout: 20_000 })
}

test('a tall phone: the stage keeps its 3:2 picture, GO! waits for the tap, nothing to scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, threeTeam())
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  // No button presses itself (the user's call, 2026-10-27): a wild fight's GO! is still there after its old count.
  const go = page.getByRole('button', { name: /^Send out / })
  await expect(go).toBeVisible()
  await page.waitForTimeout(4000)
  await expect(go).toBeVisible()
  await go.click()
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeEnabled({ timeout: 20_000 })
  const m = await page.evaluate(() => {
    const stage = document.querySelector('main section .shadow-ledge') as HTMLElement
    const r = stage.getBoundingClientRect()
    return { w: r.width, h: r.height, scroll: document.documentElement.scrollHeight - innerHeight }
  })
  // The stage is its picture's 3:2 again (no sky added above it).
  expect(Math.abs(m.h - (m.w * 2) / 3)).toBeLessThan(6)
  expect(m.scroll).toBeLessThanOrEqual(0)
  // The dice and the actions are in the lower half: in the thumb's reach.
  const attack = await page.getByRole('button', { name: 'ATTACK', exact: true }).boundingBox()
  expect(attack!.y).toBeGreaterThan(844 / 2)
})

test("the turn's switch: the send-out's cards (no dialog), BACK, the flag, S and Esc, GO! sends", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, threeTeam())
  await toDice(page)
  // A tap on a pip: the panel shows the cards of those able to come in, the one tapped picked.
  await page
    .getByRole('group', { name: 'Switch Pokémon' })
    .getByRole('button', { name: /Squirtle/ })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Switch (costs your turn)')).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { pressed: true })).toContainText('Squirtle')
  await expect(page.getByRole('button', { name: /^forfeit$/i })).toBeVisible()
  expect(await smallControls(page)).toEqual([])
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id),
  ).toEqual([])
  // BACK gives the dice back.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible()
  // S opens it again, Esc closes it.
  await page.keyboard.press('s')
  await expect(page.getByRole('button', { name: /^Send out / })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible()
  // S, 2 picks the second card, Enter is GO!: the switch goes in and costs the turn.
  await page.keyboard.press('s')
  await page.keyboard.press('2')
  await expect(page.getByRole('main').getByRole('button', { pressed: true })).toContainText('Squirtle')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Squirtle/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Send out / })).toHaveCount(0)
})

test('B opens the Bag, and its "on whom" is the send-out\'s cards with why an item can\'t help', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, threeTeam())
  await toDice(page)
  // The lead is hurt mid-fight, the others full: the Potion helps one. (A hurt team would open the area with a Center.)
  await page.evaluate(() => {
    type B = { hp: number }
    type S = { battle: { state: { player: B[] } } | null }
    const pd = (window as unknown as { __pd: { useGame: { setState: (f: (s: S) => object) => void } } }).__pd
    pd.useGame.setState((s) =>
      s.battle
        ? {
            battle: {
              ...s.battle,
              state: {
                ...s.battle.state,
                player: s.battle.state.player.map((b, i) => (i ? b : { ...b, hp: 3 })),
              },
            },
          }
        : {},
    )
  })
  await page.keyboard.press('b')
  const bag = page.getByRole('dialog', { name: 'Items (one per turn)' })
  await expect(bag).toBeVisible()
  await bag.getByRole('button', { name: /Potion/ }).click()
  const pick = page.getByRole('dialog', { name: /Use Potion on/ })
  await expect(pick.getByText('Already full')).toHaveCount(2)
  await pick.getByRole('button', { name: /Use Potion on Bulbasaur/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await nonJerseyText(page)).toEqual([])
})

test('PC: the pips are the team row, and the keys show discreetly on the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await boot(page, threeTeam())
  await toDice(page)
  const pips = page.getByRole('group', { name: 'Switch Pokémon' }).getByRole('button')
  await expect(pips).toHaveCount(3)
  expect((await pips.first().boundingBox())!.width).toBeLessThan(60)
  const keys = page.locator('[data-key-hints]').first()
  await expect(keys).toContainText('reroll')
  // Faint until the pointer is in the panel.
  await page.mouse.move(10, 450)
  await expect(keys).toHaveCSS('opacity', '0')
  const attack = await page.getByRole('button', { name: 'ATTACK', exact: true }).boundingBox()
  await page.mouse.move(attack!.x + 5, attack!.y - 40)
  await expect(keys).toHaveCSS('opacity', '1')
  // The stage, its 3:2 picture as large as the window allows beside the panel (docs/42).
  const stage = await page.evaluate(() => {
    const r = document.querySelector('main section .shadow-ledge')!.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  expect(stage.w).toBeGreaterThan(900)
  expect(Math.abs(stage.h - (stage.w * 2) / 3)).toBeLessThan(6)
})
