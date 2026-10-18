// Out-of-battle save actions: shop, upgrades, bag items from the team screen, team changes (at a Center, at a portal's
// way in).
import {
  applyFieldItem,
  applyLevelEvolution,
  buyComboUpgrade,
  buyDieUpgrade,
  buyGem as buyGemIn,
  buyGeneral,
  buyItem,
  markPowerRulesSeen as markPowerRulesSeenIn,
  markGeneralRulesSeen as markGeneralRulesSeenIn,
  sellItem,
  createRng,
  randomSeed,
  releaseHomer,
  renamePokemon,
  setTeam,
  swapIntoTeam,
  teamSwapsOpen,
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
  type GeneralId,
  type Hatch,
  type Pickup,
  type PokeType,
  type PowerKind,
  type RushRefusal,
} from '@/engine'
import { tickDayCare } from './daycare'
import { currentLive } from './live'
import { mutateSave, pushToast, useGame } from './game'
import { newId } from './run'
import { t } from '@/i18n'

export function buy(key: string, qty = 1): boolean {
  const { data } = useGame.getState()
  const ok = mutateSave((s) => buyItem(s, key, qty, data, Date.now(), newId))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

/** A Mega Gem from this region's shelf (docs/31): once each, never sold. */
export function buyGem(key: string): boolean {
  const ok = mutateSave((s) => buyGemIn(s, useGame.getState().data, key))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

/** A battle power's rules pop-up has been shown (docs/31): it doesn't open by itself again. */
export function markPowerRulesSeen(kind: PowerKind): void {
  mutateSave((s) => (s.powers?.seen?.includes(kind) ? null : markPowerRulesSeenIn(s, kind)))
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

/** Whether the team may change right now (a Pokémon Center, a portal's way in): the engine's rule. */
export function swapsOpenNow(): boolean {
  const { save, data, run } = useGame.getState()
  return !!save && teamSwapsOpen(save, data, run)
}

export function putInTeam(inId: string, outId: string | null) {
  if (!swapsOpenNow()) return
  mutateSave((s) => swapIntoTeam(s, inId, outId, useGame.getState().data))
}

export function removeFromTeam(id: string) {
  if (!swapsOpenNow()) return
  mutateSave((s) => (s.team.length > 1 ? setTeam(s, s.team.filter((x) => x !== id), useGame.getState().data) : null))
}

/** Gives one of your Pokémon a nickname; an empty one (or its species' name) takes it away. */
export function nicknamePokemon(id: string, name: string): boolean {
  return mutateSave((s) => renamePokemon(s, useGame.getState().data, id, name))
}

/** Lets a small world's Pokémon waiting to unlock in its region go (docs/26 §1): the only thing it can do but wait. */
export function letHomerGo(id: string): boolean {
  return mutateSave((s) => releaseHomer(s, id))
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

/** Versus's rules pop-up was shown (or its page opened): it doesn't open by itself again. */
/** One more level of a General upgrade (docs/25), with the live region's ₽. */
export function upgradeGeneral(id: GeneralId): boolean {
  const ok = mutateSave((s) => buyGeneral(s, useGame.getState().data, id))
  if (!ok) pushToast(t('ui.toast.tooPoor'), 'bad')
  return ok
}

/** The General tab's rules have been shown (its pop-up, or the tab opened). */
export function markGeneralRulesSeen(): void {
  mutateSave((s) => (s.general?.rulesSeen ? null : markGeneralRulesSeenIn(s)))
}

export function markVersusRulesSeen(): void {
  mutateSave((s) => (s.versusRulesSeen ? null : { ...s, versusRulesSeen: true }))
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
  const res = save ? hatchEgg(save, data, createRng(randomSeed()), Date.now(), newId, currentLive()) : null
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
  const hatch = hatchEgg(rushed.save, data, rng, now, newId, currentLive())
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
