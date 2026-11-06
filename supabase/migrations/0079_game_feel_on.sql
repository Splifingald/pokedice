-- Game feel, haptics and battle music on for everyone (docs/38 §1): the user chose to ship 2.3 with them on, rather
-- than Off as 0074 put them in.
-- 1. game_config `gameFeel`, `haptics` and `music`: On for everyone, whatever 0074 or the admin set. Running it again
--    switches them back on, so after an admin has switched one off, don't run it again.
-- 2. configVersion + 1, so players fetch the new switches.
-- Run after 0074. seed.sql inlines it (scripts/seed.ts), after 0078.
begin;
insert into game_config (key, value) values
  ('gameFeel', '{"access": "all"}'::jsonb),
  ('haptics', '{"access": "all"}'::jsonb),
  ('music', '{"access": "all"}'::jsonb)
on conflict (key) do update set value = excluded.value;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
