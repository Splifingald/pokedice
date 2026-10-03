-- The leaderboard only lists trainers with a badge: a region's row shows once the player has won at least one gym
-- badge in that region (a trainer with `badge` set among the gyms beaten there). The client keeps the board itself
-- locked until the player's first badge (leaderboardUnlocked in src/engine/daycare.ts). Keeps 0023's 72-hour
-- activity rule.
--
-- 0016_regions.sql carries the same leaderboard() change, so re-running supabase/seed.sql (which inlines 0016) keeps
-- it. Safe to run again.

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
    ), '{}')
  from blocks b
  where not exists (select 1 from leaderboard_bans x where x.user_id = b.user_id)
    and (b.updated_at > now() - interval '72 hours' or b.user_id = auth.uid())
    -- At least one gym badge won in this region (0024): a trainer whose `badge` is set, among the block's gyms beaten.
    and exists (
      select 1
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v),
        jsonb_array_elements_text(coalesce(v -> 'gymsDefeated', '[]')) g(id)
      join trainers t on t.id::text = g.id
      where coalesce(t.badge, '') <> ''
    )
  order by b.updated_at desc
  limit 3000
$$;

revoke all on function leaderboard() from public;
grant execute on function leaderboard() to anon, authenticated;
