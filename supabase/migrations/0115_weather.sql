-- The region flavours' weather (docs/62 §2–4), and the server's check for all five region flavours.
-- 1. Two switches, Off: `hoennWeather` (Hoenn's fixed weather: rain on Routes 118–121, the Route 111 desert's
--    sandstorm, Route 113's ash, Mt. Pyre's fog, Sootopolis's sun and rain a round each) and `galarWeather` (the Wild
--    Area's, the Isle of Armor's and the Crown Tundra's weather of the day, Circhester's snow). Each area's weather is
--    the game's own content (src/engine/flavoursContent.ts); a row's `areas` overrides it.
-- 2. side_quest_open(key) also knows the five region flavours: hoennWeather, galarWeather, hordes, trials, titans
--    (0116–0118 add the other three rows; a key with no row yet is off).
-- 3. configVersion + 1. Safe to run again.
begin;
insert into game_config (key, value) values ('hoennWeather', '{"access":"off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('galarWeather', '{"access":"off"}'::jsonb) on conflict (key) do nothing;

-- A side quest's or a region flavour's switch for the caller: on for everyone, or for the admin only (their JWT). An
-- odd value is off.
create or replace function side_quest_open(p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    p_key in ('disguises', 'safari', 'rivals', 'giftMoments', 'hoennWeather', 'galarWeather', 'hordes', 'trials', 'titans')
      and (a = 'all' or (a = 'admin' and is_admin())),
    false)
  from (select coalesce((select value ->> 'access' from game_config where key = p_key and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function side_quest_open(text) from public;
grant execute on function side_quest_open(text) to anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
