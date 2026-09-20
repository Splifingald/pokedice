// The showpiece: drives the Phase 2 engine through the store and renders its log.
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  activeBattler,
  autoEvents,
  battleBackgroundFor,
  computeDamage,
  confusionRecoil,
  createRng,
  faceOf,
  facesOf,
  hasStatus,
  progressOf,
  randomSeed,
  statusCounts,
  statusesFromRoll,
  STATUS_KINDS,
  usableIn,
  type BattleBackground,
  type Battler,
  type Side,
} from '@/engine'
import { Die } from '@/components/Die'
import { HpBar } from '@/components/HpBar'
import { PixelIcon, STATUS_ICON } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { OakTip, useOneTimeTip } from '@/components/OakTip'
import { ParticleCanvas, type ParticleHandle } from '@/components/ParticleCanvas'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { playerOf, PokeBall, ThrowSprite, TrainerSprite } from '@/components/TrainerArt'
import { StatusIcons } from '@/components/StatusIcons'
import { TypeBadge } from '@/components/TypeBadge'
import { comboName, statusName, trainerTitle } from '@/lib/format'
import { useT } from '@/i18n/react'
import { AUTO_PACE, PaceContext, usePace } from '@/lib/pace'
import { useIsDesktop, useMediaQuery } from '@/lib/useMediaQuery'
import { setSettings, useGame, type BattleSlice } from '@/store/game'
import { dispatchBattle } from '@/store/run'
import spriteMetrics from '@/data/sprite-metrics.json'
import { STATUS_COLORS } from '@/theme/colors'
import { cx, typeColor } from '@/theme/util'
import { useBattleAnimator } from './useBattleAnimator'
import { CatchView } from './CatchView'
import { VictoryView, WipeView, StalemateView } from './VictoryView'
import { BattleHistory, BattleHistoryList, DamageRecap } from './BattleHistory'
import { effectText } from '@/i18n/text'

/**
 * The info box: name, level, types, status and HP. The foe's HP is a bar only — never its exact numbers. `compact`
 * (phones) packs it into two rows so both boxes fit around the Pokémon on a small scene.
 */
function BattlerPanel({
  b,
  hp,
  side,
  compact,
  badges,
  footer,
  className,
}: {
  b: Battler
  hp: number
  side: Side
  compact: boolean
  /** Poké Ball pips (the trainer's team / yours). */
  badges?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  const { t } = useT()
  const foe = side === 'enemy'
  const bar = <HpBar hp={hp} max={b.maxHp} showNumbers={!foe} approximate={foe} height={foe ? 10 : 8} className={compact && foe ? 'min-w-[72px] flex-1' : 'mt-1'} />
  return (
    <div className={cx('pixel-panel', compact ? 'px-1.5 py-1' : 'p-2', className)}>
      {/* Name, then its level; the Poké Ball pips (and your status on phones) sit at the far right. */}
      <div className="flex items-center gap-1.5">
        <span className="truncate text-xl leading-none sm:text-2xl">{b.name}</span>
        {b.shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} className="shrink-0" />}
        <span className="shrink-0 text-lg leading-none sm:text-xl">{t('ui.common.level.short', { n: b.level })}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {compact && !foe && <StatusIcons status={b.status} />}
          {(foe || compact) && badges}
        </span>
      </div>
      {foe && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {b.types.map((t) => (
            <TypeBadge key={t} type={t} size="sm" />
          ))}
          <StatusIcons status={b.status} />
          {compact && bar}
        </div>
      )}
      {!(compact && foe) && bar}
      {!compact && footer}
    </div>
  )
}

