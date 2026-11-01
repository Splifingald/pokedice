-- Kalos hordes (docs/62 §5): the switch, Off. A horde is 4 % of Kalos's wild cards, at most one a round in an area: five
-- of a species 3 levels down (one in ten with another species), fought two at a time, one throw at the end. The
-- numbers are the game's own; a row's own override them. Then configVersion + 1. Safe to run again.
begin;
insert into game_config (key, value) values ('hordes', '{"access":"off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
