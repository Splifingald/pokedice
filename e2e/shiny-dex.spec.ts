// The shiny Pokédex (docs/39) against the mocked Supabase, on a phone: switched off, the Pokédex has one page; on, with
// the League beaten, its rules pop up once (Let's go! opens the shiny page), a shiny owned is starred and counted, a
// species caught but never shiny is a silhouette, and INFO shows the rules again.
import { expect, test, type Page } from '@playwright/test'
import { EVENT_IDS, getRegion, progressOf, regionOf, type SaveData } from '../src/engine'
import { EVENTS_ON, FAST, fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY } from './helpers'

const SHINY_ON = { ...EVENTS_ON, shinyDex: { access: 'all' } }

/** Kanto's League beaten, with everything else a League opens already read, a shiny Pidgey and a plain Rattata. */
function champion(patch: Partial<SaveData> = {}): SaveData {
  const s = makeSave(4, { player: { name: 'Sam', character: 'red' } })
  const league = getRegion(gameData(), regionOf(s))!.leagueAreaId
  const mon = (id: string, dex: number, shiny: boolean) => ({
    id,
    dex,
    level: 20,
    xp: 0,
    currentHp: 50,
    caughtAt: 0,
    ...(shiny && { shiny }),
  })
  return {
    ...s,
    settings: { ...s.settings, ...JSON.parse(FAST) },
    box: [...s.box, mon('p1', 16, true), mon('r1', 19, false)],
    pokedex: [...s.pokedex, 16, 19],
    areaProgress: { ...s.areaProgress, [league]: { ...progressOf(s, league), cleared: true } },
    regionOfferSeen: ['johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'],
    events: { seen: [...EVENT_IDS] },
    extremeRulesSeen: true,
    ...patch,
  }
}

async function boot(page: Page, save: SaveData, config: object = SHINY_ON) {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSupabase(page)
  await page.addInitScript(
    ([key, sess, s, cfg]) => {
      localStorage.setItem(key!, sess!)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.devConfig', cfg!)
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), JSON.stringify(config)],
  )
}

test('switched off, the Pokédex has one page and nothing pops up', async ({ page }) => {
  await boot(page, champion(), EVENTS_ON)
  await page.goto('/home')
  await page.waitForTimeout(600)
  await expect(page.getByRole('dialog', { name: 'Shiny Pokédex' })).toHaveCount(0)
  await page.goto('/pokedex?view=shiny')
  await expect(page.getByRole('radiogroup', { name: 'Which Pokédex' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Shiny Pokédex/ })).toHaveCount(0)
})

test('the rules once, Let’s go! to the shiny page, a shiny counted, INFO again', async ({ page }) => {
  await boot(page, champion())
  await page.goto('/home')
  const rules = page.getByRole('dialog', { name: 'Shiny Pokédex' })
  await expect(rules).toBeVisible()
  await expect(rules).toContainText('A page for shinies')
  await expect(rules).toContainText('1 in')
  await rules.getByRole('button', { name: /Let's go/i }).click()
  await expect(page).toHaveURL(/\/pokedex\?view=shiny/)
  await expect(
    page.getByRole('radiogroup', { name: 'Which Pokédex' }).getByRole('radio', { name: 'Shiny' }),
  ).toHaveAttribute('aria-checked', 'true')

  // Pidgey owned shiny: starred and counted. Rattata caught, never shiny: a silhouette with its name.
  await expect(page.getByRole('button', { name: /^Pidgey, #016, Shiny/ })).toBeVisible()
  await expect(
    page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'Shiny 1' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: /^1 of \d+ owned shiny$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Rattata, #019/ })).not.toContainText('Shiny')

  // The Pokédex page counts every catch.
  await page
    .getByRole('radiogroup', { name: 'Which Pokédex' })
    .getByRole('radio', { name: 'Pokédex' })
    .click()
  await expect(page).toHaveURL(/\/pokedex$/)
  await expect(page.getByRole('img', { name: /caught$/ })).toBeVisible()

  await page.getByRole('button', { name: /Shiny Pokédex/ }).click()
  await expect(page.getByRole('dialog', { name: 'Shiny Pokédex' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Shiny Pokédex' })
    .getByRole('button', { name: 'OK', exact: true })
    .click()
  // Seen: not again on Home.
  await page.goto('/home')
  await page.waitForTimeout(600)
  await expect(page.getByRole('dialog', { name: 'Shiny Pokédex' })).toHaveCount(0)
})

test('before the League, the Pokédex has one page', async ({ page }) => {
  const s = champion()
  const league = getRegion(gameData(), regionOf(s))!.leagueAreaId
  await boot(page, {
    ...s,
    areaProgress: { ...s.areaProgress, [league]: { ...progressOf(s, league), cleared: false } },
  })
  await page.goto('/pokedex')
  await expect(page.getByRole('heading', { name: /Pokédex/ })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Which Pokédex' })).toHaveCount(0)
})
