-- Raid teams at their own levels (the user's rule, 2026-10-18): a raid's team cap holds back only a Pokémon's HP, its
-- dice and rerolls stay those of its own level. The game caps the HP in the fight (`raidSeedLevels`), so the teams
-- registered for friends keep each Pokémon's real level instead of `least(level, cap)`. Still built from the cloud
-- save, never from what the page sends. Run after 0060; safe to run again. A team registered before keeps its capped
-- levels until its owner registers it again (choosing it, or starting a raid with it).
begin;

-- 0039's, the level no longer capped.
create or replace function raid_set_team(p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  save jsonb;
  new_team jsonb;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) not between 1 and 3
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1) then
    raise exception 'events_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'events_no_save'; end if;
  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least(100, greatest(1, (m ->> 'level')::int)),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) order by t.ord)
  into new_team
  from unnest(p_ids) with ordinality t(id, ord)
  join (
    select b from jsonb_array_elements(coalesce(save -> 'box', '[]')) b
    union all
    select b from jsonb_each(coalesce(save -> 'parked', '{}')) p(k, v), jsonb_array_elements(coalesce(p.v -> 'box', '[]')) b
  ) boxes(m) on m ->> 'id' = t.id
  where m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> array_length(p_ids, 1) then raise exception 'events_not_eligible'; end if;
  insert into raid_teams (user_id, realm, team, ids, updated_at) values (me, p_realm, new_team, to_jsonb(p_ids), now())
  on conflict (user_id, realm) do update set team = excluded.team, ids = excluded.ids, updated_at = now();
  return new_team;
end $$;

-- 0060's, the level no longer capped (a portal or nightmare raid's checks kept as they are).
create or replace function raid_progress_set_team(p_key text, p_region text, p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  region text := (select a.region_id from areas a where a.id::text = split_part(p_key, ':', 1));
  save jsonb;
  box jsonb;
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
  if raid_progress_special_locked(p_key, p_realm) then raise exception 'events_raid_locked'; end if;
  -- The Box being played is the save's top-level one (a small world's while inside it); the others are parked.
  box := case when coalesce(save ->> 'region', 'kanto') = region then save -> 'box' else save -> 'parked' -> region -> 'box' end;
  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least(100, greatest(1, (m ->> 'level')::int)),
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

commit;
