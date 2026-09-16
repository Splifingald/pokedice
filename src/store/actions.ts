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
  type ComboKey,
  type PokeType,
} from '@/engine'
import { mutateSave, pushToast, useGame } from './game'

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
