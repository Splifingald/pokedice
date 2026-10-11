// Migration 0041 against a real Postgres (PGlite, in process): the Elite Rebattle in four tiers. It upserts the
// rebattle trainers and the lineups, and changes only the tiers inside the `events` row — the admin's other event
// settings (who can play, the wheel's prizes…) must come out as they went in. Safe to run twice.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import config from '@/data/config.json'

const PATCH = readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '0041_rebattle_diamond.sql'), 'utf8')
const lineups = config.rebattleLineups as Record<string, Record<string, string[]>>
const kantoDiamond = lineups.kanto!.diamond!

let db: PGlite

const value = async (key: string) =>
  (await db.query<{ value: Record<string, unknown> }>('select value from game_config where key = $1', [key])).rows[0]?.value

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
  // A live database before the patch: three tiers, the admin's own access setting and wheel, an old lineup.
  await db.query('insert into game_config (key, value) values ($1, $2), ($3, $4)', [
    'events',
    JSON.stringify({
      teaserBadges: 3,
      wheel: { access: 'all', prizes: [{ odds: 1 }] },
      rebattle: { access: 'admin', priority: 4, tiers: [{ id: 'bronze', gold: 1.5, upgradeDelta: 1 }] },
    }),
    'rebattleLineups',
    JSON.stringify({ kanto: { bronze: [] } }),
  ])
  await db.exec(PATCH)
})

describe('migration 0041: the Elite Rebattle in four tiers', () => {
  it('sets the four tiers and leaves every other event setting as it was', async () => {
    const events = (await value('events')) as {
      teaserBadges: number
      wheel: unknown
      rebattle: { access: string; priority: number; tiers: { id: string; gold: number }[] }
    }
    expect(events.rebattle.tiers.map((t) => [t.id, t.gold])).toEqual([
      ['bronze', 1],
      ['silver', 1.5],
      ['gold', 2],
      ['diamond', 3],
    ])
    expect(events.rebattle.access).toBe('admin')
    expect(events.rebattle.priority).toBe(4)
    expect(events.wheel).toEqual({ access: 'all', prizes: [{ odds: 1 }] })
    expect(events.teaserBadges).toBe(3)
  })

  it('writes every region’s lineup, Diamond included, and every trainer it names', async () => {
    const stored = (await value('rebattleLineups')) as Record<string, Record<string, string[]>>
    expect(stored).toEqual(lineups)
    const ids = Object.values(lineups).flatMap((tiers) => Object.values(tiers).flat())
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from trainers where id = any($1::uuid[])', [ids])
    expect(rows[0]!.n).toBe(new Set(ids).size)
    const diamond = await db.query<{ team: { level: number }[] }>('select team from trainers where id = $1', [kantoDiamond[0]])
    expect(diamond.rows[0]!.team.every((m) => m.level === 100)).toBe(true)
  })

  it('can run again and ends in the same place', async () => {
    const before = await value('events')
    await db.exec(PATCH)
    expect(await value('events')).toEqual(before)
  })
})
