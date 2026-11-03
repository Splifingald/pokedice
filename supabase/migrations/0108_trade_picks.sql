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
begin;

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

commit;
