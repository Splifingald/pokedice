-- Leaderboard: one row per cloud save, so only players signed in with Google appear. Saves stay private (own_save);
-- this function reads them as the owner and returns only what the board shows: name, team, Pokédex size, best level
-- and campaign progress. Anyone may call it (guests see the board too, with an invitation to connect).
create or replace function leaderboard()
returns table (
  is_me boolean,
  name text,
  "character" text,
  team jsonb,        -- [{dex, level, shiny}] in team order
  pokedex int,       -- distinct species caught
  max_level int,     -- best level among the Box, team and Day Care
  progress jsonb     -- {areaId: {cleared, gyms}} (gyms = gym / Elite Four battles won there)
)
language sql stable security definer set search_path = public as $$
  select
    s.user_id = auth.uid(),
    left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    coalesce(s.data -> 'player' ->> 'character', 'red'),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'dex', (m ->> 'dex')::int, 'level', (m ->> 'level')::int, 'shiny', coalesce((m ->> 'shiny')::boolean, false)
      ) order by t.ord)
      from jsonb_array_elements_text(coalesce(s.data -> 'team', '[]')) with ordinality t(id, ord)
      join jsonb_array_elements(coalesce(s.data -> 'box', '[]')) m on m ->> 'id' = t.id
    ), '[]'),
    (select count(distinct x)::int from jsonb_array_elements(coalesce(s.data -> 'pokedex', '[]')) x),
    greatest(
      coalesce((select max((m ->> 'level')::int) from jsonb_array_elements(coalesce(s.data -> 'box', '[]')) m), 0),
      coalesce((
        select max((r -> 'inst' ->> 'level')::int)
        from jsonb_array_elements(coalesce(s.data -> 'dayCare' -> 'residents', '[]')) r
      ), 0)
    ),
    coalesce((
      select jsonb_object_agg(k, jsonb_build_object(
        'cleared', coalesce((v ->> 'cleared')::boolean, false),
        'gyms', jsonb_array_length(coalesce(v -> 'gymsDefeated', '[]'))
      ))
      from jsonb_each(coalesce(s.data -> 'areaProgress', '{}')) e(k, v)
    ), '{}')
  from saves s
  order by s.updated_at desc
  limit 1000
$$;

revoke all on function leaderboard() from public;
grant execute on function leaderboard() to anon, authenticated;
