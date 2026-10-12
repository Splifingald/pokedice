// The gift opening (docs/15 §23), after the player closes a message that carries one: a wrapped box drops onto a warm
// stage, wobbles three times (bigger each time: the anticipation), the bow springs loose, the box crouches, holds for a
// few frames, and the lid flies off in a burst of light; then what was inside rises out one by one — items as their
// pictures, Pokémon as their sprites (a shiny with its two rings of stars) — and a short fanfare. It plays in full
// whatever the motion setting short; only "off" skips it. Words are the host's: the beats say when.
import { fxSound } from '@/audio/sfx'
import {
  cached,
  canvas,
  ease,
  ellipse,
  glow,
  Particles,
  rect,
  ring,
  rng,
  span,
  text,
  textWidth,
  wash,
  type Canvas,
  type Rng,
} from '../pixel'
import { drawSprite, spriteFrame } from '../sprites'
import { screenFlash, screenShake, STEP, within, type Cue, type Timeline } from '../timeline'
import { momentBg } from './moments'

export interface GiftContent {
  /** What to draw: a Pokémon's front sprite key (`spriteKey`) or an item's (`item|<url>`). Not loaded: a sparkle. */
  key: string
  kind: 'mon' | 'item'
  shiny?: boolean
}

export interface GiftParams {
  contents: GiftContent[]
}

/** Where the box stands: its middle, and the floor under it. */
const BOX = { x: 120, y: 122 }
const BODY = { w: 48, h: 30 }
const LID = { w: 54, h: 10 }
/** The most drawn over the box; past it, the last slot says how many more ("+3"). */
const MAX_SHOWN = 6

const INK = '#24304f'
const RED = '#f2553f'
const RED_D = '#c4382a'
const RED_L = '#ff8a7a'
const GOLD = '#ffbe2e'
const GOLD_L = '#ffe7a8'
const GOLD_D = '#e08e00'
const CONFETTI = ['#f2553f', '#ffbe2e', '#5b8def', '#34c97a', '#ff6f9c', '#ffffff']

/** The box's body, with its ribbon: drawn once. */
function bodyArt(): Canvas {
  return cached('gift|body', () => {
    const { w, h } = BODY
    const c = canvas(w, h)
    const g = c.g
    rect(g, 0, 0, w, h, INK)
    rect(g, 1, 0, w - 2, h - 1, RED)
    rect(g, 1, h - 6, w - 2, 5, RED_D)
    rect(g, 2, 1, 2, h - 8, RED_L)
    // The ribbon down the middle.
    const rx = (w >> 1) - 3
    rect(g, rx, 0, 6, h - 1, GOLD)
    rect(g, rx, 0, 2, h - 1, GOLD_L)
    rect(g, rx + 5, 0, 1, h - 1, GOLD_D)
    rect(g, rx - 1, 0, 1, h - 1, INK)
    rect(g, rx + 6, 0, 1, h - 1, INK)
    return c
  })
}

/** The lid, its ribbon and (while tied) the bow on top. */
function lidArt(bow: boolean): Canvas {
  return cached(`gift|lid|${bow}`, () => {
    const { w, h } = LID
    const top = bow ? 11 : 0
    const c = canvas(w, h + top)
    const g = c.g
    rect(g, 0, top, w, h, INK)
    rect(g, 1, top + 1, w - 2, h - 2, RED)
    rect(g, 1, top + h - 3, w - 2, 2, RED_D)
    rect(g, 2, top + 1, w - 4, 1, RED_L)
    const rx = (w >> 1) - 3
    rect(g, rx - 1, top, 8, h, INK)
    rect(g, rx, top + 1, 6, h - 2, GOLD)
    rect(g, rx, top + 1, 2, h - 2, GOLD_L)
    if (bow) {
      // Two loops and the knot.
      const cx = w >> 1
      ellipse(g, cx - 8, 6, 8, 5, INK)
      ellipse(g, cx + 8, 6, 8, 5, INK)
      ellipse(g, cx - 8, 6, 7, 4, GOLD)
      ellipse(g, cx + 8, 6, 7, 4, GOLD)
      ellipse(g, cx - 8, 6, 3, 1, GOLD_D)
      ellipse(g, cx + 8, 6, 3, 1, GOLD_D)
      ellipse(g, cx - 10, 4, 2, 1, GOLD_L)
      ellipse(g, cx + 6, 4, 2, 1, GOLD_L)
      rect(g, cx - 4, 3, 8, 8, INK)
      rect(g, cx - 3, 4, 6, 7, GOLD_D)
      rect(g, cx - 3, 4, 3, 3, GOLD)
    }
    return c
  })
}

