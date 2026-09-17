// Layout guardrails (v1.6 review, phase 4): at four screen sizes every game screen must not scroll sideways, phone
// controls must be at least 44px, axe must find nothing serious, and a battle must fit a 360×640 phone.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createInstance, linearAreas, progressOf, type SaveData } from '../src/engine'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()

/** A mid-game save: 6 areas cleared, a team of three at full HP, a small Box, some items. */
function midGameSave(): SaveData {
  const base = makeSave(4, { gold: 1240 })
  let n = 0
  const mk = (dex: number, level: number) => createInstance(dex, level, data, `layout-${++n}`, Date.now())
  const extra = [mk(25, 21), mk(74, 20), mk(17, 20), mk(19, 14), mk(10, 6), mk(21, 12), mk(27, 15)]
  const chain = linearAreas(data)
  const areaProgress = { ...base.areaProgress }
  for (const a of chain.slice(0, 6)) {
    areaProgress[a.id] = {
      ...progressOf(base, a.id),
      xp: a.xpToUnlockNext ?? 0,
      cleared: true,
      gymsDefeated: [...a.gyms],
      bossDefeated: true,
      bossesDefeated: (a.legendaryBoss ?? []).map((b) => b.dex),
    }
  }
  return {
    ...base,
    box: [...base.box, ...extra],
    team: [base.team[0]!, extra[0]!.id, extra[1]!.id],
    pokedex: [...new Set([...base.pokedex, ...extra.map((p) => p.dex)])],
    inventory: { potion: 4, 'poke-ball': 8, 'great-ball': 2 },
    areaProgress,
    currentAreaId: chain[6]!.id,
  }
}

async function boot(page: Page) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(midGameSave()), FAST],
  )
}

/** Visible controls under 44px. Links inside a sentence are exempt (WCAG 2.5.8 "inline"). */
function smallControls(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('a,button,input,select,summary,[role=button],[role=tab]'))
      .filter((el) => !(el.tagName === 'A' && el.closest('p')))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => `${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`),
  )
}

const ROUTES = ['/map', '/area', '/team', '/shop', '/upgrades', '/pokedex', '/settings']
const SIZES = [
  { width: 360, height: 640, phone: true },
  { width: 375, height: 812, phone: true },
  { width: 768, height: 1024, phone: false },
  { width: 1280, height: 900, phone: false },
]

for (const size of SIZES) {
  test(`every screen fits at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size)
    await boot(page)
    for (const route of ROUTES) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${route} scrolls sideways`).toBeLessThanOrEqual(0)
      if (size.phone) expect(await smallControls(page), `${route}: controls under 44px`).toEqual([])
      if (size.width === 375 || size.width === 1280) {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(bad.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(' ')}`), `${route}: axe`).toEqual([])
      }
    }
  })
}

test('a battle fits a 360×640 phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page)
  await page.goto('/area')
  const attack = page.getByRole('button', { name: 'ATTACK', exact: true })
  for (let i = 0; i < 60 && !(await attack.isVisible().catch(() => false)); i++) {
    for (const name of ['FIGHT', 'EXPLORE', 'NEXT ENCOUNTER', 'ENTER', 'PICK IT UP', 'CONTINUE']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
  await expect(attack).toBeEnabled()
  await page.waitForTimeout(1200) // let the thrown dice settle before measuring them
  const box = await attack.boundingBox()
  expect(box!.y + box!.height, 'ATTACK is on screen').toBeLessThanOrEqual(640)
  const dims = await page.evaluate(() => {
    const h = (sel: string) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? -1)
    return { page: document.documentElement.scrollHeight, view: window.innerHeight, header: h('header'), scene: h('.scanlines'), dialogue: h('.pixel-dialogue') }
  })
  // Everything up to the controls fits; only the separate "Battle history" row may sit just below the fold.
  const history = await page.getByRole('button', { name: 'Battle history' }).boundingBox()
  expect(history, 'the history button is there').not.toBeNull()
  expect(dims.page - dims.view, `the battle scrolls: ${JSON.stringify(dims)}`).toBeLessThanOrEqual(history!.height + 8)
  expect(await smallControls(page), 'battle controls under 44px').toEqual([])
})
