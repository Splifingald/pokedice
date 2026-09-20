// Run flow: map → area → encounter preview → battle → rewards → next. Thin glue over the pure engine.
import {
  applyCatch,
  applyHp,
  applyVictory,
  applyWipe,
  ballBonus,
  battleOutcome,
  canSkip,
  catchTarget,
  catchValueOf,
  centerHeal,
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
  MONEY,
  pickUpItem,
  recordDraws,
  rollCatch,
  spinSlots,
  createBattle,
  createRng,
  enemyUpgradeLevelFor,
  hasAbleTeam,
  hasFaintedMember,
  isAreaUnlocked,
  isTeamHurt,
  newSave,
  nextEncounter,
  progressOf,
  randomSeed,
  reduce,
  swapIntoTeam,
  teamAverageLevel,
  teamOf,
  uniformLevels,
  type BattleEvent,
  type BattleKind,
  type ForceKind,
  type PlayerProfile,
  type RunEvent,
  type SaveData,
  type SpinResult,
} from '@/engine'
import { commitSave, initialRun, mutateSave, pushToast, useGame, type RunState } from './game'

let runRng = createRng(randomSeed())
let battleRng = createRng(randomSeed())
let battleSeq = 0

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
  commitSave(newSave(starterDex, data, Date.now(), newId, player))
  useGame.setState({ run: initialRun(), battle: null })
}

export function deleteSave() {
  commitSave(null)
  useGame.setState({ run: initialRun(), battle: null })
}

export function enterArea(areaId: string): boolean {
  const { save, data } = useGame.getState()
  if (!save || !isAreaUnlocked(save, areaId, data)) return false
  if (save.currentAreaId !== areaId) commitSave({ ...save, currentAreaId: areaId })
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
      pushToast(`${area?.name ?? 'Area'} cleared!${next ? ` ${next} is open.` : ''}`, 'good', 4500)
    }
    return r.cleared
  }
  const need = area?.roundsToClear
  const done = progressOf(r.save, run.areaId).roundsDone ?? 0
  if (!quiet) pushToast(need != null && done <= need ? `Round ${done}/${need} complete!` : `Round ${done} complete!`, 'good')
  return null
}

/** Back to the area screen after an encounter: the round may be complete. */
function backToArea() {
  setRun({ phase: 'idle', encounter: null })
  settleRound()
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
  }
}

/**
 * NEXT ENCOUNTER needs energy, unless what comes next is free anyway (a Pokémon Center, or nobody can fight).
 * False when the energy system is off.
 */
export function outOfEnergy(): boolean {
  const { save, data, run } = useGame.getState()
  if (!save || !data.config.energy.enabled || energyNow(save, data.config.energy, Date.now()).value >= 1) return false
  if (!hasAbleTeam(save) || !run.areaId) return false
  const ctx = encounterContext(save, run.areaId, null)
  return !ctx || !centerIsNext(ctx)
}

/** Roll the next encounter and show its preview card. */
export function rollNext() {
  settleRound()
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId) return
  if (outOfEnergy()) {
    setRun({ phase: 'idle', encounter: null })
    pushToast('Out of energy — it refills over time.', 'bad')
    return
  }
  // Nobody able to fight (e.g. after a stalemate) → the Center is the only sensible next stop.
  const noneAble = !hasAbleTeam(save)
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
}

/** CHALLENGE: bring on the gym battle (or legendary) waiting at the full gauge — only when the player chooses to. */
export function challenge() {
  const { save, data, run } = useGame.getState()
  if (!save || !run.areaId || run.phase !== 'idle') return
  const area = data.areas.find((a) => a.id === run.areaId)
  const encounter = area ? challengeEncounter(area, progressOf(save, area.id), data, teamAverageLevel(save), playerSideOf(save)) : null
  if (encounter) setRun({ phase: 'preview', encounter, firstInArea: false, skipsUsed: 0 })
}

