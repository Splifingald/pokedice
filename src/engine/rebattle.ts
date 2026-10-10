// The Elite Rebattle (docs/18, docs/19 §5): a region's Elite Four and Champion again, in three tiers (Bronze, Silver,
// Gold), once its League is won. A tier is a gauntlet: every member in a row, no Pokémon Center, items allowed; a loss
// sends the player back to the first member with the team healed. Each Pokémon a member sends out pays once per tier,
// at the tier's ₽ multiplier: beaten again after a restart, it pays nothing. Only the region being played can be
// fought. Victory Road II and League II, the endgame lap this replaces, are gone (LEAGUE_II below moves old saves).
import { trainerGoldFor } from './economy'
import type { Encounter } from './encounters'
import { areaProgressAnywhere } from './events'
import { regionOf } from './regions'
import { asSeenBy, playerSideOf } from './rival'
import { awardBattleXp, getArea, type RunEvent } from './run'
import { instanceMaxHp } from './progression'
import type { Rng } from './rng'
import { dealTrainerItems } from './trainerItems'
import type { Area, GameData, RebattleProgress, RebattleTier, SaveData, Trainer } from './types'

/**
 * The areas the rebattle replaced, and where a save standing in one goes back to: its region's League (docs/19 §5.4).
 * Their progress rows are dropped; nothing else in the save changes.
 */
export const LEAGUE_II: Readonly<Record<string, string>> = {
  // Kanto: Victory Road II, Indigo Plateau II
  '35c40458-61da-5321-adda-6df33b930671': 'bbe7e459-a138-5106-bd01-fce7ff422e7f',
  '2737f8c1-713a-54d8-986e-30b92f7c4a8f': 'bbe7e459-a138-5106-bd01-fce7ff422e7f',
  // Johto: Victory Road II, Indigo Plateau II
  '5b386fa9-4a0a-4291-bddb-19e899fd366a': '1ab44ea6-29c0-51c0-9a1f-e1a4b77cfc74',
  '82775277-caba-462e-8209-c08d46b403e6': '1ab44ea6-29c0-51c0-9a1f-e1a4b77cfc74',
  // Sinnoh: Victory Road II, The Pokémon League II
  'aa2f848e-f405-4eff-ab71-02e3a5120b9f': '5dc66787-c27b-5d67-8d66-4df0f1aa1041',
  'f3ff4c29-01d6-4036-80c1-1ef6263d3eaf': '5dc66787-c27b-5d67-8d66-4df0f1aa1041',
  // Unova: Victory Road II, The Pokémon League II
  '888beadb-3aa2-57cc-82bc-cca9bd51f42a': '8c87ed3a-c021-57b6-b866-cc6e71877c0e',
  '414d148c-76c2-5c1a-9e8d-aa1a0b60a154': '8c87ed3a-c021-57b6-b866-cc6e71877c0e',
  // Kalos: Victory Road II, The Pokémon League II
  '13fcad9d-8c4b-56d3-bced-9ef61c93745f': 'd3464556-7bcd-5708-9a13-415e0326fb75',
  '7213c40c-c1d8-5cbc-89f9-5b65c3e52fa2': 'd3464556-7bcd-5708-9a13-415e0326fb75',
  // Alola: Mount Lanakila II, The Pokémon League II
  '5d2b50d3-a648-5479-a687-067ca5f833f4': 'af565afe-bfc6-516a-8a4c-bba17bb1ff48',
  '62903307-8361-5503-9f7c-216d94b03a27': 'af565afe-bfc6-516a-8a4c-bba17bb1ff48',
  // Galar: The Wild Area II, The Champion Cup II
  'eb428b97-a163-5cfd-995d-706c0ff73f0b': '3610c6e0-5fc7-5aab-8b2c-a59be219db55',
  'c7cc6447-9d47-544e-bc63-ac241b69d06c': '3610c6e0-5fc7-5aab-8b2c-a59be219db55',
}

/**
 * A save from before the rebattle: one standing in Victory Road II or League II (live, or in a parked region) goes
 * back to its region's League, and the progress of those areas is dropped. Unchanged when there is nothing to move.
 */
