-- The leaderboard is rebuilt on a schedule, not by the players opening it (the database stalled on 2026-10-07).
--
-- 0026 kept the board in leaderboard_cache, but rebuilt it inside whichever leaderboard() call found it over a minute
-- old: that player waited for every active save to be read again (1.4–2.3 s on average), and a busy evening paid for
-- it up to once a minute. Now:
--
-- 1. leaderboard_rebuild() does the rebuild, and pg_cron runs it every 5 minutes.
-- 2. leaderboard() only reads the cache, plus the caller's own rows, live as before. It rebuilds the cache itself only
--    when the cache is over 15 minutes old: pg_cron is off, or its job is not running.
--
-- Same columns and rules as 0026 (bans, 72 hours of inactivity, a badge in the region). 0016_regions.sql carries the
-- same pieces, so re-running supabase/seed.sql (which inlines 0016) keeps them. Safe to run again.

-- The whole board, from scratch. One rebuild at a time: a second caller skips and the board stays as it was.
create or replace function leaderboard_rebuild() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('pokedice.leaderboard_refresh')) then
    return;
  end if;
  delete from leaderboard_cache where true;  -- a bare DELETE is refused through the API (pg-safeupdate)
  insert into leaderboard_cache (user_id, region, name, "character", team, pokedex, max_level, progress, updated_at)
  select r.user_id, r.region, r.name, r."character", r.team, r.pokedex, r.max_level, r.progress, r.updated_at
  from leaderboard_rows(now() - interval '72 hours', null) r;
  insert into leaderboard_cache_state (id, refreshed_at) values (true, now())
  on conflict (id) do update set refreshed_at = excluded.refreshed_at;
end
$$;

-- The fallback for when the scheduled rebuild isn't running: rebuild only a cache over 15 minutes old.
create or replace function leaderboard_refresh() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from leaderboard_cache_state where refreshed_at > now() - interval '15 minutes') then
    return;
  end if;
  perform leaderboard_rebuild();
end
$$;

revoke all on function leaderboard_rebuild() from public, anon, authenticated;
revoke all on function leaderboard_refresh() from public, anon, authenticated;

-- leaderboard() itself is unchanged (0026): it calls leaderboard_refresh(), which now almost never has work to do.

-- ---------------------------------------------------------------- every 5 minutes
-- Needs the pg_cron extension (Database → Extensions → pg_cron). Without it this says so and leaderboard() keeps
-- rebuilding a stale cache itself; enable pg_cron and run this file again.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'leaderboard-rebuild';
    perform cron.schedule('leaderboard-rebuild', '*/5 * * * *', 'select leaderboard_rebuild()');
  else
    raise notice 'pg_cron is off: the leaderboard is rebuilt by its readers every 15 minutes instead of every 5.';
  end if;
end
$$;

-- A first board right away, rather than at the next 5-minute mark.
select leaderboard_rebuild();
