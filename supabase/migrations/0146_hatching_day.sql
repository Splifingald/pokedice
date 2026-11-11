-- Hatching Day (docs/71 §2): a live event of type `hatch`. While it runs, the Day Care's Egg clocks run faster and an
-- Egg cracked meanwhile is more often shiny (its two numbers are on the event, in the `liveEvents` row the admin
-- already writes).
-- 1. game_config `hatchingDay`: its switch, Off (left alone when there). Everything happens in each player's own save,
--    on the server's clock (event_time), like the gift calendar's doors, so no server function acts for it and none
--    reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('hatchingDay', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
