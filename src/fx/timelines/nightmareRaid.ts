// Darkrai's area raid in the nightmare's look (docs/30, docs/15 §29), on the pixel engine like the nightmare's scenes
// (nightmare.ts) and Giratina's raid (portalRaid.ts): the raid's stage (the night, the full moon right behind the raid
// Pokémon, smoke drifting up, moonlit rocks to stand on) and its opening (shiny Darkrai taking shape out of the smoke in
// front of the moon). Words come from the screen (the raid intro's name, bars, trainers and GO!).
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  cached,
  canvas,
  ease,
  Particles,
  ring,
  rng,
  shade,
  span,
  wash,
  lerp,
  type Canvas,
  type Rng,
} from '../pixel'
import { layoutFor, type Point } from '../scenes'
import { drawSprite } from '../sprites'
import { H, screenFlash, screenShake, skippingNow, W, within, type Cue, type Timeline } from '../timeline'
import { drawRays, gleam } from './legend'
import { burstRings, quiet, type PortalLoop, type SceneSize } from './portal'
import { RAID_ENTRANCE_DUR, RAID_ENTRANCE_REVEAL } from './portalRaid'
import {
  drawMoon,
  drawShadow,
  drawStars,
  feedSmoke,
  makeStars,
  NM,
  nightSky,
  smokeBank,
  smokeTendrils,
} from './nightmare'

/** A rock to stand on: its flat top silvered by the moon, its body black-blue, a dithered rim. Cached. */
export const rockPad = (rx: number, ry: number, seed: number): Canvas =>
  cached(`nm-pad|${rx}|${ry}|${seed}`, () => {
    const r = rng(seed * 19 + rx)
    const depth = Math.round(rx * 0.5)
    const w = rx * 2 + 3
    const cy = ry + 1
    const h = cy + ry + depth + 4
    const jag = Array.from({ length: w }, () => r.int(0, 3))
    return shade(w, h, (x, y) => {
      const u = (x - rx - 1) / (rx + 0.5)
      const top = (ry + 0.5) * Math.sqrt(Math.max(0, 1 - u * u))
      if (Math.abs(y - cy) <= top) {
        const d = (y - cy) / Math.max(1, top)
        // Moonlight on the far edge of its top, the stone's dark under.
        if (d < -0.7) return NM.haze
        if (d > 0.6) return y - cy >= top - 1 ? NM.lilac : NM.mid
        return bayer(x, y) < 0.3 + 0.3 * (d + 1) ? NM.dark : NM.mid
      }
      if (y < cy) return null
      const under = y - cy - top
      const reach = depth * Math.pow(Math.max(0, 1 - Math.abs(u)), 0.7) + jag[x]! - 1
      if (under <= reach)
        return under > reach - 2 && bayer(x, y) < 0.5 ? NM.night : u < -0.3 ? NM.dark : NM.deep
      return null
    })
  })

export interface NightStageOptions {
  /** The moon behind everything: its middle and radius. */
  moon: Point & { R: number }
  /** The rocks the Pokémon stand on. */
  pads: readonly { x: number; y: number; rx: number; ry: number }[]
  /** Smoke rising off the foe's rock (the raid Pokémon, a nightmare's foe): its feet. */
  foe?: Point
  still?: boolean
}

/**
 * The nightmare's stage on a loop (behind a fight's sprites; its card on the raid's page): the night and its stars, the
 * full moon, smoke drifting up from below and rising off the foe's rock, the rocks to stand on. `still`: one frame.
 */
export function nightStageLoop(w: number, h: number, o: NightStageOptions): PortalLoop {
  const r = rng(w * 17 + h * 5 + 491)
  const stars = makeStars(r, w, h)
  const amb = new Particles()
  const wisps = new Particles()
  const still = !!o.still
  const step = (dt: number) => {
    feedSmoke(amb, r, w, h, 0.25)
    if (o.foe && r() < dt * 5)
      wisps.add({
        x: o.foe.x + r.range(-22, 22),
        y: o.foe.y + 2,
        vx: r.range(-3, 3),
        vy: -r.range(8, 16),
        life: r.range(1.2, 2.2),
        size: r.int(2, 4),
        shape: 'smoke',
        colors: [NM.smoke, NM.smokeLit, NM.smokeEdge],
        light: NM.smokeLit,
      })
    amb.update(dt)
    wisps.update(dt)
  }
  if (!still) for (let i = 0; i < 150; i++) step(1 / 30)
  return {
    step(_t, dt) {
      if (!still) step(dt)
    },
    draw(g, t) {
      g.drawImage(nightSky(w, h), 0, 0)
      drawStars(g, stars, t, still)
      drawMoon(g, o.moon.x, o.moon.y, o.moon.R, 0.65)
      amb.draw(g)
      smokeBank(g, w, h, t, 0.6, still)
      o.pads.forEach((p, i) =>
        g.drawImage(rockPad(p.rx, p.ry, i + 1), Math.round(p.x - p.rx - 1), Math.round(p.y - p.ry - 1)),
      )
      wisps.draw(g)
    },
  }
}

