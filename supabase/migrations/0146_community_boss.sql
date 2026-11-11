-- The Community Boss (docs/71 §4): a live event of type `boss`. A huge boss that never hits back, its HP in coloured
-- gauges; every player places up to 3 of their Pokémon on it, and they hit in turn, one every 3 seconds (so each slot
-- every 9 s), for its level × its type affinity against the boss, all the time, the game closed or not. The damage is
-- the server's alone: worked out from when each Pokémon was placed, never written per hit, never sent by the game.
-- Each gauge the community breaks earns its reward, sent to every participant as a developer's message when it ends.
-- No switch of its own (the user's call, 2026-11-11): scheduling one is turning it on; the live events' own switch
-- still covers it.
--
-- 1. boss_event(id): the event as the admin scheduled it (game_config `liveEvents`), when it's a Community Boss.
-- 2. boss_affinity(dex, boss): the Pokémon's best type against the boss's types, on the type chart (0001), an
--    immunity counting ×¼; the hit is level × it, at least 1.
-- 3. boss_slots: each placement (event, player, slot 0–2, the Pokémon, its hit, placed and taken back). Only the
--    functions write it; a player reads nothing directly.
-- 4. boss_place / boss_take_back: the player's (signed in). Refused outside the event's dates, for a level above their
--    trainer card's best (0033) or the game's cap, for a Pokémon the game doesn't have.
-- 5. boss_state(id): the community's numbers from a cache rebuilt at most once a minute (as the Versus board's, 0139:
--    a thousand players opening the page cost one sum a minute), the caller's own, and the arena's field: up to 20
--    placed Pokémon, the caller's first, then their friends' (0033), then others drawn at random.
-- 6. boss_settle(id) / boss_settle_due(): after the end, once: the gauges broken, and each participant's message with
--    their rewards (as a global message's copy, 0143). The admin's or the service role's (the scheduled function,
--    netlify/functions/community-boss.mts, every 5 minutes).
--
-- Run after 0001, 0019 / 0025 / 0048 / 0103 (the messages), 0033 (cards and friends). Safe to run again.

begin;

-- ---------------------------------------------------------------- 1. the event

-- The live events' own switch, read here so this file needs nothing newer (0131's access_open).
create or replace function boss_live_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select (select value ->> 'access' from game_config where key = 'liveEvents' and jsonb_typeof(value) = 'object') as a) x
$$;

