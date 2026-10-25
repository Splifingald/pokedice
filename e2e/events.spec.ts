// The special events (docs/18): the unlock pop-up, then the Fortune Wheel from Home's square to its prize: a ticket a
// spin, drawn on the device on the server's clock, for guests and signed-in players alike (since 2026-10-25).
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, linearAreas, type SaveData } from '../src/engine'
import { FAST, fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

const ROUTES_7_8 = DEFAULT_CONFIG.events.wheel.unlockAreaId!
const cleared = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
const HOUR = 60 * 60 * 1000

/** Routes 7 & 8 cleared: the wheel is open. `seen`: its pop-up (and so its rules) was already shown. */
function wheelSave(seen = true, events: SaveData['events'] = {}): SaveData {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  return {
    ...base,
    gold: 1000,
    areaProgress: { ...base.areaProgress, [ROUTES_7_8]: cleared },
    events: { ...(seen && { seen: ['wheel' as const], wheelRulesSeen: true }), ...events },
  }
}

const today = () => new Date().toISOString().slice(0, 10)
const eventTime = () => ({ now: new Date().toISOString(), day: today() })

async function boot(page: Page, save: SaveData, signedIn = false, settings = FAST) {
  await page.addInitScript(
    ([key, session, s, f]) => {
      if (session) localStorage.setItem(key!, session)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [STORAGE_KEY, signedIn ? JSON.stringify(fakeSession()) : '', JSON.stringify(save), settings],
  )
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)

test('the wheel opens with a pop-up that goes straight to it', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: eventTime } })
  await boot(page, wheelSave(false))
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: 'Fortune Wheel' })
  await expect(pop).toBeVisible()
  await expect(pop.getByText('Tickets', { exact: true })).toBeVisible()
  await pop.getByRole('button', { name: "Let's go!" }).click()
  await expect(page).toHaveURL(/\/events\/wheel$/)
  await expect(page.getByRole('heading', { name: 'Fortune Wheel' })).toBeVisible()
  // Its rules were in the pop-up: the page doesn't show them a second time.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Seen once: back Home (in the app: a reload would seed the unseen save again), no pop-up.
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await expect(page.getByRole('button', { name: /^Fortune Wheel: 4\/4 tickets/ })).toBeVisible()
  await expect(pop).toHaveCount(0)
})

test('the events ship off: no wheel until the admin switches it on', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: eventTime }, eventsOff: true })
  await boot(page, wheelSave(false))
  await page.goto('/home')
  await expect(page.getByRole('button', { name: 'CONTINUE', exact: true })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(page.getByRole('dialog', { name: 'Fortune Wheel' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Fortune Wheel/ })).toHaveCount(0)
})

