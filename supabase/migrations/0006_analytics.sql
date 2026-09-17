-- v1.10 player analytics. Any player (signed in or not) may append their own events; only the admin can read them.
create table if not exists analytics_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,  -- null = playing without an account
  device_id text not null,                                     -- random id kept in the browser
  player_name text,                                            -- the in-game trainer name
  email text,                                                  -- signed-in players only
  kind text not null check (kind in (
    'login', 'game_started', 'level_up', 'evolved', 'area_unlocked', 'badge', 'item_bought', 'item_used', 'upgrade'
  )),
  params jsonb not null default '{}',
  constraint analytics_params_small check (pg_column_size(params) < 4000),
  constraint analytics_device_id_small check (length(device_id) <= 64),
  constraint analytics_created_at_sane check (created_at < now() + interval '1 day')
);

create index if not exists analytics_events_created_at on analytics_events (created_at desc);
create index if not exists analytics_events_player on analytics_events (coalesce(user_id::text, device_id));

alter table analytics_events enable row level security;
drop policy if exists analytics_insert on analytics_events;
drop policy if exists analytics_read on analytics_events;
drop policy if exists analytics_delete on analytics_events;
create policy analytics_insert on analytics_events for insert
  with check (user_id is null or user_id = auth.uid());
create policy analytics_read on analytics_events for select using (is_admin());
create policy analytics_delete on analytics_events for delete using (is_admin());

grant insert on analytics_events to anon, authenticated;
grant select, delete on analytics_events to authenticated;
grant usage on sequence analytics_events_id_seq to anon, authenticated;
