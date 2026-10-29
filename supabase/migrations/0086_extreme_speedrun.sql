-- Extreme mode as a speedrun (docs/48). Each region whose League the main save has beaten is a run in the Extreme save,
-- from its starter to its League on a clock that never stops; the board ranks each region's best times, then the runs
-- still going by badges. Extreme mode now opens with Kanto's League.
--
-- 1. game_config `extreme`: its unlock region goes from Johto (the old default) to Kanto. A region the admin chose
--    otherwise is kept.
-- 2. player_card_regions: each Extreme region's run as the server saw it: its id, when the server first saw it (and
--    the start the save claims), when it first saw its League won, and the best time ever (ms), which a restart keeps.
-- 3. extreme_runs_write(): the card writer's step for an Extreme save. A run's time is the longer of the save's own
--    (its League won minus its start, both on the server's clock as the game reads it) and what the server saw between
--    its first upload and the upload with its League won, so a save can't claim a faster run than the server watched
--    go by. A run whose League was won before runs existed (`untimed`) gets no time.
-- 4. player_card_write(): 0078's, calling it for the Extreme realm.
-- 5. extreme_board(): every Extreme region row with a best time, or a run going and its player seen in the last 72
--    hours (or the caller's own). The client ranks them (src/lib/extremeBoard.ts).
--
-- Run after 0078. Safe to run again. seed.sql inlines it (scripts/seed.ts).

-- ---------------------------------------------------------------- 1. Kanto opens it

update game_config set value = jsonb_set(value, '{unlockRegion}', '"kanto"')
where key = 'extreme' and value ->> 'unlockRegion' = 'johto';

-- ---------------------------------------------------------------- 2. the runs on the cards

alter table player_card_regions add column if not exists run_id text;
alter table player_card_regions add column if not exists run_seen timestamptz;
alter table player_card_regions add column if not exists run_claimed bigint;
alter table player_card_regions add column if not exists run_won timestamptz;
alter table player_card_regions add column if not exists best_ms bigint;

-- ---------------------------------------------------------------- 3. the clock, as the server sees it

create or replace function extreme_runs_write(p_user uuid, d jsonb, p_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
  rid text;
  started numeric;
  finished numeric;
  claimed bigint;
  cur record;
  seen timestamptz;
  watched bigint;
begin
  if jsonb_typeof(d -> 'extreme' -> 'runs') <> 'object' then return; end if;
  for k, v in select * from jsonb_each(d -> 'extreme' -> 'runs') loop
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(v -> 'id') <> 'string' or jsonb_typeof(v -> 'startedAt') <> 'number' then
      continue;
    end if;
    rid := left(v ->> 'id', 80);
    started := (v ->> 'startedAt')::numeric;
    finished := case when jsonb_typeof(v -> 'finishedAt') = 'number' then (v ->> 'finishedAt')::numeric end;
    select * into cur from player_card_regions r where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    if not found then continue; end if;
    -- A new run (a start or a restart): the server's clock for it starts at this upload.
    seen := case when cur.run_id is distinct from rid then p_at else coalesce(cur.run_seen, p_at) end;
    if finished is not null and (cur.run_id is distinct from rid or cur.run_won is null) then
      -- Its League, first seen won now.
      claimed := greatest(0, least(finished - started, 9e15))::bigint;
      watched := greatest(0, floor(extract(epoch from (p_at - seen)) * 1000))::bigint;
      update player_card_regions r set
        run_id = rid, run_seen = seen, run_claimed = started::bigint, run_won = p_at,
        best_ms = case
          when coalesce((v -> 'untimed') = 'true'::jsonb, false) then r.best_ms
          else least(coalesce(r.best_ms, greatest(claimed, watched)), greatest(claimed, watched))
        end
      where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    elsif cur.run_id is distinct from rid or (finished is null and cur.run_won is not null) then
      update player_card_regions r set run_id = rid, run_seen = seen, run_claimed = started::bigint, run_won = null
      where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    end if;
  end loop;
end
$$;
revoke all on function extreme_runs_write(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. the card writer calls it

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

  -- Extreme mode's runs (docs/48): each region's clock, as the server sees it.
  if p_realm = 'extreme' then
    perform extreme_runs_write(p_user, d, p_at);
  end if;
end
$$;
revoke all on function player_card_write(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. the board

create or replace function extreme_board()
returns table (
  region text,
  is_me boolean,
  name text,
  "character" text,
  team jsonb,
  badges int,
  best_ms bigint,
  running boolean,
  run_seen timestamptz,
  is_friend boolean,
  friend_id uuid,
  rich boolean
)
language sql stable security definer set search_path = public as $$
  select r.region, r.user_id = auth.uid(), c.name, c.avatar, r.team, cardinality(r.badges), r.best_ms,
         r.run_id is not null and r.run_won is null, r.run_seen,
         m.id is not null, m.id, player_rich(c.user_id)
  from player_card_regions r
  join player_cards c on c.user_id = r.user_id and c.realm = r.realm
  left join friend_ids_of(auth.uid()) m on m.id = r.user_id
  where r.realm = 'extreme'
    and (
      r.best_ms is not null
      or (r.run_id is not null and r.run_won is null and (c.updated_at > now() - interval '72 hours' or r.user_id = auth.uid()))
    )
    and not exists (select 1 from leaderboard_bans x where x.user_id = r.user_id)
  order by r.best_ms nulls last, c.updated_at desc
  limit 3000
$$;
revoke all on function extreme_board() from public;
grant execute on function extreme_board() to anon, authenticated;

-- ---------------------------------------------------------------- the cards of Extreme saves played lately

select player_card_write(s.user_id, s.data, s.updated_at, s.realm)
from saves s
where s.realm = 'extreme' and s.updated_at > now() - interval '72 hours';

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
