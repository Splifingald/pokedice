-- Admin → "Reload all players": every open game reloads at its next safe moment (never mid-fight), for a fix that
-- can't wait for the tabs' own hourly version check (src/store/sync.ts).
--
-- 1. app_signals: one row, 'reload', holding when the last reload was asked for. Anyone can read it: a tab that was
--    offline or in the background when the request went out reads it when it reconnects, and reloads if it is older.
-- 2. force_reload(): admin only. Stamps that row and broadcasts it on the private Realtime channel 'app', which every
--    open game listens to.
-- 3. Realtime: everyone may listen on 'app'; nobody may send on it from a browser. Only the database (force_reload)
--    does, so a player can't make everyone reload.
--
-- Run once. Safe to run again.

create table if not exists app_signals (
  id text primary key,
  at timestamptz not null default now()
);

alter table app_signals enable row level security;
revoke all on app_signals from anon, authenticated;
grant select on app_signals to anon, authenticated;
drop policy if exists app_signals_read on app_signals;
create policy app_signals_read on app_signals for select using (true);

create or replace function force_reload()
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := now();
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into app_signals (id, at) values ('reload', t)
  on conflict (id) do update set at = excluded.at;
  -- Open tabs hear it at once. Without Realtime, they still pick up the row above when they reconnect.
  begin
    perform realtime.send(jsonb_build_object('at', t), 'reload', 'app', true);
  exception when others then
    raise warning 'force_reload: realtime.send failed: %', sqlerrm;
  end;
  return t;
end
$$;
revoke all on function force_reload() from public;
grant execute on function force_reload() to authenticated;

-- Listening on the private channel 'app' (guests included). No insert policy: browsers can't broadcast on it.
drop policy if exists app_channel_listen on realtime.messages;
create policy app_channel_listen on realtime.messages for select to anon, authenticated
  using ((select realtime.topic()) = 'app' and extension = 'broadcast');
