-- Lighter load on the database (the Nano instance stalled on 2026-10-01: CPU tripled the day 0021–0024 went in).
--
-- 1. leaderboard() no longer reads every active save on every call. The board is kept in leaderboard_cache, rebuilt
--    at most once a minute by whichever call finds it stale (the others read the previous copy meanwhile); only the
--    caller's own rows are worked out live, so a player always sees themselves up to date. Same columns, same rules
--    (bans, 72 hours of inactivity from 0023, a badge in the region from 0024).
-- 2. The analytics rollup (0021) runs once per insert statement instead of once per event: the game sends events in
--    batches of up to 200, which now cost one upsert per player and hour rather than two per event.
-- 3. saves(updated_at) is indexed, so the leaderboard reads only the saves played in the last 72 hours.
--
-- 0016_regions.sql carries the same leaderboard() pieces, so re-running supabase/seed.sql (which inlines 0016) keeps
-- them. Safe to run again.

-- ---------------------------------------------------------------- leaderboard

create index if not exists saves_updated_at on saves (updated_at desc);

-- The board as of the last rebuild: one row per player and region played.
create table if not exists leaderboard_cache (
  user_id uuid not null,
  region text not null,
  name text not null,
  "character" text not null,
  team jsonb not null,
  pokedex int not null,
  max_level int not null,
  progress jsonb not null,
  updated_at timestamptz not null,
  primary key (user_id, region)
);
create table if not exists leaderboard_cache_state (
  id boolean primary key default true check (id),
  refreshed_at timestamptz not null
);
-- Only the security definer functions below touch them.
alter table leaderboard_cache enable row level security;
alter table leaderboard_cache_state enable row level security;
revoke all on leaderboard_cache, leaderboard_cache_state from anon, authenticated;

-- The rows of every save played since `p_since`, plus `p_user`'s (either may be null). The trainers holding a badge are
-- listed once rather than looked up again for every save.
create or replace function leaderboard_rows(p_since timestamptz, p_user uuid)
returns table (
  user_id uuid,
  region text,
  name text,
  "character" text,
  team jsonb,
  pokedex int,
  max_level int,
  progress jsonb,
  updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with badge_gyms as materialized (
    select coalesce(array_agg(t.id::text), '{}') as ids from trainers t where coalesce(t.badge, '') <> ''
  ),
  picked as materialized (
    select s.user_id, s.data, s.updated_at
    from saves s
    where (s.updated_at > p_since or s.user_id = p_user)
      and not exists (select 1 from leaderboard_bans x where x.user_id = s.user_id)
  ),
  blocks as (
    -- The live region…
    select p.user_id, coalesce(p.data ->> 'region', 'kanto') as region, p.data as block, p.data as root, p.updated_at
    from picked p
    union all
    -- …and every parked one, which carries the same fields.
    select p.user_id, k.key, k.value, p.data, p.updated_at
    from picked p, jsonb_each(coalesce(p.data -> 'parked', '{}')) k(key, value)
  )
  select
    b.user_id,
    b.region,
    left(coalesce(nullif(trim(b.root -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    -- The look (0022): the player's pick, else their character.
    coalesce(b.root -> 'player' ->> 'avatar', b.root -> 'player' ->> 'character', 'red'),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'dex', (m ->> 'dex')::int, 'level', (m ->> 'level')::int, 'shiny', coalesce((m ->> 'shiny')::boolean, false)
      ) order by t.ord)
      from jsonb_array_elements_text(coalesce(b.block -> 'team', '[]')) with ordinality t(id, ord)
      join jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m on m ->> 'id' = t.id
    ), '[]'),
    (select count(distinct x)::int from jsonb_array_elements(coalesce(b.block -> 'pokedex', '[]')) x),
    greatest(
      coalesce((select max((m ->> 'level')::int) from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m), 0),
      coalesce((
        select max((r -> 'inst' ->> 'level')::int)
        from jsonb_array_elements(coalesce(b.block -> 'dayCare' -> 'residents', '[]')) r
      ), 0)
    ),
    coalesce((
      select jsonb_object_agg(k, jsonb_build_object(
        'cleared', coalesce((v ->> 'cleared')::boolean, false),
        'gyms', jsonb_array_length(coalesce(v -> 'gymsDefeated', '[]'))
      ))
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v)
    ), '{}'),
    b.updated_at
  from blocks b, badge_gyms bg
  -- At least one gym badge won in this region (0024): a trainer whose `badge` is set, among the block's gyms beaten.
  where exists (
    select 1
    from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v),
      jsonb_array_elements_text(coalesce(v -> 'gymsDefeated', '[]')) g(id)
    where g.id = any(bg.ids)
  )
