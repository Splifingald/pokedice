-- A Metal Coat in Hoenn: two one-time finds in Mauville City (New Mauville, where Emerald's wild Magnemite carry it),
-- so Onix and Scyther can reach Steelix and Scizor without leaving the region. Two, like every area-only evolution
-- item since 0059 (one for the normal Pokémon, one for its shiny). Joined on the area so a database without Mauville
-- City skips it. Then `configVersion` + 1. Safe to run again.
begin;
insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty)
select v.id::uuid, a.id, 'metal-coat', 1, true, 1, 1
from (values
  ('15eb5318-7396-417b-abbd-66b5849fe95e'),
  ('5de448df-e747-4335-8d28-269202da3502')
) v (id)
join areas a on a.id = 'f4125979-a6a1-5086-9a5a-5314568b77a9'::uuid
on conflict (id) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
