// The Rotom Room (docs/73): migrations 0153 (the content) and 0154 (the switch) against a real Postgres (PGlite, in process). The five forms, the room, its
// pool and loot go in from the bundle's rows; the switch goes in Off with the prize's level and the content version goes
// up; rotom_room_open() reads it for the caller (everyone, the admin only, an odd value off); run again, the admin's
// edits are kept. seed.sql inlines 0154 (0153's rows come with the bundle's).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, ROTOM_FORM_DEXES } from '@/engine'
import { data } from './fixtures'

const ROOT = path.join(__dirname, '..', 'supabase')
const sql = (file: string) => readFileSync(path.join(ROOT, 'migrations', file), 'utf8')
const FILE = '0153_rotom_room.sql'
const SWITCH = '0154_rotom_room_switch.sql'
const ADMIN_EMAIL = 'gregoire.ftn@gmail.com'

describe('0153 and 0154: the Rotom Room', () => {
  let db: PGlite
  const value = async (key: string) =>
    (await db.query<{ v: unknown }>('select value v from game_config where key = $1', [key])).rows[0]?.v
  const open = async () => (await db.query<{ ok: boolean }>('select rotom_room_open() ok')).rows[0]!.ok
  const asJwt = (email: string) =>
    db.exec(
      `create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"email": "${email}"}'::jsonb $$;`,
    )
  const setSwitch = (v: string) =>
    db.query(`update game_config set value = $1::jsonb where key = 'rotomRoom'`, [v])
  const room = data.areas.find((a) => a.name === 'The Rotom Room')!

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
    await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
    // The columns the room's rows fill: the deck, regions, the forms.
    for (const f of [
      '0002_encounter_deck.sql',
      '0003_items_catching.sql',
      '0004_v17_columns.sql',
      '0005_battle_backgrounds.sql',
      '0012_scale_offsets.sql',
      '0014_rounds.sql',
      '0016_regions.sql',
      '0030_pokemon_forms.sql',
    ])
      await db.exec(sql(f))
    // The room's pool and loot need their species and items, as the bundle has them.
    for (const dex of new Set(room.wildPool.map((w) => w.dex))) {
      const sp = data.species[dex]!
      await db.query(
        `insert into pokemon (dex, name, type1, type2, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones)
         values ($1, $2, $3, $4, $5, $6, $7, '', '[]'::jsonb, 1, 5, '[]'::jsonb, '[]'::jsonb)`,
        [dex, sp.name, sp.type1, sp.type2, sp.baseHp, sp.maxHp, sp.speed],
      )
    }
    for (const key of new Set(room.lootPool.map((l) => l.itemKey)))
      await db.query(
        `insert into items (key, name, description, sprite_url, price, effect) values ($1, $1, '', '', 0, '{}'::jsonb) on conflict do nothing`,
        [key],
      )
    await db.exec(`insert into game_config (key, value) values ('configVersion', '150')`)
    await db.exec(sql(FILE))
    await db.exec(sql(SWITCH))
  }, 60_000)

  it('puts the five forms in, as the bundle has them', async () => {
    const rows = await db.query<{ dex: number; type1: string; type2: string; form: unknown }>(
      'select dex, type1, type2, form from pokemon where dex >= 10008 and dex <= 10012 order by dex',
    )
    expect(rows.rows.map((r) => r.dex)).toEqual([...ROTOM_FORM_DEXES])
    for (const r of rows.rows) {
      const sp = data.species[r.dex]!
      expect([r.type1, r.type2]).toEqual([sp.type1, sp.type2])
      expect(r.form).toEqual({ of: 479, kind: 'appliance' })
    }
  })

  it('puts the room in, with its pool, its loot and its five bosses', async () => {
    const a = await db.query<{
      name: string
      hidden: boolean
      legendary_boss: unknown
      unlock_conditions: unknown
    }>('select name, hidden, legendary_boss, unlock_conditions from areas where id = $1', [room.id])
    expect(a.rows[0]).toMatchObject({ name: 'The Rotom Room', hidden: true })
    expect(a.rows[0]!.legendary_boss).toEqual(room.legendaryBoss)
    expect(a.rows[0]!.unlock_conditions).toEqual(room.unlockConditions)
    const wild = await db.query<{ n: number }>(
      'select count(*)::int n from area_wild_pool where area_id = $1',
      [room.id],
    )
    expect(wild.rows[0]!.n).toBe(room.wildPool.length)
    const loot = await db.query<{ n: number }>(
      'select count(*)::int n from area_loot_pool where area_id = $1',
      [room.id],
    )
    expect(loot.rows[0]!.n).toBe(room.lootPool.length)
  })

  it('puts the switch in Off with the prize’s level, as the game defaults it, and bumps the content version', async () => {
    expect(await value('rotomRoom')).toEqual({ access: 'off', prizeLevel: 60 })
    expect(DEFAULT_CONFIG.rotomRoom).toEqual({ access: 'off', prizeLevel: 60 })
    // One step each.
    expect(await value('configVersion')).toBe(152)
  })

  it('rotom_room_open(): off while Off; On for everyone opens it; On for admin only for the admin', async () => {
    expect(await open()).toBe(false)
    await setSwitch('{"access": "all", "prizeLevel": 60}')
    expect(await open()).toBe(true)
    await setSwitch('{"access": "admin", "prizeLevel": 60}')
    expect(await open()).toBe(false)
    await asJwt(ADMIN_EMAIL)
    expect(await open()).toBe(true)
    await asJwt('someone@example.com')
    expect(await open()).toBe(false)
    await setSwitch('"on"')
    expect(await open()).toBe(false)
  })

  it('players may ask it (anon and signed in), nothing else', async () => {
    const grants = await db.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges where routine_name = 'rotom_room_open' order by grantee`,
    )
    const who = grants.rows.map((r) => r.grantee)
    expect(who).toContain('anon')
    expect(who).toContain('authenticated')
    expect(who).not.toContain('PUBLIC')
  })

  it("runs again keeping the admin's edits, the content version up once more", async () => {
    await setSwitch('{"access": "all", "prizeLevel": 70}')
    await db.query(`update areas set min_level = 55 where id = $1`, [room.id])
    const before = (await value('configVersion')) as number
    await db.exec(sql(FILE))
    await db.exec(sql(SWITCH))
    expect(await value('rotomRoom')).toEqual({ access: 'all', prizeLevel: 70 })
    expect(
      (await db.query<{ m: number }>('select min_level m from areas where id = $1', [room.id])).rows[0]!.m,
    ).toBe(55)
    expect(await value('configVersion')).toBe(before + 2)
  })

  it('seed.sql inlines the switch, and carries the room and its forms with the bundle', () => {
    const seed = readFileSync(path.join(ROOT, 'seed.sql'), 'utf8')
    const body = sql(SWITCH).replace(/^(begin|commit);\n/gm, '')
    expect(seed).toContain(`-- ↓ supabase/migrations/${SWITCH}, inlined so this file stands alone.\n${body}`)
    expect(seed).not.toContain(`supabase/migrations/${FILE}, inlined`)
    expect(seed).toContain(`'${room.id}'`)
    expect(seed).toContain("(10012, 'Mow Rotom'")
  })
})