test('a spin costs a ticket: the odds, the last ticket spent, one bought for ₽200', async ({ page }) => {
  const calls = await mockSupabase(page, { rpc: { event_time: eventTime } })
  const save = wheelSave(true, { wheelTickets: 1, wheelTicketAt: Date.now() + 5 * HOUR })
  await boot(page, save, true)
  await page.goto('/home')
  await page.getByRole('button', { name: /^Fortune Wheel: 1\/4 tickets/ }).click()
  await expect(page).toHaveURL(/\/events\/wheel$/)

  await page.getByRole('button', { name: 'Info: every prize and its odds' }).click()
  const odds = page.getByRole('dialog', { name: 'Prizes and odds' })
  // Eight prizes and the jackpot, under the header.
  await expect(odds.getByRole('row')).toHaveCount(10)
  await expect(odds.getByRole('row', { name: /Porygon/ })).toContainText('10 %')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Spin!' }).click()
  const card = page.getByRole('dialog', { name: /^You won/ })
  await expect(card).toBeVisible({ timeout: 15_000 })
  await card.getByRole('button', { name: 'Nice!' }).click()
  await expect(page.getByText('No ticket left')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Spin!' })).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).events?.wheelTickets).toBe(0)
  const spent = await stored(page)

  await page.getByRole('button', { name: 'Buy a ticket · ₽200' }).click()
  await expect(page.getByRole('button', { name: 'Spin!' })).toBeVisible()
  await expect.poll(async () => (await stored(page)).events?.wheelTickets).toBe(1)
  expect((await stored(page)).gold).toBe(spent.gold - 200)
  // Signed in or not, the spin is drawn here: the server is never asked.
  expect(calls.some((c) => c.includes('wheel_spin'))).toBe(false)
})

test('the new rules show once on the page; a Porygon won is paid and the jackpot moves on to a shiny one', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: eventTime } })
  // A player from before the tickets (the wheel seen, not its new rules), with a Porygon still waiting to be paid.
  const save = wheelSave(false, { seen: ['wheel'], wheelPending: { kind: 'pokemon', dex: 137, level: 30 } })
  await boot(page, save)
  await page.goto('/events/wheel')
  const rules = page.getByRole('dialog', { name: 'Fortune Wheel' })
  await expect(rules.getByText('Tickets', { exact: true })).toBeVisible()
  await rules.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByText(/^Jackpot: Shiny Porygon 1 %$/)).toBeVisible()
  await expect.poll(async () => (await stored(page)).box.some((p) => p.dex === 137)).toBe(true)
  await expect.poll(async () => (await stored(page)).events?.wheelRulesSeen).toBe(true)
  // Back on the page from Home (a reload would seed the first save again): no rules this time.
  await page.getByRole('button', { name: 'Back to Home' }).click()
  await page.getByRole('button', { name: /^Fortune Wheel: 4\/4 tickets/ }).click()
  await expect(page.getByRole('button', { name: 'Spin!' })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

/** Click the first visible, enabled button among `names` (exact accessible names, or patterns). */
async function clickAny(page: Page, names: (string | RegExp)[]): Promise<boolean> {
  for (const name of names) {
    const btn = page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name }).first()
    if ((await btn.isVisible().catch(() => false)) && (await btn.isEnabled().catch(() => false))) {
      await btn.click()
      return true
    }
  }
  return false
}

/** The League area is cleared, so its fights can play themselves (auto mode): only the rewards' buttons to press. */
const AUTO = JSON.stringify({ ...JSON.parse(FAST), autoMode: true })
// Between a trainer's Pokémon the result's Next ▸ sends the next one (the rework; NEXT BATTLE before).
const FIGHT_ON = ['GOT IT', 'SKIP ▸▸', 'NEXT BATTLE', 'Next ▸']

/** The Kanto League won, and a team for the rebattle: three Lv.100s with every upgrade (`level` 5: a team to lose). */
function leagueSave(level = 100): SaveData {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const mon = (id: string, dex: number) => ({ id, dex, level, xp: 0, currentHp: 999, caughtAt: 0 })
  const max = <K extends string>(r: Record<K, number>) => Object.fromEntries(Object.keys(r).map((k) => [k, level > 50 ? 10 : 1])) as Record<K, number>
  const league = 'bbe7e459-a138-5106-bd01-fce7ff422e7f'
  return {
    ...base,
    box: [mon('a', 150), mon('b', 149), mon('c', 248)],
    team: ['a', 'b', 'c'],
    comboLevels: max(base.comboLevels),
    dieLevels: max(base.dieLevels),
    pokedex: [...base.pokedex, 150, 149, 248],
    areaProgress: { ...base.areaProgress, [league]: cleared },
    events: { seen: ['wheel', 'rebattle'] },
    regionOfferSeen: ['johto'],
    settings: { ...base.settings, autoMode: true },
  }
}

