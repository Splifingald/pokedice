// Extreme mode's Pokémon Centers (docs/47): the round's Center offers boons instead of its heal, its rules once, a
// pick asked first; and the Center a K.O. sends, which only swaps.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, progressOf, type SaveData } from '../src/engine'
import { EXTREME_ON, FAST, makeSave, mockSupabase } from './helpers'

const ON = { ...EXTREME_ON, extremeCenters: { ...DEFAULT_CONFIG.extremeCenters, access: 'all' } }

/** The Extreme save on the device, played (the first load only). */
async function seed(page: Page, extreme: SaveData) {
  await page.addInitScript(
    ([x, f, on]) => {
      localStorage.setItem('pokedice.devConfig', on!)
      if (sessionStorage.getItem('e2e.seeded')) return
      sessionStorage.setItem('e2e.seeded', '1')
      localStorage.setItem('pokedice.save', JSON.stringify(JSON.parse(x!).main))
      localStorage.setItem('pokedice.save.extreme', JSON.stringify(JSON.parse(x!).extreme))
      localStorage.setItem('pokedice.slot', 'extreme')
      localStorage.setItem('pokedice.settings', f!)
    },
    [
      JSON.stringify({ main: makeSave(4, { extremeRulesSeen: true, extremeUnlockedAt: 1 }), extreme }),
      FAST,
      JSON.stringify(ON),
    ] as const,
  )
}

const stored = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('pokedice.save.extreme')
    return raw ? (JSON.parse(raw) as SaveData) : null
  })

const extreme = (patch: Partial<SaveData> = {}) =>
  makeSave(7, { mode: 'extreme', player: { name: 'Sam', character: 'red' }, ...patch })

test("the round's Center: its rules once, three boons, a pick asked first, then the team and the Box", async ({
  page,
}) => {
  await mockSupabase(page)
  const base = extreme()
  await seed(page, { ...base, box: base.box.map((p) => ({ ...p, currentHp: 2 })) })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE' }).click()

  // The first boon Center: its rules over it, once.
  const rules = page.getByRole('dialog', { name: 'Extreme Pokémon Centers' })
  await expect(rules).toContainText('One boon per Center')
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(rules).toHaveCount(0)

  await expect(page.getByRole('heading', { name: 'Pick one boon' })).toBeVisible()
  const heal = page.getByRole('button', { name: 'Pick: Heal 30%' })
  await expect(heal).toBeVisible()
  // Three on offer, nothing else to press until one is taken.
  await expect(page.getByRole('button', { name: /^Pick: / })).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'CONTINUE' })).toHaveCount(0)

  // BACK takes nothing.
  await heal.click()
  const confirm = page.getByRole('dialog', { name: 'Take this boon?' })
  await confirm.getByRole('button', { name: 'Back' }).click()
  await expect(confirm).toHaveCount(0)
  expect((await stored(page))?.extreme?.center?.offers).toHaveLength(3)

  // A reload is back in the Center, with the same boons.
  const before = (await stored(page))!.extreme!.center!.offers
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pick one boon' })).toBeVisible()
  expect((await stored(page))!.extreme!.center!.offers).toEqual(before)

  await page.getByRole('button', { name: 'Pick: Heal 30%' }).click()
  await page.getByRole('dialog', { name: 'Take this boon?' }).getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Your Pokémon feel better!')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pick one boon' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'CONTINUE' })).toBeVisible()
  await expect.poll(async () => (await stored(page))?.box[0]?.currentHp).toBeGreaterThan(2)
  const after = (await stored(page))!
  expect(after.extreme?.center).toBeUndefined()
  expect(after.extreme?.centerRulesSeen).toBe(true)
})

test('a K.O. of the whole team: back at a Center with no boon, to swap in from the Box', async ({ page }) => {
  await mockSupabase(page)
  const base = extreme({ extreme: { centerRulesSeen: true } })
  const area = base.currentAreaId
  const spare = { ...base.box[0]!, id: 'spare', dex: 16, level: 5 }
  const save: SaveData = {
    ...base,
    box: [...base.box.map((p) => ({ ...p, currentHp: 0, koAt: Date.now() })), spare],
    pokedex: [...base.pokedex, 16],
    areaProgress: { ...base.areaProgress, [area]: { ...progressOf(base, area), wiped: true, round: 1 } },
  }
  await seed(page, save)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE' }).click()

  await expect(page.getByText('Back at the Pokémon Center')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pick one boon' })).toHaveCount(0)
  // The team can change: the Box is there.
  await expect(page.getByRole('heading', { name: /^Box/ })).toBeVisible()
  await expect.poll(async () => progressOf((await stored(page))!, area).wiped).toBeUndefined()
  // Still K.O.: nobody healed.
  expect((await stored(page))!.box[0]!.currentHp).toBe(0)
})
