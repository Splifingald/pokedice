// A rival's team matched to the player (docs/61 §5.5): migration 0138 against a real Postgres (PGlite, in process).
// The switch goes in Off with the game's default choices and the content version goes up; run again, an admin's
// choices are kept. seed.sql carries the same file, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { RIVAL_MATCH_DEFAULTS } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0138_rival_match.sql'

describe('0138: rival teams matched to the player', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.exec(sql(FILE))
  })

  it('puts the switch in Off with the game’s own choices, and bumps the content version', async () => {
    expect(await value('rivalMatch')).toEqual(RIVAL_MATCH_DEFAULTS)
    expect(await value('configVersion')).toBe(42)
  })

  it("keeps the admin's choices the second time", async () => {
    const mine = { access: 'all', levels: 'mirror', margin: 0, stages: 'player' }
    await db.exec(`update game_config set value = '${JSON.stringify(mine)}' where key = 'rivalMatch'`)
    await db.exec(sql(FILE))
    expect(await value('rivalMatch')).toEqual(mine)
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
