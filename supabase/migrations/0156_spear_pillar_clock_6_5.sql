-- Spear Pillar's race of time and space (docs/64 §4.4), the user's second call of 2026-11-22: 7:00 was still too long.
-- The first run now has 6:00 (360 s), the replay 5:00 (300 s); the game's defaults (DEFAULT_TIME_RACE) say the same.
-- Only where Spear Pillar plays the race (its mode); every other number of it is left as the admin has it.
-- Run after 0122 (or 0126); after 0155 or in its place; safe to run again.
begin;

update areas
set mode = jsonb_set(jsonb_set(mode, '{seconds}', '360'::jsonb), '{replay,seconds}', '300'::jsonb, true)
where id = '4ec17080-5cb8-59c6-b862-45b620296d5d' and mode ->> 'kind' = 'timeRace';

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
