// The battle, full screen: the 240×160 stage on top (BattleStage) and the panel under it — the message, the dice tray
// and its readout, the actions, the Bag and the team. It drives the engine through the store and plays the engine's
// log (useBattleAnimator); the UI never recomputes a rule.
import { TalentPlaque } from '@/components/Talent'
import { AutoButton, PILOT_PICK_MS } from '@/components/AutoButton'
import { BottomDock } from '@/components/BottomDock'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import {
  activeBattler,
  autoAvailable,
  autoLevel,
  autoOffersLead,
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
  zMovePreview,
  zTypeChoices,
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
  legendCinemaOn,
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
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { TypeMatchups } from '@/components/TypeMatchups'
import { BattleDayTime } from '@/components/DayNight'
import { pictureOf, versusPicture } from '@/fx/areaArt'
import { ballOfItem } from '@/fx/scenes'
import { loadSprite, spriteKey } from '@/fx/sprites'
import { catchTimeline } from '@/fx/timelines/catch'
import { legendLook, legendTimeline } from '@/fx/timelines/legend'
import { BOSS_CINEMAS } from '@/fx/timelines/cinema'
import { useT } from '@/i18n/react'
import { effectText, zMoveText } from '@/i18n/text'
import { trainerTitle, typeName } from '@/lib/format'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { haptic } from '@/lib/haptics'
import { capMotion, MotionCap, useMotion, type MotionLevel } from '@/lib/motion'
import { AUTO_PACE, PaceContext, usePace, VERSUS_PACE } from '@/lib/pace'
import { useDialogOpen } from '@/lib/useDialog'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { pushToast, setSettings, useGame, type BattleSlice, type CatchThrow } from '@/store/game'
import { autoStepNow, useAutoLevel } from '@/store/autopilot'
import { answerBait, dispatchBattle, canSkipCurrent, fleeAtSendOut, notYet, passCatch, retryCatch, sendOutLead, throwBall } from '@/store/run'
import { LeadPicker } from '@/components/LeadPicker'
import { RerollLessonGuide, type LessonStep } from '@/components/RerollLesson'
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
  ZTypePicker,
  type Preview,
  type TrayDice,
} from './BattlePanel'
import { BattleStage, type StageOverlay } from './BattleStage'
import { CatchPanel, catchMessage } from './CatchPanel'
import { DoublePlates, TargetPicker } from './DoublePlates'
import { FoePlate, OwnPlate } from './Plates'
import { useBattleAnimator } from './useBattleAnimator'
import { BagColumn, TeamColumn, type BagEntry, type TeamAim } from './BattleSides'
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
          'pixel-panel absolute inset-x-2 z-30 max-h-[calc(100%-1rem-var(--strip,0px))] overflow-y-auto p-2',
          side === 'enemy' ? 'top-[calc(var(--strip,0px)+0.5rem)]' : 'bottom-2',
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
/** How long the dice wait in hand before your turn's throw (docs/38 F1d). */
const ROLL_WAIT_MS = 250

// Auto-mode's picks sample rolls (like the enemy AI); its own stream keeps the battle's rolls untouched.
const autoRng = createRng(randomSeed())
/** A wild fight's GO! (docs/42): long enough to look at the cards and tap another. */
const SEND_OUT_AUTO_MS = 2600
/** How long auto-mode shows its dice selection before the reroll. */
const AUTO_SELECT_MS = 450
/**
 * The weekly league's live fights (docs/44): an auto move never comes sooner than this, animations off included, so a
 * fight on AUTO always takes the time the server expects of one played (versus_league_finish's too-fast check).
 */
const LIVE_AUTO_MIN_MS = 300
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
/**
 * A computer's fight (the user's call, 2026-10-28): the stage on top of the middle column, the panel under it at this
 * height (the line, the dice, the readout, a row of powers, the actions), the Bag and the team in columns at its sides.
 * The stage is as wide as the height left allows (3:2), and leaves each side column 220 px at the least.
 */
const PC_PANEL = 268
/**
 * …and as tall as this at most: a fight's step that needs more room (the line on two rows, a row of powers, the AUTO
 * switch, the key hints) takes it from the stage, up to here, rather than scrolling under its pinned buttons (a
 * player's feedback, 2026-10-29: the damage hidden behind REROLL and ATTACK). What it grew to stays for the session,
 * so the stage doesn't change size from one turn or fight to the next.
 */
const PC_PANEL_MAX = 440
let pcPanelSeen = PC_PANEL
const STAGE_W =
  'max(360px, min(calc((100dvh - var(--top-bar, 0px) - 2rem - 0.75rem - var(--pc-panel)) * 1.5), calc(100vw - 4rem - 440px)))'

