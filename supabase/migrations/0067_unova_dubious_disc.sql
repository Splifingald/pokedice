-- A Dubious Disc to find in Unova, which had none (it turns Porygon2 into Porygon-Z). It goes in The
-- P2 Laboratory, the region's research lab, where a disc of "dubious" data belongs. Two one-time finds rather than
-- one find of two, the same twin pattern as 0059: a save gets at most two copies from this area (one for the normal
-- Pokémon, one for its shiny), each found on its own. Weight 8, as Sinnoh's disc in Veilstone. Inserted only when the
-- area and the item exist, so a database without them is left alone. Then `configVersion` + 1. Safe to run again.
begin;
insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty)
select v.id::uuid, a.id, 'dubious-disc', 8, true, 1, 1
from (values
  ('7e3d8c6c-d1cf-552b-9484-53a69ee55a57'), -- unova · The P2 Laboratory · dubious-disc (1 of 2)
  ('f79aeb4f-27ae-51f5-8a06-deb7256459da')  -- unova · The P2 Laboratory · dubious-disc (2 of 2)
) v (id)
join areas a on a.id = 'e3ab5fdf-99ee-5feb-b6fd-1d47352b267e'::uuid
where exists (select 1 from items where key = 'dubious-disc')
on conflict (id) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
