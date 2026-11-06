// Status faces, reworked (docs/01 §3.2): migration 0073 against a real Postgres (PGlite, in process). The status row
// takes the new rules, the game's defaults; Burn keeps the admin's numbers; run again, an admin's new numbers are kept.
// seed.sql carries the same file, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0073_status_faces.sql'

const OLD = {
  burn: { duration: 4, threshold: 1, percentPerStack: 5 },
  heal: { amount: 'rollTotal', threshold: 2 },
  frozen: { stunTurns: 2, threshold: 3 },
  poison: { percent: 10, duration: 3, threshold: 2 },
  confuse: { threshold: 2, recoilPercent: 20 },
  paralyze: { stunTurns: 1, threshold: 2 },
}

describe('0073: status faces, reworked', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.query('insert into game_config (key, value) values ($1, $2)', ['status', JSON.stringify(OLD)])
    await db.exec(sql(FILE))
  })

  it("writes the game's new rules, keeps the admin's Burn, and bumps the content version", async () => {
    expect(await value('status')).toEqual({ ...DEFAULT_CONFIG.status, burn: OLD.burn })
    expect(await value('configVersion')).toBe(42)
  })

  it("keeps the admin's new numbers the second time", async () => {
    const mine = { ...DEFAULT_CONFIG.status, paralyze: { sureAt: 3, stunTurns: 1 } }
    await db.query(`update game_config set value = $1 where key = 'status'`, [JSON.stringify(mine)])
    await db.exec(sql(FILE))
    expect(await value('status')).toEqual(mine)
  })

  it('writes the defaults where there was no row', async () => {
    await db.exec(`delete from game_config where key = 'status'`)
    await db.exec(sql(FILE))
    expect(await value('status')).toEqual(DEFAULT_CONFIG.status)
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
