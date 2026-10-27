// The battle, full screen: the 240×160 stage on top (BattleStage) and the panel under it — the message, the dice tray
// and its readout, the actions, the Bag and the team. It drives the engine through the store and plays the engine's
// log (useBattleAnimator); the UI never recomputes a rule.
import { AutoButton } from '@/components/AutoButton'
import { BottomDock } from '@/components/BottomDock'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import {
  activeBattler,
  autoAvailable,
  autoLevel,
  autoEvents,
  instanceMaxHp,
  catchTarget,
  comboDice,
  computeDamage,
  confusionLevel,
  confusionRecoil,
  createRng,
  formChoices,
  canZMove,
  lockedTypeForms,
  foesOnField,
  gmaxChoices,
  hasStatus,
  megaChoices,
  megaDie,
  zEffectOf,
  randomSeed,
  statusesFromRoll,
  sureThrow,
  usableIn,
  type BattleEvent,
  type Battler,
  type GameData,
  type PokemonInstance,
  teamOf,
  type Side,
  inPortalRun,
  inNightmare,
  gameFeelOn,
} from '@/engine'
import { playCry } from '@/audio/cries'
import { feelSound } from '@/audio/feel'
import { sfx } from '@/audio/sfx'
import { useBattleMusic } from '@/audio/useBattleMusic'
import { Chip } from '@/components/Chip'
import { DiceSet } from '@/components/DiceSet'
import { ForfeitButton } from '@/components/ForfeitButton'
import { PixelIcon } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { Sheet } from '@/components/Sheet'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { TypeMatchups } from '@/components/TypeMatchups'
import { BattleDayTime } from '@/components/DayNight'
import { pictureOf } from '@/fx/areaArt'
import { ballOfItem } from '@/fx/scenes'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { catchTimeline } from '@/fx/timelines/catch'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { useT } from '@/i18n/react'
import { effectText, zMoveText } from '@/i18n/text'
import { trainerTitle, typeName } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { haptic } from '@/lib/haptics'
import { capMotion, MotionCap, useMotion, type MotionLevel } from '@/lib/motion'
import { AUTO_PACE, PaceContext, VERSUS_PACE } from '@/lib/pace'
import { useDialogOpen } from '@/lib/useDialog'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { pushToast, setSettings, useGame, type BattleSlice, type CatchThrow } from '@/store/game'
import { autoStepNow } from '@/store/autopilot'
import { answerBait, dispatchBattle, canSkipCurrent, fleeAtSendOut, notYet, passCatch, retryCatch, sendOutLead, throwBall } from '@/store/run'
import { LeadPicker } from '@/components/LeadPicker'
import { PokeCard } from '@/components/PokeCard'
import { RunRoundGauge } from '@/screens/area/RoundGauge'
import { speciesTypes } from '@/components/TypeMatchups'
import { useAreaDayTime } from '@/store/dayTime'
import { useDetails, useTypeHints } from '@/store/hooks'
import { cx } from '@/theme/util'
import { BattleHistoryList, DamageRecap } from './BattleHistory'
import { EncounterSwipe } from './EncounterSwipe'
import {
  BagButton,
  DiceTray,
  KeyHints,
  Readout,
  TeamPips,
  trayKeyOf,
  turnInHand,
  useDamageReveal,
  ZMoveButton,
  type Preview,
  type TrayDice,
} from './BattlePanel'
import { BattleStage, type StageOverlay } from './BattleStage'
import { CatchPanel, catchMessage } from './CatchPanel'
import { DoublePlates, TargetPicker } from './DoublePlates'
import { FoePlate, OwnPlate } from './Plates'
import { useBattleAnimator } from './useBattleAnimator'
import { InlineCard, StalemateView, VictoryView, WipeView } from './VictoryView'

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

// Professor Oak explains a Freeze's or a Paralysis's chance the first time one is short of sure (per device).

/** The trainer on the field before their Pokémon. */
const TRAINER_INTRO_MS = 1100
/** From the foe's arrival to yours popping out of its ball. */
const SEND_OUT_MS = 900

// Auto-mode's picks sample rolls (like the enemy AI); its own stream keeps the battle's rolls untouched.
const autoRng = createRng(randomSeed())
/** A wild fight's GO! (docs/42): long enough to look at the cards and tap another. */
const SEND_OUT_AUTO_MS = 2600
/** How long auto-mode shows its dice selection before the reroll. */
const AUTO_SELECT_MS = 450
/** How long the autopilot leaves a throw's result on screen before moving on (docs/36). */
const AUTO_RESULT_MS = 1400
/** How long Idle shows the ball it picked on the catch panel before throwing it (or passing): long enough to read. */
const AUTO_THROW_MS = 900
/**
 * The room a phone keeps under the stage for the panel at its busiest everyday step (the line, the dice, the readout,
 * the actions, the team row): the stage takes the rest, so it never jumps from step to step. A longer step (the result)
 * scrolls instead.
 */
