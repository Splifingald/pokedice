// The Underground (docs/31), the game's side: the save's event block kept in step with the server's clock, and the
// player's actions (buy kits, open a wall, strike, take the haul, upgrade the pickaxe, sell orbs). Every rule and
// number is the engine's (engine/underground.ts); this only feeds it the time, the dice and the team.
import { useEffect } from 'react'
import { create } from 'zustand'
import {
  applyHaul,
  buyKits,
  createRng,
  markUgRulesSeen,
  openWall,
  randomSeed,
  settleUnderground,
  strike,
  undergroundLive,
  upgradePickaxe,
  type HaulLine,
  type LiveEvent,
  type UgTeam,
  type UndergroundSave,
} from '@/engine'
import { mutateSave, useGame } from './game'
import { newId } from './run'
import { serverNow, useServerNow } from './serverTime'

/** The player's Underground team, as the server last told it (docs/31 §3); null = solo, or not known. */
export const useUgTeam = create<{ team: UgTeam | null }>(() => ({ team: null }))

let rng = createRng(randomSeed())

/** The save's block in step with the event: a new event, an event over, free kits come in. */
export function settleUgNow(): void {
  const { data } = useGame.getState()
  mutateSave((s) => {
    const next = settleUnderground(s, data, serverNow())
    return next === s ? null : next
  })
}

/** Mounted once (GameLayout): settles on start, whenever the server's time becomes known, and every 30 s. */
export function useUndergroundSettle(): void {
  const known = useServerNow(30_000)
  const on = useGame((s) => s.data.config.underground?.access)
  useEffect(() => {
    if (known != null) settleUgNow()
  }, [known, on])
}

/** The Underground for this player right now, re-read every `ms`. */
export function useUnderground(ms = 1000): {
  live: LiveEvent | null
  now: number | null
  u: UndergroundSave | null
} {
  const now = useServerNow(ms)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const live = save ? undergroundLive(save, data, now) : null
  return { live, now, u: live && save?.underground?.eventId === live.id ? save.underground : null }
}

const act = (fn: Parameters<typeof mutateSave>[0]): boolean => {
  settleUgNow()
  return mutateSave(fn)
}

export const ugBuyKits = (qty: number): boolean =>
  act((s) => buyKits(s, useGame.getState().data, serverNow(), qty))

export const ugOpenWall = (): boolean => act((s) => openWall(s, useGame.getState().data, serverNow(), rng))

/** A strike on the open wall: the face that came up and its roll, or null. */
export function ugStrike(tile: number): { face: number; roll: number } | null {
  const { save, data } = useGame.getState()
  if (!save) return null
  rng = createRng(randomSeed() ^ rng.getState())
  const r = strike(save, data, tile, rng)
  if (!r) return null
  mutateSave(() => r.save)
  return { face: r.face, roll: r.roll }
}

/** The finished wall's haul, into the save once; orbs owed to teammates wait in the save's outbox for the server. */
export function ugTakeHaul(): HaulLine[] | null {
  const { save, data } = useGame.getState()
  if (!save) return null
  const r = applyHaul(save, data, useUgTeam.getState().team, Date.now(), newId)
  if (!r) return null
  mutateSave(() => r.save)
  return r.lines
}

export const ugUpgrade = (): boolean => act((s) => upgradePickaxe(s, useGame.getState().data, serverNow()))

export function ugRulesSeen(): void {
  mutateSave((s) => {
    const next = markUgRulesSeen(s)
    return next === s ? null : next
  })
}
