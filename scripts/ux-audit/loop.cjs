// The core loop, timed: Home → encounter → result → next encounter. Logs every tap with what was on screen.
// usage: node loop.cjs <outDir> <save> <width> <height> [motion: fast|full]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const SP = __dirname
const OUT = process.argv[2]
const SAVE = process.argv[3] || 'early'
const W = Number(process.argv[4] || 390)
const H = Number(process.argv[5] || 844)
const MOTION = process.argv[6] || 'fast'
const BASE = process.env.BASE || 'http://localhost:5180'
const saves = JSON.parse(fs.readFileSync(path.join(SP, 'saves.json'), 'utf8'))
fs.mkdirSync(OUT, { recursive: true })

// What a player presses, by priority. Decisions: dice/roll/attack, picking a mon, catching. Others: non-decisions.
const DECISION = /^(Send out|Throw|ROLL|THROW|ATTACK|REROLL|LAST REROLL|GO!?|Poké Ball|Great Ball|Ultra Ball)/i
const PRESS = [/^Send out/i, /^Throw/i, /^CONTINUE/i, /^GO!?$/i, /^FIGHT/i, /^ATTACK/i, /^ROLL/i, /^THROW/i, /Poké Ball/, /^CATCH/i, /^NEXT/i, /^Next/, /^LET'S GO/i, /^OK$/i, /^GOT IT/i, /^KEEP/i, /^SKIP/i]

;(async () => {
  const browser = await chromium.launch()
  const phone = W < 768
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: phone, isMobile: phone })
  const page = await ctx.newPage()
  await page.route('http://127.0.0.1:54399/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  const settings = MOTION === 'fast' ? { sfx: false, sound: false, reducedMotion: true } : { sfx: false, sound: false }
  await page.addInitScript(
    ([s, f]) => {
      localStorage.setItem('pokedice.save', s)
      localStorage.setItem('pokedice.settings', f)
      localStorage.setItem('pokedice.sharePrompt.kanto', '1')
    },
    [JSON.stringify(saves[SAVE]), JSON.stringify(settings)],
  )
  await page.goto(BASE + '/home')
  await page.waitForTimeout(1500)
  const t0 = Date.now()
  const log = []
  let encounters = 0
  let shot = 0
  let lastUrl = ''
  let stall = 0
  for (let step = 0; step < 3000 && Date.now() - t0 < 240_000; step++) {
    const names = await page
      .locator('button:visible, a:visible')
      .evaluateAll((els) =>
        els.filter((e) => !e.closest('[inert]') && !e.disabled && e.getAttribute('aria-disabled') !== 'true').map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ')),
      )
    // Dice: a battle with dice: press the attack (one decision per turn) — the shape of a typical player.
    let pick = null
    for (const re of PRESS) {
      pick = names.find((n) => re.test(n))
      if (pick) break
    }
    if (!pick) {
      stall++
      if (stall === 16) {
        log.push(`STALL: ${names.slice(0, 30).join(' | ')}`)
        await page.screenshot({ path: path.join(OUT, `loop-${SAVE}-${W}-stall-${step}.png`) })
      }
      await page.waitForTimeout(250)
      continue
    }
    stall = 0
    if (shot < 30) {
      await page.screenshot({ path: path.join(OUT, `loop-${SAVE}-${W}-${String(shot++).padStart(2, '0')}.png`) })
    }
    const at = ((Date.now() - t0) / 1000).toFixed(1)
    const kind = DECISION.test(pick) ? 'decision' : 'other'
    log.push(`${at}s ${kind.padEnd(8)} ${pick.slice(0, 50)}  [url ${page.url().replace(BASE, '')}]`)
    try {
      await page.locator('button:visible, a:visible').filter({ hasText: pick.slice(0, 20) }).first().click({ timeout: 3000 })
    } catch {
      try {
        await page.getByRole('button', { name: pick }).first().click({ timeout: 2000 })
      } catch {}
    }
    if (/^CONTINUE/i.test(pick)) {
      encounters++
      if (encounters > 2) break
    }
    await page.waitForTimeout(350)
  }
  fs.writeFileSync(path.join(OUT, `loop-${SAVE}-${W}.txt`), log.join('\n'))
  console.log(log.join('\n'))
  await browser.close()
})()
