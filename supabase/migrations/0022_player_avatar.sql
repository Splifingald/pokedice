-- The look: what other players see on the leaderboard and in Versus. A player picks it on their trainer card from the
-- Kanto and Johto trainer classes (the client's list, src/lib/avatars.ts); it is stored in the save as
-- `player.avatar`, and is the character (Red or Leaf) until they pick one.
--
-- Both boards keep their output: the `character` column now carries the look — the pick, else the character. An
-- older client reads anything but 'green' as Red, so it shows a picked look as Red rather than breaking.
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
  order by b.updated_at desc
  limit 3000
$$;

create or replace function versus_board()
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
  beaten boolean
)
language sql stable security definer set search_path = public as $$
  select
    v.user_id,
    v.user_id = auth.uid(),
    left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    coalesce(s.data -> 'player' ->> 'avatar', s.data -> 'player' ->> 'character', 'red'),
    v.team,
    case when v.user_id = auth.uid() then v.ids end,
    v.version,
    (select count(*)::int from versus_battles b where b.attacker_id = v.user_id and b.won),
    (
      select count(*)::int from (
        select distinct b.attacker_id, b.defender_version from versus_battles b where b.defender_id = v.user_id and not b.won
      ) held
    ),
    exists (
      select 1 from versus_battles b
      where b.attacker_id = auth.uid() and b.defender_id = v.user_id and b.defender_version = v.version and b.won
    )
  from versus_teams v
  left join saves s on s.user_id = v.user_id
  order by v.updated_at desc
  limit 1000
$$;
