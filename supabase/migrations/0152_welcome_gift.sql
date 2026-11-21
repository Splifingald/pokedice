-- A small world's starting gift (docs/64 §4.7, the user's call of 2026-11-21): right after the partner pick, a small blue
-- present holding the world's starting bag and ₽, in place of the new-game bag, while its switch is on.
-- 1. game_config `welcomeGift`: its switch, Off (an admin's own row is kept).
-- 2. welcome_gift_open(): the switch as the server reads it for the caller (docs/15 §20), as gift_card_open() does.
--    The game asks it before the partner pick gives a present; while it says no, the new-game bag as before.
-- 3. Snowglobe Valley's gift in its `smallWorlds` entry, where the world is: 2 Potions, 5 Poké Balls, ₽10, 2 Ice Heals.
-- 4. configVersion + 1, so players fetch the new rows. Safe to run again.
begin;
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
