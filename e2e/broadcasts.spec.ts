// Global messages (docs/69): the game tells the server how many badges the player holds (broadcast_claim, with the
// device), the server writes the player's copy of each message their badges reach, and it pops up on Home only, under
// its own title: the words with their links (blue, underlined, a new tab), a YouTube video played in the message, and
// the gift for everyone, opened into the save. My messages keeps it. Nothing is asked while the switch is off.
import { expect, test, type Page } from '@playwright/test'
import { EVENTS_ON, FAST, makeSave, mockSupabase, SUPABASE } from './helpers'

const GIFTS = [{ kind: 'gold', amount: 1000, region: 'latest' }]
const TITLE = 'The 3.0 trailer is here!'
const BODY =
  'Read the notes on https://example.com/notes.\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nHave fun!'

/** The switches for everyone (both ship off): global messages and the gifts. */
async function switches(page: Page, broadcasts: 'all' | 'off') {
  await page.addInitScript(
    (cfg) => localStorage.setItem('pokedice.devConfig', cfg),
    JSON.stringify({ ...EVENTS_ON, gifts: { access: 'all' }, broadcasts: { access: broadcasts } }),
  )
}

/**
 * The server's side: the claim (the copy written once; `hold` keeps the first answer back until released), the
 * messages, the gifts' opening. YouTube itself isn't reached: its player is a blank page here.
 */
async function server(page: Page, hold?: Promise<void>) {
  const asks: Record<string, unknown>[] = []
  const opened: unknown[] = []
  const now = new Date().toISOString()
  const mine: Record<string, unknown>[] = []
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>video</title>' }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/broadcast_claim**`, async (route) => {
    asks.push(route.request().postDataJSON() as Record<string, unknown>)
    if (hold) await hold
    const fresh = mine.length === 0
    if (fresh)
      mine.push({
        id: 41,
        created_at: now,
        title: TITLE,
        message: '',
        reply: BODY,
        replied_at: now,
        reply_seen: false,
        from_admin: true,
        gifts: GIFTS,
        gifts_claimed: false,
        broadcast: true,
      })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fresh ? 1 : 0),
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
      body: JSON.stringify([{ id: 41, gifts: GIFTS }]),
    })
  })
  return { asks, opened }
}

const SAVE = makeSave(4, { player: { name: 'Sam', character: 'red' } })

async function load(page: Page) {
  await page.addInitScript(
    ([s, f]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(SAVE), FAST],
  )
  await page.goto('/home')
}

test('a global message pops up on Home with its links, its video and its gift, opened into the save', async ({
  page,
}) => {
  await mockSupabase(page)
  await switches(page, 'all')
  const { asks, opened } = await server(page)
  await load(page)

  const popup = page.getByRole('dialog', { name: TITLE })
  await expect(popup).toBeVisible({ timeout: 15_000 })
  // Asked with this device and the badges held (a new game: none).
  expect(asks[0]).toMatchObject({ p_badges: 0 })
  expect(String(asks[0]!.p_device_id).length).toBeGreaterThan(0)

  // The link: blue, underlined, its sentence's full stop left out, in a new tab.
  const link = popup.getByRole('link', { name: 'https://example.com/notes' })
  await expect(link).toHaveAttribute('href', 'https://example.com/notes')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  const style = await link.evaluate((a) => {
    const s = getComputedStyle(a)
    return { line: s.textDecorationLine, color: s.color }
  })
  expect(style.line).toContain('underline')
  expect(style.color).toBe('rgb(29, 78, 216)')
  // The video, played in the message, from YouTube's no-cookie host.
  const video = popup.locator('iframe[title="Video from the developer (YouTube)"]')
  await expect(video).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  // Its address isn't shown as words as well.
  await expect(popup.getByText('youtube.com/watch')).toHaveCount(0)
  await expect(popup.getByText('Have fun!')).toBeVisible()
  await expect(popup.getByText('A gift is attached!')).toBeVisible()
  await page.screenshot({ path: 'test-results/broadcast-popup.png' })
  await popup.getByRole('button', { name: 'Open the gift' }).click()

  const moment = page.getByRole('dialog', { name: 'A gift from the developer' })
  await expect(moment).toBeVisible()
  expect(opened).toHaveLength(1)
  await moment.getByRole('button', { name: /skip/i }).click()
  await expect(moment.getByText('₽1,000')).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
  await expect.poll(async () => (await read()).gifts?.done).toEqual([41])
  expect((await read()).gold).toBe(SAVE.gold + 1000)

  // My messages keeps it, its link still a link.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('button', { name: 'Contact the developer' }).click()
  const form = page.getByRole('dialog', { name: 'Contact the developer' })
  await form.getByRole('button', { name: 'My messages' }).click()
  await expect(form.getByText(TITLE, { exact: true })).toBeVisible()
  await expect(form.getByRole('link', { name: 'https://example.com/notes' })).toBeVisible()
  await expect(form.getByText('Opened — it held:')).toBeVisible()
})

test('it waits off Home, and comes on the way back', async ({ page }) => {
  await mockSupabase(page)
  await switches(page, 'all')
  let release = () => {}
  const hold = new Promise<void>((r) => (release = r))
  const { asks } = await server(page, hold)
  await load(page)
  await expect.poll(() => asks.length).toBeGreaterThan(0)
  await page.getByRole('link', { name: 'Team', exact: true }).click()
  await expect(page.getByRole('button', { name: 'CONTINUE' })).toHaveCount(0)
  release()
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog', { name: TITLE })).toHaveCount(0)
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible({ timeout: 10_000 })
})

test('the switch off: nothing is asked, nothing pops up', async ({ page }) => {
  await mockSupabase(page)
  await switches(page, 'off')
  const { asks } = await server(page)
  await load(page)
  await expect(page.getByRole('button', { name: 'Your trainer menu' })).toBeVisible()
  await page.waitForTimeout(1500)
  expect(asks).toHaveLength(0)
  await expect(page.getByRole('dialog', { name: TITLE })).toHaveCount(0)
})
