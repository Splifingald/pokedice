// Act 4, the features (44 → 50 s): five cut-ins of 1.2 s, one word each, in the same place so the eye stays put: FRIENDS (three friends' cards), VERSUS (two trainers and their dice), TRADING (the traded ball opening),
// CO-OP RAIDS (three trainers against one raid Pokémon), CO-OP DAY CARE (your Pokémon and a friend's, a heart, an Egg).
import { tradeTimeline } from '@/fx/timelines/trade'
import { canvas } from '@/fx/pixel'
import { drawSprite } from '@/fx/sprites'
import { PALETTE } from '@/theme/colors'
import { ACT, hit } from '../lib/clock'
import { cry, play } from '../lib/audio'
import { drawIcon, drawTrainer, egg, heart, image, loadArt, loadImage } from '../lib/art'
import { faceTexture } from '../lib/cube'
import { dots, GOLD, hpBar, INK, OH, OW, outBack, panel, rect, span, text, TYPE, wash, type G } from '../lib/draw'
import { blit } from '../lib/hud'
import { Run } from '../lib/run'
import { playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { F, stageEdge, surround, toScreen } from '../lib/frame'
import { drawStage, loadPicture, picture, sharpDraw, type Cam } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.features[0]
const CUT = 1.2
const WORDS = ['FRIENDS', 'VERSUS', 'TRADING', 'CO-OP RAIDS', 'CO-OP DAY CARE']

let trade: Run | null = null
const stage = canvas(240, 160)

/** The word of the cut, bottom left, slamming in on the cut. */
function word(g: G, w: string, f: number) {
  const k = 1 + 0.35 * (1 - outBack(span(f, 0, 0.14), 2))
  const { x, y, size } = F.word
  g.save()
  g.translate(x, y)
  g.scale(k, k)
  text(g, w, 0, 0, { size, ow: 12, drop: 12, spacing: 4 })
  g.restore()
  rect(g, x, y + 18, (Math.min(1, f / 0.2) * 420 * size) / 150, 14, GOLD)
}

/** A cut on a stage: the frame's backdrop (portrait), the stage in its box, its edge. */
function onStage(g: G, T: number, pic: ReturnType<typeof picture>, layer: HTMLCanvasElement, cam: Cam, shake = { x: 0, y: 0 }) {
  surround(g, T)
  drawStage(g, pic, [layer], cam, F.stage, { shake })
  stageEdge(g)
}
// Portrait shows the stage's whole width at ×5.
const TALL: Cam = { x: 120, y: 80, z: 5 }

// ---------------------------------------------------------------- 1. friends
const FRIENDS = [
  { name: 'Mira', src: '/trainers/classes/cooltrainer-f.png', id: '7K2-QD9', mons: [6, 131, 3], gold: true },
  { name: 'Leo', src: '/characters/red.png', id: 'X4M-81B', mons: [25, 133, 143], gold: false },
  { name: 'Kai', src: '/trainers/classes/cooltrainer-m.png', id: 'PL5-2RT', mons: [149, 130, 94], gold: false },
]
function friends(g: G, f: number) {
  dots(g, PALETTE.parchment, PALETTE.line, 32, 8)
  // Portrait: the cards stacked under the header, narrower, their Pokémon's icons smaller.
  const tall = F.portrait
  const cw = tall ? 960 : 1100
  FRIENDS.forEach((fr, i) => {
    const p = outBack(span(f, i * 0.1, i * 0.1 + 0.25), 1.3)
    const x = (tall ? 60 : 520 + i * 90) + (1 - p) * 1500
    const y = tall ? 420 + i * 260 : 120 + i * 250
    panel(g, x, y, cw, 200, { b: 8 })
    rect(g, x + 20, y + 20, 160, 160, PALETTE.goldPale)
    drawTrainer(g, fr.src, x + 100, y + 186, 2)
    text(g, fr.name, x + 210, y + 92, { size: 80, color: fr.gold ? GOLD : INK, ow: fr.gold ? 6 : 0 })
    text(g, `ID ${fr.id}`, x + 214, y + 160, { size: 44, color: PALETTE.muted, ow: 0, font: 'Jersey 15' })
    // Online: the green dot.
    rect(g, x + cw - 60, y + 24, 30, 30, INK)
    rect(g, x + cw - 56, y + 28, 22, 22, PALETTE.hpGreen)
    fr.mons.forEach((d, j) =>
      tall ? drawIcon(g, d, x + cw - 410 + j * 130, y + 66, 3) : drawIcon(g, d, x + 560 + j * 160, y + 40, 4),
    )
  })
  if (hit(T0 + 0.01)) play('button')
}

// ---------------------------------------------------------------- 2. versus
function versus(g: G, f: number) {
  const bg = image('/backgrounds/versus.png')
  // Whole screen pixels per picture pixel (five in landscape), enough to cover the frame, centred (its edges cropped):
  // the stadium stays crisp.
  const bk = Math.max(Math.ceil(OW / bg.naturalWidth), Math.ceil(OH / bg.naturalHeight))
  sharpDraw(g, bg, (OW - bg.naturalWidth * bk) / 2, (OH - bg.naturalHeight * bk) / 2, bg.naturalWidth * bk, bg.naturalHeight * bk, true)
  const p = outBack(span(f, 0, 0.22), 1.4)
  // Landscape: side by side; portrait: the rival up top, you below, VS between.
  const tall = F.portrait
  drawTrainer(g, '/characters/red.png', (tall ? 300 : 420) - (1 - p) * 900, tall ? 1560 : 860, 6)
  drawTrainer(g, '/characters/green.png', (tall ? 780 : 1500) + (1 - p) * 900, tall ? 820 : 860, 6, true)
  // Each side's dice, flat as the game draws them, hopping as they land.
  const dk = tall ? 4 : 5
  const pitch = tall ? 130 : 150
  const sides: [number, number, string, number[]][] = tall
    ? [
        // Each row on the side away from its trainer: yours right of you, the rival's left of her.
        [OW - 110 - 2 * pitch - 96, 1180, TYPE.fire, [6, 6, 4]],
        [110, 600, TYPE.water, [5, 3, 5]],
      ]
    : [
        [470, 640, TYPE.fire, [6, 6, 4]],
        [990, 640, TYPE.water, [5, 3, 5]],
      ]
  for (const [x0, y0, fill, vals] of sides)
    vals.forEach((v, i) => {
      const at = 0.45 + i * 0.08
      if (f < at) return
      const hop = Math.round(Math.sin(Math.min(1, (f - at) / 0.18) * Math.PI) * 40)
      blit(g, faceTexture(fill, v, 24), x0 + i * pitch, y0 - hop, dk)
    })
  // VS slams in.
  if (f >= 0.2) {
    const k = 2.6 - 1.6 * outBack(span(f, 0.2, 0.32), 2)
    g.save()
    g.translate(OW / 2, tall ? 960 : 420)
    g.scale(k, k)
    text(g, 'VS', 0, 0, { size: tall ? 220 : 260, color: GOLD, align: 'center', base: 'middle', ow: 16, drop: 18, dropColor: '#c4382a' })
    g.restore()
  }
  if (hit(T0 + CUT + 0.2)) play('super')
}

// ---------------------------------------------------------------- 3. trading
function trading(g: G, f: number) {
  // The trade's arrival: the ball down the beam, a bounce, a wobble, Alakazam out with sparkles.
  const layer = playAt(trade!, f, 0, 4.6, 1.9)
  onStage(g, T0 + CUT * 2 + f, null, layer, F.portrait ? TALL : { x: 120, y: 88, z: 8 })
  if (hit(T0 + CUT * 2 + (6.25 - 4.6) / 1.9)) cry(65)
}

// ---------------------------------------------------------------- 4. co-op raids
// Hoenn's three starters at their last stage (Blaziken, Swampert, Sceptile) against Hoenn's Kyogre.
const ALLIES: [number, number][] = [
  [257, 44],
  [260, 120],
  [254, 196],
]
const RAID_FILLS = [TYPE.fire, TYPE.water, TYPE.grass]
const RAID_DICE = [
  [6, 4, 6],
  [5, 5, 2],
  [3, 6, 3],
]
function raids(g: G, f: number, T: number) {
  const s = stage.g
  s.clearRect(0, 0, 240, 160)
  const bob = Math.round(Math.sin(T * 4) * 2)
  drawSprite(s, mon(382), 172, 92 + bob)
  ALLIES.forEach(([d, x]) => drawSprite(s, mon(d, true), x, 158))
  const cam = F.portrait ? TALL : { x: 120, y: 86, z: 8 }
  onStage(g, T, picture('lair-sea'), stage, cam, f > 0.85 && f < 1.0 ? { x: Math.round(Math.sin(f * 200) * 10), y: 0 } : { x: 0, y: 0 })
  // The raid Pokémon's three bars, the last one draining.
  for (let i = 0; i < 3; i++) {
    const hp = i < 2 ? 1 : 1 - span(f, 0.85, 1.05)
    if (F.portrait) hpBar(g, 70 + i * 320, F.stage.y + 30, 300, 22, hp)
    else hpBar(g, 520 + i * 300, 40, 280, 22, hp)
  }
  // The three trainers cut in, like the raid's opening.
  const trio: [string, number][] = [
    ['/characters/red.png', 257],
    ['/characters/green.png', 260],
    ['/trainers/classes/cooltrainer-f.png', 254],
  ]
  // Landscape: a column on the left, over the stage; portrait: a row under it.
  const cw = F.portrait ? 330 : 380
  trio.forEach(([src, d], i) => {
    const p = outBack(span(f, i * 0.08, i * 0.08 + 0.22), 1.4)
    const x = (F.portrait ? 18 + i * 352 : 60) - (1 - p) * (F.portrait ? 1200 : 700)
    const y = F.portrait ? F.stage.y + F.stage.h + 36 : 96 + i * 132
    panel(g, x, y, cw, 112, { fill: INK, b: 6, lip: false })
    rect(g, x, y, cw, 6, GOLD)
    drawTrainer(g, src, x + 70, y + 102, 1)
    drawIcon(g, d, x + 190, y + 11, 3)
  })
  // Everyone's dice at once: three over each ally, landing one after another.
  ALLIES.forEach(([, ax], a) =>
    RAID_DICE[a]!.forEach((v, i) => {
      const at = 0.3 + a * 0.12 + i * 0.05
      if (f < at) return
      const hop = Math.round(Math.sin(Math.min(1, (f - at) / 0.16) * Math.PI) * 50)
      // Over each ally, at the stage's scale (×4 in landscape).
      const p = toScreen(cam, F.stage, ax, 88.5)
      const x = p.x + ((-170 + i * 120) * cam.z) / 8
      blit(g, faceTexture(RAID_FILLS[a]!, v, 24), x, p.y - hop, Math.round((4 * cam.z) / 8))
    }),
  )
  if (hit(T0 + CUT * 3 + 0.02)) cry(382)
}

// ---------------------------------------------------------------- 5. co-op day care
function dayCare(g: G, f: number, T: number) {
  const s = stage.g
  s.clearRect(0, 0, 240, 160)
  const hopA = Math.round(Math.abs(Math.sin(T * 9)) * 3)
  const hopB = Math.round(Math.abs(Math.sin(T * 9 + 1.4)) * 3)
  drawSprite(s, mon(132), 74 + Math.round(f * 26), 128 - hopA, { flip: true })
  drawSprite(s, mon(149), 170 - Math.round(f * 22), 132 - hopB)
  const cam = F.portrait ? TALL : { x: 120, y: 92, z: 8 }
  onStage(g, T, picture('daycare'), stage, cam)
  // The friend's Pokémon wears its tag.
  const tag = toScreen(cam, F.stage, 170 - Math.round(f * 22), 44.5)
  rect(g, tag.x - 120, tag.y, 240, 64, INK)
  rect(g, tag.x - 114, tag.y + 6, 228, 52, GOLD)
  text(g, "FRIEND'S", tag.x, tag.y + 45, { size: 46, color: INK, ow: 0, align: 'center', spacing: 2 })
  // A heart, then the Egg between them, wobbling (×12 in landscape, the stage's scale in portrait).
  const hk = Math.round((12 * cam.z) / 8)
  if (f >= 0.35) {
    const p = span(f, 0.35, 0.6)
    const h = heart()
    const at = toScreen(cam, F.stage, 120, 84.5 - p * 15)
    blit(g, h, at.x - (h.width * hk) / 2, at.y, hk)
  }
  if (f >= 0.7) {
    const k = hk * outBack(span(f, 0.7, 0.82), 2)
    const e = egg()
    const wob = Math.sin((f - 0.7) * 30) * 0.12
    const at = toScreen(cam, F.stage, 120, 137)
    g.save()
    g.translate(at.x, at.y)
    g.rotate(wob)
    blit(g, e, (-e.width * k) / 2, -e.height * k, k)
    g.restore()
    if (hit(T0 + CUT * 4 + 0.71)) play('catch')
  }
}

export const features: Act = {
  range: ACT.features,
  async load() {
    await Promise.all([
      loadArt(),
      loadImage('/backgrounds/versus.png'),
      loadPicture('lair-sea'),
      loadPicture('daycare'),
      loadMon(65),
      loadMon(64),
      loadMon(382),
      loadMon(257, true),
      loadMon(260, true),
      loadMon(254, true),
      loadMon(132),
      loadMon(149),
    ])
    trade = new Run(() => tradeTimeline({ give: mon(64), get: mon(65), giveBall: 'poke', getBall: 'ultra' }))
  },
  render(g, T) {
    const u = T - T0
    const i = Math.min(4, Math.floor(u / CUT))
    const f = u - i * CUT
    if (i === 0) friends(g, f)
    else if (i === 1) versus(g, f)
    else if (i === 2) trading(g, f)
    else if (i === 3) raids(g, f, T)
    else dayCare(g, f, T)
    word(g, WORDS[i]!, f)
    // Each cut opens on a white frame; the first comes out of the montage's white.
    if (f < 2 / 60 || (i === 0 && f < 0.08)) wash(g, '#ffffff', i === 0 ? 1 - f / 0.08 : 1)
  },
}
