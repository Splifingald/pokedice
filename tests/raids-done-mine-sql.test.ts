// Migration 0089 against a real Postgres (PGlite, in process): a player reads back the progression raids the server
// recorded them winning — their own, in the realm asked for, oldest first — and nobody else's. raid_progress_done is
// stood in for as 0045 makes it (its own migration needs the whole content); Supabase's pieces as in friends-sql.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIG = path.join(__dirname, '..', 'supabase', 'migrations')
const sql = (file: string) => readFileSync(path.join(MIG, file), 'utf8')

const ASH = '00000000-0000-4000-8000-000000000001'
const MISTY = '00000000-0000-4000-8000-000000000002'

let db: PGlite

async function mine(user: string | null, realm?: string): Promise<string[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  const q = realm ? `select raid_progress_mine($1) as keys` : `select raid_progress_mine() as keys`
  return (await db.query<{ keys: string[] }>(q, realm ? [realm] : [])).rows[0]!.keys
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users (id) values ('${ASH}'), ('${MISTY}');
    create table raid_progress_done (
      user_id uuid not null references auth.users(id) on delete cascade,
      realm text not null default 'main' check (realm in ('main', 'extreme')),
      raid_key text not null,
      dex int not null,
      done_at timestamptz not null default now(),
      primary key (user_id, realm, raid_key)
    );
    insert into raid_progress_done (user_id, realm, raid_key, dex, done_at) values
      ('${ASH}', 'main', 'seafoam:144', 144, '2026-10-18 10:27:56+00'),
      ('${ASH}', 'main', 'cerulean:150', 150, '2026-10-23 14:53:30+00'),
      ('${ASH}', 'main', 'zapdos:145', 145, '2026-10-12 15:45:35+00'),
      ('${ASH}', 'extreme', 'seafoam:144', 144, '2026-10-20 08:00:00+00'),
      ('${MISTY}', 'main', 'faraway:151', 151, '2026-10-21 09:00:00+00');
  `)
  await db.exec(sql('0089_raids_done_mine.sql'))
  // Run twice: the migration must stay safe to run again.
  await db.exec(sql('0089_raids_done_mine.sql'))
}, 60_000)

describe('0089: the raids the server saw a player win', () => {
  it('gives the player their own main raids, oldest first', async () => {
    expect(await mine(ASH)).toEqual(['zapdos:145', 'seafoam:144', 'cerulean:150'])
    expect(await mine(MISTY)).toEqual(['faraway:151'])
  })

  it('keeps each realm apart', async () => {
    expect(await mine(ASH, 'extreme')).toEqual(['seafoam:144'])
    expect(await mine(MISTY, 'extreme')).toEqual([])
  })

  it('gives nothing to a caller who isn’t signed in', async () => {
    expect(await mine(null)).toEqual([])
  })
})
