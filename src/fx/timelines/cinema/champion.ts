// A champion's own entrance on the battle stage (docs/56): the scene is each champion's (Red on Mt. Silver's summit,
// Leon's stadium…); what follows its reveal is the same for all. The champion stands where its Pokémon will, outlined
// in its colours; the letterbox and the card come, with its name, its title and a ball for each of its Pokémon; the
// scene dissolves into the battle's own ground; then the champion steps aside and throws its lead out. The player's
// lead isn't sent here: the send-out step that follows any trainer's entrance does it.
import { fxSound } from '@/audio/sfx'
import {
  bayer,
  ease,
  label,
  labelWidth,
  lerp,
  mix,
  rect,
  rng,
  span,
  wash,
  type G,
  type Rng,
} from '../../pixel'
import { ball } from '../../scenes'
import { drawSprite, pictureKey, spriteKey, spriteSize } from '../../sprites'
import {
  H,
  quad,
  screenFlash,
  screenShake,
  skippingNow as skippingSound,
  Stage,
  STEP,
  W,
  within,
  type Cue,
  type Timeline,
} from '../../timeline'
import { burstRing, inOrder, type Cinema } from './kit'

export interface ChampionParams {
  /** The champion's picture (sprites `loadPicture`): the one the player meets (a rival's is Red's or Green's). */
  trainer: string
  /** Its lead (front sprite key), thrown out at the end. */
  foe: string
  /** Its ace, the last of its team (front sprite key): a scene may show it (Lance's Dragonite, Leon's Charizard…). */
  ace: string
  /** The player's lead (back sprite key): the stage wants one; it isn't drawn (the send-out step brings it). */
  own: string
  /** The card's name, in the player's language (empty: no card). */
  name: string
  /** How many Pokémon it has (a trainer has at most three): a ball each on the card. */
  team: number
}

/** Who a scene is shown with when no fight gives one (the FX lab, the admin's Watch, the review films). */
export interface ChampionSample {
  /** Its picture's URL, as the trainer's `spriteUrl`. */
  trainer: string
  name: string
  lead: number
  ace: number
  team: number
}

export type ChampionState<X> = Stage & X & { p: ChampionParams }

export interface ChampionScene<X> {
  id: string
  /** When the champion shows itself (s): the card and the rest follow. Between 3.8 and 5. */
  reveal: number
  seed: number
  /** Its light to dark colours: its outline after the reveal, the rings, the card. */
  aura: readonly [string, string, string, string]
  /** Its flash on the reveal. */
  flash?: string
  /**
   * The wrapper shakes the whole stage by `st.screenShakes` (Stage's own, calm-OS aware); a scene that shakes its own
   * layers with `screenShake` leaves it off.
   */
  shake?: boolean
  sample: ChampionSample
  /** Other Pokémon it shows whatever the champion's team (Red's Pikachu…): front sprites, loaded before it plays. */
  extras?: readonly number[]
  setup(st: Stage, r: Rng, p: ChampionParams): X
  step(s: ChampionState<X>, t: number, dt: number): void
  /** The scene; `k` how much of it is left (1 until it dissolves into the battle's ground). */
  back(g: G, s: ChampionState<X>, t: number, k: number): void
  /** The champion before the reveal, when the scene shows it (a figure far off, a silhouette in the light…). */
  before?(g: G, s: ChampionState<X>, t: number): void
  /** What stands in front of the champion (foreground, weather), at the same `k`. */
  front?(g: G, s: ChampionState<X>, t: number, k: number): void
  /** The scene's sounds, by time. */
  sounds: readonly (readonly [number, () => void])[]
}

/** A trainer's team is three Pokémon at most: the card's tray holds that many balls. */
const MAX_TEAM = 3

/** The times after the reveal: the card, the fade into the battle's ground, the throw, the lead out. */
export const championAfter = (reveal: number) => {
  const card = reveal + 0.35
  const fade = reveal + 1.45
  const out = reveal + 1.85
  const toss = out + 0.1
  const pop = toss + 0.45
  return { card, fade, out, toss, pop, dur: pop + 0.75 }
}

export type ChampionCinema = Cinema & {
  id: string
  sample: ChampionSample
  /** The scene's own Pokémon (ChampionScene `extras`), which a fight loads with its champion's team. */
  extras: readonly number[]
  makeBattle(p: ChampionParams): Timeline<unknown>
}

