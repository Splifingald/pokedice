/**
 * pnpm rebattle-sql — the Elite Rebattle's data as a patch for a live database (docs/19 §5): every rebattle trainer
 * (upserted under its stable id), the `rebattleLineups` row, and the tiers inside the `events` row (only that key, with
 * jsonb_set, so the admin's other event settings stay as they are). Run it after `pnpm rebattle-teams`; paste the file
 * into the Supabase SQL editor. Safe to run again.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE } from '../src/config/bundle'
import type { Trainer } from '../src/engine'
import { upsert } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] ?? path.join('supabase', 'migrations', '0041_rebattle_diamond.sql')

const config = BUNDLE.config as unknown as {
  rebattleLineups: Record<string, Record<string, string[]>>
  events: { rebattle: { tiers: unknown[] } }
}
const ids = new Set(Object.values(config.rebattleLineups).flatMap((tiers) => Object.values(tiers).flat()))
const trainers = (BUNDLE.trainers as Trainer[]).filter((t) => ids.has(t.id))
const missing = [...ids].filter((id) => !trainers.some((t) => t.id === id))
if (missing.length) throw new Error(`lineups name trainers the bundle doesn't have: ${missing.join(', ')}`)
const json = (v: unknown) => JSON.stringify(v).replace(/'/g, "''")

const sql = [
  '-- The Elite Rebattle in four tiers (docs/19 §5): Bronze League +10 levels ₽×1, Silver +20 ₽×1.5, Gold +30 ₽×2,',
  '-- Diamond Lv.100 ₽×3. Written by `pnpm rebattle-sql` from src/data (scripts/rebattle-teams.ts). Run it once the',
  '-- client that knows Diamond is deployed (an older one shows the tier without its name); safe to run again.',
  '-- Saves keep their place: tier progress counts tiers cleared, so a player past the old Gold (Lv.100) now faces',
  '-- Diamond, and K.O.s already paid in a tier stay paid.',
  'begin;',
  '',
  `-- ${trainers.length} rebattle trainers: the Silver and Gold teams' new levels, Diamond's new trainers.`,
  upsert(
    'trainers',
    ['id', 'name', 'sprite_url', 'team', 'role', 'badge', 'upgrade_level', 'battle_background', 'rival_of', 'items'],
    trainers.map((t) => [t.id, t.name, t.spriteUrl, t.team, t.role, t.badge, t.upgradeLevel, t.battleBackground, t.rivalOf ?? null, t.items ?? []]),
    ['id'],
  ),
  "-- Each region's lineup per tier (Diamond's added).",
  `insert into game_config (key, value) values ('rebattleLineups', '${json(config.rebattleLineups)}'::jsonb)`,
  'on conflict (key) do update set value = excluded.value;',
  '',
  "-- The tiers: ₽ multiplier and upgrade step. Only this key of the events row changes.",
  `update game_config set value = jsonb_set(value, '{rebattle,tiers}', '${json(config.events.rebattle.tiers)}'::jsonb)`,
  "where key = 'events' and value ? 'rebattle';",
  '',
  'commit;',
  '',
].join('\n')

await writeFile(path.join(ROOT, OUT), sql)
console.log(`✓ ${OUT} — ${trainers.length} trainers, ${Object.keys(config.rebattleLineups).length} regions' lineups, ${config.events.rebattle.tiers.length} tiers`)
