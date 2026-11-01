-- Snowpoint Temple waits for the three Regis (docs/61 §1): a new unlock condition, `caught`, met once Regirock,
-- Regice and Registeel are in any region's Pokédex. It joins the Temple's three conditions (Routes 216 & 217 and
-- Snowpoint City reached, 130 caught, Lv.65); a player who has already been in keeps it open (the game's rule, not the
-- database's). Left alone when the Temple already has a `caught` condition, so an admin's edit is kept.
-- Then configVersion + 1, so players fetch the new content. Safe to run again. supabase/seed.sql carries it.
begin;
update areas
set unlock_conditions = coalesce(unlock_conditions, '[]'::jsonb) || '[{"kind":"caught","dex":[377,378,379]}]'::jsonb
where id = '10a7f721-2f52-58c4-bba1-728e2f88d763'
  and not exists (
    select 1 from jsonb_array_elements(coalesce(unlock_conditions, '[]'::jsonb)) c where c ->> 'kind' = 'caught'
  );
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
