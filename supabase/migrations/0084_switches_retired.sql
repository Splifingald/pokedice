-- The admin's Config made simpler (2026-10-28): energy is gone for good, and six switches are gone with it because their
-- features now stay on for everyone: the dice throws (docs/37), the game-feel pass, haptics and battle music (docs/38),
-- the shiny Pokédex (docs/39) and the raid overhaul (docs/40). The game no longer reads any of these rows.
-- 1. game_config: the seven rows deleted (`energy`, `diceThrows`, `gameFeel`, `haptics`, `music`, `shinyDex`,
--    `raidOverhaul`).
-- 2. raid_overhaul_open(): always true, so raid_progress_dex (0076) takes a Mega raid's key from every player, as the
--    game now offers those raids to everyone.
-- 3. configVersion + 1, so players fetch the new content. Safe to run again.
begin;

delete from game_config where key in ('energy', 'diceThrows', 'gameFeel', 'haptics', 'music', 'shinyDex', 'raidOverhaul');

create or replace function raid_overhaul_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select true
$$;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
