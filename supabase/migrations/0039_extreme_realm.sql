-- Extreme mode (docs/22-EXTREME-MODE-PLAN.md): every player can have a second save, the Extreme one, in a world of its
-- own. Each player-facing table gets a `realm` ('main' or 'extreme'), and every function that reads or writes them
-- takes `p_realm` (default 'main'), so an Extreme save only ever meets Extreme saves: its own trainer card, its own
-- leaderboard, Versus, Day Care visitors, Fortune Wheel spin, raids and raid gifts.
--
-- Friends are the same in both worlds (the user's choice, 2026-10-11): friend_codes, friendships and friend_attempts
-- have no realm. Whatever is shown of a friend comes from their save in the realm asked for; a friend without one there
-- shows with `in_realm` false (their name and look from their main card, nothing else).
--
-- Existing rows are 'main', and every `p_realm` defaults to 'main', so a tab still on an older build keeps working on
-- the main world until it reloads. Run once, after 0038; safe to run again. Until it runs, the game keeps the Extreme
-- save on the device only and syncs the main one as before.

-- ---------------------------------------------------------------- the realm column

do $$
declare
  t text;
begin
  foreach t in array array['saves', 'player_cards', 'player_card_regions', 'versus_teams', 'versus_battles', 'event_state', 'raid_teams', 'raid_gifts'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table %I add column if not exists realm text not null default %L', t, 'main');
    if not exists (select 1 from pg_constraint where conname = t || '_realm_check') then
      execute format('alter table %I add constraint %I check (realm in (%L, %L))', t, t || '_realm_check', 'main', 'extreme');
    end if;
  end loop;
end
$$;

-- Keys that were one per player become one per player and realm.
do $$
declare
  k record;
begin
  -- The cards' regions point at the cards: their link goes first, and comes back on (user_id, realm).
  alter table player_card_regions drop constraint if exists player_card_regions_user_id_fkey;
  for k in
    select * from (values
      ('saves', 'saves_pkey', 'user_id, realm'),
      ('player_cards', 'player_cards_pkey', 'user_id, realm'),
      ('player_card_regions', 'player_card_regions_pkey', 'user_id, realm, region'),
      ('versus_teams', 'versus_teams_pkey', 'user_id, realm'),
      ('event_state', 'event_state_pkey', 'user_id, realm'),
      ('raid_teams', 'raid_teams_pkey', 'user_id, realm')
    ) v(tbl, con, cols)
  loop
    continue when to_regclass('public.' || k.tbl) is null;
    -- Already keyed on the realm: nothing to do.
    continue when exists (
      select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conname = k.con and a.attname = 'realm'
    );
    execute format('alter table %I drop constraint if exists %I', k.tbl, k.con);
    execute format('alter table %I add constraint %I primary key (%s)', k.tbl, k.con, k.cols);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'player_card_regions_card_fkey') then
    alter table player_card_regions add constraint player_card_regions_card_fkey
      foreign key (user_id, realm) references player_cards (user_id, realm) on delete cascade;
  end if;
end
$$;

-- A Versus team is beaten once per attacker and version, in its own world.
do $$
begin
  if to_regclass('public.versus_battles') is not null then
    drop index if exists versus_battles_one_win;
    create unique index if not exists versus_battles_one_win_realm
      on versus_battles (realm, attacker_id, defender_id, defender_version) where won;
  end if;
end
$$;

-- ---------------------------------------------------------------- the cards

-- 0034's card, written for the save's own realm.
drop function if exists player_card_write(uuid, jsonb, timestamptz);
create or replace function player_card_write(p_user uuid, p_data jsonb, p_at timestamptz, p_realm text default 'main')
returns void
language plpgsql security definer set search_path = public as $$
declare
  live text := coalesce(nullif(p_data ->> 'region', ''), 'kanto');
  badge_ids text[];
  slots int;
begin
  select coalesce(array_agg(t.id::text), '{}') into badge_ids from trainers t where coalesce(t.badge, '') <> '';
  select coalesce((select greatest(0, (value ->> 'slots')::int) from game_config where key = 'dayCare'), 2) into slots;

  insert into player_cards as c (user_id, realm, name, avatar, region, area_id, updated_at, day_care)
  values (
    p_user,
    p_realm,
    left(coalesce(nullif(trim(p_data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    left(coalesce(p_data -> 'player' ->> 'avatar', p_data -> 'player' ->> 'character', 'red'), 40),
    live,
    p_data ->> 'currentAreaId',
    p_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'inst', left(r -> 'inst' ->> 'id', 64),
        'dex', (r -> 'inst' ->> 'dex')::int,
        'level', (r -> 'inst' ->> 'level')::int,
        'xp', coalesce((r -> 'inst' ->> 'xp')::numeric, 0),
        'since', coalesce((r ->> 'since')::numeric, 0),
        'shiny', coalesce((r -> 'inst' ->> 'shiny')::boolean, false)
      ) order by ord)
      from (
        select r, ord
        from jsonb_array_elements(coalesce(p_data -> 'dayCare' -> 'residents', '[]')) with ordinality d(r, ord)
        order by coalesce((r ->> 'since')::numeric, 0), ord
        limit slots
      ) oldest
    ), '[]')
  )
  on conflict (user_id, realm) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    region = excluded.region,
    area_id = excluded.area_id,
    updated_at = excluded.updated_at,
    day_care = excluded.day_care;

  delete from player_card_regions where user_id = p_user and realm = p_realm;
  with dc as (
    select coalesce(nullif(r ->> 'region', ''), live) as region, r
    from jsonb_array_elements(coalesce(p_data -> 'dayCare' -> 'residents', '[]')) r
    union all
    select k.key, r
    from jsonb_each(coalesce(p_data -> 'parked', '{}')) k(key, value),
      jsonb_array_elements(coalesce(k.value -> 'dayCare' -> 'residents', '[]')) r
    where k.key <> live
  )
  insert into player_card_regions (user_id, realm, region, team, pokedex, max_level, shinies, progress, badges, endgame)
  select
    p_user,
    p_realm,
    b.region,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'dex', (m ->> 'dex')::int, 'level', (m ->> 'level')::int, 'shiny', coalesce((m ->> 'shiny')::boolean, false)
      ) order by t.ord)
      from jsonb_array_elements_text(coalesce(b.block -> 'team', '[]')) with ordinality t(id, ord)
      join jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m on m ->> 'id' = t.id
    ), '[]'),
    (select count(distinct x)::int from jsonb_array_elements(coalesce(b.block -> 'pokedex', '[]')) x),
    greatest(
      coalesce((select max((m ->> 'level')::int) from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m), 0),
      coalesce((select max((d.r -> 'inst' ->> 'level')::int) from dc d where d.region = b.region), 0)
    ),
    (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m
      where coalesce((m ->> 'shiny')::boolean, false))
    + (select count(*)::int from dc d where d.region = b.region and coalesce((d.r -> 'inst' ->> 'shiny')::boolean, false)),
    coalesce((
      select jsonb_object_agg(k, jsonb_build_object(
        'cleared', coalesce((v ->> 'cleared')::boolean, false),
        'gyms', jsonb_array_length(coalesce(v -> 'gymsDefeated', '[]'))
      ))
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v)
    ), '{}'),
    coalesce((
      select array_agg(distinct g.id order by g.id)
      from jsonb_each(coalesce(b.block -> 'areaProgress', '{}')) e(k, v),
        jsonb_array_elements_text(coalesce(v -> 'gymsDefeated', '[]')) g(id)
      where g.id = any(badge_ids)
    ), '{}'),
    coalesce((
      select (b.block -> 'areaProgress' -> rg.league_area_id::text ->> 'cleared')::boolean
      from regions rg where rg.id = b.region
    ), false)
  from (
    select live as region, p_data as block
    union all
    select k.key, k.value from jsonb_each(coalesce(p_data -> 'parked', '{}')) k(key, value) where k.key <> live
  ) b;
