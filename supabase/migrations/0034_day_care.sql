-- Day Care v2 (docs/15-DAYCARE-BREEDING.md, phase 4): one Day Care for every region, and friends' Pokémon visiting.
--
-- 1. Cards per region, fixed for the shared Day Care. Since v2 the Day Care sits at the top level of the save whichever
--    region is live, each resident tagged with the region it came from. 0033's player_card_write read each region
--    block's own `dayCare`, so every resident would have counted for the live region: now the residents are read once
--    and each counts for its own region (`coalesce(region, live)`) in the best level and the shinies. A parked block
--    that still holds its own Day Care (a save last pushed by an older client) counts for that region, as before.
-- 2. What the friend picker needs: `player_cards.day_care`, the residents as `[{inst, dex, level, xp, since, shiny}]`,
--    the oldest first, at most the game_config `dayCare.slots` (2). The client works out their level now from level,
--    xp and since with the engine's own rule: the SQL does no game maths.
-- 3. friend_day_cares(): the caller's friends that have a Pokémon at their Day Care, from their cards (no save read).
--
-- seed.sql inlines this file after 0033, so a database that only re-runs seed.sql gets it too. Run once on the live
-- database after 0033; safe to run again.

-- ---------------------------------------------------------------- the card's Day Care

alter table player_cards add column if not exists day_care jsonb not null default '[]';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_cards_day_care_small') then
    alter table player_cards add constraint player_cards_day_care_small check (pg_column_size(day_care) < 4000);
  end if;
end
$$;

-- Writes a player's card from their save: the live region at the top level of the save, the others under `parked`,
-- and the one Day Care at the top level.
create or replace function player_card_write(p_user uuid, p_data jsonb, p_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  live text := coalesce(nullif(p_data ->> 'region', ''), 'kanto');
  badge_ids text[];
  slots int;
begin
  select coalesce(array_agg(t.id::text), '{}') into badge_ids from trainers t where coalesce(t.badge, '') <> '';
  select coalesce((select greatest(0, (value ->> 'slots')::int) from game_config where key = 'dayCare'), 2) into slots;

  insert into player_cards as c (user_id, name, avatar, region, area_id, updated_at, day_care)
  values (
    p_user,
    left(coalesce(nullif(trim(p_data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    left(coalesce(p_data -> 'player' ->> 'avatar', p_data -> 'player' ->> 'character', 'red'), 40),
    live,
    p_data ->> 'currentAreaId',
    p_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'inst', left(r -> 'inst' ->> 'id', 64),
        'dex', (r -> 'inst' ->> 'dex')::int,
        'level', (r -> 'inst' ->> 'level')::int,
        'xp', coalesce((r -> 'inst' ->> 'xp')::numeric, 0),
        'since', coalesce((r ->> 'since')::numeric, 0),
        'shiny', coalesce((r -> 'inst' ->> 'shiny')::boolean, false)
      ) order by ord)
      from (
        select r, ord
        from jsonb_array_elements(coalesce(p_data -> 'dayCare' -> 'residents', '[]')) with ordinality d(r, ord)
        order by coalesce((r ->> 'since')::numeric, 0), ord
        limit slots
      ) oldest
    ), '[]')
  )
  on conflict (user_id) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    region = excluded.region,
    area_id = excluded.area_id,
    updated_at = excluded.updated_at,
    day_care = excluded.day_care;

  delete from player_card_regions where user_id = p_user;
  with dc as (
    -- The one Day Care: each resident for the region it came from (untagged ones, from before v2, for the live one).
    select coalesce(nullif(r ->> 'region', ''), live) as region, r
    from jsonb_array_elements(coalesce(p_data -> 'dayCare' -> 'residents', '[]')) r
    union all
    -- A parked region's own Day Care, as saves pushed by an older client still have.
    select k.key, r
    from jsonb_each(coalesce(p_data -> 'parked', '{}')) k(key, value),
      jsonb_array_elements(coalesce(k.value -> 'dayCare' -> 'residents', '[]')) r
    where k.key <> live
  )
  insert into player_card_regions (user_id, region, team, pokedex, max_level, shinies, progress, badges, endgame)
  select
    p_user,
    b.region,
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
      coalesce((select max((d.r -> 'inst' ->> 'level')::int) from dc d where d.region = b.region), 0)
    ),
    (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m
      where coalesce((m ->> 'shiny')::boolean, false))
    + (select count(*)::int from dc d where d.region = b.region and coalesce((d.r -> 'inst' ->> 'shiny')::boolean, false)),
    coalesce((
      select jsonb_object_agg(k, jsonb_build_object(
        'cleared', coalesce((v ->> 'cleared')::boolean, false),
        'gyms', jsonb_array_length(coalesce(v -> 'gymsDefeated', '[]'))
      ))
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v)
    ), '{}'),
    coalesce((
      select array_agg(distinct g.id order by g.id)
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v),
        jsonb_array_elements_text(coalesce(v -> 'gymsDefeated', '[]')) g(id)
      where g.id = any(badge_ids)
    ), '{}'),
    coalesce((
      select (b.block -> 'areaProgress' -> rg.league_area_id::text ->> 'cleared')::boolean
      from regions rg where rg.id = b.region
    ), false)
  from (
    select live as region, p_data as block
    union all
    select k.key, k.value from jsonb_each(coalesce(p_data -> 'parked', '{}')) k(key, value) where k.key <> live
  ) b;
end
$$;

revoke all on function player_card_write(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- the read

-- My friends' Day Cares: friends only, from their cards (no save is read).
create or replace function friend_day_cares()
returns table (owner uuid, name text, avatar text, day_care jsonb)
language sql stable security definer set search_path = public as $$
  select c.user_id, c.name, c.avatar, c.day_care
  from friend_ids_of(auth.uid()) f
  join player_cards c on c.user_id = f.id
  where jsonb_array_length(c.day_care) > 0
$$;
revoke all on function friend_day_cares() from public, anon;
grant execute on function friend_day_cares() to authenticated;

-- ---------------------------------------------------------------- the cards that change

-- The cards of the players who have a Day Care (anywhere in their save): their Day Care column and their regions'
-- counts change. Nobody else's card moves.
do $$
declare
  s record;
begin
  for s in
    select x.user_id, x.data, x.updated_at from saves x
    where jsonb_array_length(coalesce(x.data -> 'dayCare' -> 'residents', '[]')) > 0
      or exists (
        select 1 from jsonb_each(coalesce(x.data -> 'parked', '{}')) k(key, value)
        where jsonb_array_length(coalesce(k.value -> 'dayCare' -> 'residents', '[]')) > 0
      )
  loop
    begin
      perform player_card_write(s.user_id, s.data, s.updated_at);
    exception when others then
      raise warning 'player card for %: %', s.user_id, sqlerrm;
    end;
  end loop;
end
$$;
