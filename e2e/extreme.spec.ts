// Extreme mode (docs/22): the second save a league opens. Its rules pop-up and the way in, a new Extreme game beside the
// main one, the resting team, a resting Pokémon's countdown, healing for the time away, deleting the Extreme save, and
// the database told which world it is talking about.
import { expect, test, type Page } from '@playwright/test'
import { instanceMaxHp } from '../src/engine'
import { EXTREME_ON, FAST, fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY, withBadge } from './helpers'

const H = 3_600_000

/** The saves and the slot on the device, on the first load only (later reloads see what the game wrote). */
async function seed(page: Page, o: { main?: object | null; extreme?: object | null; slot?: 'main' | 'extreme'; session?: boolean }) {
  await page.addInitScript(
    ([m, x, slot, f, auth, key, on]) => {
      // Extreme mode ships off: on for everyone here (after mockSupabase's events, which this keeps).
      localStorage.setItem('pokedice.devConfig', on!)
      if (sessionStorage.getItem('e2e.seeded')) return
      sessionStorage.setItem('e2e.seeded', '1')
      if (m) localStorage.setItem('pokedice.save', m)
      if (x) localStorage.setItem('pokedice.save.extreme', x)
      if (slot === 'extreme') localStorage.setItem('pokedice.slot', 'extreme')
      localStorage.setItem('pokedice.settings', f!)
      if (auth) localStorage.setItem(key!, auth)
    },
    [
      o.main ? JSON.stringify(o.main) : '',
      o.extreme ? JSON.stringify(o.extreme) : '',
      o.slot ?? 'main',
      FAST,
      o.session ? JSON.stringify(fakeSession()) : '',
      STORAGE_KEY,
      JSON.stringify(EXTREME_ON),
    ] as const,
  )
}

const stored = (page: Page, key: string) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    return raw ? JSON.parse(raw) : null
  }, key)

const now = Date.now()
const main = () => makeSave(4, { player: { name: 'Sam', character: 'red' }, extremeUnlockedAt: now - H, extremeRulesSeen: true })
const extreme = (patch: object = {}) => makeSave(7, { mode: 'extreme', player: { name: 'Sam', character: 'red' }, ...patch })

test('the league opens it: the rules, then a new Extreme game beside the main save', async ({ page }) => {
  await mockSupabase(page)
  await seed(page, { main: { ...main(), extremeRulesSeen: false } })
  await page.goto('/home')

  const rules = page.getByRole('dialog', { name: 'Extreme mode' })
  await expect(rules).toContainText('No Pokémon Centers')
  await expect(rules).toContainText('K.O. lasts 12 h')
  await expect(rules).toContainText('heal 10% an hour')
  await rules.getByRole('button', { name: "Let's go!" }).click()

  // No Extreme save on this device yet: the title, playing the Extreme slot.
  await expect(page).toHaveURL(/\/$/)
  expect(await page.evaluate(() => localStorage.getItem('pokedice.slot'))).toBe('extreme')
  await expect(page.getByRole('button', { name: 'Continue the main game' })).toBeVisible()
  await page.getByRole('button', { name: 'NEW GAME' }).click()
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await page.getByRole('radio', { name: 'Character 2' }).click()
  await page.getByLabel('Your name').fill('Sam')
  await page.getByRole('button', { name: 'NEXT ▸' }).click()
  await page.getByRole('button', { name: 'Poké Ball 3 of 3' }).click()
  await page.getByRole('button', { name: 'Pick Squirtle' }).click()
  await page.getByRole('button', { name: /let's go/i }).click()

  await expect(page.getByText('Extreme mode · no Pokémon Centers')).toBeVisible()
  // Written a moment later (saves are written after a short pause).
  await expect.poll(async () => (await stored(page, 'pokedice.save.extreme'))?.mode).toBe('extreme')
  // The main save is as it was: its own starter, the rules seen.
  const m = await stored(page, 'pokedice.save')
  expect(m.box[0].dex).toBe(4)
  expect(m.extremeRulesSeen).toBe(true)
  expect(m.mode).toBeUndefined()
})

test('off by default: the league beaten, still no pop-up, no title card, no menu row', async ({ page }) => {
  await mockSupabase(page)
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('e2e.seeded')) return
    sessionStorage.setItem('e2e.seeded', '1')
    localStorage.setItem('pokedice.save', save)
  }, JSON.stringify({ ...main(), extremeRulesSeen: false }))
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: /^Exploring / })).toBeAttached()
  await expect(page.getByRole('dialog', { name: 'Extreme mode' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Extreme mode' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Extreme mode' })).toHaveCount(0)
})

test('the whole team resting: CONTINUE waits, says when, and points to the Team and the Mart', async ({ page }) => {
  await mockSupabase(page)
  const base = extreme()
  const down = { ...base, box: base.box.map((p) => ({ ...p, currentHp: 0, koAt: now - 2 * H })) }
  await seed(page, { main: main(), extreme: down, slot: 'extreme' })
  await page.goto('/home')

  await expect(page.getByText('Your team is resting', { exact: true })).toBeVisible()
  await expect(page.getByText(/First back: Squirtle in 9h 5\dm, at 1 HP/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'CONTINUE' })).toBeDisabled()

  // Its sheet: the rest on a 12-hour track.
  await page.getByRole('main').getByRole('button', { name: 'Team' }).click()
  await expect(page).toHaveURL(/\/team$/)
  await page.getByRole('button', { name: /Squirtle/ }).first().click()
  await expect(page.getByText('Resting after a K.O.')).toBeVisible()
  await expect(page.getByText(/Back at 1 HP in 9h 5\dm/)).toBeVisible()
})

