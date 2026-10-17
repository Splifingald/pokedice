-- The Underground (docs/31-UNDERGROUND-PLAN.md §3): what crosses between players. A save is written only by its owner,
-- so the walls, kits, the orb bag and the plates stay in each player's save; the server holds the teams and the orbs one
-- teammate dug for another, like the trades' inbox: the sender's game says which wall's orbs it owes, the server routes
-- each to whoever holds its colour, and the receiver's game applies them once and says so.
--
-- 1. game_config `underground`: the switch (Off / On for admin / On for everyone, off by default: docs/15 §20) and the
--    numbers, inserted only if missing so seeding never clobbers the admin's.
-- 2. ug_live(): the Underground live event running now, while both switches are on for the caller. Every function
--    below refuses without one, and tidies what an ended event left (the team breaks up when the event ends).
-- 3. Teams of three friends, one orb colour each, dealt at random on joining: ug_team, ug_invite, ug_answer,
--    ug_cancel, ug_leave.
-- 4. Orbs between teammates: ug_send (a finished wall's orbs, once per wall), ug_inbox, ug_applied.
-- 5. ug_can_sell: the caller's team has all three seats (the game sells orbs only then).
-- 6. delete_my_data: 0053's, plus the caller's seats, invitations and orbs owed.
--
-- The main save only: Extreme mode is a solo challenge. Run after 0060; safe to run again.
-- seed.sql inlines it (scripts/seed.ts), after 0060.

-- ---------------------------------------------------------------- 1. the switch and the numbers

-- The game's defaults (engine/defaults.ts; tests/underground-sql.test.ts keeps the two the same).
insert into game_config (key, value) values ('underground', '{"access":"off","kits":{"price":1000,"limit":10,"freeAmount":3,"freePeriodHours":24,"freeCap":3},"wall":{"cols":6,"rows":6,"strikes":15,"layers":[30,40,30],"itemsMin":2,"itemsMax":4,"neighbourLoss":1},"loot":{"weights":{"orbS":40,"orbM":25,"orbL":10,"fossil":8,"plate":3},"shapes":{"orbS":{"w":1,"h":1},"orbM":{"w":2,"h":1},"orbL":{"w":2,"h":2},"fossil":{"w":2,"h":2},"plate":{"w":3,"h":2}},"colours":{"red":34,"blue":33,"green":33}},"prices":{"red":{"s":100,"m":300,"l":800},"blue":{"s":100,"m":300,"l":800},"green":{"s":100,"m":300,"l":800}},"pickaxe":[{"faces":[1,1,1,1,1,2],"price":0},{"faces":[1,1,1,1,2,2],"price":500},{"faces":[1,1,1,2,2,2],"price":1000},{"faces":[1,1,2,2,2,2],"price":1500},{"faces":[1,2,2,2,2,2],"price":2500},{"faces":[2,2,2,2,2,2],"price":4000},{"faces":[2,2,2,2,2,3],"price":6000},{"faces":[2,2,2,2,3,3],"price":8000},{"faces":[2,2,2,3,3,3],"price":10000}],"sellNeedsFull":true}'::jsonb)
on conflict (key) do nothing;

-- The switch, as the other features read their own: on for everyone, or for the admin only. Never null.
create or replace function ug_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'underground' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;

-- A finished wall's things at most (the admin's `wall.itemsMax`, 4 by default): a wall can't owe more orbs than that.
create or replace function ug_items_max()
returns int
language sql stable security definer set search_path = public as $$
  select least(12, greatest(1, coalesce((select (value -> 'wall' ->> 'itemsMax')::int from game_config
    where key = 'underground' and jsonb_typeof(value) = 'object'), 4)))
$$;

-- ---------------------------------------------------------------- 2. the event running now

