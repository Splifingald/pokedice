-- The Rotom Room moves before the League (docs/73, the user's call of 2026-11-22): open once Lake Valor & Lake Acuity
-- is reached, wild Lv.36–42, the week's form Lv.44, foes' upgrades as Lake Valor's, a pool and loot fit for that road,
-- and the shiny Rotom prize Lv.44 by default. 0153 now writes the room this way, but it leaves a room already there
-- alone; this moves one that 0153 put in at Lv.50–60.
-- 1. The room's levels, bosses, upgrades and unlock (after Lake Valor & Lake Acuity), its other columns kept.
-- 2. Its wild pool and loot: 0153's rows, the old ones it no longer has taken out.
-- 3. game_config `rotomRoom`: the prize's level 44 where it is still the old default (60); the switch kept.
-- 4. configVersion + 1, so players fetch the moved room.
-- Run after 0153 and 0154; safe to run again.
begin;

-- 1.
insert into areas (id, order_index, region_id, name, banner_url, rounds_to_clear, min_level, max_level, encounter_weights, backtrack_multiplier, legendary_boss, scales_to_team, easy_mode, enemy_upgrade_level, battle_background, hidden, unlock_conditions, gyms) values
  ('875e7168-7d1b-58ac-bdd9-67c0ce365c95', 959, 'sinnoh', 'The Rotom Room', '/banners/factory.png', 2, 36, 44, '{"item":1,"wild":6,"casino":0,"center":1,"trainer":0}'::jsonb, 0.5, '[{"dex":10008,"level":44},{"dex":10009,"level":44},{"dex":10010,"level":44},{"dex":10011,"level":44},{"dex":10012,"level":44}]'::jsonb, false, false, 7, 'default', true, '[{"kind":"area","areaId":"ffd172b1-9ee2-54a8-bc39-a66661a7e0b8"}]'::jsonb, '[]'::jsonb)
on conflict (id) do update set
  min_level = excluded.min_level,
  max_level = excluded.max_level,
  legendary_boss = excluded.legendary_boss,
  enemy_upgrade_level = excluded.enemy_upgrade_level,
  unlock_conditions = excluded.unlock_conditions;

-- 2.
delete from area_wild_pool where area_id = '875e7168-7d1b-58ac-bdd9-67c0ce365c95' and id not in ('e32f7bfa-0445-58fd-a48e-9917e1d0d6f9', 'dcf25ed5-a596-5807-8009-daecfad2d16f', '765f6216-5a80-571a-8d1c-ba6b820a0e91', '40d73fdf-da1e-56ac-aea4-c2a854d00b7f', '67716c54-84f9-5e82-9533-c5fd3333b3e8', 'b3f218e1-64f4-5088-a80f-d02a8aa60c37', '4e594de2-6b56-5cbc-b7fc-1fb6d12e595f', '5082ca31-80b6-5797-ab53-955ca69d2690', '55528bee-0986-5dff-82ce-fe2c82ee4ec6', '2192770b-a894-54bc-ac5d-4a2ab85c8325', '06e500c9-a735-5729-94e2-35c1e24e3243', '645466ba-e46e-5f73-9a31-ab67018b409e', 'b022d342-39a9-5cba-bdc8-eb5ad079034d', '7cec74a5-74b7-568f-80d4-81e6b590ef7f', '9a8a6029-1b74-564a-8f3a-6ba55d63bede', '7881bca8-449e-5708-acb7-2b2ddfca5d52', 'b8991615-d321-5b2c-9ab8-ac8566ea8354', '235b0587-db53-582f-b5e9-b155bb814277', 'f483ca72-842c-5cc3-b10c-6732aa03130d', 'edf03e0c-282d-5640-b625-4773072768fb', 'f23f9f49-d7a1-5f43-af2d-263e0646c4d1', '094ea05b-be08-58bd-86bb-c5d3fb7448c6', 'cc66e78d-8017-5c8d-9dc0-2f6f228575ed', '9b1cb4e9-7b56-5478-9c7c-5b9ad885a336', '69d9cca0-f67e-5457-b425-3a110798b654', '49f5b0bd-a633-5001-92ac-4ede78fc622a', 'c4d148dc-9bf0-5de4-9d38-546cc422522d', '6f7170ff-787f-5a96-9d6f-bc9f36b6ec61', '5686f3dc-f5cd-5906-a798-61dd0c89a4c3');

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level) values
  ('e32f7bfa-0445-58fd-a48e-9917e1d0d6f9', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 405, 10, 36, 42),
  ('dcf25ed5-a596-5807-8009-daecfad2d16f', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 125, 8, 36, 42),
  ('765f6216-5a80-571a-8d1c-ba6b820a0e91', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 171, 6, 36, 42),
  ('40d73fdf-da1e-56ac-aea4-c2a854d00b7f', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 417, 6, 36, 42),
  ('67716c54-84f9-5e82-9533-c5fd3333b3e8', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 126, 8, 36, 42),
  ('b3f218e1-64f4-5088-a80f-d02a8aa60c37', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 229, 8, 36, 42),
  ('4e594de2-6b56-5cbc-b7fc-1fb6d12e595f', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 324, 6, 36, 42),
  ('5082ca31-80b6-5797-ab53-955ca69d2690', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 219, 6, 38, 42),
  ('55528bee-0986-5dff-82ce-fe2c82ee4ec6', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 419, 8, 36, 42),
  ('2192770b-a894-54bc-ac5d-4a2ab85c8325', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 423, 8, 36, 42),
  ('06e500c9-a735-5729-94e2-35c1e24e3243', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 457, 6, 36, 42),
  ('645466ba-e46e-5f73-9a31-ab67018b409e', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 55, 6, 36, 42),
  ('b022d342-39a9-5cba-bdc8-eb5ad079034d', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 130, 3, 36, 42),
  ('7cec74a5-74b7-568f-80d4-81e6b590ef7f', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 215, 8, 36, 42),
  ('9a8a6029-1b74-564a-8f3a-6ba55d63bede', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 361, 8, 36, 41),
  ('7881bca8-449e-5708-acb7-2b2ddfca5d52', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 473, 6, 36, 42),
  ('b8991615-d321-5b2c-9ab8-ac8566ea8354', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 459, 6, 36, 39),
  ('235b0587-db53-582f-b5e9-b155bb814277', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 460, 4, 40, 42),
  ('f483ca72-842c-5cc3-b10c-6732aa03130d', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 398, 8, 36, 42),
  ('edf03e0c-282d-5640-b625-4773072768fb', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 164, 8, 36, 42),
  ('f23f9f49-d7a1-5f43-af2d-263e0646c4d1', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 426, 6, 36, 42),
  ('094ea05b-be08-58bd-86bb-c5d3fb7448c6', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 472, 6, 36, 42),
  ('cc66e78d-8017-5c8d-9dc0-2f6f228575ed', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 469, 6, 36, 42),
  ('9b1cb4e9-7b56-5478-9c7c-5b9ad885a336', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 441, 4, 36, 42),
  ('69d9cca0-f67e-5457-b425-3a110798b654', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 315, 8, 36, 42),
  ('49f5b0bd-a633-5001-92ac-4ede78fc622a', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 465, 8, 36, 42),
  ('c4d148dc-9bf0-5de4-9d38-546cc422522d', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 455, 6, 36, 42),
  ('6f7170ff-787f-5a96-9d6f-bc9f36b6ec61', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 421, 6, 36, 42),
  ('5686f3dc-f5cd-5906-a798-61dd0c89a4c3', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 357, 4, 36, 42)
