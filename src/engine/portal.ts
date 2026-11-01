// The portal run (docs/28, the user's spec of 2026-10-15): Distortion World's mode. Giratina is breaking into the world
// and the player closes its distortion portals from the inside, in one go: the team is healed on the way in, there is no
// Pokémon Center and no way out but a full K.O.; an endless deck of wild Pokémon (that can't be caught) and finds, each
// cycle ending on a distortion that offers a boon. The last portal closed wins the run for good and opens the area's
// raid (shiny Giratina, Lv.100). A wipe keeps XP, ₽ and items, but the portals closed go back to 0 and the run's boons
// are lost. Every number is the area's (`Area.mode`, Admin → Areas), the switch the admin's (`portalRun`).
import { shuffle } from './deal'
import { reviveHp } from './economy'
import { rollWild, type Encounter, type EncounterContext } from './encounters'
import { drawLoot } from './items'
import { instanceMaxHp, instanceStats } from './progression'
import { portalModeOf } from './portalMode'
import type { Rng } from './rng'
import type { UpgradeLevels } from './damage'
import type {
  Area,
  AreaProgress,
  DieType,
  DistortionKind,
  DistortionOffer,
  GameData,
  PokemonInstance,
  PokeType,
  PortalCard,
  PortalRunMode,
  PortalSkin,
  PortalState,
  SaveData,
} from './types'

export {
  DEFAULT_PORTAL_RUN,
  normalisePortal,
  PLATE_BARS,
  portalModeOf,
  portalRaidRules,
  portalRunsOn,
  portalSkin,
} from './portalMode'

/**
 * The run's rules pop-up has been seen for this look: each skin has its own flag (docs/61 §4.5), so a player who read
 * Distortion World's rules last Halloween still gets the Stairway of Plates' once.
 */
export const portalRulesSeen = (save: SaveData, skin: PortalSkin): boolean =>
  !!(skin === 'plates' ? save.platesRulesSeen : save.portalRulesSeen)

/** The rules pop-up of this look has been shown (the same save when it already was). */
export function markPortalRulesSeen(save: SaveData, skin: PortalSkin): SaveData {
  if (portalRulesSeen(save, skin)) return save
  return skin === 'plates' ? { ...save, platesRulesSeen: true } : { ...save, portalRulesSeen: true }
}

const EMPTY: PortalState = { active: false, closed: 0, deck: [] }

const progressAt = (save: SaveData, areaId: string): AreaProgress => ({
  roundsDone: 0,
  cleared: false,
  bossDefeated: false,
  bossesDefeated: [],
  gymsDefeated: [],
  ...save.areaProgress[areaId],
})

const areaOf = (data: GameData, areaId: string | null | undefined): Area | undefined =>
  areaId ? data.areas.find((a) => a.id === areaId) : undefined

/** Where the run stands in this area of the region being played (nothing yet: not in a run, nothing closed). */
export const portalStateOf = (save: SaveData, areaId: string): PortalState =>
  save.areaProgress[areaId]?.portal ?? EMPTY

function withPortal(save: SaveData, areaId: string, portal: PortalState): SaveData {
  return {
    ...save,
    areaProgress: { ...save.areaProgress, [areaId]: { ...progressAt(save, areaId), portal } },
  }
}

const teamOf = (save: SaveData): PokemonInstance[] =>
  save.team.map((id) => save.box.find((p) => p.id === id)).filter((p): p is PokemonInstance => !!p)

const mapTeam = (save: SaveData, f: (p: PokemonInstance) => PokemonInstance): SaveData => {
  const team = new Set(save.team)
  return { ...save, box: save.box.map((p) => (team.has(p.id) ? f(p) : p)) }
}

/** The whole team back to full HP, K.O. or not (the way in, the way out). */
const healTeam = (save: SaveData, data: GameData): SaveData =>
  mapTeam(save, (p) => (data.species[p.dex] ? { ...p, currentHp: instanceMaxHp(p, data) } : p))

// ------------------------------------------------------------------ in a run or not

/** A portal run is under way in this area (switched on, entered, not won nor wiped). */
export function inPortalRun(save: SaveData, data: GameData, areaId: string | null | undefined): boolean {
  const area = areaOf(data, areaId)
  return !!area && !!portalModeOf(area, data) && portalStateOf(save, area.id).active
}

/**
 * The area the player can't leave: the region being played's current area, while a portal run is under way there.
 * Null everywhere else (the Map, the menus, the way back from a small world all work as usual).
 */
export function portalLock(save: SaveData | null, data: GameData): Area | null {
  if (!save) return null
  const area = areaOf(data, save.currentAreaId)
  return area && inPortalRun(save, data, area.id) ? area : null
}