-- The id of the Underground live event running now (start included, end excluded), while the live events' switch and
-- the Underground's are on for the caller; null otherwise.
create or replace function ug_live()
returns text
language sql stable security definer set search_path = public as $$
  select e ->> 'id'
  from game_config g, jsonb_array_elements(case when jsonb_typeof(g.value -> 'list') = 'array' then g.value -> 'list' else '[]'::jsonb end) e
  where g.key = 'liveEvents'
    and (g.value ->> 'access' = 'all' or (g.value ->> 'access' = 'admin' and is_admin()))
    and e ->> 'type' = 'underground'
    and (e ->> 'start')::timestamptz <= now() and now() < (e ->> 'end')::timestamptz
    and ug_open()
  order by (e ->> 'start')::timestamptz
  limit 1
$$;

-- ---------------------------------------------------------------- 3. teams

create table if not exists ug_teams (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ug_teams_event on ug_teams (event_id);

-- One seat per player per event, one colour per seat.
create table if not exists ug_members (
  team_id uuid not null references ug_teams(id) on delete cascade,
  event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  colour text not null check (colour in ('red', 'blue', 'green')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (event_id, user_id),
  unique (team_id, colour)
);

create table if not exists ug_invites (
  team_id uuid not null references ug_teams(id) on delete cascade,
  event_id text not null,
  from_user uuid references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, to_user)
);
create index if not exists ug_invites_to on ug_invites (to_user);

-- Orbs owed: one row per wall and receiver, its orbs as [{colour, size}].
create table if not exists ug_orbs (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  wall_id text not null,
  from_user uuid references auth.users(id) on delete set null,
  to_user uuid not null references auth.users(id) on delete cascade,
  orbs jsonb not null,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_user, wall_id, to_user)
);
create index if not exists ug_orbs_to on ug_orbs (to_user) where not applied;

alter table ug_teams enable row level security;
alter table ug_members enable row level security;
alter table ug_invites enable row level security;
alter table ug_orbs enable row level security;
revoke all on ug_teams, ug_members, ug_invites, ug_orbs from anon, authenticated;
drop policy if exists ug_teams_admin on ug_teams;
create policy ug_teams_admin on ug_teams for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists ug_members_admin on ug_members;
create policy ug_members_admin on ug_members for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists ug_invites_admin on ug_invites;
create policy ug_invites_admin on ug_invites for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists ug_orbs_admin on ug_orbs;
create policy ug_orbs_admin on ug_orbs for all using ((select is_admin())) with check ((select is_admin()));

-- The caller, signed in, during an Underground event: its id. An ended event's teams, invitations and orbs go first.
create or replace function ug_begin()
returns text
language plpgsql security definer set search_path = public as $$
declare
  ev text := ug_live();
begin
  if auth.uid() is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if ev is null then
    raise exception 'ug_closed' using errcode = 'P0001';
  end if;
  delete from ug_teams where event_id <> ev;
  delete from ug_orbs where event_id <> ev or (applied and created_at < now() - interval '2 days');
  return ev;
end
$$;

-- A player's name, as their card shows it.
create or replace function ug_name(p_user uuid)
returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(c.name, '') from player_cards c where c.user_id = p_user and c.realm = 'main'), 'Trainer')
$$;

create or replace function ug_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b))
$$;

-- A team's seats: [{colour, id, name}].
create or replace function ug_seats(p_team uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('colour', m.colour, 'id', m.user_id, 'name', ug_name(m.user_id))
    order by m.joined_at), '[]'::jsonb)
  from ug_members m where m.team_id = p_team
$$;

-- A free colour of a team, at random; null when it is full.
create or replace function ug_free_colour(p_team uuid)
returns text
language sql volatile security definer set search_path = public as $$
  select c from unnest(array['red', 'blue', 'green']) c
  where not exists (select 1 from ug_members m where m.team_id = p_team and m.colour = c)
  order by random() limit 1
$$;

