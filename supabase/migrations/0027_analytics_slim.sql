-- analytics_events was 332 MB of a 339 MB database on 2026-10-01 (555k rows), and each insert took 0.5–1 s on the
-- Nano instance. This takes the weight off:
--
-- 1. Two indexes no query uses are dropped. They were for 0020's summaries, which read the running totals since 0021;
--    the admin page filters on kind, created_at, user_id and device_id, never on the coalesced player key. Every insert
--    wrote to them (60 MB between them).
-- 2. analytics_prune() deletes what nothing reads any more: snapshots older than a week, except each player's latest
--    (Admin → Analytics → player shows only that one), and every event older than `keep_days`. The all-time figures
--    (retention, top level, furthest area) live in the running totals (0021), which keep counting what was pruned.
--    Do NOT run analytics_rebuild_rollups() after a prune: it would recount from the events left and lose the rest.
--
-- Run once. Then run `select analytics_prune();` (a few seconds) and, optionally, the schedule at the bottom so it runs
-- every night. Safe to run again.

drop index if exists analytics_events_player;
drop index if exists analytics_events_player_kind;

create or replace function analytics_prune(keep_days int default 90, snapshot_days int default 7)
returns json
language plpgsql security definer set search_path = public as $$
declare
  old_snapshots bigint;
  old_events bigint;
begin
  -- Each player's latest snapshot stays, however old.
  with latest as (
    select distinct on (coalesce(user_id::text, 'device:' || device_id)) id
    from analytics_events
    where kind = 'snapshot'
    order by coalesce(user_id::text, 'device:' || device_id), created_at desc, id desc
  )
  delete from analytics_events e
  where e.kind = 'snapshot'
    and e.created_at < now() - make_interval(days => snapshot_days)
    and e.id not in (select id from latest);
  get diagnostics old_snapshots = row_count;

  delete from analytics_events e
  where e.created_at < now() - make_interval(days => keep_days)
    and e.kind <> 'snapshot';
  get diagnostics old_events = row_count;

  return json_build_object('snapshots_deleted', old_snapshots, 'events_deleted', old_events);
end
$$;
revoke all on function analytics_prune(int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- optional: every night at 03:17 UTC
-- Needs the pg_cron extension (Database → Extensions → pg_cron). Run these two lines on their own once it is on:
--
--   select cron.unschedule('analytics-prune') where exists (select 1 from cron.job where jobname = 'analytics-prune');
--   select cron.schedule('analytics-prune', '17 3 * * *', 'select analytics_prune()');
