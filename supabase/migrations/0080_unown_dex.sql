-- The Unown Pokédex (docs/41).
-- 1. game_config `unownDex`: the switch, Off, and the prize for the 28th letter, ₽1,000 (left alone when there). The
--    page shows what the save already holds (the letters each region has found, noted on the player's device, as the
--    Pokédex is) and its prize is paid into the save's own purse, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('unownDex', '{"access": "off", "reward": 1000}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
