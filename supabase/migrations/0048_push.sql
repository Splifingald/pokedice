-- Push notifications (docs/25-PUSH-NOTIFICATIONS.md): a Day Care Egg, the day's raid, a live event starting, sent to a
-- player's phone or computer while the game is closed. The game works out its own player's next notices from the save
-- (src/engine/notify.ts) and hands them here with their words and picture; a scheduled sender (netlify/functions/
-- push-send.mts) asks for the ones that are due and delivers them through each browser's push service.
--
-- 1. game_config `push`: the switch (Off / On for admin / On for everyone, off by default: docs/15 §20), inserted only
--    if missing so seeding never clobbers the admin's. Off: no subscription is taken, nothing is scheduled or sent.
-- 2. push_subscriptions: one row per browser that said yes (its endpoint and keys, the topics it wants, its language
--    and platform). The owner is the signed-in player ('u:<id>') or, for a guest, their device ('d:<id>').
-- 3. push_notices: what each owner is to be told, and when. push_schedule replaces the owner's unsent list with the
--    game's latest; a notice already sent is never sent again under the same key.
-- 4. push_due / push_report: the sender's two calls (service role only). push_due claims the notices that are due and
--    returns one row per subscription that wants it; push_report drops the subscriptions the push service says are gone.
-- 5. push_stats: the admin's counts. delete_my_data: a player's subscriptions and notices go with the rest.
--
-- Players reach the tables only through the functions below. Run after 0047; safe to run again.

-- ---------------------------------------------------------------- 1. the switch

-- The game's defaults (engine/defaults.ts; tests/push-sql.test.ts keeps the two the same).
insert into game_config (key, value) values ('push', '{"access": "off", "raidHour": 9, "quietHours": [22, 8]}'::jsonb)
on conflict (key) do nothing;