-- The Community Boss with this id, as scheduled (null when there's none). It runs once, between `start` and `end`.
create or replace function boss_event(p_id text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select e
  from game_config g, jsonb_array_elements(case when jsonb_typeof(g.value -> 'list') = 'array' then g.value -> 'list' else '[]'::jsonb end) e
  where g.key = 'liveEvents' and e ->> 'id' = p_id and e ->> 'type' = 'boss'
    and jsonb_typeof(e -> 'boss') = 'object'
  limit 1
$$;

create or replace function boss_start(e jsonb) returns timestamptz language sql immutable as $$
  select (e ->> 'start')::timestamptz $$;
create or replace function boss_end(e jsonb) returns timestamptz language sql immutable as $$
  select (e ->> 'end')::timestamptz $$;

-- ---------------------------------------------------------------- 2. the hit

-- The best of the Pokémon's types against the boss's, as the game reads the chart (engine/typechart.ts): both types
-- multiplied, kept between ×½ and ×2; an immunity, which the game leaves at 0, counts ×¼ here so no Pokémon is useless.
create or replace function boss_affinity(p_dex int, p_boss int)
returns numeric
language sql stable security definer set search_path = public as $$
  select case when best is null then 1 when best = 0 then 0.25 else best end
  from (
    select max(
      case when m = 0 then 0 else least(2, greatest(0.5, m)) end
    )::numeric as best
    from (
      select coalesce((select c.multiplier from type_chart c where c.attacking = a.t and c.defending = b.type1), 1)
           * coalesce((select c.multiplier from type_chart c where c.attacking = a.t and c.defending = b.type2), 1) as m
      from (select unnest(array[p.type1, p.type2]) t from pokemon p where p.dex = p_dex) a,
           (select q.type1, q.type2 from pokemon q where q.dex = p_boss) b
      where a.t is not null
    ) y
  ) x
$$;

-- ---------------------------------------------------------------- 3. the placements

create table if not exists boss_slots (
  id bigserial primary key,
  event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null,
  inst_id text not null,
  dex int not null,
  level int not null,
  shiny boolean not null default false,
  hit int not null,                 -- level × affinity, at least 1: what each of its hits takes off
  affinity numeric not null,
  placed_at timestamptz not null default now(),
  removed_at timestamptz,           -- null while it's still hitting
  constraint boss_slots_slot check (slot between 0 and 2),
  constraint boss_slots_level check (level between 1 and 100),
  constraint boss_slots_inst check (length(inst_id) between 1 and 80)
);
create index if not exists boss_slots_event on boss_slots (event_id);
create index if not exists boss_slots_user on boss_slots (event_id, user_id);
-- One Pokémon hitting per slot at a time.
create unique index if not exists boss_slots_open on boss_slots (event_id, user_id, slot) where removed_at is null;

alter table boss_slots enable row level security;
revoke all on boss_slots from anon, authenticated;

-- A placement's damage up to `t`: one hit every 9 s from its placing, until it was taken back or the event ended.
create or replace function boss_dealt(s boss_slots, p_end timestamptz, t timestamptz)
returns bigint
language sql immutable as $$
  select greatest(0, floor(extract(epoch from (least(coalesce(s.removed_at, 'infinity'::timestamptz), p_end, t) - s.placed_at)) / 9))::bigint
         * s.hit
$$;

-- ---------------------------------------------------------------- 4. placing and taking back

create or replace function boss_place(p_event text, p_slot int, p_inst text, p_dex int, p_level int, p_shiny boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e jsonb := boss_event(p_event);
  boss int;
  cap int := 100;
  card int;
  aff numeric;
  h int;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if e is null or not boss_live_open() then raise exception 'no_boss' using errcode = 'P0002'; end if;
  if now() < boss_start(e) or now() >= boss_end(e) then raise exception 'not_running' using errcode = '22023'; end if;
  if p_slot is null or p_slot not between 0 and 2 then raise exception 'bad_slot' using errcode = '22023'; end if;
  if p_inst is null or length(p_inst) not between 1 and 80 then raise exception 'bad_inst' using errcode = '22023'; end if;
  if not exists (select 1 from pokemon where dex = p_dex) then raise exception 'bad_dex' using errcode = '22023'; end if;
  boss := (e -> 'boss' ->> 'dex')::int;
  -- The game's level cap, then the player's best on their trainer card when the server has one (the main save's).
  select coalesce((select (value #>> '{}')::int from game_config where key = 'maxLevel' and jsonb_typeof(value) = 'number'), 100)
    into cap;
  if to_regclass('public.player_card_regions') is not null then
    if exists (select 1 from information_schema.columns where table_name = 'player_card_regions' and column_name = 'realm') then
      execute 'select max(max_level) from player_card_regions where user_id = $1 and realm = ''main''' into card using uid;
    else
      execute 'select max(max_level) from player_card_regions where user_id = $1' into card using uid;
    end if;
  end if;
  if p_level is null or p_level < 1 or p_level > least(cap, coalesce(card, cap)) then
    raise exception 'bad_level' using errcode = '22023';
  end if;
  aff := boss_affinity(p_dex, boss);
  h := greatest(1, floor(p_level * aff))::int;
  perform pg_advisory_xact_lock(hashtext('boss:' || p_event || ':' || uid::text));
  -- The slot's Pokémon (and this one, if it was hitting from another slot) stop; their damage so far stays.
  update boss_slots set removed_at = now()
  where event_id = p_event and user_id = uid and removed_at is null and (slot = p_slot or inst_id = p_inst);
  insert into boss_slots (event_id, user_id, slot, inst_id, dex, level, shiny, hit, affinity)
  values (p_event, uid, p_slot, p_inst, p_dex, p_level, coalesce(p_shiny, false), h, aff);
  return jsonb_build_object('slot', p_slot, 'hit', h, 'affinity', aff);
end
$$;

create or replace function boss_take_back(p_event text, p_slot int)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update boss_slots set removed_at = now()
  where event_id = p_event and user_id = uid and slot = p_slot and removed_at is null;
  get diagnostics n = row_count;
  return n > 0;
end
$$;

-- ---------------------------------------------------------------- 5. the numbers

create table if not exists boss_cache (
  event_id text primary key,
  built_at timestamptz not null,
  total bigint not null,
  last_hour bigint not null,
  participants int not null,
  top jsonb not null,            -- [{name, damage, user}] the 10 biggest, biggest first
  sample jsonb not null          -- up to 40 Pokémon placed now, drawn at random: [{user, name, dex, level, shiny, hit}]
);
create table if not exists boss_cache_users (
  event_id text not null,
  user_id uuid not null,
  damage bigint not null,
  primary key (event_id, user_id)
);
alter table boss_cache enable row level security;
alter table boss_cache_users enable row level security;
revoke all on boss_cache, boss_cache_users from anon, authenticated;

-- A trainer's name for the boards (their card's), or a plain one.
create or replace function boss_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from player_cards where user_id = p_user), 'Trainer')
$$;

-- The cache, built again when it's older than a minute (one rebuild at a time).
create or replace function boss_refresh(p_event text, e jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  t timestamptz := least(now(), boss_end(e));
  fin timestamptz := boss_end(e);
begin
  if exists (select 1 from boss_cache where event_id = p_event and built_at > now() - interval '60 seconds') then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('boss-refresh:' || p_event));
  if exists (select 1 from boss_cache where event_id = p_event and built_at > now() - interval '60 seconds') then
    return;
  end if;
  delete from boss_cache_users where event_id = p_event;
  insert into boss_cache_users (event_id, user_id, damage)
  select p_event, s.user_id, sum(boss_dealt(s, fin, t))
  from boss_slots s where s.event_id = p_event group by s.user_id;
  insert into boss_cache (event_id, built_at, total, last_hour, participants, top, sample)
  select p_event, now(),
    coalesce((select sum(damage) from boss_cache_users where event_id = p_event), 0),
    coalesce((select sum(boss_dealt(s, fin, t)) - sum(boss_dealt(s, fin, t - interval '1 hour'))
              from boss_slots s where s.event_id = p_event), 0),
    (select count(*) from boss_cache_users where event_id = p_event),
    coalesce((select jsonb_agg(jsonb_build_object('user', u.user_id, 'name', boss_name(u.user_id), 'damage', u.damage)
                                order by u.damage desc)
              from (select * from boss_cache_users where event_id = p_event order by damage desc limit 10) u), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('user', s.user_id, 'name', boss_name(s.user_id), 'dex', s.dex,
                                                  'level', s.level, 'shiny', s.shiny, 'hit', s.hit))
              from (select * from boss_slots where event_id = p_event and removed_at is null order by random() limit 40) s),
             '[]'::jsonb)
  on conflict (event_id) do update set built_at = excluded.built_at, total = excluded.total,
    last_hour = excluded.last_hour, participants = excluded.participants, top = excluded.top, sample = excluded.sample;
end
$$;

-- Everything the page shows: the community's (cached), the caller's own (live), and the arena's field.
create or replace function boss_state(p_event text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e jsonb := boss_event(p_event);
  fin timestamptz;
  t timestamptz;
  c boss_cache%rowtype;
  mine bigint := 0;
  my_rank int;
  slots jsonb := '[]'::jsonb;
  field jsonb := '[]'::jsonb;
  friends jsonb := '[]'::jsonb;
  others jsonb := '[]'::jsonb;
  friend_ids uuid[] := '{}';
  room int;
begin
  if e is null then raise exception 'no_boss' using errcode = 'P0002'; end if;
  fin := boss_end(e);
  t := least(now(), fin);
  perform boss_refresh(p_event, e);
  select * into c from boss_cache where event_id = p_event;
  if uid is not null then
    select coalesce(sum(boss_dealt(s, fin, t)), 0) into mine from boss_slots s where s.event_id = p_event and s.user_id = uid;
    select 1 + count(*) into my_rank from boss_cache_users u where u.event_id = p_event and u.damage > mine;
    select coalesce(jsonb_agg(jsonb_build_object('slot', s.slot, 'instId', s.inst_id, 'dex', s.dex, 'level', s.level,
                                                 'shiny', s.shiny, 'hit', s.hit, 'affinity', s.affinity,
                                                 'placedAt', s.placed_at) order by s.slot), '[]'::jsonb)
      into slots from boss_slots s where s.event_id = p_event and s.user_id = uid and s.removed_at is null;
    -- The arena: the caller's own first.
    select coalesce(jsonb_agg(jsonb_build_object('name', boss_name(uid), 'dex', s.dex, 'level', s.level, 'shiny', s.shiny,
                                                 'hit', s.hit, 'own', true) order by s.slot), '[]'::jsonb)
      into field from boss_slots s where s.event_id = p_event and s.user_id = uid and s.removed_at is null;
    if to_regclass('public.friendships') is not null then
      execute 'select coalesce(array_agg(case when user_a = $1 then user_b else user_a end), ''{}'')
               from friendships where user_a = $1 or user_b = $1'
        into friend_ids using uid;
    end if;
    -- Then their friends', the most recently placed first.
    room := 20 - jsonb_array_length(field);
    select coalesce(jsonb_agg(x.j), '[]'::jsonb) into friends from (
      select jsonb_build_object('name', boss_name(s.user_id), 'dex', s.dex, 'level', s.level, 'shiny', s.shiny,
                                'hit', s.hit, 'friend', true) j
      from boss_slots s
      where s.event_id = p_event and s.removed_at is null and s.user_id = any(friend_ids)
      order by s.placed_at desc limit greatest(room, 0)) x;
    field := field || friends;
  end if;
  -- Then others, from the minute's random sample, never the caller nor a friend again.
  room := 20 - jsonb_array_length(field);
  select coalesce(jsonb_agg(y.x - 'user'), '[]'::jsonb) into others from (
    select x from jsonb_array_elements(coalesce(c.sample, '[]'::jsonb)) x
    where (uid is null or (x ->> 'user')::uuid <> uid) and not ((x ->> 'user')::uuid = any(friend_ids))
    limit greatest(room, 0)) y;
  field := field || others;
  return jsonb_build_object(
    'now', now(),
    'ended', now() >= fin,
    'total', coalesce(c.total, 0),
    'lastHour', coalesce(c.last_hour, 0),
    'participants', coalesce(c.participants, 0),
    'top', coalesce((select jsonb_agg(x - 'user' || jsonb_build_object('me', (x ->> 'user')::uuid = uid))
                     from jsonb_array_elements(coalesce(c.top, '[]'::jsonb)) x), '[]'::jsonb),
    'builtAt', c.built_at,
    'me', case when uid is null then null else jsonb_build_object('damage', mine, 'rank', my_rank, 'slots', slots) end,
    'field', field,
    'result', (select jsonb_build_object('broken', r.broken, 'total', r.total, 'participants', r.participants)
               from boss_results r where r.event_id = p_event)
  );
end
$$;

-- ---------------------------------------------------------------- 6. the end

create table if not exists boss_results (
  event_id text primary key,
  settled_at timestamptz not null default now(),
  total bigint not null,
  broken int not null,
  participants int not null,
  sent int not null
);
alter table boss_results enable row level security;
revoke all on boss_results from anon, authenticated;

-- A gauge's reward as message gifts (0048's shape): a Pokémon `qty` times, each one of its own; the region being
-- played when it's opened.
create or replace function boss_reward_gifts(r jsonb)
returns jsonb
language sql immutable as $$
  select case r ->> 'kind'
    when 'item' then jsonb_build_array(jsonb_build_object('kind', 'item', 'key', r ->> 'key', 'qty', (r ->> 'qty')::int, 'region', 'current'))
    when 'gold' then jsonb_build_array(jsonb_build_object('kind', 'gold', 'amount', (r ->> 'amount')::int, 'region', 'current'))
    when 'pokemon' then (
      select coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object('kind', 'pokemon', 'dex', (r ->> 'dex')::int, 'level', (r ->> 'level')::int,
          'shiny', case when (r ->> 'shiny')::boolean then true end,
          'talent', case when (r ->> 'talent')::boolean then true end,
          'outfit', r ->> 'outfit', 'region', 'current'))), '[]'::jsonb)
      from generate_series(1, greatest(1, least(coalesce((r ->> 'qty')::int, 1), 6))))
    else '[]'::jsonb
  end
