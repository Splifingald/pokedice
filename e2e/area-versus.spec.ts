// Real-player battles in areas (docs/53), against a fake server: the card turned over at the round's end (its intro,
// its rules the first time, who, when, their team, the ₽), the fight won and the friend request sent; SKIP; a loss
// that costs only the ₽; and the Friends page's requests answered.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, instanceMaxHp, linearAreas, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

const SHOTS = process.env.E2E_SHOTS
const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })
const MISTY = '00000000-0000-4000-8000-000000000002'
const data = gameData()
const chain = linearAreas(data, 'kanto')
const ROUTE3 = chain.find((a) => a.name === 'Route 3')!

const FOE = (level: number) => ({
  id: MISTY,
  name: 'Misty',
  avatar: 'kanto/lass',
  rich: false,
  friend: false,
  playedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  team: [
    { dex: 120, level, shiny: false, talent: false },
    { dex: 118, level, shiny: true, talent: false },
  ],
  levels: { combo: {}, dice: {} },
})

/** Standing in Route 3, everything before it cleared, the round's last card a real player's; the team at `level`. */
function inRoute3(level: number, patch: Partial<SaveData> = {}): SaveData {
  const base = makeSave(4)
  // A Charizard: no evolution scene in the middle of the fight.
  const box = base.box.map((p) => ({
    ...p,
    dex: 6,
    level,
    currentHp: instanceMaxHp({ ...p, dex: 6, level }, data),
  }))
  const before = chain.slice(0, chain.indexOf(ROUTE3))
  return {
    ...base,
    box,
    currentAreaId: ROUTE3.id,
    areaProgress: {
      ...base.areaProgress,
      ...Object.fromEntries(before.map((a) => [a.id, { ...emptyProgress(), cleared: true, roundsDone: 9 }])),
      [ROUTE3.id]: { ...emptyProgress(), deck: ['versus'], drawn: ['center', 'wild', 'wild'] },
    },
    ...patch,
  }
}

async function boot(page: Page, save: SaveData, rpc: Record<string, unknown>, settings = FAST) {
  await mockSupabase(page, {
    rpc: { friend_status: [{ ids: [], unseen: [] }], friend_requests: [], ...rpc } as never,
  })
  await page.addInitScript(
    ([key, session, s, f, cfg]) => {
      localStorage.setItem(key!, session!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', cfg!)
    },
    [
      STORAGE_KEY,
      JSON.stringify(fakeSession()),
      JSON.stringify(save),
      settings,
      JSON.stringify({ ...EVENTS_ON, areaVersus: { ...DEFAULT_CONFIG.areaVersus, access: 'all' } }),
    ],
  )
}

/** Home's CONTINUE turns over the round's last card: the real player's. */
async function toCard(page: Page) {
  await page.goto('/home')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).first().click()
  return page.getByRole('dialog', { name: 'A real player!' })
}

