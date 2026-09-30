-- Player messages to the developer (side menu → Contact the developer). Anyone may send one; only the admin can
-- read them (Admin → Messages). Who sent it is filled in here, not trusted from the browser.
create table if not exists feedback (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,  -- null = playing without an account
  email text,                                                  -- signed-in players only, from their login
  device_id text not null,                                     -- the analytics device id kept in the browser
  player_name text,                                            -- the in-game trainer name
  title text not null,
  message text not null,
  context jsonb not null default '{}',                         -- language, area, screen size, browser
  read boolean not null default false,
  constraint feedback_title_len check (length(trim(title)) between 1 and 120),
  constraint feedback_message_len check (length(trim(message)) between 1 and 4000),
  constraint feedback_device_id_small check (length(device_id) <= 64),
  constraint feedback_player_name_small check (length(player_name) <= 40),
  constraint feedback_context_small check (pg_column_size(context) < 2000)
);

create index if not exists feedback_created_at on feedback (created_at desc);

-- The sender is whoever is signed in (or nobody), the time is now, and a new message is unread. At most 3 messages per
-- player per 10 minutes, so a stuck button or a flood can't fill the inbox.
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
  return new;
end
$$;

drop trigger if exists feedback_stamp on feedback;
create trigger feedback_stamp before insert on feedback for each row execute function feedback_stamp();

alter table feedback enable row level security;
drop policy if exists feedback_insert on feedback;
drop policy if exists feedback_admin on feedback;
create policy feedback_insert on feedback for insert with check (true);
create policy feedback_admin on feedback for all using (is_admin()) with check (is_admin());

grant insert on feedback to anon, authenticated;
grant select, update, delete on feedback to authenticated;
grant usage on sequence feedback_id_seq to anon, authenticated;
