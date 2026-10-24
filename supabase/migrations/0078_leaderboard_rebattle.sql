-- The Elite Rebattle counts on the Progression board (the user's ask of 2026-10-24). Once a region's every area is
-- cleared, its rebattle's tiers (Bronze, Silver, Gold, Diamond) are the next steps of that board, and only a trainer
-- who has cleared all four too is in its Hall of Fame (src/lib/leaderboard.ts ranks them).
--
-- 1. The card writer (0049's) keeps each region's tiers cleared, from the save's `events.rebattle[region].done`, as a
--    `rebattle` count on the progress entry of that region's League area: `{"cleared": true, "gyms": 5, "rebattle": 2}`.
--    Only there and only above 0, so a card without a rebattle reads as before. leaderboard() already returns
--    `progress`, so it is unchanged, and so is every client reading it.
-- 2. The cards of trainers on the boards now (played in the last 72 hours) who hold a rebattle are written again, so
--    the board counts them before their next upload.
--
-- Run after 0049. Safe to run again. seed.sql inlines it after 0076 (scripts/seed.ts), so a seed run keeps this
-- version of the card writer.

-- ---------------------------------------------------------------- 1. the card keeps the tiers

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
        'shiny', coalesce((r -> 'inst' ->> 'shiny')::boolean, false)
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
end
$$;
revoke all on function player_card_write(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. the cards on the boards now

select player_card_write(s.user_id, s.data, s.updated_at, s.realm)
from saves s
where s.updated_at > now() - interval '72 hours'
  and jsonb_typeof(s.data -> 'events' -> 'rebattle') = 'object';