/** Plays the fight on screen until its result shows (ATTACK, NEXT between their Pokémon). */
async function fight(page: Page, done: () => Promise<boolean>) {
  for (let i = 0; i < 400 && !(await done()); i++) {
    for (const name of ['ATTACK', /^Send out /, /^Next/i]) {
      const b = page.getByRole('button', { name, exact: typeof name === 'string' }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
}

test('the card: its intro, the rules the first time, their team; FIGHT, won, ×1.5 ₽, the friend request sent', async ({
  page,
}) => {
  const sent: Record<string, unknown>[] = []
  const met: Record<string, unknown>[] = []
  await boot(
    page,
    inRoute3(60),
    {
      area_versus_offer: FOE(8),
      area_versus_met: (b: Record<string, unknown>) => {
        met.push(b)
        return null
      },
      friend_request_send: (b: Record<string, unknown>) => {
        sent.push(b)
        return 'sent'
      },
    },
    MOTION_ON,
  )
  const card = await toCard(page)
  // The intro first: a real player's battle, said for screen readers too; a tap ends it.
  const intro = page.getByTestId('real-player-intro')
  await expect(intro).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/area-versus-intro.png` })
  await intro.click()
  // The first time, the rules (Later / Let's go!).
  const rules = page.getByRole('dialog', { name: 'Real-player battles' })
  await expect(rules).toBeVisible()
  await rules.getByRole('button', { name: "Let's go!" }).click()
  await expect(card.getByText('REAL PLAYER', { exact: true })).toBeVisible()
  await expect(card.getByText('Misty', { exact: true })).toBeVisible()
  await expect(card.getByText('Played here 2 days ago')).toBeVisible()
  await expect(card.getByRole('list', { name: 'Their team' }).getByRole('listitem')).toHaveCount(2)
  await expect(card.getByText(/^Win ₽/)).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/area-versus-card.png` })
  // Seen for good (the save is written a moment later).
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).areaVersusRulesSeen))
    .toBe(true)

  const goldBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pokedice.save')!).gold as number,
  )
  await card.getByRole('button', { name: /FIGHT/ }).click()
  const request = page.getByRole('button', { name: 'SEND FRIEND REQUEST' })
  await fight(page, () => request.isVisible())
  await expect(
    page.getByText('You beat Misty’s team!').or(page.getByText("You beat Misty's team!")),
  ).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/area-versus-won.png` })
  await request.click()
  await expect(page.getByText('Friend request sent to Misty.')).toBeVisible()
  expect(sent).toEqual([{ p_to: MISTY, p_area: ROUTE3.id }])
  expect(met).toEqual([{ p_foe: MISTY, p_area: ROUTE3.id, p_outcome: 'won' }])
  // Each K.O. paid ×1.5 a trainer's (two Lv.8 Pokémon), and the team is healed again.
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!))
  await expect.poll(async () => (await saved()).gold - goldBefore).toBeGreaterThan(0)
  await expect
    .poll(async () => (await saved()).box.every((p: { currentHp: number }) => p.currentHp > 0))
    .toBe(true)
})

test('SKIP: no ₽, the card used, the meet told', async ({ page }) => {
  const met: Record<string, unknown>[] = []
  await boot(page, inRoute3(60, { areaVersusRulesSeen: true }), {
    area_versus_offer: FOE(8),
    area_versus_met: (b: Record<string, unknown>) => {
      met.push(b)
      return null
    },
  })
  const card = await toCard(page)
  const gold = await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).gold as number)
  await card.getByRole('button', { name: 'SKIP · NO ₽' }).click()
  await expect(
    page.getByText('You let Misty’s team pass.').or(page.getByText("You let Misty's team pass.")),
  ).toBeVisible()
  await expect.poll(() => met).toEqual([{ p_foe: MISTY, p_area: ROUTE3.id, p_outcome: 'skipped' }])
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).gold)).toBe(gold)
})

test('a loss costs only the ₽: no wipe, the team healed, the round goes on', async ({ page }) => {
  await boot(page, inRoute3(5, { areaVersusRulesSeen: true }), {
    area_versus_offer: FOE(70),
    area_versus_met: null,
  })
  const card = await toCard(page)
  await card.getByRole('button', { name: /FIGHT/ }).click()
  const defeat = page.getByRole('heading', { name: 'Defeat' })
  await fight(page, () => defeat.isVisible())
  await expect(page.getByText('No ₽ this time. Your team is healed and the round goes on.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'SEND FRIEND REQUEST' })).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/area-versus-lost.png` })
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!))
  // Not a wipe: the round's cards met are kept, and the whole team is up again.
  await expect
    .poll(async () => (await saved()).box.every((p: { currentHp: number }) => p.currentHp > 0))
    .toBe(true)
  const save = await saved()
  expect(save.areaProgress[save.currentAreaId].drawn).toContain('versus')
})

test('the Friends page: a request to answer, ACCEPT makes friends', async ({ page }) => {
  const answers: Record<string, unknown>[] = []
  await boot(page, makeSave(4), {
    friend_requests: [
      {
        id: MISTY,
        name: 'Misty',
        avatar: 'kanto/lass',
        rich: false,
        area: ROUTE3.id,
        at: new Date().toISOString(),
      },
    ],
    friend_request_answer: (b: Record<string, unknown>) => {
      answers.push(b)
      return 'added'
    },
    friend_list: [],
    friend_code: 'K7QM4XD9',
  })
  await page.goto('/friends')
  const requests = page.getByRole('region', { name: 'Friend requests (1)' })
  await expect(requests.getByText('Misty')).toBeVisible()
  await expect(requests.getByText(`Fought your team in ${ROUTE3.name}`)).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/area-versus-requests.png` })
  await requests.getByRole('button', { name: "Accept Misty's friend request" }).click()
  await expect(page.getByText('Misty is now your friend!')).toBeVisible()
  expect(answers).toEqual([{ p_from: MISTY, p_accept: true }])
})
