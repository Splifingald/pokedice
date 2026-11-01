-- Alola's island trials (docs/62 §6): the seven captains' battles become their Totem's (×2 HP, a die more, two allies
-- called), won when the Totem falls. The trials are the game's own content (src/engine/flavoursContent.ts).
-- 1. The switch, Off. 2. Vast Poni Canyon's trial: Totem Kommo-o, a gym row there only for it (left out while the
--    switch is off), before Hapu's grand trial in Exeggutor Island & Vast Poni Canyon. 3. configVersion + 1.
-- Safe to run again. supabase/seed.sql carries the trainer and the area's gyms.
begin;
insert into game_config (key, value) values ('trials', '{"access":"off"}'::jsonb) on conflict (key) do nothing;

insert into trainers (id, name, sprite_url, team, role, badge, upgrade_level, battle_background, rival_of, items)
values ('7278511c-319e-5fc1-a053-0be766cb70fd', 'Totem Kommo-o', '/trainers/classes/alola/hapu.png',
        '[{"dex":784,"level":45}]'::jsonb, 'leader', null, null, 'default', null, '[]'::jsonb)
on conflict (id) do nothing;

-- Before Hapu (her row's place in the list), or first when she isn't there.
update areas a
set gyms = (
  select coalesce(jsonb_agg(g order by ord), '[]'::jsonb)
  from (
    select e.g, e.ord from jsonb_array_elements(a.gyms) with ordinality e(g, ord)
    union all
    select to_jsonb('7278511c-319e-5fc1-a053-0be766cb70fd'::text),
           coalesce((select ord - 0.5 from jsonb_array_elements_text(a.gyms) with ordinality h(id, ord)
                     where h.id = 'c6106307-fd9e-50e1-aa2c-8edd1069cb8f'), 0)
  ) x(g, ord)
)
where a.id = 'e7ae24d0-80a4-51d7-a9cb-c0df82d25286'
  and not a.gyms ? '7278511c-319e-5fc1-a053-0be766cb70fd';

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
