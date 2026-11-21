-- Version 2.9.9's database changes in one go: migrations 0149 to 0152, in order, in one transaction (all or nothing).
-- Supabase → the pokedice project → SQL Editor → New query → paste all of this → Run. Each migration is safe to run
-- again, so this file is too (a database that already took some of them, as the earlier steps asked, is fine). The
-- migrations stay the source (supabase/migrations/); this file only strings them together, each one's own
-- begin/commit taken out so the whole runs as one transaction. Every new feature in it arrives Off (Admin → its switch):
-- 0149 Heart Scales last a week; 0150 Snowglobe Valley's starters and their evolution items; 0151 no Pokémon met below
-- the level it is reached at; 0152 a small world's starting gift (switch: Config → Starting gift (small worlds)).
-- Run after Version 2.9's file (0108–0135) and 0136–0148, and after 0122 (Snowglobe Valley's content).
begin;

-- ======================================================================== ↓ supabase/migrations/0149_heart_scales_weekly.sql
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

-- ======================================================================== ↓ supabase/migrations/0150_snowglobe_starters.sql
-- Snowglobe Valley's starters and their evolution items (docs/64 §1, §2.2, the user's calls of 2026-11-21).
--
-- Starters: Alolan Sandshrew, Sneasel and Alolan Vulpix in place of Mareep, Lillipup and Pikipek, all three wild on
-- Snowy Trail and Pinewood Forest, so the two not picked can be caught from the start.
-- Their evolution items are never sold and never found before Lv.20; they are found three at a time, easily: 3 Ice
-- Stones and 3 Razor Claws in Toy Workshop (Lv.20–26), 3 Ice Stones in Icicle Cave (Lv.25–32). Each of those areas
-- deals two item cards a round over a loot deck of its once-only finds alone, so its first round gives them all.
--
-- 0122, generated before, stays as it ran; this changes only that, so the admin's other edits to the world stay.
-- 1. The region's starters, and the world's `starters` and Mart (no Ice Stone, no Razor Claw) in `smallWorlds`.
-- 2. Snowy Trail and Pinewood Forest: the new wild rows (the script's ids).
-- 3. Toy Workshop and Icicle Cave: 4 wild cards and 2 item cards; their loot, only the finds. Holly Village: no Ice
--    Stone. Each step only where its area is on the database.
-- 4. The content version, so players load it.
--
-- Run after 0122; safe to run again (run it again after a re-run of 0122).

-- 1.
update regions set starters = '[10101,215,10103]'::jsonb where id = 'world-snowglobe-valley';

update game_config set value = jsonb_set(
  value,
  '{list}',
  (select jsonb_agg(
     case when w ->> 'id' = 'snowglobe-valley-2026' then
       jsonb_set(
         jsonb_set(w, '{starters}', '[10101,215,10103]'::jsonb),
         '{shop}',
         coalesce(
           (select jsonb_agg(r order by j) from jsonb_array_elements(coalesce(w -> 'shop', '[]'::jsonb)) with ordinality as y(r, j)
            where r ->> 'key' not in ('ice-stone', 'razor-claw')),
           '[]'::jsonb))
     else w end
     order by i)
   from jsonb_array_elements(value -> 'list') with ordinality as x(w, i))
) where key = 'smallWorlds' and jsonb_typeof(value -> 'list') = 'array' and jsonb_array_length(value -> 'list') > 0;

-- 2.
insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select v.id::uuid, v.area_id::uuid, v.dex, v.weight, v.min_level, v.max_level
from (values
  -- Snowy Trail: the three, rare.
  ('7f4d8eed-fec9-508b-8880-a217435d035a', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 10101, 4, 4, 6),
  ('2aeebe0b-6d06-53f9-a2a0-a3a5ff9c95ca', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 215, 4, 4, 6),
  ('692bf9c8-b4b4-55f1-8331-33e28dd4a508', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 10103, 4, 4, 6),
  -- Pinewood Forest: Sneasel and Alolan Sandshrew beside its Alolan Vulpix.
  ('d172d97f-2159-5f36-a066-5466b6f06b62', '86027687-5c39-5902-a7fa-9da648a00cbc', 215, 8, 7, 9),
  ('6eae3fed-1d9d-5a32-9bea-28b5a76d4d5b', '86027687-5c39-5902-a7fa-9da648a00cbc', 10101, 6, 7, 9)
) as v(id, area_id, dex, weight, min_level, max_level)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
on conflict (id) do update set area_id = excluded.area_id, dex = excluded.dex, weight = excluded.weight, min_level = excluded.min_level, max_level = excluded.max_level;

-- 3. Toy Workshop (e8a95d77…) and Icicle Cave (e5561682…).
update areas set encounter_weights = coalesce(encounter_weights, '{}'::jsonb) || '{"wild":4,"item":2}'::jsonb
where id in ('e8a95d77-f972-5fb7-a784-33373bac3d37', 'e5561682-98aa-5c19-b8a4-32acdc30c64e');

delete from area_loot_pool
where area_id in ('e8a95d77-f972-5fb7-a784-33373bac3d37', 'e5561682-98aa-5c19-b8a4-32acdc30c64e')
  and id not in ('f066802f-6605-5778-8739-30fcfbe9695b', '875ee05f-ec87-5a79-8051-3a7cad7ed0ed',
                 '42f8ed45-b8e7-57db-ade7-828a1d0c1f6a', 'a694d2cb-f0fa-5d8d-9c3f-bc63617865f5');
-- Holly Village's Ice Stone.
delete from area_loot_pool where id = '9844b9ce-219d-5a81-8c99-a4529dda5148';

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty)
select v.id::uuid, v.area_id::uuid, v.item_key, v.weight, v.unique_find, v.min_qty, v.max_qty
from (values
  ('f066802f-6605-5778-8739-30fcfbe9695b', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'ice-stone', 1, true, 3, 3),
  ('875ee05f-ec87-5a79-8051-3a7cad7ed0ed', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'razor-claw', 1, true, 3, 3),
  ('42f8ed45-b8e7-57db-ade7-828a1d0c1f6a', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'ice-stone', 1, true, 3, 3),
  ('a694d2cb-f0fa-5d8d-9c3f-bc63617865f5', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'dawn-stone', 1, true, 1, 1)
) as v(id, area_id, item_key, weight, unique_find, min_qty, max_qty)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
on conflict (id) do update set area_id = excluded.area_id, item_key = excluded.item_key, weight = excluded.weight, unique_find = excluded.unique_find, min_qty = excluded.min_qty, max_qty = excluded.max_qty;

