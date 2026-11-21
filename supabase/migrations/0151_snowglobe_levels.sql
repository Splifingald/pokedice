-- Snowglobe Valley: no Pokémon met below the level it is reached at (docs/64 §2.1, the user's report of 2026-11-21: a
-- wild Staravia at Lv.11 in Pinewood Forest, when Starly evolves at 14). Each moves to an area of its level; the
-- world keeps the same species.
--   Staravia (from 14): Pinewood Forest 9–11 → Holly Village 15–18.
--   Quagsire (from 20): Frozen Pond 14–16 → Frostbite Harbour 31–34.
--   Ampharos (from 30): Holly Village 19–21 → Frostbite Harbour 33–36.
--   Sudowoodo (from 30): Toy Workshop 24–26 → Icicle Cave 30–32; Clown Jingle's becomes a Bonsly, Lv.24.
--   Ace Trainer Crystal's Piloswine (from 33), Lv.30 → a Swinub, Lv.31.
--
-- Run after 0122 (and 0150); safe to run again. Each row only where its area or trainer is on the database.
begin;

delete from area_wild_pool where id in (
  '14c9460b-5def-53b4-bdb5-f854d138c6d9', -- Pinewood Forest's Staravia
  '1cfd0ede-f28b-5840-9106-31fc4719da06', -- Frozen Pond's Quagsire
  'b16a5b7e-0f2a-5b78-b212-c90a2b42b6b8', -- Holly Village's Ampharos
  'ee764e2b-451b-5261-adee-fe94c3424dc3'  -- Toy Workshop's Sudowoodo
);

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select v.id::uuid, v.area_id::uuid, v.dex, v.weight, v.min_level, v.max_level
from (values
  ('d5a787b9-2e2b-50bf-b69b-7c9396a9ce17', '24714d59-a220-5b61-bfcc-ec569104657d', 397, 5, 15, 18), -- Holly Village
  ('c23a2c86-04bc-5aa5-aa68-bcacacd53b9f', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 185, 5, 30, 32), -- Icicle Cave
  ('cca4c445-3533-5a84-8598-29155f02dd01', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 195, 6, 31, 34), -- Frostbite Harbour
  ('cd97ed78-1503-52aa-bac0-2e172e0a0754', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 181, 4, 33, 36)  -- Frostbite Harbour
) as v(id, area_id, dex, weight, min_level, max_level)
where exists (select 1 from areas a where a.id = v.area_id::uuid)
on conflict (id) do update set area_id = excluded.area_id, dex = excluded.dex, weight = excluded.weight, min_level = excluded.min_level, max_level = excluded.max_level;

update trainers set team = '[{"dex":438,"level":24},{"dex":10176,"level":24}]'::jsonb
where id = '1562662f-f591-501a-a0cb-bcc02b8cdc74'; -- Clown Jingle
update trainers set team = '[{"dex":615,"level":30},{"dex":42,"level":30},{"dex":220,"level":31}]'::jsonb
where id = '83d111ba-7892-5b2b-a586-e3a4aa5d8120'; -- Ace Trainer Crystal

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
