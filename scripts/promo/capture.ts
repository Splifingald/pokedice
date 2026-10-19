// Frame-stepped capture of the running game (scripts/record-hero.ts, scripts/record-promo.ts). Time is stepped, not
// sampled: Playwright's clock holds every timer, requestAnimationFrame and performance.now, the CDP Animation domain
// freezes the document timeline (CSS and Web Animations), and the compositor only makes a frame when asked
// (HeadlessExperimental.beginFrame, which also times the animated GIF sprites). Each frame moves all three forward by
// exactly 1/fps and takes that frame's picture: smooth whatever the machine's speed, at the game's real pace.
// It needs Chromium's headless shell (Playwright's default headless browser).
//
// The game's sounds are kept too, at the frame they play: its Web Audio graph renders into one OfflineAudioContext
// whose clock is the stepped one, and every cry (an <audio> element) is noted with its time, for the edit to lay in.
import { spawn, type ChildProcess } from 'node:child_process'
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test'

export interface CaptureOptions {
  /** CSS pixels and device pixel ratio: a frame is exactly width × dpr by height × dpr. */
  width: number
  height: number
  dpr: number
  touch: boolean
  fps: number
  /** The game's date (events, day and night): fixed, so every take is the same. */
  date?: string
  /** Keep the game's sounds: this many seconds of audio at most, from the first frame. */
  audioSeconds?: number
  /** localStorage entries set before the page loads (a save, the dev config). */
  storage?: Record<string, string>
}

export interface CryNote {
  /** Seconds from the first frame. */
  at: number
  url: string
  volume: number
}

export interface Capture {
  page: Page
  context: BrowserContext
  cdp: CDPSession
  fps: number
  /** Game time stepped so far, ms. */
  virtual: () => number
  /** Load a page and wait for fonts and images, the clock still held. */
  open: (url: string, ready?: string) => Promise<void>
  /** One frame of game time: its picture, PNG. */
  frame: () => Promise<Buffer>
  /** Wait on something the page does (loading, a tap), making frames meanwhile without moving game time. */
  pumped: <T>(work: Promise<T>) => Promise<T>
  /** A tap (touch) or a click (then the pointer moved off it), in the middle of an element or at a point. */
  press: (target: Locator | { x: number; y: number }) => Promise<void>
  /** What the game's Web Audio played since `open`, as a 16-bit stereo WAV; and the cries. */
  sounds: () => Promise<{ wav: Buffer | null; cries: CryNote[] }>
  close: () => Promise<void>
}

export function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return null
  const v = process.argv[i + 1]
  return v == null || v.startsWith('--') ? '' : v
}

/**
 * The dev server, offline by default (no Supabase: the bundle's content, no remote config mid-take), or the one at
 * --url. `env` points it at a stand-in instead (a take that answers Supabase's requests itself).
 */
