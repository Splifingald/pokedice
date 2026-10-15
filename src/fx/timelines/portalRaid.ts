// Giratina's area raid in the Distortion World (docs/28 §6, docs/15 §27), on the pixel engine like the portal run's
// scenes (portal.ts) and legend.ts's entrance: the raid's stage (the void, rocks drifting upside-down, the portal turning
// far behind, floating islands to stand on) and its opening (shiny Giratina coming out of the portal). Words come from
// the screen (the raid intro's name, bars, trainers and GO!).
import { fxSound } from '@/audio/sfx'
import {
  cached,
  canvas,
  ease,
  glow,
  lerp,
  line,
  Particles,
  rect,
  ring,
  rng,
  shade,
  span,
  wash,
  bayer,
} from '../pixel'
import type { Canvas, Rng } from '../pixel'
import { layoutFor, type Point } from '../scenes'
import { drawSprite, spriteFrame } from '../sprites'
import { burstAt, drawDistorted, DW, GLITCH_DUR } from '../glitch'
import { H, screenFlash, screenShake, skippingNow, W, within, type Cue, type Timeline } from '../timeline'
import { drawRays, gleam } from './legend'
import {
  burstRings,
  crackPath,
  drawPortal,
  drawRocks,
  feedPortal,
  makeRocks,
  quiet,
  tendrils,
  voidBackdrop,
  type PortalLoop,
  type Rock,
  type SceneSize,
} from './portal'

/** A floating island to stand on: the middle of its flat top, where the feet go. */
export interface Pad {
  x: number
  y: number
  rx: number
  ry: number
}

/**
 * A floating island of the Distortion World, flat side up for a Pokémon to stand on: a mossy top with a lit violet
 * lip, the jagged rock hanging under it (lit left, dark right), a few roots dangling off it. Cached.
 */
export const padSprite = (rx: number, ry: number, seed: number): Canvas =>
  cached(`dw-pad|${rx}|${ry}|${seed}`, () => {
    const r = rng(seed * 17 + rx)
    const depth = Math.round(rx * 0.7)
    const w = rx * 2 + 3
    const cy = ry + 1
    const h = cy + ry + depth + 8
    const jag = Array.from({ length: w }, () => r.int(0, 3))
    const roots = Array.from({ length: w }, () => (r() < 0.12 ? r.int(2, 6) : 0))
    return shade(w, h, (x, y) => {
      const u = (x - rx - 1) / (rx + 0.5)
      const top = (ry + 0.5) * Math.sqrt(Math.max(0, 1 - u * u))
      // The top: an ellipse of moss, its far edge lit, the near one the stone's lip.
      if (Math.abs(y - cy) <= top) {
        const d = (y - cy) / Math.max(1, top)
        if (d < -0.75) return DW.mossLit
        if (d > 0.6) return y - cy >= top - 1 ? DW.rockEdge : DW.rockLit
        return bayer(x, y) < 0.25 + 0.35 * (d + 1) ? DW.moss : DW.mossLit
      }
      if (y < cy) return null
      // Under it: the rock narrowing to a jagged point, a dithered dark rim at its edge.
      const under = y - cy - top
      const reach = depth * Math.pow(Math.max(0, 1 - Math.abs(u)), 0.8) + jag[x]! - 1
      if (under <= reach) {
        const side = u < -0.3 ? DW.rockLit : u > 0.35 ? DW.rockDark : DW.rock
        return under > reach - 2 && bayer(x, y) < 0.5 ? DW.rockDark : side
      }
      return under - reach < roots[x]! ? DW.moss : null
    })
  })

export interface RaidStageOptions {
  /** The far portal behind everything: its middle and radius. */
  portal: Point & { R: number }
  /** The islands the Pokémon stand on. */
  pads: readonly Pad[]
  still?: boolean
}

/**
 * Giratina's raid stage on a loop (behind the raid's sprites; its card on the raid's page): the void and its far
 * islands, the portal turning far behind with motes pulled in, rocks drifting upside-down, the void's motes rising,
 * the islands the Pokémon stand on. `still`: one frame, held (motion off).
 */
