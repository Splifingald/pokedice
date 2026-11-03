// What Admin → Analytics shows of a guest's game: a small snapshot sent with the daily ping (src/analytics/ping.ts).
// Signed-in players' profiles are built from their cloud save with the same function.
import { KANTO, regionOf } from '@/engine/regions'
import { badgeCase } from '@/engine/run'
import type { GameData, SaveData } from '@/engine/types'

/** Where a player's game stands. */
export interface PlayerSnapshot {
  /** Pokédex, sorted dex numbers. */
  dex: number[]
  areaId: string
  area: string
  team: { dex: number; level: number; shiny?: boolean }[]
  /** Pokémon in the Box (team excluded) and at the Day Care. */
  box: number
  dayCare: { dex: number; level: number }[]
  gold: number
  inventory: Record<string, number>
  badges: number
  /**
   * The Pokémon picked at the very start of the game: Kanto's starter, the first entry of Kanto's Pokédex, live or
   * parked. Churn by starter counts players by it (migration 0129); null when the save has no Kanto block, missing
   * in a snapshot sent before it.
   */
  starter?: number | null
}

/** Kanto's starter, wherever the player is now (see `PlayerSnapshot.starter`). */
export function firstStarter(save: SaveData): number | null {
  const kanto = regionOf(save) === KANTO ? save : save.parked?.[KANTO]
  return kanto?.pokedex[0] ?? null
}

export function snapshotOf(save: SaveData, data: GameData): PlayerSnapshot {
  const team = save.team.map((id) => save.box.find((p) => p.id === id)).filter((p) => !!p)
  return {
    dex: [...new Set(save.pokedex)].sort((a, b) => a - b),
    areaId: save.currentAreaId,
    area: data.areas.find((a) => a.id === save.currentAreaId)?.name ?? '',
    team: team.map((p) => ({ dex: p.dex, level: p.level, ...(p.shiny && { shiny: true }) })),
    box: save.box.length - team.length,
    dayCare: (save.dayCare?.residents ?? []).map((r) => ({ dex: r.inst.dex, level: r.inst.level })),
    gold: save.gold,
    inventory: Object.fromEntries(Object.entries(save.inventory).filter(([, n]) => n > 0)),
    badges: badgeCase(save, data).filter((b) => b.earned).length,
    starter: firstStarter(save),
  }
}
