-- A rival's team matched to the player (docs/61 §5.5): its levels and its evolution stages fitted to the team the
-- player brings, instead of the content's.
-- 1. game_config `rivalMatch`: the switch, Off, and the admin's choices at the game's defaults (levels: never
--    stronger than the player's best + 1; stages: by level). Left alone when there. The team is dealt on the player's
--    device, as every trainer's is, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('rivalMatch', '{"access": "off", "levels": "cap", "margin": 1, "stages": "byLevel"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
