-- Admin → Analytics → Players per hour: how many different players played in each of the last 24 hours.
--
-- The daily ping (0028) records the days a player played, not the hours. This adds:
-- 1. player_hours: one row per player per UTC hour they played in, kept 8 days.
-- 2. player_seen(): the game's call for an hour it hasn't reported yet (at most one per player per hour, sent with a
--    save change). player_ping() now records its hour too, so the first hour of the day costs no extra call.
-- 3. analytics_hourly(): the chart's numbers. Admin-only, and the page calls it only when its button is pressed.
--
-- Run it before deploying the build that calls player_seen. Safe to run again.

create table if not exists player_hours (
  hour timestamptz not null,           -- the start of the UTC hour
  player text not null,                -- user id, or 'device:<id>' for guests
  primary key (hour, player)
);

-- Only the security definer functions below touch it.
alter table player_hours enable row level security;
revoke all on player_hours from anon, authenticated;

-- ---------------------------------------------------------------- the game's call, once per player per hour
create or replace function player_seen(p_device_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  insert into player_hours (hour, player)
  values (date_trunc('hour', now(), 'UTC'), coalesce(auth.uid()::text, 'device:' || p_device_id))
  on conflict do nothing;
  -- Nothing reads past a day; a week is kept to look back by hand. The key starts with the hour, so this is one
  -- index probe when there is nothing to delete.
  delete from player_hours where hour < now() - interval '8 days';
end
$$;
revoke all on function player_seen(text) from public;
grant execute on function player_seen(text) to anon, authenticated;

-- ---------------------------------------------------------------- the daily ping (0028) counts its hour too
create or replace function player_ping(p_device_id text, p_day date, p_name text default null, p_snapshot jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'UTC')::date;
  p text;
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
  p := coalesce(uid::text, 'device:' || p_device_id);

  insert into player_days (player, day) values (p, p_day) on conflict do nothing;
  insert into player_hours (hour, player) values (date_trunc('hour', now(), 'UTC'), p) on conflict do nothing;
  insert into players as x (player, user_id, device_id, name, email, first_day, last_day, days, snapshot, updated_at)
  values (p, uid, p_device_id, left(nullif(trim(p_name), ''), 40), auth.jwt() ->> 'email', p_day, p_day, 1, p_snapshot, now())
  on conflict (player) do update set
    user_id = coalesce(excluded.user_id, x.user_id),
    device_id = excluded.device_id,
    name = coalesce(excluded.name, x.name),
    email = coalesce(excluded.email, x.email),
    first_day = least(x.first_day, excluded.first_day),
    last_day = greatest(x.last_day, excluded.last_day),
    days = (select count(*) from player_days d where d.player = p),
    snapshot = coalesce(excluded.snapshot, x.snapshot),
    updated_at = now();
end
$$;
revoke all on function player_ping(text, date, text, jsonb) from public;
grant execute on function player_ping(text, date, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- the admin's chart
-- {hours: [[hour start, players, of them guests] × 24, oldest first, the current hour last], total: different
-- players over those 24 hours, since: the first hour ever recorded (the chart is partial until a day has passed)}.
create or replace function analytics_hourly()
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  last_hour timestamptz := date_trunc('hour', now(), 'UTC');
  first_hour timestamptz := last_hour - interval '23 hours';
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return json_build_object(
    'hours', (
      select json_agg(json_build_array(h.hour, coalesce(c.players, 0), coalesce(c.guests, 0)) order by h.hour)
      from generate_series(first_hour, last_hour, interval '1 hour') as h(hour)
      left join (
        select hour, count(*)::int as players, count(*) filter (where player like 'device:%')::int as guests
        from player_hours
        where hour >= first_hour
        group by hour
      ) c using (hour)
    ),
    'total', (select count(distinct player)::int from player_hours where hour >= first_hour),
    'since', (select min(hour) from player_hours)
  );
end
$$;
revoke all on function analytics_hourly() from public;
grant execute on function analytics_hourly() to authenticated;