test('the Elite Rebattle: a gauntlet fight pays, the next trainer waits, and the page keeps the place', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: eventTime } })
  const save = leagueSave()
  await boot(page, save, false, AUTO)
  await page.goto('/home')
  await page.getByRole('button', { name: /^Elite Rebattle, Bronze tier: next, Elite Four Lorelei/ }).click()
  await expect(page).toHaveURL(/\/events\/rebattle$/)
  // The rules, from the Info button at the foot of the page.
  await page.getByRole('button', { name: 'Info: how Elite Rebattle works' }).click()
  const rules = page.getByRole('dialog', { name: 'Elite Rebattle' })
  await expect(rules.getByText(/^Five fights in a row, no Center, items allowed\./)).toBeVisible()
  await rules.getByRole('button', { name: 'OK', exact: true }).click()
  await page.getByRole('button', { name: 'Start the Bronze tier' }).click()
  await expect(page.getByText('Each of their Pokémon pays ₽×1, once in this tier.')).toBeVisible()
  await page.getByRole('button', { name: 'FIGHT', exact: true }).click()

  const next = page.getByRole('button', { name: 'Next: Elite Four Bruno' })
  // Bounded by time, not clicks: an unlucky roll of the dice can make Lorelei's fight long.
  for (const until = Date.now() + 90_000; Date.now() < until && !(await next.isVisible()); ) {
    await clickAny(page, FIGHT_ON)
    await page.waitForTimeout(80)
  }
  await expect(next).toBeVisible({ timeout: 10_000 })
  // Lorelei's three Pokémon paid, once each.
  await expect.poll(async () => (await stored(page)).gold).toBeGreaterThan(save.gold)
  expect((await stored(page)).events?.rebattle?.kanto).toMatchObject({ done: 0, step: 1 })

  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(page).toHaveURL(/\/events\/rebattle$/)
  await expect(page.getByRole('button', { name: 'Continue: Elite Four Bruno' })).toBeVisible()
  await expect(page.getByLabel('Beaten')).toHaveCount(1)
})

test('the Elite Rebattle: a loss starts the tier over, the team healed', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: eventTime } })
  await boot(page, leagueSave(5), false, AUTO)
  await page.goto('/events/rebattle')
  await page.getByRole('button', { name: 'Start the Bronze tier' }).click()
  await page.getByRole('button', { name: 'FIGHT', exact: true }).click()
  const lost = page.getByText('The gauntlet starts over from Elite Four Lorelei.', { exact: false })
  for (let i = 0; i < 300 && !(await lost.isVisible()); i++) {
    await clickAny(page, FIGHT_ON)
    await page.waitForTimeout(80)
  }
  await expect(lost).toBeVisible()
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(page).toHaveURL(/\/events\/rebattle$/)
  await expect(page.getByRole('button', { name: 'Start the Bronze tier' })).toBeVisible()
  const after = await stored(page)
  expect(after.events?.rebattle?.kanto?.step).toBe(0)
  for (const p of after.box) expect(p.currentHp).toBeGreaterThan(0)
})

/**
 * Raids open (the Safari Zone cleared), three Dark Pokémon (Lv.100, fighting at Lv.50). The raid tests run on Earth Day
 * 2027 (the server's clock says so): Celebi, whose lair is in Johto, so a catch waits for it.
 */
const RAID_DAY = '2027-04-22'
const raidTime = () => ({ now: `${RAID_DAY}T12:00:00.000Z`, day: RAID_DAY })

function raidSave(): SaveData {
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const mon = (id: string, dex: number) => ({ id, dex, level: 100, xp: 0, currentHp: 999, caughtAt: 0 })
  return {
    ...base,
    box: [mon('a', 248), mon('b', 359), mon('c', 197)],
    team: ['a', 'b', 'c'],
    pokedex: [...base.pokedex, 248, 359, 197],
    inventory: { ...base.inventory, 'ultra-ball': 3 },
    areaProgress: {
      ...base.areaProgress,
      [DEFAULT_CONFIG.events.raid.unlockAreaId!]: cleared,
    },
    events: { seen: ['wheel', 'raid'] },
    // No animations: the fight plays at once between your turns.
    settings: { ...base.settings, reducedMotion: true },
  }
}

