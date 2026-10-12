// The special events on a phone (docs/19 phase 7), with the guardrails of layout.spec.ts: the wheel, the raids and the
// rebattle pages fit 360×640 and 375×812 without scrolling sideways, every control is 44px or more, the text is in the
// Jersey fonts, and axe finds nothing serious; the raid fight fits a 360×640 phone like a battle does.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, type SaveData } from '../src/engine'
import { FAST, makeSave, mockSupabase, nonJerseyText, smallControls } from './helpers'

const cleared = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
const LEAGUE = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
const FARAWAY = '050ff505-ff8e-5251-8499-842a2cfc2986'
const SEAFOAM = '51bb91b2-9c10-508c-bd4d-0f9e39e3f30d'

/** Every event open: Routes 7 & 8, the Safari Zone, Faraway Island and the Kanto League cleared; a team of three. */
function eventsSave(): SaveData {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const mon = (id: string, dex: number) => ({ id, dex, level: 60, xp: 0, currentHp: 999, caughtAt: 0 })
  return {
    ...base,
    box: [mon('a', 248), mon('b', 359), mon('c', 197)],
    team: ['a', 'b', 'c'],
    pokedex: [...base.pokedex, 248, 359, 197],
    inventory: { ...base.inventory, 'ultra-ball': 2 },
    areaProgress: {
      ...base.areaProgress,
      [DEFAULT_CONFIG.events.wheel.unlockAreaId!]: cleared,
      [DEFAULT_CONFIG.events.raid.unlockAreaId!]: cleared,
      [FARAWAY]: cleared,
      [SEAFOAM]: cleared,
      [LEAGUE]: cleared,
    },
    events: { seen: ['wheel', 'raid', 'rebattle'] },
    regionOfferSeen: ['johto'],
    settings: { ...base.settings, reducedMotion: true },
  }
}

async function boot(page: Page) {
  const eventTime = () => ({ now: new Date().toISOString(), day: new Date().toISOString().slice(0, 10) })
  await mockSupabase(page, { rpc: { event_time: eventTime } })
  await page.addInitScript(
    ([s, f]) => {
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(eventsSave()), FAST],
  )
}

// The last one: Articuno's progression raid (docs/24), open with the Seafoam Islands completed.
const ROUTES = ['/events/wheel', '/events/raid', '/events/rebattle', `/raid/${SEAFOAM}/144`]

/** What sticks out past the right edge, to say which element makes a page scroll sideways. */
const wide = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.right > window.innerWidth + 0.5)
      .map(({ el, r }) => `${el.tagName}.${String(el.getAttribute('class') ?? '').slice(0, 50)} → ${Math.round(r.right)}`)
      .slice(0, 6),
  )

for (const size of [
  { width: 360, height: 640 },
  { width: 375, height: 812 },
]) {
  test(`the event pages fit at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size)
    await boot(page)
    for (const route of ROUTES) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      // The raid page's buttons wait for the day's raid.
      if (route === '/events/raid' || route.startsWith('/raid/')) await expect(page.getByRole('button', { name: 'Start the raid' })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${route} scrolls sideways: ${(await wide(page)).join(' | ')}`).toBeLessThanOrEqual(0)
      expect(await nonJerseyText(page), `${route}: fonts`).toEqual([])
      expect(await smallControls(page), `${route}: controls under 44px`).toEqual([])
      if (size.width === 375) {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(bad.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(' ')}`), `${route}: axe`).toEqual([])
      }
    }
  })
}

test('the raid calendar lists the next two weeks under its note', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page)
  await page.goto('/events/raid')
  await page.getByRole('button', { name: 'Calendar: the raids of the next two weeks' }).click()
  const dialog = page.getByRole('dialog', { name: 'Raids calendar' })
  await expect(dialog.getByRole('note')).toHaveText('The raids calendar might change at any time without notice.')
  const days = dialog.getByRole('listitem')
  await expect(days).toHaveCount(14)
  await expect(days.first()).toHaveAttribute('aria-current', 'date')
  await expect(days.first()).toContainText('Today')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `the calendar scrolls sideways: ${(await wide(page)).join(' | ')}`).toBeLessThanOrEqual(0)
  expect(await nonJerseyText(page), 'calendar: fonts').toEqual([])
  expect(await smallControls(page), 'calendar: controls under 44px').toEqual([])
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(' ')}`), 'calendar: axe').toEqual([])
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toBeHidden()
})

test('a raid fight fits a 360×640 phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page)
  await page.goto('/events/raid')
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  // The NPC partners pop-up fits the phone too.
  await expect(pop.getByRole('button', { name: /, Lv\.\d+$/ })).toHaveCount(4)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `the picker scrolls sideways: ${(await wide(page)).join(' | ')}`).toBeLessThanOrEqual(0)
  expect(await nonJerseyText(page), 'picker: fonts').toEqual([])
  expect(await smallControls(page), 'picker: controls under 44px').toEqual([])
  const picker = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = picker.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(' ')}`), 'picker: axe').toEqual([])
  await pop.getByRole('button', { name: /, Lv\.\d+$/ }).nth(0).click()
  await pop.getByRole('button', { name: /, Lv\.\d+$/ }).nth(1).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  const attack = page.getByRole('button', { name: 'ATTACK', exact: true })
  await expect(attack).toBeEnabled({ timeout: 20_000 })
  await page.waitForTimeout(800) // the thrown dice settle
  expect(await nonJerseyText(page), 'raid: fonts').toEqual([])
  const box = await attack.boundingBox()
  expect(box!.y + box!.height, 'ATTACK is on screen').toBeLessThanOrEqual(640)
  const dims = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight,
    view: window.innerHeight,
    header: Math.round(document.querySelector('header')?.getBoundingClientRect().height ?? -1),
  }))
  expect(dims.header, 'no top bar in a raid').toBe(-1)
  expect(dims.page - dims.view, `the raid scrolls: ${JSON.stringify(dims)}`).toBeLessThanOrEqual(0)
  expect(await smallControls(page), 'raid controls under 44px').toEqual([])
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.nodes[0]?.target.join(' ')}`), 'raid: axe').toEqual([])
})
