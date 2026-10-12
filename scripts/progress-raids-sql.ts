/**
 * pnpm progress-raids-sql — the progression raids (docs/24) as a patch for a live database: the areas' raid content
 * (`pnpm raid-areas`), the mythical fixed dates turning shiny, `raid.progress` in the events row, and the server side of
 * the raids left on each area (two tables, three functions). Paste the file into the Supabase SQL editor after 0044.
 * Safe to run again: each step checks what is already there.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLE } from '../src/config/bundle'
import { DEFAULT_CONFIG } from '../src/engine/defaults'
import type { Area } from '../src/engine/types'
import { stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] ?? path.join('supabase', 'migrations', '0045_progress_raids.sql')

const areas = BUNDLE.areas as Area[]
const json = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
const mythicals = [...new Set(DEFAULT_CONFIG.events.raid.pool.map((p) => p.dex))].sort((a, b) => a - b)
const dexList = `array[${mythicals.join(', ')}]`

// 1. Each lair's mythical bosses, as the bundle has them (the raid pool's order, before any other boss).
const lairs = areas
  .map((a) => ({ a, bosses: (a.legendaryBoss ?? []).filter((b) => mythicals.includes(b.dex)) }))
  .filter((x) => x.bosses.length)
const lairSql = lairs
  .map(({ a, bosses }) =>
    [
      `-- ${a.name}: ${bosses.map((b) => `#${b.dex}`).join(', ')}`,
      `update areas set legendary_boss = ${json(bosses)} || coalesce((`,
      '    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)',
      `    where not ((b ->> 'dex')::int = any (${dexList}))), '[]'::jsonb)`,
      `  where id = '${a.id}' and not (coalesce(legendary_boss, '[]'::jsonb) @> ${json(bosses.map((b) => ({ dex: b.dex })))});`,
    ].join('\n'),
  )
  .join('\n')

// 3. The rounds the raid lairs got: the bundle's generated wild pools, and their weights.
const generated = areas.filter(
  (a) =>
    a.wildPool.length > 0 && a.wildPool.every((w) => w.id === stableUuid(`wild:raid-lair:${a.id}:${w.dex}`)),
)
const wildRows = generated.flatMap((a) =>
  a.wildPool.map((w) => `  ('${w.id}', '${a.id}', ${w.dex}, ${w.weight}, ${w.minLevel}, ${w.maxLevel})`),
)
// Kept as the admin left them if they're already there; an area or species the database hasn't got is skipped.
const wildSql = wildRows.length
  ? [
      `-- ${generated.length} lairs' round of wild Pokémon, under the bundle's stable ids.`,
      'insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)',
      'select v.id::uuid, v.area_id::uuid, v.dex, v.weight, v.min_level, v.max_level from (values',
      wildRows.join(',\n'),
      ') v(id, area_id, dex, weight, min_level, max_level)',
      'where exists (select 1 from areas x where x.id = v.area_id::uuid) and exists (select 1 from pokemon p where p.dex = v.dex)',
      'on conflict (id) do nothing;',
    ].join('\n')
  : '-- No lair needed a round of wild Pokémon.'
const weightsSql = generated.length
  ? [
      'update areas set encounter_weights = encounter_weights || jsonb_build_object(',
      "    'wild', greatest(coalesce((encounter_weights ->> 'wild')::numeric, 0), 8),",
      "    'center', least(coalesce((encounter_weights ->> 'center')::numeric, 0), 1))",
      `  where id in (${generated.map((a) => `'${a.id}'`).join(', ')});`,
    ].join('\n')
  : ''

const sql = `-- Progression raids (docs/24, the user's design of 2026-10-12). Every area boss but the mythicals is a raid of its
-- own area, open once the area is completed, fought until caught; your team for it comes from that region's Box and
-- stays on it, so friends can bring it to their own. The mythicals are their lairs' bosses again (never shiny there),
-- and their days of the raid calendar are shiny. Written by \`pnpm progress-raids-sql\` from src/data. Safe to run
-- again. Deploy the client first: an older one would show a raid boss as a plain boss. (Live ran it on 2026-10-12 as
-- 0044_progress_raids.sql, before Trades took 0044: same statements.)
begin;

-- ---------------------------------------------------------------- the areas

-- 1. The mythicals back as their lairs' bosses (${lairs.length} lairs).
${lairSql}

-- 2. Every other boss is a raid; a mythical never is.
update areas a set legendary_boss = (
    select jsonb_agg(case when (b ->> 'dex')::int = any (${dexList}) then b - 'raid' else b || '{"raid": true}'::jsonb end
                     order by o)
    from jsonb_array_elements(a.legendary_boss) with ordinality e(b, o))
  where jsonb_typeof(a.legendary_boss) = 'array' and jsonb_array_length(a.legendary_boss) > 0;

-- 3. An area with a boss is completable: a round at least, and something to meet in it.
update areas set rounds_to_clear = 1
  where rounds_to_clear is null and jsonb_typeof(legendary_boss) = 'array' and jsonb_array_length(legendary_boss) > 0;
${wildSql}
${weightsSql}

-- ---------------------------------------------------------------- the events row

-- The mythicals' fixed dates are shiny, as their days of the calendar are: the two together keep the calendar's order.
update game_config set value = jsonb_set(value, '{raid,calendar,anchors}', (
    select coalesce(jsonb_agg(case when (x ->> 'dex')::int = any (${dexList}) then jsonb_set(x, '{shiny}', 'true') else x end
                              order by o), '[]'::jsonb)
    from jsonb_array_elements(value -> 'raid' -> 'calendar' -> 'anchors') with ordinality e(x, o)))
  where key = 'events' and jsonb_typeof(value -> 'raid' -> 'calendar' -> 'anchors') = 'array';

-- The progression raids' own numbers: the team cap, and none of their own yet.
update game_config set value = jsonb_set(value, '{raid,progress}', ${json(DEFAULT_CONFIG.events.raid.progress)})
  where key = 'events' and jsonb_typeof(value -> 'raid') = 'object' and not (value -> 'raid' ? 'progress');

-- ---------------------------------------------------------------- the teams left on a raid, the raids caught

create table if not exists raid_progress_teams (
  user_id uuid not null references auth.users(id) on delete cascade,
  realm text not null default 'main' check (realm in ('main', 'extreme')),
  raid_key text not null,            -- areaId:dex
  region text not null,              -- the raid's region: its Box is where the team came from
  team jsonb not null,               -- [{dex, level, shiny}] × 1–3, in order, level ≤ the raid's cap
  ids jsonb,                         -- the Box ids it was cloned from (only their owner sees them)
  updated_at timestamptz not null default now(),
  primary key (user_id, realm, raid_key)
);
create index if not exists raid_progress_teams_key_idx on raid_progress_teams (raid_key, realm);
alter table raid_progress_teams enable row level security;
drop policy if exists raid_progress_teams_admin on raid_progress_teams;
create policy raid_progress_teams_admin on raid_progress_teams for all using (is_admin()) with check (is_admin());
revoke all on raid_progress_teams from anon, authenticated;

create table if not exists raid_progress_done (
  user_id uuid not null references auth.users(id) on delete cascade,
  realm text not null default 'main' check (realm in ('main', 'extreme')),
  raid_key text not null,
  dex int not null,
  done_at timestamptz not null default now(),
  primary key (user_id, realm, raid_key)
);
alter table raid_progress_done enable row level security;
drop policy if exists raid_progress_done_admin on raid_progress_done;
create policy raid_progress_done_admin on raid_progress_done for all using (is_admin()) with check (is_admin());
revoke all on raid_progress_done from anon, authenticated;

-- A raid's key, areaId:dex: its Pokémon, when that area has it as a raid boss (else null, and the call is refused).
create or replace function raid_progress_dex(p_key text)
returns int
language sql stable security definer set search_path = public as $$
  select split_part(p_key, ':', 2)::int
  where p_key ~ '^[0-9a-f-]{36}:[0-9]{1,4}$'
    and exists (
      select 1 from areas a
      where a.id::text = split_part(p_key, ':', 1)
        and coalesce(a.legendary_boss, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('dex', split_part(p_key, ':', 2)::int, 'raid', true)))
$$;

-- A progression raid's team cap: its Pokémon's own, the progression default, the raid's, 50.
create or replace function raid_progress_cap(p_dex int)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif((value -> 'raid' -> 'progress' -> 'perMon' -> p_dex::text ->> 'teamCap')::int, 0) from game_config where key = 'events'),
    (select (value -> 'raid' -> 'progress' ->> 'teamCap')::int from game_config where key = 'events'),
    raid_team_cap()
  )
$$;

-- Leaves your team on a raid: 1–3 ids from that region's Box in your cloud save (its top-level Box when you're playing
-- that region, else the parked one), none resting, each at the raid's cap at most.
create or replace function raid_progress_set_team(p_key text, p_region text, p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  save jsonb;
  box jsonb;
  cap int;
  new_team jsonb;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null or coalesce(p_region, '') !~ '^[a-z]{2,20}$' then raise exception 'events_bad_raid'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) not between 1 and 3
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1) then
    raise exception 'events_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'events_no_save'; end if;
  box := case when coalesce(save ->> 'region', 'kanto') = p_region then save -> 'box' else save -> 'parked' -> p_region -> 'box' end;
  cap := raid_progress_cap(dex);
  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least((m ->> 'level')::int, cap),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) order by t.ord)
  into new_team
  from unnest(p_ids) with ordinality t(id, ord)
  join jsonb_array_elements(coalesce(box, '[]')) m on m ->> 'id' = t.id
  where m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> array_length(p_ids, 1) then raise exception 'events_not_eligible'; end if;
  insert into raid_progress_teams (user_id, realm, raid_key, region, team, ids, updated_at)
  values (me, p_realm, p_key, p_region, new_team, to_jsonb(p_ids), now())
  on conflict (user_id, realm, raid_key) do update
    set region = excluded.region, team = excluded.team, ids = excluded.ids, updated_at = now();
  return new_team;
end $$;

-- Your friends who left a team on this raid, and how many times each has helped you.
create or replace function raid_progress_friend_teams(p_key text, p_realm text default 'main')
returns table (user_id uuid, name text, avatar text, team jsonb, helped int)
language sql stable security definer set search_path = public as $$
  select t.user_id,
         left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
         coalesce(s.data -> 'player' ->> 'avatar', s.data -> 'player' ->> 'character', 'red'),
         t.team,
         (select count(*)::int from raid_gifts g
           where g.realm = p_realm and g.helper_id = t.user_id and g.raider_id = auth.uid())
  from friend_ids_of(auth.uid()) f
  join raid_progress_teams t on t.user_id = f.id and t.realm = p_realm and t.raid_key = p_key
  left join saves s on s.user_id = t.user_id and s.realm = p_realm
  order by t.updated_at desc
$$;

-- The helpers' gifts once a raid Pokémon is caught, the day's raid's and a progression raid's alike: one per friend who
-- had a team there (the day's raid team, or one left on this raid), within each helper's gifts a UTC day. Not callable
-- from the game: raid_close and raid_progress_close call it for the signed-in raider.
create or replace function raid_give_gifts(p_me uuid, p_helpers uuid[], p_dex int, p_realm text, p_key text default null)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  midnight timestamptz := (now() at time zone 'UTC')::date at time zone 'UTC';
  cfg jsonb := (select value -> 'raid' from game_config where key = 'events');
  cap int := coalesce((cfg ->> 'helperDailyCap')::int, 5);
  gifts jsonb := coalesce(cfg -> 'gifts', '[{"key":"ultra-ball","weight":40},{"key":"hyper-potion","weight":25},{"key":"revive","weight":20},{"key":"rare-candy","weight":15}]');
  total numeric;
  roll numeric;
  pick text;
  g jsonb;
  helper uuid;
  raider text;
  given int := 0;
begin
  select sum(greatest(0, coalesce((x ->> 'weight')::numeric, 0))) into total from jsonb_array_elements(gifts) x;
  raider := left(coalesce(nullif(trim((select s.data -> 'player' ->> 'name' from saves s where s.user_id = p_me and s.realm = p_realm)), ''), 'Trainer'), 12);
  for helper in select distinct h from unnest(coalesce(p_helpers, '{}')) h loop
    continue when helper is null or helper = p_me or coalesce(total, 0) <= 0;
    continue when not exists (select 1 from friend_ids_of(p_me) f where f.id = helper);
    continue when p_key is null and not exists (select 1 from raid_teams t where t.user_id = helper and t.realm = p_realm);
    continue when p_key is not null and not exists (
      select 1 from raid_progress_teams t where t.user_id = helper and t.realm = p_realm and t.raid_key = p_key);
    continue when (select count(*) from raid_gifts x where x.realm = p_realm and x.helper_id = helper and x.created_at >= midnight) >= cap;
    roll := random() * total;
    pick := null;
    for g in select * from jsonb_array_elements(gifts) loop
      roll := roll - greatest(0, coalesce((g ->> 'weight')::numeric, 0));
      if roll < 0 then
        pick := g ->> 'key';
        exit;
      end if;
    end loop;
    continue when pick is null;
    insert into raid_gifts (realm, helper_id, raider_id, raider_name, dex, item_key)
    values (p_realm, helper, p_me, raider, p_dex, pick);
    given := given + 1;
  end loop;
  return given;
end $$;

-- The day's raid caught (0039's), its gifts now drawn by raid_give_gifts.
create or replace function raid_close(p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  st event_state;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  select * into st from event_state es where es.user_id = me and es.realm = p_realm for update;
  if st.raid is null or st.raid ->> 'day' <> today then raise exception 'events_no_raid'; end if;
  if coalesce((st.raid ->> 'caught')::boolean, false) then
    return jsonb_build_object('raidsWon', st.raids_won, 'gifts', 0);
  end if;
  update event_state es
    set raid = jsonb_set(st.raid, '{caught}', 'true'), raids_won = st.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning * into st;
  return jsonb_build_object('raidsWon', st.raids_won,
    'gifts', raid_give_gifts(me, p_helpers, (st.raid ->> 'dex')::int, p_realm));
end $$;

-- A progression raid caught: counted once per player and raid, one more raid won, the helpers' gifts.
create or replace function raid_progress_close(p_key text, p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  won int;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null then raise exception 'events_bad_raid'; end if;
  insert into event_state (user_id, realm) values (me, p_realm) on conflict (user_id, realm) do nothing;
  insert into raid_progress_done (user_id, realm, raid_key, dex) values (me, p_realm, p_key, dex)
  on conflict (user_id, realm, raid_key) do nothing;
  if not found then
    select es.raids_won into won from event_state es where es.user_id = me and es.realm = p_realm;
    return jsonb_build_object('raidsWon', won, 'gifts', 0);
  end if;
  update event_state es set raids_won = es.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning es.raids_won into won;
  return jsonb_build_object('raidsWon', won, 'gifts', raid_give_gifts(me, p_helpers, dex, p_realm, p_key));
end $$;

-- ---------------------------------------------------------------- deleting

-- 0039's, with the two new tables.
create or replace function delete_my_data(p_realm text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if p_realm is not null and p_realm not in ('main', 'extreme') then
    raise exception 'bad_realm' using errcode = '22023';
  end if;
  delete from saves where user_id = me and (p_realm is null or realm = p_realm);
  delete from player_cards where user_id = me and (p_realm is null or realm = p_realm); -- and their regions
  delete from versus_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from versus_battles where (attacker_id = me or defender_id = me) and (p_realm is null or realm = p_realm);
  delete from event_state where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_gifts where (helper_id = me or raider_id = me) and (p_realm is null or realm = p_realm);
  delete from raid_progress_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_progress_done where user_id = me and (p_realm is null or realm = p_realm);
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_attempts where actor = me::text;
  end if;
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function raid_progress_dex(text) from public, anon, authenticated;
revoke all on function raid_progress_cap(int) from public, anon, authenticated;
revoke all on function raid_give_gifts(uuid, uuid[], int, text, text) from public, anon, authenticated;
revoke all on function raid_progress_set_team(text, text, text[], text) from public;
revoke all on function raid_progress_friend_teams(text, text) from public;
revoke all on function raid_progress_close(text, uuid[], text) from public;
revoke all on function raid_close(uuid[], text) from public;
revoke all on function delete_my_data(text) from public, anon;
grant execute on function raid_progress_set_team(text, text, text[], text), raid_progress_friend_teams(text, text),
  raid_progress_close(text, uuid[], text), raid_close(uuid[], text), delete_my_data(text) to authenticated;

commit;
`

await writeFile(path.join(ROOT, OUT), sql)
console.log(`✓ ${OUT} — ${lairs.length} lairs, ${generated.length} new rounds (${wildRows.length} wild rows)`)
