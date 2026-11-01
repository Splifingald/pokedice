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
begin;
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
commit;
