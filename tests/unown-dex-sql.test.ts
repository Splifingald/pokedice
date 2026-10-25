// The Unown Pokédex (docs/41): migration 0080 against a real Postgres (PGlite, in process). The switch goes in Off with
// its prize and the content version goes up; run again, the admin's row is kept. seed.sql carries it, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0080_unown_dex.sql'

describe('0080: the Unown Pokédex', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.exec(sql(FILE))
  })

  it('puts the switch in Off with the ₽1,000 prize, as the game defaults them, and bumps the content version', async () => {
    expect(await value('unownDex')).toEqual({ access: 'off', reward: 1000 })
    expect(DEFAULT_CONFIG.unownDex).toEqual({ access: 'off', reward: 1000 })
    expect(await value('configVersion')).toBe(42)
  })

  it("keeps the admin's switch and prize the second time", async () => {
    await db.exec(`update game_config set value = '{"access": "all", "reward": 2500}' where key = 'unownDex'`)
    await db.exec(sql(FILE))
    expect(await value('unownDex')).toEqual({ access: 'all', reward: 2500 })
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
