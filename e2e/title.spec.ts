// The title (docs/38 §9): the word forms from eight thrown dice on a canvas, an <h1> named Pokédice, the tagline after
// the landing, a tap on the logo throws it again; the buttons still fit a 360×640 phone and work while the dice fly.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makeSave, mockSupabase, smallControls } from './helpers'

const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })
const MOTION_OFF = JSON.stringify({ sfx: false, sound: false, reducedMotion: true })

async function boot(page: Page, { save = true, settings = MOTION_ON } = {}) {
  await mockSupabase(page)
  await page.addInitScript(
    ([s, f]) => {
      if (s) localStorage.setItem('pokedice.save', s)
      localStorage.setItem('pokedice.settings', f!)
    },
    [save ? JSON.stringify(makeSave(4)) : '', settings],
  )
}

const logo = (page: Page) => page.getByRole('img', { name: 'Pokédice' })
const tagline = (page: Page) => page.getByText('Roll · Battle · Catch')

/** Opaque pixels on the logo's canvas, in the box over the resting logo (the throw's button) or all of it. */
function inked(page: Page, inBox = false) {
  return page.evaluate((box) => {
    const c = document.querySelector<HTMLCanvasElement>('canvas[role="img"]')!
    const r = c.getBoundingClientRect()
    const b = document
      .querySelector<HTMLElement>('button[aria-label="Throw the dice again"]')!
      .getBoundingClientRect()
    const k = c.width / r.width
    const [x, y, w, h] = box
      ? [(b.left - r.left) * k, (b.top - r.top) * k, b.width * k, b.height * k].map(Math.round)
      : [0, 0, c.width, c.height]
    const d = c.getContext('2d')!.getImageData(x!, y!, w!, h!).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, inBox)
}

test('a phone: the dice form the word, the tagline follows, and everything fits 360×640', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Pokédice' })).toBeVisible()
  await expect(logo(page)).toBeVisible()
  // Down, flashed and ringed: the tagline comes in last.
  await expect(tagline(page)).toHaveCSS('opacity', '1', { timeout: 6000 })
  expect(await inked(page, true)).toBeGreaterThan(20_000)

  for (const name of [/^Continue with /, /^NEW GAME$/, /^HOW TO PLAY$/]) {
    const box = (await page.getByRole('button', { name }).boundingBox())!
    expect(box.y + box.height, `${name} in view`).toBeLessThanOrEqual(640)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  // The footer's two links show in dev only (the deploy guide for the admin too): not the players' title.
  const small = (await smallControls(page)).filter((c) => !/^(Deployment guide|Kitchen sink) /.test(c))
  expect(small).toEqual([])
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([])

  // A tap on the logo throws it again: the word leaves its place, then comes back.
  const settled = await inked(page, true)
  await page.getByRole('button', { name: 'Throw the dice again' }).click()
  await expect.poll(() => inked(page, true), { timeout: 2000 }).toBeLessThan(settled / 2)
  await expect.poll(() => inked(page, true), { timeout: 6000 }).toBeGreaterThan(settled * 0.9)
})

test('NEW GAME works while the dice are still in the air', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await boot(page, { save: false })
  await page.goto('/')
  await expect(logo(page)).toBeVisible()
  // The canvas reaches over the buttons as the dice come in: it never takes a tap.
  await page.getByRole('button', { name: 'NEW GAME' }).click()
  await expect(page).toHaveURL(/\/new$/)
})

test('one row from 768 px; with animations off the logo is at rest at once', async ({ page }) => {
  await boot(page, { settings: MOTION_OFF })
  await page.goto('/')
  await expect(tagline(page)).toHaveCSS('opacity', '1')
  await expect.poll(() => inked(page, true)).toBeGreaterThan(25_000)
  const box = (await page.getByRole('button', { name: 'Throw the dice again' }).boundingBox())!
  // One row: much wider than tall.
  expect(box.width).toBeGreaterThan(box.height * 4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
})
