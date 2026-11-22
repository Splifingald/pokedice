-- Spear Pillar's race of time and space (docs/64 §4.4), the user's call of 2026-11-22: 12:00 was far too long. The first
-- run now has 7:00 (420 s), the replay 6:00 (360 s); the game's defaults (DEFAULT_TIME_RACE) say the same.
-- Only where Spear Pillar plays the race (its mode); every other number of it is left as the admin has it.
-- Run after 0122 (or 0126); safe to run again.
begin;

update areas
set mode = jsonb_set(jsonb_set(mode, '{seconds}', '420'::jsonb), '{replay,seconds}', '360'::jsonb, true)
where id = '4ec17080-5cb8-59c6-b862-45b620296d5d' and mode ->> 'kind' = 'timeRace';

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
