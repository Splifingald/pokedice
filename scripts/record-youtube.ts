// Records the YouTube trailer (16:9, 30 s): the real game's battles, always with the dice, cut on its own flashes.
// Each battle is a duel of the dev-only harness (src/dev/promo.ts DUELS), its seed found on the battle itself; every
// frame stepped with its sounds (scripts/promo/capture.ts), then cut together (scripts/promo/edit.ts).
//
//   pnpm promo:youtube [--cut a|d] [--scene pair,three] [--explore] [--keep-frames] [--reuse /tmp/youtube-xxxx]
//                      [--url http://localhost:5173] [--chromium /path/to/headless_shell]
//
// --cut picks the trailer: A (the combos climbing, a story to the finale; promo/youtube-a-16x9.mp4) or D (a rush of
// types, the powers, the raids; promo/youtube-d-16x9.mp4).
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
  out: '',
  width: 1920,
  height: 1080,
  dpr: SIZE[0] / STAGE,
  touch: false,
}
/** The title, 1:1 (its end card a 2× part of it). */
const WHOLE = { width: 1920, height: 1080, dpr: 1 }
/** The raid's intro on a 960×540 page at 2×: it fills the screen whatever its size, Rayquaza twice as big. */
const HALF = { width: 960, height: 540, dpr: 2 }

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
  // Trailer D's type rush.
  ...['grass', 'psychic', 'dragon', 'fairy', 'fighting', 'dark', 'ground', 'rock'].map(hand),
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
    name: 'gmax',
    async play(c, url) {
      await c.cap.open(`${url}/__demo/gmax`, ready)
      await until(c, `${hasLog('roll', 'player')} && ${buttonOn('/G-MAX/')}`, 30_000)
      mark(c, 'roll')
      await boxes(c)
      await hold(c, 400)
      await c.cap.press(c.cap.page.getByRole('button', { name: /G-MAX/ }).first())
      mark(c, 'gmax')
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
    size: HALF,
    async play(c, url) {
      await c.cap.open(`${url}/__demo/raid`, '!!window.__promo')
      mark(c, 'intro')
      await hold(c, 7000)
    },
  },
  // Darkrai's and Giratina's raid intros (their own worlds), as Rayquaza's.
  ...['darkrai', 'giratina'].map((name): Scene => ({
    name,
    size: HALF,
    async play(c, url) {
      await c.cap.open(`${url}/__demo/${name}`, '!!window.__promo')
      mark(c, 'intro')
      await hold(c, 8000)
    },
  })),
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

/**
 * The stage 1:1; the dice and their readout (and a power's button) tripled, the dialogue above them left out; the
 * title's logo, buttons and notice doubled (the dev-only links under them left out); a whole page.
 */
type View = 'stage' | 'dice' | 'title' | 'whole'

/** A view's part of a take's frames, device pixels; scaled to 1920×1080 it is an exact 1×, 2× or 3×. */
function cropOf(take: Take, view: View): Cut['crop'] {
  const [W, H] = SIZE
  if (view === 'whole') return undefined
  if (view === 'title') return { x: (W - W / 2) / 2, y: 218, w: W / 2, h: H / 2 }
  const d = take.dpr
  const stage = take.boxes.stage
  if (!stage) throw new Error('the take has no stage measured')
  // The stage's foe HP box (its top) is what a 16:9 frame of a 3:2 stage leaves out.
  if (view === 'stage')
    return { x: Math.round(stage.x * d), y: Math.round((stage.y + stage.height) * d) - H, w: W, h: H }
  const dice = take.boxes.dice ?? stage
  const w = W / 3
  const h = H / 3
  const cx = (dice.x + dice.width / 2) * d
  // Its top just under the dialogue box (which ends 11 px above the dice).
  const top = (dice.y - 6) * d
  return { x: Math.round(cx - w / 2), y: Math.round(top), w, h }
}

/**
 * Trailer A: four hands climbing the combos (a dice close-up, then its move), a reroll into Four of a Kind and a K.O.,
 * a Mega Evolution and its hit, Celebi's entrance and strike, the finale (Five of a Kind, a Z-Move, the K.O.), Rayquaza,
 * the title. 30 s; seconds off each take's marks.
 */
