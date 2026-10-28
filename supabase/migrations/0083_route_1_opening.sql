-- Route 1's set opening (docs/46).
-- 1. Youngster Joey (Rattata Lv 4), the kid trainer the opening's first round ends with. In no area's trainer pool:
--    only the opening deals him. Left alone when there, so an admin's later edit is kept.
-- 2. Oddish in Route 1's wild pool: weight 3 (about 1 wild Pokémon in 35 next to Pidgey's and Rattata's 50), Lv 3–5.
--    Only where Route 1 exists (a fresh database gets it from the seed's own rows, after this file).
-- 3. game_config `openingRounds`: the switch, Off (left alone when there). The rounds themselves are the game's own
--    (src/engine/defaults.ts). Encounters are dealt on the player's device, so no server function reads it.
-- 4. configVersion + 1, so players fetch the new content. Safe to run again.
begin;

insert into trainers (id, name, sprite_url, team, role, badge, upgrade_level, battle_background, rival_of, items, duo)
values ('251c41f0-3e55-56a0-bb95-7a33ea96b68f', 'Youngster Joey', '/trainers/classes/youngster.png',
        '[{"dex":19,"level":4}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb, false)
on conflict (id) do nothing;

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select 'bc17445e-5dec-5c85-8ec0-ae46500c579f', a.id, 43, 3, 3, 5
from areas a where a.id = '3585c2a5-43bc-50c9-9818-e148404cabf8'
on conflict (id) do nothing;

insert into game_config (key, value) values ('openingRounds', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
