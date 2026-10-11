// Between encounters: the Pokémon Center's healing (SKIP, and no second jingle after a trip Home), staying in the area
// after an encounter, the action bars pinned over the phone tab bar, and Home's way to the furthest open area.
import { expect, test, type Page } from '@playwright/test'
import { emptyProgress, linearAreas, regionOf, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })

async function boot(page: Page, save: SaveData, settings = FAST) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), settings],
  )
}

const hurt = (save: SaveData): SaveData => ({ ...save, box: save.box.map((p) => ({ ...p, currentHp: 1 })) })

test('the Pokémon Center: SKIP ends the healing, and back from Home it opens on the team', async ({ page }) => {
  // A tall phone: the page is short, and HOME / NEXT ENCOUNTER still sit right on the tab bar.
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, hurt(makeSave(4)), MOTION_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()

  const healing = page.getByRole('dialog', { name: 'Healing…' })
  await expect(healing).toBeVisible()
  await healing.getByRole('button', { name: /SKIP/ }).click()
  await expect(healing).toHaveCount(0)

  const next = page.getByRole('button', { name: 'NEXT ENCOUNTER', exact: true })
  const bar = await next.boundingBox()
  const tabs = await page.getByRole('navigation', { name: 'Menus' }).last().boundingBox()
  expect(bar!.y + bar!.height).toBeGreaterThan(tabs!.y - 16)
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(tabs!.y)

  // Home, then back: the team is healed already, so no jingle again.
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/home$/)
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByText('You are in the Pokémon Center')).toBeVisible()
  await expect(healing).toHaveCount(0)
})

test('Escape ends the healing too', async ({ page }) => {
  await boot(page, hurt(makeSave(4)), MOTION_ON)
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  const healing = page.getByRole('dialog', { name: 'Healing…' })
  await expect(healing).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(healing).toHaveCount(0)
})

test('after an encounter the player stays in the area; HOME is the way back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const data = gameData()
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const area = chain.find((a) => a.lootPool.length && (a.encounterWeights.item ?? 0) > 0)!
  const areaProgress = { ...base.areaProgress }
  for (const a of chain.slice(0, chain.indexOf(area)))
    areaProgress[a.id] = { ...emptyProgress(), roundsDone: a.roundsToClear ?? 0, cleared: true, bossDefeated: true, gymsDefeated: [...a.gyms] }
  // An item on top of the deck: the next encounter is a find.
  areaProgress[area.id] = { ...emptyProgress(), deck: ['wild', 'item'] }
  await boot(page, { ...base, areaProgress, currentAreaId: area.id })
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page.getByRole('button', { name: /PICK IT UP/ }).click()

  // Still in the area: the team, and what comes next.
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByText('Back on the trail')).toBeVisible()
  await expect(page.getByRole('button', { name: 'NEXT ENCOUNTER', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
})

test('Home offers the furthest open area of the region when the player is behind', async ({ page }) => {
  const data = gameData()
  const base = makeSave(4)
  const chain = linearAreas(data, regionOf(base))
  const areaProgress = Object.fromEntries(chain.slice(0, 2).map((a) => [a.id, { ...emptyProgress(), cleared: true }]))
  await boot(page, { ...base, areaProgress, currentAreaId: chain[0]!.id })
  await page.goto('/home')

  const latest = chain[2]!
  const go = page.getByRole('button', { name: `Go to ${latest.name}` })
  await go.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(latest.name)
  // There now: nothing more to offer.
  await expect(go).toHaveCount(0)
})
