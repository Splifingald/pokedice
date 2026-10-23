// Act 4, the features (47 → 53 s): five cut-ins of 1.2 s, one word each, in the same place so the eye stays put: FRIENDS (three friends' cards), VERSUS (two trainers and their dice), TRADING (the traded ball opening),
// CO-OP RAIDS (three trainers against one raid Pokémon), CO-OP DAY CARE (your Pokémon and a friend's, a heart, an Egg).
import { tradeTimeline } from '@/fx/timelines/trade'
import { canvas } from '@/fx/pixel'
import { drawSprite } from '@/fx/sprites'
import { PALETTE } from '@/theme/colors'
import { ACT, hit } from '../lib/clock'
import { cry, play } from '../lib/audio'
import { drawIcon, drawTrainer, egg, heart, image, loadArt, loadImage } from '../lib/art'
import { faceTexture } from '../lib/cube'
import { dots, GOLD, hpBar, INK, OW, outBack, panel, rect, span, text, TYPE, wash, type G } from '../lib/draw'
import { blit } from '../lib/hud'
import { Run } from '../lib/run'
import { playAt } from '../lib/scene'
import { loadMon, mon } from '../lib/sprites'
import { drawStage, loadPicture, picture } from '../lib/stage'
import type { Act } from '../main'

const T0 = ACT.features[0]
const CUT = 1.2
const WORDS = ['FRIENDS', 'VERSUS', 'TRADING', 'CO-OP RAIDS', 'CO-OP DAY CARE']

let trade: Run | null = null
const stage = canvas(240, 160)

/** The word of the cut, bottom left, slamming in on the cut. */
function word(g: G, w: string, f: number) {
  const k = 1 + 0.35 * (1 - outBack(span(f, 0, 0.14), 2))
  g.save()
  g.translate(96, 1000)
  g.scale(k, k)
  text(g, w, 0, 0, { size: 150, ow: 12, drop: 12, spacing: 4 })
  g.restore()
  rect(g, 96, 1018, Math.min(1, f / 0.2) * 420, 14, GOLD)
}

// ---------------------------------------------------------------- 1. friends
const FRIENDS = [
  { name: 'Mira', src: '/trainers/classes/cooltrainer-f.png', id: '7K2-QD9', mons: [6, 131, 3], gold: true },
  { name: 'Leo', src: '/characters/red.png', id: 'X4M-81B', mons: [25, 133, 143], gold: false },
  { name: 'Kai', src: '/trainers/classes/cooltrainer-m.png', id: 'PL5-2RT', mons: [149, 130, 94], gold: false },
]
function friends(g: G, f: number) {
  dots(g, PALETTE.parchment, PALETTE.line, 32, 8)
  FRIENDS.forEach((fr, i) => {
    const p = outBack(span(f, i * 0.1, i * 0.1 + 0.25), 1.3)
    const x = 520 + i * 90 + (1 - p) * 1500
    const y = 120 + i * 250
    panel(g, x, y, 1100, 200, { b: 8 })
    rect(g, x + 20, y + 20, 160, 160, PALETTE.goldPale)
    drawTrainer(g, fr.src, x + 100, y + 186, 2)
    text(g, fr.name, x + 210, y + 92, { size: 80, color: fr.gold ? GOLD : INK, ow: fr.gold ? 6 : 0 })
    text(g, `ID ${fr.id}`, x + 214, y + 160, { size: 44, color: PALETTE.muted, ow: 0, font: 'Jersey 15' })
    // Online: the green dot.
    rect(g, x + 1040, y + 24, 30, 30, INK)
    rect(g, x + 1044, y + 28, 22, 22, PALETTE.hpGreen)
    fr.mons.forEach((d, j) => drawIcon(g, d, x + 560 + j * 160, y + 40, 4))
  })
  if (hit(T0 + 0.01)) play('button')
}

