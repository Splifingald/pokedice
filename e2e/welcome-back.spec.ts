// Welcome-back gifts (docs/56): once a day the game asks the server whether the player is back from days away
// (welcome_back_claim, with the player's own day and the device); the server decides and writes a message from the
// developer with the tier's gifts, which then comes like any other: the pop-up (its own title and words, in the
// player's language), the wrapped gift, the gifts' rules the first time, the opening, the save, My messages with INFO.
// Nothing is asked while the switch, or the gifts', is off; a reload the same day asks nothing more.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG } from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase, SUPABASE } from './helpers'

const SEVEN = DEFAULT_CONFIG.welcomeBack.tiers[1]!.gifts

/** The switches for everyone (both ship off): welcome back and the gifts it rides on. */
async function switches(page: Page, welcome: 'all' | 'off', gifts: 'all' | 'off' = 'all') {
  await page.addInitScript(
    (cfg) => localStorage.setItem('pokedice.devConfig', cfg),
    JSON.stringify({
      ...EVENTS_ON,
      gifts: { access: gifts },
      welcomeBack: { ...DEFAULT_CONFIG.welcomeBack, access: welcome },
    }),
  )
}

/** The server's side: the claim (written once, answered the same after), the messages, the gifts' opening. */
async function server(page: Page) {
  const asks: Record<string, unknown>[] = []
  const opened: unknown[] = []
  const now = new Date().toISOString()
  const mine: Record<string, unknown>[] = []
  await page.route(`${SUPABASE}/rest/v1/rpc/welcome_back_claim**`, (route) => {
    asks.push(route.request().postDataJSON() as Record<string, unknown>)
    const fresh = mine.length === 0
    if (fresh)
      mine.push({
        id: 31,
        created_at: now,
        title: 'welcome_back',
        message: '',
        reply: '@welcome_back:{"days":9,"minDays":7,"from":3,"cooldown":14}',
        replied_at: now,
        reply_seen: false,
        from_admin: true,
        gifts: SEVEN,
        gifts_claimed: false,
      })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ day: asks.at(-1)!.p_day, days: 9, minDays: 7, messageId: 31, fresh }),
    })
  })
  await page.route(`${SUPABASE}/rest/v1/rpc/my_feedback**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/feedback_reply_seen**`, (route) => {
    const ids = (route.request().postDataJSON() as { p_ids: number[] }).p_ids
    for (const m of mine) if (ids.includes(m.id as number)) m.reply_seen = true
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route(`${SUPABASE}/rest/v1/rpc/feedback_claim_gifts**`, (route) => {
    opened.push(route.request().postDataJSON())
    mine[0]!.gifts_claimed = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 31, gifts: SEVEN }]),
    })
  })
  return { asks, opened }
}

const SAVE = makeSave(4, { player: { name: 'Sam', character: 'red' } })

async function load(page: Page) {
  await page.addInitScript(
    ([s, f]) => {
      // Once per page: a reload keeps what the game wrote (its "asked today", the gifts in the save).
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(SAVE), FAST],
  )
  await page.goto('/home')
}

