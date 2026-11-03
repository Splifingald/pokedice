-- Set moments (docs/61 §5): rivals met at set points of an area, and gift Pokémon. The meetings and the gifts are the
-- game's own content (src/engine/momentsContent.ts); the database holds their switches and the rivals' trainers.
-- 1. The rivals' new trainers, one per player starter (rival_of) where the original rival picks the starter strong
--    against yours: Blue on Routes 22 & 2, Route 4 & Nugget Bridge, Routes 5 & 6 and Route 21; Silver x5 (Johto); May x5
--    (Hoenn; Brendan for a player in Green's look); Wally x2; Barry on Route 201. 51 rows, left alone when there.
-- 2. Blue's two rows already in the game become versions (Pokémon Tower: the Squirtle one, rival_of 4; Silph Co.: the
--    Charmander one, rival_of 1), only where they have none yet.
-- 3. Kalos's Pokédex can be filled though Sycamore's gift is one of three: the Kanto starters, rare (weight 3) in the
--    Friend Safari.
-- 4. The two switches, Off: `rivals` and `giftMoments` (an Egg hatches in 6 hours). 5. configVersion + 1.
-- Safe to run again. supabase/seed.sql carries the trainers and the pool rows.
begin;
insert into trainers (id, name, sprite_url, team, role, badge, upgrade_level, battle_background, rival_of, items, duo) values
  ('bb51d07e-b961-557b-935c-11d660bc5a26', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":16,"level":6},{"dex":4,"level":7}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('64ab7f34-3123-539c-b1e0-ec6036b372f0', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":16,"level":6},{"dex":7,"level":7}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('7b332e47-527e-53e7-8872-f3e2079244ac', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":16,"level":6},{"dex":1,"level":7}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('9ba93ff6-50e3-5788-9430-0b7be269e41f', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":18},{"dex":63,"level":16},{"dex":5,"level":19}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('3cf3197c-83c1-51f3-af3f-b6ac33843ded', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":18},{"dex":63,"level":16},{"dex":8,"level":19}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('c87475c5-46a0-556c-a1eb-66441e342505', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":18},{"dex":63,"level":16},{"dex":2,"level":19}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('6f60109a-0f06-57f5-8762-f05e7f4e9603', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":21},{"dex":64,"level":20},{"dex":5,"level":23}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('61573fd6-204e-524c-9737-90f4a6f455cd', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":21},{"dex":64,"level":20},{"dex":8,"level":23}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('9d9fd418-b94b-5681-a14c-1c31eeebc79a', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":21},{"dex":64,"level":20},{"dex":2,"level":23}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('11127ff2-1ef0-5360-8ad6-73cf932c1e20', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":18,"level":44},{"dex":65,"level":45},{"dex":6,"level":47}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('5ea9f46c-605c-5695-a176-b85223688a32', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":18,"level":44},{"dex":65,"level":45},{"dex":9,"level":47}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('9ccbead8-327e-5851-9da3-037acad7b2d3', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":18,"level":44},{"dex":65,"level":45},{"dex":3,"level":47}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('dfef6d75-e8a5-5686-9323-f3e81c2178e4', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":155,"level":6}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('f39dd7fc-1f25-5eba-b443-b3f1097796c2', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":158,"level":6}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('80d169cb-ca34-5b5d-996a-008e474c3541', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":152,"level":6}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('6ae02d3b-998e-59fe-9b1b-33f31dbbd409', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":92,"level":14},{"dex":41,"level":15},{"dex":156,"level":17}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('90750672-7f99-5af1-a244-7fbba0294115', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":92,"level":14},{"dex":41,"level":15},{"dex":158,"level":17}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('aee99329-9e53-5f7c-a21d-ba76597bb687', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":92,"level":14},{"dex":41,"level":15},{"dex":153,"level":17}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('4b3f2adf-d951-5638-b252-5300a865b00d', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":93,"level":27},{"dex":81,"level":26},{"dex":156,"level":29}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('33c7c2b0-70f5-5182-add2-c272208b71c9', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":93,"level":27},{"dex":81,"level":26},{"dex":159,"level":29}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('e9d61bab-99f6-587a-a23c-7aebd9afa58a', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":93,"level":27},{"dex":81,"level":26},{"dex":153,"level":29}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('80aefa01-a322-5602-b2f1-e5a4a082046d', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":215,"level":40},{"dex":42,"level":40},{"dex":157,"level":42}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('04c37992-974a-5760-80ec-d22a32a10a02', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":215,"level":40},{"dex":42,"level":40},{"dex":160,"level":42}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('21f36922-b1d7-501d-9b44-5cb25d804e54', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":215,"level":40},{"dex":42,"level":40},{"dex":154,"level":42}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('9206e38f-c5e1-5af5-a6cd-745b73df371b', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":82,"level":48},{"dex":42,"level":48},{"dex":157,"level":50}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('3c319dc8-a2ec-5d97-9f52-690c7e56ec87', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":82,"level":48},{"dex":42,"level":48},{"dex":160,"level":50}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('282752a7-00ec-54af-8658-773f6c5be104', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":82,"level":48},{"dex":42,"level":48},{"dex":154,"level":50}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('c9815721-181a-5e31-a3f5-73faecb1cf40', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":255,"level":6}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('8e67536a-e3d9-5250-b972-dfa4407d858d', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":258,"level":6}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('1a5d14f1-21ea-5154-93fc-091c077c6a09', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":252,"level":6}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('5c2d72d2-6fe6-5c16-b80b-79c866a3ba09', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":13},{"dex":270,"level":13},{"dex":255,"level":15}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('17e99bcf-4567-528c-aec2-dd16c8db04c7', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":13},{"dex":285,"level":13},{"dex":258,"level":15}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('b87ec0f2-e8eb-5023-8d6c-31b5d8a712dc', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":13},{"dex":322,"level":13},{"dex":252,"level":15}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('a4c26565-bc79-50e2-86f3-8ac531d17e17', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":21},{"dex":271,"level":21},{"dex":256,"level":23}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('bdda2011-f55b-5992-89b2-53b8a47adff8', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":21},{"dex":285,"level":21},{"dex":259,"level":23}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('73fdf849-6292-5398-85e7-d38e80aede69', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":21},{"dex":322,"level":21},{"dex":253,"level":23}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('d0635623-12e5-5056-a1fa-670c1c14add8', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":36},{"dex":272,"level":36},{"dex":257,"level":38}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('7214bb10-ff1f-5b1a-8143-93684d910384', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":36},{"dex":286,"level":36},{"dex":260,"level":38}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('1afb47f0-53bf-58fb-9672-b66609d6ac48', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":36},{"dex":323,"level":36},{"dex":254,"level":38}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('bd021dc9-9b78-53e2-a9a5-119eba6108ce', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":45},{"dex":272,"level":45},{"dex":257,"level":47}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('0a6d613e-e6a2-51be-852f-d5fe3dbdeab9', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":45},{"dex":286,"level":45},{"dex":260,"level":47}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('d266469b-099c-5ef4-b1ec-c46b60b6f03d', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":45},{"dex":323,"level":45},{"dex":254,"level":47}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('d62f9fa5-5d3d-54de-9f88-478becea7a5b', 'Wally', '/trainers/classes/hoenn/wally.png', '[{"dex":281,"level":25}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb, false),
  ('c78d2edd-b365-5035-95ca-dda93314414d', 'Wally', '/trainers/classes/hoenn/wally.png', '[{"dex":334,"level":53},{"dex":315,"level":53},{"dex":282,"level":55}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb, false),
  ('f0ec6640-0618-5b62-81a1-ee2c016f6981', 'Barry', '/trainers/classes/sinnoh/barry.png', '[{"dex":390,"level":5}]'::jsonb, 'trainer', null, null, null, 387, '[]'::jsonb, false),
  ('f12adf50-94e4-55e8-994f-a29f27024ecf', 'Barry', '/trainers/classes/sinnoh/barry.png', '[{"dex":393,"level":5}]'::jsonb, 'trainer', null, null, null, 390, '[]'::jsonb, false),
  ('b1ae48a8-5012-586b-ae2d-aad87962557b', 'Barry', '/trainers/classes/sinnoh/barry.png', '[{"dex":387,"level":5}]'::jsonb, 'trainer', null, null, null, 393, '[]'::jsonb, false),
  ('848b054a-c505-5382-a169-f71ff32e9fc7', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":5,"level":25},{"dex":17,"level":25},{"dex":102,"level":23}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('81559d47-b354-5182-9e7f-225272dbcc19', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":2,"level":25},{"dex":17,"level":25},{"dex":130,"level":23}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('ef343241-f13a-5ffe-9347-dfd168f1b19b', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":9,"level":40},{"dex":58,"level":38},{"dex":18,"level":37}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('76fb8203-f5fe-5921-b83d-9dacfa73c971', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":3,"level":40},{"dex":130,"level":38},{"dex":18,"level":37}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false)
on conflict (id) do nothing;

update trainers set rival_of = 4 where id = '8ac18ebf-ef70-5887-9076-1714e5870d7b' and rival_of is null;
update trainers set rival_of = 1 where id = '82eb7a7a-2fa5-5a69-9e84-a56fb850da5d' and rival_of is null;

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select v.id, 'cb642e3e-986b-5430-b507-7baf6cc0567b'::uuid, v.dex, 3, v.lo, v.hi
from (values
  ('494d86ab-6221-5002-8c18-2c5fb23fa97c'::uuid, 1, 60, 76),
  ('500fe10a-8d09-5dc9-a554-cef31bc92f48'::uuid, 4, 60, 76),
  ('5db429ce-36e1-537e-816a-ab5f4de2e2b0'::uuid, 7, 60, 76)
) v(id, dex, lo, hi)
where exists (select 1 from areas where id = 'cb642e3e-986b-5430-b507-7baf6cc0567b')
on conflict (id) do nothing;

insert into game_config (key, value) values ('rivals', '{"access":"off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('giftMoments', '{"access":"off","eggHours":6}'::jsonb) on conflict (key) do nothing;

-- The two switches join the side quests' server check (0111): the same function, the same four keys.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
