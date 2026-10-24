// How to play, animated (docs/38 §8b): four small cards at the top of the guide while the Game feel switch is on —
// throw the dice, reroll, deal damage, catch. Each is drawn with the battle's own pieces (Die, the buttons, the combo
// chip, the foe's plate and its HpBar, the menu icons, the Poké Ball drawn in code) and played by a clock in 50 ms
// steps (howTo.ts): looping at full motion, a still with PLAY when the OS asks for less motion, the end state on
// PLAY with animations off. A loop sleeps off screen and in a hidden tab; nothing makes a sound (it's reading
// material). Every number comes from the engine on a made-up throw (makeBattler, computeDamage, planScore,
// catchValueOf): illustrative, never a rule of its own.
import {
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { comboTier, type DamageResult } from '@/engine'
import { Chip } from '@/components/Chip'
import { Die, type DieProps } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { ButtonLook, PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { DiceLabContext, type DiceLab } from '@/components/useDieThrow'
import { planScore, scoreLength, type ScoreBeat } from '@/fx/dice/score'
import { useT } from '@/i18n/react'
import { comboName } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { FoePlate } from '@/screens/battle/Plates'
import { useGame } from '@/store/game'
import {
  clockStep,
  makeDemo,
  REROLLED,
  startClock,
  stepTo,
  TICK_MS,
  whiteAt,
  type Demo,
  type HowToMode,
  type ShownDie,
} from '@/screens/help/howTo'

export type { HowToMode }

/**
 * Every scene is laid out on a 280 × 224 stage, centred in its card (284 px wide on a 360 px phone): positions in CSS
 * px, on the 2 px grid.
 */
const W = 280
const H = 224
/** The battle's REROLL / ATTACK row, at the stage's bottom. */
const ROW_TOP = 170
/** A menu icon drawn at 2× its atlas pixels (MiniSprite draws 1.5× the size asked): an 80 px box. */
const MON = 53

/** Which way the cards run at the player's motion level (docs/15 §8). */
export function useHowToMode(): HowToMode {
  const { level, calm } = useMotion()
  return level === 'off' ? 'off' : calm ? 'still' : 'loop'
}

/** On screen, in a visible tab: a loop only steps while someone can see it. */
function useAwake(ref: RefObject<HTMLElement>): boolean {
  const [seen, setSeen] = useState(false)
  const [shown, setShown] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver((entries) => setSeen(entries.some((e) => e.isIntersecting)))
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  useEffect(() => {
    const on = () => setShown(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return seen && shown
}

function useClock(length: number, still: number, mode: HowToMode, ref: RefObject<HTMLElement>) {
  const [clock, send] = useReducer(clockStep, undefined, () => startClock(mode, still))
  const awake = useAwake(ref)
  // A new motion level (Settings, the OS) starts the card over the way it now runs.
  const was = useRef(mode)
  useEffect(() => {
    if (was.current === mode) return
    was.current = mode
    send({ kind: 'reset', mode, still })
  }, [mode, still])
  useEffect(() => {
    if (!clock.running || !awake) return
    const id = window.setInterval(() => send({ kind: 'tick', length, loop: mode === 'loop' }), TICK_MS)
    return () => window.clearInterval(id)
  }, [clock.running, awake, length, mode])
  return { clock, play: () => send({ kind: 'play', length, off: mode === 'off' }) }
}

/** What a scene draws from: its time, its run (the dice's roll keys), whether it plays (dice thrown, not at rest). */
interface Frame {
  t: number
  round: number
  live: boolean
}

interface SceneProps {
  f: Frame
  demo: Demo
  calm: boolean
}

function HowToCard({
  title,
  text,
  alt,
  length,
  still,
  mode,
  scene,
}: {
  title: string
  text: string
  alt: string
  length: number
  /** The key moment the card shows when it doesn't loop. */
  still: number
  mode: HowToMode
  scene: (f: Frame) => ReactNode
}) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  const { clock, play } = useClock(length, still, mode, ref)
  return (
    <figure className="flex min-w-0 flex-col gap-2 bg-paper p-2 shadow-card">
      <div
        ref={ref}
        role="img"
        aria-label={alt}
        className="relative overflow-hidden bg-well"
        style={{ height: H }}
      >
        <div aria-hidden className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: W }}>
          {scene({ t: Math.min(clock.t, length), round: clock.round, live: clock.running })}
        </div>
      </div>
      <figcaption className="flex flex-col gap-1 px-1 pb-1">
        <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 md:min-h-[36px]">
          <h3 className="text-[24px] leading-none">{title}</h3>
          {mode !== 'loop' && (
            <PixelButton size="sm" onClick={play} aria-label={t('ui.help.howPlayLabel', { step: title })}>
              <PixelIcon name="play" size={14} />
              {t('ui.help.howPlay')}
            </PixelButton>
          )}
        </div>
        <p className="copy">{text}</p>
      </figcaption>
    </figure>
  )
}

/** How to play's finger: its fingertip on `x, y`, pressing 4 px down while `tap`. */
function Finger({ x, y, tap }: { x: number; y: number; tap?: boolean }) {
  return (
    <span className="absolute z-10" style={{ left: x - 10, top: y + (tap ? 4 : 0) }}>
      <PixelIcon name="tap" size={26} />
    </span>
  )
}

/** A die of the scene: thrown (its roll key) while the card plays, at rest otherwise. */
function SceneDie({
  d,
  roll,
  ...rest
}: { d: ShownDie; roll?: string } & Omit<DieProps, 'type' | 'face' | 'rollKey'>) {
  return <Die type={d.type} face={d.face} rollKey={roll} {...rest} />
}

/** A row of dice, centred on the stage. */
const rowLeft = (n: number, size: number, gap: number) => (W - (n * size + (n - 1) * gap)) / 2

// 1. Throw the dice: the tray clears, the dice are thrown in and land, then each one's type shows under it.
const T1 = { throw: 350, badge: 1250, badgeGap: 200, hold: 1300 }
const throwLength = (n: number) => T1.badge + n * T1.badgeGap + T1.hold

function ThrowScene({ f, demo }: SceneProps) {
  const size = 48
  const gap = 14
  const left = rowLeft(demo.first.length, size, gap)
  return (
    <>
      <span className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center gap-1">
        <MiniSprite dex={demo.me.dex} size={MON} />
        <span className="whitespace-nowrap text-[20px] leading-none">{demo.me.name}</span>
      </span>
      {(!f.live || f.t >= T1.throw) &&
        demo.first.map((d, i) => (
          <span
            key={i}
            className="absolute flex flex-col items-center gap-2"
            style={{ left: left + i * (size + gap), top: 118, width: size }}
          >
            <SceneDie d={d} size={size} roll={f.live ? `how1-${f.round}-${i}` : undefined} delay={i * 0.08} />
            <span style={{ visibility: f.t >= T1.badge + i * T1.badgeGap ? 'visible' : 'hidden' }}>
              <TypeBadge type={d.type} size="sm" />
            </span>
          </span>
        ))}
    </>
  )
}

// 2. Reroll: the finger taps a die (it lifts, ↻), then REROLL; that die is thrown again and makes the pair.
const T2 = {
  finger: 200,
  toDie: [250, 650],
  tapDie: 700,
  toButton: [950, 1350],
  tapButton: 1400,
  reroll: 1550,
  hide: 1750,
  combo: 2250,
  length: 3400,
} as const
const TAP_MS = 150

/** The battle's REROLL / ATTACK row, as pictures, at the stage's bottom. */
function ActionRow({
  left,
  attackDown,
  rerollDown,
}: {
  left: number
  attackDown?: boolean
  rerollDown?: boolean
}) {
  const { t } = useT()
  return (
    <span
      className="absolute inset-x-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5"
      style={{ top: ROW_TOP }}
    >
      <ButtonLook down={rerollDown} className="whitespace-nowrap !px-1.5">
        {t('ui.battle.reroll', { left })}
      </ButtonLook>
      <ButtonLook variant="primary" down={attackDown} className="whitespace-nowrap !px-1.5">
        {t('ui.battle.attack')}
      </ButtonLook>
    </span>
  )
}

/** Where the action row's buttons are (tracks of 1 and 1.4 with a 10 px gap), for the finger: REROLL's, ATTACK's. */
const REROLL_AT = { x: Math.round((W - 10) / 2.4 / 2), y: ROW_TOP + 26 }
const ATTACK_AT = { x: Math.round(W - ((W - 10) * 1.4) / 2.4 / 2), y: ROW_TOP + 26 }

function ComboChip({ hit }: { hit: DamageResult }) {
  const { t } = useT()
  if (!hit.combo) return null
  return (
    <Chip tone="gold" className="text-[16px]">
      {t('ui.battle.comboChip', { combo: comboName(hit.combo.key), bonus: hit.combo.bonus })}
    </Chip>
  )
}

function RerollScene({ f, demo }: SceneProps) {
  const { t } = f
  const size = 44
  const gap = 14
  const top = 30
  const left = rowLeft(demo.first.length, size, gap)
  const dieAt = { x: left + REROLLED * (size + gap) + size / 2, y: top + size / 2 + 12 }
  const rerolled = t >= T2.reroll
  const picked = t >= T2.tapDie + 50 && !rerolled
  const pair = t >= T2.combo
  const tier = comboTier(demo.hit.combo?.key)
  const start = { x: W - 20, y: 120 }
  const toButton = t >= T2.toButton[0]
  const from = toButton ? dieAt : start
  const to = toButton ? REROLL_AT : dieAt
  const [a, b] = toButton ? T2.toButton : T2.toDie
  const tapping = (t >= T2.tapDie && t < T2.tapDie + 100) || (t >= T2.tapButton && t < T2.tapButton + TAP_MS)
  return (
    <>
      {(rerolled ? demo.after : demo.first).map((d, i) => (
        <span key={i} className="absolute" style={{ left: left + i * (size + gap), top }}>
          <SceneDie
            d={d}
            size={size}
            roll={f.live && rerolled && i === REROLLED ? `how2-${f.round}` : undefined}
            selected={picked && i === REROLLED}
            combo={pair && demo.ring.includes(i)}
            tier={tier}
          />
        </span>
      ))}
      <span className="absolute inset-x-0 flex justify-center" style={{ top: 100 }}>
        {pair && <ComboChip hit={demo.hit} />}
      </span>
      <ActionRow
        left={rerolled ? demo.me.rerolls - 1 : demo.me.rerolls}
        rerollDown={t >= T2.tapButton && t < T2.tapButton + TAP_MS}
      />
      {t >= T2.finger && t < T2.hide && (
        <Finger x={stepTo(t, a, b, from.x, to.x)} y={stepTo(t, a, b, from.y, to.y)} tap={tapping} />
      )}
    </>
  )
}

// 3. Deal damage: each scoring die pops its "+N", the combo lands, the damage counts up (the battle's own plan, played
// at half speed so it can be followed); then ATTACK, the foe's two white frames, its number, its HP bar draining.
const C0 = 250
/** Half the battle's speed: a count-up of 0.8 s is too quick to read while learning. */
const SCORE_PACE = 2

type CountBeat = Extract<ScoreBeat, { kind: 'count' }>

function hitPlan(demo: Demo) {
  const r = demo.hit
  const run = planScore({
    points: r.perDie.map((p) => p.value + p.bonus),
    tier: comboTier(r.combo?.key),
    from: 0,
    to: r.final,
    level: 'full',
    pace: SCORE_PACE,
  })
  const beats = run.map((b) => ({ ...b, at: b.at + C0 }))
  const counted = C0 + scoreLength(run)
  const tap = counted + 650
  const hit = tap + 200
  return { beats, counted, move: [counted + 200, counted + 600] as const, tap, hit, length: hit + 1600 }
}

function HitScene({ f, demo, calm }: SceneProps) {
  const { t: tr } = useT()
  const { t } = f
  const plan = useMemo(() => hitPlan(demo), [demo])
  const size = 40
  const gap = 12
  const top = 88
  const left = rowLeft(demo.after.length, size, gap)
  const r = demo.hit
  const done = plan.beats.filter((b) => b.at <= t)
  const combo = done.some((b) => b.kind === 'combo')
  // What the readout shows: the count so far, from 0 as a fresh throw's does.
  const value = done.filter((b): b is CountBeat => b.kind === 'count').pop()?.value ?? 0
  const tier = comboTier(r.combo?.key)
  const hit = t >= plan.hit
  const white = whiteAt(t, plan.hit)
  // Two pixels each way for a beat, as a plain hit shakes its target; never when the screen should be calm.
  const shake = !calm && hit && t < plan.hit + 200 ? (Math.floor((t - plan.hit) / TICK_MS) % 2 ? 2 : -2) : 0
  const start = { x: W - 20, y: 146 }
  return (
    <>
      <FoePlate b={demo.foe} hp={hit ? Math.max(0, demo.foe.maxHp - r.final) : demo.foe.maxHp} />
      <span
        className="absolute bg-shadow pixel-corners"
        style={{ left: W - 96, top: 56, width: 88, height: 10 }}
      />
      <span
        className="absolute"
        style={{ left: W - 92 + shake, top: -8, filter: white ? 'brightness(0) invert(1)' : undefined }}
      >
        <MiniSprite dex={demo.foe.dex} size={MON} />
      </span>
      {hit && t < plan.hit + 800 && (
        <span className="absolute" style={{ left: W - 52, top: 44 }}>
          <span className="score-pop font-pixel text-[26px] leading-none" style={{ color: '#ffffff' }}>
            {r.final}
          </span>
        </span>
      )}
      {demo.after.map((d, i) => {
        const pop = t < plan.counted + 400 ? done.find((b) => b.kind === 'pop' && b.die === i) : undefined
        return (
          <span key={i} className="absolute" style={{ left: left + i * (size + gap), top }}>
            <SceneDie d={d} size={size} combo={combo && demo.ring.includes(i)} tier={tier} />
            {pop?.kind === 'pop' && (
              <span key={`${f.round}-${pop.at}`} className="score-pop font-pixel text-[22px] leading-none">
                +{pop.n}
              </span>
            )}
          </span>
        )
      })}
      {t >= C0 && (
        <span className="absolute inset-x-0 flex items-center justify-center gap-2" style={{ top: 134 }}>
          <b className="font-pixel text-[30px] font-normal leading-none tabular-nums underline decoration-dotted decoration-2 underline-offset-4">
            {tr('ui.battle.dmg', { amount: value })}
          </b>
          {combo && <ComboChip hit={r} />}
        </span>
      )}
      <ActionRow left={demo.me.rerolls - 1} attackDown={t >= plan.tap && t < plan.tap + TAP_MS} />
      {t >= plan.counted + 150 && t < plan.hit && (
        <Finger
          x={stepTo(t, plan.move[0], plan.move[1], start.x, ATTACK_AT.x)}
          y={stepTo(t, plan.move[0], plan.move[1], start.y, ATTACK_AT.y)}
          tap={t >= plan.tap && t < plan.tap + TAP_MS}
        />
      )}
    </>
  )
}

// 4. Catch: a Poké Ball thrown in an arc at the worn-out foe, the foe drawn in, the drop and a bounce, three wobbles
// in pixel steps, then the click: stars, "Gotcha!" and the catch die with the ball's bonus.
const T4 = {
  throw: [250, 750],
  contact: 750,
  gone: 900,
  drop: [1000, 1150],
  land: 1250,
  wobbles: [1600, 2300, 3000],
  click: 3600,
  gotcha: 3650,
  die: 3800,
  length: 4700,
  still: 600,
} as const
const BALL_START = { x: 8, y: 160 }
const BALL_HIT = { x: W - 60, y: 72 }
const BALL_GROUND = { x: W - 60, y: 92 }

function ballAt(t: number): { x: number; y: number; turn: number } {
  const [a, b] = T4.throw
  if (t < a) return { ...BALL_START, turn: 0 }
  if (t < b) {
    // Its arc, a tick at a time, spinning a quarter turn every 100 ms.
    const s = Math.floor((t - a) / TICK_MS) / ((b - a) / TICK_MS)
    const x = BALL_START.x + (BALL_HIT.x - BALL_START.x) * s
    const y = BALL_START.y + (BALL_HIT.y - BALL_START.y) * s - 128 * s * (1 - s)
    return { x: Math.round(x / 2) * 2, y: Math.round(y / 2) * 2, turn: 90 * Math.floor((t - a) / 100) }
  }
  if (t < T4.drop[0]) return { ...BALL_HIT, turn: 0 }
  if (t < T4.drop[1])
    return { x: BALL_HIT.x, y: stepTo(t, T4.drop[0], T4.drop[1], BALL_HIT.y, BALL_GROUND.y), turn: 0 }
  // One bounce, then still.
  if (t < T4.land) return { x: BALL_GROUND.x, y: BALL_GROUND.y - 6, turn: 0 }
  const w = T4.wobbles.find((at) => t >= at && t < at + 300)
  if (w === undefined) return { ...BALL_GROUND, turn: 0 }
  return t < w + 150
    ? { x: BALL_GROUND.x - 2, y: BALL_GROUND.y, turn: -20 }
    : { x: BALL_GROUND.x + 2, y: BALL_GROUND.y, turn: 20 }
}

function CatchScene({ f, demo }: SceneProps) {
  const { t: tr } = useT()
  const { t } = f
  const ball = ballAt(t)
  const white = t >= T4.contact && t < T4.gone
  const stars = t >= T4.click && t < T4.click + 400 ? Math.min(2, Math.floor((t - T4.click) / 100)) : -1
  const roll = demo.catchRoll
  return (
    <>
      <FoePlate b={demo.foe} hp={0} />
      <span
        className="absolute bg-shadow pixel-corners"
        style={{ left: W - 94, top: 110, width: 92, height: 10 }}
      />
      {t < T4.gone && (
        // Worn out: greyed and still (no idle hop); drawn into the ball as a white silhouette.
        <span
          className="absolute [&_.mini-hop]:[animation:none]"
          style={{ left: W - 88, top: 44, filter: white ? 'brightness(0) invert(1)' : 'grayscale(1)' }}
        >
          <MiniSprite dex={demo.foe.dex} size={MON} />
        </span>
      )}
      <span
        className="absolute z-10"
        style={{
          left: ball.x,
          top: ball.y,
          transform: ball.turn ? `rotate(${ball.turn}deg)` : undefined,
          transformOrigin: '50% 100%',
        }}
      >
        <PixelIcon name="ball" size={24} />
      </span>
      {stars >= 0 &&
        [-60, 0, 60].map((deg) => {
          const d = 22 + stars * 8
          const rad = ((deg - 90) * Math.PI) / 180
          return (
            <span
              key={deg}
              className="absolute"
              style={{
                left: Math.round(BALL_GROUND.x + 12 + Math.cos(rad) * d - 9),
                top: Math.round(BALL_GROUND.y + 12 + Math.sin(rad) * d - 9),
              }}
            >
              <PixelIcon name="sparkle" size={18} />
            </span>
          )
        })}
      {t >= T4.gotcha && (
        <span
          className="pixel-dialogue absolute inset-x-0 flex items-center justify-center gap-3 px-2 py-1 text-ink"
          style={{ top: 160, minHeight: 56 }}
        >
          <span className="font-pixel text-[26px] leading-none">{tr('ui.victory.gotcha')}</span>
          {roll && t >= T4.die && (
            <span className="flex items-center gap-1.5 font-pixel text-[22px] leading-none">
              <Die type="base" face={{ kind: 'number', value: roll.die }} size={32} />+{roll.bonus} ={' '}
              {roll.die + roll.bonus} ≥ {roll.need}
            </span>
          )}
        </span>
      )}
    </>
  )
}

/** The dice in these cards are thrown without a sound, whatever the dice throws' switch draws (docs/38 §8b). */
const QUIET: DiceLab = { quiet: true }

/** The four cards (`mode` forces one way of running them: the Kitchen Sink). */
export function HowToPlay({ mode: forced }: { mode?: HowToMode }) {
  const { t } = useT()
  const id = useId()
  const data = useGame((s) => s.data)
  const auto = useHowToMode()
  const { calm } = useMotion()
  const mode = forced ?? auto
  const demo = useMemo(() => makeDemo(data), [data])
  const hit = useMemo(() => (demo ? hitPlan(demo) : null), [demo])
  if (!demo || !hit) return null
  const props = { demo, calm }
  return (
    <DiceLabContext.Provider value={QUIET}>
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <h2 id={id} className="text-[34px] leading-none">
          {t('ui.help.howBasics')}
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <HowToCard
            title={t('ui.help.howThrow')}
            text={t('ui.help.howThrowText')}
            alt={t('ui.help.howThrowAlt')}
            length={throwLength(demo.first.length)}
            still={throwLength(demo.first.length)}
            mode={mode}
            scene={(f) => <ThrowScene f={f} {...props} />}
          />
          <HowToCard
            title={t('ui.help.howReroll')}
            text={t('ui.help.howRerollText')}
            alt={t('ui.help.howRerollAlt')}
            length={T2.length}
            still={T2.toButton[1]}
            mode={mode}
            scene={(f) => <RerollScene f={f} {...props} />}
          />
          <HowToCard
            title={t('ui.help.howHit')}
            text={t('ui.help.howHitText')}
            alt={t('ui.help.howHitAlt')}
            length={hit.length}
            still={hit.move[1]}
            mode={mode}
            scene={(f) => <HitScene f={f} {...props} />}
          />
          <HowToCard
            title={t('ui.help.howCatch')}
            text={t('ui.help.howCatchText')}
            alt={t('ui.help.howCatchAlt')}
            length={T4.length}
            still={T4.still}
            mode={mode}
            scene={(f) => <CatchScene f={f} {...props} />}
          />
        </div>
      </section>
    </DiceLabContext.Provider>
  )
}