function useShake(ref: RefObject<HTMLElement>, shake: { id: number; power: number } | null, reduced: boolean, pace: number) {
  useEffect(() => {
    if (!shake || reduced || !ref.current?.animate) return
    const p = shake.power
    ref.current.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${-p}px, ${p / 3}px)` },
        { transform: `translate(${p}px, ${-p / 3}px)` },
        { transform: `translate(${-p * 0.6}px, 0)` },
        { transform: `translate(${p * 0.6}px, ${p / 4}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 360 * pace, easing: 'steps(6)' },
    )
  }, [shake?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Professor Oak explains thresholds the first time a status face lands short of one (per device).
const STATUS_TIP_KEY = 'pokedice.tip.statusThreshold'

/** One square per face a status needs in the roll, filled for each that landed: full = it triggers. */
const POP_COLOR = { super: '#e8b44a', weak: '#f7f2e0', immune: '#9c9caf', normal: '#f7f2e0', heal: '#4aa84a' }

// The scene is drawn in the backgrounds' own pixels (240×112) and scaled to fit; sprites are 64×64 cells on that grid.
const SCENE_W = 240
const SCENE_H = 112
const CELL = 64
/** The foe stands on the far platform (centred at 176, 64); your Pokémon, seen from behind, on the near one. */
const FOE_SPOT = { x: 176, feet: 70 }
const OWN_SPOT = { x: 72, feet: 116 }
/** Phones: your box takes more of the width, so your Pokémon stands further left to stay clear of it. */
const OWN_SPOT_COMPACT = { x: 48, feet: 116 }
/** Phones: a strip of sky above the background holds the foe's box. Colour = the backgrounds' flat sky (row 24). */
const SKY_BAND = 34
const SKY: Record<BattleBackground, string> = { default: '#e8e8e8', grass: '#e8f0f0', rock: '#a08850', sea: '#f8f8f8', water: '#f8f8f8' }
const METRICS = spriteMetrics as Record<string, { front: number; back: number } | undefined>

/** Where a sprite cell goes (scene pixels): centred on the spot, its lowest opaque row on the spot's feet line. */
function cellBox(dex: number, side: Side, compact: boolean) {
  const spot = side === 'enemy' ? FOE_SPOT : compact ? OWN_SPOT_COMPACT : OWN_SPOT
  const gap = METRICS[dex]?.[side === 'enemy' ? 'front' : 'back'] ?? 0
  return { left: spot.x - CELL / 2, top: spot.feet - CELL + gap }
}

function useWidth(ref: RefObject<HTMLElement>) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

/** A shiny's entrance: a ring of stars twinkles around it. */
function ShinySparkle({ size, delay }: { size: number; delay: number }) {
  const pace = usePace()
  const stars = [
    [0.2, 0.25],
    [0.78, 0.2],
    [0.5, 0.08],
    [0.85, 0.62],
    [0.15, 0.7],
    [0.55, 0.5],
  ]
  const star = Math.max(10, Math.round(size / 6))
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {stars.map(([x, y], i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: x! * size - star / 2, top: y! * size - star / 2 }}
          initial={{ scale: 0, opacity: 0, rotate: 0 }}
          animate={{ scale: [0, 1.3, 0], opacity: [0, 1, 0], rotate: 90 }}
          transition={{ duration: 0.45 * pace, delay: (delay + i * 0.12) * pace, times: [0, 0.5, 1], ease: 'easeOut' }}
        >
          <svg width={star} height={star} viewBox="0 0 8 8" shapeRendering="crispEdges">
            <path d="M3 0h2v3h3v2H5v3H3V5H0V3h3z" fill="#fff8c8" />
            <path d="M3.5 1h1v2.5H7v1H4.5V7h-1V4.5H1v-1h2.5z" fill="#e8b44a" />
          </svg>
        </motion.div>
      ))}
    </div>
  )
}

