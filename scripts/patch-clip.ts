// Records the short clips a patch note's video is cut from (patch-notes/README.md): each segment below is a page of
// the game played frame by frame, on the dev server, against the e2e tests' fake Supabase (e2e/helpers.ts).
//
//   pnpm exec tsx scripts/patch-clip.ts [--only <segment>] [--fps 60] [--out <dir>]
//
// Time is stepped, not sampled, as in the promo recorder (promo/hero-clip's scripts/record-hero.ts): Playwright's clock
// holds every timer, requestAnimationFrame and performance.now, the CDP Animation domain freezes the document timeline
// (CSS and Web Animations), and the compositor makes a frame only when asked (HeadlessExperimental.beginFrame). Each
// frame moves all three on by exactly 1/fps and takes its picture, so the clip plays at the game's own pace whatever
// the machine's. Writes <out>/<segment>/00000.png…; cut and join them with ffmpeg (see the segment list for 2.8's).
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, type CDPSession, type Locator, type Page } from '@playwright/test'
import { DEFAULT_CONFIG, emptyProgress, instanceMaxHp, linearAreas, marketShiny, marketWeek } from '@/engine'
import type { SaveData } from '@/engine'
import { EVENTS_ON, fakeSession, gameData, makeSave, mockSupabase, STORAGE_KEY } from '../e2e/helpers'

// The frame, in device pixels: 3:2 like the battle stage (240×160), which fills it at ×6.
const W = 1440
const H = 960
const DAY = 86_400_000
const MOTION_ON = JSON.stringify({ sfx: false, sound: false, reducedMotion: false })

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return null
  const v = process.argv[i + 1]
  return v == null || v.startsWith('--') ? '' : v
}

async function startServer(): Promise<{ url: string; stop: () => void }> {
  const port = 5197
  // The e2e tests' settings (playwright.config.ts): a fake Supabase the routes below answer.
  const child: ChildProcess = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'http://127.0.0.1:54399',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      VITE_ADMIN_EMAIL: 'admin@example.com',
      E2E_BUILD_ID: 'e2e',
    },
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

