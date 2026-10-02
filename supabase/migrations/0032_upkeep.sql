-- Upkeep for a bigger audience (docs/11-SCALING-COST-PLAN.md §6.5).
--
-- 1. Feedback: on top of 3 messages per device or player per 10 minutes (0019), at most 60 messages an hour from
--    signed-out senders altogether. A device id is whatever the page sends, so a bot could make up a new one for every
--    message; this caps what it can put in the database. Signed-in players aren't counted against it.
-- 2. upkeep_prune(), to run monthly:
--    - versus_battles: fights against a team version that has since been replaced, older than 30 days. Nothing reads
--      them any more: "beaten", "already won" and "first loss" only look at the current version, and the scores are
--      the counters on versus_teams (0031), which stay.
--    - players: the snapshot (up to 32 KB) of guests not seen for a year. Their row and days stay, so retention is
--      unchanged; Admin → Analytics shows them without a snapshot.
--
-- Run once. Safe to run again. Then `select upkeep_prune();`, and the schedule at the bottom if pg_cron is on.

create or replace function feedback_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.email := case when auth.uid() is null then null else auth.jwt() ->> 'email' end;
  new.created_at := now();
  new.read := false;
  if (
    select count(*) from feedback f
    where f.created_at > now() - interval '10 minutes'
      and (f.device_id = new.device_id or (new.user_id is not null and f.user_id = new.user_id))
  ) >= 3 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  if new.user_id is null and (
    select count(*) from feedback f where f.created_at > now() - interval '1 hour' and f.user_id is null
  ) >= 60 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end
$$;

create or replace function upkeep_prune(battle_days int default 30, guest_snapshot_days int default 365)
returns table (battles_deleted bigint, snapshots_cleared bigint)
language plpgsql security definer set search_path = public as $$
declare
  b bigint;
  p bigint;
begin
  delete from versus_battles x
  using versus_teams t
  where t.user_id = x.defender_id
    and x.defender_version < t.version
    and x.created_at < now() - make_interval(days => battle_days);
  get diagnostics b = row_count;
  update players
     set snapshot = null
   where user_id is null
     and snapshot is not null
     and last_day < current_date - guest_snapshot_days;
  get diagnostics p = row_count;
  return query select b, p;
end
$$;
revoke all on function upkeep_prune(int, int) from public, anon, authenticated;

-- Needs the pg_cron extension (Database → Extensions → pg_cron). Run these two lines on their own once it is on:
--
--   select cron.unschedule('pokedice-upkeep') where exists (select 1 from cron.job where jobname = 'pokedice-upkeep');
--   select cron.schedule('pokedice-upkeep', '23 4 1 * *', 'select upkeep_prune()');
