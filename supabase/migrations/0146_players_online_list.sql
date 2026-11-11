-- Players online, the list (docs/70 §1): VIEW beside the side menu's count opens the players online, up to 30, the
-- closest to the caller in badges when there are more, each with their team, and INVITE beside the ones the caller
-- can ask to be friends.
--
-- 1. online_here gets each player's card, sent with the ping: their name (12 characters, as the leaderboard's), their
--    look (an avatar id, the game draws it; an unknown one is Red), their badges, every region's together (the main
--    save's, as global messages count them, docs/69: only to pick the closest, never shown) and their team (up to 3, as a
--    team holds: {dex, level, shiny}). On the game's word, as a guest's badges are for those messages: a card says no more than the
--    leaderboard already shows.
-- 2. online_ping(device id, name, look, badges, team): the same call, now with the card. The older ones (the device id
--    alone, 0144; without the team, this file's first version) go, so an older build's call lands on this one.
-- 3. online_players(device id): up to 30 rows heard from in the last 6 minutes with a card, the closest to the
--    caller's badges first (then the most recent), returned most badges first:
--    {name, look, team, me, friend, id, invite}. `friend`: one of the caller's. `invite`: 'yes' when the caller,
--    signed in, can ask this account (not a friend, no request waiting, both lists with room), 'sent' when the caller
--    asked already, else null; `id` (the account) only with one of them, for online_invite. Guests are never invited:
--    a friend is an account.
-- 4. online_invite(account): a friend request (0099's friend_requests, `via` 'online'), answered on the Friends page as
--    a real-player battle's: 'sent', 'added' (they had asked the caller: both want it), 'already', 'pending', 'self',
--    'offline' (not online now: only the list's players can be asked), 'full' (the caller's list), 'friend_full'
--    (theirs). The friends' rate limit (friend_attempt) counts each.
-- 5. friend_requests() lists every request, whatever the real-player battles' switch: an online one can come with it
--    Off. Each says where it came from (`via`).
--
-- Run after 0144 and 0099. Safe to run again (and over this file's first version). supabase/seed.sql doesn't inline it.

begin;

-- ---------------------------------------------------------------- 1. the card

alter table online_here add column if not exists name text;
alter table online_here add column if not exists look text;
alter table online_here add column if not exists badges int;
alter table online_here add column if not exists team jsonb;

-- ---------------------------------------------------------------- 2. the ping, with the card

drop function if exists online_ping(text);
drop function if exists online_ping(text, text, text, int);

create or replace function online_ping(
  p_device_id text,
  p_name text default null,
  p_look text default null,
  p_badges int default null,
  p_team jsonb default null
)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me text := coalesce(auth.uid()::text, 'device:' || nullif(trim(p_device_id), ''));
  nm text := left(coalesce(nullif(trim(p_name), ''), 'Trainer'), 12);
  lk text := case when p_look ~ '^[a-z0-9/_-]{1,60}$' then p_look end;
  bd int := case when p_badges between 0 and 999 then p_badges end;
  tm jsonb;
begin
  -- The team rebuilt from what is checked: three at most (a team's size), whole numbers, nothing else carried.
  select coalesce(jsonb_agg(
           jsonb_build_object('dex', (e ->> 'dex')::int, 'level', (e ->> 'level')::int)
             || case when e ->> 'shiny' = 'true' then '{"shiny": true}'::jsonb else '{}'::jsonb end
           order by i), '[]'::jsonb)
    into tm
    from jsonb_array_elements(
      case when jsonb_typeof(p_team) = 'array' and jsonb_array_length(p_team) <= 3 then p_team else '[]'::jsonb end
    ) with ordinality as x(e, i)
    where e ->> 'dex' ~ '^[0-9]{1,6}$' and e ->> 'level' ~ '^[0-9]{1,4}$';
  -- A device id is the game's own (a UUID); anything longer is a hand-made call, counted as nobody.
  if me is not null and length(me) <= 80 then
    insert into online_here (who, at, name, look, badges, team)
    values (me, now(), case when bd is not null then nm end, lk, bd, case when bd is not null then tm end)
    on conflict (who) do update
      set at = excluded.at, name = excluded.name, look = excluded.look, badges = excluded.badges, team = excluded.team;
  end if;
  -- The ones gone a while, now and then rather than on every call (a few hundred rows at most either way).
  if random() < 0.05 then delete from online_here h where h.at < now() - interval '1 hour'; end if;
  return (select count(*)::int from online_here h where h.at > now() - interval '6 minutes');
end
$$;

-- ---------------------------------------------------------------- 3. the list

create or replace function online_friend_count(p_user uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from friendships f where f.user_a = p_user or f.user_b = p_user
$$;

create or replace function online_players(p_device_id text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with ctx as (
    select
      coalesce(auth.uid()::text, 'device:' || nullif(trim(p_device_id), '')) as who,
      auth.uid() as uid,
      coalesce((select (g.value #>> '{}')::int from game_config g where g.key = 'maxFriends'), 100) as cap
  ), mine as (
    select ctx.*,
      coalesce((select h.badges from online_here h where h.who = ctx.who), 0) as badges,
      ctx.uid is not null and online_friend_count(ctx.uid) < ctx.cap as has_room
    from ctx
  ), picked as (
    select h.name, h.look, h.badges, coalesce(h.team, '[]'::jsonb) as team, h.who = mine.who as me,
      case when h.who !~ '^device:' and h.who ~ '^[0-9a-f-]{36}$' then h.who::uuid end as account
    from online_here h, mine
    where h.at > now() - interval '6 minutes' and h.badges is not null
    order by abs(h.badges - mine.badges), h.at desc
    limit 30
  ), shown as (
    select p.*,
      p.account is not null and mine.uid is not null and exists (
        select 1 from friendships f where f.user_a = least(mine.uid, p.account) and f.user_b = greatest(mine.uid, p.account)
      ) as friend,
      p.account is not null and mine.uid is not null and exists (
        select 1 from friend_requests r where r.from_id = mine.uid and r.to_id = p.account
      ) as asked
    from picked p, mine
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name,
      'look', s.look,
      'team', s.team,
      'me', s.me,
      'friend', s.friend,
      'invite', s.invite,
      'id', case when s.invite is not null then s.account end
    ) order by s.badges desc, s.me desc, s.name), '[]'::jsonb)
  from (
    select shown.*,
      case
        when shown.me or shown.friend or shown.account is null or not mine.has_room then null
        when shown.asked then 'sent'
        when online_friend_count(shown.account) >= mine.cap then null
        else 'yes'
      end as invite
    from shown, mine
  ) s
$$;

-- ---------------------------------------------------------------- 4. the invite

alter table friend_requests add column if not exists via text;

create or replace function online_invite(p_to uuid)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cap int := coalesce((select (g.value #>> '{}')::int from game_config g where g.key = 'maxFriends'), 100);
begin
  if me is null then raise exception 'friends_signed_out' using errcode = '42501'; end if;
  perform friend_attempt(me::text);
  if p_to is null or p_to = me then return 'self'; end if;
  if not exists (select 1 from online_here h where h.who = p_to::text and h.at > now() - interval '6 minutes') then
    return 'offline';
  end if;
  delete from friend_requests where created_at < now() - make_interval(days => area_versus_days('requestDays'));
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || least(me, p_to)::text));
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || greatest(me, p_to)::text));
  if exists (select 1 from friendships f where f.user_a = least(me, p_to) and f.user_b = greatest(me, p_to)) then
    return 'already';
  end if;
  if exists (select 1 from friend_requests r where r.from_id = me and r.to_id = p_to) then return 'pending'; end if;
  if online_friend_count(me) >= cap then return 'full'; end if;
  if online_friend_count(p_to) >= cap then return 'friend_full'; end if;
  -- They asked the caller already: both want it.
  if exists (select 1 from friend_requests r where r.from_id = p_to and r.to_id = me) then
    delete from friend_requests where (from_id = p_to and to_id = me) or (from_id = me and to_id = p_to);
    insert into friendships (user_a, user_b, added_by, a_seen, b_seen)
    values (least(me, p_to), greatest(me, p_to), me, least(me, p_to) = me, greatest(me, p_to) = me);
    return 'added';
  end if;
  insert into friend_requests (from_id, to_id, area_id, via) values (me, p_to, null, 'online');
  return 'sent';
end
$$;

-- ---------------------------------------------------------------- 5. the requests, whatever the battles' switch

create or replace function friend_requests()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.from_id,
      'name', coalesce(c.name, 'Trainer'),
      'avatar', coalesce(c.avatar, 'red'),
      'rich', coalesce(c.rich, false),
      'area', r.area_id,
      'via', r.via,
      'at', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
  from friend_requests r
  left join player_cards c on c.user_id = r.from_id and c.realm = 'main'
  where auth.uid() is not null
    and r.to_id = auth.uid()
    and r.created_at > now() - make_interval(days => area_versus_days('requestDays'))
$$;

revoke all on function online_friend_count(uuid) from public, anon, authenticated;
revoke all on function online_ping(text, text, text, int, jsonb), online_players(text) from public;
grant execute on function online_ping(text, text, text, int, jsonb), online_players(text) to anon, authenticated;
revoke all on function online_invite(uuid) from public, anon;
grant execute on function online_invite(uuid) to authenticated;

commit;
