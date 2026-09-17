// Analytics events, derived by comparing each committed save with the one before it — so every level-up, purchase or
// badge is caught however it happened (battle, bag, shop, dev tools), without hooks scattered through the actions.
import { isAreaUnlocked } from '@/engine/run'
import type { GameData, SaveData } from '@/engine/types'

export type AnalyticsEvent =
  | { kind: 'login'; params: { method: 'session' } }
  | { kind: 'game_started'; params: { starterDex: number | null; character: string | null } }
  | { kind: 'level_up'; params: { uid: string; dex: number; from: number; to: number } }
  | { kind: 'evolved'; params: { uid: string; fromDex: number; toDex: number; level: number } }
  | { kind: 'area_unlocked'; params: { areaId: string; area: string; hidden: boolean } }
  | { kind: 'badge'; params: { trainerId: string; leader: string; badge: string; areaId: string } }
  | { kind: 'item_bought'; params: { key: string; qty: number; cost: number } }
  | { kind: 'item_used'; params: { key: string; qty: number; where: UseContext } }
  | {
      kind: 'upgrade'
      params: { track: 'combo' | 'die'; key: string; from: number; to: number; cost: number }
    }

export type AnalyticsKind = AnalyticsEvent['kind']
export type UseContext = 'battle' | 'catch' | 'field'

export const ANALYTICS_KINDS: AnalyticsKind[] = [
  'login',
  'game_started',
  'level_up',
  'evolved',
  'area_unlocked',
  'badge',
  'item_bought',
  'item_used',
  'upgrade',
]

const levelsDiff = <K extends string>(a: Record<K, number>, b: Record<K, number>) =>
  (Object.keys(b) as K[])
    .filter((k) => (b[k] ?? 0) > (a[k] ?? 0))
    .map((k) => ({ key: k, from: a[k] ?? 0, to: b[k] }))

/** What changed between two consecutive saves. `where` says what the player was doing (for items used). */
export function diffSaves(
  prev: SaveData | null,
  next: SaveData | null,
  data: GameData,
  where: UseContext = 'field',
): AnalyticsEvent[] {
  if (!next) return []
  const prevIds = new Set(prev?.box.map((p) => p.id) ?? [])
  // A save with none of the previous Pokémon is a new game (or an imported one), not progress.
  if (!prev || !next.box.some((p) => prevIds.has(p.id))) {
    const starter = next.box[0]
    return [
      {
        kind: 'game_started',
        params: { starterDex: starter?.dex ?? null, character: next.player?.character ?? null },
      },
    ]
  }

  const out: AnalyticsEvent[] = []
  const before = new Map(prev.box.map((p) => [p.id, p]))
  for (const p of next.box) {
    const b = before.get(p.id)
    if (!b) continue
    if (p.level > b.level)
      out.push({ kind: 'level_up', params: { uid: p.id, dex: p.dex, from: b.level, to: p.level } })
    if (p.dex !== b.dex)
      out.push({ kind: 'evolved', params: { uid: p.id, fromDex: b.dex, toDex: p.dex, level: p.level } })
  }

  for (const a of data.areas)
    if (!isAreaUnlocked(prev, a.id, data) && isAreaUnlocked(next, a.id, data))
      out.push({ kind: 'area_unlocked', params: { areaId: a.id, area: a.name, hidden: a.hidden } })

  for (const [areaId, p] of Object.entries(next.areaProgress)) {
    const had = new Set(prev.areaProgress[areaId]?.gymsDefeated ?? [])
    for (const id of p.gymsDefeated) {
      const t = data.trainers[id]
      if (!had.has(id) && t?.badge)
        out.push({ kind: 'badge', params: { trainerId: id, leader: t.name, badge: t.badge, areaId } })
    }
  }

  const spent = Math.max(0, prev.gold - next.gold)
  const upgrades = [
    ...levelsDiff(prev.comboLevels, next.comboLevels).map((u) => ({ ...u, track: 'combo' as const })),
    ...levelsDiff(prev.dieLevels, next.dieLevels).map((u) => ({ ...u, track: 'die' as const })),
  ]
  for (const u of upgrades)
    out.push({
      kind: 'upgrade',
      params: { track: u.track, key: u.key, from: u.from, to: u.to, cost: upgrades.length === 1 ? spent : 0 },
    })

  const keys = new Set([...Object.keys(prev.inventory), ...Object.keys(next.inventory)])
  const gained: { key: string; qty: number }[] = []
  for (const key of keys) {
    const delta = (next.inventory[key] ?? 0) - (prev.inventory[key] ?? 0)
    if (delta < 0) out.push({ kind: 'item_used', params: { key, qty: -delta, where } })
    else if (delta > 0) gained.push({ key, qty: delta })
  }
  // Gold went down while items came in (and nothing was upgraded): a Poké Mart purchase. Loot never costs gold.
  if (spent > 0 && !upgrades.length)
    for (const g of gained)
      out.push({
        kind: 'item_bought',
        params: { ...g, cost: gained.length === 1 ? spent : (data.items[g.key]?.price ?? 0) * g.qty },
      })

  return out
}