-- Leaves the caller's team for this event (an emptied team goes, with its invitations).
create or replace function ug_quit(p_user uuid, p_event text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
begin
  delete from ug_members where user_id = p_user and event_id = p_event returning team_id into t;
  if t is not null and not exists (select 1 from ug_members where team_id = t) then
    delete from ug_teams where id = t;
  end if;
end
$$;

-- The caller's team and invitations: {event, team, me, seats, invites: [{team, from, name, seats}], sent: [{id, name}]}.
create or replace function ug_team()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev text := ug_begin();
  t uuid;
  c text;
begin
  select team_id, colour into t, c from ug_members where user_id = me and event_id = ev;
  return jsonb_build_object(
    'event', ev,
    'team', t,
    'me', c,
    'seats', case when t is null then '[]'::jsonb else ug_seats(t) end,
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('team', i.team_id, 'from', i.from_user, 'name', ug_name(i.from_user),
        'seats', ug_seats(i.team_id)) order by i.created_at)
      from ug_invites i where i.to_user = me and i.event_id = ev and i.team_id is distinct from t), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.to_user, 'name', ug_name(i.to_user)) order by i.created_at)
      from ug_invites i where i.team_id = t), '[]'::jsonb)
  );
end
$$;

-- Invites a friend into the caller's team (made, the caller seated, on the first invitation). At most five waiting.
create or replace function ug_invite(p_friend uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev text := ug_begin();
  t uuid;
begin
  if p_friend is null or p_friend = me or not ug_friends(me, p_friend) then
    raise exception 'ug_not_friends' using errcode = 'P0001';
  end if;
  select team_id into t from ug_members where user_id = me and event_id = ev;
  if t is null then
    insert into ug_teams (event_id, created_by) values (ev, me) returning id into t;
    insert into ug_members (team_id, event_id, user_id, colour) values (t, ev, me, ug_free_colour(t));
  end if;
  if exists (select 1 from ug_members where team_id = t and user_id = p_friend) then
    raise exception 'ug_already_in' using errcode = 'P0001';
  end if;
  if (select count(*) from ug_members where team_id = t) >= 3 then
    raise exception 'ug_team_full' using errcode = 'P0001';
  end if;
  if (select count(*) from ug_invites where team_id = t) >= 5 then
    raise exception 'ug_too_many_invites' using errcode = 'P0001';
  end if;
  insert into ug_invites (team_id, event_id, from_user, to_user) values (t, ev, me, p_friend)
  on conflict (team_id, to_user) do nothing;
  return ug_team();
end
$$;

-- Takes back an invitation the caller's team sent.
create or replace function ug_cancel(p_friend uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev text := ug_begin();
begin
  delete from ug_invites i using ug_members m
  where i.team_id = m.team_id and m.user_id = me and m.event_id = ev and i.to_user = p_friend;
  return ug_team();
end
$$;

-- Answers an invitation: yes takes a free colour at random (leaving the caller's old team), no drops it.
create or replace function ug_answer(p_team uuid, p_yes boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev text := ug_begin();
  c text;
begin
  if not exists (select 1 from ug_invites where team_id = p_team and to_user = me and event_id = ev) then
    raise exception 'ug_no_invite' using errcode = 'P0001';
  end if;
  delete from ug_invites where team_id = p_team and to_user = me;
  if not p_yes then
    return ug_team();
  end if;
  -- Two players answering at once: the team's row is locked while one takes a seat.
  perform 1 from ug_teams where id = p_team for update;
  c := ug_free_colour(p_team);
  if c is null then
    raise exception 'ug_team_full' using errcode = 'P0001';
  end if;
  perform ug_quit(me, ev);
  insert into ug_members (team_id, event_id, user_id, colour) values (p_team, ev, me, c);
  return ug_team();
end
$$;

create or replace function ug_leave()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev text := ug_begin();
begin
  perform ug_quit(auth.uid(), ev);
  return ug_team();
end
$$;

-- ---------------------------------------------------------------- 4. orbs between teammates

-- A finished wall's orbs owed to teammates, [{colour, size}]: the server routes each to whoever holds its colour (never
-- the caller). Once per wall: a wall sent again changes nothing. Returns how many orbs went to someone.
create or replace function ug_send(p_wall text, p_orbs jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev text := ug_begin();
  t uuid;
  n int := 0;
  r record;
begin
  if p_wall is null or length(p_wall) > 120 or jsonb_typeof(p_orbs) <> 'array' or jsonb_array_length(p_orbs) > ug_items_max() then
    raise exception 'ug_bad_orbs' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_orbs) o
             where o ->> 'colour' not in ('red', 'blue', 'green') or o ->> 'size' not in ('s', 'm', 'l')) then
    raise exception 'ug_bad_orbs' using errcode = '22023';
  end if;
  -- Plenty for any honest day's digging, and a ceiling on a forged one.
  if (select count(*) from ug_orbs where from_user = me and created_at > now() - interval '1 day') >= 200 then
    raise exception 'ug_rate_limited' using errcode = 'P0001';
  end if;
  select team_id into t from ug_members where user_id = me and event_id = ev;
  if t is null then
    return 0;
  end if;
  for r in
    select m.user_id, jsonb_agg(jsonb_build_object('colour', o ->> 'colour', 'size', o ->> 'size')) orbs, count(*) k
    from jsonb_array_elements(p_orbs) o join ug_members m on m.team_id = t and m.colour = o ->> 'colour'
    where m.user_id <> me
    group by m.user_id
  loop
    insert into ug_orbs (event_id, wall_id, from_user, to_user, orbs) values (ev, p_wall, me, r.user_id, r.orbs)
    on conflict (from_user, wall_id, to_user) do nothing;
    if found then
      n := n + r.k;
    end if;
  end loop;
  return n;
end
$$;

-- Orbs owed to the caller, not applied yet: [{id, from, orbs}].
create or replace function ug_inbox()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ev text := ug_begin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'from', coalesce(ug_name(o.from_user), 'Trainer'), 'orbs', o.orbs)
      order by o.created_at)
    from ug_orbs o where o.to_user = me and o.event_id = ev and not o.applied), '[]'::jsonb);