end
$$;
revoke all on function player_card_write(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

create or replace function saves_card()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform player_card_write(new.user_id, new.data, new.updated_at, new.realm);
  exception when others then
    raise warning 'player card for %: %', new.user_id, sqlerrm;
  end;
  return null;
end
$$;

-- ---------------------------------------------------------------- friends: the same people, seen in a realm

-- The card a friend shows in a realm: theirs there, else their main one for the name and look only.
drop function if exists friend_lookup(text, text);
create or replace function friend_lookup(p_code text, p_device_id text default null, p_realm text default 'main')
returns table (name text, avatar text, region text, max_level int)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform friend_attempt(coalesce(auth.uid()::text, 'device:' || left(coalesce(p_device_id, '?'), 64)));
  return query
    select coalesce(c.name, cm.name, 'Trainer'), coalesce(c.avatar, cm.avatar, 'red'), c.region, coalesce(r.max_level, 0)
    from friend_codes f
    left join player_cards c on c.user_id = f.user_id and c.realm = p_realm
    left join player_cards cm on cm.user_id = f.user_id and cm.realm = 'main'
    left join player_card_regions r on r.user_id = f.user_id and r.realm = p_realm and r.region = c.region
    where f.code = friend_norm(p_code);
end
$$;

drop function if exists friend_add(text);
create or replace function friend_add(p_code text, p_realm text default 'main')
returns table (status text, user_id uuid, name text, avatar text)
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  other uuid;
  cap int;
begin
  if uid is null then
    raise exception 'friends_signed_out' using errcode = '42501';
  end if;
  perform friend_attempt(uid::text);
  select f.user_id into other from friend_codes f where f.code = friend_norm(p_code);
  if other is null then
    return query select 'not_found'::text, null::uuid, null::text, null::text;
    return;
  end if;
  if other = uid then
    return query select 'self'::text, null::uuid, null::text, null::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || least(uid, other)::text));
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || greatest(uid, other)::text));
  if exists (select 1 from friendships f where f.user_a = least(uid, other) and f.user_b = greatest(uid, other)) then
    status := 'already';
  else
    cap := coalesce((select (g.value #>> '{}')::int from game_config g where g.key = 'maxFriends'), 100);
    if (select count(*) from friendships f where f.user_a = uid or f.user_b = uid) >= cap then
      status := 'full';
    elsif (select count(*) from friendships f where f.user_a = other or f.user_b = other) >= cap then
      status := 'friend_full';
    else
      insert into friendships (user_a, user_b, added_by, a_seen, b_seen)
      values (least(uid, other), greatest(uid, other), uid, least(uid, other) = uid, greatest(uid, other) = uid);
      status := 'added';
    end if;
  end if;
  return query
    select status, other, coalesce(c.name, cm.name, 'Trainer'), coalesce(c.avatar, cm.avatar, 'red')
    from (select 1) one
    left join player_cards c on c.user_id = other and c.realm = p_realm
    left join player_cards cm on cm.user_id = other and cm.realm = 'main';
end
$$;

drop function if exists friend_status();
create or replace function friend_status(p_realm text default 'main')
returns table (ids uuid[], unseen jsonb)
language sql stable security definer set search_path = public as $$
  select
    coalesce(array_agg(m.id), '{}'),
    coalesce(
      jsonb_agg(jsonb_build_object('id', m.id, 'name', coalesce(c.name, cm.name, 'Trainer'), 'avatar', coalesce(c.avatar, cm.avatar, 'red')))
        filter (where not m.seen),
      '[]'
    )
  from friend_ids_of(auth.uid()) m
  left join player_cards c on c.user_id = m.id and c.realm = p_realm
  left join player_cards cm on cm.user_id = m.id and cm.realm = 'main'
$$;

-- The Friends page, in a realm. `in_realm`: the friend has a save there (else only their name and look, from main).
drop function if exists friend_list();
-- 0049 gives it a last column, which `create or replace` can't take back: a re-run (seed.sql) drops that one first.
drop function if exists friend_list(text);
create or replace function friend_list(p_realm text default 'main')
returns table (
  user_id uuid,
  name text,
  avatar text,
  region text,
  area_id text,
  max_level int,
  team jsonb,
  since timestamptz,
  updated_at timestamptz,
  is_new boolean,
  in_realm boolean
)
language sql stable security definer set search_path = public as $$
  select m.id, coalesce(c.name, cm.name, 'Trainer'), coalesce(c.avatar, cm.avatar, 'red'), c.region, c.area_id,
         coalesce(r.max_level, 0), coalesce(r.team, '[]'), m.since, c.updated_at, not m.seen, c.user_id is not null
  from friend_ids_of(auth.uid()) m
  left join player_cards c on c.user_id = m.id and c.realm = p_realm
  left join player_cards cm on cm.user_id = m.id and cm.realm = 'main'
  left join player_card_regions r on r.user_id = m.id and r.realm = p_realm and r.region = c.region
  order by (not m.seen) desc, (c.user_id is not null) desc, c.updated_at desc nulls last
$$;

drop function if exists friend_profile(uuid);
drop function if exists friend_profile(uuid, text); -- 0049's, as friend_list's above
create or replace function friend_profile(p_friend uuid, p_realm text default 'main')
returns table (
  user_id uuid,
  name text,
  avatar text,
  region text,
  area_id text,
  updated_at timestamptz,
  since timestamptz,
  regions jsonb,
  versus jsonb,
  in_realm boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  friends_since timestamptz;
  vs jsonb;
begin
  select f.created_at into friends_since
  from friendships f where f.user_a = least(uid, p_friend) and f.user_b = greatest(uid, p_friend);
  if friends_since is null then
    return;
  end if;
  if to_regclass('public.versus_teams') is not null then
    select jsonb_build_object(
      'team', v.team,
      'attackWins', (select count(*) from versus_battles b where b.realm = p_realm and b.attacker_id = v.user_id and b.won),
      'defenseWins', (
        select count(*) from (
          select distinct b.attacker_id, b.defender_version from versus_battles b
          where b.realm = p_realm and b.defender_id = v.user_id and not b.won
        ) held
      )
    ) into vs
    from versus_teams v where v.user_id = p_friend and v.realm = p_realm;
  end if;
  return query
    select p_friend, coalesce(c.name, cm.name, 'Trainer'), coalesce(c.avatar, cm.avatar, 'red'), c.region, c.area_id,
      c.updated_at, friends_since,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'region', r.region, 'team', r.team, 'pokedex', r.pokedex, 'maxLevel', r.max_level, 'shinies', r.shinies,
          'progress', r.progress, 'badges', to_jsonb(r.badges), 'endgame', r.endgame
        ))
        from player_card_regions r where r.user_id = p_friend and r.realm = p_realm
      ), '[]'),
      vs,
      c.user_id is not null
    from (select 1) one
    left join player_cards c on c.user_id = p_friend and c.realm = p_realm
    left join player_cards cm on cm.user_id = p_friend and cm.realm = 'main';
