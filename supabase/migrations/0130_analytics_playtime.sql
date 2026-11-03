-- Admin → Analytics → Playtime (docs/57 §3.2): how long each player has actually played, and all of them together.
--
-- Nothing measured it: the daily ping (0028) records the days played and player_seen (0042) the hours played in, not
-- the time. The game now counts the seconds it is on screen and in use (src/analytics/playtime.ts) and sends what it
-- counted with the calls it already makes, at most one an hour: no new request.
--
-- 1. players.play_seconds: the seconds played since this update; players.play_since: when the first ones arrived.
-- 2. analytics_add_playtime(player, seconds): internal. A call carries at most 2 hours (7,200 s), the most an hour's
--    call can owe (that hour, and the end of the last session, sent at the next one); anything else is dropped.
-- 3. player_ping(device, day, name, snapshot, seconds) and player_seen(device, area, seconds): the new calls, overloads
--    of the deployed ones (0102), which stay as they are. An overload, as in 0102: each call matches one function.
-- 4. analytics_merge_player() (0102): a guest who signs in brings their playtime to the account too.
-- 5. analytics_playtime(): {since, total, rows: {player: [seconds, hours played in over the last 7 days]}}. Admin-only;
--    the page calls it only when its button is pressed. The hours are there for the time before this update.
--
-- Run it before deploying the build that sends the seconds (after 0102). Safe to run again. Not in seed.sql, as no
-- analytics migration is.
begin;

alter table players add column if not exists play_seconds bigint not null default 0;
alter table players add column if not exists play_since timestamptz;

-- ---------------------------------------------------------------- 2. seconds into a player's row
create or replace function analytics_add_playtime(p_player text, p_seconds int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_seconds is null or p_seconds < 1 or p_seconds > 7200 then
    return;
  end if;
  update players set play_seconds = play_seconds + p_seconds, play_since = coalesce(play_since, now())
  where player = p_player;
end
$$;
revoke all on function analytics_add_playtime(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. the game's calls, with the seconds
-- The deployed one first (the day or hour, the merge of a guest who signed in, the row), then the seconds into the row
-- it leaves, so they land on the account a guest's row was just merged into.
create or replace function player_ping(p_device_id text, p_day date, p_name text, p_snapshot jsonb, p_seconds int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform player_ping(p_device_id, p_day, p_name, p_snapshot);
  perform analytics_add_playtime(coalesce(auth.uid()::text, 'device:' || p_device_id), p_seconds);
end
$$;
revoke all on function player_ping(text, date, text, jsonb, int) from public;
grant execute on function player_ping(text, date, text, jsonb, int) to anon, authenticated;

create or replace function player_seen(p_device_id text, p_area_id text, p_seconds int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform player_seen(p_device_id, p_area_id);
  perform analytics_add_playtime(coalesce(auth.uid()::text, 'device:' || p_device_id), p_seconds);
end
$$;
revoke all on function player_seen(text, text, int) from public;
grant execute on function player_seen(text, text, int) to anon, authenticated;

-- ---------------------------------------------------------------- 4. one player's history into another's (0102)
-- As 0102's, and the playtime adds up: both keys' seconds were played, never the same ones twice.
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
                            play_seconds, play_since, updated_at)
  values (p_into, null, g.device_id, g.name, g.email, g.first_day, g.last_day, g.days, g.snapshot, g.last_area,
          g.play_seconds, g.play_since, g.updated_at)
  on conflict (player) do update set
    device_id = coalesce(x.device_id, excluded.device_id),
    name = coalesce(x.name, excluded.name),
    email = coalesce(x.email, excluded.email),
    first_day = least(x.first_day, excluded.first_day),
    last_day = greatest(x.last_day, excluded.last_day),
    snapshot = coalesce(x.snapshot, excluded.snapshot),
    last_area = coalesce(x.last_area, excluded.last_area),
    play_seconds = x.play_seconds + excluded.play_seconds,
    play_since = least(x.play_since, excluded.play_since),
    updated_at = greatest(x.updated_at, excluded.updated_at);
  update players set days = (select count(*) from player_days d where d.player = p_into) where player = p_into;
  return true;
end
$$;
revoke all on function analytics_merge_player(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. the admin's read, on demand
-- Every player with seconds counted or an hour played in over the last 7 days: [seconds, hours]. `since` is when the
-- first seconds arrived (null: none yet), `total` all the seconds counted.
create or replace function analytics_playtime()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return (
    with h as (
      select player, count(*)::int as hours
      from player_hours
      where hour >= date_trunc('hour', now(), 'UTC') - interval '7 days'
      group by player
    ),
    x as (
      select coalesce(p.player, h.player) as player, coalesce(p.play_seconds, 0) as seconds,
             coalesce(h.hours, 0) as hours
      from (select player, play_seconds from players where play_seconds > 0) p
      full join h on h.player = p.player
    )
    select json_build_object(
      'since', (select min(play_since) from players),
      'total', (select coalesce(sum(play_seconds), 0) from players),
      'rows', coalesce((select json_object_agg(player, json_build_array(seconds, hours)) from x), '{}'::json)
    )
  );
end
$$;
revoke all on function analytics_playtime() from public, anon;
grant execute on function analytics_playtime() to authenticated;

commit;
