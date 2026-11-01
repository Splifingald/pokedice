// Run flow: map → area → encounter preview → battle → rewards → next. Thin glue over the pure engine.
import { friendBallBoostNow } from './friendship'
import {
  areaVersusHere,
  foeGoldMultiplier,
  foeLevels,
  isPlayerFoe,
  type AreaFoe,
  autoLevel,
  autoOffersLead,
  catchTalentBonus,
  getInstance,
  talentOf,
  noteBossCaught,
  arriveAtPortal,
  applyCatch,
  areaOpenAt,
  baitFaces,
  baitFor,
  captureLuck,
  rollBait,
  type CatchRoll,
  catchWorldMythical,
  emptyProgress,
  applyHp,
  applyRebattleKO,
  applyRebattleLoss,
  applyVictory,
  applyWipe,
  ballBonus,
  isBallFor,
  battleOutcome,
  canSkip,
  catchTarget,
  catchValueOf,
  centerHeal,
  centersOn,
  boonCenters,
  boonCentersHere,
  buffDiceFor,
  dropBoons,
  markCenterRulesSeen,
  openBoonCenter,
  pendingBoons,
  pickCenterBoon,
  wipeCenterDue,
  type BoonPicked,
  challengeEncounter,
  finishRound,
  type Encounter,
  type EncounterContext,
  playerSideOf,
  consumeItem,
  pickUpItem,
  shinyBoost,
  wildShinyChance,
  recordDraws,
  rollCatch,
  spinSlots,
  createBattle,
  createRng,
  enemyUpgradeLevelFor,
  hasAbleTeam,
  hasFaintedMember,
  healItemsOn,
  isAreaClosed,
  isAreaSealed,
  isAreaUnlocked,
  isTeamHurt,
  battlePowersFor,
  enemyPlanFor,
  regionOf,
  regionOfArea,
  newSave,
  nextEncounter,
  progressOf,
  plateTypes,
  randomSeed,
  reduce,
  swapIntoTeam,
  teamAverageLevel,
  teamOf,
  starterFainted,
  trainerPrize,
  uniformLevels,
  UNOWN_DEX,
  unownLetterFor,
  withWorldBoost,
  drawPortalCard,
  inPortalRun,
  markPortalWonSeen,
  openRaidIn,
  portalVictoryToRaid,
  openDistortion,
  pickDistortion,
  portalDiceFor,
  portalEncounter,
  portalLevels,
  portalLock,
  portalNoCatch,
  portalNextCard,
  portalStateOf,
  startPortalRun,
  applyNightmareStrike,
  asDouble,
  fitWildPair,
  isDoubleEncounter,
  type FoeSeed,
  type DoubleKo,
  arriveAtNightmare,
  inNightmare,
  markNightmareWonSeen,
  nightmareEncounter,
  nightmareLock,
  nightmareNoCatch,
  nightmareStateOf,
  nightmareVictoryToRaid,
  startNightmare,
  winNightmareRound,
  type BattleEvent,
  type BattleKind,
  type ForceKind,
  type PlayerProfile,
  type RunEvent,
  type SaveData,
  type SpinResult,
  applyTrickCatch,
  feedTreat,
  fleeTrick as fleeTrickIn,
  startTrick,
  throwTrickBall as throwTrickBallIn,
  trickCfg,
  type TrickStep,
  applyGiftOpen,
  bossInPresent,
  giftCfg,
  growGift,
  openGift,
  rollGiftWild,
  startBossPresent,
  startGift,
  type GiftItem,
  type GiftStep,
  type ProgressRaid,
  friendBallTalent,
  isTalentBall,
  outfitOf,
  finishRerollLesson,
  rerollLessonDue,
} from '@/engine'
import { activeSlot } from '@/save/storage'
import { commitSave, initialRun, mutateSave, pushToast, useGame, type CatchState, type RunState } from './game'
import { areaFoeFor, noteMeet } from './areaVersus'
import { localHour } from './dayTime'
import { resumedRngs, trackRngs } from './resume'
import { currentLive } from './live'
import { useRebattleMedal } from './rebattle'
import { serverNow } from './serverTime'
import { trickAllowed } from './trick'
import { giftAllowed } from './giftCard'
import { t } from '@/i18n'

