// Migration 0102 against a real Postgres (PGlite, in process): the Day Care opens at 10 species, offline earnings pay
// `offlineBase` at level 0 (added when missing, an admin's value kept), and the content version goes up. Not inlined in
// seed.sql: the seed's game_config rows come from src/data/config.json (Day Care 10), and the client's defaults fill a
// `general` row without `offlineBase`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'
import bundled from '@/data/config.json'

const ROOT = path.join(__dirname, '..', 'supabase')
const FILE = '0102_day_care_10_offline_base.sql'
const sql = readFileSync(path.join(ROOT, 'migrations', FILE), 'utf8')

describe('0102: the Day Care at 10, offline earnings at level 0', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: Record<string, unknown> }>('select value v from game_config where key = $1', [key])).rows[0]
      ?.v

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values
      ('configVersion', '76'),
      ('dayCare', '{"unlockPokedex": 20, "slots": 2}'),
      ('general', '{"access": "all", "offlineMaxHours": 24}')`)
    await db.exec(sql)
  })

  it('opens the Day Care at 10, keeps its other numbers, and bumps the content version', async () => {
    expect(await value('dayCare')).toEqual({ unlockPokedex: 10, slots: 2 })
    expect(DEFAULT_CONFIG.dayCare.unlockPokedex).toBe(10)
    expect(bundled.dayCare.unlockPokedex).toBe(10)
    expect(await value('configVersion')).toBe(77)
  })

  it('adds ₽1 an hour at level 0, as the game defaults it', async () => {
    expect(await value('general')).toEqual({ access: 'all', offlineMaxHours: 24, offlineBase: 1 })
    expect(DEFAULT_CONFIG.general.offlineBase).toBe(1)
  })

  it("keeps the admin's level-0 rate the second time", async () => {
    await db.exec(`update game_config set value = value || '{"offlineBase": 3}' where key = 'general'`)
    await db.exec(sql)
    expect((await value('general'))?.offlineBase).toBe(3)
    expect((await value('dayCare'))?.unlockPokedex).toBe(10)
  })
})
