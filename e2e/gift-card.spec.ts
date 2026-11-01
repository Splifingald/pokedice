// The Gift card (docs/64 §4.0, §4.2; docs/15 §45), on Route 1 served as content with a Gift card in its deck (as
// e2e/portal.spec.ts serves its world): a present on top of the deck, the rules once, the screen laid out as the battle
// (full screen: the stage with the present and its plate, the message, the level gauge, OPEN with what it gives,
// MAKE IT BIGGER with the next tap's break chance); taps that hold up to the top, then OPEN (the reward in the bag, the
// result card, back on the trail); a tap that breaks it (a wild Pokémon of the area, FIGHT!, its battle); Delibird in
// the Box (the chip, a level 1 that can't break, level 6 on top); a boss out of a present (only MAKE IT BIGGER, it
// bursts on its last tap, FIGHT! the boss); switched off, the item card as before; a 360 × 640 phone keeps everything on
// screen with nothing serious for axe; the kitchen sink shows every piece with no error. The break chances are set to
// 0 % or 100 % so each test knows which way a tap goes.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_CONFIG,
  emptyProgress,
  type Area,
  type BundleRaw,
  type GiftCardConfig,
  type SaveData,
} from '../src/engine'
import { EVENTS_ON, FAST, makeSave, mockSupabase, STORAGE_KEY, SUPABASE } from './helpers'

const VERSION = 990_612
const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'))
const FILES = {
  pokemon: 'pokemon.json',
  typeChart: 'type-chart.json',
  diceTypes: 'dice-types.json',
  areas: 'areas.json',
  trainers: 'trainers.json',
  upgrades: 'upgrades.json',
  items: 'items.json',
  config: 'config.json',
  regions: 'regions.json',
  eggGroups: 'egg-groups.json',
}

const save0 = makeSave(4)
const AREA = save0.currentAreaId
const route1 = (load('areas.json') as Area[]).find((a) => a.id === AREA)!
const WILD = new Set(route1.wildPool.map((w) => w.dex))
/** The taps: 0 % never breaks, 100 % always does. */
const NEVER = [0, 0, 0, 0]
const ALWAYS = [100, 100, 100, 100]

/** The game's content with a Gift card in Route 1's deck (and, for `boss`, Delibird out of a present there). */
function bundle(gift: Partial<GiftCardConfig>, opts: { boss?: boolean } = {}): BundleRaw {
  const b = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)])) as unknown as BundleRaw
  return {
    ...b,
    areas: b.areas.map((a) =>
      a.id === AREA
        ? {
            ...a,
            encounterWeights: { ...a.encounterWeights, gift: 1 },
            ...(opts.boss && { legendaryBoss: [{ dex: 225, level: 5, shiny: true, present: true }] }),
          }
        : a,
    ),
    config: {
      ...b.config,
      ...EVENTS_ON,
      configVersion: VERSION,
      giftCard: { ...DEFAULT_CONFIG.giftCard, access: 'all', ...gift },
    },
  }
}

/** The save with a Gift card on top of Route 1's deck. */
const withCard = (s: SaveData = save0): SaveData => ({
  ...s,
  areaProgress: { ...s.areaProgress, [AREA]: { ...emptyProgress(), deck: ['wild', 'gift'] } },
})
const seen = (s: SaveData): SaveData => ({ ...s, giftCard: { rulesSeen: true } })

