// The battle, full screen: the 240×160 stage on top (BattleStage) and the panel under it — the message, the dice tray
// and its readout, the actions, the Bag and the team. It drives the engine through the store and plays the engine's
// log (useBattleAnimator); the UI never recomputes a rule.
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  activeBattler,
  autoEvents,
  comboDice,
  computeDamage,
  confusionRecoil,
  createRng,
  faceOf,
  facesOf,
  formChoices,
  gmaxChoices,
  hasStatus,
  megaChoices,
  megaDie,
  progressOf,
  randomSeed,
  statusCounts,
  statusesFromRoll,
  STATUS_KINDS,
  usableIn,
  type BattleEvent,
  type Battler,
  type Side,
} from '@/engine'
import { playCry } from '@/audio/cries'
import { Chip } from '@/components/Chip'
import { DiceSet } from '@/components/DiceSet'
import { ForfeitButton } from '@/components/ForfeitButton'
import { HpBar } from '@/components/HpBar'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { OakTip, useOneTimeTip } from '@/components/OakTip'
import { PixelButton } from '@/components/PixelButton'
import { Sheet } from '@/components/Sheet'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { TypeMatchups } from '@/components/TypeMatchups'
import { pictureOf } from '@/fx/areaArt'
import { ballOfItem } from '@/fx/scenes'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { catchTimeline } from '@/fx/timelines/catch'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { useT } from '@/i18n/react'
import { effectText } from '@/i18n/text'
import { statusName, trainerTitle, typeName } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { capMotion, MotionCap, useMotion, type MotionLevel } from '@/lib/motion'
import { AUTO_PACE, PaceContext, VERSUS_PACE } from '@/lib/pace'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { setSettings, useGame, type BattleSlice } from '@/store/game'
import { dispatchBattle, throwBall } from '@/store/run'
import { cx } from '@/theme/util'
import { BattleHistory, BattleHistoryList, DamageRecap } from './BattleHistory'
import { BagButton, DiceTray, Readout, TeamPips, type Preview, type TrayDice } from './BattlePanel'
import { BattleStage, type StageOverlay } from './BattleStage'
import { CatchPanel, catchMessage } from './CatchPanel'
import { FoePlate, OwnPlate } from './Plates'
import { useBattleAnimator } from './useBattleAnimator'
import { StalemateView, VictoryView, WipeView } from './VictoryView'

