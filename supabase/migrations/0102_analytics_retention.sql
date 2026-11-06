-- Admin → Analytics, sharper (docs/57): day-3, day-7 and day-30 retention next to day-1, a guest who signs in no longer
-- counted as a new player, and churn by area on demand.
--
-- 1. players.last_area: the area the player was in the last time the game reported, refreshed by the daily ping's
--    snapshot and now by the hourly player_seen too, so it is where they were in the last hour they played, not where
--    they started their last day.
-- 2. analytics_merge_player(): moves one player's days, hours and missing details into another key, then deletes the
--    first. Internal: only the functions below call it.
-- 3. player_ping() (0028, 0042), same signature: signed in, it first merges this device's guest row
--    ('device:<id>') into the account, so a guest who signs in keeps their first day instead of counting twice.
-- 4. player_seen(device, area): the hourly call carries the area (an Extreme save sends none). player_seen(device),
--    the deployed builds' call, keeps working.
-- 5. Once: the pairs already there (a signed-in row whose latest device has a guest row) are merged.
-- 6. analytics_retention(): {first day: [new players, back on day 1, day 3, day 7, day 30]}. analytics_d1 (0028) stays
--    as it is for the build still calling it.
-- 7. analytics_churn(days, since): per area, the players gone that many days and the ones still playing.
--
-- Run it before deploying the build that calls analytics_retention. Safe to run again.
begin;

alter table players add column if not exists last_area text;

-- Where every player was as of their latest snapshot, until the game reports again.
update players set last_area = snapshot ->> 'areaId'
where last_area is null and length(snapshot ->> 'areaId') between 1 and 64;

-- ---------------------------------------------------------------- one player's history into another's
-- The days and hours are a union (a day both keys played counts once); the target keeps its own name, email, snapshot
-- and area and takes the source's only where it has none; first and last day span both; days is recounted. The target
-- row is created from the source when it doesn't exist yet (a first sign-in). False when there is no source row.
create or replace function analytics_merge_player(p_from text, p_into text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  g players%rowtype;
begin
  if p_from is null or p_into is null or p_from = p_into then
    return false;
  end if;
  -- Locked, so two tabs signing in at once can't both move it.
  select * into g from players where player = p_from for update;
  if not found then
    return false;
  end if;
  insert into player_days (player, day) select p_into, day from player_days where player = p_from on conflict do nothing;
  delete from player_days where player = p_from;
  insert into player_hours (hour, player) select hour, p_into from player_hours where player = p_from
  on conflict do nothing;
  delete from player_hours where player = p_from;
  delete from players where player = p_from;
  insert into players as x (player, user_id, device_id, name, email, first_day, last_day, days, snapshot, last_area,
                            updated_at)
  values (p_into, null, g.device_id, g.name, g.email, g.first_day, g.last_day, g.days, g.snapshot, g.last_area,
          g.updated_at)
  on conflict (player) do update set
    device_id = coalesce(x.device_id, excluded.device_id),
    name = coalesce(x.name, excluded.name),
    email = coalesce(x.email, excluded.email),
    first_day = least(x.first_day, excluded.first_day),
    last_day = greatest(x.last_day, excluded.last_day),
    snapshot = coalesce(x.snapshot, excluded.snapshot),
    last_area = coalesce(x.last_area, excluded.last_area),
    updated_at = greatest(x.updated_at, excluded.updated_at);
  update players set days = (select count(*) from player_days d where d.player = p_into) where player = p_into;
  return true;
end
$$;
revoke all on function analytics_merge_player(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the game's one call a day (0028, 0042)
create or replace function player_ping(p_device_id text, p_day date, p_name text default null, p_snapshot jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'UTC')::date;
  p text;
  area text;
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  -- The player's local day is within a day of UTC's, wherever they are.
  if p_day is null or p_day < today - 1 or p_day > today + 1 then
    raise exception 'bad day' using errcode = '22023';
  end if;
  if p_snapshot is not null and pg_column_size(p_snapshot) >= 32000 then
    p_snapshot := null;
  end if;
  area := p_snapshot ->> 'areaId';
  if length(area) not between 1 and 64 then
    area := null;
  end if;
  p := coalesce(uid::text, 'device:' || p_device_id);

  -- A guest who signs in on this device is the same player: their days so far become the account's, and their first
  -- day stays their first (else they'd count once as a guest who never came back and once as a new player).
  if uid is not null then
    perform analytics_merge_player('device:' || p_device_id, p);
  end if;

  insert into player_days (player, day) values (p, p_day) on conflict do nothing;
  insert into player_hours (hour, player) values (date_trunc('hour', now(), 'UTC'), p) on conflict do nothing;
  insert into players as x (player, user_id, device_id, name, email, first_day, last_day, days, snapshot, last_area,
                            updated_at)
  values (p, uid, p_device_id, left(nullif(trim(p_name), ''), 40), auth.jwt() ->> 'email', p_day, p_day,
          (select count(*) from player_days d where d.player = p), p_snapshot, area, now())
  on conflict (player) do update set
    user_id = coalesce(excluded.user_id, x.user_id),
    device_id = excluded.device_id,
    name = coalesce(excluded.name, x.name),
    email = coalesce(excluded.email, x.email),
    first_day = least(x.first_day, excluded.first_day),
    last_day = greatest(x.last_day, excluded.last_day),
    days = excluded.days,
    snapshot = coalesce(excluded.snapshot, x.snapshot),
    last_area = coalesce(excluded.last_area, x.last_area),
    updated_at = now();
end
$$;
revoke all on function player_ping(text, date, text, jsonb) from public;
grant execute on function player_ping(text, date, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- the game's call, once per player per hour (0042)
-- An overload rather than a defaulted parameter: the deployed build's call (device only) and the new one (device and
-- area) each match exactly one function, for PostgREST and for SQL alike.
create or replace function player_seen(p_device_id text, p_area_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p text;
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  p := coalesce(auth.uid()::text, 'device:' || p_device_id);
  insert into player_hours (hour, player) values (date_trunc('hour', now(), 'UTC'), p) on conflict do nothing;
  -- No area (an Extreme save, or an old build) leaves the main save's where it was.
  if length(p_area_id) between 1 and 64 then
    update players set last_area = p_area_id where player = p and last_area is distinct from p_area_id;
  end if;
  -- Nothing reads past a day; a week is kept to look back by hand. The key starts with the hour, so this is one
  -- index probe when there is nothing to delete.
  delete from player_hours where hour < now() - interval '8 days';
end
$$;
revoke all on function player_seen(text, text) from public;
grant execute on function player_seen(text, text) to anon, authenticated;

create or replace function player_seen(p_device_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform player_seen(p_device_id, null::text);
end
$$;
revoke all on function player_seen(text) from public;
grant execute on function player_seen(text) to anon, authenticated;

-- ---------------------------------------------------------------- once: the guests who already signed in
-- players.device_id only holds each account's latest device, so a guest row from an older device can't be matched.
-- A guest row matched by two accounts (a shared device) goes to the one that started first, as player_ping would have
-- given it to the first to sign in there.
do $$
declare
  r record;
begin
  for r in
    select distinct on (g.player) g.player as guest, u.player as owner
    from players u
    join players g on g.player = 'device:' || u.device_id
    where u.user_id is not null and u.device_id is not null and u.player not like 'device:%'
    order by g.player, u.first_day, u.player
  loop
    perform analytics_merge_player(r.guest, r.owner);
  end loop;
end
$$;

-- ---------------------------------------------------------------- retention, for the admin
-- {first day: [new players, of them back on day 1, day 3, day 7, day 30]}, day 0 being the first day. The page sums the
-- days of its time frame, each rate over the first days whose day N is over. Each check is one probe of player_days'
-- primary key.
create or replace function analytics_retention()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    select json_object_agg(first_day, json_build_array(n, d1, d3, d7, d30) order by first_day)
    from (
      select p.first_day, count(*)::int as n,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 1))::int as d1,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 3))::int as d3,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 7))::int as d7,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 30))::int as d30
      from players p
      group by p.first_day
    ) x
  ), '{}'::json);
