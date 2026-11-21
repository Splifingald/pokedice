-- Snowglobe Valley's starters and their evolution items (docs/64 §1, §2.2, the user's calls of 2026-11-21).
--
-- Starters: Alolan Sandshrew, Sneasel and Alolan Vulpix in place of Mareep, Lillipup and Pikipek, all three wild on
-- Snowy Trail and Pinewood Forest, so the two not picked can be caught from the start.
-- Their evolution items are never sold and never found before Lv.20; they are found three at a time, easily: 3 Ice
-- Stones and 3 Razor Claws in Toy Workshop (Lv.20–26), 3 Ice Stones in Icicle Cave (Lv.25–32). Each of those areas
-- deals two item cards a round over a loot deck of its once-only finds alone, so its first round gives them all.
--
-- 0122, generated before, stays as it ran; this changes only that, so the admin's other edits to the world stay.
-- 1. The region's starters, and the world's `starters` and Mart (no Ice Stone, no Razor Claw) in `smallWorlds`.
-- 2. Snowy Trail and Pinewood Forest: the new wild rows (the script's ids).
-- 3. Toy Workshop and Icicle Cave: 4 wild cards and 2 item cards; their loot, only the finds. Holly Village: no Ice
--    Stone. Each step only where its area is on the database.
-- 4. The content version, so players load it.
--
-- Run after 0122; safe to run again (run it again after a re-run of 0122).
begin;

-- 1.
update regions set starters = '[10101,215,10103]'::jsonb where id = 'world-snowglobe-valley';

update game_config set value = jsonb_set(
  value,
  '{list}',
  (select jsonb_agg(
     case when w ->> 'id' = 'snowglobe-valley-2026' then
       jsonb_set(
         jsonb_set(w, '{starters}', '[10101,215,10103]'::jsonb),
         '{shop}',
         coalesce(
           (select jsonb_agg(r order by j) from jsonb_array_elements(coalesce(w -> 'shop', '[]'::jsonb)) with ordinality as y(r, j)
            where r ->> 'key' not in ('ice-stone', 'razor-claw')),
           '[]'::jsonb))
     else w end
     order by i)
   from jsonb_array_elements(value -> 'list') with ordinality as x(w, i))
) where key = 'smallWorlds' and jsonb_typeof(value -> 'list') = 'array' and jsonb_array_length(value -> 'list') > 0;

-- 2.
insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select v.id::uuid, v.area_id::uuid, v.dex, v.weight, v.min_level, v.max_level
from (values
  -- Snowy Trail: the three, rare.
  ('7f4d8eed-fec9-508b-8880-a217435d035a', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 10101, 4, 4, 6),
  ('2aeebe0b-6d06-53f9-a2a0-a3a5ff9c95ca', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 215, 4, 4, 6),
  ('692bf9c8-b4b4-55f1-8331-33e28dd4a508', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 10103, 4, 4, 6),
  -- Pinewood Forest: Sneasel and Alolan Sandshrew beside its Alolan Vulpix.
  ('d172d97f-2159-5f36-a066-5466b6f06b62', '86027687-5c39-5902-a7fa-9da648a00cbc', 215, 8, 7, 9),
  ('6eae3fed-1d9d-5a32-9bea-28b5a76d4d5b', '86027687-5c39-5902-a7fa-9da648a00cbc', 10101, 6, 7, 9)
) as v(id, area_id, dex, weight, min_level, max_level)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
on conflict (id) do update set area_id = excluded.area_id, dex = excluded.dex, weight = excluded.weight, min_level = excluded.min_level, max_level = excluded.max_level;

-- 3. Toy Workshop (e8a95d77…) and Icicle Cave (e5561682…).
update areas set encounter_weights = coalesce(encounter_weights, '{}'::jsonb) || '{"wild":4,"item":2}'::jsonb
where id in ('e8a95d77-f972-5fb7-a784-33373bac3d37', 'e5561682-98aa-5c19-b8a4-32acdc30c64e');

delete from area_loot_pool
where area_id in ('e8a95d77-f972-5fb7-a784-33373bac3d37', 'e5561682-98aa-5c19-b8a4-32acdc30c64e')
  and id not in ('f066802f-6605-5778-8739-30fcfbe9695b', '875ee05f-ec87-5a79-8051-3a7cad7ed0ed',
                 '42f8ed45-b8e7-57db-ade7-828a1d0c1f6a', 'a694d2cb-f0fa-5d8d-9c3f-bc63617865f5');
-- Holly Village's Ice Stone.
delete from area_loot_pool where id = '9844b9ce-219d-5a81-8c99-a4529dda5148';

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty)
select v.id::uuid, v.area_id::uuid, v.item_key, v.weight, v.unique_find, v.min_qty, v.max_qty
from (values
  ('f066802f-6605-5778-8739-30fcfbe9695b', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'ice-stone', 1, true, 3, 3),
  ('875ee05f-ec87-5a79-8051-3a7cad7ed0ed', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'razor-claw', 1, true, 3, 3),
  ('42f8ed45-b8e7-57db-ade7-828a1d0c1f6a', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'ice-stone', 1, true, 3, 3),
  ('a694d2cb-f0fa-5d8d-9c3f-bc63617865f5', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'dawn-stone', 1, true, 1, 1)
) as v(id, area_id, item_key, weight, unique_find, min_qty, max_qty)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
on conflict (id) do update set area_id = excluded.area_id, item_key = excluded.item_key, weight = excluded.weight, unique_find = excluded.unique_find, min_qty = excluded.min_qty, max_qty = excluded.max_qty;

-- 4.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
