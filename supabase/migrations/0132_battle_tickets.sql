-- Battle tickets (docs/65 §15): Friend Battles' currency. Each UTC midnight gives every player one while they hold
-- fewer than three (never past three); the Friend Market sells them, 10 Heart Scales each, 10 a week, and bought ones
-- can go past three. A fight costs both players one, taken as it starts (both ready after the draft or Classic's
-- order). The server holds them: the game only shows them.
--
-- 1. game_config `friendBattles`: the four numbers in friend_battles_defaults() (the admin's row keeps its own).
-- 2. pvp_tickets (one row per player) and pvp_ticket_balance(user): the row, made the first time (a new player starts
--    at the cap), with the midnights since its last look given, then the balance. pvp_ticket_status(user) for the game:
--    the balance, the cap, and the next midnight.
-- 3. pvp_challenge and pvp_answer refuse a player without a ticket (pvp_no_ticket, pvp_friend_no_ticket);
--    pvp_set_order takes one from each as the fight starts; pvp_home says how many you hold; pvp_tickets() alone.
-- 4. friend_market_buy (0107's) sells 'battle-ticket' while Friend Battles is open to the buyer: paid in Heart Scales,
--    the week's limit counted as the other items', the tickets credited at once (no gift to open).
--
-- Run after 0131; safe to run again.
begin;

-- ---------------------------------------------------------------- 1. the numbers

create or replace function friend_battles_defaults()
returns jsonb
language sql immutable as $$
  select '{
    "access": "off", "expiry": 120, "pick": 30, "order": 20, "turn": 45, "grace": 90, "shield": 50,
    "classic": true, "draft": true, "ticketDaily": 1, "ticketCap": 3, "ticketPrice": 10, "ticketWeekly": 10
  }'::jsonb
$$;

create or replace function pvp_num(p_key text, p_default int)
returns int
language sql stable security definer set search_path = public as $$
  select case when friend_battles_cfg() ->> p_key ~ '^[0-9]{1,5}$' then (friend_battles_cfg() ->> p_key)::int else p_default end
$$;

-- ---------------------------------------------------------------- 2. the tickets

create table if not exists pvp_tickets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  day date not null                          -- the last UTC day its midnights were given
);
alter table pvp_tickets enable row level security;
revoke all on pvp_tickets from anon, authenticated;
drop policy if exists pvp_tickets_admin on pvp_tickets;
create policy pvp_tickets_admin on pvp_tickets for all using ((select is_admin())) with check ((select is_admin()));

-- A player's tickets now: a new player starts at the cap; each midnight since the last look gives `ticketDaily` while
-- under the cap (never past it; bought ones above it stay).
create or replace function pvp_ticket_balance(p_user uuid)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  d date := (now() at time zone 'UTC')::date;
  cap int := greatest(0, pvp_num('ticketCap', 3));
  daily int := greatest(0, pvp_num('ticketDaily', 1));
  t pvp_tickets;
begin
  if p_user is null then return 0; end if;
  insert into pvp_tickets (user_id, balance, day) values (p_user, cap, d) on conflict (user_id) do nothing;
  select * into t from pvp_tickets x where x.user_id = p_user for update;
  if t.day < d then
    if t.balance < cap then
      t.balance := least(cap, t.balance + (d - t.day) * daily);
    end if;
    update pvp_tickets x set balance = t.balance, day = d where x.user_id = p_user;
  end if;
  return t.balance;
end
$$;

create or replace function pvp_ticket_status(p_user uuid)
returns jsonb
language sql volatile security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', pvp_ticket_balance(p_user),
    'cap', greatest(0, pvp_num('ticketCap', 3)),
    'daily', greatest(0, pvp_num('ticketDaily', 1)),
    'nextAt', pvp_ms((((now() at time zone 'UTC')::date + 1)::timestamp) at time zone 'UTC')
  )
$$;

-- The game's own question (the Friend Market's card, the page): the caller's tickets.
create or replace function pvp_tickets()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or not friend_battles_open() then return null; end if;
  return pvp_ticket_status(auth.uid());
end
$$;

-- ---------------------------------------------------------------- 3. the challenge, the answer, the start, the page