create or replace function push_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{"access": "off"}'::jsonb
         || coalesce((select value from game_config where key = 'push' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- On for everyone, or for the admin only (as trade_open reads its own).
create or replace function push_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(push_cfg() ->> 'access', 'off') = 'all' or (push_cfg() ->> 'access' = 'admin' and is_admin())
$$;

-- ---------------------------------------------------------------- 2–3. the tables

create table if not exists push_subscriptions (
  endpoint text primary key,
  owner text not null,
  p256dh text not null,
  auth text not null,
  platform text not null default 'other',
  lang text not null default 'en',
  topics text[] not null default '{egg,raid,live}',
  -- Subscribed by the admin: the only ones served while the switch is On for admin.
  admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_owner on push_subscriptions (owner);
alter table push_subscriptions enable row level security;

create table if not exists push_notices (
  id bigserial primary key,
  owner text not null,
  key text not null,
  topic text not null,
  due_at timestamptz not null,
  -- What the service worker shows (public/sw.js): title, body, tag, url, its picture.
  payload jsonb not null,
  sent_at timestamptz,
  unique (owner, key)
);
create index if not exists push_notices_due on push_notices (due_at) where sent_at is null;
alter table push_notices enable row level security;

-- The sender's last run, for the admin (is it running at all?).
create table if not exists push_runs (
  id boolean primary key default true check (id),
  ran_at timestamptz not null,
  sent int not null default 0,
  gone int not null default 0
);
alter table push_runs enable row level security;

-- ---------------------------------------------------------------- the player's calls

-- Who is asking: the signed-in player, else the guest's device id (src/lib/device.ts).
create or replace function push_owner(p_device text)
returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    return 'u:' || auth.uid()::text;
  end if;
  if coalesce(p_device, '') = '' then
    raise exception 'push_no_owner' using errcode = '22023';
  end if;
  return 'd:' || left(p_device, 64);
end
$$;

create or replace function push_clean_topics(p_topics text[])
returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct t order by t), '{}') from unnest(coalesce(p_topics, '{}')) t where t in ('egg', 'raid', 'live')
$$;

-- This browser says yes (or says it again: a new language, other topics, a guest who signed in). A browser is one
-- endpoint; an owner keeps at most 10 (the oldest go).
create or replace function push_subscribe(
  p_device text, p_endpoint text, p_p256dh text, p_auth text, p_platform text, p_lang text, p_topics text[]
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me text := push_owner(p_device);
begin
  if not push_open() then
    raise exception 'push_off' using errcode = 'P0001';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1024 or length(coalesce(p_p256dh, '')) not between 40 and 200
     or length(coalesce(p_auth, '')) not between 10 and 100 then
    raise exception 'push_bad_subscription' using errcode = '22023';
  end if;
  insert into push_subscriptions (endpoint, owner, p256dh, auth, platform, lang, topics, admin)
  values (p_endpoint, me, p_p256dh, p_auth, left(coalesce(p_platform, 'other'), 32), left(coalesce(p_lang, 'en'), 12),
          push_clean_topics(p_topics), is_admin())
  on conflict (endpoint) do update set
    owner = excluded.owner, p256dh = excluded.p256dh, auth = excluded.auth, platform = excluded.platform,
    lang = excluded.lang, topics = excluded.topics, admin = excluded.admin, updated_at = now();
  delete from push_subscriptions where endpoint in (
    select endpoint from push_subscriptions where owner = me order by updated_at desc offset 10
  );
end
$$;

-- This browser says no more. Knowing the endpoint is enough: it is the browser's own secret.
create or replace function push_unsubscribe(p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint
$$;

-- The game's latest notices for its player (at most 16, each due within 30 days, its payload under 3 KB): the owner's
-- unsent ones are replaced by these. Only through one of the owner's own subscriptions. Returns how many are waiting.
create or replace function push_schedule(p_device text, p_endpoint text, p_notices jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  me text := push_owner(p_device);
  n jsonb;
  keys text[] := '{}';
  due timestamptz;
begin
  if not push_open() then
    raise exception 'push_off' using errcode = 'P0001';
  end if;
  if not exists (select 1 from push_subscriptions where endpoint = p_endpoint and owner = me) then
    raise exception 'push_not_subscribed' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_notices) <> 'array' or jsonb_array_length(p_notices) > 16 then
    raise exception 'push_bad_notices' using errcode = '22023';
  end if;
  for n in select * from jsonb_array_elements(p_notices) loop
    due := (n ->> 'at')::timestamptz;
    if length(coalesce(n ->> 'key', '')) not between 1 and 80 or coalesce(n ->> 'topic', '') not in ('egg', 'raid', 'live')
       or due is null or due > now() + interval '30 days' or jsonb_typeof(n -> 'payload') <> 'object'
       or octet_length((n -> 'payload')::text) > 3000 then
      raise exception 'push_bad_notices' using errcode = '22023';
    end if;
    keys := keys || (n ->> 'key');
    insert into push_notices (owner, key, topic, due_at, payload)
    values (me, n ->> 'key', n ->> 'topic', due, n -> 'payload')
    on conflict (owner, key) do update set topic = excluded.topic, due_at = excluded.due_at, payload = excluded.payload
      where push_notices.sent_at is null;
  end loop;
  delete from push_notices where owner = me and sent_at is null and not (key = any (keys));
  -- Sent ones are kept a week, so the same key isn't sent twice; then they go.
  delete from push_notices where owner = me and sent_at < now() - interval '7 days';
  return (select count(*) from push_notices where owner = me and sent_at is null);
end
$$;

-- ---------------------------------------------------------------- 4. the sender's calls

-- The notices due now, claimed (marked sent) so two runs never send one twice, one row per subscription that wants its
-- topic. Nothing while the switch is off; only the admin's subscriptions while it is On for admin. A notice over six
-- hours late (the sender wasn't running) is dropped: old news.
create or replace function push_due(p_limit int default 500)
returns table (notice bigint, endpoint text, p256dh text, auth text, payload jsonb)
language plpgsql security definer set search_path = public as $$
declare
  access text := coalesce(push_cfg() ->> 'access', 'off');
begin
  delete from push_notices n where n.sent_at is null and n.due_at < now() - interval '6 hours';
  if access not in ('all', 'admin') then
    return;
  end if;
  return query
    with claimed as (
      update push_notices n set sent_at = now()
      where n.id in (
        select d.id from push_notices d where d.sent_at is null and d.due_at <= now()
        order by d.due_at limit greatest(1, least(coalesce(p_limit, 500), 2000))
        for update skip locked
      )
      returning n.id, n.owner, n.topic, n.payload
    )
    select c.id, s.endpoint, s.p256dh, s.auth, c.payload
    from claimed c
    join push_subscriptions s on s.owner = c.owner and c.topic = any (s.topics)
    where access = 'all' or s.admin;
end
$$;

-- What the push services said: `p_gone` endpoints no longer exist (404/410), `p_ok` took their notice.
create or replace function push_report(p_ok text[], p_gone text[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from push_subscriptions where endpoint = any (coalesce(p_gone, '{}'));
  update push_subscriptions set last_sent_at = now() where endpoint = any (coalesce(p_ok, '{}'));
  insert into push_runs (id, ran_at, sent, gone)
  values (true, now(), coalesce(cardinality(p_ok), 0), coalesce(cardinality(p_gone), 0))
  on conflict (id) do update set ran_at = excluded.ran_at, sent = excluded.sent, gone = excluded.gone;
end
$$;

-- ---------------------------------------------------------------- 5. the admin's counts, and deleting your data

create or replace function push_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'subscriptions', (select count(*) from push_subscriptions),
    'players', (select count(distinct owner) from push_subscriptions),
    'platforms', coalesce((select jsonb_object_agg(platform, n) from (
      select platform, count(*) n from push_subscriptions group by platform) p), '{}'::jsonb),
    'topics', coalesce((select jsonb_object_agg(t, n) from (
      select t, count(*) n from push_subscriptions, unnest(topics) t group by t) p), '{}'::jsonb),
    'waiting', (select count(*) from push_notices where sent_at is null),
    'lastRun', (select ran_at from push_runs),
    'lastSent', (select sent from push_runs)
  );
end
$$;

-- 0046's delete_my_data (0044, 0045 and 0046 each redefine it, and run in either order on live), and push: the player's
-- subscriptions and notices go.
create or replace function delete_my_data(p_realm text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if p_realm is not null and p_realm not in ('main', 'extreme') then
    raise exception 'bad_realm' using errcode = '22023';
  end if;
  delete from saves where user_id = me and (p_realm is null or realm = p_realm);
  delete from player_cards where user_id = me and (p_realm is null or realm = p_realm); -- and their regions
  delete from versus_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from versus_battles where (attacker_id = me or defender_id = me) and (p_realm is null or realm = p_realm);
  delete from event_state where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_gifts where (helper_id = me or raider_id = me) and (p_realm is null or realm = p_realm);
  if to_regclass('public.raid_progress_teams') is not null then
    delete from raid_progress_teams where user_id = me and (p_realm is null or realm = p_realm);
    delete from raid_progress_done where user_id = me and (p_realm is null or realm = p_realm);
  end if;
  -- Trades (0044): your open listings go; trades still owed to the other player stay for them, without your name.
  if to_regclass('public.trade_listings') is not null and (p_realm is null or p_realm = 'main') then
    delete from trade_listings where owner = me and (status = 'open' or taker is null or taker_applied);
    delete from trade_listings where taker = me and owner_applied;
    update trade_listings set owner = null, owner_name = null, owner_applied = true where owner = me;
    update trade_listings set taker = null, taker_name = null, taker_applied = true where taker = me;
  end if;
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_attempts where actor = me::text;
    delete from push_subscriptions where owner = 'u:' || me::text;
    delete from push_notices where owner = 'u:' || me::text;
  end if;
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function push_cfg(), push_open(), push_owner(text), push_due(int), push_report(text[], text[])
  from public, anon, authenticated;
revoke all on function push_subscribe(text, text, text, text, text, text, text[]), push_unsubscribe(text),
  push_schedule(text, text, jsonb), push_stats(), delete_my_data(text) from public, anon;
grant execute on function push_subscribe(text, text, text, text, text, text, text[]), push_unsubscribe(text),
  push_schedule(text, text, jsonb) to anon, authenticated;
grant execute on function push_stats(), delete_my_data(text) to authenticated;
-- The sender signs in with the service role key (Supabase has the role; a bare Postgres in the tests may not).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function push_due(int), push_report(text[], text[]) to service_role;
  end if;
end $$;
