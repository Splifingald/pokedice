-- Versus teams at their own levels (the user's rule, 2026-10-29), as raid teams are (0065): a Pokémon fights at Lv.50
-- (its HP, the level shown), but its dice and rerolls stay those of its own level. The game caps it in the fight
-- (`versusSeedLevels`, engine/versus.ts), so a registered team keeps each Pokémon's real level instead of
-- `least(level, 50)`. Still built from the cloud save, never from what the page sends, and still Lv.50 or more only.
-- The weekly league (0082) fights with these same teams. A team registered before keeps its Lv.50 until its owner saves
-- it again (the Versus page offers to: SAVE comes back on while a Pokémon's level differs from the saved one). The bots'
-- teams stay at Lv.50.
--
-- Run after 0039. Safe to run again. seed.sql inlines it (scripts/seed.ts).
begin;

-- 0039's, the level no longer capped.
create or replace function versus_set_team(ids text[], p_realm text default 'main')
returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  save jsonb;
  new_team jsonb;
  new_ids jsonb := to_jsonb(versus_set_team.ids);
  cur versus_teams%rowtype;
  v int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if versus_set_team.ids is null or coalesce(array_length(versus_set_team.ids, 1), 0) <> 3
     or (select count(distinct x) from unnest(versus_set_team.ids) x) <> 3 then
    raise exception 'versus_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'versus_no_save'; end if;

  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least(100, (m ->> 'level')::int),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) order by t.ord)
  into new_team
  from unnest(versus_set_team.ids) with ordinality t(id, ord)
  join (
    select b from jsonb_array_elements(coalesce(save -> 'box', '[]')) b
    union all
    select b from jsonb_each(coalesce(save -> 'parked', '{}')) p(k, v), jsonb_array_elements(coalesce(p.v -> 'box', '[]')) b
  ) boxes(m) on m ->> 'id' = t.id
  where (m ->> 'level')::int >= 50 and m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> 3 then raise exception 'versus_not_eligible'; end if;

  select * into cur from versus_teams vt where vt.user_id = me and vt.realm = p_realm;
  if not found then
    insert into versus_teams (user_id, realm, version, team, ids) values (me, p_realm, 1, new_team, new_ids);
    return 1;
  end if;
  if cur.team = new_team then
    update versus_teams vt set ids = new_ids where vt.user_id = me and vt.realm = p_realm;
    return cur.version;
  end if;
  update versus_teams vt
     set team = new_team, ids = new_ids, version = cur.version + 1, updated_at = now()
   where vt.user_id = me and vt.realm = p_realm
  returning vt.version into v;
  return v;
end
$$;

revoke all on function versus_set_team(text[], text) from public;
grant execute on function versus_set_team(text[], text) to authenticated;

commit;
