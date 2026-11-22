-- The Rotom Room (docs/73): Rotom's five appliance forms and the Sinnoh secret area where they are caught, one a week.
-- Written by scripts/rotom-room.ts from the bundle's rows. Safe to run again: every row is left alone when there (the
-- admin's edits kept). Its switch is 0152 (run both); supabase/seed.sql carries these rows with the bundle's.
-- 1. The five forms (10008–10012): Heat, Wash, Frost, Fan and Mow Rotom, Electric and the appliance's type.
-- 2. The area, The Rotom Room (once Lake Valor & Lake Acuity is reached, Lv.36–44), its wild pool (each week the Electric rows and the
--    week's type), its loot, the five forms as its bosses (one a week, the player's own: engine/rotomRoom.ts).
-- 3. configVersion + 1, so players fetch the new content.
begin;

-- 1.
insert into pokemon (dex, name, type1, type2, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones, notes, form) values
  (10008, 'Heat Rotom', 'electric', 'fire', 12, 241, 86, '/pokemon/10008_front.png', '[{"type":"electric","count":2},{"type":"fire","count":2}]'::jsonb, 3, 5, '[]'::jsonb, '[]'::jsonb, 'rotom-heat · BST 520 · caught in the Rotom Room (docs/73)', '{"of":479,"kind":"appliance"}'::jsonb),
  (10009, 'Wash Rotom', 'electric', 'water', 12, 241, 86, '/pokemon/10009_front.png', '[{"type":"electric","count":2},{"type":"water","count":2}]'::jsonb, 3, 5, '[]'::jsonb, '[]'::jsonb, 'rotom-wash · BST 520 · caught in the Rotom Room (docs/73)', '{"of":479,"kind":"appliance"}'::jsonb),
  (10010, 'Frost Rotom', 'electric', 'ice', 12, 241, 86, '/pokemon/10010_front.png', '[{"type":"electric","count":2},{"type":"ice","count":2}]'::jsonb, 3, 5, '[]'::jsonb, '[]'::jsonb, 'rotom-frost · BST 520 · caught in the Rotom Room (docs/73)', '{"of":479,"kind":"appliance"}'::jsonb),
  (10011, 'Fan Rotom', 'electric', 'flying', 12, 241, 86, '/pokemon/10011_front.png', '[{"type":"electric","count":2},{"type":"flying","count":2}]'::jsonb, 3, 5, '[]'::jsonb, '[]'::jsonb, 'rotom-fan · BST 520 · caught in the Rotom Room (docs/73)', '{"of":479,"kind":"appliance"}'::jsonb),
  (10012, 'Mow Rotom', 'electric', 'grass', 12, 241, 86, '/pokemon/10012_front.png', '[{"type":"electric","count":2},{"type":"grass","count":2}]'::jsonb, 3, 5, '[]'::jsonb, '[]'::jsonb, 'rotom-mow · BST 520 · caught in the Rotom Room (docs/73)', '{"of":479,"kind":"appliance"}'::jsonb)
on conflict (dex) do nothing;

-- 2.
insert into areas (id, order_index, region_id, name, banner_url, rounds_to_clear, min_level, max_level, encounter_weights, backtrack_multiplier, legendary_boss, scales_to_team, easy_mode, enemy_upgrade_level, battle_background, hidden, unlock_conditions, gyms) values
  ('875e7168-7d1b-58ac-bdd9-67c0ce365c95', 959, 'sinnoh', 'The Rotom Room', '/banners/factory.png', 2, 36, 44, '{"item":1,"wild":6,"casino":0,"center":1,"trainer":0}'::jsonb, 0.5, '[{"dex":10008,"level":44},{"dex":10009,"level":44},{"dex":10010,"level":44},{"dex":10011,"level":44},{"dex":10012,"level":44}]'::jsonb, false, false, 7, 'default', true, '[{"kind":"area","areaId":"ffd172b1-9ee2-54a8-bc39-a66661a7e0b8"}]'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;

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
on conflict (id) do nothing;

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
on conflict (id) do nothing;

-- 3.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
