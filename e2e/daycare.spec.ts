// The Day Care, one for every region: the gold widget opening straight into the hatching, Egg now for ₽, a Pokémon
// left to train and taken back, and friends' Pokémon (invited, refreshed, sent back; the slots' waiting states).
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createInstance, type SaveData } from '../src/engine'
import { FAST, fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY, SUPABASE, type SupabaseMock } from './helpers'

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
  // No Egg waits any more, and nothing is sold: the bar counts down to the next check.
  await expect(page.getByText('Next Egg check')).toBeVisible()
  await expect(page.getByText('No pair can make an Egg yet').first()).toBeVisible()
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
  // ₽200 went (₽10 more may have come back from the Day Care couple).
  await expect(page.getByRole('banner').getByText(/₽\s?3[01]0/).first()).toBeVisible()
})

test('a Pokémon stays at the Day Care and comes back', async ({ page }) => {
  // A second Pokémon in the team: the last one can't be left.
  const save = open({ dayCare: { residents: [], guests: [], eggClaimed: true, visited: true } })
  const pidgey = createInstance(16, 8, gameData(), 'pidgey', 0)
  await boot(page, { ...save, box: [...save.box, pidgey], team: [...save.team, pidgey.id] })
  await page.goto('/home')

  // Home's widget opens the page; the yard's plate is its one title.
  await page.getByRole('button', { name: /^Day Care: one free slot\. one free slot\. Egg check in/ }).click()
  await expect(page).toHaveURL(/\/daycare$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Day Care' })).toBeVisible()
  await expect(page.getByText('Every region · 0 Pokémon here')).toBeVisible()

  // Leave Charmander: the sheet searches the team and the Box.
  await page
    .getByRole('button', { name: /Leave a Pokémon/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Leave which Pokémon?' })
  await sheet.getByLabel('Search your Pokémon').fill('charm')
  await sheet.getByRole('button', { name: /Charmander/ }).click()
  await expect(page.getByText('Charmander is staying at the Day Care.')).toBeVisible()

  // It trains in its slot; TAKE BACK says where it went.
  await page.getByRole('button', { name: 'Take back Charmander' }).click()
  await expect(page.getByText(/Charmander is back!/)).toBeVisible()
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

  // Its card says whose it is; the checks find the pair, on Ditto's slower clock.
  await expect(page.getByText("Misty's").first()).toBeVisible()
  await expect(page.getByText('Ditto · every 24 h')).toBeVisible()
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
