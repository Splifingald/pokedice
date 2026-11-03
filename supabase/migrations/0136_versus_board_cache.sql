-- The Versus board, built at most once every 15 minutes (docs/66 §2). versus_board() took about 0.7 s a call and was
-- ~80 % of the database's time: for each of the ~330 teams it read the player's whole save (25 kB compressed) to
-- find its `powers`. The slow part, the same for everyone, is now kept in versus_board_cache and built again at most
-- every 15 minutes; a call reads it and adds what must stay live.
--
-- Live on every call (cheap, and a fight depends on it): the teams themselves (who is on the board, their Pokémon,
-- their version, the order), names and trainer looks, "beaten" (yours), and your own row in full (your wins go up at
-- once, and the board shows your new team back to the game, which checks it: `versus_not_saved`). A team newer than the
-- last build is counted live too.
-- From the cache (up to 15 minutes old): the other players' attack and defense wins, their gems and badges (the raw
-- `powers` of their save) and their "rich" flag. The switches stay per caller: what the cache holds is raw, and each
-- call applies power_open() and general_open() for the one asking, as player_powers() and player_rich() do.
--
-- 1. versus_board_cache: one row per realm. Only the functions below touch it.
-- 2. versus_powers_shown(raw powers, mega, gmax, z): player_powers()'s shaping, on powers already read.
-- 3. versus_board_stats(realm): the cache, built again when 15 minutes old. One caller builds (an advisory lock); the
--    others meanwhile get the previous build. Internal, not callable by players.
-- 4. versus_board(): same signature and columns as 0064's, now reading the cache. Volatile, as it may write the cache
--    (PostgREST runs stable functions read-only).
--
-- Run after 0064 (and 0114, which it keeps: the internal functions are taken from players); safe to run again. seed.sql inlines it after 0064, whose versus_board it redefines.

-- ---------------------------------------------------------------- 1. the cache

