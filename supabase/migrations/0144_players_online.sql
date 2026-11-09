-- Players online (docs/70-PLAYERS-ONLINE.md): how many players have the game open right now, at the foot of the side
-- menu above SYNC ONLINE.
--
-- 1. No switch, on for everyone (the user's call, 2026-11-09: an exception to docs/15 §20). The first version of this
--    file had one: its game_config row and players_online_access() go.
-- 2. online_here: one row per player (the account, else the guest's device) and when their game last said it was
--    open. UNLOGGED: a count that is gone in a minute isn't worth the write-ahead log, and a crash emptying it costs
--    a few minutes of a smaller number.
-- 3. online_ping(device id): the game calls it every 5 minutes while its tab is visible (and on opening the menu, at
--    most once a minute). It stamps the caller and returns how many players stamped in the last 6 minutes.
--
-- Run after 0001. Safe to run again. supabase/seed.sql doesn't inline it.

begin;

-- ---------------------------------------------------------------- 1. no switch

delete from game_config where key = 'playersOnline';
drop function if exists players_online_access();

-- ---------------------------------------------------------------- 2. the table

create unlogged table if not exists online_here (
  who text primary key,                -- the account's id, else 'device:' and the guest's device id
  at timestamptz not null default now()
);

alter table online_here enable row level security;
revoke all on online_here from anon, authenticated;
drop policy if exists online_here_admin on online_here;
create policy online_here_admin on online_here for all using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- 3. what the game calls

create or replace function online_ping(p_device_id text)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me text := coalesce(auth.uid()::text, 'device:' || nullif(trim(p_device_id), ''));
begin
  -- A device id is the game's own (a UUID); anything longer is a hand-made call, counted as nobody.
  if me is not null and length(me) <= 80 then
    insert into online_here (who, at) values (me, now()) on conflict (who) do update set at = excluded.at;
  end if;
  -- The ones gone a while, now and then rather than on every call (a few hundred rows at most either way).
  if random() < 0.05 then delete from online_here h where h.at < now() - interval '1 hour'; end if;
  return (select count(*)::int from online_here h where h.at > now() - interval '6 minutes');
end
$$;

revoke all on function online_ping(text) from public;
grant execute on function online_ping(text) to anon, authenticated;

commit;
