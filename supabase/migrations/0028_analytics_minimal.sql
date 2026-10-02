-- Analytics cut down to the two things Admin → Analytics still shows: day-1 retention and each player's profile.
--
-- The game used to stream every level-up, purchase, playtime tick and snapshot into analytics_events. It now makes one
-- call per player per day, player_ping(), which records that day and refreshes the player's row (name, and a small
-- snapshot of their game for guests, who have no cloud save). Signed-in players' profiles are read from their cloud
-- save instead.
--
-- 1. player_days: one row per player per day played (the player's own calendar day).
-- 2. players: one row per player — first and last day, days played, name, email, latest snapshot.
-- 3. Both are filled once from the old analytics (running totals and latest snapshots), so retention keeps its history.
-- 4. analytics_events stops taking inserts and its rollup trigger goes. Its data stays until you drop it (the optional
--    block at the end frees ~300 MB).
--
-- Run once. Safe to run again.

create table if not exists player_days (
  player text not null,                -- user id, or 'device:<id>' for guests
  day date not null,
  primary key (player, day)
);

create table if not exists players (
  player text primary key,             -- user id, or 'device:<id>' for guests
  user_id uuid references auth.users(id) on delete set null,
  device_id text,
  name text,
  email text,
  first_day date not null,
  last_day date not null,
  days int not null default 1,
  snapshot jsonb,                      -- PlayerSnapshot (src/analytics/events.ts), as of updated_at
  updated_at timestamptz not null default now(),
  constraint players_snapshot_small check (snapshot is null or pg_column_size(snapshot) < 32000)
);
create index if not exists players_first_day on players (first_day);

alter table player_days enable row level security;
alter table players enable row level security;
revoke all on player_days, players from anon, authenticated;
drop policy if exists players_read on players;
create policy players_read on players for select using ((select is_admin()));
grant select on players to authenticated;

-- ---------------------------------------------------------------- the game's one call a day
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

-- ---------------------------------------------------------------- day-1 retention, for the admin
-- {first day: [new players, of them back the next day]}. The page sums the days of its time frame.
create or replace function analytics_d1()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    select json_object_agg(first_day, json_build_array(n, back))
    from (
      select p.first_day, count(*)::int as n,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 1
             ))::int as back
      from players p
      group by p.first_day
    ) x
  ), '{}'::json);
end
$$;
revoke all on function analytics_d1() from public;
grant execute on function analytics_d1() to authenticated;

-- ---------------------------------------------------------------- history from the old analytics
do $$
begin
  if to_regclass('public.analytics_player_hours') is not null then
    insert into player_days (player, day)
    select distinct player, (hour at time zone 'UTC')::date from analytics_player_hours
    on conflict do nothing;
  end if;

  insert into players as x (player, first_day, last_day, days)
  select player, min(day), max(day), count(*)
  from player_days
  group by player
  on conflict (player) do update set
    first_day = least(x.first_day, excluded.first_day),
    last_day = greatest(x.last_day, excluded.last_day),
    days = excluded.days;

  if to_regclass('public.analytics_events') is not null then
    -- Who each player is: their latest event that carries a name.
    update players x set
      user_id = coalesce(x.user_id, e.user_id),
      device_id = coalesce(x.device_id, e.device_id),
      name = coalesce(x.name, e.player_name),
      email = coalesce(x.email, e.email)
    from (
      select distinct on (coalesce(user_id::text, 'device:' || device_id))
             coalesce(user_id::text, 'device:' || device_id) as player, user_id, device_id, player_name, email
      from analytics_events
      where player_name is not null or email is not null
      order by coalesce(user_id::text, 'device:' || device_id), created_at desc, id desc
    ) e
    where x.player = e.player;

    -- Their latest game snapshot.
    update players x set snapshot = e.params, updated_at = e.created_at
    from (
      select distinct on (coalesce(user_id::text, 'device:' || device_id))
             coalesce(user_id::text, 'device:' || device_id) as player, params, created_at
      from analytics_events
      where kind = 'snapshot' and pg_column_size(params) < 32000
      order by coalesce(user_id::text, 'device:' || device_id), created_at desc, id desc
    ) e
    where x.player = e.player and x.snapshot is null;

    -- No more writes: the game doesn't send events any more, and a tab still on the old build gets a quick refusal
    -- instead of costing an insert and a rollup.
    drop trigger if exists analytics_rollup on analytics_events;
    drop policy if exists analytics_insert on analytics_events;
    revoke insert on analytics_events from anon, authenticated;
  end if;
end
$$;

-- ---------------------------------------------------------------- optional: drop the old analytics
-- Once Admin → Analytics shows retention and players from the new tables, this frees the space the events took.
-- Not undoable. Run these lines on their own:
--
--   drop table if exists analytics_events, analytics_player_hours, analytics_player_reach cascade;
--   drop function if exists analytics_player_days(text), analytics_player_progress(), analytics_prune(int, int),
--     analytics_rebuild_rollups(), analytics_rollup(), analytics_rollup_batch(), analytics_event_level(text, jsonb);
--   select cron.unschedule('analytics-prune') where exists (select 1 from cron.job where jobname = 'analytics-prune');