end
$$;

-- The caller's game has these orbs in its save.
create or replace function ug_applied(p_ids uuid[])
returns void
language sql security definer set search_path = public as $$
  update ug_orbs set applied = true where to_user = auth.uid() and id = any (p_ids)
$$;

-- ---------------------------------------------------------------- 5. selling

create or replace function ug_can_sell()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ev text := ug_begin();
begin
  return coalesce((
    select count(*) = 3 from ug_members m
    where m.team_id = (select team_id from ug_members where user_id = auth.uid() and event_id = ev)), false);
end
$$;

-- ---------------------------------------------------------------- 6. delete_my_data

-- 0053's, and the Underground: the caller's seats, invitations and orbs owed (sent ones keep the other side's orbs).
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
  -- The Underground (0061): your seat (an emptied team goes), your invitations, the orbs owed to you.
  if to_regclass('public.ug_members') is not null and (p_realm is null or p_realm = 'main') then
    delete from ug_invites where from_user = me or to_user = me;
    delete from ug_orbs where to_user = me;
    delete from ug_members where user_id = me;
    delete from ug_teams t where not exists (select 1 from ug_members m where m.team_id = t.id);
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

revoke all on function ug_open(), ug_items_max(), ug_live(), ug_begin(), ug_name(uuid), ug_friends(uuid, uuid),
  ug_seats(uuid), ug_free_colour(uuid), ug_quit(uuid, text) from public, anon, authenticated;
revoke all on function ug_team(), ug_invite(uuid), ug_cancel(uuid), ug_answer(uuid, boolean), ug_leave(),
  ug_send(text, jsonb), ug_inbox(), ug_applied(uuid[]), ug_can_sell(), delete_my_data(text) from public, anon;
grant execute on function ug_team(), ug_invite(uuid), ug_cancel(uuid), ug_answer(uuid, boolean), ug_leave(),
  ug_send(text, jsonb), ug_inbox(), ug_applied(uuid[]), ug_can_sell(), delete_my_data(text) to authenticated;
