-- Progression raids (docs/24, the user's design of 2026-10-12). Every area boss but the mythicals is a raid of its
-- own area, open once the area is completed, fought until caught; your team for it comes from that region's Box and
-- stays on it, so friends can bring it to their own. The mythicals are their lairs' bosses again (never shiny there),
-- and their days of the raid calendar are shiny. Written by `pnpm progress-raids-sql` from src/data. Safe to run
-- again. Deploy the client first: an older one would show a raid boss as a plain boss. (Live ran it on 2026-10-12 as
-- 0044_progress_raids.sql, before Trades took 0044: same statements.)
begin;

-- ---------------------------------------------------------------- the areas

-- 1. The mythicals back as their lairs' bosses (20 lairs).
-- Newmoon Island: #491
update areas set legendary_boss = '[{"dex":491,"level":60,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":491}]'::jsonb);
-- Ilex Shrine: #251
update areas set legendary_boss = '[{"dex":251,"level":50}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '100e6644-3f5b-553a-ad22-e26551b04edc' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":251}]'::jsonb);
-- Faraway Island: #151
update areas set legendary_boss = '[{"dex":151,"level":65,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '050ff505-ff8e-5251-8499-842a2cfc2986' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":151}]'::jsonb);
-- The Seabreak Path: #489, #490
update areas set legendary_boss = '[{"dex":489,"level":50,"teamAvgThreshold":0},{"dex":490,"level":55,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":489},{"dex":490}]'::jsonb);
-- Flower Paradise: #492
update areas set legendary_boss = '[{"dex":492,"level":60,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = 'fc27382b-919d-50d0-9f21-23dd16cf99d0' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":492}]'::jsonb);
-- The Diamond Domain: #719
update areas set legendary_boss = '[{"dex":719,"level":65,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '64740605-3951-57d0-9217-1d9ad7752eff' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":719}]'::jsonb);
-- Hoopa's Ring: #720
update areas set legendary_boss = '[{"dex":720,"level":68,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '532b27a7-bfb1-5b03-ae0f-a611995dffa2' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":720}]'::jsonb);
-- The Nebel Plateau: #721
update areas set legendary_boss = '[{"dex":721,"level":70,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '9394fdfc-182a-5c7d-92a2-3fb38c339f28' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":721}]'::jsonb);
-- Birth Island: #385, #386
update areas set legendary_boss = '[{"dex":385,"level":60,"teamAvgThreshold":0},{"dex":386,"level":65,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '57008453-b26b-5c52-a88e-e777d39ab364' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":385},{"dex":386}]'::jsonb);
-- The Hall of Origin: #493
update areas set legendary_boss = '[{"dex":493,"level":70,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = 'df1bb846-fc11-590f-afec-45ef39b63deb' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":493}]'::jsonb);
-- Magearna's Workshop: #801
update areas set legendary_boss = '[{"dex":801,"level":65,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '28487bdf-d4f4-5fc9-860e-accef6b9677f' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":801}]'::jsonb);
-- Ten Carat Hill's Farthest Hollow: #802
update areas set legendary_boss = '[{"dex":802,"level":67,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = 'e8c9b515-3421-5bdb-ade2-b101f1e6885d' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":802}]'::jsonb);
-- The Blush Mountain Storm: #807
update areas set legendary_boss = '[{"dex":807,"level":70,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":807}]'::jsonb);
-- The Mystery Box: #808
update areas set legendary_boss = '[{"dex":808,"level":40,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = 'bf277850-73f7-569e-8657-fa5298161229' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":808}]'::jsonb);
-- The Forest of Focus: #893
update areas set legendary_boss = '[{"dex":893,"level":70,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '4aed8f3a-c216-5713-ac05-5a66d5c6998e' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":893}]'::jsonb);
-- Kitakami Hall: #1025
update areas set legendary_boss = '[{"dex":1025,"level":88,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '168b74c9-3359-5581-a214-1f5be8da9b3e' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":1025}]'::jsonb);
-- The P2 Laboratory: #649
update areas set legendary_boss = '[{"dex":649,"level":60}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = 'e3ab5fdf-99ee-5feb-b6fd-1d47352b267e' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":649}]'::jsonb);
-- Liberty Garden: #494
update areas set legendary_boss = '[{"dex":494,"level":30,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = '285d4dfb-dd01-59eb-a632-0602a135a88e' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":494}]'::jsonb);
-- The Castelia Café: #648
update areas set legendary_boss = '[{"dex":648,"level":50,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = 'f014aa64-1215-5a78-be22-b1ee72f0d1e7' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":648}]'::jsonb);
-- The Moor of Icirrus Spring: #647
update areas set legendary_boss = '[{"dex":647,"level":55,"teamAvgThreshold":0}]'::jsonb || coalesce((
    select jsonb_agg(b order by o) from jsonb_array_elements(legendary_boss) with ordinality e(b, o)
    where not ((b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]))), '[]'::jsonb)
  where id = 'a536039f-e897-5697-a75e-15d8060e96e3' and not (coalesce(legendary_boss, '[]'::jsonb) @> '[{"dex":647}]'::jsonb);

-- 2. Every other boss is a raid; a mythical never is.
update areas a set legendary_boss = (
    select jsonb_agg(case when (b ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]) then b - 'raid' else b || '{"raid": true}'::jsonb end
                     order by o)
    from jsonb_array_elements(a.legendary_boss) with ordinality e(b, o))
  where jsonb_typeof(a.legendary_boss) = 'array' and jsonb_array_length(a.legendary_boss) > 0;

-- 3. An area with a boss is completable: a round at least, and something to meet in it.
update areas set rounds_to_clear = 1
  where rounds_to_clear is null and jsonb_typeof(legendary_boss) = 'array' and jsonb_array_length(legendary_boss) > 0;
