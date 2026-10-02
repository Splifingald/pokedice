-- A cheaper Versus board (docs/11-SCALING-COST-PLAN.md §6.3).
--
-- versus_board() used to count every team's battles on every call, and read every owner's whole cloud save for two
-- fields (name, character). Both now live on the team row:
--   attack_wins   teams this player beat (each team version once), +1 in versus_record() on a win
--   defense_wins  opponents this player's teams held off (each attacker once per team version), +1 on a first loss
--   name, character   the owner's, copied from their save when it is written (trigger below) and when the team is set
-- The board reads versus_teams alone; same columns, same values, same order. Filled once from the existing battles
-- and saves. Run once. Safe to run again (the backfill recounts).

alter table versus_teams add column if not exists attack_wins int not null default 0;
alter table versus_teams add column if not exists defense_wins int not null default 0;
alter table versus_teams add column if not exists name text;
alter table versus_teams add column if not exists "character" text;

-- The owner's name and look as the board shows them, from a save.
create or replace function versus_owner_name(data jsonb) returns text
language sql immutable as $$ select left(coalesce(nullif(trim(data -> 'player' ->> 'name'), ''), 'Trainer'), 12) $$;
create or replace function versus_owner_character(data jsonb) returns text
language sql immutable as $$ select coalesce(data -> 'player' ->> 'character', 'red') $$;

-- ---------------------------------------------------------------- backfill
update versus_teams v set
  attack_wins = (select count(*)::int from versus_battles b where b.attacker_id = v.user_id and b.won),
  defense_wins = (
    select count(*)::int from (
      select distinct b.attacker_id, b.defender_version from versus_battles b where b.defender_id = v.user_id and not b.won
    ) held
  ),
  name = versus_owner_name(s.data),
  "character" = versus_owner_character(s.data)
from saves s
where s.user_id = v.user_id;
-- A team whose owner has no save any more: counts only.
update versus_teams v set
  attack_wins = (select count(*)::int from versus_battles b where b.attacker_id = v.user_id and b.won),
  defense_wins = (
    select count(*)::int from (
      select distinct b.attacker_id, b.defender_version from versus_battles b where b.defender_id = v.user_id and not b.won
    ) held
  )
where not exists (select 1 from saves s where s.user_id = v.user_id);

-- ---------------------------------------------------------------- name and look follow the save
create or replace function versus_owner_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update versus_teams t
     set name = versus_owner_name(new.data), "character" = versus_owner_character(new.data)
   where t.user_id = new.user_id
     and (t.name is distinct from versus_owner_name(new.data) or t."character" is distinct from versus_owner_character(new.data));
  return null;
end
$$;
drop trigger if exists saves_versus_owner on saves;
create trigger saves_versus_owner after insert or update of data on saves
for each row execute function versus_owner_sync();
revoke all on function versus_owner_sync() from public, anon, authenticated;

-- ---------------------------------------------------------------- set your team: as in 0018, plus name and look
create or replace function versus_set_team(ids text[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  save jsonb;
  new_team jsonb;
  -- The parameter, named in full: `ids` alone would also be the table's column.
  new_ids jsonb := to_jsonb(versus_set_team.ids);
  cur versus_teams%rowtype;
  v int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if versus_set_team.ids is null or coalesce(array_length(versus_set_team.ids, 1), 0) <> 3
     or (select count(distinct x) from unnest(versus_set_team.ids) x) <> 3 then
    raise exception 'versus_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me;
  if save is null then raise exception 'versus_no_save'; end if;

  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least((m ->> 'level')::int, 50),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) order by t.ord)
  into new_team
  from unnest(versus_set_team.ids) with ordinality t(id, ord)
  join (
    -- The Box of the region being played, and the Box of every region parked.
    select b from jsonb_array_elements(coalesce(save -> 'box', '[]')) b
    union all
    select b from jsonb_each(coalesce(save -> 'parked', '{}')) p(k, v), jsonb_array_elements(coalesce(p.v -> 'box', '[]')) b
  ) boxes(m) on m ->> 'id' = t.id
  where (m ->> 'level')::int >= 50 and m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> 3 then raise exception 'versus_not_eligible'; end if;

  select * into cur from versus_teams where user_id = me;
  if not found then
    insert into versus_teams (user_id, version, team, ids, name, "character")
    values (me, 1, new_team, new_ids, versus_owner_name(save), versus_owner_character(save));
    return 1;
  end if;
  if cur.team = new_team then
    update versus_teams set ids = new_ids, name = versus_owner_name(save), "character" = versus_owner_character(save)
     where user_id = me;
    return cur.version;
  end if;
  update versus_teams
     set team = new_team, ids = new_ids, version = cur.version + 1, updated_at = now(),
         name = versus_owner_name(save), "character" = versus_owner_character(save)
   where user_id = me
  returning version into v;
  return v;
end
$$;

-- ---------------------------------------------------------------- the board: one table, no counting
create or replace function versus_board()
returns table (
  user_id uuid,
  is_me boolean,
  name text,
  "character" text,
  team jsonb,
  ids jsonb,
  version int,
  attack_wins int,
  defense_wins int,
  beaten boolean
)
language sql stable security definer set search_path = public as $$
  select
    v.user_id,
    v.user_id = auth.uid(),
    coalesce(v.name, 'Trainer'),
    coalesce(v."character", 'red'),
    v.team,
    case when v.user_id = auth.uid() then v.ids end,
    v.version,
    v.attack_wins,
    v.defense_wins,
    exists (
      select 1 from versus_battles b
      where b.attacker_id = auth.uid() and b.defender_id = v.user_id and b.defender_version = v.version and b.won
    )
  from versus_teams v
  order by v.updated_at desc
  limit 1000
$$;

-- ---------------------------------------------------------------- record a fight: as in 0018, plus the counters
create or replace function versus_record(defender uuid, defender_version int, seed bigint, won boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v int;
  first_loss boolean;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if defender = me then raise exception 'versus_self'; end if;
  if not exists (select 1 from versus_teams t where t.user_id = me) then raise exception 'versus_no_team'; end if;
  -- Locks the defender's row: two fights recorded at once can't both count as a first loss.
  select t.version into v from versus_teams t where t.user_id = defender for update;
  if v is null then raise exception 'versus_gone'; end if;
  if v <> defender_version then raise exception 'versus_team_changed'; end if;
  if exists (
    select 1 from versus_battles b
    where b.attacker_id = me and b.defender_id = defender and b.defender_version = v and b.won
  ) then
    raise exception 'versus_already_won';
  end if;
  first_loss := not versus_record.won and not exists (
    select 1 from versus_battles b
    where b.attacker_id = me and b.defender_id = defender and b.defender_version = v and not b.won
  );
  insert into versus_battles (attacker_id, defender_id, defender_version, seed, won)
  values (me, defender, v, seed, versus_record.won);
  if versus_record.won then
    update versus_teams set attack_wins = attack_wins + 1 where user_id = me;
  elsif first_loss then
    update versus_teams set defense_wins = defense_wins + 1 where user_id = defender;
  end if;
end
$$;

revoke all on function versus_set_team(text[]) from public;
revoke all on function versus_board() from public;
revoke all on function versus_record(uuid, int, bigint, boolean) from public;
grant execute on function versus_set_team(text[]) to authenticated;
grant execute on function versus_board() to anon, authenticated;
grant execute on function versus_record(uuid, int, bigint, boolean) to authenticated;
