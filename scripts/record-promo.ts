// Records the promo trailer: the real game played scene by scene on the dev server's /__demo/:scene harness
// (src/dev/promo.ts), every frame stepped and kept with the game's sounds (scripts/promo/capture.ts), then cut together
// with ffmpeg (scripts/promo/edit.ts).
//
//   pnpm promo:trailer [--only mobile|desktop] [--scene battle] [--explore] [--url http://localhost:5173]
//                      [--chromium /path/to/headless_shell]
//
// --scene records one scene alone; --explore writes its contact sheet (every 15th frame) instead of the trailer.
// Writes promo/trailer-4x5.mp4 (1080×1350), promo/trailer-16x9.mp4 (1920×1080) and promo/trailer-4x5.gif (540×675).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Route } from '@playwright/test'
import { PNG } from 'pngjs'
import { BUNDLE } from '@/config/bundle'
import { compileGameData, createInstance, DEFAULT_CONFIG } from '@/engine'
import { HERO_DEFAULTS, heroQuery } from '@/dev/heroDemo'
import { arg, openCapture, startServer, type Capture, type CryNote } from './promo/capture'
import { edit, gifOf, type Cut } from './promo/edit'
import { planFor } from './find-hero-seed'

export interface Format {
  name: 'mobile' | 'desktop'
  out: string
  width: number
  height: number
  dpr: number
  touch: boolean
}

// The 4:5 phone is 576×720 CSS px (the whole battle fits; still the one-column layout), the desktop 1280×720.
const FORMATS: Format[] = [
  { name: 'mobile', out: 'trailer-4x5.mp4', width: 576, height: 720, dpr: 1080 / 576, touch: true },
  { name: 'desktop', out: 'trailer-16x9.mp4', width: 1280, height: 720, dpr: 1.5, touch: false },
]

const FPS = 60
/** The hero turn's seed (scripts/find-hero-seed.ts), Celebi's strike's and Greninja's light opener's. */
const SEEDS = { battle: 3494, boss: 6, mega: 27 }

/** A stand-in for Supabase on the trade scene: a signed-in player, Sora's Kadabra on the board. */
const SUPABASE = 'http://127.0.0.1:54399'
const SESSION_KEY = 'sb-127-auth-token'

export interface Take {
  frames: string[]
  marks: Record<string, number>
  wav: string | null
  cries: CryNote[]
}

interface Ctx {
  cap: Capture
  f: Format
  dir: string
  frames: string[]
  marks: Record<string, number>
}

async function tick(c: Ctx) {
  const png = await c.cap.frame()
  const file = join(c.dir, `${String(c.frames.length).padStart(5, '0')}.png`)
  writeFileSync(file, png)
  c.frames.push(file)
}
const mark = (c: Ctx, name: string) => void (c.marks[name] = c.frames.length)
async function hold(c: Ctx, ms: number) {
  for (let i = Math.round((ms * FPS) / 1000); i > 0; i--) await tick(c)
}
/** Frames until the page says so (checked before each one), at most `max` ms of game time. */
async function until(c: Ctx, expr: string, max = 15_000) {
  for (let i = 0; i < (max * FPS) / 1000; i++) {
    if (await c.cap.page.evaluate(expr)) return
    await tick(c)
  }
  throw new Error(`[${c.f.name}] waited too long for: ${expr}`)
}

const store = '(window.__promo && window.__promo.state())'
const battleLog = `((${store} || {}).battle || { log: [] }).log`
const hasLog = (kind: string, side?: string) =>
  `${battleLog}.some((e) => e.kind === '${kind}'${side ? ` && e.side === '${side}'` : ''})`
const buttonOn = (re: string) =>
  `[...document.querySelectorAll('button')].some((b) => ${re}.test(b.textContent.trim()) && !b.disabled)`
const text = (s: string) => `document.body.innerText.includes(${JSON.stringify(s)})`

