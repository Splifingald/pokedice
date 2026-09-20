// Headless campaign: plays the real run loop — the encounter deck, battles with the greedy AI on both sides, rewards,
// catches, Centers, wipes and (optionally) upgrade buying — and records what a player would feel, area by area.
// Powers the admin Simulator (Campaign and Area test tabs, in a Web Worker) and `pnpm balance`.
import { battleOutcome, createBattle, type BattleKind } from './battle'
import { uniformLevels } from './damage'
import { linearAreas } from './data'
import { getRegion, newRegionBlock, regionOf, regionOfArea, startRegion } from './regions'
import { maxComboLevel, maxDieLevel, nextComboCost, nextDieCost } from './economy'
import { challengeEncounter, enemyUpgradeLevelFor, nextEncounter, type EncounterRoll } from './encounters'
import { applyCatch, catchChance, catchTarget, catchValueOf, rollCatch } from './catching'
import { ballBonus } from './items'
import { createInstance, instanceStats } from './progression'
import { playerSideOf } from './rival'
import { createRng } from './rng'
import {
  applyHp,
  applyVictory,
  applyWipe,
  buyComboUpgrade,
  buyDieUpgrade,
  centerHeal,
  centerWouldHelp,
  consumeItem,
  finishRound,
  hasFaintedMember,
  isAreaUnlocked,
  isTeamHurt,
  newSave,
  pickUpItem,
  progressOf,
  recordDraws,
  teamAverageLevel,
  teamOf,
} from './run'
import { autoStep } from './sim'
import { COMBO_KEYS, POKE_TYPES, type Area, type ComboKey, type GameData, type ItemDef, type PokeType, type RegionId, type SaveData } from './types'

export interface CampaignOptions {
  /** Encounters to play. A Center, a trainer (all their Pokémon), a gym battle or a legendary counts as one. */
  encounters: number
  seed: number
  /** New-game starter (ignored when `team` is given). */
  starterDex: number
  /** Area test: stay in this area instead of following the chain. */
  areaId?: string | null
  /** Area test: start with this team instead of a new game. */
  team?: { dex: number; level: number }[] | null
  /** Area test: every combo and die track starts at this level (capped at each track's max). */
  track?: number
  /** After each trainer, spend gold on the cheapest useful upgrade. */
  spend: boolean
  /** The Multi EXP setting. */
  multiExp: boolean
  /** Which region to run. Defaults to the first — a campaign is a run through one region, never across two. */
  regionId?: RegionId
}

export type EncounterTally = Record<'wild' | 'trainer' | 'center' | 'item' | 'casino' | 'gym' | 'boss', number>

export interface AreaReport {
  areaId: string
  name: string
  /** Runs that reached the area (1 for a single run; added up by mergeAreaReports). */
  visits: number
  encounters: number
  kinds: EncounterTally
  fights: number
  wins: number
  /** Lost fights — each one is a wipe back to the start of the area. */
  wipes: number
  /** Fights that ended with neither side able to finish (maxBattleTurns). */
  stalemates: number
  /** Player turns in each fight. */
  turns: number[]
  gold: number
  catches: number
  /** Catch throws that missed (the Pokémon fled). */
  fled: number
  itemsFound: number
  /** Team average level on arrival, and when last seen here. */
  levelIn: number
  levelOut: number
  /** Encounters from arrival until the area was cleared (null: never cleared). Averaged over clears when merged. */
  toClear: number | null
  clears: number
}

export interface TimelinePoint {
  /** Encounter index, 0-based. */
  i: number
  areaId: string
  level: number
  gold: number
  dex: number
}

export interface CampaignResult {
  /** In order of first visit. */
  areas: AreaReport[]
  timeline: TimelinePoint[]
  end: {
    team: { dex: number; name: string; level: number }[]
    teamAvg: number
    gold: number
    goldEarned: number
    dex: number
    dieLevels: Record<PokeType, number>
    comboLevels: Record<ComboKey, number>
  }
}

/** Push along the main chain; once it's all cleared, grind an unlocked scaling secret area (Cerulean Cave). */
function chainArea(save: SaveData, data: GameData): Area {
  // A campaign is a run through one region; it never wanders into the next one's chain.
  const region = regionOf(save)
  const chain = linearAreas(data, region)
  let furthest = [...chain].reverse().find((a) => isAreaUnlocked(save, a.id, data)) ?? chain[0] ?? data.areas[0]!
  if (progressOf(save, furthest.id).cleared) {
    const endgame = data.areas.find((a) => a.hidden && a.scalesToTeam && regionOfArea(a) === region && isAreaUnlocked(save, a.id, data))
    if (endgame) furthest = endgame
  }
  return furthest
}