/** NOT YET: back out of a challenge you picked. Nothing is used up; the gauge stays full. */
export function declineChallenge() {
  setRun({ phase: 'idle', encounter: null })
}

export function canSkipCurrent(): boolean {
  const { run, data } = useGame.getState()
  return !!run.encounter && !data.config.noEscape && canSkip(run.encounter, data.config.skipPolicy, run.skipsUsed)
}

/** FLEE / AVOID: back to the area screen (heal, check the team…); the next encounter waits for NEXT ENCOUNTER. */
export function skipEncounter() {
  if (!canSkipCurrent()) return
  const { run } = useGame.getState()
  const trainer = run.encounter?.kind === 'trainer'
  // skipsUsed survives until a fight is engaged, so skipPolicy 'once' still allows one skip in a row.
  setRun({ skipsUsed: run.skipsUsed + 1 })
  backToArea()
  pushToast(trainer ? 'You slipped past the trainer.' : 'Got away safely!')
}

function startBattle(kind: BattleKind, enemy: { dex: number; level: number; shiny?: boolean; item?: string }, leadUid?: string) {
  const { save, data, run } = useGame.getState()
  if (!save) return
  const area = data.areas.find((a) => a.id === run.areaId)
  const upgradeLevel = run.encounter ? enemyUpgradeLevelFor(run.encounter, area, data) : (area?.enemyUpgradeLevel ?? data.config.enemyUpgradeLevel)
  const team = teamOf(save).map((p) => ({ uid: p.id, dex: p.dex, level: p.level, hp: p.currentHp, shiny: p.shiny }))
  battleRng = createRng(randomSeed() ^ battleRng.getState())
  const { state, log } = createBattle(
    {
      kind,
      team,
      leadUid,
      enemy,
      playerLevels: { comboLevels: save.comboLevels, dieLevels: save.dieLevels },
      enemyLevels: uniformLevels(upgradeLevel),
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
      setRun({ phase: 'center' })
      return
    case 'casino':
      setRun({ phase: 'casino' })
      return
    case 'wild':
      return startBattle('wild', { dex: enc.dex, level: enc.level, shiny: enc.shiny }, leadUid)
    case 'boss':
      return startBattle('boss', { dex: enc.dex, level: enc.level }, leadUid)
    case 'trainer':
    case 'gym': {
      const first = enc.team[0]
      if (!first) return
      setRun({ trainer: { index: 0, gold: 0 } })
      return startBattle('trainer', first, leadUid)
    }
    case 'item': {
      if (!run.areaId) return
      commitSave(pickUpItem(save, run.areaId, enc, data, Date.now(), newId))
      const item = data.items[enc.itemKey]
      const what = enc.itemKey === MONEY ? `₽${enc.qty.toLocaleString('en')}` : `${item?.name ?? enc.itemKey}${enc.qty > 1 ? ` ×${enc.qty}` : ''}`
      if (item?.effect.kind === 'fossil')
        pushToast(`You found a ${item.name}! ${data.species[item.effect.dex]?.name ?? 'Its Pokémon'} will be revived in ${item.effect.hours} h — it's waiting in your Box.`, 'good', 6000)
      else pushToast(`You found ${what}!`, 'good')
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

  if (out.result === 'won') {
    const enc = run.encounter
    const gym = enc?.kind === 'gym'
    const res = applyVictory(
      withHp,
      {
        areaId: run.areaId,
        kind: gym ? 'gym' : s.kind,
        enemyDex: s.enemy.dex,
        enemyLevel: s.enemy.level,
        fighterUid: out.fighterUid,
        gymTrainerId: gym ? enc.trainerId : undefined,
        gymComplete: gym && !!run.trainer && run.trainer.index + 1 >= enc.team.length,
      },
      data,
      runRng,
      Date.now(),
      newId,
    )
    commitSave(res.save)
    // The round's last card was this fight: count it now, so "AREA CLEARED" is part of the rewards.
    const cleared = trainerHasNext() ? null : settleRound(true)
    const events = cleared ? [...res.events, cleared] : res.events
    const gold = res.events.reduce((g, e) => (e.kind === 'gold' ? g + e.amount : g), 0)
    // A wild or legendary K.O. that can be caught goes to the catch throw first; the rewards screen follows it.
    const kind = s.kind === 'wild' || s.kind === 'boss' ? s.kind : null
    const target = kind ? catchTarget(res.save, s.enemy.dex, s.enemy.level, kind, data, s.enemy.shiny) : null
    setRun({
      phase: target ? 'catch' : 'victory',
      events,
      pendingCatchId: null,
      catch: target && kind ? { dex: s.enemy.dex, level: s.enemy.level, shiny: s.enemy.shiny, kind, target, result: null } : null,
      trainer: run.trainer ? { ...run.trainer, gold: run.trainer.gold + gold } : null,
    })
    return
  }
  if (out.result === 'lost') {
    commitSave(applyWipe(withHp, run.areaId, data))
    setRun({ phase: 'wipe', trainer: null, events: [] })
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
  pushToast('Got away safely!')
  rollNext()
}

/** Throw the catch die, with one ball from the bag (or none). The result waits in run.catch until finishCatch(). */
export function throwBall(ballKey: string | null) {
  const { run, save, data } = useGame.getState()
  const c = run.catch
  if (!c || c.result || !save) return
  const ball = ballKey ? data.items[ballKey] : undefined
  if (ballKey && (!ball || ball.effect.kind !== 'ball' || (save.inventory[ballKey] ?? 0) <= 0)) return
  let next = ballKey ? (consumeItem(save, ballKey) ?? save) : save
  const roll = rollCatch(catchValueOf(data, c.dex), ballBonus(ball), runRng)
  let events: RunEvent[] = [{ kind: 'fled', dex: c.dex }]
  let pendingCatchId: string | null = null
  if (roll.caught) {
    const res = applyCatch(next, { dex: c.dex, level: c.level, shiny: c.shiny }, c.target, data, Date.now(), newId)
    next = res.save
    events = res.events
    if (res.needsTeamChoice) pendingCatchId = res.caughtId
  }
  commitSave(next)
  setRun({ catch: { ...c, result: { ...roll, ballKey, events, pendingCatchId } } })
}

/** Leave the throw for the rewards screen, which now lists the catch (or the flight) too. */
export function finishCatch() {
  const { run } = useGame.getState()
  const r = run.catch?.result
  if (!r) return
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
  if (run.trainer && run.trainer.gold > 0) pushToast(`Trainer defeated! +₽${run.trainer.gold}`, 'good')
  useGame.setState({ battle: null })
  setRun({ events: [], trainer: null })
  backToArea()
}

/** "Add to team?" — swap the new catch in for `replaceId`, or send it to the Box (null). */
export function resolveCatch(replaceId: string | null) {
  const { run, data } = useGame.getState()
  if (!run.pendingCatchId) return
  if (replaceId) mutateSave((s) => swapIntoTeam(s, run.pendingCatchId!, replaceId, data))
  setRun({ pendingCatchId: null })
}

export function afterWipe() {
  useGame.setState((s) => ({ battle: null, run: { ...initialRun(), areaId: s.run.areaId, firstInArea: true } }))
}

export function afterStalemate() {
  useGame.setState({ battle: null })
  backToArea()
}

export function finishCenter() {
  backToArea()
}

/** One pull of the Game Corner slot machine; null (and a toast) when the player can't pay for it. */
export function spinSlotMachine(): SpinResult | null {
  const { save, data, run } = useGame.getState()
  if (!save || run.phase !== 'casino') return null
  const res = spinSlots(save, data, runRng, Date.now(), newId)
  if (!res) {
    pushToast('Not enough Pokédollars', 'bad')
    return null
  }
  commitSave(res.save)
  return res
}

export function leaveCasino() {
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