// An encounter picked up from the last visit (store/resume.ts) rolls on from where both streams stood, so a reload
// throws the same dice staying would have; its ids carry on too, so the next battle or ghost is a new screen.
const resumed = resumedRngs()
let runRng = createRng(resumed?.run ?? randomSeed())
let battleRng = createRng(resumed?.battle ?? randomSeed())
let battleSeq = useGame.getState().battle?.id ?? 0
let trickSeq = useGame.getState().run.trick?.id ?? 0
let giftSeq = useGame.getState().run.gift?.id ?? 0
trackRngs(() => ({ run: runRng.getState(), battle: battleRng.getState() }))

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`

/** Tests only: make every roll reproducible. */
export function seedRun(seed: number) {
  runRng = createRng(seed)
  battleRng = createRng(seed ^ 0x9e3779b9)
}

const setRun = (patch: Partial<RunState>) => useGame.setState((s) => ({ run: { ...s.run, ...patch } }))

export function startNewGame(starterDex: number, player?: PlayerProfile) {
  const { data } = useGame.getState()
  const save = newSave(starterDex, data, Date.now(), newId, player)
  // The page plays the Extreme slot (docs/22): the new game is an Extreme save.
  commitSave(activeSlot() === 'extreme' ? { ...save, mode: 'extreme' } : save)
  useGame.setState({ run: initialRun(), battle: null })
}

export function deleteSave() {
  commitSave(null)
  useGame.setState({ run: initialRun(), battle: null })
}

export function enterArea(areaId: string): boolean {
  const { save, data } = useGame.getState()
  if (!save || !isAreaUnlocked(save, areaId, data) || isAreaClosed(save, areaId, data)) return false
  // Inside a portal run (docs/28) there is no other area to go to, nor in the nightmare (docs/30).
  const locked = portalLock(save, data) ?? nightmareLock(save, data)
  if (locked && locked.id !== areaId) return false
  // A small world's area may also wait for its date (docs/21), on the server's clock.
  if (!areaOpenAt(data, areaId, serverNow())) return false
  // Entering is visiting: an area entered once is no longer "new" (a secret area stops being featured on Home).
  const visited = !!save.areaProgress[areaId]
  if (save.currentAreaId !== areaId || !visited)
    commitSave({
      ...save,
      currentAreaId: areaId,
      areaProgress: visited ? save.areaProgress : { ...save.areaProgress, [areaId]: emptyProgress() },
    })
  useGame.setState({ run: { ...initialRun(), areaId, firstInArea: true, forceNext: useGame.getState().run.forceNext }, battle: null })
  return true
}

/**
 * A region begun (a new game, or a new region on its starter): straight into its first area and the first encounter,
 * never Home first (the rework). False when the area can't be entered; the caller then stays where it is.
 */
export function exploreFirstArea(areaId?: string): boolean {
  const { save } = useGame.getState()
  const id = areaId ?? save?.currentAreaId
  if (!id || !enterArea(id)) return false
  rollNext()
  return true
}

export function leaveArea() {
  useGame.setState((s) => ({ run: { ...initialRun(), forceNext: s.run.forceNext }, battle: null }))
}

/**
 * The encounter is over: if it was the round's last card, the round counts (once) and the area may clear. Safe to call
 * more than once. `quiet` keeps the "cleared" news for the caller (the victory screen shows it as a card instead of a
 * toast); the cleared event is returned either way.
 */
function settleRound(quiet = false): Extract<RunEvent, { kind: 'area_cleared' }> | null {
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId) return null
  const r = finishRound(save, run.areaId, data)
  if (!r.roundDone) return null
  commitSave(r.save)
  const area = data.areas.find((a) => a.id === run.areaId)
  if (r.cleared) {
    if (!quiet) {
      const next = r.cleared.nextAreaId ? data.areas.find((a) => a.id === r.cleared!.nextAreaId)?.name : null
      pushToast(
        t('ui.toast.areaCleared', {
          area: area?.name ?? t('ui.toast.theArea'),
          next: next ? t('ui.toast.nextOpen', { name: next }) : '',
        }),
        'good',
        4500,
      )
    }
    return r.cleared
  }
  const need = area?.roundsToClear
  const done = progressOf(r.save, run.areaId).roundsDone ?? 0
  if (!quiet)
    pushToast(need != null && done <= need ? t('ui.toast.roundOf', { done, need }) : t('ui.toast.round', { done }), 'good')
  return null
}

/** Back to the area screen after an encounter: the round may be complete. */
function backToArea() {
  setRun({ phase: 'idle', encounter: null, duel: null })
  settleRound()
  // In a portal run, a distortion next is turned over at once: its boons, with no stop on the area's page first (the
  // user, 2026-10-15).
  const { save, data, run } = useGame.getState()
  if (save && run.areaId && inPortalRun(save, data, run.areaId) && portalNextCard(save, run.areaId) === 'distortion')
    rollNext()
}

/** Everything `nextEncounter` needs about the save and the area, as things stand. */
function encounterContext(save: SaveData, areaId: string, forceKind: ForceKind | null): EncounterContext | null {
  const { data, run } = useGame.getState()
  const area = data.areas.find((a) => a.id === areaId)
  if (!area) return null
  return {
    area,
    progress: progressOf(save, area.id),
    data,
    teamAvgLevel: teamAverageLevel(save),
    teamHurt: isTeamHurt(save, data),
    teamFainted: hasFaintedMember(save),
    starterFainted: starterFainted(save),
    isFirstInArea: run.firstInArea,
    pokedex: save.pokedex,
    forceKind,
    player: playerSideOf(save),
    // Extreme mode (docs/22): none, unless its boon Centers are on (docs/47) and this area still has some.
    noCenters: !centersOn(save, data) && !boonCentersHere(save, area, data),
    boonCenters: boonCenters(save, data),
    wipeCenter: wipeCenterDue(save, area.id, data),
    // A Shiny Parade covering this area: wild Pokémon are more often shiny.
    shinyBoost: shinyBoost(currentLive(), area),
    // The Shiny Charm (docs/25): the player's own wild odds.
    shinyChance: wildShinyChance(save, data),
    // Day and night (docs/32): in Johto, only the hour's wild Pokémon come.
    hour: localHour(),
    // Real-player battles (docs/54): the team the server has for this area, if the save meets them here.
    versusFoe: areaVersusHere(save, area, data) ? areaFoeFor(area.id) : null,
  }
}

/**
 * The next card of a portal run (docs/28): a wild Pokémon or a find (its preview, as anywhere), or the distortion that
 * ends the cycle — its boons wait in the save for the pick (the area shows them), or, the last one, the run is won.
 */
function rollPortal(save: SaveData, areaId: string) {
  const { data } = useGame.getState()
  if (portalStateOf(save, areaId).offers?.length) return setRun({ phase: 'idle', encounter: null })
  if (!hasAbleTeam(save)) {
    commitSave(applyWipe(save, areaId, data))
    setRun({ phase: 'wipe', trainer: null, events: [], portalLost: portalStateOf(save, areaId).closed })
    return
  }
  const drawn = drawPortalCard(save, data, areaId, runRng)
  if (!drawn) return
  if (drawn.card === 'distortion') {
    const opened = openDistortion(drawn.save, data, areaId, runRng)
    if (opened) commitSave(opened.save)
    if (opened?.closedAtOnce) pushToast(t('ui.portal.closedToast', { n: portalStateOf(opened.save, areaId).closed }), 'good')
    setRun({ phase: 'idle', encounter: null, firstInArea: false })
    return
  }
  const ctx = encounterContext(drawn.save, areaId, null)
  const roll = ctx ? portalEncounter(ctx, drawn.card, runRng) : null
  if (!roll) return commitSave(drawn.save)
  commitSave(recordDraws(drawn.save, areaId, { encounter: roll.encounter, deck: null, lootDeck: roll.lootDeck }))
  setRun({ phase: 'preview', encounter: roll.encounter, firstInArea: false })
}

/** READY!: into the portal run (docs/28), the team healed, the first card dealt. False when it can't start. */
export function enterPortal(areaId: string): boolean {
  const { save, data, run } = useGame.getState()
  if (!save || run.phase !== 'idle') return false
  if (run.areaId !== areaId && !enterArea(areaId)) return false
  const started = startPortalRun(useGame.getState().save!, data, areaId, runRng)
  if (!started) return false
  commitSave(started)
  setRun({ portalLost: null })
  rollNext()
  return true
}

/** The way in shows (the breach, its pop-up): the team and the Box are healed as at a Pokémon Center (the engine's). */
export function arriveAtPortalIntro(areaId: string) {
  const { save, data } = useGame.getState()
  if (!save) return
  const next = arriveAtPortal(save, data, areaId)
  if (next !== save) commitSave(next)
}

/** The way in's pop-up is up: back from the Team screen, it shows again at once. */
export function markPortalPopup() {
  if (!useGame.getState().run.portalPopup) setRun({ portalPopup: true })
}

/** The player picks a distortion's boon: it applies, the portal closes, and the run goes on. */
export function pickDistortionOffer(index: number) {
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId) return
  const res = pickDistortion(save, data, run.areaId, index, runRng)
  if (!res) return
  commitSave(res.save)
  const n = portalStateOf(res.save, run.areaId).closed
  if (res.itemKey) pushToast(t('ui.portal.gotItem', { item: data.items[res.itemKey]?.name ?? res.itemKey }), 'good')
  pushToast(t('ui.portal.closedToast', { n }), 'good')
}

/** The victory's moment is over: back to the world's Home, where the area is its raid now. */
export function finishPortalVictory() {
  const { save, run } = useGame.getState()
  const areaId = run.areaId ?? save?.currentAreaId
  if (save && areaId) commitSave(markPortalWonSeen(save, areaId))
  useGame.setState((s) => ({ run: { ...initialRun(), forceNext: s.run.forceNext }, battle: null }))
}

/**
 * HEAL & START RAID on the victory (the user, 2026-10-15): the team and the Box healed as at a Pokémon Center, the
 * victory seen (the engine's portalVictoryToRaid), and the area's raid to open, its page next. Null when there is none
 * (the screen goes Home then).
 */
export function healAndStartPortalRaid(): ProgressRaid | null {
  const { save, data, run } = useGame.getState()
  const areaId = run.areaId ?? save?.currentAreaId
  const area = data.areas.find((a) => a.id === areaId)
  if (!save || !area) return null
  const next = portalVictoryToRaid(save, data, area.id)
  if (next !== save) commitSave(next)
  useGame.setState((s) => ({ run: { ...initialRun(), forceNext: s.run.forceNext }, battle: null }))
  return openRaidIn(next, data, area)
}

/**
 * The next round of the nightmare (docs/30): its foe's preview, always the same one for that round. Nothing while
 * Darkrai's strike is due (the area shows it); a team with nobody standing wakes up (the wipe).
 */
function rollNightmare(save: SaveData, areaId: string) {
  const { data } = useGame.getState()
  if (nightmareStateOf(save, areaId).strike) return setRun({ phase: 'idle', encounter: null })
  if (!hasAbleTeam(save)) {
    const lost = nightmareStateOf(save, areaId).round
    commitSave(applyWipe(save, areaId, data))
    setRun({ phase: 'wipe', trainer: null, events: [], nightmareLost: lost })
    return
  }
  const encounter = nightmareEncounter(save, data, areaId)
  if (!encounter) return setRun({ phase: 'idle', encounter: null, nightmareStruck: false })
  setRun({ phase: 'preview', encounter, firstInArea: false, nightmareStruck: false })
}

/**
 * BEGIN THE NIGHTMARE (docs/30), on the way in's pop-up: into it, round 1's foe next (its intro has played already,
 * as the Distortion World's breach before READY!). False when it can't begin here.
 */
export function beginNightmare(areaId: string): boolean {
  const { save, data, run } = useGame.getState()
  if (!save || run.phase !== 'idle') return false
  if (run.areaId !== areaId && !enterArea(areaId)) return false
  const started = startNightmare(useGame.getState().save!, data, areaId)
  if (!started) return false
  commitSave(started)
  setRun({ nightmareLost: null })
  rollNext()
  return true
}

/** The way in's pop-up is up: back from the Team screen, it shows again at once. */
export function markNightmarePopup() {
  if (!useGame.getState().run.nightmarePopup) setRun({ nightmarePopup: true })
}

/** The way in shows: the team and the Box are healed as at a Pokémon Center (the engine's). */
export function arriveAtNightmareWayIn(areaId: string) {
  const { save, data } = useGame.getState()
  if (!save) return
  const next = arriveAtNightmare(save, data, areaId)
  if (next !== save) commitSave(next)
}

/**
 * Darkrai's shadow strikes (its moment, after a round): the engine takes each team member's share. Who lost what, or
 * null when no strike is due (already taken: a second call does nothing).
 */
export function strikeNightmare(): { uid: string; from: number; to: number }[] | null {
  const { save, data, run } = useGame.getState()
  const areaId = run.areaId ?? save?.currentAreaId
  if (!save || !areaId) return null
  const res = applyNightmareStrike(save, data, areaId)
  if (!res) return null
  commitSave(res.save)
  // Its moment stays on the area's page until CONTINUE (the next round).
  setRun({ nightmareStruck: true })
  return res.hits
}

/** CONTINUE after Darkrai's strike: its moment closes, and the next round's foe comes. */
export function nextNightmareRound() {
  setRun({ nightmareStruck: false })
  rollNext()
}

/** The waking's moment is over: back to the world's Home, where the area is its raid now. */
export function finishNightmareVictory() {
  const { save, run } = useGame.getState()
  const areaId = run.areaId ?? save?.currentAreaId
  if (save && areaId) commitSave(markNightmareWonSeen(save, areaId))
  useGame.setState((s) => ({ run: { ...initialRun(), forceNext: s.run.forceNext }, battle: null }))
}

/**
 * HEAL & START RAID on waking (docs/30, as the portal run's victory): the team and the Box healed as at a Pokémon
 * Center, the waking seen (the engine's nightmareVictoryToRaid), and the area's raid to open, its page next. Null when
 * there is none (the screen goes Home then).
 */
export function healAndStartNightmareRaid(): ProgressRaid | null {
  const { save, data, run } = useGame.getState()
  const areaId = run.areaId ?? save?.currentAreaId
  const area = data.areas.find((a) => a.id === areaId)
  if (!save || !area) return null
  const next = nightmareVictoryToRaid(save, data, area.id)
  if (next !== save) commitSave(next)
  useGame.setState((s) => ({ run: { ...initialRun(), forceNext: s.run.forceNext }, battle: null }))
  return openRaidIn(next, data, area)
}

/** Roll the next encounter and show its preview card. */
export function rollNext() {
  settleRound()
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId) return
  // Pickup's find after the last win (docs/51): shown first, as a find of its own, before any card is dealt.
  if (run.pickup) return setRun({ phase: 'preview', encounter: run.pickup, pickup: null, firstInArea: false })
  // A won portal run or nightmare leaves only its raid: whatever asked (the map's CONTINUE HERE, a result card's
  // CONTINUE), no card is dealt there, or the next stop on its page would find CONTINUE shut (a player’s report, 2026-10-21).
  if (isAreaSealed(save, data, run.areaId)) return setRun({ phase: 'idle', encounter: null })
  if (inNightmare(save, data, run.areaId)) return rollNightmare(save, run.areaId)
  if (inPortalRun(save, data, run.areaId)) return rollPortal(save, run.areaId)
  // A Center's boons still waiting (a reload, HOME before the pick: docs/47): back in that Center. Boons drawn in
  // another area go: the player walked out without picking.
  if (pendingBoons(save, run.areaId)) {
    setRun({ phase: 'center', encounter: { kind: 'center', forced: true, reason: 'round' }, healShown: true })
    return
  }
  if (save.extreme?.center) commitSave(dropBoons(save))
  // Nobody able to fight (e.g. after a stalemate) → the Center is the only sensible next stop. Extreme mode has none:
  // the team rests (Home and the area say until when); with its boon Centers, a K.O. here sends the one that swaps.
  const noneAble = !hasAbleTeam(save)
  const wipeCenter = wipeCenterDue(save, run.areaId, data)
  if (noneAble && !centersOn(save, data) && !wipeCenter) {
    setRun({ phase: 'idle', encounter: null })
    pushToast(t('ui.extreme.restingToast'), 'bad')
    return
  }
  const forceKind = noneAble && !wipeCenter ? 'center' : run.forceNext
  const ctx = encounterContext(useGame.getState().save!, run.areaId, forceKind)
  if (!ctx) return
  const area = ctx.area
  const roll = nextEncounter(ctx, runRng)
  // A wild pair or a duo trainer is fought 2 v 2 (docs/33): decided now, so the preview says so.
  const encounter = asDouble(roll.encounter, ctx, save, runRng)
  // The decks live in the save, so reloading the page can't reshuffle them.
  // Always recorded: besides the decks, the area notes whether this was a Center (never two in a row).
  const before = useGame.getState().save!
  const recorded = recordDraws(before, area.id, roll)
  if (recorded !== before) commitSave(recorded)
  setRun({ phase: 'preview', encounter, firstInArea: false, forceNext: forceKind === run.forceNext ? null : run.forceNext })
  // A Pokémon Center is never a choice (no skipping it, nothing to pick): straight in, no preview card.
  if (encounter.kind === 'center') engage()
  // A find is a step of its own (FindView: the item on the stage, PICK IT UP loading and pressing itself), not a toast
  // the trail runs past (the user's call, 2026-10-28): it waits in 'preview' for pickUpFind.
  else if (encounter.kind === 'item') return
  // A Gift card is a step of its own too (GiftView): the present comes out at once, nothing to pick before it.
  else if (encounter.kind === 'gift') engage()
  else if (directFight(encounter)) beginFight()
}

/**
 * The rework: a fight starts on the battle screen itself, with no preview card. The foe is out, the player's side not
 * yet: one tap on a Pokémon sends it (BattleView's send-out step). A team with one Pokémon able, or a wild fight on auto,
 * goes in at once; a trainer's on auto loads GO! and sends the first able by itself unless a Pokémon is tapped. A
 * double battle keeps its preview (two to pick).
 */
const directFight = (enc: Encounter) =>
  (enc.kind === 'wild' || enc.kind === 'boss' || enc.kind === 'trainer' || enc.kind === 'gym') &&
  !isDoubleEncounter(enc) &&
  // A real player's card shows their team first, FIGHT or SKIP (docs/54).
  !isPlayerFoe(enc)
function beginFight() {
  const { save, data, settings, run } = useGame.getState()
  if (!save) return
  const able = teamOf(save).filter((p) => p.currentHp > 0)
  const auto = autoLevel(save, data, settings, run) !== 'off'
  // On auto, a trainer's send-out still waits a moment for a pick (autoOffersLead); a wild Pokémon's goes in at once.
  const pick = able.length > 1 && (!auto || autoOffersLead(run.encounter?.kind))
  setRun({ pickLead: pick })
  engage(able[0]?.id, pick)
}
/** A Pokémon picked at the send-out step: out it goes. Another than the lead: the same untouched fight, it in front. */
export function sendOutLead(uid: string) {
  const { battle } = useGame.getState()
  const lead = battle?.state.player[battle.state.activeIndex]?.uid
  setRun({ pickLead: false })
  if (!battle) return
  if (uid === lead) return commitEngage()
  engage(uid)
  useGame.setState((s) => (s.battle ? { battle: { ...s.battle, sendLater: true } } : {}))
}
/** FLEE / AVOID at the send-out step: the staged fight is put away, then the usual skip. */
export function fleeAtSendOut() {
  useGame.setState({ battle: null })
  setRun({ pickLead: false })
  skipEncounter()
}
/** NOT YET on a challenge, at the send-out step: back on the trail, nothing used up. */
export function notYet() {
  useGame.setState({ battle: null })
  setRun({ pickLead: false })
  declineChallenge()
}

/** CHALLENGE: bring on the gym battle (or legendary) waiting at the full gauge — only when the player chooses to. */
export function challenge() {
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId || run.phase !== 'idle') return
  // A portal run has no challenge: its cards come one after the other (docs/28); nor has the nightmare (docs/30), nor
  // either once won.
  if (inPortalRun(save, data, run.areaId) || inNightmare(save, data, run.areaId) || isAreaSealed(save, data, run.areaId))
    return
  const area = data.areas.find((a) => a.id === run.areaId)
  const found = area
    ? challengeEncounter(
        area,
        progressOf(save, area.id),
        data,
        teamAverageLevel(save),
        playerSideOf(save),
        runRng,
        wildShinyChance(save, data),
      )
    : null
  // A boss that comes out of a present (docs/61 §4.2: Evergreen Hill's Delibird), while the Gift card is on: its
  // present first, the fight once it bursts. A returning one (it fled the catch) is a plain card of the deck.
  const def = found?.kind === 'boss' ? area?.legendaryBoss?.find((b) => b.dex === found.dex) : null
  if (found?.kind === 'boss' && bossInPresent(data, def)) return void beginBossPresent(found)
  // Tate & Liza fight 2 v 2 where double battles are on (docs/33).
  const ctx = found && run.areaId ? encounterContext(save, run.areaId, null) : null
  const encounter = found && ctx ? asDouble(found, ctx, save, runRng) : found
  if (encounter) setRun({ phase: 'preview', encounter, firstInArea: false, skipsUsed: 0 })
  if (encounter && directFight(encounter)) beginFight()
}

/** NOT YET: back out of a challenge you picked. Nothing is used up; the gauge stays full. */
export function declineChallenge() {
  setRun({ phase: 'idle', encounter: null })
  // A rebattle fight put off: the run ends here (the Area screen sends an idle rebattle run to its page).
  if (useGame.getState().run.rebattle) setRun({ areaId: null })
}

export function canSkipCurrent(): boolean {
  const { run, data } = useGame.getState()
  // A real player's card is always the player's choice (docs/54): SKIP, and no ₽.
  if (isPlayerFoe(run.encounter)) return true
  return !!run.encounter && !data.config.noEscape && canSkip(run.encounter, data.config.skipPolicy, run.skipsUsed)
}

/** FLEE / AVOID: back to the area screen (heal, check the team…); the next encounter waits for CONTINUE. */
export function skipEncounter() {
  if (!canSkipCurrent()) return
  const { run } = useGame.getState()
  const enc = run.encounter
  // SKIP a real player's team (docs/54): the card is used, no ₽, and the server hears of the meet (offered last next).
  if (isPlayerFoe(enc)) {
    if (run.areaId) noteMeet(enc.player, run.areaId, 'skipped')
    backToArea()
    pushToast(t('ui.areaVersus.skippedToast', { name: enc.player.name }))
    return
  }
  const trainer = run.encounter?.kind === 'trainer'
  // skipsUsed survives until a fight is engaged, so skipPolicy 'once' still allows one skip in a row.
  setRun({ skipsUsed: run.skipsUsed + 1 })
  backToArea()
  pushToast(t(trainer ? 'ui.toast.slippedPast' : 'ui.toast.gotAway'))
}

/** `double`: a double battle's foes, all of them (two out at once), and the two leads picked (docs/33). */
function startBattle(
  kind: BattleKind,
  enemy: FoeSeed,
  leadUid?: string,
  double?: { foes: FoeSeed[]; leadUids: string[] },
) {
  const { save, data, run } = useGame.getState()
  if (!save) return
  const area = data.areas.find((a) => a.id === run.areaId)
  const upgradeLevel = run.encounter ? enemyUpgradeLevelFor(run.encounter, area, data) : (area?.enemyUpgradeLevel ?? data.config.enemyUpgradeLevel)
  const team = teamOf(save).map((p) => ({
    uid: p.id,
    dex: p.dex,
    level: p.level,
    hp: p.currentHp,
    shiny: p.shiny,
    // Its outfit (docs/59), while the switch is on.
    outfit: outfitOf(data, p),
    nickname: p.nickname,
    // Its hidden talent (docs/51), while the switch is on.
    talent: talentOf(data, p),
    // A portal run's extra dice (docs/28), or an Extreme Pokébuff's die (docs/47).
    ...(portalDiceFor(save, data, run.areaId, p.id) ?? buffDiceFor(save, data, p.id, serverNow() ?? Date.now())),
  }))
  // Auto-mode (a cleared area; with the play styles, where the style allows: docs/36) fights without Mega Evolution or
  // Gigantamax under their older rules, on both sides — with the powers whose newer rules are on (docs/35); type
  // changers (Arceus…) on both sides take a better type by themselves.
  const auto = autoLevel(save, data, useGame.getState().settings, run) !== 'off'
  // A trainer's ace — its strongest, the last of them if several — may Mega Evolve or Gigantamax (see enemyPlanFor).
  const enc = run.encounter
  const trainerAt = (index: number) =>
    kind === 'trainer' && run.trainer && (enc?.kind === 'trainer' || enc?.kind === 'gym')
      ? (() => {
          const levels = enc.team.map((m) => m.level)
          return {
            regionId: area ? regionOfArea(area) : regionOf(save),
            role: enc.kind === 'gym' ? enc.role : (data.trainers[enc.trainerId]?.role ?? 'trainer'),
            ace: index === levels.lastIndexOf(Math.max(...levels)),
            // A gem among its items makes its ace Mega Evolve (enemyPlanFor).
            items: data.trainers[enc.trainerId]?.items ?? null,
          }
        })()
      : null
  const trainer = trainerAt(run.trainer?.index ?? 0)
  battleRng = createRng(randomSeed() ^ battleRng.getState())
  const { state, log } = createBattle(
    {
      kind,
      team,
      leadUid,
      enemy,
      // A small world's boosters on both sides (docs/21); its tracks are its own, like a region's.
      // …and a portal run's damage boosts on yours (docs/28).
      playerLevels: portalLevels(
        withWorldBoost({ comboLevels: save.comboLevels, dieLevels: save.dieLevels }, data, area),
        save,
        data,
        run.areaId,
      ),
      // A real player's team fights with their own dice and combo upgrades (docs/54).
      enemyLevels: withWorldBoost(isPlayerFoe(run.encounter) ? foeLevels(run.encounter.player) : uniformLevels(upgradeLevel), data, area),
      ...battlePowersFor(save, data),
      noHealItems: !healItemsOn(save, data),
      // Arceus takes only the types of its plates while the Underground is on (docs/34).
      plates: plateTypes(save, data),
      enemyPlan: enemyPlanFor(save, data, enemy, trainer),
      auto,
      // A new player's first fight teaches the reroll and the combo (docs/46 §6): played by hand, one foe.
      rerollLesson: !auto && !double && rerollLessonDue(save, data, run.areaId),
      ...(double && {
        double: { foes: double.foes, leadUids: double.leadUids, plans: double.foes.map((f, i) => enemyPlanFor(save, data, f, trainerAt(i))) },
      }),
    },
    data,
  )
  useGame.setState((s) => ({ battle: { state, log, id: ++battleSeq }, run: { ...s.run, phase: 'battle' } }))
}

/** What ENGAGE settles once the fight is really on: the skips start over, a challenge goes on the area's record. */
function commitEngage() {
  const { run, save } = useGame.getState()
  const enc = run.encounter
  if (!enc || !save) return
  setRun({ skipsUsed: 0 })
  // A challenge (gym, legendary) skipped the deck: note it as the area's latest encounter once it's actually fought.
  if (run.areaId && (enc.kind === 'gym' || enc.kind === 'boss')) {
    const recorded = recordDraws(save, run.areaId, { encounter: enc, deck: null })
    if (recorded !== save) commitSave(recorded)
  }
}

/**
 * ENGAGE the previewed encounter (with the chosen lead for fights, or a double battle's two). `staged`: the fight is
 * only shown, at the send-out step (the rework); nothing is settled until a Pokémon goes out (sendOutLead).
 */
export function engage(lead?: string | string[], staged?: boolean) {
  const leadUids = typeof lead === 'string' ? [lead] : (lead ?? [])
  const leadUid = leadUids[0]
  const { run, save, data } = useGame.getState()
  if (!run.encounter || !save) return
  // A wild pair needs two able (docs/33): with one left since the card was drawn, the first comes alone.
  const enc = fitWildPair(run.encounter, save)
  if (enc !== run.encounter) setRun({ encounter: enc })
  if (!staged) commitEngage()
  switch (enc.kind) {
    case 'center':
      // Extreme mode's boon Centers (docs/47) heal nobody: their boons are drawn instead, waiting for the pick.
      commitSave(run.areaId ? openBoonCenter(centerHeal(save, data), data, run.areaId, enc.reason, runRng) : centerHeal(save, data))
      setRun({ phase: 'center', healShown: false })
      return
    case 'casino':
      setRun({ phase: 'casino' })
      return
    case 'trick':
      void beginTrick(enc)
      return
    case 'gift':
      void beginGift(enc)
      return
    case 'wild': {
      const foe = { dex: enc.dex, level: enc.level, shiny: enc.shiny, talent: enc.talent }
      const partner = enc.partner && { dex: enc.partner.dex, level: enc.partner.level, shiny: enc.partner.shiny, talent: enc.partner.talent }
      return startBattle('wild', foe, leadUid, partner ? { foes: [foe, partner], leadUids } : undefined)
    }
    case 'boss':
      return startBattle('boss', { dex: enc.dex, level: enc.level, shiny: enc.shiny, talent: enc.talent }, leadUid)
    case 'trainer':
    case 'gym': {
      const first = enc.team[0]
      if (!first) return
      // A real player's fight (docs/54): the team is healed first, as at a Pokémon Center.
      if (isPlayerFoe(enc)) commitSave(centerHeal(useGame.getState().save!, data))
      // A double battle is the whole team at once (docs/33): no next Pokémon after it.
      if (isDoubleEncounter(enc) && enc.team.length > 1) {
        setRun({ trainer: { index: enc.team.length - 1, gold: 0 } })
        return startBattle('trainer', first, leadUid, { foes: enc.team, leadUids })
      }
      setRun({ trainer: { index: 0, gold: 0 } })
      return startBattle('trainer', first, leadUid)
    }
    case 'item':
      // Its step said what it is (FindView): into the bag, quietly, and back on the trail.
      if (!run.areaId) return
      commitSave(pickUpItem(save, run.areaId, enc, data, Date.now(), newId, currentLive()))
      backToArea()
      return
  }
}

/**
 * PICK IT UP on a find's step (docs/43): the item goes in the bag (the gold in the purse, a fossil to the lab) and the
 * next encounter comes at once, as after a fight.
 */
export function pickUpFind() {
  const { run } = useGame.getState()
  if (run.phase !== 'preview' || run.encounter?.kind !== 'item') return
  engage()
  // A portal run (docs/28) goes back to its own page between cards, as it always did after a find.
  const after = useGame.getState()
  if (after.run.phase === 'idle' && after.save && after.run.areaId && !inPortalRun(after.save, after.data, after.run.areaId))
    rollNext()
}

/** Pickup (docs/51): a find after the win waits for the next CONTINUE, which shows it on its own step (FindView). */
function queuePickup(events: readonly RunEvent[]) {
  const e = events.find((x) => x.kind === 'pickup')
  if (e?.kind !== 'pickup') return
  setRun({ pickup: { kind: 'item', entryId: e.entryId, itemKey: e.key, qty: e.qty, pickup: { uid: e.uid, dex: e.dex } } })
}

/** Every battle input goes through the engine reducer; rewards are settled the moment the battle ends. */
export function dispatchBattle(e: BattleEvent) {
  const { battle, save, data } = useGame.getState()
  if (!battle || !save) return
  if (e.t === 'USE_ITEM' && (save.inventory[e.key] ?? 0) <= 0) return
  const r = reduce(battle.state, e, data, battleRng)
  if (r.state === battle.state) return
  if (e.t === 'USE_ITEM' && r.log.some((l) => l.kind === 'item')) mutateSave((s) => consumeItem(s, e.key))
  useGame.setState({ battle: { ...battle, state: r.state, log: [...battle.log, ...r.log] } })
  // The reroll lesson's ATTACK: it has played, for good (a fight that ends before it carries it to the next one).
  if (r.state.lesson?.step === 'done' && battle.state.lesson?.step !== 'done') mutateSave(finishRerollLesson)
  const phase = r.state.phase
  if (phase === 'won' || phase === 'lost' || phase === 'fled') settleBattle(r.log.some((l) => l.kind === 'end' && l.reason === 'stalemate'))
}

function settleBattle(stalemate: boolean) {
  const { battle, run, data } = useGame.getState()
  const save = useGame.getState().save
  if (!battle || !save || !run.areaId) return
  const s = battle.state
  const out = battleOutcome(s)
  const withHp = applyHp(save, out.hp)

  // The Elite Rebattle: its own pay, no area, a loss (or a stalemate) starts the tier over.
  if (run.rebattle) {
    const enc = run.encounter
    if (out.result === 'won' && enc?.kind === 'gym' && run.trainer) {
      const tier = run.rebattle.tier
      const res = applyRebattleKO(
        withHp,
        {
          regionId: run.rebattle.regionId,
          tier,
          trainerId: enc.trainerId,
          index: run.trainer.index,
          last: run.trainer.index + 1 >= enc.team.length,
          enemyLevel: s.enemy.level,
          fighterUid: out.fighterUid,
        },
        data,
        runRng,
        currentLive(),
      )
      commitSave(res.save)
      const gold = res.events.reduce((g, e) => (e.kind === 'gold' ? g + e.amount : g), 0)
      if (res.events.some((e) => e.kind === 'rebattle_cleared'))
        useRebattleMedal.setState({ medal: { regionId: run.rebattle.regionId, tier, gold } })
      setRun({ phase: 'victory', events: res.events, pendingCatchId: null, catch: null, trainer: { ...run.trainer, gold: run.trainer.gold + gold } })
      return
    }
    if (out.result === 'won') return
    commitSave(applyRebattleLoss(withHp, data, run.rebattle.regionId))
    setRun({ phase: 'wipe', trainer: null, events: [] })
    return
  }

  if (s.double && out.kos) return settleDouble(withHp, out.result, out.kos, stalemate)

  if (out.result === 'won') {
    const enc = run.encounter
    const gym = enc?.kind === 'gym'
    const res = applyVictory(
      withHp,
      {
        areaId: run.areaId,
        kind: gym ? 'gym' : s.kind,
        // The species it was sent out as: a Giratina knocked out in its Origin Forme is still Giratina.
        enemyDex: s.enemy.baseDex ?? s.enemy.dex,
        enemyLevel: s.enemy.level,
        fighterUid: out.fighterUid,
        gymTrainerId: gym ? enc.trainerId : undefined,
        gymComplete: gym && !!run.trainer && run.trainer.index + 1 >= enc.team.length,
        prize: trainerPrize(enc, enc?.kind !== 'trainer' || !run.trainer || run.trainer.index + 1 >= enc.team.length),
        // A trainer's last Pokémon ends the fight (the talents that act after a win, docs/51).
        ...((enc?.kind === 'trainer' || gym) && { last: !run.trainer || run.trainer.index + 1 >= enc.team.length }),
        // A real player's team pays more for each K.O. (docs/54).
        ...(isPlayerFoe(enc) && { goldMultiplier: foeGoldMultiplier(data) }),
      },
      data,
      runRng,
      Date.now(),
      newId,
      currentLive(),
    )
    // A round of the nightmare won (docs/30): it counts, its gift goes into the bag, Darkrai's strike is due (or, the
    // last one, the player wakes up). The result card says so.
    const dream = inNightmare(res.save, data, run.areaId) ? winNightmareRound(res.save, data, run.areaId) : null
    commitSave(dream?.save ?? res.save)
    queuePickup(res.events)
    const dreamEvents: RunEvent[] = dream
      ? [
          { kind: 'nightmare_round', round: dream.round, total: dream.total },
          ...(dream.gift ? [{ kind: 'nightmare_gift' as const, ...dream.gift }] : []),
        ]
      : []
    // The round's last card was this fight: count it now, so "AREA CLEARED" is part of the rewards.
    const cleared = trainerHasNext() ? null : settleRound(true)
    // A real player's fight is over (docs/54): won once their last Pokémon falls (a mutual K.O. before it is a loss);
    // the team is healed again, the server hears of the meet, and the result card says so.
    const duel = isPlayerFoe(enc) && !trainerHasNext() ? duelOver(enc.player, !!run.trainer && run.trainer.index + 1 >= enc.team.length) : null
    const events = [...(cleared ? [...res.events, cleared] : res.events), ...dreamEvents]
    const gold = res.events.reduce((g, e) => (e.kind === 'gold' ? g + e.amount : g), 0)
    // A wild or legendary K.O. that can be caught goes to the catch throw first; the rewards screen follows it.
    const kind = s.kind === 'wild' || s.kind === 'boss' ? s.kind : null
    const foeDex = s.enemy.baseDex ?? s.enemy.dex
    // A portal run's wild Pokémon can't be caught (docs/28), nor the nightmare's (docs/30).
    const noCatch = portalNoCatch(save, data, run.areaId) || nightmareNoCatch(save, data, run.areaId)
    const talent = !!s.enemy.talent
    const target =
      kind && !noCatch ? catchTarget(res.save, foeDex, s.enemy.level, kind, data, s.enemy.shiny, run.areaId, talent) : null
    const bonus = catchTalentBonus(data, getInstance(res.save, out.fighterUid))
    setRun({
      phase: target ? 'catch' : 'victory',
      events,
      pendingCatchId: null,
      catch:
        target && kind
          ? { dex: foeDex, level: s.enemy.level, shiny: s.enemy.shiny, kind, target, result: null, ...(talent && { talent }), ...(bonus && { bonus }) }
          : null,
      catchQueue: [],
      catchPending: [],
      trainer: run.trainer ? { ...run.trainer, gold: run.trainer.gold + gold } : null,
      duel,
    })
    return
  }
  // Lost to a real player's team, or neither side could win (docs/54): no wipe, the team healed, the round goes on.
  if (isPlayerFoe(run.encounter)) {
    commitSave(withHp)
    setRun({ phase: 'stalemate', trainer: null, events: [], duel: duelOver(run.encounter.player, false) })
    return
  }
  if (out.result === 'lost') {
    const lost = inPortalRun(withHp, data, run.areaId) ? portalStateOf(withHp, run.areaId).closed : null
    const dream = inNightmare(withHp, data, run.areaId) ? nightmareStateOf(withHp, run.areaId).round : null
    commitSave(applyWipe(withHp, run.areaId, data))
    setRun({ phase: 'wipe', trainer: null, events: [], portalLost: lost, nightmareLost: dream })
    return
  }
  // fled / stalemate: damage is kept, no rewards
  commitSave(withHp)
  if (stalemate) {
    setRun({ phase: 'stalemate', trainer: null })
    return
  }
  useGame.setState({ battle: null })
  setRun({ trainer: null })
  pushToast(t('ui.toast.gotAway'))
  rollNext()
}

/**
 * A double battle is over (docs/33): every foe K.O.'d pays like a one-on-one K.O. — the XP in full to each of yours
 * that was out, a trainer's Pokédollars — whatever the end, as each K.O. of a trainer's one-by-one gauntlet is kept.
 * Won, each wild one that can be caught gets its throw, one after the other, before the rewards.
 */
function settleDouble(save: SaveData, result: 'won' | 'lost' | 'fled' | 'ongoing', kos: DoubleKo[], stalemate: boolean) {
  const { run, data, battle } = useGame.getState()
  if (!run.areaId || !battle) return
  const enc = run.encounter
  const gym = enc?.kind === 'gym'
  const kind = battle.state.kind
  let next = save
  let events: RunEvent[] = []
  let gold = 0
  kos.forEach((ko, i) => {
    const res = applyVictory(
      next,
      {
        areaId: run.areaId!,
        kind: gym ? 'gym' : kind,
        enemyDex: ko.dex,
        enemyLevel: ko.level,
        fighterUid: ko.fighters[0] ?? '',
        fighterUids: ko.fighters,
        gymTrainerId: gym ? enc.trainerId : undefined,
        gymComplete: gym && result === 'won' && i === kos.length - 1,
        prize: trainerPrize(enc, result === 'won' && i === kos.length - 1),
        // The fight's last K.O.: the talents that act after a win act once (docs/51).
        last: result === 'won' && i === kos.length - 1,
      },
      data,
      runRng,
      Date.now(),
      newId,
      currentLive(),
    )
    next = res.save
    events = [...events, ...res.events]
    gold += res.events.reduce((g, e) => (e.kind === 'gold' ? g + e.amount : g), 0)
  })
  if (result === 'lost') {
    commitSave(applyWipe(next, run.areaId, data))
    setRun({ phase: 'wipe', trainer: null, events: [], portalLost: null, nightmareLost: null })
    return
  }
  if (result !== 'won') {
    commitSave(next)
    if (gold > 0) pushToast(t('ui.toast.trainerBeaten', { gold }), 'good')
    if (stalemate) {
      setRun({ phase: 'stalemate', trainer: null })
      return
    }
    useGame.setState({ battle: null })
    setRun({ trainer: null })
    pushToast(t('ui.toast.gotAway'))
    rollNext()
    return
  }
  commitSave(next)
  queuePickup(events)
  const cleared = settleRound(true)
  if (cleared) events = [...events, cleared]
  const catchKind = kind === 'wild' || kind === 'boss' ? kind : null
  const catches: CatchState[] = catchKind
    ? kos.flatMap((ko) => {
        const target = catchTarget(next, ko.dex, ko.level, catchKind, data, ko.shiny, run.areaId!, !!ko.talent)
        const bonus = Math.max(0, ...ko.fighters.map((uid) => catchTalentBonus(data, getInstance(next, uid))))
        return target
          ? [{ uid: ko.uid, dex: ko.dex, level: ko.level, shiny: ko.shiny, kind: catchKind, target, result: null, ...(ko.talent && { talent: true }), ...(bonus && { bonus }) }]
          : []
      })
    : []
  setRun({
    phase: catches.length ? 'catch' : 'victory',
    events,
    pendingCatchId: null,
    catch: catches[0] ?? null,
    catchQueue: catches.slice(1),
    catchPending: [],
    trainer: run.trainer ? { ...run.trainer, gold: run.trainer.gold + gold } : null,
  })
}

/**
 * Throw the catch die, with one ball from the bag (or none). The result waits in run.catch until finishCatch(). A throw
 * that falls short while the bag holds a Bait that could still make it waits for answerBait() (docs/25).
 */
export function throwBall(ballKey: string | null) {
  const { run, save, data } = useGame.getState()
  const c = run.catch
  if (!c || c.result || !save) return
  const ball = ballKey ? data.items[ballKey] : undefined
  if (ballKey && (!ball || !isBallFor(ball, false) || (save.inventory[ballKey] ?? 0) <= 0)) return
  const next = ballKey ? (consumeItem(save, ballKey) ?? save) : save
  const roll = rollCatch(catchValueOf(data, c.dex), ballBonus(ball) + (c.bonus ?? 0), runRng)
  const bait = baitFor(roll, next, data)
  if (bait) {
    commitSave(next)
    setRun({ catch: { ...c, result: { ...roll, ballKey, events: [], pendingCatchId: null, baitOffer: bait } } })
    return
  }
  settleThrow(next, roll, ballKey)
}

/** The player's answer to the Bait: thrown, its die adds to the throw; or kept, and the throw stands as it fell. */
export function answerBait(use: boolean) {
  const { run, save, data } = useGame.getState()
  const r = run.catch?.result
  if (!save || !r?.baitOffer) return
  const spent = use ? consumeItem(save, r.baitOffer) : null
  const { ballKey, events: _e, pendingCatchId: _p, baitOffer, stays: _s, baited: _b, ...roll } = r
  const thrown = spent ? rollBait(roll, baitFaces(data.items[baitOffer]), runRng) : roll
  settleThrow(spent ?? save, thrown, ballKey, spent ? 'used' : 'kept')
}

/**
 * The throw's outcome: caught, or it flees — unless Capture Luck keeps a wild one on the spot for one more throw
 * (docs/25), once per encounter.
 */
function settleThrow(save: SaveData, roll: CatchRoll, ballKey: string | null, baited?: 'used' | 'kept') {
  const { run, data } = useGame.getState()
  const c = run.catch
  if (!c) return
  let next = save
  let events: RunEvent[] = [{ kind: 'fled', dex: c.dex }]
  let pendingCatchId: string | null = null
  let stays = false
  if (!roll.caught) {
    stays = runRng.next() < captureLuck(next, data, c.kind, !!c.retried)
    if (stays) events = []
  } else {
    // A small world's shiny mythical leaves the world at once, for its home region's Box (docs/21).
    const mythical = run.areaId ? catchWorldMythical(next, data, run.areaId, { dex: c.dex, level: c.level }, Date.now(), newId) : null
    if (mythical) {
      next = mythical.save
      events = mythical.events
    } else {
      // An Unown's letter is drawn as it's caught (docs/41): one the page is missing.
      const letter = c.dex === UNOWN_DEX ? unownLetterFor(next, runRng) : undefined
      // The Friend Ball (docs/59): more chances of its hidden talent, by the player's best friendship streak.
      const talent = isTalentBall(ballKey ? data.items[ballKey] : undefined)
        ? friendBallTalent(data, c.dex, !!c.talent, friendBallBoostNow(), runRng)
        : c.talent
      const res = applyCatch(next, { dex: c.dex, level: c.level, shiny: c.shiny, letter, talent }, c.target, data, Date.now(), newId)
      // A boss is noted as caught in its area: a small world's goes by that, not the Pokédex (docs/26 §2.5).
      next = c.kind === 'boss' && run.areaId ? noteBossCaught(res.save, run.areaId, c.dex) : res.save
      events = res.events
      if (res.needsTeamChoice) pendingCatchId = res.caughtId
    }
  }
  commitSave(next)
  setRun({ catch: { ...c, result: { ...roll, ballKey, events, pendingCatchId, ...(baited && { baited }), ...(stays && { stays }) } } })
}

/** It broke free but stayed (Capture Luck): back to the ball picker for the second throw. */
export function retryCatch() {
  const c = useGame.getState().run.catch
  if (!c?.result?.stays) return
  setRun({ catch: { ...c, retried: true, result: null } })
}

/**
 * Leave the throw for the rewards screen, which now lists the catch (or the flight) too — or, after a wild double
 * battle, for the other one's throw first (docs/33): the throws follow one another, and each "Add to team?" waits for
 * the rewards screen, in the order they were caught.
 */
export function finishCatch() {
  const { run } = useGame.getState()
  const r = run.catch?.result
  if (!r || r.baitOffer || r.stays) return
  afterCatch([...run.events, ...r.events], r.pendingCatchId)
}

/**
 * No throw at all (Idle's rule, docs/36: a Pokémon already owned, or no ball that could catch it): on as after a catch
 * not on offer — the other one's throw after a wild pair, else the rewards screen, nothing added to it.
 */
export function passCatch() {
  const { run } = useGame.getState()
  if (!run.catch || run.catch.result) return
  afterCatch(run.events, null)
}

/** Out of this throw: the next one queued (after a wild pair), else the rewards screen with every "Add to team?". */
function afterCatch(events: RunEvent[], caughtId: string | null) {
  const { run, save, data } = useGame.getState()
  const pending = [...(run.catchPending ?? []), ...(caughtId ? [caughtId] : [])]
  // The next throw's target as the save stands now, not as it stood before the first: a pair of one species, the first
  // just caught, leaves the second replacing it if stronger, else not on offer, as in a single wild battle. A second
  // copy taken as new would be let go at once (one copy per species), its "Add to team?" asking about nobody.
  const queue = (run.catchQueue ?? []).flatMap((c) => {
    if (!save) return [c]
    const target = catchTarget(save, c.dex, c.level, c.kind, data, c.shiny, run.areaId ?? save.currentAreaId, !!c.talent)
    return target ? [{ ...c, target }] : []
  })
  const [next, ...rest] = queue
  if (next) {
    setRun({ events, catch: next, catchQueue: rest, catchPending: pending })
    return
  }
  const [first = null, ...later] = pending
  setRun({ phase: 'victory', events, pendingCatchId: first, catchPending: later, catch: null })
}

/** The trainer still has Pokémon left after this victory? */
/**
 * Is there another Pokémon in this trainer's team to face? Not if nobody can face it: a mutual K.O. — the last team
 * member fainting as it wins — ends the gauntlet there, rather than sending out nobody.
 */
export function trainerHasNext(): boolean {
  const { run, save, data } = useGame.getState()
  const enc = run.encounter
  if (!run.trainer || (enc?.kind !== 'trainer' && enc?.kind !== 'gym') || run.trainer.index + 1 >= enc.team.length) return false
  return !!save && teamOf(save).some((p) => p.currentHp > 0 && data.species[p.dex])
}

/** Leave the victory screen: next trainer Pokémon (with a freely chosen lead) or back to the area. */
export function continueAfterVictory(leadUid?: string) {
  const { run } = useGame.getState()
  if (run.pendingCatchId) return
  if (trainerHasNext() && (run.encounter?.kind === 'trainer' || run.encounter?.kind === 'gym') && run.trainer) {
    const index = run.trainer.index + 1
    setRun({ trainer: { ...run.trainer, index }, events: [] })
    startBattle('trainer', run.encounter.team[index]!, leadUid)
    return
  }
  if (run.trainer && run.trainer.gold > 0) pushToast(t('ui.toast.trainerBeaten', { gold: run.trainer.gold }), 'good')
  useGame.setState({ battle: null })
  setRun({ events: [], trainer: null })
  // The rebattle has no area to go back to: the caller starts the next fight or leaves for the rebattle page.
  if (run.rebattle) return
  backToArea()
}

/**
 * A victory's result card left open behind the player (the back gesture went Home from under it): the fight is over,
 * so the card closes as its HOME does — a catch waiting on "Add to team?" goes to the Box, as CONTINUE sends it — and
 * the player can travel again (the next area the fight opened included). Not between a trainer's Pokémon (the fight
 * goes on), nor in an Elite Rebattle or a run that holds the player in its area (portal, nightmare): those go back to
 * their page. True when the run is free again.
 */
export function closeVictoryLeftOpen(): boolean {
  const { save, data, run } = useGame.getState()
  if (run.phase !== 'victory' || run.rebattle || trainerHasNext()) return false
  if (save && (portalLock(save, data) ?? nightmareLock(save, data))) return false
  while (useGame.getState().run.pendingCatchId) resolveCatch(null)
  continueAfterVictory()
  return useGame.getState().run.phase === 'idle'
}

/**
 * CONTINUE on a result card: what Home's CONTINUE would start next (a waiting gym or legendary first), without
 * the trip Home. Call it once the battle is closed (continueAfterVictory).
 */
export function continueExploring() {
  // A portal run just won (its last distortion turned over on the way back): its victory shows first, nothing else.
  const { save, run } = useGame.getState()
  if (save && run.areaId && portalStateOf(save, run.areaId).won && !portalStateOf(save, run.areaId).wonSeen) return
  // The nightmare (docs/30): the waking shows first, or Darkrai's strike after a round; the area's page plays them.
  const dream = save && run.areaId ? nightmareStateOf(save, run.areaId) : null
  if (dream && ((dream.won && !dream.wonSeen) || (dream.active && dream.strike))) return
  challenge()
  if (useGame.getState().run.phase === 'idle') rollNext()
}

/** "Add to team?" — swap the new catch in for `replaceId`, or send it to the Box (null). */
export function resolveCatch(replaceId: string | null) {
  const { run, data } = useGame.getState()
  if (!run.pendingCatchId) return
  if (replaceId) mutateSave((s) => swapIntoTeam(s, run.pendingCatchId!, replaceId, data))
  // After a wild double battle, the other catch's question comes next (docs/33).
  const [next = null, ...rest] = run.catchPending ?? []
  setRun({ pendingCatchId: next, catchPending: rest })
}

/**
 * Give up the fight: the whole team is K.O., which loses the round like any wipe. In battle it goes through the
 * reducer; between a trainer's Pokémon (the battle already won, the next one not started) it wipes straight away.
 */
export function forfeit() {
  const { battle, run, save, data } = useGame.getState()
  if (!save || !run.areaId) return
  if (run.phase === 'battle' && battle) {
    dispatchBattle({ t: 'FORFEIT' })
    return
  }
  if (run.phase !== 'victory' || !trainerHasNext()) return
  // Giving up a real player's fight is a loss, not a wipe (docs/54).
  if (isPlayerFoe(run.encounter)) {
    setRun({ phase: 'stalemate', trainer: null, events: [], duel: duelOver(run.encounter.player, false) })
    return
  }
  const lost = inPortalRun(save, data, run.areaId) ? portalStateOf(save, run.areaId).closed : null
  const dream = inNightmare(save, data, run.areaId) ? nightmareStateOf(save, run.areaId).round : null
  commitSave(run.rebattle ? applyRebattleLoss(save, data, run.rebattle.regionId) : applyWipe(save, run.areaId, data))
  setRun({ phase: 'wipe', trainer: null, events: [], portalLost: lost, nightmareLost: dream })
}

/** After a full K.O. the run is over: Home (where CONTINUE starts the area afresh), or the rebattle page. */
export function afterWipe() {
  useGame.setState((s) =>
    s.run.rebattle
      ? { battle: null, run: { ...initialRun(), rebattle: s.run.rebattle } }
      : { battle: null, run: { ...initialRun(), forceNext: s.run.forceNext } },
  )
}

/**
 * The end of a real player's fight (docs/54): the team is healed (it was before the fight too), the server hears of
 * the meet, and the area gets its next team. What the result card shows.
 */
function duelOver(foe: AreaFoe, won: boolean | null): NonNullable<RunState['duel']> {
  const { save, data, run } = useGame.getState()
  if (save) commitSave(centerHeal(save, data))
  const outcome = won ? 'won' : 'lost'
  if (run.areaId) noteMeet(foe, run.areaId, outcome)
  return { outcome, foe }
}

export function afterStalemate() {
  useGame.setState({ battle: null })
  backToArea()
}

export function finishCenter() {
  backToArea()
}

/**
 * The player takes one of the Center's boons (docs/47): `target` names who a full heal or Team Rocket's trade is for.
 * Null when it can't be taken (nothing on offer, a target it can't go to).
 */
export function pickBoon(index: number, target: string | null = null): BoonPicked | null {
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId) return null
  const res = pickCenterBoon(save, data, run.areaId, index, target, runRng, serverNow() ?? Date.now(), newId, wildShinyChance(save, data))
  if (!res) return null
  commitSave(res.save)
  return res
}

/** The Centers' rules pop-up has been shown (docs/47). */
export function seeCenterRules() {
  const { save } = useGame.getState()
  if (save && !save.extreme?.centerRulesSeen) commitSave(markCenterRulesSeen(save))
}

/** The healing has started playing: leaving for Home and coming back won't play it again. */
export function markHealShown() {
  if (useGame.getState().run.phase === 'center') setRun({ healShown: true })
}

/** One pull of the Game Corner slot machine; null (and a toast) when the player can't pay for it. */
export function spinSlotMachine(): SpinResult | null {
  const { save, data, run } = useGame.getState()
  if (!save || run.phase !== 'casino') return null
  const res = spinSlots(save, data, runRng, Date.now(), newId, currentLive())
  if (!res) {
    pushToast(t('ui.toast.tooPoor'), 'bad')
    return null
  }
  commitSave(res.save)
  return res
}

export function leaveCasino() {
  backToArea()
}

// ---------------------------------------------------------------- Trick or Treat (docs/29)

/**
 * The ghost comes out once the server agrees (a signed-in player: trick_or_treat_open). Switched off meanwhile, the
 * card is spent and the player is back on the trail. Either way the card was used when it was turned over.
 */
async function beginTrick(enc: Extract<NonNullable<RunState['encounter']>, { kind: 'trick' }>) {
  const ok = await trickAllowed()
  const run = useGame.getState().run
  if (run.phase !== 'preview' || run.encounter !== enc) return
  if (!ok) {
    pushToast(t('ui.trick.closed'), 'bad')
    backToArea()
    return
  }
  setRun({ phase: 'trick', trick: { id: ++trickSeq, state: startTrick(enc, trickCfg(useGame.getState().data), runRng), last: null, caught: null } })
}

/** One step of Trick or Treat, decided by the engine; a catch goes into the save at once. */
function trickStep(step: (cfg: ReturnType<typeof trickCfg>) => TrickStep | null): TrickStep | null {
  const { run, save, data } = useGame.getState()
  const tr = run.trick
  if (run.phase !== 'trick' || !tr || tr.state.end || !save) return null
  const res = step(trickCfg(data))
  if (!res) return null
  let caught = tr.caught
  if (res.caught) {
    const c = applyTrickCatch(save, data, res.state, Date.now(), newId)
    commitSave(c.save)
    caught = {
      placed: c.placed,
      isNew: c.isNew,
      ...(c.replacedLevel != null && { replacedLevel: c.replacedLevel }),
      secrets: c.events.flatMap((e) => (e.kind === 'secret_unlocked' ? [e.areaId] : [])),
    }
  }
  setRun({ trick: { ...tr, state: res.state, last: res, caught } })
  return res
}

/** TREAT: the gauge fills by the Treat's random amount. */
export function giveTreat(): TrickStep | null {
  return trickStep((cfg) => feedTreat(useGame.getState().run.trick!.state, cfg, runRng))
}

/** TRICK BALL: the d6 against the gauge's section. */
export function throwTrickBall(): TrickStep | null {
  return trickStep((cfg) => throwTrickBallIn(useGame.getState().run.trick!.state, cfg, runRng))
}

/** FLEE: the ghost left be, straight back on the trail (no result card: the player chose to skip it). */
export function fleeTrick() {
  const { run } = useGame.getState()
  const tr = run.trick
  if (run.phase !== 'trick' || !tr) return
  const state = fleeTrickIn(tr.state)
  if (!state) return
  setRun({ trick: { ...tr, state, last: null } })
  leaveTrick()
  pushToast(t('ui.toast.gotAway'))
}

/** Caught or fled: back on the trail (the round may be complete). */
export function leaveTrick() {
  const tr = useGame.getState().run.trick
  if (tr && !tr.state.end) return
  setRun({ trick: null })
  backToArea()
}

// ---------------------------------------------------------------- the Gift card (docs/61 §4.0, §4.2)

/** A present waiting on the server's answer: a second tap doesn't ask twice. */
let giftAsking = false

/**
 * The present appears once the server agrees (a signed-in player: gift_card_open), its rewards drawn. Switched off
 * meanwhile, the card is spent and the player is back on the trail. Either way the card was used when it was turned
 * over.
 */
async function beginGift(enc: Extract<NonNullable<RunState['encounter']>, { kind: 'gift' }>) {
  if (giftAsking) return
  giftAsking = true
  const ok = await giftAllowed().finally(() => (giftAsking = false))
  const { run, save, data } = useGame.getState()
  if (run.phase !== 'preview' || run.encounter !== enc || !save) return
  const area = data.areas.find((a) => a.id === run.areaId)
  if (!ok || !area) {
    pushToast(t('ui.giftCard.closed'), 'bad')
    backToArea()
    return
  }
  setRun({
    phase: 'gift',
    gift: { id: ++giftSeq, state: startGift(save, area, data, runRng), last: null, got: null, out: null },
  })
}

/**
 * CHALLENGE on a boss that comes out of a present: the present at once (the page follows the phase), then the server's
 * word; said no (or not reachable), the plain fight instead, the boss as it always came. The present changes only how
 * the boss comes out, so nothing waits on the answer.
 */
async function beginBossPresent(enc: Extract<Encounter, { kind: 'boss' }>) {
  const { data } = useGame.getState()
  const id = ++giftSeq
  setRun({
    phase: 'gift',
    encounter: enc,
    firstInArea: false,
    skipsUsed: 0,
    gift: { id, state: startBossPresent(giftCfg(data), enc), last: null, got: null, out: enc },
  })
  if (await giftAllowed()) return
  const { run } = useGame.getState()
  if (run.phase !== 'gift' || run.gift?.id !== id) return
  setRun({ phase: 'preview', encounter: enc, gift: null })
  beginFight()
}

/**
 * MAKE IT BIGGER: the engine grows the present a level, or breaks it (a wild Pokémon of the area comes out, drawn now
 * so the screen can show it), or bursts a boss's on its last tap. Null when nothing happened.
 */
export function growPresent(): GiftStep | null {
  const { run, save, data } = useGame.getState()
  const g = run.gift
  if (run.phase !== 'gift' || !g || g.state.end || !save || !run.areaId) return null
  const step = growGift(g.state, giftCfg(data), runRng)
  if (!step) return null
  let out = g.out
  if (step.broke) {
    const ctx = encounterContext(save, run.areaId, null)
    out = ctx ? rollGiftWild(ctx, runRng) : null
  }
  setRun({ gift: { ...g, state: step.state, last: step, out } })
  return step
}

/** OPEN: the level's reward goes into the bag at once; the result card says what it was. */
export function openPresent(): GiftItem[] | null {
  const { run, save, data } = useGame.getState()
  const g = run.gift
  if (run.phase !== 'gift' || !g || !save || !run.areaId) return null
  const opened = openGift(g.state)
  if (!opened) return null
  const res = applyGiftOpen(save, data, run.areaId, opened, Date.now(), newId, currentLive())
  commitSave(res.save)
  setRun({ gift: { ...g, state: opened, last: null, got: res.items } })
  return res.items
}

/**
 * The present broke (or burst) and what came out has had its moment: the fight, as a wild Pokémon's (or the boss's)
 * always is, caught as any. Nothing came out (an area with no wild Pokémon left): back on the trail.
 */
export function fightFromPresent() {
  const { run } = useGame.getState()
  const g = run.gift
  if (run.phase !== 'gift' || !g || (g.state.end !== 'broken' && g.state.end !== 'burst')) return
  if (!g.out) return leavePresent()
  setRun({ phase: 'preview', encounter: g.out, gift: null, firstInArea: false, skipsUsed: 0 })
  beginFight()
}

/** Opened (or nothing came out): back on the trail (the round may be complete). */
export function leavePresent() {
  const g = useGame.getState().run.gift
  if (g && !g.state.end) return
  setRun({ gift: null })
  backToArea()
}

export function setForceNext(kind: ForceKind | null) {
  setRun({ forceNext: kind })
}

export function replaceSave(save: SaveData) {
  commitSave(save)
  useGame.setState({ run: initialRun(), battle: null })
}

export const rewardEvents = (): RunEvent[] => useGame.getState().run.events
