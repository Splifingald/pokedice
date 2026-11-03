// The side quests (docs/61), played in the game with their switches on: a Poké Ball that springs out as Voltorb, a
// Safari's round and its encounter, a gift handed over, a rival met on the road, a roadblock across Routes 12–15, and
// the kitchen sink's states. Each step leaves its picture in docs/61-side-quests/ (the doc shows them).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, instanceMaxHp, linearAreas, type SaveData } from '../src/engine'
import { readFileSync } from 'node:fs'
import { parseCsv } from '../src/i18n/csv'
import { LANGS, type Lang } from '../src/i18n/langs'
import { FAST, gameData, makeSave, mockSupabase } from './helpers'

const SHOTS = 'docs/61-side-quests'
const data = gameData()
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` })
/** Motion on (the reveal and the giver's walk are part of what's shown), sound off. */
const SETTINGS = JSON.stringify({ sfx: false, sound: false })

const ON = JSON.stringify({
  disguises: { access: 'all' },
  safari: { ...DEFAULT_CONFIG.safari, access: 'all' },
  rivals: { access: 'all' },
  giftMoments: { access: 'all', eggHours: 6 },
})

const kanto = linearAreas(data, 'kanto').sort((a, b) => a.orderIndex - b.orderIndex)
const area = (name: string) => data.areas.find((a) => a.name === name && (a.regionId ?? 'kanto') === 'kanto')!

/**
 * A Kanto save standing in `name`, every area of the road before it cleared (before `upTo` for a secret area: the road
 * it opens from), with this progress there.
 */
function standingIn(
  name: string,
  progress: Partial<SaveData['areaProgress'][string]>,
  patch: Partial<SaveData> = {},
  upTo?: string,
) {
  const base = makeSave(1)
  const target = area(name)
  const stop = upTo ? area(upTo).orderIndex : target.hidden ? 1 : target.orderIndex
  const areaProgress: SaveData['areaProgress'] = {}
  for (const a of kanto) {
    if (a.id === target.id || a.orderIndex >= stop) break
    areaProgress[a.id] = { ...emptyProgress(), cleared: true, roundsDone: a.roundsToClear ?? 1 }
  }
  areaProgress[target.id] = { ...emptyProgress(), ...progress }
  // Raised to the area and healed: a hurt team entering an area meets a Pokémon Center first.
  const team = base.box.map((p) => {
    const raised = { ...p, level: Math.max(p.level, target.minLevel + 4) }
    return { ...raised, currentHp: instanceMaxHp(raised, data) }
  })
  return { ...base, box: team, currentAreaId: target.id, areaProgress, ...patch }
}

async function boot(page: Page, save: SaveData, config: Record<string, unknown> = {}, settings = SETTINGS) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), settings, JSON.stringify({ ...JSON.parse(ON), ...config })],
  )
}

const goOn = async (page: Page) => {
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
}

test.use({ viewport: { width: 1280, height: 860 } })

test('a Poké Ball in the Power Plant springs out as Voltorb', async ({ page }) => {
  const plant = area('Power Plant')
  const ball = plant.lootPool.find((l) => l.disguise?.dex === 100)!
  const save = standingIn(
    'Power Plant',
    { deck: ['item'], lootDeck: [ball.id] },
    { pokedex: Array.from({ length: 70 }, (_, i) => i + 1) },
  )
  await boot(page, save)
  await goOn(page)
  await expect(page.getByText('You found Poké Ball!').first()).toBeVisible()
  await page.waitForTimeout(1500)
  await shot(page, '3-disguise-find')
  await page.getByRole('button', { name: 'PICK IT UP' }).click()
  await expect(page.getByText("It wasn't an item at all: it's Voltorb!")).toBeVisible()
  await page.waitForTimeout(1600)
  await shot(page, '3-disguise-sprung')
  await page.getByRole('button', { name: /FIGHT/ }).click()
  await expect(page.getByRole('heading', { name: /Voltorb/ }).first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await shot(page, '3-disguise-fight')
})

test('the Safari: its round on CONTINUE, asked first, its card, its rules, Bait and a Safari Ball', async ({ page }) => {
  const save = standingIn('Safari Zone', { safariRounds: 1 }, { gold: 2000 }, 'Fuchsia City')
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByText('₽100 a round').first()).toBeVisible()
  await shot(page, '4-safari-home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  // The round is asked first: its price, the player's ₽, HOME beside PAY.
  await expect(page.getByRole('dialog').getByText('A new round costs ₽100')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('You have ₽2,000.')).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, '4-safari-ask')
  await page.getByRole('button', { name: 'Pay ₽100', exact: true }).click()
  // The round's first card may be a find: picked up until a Safari Pokémon comes.
  const approach = page.getByRole('button', { name: /Approach it/i })
  const pickUp = page.getByRole('button', { name: 'PICK IT UP' })
  for (let i = 0; i < 20 && !(await approach.isVisible()); i++) {
    if (await pickUp.isVisible()) await pickUp.click()
    else await page.waitForTimeout(300)
  }
  await expect(approach).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).gold)).toBe(1900)
  await page.waitForTimeout(600)
  await shot(page, '4-safari-card')
  await page.getByRole('button', { name: /Approach it/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(500)
  await shot(page, '4-safari-rules')
  await page.getByRole('button', { name: /Let's go/i }).click()
  await page.waitForTimeout(800)
  await shot(page, '4-safari-screen')
  await page.getByRole('button', { name: /Bait/ }).click()
  await page.waitForTimeout(3500)
  await shot(page, '4-safari-bait')
})

test('the Safari entered for the first time: its free round said so, HOME beside it', async ({ page }) => {
  const save = standingIn('Safari Zone', {}, { gold: 50 }, 'Fuchsia City')
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByText('Free round').first()).toBeVisible()
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  const ask = page.getByRole('dialog')
  await expect(ask.getByText('Your first round is free!')).toBeVisible()
  await expect(ask.getByText('After it, each round here costs ₽100.')).toBeVisible()
  await page.waitForTimeout(400)
  await shot(page, '4-safari-ask-free')
  // HOME: nothing begun, Home.
  await ask.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(ask).toHaveCount(0)
  await expect(page).toHaveURL(/\/home$/)
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await page.getByRole('button', { name: "Let's go!", exact: true }).click()
  // The round begun, free (its first card: a Safari Pokémon or a find).
  await expect(page).toHaveURL(/\/area$/)
  await expect(page.getByText('Your first round is free!')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).areaProgress))
    .toMatchObject({ [area('Safari Zone').id]: { safariRounds: 1 } })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).gold)).toBe(50)
})

test("the Safari's last card over: HOME on its card, the next round asked, nothing paid by itself", async ({
  page,
}) => {
  // A player's report (2026-11-03): no way out of the Safari, and round after round paid by itself.
  const save = standingIn(
    'Safari Zone',
    { safariRounds: 1, deck: ['wild'] },
    { gold: 2000, safari: { rulesSeen: true } },
    'Fuchsia City',
  )
  await boot(page, save)
  await goOn(page)
  await page.getByRole('button', { name: /Approach it/i }).click()
  // Bait until it runs off (or it's caught): the result card.
  const home = page.getByRole('button', { name: 'Home', exact: true })
  const bait = page.getByRole('button', { name: /Bait/ })
  for (let i = 0; i < 60 && !(await home.isVisible()); i++) {
    if (await bait.isEnabled()) await bait.click()
    else await page.waitForTimeout(400)
  }
  await expect(home).toBeVisible()
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  // The round's last card: the next one is asked at once, nothing paid.
  const ask = page.getByRole('dialog')
  await expect(ask.getByText('A new round costs ₽100')).toBeVisible()
  await expect(page.getByRole('button', { name: /Approach it/i })).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).gold)).toBe(2000)
  // Closed (Esc): the area's page, its CONTINUE carrying the price; HOME there goes Home.
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'CONTINUE · ₽100 a round', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
})

/** The strings sheet as the game reads it (a blank cell is English), for buttons named in each language. */
const SHEET = (() => {
  const rows = parseCsv(readFileSync('src/i18n/strings.csv', 'utf8'))
  const head = rows[0]!.map((h) => h.trim())
  return (lang: Lang, key: string, vars: Record<string, string | number> = {}) => {
    const row = rows.find((r) => r[0]?.trim() === key)!
    const text = row[head.indexOf(lang)] || row[head.indexOf('en')]!
    return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))
  }
})()

/** Nothing cut off: none of these buttons, nor a one-line label in them, wider than its box; no sideways scroll. */
async function nothingCut(page: Page, buttons: Locator) {
  const cut = await buttons.evaluateAll((els) =>
    els.flatMap((b) =>
      [b, ...Array.from(b.querySelectorAll<HTMLElement>('.truncate'))].filter((el) => el.scrollWidth > el.clientWidth + 1),
    ).map((el) => el.textContent ?? ''),
  )
  expect(cut).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

test.describe('the Safari on a 360 × 640 phone', () => {
  test.use({ viewport: { width: 360, height: 640 } })
  for (const lang of LANGS) {
    const tr = (key: string, vars?: Record<string, string | number>) => SHEET(lang, key, vars)
    const settings = JSON.stringify({ ...JSON.parse(FAST), lang })

    test(`${lang}: the free round's pop-up on entering`, async ({ page }) => {
      await boot(page, standingIn('Safari Zone', {}, { gold: 50 }, 'Fuchsia City'), {}, settings)
      await page.goto('/home')
      await page.getByRole('button', { name: tr('ui.common.continue'), exact: true }).first().click()
      const ask = page.getByRole('dialog')
      await expect(ask.getByText(tr('ui.safari.ask.freeTitle'))).toBeVisible()
      await expect(ask.getByText(tr('ui.safari.ask.freeText', { price: 100 }))).toBeVisible()
      await nothingCut(page, ask.getByRole('button'))
      await page.screenshot({ path: `${process.env.SHOTS_DIR ?? 'test-results'}/safari-phone-${lang}-ask-free.png` })
      await ask.getByRole('button', { name: tr('ui.safari.ask.start'), exact: true }).click()
      // The round begun (its first card: a Safari Pokémon or a find).
      await expect(page).toHaveURL(/\/area$/)
      await expect(ask.getByText(tr('ui.safari.ask.freeTitle'))).toHaveCount(0)
    })

    test(`${lang}: HOME and CONTINUE on its card, the paid round's pop-up, the price on the area's CONTINUE`, async ({
      page,
    }) => {
      const save = standingIn(
        'Safari Zone',
        { safariRounds: 1, deck: ['wild'] },
        { gold: 2000, safari: { rulesSeen: true } },
        'Fuchsia City',
      )
      await boot(page, save, {}, settings)
      await page.goto('/home')
      await page.getByRole('button', { name: tr('ui.common.continue'), exact: true }).first().click()
      await page.getByRole('button', { name: tr('ui.safari.start') }).click()
      const home = page.getByRole('dialog').getByRole('button', { name: tr('ui.nav.home'), exact: true })
      const bait = page.getByRole('button', { name: tr('ui.safari.treat') })
      for (let i = 0; i < 60 && !(await home.isVisible()); i++) {
        if (await bait.isEnabled()) await bait.click()
        else await page.waitForTimeout(300)
      }
      await expect(home).toBeVisible()
      await nothingCut(page, page.getByRole('dialog').getByRole('button'))
      await page.screenshot({ path: `${process.env.SHOTS_DIR ?? 'test-results'}/safari-phone-${lang}-card.png` })
      await page.getByRole('dialog').getByRole('button', { name: tr('ui.common.continue'), exact: true }).click()
      // The next round asked: its price, HOME beside PAY.
      const ask = page.getByRole('dialog')
      const payNow = ask.getByRole('button', { name: tr('ui.safari.ask.pay', { price: 100 }), exact: true })
      await expect(payNow).toBeVisible()
      await expect(ask.getByText(tr('ui.safari.ask.paidTitle', { price: 100 }))).toBeVisible()
      await nothingCut(page, ask.getByRole('button'))
      await page.screenshot({ path: `${process.env.SHOTS_DIR ?? 'test-results'}/safari-phone-${lang}-ask-paid.png` })
      await page.keyboard.press('Escape')
      await expect(ask).toHaveCount(0)
      const price = tr('ui.safari.price', { price: 100 })
      const pay = page.getByRole('button', { name: `${tr('ui.common.continue')} · ${price}`, exact: true })
      await expect(pay).toBeVisible()
      await expect(pay).toContainText(price)
      await nothingCut(page, page.getByRole('button', { name: tr('ui.nav.home'), exact: true }).or(pay))
      await page.screenshot({ path: `${process.env.SHOTS_DIR ?? 'test-results'}/safari-phone-${lang}-area.png` })
    })
  }
})

