-- Players online (docs/70-PLAYERS-ONLINE.md): how many players have the game open right now, at the foot of the side
-- menu above SYNC ONLINE.
--
-- 1. game_config `playersOnline`: the switch, Off (left alone when there).
-- 2. online_here: one row per player (the account, else the guest's device) and when their game last said it was
--    open. UNLOGGED: a count that is gone in a minute isn't worth the write-ahead log, and a crash emptying it costs
--    five minutes of a smaller number.
-- 3. online_ping(device id): the game calls it every 5 minutes while its tab is visible (and on opening the menu, at
--    most once a minute) unless the switch is Off. It stamps the caller and returns how many players stamped in the
--    last 6 minutes, or null when the switch is closed to the caller. On for admin, every game stamps (so the admin
--    sees the real number) but only the admin gets it; Off, nothing is written (an old build or a hand-made call).
--
-- Run after 0131 (access_open). Safe to run again. supabase/seed.sql doesn't inline it (0131 isn't in its prelude).

begin;

-- ---------------------------------------------------------------- 1. the switch

insert into game_config (key, value) values ('playersOnline', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

create or replace function players_online_access()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select value ->> 'access' from game_config where key = 'playersOnline'), 'off')
$$;

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
  sw text := players_online_access();
begin
  if sw not in ('admin', 'beta', 'all') then return null; end if;
  -- A device id is the game's own (a UUID); anything longer is a hand-made call, counted as nobody.
  if me is not null and length(me) <= 80 then
    insert into online_here (who, at) values (me, now()) on conflict (who) do update set at = excluded.at;
  end if;
  -- The ones gone a while, now and then rather than on every call (a few hundred rows at most either way).
  if random() < 0.05 then delete from online_here h where h.at < now() - interval '1 hour'; end if;
  if not access_open(sw) then return null; end if;
  return (select count(*)::int from online_here h where h.at > now() - interval '6 minutes');
end
$$;

revoke all on function players_online_access() from public, anon, authenticated;
revoke all on function online_ping(text) from public;
grant execute on function online_ping(text) to anon, authenticated;

-- configVersion + 1, so players fetch the new switch.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