let boxScratch: Canvas | null = null
/** The whole closed box in one canvas, so a wobble tilts it around its base. */
function closedBox(): Canvas {
  const lid = lidArt(true)
  const c = (boxScratch ??= canvas(LID.w + 2, BODY.h + lid.height + 2))
  c.g.clearRect(0, 0, c.width, c.height)
  c.g.drawImage(bodyArt(), 1 + ((LID.w - BODY.w) >> 1), 1 + lid.height - 2)
  c.g.drawImage(lid, 1, 1)
  return c
}

/** Where each thing shown sits once out: a row arched over the box, higher in the middle; smaller when many. */
function slots(n: number): { x: number; y: number; k: number }[] {
  const shown = Math.min(n, MAX_SHOWN)
  const spread = shown <= 1 ? 0 : Math.min(190, 46 * (shown - 1))
  const k = shown <= 1 ? 1 : shown <= 2 ? 0.9 : shown <= 3 ? 0.75 : shown <= 4 ? 0.65 : 0.55
  return Array.from({ length: shown }, (_, i) => {
    const f = shown <= 1 ? 0.5 : i / (shown - 1)
    const x = Math.round(BOX.x - spread / 2 + spread * f)
    // Feet lines low enough that the tallest sprite (80 art px) stays on the stage.
    const y = Math.round((shown <= 1 ? 88 : 84) - Math.sin(Math.PI * f) * (shown > 2 ? 10 : 0))
    return { x, y, k }
  })
}

interface GiftState {
  r: Rng
  fx: Particles
  amb: Particles
  bg: Canvas
}

