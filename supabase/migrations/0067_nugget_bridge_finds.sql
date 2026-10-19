-- Route 4 & Nugget Bridge had no item card in its encounter deck (`item` weight 0), so nothing in its loot pool could
-- ever be found, the one-time ₱250 stash included, though the area's sheet offered it (a player's report, 2026-10-19).
-- One item card, as its neighbours Route 3 and Routes 5 & 6 have. Only while it is still 0, so an admin's later retune
-- is kept. Then `configVersion` + 1, so players fetch the new content. The seed's own row carries the fix; this file
-- is for a database seeded before it. Safe to run again.

update areas set encounter_weights = encounter_weights || '{"item": 1}'::jsonb
where id = 'e378fb03-6702-51fd-89ba-18ffc912a300'
  and coalesce((encounter_weights ->> 'item')::numeric, 0) = 0;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
