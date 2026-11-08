-- A collapsed wall's new gauge (docs/34 §12): its own switch inside the Underground's row, `refresh`, Off by default.
-- Kits live in the player's save, so no server function reads it: the row only gains the key, kept equal to the game's
-- defaults. An admin's own value is left alone. Safe to run again.
begin;
update game_config set value = '{"refresh": "off"}'::jsonb || value where key = 'underground' and not value ? 'refresh';
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
