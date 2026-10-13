// Migration 0050 against a real Postgres (PGlite, in process): simpler raids (2026-10-13). The summon numbers leave the
// events row, the raid Pokémon's own and the progression raids' included; the HP per bar goes from 2 to 2.2 unless the
// admin set another; everything else stays; a second run changes nothing.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

const MIGRATION = readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '0050_simpler_raids.sql'),
  'utf8',
)

let db: PGlite

const setEvents = (value: unknown) =>
  db.query(
    `insert into game_config (key, value) values ('events', $1) on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(value)],
  )
const raid = async () =>
  (
    await db.query<{ raid: Record<string, unknown> }>(
      `select value -> 'raid' as raid from game_config where key = 'events'`,
    )
  ).rows[0]!.raid

/** The events row as live had it before: summons, two HP per bar, own numbers with summons in them. */
const BEFORE = {
  teaserBadges: 3,
  raid: {
    access: 'all',
    bars: 3,
    barHp: 2,
    startAllies: 2,
    summonPerBreak: 2,
    maxField: 2,
    level: 50,
    upgradeLevel: 8,
    perMon: { 151: { bars: 4, maxField: 1 }, 251: { startAllies: 0 } },
    progress: { teamCap: 50, perMon: { 144: { level: 60, summonPerBreak: 1 }, 145: { maxField: 0 } } },
  },
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`create table game_config (key text primary key, value jsonb not null)`)
})

describe('0050: simpler raids', () => {
  it('drops the summon numbers everywhere and gives each bar 2.2 times its HP', async () => {
    await setEvents(BEFORE)
    await db.exec(MIGRATION)
    expect(await raid()).toEqual({
      access: 'all',
      bars: 3,
      barHp: 2.2,
      level: 50,
      upgradeLevel: 8,
      perMon: { 151: { bars: 4 } },
      progress: { teamCap: 50, perMon: { 144: { level: 60 } } },
    })
    const other = (
      await db.query<{ v: unknown }>(
        `select value -> 'teaserBadges' as v from game_config where key = 'events'`,
      )
    ).rows[0]!.v
    expect(other).toBe(3)
  })

  it('keeps an HP per bar the admin set, and a second run changes nothing', async () => {
    await setEvents({ ...BEFORE, raid: { ...BEFORE.raid, barHp: 3 } })
    await db.exec(MIGRATION)
    const once = await raid()
    expect(once.barHp).toBe(3)
    await db.exec(MIGRATION)
    expect(await raid()).toEqual(once)
  })

  it('a row without raid numbers, or without the events row, is left alone', async () => {
    await db.exec(MIGRATION)
    expect((await db.query(`select * from game_config`)).rows).toEqual([])
    await setEvents({ teaserBadges: 3 })
    await db.exec(MIGRATION)
    expect((await db.query<{ value: unknown }>(`select value from game_config`)).rows[0]!.value).toEqual({
      teaserBadges: 3,
    })
  })
})
