// The special events (docs/18): the unlock pop-up, then the Fortune Wheel from Home's square to its prize, as a guest
// (the prize drawn on the device, on the server's day) and signed in (the prize drawn by wheel_spin()).
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, type SaveData } from '../src/engine'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

const ROUTES_7_8 = DEFAULT_CONFIG.events.wheel.unlockAreaId!
const cleared = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }

/** Routes 7 & 8 cleared: the wheel is open. `seen`: its pop-up was already shown. */
function wheelSave(seen = true): SaveData {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  return { ...base, areaProgress: { ...base.areaProgress, [ROUTES_7_8]: cleared }, ...(seen && { events: { seen: ['wheel'] } }) }
}

const today = () => new Date().toISOString().slice(0, 10)
const eventTime = () => ({ now: new Date().toISOString(), day: today() })

async function boot(page: Page, save: SaveData, signedIn = false) {
  await page.addInitScript(
    ([key, session, s, f]) => {
      if (session) localStorage.setItem(key!, session)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, signedIn ? JSON.stringify(fakeSession()) : '', JSON.stringify(save), FAST],
  )
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)

test('the wheel opens with a pop-up that goes straight to it', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: eventTime } })
  await boot(page, wheelSave(false))
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Fortune Wheel' })
  await expect(pop).toBeVisible()
  await expect(pop.getByText('Once a day', { exact: true })).toBeVisible()
  await pop.getByRole('button', { name: "Let's go!" }).click()
  await expect(page).toHaveURL(/\/events\/wheel$/)
  await expect(page.getByRole('heading', { name: 'Fortune Wheel' })).toBeVisible()
  // Seen once: back Home (in the app: a reload would seed the unseen save again), no pop-up.
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(page.getByRole('button', { name: /^Fortune Wheel: a free spin is ready/ })).toBeVisible()
  await expect(pop).toHaveCount(0)
})

test('a guest spins once a day: the odds, the prize in the bag, then the countdown', async ({ page }) => {
  const calls = await mockSupabase(page, { rpc: { event_time: eventTime } })
  const save = wheelSave()
  await boot(page, save)
  await page.goto('/home')
  await page.getByRole('button', { name: /^Fortune Wheel: a free spin is ready/ }).click()
  await expect(page).toHaveURL(/\/events\/wheel$/)

  await page.getByRole('button', { name: 'Info: every prize and its odds' }).click()
  const odds = page.getByRole('dialog', { name: 'Prizes and odds' })
  await expect(odds.getByRole('row')).toHaveCount(6)
  await expect(odds.getByRole('row', { name: /Master Ball/ })).toContainText('2.5 %')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Spin!' }).click()
  const card = page.getByRole('dialog', { name: /^You won/ })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.getByRole('button', { name: 'Nice!' }).click()
  await expect(page.getByText('Come back tomorrow')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Spin!' })).toHaveCount(0)

  // The save is written a moment after it changes.
  await expect.poll(async () => (await stored(page)).events).toEqual({ seen: ['wheel'], wheelDay: today() })
  const after = await stored(page)
  const gained =
    after.gold - save.gold +
    Object.entries(after.inventory).reduce((n, [k, q]) => n + q - (save.inventory[k] ?? 0), 0)
  expect(gained).toBeGreaterThan(0)
  // A guest's prize never asks the server.
  expect(calls.some((c) => c.includes('wheel_spin'))).toBe(false)

  await page.goto('/home')
  await expect(page.getByRole('button', { name: /^Fortune Wheel: spun today/ })).toBeVisible()
})

test("signed in, the server draws the prize; a second device's spin is already spent", async ({ page }) => {
  let spins = 0
  await mockSupabase(page, {
    rpc: {
      event_time: eventTime,
      wheel_spin: () => {
        spins++
        return { day: today(), prize: 4, reward: { kind: 'item', key: 'master-ball', qty: 1 }, fresh: spins === 1 }
      },
    },
  })
  const save = wheelSave()
  await boot(page, save, true)
  await page.goto('/events/wheel')
  await page.getByRole('button', { name: 'Spin!' }).click()
  const card = page.getByRole('dialog', { name: /Master Ball/ })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card.getByText('JACKPOT!')).toBeVisible()
  await card.getByRole('button', { name: 'Nice!' }).click()
  await expect.poll(async () => (await stored(page)).inventory['master-ball']).toBe((save.inventory['master-ball'] ?? 0) + 1)

  // Another device, the same day: the server says it's spent, and nothing is paid.
  await page.evaluate((s) => localStorage.setItem('pokedice.save', s), JSON.stringify(save))
  await page.reload()
  await page.getByRole('button', { name: 'Spin!' }).click()
  await expect(page.getByText('Already spun today on this account. Come back tomorrow!')).toBeVisible()
  await expect(page.getByText('Come back tomorrow', { exact: true })).toBeVisible()
  await expect.poll(async () => (await stored(page)).events?.wheelDay).toBe(today())
  expect((await stored(page)).inventory['master-ball'] ?? 0).toBe(save.inventory['master-ball'] ?? 0)
  expect(spins).toBe(2)
})
