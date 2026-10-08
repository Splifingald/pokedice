-- Regions: Kanto, Johto, Hoenn. A region is a self-contained run — its own chain of areas, its own starters, its own
-- Pokédex page and its own leaderboard — and the player keeps only their character when they move on.

create table if not exists regions (
  id text primary key,                 -- 'kanto', 'johto', 'hoenn'
  name text not null,
  order_index int not null unique,
  dex_range jsonb not null,            -- [1, 151]: the generation this region's page is about
  starters jsonb not null,             -- [1, 4, 7]
  starter_level int not null default 5,
  league_area_id uuid not null,        -- clearing this area is "the league is done" (a soft link to areas.id)
  -- Soft links, deliberately not foreign keys: admin saves regions row by row, and a half-finished chain (Johto
  -- pointing at a Hoenn that is not written yet) must not be rejected. The client tolerates a dangling id.
  next_region text,
  -- Off = the region is invisible everywhere: no prompt, no switcher, no Pokédex page, no board. Kanto is always on.
  enabled boolean not null default true
);

alter table regions enable row level security;
drop policy if exists regions_read on regions;
drop policy if exists regions_write on regions;
create policy regions_read on regions for select using (true);
create policy regions_write on regions for all using (is_admin()) with check (is_admin());

-- Which region's chain an area belongs to. Existing rows are Kanto, which is what they have always been.
alter table areas add column if not exists region_id text not null default 'kanto';
create index if not exists areas_region_idx on areas (region_id, order_index);

-- ---------------------------------------------------------------- leaderboard, one row per region played
--
-- Replaces 0011's leaderboard(): a save now holds the live region at its top level and the others under `parked`,
-- so a player who has played several regions appears once per region, and each board ranks only its own.
-- Later rules are kept here too, so re-running this file never brings an older board back: inactive players drop off
-- (0023), a region's row needs a badge (0024), the board is cached and rebuilt on a schedule (0026, 0031), and each
-- row counts its shinies (0032).
drop function if exists leaderboard();
-- Its columns grew (0032); a function's return type can't change in place.
drop function if exists leaderboard_rows(timestamptz, uuid);

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
  shinies int not null default 0,
  progress jsonb not null,
  updated_at timestamptz not null,
  primary key (user_id, region)
);
-- A cache made before 0032.
alter table leaderboard_cache add column if not exists shinies int not null default 0;
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
  shinies int,       -- shiny Pokémon owned in this region (Box, team and Day Care); a shiny is never released
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
    (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m
      where coalesce((m ->> 'shiny')::boolean, false))
    + (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'dayCare' -> 'residents', '[]')) r
      where coalesce((r -> 'inst' ->> 'shiny')::boolean, false)),
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

-- The whole board, from scratch (0031: pg_cron runs it every 5 minutes). One rebuild at a time: a second caller skips
-- and the board stays as it was.
create or replace function leaderboard_rebuild() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('pokedice.leaderboard_refresh')) then
    return;
  end if;
  delete from leaderboard_cache where true;  -- a bare DELETE is refused through the API (pg-safeupdate)
  insert into leaderboard_cache (user_id, region, name, "character", team, pokedex, max_level, shinies, progress, updated_at)
  select r.user_id, r.region, r.name, r."character", r.team, r.pokedex, r.max_level, r.shinies, r.progress, r.updated_at
  from leaderboard_rows(now() - interval '72 hours', null) r;
  insert into leaderboard_cache_state (id, refreshed_at) values (true, now())
  on conflict (id) do update set refreshed_at = excluded.refreshed_at;
end
$$;

-- The fallback for when the scheduled rebuild isn't running: rebuild only a cache over 15 minutes old.
create or replace function leaderboard_refresh() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from leaderboard_cache_state where refreshed_at > now() - interval '15 minutes') then
    return;
  end if;
  perform leaderboard_rebuild();
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
  shinies int,
  progress jsonb
)
language sql volatile security definer set search_path = public as $$
  select leaderboard_refresh();
  select r.region, r.user_id = auth.uid(), r.name, r."character", r.team, r.pokedex, r.max_level, r.shinies, r.progress
  from (
    -- Everyone else, from the cache (a ban takes effect at once, not at the next rebuild)…
    select c.user_id, c.region, c.name, c."character", c.team, c.pokedex, c.max_level, c.shinies, c.progress, c.updated_at
    from leaderboard_cache c
    where c.user_id is distinct from auth.uid()
      and not exists (select 1 from leaderboard_bans x where x.user_id = c.user_id)
    union all
    -- …and the caller, live, active or not (0023: the board can always open on them).
    select m.user_id, m.region, m.name, m."character", m.team, m.pokedex, m.max_level, m.shinies, m.progress, m.updated_at
    from leaderboard_rows(null, auth.uid()) m
  ) r
  order by r.updated_at desc
  limit 3000
$$;

revoke all on function leaderboard_rows(timestamptz, uuid) from public, anon, authenticated;
revoke all on function leaderboard_rebuild() from public, anon, authenticated;
revoke all on function leaderboard_refresh() from public, anon, authenticated;
revoke all on function leaderboard() from public;
grant execute on function leaderboard() to anon, authenticated;
