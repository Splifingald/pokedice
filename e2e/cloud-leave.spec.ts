// Leaving the page sends the save at once (docs/21 §12): a game added to the home screen keeps a save of its own, and
// what it played used to stay there until the next automatic sync, which a closed app never reached.
import { expect, test } from '@playwright/test'
import { FAST, fakeSession, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

test('hiding the page sends what was played since the last upload, over the copy last matched', async ({ page }) => {
  await page.clock.install()
  await mockSupabase(page)
  const writes: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname === '/rest/v1/saves' && r.method() !== 'GET' && r.method() !== 'OPTIONS')
      writes.push(`${r.method()} ${decodeURIComponent(url.search)}`)
  })
  await page.addInitScript(
    ([key, session, s, f]) => {
      if (sessionStorage.getItem('e2e.seeded')) return
      sessionStorage.setItem('e2e.seeded', '1')
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(makeSave(4)), FAST],
  )
  await page.goto('/settings')
  // The sign-in sync: no copy in the cloud yet, so this device's goes up.
  await expect.poll(() => writes.filter((w) => w.startsWith('POST')).length).toBe(1)

  // Played on (a setting is enough), past the gap between two uploads, then the page is hidden.
  await page.clock.fastForward('03:00')
  await page.getByRole('switch', { name: /Sound/ }).click()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => writes.filter((w) => w.startsWith('PATCH'))).toHaveLength(1)
  expect(writes.find((w) => w.startsWith('PATCH'))).toMatch(/user_id=eq\.[^&]+&realm=eq\.main&updated_at=gte\..+&updated_at=lt\./)
})
