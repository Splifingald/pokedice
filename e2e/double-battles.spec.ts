// Double battles (docs/33, docs/15 §30): a wild pair in a ticked region — the preview shows both, no rules pop-up nor
// tag (the user, 2026-10-17), two leads go out — then the battle with four Pokémon on the stage and the target picker, a throw at each
// one, and the rewards; switched off, the same encounter is one wild Pokémon. The kitchen sink shows every piece.
// Set SHOTS=<dir> to keep screenshots of the stage at phone size.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, instanceMaxHp, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()
const base = makeSave(4)
const AREA = base.currentAreaId
/**
 * Charmander and Squirtle at Lv.50, so the pair is won, and a wild card on top of the deck. `full`: Bulbasaur too, a
 * full team, so each catch asks "Add to team?".
 */
function strongSave(full = false): SaveData {
  const lead = base.box.find((p) => p.id === base.team[0])!
  const mons = [
    { ...lead, level: 50 },
    { ...lead, id: 'e2e-squirtle', dex: 7, level: 50 },
    ...(full ? [{ ...lead, id: 'e2e-bulbasaur', dex: 1, level: 50 }] : []),
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

test('a wild pair: no pop-up, two leads, four on the stage, a target, a throw at each, the rewards', async ({
  page,
}) => {
  // Four take turns, each one's move played: a long fight.
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, strongSave(), DOUBLES_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()


  const preview = page.getByRole('dialog', { name: 'Two wild Pokémon appeared!' })
  await expect(preview).toBeVisible()
  // No rules pop-up over it, no tag in it.
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(preview.getByText('DOUBLE BATTLE')).toHaveCount(0)
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

  // Attack until both are down, then a throw at each one: two species, two throws; one species twice, the second
  // only if stronger than the first just caught (one copy per species).
  const title = (await page.getByRole('heading', { level: 1, name: /^Battle: / }).textContent()) ?? ''
  const [a, b] = title.replace(/^.* against /, '').split(' & ')
  const throws = await fightAndCatch(page)
  if (a !== b) expect(throws).toBe(2)
  else expect([1, 2]).toContain(throws)
  expect(errors).toEqual([])
})

/**
 * Attack until both are down, then throw at each one; returns how many throws were made. The rewards never show
 * between the two throws: the second follows the first at once.
 */
async function fightAndCatch(page: Page): Promise<number> {
  const attack = page.getByRole('button', { name: 'ATTACK', exact: true })
  const roll = page.getByRole('button', { name: /^(ROLL TO CATCH|CATCH)$/ })
  // The result shows in the battle's panel (the rework): its region, named as the old card's title was.
  const victory = page.getByRole('region', { name: 'VICTORY!' })
  let throws = 0
  const until = Date.now() + 180_000
  while (Date.now() < until && !(await victory.isVisible())) {
    // isVisible() first: isEnabled() would wait for a button that isn't there.
    if ((await roll.isVisible()) && (await roll.isEnabled())) {
      if (process.env.SHOTS && throws === 0) await page.screenshot({ path: `${process.env.SHOTS}/double-catch.png` })
      await roll.click()
      throws += 1
      // The throw's result, then on: its CONTINUE loads and presses itself (or a tap goes sooner) to the other one's
      // throw, or the rewards.
      const next = page.getByRole('button', { name: 'CONTINUE', exact: true })
      await expect(next.first().or(victory)).toBeVisible({ timeout: 15_000 })
      if (throws === 1) await expect(victory).toHaveCount(0)
      if (!(await victory.isVisible())) await next.first().click({ timeout: 3000 }).catch(() => {})
    } else if ((await attack.isVisible()) && (await attack.isEnabled())) await attack.click()
    await page.waitForTimeout(250)
  }
  await expect(victory).toBeVisible()
  return throws
}

test('a wild pair with a full team: both throws, then "Add to team?" for each, one after the other', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, strongSave(true), DOUBLES_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Two wild Pokémon appeared!' }).getByRole('button', { name: /FIGHT/ }).click()
  // The pair is the area's luck of the draw: two species, or one twice.
  const title = (await page.getByRole('heading', { level: 1, name: /^Battle: / }).textContent()) ?? ''
  const [a, b] = title.replace(/^.* against /, '').split(' & ')
  const throws = await fightAndCatch(page)

  const victory = page.getByRole('region', { name: 'VICTORY!' })
  const question = page.getByText(/^Add .+ to your team\?$/)
  await expect(question).toBeVisible({ timeout: 20_000 })
  if (a !== b) {
    // Two species: the first catch's question, then (Next sends it to the Box) the second's, then on.
    expect(throws).toBe(2)
    await page.getByRole('button', { name: 'Next ▸', exact: true }).click()
    await expect(victory).toBeVisible()
    await expect(question).toBeVisible()
    await page.getByRole('button', { name: /^Swap out Charizard/ }).click()
  } else {
    // One species twice: one copy kept (a stronger second replaces the first; a weaker one isn't on offer), so one
    // question, about a Pokémon that is there.
    await page.getByRole('button', { name: /^Swap out Charizard/ }).click()
    const dex = data.speciesList.find((sp) => sp.name === a)?.dex
    expect(dex).toBeDefined()
    await expect
      .poll(async () => {
        const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData)
        return save.box?.filter((p) => p.dex === dex && !p.shiny).length
      })
      .toBe(1)
  }
  await expect(question).toHaveCount(0)
  await page.getByRole('button', { name: 'Next ▸', exact: true }).click()
  await expect(victory).toHaveCount(0)
  expect(errors).toEqual([])
})

test('switched off, the same card is one wild Pokémon', async ({ page }) => {
  await boot(page, strongSave(), EVENTS_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  // One wild Pokémon goes straight into its fight (the rework): no pop-up, the send-out step for the team of two.
  await expect(page.getByRole('button', { name: /^Send out / })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('DOUBLE BATTLE')).toHaveCount(0)
})

test('the kitchen sink shows every double battle piece, with no error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, makeSave(4), EVENTS_ON)
  await page.goto('/kitchen-sink')
  const title = page.getByText(/^Double battles: the four-Pokémon stage/)
  await expect(title).toBeVisible({ timeout: 30_000 })
  // The target picker, live and disabled, and the plates of both stages.
  await expect(page.getByRole('radiogroup', { name: 'Which foe to attack' })).toHaveCount(2)
  expect(await page.getByRole('group', { name: /^(Your )?(Plusle|Minun|Solrock|Lunatone), Lv\./ }).count()).toBeGreaterThanOrEqual(12)
  if (process.env.SHOTS) {
    await title.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${process.env.SHOTS}/double-kitchen.png`, fullPage: false })
  }
  expect(errors).toEqual([])
})
