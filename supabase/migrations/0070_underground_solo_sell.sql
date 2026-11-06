-- The Underground's solo price (docs/34 §1.5): outside a full team, orbs sell for `soloShare` % of their price (10 by
-- default; 0 = no selling until the team is full). Selling happens in the player's save, so no server function reads
-- it: the row only gains the key, kept equal to the game's defaults. An admin's own value is left alone. Safe to run
-- again.
begin;
update game_config set value = '{"soloShare": 10}'::jsonb || value where key = 'underground' and not value ? 'soloShare';
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
