-- Friendship streaks and the Friend Market (docs/59). Two friends who interact on a UTC day keep a streak going: a
-- raid fought beside the other's team (either way round), a trade between them, or an Egg the Day Care made with the
-- other's Pokémon. Each new day of a streak pays both of them Heart Scales, more the longer it runs (3 a day on days
-- 1–3, 4 on 4–7, 5 on 8–14, 6 on 15–30, 7 from day 31), at most 50 a player a UTC day across every friend. A day with
-- no interaction ends the streak. The coins buy from the Friend Market, a weekly shop (Monday 00:00 UTC): Friend Balls,
-- Rare Candies, Talent Candies and one shiny Pokémon of the week, each with its weekly limit.
--
-- 1. game_config `friendship`: the switch (Off / On for admin / On for everyone, Off by default: docs/15 §20) and its
--    numbers, inserted only if missing. friendship_cfg() lays the admin's row over the game's defaults
--    (engine/defaults.ts; tests/friendship-sql.test.ts keeps the two the same).
-- 2. friendship_streaks (one row per pair, the smaller id first, as friendships), friendship_wallets (the coins, and
--    what was earned on the wallet's day), friendship_log (who paid what, kept 8 days: the Friends page's "today").
-- 3. friendship_touch(): the one place a streak moves and coins are paid. Called by
--    - the trade trigger (a listing taken between two friends),
--    - friendship_raid(p_helpers, p_key): the raider, after a raid fight beside friends' teams (won or lost),
--    - friendship_egg(p_friend): the game, after the Day Care made an Egg with a friend's Pokémon (the Day Care runs in
--      the game; the server checks the two are friends and the friend has a Pokémon at their Day Care).
-- 4. friendship_status(): the caller's wallet, streaks, today and this week's purchases; null while the switch is off
--    for them. friend_market_buy(): a purchase, priced and limited by the server, handed back as gifts the game puts
--    in its save (engine/gifts.ts); friend_market_applied(): the game has them. A purchase not marked applied comes
--    back in the status until it is (a tab closed mid-way loses nothing; the save remembers the ids it applied).
-- 5. Removing a friend ends your streak; Delete my data (the main save) takes the wallet and the purchases.
-- 6. The Friend Ball in items, as src/data/items.json has it: +3 on the catch die as an Ultra Ball, and more chances
--    of the hidden talent on its catch by the player's best streak (the game's: engine/friendship.ts friendBallTalent).
--
-- Run after 0104; safe to run again.
begin;

-- ---------------------------------------------------------------- 1. the switch and the numbers

insert into game_config (key, value) values ('friendship', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

create or replace function friendship_defaults()
returns jsonb
language sql immutable as $$
  select '{
    "access": "off",
    "tiers": [
      {"from": 1, "coins": 3}, {"from": 4, "coins": 4}, {"from": 8, "coins": 5}, {"from": 15, "coins": 6},
      {"from": 31, "coins": 7}
    ],
    "dailyCap": 50,
    "market": [
      {"key": "friend-ball", "price": 5, "limit": 20},
      {"key": "rare-candy", "price": 15, "limit": 10},
      {"key": "talent-candy", "price": 60, "limit": 2}
    ],
    "shiny": {"price": 150, "level": 15, "pool": [175, 133, 172, 173, 174, 447, 440, 446, 427, 298, 433, 527]},
    "ballBoost": [1, 2, 3, 4, 5]
  }'::jsonb
$$;

create or replace function friendship_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select friendship_defaults()
  || coalesce((select value from game_config where key = 'friendship' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

create or replace function friendship_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(friendship_cfg() ->> 'access', 'off') = 'all'
      or (friendship_cfg() ->> 'access' = 'admin' and is_admin())
$$;

create or replace function friendship_day()
returns date
language sql stable as $$ select (now() at time zone 'UTC')::date $$;

-- The market's week: its Monday.
create or replace function friendship_week(p_day date default null)
returns date
language sql stable as $$
  select d - (extract(isodow from d)::int - 1) from (select coalesce(p_day, friendship_day()) d) s
$$;

-- What a streak's day pays: the tier with the highest `from` it has reached (engine/friendship.ts streakCoins).
create or replace function friendship_coins_for(p_streak int)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select greatest(0, least(99, (t ->> 'coins')::int))
    from jsonb_array_elements(case when jsonb_typeof(friendship_cfg() -> 'tiers') = 'array'
                                   then friendship_cfg() -> 'tiers' else '[]'::jsonb end) t
    where t ->> 'from' ~ '^[0-9]{1,4}$' and t ->> 'coins' ~ '^[0-9]{1,2}$' and (t ->> 'from')::int <= p_streak
    order by (t ->> 'from')::int desc
    limit 1
  ), 0)
$$;

create or replace function friendship_cap()
returns int
language sql stable security definer set search_path = public as $$
  select case when friendship_cfg() ->> 'dailyCap' ~ '^[0-9]{1,4}$' then (friendship_cfg() ->> 'dailyCap')::int else 50 end
$$;