$$;

-- Who may settle: the admin, or the scheduled function's service role.
create or replace function boss_settler()
returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

create or replace function boss_settle(p_event text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  e jsonb := boss_event(p_event);
  fin timestamptz;
  total bigint;
  people int;
  broken int := 0;
  acc bigint := 0;
  g jsonb;
  gifts jsonb := '[]'::jsonb;
  name text;
  n int := 0;
  u uuid;
  done boss_results%rowtype;
begin
  if not boss_settler() then raise exception 'not_admin' using errcode = '42501'; end if;
  if e is null then raise exception 'no_boss' using errcode = 'P0002'; end if;
  fin := boss_end(e);
  if now() < fin then raise exception 'not_ended' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('boss-settle:' || p_event));
  select * into done from boss_results where event_id = p_event;
  if found then
    return jsonb_build_object('total', done.total, 'broken', done.broken, 'participants', done.participants, 'sent', done.sent, 'again', true);
  end if;
  select coalesce(sum(boss_dealt(s, fin, fin)), 0), count(distinct s.user_id) into total, people
  from boss_slots s where s.event_id = p_event;
  -- The gauges in order: each one whose HP the total covers is broken, and brings its reward.
  for g in select x from jsonb_array_elements(coalesce(e -> 'boss' -> 'gauges', '[]'::jsonb)) x loop
    acc := acc + greatest(1, coalesce((g ->> 'hp')::bigint, 1));
    exit when acc > total;
    broken := broken + 1;
    gifts := gifts || boss_reward_gifts(g -> 'reward');
  end loop;
  -- A message carries 20 gifts at most (0048).
  if jsonb_array_length(gifts) > 20 then
    gifts := (select jsonb_agg(x) from (select x from jsonb_array_elements(gifts) x limit 20) y);
  end if;
  if broken > 0 then
    name := coalesce((select p.name from pokemon p where p.dex = (e -> 'boss' ->> 'dex')::int), 'the boss');
    perform set_config('pokedice.system_message', 'on', true);
    for u in select distinct s.user_id from boss_slots s where s.event_id = p_event loop
      insert into feedback (user_id, device_id, title, message, from_admin, reply, gifts)
      values (u, 'community-boss', left('Community Boss: ' || name, 120), '', true,
              format('%s of %s gauges broken by %s trainers. Thank you for joining in: here are the rewards.',
                     broken, jsonb_array_length(coalesce(e -> 'boss' -> 'gauges', '[]'::jsonb)), people),
              gifts);
      n := n + 1;
    end loop;
    perform set_config('pokedice.system_message', '', true);
  end if;
  insert into boss_results (event_id, total, broken, participants, sent) values (p_event, total, broken, people, n);
  return jsonb_build_object('total', total, 'broken', broken, 'participants', people, 'sent', n, 'again', false);