async function boot(page: Page, save: SaveData, content: BundleRaw, settings = FAST) {
  await mockSupabase(page)
  await page.route(`${SUPABASE}/rest/v1/game_config*`, async (route) => {
    if (!route.request().url().includes('configVersion')) return route.fallback()
    const object = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    const body = object ? { value: VERSION } : [{ value: VERSION }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.addInitScript(
    ([s, f, b, v, key]) => {
      localStorage.removeItem(key!)
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      const req = indexedDB.open('pokedice', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('content')
      req.onsuccess = () => {
        req.result
          .transaction('content', 'readwrite')
          .objectStore('content')
          .put({ version: Number(v), build: 'e2e', bundle: JSON.parse(b!) }, 'remote')
      }
    },
    [JSON.stringify(save), settings, JSON.stringify(content), String(VERSION), STORAGE_KEY],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const bigger = (page: Page) => page.getByRole('button', { name: /^MAKE IT BIGGER/ })
const open = (page: Page) => page.getByRole('button', { name: /^OPEN: / })
const gauge = (page: Page) => page.getByRole('meter', { name: 'Gift level' })

/** Home's CONTINUE: the card on top of the deck is the gift, its present comes at once. */
async function toGift(page: Page) {
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(gauge(page)).toBeVisible({ timeout: 15_000 })
}

/** MAKE IT BIGGER, and wait for the step to have played (the gauge at `level`). */
async function grow(page: Page, level: number) {
  await expect(bigger(page)).toBeEnabled({ timeout: 10_000 })
  await bigger(page).click()
  await expect(gauge(page)).toHaveAttribute('aria-valuenow', String(level), { timeout: 10_000 })
}

test('a gift: the rules once, taps that hold up to the top, OPEN, the reward in the bag, back on the trail', async ({
  page,
}) => {
  await boot(page, withCard(), bundle({ breakChances: NEVER }))
  await toGift(page)

  // The rules, the first time a present appears.
  const rules = page.getByRole('dialog', { name: 'Gift', exact: true })
  await expect(rules).toBeVisible()
  await expect(rules.getByText('Make it bigger', { exact: true })).toBeVisible()
  await expect(rules.getByText('A broken gift', { exact: true })).toBeVisible()
  await rules.getByRole('button', { name: /let's go/i }).click()
  await expect(rules).toHaveCount(0)

  // Laid out as the battle: full screen (no tab bar), the present's plate on the stage, the level gauge, the odds.
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'A gift at level 1' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Gift, Lv.1/5' })).toBeVisible()
  await expect(gauge(page)).toHaveAttribute('aria-valuemax', '5')
  await expect(page.getByText('A gift! Open it now, or make it bigger?')).toBeVisible()
  // OPEN at level 1 gives the area's own ball (Route 1 finds Poké Balls), two of them.
  await expect(open(page)).toHaveAttribute('aria-label', 'OPEN: Poké Ball ×2')

  for (const level of [2, 3, 4, 5]) await grow(page, level)
  await expect(page.getByText("Level 5: it can't get any bigger!")).toBeVisible()
  // At the top: MAKE IT BIGGER is done, OPEN gives the Rare Candies.
  await expect(bigger(page)).toBeDisabled()
  await expect(page.getByText('As big as it gets!')).toBeVisible()
  await expect(open(page)).toHaveAttribute('aria-label', 'OPEN: Rare Candy ×3')
  const before = (await stored(page)).inventory['rare-candy'] ?? 0
  await open(page).click()

  const card = page.getByRole('dialog', { name: 'Gift opened!' })
  await expect(card).toBeVisible({ timeout: 10_000 })
  await expect(card.getByText('Rare Candy ×3')).toBeVisible()
  const saved = await stored(page)
  expect(saved.inventory['rare-candy']).toBe(before + 3)
  expect(saved.giftCard?.rulesSeen).toBe(true)
  await card.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeVisible()
})

test('a tap that breaks it: a wild Pokémon of the area jumps out, FIGHT! is its battle; INFO shows the rules', async ({
  page,
}) => {
  await boot(page, seen(withCard()), bundle({ breakChances: ALWAYS }))
  await toGift(page)
  await expect(page.getByRole('dialog', { name: 'Gift', exact: true })).toHaveCount(0)
  await expect(page.getByText('100% to break')).toBeVisible()

  await page.getByRole('button', { name: /Info/ }).last().click()
  const rules = page.getByRole('dialog', { name: 'Gift', exact: true })
  await expect(rules).toBeVisible()
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(rules).toHaveCount(0)

  await bigger(page).click()
  await expect(page.getByText(/A wild .+ jumped out of the gift!/)).toBeVisible({ timeout: 10_000 })
  const name = (await page.getByText(/A wild .+ jumped out of the gift!/).textContent())!.match(
    /A wild (.+) jumped/,
  )![1]
  await page.getByRole('button', { name: 'FIGHT!', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(`^Battle: .* against a wild ${name}`) }),
  ).toBeAttached({
    timeout: 15_000,
  })
  // One of Route 1's own wild Pokémon.
  const content = bundle({})
  const dexOf = Object.fromEntries(
    (content.pokemon as { dex: number; name: string }[]).map((p) => [p.name, p.dex]),
  )
  expect(WILD.has(dexOf[name!]!)).toBe(true)
})

test('Delibird in the Box: its chip, level 1 can’t break, and a level 6 on top', async ({ page }) => {
  const s = seen(withCard())
  const delibird = { ...s.box[0]!, id: 'e2e-delibird', dex: 225, level: 30 }
  await boot(page, { ...s, box: [...s.box, delibird] }, bundle({}))
  await toGift(page)
  await expect(gauge(page)).toHaveAttribute('aria-valuemax', '6')
  await expect(page.getByText('Delibird helps')).toBeVisible()
  await expect(page.getByText("Safe: it can't break")).toBeVisible()
  await grow(page, 2)
  await expect(page.getByText('20% to break')).toBeVisible()
})

test('a boss out of a present: only MAKE IT BIGGER, it bursts on its last tap, FIGHT! the boss', async ({
  page,
}) => {
  const s = seen(save0)
  const done = {
    ...emptyProgress(),
    roundsDone: route1.roundsToClear ?? 1,
    round: 1,
    roundCounted: true,
    deck: [],
  }
  await boot(page, { ...s, areaProgress: { ...s.areaProgress, [AREA]: done } }, bundle({}, { boss: true }))
  await page.goto('/home')
  await page
    .getByRole('button', { name: /FACE IT/ })
    .first()
    .click()
  await expect(page.getByText('A shining present sits under the tree…')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^OPEN/ })).toHaveCount(0)
  await expect(page.getByText('What could be inside?')).toBeVisible()
  for (const level of [2, 3, 4, 5]) await grow(page, level)
  await expect(page.getByText(/shaking hard/)).toBeVisible()
  await bigger(page).click()
  await expect(page.getByText('Delibird popped out of the present!')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'FIGHT!', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Battle: .*Delibird/ })).toBeAttached({
    timeout: 15_000,
  })
})

test('switched off, the item card as before and a gift left in a deck is never played', async ({ page }) => {
  await boot(page, seen(withCard()), bundle({ access: 'off' }))
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  // The gift is set aside: the wild Pokémon under it, straight into its fight.
  await expect(page.getByRole('heading', { level: 1, name: /^Battle: .* against a wild / })).toBeAttached({
    timeout: 15_000,
  })
  await expect(gauge(page)).toHaveCount(0)
})

test('a 360 × 640 phone: the stage, the gauge and both buttons fit, nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, seen(withCard()), bundle({ breakChances: NEVER }))
  await toGift(page)
  for (const el of [
    open(page),
    bigger(page),
    gauge(page),
    page.getByRole('button', { name: /Info/ }).last(),
  ]) {
    const box = await el.boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(640)
  }
  for (const el of [open(page), bigger(page)])
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // The stage on top, as wide as the screen, as the battle's.
  const stage = await page.getByRole('img', { name: /A gift at level/ }).boundingBox()
  expect(stage!.y).toBeLessThan(4)
  expect(stage!.width).toBeGreaterThanOrEqual(355)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([])
  // The result card fits too.
  await open(page).click()
  const next = page
    .getByRole('dialog', { name: 'Gift opened!' })
    .getByRole('button', { name: 'CONTINUE', exact: true })
  await expect(async () => {
    const box = await next.boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(640)
  }).toPass({ timeout: 8000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test('the kitchen sink shows every piece, with no error', async ({ page }) => {
  // The kitchen sink is the heaviest page: a cold dev server on a busy machine takes minutes to serve it.
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save0), FAST],
  )
  await page.goto('/kitchen-sink')
  await expect(page.getByText(/^The Gift card \(docs\/61/)).toBeVisible({ timeout: 180_000 })
  for (const state of [
    'It lands (level 1)',
    'With a Delibird: level 1 is safe, a level 6',
    'At the top (level 5): OPEN only',
    'Broken: FIGHT!',
    "Delibird's present (Evergreen Hill)",
    'Shiny Delibird out: FIGHT!',
  ])
    await expect(page.getByText(state, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'The opened result card' }).click()
  const card = page.getByRole('dialog', { name: 'Gift opened!' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button', { name: 'Gift card rules (first time)' }).click()
  await expect(page.getByRole('dialog', { name: 'Gift', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
