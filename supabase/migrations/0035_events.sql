-- Special events (docs/18-SPECIAL-EVENTS-PLAN.md, docs/19-SPECIAL-EVENTS-BUILD.md): the Fortune Wheel, Raid Battles and
-- the Elite Rebattle. Built in phases; this file grows with them and stays safe to run again.
--
-- Phase 1, the framework:
-- 1. event_time(): the server's clock. The daily spin and the day's raid turn over at midnight UTC as the server sees
--    it, never the device's: anyone can call it, guests included (it reveals nothing but the time).
-- 2. event_state: one row per signed-in player, what the events have recorded about them (the later phases fill it).
--
-- Phase 2, the Fortune Wheel:
-- 3. wheel_spin(): one spin per UTC day. The server draws the prize from game_config `events` → wheel.prizes (each
--    prize's slices × their odds; the defaults below when the admin hasn't saved the row), so reloading can't re-roll
--    it. A second call the same day gives the same prize back, `fresh` false: a spin whose answer got lost isn't lost.
--
-- seed.sql inlines this file after 0034, so a database that only re-runs seed.sql gets it too.

-- ---------------------------------------------------------------- the clock

create or replace function event_time()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'day', to_char(now() at time zone 'UTC', 'YYYY-MM-DD')
  )
$$;
revoke all on function event_time() from public;
grant execute on function event_time() to anon, authenticated;

-- ---------------------------------------------------------------- each player's events

create table if not exists event_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table event_state enable row level security;
revoke all on event_state from anon, authenticated;
drop policy if exists event_state_admin on event_state;
create policy event_state_admin on event_state for all using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- the Fortune Wheel

alter table event_state add column if not exists wheel_day date;
alter table event_state add column if not exists wheel_prize int;

-- The wheel's prizes: the admin's, or the game's defaults (engine/defaults.ts; tests/events-sql.test.ts keeps the two
-- the same).
create or replace function wheel_prizes()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value #> '{wheel,prizes}' from game_config
      where key = 'events' and jsonb_typeof(value #> '{wheel,prizes}') = 'array' and jsonb_array_length(value #> '{wheel,prizes}') > 0),
    '[
      {"reward": {"kind": "gold", "amount": 10}, "count": 4, "odds": 12.5},
      {"reward": {"kind": "item", "key": "poke-ball", "qty": 1}, "count": 2, "odds": 12.5},
      {"reward": {"kind": "item", "key": "great-ball", "qty": 1}, "count": 1, "odds": 12.5},
      {"reward": {"kind": "item", "key": "ultra-ball", "qty": 1}, "count": 1, "odds": 10},
      {"reward": {"kind": "item", "key": "master-ball", "qty": 1}, "count": 1, "odds": 2.5}
    ]'::jsonb)
$$;
revoke all on function wheel_prizes() from public;

create or replace function wheel_spin()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'UTC')::date;
  prizes jsonb := wheel_prizes();
  st event_state;
  n int := jsonb_array_length(prizes);
  weights numeric[] := '{}';
  total numeric := 0;
  w numeric;
  x numeric;
  pick int;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if not coalesce((select (value #>> '{wheel,enabled}')::boolean from game_config where key = 'events'), true) then
    raise exception 'events_wheel_off';
  end if;
  insert into event_state (user_id) values (me) on conflict (user_id) do nothing;
  select * into st from event_state where user_id = me for update;
  if st.wheel_day = today and st.wheel_prize is not null then
    return jsonb_build_object('day', to_char(today, 'YYYY-MM-DD'), 'prize', st.wheel_prize,
      'reward', prizes -> st.wheel_prize -> 'reward', 'fresh', false);
  end if;
  for i in 0 .. n - 1 loop
    w := greatest(0, coalesce((prizes -> i ->> 'count')::numeric, 0)) * greatest(0, coalesce((prizes -> i ->> 'odds')::numeric, 0));
    weights := weights || w;
    total := total + w;
  end loop;
  if total <= 0 then raise exception 'events_wheel_empty'; end if;
  x := random() * total;
  for i in 0 .. n - 1 loop
    if weights[i + 1] > 0 then
      pick := i;
      x := x - weights[i + 1];
      exit when x < 0;
    end if;
  end loop;
  update event_state set wheel_day = today, wheel_prize = pick, updated_at = now() where user_id = me;
  return jsonb_build_object('day', to_char(today, 'YYYY-MM-DD'), 'prize', pick, 'reward', prizes -> pick -> 'reward', 'fresh', true);
end $$;
revoke all on function wheel_spin() from public;
grant execute on function wheel_spin() to authenticated;