export function raidStageLoop(w: number, h: number, o: RaidStageOptions): PortalLoop {
  const r = rng(w * 13 + h * 7 + 487)
  const c = { x: o.portal.x, y: o.portal.y }
  const rocks = makeRocks(r, w, h, Math.max(4, Math.round((w * h) / 6000)))
  const amb = new Particles()
  const rise = new Particles()
  const still = !!o.still
  const step = (dt: number) => {
    feedPortal(amb, r, c, o.portal.R, 0.35)
    if (r() < dt * 6)
      rise.add({
        x: r.range(0, w),
        y: h + 1,
        vy: -r.range(6, 14),
        vx: r.range(-2, 2),
        life: r.range(2.5, 4.5),
        size: 1,
        shape: 'sq',
        colors: [DW.lilac, DW.violet, DW.mid],
      })
    amb.update(dt)
    rise.update(dt)
  }
  // Warmed up, so the motes are already there on the first frame.
  if (!still) for (let i = 0; i < 150; i++) step(1 / 30)
  return {
    step(_t, dt) {
      if (!still) step(dt)
    },
    draw(g, t) {
      g.drawImage(voidBackdrop(w, h), 0, 0)
      const beat = !still && Math.floor(t * 1.25) % 2 ? 1 : 0
      drawPortal(g, c.x, c.y, o.portal.R + beat, still ? 0.4 : t, { spin: 1.2, glowK: 0.7 })
      amb.draw(g)
      drawRocks(g, rocks, t, w, still)
      rise.draw(g)
      o.pads.forEach((p, i) =>
        g.drawImage(padSprite(p.rx, p.ry, i + 1), Math.round(p.x - p.rx - 1), Math.round(p.y - p.ry - 1)),
      )
    },
  }
}

/** The battle stage's: the raid Pokémon's island on the right, the portal far behind it, yours bottom left (layoutFor's feet). */
export function raidBattleStage(still = false): PortalLoop {
  const L = layoutFor(W, H)
  return raidStageLoop(W, H, {
    portal: { x: 176, y: 46, R: 22 },
    pads: [
      { x: L.foe.x, y: L.foe.y + 1, rx: 44, ry: 10 },
      { x: L.own.x, y: L.own.y - 5, rx: 70, ry: 15 },
    ],
    still,
  })
}

/** The raid page's card (the battle's 3:2): the portal right behind the raid Pokémon, its island under it. */
export function raidCardStage(still = false): PortalLoop {
  return raidStageLoop(W, H, {
    portal: { x: 120, y: 58, R: 26 },
    pads: [{ x: 120, y: 112, rx: 48, ry: 10 }],
    still,
  })
}

export interface RaidEntranceParams extends SceneSize {
  /** Shiny Giratina's front sprite key. */
  mon: string
  short?: boolean
}

type EntranceState = {
  r: Rng
  fx: Particles
  amb: Particles
  rocks: Rock[]
  rays: Canvas
  cracks: [number, number][][]
  shakes: [number, number, number][]
}

/**
 * The entrance's stage: the screen's shape in art pixels, 3 CSS pixels per art pixel on a phone up to 4 on a big
 * screen (a step chunkier than the portal run's scenes, so Giratina fills the middle as the storm's raid Pokémon does
 * at twice its size). Its words lie over it (the name on top, the trainers at the bottom).
 */
export function raidEntranceStage(vw: number, vh: number): { w: number; h: number } {
  const s = Math.min(4, Math.max(3, Math.floor(Math.min(vw, vh) / 130)))
  return { w: Math.ceil(vw / s), h: Math.ceil(vh / s) }
}

/** When the reveal lands:the raid intro's own white-out (RaidIntro, 2.75 s), which its words follow. */
export const RAID_ENTRANCE_REVEAL = 2.75
/** How long it plays: the raid intro's (6.15 s) and a little over. */
export const RAID_ENTRANCE_DUR = 6.2

/**
 * Giratina's raid opening, the raid intro's scene for an area in portal mode (legend.ts's entrance in the Distortion
 * World): two dark pulses, a red point tears and cracks race out of it, the portal opens and turns, shadow tendrils
 * whip out of it, two heartbeats, shiny Giratina's silhouette rises out of the portal in a flickering red-and-gold
 * outline, red rays and a gleam; the reveal at RAID_ENTRANCE_REVEAL (a flash, rings, the roar, a quake), the shiny
 * sparkle; then it hovers in front of the open portal, embers rising, torn now and then as the wild Pokémon are. The
 * raid intro lays its words over it at its usual times, and keeps its Skip. `short`: its tears are the copies only.
 */
