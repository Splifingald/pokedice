// The players' suggestions (docs/67), on for everyone: a shiny's Box tile on gold, the heart in the
// Pokémon sheet, favourites first in the raid team picker, the shiny star on an area's Pokémon, PASS on an owned
// Pokémon's catch, and the stun's cure (auto-mode's HEAL offer, and by hand) on the kitchen sink and in a fight.
// Last, the fix that came with them: a trainer's next Pokémon no longer flickers the fight's background.
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, instanceMaxHp, linearAreas, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const data = gameData()

async function boot(page: Page, save: SaveData, rpc = {}) {
  await mockSupabase(page, { rpc })
  await page.addInitScript(
    ([s, f, c]) => {
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', c!)
    },
    [JSON.stringify(save), FAST, JSON.stringify(EVENTS_ON)],
  )
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!) as SaveData)
const mon = (id: string, dex: number, level: number, shiny = false) => ({
  id,
  dex,
  level,
  xp: 0,
  currentHp: 999,
  caughtAt: 0,
  ...(shiny && { shiny: true }),
})

/** Charmander's save with a shiny Spearow and a plain Lapras in the Box. */
function boxSave(): SaveData {
  const base = makeSave(4)
  return {
    ...base,
    box: [...base.box, mon('spearow', 21, 30, true), mon('lapras', 131, 52)],
    pokedex: [...base.pokedex, 21, 131],
  }
}

const background = (page: Page, name: RegExp) =>
  page.getByRole('button', { name }).evaluate((el) => getComputedStyle(el).backgroundColor)

test('the Box: a shiny tile on gold; the heart in its sheet, kept in the save', async ({ page }) => {
  await boot(page, boxSave())
  await page.goto('/team')
  // Daybreak's gold-pale (#fff4d6) for the shiny, paper (#ffffff) for the plain one.
  expect(await background(page, /^Spearow, Shiny/)).toBe('rgb(255, 244, 214)')
  expect(await background(page, /^Lapras,/)).toBe('rgb(255, 255, 255)')

  await page.getByRole('button', { name: /^Lapras,/ }).click()
  const heart = page.getByRole('button', { name: 'Favourite', exact: true })
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Favourites come first when you pick a raid team.')).toBeVisible()
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await stored(page)).favourites).toEqual(['lapras'])
  await heart.click()
  await expect.poll(async () => (await stored(page)).favourites).toEqual([])
})

test("an area's Pokémon: the star on a species already in the shiny Pokédex", async ({ page }) => {
  const save = makeSave(4)
  const area = data.areas.find((a) => a.id === save.currentAreaId)!
  const species = [...new Set(area.wildPool.filter((w) => w.weight > 0).map((w) => w.dex))]
  const [shiny, plain] = species
  await boot(page, { ...save, pokedex: [...save.pokedex, ...species], shinyDex: { kanto: [shiny!] } })
  await page.goto('/home')
  await page
    .getByRole('button', { name: new RegExp(`^${area.name}`) })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Kanto' })
  await sheet.getByRole('radiogroup', { name: 'Show Pokémon' }).getByRole('radio', { name: /^All/ }).click()
  const card = (dex: number) => sheet.getByRole('button', { name: new RegExp(`^${data.species[dex]!.name}`) })
  await expect(card(shiny!).getByRole('img', { name: 'In your shiny Pokédex' })).toBeVisible()
  await expect(card(plain!).getByRole('img', { name: 'In your shiny Pokédex' })).toHaveCount(0)
})

