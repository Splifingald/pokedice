-- Version 2.9's database changes in one go: migrations 0108 to 0127, in order, in one transaction (all or nothing).
-- Supabase → the pokedice project → SQL Editor → New query → paste all of this → Run. Each migration is safe to run
-- again, so this file is too (a database that already took some of them, as the earlier steps asked, is fine). The
-- migrations stay the source (supabase/migrations/); this file only strings them together, each one's own
-- begin/commit taken out so the whole runs as one transaction. Every new feature in it arrives Off (Admin → its switch).
begin;

-- ======================================================================== ↓ supabase/migrations/0108_trade_picks.sql
-- The trade board's picks (docs/23 §2.1): the board no longer lists every open listing. It shows 5 picked for the
-- player (the admin's `trade.boardPicks`), with NEW PICKS twice a UTC day (`trade.boardRerolls`, counted in the save:
-- a search shows every match anyway, so there is nothing for the server to guard), and a search as often as they like
-- (trade_board, unchanged).
--
-- 1. game_config `trade`: the two numbers added to the admin's row when it lacks them (the admin's values stay).
-- 2. trade_picks(p_me, p_skip, p_limit): the candidates, so a crowded board still finds the listings worth showing.
--    The game sends what it owns (the snapshot a listing keeps: engine/trade.ts picksAsk), every species it could
--    give (`offer`) and the species whose family's hidden talent it has unlocked (`talented`, null while talents are
--    off). Every open listing it may see (public, its friends'; never its own) is ranked: the ones it can take first
--    (its home region started, and a species want it has), then a Pokémon it doesn't have (or a shiny when it has no
--    shiny of it), then a talent its family lacks, then the rest; friends' first, then ending soonest. The listings
--    shown before a NEW PICKS today (`p_skip`, least recently first) come after every other. The game ranks the ones
--    sent back exactly (engine/trade.ts rankPicks) and shows the first 5 it can take. Listing rows only, never a save.
--
-- The main save only, as every trade function. Run after 0107; safe to run again. seed.sql inlines it.
-- ---------------------------------------------------------------- 1. the numbers

update game_config set value = '{"boardPicks": 5, "boardRerolls": 2}'::jsonb || value
 where key = 'trade' and jsonb_typeof(value) = 'object' and not (value ? 'boardPicks' and value ? 'boardRerolls');

-- ---------------------------------------------------------------- 2. the candidates

create or replace function trade_picks(p_me jsonb, p_skip uuid[] default null, p_limit int default 40,
  p_realm text default 'main')
returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_friends uuid[];
  v_regions text[];
  v_shiny jsonb;
  v_talented boolean;
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' or not trade_open() then return; end if;
  v_friends := array(select f.id from friend_ids_of(me) f);
  v_regions := array(select jsonb_array_elements_text(case when jsonb_typeof(p_me -> 'regions') = 'array'
                                                         then p_me -> 'regions' else '[]' end));
  v_shiny := case when jsonb_typeof(p_me -> 'shiny') = 'array' then p_me -> 'shiny' else '[]' end;
  v_talented := jsonb_typeof(p_me -> 'talented') = 'object';
  return query
    select trade_row(t, me) from trade_listings t
    cross join lateral (select
      t.home_region = any (v_regions)
        and (t.want ->> 'kind' is distinct from 'species' or trade_has(p_me -> 'offer', (t.want ->> 'dex')::int)) as can,
      case when not trade_has(p_me, t.dex) or (t.shiny and not v_shiny @> to_jsonb(t.dex)) then 0
           when v_talented and t.mon ->> 'talent' = 'true' and not trade_has(p_me -> 'talented', t.dex) then 1
           else 2 end as tier) k
    where t.realm = 'main' and t.status = 'open' and t.ends_at > now() and t.owner is distinct from me
      and (t.visibility = 'public' or (t.visibility = 'friends' and t.owner = any (v_friends)))
    order by array_position(coalesce(p_skip, '{}'), t.id) nulls first, not k.can, k.tier,
             not coalesce(t.owner = any (v_friends), false), t.ends_at, t.id
    limit least(greatest(coalesce(p_limit, 40), 1), 50);
end
$$;

revoke all on function trade_picks(jsonb, uuid[], int, text) from public, anon;
grant execute on function trade_picks(jsonb, uuid[], int, text) to authenticated;

-- ======================================================================== ↓ supabase/migrations/0109_regigigas_regis.sql
-- Snowpoint Temple waits for the three Regis (docs/61 §1): a new unlock condition, `caught`, met once Regirock,
-- Regice and Registeel are in any region's Pokédex. It joins the Temple's three conditions (Routes 216 & 217 and
-- Snowpoint City reached, 130 caught, Lv.65); a player who has already been in keeps it open (the game's rule, not the
-- database's). Left alone when the Temple already has a `caught` condition, so an admin's edit is kept.
-- Then configVersion + 1, so players fetch the new content. Safe to run again. supabase/seed.sql carries it.
update areas
set unlock_conditions = coalesce(unlock_conditions, '[]'::jsonb) || '[{"kind":"caught","dex":[377,378,379]}]'::jsonb
where id = '10a7f721-2f52-58c4-bba1-728e2f88d763'
  and not exists (
    select 1 from jsonb_array_elements(coalesce(unlock_conditions, '[]'::jsonb)) c where c ->> 'kind' = 'caught'
  );
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0110_roadblocks.sql
-- Roadblocks (docs/61 §2): a Pokémon across the road as its area's boss, with its own words instead of a legendary's
-- (`roadblock` on the boss). It waits once every round is done, the area clears only once it's beaten, a fled one comes
-- back, and it leaves that area's wild pool (the boss replaces it; its other wild spots stay):
--   Kanto, Routes 12–15: Snorlax Lv.30, asleep · Johto, Routes 35–37: Sudowoodo Lv.20, the strange tree ·
--   Hoenn, Fortree City & Routes 120–121: Kecleon Lv.30, unseen · Kalos, Route 7 & the Connecting Cave: Snorlax Lv.15.
-- A boss already there is left alone, so an admin's edit is kept. Then configVersion + 1. Safe to run again.
-- supabase/seed.sql carries it.
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

-- ======================================================================== ↓ supabase/migrations/0111_disguises.sql
-- Pokémon posing as items (docs/61 §3): a loot row can be a disguise (`area_loot_pool.disguise`: the Pokémon and its
-- levels). It is dealt and shown as the find it looks like (a Poké Ball), and springs out as a wild Pokémon once picked
-- up: a wild battle, its XP and the catch throw, never fled from. Only while its switch is on (game_config
-- `disguises`, Off); off, the row is left out of the loot.
-- 1. The column. 2. Eleven rows, about a quarter of each area's finds: Voltorb and Electrode in Kanto's Power Plant and
--    Johto's Team Rocket HQ, Voltorb in Mauville City and the Kalos Power Plant, Electrode in Hoenn's hideouts, Foongus
--    and Amoonguss across Unova. Left alone when there, so an admin's edit is kept.
-- 3. The switch, Off. 4. side_quest_open(key): the switch of a side quest (docs/61) as the server reads it for the
--    caller, for the four of them (disguises, safari, rivals, giftMoments; a key with no row yet is off).
-- 5. configVersion + 1. Safe to run again. supabase/seed.sql carries the column and the rows.
alter table area_loot_pool add column if not exists disguise jsonb;

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty, disguise)
select v.id, v.area_id, 'poke-ball', v.weight, false, 1, 1, v.disguise
from (values
  ('ac4762ac-52d0-5cb5-a237-1fffa7e1e1d3'::uuid, 'bf32fe1a-051d-517b-83c3-55bd24b8e077'::uuid, 2, '{"dex":100,"minLevel":25,"maxLevel":32}'::jsonb),
  ('271d2ecb-a1ec-54b6-9e66-dc1a6c118dac'::uuid, 'bf32fe1a-051d-517b-83c3-55bd24b8e077'::uuid, 2, '{"dex":101,"minLevel":33,"maxLevel":36}'::jsonb),
  ('3278e5ac-76c1-5399-8619-397dc62edcd0'::uuid, '9046f263-c9c8-537c-9548-133e08237781'::uuid, 16, '{"dex":100,"minLevel":33,"maxLevel":39}'::jsonb),
  ('30953001-6060-5359-a922-36c7ea4c0a66'::uuid, '9046f263-c9c8-537c-9548-133e08237781'::uuid, 16, '{"dex":101,"minLevel":35,"maxLevel":41}'::jsonb),
  ('cc331cf8-fc26-5b16-958a-f123495650de'::uuid, 'f4125979-a6a1-5086-9a5a-5314568b77a9'::uuid, 32, '{"dex":100,"minLevel":18,"maxLevel":24}'::jsonb),
  ('56f72fe5-e1dd-59ac-9181-e25d3eb33fa7'::uuid, '0935501c-7f1e-5cf5-a84f-0b04fc538632'::uuid, 30, '{"dex":101,"minLevel":36,"maxLevel":45}'::jsonb),
  ('8d04b152-b23b-5c37-b009-de0bf1055105'::uuid, '0f04ef44-9fa0-57a3-b121-3b883b80e4b3'::uuid, 32, '{"dex":100,"minLevel":27,"maxLevel":29}'::jsonb),
  ('35c80365-6e31-5113-a33a-d0cb4e0e6bfa'::uuid, '8b1e0609-a1b6-5392-ba40-54c23b592aac'::uuid, 32, '{"dex":590,"minLevel":26,"maxLevel":31}'::jsonb),
  ('2f62d186-c3bd-5d48-8749-8d09c4238542'::uuid, 'a703817b-8a2f-5bdb-8e08-898f6db6e1b5'::uuid, 32, '{"dex":590,"minLevel":30,"maxLevel":35}'::jsonb),
  ('ef9fdc57-ba18-5810-8b43-98d62ff05ed9'::uuid, 'e22227a1-ae4f-5c8f-aa5a-141aeef63db6'::uuid, 32, '{"dex":591,"minLevel":35,"maxLevel":40}'::jsonb),
  ('ff71b70c-4aaf-55d6-b6e1-f9f6ed2ff284'::uuid, '1f3afed9-f2be-5b47-82c5-e281ba2584ae'::uuid, 29, '{"dex":591,"minLevel":60,"maxLevel":68}'::jsonb)
) v(id, area_id, weight, disguise)
where exists (select 1 from areas a where a.id = v.area_id)
on conflict (id) do nothing;

insert into game_config (key, value) values ('disguises', '{"access":"off"}'::jsonb) on conflict (key) do nothing;

