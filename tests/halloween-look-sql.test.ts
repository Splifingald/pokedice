// Migration 0077 against a real Postgres (PGlite, in process): Halloween 2026's look (docs/31 §7) granted to the
// players holding a shiny Giratina anywhere it is theirs, or who won Haunted Hollow's Giratina raid, in either save;
// into the main save only, stamped now; nobody else touched, and a second run changing nothing. The save it writes
// still reads, and unlocks the look. Only the `saves` table is stood in for: the migration touches nothing else.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createInstance, lookStates, newSave } from '@/engine'
import { parseSave } from '@/save/schema'
import { makeData, newId } from './fixtures'

const MIG = readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '0077_halloween_2026_look.sql'),
  'utf8',
)
const LOOK = 'events/halloween-2026-pokemaniac'
const RAID = 'cfff57e0-5175-545c-9e68-a2e2e64d7d45:487'
const OLD = '2026-10-20T10:00:00.000Z'

const data = makeData({ looks: { access: 'all' } })
const base = () => ({ ...newSave(4, data, 1, newId), player: { name: 'Sam', character: 'red' as const } })
const giratina = (shiny: boolean) => ({
  ...createInstance(487, 70, data, 'g', 1),
  ...(shiny && { shiny: true }),
})

/** Who's who: what each save holds, and whether the look is due. */
const PLAYERS: [name: string, realm: 'main' | 'extreme', save: Record<string, unknown>, due: boolean][] = [
  ['box', 'main', { box: [giratina(true)] }, true],
  ['parked', 'main', { parked: { johto: { box: [giratina(true)] } } }, true],
  [
    'daycare',
    'main',
    { dayCare: { residents: [{ inst: giratina(true), since: 1, region: 'kanto' }], guests: [] } },
    true,
  ],
  ['homer', 'main', { events: { worldHome: [{ inst: giratina(true), region: 'sinnoh' }] } }, true],
  ['listed', 'main', { trades: { out: [{ listing: 'l', mon: giratina(true) }], done: [] } }, true],
  ['raid', 'main', { events: { raidsDone: ['x:1', RAID] } }, true],
  ['plain', 'main', { box: [giratina(false)] }, false],
  [
    'todays-raid',
    'main',
    { events: { raid: { day: 'd', dex: 487, shiny: true, areaId: 'a', caught: false } } },
    false,
  ],
  ['guest', 'main', { dayCare: { residents: [], guests: [{ owner: 'o', dex: 487, shiny: true }] } }, false],
  ['nothing', 'main', {}, false],
]

/** What the test reads back of a stored save. */
interface StoredSave {
  updatedAt: number
  looks?: { seen?: string[]; earned?: string[] }
}

let db: PGlite
const ids = new Map<string, string>()

async function row(name: string, realm = 'main') {
  const r = await db.query<{ data: StoredSave; updated_at: string }>(
    `select data, updated_at::text from saves where user_id = $1 and realm = $2`,
    [ids.get(name), realm],
  )
  return r.rows[0]!
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table saves (
      user_id uuid not null,
      realm text not null default 'main',
      data jsonb not null,
      updated_at timestamptz not null default now(),
      primary key (user_id, realm)
    );
  `)
  let n = 0
  const insert = async (name: string, realm: string, save: unknown) =>
    db.query(`insert into saves (user_id, realm, data, updated_at) values ($1, $2, $3, $4)`, [
      ids.get(name),
      realm,
      JSON.stringify(save),
      OLD,
    ])
  for (const [name, realm, extra] of PLAYERS) {
    ids.set(name, `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`)
    await insert(name, realm, { ...base(), ...extra, looks: { seen: ['kanto/lass'] } })
  }
  // Caught in her Extreme save only: the grant goes into her main one, the Extreme one left as it is.
  ids.set('extreme', `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`)
  await insert('extreme', 'main', base())
  await insert('extreme', 'extreme', { ...base(), mode: 'extreme', box: [giratina(true)] })
  await db.exec(MIG)
})

describe('0077: the Halloween 2026 look', () => {
  it('goes to every player holding a shiny Giratina, or who won the raid, and nobody else', async () => {
    for (const [name, , , due] of PLAYERS) {
      const { data: save } = await row(name)
      expect(save.looks?.earned ?? [], name).toEqual(due ? [LOOK] : [])
      // What the save already held is kept.
      expect(save.looks?.seen, name).toEqual(['kanto/lass'])
    }
    expect((await row('extreme')).data.looks?.earned).toEqual([LOOK])
    expect((await row('extreme', 'extreme')).data.looks).toBeUndefined()
  })

  it('stamps the saves it writes now, the row and the save alike, and leaves the others alone', async () => {
    const got = await row('box')
    const at = new Date(got.updated_at).getTime()
    expect(at).toBeGreaterThan(Date.parse(OLD))
    expect(got.data.updatedAt).toBe(at)
    expect(new Date((await row('plain')).updated_at).toISOString()).toBe(OLD)
    expect(new Date((await row('extreme', 'extreme')).updated_at).toISOString()).toBe(OLD)
  })

  it('writes a save the game reads, and the look unlocked in it', async () => {
    const parsed = parseSave((await row('daycare')).data)
    expect(parsed.ok ? '' : parsed.error).toBe('')
    if (!parsed.ok) return
    expect(lookStates(parsed.save, data).find((s) => s.def.id === LOOK)?.open).toBe(true)
  })

  it('changes nothing when run again', async () => {
    const before = await db.query(`select user_id, realm, data, updated_at::text from saves order by 1, 2`)
    await db.exec(MIG)
    const after = await db.query(`select user_id, realm, data, updated_at::text from saves order by 1, 2`)
    expect(after.rows).toEqual(before.rows)
  })
})