-- 40 lairs' round of wild Pokémon, under the bundle's stable ids.
insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select v.id::uuid, v.area_id::uuid, v.dex, v.weight, v.min_level, v.max_level from (values
  ('d283de4f-a64a-5ae2-970f-6cf4a0636747', '1bef9b55-6556-5a47-b728-8dc5dba851c7', 219, 10, 50, 62),
  ('e4e9b02c-77a2-575a-97aa-244d4d09487e', '1bef9b55-6556-5a47-b728-8dc5dba851c7', 324, 8, 50, 62),
  ('bd65b1ab-65c0-55eb-a958-3b5e5f8ec94c', '1bef9b55-6556-5a47-b728-8dc5dba851c7', 460, 6, 50, 62),
  ('fc56deae-4781-5147-8fd8-1cd814bf8611', '1bef9b55-6556-5a47-b728-8dc5dba851c7', 461, 4, 50, 62),
  ('d27b29a4-307e-5e1a-9569-0bacedbcacf6', '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c', 219, 10, 55, 66),
  ('4c43bc34-ce81-5b66-9bed-0b92b7843a88', '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c', 324, 8, 55, 66),
  ('8158fa80-f735-5e06-8ea2-72fce712dcba', '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c', 460, 6, 55, 66),
  ('a917ee3a-881c-5338-8a50-6ca22a9a5c6e', '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c', 461, 4, 55, 66),
  ('50cdaec8-d587-5160-ad81-dc17bcf09bf5', '2c96595d-9064-52e8-be08-f39fe15acac3', 460, 10, 40, 50),
  ('e61dc18b-2342-55f2-a941-33a1e14dbaeb', '2c96595d-9064-52e8-be08-f39fe15acac3', 417, 8, 40, 50),
  ('719447d5-c0c2-511e-9b45-b06e2e2c6949', '2c96595d-9064-52e8-be08-f39fe15acac3', 225, 6, 40, 50),
  ('739cc8e3-eb49-50f3-ab95-8cfed7e38c86', '2c96595d-9064-52e8-be08-f39fe15acac3', 308, 4, 40, 50),
  ('f1b47233-ec3e-55c0-bdbe-a572551cd3f2', '050ff505-ff8e-5251-8499-842a2cfc2986', 20, 10, 60, 70),
  ('428fac49-0d4d-5967-85ad-86ad47666cd3', '050ff505-ff8e-5251-8499-842a2cfc2986', 49, 8, 60, 70),
  ('574ea22a-38a6-5886-8cc6-ee260a2e088c', '050ff505-ff8e-5251-8499-842a2cfc2986', 105, 6, 60, 70),
  ('01ad9614-55c9-59e4-8d1b-f3452c0da103', '050ff505-ff8e-5251-8499-842a2cfc2986', 22, 4, 60, 70),
  ('1a51620b-6b7b-5189-badf-524f80dbe97e', '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e', 219, 10, 50, 62),
  ('addd2bbe-377a-5628-808c-ae70cdbeb01d', '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e', 324, 8, 50, 62),
  ('2fb394fa-c57d-53cb-8ca4-10c3354b240f', '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e', 460, 6, 50, 62),
  ('84d07b2a-7e70-588b-a658-f7f71502da74', '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e', 461, 4, 50, 62),
  ('417e8351-4c13-55b8-a828-3f5c36633779', 'fc27382b-919d-50d0-9f21-23dd16cf99d0', 219, 10, 55, 68),
  ('7f3a5734-b408-549b-b80f-ac2bcd19cd53', 'fc27382b-919d-50d0-9f21-23dd16cf99d0', 324, 8, 55, 68),
  ('80cecbb3-8cb8-53e0-a02d-2ca8c083ccfc', 'fc27382b-919d-50d0-9f21-23dd16cf99d0', 460, 6, 55, 68),
  ('b3e6dae8-a5e1-5e66-98e8-a1c4fd6f72fa', 'fc27382b-919d-50d0-9f21-23dd16cf99d0', 461, 4, 55, 68),
  ('92637753-782c-5101-9f65-fe3cc1659f24', '3a1aeecf-7492-5b10-a8ca-909a574d61f5', 632, 10, 60, 70),
  ('c8293673-0528-5d62-97e3-4259879bd2a1', '3a1aeecf-7492-5b10-a8ca-909a574d61f5', 76, 8, 60, 70),
  ('e03542f7-b24e-512e-8bf9-1814b8648363', '3a1aeecf-7492-5b10-a8ca-909a574d61f5', 168, 6, 60, 70),
  ('c244aaf8-5928-505d-a761-d212b0079555', '3a1aeecf-7492-5b10-a8ca-909a574d61f5', 28, 4, 60, 70),
  ('10387934-a8b6-5838-ab57-9cd17aabfe99', '64740605-3951-57d0-9217-1d9ad7752eff', 168, 10, 60, 68),
  ('8c6cf153-cf6f-598f-883c-07d2ff1bee02', '64740605-3951-57d0-9217-1d9ad7752eff', 327, 8, 60, 68),
  ('efbbc7ba-2cab-584d-9281-7a0acd834596', '64740605-3951-57d0-9217-1d9ad7752eff', 334, 6, 60, 68),
  ('933a623f-60db-5f18-93b5-15e13e758ac6', '64740605-3951-57d0-9217-1d9ad7752eff', 632, 4, 60, 68),
  ('d4a31b86-5582-5f6c-af5d-4eec02de81fc', '532b27a7-bfb1-5b03-ae0f-a611995dffa2', 632, 10, 62, 70),
  ('ae7c08ec-42a7-5fb0-8bb7-e3c1f6509241', '532b27a7-bfb1-5b03-ae0f-a611995dffa2', 76, 8, 62, 70),
  ('e6f4f99e-c199-591f-b6a5-9ebb0b5edf58', '532b27a7-bfb1-5b03-ae0f-a611995dffa2', 168, 6, 62, 70),
  ('5542af7d-e359-5bbb-a599-726a830cdf46', '532b27a7-bfb1-5b03-ae0f-a611995dffa2', 28, 4, 62, 70),
  ('8874ac4d-a10d-50d9-914c-90f4607ef1c9', '9394fdfc-182a-5c7d-92a2-3fb38c339f28', 632, 10, 64, 72),
  ('482e5b4f-c00f-5883-bf10-d8dd4599b1fa', '9394fdfc-182a-5c7d-92a2-3fb38c339f28', 76, 8, 64, 72),
  ('72730006-5064-5b20-86eb-af2efbd37477', '9394fdfc-182a-5c7d-92a2-3fb38c339f28', 168, 6, 64, 72),
  ('9f489404-4470-5362-adf5-5a4273765f85', '9394fdfc-182a-5c7d-92a2-3fb38c339f28', 28, 4, 64, 72),
  ('1319dec6-c5d0-5bc3-83b6-dc0bf167db59', 'a33bf12e-2ad9-5a79-bfe7-6224579f9a32', 279, 10, 40, 48),
  ('398bb114-52e5-5fb0-abe5-28090ef472cf', 'a33bf12e-2ad9-5a79-bfe7-6224579f9a32', 10106, 8, 40, 48),
  ('b3658935-f8a8-5684-9ce8-dfb2d9f9cad1', 'a33bf12e-2ad9-5a79-bfe7-6224579f9a32', 210, 6, 40, 48),
  ('7b454de3-b181-50e7-98e6-b76795cb920e', 'a33bf12e-2ad9-5a79-bfe7-6224579f9a32', 359, 4, 40, 48),
  ('ee8dc549-1d5b-5f76-a9b1-cd9c5f961a98', 'df1bb846-fc11-590f-afec-45ef39b63deb', 219, 10, 60, 75),
  ('ff16df05-eb74-528b-b689-da3d05cf9741', 'df1bb846-fc11-590f-afec-45ef39b63deb', 324, 8, 60, 75),
  ('8773283e-36f2-5007-b25f-e9388cfc01f3', 'df1bb846-fc11-590f-afec-45ef39b63deb', 232, 6, 60, 75),
  ('dfff2c36-7ffb-5810-9eb9-381214d43f0c', 'df1bb846-fc11-590f-afec-45ef39b63deb', 430, 4, 60, 75),
  ('bac5666b-1156-5a03-a6cb-0522305291ee', '16780c62-8411-5637-abec-7257a04e2e3c', 770, 10, 60, 70),
  ('5fa1fc43-cf1b-5bbe-b80c-f289cec3f02e', '16780c62-8411-5637-abec-7257a04e2e3c', 776, 8, 60, 70),
  ('9a9e6ccc-2904-56eb-a910-bdf673f13f24', '16780c62-8411-5637-abec-7257a04e2e3c', 553, 6, 60, 70),
  ('0ce2e2c5-f5b6-5c8e-9733-f058702a75c2', '16780c62-8411-5637-abec-7257a04e2e3c', 738, 4, 60, 70),
  ('4343136c-4fbf-59b2-aad5-769a3a5a2cc4', 'fa01d16e-8669-5542-be05-f5d8d16395d1', 776, 10, 64, 74),
  ('5df0f716-d382-5887-b748-9393f177bffe', 'fa01d16e-8669-5542-be05-f5d8d16395d1', 754, 8, 64, 74),
  ('2d98941a-20d1-5374-9d97-58e10b7158dc', 'fa01d16e-8669-5542-be05-f5d8d16395d1', 756, 6, 64, 74),
  ('e9190d6d-11ed-58d2-a92d-418048b4eac1', 'fa01d16e-8669-5542-be05-f5d8d16395d1', 763, 4, 64, 74),
  ('8e0a9652-2ff8-5cf8-a6b9-29d435446722', '65b4d722-2dfa-5a76-826b-4978a2ee9279', 604, 10, 58, 66),
  ('12bef4c3-90b3-5f4a-a4fd-7de6f1faa123', '65b4d722-2dfa-5a76-826b-4978a2ee9279', 748, 8, 58, 66),
  ('06383d69-2daf-5502-8848-d8c25c6b75f2', '65b4d722-2dfa-5a76-826b-4978a2ee9279', 770, 6, 58, 66),
  ('14d9234c-6319-54e8-81ef-1f579573c369', '65b4d722-2dfa-5a76-826b-4978a2ee9279', 428, 4, 58, 66),
  ('44188ac8-5759-5581-914a-53a0539f563a', '4c3e26b2-3163-556e-b4d4-d628e1ff4120', 776, 10, 64, 72),
  ('d629a430-a9c1-580f-98ef-92fd7b168221', '4c3e26b2-3163-556e-b4d4-d628e1ff4120', 754, 8, 64, 72),
  ('59f23a48-040f-5848-8b08-ec1cb5f57bb8', '4c3e26b2-3163-556e-b4d4-d628e1ff4120', 756, 6, 64, 72),
  ('e40324c2-0278-580f-bb00-285e17f55272', '4c3e26b2-3163-556e-b4d4-d628e1ff4120', 763, 4, 64, 72),
  ('78279277-606b-5847-8fb5-6a903c0e9d9f', 'ad40171a-6414-5510-bafe-44d13217d218', 748, 10, 50, 60),
  ('abb036dc-fa04-53d4-a745-c8d109f2113c', 'ad40171a-6414-5510-bafe-44d13217d218', 770, 8, 50, 60),
  ('8c387e12-77e9-593a-88c9-5672dbc1d5ff', 'ad40171a-6414-5510-bafe-44d13217d218', 553, 6, 50, 60),
  ('3a3ae6c6-430a-581f-99f0-94d9416ed100', 'ad40171a-6414-5510-bafe-44d13217d218', 738, 4, 50, 60),
  ('6a0970e2-c094-57d2-a46f-1b0a9c5d6948', '28487bdf-d4f4-5fc9-860e-accef6b9677f', 604, 10, 60, 68),
  ('53fe1f25-1a08-55b3-af0d-db5d0f1633a5', '28487bdf-d4f4-5fc9-860e-accef6b9677f', 748, 8, 60, 68),
  ('490fa33f-38eb-57e9-abbe-7baaf6d68bc1', '28487bdf-d4f4-5fc9-860e-accef6b9677f', 770, 6, 60, 68),
  ('94b9f2d2-14fb-59b9-bd59-869fa7f58111', '28487bdf-d4f4-5fc9-860e-accef6b9677f', 428, 4, 60, 68),
  ('ada473c1-1aac-5e29-80d8-d42983f83d6c', 'e8c9b515-3421-5bdb-ade2-b101f1e6885d', 770, 10, 62, 70),
  ('b1370f0c-334a-59c9-a734-b78c077ed003', 'e8c9b515-3421-5bdb-ade2-b101f1e6885d', 776, 8, 62, 70),
  ('3a220ad7-45d9-5620-99c4-7ce690f3e5a5', 'e8c9b515-3421-5bdb-ade2-b101f1e6885d', 553, 6, 62, 70),
  ('67034e59-ff3c-5271-a22b-0dd05365c1ef', 'e8c9b515-3421-5bdb-ade2-b101f1e6885d', 738, 4, 62, 70),
  ('4500c8ce-0548-5520-b093-1701718c1782', '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4', 776, 10, 64, 72),
  ('0aef6d03-52e7-5c6e-bf09-452381ca068c', '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4', 754, 8, 64, 72),
  ('8d98ef6a-7782-514e-b5ea-60fcb9db1e12', '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4', 756, 6, 64, 72),
  ('db2d1057-fb6b-5f75-9fb8-599817f5242a', '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4', 763, 4, 64, 72),
  ('7edd951d-7782-5132-8237-b02b8d68152a', 'bf277850-73f7-569e-8657-fa5298161229', 279, 10, 40, 50),
  ('02774e4b-d415-5a6c-a436-8181434e17d4', 'bf277850-73f7-569e-8657-fa5298161229', 10106, 8, 40, 50),
  ('e0133b1d-1d48-5c5e-918f-e4b502ae35d6', 'bf277850-73f7-569e-8657-fa5298161229', 210, 6, 40, 50),
  ('18aba2b6-72dc-5ee5-b766-88b7f4387bb4', 'bf277850-73f7-569e-8657-fa5298161229', 359, 4, 40, 50),
  ('e43acd04-a07a-5f19-8cdb-0af9192c145c', '96249330-8b71-592c-9f49-55e62a34c1a3', 766, 10, 60, 70),
  ('e28104b8-9e16-531e-bca7-3c7f0bcc1249', '96249330-8b71-592c-9f49-55e62a34c1a3', 765, 8, 60, 70),
  ('2c8a14cb-34f7-53e5-be5a-a8bc691cf9d9', '96249330-8b71-592c-9f49-55e62a34c1a3', 820, 6, 60, 70),
  ('b57b7199-9c3f-5ceb-88b2-8dac0653788c', '96249330-8b71-592c-9f49-55e62a34c1a3', 760, 4, 60, 70),
  ('45b7ae88-2419-586b-b763-e920eb674d8e', '684730bd-a885-5020-bb88-197e9d5d60d7', 534, 10, 64, 74),
  ('a2ce15cc-0c5d-5710-899b-c3a05d4e656b', '684730bd-a885-5020-bb88-197e9d5d60d7', 748, 8, 64, 74),
  ('50eb5478-a081-50b1-be54-a45ce52d1b49', '684730bd-a885-5020-bb88-197e9d5d60d7', 845, 6, 64, 74),
  ('86c746ec-3045-510c-a2c1-17f0c7bc38ce', '684730bd-a885-5020-bb88-197e9d5d60d7', 871, 4, 64, 74),
  ('b9f38750-5247-586a-b3ee-46f30da0ed96', 'ee242291-8416-583c-a0b0-6ed4d7b16b60', 460, 10, 50, 60),
  ('5aa26c4d-834b-50b4-b831-aaa1d7ab5a1e', 'ee242291-8416-583c-a0b0-6ed4d7b16b60', 614, 8, 50, 60),
  ('a5ae1350-bc29-5531-a751-12d4d7e90037', 'ee242291-8416-583c-a0b0-6ed4d7b16b60', 534, 6, 50, 60),
  ('a6848f54-3cab-50b7-b421-d862e6d613f4', 'ee242291-8416-583c-a0b0-6ed4d7b16b60', 748, 4, 50, 60),
  ('aa8bafcd-0c14-5f1d-9b32-661548cfc45e', '8312c104-010a-5c23-8520-4c355292b850', 766, 10, 62, 70),
  ('369c2b69-d99e-5872-b611-ede00670558d', '8312c104-010a-5c23-8520-4c355292b850', 765, 8, 62, 70),
  ('48969f4c-86a0-582a-b7af-b996aaa71fe1', '8312c104-010a-5c23-8520-4c355292b850', 820, 6, 62, 70),
  ('e4c70a2a-c691-5639-8ea9-9d50b82c424f', '8312c104-010a-5c23-8520-4c355292b850', 760, 4, 62, 70),
  ('d0adc2f2-848c-5d18-9e92-b96139eb9c7a', '94ab9674-c4da-5094-9f7c-f9dcfec326b9', 534, 10, 66, 76),
  ('859a6fd4-d7e1-5055-a758-063587e71149', '94ab9674-c4da-5094-9f7c-f9dcfec326b9', 748, 8, 66, 76),
  ('dda9af3b-b95d-585a-ac04-223793c3f655', '94ab9674-c4da-5094-9f7c-f9dcfec326b9', 845, 6, 66, 76),
  ('a126ed7a-560a-51f8-ac5b-e4abd5c78d0e', '94ab9674-c4da-5094-9f7c-f9dcfec326b9', 871, 4, 66, 76),
  ('9e295eec-bf06-505d-9ec3-d08280ceb829', '79ae0fff-8541-541b-9370-4a50b19cec73', 534, 10, 66, 74),
  ('6e7bae3e-c474-566d-8e3a-028233b5d28c', '79ae0fff-8541-541b-9370-4a50b19cec73', 748, 8, 66, 74),
  ('cbb7085b-813f-5184-9cab-196add4dd72f', '79ae0fff-8541-541b-9370-4a50b19cec73', 845, 6, 66, 74),
  ('23cfb3c2-5c85-5a36-bcd6-29771c90e94f', '79ae0fff-8541-541b-9370-4a50b19cec73', 871, 4, 66, 74),
  ('6fc4d746-e5c0-5fca-8eaa-ec370865f2db', 'de407c38-0217-5037-a688-18d5199f1d1b', 164, 10, 66, 76),
  ('d7d52b02-64b9-53f1-b2d6-0c64cdac36a2', 'de407c38-0217-5037-a688-18d5199f1d1b', 469, 8, 66, 76),
  ('8a11d6fb-61a5-5176-99ad-3cf5aa6517ba', 'de407c38-0217-5037-a688-18d5199f1d1b', 970, 6, 66, 76),
  ('ac163841-2621-5c8f-a727-4235a7f37b46', 'de407c38-0217-5037-a688-18d5199f1d1b', 984, 4, 66, 76),
  ('3882c15a-470c-5427-be1c-55afdb2cf871', '3306e59f-b7a1-5696-8a98-3122162d0320', 934, 10, 56, 64),
  ('abac7c65-6ee8-5183-a78a-a04fba922e54', '3306e59f-b7a1-5696-8a98-3122162d0320', 941, 8, 56, 64),
  ('2d23c2cf-1e1f-525d-a890-370be438e093', '3306e59f-b7a1-5696-8a98-3122162d0320', 943, 6, 56, 64),
  ('b0628919-82fc-59e3-99fb-776e085ced44', '3306e59f-b7a1-5696-8a98-3122162d0320', 949, 4, 56, 64),
  ('58637fee-34df-5707-b3b2-e487367f3fff', '81a9b321-6fb5-5285-b71f-327d8b52b391', 164, 10, 66, 74),
  ('4c73b97a-68d2-5e0e-a4d6-d61874ffa58f', '81a9b321-6fb5-5285-b71f-327d8b52b391', 469, 8, 66, 74),
  ('68a2237d-dc1b-50ea-953c-056d8b7abaae', '81a9b321-6fb5-5285-b71f-327d8b52b391', 970, 6, 66, 74),
  ('088c2fa4-75b9-59e6-ab66-0f01bf2fac62', '81a9b321-6fb5-5285-b71f-327d8b52b391', 984, 4, 66, 74),
  ('974bcd15-e07e-53ea-81d5-0313d305c71d', 'c565e910-b4c6-5271-9bee-9ff2795d0615', 164, 10, 66, 74),
  ('0994430e-cf11-5a36-af6d-ecf9621750b5', 'c565e910-b4c6-5271-9bee-9ff2795d0615', 469, 8, 66, 74),
  ('fafccb25-8aa3-5dea-82a5-70e88b4f1215', 'c565e910-b4c6-5271-9bee-9ff2795d0615', 970, 6, 66, 74),
  ('17adce47-5e10-5bdd-9378-8bbd8fa93f19', 'c565e910-b4c6-5271-9bee-9ff2795d0615', 984, 4, 66, 74),
  ('a63638c3-0dbc-55d8-a805-4651e85cd77d', 'a9d3ca76-7fd7-5428-9cd4-78123a2c0e5b', 164, 10, 70, 80),
  ('d7d49a61-4f88-56d2-a892-3f9a337e9ebd', 'a9d3ca76-7fd7-5428-9cd4-78123a2c0e5b', 227, 8, 70, 80),
  ('c69fef93-bb47-5e9a-b19e-d2274d3f67fb', 'a9d3ca76-7fd7-5428-9cd4-78123a2c0e5b', 323, 6, 70, 80),
  ('8e8741ba-5431-5475-b2d2-36200c4c63b1', 'a9d3ca76-7fd7-5428-9cd4-78123a2c0e5b', 469, 4, 70, 80),
  ('fca7b56b-f057-5f91-8551-d7b70781ffa3', '679952cf-16ca-5cf8-82f9-e57b382d4c71', 164, 10, 78, 88),
  ('18c0343e-95b8-5fc6-8ff0-6a473c66deec', '679952cf-16ca-5cf8-82f9-e57b382d4c71', 227, 8, 78, 88),
  ('839b7185-96f5-583f-a4f7-fa110ef48fa9', '679952cf-16ca-5cf8-82f9-e57b382d4c71', 323, 6, 78, 88),
  ('790acacb-5077-5b48-98cf-55fb8e1cd435', '679952cf-16ca-5cf8-82f9-e57b382d4c71', 469, 4, 78, 88),
  ('4d8eb358-e4d6-5de6-8782-57ee0fe21b6f', '168b74c9-3359-5581-a214-1f5be8da9b3e', 164, 10, 80, 90),
  ('2e9c06e8-4f4b-51e6-a35c-e78c2ba30f39', '168b74c9-3359-5581-a214-1f5be8da9b3e', 227, 8, 80, 90),
  ('810f9996-f4a8-5064-baa1-9329019c409a', '168b74c9-3359-5581-a214-1f5be8da9b3e', 323, 6, 80, 90),
  ('43a9f276-f63a-5637-a456-e7b77d4f4c7d', '168b74c9-3359-5581-a214-1f5be8da9b3e', 469, 4, 80, 90),
  ('005c7b23-b06a-57c1-9757-da1dec631280', '285d4dfb-dd01-59eb-a632-0602a135a88e', 523, 10, 25, 33),
  ('ee5b1caa-bbcb-5078-b5cd-c12df0662b99', '285d4dfb-dd01-59eb-a632-0602a135a88e', 505, 8, 25, 33),
  ('6b128296-e8ed-5c0e-9891-f118038dc952', '285d4dfb-dd01-59eb-a632-0602a135a88e', 587, 6, 25, 33),
  ('b49d79ab-10e1-5ed1-bfe2-f53437386b30', '285d4dfb-dd01-59eb-a632-0602a135a88e', 585, 4, 25, 33),
  ('a5024591-7706-5cc9-be49-487e27810ea8', 'f014aa64-1215-5a78-be22-b1ee72f0d1e7', 530, 10, 45, 55),
  ('85aac1c7-b9ad-5c0d-a5c5-33a869b2d25f', 'f014aa64-1215-5a78-be22-b1ee72f0d1e7', 626, 8, 45, 55),
  ('0971fb74-369b-5703-826e-a86551621e4b', 'f014aa64-1215-5a78-be22-b1ee72f0d1e7', 526, 6, 45, 55),
  ('c2699923-3642-57eb-ac59-433a4a0662e4', 'f014aa64-1215-5a78-be22-b1ee72f0d1e7', 542, 4, 45, 55),
  ('908415c1-609a-57ea-ab09-b2e85ec498d1', '2064be7d-daf4-56ee-a5c2-8a805ccac0d5', 632, 10, 48, 56),
  ('7d79920f-c1cf-5875-8eff-73bf62494d83', '2064be7d-daf4-56ee-a5c2-8a805ccac0d5', 530, 8, 48, 56),
  ('1ab24ff3-aa3d-5fef-b7ce-22a8cc9e3808', '2064be7d-daf4-56ee-a5c2-8a805ccac0d5', 526, 6, 48, 56),
  ('e648de0f-93ef-523e-bc96-b57de10d9c24', '2064be7d-daf4-56ee-a5c2-8a805ccac0d5', 542, 4, 48, 56),
  ('e9df1e48-5aaf-5ef9-99e7-977eba574b51', 'a536039f-e897-5697-a75e-15d8060e96e3', 632, 10, 50, 58),
  ('874a1246-9b0d-50ea-8ce9-4bb7144afa10', 'a536039f-e897-5697-a75e-15d8060e96e3', 530, 8, 50, 58),
  ('f423c996-810e-55ab-8f09-f911fcfcb98f', 'a536039f-e897-5697-a75e-15d8060e96e3', 526, 6, 50, 58),
  ('560abfd7-ab8b-5ac4-8ae4-f69cbc197057', 'a536039f-e897-5697-a75e-15d8060e96e3', 542, 4, 50, 58),
  ('47db8f3f-446f-54ed-b5de-58292c4b6d2b', '3a951f35-e83d-5ac1-b2a3-2cfe91620fb4', 526, 10, 52, 62),
  ('2a8a2608-ec68-575d-9e7d-1e675205384d', '3a951f35-e83d-5ac1-b2a3-2cfe91620fb4', 542, 8, 52, 62),
  ('4b766f86-0190-58ec-a0f3-1f9510a937dd', '3a951f35-e83d-5ac1-b2a3-2cfe91620fb4', 545, 6, 52, 62),
  ('f079a80a-b0c1-55c0-9b17-761d7a556e0b', '3a951f35-e83d-5ac1-b2a3-2cfe91620fb4', 596, 4, 52, 62),
  ('2af219b9-5d51-53f6-8f41-f8635063be18', 'e8936c27-eded-53f7-ad42-8c6eea16f5f6', 534, 10, 66, 74),
  ('f06bf1d0-a777-53c6-a164-7f7e56ebd814', 'e8936c27-eded-53f7-ad42-8c6eea16f5f6', 748, 8, 66, 74),
  ('c516b514-9719-5d78-8579-aa28fd8bd933', 'e8936c27-eded-53f7-ad42-8c6eea16f5f6', 845, 6, 66, 74),
  ('f11e5783-9ebb-57eb-bb47-7183dce7ad51', 'e8936c27-eded-53f7-ad42-8c6eea16f5f6', 871, 4, 66, 74)
) v(id, area_id, dex, weight, min_level, max_level)
where exists (select 1 from areas x where x.id = v.area_id::uuid) and exists (select 1 from pokemon p where p.dex = v.dex)
on conflict (id) do nothing;
update areas set encounter_weights = encounter_weights || jsonb_build_object(
    'wild', greatest(coalesce((encounter_weights ->> 'wild')::numeric, 0), 8),
    'center', least(coalesce((encounter_weights ->> 'center')::numeric, 0), 1))
  where id in ('1bef9b55-6556-5a47-b728-8dc5dba851c7', '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c', '2c96595d-9064-52e8-be08-f39fe15acac3', '050ff505-ff8e-5251-8499-842a2cfc2986', '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e', 'fc27382b-919d-50d0-9f21-23dd16cf99d0', '3a1aeecf-7492-5b10-a8ca-909a574d61f5', '64740605-3951-57d0-9217-1d9ad7752eff', '532b27a7-bfb1-5b03-ae0f-a611995dffa2', '9394fdfc-182a-5c7d-92a2-3fb38c339f28', 'a33bf12e-2ad9-5a79-bfe7-6224579f9a32', 'df1bb846-fc11-590f-afec-45ef39b63deb', '16780c62-8411-5637-abec-7257a04e2e3c', 'fa01d16e-8669-5542-be05-f5d8d16395d1', '65b4d722-2dfa-5a76-826b-4978a2ee9279', '4c3e26b2-3163-556e-b4d4-d628e1ff4120', 'ad40171a-6414-5510-bafe-44d13217d218', '28487bdf-d4f4-5fc9-860e-accef6b9677f', 'e8c9b515-3421-5bdb-ade2-b101f1e6885d', '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4', 'bf277850-73f7-569e-8657-fa5298161229', '96249330-8b71-592c-9f49-55e62a34c1a3', '684730bd-a885-5020-bb88-197e9d5d60d7', 'ee242291-8416-583c-a0b0-6ed4d7b16b60', '8312c104-010a-5c23-8520-4c355292b850', '94ab9674-c4da-5094-9f7c-f9dcfec326b9', '79ae0fff-8541-541b-9370-4a50b19cec73', 'de407c38-0217-5037-a688-18d5199f1d1b', '3306e59f-b7a1-5696-8a98-3122162d0320', '81a9b321-6fb5-5285-b71f-327d8b52b391', 'c565e910-b4c6-5271-9bee-9ff2795d0615', 'a9d3ca76-7fd7-5428-9cd4-78123a2c0e5b', '679952cf-16ca-5cf8-82f9-e57b382d4c71', '168b74c9-3359-5581-a214-1f5be8da9b3e', '285d4dfb-dd01-59eb-a632-0602a135a88e', 'f014aa64-1215-5a78-be22-b1ee72f0d1e7', '2064be7d-daf4-56ee-a5c2-8a805ccac0d5', 'a536039f-e897-5697-a75e-15d8060e96e3', '3a951f35-e83d-5ac1-b2a3-2cfe91620fb4', 'e8936c27-eded-53f7-ad42-8c6eea16f5f6');

