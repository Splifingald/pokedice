// Out-of-battle save actions: shop, upgrades, bag items from the team screen, Center team management.
import {
  applyFieldItem,
  applyLevelEvolution,
  buyComboUpgrade,
  buyDieUpgrade,
  buyItem,
  sellItem,
  createRng,
  randomSeed,
  setTeam,
  swapIntoTeam,
  dayCareOf,
  depositError,
  depositPokemon,
  hatchEgg,
  markDayCareVisited,
  markDonationSeen,
  markEventsSeen as markEventsSeenIn,
  rushEgg,
  withdrawPokemon,
  type ComboKey,
  type DepositError,
  type Hatch,
  type Pickup,
  type PokeType,
  type RushRefusal,
} from '@/engine'
import { tickDayCare } from './daycare'
import { mutateSave, pushToast, useGame } from './game'
import { newId } from './run'
import { t } from '@/i18n'

export function buy(key: string, qty = 1): boolean {
  const { data } = useGame.getState()
  const ok = mutateSave((s) => buyItem(s, key, qty, data, Date.now(), newId))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

export function sell(key: string, qty = 1): boolean {
  return mutateSave((s) => sellItem(s, key, qty, useGame.getState().data))
}

export function upgradeCombo(key: ComboKey): boolean {
  const ok = mutateSave((s) => buyComboUpgrade(s, key, useGame.getState().data))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

export function upgradeDie(type: PokeType): boolean {
  const ok = mutateSave((s) => buyDieUpgrade(s, type, useGame.getState().data))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

/**
 * A bag item used on a Pokémon outside battle (potions, revives, stones, Rare Candy). A level-up is announced; an
 * evolution is returned for the caller to play (the evolution scene). Null when it had no effect.
 */
export function applyBagItem(key: string, instId: string): { evolved: { uid: string; fromDex: number; toDex: number } | null } | null {
  const { data, save } = useGame.getState()
  if (!save) return null
  const res = applyFieldItem(save, key, instId, data, createRng(randomSeed()))
  if (!res) {
    pushToast(t('ui.toast.noEffect'), 'bad')
    return null
  }
  mutateSave(() => res.save)
  const evo = res.events.find((e) => e.kind === 'evolve')
  const up = [...res.events].reverse().find((e) => e.kind === 'level_up')
  if (up && up.kind === 'level_up')
    pushToast(t('ui.toast.grewTo', { name: data.species[up.dex]?.name ?? '', level: up.level }), 'good')
  return { evolved: evo && evo.kind === 'evolve' ? { uid: evo.uid, fromDex: evo.fromDex, toDex: evo.toDex } : null }
}

/** A Pokémon at the level cap with an evolution by level due evolves on request; returned for the evolution scene. */
export function evolveAtLevelCap(instId: string): { uid: string; fromDex: number; toDex: number } | null {
  const { data, save } = useGame.getState()
  if (!save) return null
  const res = applyLevelEvolution(save, instId, data, createRng(randomSeed()))
  const evo = res?.events.find((e) => e.kind === 'evolve')
  if (!res || !evo || evo.kind !== 'evolve') return null
  mutateSave(() => res.save)
  return { uid: evo.uid, fromDex: evo.fromDex, toDex: evo.toDex }
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

/** Sheet keys — the refusal is looked up when it is shown. */
const DEPOSIT_REFUSED: Record<DepositError, string> = {
  full: 'ui.toast.dayCareFull',
  last: 'ui.toast.keepOne',
  missing: 'ui.toast.notWithYou',
  fossil: 'ui.toast.stillReviving',
}

/** The first visit ends Prof. Oak's leaderboard tutorial. */
export function visitLeaderboard(): void {
  mutateSave((s) => (s.leaderboardVisited ? null : { ...s, leaderboardVisited: true }))
}

/** The donation pop-up was closed: it waits for the next region's 5th badge, or the admin's next reset. */
export function closeDonation(): void {
  mutateSave((s) => {
    const next = markDonationSeen(s, useGame.getState().data)
    return next === s ? null : next
  })
}

/** An event's unlock pop-up was shown: every open event counts as seen (docs/18). */
export function markEventsSeen(): void {
  mutateSave((s) => {
    const next = markEventsSeenIn(s, useGame.getState().data)
    return next === s ? null : next
  })
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
    pushToast(t(DEPOSIT_REFUSED[why]), 'bad')
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

/** The Egg waiting hatches (the gift, or one a pair left). Null when none waits. */
export function hatchDayCareEgg(): Hatch | null {
  const { save, data } = useGame.getState()
  const res = save ? hatchEgg(save, data, createRng(randomSeed()), Date.now(), newId) : null
  if (!res) return null
  mutateSave(() => res.save)
  // The clocks kept running while it waited: a check that came due meanwhile can leave the next one now.
  tickDayCare()
  return res
}

/**
 * Egg now: the checks that are due run first (one may leave an Egg on its own, and then there is nothing to buy),
 * then the next check runs early for `rushPrice` and its Egg hatches at once: one commit, one moment.
 */
export function rushDayCareEgg(): { hatch: Hatch } | { refused: RushRefusal } {
  tickDayCare()
  const { save, data } = useGame.getState()
  if (!save) return { refused: 'pair' }
  const now = Date.now()
  const rng = createRng(randomSeed())
  const rushed = rushEgg(save, data, now, rng)
  if ('refused' in rushed) return rushed
  const hatch = hatchEgg(rushed.save, data, rng, now, newId)
  if (!hatch) return { refused: 'pair' }
  mutateSave(() => hatch.save)
  return { hatch }
}

/** The residents the Day Care sent home when it had too many: read once, for the toast. */
export function takeDayCareNotice(): number[] {
  const dex = useGame.getState().save?.dayCareNotice?.dex ?? []
  mutateSave((s) => {
    if (!s.dayCareNotice) return null
    const { dayCareNotice: _shown, ...rest } = s
    return rest
  })
  return dex
}
