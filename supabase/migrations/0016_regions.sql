-- Regions: Kanto, Johto, Hoenn. A region is a self-contained run — its own chain of areas, its own starters, its own
-- Pokédex page and its own leaderboard — and the player keeps only their character when they move on.

create table if not exists regions (
  id text primary key,                 -- 'kanto', 'johto', 'hoenn'
  name text not null,
  order_index int not null unique,
  dex_range jsonb not null,            -- [1, 151]: the generation this region's page is about
  starters jsonb not null,             -- [1, 4, 7]
  starter_level int not null default 5,
  league_area_id uuid not null,        -- clearing this area is "the league is done"
  next_region text references regions(id),
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
drop function if exists leaderboard();
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
language sql stable security definer set search_path = public as $$
  with blocks as (
    -- The live region…
    select
      s.user_id,
      coalesce(s.data ->> 'region', 'kanto') as region,
      s.data as block,
      s.data as root,
      s.updated_at
    from saves s
    union all
    -- …and every parked one, which carries the same fields.
    select s.user_id, p.key, p.value, s.data, s.updated_at
    from saves s, jsonb_each(coalesce(s.data -> 'parked', '{}')) p(key, value)
  )
  select
    b.region,
    b.user_id = auth.uid(),
    left(coalesce(nullif(trim(b.root -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    coalesce(b.root -> 'player' ->> 'character', 'red'),
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
    ), '{}')
  from blocks b
  where not exists (select 1 from leaderboard_bans x where x.user_id = b.user_id)
  order by b.updated_at desc
  limit 3000
$$;

revoke all on function leaderboard() from public;
grant execute on function leaderboard() to anon, authenticated;