end
$$;

drop function if exists friend_day_cares();
drop function if exists friend_day_cares(text); -- 0049's, as friend_list's above
create or replace function friend_day_cares(p_realm text default 'main')
returns table (owner uuid, name text, avatar text, day_care jsonb)
language sql stable security definer set search_path = public as $$
  select c.user_id, c.name, c.avatar, c.day_care
  from friend_ids_of(auth.uid()) f
  join player_cards c on c.user_id = f.id and c.realm = p_realm
  where jsonb_array_length(c.day_care) > 0
$$;

-- ---------------------------------------------------------------- the leaderboard

drop function if exists leaderboard();
drop function if exists leaderboard(text); -- 0049's, as friend_list's above
create or replace function leaderboard(p_realm text default 'main')
returns table (
  region text,
  is_me boolean,
  name text,
  "character" text,
  team jsonb,
  pokedex int,
  max_level int,
  shinies int,
  progress jsonb,
  is_friend boolean,
  friend_id uuid,
  raids_won int
)
language sql stable security definer set search_path = public as $$
  select r.region, r.user_id = auth.uid(), c.name, c.avatar, r.team, r.pokedex, r.max_level, r.shinies, r.progress,
         m.id is not null, m.id, coalesce(e.raids_won, 0)
  from player_card_regions r
  join player_cards c on c.user_id = r.user_id and c.realm = r.realm
  left join friend_ids_of(auth.uid()) m on m.id = r.user_id
  left join event_state e on e.user_id = r.user_id and e.realm = r.realm
  where r.realm = p_realm
    and cardinality(r.badges) > 0
    and (c.updated_at > now() - interval '72 hours' or r.user_id = auth.uid())
    and not exists (select 1 from leaderboard_bans x where x.user_id = r.user_id)
  order by c.updated_at desc
  limit 3000