test('the raid team editor: Recommended first, then by level, Pokédex No. or name, narrowed to a type', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: raidTime } })
  const save = raidSave()
  const lv = { a: 100, b: 80, c: 90 } as Record<string, number>
  const mon = (id: string, dex: number, level: number) => ({ id, dex, level, xp: 0, currentHp: 999, caughtAt: 0 })
  await boot(page, {
    ...save,
    // Celebi (Grass / Psychic): the Dark three hit it super effectively; Pikachu doesn't; Charizard does, at Lv.40.
    box: [...save.box.map((p) => ({ ...p, level: lv[p.id]! })), mon('d', 25, 60), mon('e', 6, 40)],
    pokedex: [...save.pokedex, 25, 6],
  })
  await page.goto('/events/raid')
  await page.getByRole('button', { name: 'Edit' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your raid team' })
  const rows = sheet.locator('button[aria-pressed]')
  const names = rows.locator('b')
  // Recommended by default: the green thumbs by Pokédex No., then the rest strongest first.
  await expect(names).toHaveText(['Umbreon', 'Tyranitar', 'Absol', 'Pikachu', 'Charizard'])
  const thumbed = rows.filter({ has: page.getByRole('img', { name: 'Recommended' }) }).locator('b')
  await expect(thumbed).toHaveText(['Umbreon', 'Tyranitar', 'Absol'])
  await expect(sheet.getByText('Recommended: Lv.50 or more and super effective against Celebi.')).toBeVisible()
  const sort = sheet.getByRole('combobox', { name: 'Sort by' })
  await expect(sort.locator('option')).toHaveText(['Recommended', 'Highest level', 'Pokédex No.', 'Name (A–Z)'])
  await sort.selectOption('level')
  await expect(names).toHaveText(['Tyranitar', 'Umbreon', 'Absol', 'Pikachu', 'Charizard'])
  // The thumbs stay, whatever the order.
  await expect(thumbed).toHaveText(['Tyranitar', 'Umbreon', 'Absol'])
  await sort.selectOption('dex')
  await expect(names).toHaveText(['Charizard', 'Pikachu', 'Umbreon', 'Tyranitar', 'Absol'])
  await sort.selectOption('az')
  await expect(names).toHaveText(['Absol', 'Charizard', 'Pikachu', 'Tyranitar', 'Umbreon'])
  // Only the types the Box holds.
  const type = sheet.getByRole('combobox', { name: 'Filter by type' })
  await expect(type.locator('option')).toHaveText(['All types', 'Fire', 'Electric', 'Flying', 'Rock', 'Dark'])
  await type.selectOption('dark')
  await expect(names).toHaveText(['Absol', 'Tyranitar', 'Umbreon'])
  await type.selectOption('electric')
  await expect(names).toHaveText(['Pikachu'])
  // Hidden picks stay picked, with their thumbs.
  const slots = sheet.getByRole('list', { name: 'Your raid team' })
  await expect(slots.getByText('Pick one below')).toHaveCount(0)
  await expect(slots.getByRole('img', { name: 'Recommended' })).toHaveCount(3)
})

