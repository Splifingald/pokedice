// The side quests (docs/61), played in the game with their switches on: a Poké Ball that springs out as Voltorb, a
// Safari's round and its encounter, a gift handed over, a rival met on the road, a roadblock across Routes 12–15, and
// the kitchen sink's states. Each step leaves its picture in docs/61-side-quests/ (the doc shows them).
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, instanceMaxHp, linearAreas, type SaveData } from '../src/engine'
import { gameData, makeSave, mockSupabase } from './helpers'

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

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), SETTINGS, ON],
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

test('the Safari: its round on CONTINUE, its card, its rules, Bait and a Safari Ball', async ({ page }) => {
  const save = standingIn('Safari Zone', { safariRounds: 1 }, { gold: 2000 }, 'Fuchsia City')
  await boot(page, save)
  await page.goto('/home')
  await expect(page.getByText('₽100 a round').first()).toBeVisible()
  await shot(page, '4-safari-home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  await expect(page.getByRole('button', { name: /Approach it/i })).toBeVisible()
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