interface Scene {
  name: string
  /**
   * Its desktop take's page size instead of 1280×720 (the same 1920×1080 frame): Trades, a page that keeps a reading
   * width, at 960×540, a third bigger in the frame. (Home, the Day Care and the lab would crop their scenes there.)
   */
  desktop?: Pick<Format, 'width' | 'height' | 'dpr'>
  /** Signed in, with the Supabase stand-in answering (the trades' board). */
  online?: boolean
  play: (c: Ctx, url: string) => Promise<void>
}

const plan = planFor(compileGameData(BUNDLE), { ...HERO_DEFAULTS, seed: SEEDS.battle })!

const READING = { width: 960, height: 540, dpr: 2 }

const SCENES: Scene[] = [
  {
    name: 'battle',
    async play(c, url) {
      await c.cap.open(
        `${url}/__demo/battle?${heroQuery({ ...HERO_DEFAULTS, seed: SEEDS.battle })}`,
        '!!window.__promo',
      )
      await until(c, hasLog('roll'))
      mark(c, 'roll')
      await until(c, buttonOn('/^ATTACK$/'))
      const dice = c.cap.page.getByRole('group', { name: 'Your dice' }).getByRole('button')
      await hold(c, 450)
      await c.cap.press(dice.nth(plan.reroll[0]))
      mark(c, 'pick')
      await hold(c, 400)
      await c.cap.press(dice.nth(plan.reroll[1]))
      await hold(c, 450)
      await c.cap.press(c.cap.page.getByRole('button', { name: /^REROLL/ }))
      mark(c, 'reroll')
      await until(c, `${hasLog('reroll')} && ${buttonOn('/^ATTACK$/')}`)
      mark(c, 'combo')
      await hold(c, 650)
      await c.cap.press(c.cap.page.getByRole('button', { name: /^ATTACK$/ }))
      mark(c, 'attack')
      await until(c, text('fainted!'))
      mark(c, 'faint')
      await hold(c, 1200)
    },
  },
  {
    name: 'boss',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/boss?seed=${SEEDS.boss}`, '!!window.__promo')
      mark(c, 'intro')
      await until(c, hasLog('damage', 'enemy'), 20_000)
      mark(c, 'strike')
      await until(c, text('dealt'), 8_000)
      mark(c, 'hit')
      await hold(c, 1500)
    },
  },
  {
    name: 'mega',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/mega?seed=${SEEDS.mega}`, '!!window.__promo')
      // Greninja (faster) strikes first; then the turn's dice are thrown for you, and MEGA waits on them.
      await until(c, `${hasLog('roll', 'player')} && ${buttonOn('/MEGA/i')}`, 20_000)
      mark(c, 'turn')
      await hold(c, 400)
      await c.cap.press(c.cap.page.getByRole('button', { name: /MEGA/i }).first())
      // Two Mega forms (Mega Lucario, Mega Lucario Z): the classic one, first in the list.
      await until(c, `!!document.querySelector('[role="dialog"]')`)
      await hold(c, 350)
      await c.cap.press(
        c.cap.page
          .getByRole('dialog')
          .getByRole('button', { name: /Mega Lucario/ })
          .first(),
      )
      mark(c, 'mega')
      await hold(c, 4500)
    },
  },
  {
    name: 'home',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/home`, '!!window.__promo && location.pathname === "/home"')
      mark(c, 'home')
      await hold(c, 3000)
    },
  },
  {
    name: 'daycare',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/daycare`, '!!window.__promo && location.pathname === "/daycare"')
      mark(c, 'yard')
      await hold(c, 12_000)
    },
  },
  {
    name: 'trade',
    desktop: READING,
    online: true,
    async play(c, url) {
      await c.cap.open(`${url}/__demo/trade`, '!!window.__promo && location.pathname === "/trades"')
      const page = c.cap.page
      await until(c, `!!document.querySelector('[data-testid="trade-board"]')`)
      mark(c, 'board')
      await hold(c, 700)
      await c.cap.press(
        page
          .getByTestId('trade-board')
          .getByRole('button', { name: /Kadabra/ })
          .first(),
      )
      await until(c, `!!document.querySelector('[data-testid="listing-sheet"]')`)
      mark(c, 'sheet')
      await hold(c, 700)
      await c.cap.press(page.getByRole('button', { name: 'Trade', exact: true }))
      await until(c, `!!document.querySelector('[data-testid="trade-picker"]')`)
      mark(c, 'picker')
      await hold(c, 600)
      await c.cap.press(
        page
          .getByTestId('trade-picker')
          .getByRole('button', { name: /Machoke/ })
          .first(),
      )
      await hold(c, 600)
      await c.cap.press(page.getByRole('button', { name: 'Trade', exact: true }))
      mark(c, 'scene')
      await until(c, text('is evolving!'), 20_000)
      mark(c, 'evolving')
      await until(c, text('evolved into Alakazam'), 20_000)
      mark(c, 'evolved')
      await hold(c, 1500)
    },
  },
  {
    name: 'raid',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/raid`, '!!window.__promo')
      mark(c, 'intro')
      await hold(c, 7000)
    },
  },
  {
    name: 'title',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/title`, 'location.pathname === "/"')
      mark(c, 'title')
      await hold(c, 1500)
      const page = c.cap.page
      await c.cap.press(page.getByRole('button', { name: /new game/i }).first())
      await until(c, buttonOn('/skip/i'))
      await c.cap.press(page.getByRole('button', { name: /skip/i }).first())
      await until(c, `!!document.querySelector('input')`)
      await c.cap.pumped(page.locator('input').first().fill('Alex'))
      await c.cap.pumped(page.locator('input').first().press('Enter'))
      mark(c, 'lab')
      // The three balls: Bulbasaur and Squirtle out and back, then Charmander picked.
      const ball = (n: number) =>
        page.getByRole('button', { name: new RegExp(`Poké Ball ${n} of 3|out of its ball`) })
      await until(c, text('Tap a Poké Ball'))
      mark(c, 'choose')
      await hold(c, 500)
      for (const [n, name] of [
        [1, 'bulbasaur'],
        [3, 'squirtle'],
      ] as const) {
        await c.cap.press(ball(n).first())
        mark(c, name)
        await hold(c, 1300)
        await c.cap.press(page.getByRole('button', { name: 'Not this one' }))
        await hold(c, 500)
      }
      await c.cap.press(page.getByRole('button', { name: 'Poké Ball 2 of 3' }))
      mark(c, 'charmander')
      await hold(c, 1300)
      await c.cap.press(page.getByRole('button', { name: 'Pick Charmander' }))
      mark(c, 'picked')
      await hold(c, 2500)
    },
  },
]