export function giftTimeline(p: GiftParams): Timeline<GiftState> {
  const T_LAND = 0.85
  const WOB = [
    [1.35, 0.45, 6, 2],
    [2.05, 0.6, 9, 3],
    [2.9, 0.75, 13, 4],
  ] as const
  const T_UNTIE = 3.8
  // The crouch before the release, then a 4-frame hold, then the lid flies.
  const T_CROUCH = 4.21
  const T_POP = 4.4
  const n = p.contents.length
  const places = slots(n)
  const shown = places.length
  // The last slot's count when there are more than fit: itself and the rest.
  const more = n - shown + 1
  const GAP = shown <= 3 ? 0.42 : 0.28
  const T_OUT = places.map((_, i) => T_POP + 0.35 + i * GAP)
  const T_DONE = (T_OUT[shown - 1] ?? T_POP) + 0.55
  const isMore = (i: number) => n > MAX_SHOWN && i === shown - 1
  return {
    id: 'gift',
    dur: T_DONE + 1.6,
    setup() {
      return {
        r: rng(23),
        fx: new Particles(),
        amb: new Particles(),
        bg: momentBg('#fff4d6', '#ffe0c0', '#e8b07a', '#fffbea', 11),
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      if (r() < 0.07)
        s.amb.add({
          x: r.int(16, 224),
          y: r.int(14, 96),
          vy: -4,
          life: 1.2,
          shape: 'star',
          size: 1,
          colors: ['#ffffff', GOLD_L],
        })
      // Dust as it lands.
      if (t >= T_LAND && t < T_LAND + STEP * 1.5)
        for (let k = 0; k < 10; k++)
          s.fx.add({
            x: BOX.x + r.range(-22, 22),
            y: BOX.y - 1,
            vx: r.range(-40, 40),
            vy: -r.range(8, 26),
            ay: 60,
            life: 0.45,
            size: 2,
            shape: 'sq',
            colors: ['#f6e2c4', '#e8c8a0'],
          })
      // The bow springs loose: ribbon bits.
      if (t >= T_UNTIE && t < T_UNTIE + STEP * 1.5)
        for (let k = 0; k < 14; k++) {
          const a = -Math.PI * r.range(0.1, 0.9)
          const sp = r.range(50, 110)
          s.fx.add({
            x: BOX.x + r.range(-6, 6),
            y: BOX.y - BODY.h - LID.h - 4,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            ay: 220,
            life: r.range(0.6, 0.9),
            size: r.int(1, 2),
            shape: 'sq',
            colors: [GOLD_L, GOLD, GOLD_D],
          })
        }
      // The lid flies: confetti, stars, light.
      if (t >= T_POP && t < T_POP + STEP * 1.5) {
        for (let k = 0; k < 34; k++) {
          const a = -Math.PI * r.range(0.08, 0.92)
          const sp = r.range(80, 170)
          s.fx.add({
            x: BOX.x + r.range(-14, 14),
            y: BOX.y - BODY.h,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            ay: 200,
            drag: 0.6,
            life: r.range(1.0, 1.6),
            size: r.int(2, 3),
            shape: 'sq',
            colors: [CONFETTI[k % CONFETTI.length]!],
          })
        }
        for (let k = 0; k < 20; k++) {
          const a = r() * Math.PI * 2
          const sp = r.range(40, 100)
          s.fx.add({
            x: BOX.x,
            y: BOX.y - BODY.h - 6,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            drag: 2.6,
            life: r.range(0.5, 0.9),
            shape: 'star',
            size: 1,
            colors: ['#ffffff', GOLD_L, '#ffd0d8'],
          })
        }
      }
      // Each thing that comes out: a little burst where it lands; a shiny's two rings.
      places.forEach((pl, i) => {
        const t0 = T_OUT[i]! + 0.4
        if (t >= t0 && t < t0 + STEP * 1.5) {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2
            s.fx.add({
              x: pl.x,
              y: pl.y - 12 * pl.k,
              vx: Math.cos(a) * 46,
              vy: Math.sin(a) * 46,
              drag: 3.2,
              life: 0.45,
              size: 1,
              shape: 'star',
              colors: ['#ffffff', GOLD_L],
            })
          }
          if (p.contents[i]?.shiny && !isMore(i))
            for (const R of [14, 24])
              for (let k = 0; k < 10; k++) {
                const a = (k / 10) * Math.PI * 2
                s.fx.add({
                  x: pl.x,
                  y: pl.y - 16 * pl.k,
                  vx: Math.cos(a) * R * 2.2,
                  vy: Math.sin(a) * R * 2.2,
                  drag: 3,
                  life: 0.55,
                  delay: R === 24 ? 0.22 : 0,
                  size: 2,
                  shape: 'star',
                  colors: ['#ffffff', '#fff6a8', '#ffe14d'],
                })
              }
        }
      })
    },
    draw(g, s, t) {
      const sh = screenShake(t, [[T_POP, 0.3, 2]])
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(s.bg, 0, 0)
      // Its shadow on the floor, growing as it falls.
      const fall = span(t, 0.25, T_LAND)
      if (fall > 0) {
        const rx = Math.round(10 + 14 * ease.inQ(fall))
        ellipse(g, BOX.x, BOX.y + 1, rx, 3, '#d49a6a')
      }
      const bodyX = BOX.x - (BODY.w >> 1)
      const bodyY = BOX.y - BODY.h
      if (t < T_POP) {
        // Falling, landing with a squash, the wobbles, the crouch.
        const drop = t < T_LAND ? Math.round(-150 * (1 - ease.inC(span(t, 0.25, T_LAND)))) : 0
        let sx = 1
        let sy = 1
        if (within(t, T_LAND, T_LAND + 0.14)) {
          const q = Math.sin(Math.PI * span(t, T_LAND, T_LAND + 0.14))
          sx = 1 + 0.12 * q
          sy = 1 - 0.14 * q
        }
        if (within(t, T_CROUCH, T_POP)) {
          const q = ease.outQ(span(t, T_CROUCH, T_CROUCH + 0.12))
          sx = 1 + 0.1 * q
          sy = 1 - 0.12 * q
        }
        let ang = 0
        let hop = 0
        for (const [t0, d, deg, k] of WOB)
          if (within(t, t0, t0 + d)) {
            const q = span(t, t0, t0 + d)
            ang = Math.sin(q * Math.PI * k) * deg * (1 - 0.3 * q)
            hop = deg > 10 ? Math.round(Math.abs(Math.sin(q * Math.PI * k)) * 3) : 0
          }
        if (t >= T_UNTIE) {
          // Untied: the box alone, the lid sitting loose (no bow).
          const lid = lidArt(false)
          g.save()
          g.translate(BOX.x, BOX.y)
          g.scale(sx, sy)
          g.drawImage(bodyArt(), -(BODY.w >> 1), -BODY.h)
          const lift = within(t, T_UNTIE, T_UNTIE + 0.2)
            ? Math.round(Math.sin(Math.PI * span(t, T_UNTIE, T_UNTIE + 0.2)) * 3)
            : 0
          g.drawImage(lid, -(LID.w >> 1), -BODY.h - lid.height + 2 - lift)
          g.restore()
          // Light leaks under the loose lid.
          if (Math.floor(t * 12) % 2) rect(g, bodyX + 2, bodyY - 1, BODY.w - 4, 1, '#fff2b8')
        } else {
          const c = closedBox()
          g.save()
          g.translate(BOX.x, BOX.y + drop - hop)
          g.rotate((ang * Math.PI) / 180)
          g.scale(sx, sy)
          g.drawImage(c, -(c.width >> 1), -c.height + 1)
          g.restore()
        }
      } else {
        // Open: the body, the light from inside, the lid flying away.
        const q = span(t, T_POP, T_POP + 0.6)
        g.drawImage(
          glow(40, '#fff2b8', 1.4, 0.55 * (1 - 0.5 * span(t, T_DONE, T_DONE + 1))),
          BOX.x - 40,
          bodyY - 30,
        )
        g.drawImage(bodyArt(), bodyX, bodyY)
        // Its open top: the inside's shadow, lit from within.
        rect(g, bodyX + 1, bodyY, BODY.w - 2, 3, '#8a2a20')
        rect(g, bodyX + 3, bodyY, BODY.w - 6, 1, '#fff2b8')
        if (q < 1) {
          const lid = lidArt(false)
          const lt = t - T_POP
          g.save()
          g.translate(BOX.x + 70 * lt, bodyY - 6 - 330 * lt + 220 * lt * lt)
          g.rotate(lt * 7)
          g.drawImage(lid, -(LID.w >> 1), -(lid.height >> 1))
          g.restore()
          const R = Math.round(8 + 80 * ease.outC(q))
          g.drawImage(ring(R, 3, '#ffffff', 1 - q), BOX.x - R - 1, bodyY - 8 - R - 1)
        }
        // What was inside, rising out one by one.
        places.forEach((pl, i) => {
          const t0 = T_OUT[i]!
          if (t < t0) return
          const u = ease.outBack(span(t, t0, t0 + 0.4), 1.6)
          const x = Math.round(BOX.x + (pl.x - BOX.x) * u)
          const y = Math.round(bodyY + (pl.y - bodyY) * u)
          const bob = t > T_DONE ? Math.round(Math.sin((t - T_DONE) * 4 + i) * 1.5) : 0
          const flash = 1 - span(t, t0 + 0.05, t0 + 0.4)
          if (isMore(i)) {
            const label = `+${more}`
            text(g, label, x - Math.round(textWidth(label, 2) / 2), y - 16 + bob, '#ffffff', INK, 2)
            return
          }
          const c = p.contents[i]!
          // Items stay on whole pixels: twice their size alone, as they are among others.
          const k = c.kind === 'item' ? (pl.k >= 0.9 ? 2 : 1) : pl.k
          if (spriteFrame(c.key)) drawSprite(g, c.key, x, y + bob, { sx: k, sy: k, flash })
          else g.drawImage(glow(10, GOLD_L, 1.4, 0.9), x - 10, y - 20 + bob)
        })
      }
      s.amb.draw(g)
      s.fx.draw(g)
      g.restore()
      if (t < 0.4) wash(g, '#ffffff', 1 - span(t, 0, 0.4))
      if (within(t, T_POP, T_POP + 0.35)) screenFlash(g, '#ffffff', 0.85 * (1 - span(t, T_POP, T_POP + 0.35)))
    },
    cues: () => {
      const c: Cue<GiftState>[] = [
        [0.3, () => fxSound('gift.drop')],
        [T_LAND, () => fxSound('gift.land')],
        [WOB[0][0], (hud) => hud.beat?.('wobble')],
        [T_UNTIE, (hud) => hud.beat?.('untie')],
        [T_UNTIE, () => fxSound('gift.untie')],
        [T_POP, () => fxSound('gift.pop')],
        [T_DONE, (hud) => hud.beat?.('opened')],
      ]
      for (const [t0, d, , k] of WOB)
        for (let i = 0; i < k; i++) c.push([t0 + (i * d) / k, () => fxSound('gift.wobble')])
      places.forEach((_, i) => {
        c.push([T_OUT[i]!, () => fxSound('gift.item', i)])
        if (p.contents[i]?.shiny && !isMore(i)) c.push([T_OUT[i]! + 0.4, () => fxSound('gift.shiny')])
      })
      for (let i = 0; i < 4; i++) c.push([T_DONE + i * 0.13, () => fxSound('gift.fanfare', i)])
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