export function migrateLeagueII(save: SaveData): SaveData {
  const fix = <B extends Pick<SaveData, 'currentAreaId' | 'areaProgress'>>(b: B): B => {
    const gone = Object.keys(b.areaProgress).filter((id) => id in LEAGUE_II)
    const moved = b.currentAreaId in LEAGUE_II
    if (!gone.length && !moved) return b
    const areaProgress = { ...b.areaProgress }
    for (const id of gone) delete areaProgress[id]
    return { ...b, areaProgress, ...(moved && { currentAreaId: LEAGUE_II[b.currentAreaId]! }) }
  }
  const live = fix(save)
  let parked = save.parked
  for (const [id, b] of Object.entries(save.parked ?? {})) {
    if (!b) continue
    const f = fix(b)
    if (f !== b) parked = { ...parked, [id]: f }
  }
  return live === save && parked === save.parked ? save : { ...live, parked }
}

/** The tiers, from the config (Bronze, Silver, Gold by default). */
export const rebattleTiers = (data: GameData): RebattleTier[] => data.config.events.rebattle.tiers

/** A region's League area (the rebattle is fought there: its picture, its scene). */
export function leagueArea(data: GameData, regionId: string): Area | undefined {
  const id = data.regions.find((r) => r.id === regionId)?.leagueAreaId
  return id ? data.areas.find((a) => a.id === id) : undefined
}

/** Regions with a rebattle: a League and a lineup for every tier. */
export function rebattleRegions(data: GameData): string[] {
  const lineups = data.config.rebattleLineups
  return data.regions
    .filter((r) => r.enabled !== false && leagueArea(data, r.id) && rebattleTiers(data).every((t) => (lineups[r.id]?.[t.id] ?? []).length))
    .map((r) => r.id)
}

/** The region's rebattle is open: its League was won (in the save's own block for it, parked or live). */
export function rebattleOpen(save: SaveData, data: GameData, regionId: string): boolean {
  const league = leagueArea(data, regionId)
  return !!league && rebattleRegions(data).includes(regionId) && !!areaProgressAnywhere(save, data, league.id)?.cleared
}

/** Where the player stands in a region's rebattle. */
export function rebattleProgress(save: SaveData, regionId: string): RebattleProgress {
  return save.events?.rebattle?.[regionId] ?? { done: 0, step: 0, paid: [] }
}

/** The tier being fought: the first not cleared yet, or Gold again once every tier is. */
export function currentTier(save: SaveData, data: GameData, regionId: string): number {
  return Math.min(rebattleProgress(save, regionId).done, rebattleTiers(data).length - 1)
}

/** Every tier of the region cleared. */
export const rebattleComplete = (save: SaveData, data: GameData, regionId: string): boolean =>
  rebattleProgress(save, regionId).done >= rebattleTiers(data).length

/** Home shows the rebattle's square while the region being played has one open and not every tier is cleared. */
export const rebattleOnHome = (save: SaveData, data: GameData): boolean =>
  rebattleOpen(save, data, regionOf(save)) && !rebattleComplete(save, data, regionOf(save))

/** A tier's trainers in fight order, as this player sees them (Kanto's Champion is their rival). */
export function rebattleLineup(save: SaveData, data: GameData, regionId: string, tier: number): Trainer[] {
  const t = rebattleTiers(data)[tier]
  const ids = (t && data.config.rebattleLineups[regionId]?.[t.id]) ?? []
  const side = playerSideOf(save)
  const rivals = ids.filter((id) => data.trainers[id]?.rivalOf != null)
  const mine = rivals.find((id) => data.trainers[id]!.rivalOf === side?.starterDex) ?? rivals[0]
  return ids
    .filter((id) => !rivals.includes(id) || id === mine)
    .map((id) => data.trainers[id])
    .filter((x): x is Trainer => !!x && x.team.length > 0)
    .map((x) => asSeenBy(x, side))
}

/** The upgrade level a tier's trainers fight at: the League's plus the tier's step, at most 10 (a trainer's own wins). */
export function rebattleUpgradeLevel(data: GameData, regionId: string, tier: number, trainer?: Trainer): number {
  if (trainer?.upgradeLevel != null) return trainer.upgradeLevel
  const base = leagueArea(data, regionId)?.enemyUpgradeLevel ?? data.config.enemyUpgradeLevel
  const delta = rebattleTiers(data)[tier]?.upgradeDelta ?? 0
  return delta === 'max' ? 10 : Math.max(1, Math.min(10, base + delta))
}