test('a raid: the day’s raid, its lock, NPC trainers in the group, the fight to a result, a locked catch', async ({ page }) => {
  test.setTimeout(180_000)
  await mockSupabase(page, { rpc: { event_time: raidTime } })
  await boot(page, raidSave())
  await page.goto('/home')
  // Earth Day's Celebi is shiny: the mythicals' days of the calendar are (docs/24).
  await page.getByRole('button', { name: /^Raid Battles: Shiny Celebi/ }).click()
  await expect(page).toHaveURL(/\/events\/raid$/)
  await expect(page.getByRole('heading', { name: 'Your raid team' })).toBeVisible()
  // Celebi's lair is in Johto, not started: it'll wait for the player, who can still fight and catch it.
  const lock = page.getByRole('note')
  await expect(lock.getByText('Celebi will wait for you')).toBeVisible()
  await expect(lock.getByText(/joins your Box once you reach Johto and complete Ilex Shrine/)).toBeVisible()
  // The next days, the same for everyone, are in the calendar.
  await expect(page.getByRole('button', { name: 'Calendar: the raids of the next two weeks' })).toBeVisible()
  await page.getByRole('button', { name: 'Info: how Raid Battles works' }).click()
  const rules = page.getByRole('dialog', { name: 'Raid Battles' })
  await expect(rules.getByText(/^One raid a day for everyone/)).toBeVisible()
  // The raid's own type matchups, with the admin's numbers.
  const matchups = /Super-effective hits only do ×1\.3; resisted ones still do ×0\.7; nothing is immune \(×0\.5\)\.$/
  await expect(rules.getByText(matchups)).toBeVisible()
  await rules.getByRole('button', { name: 'OK', exact: true }).click()
  await page.getByRole('button', { name: 'Start the raid' }).click()
  // No friend in the group: four NPC trainers to pick two from, the same four after a reload.
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  await expect(pop.getByText(/^2 slots in your group are empty: these trainers can fight beside you/)).toBeVisible()
  const cards = pop.getByRole('button', { name: /, Lv\.\d+$/ })
  await expect(cards).toHaveCount(4)
  const offered = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  await pop.getByRole('button', { name: 'Back', exact: true }).click()
  await expect.poll(async () => (await stored(page)).events?.raidNpc?.key).toBe(`daily:${RAID_DAY}`)
  const seed = (await stored(page)).events!.raidNpc!.seed
  await page.addInitScript((s) => localStorage.setItem('pokedice.save', s), JSON.stringify(await stored(page)))
  await page.reload()
  await page.getByRole('button', { name: 'Start the raid' }).click()
  await expect(cards).toHaveCount(4)
  expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(offered)
  await expect(pop.getByRole('button', { name: 'Pick 2 more' })).toBeDisabled()
  await cards.nth(0).click()
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(pop.getByRole('button', { name: 'Pick 1 more' })).toBeDisabled()
  await cards.nth(2).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  // The try started: the next one brings four new trainers.
  await expect.poll(async () => (await stored(page)).events?.raidNpc?.seed).not.toBe(seed)

  // The fight (animations off): you play first, the attack is yours, until the raid is won or lost.
  await expect(page.getByRole('heading', { name: 'Raid battle: Celebi' })).toBeAttached()
  const caught = page.getByRole('button', { name: /ROLL TO CATCH|CATCH/ })
  const lost = page.getByRole('heading', { name: 'The raid is lost' })
  for (let i = 0; i < 400 && !(await caught.isVisible()) && !(await lost.isVisible()); i++) {
    await clickAny(page, ['ATTACK', 'SKIP TURN'])
    await page.waitForTimeout(120)
  }
  expect((await stored(page)).events?.raid?.tries).toBe(1)
  if (await lost.isVisible()) {
    // Lost: the raid stays open for another try.
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to the raids' }).click()
    await expect(page.getByRole('button', { name: 'Start the raid' })).toBeVisible()
    return
  }
  await page.getByRole('radio', { name: /Ultra Ball/ }).click()
  await caught.click()
  const result = page.getByRole('button', { name: 'CONTINUE' })
  await expect(result).toBeVisible()
  await result.click()
  const ending = page.getByRole('heading', { name: /^Celebi (was caught|got away)!$/ })
  await expect(ending).toBeVisible()
  if ((await ending.textContent()) === 'Celebi was caught!') {
    // Caught, but locked: it waits for Ilex Shrine, in Johto.
    await expect(page.getByText(/Celebi is yours, locked for now: it joins your Johto Box once you complete Ilex Shrine/)).toBeVisible()
    // The save is written a moment after it changes.
    await expect.poll(async () => (await stored(page)).events?.raidsWon).toBe(1)
    const after = await stored(page)
    expect(after.events?.raid?.caught).toBe(true)
    expect(after.box.some((p) => p.dex === 251)).toBe(false)
    expect(after.events?.raidLocked).toMatchObject([{ dex: 251, shiny: true, day: RAID_DAY }])
    await page.getByRole('button', { name: 'Back to the raids' }).click()
    await expect(page.getByText('CAUGHT', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start the raid' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Waiting for you' })).toBeVisible()
    await expect(page.getByText('Complete Ilex Shrine in Johto to get it')).toBeVisible()
  } else {
    await expect(page.getByRole('heading', { name: 'Celebi got away!' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  }
})

test('the raid team fights, not the party: a switch on your turn, the speed button', async ({ page }) => {
  test.setTimeout(120_000)
  await mockSupabase(page, { rpc: { event_time: raidTime } })
  const base = raidSave()
  const mon = (id: string, dex: number) => ({ id, dex, level: 45, xp: 0, currentHp: 999, caughtAt: 0 })
  // The party is the Dark trio; the raid team, picked on the Raids page, is three others from the Box.
  await boot(page, {
    ...base,
    box: [...base.box, mon('d', 130), mon('e', 143), mon('f', 65)],
    pokedex: [...base.pokedex, 130, 143, 65],
    events: { ...base.events, raidTeam: ['d', 'e', 'f'] },
  })
  await page.goto('/events/raid')
  await page.getByRole('button', { name: 'Start the raid' }).click()
  // No friend in the group: two of the four NPC trainers on offer (docs/24).
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  await pop.getByRole('button', { name: /, Lv\.\d+$/ }).nth(0).click()
  await pop.getByRole('button', { name: /, Lv\.\d+$/ }).nth(1).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Raid battle: Celebi' })).toBeAttached()

  const team = page.getByRole('group', { name: 'Switch Pokémon' })
  await expect(team.getByRole('button')).toHaveCount(3)
  for (const name of ['Gyarados', 'Snorlax', 'Alakazam'])
    await expect(team.getByRole('button', { name: new RegExp(`^${name},`) })).toBeAttached()
  await expect(team.getByRole('button', { name: /^(Tyranitar|Absol|Umbreon),/ })).toHaveCount(0)

  // Your turn: Snorlax goes in for Gyarados, and that was the turn.
  await expect(page.getByRole('button', { name: 'ATTACK', exact: true })).toBeEnabled({ timeout: 20_000 })
  await team.getByRole('button', { name: /^Snorlax,.*Switch in$/ }).click()
  const pick = page.getByRole('dialog', { name: 'Switch (costs your turn)' })
  await expect(pick.getByRole('button', { name: /Gyarados/ })).toHaveCount(0)
  await pick.getByRole('button', { name: /Snorlax/ }).click()
  await expect(pick).toHaveCount(0)
  await expect(team.getByRole('button', { name: /^Snorlax,.*in battle$/ })).toBeAttached()

  // The speed button: the allies' turns at ×1.5, kept in the settings.
  const speed = page.getByRole('button', { name: "Speed up your allies' turns" })
  await expect(speed).toHaveAttribute('aria-pressed', 'false')
  await expect(speed).toHaveText('×1')
  await speed.click()
  await expect(speed).toHaveAttribute('aria-pressed', 'true')
  await expect(speed).toHaveText('×1.5')
  await expect.poll(async () => (await stored(page)).settings.raidFast).toBe(true)
  await expect(page.getByRole('button', { name: 'Give up' })).toBeVisible()
})

const raidToday = () => ({ day: RAID_DAY, dex: 251, shiny: false, areaId: 'ilex', caught: false })
const friend = (id: string, name: string, avatar: string, dex: number[], helped = 0) => ({
  user_id: id,
  name,
  avatar,
  team: dex.map((d) => ({ dex: d, level: 50, shiny: false })),
  helped,
})

test('signed in: gifts from friends\u2019 raids pop up and go in the bag', async ({ page }) => {
  let given = false
  await mockSupabase(page, {
    rpc: {
      event_time: raidTime,
      raid_today: raidToday,
      raid_gifts_claim: () => (given ? [] : ((given = true), [{ id: 7, raider_name: 'Gary', dex: 151, item_key: 'ultra-ball' }])),
    },
  })
  const save = raidSave()
  await boot(page, save, true)
  await page.goto('/home')
  const pop = page.getByRole('dialog', { name: "Gifts from your friends' raids" })
  await expect(pop.getByText('Your team helped Gary catch Mew!')).toBeVisible()
  await pop.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(pop).toHaveCount(0)
  await expect.poll(async () => (await stored(page)).inventory['ultra-ball']).toBe((save.inventory['ultra-ball'] ?? 0) + 1)
})

test('signed in: two friends in the group, and the raid starts with their teams, no NPC', async ({ page }) => {
  const calls = await mockSupabase(page, {
    rpc: {
      event_time: raidTime,
      raid_today: raidToday,
      raid_gifts_claim: [],
      raid_set_team: [],
      raid_friend_teams: [
        friend('22222222-0000-4000-8000-000000000001', 'Gary', 'green', [9, 65, 59], 1),
        friend('22222222-0000-4000-8000-000000000002', 'Erika', 'red', [45, 3]),
      ],
    },
  })
  await boot(page, raidSave(), true)
  await page.goto('/events/raid')
  await expect(page.getByRole('heading', { name: 'Your group' })).toBeVisible()
  await page.getByRole('button', { name: /^Add a friend/ }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Raid with a friend' })
  await sheet.getByRole('button', { name: /Gary/ }).click()
  await sheet.getByRole('button', { name: /Erika/ }).click()
  await expect(sheet.getByRole('button', { name: /Gary/ })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.getByText('Helped you once')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take Erika out of your group' })).toBeVisible()
  // The green thumbs against Celebi (Grass / Psychic): your three Dark Pokémon, Gary's Arcanine (Fire), Erika's two
  // (Poison); not Gary's Blastoise or Alakazam.
  const row = (button: string) =>
    page.getByRole('listitem').filter({ has: page.getByRole('button', { name: button }) })
  const thumbs = 'svg[aria-label="Recommended"]'
  await expect(page.getByRole('listitem').filter({ hasText: 'You' }).first().locator(thumbs)).toHaveCount(3)
  await expect(row('Take Gary out of your group').locator(thumbs)).toHaveCount(1)
  await expect(row('Take Erika out of your group').locator(thumbs)).toHaveCount(2)

  // A full group: no NPC pop-up, straight into the raid, the friends' trainers beside you.
  await page.getByRole('button', { name: 'Start the raid' }).click()
  await expect(page.getByRole('dialog', { name: /^Pick \d trainers?$/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Raid battle: Celebi' })).toBeAttached()
  await expect(page.getByRole('list', { name: 'Your group' }).getByLabel(/^(Gary|Erika)'s /).first()).toBeAttached()
  // Your raid team is registered for your friends on the way.
  await expect.poll(() => calls.some((c) => c.includes('/rpc/raid_set_team'))).toBe(true)
})

/** Kanto played up to the Seafoam Islands, all of it completed: Articuno's raid is open there. */
function seafoamSave(): SaveData {
  const data = gameData()
  const chain = linearAreas(data, 'kanto')
  const seafoam = chain.find((a) => a.name === 'Seafoam Islands')!
  const base = raidSave()
  const done = Object.fromEntries(chain.filter((a) => a.orderIndex <= seafoam.orderIndex).map((a) => [a.id, cleared]))
  return { ...base, currentAreaId: seafoam.id, areaProgress: { ...base.areaProgress, ...done } }
}

test('a progression raid: RAID on CONTINUE once its area is completed, its page, NPC partners, the fight', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: raidTime } })
  const save = seafoamSave()
  await boot(page, save)
  await page.goto('/home')
  await page.getByRole('button', { name: 'RAID: ARTICUNO', exact: true }).click()
  const seafoam = save.currentAreaId
  await expect(page).toHaveURL(new RegExp(`/raid/${seafoam}/144$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Legendary raid' })).toBeVisible()
  await expect(page.getByText("Unlimited tries until it's caught. Friends who help you catch it get a gift.")).toBeVisible()
  // The team for it: Kanto's Box, capped at the progression raids' Lv.50.
  await expect(page.getByRole('heading', { name: 'Your Kanto team' })).toBeVisible()
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  const cards = pop.getByRole('button', { name: /, Lv\.50$/ })
  await expect(cards).toHaveCount(4)
  await cards.nth(1).click()
  await cards.nth(3).click()
  await pop.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Raid battle: Articuno' })).toBeAttached()
  await expect.poll(async () => (await stored(page)).events?.raidNpc?.key).toBe(`${seafoam}:144`)
})

test('the Raids page lists the legendary raids of the region, each opening its page', async ({ page }) => {
  await mockSupabase(page, { rpc: { event_time: raidTime } })
  await boot(page, seafoamSave())
  await page.goto('/events/raid')
  await expect(page.getByRole('heading', { name: 'Legendary raids' })).toBeVisible()
  const row = page.getByRole('button', { name: /^Articuno Seafoam Islands/ })
  await expect(row).toContainText('Open')
  await expect(page.getByRole('button', { name: /Complete Cerulean Cave to open it/ })).toBeVisible()
  await row.click()
  await expect(page).toHaveURL(/\/raid\/[0-9a-f-]+\/144$/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/\/events\/raid$/)
})