function SpriteStage({
  battler,
  side,
  fainted,
  scale,
  fx,
  anchorRef,
  hidden,
  compact,
}: {
  battler: Battler
  side: Side
  fainted: boolean
  /** Screen pixels per scene pixel. */
  scale: number
  fx: ReturnType<typeof useBattleAnimator>['fx']
  anchorRef: RefObject<HTMLDivElement>
  /** Held back (the trainer is still on the field): the entrance plays once this clears. */
  hidden?: boolean
  /** Phone layout (your Pokémon stands further left). */
  compact: boolean
}) {
  const reduced = useGame((s) => s.settings.reducedMotion)
  const pace = usePace()
  const { dex, shiny } = battler
  const size = Math.round(CELL * scale)
  const box = cellBox(dex, side, compact)
  const enter = side === 'enemy' ? 60 : -60
  return (
    <div
      ref={anchorRef}
      className="absolute"
      style={{ left: box.left * scale, top: box.top * scale, width: size, height: size }}
    >
      <motion.div
        key={`${battler.uid}:${dex}`}
        // The foe slides in; yours pops out of the ball (with a flash) once the send-out throw lands.
        initial={reduced ? false : side === 'enemy' ? { opacity: 0, x: enter } : { opacity: 0, scale: 0, filter: 'brightness(4)' }}
        animate={
          fainted
            ? { opacity: 0, y: size * 0.4, transition: { duration: 0.7 * pace } }
            : hidden
              ? { opacity: 0, scale: 0, transition: { duration: 0 } }
              : side === 'enemy'
                ? { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: reduced ? 0 : 0.45 * pace } }
                : { opacity: 1, y: 0, scale: 1, filter: 'brightness(1)', transition: { duration: reduced ? 0 : 0.22 * pace, ease: 'backOut' } }
        }
        className="absolute inset-0"
        style={{ transformOrigin: '50% 90%' }}
      >
        <SpriteImg dex={dex} size={size} back={side === 'player'} shiny={shiny} alt="" />
      </motion.div>
      {shiny && !hidden && !fainted && !reduced && <ShinySparkle key={`${battler.uid}:${dex}`} size={size} delay={0.45} />}
      <AnimatePresence>
        {fx.flash?.target === side && (
          <motion.div
            key={fx.flash.id}
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 * pace }}
            style={{ mixBlendMode: 'screen' }}
          />
        )}
        {fx.status?.target === side && (
          <motion.div
            key={fx.status.id}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.3, 1.1, 1], rotate: fx.status.status === 'confuse' ? 360 : 0 }}
            transition={{ duration: 0.85 * pace }}
          >
            <PixelIcon name={STATUS_ICON[fx.status.status] ?? 'star'} size={size * 0.35} />
          </motion.div>
        )}
        {fx.pop?.target === side && (
          <motion.div
            key={fx.pop.id}
            className="pointer-events-none absolute left-1/2 top-[25%] z-20 -translate-x-1/2 font-pixel leading-none"
            initial={{ opacity: 0, y: 10, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [10, -20, -34, -48], scale: [0.4, 1.7, 1.2, 1] }}
            transition={{ duration: reduced ? 0 : 1.1 * pace }}
            style={{
              fontSize: Math.max(24, size * 0.28),
              color: POP_COLOR[fx.pop.tone],
              textShadow: '3px 3px 0 #2a2438, -2px -2px 0 #2a2438, 2px -2px 0 #2a2438, -2px 2px 0 #2a2438',
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

const TRAINER_INTRO_MS = 850

// Sending a Pokémon out: the player's 5-frame throw, the ball's short arc, then the Pokémon pops out.
const SEND_FRAME_MS = 55
const SEND_BALL_AT = 110
const SEND_BALL_MS = 260
const SEND_OUT_POP_MS = SEND_BALL_AT + SEND_BALL_MS

function SendOut({ character, size }: { character: 'red' | 'green'; size: number }) {
  const [frame, setFrame] = useState(0)
  const [ball, setBall] = useState(false)
  const [gone, setGone] = useState(false)
  const pace = usePace()
  useEffect(() => {
    const timers = [
      ...[1, 2, 3, 4].map((f, i) => setTimeout(() => setFrame(f), i * SEND_FRAME_MS * pace)),
      setTimeout(() => setBall(true), SEND_BALL_AT * pace),
      setTimeout(() => setBall(false), SEND_OUT_POP_MS * pace),
      setTimeout(() => setGone(true), (SEND_OUT_POP_MS - 60) * pace),
    ]
    return () => timers.forEach(clearTimeout)
  }, [pace])
  const px = Math.max(64, Math.round(size / 64 - 0.2) * 64)
  const ballSize = Math.round(size / 6)
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <motion.div
        className="absolute bottom-0 left-0"
        initial={{ x: -px * 0.35, opacity: 1 }}
        animate={gone ? { x: -px, opacity: 0 } : { x: -px * 0.35, opacity: 1 }}
        transition={{ duration: 0.2 * pace, ease: 'easeIn' }}
      >
        <ThrowSprite character={character} frame={frame} size={px} />
      </motion.div>
      <AnimatePresence>
        {ball && (
          <motion.div
            key="ball"
            className="absolute left-0 top-0"
            initial={{ x: px * 0.25, y: size - px * 0.7, rotate: 0 }}
            animate={{
              x: [px * 0.25, size * 0.35, size / 2 - ballSize / 2],
              y: [size - px * 0.7, size * 0.1, size * 0.62],
              rotate: 540,
            }}
            exit={{ scale: 1.8, opacity: 0, transition: { duration: 0.15 * pace } }}
            transition={{ duration: (SEND_BALL_MS / 1000) * pace, ease: 'linear' }}
          >
            <PokeBall size={ballSize} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Auto-mode's picks sample rolls (like the enemy AI); its own stream keeps the battle's rolls untouched.
const autoRng = createRng(randomSeed())
/** How long auto-mode shows its dice selection before the reroll. */
const AUTO_SELECT_MS = 450

export function BattleView({ battle }: { battle: BattleSlice }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const run = useGame((s) => s.run)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const desktop = useIsDesktop()
  const short = useMediaQuery('(max-height: 700px)')
  // Desktop screens under 1000px tall get a lower scene so the controls below stay in view.
  const roomy = useMediaQuery('(min-height: 1000px)')
  const st = battle.state
  const particles = useRef<ParticleHandle>(null)
  const scene = useRef<HTMLDivElement>(null)
  const enemyAnchor = useRef<HTMLDivElement>(null)
  const playerAnchor = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<null | 'item' | 'switch' | 'history'>(null)
  const [itemKey, setItemKey] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [bossIntro, setBossIntro] = useState(st.kind === 'boss' && !reduced)

  // Auto-mode (cleared areas only): the player's side plays itself, like the enemy's.
  const autoOn = useGame((s) => !!s.settings.autoMode)
  const auto = autoOn && !!save && !!run.areaId && progressOf(save, run.areaId).cleared
  // Auto-mode plays the whole fight 50% faster: animations, dice and timers.
  const pace = auto ? AUTO_PACE : 1

  const enc = run.encounter
  const isTrainerFight = enc?.kind === 'trainer' || enc?.kind === 'gym'
  // Before each of their Pokémon, the trainer steps onto the field, then makes way for it.
  const [trainerIntro, setTrainerIntro] = useState(isTrainerFight && !reduced)
  const intro = bossIntro || trainerIntro
  const trainerName = isTrainerFight ? trainerTitle(enc) : null
  const onHit = useCallback((target: Side, color: string, power: number) => {
    const anchor = (target === 'enemy' ? enemyAnchor : playerAnchor).current
    const host = scene.current
    if (!anchor || !host) return
    const a = anchor.getBoundingClientRect()
    const h = host.getBoundingClientRect()
    particles.current?.burst(a.left - h.left + a.width / 2, a.top - h.top + a.height / 2, color, Math.round(40 * power + 20), power)
  }, [])

  const { fx, ready } = useBattleAnimator(battle, reduced, {
    kind: st.kind,
    trainerName,
    itemName: (k) => data.items[k]?.name ?? k,
    colorOf: (t) => data.diceTypes[t as keyof typeof data.diceTypes]?.color ?? typeColor(t),
    onHit,
  }, pace)
  useShake(scene, fx.shake, reduced, pace)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    if (!bossIntro) return
    const t = setTimeout(() => setBossIntro(false), 1900 * pace)
    return () => clearTimeout(t)
  }, [bossIntro, pace])
  useEffect(() => {
    if (!trainerIntro) return
    const t = setTimeout(() => setTrainerIntro(false), TRAINER_INTRO_MS * pace)
    return () => clearTimeout(t)
  }, [trainerIntro, pace])

  // The enemy acts on its own once the log has caught up.
  useEffect(() => {
    if (!ready || intro || st.phase !== 'enemy_turn') return
    const t = setTimeout(() => dispatchBattle({ t: 'AI_TURN' }), reduced ? 0 : 450 * pace)
    return () => clearTimeout(t)
  }, [ready, intro, st.phase, reduced, pace, battle.log.length])

  const active = st.player.find((p) => p.uid === fx.activeUid) ?? activeBattler(st)
  const canAct = ready && !intro && (st.phase === 'player_roll' || st.phase === 'player_reroll')
  const stunned = ready && !intro && st.phase === 'player_stunned'
  // One item per turn: before the roll, after it, or to cure a stun.
  const canItem = (canAct || stunned) && !st.itemUsedThisTurn
  const rolling = st.phase === 'player_reroll'

  const preview = useMemo(() => {
    if (!rolling || !st.dice.length) return null
    const a = activeBattler(st)
    const recoil = a.status.confused ? confusionRecoil(a.maxHp, data) : 0
    const r = computeDamage(st.dice, a.types, st.enemy.types, st.playerLevels, data)
    const statuses = statusesFromRoll(st.dice, data)
    // Every status the Pokémon's dice can land, short of its threshold (0 included): the faces only count as a number
    // this roll, and the counter shows how close it is.
    const counts = statusCounts(st.dice, data)
    const rules = data.config.status
    const possible = new Set(a.dice.flatMap((t) => facesOf(t, data).flatMap((f) => (f.kind === 'status' ? [f.status] : []))))
    const almost = STATUS_KINDS.filter((k) => possible.has(k) && counts[k] < rules[k].threshold).map((k) => ({
      status: k,
      have: counts[k],
      need: rules[k].threshold,
      value: st.dice.map((d) => faceOf(d, data)).find((f) => f.kind === 'status' && f.status === k)?.value ?? 0,
    }))
    return { r, statuses, almost, recoil }
  }, [rolling, st, data])
  const [statusTip, closeStatusTip] = useOneTimeTip(STATUS_TIP_KEY)

  const inventory = save?.inventory ?? {}
  const ownedItems = Object.entries(inventory).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'battle'))
  const itemHelps = (key: string, p: Battler) => {
    const fx = data.items[key]?.effect
    if (!fx) return false
    if (fx.kind === 'revive') return p.hp <= 0
    if (p.hp <= 0) return false
    if (fx.kind === 'heal') return p.hp < p.maxHp
    if (fx.kind === 'cure') return fx.statuses.some((k) => hasStatus(p.status, k))
    if (fx.kind === 'rerolls') return p.rerollsLeft < p.rerolls
    return false
  }
  const switchTargets = st.player.filter((p, i) => p.hp > 0 && i !== st.activeIndex)

  // Keyboard: 1..6 toggle, R reroll, Space roll/attack.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(canAct || stunned) || auto || menu || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        dispatchBattle(stunned ? { t: 'PASS' } : st.phase === 'player_roll' ? { t: 'ROLL' } : { t: 'ATTACK' })
      } else if (e.key.toLowerCase() === 'r' && rolling) dispatchBattle({ t: 'REROLL' })
      else if (/^[1-6]$/.test(e.key) && rolling) dispatchBattle({ t: 'TOGGLE_DIE', i: Number(e.key) - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAct, stunned, auto, menu, rolling, st.phase])

  // Every turn starts with the throw, so the dice roll themselves (items, switching and running still work after it).
  useEffect(() => {
    if (auto || !ready || intro || menu || st.phase !== 'player_roll') return
    const t = setTimeout(() => dispatchBattle({ t: 'ROLL' }), reduced ? 0 : 400)
    return () => clearTimeout(t)
  }, [auto, ready, intro, menu, st.phase, reduced, battle.log.length])

  // Auto-mode: every player move once the log has caught up. A reroll shows its selected dice for a moment first.
  const autoPhase = st.phase === 'player_roll' || st.phase === 'player_reroll' || st.phase === 'player_stunned' || st.phase === 'player_switch'
  useEffect(() => {
    if (!auto || !ready || intro || menu || !autoPhase) return
    let inner: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(
      () => {
        const b = useGame.getState().battle
        if (!b) return
        const events = autoEvents(b.state, data, autoRng)
        const last = events.pop()
        if (!last) return
        events.forEach(dispatchBattle)
        if (events.length && !reduced) inner = setTimeout(() => dispatchBattle(last), AUTO_SELECT_MS * pace)
        else dispatchBattle(last)
      },
      reduced ? 0 : (st.phase === 'player_reroll' ? 350 : 400) * pace,
    )
    return () => {
      clearTimeout(t)
      clearTimeout(inner)
    }
  }, [auto, ready, intro, menu, autoPhase, st.phase, data, reduced, pace, battle.log.length])

  const usefulItems = ownedItems.filter(([k]) => st.player.some((p) => itemHelps(k, p)))
  const showItem = usefulItems.length > 0
  const showSwitch = data.config.allowVoluntarySwitch && switchTargets.length > 0

  // Stunned with no item that could help: nothing to do but lose the turn.
  const stunChoice = canItem && showItem
  useEffect(() => {
    if (auto || !stunned || menu || stunChoice) return
    const t = setTimeout(() => dispatchBattle({ t: 'PASS' }), 900)
    return () => clearTimeout(t)
  }, [auto, stunned, menu, stunChoice])

  // Each of your Pokémon comes out of a ball thrown by the player (first send-out and every switch).
  const character = playerOf(save).character
  const [sendingUid, setSendingUid] = useState<string | null>(reduced ? null : active.uid)
  const lastUid = useRef(active.uid)
  useEffect(() => {
    if (active.uid === lastUid.current) return
    lastUid.current = active.uid
    if (!reduced) setSendingUid(active.uid)
  }, [active.uid, reduced])
  useEffect(() => {
    if (!sendingUid) return
    const t = setTimeout(() => setSendingUid(null), SEND_OUT_POP_MS * pace)
    return () => clearTimeout(t)
  }, [sendingUid, pace])
  const compact = !desktop
  const teamPips = (
    <span className="flex gap-0.5" aria-label={`${st.player.filter((p) => p.hp > 0).length} of ${st.player.length} able`}>
      {st.player.map((p) => (
        <PixelIcon key={p.uid} name="ball" size={12} style={{ opacity: p.hp > 0 ? 1 : 0.3 }} />
      ))}
    </span>
  )
  const sceneWidth = useWidth(scene)
  const scale = sceneWidth / SCENE_W
  const area = data.areas.find((a) => a.id === run.areaId)
  const background = battleBackgroundFor(enc, area, data)
  const mainSize = desktop ? 'lg' : 'md'
  const minorSize = desktop ? 'md' : 'sm'
  // Dice fill the tray: sized by how many are thrown (up to 64px), never under a 44px tap target.
  const diceCount = Math.max(1, active.dice.length, st.enemy.dice.length)
  const dieSize = desktop ? 64 : Math.max(44, Math.min(64, Math.floor((window.innerWidth - 56 - (diceCount - 1) * 8) / diceCount)))

  // Tray: animated roll while playing the log; the live, selectable roll once caught up.
  const tray =
    ready && rolling
      ? {
          side: 'player' as Side,
          dice: st.dice,
          keys: fx.tray?.side === 'player' && fx.tray.dice.length === st.dice.length ? fx.tray.keys : st.dice.map((_, i) => `s${i}`),
        }
      : fx.tray

  const trainerTeam = isTrainerFight ? enc.team : []
  const trainerLeft = isTrainerFight && run.trainer ? trainerTeam.length - run.trainer.index : 0
  const terminal = st.phase === 'won' || st.phase === 'lost' || st.phase === 'fled'

  return (
    <PaceContext.Provider value={pace}>
    {/* The scene keeps the backgrounds' 240×112 shape, so its width sets its height: capped on desktop so the tray and
        controls stay in view (shorter desktops get a narrower column). */}
    <div className={cx('relative mx-auto flex w-full flex-col gap-2 sm:gap-3', desktop ? (roomy ? 'max-w-3xl' : 'max-w-[640px]') : 'max-w-5xl')}>
      <h1 className="sr-only">
        {t('ui.battle.heading', {
          mine: active.name,
          foe: trainerName
            ? t('ui.battle.theirs', { trainer: trainerName, name: st.enemy.name })
            : st.kind === 'wild'
              ? t('ui.battle.aWild', { name: st.enemy.name })
              : st.enemy.name,
        })}
      </h1>
      {/* Scene: the area's battle background, the foe on the far platform, yours from behind on the near one. */}
      <div className="pixel-panel overflow-hidden p-0">
        <div ref={scene} className="relative w-full" style={{ paddingTop: compact ? SKY_BAND : 0 }} data-background={background}>
          {compact && (
            <div
              className="absolute inset-x-0 top-0"
              style={{ height: SKY_BAND, backgroundImage: `url(/battle/${background}.png)`, backgroundSize: '100% auto', imageRendering: 'pixelated' }}
              aria-hidden
            />
          )}
          <div
            className="relative w-full overflow-hidden"
            style={{
              aspectRatio: `${SCENE_W} / ${SCENE_H}`,
              backgroundImage: `url(/battle/${background}.png)`,
              backgroundSize: '100% 100%',
              imageRendering: 'pixelated',
            }}
          >
            {/* Under the sky strip, the background's own striped top would show twice: flatten it. */}
            {compact && <div className="absolute inset-x-0 top-0" style={{ height: 20 * scale, background: SKY[background] }} aria-hidden />}
            {scale > 0 && (
              <>
                <SpriteStage
                  battler={st.enemy}
                  side="enemy"
                  fainted={!!fx.fainted[st.enemy.uid]}
                  scale={scale}
                  compact={compact}
                  fx={fx}
                  anchorRef={enemyAnchor}
                  hidden={trainerIntro}
                />
                <AnimatePresence>
                  {trainerIntro && isTrainerFight && (
                    <motion.div
                      key="trainer"
                      className="absolute z-10"
                      style={{
                        left: (FOE_SPOT.x - CELL / 2) * scale,
                        top: (FOE_SPOT.feet - CELL + 2) * scale,
                        width: CELL * scale,
                        height: CELL * scale,
                      }}
                      initial={{ x: 90, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 110, opacity: 0, transition: { duration: 0.2 * pace, ease: 'easeIn' } }}
                      transition={{ duration: 0.22 * pace, ease: 'easeOut' }}
                      aria-hidden
                    >
                      <TrainerSprite src={enc.spriteUrl} size={Math.round(CELL * scale)} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <SpriteStage
                  battler={active}
                  side="player"
                  fainted={!!fx.fainted[active.uid]}
                  scale={scale}
                  compact={compact}
                  fx={fx}
                  anchorRef={playerAnchor}
                  hidden={sendingUid === active.uid}
                />
                {sendingUid === active.uid && (
                  <div
                    key={sendingUid}
                    className="absolute"
                    style={{ left: ((compact ? OWN_SPOT_COMPACT : OWN_SPOT).x - CELL / 2) * scale, top: (SCENE_H - CELL) * scale, width: CELL * scale, height: CELL * scale }}
                  >
                    <SendOut character={character} size={Math.round(CELL * scale)} />
                  </div>
                )}
              </>
            )}
          </div>

          <BattlerPanel
            b={st.enemy}
            hp={fx.hp[st.enemy.uid] ?? st.enemy.hp}
            side="enemy"
            compact={compact}
            className={cx('absolute z-10', compact ? 'left-[3px] top-[3px] w-[60%]' : 'left-[2%] top-[3%] w-[46%]')}
            badges={
              trainerLeft > 0 && (
                <span className="flex items-center gap-0.5">
                  {trainerTeam.map((_, i) => (
                    <PixelIcon key={i} name="ball" size={12} style={{ opacity: i < (run.trainer?.index ?? 0) ? 0.3 : 1 }} />
                  ))}
                </span>
              )
            }
          />
          <BattlerPanel
            b={active}
            hp={fx.hp[active.uid] ?? active.hp}
            side="player"
            compact={compact}
            className={cx('absolute z-10', compact ? 'bottom-[3px] right-[3px] w-[57%]' : 'bottom-[3%] right-[2%] w-[46%]')}
            badges={teamPips}
            footer={
              <div className="mt-1 flex items-center justify-between gap-1 text-base leading-none">
                <span className="flex items-center gap-1 whitespace-nowrap" title={t('ui.battle.rerollsLeft')}>
                  <PixelIcon name="reroll" size={12} />{' '}
                  {t('ui.battle.rerollsOf', { left: active.rerollsLeft, max: active.rerolls })}
                </span>
                <StatusIcons status={active.status} />
                {teamPips}
              </div>
            }
          />

          <ParticleCanvas ref={particles} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />

          <AnimatePresence>
            {fx.banner && (
              <motion.div
                key={fx.banner.id}
                className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center"
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: [0.3, 1.25, 1], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.2 * pace, times: [0, 0.2, 0.8, 1] }}
              >
                <span
                  className={cx(
                    'border-[3px] border-ink px-4 py-1 text-2xl shadow-hard sm:text-3xl',
                    fx.banner.tone === 'super' && 'bg-gold text-ink',
                    fx.banner.tone === 'weak' && 'bg-shadow text-panel',
                    fx.banner.tone === 'immune' && 'bg-ink text-panel',
                    fx.banner.tone === 'info' && 'bg-panel text-ink',
                  )}
                >
                  {fx.banner.text}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {bossIntro && (
            <motion.div
              className="absolute inset-0 z-30 flex items-center justify-center gap-3 bg-ink text-panel sm:gap-6"
              initial={{ opacity: 1 }}
              animate={{ opacity: [1, 1, 0] }}
              transition={{ duration: 1.9 * pace, times: [0, 0.8, 1] }}
            >
              <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 1.2 * pace }}>
                <SpriteImg dex={st.enemy.dex} size={Math.round(CELL * scale * 1.3)} silhouette />
              </motion.div>
              <div className="flex flex-col items-center">
                <div className="text-lg tracking-[0.4em] text-gold sm:text-xl">{t('ui.enc.legendaryTag')}</div>
                <div className="text-4xl sm:text-5xl">{st.enemy.name}</div>
                <div className="text-xl sm:text-2xl">{t('ui.common.level.short', { n: st.enemy.level })}</div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Message + tray */}
      <div
        className={cx(
          'pixel-dialogue flex flex-col gap-2',
          short ? 'p-2' : 'p-3',
          !desktop && 'sticky bottom-0 z-30',
        )}
        style={{ paddingBottom: desktop ? undefined : `calc(${short ? '0.5rem' : '0.75rem'} + env(safe-area-inset-bottom))` }}
      >
        <div className={cx('min-h-[1.6em] leading-tight', short ? 'text-xl' : 'text-2xl')} aria-live="polite">
          {fx.message}
        </div>

        <motion.div
          key={fx.fly ? `fly${fx.fly.id}` : 'tray'}
          className={cx('flex flex-wrap items-center justify-center gap-2 sm:gap-3', short ? 'min-h-[64px]' : 'min-h-[72px]')}
          initial={false}
          animate={fx.fly && !reduced ? { y: fx.fly.to === 'enemy' ? -140 : 60, opacity: 0, scale: 0.6 } : { y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 * pace, ease: 'easeIn' }}
        >
          {tray?.dice.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <Die
                type={d.type}
                face={faceOf(d, data)}
                size={dieSize}
                rollKey={tray.keys[i]}
                delay={i * 0.06 * pace}
                selected={ready && rolling && !!st.selected[i]}
                onClick={canAct && rolling && !auto ? () => dispatchBattle({ t: 'TOGGLE_DIE', i }) : undefined}
                locked={tray.side === 'enemy'}
                asButton={tray.side === 'player'}
              />
              {desktop && ready && rolling && <span className="font-mono text-xs text-muted">{i + 1}</span>}
            </div>
          ))}
          {canAct && st.phase === 'player_roll' && <span className="text-xl text-muted">{t('ui.battle.rollingDice')}</span>}
          {tray?.side === 'enemy' && (
            <span className="w-full text-center text-sm uppercase tracking-widest text-muted">{t('ui.battle.enemyRoll')}</span>
          )}
        </motion.div>

        {/* Live combo readout */}
        {ready && preview && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xl">
            {preview.recoil > 0 && (
              <span className="text-danger">{t('ui.battle.confusedRecoil', { name: active.name, amount: preview.recoil })}</span>
            )}
            <span className={preview.r.combo ? 'text-ink' : 'text-muted'}>
              {preview.r.combo
                ? t('ui.battle.comboIs', { combo: comboName(preview.r.combo.key).toUpperCase(), bonus: preview.r.combo.bonus })
                : t('ui.battle.noCombo')}
            </span>
            <button
              type="button"
              aria-expanded={showBreakdown}
              aria-label={t('ui.battle.damageDetails', {
                amount: preview.r.final,
                action: t(showBreakdown ? 'ui.battle.hide' : 'ui.battle.show'),
              })}
              title={t('ui.battle.damageTitle')}
              className={cx('inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-1 leading-none md:min-h-[32px]', short ? 'text-xl' : 'text-2xl')}
              onClick={() => setShowBreakdown((v) => !v)}
            >
              <PixelIcon name="sword" size={short ? 16 : 20} /> {preview.r.final}
            </button>
            {preview.statuses.map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1 border-2 border-ink bg-panel px-1 text-base">
                <PixelIcon name={STATUS_ICON[s.status] ?? 'star'} size={12} />
                {t(`ui.status.${s.status}.label`)}
                {s.stacks && s.stacks > 1 ? ` ×${s.stacks}` : ''}
              </span>
            ))}
            {preview.almost.map((s) => (
              <span
                key={s.status}
                className="inline-flex items-center gap-1 border-2 border-dashed px-1 text-base text-muted"
                style={{ borderColor: STATUS_COLORS[s.status] }}
                title={t('ui.battle.almostStatus', { status: statusName(s.status), need: s.need })}
              >
                <PixelIcon name={STATUS_ICON[s.status] ?? 'star'} size={12} />
                {t(`ui.status.${s.status}.label`)} {s.have}/{s.need}
              </span>
            ))}
          </div>
        )}
        {ready && preview && !auto && statusTip && preview.almost.some((s) => s.have > 0) && (
          <OakTip onClose={closeStatusTip}>
            {(() => {
              const s = preview.almost.find((x) => x.have > 0)!
              return t('ui.battle.statusTip', {
                status: statusName(s.status),
                need: s.need,
                have: s.have,
                counts: t(s.have === 1 ? 'ui.battle.countsOne' : 'ui.battle.countsMany', { value: s.value }),
              })
            })()}
          </OakTip>
        )}
        {ready && preview && showBreakdown && <DamageRecap result={preview.r} />}

        {/* Controls — auto-mode plays them itself and only offers STOP. */}
        {auto && !terminal && (
          <div className="flex flex-wrap items-center justify-center gap-2" role="status">
            <span className="flex items-center gap-1 text-xl">
              <PixelIcon name="dice" size={18} /> {t('ui.battle.autoMode')}
            </span>
            <PixelButton size={minorSize} onClick={() => setSettings({ autoMode: false })}>
              {t('ui.battle.stop')}
            </PixelButton>
          </div>
        )}
        {!auto && stunned && (
          <PixelButton variant="primary" size={mainSize} className="self-center" onClick={() => dispatchBattle({ t: 'PASS' })}>
            {t('ui.battle.skipTurn')}
          </PixelButton>
        )}
        {!auto && rolling && (
          <div className="grid w-full grid-cols-2 items-start gap-2 sm:mx-auto sm:max-w-md">
            <div className="flex flex-col gap-1">
              <PixelButton
                size={mainSize}
                // Icon + label must stay on one line in a half-width column on narrow phones.
                className="min-h-[48px] gap-1 whitespace-nowrap px-2 max-[400px]:text-xl"
                disabled={!canAct || active.rerollsLeft <= 0 || !st.selected.some(Boolean)}
                onClick={() => dispatchBattle({ t: 'REROLL' })}
                quiet
              >
                <PixelIcon name="reroll" size={18} /> {t('ui.battle.reroll', { left: active.rerollsLeft })}
              </PixelButton>
              {active.rerollsLeft > 0 && (
                <span className={cx('text-center leading-tight text-muted', short ? 'whitespace-nowrap text-sm' : 'text-base')}>{t('ui.battle.selectDice')}</span>
              )}
            </div>
            <PixelButton variant="primary" size={mainSize} className="min-h-[48px] gap-1 whitespace-nowrap px-2 max-[400px]:text-xl" disabled={!canAct} onClick={() => dispatchBattle({ t: 'ATTACK' })}>
              <PixelIcon name="sword" size={18} /> {t('ui.battle.attack')}
            </PixelButton>
          </div>
        )}
        {!auto && !terminal && (showItem || showSwitch || st.canRun) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {showItem && (
              <PixelButton
                size={minorSize}
                disabled={!canItem}
                title={st.itemUsedThisTurn ? t('ui.battle.oneItemPerTurn') : undefined}
                onClick={() => setMenu('item')}
              >
                <PixelIcon name="potion" size={14} /> {t('ui.battle.item')}
              </PixelButton>
            )}
            {showSwitch && (
              <PixelButton size={minorSize} disabled={!canAct} onClick={() => setMenu('switch')}>
                <PixelIcon name="ball" size={14} /> {t('ui.battle.switch')}
              </PixelButton>
            )}
            {st.canRun && (
              <PixelButton size={minorSize} variant="ghost" disabled={!canAct} onClick={() => dispatchBattle({ t: 'RUN' })}>
                <PixelIcon name="run" size={14} /> {t('ui.battle.run')}
              </PixelButton>
            )}
          </div>
        )}
        {desktop && canAct && !auto && (
          <div className="text-center text-sm text-muted">
            {t('ui.battle.keys', { action: t(rolling ? 'ui.battle.keyAttack' : 'ui.battle.keyRoll') })}
          </div>
        )}
      </div>

      {/* Phones: the history sits on its own, below the message, dice and controls; it opens in a sheet. */}
      {!desktop && (
        <PixelButton size="sm" variant="ghost" className="w-full" onClick={() => setMenu('history')}>
          <PixelIcon name="history" size={16} /> {t('ui.battle.history')}
        </PixelButton>
      )}
      {desktop && <BattleHistory battle={battle} cursor={fx.cursor} defaultOpen />}
      <Modal open={menu === 'history'} onClose={() => setMenu(null)} title={t('ui.battle.history')}>
        <BattleHistoryList battle={battle} cursor={fx.cursor} />
      </Modal>

      {/* Forced switch after a faint (free) */}
      <Modal open={ready && !auto && st.phase === 'player_switch'} dismissable={false} title={t('ui.battle.chooseNext')}>
        <div className="flex flex-col gap-2">
          {switchTargets.map((p) => (
            <SwitchRow key={p.uid} b={p} onPick={() => dispatchBattle({ t: 'SWITCH', instanceId: p.uid })} />
          ))}
        </div>
      </Modal>

      {/* Voluntary switch (costs the turn) */}
      <Modal open={menu === 'switch'} onClose={() => setMenu(null)} title={t('ui.battle.switchCosts')}>
        <div className="flex flex-col gap-2">
          {switchTargets.map((p) => (
            <SwitchRow
              key={p.uid}
              b={p}
              onPick={() => {
                setMenu(null)
                dispatchBattle({ t: 'SWITCH', instanceId: p.uid })
              }}
            />
          ))}
        </div>
      </Modal>

      {/* Items: one per turn, the turn goes on */}
      <Modal
        open={menu === 'item'}
        onClose={() => {
          setMenu(null)
          setItemKey(null)
        }}
        title={itemKey ? t('ui.battle.useItemOn', { item: data.items[itemKey]?.name ?? itemKey }) : t('ui.battle.itemsTitle')}
      >
        {!itemKey ? (
          <div className="flex flex-col gap-2">
            {ownedItems.map(([k, n]) => {
              const it = data.items[k]!
              const useful = st.player.some((p) => itemHelps(k, p))
              return (
                <PixelButton
                  key={k}
                  className="justify-between"
                  disabled={!useful}
                  onClick={() => {
                    // Ethers go to the Pokémon in battle; everything else asks who.
                    if (it.effect.kind === 'rerolls') {
                      dispatchBattle({ t: 'USE_ITEM', key: k, targetUid: activeBattler(st).uid })
                      setMenu(null)
                    } else setItemKey(k)
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ItemSprite item={it} size={24} />
                    <span className="min-w-0">
                      {it.name} <span className="text-base">({effectText(it)})</span>
                    </span>
                  </span>
                  <span className="font-mono text-base">×{n}</span>
                </PixelButton>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {st.player.map((p) => (
              <SwitchRow
                key={p.uid}
                b={p}
                disabled={!itemHelps(itemKey, p)}
                onPick={() => {
                  dispatchBattle({ t: 'USE_ITEM', key: itemKey, targetUid: p.uid })
                  setMenu(null)
                  setItemKey(null)
                }}
              />
            ))}
          </div>
        )}
      </Modal>

      {ready && run.phase === 'catch' && <CatchView />}
      {ready && run.phase === 'victory' && <VictoryView />}
      {ready && run.phase === 'wipe' && <WipeView />}
      {ready && run.phase === 'stalemate' && <StalemateView />}
    </div>
    </PaceContext.Provider>
  )
}

function SwitchRow({ b, onPick, disabled }: { b: Battler; onPick: () => void; disabled?: boolean }) {
  const { t } = useT()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="pixel-panel flex w-full items-center gap-2 p-2 text-left enabled:hover:bg-white"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-xl leading-none">
          <span className="flex items-center gap-1">
            <MiniSprite dex={b.dex} size={40} className="-my-2" />
            {b.name}
          </span>
          <span>{t('ui.common.level.short', { n: b.level })}</span>
        </div>
        <HpBar hp={b.hp} max={b.maxHp} height={8} className="mt-1" />
      </div>
    </button>
  )
}
