// Records the promo hero clip: one real battle turn (src/dev/heroDemo.ts), played by the game on the dev server's
// /__demo/hero harness, captured frame by frame and encoded with ffmpeg.
//
//   pnpm promo:hero [--seed 3494] [--only mobile|desktop] [--fps 60] [--keep-frames] [--url http://localhost:5173]
//                   [--chromium /path/to/chrome]
//
// Time is stepped, not sampled: Playwright's clock holds every timer, requestAnimationFrame and performance.now, the
// CDP Animation domain freezes the document timeline (CSS and Web Animations), and the compositor only makes a frame
// when asked (HeadlessExperimental.beginFrame, which also times the animated sprites). Each frame the script moves all
// three forward by exactly 1/fps and takes that frame's picture. The video is smooth whatever the machine's speed, and
// plays at the game's real pace. It needs Chromium's headless shell (Playwright's default headless browser).
//
// Writes promo/hero-4x5.mp4 (1080×1350), promo/hero-16x9.mp4 (1920×1080) and promo/og-image.png (1200×630).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type CDPSession, type Locator } from '@playwright/test'
import { BUNDLE } from '@/config/bundle'
import { compileGameData } from '@/engine'
import { HERO_DEFAULTS, heroQuery } from '@/dev/heroDemo'
import { planFor, type HeroPlan } from './find-hero-seed'

/** The seed scripts/find-hero-seed.ts ranked first for the default scenario. */
const HERO_SEED = 3494

interface Format {
  name: 'mobile' | 'desktop'
  out: string
  /** CSS pixels and device pixel ratio: the frame is exactly width × dpr by height × dpr. */
  width: number
  height: number
  dpr: number
  touch: boolean
}

// The mobile layout needs 720 CSS px of height to show the whole battle (stage, tray, actions, team): 360×450 would cut
// the actions off, so the 4:5 phone is 576×720 (still the one-column layout, under the 768 px breakpoint).
const FORMATS: Format[] = [
  { name: 'mobile', out: 'hero-4x5.mp4', width: 576, height: 720, dpr: 1080 / 576, touch: true },
  { name: 'desktop', out: 'hero-16x9.mp4', width: 1280, height: 720, dpr: 1.5, touch: false },
]

/** Human pauses between actions, in ms of game time. */
const PAUSE = { firstLook: 650, betweenDice: 600, beforeReroll: 650, readCombo: 900 }
/** The clip opens this long before the dice are thrown, and holds the victory this long. */
const LEAD_IN_MS = 800
const HOLD_MS = 2600
const MAX_MS = 12_000

/**
 * The Open Graph still: on desktop, at the hit's peak (the SUPER EFFECTIVE! banner, the damage number, the HP bar
 * draining, "FULL HOUSE!" in the message and the five dice under it), the battle column and a little either side,
 * rendered by the browser at the size it is used at.
 */
const OG = { width: 1200, height: 630, afterAttackMs: 1880, clip: { x: 0, y: 12, width: 1280 } }

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return null
  const v = process.argv[i + 1]
  return v == null || v.startsWith('--') ? '' : v
}

async function startServer(): Promise<{ url: string; stop: () => void }> {
  const given = arg('url')
  if (given) return { url: given.replace(/\/$/, ''), stop: () => {} }
  const port = 5197
  // Offline: no Supabase, so the content is the bundle the seed finder plays (and no remote config mid-take).
  const child: ChildProcess = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    stdio: 'ignore',
  })
  const url = `http://localhost:${port}`
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill() }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  child.kill()
  throw new Error('The dev server did not start')
}

// Runs in the page (as a string: tsx's helpers don't exist there). Every CSS animation, transition and Web Animation
// moves `dt` ms forward on the frozen timeline. One first seen this frame starts from 0: framer-motion stamps its own
// with its (faked) clock, the CSS ones carry the frozen timeline's, so their raw times don't share a zero.
const STEP_ANIMATIONS = `(dt) => {
  const seen = (window.__heroSeen ||= new WeakSet())
  for (const a of document.getAnimations()) {
    if (a.playState === 'paused' || a.playState === 'idle') continue
    if (!seen.has(a)) {
      seen.add(a)
      a.currentTime = 0
      continue
    }
    if (a.playState === 'finished') continue
    a.currentTime = (a.currentTime ?? 0) + dt * a.playbackRate
  }
}`