-- 4.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0151_snowglobe_levels.sql
-- Snowglobe Valley: no Pokémon met below the level it is reached at (docs/64 §2.1, the user's report of 2026-11-21: a
-- wild Staravia at Lv.11 in Pinewood Forest, when Starly evolves at 14). Each moves to an area of its level; the
-- world keeps the same species.
--   Staravia (from 14): Pinewood Forest 9–11 → Holly Village 15–18.
--   Quagsire (from 20): Frozen Pond 14–16 → Frostbite Harbour 31–34.
--   Ampharos (from 30): Holly Village 19–21 → Frostbite Harbour 33–36.
--   Sudowoodo (from 30): Toy Workshop 24–26 → Icicle Cave 30–32; Clown Jingle's becomes a Bonsly, Lv.24.
--   Ace Trainer Crystal's Piloswine (from 33), Lv.30 → a Swinub, Lv.31.
--
-- Run after 0122 (and 0150); safe to run again. Each row only where its area or trainer is on the database.

delete from area_wild_pool where id in (
  '14c9460b-5def-53b4-bdb5-f854d138c6d9', -- Pinewood Forest's Staravia
  '1cfd0ede-f28b-5840-9106-31fc4719da06', -- Frozen Pond's Quagsire
  'b16a5b7e-0f2a-5b78-b212-c90a2b42b6b8', -- Holly Village's Ampharos
  'ee764e2b-451b-5261-adee-fe94c3424dc3'  -- Toy Workshop's Sudowoodo
);

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select v.id::uuid, v.area_id::uuid, v.dex, v.weight, v.min_level, v.max_level
from (values
  ('d5a787b9-2e2b-50bf-b69b-7c9396a9ce17', '24714d59-a220-5b61-bfcc-ec569104657d', 397, 5, 15, 18), -- Holly Village
  ('c23a2c86-04bc-5aa5-aa68-bcacacd53b9f', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 185, 5, 30, 32), -- Icicle Cave
  ('cca4c445-3533-5a84-8598-29155f02dd01', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 195, 6, 31, 34), -- Frostbite Harbour
  ('cd97ed78-1503-52aa-bac0-2e172e0a0754', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 181, 4, 33, 36)  -- Frostbite Harbour
) as v(id, area_id, dex, weight, min_level, max_level)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
on conflict (id) do update set area_id = excluded.area_id, dex = excluded.dex, weight = excluded.weight, min_level = excluded.min_level, max_level = excluded.max_level;

update trainers set team = '[{"dex":438,"level":24},{"dex":10176,"level":24}]'::jsonb
where id = '1562662f-f591-501a-a0cb-bcc02b8cdc74'; -- Clown Jingle
update trainers set team = '[{"dex":615,"level":30},{"dex":42,"level":30},{"dex":220,"level":31}]'::jsonb
where id = '83d111ba-7892-5b2b-a586-e3a4aa5d8120'; -- Ace Trainer Crystal

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0152_welcome_gift.sql
-- A small world's starting gift (docs/64 §4.7, the user's call of 2026-11-21): right after the partner pick, a small blue
-- present holding the world's starting bag and ₽, in place of the new-game bag, while its switch is on.
-- 1. game_config `welcomeGift`: its switch, Off (an admin's own row is kept).
-- 2. welcome_gift_open(): the switch as the server reads it for the caller (docs/15 §20), as gift_card_open() does.
--    The game asks it before the partner pick gives a present; while it says no, the new-game bag as before.
-- 3. Snowglobe Valley's gift in its `smallWorlds` entry, where the world is: 2 Potions, 5 Poké Balls, ₽10, 2 Ice Heals.
-- 4. configVersion + 1, so players fetch the new rows. Safe to run again.
insert into game_config (key, value) values ('welcomeGift', '{"access":"off"}'::jsonb)
on conflict (key) do nothing;
-- The switch for the caller: on for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function welcome_gift_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'welcomeGift' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function welcome_gift_open() from public;
grant execute on function welcome_gift_open() to anon, authenticated;

update game_config set value = jsonb_set(
  value,
  '{list}',
  (select jsonb_agg(
     case when w ->> 'id' = 'snowglobe-valley-2026'
       then jsonb_set(w, '{welcomeGift}', '{"gold":10,"items":{"potion":2,"poke-ball":5,"ice-heal":2}}'::jsonb)
       else w end
     order by i)
   from jsonb_array_elements(value -> 'list') with ordinality as x(w, i))
) where key = 'smallWorlds' and jsonb_typeof(value -> 'list') = 'array' and jsonb_array_length(value -> 'list') > 0;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
