// Records the YouTube trailer (16:9, 30 s): the real game's battles, always with the dice, cut on its own flashes.
// Each battle is a duel of the dev-only harness (src/dev/promo.ts DUELS), its seed found on the battle itself; every
// frame stepped with its sounds (scripts/promo/capture.ts), then cut together (scripts/promo/edit.ts).
//
//   pnpm promo:youtube [--scene pair,three] [--explore] [--keep-frames] [--reuse /tmp/youtube-xxxx]
//                      [--url http://localhost:5173] [--chromium /path/to/headless_shell]
//
// The battles are filmed on a 1920×1080 page whose battle stage is 1110 px wide, at the pixel ratio that makes that
// stage exactly 1920 device pixels: the stage shots are the stage itself, 1:1 (the foe's HP box above them left out);
// the dice shots half that width, doubled nearest-neighbour. The raid's intro and the title fill the page at 1:1.
// --scene records only those scenes; --explore writes each take's contact sheet; --reuse cuts the takes a run with
// --keep-frames left (takes.json) without recording again.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { arg, startServer } from './promo/capture'
import { edit, type Cut } from './promo/edit'
import {
  buttonOn,
  FPS,
  hasLog,
  hold,
  mark,
  measure,
  record,
  text,
  until,
  type Ctx,
  type Format,
  type Scene,
  type Take,
} from './promo/take'

const SIZE: [number, number] = [1920, 1080]
/** The battle stage's width on a 1920×1080 page (its column is (100dvh − 340px) × 1.5 wide). */
const STAGE = 1110
const FORMAT: Format = {
  name: 'youtube',
  out: 'youtube-16x9.mp4',
  width: 1920,
  height: 1080,
  dpr: SIZE[0] / STAGE,
  touch: false,
}
/** The pages shown whole (the raid's intro, the title): 1:1. */
const WHOLE = { width: 1920, height: 1080, dpr: 1 }

const ready = '!!window.__promo && location.pathname === "/area"'
const plan = '(window.__promo && window.__promo.plan)'

/** The battle's boxes, once it's on screen: the stage and the dice tray. */
async function boxes(c: Ctx) {
  await measure(c, 'stage', '.shadow-ledge')
  await measure(c, 'dice', '[role="group"][aria-label="Your dice"]')
}

/** The player's first roll of the duel, then its dice to reroll pressed and REROLL. */
async function rollAndReroll(c: Ctx) {
  await until(c, hasLog('roll', 'player'), 30_000)
  mark(c, 'roll')
  await boxes(c)
  await until(c, buttonOn('/^ATTACK$/'))
  const reroll = (await c.cap.page.evaluate(`${plan}.reroll`)) as number[]
  const dice = c.cap.page.getByRole('group', { name: 'Your dice' }).getByRole('button')
  await hold(c, 400)
  for (const i of reroll) {
    await c.cap.press(dice.nth(i))
    await hold(c, 300)
  }
  await hold(c, 150)
  await c.cap.press(c.cap.page.getByRole('button', { name: /^REROLL/ }))
  mark(c, 'reroll')
}

/** A quick hand: the roll lands its combo, ATTACK straight away. */
const hand = (name: string): Scene => ({
  name,
  async play(c, url) {
    await c.cap.open(`${url}/__demo/${name}`, ready)
    await until(c, hasLog('roll', 'player'), 30_000)
    mark(c, 'roll')
    await boxes(c)
    await until(c, buttonOn('/^ATTACK$/'))
    await hold(c, 350)
    await c.cap.press(c.cap.page.getByRole('button', { name: /^ATTACK$/ }))
    mark(c, 'attack')
    await hold(c, 3500)
  },
})