// React renders from MessageChannel tasks (not faked): a few round trips let what the timers set off reach the DOM.
const SETTLE = `new Promise((done) => {
  let n = 0
  const c = new MessageChannel()
  c.port1.onmessage = () => (++n < 4 ? c.port2.postMessage(0) : done())
  c.port2.postMessage(0)
})`

const PROBE = `(() => {
  const g = window.__heroDemo && window.__heroDemo.state()
  const b = g && g.battle
  const btn = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'ATTACK')
  return {
    phase: b ? b.state.phase : null,
    log: b ? b.log.map((e) => ({ kind: e.kind, dice: e.dice ? e.dice.map((d) => d.faceIndex) : undefined, amount: e.amount })) : [],
    run: g ? g.run.phase : null,
    canAttack: !!btn && !btn.disabled,
    victory: [...document.querySelectorAll('h2')].some((h) => h.textContent.trim() === 'VICTORY!' || /^victory/i.test(h.textContent.trim())),
  }
})()`

interface Probe {
  phase: string | null
  log: { kind: string; dice?: number[]; amount?: number }[]
  run: string | null
  canAttack: boolean
  victory: boolean
}

/** Where to press: the middle of the element (a box read straight off the page, no waiting on frames). */
async function centre(target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error('Nothing to press')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function record(
  url: string,
  f: Format,
  plan: HeroPlan,
  fps: number,
  dir: string,
  ogOut: string | null,
) {
  // --chromium (or PW_CHROMIUM) for a browser other than Playwright's own: it must be a headless shell, the only build
  // that lets the script make the compositor's frames.
  const executablePath = arg('chromium') || process.env.PW_CHROMIUM || undefined
  const browser = await chromium.launch({
    executablePath,
    args: [
      // Frames only when the script asks (HeadlessExperimental.beginFrame), at the frame time it gives: the animated
      // Showdown sprites (GIFs) advance on that clock, the one thing Playwright's clock and the timeline freeze miss.
      '--deterministic-mode',
      '--enable-begin-frame-control',
      // The real pixel ratio, not an emulated one: the frames then come back at device size.
      `--force-device-scale-factor=${f.dpr}`,
      '--disable-component-update',
      '--no-default-browser-check',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: f.width, height: f.height },
    hasTouch: f.touch,
    reducedMotion: 'no-preference',
    colorScheme: 'light',
    locale: 'en-US',
  })
  // A page under frame control has to be opened that way, through the browser's Target domain.
  const opener = await context.newPage()
  const { targetInfo } = await (await context.newCDPSession(opener)).send('Target.getTargetInfo')
  const opened = context.waitForEvent('page')
  await (
    await browser.newBrowserCDPSession()
  ).send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: targetInfo.browserContextId,
    enableBeginFrameControl: true,
  })
  const page = await opened
  await opener.close()
  page.on('pageerror', (e) => console.warn(`[${f.name}] page error: ${e.message}`))
  const cdp: CDPSession = await context.newCDPSession(page)

  const step = 1000 / fps
  // The compositor's clock, in ms. Each recorded frame moves it on by exactly one frame; the frames made while the
  // script waits on the page (loading, a tap) move it a hundredth of a millisecond.
  let ticks = 1000
  const beginFrame = (advance: number, shot: boolean) => {
    ticks += advance
    return cdp.send('HeadlessExperimental.beginFrame', {
      frameTimeTicks: ticks,
      interval: step,
      ...(shot && { screenshot: { format: 'png' as const } }),
    })
  }
  // Nothing renders (so nothing loads, lays out or answers a tap) until a frame is made: frames while `work` runs.
  const pumped = async <T>(work: Promise<T>): Promise<T> => {
    let done = false
    const settled = work.finally(() => (done = true))
    while (!done) {
      await beginFrame(0.01, false)
      await sleep(5)
    }
    return settled
  }

  // A fixed date: nothing date-bound (events, day and night) changes between takes.
  const t0 = new Date('2026-06-15T12:00:00Z')
  await page.clock.install({ time: t0 })
  await page.clock.pauseAt(t0)
  await pumped(page.goto(`${url}/__demo/hero?${heroQuery({ ...HERO_DEFAULTS, seed: plan.seed })}`))
  await pumped(page.waitForURL('**/area'))
  await pumped(
    page.waitForFunction('!!window.__heroDemo && !!document.querySelector("canvas")', null, { polling: 50 }),
  )
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
  // Fonts and every sprite in before the first frame (the stage draws its sprites from images it loads itself).
  await pumped(page.evaluate('document.fonts.ready'))
  await pumped(page.waitForLoadState('networkidle'))
  await pumped(page.waitForFunction('[...document.images].every((i) => i.complete)', null, { polling: 50 }))
  const press = (at: { x: number; y: number }) =>
    pumped(
      (async () => {
        if (f.touch) return page.touchscreen.tap(at.x, at.y)
        await page.mouse.click(at.x, at.y)
        // No pointer resting on what was pressed: its hover look isn't part of the shot.
        await page.mouse.move(f.width - 2, 2)
      })(),
    )
  let last = (await beginFrame(0.01, true)).screenshotData

  let frame = 0
  let virtual = 0
  const shots: string[] = []
  const marks: Record<string, number> = {}
  let next: { at: number; act: () => Promise<void>; name: string } | null = null
  let stage = 'roll'
  const dice = () => page.getByRole('group', { name: 'Your dice' }).getByRole('button')
  const button = (name: RegExp) => page.getByRole('button', { name })

  for (; frame < fps * 30; frame++) {
    // One frame of game time.
    const target = Math.round((frame + 1) * step)
    await page.clock.runFor(target - virtual)
    await page.evaluate(`(${STEP_ANIMATIONS})(${target - virtual})`)
    virtual = target
    await page.evaluate(SETTLE)
    // The frame, at its exact time. One where nothing changed comes back without a picture: the last one stands.
    last = (await beginFrame(step, true)).screenshotData ?? last
    if (!last) throw new Error(`[${f.name}] no picture for frame ${frame}`)
    const file = join(dir, `${String(frame).padStart(5, '0')}.png`)
    writeFileSync(file, Buffer.from(last, 'base64'))
    shots.push(file)

    const p = (await page.evaluate(PROBE)) as Probe
    const has = (k: string) => p.log.some((e) => e.kind === k)
    if (stage === 'roll' && has('roll')) {
      marks.roll = frame
      stage = 'ready'
    }
    if (stage === 'ready' && p.canAttack) {
      marks.ready = frame
      stage = 'select'
      const [i, j] = plan.reroll
      next = {
        name: `die ${i + 1}`,
        at: frame + Math.round(PAUSE.firstLook / step),
        act: async () => {
          await press(await centre(dice().nth(i)))
          next = {
            name: `die ${j + 1}`,
            at: frame + Math.round(PAUSE.betweenDice / step),
            act: async () => {
              await press(await centre(dice().nth(j)))
              next = {
                name: 'REROLL',
                at: frame + Math.round(PAUSE.beforeReroll / step),
                act: async () => {
                  await press(await centre(button(/^REROLL/)))
                  marks.reroll = frame
                  stage = 'rerolled'
                  next = null
                },
              }
            },
          }
        },
      }
    }
    if (stage === 'rerolled' && has('reroll') && p.canAttack) {
      marks.combo = frame
      stage = 'attack'
      next = {
        name: 'ATTACK',
        at: frame + Math.round(PAUSE.readCombo / step),
        act: async () => {
          await press(await centre(button(/^ATTACK$/)))
          marks.attack = frame
          stage = 'hit'
          next = null
        },
      }
    }
    if (stage === 'hit' && has('damage') && marks.damage == null) marks.damage = frame
    if (stage === 'hit' && has('faint') && marks.faint == null) marks.faint = frame
    if (stage === 'hit' && p.victory) {
      marks.victory = frame
      stage = 'hold'
    }
    if (stage === 'hold' && frame >= marks.victory! + Math.round(HOLD_MS / step)) break
    if (next && frame >= next.at) {
      const n = next
      next = null
      await n.act()
    }
    if (ogOut && marks.attack != null && frame === marks.attack + Math.round(OG.afterAttackMs / step)) {
      const { x, y, width } = OG.clip
      // The clip's scale counts on top of the pixel ratio.
      const og = await pumped(
        cdp.send('Page.captureScreenshot', {
          format: 'png',
          clip: { x, y, width, height: (width * OG.height) / OG.width, scale: OG.width / width / f.dpr },
        }),
      )
      writeFileSync(ogOut, Buffer.from(og.data, 'base64'))
    }
  }
  if (stage !== 'hold') throw new Error(`[${f.name}] the turn stopped at "${stage}" (frame ${frame})`)

  // The dice the game threw must be the finder's: the harness and the engine agree on the seed.
  const end = (await page.evaluate(PROBE)) as Probe
  const rolls = end.log.filter((e) => e.kind === 'roll' || e.kind === 'reroll')
  const facesOf = (v: number[] | undefined) => (v ?? []).join(',')
  const damage = end.log.find((e) => e.kind === 'damage')
  if (end.phase !== 'won' || damage?.amount !== plan.damage)
    throw new Error(`[${f.name}] expected a ${plan.damage}-damage K.O., got ${damage?.amount} (${end.phase})`)
  console.log(
    `[${f.name}] rolls ${rolls.map((r) => `[${facesOf(r.dice)}]`).join(' → ')}, ${damage.amount} damage, won`,
  )
  console.log(`[${f.name}] frames: ${JSON.stringify(marks)}`)

  await browser.close()
  return { shots, marks }
}

