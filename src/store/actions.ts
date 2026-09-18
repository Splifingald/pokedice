// Out-of-battle save actions: shop, upgrades, bag items from the team screen, Center team management.
import {
  applyFieldItem,
  buyComboUpgrade,
  buyDieUpgrade,
  buyItem,
  createRng,
  randomSeed,
  setTeam,
  swapIntoTeam,
  dayCareOf,
  depositError,
  depositPokemon,
  hatchEgg,
  markDayCareVisited,
  withdrawPokemon,
  type ComboKey,
  type DepositError,
  type Hatch,
  type Pickup,
  type PokeType,
} from '@/engine'
import { mutateSave, pushToast, useGame } from './game'
import { newId } from './run'

export function buy(key: string, qty = 1): boolean {
  const { data } = useGame.getState()
  const ok = mutateSave((s) => buyItem(s, key, qty, data))
  if (!ok) pushToast('Not enough Pokédollars', 'bad')
  return ok
}

export function upgradeCombo(key: ComboKey): boolean {
  const ok = mutateSave((s) => buyComboUpgrade(s, key, useGame.getState().data))
  if (!ok) pushToast('Not enough Pokédollars', 'bad')
  return ok
}

export function upgradeDie(type: PokeType): boolean {
  const ok = mutateSave((s) => buyDieUpgrade(s, type, useGame.getState().data))
  if (!ok) pushToast('Not enough Pokédollars', 'bad')
  return ok
}

/** A bag item used on a Pokémon outside battle (potions, Rare Candy). Level-ups and evolutions are announced. */
export function applyBagItem(key: string, instId: string): boolean {
  const { data, save } = useGame.getState()
  if (!save) return false
  const res = applyFieldItem(save, key, instId, data, createRng(randomSeed()))
  if (!res) {
    pushToast("It won't have any effect.", 'bad')
    return false
  }
  mutateSave(() => res.save)
  const evo = res.events.find((e) => e.kind === 'evolve')
  const up = [...res.events].reverse().find((e) => e.kind === 'level_up')
  if (evo && evo.kind === 'evolve') pushToast(`${data.species[evo.fromDex]?.name} evolved into ${data.species[evo.toDex]?.name}!`, 'good')
  else if (up && up.kind === 'level_up') pushToast(`${data.species[up.dex]?.name} grew to Lv.${up.level}!`, 'good')
  return true
}

export function reorderTeam(ids: string[]) {
  mutateSave((s) => setTeam(s, ids, useGame.getState().data))
}

export function putInTeam(inId: string, outId: string | null) {
  mutateSave((s) => swapIntoTeam(s, inId, outId, useGame.getState().data))
}

export function removeFromTeam(id: string) {
  mutateSave((s) => (s.team.length > 1 ? setTeam(s, s.team.filter((x) => x !== id), useGame.getState().data) : null))
}

// ---------------------------------------------------------------- Day Care

const DEPOSIT_REFUSED: Record<DepositError, string> = {
  full: 'The Day Care is full',
  last: 'Keep at least one Pokémon in your team',
  missing: 'That Pokémon is not with you',
}

/** The first visit ends Prof. Oak's leaderboard tutorial. */
export function visitLeaderboard(): void {
  mutateSave((s) => (s.leaderboardVisited ? null : { ...s, leaderboardVisited: true }))
}

/** The first visit ends the unlock tutorial. */
export function visitDayCare(): void {
  mutateSave((s) => (dayCareOf(s).visited ? null : markDayCareVisited(s)))
}

/** Leave a Pokémon at the Day Care: it leaves the team and the Box, and starts gaining XP. */
export function leaveAtDayCare(uid: string): boolean {
  const { save, data } = useGame.getState()
  if (!save) return false
  const why = depositError(save, uid, data)
  if (why) {
    pushToast(DEPOSIT_REFUSED[why], 'bad')
    return false
  }
  return mutateSave((s) => depositPokemon(s, uid, data, Date.now()))
}

export function pickUpFromDayCare(uid: string): Pickup | null {
  const { save, data } = useGame.getState()
  const res = save ? withdrawPokemon(save, uid, data, Date.now()) : null
  if (res) mutateSave(() => res.save)
  return res
}

/** The free Egg (once), or one bought for the configured price. It hatches on the spot. */
export function hatchDayCareEgg(free: boolean): Hatch | null {
  const { save, data } = useGame.getState()
  const res = save ? hatchEgg(save, data, createRng(randomSeed()), Date.now(), newId, { free }) : null
  if (!res) {
    if (!free) pushToast('Not enough Pokédollars', 'bad')
    return null
  }
  mutateSave(() => res.save)
  return res
}