on conflict (id) do update set dex = excluded.dex, weight = excluded.weight, min_level = excluded.min_level,
  max_level = excluded.max_level;

delete from area_loot_pool where area_id = '875e7168-7d1b-58ac-bdd9-67c0ce365c95' and id not in ('775daf7f-9d46-5918-9f68-20d374f88091', '1a2904dd-10c9-5a44-9d54-498fd09f50df', 'e41caeda-e677-5a63-8e14-2705f053f8d1', 'f2782a0d-a41f-52c5-aae3-85d924dfd4ee', 'c983b98d-aa2a-5c54-9a84-54b9d39a188a', '1c5e6781-5b56-52df-bb85-220a756e80cb', '8920329b-7459-5c5e-81da-f74f3eb1c798', '80fd03f5-87b7-5654-b18d-90dd26f4ace8', '980101ea-9ac4-5f41-871d-63b481352a4f', '732742d4-8896-569e-b940-2637f6a25149', '060f11f4-6a02-5e98-bf51-f58227fee985');

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty) values
  ('775daf7f-9d46-5918-9f68-20d374f88091', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'super-potion', 12, false, 1, 2),
  ('1a2904dd-10c9-5a44-9d54-498fd09f50df', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'hyper-potion', 14, false, 1, 1),
  ('e41caeda-e677-5a63-8e14-2705f053f8d1', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'great-ball', 12, false, 1, 2),
  ('f2782a0d-a41f-52c5-aae3-85d924dfd4ee', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'ultra-ball', 12, false, 1, 1),
  ('c983b98d-aa2a-5c54-9a84-54b9d39a188a', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'paralyze-heal', 4, false, 1, 1),
  ('1c5e6781-5b56-52df-bb85-220a756e80cb', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'burn-heal', 4, false, 1, 1),
  ('8920329b-7459-5c5e-81da-f74f3eb1c798', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'ice-heal', 4, false, 1, 1),
  ('80fd03f5-87b7-5654-b18d-90dd26f4ace8', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'ether', 8, false, 1, 2),
  ('980101ea-9ac4-5f41-871d-63b481352a4f', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'max-ether', 6, false, 1, 1),
  ('732742d4-8896-569e-b940-2637f6a25149', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'rare-candy', 3, false, 1, 1),
  ('060f11f4-6a02-5e98-bf51-f58227fee985', '875e7168-7d1b-58ac-bdd9-67c0ce365c95', 'money', 18, false, 100, 200)
on conflict (id) do update set item_key = excluded.item_key, weight = excluded.weight,
  unique_find = excluded.unique_find, min_qty = excluded.min_qty, max_qty = excluded.max_qty;

-- 3.
update game_config set value = jsonb_set(value, '{prizeLevel}', '44'::jsonb)
where key = 'rotomRoom' and (value ->> 'prizeLevel')::numeric = 60;

-- 4.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