function encode(shots: string[], first: number, count: number, fps: number, out: string) {
  const list = join(shots[0]!, '..', 'list.txt')
  writeFileSync(
    list,
    shots
      .slice(first, first + count)
      .map((s) => `file '${s}'\nduration ${1 / fps}`)
      .join('\n'),
  )
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-r',
      String(fps),
      '-i',
      list,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      // No resize happens (the frames are captured at the final size); any conversion stays nearest-neighbour.
      '-sws_flags',
      'neighbor',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-r',
      String(fps),
      '-movflags',
      '+faststart',
      out,
    ],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${out}`)
}

async function main() {
  const seed = Number(arg('seed') || HERO_SEED)
  const fps = Number(arg('fps') || 60)
  const only = arg('only')
  const data = compileGameData(BUNDLE)
  const plan = planFor(data, { ...HERO_DEFAULTS, seed })
  if (!plan) throw new Error(`Seed ${seed} doesn't play the clip: pnpm exec tsx scripts/find-hero-seed.ts`)
  console.log(
    `seed ${seed}: [${plan.first}] → reroll dice ${plan.reroll.map((k) => k + 1).join('+')} → [${plan.final}], ` +
      `${plan.damage} damage vs ${plan.foeHp} HP`,
  )
  const outDir = resolve('promo')
  mkdirSync(outDir, { recursive: true })
  const server = await startServer()
  try {
    for (const f of FORMATS) {
      if (only && only !== f.name) continue
      const dir = mkdtempSync(join(tmpdir(), `hero-${f.name}-`))
      const og = f.name === 'desktop' ? join(outDir, 'og-image.png') : null
      const { shots, marks } = await record(server.url, f, plan, fps, dir, og)
      const first = Math.max(0, marks.roll! - Math.round((LEAD_IN_MS * fps) / 1000))
      const last = Math.min(shots.length - 1, first + Math.round((MAX_MS * fps) / 1000) - 1)
      const out = join(outDir, f.out)
      encode(shots, first, last - first + 1, fps, out)
      console.log(
        `[${f.name}] ${out}: ${((last - first + 1) / fps).toFixed(2)} s, ${(statSync(out).size / 1e6).toFixed(1)} MB`,
      )
      if (og) console.log(`[${f.name}] ${og}: ${OG.width}×${OG.height}`)
      if (arg('keep-frames') != null) console.log(`[${f.name}] frames kept in ${dir}`)
      else rmSync(dir, { recursive: true, force: true })
    }
  } finally {
    server.stop()
  }
}

await main()