/** The Supabase stand-in: Sora lists a Kadabra for a Machoke; taking it trades. Everything else answers empty. */
async function online(c: Capture) {
  const data = compileGameData(BUNDLE)
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const listing = {
    id: 'L-sora',
    code: 'K7QM4XD9',
    owner: '33333333-0000-4000-8000-000000000003',
    name: 'Sora',
    avatar: 'green',
    is_me: false,
    is_friend: false,
    dex: 64,
    level: 38,
    shiny: false,
    home_region: 'kanto',
    want: { kind: 'species', dex: 67 },
    visibility: 'public',
    created_at: iso(now - 3_600_000),
    ends_at: iso(now + 2 * 86_400_000),
    poster: { has: '', forms: [], shiny: [], regions: ['kanto'] },
  }
  const rpc: Record<string, unknown> = {
    trade_board: [listing],
    trade_mine: [],
    trade_take: {
      id: 'L-sora',
      listed: createInstance(64, 38, data, 'sora-kadabra', now),
      given: { ...createInstance(67, 40, data, 'promo-4', now) },
      with: 'Sora',
    },
    trade_applied: null,
  }
  await c.page.route(`${SUPABASE}/**`, async (route: Route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/auth/v1/user')
      return json({
        id: '11111111-2222-4333-8444-555555555555',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'alex@example.com',
        app_metadata: { provider: 'google', providers: ['google'] },
        user_metadata: {},
      })
    if (path === '/auth/v1/settings') return json({ external: { google: true, discord: false } })
    const fn = path.startsWith('/rest/v1/rpc/') ? path.slice('/rest/v1/rpc/'.length) : null
    if (fn && fn in rpc) return json(rpc[fn] ?? null)
    if (req.method() === 'POST' || req.method() === 'PATCH') return route.fulfill({ status: 201, body: '' })
    return json([])
  })
}

