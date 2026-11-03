// Set moments (docs/61 §5): a rival who turns up and a Pokémon given, each at a set point of an area (its round, and
// the cards of that round turned over before it), coming on top of the deck without using a card. Each is met once per
// save. A rival comes only while the area isn't cleared; a gift also on a later visit to a cleared area, so a save
// already past it still gets it. Every rule is here; the store deals them and the screens show them.
import { applyCatch, catchTarget } from './catching'
import { hatchLevel } from './daycare'
import { eventOpenTo } from './events'
import { createInstance } from './progression'
import { createRng, type Rng } from './rng'
import { rollTalentFor } from './talents'
import type { Encounter } from './encounters'
import { asSeenBy, type PlayerSide } from './rival'
import type {
  Area,
  AreaProgress,
  GameData,
  GiftMoment,
  MomentPoint,
  PokemonInstance,
  RivalMeeting,
  SaveData,
  Trainer,
} from './types'

/** Rivals' meetings: switched on for whoever is playing (docs/15 §20). */
export const rivalsOn = (data: GameData): boolean => eventOpenTo(data.config.rivals?.access, data)
/** Gift Pokémon: switched on for whoever is playing. */
export const giftMomentsOn = (data: GameData): boolean => eventOpenTo(data.config.giftMoments?.access, data)

const doneIn = (save: SaveData): Set<string> => new Set(save.moments?.done ?? [])

/** The point has come in this area: its round reached, and that round's cards turned over up to it. */
export function momentReached(p: MomentPoint, progress: AreaProgress): boolean {
  const rounds = progress.roundsDone ?? 0
  if (rounds > p.round) return true
  return rounds === p.round && (progress.drawn?.length ?? 0) >= p.after
}

/** Every trainer a meeting deals: while rivals are on, they come only as meetings, never from a trainer pool. */
export function rivalTrainerIds(data: GameData): Set<string> {
  return new Set((data.config.rivals?.meetings ?? []).flatMap((m) => m.trainers))
}

/** A trainer pool's card leaves this trainer out: it's a rival met at a set point (docs/61 §5.2). */
export const dealtAsMeeting = (data: GameData, trainerId: string): boolean =>
  rivalsOn(data) && rivalTrainerIds(data).has(trainerId)

/** The rival meeting due here: switched on, the area not cleared, its point reached, not met yet. */
export function dueRival(save: SaveData, area: Area, progress: AreaProgress, data: GameData): RivalMeeting | null {
  if (!rivalsOn(data) || progress.cleared) return null
  const done = doneIn(save)
  return (
    (data.config.rivals?.meetings ?? []).find(
      (m) => m.areaId === area.id && !done.has(m.id) && momentReached(m, progress) && m.trainers.some((id) => data.trainers[id]),
    ) ?? null
  )
}

/** The meeting's trainer for this player: the version for their starter (`rivalOf`), else its first one. */
export function rivalFor(m: RivalMeeting, data: GameData, side?: PlayerSide | null): Trainer | null {
  const all = m.trainers.map((id) => data.trainers[id]).filter((t): t is Trainer => !!t)
  return all.find((t) => t.rivalOf != null && t.rivalOf === side?.starterDex) ?? all[0] ?? null
}

/** The gift due here: switched on, its point reached (any time in a cleared area), not received yet. */
export function dueGift(save: SaveData, area: Area, progress: AreaProgress, data: GameData): GiftMoment | null {
  if (!giftMomentsOn(data)) return null
  const done = doneIn(save)
  return (
    (data.config.giftMoments?.gifts ?? []).find(
      (g) =>
        g.areaId === area.id &&
        !done.has(g.id) &&
        (progress.cleared || momentReached(g, progress)) &&
        giftChoices(g, save).length > 0 &&
        giftChoices(g, save).every((d) => data.species[d]),
    ) ?? null
  )
}

/** What the player can take: the one for their starter (the Unova monkey), else the gift's list (one, or a pick). */
export function giftChoices(g: GiftMoment, save: SaveData): number[] {
  const starter = save.pokedex[0]
  const mine = starter != null ? g.byStarter?.[String(starter)] : undefined
  if (g.byStarter) return mine != null ? [mine] : g.dex.slice(0, 1)
  // An Egg holds one Pokémon, decided as it's given (the Odd Egg's from its list).
  return g.egg ? g.dex.slice(0, 1) : g.dex
}

/** A gift's level: its own, else the area's lowest. */
export const giftLevel = (g: GiftMoment, area: Pick<Area, 'minLevel'>): number => g.level ?? area.minLevel

export function markMomentDone(save: SaveData, id: string): SaveData {
  const done = save.moments?.done ?? []
  return done.includes(id) ? save : { ...save, moments: { ...save.moments, done: [...done, id] } }
}

export type GiftPlaced = 'team' | 'box' | 'replaced' | 'merged' | 'egg'

