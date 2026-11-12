-- The live events' reward Pokémon go home (docs/71 §5, the user's call of 2026-11-11): a Community Boss's Pokémon
-- reward goes to its own region, where it waits locked until one of the player's Pokémon there reaches its level, as a
-- small world's Pokémon and the Friend Market's do. The game reads it from the gift's region, `home` (src/engine/
-- gifts.ts, GIFT_HOME); items and ₽ still go to the region being played (`current`).
--
-- 1. boss_reward_gifts (0147): a Pokémon's gifts now carry the region `home`.
--
-- Run after 0147. Safe to run again. Messages already sent keep the region they were sent with.

create or replace function boss_reward_gifts(r jsonb)
returns jsonb
language sql immutable as $$
  select case r ->> 'kind'
    when 'item' then jsonb_build_array(jsonb_build_object('kind', 'item', 'key', r ->> 'key', 'qty', (r ->> 'qty')::int, 'region', 'current'))
    when 'gold' then jsonb_build_array(jsonb_build_object('kind', 'gold', 'amount', (r ->> 'amount')::int, 'region', 'current'))
    when 'pokemon' then (
      select coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object('kind', 'pokemon', 'dex', (r ->> 'dex')::int, 'level', (r ->> 'level')::int,
          'shiny', case when (r ->> 'shiny')::boolean then true end,
          'talent', case when (r ->> 'talent')::boolean then true end,
          'outfit', r ->> 'outfit', 'region', 'home'))), '[]'::jsonb)
      from generate_series(1, greatest(1, least(coalesce((r ->> 'qty')::int, 1), 6))))
    else '[]'::jsonb
  end
$$;

revoke all on function boss_reward_gifts(jsonb) from public, anon, authenticated;
