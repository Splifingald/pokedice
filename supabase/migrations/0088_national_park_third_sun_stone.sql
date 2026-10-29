-- A third Sun Stone in National Park. Johto has three Sun Stone evolutions (Gloom → Bellossom, Sunkern → Sunflora,
-- Eevee → Espeon) but its only Sun Stones are National Park's two one-time finds (the original and 0059's twin), so a
-- player who evolved two had to catch the third in the wild. One more one-time find, copied from the original live row
-- (weight, quantity) as 0059 did. A new id rather than a bigger quantity, so saves that already made both finds still
-- get the third. No row is added if the admin has removed the original. Then `configVersion` + 1. Safe to run again.
begin;
insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty)
select 'b7b31cb6-584b-5f29-8a24-1bc5d08ba7ef'::uuid, p.area_id, p.item_key, p.weight, true, p.min_qty, p.max_qty
from area_loot_pool p
where p.id = '56de34a6-12ad-5ea7-8258-2f709ce1343f'::uuid and p.unique_find -- johto · National Park · sun-stone
on conflict (id) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