function startingSave(data: GameData, opts: CampaignOptions, newId: () => string): SaveData {
  const region = opts.regionId ? getRegion(data, opts.regionId) : null
  const members = (opts.team ?? []).filter((m) => data.species[m.dex]).slice(0, data.config.maxTeamSize)
  const fallback = region?.starters.find((d) => data.species[d]) ?? data.speciesList[0]!.dex
  const starter = members[0]?.dex ?? (data.species[opts.starterDex] ? opts.starterDex : fallback)
  const fresh = newSave(starter, data, 0, newId)
  let save: SaveData = { ...fresh, settings: { ...fresh.settings, multiExp: opts.multiExp } }
  // A run in a later region starts as a player arriving there would: that region's starter, and nothing else.
  if (region && regionOf(save) !== region.id) {
    save = startRegion(save, region, newRegionBlock(region, starter, data, 0, newId, createInstance))
    save = { ...save, settings: { ...save.settings, multiExp: opts.multiExp } }
  }
  if (members.length) {
    const box = members.map((m) => createInstance(m.dex, m.level, data, newId(), 0))
    save = { ...save, box, team: box.map((p) => p.id), pokedex: [...new Set(box.map((p) => p.dex))] }
  }
  const track = Math.round(opts.track ?? 1)
  if (track > 1) {
    save = {
      ...save,
      comboLevels: Object.fromEntries(COMBO_KEYS.map((k) => [k, Math.max(1, Math.min(track, maxComboLevel(k, data)))])) as Record<ComboKey, number>,
      dieLevels: Object.fromEntries(POKE_TYPES.map((t) => [t, Math.max(1, Math.min(track, maxDieLevel(t, data)))])) as Record<PokeType, number>,
    }
  }
  return opts.areaId ? { ...save, currentAreaId: opts.areaId } : save
}

/** The simulated player's ball: none when the bare die has even odds, else the weakest ball that does, else its best. */
function pickBall(save: SaveData, data: GameData, value: number): ItemDef | null {
  if (catchChance(value, 0) >= 0.5) return null
  const owned = Object.entries(save.inventory)
    .filter(([k, q]) => q > 0 && data.items[k]?.effect.kind === 'ball')
    .map(([k]) => data.items[k]!)
    .sort((a, b) => ballBonus(a) - ballBonus(b))
  return owned.find((b) => catchChance(value, ballBonus(b)) >= 0.5) ?? owned[owned.length - 1] ?? null
}

/** Keep the highest-level Pokémon on the team (after a catch with a full team). */
function bestTeam(save: SaveData, data: GameData): SaveData {
  const ids = [...save.box].sort((a, b) => b.level - a.level).slice(0, data.config.maxTeamSize).map((p) => p.id)
  return { ...save, team: ids }
}

/** Cheapest useful upgrade first (dice the team carries, the common combos), until the cheapest one is unaffordable. */
function spend(save: SaveData, data: GameData): SaveData {
  let s = save
  for (let guard = 0; guard < 50; guard++) {
    const types = new Set<PokeType>()
    for (const p of teamOf(s)) for (const t of instanceStats(p, data).dice) if (t !== 'base') types.add(t)
    const options: { cost: number; apply: () => SaveData | null }[] = []
    for (const t of types) {
      const c = nextDieCost(t, s.dieLevels[t], data)
      if (c != null) options.push({ cost: c, apply: () => buyDieUpgrade(s, t, data) })
    }
    for (const k of ['pair', 'two_pair', 'three_kind'] as const) {
      const c = nextComboCost(k, s.comboLevels[k], data)
      if (c != null) options.push({ cost: c * 1.2, apply: () => buyComboUpgrade(s, k, data) })
    }
    options.sort((a, b) => a.cost - b.cost)
    const next = options[0]?.apply()
    if (!next) break
    s = next
  }
  return s
}

const round1 = (x: number) => Math.round(x * 10) / 10

/**
 * Play `opts.encounters` encounters. Yields progress (0..1] every few encounters so a caller can report it or stop;
 * returns the full report. Deterministic for a given seed and data.
 */
