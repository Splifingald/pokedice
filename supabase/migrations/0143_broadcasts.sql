-- Global messages (docs/69-GLOBAL-MESSAGES.md): the developer writes one message — a title, words (links and YouTube
-- videos: the game draws them) and, if they like, gifts — for every player, or only those holding so many badges,
-- every region's together. Each player it reaches gets their own copy: a developer's message like the admin's own
-- (0048: the gift under it, its opening, My messages), written by the server, which the game pops up on Home.
--
-- 1. game_config `broadcasts`: the switch (Off / On for admin / On for everyone, Off: docs/15 §20), inserted only if
--    missing so seeding never clobbers the admin's; broadcasts_open().
-- 2. broadcasts: the messages, written in Admin › Messages (admin-only, as everything here but the claim): title,
--    body, the badge range (min_badges, max_badges or none), gifts (0048's check; no Heart Scales: a guest has no
--    wallet, 0121), active (a stopped message reaches no one new; its copies stay).
-- 3. feedback.broadcast_id: a player's copy of one; deleting the message deletes its copies. One copy per account
--    (a unique index), one per guest device (the claim's lock).
-- 4. broadcast_claim(device id, badges): the game asks with the badges it holds (every region's, the main save's).
--    A signed-in player is counted on their trainer card's badges when the server has it (0033: what trades read),
--    else on the game's word, as a guest is. It writes the caller's copy of every active message whose range takes that
--    count and that they don't have yet, and returns how many it wrote. A guest's copies on this device follow them
--    into their account the first time they ask signed in (one already in the account wins), as a welcome back does
--    (0103), so another device of theirs never gets a second one. Off (or On for admin and not the admin): refused.
-- 5. my_feedback() also says which messages are global ones (`broadcast`): the game pops those up on Home.
-- 6. broadcast_stats(): for the admin, each message's copies, how many were seen, how many gifts opened.
-- 7. configVersion + 1, so players fetch the new content.
--
-- Run after 0048 and 0103 (its feedback_system()), 0121 and 0033 / 0039 where they ran. Safe to run again.
-- supabase/seed.sql doesn't inline it (feedback isn't in its prelude).

begin;

-- ---------------------------------------------------------------- 1. the switch

insert into game_config (key, value) values ('broadcasts', '{"access": "off"}'::jsonb)
on conflict (key) do nothing;

-- On for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function broadcasts_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select (select value ->> 'access' from game_config where key = 'broadcasts' and jsonb_typeof(value) = 'object') as a) x
$$;

-- ---------------------------------------------------------------- 2. the messages

-- A message's gifts: what a message may carry (0048), but no Heart Scales (a guest has no wallet: 0121).
create or replace function broadcast_gifts_ok(p jsonb)
returns boolean
language sql immutable as $$
  select p is null or (
    feedback_gifts_ok(p)
    and not exists (select 1 from jsonb_array_elements(p) g where g ->> 'kind' = 'heartScales')
  )
$$;

create table if not exists broadcasts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  title text not null,
  body text not null,                        -- the words; addresses and YouTube links are drawn by the game
  min_badges int not null default 0,         -- at least this many badges, every region's together
  max_badges int,                            -- at most this many; null = no top
  gifts jsonb,                               -- null = no gift
  active boolean not null default true,      -- false: stopped, reaches no one new
  constraint broadcasts_title_len check (length(trim(title)) between 1 and 120),
  constraint broadcasts_body_len check (length(trim(body)) between 1 and 4000),
  constraint broadcasts_badges check (
    min_badges between 0 and 999 and (max_badges is null or max_badges between min_badges and 999)
  ),
  constraint broadcasts_gifts_ok check (broadcast_gifts_ok(gifts))
);

alter table broadcasts enable row level security;
revoke all on broadcasts from anon, authenticated;
grant select, insert, update, delete on broadcasts to authenticated;
grant usage, select on sequence broadcasts_id_seq to authenticated;
drop policy if exists broadcasts_admin on broadcasts;
create policy broadcasts_admin on broadcasts for all
  using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- 3. the copies

alter table feedback add column if not exists broadcast_id bigint references broadcasts(id) on delete cascade;
create index if not exists feedback_broadcast on feedback (broadcast_id) where broadcast_id is not null;
create unique index if not exists feedback_broadcast_account on feedback (broadcast_id, user_id)
  where broadcast_id is not null and user_id is not null;

-- Only the claim (or the admin) writes a copy: a player's own message never carries one, and none changes which
-- message it copies. Runs as the caller, as feedback_reply_stamp does, so a player's insert is never the server's.
create or replace function feedback_broadcast_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not (is_admin() or feedback_system()) then
      new.broadcast_id := null;
    end if;
  else
    new.broadcast_id := old.broadcast_id;
  end if;
  return new;