/** The battle stage's: the foe's rock on the right with the moon behind it, yours bottom left (layoutFor's feet). */
export function nightBattleStage(still = false): PortalLoop {
  const L = layoutFor(W, H)
  return nightStageLoop(W, H, {
    moon: { x: L.foe.x + 4, y: 44, R: 30 },
    pads: [
      { x: L.foe.x, y: L.foe.y + 1, rx: 44, ry: 10 },
      { x: L.own.x, y: L.own.y - 5, rx: 70, ry: 15 },
    ],
    foe: { x: L.foe.x, y: L.foe.y },
    still,
  })
}

/** The raid page's card (the battle's 3:2): the moon right behind the raid Pokémon, its rock under it. */
export function nightCardStage(still = false): PortalLoop {
  return nightStageLoop(W, H, {
    moon: { x: 120, y: 60, R: 40 },
    pads: [{ x: 120, y: 112, rx: 48, ry: 10 }],
    foe: { x: 120, y: 112 },
    still,
  })
}

export interface NightEntranceParams extends SceneSize {
  /** Shiny Darkrai's front sprite key. */
  mon: string
  short?: boolean
}

type EntranceState = {
  r: Rng
  stars: ReturnType<typeof makeStars>
  fx: Particles
  amb: Particles
  rays: Canvas
  shakes: [number, number, number][]
}

/**
 * Darkrai's raid opening, the raid intro's scene for an area in nightmare mode (legend.ts's entrance under the full
 * moon): two dark pulses, the night closing in, the moon rising behind, smoke gathering into a column in front of it,
 * two heartbeats, shiny Darkrai's shadow taking shape out of the smoke (its outline flickering ice-blue), cold rays and a
 * gleam; the reveal at the raid intro's white-out (a flash, rings, the roar, a quake, a burst of smoke and ice), the
 * shiny sparkle; then it hovers in front of the moon, smoke trailing off it. The raid intro lays its words over it at
 * their usual times; like Giratina's, it has no Skip.
 */