-- ---------------------------------------------------------------- the events row

-- The mythicals' fixed dates are shiny, as their days of the calendar are: the two together keep the calendar's order.
update game_config set value = jsonb_set(value, '{raid,calendar,anchors}', (
    select coalesce(jsonb_agg(case when (x ->> 'dex')::int = any (array[151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025]) then jsonb_set(x, '{shiny}', 'true') else x end
                              order by o), '[]'::jsonb)
    from jsonb_array_elements(value -> 'raid' -> 'calendar' -> 'anchors') with ordinality e(x, o)))
  where key = 'events' and jsonb_typeof(value -> 'raid' -> 'calendar' -> 'anchors') = 'array';

-- The progression raids' own numbers: the team cap, and none of their own yet.
update game_config set value = jsonb_set(value, '{raid,progress}', '{"teamCap":50,"perMon":{}}'::jsonb)
  where key = 'events' and jsonb_typeof(value -> 'raid') = 'object' and not (value -> 'raid' ? 'progress');

-- ---------------------------------------------------------------- the teams left on a raid, the raids caught

create table if not exists raid_progress_teams (
  user_id uuid not null references auth.users(id) on delete cascade,
  realm text not null default 'main' check (realm in ('main', 'extreme')),
  raid_key text not null,            -- areaId:dex
  region text not null,              -- the raid's region: its Box is where the team came from
  team jsonb not null,               -- [{dex, level, shiny}] × 1–3, in order, level ≤ the raid's cap
  ids jsonb,                         -- the Box ids it was cloned from (only their owner sees them)
  updated_at timestamptz not null default now(),
  primary key (user_id, realm, raid_key)
);
create index if not exists raid_progress_teams_key_idx on raid_progress_teams (raid_key, realm);
alter table raid_progress_teams enable row level security;
drop policy if exists raid_progress_teams_admin on raid_progress_teams;
create policy raid_progress_teams_admin on raid_progress_teams for all using (is_admin()) with check (is_admin());
revoke all on raid_progress_teams from anon, authenticated;