test('a gift: the giver walks in, TAKE IT, the Pokémon is yours', async ({ page }) => {
  const save = standingIn('Routes 7 & 8', { drawn: ['center', 'wild', 'wild'] })
  await boot(page, save)
  await goOn(page)
  await expect(page.getByText(/take good care of this Eevee/)).toBeVisible()
  await page.waitForTimeout(1200)
  await shot(page, '5-gift-offer')
  await page.getByRole('button', { name: 'TAKE IT' }).click()
  await expect(page.getByText('You received Eevee!')).toBeVisible()
  await page.waitForTimeout(1800)
  await shot(page, '5-gift-received')
})

test('a gift to pick: Hitmonlee or Hitmonchan', async ({ page }) => {
  const save = standingIn('Silph Co.', { drawn: ['center'] })
  await boot(page, save)
  await goOn(page)
  await expect(page.getByText(/Pick the one you like/)).toBeVisible()
  await page.getByRole('button', { name: /Hitmonchan/ }).click()
  await page.waitForTimeout(900)
  await shot(page, '5-gift-choice')
})

test('the Magikarp salesman', async ({ page }) => {
  const save = standingIn('Mt. Moon', { drawn: ['center'] }, { gold: 800 })
  await boot(page, save)
  await goOn(page)
  await expect(page.getByText(/How about this Magikarp/)).toBeVisible()
  await page.waitForTimeout(1000)
  await shot(page, '5-gift-sale')
})

