// Gifts with the developer's messages (docs/15 §23): the admin attaches items and Pokémon to an answer (Admin →
// Messages) or to a message written from a player's profile (Admin → Analytics); the player sees the gift under the
// message, and closing it opens the gift — the rules the first time, then the opening, what arrived, and the save.
import { expect, test, type Page } from '@playwright/test'
import {
  EVENTS_ON,
  EXTREME_ON,
  FAST,
  fakeSession,
  makeSave,
  mockSupabase,
  STORAGE_KEY,
  SUPABASE,
} from './helpers'

const GIFTS = [
  { kind: 'item', key: 'rare-candy', qty: 5, region: 'latest' },
  { kind: 'pokemon', dex: 25, level: 20, shiny: true, region: 'kanto' },
  { kind: 'gold', amount: 1500, region: 'latest' },
]

/** The gifts switched on for everyone (they ship off), over the events the mock switches on. */
async function giftsOn(page: Page) {
  await page.addInitScript(
    (cfg) => localStorage.setItem('pokedice.devConfig', cfg),
    JSON.stringify({ ...EVENTS_ON, gifts: { access: 'all' } }),
  )
}

test('an answer with a gift: shown under it, opened on closing, into the save', async ({ page }) => {
  await mockSupabase(page)
  await giftsOn(page)
  const mine = [
    {
      id: 9,
      created_at: new Date().toISOString(),
      title: 'Lost my Pikachu',
      message: 'It vanished after the update.',
      reply: 'Sorry about that — here it is, and a little extra.',
      replied_at: new Date().toISOString(),
      reply_seen: false,
      from_admin: false,
      gifts: GIFTS,
      gifts_claimed: false,
    },
  ]
  const claims: Record<string, unknown>[] = []
  await page.route(`${SUPABASE}/rest/v1/rpc/my_feedback**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/feedback_reply_seen**`, (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/feedback_claim_gifts**`, (route) => {
    claims.push(route.request().postDataJSON() as Record<string, unknown>)
    // Opened now: the next load says so.
    mine[0]!.gifts_claimed = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 9, gifts: GIFTS }]),
    })
  })
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
  await page.goto('/home')

  const popup = page.getByRole('dialog', { name: 'The developer answered!' })
  await expect(popup.getByText('Sorry about that — here it is, and a little extra.')).toBeVisible()
  await expect(popup.getByText('A gift is attached!')).toBeVisible()
  await expect(popup.getByText(/3 things inside · Close the message to open it\./)).toBeVisible()
  await popup.getByRole('button', { name: 'Open the gift' }).click()

  // The first gift: its rules, then Let's go! opens it.
  const rules = page.getByRole('dialog', { name: 'Gifts from the developer' })
  await expect(rules.getByText('With a message', { exact: true })).toBeVisible()
  expect(claims).toHaveLength(0)
  await rules.getByRole('button', { name: "Let's go!" }).click()

  const moment = page.getByRole('dialog', { name: 'A gift from the developer' })
  await expect(moment).toBeVisible()
  expect(claims).toHaveLength(1)
  expect(claims[0]).toMatchObject({ p_ids: [9] })
  await moment.getByRole('button', { name: /skip/i }).click()
  await expect(moment.getByText("Here's what was inside!")).toBeVisible()
  await expect(moment.getByText('Rare Candy')).toBeVisible()
  await expect(moment.getByText('×5')).toBeVisible()
  await expect(moment.getByText('Pikachu')).toBeVisible()
  await expect(moment.getByText('✦ Shiny')).toBeVisible()
  await expect(moment.getByText('In your Bag')).toBeVisible()
  await expect(moment.getByText('Joined your team')).toBeVisible()
  await expect(moment.getByText('Pokédollars', { exact: true })).toBeVisible()
  await expect(moment.getByText('₽1,500')).toBeVisible()
  await expect(moment.getByText('Added to your Pokédollars')).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(moment).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))
  expect(stored.inventory['rare-candy']).toBe((save.inventory['rare-candy'] ?? 0) + 5)
  expect(stored.gold).toBe(save.gold + 1500)
  const pika = stored.box.find((p: { dex: number }) => p.dex === 25)
  expect(pika).toMatchObject({ level: 20, shiny: true })
  expect(stored.team).toContain(pika.id)
  expect(stored.gifts).toEqual({ done: [9], rulesSeen: true })

  // My messages keeps it, opened.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('button', { name: 'Contact the developer' }).click()
  const form = page.getByRole('dialog', { name: 'Contact the developer' })
  await form.getByRole('button', { name: 'My messages' }).click()
  await expect(form.getByText('Opened — it held:')).toBeVisible()
  await expect(form.getByRole('button', { name: 'Info: how a gift works' })).toBeVisible()
})

test('a message from the developer with a gift that waits: Extreme mode says so, and opens nothing', async ({
  page,
}) => {
  await mockSupabase(page)
  await giftsOn(page)
  const mine = [
    {
      id: 4,
      created_at: new Date().toISOString(),
      title: 'Thanks for playing!',
      message: '',
      reply: 'A little something for the bug report.',
      replied_at: new Date().toISOString(),
      reply_seen: false,
      from_admin: true,
      gifts: [GIFTS[0]],
      gifts_claimed: false,
    },
  ]
  const claims: unknown[] = []
  await page.route(`${SUPABASE}/rest/v1/rpc/my_feedback**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/feedback_reply_seen**`, (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/feedback_claim_gifts**`, (route) => {
    claims.push(1)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  // Playing the Extreme save (Extreme mode on, as e2e/extreme.spec.ts seeds it).
  await page.addInitScript(
    ([m, x, f, on]) => {
      localStorage.setItem('pokedice.devConfig', on!)
      localStorage.setItem('pokedice.save', m!)
      localStorage.setItem('pokedice.save.extreme', x!)
      localStorage.setItem('pokedice.slot', 'extreme')
      localStorage.setItem('pokedice.settings', f!)
    },
    [
      JSON.stringify(makeSave(4, { player: { name: 'Sam', character: 'red' } })),
      JSON.stringify(makeSave(7, { player: { name: 'Sam', character: 'red' }, mode: 'extreme' })),
      FAST,
      JSON.stringify({ ...EXTREME_ON, gifts: { access: 'all' } }),
    ],
  )
  await page.goto('/home')

  const popup = page.getByRole('dialog', { name: 'A message from the developer!' })
  await expect(popup.getByText('From the developer', { exact: true })).toBeVisible()
  await expect(popup.getByText('A little something for the bug report.')).toBeVisible()
  await expect(popup.getByText(/It opens in your main game\./)).toBeVisible()
  await popup.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(claims).toHaveLength(0)
})

test('admin → Messages: an answer carries a gift, and says when it was opened', async ({ page }) => {
  await mockSupabase(page)
  await giftsOn(page)
  const row = {
    id: 3,
    created_at: new Date().toISOString(),
    user_id: null,
    email: null,
    device_id: 'abcdef1234567890',
    player_name: 'Leaf',
    title: 'Lost my Rare Candies',
    message: 'They were gone after a sync.',
    context: {},
    read: false,
    reply: null,
    replied_at: null,
    reply_seen: false,
    from_admin: false,
    gifts: null,
    gifts_claimed_at: null,
  }
  const patches: Record<string, unknown>[] = []
  await page.route(`${SUPABASE}/rest/v1/feedback**`, (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      patches.push(body)
      const saved = { ...row, ...body, read: true, replied_at: new Date().toISOString() }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(saved) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([row]) })
  })
  await page.addInitScript(
    ([k, v, s, f]) => {
      localStorage.setItem(k!, v!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4)), FAST],
  )
  await page.goto('/admin/messages')

  await expect(page.getByRole('radiogroup', { name: 'Gifts: who gets them' })).toBeVisible()
  await page.getByRole('button', { name: 'Reply', exact: true }).click()
  await page.getByLabel(/Answer/).fill('Here are a few back.')
  await page.getByRole('button', { name: 'Add a gift' }).click()
  await page.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(page.getByText('Rare Candy ×3')).toBeVisible()
  await page.getByLabel('Pokédollars (₽)').fill('2500')
  await page.getByLabel('To the ₽ of').selectOption('johto')
  await page.getByRole('button', { name: 'Add ₽' }).click()
  await expect(page.getByText('₽2,500')).toBeVisible()
  await page.getByRole('button', { name: 'Send answer' }).click()

  await expect(page.getByText('Your answer')).toBeVisible()
  await expect(page.getByText('Not opened yet')).toBeVisible()
  expect(patches).toEqual([
    {
      reply: 'Here are a few back.',
      gifts: [
        { kind: 'item', key: 'rare-candy', qty: 3, region: 'latest' },
        { kind: 'gold', amount: 2500, region: 'johto' },
      ],
    },
  ])
})