/** The run is won: the area is only its raid now (no more runs). */
export const portalWon = (save: SaveData, data: GameData, areaId: string): boolean =>
  !!portalModeOf(areaOf(data, areaId), data) && !!portalStateOf(save, areaId).won

/** A run can start here: a portal area, switched on, not won, not already under way. */
export function canStartPortal(save: SaveData, data: GameData, areaId: string): boolean {
  if (!portalModeOf(areaOf(data, areaId), data)) return false
  const p = portalStateOf(save, areaId)
  return !p.active && !p.won
}

// ------------------------------------------------------------------ the deck

/**
 * One cycle of the deck, in draw order from the end: the wild Pokémon and the finds shuffled, then the distortion,
 * always last (it sits at index 0).
 */
export function portalCycle(mode: PortalRunMode, rng: Rng): PortalCard[] {
  const cards: PortalCard[] = [
    ...Array.from({ length: mode.wild }, (): PortalCard => 'wild'),
    ...Array.from({ length: mode.items }, (): PortalCard => 'item'),
  ]
  return ['distortion', ...shuffle(cards, rng)]
}

/**
 * READY!: into the run. The team is fully healed, nothing is closed yet, the first cycle is dealt. Null when a run
 * can't start here.
 */
export function startPortalRun(save: SaveData, data: GameData, areaId: string, rng: Rng): SaveData | null {
  const mode = portalModeOf(areaOf(data, areaId), data)
  if (!mode || !canStartPortal(save, data, areaId)) return null
  const before = portalStateOf(save, areaId)
  const healed = healTeam(save, data)
  return withPortal(healed, areaId, {
    active: true,
    closed: 0,
    deck: portalCycle(mode, rng),
    tries: (before.tries ?? 0) + 1,
  })
}

/** The next card of the run (a new cycle when the last one is spent). Null outside a run, or while a distortion waits. */
export function drawPortalCard(
  save: SaveData,
  data: GameData,
  areaId: string,
  rng: Rng,
): { save: SaveData; card: PortalCard } | null {
  const mode = portalModeOf(areaOf(data, areaId), data)
  const p = portalStateOf(save, areaId)
  if (!mode || !p.active || p.offers?.length) return null
  const deck = p.deck.length ? [...p.deck] : portalCycle(mode, rng)
  const card = deck.pop()!
  return { save: withPortal(save, areaId, { ...p, deck }), card }
}

/** The card the run turns over next (the deck is drawn from its end), or null between cycles, outside a run or with a choice waiting. */
export function portalNextCard(save: SaveData, areaId: string): PortalCard | null {
  const p = portalStateOf(save, areaId)
  return p.active && !p.offers?.length ? (p.deck[p.deck.length - 1] ?? null) : null
}

/** What a wild card or a find card turns into: a wild Pokémon from the area's pool, or a find from its loot. */
export function portalEncounter(
  ctx: EncounterContext,
  card: 'wild' | 'item',
  rng: Rng,
): { encounter: Encounter; lootDeck: string[] | null } | null {
  if (card === 'item') {
    const loot = drawLoot(ctx.area, ctx.progress, ctx.data, rng)
    if (loot)
      return {
        encounter: { kind: 'item', entryId: loot.entry.id, itemKey: loot.entry.itemKey, qty: loot.qty },
        lootDeck: loot.lootDeck,
      }
  }
  const wild = rollWild(ctx, rng)
  return wild ? { encounter: wild, lootDeck: null } : null
}

/** Its wild Pokémon can't be caught (they are Giratina's, docs/28): no throw after a win. */
export const portalNoCatch = (save: SaveData, data: GameData, areaId: string | null | undefined): boolean =>
  inPortalRun(save, data, areaId)

// ------------------------------------------------------------------ the run's bonuses

/** A Pokémon's dice count with its run dice (what the 8-dice cap reads). */
export function portalDiceCount(inst: PokemonInstance, data: GameData, portal: PortalState): number {
  if (!data.species[inst.dex]) return 0
  return instanceStats(inst, data).dice.length + (portal.dice?.[inst.id]?.length ?? 0)
}

/** The typed dice the team rolls (their kinds, once each, in team order): the boost's types come from these. */
export function teamDiceTypes(save: SaveData, data: GameData, portal: PortalState): PokeType[] {
  const out: PokeType[] = []
  for (const p of teamOf(save)) {
    if (!data.species[p.dex]) continue
    const dice: DieType[] = [...instanceStats(p, data).dice, ...(portal.dice?.[p.id] ?? [])]
    for (const d of dice) if (d !== 'base' && !out.includes(d)) out.push(d)
  }
  return out
}