create table if not exists versus_board_cache (
  realm text primary key,
  built_at timestamptz not null,
  -- {user id: {a: attack wins, d: defense wins, r: has a rich card, p: the save's raw `powers`}}
  stats jsonb not null
);
alter table versus_board_cache enable row level security;
revoke all on versus_board_cache from anon, authenticated;

-- ---------------------------------------------------------------- 2. the powers, shaped for the caller

-- player_powers() (0064) on a `powers` already read: every key always there; a switch off empties its part.
create or replace function versus_powers_shown(p jsonb, p_mega boolean, p_gmax boolean, p_z boolean)
returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'gems', case when p_mega then coalesce((
              select jsonb_agg(g) from jsonb_array_elements(
                case when jsonb_typeof(p -> 'gems') = 'array' then p -> 'gems' else '[]'::jsonb end
              ) g where jsonb_typeof(g) = 'string'
            ), '[]'::jsonb) else '[]'::jsonb end,
    'gmax', p_gmax and coalesce(jsonb_typeof(p -> 'earned') = 'array' and p -> 'earned' ? 'gmax', false),
    'z', p_z and coalesce(jsonb_typeof(p -> 'earned') = 'array' and p -> 'earned' ? 'z', false)
  )
$$;
revoke all on function versus_powers_shown(jsonb, boolean, boolean, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. the cache, built again when 15 minutes old

create or replace function versus_board_stats(p_realm text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  st jsonb;
  at timestamptz;
  lock_key bigint := hashtext('versus_board_cache:' || coalesce(p_realm, ''));
begin
  select c.stats, c.built_at into st, at from versus_board_cache c where c.realm = p_realm;
  if st is not null and at > now() - interval '15 minutes' then
    return st;
  end if;
  -- A realm with no team keeps no row: a made-up realm name can't fill the table.
  if not exists (select 1 from versus_teams v where v.realm = p_realm) then
    return '{}'::jsonb;
  end if;
  if st is null then
    -- The very first build: everyone waits for the one building it.
    perform pg_advisory_xact_lock(lock_key);
  elsif not pg_try_advisory_xact_lock(lock_key) then
    -- Someone is building it now: the previous build serves meanwhile.
    return st;
  end if;
  -- Built while this call waited for the lock (or just before it took it): nothing more to do.
  select c.stats, c.built_at into st, at from versus_board_cache c where c.realm = p_realm;
  if st is not null and at > now() - interval '15 minutes' then
    return st;
  end if;

  select coalesce(jsonb_object_agg(v.user_id::text, jsonb_build_object(
    'a', (select count(*) from versus_battles b where b.realm = v.realm and b.attacker_id = v.user_id and b.won),
    'd', (
      select count(*) from (
        select distinct b.attacker_id, b.defender_version from versus_battles b
        where b.realm = v.realm and b.defender_id = v.user_id and not b.won
      ) held
    ),
    'r', exists (select 1 from player_cards pc where pc.user_id = v.user_id and pc.rich),
    'p', coalesce((select s.data -> 'powers' from saves s where s.user_id = v.user_id and s.realm = v.realm), '{}'::jsonb)
  )), '{}'::jsonb)
  into st
  from versus_teams v
  where v.realm = p_realm;

  insert into versus_board_cache (realm, built_at, stats) values (p_realm, now(), st)
  on conflict (realm) do update set built_at = excluded.built_at, stats = excluded.stats;
  return st;
end
$$;
revoke all on function versus_board_stats(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. the board

-- Versus (0018) is optional on a database that only ran seed.sql: made only when its tables are there, as in 0064.
do $do$
begin
  if to_regclass('public.versus_teams') is null then
    return;
  end if;
  execute $ddl$
    create or replace function versus_board(p_realm text default 'main')
    returns table (
      user_id uuid,
      is_me boolean,
      name text,
      "character" text,
      team jsonb,
      ids jsonb,
      version int,
      attack_wins int,
      defense_wins int,
      beaten boolean,
      rich boolean,
      powers jsonb
    )
    language sql volatile security definer set search_path = public as $body$
      -- A CTE with a volatile function is computed once, not per row.
      with cached as (select versus_board_stats(p_realm) st),
      caller as (
        select auth.uid() me, power_open('mega') mega, power_open('gmax') gmax, power_open('z') z, general_open() rich_on
      )
      select
        v.user_id,
        v.user_id = k.me,
        coalesce(c.name, 'Trainer'),
        coalesce(c.avatar, 'red'),
        v.team,
        case when v.user_id = k.me then v.ids end,
        v.version,
        coalesce(
          (x.s ->> 'a')::int,
          (select count(*)::int from versus_battles b where b.realm = v.realm and b.attacker_id = v.user_id and b.won)
        ),
        coalesce(
          (x.s ->> 'd')::int,
          (
            select count(*)::int from (
              select distinct b.attacker_id, b.defender_version from versus_battles b
              where b.realm = v.realm and b.defender_id = v.user_id and not b.won
            ) held
          )
        ),
        exists (
          select 1 from versus_battles b
          where b.realm = v.realm and b.attacker_id = k.me and b.defender_id = v.user_id
            and b.defender_version = v.version and b.won
        ),
        k.rich_on and coalesce(
          (x.s ->> 'r')::boolean,
          exists (select 1 from player_cards pc where pc.user_id = v.user_id and pc.rich)
        ),
        versus_powers_shown(
          coalesce(
            x.s -> 'p',
            (select s.data -> 'powers' from saves s where s.user_id = v.user_id and s.realm = v.realm),
            '{}'::jsonb
          ),
          k.mega, k.gmax, k.z
        )
      from versus_teams v
      cross join cached
      cross join caller k
      -- Your own row is never read from the cache.
      cross join lateral (
        select case when v.user_id is distinct from k.me then cached.st -> v.user_id::text end s
      ) x
      left join player_cards c on c.user_id = v.user_id and c.realm = v.realm
      where v.realm = p_realm
      order by v.updated_at desc
      limit 1000
    $body$
  $ddl$;
  revoke all on function versus_board(text) from public;
  grant execute on function versus_board(text) to anon, authenticated;
end
$do$;