// ---------------------------------------------------------------- 2. versus
function versus(g: G, f: number) {
  const bg = image('/backgrounds/versus.png')
  g.imageSmoothingEnabled = false
  g.drawImage(bg, 0, 0, bg.naturalWidth, bg.naturalHeight, -24, -12, OW + 48, ((OW + 48) * bg.naturalHeight) / bg.naturalWidth)
  const p = outBack(span(f, 0, 0.22), 1.4)
  drawTrainer(g, '/characters/red.png', 420 - (1 - p) * 900, 860, 6)
  drawTrainer(g, '/characters/green.png', 1500 + (1 - p) * 900, 860, 6, true)
  // Each side's dice, flat as the game draws them, hopping as they land.
  const sides: [number, string, number[]][] = [
    [470, TYPE.fire, [6, 6, 4]],
    [990, TYPE.water, [5, 3, 5]],
  ]
  for (const [x0, fill, vals] of sides)
    vals.forEach((v, i) => {
      const at = 0.45 + i * 0.08
      if (f < at) return
      const hop = Math.round(Math.sin(Math.min(1, (f - at) / 0.18) * Math.PI) * 40)
      blit(g, faceTexture(fill, v, 24), x0 + i * 150, 640 - hop, 5)
    })
  // VS slams in.
  if (f >= 0.2) {
    const k = 2.6 - 1.6 * outBack(span(f, 0.2, 0.32), 2)
    g.save()
    g.translate(OW / 2, 420)
    g.scale(k, k)
    text(g, 'VS', 0, 0, { size: 260, color: GOLD, align: 'center', base: 'middle', ow: 16, drop: 18, dropColor: '#c4382a' })
    g.restore()
  }
  if (hit(T0 + CUT + 0.2)) play('super')
}

// ---------------------------------------------------------------- 3. trading
function trading(g: G, f: number) {
  // The trade's arrival: the ball down the beam, a bounce, a wobble, Alakazam out with sparkles.
  const layer = playAt(trade!, f, 0, 4.6, 1.9)
  drawStage(g, null, [layer], { x: 120, y: 88, z: 8 })
  if (hit(T0 + CUT * 2 + (6.25 - 4.6) / 1.9)) cry(65)
}

// ---------------------------------------------------------------- 4. co-op raids
const ALLIES: [number, number][] = [
  [6, 44],
  [9, 120],
  [3, 196],
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
  drawSprite(s, mon(382), 172, 92 + bob, { sx: 1.25, sy: 1.25 })
  ALLIES.forEach(([d, x]) => drawSprite(s, mon(d, true), x, 158))
  drawStage(g, picture('lair-sea'), [stage], { x: 120, y: 86, z: 8 }, undefined, {
    shake: f > 0.85 && f < 1.0 ? { x: Math.round(Math.sin(f * 200) * 10), y: 0 } : { x: 0, y: 0 },
  })
  // The raid Pokémon's five bars.
  for (let i = 0; i < 5; i++) hpBar(g, 520 + i * 180, 40, 160, 22, i < 4 ? 1 : 1 - span(f, 0.85, 1.05))
  // The three trainers cut in, like the raid's opening.
  const trio: [string, number][] = [
    ['/characters/red.png', 6],
    ['/characters/green.png', 9],
    ['/trainers/classes/cooltrainer-f.png', 3],
  ]
  trio.forEach(([src, d], i) => {
    const p = outBack(span(f, i * 0.08, i * 0.08 + 0.22), 1.4)
    const x = 60 - (1 - p) * 700
    const y = 96 + i * 132
    panel(g, x, y, 380, 112, { fill: INK, b: 6, lip: false })
    rect(g, x, y, 380, 6, GOLD)
    drawTrainer(g, src, x + 70, y + 112, 1.4)
    drawIcon(g, d, x + 180, y + 14, 2.8)
  })
  // Everyone's dice at once: three over each ally, landing one after another.
  ALLIES.forEach(([, ax], a) =>
    RAID_DICE[a]!.forEach((v, i) => {
      const at = 0.3 + a * 0.12 + i * 0.05
      if (f < at) return
      const hop = Math.round(Math.sin(Math.min(1, (f - at) / 0.16) * Math.PI) * 50)
      const x = OW / 2 + (ax - 120) * 8 - 170 + i * 120
      blit(g, faceTexture(RAID_FILLS[a]!, v, 24), x, 560 - hop, 4)
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
  drawStage(g, picture('daycare'), [stage], { x: 120, y: 92, z: 8 })
  // The friend's Pokémon wears its tag.
  const tx = 960 + (170 - Math.round(f * 22) - 120) * 8
  rect(g, tx - 120, 160, 240, 64, INK)
  rect(g, tx - 114, 166, 228, 52, GOLD)
  text(g, "FRIEND'S", tx, 205, { size: 46, color: INK, ow: 0, align: 'center', spacing: 2 })
  // A heart, then the Egg between them, wobbling.
  if (f >= 0.35) {
    const p = span(f, 0.35, 0.6)
    blit(g, heart(), 960 - 42, 480 - p * 120, 12)
  }
  if (f >= 0.7) {
    const k = 12 * outBack(span(f, 0.7, 0.82), 2)
    const e = egg()
    const wob = Math.sin((f - 0.7) * 30) * 0.12
    g.save()
    g.translate(960, 900)
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
      loadMon(6, true),
      loadMon(9, true),
      loadMon(3, true),
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
