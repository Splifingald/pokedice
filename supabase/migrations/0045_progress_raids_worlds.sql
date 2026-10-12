-- Progression raids in small worlds (docs/24, docs/21; the user, 2026-10-12): a small world's area bosses can be raids
-- too, fought from inside that world with teams from its Box. 0044's raid_progress_set_team took the Box's region from
-- the caller and only accepted plain lowercase ids, which a world's region (named in the admin) needn't be. Here the
-- region is the raid's area's, whatever the caller sends: any region or world works, and a team can only come from the
-- Box the raid belongs to. `p_region` stays in the signature so a client already out keeps working.
-- Run after 0044; safe to run again.

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
