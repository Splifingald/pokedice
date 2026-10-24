// The game-feel pass, haptics and battle music (docs/38): migration 0074 against a real Postgres (PGlite, in process).
// The three switches go in Off and the content version goes up; run again, an admin's switches are kept. seed.sql
// carries the same file, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0074_game_feel.sql'
const KEYS = ['gameFeel', 'haptics', 'music'] as const

describe('0074: the game-feel pass, haptics and battle music', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.exec(sql(FILE))
  })

  it('puts the switches in Off, as the game defaults them, and bumps the content version', async () => {
    for (const key of KEYS) {
      expect(await value(key)).toEqual({ access: 'off' })
      expect(DEFAULT_CONFIG[key]).toEqual({ access: 'off' })
    }
    expect(await value('configVersion')).toBe(42)
  })

  it("keeps the admin's switches the second time", async () => {
    await db.exec(`update game_config set value = '{"access": "all"}' where key in ('gameFeel', 'haptics', 'music')`)
    await db.exec(sql(FILE))
    for (const key of KEYS) expect(await value(key)).toEqual({ access: 'all' })
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
