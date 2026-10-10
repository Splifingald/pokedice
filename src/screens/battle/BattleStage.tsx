// The battle stage (240×160 art pixels, scaled up): the Daybreak background drawn in code, both Pokémon as the
// animated sprites the browser plays, their plates, and — while a move, a form change or an intro plays — the
// timeline's canvas on top (src/fx). docs/13-SHOWDOWN-SPRITES.md has why the sprites are page images.
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Battler, Side } from '@/engine'
import { AreaArt } from '@/components/AreaArt'
import { PixelIcon, STATUS_ICON } from '@/components/icons'
import { StageCanvas } from '@/components/StageCanvas'
import { TrainerSprite } from '@/components/TrainerArt'
import { artPlacement, battleWindow, type AreaPicture } from '@/fx/areaArt'
import { background, setArtUnderStage, zones } from '@/fx/scenes'
import { loadSprite, placeSprite, spriteKey, stageSprite } from '@/fx/sprites'
import { H, W, type Hud, type Timeline } from '@/fx/timeline'
import { attackTimeline } from '@/fx/timelines/attacks'
import { gmaxEndTimeline, gmaxFor, megaFor } from '@/fx/timelines/forms'
import { usePace } from '@/lib/pace'
import { useMotion } from '@/lib/motion'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import type { Fx, Scene } from './useBattleAnimator'

const LAYOUT = background(W, H).layout

/** The area picture's two zones, translucent on its ground (in place of the drawn background's platforms). */
function Zones() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g) return
    g.imageSmoothingEnabled = false
    g.drawImage(zones(W, H), 0, 0)
  }, [])
  return (
    <canvas ref={ref} width={W} height={H} aria-hidden className="pixelated absolute inset-0 h-full w-full" />
  )
}

/** The static background, with pollen drifting in the light unless the screen should stay calm. */
function Backdrop({ calm }: { calm: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const g = cv?.getContext('2d')
    if (!cv || !g) return
    g.imageSmoothingEnabled = false
    const bg = background(W, H)
    const draw = (t: number) => {
      g.drawImage(bg.cv, 0, 0)
      if (!calm) bg.dyn(g, t)
    }
    draw(0)
    if (calm) return
    // The pollen moves slowly: 15 frames a second is plenty.
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      if (now - last > 66) {
        last = now
        draw(now / 1000)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [calm])
  return (
    <canvas ref={ref} width={W} height={H} aria-hidden className="pixelated absolute inset-0 h-full w-full" />
  )
}

/** Two white silhouette frames (never an opacity blink), then the sprite again. */
function useFlash(id: number | null, still: boolean) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (id == null || still) return
    const frames = [true, false, true, false]
    const timers = frames.map((v, i) => setTimeout(() => setOn(v), i * 70))
    return () => {
      timers.forEach(clearTimeout)
      setOn(false)
    }
  }, [id, still])
  return on
}

const POP_COLOR = { super: '#ffbe2e', weak: '#fbfdff', immune: '#9c9caf', normal: '#fbfdff', heal: '#34c97a' }

