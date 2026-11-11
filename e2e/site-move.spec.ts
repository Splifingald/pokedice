// The new address (docs/72), in a real browser across two addresses: both the real hosts, each served by the dev
// server, so each keeps its own storage as players' browsers do. With the switch on, the old address packs the save,
// leaves it with the (fake) server and goes to the new one, which takes it in before the game starts and says so once.
// A take that fails sends the player back to the old address, which keeps the save and plays on. Off: nothing moves.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { DEFAULT_CONFIG } from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase } from './helpers'

const OLD = 'https://poke-dice.netlify.app'
const NEW = 'https://pokedice.graf.quest'
const PORT = Number(process.env.E2E_PORT ?? 5174)

/** Both addresses, served by the dev server: the same build on two hosts, as Netlify serves it. */
async function twoHosts(context: BrowserContext) {
  for (const host of [OLD, NEW])
    await context.route(`${host}/**`, async (route) => {
      const url = new URL(route.request().url())
      try {
        const res = await route.fetch({ url: `http://localhost:${PORT}${url.pathname}${url.search}` })
        await route.fulfill({ response: res })
      } catch {
        // The page went on to the other address while its modules were still loading.
        await route.abort().catch(() => {})
      }
    })
}

const SAVE = makeSave(4, { player: { name: 'Mover', character: 'red' } })

/** The old address holds the save (once: a reload keeps what the game wrote); the switch as asked. */
async function seed(page: Page, access: 'all' | 'off') {
  await page.addInitScript(
    ([s, f, cfg, old]) => {
      localStorage.setItem('pokedice.devConfig', cfg!)
      if (location.origin !== old || sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.push', '{"on":true}')
    },
    [
      JSON.stringify(SAVE),
      FAST,
      JSON.stringify({ ...EVENTS_ON, siteMove: { ...DEFAULT_CONFIG.siteMove, access } }),
      OLD,
    ],
  )
}

/** The server's side of the hand-over: what was left, under which code. */
function server() {
  const left = new Map<string, string>()
  let n = 0
  return {
    left,
    rpc: {
      site_move_drop: (body: Record<string, unknown>) => {
        const code = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
        left.set(code, String(body.p_payload))
        return code
      },
      site_move_take: (body: Record<string, unknown>) => {
        const code = String(body.p_code)
        const payload = left.get(code) ?? null
        left.delete(code)
        return payload
      },
    },
  }
}

test('the old address hands the save over, and the new one says so once', async ({ page, context }) => {
  await twoHosts(context)
  const srv = server()
  await mockSupabase(page, { rpc: srv.rpc })
  await seed(page, 'all')
  await page.goto(`${OLD}/home`)

  // On to the new address, the same page, the save with the player.
  await page.waitForURL(`${NEW}/home`, { timeout: 30_000 })
  const popup = page.getByRole('dialog', { name: 'Pokédice has moved' })
  await expect(popup).toBeVisible({ timeout: 15_000 })
  await expect(popup.getByText('Play at pokedice.graf.quest from now on.', { exact: false })).toBeVisible()
  await expect(popup.getByText('Your save came along')).toBeVisible()
  await page.screenshot({ path: 'test-results/site-move-popup.png' })
  const stored = await page.evaluate(() => ({
    save: JSON.parse(localStorage.getItem('pokedice.save') ?? 'null') as { player: { name: string } } | null,
    push: localStorage.getItem('pokedice.push'),
  }))
  expect(stored.save?.player.name).toBe('Mover')
  // The push subscription was the old address's: the new one asks again.
  expect(stored.push).toBeNull()
  // Taken: nothing left on the server.
  expect(srv.left.size).toBe(0)

  await popup.getByRole('button', { name: 'OK' }).click()
  await expect(popup).toBeHidden()
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Pokédice has moved' })).toHaveCount(0, { timeout: 5000 })

  // Back to the old address (a bookmark): the same save, so nothing is sent again; straight on.
  await page.goto(`${OLD}/home`)
  await page.waitForURL(`${NEW}/home`, { timeout: 30_000 })
  expect(srv.left.size).toBe(0)
})

test('a take that fails: back to the old address, which keeps the save and plays on', async ({
  page,
  context,
}) => {
  await twoHosts(context)
  const srv = server()
  await mockSupabase(page, { rpc: srv.rpc })
  // The server down for the take (registered last: it answers before the mock's).
  await page.route('**/rest/v1/rpc/site_move_take', (route) => route.fulfill({ status: 503, body: '' }))
  await seed(page, 'all')
  await page.goto(`${OLD}/home`)
  // To the new address and back, with #stay: this load plays on here.
  await page.waitForURL(`${NEW}/move.html**`, { timeout: 30_000 })
  await page.waitForURL(`${OLD}/home`, { timeout: 30_000 })
  await page.waitForTimeout(4000)
  expect(new URL(page.url()).origin).toBe(OLD)
  const name = await page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem('pokedice.save') ?? 'null') as { player: { name: string } } | null)
        ?.player.name,
  )
  expect(name).toBe('Mover')
})

test('switched off: the old address keeps its players', async ({ page, context }) => {
  await twoHosts(context)
  const srv = server()
  await mockSupabase(page, { rpc: srv.rpc })
  await seed(page, 'off')
  await page.goto(`${OLD}/home`)
  await page.waitForTimeout(4000)
  expect(new URL(page.url()).origin).toBe(OLD)
  expect(srv.left.size).toBe(0)
})
