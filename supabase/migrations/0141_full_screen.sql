-- Full screen (docs/66): a Settings switch that fills the screen (no address bar, on a phone no status bar), on by
-- default in a phone's installed app.
-- 1. game_config `fullScreen`: the switch, Off (left alone when there). It only changes how the page fills the
--    device's screen, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('fullScreen', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