end
$$;

-- Every Community Boss that has ended and isn't settled yet (the scheduled function's call).
create or replace function boss_settle_due()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  id text;
  n int := 0;
begin
  if not boss_settler() then raise exception 'not_admin' using errcode = '42501'; end if;
  for id in
    select e ->> 'id'
    from game_config g, jsonb_array_elements(case when jsonb_typeof(g.value -> 'list') = 'array' then g.value -> 'list' else '[]'::jsonb end) e
    where g.key = 'liveEvents' and e ->> 'type' = 'boss' and (e ->> 'end')::timestamptz <= now()
      and (e ->> 'end')::timestamptz > now() - interval '30 days'
      and not exists (select 1 from boss_results r where r.event_id = e ->> 'id')
  loop
    perform boss_settle(id);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- ---------------------------------------------------------------- grants

-- Supabase grants every new function to anon and authenticated by default: taken back here, then given as needed.
revoke all on function boss_live_open(), boss_event(text), boss_affinity(int, int), boss_dealt(boss_slots, timestamptz, timestamptz),
  boss_place(text, int, text, int, int, boolean), boss_take_back(text, int), boss_name(uuid), boss_refresh(text, jsonb),
  boss_state(text), boss_reward_gifts(jsonb), boss_settler(), boss_settle(text), boss_settle_due()
  from public, anon, authenticated;
grant execute on function boss_place(text, int, text, int, int, boolean), boss_take_back(text, int), boss_state(text)
  to authenticated;
grant execute on function boss_state(text) to anon;
grant execute on function boss_settle(text), boss_settle_due() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function boss_settle(text), boss_settle_due(), boss_state(text) to service_role;
  end if;
end
$$;

commit;