/**
 * A cut of a take, seconds off its marks, in a view. Every shot's sound runs a little under the next one (the game's
 * effects are short; no dead air between hits).
 */
const cutter =
  (t: Record<string, Take>) =>
  (scene: string, view: View, from: [string, number], to: [string, number], tail = 0.35, gain = 1): Cut => {
    const take = t[scene]!
    const at = (name: string, sec: number) => take.marks[name]! + Math.round(sec * FPS)
    return { take, from: at(...from), to: at(...to), crop: cropOf(take, view), tail, gain }
  }

function trailerA(t: Record<string, Take>): Cut[] {
  const cut = cutter(t)
  return [
    // A Pair: the dice thrown (their rattle) and landing, then Thunderbolt (its bolt at +1.05 s, the damage at +1.35 s).
    cut('pair', 'dice', ['roll', 0.05], ['roll', 1.05]),
    cut('pair', 'stage', ['attack', 0.7], ['attack', 1.6]),
    // Three of a Kind: Ice Beam's beam and spikes, then its shatter (+2.45 s).
    cut('three', 'dice', ['roll', 0.05], ['roll', 1.05]),
    cut('three', 'stage', ['attack', 1.0], ['attack', 1.45]),
    cut('three', 'stage', ['attack', 2.35], ['attack', 2.8]),
    // A Small Straight: Shadow Ball flying in and bursting (+1.63 s).
    cut('straight', 'dice', ['roll', 0.05], ['roll', 1.05]),
    cut('straight', 'stage', ['attack', 1.1], ['attack', 2.0]),
    // A Full House: Hydro Pump, SUPER EFFECTIVE!
    cut('fullhouse', 'dice', ['roll', 0.05], ['roll', 1.05]),
    cut('fullhouse', 'stage', ['attack', 0.65], ['attack', 2.0]),
    // Three of a Kind kept, two dice thrown again: Four of a Kind. Flamethrower, then the K.O.
    cut('reroll', 'dice', ['reroll', -0.6], ['combo', 0.4]),
    cut('reroll', 'stage', ['attack', 0.85], ['attack', 2.3]),
    cut('reroll', 'stage', ['faint', -0.05], ['faint', 0.55]),
    // Lucario Mega Evolves; Mega Lucario's punches, the K.O.
    cut('megahit', 'stage', ['mega', 1.2], ['mega', 3.15]),
    cut('megahit', 'stage', ['attack', 0.95], ['attack', 2.15]),
    cut('megahit', 'stage', ['faint', -0.05], ['faint', 0.45]),
    // Celebi's entrance (the silhouette, its rays, the reveal, its name), then its strike.
    cut('boss', 'stage', ['intro', 2.2], ['intro', 4.6]),
    cut('boss', 'stage', ['hit', -1.0], ['hit', 0.4]),
    // The finale: Four of a Kind, one die thrown again, Five of a Kind; the Z-Move; the K.O.
    cut('finale', 'dice', ['roll', 0.4], ['roll', 1.05]),
    cut('finale', 'dice', ['reroll', -0.25], ['z', 0.05]),
    cut('finale', 'stage', ['z', 0], ['z', 1.45]),
    cut('finale', 'stage', ['z', 2.65], ['z', 4.4]),
    cut('finale', 'stage', ['faint', -0.05], ['faint', 0.75]),
    // Rayquaza out of the sky (its sky still heard under the title); the title.
    cut('raid', 'whole', ['intro', 1.65], ['intro', 3.75], 2.4),
    cut('title', 'title', ['title', 0.3], ['title', 2.6]),
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

/**
 * Trailer D: a rush of twelve types (each the dice landing, then its move at its peak), a hush and a reroll into Four
 * of a Kind, Mega Evolution and Gigantamax, three raid intros, the finale (Five of a Kind, a Z-Move, the K.O.), the
 * title. 30 s; seconds off each take's marks.
 */
function trailerD(t: Record<string, Take>): Cut[] {
  const cut = cutter(t)
  // A type: its dice landing (the first one from the throw, its rattle), then its move from `a` to `b` after ATTACK.
  const type = (scene: string, a: number, b: number, first = false) => [
    cut(scene, 'dice', ['roll', first ? 0.05 : 0.35], ['roll', 0.7]),
    cut(scene, 'stage', ['attack', a], ['attack', b]),
  ]
  return [
    ...type('fullhouse', 1.0, 1.6, true),
    ...type('pair', 0.95, 1.55),
    ...type('grass', 1.45, 2.05),
    ...type('three', 1.0, 1.6),
    ...type('psychic', 1.95, 2.55),
    ...type('straight', 1.25, 1.85),
    ...type('dragon', 1.0, 1.6),
    ...type('fairy', 1.0, 1.6),
    ...type('fighting', 1.0, 1.6),
    ...type('dark', 1.0, 1.6),
    ...type('ground', 1.0, 1.6),
    ...type('rock', 1.0, 1.6),
    // The hush: two dice thrown again in silence; they land, Four of a Kind, and Flamethrower breaks it. The K.O.
    cut('reroll', 'dice', ['reroll', -0.15], ['reroll', 0.55], 0, 0),
    cut('reroll', 'dice', ['reroll', 0.55], ['combo', 0.45]),
    cut('reroll', 'stage', ['attack', 1.35], ['attack', 2.2]),
    cut('reroll', 'stage', ['faint', -0.05], ['faint', 0.45]),
    // The powers: Lucario Mega Evolves; Charizard Gigantamaxes, then G-Max Wildfire.
    cut('megahit', 'stage', ['mega', 1.2], ['mega', 3.1]),
    cut('gmax', 'stage', ['gmax', 0.85], ['gmax', 3.1]),
    cut('gmax', 'stage', ['attack', 1.15], ['attack', 1.85]),
    // The raids: Darkrai, Giratina, Rayquaza, each at its reveal.
    cut('darkrai', 'whole', ['intro', 2.2], ['intro', 3.6]),
    cut('giratina', 'whole', ['intro', 2.2], ['intro', 3.6]),
    cut('raid', 'whole', ['intro', 2.0], ['intro', 3.5]),
    // The finale: Four of a Kind, one die again, Five of a Kind; the Z-Move; the K.O. (heard under the title).
    cut('finale', 'dice', ['roll', 0.4], ['roll', 1.0]),
    cut('finale', 'dice', ['reroll', -0.2], ['five', 0.3]),
    cut('finale', 'stage', ['z', 0.1], ['z', 1.2]),
    cut('finale', 'stage', ['z', 2.75], ['z', 4.2]),
    cut('finale', 'stage', ['faint', -0.05], ['faint', 0.6], 1.0),
    cut('title', 'title', ['title', 0.3], ['title', 1.8]),
  ]
}

/** The trailers: their file, the takes they cut from, their cuts. */
const CUTS: Record<string, { out: string; scenes: string[]; cuts: (t: Record<string, Take>) => Cut[] }> = {
  a: {
    out: 'youtube-a-16x9.mp4',
    scenes: [
      'pair',
      'three',
      'straight',
      'fullhouse',
      'reroll',
      'megahit',
      'boss',
      'finale',
      'raid',
      'title',
    ],
    cuts: trailerA,
  },
  d: {
    out: 'youtube-d-16x9.mp4',
    scenes: [
      ...[
        'fullhouse',
        'pair',
        'grass',
        'three',
        'psychic',
        'straight',
        'dragon',
        'fairy',
        'fighting',
        'dark',
      ],
      ...['ground', 'rock', 'reroll', 'megahit', 'gmax', 'darkrai', 'giratina', 'raid', 'finale', 'title'],
    ],
    cuts: trailerD,
  },
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
  const trailer = CUTS[arg('cut') ?? 'a']
  if (!trailer) throw new Error(`--cut: one of ${Object.keys(CUTS).join(', ')}`)
  const missing = trailer.scenes.filter((name) => !takes[name])
  if (!explore && missing.length) console.log(`[youtube] not cut yet, takes missing: ${missing.join(', ')}`)
  if (!explore && !missing.length) {
    const out = join(outDir, trailer.out)
    const work = join(root, 'edit')
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work)
    await edit(trailer.cuts(takes), FPS, out, work, SIZE)
    console.log(`[youtube] ${out}`)
  }
  if (arg('keep-frames') != null || reuse) console.log(`[youtube] frames kept in ${root}`)
  else rmSync(root, { recursive: true, force: true })
}

await main()