const BANNER_TONE = {
  super: 'bg-gold text-ink',
  weak: 'bg-paper text-ink',
  immune: 'bg-ink text-paper',
  info: 'bg-paper text-ink',
}

/**
 * A Versus fight, replayed: the whole fight was computed (and its result recorded) before it started, so the screen
 * plays it on auto and every move comes from that script instead of the run store. With `live` (the weekly league,
 * docs/44), the player fights it: their moves go to `dispatch`, AUTO hands them to `nextMove`, and the battle powers
 * are theirs to use; never an item.
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
  /** Fought by the player (the weekly league): AUTO is their switch, off at the start. */
  live?: { auto: boolean; onAuto: (on: boolean) => void }
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
  const [menu, setMenu] = useState<null | 'item' | 'history' | 'mega' | 'form' | 'z'>(null)
  // Switching in on your turn (docs/43 §5.3): the panel shows the send-out's cards instead of the dice (no dialog over
  // the fight), the one tapped picked first; BACK returns to the dice. Holds the fight like a menu.
  const [switching, setSwitching] = useState<string | null>(null)
  // A computer's Bag column (BattleSides): the item picked, waiting for the team's column to say who gets it. Holds
  // the fight as the Sheet's menu does.
  const [aim, setAim] = useState<string | null>(null)
  // A computer's switch after a K.O.: the one picked in the team's column (the first able one until a tap).
  const [forcedPick, setForcedPick] = useState<string | null>(null)
  // …and the send-out's, before the fight (the lead until a tap).
  const [leadPick, setLeadPick] = useState<string | null>(null)
  // The fight waits while a pop-up is over it: one of its own menus, or one from the top bar (the trainer menu,
  // Settings, the guide). No throw, no auto move and no key press plays behind it; closing it picks up from there.
  const covered = useDialogOpen()
  const held = !!menu || !!switching || !!aim || covered
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
  // A replayed Versus fight (decided already) always plays itself; a live one (docs/44) when the player says so.
  const live = versus?.live
  const scripted = !!versus && !live
  const auto = live ? live.auto : !!versus || autoAt !== 'off'
  // Auto-mode plays the whole fight faster: animations, dice and timers.
  const pace = scripted ? VERSUS_PACE : auto ? AUTO_PACE : 1
  // A fight that plays itself is watched, not played: short animations unless the player turned them off altogether.
  const motionCap: MotionLevel | null = auto ? 'short' : null
  const level = capMotion(chosenLevel, motionCap)
  // Nothing to wait for: animations off.
  const quick = level === 'off'

  // A Versus fight has nothing to do with the area the player may be standing in.
  const enc = versus ? null : run.encounter
  // The area's picture is the battle's background; Versus is fought at the Pokémon League.
  const art = useMemo(() => (versus ? versusPicture() : pictureOf(run.areaId)), [versus, run.areaId])
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
  // The send-out step (the rework): the foe is out, yours waits for the player's pick; the fight starts once it's out.
  // Until then nothing moves, on auto either (a trainer's send-out waits on auto too: engine autoOffersLead).
  const picking = !versus && !!run.pickLead
  const intro = bossIntro || trainerIntro || !ownOut || picking

  // A wild or legendary foe the player can still catch isn't knocked out of the scene: the catch throw comes next. A
  // wild pair's first K.O. waits worn out on its spot until the other is down too, then each gets its throw (docs/33).
  const canCatch = (b: Battler) =>
    !versus &&
    (st.kind === 'wild' || st.kind === 'boss') &&
    !!save &&
    !!catchTarget(save, b.baseDex ?? b.dex, b.level, st.kind, data, b.shiny)
  const catchable = dbl ? (uid: string) => dbl.foes.some((f) => f.uid === uid && canCatch(f)) : canCatch(st.enemy)
  const { fx, ready, sceneContact, sceneDone } = useBattleAnimator(
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
  useEffect(() => {
    if (ownOut || !foeOut || bossIntro || picking) return
    const t = setTimeout(() => setOwnOut(true), quick ? 0 : SEND_OUT_MS * pace)
    return () => clearTimeout(t)
  }, [ownOut, foeOut, bossIntro, picking, quick, pace])

  // The enemy acts on its own once the log has caught up (docs/38 F1d).
  useEffect(() => {
    if (!ready || intro || st.phase !== 'enemy_turn') return
    const t = setTimeout(() => dispatch({ t: 'AI_TURN' }), quick ? 0 : 250 * pace)
    return () => clearTimeout(t)
  }, [ready, intro, st.phase, quick, pace, battle.log.length, dispatch])

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
  // The reroll lesson (docs/46 §6): the engine rigged this throw; a guide walks the player through mending it.
  const lessonAt = !auto && canAct && rolling ? st.lesson?.step : undefined
  const lesson: LessonStep | null =
    lessonAt === 'attack' ? 'attack' : lessonAt === 'reroll' ? (st.selected.every(Boolean) ? 'reroll' : 'pick') : null

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
  // After a K.O. with one Pokémon left to come in, it comes in: nothing to choose (the user, 2026-10-27).
  const lastOne = forced && !auto && switchTargets.length === 1 ? switchTargets[0]!.uid : null
  useEffect(() => {
    if (lastOne) dispatch({ t: 'SWITCH', instanceId: lastOne })
  }, [lastOne, dispatch])

  // Your hand: picking a die clicks (and buzzes), and the last reroll sounds its own warning (docs/38 F7b, F9a).
  const toggleDie = (i: number) => {
    feelSound(st.selected[i] ? 'die.unpick' : 'die.pick')
    haptic('diePick')
    dispatch({ t: 'TOGGLE_DIE', i })
  }
  const reroll = () => {
    if (active.rerollsLeft === 1) feelSound('reroll.last')
    dispatch({ t: 'REROLL' })
  }

  // Every turn starts with the throw, so the dice roll themselves (items, switching and running still work after it).
  // It comes after the dice in hand jitter for two frames (docs/38 F8c, F1d).
  const [anticipate, setAnticipate] = useState(0)
  const handReady = !auto && ready && !intro && st.phase === 'player_roll'
  useEffect(() => {
    if (!handReady || held) return
    const wait = quick ? 0 : ROLL_WAIT_MS
    const jitter = quick
      ? undefined
      : setTimeout(() => {
          setAnticipate((n) => n + 1)
          feelSound('die.jitter')
        }, wait - 100)
    const t = setTimeout(() => dispatch({ t: 'ROLL' }), wait)
    return () => {
      clearTimeout(jitter)
      clearTimeout(t)
    }
  }, [handReady, held, quick, battle.log.length, dispatch])

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
      Math.max(live ? LIVE_AUTO_MIN_MS : 0, quick ? 0 : (st.phase === 'player_reroll' ? 350 : 400) * pace),
    )
    return () => {
      clearTimeout(t)
      clearTimeout(inner)
    }
  }, [auto, ready, intro, held, autoPhase, st.phase, data, quick, pace, battle.log.length, dispatch, live])

  const usefulItems = ownedItems.filter(([k]) => st.player.some((p) => itemHelps(k, p)))
  const showSwitch = data.config.allowVoluntarySwitch
  // What the B and S keys (and the pips) can open right now: the same rules as their buttons.
  const bagOpen = !versus && !auto && canItem && usefulItems.length > 0
  // With nobody to send in, the team's pips still open the step: its BACK and its flag, the fight's way out (the user,
  // 2026-10-27).
  const switchOpen = !auto && canAct && showSwitch
  const openSwitch = (uid?: string) => setSwitching(uid ?? switchTargets[0]?.uid ?? active.uid)
  // The Bag's items, the ones that would do something right now first: the Sheet's list, and a computer's column.
  const bagList = [...ownedItems].sort(
    ([a], [b]) => Number(st.player.some((p) => itemHelps(b, p))) - Number(st.player.some((p) => itemHelps(a, p))),
  )
  const doesText = (it: (typeof data.items)[string]) =>
    st.noHealItems && (it.effect.kind === 'heal' || it.effect.kind === 'revive') ? t('ui.extreme.noItems') : effectText(it)
  const bagEntries: BagEntry[] = bagList.map(([k, n]) => ({
    key: k,
    item: data.items[k]!,
    count: n,
    useful: st.player.some((p) => itemHelps(k, p)),
    does: doesText(data.items[k]!),
  }))
  // A computer's Bag: an Ether goes to the one in battle; anything else waits for the team's column to say who.
  const pickItem = (k: string) => {
    if (data.items[k]?.effect.kind === 'rerolls') {
      setAim(null)
      dispatch({ t: 'USE_ITEM', key: k, targetUid: activeBattler(st).uid })
    } else setAim((v) => (v === k ? null : k))
  }
  const teamAim: TeamAim | null = aim
    ? {
        item: aim,
        helps: (b) => itemHelps(aim, b),
        whyNot: (b) => itemWhyNot(data.items[aim]?.effect.kind, b, !!st.noHealItems),
        onUse: (b) => {
          setAim(null)
          dispatch({ t: 'USE_ITEM', key: aim, targetUid: b.uid })
        },
        onCancel: () => setAim(null),
      }
    : null
  // The turn moved on (the foe's, an item used), or the window narrowed to a phone's panel: the pick is dropped.
  useEffect(() => {
    if (!bagOpen || !wide) setAim(null)
  }, [bagOpen, wide])
  const bagBox = useRef<HTMLDivElement>(null)

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
        else if (aim && !covered) setAim(null)
        else if (switching && !covered) setSwitching(null)
        return
      }
      // An item picked in a computer's Bag waits for its Pokémon (a tap in the team's column) or Esc.
      if (auto || covered || menu || aim) return
      // A focused button or link answers Enter/Space itself (the top bar's too, which stays up in battle).
      const onControl = !!el?.closest?.('button, a[href]')
      const key = e.key.toLowerCase()
      if ((canAct || stunned) && !switching) {
        // The reroll lesson: only its step's keys (the dice's numbers, then R, then Space or Enter to attack).
        const pick = /^[1-6]$/.test(e.key)
        if (lesson && !(lesson === 'attack' ? e.key === ' ' || e.key === 'Enter' : pick || (lesson === 'reroll' && key === 'r')))
          return
        if (e.key === ' ' || e.key === 'Enter') {
          if (onControl) return
          e.preventDefault()
          dispatch(stunned ? { t: 'PASS' } : st.phase === 'player_roll' ? { t: 'ROLL' } : { t: 'ATTACK' })
        } else if (key === 'r' && rolling) keyAct.current.reroll()
        else if (/^[1-6]$/.test(e.key) && rolling) keyAct.current.toggleDie(Number(e.key) - 1)
        else if (key === 'b' && bagOpen) {
          // A computer's Bag is open at the side already: B goes to its first item.
          if (wide) bagBox.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
          else setMenu('item')
        }
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
  }, [canAct, stunned, auto, covered, menu, aim, switching, matchups, rolling, bagOpen, switchOpen, wide, st.phase, dispatch, lesson])
  // Mega Evolution (once per battle, Lv.50+, from Kalos on), Gigantamax and Arceus's types.
  const megaOpts = scripted ? [] : megaChoices(st, data)
  const gmaxOpts = scripted ? [] : gmaxChoices(st, data)
  // Primal Reversion and Ultra Burst use the same button under their own name.
  const megaMechanic = megaOpts[0]?.form?.mechanic
  const megaLabel =
    megaMechanic === 'primal'
      ? 'ui.battle.primal'
      : megaMechanic === 'ultra'
        ? 'ui.battle.ultra'
        : 'ui.battle.mega'
  const formOpts = scripted ? [] : formChoices(st, data)
  // Arceus's types still waiting for their plate (docs/34): listed, locked, in the same menu.
  const lockedOpts = scripted ? [] : lockedTypeForms(st, data)
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
  const zOpen = !scripted && canZMove(st, data)
  const zType = preview?.r.attackType ?? null
  // Two types: the player picks the one it takes, each with what it adds and its hit as that type (the engine's).
  const zOptions = (zOpen ? zTypeChoices(st, data) : []).map((type) => {
    const { effect, result } = zMovePreview(st, data, type)
    return { type, hint: zMoveText(effect, typeName(type), data), result }
  })
  // Stunned, only a Steel-type has it: it shakes the stun off (no roll yet to name a type).
  const zHint = !zOpen
    ? ''
    : st.phase === 'player_stunned'
      ? zMoveText('cleanse', typeName('steel'), data)
      : zOptions.length
        ? zOptions.map((o) => o.hint).join(' · ')
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

  // Stunned with no item that could help: nothing to do but lose the turn. Versus takes no item (docs/44).
  const stunChoice = (!versus && canItem && usefulItems.length > 0) || zOpen
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
    const params = {
      own: spriteKey(lead.dex, true, lead.shiny),
      foe: spriteKey(foe.dex, false, foe.shiny),
      look: legendLook(foe.baseDex ?? foe.dex, foe.types[0] ?? 'normal'),
      name: foe.name,
      level: t('ui.common.level.short', { n: foe.level }),
      types: foe.types.map((ty) => typeName(ty)).join(' / '),
    }
    // A mythical's own entrance (docs/53: Mew in its forest) when the cinematics are on and it has one.
    const cinema = legendCinemaOn(data) ? BOSS_CINEMAS[foe.baseDex ?? foe.dex] : undefined
    return {
      timeline: cinema ? cinema.makeBattle(params) : legendTimeline(params),
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
  // (F2d); each landing plays the damage count-up (F2a).
  const throwKey = trayKeyOf(tray)
  const [landedKey, setLandedKey] = useState('')
  const settled = ready && rolling && tray?.side === 'player' && (!throwKey || landedKey === throwKey)
  const reveal = useDamageReveal(preview, settled, throwKey)
  const shownR = reveal.preview?.r
  // The combo's ring, once its dice are down and its beat has landed.
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
  const hand = quick
    ? undefined
    : handReady
      ? { side: 'player' as const, dice: active.dice }
      : foeHand && { side: 'enemy' as const, dice: foeHand }
  const foeSize = Math.max(40, Math.round((dieSize * 0.75) / 2) * 2)
  const lastReroll = rolling && active.rerollsLeft === 1
  // The reroll lesson's guide shows once the dice are down (and, after the reroll, once the pair's combo has counted).
  const lessonShown = !!lesson && settled && (lesson !== 'attack' || comboIn)

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
  useEffect(() => {
    if (!forced) setForcedPick(null)
  }, [forced])
  useEffect(() => {
    if (!picking) setLeadPick(null)
  }, [picking])
  // A cleared area's fight can be handed to auto-mode midway, as the area's switch would have from its start.
  // One switch, in the same place on or off (the user's call, 2026-10-27): no note and STOP while it plays.
  const autoToggle = (autoOpen && !versus && !catching) || !!live
  const extras =
    !terminal &&
    ((!auto && (megaOpts.length > 0 || gmaxOpts.length > 0 || zOpen || typeMenu || st.canRun)) || autoToggle)

  let actions: ReactNode = null
  if (over) actions = versus!.end
  else if (auto && !terminal)
    // A Versus fight is decided already: it plays to its end, and says so. Auto-mode's own switch stays lit above.
    actions = scripted ? (
      <p className="m-0 flex items-center gap-2 font-pixel-sm text-[16px] leading-[1.1] text-muted" role="status">
        <Chip tone="plain">{t('ui.battle.autoMode')}</Chip>
        {t('ui.battle.autoNote')}
      </p>
    ) : null
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
          // The last one says so, in gold (F9a).
          variant={lastReroll ? 'gold' : undefined}
          className="whitespace-nowrap px-2"
          disabled={!canAct || active.rerollsLeft <= 0 || !st.selected.some(Boolean)}
          title={t('ui.battle.selectDice')}
          aria-keyshortcuts="R"
          data-guide="reroll"
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
          data-guide="attack"
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
  const history = details && (
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
  )
  // The Bag and the team's pips at the panel's foot on a phone (docs/43 §5.3: one team display, the pips). A computer
  // has them open in the columns at the sides: the row keeps only who you're up against (Versus) and the history
  // (More details').
  const teamRow = wide ? (
    (versus || history) && (
      <div className="flex items-center gap-2">
        {versus && bag}
        <div className="ml-auto">{history}</div>
      </div>
    )
  ) : (
    <div className="mt-auto flex items-center gap-2">
      {bag}
      <div className="ml-auto flex items-center gap-1.5">
        {pips}
        {history}
      </div>
    </div>
  )
  // A computer's side columns, from the send-out to the catch (the result has the middle alone): the team's is where a
  // Pokémon is picked — the send-out's lead, a switch's, a K.O.'s — the panel showing the one picked and GO!.
  const forcedStep = forced && !auto && !lastOne
  const switchStep = !!switching && canAct
  const sides = wide && !result && !over
  const forcedOptions = st.player.filter((p) => p.hp > 0 && !onField(p))
  const teamPick = !wide
    ? null
    : picking
      ? {
          value: leadPick ?? active.uid,
          able: new Set(st.player.filter((p) => p.hp > 0).map((b) => b.uid)),
          onChange: setLeadPick,
        }
      : forcedStep
      ? {
          value: forcedPick ?? forcedOptions[0]?.uid ?? '',
          able: new Set(forcedOptions.map((b) => b.uid)),
          onChange: setForcedPick,
        }
      : switchStep
        ? { value: switching!, able: new Set(switchTargets.map((b) => b.uid)), onChange: setSwitching }
        : null

  const stage = (
    // The stage keeps its 3:2 picture (the user's call, 2026-10-27: no sky added above it).
    // The round's strip lies along its top edge: --strip moves the plates under it (the user, 2026-10-27: it hid the
    // top of the foe's plate).
    <div
      ref={stageBox}
      className="relative shadow-ledge"
      style={{ '--strip': !versus && !run.rebattle ? '14px' : '0px' } as CSSProperties}
    >
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
              // Stamped down in three steps, held, then gone (docs/38 F3b).
              initial={{ scale: 1.8, opacity: 1 }}
              animate={{ scale: [1.8, 1.4, 1, 1], opacity: [1, 1, 1, 0] }}
              transition={{
                duration: (quick ? 0.6 : 1.2) * pace,
                times: [0, 0.07, 0.14, 1],
                // Each keyframe held until the next: steps, never a glide.
                ease: (p: number) => (p < 1 ? 0 : 1),
              }}
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
        {/* A hidden talent at work (docs/51): its plaque, on its owner's side. */}
        {fx.talent && (
          <TalentPlaque
            key={fx.talent.id}
            talent={fx.talent.key}
            name={fx.talent.name}
            side={fx.talent.side}
            entry={fx.talent.entry}
            pace={pace}
            still={quick}
          />
        )}
      </BattleStage>
    </div>
  )

  // A computer's fight step fits its panel: whatever it would scroll by goes to the panel, from the stage (PC_PANEL_MAX).
  // A result, the send-out and the catch keep the panel as it is and scroll, their buttons pinned at its foot.
  const [pcPanel, setPcPanel] = useState(pcPanelSeen)
  const fitting = wide && !result && !picking && !catching
  useEffect(() => {
    const el = panel.current
    if (!fitting || !el || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const over = el.scrollHeight - el.clientHeight
      if (over <= 1 || pcPanelSeen >= PC_PANEL_MAX) return
      pcPanelSeen = Math.min(PC_PANEL_MAX, pcPanelSeen + Math.ceil(over))
      setPcPanel(pcPanelSeen)
    }
    const sizes = new ResizeObserver(fit)
    const watch = () => {
      sizes.disconnect()
      sizes.observe(el)
      for (const c of Array.from(el.children)) sizes.observe(c)
    }
    watch()
    const kids = new MutationObserver(watch)
    kids.observe(el, { childList: true })
    return () => {
      sizes.disconnect()
      kids.disconnect()
    }
  }, [fitting])

  return (
    <BattleContexts pace={pace} motionCap={motionCap}>
      {lesson && (
        <RerollLessonGuide
          step={lesson}
          show={lessonShown}
          next={Math.max(0, st.selected.findIndex((x) => !x))}
          bonus={shownR?.combo?.bonus ?? 0}
        />
      )}
      {/* The stage on top and the panel under it, on every screen (the user's call, 2026-10-28). A computer's middle
          column: the stage as wide as the height left allows (3:2), the panel framed under it, scrolling inside itself
          when it holds more (a long result); on its sides, from the send-out to the catch, the Bag open (left) and the
          team on rows (right) — what a phone keeps behind the Bag button and in the pips. */}
      <div className="mx-auto w-full">
        <section
          aria-label={heading}
          className="mx-auto flex min-h-[calc(100dvh_-_var(--top-bar,0px))] w-full max-w-[max(300px,min(560px,calc((100dvh_-_var(--battle-panel)_-_var(--top-bar,0px))_*_1.5)))] flex-col [container-type:inline-size] lg:grid lg:h-[calc(100dvh_-_var(--top-bar,0px))] lg:min-h-0 lg:max-w-none lg:grid-cols-[minmax(0,340px)_var(--stage-w)_minmax(0,340px)] lg:justify-center lg:gap-4 lg:p-4"
          style={{ '--battle-panel': BATTLE_PANEL, '--pc-panel': `${pcPanel}px`, '--stage-w': STAGE_W } as CSSProperties}
        >
          <h1 className="sr-only">{heading}</h1>
          {wide && (
            <div ref={bagBox} className="flex min-h-0 flex-col">
              {sides && !versus && (
                <BagColumn
                  entries={bagEntries}
                  open={bagOpen && !teamPick}
                  used={!!st.itemUsedThisTurn}
                  aim={aim}
                  onPick={pickItem}
                  className="flex-1"
                />
              )}
            </div>
          )}
          <div className="flex flex-1 flex-col lg:min-h-0 lg:gap-3">
          {stage}
          <div className="flex flex-1 flex-col lg:relative lg:min-h-0">
          <div
            ref={panel}
            className={cx(
              'group/panel flex flex-1 flex-col gap-2 px-3 pt-3',
              // The foot's padding is the BottomDock's, which every step ends with; a step taller than the panel (a
              // result with a catch) keeps its height and scrolls, the buttons pinned at the panel's foot as on a
              // phone's screen.
              wide &&
                'pixel-panel absolute inset-0 overflow-y-auto [&>*]:min-h-fit [&_[data-dock]]:sticky [&_[data-dock]]:bottom-0 [&_[data-dock]]:-mx-3 [&_[data-dock]]:bg-panel [&_[data-dock]]:px-3',
            )}
          >
            {result ? (
              // The fight's end, under the scene rather than over it (the rework): no card rises.
              <InlineCard.Provider value={true}>
                {run.phase === 'victory' ? <VictoryView /> : run.phase === 'wipe' ? <WipeView /> : <StalemateView />}
              </InlineCard.Provider>
            ) : picking ? (
              <SendOutStep foe={foeFront.dex} lead={active.uid} chosen={teamPick ?? undefined} />
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
            ) : forcedStep ? (
              // After a K.O. (docs/42): the cards of the send-out step, those able to come in, GO! sends the one picked
              // (a computer picks in the team's column).
              <SwitchStep
                options={forcedOptions}
                foe={foeFront.dex}
                onPick={(uid) => dispatch({ t: 'SWITCH', instanceId: uid })}
                chosen={teamPick ?? undefined}
              />
            ) : switchStep ? (
              // Switching on your turn (docs/43 §5.3): the same cards, the one tapped picked; it costs the turn (the
              // line says so); BACK gives the dice back.
              <SwitchStep
                options={switchTargets}
                first={switching!}
                foe={foeFront.dex}
                onPick={(uid) => {
                  setSwitching(null)
                  dispatch({ t: 'SWITCH', instanceId: uid })
                }}
                onBack={() => setSwitching(null)}
                chosen={teamPick ?? undefined}
              />
            ) : (
              <>
                {/* A wide screen's tall panel: the dice in its middle, between the line and the actions. */}
                {wide && <div aria-hidden className="-mt-2 flex-1" />}
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
                  data-guide="readout"
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
                    {!auto && megaOpts.length > 0 && (
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
                    {!auto && gmaxOpts.length > 0 && (
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
                    {!auto && zOpen && (
                      <ZMoveButton
                        hint={zHint}
                        disabled={!canAct && !stunned}
                        onClick={() => {
                          if (zOptions.length > 1) return setMenu('z')
                          setMenu(null)
                          dispatch({ t: 'ZMOVE' })
                        }}
                      />
                    )}
                    {!auto && typeMenu && (
                      <PixelButton size="sm" disabled={!canAct} onClick={() => setMenu('form')}>
                        <PixelIcon name="dice" size={14} /> {t('ui.battle.type', { left: formsLeft })}
                      </PixelButton>
                    )}
                    {!auto && st.canRun && (
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        disabled={!canAct}
                        onClick={() => dispatch({ t: 'RUN' })}
                      >
                        <PixelIcon name="run" size={14} /> {t('ui.battle.run')}
                      </PixelButton>
                    )}
                    {autoToggle && (
                      <PixelButton
                        size="sm"
                        variant={auto ? 'success' : 'ghost'}
                        aria-pressed={auto}
                        onClick={() => {
                          setMenu(null)
                          if (live) live.onAuto(!auto)
                          else setSettings({ autoMode: !auto })
                        }}
                      >
                        <PixelIcon name="dice" size={14} />{' '}
                        {t('ui.area.autoMode', { state: t(auto ? 'ui.common.on' : 'ui.common.off') })}
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
          </div>
          {wide && (
            <div className="flex min-h-0 flex-col">
              {sides && (
                <TeamColumn
                  team={st.player}
                  hpOf={(b) => fx.hp[b.uid] ?? b.hp}
                  // Before the send-out nobody is on the field yet.
                  onField={picking ? () => false : onField}
                  canSwitch={!auto && (forced || switchOpen)}
                  calling={forced && !auto}
                  onPick={pickPip}
                  aim={teamAim}
                  pick={teamPick}
                  foe={foeFront.types}
                  className="flex-1"
                />
              )}
            </div>
          )}
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

      {/* A dual-type's Z-Move: which of its types it takes. */}
      <Modal
        open={menu === 'z' && zOptions.length > 1}
        onClose={() => setMenu(null)}
        title={t('ui.battle.zMoveName')}
      >
        <ZTypePicker
          name={active.name}
          options={zOptions}
          onPick={(type) => {
            setMenu(null)
            dispatch({ t: 'ZMOVE', type })
          }}
        />
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
            {bagList.map(([k, n]) => {
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
                    <span className="font-pixel-sm text-[16px] leading-tight text-muted">{doesText(it)}</span>
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
      className="battle-line m-0 flex min-h-[44px] items-center justify-center px-2 text-center text-[20px] leading-[1.1] lg:min-h-[36px]"
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

/**
 * A fighter's card, at the fight's HP: its instance in the Box, or one made from the fighter itself. A Versus league
 * match's Pokémon (docs/44) are clones, in no Box: looked up there only, nobody could come in after a K.O.
 */
function fightInst(b: Battler, box: readonly PokemonInstance[] | undefined, data: GameData): PokemonInstance {
  const inst = box?.find((p) => p.id === b.uid) ?? {
    id: b.uid,
    dex: b.dex,
    level: b.level,
    xp: 0,
    currentHp: 0,
    caughtAt: 0,
    shiny: b.shiny,
    ...(b.nickname && { nickname: b.nickname }),
  }
  return atFightHp(inst, b, data)
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
  chosen,
}: {
  options: Battler[]
  first?: string
  foe: number
  onPick: (uid: string) => void
  onBack?: () => void
  /**
   * A computer's fight (BattleSides): the team's column at the side is where the pick is made, so the step shows the
   * one picked, not the cards, and the caller holds the pick.
   */
  chosen?: { value: string | null; onChange: (uid: string) => void }
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const box = useGame((s) => s.save?.box)
  const [own, setOwn] = useState(first && options.some((b) => b.uid === first) ? first : (options[0]?.uid ?? ''))
  const picked = chosen
    ? chosen.value && options.some((b) => b.uid === chosen.value)
      ? chosen.value
      : (options[0]?.uid ?? '')
    : own
  const setPicked = chosen ? chosen.onChange : setOwn
  const members = options.map((b) => fightInst(b, box, data))
  usePickKeys(
    members.map((m) => m.id),
    setPicked,
  )
  const one = options.find((b) => b.uid === picked)
  const name = one?.name ?? ''
  // Nobody to send in (the last one standing): the step is BACK and the flag.
  if (!members.length)
    return (
      <div className="flex flex-1 flex-col gap-3">
        <p className="my-auto text-center text-[20px] leading-tight text-muted">{t('ui.battle.noneToSend')}</p>
        <BottomDock>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
            {onBack && (
              <PixelButton size="lg" className="px-2" aria-keyshortcuts="Escape" onClick={onBack}>
                {t('ui.common.back')}
              </PixelButton>
            )}
            <ForfeitButton flag />
          </div>
        </BottomDock>
      </div>
    )
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
      {/* In the middle of the room there is, the buttons at the foot. */}
      <div className="my-auto">
        {chosen && one ? (
          <PickedOne inst={members.find((m) => m.id === one.uid)} />
        ) : (
          <LeadPicker members={members} value={picked} onChange={setPicked} foe={speciesTypes(data, foe)} go fight />
        )}
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

/** The one a computer's team column picked, for GO! to send: its sprite, name and level, as big as the panel allows. */
function PickedOne({ inst }: { inst: PokemonInstance | undefined }) {
  const { t } = useT()
  const name = useGame((s) => (inst ? inst.nickname || s.data.species[inst.dex]?.name || '' : ''))
  if (!inst) return null
  return (
    <p className="m-0 flex items-center justify-center gap-3 text-[26px] leading-none" aria-live="polite">
      <MiniSprite dex={inst.dex} size={56} className="-my-2" />
      {name}
      <span className="font-pixel-sm text-[18px]">{t('ui.common.level.short', { n: inst.level })}</span>
    </p>
  )
}

/**
 * The send-out step (the rework): the foe stands in the scene; under it, the team, and one tap on GO! sends that one. A
 * challenge the player picked (a gym, a legendary met for the first time) can still wait: NOT YET.
 */
function SendOutStep({
  foe,
  lead,
  chosen,
}: {
  foe: number
  lead: string
  /** A computer's fight: the pick shared with the team's column at the side (SwitchStep's `chosen`). */
  chosen?: { value: string | null; onChange: (uid: string) => void }
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const enc = useGame((s) => s.run.encounter)
  const types = speciesTypes(data, foe)
  const canWait = enc?.kind === 'gym' || (enc?.kind === 'boss' && !enc.returning)
  // Only a wild Pokémon's send-out goes by itself: a trainer, a gym or a boss is a pick worth waiting for…
  const wild = enc?.kind === 'wild'
  // …but on auto a trainer's goes by itself too, after time to pick (PILOT_PICK_MS, whatever the pace), unless a
  // Pokémon is tapped: then GO! waits for the player (engine autoOffersLead).
  const pace = usePace()
  const auto = useAutoLevel() !== 'off' && autoOffersLead(enc?.kind)
  const [touched, setTouched] = useState(false)
  // FLEE / AVOID only where the game's config allows a way out (noEscape, skipPolicy), as on the old pop-up.
  const canFlee = useGame(() => canSkipCurrent())
  // The first able Pokémon is picked to begin with; a tap on another card picks it, GO! sends the one picked.
  const [own, setOwn] = useState(lead)
  const picked = chosen ? (chosen.value ?? lead) : own
  const setPicked = (uid: string) => {
    setTouched(true)
    ;(chosen ? chosen.onChange : setOwn)(uid)
  }
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
      {/* In the middle of the room there is (a tall PC panel's too), GO! at the foot. A computer keeps the cards too
          (the user's call, 2026-10-31: the one picked alone read as "only this one can go"); they and the team's
          column share the pick. */}
      <div className="my-auto">
        <LeadPicker value={picked} onChange={setPicked} foe={types} go fight />
      </div>
      <BottomDock>
      {auto && !touched && (
        <p className="m-0 text-center font-pixel-sm text-[16px] leading-[1.15] text-muted" role="status">
          {t('ui.idle.pickLead')}
        </p>
      )}
      {auto ? (
        <AutoButton
          variant="primary"
          size="lg"
          className="w-full"
          ms={PILOT_PICK_MS / pace}
          hold={touched || (chosen?.value != null && chosen.value !== lead)}
          paused="byDialogs"
          aria-keyshortcuts="Enter"
          aria-label={t('ui.lead.sendOutName', { name })}
          onClick={() => sendOutLead(picked)}
        >
          {t('ui.lead.go')}
        </AutoButton>
      ) : wild ? (
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
