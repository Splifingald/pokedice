// Run flow: map → area → encounter preview → battle → rewards → next. Thin glue over the pure engine.
import {
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
  battleOutcome,
  canSkip,
  catchTarget,
  catchValueOf,
  centerHeal,
  centersOn,
  centerWouldHelp,
  challengeEncounter,
  centerIsNext,
  encounterEnergyCost,
  finishRound,
  energyNow,
  spendEnergy,
  type EncounterContext,
  playerSideOf,
  consumeItem,
  earnedGold,
  MONEY,
  pickUpItem,
  shinyBoost,
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
  isAreaUnlocked,
  isTeamHurt,
  megaUnlocked,
  gmaxUnlocked,
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
  uniformLevels,
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
  startTrick,
  throwTrickBall as throwTrickBallIn,
  trickCfg,
  type TrickStep,
  type ProgressRaid,
} from '@/engine'
import { activeSlot } from '@/save/storage'
import { commitSave, initialRun, mutateSave, pushToast, useGame, type RunState } from './game'
import { currentLive } from './live'
import { useRebattleMedal } from './rebattle'
import { serverNow } from './serverTime'
import { trickAllowed } from './trick'
import { t } from '@/i18n'
import { money } from '@/lib/format'

let runRng = createRng(randomSeed())
let battleRng = createRng(randomSeed())
let battleSeq = 0
let trickSeq = 0

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
  setRun({ phase: 'idle', encounter: null })
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
    isFirstInArea: run.firstInArea,
    pokedex: save.pokedex,
    forceKind,
    centerUseful: centerWouldHelp(save, data),
    player: playerSideOf(save),
    noCenters: !centersOn(save, data),
    // A Shiny Parade covering this area: wild Pokémon are more often shiny.
    shinyBoost: shinyBoost(currentLive(), area),
  }
}

/**
 * The next encounter (CONTINUE) needs energy, unless what comes next is free anyway (a Pokémon Center, or nobody can fight).
 * False when the energy system is off.
 */
export function outOfEnergy(): boolean {
  const { save, data, run } = useGame.getState()
  if (!save || !data.config.energy.enabled || energyNow(save, data.config.energy, Date.now()).value >= 1) return false
  if (!hasAbleTeam(save) || !run.areaId) return false
  // A portal run deals no Center: only a distortion waiting to be picked is free.
  if (inPortalRun(save, data, run.areaId)) return !portalStateOf(save, run.areaId).offers?.length
  // Nor does the nightmare (docs/30): only Darkrai's strike, due after a round, is free.
  if (inNightmare(save, data, run.areaId)) return !nightmareStateOf(save, run.areaId).strike
  const ctx = encounterContext(save, run.areaId, null)
  return !ctx || !centerIsNext(ctx)
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
  let recorded = recordDraws(drawn.save, areaId, { encounter: roll.encounter, deck: null, lootDeck: roll.lootDeck })
  const cost = data.config.energy.enabled ? encounterEnergyCost(roll.encounter) : 0
  if (cost > 0) recorded = spendEnergy(recorded, data.config.energy, Date.now(), cost) ?? recorded
  commitSave(recorded)
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
  const cost = data.config.energy.enabled ? encounterEnergyCost(encounter) : 0
  if (cost > 0) commitSave(spendEnergy(save, data.config.energy, Date.now(), cost) ?? save)
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
  if (inNightmare(save, data, run.areaId)) {
    if (outOfEnergy()) {
      setRun({ phase: 'idle', encounter: null })
      pushToast(t('ui.toast.outOfEnergy'), 'bad')
      return
    }
    return rollNightmare(save, run.areaId)
  }
  if (inPortalRun(save, data, run.areaId)) {
    if (outOfEnergy()) {
      setRun({ phase: 'idle', encounter: null })
      pushToast(t('ui.toast.outOfEnergy'), 'bad')
      return
    }
    return rollPortal(save, run.areaId)
  }
  if (outOfEnergy()) {
    setRun({ phase: 'idle', encounter: null })
    pushToast(t('ui.toast.outOfEnergy'), 'bad')
    return
  }
  // Nobody able to fight (e.g. after a stalemate) → the Center is the only sensible next stop. Extreme mode has none:
  // the team rests (Home and the area say until when).
  const noneAble = !hasAbleTeam(save)
  if (noneAble && !centersOn(save, data)) {
    setRun({ phase: 'idle', encounter: null })
    pushToast(t('ui.extreme.restingToast'), 'bad')
    return
  }
  const forceKind = noneAble ? 'center' : run.forceNext
  const ctx = encounterContext(save, run.areaId, forceKind)
  if (!ctx) return
  const area = ctx.area
  const roll = nextEncounter(ctx, runRng)
  const encounter = roll.encounter
  // The decks live in the save, so reloading the page can't reshuffle them.
  // Always recorded: besides the decks, the area notes whether this was a Center (never two in a row).
  let recorded = recordDraws(save, area.id, roll)
  const cost = data.config.energy.enabled && !noneAble ? encounterEnergyCost(encounter) : 0
  if (cost > 0) recorded = spendEnergy(recorded, data.config.energy, Date.now(), cost) ?? recorded
  if (recorded !== save) commitSave(recorded)
  setRun({ phase: 'preview', encounter, firstInArea: false, forceNext: forceKind === run.forceNext ? null : run.forceNext })
  // A Pokémon Center is never a choice (no skipping it, nothing to pick): straight in, no preview card.
  if (encounter.kind === 'center') engage()
}