/** The kinds of boon this distortion could offer now, with their weights (an empty list: none can help). */
export function eligibleOffers(
  save: SaveData,
  data: GameData,
  mode: PortalRunMode,
  portal: PortalState,
): DistortionKind[] {
  const team = teamOf(save).filter((p) => data.species[p.dex])
  const out: DistortionKind[] = []
  if (
    mode.heal.weight > 0 &&
    mode.heal.percent > 0 &&
    team.some((p) => p.currentHp > 0 && p.currentHp < instanceMaxHp(p, data))
  )
    out.push('heal')
  if (mode.revive.weight > 0 && team.some((p) => p.currentHp <= 0)) out.push('revive')
  if (mode.boost.weight > 0 && mode.boost.amount > 0 && teamDiceTypes(save, data, portal).length)
    out.push('boost')
  if (mode.die.weight > 0 && team.some((p) => portalDiceCount(p, data, portal) < mode.die.maxDice))
    out.push('die')
  if (mode.item.weight > 0 && mode.item.items.some((i) => i.weight > 0 && data.items[i.key])) out.push('item')
  return out
}

const weightOf = (mode: PortalRunMode, kind: DistortionKind): number => mode[kind].weight

/** One boon of this kind, with who and what it names drawn now. */
function makeOffer(
  kind: DistortionKind,
  save: SaveData,
  data: GameData,
  mode: PortalRunMode,
  portal: PortalState,
  rng: Rng,
): DistortionOffer {
  const team = teamOf(save).filter((p) => data.species[p.dex])
  switch (kind) {
    case 'heal':
      return { kind, percent: mode.heal.percent }
    case 'revive':
      return { kind, uid: rng.pick(team.filter((p) => p.currentHp <= 0)).id }
    case 'boost':
      return { kind, type: rng.pick(teamDiceTypes(save, data, portal)), amount: mode.boost.amount }
    case 'die': {
      const p = rng.pick(team.filter((x) => portalDiceCount(x, data, portal) < mode.die.maxDice))
      const sp = data.species[p.dex]!
      const types = [sp.type1, ...(sp.type2 ? [sp.type2] : [])] as PokeType[]
      return { kind, uid: p.id, type: rng.pick(types) }
    }
    case 'item':
      return { kind }
  }
}

/** The boons a distortion offers: `offers` of distinct kinds drawn by weight among those that can help now. */
export function drawOffers(
  save: SaveData,
  data: GameData,
  mode: PortalRunMode,
  portal: PortalState,
  rng: Rng,
): DistortionOffer[] {
  const left = eligibleOffers(save, data, mode, portal)
  const out: DistortionOffer[] = []
  while (out.length < mode.offers && left.length) {
    const kind = rng.weighted(left, (k) => weightOf(mode, k))
    if (!kind) break
    left.splice(left.indexOf(kind), 1)
    out.push(makeOffer(kind, save, data, mode, portal, rng))
  }
  return out
}

/**
 * The distortion card is met. The last one (the run's `portals`-th) wins the run (`victory`); any other opens: its
 * boons are drawn and wait in the save for the pick. With no boon that can help, it closes at once (`closed`).
 */
export function openDistortion(
  save: SaveData,
  data: GameData,
  areaId: string,
  rng: Rng,
): { save: SaveData; victory: boolean; closedAtOnce: boolean } | null {
  const mode = portalModeOf(areaOf(data, areaId), data)
  const p = portalStateOf(save, areaId)
  if (!mode || !p.active) return null
  if (p.closed + 1 >= mode.portals)
    return { save: winPortal(save, data, areaId), victory: true, closedAtOnce: false }
  const offers = drawOffers(save, data, mode, p, rng)
  if (!offers.length)
    return {
      save: withPortal(save, areaId, { ...p, closed: p.closed + 1, offers: null }),
      victory: false,
      closedAtOnce: true,
    }
  return { save: withPortal(save, areaId, { ...p, offers }), victory: false, closedAtOnce: false }
}

/** The rare item a boon of that kind gives, drawn by the admin's odds. */
const drawItem = (mode: PortalRunMode, data: GameData, rng: Rng): string | null =>
  rng.weighted(
    mode.item.items.filter((i) => data.items[i.key]),
    (i) => i.weight,
  )?.key ?? null

/** HP a boon's revive brings back: a Revive's (its item's percent, else half). */
export function portalReviveHp(inst: PokemonInstance, data: GameData): number {
  const fx = data.items.revive?.effect
  return reviveHp(fx?.kind === 'revive' ? fx.percent : 50, instanceMaxHp(inst, data))
}

/**
 * The player picks a boon: it applies (a heal and a revive at once, a boost or a die for the rest of the run, an item
 * into the bag) and the distortion closes. `itemKey` names the item a find boon gave. Null for a pick that isn't offered.
 */
