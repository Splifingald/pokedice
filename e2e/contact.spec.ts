import { expect, test } from '@playwright/test'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

test('side menu → contact the developer: the warning, then title and description are sent', async ({
  page,
}) => {
  await mockSupabase(page)
  const sent: Record<string, unknown>[] = []
  await page.route(`${SUPABASE}/rest/v1/feedback**`, async (route) => {
    sent.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ status: 201, body: '' })
  })
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
  await page.goto('/map')

  // The last row of the side menu, pinned under the others.
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Sam' })
  await expect(menu.getByRole('button').last()).toHaveText('Contact the developer')
  await menu.getByRole('button', { name: 'Contact the developer' }).click()

  const form = page.getByRole('dialog', { name: 'Contact the developer' })
  await expect(
    form.getByText(/built by a solo developer and is free, there is no customer support/),
  ).toBeVisible()
  const send = form.getByRole('button', { name: 'SEND' })
  await expect(send).toBeDisabled()

  // Closing without sending keeps what was typed.
  await form.getByLabel('Title').fill('Idea: a Safari Zone')
  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await menu.getByRole('button', { name: 'Contact the developer' }).click()
  await expect(form.getByLabel('Title')).toHaveValue('Idea: a Safari Zone')

  await form.getByLabel('Description').fill('Throw bait and rocks.\nNo battles.')
  await send.click()

  await expect(page.getByText('Message sent — thank you!')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({
    title: 'Idea: a Safari Zone',
    message: 'Throw bait and rocks.\nNo battles.',
    player_name: 'Sam',
  })
  expect(sent[0]!.device_id).toEqual(expect.any(String))
})

test('a message that fails to send stays in the form with an error', async ({ page }) => {
  await mockSupabase(page)
  await page.route(`${SUPABASE}/rest/v1/feedback**`, (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', message: 'feedback_rate_limited' }),
    }),
  )
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(makeSave(4, { player: { name: 'Sam', character: 'red' } })), FAST],
  )
  await page.goto('/map')
  await page.getByRole('button', { name: 'Your trainer menu' }).click()
  await page.getByRole('button', { name: 'Contact the developer' }).click()

  const form = page.getByRole('dialog', { name: 'Contact the developer' })
  await form.getByLabel('Title').fill('Bug')
  await form.getByLabel('Description').fill('Something broke')
  await form.getByRole('button', { name: 'SEND' }).click()

  await expect(form.getByRole('alert')).toHaveText(/wait a few minutes/)
  await expect(form.getByLabel('Title')).toHaveValue('Bug')
})

test('admin → Messages lists what players sent, and marks one read', async ({ page }) => {
  await mockSupabase(page)
  const rows = [
    {
      id: 2,
      created_at: new Date().toISOString(),
      user_id: null,
      email: null,
      device_id: 'abcdef1234567890',
      player_name: 'Leaf',
      title: 'Bug in the shop',
      message: 'The Potion price shows twice.',
      context: { lang: 'fr', area: 'route-1' },
      read: false,
    },
    {
      id: 1,
      created_at: new Date(Date.now() - 86_400_000).toISOString(),
      user_id: '11111111-2222-4333-8444-555555555555',
      email: 'blue@example.com',
      device_id: 'zzz',
      player_name: 'Blue',
      title: 'Love the game',
      message: 'Keep going!',
      context: {},
      read: true,
    },
  ]
  const patches: string[] = []
  await page.route(`${SUPABASE}/rest/v1/feedback**`, (route) => {
    if (route.request().method() === 'PATCH') {
      patches.push(new URL(route.request().url()).search)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
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

  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
  await expect(page.getByText('2 total · 1 unread')).toBeVisible()
  await expect(page.getByText('Leaf · guest abcdef12')).toBeVisible()
  await expect(page.getByText('Blue · blue@example.com')).toBeVisible()
  await expect(page.getByText('The Potion price shows twice.')).toBeVisible()

  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  await expect(page.getByText('Love the game')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mark read' }).click()
  await expect(page.getByText('No unread messages.')).toBeVisible()
  expect(patches).toEqual(['?id=eq.2'])
})
