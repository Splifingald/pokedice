-- Lighter save writes, and a cap on how often a player's own uploads are written (2026-10-11).
--
-- On 2026-10-11 the database stalled for an hour under save uploads: a few players reloading the game every few
-- seconds uploaded their whole save on every load (fixed in the game: src/store/sync.ts). This makes each upload cheaper
-- and stops any client — an old build still open, a broken one — from doing that again.
--
-- 1. The player card (0033, last redefined by 0039) is rebuilt on every upload: about half of what a typical upload
--    costs the database, a third of a nine-region one. It read the save through its argument some 18 times, and in a
--    trigger that argument is the stored value, compressed and kept out of line: each read fetched and decompressed the
--    whole save again. It is now unpacked once. Region rows that come out the same are left as they are, instead of
--    deleted and written again on every upload (an upload usually changes the region being played; a save can hold
--    nine), and the badge list is read through a small index rather than across every trainer.
--
-- 2. A player's own uploads draw on a budget of 10 that refills by one a minute: bursts pass, a steady stream is held to
--    one a minute. An upload over budget is refused with HTTP 429 (SQLSTATE PT429, which PostgREST turns into that
--    status), never silently dropped, so the game knows it wasn't written and sends it again later. The game itself
--    uploads at most every 2 minutes on its own (PUSH_GAP_MS), so a player never meets the cap. An upload that changes
--    nothing is still dropped first, for free (0037). Edits by the admin or from the SQL editor aren't counted.
--
-- Run after 0039. Safe to run again. seed.sql inlines it after 0039 (scripts/seed.ts), so a seed run keeps this version.

-- ---------------------------------------------------------------- 1. the card, unpacked once

create index if not exists trainers_badge_holders on trainers (id) where coalesce(badge, '') <> '';

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

  insert into player_cards as c (user_id, realm, name, avatar, region, area_id, updated_at, day_care)
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
    ), '[]')
  )
  on conflict (user_id, realm) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    region = excluded.region,
    area_id = excluded.area_id,
    updated_at = excluded.updated_at,
    day_care = excluded.day_care;

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
    select live as region, d as block
    union all
    select k.key, k.value from jsonb_each(coalesce(d -> 'parked', '{}')) k(key, value) where k.key <> live
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

-- ---------------------------------------------------------------- 2. a budget for a player's own uploads

alter table saves add column if not exists write_budget real not null default 10;
alter table saves add column if not exists written_at timestamptz not null default now();

create or replace function saves_throttle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  budget numeric;
begin
  if auth.uid() is distinct from new.user_id then
    return new; -- the admin, the SQL editor, server jobs
  end if;
  -- What was left at the last write, plus one a minute since, up to 10. Worked out from the row as stored: whatever a
  -- client sends in these two columns is overwritten.
  budget := least(10, old.write_budget::numeric + extract(epoch from now() - old.written_at) / 60);
  if budget < 1 then
    raise exception using
      errcode = 'PT429',
      message = 'save_rate_limited',
      detail = 'Too many save uploads in a short time: the next one is taken within a minute.';
  end if;
  new.write_budget := budget - 1;
  new.written_at := now();
  return new;
end
$$;

revoke all on function saves_throttle() from public, anon, authenticated;

-- Fires after saves_skip_unchanged (0037; same timing, so by name): an upload that changes nothing is dropped there and
-- costs no budget.
drop trigger if exists saves_throttle on saves;
create trigger saves_throttle before update on saves
  for each row execute function saves_throttle();
