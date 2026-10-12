-- Progression raids in small worlds (docs/24, docs/21; the user, 2026-10-12): a small world's area bosses can be raids
-- too, fought from inside that world with teams from its Box. 0045's raid_progress_set_team took the Box's region from
-- the caller and only accepted plain lowercase ids, which a world's region (named in the admin) needn't be. Here the
-- region is the raid's area's, whatever the caller sends: any region or world works, and a team can only come from the
-- Box the raid belongs to. `p_region` stays in the signature so a client already out keeps working.
-- Also Delete my data for both new features: Trades (0044) and the progression raids (0045) each redefine it, and on
-- live they run in either order, so this one and Trades' each clear the other's rows too, when its tables are there.
-- Run after 0045; safe to run again.

create or replace function raid_progress_set_team(p_key text, p_region text, p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  region text := (select a.region_id from areas a where a.id::text = split_part(p_key, ':', 1));
  save jsonb;
  box jsonb;
  cap int;
  new_team jsonb;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null or region is null then raise exception 'events_bad_raid'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) not between 1 and 3
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1) then
    raise exception 'events_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'events_no_save'; end if;
  -- The Box being played is the save's top-level one (a small world's while inside it); the others are parked.
  box := case when coalesce(save ->> 'region', 'kanto') = region then save -> 'box' else save -> 'parked' -> region -> 'box' end;
  cap := raid_progress_cap(dex);
  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least((m ->> 'level')::int, cap),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) order by t.ord)
  into new_team
  from unnest(p_ids) with ordinality t(id, ord)
  join jsonb_array_elements(coalesce(box, '[]')) m on m ->> 'id' = t.id
  where m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> array_length(p_ids, 1) then raise exception 'events_not_eligible'; end if;
  insert into raid_progress_teams (user_id, realm, raid_key, region, team, ids, updated_at)
  values (me, p_realm, p_key, region, new_team, to_jsonb(p_ids), now())
  on conflict (user_id, realm, raid_key) do update
    set region = excluded.region, team = excluded.team, ids = excluded.ids, updated_at = now();
  return new_team;
end $$;

revoke all on function raid_progress_set_team(text, text, text[], text) from public;
grant execute on function raid_progress_set_team(text, text, text[], text) to authenticated;

-- 0039's delete_my_data with Trades' (0044) and the progression raids' (0045) rows.
create or replace function delete_my_data(p_realm text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if p_realm is not null and p_realm not in ('main', 'extreme') then
    raise exception 'bad_realm' using errcode = '22023';
  end if;
  delete from saves where user_id = me and (p_realm is null or realm = p_realm);
  delete from player_cards where user_id = me and (p_realm is null or realm = p_realm); -- and their regions
  delete from versus_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from versus_battles where (attacker_id = me or defender_id = me) and (p_realm is null or realm = p_realm);
  delete from event_state where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_gifts where (helper_id = me or raider_id = me) and (p_realm is null or realm = p_realm);
  delete from raid_progress_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_progress_done where user_id = me and (p_realm is null or realm = p_realm);
  -- Trades (0044), once it has run: your open listings go; trades still owed to the other player stay for them,
  -- without your name; your side counts as applied.
  if to_regclass('public.trade_listings') is not null and (p_realm is null or p_realm = 'main') then
    delete from trade_listings where owner = me and (status = 'open' or taker is null or taker_applied);
    delete from trade_listings where taker = me and owner_applied;
    update trade_listings set owner = null, owner_name = null, owner_applied = true where owner = me;
    update trade_listings set taker = null, taker_name = null, taker_applied = true where taker = me;
  end if;
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_attempts where actor = me::text;
  end if;
end
$$;

revoke all on function delete_my_data(text) from public, anon;
grant execute on function delete_my_data(text) to authenticated;
