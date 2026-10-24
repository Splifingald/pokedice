-- The raid overhaul (docs/40): each progression raid's own numbers, rules and last bar, and the Mega raids after Kalos.
-- 1. game_config `raidOverhaul`: its switch, Off (left alone when there). The fights themselves are the game's (the engine
--    decides every rule on the player's device); the server only needs the switch for the Mega raids' keys.
-- 2. raid_progress_dex: a progression raid's key is `areaId:dex` as before, or, with the switch on for the caller, a Mega
--    raid's `areaId:formDex`, where the form is the Mega or Primal form of that area's raid boss (the same list as the
--    game's MEGA_RAIDS, src/engine/raidSpecials.ts). So leaving a team on a Mega raid and closing it (raids won, the
--    helpers' gifts) work as for any progression raid.
-- 3. configVersion + 1, so players fetch the new content. Safe to run again.
begin;

insert into game_config (key, value) values ('raidOverhaul', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The switch: on for everyone, or for the admin only. Never null: an odd value is off.
create or replace function raid_overhaul_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'raidOverhaul'), 'off') a) x
$$;

-- The Mega raids: each form and the raid boss it is a form of.
create or replace function raid_mega_base(p_form int)
returns int
language sql immutable as $$
  select base from (values
    (10043, 150), (10044, 150), (10041, 130), (10062, 380), (10063, 381),
    (10079, 384), (10077, 382), (10078, 383), (10311, 485)
  ) m(form, base) where form = p_form
$$;

-- A raid's key, areaId:dex: its Pokémon, when that area has it as a raid boss, or its Mega raid's form (with the switch
-- on for the caller); else null, and the call is refused.
create or replace function raid_progress_dex(p_key text)
returns int
language sql stable security definer set search_path = public as $$
  select split_part(p_key, ':', 2)::int
  where p_key ~ '^[0-9a-f-]{36}:[0-9]{1,5}$'
    and exists (
      select 1 from areas a
      where a.id::text = split_part(p_key, ':', 1)
        and coalesce(a.legendary_boss, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
          'dex',
          case
            when raid_mega_base(split_part(p_key, ':', 2)::int) is not null and raid_overhaul_open()
              then raid_mega_base(split_part(p_key, ':', 2)::int)
            else split_part(p_key, ':', 2)::int
          end,
          'raid', true)))
    and (raid_mega_base(split_part(p_key, ':', 2)::int) is null or raid_overhaul_open())
$$;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
