// Renders the Pokédice trailer (trailer/, docs/36-TRAILER-SCENARIO.md) to an MP4: Vite serves the page, Chromium draws
// it one frame at a time, ffmpeg encodes the frames and the sound the page mixed. Showdown's sprites and cries are
// fetched once into scripts/.cache/trailer and served from there, so a render is the same every time.
//
//   pnpm trailer                      the whole trailer → trailer/out/pokedice-trailer.mp4
//   pnpm trailer --stills 0,150,600   just those frames → trailer/out/stills/f0150.png …
//   pnpm trailer --from 150 --to 540  a part, silent → trailer/out/part-150-540.mp4
import { chromium } from '@playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'vite'

// What trailer/main.ts puts on the page.
declare global {
  interface Window {
    trailer: {
      ready: Promise<boolean>
      frames: number
      render(n: number): void
      record(on: boolean): void
      audio(): Promise<string>
    }
  }
}

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'trailer/out')
const CACHE = join(ROOT, 'scripts/.cache/trailer')
const PORT = 5199

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const stills = arg('stills')?.split(',').map(Number)
const from = Number(arg('from') ?? 0)
const toArg = arg('to')

const MIME: Record<string, string> = { gif: 'image/gif', png: 'image/png', mp3: 'audio/mpeg' }

async function main() {
  mkdirSync(OUT, { recursive: true })
  const server = await createServer({
    root: ROOT,
    configFile: join(ROOT, 'vite.config.ts'),
    // No live reload: an edit made while a render runs must not reload the page under it.
    server: { port: PORT, strictPort: true, hmr: false, watch: null },
    logLevel: 'warn',
  })
  await server.listen()
  // CHROMIUM_PATH: a browser other than the one this Playwright version downloads (e.g. a cloud box's own).
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
    page.on('pageerror', (e) => console.error('[page error]', e.message))
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`[page ${m.type()}]`, m.text()))
    await page.route(/^https:\/\/(play\.pokemonshowdown\.com|raw\.githubusercontent\.com)\//, async (route) => {
      const url = new URL(route.request().url())
      const file = join(CACHE, url.host, decodeURIComponent(url.pathname))
      if (!existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true })
        try {
          execFileSync('curl', ['-sSfL', '--retry', '3', '-o', file, url.href])
        } catch {
          return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } })
        }
      }
      const ext = file.split('.').pop() ?? ''
      await route.fulfill({
        path: file,
        headers: { 'access-control-allow-origin': '*', 'content-type': MIME[ext] ?? 'application/octet-stream' },
      })
    })
    await page.goto(`http://localhost:${PORT}/trailer/index.html`)
    await page.evaluate(() => window.trailer.ready)
    const total = await page.evaluate(() => window.trailer.frames)
    const shot = () => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } })

    if (stills) {
      mkdirSync(join(OUT, 'stills'), { recursive: true })
      for (const n of stills) {
        // Step from a little before, so the timelines' particles are where playing would have left them.
        for (let k = Math.max(0, n - 30); k <= n; k++) await page.evaluate((k) => window.trailer.render(k), k)
        const file = join(OUT, 'stills', `f${String(n).padStart(4, '0')}.png`)
        writeFileSync(file, await shot())
        console.log(file)
      }
      return
    }

    const whole = !toArg && from === 0
    const to = Math.min(total, Number(toArg ?? total))
    const video = join(OUT, whole ? 'video-only.mp4' : `part-${from}-${to}.mp4`)
    const ff = spawn(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-i', '-'].concat(
        ['-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-tune', 'animation', '-pix_fmt', 'yuv420p', video],
      ),
      { stdio: ['pipe', 'inherit', 'inherit'] },
    )
    const done = new Promise<void>((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg ${c}`)) : res())))
    if (whole) await page.evaluate(() => window.trailer.record(true))
    // Warm up the frames before a part, as stills do.
    for (let k = Math.max(0, from - 30); k < from; k++) await page.evaluate((k) => window.trailer.render(k), k)
    const t0 = Date.now()
    for (let n = from; n < to; n++) {
      await page.evaluate((n) => window.trailer.render(n), n)
      const png = await shot()
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r))
      if (n % 60 === 0) console.log(`frame ${n}/${to} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
    }
    ff.stdin.end()
    await done
    if (!whole) {
      console.log(video)
      return
    }
    const wav = join(OUT, 'sound.wav')
    writeFileSync(wav, Buffer.from(await page.evaluate(() => window.trailer.audio()), 'base64'))
    // −14 LUFS, the loudness web video players normalise to.
    const final = join(OUT, 'pokedice-trailer.mp4')
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', video, '-i', wav,
      '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-t', String(total / 60), '-movflags', '+faststart', final,
    ])
    console.log(final)
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
