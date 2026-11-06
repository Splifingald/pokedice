// Nicknames: on one of your Pokémon's sheets, a tap on its name opens a small dialog that gives it one. The sheet and
// the team then call it by it, the species still under the name; it can be changed, and left empty it goes away.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FAST, makeSave, mockSupabase, nonJerseyText } from './helpers'

test.use({ viewport: { width: 360, height: 640 } })

async function boot(page: Page) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.settings', f!)
    },
    [JSON.stringify(makeSave(4)), FAST],
  )
}

const kept = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pokedice.save') ?? '{}').box?.[0]?.nickname ?? null)

async function rename(page: Page, from: string, to: string) {
  await page.getByRole('dialog', { name: from }).getByRole('button', { name: from, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nickname' })
  const field = dialog.getByRole('textbox', { name: 'Nickname for Charmander' })
  await expect(field).toBeFocused()
  await field.fill(to)
  await dialog.getByRole('button', { name: 'SAVE' }).click()
  await expect(dialog).toHaveCount(0)
}

test('a tap on its name gives a Pokémon a nickname, which its sheet and the team show', async ({ page }) => {
  await boot(page)
  await page.goto('/team')
  // The team's card (the banner over it lists the same Pokémon for screen readers, first): the last match.
  await page.getByRole('button', { name: /^Charmander/ }).last().click()
  const sheet = page.getByRole('dialog', { name: 'Charmander' })
  await expect(sheet).toBeVisible()

  // The dialog: an empty field with the species as its hint, at most 12 characters, on a phone.
  await sheet.getByRole('button', { name: 'Charmander', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nickname' })
  const field = dialog.getByRole('textbox', { name: 'Nickname for Charmander' })
  await expect(field).toHaveValue('')
  await expect(field).toHaveAttribute('placeholder', 'Charmander')
  await field.fill('ABCDEFGHIJKLMNOP')
  await expect(field).toHaveValue('ABCDEFGHIJKL')
  await expect(dialog.getByText('12/12')).toBeVisible()
  // Every control of the dialog, and the name that opened it, is a 44px target on a phone.
  for (const control of [
    sheet.getByRole('button', { name: 'Charmander', exact: true }),
    field,
    dialog.getByRole('button', { name: 'CANCEL' }),
    dialog.getByRole('button', { name: 'SAVE' }),
  ]) {
    const box = (await control.boundingBox())!
    expect(
      Math.min(box.width, box.height),
      await control.evaluate((el) => el.outerHTML.slice(0, 60)),
    ).toBeGreaterThanOrEqual(44)
  }
  expect(await nonJerseyText(page)).toEqual([])
  // Cancel keeps it as it was; Esc closes the dialog, not the sheet.
  await dialog.getByRole('button', { name: 'CANCEL' }).click()
  await expect(dialog).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Charmander', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Nickname' })).toHaveCount(0)
  await expect(sheet).toBeVisible()
  expect(await kept(page)).toBeNull()

  // Named: the sheet goes by it, the species leads the line under it, and the save keeps it, trimmed.
  await rename(page, 'Charmander', '  Blaze  ')
  const named = page.getByRole('dialog', { name: 'Blaze' })
  await expect(named.getByText(/^Charmander · #004 · Lv\.\d+ · Lead$/)).toBeVisible()
  await expect(page.getByText('Charmander is now called Blaze!')).toBeVisible()
  await expect.poll(() => kept(page)).toBe('Blaze')

  // The team card calls it by it too.
  await page.keyboard.press('Escape')
  await expect(named).toHaveCount(0)
  // The team's card (the banner over it lists the same Pokémon for screen readers, first): the last match.
  const card = page.getByRole('button', { name: /^Blaze, Lv\./ }).last()
  await expect(card).toBeVisible()

  // Changed, then taken away: empty means its species' name again.
  await card.click()
  await rename(page, 'Blaze', 'Ember')
  await expect.poll(() => kept(page)).toBe('Ember')
  await rename(page, 'Ember', '')
  await expect(page.getByRole('dialog', { name: 'Charmander' })).toBeVisible()
  await expect(page.getByText('Ember is called Charmander again.')).toBeVisible()
  await expect.poll(() => kept(page)).toBeNull()
})

test('dusk: the nicknamed sheet and the dialog keep their contrast', async ({ page }) => {
  await mockSupabase(page)
  const base = makeSave(4)
  const save = {
    ...base,
    box: base.box.map((p, i) => (i === 0 ? { ...p, nickname: 'Blaze' } : p)),
    settings: { ...base.settings, ...JSON.parse(FAST), theme: 'dark' },
  }
  await page.addInitScript((s) => localStorage.setItem('pokedice.save', s), JSON.stringify(save))
  await page.goto('/team')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // The team's card (the banner over it lists the same Pokémon for screen readers, first): the last match.
  await page.getByRole('button', { name: /^Blaze, Lv\./ }).last().click()
  const sheet = page.getByRole('dialog', { name: 'Blaze' })
  await expect(sheet.getByText(/^Charmander · #004/)).toBeVisible()
  const contrast = async () =>
    (await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations.flatMap((v) =>
      v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message}`),
    )
  expect(await contrast()).toEqual([])
  await sheet.getByRole('button', { name: 'Blaze', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Nickname' }).getByRole('textbox')).toHaveValue('Blaze')
  await page.waitForTimeout(300)
  expect(await contrast()).toEqual([])
})
