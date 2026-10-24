// The raid's over-the-top opening (docs/18 §3 "Juice", mocked in the Visual Lab's events.js): the alarm and its hazard
// tapes, a storm with lightning, the raid Pokémon's silhouette rising with a glowing outline, a pillar of light, the
// white-out reveal with shockwaves, debris and embers, its name slamming down as the HP bars fill one by one, the
// three trainers cutting in with their lead Pokémon, then GO! About six seconds; Skip at any time; none of it with
// animations off. Giratina's raid, its area in portal mode (docs/15 §27), opens in the Distortion World instead: the
// pixel engine's scene (raidEntranceTimeline: shiny Giratina coming out of the portal) under the same words and timing,
// its tapes in Giratina's red and the void's night. That one has no Skip (the user, 2026-10-15, as the portal's breach
// and victory): a tap or Esc does nothing, it plays out; motion off still goes straight to the fight.
import { useEffect, useMemo, useRef, useState } from 'react'
import { hiss, tone } from '@/audio/sfx'
import { StageCanvas } from '@/components/StageCanvas'
import { raidEntranceStage, raidEntranceTimeline } from '@/fx/timelines/portalRaid'
import { nightRaidEntranceTimeline } from '@/fx/timelines/nightmareRaid'
import { legendRaidEntranceTimeline } from '@/fx/timelines/legendRaid'
import type { LegendRaidScene } from '@/fx/timelines/legendRaidScenes'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { bolt, disc, ease, polyline, rng as pixelRng } from '@/fx/pixel'
import { loadSprite, silhouette, spriteFrame, spriteKey } from '@/fx/sprites'
import { useT } from '@/i18n/react'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'
import type { RaidRun } from '@/store/raidBattle'
import { cx } from '@/theme/util'

const W = 240
const H = 360
const FEET = 262
/** When it all ends (ms). */
const END = 6150

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  g: number
  life: number
  age: number
  c: string
  s: number
  star?: boolean
}