export function pickDistortion(
  save: SaveData,
  data: GameData,
  areaId: string,
  index: number,
  rng: Rng,
): { save: SaveData; offer: DistortionOffer; itemKey?: string } | null {
  const mode = portalModeOf(areaOf(data, areaId), data)
  const p = portalStateOf(save, areaId)
  const offer = p.offers?.[index]
  if (!mode || !p.active || !offer) return null
  let next = save
  let portal: PortalState = { ...p, closed: p.closed + 1, offers: null }
  let itemKey: string | undefined
  switch (offer.kind) {
    case 'heal':
      next = mapTeam(next, (x) => {
        if (x.currentHp <= 0 || !data.species[x.dex]) return x
        const max = instanceMaxHp(x, data)
        return {
          ...x,
          currentHp: Math.min(max, x.currentHp + Math.max(1, Math.round((max * offer.percent) / 100))),
        }
      })
      break
    case 'revive':
      next = mapTeam(next, (x) =>
        x.id === offer.uid && x.currentHp <= 0 ? { ...x, currentHp: portalReviveHp(x, data) } : x,
      )
      break
    case 'boost':
      portal = {
        ...portal,
        boosts: { ...p.boosts, [offer.type]: (p.boosts?.[offer.type] ?? 0) + offer.amount },
      }
      break
    case 'die': {
      const inst = next.box.find((x) => x.id === offer.uid)
      if (inst && portalDiceCount(inst, data, p) < mode.die.maxDice)
        portal = { ...portal, dice: { ...p.dice, [offer.uid]: [...(p.dice?.[offer.uid] ?? []), offer.type] } }
      break
    }
    case 'item': {
      const key = drawItem(mode, data, rng)
      if (key) {
        itemKey = key
        next = { ...next, inventory: { ...next.inventory, [key]: (next.inventory[key] ?? 0) + 1 } }
      }
      break
    }
  }
  return { save: withPortal(next, areaId, portal), offer, ...(itemKey && { itemKey }) }
}

// ------------------------------------------------------------------ how it ends

/**
 * Every portal closed: the run is won for good. Its boons go, the team is healed, and the area is only its raid now
 * (`portalWon`). The victory's moment is due (`wonSeen` false).
 */
export function winPortal(save: SaveData, data: GameData, areaId: string): SaveData {
  const mode = portalModeOf(areaOf(data, areaId), data)
  const p = portalStateOf(save, areaId)
  return withPortal(healTeam(save, data), areaId, {
    active: false,
    closed: mode?.portals ?? p.closed + 1,
    deck: [],
    won: true,
    wonSeen: false,
    ...(p.tries != null && { tries: p.tries }),
  })
}

/** The victory's moment has played. */
export function markPortalWonSeen(save: SaveData, areaId: string): SaveData {
  const p = portalStateOf(save, areaId)
  return p.won && !p.wonSeen ? withPortal(save, areaId, { ...p, wonSeen: true }) : save
}

/** The victory's moment is due here. */
export const portalVictoryDue = (save: SaveData, data: GameData, areaId: string): boolean =>
  portalWon(save, data, areaId) && !portalStateOf(save, areaId).wonSeen

/**
 * The whole team K.O. in a run: XP, ₽ and items stay, but the portals closed go back to 0, the run's boons are lost
 * and the team is healed, back in the world to try again. Unchanged outside a run.
 */
export function portalWipe(save: SaveData, data: GameData, areaId: string): SaveData {
  if (!inPortalRun(save, data, areaId)) return save
  const p = portalStateOf(save, areaId)
  return withPortal(healTeam(save, data), areaId, {
    active: false,
    closed: 0,
    deck: [],
    ...(p.tries != null && { tries: p.tries }),
  })
}

// ------------------------------------------------------------------ in battle

/** The run's damage boosts on your side's tracks: + `amount` on every attack of that type (UpgradeLevels.typeFlat). */
export function portalLevels(
  levels: UpgradeLevels,
  save: SaveData,
  data: GameData,
  areaId: string | null | undefined,
): UpgradeLevels {
  if (!areaId || !inPortalRun(save, data, areaId)) return levels
  const boosts = portalStateOf(save, areaId).boosts
  return boosts && Object.keys(boosts).length ? { ...levels, typeFlat: { ...boosts } } : levels
}

/** A team member's run dice, and the cap a battle keeps them under (none outside a run). */
export function portalDiceFor(
  save: SaveData,
  data: GameData,
  areaId: string | null | undefined,
  uid: string,
): { extraDice: PokeType[]; diceCap: number } | null {
  if (!areaId || !inPortalRun(save, data, areaId)) return null
  const mode = portalModeOf(areaOf(data, areaId), data)!
  const extra = portalStateOf(save, areaId).dice?.[uid]
  return extra?.length ? { extraDice: [...extra], diceCap: mode.die.maxDice } : null
}
