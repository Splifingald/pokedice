// Migration 0043 against a real Postgres (PGlite, in process), on top of 0041: each Elite Rebattle member's teams
// drawn from their roster. Every rebattle trainer must come out as the bundle has it, the admin's event settings as they
// went in, and a second run must change nothing.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import config from '@/data/config.json'
import trainers from '@/data/trainers.json'
import type { Trainer } from '@/engine'

const migration = (file: string) =>
  readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', file), 'utf8')
const lineups = config.rebattleLineups as Record<string, Record<string, string[]>>
const ids = new Set(Object.values(lineups).flatMap((tiers) => Object.values(tiers).flat()))
const bundled = (trainers as Trainer[]).filter((t) => ids.has(t.id))

let db: PGlite

const teams = async () =>
  Object.fromEntries(
    (
      await db.query<{ id: string; team: Trainer['team'] }>('select id, team from trainers order by id')
    ).rows.map((r) => [r.id, r.team]),
  )

beforeAll(async () => {
  db = new PGlite()
  // The two tables as the migrations leave them (0001, 0004, 0005, 0007, 0009).
  await db.exec(`
    create table trainers (
      id uuid primary key, name text not null, sprite_url text, team jsonb not null,
      role text not null default 'trainer', badge text, upgrade_level int, battle_background text,
      rival_of int, items jsonb not null default '[]'
    );
    create table game_config (key text primary key, value jsonb not null);
  `)
  await db.query('insert into game_config (key, value) values ($1, $2)', [
    'events',
    JSON.stringify({ wheel: { access: 'all' }, rebattle: { access: 'admin', priority: 4, tiers: [] } }),
  ])
  await db.exec(migration('0041_rebattle_diamond.sql'))
  await db.exec(migration('0043_rebattle_rosters.sql'))
})

describe('migration 0043: rematch teams from each member’s roster', () => {
  it('leaves every rebattle trainer as the bundle has it', async () => {
    const stored = await teams()
    expect(Object.keys(stored)).toHaveLength(bundled.length)
    for (const t of bundled) expect(stored[t.id], t.name).toEqual(t.team)
  })

  it('keeps the admin’s event settings and the four tiers', async () => {
    const events = (
      await db.query<{ value: { wheel: unknown; rebattle: { access: string; tiers: { id: string }[] } } }>(
        "select value from game_config where key = 'events'",
      )
    ).rows[0]!.value
    expect(events.wheel).toEqual({ access: 'all' })
    expect(events.rebattle.access).toBe('admin')
    expect(events.rebattle.tiers.map((t) => t.id)).toEqual(['bronze', 'silver', 'gold', 'diamond'])
  })

  it('can run again and ends in the same place', async () => {
    const before = await teams()
    await db.exec(migration('0043_rebattle_rosters.sql'))
    expect(await teams()).toEqual(before)
  })
})
