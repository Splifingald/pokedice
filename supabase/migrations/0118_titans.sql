-- Paldea's Titans (docs/62 §7): five areas' bosses, fought in two phases (the second after a Herba Mystica: ×2 HP, a
-- die more), never caught, leaving ₽1,000 and 3 Rare Candies. Only while the switch is on: off, the areas have no boss.
-- 1. The switch, Off. 2. Each area's Titan, unless it has that boss already (an admin's edit is kept):
--   South Province (Area Three) & Cortondo: Klawf Lv.16 · West Province (Area One) & the Segin Squad's Base:
--   Bombirdier Lv.20 · The Schedar Squad's Base & East Province (Area Three): Orthworm Lv.29 · The Asado Desert &
--   Cascarrafa: Great Tusk Lv.33 (Iron Treads on Violet's side) · Casseroya Lake: Dondozo Lv.56 with Tatsugiri Lv.57.
--   They stay in their areas' wild pools. 3. configVersion + 1. Safe to run again. supabase/seed.sql carries the bosses.
begin;
insert into game_config (key, value) values ('titans', '{"access":"off"}'::jsonb) on conflict (key) do nothing;

with r(area_id, dex, boss) as (values
  ('6a5018d6-00f7-5b1d-9f19-941dd6158856'::uuid, 950, '{"dex":950,"level":16,"titan":{}}'::jsonb),
  ('39632d00-434b-5ba5-ada5-38b1a69af1d4'::uuid, 962, '{"dex":962,"level":20,"titan":{}}'::jsonb),
  ('4bd4ee06-1d09-54d6-a3b8-749099e52f76'::uuid, 968, '{"dex":968,"level":29,"titan":{}}'::jsonb),
  ('806671c7-1a49-543d-bea9-38f1c6cf3b60'::uuid, 984, '{"dex":984,"level":33,"titan":{"versionDex":990}}'::jsonb),
  ('2157b46b-a121-543b-9cca-b18fdc85d65e'::uuid, 977, '{"dex":977,"level":56,"titan":{"partner":{"dex":978,"level":57}}}'::jsonb)
)
update areas a
set legendary_boss = coalesce(a.legendary_boss, '[]'::jsonb) || jsonb_build_array(r.boss)
from r
where a.id = r.area_id
  and not exists (
    select 1 from jsonb_array_elements(coalesce(a.legendary_boss, '[]'::jsonb)) b where (b ->> 'dex')::int = r.dex
  );

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
