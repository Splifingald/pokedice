// The gym stages (docs/67): a gym battle is fought on its type's stage, filling the battle stage, not on the area's
// picture. Lt. Surge's fight in Kanto shows the Electric one; its picture lands in docs/67-gym-stages/.
import { expect, test } from '@playwright/test'
import { emptyProgress, instanceMaxHp, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()

/** A Kanto save standing in Lt. Surge's area, every round done and every area before it cleared, the team raised. */
function atSurge(): SaveData {
  const area = data.areas.find((a) => a.gyms?.some((g) => data.trainers[g]?.name === 'Lt. Surge'))!
  const base = makeSave(4)
  const areaProgress: SaveData['areaProgress'] = {}
  for (const a of data.areas)
    if (a.regionId === area.regionId && a.orderIndex < area.orderIndex)
      areaProgress[a.id] = { ...emptyProgress(), cleared: true, roundsDone: a.roundsToClear ?? 1 }
  areaProgress[area.id] = { ...emptyProgress(), roundsDone: area.roundsToClear ?? 1, drawn: ['center'] }
  const box = base.box.map((p) => {
    const raised = { ...p, level: Math.max(p.level, area.maxLevel + 4) }
    return { ...raised, currentHp: instanceMaxHp(raised, data) }
  })
  return { ...base, box, currentAreaId: area.id, areaProgress }
}

test('a gym battle is fought on its type’s stage', async ({ page }) => {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(atSurge()), FAST],
  )
  await page.goto('/home')
  await page.getByRole('button', { name: /CHALLENGE .*SURGE/i }).first().click()
  const stage = page.locator('img[src="/area-art/gym-electric.png"]')
  await expect(stage).toBeVisible({ timeout: 20_000 })
  // The whole picture fills the stage: no crop as an area picture's battle window.
  await expect(stage).toHaveAttribute('style', /left: 0%; top: 0%; width: 100%; height: 100%/)
  await expect(page.locator('img[src^="/area-art/"]:not([src*="gym-"])')).toHaveCount(0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'docs/67-gym-stages/surge-battle.png' })
})
