// Screen audit: every route × save × size → a screenshot and the metrics docs/43 asks for.
// usage: node tour.cjs <outDir> [label] [routesFilter]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { default: AxeBuilder } = require('/home/user/pokedice/node_modules/@axe-core/playwright')

const SP = __dirname
const OUT = process.argv[2] || path.join(SP, 'before')
const FILTER = process.argv[3] ? new RegExp(process.argv[3]) : null
const BASE = process.env.BASE || 'http://localhost:5180'
const saves = JSON.parse(fs.readFileSync(path.join(SP, 'saves.json'), 'utf8'))
fs.mkdirSync(OUT, { recursive: true })

const EVENTS_ON = JSON.parse(fs.readFileSync(path.join(SP, 'events-on.json'), 'utf8'))
const FAST = JSON.stringify({ sfx: false, sound: false, reducedMotion: true })
const SIZES = [
  { name: 'p390', width: 390, height: 844, phone: true },
  { name: 'p360', width: 360, height: 640, phone: true },
  { name: 'pc', width: 1440, height: 900, phone: false },
]

// [id, save, route, optional action]
const SCREENS = [
  ['title', 'mid', '/'],
  ['home-fresh', 'fresh', '/home'],
  ['home-mid', 'mid', '/home'],
  ['home-late', 'late', '/home'],
  ['areas-sheet', 'mid', '/home', async (p) => p.getByRole('button', { name: /^AREAS/i }).first().click()],
  ['area-details', 'mid', '/home', async (p) => p.locator('[data-area-plate], button:has-text("Lv.")').first().click()],
  ['trainer-menu', 'mid', '/home', async (p) => p.getByRole('button', { name: 'Your trainer menu' }).click()],
  ['team-mid', 'mid', '/team'],
  ['team-late', 'late', '/team'],
  ['mon-sheet', 'mid', '/team', async (p) => p.locator('main button').filter({ hasText: /Lv/ }).first().click()],
  ['shop-mid', 'mid', '/shop'],
  ['upgrades-mid', 'mid', '/upgrades'],
  ['upgrades-late', 'late', '/upgrades'],
  ['pokedex-mid', 'mid', '/pokedex'],
  ['pokedex-late', 'late', '/pokedex'],
  ['daycare-mid', 'mid', '/daycare'],
  ['friends', 'mid', '/friends'],
  ['trades', 'late', '/trades'],
  ['leaderboard', 'mid', '/leaderboard'],
  ['versus', 'late', '/versus'],
  ['settings', 'mid', '/settings'],
  ['wheel', 'late', '/events/wheel'],
  ['raid', 'late', '/events/raid'],
  ['rebattle', 'late', '/events/rebattle'],
  ['help', 'mid', '/help'],
]

async function metrics(page, phone) {
  return page.evaluate((phone) => {
    const vh = innerHeight
    const vis = (el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0'
    }
    const textEls = Array.from(document.querySelectorAll('body *')).filter(
      (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(el),
    )
    const small = textEls
      .map((el) => ({ el, fs: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((x) => x.fs < 16)
      .map((x) => `${Math.round(x.fs)}px "${x.el.textContent.trim().slice(0, 24)}"`)
    const controls = Array.from(document.querySelectorAll('a,button,input,select,summary,[role=button],[role=tab],[role=radio]')).filter(vis)
    const inView = controls.filter((el) => {
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < vh
    })
    const below = controls.filter((el) => el.getBoundingClientRect().top >= vh).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24))
    const tiny = phone
      ? controls
          .filter((el) => !(el.tagName === 'A' && el.closest('p')))
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width < 44 || r.height < 44)
          .map(({ el, r }) => `${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24)} ${Math.round(r.width)}×${Math.round(r.height)}`)
      : []
    const main = document.querySelector('main')
    const mr = main ? main.getBoundingClientRect() : null
    return {
      scrollH: document.documentElement.scrollHeight,
      vh,
      hscroll: document.documentElement.scrollWidth - innerWidth,
      smallText: [...new Set(small)].slice(0, 40),
      smallTextCount: small.length,
      controlsInView: inView.length,
      controlsTotal: controls.length,
      belowFold: below.slice(0, 30),
      tiny: tiny.slice(0, 30),
      mainWidth: mr ? Math.round(mr.width) : null,
      contentWidth: (() => {
        // widest direct content child of main
        if (!main) return null
        let w = 0
        for (const c of main.querySelectorAll(':scope > *')) w = Math.max(w, c.getBoundingClientRect().width)
        return Math.round(w)
      })(),
      h1: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent.trim()),
      dialogs: Array.from(document.querySelectorAll('[role=dialog]')).map((d) => d.getAttribute('aria-label') || d.querySelector('h2,h1')?.textContent || '?'),
    }
  }, phone)
}

;(async () => {
  const browser = await chromium.launch()
  const report = {}
  for (const size of SIZES) {
    for (const [id, saveKey, route, act] of SCREENS) {
      if (FILTER && !FILTER.test(id)) continue
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.phone, isMobile: size.phone, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      await page.route('http://127.0.0.1:54399/**', (r) => {
        const u = new URL(r.request().url())
        if (u.pathname === '/auth/v1/settings') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"external":{"google":true}}' })
        if (u.pathname.includes('event_time')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ now: new Date().toISOString(), day: new Date().toISOString().slice(0, 10) }) })
        return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      })
      await page.addInitScript(
        ([s, f, cfg]) => {
          localStorage.setItem('pokedice.save', s)
          localStorage.setItem('pokedice.settings', f)
          localStorage.setItem('pokedice.devConfig', cfg)
          localStorage.setItem('pokedice.sharePrompt.kanto', '1')
        },
        [JSON.stringify(saves[saveKey]), FAST, JSON.stringify(EVENTS_ON)],
      )
      const key = `${id}@${size.name}`
      try {
        await page.goto(BASE + route)
        await page.waitForTimeout(1500)
        // Close any one-time pop-up so the screen itself is audited (record it).
        const popups = await page.locator('[role=dialog]').evaluateAll((ds) => ds.map((d) => d.getAttribute('aria-label') || '?'))
        if (act) {
          await act(page)
          await page.waitForTimeout(900)
        }
        const m = await metrics(page, size.phone)
        let axe = []
        try {
          const r = await new AxeBuilder({ page }).analyze()
          axe = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0]?.target}`)
        } catch (e) {
          axe = ['axe failed ' + e.message.slice(0, 80)]
        }
        await page.screenshot({ path: path.join(OUT, `${key}.png`), fullPage: true })
        report[key] = { ...m, axe, popupsOnArrival: popups }
        process.stdout.write(`${key} ok\n`)
      } catch (e) {
        report[key] = { error: e.message.slice(0, 200) }
        process.stdout.write(`${key} ERR ${e.message.slice(0, 100)}\n`)
      }
      await ctx.close()
    }
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1))
  await browser.close()
})()
