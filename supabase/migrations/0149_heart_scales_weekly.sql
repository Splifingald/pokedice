-- Heart Scales last a week (docs/60, the user's call, 2026-11-16): the wallet empties when the Friend Market's week turns
-- over, Monday 00:00 UTC, as its limits do. What's earned or given during a week is spent that week or lost.
--
-- 1. friendship_wallets.week: the week (its Monday) the balance belongs to. Wallets there already take this week, so
--    nobody loses what they hold the day this runs; they empty next Monday.
-- 2. friendship_wallet_lock(user): the one way to a wallet that pays or charges. It makes it, empties it when its week is
--    over, and locks it. friendship_pay (a streak, 0107), friend_market_buy (0132's, battle tickets kept) go through it.
-- 3. feedback_claim_gifts (0121's): Heart Scales given by a message land in this week's wallet, an older one emptied
--    first.
-- 4. friendship_status (0107's): a wallet from an earlier week reads 0, before anything has emptied it.
-- Not the total earned (ever) nor the daily cap's count: only the balance.
--
-- Run after 0107, 0121 and 0132; safe to run again.
begin;

-- ---------------------------------------------------------------- 1. the wallet's week

alter table friendship_wallets add column if not exists week date not null default friendship_week();

-- ---------------------------------------------------------------- 2. the lock

create or replace function friendship_wallet_lock(p_user uuid)
returns friendship_wallets
language plpgsql volatile security definer set search_path = public as $$
declare
  wk date := friendship_week();
  w friendship_wallets;
begin
  insert into friendship_wallets (user_id, week) values (p_user, wk) on conflict (user_id) do nothing;
  update friendship_wallets x set balance = 0, week = wk where x.user_id = p_user and x.week < wk;
  select * into w from friendship_wallets x where x.user_id = p_user for update;
  return w;
end
$$;
revoke all on function friendship_wallet_lock(uuid) from public, anon, authenticated;

-- 0107's, through the lock.
create or replace function friendship_pay(p_user uuid, p_friend uuid, p_kind text, p_streak int)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  d date := friendship_day();
  w friendship_wallets;
  pay int;
begin
  w := friendship_wallet_lock(p_user);
  if w.day <> d then
    w.earned := 0;
  end if;
  pay := greatest(0, least(friendship_coins_for(p_streak), friendship_cap() - w.earned));
  update friendship_wallets x
    set balance = x.balance + pay, day = d, earned = w.earned + pay, total = x.total + pay
    where x.user_id = p_user;
  delete from friendship_log l where l.user_id = p_user and l.day < d - 7;
  insert into friendship_log (user_id, friend, day, kind, streak, coins) values (p_user, p_friend, d, p_kind, p_streak, pay);
  return pay;
end
$$;

-- 0132's, through the lock.
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
  -- One purchase at a time per player: the wallet's lock, last week's Heart Scales gone.
  w := friendship_wallet_lock(me);
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

-- ---------------------------------------------------------------- 3. a message's Heart Scales

-- 0121's: they go into this week's wallet, one from an earlier week emptied first.
create or replace function feedback_claim_gifts(p_ids bigint[], p_device_id text)
returns table (id bigint, gifts jsonb)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not gifts_open() then
    raise exception 'gifts_off' using errcode = 'P0001';
  end if;
  return query
    with claimed as (
      update feedback f
      set gifts_claimed_at = now()
      where f.id = any(p_ids)
        and f.gifts is not null
        and f.gifts_claimed_at is null
        and (
          (auth.uid() is not null and f.user_id = auth.uid())
          or (f.user_id is null and f.device_id = p_device_id)
        )
      returning f.id, f.gifts, f.user_id
    ), paid as (
      insert into friendship_wallets as w (user_id, balance, week)
      select c.user_id, sum((g ->> 'amount')::int), friendship_week()
      from claimed c cross join lateral jsonb_array_elements(c.gifts) g
      where c.user_id is not null and g ->> 'kind' = 'heartScales'
      group by c.user_id
      on conflict (user_id) do update
        set balance = case when w.week < excluded.week then 0 else w.balance end + excluded.balance,
            week = greatest(w.week, excluded.week)
    )
    select c.id, c.gifts from claimed c;
end
$$;

revoke all on function feedback_claim_gifts(bigint[], text) from public;
grant execute on function feedback_claim_gifts(bigint[], text) to anon, authenticated;

-- ---------------------------------------------------------------- 4. the status

-- 0107's: a wallet from an earlier week holds nothing.
create or replace function friendship_status()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or not friendship_open() then null else jsonb_build_object(
    'day', friendship_day(),
    'week', friendship_week(),
    'shiny', friendship_shiny(),
    'balance', coalesce((select w.balance from friendship_wallets w where w.user_id = auth.uid() and w.week >= friendship_week()), 0),
    'earned', coalesce((select w.earned from friendship_wallets w where w.user_id = auth.uid() and w.day = friendship_day()), 0),
    'total', coalesce((select w.total from friendship_wallets w where w.user_id = auth.uid()), 0),
    'streaks', coalesce((
      select jsonb_agg(jsonb_build_object('friend', f.id, 'streak', s.streak, 'best', s.best, 'lastDay', s.last_day,
                                          'lastKind', s.last_kind) order by s.streak desc)
      from friend_ids_of(auth.uid()) f
      join friendship_streaks s on s.user_a = least(auth.uid(), f.id) and s.user_b = greatest(auth.uid(), f.id)
      where s.streak > 0
    ), '[]'::jsonb),
    'today', coalesce((
      select jsonb_agg(jsonb_build_object('friend', l.friend, 'kind', l.kind, 'streak', l.streak, 'coins', l.coins) order by l.at)
      from friendship_log l where l.user_id = auth.uid() and l.day = friendship_day()
    ), '[]'::jsonb),
    'bought', coalesce((
      select jsonb_object_agg(k.key, k.qty) from (
        select b.key, sum(b.qty)::int qty from friend_market_buys b
        where b.user_id = auth.uid() and b.week = friendship_week() group by b.key
      ) k
    ), '{}'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'key', b.key, 'gifts', b.gifts) order by b.at)
      from friend_market_buys b where b.user_id = auth.uid() and not b.applied
    ), '[]'::jsonb)
  ) end
$$;

commit;