export async function startServer(
  port = 5197,
  env: Record<string, string> = { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
): Promise<{ url: string; stop: () => void }> {
  const given = arg('url')
  if (given) return { url: given.replace(/\/$/, ''), stop: () => {} }
  const child: ChildProcess = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], {
    env: { ...process.env, ...env },
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
  const seen = (window.__capSeen ||= new WeakSet())
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

/**
 * Before the page's own scripts: the game's AudioContext is one OfflineAudioContext as long as the take, its clock the
 * stepped one (performance.now, faked), so every sound lands at the frame it was played; cries (<audio>) are noted.
 */
const AUDIO_SHIM = (seconds: number) => `(() => {
  const rate = 48000
  const off = new OfflineAudioContext(2, Math.ceil(rate * ${seconds}), rate)
  let zero = null
  const now = () => (zero == null ? 0 : (performance.now() - zero) / 1000)
  Object.defineProperty(off, 'currentTime', { get: now })
  Object.defineProperty(off, 'state', { get: () => 'running' })
  off.resume = () => Promise.resolve()
  off.suspend = () => Promise.resolve()
  off.close = () => Promise.resolve()
  function Ctx() { return off }
  window.AudioContext = Ctx
  window.webkitAudioContext = Ctx
  window.__capAudio = { off, start: () => (zero = performance.now()), cries: [] }
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    window.__capAudio.cries.push({ at: now(), url: this.currentSrc || this.src, volume: this.volume })
    // A cry lasts about a second: its end lets the one waiting play (game time, so on the stepped clock).
    setTimeout(() => this.dispatchEvent(new Event('ended')), 1100)
    return Promise.resolve()
  }
  void play
})()`

export async function openCapture(o: CaptureOptions): Promise<Capture> {
  // --chromium (or PW_CHROMIUM) for a browser other than Playwright's own: it must be a headless shell, the only build
  // that lets the script make the compositor's frames.
  const executablePath = arg('chromium') || process.env.PW_CHROMIUM || undefined
  const browser: Browser = await chromium.launch({
    executablePath,
    args: [
      // Frames only when the script asks (HeadlessExperimental.beginFrame), at the frame time it gives.
      '--deterministic-mode',
      '--enable-begin-frame-control',
      // The real pixel ratio, not an emulated one: the frames then come back at device size.
      `--force-device-scale-factor=${o.dpr}`,
      '--disable-component-update',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: o.width, height: o.height },
    hasTouch: o.touch,
    reducedMotion: 'no-preference',
    colorScheme: 'light',
    locale: 'en-US',
  })
  if (o.storage)
    await context.addInitScript((entries) => {
      // Once per browser profile: the game's own writes win after that.
      if (sessionStorage.getItem('__capSeeded')) return
      sessionStorage.setItem('__capSeeded', '1')
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
    }, o.storage)
  if (o.audioSeconds) await context.addInitScript(AUDIO_SHIM(o.audioSeconds))
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
  page.on('pageerror', (e) => console.warn(`page error: ${e.message}`))
  const cdp = await context.newCDPSession(page)

  const step = 1000 / o.fps
  let frames = 0
  let virtual = 0
  // The compositor's clock, in ms: each frame moves it on by exactly one frame; the frames made while the script waits
  // on the page move it a hundredth of a millisecond.
  let ticks = 1000
  let last: string | undefined
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

  const t0 = new Date(o.date ?? '2026-06-15T12:00:00Z')
  await page.clock.install({ time: t0 })
  await page.clock.pauseAt(t0)
  let frozen = false

  return {
    page,
    context,
    cdp,
    fps: o.fps,
    virtual: () => virtual,
    async open(url, ready = 'document.readyState === "complete"') {
      await pumped(page.goto(url))
      await pumped(page.waitForFunction(ready, null, { polling: 50, timeout: 60_000 }))
      if (!frozen) {
        await cdp.send('Animation.enable')
        await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
        frozen = true
      }
      // Fonts and every picture in before the first frame.
      await pumped(page.evaluate('document.fonts.ready'))
      await pumped(page.waitForLoadState('networkidle'))
      await pumped(
        page.waitForFunction('[...document.images].every((i) => i.complete)', null, { polling: 50 }),
      )
      if (o.audioSeconds && frames === 0)
        await page.evaluate('window.__capAudio && window.__capAudio.start()')
      last = (await beginFrame(0.01, true)).screenshotData ?? last
    },
    async frame() {
      const target = Math.round((frames + 1) * step)
      const dt = target - virtual
      await page.clock.runFor(dt)
      await page.evaluate(`(${STEP_ANIMATIONS})(${dt})`)
      virtual = target
      frames++
      await page.evaluate(SETTLE)
      // A frame where nothing changed comes back without a picture: the last one stands.
      last = (await beginFrame(step, true)).screenshotData ?? last
      if (!last) throw new Error(`no picture for frame ${frames}`)
      return Buffer.from(last, 'base64')
    },
    pumped,
    async press(target) {
      let at: { x: number; y: number }
      if ('x' in target) at = target
      else {
        const box = await pumped(target.boundingBox({ timeout: 15_000 }))
        if (!box) throw new Error('Nothing to press')
        at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      await pumped(
        (async () => {
          if (o.touch) return page.touchscreen.tap(at.x, at.y)
          await page.mouse.click(at.x, at.y)
          // No pointer resting on what was pressed: its hover look isn't part of the shot.
          await page.mouse.move(o.width - 2, 2)
        })(),
      )
    },
    async sounds() {
      if (!o.audioSeconds) return { wav: null, cries: [] }
      const out = (await page.evaluate(`(async () => {
        const a = window.__capAudio
        if (!a) return null
        const buf = await a.off.startRendering()
        const n = buf.length
        const l = buf.getChannelData(0)
        const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l
        const pcm = new Int16Array(n * 2)
        for (let i = 0; i < n; i++) {
          pcm[i * 2] = Math.max(-1, Math.min(1, l[i])) * 32767
          pcm[i * 2 + 1] = Math.max(-1, Math.min(1, r[i])) * 32767
        }
        const bytes = new Uint8Array(pcm.buffer)
        let s = ''
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
        return { pcm: btoa(s), rate: buf.sampleRate, cries: a.cries }
      })()`)) as { pcm: string; rate: number; cries: CryNote[] } | null
      if (!out) return { wav: null, cries: [] }
      return { wav: wavOf(Buffer.from(out.pcm, 'base64'), out.rate), cries: out.cries }
    },
    async close() {
      await browser.close()
    },
  }
}

/** 16-bit stereo PCM in a WAV file. */
function wavOf(pcm: Buffer, rate: number): Buffer {
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + pcm.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(2, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 4, 28)
  head.writeUInt16LE(4, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([head, pcm])
}
