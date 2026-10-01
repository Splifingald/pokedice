-- Admin → Analytics: running totals kept up to date as events come in, so retention and each player's progress read a
-- few small tables instead of every event (0020's functions read the whole table and still hit the 8 s statement
-- timeout on the live database). The two functions keep their names and output; only their source changes.
-- Run once; it fills the totals from the events already there. Safe to run again.

-- Player-action events (playtime and snapshots aside) per player per UTC hour. Hours rather than days so the admin's
-- own time zone decides the day (zones with a half-hour offset are off by those 30 minutes).
create table if not exists analytics_player_hours (
  player text not null,                -- user id, or 'device:<id>' for guests
  hour timestamptz not null,
  events int not null,
  primary key (player, hour)
);

-- Each player's highest level (level-ups, team / Day Care in snapshots) and every area reached, all time.
create table if not exists analytics_player_reach (
  player text primary key,
  top_level numeric not null default 0,
  areas text[] not null default '{}'
);

-- Only the security definer functions below touch them.
alter table analytics_player_hours enable row level security;
alter table analytics_player_reach enable row level security;
revoke all on analytics_player_hours, analytics_player_reach from anon, authenticated;

-- The level an event shows: a level-up's new level, or a snapshot's best team / Day Care level. Bad data → null.
create or replace function analytics_event_level(kind text, params jsonb) returns numeric
language sql immutable set search_path = public as $$
  select case
    when kind = 'level_up' and jsonb_typeof(params -> 'to') = 'number' then (params ->> 'to')::numeric
    when kind = 'snapshot' then (
      select max((m ->> 'level')::numeric)
      from jsonb_array_elements(
        (case when jsonb_typeof(params -> 'team') = 'array' then params -> 'team' else '[]'::jsonb end) ||
        (case when jsonb_typeof(params -> 'dayCare') = 'array' then params -> 'dayCare' else '[]'::jsonb end)
      ) m
      where jsonb_typeof(m) = 'object' and jsonb_typeof(m -> 'level') = 'number'
    )
  end
$$;

create or replace function analytics_rollup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p text := coalesce(new.user_id::text, 'device:' || new.device_id);
  lvl numeric;
  area text;
begin
  if new.kind not in ('playtime', 'snapshot') then
    insert into analytics_player_hours as h (player, hour, events)
    values (p, date_trunc('hour', new.created_at, 'UTC'), 1)
    on conflict (player, hour) do update set events = h.events + 1;
  end if;
  if new.kind in ('level_up', 'area_unlocked', 'snapshot') then
    lvl := analytics_event_level(new.kind, new.params);
    area := case when new.kind <> 'level_up' then new.params ->> 'areaId' end;
    if lvl is not null or area is not null then
      insert into analytics_player_reach as r (player, top_level, areas)
      values (p, coalesce(lvl, 0), case when area is null then '{}' else array[area] end)
      on conflict (player) do update set
        top_level = greatest(r.top_level, excluded.top_level),
        areas = case when area is null or area = any(r.areas) then r.areas else r.areas || area end;
    end if;
  end if;
  return null;
end
$$;

-- Refill both tables from every event (this migration does it once; run it again after deleting events by hand).
create or replace function analytics_rebuild_rollups() returns void
language plpgsql security definer set search_path = public as $$
begin
  lock table analytics_events in share row exclusive mode;  -- no insert slips between the refill and the trigger
  truncate analytics_player_hours, analytics_player_reach;
  insert into analytics_player_hours (player, hour, events)
  select coalesce(user_id::text, 'device:' || device_id), date_trunc('hour', created_at, 'UTC'), count(*)
  from analytics_events
  where kind not in ('playtime', 'snapshot')
  group by 1, 2;
  insert into analytics_player_reach (player, top_level, areas)
  select player, coalesce(max(lvl), 0), coalesce(array_agg(distinct area) filter (where area is not null), '{}')
  from (
    select coalesce(user_id::text, 'device:' || device_id) as player, analytics_event_level(kind, params) as lvl,
           case when kind <> 'level_up' then params ->> 'areaId' end as area
    from analytics_events
    where kind in ('level_up', 'area_unlocked', 'snapshot')
  ) e
  group by player;
end
$$;
revoke all on function analytics_rebuild_rollups() from public, anon, authenticated;

begin;
drop trigger if exists analytics_rollup on analytics_events;
create trigger analytics_rollup after insert on analytics_events for each row execute function analytics_rollup();
select analytics_rebuild_rollups();
commit;

-- Same output as in 0020, read from the totals.
create or replace function analytics_player_days(tz text default 'UTC')
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    select json_object_agg(player, days)
    from (
      select player, json_object_agg(day, n) as days
      from (
        select player, (hour at time zone tz)::date as day, sum(events)::int as n
        from analytics_player_hours
        group by 1, 2
      ) d
      group by player
    ) p
  ), '{}'::json);
end
$$;

create or replace function analytics_player_progress()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(x)
    from (
      select json_build_object('player', player, 'kind', 'level_up', 'params', json_build_object('to', top_level)) x
      from analytics_player_reach
      union all
      select json_build_object('player', r.player, 'kind', 'area_unlocked', 'params', json_build_object('areaId', a))
      from analytics_player_reach r
      cross join unnest(r.areas) a
    ) r
  ), '[]'::json);
end
$$;
