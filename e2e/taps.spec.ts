// Taps, haptics and music (docs/38 §5). A PixelButton is heard once a press, as the finger lands (and from the
// keyboard); Settings' Battle music and Vibration rows keep what the player picks; the battle music plays under a
// fight, pauses in a hidden tab, and stops with its switch.
// Every 8-bit note is an oscillator: the page counts them.
import { expect, test, type Page } from '@playwright/test'
import { EVENTS_ON, makeSave, mockSupabase } from './helpers'

async function boot(page: Page) {
  await page.setViewportSize({ width: 360, height: 640 })
  await mockSupabase(page)
  const base = makeSave(4)
  const save = { ...base, settings: { ...base.settings, sound: true, sfx: true, reducedMotion: true } }
  const config = JSON.stringify(EVENTS_ON)
  await page.addInitScript(
    ([s, c]) => {
      // Once: a reload keeps what the page saved.
      if (!localStorage.getItem('pokedice.save')) localStorage.setItem('pokedice.save', s!)
      localStorage.setItem('pokedice.devConfig', c!)
      // Prof. Oak's share prompt would cover the screen.
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
      const w = window as unknown as { notes: number }
      w.notes = 0
      const make = AudioContext.prototype.createOscillator
      AudioContext.prototype.createOscillator = function (this: AudioContext) {
        w.notes++
        return make.call(this)
      }
    },
    [JSON.stringify(save), config],
  )
}

const notes = (page: Page) => page.evaluate(() => (window as unknown as { notes: number }).notes)

test('a PixelButton sounds as the finger lands, once a press, and from the keyboard', async ({ page }) => {
  await boot(page)
  // A quiet page: Settings' one Delete only asks what to delete.
  await page.goto('/settings')
  const button = page.getByRole('button', { name: 'Delete a save or my data', exact: true })
  const confirm = page.getByRole('dialog', { name: 'What do you want to delete?' })
  await button.scrollIntoViewIfNeeded()
  await button.hover()
  const before = await notes(page)
  await page.mouse.down()
  // Pressed and heard before the release.
  await expect(button).toHaveAttribute('data-down', '')
  expect(await notes(page)).toBe(before + 1)
  await page.mouse.up()
  await expect(button).not.toHaveAttribute('data-down', '')
  // The click acts, and plays nothing more.
  await expect(confirm).toBeVisible()
  expect(await notes(page)).toBe(before + 1)
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  // A keyboard's press has no pointer: its click plays the sound.
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(confirm).toBeVisible()
  expect(await notes(page)).toBe(before + 2)
})

test('Settings: the music, its volume and the vibrations, kept after a reload', async ({ page }) => {
  await boot(page)
  await page.goto('/settings')
  const music = page.getByRole('switch', { name: /^Battle music/ })
  const volume = page.getByRole('radiogroup', { name: 'Music volume' })
  const vibration = page.getByRole('switch', { name: /^Vibration/ })
  await expect(music).toBeChecked()
  await expect(volume.getByRole('radio', { name: 'Medium' })).toBeChecked()
  await expect(vibration).toBeChecked()

  // The volume: a tap, then the arrow keys.
  await volume.getByRole('radio', { name: 'Low' }).click()
  await expect(volume.getByRole('radio', { name: 'Low' })).toBeChecked()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(volume.getByRole('radio', { name: 'High' })).toBeChecked()
  await vibration.click()
  await expect(vibration).not.toBeChecked()
  await music.click()
  await expect(music).not.toBeChecked()
  await expect(volume).toHaveCount(0)

  await page.reload()
  await expect(music).not.toBeChecked()
  await expect(vibration).not.toBeChecked()
  await music.click()
  await expect(volume.getByRole('radio', { name: 'High' })).toBeChecked()
})

const attack = (page: Page) => page.getByRole('button', { name: 'ATTACK', exact: true })

async function toBattle(page: Page) {
  await page.goto('/home')
  const healing = page.getByRole('dialog', { name: 'Healing…' })
  const ready = async () =>
    (await attack(page)
      .isVisible()
      .catch(() => false)) && (await attack(page).isEnabled())
  for (let i = 0; i < 150 && !(await ready()); i++) {
    if (await healing.isVisible().catch(() => false)) {
      await healing.getByRole('button', { name: 'SKIP ▸▸' }).click()
      continue
    }
    for (const name of ['FIGHT', 'EXPLORE', 'ENTER', 'PICK IT UP', 'CONTINUE', 'SKIP TURN']) {
      const b = page.getByRole('button', { name, exact: true }).first()
      if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
        await b.click()
        break
      }
    }
    await page.waitForTimeout(80)
  }
  await expect(attack(page)).toBeEnabled()
}

/** The notes heard over `ms`. */
async function heard(page: Page, ms: number) {
  const from = await notes(page)
  await page.waitForTimeout(ms)
  return (await notes(page)) - from
}

test('the battle music plays under a fight, pauses in a hidden tab, and stops with its switch', async ({
  page,
}) => {
  await boot(page)
  await toBattle(page)
  await page.waitForTimeout(500)
  // The loop's arpeggio alone is ten notes a second.
  expect(await heard(page, 1500)).toBeGreaterThan(5)

  const show = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  await show(true)
  await page.waitForTimeout(500)
  expect(await heard(page, 1000)).toBe(0)
  await show(false)
  await page.waitForTimeout(300)
  expect(await heard(page, 1000)).toBeGreaterThan(3)

  // Settings over the fight: Battle music off fades it out.
  await page.getByRole('button', { name: /trainer menu/i }).click()
  await page
    .getByRole('dialog', { name: 'Trainer card' })
    .getByRole('button', { name: 'Settings', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('switch', { name: /^Battle music/ }).click()
  await page.waitForTimeout(1000)
  expect(await heard(page, 1000)).toBe(0)
})