/** What a K.O. pays in a tier: a League trainer's ₽ for that level, × the tier's multiplier. */
export function rebattleGold(data: GameData, regionId: string, tier: number, enemyLevel: number): number {
  const league = leagueArea(data, regionId)
  if (!league) return 0
  return Math.round(trainerGoldFor(enemyLevel, league, false, data, true) * (rebattleTiers(data)[tier]?.gold ?? 1))
}

/** The key a paid K.O. is remembered by: tier, trainer, and which of their Pokémon. */
export const paidKey = (tier: number, trainerId: string, index: number) => `${tier}:${trainerId}:${index}`

/** The next fight of the region's gauntlet, as an encounter (a League battle), or null when it can't be fought. */
export function rebattleEncounter(save: SaveData, data: GameData, regionId: string): Encounter | null {
  if (regionOf(save) !== regionId || !rebattleOpen(save, data, regionId)) return null
  const tier = currentTier(save, data, regionId)
  const lineup = rebattleLineup(save, data, regionId, tier)
  const step = Math.min(rebattleProgress(save, regionId).step, lineup.length - 1)
  const t = lineup[step]
  if (!t) return null
  return {
    kind: 'gym',
    trainerId: t.id,
    name: t.name,
    spriteUrl: t.spriteUrl,
    team: dealTrainerItems(t.team, t.items, data),
    role: t.role,
    badge: null,
    index: step + 1,
    total: lineup.length,
    upgradeLevel: rebattleUpgradeLevel(data, regionId, tier, t),
    rebattle: { regionId, tier },
  }
}

export interface RebattleKO {
  regionId: string
  tier: number
  trainerId: string
  /** Which of the trainer's Pokémon fell (0-based), and whether it was their last. */
  index: number
  last: boolean
  enemyLevel: number
  fighterUid: string
}

/**
 * A K.O. in the rebattle: XP as in any fight, ₽ unless this Pokémon of this trainer already paid in this tier. The
 * trainer's last Pokémon moves the gauntlet on; the last trainer's clears the tier (the next one opens, from its first
 * trainer). No badge, no area progress.
 */
export function applyRebattleKO(save: SaveData, ko: RebattleKO, data: GameData, rng: Rng): { save: SaveData; events: RunEvent[] } {
  const league = leagueArea(data, ko.regionId)
  const events: RunEvent[] = []
  let next = league ? awardBattleXp(save, ko.enemyLevel, ko.fighterUid, getArea(data, league.id), false, data, rng, events) : save
  const prog = rebattleProgress(next, ko.regionId)
  const key = paidKey(ko.tier, ko.trainerId, ko.index)
  let paid = prog.paid
  if (!paid.includes(key)) {
    const gold = rebattleGold(data, ko.regionId, ko.tier, ko.enemyLevel)
    paid = [...paid, key]
    if (gold > 0) {
      next = { ...next, gold: next.gold + gold }
      events.push({ kind: 'gold', amount: gold })
    }
  }
  let { done, step } = prog
  if (ko.last) {
    const raw = data.trainers[ko.trainerId]
    if (raw) {
      const t = asSeenBy(raw, playerSideOf(save))
      events.push({ kind: 'gym_defeated', trainerId: t.id, name: t.name, badge: null, role: t.role })
    }
    const total = rebattleLineup(next, data, ko.regionId, ko.tier).length
    step += 1
    if (step >= total) {
      step = 0
      // Replaying Gold after every tier is cleared doesn't count past it.
      if (ko.tier === done) done += 1
      events.push({ kind: 'rebattle_cleared', regionId: ko.regionId, tier: ko.tier })
    }
  }
  return { save: withRebattle(next, ko.regionId, { done, step, paid }), events }
}

/** A loss: back to the tier's first trainer, the team healed. The ₽ won and the paid marks stay. */
export function applyRebattleLoss(save: SaveData, data: GameData, regionId: string): SaveData {
  const prog = rebattleProgress(save, regionId)
  const team = new Set(save.team)
  return withRebattle(
    { ...save, box: save.box.map((p) => (team.has(p.id) ? { ...p, currentHp: instanceMaxHp(p, data) } : p)) },
    regionId,
    { ...prog, step: 0 },
  )
}

function withRebattle(save: SaveData, regionId: string, p: RebattleProgress): SaveData {
  return { ...save, events: { ...save.events, rebattle: { ...save.events?.rebattle, [regionId]: p } } }
}
