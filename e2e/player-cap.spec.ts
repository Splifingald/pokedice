// The player cap (docs/74): a game that finds the server full waits in line before anything else reaches the server,
// shows the message and its place, gets in by itself when the heartbeat says so, and from then on sends its token with
// every database request. Sent back for being idle, the line covers the game, which waits as it was.
import { expect, test } from '@playwright/test'
import { FAST, makeSave, mockSupabase, SUPABASE } from './helpers'

const TOKEN = 'ab'.repeat(32)
const line = (position: number, extra: Record<string, unknown> = {}) => ({
  status: 'queued',
  token: TOKEN,
  position,
  queueLength: 5,
  heartbeatSeconds: 30,
  queueHeartbeatSeconds: 15,
  idleMinutes: 10,
  cap: 30,
  ...extra,
})
const inside = {
  status: 'active',
  token: TOKEN,
  heartbeatSeconds: 30,
  queueHeartbeatSeconds: 15,
  idleMinutes: 10,
  cap: 30,
}

test('full at start: the line, its place, in by itself, then the token on every request; idle, back in line', async ({
  page,
}) => {
  await page.clock.install()
  const answers = [line(2), inside]
  let beats = 0
  const cards: unknown[] = []
  const calls = await mockSupabase(page, {
    rpc: {
      ccu_join: () => line(3),
      ccu_heartbeat: (body: { p_card?: unknown }) => {
        beats++
        if (body.p_card) cards.push(body.p_card)
        return answers.shift() ?? inside
      },
    },
  })
  const tokens: (string | undefined)[] = []
  page.on('request', (r) => {
    if (r.url().startsWith(`${SUPABASE}/rest/v1/`) && !r.url().includes('/rpc/ccu_'))
      tokens.push(r.headers()['x-ccu-token'])
  })
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(makeSave(4)), FAST],
  )
  await page.goto('/home')

  // The line, with the exact words, and nothing else asked of the server meanwhile.
  await expect(page.getByRole('heading', { name: 'Waiting line', level: 1 })).toBeVisible()
  await expect(
    page.getByText('Too many players currently on the game for the server capacity, please try again later.'),
  ).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'You are #3 in line' })).toBeVisible()
  await page.getByRole('button', { name: /Info: how Waiting line works/ }).click()
  await expect(
    page.getByRole('dialog', { name: 'Waiting line' }).getByText('Room for 30 players at once'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'OK' }).click()
  expect(calls.filter((c) => !c.includes('/rpc/ccu_') && !c.startsWith('GET /auth/'))).toEqual([])

  // The heartbeat moves it up the line, then lets it in: the game starts.
  await page.clock.fastForward('00:16')
  await expect(page.getByRole('status').filter({ hasText: 'You are #2 in line' })).toBeVisible()
  await page.clock.fastForward('00:16')
  await expect(page.getByText("You're in! Have fun.")).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiting line' })).toHaveCount(0)
  expect(beats).toBeGreaterThanOrEqual(2)
  // The players-online card rides on the heartbeat (docs/70): no ping of its own.
  await expect.poll(() => cards.length).toBe(1)
  expect(cards[0]).toMatchObject({ badges: expect.any(Number), team: expect.any(Array) })
  expect(calls.filter((c) => c.includes('/rpc/online_ping'))).toEqual([])
  // The game's own requests now go, each with the token.
  await expect.poll(() => tokens.length).toBeGreaterThan(0)
  expect(tokens.every((t) => t === TOKEN)).toBe(true)

  // Idle for 10 minutes with players waiting: back in line, over the game, saying why.
  answers.push(line(5, { reason: 'idle' }))
  await page.clock.fastForward('00:31')
  const dialog = page.getByRole('dialog', { name: 'Waiting line' })
  await expect(
    dialog.getByText('You were idle for 10 minutes, so your spot went to a waiting player'),
  ).toBeVisible()
  await expect(dialog.getByRole('status').filter({ hasText: 'You are #5 in line' })).toBeVisible()
  // It can't be closed: Escape leaves it there.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  // Its turn comes: the game is as it was.
  answers.push(inside)
  await page.clock.fastForward('00:16')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
})

test('a server without the cap (or offline): the game starts as before', async ({ page }) => {
  // The default stand-in answers ccu_join with nothing: no cap to wait for.
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(makeSave(4)), FAST],
  )
  await page.goto('/home')
  await expect(page.getByRole('heading', { name: 'Waiting line' })).toHaveCount(0)
  await expect(page.getByRole('navigation').first()).toBeVisible()
})