-- The shiny of the week: the pool's entry for the week's number (weeks counted from Monday 5 January 1970).
create or replace function friendship_shiny(p_week date default null)
returns int
language sql stable security definer set search_path = public as $$
  select (p -> ((((coalesce(p_week, friendship_week()) - date '1970-01-05') / 7) % jsonb_array_length(p))::int)) ::int
  from (select friendship_cfg() -> 'shiny' -> 'pool' p) s
  where jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0
$$;

-- ---------------------------------------------------------------- 2. the tables

create table if not exists friendship_streaks (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  streak int not null default 0,
  best int not null default 0,
  last_day date not null,
  last_kind text not null check (last_kind in ('raid', 'trade', 'egg')),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendship_streaks_b on friendship_streaks (user_b);

create table if not exists friendship_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  day date not null default (now() at time zone 'UTC')::date,
  earned int not null default 0,          -- earned on `day`: the daily cap counts it
  total int not null default 0             -- earned ever
);

create table if not exists friendship_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  friend uuid not null,
  day date not null,
  kind text not null,
  streak int not null,
  coins int not null,                      -- 0 once the day's cap is reached
  at timestamptz not null default now()
);
create index if not exists friendship_log_user on friendship_log (user_id, day);

create table if not exists friend_market_buys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  key text not null,                       -- an item's key, or 'shiny'
  qty int not null check (qty between 1 and 99),
  cost int not null,
  gifts jsonb not null,
  applied boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists friend_market_buys_user on friend_market_buys (user_id, week);

alter table friendship_streaks enable row level security;
alter table friendship_wallets enable row level security;
alter table friendship_log enable row level security;
alter table friend_market_buys enable row level security;
revoke all on friendship_streaks, friendship_wallets, friendship_log, friend_market_buys from anon, authenticated;
drop policy if exists friendship_streaks_admin on friendship_streaks;
create policy friendship_streaks_admin on friendship_streaks for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friendship_wallets_admin on friendship_wallets;
create policy friendship_wallets_admin on friendship_wallets for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friendship_log_admin on friendship_log;
create policy friendship_log_admin on friendship_log for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friend_market_buys_admin on friend_market_buys;
create policy friend_market_buys_admin on friend_market_buys for all using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- 3. a streak moves

-- Pays one player for one friend's streak day, within the day's cap. Returns what was paid.
create or replace function friendship_pay(p_user uuid, p_friend uuid, p_kind text, p_streak int)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  d date := friendship_day();
  w friendship_wallets;
  pay int;
begin
  insert into friendship_wallets (user_id, day) values (p_user, d) on conflict (user_id) do nothing;
  select * into w from friendship_wallets x where x.user_id = p_user for update;
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

-- Two players interacted: if they are friends and it's the pair's first interaction of the UTC day, the streak goes on
-- (or starts again at 1 after a day without one) and both are paid. Returns the streak, or 0 when nothing moved (not
-- friends, the switch off, or already counted today). Gated as the switch reads for whoever called: the admin's
-- try-out counts the admin's own interactions.
create or replace function friendship_touch(p_one uuid, p_two uuid, p_kind text)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  a uuid := least(p_one, p_two);
  b uuid := greatest(p_one, p_two);
  d date := friendship_day();
  s friendship_streaks;
  n int;
begin
  if a is null or b is null or a = b or p_kind not in ('raid', 'trade', 'egg') or not friendship_open() then
    return 0;
  end if;
  if not exists (select 1 from friendships f where f.user_a = a and f.user_b = b) then
    return 0;
  end if;
  insert into friendship_streaks (user_a, user_b, streak, best, last_day, last_kind)
    values (a, b, 0, 0, d - 2, p_kind) on conflict (user_a, user_b) do nothing;
  select * into s from friendship_streaks x where x.user_a = a and x.user_b = b for update;
  if s.last_day >= d then
    return 0;
  end if;
  n := case when s.last_day = d - 1 then s.streak + 1 else 1 end;
  update friendship_streaks x set streak = n, best = greatest(x.best, n), last_day = d, last_kind = p_kind
    where x.user_a = a and x.user_b = b;
  perform friendship_pay(a, b, p_kind, n);
  perform friendship_pay(b, a, p_kind, n);
  return n;
end
$$;

-- A listing taken between two friends is a trade between them.
create or replace function trade_listings_friendship()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform friendship_touch(new.owner, new.taker, 'trade');
  exception when others then
    -- The trade goes through either way.
    raise warning 'friendship trade %: %', new.id, sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists trade_listings_friendship on trade_listings;
create trigger trade_listings_friendship after update of status on trade_listings
  for each row when (new.status = 'taken' and old.status is distinct from 'taken' and new.owner is not null and new.taker is not null)
  execute function trade_listings_friendship();

-- The raider fought a raid beside friends' teams (won or lost): each friend whose team was there counts, the day's
-- raid's team (p_key null) or the one left on that progression raid. Returns how many streaks moved.
create or replace function friendship_raid(p_helpers uuid[], p_key text default null, p_realm text default 'main')
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  helper uuid;
  moved int := 0;
