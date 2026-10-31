-- Welcome-back gifts (docs/56-WELCOME-BACK.md): a player who comes back after days away finds a message from the
-- developer carrying a gift, bigger the longer they were gone — by default ₽300 and a few items after 3 days, more after
-- 7, more again after 14 — at most once every 14 days. It is a developer's message with gifts like the admin's own
-- (0048: the same pop-up, wrapped gift, opening and My messages), written here by the server.
--
-- 1. game_config `welcomeBack`: the switch (Off / On for admin / On for everyone, Off: docs/15 §20), `cooldownDays` and
--    the tiers, inserted only if missing so seeding never clobbers the admin's. The engine has the same defaults
--    (src/engine/defaults.ts; tests/welcome-back-sql.test.ts keeps the two the same).
-- 2. welcome_back_claims: one row per player — their account (auth.uid()) or, for a guest, 'device:<id>', the keys
--    player_days uses — with the last welcome back sent: its day, the days away, the tier, its message.
-- 3. feedback_system() (0082's): a message written by a server function during a player's own call is let through as
--    the admin's is; a player's insert never is. 0082's two feedback triggers are restated unchanged, so this file
--    stands on 0048 alone.
-- 4. welcome_back_claim(device id, local day): the game asks once a day. Days away = that day − the last day the
--    server recorded the player playing before it (player_days, 0028: back the next day = 1), never the device's clock;
--    the day is checked within a day of UTC, as player_ping's. A signed-in player's days are their account's and this
--    device's from before they signed in here (0100 moves those into the account at the sign-in's ping; read both, in
--    case this call comes first), and a guest's claim moves into their account the same way (the later one kept, its
--    message with it), so a guest who signs in neither loses their history nor gets a second gift for the same return,
--    on this device or another. Nothing for a player with no earlier day, while the cooldown runs, below the
--    first tier, or with a day played after the one asked (the clock moved back). Otherwise it writes the message with
--    the highest tier's gifts and records the claim. Asked again the same day: the same answer, no second message.
--    Off (or On for admin and not the admin), or with the gifts off for the caller (a message's gift wouldn't show):
--    refused.
-- 5. configVersion + 1, so players fetch the new content.
--
-- Run after 0028, 0048 and 0082 (and 0100 where it ran; it isn't needed). Safe to run again. seed.sql doesn't inline it
-- (player_days isn't in its prelude).

begin;

-- ---------------------------------------------------------------- 1. the switch and the tiers

insert into game_config (key, value) values ('welcomeBack', '{
  "access": "off",
  "cooldownDays": 14,
  "tiers": [
    {"minDays": 3, "gifts": [
      {"kind": "gold", "amount": 300, "region": "latest"},
      {"kind": "item", "key": "great-ball", "qty": 5, "region": "latest"},
      {"kind": "item", "key": "super-potion", "qty": 3, "region": "latest"},
      {"kind": "item", "key": "rare-candy", "qty": 1, "region": "latest"}
    ]},
    {"minDays": 7, "gifts": [
      {"kind": "gold", "amount": 1000, "region": "latest"},
      {"kind": "item", "key": "ultra-ball", "qty": 5, "region": "latest"},
      {"kind": "item", "key": "hyper-potion", "qty": 3, "region": "latest"},
      {"kind": "item", "key": "revive", "qty": 2, "region": "latest"},
      {"kind": "item", "key": "rare-candy", "qty": 2, "region": "latest"}
    ]},
    {"minDays": 14, "gifts": [
      {"kind": "gold", "amount": 2500, "region": "latest"},
      {"kind": "item", "key": "ultra-ball", "qty": 10, "region": "latest"},
      {"kind": "item", "key": "max-revive", "qty": 3, "region": "latest"},
      {"kind": "item", "key": "max-ether", "qty": 2, "region": "latest"},
      {"kind": "item", "key": "rare-candy", "qty": 5, "region": "latest"}
    ]}
  ]
}'::jsonb)
on conflict (key) do nothing;

-- The admin's row over the defaults: a key the row lacks keeps its default (the tiers as a whole), as the game merges
-- it (engine/data.ts mergeConfig).
create or replace function welcome_back_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{
    "access": "off",
    "cooldownDays": 14,
    "tiers": [
      {"minDays": 3, "gifts": [
        {"kind": "gold", "amount": 300, "region": "latest"},
        {"kind": "item", "key": "great-ball", "qty": 5, "region": "latest"},
        {"kind": "item", "key": "super-potion", "qty": 3, "region": "latest"},
        {"kind": "item", "key": "rare-candy", "qty": 1, "region": "latest"}
      ]},
      {"minDays": 7, "gifts": [
        {"kind": "gold", "amount": 1000, "region": "latest"},
        {"kind": "item", "key": "ultra-ball", "qty": 5, "region": "latest"},
        {"kind": "item", "key": "hyper-potion", "qty": 3, "region": "latest"},
        {"kind": "item", "key": "revive", "qty": 2, "region": "latest"},
        {"kind": "item", "key": "rare-candy", "qty": 2, "region": "latest"}
      ]},
      {"minDays": 14, "gifts": [
        {"kind": "gold", "amount": 2500, "region": "latest"},
        {"kind": "item", "key": "ultra-ball", "qty": 10, "region": "latest"},
        {"kind": "item", "key": "max-revive", "qty": 3, "region": "latest"},
        {"kind": "item", "key": "max-ether", "qty": 2, "region": "latest"},
        {"kind": "item", "key": "rare-candy", "qty": 5, "region": "latest"}
      ]}
    ]
  }'::jsonb
    || coalesce((select value from game_config where key = 'welcomeBack' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- On for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function welcome_back_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false) from (select welcome_back_cfg() ->> 'access' a) x
$$;

-- Whole days between two welcome backs, 1–365 (14 when unset or not a number): engine/welcomeBack.ts's.
create or replace function welcome_back_cooldown()
returns int
language sql stable security definer set search_path = public as $$
  select case when jsonb_typeof(welcome_back_cfg() -> 'cooldownDays') = 'number'
    then greatest(1, least(365, round((welcome_back_cfg() ->> 'cooldownDays')::numeric)::int))
    else 14 end
$$;

-- The tiers as the server reads them: a whole number of days 1–365, each once (the first kept), and a gift list the
-- gifts' check accepts (0048); fewest days first, six at most. Anything else is left out, never the rest.
create or replace function welcome_back_tiers()
returns table (min_days int, gifts jsonb)
language sql stable security definer set search_path = public as $$
  select x.min_days, x.gifts
  from (
    select distinct on (t.min_days) t.min_days, t.gifts
    from (
      select case when e ->> 'minDays' ~ '^[0-9]{1,3}$' and jsonb_typeof(e -> 'minDays') = 'number'
               then (e ->> 'minDays')::int end as min_days,
             e -> 'gifts' as gifts, o
      from jsonb_array_elements(
        case when jsonb_typeof(welcome_back_cfg() -> 'tiers') = 'array' then welcome_back_cfg() -> 'tiers' else '[]'::jsonb end
      ) with ordinality as w(e, o)
      where jsonb_typeof(e) = 'object'
    ) t
    where t.min_days between 1 and 365 and jsonb_typeof(t.gifts) = 'array' and feedback_gifts_ok(t.gifts)
    order by t.min_days, t.o
  ) x
  order by x.min_days
  limit 6
$$;

-- ---------------------------------------------------------------- 2. the claims

-- One row per player: the last welcome back sent. Only the admin reads it (the game asks welcome_back_claim()).
create table if not exists welcome_back_claims (
  player text primary key,                    -- user id, or 'device:<id>' for guests (player_days' keys)
  day date not null,                          -- the player's own day it was sent
  days int not null check (days >= 1),        -- days away then
  min_days int not null check (min_days >= 1),-- the tier given
  feedback_id bigint references feedback(id) on delete set null,  -- the message that carries it
  claimed_at timestamptz not null default now()
);

alter table welcome_back_claims enable row level security;
revoke all on welcome_back_claims from anon, authenticated;
drop policy if exists welcome_back_claims_admin on welcome_back_claims;
create policy welcome_back_claims_admin on welcome_back_claims for all
  using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- 3. a server function's message

-- A message written by the server itself, not by a player: the league's rewards (0082, from the scheduler's own
-- session) and now a welcome back (during the player's own call, from welcome_back_claim). The function says so with
-- `pokedice.system_message`; a player can't set it, and their own inserts run as anon or authenticated, so the
-- triggers' first check (feedback_reply_stamp, which runs as the caller) never lets one of theirs through even if they
-- could. Only inside a security definer function, owned by the database, is the current role neither.
create or replace function feedback_system()
returns boolean
language sql stable as $$
  select coalesce(current_setting('pokedice.system_message', true), '') = 'on'
     and (session_user not in ('authenticator', 'anon', 'authenticated')
          or current_user not in ('authenticator', 'anon', 'authenticated'))
$$;

-- 0082's triggers, unchanged: restated so a database that took 0048 and not 0082 lets the welcome back through too.
create or replace function feedback_reply_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.from_admin and (is_admin() or feedback_system()) then
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

create or replace function feedback_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if new.from_admin and (is_admin() or feedback_system()) then
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

-- ---------------------------------------------------------------- 4. the claim

-- The game asks once a day (src/store/welcomeBack.ts), with the player's own day. Returns null, or
-- {day, days, minDays, messageId, fresh}: `fresh` when the message was written just now (the game loads its messages
-- again), false when it was today's already. The message's words are the game's, in the player's language, from the
-- numbers in `reply` (engine/welcomeBack.ts welcomeBackNote).
create or replace function welcome_back_claim(p_device_id text, p_day date)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  utc_today date := (now() at time zone 'UTC')::date;
  dev text;
  me text;
  keys text[];
  cool int;
  prev welcome_back_claims%rowtype;
  last_day date;
  away int;
  tier_days int;
  tier_gifts jsonb;
  msg bigint;
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  -- The player's day is within a day of UTC's, wherever they are (player_ping's check).
  if p_day is null or p_day < utc_today - 1 or p_day > utc_today + 1 then
    raise exception 'bad day' using errcode = '22023';
  end if;
  if not welcome_back_open() then
    raise exception 'welcome_back_off' using errcode = 'P0001';
  end if;
  -- The gift rides on a message, whose gifts are hidden while the gifts are off: no message then.
  if not gifts_open() then
    raise exception 'gifts_off' using errcode = 'P0001';
  end if;
  dev := 'device:' || p_device_id;
  me := coalesce(uid::text, dev);
  -- A signed-in player is their account and, before they signed in here, this device.
  keys := case when uid is null then array[dev] else array[uid::text, dev] end;
  -- Two tabs at once: one at a time per key, always in the same order.
  perform pg_advisory_xact_lock(hashtext('welcome_back:' || k)) from unnest(keys) k;
  cool := welcome_back_cooldown();

  -- A guest who signed in here: their last welcome back becomes their account's (the later of the two kept), as 0100's
  -- analytics_merge_player folds their days into it, so another device of the account can't send a second gift for
  -- the same return; and its message follows the account to every device.
  if uid is not null then
    select * into prev from welcome_back_claims c where c.player = dev;
    if found then
      insert into welcome_back_claims as c (player, day, days, min_days, feedback_id, claimed_at)
      values (uid::text, prev.day, prev.days, prev.min_days, prev.feedback_id, prev.claimed_at)
      on conflict (player) do update set
        day = excluded.day, days = excluded.days, min_days = excluded.min_days,
        feedback_id = excluded.feedback_id, claimed_at = excluded.claimed_at
      where excluded.day > c.day;
      delete from welcome_back_claims c where c.player = dev;
      update feedback f set user_id = uid
      where f.user_id is null and f.device_id = p_device_id and f.from_admin and f.title = 'welcome_back';
    end if;
  end if;

  select * into prev from welcome_back_claims c
  where c.player = any(keys)
  order by c.day desc, (c.player = me) desc
  limit 1;
  if found then
    -- Today's already: the same answer, never a second message.
    if prev.day = p_day then
      return jsonb_build_object('day', prev.day, 'days', prev.days, 'minDays', prev.min_days,
                                'messageId', prev.feedback_id, 'fresh', false);
    end if;
    -- The cooldown runs (or the last one is dated after today: the clock moved back).
    if p_day < prev.day + cool then
      return null;
    end if;
  end if;
  -- A day played after today: the device's clock or zone moved back, so it can't be an absence.
  if exists (select 1 from player_days d where d.player = any(keys) and d.day > p_day) then
    return null;
  end if;
  select max(d.day) into last_day from player_days d where d.player = any(keys) and d.day < p_day;
  -- A brand-new player has nothing to come back from.
  if last_day is null then
    return null;
  end if;
  away := p_day - last_day;
  select t.min_days, t.gifts into tier_days, tier_gifts
  from welcome_back_tiers() t
  where t.min_days <= away
  order by t.min_days desc
  limit 1;
  if tier_days is null then
    return null;
  end if;

  perform set_config('pokedice.system_message', 'on', true);
  insert into feedback (user_id, device_id, player_name, title, message, from_admin, reply, gifts)
  values (
    uid, p_device_id,
    (select left(p.name, 40) from players p where p.player = any(keys) and p.name is not null
     order by (p.player = me) desc limit 1),
    'welcome_back', '', true,
    '@welcome_back:' || jsonb_build_object(
      'days', away, 'minDays', tier_days, 'from', (select min(t.min_days) from welcome_back_tiers() t), 'cooldown', cool
    )::text,
    tier_gifts
  )
  returning id into msg;
  perform set_config('pokedice.system_message', '', true);

  insert into welcome_back_claims as c (player, day, days, min_days, feedback_id, claimed_at)
  values (me, p_day, away, tier_days, msg, now())
  on conflict (player) do update set
    day = excluded.day, days = excluded.days, min_days = excluded.min_days,
    feedback_id = excluded.feedback_id, claimed_at = excluded.claimed_at;
  return jsonb_build_object('day', p_day, 'days', away, 'minDays', tier_days, 'messageId', msg, 'fresh', true);
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function welcome_back_cfg() from public, anon, authenticated;
revoke all on function welcome_back_open() from public, anon, authenticated;
revoke all on function welcome_back_cooldown() from public, anon, authenticated;
revoke all on function welcome_back_tiers() from public, anon, authenticated;
revoke all on function welcome_back_claim(text, date) from public;
grant execute on function welcome_back_claim(text, date) to anon, authenticated;

-- ---------------------------------------------------------------- 5. the content version

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
