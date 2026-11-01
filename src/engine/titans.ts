// Paldea's Titans (docs/62 §7): an area's boss fought in two phases. The first is the Titan at its level; once it
// falls it eats a Herba Mystica and comes straight back bigger (×HP, extra dice of its type), the team keeping its HP,
// one on one. Dondozo's first phase is a double with Tatsugiri, who then jumps into its mouth (Commander). A Titan is
// beaten, never caught; it leaves Pokédollars and items. Only while the switch is on: otherwise the area has no boss.
import type { FoeSeed } from './battle'
import { eventOpenTo } from './events'
import type { PlayerSide } from './rival'
import type { BossDef, DieType, GameData, SaveData } from './types'

/** The Titans are switched on for whoever is playing. */
export const titansOn = (data: GameData): boolean => eventOpenTo(data.config.titans?.access, data)

/** The species the Titan is for this player: Iron Treads rather than Great Tusk for one in Green's look. */
export const titanDexFor = (b: BossDef, side?: PlayerSide | null): number =>
  side?.character === 'green' && b.titan?.versionDex ? b.titan.versionDex : b.dex

const auraDice = (data: GameData, dex: number, n: number): DieType[] => {
  const sp = data.species[dex]
  return sp && n > 0 ? Array.from({ length: Math.floor(n) }, () => sp.type1 as DieType) : []
}

/**
 * The Titan's fight: its foes by phase, how many are out at once and how many of yours. One on one, its two phases; a
 * Titan with a partner, two on two, then the Titan alone with the Commander's numbers.
 */
export function titanFight(b: BossDef, data: GameData, side?: PlayerSide | null): { foes: FoeSeed[]; foeField: number; ownField: number } {
  const cfg = data.config.titans
  const dex = titanDexFor(b, side)
  const partner = b.titan?.partner && data.species[b.titan.partner.dex] ? b.titan.partner : null
  const hpTimes = Math.max(1, (partner ? cfg?.commanderHpTimes : cfg?.hpTimes) ?? 2)
  const extra = auraDice(data, dex, (partner ? cfg?.commanderExtraDice : cfg?.extraDice) ?? 1)
  const second: FoeSeed = { dex, level: b.level, phase: 2, hpTimes, aura: 'titan', ...(extra.length && { extraDice: extra }) }
  if (partner)
    return {
      foes: [{ dex, level: b.level, phase: 1 }, { dex: partner.dex, level: partner.level, phase: 1 }, second],
      foeField: 2,
      ownField: 2,
    }
  return { foes: [{ dex, level: b.level, phase: 1 }, second], foeField: 1, ownField: 1 }
}

/** A Titan beaten (docs/62 §7): its Pokédollars and items, the Titans' config's. */
export function titanReward(save: SaveData, data: GameData): { save: SaveData; gold: number; items: { key: string; qty: number }[] } {
  const cfg = data.config.titans
  const gold = Math.max(0, Math.floor(cfg?.gold ?? 0))
  const items = (cfg?.items ?? []).filter((i) => data.items[i.key] && i.qty > 0)
  const inventory = { ...save.inventory }
  for (const i of items) inventory[i.key] = (inventory[i.key] ?? 0) + i.qty
  return { save: { ...save, gold: save.gold + gold, inventory }, gold, items }
}

/** The Titans this save has beaten, of a region's (the Pokédex page's "Titans beaten" row). */
export function titansBeaten(save: SaveData, data: GameData, regionId: string): { beaten: number; total: number } {
  let beaten = 0
  let total = 0
  for (const a of data.areas) {
    if ((a.regionId ?? 'kanto') !== regionId) continue
    for (const b of a.legendaryBoss ?? []) {
      if (!b.titan) continue
      total += 1
      if (save.areaProgress[a.id]?.bossesDefeated.includes(b.dex)) beaten += 1
    }
  }
  return { beaten, total }
}
