// The retired switches (2026-10-28): migration 0084 against a real Postgres (PGlite, in process), after 0076. Energy's row
// and the six switches whose features stay on go, a Mega raid's key works for every player, and the content version
// goes up; run again, nothing changes but the version. seed.sql carries the file, inlined.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import areasJson from '@/data/areas.json'
import type { Area } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0084_switches_retired.sql'
const GONE = ['energy', 'diceThrows', 'gameFeel', 'haptics', 'music', 'shinyDex', 'raidOverhaul']
const areas = areasJson as Area[]
const areaOf = (dex: number) => areas.find((a) => a.legendaryBoss?.some((b) => b.dex === dex && b.raid))!

describe('0084: the retired switches', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v
  const dex = async (key: string) =>
    (await db.query<{ d: number | null }>('select raid_progress_dex($1) d', [key])).rows[0]!.d

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41'), ('maxFriends', '30')`)
    await db.exec('create table areas (id uuid primary key, legendary_boss jsonb)')
    for (const a of areas.filter((x) => x.legendaryBoss?.length))
      await db.query('insert into areas (id, legendary_boss) values ($1, $2)', [
        a.id,
        JSON.stringify(a.legendaryBoss),
      ])
    await db.exec(`create function is_admin() returns boolean language sql as $$ select false $$`)
    await db.exec(sql('0076_raid_overhaul.sql'))
    for (const key of GONE)
      await db.query(
        `insert into game_config (key, value) values ($1, '{"access": "off"}') on conflict (key) do update set value = excluded.value`,
        [key],
      )
    await db.exec(sql(FILE))
  })

  it('deletes the seven rows, keeps the others and bumps the content version', async () => {
    for (const key of GONE) expect(await value(key), key).toBeUndefined()
    expect(await value('maxFriends')).toBe(30)
    expect(await value('configVersion')).toBe(43)
  })

  it('takes a Mega raid’s key from a player who isn’t the admin, only in its raid boss’s area', async () => {
    expect(await dex(`${areaOf(150).id}:10043`)).toBe(10043)
    expect(await dex(`${areaOf(144).id}:10043`)).toBeNull()
  })

  it('runs again', async () => {
    await db.exec(sql(FILE))
    expect(await value('configVersion')).toBe(44)
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
