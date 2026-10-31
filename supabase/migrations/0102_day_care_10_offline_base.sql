-- Two tuning changes for players' first days (2026-10-31):
-- 1. The Day Care opens at 10 species caught instead of 20 (game_config `dayCare.unlockPokedex`), so a new player meets
--    it sooner. Set to 10 on every run: the admin's value from then on is changed in Admin → Config.
-- 2. Offline earnings pay ₽1 an hour before any level is bought (game_config `general.offlineBase`), so every player
--    finds a little waiting when they come back. Added when missing, left alone when the admin has set it.
-- 3. configVersion + 1, so players fetch the new content. Safe to run again.
-- Both are read on the player's device; no server function reads them.
begin;
update game_config set value = jsonb_set(value, '{unlockPokedex}', '10'::jsonb) where key = 'dayCare';
update game_config set value = value || '{"offlineBase": 1}'::jsonb where key = 'general' and not (value ? 'offlineBase');
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
