// Friend invite rewards (docs/15 §25), against the mocked Supabase: the gauge at the top of the Friends page and in Prof.
// Oak's invite, a reward opened with the gifts' own opening (into the save), the rules at the top of the Friends page
// until GOT IT (never elsewhere) and from INFO, the reward's
// pop-up between fights, an invite link counting for its owner, and the switch off.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { badgeCase, progressOf, type SaveData } from '../src/engine'
import {
  EVENTS_ON,
  FAST,
  fakeSession,
  gameData,
  makeSave,
  mockSupabase,
  STORAGE_KEY,
  type SupabaseMock,
} from './helpers'

const MISTY = '22222222-0000-4000-8000-000000000002'
const ERIKA = '22222222-0000-4000-8000-000000000004'
const DITTO = [{ kind: 'pokemon', dex: 132, level: 10, shiny: true, region: 'latest' }]

/** Signed in, the save on the device, and the invite rewards on for everyone (they ship off). */
async function boot(
  page: Page,
  save: ReturnType<typeof makeSave>,
  rpc: SupabaseMock['rpc'] = {},
  access: 'all' | 'off' = 'all',
) {
  const calls = await mockSupabase(page, {
    rpc: {
      friend_code: 'K7QM4XD9',
      friend_list: [],
      friend_status: [{ ids: [MISTY], unseen: [] }],
      friend_seen: null,
      ...rpc,
    },
  })
  await page.addInitScript(
    ([key, session, s, f, cfg]) => {
      localStorage.setItem(key!, session!)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', cfg!)
    },
    [
      STORAGE_KEY,
      JSON.stringify(fakeSession()),
      JSON.stringify(save),
      FAST,
      JSON.stringify({ ...EVENTS_ON, inviteRewards: { ...gameData().config.inviteRewards, access } }),
    ],
  )
  return calls
}

/** The save with its region's first `n` gym badges won. */
function withBadges(save: SaveData, n: number): SaveData {
  let out = save
  for (const b of badgeCase(save, gameData()).slice(0, n)) {
    const p = progressOf(out, b.areaId)
    out = {
      ...out,
      areaProgress: {
        ...out.areaProgress,
        [b.areaId]: { ...p, gymsDefeated: [...p.gymsDefeated, b.trainerId] },
      },
    }
  }
  return out
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}'))

