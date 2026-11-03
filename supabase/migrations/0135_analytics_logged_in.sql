-- Admin → Analytics, by who plays (docs/57 §1.1): every number of the page for All players, the logged-in ones only or
-- the ones not logged in (guests) only. A player is a guest when their key is their device ('device:<id>'); a guest who
-- signs in is merged into their account (0102), so they count as logged in from their first day as a guest.
--
-- 1. analytics_retention() (0102), same signature: each first day's array grows from 5 numbers to 10, the guests' own
--    five after the first five (all players): [new, back on day 1, day 3, day 7, day 30, the same five for guests].
--    The page works out the logged-in ones as all − guests, so switching costs no request. The deployed build reads
--    only the first five.
-- 2. analytics_hourly() (0042), same signature: `guests`, the different guests over the 24 hours, next to `total`
--    (each hour already carries its guests). The deployed build ignores it.
-- 3. analytics_churn(days, since, who): churn counts averages, which can't be split after the fact, so the page asks
--    for the players it wants ('all', 'logged_in' or 'guests'). analytics_churn(days, since) (0129), the deployed
--    build's call, stays and asks for 'all'. An overload with no default on `who`, so each call matches one function.
--
-- Run after 0129 (and 0042, 0102). Safe to run again. Not in seed.sql, as no analytics migration is.
begin;

-- ---------------------------------------------------------------- 1. retention, all players and guests
-- Each check is one probe of player_days' primary key, as in 0102: the flags are worked out once per player and
-- counted twice.
create or replace function analytics_retention()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    select json_object_agg(first_day, json_build_array(
      n, d1, d3, d7, d30, g, g1, g3, g7, g30) order by first_day)
    from (
      select first_day,
             count(*)::int as n,
             count(*) filter (where r1)::int as d1,
             count(*) filter (where r3)::int as d3,
             count(*) filter (where r7)::int as d7,
             count(*) filter (where r30)::int as d30,
             count(*) filter (where guest)::int as g,
             count(*) filter (where guest and r1)::int as g1,
             count(*) filter (where guest and r3)::int as g3,
             count(*) filter (where guest and r7)::int as g7,
             count(*) filter (where guest and r30)::int as g30
      from (
        select p.first_day, p.player like 'device:%' as guest,
               exists (select 1 from player_days d where d.player = p.player and d.day = p.first_day + 1) as r1,
               exists (select 1 from player_days d where d.player = p.player and d.day = p.first_day + 3) as r3,
               exists (select 1 from player_days d where d.player = p.player and d.day = p.first_day + 7) as r7,
               exists (select 1 from player_days d where d.player = p.player and d.day = p.first_day + 30) as r30
        from players p
      ) f
      group by first_day
    ) x
  ), '{}'::json);
end
$$;
revoke all on function analytics_retention() from public, anon;
grant execute on function analytics_retention() to authenticated;

-- ---------------------------------------------------------------- 2. players per hour, with the guests' total
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
    'guests', (
      select count(distinct player)::int from player_hours where hour >= first_hour and player like 'device:%'
    ),
    'since', (select min(hour) from player_hours)
  );
end
$$;
revoke all on function analytics_hourly() from public;
grant execute on function analytics_hourly() to authenticated;

-- ---------------------------------------------------------------- 3. churn by starter and area, for some players
-- As in 0129, over the players `p_who` names: 'all', 'logged_in' (an account) or 'guests' (a device).
create or replace function analytics_churn(p_days int, p_since date, p_who text)
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
  if p_who is null or p_who not in ('all', 'logged_in', 'guests') then
    raise exception 'bad who' using errcode = '22023';
  end if;
  cutoff := today - p_days;
  return (
    with x as (
      select coalesce(nullif(last_area, ''), nullif(snapshot ->> 'areaId', '')) as area, starter,
             last_day <= cutoff as gone, days
      from players
      where (p_since is null or first_day >= p_since)
        and (p_who = 'all' or (player like 'device:%') = (p_who = 'guests'))
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
      ),
      'starters', coalesce((
        select json_object_agg(starter, json_build_array(churned, active, churned_days, active_days))
        from (
          select starter,
                 count(*) filter (where gone)::int as churned,
                 count(*) filter (where not gone)::int as active,
                 round(avg(days) filter (where gone), 1) as churned_days,
                 round(avg(days) filter (where not gone), 1) as active_days
          from x
          where starter is not null
          group by starter
        ) s
      ), '{}'::json),
      'noStarter', (
        select json_build_array(count(*) filter (where gone)::int, count(*) filter (where not gone)::int)
        from x
        where starter is null
      )
    )
  );
end
$$;
revoke all on function analytics_churn(int, date, text) from public, anon;
grant execute on function analytics_churn(int, date, text) to authenticated;

-- The deployed build's call: every player.
create or replace function analytics_churn(p_days int, p_since date default null)
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  return analytics_churn(p_days, p_since, 'all');
end
$$;
revoke all on function analytics_churn(int, date) from public, anon;
grant execute on function analytics_churn(int, date) to authenticated;

commit;
