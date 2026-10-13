-- Gifts with the developer's messages (docs/15 §23): Admin → Messages (an answer) and Admin → Analytics → a player's
-- profile (a message the admin starts) can carry items, each with its quantity, Pokémon, each with its level and
-- shininess, and Pokédollars, each sent to a region the admin picks or to the player's latest one. The player sees the gift under the
-- message when it pops up; closing the message opens it.
--
-- A save is written only by its owner, so a gift is a server inbox, like raid gifts: the row holds the gifts until the
-- player's game claims them (feedback_claim_gifts, which hands each gift over once) and puts them in its own save
-- (src/engine/gifts.ts decides where each lands).
--
-- 1. game_config `gifts`: the switch (Off / On for admin / On for everyone, off by default: docs/15 §20), inserted
--    only if missing so seeding never clobbers the admin's. Off, my_feedback() shows no gift and none can be claimed;
--    the gifts wait on their rows.
-- 2. feedback: `gifts` (checked: at most 20, items 1–999, Pokémon Lv.1–100, ₽1–999,999), `gifts_claimed_at`, and
--    `from_admin` for a message the admin wrote to a player (their account, or a guest's device) rather than an
--    answer. Only the admin can set either: anything a player sends has them cleared.
-- 3. my_feedback() also returns the gifts and whether they've been opened; feedback_claim_gifts() opens them.
--
-- Run after 0025; safe to run again (run it again if it ran before Pokédollar gifts: it brings their check).

-- ---------------------------------------------------------------- 1. the switch

insert into game_config (key, value) values ('gifts', '{"access": "off"}'::jsonb)
on conflict (key) do nothing;

-- On for everyone, or for the admin only (as trade_open reads its own).
create or replace function gifts_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select (select value ->> 'access' from game_config where key = 'gifts' and jsonb_typeof(value) = 'object') as a) x
$$;

-- ---------------------------------------------------------------- 2. the columns

alter table feedback add column if not exists from_admin boolean not null default false;  -- the admin wrote first
alter table feedback add column if not exists gifts jsonb;                               -- null = no gift
alter table feedback add column if not exists gifts_claimed_at timestamptz;              -- when the player opened it

-- What a gift list may hold: 1–20 entries, each an item (its key, a quantity 1–999), a Pokémon (its number, a level
-- 1–100, shiny or not) or Pokédollars (1–999,999), each with a region (a region id, or 'latest'). Numbers must be whole and written plainly; the
-- CASE keeps every cast behind its pattern check.
create or replace function feedback_gift_int(v jsonb, lo int, hi int)
returns boolean
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' and v::text ~ '^[0-9]{1,6}$' then v::text::int between lo and hi else false end
$$;

create or replace function feedback_gifts_ok(p jsonb)
returns boolean
language sql immutable as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) between 1 and 20
    and pg_column_size(p) < 4000
    and not exists (
      select 1 from jsonb_array_elements(p) g
      where not case
        when jsonb_typeof(g) <> 'object' then false
        when coalesce(g ->> 'region', '') !~ '^[A-Za-z0-9_-]{1,40}$' then false
        when g ->> 'kind' = 'item' then
          coalesce(g ->> 'key', '') ~ '^[A-Za-z0-9_.-]{1,80}$' and feedback_gift_int(g -> 'qty', 1, 999)
        when g ->> 'kind' = 'pokemon' then
          feedback_gift_int(g -> 'dex', 1, 999999)
          and feedback_gift_int(g -> 'level', 1, 100)
          and coalesce(jsonb_typeof(g -> 'shiny'), 'boolean') = 'boolean'
        when g ->> 'kind' = 'gold' then feedback_gift_int(g -> 'amount', 1, 999999)
        else false
      end
    )
  )
$$;

alter table feedback drop constraint if exists feedback_gifts_ok;
alter table feedback add constraint feedback_gifts_ok check (feedback_gifts_ok(gifts));
-- A gift comes with words: an answer, or the admin's own message.
alter table feedback drop constraint if exists feedback_gifts_need_reply;
alter table feedback add constraint feedback_gifts_need_reply check (gifts is null or reply is not null);
alter table feedback drop constraint if exists feedback_admin_reply;
alter table feedback add constraint feedback_admin_reply check (not from_admin or reply is not null);
-- The admin's own message has no player text: the words are in `reply`.
alter table feedback drop constraint if exists feedback_message_len;
alter table feedback add constraint feedback_message_len
  check (length(message) <= 4000 and (from_admin or length(trim(message)) >= 1));