create table if not exists raid_progress_done (
  user_id uuid not null references auth.users(id) on delete cascade,
  realm text not null default 'main' check (realm in ('main', 'extreme')),
  raid_key text not null,
  dex int not null,
  done_at timestamptz not null default now(),
  primary key (user_id, realm, raid_key)
);
alter table raid_progress_done enable row level security;
drop policy if exists raid_progress_done_admin on raid_progress_done;
create policy raid_progress_done_admin on raid_progress_done for all using (is_admin()) with check (is_admin());
revoke all on raid_progress_done from anon, authenticated;

-- A raid's key, areaId:dex: its Pokémon, when that area has it as a raid boss (else null, and the call is refused).
create or replace function raid_progress_dex(p_key text)
returns int
language sql stable security definer set search_path = public as $$
  select split_part(p_key, ':', 2)::int
  where p_key ~ '^[0-9a-f-]{36}:[0-9]{1,4}$'
    and exists (
      select 1 from areas a
      where a.id::text = split_part(p_key, ':', 1)
        and coalesce(a.legendary_boss, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('dex', split_part(p_key, ':', 2)::int, 'raid', true)))
$$;

-- A progression raid's team cap: its Pokémon's own, the progression default, the raid's, 50.
create or replace function raid_progress_cap(p_dex int)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif((value -> 'raid' -> 'progress' -> 'perMon' -> p_dex::text ->> 'teamCap')::int, 0) from game_config where key = 'events'),
    (select (value -> 'raid' -> 'progress' ->> 'teamCap')::int from game_config where key = 'events'),
    raid_team_cap()
  )