export function RaidIntro({
  run,
  onDone,
  world,
  legend,
}: {
  run: RaidRun
  onDone: () => void
  /**
   * A legendary's own entrance (docs/39, the raid overhaul): its place, weather and omen on the pixel engine under the
   * intro's words. Its Skip shows from the second time the player meets it (`skippable`).
   */
  legend?: { scene: LegendRaidScene; skippable: boolean }
  /**
   * Giratina's raid in the Distortion World (docs/15 §27), or Darkrai's under the nightmare's full moon (§29): its own
   * scene under the intro's words, and no Skip.
   */
  world?: 'distortion' | 'nightmare'
}) {
  const { t } = useT()
  const { level } = useMotion()
  // A themed raid's scene is the pixel engine's: only the words and their sounds are timed here, and it has no Skip.
  const dw = !!world || !!legend
  // Measured once when it opens.
  const [size] = useState(() =>
    typeof window === 'undefined' ? { w: 130, h: 280 } : raidEntranceStage(window.innerWidth, window.innerHeight),
  )
  const cfg = useGame((s) => s.data.config.events.raid)
  const boss = run.state.boss
  // The Distortion World's scene, made once when the intro opens.
  const scene = useMemo(
    () =>
      dw
        ? {
            ready: loadSprite(boss.dex, false, boss.shiny),
            timeline: legend
              ? legendRaidEntranceTimeline({
                  scene: legend.scene,
                  w: size.w,
                  h: size.h,
                  mon: spriteKey(boss.dex, false, boss.shiny),
                  short: level === 'short',
                })
              : (world === 'nightmare' ? nightRaidEntranceTimeline : raidEntranceTimeline)({
                  w: size.w,
                  h: size.h,
                  mon: spriteKey(boss.dex, false, boss.shiny),
                  short: level === 'short',
                }),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [stage, setStage] = useState<string[]>([])
  const [leaving, setLeaving] = useState(false)
  const cv = useRef<HTMLCanvasElement>(null)
  const done = useRef(false)
  const skip = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)

  const finish = (quick: boolean) => {
    if (done.current) return
    done.current = true
    setLeaving(true)
    setTimeout(onDone, quick ? 220 : 450)
  }

  // Animations off: straight to the fight.
  useEffect(() => {
    if (level === 'off') {
      done.current = true
      onDone()
    }
  }, [level]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (level === 'off') return
    // Unskippable in the Distortion World: the focus rests on the intro itself.
    ;(skip.current ?? root.current)?.focus({ preventScroll: true })
    const key = spriteKey(boss.dex, false, boss.shiny)
    void loadSprite(boss.dex, false, boss.shiny)
    // In the Distortion World the scene is the pixel engine's (its StageCanvas): only the words and their sounds are
    // timed here.
    const g = dw ? null : (cv.current?.getContext('2d') ?? null)
    if (!dw && !g) return
    if (g) g.imageSmoothingEnabled = false
    const rnd = pixelRng(boss.dex * 7 + 3)
    const bolts = [1.15, 1.5, 1.85, 2.2].map((at) => {
      const x0 = 20 + rnd() * 200
      return { at, pts: bolt(rnd, x0, -4, x0 + (rnd() - 0.5) * 90, 150 + rnd() * 110, 0.3, 5) }
    })
    const clouds = Array.from({ length: 9 }, (_, i) => ({
      x: rnd() * 300,
      y: 20 + rnd() * 120,
      w: 60 + rnd() * 90,
      h: 14 + rnd() * 18,
      v: 6 + rnd() * 14,
      d: i % 3,
    }))
    const parts: Particle[] = []
    let burst = false
    const draw = (T: number) => {
      if (!g) return
      const full = spriteFrame(key)
      const sil = silhouette(key, '#0b0e1e')
      const glow = silhouette(key, '#ffbe2e')
      // Twice the sprite's own size, its feet on the plateau.
      const sw = (full?.width ?? 64) * 2
      const sh = (full?.height ?? 64) * 2
      const shake = T > 2.75 && T < 3.25 ? Math.round((Math.random() - 0.5) * 8 * (3.25 - T) * 2) : 0
      g.save()
      g.translate(shake, Math.round(shake / 2))
      if (T < 1) {
        // The alarm: black, a red pulse.
        g.fillStyle = '#05060d'
        g.fillRect(-10, -10, W + 20, H + 20)
        g.fillStyle = `rgba(242,85,63,${0.18 + 0.18 * Math.max(0, Math.sin(T * 14))})`
        g.fillRect(-10, -10, W + 20, H + 20)
      } else {
        // The storm.
        const sky = g.createLinearGradient(0, 0, 0, H)
        sky.addColorStop(0, '#120a22')
        sky.addColorStop(0.55, '#3a1030')
        sky.addColorStop(1, '#170a1a')
        g.fillStyle = sky
        g.fillRect(-10, -10, W + 20, H + 20)
        for (const c of clouds) {
          const x = ((c.x - T * c.v) % 340) - 50
          g.fillStyle = ['rgba(8,6,18,0.7)', 'rgba(40,18,52,0.6)', 'rgba(90,40,80,0.35)'][c.d]!
          g.beginPath()
          g.ellipse(x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2)
          g.fill()
        }
        for (const b of bolts) {
          const e = T - b.at
          if (e < 0 || e > 0.16) continue
          g.fillStyle = `rgba(220,200,255,${0.5 * (1 - e / 0.16)})`
          g.fillRect(-10, -10, W + 20, H + 20)
          polyline(g, b.pts.map(([x, y]) => [Math.round(x) + 1, Math.round(y)] as [number, number]), '#9a6bff', 3)
          polyline(g, b.pts.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]), '#ffffff', 1)
        }
        g.fillStyle = '#0b0710'
        g.beginPath()
        g.ellipse(W / 2, FEET + 40, 150, 46, 0, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#24142c'
        g.fillRect(-10, FEET + 2, W + 20, 2)
      }
      // The silhouette rises, its outline glowing.
      if (T >= 1.3 && T < 2.75 && sil && glow) {
        const e = Math.min(1, (T - 1.3) / 1.0)
        const y = FEET - sh + Math.round((1 - ease.outQ(e)) * 180)
        const x = Math.round(W / 2 - sw / 2)
        g.globalAlpha = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(T * 10))
        for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) g.drawImage(glow, x + ox, y + oy, sw, sh)
        g.globalAlpha = 1
        g.drawImage(sil, x, y, sw, sh)
      }
      // The pillar of light.
      if (T >= 2.35 && T < 3.0) {
        const e = Math.min(1, (T - 2.35) / 0.4)
        const w = Math.round(4 + 86 * ease.inQ(e))
        const a = T < 2.75 ? 1 : 1 - (T - 2.75) / 0.25
        const gr = g.createLinearGradient(W / 2 - w / 2, 0, W / 2 + w / 2, 0)
        gr.addColorStop(0, 'rgba(255,190,46,0)')
        gr.addColorStop(0.3, `rgba(255,220,120,${0.7 * a})`)
        gr.addColorStop(0.5, `rgba(255,255,255,${a})`)
        gr.addColorStop(0.7, `rgba(255,220,120,${0.7 * a})`)
        gr.addColorStop(1, 'rgba(255,190,46,0)')
        g.fillStyle = gr
        g.fillRect(W / 2 - w / 2, -10, w, FEET + 14)
        g.fillStyle = `rgba(255,240,180,${0.6 * a})`
        g.beginPath()
        g.ellipse(W / 2, FEET + 2, w * 0.9, 8, 0, 0, Math.PI * 2)
        g.fill()
      }
      // The reveal: aura, the Pokémon, shockwaves, debris, then embers.
      if (T >= 2.75 && full) {
        const bob = Math.round(Math.sin(T * 3) * 2)
        const ar = 58 + Math.sin(T * 5) * 4
        disc(g, W / 2, FEET - 60, Math.round(ar), 'rgba(255,190,46,0.18)')
        disc(g, W / 2, FEET - 60, Math.round(ar - 16), 'rgba(255,230,160,0.16)')
        const k = T < 2.95 ? 1 + 0.25 * (1 - (T - 2.75) / 0.2) : 1
        const w = Math.round(sw * k)
        const h = Math.round(sh * k)
        g.drawImage(full, Math.round(W / 2 - w / 2), FEET - h + bob, w, h)
        for (let i = 0; i < 3; i++) {
          const e = (T - 2.75 - i * 0.14) / 0.7
          if (e < 0 || e > 1) continue
          g.strokeStyle = i === 1 ? `rgba(255,190,46,${1 - e})` : `rgba(255,255,255,${1 - e})`
          g.lineWidth = 3 - 2 * e
          g.beginPath()
          g.ellipse(W / 2, FEET, 10 + 200 * e, 4 + 40 * e, 0, 0, Math.PI * 2)
          g.stroke()
        }
        if (!burst) {
          burst = true
          for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2
            const v = 1 + Math.random() * 4
            parts.push({ x: W / 2, y: FEET - 50, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.09, life: 1.4, age: 0, c: ['#ffffff', '#ffe066', '#ffbe2e', '#c58aff'][i % 4]!, s: 1 + (i % 3) })
          }
        }
        if (Math.random() < 0.6)
          parts.push({ x: 40 + Math.random() * 160, y: FEET + 6, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.8, g: 0, life: 2, age: 0, c: boss.shiny ? '#fff6a8' : '#ff9a5a', s: 1 })
        if (boss.shiny && Math.random() < 0.3)
          parts.push({ x: 70 + Math.random() * 100, y: FEET - 120 + Math.random() * 110, vx: 0, vy: -0.2, g: 0, life: 0.6, age: 0, c: '#ffffff', s: 2, star: true })
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!
        p.age += 1 / 60
        if (p.age > p.life) {
          parts.splice(i, 1)
          continue
        }
        p.vy += p.g
        p.x += p.vx
        p.y += p.vy
        g.globalAlpha = Math.min(1, (p.life - p.age) * 2)
        g.fillStyle = p.c
        if (p.star) {
          g.fillRect(Math.round(p.x) - 2, Math.round(p.y), 5, 1)
          g.fillRect(Math.round(p.x), Math.round(p.y) - 2, 1, 5)
        } else g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s)
      }
      g.globalAlpha = 1
      g.restore()
      if (T >= 2.7 && T < 3.05) {
        g.fillStyle = `rgba(255,255,255,${1 - (T - 2.7) / 0.35})`
        g.fillRect(0, 0, W, H)
      }
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    const add = (c: string) => () => setStage((s) => [...s, c])
    at(40, add('alert'))
    at(80, () => {
      tone(660, 0.18, { type: 'square', vol: 0.05 })
      tone(880, 0.18, { type: 'square', vol: 0.05, at: 0.2 })
      tone(660, 0.18, { type: 'square', vol: 0.05, at: 0.42 })
      tone(880, 0.18, { type: 'square', vol: 0.05, at: 0.62 })
    })
    at(950, add('alert-out'))
    // The storm's sounds; the Distortion World's scene has its own (the pulses, the tear, the heartbeats, the roar).
    if (!dw) {
      at(1050, () => hiss(1.6, { vol: 0.06, freq: 120, type: 'lowpass' }))
      for (const b of bolts) at(b.at * 1000, () => hiss(0.35, { vol: 0.09, freq: 2600, slide: -2300 }))
      at(2350, () => hiss(0.45, { vol: 0.07, freq: 400, slide: 3000 }))
    }
    at(2750, () => {
      setStage((s) => [...s, 'boom'])
      if (dw) return
      tone(55, 0.7, { type: 'sawtooth', vol: 0.08, slide: -20 })
      hiss(0.6, { vol: 0.1, freq: 300 })
    })
    if (!dw) at(2900, () => tone(240, 0.6, { type: 'sawtooth', vol: 0.06, slide: -160 }))
    at(3250, () => {
      setStage((s) => [...s, 'name'])
      hiss(0.18, { vol: 0.09, freq: 160 })
    })
    at(3600, add('bars'))
    for (let i = 0; i < run.state.bars; i++) at(3650 + i * 250, () => tone(1320 + i * 220, 0.12, { vol: 0.045 }))
    at(4550, add('cuts'))
    run.state.sides.forEach((_, i) => at(4560 + i * 150, () => hiss(0.18, { vol: 0.05, freq: 1500, slide: 1500 })))
    at(5500, () => {
      setStage((s) => [...s, 'go'])
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, { vol: 0.05, at: i * 0.07 }))
    })
    at(END, () => finish(false))
    let raf = 0
    const t0 = performance.now()
    const loop = (now: number) => {
      draw((now - t0) / 1000)
      raf = requestAnimationFrame(loop)
    }
    if (g) raf = requestAnimationFrame(loop)
    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(raf)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (level === 'off') return null
  const on = (c: string) => stage.includes(c)
  const bars = run.state.bars
  return (
    <div
      ref={root}
      role="dialog"
      tabIndex={-1}
      aria-label={t('ui.raid.intro.label', { name: boss.name })}
      className={cx('rd-intro', world === 'distortion' && 'dw', world === 'nightmare' && 'nm', ...stage, leaving && 'out')}
    >
      {scene ? (
        <StageCanvas
          timeline={scene.timeline}
          ready={scene.ready}
          size={{ w: size.w, h: size.h }}
          label=""
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      ) : (
        <canvas ref={cv} className="rd-i-cv" width={W} height={H} aria-hidden />
      )}
      <div className="rd-i-tape top" aria-hidden>
        <b>
          {t(
            world === 'nightmare'
              ? 'ui.nightmare.raidIntroTop'
              : world === 'distortion'
                ? 'ui.portal.raidIntroTop'
                : 'ui.raid.intro.warning',
          )}
        </b>
      </div>
      <div className="rd-i-tape bottom" aria-hidden>
        <b>
          {world === 'nightmare'
            ? t('ui.nightmare.raidIntroBottom', { name: boss.name })
            : world === 'distortion'
              ? t('ui.portal.raidIntroBottom', { name: boss.name })
              : t('ui.raid.intro.appears')}
        </b>
      </div>
      <div className="rd-i-name">
        <small>{t('ui.raid.intro.kicker')}</small>
        <b>{boss.name.toUpperCase()}</b>
        {boss.shiny && <em>{t('ui.raid.intro.shiny')}</em>}
        <span className="rd-i-sub">{t('ui.raid.intro.sub', { level: boss.level, bars })}</span>
        <span className="rd-i-bars" aria-hidden>
          {Array.from({ length: bars }, (_, i) => (
            <i key={i} style={{ ['--c' as string]: cfg.barColors[i % cfg.barColors.length], ['--d' as string]: `${i * 250}ms` }} />
          ))}
        </span>
      </div>
      <div className="rd-i-cuts" aria-hidden={!on('cuts')}>
        {run.state.sides.map((s, i) => (
          <div
            key={i}
            className="rd-i-cut"
            style={{ ['--bg' as string]: s.kind === 'me' ? '#f2553f' : s.kind === 'npc' ? '#8592ad' : '#5b8def', ['--d' as string]: `${i * 150}ms` }}
          >
            <span className="rd-i-who">{s.look && <TrainerSprite src={s.look} size={52} />}</span>
            <span className="rd-i-t">
              <b>{s.kind === 'me' ? t('ui.raid.you') : s.owner}</b>
              <small>
                {s.kind === 'npc' ? `${t('ui.raid.npc')} · ` : ''}
                {t('ui.raid.intro.leads', { name: s.mons[0]?.name ?? '' })}
              </small>
            </span>
            <span className="rd-i-lead">{s.mons[0] && <MiniSprite dex={s.mons[0].dex} size={56} />}</span>
          </div>
        ))}
      </div>
      <div className="rd-i-go" aria-hidden>
        {t('ui.raid.intro.go')}
      </div>
      {(!dw || (legend?.skippable && !world)) && (
        <button ref={skip} type="button" className="rd-i-skip" onClick={() => finish(true)}>
          {t('ui.raid.intro.skip')}
        </button>
      )}
    </div>
  )
}