/** CHALLENGE: bring on the gym battle (or legendary) waiting at the full gauge — only when the player chooses to. */
export function challenge() {
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId || run.phase !== 'idle') return
  // A portal run has no challenge: its cards come one after the other (docs/28); nor has the nightmare (docs/30).
  if (inPortalRun(save, data, run.areaId) || inNightmare(save, data, run.areaId)) return
  const area = data.areas.find((a) => a.id === run.areaId)
  const encounter = area ? challengeEncounter(area, progressOf(save, area.id), data, teamAverageLevel(save), playerSideOf(save), runRng) : null
  if (encounter) setRun({ phase: 'preview', encounter, firstInArea: false, skipsUsed: 0 })
}

/** NOT YET: back out of a challenge you picked. Nothing is used up; the gauge stays full. */
export function declineChallenge() {
  setRun({ phase: 'idle', encounter: null })
  // A rebattle fight put off: the run ends here (the Area screen sends an idle rebattle run to its page).
  if (useGame.getState().run.rebattle) setRun({ areaId: null })
}

export function canSkipCurrent(): boolean {
  const { run, data } = useGame.getState()
  return !!run.encounter && !data.config.noEscape && canSkip(run.encounter, data.config.skipPolicy, run.skipsUsed)
}

/** FLEE / AVOID: back to the area screen (heal, check the team…); the next encounter waits for CONTINUE. */
export function skipEncounter() {
  if (!canSkipCurrent()) return
  const { run } = useGame.getState()
  const trainer = run.encounter?.kind === 'trainer'
  // skipsUsed survives until a fight is engaged, so skipPolicy 'once' still allows one skip in a row.
  setRun({ skipsUsed: run.skipsUsed + 1 })
  backToArea()
  pushToast(t(trainer ? 'ui.toast.slippedPast' : 'ui.toast.gotAway'))
}

function startBattle(kind: BattleKind, enemy: { dex: number; level: number; shiny?: boolean; item?: string }, leadUid?: string) {
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
    nickname: p.nickname,
    // A portal run's extra dice (docs/28).
    ...portalDiceFor(save, data, run.areaId, p.id),
  }))
  // Auto-mode (a cleared area) fights without Mega Evolution or Gigantamax, on both sides; type changers (Arceus…) on
  // both sides take a better type by themselves.
  const auto = !!useGame.getState().settings.autoMode && !!run.areaId && progressOf(save, run.areaId).cleared
  // A trainer's ace — its strongest, the last of them if several — may Mega Evolve or Gigantamax (see enemyPlanFor).
  const enc = run.encounter
  const trainer =
    kind === 'trainer' && run.trainer && (enc?.kind === 'trainer' || enc?.kind === 'gym')
      ? (() => {
          const levels = enc.team.map((m) => m.level)
          return {
            regionId: area ? regionOfArea(area) : regionOf(save),
            role: enc.kind === 'gym' ? enc.role : (data.trainers[enc.trainerId]?.role ?? 'trainer'),
            ace: run.trainer.index === levels.lastIndexOf(Math.max(...levels)),
          }
        })()
      : null
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
      enemyLevels: withWorldBoost(uniformLevels(upgradeLevel), data, area),
      megaAllowed: megaUnlocked(save, data),
      gmaxAllowed: gmaxUnlocked(save, data),
      noHealItems: !healItemsOn(save, data),
      // Arceus takes only the types of its plates while the Underground is on (docs/31).
      plates: plateTypes(save, data),
      enemyPlan: enemyPlanFor(save, data, enemy, trainer),
      auto,
    },
    data,
  )
  useGame.setState((s) => ({ battle: { state, log, id: ++battleSeq }, run: { ...s.run, phase: 'battle' } }))
}