create or replace function pvp_challenge(p_friend uuid, p_mode text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := friend_battles_cfg();
  m pvp_matches;
begin
  if me is null then raise exception 'pvp_signed_out'; end if;
  if not friend_battles_open() then raise exception 'pvp_off'; end if;
  if p_mode not in ('classic', 'draft') or coalesce((cfg ->> p_mode)::boolean, true) = false then
    raise exception 'pvp_mode_off';
  end if;
  if p_friend is null or p_friend = me or not pvp_friends(me, p_friend) then raise exception 'pvp_not_friends'; end if;
  if pvp_busy(me) then raise exception 'pvp_busy'; end if;
  if pvp_busy(p_friend) then raise exception 'pvp_friend_busy'; end if;
  if coalesce(pvp_online_at(p_friend), '-infinity') < now() - interval '2 minutes' then raise exception 'pvp_offline'; end if;
  if p_mode = 'classic' then
    if pvp_versus_team(me) is null then raise exception 'pvp_no_team'; end if;
    if pvp_versus_team(p_friend) is null then raise exception 'pvp_friend_no_team'; end if;
  else
    if jsonb_array_length(pvp_candidates(me)) < 3 then raise exception 'pvp_no_team'; end if;
    if jsonb_array_length(pvp_candidates(p_friend)) < 3 then raise exception 'pvp_friend_no_team'; end if;
  end if;
  -- A fight costs each a battle ticket (taken as it starts): both must hold one now.
  if pvp_ticket_balance(me) < 1 then raise exception 'pvp_no_ticket'; end if;
  if pvp_ticket_balance(p_friend) < 1 then raise exception 'pvp_friend_no_ticket'; end if;
  insert into pvp_matches (a, b, mode, deadline, seen_a)
    values (me, p_friend, p_mode, now() + pvp_secs('expiry'), now())
  returning * into m;
  perform pvp_send('pvp-inbox:' || p_friend, 'challenge', jsonb_build_object('id', m.id, 'mode', m.mode));
  return pvp_public(m, 'a');
end
$$;

create or replace function pvp_answer(p_match bigint, p_accept boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  ta jsonb;
  tb jsonb;
begin
  select * into r from pvp_mine(p_match);
  m := r.m;
  if r.side <> 'b' then raise exception 'pvp_not_yours'; end if;
  if m.state = 'expired' then raise exception 'pvp_expired'; end if;
  if m.state <> 'invited' then raise exception 'pvp_gone'; end if;
  if not p_accept then
    update pvp_matches x set state = 'declined', ended_at = now() where x.id = p_match returning * into m;
    perform pvp_notify(m);
    return pvp_public(m, 'b');
  end if;
  if exists (select 1 from pvp_matches x where (x.a = m.b or x.b = m.b) and x.id <> m.id and x.state in ('draft', 'order', 'battle')) then
    raise exception 'pvp_busy';
  end if;
  if pvp_ticket_balance(m.b) < 1 then raise exception 'pvp_no_ticket'; end if;
  if pvp_ticket_balance(m.a) < 1 then raise exception 'pvp_friend_no_ticket'; end if;
  if m.mode = 'classic' then
    ta := pvp_versus_team(m.a);
    tb := pvp_versus_team(m.b);
    if ta is null then raise exception 'pvp_friend_no_team'; end if;
    if tb is null then raise exception 'pvp_no_team'; end if;
    update pvp_matches x
       set state = 'order', team_a = ta, team_b = tb, deadline = now() + pvp_secs('order'), seen_b = now()
     where x.id = p_match returning * into m;
  else
    ta := pvp_candidates(m.a);
    tb := pvp_candidates(m.b);
    if jsonb_array_length(ta) < 3 then raise exception 'pvp_friend_no_team'; end if;
    if jsonb_array_length(tb) < 3 then raise exception 'pvp_no_team'; end if;
    -- The coin, tossed here; the games give it 4 seconds on screen before the first pick's time runs.
    update pvp_matches x
       set state = 'draft', cand_a = ta, cand_b = tb, first_picker = case when random() < 0.5 then 'a' else 'b' end,
           deadline = now() + pvp_secs('pick') + interval '4 seconds', seen_b = now()
     where x.id = p_match returning * into m;
  end if;
  -- Any other challenge to either of them is off.
  update pvp_matches x set state = 'cancelled', ended_at = now()
   where x.id <> m.id and x.state = 'invited' and (x.a in (m.a, m.b) or x.b in (m.a, m.b));
  perform pvp_notify(m);
  return pvp_public(m, 'b');
end
$$;

create or replace function pvp_set_order(p_id bigint, p_side text, p_order int[])
returns pvp_matches
language plpgsql volatile security definer set search_path = public as $$
declare
  m pvp_matches;
  team jsonb;
  n int;
begin
  select * into m from pvp_matches x where x.id = p_id for update;
  team := case when p_side = 'a' then m.team_a else m.team_b end;
  n := jsonb_array_length(team);
  if p_order is not null then
    if coalesce(array_length(p_order, 1), 0) <> n
       or (select count(distinct x) from unnest(p_order) x where x between 0 and n - 1) <> n then
      raise exception 'pvp_bad_order';
    end if;
    team := (select jsonb_agg(team -> x order by o) from unnest(p_order) with ordinality t(x, o));
  end if;
  if p_side = 'a' then
    update pvp_matches x set team_a = team, ready_a = true where x.id = p_id returning * into m;
  else
    update pvp_matches x set team_b = team, ready_b = true where x.id = p_id returning * into m;
  end if;
  if m.ready_a and m.ready_b then
    -- The fight starts: a battle ticket from each. One of them without (it can't happen through the game: one match
    -- at a time, checked at the challenge and the answer): the match is void, nobody pays.
    if pvp_ticket_balance(m.a) < 1 or pvp_ticket_balance(m.b) < 1 then
      perform pvp_settle(p_id, null, 'no_ticket', true);
      select * into m from pvp_matches x where x.id = p_id;
      return m;
    end if;
    update pvp_tickets t set balance = t.balance - 1 where t.user_id in (m.a, m.b);
    update pvp_matches x set state = 'battle', seq = 0, started_at = now(), deadline = now() + pvp_secs('turn')
     where x.id = p_id returning * into m;
  end if;
  return m;
end
$$;

create or replace function pvp_home()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cur pvp_matches;
begin
  if me is null or not friend_battles_open() then return null; end if;
  update pvp_matches x set state = 'expired', ended_at = now()
   where x.state = 'invited' and x.deadline < now() and (x.a = me or x.b = me);
  select * into cur from pvp_matches x
   where (x.a = me or x.b = me) and x.state in ('invited', 'draft', 'order', 'battle')
   order by x.created_at desc limit 1;
  return jsonb_build_object(
    'tickets', pvp_ticket_status(me),
    'current', case when cur.id is not null then pvp_public(cur, case when cur.a = me then 'a' else 'b' end) end,
    'records', coalesce((
      select jsonb_agg(pvp_who(case when r.user_a = me then r.user_b else r.user_a end) || jsonb_build_object(
        'wins', case when r.user_a = me then r.wins_a else r.wins_b end,
        'losses', case when r.user_a = me then r.wins_b else r.wins_a end,
        'draws', r.draws) order by r.last_at desc)
      from pvp_records r where r.user_a = me or r.user_b = me
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h.j order by h.at desc) from (
        select x.ended_at at, jsonb_build_object(
          'id', x.id, 'mode', x.mode, 'at', pvp_ms(x.ended_at), 'reason', x.reason,
          'foe', pvp_who(case when x.a = me then x.b else x.a end),
          'result', case when x.winner = 'draw' then 'draw'
                         when x.winner = (case when x.a = me then 'a' else 'b' end) then 'win' else 'loss' end) j
        from pvp_matches x
        where (x.a = me or x.b = me) and x.state = 'done'
        order by x.ended_at desc limit 20
      ) h
    ), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------- 4. the Friend Market sells them

-- 0107's, with battle tickets: paid and limited as the other items, credited at once, nothing to open.
create or replace function friend_market_buy(p_key text, p_qty int default 1)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := friendship_week();
  cfg jsonb := friendship_cfg();
  offer jsonb;
  price int;
  lim int;
  had int;
  cost int;
  dex int;
  lvl int;
  gifts jsonb;
  w friendship_wallets;
  bid uuid;
  ticket boolean := p_key = 'battle-ticket';
  held int;
begin
  if me is null then
    raise exception 'friendship_signed_out' using errcode = '42501';
  end if;
  if not friendship_open() then
    raise exception 'friendship_off' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'friendship_bad_qty' using errcode = '22023';
  end if;
  if ticket then
    if not friend_battles_open() then
      raise exception 'friendship_not_sold' using errcode = 'P0001';
    end if;
    offer := jsonb_build_object('price', pvp_num('ticketPrice', 10));
    lim := pvp_num('ticketWeekly', 10);
    gifts := '[]'::jsonb;
  elsif p_key = 'shiny' then
    dex := friendship_shiny(wk);
    if dex is null then
      raise exception 'friendship_not_sold' using errcode = 'P0001';
    end if;
    offer := cfg -> 'shiny';
    lim := 1;
    lvl := case when offer ->> 'level' ~ '^[0-9]{1,3}$' then greatest(1, least(100, (offer ->> 'level')::int)) else 15 end;
    gifts := jsonb_build_array(jsonb_build_object('kind', 'pokemon', 'dex', dex, 'level', lvl, 'shiny', true, 'region', 'latest'));
  else
    select e into offer from jsonb_array_elements(case when jsonb_typeof(cfg -> 'market') = 'array' then cfg -> 'market' else '[]'::jsonb end) e
      where e ->> 'key' = p_key limit 1;
    if offer is null then
      raise exception 'friendship_not_sold' using errcode = 'P0001';
    end if;
    lim := case when offer ->> 'limit' ~ '^[0-9]{1,2}$' then (offer ->> 'limit')::int else 0 end;
    gifts := jsonb_build_array(jsonb_build_object('kind', 'item', 'key', p_key, 'qty', p_qty, 'region', 'latest'));
  end if;
  price := case when offer ->> 'price' ~ '^[0-9]{1,5}$' then (offer ->> 'price')::int else null end;
  if price is null or price < 1 then
    raise exception 'friendship_not_sold' using errcode = 'P0001';
  end if;
  -- One purchase at a time per player: the wallet's lock.
  insert into friendship_wallets (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from friendship_wallets x where x.user_id = me for update;
  select coalesce(sum(b.qty), 0) into had from friend_market_buys b where b.user_id = me and b.week = wk and b.key = p_key;
  if had + p_qty > lim then
    raise exception 'friendship_limit' using errcode = 'P0001';
  end if;
  cost := price * p_qty;
  if w.balance < cost then
    raise exception 'friendship_too_poor' using errcode = 'P0001';
  end if;
  update friendship_wallets x set balance = x.balance - cost where x.user_id = me;
  if ticket then
    -- Credited at once, past the cap if it must: nothing for the game to put away.
    perform pvp_ticket_balance(me);
    update pvp_tickets t set balance = t.balance + p_qty where t.user_id = me returning t.balance into held;
    insert into friend_market_buys (user_id, week, key, qty, cost, gifts, applied) values (me, wk, p_key, p_qty, cost, gifts, true)
      returning friend_market_buys.id into bid;
    return jsonb_build_object('id', bid, 'key', p_key, 'gifts', gifts, 'balance', w.balance - cost, 'tickets', held);
  end if;
  insert into friend_market_buys (user_id, week, key, qty, cost, gifts) values (me, wk, p_key, p_qty, cost, gifts)
    returning friend_market_buys.id into bid;
  return jsonb_build_object('id', bid, 'key', p_key, 'gifts', gifts, 'balance', w.balance - cost);
end
$$;

-- ---------------------------------------------------------------- grants

revoke all on function pvp_num(text, int), pvp_ticket_balance(uuid), pvp_ticket_status(uuid) from public, anon, authenticated;
revoke all on function pvp_tickets(), pvp_challenge(uuid, text), pvp_answer(bigint, boolean), pvp_home(),
  friend_market_buy(text, int) from public, anon;
grant execute on function pvp_tickets(), pvp_challenge(uuid, text), pvp_answer(bigint, boolean), pvp_home(),
  friend_market_buy(text, int) to authenticated;
revoke all on function pvp_set_order(bigint, text, int[]) from public, anon, authenticated;

commit;