export function* runCampaign(data: GameData, opts: CampaignOptions): Generator<number, CampaignResult, void> {
  if (!data.areas.length) throw new Error('The working copy has no areas.')
  const rng = createRng(opts.seed)
  let idc = 0
  const newId = () => `sim-${++idc}`
  const fixed = opts.areaId ? (data.areas.find((a) => a.id === opts.areaId) ?? null) : null
  if (opts.areaId && !fixed) throw new Error('That area no longer exists in the working copy.')
  let save = startingSave(data, opts, newId)
  const reports = new Map<string, AreaReport>()
  const arrivedAt = new Map<string, number>()
  const timeline: TimelinePoint[] = []
  const total = Math.max(0, Math.floor(opts.encounters))
  let current: string | null = null
  let firstInArea = true
  let goldEarned = 0

  const reportFor = (area: Area): AreaReport => {
    let r = reports.get(area.id)
    if (!r) {
      const lv = round1(teamAverageLevel(save))
      r = {
        areaId: area.id,
        name: area.name,
        visits: 1,
        encounters: 0,
        kinds: { wild: 0, trainer: 0, center: 0, item: 0, casino: 0, gym: 0, boss: 0 },
        fights: 0,
        wins: 0,
        wipes: 0,
        stalemates: 0,
        turns: [],
        gold: 0,
        catches: 0,
        fled: 0,
        itemsFound: 0,
        levelIn: lv,
        levelOut: lv,
        toClear: null,
        clears: 0,
      }
      reports.set(area.id, r)
    }
    return r
  }

  const tryCatch = (r: AreaReport, enemy: { dex: number; level: number }, kind: 'wild' | 'boss') => {
    const target = catchTarget(save, enemy.dex, enemy.level, kind, data)
    if (!target) return
    const value = catchValueOf(data, enemy.dex)
    const ball = pickBall(save, data, value)
    if (ball) save = consumeItem(save, ball.key) ?? save
    if (!rollCatch(value, ballBonus(ball ?? undefined), rng).caught) {
      r.fled++
      return
    }
    const res = applyCatch(save, enemy, target, data, 0, newId)
    save = res.needsTeamChoice ? bestTeam(res.save, data) : res.save
    r.catches++
  }

  const fight = (
    area: Area,
    r: AreaReport,
    kind: BattleKind,
    enemy: { dex: number; level: number; item?: string },
    upgradeLevel: number,
    gym?: { trainerId: string; last: boolean },
  ) => {
    const created = createBattle(
      {
        kind,
        team: teamOf(save).map((p) => ({ uid: p.id, dex: p.dex, level: p.level, hp: p.currentHp })),
        enemy,
        playerLevels: { comboLevels: save.comboLevels, dieLevels: save.dieLevels },
        enemyLevels: uniformLevels(upgradeLevel),
      },
      data,
    )
    let state = created.state
    let turns = created.log.filter((l) => l.kind === 'turn' && l.side === 'player').length
    for (let i = 0; i < 6000 && state.phase !== 'won' && state.phase !== 'lost' && state.phase !== 'fled'; i++) {
      const step = autoStep(state, data, rng)
      turns += step.log.filter((l) => l.kind === 'turn' && l.side === 'player').length
      state = step.state
    }
    const out = battleOutcome(state)
    save = applyHp(save, out.hp)
    r.fights++
    r.turns.push(turns)
    if (out.result === 'won') {
      r.wins++
      const before = save.gold
      const res = applyVictory(
        save,
        {
          areaId: area.id,
          kind: gym ? 'gym' : kind,
          enemyDex: enemy.dex,
          enemyLevel: enemy.level,
          fighterUid: out.fighterUid,
          gymTrainerId: gym?.trainerId,
          gymComplete: gym?.last,
        },
        data,
        rng,
        0,
        newId,
      )
      save = res.save
      const earned = Math.max(0, save.gold - before)
      r.gold += earned
      goldEarned += earned
      if (kind === 'wild' || kind === 'boss') tryCatch(r, enemy, kind)
    } else if (out.result === 'lost') {
      r.wipes++
      save = applyWipe(save, area.id, data)
      firstInArea = true
    } else r.stalemates++
    return out.result
  }

  for (let i = 0; i < total; i++) {
    const area = fixed ?? chainArea(save, data)
    if (area.id !== current) {
      current = area.id
      firstInArea = true
      if (!arrivedAt.has(area.id)) arrivedAt.set(area.id, i)
    }
    const r = reportFor(area)
    const wasCleared = progressOf(save, area.id).cleared
    // The sim takes a due gym battle or legendary as soon as it's offered (a player may keep exploring first) — unless
    // a Center has to come first (arriving hurt, nobody standing, a K.O. in an easy area).
    const needsCenter =
      (firstInArea && isTeamHurt(save, data)) || teamOf(save).every((p) => p.currentHp <= 0) || (area.easyMode && hasFaintedMember(save))
    const challenge = needsCenter ? null : challengeEncounter(area, progressOf(save, area.id), data, teamAverageLevel(save), playerSideOf(save))
    const roll: EncounterRoll = challenge ? { encounter: challenge, deck: null, lootDeck: null } : nextEncounter(
      {
        area,
        progress: progressOf(save, area.id),
        data,
        teamAvgLevel: teamAverageLevel(save),
        teamHurt: isTeamHurt(save, data),
        teamFainted: hasFaintedMember(save),
        isFirstInArea: firstInArea,
        pokedex: save.pokedex,
        // Nobody able to fight (e.g. after a stalemate) → the Center is the only sensible next stop.
        forceKind: teamOf(save).every((p) => p.currentHp <= 0) ? 'center' : null,
        centerUseful: centerWouldHelp(save, data),
        player: playerSideOf(save),
      },
      rng,
    )
    const enc = roll.encounter
    save = recordDraws(save, area.id, roll)
    firstInArea = false
    r.encounters++
    r.kinds[enc.kind]++

    if (enc.kind === 'center') save = centerHeal(save, data)
    else if (enc.kind === 'casino') {
      // The simulated player walks past the Game Corner.
    } else if (enc.kind === 'item') {
      save = pickUpItem(save, area.id, enc, data, 0, newId)
      r.itemsFound++
    }
    else if (enc.kind === 'trainer' || enc.kind === 'gym') {
      for (let k = 0; k < enc.team.length; k++) {
        const gym = enc.kind === 'gym' ? { trainerId: enc.trainerId, last: k === enc.team.length - 1 } : undefined
        if (fight(area, r, 'trainer', enc.team[k]!, enemyUpgradeLevelFor(enc, area, data), gym) !== 'won') break
        // A mutual K.O. — the last Pokémon faints as it wins — ends the gauntlet: there is nobody left to send out.
        if (teamOf(save).every((p) => p.currentHp <= 0)) break
      }
      if (opts.spend) save = spend(save, data)
    } else fight(area, r, enc.kind === 'boss' ? 'boss' : 'wild', { dex: enc.dex, level: enc.level }, enemyUpgradeLevelFor(enc, area, data))
    // The encounter is over: the last card of a deck completes the round (a wipe dropped the deck, so it won't).
    save = finishRound(save, area.id, data).save

    if (!wasCleared && r.toClear == null && progressOf(save, area.id).cleared) {
      r.toClear = i - (arrivedAt.get(area.id) ?? i) + 1
      r.clears = 1
    }
    const level = round1(teamAverageLevel(save))
    r.levelOut = level
    timeline.push({ i, areaId: area.id, level, gold: save.gold, dex: new Set(save.pokedex).size })
    if ((i + 1) % 5 === 0 || i + 1 === total) yield (i + 1) / total
  }

  return {
    areas: [...reports.values()],
    timeline,
    end: {
      team: teamOf(save).map((p) => ({ dex: p.dex, name: data.species[p.dex]?.name ?? `#${p.dex}`, level: p.level })),
      teamAvg: round1(teamAverageLevel(save)),
      gold: save.gold,
      goldEarned,
      dex: new Set(save.pokedex).size,
      dieLevels: { ...save.dieLevels },
      comboLevels: { ...save.comboLevels },
    },
  }
}