/**
 * The Day Care pair's first hearts: their pink (#ff5a7a) showing up in the frame, more of it than on the page at 1 s
 * (the desktop page has hearts of that pink of its own, beside the yard). Every third frame from 1.5 s.
 */
function firstHeart(frames: string[]): number | null {
  const pink = (i: number) => {
    const png = PNG.sync.read(readFileSync(frames[i]!))
    let n = 0
    for (let p = 0; p < png.data.length; p += 4)
      if (png.data[p] === 255 && png.data[p + 1] === 90 && png.data[p + 2] === 122) n++
    return n
  }
  const base = pink(60)
  for (let i = 90; i < frames.length; i += 3) if (pink(i) > base + 150) return i
  return null
}

function session(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const sub = '11111111-2222-4333-8444-555555555555'
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email: 'alex@example.com', role: 'authenticated', aud: 'authenticated', exp })}.sig`
  return JSON.stringify({
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'promo-refresh',
    user: {
      id: sub,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'alex@example.com',
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: {},
    },
  })
}

async function record(url: string, format: Format, scene: Scene, dir: string): Promise<Take> {
  const f = format.name === 'desktop' && scene.desktop ? { ...format, ...scene.desktop } : format
  const cap = await openCapture({
    width: f.width,
    height: f.height,
    dpr: f.dpr,
    touch: f.touch,
    fps: FPS,
    audioSeconds: 40,
    storage: {
      // Trades switched on (they ship off), as the dev server reads its config.
      'pokedice.devConfig': JSON.stringify({ trade: { ...DEFAULT_CONFIG.trade, access: 'all' } }),
      ...(scene.online && { [SESSION_KEY]: session() }),
      // Prof. Oak's "Invite a friend" (once a region's second badge is won) already seen.
      ...Object.fromEntries(
        ['kanto', 'johto', 'hoenn', 'kalos'].map((r) => [`pokedice.sharePrompt.${r}`, '1']),
      ),
    },
  })
  if (scene.online) await online(cap)
  else
    await cap.page.route(`${SUPABASE}/**`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
  const c: Ctx = { cap, f, dir, frames: [], marks: {} }
  try {
    await scene.play(c, url)
    if (scene.name === 'daycare') {
      const at = firstHeart(c.frames)
      if (at == null) throw new Error(`[${f.name}] no hearts in the Day Care's yard`)
      c.marks.hearts = at
    }
    const { wav, cries } = await cap.sounds()
    let wavFile: string | null = null
    if (wav) writeFileSync((wavFile = join(dir, 'sound.wav')), wav)
    console.log(
      `[${f.name}] ${scene.name}: ${c.frames.length} frames, marks ${JSON.stringify(c.marks)}, cries ${cries.length}`,
    )
    return { frames: c.frames, marks: c.marks, wav: wavFile, cries }
  } finally {
    await cap.close()
  }
}

/** The trailer's cuts: [scene, from, to] in frames off its marks; ~30 s, hard cuts on the game's own flashes. */
function cutList(t: Record<string, Take>): Cut[] {
  const s = (sec: number) => Math.round(sec * FPS)
  const at = (scene: string, name: string, sec = 0) => t[scene]!.marks[name]! + s(sec)
  const cut = (scene: string, from: [string, number], to: [string, number]): Cut => ({
    take: t[scene]!,
    from: at(scene, ...from),
    to: at(scene, ...to),
  })
  return [
    // The hero turn: the dice landing, two picked, the Full House, the hit… then straight to the K.O.
    cut('battle', ['roll', -0.05], ['attack', 1.9]),
    cut('battle', ['faint', -0.05], ['faint', 0.6]),
    // Celebi's entrance (the silhouette, the rays, the reveal, its name), then its strike on Dragonite.
    cut('boss', ['intro', 2.5], ['intro', 5.0]),
    cut('boss', ['hit', -1.5], ['hit', 0.3]),
    // Kalos: Lucario Mega Evolves.
    { ...cut('mega', ['mega', 0.15], ['mega', 3.4]), noGif: true },
    // Home, the Day Care's pair meeting, the trade (Kadabra arrives and evolves).
    cut('home', ['home', 0.5], ['home', 1.6]),
    cut('daycare', ['hearts', -1.6], ['hearts', 0.6]),
    cut('trade', ['board', 0.2], ['board', 0.6]),
    cut('trade', ['picker', 0], ['picker', 0.8]),
    cut('trade', ['scene', 2.4], ['scene', 4.4]),
    cut('trade', ['evolved', -0.6], ['evolved', 0.9]),
    // Rayquaza's raid.
    cut('raid', ['intro', 1.0], ['intro', 4.4]),
    // The title, then the lab's three starters, Charmander picked.
    cut('title', ['title', 0.2], ['title', 1.2]),
    cut('title', ['bulbasaur', 0.3], ['bulbasaur', 1.0]),
    cut('title', ['squirtle', 0.3], ['squirtle', 1.0]),
    cut('title', ['charmander', 0.3], ['picked', 2.0]),
  ]
}

