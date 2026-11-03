/**
 * Real-player battles (docs/54): which areas deal the card, and how many a round. The user's rule (2026-10-31): the
 * areas after their region's first gym that have trainers and no gym leader of their own; two in each Victory Road.
 *
 *   tsx scripts/area-versus-cards.ts          writes `versus` into src/data/areas.json (an area that has one keeps it)
 *   tsx scripts/area-versus-cards.ts --sql    prints the same as an update for migration 0099 (between its GENERATED lines)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Area } from '../src/engine/types'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'areas.json')

/** Area id → its cards a round. */
export function versusPicks(areas: readonly Area[]): Map<string, number> {
  const byRegion = new Map<string, Area[]>()
  for (const a of areas) {
    const r = a.regionId ?? 'kanto'
    byRegion.set(r, [...(byRegion.get(r) ?? []), a])
  }
  const picks = new Map<string, number>()
  for (const list of byRegion.values()) {
    const ordered = [...list].sort((x, y) => x.orderIndex - y.orderIndex)
    const firstGym = ordered.findIndex((a) => a.gyms.length > 0)
    if (firstGym < 0) continue
    ordered.forEach((a, i) => {
      if (i <= firstGym || a.gyms.length || !a.trainerPool.length || !(a.encounterWeights.trainer > 0)) return
      picks.set(a.id, /victory road/i.test(a.name) ? 2 : 1)
    })
  }
  return picks
}

export function picksSql(picks: Map<string, number>): string {
  const rows = [...picks].map(([id, n]) => `('${id}', ${n})`).join(',\n  ')
  return [
    `update areas a set encounter_weights = coalesce(a.encounter_weights, '{}'::jsonb) || jsonb_build_object('versus', v.n)`,
    `from (values\n  ${rows}\n) v(id, n)`,
    `where a.id::text = v.id and not (coalesce(a.encounter_weights, '{}'::jsonb) ? 'versus');`,
  ].join('\n')
}

if (process.argv[1]?.endsWith('area-versus-cards.ts')) {
  const areas = JSON.parse(readFileSync(FILE, 'utf8')) as Area[]
  const picks = versusPicks(areas)
  if (process.argv.includes('--sql')) {
    console.log(picksSql(picks))
  } else {
    const out = areas.map((a) =>
      picks.has(a.id) && a.encounterWeights.versus == null
        ? { ...a, encounterWeights: { ...a.encounterWeights, versus: picks.get(a.id)! } }
        : a,
    )
    writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n')
    console.log(
      `${picks.size} areas deal a real player's card (${[...picks.values()].filter((n) => n === 2).length} with 2).`,
    )
  }
}
