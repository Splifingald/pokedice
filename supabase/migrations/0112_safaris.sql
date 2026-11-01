-- The Safaris (docs/61 §4): a secret area of its own in every region that has one, off the main road, where nobody
-- battles. Its wild cards are Safari encounters (Trick or Treat's gauge with Bait and Safari Balls) while the Safari's
-- switch is on; off, they're fought as wild Pokémon, as before. No Pokémon Center, trainer or real player's card in
-- their decks, no rounds to clear; a round's price is the game's (game_config `safari`: the first round in each Safari
-- free, then ₽100).
-- 1. Kanto: the "Safari Zone" area also held Fuchsia's Gym. It keeps its id (old saves keep Koga beaten, the area
--    cleared, Silph Co. open; once-only finds stay found; the raid event still opens there) as Fuchsia City: trainers
--    only (the Gym's Jugglers and Tamers, never dealt before), a Center and its finds, 1 round, then Koga. A new
--    secret Safari Zone takes its 23 wild Pokémon (the same rows) and finds of its own, open once Fuchsia City is
--    reached. Done once: only while the area is still named "Safari Zone".
-- 2. Hoenn's Safari Zone opens with Fortree City & Routes 120–121 reached (its gate is on Route 121); Sinnoh's Great
--    Marsh with Route 212 & Pastoria City (its two Pokémon Rangers move there); Kalos's Friend Safari stays where it
--    was (its three trainers move to Kiloude City). Done once: only while the area has no mode yet.
-- 3. The Safari's row (Off), left alone when there. 4. configVersion + 1. Safe to run again. supabase/seed.sql carries
--    the content.
begin;

-- 1. Kanto.
insert into areas (id, order_index, region_id, name, banner_url, rounds_to_clear, min_level, max_level, encounter_weights,
                   backtrack_multiplier, legendary_boss, scales_to_team, easy_mode, enemy_upgrade_level, battle_background,
                   hidden, unlock_conditions, gyms, mode)
select '38fc3c59-6f8d-5aa8-a299-a5bb949254b2'::uuid, (select max(order_index) + 1 from areas), 'kanto', 'Safari Zone',
       f.banner_url, null, f.min_level, f.max_level, '{"wild":6,"item":2,"center":0,"trainer":0,"casino":0}'::jsonb,
       f.backtrack_multiplier, null, false, false, f.enemy_upgrade_level, 'grass', true,
       '[{"kind":"area","areaId":"2238f26a-2629-5f28-af07-e74cb41d5f7a"}]'::jsonb, '[]'::jsonb, '{"kind":"safari"}'::jsonb
from areas f
where f.id = '2238f26a-2629-5f28-af07-e74cb41d5f7a' and f.name = 'Safari Zone'
on conflict (id) do nothing;

update area_wild_pool set area_id = '38fc3c59-6f8d-5aa8-a299-a5bb949254b2'
where area_id = '2238f26a-2629-5f28-af07-e74cb41d5f7a'
  and exists (select 1 from areas where id = '2238f26a-2629-5f28-af07-e74cb41d5f7a' and name = 'Safari Zone')
  and exists (select 1 from areas where id = '38fc3c59-6f8d-5aa8-a299-a5bb949254b2');

update areas
set name = 'Fuchsia City', encounter_weights = '{"wild":0,"item":2,"center":1,"trainer":5,"casino":0}'::jsonb,
    rounds_to_clear = 1, min_level = 30, max_level = 34, battle_background = 'default'
where id = '2238f26a-2629-5f28-af07-e74cb41d5f7a' and name = 'Safari Zone'
  and exists (select 1 from areas where id = '38fc3c59-6f8d-5aa8-a299-a5bb949254b2');

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty)
select v.id, '38fc3c59-6f8d-5aa8-a299-a5bb949254b2'::uuid, v.item_key, v.weight, false, v.lo, v.hi
from (values
  ('dcc370fd-62b2-53f9-aa28-49aa3134c009'::uuid, 'poke-ball', 4, 2, 3),
  ('cb20f0b9-da4b-594a-a678-450d03ed770b'::uuid, 'great-ball', 3, 1, 2),
  ('c11f996f-f818-5b78-a861-35f6faab7693'::uuid, 'ultra-ball', 1, 1, 1),
  ('73301700-6705-5c69-a182-7aa6e9a72dc1'::uuid, 'money', 3, 100, 300)
) v(id, item_key, weight, lo, hi)
where exists (select 1 from areas where id = '38fc3c59-6f8d-5aa8-a299-a5bb949254b2')
on conflict (id) do nothing;

-- 2. Hoenn, Sinnoh, Kalos. The trainers move before the area takes its mode (the guard).
update area_trainer_pool set area_id = '67b3b539-dd5b-5c9a-96d4-60e4d8b8d188'
where area_id = '132bb05f-9768-59fb-89de-b25ecb1acc45'
  and exists (select 1 from areas where id = '132bb05f-9768-59fb-89de-b25ecb1acc45' and mode is null)
  and exists (select 1 from areas where id = '67b3b539-dd5b-5c9a-96d4-60e4d8b8d188');
update area_trainer_pool set area_id = 'a3a909e6-bd11-52cd-8d21-bc6a6aa8992d'
where area_id = 'cb642e3e-986b-5430-b507-7baf6cc0567b'
  and exists (select 1 from areas where id = 'cb642e3e-986b-5430-b507-7baf6cc0567b' and mode is null)
  and exists (select 1 from areas where id = 'a3a909e6-bd11-52cd-8d21-bc6a6aa8992d');

update areas a
set hidden = true,
    unlock_conditions = coalesce(v.unlock, a.unlock_conditions),
    rounds_to_clear = null,
    encounter_weights = a.encounter_weights || '{"center":0,"trainer":0}'::jsonb
      || case when a.encounter_weights ? 'versus' then '{"versus":0}'::jsonb else '{}'::jsonb end,
    mode = '{"kind":"safari"}'::jsonb
from (values
  ('d5fe2203-9a4f-5874-99c6-005b01b42ece'::uuid, '[{"kind":"area","areaId":"e34791dd-2b08-51ef-9c9f-be18cea0524b"}]'::jsonb),
  ('132bb05f-9768-59fb-89de-b25ecb1acc45'::uuid, '[{"kind":"area","areaId":"67b3b539-dd5b-5c9a-96d4-60e4d8b8d188"}]'::jsonb),
  ('cb642e3e-986b-5430-b507-7baf6cc0567b'::uuid, null)
) v(id, unlock)
where a.id = v.id and a.mode is null;

-- 3. The switch and the numbers, Off.
insert into game_config (key, value) values ('safari', '{"access":"off","freeRounds":1,"roundPrice":100,"treatMin":10,"treatMax":30,"failPush":35,"tiers":{"common":{"weight":6,"flee":90,"sections":[{"from":0,"need":6},{"from":40,"need":5},{"from":75,"need":4},{"from":80,"need":3}]},"rare":{"weight":3,"flee":85,"sections":[{"from":0,"need":6},{"from":40,"need":5},{"from":75,"need":4}]},"veryRare":{"weight":1,"flee":65,"sections":[{"from":0,"need":6},{"from":45,"need":5}]}},"areas":{}}'::jsonb)
on conflict (key) do nothing;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