$$;

-- Rebuild the cache when it is over a minute old. One call at a time: the others skip and read the previous copy.
create or replace function leaderboard_refresh() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from leaderboard_cache_state where refreshed_at > now() - interval '1 minute') then
    return;
  end if;
  if not pg_try_advisory_xact_lock(hashtext('pokedice.leaderboard_refresh')) then
    return;
  end if;
  -- Someone may have finished a rebuild between the check and the lock.
  if exists (select 1 from leaderboard_cache_state where refreshed_at > now() - interval '1 minute') then
    return;
  end if;
  delete from leaderboard_cache;
  insert into leaderboard_cache (user_id, region, name, "character", team, pokedex, max_level, progress, updated_at)
  select r.user_id, r.region, r.name, r."character", r.team, r.pokedex, r.max_level, r.progress, r.updated_at
  from leaderboard_rows(now() - interval '72 hours', null) r;
  insert into leaderboard_cache_state (id, refreshed_at) values (true, now())
  on conflict (id) do update set refreshed_at = excluded.refreshed_at;
end
$$;

-- Volatile now (it may rebuild the cache), so PostgREST runs it in a read-write transaction; the output is unchanged.
create or replace function leaderboard()
returns table (
  region text,
  is_me boolean,
  name text,
  "character" text,
  team jsonb,
  pokedex int,
  max_level int,
  progress jsonb
)
language sql volatile security definer set search_path = public as $$
  select leaderboard_refresh();
  select r.region, r.user_id = auth.uid(), r.name, r."character", r.team, r.pokedex, r.max_level, r.progress
  from (
    -- Everyone else, from the cache (a ban takes effect at once, not at the next rebuild)…
    select c.user_id, c.region, c.name, c."character", c.team, c.pokedex, c.max_level, c.progress, c.updated_at
    from leaderboard_cache c
    where c.user_id is distinct from auth.uid()
      and not exists (select 1 from leaderboard_bans x where x.user_id = c.user_id)
    union all
    -- …and the caller, live, active or not (0023: the board can always open on them).
    select m.user_id, m.region, m.name, m."character", m.team, m.pokedex, m.max_level, m.progress, m.updated_at
    from leaderboard_rows(null, auth.uid()) m
  ) r
  order by r.updated_at desc
  limit 3000
$$;

revoke all on function leaderboard_rows(timestamptz, uuid) from public, anon, authenticated;
revoke all on function leaderboard_refresh() from public, anon, authenticated;
revoke all on function leaderboard() from public;
grant execute on function leaderboard() to anon, authenticated;

-- ---------------------------------------------------------------- analytics rollup, per batch

-- Same totals as 0021's per-event analytics_rollup(), folded over every event of one insert.
create or replace function analytics_rollup_batch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into analytics_player_hours as h (player, hour, events)
  select coalesce(n.user_id::text, 'device:' || n.device_id), date_trunc('hour', n.created_at, 'UTC'), count(*)
  from new_events n
  where n.kind not in ('playtime', 'snapshot')
  group by 1, 2
  on conflict (player, hour) do update set events = h.events + excluded.events;

  insert into analytics_player_reach as r (player, top_level, areas)
  select e.player, coalesce(max(e.lvl), 0), coalesce(array_agg(distinct e.area) filter (where e.area is not null), '{}')
  from (
    select coalesce(n.user_id::text, 'device:' || n.device_id) as player,
           analytics_event_level(n.kind, n.params) as lvl,
           case when n.kind <> 'level_up' then n.params ->> 'areaId' end as area
    from new_events n
    where n.kind in ('level_up', 'area_unlocked', 'snapshot')
  ) e
  where e.lvl is not null or e.area is not null
  group by e.player
  on conflict (player) do update set
    top_level = greatest(r.top_level, excluded.top_level),
    areas = r.areas || array(select a from unnest(excluded.areas) a where a <> all(r.areas));
  return null;
end
$$;

drop trigger if exists analytics_rollup on analytics_events;
create trigger analytics_rollup after insert on analytics_events
  referencing new table as new_events
  for each statement execute function analytics_rollup_batch();
drop function if exists analytics_rollup();
