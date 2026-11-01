-- The Gift card (docs/61 §4.0): in place of an area's item card while its switch is on, a present to open or make
-- bigger, a broken one a wild Pokémon of the area; Evergreen Hill's Delibird comes out of a present of its own (§4.2).
-- The cards themselves are content (an area's `encounter_weights.gift`, Snowglobe Valley's from 0120); this adds:
-- 1. game_config `giftCard`: its switch, Off, and its numbers (left alone when there: an admin's own are kept).
-- 2. gift_card_open(): the switch as the server reads it for the caller (docs/15 §20), as trick_or_treat_open() does.
--    The game asks it before a present appears; while it says no the card is spent and nothing comes out.
-- 3. configVersion + 1, so players fetch the new row. Safe to run again.
begin;
insert into game_config (key, value) values ('giftCard', '{"access":"off","breakChances":[20,40,60,80],"helper":{"dex":225,"safer":20,"extraLevels":1},"rewards":[[[{"kind":"ball","qty":2}]],[[{"kind":"betterBall","qty":3}],[{"kind":"item","key":"super-potion","qty":2}]],[[{"kind":"item","key":"hyper-potion","qty":2}],[{"kind":"money","qty":15}]],[[{"kind":"item","key":"revive","qty":1}],[{"kind":"evolution","qty":1}]],[[{"kind":"item","key":"rare-candy","qty":3}]],[[{"kind":"item","key":"rare-candy","qty":3},{"kind":"item","key":"revive","qty":1}]]],"balls":["poke-ball","great-ball","ultra-ball"],"bossTaps":5}'::jsonb)
on conflict (key) do nothing;
-- The switch for the caller: on for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function gift_card_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'giftCard' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function gift_card_open() from public;
grant execute on function gift_card_open() to anon, authenticated;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
