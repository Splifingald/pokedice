-- A rival lost to heals the team and the area goes on (docs/61 §5.4), instead of a wipe.
-- 1. game_config `rivalLossHeal`: the switch, Off (left alone when there). The heal and the meeting met are written
--    into the save on the player's device, as a wipe's are, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('rivalLossHeal', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
