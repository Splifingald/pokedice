// The Day Care, one for every region: the gold widget opening straight into the hatching, Egg now for ₽, a Pokémon
// left to train and taken back, and friends' Pokémon (invited, refreshed, sent back; the slots' waiting states).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import {
  FAST,
  fakeSession,
  gameData,
  makeSave,
  mockSupabase,
  nonJerseyText,
  smallControls,
  STORAGE_KEY,
  SUPABASE,
  type SupabaseMock,
} from './helpers'

const open = (patch: Partial<SaveData> = {}) =>
  makeSave(4, {
    gold: 500,
    // Twenty species caught open the Day Care.
    pokedex: Array.from({ length: 20 }, (_, i) => i + 1),
    ...patch,
  })

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(save), FAST],
  )
}

test('the gold widget opens the Day Care straight into the hatching of the gift Egg', async ({ page }) => {
  await boot(page, open({ dayCare: { residents: [], guests: [], eggClaimed: false, visited: true } }))
  await page.goto('/home')

  await page.getByRole('button', { name: 'Day Care: an Egg is waiting. Open the Day Care and hatch it.' }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await expect(moment.getByText('Oh? The Egg is moving!').first()).toBeVisible()
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await expect(moment.getByText(/hatched from the Egg!/).first()).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(moment).toHaveCount(0)
  // No Egg waits any more, and nothing is sold. Nobody here can pair: no clock runs, the bar says it's on hold.
  await expect(page.getByText('Next Egg check')).toBeVisible()
  await expect(page.getByText('On hold')).toBeVisible()
  await expect(page.getByText('No pair can make an Egg yet').first()).toBeVisible()
  // The Egg checks are folded at the panel's foot (docs/43 §5.7): the clocks show once opened.
  await expect(page.getByText('every 12 h · waiting for a pair')).toBeHidden()
  await page.getByText('Egg checks', { exact: true }).click()
  await expect(page.getByText('every 12 h · waiting for a pair')).toBeVisible()
})

test('Egg now pays and hatches at once', async ({ page }) => {
  const data = gameData()
  // Eevee and Jolteon share the Field group: one pair.
  const residents = [133, 135].map((dex, i) => ({
    inst: createInstance(dex, 20, data, `dc-${i}`, 0),
    since: Date.now(),
    region: 'kanto',
  }))
  await boot(page, open({ dayCare: { residents, guests: [], eggClaimed: true, visited: true } }))
  await page.goto('/daycare')

  await expect(page.getByText('1 pair can leave one')).toBeVisible()
  await page.getByRole('button', { name: 'Skip the wait: an Egg now for ₽200' }).click()
  const moment = page.getByRole('dialog', { name: 'Egg hatching' })
  await moment.getByRole('button', { name: 'SKIP ▸▸' }).click()
  await expect(moment.getByText(/hatched from the Egg!/).first()).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  // ₽200 went (the Day Care couple may give some back when the hatchling isn't kept: the engine says how much).
  await expect(page.getByRole('banner').getByText(/₽\s?3\d\d/).first()).toBeVisible()
})

test('a Pokémon stays at the Day Care and comes back', async ({ page }) => {
  // A second Pokémon in the team: the last one can't be left.
  const save = open({ dayCare: { residents: [], guests: [], eggClaimed: true, visited: true } })
  const pidgey = createInstance(16, 8, gameData(), 'pidgey', 0)
  await boot(page, { ...save, box: [...save.box, pidgey], team: [...save.team, pidgey.id] })
  await page.goto('/home')

  // Home's widget opens the page; the yard's plate is its one title. Nobody here, so no Egg check is coming.
  await page.getByRole('button', { name: /^Day Care: one free slot\. one free slot\. Waiting for a pair/ }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Day Care' })).toBeVisible()
  await expect(page.getByText('Every region · 0 Pokémon here')).toBeVisible()

  // Leave Charmander: the sheet searches the team and the Box.
  await page
    .getByRole('button', { name: /Leave a Pokémon/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Leave which Pokémon?' })
  // Nothing here yet: nothing to be compatible with.
  await expect(sheet.getByRole('button', { name: 'Compatible only' })).toHaveCount(0)
  await sheet.getByLabel('Search your Pokémon').fill('charm')
  await sheet.getByRole('button', { name: /Charmander/ }).click()
  await expect(page.getByText('Charmander is staying at the Day Care.')).toBeVisible()

  // It trains in its slot; TAKE BACK says where it went.
  await page.getByRole('button', { name: 'Take back Charmander' }).click()
  await expect(page.getByText(/Charmander is back!/)).toBeVisible()
})

test('the leave picker lists every region’s Box by level, and Compatible only once someone is here', async ({ page }) => {
  const data = gameData()
  const base = open()
  // Kanto live: Charmander (Lv.5, the team) and Eevee 12 in the Box; Johto parked: Totodile 20 (its team), Sentret 30.
  const eevee = createInstance(133, 12, data, 'eevee', 0)
  const [totodile, sentret] = [createInstance(158, 20, data, 'toto', 0), createInstance(161, 30, data, 'sentret', 0)]
  const johto = {
    gold: 0,
    pokedex: [158, 161],
    box: [totodile, sentret],
    team: [totodile.id],
    inventory: {},
    comboLevels: base.comboLevels,
    dieLevels: base.dieLevels,
    currentAreaId: '',
    areaProgress: {},
  }
  // Jolteon is here: Eevee and Sentret share its Field group.
  const jolteon = { inst: createInstance(135, 25, data, 'jolt', 0), since: Date.now(), region: 'kanto' }
  const dayCare = { residents: [jolteon], guests: [], eggClaimed: true, visited: true }
  await boot(page, { ...base, box: [...base.box, eevee], parked: { johto }, dayCare })
  await page.goto('/daycare')

  await page
    .getByRole('button', { name: /Leave a Pokémon/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Leave which Pokémon?' })
  const names = sheet.getByRole('listitem').locator('b')
  // Every region's Box, lowest level first; each says its region.
  await expect(names).toHaveText([/^Charmander Lv\.5 · Kanto/, /^Eevee Lv\.12 · Kanto/, /^Totodile Lv\.20 · Johto/, /^Sentret Lv\.30 · Johto/])
  // Totodile is the last of Johto's team.
  await expect(sheet.getByRole('button', { name: /Totodile/ })).toBeDisabled()
  await sheet.getByRole('radio', { name: 'Highest Lv' }).click()
  await expect(names.first()).toHaveText(/^Sentret/)
  await sheet.getByRole('button', { name: 'Compatible only' }).click()
  await expect(names).toHaveText([/^Sentret/, /^Eevee/])

  // Sentret leaves Johto's Box, and goes back to it.
  await sheet.getByRole('button', { name: /Sentret/ }).click()
  await expect(page.getByText('Sentret is staying at the Day Care.')).toBeVisible()
  await page.getByRole('button', { name: 'Take back Sentret' }).click()
  await expect(page.getByText(/Sentret is back!.*Johto Box/)).toBeVisible()
})

for (const theme of ['light', 'dark'] as const)
  test(`every text keeps its contrast (${theme}): short of ₽, then an Egg waiting`, async ({ page }) => {
    const data = gameData()
    await page.setViewportSize({ width: 390, height: 844 })
    const base = open({ gold: 50 })
    const s: SaveData = {
      ...base,
      settings: { ...base.settings, theme },
      dayCare: {
        residents: [133, 132].map((dex, i) => ({
          inst: createInstance(dex, 20, data, `dc-${i}`, 0),
          since: Date.now(),
          region: 'kanto',
        })),
        guests: [{ owner: 'u-lea', ownerName: 'Lea', ownerAvatar: 'red', inst: 'g-1', dex: 135, level: 30, addedAt: 0 }],
        eggClaimed: true,
        visited: true,
      },
    }
    await boot(page, s)
    await page.goto('/daycare')
    await expect(page.getByText('3 pairs can leave one')).toBeVisible()
    const contrast = async () =>
      (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`),
      )
    expect(await contrast()).toEqual([])
    // Short of ₽ it stays focusable (aria-disabled) and says what's missing.
    await page.getByRole('button', { name: /an Egg now/ }).click({ force: true })
    await expect(page.getByText('Need ₽150 more')).toBeVisible()

    await boot(page, { ...s, dayCare: { ...s.dayCare!, egg: { at: 0, parents: [{ dex: 133 }, { dex: 135, owner: 'Lea' }] } } })
    await page.goto('/daycare')
    await expect(page.getByText('Eevee and Jolteon (Lea) left it.', { exact: false })).toBeVisible()
    expect(await contrast()).toEqual([])
  })

// ---------------------------------------------------------------- friends' Pokémon (phase 4, migration 0034)

const MISTY = '22222222-0000-4000-8000-000000000002'

async function bootSignedIn(page: Page, save: SaveData, mock: SupabaseMock = {}) {
  await mockSupabase(page, { ...mock, rpc: { friend_status: [{ ids: [MISTY], unseen: [] }], ...mock.rpc } })
  await page.addInitScript(
    ([key, session, s, f]) => {
      localStorage.setItem(key!, session!)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), FAST],
  )
}

const withEevee = () =>
  open({
    dayCare: {
      residents: [{ inst: createInstance(133, 20, gameData(), 'dc-eevee', 0), since: Date.now(), region: 'kanto' }],
      guests: [],
      eggClaimed: true,
      visited: true,
    },
  })

test("friends' Pokémon: invite a friend's Ditto, it pairs with yours, then goes back", async ({ page }) => {
  const now = Date.now()
  await bootSignedIn(page, withEevee(), {
    rpc: {
      friend_day_cares: [
        {
          owner: MISTY,
          name: 'Misty',
          avatar: 'green',
          day_care: [
            { inst: 'm-ditto', dex: 132, level: 30, xp: 0, since: now, shiny: false },
            { inst: 'm-goldeen', dex: 118, level: 20, xp: 0, since: now, shiny: false },
          ],
        },
      ],
    },
  })
  await page.goto('/daycare')
  await page.getByRole('button', { name: /Add from a friend/ }).first().click()
  const sheet = page.getByRole('dialog', { name: "Add a friend's Pokémon" })
  await expect(sheet.getByRole('button', { name: /Ditto/ })).toContainText('Compatible with all but legendaries · 24 h')
  await expect(sheet.getByRole('button', { name: /Goldeen/ })).toContainText('No match with yours')
  // Compatible only: Goldeen (Water 2) can't make an Egg with Eevee (Field).
  await sheet.getByRole('button', { name: 'Compatible only' }).click()
  await expect(sheet.getByRole('button', { name: /Goldeen/ })).toHaveCount(0)
  expect(await new AxeBuilder({ page }).include('[role=dialog]').withRules(['color-contrast']).analyze().then((r) => r.violations)).toEqual([])
  await sheet.getByRole('button', { name: /Ditto/ }).click()
  await expect(page.getByText("Ditto is visiting from Misty's Day Care · pairs with Eevee")).toBeVisible()

  // Its line says whose it is; the checks (folded, opened here) find the pair, on Ditto's slower clock.
  await expect(page.getByText("Misty's").first()).toBeVisible()
  await page.getByText('Egg checks', { exact: true }).click()
  await expect(page.getByText('Ditto · every 24 h')).toBeVisible()
  // Send back: one tap on its line's button.
  await page.getByRole('button', { name: "Send Ditto back to Misty's Day Care" }).click()
  await expect(page.getByText("Ditto went back to Misty's Day Care")).toBeVisible()
  await expect(page.getByText('Ditto · every 24 h')).toHaveCount(0)
})

test('a friend who took their Pokémon back: it goes home at the next refresh', async ({ page }) => {
  const s = withEevee()
  const guest = { owner: MISTY, ownerName: 'Misty', ownerAvatar: 'green', inst: 'm-ditto', dex: 132, level: 30, addedAt: 0 }
  await bootSignedIn(page, { ...s, dayCare: { ...s.dayCare!, guests: [guest] } }, { rpc: { friend_day_cares: [] } })
  await page.goto('/daycare')
  await expect(page.getByText('Ditto went home to Misty')).toBeVisible()
  await expect(page.getByRole('button', { name: /Send Ditto back/ })).toHaveCount(0)
})

test("a database without 0034: the friend slots say it isn't set up", async ({ page }) => {
  await bootSignedIn(page, withEevee())
  await page.route(`${SUPABASE}/rest/v1/rpc/friend_day_cares`, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.friend_day_cares' }),
    }),
  )
  await page.goto('/daycare')
  const slots = page.getByRole('button', { name: /Add from a friend/ })
  await expect(slots.first()).toContainText("Friends' Day Cares aren't set up on this server yet")
  for (const b of await slots.all()) await expect(b).toBeDisabled()
})

test('signed out, the friend slots are the friend list’s connect prompt', async ({ page }) => {
  await boot(page, withEevee())
  await page.goto('/daycare')
  await expect(page.getByText('Friends are kept with your account. Connect to add friends.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Add from a friend/ })).toHaveCount(0)
})

// ---------------------------------------------------------------- the rules, where they apply (docs/43 §7)

test('the first visit: the rules are a card at the top of the panel until GOT IT, then live behind INFO', async ({
  page,
}) => {
  // Twenty species and never been in.
  await boot(page, open())
  await page.goto('/daycare')
  const card = page.getByRole('region', { name: 'How Day Care works' })
  await expect(card).toBeVisible()
  for (const rule of ['Training', 'Eggs', "Friends' Pokémon", 'Egg now']) await expect(card.getByText(rule, { exact: true })).toBeVisible()
  // Opening the page doesn't count as reading them; the push question waits while they're up (one thing at a time).
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').dayCare?.visited)).toBeFalsy()
  await card.getByRole('button', { name: 'GOT IT' }).click()
  await expect(card).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').dayCare?.visited))
    .toBe(true)

  // The same rules from the small INFO at the panel's foot.
  await page.getByRole('button', { name: 'Info: how Day Care works' }).click()
  const info = page.getByRole('dialog', { name: 'Day Care' })
  await expect(info.getByText('Training', { exact: true })).toBeVisible()
  await expect(info.getByText('Now open')).toHaveCount(0)
  await info.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(info).toHaveCount(0)
})

test('a visit before: no rules card', async ({ page }) => {
  await boot(page, withEevee())
  await page.goto('/daycare')
  await expect(page.getByRole('heading', { level: 1, name: 'Day Care' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'How Day Care works' })).toHaveCount(0)
})

test('a phone: the yard, the Egg-now bar and your two fit the screen; nothing sideways; 44 px; Jersey', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, withEevee())
  await page.goto('/daycare')
  const take = page.getByRole('button', { name: 'Take back Eevee' })
  await expect(take).toBeVisible()
  // The primary task fits without scrolling: your slots' buttons above the tab bar.
  const box = await take.boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 - 64)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await smallControls(page)).toEqual([])
  expect(await nonJerseyText(page)).toEqual([])
})