test('a rival on the road: Blue at Nugget Bridge, his line as the fight opens', async ({ page }) => {
  const save = standingIn('Route 4 & Nugget Bridge', { drawn: ['center', 'wild'] })
  await boot(page, save)
  await goOn(page)
  await expect(page.getByText(/Let’s see how strong you’ve got/).first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(800)
  await shot(page, '5-rival-battle')
})

test('a rival lost to, its switch on: the team healed, Blue moves on, the round goes on', async ({ page }) => {
  const bridge = area('Route 4 & Nugget Bridge')
  const base = standingIn('Route 4 & Nugget Bridge', { drawn: ['center', 'wild'] })
  // Two in the team: the switch's cards, and the forfeit flag beside them.
  const second = { ...base.box[0]!, id: 'e2e-second', dex: 4 }
  await boot(page, { ...base, box: [...base.box, second], team: [...base.team, second.id] }, { rivalLossHeal: { access: 'all' } })
  await goOn(page)
  await page.getByRole('button', { name: /^Send out / }).click({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeEnabled({ timeout: 20_000 })
  // A tap on the other pip opens the switch's cards, the forfeit flag beside them.
  await page.getByRole('region', { name: 'Switch Pokémon' }).getByRole('button', { name: /^Charmander, .*Switch in$/ }).click()
  await page.getByRole('button', { name: /^forfeit$/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/moves on, and the round goes on/)).toBeVisible()
  await dialog.getByRole('button', { name: /forfeit/i }).click()
  await expect(page.getByText(/moves on\. No ₽ this time, but your team is healed and the round goes on/)).toBeVisible()
  await expect(page.getByText('Your team fainted…')).toHaveCount(0)
  await page.waitForTimeout(600)
  await shot(page, '5-rival-lost')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
  expect(saved.moments?.done).toContain('rival-kanto-cerulean')
  expect(saved.areaProgress[bridge.id]!.drawn).toEqual(['center', 'wild'])
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await expect(page.getByText(/moves on\. No ₽/)).toHaveCount(0)
})

test('a roadblock: Snorlax across Routes 12–15', async ({ page }) => {
  const routes = area('Routes 12–15')
  const save = standingIn('Routes 12–15', { roundsDone: routes.roundsToClear ?? 1 })
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByText('A Pokémon blocks the way').first()).toBeVisible()
  await shot(page, '2-roadblock-home')
  await page.getByRole('button', { name: /FACE IT/ }).first().click()
  await page.waitForTimeout(2500)
  await shot(page, '2-roadblock-fight')
})

test('the kitchen sink: every state of the side quests', async ({ page }) => {
  await boot(page, makeSave(1))
  await page.goto('/kitchen-sink')
  const heading = page.getByRole('heading', { name: /The side quests \(docs\/61\)/ })
  await heading.scrollIntoViewIfNeeded()
  await page.waitForTimeout(3000)
  // The section's panel, from its heading down to the next section's.
  const top = await heading.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 12)
  const next = page.getByRole('heading', { name: /^Trick or Treat: the gauge/ })
  const bottom = await next.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 24)
  const width = await page.evaluate(() => document.documentElement.clientWidth)
  await page.screenshot({ path: `${SHOTS}/0-kitchen-sink.png`, fullPage: true, clip: { x: 0, y: top, width, height: bottom - top } })
})