/** ENGAGE the previewed encounter (with the chosen lead for fights). */
export function engage(leadUid?: string) {
  const { run, save, data } = useGame.getState()
  const enc = run.encounter
  if (!enc || !save) return
  setRun({ skipsUsed: 0 })
  // A challenge (gym, legendary) skipped the deck: note it as the area's latest encounter once it's actually fought.
  if (run.areaId && (enc.kind === 'gym' || enc.kind === 'boss')) {
    const recorded = recordDraws(save, run.areaId, { encounter: enc, deck: null })
    if (recorded !== save) commitSave(recorded)
  }
  switch (enc.kind) {
    case 'center':
      commitSave(centerHeal(save, data))
      setRun({ phase: 'center', healShown: false })
      return
    case 'casino':
      setRun({ phase: 'casino' })
      return
    case 'trick':
      void beginTrick(enc)
      return
    case 'wild':
      return startBattle('wild', { dex: enc.dex, level: enc.level, shiny: enc.shiny }, leadUid)
    case 'boss':
      return startBattle('boss', { dex: enc.dex, level: enc.level, shiny: enc.shiny }, leadUid)
    case 'trainer':
    case 'gym': {
      const first = enc.team[0]
      if (!first) return
      setRun({ trainer: { index: 0, gold: 0 } })
      return startBattle('trainer', first, leadUid)
    }
    case 'item': {
      if (!run.areaId) return
      const live = currentLive()
      commitSave(pickUpItem(save, run.areaId, enc, data, Date.now(), newId, live))
      const item = data.items[enc.itemKey]
      const what = enc.itemKey === MONEY ? money(earnedGold(enc.qty, live).amount) : `${item?.name ?? enc.itemKey}${enc.qty > 1 ? ` ×${enc.qty}` : ''}`
      if (item?.effect.kind === 'fossil')
        pushToast(
          t('ui.toast.foundFossil', {
            item: item.name,
            name: data.species[item.effect.dex]?.name ?? t('ui.toast.itsPokemon'),
            hours: item.effect.hours,
          }),
          'good',
          6000,
        )
      else pushToast(t('ui.toast.found', { what }), 'good')
      backToArea()
      return
    }
  }
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
    const dreamEvents: RunEvent[] = dream
      ? [
          { kind: 'nightmare_round', round: dream.round, total: dream.total },
          ...(dream.gift ? [{ kind: 'nightmare_gift' as const, ...dream.gift }] : []),
        ]
      : []
    // The round's last card was this fight: count it now, so "AREA CLEARED" is part of the rewards.
    const cleared = trainerHasNext() ? null : settleRound(true)
    const events = [...(cleared ? [...res.events, cleared] : res.events), ...dreamEvents]
    const gold = res.events.reduce((g, e) => (e.kind === 'gold' ? g + e.amount : g), 0)
    // A wild or legendary K.O. that can be caught goes to the catch throw first; the rewards screen follows it.
    const kind = s.kind === 'wild' || s.kind === 'boss' ? s.kind : null
    const foeDex = s.enemy.baseDex ?? s.enemy.dex
    // A portal run's wild Pokémon can't be caught (docs/28), nor the nightmare's (docs/30).
    const noCatch = portalNoCatch(save, data, run.areaId) || nightmareNoCatch(save, data, run.areaId)
    const target = kind && !noCatch ? catchTarget(res.save, foeDex, s.enemy.level, kind, data, s.enemy.shiny) : null
    setRun({
      phase: target ? 'catch' : 'victory',
      events,
      pendingCatchId: null,
      catch: target && kind ? { dex: foeDex, level: s.enemy.level, shiny: s.enemy.shiny, kind, target, result: null } : null,
      trainer: run.trainer ? { ...run.trainer, gold: run.trainer.gold + gold } : null,
    })
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
 * Throw the catch die, with one ball from the bag (or none). The result waits in run.catch until finishCatch(). A throw
 * that falls short while the bag holds a Bait that could still make it waits for answerBait() (docs/25).
 */
export function throwBall(ballKey: string | null) {
  const { run, save, data } = useGame.getState()
  const c = run.catch
  if (!c || c.result || !save) return
  const ball = ballKey ? data.items[ballKey] : undefined
  if (ballKey && (!ball || ball.effect.kind !== 'ball' || (save.inventory[ballKey] ?? 0) <= 0)) return
  const next = ballKey ? (consumeItem(save, ballKey) ?? save) : save
  const roll = rollCatch(catchValueOf(data, c.dex), ballBonus(ball), runRng)
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
      const res = applyCatch(next, { dex: c.dex, level: c.level, shiny: c.shiny }, c.target, data, Date.now(), newId)
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

/** Leave the throw for the rewards screen, which now lists the catch (or the flight) too. */
export function finishCatch() {
  const { run } = useGame.getState()
  const r = run.catch?.result
  if (!r || r.baitOffer || r.stays) return
  setRun({ phase: 'victory', events: [...run.events, ...r.events], pendingCatchId: r.pendingCatchId, catch: null })
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
  setRun({ pendingCatchId: null })
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

export function afterStalemate() {
  useGame.setState({ battle: null })
  backToArea()
}

export function finishCenter() {
  backToArea()
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

/** Caught or fled: back on the trail (the round may be complete). */
export function leaveTrick() {
  const tr = useGame.getState().run.trick
  if (tr && !tr.state.end) return
  setRun({ trick: null })
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
