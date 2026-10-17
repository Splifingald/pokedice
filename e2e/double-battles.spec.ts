// Double battles (docs/31, docs/15 §30): a wild pair in a ticked region — the preview says so with its tag, the rules
// open once, two leads go out — then the battle with four Pokémon on the stage and the target picker, a throw at each
// one, and the rewards; switched off, the same encounter is one wild Pokémon. The kitchen sink shows every piece.
// Set SHOTS=<dir> to keep screenshots of the stage at phone size.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, instanceMaxHp, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()
const base = makeSave(4)
const AREA = base.currentAreaId
/** Charmander and Squirtle at Lv.50, so the pair is won, and a wild card on top of the deck. */
function strongSave(): SaveData {
  const lead = base.box.find((p) => p.id === base.team[0])!
  const mons = [
    { ...lead, level: 50 },
    { ...lead, id: 'e2e-squirtle', dex: 7, level: 50 },
  ].map((p) => ({ ...p, currentHp: instanceMaxHp(p, data) }))
  return {
    ...base,
    box: [...base.box.filter((p) => p.id !== lead.id), ...mons],
    team: mons.map((p) => p.id),
    inventory: { ...base.inventory, 'poke-ball': 10 },
    areaProgress: { ...base.areaProgress, [AREA]: { ...emptyProgress(), deck: ['wild', 'wild'] } },
  }
}
/** Double battles on for everyone in Kanto, every wild Pokémon in a pair. */
const DOUBLES_ON = { ...EVENTS_ON, doubleBattles: { ...DEFAULT_CONFIG.doubleBattles, access: 'all', regions: ['kanto'], wildChance: 100 } }

async function boot(page: Page, save: SaveData, devConfig: object) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), FAST, JSON.stringify(devConfig)],
  )
}

test('a wild pair: the tag and rules, two leads, four on the stage, a target, a throw at each, the rewards', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, strongSave(), DOUBLES_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()

  // The rules open by themselves the first time.
  const rules = page.getByRole('dialog', { name: 'Double battles' })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('Two against two')).toBeVisible()
  await rules.getByRole('button', { name: 'OK', exact: true }).click()

  const preview = page.getByRole('dialog', { name: 'Two wild Pokémon appeared!' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('DOUBLE BATTLE')).toBeVisible()
  await expect(preview.getByText('Send out two:')).toBeVisible()
  await expect(preview.getByRole('button', { pressed: true })).toHaveCount(2)
  await preview.getByRole('button', { name: /FIGHT/ }).click()

  // Four plates, and the target picker on your turn.
  const picker = page.getByRole('radiogroup', { name: 'Which foe to attack' })
  await expect(picker).toBeVisible({ timeout: 20_000 })
  await expect(picker.getByRole('radio')).toHaveCount(2)
  await expect(page.getByRole('group', { name: /Lv\./ })).toHaveCount(4)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/double-battle.png` })
  await picker.getByRole('radio', { checked: false }).click()
  await expect(picker.getByRole('radio', { checked: true })).toHaveCount(1)

  // Attack until both are down, then a throw at each one.
  const attack = page.getByRole('button', { name: 'ATTACK', exact: true })
  const roll = page.getByRole('button', { name: /^(ROLL TO CATCH|CATCH)$/ })
  const victory = page.getByRole('heading', { name: 'VICTORY!' })
  let throws = 0
  for (let i = 0; i < 200 && !(await victory.isVisible()); i++) {
    // isVisible() first: isEnabled() would wait for a button that isn't there.
    if ((await roll.isVisible()) && (await roll.isEnabled())) {
      if (process.env.SHOTS && throws === 0) await page.screenshot({ path: `${process.env.SHOTS}/double-catch.png` })
      await roll.click()
      throws += 1
      // The throw's result, then on: the other one's throw, or the rewards.
      const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
      await expect(next.first()).toBeVisible({ timeout: 15_000 })
      if (!(await victory.isVisible())) await next.first().click()
    } else if ((await attack.isVisible()) && (await attack.isEnabled())) await attack.click()
    await page.waitForTimeout(250)
  }
  await expect(victory).toBeVisible()
  expect(throws).toBe(2)
  expect(errors).toEqual([])
})

test('switched off, the same card is one wild Pokémon', async ({ page }) => {
  await boot(page, strongSave(), EVENTS_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  const preview = page.getByRole('dialog', { name: 'You encountered a wild Pokémon!' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('DOUBLE BATTLE')).toHaveCount(0)
  await expect(preview.getByText('Send out:', { exact: true })).toBeVisible()
})

test('the kitchen sink shows every double battle piece, with no error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, makeSave(4, { doubleRulesSeen: true }), EVENTS_ON)
  await page.goto('/kitchen-sink')
  const title = page.getByText(/^Double battles: the four-Pokémon stage/)
  await expect(title).toBeVisible({ timeout: 30_000 })
  // The target picker, live and disabled, and the plates of both stages.
  await expect(page.getByRole('radiogroup', { name: 'Which foe to attack' })).toHaveCount(2)
  expect(await page.getByRole('group', { name: /^(Your )?(Plusle|Minun|Solrock|Lunatone), Lv\./ }).count()).toBeGreaterThanOrEqual(12)
  await page.getByRole('button', { name: 'Rules pop-up', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Double battles' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Double battles' }).getByRole('button', { name: 'OK', exact: true }).click()
  if (process.env.SHOTS) {
    await title.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${process.env.SHOTS}/double-kitchen.png`, fullPage: false })
  }
  expect(errors).toEqual([])
})