test('time out of the game heals, and says so once', async ({ page }) => {
  await mockSupabase(page)
  const base = extreme()
  const hurt = { ...base, box: base.box.map((p) => ({ ...p, currentHp: 3 })), extreme: { awayFrom: now - 5 * H } }
  await seed(page, { main: main(), extreme: hurt, slot: 'extreme' })
  await page.goto('/home')

  const card = page.getByRole('dialog', { name: 'While you were away' })
  await expect(card).toContainText(/Out of the game for 5h 0\dm/)
  await expect(card).toContainText('Squirtle')
  await card.getByRole('button', { name: 'OK' }).click()
  await expect(card).toHaveCount(0)
  // 10 % of its max HP an hour, five hours: +50 %, rounded down.
  await expect.poll(async () => (await stored(page, 'pokedice.save.extreme')).box[0].currentHp).toBeGreaterThan(3)
  const healed = await stored(page, 'pokedice.save.extreme')
  expect(healed.extreme?.awayFrom).toBeUndefined()
  expect(healed.extreme?.pending).toBeUndefined()
})

test('a rest that ends during the absence: back at 1 HP then, and healed for the time after only', async ({ page }) => {
  await mockSupabase(page)
  const base = extreme()
  // K.O. 13 h ago, away for the last 3 h: back at 1 HP an hour ago, then one hour of healing (not three).
  const resting = { ...base, box: base.box.map((p) => ({ ...p, currentHp: 0, koAt: now - 13 * H })), extreme: { awayFrom: now - 3 * H } }
  await seed(page, { main: main(), extreme: resting, slot: 'extreme' })
  await page.goto('/home')

  const card = page.getByRole('dialog', { name: 'While you were away' })
  await expect(card).toContainText('Back from K.O.')
  const max = instanceMaxHp(base.box[0]!, gameData())
  await expect.poll(async () => (await stored(page, 'pokedice.save.extreme')).box[0].currentHp).toBe(1 + Math.floor(max * 0.1))
  expect((await stored(page, 'pokedice.save.extreme')).box[0].koAt).toBeUndefined()
})

test('Delete my Extreme save: two pop-ups, and the main save stays', async ({ page }) => {
  await mockSupabase(page)
  await seed(page, { main: main(), extreme: extreme(), slot: 'extreme' })
  await page.goto('/settings')
  // The one Delete asks what goes (docs/38 U8b).
  await page.getByRole('button', { name: 'Delete a save or my data' }).click()
  await page.getByRole('dialog', { name: 'What do you want to delete?' }).getByRole('button', { name: 'Delete my Extreme save' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete your Extreme save?' })).toContainText('Your main save stays as it is.')
  await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('dialog', { name: 'Really delete everything?' }).getByRole('button', { name: 'Delete everything' }).click()

  await expect(page).toHaveURL(/\/$/)
  expect(await stored(page, 'pokedice.save.extreme')).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('pokedice.slot'))).toBeNull()
  expect((await stored(page, 'pokedice.save')).box[0].dex).toBe(4)
  await expect(page.getByRole('button', { name: /Continue/ }).first()).toBeVisible()
})

test('signed in, the Extreme save talks to its own world', async ({ page }) => {
  const calls = await mockSupabase(page)
  const bodies: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/')) bodies.push(`${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search} ${r.postData() ?? ''}`)
  })
  // A badge each: the leaderboard opens with the first one.
  await seed(page, { main: withBadge(main()), extreme: withBadge(extreme()), slot: 'extreme', session: true })
  await page.goto('/home')

  // The cloud copy read and written in the Extreme row.
  await expect.poll(() => calls.some((c) => c.startsWith('GET /rest/v1/saves') && c.includes('realm=eq.extreme'))).toBe(true)
  await expect.poll(() => bodies.some((b) => b.startsWith('POST /rest/v1/saves') && b.includes('"realm":"extreme"'))).toBe(true)
  // Friends and the leaderboard asked about the Extreme world.
  await page.goto('/leaderboard')
  await expect.poll(() => bodies.some((b) => b.includes('/rpc/leaderboard') && b.includes('"p_realm":"extreme"'))).toBe(true)
  await expect.poll(() => bodies.some((b) => b.includes('/rpc/friend_status') && b.includes('"p_realm":"extreme"'))).toBe(true)
  // Never the main row.
  expect(bodies.some((b) => b.startsWith('POST /rest/v1/saves') && !b.includes('"realm":"extreme"'))).toBe(false)
})

test('the main save talks to the database exactly as before', async ({ page }) => {
  await mockSupabase(page)
  const bodies: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/')) bodies.push(`${r.method()} ${new URL(r.url()).pathname} ${r.postData() ?? ''}`)
  })
  await seed(page, { main: withBadge(main()), session: true })
  await page.goto('/leaderboard')
  await expect.poll(() => bodies.some((b) => b.includes('/rpc/leaderboard'))).toBe(true)
  expect(bodies.some((b) => b.includes('p_realm'))).toBe(false)
  await expect.poll(() => bodies.some((b) => b.startsWith('POST /rest/v1/saves'))).toBe(true)
  expect(bodies.some((b) => b.includes('"realm"'))).toBe(false)
})
