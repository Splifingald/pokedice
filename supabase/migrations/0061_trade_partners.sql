-- Trades: the other trainer's card from a trade, and adding them as a friend (docs/23 §2.3). The trade scene's last
-- step opens the card of whoever you traded with, to thank them by adding them.
--
-- 1. trade_take and trade_mine say who the other trainer is (`withId`, next to `with`): the save's trade log keeps it,
--    so the scene (played again from the Done list too) knows whose card to open.
-- 2. trade_partners(a, b): the two have traded, as the server still holds it (a taken listing between them; trade_mine
--    clears those 30 days after both sides applied them).
-- 3. friend_profile opens for a trade partner too, not only a friend, while Trades is open to the caller and in the
--    main world (the only one trades happen in). `since` stays null there: the card says they aren't friends.
-- 4. friend_add_partner(user): friends at once with a trade partner, as friend_add is with a code (the same tries
--    limit, the same caps, and the other side's "new friend" notice). Anyone else is 'not_found'.
--
-- Run after 0049 (it redefines 0049's trade_take, trade_mine and friend_profile, same signatures); safe to run again.
-- seed.sql inlines it last (scripts/seed.ts).

-- ---------------------------------------------------------------- 1. who the other trainer was

-- 0049's, and the poster's id.
create or replace function trade_take(p_code text, p_inst text, p_realm text default 'main')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := trade_cfg();
  l trade_listings;
  save jsonb;
  hit record;
  gdex int;
  gshiny boolean;
  today timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' then raise exception 'trades_realm'; end if;
  if not trade_open() then raise exception 'trades_off'; end if;
  if trade_badges(me) < coalesce((cfg ->> 'minBadges')::int, 0) then raise exception 'trades_badges'; end if;

  select * into l from trade_listings t where t.code = friend_norm(p_code) for update;
  if not found or l.status <> 'open' or l.ends_at <= now() then raise exception 'trades_gone'; end if;
  if l.owner = me then raise exception 'trades_own'; end if;
  if l.visibility = 'friends' and not exists (select 1 from friend_ids_of(me) f where f.id = l.owner) then
    raise exception 'trades_friends_only';
  end if;
  if (select count(*) from trade_listings t where t.taker = me and t.taken_at >= today)
     >= coalesce((cfg ->> 'tradesPerDay')::int, 5) then
    raise exception 'trades_daily_cap';
  end if;

  select s.data into save from saves s where s.user_id = me and s.realm = 'main';
  if save is null then raise exception 'trades_no_save'; end if;
  if trade_in_world(save) then raise exception 'trades_world'; end if;
  if not (l.home_region = any (trade_started(save))) then raise exception 'trades_region'; end if;
  select * into hit from trade_find(save, p_inst);
  if hit.inst is null then raise exception 'trades_not_found'; end if;
  if trade_world(save, hit.region) then raise exception 'trades_world'; end if;
  if hit.inst ->> 'revivesAt' is not null then raise exception 'trades_reviving'; end if;
  if hit.others < 1 then raise exception 'trades_last'; end if;
  gdex := (hit.inst ->> 'dex')::int;
  gshiny := coalesce((hit.inst ->> 'shiny')::boolean, false);
  if trade_untradable(gdex) then raise exception 'trades_untradable'; end if;
  if exists (select 1 from trade_listings t where t.owner = me and t.status = 'open' and t.mon ->> 'id' = p_inst)
     or exists (select 1 from trade_listings t where t.taker = me and not t.taker_applied and t.taker_mon ->> 'id' = p_inst) then
    raise exception 'trades_listed';
  end if;
  -- The poster must be able to receive it: its home region started on their side.
  if not (coalesce(l.poster -> 'regions', '[]') ? coalesce(trade_home_region(gdex), hit.region)) then
    raise exception 'trades_poster_region';
  end if;
  -- In parentheses: an IF's condition ends at its first THEN otherwise.
  if not (case l.want ->> 'kind'
    when 'species' then gdex = (l.want ->> 'dex')::int
    when 'notOwned' then not trade_has(l.poster, gdex)
                         or (gshiny and not coalesce(l.poster -> 'shiny', '[]') @> to_jsonb(gdex))
    else true
  end) then
    raise exception 'trades_no_match';
  end if;

  update trade_listings t
     set status = 'taken', taker = me, taker_name = trade_name(me), taker_mon = hit.inst, taker_from = hit.region,
         taken_at = now()
   where t.id = l.id and t.status = 'open'
  returning * into l;
  return jsonb_build_object('id', l.id, 'listed', l.mon, 'given', l.taker_mon, 'with', coalesce(trade_name(l.owner), l.owner_name, ''),
    'withRich', player_rich(l.owner), 'withId', l.owner);
end
$$;

-- 0049's check on load, and the other trainer's id.
create or replace function trade_mine(p_realm text default 'main')
returns setof jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' then return; end if;
  update trade_listings t set status = 'expired' where t.owner = me and t.status = 'open' and t.ends_at <= now();
  delete from trade_listings t
   where (t.owner = me or t.taker = me) and t.status <> 'open' and t.owner_applied
     and (t.taker is null or t.taker_applied) and coalesce(t.taken_at, t.ends_at) < now() - interval '30 days';
  return query
    select jsonb_build_object(
      'id', t.id, 'code', t.code, 'role', case when t.owner = me then 'owner' else 'taker' end, 'status', t.status,
      'mon', t.mon, 'from_region', t.from_region, 'want', t.want, 'visibility', t.visibility,
      'created_at', t.created_at, 'ends_at', t.ends_at, 'taker_mon', t.taker_mon,
      'with', case when t.owner = me then coalesce(trade_name(t.taker), t.taker_name, '')
                   else coalesce(trade_name(t.owner), t.owner_name, '') end,
      'withRich', player_rich(case when t.owner = me then t.taker else t.owner end),
      'withId', case when t.owner = me then t.taker else t.owner end)
    from trade_listings t
    where (t.owner = me and (t.status = 'open' or not t.owner_applied))
       or (t.taker = me and not t.taker_applied)
    order by t.created_at;
end
$$;

-- ---------------------------------------------------------------- 2. traded together

create or replace function trade_partners(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_a <> p_b, false) and exists (
    select 1 from trade_listings t
    where t.status = 'taken' and ((t.owner = p_a and t.taker = p_b) or (t.owner = p_b and t.taker = p_a))
  )
$$;

-- ---------------------------------------------------------------- 3. their card

-- 0049's friend card, and a trade partner's.
create or replace function friend_profile(p_friend uuid, p_realm text default 'main')
returns table (
  user_id uuid,
  name text,
  avatar text,
  region text,
  area_id text,
  updated_at timestamptz,
  since timestamptz,
  regions jsonb,
  versus jsonb,
  in_realm boolean,
  rich boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  friends_since timestamptz;
  vs jsonb;
begin
  select f.created_at into friends_since
  from friendships f where f.user_a = least(uid, p_friend) and f.user_b = greatest(uid, p_friend);
  if friends_since is null
     and not (p_realm = 'main' and trade_open() and trade_partners(uid, p_friend)) then
    return;
  end if;
  if to_regclass('public.versus_teams') is not null then
    select jsonb_build_object(
      'team', v.team,
      'attackWins', (select count(*) from versus_battles b where b.realm = p_realm and b.attacker_id = v.user_id and b.won),
      'defenseWins', (
        select count(*) from (
          select distinct b.attacker_id, b.defender_version from versus_battles b
          where b.realm = p_realm and b.defender_id = v.user_id and not b.won
        ) held
      )
    ) into vs
    from versus_teams v where v.user_id = p_friend and v.realm = p_realm;
  end if;
  return query
    select p_friend, coalesce(c.name, cm.name, 'Trainer'), coalesce(c.avatar, cm.avatar, 'red'), c.region, c.area_id,
      c.updated_at, friends_since,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'region', r.region, 'team', r.team, 'pokedex', r.pokedex, 'maxLevel', r.max_level, 'shinies', r.shinies,
          'progress', r.progress, 'badges', to_jsonb(r.badges), 'endgame', r.endgame
        ))
        from player_card_regions r where r.user_id = p_friend and r.realm = p_realm
      ), '[]'),
      vs,
      c.user_id is not null,
      player_rich(p_friend)
    from (select 1) one
    left join player_cards c on c.user_id = p_friend and c.realm = p_realm
    left join player_cards cm on cm.user_id = p_friend and cm.realm = 'main';