end
$$;
revoke all on function analytics_retention() from public, anon;
grant execute on function analytics_retention() to authenticated;

-- ---------------------------------------------------------------- churn by area, for the admin, on demand
-- A player is churned when their last day is p_days or more before today (UTC: a player's own day is within one of
-- it), else active. Only players whose first day is on or after p_since (null: everyone). {today, cutoff (the latest
-- last day that counts as churned), areas: {area id: [churned, active, churned's average days played, active's]},
-- unknown: [churned, active] with no area recorded}.
create or replace function analytics_churn(p_days int, p_since date default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'UTC')::date;
  cutoff date;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'bad days' using errcode = '22023';
  end if;
  cutoff := today - p_days;
  return (
    with x as (
      select coalesce(nullif(last_area, ''), nullif(snapshot ->> 'areaId', '')) as area, last_day <= cutoff as gone,
             days
      from players
      where p_since is null or first_day >= p_since
    )
    select json_build_object(
      'today', today,
      'cutoff', cutoff,
      'areas', coalesce((
        select json_object_agg(area, json_build_array(churned, active, churned_days, active_days))
        from (
          select area,
                 count(*) filter (where gone)::int as churned,
                 count(*) filter (where not gone)::int as active,
                 round(avg(days) filter (where gone), 1) as churned_days,
                 round(avg(days) filter (where not gone), 1) as active_days
          from x
          where area is not null
          group by area
        ) a
      ), '{}'::json),
      'unknown', (
        select json_build_array(count(*) filter (where gone)::int, count(*) filter (where not gone)::int)
        from x
        where area is null
      )
    )
  );
end
$$;
revoke all on function analytics_churn(int, date) from public, anon;
grant execute on function analytics_churn(int, date) to authenticated;

commit;