/** runCampaign played to the end in one go (scripts and tests). */
export function runCampaignSync(data: GameData, opts: CampaignOptions): CampaignResult {
  const gen = runCampaign(data, opts)
  let step = gen.next()
  while (!step.done) step = gen.next()
  return step.value
}

/** Several runs' area reports as one: counts and turn lists add up; levels and time-to-clear are averaged. */
export function mergeAreaReports(runs: readonly AreaReport[][]): AreaReport[] {
  const out = new Map<string, AreaReport>()
  const clearSum = new Map<string, number>()
  for (const run of runs) {
    for (const r of run) {
      if (r.toClear != null) clearSum.set(r.areaId, (clearSum.get(r.areaId) ?? 0) + r.toClear * r.clears)
      const m = out.get(r.areaId)
      if (!m) {
        out.set(r.areaId, { ...r, kinds: { ...r.kinds }, turns: [...r.turns] })
        continue
      }
      const visits = m.visits + r.visits
      m.levelIn = (m.levelIn * m.visits + r.levelIn * r.visits) / visits
      m.levelOut = (m.levelOut * m.visits + r.levelOut * r.visits) / visits
      m.visits = visits
      m.encounters += r.encounters
      m.fights += r.fights
      m.wins += r.wins
      m.wipes += r.wipes
      m.stalemates += r.stalemates
      m.gold += r.gold
      m.catches += r.catches
      m.fled += r.fled
      m.itemsFound += r.itemsFound
      m.clears += r.clears
      for (const k of Object.keys(m.kinds) as (keyof EncounterTally)[]) m.kinds[k] += r.kinds[k]
      for (const t of r.turns) m.turns.push(t)
    }
  }
  for (const m of out.values()) {
    const s = clearSum.get(m.areaId)
    m.toClear = m.clears > 0 && s != null ? s / m.clears : null
  }
  return [...out.values()]
}