/** The matchup pop-up over the stage: which side it belongs to decides which end it sits at. */
function MatchupPopup({ b, side, onClose }: { b: Battler; side: Side; onClose: () => void }) {
  const { t } = useT()
  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-30 cursor-default"
        aria-label={t('ui.common.close')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={t('ui.types.tap', { name: b.name })}
        className={cx(
          'pixel-panel absolute inset-x-2 z-30 max-h-[calc(100%-1rem)] overflow-y-auto p-2',
          side === 'enemy' ? 'top-2' : 'bottom-2',
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="truncate text-xl leading-none">{b.name}</span>
          <div className="flex shrink-0 gap-1">
            {b.types.map((x) => (
              <TypeBadge key={x} type={x} size="sm" />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.common.close')}
            className="ml-auto min-h-[44px] min-w-[44px] shrink-0 px-1 text-xl leading-none md:min-h-0 md:min-w-0"
          >
            ✕
          </button>
        </div>
        <TypeMatchups types={b.types} dice={b.dice} />
      </div>
    </>
  )
}

/** A hit without a scene of its own (a status tick, recoil) still shakes the stage, unless the screen should be calm. */
function useShake(
  ref: RefObject<HTMLElement>,
  shake: { id: number; power: number } | null,
  calm: boolean,
  pace: number,
) {
  useEffect(() => {
    if (!shake || calm || !ref.current?.animate) return
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

// Professor Oak explains thresholds the first time a status face lands short of one (per device).
const STATUS_TIP_KEY = 'pokedice.tip.statusThreshold'

/** The trainer on the field before their Pokémon. */
const TRAINER_INTRO_MS = 1100
/** From the foe's arrival to yours popping out of its ball. */
const SEND_OUT_MS = 900

// Auto-mode's picks sample rolls (like the enemy AI); its own stream keeps the battle's rolls untouched.
const autoRng = createRng(randomSeed())
/** How long auto-mode shows its dice selection before the reroll. */
const AUTO_SELECT_MS = 450

const BANNER_TONE = {
  super: 'bg-gold text-ink',
  weak: 'bg-paper text-ink',
  immune: 'bg-ink text-paper',
  info: 'bg-paper text-ink',
}

/**
 * A Versus fight, replayed: the whole fight was computed (and its result recorded) before it started, so the screen
 * plays it on auto and every move comes from that script instead of the run store.
 */
export interface VersusReplay {
  /** Plays the script's next step, if it is this event. */
  dispatch: (e: BattleEvent) => void
  /** The events of the script's next auto move. */
  nextMove: () => BattleEvent[]
  trainerName: string
  trainerSprite: string
  /** The opponent's team size, and which of them is out (the party on the foe's plate). */
  foeCount: number
  foeIndex: number
  /** Called once when this battle has played out; may hand back a cleanup (a pending timer). */
  onPlayed: () => void | (() => void)
  /** The result card, once the whole fight is over. */
  end?: ReactNode
}

export function BattleView({ battle, versus }: { battle: BattleSlice; versus?: VersusReplay }) {
  const { t } = useT()
  useHoldFullscreen()
  // Read through a ref, so a new `versus` object each render doesn't restart the timers that use it.
  const versusRef = useRef(versus)
  versusRef.current = versus
  const dispatch = useCallback((e: BattleEvent) => (versusRef.current?.dispatch ?? dispatchBattle)(e), [])
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const run = useGame((s) => s.run)
  const { level: chosenLevel, calm } = useMotion()
  const wide = useMediaQuery('(min-width: 1024px)')
  const st = battle.state
  const stageBox = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<null | 'item' | 'switch' | 'history' | 'mega' | 'form'>(null)
  const [itemKey, setItemKey] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  // Type hints (Trainer menu → Type chart): tapping a Pokémon opens its matchups over the stage.
  const typeHints = useGame((s) => !!s.settings.typeHints)
  const [matchups, setMatchups] = useState<Side | null>(null)

  // Auto-mode (cleared areas only): the player's side plays itself, like the enemy's. A Versus fight is always on auto.
  const autoOn = useGame((s) => !!s.settings.autoMode)
  const auto = !!versus || (autoOn && !!save && !!run.areaId && progressOf(save, run.areaId).cleared)
  // Auto-mode plays the whole fight faster: animations, dice and timers.
  const pace = versus ? VERSUS_PACE : auto ? AUTO_PACE : 1
  // A fight that plays itself is watched, not played: short animations unless the player turned them off altogether.
  const motionCap: MotionLevel | null = auto ? 'short' : null
  const level = capMotion(chosenLevel, motionCap)
  // Nothing to wait for: animations off.
  const quick = level === 'off'

  // A Versus fight has nothing to do with the area the player may be standing in.
  const enc = versus ? null : run.encounter
  // The area's picture is the battle's background; Versus keeps the drawn one.
  const art = useMemo(() => (versus ? null : pictureOf(run.areaId)), [versus, run.areaId])
  const isTrainerFight = !!versus || enc?.kind === 'trainer' || enc?.kind === 'gym'
  const trainerName = versus
    ? versus.trainerName
    : enc?.kind === 'trainer' || enc?.kind === 'gym'
      ? trainerTitle(enc)
      : null
  const trainerSprite = versus
    ? versus.trainerSprite
    : enc?.kind === 'trainer' || enc?.kind === 'gym'
      ? enc.spriteUrl
      : null

  // The entrances: a legendary's timeline, or the trainer stepping onto the field; then the foe; then yours.
  const [bossIntro, setBossIntro] = useState(st.kind === 'boss' && level !== 'off')
  const [trainerIntro, setTrainerIntro] = useState(isTrainerFight && !quick)
  const [foeOut, setFoeOut] = useState(!bossIntro && !trainerIntro)
  const [ownOut, setOwnOut] = useState(quick)
  const intro = bossIntro || trainerIntro || !ownOut

  const { fx, ready, sceneContact, sceneDone } = useBattleAnimator(
    battle,
    quick,
    {
      kind: st.kind,
      trainerName,
      itemName: (k) => data.items[k]?.name ?? k,
      speciesName: (dex) => data.species[dex]?.name ?? `#${dex}`,
      megaMechanic: (dex) => data.species[dex]?.form?.mechanic ?? null,
      gmaxTurns: data.config.gigantamax.turns,
    },
    pace,
    intro,
  )
  useShake(stageBox, fx.shake, calm, pace)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    if (!trainerIntro) return
    const t = setTimeout(() => {
      setTrainerIntro(false)
      setFoeOut(true)
    }, TRAINER_INTRO_MS * pace)
    return () => clearTimeout(t)
  }, [trainerIntro, pace])
  useEffect(() => {
    if (ownOut || !foeOut || bossIntro) return
    const t = setTimeout(() => setOwnOut(true), quick ? 0 : SEND_OUT_MS * pace)
    return () => clearTimeout(t)
  }, [ownOut, foeOut, bossIntro, quick, pace])

  // The enemy acts on its own once the log has caught up.
  useEffect(() => {
    if (!ready || intro || st.phase !== 'enemy_turn') return
    const t = setTimeout(() => dispatch({ t: 'AI_TURN' }), quick ? 0 : 450 * pace)
    return () => clearTimeout(t)
  }, [ready, intro, st.phase, quick, pace, battle.log.length, dispatch])

  const active = st.player.find((p) => p.uid === fx.activeUid) ?? activeBattler(st)
  // Cries: the foe's as it comes out, yours as each of yours does (after the foe's when both come out at once), a
  // Mega's once it stands there.
  useEffect(() => {
    if (foeOut) playCry(st.enemy.dex)
    // Once per Pokémon coming out: a form change later is the Mega's own cry, below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foeOut, st.enemy.uid])
  useEffect(() => {
    if (ownOut) playCry(active.dex, { wait: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownOut, active.uid])
  useEffect(() => {
    if (fx.cry) playCry(fx.cry.dex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.cry?.id])
  // A send-out, a faint or the end of the fight makes the open pop-up stale.
  useEffect(() => setMatchups(null), [active.uid, st.enemy.uid, st.phase])

  const canAct = ready && !intro && (st.phase === 'player_roll' || st.phase === 'player_reroll')
  const stunned = ready && !intro && st.phase === 'player_stunned'
  const forced = ready && !intro && st.phase === 'player_switch'
  // One item per turn: before the roll, after it, or to cure a stun.
  const canItem = (canAct || stunned) && !st.itemUsedThisTurn
  const rolling = st.phase === 'player_reroll'

  const preview = useMemo<Preview | null>(() => {
    if (!rolling || !st.dice.length) return null
    const a = activeBattler(st)
    const recoil = a.status.confused ? confusionRecoil(a.maxHp, data) : 0
    const r = computeDamage(st.dice, a.types, st.enemy.types, st.playerLevels, data)
    const statuses = statusesFromRoll(st.dice, data)
    // Every status the Pokémon's dice can land, short of its threshold (0 included): the faces only count as a number
    // this roll, and the counter shows how close it is.
    const counts = statusCounts(st.dice, data)
    const rules = data.config.status
    const possible = new Set(
      a.dice.flatMap((ty) => facesOf(ty, data).flatMap((f) => (f.kind === 'status' ? [f.status] : []))),
    )
    const almost = STATUS_KINDS.filter((k) => possible.has(k) && counts[k] < rules[k].threshold).map((k) => ({
      status: k,
      have: counts[k],
      need: rules[k].threshold,
      value:
        st.dice.map((d) => faceOf(d, data)).find((f) => f.kind === 'status' && f.status === k)?.value ?? 0,
    }))
    return { r, statuses, almost, recoil }
  }, [rolling, st, data])
  const [statusTip, closeStatusTip] = useOneTimeTip(STATUS_TIP_KEY)

  const inventory = save?.inventory ?? {}
  const ownedItems = Object.entries(inventory).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'battle'))
  const itemHelps = (key: string, p: Battler) => {
    const e = data.items[key]?.effect
    if (!e) return false
    if (e.kind === 'revive') return p.hp <= 0
    if (p.hp <= 0) return false
    if (e.kind === 'heal') return p.hp < p.maxHp
    if (e.kind === 'cure') return e.statuses.some((k) => hasStatus(p.status, k))
    if (e.kind === 'rerolls') return p.rerollsLeft < p.rerolls
    return false
  }
  const switchTargets = st.player.filter((p, i) => p.hp > 0 && i !== st.activeIndex)

  // Keyboard: 1..6 toggle, R reroll, Space/Enter roll or attack.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(canAct || stunned) || auto || menu || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === ' ' || e.key === 'Enter') {
        // A focused button answers Enter/Space itself.
        if ((e.target as HTMLElement)?.closest?.('button')) return
        e.preventDefault()
        dispatch(stunned ? { t: 'PASS' } : st.phase === 'player_roll' ? { t: 'ROLL' } : { t: 'ATTACK' })
      } else if (e.key.toLowerCase() === 'r' && rolling) dispatch({ t: 'REROLL' })
      else if (/^[1-6]$/.test(e.key) && rolling) dispatch({ t: 'TOGGLE_DIE', i: Number(e.key) - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAct, stunned, auto, menu, rolling, st.phase, dispatch])

  // Every turn starts with the throw, so the dice roll themselves (items, switching and running still work after it).
  useEffect(() => {
    if (auto || !ready || intro || menu || st.phase !== 'player_roll') return
    const t = setTimeout(() => dispatch({ t: 'ROLL' }), quick ? 0 : 400)
    return () => clearTimeout(t)
  }, [auto, ready, intro, menu, st.phase, quick, battle.log.length, dispatch])

  // Auto-mode: every player move once the log has caught up. A reroll shows its selected dice for a moment first.
  const autoPhase =
    st.phase === 'player_roll' ||
    st.phase === 'player_reroll' ||
    st.phase === 'player_stunned' ||
    st.phase === 'player_switch'
  useEffect(() => {
    if (!auto || !ready || intro || menu || !autoPhase) return
    let inner: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(
      () => {
        const b = useGame.getState().battle
        const replay = versusRef.current
        const events = replay ? replay.nextMove() : b ? autoEvents(b.state, data, autoRng) : []
        const last = events.pop()
        if (!last) return
        events.forEach((e) => dispatch(e))
        if (events.length && !quick) inner = setTimeout(() => dispatch(last), AUTO_SELECT_MS * pace)
        else dispatch(last)
      },
      quick ? 0 : (st.phase === 'player_reroll' ? 350 : 400) * pace,
    )
    return () => {
      clearTimeout(t)
      clearTimeout(inner)
    }
  }, [auto, ready, intro, menu, autoPhase, st.phase, data, quick, pace, battle.log.length, dispatch])

  const usefulItems = ownedItems.filter(([k]) => st.player.some((p) => itemHelps(k, p)))
  // Kept with no one left to switch to: the menu is also where FORFEIT lives.
  const showSwitch = data.config.allowVoluntarySwitch
  // Mega Evolution (once per battle, Lv.50+, from Kalos on), Gigantamax and Arceus's types.
  const megaOpts = versus ? [] : megaChoices(st, data)
  const gmaxOpts = versus ? [] : gmaxChoices(st, data)
  // Primal Reversion and Ultra Burst use the same button under their own name.
  const megaMechanic = megaOpts[0]?.form?.mechanic
  const megaLabel =
    megaMechanic === 'primal'
      ? 'ui.battle.primal'
      : megaMechanic === 'ultra'
        ? 'ui.battle.ultra'
        : 'ui.battle.mega'
  const formOpts = versus ? [] : formChoices(st, data)
  const formsLeft = data.config.formChangesPerBattle - (activeBattler(st).formChanges ?? 0)
  const megaBase = data.species[activeBattler(st).baseDex ?? activeBattler(st).dex]
  const megaEvolve = (toDex: number) => {
    setMenu(null)
    dispatch({ t: 'MEGA', toDex })
  }

  // Stunned with no item that could help: nothing to do but lose the turn.
  const stunChoice = canItem && usefulItems.length > 0
  useEffect(() => {
    if (auto || !stunned || menu || stunChoice) return
    const t = setTimeout(() => dispatch({ t: 'PASS' }), 900)
    return () => clearTimeout(t)
  }, [auto, stunned, menu, stunChoice, dispatch])

  const terminal = st.phase === 'won' || st.phase === 'lost' || st.phase === 'fled'
  // Versus: once this battle has played out, the fight moves on (the next defender, or the result).
  const played = ready && terminal
  useEffect(() => {
    if (played) return versusRef.current?.onPlayed()
  }, [played])

  // ---- The catch, in the scene: the worn-out foe waits on its platform; one throw plays the catch timeline.
  const catching = !versus && ready && run.phase === 'catch' && !!run.catch
  const [thrown, setThrown] = useState<StageOverlay | null>(null)
  const [revealed, setRevealed] = useState(false)
  const onThrow = (ballKey: string | null) => {
    throwBall(ballKey)
    const r = useGame.getState().run.catch?.result
    if (!r) return
    const foe = st.enemy
    setThrown({
      timeline: catchTimeline({
        own: spriteKey(active.dex, true, active.shiny),
        foe: spriteKey(foe.dex, false, foe.shiny),
        ball: ballOfItem(r.ballKey),
        caught: r.caught,
        short: level === 'short',
      }),
      ready: Promise.all([loadSprite(active.dex, true, active.shiny), loadSprite(foe.dex, false, foe.shiny)]),
      label: t('ui.catch.throwing', {
        ball: data.items[r.ballKey ?? 'poke-ball']?.name ?? t('ui.catch.aBall'),
      }),
      hud: { catchResult: () => setRevealed(true) },
      onEnd: () => setRevealed(true),
    })
  }

  // A legendary's entrance: the boss intro is its timeline (the foe and yours appear on its cues).
  const legend = useMemo<StageOverlay | null>(() => {
    if (!bossIntro) return null
    const foe = st.enemy
    const lead = activeBattler(st)
    return {
      timeline: legendTimeline({
        own: spriteKey(lead.dex, true, lead.shiny),
        foe: spriteKey(foe.dex, false, foe.shiny),
        look: legendLook(foe.baseDex ?? foe.dex, foe.types[0] ?? 'normal'),
        name: foe.name,
        level: t('ui.common.level.short', { n: foe.level }),
        types: foe.types.map((ty) => typeName(ty)).join(' / '),
      }),
      ready: Promise.all([loadSprite(lead.dex, true, lead.shiny), loadSprite(foe.dex, false, foe.shiny)]),
      label: t('ui.battle.aWild', { name: foe.name }),
      hud: {
        show: (side, on) => on && (side === 'foe' ? setFoeOut(true) : setOwnOut(true)),
      },
      onEnd: () => {
        setBossIntro(false)
        setFoeOut(true)
        setOwnOut(true)
      },
    }
    // One entrance per battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossIntro])

  // ---- Layout numbers.
  const panelWidth = useWidth(panel)
  const diceCount = Math.max(1, active.dice.length)
  // Your dice fill the tray: up to 54px, never under a 44px tap target.
  const dieSize = panelWidth
    ? Math.max(44, Math.min(54, Math.floor((panelWidth - 24 - (diceCount - 1) * 8) / diceCount)))
    : 54

  // Tray: the animated roll while the log plays; the live, selectable roll once caught up.
  const tray: TrayDice | null =
    ready && rolling
      ? {
          side: 'player',
          dice: st.dice,
          keys:
            fx.tray?.side === 'player' && fx.tray.dice.length === st.dice.length
              ? fx.tray.keys
              : st.dice.map((_, i) => `s${i}`),
        }
      : fx.tray
  const ring = useMemo(
    () =>
      preview?.r.combo
        ? new Set(
            comboDice(
              preview.r.perDie.map((p) => p.value),
              preview.r.combo.key,
            ),
          )
        : new Set<number>(),
    [preview],
  )

  const party = versus
    ? { count: versus.foeCount, index: versus.foeIndex }
    : (enc?.kind === 'trainer' || enc?.kind === 'gym') && run.trainer
      ? { count: enc.team.length, index: run.trainer.index }
      : null

  const heading = t('ui.battle.heading', {
    mine: active.name,
    foe: trainerName
      ? t('ui.battle.theirs', { trainer: trainerName, name: st.enemy.name })
      : st.kind === 'wild'
        ? t('ui.battle.aWild', { name: st.enemy.name })
        : st.enemy.name,
  })

  const over = !!versus && played && !!versus.end
  const message = catching
    ? catchMessage(run.catch!, st.enemy.name, { revealed })
    : forced && !auto
      ? t('ui.battle.chooseNext')
      : canAct && rolling && !auto && active.rerollsLeft > 0
        ? `${fx.message} ${t('ui.battle.tapToReroll')}`
        : fx.message

  const tapMatchups = typeHints ? (side: Side) => setMatchups((v) => (v === side ? null : side)) : undefined
  const pickPip = (b: Battler) => {
    if (forced && !auto) dispatch({ t: 'SWITCH', instanceId: b.uid })
    else if (canAct && showSwitch) setMenu('switch')
  }
  const extras =
    !auto && !terminal && (megaOpts.length > 0 || gmaxOpts.length > 0 || formOpts.length > 0 || st.canRun)

  let actions: ReactNode = null
  if (over) actions = versus!.end
  else if (auto && !terminal)
    actions = (
      <div className="grid grid-cols-[1.4fr_1fr] items-center gap-2.5" role="status">
        <p className="m-0 flex items-center gap-2 font-pixel-sm text-[16px] leading-[1.1] text-muted">
          <Chip tone="plain">{t('ui.battle.autoMode')}</Chip>
          {t('ui.battle.autoNote')}
        </p>
        {/* A Versus fight is decided already: it plays to its end. */}
        {!versus && (
          <PixelButton size="md" onClick={() => setSettings({ autoMode: false })}>
            {t('ui.battle.stop')}
          </PixelButton>
        )}
      </div>
    )
  else if (stunned)
    actions = (
      <PixelButton variant="primary" size="lg" className="w-full" onClick={() => dispatch({ t: 'PASS' })}>
        {t('ui.battle.skipTurn')}
      </PixelButton>
    )
  else if (forced)
    // After a K.O. the choice sits right under the battle, with what each one brings against this foe.
    actions = (
      <div className="flex flex-col gap-2">
        {st.player
          .filter((p) => p.hp > 0)
          .map((p) => (
            <SwitchRow key={p.uid} b={p} detailed onPick={() => dispatch({ t: 'SWITCH', instanceId: p.uid })} />
          ))}
        <ForfeitButton />
      </div>
    )
  else if (rolling && !terminal)
    actions = (
      <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
        <PixelButton
          size="lg"
          className="whitespace-nowrap px-2"
          disabled={!canAct || active.rerollsLeft <= 0 || !st.selected.some(Boolean)}
          title={t('ui.battle.selectDice')}
          onClick={() => dispatch({ t: 'REROLL' })}
        >
          {t('ui.battle.reroll', { left: active.rerollsLeft })}
        </PixelButton>
        <PixelButton
          variant="primary"
          size="lg"
          className="whitespace-nowrap px-2"
          disabled={!canAct}
          onClick={() => dispatch({ t: 'ATTACK' })}
        >
          {t('ui.battle.attack')}
        </PixelButton>
      </div>
    )

  // The Bag (or, in Versus, who you're up against) and the team pips: under the panel on phones, at the side when wide.
  const bag = versus ? (
    <span className="min-w-0 truncate text-[20px] text-muted">
      {t('ui.battle.vsName', { name: versus.trainerName })}
    </span>
  ) : (
    ownedItems.length > 0 &&
    !auto && (
      <BagButton
        disabled={!canItem || usefulItems.length === 0}
        title={st.itemUsedThisTurn ? t('ui.battle.oneItemPerTurn') : undefined}
        onClick={() => setMenu('item')}
      />
    )
  )
  const pips = (
    <TeamPips
      team={st.player}
      activeUid={active.uid}
      hpOf={(b) => fx.hp[b.uid] ?? b.hp}
      canSwitch={!auto && (forced || (canAct && showSwitch))}
      calling={forced && !auto}
      onPick={pickPip}
    />
  )
  const teamRow = (
    <div className="mt-auto flex items-center gap-2">
      {bag}
      <div className="ml-auto flex items-center gap-1.5">
        {pips}
        <button
          type="button"
          aria-label={t('ui.battle.history')}
          title={t('ui.battle.history')}
          onClick={() => setMenu('history')}
          className="grid min-h-[48px] min-w-[44px] place-items-center bg-paper shadow-ring"
        >
          <PixelIcon name="history" size={20} />
        </button>
      </div>
    </div>
  )

  const stage = (
    <div ref={stageBox} className="shadow-ledge">
      <BattleStage
        own={active}
        foe={st.enemy}
        fx={fx}
        art={art}
        ownShown={ownOut}
        foeShown={foeOut}
        trainer={trainerIntro && isTrainerFight ? (trainerSprite ?? '') : null}
        overlay={legend ?? thrown}
        worn={catching && !thrown}
        onContact={sceneContact}
        onSceneDone={sceneDone}
        onTap={tapMatchups}
        tapLabel={(b) => t('ui.types.tap', { name: b.name })}
        label={heading}
      >
        {foeOut && !bossIntro && (
          <FoePlate
            b={st.enemy}
            hp={fx.hp[st.enemy.uid] ?? st.enemy.hp}
            party={party}
            onClick={tapMatchups && (() => tapMatchups('enemy'))}
            open={matchups === 'enemy'}
          />
        )}
        {ownOut && !bossIntro && (
          <OwnPlate
            b={active}
            hp={fx.hp[active.uid] ?? active.hp}
            onClick={tapMatchups && (() => tapMatchups('player'))}
            open={matchups === 'player'}
          />
        )}
        {matchups && (
          <MatchupPopup
            b={matchups === 'enemy' ? st.enemy : active}
            side={matchups}
            onClose={() => setMatchups(null)}
          />
        )}
        <AnimatePresence>
          {fx.banner && (
            <motion.div
              key={fx.banner.id}
              className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.2, 1], opacity: [0, 1, 1, 0] }}
              transition={{ duration: (quick ? 0.6 : 1.2) * pace, times: [0, 0.2, 0.8, 1] }}
            >
              <span
                className={cx(
                  'px-3 pb-1 pt-0.5 text-[22px] leading-none shadow-ring',
                  BANNER_TONE[fx.banner.tone],
                )}
              >
                {fx.banner.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </BattleStage>
    </div>
  )

  return (
    <BattleContexts pace={pace} motionCap={motionCap}>
      {/* Wide screens: the stage as big as the height allows (3:2, with the message, dice and actions under it still in
          view: ≈340px), and a side column for the Bag, the team and the history. */}
      <div className="mx-auto w-full lg:grid lg:grid-cols-[minmax(0,calc((100dvh-340px)*1.5))_320px] lg:items-start lg:justify-center lg:gap-4 lg:p-4">
        <section
          aria-label={heading}
          className="mx-auto flex min-h-[100dvh] w-full max-w-[max(300px,min(560px,calc((100dvh_-_330px)_*_1.5)))] flex-col lg:min-h-0 lg:max-w-none"
        >
          <h1 className="sr-only">{heading}</h1>
          {stage}
          <div
            ref={panel}
            className="flex flex-1 flex-col gap-2 px-3 pt-3"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <p
              className="pixel-dialogue m-0 flex min-h-[64px] items-center px-3 py-1.5 text-[20px] leading-[1.15]"
              aria-live="polite"
            >
              {message}
            </p>
            {catching ? (
              <CatchPanel
                c={run.catch!}
                onThrow={onThrow}
                revealed={revealed}
              />
            ) : over ? (
              <div className="mt-auto">{actions}</div>
            ) : (
              <>
                <DiceTray
                  tray={tray}
                  live={ready && rolling}
                  selected={st.selected}
                  combo={ring}
                  onToggle={canAct && rolling && !auto ? (i) => dispatch({ t: 'TOGGLE_DIE', i }) : undefined}
                  size={dieSize}
                  foeName={st.enemy.name}
                />
                <div
                  className="flex min-h-[30px] flex-wrap items-center justify-center gap-x-2 gap-y-1"
                  aria-live="polite"
                >
                  {fx.chip && (
                    <Chip key={fx.chip.id} tone="gold" className="text-[16px]">
                      {fx.chip.text}
                    </Chip>
                  )}
                  {ready && preview && (
                    <Readout
                      preview={preview}
                      activeName={active.name}
                      open={showBreakdown}
                      onToggle={() => setShowBreakdown((v) => !v)}
                    />
                  )}
                </div>
                {ready && preview && showBreakdown && <DamageRecap result={preview.r} />}
                {ready && preview && !auto && statusTip && preview.almost.some((s) => s.have > 0) && (
                  <OakTip onClose={closeStatusTip}>
                    {(() => {
                      const s = preview.almost.find((x) => x.have > 0)!
                      return t('ui.battle.statusTip', {
                        status: statusName(s.status),
                        need: s.need,
                        have: s.have,
                        counts: t(s.have === 1 ? 'ui.battle.countsOne' : 'ui.battle.countsMany', {
                          value: s.value,
                        }),
                      })
                    })()}
                  </OakTip>
                )}
                {extras && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {megaOpts.length > 0 && (
                      <PixelButton
                        size="sm"
                        variant="gold"
                        disabled={!canAct}
                        title={t('ui.battle.megaOnce')}
                        // One Mega form: straight in. Several (Charizard X and Y…): the player picks.
                        onClick={() =>
                          megaOpts.length === 1 ? megaEvolve(megaOpts[0]!.dex) : setMenu('mega')
                        }
                      >
                        <PixelIcon name="up" size={14} /> {t(megaLabel)}
                      </PixelButton>
                    )}
                    {gmaxOpts.length > 0 && (
                      <PixelButton
                        size="sm"
                        variant="gold"
                        disabled={!canAct}
                        title={t(
                          `ui.battle.gmaxHint.${data.config.gigantamax.turns === 1 ? 'one' : 'other'}`,
                          {
                            n: data.config.gigantamax.turns,
                          },
                        )}
                        onClick={() => {
                          setMenu(null)
                          dispatch({ t: 'GMAX', toDex: gmaxOpts[0]!.dex })
                        }}
                      >
                        <PixelIcon name="up" size={14} /> {t('ui.battle.gmax')}
                      </PixelButton>
                    )}
                    {formOpts.length > 0 && (
                      <PixelButton size="sm" disabled={!canAct} onClick={() => setMenu('form')}>
                        <PixelIcon name="dice" size={14} /> {t('ui.battle.type', { left: formsLeft })}
                      </PixelButton>
                    )}
                    {st.canRun && (
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        disabled={!canAct}
                        onClick={() => dispatch({ t: 'RUN' })}
                      >
                        <PixelIcon name="run" size={14} /> {t('ui.battle.run')}
                      </PixelButton>
                    )}
                  </div>
                )}
                <div className="min-h-[56px]">{actions}</div>
                {/* Phones: the Bag, the team and the history at the foot of the panel; wide screens: at the side. */}
                {!wide && teamRow}
              </>
            )}
          </div>
        </section>
        {wide && (
          <aside className="flex flex-col gap-2">
            {!catching && !over && (
              <div className="flex flex-col gap-2 bg-paper p-2 shadow-ring-line">
                {bag}
                {pips}
              </div>
            )}
            <BattleHistory battle={battle} cursor={fx.cursor} defaultOpen />
            {canAct && !auto && (
              <p className="m-0 font-pixel-sm text-[15px] text-muted">
                {t('ui.battle.keys', { action: t(rolling ? 'ui.battle.keyAttack' : 'ui.battle.keyRoll') })}
              </p>
            )}
          </aside>
        )}
      </div>

      <Sheet open={menu === 'history'} onClose={() => setMenu(null)} title={t('ui.battle.history')}>
        <BattleHistoryList battle={battle} cursor={fx.cursor} />
      </Sheet>

      {/* Switching in: it costs the turn. Forfeit lives here too. */}
      <Modal open={menu === 'switch'} onClose={() => setMenu(null)} title={t('ui.battle.switchCosts')}>
        <div className="flex flex-col gap-2">
          {switchTargets.length === 0 && <p className="copy text-lg text-muted">{t('ui.battle.noSwitch')}</p>}
          {switchTargets.map((p) => (
            <SwitchRow
              key={p.uid}
              b={p}
              onPick={() => {
                setMenu(null)
                dispatch({ t: 'SWITCH', instanceId: p.uid })
              }}
            />
          ))}
          <ForfeitButton className="mt-1" onForfeit={() => setMenu(null)} />
        </div>
      </Modal>

      {/* Mega Evolution: the choice, when the Pokémon has more than one Mega form. */}
      <Modal
        open={menu === 'mega' && megaOpts.length > 0}
        onClose={() => setMenu(null)}
        title={t('ui.battle.megaTitle')}
      >
        <div className="flex flex-col gap-2">
          <p className="copy text-lg">{t('ui.battle.megaPick', { name: active.name })}</p>
          {megaOpts.map((m) => {
            const die = megaBase ? megaDie(megaBase, m) : m.type1
            return (
              <button
                key={m.dex}
                type="button"
                onClick={() => megaEvolve(m.dex)}
                className="pixel-panel flex w-full items-center gap-3 p-2 text-left enabled:hover:bg-paper"
              >
                <SpriteImg dex={m.dex} size={80} shiny={active.shiny} className="bg-parchment shadow-ring" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-2xl leading-none">{m.name}</span>
                  <span className="flex gap-1">
                    <TypeBadge type={m.type1} size="sm" />
                    {m.type2 && <TypeBadge type={m.type2} size="sm" />}
                  </span>
                  <span className="flex items-center gap-1.5 text-lg leading-none">
                    <DiceSet dice={[die]} size={22} /> {t('ui.sheet.msAddDie', { to: typeName(die) })}
                  </span>
                </span>
              </button>
            )
          })}
          <p className="copy text-base text-muted">{t('ui.battle.megaOnce')}</p>
        </div>
      </Modal>

      {/* Arceus: its type, picked from a menu, a few times per battle. */}
      <Modal
        open={menu === 'form' && formOpts.length > 0}
        onClose={() => setMenu(null)}
        title={t('ui.battle.typeTitle', { name: active.name })}
      >
        <div className="flex flex-col gap-2">
          <p className="copy text-base">{t('ui.battle.typeHint', { left: formsLeft })}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {formOpts.map((f) => (
              <button
                key={f.dex}
                type="button"
                onClick={() => {
                  setMenu(null)
                  dispatch({ t: 'CHANGE_FORM', toDex: f.dex })
                }}
                className="pixel-panel flex flex-col items-center gap-1 p-1 enabled:hover:bg-paper"
              >
                <SpriteImg dex={f.dex} size={56} shiny={active.shiny} />
                <TypeBadge type={f.type1} size="sm" />
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* The Bag: one item a turn, and the turn goes on. */}
      <Sheet
        open={menu === 'item'}
        onClose={() => {
          setMenu(null)
          setItemKey(null)
        }}
        title={
          itemKey
            ? t('ui.battle.useItemOn', { item: data.items[itemKey]?.name ?? itemKey })
            : t('ui.battle.itemsTitle')
        }
      >
        {!itemKey ? (
          <div className="flex flex-col gap-2">
            {ownedItems.map(([k, n]) => {
              const it = data.items[k]!
              const useful = st.player.some((p) => itemHelps(k, p))
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!useful}
                  onClick={() => {
                    // Ethers go to the Pokémon in battle; everything else asks who.
                    if (it.effect.kind === 'rerolls') {
                      dispatch({ t: 'USE_ITEM', key: k, targetUid: activeBattler(st).uid })
                      setMenu(null)
                    } else setItemKey(k)
                  }}
                  className="flex min-h-[56px] w-full items-center gap-2 bg-paper px-2 py-1 text-left shadow-card disabled:opacity-50"
                >
                  <ItemSprite item={it} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[20px] leading-none">{it.name}</span>
                    <span className="font-pixel-sm text-[15px] leading-tight text-muted">
                      {effectText(it)}
                    </span>
                  </span>
                  <span className="font-pixel-sm text-[16px] tabular-nums">×{n}</span>
                </button>
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
                  dispatch({ t: 'USE_ITEM', key: itemKey, targetUid: p.uid })
                  setMenu(null)
                  setItemKey(null)
                }}
              />
            ))}
          </div>
        )}
      </Sheet>

      {!versus && ready && run.phase === 'victory' && <VictoryView />}
      {!versus && ready && run.phase === 'wipe' && <WipeView />}
      {!versus && ready && run.phase === 'stalemate' && <StalemateView />}
    </BattleContexts>
  )
}

/** The battle's pace and motion cap, for everything on screen (the result cards included). */
function BattleContexts({ pace, motionCap, children }: { pace: number; motionCap: MotionLevel | null; children: ReactNode }) {
  return (
    <PaceContext.Provider value={pace}>
      <MotionCap.Provider value={motionCap}>{children}</MotionCap.Provider>
    </PaceContext.Provider>
  )
}

function SwitchRow({
  b,
  onPick,
  disabled,
  detailed,
}: {
  b: Battler
  onPick: () => void
  disabled?: boolean
  /** Its types, dice and rerolls too: the pick after a K.O. */
  detailed?: boolean
}) {
  const { t } = useT()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className="pixel-panel flex w-full items-center gap-2 p-2 text-left enabled:hover:bg-paper disabled:opacity-50"
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
        {detailed && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex gap-1">
              {b.types.map((x) => (
                <TypeBadge key={x} type={x} size="sm" />
              ))}
            </span>
            <DiceSet dice={b.dice} size={20} />
            <span className="ml-auto font-pixel-sm text-[15px] leading-none tabular-nums text-muted">
              {b.hp}/{b.maxHp}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
