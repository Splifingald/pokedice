-- Sudden death (docs/72): after 10 turns in a row that hurt nobody, every Pokémon loses 25 % of its max HP as each of
-- its turns starts, so a fight nobody can win ends with a winner rather than at the turn cap.
-- 1. game_config `suddenDeath`: the switch, Off (left alone when there). Fights are played on the player's device and
--    no server function acts for them, so none reads it. Its numbers are the game's own (engine/battle.ts); a row may
--    carry `turns` and `share` to change them.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('suddenDeath', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