end
$$;

-- ---------------------------------------------------------------- 4. adding them

-- 0039's friend_add, with a trade partner in place of a code.
create or replace function friend_add_partner(p_user uuid, p_realm text default 'main')
returns table (status text, user_id uuid, name text, avatar text)
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cap int;
begin
  if uid is null then
    raise exception 'friends_signed_out' using errcode = '42501';
  end if;
  perform friend_attempt(uid::text);
  if p_user = uid then
    return query select 'self'::text, null::uuid, null::text, null::text;
    return;
  end if;
  if p_realm is distinct from 'main' or not trade_open() or not trade_partners(uid, p_user) then
    return query select 'not_found'::text, null::uuid, null::text, null::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || least(uid, p_user)::text));
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || greatest(uid, p_user)::text));
  if exists (select 1 from friendships f where f.user_a = least(uid, p_user) and f.user_b = greatest(uid, p_user)) then
    status := 'already';
  else
    cap := coalesce((select (g.value #>> '{}')::int from game_config g where g.key = 'maxFriends'), 100);
    if (select count(*) from friendships f where f.user_a = uid or f.user_b = uid) >= cap then
      status := 'full';
    elsif (select count(*) from friendships f where f.user_a = p_user or f.user_b = p_user) >= cap then
      status := 'friend_full';
    else
      insert into friendships (user_a, user_b, added_by, a_seen, b_seen)
      values (least(uid, p_user), greatest(uid, p_user), uid, least(uid, p_user) = uid, greatest(uid, p_user) = uid);
      status := 'added';
    end if;
  end if;
  return query
    select status, p_user, coalesce(c.name, cm.name, 'Trainer'), coalesce(c.avatar, cm.avatar, 'red')
    from (select 1) one
    left join player_cards c on c.user_id = p_user and c.realm = p_realm
    left join player_cards cm on cm.user_id = p_user and cm.realm = 'main';
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function trade_partners(uuid, uuid) from public, anon, authenticated;
revoke all on function friend_add_partner(uuid, text) from public, anon;
revoke all on function friend_profile(uuid, text) from public, anon;
grant execute on function friend_add_partner(uuid, text), friend_profile(uuid, text) to authenticated;