end
$$;

drop trigger if exists feedback_broadcast_stamp on feedback;
create trigger feedback_broadcast_stamp before insert or update on feedback
  for each row execute function feedback_broadcast_stamp();

-- ---------------------------------------------------------------- 4. the claim

-- The game asks with the badges the player holds (src/store/broadcasts.ts). Returns how many copies it just wrote
-- (the game loads its messages again when it's more than none).
create or replace function broadcast_claim(p_device_id text, p_badges int)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  dev text;
  n int;
  card int;
  sent int := 0;
  b broadcasts%rowtype;
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  if not broadcasts_open() then
    raise exception 'broadcasts_off' using errcode = 'P0001';
  end if;
  dev := 'device:' || p_device_id;
  -- Two tabs at once: one at a time per key (the account's, then the device's), always in the same order.
  perform pg_advisory_xact_lock(hashtext('broadcast:' || k))
  from unnest(case when uid is null then array[dev] else array[uid::text, dev] end) k;

  if uid is not null then
    -- A guest who signed in here: their copies become their account's, unless the account has that one already.
    delete from feedback f
    where f.user_id is null and f.device_id = p_device_id and f.broadcast_id is not null
      and exists (select 1 from feedback a where a.user_id = uid and a.broadcast_id = f.broadcast_id);
    update feedback f set user_id = uid
    where f.user_id is null and f.device_id = p_device_id and f.broadcast_id is not null;
    -- Their trainer card's badges, when the server has it (the main save's, every region's).
    if to_regclass('public.player_card_regions') is not null then
      execute 'select sum(cardinality(r.badges))::int from player_card_regions r where r.user_id = $1 and r.realm = ''main'''
        into card using uid;
    end if;
  end if;
  n := coalesce(card, greatest(0, least(coalesce(p_badges, 0), 999)));

  perform set_config('pokedice.system_message', 'on', true);
  for b in
    select * from broadcasts x
    where x.active
      and x.min_badges <= n and (x.max_badges is null or n <= x.max_badges)
      and not exists (
        select 1 from feedback f
        where f.broadcast_id = x.id
          and (case when uid is null then f.user_id is null and f.device_id = p_device_id else f.user_id = uid end)
      )
    order by x.id
  loop
    insert into feedback (user_id, device_id, title, message, from_admin, reply, gifts, broadcast_id)
    values (uid, p_device_id, b.title, '', true, b.body, b.gifts, b.id);
    sent := sent + 1;
  end loop;
  perform set_config('pokedice.system_message', '', true);
  return sent;
end
$$;

-- ---------------------------------------------------------------- 5. the player's messages

-- 0048's, and whether each is a global message. The columns changed, so the function is made again.
drop function if exists my_feedback(text);
create function my_feedback(p_device_id text)
returns table (
  id bigint,
  created_at timestamptz,
  title text,
  message text,
  reply text,
  replied_at timestamptz,
  reply_seen boolean,
  from_admin boolean,
  gifts jsonb,
  gifts_claimed boolean,
  broadcast boolean
)
language sql stable security definer set search_path = public as $$
  select f.id, f.created_at, f.title, f.message, f.reply, f.replied_at, f.reply_seen, f.from_admin,
         case when gifts_open() then f.gifts end, f.gifts_claimed_at is not null, f.broadcast_id is not null
  from feedback f
  where (auth.uid() is not null and f.user_id = auth.uid())
     or (f.user_id is null and f.device_id = p_device_id)
  order by f.created_at desc
  limit 200
$$;

-- ---------------------------------------------------------------- 6. the admin's numbers

-- Each message's copies: written, seen (the pop-up closed or My messages opened), gifts opened. The admin only.
create or replace function broadcast_stats()
returns table (id bigint, sent bigint, seen bigint, opened bigint)
language sql stable security definer set search_path = public as $$
  select f.broadcast_id, count(*), count(*) filter (where f.reply_seen),
         count(*) filter (where f.gifts_claimed_at is not null)
  from feedback f
  where f.broadcast_id is not null and is_admin()
  group by f.broadcast_id
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function broadcasts_open() from public, anon, authenticated;
revoke all on function broadcast_claim(text, int) from public;
grant execute on function broadcast_claim(text, int) to anon, authenticated;
revoke all on function my_feedback(text) from public;
grant execute on function my_feedback(text) to anon, authenticated;
revoke all on function broadcast_stats() from public, anon;
grant execute on function broadcast_stats() to authenticated;

-- ---------------------------------------------------------------- 7. the content version

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
