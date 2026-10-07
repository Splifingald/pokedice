-- Content patch: the Oval Stone, the Razor Fang and a Sinnoh Gligar.
-- The same four rows the full seed.sql now carries, for a live database that is otherwise up to date.
-- Paste it into the Supabase SQL editor and run it once; running it again changes nothing but the version bump.
--
--   · Oval Stone  — one-time find in Route 209 & the Solaceon Ruins (Sinnoh), for Happiny
--   · Razor Fang  — one-time find in Cycling Road & Routes 206–207 (Sinnoh), for Gligar
--   · Gligar      — wild in Cycling Road & Routes 206–207, weight 10, Lv.19–25
--   · Razor Fang  — one-time find in Route 19 & Couriway Town (Kalos), for the Gligar there
--
-- The level-100 Evolve button and the Team screen's Pokémon Center note are app code: they ship with the deploy,
-- not with this file.
begin;

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level) values
  ('827591e2-3c7d-5023-bbb9-436c25abe7d2', 'eb01f9bc-a3e2-5fdb-ade9-343b5c0c04b9', 207, 10, 19, 25)
on conflict (id) do update set area_id = excluded.area_id, dex = excluded.dex, weight = excluded.weight, min_level = excluded.min_level, max_level = excluded.max_level;

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty) values
  ('f81bb425-66b7-51d5-8de4-f8ec2ea74ad0', '6c54a30a-d5cc-5311-ae07-d9b0dfac5db2', 'oval-stone', 8, true, 1, 1),
  ('ebf2f15b-6ec9-5f39-86e8-209df3b12108', 'eb01f9bc-a3e2-5fdb-ade9-343b5c0c04b9', 'razor-fang', 8, true, 1, 1),
  ('bdc0b03d-c1ad-59b1-ba83-bbf51174e831', 'e2e8a0d9-9b0a-564b-9f4a-cead9f3ff959', 'razor-fang', 8, true, 1, 1)
on conflict (id) do update set area_id = excluded.area_id, item_key = excluded.item_key, weight = excluded.weight, unique_find = excluded.unique_find, min_qty = excluded.min_qty, max_qty = excluded.max_qty;

-- What Admin → Publish does: a new content version makes every client fetch the new rows on its next load.
update game_config set value = to_jsonb((value #>> '{}')::int + 1) where key = 'configVersion';

commit;