-- A side quest's switch for the caller: on for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function side_quest_open(p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_key in ('disguises', 'safari', 'rivals', 'giftMoments') and (a = 'all' or (a = 'admin' and is_admin())), false)
  from (select coalesce((select value ->> 'access' from game_config where key = p_key and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function side_quest_open(text) from public;
grant execute on function side_quest_open(text) to anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0112_safaris.sql
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

-- ======================================================================== ↓ supabase/migrations/0113_set_moments.sql
-- Set moments (docs/61 §5): rivals met at set points of an area, and gift Pokémon. The meetings and the gifts are the
-- game's own content (src/engine/momentsContent.ts); the database holds their switches and the rivals' trainers.
-- 1. The rivals' new trainers, one per player starter (rival_of) where the original rival picks the starter strong
--    against yours: Blue on Routes 22 & 2, Route 4 & Nugget Bridge, Routes 5 & 6 and Route 21; Silver x5 (Johto); May x5
--    (Hoenn; Brendan for a player in Green's look); Wally x2; Barry on Route 201. 51 rows, left alone when there.
-- 2. Blue's two rows already in the game become versions (Pokémon Tower: the Squirtle one, rival_of 4; Silph Co.: the
--    Charmander one, rival_of 1), only where they have none yet.
-- 3. Kalos's Pokédex can be filled though Sycamore's gift is one of three: the Kanto starters, rare (weight 3) in the
--    Friend Safari.
-- 4. The two switches, Off: `rivals` and `giftMoments` (an Egg hatches in 6 hours). 5. configVersion + 1.
-- Safe to run again. supabase/seed.sql carries the trainers and the pool rows.
insert into trainers (id, name, sprite_url, team, role, badge, upgrade_level, battle_background, rival_of, items, duo) values
  ('bb51d07e-b961-557b-935c-11d660bc5a26', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":16,"level":6},{"dex":4,"level":7}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('64ab7f34-3123-539c-b1e0-ec6036b372f0', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":16,"level":6},{"dex":7,"level":7}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('7b332e47-527e-53e7-8872-f3e2079244ac', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":16,"level":6},{"dex":1,"level":7}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('9ba93ff6-50e3-5788-9430-0b7be269e41f', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":18},{"dex":63,"level":16},{"dex":5,"level":19}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('3cf3197c-83c1-51f3-af3f-b6ac33843ded', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":18},{"dex":63,"level":16},{"dex":8,"level":19}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('c87475c5-46a0-556c-a1eb-66441e342505', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":18},{"dex":63,"level":16},{"dex":2,"level":19}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('6f60109a-0f06-57f5-8762-f05e7f4e9603', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":21},{"dex":64,"level":20},{"dex":5,"level":23}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('61573fd6-204e-524c-9737-90f4a6f455cd', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":21},{"dex":64,"level":20},{"dex":8,"level":23}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('9d9fd418-b94b-5681-a14c-1c31eeebc79a', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":17,"level":21},{"dex":64,"level":20},{"dex":2,"level":23}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('11127ff2-1ef0-5360-8ad6-73cf932c1e20', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":18,"level":44},{"dex":65,"level":45},{"dex":6,"level":47}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('5ea9f46c-605c-5695-a176-b85223688a32', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":18,"level":44},{"dex":65,"level":45},{"dex":9,"level":47}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('9ccbead8-327e-5851-9da3-037acad7b2d3', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":18,"level":44},{"dex":65,"level":45},{"dex":3,"level":47}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('dfef6d75-e8a5-5686-9323-f3e81c2178e4', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":155,"level":6}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('f39dd7fc-1f25-5eba-b443-b3f1097796c2', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":158,"level":6}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('80d169cb-ca34-5b5d-996a-008e474c3541', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":152,"level":6}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('6ae02d3b-998e-59fe-9b1b-33f31dbbd409', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":92,"level":14},{"dex":41,"level":15},{"dex":156,"level":17}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('90750672-7f99-5af1-a244-7fbba0294115', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":92,"level":14},{"dex":41,"level":15},{"dex":158,"level":17}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('aee99329-9e53-5f7c-a21d-ba76597bb687', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":92,"level":14},{"dex":41,"level":15},{"dex":153,"level":17}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('4b3f2adf-d951-5638-b252-5300a865b00d', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":93,"level":27},{"dex":81,"level":26},{"dex":156,"level":29}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('33c7c2b0-70f5-5182-add2-c272208b71c9', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":93,"level":27},{"dex":81,"level":26},{"dex":159,"level":29}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('e9d61bab-99f6-587a-a23c-7aebd9afa58a', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":93,"level":27},{"dex":81,"level":26},{"dex":153,"level":29}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('80aefa01-a322-5602-b2f1-e5a4a082046d', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":215,"level":40},{"dex":42,"level":40},{"dex":157,"level":42}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('04c37992-974a-5760-80ec-d22a32a10a02', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":215,"level":40},{"dex":42,"level":40},{"dex":160,"level":42}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('21f36922-b1d7-501d-9b44-5cb25d804e54', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":215,"level":40},{"dex":42,"level":40},{"dex":154,"level":42}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('9206e38f-c5e1-5af5-a6cd-745b73df371b', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":82,"level":48},{"dex":42,"level":48},{"dex":157,"level":50}]'::jsonb, 'trainer', null, null, null, 152, '[]'::jsonb, false),
  ('3c319dc8-a2ec-5d97-9f52-690c7e56ec87', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":82,"level":48},{"dex":42,"level":48},{"dex":160,"level":50}]'::jsonb, 'trainer', null, null, null, 155, '[]'::jsonb, false),
  ('282752a7-00ec-54af-8658-773f6c5be104', 'Silver', '/trainers/classes/johto/silver.png', '[{"dex":82,"level":48},{"dex":42,"level":48},{"dex":154,"level":50}]'::jsonb, 'trainer', null, null, null, 158, '[]'::jsonb, false),
  ('c9815721-181a-5e31-a3f5-73faecb1cf40', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":255,"level":6}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('8e67536a-e3d9-5250-b972-dfa4407d858d', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":258,"level":6}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('1a5d14f1-21ea-5154-93fc-091c077c6a09', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":252,"level":6}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('5c2d72d2-6fe6-5c16-b80b-79c866a3ba09', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":13},{"dex":270,"level":13},{"dex":255,"level":15}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('17e99bcf-4567-528c-aec2-dd16c8db04c7', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":13},{"dex":285,"level":13},{"dex":258,"level":15}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('b87ec0f2-e8eb-5023-8d6c-31b5d8a712dc', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":13},{"dex":322,"level":13},{"dex":252,"level":15}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('a4c26565-bc79-50e2-86f3-8ac531d17e17', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":21},{"dex":271,"level":21},{"dex":256,"level":23}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('bdda2011-f55b-5992-89b2-53b8a47adff8', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":21},{"dex":285,"level":21},{"dex":259,"level":23}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('73fdf849-6292-5398-85e7-d38e80aede69', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":278,"level":21},{"dex":322,"level":21},{"dex":253,"level":23}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('d0635623-12e5-5056-a1fa-670c1c14add8', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":36},{"dex":272,"level":36},{"dex":257,"level":38}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('7214bb10-ff1f-5b1a-8143-93684d910384', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":36},{"dex":286,"level":36},{"dex":260,"level":38}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('1afb47f0-53bf-58fb-9672-b66609d6ac48', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":36},{"dex":323,"level":36},{"dex":254,"level":38}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('bd021dc9-9b78-53e2-a9a5-119eba6108ce', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":45},{"dex":272,"level":45},{"dex":257,"level":47}]'::jsonb, 'trainer', null, null, null, 252, '[]'::jsonb, false),
  ('0a6d613e-e6a2-51be-852f-d5fe3dbdeab9', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":45},{"dex":286,"level":45},{"dex":260,"level":47}]'::jsonb, 'trainer', null, null, null, 255, '[]'::jsonb, false),
  ('d266469b-099c-5ef4-b1ec-c46b60b6f03d', 'May', '/trainers/classes/hoenn/may.png', '[{"dex":279,"level":45},{"dex":323,"level":45},{"dex":254,"level":47}]'::jsonb, 'trainer', null, null, null, 258, '[]'::jsonb, false),
  ('d62f9fa5-5d3d-54de-9f88-478becea7a5b', 'Wally', '/trainers/classes/hoenn/wally.png', '[{"dex":281,"level":25}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb, false),
  ('c78d2edd-b365-5035-95ca-dda93314414d', 'Wally', '/trainers/classes/hoenn/wally.png', '[{"dex":334,"level":53},{"dex":315,"level":53},{"dex":282,"level":55}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb, false),
  ('f0ec6640-0618-5b62-81a1-ee2c016f6981', 'Barry', '/trainers/classes/sinnoh/barry.png', '[{"dex":390,"level":5}]'::jsonb, 'trainer', null, null, null, 387, '[]'::jsonb, false),
  ('f12adf50-94e4-55e8-994f-a29f27024ecf', 'Barry', '/trainers/classes/sinnoh/barry.png', '[{"dex":393,"level":5}]'::jsonb, 'trainer', null, null, null, 390, '[]'::jsonb, false),
  ('b1ae48a8-5012-586b-ae2d-aad87962557b', 'Barry', '/trainers/classes/sinnoh/barry.png', '[{"dex":387,"level":5}]'::jsonb, 'trainer', null, null, null, 393, '[]'::jsonb, false),
  ('848b054a-c505-5382-a169-f71ff32e9fc7', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":5,"level":25},{"dex":17,"level":25},{"dex":102,"level":23}]'::jsonb, 'trainer', null, null, null, 1, '[]'::jsonb, false),
  ('81559d47-b354-5182-9e7f-225272dbcc19', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":2,"level":25},{"dex":17,"level":25},{"dex":130,"level":23}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false),
  ('ef343241-f13a-5ffe-9347-dfd168f1b19b', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":9,"level":40},{"dex":58,"level":38},{"dex":18,"level":37}]'::jsonb, 'trainer', null, null, null, 4, '[]'::jsonb, false),
  ('76fb8203-f5fe-5921-b83d-9dacfa73c971', 'Rival Blue', '/trainers/classes/blue-1.png', '[{"dex":3,"level":40},{"dex":130,"level":38},{"dex":18,"level":37}]'::jsonb, 'trainer', null, null, null, 7, '[]'::jsonb, false)
on conflict (id) do nothing;

update trainers set rival_of = 4 where id = '8ac18ebf-ef70-5887-9076-1714e5870d7b' and rival_of is null;
update trainers set rival_of = 1 where id = '82eb7a7a-2fa5-5a69-9e84-a56fb850da5d' and rival_of is null;

insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level)
select v.id, 'cb642e3e-986b-5430-b507-7baf6cc0567b'::uuid, v.dex, 3, v.lo, v.hi
from (values
  ('494d86ab-6221-5002-8c18-2c5fb23fa97c'::uuid, 1, 60, 76),
  ('500fe10a-8d09-5dc9-a554-cef31bc92f48'::uuid, 4, 60, 76),
  ('5db429ce-36e1-537e-816a-ab5f4de2e2b0'::uuid, 7, 60, 76)
) v(id, dex, lo, hi)
where exists (select 1 from areas where id = 'cb642e3e-986b-5430-b507-7baf6cc0567b')
on conflict (id) do nothing;

insert into game_config (key, value) values ('rivals', '{"access":"off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('giftMoments', '{"access":"off","eggHours":6}'::jsonb) on conflict (key) do nothing;

-- The two switches join the side quests' server check (0111): the same function, the same four keys.
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0114_anti_cheat.sql
-- Anti-cheat (docs/63-ANTI-CHEAT.md). A player's save is their own JSON, so the server can't stop them editing their
-- own game. What it can stop is an edited save reaching other players (trades, boards, Versus, raids, area versus)
-- and a claim nobody could have earned. Nothing here changes what an honest player sees or does. The limits are set
-- from the live data of 2026-11-01, well above what any honest player reached.
--
--  1. Internal Versus League functions are taken back from players: 0082 revoked them from `public` only, and
--     Supabase grants every new function to anon and authenticated directly.
--  2. Trades:
--     - a species the game doesn't have is untradable (it froze the other player's trades: their game can't make it);
--     - the Pokémon a listing keeps is a clean copy (known fields, level 1–100);
--     - trade_gone remembers every Pokémon that left a player in a trade, for good, so a save rolled back to before the
--       trade can't trade it again;
--     - a trigger on trade_listings re-checks "already in a trade" under a per-player lock (two tabs at once), and keeps
--       banned players out.
--  3. Boards:
--     - player_cards: the name loses invisible characters and stacked accents; `updated_at` is never later than the
--       server's clock (a save dated 2099 stayed on every board for good);
--     - player_card_regions: only the game's regions, levels up to 100, a Pokédex up to what the region can hold, a
--       team of at most 6 known Pokémon, progress only on the game's areas and never more gyms than an area has.
--  4. Extreme speedrun: the run's clock is the server's own (`now()`, not the save's stamp); a run first seen already
--     won gets no time; a time under 30 minutes (or the admin's `extreme.minRunMs`, if ever set) isn't kept.
--  5. Raids: a raid is counted won only with a team registered for it at least 30 s before (the game registers it when
--     the fight starts), and at most 20 progression raids a UTC day.
--  6. Versus League: starting a match ends the player's unfinished one as the leave it was recorded as (one match at a
--     time); a win needs an attack in its log; `minWinSeconds` goes from 5 to 30 where the admin kept the old 5.
--  7. Teams others meet (versus_teams, raid_teams, raid_progress_teams, area_versus_teams): only Pokémon the game
--     has (no unknown or battle-only forms), levels 1–100, and no banned player's. Area versus quietly skips a bad
--     team (it is written while the save uploads, which must never fail). A Versus team changes at most 30 times a
--     UTC day, so a second account can't hand out endless new teams to beat.
--  8. A ban from the leaderboard (leaderboard_bans) is a ban from everything shared: the player's Versus, raid and
--     area versus teams go, their open listings are cancelled, their League trophies this week go to 0, and the
--     triggers above refuse new ones until the ban is lifted.
--  9. Versus fights recorded: at most 200 an hour per player.
-- 10. saves: players can no longer delete their row directly (the game uses delete_my_data); a save over 8 MB is
--     refused (the largest honest one is about 1 MB).
-- 11. Push (still Off): only the browsers' push services as endpoints; a notice already overdue isn't kept.
-- 12. Guests: at most 20 messages to the admin every 10 minutes between them all, and at most 3,000 new guests a day
--     in the analytics (the record is 361).
-- 13. admin_suspicious(): the admin's list of saves that look edited, on demand (Admin → Analytics → Suspicious).
--
-- Run after 0108 (2.9's trade picks; 0109–0113 touch nothing here). Safe to run again. Not in seed.sql: it needs the
-- optional features' tables (0044, 0045, 0053, 0082, 0099), which seed.sql leaves out.
-- ---------------------------------------------------------------- 1. internal League functions

revoke execute on function versus_league_close_week(date) from public, anon, authenticated;
revoke execute on function versus_league_ensure_week(date) from public, anon, authenticated;
revoke execute on function versus_league_join(uuid, date) from public, anon, authenticated;
revoke execute on function versus_league_offer(uuid, date, int) from public, anon, authenticated;
revoke execute on function versus_league_seat_bots(date) from public, anon, authenticated;
revoke execute on function versus_league_tick() from public, anon, authenticated;
revoke execute on function versus_league_tick_if_due() from public, anon, authenticated;
revoke execute on function player_powers(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers

-- Banned from the leaderboard, and so from everything shared (§8).
create or replace function is_banned(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from leaderboard_bans b where b.user_id = p_user)
$$;
revoke all on function is_banned(uuid) from public, anon, authenticated;

-- A Pokémon others may meet: one the game has, its base form or a regional one (battle forms only exist in a fight).
create or replace function mon_known(p_dex jsonb)
returns boolean
language sql stable security definer set search_path = public as $$
  select jsonb_typeof(p_dex) = 'number' and (p_dex #>> '{}') ~ '^[0-9]{1,6}$' and exists (
    select 1 from pokemon p
    where p.dex = (p_dex #>> '{}')::int and (p.form is null or coalesce(p.form ->> 'kind', '') = 'regional')
  )
$$;
revoke all on function mon_known(jsonb) from public, anon, authenticated;

-- A trainer's name as others see it: control and invisible characters out (as engine/nickname.ts cleanNickname),
-- no more than one accent stacked on a letter, spaces collapsed, cut to 12. Nothing left is "Trainer".
create or replace function name_clean(p text)
returns text
language sql immutable as $$
  select coalesce(nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(
    normalize(coalesce(p, ''), NFC),
    '[\u0001-\u001F\u007F-\u009F­؜᠎​-‏ -‮⁠-⁯﻿￹-￻]', '', 'g'),
    '([̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃿︠-︯])[̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃿︠-︯]+',
    '\1', 'g'),
    '\s+', ' ', 'g')), 12), ''), 'Trainer')
$$;

-- ---------------------------------------------------------------- 2. trades

-- 0044's, and a species the game doesn't have.
create or replace function trade_untradable(p_dex int)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_dex = any ('{
    144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,480,481,482,483,484,485,
    486,487,488,489,490,491,492,493,494,638,639,640,641,642,643,644,645,646,647,648,649,716,717,718,719,720,721,
    772,773,785,786,787,788,789,790,791,792,800,801,802,807,808,809,888,889,890,891,892,893,894,895,896,897,898,
    905,1001,1002,1003,1004,1007,1008,1014,1015,1016,1017,1024,1025,10007,10043,10044,10062,10063,10075,10077,
    10078,10079,10120,10157,10169,10170,10171,10208,10226,10273,10274,10275,10311,10312,10317,10319,20001,20002,
    20003,20004,20005,20006,20007,20008,20009,20010,20011,20012,20013,20014,20015,20016,20017,20101,20102,20103,
    20104,20105,20106,20107,20108,20109,20110,20111,20112,20113,20114,20115,20116,20117
  }'::int[])
  or exists (select 1 from jsonb_array_elements_text(coalesce(trade_cfg() -> 'exclude', '[]')) e where e = p_dex::text)
  or exists (select 1 from pokemon p where p.dex = p_dex and p.form is not null and coalesce(p.form ->> 'kind', '') <> 'regional')
  -- Unknown (an edited save): the other player's game couldn't make it, and every trade of theirs would wait on it.
  or p_dex is null or not exists (select 1 from pokemon p where p.dex = p_dex)
$$;

-- What a listing keeps of a Pokémon: the fields a Pokémon has, each small, the level a whole number from 1 to 100.
create or replace function trade_clean(p jsonb)
returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(p) is distinct from 'object' then p else
    coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(p) e(k, v)
      where k in ('id', 'dex', 'level', 'xp', 'currentHp', 'caughtAt', 'shiny', 'revivesAt', 'fossil', 'koAt', 'buff',
                  'nickname', 'letter', 'outfit', 'talent')
        and octet_length(v::text) <= 200
    ), '{}'::jsonb)
    || case when jsonb_typeof(p -> 'level') = 'number'
         then jsonb_build_object('level', least(100, greatest(1, floor((p ->> 'level')::numeric)))::int)
         else '{}'::jsonb end
  end
$$;

-- 0044's, handing back the clean copy.
create or replace function trade_find(p_save jsonb, p_inst text)
returns table (region text, inst jsonb, others int)
language plpgsql immutable as $$
declare
  live text := coalesce(nullif(p_save ->> 'region', ''), 'kanto');
  b record;
begin
  for b in
    select live as r, coalesce(p_save -> 'box', '[]') as box
    union all
    select k, coalesce(v -> 'box', '[]') from jsonb_each(coalesce(p_save -> 'parked', '{}')) p(k, v)
    where jsonb_typeof(v) = 'object' and k <> live
  loop
    select m into inst from jsonb_array_elements(b.box) m where m ->> 'id' = p_inst limit 1;
    if inst is not null then
      inst := trade_clean(inst);
      region := b.r;
      select count(*)::int into others from jsonb_array_elements(b.box) m
        where m ->> 'id' <> p_inst and m ->> 'revivesAt' is null;
      return next;
      return;
    end if;
  end loop;
end
$$;

-- Every Pokémon that left a player in a trade: its instance id never trades again from that player (a save rolled back
-- to before the trade still holds it). Kept when the trade's row goes (30 days on) and through Delete my data.
create table if not exists trade_gone (
  user_id uuid not null,
  inst_id text not null,
  listing uuid,
  gone_at timestamptz not null default now(),
  primary key (user_id, inst_id)
);
alter table trade_gone enable row level security;
revoke all on trade_gone from anon, authenticated;
grant select on trade_gone to authenticated;
drop policy if exists trade_gone_admin on trade_gone;
create policy trade_gone_admin on trade_gone for select using ((select is_admin()));

insert into trade_gone (user_id, inst_id, listing, gone_at)
select owner, mon ->> 'id', id, coalesce(taken_at, now()) from trade_listings
where status = 'taken' and owner is not null and mon ->> 'id' is not null
union all
select taker, taker_mon ->> 'id', id, coalesce(taken_at, now()) from trade_listings
where status = 'taken' and taker is not null and taker_mon ->> 'id' is not null
on conflict do nothing;

-- A listing posted, or taken: the giver isn't banned, and the Pokémon isn't in another trade or gone in one. Checked
-- again under a lock on the giver, so two tabs posting the same Pokémon at once can't both pass trade_post's check.
-- A trade done: both Pokémon are gone for good from their trainers.
create or replace function trade_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid;
  inst text;
begin
  if tg_op = 'INSERT' then
    who := new.owner;
    inst := new.mon ->> 'id';
  elsif new.status = 'taken' and old.status is distinct from 'taken' then
    who := new.taker;
    inst := new.taker_mon ->> 'id';
  else
    return new;
  end if;
  if who is null or inst is null then return new; end if;
  if is_banned(who) then raise exception 'trades_off'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trade_guard:' || who::text, 0));
  if exists (select 1 from trade_gone g where g.user_id = who and g.inst_id = inst)
     or exists (select 1 from trade_listings t
                where t.id <> new.id and t.owner = who and t.status = 'open' and t.mon ->> 'id' = inst)
     or exists (select 1 from trade_listings t
                where t.id <> new.id and t.taker = who and not t.taker_applied and t.taker_mon ->> 'id' = inst) then
    raise exception 'trades_listed';
  end if;
  if tg_op = 'UPDATE' then
    insert into trade_gone (user_id, inst_id, listing)
    select x.u, x.i, new.id from (values (new.owner, new.mon ->> 'id'), (new.taker, inst)) x(u, i)
    where x.u is not null and x.i is not null
    on conflict do nothing;
  end if;
  return new;
end
$$;
revoke all on function trade_guard() from public, anon, authenticated;
drop trigger if exists trade_listings_guard on trade_listings;
create trigger trade_listings_guard before insert or update of status on trade_listings
  for each row execute function trade_guard();

-- ---------------------------------------------------------------- 3. boards

create or replace function player_cards_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := name_clean(new.name);
  new.updated_at := least(new.updated_at, now());
  return new;
end
$$;
revoke all on function player_cards_guard() from public, anon, authenticated;
drop trigger if exists player_cards_guard on player_cards;
create trigger player_cards_guard before insert or update on player_cards
  for each row execute function player_cards_guard();

-- The most species a region's Pokédex can hold: its national numbers up to its last one (a region's Pokédex counts
-- the earlier regions' species too), and every form. A small world declares no range: every species.
create or replace function region_dex_cap(p_region text)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (select count(*)::int from pokemon p where p.dex <= (r.dex_range ->> 1)::int or p.form is not null)
    from regions r
    where r.id = p_region and (r.dex_range ->> 1) ~ '^[0-9]{1,4}$' and (r.dex_range ->> 1)::int < 10000
  ), (select count(*)::int from pokemon))
$$;
revoke all on function region_dex_cap(text) from public, anon, authenticated;

create or replace function card_regions_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A region the game doesn't have (an edited save's `parked`): no row.
  if not exists (select 1 from regions r where r.id = new.region) then return null; end if;
  new.max_level := least(greatest(coalesce(new.max_level, 0), 0), 100);
  new.pokedex := least(greatest(coalesce(new.pokedex, 0), 0), region_dex_cap(new.region));
  new.shinies := greatest(coalesce(new.shinies, 0), 0);
  new.team := coalesce((
    select jsonb_agg(jsonb_build_object(
      'dex', (m ->> 'dex')::int,
      'level', least(100, greatest(1, coalesce((m ->> 'level')::int, 1))),
      'shiny', coalesce((m -> 'shiny') = 'true'::jsonb, false)
    ) order by o)
    from jsonb_array_elements(case when jsonb_typeof(new.team) = 'array' then new.team else '[]' end)
      with ordinality t(m, o)
    where o <= 6 and mon_known(m -> 'dex') and (m ->> 'level') ~ '^[0-9]{1,6}$'
  ), '[]');
  -- Progress on the game's areas only (the board sums those alone), never more gyms than the area has.
  new.progress := coalesce((
    select jsonb_object_agg(e.k, e.v || jsonb_build_object('gyms', least(
      greatest(coalesce(case when jsonb_typeof(e.v -> 'gyms') = 'number' then (e.v ->> 'gyms')::int end, 0), 0),
      case when jsonb_typeof(a.gyms) = 'array' then jsonb_array_length(a.gyms) else 0 end)))
    from jsonb_each(case when jsonb_typeof(new.progress) = 'object' then new.progress else '{}' end) e(k, v)
    join areas a on a.id::text = e.k
    where jsonb_typeof(e.v) = 'object'
  ), '{}');
  return new;
end
$$;
revoke all on function card_regions_guard() from public, anon, authenticated;
drop trigger if exists card_regions_guard on player_card_regions;
create trigger card_regions_guard before insert or update on player_card_regions
  for each row execute function card_regions_guard();

delete from player_card_regions c where not exists (select 1 from regions r where r.id = c.region);
-- The cards written before, through the guard: a no-op update runs it once on every row.
update player_card_regions set max_level = max_level;
update player_cards set name = name;

-- ---------------------------------------------------------------- 4. Extreme speedrun

-- 0087's, on the server's clock: `p_at` (the save's own stamp) is no longer read.
create or replace function extreme_runs_write(p_user uuid, d jsonb, p_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
  rid text;
  started numeric;
  finished numeric;
  claimed bigint;
  cur record;
  seen timestamptz;
  watched bigint;
  took bigint;
  floor_ms bigint := coalesce((
    select (value ->> 'minRunMs')::bigint from game_config
    where key = 'extreme' and jsonb_typeof(value -> 'minRunMs') = 'number'), 1800000);
begin
  if jsonb_typeof(d -> 'extreme' -> 'runs') <> 'object' then return; end if;
  for k, v in select * from jsonb_each(d -> 'extreme' -> 'runs') loop
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(v -> 'id') <> 'string' or jsonb_typeof(v -> 'startedAt') <> 'number' then
      continue;
    end if;
    rid := left(v ->> 'id', 80);
    started := (v ->> 'startedAt')::numeric;
    finished := case when jsonb_typeof(v -> 'finishedAt') = 'number' then (v ->> 'finishedAt')::numeric end;
    select * into cur from player_card_regions r where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    if not found then continue; end if;
    -- A new run (a start or a restart): the server's clock for it starts now.
    seen := case when cur.run_id is distinct from rid then now() else coalesce(cur.run_seen, now()) end;
    if finished is not null and (cur.run_id is distinct from rid or cur.run_won is null) then
      -- Its League, first seen won now.
      claimed := greatest(0, least(finished - started, 9e15))::bigint;
      watched := greatest(0, floor(extract(epoch from (now() - seen)) * 1000))::bigint;
      took := greatest(claimed, watched);
      update player_card_regions r set
        run_id = rid, run_seen = seen, run_claimed = started::bigint, run_won = now(),
        best_ms = case
          when coalesce((v -> 'untimed') = 'true'::jsonb, false) then r.best_ms
          -- First seen already won: the server watched none of it.
          when cur.run_id is distinct from rid then r.best_ms
          when took < floor_ms then r.best_ms
          else least(coalesce(r.best_ms, took), took)
        end
      where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    elsif cur.run_id is distinct from rid or (finished is null and cur.run_won is not null) then
      update player_card_regions r set run_id = rid, run_seen = seen, run_claimed = started::bigint, run_won = null
      where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    end if;
  end loop;
end
$$;
revoke all on function extreme_runs_write(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. raids

-- 0045's: and a team registered for it at least 30 s before (the game registers it as the fight starts).
create or replace function raid_close(p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  st event_state;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  select * into st from event_state es where es.user_id = me and es.realm = p_realm for update;
  if st.raid is null or st.raid ->> 'day' <> today then raise exception 'events_no_raid'; end if;
  if coalesce((st.raid ->> 'caught')::boolean, false) then
    return jsonb_build_object('raidsWon', st.raids_won, 'gifts', 0);
  end if;
  if not exists (
    select 1 from raid_teams t where t.user_id = me and t.realm = p_realm and t.updated_at <= now() - interval '30 seconds'
  ) then
    raise exception 'events_no_fight';
  end if;
  update event_state es
    set raid = jsonb_set(st.raid, '{caught}', 'true'), raids_won = st.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning * into st;
  return jsonb_build_object('raidsWon', st.raids_won,
    'gifts', raid_give_gifts(me, p_helpers, (st.raid ->> 'dex')::int, p_realm));
end $$;

-- 0060's: and a team registered on it at least 30 s before, and at most 20 a UTC day (the record is 13).
create or replace function raid_progress_close(p_key text, p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  won int;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null then raise exception 'events_bad_raid'; end if;
  if raid_progress_special_locked(p_key, p_realm) then raise exception 'events_raid_locked'; end if;
  if not exists (select 1 from raid_progress_done d where d.user_id = me and d.realm = p_realm and d.raid_key = p_key) then
    if not exists (
      select 1 from raid_progress_teams t
      where t.user_id = me and t.realm = p_realm and t.raid_key = p_key and t.updated_at <= now() - interval '30 seconds'
    ) then
      raise exception 'events_no_fight';
    end if;
    if (select count(*) from raid_progress_done d
        where d.user_id = me and d.done_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= 20 then
      raise exception 'events_too_many';
    end if;
  end if;
  insert into event_state (user_id, realm) values (me, p_realm) on conflict (user_id, realm) do nothing;
  insert into raid_progress_done (user_id, realm, raid_key, dex) values (me, p_realm, p_key, dex)
  on conflict (user_id, realm, raid_key) do nothing;
  if not found then
    select es.raids_won into won from event_state es where es.user_id = me and es.realm = p_realm;
    return jsonb_build_object('raidsWon', won, 'gifts', 0);
  end if;
  update event_state es set raids_won = es.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning es.raids_won into won;
  return jsonb_build_object('raidsWon', won, 'gifts', raid_give_gifts(me, p_helpers, dex, p_realm, p_key));
end $$;

-- ---------------------------------------------------------------- 6. Versus League

update game_config set value = jsonb_set(value, '{minWinSeconds}', '30')
where key = 'versusLeague' and jsonb_typeof(value) = 'object'
  and (not value ? 'minWinSeconds' or (jsonb_typeof(value -> 'minWinSeconds') = 'number'
       and (value ->> 'minWinSeconds')::numeric < 30));

-- 0082's: a banned player can't start; the player's unfinished match ends as the leave it was recorded as, so there is
-- only ever one match under way.
create or replace function versus_league_start(p_slot int)
returns table (match_id bigint, seed bigint, name text, avatar text, team jsonb, powers jsonb, trophies int, rich boolean)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := versus_league_week();
  cfg jsonb := versus_league_cfg();
  mine jsonb;
  ch versus_league_choices%rowtype;
  before int;
  prov int;
  mid bigint;
  sd bigint := floor(random() * 2147483647)::bigint;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if not versus_league_open() then raise exception 'versus_league_off'; end if;
  if is_banned(me) then raise exception 'versus_no_team'; end if;
  select v.team into mine from versus_teams v where v.user_id = me and v.realm = 'main';
  if mine is null then raise exception 'versus_no_team'; end if;
  select * into ch from versus_league_choices c where c.user_id = me and c.slot = p_slot and c.week = wk;
  if not found then raise exception 'versus_league_no_choice'; end if;
  perform versus_league_join(me, wk);
  select m.trophies into before from versus_league_members m where m.week = wk and m.user_id = me for update;
  -- Its trophies were already taken as a leave when it started: it only ends.
  update versus_league_matches x set finished_at = now(), outcome = 'left'
  where x.user_id = me and x.finished_at is null;
  prov := versus_league_change('left', 0, 0, before, cfg);
  insert into versus_league_matches (week, user_id, team, foe_user, foe_bot, foe_name, foe_team, foe_powers, seed,
                                     trophies_before, delta)
  values (wk, me, mine, ch.foe_user, ch.foe_bot, ch.foe_name, ch.foe_team, ch.foe_powers, sd, before, prov)
  returning id into mid;
  update versus_league_members m set trophies = m.trophies + prov where m.week = wk and m.user_id = me;
  delete from versus_league_choices c where c.user_id = me;
  return query select mid, sd, ch.foe_name, ch.foe_avatar, ch.foe_team, ch.foe_powers, ch.foe_trophies, ch.foe_rich;
end
$$;

-- 0082's: and a win has at least one attack in its log.
create or replace function versus_league_finish(p_match bigint, p_outcome text, p_left int, p_foe_left int, p_moves jsonb)
returns table (delta int, trophies int)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := versus_league_cfg();
  m versus_league_matches%rowtype;
  secs numeric;
  n int;
  d int;
  top int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if not versus_league_open() then raise exception 'versus_league_off'; end if;
  select * into m from versus_league_matches x where x.id = p_match and x.user_id = me for update;
  if not found then raise exception 'versus_league_no_match'; end if;
  if m.finished_at is not null then raise exception 'versus_league_done'; end if;
  if exists (select 1 from versus_league_weeks w where w.week = m.week and w.closed_at is not null) then
    raise exception 'versus_league_week_over';
  end if;
  if p_outcome is null or p_outcome not in ('won', 'lost', 'left')
     or (p_outcome = 'won' and not (p_left between 1 and 3 and coalesce(p_foe_left, 0) = 0))
     or (p_outcome = 'lost' and not (coalesce(p_left, 0) = 0 and p_foe_left between 1 and 3)) then
    raise exception 'versus_league_bad_result';
  end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) > 5000
     or pg_column_size(p_moves) >= 400000 then
    raise exception 'versus_league_bad_result';
  end if;
  if exists (select 1 from jsonb_array_elements(p_moves) e where jsonb_typeof(e) <> 'object' or e ->> 't' = 'USE_ITEM') then
    raise exception 'versus_league_item';
  end if;
  if p_outcome = 'won' and not exists (select 1 from jsonb_array_elements(p_moves) e where e ->> 't' = 'ATTACK') then
    raise exception 'versus_league_bad_result';
  end if;
  n := jsonb_array_length(p_moves);
  secs := extract(epoch from now() - m.started_at);
  if p_outcome = 'won'
     and secs < greatest((cfg ->> 'minWinSeconds')::numeric, n * (cfg ->> 'secondsPerMove')::numeric) then
    raise exception 'versus_league_too_fast';
  end if;
  d := versus_league_change(p_outcome, coalesce(p_left, 0), coalesce(p_foe_left, 0), m.trophies_before, cfg);
  select max(v::int) into top from jsonb_array_elements_text(cfg -> 'trophies') v;
  if abs(d) > top then raise exception 'versus_league_bad_result'; end if;
  update versus_league_matches x
  set finished_at = now(), outcome = p_outcome, pokemon_left = coalesce(p_left, 0), foe_left = coalesce(p_foe_left, 0),
      delta = d, moves = n, log = p_moves
  where x.id = m.id;
  return query
    update versus_league_members x set trophies = x.trophies + (d - m.delta)
    where x.week = m.week and x.user_id = me
    returning d, x.trophies;
end
$$;

-- ---------------------------------------------------------------- 7. teams others meet

-- Every member a Pokémon the game has, its level 1–100.
create or replace function team_known(p_team jsonb)
returns boolean
language sql stable security definer set search_path = public as $$
  select jsonb_typeof(p_team) = 'array' and not exists (
    select 1 from jsonb_array_elements(p_team) m
    where not mon_known(m -> 'dex') or jsonb_typeof(m -> 'level') <> 'number'
       or (m ->> 'level')::numeric not between 1 and 100
  )
$$;
revoke all on function team_known(jsonb) from public, anon, authenticated;

-- Versus and raid teams: set through the players' own calls, so a bad one is refused with the call's own error.
create or replace function team_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  code text := case when tg_table_name = 'versus_teams' then 'versus_not_eligible' else 'events_not_eligible' end;
begin
  if is_banned(new.user_id) or not team_known(new.team) then raise exception '%', code; end if;
  return new;
end
$$;
revoke all on function team_guard() from public, anon, authenticated;
drop trigger if exists versus_teams_guard on versus_teams;
create trigger versus_teams_guard before insert or update of team on versus_teams
  for each row execute function team_guard();
drop trigger if exists raid_teams_guard on raid_teams;
create trigger raid_teams_guard before insert or update of team on raid_teams
  for each row execute function team_guard();
drop trigger if exists raid_progress_teams_guard on raid_progress_teams;
create trigger raid_progress_teams_guard before insert or update of team on raid_progress_teams
  for each row execute function team_guard();

-- Area versus: written while the save uploads, which must never fail, so a bad team is skipped, not refused.
create or replace function area_versus_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_banned(new.user_id) or not team_known(new.team) then return null; end if;
  new.name := name_clean(new.name);
  new.played_at := least(new.played_at, now());
  return new;
end
$$;
revoke all on function area_versus_guard() from public, anon, authenticated;
drop trigger if exists area_versus_teams_guard on area_versus_teams;
create trigger area_versus_teams_guard before insert or update on area_versus_teams
  for each row execute function area_versus_guard();

-- At most 30 new Versus teams a player a UTC day: each is a new team to beat, so a second account can't hand out
-- endless ones. Honest players change theirs a few times at most.
create table if not exists versus_team_bumps (
  user_id uuid not null,
  realm text not null,
  day date not null,
  n int not null default 0,
  primary key (user_id, realm, day)
);
alter table versus_team_bumps enable row level security;
revoke all on versus_team_bumps from anon, authenticated;

create or replace function versus_teams_bump()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'UTC')::date;
  k int;
begin
  if new.version is not distinct from old.version then return new; end if;
  insert into versus_team_bumps as b (user_id, realm, day, n) values (new.user_id, new.realm, today, 1)
  on conflict (user_id, realm, day) do update set n = b.n + 1
  returning b.n into k;
  delete from versus_team_bumps b where b.day < today - 1;
  if k > 30 then raise exception 'versus_too_many'; end if;
  return new;
end
$$;
revoke all on function versus_teams_bump() from public, anon, authenticated;
drop trigger if exists versus_teams_bump on versus_teams;
create trigger versus_teams_bump before update of version on versus_teams
  for each row execute function versus_teams_bump();

-- ---------------------------------------------------------------- 8. a ban is a ban from everything shared

create or replace function bans_apply()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from versus_teams where user_id = new.user_id;
  delete from raid_teams where user_id = new.user_id;
  delete from raid_progress_teams where user_id = new.user_id;
  delete from area_versus_teams where user_id = new.user_id;
  -- Their open listings end: each Pokémon goes back to its owner, as a cancel does.
  update trade_listings set status = 'cancelled' where owner = new.user_id and status = 'open';
  update versus_league_members set trophies = 0 where user_id = new.user_id and week = versus_league_week();
  delete from versus_league_choices where foe_user = new.user_id;
  return null;
end
$$;
revoke all on function bans_apply() from public, anon, authenticated;
drop trigger if exists leaderboard_bans_apply on leaderboard_bans;
create trigger leaderboard_bans_apply after insert on leaderboard_bans
  for each row execute function bans_apply();

-- The players banned already.
delete from versus_teams v where is_banned(v.user_id);
delete from raid_teams v where is_banned(v.user_id);
delete from raid_progress_teams v where is_banned(v.user_id);
delete from area_versus_teams v where is_banned(v.user_id);
update trade_listings t set status = 'cancelled' where t.status = 'open' and is_banned(t.owner);
delete from versus_league_choices c where is_banned(c.foe_user);

-- ---------------------------------------------------------------- 9. Versus fights recorded

create or replace function versus_battles_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_banned(new.attacker_id) then raise exception 'versus_no_team'; end if;
  if (select count(*) from versus_battles b
      where b.attacker_id = new.attacker_id and b.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'versus_too_many';
  end if;
  return new;
end
$$;
revoke all on function versus_battles_guard() from public, anon, authenticated;
create index if not exists versus_battles_attacker_at on versus_battles (attacker_id, created_at);
drop trigger if exists versus_battles_guard on versus_battles;
create trigger versus_battles_guard before insert on versus_battles
  for each row execute function versus_battles_guard();

-- ---------------------------------------------------------------- 10. saves

revoke delete on saves from authenticated;
alter table saves drop constraint if exists saves_small;
alter table saves add constraint saves_small check (pg_column_size(data) < 8000000) not valid;

-- ---------------------------------------------------------------- 11. push (still Off)

create or replace function push_subscriptions_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- The browsers' push services only: Chrome, Edge and Android (FCM), Firefox, Safari, Windows.
  if substring(new.endpoint from '^https://([^/:]+)') !~
     '^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$' then
    raise exception 'push_bad_subscription' using errcode = '22023';
  end if;
  return new;
end
$$;
revoke all on function push_subscriptions_guard() from public, anon, authenticated;
drop trigger if exists push_subscriptions_guard on push_subscriptions;
create trigger push_subscriptions_guard before insert or update of endpoint on push_subscriptions
  for each row execute function push_subscriptions_guard();

create or replace function push_notices_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Already overdue: old news, and one due hours ago would jump the queue ahead of the real ones.
  if new.sent_at is null and new.due_at < now() - interval '10 minutes' then return null; end if;
  return new;
end
$$;
revoke all on function push_notices_guard() from public, anon, authenticated;
drop trigger if exists push_notices_guard on push_notices;
create trigger push_notices_guard before insert or update of due_at on push_notices
  for each row execute function push_notices_guard();

-- ---------------------------------------------------------------- 12. guests

-- A guest's device id is the guest's own word, so feedback_stamp's limit per device can't hold them: at most 20 guest
-- messages every 10 minutes between them all (the record is 1).
create or replace function feedback_guest_cap()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- The game's own messages (feedback_system) are the server's; a guest's `from_admin` is their own word.
  if auth.uid() is null and not (coalesce(new.from_admin, false) and feedback_system()) and (
    select count(*) from feedback f
    where f.user_id is null and not f.from_admin and f.created_at > now() - interval '10 minutes'
  ) >= 20 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function feedback_guest_cap() from public, anon, authenticated;
drop trigger if exists feedback_guest_cap on feedback;
create trigger feedback_guest_cap before insert on feedback
  for each row execute function feedback_guest_cap();

-- A new guest in the analytics: past 3,000 new ones in a UTC day (the record is 361), the day's further new guests are
-- left out (made-up device ids). Guests already known, and signed-in players, always count.
create or replace function analytics_guest_full(p_player text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_player not like 'device:%' then return false; end if;
  if exists (select 1 from players x where x.player = p_player) then return false; end if;
  return (select count(*) from players x
          where x.user_id is null and x.first_day >= (now() at time zone 'UTC')::date - 1) >= 3000;
end
$$;
revoke all on function analytics_guest_full(text) from public, anon, authenticated;

create or replace function analytics_guest_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if analytics_guest_full(new.player) then return null; end if;
  return new;
end
$$;
revoke all on function analytics_guest_guard() from public, anon, authenticated;
drop trigger if exists players_guest_guard on players;
create trigger players_guest_guard before insert on players
  for each row execute function analytics_guest_guard();
drop trigger if exists player_days_guest_guard on player_days;
create trigger player_days_guest_guard before insert on player_days
  for each row execute function analytics_guest_guard();
drop trigger if exists player_hours_guest_guard on player_hours;
create trigger player_hours_guest_guard before insert on player_hours
  for each row execute function analytics_guest_guard();

-- ---------------------------------------------------------------- 13. the admin's suspicious list

-- Every save (both realms) with something no honest game has reached, and why: on demand only (about a second), the
-- admin's button. The numbers are 2026-11-01's records, well above any honest player's.
create or replace function admin_suspicious()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    with caps as materialized (select r.id, region_dex_cap(r.id) as cap from regions r)
    select jsonb_agg(to_jsonb(x) order by jsonb_array_length(x.reasons) desc, x.box desc)
    from (
      select s.user_id, s.realm,
        coalesce(c.name, 'Trainer') as name,
        st.box, st.shinies, st.lv100,
        st.gold, st.candies, st.masters, st.top_stack,
        coalesce(pl.days, 0) as days,
        pl.first_day,
        st.dupes,
        st.dex_over,
        st.future,
        is_banned(s.user_id) as banned,
        to_jsonb(array_remove(array[
          case when st.box > 300 and st.box > 150 * greatest(coalesce(pl.days, 1), 1) then 'box' end,
          case when st.shinies > 300 or (st.shinies >= 30 and st.shinies > 0.2 * st.box) then 'shinies' end,
          case when st.lv100 > 300 then 'levels' end,
          case when st.gold > 5000000 then 'gold' end,
          case when st.candies > 1000 or st.masters > 100 or st.top_stack > 9999 then 'items' end,
          case when st.dupes > 0 then 'trade' end,
          case when st.dex_over then 'dex' end,
          case when st.future then 'future' end
        ], null)) as reasons
      from saves s
      left join player_cards c on c.user_id = s.user_id and c.realm = s.realm
      left join players pl on pl.player = s.user_id::text
      cross join lateral (
        with mons as (
          select m from jsonb_array_elements(coalesce(s.data -> 'box', '[]')) m
          union all
          select m from jsonb_each(coalesce(s.data -> 'parked', '{}')) p(k, v),
            jsonb_array_elements(case when jsonb_typeof(v -> 'box') = 'array' then v -> 'box' else '[]' end) m
          where jsonb_typeof(v) = 'object'
        ), inv as (
          select k, case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric else 0 end as n
          from jsonb_each(case when jsonb_typeof(s.data -> 'inventory') = 'object' then s.data -> 'inventory' else '{}' end) i(k, v)
        )
        select
          (select count(*)::int from mons) as box,
          (select count(*)::int from mons where m -> 'shiny' = 'true'::jsonb) as shinies,
          (select count(*)::int from mons where (m ->> 'level') ~ '^[0-9]+$' and (m ->> 'level')::numeric >= 100) as lv100,
          case when jsonb_typeof(s.data -> 'gold') = 'number' then (s.data ->> 'gold')::numeric else 0 end as gold,
          coalesce((select n from inv where k = 'rare-candy'), 0) as candies,
          coalesce((select n from inv where k = 'master-ball'), 0) as masters,
          coalesce((select max(n) from inv), 0) as top_stack,
          -- Pokémon given in a trade and still held.
          (select count(*)::int from trade_gone g
            where g.user_id = s.user_id and s.realm = 'main' and exists (select 1 from mons where m ->> 'id' = g.inst_id)) as dupes,
          exists (select 1 from player_card_regions r join caps cp on cp.id = r.region
                  where r.user_id = s.user_id and r.realm = s.realm and r.pokedex >= cp.cap) as dex_over,
          s.updated_at > now() + interval '1 hour'
            or exists (select 1 from mons where jsonb_typeof(m -> 'caughtAt') = 'number'
                       and (m ->> 'caughtAt')::numeric > extract(epoch from now() + interval '1 day') * 1000) as future
      ) st
    ) x
    where jsonb_array_length(x.reasons) > 0
  ), '[]'::jsonb);
end
$$;
revoke all on function admin_suspicious() from public, anon;
grant execute on function admin_suspicious() to authenticated;

-- ======================================================================== ↓ supabase/migrations/0115_weather.sql
-- The region flavours' weather (docs/62 §2–4), and the server's check for all five region flavours.
-- 1. Two switches, Off: `hoennWeather` (Hoenn's fixed weather: rain on Routes 118–121, the Route 111 desert's
--    sandstorm, Route 113's ash, Mt. Pyre's fog, Sootopolis's sun and rain a round each) and `galarWeather` (the Wild
--    Area's, the Isle of Armor's and the Crown Tundra's weather of the day, Circhester's snow). Each area's weather is
--    the game's own content (src/engine/flavoursContent.ts); a row's `areas` overrides it.
-- 2. side_quest_open(key) also knows the five region flavours: hoennWeather, galarWeather, hordes, trials, titans
--    (0116–0118 add the other three rows; a key with no row yet is off).
-- 3. configVersion + 1. Safe to run again.
insert into game_config (key, value) values ('hoennWeather', '{"access":"off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('galarWeather', '{"access":"off"}'::jsonb) on conflict (key) do nothing;

-- A side quest's or a region flavour's switch for the caller: on for everyone, or for the admin only (their JWT). An
-- odd value is off.
create or replace function side_quest_open(p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    p_key in ('disguises', 'safari', 'rivals', 'giftMoments', 'hoennWeather', 'galarWeather', 'hordes', 'trials', 'titans')
      and (a = 'all' or (a = 'admin' and is_admin())),
    false)
  from (select coalesce((select value ->> 'access' from game_config where key = p_key and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function side_quest_open(text) from public;
grant execute on function side_quest_open(text) to anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0116_hordes.sql
-- Kalos hordes (docs/62 §5): the switch, Off. A horde is 4 % of Kalos's wild cards, at most one a round in an area: five
-- of a species 3 levels down (one in ten with another species), fought two at a time, one throw at the end. The
-- numbers are the game's own; a row's own override them. Then configVersion + 1. Safe to run again.
insert into game_config (key, value) values ('hordes', '{"access":"off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0117_trials.sql
-- Alola's island trials (docs/62 §6): the seven captains' battles become their Totem's (×2 HP, a die more, two allies
-- called), won when the Totem falls. The trials are the game's own content (src/engine/flavoursContent.ts).
-- 1. The switch, Off. 2. Vast Poni Canyon's trial: Totem Kommo-o, a gym row there only for it (left out while the
--    switch is off), before Hapu's grand trial in Exeggutor Island & Vast Poni Canyon. 3. configVersion + 1.
-- Safe to run again. supabase/seed.sql carries the trainer and the area's gyms.
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

-- ======================================================================== ↓ supabase/migrations/0118_titans.sql
-- Paldea's Titans (docs/62 §7): five areas' bosses, fought in two phases (the second after a Herba Mystica: ×2 HP, a
-- die more), never caught, leaving ₽1,000 and 3 Rare Candies. Only while the switch is on: off, the areas have no boss.
-- 1. The switch, Off. 2. Each area's Titan, unless it has that boss already (an admin's edit is kept):
--   South Province (Area Three) & Cortondo: Klawf Lv.16 · West Province (Area One) & the Segin Squad's Base:
--   Bombirdier Lv.20 · The Schedar Squad's Base & East Province (Area Three): Orthworm Lv.29 · The Asado Desert &
--   Cascarrafa: Great Tusk Lv.33 (Iron Treads on Violet's side) · Casseroya Lake: Dondozo Lv.56 with Tatsugiri Lv.57.
--   They stay in their areas' wild pools. 3. configVersion + 1. Safe to run again. supabase/seed.sql carries the bosses.
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

-- ======================================================================== ↓ supabase/migrations/0119_castform_forms.sql
-- Castform's weather forms (docs/62 §3, the user's ask of 2026-11-01): its Sunny (Fire), Rainy (Water) and Snowy (Ice)
-- Forms, battle forms taken as a fight under sun, rain (or a thunderstorm) or snow starts, its Normal dice turning into
-- the form's type. They are never caught (a Castform caught in one is Castform). 1. The three rows, left alone when
-- there. 2. configVersion + 1. Safe to run again. supabase/seed.sql carries them.
insert into pokemon (dex, name, type1, type2, base_hp, max_hp, speed, sprite_url, dice, rerolls, catch_value, evolutions, milestones, notes, form) values
  (10013, 'Castform', 'fire', null, 12, 281, 70, '/pokemon/10013_front.png', '[{"type":"fire","count":2}]'::jsonb, 2, 5, '[]'::jsonb, '[]'::jsonb, 'castform-sunny · in sun, its Normal dice become fire dice', '{"of":351,"kind":"battle","trigger":"weather","weather":["sun"]}'::jsonb),
  (10014, 'Castform', 'water', null, 12, 281, 70, '/pokemon/10014_front.png', '[{"type":"water","count":2}]'::jsonb, 2, 5, '[]'::jsonb, '[]'::jsonb, 'castform-rainy · in rain or thunderstorm, its Normal dice become water dice', '{"of":351,"kind":"battle","trigger":"weather","weather":["rain","thunderstorm"]}'::jsonb),
  (10015, 'Castform', 'ice', null, 12, 281, 70, '/pokemon/10015_front.png', '[{"type":"ice","count":2}]'::jsonb, 2, 5, '[]'::jsonb, '[]'::jsonb, 'castform-snowy · in snow, its Normal dice become ice dice', '{"of":351,"kind":"battle","trigger":"weather","weather":["snow"]}'::jsonb)
on conflict (dex) do nothing;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0120_type_trials.sql
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

-- ======================================================================== ↓ supabase/migrations/0121_heart_scale_gifts.sql
-- Heart Scales as a message gift (docs/15 §23, docs/60): Admin → Messages (an answer) and a player's profile (a message
-- the admin starts) can give Heart Scales, the Friend Market's currency. They live on the server, per account
-- (friendship_wallets, 0107), not in the save, so the server pays them itself: the moment the player's game claims the
-- message's gifts (feedback_claim_gifts), in the same statement that marks them opened, so they're paid once.
--
-- 1. feedback_gifts_ok(): a gift may also be { kind: 'heartScales', amount: 1–9,999, region } (the region is kept for
--    the shape: 'latest').
-- 2. A message carrying Heart Scales goes to an account (user_id), never a guest's device: a guest has no wallet.
-- 3. feedback_claim_gifts(): the Heart Scales of the messages it hands over go into their player's wallet. Only the
--    balance moves: not what was earned today (the streaks' daily cap) nor the total earned.
--
-- Run after 0048 and 0107; safe to run again.

-- ---------------------------------------------------------------- 1. the check

create or replace function feedback_gifts_ok(p jsonb)
returns boolean
language sql immutable as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) between 1 and 20
    and pg_column_size(p) < 4000
    and not exists (
      select 1 from jsonb_array_elements(p) g
      where not case
        when jsonb_typeof(g) <> 'object' then false
        when coalesce(g ->> 'region', '') !~ '^[A-Za-z0-9_-]{1,40}$' then false
        when g ->> 'kind' = 'item' then
          coalesce(g ->> 'key', '') ~ '^[A-Za-z0-9_.-]{1,80}$' and feedback_gift_int(g -> 'qty', 1, 999)
        when g ->> 'kind' = 'pokemon' then
          feedback_gift_int(g -> 'dex', 1, 999999)
          and feedback_gift_int(g -> 'level', 1, 100)
          and coalesce(jsonb_typeof(g -> 'shiny'), 'boolean') = 'boolean'
        when g ->> 'kind' = 'gold' then feedback_gift_int(g -> 'amount', 1, 999999)
        when g ->> 'kind' = 'heartScales' then feedback_gift_int(g -> 'amount', 1, 9999)
        else false
      end
    )
  )
$$;

-- ---------------------------------------------------------------- 2. to an account only

create or replace function feedback_gifts_scales(p jsonb)
returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array'
     and exists (select 1 from jsonb_array_elements(p) g where g ->> 'kind' = 'heartScales')
$$;

alter table feedback drop constraint if exists feedback_scales_need_account;
alter table feedback add constraint feedback_scales_need_account
  check (user_id is not null or not coalesce(feedback_gifts_scales(gifts), false));

-- ---------------------------------------------------------------- 3. the claim pays them

-- As 0048's, and the Heart Scales of what it hands over go into the wallets. Data-modifying WITH parts always run to
-- the end, read or not; the claimed rows carry their player (an account, by the check above).
create or replace function feedback_claim_gifts(p_ids bigint[], p_device_id text)
returns table (id bigint, gifts jsonb)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not gifts_open() then
    raise exception 'gifts_off' using errcode = 'P0001';
  end if;
  return query
    with claimed as (
      update feedback f
      set gifts_claimed_at = now()
      where f.id = any(p_ids)
        and f.gifts is not null
        and f.gifts_claimed_at is null
        and (
          (auth.uid() is not null and f.user_id = auth.uid())
          or (f.user_id is null and f.device_id = p_device_id)
        )
      returning f.id, f.gifts, f.user_id
    ), paid as (
      insert into friendship_wallets as w (user_id, balance)
      select c.user_id, sum((g ->> 'amount')::int)
      from claimed c cross join lateral jsonb_array_elements(c.gifts) g
      where c.user_id is not null and g ->> 'kind' = 'heartScales'
      group by c.user_id
      on conflict (user_id) do update set balance = w.balance + excluded.balance
    )
    select c.id, c.gifts from claimed c;
end
$$;

revoke all on function feedback_claim_gifts(bigint[], text) from public;
grant execute on function feedback_claim_gifts(bigint[], text) to anon, authenticated;

-- ======================================================================== ↓ supabase/migrations/0122_snowglobe_valley.sql
-- Snowglobe Valley (docs/64), the winter small world. Generated by `pnpm snowglobe-valley --sql`: do not edit by
-- hand. Its region, areas, pools and trainers, and the world in game_config `smallWorlds` (the switch is left as
-- it is). Safe to run again.
alter table areas add column if not exists mode jsonb;
insert into regions (id, name, order_index, dex_range, starters, starter_level, league_area_id, next_region, enabled) values
  ('world-snowglobe-valley', 'Snowglobe Valley', 100, '[99999,99999]'::jsonb, '[179,506,731]'::jsonb, 5, 'e116c980-4cbc-5b72-bf2e-e07d1853c123', null, false)
on conflict (id) do update set name = excluded.name, order_index = excluded.order_index, dex_range = excluded.dex_range, starters = excluded.starters, starter_level = excluded.starter_level, league_area_id = excluded.league_area_id, next_region = excluded.next_region, enabled = excluded.enabled;

insert into trainers (id, name, sprite_url, team, role, badge, upgrade_level, battle_background, rival_of, items) values
  ('ac527b9c-151a-5e8e-b54b-d28b5fa9bc23', 'Youngster Tim', '/trainers/classes/youngster.png', '[{"dex":161,"level":4},{"dex":396,"level":4}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('544a5b22-135f-5b7b-b460-2e58d4cef69e', 'Skier Lena', '/trainers/classes/sinnoh/skier-f.png', '[{"dex":872,"level":5}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('afd9c966-2251-5ab8-a368-0c6ced310ab5', 'Lass Pippa', '/trainers/classes/lass.png', '[{"dex":163,"level":4},{"dex":161,"level":4}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('cdb297cf-02dd-5fa2-a612-ef7274380123', 'Bug Catcher Moss', '/trainers/classes/bug-catcher.png', '[{"dex":204,"level":9},{"dex":872,"level":9}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('e37a495d-4f42-5148-8118-147d1fc73196', 'Ranger Fir', '/trainers/classes/sinnoh/ranger-m.png', '[{"dex":585,"level":10},{"dex":216,"level":9}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('09399dac-7efe-5e96-bce4-28c3b73bb83a', 'Bird Keeper Robin', '/trainers/classes/bird-keeper.png', '[{"dex":661,"level":9},{"dex":821,"level":9}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('f2dc6723-cefa-5a26-bfb1-115ba7853b8c', 'Picnicker Ivy', '/trainers/classes/picnicker.png', '[{"dex":459,"level":10},{"dex":613,"level":9}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('aac0d31c-592b-56d4-82f1-283afcbdc781', 'Fisherman Pike', '/trainers/classes/fisherman.png', '[{"dex":129,"level":13},{"dex":349,"level":14}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('8ef6d7b2-8574-5b65-bdca-64d5fa6da143', 'Skier Neve', '/trainers/classes/sinnoh/skier-f.png', '[{"dex":361,"level":14},{"dex":86,"level":14}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('20f53cac-1fa6-5d15-abe2-67fcb01832f6', 'Fisherman Brook', '/trainers/classes/johto/fisherman.png', '[{"dex":90,"level":14},{"dex":194,"level":15}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('cc54aeac-aeec-5d2e-8fd2-38d143e3b0d8', 'Pokéfan Carol', '/trainers/classes/sinnoh/pokefan-f.png', '[{"dex":868,"level":18},{"dex":446,"level":18}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('c1fb6789-d2c6-51b5-809c-79ca7dfe9d12', 'Gentleman Jasper', '/trainers/classes/gentleman.png', '[{"dex":831,"level":19},{"dex":180,"level":18}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('e45728e6-24fa-5806-ad06-a00fa6a11b49', 'Lady Ginger', '/trainers/classes/lady.png', '[{"dex":582,"level":18},{"dex":433,"level":18}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('2ac04d47-276d-5514-87e3-2dfc0d0da2f8', 'School Kid Joy', '/trainers/classes/sinnoh/school-kid-f.png', '[{"dex":582,"level":17},{"dex":872,"level":17},{"dex":433,"level":17}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('0c620aee-6ac3-587d-b39c-9ee514bb49d2', 'Engineer Gus', '/trainers/classes/engineer.png', '[{"dex":599,"level":23},{"dex":436,"level":23}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('3f3e66ff-6def-5cce-81ab-00539f463ef2', 'Worker Tinsel', '/trainers/classes/sinnoh/worker.png', '[{"dex":957,"level":24},{"dex":438,"level":23}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('1562662f-f591-501a-a0cb-bcc02b8cdc74', 'Clown Jingle', '/trainers/classes/sinnoh/clown.png', '[{"dex":185,"level":24},{"dex":10176,"level":24}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('48e7056f-4344-528a-828a-92ef606207cb', 'Scientist Gearhart', '/trainers/classes/scientist.png', '[{"dex":599,"level":25},{"dex":436,"level":24},{"dex":624,"level":24}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('bcf407c6-052c-50c6-a404-ef82c867c56d', 'Hiker Alder', '/trainers/classes/hiker.png', '[{"dex":712,"level":29},{"dex":220,"level":29}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('d76e6ec9-484c-5ad6-a59c-95db1d783cd6', 'Skier Sven', '/trainers/classes/sinnoh/skier-m.png', '[{"dex":215,"level":29},{"dex":361,"level":29}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('83d111ba-7892-5b2b-a586-e3a4aa5d8120', 'Ace Trainer Crystal', '/trainers/classes/sinnoh/ace-trainer-f.png', '[{"dex":615,"level":30},{"dex":42,"level":30},{"dex":221,"level":30}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('ce7f0841-96b5-5166-896e-487c22b8724b', 'Ninja Boy Hail', '/trainers/classes/hoenn/ninja-boy.png', '[{"dex":215,"level":30},{"dex":41,"level":29}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('fe9e0e67-0cf2-5e53-a0f6-85d8c0a32576', 'Sailor Hal', '/trainers/classes/sailor.png', '[{"dex":739,"level":35},{"dex":171,"level":35}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('090a5f8e-c186-589b-a7e1-4aa778de7ef6', 'Fisherman Marlin', '/trainers/classes/sinnoh/fisherman.png', '[{"dex":171,"level":35},{"dex":130,"level":36}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('afa7ac18-82b6-5051-a605-89dfef8a1654', 'Beauty Opal', '/trainers/classes/beauty.png', '[{"dex":875,"level":35},{"dex":87,"level":36}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('f86adb1f-5f89-52a5-b648-719817ae3a6f', 'Sailor Floe', '/trainers/classes/hoenn/sailor.png', '[{"dex":364,"level":35},{"dex":974,"level":35},{"dex":171,"level":35}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('6235c3bd-4320-5f25-a5e5-7b6835bf8825', 'Swimmer Bjorn', '/trainers/classes/swimmer-m.png', '[{"dex":364,"level":34},{"dex":171,"level":34}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('23de72c6-ebd3-5aec-9f84-48235bfd4f9e', 'Kindler Cinder', '/trainers/classes/hoenn/kindler.png', '[{"dex":219,"level":41},{"dex":323,"level":41}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('a2cd3e29-e29c-5000-bb14-d5cb66c888d4', 'Firebreather Ember', '/trainers/classes/johto/firebreather.png', '[{"dex":219,"level":41},{"dex":324,"level":41}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('5fe0fb2a-1237-51da-a608-51257cb7409c', 'Hiker Basalt', '/trainers/classes/hiker.png', '[{"dex":323,"level":42},{"dex":219,"level":41}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('e6a20c65-04ff-54dc-b5f2-2f85307d09c3', 'Aroma Lady Cocoa', '/trainers/classes/aroma-lady.png', '[{"dex":143,"level":42},{"dex":324,"level":41}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('ce898adb-8dc3-5ab4-bb75-396b7e8bea89', 'Ace Trainer Sol', '/trainers/classes/sinnoh/ace-trainer-m.png', '[{"dex":663,"level":42},{"dex":219,"level":42},{"dex":323,"level":41}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('cae9dd7d-8a80-59ca-8149-93c2512aea03', 'Skier Frost', '/trainers/classes/sinnoh/skier-m.png', '[{"dex":362,"level":46},{"dex":478,"level":46}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('cf9bd4dd-48be-5eb5-9e30-f639e0867aa6', 'Ace Trainer Aspen', '/trainers/classes/sinnoh/ace-trainer-f.png', '[{"dex":614,"level":47},{"dex":334,"level":47}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('04456604-8ce4-54dd-87a8-61cc88c06dd9', 'Bird Keeper Kestrel', '/trainers/classes/hoenn/bird-keeper.png', '[{"dex":823,"level":47},{"dex":334,"level":46}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('9d275c9e-6cf1-5be6-8694-bff12ead9cf0', 'Hiker Everest', '/trainers/classes/sinnoh/hiker.png', '[{"dex":740,"level":46},{"dex":614,"level":46},{"dex":359,"level":46}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('2f7a3150-aa25-5ca2-8c81-c8156cd713b1', 'Dragon Tamer Draven', '/trainers/classes/hoenn/dragon-tamer.png', '[{"dex":334,"level":48},{"dex":473,"level":48}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('0dcb5571-5c4f-5dad-8ec7-51d7f1d48f59', 'Ace Trainer Boreal', '/trainers/classes/sinnoh/ace-trainer-m.png', '[{"dex":461,"level":52},{"dex":713,"level":52}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('134d43f2-8cc4-5f54-a155-15706012730c', 'Psychic Aurora', '/trainers/classes/psychic-f.png', '[{"dex":124,"level":52},{"dex":437,"level":52}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('507a9a17-80a7-5fc2-bae3-4b4efa3174a7', 'Skier Yuki', '/trainers/classes/johto/skier.png', '[{"dex":365,"level":52},{"dex":473,"level":52}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('5c520761-5840-5c37-b85b-e9fec1d861c1', 'Veteran Tundra', '/trainers/classes/sinnoh/veteran-m.png', '[{"dex":227,"level":52},{"dex":584,"level":52},{"dex":713,"level":53}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('2415d7b1-0886-5520-9e28-61f4d1dd307d', 'Ranger Lumi', '/trainers/classes/sinnoh/ranger-f.png', '[{"dex":873,"level":52},{"dex":10104,"level":53}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('640b1e47-3191-5b35-bb73-5ae097202c6f', 'Cooltrainer Glacier', '/trainers/classes/cooltrainer-m.png', '[{"dex":461,"level":53},{"dex":10102,"level":53},{"dex":614,"level":52}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('e6cfe89f-07de-516c-a1aa-75a2b1b7bcd8', 'Elite Four Fjord', '/trainers/classes/kalos/elite-siebold.png', '[{"dex":131,"level":53},{"dex":87,"level":53},{"dex":91,"level":54}]'::jsonb, 'elite', null, null, null, null, '["hyper-potion"]'::jsonb),
  ('abef4b0e-4e05-5cda-b6b7-6743208e6a27', 'Elite Four Gunnar', '/trainers/classes/kalos/elite-wikstrom.png', '[{"dex":10102,"level":55},{"dex":823,"level":55},{"dex":601,"level":56}]'::jsonb, 'elite', null, null, null, null, '["hyper-potion"]'::jsonb),
  ('fcb7e812-a1ec-5cf7-a6a3-7e8a9eec734f', 'Elite Four Drasna', '/trainers/classes/kalos/elite-drasna.png', '[{"dex":334,"level":57},{"dex":149,"level":57},{"dex":998,"level":58}]'::jsonb, 'elite', null, null, null, null, '["hyper-potion"]'::jsonb),
  ('8071d246-48a7-591d-8f92-7bb07f39472b', 'Elite Four Holly', '/trainers/classes/hoenn/elite-glacia.png', '[{"dex":365,"level":58},{"dex":362,"level":57},{"dex":10104,"level":58}]'::jsonb, 'elite', null, null, null, null, '["hyper-potion"]'::jsonb),
  ('06231e0b-5758-5c67-ad6d-e44b673a012c', 'Champion Nicholas', '/trainers/classes/kalos/wulfric.png', '[{"dex":473,"level":59},{"dex":461,"level":59},{"dex":460,"level":60}]'::jsonb, 'champion', null, null, null, null, '["hyper-potion","abomasite"]'::jsonb),
  ('608ecea7-4f2e-591f-98e5-f18c98a0eef2', 'Ranger Luna', '/trainers/classes/sinnoh/ranger-f.png', '[{"dex":164,"level":27},{"dex":234,"level":28},{"dex":828,"level":28}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('ce85634a-9f72-5c12-851f-7668ab2e696a', 'Pokéfan Mistle', '/trainers/classes/sinnoh/pokefan-m.png', '[{"dex":225,"level":38},{"dex":869,"level":38}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('25450dd7-2cb4-5ac1-bbdf-b60d821f39c6', 'Lady Garland', '/trainers/classes/sinnoh/lady.png', '[{"dex":764,"level":39},{"dex":358,"level":38}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('9a4989ca-ffd9-5509-bb98-2670f6c4f102', 'Sage Hiemal', '/trainers/classes/johto/sage.png', '[{"dex":460,"level":53},{"dex":217,"level":53},{"dex":586,"level":54}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('02c5f2a0-69ae-59a4-ae9e-40de465cf355', 'Ace Trainer Chrona', '/trainers/classes/sinnoh/ace-trainer-f.png', '[{"dex":601,"level":60},{"dex":131,"level":60},{"dex":998,"level":61}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb),
  ('919faac6-154b-5dd8-bc0a-7416508a7b5f', 'Cooltrainer Genesis', '/trainers/classes/cooltrainer-f.png', '[{"dex":998,"level":68},{"dex":473,"level":68},{"dex":10104,"level":69}]'::jsonb, 'trainer', null, null, null, null, '[]'::jsonb)
on conflict (id) do update set name = excluded.name, sprite_url = excluded.sprite_url, team = excluded.team, role = excluded.role, badge = excluded.badge, upgrade_level = excluded.upgrade_level, battle_background = excluded.battle_background, rival_of = excluded.rival_of, items = excluded.items;

insert into areas (id, order_index, region_id, name, banner_url, rounds_to_clear, min_level, max_level, encounter_weights, backtrack_multiplier, legendary_boss, scales_to_team, scale_offsets, easy_mode, enemy_upgrade_level, battle_background, hidden, unlock_conditions, gyms, mode) values
  ('0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 9200, 'world-snowglobe-valley', 'Snowy Trail', '/banners/snow_mountains.png', 1, 3, 7, '{"wild":7,"trainer":1,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 1, 'default', false, null, '[]'::jsonb, null),
  ('86027687-5c39-5902-a7fa-9da648a00cbc', 9201, 'world-snowglobe-valley', 'Pinewood Forest', '/banners/forest.png', 1, 7, 12, '{"wild":6,"trainer":2,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 1, 'default', false, null, '[]'::jsonb, null),
  ('571fc205-b861-59f3-862c-a1ea8fd135fa', 9202, 'world-snowglobe-valley', 'Frozen Pond', '/banners/snow_mountains.png', 1, 11, 16, '{"wild":6,"trainer":2,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 2, 'default', false, null, '[]'::jsonb, null),
  ('24714d59-a220-5b61-bfcc-ec569104657d', 9203, 'world-snowglobe-valley', 'Holly Village', '/banners/snow_mountains.png', 1, 15, 21, '{"wild":5,"trainer":3,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 2, 'default', false, null, '[]'::jsonb, null),
  ('e8a95d77-f972-5fb7-a784-33373bac3d37', 9204, 'world-snowglobe-valley', 'Toy Workshop', '/banners/factory.png', 1, 20, 26, '{"wild":5,"trainer":3,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 2, 'default', false, null, '[]'::jsonb, null),
  ('e5561682-98aa-5c19-b8a4-32acdc30c64e', 9205, 'world-snowglobe-valley', 'Icicle Cave', '/banners/cave.png', 1, 25, 32, '{"wild":5,"trainer":3,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 3, 'default', false, null, '[]'::jsonb, null),
  ('93acfeb0-0e5b-592c-a50b-8c817cd51c71', 9206, 'world-snowglobe-valley', 'Frostbite Harbour', '/banners/ocean.png', 1, 31, 38, '{"wild":4,"trainer":4,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 4, 'default', false, null, '[]'::jsonb, null),
  ('d7c050e7-dd23-5e09-8385-2cce834e515d', 9207, 'world-snowglobe-valley', 'Ember Springs', '/banners/volcano.png', 1, 37, 44, '{"wild":4,"trainer":4,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 4, 'default', false, null, '[]'::jsonb, null),
  ('82c065db-ab84-5f2e-ae22-0c0d01362006', 9208, 'world-snowglobe-valley', 'Blizzard Pass', '/banners/snow_mountains.png', 1, 42, 50, '{"wild":4,"trainer":4,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 4, 'default', false, null, '[]'::jsonb, null),
  ('8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 9209, 'world-snowglobe-valley', 'Aurora Summit', '/banners/snow_mountains.png', 1, 48, 56, '{"wild":4,"trainer":4,"center":1,"item":1,"casino":0,"gift":1}'::jsonb, 0.5, null, false, null, false, 4, 'default', false, null, '[]'::jsonb, null),
  ('e116c980-4cbc-5b72-bf2e-e07d1853c123', 9210, 'world-snowglobe-valley', 'Frost League', '/banners/default.png', 0, 52, 60, '{"wild":0,"trainer":0,"center":0,"item":0,"casino":0}'::jsonb, 0.5, null, false, null, false, 7, 'default', false, null, '["e6cfe89f-07de-516c-a1aa-75a2b1b7bcd8","abef4b0e-4e05-5cda-b6b7-6743208e6a27","fcb7e812-a1ec-5cf7-a6a3-7e8a9eec734f","8071d246-48a7-591d-8f92-7bb07f39472b","06231e0b-5758-5c67-ad6d-e44b673a012c"]'::jsonb, null),
  ('b1f65375-1a86-5211-ab2f-48d83db2b40f', 9211, 'world-snowglobe-valley', 'Moonlit Glade', '/banners/forest.png', 1, 24, 30, '{"wild":3,"trainer":1,"center":1,"item":1,"casino":0}'::jsonb, 0.5, '[{"dex":234,"level":30,"shiny":true}]'::jsonb, false, null, false, 3, 'default', true, '[{"kind":"pokedex","count":20}]'::jsonb, '[]'::jsonb, '{"kind":"tracks","rounds":[{"size":3,"taps":5,"wild":3,"finds":1,"cabins":1,"apart":false},{"size":3,"taps":5,"wild":3,"finds":1,"cabins":1,"apart":false},{"size":4,"taps":7,"wild":5,"finds":2,"cabins":1,"apart":true}],"emptyPrintsOnly":false}'::jsonb),
  ('da1bc5c9-2661-54cb-9896-6979901a096d', 9212, 'world-snowglobe-valley', 'Evergreen Hill', '/banners/snow_mountains.png', 1, 34, 40, '{"wild":2,"trainer":2,"center":1,"item":1,"casino":0,"gift":3}'::jsonb, 0.5, '[{"dex":225,"level":40,"shiny":true,"present":true}]'::jsonb, false, null, false, 5, 'default', true, '[]'::jsonb, '[]'::jsonb, null),
  ('d22c8323-edb5-5a4a-8004-a49d833ee24e', 9213, 'world-snowglobe-valley', 'Crown Shrine', '/banners/snow_mountains.png', 1, 48, 55, '{"wild":3,"trainer":1,"center":1,"item":1,"casino":0}'::jsonb, 0.5, '[{"dex":460,"level":50,"shiny":true}]'::jsonb, false, null, false, 6, 'default', true, '[{"kind":"pokedex","count":50}]'::jsonb, '[]'::jsonb, '{"kind":"whiteout","waves":[[{"dex":362,"level":47},{"dex":437,"level":47}],[{"dex":614,"level":48},{"dex":586,"level":48},{"dex":359,"level":49}],[{"dex":365,"level":49},{"dex":740,"level":49},{"dex":171,"level":50},{"dex":901,"level":50}]],"weather":"snow","bonfirePercent":40}'::jsonb),
  ('4ec17080-5cb8-59c6-b862-45b620296d5d', 9214, 'world-snowglobe-valley', 'Spear Pillar', '/banners/sky.png', 1, 56, 64, '{"wild":3,"trainer":1,"center":1,"item":1,"casino":0}'::jsonb, 0.5, '[{"dex":483,"level":70,"shiny":true,"raid":true},{"dex":484,"level":70,"shiny":true,"raid":true}]'::jsonb, false, null, false, 7, 'default', true, '[{"kind":"cleared","areaId":"e116c980-4cbc-5b72-bf2e-e07d1853c123"}]'::jsonb, '[]'::jsonb, '{"kind":"timeRace","forks":[["fire","grass"],["dark","psychic"],["dragon","ice"],["electric","ground"]],"legends":[{"type":"water","dex":484},{"type":"steel","dex":483}],"perFork":3,"seconds":720,"shard":{"chance":35,"seconds":30},"items":[{"key":"hyper-potion","qty":2,"weight":40},{"key":"revive","qty":1,"weight":35},{"key":"max-revive","qty":1,"weight":10}],"speed":1.5,"replay":{"forks":[["normal","fairy"],["rock","flying"],["bug","dragon"],["ice","dark"]],"levelBonus":4,"seconds":600},"raid":{"level":70,"upgradeLevel":8,"bars":3,"teamCap":70}}'::jsonb),
  ('fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 9215, 'world-snowglobe-valley', 'Hall of Origin', '/banners/sky.png', 1, 52, 70, '{"wild":3,"trainer":1,"center":1,"item":1,"casino":0}'::jsonb, 0.5, '[{"dex":493,"level":90,"shiny":true,"raid":true}]'::jsonb, false, null, false, 8, 'default', true, '[{"kind":"pokedex","count":90}]'::jsonb, '[]'::jsonb, '{"kind":"portal","portals":10,"wild":5,"items":1,"offers":3,"heal":{"weight":1,"percent":30},"revive":{"weight":1},"boost":{"weight":1,"amount":10},"die":{"weight":1,"maxDice":8},"item":{"weight":1,"items":[{"key":"hyper-potion","weight":40},{"key":"revive","weight":40},{"key":"max-revive","weight":20}]},"raid":{"level":90,"upgradeLevel":10,"bars":4,"teamCap":90,"barTypes":["normal","ice","steel","dragon"]},"skin":"plates"}'::jsonb)
on conflict (id) do update set order_index = excluded.order_index, region_id = excluded.region_id, name = excluded.name, banner_url = excluded.banner_url, rounds_to_clear = excluded.rounds_to_clear, min_level = excluded.min_level, max_level = excluded.max_level, encounter_weights = excluded.encounter_weights, backtrack_multiplier = excluded.backtrack_multiplier, legendary_boss = excluded.legendary_boss, scales_to_team = excluded.scales_to_team, scale_offsets = excluded.scale_offsets, easy_mode = excluded.easy_mode, enemy_upgrade_level = excluded.enemy_upgrade_level, battle_background = excluded.battle_background, hidden = excluded.hidden, unlock_conditions = excluded.unlock_conditions, gyms = excluded.gyms, mode = excluded.mode;

delete from area_wild_pool where area_id in ('0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', '86027687-5c39-5902-a7fa-9da648a00cbc', '571fc205-b861-59f3-862c-a1ea8fd135fa', '24714d59-a220-5b61-bfcc-ec569104657d', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'd7c050e7-dd23-5e09-8385-2cce834e515d', '82c065db-ab84-5f2e-ae22-0c0d01362006', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'e116c980-4cbc-5b72-bf2e-e07d1853c123', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', '4ec17080-5cb8-59c6-b862-45b620296d5d', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed') and id not in ('3410c3c4-0453-5902-8d1c-3ba69651817e', 'e5eab6a3-153d-5311-9811-542a36ca6262', '26358a76-6369-5e23-b0de-c392811a7dd2', '010c7907-e3e6-59a8-a8f6-4ff184131f1a', '626cd1e5-e277-574a-8ab7-2dff17a7ea06', '3e96def0-686d-5244-b9ca-232f06c5a346', 'f8f20859-eb78-5c36-aaee-1366e87a211b', 'c8ed9c5f-3bba-5b80-92c3-056aea029bf0', '7f9c7d46-6582-5d1d-a3e1-8867e422446a', 'a9c54ab4-90a2-5019-9a5f-7530d94c6781', '91bd9862-67b4-5f3b-8d5c-736fc3697950', 'a98fd4d4-2289-5fa9-930f-3260a879c563', 'b3100459-c4b0-5a6b-bd57-2df76f909fb5', '682b70c3-bab3-52a1-a92f-bbaf4e1ebe24', 'a727a715-3523-5bf6-a0b7-05b8ae377900', '3be33bcc-eb9d-5ec6-8045-78ca6d36495c', '14c9460b-5def-53b4-bdb5-f854d138c6d9', 'b4a3ba69-4f0c-54d7-b198-dca5e566a0b0', '8fb1c59b-c782-5dae-8985-26069e9fa83b', '0e741d0a-ad5f-5a9e-b541-00c04fb16759', '1514baa4-c6f4-53ce-9e41-67216cb49b49', 'de06b066-ac88-5cd4-8db0-bda73c134092', 'ec16caf1-e8e4-5c4e-ba61-b52d698c6a0b', '172e7d13-8cfb-5b04-8a5d-33536e3f9927', 'c471f64c-85cb-5ddf-8127-6851c06e9806', '701834cd-b162-51c9-b33d-8cdaf0fc1606', '40abd9c3-5a03-5f7e-a49c-400f092a7b2c', '03eaeaba-ec0b-5861-95a9-00a8336dac6e', '81ad985b-95c3-5ced-8319-10449b7579a3', '1cfd0ede-f28b-5840-9106-31fc4719da06', 'e9011bc2-4dfa-51de-91d7-72203aa72e0f', 'deab90cf-4d0d-5ecd-9be9-56a009718e4d', '6b680214-25a3-57c7-9e88-383c4d74a979', 'd3239f0b-6915-54e1-89df-abb3f89308aa', '8fb1c33e-f9aa-5b69-a4fd-4abf1411231c', '65e3c80b-5a6f-5c07-a03b-1e0cd707353f', '8dcd608b-ef36-5570-ada4-4bc98dad3dd0', '3c0c1e12-d72a-5cd1-9373-4742ea744e43', '29e8250c-026a-55b2-8f51-1f0ddcbda33f', '6622bcbb-2b6f-50f4-83e4-8d1b14294096', 'bc381f0a-4e3c-5dc8-96a4-7cae2c27de09', 'b16a5b7e-0f2a-5b78-b212-c90a2b42b6b8', 'e5d880bd-fa92-57ca-953c-24d9d07fe61b', 'f01296fc-010e-5e35-9885-76e193df3e26', 'e6f0d0d5-e062-503a-a494-a24a540abdcb', '3ac522aa-6fba-579b-8c94-bffd5f2a38e8', 'b0623bd8-8175-5c50-80b0-d92b97c8d421', 'd233665e-040a-5c43-9996-c32744313a31', 'bd128570-b4ff-5613-8c96-3d99fded3b84', 'ee764e2b-451b-5261-adee-fe94c3424dc3', '091d3510-4431-5833-a122-9ebb93d92bf6', 'cb5afb01-c4f5-533a-b7f8-001cc755496a', '0e4d5dc8-6a13-5c14-bb3d-6c4aa35d85d1', '5bad6037-6f41-5b7f-a0eb-1653640dc953', '357f62e3-2fa8-5215-8dcb-4aa0fc4b2959', '2fcff7f3-ac49-5c68-b9e6-631db572d581', '792bf085-7e68-5c71-8eb7-f7123c017a01', 'd56078e5-1499-5afc-b5c9-ba0c45c50598', 'dc1ea272-e753-5375-843a-76c6504cd48d', 'e0076bd9-a896-5aab-8430-4e1c7c7e9e51', 'e7066741-e3ec-52f2-9711-187dd375b3f1', '62d8bbf7-1d3f-5218-aa3c-868b223458ad', 'bf0ce98a-3aab-5426-b7bf-1fa5af3741e4', 'ff6afe9c-936c-530b-bdaa-16a09c6abb14', 'f23ee2fc-980a-569f-a3e8-baa7fadc8a4d', '1e15896f-f804-5993-a49b-11de1b1860a6', '7df68f51-7d60-537d-929d-b46c7e1d5083', '9c1dfe78-ef9b-501c-b377-ee71014acda7', '486ec965-12ee-5b4e-92d6-59f5dd138261', '2eb763c6-e7a1-5725-b840-44e57362c6b6', '81e43eb0-701d-55d3-b8e1-4f80acac8e4e', '2eb64d03-958c-50e5-818e-af12a18e9b89', '60de51bb-b52a-5d73-b4ea-a4d2e7036cd1', '3e73f0a2-1569-55cd-8361-5677282ca688', 'de59aa62-1365-520c-a3b2-b9e98567c740', 'c6b625b0-5bfb-55ff-8213-f6839a4e0366', 'c3298e90-0ad5-584f-80c8-7e19b9f7f9ae', '2cde9538-c526-5ef4-a698-7bd32fa40890', '23096252-2749-5ddf-87ec-642584be0a01', '05a2630b-1b0b-5340-a436-617148e37187', 'a9ce24bd-9dcb-56f3-b5a7-2de15078d0e5', '1749f182-ded0-5917-935d-da4261b7a52d', 'fc5fa654-dbf9-5c22-819c-87dc2f7a8443', 'd55e793f-9435-5c80-8a4f-63d4e615f537', 'bf784d3a-24dc-5dff-ac78-8314f5b9a017', '0e55f6a7-21e0-5548-91ff-6d8c35a43e9c', '1e89961e-035b-5e15-aa31-4e3698abd4a4', 'aeb2c984-5413-5bfc-935c-e35aad79e54a', '93601771-8b12-5895-82cf-ab66e2afe609', 'c98511bb-4efb-5d87-ad56-8fc948b742fd', '740217b3-9c0b-50e4-9a9e-6b7d7d48d050', '3a2769e0-9e0c-5ffe-bdcb-9d649ea78ae8', '84b1e279-7eb9-5b84-8711-753a01612e12', '1aa34283-aacd-5a2b-9f72-e301023a0507', 'eca959cf-5799-597e-be65-77c7444111a0', '761da941-7a44-5c61-a5c7-ac1aca20c58c', 'b6847dc9-57b3-5525-97fd-8c45ea602285', '65919e04-796d-5aa2-a7a6-006539421dfb', '940bde0d-c43d-5aa9-8c28-b5ed2bd2f35a', 'f2964ddd-71da-5419-9cb3-f93cfd793dd1', 'c9d6ef68-d591-511b-8901-d805ee764d29', 'd7fe7089-bff4-5ca7-95fa-3e093baf41d5', 'b747213f-4dfc-54c7-a21e-cbba13d67977', '64365110-459d-5a49-bdc8-d94f71847182', '4619f50a-1ce7-5cd8-98ca-b66c687d3dec', '9ffe19c0-d682-5991-8897-879b599826ed', '01682657-5dd4-546f-9878-1c9e9bfff6cd', '05c2b11d-4aac-583e-bd66-7847b70f82d4', '5d26aef7-05b4-589f-bfc4-a87e720e7968', '292b6096-2be9-52dd-8637-c53712d6f919', 'e3259332-3362-5805-b93f-8c2091c7a086', '370c8ebb-8be5-5a3d-91be-c8906dc39e13', '03d912fe-5569-535b-9793-c6b50296400b', 'bab8b61f-8366-52d8-8096-4fb5dc1e99f0', '928adc3c-448d-5de5-8673-01982fe00513', 'f0c0abcd-0e73-53dd-9cc5-8f9df86d35e3', 'efad241b-2013-5241-a971-23188ab2fa07', 'df92fb90-6599-5560-8a63-10457d284c40', 'bc666cf5-83d2-5446-96cc-7da67c34169f', '967468b8-4893-5204-859c-3424dc05f852', '7097b90c-2d59-5cbe-a0fc-07323a7b73d3', '0098444d-8a38-5ea1-a57b-a855c15930c6', 'e9b1c904-7234-5b8e-9dda-19b9ad2db423', '7f6a3ed3-d5a1-53e9-858a-ee33b67dda47', 'b1dc4d1d-75a0-5c5d-bf02-8daf614abce5', '4eafa8ff-75ba-5c0b-bdf6-46670ed1977c', '132e532c-8db8-5275-844f-e9181d909744', 'd1e6918c-45a8-5667-871c-d341ab4d8198', '742c8351-9ba6-5d10-b511-b008e3be7918', '4ef4411b-7489-5835-9ec4-c6572ad417df', '71255267-5006-5867-8906-ee0e38216796', 'f1adf71c-67fa-5cb3-97f3-a7ac3d985493', 'ba887841-87fa-5493-ae91-e7bb93f9c78a', '0079fa3b-1f8a-5535-bedc-78e9d4795834', 'ab0343b7-644f-588c-bcf1-27fae09a6ad8', 'd8904ef0-61d3-584f-914b-67bca9f0c58c', 'cc783110-a374-55a5-be6e-45d2efd0213d', '6269af6e-cd98-5c7c-9bde-27f4f50c18c5', '0bc055f9-7251-5c43-bf3a-871b4ff23e87', '529c1b6c-8cf8-519f-8a93-fe7509b6ae9c', '981be0a2-0eee-5fdb-ae9b-c0014eb7c73b', '2dde5bee-b4d2-5cc4-a96b-2dfe58a3209a', '9ab6e1fc-43d2-5b1b-ba47-a9ec064417e9', 'a171fe90-24b0-5ee4-b10b-a3daefeb147f', '9f2197a6-643d-5387-ab3d-af608c319abd', '825d2113-366f-5240-90de-15a2c49bd4a6', '4fbf17ad-cc94-5c44-bb62-0159f02c56bf', '53f9c6b4-5186-5727-ab51-309fbb5abfde', 'c6755f9c-d732-5bb1-955f-831bb2253936', 'bf77369c-71a0-53b1-9743-85be7ff20a87', '55cf91c6-f2c4-5558-81e8-610f2017e2aa', 'fb76fc8b-d930-59c5-ad82-044a6e657c95', '34bd92d4-af78-51db-a405-55ad55378fd2', '2e13783a-8bf6-5314-83a8-a9537acaf032', '15997575-dfea-5c28-b300-0dfdd06833b8', '76a2cea7-3d8a-5a6a-bd03-f1b6b351b26e', 'f9ef1823-ee81-5006-aae8-8e914c685787', '438693ea-019b-514a-af56-d3dd975a3848', '81137acb-f096-5961-aa4a-d9b0879e63b3', '0f909d9c-10cd-533e-a439-48b75bd32171', 'a28f5792-cccc-5779-89d0-49c4ae4dd62a', 'fb80a5bd-3f29-54e0-bbc2-a8e74d73efc8', 'aff61a2c-d870-55dd-a8c0-90a07a16be93', '22eedd82-9221-5cb0-9739-e0690fcb2910', '05d7c91c-f22e-5b7e-98c4-e9845b1c4658', '99c52f0f-71f0-5d2a-ab5c-23a62315b76d', 'c8ff8907-5ade-5387-be94-978cf1c6a44d', '018163f9-24d5-5884-902a-17733f6c7be1', '63fc6b8a-7be6-5f3d-8040-d2c02089fb4b', '3a925caa-f5ec-5d83-8850-74a0774b491f', '57faee99-1152-56ae-abce-f04bddda4008', '14a02a56-d8e1-583c-916e-b532e67cd828', 'a59178f7-1c51-561f-9ec0-bf18d1255779', '3a3ff23c-7b60-5f50-b620-2a4fde67d42e', '7823a8a3-4b89-528d-b974-80b0bb3bed5a');
delete from area_trainer_pool where area_id in ('0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', '86027687-5c39-5902-a7fa-9da648a00cbc', '571fc205-b861-59f3-862c-a1ea8fd135fa', '24714d59-a220-5b61-bfcc-ec569104657d', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'd7c050e7-dd23-5e09-8385-2cce834e515d', '82c065db-ab84-5f2e-ae22-0c0d01362006', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'e116c980-4cbc-5b72-bf2e-e07d1853c123', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', '4ec17080-5cb8-59c6-b862-45b620296d5d', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed') and id not in ('dbf4dd2a-560b-5fc6-b891-ed83040d0734', 'd3483614-35c1-54b3-a95d-771e650b20d0', '24ea72f1-3b8e-5199-871b-373e8608b1f5', '3b94a898-2bae-5ac8-bbc5-2f966be36bce', '550d3715-f651-5a7e-801a-70915e94929c', '396a18d1-935c-58ac-a7ad-7cd29125e71b', 'eba42071-9748-542b-9632-fda128c312ee', '32ed4e44-90c0-5bb1-9666-6174655f8c29', '2e094a3b-16b1-5a47-87b1-e8b1a96391c7', 'c82df525-a800-5efc-9ab6-ccd493acf95f', 'e8fbbca2-c920-58aa-9c4b-97f86b2d3790', '3520cae3-4de5-5c58-9ef6-f3e978bc69b6', '91198774-62a2-5fa0-abd8-9cfafe7d2e0a', '120c0858-cf22-51e4-a0f1-4126e7a89953', '4953ad44-ea2c-5797-ba11-2a5d34f54ac5', '656098fe-f913-5cfe-a537-5a9a47a50668', '7da99a77-11df-5d2b-ae9e-b3215d9f1cb5', 'b4e08261-912f-5293-84b0-88acbbc1f020', '3feca23b-ded9-5e1b-96fe-29913068d789', 'e24fde0a-d967-52f3-a550-22e308c53696', 'dfdf6443-9b34-5a94-8ebc-4911adac361b', 'e6783692-f37c-5433-a81d-d9a9792e7228', '56047023-320c-5ef7-a8d4-cc112cae72d5', '8350664b-338a-5f5f-84c1-4f792bc7fa96', 'ed3701fc-c169-5022-9abb-3c4dfe27b971', '14ac80b4-9ba7-5bd1-a6f4-29c7b85d8885', '67fc997c-a40c-5350-a266-cc3efa12dc27', '0111aed3-c837-54d8-8328-bfafb6336df1', 'c6d3d168-61e4-5237-bb3f-1c3f13c5071c', '98f32e7c-6a13-5bb8-8040-cde178323c0a', '8b55e1a9-e79f-58cd-9a98-aec0940a70c8', 'd29e7812-61e8-5388-a7f2-e0fd63b86ca9', '521782fd-358b-5db9-a8aa-52702c909c1b', 'c426eaac-15ff-5654-826c-8d2706b971b9', 'd2d3fdfa-f8e7-5084-b9cf-863b76d13621', '335080bc-462a-5933-9452-00aaac950bf6', '68b8f527-243e-50b0-8c9c-e8c298831f97', 'a4c02485-a7fd-534b-9e85-502e80807b4d', '2872efe3-9265-5de8-ae06-5d23f555257e', 'e9385379-7bfb-5cc0-b3d0-45e368256e68', '7f0a7931-f988-508d-9606-9fc39c10eaa2', '088c992c-e917-5164-82ae-225916080c0e', '8732f6b2-51e4-549e-8f2d-33240cb6593d', '783dde7a-72f5-55ff-9b9e-612d9d2dca69', '048ea81f-2d69-5d6f-b8d4-7da80d93cb7a', 'cc896a37-7ad0-59cf-8c95-1dc63ac7fc8f', '7180ebce-d0c4-55ec-98c6-a451c08144f5', '47589782-9532-5550-9dec-0ad537337b4f', 'ec976c69-7679-566a-86ae-7d956751b74d');
delete from area_loot_pool where area_id in ('0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', '86027687-5c39-5902-a7fa-9da648a00cbc', '571fc205-b861-59f3-862c-a1ea8fd135fa', '24714d59-a220-5b61-bfcc-ec569104657d', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'd7c050e7-dd23-5e09-8385-2cce834e515d', '82c065db-ab84-5f2e-ae22-0c0d01362006', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'e116c980-4cbc-5b72-bf2e-e07d1853c123', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', '4ec17080-5cb8-59c6-b862-45b620296d5d', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed') and id not in ('86876290-ee24-5c61-9568-59a03834d4bb', '6090aafd-f8e3-5882-9c93-a61ee0fbd110', '00308411-a1a8-5894-bf81-ea1cdd805456', '8a206eb4-65ca-58b5-a18f-c167e748759e', '6a5abf7e-b44e-5438-80ff-7e079a16b545', '12039619-1bd0-5bd1-ba9b-2758ec7084c2', '826d268b-d019-5337-8970-fd07f29c3b9c', 'fab8f28c-f729-587c-a557-d80a70dc1077', '3a31b79f-6b71-5241-a012-ff302199546d', '87da938b-c36f-5ac7-998b-2b4a54fb413a', '5b26da78-b1f1-5cb5-86e1-a8d01fcda63f', 'be834fab-4e77-51f1-86f7-68a124d5d8a5', 'c6f2a4a1-2eee-542b-934b-96239e27d8a3', 'c2a98320-a017-537e-af5d-03c78b7d4a0d', '7ae09d09-3014-5090-88c1-71d260ffd097', '9844b9ce-219d-5a81-8c99-a4529dda5148', '92cd2329-0ccd-5ff3-aaae-14380a27d8a4', '30fdabcb-4070-5f6f-8355-e40178f42807', 'a8b46665-b6c5-5fda-88e1-ffce81289465', '3ed72d7e-4b73-51fb-9e52-68a8c4f3dcef', '578e2347-b542-5778-9be6-4b30942a05bb', '3d427dd1-16f0-514e-bb99-cf3cb0de8bf4', 'db27ddb0-d310-5ca6-9c03-7ada448a8045', '63057fd7-9a59-537d-8ef5-60b38a9534a4', 'a694d2cb-f0fa-5d8d-9c3f-bc63617865f5', '04806f53-3843-5a59-af9c-35c0c05623ca', 'febd4dc8-b9fa-551a-b3b3-9dbac3f72111', 'fb41af51-d643-5967-823e-f94fcc9199b6', 'd6c15e30-31c5-571d-9807-98486b4829ce', 'cfd4e0bf-c177-5ed1-bd95-d3992c50bd83', 'a29f210a-1a35-5cbf-8a11-c0bb3f8bfa64', 'ca67280e-7c06-5e8e-8794-b222a31a92c8', 'edbd80ca-6c23-58f0-ab80-1e1f4b785c20', 'c19d7d53-710d-5c18-bdaa-8cd4e9a1990b', '2d078e19-d7e8-5c81-adef-4c545ca59d24', '7a64d70e-8fd3-54e2-94e2-9bbe06f2d9cc', '3a2e78da-78da-5562-82f7-7077d4b131fc', '1a81ba99-29fd-5bf6-b8b1-859f186fd866', '73338c31-3715-5665-bfeb-a1f7b0ca506e', '1dedc490-f4ae-5b1a-b739-e9f940b15f32', 'b47316d8-138a-5e2c-939d-81920a953e47', '1c7c4a11-ad2d-5d6e-8b11-afdd7f69d066', '0ebcf9a7-663a-56c9-b753-b12d18b1593c', 'e2e4711a-c301-5152-bca9-7b9f07205237', '99105c90-4981-524e-a4ab-fb786d4cb85c', '44cb548a-da16-5404-a818-11e9f5a26212', 'f696686b-8a9d-5105-84cd-5f5f4790d1f4', '73817fcc-8633-5b7c-b06c-1f9034dc1d07', '0e694603-7951-529f-a472-7c9116dfd611', '89a44d0c-7f09-5434-aa5e-6ebcd83950cd', '9cc5141a-9d5e-5cbf-a6f4-51885e8c4ded', 'ee31a6c4-582b-5fca-986b-04390709d8e4', '07e5d711-6f2a-58bf-8447-bba2ec1d0000', '65e19bba-40bb-5dfa-9a4a-2706a9814c24', 'cbcf2dc0-5108-56cd-b6bb-62cf047a9671', '72fc5f97-1fc2-521a-84a0-343a2c50f201', '9d52878a-ee72-5e7d-b38c-3bfda398db88', 'a9120196-1835-50e8-b999-f8a9af390251', 'e41adf4e-2dcf-5b3b-96c0-dabc649b937e', '320a1ab0-6c56-5824-a0c4-dc51e69a8db7', '031d7454-b7e8-5e07-8b8a-b661436ca859', '43a3aa09-0b94-52d6-8084-0af9eabc5427');
insert into area_wild_pool (id, area_id, dex, weight, min_level, max_level) values
  ('3410c3c4-0453-5902-8d1c-3ba69651817e', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 161, 30, 3, 5),
  ('e5eab6a3-153d-5311-9811-542a36ca6262', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 396, 18, 3, 5),
  ('26358a76-6369-5e23-b0de-c392811a7dd2', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 872, 8, 3, 5),
  ('010c7907-e3e6-59a8-a8f6-4ff184131f1a', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 163, 10, 4, 6),
  ('626cd1e5-e277-574a-8ab7-2dff17a7ea06', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 220, 6, 4, 6),
  ('3e96def0-686d-5244-b9ca-232f06c5a346', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 506, 5, 4, 6),
  ('f8f20859-eb78-5c36-aaee-1366e87a211b', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 613, 3, 4, 6),
  ('c8ed9c5f-3bba-5b80-92c3-056aea029bf0', '86027687-5c39-5902-a7fa-9da648a00cbc', 204, 25, 6, 9),
  ('7f9c7d46-6582-5d1d-a3e1-8867e422446a', '86027687-5c39-5902-a7fa-9da648a00cbc', 216, 20, 6, 9),
  ('a9c54ab4-90a2-5019-9a5f-7530d94c6781', '86027687-5c39-5902-a7fa-9da648a00cbc', 585, 20, 7, 10),
  ('91bd9862-67b4-5f3b-8d5c-736fc3697950', '86027687-5c39-5902-a7fa-9da648a00cbc', 821, 20, 6, 9),
  ('a98fd4d4-2289-5fa9-930f-3260a879c563', '86027687-5c39-5902-a7fa-9da648a00cbc', 661, 15, 6, 9),
  ('b3100459-c4b0-5a6b-bd57-2df76f909fb5', '86027687-5c39-5902-a7fa-9da648a00cbc', 459, 6, 7, 9),
  ('682b70c3-bab3-52a1-a92f-bbaf4e1ebe24', '86027687-5c39-5902-a7fa-9da648a00cbc', 41, 12, 6, 9),
  ('a727a715-3523-5bf6-a0b7-05b8ae377900', '86027687-5c39-5902-a7fa-9da648a00cbc', 179, 12, 7, 10),
  ('3be33bcc-eb9d-5ec6-8045-78ca6d36495c', '86027687-5c39-5902-a7fa-9da648a00cbc', 827, 12, 6, 9),
  ('14c9460b-5def-53b4-bdb5-f854d138c6d9', '86027687-5c39-5902-a7fa-9da648a00cbc', 397, 5, 9, 11),
  ('b4a3ba69-4f0c-54d7-b198-dca5e566a0b0', '86027687-5c39-5902-a7fa-9da648a00cbc', 613, 4, 8, 10),
  ('8fb1c59b-c782-5dae-8985-26069e9fa83b', '86027687-5c39-5902-a7fa-9da648a00cbc', 10103, 8, 7, 9),
  ('0e741d0a-ad5f-5a9e-b541-00c04fb16759', '86027687-5c39-5902-a7fa-9da648a00cbc', 234, 8, 7, 9),
  ('1514baa4-c6f4-53ce-9e41-67216cb49b49', '86027687-5c39-5902-a7fa-9da648a00cbc', 731, 4, 7, 9),
  ('de06b066-ac88-5cd4-8db0-bda73c134092', '571fc205-b861-59f3-862c-a1ea8fd135fa', 194, 20, 11, 14),
  ('ec16caf1-e8e4-5c4e-ba61-b52d698c6a0b', '571fc205-b861-59f3-862c-a1ea8fd135fa', 129, 20, 11, 14),
  ('172e7d13-8cfb-5b04-8a5d-33536e3f9927', '571fc205-b861-59f3-862c-a1ea8fd135fa', 86, 20, 11, 14),
  ('c471f64c-85cb-5ddf-8127-6851c06e9806', '571fc205-b861-59f3-862c-a1ea8fd135fa', 90, 15, 12, 15),
  ('701834cd-b162-51c9-b33d-8cdaf0fc1606', '571fc205-b861-59f3-862c-a1ea8fd135fa', 361, 15, 12, 15),
  ('40abd9c3-5a03-5f7e-a49c-400f092a7b2c', '571fc205-b861-59f3-862c-a1ea8fd135fa', 363, 10, 12, 15),
  ('03eaeaba-ec0b-5861-95a9-00a8336dac6e', '571fc205-b861-59f3-862c-a1ea8fd135fa', 170, 8, 12, 15),
  ('81ad985b-95c3-5ced-8319-10449b7579a3', '571fc205-b861-59f3-862c-a1ea8fd135fa', 349, 4, 14, 16),
  ('1cfd0ede-f28b-5840-9106-31fc4719da06', '571fc205-b861-59f3-862c-a1ea8fd135fa', 195, 4, 14, 16),
  ('e9011bc2-4dfa-51de-91d7-72203aa72e0f', '24714d59-a220-5b61-bfcc-ec569104657d', 433, 15, 15, 18),
  ('deab90cf-4d0d-5ecd-9be9-56a009718e4d', '24714d59-a220-5b61-bfcc-ec569104657d', 868, 15, 15, 18),
  ('6b680214-25a3-57c7-9e88-383c4d74a979', '24714d59-a220-5b61-bfcc-ec569104657d', 180, 15, 16, 19),
  ('d3239f0b-6915-54e1-89df-abb3f89308aa', '24714d59-a220-5b61-bfcc-ec569104657d', 831, 20, 15, 18),
  ('8fb1c33e-f9aa-5b69-a4fd-4abf1411231c', '24714d59-a220-5b61-bfcc-ec569104657d', 582, 20, 16, 19),
  ('65e3c80b-5a6f-5c07-a03b-1e0cd707353f', '24714d59-a220-5b61-bfcc-ec569104657d', 333, 15, 16, 19),
  ('8dcd608b-ef36-5570-ada4-4bc98dad3dd0', '24714d59-a220-5b61-bfcc-ec569104657d', 322, 12, 15, 18),
  ('3c0c1e12-d72a-5cd1-9373-4742ea744e43', '24714d59-a220-5b61-bfcc-ec569104657d', 427, 10, 15, 18),
  ('29e8250c-026a-55b2-8f51-1f0ddcbda33f', '24714d59-a220-5b61-bfcc-ec569104657d', 764, 8, 16, 19),
  ('6622bcbb-2b6f-50f4-83e4-8d1b14294096', '24714d59-a220-5b61-bfcc-ec569104657d', 225, 4, 18, 21),
  ('bc381f0a-4e3c-5dc8-96a4-7cae2c27de09', '24714d59-a220-5b61-bfcc-ec569104657d', 446, 5, 17, 20),
  ('b16a5b7e-0f2a-5b78-b212-c90a2b42b6b8', '24714d59-a220-5b61-bfcc-ec569104657d', 181, 3, 19, 21),
  ('e5d880bd-fa92-57ca-953c-24d9d07fe61b', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 599, 20, 20, 23),
  ('f01296fc-010e-5e35-9885-76e193df3e26', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 438, 15, 20, 23),
  ('e6f0d0d5-e062-503a-a494-a24a540abdcb', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 436, 15, 21, 24),
  ('3ac522aa-6fba-579b-8c94-bffd5f2a38e8', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 957, 15, 20, 23),
  ('b0623bd8-8175-5c50-80b0-d92b97c8d421', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 10176, 15, 21, 24),
  ('d233665e-040a-5c43-9996-c32744313a31', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 624, 10, 22, 25),
  ('bd128570-b4ff-5613-8c96-3d99fded3b84', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 958, 5, 24, 26),
  ('ee764e2b-451b-5261-adee-fe94c3424dc3', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 185, 5, 24, 26),
  ('091d3510-4431-5833-a122-9ebb93d92bf6', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 42, 15, 25, 29),
  ('cb5afb01-c4f5-533a-b7f8-001cc755496a', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 712, 20, 25, 29),
  ('0e4d5dc8-6a13-5c14-bb3d-6c4aa35d85d1', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 215, 15, 26, 30),
  ('5bad6037-6f41-5b7f-a0eb-1653640dc953', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 615, 10, 27, 31),
  ('357f62e3-2fa8-5215-8dcb-4aa0fc4b2959', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 220, 15, 25, 28),
  ('2fcff7f3-ac49-5c68-b9e6-631db572d581', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 361, 8, 27, 31),
  ('792bf085-7e68-5c71-8eb7-f7123c017a01', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 10101, 8, 26, 29),
  ('d56078e5-1499-5afc-b5c9-ba0c45c50598', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 996, 1, 25, 28),
  ('dc1ea272-e753-5375-843a-76c6504cd48d', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 171, 20, 31, 34),
  ('e0076bd9-a896-5aab-8430-4e1c7c7e9e51', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 739, 15, 32, 35),
  ('e7066741-e3ec-52f2-9711-187dd375b3f1', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 974, 15, 32, 35),
  ('62d8bbf7-1d3f-5218-aa3c-868b223458ad', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 875, 10, 33, 36),
  ('bf0ce98a-3aab-5426-b7bf-1fa5af3741e4', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 364, 10, 33, 36),
  ('ff6afe9c-936c-530b-bdaa-16a09c6abb14', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 87, 5, 35, 38),
  ('f23ee2fc-980a-569f-a3e8-baa7fadc8a4d', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 131, 3, 36, 38),
  ('1e15896f-f804-5993-a49b-11de1b1860a6', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 323, 15, 37, 41),
  ('7df68f51-7d60-537d-929d-b46c7e1d5083', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 218, 15, 37, 37),
  ('9c1dfe78-ef9b-501c-b377-ee71014acda7', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 324, 15, 38, 41),
  ('486ec965-12ee-5b4e-92d6-59f5dd138261', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 663, 15, 38, 41),
  ('2eb763c6-e7a1-5725-b840-44e57362c6b6', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 364, 10, 38, 42),
  ('81e43eb0-701d-55d3-b8e1-4f80acac8e4e', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 219, 5, 41, 43),
  ('2eb64d03-958c-50e5-818e-af12a18e9b89', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 143, 3, 41, 43),
  ('60de51bb-b52a-5d73-b4ea-a4d2e7036cd1', '82c065db-ab84-5f2e-ae22-0c0d01362006', 359, 15, 42, 46),
  ('3e73f0a2-1569-55cd-8361-5677282ca688', '82c065db-ab84-5f2e-ae22-0c0d01362006', 362, 10, 43, 47),
  ('de59aa62-1365-520c-a3b2-b9e98567c740', '82c065db-ab84-5f2e-ae22-0c0d01362006', 614, 10, 43, 47),
  ('c6b625b0-5bfb-55ff-8213-f6839a4e0366', '82c065db-ab84-5f2e-ae22-0c0d01362006', 334, 10, 44, 47),
  ('c3298e90-0ad5-584f-80c8-7e19b9f7f9ae', '82c065db-ab84-5f2e-ae22-0c0d01362006', 823, 10, 44, 47),
  ('2cde9538-c526-5ef4-a698-7bd32fa40890', '82c065db-ab84-5f2e-ae22-0c0d01362006', 583, 15, 42, 46),
  ('23096252-2749-5ddf-87ec-642584be0a01', '82c065db-ab84-5f2e-ae22-0c0d01362006', 740, 10, 43, 47),
  ('05a2630b-1b0b-5340-a436-617148e37187', '82c065db-ab84-5f2e-ae22-0c0d01362006', 745, 6, 44, 48),
  ('a9ce24bd-9dcb-56f3-b5a7-2de15078d0e5', '82c065db-ab84-5f2e-ae22-0c0d01362006', 473, 4, 47, 50),
  ('1749f182-ded0-5917-935d-da4261b7a52d', '82c065db-ab84-5f2e-ae22-0c0d01362006', 478, 4, 47, 50),
  ('fc5fa654-dbf9-5c22-819c-87dc2f7a8443', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 461, 10, 48, 52),
  ('d55e793f-9435-5c80-8a4f-63d4e615f537', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 365, 10, 50, 53),
  ('bf784d3a-24dc-5dff-ac78-8314f5b9a017', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 713, 10, 49, 53),
  ('0e55f6a7-21e0-5548-91ff-6d8c35a43e9c', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 873, 10, 48, 52),
  ('1e89961e-035b-5e15-aa31-4e3698abd4a4', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 124, 10, 48, 52),
  ('aeb2c984-5413-5bfc-935c-e35aad79e54a', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 437, 10, 49, 53),
  ('93601771-8b12-5895-82cf-ab66e2afe609', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 227, 10, 48, 52),
  ('c98511bb-4efb-5d87-ad56-8fc948b742fd', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 584, 8, 50, 54),
  ('740217b3-9c0b-50e4-9a9e-6b7d7d48d050', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 10102, 4, 52, 55),
  ('3a2769e0-9e0c-5ffe-bdcb-9d649ea78ae8', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 10104, 4, 52, 55),
  ('84b1e279-7eb9-5b84-8711-753a01612e12', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 234, 15, 24, 28),
  ('1aa34283-aacd-5a2b-9f72-e301023a0507', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 164, 20, 25, 29),
  ('eca959cf-5799-597e-be65-77c7444111a0', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 585, 20, 24, 28),
  ('761da941-7a44-5c61-a5c7-ac1aca20c58c', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 427, 15, 24, 28),
  ('b6847dc9-57b3-5525-97fd-8c45ea602285', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 828, 15, 24, 28),
  ('65919e04-796d-5aa2-a7a6-006539421dfb', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 215, 10, 25, 29),
  ('940bde0d-c43d-5aa9-8c28-b5ed2bd2f35a', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 745, 4, 27, 30),
  ('f2964ddd-71da-5419-9cb3-f93cfd793dd1', 'da1bc5c9-2661-54cb-9896-6979901a096d', 225, 15, 34, 38),
  ('c9d6ef68-d591-511b-8901-d805ee764d29', 'da1bc5c9-2661-54cb-9896-6979901a096d', 764, 10, 35, 38),
  ('d7fe7089-bff4-5ca7-95fa-3e093baf41d5', 'da1bc5c9-2661-54cb-9896-6979901a096d', 869, 10, 35, 38),
  ('b747213f-4dfc-54c7-a21e-cbba13d67977', 'da1bc5c9-2661-54cb-9896-6979901a096d', 358, 15, 34, 38),
  ('64365110-459d-5a49-bdc8-d94f71847182', 'da1bc5c9-2661-54cb-9896-6979901a096d', 334, 10, 36, 39),
  ('4619f50a-1ce7-5cd8-98ca-b66c687d3dec', 'da1bc5c9-2661-54cb-9896-6979901a096d', 459, 15, 34, 37),
  ('9ffe19c0-d682-5991-8897-879b599826ed', 'da1bc5c9-2661-54cb-9896-6979901a096d', 899, 10, 35, 38),
  ('01682657-5dd4-546f-9878-1c9e9bfff6cd', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 460, 15, 48, 52),
  ('05c2b11d-4aac-583e-bd66-7847b70f82d4', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 586, 15, 48, 52),
  ('5d26aef7-05b4-589f-bfc4-a87e720e7968', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 217, 15, 48, 52),
  ('292b6096-2be9-52dd-8637-c53712d6f919', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 437, 10, 49, 53),
  ('e3259332-3362-5805-b93f-8c2091c7a086', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 614, 15, 48, 52),
  ('370c8ebb-8be5-5a3d-91be-c8906dc39e13', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 359, 10, 49, 53),
  ('03d912fe-5569-535b-9793-c6b50296400b', '4ec17080-5cb8-59c6-b862-45b620296d5d', 663, 10, 56, 60),
  ('bab8b61f-8366-52d8-8096-4fb5dc1e99f0', '4ec17080-5cb8-59c6-b862-45b620296d5d', 323, 10, 56, 60),
  ('928adc3c-448d-5de5-8673-01982fe00513', '4ec17080-5cb8-59c6-b862-45b620296d5d', 219, 10, 56, 60),
  ('f0c0abcd-0e73-53dd-9cc5-8f9df86d35e3', '4ec17080-5cb8-59c6-b862-45b620296d5d', 460, 10, 56, 60),
  ('efad241b-2013-5241-a971-23188ab2fa07', '4ec17080-5cb8-59c6-b862-45b620296d5d', 586, 10, 56, 60),
  ('df92fb90-6599-5560-8a63-10457d284c40', '4ec17080-5cb8-59c6-b862-45b620296d5d', 359, 10, 56, 60),
  ('bc666cf5-83d2-5446-96cc-7da67c34169f', '4ec17080-5cb8-59c6-b862-45b620296d5d', 461, 10, 56, 60),
  ('967468b8-4893-5204-859c-3424dc05f852', '4ec17080-5cb8-59c6-b862-45b620296d5d', 828, 10, 56, 60),
  ('7097b90c-2d59-5cbe-a0fc-07323a7b73d3', '4ec17080-5cb8-59c6-b862-45b620296d5d', 124, 10, 56, 60),
  ('0098444d-8a38-5ea1-a57b-a855c15930c6', '4ec17080-5cb8-59c6-b862-45b620296d5d', 358, 10, 56, 60),
  ('e9b1c904-7234-5b8e-9dda-19b9ad2db423', '4ec17080-5cb8-59c6-b862-45b620296d5d', 899, 10, 56, 60),
  ('7f6a3ed3-d5a1-53e9-858a-ee33b67dda47', '4ec17080-5cb8-59c6-b862-45b620296d5d', 334, 10, 56, 60),
  ('b1dc4d1d-75a0-5c5d-bf02-8daf614abce5', '4ec17080-5cb8-59c6-b862-45b620296d5d', 998, 3, 60, 62),
  ('4eafa8ff-75ba-5c0b-bdf6-46670ed1977c', '4ec17080-5cb8-59c6-b862-45b620296d5d', 362, 10, 56, 60),
  ('132e532c-8db8-5275-844f-e9181d909744', '4ec17080-5cb8-59c6-b862-45b620296d5d', 478, 10, 56, 60),
  ('d1e6918c-45a8-5667-871c-d341ab4d8198', '4ec17080-5cb8-59c6-b862-45b620296d5d', 713, 10, 56, 60),
  ('742c8351-9ba6-5d10-b511-b008e3be7918', '4ec17080-5cb8-59c6-b862-45b620296d5d', 171, 10, 56, 60),
  ('4ef4411b-7489-5835-9ec4-c6572ad417df', '4ec17080-5cb8-59c6-b862-45b620296d5d', 181, 10, 56, 60),
  ('71255267-5006-5867-8906-ee0e38216796', '4ec17080-5cb8-59c6-b862-45b620296d5d', 473, 10, 56, 60),
  ('f1adf71c-67fa-5cb3-97f3-a7ac3d985493', '4ec17080-5cb8-59c6-b862-45b620296d5d', 195, 10, 56, 60),
  ('ba887841-87fa-5493-ae91-e7bb93f9c78a', '4ec17080-5cb8-59c6-b862-45b620296d5d', 901, 10, 56, 60),
  ('0079fa3b-1f8a-5535-bedc-78e9d4795834', '4ec17080-5cb8-59c6-b862-45b620296d5d', 131, 10, 56, 60),
  ('ab0343b7-644f-588c-bcf1-27fae09a6ad8', '4ec17080-5cb8-59c6-b862-45b620296d5d', 130, 10, 56, 60),
  ('d8904ef0-61d3-584f-914b-67bca9f0c58c', '4ec17080-5cb8-59c6-b862-45b620296d5d', 91, 10, 56, 60),
  ('cc783110-a374-55a5-be6e-45d2efd0213d', '4ec17080-5cb8-59c6-b862-45b620296d5d', 350, 10, 56, 60),
  ('6269af6e-cd98-5c7c-9bde-27f4f50c18c5', '4ec17080-5cb8-59c6-b862-45b620296d5d', 437, 10, 56, 60),
  ('0bc055f9-7251-5c43-bf3a-871b4ff23e87', '4ec17080-5cb8-59c6-b862-45b620296d5d', 601, 10, 56, 60),
  ('529c1b6c-8cf8-519f-8a93-fe7509b6ae9c', '4ec17080-5cb8-59c6-b862-45b620296d5d', 227, 10, 56, 60),
  ('981be0a2-0eee-5fdb-ae9b-c0014eb7c73b', '4ec17080-5cb8-59c6-b862-45b620296d5d', 823, 10, 56, 60),
  ('2dde5bee-b4d2-5cc4-a96b-2dfe58a3209a', '4ec17080-5cb8-59c6-b862-45b620296d5d', 10102, 10, 56, 60),
  ('9ab6e1fc-43d2-5b1b-ba47-a9ec064417e9', '4ec17080-5cb8-59c6-b862-45b620296d5d', 143, 10, 56, 60),
  ('a171fe90-24b0-5ee4-b10b-a3daefeb147f', '4ec17080-5cb8-59c6-b862-45b620296d5d', 832, 10, 56, 60),
  ('9f2197a6-643d-5387-ab3d-af608c319abd', '4ec17080-5cb8-59c6-b862-45b620296d5d', 428, 10, 56, 60),
  ('825d2113-366f-5240-90de-15a2c49bd4a6', '4ec17080-5cb8-59c6-b862-45b620296d5d', 869, 10, 56, 60),
  ('4fbf17ad-cc94-5c44-bb62-0159f02c56bf', '4ec17080-5cb8-59c6-b862-45b620296d5d', 959, 10, 56, 60),
  ('53f9c6b4-5186-5727-ab51-309fbb5abfde', '4ec17080-5cb8-59c6-b862-45b620296d5d', 185, 10, 56, 60),
  ('c6755f9c-d732-5bb1-955f-831bb2253936', '4ec17080-5cb8-59c6-b862-45b620296d5d', 745, 10, 56, 60),
  ('bf77369c-71a0-53b1-9743-85be7ff20a87', '4ec17080-5cb8-59c6-b862-45b620296d5d', 398, 10, 56, 60),
  ('55cf91c6-f2c4-5558-81e8-610f2017e2aa', '4ec17080-5cb8-59c6-b862-45b620296d5d', 169, 10, 56, 60),
  ('fb76fc8b-d930-59c5-ad82-044a6e657c95', '4ec17080-5cb8-59c6-b862-45b620296d5d', 873, 10, 56, 60),
  ('34bd92d4-af78-51db-a405-55ad55378fd2', '4ec17080-5cb8-59c6-b862-45b620296d5d', 205, 10, 56, 60),
  ('2e13783a-8bf6-5314-83a8-a9537acaf032', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 461, 15, 60, 64),
  ('15997575-dfea-5c28-b300-0dfdd06833b8', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 473, 15, 60, 64),
  ('76a2cea7-3d8a-5a6a-bd03-f1b6b351b26e', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 365, 15, 60, 64),
  ('f9ef1823-ee81-5006-aae8-8e914c685787', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 713, 15, 60, 64),
  ('438693ea-019b-514a-af56-d3dd975a3848', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 478, 15, 60, 64),
  ('81137acb-f096-5961-aa4a-d9b0879e63b3', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 362, 15, 60, 64),
  ('0f909d9c-10cd-533e-a439-48b75bd32171', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 614, 15, 60, 64),
  ('a28f5792-cccc-5779-89d0-49c4ae4dd62a', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 584, 15, 60, 64),
  ('fb80a5bd-3f29-54e0-bbc2-a8e74d73efc8', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 873, 15, 60, 64),
  ('aff61a2c-d870-55dd-a8c0-90a07a16be93', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 10104, 15, 60, 64),
  ('22eedd82-9221-5cb0-9739-e0690fcb2910', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 10102, 15, 60, 64),
  ('05d7c91c-f22e-5b7e-98c4-e9845b1c4658', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 131, 15, 60, 64),
  ('99c52f0f-71f0-5d2a-ab5c-23a62315b76d', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 225, 15, 52, 55),
  ('c8ff8907-5ade-5387-be94-978cf1c6a44d', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 875, 15, 52, 55),
  ('018163f9-24d5-5884-902a-17733f6c7be1', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 143, 15, 60, 64),
  ('63fc6b8a-7be6-5f3d-8040-d2c02089fb4b', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 219, 15, 60, 64),
  ('3a925caa-f5ec-5d83-8850-74a0774b491f', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 460, 15, 60, 64),
  ('57faee99-1152-56ae-abce-f04bddda4008', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 181, 15, 60, 64),
  ('14a02a56-d8e1-583c-916e-b532e67cd828', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 740, 15, 60, 64),
  ('a59178f7-1c51-561f-9ec0-bf18d1255779', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 169, 15, 60, 64),
  ('3a3ff23c-7b60-5f50-b620-2a4fde67d42e', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 124, 15, 60, 64),
  ('7823a8a3-4b89-528d-b974-80b0bb3bed5a', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 998, 2, 68, 70)
on conflict (id) do update set area_id = excluded.area_id, dex = excluded.dex, weight = excluded.weight, min_level = excluded.min_level, max_level = excluded.max_level;

insert into area_trainer_pool (id, area_id, trainer_id, weight) values
  ('dbf4dd2a-560b-5fc6-b891-ed83040d0734', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 'ac527b9c-151a-5e8e-b54b-d28b5fa9bc23', 10),
  ('d3483614-35c1-54b3-a95d-771e650b20d0', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', '544a5b22-135f-5b7b-b460-2e58d4cef69e', 10),
  ('24ea72f1-3b8e-5199-871b-373e8608b1f5', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 'afd9c966-2251-5ab8-a368-0c6ced310ab5', 10),
  ('3b94a898-2bae-5ac8-bbc5-2f966be36bce', '86027687-5c39-5902-a7fa-9da648a00cbc', 'cdb297cf-02dd-5fa2-a612-ef7274380123', 10),
  ('550d3715-f651-5a7e-801a-70915e94929c', '86027687-5c39-5902-a7fa-9da648a00cbc', 'e37a495d-4f42-5148-8118-147d1fc73196', 10),
  ('396a18d1-935c-58ac-a7ad-7cd29125e71b', '86027687-5c39-5902-a7fa-9da648a00cbc', '09399dac-7efe-5e96-bce4-28c3b73bb83a', 10),
  ('eba42071-9748-542b-9632-fda128c312ee', '86027687-5c39-5902-a7fa-9da648a00cbc', 'f2dc6723-cefa-5a26-bfb1-115ba7853b8c', 10),
  ('32ed4e44-90c0-5bb1-9666-6174655f8c29', '571fc205-b861-59f3-862c-a1ea8fd135fa', 'aac0d31c-592b-56d4-82f1-283afcbdc781', 10),
  ('2e094a3b-16b1-5a47-87b1-e8b1a96391c7', '571fc205-b861-59f3-862c-a1ea8fd135fa', '8ef6d7b2-8574-5b65-bdca-64d5fa6da143', 10),
  ('c82df525-a800-5efc-9ab6-ccd493acf95f', '571fc205-b861-59f3-862c-a1ea8fd135fa', '20f53cac-1fa6-5d15-abe2-67fcb01832f6', 10),
  ('e8fbbca2-c920-58aa-9c4b-97f86b2d3790', '24714d59-a220-5b61-bfcc-ec569104657d', 'cc54aeac-aeec-5d2e-8fd2-38d143e3b0d8', 10),
  ('3520cae3-4de5-5c58-9ef6-f3e978bc69b6', '24714d59-a220-5b61-bfcc-ec569104657d', 'c1fb6789-d2c6-51b5-809c-79ca7dfe9d12', 10),
  ('91198774-62a2-5fa0-abd8-9cfafe7d2e0a', '24714d59-a220-5b61-bfcc-ec569104657d', 'e45728e6-24fa-5806-ad06-a00fa6a11b49', 10),
  ('120c0858-cf22-51e4-a0f1-4126e7a89953', '24714d59-a220-5b61-bfcc-ec569104657d', '2ac04d47-276d-5514-87e3-2dfc0d0da2f8', 10),
  ('4953ad44-ea2c-5797-ba11-2a5d34f54ac5', 'e8a95d77-f972-5fb7-a784-33373bac3d37', '0c620aee-6ac3-587d-b39c-9ee514bb49d2', 10),
  ('656098fe-f913-5cfe-a537-5a9a47a50668', 'e8a95d77-f972-5fb7-a784-33373bac3d37', '3f3e66ff-6def-5cce-81ab-00539f463ef2', 10),
  ('7da99a77-11df-5d2b-ae9e-b3215d9f1cb5', 'e8a95d77-f972-5fb7-a784-33373bac3d37', '1562662f-f591-501a-a0cb-bcc02b8cdc74', 10),
  ('b4e08261-912f-5293-84b0-88acbbc1f020', 'e8a95d77-f972-5fb7-a784-33373bac3d37', '48e7056f-4344-528a-828a-92ef606207cb', 10),
  ('3feca23b-ded9-5e1b-96fe-29913068d789', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'bcf407c6-052c-50c6-a404-ef82c867c56d', 10),
  ('e24fde0a-d967-52f3-a550-22e308c53696', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'd76e6ec9-484c-5ad6-a59c-95db1d783cd6', 10),
  ('dfdf6443-9b34-5a94-8ebc-4911adac361b', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', '83d111ba-7892-5b2b-a586-e3a4aa5d8120', 10),
  ('e6783692-f37c-5433-a81d-d9a9792e7228', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'ce7f0841-96b5-5166-896e-487c22b8724b', 10),
  ('56047023-320c-5ef7-a8d4-cc112cae72d5', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'fe9e0e67-0cf2-5e53-a0f6-85d8c0a32576', 10),
  ('8350664b-338a-5f5f-84c1-4f792bc7fa96', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', '090a5f8e-c186-589b-a7e1-4aa778de7ef6', 10),
  ('ed3701fc-c169-5022-9abb-3c4dfe27b971', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'afa7ac18-82b6-5051-a605-89dfef8a1654', 10),
  ('14ac80b4-9ba7-5bd1-a6f4-29c7b85d8885', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'f86adb1f-5f89-52a5-b648-719817ae3a6f', 10),
  ('67fc997c-a40c-5350-a266-cc3efa12dc27', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', '6235c3bd-4320-5f25-a5e5-7b6835bf8825', 10),
  ('0111aed3-c837-54d8-8328-bfafb6336df1', 'd7c050e7-dd23-5e09-8385-2cce834e515d', '23de72c6-ebd3-5aec-9f84-48235bfd4f9e', 10),
  ('c6d3d168-61e4-5237-bb3f-1c3f13c5071c', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 'a2cd3e29-e29c-5000-bb14-d5cb66c888d4', 10),
  ('98f32e7c-6a13-5bb8-8040-cde178323c0a', 'd7c050e7-dd23-5e09-8385-2cce834e515d', '5fe0fb2a-1237-51da-a608-51257cb7409c', 10),
  ('8b55e1a9-e79f-58cd-9a98-aec0940a70c8', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 'e6a20c65-04ff-54dc-b5f2-2f85307d09c3', 10),
  ('d29e7812-61e8-5388-a7f2-e0fd63b86ca9', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 'ce898adb-8dc3-5ab4-bb75-396b7e8bea89', 10),
  ('521782fd-358b-5db9-a8aa-52702c909c1b', '82c065db-ab84-5f2e-ae22-0c0d01362006', 'cae9dd7d-8a80-59ca-8149-93c2512aea03', 10),
  ('c426eaac-15ff-5654-826c-8d2706b971b9', '82c065db-ab84-5f2e-ae22-0c0d01362006', 'cf9bd4dd-48be-5eb5-9e30-f639e0867aa6', 10),
  ('d2d3fdfa-f8e7-5084-b9cf-863b76d13621', '82c065db-ab84-5f2e-ae22-0c0d01362006', '04456604-8ce4-54dd-87a8-61cc88c06dd9', 10),
  ('335080bc-462a-5933-9452-00aaac950bf6', '82c065db-ab84-5f2e-ae22-0c0d01362006', '9d275c9e-6cf1-5be6-8694-bff12ead9cf0', 10),
  ('68b8f527-243e-50b0-8c9c-e8c298831f97', '82c065db-ab84-5f2e-ae22-0c0d01362006', '2f7a3150-aa25-5ca2-8c81-c8156cd713b1', 10),
  ('a4c02485-a7fd-534b-9e85-502e80807b4d', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', '0dcb5571-5c4f-5dad-8ec7-51d7f1d48f59', 10),
  ('2872efe3-9265-5de8-ae06-5d23f555257e', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', '134d43f2-8cc4-5f54-a155-15706012730c', 10),
  ('e9385379-7bfb-5cc0-b3d0-45e368256e68', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', '507a9a17-80a7-5fc2-bae3-4b4efa3174a7', 10),
  ('7f0a7931-f988-508d-9606-9fc39c10eaa2', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', '5c520761-5840-5c37-b85b-e9fec1d861c1', 10),
  ('088c992c-e917-5164-82ae-225916080c0e', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', '2415d7b1-0886-5520-9e28-61f4d1dd307d', 10),
  ('8732f6b2-51e4-549e-8f2d-33240cb6593d', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', '640b1e47-3191-5b35-bb73-5ae097202c6f', 10),
  ('783dde7a-72f5-55ff-9b9e-612d9d2dca69', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', '608ecea7-4f2e-591f-98e5-f18c98a0eef2', 10),
  ('048ea81f-2d69-5d6f-b8d4-7da80d93cb7a', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'ce85634a-9f72-5c12-851f-7668ab2e696a', 10),
  ('cc896a37-7ad0-59cf-8c95-1dc63ac7fc8f', 'da1bc5c9-2661-54cb-9896-6979901a096d', '25450dd7-2cb4-5ac1-bbdf-b60d821f39c6', 10),
  ('7180ebce-d0c4-55ec-98c6-a451c08144f5', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', '9a4989ca-ffd9-5509-bb98-2670f6c4f102', 10),
  ('47589782-9532-5550-9dec-0ad537337b4f', '4ec17080-5cb8-59c6-b862-45b620296d5d', '02c5f2a0-69ae-59a4-ae9e-40de465cf355', 10),
  ('ec976c69-7679-566a-86ae-7d956751b74d', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', '919faac6-154b-5dd8-bc0a-7416508a7b5f', 10)
on conflict (id) do update set area_id = excluded.area_id, trainer_id = excluded.trainer_id, weight = excluded.weight;

insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty) values
  ('86876290-ee24-5c61-9568-59a03834d4bb', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 'poke-ball', 3, false, 2, 3),
  ('6090aafd-f8e3-5882-9c93-a61ee0fbd110', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 'potion', 3, false, 1, 2),
  ('00308411-a1a8-5894-bf81-ea1cdd805456', '0c5da7f8-c0d1-5e2b-bcfe-b23bef7e7eed', 'money', 2, false, 30, 60),
  ('8a206eb4-65ca-58b5-a18f-c167e748759e', '86027687-5c39-5902-a7fa-9da648a00cbc', 'poke-ball', 3, false, 2, 3),
  ('6a5abf7e-b44e-5438-80ff-7e079a16b545', '86027687-5c39-5902-a7fa-9da648a00cbc', 'potion', 3, false, 1, 2),
  ('12039619-1bd0-5bd1-ba9b-2758ec7084c2', '86027687-5c39-5902-a7fa-9da648a00cbc', 'money', 2, false, 40, 80),
  ('826d268b-d019-5337-8970-fd07f29c3b9c', '571fc205-b861-59f3-862c-a1ea8fd135fa', 'poke-ball', 3, false, 2, 3),
  ('fab8f28c-f729-587c-a557-d80a70dc1077', '571fc205-b861-59f3-862c-a1ea8fd135fa', 'great-ball', 2, false, 1, 1),
  ('3a31b79f-6b71-5241-a012-ff302199546d', '571fc205-b861-59f3-862c-a1ea8fd135fa', 'potion', 3, false, 1, 2),
  ('87da938b-c36f-5ac7-998b-2b4a54fb413a', '571fc205-b861-59f3-862c-a1ea8fd135fa', 'money', 2, false, 60, 100),
  ('5b26da78-b1f1-5cb5-86e1-a8d01fcda63f', '571fc205-b861-59f3-862c-a1ea8fd135fa', 'water-stone', 1, true, 1, 1),
  ('be834fab-4e77-51f1-86f7-68a124d5d8a5', '24714d59-a220-5b61-bfcc-ec569104657d', 'poke-ball', 3, false, 2, 3),
  ('c6f2a4a1-2eee-542b-934b-96239e27d8a3', '24714d59-a220-5b61-bfcc-ec569104657d', 'great-ball', 2, false, 1, 2),
  ('c2a98320-a017-537e-af5d-03c78b7d4a0d', '24714d59-a220-5b61-bfcc-ec569104657d', 'super-potion', 3, false, 1, 2),
  ('7ae09d09-3014-5090-88c1-71d260ffd097', '24714d59-a220-5b61-bfcc-ec569104657d', 'money', 2, false, 80, 140),
  ('9844b9ce-219d-5a81-8c99-a4529dda5148', '24714d59-a220-5b61-bfcc-ec569104657d', 'ice-stone', 1, true, 1, 1),
  ('92cd2329-0ccd-5ff3-aaae-14380a27d8a4', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'poke-ball', 3, false, 2, 3),
  ('30fdabcb-4070-5f6f-8355-e40178f42807', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'great-ball', 2, false, 1, 2),
  ('a8b46665-b6c5-5fda-88e1-ffce81289465', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'super-potion', 3, false, 1, 2),
  ('3ed72d7e-4b73-51fb-9e52-68a8c4f3dcef', 'e8a95d77-f972-5fb7-a784-33373bac3d37', 'money', 2, false, 100, 180),
  ('578e2347-b542-5778-9be6-4b30942a05bb', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'poke-ball', 3, false, 2, 3),
  ('3d427dd1-16f0-514e-bb99-cf3cb0de8bf4', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'great-ball', 2, false, 1, 2),
  ('db27ddb0-d310-5ca6-9c03-7ada448a8045', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'super-potion', 3, false, 1, 2),
  ('63057fd7-9a59-537d-8ef5-60b38a9534a4', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'money', 2, false, 120, 200),
  ('a694d2cb-f0fa-5d8d-9c3f-bc63617865f5', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'dawn-stone', 1, true, 1, 1),
  ('04806f53-3843-5a59-af9c-35c0c05623ca', 'e5561682-98aa-5c19-b8a4-32acdc30c64e', 'razor-claw', 1, true, 1, 1),
  ('febd4dc8-b9fa-551a-b3b3-9dbac3f72111', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'great-ball', 3, false, 1, 3),
  ('fb41af51-d643-5967-823e-f94fcc9199b6', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'hyper-potion', 2, false, 1, 1),
  ('d6c15e30-31c5-571d-9807-98486b4829ce', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'super-potion', 3, false, 1, 2),
  ('cfd4e0bf-c177-5ed1-bd95-d3992c50bd83', '93acfeb0-0e5b-592c-a50b-8c817cd51c71', 'money', 2, false, 160, 260),
  ('a29f210a-1a35-5cbf-8a11-c0bb3f8bfa64', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 'ultra-ball', 3, false, 1, 2),
  ('ca67280e-7c06-5e8e-8794-b222a31a92c8', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 'hyper-potion', 2, false, 1, 1),
  ('edbd80ca-6c23-58f0-ab80-1e1f4b785c20', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 'money', 2, false, 200, 320),
  ('c19d7d53-710d-5c18-bdaa-8cd4e9a1990b', 'd7c050e7-dd23-5e09-8385-2cce834e515d', 'peat-block', 1, true, 1, 1),
  ('2d078e19-d7e8-5c81-adef-4c545ca59d24', '82c065db-ab84-5f2e-ae22-0c0d01362006', 'ultra-ball', 3, false, 1, 2),
  ('7a64d70e-8fd3-54e2-94e2-9bbe06f2d9cc', '82c065db-ab84-5f2e-ae22-0c0d01362006', 'revive', 2, false, 1, 1),
  ('3a2e78da-78da-5562-82f7-7077d4b131fc', '82c065db-ab84-5f2e-ae22-0c0d01362006', 'money', 2, false, 240, 380),
  ('1a81ba99-29fd-5bf6-b8b1-859f186fd866', '82c065db-ab84-5f2e-ae22-0c0d01362006', 'rare-candy', 1, false, 1, 1),
  ('73338c31-3715-5665-bfeb-a1f7b0ca506e', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'great-ball', 2, false, 2, 3),
  ('1dedc490-f4ae-5b1a-b739-e9f940b15f32', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'ultra-ball', 3, false, 1, 2),
  ('b47316d8-138a-5e2c-939d-81920a953e47', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'hyper-potion', 2, false, 1, 2),
  ('1c7c4a11-ad2d-5d6e-8b11-afdd7f69d066', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'revive', 2, false, 1, 1),
  ('0ebcf9a7-663a-56c9-b753-b12d18b1593c', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'money', 2, false, 260, 420),
  ('e2e4711a-c301-5152-bca9-7b9f07205237', '8e6d4d5b-bf5c-537b-85ac-cb13eccda2bc', 'rare-candy', 1, false, 1, 1),
  ('99105c90-4981-524e-a4ab-fb786d4cb85c', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 'great-ball', 3, false, 1, 2),
  ('44cb548a-da16-5404-a818-11e9f5a26212', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 'super-potion', 2, false, 1, 2),
  ('f696686b-8a9d-5105-84cd-5f5f4790d1f4', 'b1f65375-1a86-5211-ab2f-48d83db2b40f', 'money', 2, false, 120, 200),
  ('73817fcc-8633-5b7c-b06c-1f9034dc1d07', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'ultra-ball', 3, false, 1, 2),
  ('0e694603-7951-529f-a472-7c9116dfd611', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'hyper-potion', 2, false, 1, 1),
  ('89a44d0c-7f09-5434-aa5e-6ebcd83950cd', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'money', 2, false, 180, 300),
  ('9cc5141a-9d5e-5cbf-a6f4-51885e8c4ded', 'da1bc5c9-2661-54cb-9896-6979901a096d', 'rare-candy', 1, false, 1, 1),
  ('ee31a6c4-582b-5fca-986b-04390709d8e4', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 'ultra-ball', 3, false, 1, 2),
  ('07e5d711-6f2a-58bf-8447-bba2ec1d0000', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 'revive', 2, false, 1, 1),
  ('65e19bba-40bb-5dfa-9a4a-2706a9814c24', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 'money', 2, false, 260, 400),
  ('cbcf2dc0-5108-56cd-b6bb-62cf047a9671', 'd22c8323-edb5-5a4a-8004-a49d833ee24e', 'rare-candy', 1, false, 1, 1),
  ('72fc5f97-1fc2-521a-84a0-343a2c50f201', '4ec17080-5cb8-59c6-b862-45b620296d5d', 'ultra-ball', 3, false, 1, 2),
  ('9d52878a-ee72-5e7d-b38c-3bfda398db88', '4ec17080-5cb8-59c6-b862-45b620296d5d', 'revive', 2, false, 1, 1),
  ('a9120196-1835-50e8-b999-f8a9af390251', '4ec17080-5cb8-59c6-b862-45b620296d5d', 'money', 2, false, 300, 480),
  ('e41adf4e-2dcf-5b3b-96c0-dabc649b937e', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 'ultra-ball', 3, false, 2, 3),
  ('320a1ab0-6c56-5824-a0c4-dc51e69a8db7', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 'revive', 2, false, 1, 2),
  ('031d7454-b7e8-5e07-8b8a-b661436ca859', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 'money', 2, false, 360, 560),
  ('43a3aa09-0b94-52d6-8084-0af9eabc5427', 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed', 'rare-candy', 1, false, 1, 1)
on conflict (id) do update set area_id = excluded.area_id, item_key = excluded.item_key, weight = excluded.weight, unique_find = excluded.unique_find, min_qty = excluded.min_qty, max_qty = excluded.max_qty;

insert into game_config (key, value) values ('smallWorlds', '{"access":"admin","list":[]}'::jsonb) on conflict (key) do nothing;
update game_config set value = jsonb_set(
  case when jsonb_typeof(value) = 'object' then value else '{"access":"admin"}'::jsonb end,
  '{list}',
  coalesce((select jsonb_agg(w) from jsonb_array_elements(coalesce(value -> 'list', '[]'::jsonb)) w where w ->> 'id' <> 'snowglobe-valley-2026'), '[]'::jsonb)
    || jsonb_build_array('{"id":"snowglobe-valley-2026","regionId":"world-snowglobe-valley","start":"2026-12-19T12:00:00.000Z","end":"2027-01-03T12:00:00.000Z","title":{"en":"Snowglobe Valley","fr":"Vallée Boule-de-Neige","es":"Valle Bola de Nieve","de":"Schneekugeltal","it":"Valle Palla di Neve","pt":"Vale Globo de Neve","pt-BR":"Vale Globo de Neve","ja":"スノードームの谷","ko":"스노우볼 골짜기","zh-Hans":"雪景球山谷"},"banner":"snowtown","theme":{"main":"#25557f","accent":"#d8333f","ground":"#eaf3fa"},"minBadges":3,"starters":[179,506,731],"xpMultiplier":1.5,"boosters":[{"type":"ice","multiplier":1.2}],"shop":[{"key":"poke-ball","price":20,"limit":null},{"key":"great-ball","price":50,"limit":null},{"key":"ultra-ball","price":100,"limit":null},{"key":"master-ball","price":999,"limit":1},{"key":"potion","price":15,"limit":null},{"key":"super-potion","price":35,"limit":null},{"key":"hyper-potion","price":80,"limit":null},{"key":"revive","price":300,"limit":null},{"key":"ice-stone","price":200,"limit":null},{"key":"water-stone","price":200,"limit":null},{"key":"dawn-stone","price":200,"limit":null},{"key":"razor-claw","price":200,"limit":null},{"key":"peat-block","price":200,"limit":null}],"mythical":{"dex":0,"level":60,"areaId":""},"opens":{"da1bc5c9-2661-54cb-9896-6979901a096d":"2026-12-24T12:00:00.000Z","4ec17080-5cb8-59c6-b862-45b620296d5d":"2026-12-25T12:00:00.000Z","fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed":"2027-01-01T12:00:00.000Z"}}'::jsonb)
) where key = 'smallWorlds';
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0123_gift_card.sql
-- The Gift card (docs/64 §4.0): in place of an area's item card while its switch is on, a present to open or make
-- bigger, a broken one a wild Pokémon of the area; Evergreen Hill's Delibird comes out of a present of its own (§4.2).
-- The cards themselves are content (an area's `encounter_weights.gift`, Snowglobe Valley's from 0122); this adds:
-- 1. game_config `giftCard`: its switch, Off, and its numbers (left alone when there: an admin's own are kept).
-- 2. gift_card_open(): the switch as the server reads it for the caller (docs/15 §20), as trick_or_treat_open() does.
--    The game asks it before a present appears; while it says no the card is spent and nothing comes out.
-- 3. configVersion + 1, so players fetch the new row. Safe to run again.
insert into game_config (key, value) values ('giftCard', '{"access":"off","breakChances":[20,40,60,80],"helper":{"dex":225,"safer":20,"extraLevels":1},"rewards":[[[{"kind":"ball","qty":2}]],[[{"kind":"betterBall","qty":3}],[{"kind":"item","key":"super-potion","qty":2}]],[[{"kind":"item","key":"hyper-potion","qty":2}],[{"kind":"money","qty":15}]],[[{"kind":"item","key":"revive","qty":1}],[{"kind":"evolution","qty":1}]],[[{"kind":"item","key":"rare-candy","qty":3}]],[[{"kind":"item","key":"rare-candy","qty":3},{"kind":"item","key":"revive","qty":1}]]],"balls":["poke-ball","great-ball","ultra-ball"],"bossTaps":5}'::jsonb)
on conflict (key) do nothing;
-- The switch for the caller: on for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function gift_card_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'giftCard' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function gift_card_open() from public;
grant execute on function gift_card_open() to anon, authenticated;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0124_tracks_in_the_snow.sql
-- Tracks in the Snow (docs/64 §4.1): Moonlit Glade's hide and seek, an area special mode (`areas.mode`, kind
-- 'tracks', written on the area by 0122's content). Run after 0122; safe to run again.
-- 1. game_config `tracks`: the switch, Off (left alone when there).
-- 2. tracks_open(): the switch as the server reads it for the caller, as portal_run_open() (0057) and nightmare_open()
--    (0060) read theirs: on for everyone, or for the admin only. The game asks it before a signed-in player enters the
--    glade, so an old build or a hand-made call can't search it while it's off.
-- 3. configVersion + 1, so players fetch the new content.
insert into game_config (key, value) values ('tracks', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
-- An odd value is off; never null.
create or replace function tracks_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'tracks' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function tracks_open() from public;
grant execute on function tracks_open() to anon, authenticated;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0125_whiteout.sql
-- Crown Shrine's whiteout (docs/64 §4.3): weather survival in Snowglobe Valley's third secret area, three waves of
-- fixed foes in the blizzard, a bonfire after each, then shiny Abomasnow. Run after 0122; safe to run again.
--  1. Crown Shrine gets its whiteout when it has no mode yet (0122 writes it too, when generated with it; an admin's
--     own mode stays). A no-op where Snowglobe Valley isn't loaded.
--  2. game_config `whiteout`: the switch, Off (left alone when there).
--  3. whiteout_open(): the switch as the server reads it, as nightmare_open() (0060) does. The run itself lives in the
--     player's save (its waves, its bonfires, the boss caught there), so no server function acts on it yet; this is
--     the check any later one goes through.
--  4. configVersion + 1, so players fetch the new content.
alter table areas add column if not exists mode jsonb;

update areas set mode = '{"kind":"whiteout","waves":[[{"dex":362,"level":47},{"dex":437,"level":47}],[{"dex":614,"level":48},{"dex":586,"level":48},{"dex":359,"level":49}],[{"dex":365,"level":49},{"dex":740,"level":49},{"dex":171,"level":50},{"dex":901,"level":50}]],"weather":"snow","bonfirePercent":40}'::jsonb
 where id = 'd22c8323-edb5-5a4a-8004-a49d833ee24e' and mode is null;

insert into game_config (key, value) values ('whiteout', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The switch: on for everyone, or for the admin only. Never null: an odd value is off.
create or replace function whiteout_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'whiteout'), 'off') a) x
$$;

revoke all on function whiteout_open() from public, anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0126_time_race.sql
-- The race of time and space (docs/64 §4.4): Spear Pillar's time trial in Snowglobe Valley. Run after 0060 (it
-- extends 0060's raid_progress_special_locked) and after 0122 when Snowglobe Valley is on the database; safe to run
-- again. It patches only what this feature changes, over the admin's later edits:
--  1. Spear Pillar gets its race (when it has no mode yet: 0122 writes it too; without Snowglobe Valley, nothing).
--  2. game_config `timeRace`: the switch, Off (left alone when there).
--  3. The server's checks: a race area's raids take teams and close (raid_progress_set_team, raid_progress_close,
--     through raid_progress_special_locked) only once the player's cloud save says the race was won at that raid's
--     legend's gate, while the switch is on for them. The portal run's (0057) and the nightmare's (0060) checks stay.
--  4. configVersion + 1, so players fetch the new content.
alter table areas add column if not exists mode jsonb;

update areas set mode = '{"kind":"timeRace","forks":[["fire","grass"],["dark","psychic"],["dragon","ice"],["electric","ground"]],"legends":[{"type":"water","dex":484},{"type":"steel","dex":483}],"perFork":3,"seconds":720,"shard":{"chance":35,"seconds":30},"items":[{"key":"hyper-potion","qty":2,"weight":40},{"key":"revive","qty":1,"weight":35},{"key":"max-revive","qty":1,"weight":10}],"speed":1.5,"replay":{"forks":[["normal","fairy"],["rock","flying"],["bug","dragon"],["ice","dark"]],"levelBonus":4,"seconds":600},"raid":{"level":70,"upgradeLevel":8,"bars":3,"teamCap":70}}'::jsonb
where id = '4ec17080-5cb8-59c6-b862-45b620296d5d' and mode is null;

insert into game_config (key, value) values ('timeRace', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The switch, as nightmare_open reads its own: on for everyone, or for the admin only. Never null: an odd value is off.
create or replace function time_race_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'timeRace'), 'off') a) x
$$;

-- A raid key's area mode when it is a race and the switch is on for the caller (else null: the raid is as before).
create or replace function raid_progress_time_race(p_key text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select a.mode from areas a
  where a.id::text = split_part(p_key, ':', 1) and a.mode ->> 'kind' = 'timeRace' and time_race_open()
$$;

-- The caller's cloud save says the race of this raid's area was won at this raid's legend's gate: the legend's dex is
-- in its `timeRace.won` (the live block, or the parked one). Each of the area's two raids opens on its own.
create or replace function raid_progress_time_race_won(p_key text, p_realm text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  p_dex text := split_part(p_key, ':', 2);
begin
  if p_dex !~ '^[0-9]+$' then return false; end if;
  return coalesce((
    select coalesce(case when coalesce(d ->> 'region', 'kanto') = a.region_id then d -> 'areaProgress'
                         else d -> 'parked' -> a.region_id -> 'areaProgress' end
                    -> a.id::text -> 'timeRace' -> 'won', '[]'::jsonb) @> to_jsonb(p_dex::int)
    from areas a, (select s.data || '{}'::jsonb d from saves s where s.user_id = auth.uid() and s.realm = p_realm) x
    where a.id::text = split_part(p_key, ':', 1)), false);
end $$;

-- 0060's, with a race area's raids too: a special area's raid (a portal run's, a nightmare's, a race's) the caller
-- can't use yet: its mode is on for them and the cloud save doesn't say it's won (for a race: at that legend's gate).
-- False for every other raid.
create or replace function raid_progress_special_locked(p_key text, p_realm text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if raid_progress_portal(p_key) is not null then return not raid_progress_portal_won(p_key, p_realm); end if;
  if raid_progress_nightmare(p_key) is not null then return not raid_progress_nightmare_won(p_key, p_realm); end if;
  if raid_progress_time_race(p_key) is not null then return not raid_progress_time_race_won(p_key, p_realm); end if;
  return false;
end $$;

revoke all on function time_race_open() from public, anon, authenticated;
revoke all on function raid_progress_time_race(text) from public, anon, authenticated;
revoke all on function raid_progress_time_race_won(text, text) from public, anon, authenticated;
revoke all on function raid_progress_special_locked(text, text) from public, anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0127_plates_run.sql
-- The Stairway of Plates' own switch (docs/64 §4.5, the user's call of 2026-11-01): the Hall of Origin's portal run
-- (an area whose mode says `"skin": "plates"`) opens apart from Distortion World's. Run after 0057; safe to run again.
-- It patches only what this feature changes, over the admin's later edits:
--  1. game_config `platesRun`: the switch, Off (left alone when there).
--  2. plates_run_open(): the switch as the server reads it for the caller, as portal_run_open() (0057).
--  3. 0057's raid_progress_portal, the one place every raid check (raid_progress_special_locked, the team writers'
--     caps) asks whether a raid's area is a portal run on for the caller: a 'plates' area now answers to `platesRun`,
--     every other portal area still to `portalRun`.
--  4. configVersion + 1, so players fetch the new content.
alter table areas add column if not exists mode jsonb;

insert into game_config (key, value) values ('platesRun', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The switch, as portal_run_open reads its own: on for everyone, or for the admin only. Never null: an odd value is off.
create or replace function plates_run_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'platesRun'), 'off') a) x
$$;

-- 0057's, each portal area on its own switch: a raid key's area mode when it is a portal run and that run's switch is
-- on for the caller (else null: the raid is as before).
create or replace function raid_progress_portal(p_key text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select a.mode from areas a
  where a.id::text = split_part(p_key, ':', 1) and a.mode ->> 'kind' = 'portal'
    and case when a.mode ->> 'skin' = 'plates' then plates_run_open() else portal_run_open() end
$$;

revoke all on function plates_run_open() from public, anon, authenticated;
revoke all on function raid_progress_portal(text) from public, anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
