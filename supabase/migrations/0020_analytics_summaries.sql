-- Admin → Analytics: the all-time figures (retention, each player's progress) are summed up here instead of shipping
-- every event to the browser, which timed out once the table grew. Both are admin-only.

-- Retention: how many player-action events (playtime and snapshots aside) each player had on each calendar day, in the
-- viewer's time zone. {player: {'YYYY-MM-DD': events}}, player = user id or 'device:<id>' for guests.
-- json rather than jsonb: several times faster to build, and the browser only parses it.
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
        select coalesce(user_id::text, 'device:' || device_id) as player, (created_at at time zone tz)::date as day,
               count(*)::int as n
        from analytics_events
        where kind not in ('playtime', 'snapshot')
        group by 1, 2
      ) d
      group by player
    ) p
  ), '{}'::json);
end
$$;

-- Progress: per player, their highest level (level-ups, and team / Day Care levels in snapshots) as one level_up
-- event, and each area they reached (unlocked, or current in a snapshot) as an area_unlocked event.
-- [{player, kind, params}], the shape playerProgress() reads.
create or replace function analytics_player_progress()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    with ev as (
      select coalesce(user_id::text, 'device:' || device_id) as player, kind, params
      from analytics_events
      where kind in ('level_up', 'area_unlocked', 'snapshot')
    ),
    levels as (
      select player, (params ->> 'to')::numeric as level
      from ev
      where kind = 'level_up' and jsonb_typeof(params -> 'to') = 'number'
      union all
      select e.player, (m ->> 'level')::numeric
      from ev e
      cross join lateral jsonb_array_elements(
        (case when jsonb_typeof(e.params -> 'team') = 'array' then e.params -> 'team' else '[]'::jsonb end) ||
        (case when jsonb_typeof(e.params -> 'dayCare') = 'array' then e.params -> 'dayCare' else '[]'::jsonb end)
      ) m
      where e.kind = 'snapshot' and jsonb_typeof(m) = 'object' and jsonb_typeof(m -> 'level') = 'number'
    ),
    areas as (
      select distinct player, params ->> 'areaId' as area_id
      from ev
      where kind in ('area_unlocked', 'snapshot') and params ->> 'areaId' is not null
    )
    select json_agg(x)
    from (
      select json_build_object('player', player, 'kind', 'level_up', 'params', json_build_object('to', max(level))) x
      from levels
      group by player
      union all
      select json_build_object('player', player, 'kind', 'area_unlocked', 'params', json_build_object('areaId', area_id))
      from areas
    ) r
  ), '[]'::json);
end
$$;

revoke all on function analytics_player_days(text) from public;
revoke all on function analytics_player_progress() from public;
grant execute on function analytics_player_days(text) to authenticated;
grant execute on function analytics_player_progress() to authenticated;

-- The time-frame reads filter on kind and walk created_at: playtime for a frame, the feed without background events.
create index if not exists analytics_events_kind_created_at on analytics_events (kind, created_at desc);

-- Check the admin once per query rather than once per row.
drop policy if exists analytics_read on analytics_events;
drop policy if exists analytics_delete on analytics_events;
create policy analytics_read on analytics_events for select using ((select is_admin()));
create policy analytics_delete on analytics_events for delete using ((select is_admin()));
