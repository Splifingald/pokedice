-- Snowglobe Valley's starters (docs/64 §1, the user's call, 2026-11-21): Alolan Sandshrew, Sneasel and Alolan Vulpix in
-- place of Mareep, Lillipup and Pikipek, and all three wild on Snowy Trail and Pinewood Forest, so the two not picked
-- can be caught from the start. 0122, regenerated, writes the same on a fresh database; this changes only that on one
-- where 0122 already ran, so the admin's other edits to the world stay.
--
-- 1. The region's starters (what the world's partner lab offers).
-- 2. The world's entry in game_config `smallWorlds`: its `starters` (the switch and every other setting kept).
-- 3. Snowy Trail and Pinewood Forest: the new wild rows (0122's ids), each only where its area is on the database.
-- 4. The content version, so players load it.
--
-- Run after 0122; safe to run again.
begin;

update regions set starters = '[10101,215,10103]'::jsonb where id = 'world-snowglobe-valley';

update game_config set value = jsonb_set(
  value,
  '{list}',
  (select jsonb_agg(
     case when w ->> 'id' = 'snowglobe-valley-2026' then jsonb_set(w, '{starters}', '[10101,215,10103]'::jsonb) else w end
     order by i)
   from jsonb_array_elements(value -> 'list') with ordinality as x(w, i))
) where key = 'smallWorlds' and jsonb_typeof(value -> 'list') = 'array' and jsonb_array_length(value -> 'list') > 0;

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

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
