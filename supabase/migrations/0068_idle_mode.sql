-- Idle mode and the play styles (docs/36).
-- 1. game_config `idleMode`: the switch, Off (left alone when there). The play styles and the autopilot run on the
--    player's device and the choice lives in the save's settings, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('idleMode', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
