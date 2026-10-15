// Trick or Treat (docs/29) as a patch over live content: migration 0056 against a real Postgres (PGlite, in process)
// that ran 0052 and 0055 and then had the admin's own edits, and the same patch over an admin export. Only this feature
// lands (the card in ten decks, the config row, the server's check); the admin's numbers, lists and decks stay.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type BundleRaw, type TrickOrTreatConfig } from '@/engine'
import { BUNDLE } from '@/config/bundle'
import { REGION_ID, haunted, trickAreas, withHaunted } from '../scripts/content-haunted-hollow'
import { hhTrickOrTreatSql, patchHhTrickOrTreat, trickDecks } from '../scripts/patch-hh-trick-or-treat'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')
const decks = trickDecks()
const [dusk, marsh] = decks
const ADMIN_EMAIL = 'gregoire.ftn@gmail.com'
let db: PGlite

const cfg = async (key: string) =>
  (await db.query<{ v: unknown }>(`select value v from game_config where key = $1`, [key])).rows[0]?.v
const weights = async (id: string) =>
  (await db.query<{ w: Record<string, number> }>(`select encounter_weights w from areas where id = $1`, [id]))
    .rows[0]!.w
const open = async () => (await db.query<{ ok: boolean }>('select trick_or_treat_open() ok')).rows[0]!.ok
const asJwt = (email: string) =>
  db.exec(
    `create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"email": "${email}"}'::jsonb $$;`,
  )

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  await db.exec(sql('0001_init.sql').replace('create extension if not exists pgcrypto;', ''))
  await db.exec(sql('0016_regions.sql'))
  await db.exec('alter table areas add column if not exists rounds_to_clear int;')
  const dexes = [...new Set(BUNDLE.pokemon.map((p) => p.dex))]
  await db.exec(
    `insert into pokemon (dex, name, type1, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones) values ` +
      dexes.map((d) => `(${d}, 'p${d}', 'ghost', 10, 100, 5, '', '[]', 1, 3, '[]', '[]')`).join(', '),
  )
  await db.exec(`insert into game_config (key, value) values ('configVersion', '98')`)
  await db.exec(sql('0052_haunted_hollow.sql'))
  await db.exec(sql('0055_hh_new_species.sql'))
  // Live as 0052 wrote it: no Trick or Treat card yet. Then the admin's own edits: Foggy Marsh's deck says 0 cards.
  for (const d of decks)
    await db.exec(`update areas set encounter_weights = encounter_weights - 'trick' where id = '${d.areaId}'`)
  await db.exec(
    `update areas set encounter_weights = encounter_weights || '{"trick": 0}' where id = '${marsh!.areaId}'`,
  )
  await db.exec(sql('0056_trick_or_treat.sql'))
})

describe('0056: Trick or Treat', () => {
  it('is what the patch script generates', () => {
    expect(sql('0056_trick_or_treat.sql')).toBe(hhTrickOrTreatSql())
  })

  it('puts one card in each main area’s deck, an admin’s own count kept', async () => {
    expect(decks).toHaveLength(10)
    expect((await weights(dusk!.areaId)).trick).toBe(1)
    expect(await weights(dusk!.areaId)).toEqual(
      haunted().areas.find((a) => a.id === dusk!.areaId)!.encounterWeights,
    )
    expect((await weights(marsh!.areaId)).trick).toBe(0)
    const elite = (
      await db.query<{ w: Record<string, number> }>(
        `select encounter_weights w from areas where name = 'Shadow Elite'`,
      )
    ).rows[0]!.w
    expect(elite.trick).toBeUndefined()
  })

  it('writes the config row, Off, with the world’s ghost lists', async () => {
    const row = (await cfg('trickOrTreat')) as TrickOrTreatConfig
    expect(row).toEqual(JSON.parse(JSON.stringify({ ...DEFAULT_CONFIG.trickOrTreat, areas: trickAreas() })))
    expect(row.access).toBe('off')
    expect(await cfg('configVersion')).toBe(101)
  })

  it('the server reads the switch for the caller: off, on for the admin only, on for everyone', async () => {
    const set = (access: string) =>
      db.exec(
        `update game_config set value = jsonb_set(value, '{access}', '"${access}"') where key = 'trickOrTreat'`,
      )
    expect(await open()).toBe(false)
    await set('admin')
    expect(await open()).toBe(false)
    await asJwt(ADMIN_EMAIL)
    expect(await open()).toBe(true)
    await asJwt('someone@example.com')
    await set('all')
    expect(await open()).toBe(true)
    await set('nonsense')
    expect(await open()).toBe(false)
  })

  it('runs again keeping the admin’s numbers and lists, adding the world’s where an area has none', async () => {
    const mine = {
      ...DEFAULT_CONFIG.trickOrTreat,
      access: 'admin',
      failPush: 20,
      areas: { [dusk!.areaId]: [{ dex: 92, tier: 'common' }] },
    }
    await db.exec(
      `update game_config set value = '${JSON.stringify(mine)}'::jsonb where key = 'trickOrTreat'`,
    )
    await db.exec(sql('0056_trick_or_treat.sql'))
    const row = (await cfg('trickOrTreat')) as TrickOrTreatConfig
    expect([row.access, row.failPush]).toEqual(['admin', 20])
    expect(row.areas[dusk!.areaId]).toEqual([{ dex: 92, tier: 'common' }])
    expect(row.areas[marsh!.areaId]).toEqual(trickAreas()[marsh!.areaId])
    expect((await weights(marsh!.areaId)).trick).toBe(0)
    expect(await cfg('configVersion')).toBe(102)
  })
})

describe('the same patch over an admin export', () => {
  const fresh = withHaunted(BUNDLE)
  /** The export as it was before this change: no card in the decks, no row. */
  const { trickOrTreat: _gone, ...rest } = fresh.config as Record<string, unknown>
  const live: BundleRaw = {
    ...fresh,
    areas: fresh.areas.map((a) => {
      const { trick: _t, ...w } = a.encounterWeights
      return { ...a, encounterWeights: w }
    }),
    config: rest,
  }

  it('gives what the content script builds', () => {
    const out = patchHhTrickOrTreat(live)
    expect(out.areas.filter((a) => a.regionId === REGION_ID)).toEqual(
      fresh.areas.filter((a) => a.regionId === REGION_ID),
    )
    expect(out.config.trickOrTreat).toEqual(fresh.config.trickOrTreat)
    expect(out.config.configVersion).toBe(Number(live.config.configVersion) + 1)
  })

  it('keeps an admin’s switch, numbers, lists and deck counts; adds nothing twice; refuses an export without the world', () => {
    const own: BundleRaw = {
      ...live,
      areas: live.areas.map((a) =>
        a.id === marsh!.areaId ? { ...a, encounterWeights: { ...a.encounterWeights, trick: 2 } } : a,
      ),
      config: { ...live.config, trickOrTreat: { access: 'all', treatMin: 5, areas: { [dusk!.areaId]: [] } } },
    }
    const out = patchHhTrickOrTreat(own)
    const row = out.config.trickOrTreat as TrickOrTreatConfig
    expect([row.access, row.treatMin, row.treatMax]).toEqual(['all', 5, DEFAULT_CONFIG.trickOrTreat.treatMax])
    expect(row.areas[dusk!.areaId]).toEqual([])
    expect(out.areas.find((a) => a.id === marsh!.areaId)!.encounterWeights.trick).toBe(2)
    expect(patchHhTrickOrTreat(out).areas).toEqual(out.areas)
    expect(() => patchHhTrickOrTreat(BUNDLE)).toThrow(/no Haunted Hollow/)
  })
})
