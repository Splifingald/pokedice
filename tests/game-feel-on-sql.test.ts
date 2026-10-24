// Game feel, haptics and battle music on for everyone (docs/38 §1): migration 0079 after 0074, against a real Postgres
// (PGlite, in process). The three switches end On for everyone, as the game defaults them, and the content version goes
// up. seed.sql carries the same file, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0079_game_feel_on.sql'
const KEYS = ['gameFeel', 'haptics', 'music'] as const

describe('0079: game feel, haptics and battle music on for everyone', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.exec(sql('0074_game_feel.sql'))
    await db.exec(`update game_config set value = '{"access": "admin"}' where key = 'music'`)
    await db.exec(sql(FILE))
  })

  it('turns the three switches On for everyone, as the game defaults them, and bumps the content version', async () => {
    for (const key of KEYS) {
      expect(await value(key)).toEqual({ access: 'all' })
      expect(DEFAULT_CONFIG[key]).toEqual({ access: 'all' })
    }
    expect(await value('configVersion')).toBe(43)
  })

  it('is inlined in seed.sql, after 0074', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    const at = seed.indexOf(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
    expect(at).toBeGreaterThan(seed.indexOf('-- ↓ supabase/migrations/0074_game_feel.sql'))
  })
})
