// The Pokémon Center, in its picture (scenes.ts CENTER_ART; the drawn room until it loads): a Poké Ball per team
// member drops into one of the machine's three slots, the games' heal jingle lights them in turn, they flash together,
// the team is healed, Chansey hops behind the counter, the balls lift out. Meanwhile the wall screen switches on and
// shows the team being healed: each Pokémon slides in as a silhouette, a scan line reveals it in colour while its HP
// bar fills, then the whole team lines up, healed, under a heart.
// Short motion: the balls are already in place, one flash, the team on the screen, healed.
import { fxSound } from '@/audio/sfx'
import {
  ease,
  ellipse,
  glow,
  lerp,
  Particles,
  px,
  rect,
  rng,
  span,
  wash,
  type Canvas,
  type G,
  type Rng,
} from '../pixel'
import { ball, CENTER, CENTER_ART, centerRoom, SLOTS } from '../scenes'
import { drawSprite, silhouette, spriteFrame } from '../sprites'
import { H, screenFlash, STEP, W, within, type Cue, type Timeline } from '../timeline'

export interface CenterParams {
  /** How many balls go on the machine (the team's size, 1–3). */
  balls: number
  /** Chansey's front sprite key, behind the counter. */
  nurse: string
  /** The team's front sprite keys, loaded, for the wall screen (none: the screen shows a heart trace). */
  team?: readonly string[]
  short?: boolean
}

interface S {
  r: Rng
  fx: Particles
}

/** The wall screen's colours: its dark glass, the grid dots, the scan light. */
const TV = { glass: '#123a4f', dot: '#1e5a70', scan: '#5fe0c8', line: '#0a1a26' }
/** A small heart for the screen once the team is healed. */
const HEART = ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..']

// The screen draws each sprite's loaded frame, already cut to its art box (sprites.ts crop), scaled to fit. It never
// reads pixels back: Showdown's sprites come without CORS headers, so the canvas could not.
const tight = (key: string): Canvas | null => spriteFrame(key) ?? null
const tightSil = (key: string, color: string): Canvas | null => silhouette(key, color)

