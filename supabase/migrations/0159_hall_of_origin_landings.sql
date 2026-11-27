-- The Hall of Origin's Stairway of Plates (docs/64 §4.5), the user's call of 2026-11-27: 3 Pokémon a landing, not 5;
-- its find after them (the game's own order on the Stairway, no SQL); and ₽100 (`landingGold`) the first time each
-- landing is climbed, never again after a wipe (the save keeps the landings paid).
-- Only where the Hall of Origin plays the portal run; every other number of it is left as the admin has it.
-- Run after 0122; safe to run again.
begin;

update areas
set mode = mode || '{"wild": 3, "landingGold": 100}'::jsonb
where id = 'fc6e19d5-9dd7-5ee1-a6ee-8f645d1de9ed' and mode ->> 'kind' = 'portal';

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