begin
  if me is null then
    raise exception 'friendship_signed_out' using errcode = '42501';
  end if;
  if not friendship_open() then
    return 0;
  end if;
  for helper in select distinct h from unnest(coalesce(p_helpers, '{}')) h limit 6 loop
    continue when helper is null or helper = me;
    continue when p_key is null and not exists (select 1 from raid_teams t where t.user_id = helper and t.realm = p_realm);
    continue when p_key is not null and not exists (
      select 1 from raid_progress_teams t where t.user_id = helper and t.realm = p_realm and t.raid_key = p_key);
    if friendship_touch(me, helper, 'raid') > 0 then
      moved := moved + 1;
    end if;
  end loop;
  return moved;
end
$$;

-- The Day Care made an Egg with a friend's Pokémon: they count while that friend has a Pokémon at their Day Care (the
-- one visiting comes from there). Returns the streak, 0 when nothing moved.
create or replace function friendship_egg(p_friend uuid)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'friendship_signed_out' using errcode = '42501';
  end if;
  if not exists (select 1 from player_cards c where c.user_id = p_friend and jsonb_array_length(c.day_care) > 0) then
    return 0;
  end if;
  return friendship_touch(me, p_friend, 'egg');
end
$$;

-- ---------------------------------------------------------------- 4. the status and the market

create or replace function friendship_status()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or not friendship_open() then null else jsonb_build_object(
    'day', friendship_day(),
    'week', friendship_week(),
    'shiny', friendship_shiny(),
    'balance', coalesce((select w.balance from friendship_wallets w where w.user_id = auth.uid()), 0),
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

-- A purchase: `p_key` is a market item's key or 'shiny', `p_qty` how many. Priced and limited here, paid from the
-- wallet, kept unapplied until the game says it has the gifts. Errors: friendship_off, friendship_not_sold,
-- friendship_limit, friendship_too_poor.
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
  if p_key = 'shiny' then
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
  insert into friend_market_buys (user_id, week, key, qty, cost, gifts) values (me, wk, p_key, p_qty, cost, gifts)
    returning friend_market_buys.id into bid;
  return jsonb_build_object('id', bid, 'key', p_key, 'gifts', gifts, 'balance', w.balance - cost);
end
$$;

-- The game has put these purchases in its save.
create or replace function friend_market_applied(p_ids uuid[])
returns void
language sql volatile security definer set search_path = public as $$
  update friend_market_buys b set applied = true where b.user_id = auth.uid() and b.id = any(coalesce(p_ids, '{}'))
$$;

-- ---------------------------------------------------------------- 5. friends removed, data deleted

create or replace function friendships_streak_gone()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendship_streaks s where s.user_a = old.user_a and s.user_b = old.user_b;
  return null;
end
$$;
drop trigger if exists friendships_streak_gone on friendships;
create trigger friendships_streak_gone after delete on friendships for each row execute function friendships_streak_gone();

create or replace function saves_friendship_gone()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendship_wallets where user_id = old.user_id;
  delete from friendship_log where user_id = old.user_id;
  delete from friend_market_buys where user_id = old.user_id;
  return null;
end
$$;
drop trigger if exists saves_friendship_gone on saves;
create trigger saves_friendship_gone after delete on saves
  for each row when (old.realm = 'main') execute function saves_friendship_gone();

-- ---------------------------------------------------------------- 6. the Friend Ball

insert into items (key, name, description, sprite_url, price, effect, in_shop, shop_badges) values
  ('friend-ball', 'Friend Ball', 'More chances to discover hidden talents on catch depending on your best streak, current: ×{x}.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/friend-ball.png', 100,
   '{"kind":"ball","bonus":3,"talentBoost":true}'::jsonb, false, 0)
on conflict (key) do update set description = excluded.description, effect = excluded.effect;

-- ---------------------------------------------------------------- who may call what

revoke all on function friendship_defaults() from public, anon, authenticated;
revoke all on function friendship_cfg() from public, anon, authenticated;
revoke all on function friendship_open() from public, anon, authenticated;
revoke all on function friendship_coins_for(int) from public, anon, authenticated;
revoke all on function friendship_cap() from public, anon, authenticated;
revoke all on function friendship_shiny(date) from public, anon, authenticated;
revoke all on function friendship_pay(uuid, uuid, text, int) from public, anon, authenticated;
revoke all on function friendship_touch(uuid, uuid, text) from public, anon, authenticated;
revoke all on function trade_listings_friendship() from public, anon, authenticated;
revoke all on function friendships_streak_gone() from public, anon, authenticated;
revoke all on function saves_friendship_gone() from public, anon, authenticated;
revoke all on function friendship_raid(uuid[], text, text) from public, anon;
revoke all on function friendship_egg(uuid) from public, anon;
revoke all on function friendship_status() from public, anon;
revoke all on function friend_market_buy(text, int) from public, anon;
revoke all on function friend_market_applied(uuid[]) from public, anon;
grant execute on function friendship_raid(uuid[], text, text), friendship_egg(uuid), friendship_status(),
  friend_market_buy(text, int), friend_market_applied(uuid[]) to authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
