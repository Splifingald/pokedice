-- Versus: every player can leave a team of three Lv.50 clones for others to fight, and fight theirs.
--
-- Players never touch these tables directly: the functions below read and write them as the owner (security definer)
-- and check everything they are given. A team is built here from the player's cloud save — never from what the page
-- sends — so it can only hold Pokémon that save really has (in any region's Box), at Lv.50 or more, cloned down to
-- Lv.50. Nobody brings their own upgrades into Versus: the game fights both sides at game_config.versusUpgradeLevel.

create table if not exists versus_teams (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Bumped whenever the team changes: a win is against one version, and a new team can be beaten again.
  version int not null default 1,
  team jsonb not null,               -- [{dex, level, shiny}] × 3, in fight order, level ≤ 50
  updated_at timestamptz not null default now()
);
-- An early draft stored each owner's upgrades with the team; Versus uses the same upgrades for everyone.
alter table versus_teams drop column if exists levels;
-- The Box ids the team was cloned from, so the team screen can show which Pokémon are in it. Only their owner sees them.
alter table versus_teams add column if not exists ids jsonb;
alter table versus_teams enable row level security;
drop policy if exists versus_teams_admin on versus_teams;
create policy versus_teams_admin on versus_teams for all using (is_admin()) with check (is_admin());

-- One row per fight, written before it plays: leaving halfway can't take a loss back.
create table if not exists versus_battles (
  id bigint generated always as identity primary key,
  attacker_id uuid not null references auth.users(id) on delete cascade,
  defender_id uuid not null references auth.users(id) on delete cascade,
  defender_version int not null,
  seed bigint not null,              -- the fight is decided by it: replaying it gives the same fight
  won boolean not null,              -- the attacker won
  created_at timestamptz not null default now()
);
create index if not exists versus_battles_attacker_idx on versus_battles (attacker_id, defender_id, defender_version);
create index if not exists versus_battles_defender_idx on versus_battles (defender_id);
-- A team can be beaten once per attacker; after a new team, again.
create unique index if not exists versus_battles_one_win on versus_battles (attacker_id, defender_id, defender_version) where won;
alter table versus_battles enable row level security;
drop policy if exists versus_battles_admin on versus_battles;
create policy versus_battles_admin on versus_battles for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------- set your team
--
-- `ids`: three Box instance ids, from any region the save holds, in fight order. Returns the team's version. Setting
-- the same team again (same clones, same order) keeps its version, so nobody who beat it gets to fight it again.
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
    insert into versus_teams (user_id, version, team, ids) values (me, 1, new_team, new_ids);
    return 1;
  end if;
  if cur.team = new_team then
    update versus_teams set ids = new_ids where user_id = me;
    return cur.version;
  end if;
  update versus_teams
     set team = new_team, ids = new_ids, version = cur.version + 1, updated_at = now()
   where user_id = me
  returning version into v;
  return v;
end
$$;

-- ---------------------------------------------------------------- the board
--
-- Every registered team (banned players left out), with its owner's name and sprite, and both scores:
-- attack_wins = teams beaten (each team version counts once); defense_wins = opponents this player's teams held off,
-- each attacker counted once per team version however many times they lost to it.
-- `beaten`: the caller has already beaten this version of the team. `ids`: the caller's own Box ids, null for others.
-- A player banned from the leaderboard is hidden from everyone else, never from themselves.
drop function if exists versus_board();
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
    left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    coalesce(s.data -> 'player' ->> 'character', 'red'),
    v.team,
    case when v.user_id = auth.uid() then v.ids end,
    v.version,
    (select count(*)::int from versus_battles b where b.attacker_id = v.user_id and b.won),
    (
      select count(*)::int from (
        select distinct b.attacker_id, b.defender_version from versus_battles b where b.defender_id = v.user_id and not b.won
      ) held
    ),
    exists (
      select 1 from versus_battles b
      where b.attacker_id = auth.uid() and b.defender_id = v.user_id and b.defender_version = v.version and b.won
    )
  from versus_teams v
  left join saves s on s.user_id = v.user_id
  where v.user_id = auth.uid() or not exists (select 1 from leaderboard_bans x where x.user_id = v.user_id)
  order by v.updated_at desc
  limit 1000
$$;

-- ---------------------------------------------------------------- record a fight
--
-- Called with the fight's result the moment it is computed, before it plays. Refused when the caller has no team,
-- attacks themselves, the defender's team changed since the page loaded it, or this team was already beaten.
create or replace function versus_record(defender uuid, defender_version int, seed bigint, won boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if defender = me then raise exception 'versus_self'; end if;
  if not exists (select 1 from versus_teams t where t.user_id = me) then raise exception 'versus_no_team'; end if;
  select t.version into v from versus_teams t where t.user_id = defender;
  if v is null then raise exception 'versus_gone'; end if;
  if v <> defender_version then raise exception 'versus_team_changed'; end if;
  if exists (
    select 1 from versus_battles b
    where b.attacker_id = me and b.defender_id = defender and b.defender_version = v and b.won
  ) then
    raise exception 'versus_already_won';
  end if;
  insert into versus_battles (attacker_id, defender_id, defender_version, seed, won)
  values (me, defender, v, seed, won);
end
$$;

revoke all on function versus_set_team(text[]) from public;
revoke all on function versus_board() from public;
revoke all on function versus_record(uuid, int, bigint, boolean) from public;
grant execute on function versus_set_team(text[]) to authenticated;
grant execute on function versus_board() to anon, authenticated;
grant execute on function versus_record(uuid, int, bigint, boolean) to authenticated;