const BATTLE_PANEL = '330px'

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
  // Full screen, the top bar kept: what's in it stays in reach mid-fight (docs/15 §12).
  useHoldFullscreen(true, true)
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
  // A double battle (docs/33): four on the stage, the pair in front being whose turn it is and its target.
  const dbl = st.double
  // A portal run's wild Pokémon wear the distortion (docs/28).
  const distorted = !versus && st.kind === 'wild' && !!save && inPortalRun(save, data, run.areaId)
  // The nightmare's rounds (docs/30) are fought under its full moon, a dark shadow haunting the foe.
  const dream = !versus && st.kind === 'wild' && !!save && inNightmare(save, data, run.areaId)
  const stageBox = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<null | 'item' | 'history' | 'mega' | 'form'>(null)
  // Switching in on your turn (docs/43 §5.3): the panel shows the send-out's cards instead of the dice (no dialog over
  // the fight), the one tapped picked first; BACK returns to the dice. Holds the fight like a menu.
  const [switching, setSwitching] = useState<string | null>(null)
  // The fight waits while a pop-up is over it: one of its own menus, or one from the top bar (the trainer menu,
  // Settings, the guide). No throw, no auto move and no key press plays behind it; closing it picks up from there.
  const covered = useDialogOpen()
  const held = !!menu || !!switching || covered
  const [itemKey, setItemKey] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  // Type hints (Trainer menu → Type chart): tapping a Pokémon opens its matchups over the stage.
  // On until the first badge for a new player (docs/38 U1b), then the player's choice.
  const typeHints = useTypeHints()
  // More details (docs/42): the history, its key hints and the waiting prompt are for the invested player.
  const details = useDetails()
  const [matchups, setMatchups] = useState<Side | null>(null)

  // Auto-mode (cleared areas; with the play styles, where the style allows: docs/36): the player's side plays itself,
  // like the enemy's. A Versus fight is always on auto.
  const settings = useGame((s) => s.settings)
  const autoOpen = !versus && !!save && autoAvailable(save, data, settings, run.areaId)
  const autoAt = !versus && save ? autoLevel(save, data, settings, run) : 'off'
  const auto = !!versus || autoAt !== 'off'
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
  // Day and night (docs/32): in Johto, the stage's corner says which half of the day the fight is in.
  const dayTime = useAreaDayTime(versus ? null : run.areaId)
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

  // The entrances: a legendary's timeline, or the trainer stepping onto the field; then the foe; then yours. A fight
  // picked up from the last visit (store/resume.ts) has had them: everyone is out already.
  const resumed = !!battle.resumed
  // Another lead picked at the send-out step: the same fight again, its foe out already (no entrance twice).
  const swapped = !!battle.sendLater
  const [bossIntro, setBossIntro] = useState(st.kind === 'boss' && level !== 'off' && !resumed && !swapped)
  const [trainerIntro, setTrainerIntro] = useState(isTrainerFight && !quick && !resumed && !swapped)
  const [foeOut, setFoeOut] = useState(!bossIntro && !trainerIntro)
  const [ownOut, setOwnOut] = useState(quick || resumed)
  const intro = bossIntro || trainerIntro || !ownOut

  // A wild or legendary foe the player can still catch isn't knocked out of the scene: the catch throw comes next. A
  // wild pair's first K.O. waits worn out on its spot until the other is down too, then each gets its throw (docs/33).
  const canCatch = (b: Battler) =>
    !versus &&
    (st.kind === 'wild' || st.kind === 'boss') &&
    !!save &&
    !!catchTarget(save, b.baseDex ?? b.dex, b.level, st.kind, data, b.shiny)
  const catchable = dbl ? (uid: string) => dbl.foes.some((f) => f.uid === uid && canCatch(f)) : canCatch(st.enemy)
  const { fx, ready, sceneContact, sceneDone, feel: feelOn } = useBattleAnimator(
    battle,
    quick,
    {
      kind: st.kind,
      trainerName,
      catchable,
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
  // The send-out step (the rework): the foe is out, yours waits for the player's pick; the fight starts once it's out.
  const picking = !versus && !!run.pickLead
  useEffect(() => {
    if (ownOut || !foeOut || bossIntro || picking) return
    const t = setTimeout(() => setOwnOut(true), quick ? 0 : SEND_OUT_MS * pace)
    return () => clearTimeout(t)
  }, [ownOut, foeOut, bossIntro, picking, quick, pace])

  // The enemy acts on its own once the log has caught up (sooner with the game-feel pass, docs/38 F1d).
  useEffect(() => {
    if (!ready || intro || st.phase !== 'enemy_turn') return
    const t = setTimeout(() => dispatch({ t: 'AI_TURN' }), quick ? 0 : (feelOn ? 250 : 450) * pace)
    return () => clearTimeout(t)
  }, [ready, intro, st.phase, quick, pace, battle.log.length, dispatch, feelOn])

  const active = st.player.find((p) => p.uid === fx.activeUid) ?? activeBattler(st)
  // The catch, once the log has played the last K.O. (before that, the fight's own pair stays in front).
  const catching = !versus && ready && run.phase === 'catch' && !!run.catch
  // The foe in front, as the log has played; a double battle's catch shows the one waiting for the ball.
  const catchFoe = dbl && catching && run.catch?.uid ? dbl.foes.find((f) => f.uid === run.catch!.uid) : undefined
  const foeFront = catchFoe ?? (dbl ? (dbl.foes.find((f) => f.uid === fx.foeUid) ?? st.enemy) : st.enemy)
  const byUid = (uids: readonly string[] | undefined, pool: readonly Battler[]) =>
    (uids ?? []).flatMap((u) => pool.filter((b) => b.uid === u))
  const ownRow = dbl ? byUid(fx.field?.own, st.player) : [active]
  const foeRow = dbl ? byUid(fx.field?.foes, dbl.foes) : [st.enemy]
  // Behind the pair in front: their partners still standing (or falling, or worn out waiting for the ball). During the
  // first throw, the other one waits behind for its own; once its turn comes, the first is gone (caught or fled).
  const ownBack = dbl ? (ownRow.find((b) => b.uid !== active.uid) ?? null) : null
  const waiting = (b: Battler) => !catchFoe || !!run.catchQueue?.some((c) => c.uid === b.uid)
  const foeBack = dbl ? (foeRow.find((b) => b.uid !== foeFront.uid && waiting(b)) ?? null) : null
  // Cries: the foe's as it comes out, yours as each of yours does (after the foe's when both come out at once), a
  // Mega's once it stands there.
  useEffect(() => {
    if (!foeOut) return
    playCry(st.enemy.dex)
    // A pair: the second one's cry after the first's.
    const partner = dbl?.foes[1]
    if (dbl && partner) playCry(partner.dex, { wait: true })
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
    const recoil = confusionRecoil(a.maxHp, confusionLevel(a.status), data)
    const r = computeDamage(st.dice, a.types, st.enemy.types, st.playerLevels, data)
    const statuses = statusesFromRoll(st.dice, data, st.playerLevels)
    return { r, statuses, recoil }
  }, [rolling, st, data])

  const inventory = save?.inventory ?? {}
  const ownedItems = Object.entries(inventory).filter(([k, n]) => n > 0 && usableIn(data.items[k], 'battle'))
  const itemHelps = (key: string, p: Battler) => {
    const e = data.items[key]?.effect
    if (!e) return false
    // Extreme mode with the admin's items switch off: no Potion or Revive works (docs/22).
    if (st.noHealItems && (e.kind === 'heal' || e.kind === 'revive')) return false
    if (e.kind === 'revive') return p.hp <= 0
    if (p.hp <= 0) return false
    if (e.kind === 'heal') return p.hp < p.maxHp
    if (e.kind === 'cure') return e.statuses.some((k) => hasStatus(p.status, k))
    if (e.kind === 'rerolls') return p.rerollsLeft < p.rerolls
    return false
  }
  // The send-out's cards for the fight's Pokémon (the Bag's "on whom"): each instance at the fight's HP.
  const fightCards = (list: readonly Battler[]) =>
    list.flatMap((b) => {
      const inst = save?.box.find((p) => p.id === b.uid)
      return inst ? [{ b, inst: atFightHp(inst, b, data) }] : []
    })
  // Out on the field already: not one to switch in (a double battle has two out).
  const onField = (p: Battler) => (dbl ? dbl.ownSlots.some((i) => st.player[i]!.uid === p.uid) : p.uid === activeBattler(st).uid)
  const switchTargets = st.player.filter((p) => p.hp > 0 && !onField(p))

  // The game feel (docs/38): the dice and the readout's sounds and touches. Off, everything plays as before.
  const feel = useGame((s) => gameFeelOn(s.data))
  // Your hand: picking a die clicks (and buzzes), and the last reroll sounds its own warning (F7b, F9a).
  const toggleDie = (i: number) => {
    if (feel) feelSound(st.selected[i] ? 'die.unpick' : 'die.pick')
    haptic('diePick')
    dispatch({ t: 'TOGGLE_DIE', i })
  }
  const reroll = () => {
    if (feel && active.rerollsLeft === 1) feelSound('reroll.last')
    dispatch({ t: 'REROLL' })
  }

  // Every turn starts with the throw, so the dice roll themselves (items, switching and running still work after it).
  // With the game feel on (F8c, F1d) it comes sooner, after the dice in hand jitter for two frames.
  const [anticipate, setAnticipate] = useState(0)
  const handReady = !auto && ready && !intro && st.phase === 'player_roll'
  useEffect(() => {
    if (!handReady || held) return
    const wait = quick ? 0 : feel ? 250 : 400
    const jitter =
      feel && !quick
        ? setTimeout(() => {
            setAnticipate((n) => n + 1)
            feelSound('die.jitter')
          }, wait - 100)
        : undefined
    const t = setTimeout(() => dispatch({ t: 'ROLL' }), wait)
    return () => {
      clearTimeout(jitter)
      clearTimeout(t)
    }
  }, [handReady, held, quick, feel, battle.log.length, dispatch])

  // Auto-mode: every player move once the log has caught up. A reroll shows its selected dice for a moment first.
  const autoPhase =
    st.phase === 'player_roll' ||
    st.phase === 'player_reroll' ||
    st.phase === 'player_stunned' ||
    st.phase === 'player_switch'
  useEffect(() => {
    if (!auto || !ready || intro || held || !autoPhase) return
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
  }, [auto, ready, intro, held, autoPhase, st.phase, data, quick, pace, battle.log.length, dispatch])

  const usefulItems = ownedItems.filter(([k]) => st.player.some((p) => itemHelps(k, p)))
  const showSwitch = data.config.allowVoluntarySwitch
  // What the B and S keys (and the pips) can open right now: the same rules as their buttons.
  const bagOpen = !versus && !auto && canItem && usefulItems.length > 0
  const switchOpen = !auto && canAct && showSwitch && switchTargets.length > 0
  const openSwitch = (uid?: string) => setSwitching(uid ?? switchTargets[0]?.uid ?? null)

  // Keyboard (docs/43 §5.3): 1–6 pick dice, R rerolls, Space (or Enter) throws or attacks, B opens the Bag, S the
  // switch, Esc goes back; on every other step Enter presses the step's one red button (GO!, CONTINUE, NEXT…).
  const keyAct = useRef({ toggleDie, reroll, openSwitch })
  keyAct.current = { toggleDie, reroll, openSwitch }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || el?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') {
        if (matchups) setMatchups(null)
        else if (switching && !covered) setSwitching(null)
        return
      }
      if (auto || covered || menu) return
      // A focused button or link answers Enter/Space itself (the top bar's too, which stays up in battle).
      const onControl = !!el?.closest?.('button, a[href]')
      const key = e.key.toLowerCase()
      if ((canAct || stunned) && !switching) {
        if (e.key === ' ' || e.key === 'Enter') {
          if (onControl) return
          e.preventDefault()
          dispatch(stunned ? { t: 'PASS' } : st.phase === 'player_roll' ? { t: 'ROLL' } : { t: 'ATTACK' })
        } else if (key === 'r' && rolling) keyAct.current.reroll()
        else if (/^[1-6]$/.test(e.key) && rolling) keyAct.current.toggleDie(Number(e.key) - 1)
        else if (key === 'b' && bagOpen) setMenu('item')
        else if (key === 's' && switchOpen) keyAct.current.openSwitch()
        return
      }
      if (e.key === 'Enter' && !onControl) {
        const go = panel.current?.querySelector<HTMLButtonElement>(
          'button.frame-primary:not([disabled]):not([aria-disabled="true"])',
        )
        if (go) {
          e.preventDefault()
          go.click()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAct, stunned, auto, covered, menu, switching, matchups, rolling, bagOpen, switchOpen, st.phase, dispatch])
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
  // Arceus's types still waiting for their plate (docs/34): listed, locked, in the same menu.
  const lockedOpts = versus ? [] : lockedTypeForms(st, data)
  const formsLeft = data.config.formChangesPerBattle - (activeBattler(st).formChanges ?? 0)
  const typeMenu =
    formOpts.length > 0 ||
    (lockedOpts.length > 0 && formsLeft > 0 && (st.phase === 'player_roll' || st.phase === 'player_reroll'))
  const megaBase = data.species[activeBattler(st).baseDex ?? activeBattler(st).dex]
  const megaEvolve = (toDex: number) => {
    setMenu(null)
    dispatch({ t: 'MEGA', toDex })
  }
  // A Z-Move (docs/35): after the roll, the attack as the dice stand, with its type's effect.
  const zOpen = !versus && canZMove(st, data)
  const zType = preview?.r.attackType ?? null
  // Stunned, only a Steel-type has it: it shakes the stun off (no roll yet to name a type).
  const zHint = !zOpen
    ? ''
    : st.phase === 'player_stunned'
      ? zMoveText('cleanse', typeName('steel'), data)
      : zMoveText(zEffectOf(zType), zType ? typeName(zType) : null, data)
  // The newer rules (docs/35) say how long a Mega lasts and what a Gigantamax brings.
  const megaHint = st.megaTurns ? t('ui.battle.megaTimed', { n: st.megaTurns }) : t('ui.battle.megaOnce')
  const gmaxHint = st.gmaxBoost
    ? t(`ui.battle.gmaxBoostHint.${data.config.gigantamax.turns === 1 ? 'one' : 'other'}`, {
        dice: st.gmaxBoost.dice,
        heal: st.gmaxBoost.healPercent,
        n: data.config.gigantamax.turns,
      })
    : t(`ui.battle.gmaxHint.${data.config.gigantamax.turns === 1 ? 'one' : 'other'}`, { n: data.config.gigantamax.turns })

  // Stunned with no item that could help: nothing to do but lose the turn.
  const stunChoice = (canItem && usefulItems.length > 0) || zOpen
  useEffect(() => {
    if (auto || !stunned || held || stunChoice) return
    const t = setTimeout(() => dispatch({ t: 'PASS' }), 900)
    return () => clearTimeout(t)
  }, [auto, stunned, held, stunChoice, dispatch])

  const terminal = st.phase === 'won' || st.phase === 'lost' || st.phase === 'fled'
  // Versus: once this battle has played out, the fight moves on (the next defender, or the result).
  const played = ready && terminal
  useEffect(() => {
    if (played) return versusRef.current?.onPlayed()
  }, [played])

  // ---- The catch, in the scene: the worn-out foe waits on its platform; one throw plays the catch timeline.
  const [thrown, setThrown] = useState<StageOverlay | null>(null)
  // Back on a throw already made (the Bait's question, a stay): its result shows at once, with its buttons.
  const [revealed, setRevealed] = useState(() => !!useGame.getState().run.catch?.result)
  /**
   * The throw on the stage. A throw a Bait could still save stops with the ball on the ground (`hold`) while the panel
   * asks; the answer plays on from that frame (docs/25). Capture Luck's stay ends with the Pokémon back on its platform.
   */
  const catchScene = (r: CatchThrow, from?: 'ground'): StageOverlay => {
    const foe = foeFront
    // A throw that couldn't miss has no suspense to build: its result at once.
    const instant = sureThrow(r)
    return {
      instant,
      timeline: catchTimeline({
        own: spriteKey(active.dex, true, active.shiny),
        foe: spriteKey(foe.dex, false, foe.shiny),
        ball: ballOfItem(r.ballKey),
        caught: r.caught,
        roll: r,
        short: level === 'short',
        hold: !!r.baitOffer,
        from,
        bait: r.baited === 'used',
        stays: !!r.stays,
        instant,
      }),
      ready: Promise.all([loadSprite(active.dex, true, active.shiny), loadSprite(foe.dex, false, foe.shiny)]),
      label:
        r.baited === 'used'
          ? t('ui.catch.baitThrown', { name: foe.name })
          : t('ui.catch.throwing', { ball: data.items[r.ballKey ?? 'poke-ball']?.name ?? t('ui.catch.aBall') }),
      hud: { catchResult: () => setRevealed(true) },
      onEnd: () => setRevealed(true),
    }
  }
  const onThrow = (ballKey: string | null) => {
    throwBall(ballKey)
    const r = useGame.getState().run.catch?.result
    if (!r) return
    setRevealed(false)
    setThrown(catchScene(r))
  }
  const onBait = (use: boolean) => {
    answerBait(use)
    const r = useGame.getState().run.catch?.result
    if (!r || r.baitOffer) return
    setRevealed(false)
    setThrown(catchScene(r, 'ground'))
  }
  // After a wild pair, the other one's throw (docs/33): a fresh start, the first throw's scene gone.
  const catchUid = run.catch?.uid ?? null
  const lastCatch = useRef(catchUid)
  useEffect(() => {
    if (lastCatch.current === catchUid) return
    lastCatch.current = catchUid
    setThrown(null)
    setRevealed(false)
  }, [catchUid])
  // Back to the ball picker: the Pokémon stands worn out on its platform again.
  const onRetry = () => {
    retryCatch()
    setThrown(null)
    setRevealed(false)
  }
  // Idle (docs/36): the catch plays itself by the engine's rule (chooseIdleBall). The ball it picked shows on the panel a
  // moment, then flies on the stage as the player's would; a Pokémon left behind passes; a Bait offered is kept, and
  // Capture Luck's second chance is thrown again by the same rule. Auto on explored areas leaves all this to the player.
  const idleCatch = useGame((s) => {
    if (!catching || autoAt !== 'full' || !s.save) return null
    const step = autoStepNow()
    if (step?.do === 'throw') return `throw:${step.ball ?? ''}`
    if (step?.do === 'pass') return `pass:${step.why}`
    return step?.do === 'keepBait' || step?.do === 'retry' ? step.do : null
  })
  const idlePick = idleCatch?.startsWith('throw:') ? idleCatch.slice(6) || null : undefined
  const idleAct = useRef<() => void>(() => {})
  idleAct.current = () => {
    if (idleCatch === 'keepBait') onBait(false)
    else if (idleCatch === 'retry') onRetry()
    else if (idleCatch?.startsWith('pass:')) {
      const name = foeFront.name
      passCatch()
      if (idleCatch === 'pass:noBall') pushToast(t('ui.idle.noBall', { name }), 'info', 3500)
    } else if (idleCatch) onThrow(idlePick ?? null)
  }
  useEffect(() => {
    if (!idleCatch || covered) return
    // The Bait's question and THROW AGAIN answer a throw: once its result has been seen.
    const afterThrow = idleCatch === 'keepBait' || idleCatch === 'retry'
    if (afterThrow && !revealed) return
    const timer = setTimeout(() => idleAct.current(), afterThrow ? AUTO_RESULT_MS : AUTO_THROW_MS)
    return () => clearTimeout(timer)
    // A wild pair's second Pokémon may get the same step as the first (two passes): its own uid starts it again.
  }, [idleCatch, covered, revealed, catchUid])

  // The throw's result moves on by itself for everyone now: CONTINUE loads and presses itself (AutoButton, the
  // rework), so the autopilot needs no timer of its own here.

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
  // A tall phone (P1a, P1b) has room to spare under the stage: bigger dice, and the actions down in the thumb's reach.
  const tall = useMediaQuery('(max-width: 767px) and (min-height: 740px)')
  // Your dice fill the tray: up to 54px (72 on a tall phone and in a wide screen's tall docked panel), never under a 44px
  // tap target.
  const dieSize = panelWidth
    ? Math.max(
        44,
        Math.min(tall || wide ? 72 : 54, Math.floor((panelWidth - 24 - (diceCount - 1) * 8) / diceCount)),
      )
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
  // The readout waits for the last die of the throw to be down, and keeps the roll before's numbers through a reroll
  // (F2d); with the game feel on, each landing plays the damage count-up (F2a).
  const throwKey = trayKeyOf(tray)
  const [landedKey, setLandedKey] = useState('')
  const settled = ready && rolling && tray?.side === 'player' && (!throwKey || landedKey === throwKey)
  const reveal = useDamageReveal(preview, settled, throwKey, feel)
  const shownR = reveal.preview?.r
  // The combo's ring, once its dice are down (with the game feel, once its beat has landed).
  const comboIn = settled && !!shownR?.combo && reveal.combo
  const ring = useMemo(
    () =>
      comboIn && shownR?.combo
        ? new Set(
            comboDice(
              shownR.perDie.map((p) => p.value),
              shownR.combo.key,
            ),
          )
        : new Set<number>(),
    [comboIn, shownR],
  )
  // Before your turn's throw, your dice wait in hand (F8c). The foe's turn shows its dice in the panel from its first
  // line, face down until they're thrown, then landing (P1c), a size up where the panel has room.
  const foeTurn = fx.tray ? null : turnInHand(battle.log, fx.cursor)
  const foeHand = foeTurn?.side === 'enemy' ? (dbl?.foes ?? [st.enemy]).find((f) => f.uid === foeTurn.uid)?.dice : undefined
  const hand =
    !feel || quick
      ? undefined
      : handReady
        ? { side: 'player' as const, dice: active.dice }
        : foeHand && { side: 'enemy' as const, dice: foeHand }
  const foeSize = feel ? Math.max(40, Math.round((dieSize * 0.75) / 2) * 2) : undefined
  const lastReroll = feel && rolling && active.rerollsLeft === 1

  const party = versus
    ? { count: versus.foeCount, index: versus.foeIndex }
    : (enc?.kind === 'trainer' || enc?.kind === 'gym') && run.trainer
      ? dbl
        ? { count: dbl.foes.length, index: dbl.foes.filter((f) => fx.fainted[f.uid]).length }
        : { count: enc.team.length, index: run.trainer.index }
      : null

  const pairNames = (row: readonly Battler[]) => row.map((b) => b.name).join(' & ')
  const heading = dbl
    ? t('ui.battle.heading', {
        mine: pairNames(ownRow),
        foe: trainerName ? t('ui.battle.theirs', { trainer: trainerName, name: pairNames(foeRow) }) : pairNames(foeRow),
      })
    : t('ui.battle.heading', {
        mine: active.name,
        foe: trainerName
          ? t('ui.battle.theirs', { trainer: trainerName, name: st.enemy.name })
          : st.kind === 'wild'
            ? t('ui.battle.aWild', { name: st.enemy.name })
            : st.enemy.name,
      })

  const over = !!versus && played && !!versus.end
  const result = !versus && ready && (run.phase === 'victory' || run.phase === 'wipe' || run.phase === 'stalemate')
  useBattleMusic(!over && !(ready && !versus && ['victory', 'wipe', 'stalemate'].includes(run.phase)))
  // The player's own prompt, waiting on the dice (useBattleAnimator's 'turn' line).
  const prompting = !catching && !switching && !(forced && !auto) && fx.message === t('ui.log.whatWillDo', { name: active.name })
  const message = catching
    ? catchMessage(run.catch!, foeFront.name, { revealed })
    : forced && !auto
      ? t('ui.battle.chooseNext')
      : switching
        ? t('ui.battle.switchCosts')
        : fx.message

  const tapMatchups = typeHints ? (side: Side) => setMatchups((v) => (v === side ? null : side)) : undefined
  const pickPip = (b: Battler) => {
    if (forced && !auto) dispatch({ t: 'SWITCH', instanceId: b.uid })
    else if (switchOpen) openSwitch(b.uid)
  }
  // The turn moved on (a switch sent, the foe's turn, a K.O.): the switch's cards give the dice back.
  useEffect(() => {
    if (!canAct) setSwitching(null)
  }, [canAct])
  // A cleared area's fight can be handed to auto-mode midway, as the area's switch would have from its start.
  const autoStart = autoOpen && !auto && !catching
  const extras =
    !auto &&
    !terminal &&
    (megaOpts.length > 0 || gmaxOpts.length > 0 || zOpen || typeMenu || st.canRun || autoStart)

  let actions: ReactNode = null
  if (over) actions = versus!.end
  else if (auto && !terminal)
    actions = (
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-2.5" role="status">
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
  else if (rolling && !terminal)
    actions = (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
        <PixelButton
          size="lg"
          // The last one says so, in gold (F9a, game feel).
          variant={lastReroll ? 'gold' : undefined}
          className="whitespace-nowrap px-2"
          disabled={!canAct || active.rerollsLeft <= 0 || !st.selected.some(Boolean)}
          title={t('ui.battle.selectDice')}
          aria-keyshortcuts="R"
          onClick={reroll}
        >
          {lastReroll ? t('ui.battle.lastReroll') : t('ui.battle.reroll', { left: active.rerollsLeft })}
        </PixelButton>
        <PixelButton
          variant="primary"
          size="lg"
          className="whitespace-nowrap px-2"
          disabled={!canAct}
          aria-keyshortcuts="Space Enter"
          onClick={() => dispatch({ t: 'ATTACK' })}
        >
          {t('ui.battle.attack')}
        </PixelButton>
      </div>
    )

  // The Bag (or, in Versus, who you're up against) and the team pips: under the panel on phones, at the side when wide.
  const bag = versus ? (
    // Only the room the team leaves (flex-1 from zero): sized to its text, a long name shrank the team too and the
    // pips wrapped onto two rows.
    <span className="min-w-0 flex-1 truncate text-[20px] text-muted">
      {t('ui.battle.vsName', { name: versus.trainerName })}
    </span>
  ) : (
    ownedItems.length > 0 &&
    !auto && (
      <BagButton
        disabled={!bagOpen}
        title={st.itemUsedThisTurn ? t('ui.battle.oneItemPerTurn') : undefined}
        keys="B"
        onClick={() => setMenu('item')}
      />
    )
  )
  const pips = (
    <TeamPips
      team={st.player}
      activeUid={active.uid}
      hpOf={(b) => fx.hp[b.uid] ?? b.hp}
      canSwitch={!auto && (forced || switchOpen)}
      calling={forced && !auto}
      onPick={pickPip}
    />
  )
  // The Bag and the team's pips at the panel's foot, on every screen (docs/43 §5.3: one team display, the pips; the
  // wide screens' rows went, the panel being the phone's). The history is More details'.
  const teamRow = (
    <div className="mt-auto flex items-center gap-2">
      {bag}
      <div className="ml-auto flex items-center gap-1.5">
        {pips}
        {details && (
          <button
            type="button"
            aria-label={t('ui.battle.history')}
            title={t('ui.battle.history')}
            onClick={() => {
              sfx('button')
              setMenu('history')
            }}
            className="grid min-h-[48px] min-w-[44px] place-items-center bg-paper shadow-ring"
          >
            <PixelIcon name="history" size={20} />
          </button>
        )}
      </div>
    </div>
  )

  const stage = (
    // The stage keeps its 3:2 picture (the user's call, 2026-10-27: no sky added above it).
    <div ref={stageBox} className="relative shadow-ledge">
      {!versus && !run.rebattle && <RunRoundGauge strip className="absolute inset-x-0 top-0 z-30" />}
      {/* Each new fight opens on its own beat (docs/42). */}
      {!versus && <EncounterSwipe />}
      <BattleStage
        own={active}
        foe={foeFront}
        double={!!dbl}
        ownBack={ownBack}
        foeBack={foeBack}
        onAim={canAct && !auto && dbl ? (b) => dispatch({ t: 'TARGET', uid: b.uid }) : undefined}
        aimLabel={(b) => t('ui.battle.aimAt', { name: b.name })}
        fx={fx}
        art={art}
        ownShown={ownOut}
        foeShown={foeOut}
        trainer={trainerIntro && isTrainerFight ? (trainerSprite ?? '') : null}
        overlay={legend ?? thrown}
        distorted={distorted}
        world={dream ? 'nightmare' : undefined}
        haunted={dream}
        worn={(catching || !!fx.wornOut[foeFront.uid]) && !thrown}
        onContact={sceneContact}
        onSceneDone={sceneDone}
        onTap={tapMatchups}
        tapLabel={(b) => t('ui.types.tap', { name: b.name })}
        label={heading}
      >
        {dayTime && <BattleDayTime time={dayTime} />}
        {dbl && foeOut && ownOut && !catching && (
          <DoublePlates
            foes={foeRow}
            own={ownRow}
            frontFoe={foeFront.uid}
            frontOwn={active.uid}
            hpOf={(b) => fx.hp[b.uid] ?? b.hp}
            faintedOf={(b) => !!fx.fainted[b.uid] || !!fx.wornOut[b.uid]}
            party={party}
          />
        )}
        {!dbl && foeOut && !bossIntro && (
          <FoePlate
            b={st.enemy}
            hp={fx.hp[st.enemy.uid] ?? st.enemy.hp}
            party={party}
            onClick={tapMatchups && (() => tapMatchups('enemy'))}
            open={matchups === 'enemy'}
          />
        )}
        {!dbl && ownOut && !bossIntro && (
          <OwnPlate
            b={active}
            hp={fx.hp[active.uid] ?? active.hp}
            onClick={tapMatchups && (() => tapMatchups('player'))}
            open={matchups === 'player'}
          />
        )}
        {matchups && (
          <MatchupPopup
            b={matchups === 'enemy' ? foeFront : active}
            side={matchups}
            onClose={() => setMatchups(null)}
          />
        )}
        <AnimatePresence>
          {fx.banner && (
            <motion.div
              key={fx.banner.id}
              className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center"
              // The game-feel pass stamps it down in three steps, held, then gone (docs/38 F3b); else it swells in.
              initial={feelOn ? { scale: 1.8, opacity: 1 } : { scale: 0.3, opacity: 0 }}
              animate={
                feelOn
                  ? { scale: [1.8, 1.4, 1, 1], opacity: [1, 1, 1, 0] }
                  : { scale: [0.3, 1.2, 1], opacity: [0, 1, 1, 0] }
              }
              transition={
                feelOn
                  ? {
                      duration: (quick ? 0.6 : 1.2) * pace,
                      times: [0, 0.07, 0.14, 1],
                      // Each keyframe held until the next: steps, never a glide.
                      ease: (p: number) => (p < 1 ? 0 : 1),
                    }
                  : { duration: (quick ? 0.6 : 1.2) * pace, times: [0, 0.2, 0.8, 1] }
              }
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
      {/* Phones: the stage on top, the panel under it. Wide screens (docs/42): the stage takes the screen, as big as
          its height allows (3:2), and the panel — the very same one, a phone's width — stands docked at its right with
          everything the player does in it: the line, the dice, the actions, the team, the send-out, the catch, the
          result. Nothing under the stage, nothing twice. */}
      <div className="mx-auto w-full">
        <section
          aria-label={heading}
          className="mx-auto flex min-h-[calc(100dvh_-_var(--top-bar,0px))] w-full max-w-[max(300px,min(560px,calc((100dvh_-_var(--battle-panel)_-_var(--top-bar,0px))_*_1.5)))] flex-col [container-type:inline-size] lg:grid lg:min-h-0 lg:max-w-none lg:grid-cols-[minmax(0,calc((100dvh_-_2rem_-_var(--top-bar,0px))_*_1.5))_380px] lg:justify-center lg:gap-4 lg:p-4"
          style={{ '--battle-panel': BATTLE_PANEL } as CSSProperties}
        >
          <h1 className="sr-only">{heading}</h1>
          {stage}
          {/* Wide screens: the panel stands as tall as the stage beside it, and scrolls inside itself when it holds more
              (a long result). */}
          <div className="flex flex-1 flex-col lg:relative">
          <div
            ref={panel}
            className={cx(
              'group/panel flex flex-1 flex-col gap-2 px-3 pt-3',
              wide && 'pixel-panel absolute inset-0 overflow-y-auto pb-3',
            )}
          >
            {result ? (
              // The fight's end, under the scene rather than over it (the rework): no card rises.
              <InlineCard.Provider value={true}>
                {run.phase === 'victory' ? <VictoryView /> : run.phase === 'wipe' ? <WipeView /> : <StalemateView />}
              </InlineCard.Provider>
            ) : picking ? (
              <SendOutStep foe={foeFront.dex} lead={active.uid} />
            ) : (
              // One line, not a dialogue box (docs/42): what just happened, under the scene it happened in. The
              // waiting prompt ("What will … do?") is for More details only; the dice say it already.
              <BattleLine text={!details && prompting ? '' : message} />
            )}
            {result || picking ? null : catching ? (
              <CatchPanel
                docked
                c={run.catch!}
                picked={idlePick}
                onThrow={onThrow}
                revealed={revealed}
                onBait={onBait}
                onRetry={onRetry}
              />
            ) : over ? (
              <BottomDock>{actions}</BottomDock>
            ) : forced && !auto ? (
              // After a K.O. (docs/42): the cards of the send-out step, those able to come in, GO! sends the one picked.
              <SwitchStep
                options={st.player.filter((p) => p.hp > 0 && !onField(p))}
                foe={foeFront.dex}
                onPick={(uid) => dispatch({ t: 'SWITCH', instanceId: uid })}
              />
            ) : switching && canAct ? (
              // Switching on your turn (docs/43 §5.3): the same cards, the one tapped picked; it costs the turn (the
              // line says so); BACK gives the dice back.
              <SwitchStep
                options={switchTargets}
                first={switching}
                foe={foeFront.dex}
                onPick={(uid) => {
                  setSwitching(null)
                  dispatch({ t: 'SWITCH', instanceId: uid })
                }}
                onBack={() => setSwitching(null)}
              />
            ) : (
              <>
                {/* A wide screen's tall panel: the dice in its middle, between the line and the actions. */}
                {wide && <div aria-hidden className="flex-1" />}
                {/* A tall phone: the dice come down a little, towards the thumb (P1b). */}
                {tall && <div aria-hidden className="h-[clamp(0px,calc((100dvh-740px)*0.6),72px)] shrink-0" />}
                <DiceTray
                  tray={tray}
                  live={ready && rolling}
                  selected={st.selected}
                  combo={ring}
                  onToggle={canAct && rolling && !auto ? toggleDie : undefined}
                  size={dieSize}
                  foeName={foeFront.name}
                  onSettled={setLandedKey}
                  feel={feel}
                  score={reveal.score}
                  hand={hand}
                  anticipate={anticipate}
                  nervous={lastReroll}
                  foeSize={foeSize}
                />
                {/* A double battle: which foe the attack goes to (the stage's foe in front). */}
                {dbl && canAct && !auto && foesOnField(st).filter((f) => f.hp > 0).length > 1 && (
                  <TargetPicker
                    foes={foesOnField(st).filter((f) => f.hp > 0)}
                    target={st.enemy.uid}
                    hpOf={(b) => fx.hp[b.uid] ?? b.hp}
                    onPick={(b) => dispatch({ t: 'TARGET', uid: b.uid })}
                  />
                )}
                <div
                  className="flex min-h-[30px] flex-wrap items-center justify-center gap-x-2 gap-y-1"
                  aria-live="polite"
                >
                  {fx.chip && (
                    <Chip key={fx.chip.id} tone="gold" className="text-[16px]">
                      {fx.chip.text}
                    </Chip>
                  )}
                  {reveal.preview && (
                    <Readout
                      preview={reveal.preview}
                      activeName={active.name}
                      open={showBreakdown}
                      onToggle={() => setShowBreakdown((v) => !v)}
                      score={reveal.score}
                    />
                  )}
                </div>
                {reveal.preview && showBreakdown && <DamageRecap result={reveal.preview.r} />}
                {extras && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {megaOpts.length > 0 && (
                      <PixelButton
                        size="sm"
                        variant="gold"
                        disabled={!canAct}
                        title={megaHint}
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
                        title={gmaxHint}
                        onClick={() => {
                          setMenu(null)
                          dispatch({ t: 'GMAX', toDex: gmaxOpts[0]!.dex })
                        }}
                      >
                        <PixelIcon name="up" size={14} /> {t('ui.battle.gmax')}
                      </PixelButton>
                    )}
                    {zOpen && (
                      <ZMoveButton
                        hint={zHint}
                        disabled={!canAct && !stunned}
                        onClick={() => {
                          setMenu(null)
                          dispatch({ t: 'ZMOVE' })
                        }}
                      />
                    )}
                    {typeMenu && (
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
                    {autoStart && (
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setMenu(null)
                          setSettings({ autoMode: true })
                        }}
                      >
                        <PixelIcon name="dice" size={14} /> {t('ui.battle.autoMode')}
                      </PixelButton>
                    )}
                  </div>
                )}
                {/* The room to spare goes above the actions, so they sit low, in the thumb's reach (P1b). */}
                <div aria-hidden className="-mt-2 flex-1" />
                <BottomDock>
                  <div className="min-h-[56px]">{actions}</div>
                  {/* The Bag and the team at the foot of the panel, on every screen (docs/42: the panel is the phone's). */}
                  {teamRow}
                  {canAct && !auto && (
                    <KeyHints
                      keys={[
                        ['1–6', t('ui.battle.keyDice')],
                        ['R', t('ui.battle.keyReroll')],
                        [t('ui.battle.keySpace'), t(rolling ? 'ui.battle.keyAttack' : 'ui.battle.keyRoll')],
                        ...(bagOpen ? [['B', t('ui.battle.bag')] as const] : []),
                        ...(switchOpen ? [['S', t('ui.battle.keySwitch')] as const] : []),
                      ]}
                    />
                  )}
                </BottomDock>
              </>
            )}
          </div>
          </div>
        </section>
      </div>

      <Sheet open={menu === 'history'} onClose={() => setMenu(null)} title={t('ui.battle.history')}>
        <BattleHistoryList battle={battle} cursor={fx.cursor} />
      </Sheet>

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
          <p className="copy text-base text-muted">{megaHint}</p>
        </div>
      </Modal>

      {/* Arceus: its type, picked from a menu, a few times per battle. */}
      <Modal
        open={menu === 'form' && typeMenu}
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
            {lockedOpts.map((f) => (
              <span
                key={f.dex}
                role="img"
                aria-label={t('ui.ug.typeLocked', { type: typeName(f.type1), plate: t(`plate.${f.type1}`) })}
                className="flex flex-col items-center gap-1 bg-well-deep p-1 text-center text-ink shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]"
              >
                <span className="flex items-center gap-1 pt-1">
                  <PixelIcon name="lock" size={12} />
                  <TypeBadge type={f.type1} size="sm" />
                </span>
                <small className="font-pixel-sm text-tag leading-tight">{t(`plate.${f.type1}`)}</small>
              </span>
            ))}
          </div>
          {lockedOpts.length > 0 && <p className="copy font-pixel-sm text-[16px] text-muted">{t('ui.ug.typeLockedNote')}</p>}
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
            {/* The ones that would do something right now first. */}
            {[...ownedItems]
              .sort(([a], [b]) => Number(st.player.some((p) => itemHelps(b, p))) - Number(st.player.some((p) => itemHelps(a, p))))
              .map(([k, n]) => {
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
                    <span className="font-pixel-sm text-[16px] leading-tight text-muted">
                      {st.noHealItems && (it.effect.kind === 'heal' || it.effect.kind === 'revive')
                        ? t('ui.extreme.noItems')
                        : effectText(it)}
                    </span>
                  </span>
                  <span className="font-pixel-sm text-[16px] tabular-nums">×{n}</span>
                </button>
              )
            })}
          </div>
        ) : (
          // Who gets it: the team as the send-out's cards (one design for "pick a Pokémon", docs/43 §5.3); a tap on
          // one that it helps uses it, the others say why not.
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {fightCards(st.player).map(({ b, inst }) => {
              const ok = itemHelps(itemKey, b)
              return (
                <PokeCard
                  key={b.uid}
                  inst={inst}
                  openLabel={t('ui.battle.useOn', { item: data.items[itemKey]?.name ?? itemKey, name: b.name })}
                  onOpen={
                    ok
                      ? () => {
                          dispatch({ t: 'USE_ITEM', key: itemKey, targetUid: b.uid })
                          setMenu(null)
                          setItemKey(null)
                        }
                      : undefined
                  }
                >
                  {!ok && (
                    <span className="font-pixel-sm text-[16px] leading-tight text-ink">
                      {t(itemWhyNot(data.items[itemKey]?.effect.kind, b, !!st.noHealItems))}
                    </span>
                  )}
                </PokeCard>
              )
            })}
          </ul>
        )}
      </Sheet>


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

/**
 * The battle's line (docs/42): what just happened, in one line under the stage, where the dialogue box was. It keeps
 * its height when empty, so the dice never jump as lines come and go; a long line (a catch's) wraps to a second.
 */
function BattleLine({ text }: { text: string }) {
  return (
    <p
      className="battle-line m-0 flex min-h-[44px] items-center justify-center px-2 text-center text-[20px] leading-[1.1]"
      aria-live="polite"
    >
      {text}
    </p>
  )
}

/** An instance as its card shows it in a fight: the fight's share of its HP, on the instance's own scale. */
function atFightHp(inst: PokemonInstance, b: Battler, data: GameData): PokemonInstance {
  const max = instanceMaxHp(inst, data)
  return { ...inst, currentHp: b.hp <= 0 ? 0 : Math.max(1, Math.round((b.hp / Math.max(1, b.maxHp)) * max)) }
}

/** Why an item can't be used on this one, in the Pokémon sheet's words. */
function itemWhyNot(kind: string | undefined, b: Battler, noHeal: boolean): string {
  if (noHeal && (kind === 'heal' || kind === 'revive')) return 'ui.extreme.noItems'
  if (kind === 'revive') return 'ui.sheet.itemNotFainted'
  if (b.hp <= 0) return 'ui.sheet.itemFainted'
  if (kind === 'heal' && b.hp >= b.maxHp) return 'ui.sheet.itemFull'
  return 'ui.sheet.itemNoEffect'
}

/**
 * On a pick step, 1–6 pick the nth card (docs/43 §5.3): the dice's keys, for the cards in the same place. Enter then
 * presses GO! (the battle's own handler, the step's red button).
 */
function usePickKeys(ids: readonly string[], pick: (id: string) => void) {
  const latest = useRef({ ids, pick })
  latest.current = { ids, pick }
  const covered = useDialogOpen()
  useEffect(() => {
    if (covered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      const id = /^[1-6]$/.test(e.key) ? latest.current.ids[Number(e.key) - 1] : undefined
      if (id) latest.current.pick(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [covered])
}

/**
 * Who goes in, mid-fight (docs/42, docs/43 §5.3), laid out as the send-out step: the cards of those able to come in
 * (the fight's HP on each), the first (or the pip tapped) picked, a tap picks another, GO! sends it in. After a K.O.
 * it must be made; on your turn it costs the turn (the line says so) and BACK gives the dice back. Giving up is a
 * small button at the side, never a second full-width one.
 */
export function SwitchStep({
  options,
  first,
  foe,
  onPick,
  onBack,
}: {
  options: Battler[]
  first?: string
  foe: number
  onPick: (uid: string) => void
  onBack?: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const box = useGame((s) => s.save?.box)
  const [picked, setPicked] = useState(
    first && options.some((b) => b.uid === first) ? first : (options[0]?.uid ?? ''),
  )
  const members = options.flatMap((b) => {
    const inst = box?.find((p) => p.id === b.uid)
    return inst ? [atFightHp(inst, b, data)] : []
  })
  usePickKeys(
    members.map((m) => m.id),
    setPicked,
  )
  const name = options.find((b) => b.uid === picked)?.name ?? ''
  const go = (
    <PixelButton
      variant="primary"
      size="lg"
      className="w-full px-2"
      aria-label={t('ui.lead.sendOutName', { name })}
      aria-keyshortcuts="Enter"
      onClick={() => onPick(picked)}
    >
      {t('ui.lead.go')}
    </PixelButton>
  )
  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* In the middle of the room there is (a tall PC panel's too), the buttons at the foot. */}
      <div className="my-auto">
        <LeadPicker members={members} value={picked} onChange={setPicked} foe={speciesTypes(data, foe)} go />
      </div>
      <BottomDock>
        {/* A rare way out, so a quiet one: the flag at the side of GO!'s row, not a second full-width button. */}
        <div
          className={cx(
            'grid gap-2.5',
            onBack ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
          )}
        >
          {onBack && (
            <PixelButton size="lg" className="px-2" aria-keyshortcuts="Escape" onClick={onBack}>
              {t('ui.common.back')}
            </PixelButton>
          )}
          {go}
          <ForfeitButton flag />
        </div>
        <KeyHints
          keys={[
            [`1–${Math.max(1, members.length)}`, t('ui.battle.keyPick')],
            [t('ui.battle.keyEnter'), t('ui.lead.go')],
            ...(onBack ? [[t('ui.battle.keyEsc'), t('ui.common.back')] as const] : []),
          ]}
        />
      </BottomDock>
    </div>
  )
}

/**
 * The send-out step (the rework): the foe stands in the scene; under it, the team, and one tap on GO! sends that one. A
 * challenge the player picked (a gym, a legendary met for the first time) can still wait: NOT YET.
 */
function SendOutStep({ foe, lead }: { foe: number; lead: string }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const enc = useGame((s) => s.run.encounter)
  const types = speciesTypes(data, foe)
  const canWait = enc?.kind === 'gym' || (enc?.kind === 'boss' && !enc.returning)
  // Only a wild Pokémon's send-out goes by itself: a trainer, a gym or a boss is a pick worth waiting for.
  const wild = enc?.kind === 'wild'
  // FLEE / AVOID only where the game's config allows a way out (noEscape, skipPolicy), as on the old pop-up.
  const canFlee = useGame(() => canSkipCurrent())
  // The first able Pokémon is picked to begin with; a tap on another card picks it, GO! sends the one picked.
  const [picked, setPicked] = useState(lead)
  const save = useGame((s) => s.save)
  const team = save ? teamOf(save) : []
  usePickKeys(
    team.map((p) => p.id),
    (id) => team.some((p) => p.id === id && p.currentHp > 0) && setPicked(id),
  )
  const name = useGame((s) => {
    const inst = s.save?.box.find((p) => p.id === picked)
    return inst ? inst.nickname || s.data.species[inst.dex]?.name || '' : ''
  })
  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* In the middle of the room there is (a tall PC panel's too), GO! at the foot. */}
      <div className="my-auto">
        <LeadPicker value={picked} onChange={setPicked} foe={types} go />
      </div>
      <BottomDock>
      {wild ? (
        // A wild Pokémon (docs/42): GO! loads and sends the one picked by itself; a tap on another card picks it and
        // starts the count again (the key), a sheet open over it holds it.
        <AutoButton
          key={picked}
          variant="primary"
          size="lg"
          className="w-full"
          ms={SEND_OUT_AUTO_MS}
          paused="byDialogs"
          aria-keyshortcuts="Enter"
          aria-label={t('ui.lead.sendOutName', { name })}
          onClick={() => sendOutLead(picked)}
        >
          {t('ui.lead.go')}
        </AutoButton>
      ) : (
        <PixelButton
          variant="primary"
          size="lg"
          className="w-full"
          aria-keyshortcuts="Enter"
          aria-label={t('ui.lead.sendOutName', { name })}
          onClick={() => sendOutLead(picked)}
        >
          {t('ui.lead.go')}
        </PixelButton>
      )}
      <KeyHints
        keys={[
          [`1–${Math.max(1, team.length)}`, t('ui.battle.keyPick')],
          [t('ui.battle.keyEnter'), t('ui.lead.go')],
        ]}
      />
      {(canWait || canFlee) && (
        <div className="flex justify-end gap-2">
          {canFlee && (
            <PixelButton size="md" variant="ghost" onClick={fleeAtSendOut}>
              <PixelIcon name="run" size={18} />
              {t(enc?.kind === 'trainer' ? 'ui.enc.avoid' : 'ui.enc.flee')}
            </PixelButton>
          )}
          {canWait && (
            <PixelButton size="md" variant="ghost" onClick={notYet}>
              {t('ui.enc.notYet')}
            </PixelButton>
          )}
        </div>
      )}
      </BottomDock>
    </div>
  )
}