/** A scene's sample, as the parameters a fight would give (the FX lab and the films load these). */
export const sampleParams = (s: ChampionSample, card = true): ChampionParams => ({
  trainer: pictureKey(s.trainer),
  foe: spriteKey(s.lead, false),
  ace: spriteKey(s.ace, false),
  own: spriteKey(6, true),
  name: card ? s.name : '',
  team: s.team,
})

export function championCinema<X>(spec: ChampionScene<X>): ChampionCinema {
  const T = championAfter(spec.reveal)
  const R = spec.reveal
  const A = spec.aura
  const makeBattle = (p: ChampionParams): Timeline<ChampionState<X>> => ({
    id: spec.id,
    dur: T.dur,
    setup() {
      const st = new Stage({ own: p.own, foe: p.foe, by: 'foe' }, spec.seed)
      return Object.assign(st, { p }, spec.setup(st, rng(spec.seed), p)) as ChampionState<X>
    },
    step(s, t, dt) {
      s.step(t, dt)
      spec.step(s, t, dt)
      const r = s.r
      const tz = spriteSize(p.trainer)
      if (t >= R && t < R + STEP * 1.5)
        for (let k = 0; k < 36; k++) {
          const a = r() * Math.PI * 2
          const v = r.range(40, 140)
          s.fx.add({
            x: s.L.foe.x,
            y: s.L.foe.y - tz.h / 2,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            drag: 2.5,
            life: r.range(0.5, 0.9),
            size: r.int(1, 2),
            shape: r() < 0.6 ? 'star' : 'sq',
            colors: [...A],
          })
        }
      if (t >= T.pop && t < T.pop + STEP * 1.5)
        for (let k = 0; k < 14; k++) {
          const a = r() * Math.PI * 2
          s.fx.add({
            x: s.L.foe.x,
            y: s.L.foe.y - 22,
            vx: Math.cos(a) * 70,
            vy: Math.sin(a) * 50,
            drag: 4,
            life: 0.4,
            size: 1,
            shape: 'plus',
            colors: ['#ffffff', A[1]],
          })
        }
    },
    draw(g, s, t) {
      const sh = spec.shake ? screenShake(t, s.screenShakes) : { x: 0, y: 0 }
      if (sh.x || sh.y) rect(g, 0, 0, W, H, '#05040c')
      g.save()
      g.translate(sh.x, sh.y)
      g.drawImage(s.bg.cv, 0, 0)
      s.bg.dyn(g, t)
      const k = 1 - span(t, T.fade, T.out)
      spec.back(g, s, t, k)
      const tz = spriteSize(p.trainer)
      if (t < R) spec.before?.(g, s, t)
      else if (t < T.pop + 0.3) {
        // Where its lead will stand; then a step aside, out to the right, as it throws.
        const aside = ease.inQ(span(t, T.toss - 0.05, T.pop + 0.3))
        const x = Math.round(lerp(s.L.foe.x, W + tz.w, aside))
        drawSprite(g, p.trainer, x, s.L.foe.y + 2, {
          flash: Math.max(0, 1 - span(t, R + 0.05, R + 0.4)),
          outline: t < T.out ? (Math.floor(t * 8) % 2 ? A[1] : A[2]) : undefined,
        })
      }
      const cy = s.L.foe.y - tz.h / 2
      burstRing(g, s.L.foe.x, cy, span(t, R, R + 0.5), 100, 2, A[0])
      burstRing(g, s.L.foe.x, cy, span(t, R + 0.1, R + 0.6), 120, 2, A[2])
      // The ball, from its hand to where the lead stands.
      if (t >= T.toss && t < T.pop) {
        const q = span(t, T.toss, T.pop)
        const b = quad(
          { x: s.L.foe.x + 14, y: s.L.foe.y - tz.h * 0.6 },
          { x: s.L.foe.x + 4, y: s.L.foe.y - tz.h - 20 },
          { x: s.L.foe.x, y: s.L.foe.y - 18 },
          ease.ioQ(q),
        )
        const im = ball('poke', q * 12)
        g.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2))
      }
      if (t >= T.pop) {
        const kk = ease.outBack(span(t, T.pop, T.pop + 0.22), 2.2)
        drawSprite(g, p.foe, s.L.foe.x, s.L.foe.y, {
          sx: kk,
          sy: kk,
          flash: 1 - span(t, T.pop + 0.1, T.pop + 0.45),
        })
      }
      s.fx.draw(g)
      spec.front?.(g, s, t, k)
      g.restore()
      if (within(t, R, R + 0.3)) screenFlash(g, spec.flash ?? '#ffffff', 0.75 * (1 - span(t, R, R + 0.3)))
      if (t < 0.5) wash(g, '#000000', 1 - span(t, 0, 0.5), 8)
      const bars = Math.round(
        16 * (ease.outC(span(t, T.card - 0.15, T.card + 0.1)) - ease.inC(span(t, T.out, T.out + 0.4))),
      )
      if (bars > 0) {
        rect(g, 0, 0, W, bars, '#05030a')
        rect(g, 0, H - bars, W, bars, '#05030a')
      }
      if (p.name && within(t, T.card, T.out + 0.3)) card(g, t, p, A, T)
    },
    cues: () =>
      inOrder([
        ...spec.sounds.map(([at, f]) => [at, () => void (!skippingSound() && f())] as const),
        [T.pop, (hud) => (hud.show?.('foe', true), fxSound('ball.pop'))],
      ] satisfies Cue<ChampionState<X>>[]),
  })
  return {
    id: spec.id,
    sample: spec.sample,
    extras: spec.extras ?? [],
    reveal: R,
    dur: T.dur,
    // The sample's team and the scene's own Pokémon (a fight loads its champion's team itself).
    sprites: [spec.sample.lead, spec.sample.ace, ...(spec.extras ?? [])].map((d) => [d, false] as const),
    // On a stage of its own (the FX lab): its sample champion, with no card.
    make: () => makeBattle(sampleParams(spec.sample, false)) as Timeline<unknown>,
    makeBattle: (p) => makeBattle(p) as Timeline<unknown>,
  }
}