export function nightRaidEntranceTimeline(p: NightEntranceParams): Timeline<EntranceState> {
  const w = p.w ?? W
  const h = p.h ?? H
  const c = { x: Math.round(w / 2), y: Math.round(h * 0.45) }
  const R = Math.max(16, Math.round(Math.min(w * 0.38, h * 0.2)))
  const T_MOON = 0.3
  const T_SMOKE = 0.9
  const T_SIL = 1.7
  const T_RAYS = 2.2
  const T_REVEAL = RAID_ENTRANCE_REVEAL
  const T_SHINY = T_REVEAL + 0.3
  const feet = { x: c.x, y: Math.round(c.y + R * 0.95) }
  const AURA = [NM.ice, NM.cyan, NM.violet, NM.red] as const
  return {
    id: 'nightmare-raid-entrance',
    dur: RAID_ENTRANCE_DUR,
    setup() {
      const r = rng(4914)
      return {
        r,
        stars: makeStars(r, w, h),
        fx: new Particles(),
        amb: new Particles(),
        rays: canvas(w, h),
        shakes: [[T_REVEAL, 0.9, 3]],
      }
    },
    step(s, t, dt) {
      s.fx.update(dt)
      s.amb.update(dt)
      const r = s.r
      feedSmoke(s.amb, r, w, h, t > T_REVEAL ? 0.4 : 0.25)
      // The smoke gathering into a column in front of the moon, then pouring off it once it's out.
      if (t > T_SMOKE && r() < 0.8)
        s.fx.add({
          x: feet.x + r.range(-R * 0.6, R * 0.6),
          y: feet.y + r.range(-4, 8),
          vx: r.range(-6, 6),
          vy: -r.range(12, 30),
          home: t < T_REVEAL ? { x: feet.x, y: feet.y - 30, k: 50 } : undefined,
          life: r.range(0.6, 1.2),
          size: r.int(2, 5),
          shape: 'smoke',
          colors: [NM.smoke, NM.smokeLit, NM.smokeEdge],
          light: NM.smokeLit,
        })
      if (t >= T_REVEAL && t - dt < T_REVEAL)
        for (let k = 0; k < 48; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 150)
          s.fx.add({
            x: feet.x,
            y: feet.y - 32,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.5 ? 'star' : 'sq',
            colors: AURA,
          })
        }
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
      g.fillStyle = NM.night
      g.fillRect(0, 0, w, h)
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(nightSky(w, h), 0, 0)
      drawStars(g, s.stars, t)
      const rise = ease.outC(span(t, T_MOON, T_MOON + 0.9))
      drawMoon(g, c.x, Math.round(lerp(h + R, c.y, rise)), R, 0.75 * rise)
      let dark = Math.max(
        0.75 * Math.sin(Math.PI * span(t, 0, 0.3)),
        0.75 * Math.sin(Math.PI * span(t, 0.35, 0.65)),
      )
      if (t >= 0.3 && t < T_REVEAL) dark = Math.max(dark, lerp(0.6, 0.35, span(t, 0.3, 1)))
      if (t >= T_REVEAL) dark = lerp(0.35, 0.08, span(t, T_REVEAL, T_REVEAL + 0.6))
      if (dark > 0) wash(g, NM.night, dark, 8)
      if (t > T_RAYS) {
        drawRays(
          s.rays,
          { x: feet.x, y: feet.y - 32 },
          t,
          t > T_REVEAL ? NM.halo : NM.cyan,
          span(t, T_RAYS, T_RAYS + 0.5) * (t > T_REVEAL + 0.4 ? 0.5 : 1),
        )
        g.drawImage(s.rays, 0, 0)
      }
      for (const hb of [1.5, 1.8]) {
        const q = span(t, hb, hb + 0.3)
        if (q > 0 && q < 1) {
          const gr = Math.round(R * 1.2)
          g.drawImage(ring(gr, 3, NM.blood, 0.7 * Math.sin(Math.PI * q)), c.x - gr - 1, c.y - gr - 1)
        }
      }
      if (t >= T_SIL) {
        if (t < T_REVEAL) {
          // Its shadow taking shape out of the smoke: fading in from the dark, its outline flickering.
          const q = span(t, T_SIL, T_REVEAL - 0.2)
          drawShadow(g, p.mon, feet.x, feet.y, t, 0.25 + 0.75 * q)
          const gp = span(t, T_RAYS + 0.25, T_RAYS + 0.55)
          if (gp > 0 && gp < 1) gleam(g, p.mon, feet, 0, gp)
        } else {
          const bob = Math.floor((t - T_REVEAL) * 1.6) % 2
          drawSprite(g, p.mon, feet.x, feet.y - bob, {
            flash: Math.max(0, 1 - span(t, T_REVEAL + 0.05, T_REVEAL + 0.4)),
            outline: Math.floor(t * 8) % 2 ? AURA[1] : AURA[2],
          })
        }
      }
      s.fx.draw(g)
      smokeTendrils(
        g,
        w,
        h,
        t,
        span(t, T_SMOKE, T_SMOKE + 0.8) * (1 - 0.6 * span(t, T_REVEAL, T_REVEAL + 0.4)),
        8,
      )
      burstRings(g, { x: feet.x, y: feet.y - 32 }, t, T_REVEAL, Math.round(Math.max(w, h) * 0.6), [
        [0, NM.ice],
        [0.14, NM.cyan],
        [0.28, NM.violet],
      ])
      for (const d of [0.05, 0.2, 0.35]) {
        const q = span(t, T_REVEAL + d, T_REVEAL + d + 0.45)
        if (q > 0 && q < 1) {
          const rr = Math.round(10 + 40 * q)
          g.drawImage(ring(rr, 2, '#ffffff', 1 - q), feet.x - rr - 1, feet.y - 34 - rr - 1)
        }
      }
      s.amb.draw(g)
      smokeBank(g, w, h, t, 0.7)
      g.restore()
      if (within(t, T_REVEAL, T_REVEAL + 0.3))
        screenFlash(g, '#ffffff', 0.85 * (1 - span(t, T_REVEAL, T_REVEAL + 0.3)))
    },
    cues: () =>
      [
        [0.02, () => quiet('legend.pulse')],
        [T_MOON, () => quiet('nightmare.fall')],
        [0.36, () => quiet('legend.pulse')],
        [T_SMOKE, () => quiet('nightmare.breath')],
        [1.5, () => quiet('legend.heart')],
        [1.8, () => quiet('legend.heart')],
        [T_REVEAL, (hud) => (quiet('legend.roar'), hud.beat?.('roar'))],
        [T_SHINY, () => !skippingNow() && fxSound('hatch.shiny', 0)],
        [T_SHINY + 0.12, () => !skippingNow() && fxSound('hatch.shiny', 1)],
      ] satisfies Cue<EntranceState>[],
  }
}
