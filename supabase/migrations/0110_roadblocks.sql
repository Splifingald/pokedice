-- Roadblocks (docs/61 §2): a Pokémon across the road as its area's boss, with its own words instead of a legendary's
-- (`roadblock` on the boss). It waits once every round is done, the area clears only once it's beaten, a fled one comes
-- back, and it leaves that area's wild pool (the boss replaces it; its other wild spots stay):
--   Kanto, Routes 12–15: Snorlax Lv.30, asleep · Johto, Routes 35–37: Sudowoodo Lv.20, the strange tree ·
--   Hoenn, Fortree City & Routes 120–121: Kecleon Lv.30, unseen · Kalos, Route 7 & the Connecting Cave: Snorlax Lv.15.
-- A boss already there is left alone, so an admin's edit is kept. Then configVersion + 1. Safe to run again.
-- supabase/seed.sql carries it.
begin;
with r(area_id, dex, boss) as (values
  ('ff3f0086-1b99-559e-a646-e88006eec749'::uuid, 143, '{"dex":143,"level":30,"roadblock":"sleeping"}'::jsonb),
  ('61bfb445-9bdc-5e47-9c3a-f379bd33a06b'::uuid, 185, '{"dex":185,"level":20,"roadblock":"tree"}'::jsonb),
  ('e34791dd-2b08-51ef-9c9f-be18cea0524b'::uuid, 352, '{"dex":352,"level":30,"roadblock":"invisible"}'::jsonb),
  ('77afa3c1-7785-5e6f-a3cc-f249ec9af432'::uuid, 143, '{"dex":143,"level":15,"roadblock":"sleeping"}'::jsonb)
)
update areas a
set legendary_boss = coalesce(a.legendary_boss, '[]'::jsonb) || jsonb_build_array(r.boss)
from r
where a.id = r.area_id
  and not exists (
    select 1 from jsonb_array_elements(coalesce(a.legendary_boss, '[]'::jsonb)) b where (b ->> 'dex')::int = r.dex
  );
delete from area_wild_pool w
using (values
  ('ff3f0086-1b99-559e-a646-e88006eec749'::uuid, 143),
  ('61bfb445-9bdc-5e47-9c3a-f379bd33a06b'::uuid, 185),
  ('e34791dd-2b08-51ef-9c9f-be18cea0524b'::uuid, 352),
  ('77afa3c1-7785-5e6f-a3cc-f249ec9af432'::uuid, 143)
) r(area_id, dex)
where w.area_id = r.area_id and w.dex = r.dex;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