async function main() {
  const only = arg('only')
  const sceneName = arg('scene')
  const explore = arg('explore') != null
  const outDir = resolve('promo')
  mkdirSync(outDir, { recursive: true })
  const server = await startServer(5198, {
    VITE_SUPABASE_URL: SUPABASE,
    VITE_SUPABASE_ANON_KEY: 'promo-anon-key',
  })
  try {
    for (const f of FORMATS) {
      if (only && only !== f.name) continue
      const root = mkdtempSync(join(tmpdir(), `promo-${f.name}-`))
      const takes: Record<string, Take> = {}
      for (const scene of SCENES) {
        if (sceneName && !sceneName.split(',').includes(scene.name)) continue
        const dir = join(root, scene.name)
        mkdirSync(dir)
        takes[scene.name] = await record(server.url, f, scene, dir)
        if (explore) {
          const sheet = join(outDir, '.explore', `${scene.name}-${f.name}.png`)
          mkdirSync(join(outDir, '.explore'), { recursive: true })
          spawnSync('ffmpeg', [
            '-y',
            '-loglevel',
            'error',
            '-i',
            join(dir, '%05d.png'),
            '-vf',
            'select=not(mod(n\\,15)),scale=iw/4:-1:flags=neighbor,tile=8x8',
            '-frames:v',
            '1',
            sheet,
          ])
          console.log(`  sheet: ${sheet}`)
        }
      }
      if (!explore && !sceneName) {
        const out = join(outDir, f.out)
        const cuts = cutList(takes)
        await edit(cuts, FPS, out, root)
        console.log(`[${f.name}] ${out}`)
        // The phone's cut, as a GIF too (the Mega left out to stay under 10 MB).
        if (f.name === 'mobile') {
          const gif = join(outDir, 'trailer-4x5.gif')
          gifOf(out, cuts, FPS, gif)
          console.log(`[${f.name}] ${gif}`)
        }
      }
      if (arg('keep-frames') != null) console.log(`[${f.name}] frames kept in ${root}`)
      else rmSync(root, { recursive: true, force: true })
    }
  } finally {
    server.stop()
  }
}

await main()
