// Showdown's CDN stalling (src/lib/showdownReach.ts): a battle stood empty, the HP plates over no Pokémon, while
// play.pokemonshowdown.com kept every sprite loading (players on Discord, 2026-10-27). After a few seconds the game's
// own copies stand in, Home's team and the battle alike, and a reload goes straight to them.
import { expect, test, type Page } from '@playwright/test'
import { FAST, makeSave, mockSupabase } from './helpers'

/** Showdown answers nothing: each request hangs, as it did for the players. */
async function stallShowdown(page: Page): Promise<string[]> {
  const asked: string[] = []
  await page.route('https://play.pokemonshowdown.com/**', (route) => {
    asked.push(route.request().url())
    // Neither fulfilled nor aborted: the browser keeps waiting.
  })
  return asked
}

/** The sprites shown from the game's own copies, loaded. */
const localSprites = (page: Page) =>
  page.evaluate(
    () =>
      Array.from(document.querySelectorAll<HTMLImageElement>('img[src*="/pokemon/"]')).filter(
        (i) => i.complete && i.naturalWidth > 0,
      ).length,
  )
const showdownImgs = (page: Page) => page.locator('img[src*="pokemonshowdown.com"]')

test("a Showdown that stalls: the game's own sprites stand in, at Home and in battle", async ({ page }) => {
  await mockSupabase(page)
  const asked = await stallShowdown(page)
  await page.addInitScript(
    ([s, f]) => {
      if (sessionStorage.getItem('booted')) return
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(makeSave(4)), FAST],
  )
  await page.goto('/home')
  await expect(page.getByRole('img', { name: /Your team in/ })).toBeVisible()
  // Showdown is asked first, then given up on.
  expect(asked.length).toBeGreaterThan(0)
  await expect(showdownImgs(page)).toHaveCount(0, { timeout: 10_000 })
  await expect.poll(() => localSprites(page)).toBeGreaterThan(0)

  // Into a battle: both Pokémon stand on the stage, from the local copies, with no new wait.
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  for (
    let i = 0;
    i < 100 && !(await page.getByRole('button', { name: 'ATTACK', exact: true }).isVisible());
    i++
  ) {
    // A round's encounter can be an item on the ground first.
    for (const name of ['EXPLORE', 'ENTER', 'PICK IT UP', 'FIGHT', 'CONTINUE']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false)))
        await b.click()
    }
    await page.waitForTimeout(100)
  }
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible()
  await expect(showdownImgs(page)).toHaveCount(0)
  await expect.poll(() => localSprites(page), { timeout: 3000 }).toBeGreaterThanOrEqual(2)

  // A reload (back into the same fight) remembers: the local sprites at once, and Showdown isn't asked again.
  const before = asked.length
  await page.reload()
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeVisible()
  await expect.poll(() => localSprites(page), { timeout: 3000 }).toBeGreaterThanOrEqual(2)
  await expect(showdownImgs(page)).toHaveCount(0)
  expect(asked.length).toBe(before)
})
