-- A Day Care resident grows no higher than the best Pokémon in its region's Box (docs/15 §XP), so a week away doesn't
-- bring back one stronger than the team. The rule is the client's (src/engine/daycare.ts, dayCareCap); the server
-- only puts the cap on the card, so friends who invite the Pokémon see the level it really has.
--
-- 1. player_card_write(): 0087's, each `day_care` entry with `cap` (that best level). Older cards have none: the
--    client then reads Lv.100, as before.
-- 2. The main cards of saves played lately, rewritten so the caps show without waiting for the next upload (Extreme
--    mode has no Day Care: its cards, and their run clocks, are left alone).
-- 3. configVersion + 1.
--
-- Run after 0087. Safe to run again. seed.sql inlines it (scripts/seed.ts).
begin;

-- ---------------------------------------------------------------- 1. the card writer, with the caps

create or replace function player_card_write(p_user uuid, p_data jsonb, p_at timestamptz, p_realm text default 'main')
returns void
language plpgsql security definer set search_path = public as $$
declare
  -- The save, unpacked: `|| '{}'` hands back the decompressed value (an empty object adds nothing), so the reads below
  -- don't each fetch and decompress the stored one.
  d jsonb := p_data || '{}'::jsonb;
  live text := coalesce(nullif(d ->> 'region', ''), 'kanto');
  badge_ids text[];
  slots int;
begin
  select coalesce(array_agg(t.id::text), '{}') into badge_ids from trainers t where coalesce(t.badge, '') <> '';
  select coalesce((select greatest(0, (value ->> 'slots')::int) from game_config where key = 'dayCare'), 2) into slots;

  insert into player_cards as c (user_id, realm, name, avatar, region, area_id, updated_at, day_care, rich)
  values (
    p_user,
    p_realm,
    left(coalesce(nullif(trim(d -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    left(coalesce(d -> 'player' ->> 'avatar', d -> 'player' ->> 'character', 'red'), 40),
    live,
    d ->> 'currentAreaId',
    p_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'inst', left(r -> 'inst' ->> 'id', 64),
        'dex', (r -> 'inst' ->> 'dex')::int,
        'level', (r -> 'inst' ->> 'level')::int,
        'xp', coalesce((r -> 'inst' ->> 'xp')::numeric, 0),
        'since', coalesce((r ->> 'since')::numeric, 0),
        'shiny', coalesce((r -> 'inst' ->> 'shiny')::boolean, false),
        -- The level it grows to (dayCareCap): the best level in its region's Box, a region gone reading the live one's.
        -- Null with an empty Box, where the client leaves only the level cap.
        'cap', (
          select max((m ->> 'level')::int)
          from jsonb_array_elements(coalesce(
            case when coalesce(nullif(r ->> 'region', ''), live) = live then d -> 'box'
              else coalesce(d -> 'parked' -> (r ->> 'region') -> 'box', d -> 'box') end,
            '[]')) m
        )
      ) order by ord)
      from (
        select r, ord
        from jsonb_array_elements(coalesce(d -> 'dayCare' -> 'residents', '[]')) with ordinality dc(r, ord)
        order by coalesce((r ->> 'since')::numeric, 0), ord
        limit slots
      ) oldest
    ), '[]'),
    -- Only a JSON true: a cast of whatever else a save might hold could fail, and the trigger would lose the whole card.
    coalesce((d -> 'general' -> 'rich') = 'true'::jsonb, false)
  )
  on conflict (user_id, realm) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    region = excluded.region,
    area_id = excluded.area_id,
    updated_at = excluded.updated_at,
    day_care = excluded.day_care,
    rich = excluded.rich;

  -- Regions the save no longer holds; the others are written below only where they changed.
  delete from player_card_regions r
  where r.user_id = p_user and r.realm = p_realm
    and r.region <> live and not (coalesce(d -> 'parked', '{}') ? r.region);

  with dc as (
    select coalesce(nullif(r ->> 'region', ''), live) as region, r
    from jsonb_array_elements(coalesce(d -> 'dayCare' -> 'residents', '[]')) r
    union all
    select k.key, r
    from jsonb_each(coalesce(d -> 'parked', '{}')) k(key, value),
      jsonb_array_elements(coalesce(k.value -> 'dayCare' -> 'residents', '[]')) r
    where k.key <> live
  )
  insert into player_card_regions as c (user_id, realm, region, team, pokedex, max_level, shinies, progress, badges, endgame)
  select
    p_user,
    p_realm,
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
      coalesce((select max((dc.r -> 'inst' ->> 'level')::int) from dc where dc.region = b.region), 0)
    ),
    (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m
      where coalesce((m ->> 'shiny')::boolean, false))
    + (select count(*)::int from dc where dc.region = b.region and coalesce((dc.r -> 'inst' ->> 'shiny')::boolean, false)),
    coalesce((
      select jsonb_object_agg(k, jsonb_build_object(
        'cleared', coalesce((v ->> 'cleared')::boolean, false),
        'gyms', jsonb_array_length(coalesce(v -> 'gymsDefeated', '[]'))
      ) || case when k = b.league and b.rebattle > 0 then jsonb_build_object('rebattle', b.rebattle) else '{}'::jsonb end)
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v)
    ), '{}'),
    coalesce((
      select array_agg(distinct g.id order by g.id)
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v),
        jsonb_array_elements_text(coalesce(v -> 'gymsDefeated', '[]')) g(id)
      where g.id = any(badge_ids)
    ), '{}'),
    coalesce((b.block -> 'areaProgress' -> b.league ->> 'cleared')::boolean, false)
  from (
    select x.region, x.block,
      (select rg.league_area_id::text from regions rg where rg.id = x.region) as league,
      -- Tiers cleared, kept by region in the save's shared events (only a JSON number: a cast of anything else could
      -- fail, and the trigger would lose the whole card).
      case when jsonb_typeof(d -> 'events' -> 'rebattle' -> x.region -> 'done') = 'number'
        then least(greatest(floor((d -> 'events' -> 'rebattle' -> x.region ->> 'done')::numeric), 0), 99)::int
        else 0 end as rebattle
    from (
      select live as region, d as block
      union all
      select k.key, k.value from jsonb_each(coalesce(d -> 'parked', '{}')) k(key, value) where k.key <> live
    ) x
  ) b
  on conflict (user_id, realm, region) do update set
    team = excluded.team,
    pokedex = excluded.pokedex,
    max_level = excluded.max_level,
    shinies = excluded.shinies,
    progress = excluded.progress,
    badges = excluded.badges,
    endgame = excluded.endgame
  where (c.team, c.pokedex, c.max_level, c.shinies, c.progress, c.badges, c.endgame)
    is distinct from (excluded.team, excluded.pokedex, excluded.max_level, excluded.shinies, excluded.progress, excluded.badges, excluded.endgame);

  -- Extreme mode's runs (docs/48): each region's clock, as the server sees it.
  if p_realm = 'extreme' then
    perform extreme_runs_write(p_user, d, p_at);
  end if;
end
$$;
revoke all on function player_card_write(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. the cards of saves played lately

select player_card_write(s.user_id, s.data, s.updated_at, s.realm)
from saves s
where s.realm = 'main' and s.updated_at > now() - interval '14 days';

-- ---------------------------------------------------------------- 3. players fetch the new content

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