$$;

-- Leaves your team on a raid: 1–3 ids from that region's Box in your cloud save (its top-level Box when you're playing
-- that region, else the parked one), none resting, each at the raid's cap at most.
create or replace function raid_progress_set_team(p_key text, p_region text, p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  save jsonb;
  box jsonb;
  cap int;
  new_team jsonb;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null or coalesce(p_region, '') !~ '^[a-z]{2,20}$' then raise exception 'events_bad_raid'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) not between 1 and 3
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1) then
    raise exception 'events_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'events_no_save'; end if;
  box := case when coalesce(save ->> 'region', 'kanto') = p_region then save -> 'box' else save -> 'parked' -> p_region -> 'box' end;
  cap := raid_progress_cap(dex);
  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least((m ->> 'level')::int, cap),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) order by t.ord)
  into new_team
  from unnest(p_ids) with ordinality t(id, ord)
  join jsonb_array_elements(coalesce(box, '[]')) m on m ->> 'id' = t.id
  where m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> array_length(p_ids, 1) then raise exception 'events_not_eligible'; end if;
  insert into raid_progress_teams (user_id, realm, raid_key, region, team, ids, updated_at)
  values (me, p_realm, p_key, p_region, new_team, to_jsonb(p_ids), now())
  on conflict (user_id, realm, raid_key) do update
    set region = excluded.region, team = excluded.team, ids = excluded.ids, updated_at = now();
  return new_team;