export function centerTimeline(p: CenterParams): Timeline<S> {
  const n = Math.max(1, Math.min(SLOTS.length, p.balls))
  const short = !!p.short
  const team = (p.team ?? []).slice(0, 6)
  const PLACE = (i: number) => (short ? 0 : 0.7 + i * 0.3)
  // The jingle's seven notes (sfx 'center.note', timed like the games' tune), or a single flash when short.
  const NOTES = short ? [0.45] : [2.1, 2.38, 2.6, 2.82, 3.08, 3.32, 3.5]
  const LAST = NOTES[NOTES.length - 1]!
  const T_HEAL = LAST + 0.1
  const T_JOY = LAST + 0.35
  const LIFT = (i: number) => (short ? 1.0 + i * 0.08 : 4.7 + i * 0.15)
  const dur = short ? 1.6 : 6.4
  const seat = (k: number) => k % n
  // The screen switches on as the first ball sets down; each Pokémon then gets an equal turn on it until the last note.
  const T_ON = short ? 0.05 : PLACE(0) + 0.22
  const T_SCAN = T_ON + 0.25
  const SEG = team.length ? (LAST - T_SCAN) / team.length : 0
  // Where things sit: in the picture's room, or in the drawn one (which keeps its own slots and smaller balls).
  const place = () => {
    const art = centerRoom(W, H).art
    return {
      art,
      // A lone ball sits in the middle slot, not off to one side; two fill the first two, as the games do.
      slots: n === 1 ? [(art ? CENTER_ART.slots : SLOTS)[1]!] : (art ? CENTER_ART.slots : SLOTS).slice(0, n),
      R: art ? CENTER_ART.ballR : 5,
      screen: art ? CENTER_ART.screen : ([35, 20, 69, 40] as const),
      counterY: art ? CENTER_ART.counterY : 100,
      machineY: art ? 80 : 92,
    }
  }

  /** The wall screen: off, switching on, a Pokémon at a time being scanned, then the healed team in a row. */
  function drawScreen(g: G, t: number, screen: readonly [number, number, number, number]) {
    const [x0, y0, x1, y1] = screen
    const sw = x1 - x0
    const sh = y1 - y0
    if (t < T_ON) return
    // Switching on: a bright line opens across the middle, then the picture opens up from it.
    const on = span(t, T_ON, T_ON + 0.25)
    if (on < 1) {
      const wv = on < 0.5 ? Math.round(sw * ease.outC(on * 2)) : sw
      const hv = on < 0.5 ? 1 : Math.max(1, Math.round(sh * ease.outC((on - 0.5) * 2)))
      rect(
        g,
        x0 + Math.round((sw - wv) / 2),
        y0 + Math.round((sh - hv) / 2),
        wv,
        hv,
        on < 0.5 ? '#ffffff' : TV.glass,
      )
      if (on >= 0.5) rect(g, x0, y0 + Math.round(sh / 2), sw, 1, '#ffffff')
      return
    }
    g.save()
    g.beginPath()
    g.rect(x0, y0, sw, sh)
    g.clip()
    rect(g, x0, y0, sw, sh, TV.glass)
    for (let y = y0 + 2; y < y1; y += 4) for (let x = x0 + 2; x < x1; x += 4) px(g, x, y, TV.dot)
    if (!team.length) heartTrace(g, t, screen)
    else if (t < LAST && !short) scanOne(g, t, screen)
    else healedRow(g, t, screen)
    // Scan lines and a glint on the glass, so it reads as a screen.
    g.globalAlpha = 0.18
    for (let y = y0 + 1; y < y1; y += 2) rect(g, x0, y, sw, 1, TV.line)
    g.globalAlpha = 0.25
    for (let k = 0; k < 6; k++) px(g, x0 + 2 + k, y0 + 1 + Math.floor(k / 2), '#ffffff')
    g.globalAlpha = 1
    g.restore()
  }

  /** One Pokémon's turn: in from the right as a silhouette, a scan line paints it in colour, its HP bar fills. */
  function scanOne(g: G, t: number, [x0, y0, x1, y1]: readonly [number, number, number, number]) {
    const sw = x1 - x0
    const sh = y1 - y0
    const i = Math.min(team.length - 1, Math.max(0, Math.floor((t - T_SCAN) / SEG)))
    const q = span(t, T_SCAN + i * SEG, T_SCAN + (i + 1) * SEG)
    const key = team[i]!
    const frame = tight(key)
    const bar = { x: x0 + 5, y: y1 - 4, w: sw - 10 }
    if (frame) {
      const k = Math.min((sh - 8) / frame.height, (sw - 8) / frame.width)
      const dw = Math.max(1, Math.round(frame.width * k))
      const dh = Math.max(1, Math.round(frame.height * k))
      const slide = Math.round((1 - ease.outC(span(q, 0, 0.15))) * sw)
      const dx = Math.round(x0 + (sw - dw) / 2) + slide
      const dy = bar.y - 2 - dh
      const sil = tightSil(key, TV.scan)
      if (sil) g.drawImage(sil, dx, dy, dw, dh)
      // Painted in colour down to the scan line.
      const r = ease.ioQ(span(q, 0.15, 0.6))
      const rows = Math.round(dh * r)
      if (rows > 0) {
        const src = Math.max(1, Math.round((rows / dh) * frame.height))
        g.drawImage(frame, 0, 0, frame.width, src, dx, dy, dw, rows)
      }
      if (r > 0 && r < 1) {
        rect(g, dx - 3, dy + rows, dw + 6, 1, '#ffffff')
        g.globalAlpha = 0.4
        rect(g, dx - 3, dy + rows - 1, dw + 6, 1, TV.scan)
        g.globalAlpha = 1
      }
      // Healed: a white flash over it.
      const fl = span(q, 0.88, 1)
      if (fl > 0 && fl < 1) {
        const white = tightSil(key, '#ffffff')
        if (white) {
          g.globalAlpha = 1 - fl
          g.drawImage(white, dx, dy, dw, dh)
          g.globalAlpha = 1
        }
      }
    }
    // Its HP bar fills from the red, through yellow, to green.
    const f = 0.12 + 0.88 * ease.ioQ(span(q, 0.5, 0.88))
    rect(g, bar.x - 1, bar.y - 1, bar.w + 2, 4, '#24304f')
    rect(g, bar.x, bar.y, bar.w, 2, '#3a4466')
    rect(
      g,
      bar.x,
      bar.y,
      Math.max(1, Math.round(bar.w * f)),
      2,
      f < 0.35 ? '#f2553f' : f < 0.7 ? '#ffbe2e' : '#4ad07a',
    )
  }

  /** Every Pokémon of the team side by side, bouncing in, full HP, under a heart. */
  function healedRow(g: G, t: number, [x0, y0, x1, y1]: readonly [number, number, number, number]) {
    const sw = x1 - x0
    const sh = y1 - y0
    const m = team.length
    const cell = sw / m
    team.forEach((key, i) => {
      const frame = tight(key)
      if (!frame) return
      const k = Math.min((sh - 9) / frame.height, (cell - 2) / frame.width)
      const dw = Math.max(1, Math.round(frame.width * k))
      const dh = Math.max(1, Math.round(frame.height * k))
      const t0 = (short ? T_SCAN : LAST) + i * 0.08
      const drop = Math.round((1 - ease.outBack(span(t, t0, t0 + 0.3), 1.6)) * -sh)
      const hop = t > T_JOY ? -Math.round(Math.abs(Math.sin((t - T_JOY + i * 0.15) * 7)) * 2) : 0
      const cx = Math.round(x0 + cell * (i + 0.5))
      const dy = y1 - 4 - dh + drop + hop
      g.drawImage(frame, cx - Math.round(dw / 2), dy, dw, dh)
      rect(g, cx - Math.round(dw / 2), y1 - 3, dw, 1, '#4ad07a')
    })
    if (t > T_JOY)
      for (let r = 0; r < 5; r++)
        for (let q = 0; q < 5; q++) if (HEART[r]![q] === 'x') px(g, x1 - 7 + q, y0 + 2 + r, '#ff7aa0')
  }

  /** No team to show (a preview): the heart monitor's trace, spiking on each note. */
  function heartTrace(g: G, t: number, [x0, y0, x1, y1]: readonly [number, number, number, number]) {
    const base = Math.round((y0 + y1) / 2)
    for (let x = x0 + 2; x < x1 - 1; x++) {
      const ts = t - (x1 - 1 - x) * 0.012
      let v = 0
      for (const tn of NOTES) {
        const d = ts - tn
        if (d > 0 && d < 0.08) v = Math.max(v, Math.round(Math.sin((d / 0.08) * Math.PI * 2) * 7))
      }
      const beat = ts > 0.3 ? Math.round(Math.max(0, Math.sin(ts * 7.5) - 0.92) * 30) : 0
      px(g, x, base - v - beat, CENTER.light)
    }
    if (t > T_JOY)
      for (let r = 0; r < 5; r++)
        for (let q = 0; q < 5; q++) if (HEART[r]![q] === 'x') px(g, x1 - 9 + q, y0 + 3 + r, '#ff7aa0')
  }

  return {
    id: 'center',
    dur,
    setup: () => ({ r: rng(5), fx: new Particles() }),
    step(s, t, dt) {
      s.fx.update(dt)
      const r = s.r
      const at = place()
      NOTES.forEach((tn, i) => {
        if (t >= tn && t < tn + STEP * 1.5) {
          const [x, y] = at.slots[seat(i)]!
          s.fx.add({
            x: x + 2,
            y: y - at.R - 2,
            vx: r.range(-6, 6),
            vy: -26,
            life: 1.1,
            shape: 'note',
            colors: [CENTER.light, CENTER.light, '#ffffff'],
          })
        }
      })
      if (t >= LAST && t < LAST + STEP * 1.5)
        for (let k = 0; k < 14; k++)
          s.fx.add({
            x: r.range(90, 150),
            y: r.range(at.machineY - 10, at.machineY + 4),
            vx: r.range(-12, 12),
            vy: -r.range(20, 45),
            drag: 0.6,
            life: r.range(1.0, 1.6),
            shape: k % 3 ? 'heart' : 'cross',
            colors: k % 3 ? ['#ff7aa0', '#ff9ab8'] : ['#4ad07a'],
          })
      // A green cross sparkles on the screen as each Pokémon's scan finishes.
      if (team.length && !short)
        team.forEach((_, i) => {
          const tf = T_SCAN + (i + 0.9) * SEG
          if (t >= tf && t < tf + STEP * 1.5) {
            const [, y0, x1] = at.screen
            for (let k = 0; k < 2; k++)
              s.fx.add({
                x: x1 - 5 - k * 5,
                y: y0 + 5 + k * 2,
                vy: -8,
                life: 0.45,
                shape: 'cross',
                colors: ['#4ad07a'],
              })
          }
        })
      if (!short)
        at.slots.forEach(([x, y], i) => {
          if (t >= PLACE(i) + 0.22 && t < PLACE(i) + 0.22 + STEP * 1.5)
            s.fx.add({ x, y: y - 3, life: 0.2, size: 3, size1: 1, shape: 'star', colors: ['#ffffff'] })
        })
    },
    draw(g, s, t) {
      const P = CENTER
      const room = centerRoom(W, H)
      const bg = room.cv
      const at = place()
      g.drawImage(bg, 0, 0)
      drawScreen(g, t, at.screen)
      // Chansey behind the counter, hopping when it's done.
      const hop =
        t > T_JOY && t < T_JOY + 0.5 ? -Math.round(Math.abs(Math.sin((t - T_JOY) * Math.PI * 4)) * 4) : 0
      drawSprite(
        g,
        p.nurse,
        room.art ? CENTER_ART.nurseX : 194,
        at.counterY + (room.art ? CENTER_ART.nurseSink : 6) + hop,
      )
      g.drawImage(bg, 0, at.counterY, W, H - at.counterY, 0, at.counterY, W, H - at.counterY)
      // The machine and the counter's raised end stand in front of her.
      if (room.art) for (const [x, y, w, h] of CENTER_ART.front) g.drawImage(bg, x, y, w, h, x, y, w, h)
      if (within(t, LAST, LAST + 0.7)) {
        // The heal bloom sits behind the balls, so the balls stay crisp on top of it.
        const q = span(t, LAST, LAST + 0.7)
        g.drawImage(glow(40, '#ffe0ec', 1.5, 0.8 * (1 - q)), 120 - 40, at.machineY - 40)
      }
      // Light bar on top of the machine.
      const pulse = NOTES.some((tn) => within(t, tn, tn + 0.12)) || within(t, LAST, LAST + 0.5)
      const lit = pulse ? '#ffffff' : t > NOTES[0]! - 0.1 && t < T_HEAL + 0.2 ? P.light : null
      // The picture has its own strip, unlit: only a lit one is drawn over it.
      if (room.art) {
        if (lit) rect(g, ...CENTER_ART.strip, lit)
      } else rect(g, 106, 77, 28, 3, lit ?? P.machine[0])
      // The balls, sitting down into their slots.
      const R = at.R
      at.slots.forEach(([x, y], i) => {
        const t0 = PLACE(i)
        if (t < t0) return
        const lift = span(t, LIFT(i), LIFT(i) + 0.3)
        if (lift >= 1) return
        if (lift > 0.5 && Math.floor(t * 30) % 2) return
        const drop = short ? 1 : ease.outBounce(span(t, t0, t0 + 0.25))
        const by = lerp(y - 30, y - (room.art ? 1 : 2), drop) - 26 * ease.inQ(lift)
        const lit = short || t > t0 + 0.22
        if (lit && lift === 0) ellipse(g, x, y + (room.art ? 3 : 1), R - 1, 2, P.light)
        const k = NOTES.findIndex((tn) => within(t, tn, tn + 0.15))
        const flash = (k >= 0 && seat(k) === i) || within(t, LAST, LAST + 0.3)
        const im = ball('poke', 0, { R, button: flash ? '#ffffff' : lit ? P.light : '#ffffff' })
        if (flash) g.drawImage(glow(R + 4, '#ffffff', 1.6, 0.85), x - R - 4, Math.round(by - R - 4))
        g.drawImage(im, Math.round(x - im.width / 2), Math.round(by - im.height / 2))
        if (flash && k >= 0 && seat(k) === i) rect(g, x - 1, Math.round(by) - 1, 2, 2, '#ffffff')
      })
      s.fx.draw(g)
      if (!short && t < 0.5) wash(g, '#ffffff', 1 - span(t, 0, 0.5))
      if (within(t, LAST, LAST + 2 / 60)) screenFlash(g, '#ffe6f0', 0.5)
    },
    cues: () => {
      const c: Cue<S>[] = [
        [T_HEAL, (hud) => hud.heal?.()],
        [T_JOY, (hud) => hud.beat?.('healed')],
      ]
      if (!short) for (let i = 0; i < n; i++) c.push([PLACE(i) + 0.22, () => fxSound('center.place', i)])
      NOTES.forEach((tn, i) => c.push([tn, () => fxSound('center.note', short ? 6 : i)]))
      return c.sort((a, b) => a[0] - b[0])
    },
  }
}
