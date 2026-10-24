// The raid overhaul (docs/40): migration 0076 against a real Postgres (PGlite, in process). The switch goes in Off and
// the content version goes up; a Mega raid's key (`areaId:formDex`) is a raid only with the switch on for the caller,
// and only in its raid boss's area; the game's Mega raids and the server's list agree; seed.sql carries the file.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import areasJson from '@/data/areas.json'
import { DEFAULT_CONFIG, MEGA_RAIDS, type Area } from '@/engine'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0076_raid_overhaul.sql'
const areas = areasJson as Area[]
const areaOf = (dex: number) => areas.find((a) => a.legendaryBoss?.some((b) => b.dex === dex && b.raid))!

describe('0076: the raid overhaul', () => {
  let db: PGlite
  let admin = false
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v
  const dex = async (key: string) =>
    (await db.query<{ d: number | null }>('select raid_progress_dex($1) d', [key])).rows[0]!.d
  const setAccess = (a: string) =>
    db.exec(`update game_config set value = '{"access": "${a}"}' where key = 'raidOverhaul'`)

  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table game_config (key text primary key, value jsonb not null)')
    await db.exec(`insert into game_config (key, value) values ('configVersion', '41')`)
    await db.exec('create table areas (id uuid primary key, legendary_boss jsonb)')
    for (const a of areas.filter((x) => x.legendaryBoss?.length))
      await db.query('insert into areas (id, legendary_boss) values ($1, $2)', [
        a.id,
        JSON.stringify(a.legendaryBoss),
      ])
    await db.exec(
      `create function is_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$`,
    )
    await db.exec(sql(FILE))
  })
  const asAdmin = async (yes: boolean) => {
    admin = yes
    await db.exec(`set test.admin = '${admin ? 'yes' : 'no'}'`)
  }

  it('puts the switch in Off, as the game defaults it, and bumps the content version', async () => {
    expect(await value('raidOverhaul')).toEqual({ access: 'off' })
    expect(DEFAULT_CONFIG.raidOverhaul).toEqual({ access: 'off' })
    expect(await value('configVersion')).toBe(42)
  })

  it('a raid key as before; a five-digit form raid (Galarian Articuno) too', async () => {
    const seafoam = areaOf(144).id
    expect(await dex(`${seafoam}:144`)).toBe(144)
    expect(await dex(`${seafoam}:145`)).toBeNull()
    expect(await dex(`${areaOf(10169).id}:10169`)).toBe(10169)
  })

  it('a Mega raid key only with the switch on for the caller, only in its raid boss’s area', async () => {
    const cave = areaOf(150).id
    await setAccess('off')
    expect(await dex(`${cave}:10043`)).toBeNull()
    await setAccess('admin')
    await asAdmin(false)
    expect(await dex(`${cave}:10043`)).toBeNull()
    await asAdmin(true)
    expect(await dex(`${cave}:10043`)).toBe(10043)
    await setAccess('all')
    await asAdmin(false)
    expect(await dex(`${cave}:10044`)).toBe(10044)
    expect(await dex(`${areaOf(144).id}:10043`)).toBeNull()
  })

  it("matches the game's Mega raids", async () => {
    for (const m of Object.values(MEGA_RAIDS)) {
      const r = await db.query<{ b: number }>('select raid_mega_base($1) b', [m.form])
      expect(r.rows[0]!.b, `#${m.form}`).toBe(m.base)
      expect(await dex(`${areaOf(m.base).id}:${m.form}`), `#${m.form}`).toBe(m.form)
    }
  })

  it("keeps the admin's switch the second time", async () => {
    await setAccess('admin')
    await db.exec(sql(FILE))
    expect(await value('raidOverhaul')).toEqual({ access: 'admin' })
  })

  it('is inlined in seed.sql', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(FILE).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${FILE}, inlined so this file stands alone.\n${body}`)
  })
})