test('back after 9 days: the developer’s message with the 7-day gift, opened into the save', async ({
  page,
}) => {
  await mockSupabase(page)
  await switches(page, 'all')
  const { asks, opened } = await server(page)
  await load(page)

  const popup = page.getByRole('dialog', { name: 'Welcome back, Sam!' })
  await expect(popup).toBeVisible({ timeout: 15_000 })
  // Asked with the player's own day and this device.
  const today = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  expect(asks).toHaveLength(1)
  expect(asks[0]).toMatchObject({ p_day: today })
  expect(String(asks[0]!.p_device_id).length).toBeGreaterThan(0)

  await expect(popup.getByText(/A gift for coming back\./)).toBeVisible()
  await expect(popup.getByText('From the developer', { exact: true })).toBeVisible()
  await expect(
    popup.getByText(/You were away for 9 days, so here's a gift to get you going again!/),
  ).toBeVisible()
  await expect(
    popup.getByText(
      /Come back after 3 days or more away and a gift waits for you.*At most one every 14 days\./,
    ),
  ).toBeVisible()
  await expect(popup.getByText('A gift is attached!')).toBeVisible()
  await expect(popup.getByText(/5 things inside · Close the message to open it\./)).toBeVisible()
  await page.screenshot({ path: 'test-results/welcome-back-popup.png' })
  await popup.getByRole('button', { name: 'Open the gift' }).click()

  // The first gift ever: the gifts' own rules, then the opening.
  await page
    .getByRole('dialog', { name: 'Gifts from the developer' })
    .getByRole('button', { name: "Let's go!" })
    .click()
  const moment = page.getByRole('dialog', { name: 'A gift from the developer' })
  await expect(moment).toBeVisible()
  expect(opened).toHaveLength(1)
  await moment.getByRole('button', { name: /skip/i }).click()
  await expect(moment.getByText('Ultra Ball')).toBeVisible()
  await expect(moment.getByText('Hyper Potion')).toBeVisible()
  await expect(moment.getByText('Revive', { exact: true })).toBeVisible()
  await expect(moment.getByText('₽1,000')).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
  // The save is written a moment later.
  await expect.poll(async () => (await read()).gifts?.done).toEqual([31])
  const stored = await read()
  expect(stored.inventory['ultra-ball']).toBe((SAVE.inventory['ultra-ball'] ?? 0) + 5)
  expect(stored.inventory['hyper-potion']).toBe((SAVE.inventory['hyper-potion'] ?? 0) + 3)
  expect(stored.inventory['revive']).toBe((SAVE.inventory['revive'] ?? 0) + 2)
  expect(stored.inventory['rare-candy']).toBe((SAVE.inventory['rare-candy'] ?? 0) + 2)
  expect(stored.gold).toBe(SAVE.gold + 1000)
  expect(stored.gifts).toEqual({ done: [31], rulesSeen: true })

  // My messages keeps it, opened, with its INFO.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('button', { name: 'Contact the developer' }).click()
  const form = page.getByRole('dialog', { name: 'Contact the developer' })
  await form.getByRole('button', { name: 'My messages' }).click()
  await expect(form.getByText('Welcome back!', { exact: true })).toBeVisible()
  await expect(form.getByText('Opened — it held:')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/welcome-back-inbox.png' })
  await form.getByRole('button', { name: 'Info: how a welcome-back gift works' }).click()
  const rules = page.getByRole('dialog', { name: 'Welcome-back gifts' })
  await expect(rules.getByText('Away 3 days or more')).toBeVisible()
  await expect(rules.getByText('3 days → ₽300 +3 · 7 days → ₽1,000 +4 · 14 days → ₽2,500 +4')).toBeVisible()
  await expect(rules.getByText('One every 14 days at most')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/welcome-back-rules.png' })
  await rules.getByRole('button', { name: 'OK' }).click()

  // A reload the same day asks nothing more, and nothing pops up again.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Your trainer menu' })).toBeVisible()
  await page.waitForTimeout(1500)
  expect(asks).toHaveLength(1)
  await expect(page.getByRole('dialog', { name: 'Welcome back, Sam!' })).toHaveCount(0)
})

test('the switch off, or the gifts off: nothing is asked', async ({ page }) => {
  for (const [welcome, gifts] of [
    ['off', 'all'],
    ['all', 'off'],
  ] as const) {
    const fresh = await page.context().newPage()
    await mockSupabase(fresh)
    await switches(fresh, welcome, gifts)
    const { asks } = await server(fresh)
    await load(fresh)
    await expect(fresh.getByRole('button', { name: 'Your trainer menu' })).toBeVisible()
    await fresh.waitForTimeout(1500)
    expect(asks, `welcome ${welcome}, gifts ${gifts}`).toHaveLength(0)
    await expect(fresh.getByRole('dialog', { name: /Welcome back/ })).toHaveCount(0)
    await fresh.close()
  }
  await page.close()
})