/** One Pokémon as the page's animated sprite, standing on its platform. */
function Mon({
  b,
  side,
  scale,
  shown,
  fainted,
  hidden,
  worn,
  fx,
  onTap,
  tapLabel,
}: {
  b: Battler
  side: Side
  scale: number
  /** Out on the field (the foe has slid in, yours has popped out of its ball). */
  shown: boolean
  fainted: boolean
  /** A timeline is drawing it on the canvas right now. */
  hidden: boolean
  /** Knocked out but still there, waiting for the ball: greyed. */
  worn?: boolean
  fx: Fx
  onTap?: () => void
  tapLabel: string
}) {
  const pace = usePace()
  const { level } = useMotion()
  const still = level === 'off'
  const back = side === 'player'
  const s = useMemo(() => stageSprite(b.dex, back, b.shiny), [b.dex, back, b.shiny])
  const at = back ? LAYOUT.own : LAYOUT.foe
  const box = placeSprite(s, at.x, at.y)
  const flash = useFlash(fx.flash?.target === side ? fx.flash.id : null, still)
  return (
    <div
      className="absolute"
      style={{
        left: box.left * scale,
        top: box.top * scale,
        width: box.w * scale,
        height: box.h * scale,
        opacity: hidden ? 0 : 1,
      }}
    >
      <motion.div
        key={`${b.uid}:${b.dex}`}
        className="absolute inset-0"
        style={{ transformOrigin: '50% 90%' }}
        initial={still ? false : back ? { opacity: 0, scale: 0 } : { opacity: 0, x: 60 * scale }}
        animate={
          fainted
            ? { opacity: 0, y: box.h * scale * 0.4, transition: { duration: still ? 0 : 0.6 * pace } }
            : !shown
              ? { opacity: 0, scale: back ? 0 : 1, x: back ? 0 : 60 * scale, transition: { duration: 0 } }
              : {
                  opacity: 1,
                  x: 0,
                  y: 0,
                  scale: 1,
                  transition: { duration: still ? 0 : (back ? 0.25 : 0.45) * pace, ease: 'backOut' },
                }
        }
      >
        <img
          src={s.url}
          alt=""
          draggable={false}
          onError={(e) => {
            if (s.fallback && e.currentTarget.src !== new URL(s.fallback, location.href).href)
              e.currentTarget.src = s.fallback
          }}
          className="pixelated absolute inset-0 h-full w-full max-w-none"
          // A flash (a faint, a form change with no timeline) turns the sprite into a white silhouette for a moment.
          style={{
            imageRendering: 'pixelated',
            filter: flash ? 'brightness(0) invert(1)' : worn ? 'saturate(0.3) brightness(0.9)' : undefined,
          }}
        />
      </motion.div>
      {onTap && shown && !fainted && !hidden && (
        <button type="button" onClick={onTap} aria-label={tapLabel} className="absolute inset-0 z-[1]" />
      )}
      <AnimatePresence>
        {fx.status?.target === side && !hidden && (
          <motion.div
            key={fx.status.id}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1.1, 1] }}
            transition={{ duration: 0.85 * pace }}
          >
            <PixelIcon
              name={STATUS_ICON[fx.status.status] ?? 'star'}
              size={Math.round(box.w * scale * 0.3)}
            />
          </motion.div>
        )}
        {fx.pop?.target === side && (
          <motion.div
            key={fx.pop.id}
            className="pointer-events-none absolute left-1/2 top-[25%] z-20 -translate-x-1/2 font-pixel leading-none"
            initial={{ opacity: 0, y: 10, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [10, -20, -34, -48], scale: [0.4, 1.5, 1.2, 1] }}
            transition={{ duration: still ? 0 : 1.1 * pace }}
            style={{
              fontSize: 26,
              color: POP_COLOR[fx.pop.tone],
              textShadow: '3px 3px 0 #24304f, -2px -2px 0 #24304f, 2px -2px 0 #24304f, -2px 2px 0 #24304f',
            }}
          >
            {fx.pop.tone === 'heal' ? '+' : fx.pop.amount === 0 ? '' : '−'}
            {fx.pop.amount}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const key = (b: Battler, back: boolean, dex = b.dex) => spriteKey(dex, back, b.shiny)

const asShown = (b: Battler, fx: Fx): Battler => {
  const dex = fx.dex[b.uid]
  return dex == null || dex === b.dex ? b : { ...b, dex }
}

/** The timeline for a scene of the log, and the sprites it needs loaded first. */
function useSceneTimeline(scene: Scene | null, own: Battler, foe: Battler, short: boolean) {
  const data = useGame((s) => s.data)
  return useMemo(() => {
    if (!scene) return null
    const mine = scene.side === 'player'
    const changing = mine ? own : foe
    const sprites: Promise<string>[] = [
      loadSprite(own.dex, true, own.shiny),
      loadSprite(foe.dex, false, foe.shiny),
    ]
    let timeline: Timeline<unknown>
    if (scene.kind === 'attack') {
      timeline = attackTimeline({
        own: key(own, true),
        foe: key(foe, false),
        by: mine ? 'own' : 'foe',
        type: scene.type ?? 'base',
        damage: scene.damage,
        short,
      })
    } else {
      const from = scene.fromDex ?? changing.dex
      const to = scene.toDex ?? changing.dex
      sprites.push(loadSprite(from, mine, changing.shiny), loadSprite(to, mine, changing.shiny))
      const p = {
        // The side that doesn't change keeps its sprite; the changing side's comes from the scene.
        own: key(own, true, mine ? from : own.dex),
        foe: key(foe, false, mine ? foe.dex : from),
        side: mine ? ('own' as const) : ('foe' as const),
        from: key(changing, mine, from),
        to: key(changing, mine, to),
        die: data.species[scene.kind === 'gmaxEnd' ? from : to]?.type1 ?? 'normal',
        short,
      }
      timeline = scene.kind === 'mega' ? megaFor(p) : scene.kind === 'gmax' ? gmaxFor(p) : gmaxEndTimeline(p)
    }
    return { timeline, ready: Promise.all(sprites) }
    // One timeline per scene: later state changes don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id])
}

/** A full-stage timeline over the fight: a legendary's entrance, the catch. */
export interface StageOverlay {
  timeline: Timeline<unknown>
  ready: Promise<unknown>
  label: string
  onEnd: () => void
  hud?: Hud
}

export function BattleStage({
  own: ownNow,
  foe: foeNow,
  fx,
  art,
  ownShown,
  foeShown,
  trainer,
  overlay,
  worn,
  onContact,
  onSceneDone,
  onTap,
  tapLabel,
  label,
  children,
}: {
  own: Battler
  foe: Battler
  fx: Fx
  /** The area's picture (src/fx/areaArt.ts): its middle 240 × 160 is the battle background. Null: the drawn one. */
  art?: AreaPicture | null
  ownShown: boolean
  foeShown: boolean
  /** A trainer stepping onto the field before their Pokémon (sprite URL), or null. */
  trainer: string | null
  /** A full-stage timeline that takes over from the sprites (a legendary's entrance, the catch). */
  overlay: StageOverlay | null
  /** The foe is knocked out but stays on its platform, greyed, for the catch. */
  worn?: boolean
  onContact: () => void
  onSceneDone: () => void
  /** Type hints: tapping a Pokémon opens its matchups. */
  onTap?: (side: Side) => void
  tapLabel: (b: Battler) => string
  /** What the stage shows, for screen readers. */
  label: string
  /** Plates and pop-ups over the stage. */
  children?: ReactNode
}) {
  // Each in the form the log has reached, not the state's (which may already be past a form change).
  const own = asShown(ownNow, fx)
  const foe = asShown(foeNow, fx)
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const pace = usePace()
  const { level, calm } = useMotion()
  const scene = useSceneTimeline(fx.scene, own, foe, level === 'short')
  const playing = !!scene || !!overlay
  const artId = art?.id ?? null
  // Which picture has loaded and shows (the drawn background stands in until then).
  const [shownArt, setShownArt] = useState<string | null>(null)
  const artShown = !!artId && shownArt === artId
  // Over a picture the timelines draw no background of their own (before it loads, the drawn one shows through).
  useLayoutEffect(() => {
    if (!artId) return
    setArtUnderStage(true)
    return () => setArtUnderStage(false)
  }, [artId])

  // Keep both Pokémon ready on the canvas: a move can start any moment.
  useEffect(() => {
    void loadSprite(own.dex, true, own.shiny)
    void loadSprite(foe.dex, false, foe.shiny)
  }, [own.dex, own.shiny, foe.dex, foe.shiny])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / W)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={box} className="relative isolate z-0 aspect-[3/2] w-full select-none overflow-hidden">
      <Backdrop calm={calm || artShown} />
      {art && (
        <AreaArt
          key={art.id}
          src={art.url}
          place={artPlacement(battleWindow(art))}
          onShown={() => setShownArt(art.id)}
        />
      )}
      {artShown && <Zones />}
      {scale > 0 && (
        <>
          <Mon
            b={foe}
            side="enemy"
            scale={scale}
            shown={foeShown}
            fainted={!!fx.fainted[foe.uid] && !worn}
            hidden={playing}
            worn={worn}
            fx={fx}
            onTap={onTap && (() => onTap('enemy'))}
            tapLabel={tapLabel(foe)}
          />
          <AnimatePresence>
            {trainer && (
              <motion.div
                key="trainer"
                className="absolute"
                style={{
                  left: (LAYOUT.foe.x - 32) * scale,
                  top: (LAYOUT.foe.y - 66) * scale,
                  width: 64 * scale,
                  height: 64 * scale,
                }}
                initial={{ x: 90 * scale, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 110 * scale, opacity: 0, transition: { duration: 0.2 * pace, ease: 'easeIn' } }}
                transition={{ duration: 0.25 * pace, ease: 'easeOut' }}
                aria-hidden
              >
                <TrainerSprite src={trainer} size={Math.round(64 * scale)} />
              </motion.div>
            )}
          </AnimatePresence>
          <Mon
            b={own}
            side="player"
            scale={scale}
            shown={ownShown}
            fainted={!!fx.fainted[own.uid]}
            hidden={playing}
            fx={fx}
            onTap={onTap && (() => onTap('player'))}
            tapLabel={tapLabel(own)}
          />
        </>
      )}
      {overlay ? (
        <StageCanvas
          key="overlay"
          timeline={overlay.timeline}
          ready={overlay.ready}
          hud={overlay.hud}
          onEnd={overlay.onEnd}
          label={overlay.label}
          className="absolute inset-0"
        />
      ) : (
        scene && (
          <StageCanvas
            key={fx.scene!.id}
            timeline={scene.timeline}
            ready={scene.ready}
            hud={{ contact: onContact }}
            onEnd={onSceneDone}
            label={label}
            className="absolute inset-0"
          />
        )
      )}
      <div className={cx('pointer-events-none absolute inset-0 z-10', '[&>*]:pointer-events-auto')}>
        {children}
      </div>
    </div>
  )
}