$$;

-- ---------------------------------------------------------------- Versus

drop function if exists versus_set_team(text[]);
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
    'level', least((m ->> 'level')::int, 50),
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

-- Versus (0018) is optional on a database that only ran seed.sql: like 0033, this one is made only when its tables are
-- there (a SQL function's tables are checked when it is created).
drop function if exists versus_board();
drop function if exists versus_board(text); -- 0049's, as friend_list's above
do $do$
begin
  if to_regclass('public.versus_teams') is null then
    return;
  end if;
  execute $ddl$
    create or replace function versus_board(p_realm text default 'main')
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
    language sql stable security definer set search_path = public as $body$
      select
        v.user_id,
        v.user_id = auth.uid(),
        coalesce(c.name, 'Trainer'),
        coalesce(c.avatar, 'red'),
        v.team,
        case when v.user_id = auth.uid() then v.ids end,
        v.version,
        (select count(*)::int from versus_battles b where b.realm = v.realm and b.attacker_id = v.user_id and b.won),
        (
          select count(*)::int from (
            select distinct b.attacker_id, b.defender_version from versus_battles b
            where b.realm = v.realm and b.defender_id = v.user_id and not b.won
          ) held
        ),
        exists (
          select 1 from versus_battles b
          where b.realm = v.realm and b.attacker_id = auth.uid() and b.defender_id = v.user_id
            and b.defender_version = v.version and b.won
        )
      from versus_teams v
      left join player_cards c on c.user_id = v.user_id and c.realm = v.realm
      where v.realm = p_realm
      order by v.updated_at desc
      limit 1000
    $body$
  $ddl$;
end
$do$;

drop function if exists versus_record(uuid, int, bigint, boolean);
create or replace function versus_record(defender uuid, defender_version int, seed bigint, won boolean, p_realm text default 'main')
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if defender = me then raise exception 'versus_self'; end if;
  if not exists (select 1 from versus_teams t where t.user_id = me and t.realm = p_realm) then raise exception 'versus_no_team'; end if;
  select t.version into v from versus_teams t where t.user_id = defender and t.realm = p_realm;
  if v is null then raise exception 'versus_gone'; end if;
  if v <> versus_record.defender_version then raise exception 'versus_team_changed'; end if;
  if exists (
    select 1 from versus_battles b
    where b.realm = p_realm and b.attacker_id = me and b.defender_id = defender and b.defender_version = v and b.won
  ) then
    raise exception 'versus_already_won';
  end if;
  insert into versus_battles (realm, attacker_id, defender_id, defender_version, seed, won)
  values (p_realm, me, defender, v, versus_record.seed, versus_record.won);
end
$$;

-- ---------------------------------------------------------------- the special events

drop function if exists wheel_spin();
create or replace function wheel_spin(p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'UTC')::date;
  prizes jsonb := wheel_prizes();
  st event_state;
  n int := jsonb_array_length(prizes);
  weights numeric[] := '{}';
  total numeric := 0;
  w numeric;
  x numeric;
  pick int;
  -- The admin's switch (0035): off (the default), on for the admin only (to try it in production), on for everyone.
  access text := coalesce((select value #>> '{wheel,access}' from game_config where key = 'events'), 'off');
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if not (access = 'all' or (access = 'admin' and is_admin())) then
    raise exception 'events_wheel_off';
  end if;
  insert into event_state (user_id, realm) values (me, p_realm) on conflict (user_id, realm) do nothing;
  select * into st from event_state es where es.user_id = me and es.realm = p_realm for update;
  if st.wheel_day = today and st.wheel_prize is not null then
    return jsonb_build_object('day', to_char(today, 'YYYY-MM-DD'), 'prize', st.wheel_prize,
      'reward', prizes -> st.wheel_prize -> 'reward', 'fresh', false);
  end if;
  for i in 0 .. n - 1 loop
    w := greatest(0, coalesce((prizes -> i ->> 'count')::numeric, 0)) * greatest(0, coalesce((prizes -> i ->> 'odds')::numeric, 0));
    weights := weights || w;
    total := total + w;
  end loop;
  if total <= 0 then raise exception 'events_wheel_empty'; end if;
  x := random() * total;
  for i in 0 .. n - 1 loop
    if weights[i + 1] > 0 then
      pick := i;
      x := x - weights[i + 1];
      exit when x < 0;
    end if;
  end loop;
  update event_state es set wheel_day = today, wheel_prize = pick, updated_at = now() where es.user_id = me and es.realm = p_realm;
  return jsonb_build_object('day', to_char(today, 'YYYY-MM-DD'), 'prize', pick, 'reward', prizes -> pick -> 'reward', 'fresh', true);
end $$;

drop function if exists raid_today(jsonb);
create or replace function raid_today(p_candidates jsonb, p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  st event_state;
  n int;
  c jsonb;
  shiny boolean;
  pick jsonb;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  insert into event_state (user_id, realm) values (me, p_realm) on conflict (user_id, realm) do nothing;
  select * into st from event_state es where es.user_id = me and es.realm = p_realm for update;
  if st.raid is not null and st.raid ->> 'day' = today then return st.raid; end if;
  n := coalesce(jsonb_array_length(p_candidates -> 'list'), 0);
  if n = 0 then raise exception 'events_no_raid'; end if;
  c := p_candidates -> 'list' -> floor(random() * n)::int;
  shiny := coalesce((c ->> 'shiny')::boolean, false)
    or (p_candidates ->> 'kind' = 'fallback' and random() < coalesce((p_candidates ->> 'fallbackShiny')::numeric, 0));
  pick := jsonb_build_object('day', today, 'dex', (c ->> 'dex')::int, 'shiny', shiny, 'areaId', c ->> 'areaId', 'caught', false);
  update event_state es set raid = pick, updated_at = now() where es.user_id = me and es.realm = p_realm;
  return pick;
end $$;

drop function if exists raid_set_team(text[]);
create or replace function raid_set_team(p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  save jsonb;
  cap int := raid_team_cap();
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
    'level', least((m ->> 'level')::int, cap),
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

drop function if exists raid_friend_teams();
drop function if exists raid_friend_teams(text); -- 0049's, as friend_list's above
create or replace function raid_friend_teams(p_realm text default 'main')
returns table (user_id uuid, name text, avatar text, team jsonb, helped int)
language sql stable security definer set search_path = public as $$
  select t.user_id,
         left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
         coalesce(s.data -> 'player' ->> 'avatar', s.data -> 'player' ->> 'character', 'red'),
         t.team,
         (select count(*)::int from raid_gifts g
           where g.realm = p_realm and g.helper_id = t.user_id and g.raider_id = auth.uid())
  from friend_ids_of(auth.uid()) f
  join raid_teams t on t.user_id = f.id and t.realm = p_realm
  left join saves s on s.user_id = t.user_id and s.realm = p_realm
  order by t.updated_at desc
$$;

drop function if exists raid_gifts_claim();
create or replace function raid_gifts_claim(p_realm text default 'main')
returns table (id bigint, raider_name text, dex int, item_key text)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'events_signed_out'; end if;
  return query
    update raid_gifts g set claimed_at = now()
    where g.helper_id = me and g.realm = p_realm and g.claimed_at is null
    returning g.id, g.raider_name, g.dex, g.item_key;
end $$;

drop function if exists raid_close(uuid[]);
create or replace function raid_close(p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  midnight timestamptz := (now() at time zone 'UTC')::date at time zone 'UTC';
  st event_state;
  cfg jsonb := (select value -> 'raid' from game_config where key = 'events');
  cap int;
  gifts jsonb;
  total numeric;
  roll numeric;
  pick text;
  g jsonb;
  helper uuid;
  raider text;
  given int := 0;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  select * into st from event_state es where es.user_id = me and es.realm = p_realm for update;
  if st.raid is null or st.raid ->> 'day' <> today then raise exception 'events_no_raid'; end if;
  if coalesce((st.raid ->> 'caught')::boolean, false) then
    return jsonb_build_object('raidsWon', st.raids_won, 'gifts', 0);
  end if;
  update event_state es
    set raid = jsonb_set(st.raid, '{caught}', 'true'), raids_won = st.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning * into st;

  cap := coalesce((cfg ->> 'helperDailyCap')::int, 5);
  gifts := coalesce(cfg -> 'gifts', '[{"key":"ultra-ball","weight":40},{"key":"hyper-potion","weight":25},{"key":"revive","weight":20},{"key":"rare-candy","weight":15}]');
  select sum(greatest(0, coalesce((x ->> 'weight')::numeric, 0))) into total from jsonb_array_elements(gifts) x;
  raider := left(coalesce(nullif(trim((select s.data -> 'player' ->> 'name' from saves s where s.user_id = me and s.realm = p_realm)), ''), 'Trainer'), 12);
  for helper in select distinct h from unnest(coalesce(p_helpers, '{}')) h loop
    continue when helper is null or helper = me or coalesce(total, 0) <= 0;
    continue when not exists (select 1 from friend_ids_of(me) f where f.id = helper);
    continue when not exists (select 1 from raid_teams t where t.user_id = helper and t.realm = p_realm);
    continue when (select count(*) from raid_gifts x where x.realm = p_realm and x.helper_id = helper and x.created_at >= midnight) >= cap;
    roll := random() * total;
    pick := null;
    for g in select * from jsonb_array_elements(gifts) loop
      roll := roll - greatest(0, coalesce((g ->> 'weight')::numeric, 0));
      if roll < 0 then
        pick := g ->> 'key';
        exit;
      end if;
    end loop;
    continue when pick is null;
    insert into raid_gifts (realm, helper_id, raider_id, raider_name, dex, item_key)
    values (p_realm, helper, me, raider, (st.raid ->> 'dex')::int, pick);
    given := given + 1;
  end loop;
  return jsonb_build_object('raidsWon', st.raids_won, 'gifts', given);
end $$;

-- ---------------------------------------------------------------- deleting

-- 0038's Delete all my data (p_realm null: everything, both saves), and Delete my Extreme save (p_realm 'extreme':
-- that world's rows only; friends, the friend ID and the main save stay).
drop function if exists delete_my_data();
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
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_attempts where actor = me::text;
  end if;
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function friend_lookup(text, text, text) from public;
revoke all on function friend_add(text, text) from public, anon;
revoke all on function friend_status(text) from public, anon;
revoke all on function friend_list(text) from public, anon;
revoke all on function friend_profile(uuid, text) from public, anon;
revoke all on function friend_day_cares(text) from public, anon;
revoke all on function leaderboard(text) from public;
revoke all on function versus_set_team(text[], text) from public;
revoke all on function versus_record(uuid, int, bigint, boolean, text) from public;
revoke all on function wheel_spin(text) from public;
revoke all on function raid_today(jsonb, text) from public;
revoke all on function raid_set_team(text[], text) from public;
revoke all on function raid_friend_teams(text) from public;
revoke all on function raid_gifts_claim(text) from public;
revoke all on function raid_close(uuid[], text) from public;
revoke all on function delete_my_data(text) from public, anon;
grant execute on function friend_lookup(text, text, text), leaderboard(text) to anon, authenticated;
do $$
begin
  if to_regprocedure('public.versus_board(text)') is not null then
    revoke all on function versus_board(text) from public;
    grant execute on function versus_board(text) to anon, authenticated;
  end if;
end
$$;
grant execute on function friend_add(text, text), friend_status(text), friend_list(text), friend_profile(uuid, text),
  friend_day_cares(text), versus_set_team(text[], text), versus_record(uuid, int, bigint, boolean, text),
  wheel_spin(text), raid_today(jsonb, text), raid_set_team(text[], text), raid_friend_teams(text),
  raid_gifts_claim(text), raid_close(uuid[], text), delete_my_data(text) to authenticated;
