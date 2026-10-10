// The Day Care, one for every region: the gold widget opening straight into the hatching, Egg now for ₽, and a Pokémon
// left to train and taken back.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const open = (patch: Partial<SaveData> = {}) =>
  makeSave(4, {
    gold: 500,
    // Twenty species caught open the Day Care.
    pokedex: Array.from({ length: 20 }, (_, i) => i + 1),
    ...patch,
  })

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

test('the gold widget opens the Day Care straight into the hatching of the gift Egg', async ({ page }) => {
  await boot(page, open({ dayCare: { residents: [], guests: [], eggClaimed: false, visited: true } }))
  await page.goto('/home')

  await page.getByRole('button', { name: 'Day Care: an Egg is waiting. Open the Day Care and hatch it.' }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await expect(moment.getByText('Oh? The Egg is moving!').first()).toBeVisible()
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await expect(moment.getByText(/hatched from the Egg!/).first()).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(moment).toHaveCount(0)
  // No Egg waits any more, and nothing is sold: the bar counts down to the next check.
  await expect(page.getByText('Next Egg check')).toBeVisible()
  await expect(page.getByText('No pair can make an Egg yet').first()).toBeVisible()
})

test('Egg now pays and hatches at once', async ({ page }) => {
  const data = gameData()
  // Eevee and Jolteon share the Field group: one pair.
  const residents = [133, 135].map((dex, i) => ({
    inst: createInstance(dex, 20, data, `dc-${i}`, 0),
    since: Date.now(),
    region: 'kanto',
  }))
  await boot(page, open({ dayCare: { residents, guests: [], eggClaimed: true, visited: true } }))
  await page.goto('/daycare')

  await expect(page.getByText('1 pair can leave one')).toBeVisible()
  await page.getByRole('button', { name: 'Skip the wait: an Egg now for ₽200' }).click()
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await expect(moment.getByText(/hatched from the Egg!/).first()).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  // ₽200 went (₽10 more may have come back from the Day Care couple).
  await expect(page.getByRole('banner').getByText(/₽\s?3[01]0/).first()).toBeVisible()
})

test('a Pokémon stays at the Day Care and comes back', async ({ page }) => {
  // A second Pokémon in the team: the last one can't be left.
  const save = open({ dayCare: { residents: [], guests: [], eggClaimed: true, visited: true } })
  const pidgey = createInstance(16, 8, gameData(), 'pidgey', 0)
  await boot(page, { ...save, box: [...save.box, pidgey], team: [...save.team, pidgey.id] })
  await page.goto('/home')

  // Home's widget opens the page; the yard's plate is its one title.
  await page.getByRole('button', { name: /^Day Care: one free slot\. one free slot\. Egg check in/ }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Day Care' })).toBeVisible()
  await expect(page.getByText('Every region · 0 Pokémon here')).toBeVisible()
  // Friends' Pokémon wait for the friend list's Day Cares: four slots, disabled, saying why.
  const friendSlots = page.getByRole('button', { name: /Add from a friend/ })
  await expect(friendSlots).toHaveCount(4)
  for (const b of await friendSlots.all()) await expect(b).toBeDisabled()

  // Leave Charmander: the sheet searches the team and the Box.
  await page
    .getByRole('button', { name: /Leave a Pokémon/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Leave which Pokémon?' })
  await sheet.getByLabel('Search your Pokémon').fill('charm')
  await sheet.getByRole('button', { name: /Charmander/ }).click()
  await expect(page.getByText('Charmander is staying at the Day Care.')).toBeVisible()

  // It trains in its slot; TAKE BACK says where it went.
  await page.getByRole('button', { name: 'Take back Charmander' }).click()
  await expect(page.getByText(/Charmander is back!/)).toBeVisible()
})

for (const theme of ['light', 'dark'] as const)
  test(`every text keeps its contrast (${theme}): short of ₽, then an Egg waiting`, async ({ page }) => {
    const data = gameData()
    await page.setViewportSize({ width: 390, height: 844 })
    const base = open({ gold: 50 })
    const s: SaveData = {
      ...base,
      settings: { ...base.settings, theme },
      dayCare: {
        residents: [133, 132].map((dex, i) => ({
          inst: createInstance(dex, 20, data, `dc-${i}`, 0),
          since: Date.now(),
          region: 'kanto',
        })),
        guests: [{ owner: 'u-lea', ownerName: 'Lea', ownerAvatar: 'red', inst: 'g-1', dex: 135, level: 30, addedAt: 0 }],
        eggClaimed: true,
        visited: true,
      },
    }
    await boot(page, s)
    await page.goto('/daycare')
    await expect(page.getByText('3 pairs can leave one')).toBeVisible()
    const contrast = async () =>
      (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`),
      )
    expect(await contrast()).toEqual([])
    // Short of ₽ it stays focusable (aria-disabled) and says what's missing.
    await page.getByRole('button', { name: /an Egg now/ }).click({ force: true })
    await expect(page.getByText('Need ₽150 more')).toBeVisible()

    await boot(page, { ...s, dayCare: { ...s.dayCare!, egg: { at: 0, parents: [{ dex: 133 }, { dex: 135, owner: 'Lea' }] } } })
    await page.goto('/daycare')
    await expect(page.getByText('Eevee and Jolteon (Lea) left it.', { exact: false })).toBeVisible()
    expect(await contrast()).toEqual([])
  })
