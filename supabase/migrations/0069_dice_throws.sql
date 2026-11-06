-- Recorded dice throws (docs/37).
-- 1. game_config `diceThrows`: the switch, Off (left alone when there). It only changes how dice look on the player's
--    device (the engine has chosen every face first), so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('diceThrows', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
