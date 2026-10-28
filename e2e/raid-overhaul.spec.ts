// The raid overhaul (docs/40): a legendary raid's own rules on its page and its rules pop-up once, its own level for the NPC partners, and a Mega raid locked until its Pokémon is caught.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, linearAreas, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, gameData, makeSave, mockSupabase } from './helpers'

const cleared = { roundsDone: 1, cleared: true, bossDefeated: true, bossesDefeated: [], gymsDefeated: [] }
const RAID_DAY = '2027-04-22'
const raidTime = () => ({ now: `${RAID_DAY}T12:00:00.000Z`, day: RAID_DAY })

/** Every Kanto area completed (Cerulean Cave too), three Lv.100 Pokémon: Articuno's and Mewtwo's raids are open. */
function kantoSave(patch: Partial<SaveData['events']> = {}): SaveData {
  const data = gameData()
  const kanto = data.areas.filter((a) => a.regionId === 'kanto')
  const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const mon = (id: string, dex: number) => ({ id, dex, level: 100, xp: 0, currentHp: 999, caughtAt: 0 })
  const done = Object.fromEntries(kanto.map((a) => [a.id, cleared]))
  return {
    ...base,
    box: [mon('a', 248), mon('b', 359), mon('c', 197)],
    team: ['a', 'b', 'c'],
    pokedex: [...base.pokedex, 248, 359, 197],
    currentAreaId: linearAreas(data, 'kanto').at(-1)!.id,
    areaProgress: { ...base.areaProgress, ...done, [DEFAULT_CONFIG.events.raid.unlockAreaId!]: cleared },
    events: { seen: ['wheel', 'raid', 'rebattle'], ...patch },
    // Kanto's League beaten: the shiny Pokédex's rules (docs/39) are read, so only the raid's pop up.
    shinyDexSeen: true,
    settings: { ...base.settings, reducedMotion: true },
  }
}

async function boot(page: Page, save: SaveData) {
  await mockSupabase(page, { rpc: { event_time: raidTime } })
  await page.addInitScript(
    ([cfg, s, f]) => {
      localStorage.setItem('pokedice.devConfig', cfg!)
      localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(EVENTS_ON), JSON.stringify(save), FAST],
  )
}

const areaId = (name: string) => gameData().areas.find((a) => a.name === name)!.id

test('the overhaul’s rules on the Raids page until GOT IT, never a pop-up there', async ({ page }) => {
  await boot(page, kantoSave())
  await page.goto('/events/raid')
  // The overhaul's rules where they apply (docs/43 §7): a card at the top of the Raids page, never a pop-up there.
  const card = page.getByRole('region', { name: 'How Raid Battles works' })
  await expect(card.getByText('Learn its pattern')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Opening the page isn't reading them.
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).events?.raidRulesSeen)).toBeFalsy()
  await card.getByRole('button', { name: 'Got it' }).click()
  await expect(card).toHaveCount(0)
  // Seen: kept in the save, so it doesn't come back.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save')!).events?.raidRulesSeen))
    .toBe(true)
})

test('a legendary raid lists its own rules, always open, with no book; the Raids page’s INFO shows the overhaul’s rules again', async ({
  page,
}) => {
  // Read already (a page load seeds the save afresh, so the flag comes with it).
  await boot(page, kantoSave({ raidRulesSeen: true }))
  await page.goto(`/raid/${areaId('Seafoam Islands')}/144`)
  const rules = page.getByRole('region', { name: 'This raid' })
  // Open on the page (the user's call, 2026-10-27), nothing to unfold.
  await expect(rules.getByText('Lv.50', { exact: true })).toBeVisible()
  await expect(rules.getByText('Snow', { exact: true })).toBeVisible()
  await expect(rules.getByText('Its last bar')).toBeVisible()
  await expect(rules.getByText('Gains dice: Ice')).toBeVisible()
  await expect(page.getByRole('button', { name: 'How raids work now' })).toHaveCount(0)
  const axe = await new AxeBuilder({ page }).include('section[aria-labelledby="raid-rules-title"]').analyze()
  expect(axe.violations).toEqual([])
  // No banner over the card: the plate (back, the kicker) lies on the card, Articuno in its middle.
  await expect(page.getByRole('heading', { name: 'Legendary raid', level: 1 })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Articuno' })).toBeVisible()
  // The Raids page's INFO carries the overhaul's rules after the raids' own.
  await page.goto('/events/raid')
  await page.getByRole('button', { name: 'Info: how Raid Battles works' }).click()
  const info = page.getByRole('dialog', { name: 'Raid Battles' })
  await expect(info.getByText('Learn its pattern')).toBeVisible()
  await info.getByRole('button', { name: 'OK', exact: true }).click()
  await expect(info).toHaveCount(0)
})

test("Mewtwo's raid fights at its own level: the NPC partners come at Lv.70", async ({ page }) => {
  await boot(page, kantoSave({ raidRulesSeen: true }))
  await page.goto(`/raid/${areaId('Cerulean Cave')}/150`)
  const rules = page.getByRole('region', { name: 'This raid' })
  await expect(rules.getByText('Lv.70', { exact: true })).toBeVisible()
  await expect(rules.getByText('Combo shield')).toBeVisible()
  await expect(rules.getByText('Charged attack')).toBeVisible()
  await page.getByRole('button', { name: 'Start the raid' }).click()
  const pop = page.getByRole('dialog', { name: 'Pick 2 trainers' })
  await expect(pop.getByRole('button', { name: /, Lv\.70$/ })).toHaveCount(4)
})

test('a Mega raid is locked until its Pokémon is caught, and gives its gem instead of a catch', async ({
  page,
}) => {
  await boot(page, kantoSave({ raidRulesSeen: true }))
  await page.goto(`/raid/${areaId('Cerulean Cave')}/10043`)
  await expect(page.getByRole('heading', { level: 1, name: 'Mega raid' })).toBeVisible()
  await expect(page.getByText('Catch Mewtwo first')).toBeVisible()
  await expect(page.getByText(/Win it to get the Mewtwonite X/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start the raid' })).toHaveCount(0)
})