end $$;

-- Your friends who left a team on this raid, and how many times each has helped you. 0049 gives it a last column,
-- which a create or replace can't take back: a re-run (seed.sql) drops that one first.
drop function if exists raid_progress_friend_teams(text, text);
create or replace function raid_progress_friend_teams(p_key text, p_realm text default 'main')
returns table (user_id uuid, name text, avatar text, team jsonb, helped int)
language sql stable security definer set search_path = public as $$
  select t.user_id,
         left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
         coalesce(s.data -> 'player' ->> 'avatar', s.data -> 'player' ->> 'character', 'red'),
         t.team,
         (select count(*)::int from raid_gifts g
           where g.realm = p_realm and g.helper_id = t.user_id and g.raider_id = auth.uid())
  from friend_ids_of(auth.uid()) f
  join raid_progress_teams t on t.user_id = f.id and t.realm = p_realm and t.raid_key = p_key
  left join saves s on s.user_id = t.user_id and s.realm = p_realm
  order by t.updated_at desc
$$;

-- The helpers' gifts once a raid Pokémon is caught, the day's raid's and a progression raid's alike: one per friend who
-- had a team there (the day's raid team, or one left on this raid), within each helper's gifts a UTC day. Not callable
-- from the game: raid_close and raid_progress_close call it for the signed-in raider.
create or replace function raid_give_gifts(p_me uuid, p_helpers uuid[], p_dex int, p_realm text, p_key text default null)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  midnight timestamptz := (now() at time zone 'UTC')::date at time zone 'UTC';
  cfg jsonb := (select value -> 'raid' from game_config where key = 'events');
  cap int := coalesce((cfg ->> 'helperDailyCap')::int, 5);
  gifts jsonb := coalesce(cfg -> 'gifts', '[{"key":"ultra-ball","weight":40},{"key":"hyper-potion","weight":25},{"key":"revive","weight":20},{"key":"rare-candy","weight":15}]');
  total numeric;
  roll numeric;
  pick text;
  g jsonb;
  helper uuid;
  raider text;
  given int := 0;
begin
  select sum(greatest(0, coalesce((x ->> 'weight')::numeric, 0))) into total from jsonb_array_elements(gifts) x;
  raider := left(coalesce(nullif(trim((select s.data -> 'player' ->> 'name' from saves s where s.user_id = p_me and s.realm = p_realm)), ''), 'Trainer'), 12);
  for helper in select distinct h from unnest(coalesce(p_helpers, '{}')) h loop
    continue when helper is null or helper = p_me or coalesce(total, 0) <= 0;
    continue when not exists (select 1 from friend_ids_of(p_me) f where f.id = helper);
    continue when p_key is null and not exists (select 1 from raid_teams t where t.user_id = helper and t.realm = p_realm);
    continue when p_key is not null and not exists (
      select 1 from raid_progress_teams t where t.user_id = helper and t.realm = p_realm and t.raid_key = p_key);
    continue when (select count(*) from raid_gifts x where x.realm = p_realm and x.helper_id = helper and x.created_at >= midnight) >= cap;
    roll := random() * total;
    pick := null;
    for g in select * from jsonb_array_elements(gifts) loop
      roll := roll - greatest(0, coalesce((g ->> 'weight')::numeric, 0));
      if roll < 0 then
        pick := g ->> 'key';
        exit;
      end if;
    end loop;
    continue when pick is null;
    insert into raid_gifts (realm, helper_id, raider_id, raider_name, dex, item_key)
    values (p_realm, helper, p_me, raider, p_dex, pick);
    given := given + 1;
  end loop;
  return given;
end $$;

-- The day's raid caught (0039's), its gifts now drawn by raid_give_gifts.
create or replace function raid_close(p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  st event_state;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  select * into st from event_state es where es.user_id = me and es.realm = p_realm for update;
  if st.raid is null or st.raid ->> 'day' <> today then raise exception 'events_no_raid'; end if;
  if coalesce((st.raid ->> 'caught')::boolean, false) then
    return jsonb_build_object('raidsWon', st.raids_won, 'gifts', 0);
  end if;
  update event_state es
    set raid = jsonb_set(st.raid, '{caught}', 'true'), raids_won = st.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning * into st;
  return jsonb_build_object('raidsWon', st.raids_won,
    'gifts', raid_give_gifts(me, p_helpers, (st.raid ->> 'dex')::int, p_realm));
end $$;

-- A progression raid caught: counted once per player and raid, one more raid won, the helpers' gifts.
create or replace function raid_progress_close(p_key text, p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  won int;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null then raise exception 'events_bad_raid'; end if;
  insert into event_state (user_id, realm) values (me, p_realm) on conflict (user_id, realm) do nothing;
  insert into raid_progress_done (user_id, realm, raid_key, dex) values (me, p_realm, p_key, dex)
  on conflict (user_id, realm, raid_key) do nothing;
  if not found then
    select es.raids_won into won from event_state es where es.user_id = me and es.realm = p_realm;
    return jsonb_build_object('raidsWon', won, 'gifts', 0);
  end if;
  update event_state es set raids_won = es.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning es.raids_won into won;
  return jsonb_build_object('raidsWon', won, 'gifts', raid_give_gifts(me, p_helpers, dex, p_realm, p_key));
end $$;

-- ---------------------------------------------------------------- deleting

-- 0039's, with the two new tables.
create or replace function delete_my_data(p_realm text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if p_realm is not null and p_realm not in ('main', 'extreme') then
    raise exception 'bad_realm' using errcode = '22023';
  end if;
  delete from saves where user_id = me and (p_realm is null or realm = p_realm);
  delete from player_cards where user_id = me and (p_realm is null or realm = p_realm); -- and their regions
  delete from versus_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from versus_battles where (attacker_id = me or defender_id = me) and (p_realm is null or realm = p_realm);
  delete from event_state where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_gifts where (helper_id = me or raider_id = me) and (p_realm is null or realm = p_realm);
  delete from raid_progress_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_progress_done where user_id = me and (p_realm is null or realm = p_realm);
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_attempts where actor = me::text;
  end if;
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function raid_progress_dex(text) from public, anon, authenticated;
revoke all on function raid_progress_cap(int) from public, anon, authenticated;
revoke all on function raid_give_gifts(uuid, uuid[], int, text, text) from public, anon, authenticated;
revoke all on function raid_progress_set_team(text, text, text[], text) from public;
revoke all on function raid_progress_friend_teams(text, text) from public;
revoke all on function raid_progress_close(text, uuid[], text) from public;
revoke all on function raid_close(uuid[], text) from public;
revoke all on function delete_my_data(text) from public, anon;
grant execute on function raid_progress_set_team(text, text, text[], text), raid_progress_friend_teams(text, text),
  raid_progress_close(text, uuid[], text), raid_close(uuid[], text), delete_my_data(text) to authenticated;

commit;