test('the raid team picker: favourites first, a heart on each card', async ({ page }) => {
  const RAID_DAY = '2027-04-22'
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const cleared = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
  const box = [mon('a', 248, 100), mon('b', 359, 80), mon('c', 197, 90), mon('d', 25, 60), mon('e', 6, 70)]
  await boot(
    page,
    {
      ...base,
      box,
      team: ['a', 'b', 'c'],
      pokedex: [...base.pokedex, 248, 359, 197, 25, 6],
      favourites: ['d'],
      areaProgress: { ...base.areaProgress, [DEFAULT_CONFIG.events.raid.unlockAreaId!]: cleared },
      events: { seen: ['wheel', 'raid'] },
    },
    { event_time: () => ({ now: `${RAID_DAY}T12:00:00.000Z`, day: RAID_DAY }) },
  )
  await page.goto('/events/raid')
  await page.getByRole('button', { name: 'Edit' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your raid team' })
  const names = sheet.getByRole('listitem').locator('b')
  // Pikachu, the favourite, ahead of the green thumbs (Recommended, the default order: by Pokédex No.).
  const order = ['Pikachu', 'Charizard', 'Umbreon', 'Tyranitar', 'Absol']
  await expect(names).toHaveText(order)
  await expect(sheet.getByText('Tap a heart: that Pokémon comes first here next time.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Pikachu: favourite' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(sheet.getByRole('button', { name: 'Absol: favourite' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  // A heart tapped: kept in the save; the card stays where it is until the picker opens again.
  await sheet.getByRole('button', { name: 'Absol: favourite' }).click()
  await expect(sheet.getByRole('button', { name: 'Absol: favourite' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect.poll(async () => (await stored(page)).favourites).toEqual(['d', 'b'])
  await expect(names).toHaveText(order)
  // Opened again: Absol joins Pikachu at the front, the two in the sort's own order (its green thumb first).
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(names).toHaveText(['Absol', 'Pikachu', 'Charizard', 'Umbreon', 'Tyranitar'])
})

test('the catch: PASS for a Pokémon already owned, no ball spent, on to the result', async ({ page }) => {
  test.setTimeout(120_000)
  // Route 1, cleared, on auto-mode (Auto on explored areas): the fight plays itself and the catch waits for the player.
  const [route1] = linearAreas(data, 'kanto')
  const base = makeSave(4)
  const lead = base.box.find((p) => p.id === base.team[0])!
  const strong = { ...lead, dex: 6, level: 50 }
  const team = [{ ...strong, currentHp: instanceMaxHp(strong, data) }]
  const species = route1!.wildPool.map((w) => w.dex)
  await boot(page, {
    ...base,
    box: [...base.box.filter((p) => p.id !== lead.id), ...team],
    team: [lead.id],
    pokedex: [...new Set([...base.pokedex, ...species])],
    inventory: { 'poke-ball': 5 },
    currentAreaId: route1!.id,
    areaProgress: {
      [route1!.id]: { ...emptyProgress(), cleared: true, roundsDone: 3, deck: ['wild' as const] },
    },
    settings: { ...base.settings, ...JSON.parse(FAST), playStyle: 'explored', autoMode: true },
  })
  await page.goto('/home')
  await page.getByRole('button', { name: /^Stay here/ }).click()
  const pass = page.getByRole('button', { name: 'Pass', exact: true })
  await expect(pass).toBeVisible({ timeout: 60_000 })
  // A choice now: the throw no longer goes by itself.
  await page.waitForTimeout(2500)
  await expect(pass).toBeVisible()
  await pass.click()
  await expect(page.getByRole('region', { name: 'VICTORY!' })).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1500)
  expect((await stored(page)).inventory['poke-ball']).toBe(5)
})

test("the kitchen sink: auto-mode's HEAL offer, its gauge running, and held by a dialog", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await boot(page, makeSave(4))
  await page.goto('/kitchen-sink')
  const offers = page.getByRole('button', { name: 'Use Paralyze Heal' })
  await expect(offers).toHaveCount(3, { timeout: 90_000 })
  await expect(
    page.getByText("Pikachu can't move this turn: cure it, or the turn passes.").first(),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pass', exact: true }).first()).toBeVisible()
})

test("a trainer's next Pokémon: the area picture stays on screen through every send-out", async ({
  page,
}) => {
  test.setTimeout(180_000)
  // Viridian Forest, cleared, on auto-mode: a Bug Catcher's two or three Pokémon, each a fight of its own (a new
  // battle screen), one after the other.
  const forest = linearAreas(data, 'kanto').find((a) => a.name === 'Viridian Forest')!
  const base = makeSave(4)
  const lead = base.box.find((p) => p.id === base.team[0])!
  const strong = { ...lead, dex: 6, level: 60 }
  const cleared = { ...emptyProgress(), cleared: true, roundsDone: 3 }
  const areaProgress = Object.fromEntries(
    linearAreas(data, 'kanto')
      .filter((a) => a.orderIndex < forest.orderIndex)
      .map((a) => [a.id, cleared]),
  )
  await boot(page, {
    ...base,
    box: [...base.box.filter((p) => p.id !== lead.id), { ...strong, currentHp: instanceMaxHp(strong, data) }],
    currentAreaId: forest.id,
    areaProgress: { ...areaProgress, [forest.id]: { ...cleared, deck: ['trainer' as const] } },
    settings: { ...base.settings, playStyle: 'explored', autoMode: true },
  })
  // Animations on, as players have them: with them off, a cached picture showed at once and hid the flicker.
  await page.addInitScript(() =>
    localStorage.setItem('pokedice.settings', JSON.stringify({ sfx: false, sound: false })),
  )
  // Every frame: is the area's picture (AreaArt) there, fully shown? Counted once it has shown the first time.
  await page.addInitScript(() => {
    const w = window as unknown as { artDrops: number; artSeen: boolean }
    w.artDrops = 0
    w.artSeen = false
    const tick = () => {
      const img = document.querySelector<HTMLImageElement>(
        '.aspect-\\[3\\/2\\] img.max-w-none.pointer-events-none',
      )
      const on = !!img && getComputedStyle(img).opacity === '1'
      if (on) w.artSeen = true
      else if (w.artSeen && document.querySelector('.aspect-\\[3\\/2\\]')) w.artDrops++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto('/home')
  await page.getByRole('button', { name: 'KEEP EXPLORING' }).click()
  await expect(page.getByRole('region', { name: 'VICTORY!' })).toBeVisible({ timeout: 120_000 })
  const { drops, seen } = await page.evaluate(() => {
    const w = window as unknown as { artDrops: number; artSeen: boolean }
    return { drops: w.artDrops, seen: w.artSeen }
  })
  expect(seen).toBe(true)
  expect(drops).toBe(0)
})

test('stunned by hand with its cure in the Bag: a red USE beside a white SKIP TURN, and the turn goes ahead', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await mockSupabase(page)
  const base = makeSave(4)
  await page.addInitScript(
    ([s, f]) => {
      // Once: the reload below must find the page's own save, with the stun put in it.
      if (sessionStorage.getItem('e2e.seeded')) return
      sessionStorage.setItem('e2e.seeded', '1')
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [JSON.stringify({ ...base, inventory: { ...base.inventory, 'paralyze-heal': 2 } }), FAST],
  )
  const attack = page.getByRole('button', { name: 'ATTACK', exact: true })
  await page.goto('/home')
  for (
    let i = 0;
    i < 200 && !((await attack.isVisible().catch(() => false)) && (await attack.isEnabled()));
    i++
  ) {
    const healing = page.getByRole('dialog', { name: 'Healing…' }).getByRole('button', { name: 'SKIP ▸▸' })
    if (await healing.isVisible().catch(() => false)) await healing.click()
    for (const name of ['FIGHT', 'EXPLORE', 'ENTER', 'PICK IT UP', 'CONTINUE']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
  await expect(attack).toBeEnabled()
  // The fight as stored (src/store/resume.ts), its lead paralysed at its turn's start; a reload brings it back so.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('pokedice.save')!)
    const s = save.resume.battle.state
    s.phase = 'player_stunned'
    s.dice = []
    s.selected = []
    s.player[s.activeIndex].status.paralyze = 1
    localStorage.setItem('pokedice.save', JSON.stringify(save))
  })
  await page.reload()
  const cure = page.getByRole('button', { name: 'Use Paralyze Heal' })
  const skip = page.getByRole('button', { name: 'SKIP TURN', exact: true })
  await expect(cure).toBeVisible({ timeout: 15_000 })
  await expect(skip).toBeVisible()
  // Daybreak's paper for SKIP TURN; the cure is the red one.
  expect(await skip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
  await cure.click()
  await expect(attack).toBeEnabled({ timeout: 15_000 })
  await expect(cure).toHaveCount(0)
})