export interface GiftReceived {
  save: SaveData
  /** What was given (an Egg's Pokémon, for its hatching). */
  dex: number
  shiny: boolean
  placed: GiftPlaced
  isNew: boolean
  /** The copy it replaced was at this level. */
  replacedLevel?: number
}

/**
 * The gift taken (docs/61 §5.3), `pick` among its choices: its price paid, then a Pokémon placed as a wild catch here
 * would be (the team if it has room, else the Box; a stronger one replaces your weakest plain copy; one as strong as
 * yours merges into it), or an Egg to the Box, hatching after the gifts' `eggHours` at the Day Care's hatch level, its
 * shiny settled now (the Odd Egg's at its own odds). Marked as met either way. Null when the purse is short or `pick`
 * isn't one of its choices.
 */
export function receiveGift(
  save: SaveData,
  data: GameData,
  g: GiftMoment,
  area: Area,
  pick: number,
  now: number,
  newId: () => string,
  rng: Rng,
): GiftReceived | null {
  const choices = giftChoices(g, save)
  if (!g.egg && !choices.includes(pick)) return null
  const price = Math.max(0, Math.round(g.price ?? 0))
  if (save.gold < price) return null
  let next: SaveData = price ? { ...save, gold: save.gold - price } : save
  const shinyOdds = g.shinyChance ?? data.config.shinyChance ?? 0
  if (g.egg) {
    // The Odd Egg: one of its babies at random; any other Egg its one Pokémon.
    const dex = g.dex.length > 1 ? g.dex[rng.int(0, g.dex.length - 1)]! : g.dex[0]!
    const id = newId()
    const hours = Math.max(0, Number(data.config.giftMoments?.eggHours ?? 6))
    const talent = rollTalentFor(data, dex, id)
    const egg: PokemonInstance = {
      ...createInstance(dex, hatchLevel(next, data), data, id, now),
      revivesAt: now + hours * 3_600_000,
      egg: true,
      ...(next.mode !== 'extreme' && rng.next() < shinyOdds && { hatchShiny: true }),
      ...(talent && { talent }),
    }
    next = markMomentDone({ ...next, box: [...next.box, egg] }, g.id)
    return { save: next, dex, shiny: !!egg.hatchShiny, placed: 'egg', isNew: !save.pokedex.includes(dex) }
  }
  const level = giftLevel(g, area)
  const shiny = next.mode !== 'extreme' && rng.next() < shinyOdds
  const target = catchTarget(next, pick, level, 'wild', data, shiny, area.id)
  if (!target) return { save: markMomentDone(next, g.id), dex: pick, shiny, placed: 'merged', isNew: false }
  const res = applyCatch(next, { dex: pick, level, shiny }, target, data, now, newId)
  const caught = res.events.find((e) => e.kind === 'caught')
  const isNew = caught?.kind === 'caught' && !!caught.isNew
  const placed: GiftPlaced =
    target.mode === 'replace'
      ? 'replaced'
      : target.mode === 'learn'
        ? 'merged'
        : caught?.kind === 'caught' && caught.joinedTeam
          ? 'team'
          : 'box'
  return {
    save: markMomentDone(res.save, g.id),
    dex: pick,
    shiny,
    placed,
    isNew,
    ...(target.mode === 'replace' && { replacedLevel: target.level }),
  }
}

/** The gift turned down (the Magikarp salesman's offer): met, nothing taken. */
export const declineGift = (save: SaveData, g: GiftMoment): SaveData => markMomentDone(save, g.id)

/** Every species the gifts of a region can give (its Pokédex counts them while gifts are on). */
export function giftSpecies(data: GameData, areaIds: Set<string>): number[] {
  if (!giftMomentsOn(data)) return []
  return (data.config.giftMoments?.gifts ?? [])
    .filter((g) => areaIds.has(g.areaId))
    .flatMap((g) => [...g.dex, ...Object.values(g.byStarter ?? {})])
}

/** A seeded rng for a gift, so a reload can't roll it again before the save is written. */
export const giftRng = (save: SaveData, g: GiftMoment): Rng => {
  let h = 0x811c9dc5
  const key = `${g.id}:${save.pokedex[0] ?? 0}:${save.box.length}`
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
  return createRng(h >>> 0)
}

/**
 * A rival's meeting as the trainer card it is: the version for the player's starter, under the rival's name and picture
 * as they see it (Kanto's the other character, Hoenn's May or Brendan), its team at its own levels. Met once it's won.
 */
export function rivalEncounter(m: RivalMeeting, data: GameData, side?: PlayerSide | null): Encounter | null {
  const t = rivalFor(m, data, side)
  if (!t || !t.team.length) return null
  const seen = asSeenBy(t, side)
  return {
    kind: 'trainer',
    trainerId: t.id,
    name: seen.name,
    spriteUrl: seen.spriteUrl,
    team: t.team.map((p) => ({ dex: p.dex, level: Math.max(1, Math.min(data.config.maxLevel, p.level)) })),
    moment: m.id,
  }
}