test('admin → Analytics → a player: write to them first, with a Pokémon', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await mockSupabase(page, { rpc: { analytics_d1: {} } })
  await giftsOn(page)
  const today = new Date().toISOString().slice(0, 10)
  await page.route(`${SUPABASE}/rest/v1/players**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        new URL(route.request().url()).searchParams.get('select')?.includes('snapshot,updated_at')
          ? null
          : [
              {
                player: 'device:dev-leaf-1234',
                user_id: null,
                name: 'Leaf',
                email: null,
                first_day: today,
                last_day: today,
                days: 3,
                area: null,
                badges: null,
                team: null,
              },
            ],
      ),
    }),
  )
  const posts: Record<string, unknown>[] = []
  await page.route(`${SUPABASE}/rest/v1/feedback**`, (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      posts.push(body)
      const saved = {
        id: 50,
        created_at: new Date().toISOString(),
        email: null,
        context: {},
        read: true,
        replied_at: new Date().toISOString(),
        reply_seen: false,
        gifts_claimed_at: null,
        ...body,
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(saved) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.addInitScript(
    ([k, v, s]) => {
      localStorage.setItem(k!, v!)
      localStorage.setItem('pokedice.save', s!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4))],
  )
  await page.goto('/admin/analytics')

  await page.getByText('Leaf', { exact: true }).click({ timeout: 30_000 })
  const profile = page.getByRole('region', { name: "Leaf's profile" })
  await expect(profile.getByText('No messages between you yet.')).toBeVisible()
  await profile.getByLabel('Title', { exact: true }).fill('Thanks for the report')
  await profile.getByLabel('Message', { exact: true }).fill('Fixed! Here is a Pikachu.')
  await profile.getByRole('button', { name: 'Pokémon', exact: true }).click()
  await profile.getByPlaceholder('Pick a Pokémon…').fill('Pikachu')
  await page
    .getByRole('option', { name: /Pikachu/ })
    .first()
    .click()
  await profile.getByLabel('Level', { exact: true }).fill('12')
  await profile.getByLabel('Shiny').check()
  await profile.getByRole('button', { name: 'Add Pokémon' }).click()
  await expect(profile.getByText('Pikachu Lv.12 ✦ shiny')).toBeVisible()
  await profile.getByRole('button', { name: 'Send to Leaf' }).click()

  await expect(profile.getByText('FROM YOU')).toBeVisible()
  await expect(profile.getByText('To Leaf · guest dev-leaf')).toBeVisible()
  expect(posts).toHaveLength(1)
  expect(posts[0]).toMatchObject({
    from_admin: true,
    user_id: null,
    device_id: 'dev-leaf-1234',
    title: 'Thanks for the report',
    message: '',
    reply: 'Fixed! Here is a Pikachu.',
    gifts: [{ kind: 'pokemon', dex: 25, level: 12, shiny: true, region: 'latest' }],
  })
})
