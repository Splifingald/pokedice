-- One island trial per type (docs/62 §6, the user's call of 2026-11-01): with the trials on, each trial and grand
-- trial gives its type's Z-Crystal, and a Z-Move is only for a Pokémon of a type whose crystal is held. Alola's trials
-- and grand trials give twelve; these six Totems give the rest, each the only gym of its area, left out while the
-- trials are off:
--   Heahea City & Routes 4–6: Totem Toucannon Lv.18 (Flying) · Hano Beach & Aether Paradise: Totem Toxapex Lv.27
--   (Poison) · Malie City & Malie Garden: Totem Araquanid Lv.28 (Bug) · Routes 11 & 12 and Blush Mountain: Totem
--   Togedemaru Lv.31 (Steel) · Routes 13 & 14, Haina Desert & Tapu Village: Totem Bruxish Lv.33 (Psychic) · Mount
--   Lanakila: Totem Ninetales (Alolan) Lv.52 (Ice).
-- 1. Their trainer rows, left alone when there. 2. Each in its area's gyms, unless there already. 3. configVersion + 1.
-- Safe to run again. supabase/seed.sql carries the trainers and the areas' gyms.
begin;
insert into trainers (id, name, sprite_url, team, role, badge, upgrade_level, battle_background, rival_of, items) values
  ('8cebb4a0-7553-5d00-904d-0461d1389075', 'Totem Toucannon', '/trainers/classes/alola/elite-kahili.png', '[{"dex":733,"level":18}]'::jsonb, 'leader', null, null, 'default', null, '[]'::jsonb),
  ('23c7789e-eb83-55e8-96bb-9bb2097fe93d', 'Totem Toxapex', '/trainers/classes/alola/plumeria.png', '[{"dex":748,"level":27}]'::jsonb, 'leader', null, null, 'default', null, '[]'::jsonb),
  ('65e861d9-c327-56f8-aa34-bd8710000c3a', 'Totem Araquanid', '/trainers/classes/alola/guzma.png', '[{"dex":752,"level":28}]'::jsonb, 'leader', null, null, 'default', null, '[]'::jsonb),
  ('9f29379a-7508-5443-8710-c533da46baa5', 'Totem Togedemaru', '/trainers/classes/alola/elite-molayne.png', '[{"dex":777,"level":31}]'::jsonb, 'leader', null, null, 'default', null, '[]'::jsonb),
  ('ce72ec00-480b-588e-9ffb-178257855a46', 'Totem Bruxish', '/trainers/classes/alola/faba.png', '[{"dex":779,"level":33}]'::jsonb, 'leader', null, null, 'default', null, '[]'::jsonb),
  ('a8411dd0-0c2b-5f0f-ac1a-0556001dc88d', 'Totem Ninetales', '/trainers/classes/alola/lillie.png', '[{"dex":10104,"level":52}]'::jsonb, 'leader', null, null, 'default', null, '[]'::jsonb)
on conflict (id) do nothing;

with g(area_id, trainer_id) as (values
  ('87cba513-0bc5-55df-a781-9de73048528c'::uuid, '8cebb4a0-7553-5d00-904d-0461d1389075'),
  ('0e1ccc24-1c60-56e1-9f03-4b3deda34951'::uuid, '23c7789e-eb83-55e8-96bb-9bb2097fe93d'),
  ('7d3ee2f7-3442-5738-b2c6-d3037e514fec'::uuid, '65e861d9-c327-56f8-aa34-bd8710000c3a'),
  ('d6ba26d1-3dd2-51fc-b559-74c01d2ddba2'::uuid, '9f29379a-7508-5443-8710-c533da46baa5'),
  ('3463beea-946a-5c99-89d1-19dc707896e8'::uuid, 'ce72ec00-480b-588e-9ffb-178257855a46'),
  ('db4e5701-dfdf-54dd-bfee-002c1fdcc391'::uuid, 'a8411dd0-0c2b-5f0f-ac1a-0556001dc88d')
)
update areas a
set gyms = coalesce(a.gyms, '[]'::jsonb) || jsonb_build_array(g.trainer_id)
from g
where a.id = g.area_id
  and not coalesce(a.gyms, '[]'::jsonb) ? g.trainer_id;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
