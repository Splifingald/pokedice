// Renders design/og-image/index.html to public/og-image.png (1200×630) with Playwright's Chromium.
import { chromium } from '@playwright/test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const here = import.meta.dirname
const out = process.argv[2] ?? path.join(here, '..', '..', 'public', 'og-image.png')
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(path.join(here, 'index.html')).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out })
await browser.close()
console.log(`wrote ${out}`)