-- ---------------------------------------------------------------- the stamps
--
-- Postgres runs a table's BEFORE triggers in the order of their names: feedback_reply_stamp, then feedback_stamp.
-- Each checks is_admin() itself, so neither order nor a hand-made insert lets a player write a gift.

create or replace function feedback_reply_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.from_admin and is_admin() then
      -- The admin writes to a player first: the words are already there, shown to the player as an answer.
      new.reply := nullif(trim(new.reply), '');
      new.replied_at := now();
      new.reply_seen := false;
    else
      new.from_admin := false;
      new.reply := null;
      new.replied_at := null;
      new.reply_seen := false;
      new.gifts := null;
    end if;
    new.gifts_claimed_at := null;
    return new;
  end if;
  -- Who wrote first never changes, and a gift once opened stays as it was opened.
  new.from_admin := old.from_admin;
  if old.gifts_claimed_at is not null then
    new.gifts := old.gifts;
    new.gifts_claimed_at := old.gifts_claimed_at;
  end if;
  if new.reply is distinct from old.reply then
    new.reply := nullif(trim(new.reply), '');
    new.replied_at := case when new.reply is null then null else now() end;
    new.reply_seen := false;
    if new.reply is not null then
      new.read := true;
    end if;
  end if;
  -- A gift added or changed shows the message again.
  if new.gifts is distinct from old.gifts then
    new.reply_seen := false;
  end if;
  return new;
end
$$;

-- The sender is whoever is signed in (or nobody), the time is now, a new message is unread, and at most 3 a player per
-- 10 minutes (0019). The admin's own message keeps the player it's for (their account, or a guest's device), is read
-- already, and counts toward no player's limit.
create or replace function feedback_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if new.from_admin and is_admin() then
    if new.user_id is null and coalesce(new.device_id, '') = '' then
      raise exception 'feedback_no_player' using errcode = '22023';
    end if;
    new.read := true;
    return new;
  end if;
  new.from_admin := false;
  new.gifts := null;
  new.user_id := auth.uid();
  new.email := case when auth.uid() is null then null else auth.jwt() ->> 'email' end;
  new.read := false;
  if (
    select count(*) from feedback f
    where f.created_at > now() - interval '10 minutes'
      and not f.from_admin
      and (f.device_id = new.device_id or (new.user_id is not null and f.user_id = new.user_id))
  ) >= 3 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------- 3. the player's side

-- The caller's messages, newest first (0025), now with who wrote first and the gifts: none while the switch is off.
-- The columns changed, so the function is made again.
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
  gifts_claimed boolean
)
language sql stable security definer set search_path = public as $$
  select f.id, f.created_at, f.title, f.message, f.reply, f.replied_at, f.reply_seen, f.from_admin,
         case when gifts_open() then f.gifts end, f.gifts_claimed_at is not null
  from feedback f
  where (auth.uid() is not null and f.user_id = auth.uid())
     or (f.user_id is null and f.device_id = p_device_id)
  order by f.created_at desc
  limit 200
$$;

-- Opens the caller's gifts on these messages: each comes back once, with what it holds, and is marked opened in the
-- same update, so two tabs can't both get it. The game puts them in its save.
create or replace function feedback_claim_gifts(p_ids bigint[], p_device_id text)
returns table (id bigint, gifts jsonb)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not gifts_open() then
    raise exception 'gifts_off' using errcode = 'P0001';
  end if;
  return query
    update feedback f
    set gifts_claimed_at = now()
    where f.id = any(p_ids)
      and f.gifts is not null
      and f.gifts_claimed_at is null
      and (
        (auth.uid() is not null and f.user_id = auth.uid())
        or (f.user_id is null and f.device_id = p_device_id)
      )
    returning f.id, f.gifts;
end
$$;

revoke all on function my_feedback(text) from public;
revoke all on function feedback_claim_gifts(bigint[], text) from public;
revoke all on function gifts_open() from public;
grant execute on function my_feedback(text) to anon, authenticated;
grant execute on function feedback_claim_gifts(bigint[], text) to anon, authenticated;
grant execute on function gifts_open() to anon, authenticated;