export function raidEntranceTimeline(p: RaidEntranceParams): Timeline<EntranceState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const c = { x: Math.round(w / 2), y: Math.round(h * 0.47) }
  const R = Math.max(14, Math.round(Math.min(w * 0.3, h * 0.16)))
  const T_TEAR = 0.15
  const T_OPEN = 0.45
  const T_TEND = 1.1
  const T_SIL = 1.7
  const T_RAYS = 2.2
  const T_REVEAL = RAID_ENTRANCE_REVEAL
  const T_SHINY = T_REVEAL + 0.3
  const feet = { x: c.x, y: Math.round(c.y + R * 0.95) }
  const AURA = [DW.paleGold, DW.gold, DW.red, DW.blood] as const
  return {
    id: 'portal-raid-entrance',
    dur: RAID_ENTRANCE_DUR,
    setup() {
      const r = rng(4871)
      const cracks: [number, number][][] = []
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + r.range(-0.25, 0.25)
        const L = R * r.range(1.6, 2.4)
        cracks.push(crackPath(r, c.x, c.y, c.x + Math.cos(a) * L, c.y + Math.sin(a) * L * 1.1))
      }
      return {
        r,
        fx: new Particles(),
        amb: new Particles(),
        rocks: makeRocks(r, w, h, Math.max(5, Math.round((w * h) / 5000))),
        rays: canvas(w, h),
        cracks,
        shakes: [
          [T_TEAR, 0.4, 1],
          [T_REVEAL, 0.9, 3],
        ],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      if (t > T_OPEN) feedPortal(s.amb, r, c, R, t > T_REVEAL ? 0.6 : 0.4)
      if (t > T_REVEAL && r() < 0.3)
        s.amb.add({
          x: r.range(0, w),
          y: h + 2,
          vy: -r.range(14, 30),
          life: r.range(2, 3.5),
          size: 1,
          shape: 'sq',
          colors: [DW.gold, DW.red, DW.blood, DW.mid],
        })
      if (t >= T_REVEAL && t - dt < T_REVEAL)
        for (let k = 0; k < 48; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 150)
          s.fx.add({
            x: feet.x,
            y: feet.y - 30,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: AURA,
          })
        }
      // The shiny sparkle: two rings of stars a beat apart (moments.ts's hatch).
      for (const [t0, rr] of [
        [T_SHINY, 22],
        [T_SHINY + 0.25, 34],
      ] as const)
        if (t >= t0 && t - dt < t0)
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2
            s.fx.add({
              x: feet.x + Math.cos(a) * rr * 0.4,
              y: feet.y - 34 + Math.sin(a) * rr * 0.4,
              vx: Math.cos(a) * rr * 2.2,
              vy: Math.sin(a) * rr * 2.2,
              drag: 3,
              life: 0.55,
              size: 2,
              shape: 'star',
              colors: ['#ffffff', '#fff6a8', '#ffe14d'],
            })
          }
    },
    draw(g, s, t) {
      const sh = screenShake(t, s.shakes)
      g.fillStyle = DW.night
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(voidBackdrop(w, h), 0, 0)
      drawRocks(g, s.rocks, t, w)
      // Two dark pulses, then the dark held while it comes, lifting with the reveal.
      let dark = Math.max(
        0.75 * Math.sin(Math.PI * span(t, 0, 0.3)),
        0.75 * Math.sin(Math.PI * span(t, 0.35, 0.65)),
      )
      if (t >= 0.3 && t < T_REVEAL) dark = Math.max(dark, lerp(0.75, 0.45, span(t, 0.3, 1)))
      if (t >= T_REVEAL) dark = lerp(0.45, 0.12, span(t, T_REVEAL, T_REVEAL + 0.6))
      if (dark > 0) wash(g, DW.night, dark, 8)
      if (t > T_RAYS) {
        drawRays(
          s.rays,
          { x: feet.x, y: feet.y - 30 },
          t,
          t > T_REVEAL ? DW.blood : DW.red,
          span(t, T_RAYS, T_RAYS + 0.5) * (t > T_REVEAL + 0.4 ? 0.5 : 1),
        )
        g.drawImage(s.rays, 0, 0)
      }
      // The tear: a red point flickering, its cracks racing out, then the portal opening from a slit.
      if (t >= T_TEAR && t < T_OPEN + 0.2 && Math.floor(t * 20) % 3) {
        rect(g, c.x - 1, c.y - 1, 3, 3, DW.red)
        rect(g, c.x, c.y, 1, 1, DW.paleGold)
      }
      const ck = ease.outC(span(t, T_TEAR, T_OPEN + 0.25))
      if (ck > 0 && t < T_OPEN + 0.7)
        for (const pts of s.cracks) {
          const n = Math.max(1, Math.floor(pts.length * ck))
          for (let i = 1; i < n; i++)
            line(g, pts[i - 1]![0] + 1, pts[i - 1]![1] + 1, pts[i]![0] + 1, pts[i]![1] + 1, DW.red)
          for (let i = 1; i < n; i++)
            line(g, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], DW.night, 2)
        }
      const open = ease.outBack(span(t, T_OPEN, T_OPEN + 0.7), 1.4)
      const beat = t > T_REVEAL && Math.floor(t * 1.25) % 2 ? 1 : 0
      drawPortal(g, c.x, c.y, R + beat, t, { open, spin: t < T_REVEAL ? 3 : 1.8 })
      s.amb.draw(g)
      // Shadow tendrils whipping out of it (Shadow Force), drawn back in for the reveal.
      if (t > T_TEND && t < T_REVEAL + 0.2)
        tendrils(g, c, R, t, span(t, T_TEND, T_TEND + 0.7) * (1 - span(t, T_REVEAL - 0.1, T_REVEAL + 0.2)))
      for (const hb of [1.5, 1.8]) {
        const q = span(t, hb, hb + 0.3)
        if (q > 0 && q < 1) {
          const gr = Math.round(R * 1.1)
          g.drawImage(glow(gr, DW.blood, 1.3, 0.7 * Math.sin(Math.PI * q)), c.x - gr, c.y - gr)
        }
      }
      if (t >= T_SIL) {
        const fh = spriteFrame(p.mon)?.height ?? 64
        if (t < T_REVEAL) {
          // Rising out of the portal: what is still below its middle shows only inside it.
          const q = ease.outC(span(t, T_SIL, T_REVEAL - 0.15))
          const lift = Math.round((1 - q) * (fh * 0.8))
          g.save()
          g.beginPath()
          g.rect(-10, -10, w + 20, c.y + 10)
          g.ellipse(c.x, c.y, R, R * 1.12, 0, 0, Math.PI * 2)
          g.clip()
          drawSprite(g, p.mon, feet.x, feet.y + lift, {
            sil: '#06020c',
            outline: Math.floor(t * 12) % 3 === 0 ? AURA[0] : AURA[2],
          })
          g.restore()
          const gp = span(t, T_RAYS + 0.25, T_RAYS + 0.55)
          if (gp > 0 && gp < 1) gleam(g, p.mon, feet, lift, gp)
        } else {
          // Out: it hovers a pixel up and down in steps, and now and then tears as the wild Pokémon do.
          const bob = Math.floor((t - T_REVEAL) * 1.6) % 2
          const flash = 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4)
          const b = t > T_REVEAL + 0.9 ? burstAt(t - T_REVEAL, 1.6, GLITCH_DUR, 11) : null
          if (b) drawDistorted(g, p.mon, feet.x, feet.y - bob, b, p.short)
          else
            drawSprite(g, p.mon, feet.x, feet.y - bob, {
              flash: Math.max(0, flash),
              outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
            })
        }
      }
      burstRings(g, { x: feet.x, y: feet.y - 30 }, t, T_REVEAL, Math.round(Math.max(w, h) * 0.6), [
        [0, DW.paleGold],
        [0.14, DW.red],
        [0.28, DW.lilac],
      ])
      for (const d of [0.05, 0.2, 0.35]) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.45)
        if (q > 0 && q < 1) {
          const rr = Math.round(10 + 40 * q)
          g.drawImage(ring(rr, 2, '#ffffff', 1 - q), feet.x - rr - 1, feet.y - 34 - rr - 1)
        }
      }
      s.fx.draw(g)
      g.restore()
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.85 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
    },
    // Skipped (the raid's Skip, motion off), it lands on its end without its sounds piling up.
    cues: () =>
      [
        [0.02, () => quiet('legend.pulse')],
        [T_TEAR + 0.05, () => quiet('portal.breach')],
        [0.36, () => quiet('legend.pulse')],
        [1.5, () => quiet('legend.heart')],
        [1.8, () => quiet('legend.heart')],
        [T_REVEAL, (hud) => (quiet('legend.roar'), hud.beat?.('roar'))],
        [T_SHINY, () => !skippingNow() && fxSound('hatch.shiny', 0)],
        [T_SHINY + 0.12, () => !skippingNow() && fxSound('hatch.shiny', 1)],
      ] satisfies Cue<EntranceState>[],
  }
}