const SCENES: Scene[] = [
  hand('pair'),
  hand('three'),
  hand('straight'),
  hand('fullhouse'),
  {
    name: 'reroll',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/reroll`, ready)
      await rollAndReroll(c)
      await until(c, `${hasLog('reroll', 'player')} && ${buttonOn('/^ATTACK$/')}`)
      mark(c, 'combo')
      await hold(c, 500)
      await c.cap.press(c.cap.page.getByRole('button', { name: /^ATTACK$/ }))
      mark(c, 'attack')
      await until(c, text('fainted!'))
      mark(c, 'faint')
      await hold(c, 1500)
    },
  },
  {
    name: 'megahit',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/megahit`, ready)
      await until(c, `${hasLog('roll', 'player')} && ${buttonOn('/MEGA/i')}`, 30_000)
      mark(c, 'roll')
      await boxes(c)
      await hold(c, 400)
      await c.cap.press(c.cap.page.getByRole('button', { name: /MEGA/i }).first())
      // Two Mega forms (Mega Lucario, Mega Lucario Z): the classic one, first in the list.
      if (await c.cap.page.evaluate(`!!document.querySelector('[role="dialog"]')`)) {
        await hold(c, 300)
        await c.cap.press(
          c.cap.page
            .getByRole('dialog')
            .getByRole('button', { name: /Mega Lucario/ })
            .first(),
        )
      }
      mark(c, 'mega')
      await until(c, buttonOn('/^ATTACK$/'), 15_000)
      mark(c, 'ready')
      await hold(c, 300)
      await c.cap.press(c.cap.page.getByRole('button', { name: /^ATTACK$/ }))
      mark(c, 'attack')
      await until(c, text('fainted!'))
      mark(c, 'faint')
      await hold(c, 1500)
    },
  },
  {
    name: 'boss',
    async play(c, url) {
      // Celebi's entrance at its shrine, then its strike on Dragonite (the Reddit trailer's seed).
      await c.cap.open(`${url}/__demo/boss?seed=6`, ready)
      mark(c, 'intro')
      await boxes(c).catch(() => measure(c, 'stage', '.shadow-ledge'))
      await until(c, hasLog('damage', 'enemy'), 20_000)
      mark(c, 'strike')
      await until(c, text('dealt'), 8_000)
      mark(c, 'hit')
      await hold(c, 1500)
    },
  },
  {
    name: 'finale',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/finale`, ready)
      mark(c, 'intro')
      await rollAndReroll(c)
      await until(c, `${hasLog('reroll', 'player')} && ${buttonOn('/Z-MOVE/')}`)
      mark(c, 'five')
      await hold(c, 700)
      await c.cap.press(c.cap.page.getByRole('button', { name: /Z-MOVE/ }).first())
      mark(c, 'z')
      await until(c, text('fainted!'), 20_000)
      mark(c, 'faint')
      await hold(c, 2500)
    },
  },
  {
    name: 'raid',
    size: WHOLE,
    async play(c, url) {
      await c.cap.open(`${url}/__demo/raid`, '!!window.__promo')
      mark(c, 'intro')
      await hold(c, 7000)
    },
  },
  {
    name: 'title',
    size: WHOLE,
    async play(c, url) {
      await c.cap.open(`${url}/__demo/title`, 'location.pathname === "/"')
      mark(c, 'title')
      await hold(c, 3000)
    },
  },
]

/** The stage 1:1; the tray (dice and buttons) doubled; the dice and their readout tripled; a whole page. */
type View = 'stage' | 'tray' | 'dice' | 'whole'

/** A view's part of a take's frames, device pixels; scaled to 1920×1080 it is an exact 1×, 2× or 3×. */
function cropOf(take: Take, view: View): Cut['crop'] {
  if (view === 'whole') return undefined
  const d = take.dpr
  const stage = take.boxes.stage
  if (!stage) throw new Error('the take has no stage measured')
  const [W, H] = SIZE
  // The stage's foe HP box (its top) is what a 16:9 frame of a 3:2 stage leaves out.
  if (view === 'stage')
    return { x: Math.round(stage.x * d), y: Math.round((stage.y + stage.height) * d) - H, w: W, h: H }
  const dice = take.boxes.dice ?? stage
  const zoom = view === 'tray' ? 2 : 3
  const w = W / zoom
  const h = H / zoom
  const cx = (dice.x + dice.width / 2) * d
  // The tray: the dice a little above the middle (the buttons below); the dice: the dice and their readout centred.
  const cy = (dice.y + dice.height / 2 + (view === 'tray' ? 40 : 28)) * d
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h }
}

/** The trailer's cuts (trailer A): hands climbing the combos, the reroll, the Mega, Celebi, the finale, the end card. */
function cutList(t: Record<string, Take>): Cut[] {
  const s = (sec: number) => Math.round(sec * FPS)
  const cut = (scene: string, view: View, from: [string, number], to: [string, number]): Cut => {
    const take = t[scene]!
    const at = (name: string, sec: number) => take.marks[name]! + s(sec)
    return { take, from: at(...from), to: at(...to), crop: cropOf(take, view) }
  }
  return [
    cut('reroll', 'dice', ['roll', 0], ['roll', 1.4]),
    cut('pair', 'dice', ['roll', 0.6], ['roll', 1.2]),
    cut('pair', 'stage', ['attack', 0.2], ['attack', 1.2]),
    cut('three', 'dice', ['roll', 0.6], ['roll', 1.2]),
    cut('three', 'stage', ['attack', 0.2], ['attack', 1.2]),
    cut('straight', 'dice', ['roll', 0.6], ['roll', 1.2]),
    cut('straight', 'stage', ['attack', 0.2], ['attack', 1.2]),
    cut('fullhouse', 'dice', ['roll', 0.6], ['roll', 1.2]),
    cut('fullhouse', 'stage', ['attack', 0.2], ['attack', 1.4]),
    cut('reroll', 'dice', ['reroll', -0.6], ['combo', 0.5]),
    cut('reroll', 'stage', ['attack', 0.1], ['faint', 0.4]),
    cut('megahit', 'stage', ['mega', 0.1], ['mega', 3.0]),
    cut('megahit', 'stage', ['attack', 0.1], ['attack', 1.4]),
    cut('boss', 'stage', ['intro', 2.5], ['intro', 4.8]),
    cut('boss', 'stage', ['hit', -1.4], ['hit', 0.2]),
    cut('finale', 'dice', ['reroll', -0.2], ['five', 0.6]),
    cut('finale', 'stage', ['z', 0], ['faint', 0.6]),
    cut('raid', 'whole', ['intro', 2.4], ['intro', 3.6]),
    cut('title', 'whole', ['title', 0.3], ['title', 2.3]),
  ]
}

function sheet(take: Take, out: string) {
  const dir = join(take.frames[0]!, '..')
  spawnSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    join(dir, '%05d.png'),
    '-vf',
    `select=not(mod(n\\,15)),scale=480:-1:flags=neighbor,tile=8x8`,
    '-frames:v',
    '1',
    out,
  ])
  console.log(`  sheet: ${out}`)
}

async function main() {
  const only = arg('scene')?.split(',')
  const reuse = arg('reuse')
  const explore = arg('explore') != null
  const outDir = resolve('promo')
  mkdirSync(outDir, { recursive: true })
  const root = reuse || mkdtempSync(join(tmpdir(), 'youtube-'))
  const index = join(root, 'takes.json')
  const takes: Record<string, Take> = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : {}
  const server = reuse && !only ? null : await startServer(5199)
  try {
    for (const scene of SCENES) {
      if (reuse && !only?.includes(scene.name)) continue
      if (only && !only.includes(scene.name)) continue
      const dir = join(root, scene.name)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir)
      takes[scene.name] = await record(server!.url, FORMAT, scene, dir)
      writeFileSync(index, JSON.stringify(takes))
      if (explore) {
        mkdirSync(join(outDir, '.explore'), { recursive: true })
        sheet(takes[scene.name]!, join(outDir, '.explore', `yt-${scene.name}.png`))
      }
    }
  } finally {
    server?.stop()
  }
  if (!explore && SCENES.every((sc) => takes[sc.name])) {
    const out = join(outDir, FORMAT.out)
    const work = join(root, 'edit')
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work)
    await edit(cutList(takes), FPS, out, work, SIZE)
    console.log(`[youtube] ${out}`)
  }
  if (arg('keep-frames') != null || reuse) console.log(`[youtube] frames kept in ${root}`)
  else rmSync(root, { recursive: true, force: true })
}

await main()
