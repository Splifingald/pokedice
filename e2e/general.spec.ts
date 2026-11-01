// The General upgrades (docs/25) against the mocked Supabase, on a phone: switched off they're nowhere; on, their rules
// are a card at the top of the Mart's General view until GOT IT (docs/43 §7), Capture Luck is bought with the region's
// ₽, INFO shows the rules again; golden names on the leaderboard; and in dusk every text keeps its contrast. The Shiny
// Charm: its own card once for a player who read the rest before it came, and a level bought.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, type SaveData } from '../src/engine'
import {
  EVENTS_ON,
  FAST,
  fakeSession,
  LEADERBOARD,
  makeSave,
  mockSupabase,
  STORAGE_KEY,
  withBadge,
} from './helpers'

const GENERAL_ON = {
  ...EVENTS_ON,
  general: { ...DEFAULT_CONFIG.general, access: 'all' },
  itemSwitches: { 'link-cable': 'all', bait: 'all' },
}

function trainer(patch: Partial<SaveData> = {}, theme?: 'dark'): SaveData {
  const s = withBadge(makeSave(4, { player: { name: 'Sam', character: 'red' }, gold: 5000 }))
  return { ...s, settings: { ...s.settings, ...JSON.parse(FAST), theme }, ...patch }
}

async function boot(page: Page, save: SaveData, config: object | null = GENERAL_ON, rows = LEADERBOARD) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSupabase(page, { rpc: { leaderboard: rows } })
  await page.addInitScript(
    ([key, sess, s, cfg]) => {
      localStorage.setItem(key!, sess!)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      if (cfg) localStorage.setItem('pokedice.devConfig', cfg)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), config ? JSON.stringify(config) : ''],
  )
}

async function contrast(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  return violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`))
}

test('switched off, the General tab is nowhere: two tabs, no pop-up', async ({ page }) => {
  await boot(page, trainer(), EVENTS_ON)
  await page.goto('/home')
  await page.waitForTimeout(600)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto('/upgrades')
  // Upgrades' own views (the Mart's tabs are another list): Combos and Dice Types only.
  await expect(page.getByRole('tablist', { name: 'Upgrades' }).getByRole('tab')).toHaveCount(2)
  await expect(page.getByRole('tab', { name: /General/ })).toHaveCount(0)
})

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}') as SaveData)

test('the rules where they apply: a card on the General view until GOT IT, Capture Luck bought, INFO shows them again', async ({
  page,
}) => {
  await boot(page, trainer())
  await page.goto('/shop?tab=upgrades&up=general')
  await expect(page.getByRole('tab', { name: /General/ })).toHaveAttribute('aria-selected', 'true')
  // The first time: the rules at the top of the view, the same rows as INFO's pop-up (docs/43 §7).
  const card = page.getByRole('region', { name: 'How General works' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Capture Luck')
  await expect(card).toContainText('I am just rich')
  // Level 0 earns a little offline too (`offlineBase`, ₽1 an hour): the range starts there.
  await expect(card).toContainText('₽1–₽20 an hour')
  // Opening the view doesn't count as reading them: only GOT IT does.
  expect((await stored(page)).general?.rulesSeen).toBeFalsy()
  await card.getByRole('button', { name: 'GOT IT' }).click()
  await expect(card).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).general?.rulesSeen).toBe(true)

  const luck = page.getByRole('listitem').filter({ hasText: 'Capture Luck' })
  await expect(luck).toContainText('None')
  await expect(page.getByRole('listitem').filter({ hasText: 'Offline earnings' })).toContainText('₽1/h')
  await luck.getByRole('button', { name: /₽1,000/ }).click()
  await expect(luck).toContainText('Lv.1')
  await expect(luck).toContainText('10% chance')
  // The top bar's gold (the Mart keeps no wallet of its own).
  await expect(page.getByLabel('4,000 Pokédollars').first()).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'I am just rich' })).toContainText('₽99,999')

  await page.getByRole('button', { name: 'Info: how General works' }).click()
  await expect(page.getByRole('dialog', { name: 'General' })).toBeVisible()
  await page.getByRole('button', { name: 'OK' }).click()
  // Seen: the card doesn't come back, and nothing pops up on Home.
  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: 'Capture Luck' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'How General works' })).toHaveCount(0)
  await page.goto('/home')
  await page.waitForTimeout(600)
  await expect(page.getByRole('dialog', { name: 'General' })).toHaveCount(0)
})

test('golden names on the leaderboard, and dusk keeps their contrast', async ({ page }) => {
  const rows = LEADERBOARD.map((r) => ({ ...r, rich: r.name === 'Blue' }))
  await boot(page, trainer({ general: { rich: true, rulesSeen: true } }, 'dark'), GENERAL_ON, rows)
  await page.goto('/leaderboard')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const blue = page.getByRole('listitem').filter({ hasText: 'Blue' }).first()
  await expect(blue.locator('[data-rich]')).toHaveText('Blue')
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Leaf' }).first().locator('[data-rich]'),
  ).toHaveCount(0)
  await page.waitForTimeout(400)
  expect(await contrast(page)).toEqual([])

  await page.goto('/upgrades?tab=general')
  await expect(page.getByRole('listitem').filter({ hasText: 'I am just rich' })).toContainText('MAX')
  await page.waitForTimeout(400)
  expect(await contrast(page)).toEqual([])
})

test('the Shiny Charm: its own card once on the General view, then a level bought', async ({ page }) => {
  const charmOn = {
    ...GENERAL_ON,
    shinyChance: 0.001,
    general: { ...GENERAL_ON.general, charmAccess: 'all' },
  }
  await boot(page, trainer({ general: { rulesSeen: true } }), charmOn)
  await page.goto('/shop?tab=upgrades&up=general')
  const card = page.getByRole('region', { name: 'How Shiny Charm works' })
  await expect(card).toContainText('1 in 1,000 down to 1 in 333')
  await card.getByRole('button', { name: 'GOT IT' }).click()
  await expect(card).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).general?.charmSeen).toBe(true)

  const charm = page.getByRole('listitem').filter({ hasText: 'Shiny Charm' })
  await expect(charm).toContainText('1 in 1,000')
  await charm.getByRole('button', { name: /₽1,000/ }).click()
  await expect(charm).toContainText('Lv.1')
  await expect(charm).toContainText('1 in 950')
  await page.goto('/home')
  await page.waitForTimeout(600)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