test('the Friends page: the gauge on top, a reward opened like a gift, then INFO', async ({ page }) => {
  // Three invited friends have their first badge; the first tier is opened already.
  const status = { count: 3, pending: 1, claimed: [1], latest: { name: 'Misty', avatar: 'green' } }
  const claims: unknown[] = []
  const save = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  await boot(page, save, {
    invite_status: () => status,
    invite_rewards_claim: (body: unknown) => {
      claims.push(body)
      status.claimed = [1, 2, 3]
      return [
        { friends: 2, gifts: [{ kind: 'gold', amount: 1000, region: 'latest' }] },
        { friends: 3, gifts: DITTO },
      ]
    },
  })
  await page.goto('/friends')

  const card = page.getByRole('region', { name: /^Invite rewards/ })
  await expect(card).toBeVisible()
  await expect(card).toContainText('3/4')
  await expect(card).toContainText('2 rewards are ready to open!')
  await expect(card).toContainText('1 friend you invited is on the way to their first badge.')
  await expect(card.getByRole('meter', { name: 'Invite rewards' })).toHaveAttribute('aria-valuenow', '3')
  await expect(card.getByRole('listitem', { name: /^1 friend: Rare Candy\. Opened$/ })).toBeVisible()
  await expect(
    card.getByRole('listitem', { name: /^3 friends: Ditto Lv\.10 ✦ Shiny\. Ready to open$/ }),
  ).toBeVisible()
  // The card sits above the friend ID.
  const cardTop = (await card.boundingBox())!.y
  const idTop = (await page.getByTestId('friend-code').boundingBox())!.y
  expect(cardTop).toBeLessThan(idTop)
  // The first time on the page, the rules sit at its top (docs/43 §7: where they apply), not in a pop-up; GOT IT puts
  // them away for good.
  const first = page.getByRole('region', { name: 'How invite rewards works' })
  await expect(first).toContainText('Invite new players')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await first.boundingBox())!.y).toBeLessThan(cardTop)
  await first.getByRole('button', { name: 'GOT IT' }).click()
  await expect(first).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).invites?.rulesSeen).toBe(true)

  await card.getByRole('button', { name: 'Open it' }).click()
  const moment = page.getByRole('dialog', { name: 'An invite reward' })
  await expect(moment).toBeVisible()
  expect(claims).toHaveLength(1)
  await expect(moment).toContainText('A reward for inviting your friends!')
  await moment.getByRole('button', { name: /skip/i }).click()
  await expect(moment.getByText("Here's what was inside!")).toBeVisible()
  await expect(moment.getByText('Ditto')).toBeVisible()
  await expect(moment.getByText('₽1,000')).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(moment).toHaveCount(0)

  await expect.poll(async () => (await stored(page)).invites).toEqual({ done: [3, 2], rulesSeen: true })
  const s = await stored(page)
  expect(s.gold).toBe(save.gold + 1000)
  expect(s.box.find((m: { dex: number }) => m.dex === 132)).toMatchObject({ level: 10, shiny: true })
  await expect(card).toContainText('1 more friend for Master Ball')
  await expect(card.getByRole('button', { name: 'Open it' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Info: how invite rewards works' }).click()
  const rules = page.getByRole('dialog', { name: 'Invite rewards' })
  await expect(rules).toContainText('Invite new players')
  await expect(rules).toContainText('1 → Rare Candy · 2 → ₽1,000 · 3 → Ditto Lv.10 ✦ Shiny · 4 → Master Ball')
  await rules.getByRole('button', { name: 'OK' }).click()
})

test('between fights: never the rules (the Friends page has them), the reward’s pop-up, opened from Home', async ({
  page,
}) => {
  const status = { count: 1, pending: 0, claimed: [] as number[], latest: { name: 'Misty', avatar: 'green' } }
  await boot(page, makeSave(4), {
    invite_status: () => status,
    invite_rewards_claim: () => {
      status.claimed = [1]
      return [{ friends: 1, gifts: [{ kind: 'item', key: 'rare-candy', qty: 1, region: 'latest' }] }]
    },
  })
  await page.goto('/home')
  await expect(page.getByRole('dialog', { name: 'Invite rewards' })).toHaveCount(0)

  const ready = page.getByRole('dialog', { name: 'Invite reward!' })
  await expect(ready).toContainText('Misty won their first badge! Your invite gauge moved up.')
  await expect(ready.getByTestId('invite-gauge')).toBeVisible()
  await ready.getByRole('button', { name: 'Open the gift' }).click()
  const moment = page.getByRole('dialog', { name: 'An invite reward' })
  await moment.getByRole('button', { name: /skip/i }).click()
  await expect(moment.getByText('Rare Candy')).toBeVisible()
  await moment.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The save is written a moment later; the rules still wait for the Friends page.
  await expect.poll(async () => (await stored(page)).invites).toEqual({ done: [1] })
})

test('Later keeps the reward on the Friends page, with the Social tab’s dot', async ({ page }) => {
  const save = { ...makeSave(4), invites: { done: [], rulesSeen: true } }
  await boot(page, save, { invite_status: { count: 1, pending: 0, claimed: [], latest: null } })
  await page.goto('/home')
  const ready = page.getByRole('dialog', { name: 'Invite reward!' })
  await expect(ready).toContainText('A friend you invited won their first badge!')
  await ready.getByRole('button', { name: 'Later' }).click()
  await expect(ready).toHaveCount(0)
  // The Social tab's dot counts it, and opens on Friends, whose strip tab counts it too (docs/43 §3).
  await page.getByRole('link', { name: 'Social · 1 new' }).click()
  await expect(page).toHaveURL(/\/friends$/)
  await expect(page.getByRole('link', { name: 'Friends (1)' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: /^Invite rewards/ }).getByRole('button', { name: 'Open it' })).toBeVisible()
})

test('Prof. Oak’s invite is a note on the friends list, with the gauge; not on Home', async ({ page }) => {
  // Prof. Oak asks to invite a friend in a note at the top of Friends (the user's call, 2026-10-27), not a pop-up.
  const save = { ...withBadges(makeSave(4), 2), invites: { done: [], rulesSeen: true } }
  await boot(page, save, { invite_status: { count: 0, pending: 1, claimed: [], latest: null } })
  await page.goto('/home')
  await expect(page.getByRole('region', { name: 'Invite a friend' })).toHaveCount(0)
  await page.goto('/friends')
  const oak = page.getByRole('region', { name: 'Invite a friend' })
  await expect(oak).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(oak.getByTestId('invite-gauge')).toBeVisible()
  await expect(oak).toContainText('1 more friend for Rare Candy')
})

test('an invite link counts for its owner: the new friend hears the first badge matters', async ({
  page,
}) => {
  const recorded: Record<string, unknown>[] = []
  await boot(page, makeSave(4), {
    friend_add: [{ status: 'added', user_id: ERIKA, name: 'Erika', avatar: 'kanto/lass' }],
    invite_record: (body: Record<string, unknown>) => {
      recorded.push(body)
      return 'counted'
    },
    invite_status: { count: 0, pending: 0, claimed: [], latest: null },
  })
  await page.goto('/f/K7QM4XD9')
  const pop = page.getByRole('dialog', { name: 'New friend!' })
  await expect(pop).toContainText('You and Erika are now friends!')
  await expect(pop).toContainText('Win your first badge and Erika gets a reward for inviting you!')
  expect(recorded).toEqual([{ p_code: 'K7QM4XD9', p_badges: 0 }])
})

test('switched off: no gauge, no pop-up, nothing asked', async ({ page }) => {
  const calls = await boot(
    page,
    makeSave(4),
    { invite_status: { count: 1, pending: 0, claimed: [], latest: null } },
    'off',
  )
  await page.goto('/friends')
  await expect(page.getByTestId('friend-code')).toBeVisible()
  await expect(page.getByRole('region', { name: /^Invite rewards/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Info: how invite rewards works' })).toHaveCount(0)
  expect(calls.filter((c) => c.includes('invite_'))).toEqual([])
})

for (const theme of ['light', 'dark'] as const) {
  test(`the gauge fits a 360×640 phone and keeps its contrast (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    const base = makeSave(4)
    const save = {
      ...base,
      settings: { ...base.settings, ...JSON.parse(FAST), theme },
      invites: { done: [1], rulesSeen: true },
    }
    await boot(page, save, { invite_status: { count: 3, pending: 2, claimed: [1], latest: null } })
    await page.goto('/friends')
    await expect(page.getByRole('region', { name: /^Invite rewards/ })).toContainText(
      '2 rewards are ready to open!',
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
    await page.waitForTimeout(300)
    const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(axe.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([])
  })
}
