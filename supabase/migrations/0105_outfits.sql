-- Outfits (docs/59): Pokémon dressed up, Santa Pikachu first, given as the gift calendar's or the developer's gifts.
-- 1. game_config `outfits`: the switch, Off (left alone when there). An outfit only changes how a Pokémon looks and
--    which species it may evolve into, in the player's own save, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
begin;
insert into game_config (key, value) values ('outfits', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