// Runs in the page: every CSS animation, transition and Web Animation moves `dt` ms on the frozen timeline. One first
// seen this frame starts from 0 (framer-motion stamps its own with the faked clock, the CSS ones the frozen timeline's).
const STEP_ANIMATIONS = `(dt) => {
  const seen = (window.__clipSeen ||= new WeakSet())
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

/** What a segment can do to its page: step frames (kept or not), press things, wait for them. */
interface Rig {
  page: Page
  /** Runs `work` while the compositor makes tiny frames (nothing loads or answers without one); time stands still. */
  pumped: <T>(work: Promise<T>) => Promise<T>
  /** One frame of game time; its picture when `keep`. */
  frame: (keep: boolean) => Promise<Buffer | null>
  /** Steps frames (not kept) until `ok` holds, for at most `ms` of game time. */
  until: (ok: () => Promise<boolean>, ms?: number) => Promise<void>
  press: (target: Locator) => Promise<void>
}

interface Segment {
  name: string
  /** The page's pixel ratio: the game's screens at 1.5 (a 960×640 window, the desktop layout, bigger words). */
  dpr: number
  /** Seconds of frames to keep from the start. */
  seconds: number
  /** The page made ready, time stepped as needed. */
  setup: (rig: Rig, url: string) => Promise<void>
  /** At the first kept frame. */
  start: (rig: Rig) => Promise<void>
  /** Later presses, at seconds from the start. */
  then?: { at: number; act: (rig: Rig) => Promise<void> }[]
}

const visible = (l: Locator) => l.isVisible().catch(() => false)

// Runs in the page: the area picture `id` under the stage, as a battle there has it (BattleStage: the stage's own
// background cleared, the picture's battle window behind it), through the dev server's own modules.
const ART_UNDER = (id: string) => `(async () => {
  const scenes = await import('/src/fx/scenes.ts')
  const art = await import('/src/fx/areaArt.ts')
  const map = await import('/src/fx/areaArtMap.ts')
  scenes.setArtUnderStage(true)
  const place = art.artPlacement(art.battleWindow(map.ART_GEOMETRY[${JSON.stringify(id)}]))
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;inset:0;overflow:hidden;z-index:2147483646;background:#000'
  const img = document.createElement('img')
  img.src = art.artUrl(${JSON.stringify(id)})
  img.style.cssText = 'position:absolute;max-width:none;image-rendering:pixelated'
  Object.assign(img.style, place)
  box.appendChild(img)
  document.body.appendChild(box)
  await img.decode()
})()`

/**
 * The FX lab's stage (dev only, /kitchen-sink/fx) filling the frame at ×6, playing one timeline from its start; with
 * `art`, that area picture under it, as in the game (the champions' intros dissolve into it).
 */
function fxLab(name: string, preset: string, seconds: number, art?: string): Segment {
  return {
    name,
    dpr: 1,
    seconds,
    async setup({ page, pumped, until }, url) {
      await pumped(page.goto(`${url}/kitchen-sink/fx`))
      const select = page.locator('select').first()
      await until(() => visible(select), 20_000)
      const label = await pumped(
        select.evaluate(
          (s: HTMLSelectElement, want) => Array.from(s.options).find((o) => o.text === want)?.text ?? null,
          preset,
        ),
      )
      if (!label) throw new Error(`No FX lab timeline named "${preset}"`)
      await pumped(select.selectOption({ label }))
      await pumped(
        page.addStyleTag({
          content: `html, body { background: #000 !important; overflow: hidden !important }
          canvas.pixelated { position: fixed !important; inset: 0 !important; width: 100vw !important;
            height: 100vh !important; z-index: 2147483647 !important; }`,
        }),
      )
      if (art) await pumped(page.evaluate(ART_UNDER(art)))
      // Its sprites and pictures in, before the replay.
      await pumped(page.waitForLoadState('networkidle'))
      await until(async () => false, 1500)
    },
    async start({ page, pumped }) {
      await pumped(
        page.evaluate(() =>
          Array.from(document.querySelectorAll('button'))
            .find((b) => b.textContent?.trim() === 'Replay')
            ?.click(),
        ),
      )
    },
  }
}

/** Every request to the fake Supabase answered, the save, the session, the settings and the switches in place. */
async function boot(page: Page, save: SaveData, rpc: Record<string, unknown>, config: object) {
  await mockSupabase(page, { rpc: rpc as never })
  await page.addInitScript(
    ([key, session, s, f, cfg]) => {
      localStorage.setItem(key!, session!)
      if (!sessionStorage.getItem('booted')) localStorage.setItem('pokedice.save', s!)
      sessionStorage.setItem('booted', '1')
      localStorage.setItem('pokedice.settings', f!)
      localStorage.setItem('pokedice.devConfig', cfg!)
      for (const r of ['kanto', 'johto', 'hoenn']) localStorage.setItem(`pokedice.sharePrompt.${r}`, '1')
    },
    [STORAGE_KEY, JSON.stringify(fakeSession()), JSON.stringify(save), MOTION_ON, JSON.stringify(config)],
  )
}

const data = gameData()

/** Route 3, the round's last card a real player's (docs/54): CONTINUE turns it over, its intro plays. */
const realPlayer: Segment = {
  name: 'real-player',
  dpr: 1.5,
  seconds: 6,
  async setup({ page, pumped, until }, url) {
    const chain = linearAreas(data, 'kanto')
    const route3 = chain.find((a) => a.name === 'Route 3')!
    const base = makeSave(4, { player: { name: 'Sam', character: 'red' } })
    const box = base.box.map((p) => ({ ...p, dex: 5, level: 16 }))
    const save: SaveData = {
      ...base,
      box: box.map((p) => ({ ...p, currentHp: instanceMaxHp(p, data) })),
      currentAreaId: route3.id,
      areaVersusRulesSeen: true,
      areaProgress: {
        ...base.areaProgress,
        ...Object.fromEntries(
          chain
            .slice(0, chain.indexOf(route3))
            .map((a) => [a.id, { ...emptyProgress(), cleared: true, roundsDone: 9 }]),
        ),
        [route3.id]: { ...emptyProgress(), deck: ['versus'], drawn: ['center', 'wild', 'wild'] },
      },
    }
    await boot(
      page,
      save,
      {
        friend_status: [{ ids: [], unseen: [] }],
        friend_requests: [],
        area_versus_offer: {
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Kenta07',
          avatar: 'green',
          rich: false,
          friend: false,
          playedAt: new Date(Date.now() - 2 * DAY).toISOString(),
          team: [
            { dex: 130, level: 15, shiny: true, talent: false },
            { dex: 25, level: 14, shiny: false, talent: true },
            { dex: 17, level: 14, shiny: false, talent: false },
          ],
          levels: { combo: {}, dice: {} },
        },
        area_versus_met: null,
      },
      { ...EVENTS_ON, areaVersus: { ...DEFAULT_CONFIG.areaVersus, access: 'all' } },
    )
    await pumped(page.goto(`${url}/home`))
    const go = page.getByRole('button', { name: 'CONTINUE', exact: true }).first()
    await until(() => visible(go), 20_000)
    await pumped(page.waitForLoadState('networkidle'))
    await until(async () => false, 800)
  },
  async start({ page, press }) {
    await press(page.getByRole('button', { name: 'CONTINUE', exact: true }).first())
  },
  then: [{ at: 2.7, act: ({ page, press }) => press(page.getByRole('button', { name: /FIGHT/ }).first()) }],
}

/** The Friends page's Friendship card, then the Friend Market, then the shiny of the week bought and opened. */
const friendship: Segment = {
  name: 'friendship',
  dpr: 1.5,
  seconds: 12,
  async setup({ page, pumped, until }, url) {
    const today = new Date().toISOString().slice(0, 10)
    const day = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10)
    const week = marketWeek(today)
    const shiny = marketShiny(week, data)!
    const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
    const friend = (id: string, name: string, avatar: string, team: [number, number][], h: number) => ({
      user_id: id,
      name,
      avatar,
      region: 'kanto',
      area_id: null,
      max_level: Math.max(...team.map(([, l]) => l)),
      team: team.map(([dex, level]) => ({ dex, level })),
      since: '2026-10-03T10:00:00Z',
      updated_at: ago(h),
      is_new: false,
    })
    const MISTY = '22222222-0000-4000-8000-000000000002'
    const BROCK = '22222222-0000-4000-8000-000000000003'
    const ERIKA = '22222222-0000-4000-8000-000000000004'
    let status = {
      day: today,
      week,
      shiny,
      balance: 186,
      earned: 9,
      total: 420,
      streaks: [
        { friend: MISTY, streak: 12, best: 12, lastDay: day(-1), lastKind: 'raid' },
        { friend: BROCK, streak: 3, best: 3, lastDay: today, lastKind: 'trade' },
        { friend: ERIKA, streak: 34, best: 34, lastDay: day(-1), lastKind: 'egg' },
      ],
      today: [{ friend: BROCK, kind: 'trade', streak: 3, coins: 3 }],
      bought: { 'rare-candy': 8 } as Record<string, number>,
      pending: [] as unknown[],
    }
    const save = makeSave(4, { player: { name: 'Sam', character: 'red' }, friendship: { rulesSeen: true } })
    await boot(
      page,
      save,
      {
        friend_code: 'K7QM4XD9',
        friend_list: [
          friend(
            MISTY,
            'Misty',
            'green',
            [
              [120, 21],
              [121, 24],
            ],
            2,
          ),
          friend(
            BROCK,
            'Brock',
            'kanto/hiker',
            [
              [74, 12],
              [95, 14],
            ],
            5,
          ),
          friend(
            ERIKA,
            'Erika',
            'kanto/lass',
            [
              [45, 31],
              [114, 28],
            ],
            1,
          ),
        ],
        friend_status: [{ ids: [MISTY, BROCK, ERIKA], unseen: [] }],
        friend_seen: null,
        friend_requests: [],
        friend_profile: [
          {
            user_id: MISTY,
            name: 'Misty',
            avatar: 'green',
            region: 'kanto',
            area_id: null,
            updated_at: ago(2),
            since: '2026-10-03T10:00:00Z',
            regions: [
              {
                region: 'kanto',
                team: [
                  { dex: 120, level: 21 },
                  { dex: 121, level: 24 },
                ],
                pokedex: 40,
                maxLevel: 24,
                shinies: 1,
                progress: {},
                badges: [],
                endgame: false,
              },
            ],
            versus: null,
          },
        ],
        friendship_status: () => status,
        friend_market_buy: (body: { p_key: string }) => {
          status = { ...status, balance: status.balance - 150, bought: { ...status.bought, shiny: 1 } }
          return {
            id: 'clip-buy',
            key: body.p_key,
            gifts: [{ kind: 'pokemon', dex: shiny, level: 15, shiny: true, region: 'latest' }],
            balance: status.balance,
          }
        },
        friend_market_applied: null,
      },
      { ...EVENTS_ON, friendship: { ...data.config.friendship, access: 'all' } },
    )
    await pumped(page.goto(`${url}/friends`))
    const card = page.getByTestId('friendship-card')
    await until(() => visible(card), 20_000)
    await pumped(page.waitForLoadState('networkidle'))
    await until(async () => false, 800)
  },
  async start() {},
  then: [
    { at: 1.6, act: ({ page, press }) => press(page.getByTestId('open-market')) },
    {
      at: 3.0,
      act: ({ page, press }) =>
        press(page.getByTestId('market-shiny').getByRole('button', { name: /Buy 1 for 150 Heart Scales/ })),
    },
  ],
}

const SEGMENTS: Segment[] = [
  // Fought at the Indigo Plateau: the Elite Four's picture (the user's pick, 2026-11-01).
  fxLab('blue', "Cinematic: Champion Blue's entrance", 8, 'league'),
  realPlayer,
  friendship,
  fxLab('lugia', "Cinematic: #249's raid entrance", 8),
]

async function record(url: string, seg: Segment, fps: number, dir: string) {
  const browser = await chromium.launch({
    args: [
      '--deterministic-mode',
      '--enable-begin-frame-control',
      '--disable-component-update',
      // The real pixel ratio, not an emulated one: the frames then come back at device size.
      `--force-device-scale-factor=${seg.dpr}`,
    ],
    // Showdown's animated sprites come through the container's proxy; the game itself is local.
    ...(process.env.HTTPS_PROXY && {
      proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' },
    }),
  })
  const context = await browser.newContext({
    viewport: { width: Math.round(W / seg.dpr), height: Math.round(H / seg.dpr) },
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
  page.on('pageerror', (e) => console.warn(`[${seg.name}] page error: ${e.message}`))
  const cdp: CDPSession = await context.newCDPSession(page)

  const step = 1000 / fps
  let ticks = 1000
  const beginFrame = (advance: number, shot: boolean) => {
    ticks += advance
    return cdp.send('HeadlessExperimental.beginFrame', {
      frameTimeTicks: ticks,
      interval: step,
      ...(shot && { screenshot: { format: 'png' as const } }),
    })
  }
  const pumped = async <T>(work: Promise<T>): Promise<T> => {
    let done = false
    const settled = work.finally(() => (done = true))
    while (!done) {
      await beginFrame(0.01, false)
      await new Promise((r) => setTimeout(r, 5))
    }
    return settled
  }
  let virtual = 0
  let last: string | undefined
  const frame = async (keep: boolean) => {
    const target = virtual + step
    await page.clock.runFor(Math.round(target) - Math.round(virtual))
    await page.evaluate(`(${STEP_ANIMATIONS})(${step})`)
    virtual = target
    await page.evaluate(SETTLE)
    const r = await beginFrame(step, keep)
    if (!keep) return null
    last = r.screenshotData ?? last
    if (!last) throw new Error(`[${seg.name}] no picture`)
    return Buffer.from(last, 'base64')
  }
  const until = async (ok: () => Promise<boolean>, ms = 10_000) => {
    for (let t = 0; t < ms; t += step) {
      if (await ok()) return
      await frame(false)
    }
  }
  // A click straight on the element: the mouse's coordinates don't survive --force-device-scale-factor.
  const press = async (target: Locator) => {
    const hit = await pumped(target.evaluate((el: HTMLElement) => (el.click(), true)))
    if (!hit) throw new Error(`[${seg.name}] nothing to press`)
    console.log(`[${seg.name}] pressed ${target}`)
  }
  const rig: Rig = { page, pumped, frame, until, press }

  // Real time, so "2 days ago" and the market's week read as the fake server's answers say.
  await page.clock.install({ time: new Date() })
  await page.clock.pauseAt(new Date(Date.now() + 1000))
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
  await seg.setup(rig, url)

  mkdirSync(dir, { recursive: true })
  await seg.start(rig)
  const pending = [...(seg.then ?? [])].sort((a, b) => a.at - b.at)
  const total = Math.round(seg.seconds * fps)
  for (let i = 0; i < total; i++) {
    while (pending.length && i >= Math.round(pending[0]!.at * fps)) await pending.shift()!.act(rig)
    writeFileSync(join(dir, `${String(i).padStart(5, '0')}.png`), (await frame(true))!)
  }
  console.log(`[${seg.name}] ${total} frames in ${dir}`)
  await browser.close()
}

async function main() {
  const fps = Number(arg('fps') || 60)
  const only = arg('only')
  const out = resolve(arg('out') || 'patch-clip')
  const server = await startServer()
  try {
    for (const seg of SEGMENTS) {
      if (only && only !== seg.name) continue
      const dir = join(out, seg.name)
      rmSync(dir, { recursive: true, force: true })
      await record(server.url, seg, fps, dir)
    }
  } finally {
    server.stop()
  }
}

await main()
