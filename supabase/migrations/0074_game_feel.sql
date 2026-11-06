-- The game-feel pass, haptics and battle music (docs/38).
-- 1. game_config `gameFeel`, `haptics` and `music`: three switches, Off (each left alone when there). They only change
--    how the game looks, sounds and feels on the player's device (the engine has decided everything first), so no
--    server function acts for them and none reads them.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('gameFeel', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('haptics', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('music', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