/**
 * The card: legend.ts's slanted band in the champion's colours with its name (large, small only when too long for the
 * band), and under its right end a tray with a ball for each of its Pokémon, popping in one by one.
 */
function card(
  g: G,
  t: number,
  p: ChampionParams,
  A: readonly [string, string, string, string],
  T: ReturnType<typeof championAfter>,
) {
  const pin = span(t, T.card, T.card + 0.28)
  const pout = span(t, T.out - 0.05, T.out + 0.25)
  const x = Math.round(-W * (1 - ease.outExpo(pin)) + W * ease.inC(pout))
  const y0 = 96
  const h = 30
  for (let y = 0; y < h; y++) {
    const slant = Math.round((h - y) * 0.6)
    const col =
      y === 0 || y === h - 1
        ? A[1]
        : y < 3
          ? A[2]
          : bayer(y, y * 3) < y / h
            ? A[3]
            : mix(A[3], '#05030a', 0.35)
    rect(g, x + slant - 10, y0 + y, W + 20, 1, col)
  }
  const im = ball('poke', 0)
  const n = Math.max(0, Math.min(MAX_TEAM, p.team))
  if (n > 0) {
    // The tray: a tab hanging under the band's right end.
    const tl = x + W - 24 - n * 15
    rect(g, tl, y0 + h - 1, x + W - tl, 16, A[3])
    rect(g, tl, y0 + h + 15, x + W - tl, 1, A[1])
    rect(g, tl, y0 + h - 1, 1, 17, A[1])
  }
  const tx = x + 18
  const big = labelWidth(g, p.name, 2) <= W - 36
  const ty = big ? y0 + 8 : y0 + 11
  const nameW = label(g, p.name, tx, ty, '#ffffff', '#05030a', big ? 2 : 1)
  // Glint: a diagonal band redrawing the letters in the light colour.
  const gp = span(t, T.card + 0.4, T.card + 0.75)
  if (gp > 0 && gp < 1) {
    g.save()
    g.beginPath()
    const gx = tx + lerp(-20, nameW + 20, gp)
    g.moveTo(gx, ty - 2)
    g.lineTo(gx + 6, ty - 2)
    g.lineTo(gx - 2, ty + 16)
    g.lineTo(gx - 8, ty + 16)
    g.clip()
    label(g, p.name, tx, ty, A[1], null, big ? 2 : 1)
    g.restore()
  }
  for (let i = 0; i < n; i++) {
    // Each ball pops into its slot in turn, right to left, as the card settles.
    const q = span(t, T.card + 0.25 + i * 0.09, T.card + 0.45 + i * 0.09)
    if (q <= 0) continue
    const sc = ease.outBack(q, 2.4)
    const bw = Math.max(1, Math.round(im.width * sc))
    const bh = Math.max(1, Math.round(im.height * sc))
    const cx = x + W - 18 - i * 15 - im.width / 2
    g.drawImage(im, Math.round(cx - bw / 2), Math.round(y0 + h + 7 - bh / 2), bw, bh)
  }
}
