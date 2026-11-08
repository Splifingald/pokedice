-- The Gym Leaders' entrance (docs/68): one stadium film for every Gym Leader, lit in its gym type's colours, with the
-- leader's own picture and name, instead of the trainer stepping onto the field.
-- 1. game_config `gymCinema`: the switch, Off (left alone when there). It only changes how an entrance looks and
--    sounds on the player's device (the engine has decided the fight first), so no server function acts for it and
--    none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('gymCinema', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
