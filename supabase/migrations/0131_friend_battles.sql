-- Friend Battles (docs/65-FRIEND-BATTLES-PLAN.md): two friends fight 3 v 3 live, Classic or Draft, and a 4th access
-- level for every feature, "On for beta testers".
--
-- 1. Beta testers: `beta_testers` (the admin's list), `is_beta_tester()`, `access_open(access)` (the one check a feature
--    can read: all / admin / beta), the admin's functions, and friend_status() saying whether the caller is a tester.
-- 2. game_config `friendBattles` (the switch, Off, and the timers) and friend_battles_open().
-- 3. The tables: pvp_matches (a challenge and the match it becomes), pvp_moves (each move with its seed), pvp_records
--    (each pair's head to head), pvp_here (who's in the game now). Players never touch them: the functions below are
--    `security definer` and check everything.
-- 4. The functions, each checking the switch, the friendship and one match at a time:
--    pvp_challenge, pvp_answer, pvp_cancel, pvp_pick, pvp_order, pvp_move, pvp_timeout, pvp_ping, pvp_claim,
--    pvp_finish, pvp_state, pvp_home, pvp_here, pvp_online.
-- 5. Realtime: private broadcast topics `pvp:<match>` (its two players) and `pvp-inbox:<user>` (that player), sent from
--    the functions with realtime.send.
-- 6. A Friend Battle counts as a friendship interaction (docs/60, kind 'battle').
-- 7. pg_cron every 10 minutes: challenges past their time expire, abandoned matches are void, old moves go.
--
-- The fight itself is the game's (src/engine/friendBattle.ts), played the same on both devices from the same moves.
-- The server orders the moves and answers each with its seed, derived from a secret that never leaves it: every die is
-- thrown from a number that didn't exist before the move asking for it.
--
-- Run after 0130; safe to run again.
begin;

-- ---------------------------------------------------------------- 1. beta testers

create table if not exists beta_testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);
alter table beta_testers enable row level security;
revoke all on beta_testers from anon, authenticated;
drop policy if exists beta_testers_admin on beta_testers;
create policy beta_testers_admin on beta_testers for all using ((select is_admin())) with check ((select is_admin()));

create or replace function is_beta_tester()
returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from beta_testers b where b.user_id = auth.uid())
$$;

-- A feature's switch, read for whoever called: on for everyone, for the admin, or for the admin and the testers.
create or replace function access_open(p_access text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_access, 'off') = 'all'
      or (p_access = 'admin' and is_admin())
      or (p_access = 'beta' and is_beta_tester())
$$;

-- A player as the lists show them: name, look, friend ID.
create or replace function pvp_who(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p_user,
    'name', coalesce((select c.name from player_cards c where c.user_id = p_user and c.realm = 'main'), 'Trainer'),
    'avatar', coalesce((select c.avatar from player_cards c where c.user_id = p_user and c.realm = 'main'), 'red'),
    'code', (select f.code from friend_codes f where f.user_id = p_user)
  )
$$;

create or replace function beta_testers_list()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(pvp_who(b.user_id) || jsonb_build_object('addedAt', b.added_at) order by b.added_at desc)
    from beta_testers b
  ), '[]'::jsonb);
end
$$;

-- Adds a tester by account id, friend ID (with or without its dash), exact name, or e-mail. A name two players share
-- is refused (beta_ambiguous): use the friend ID.
create or replace function beta_tester_add(p_query text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  q text := btrim(coalesce(p_query, ''));
  v_code text := upper(replace(btrim(coalesce(p_query, '')), '-', ''));
  found_id uuid;
  n int;
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if q = '' then raise exception 'beta_not_found'; end if;
  if q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into found_id from auth.users u where u.id = q::uuid;
  end if;
  if found_id is null then
    select f.user_id into found_id from friend_codes f where f.code = v_code;
  end if;
  if found_id is null then
    select count(*), min(c.user_id::text)::uuid into n, found_id
    from player_cards c where c.realm = 'main' and lower(c.name) = lower(q);
    if n > 1 then raise exception 'beta_ambiguous'; end if;
  end if;
  if found_id is null and position('@' in q) > 0 then
    -- auth.users has the e-mail on Supabase; a database without it (tests) just finds nobody.
    begin
      execute 'select id from auth.users where lower(email) = lower($1) limit 1' into found_id using q;
    exception when others then
      found_id := null;
    end;
  end if;
  if found_id is null then raise exception 'beta_not_found'; end if;
  insert into beta_testers (user_id) values (found_id) on conflict (user_id) do nothing;
  return pvp_who(found_id) || jsonb_build_object('addedAt', (select b.added_at from beta_testers b where b.user_id = found_id));
end
$$;

create or replace function beta_tester_remove(p_user uuid)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  delete from beta_testers b where b.user_id = p_user;
  return found;
end
$$;

-- friend_status (0049's) says whether the caller is a tester too, so the game knows from its first call.
drop function if exists friend_status(text);
create function friend_status(p_realm text default 'main')
returns table (ids uuid[], unseen jsonb, beta boolean)
language sql stable security definer set search_path = public as $$
  select
    coalesce(array_agg(m.id), '{}'),
    coalesce(
      jsonb_agg(jsonb_build_object('id', m.id, 'name', coalesce(c.name, cm.name, 'Trainer'), 'avatar', coalesce(c.avatar, cm.avatar, 'red'),
                                   'rich', player_rich(m.id)))
        filter (where not m.seen),
      '[]'
    ),
    exists (select 1 from beta_testers b where b.user_id = auth.uid())
  from friend_ids_of(auth.uid()) m
  left join player_cards c on c.user_id = m.id and c.realm = p_realm
  left join player_cards cm on cm.user_id = m.id and cm.realm = 'main'
$$;

-- ---------------------------------------------------------------- 2. the switch and the numbers

insert into game_config (key, value) values ('friendBattles', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The engine's FRIEND_BATTLES_DEFAULTS (src/engine/friendBattle.ts), every time in seconds.
create or replace function friend_battles_defaults()
returns jsonb
language sql immutable as $$
  select '{
    "access": "off", "expiry": 120, "pick": 30, "order": 20, "turn": 45, "grace": 90, "shield": 50,
    "classic": true, "draft": true
  }'::jsonb
$$;

create or replace function friend_battles_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select friend_battles_defaults()
  || coalesce((select value from game_config where key = 'friendBattles' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

create or replace function friend_battles_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select access_open(friend_battles_cfg() ->> 'access')
$$;

create or replace function pvp_secs(p_key text)
returns interval
language sql stable security definer set search_path = public as $$
  select make_interval(secs => greatest(5, least(3600, coalesce((friend_battles_cfg() ->> p_key)::float8, 30))))
$$;

-- ---------------------------------------------------------------- 3. the tables

create table if not exists pvp_matches (
  id bigint generated always as identity primary key,
  a uuid not null references auth.users(id) on delete cascade,      -- the challenger
  b uuid not null references auth.users(id) on delete cascade,      -- the friend challenged
  mode text not null check (mode in ('classic', 'draft')),
  state text not null default 'invited'
    check (state in ('invited', 'declined', 'expired', 'cancelled', 'draft', 'order', 'battle', 'done', 'void')),
  -- Never returned: each move's seed is derived from it (pvp_seed).
  secret text not null default md5(random()::text || clock_timestamp()::text || random()::text),
  first_picker text check (first_picker in ('a', 'b')),             -- the draft's coin; also the Bonus Shield
  cand_a jsonb,                                                     -- what each may draft, read from their save
  cand_b jsonb,
  picks jsonb not null default '[]',                                -- [{side, dex, level, shiny, talent}] in order
  team_a jsonb,                                                     -- [{dex, level, shiny, talent}] in fight order
  team_b jsonb,
  ready_a boolean not null default false,
  ready_b boolean not null default false,
  seq int not null default 0,
  deadline timestamptz,
  seen_a timestamptz,
  seen_b timestamptz,
  winner text check (winner in ('a', 'b', 'draw')),
  reason text,
  claims jsonb not null default '{}',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  check (a <> b)
);
create index if not exists pvp_matches_a on pvp_matches (a, state);
create index if not exists pvp_matches_b on pvp_matches (b, state);

create table if not exists pvp_moves (
  match_id bigint not null references pvp_matches(id) on delete cascade,
  seq int not null,
  side text not null check (side in ('a', 'b')),
  move jsonb not null,
  seed int not null,
  at timestamptz not null default now(),
  primary key (match_id, seq)
);

create table if not exists pvp_records (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  wins_a int not null default 0,
  wins_b int not null default 0,
  draws int not null default 0,
  last_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists pvp_here (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);

alter table pvp_matches enable row level security;
alter table pvp_moves enable row level security;
alter table pvp_records enable row level security;
alter table pvp_here enable row level security;
revoke all on pvp_matches, pvp_moves, pvp_records, pvp_here from anon, authenticated;
drop policy if exists pvp_matches_admin on pvp_matches;
create policy pvp_matches_admin on pvp_matches for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists pvp_moves_admin on pvp_moves;
create policy pvp_moves_admin on pvp_moves for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists pvp_records_admin on pvp_records;
create policy pvp_records_admin on pvp_records for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists pvp_here_admin on pvp_here;
create policy pvp_here_admin on pvp_here for all using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- 4. helpers (never called by players directly)

-- A move's seed: from the match's secret and the move's number, as a 32-bit integer (createRng takes it as is).
create or replace function pvp_seed(p_secret text, p_seq int)
returns int
language sql immutable as $$
  select ('x' || substr(md5(p_secret || ':' || p_seq::text), 1, 8))::bit(32)::int
$$;

create or replace function pvp_friends(p_one uuid, p_two uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f where f.user_a = least(p_one, p_two) and f.user_b = greatest(p_one, p_two))
$$;

-- What a player may draft: every region's Box in their main save, Lv.50 or more, one per species (its shiny apart) at
-- its best level — the game's versusChoices.
create or replace function pvp_candidates(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with save as (select s.data from saves s where s.user_id = p_user and s.realm = 'main'),
  boxes as (
    select m from save, jsonb_array_elements(coalesce(save.data -> 'box', '[]')) m
    union all
    select m from save, jsonb_each(coalesce(save.data -> 'parked', '{}')) p(k, v), jsonb_array_elements(coalesce(p.v -> 'box', '[]')) m
  ),
  ok as (
    select (m ->> 'dex')::int dex, least(100, (m ->> 'level')::int) lvl, coalesce((m ->> 'shiny')::boolean, false) shiny,
           coalesce(m ->> 'talent', 'false') = 'true' talent
    from boxes
    where jsonb_typeof(m) = 'object' and (m ->> 'dex') ~ '^[0-9]+$' and (m ->> 'level') ~ '^[0-9]+$'
      and (m ->> 'level')::int >= 50 and m ->> 'revivesAt' is null
  ),
  best as (
    select distinct on (dex, shiny) dex, lvl, shiny, talent from ok order by dex, shiny, lvl desc, talent desc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('dex', dex, 'level', lvl, 'shiny', shiny) || case when talent then '{"talent": true}'::jsonb else '{}'::jsonb end
    order by lvl desc, dex), '[]'::jsonb)
  from best
$$;

-- The registered Versus team (main game), as the fight takes it.
create or replace function pvp_versus_team(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select vt.team from versus_teams vt where vt.user_id = p_user and vt.realm = 'main' and jsonb_array_length(vt.team) = 3
$$;

-- Busy: in a challenge or a match not over.
create or replace function pvp_busy(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pvp_matches m
    where (m.a = p_user or m.b = p_user) and m.state in ('invited', 'draft', 'order', 'battle')
      and not (m.state = 'invited' and m.deadline < now())
  )
$$;

create or replace function pvp_online_at(p_user uuid)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select h.at from pvp_here h where h.user_id = p_user
$$;

-- Sends on a topic; Realtime missing or refusing changes nothing (the games ask pvp_state when they come back).
create or replace function pvp_send(p_topic text, p_event text, p_payload jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    perform realtime.send(p_payload, p_event, p_topic, true);
  exception when others then
    null;
  end;
end
$$;

create or replace function pvp_ms(p_at timestamptz)
returns bigint
language sql immutable as $$ select (extract(epoch from p_at) * 1000)::bigint $$;

-- The match as `p_side` may see it: never the secret, never the other's candidates, the other's order only once the
-- battle has started (the game shows each one as it comes out).
create or replace function pvp_public(m pvp_matches, p_side text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'mode', m.mode,
    'state', m.state,
    'side', p_side,
    'a', pvp_who(m.a),
    'b', pvp_who(m.b),
    'firstPicker', m.first_picker,
    'picks', m.picks,
    'cand', case when p_side = 'a' then m.cand_a else m.cand_b end,
    'team', case when p_side = 'a' then m.team_a else m.team_b end,
    'foeTeam', case when m.state in ('battle', 'done', 'void') then (case when p_side = 'a' then m.team_b else m.team_a end) end,
    'readyA', m.ready_a,
    'readyB', m.ready_b,
    'seq', m.seq,
    'seed', case when m.state in ('battle', 'done', 'void') then pvp_seed(m.secret, 0) end,
    'deadline', pvp_ms(m.deadline),
    -- When the other player's game last called: past a while, this game says they lost connection.
    'foeSeen', pvp_ms(coalesce(case when p_side = 'a' then m.seen_b else m.seen_a end, m.created_at)),
    'now', pvp_ms(now()),
    'winner', m.winner,
    'reason', m.reason,
    'createdAt', pvp_ms(m.created_at),
    'cfg', friend_battles_cfg()
  )
$$;

-- Tells both games something changed: they read pvp_state for their own view.
create or replace function pvp_notify(m pvp_matches)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  payload jsonb := jsonb_build_object('id', m.id, 'state', m.state, 'seq', m.seq);
begin
  perform pvp_send('pvp:' || m.id, 'state', payload);
  perform pvp_send('pvp-inbox:' || m.a, 'state', payload);
  perform pvp_send('pvp-inbox:' || m.b, 'state', payload);
end
$$;

-- The match is over: its result, the head to head, the friendship streak.
create or replace function pvp_settle(p_id bigint, p_winner text, p_reason text, p_void boolean default false)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  m pvp_matches;
  lo uuid;
begin
  update pvp_matches x
     set state = case when p_void then 'void' else 'done' end,
         winner = case when p_void then null else p_winner end,
         reason = p_reason, ended_at = now(), deadline = null
   where x.id = p_id and x.state in ('draft', 'order', 'battle')
  returning * into m;
  if not found then return; end if;
  if not p_void and p_winner is not null then
    lo := least(m.a, m.b);
    insert into pvp_records (user_a, user_b) values (lo, greatest(m.a, m.b)) on conflict do nothing;
    update pvp_records r
       set wins_a = r.wins_a + case when (p_winner = 'a' and m.a = lo) or (p_winner = 'b' and m.b = lo) then 1 else 0 end,
           wins_b = r.wins_b + case when (p_winner = 'a' and m.a <> lo) or (p_winner = 'b' and m.b <> lo) then 1 else 0 end,
           draws = r.draws + case when p_winner = 'draw' then 1 else 0 end,
           last_at = now()
     where r.user_a = lo and r.user_b = greatest(m.a, m.b);
    -- A battle fought to its end keeps the friendship streak going (docs/60), when that's on.
    begin
      perform friendship_touch(m.a, m.b, 'battle');
    exception when undefined_function then
      null;
    end;
  end if;
  perform pvp_notify(m);
end
$$;

-- Lazily tidies one match: a challenge past its time expires.
create or replace function pvp_tidy(p_id bigint)
returns pvp_matches
language plpgsql volatile security definer set search_path = public as $$
declare
  m pvp_matches;
begin
  update pvp_matches x set state = 'expired', ended_at = now()
   where x.id = p_id and x.state = 'invited' and x.deadline < now();
  select * into m from pvp_matches x where x.id = p_id;
  return m;
end
$$;

-- The caller's side in a match they play, or an error.
create or replace function pvp_mine(p_id bigint, out m pvp_matches, out side text)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'pvp_signed_out'; end if;
  if not friend_battles_open() then raise exception 'pvp_off'; end if;
  m := pvp_tidy(p_id);
  if m.id is null or me not in (m.a, m.b) then raise exception 'pvp_not_found'; end if;
  side := case when me = m.a then 'a' else 'b' end;
  if side = 'a' then
    update pvp_matches x set seen_a = now() where x.id = p_id;
  else
    update pvp_matches x set seen_b = now() where x.id = p_id;
  end if;
end
$$;

-- Draft: whose pick it is after `n` picks.
create or replace function pvp_draft_turn(p_first text, p_n int)
returns text
language sql immutable as $$
  select case when p_n >= 6 then null when p_n % 2 = 0 then p_first else (case when p_first = 'a' then 'b' else 'a' end) end
$$;

-- Draft: what `p_side` may pick now (draftChoices): their own, a species once in their team, never one the other took
-- unless nothing else is left.
create or replace function pvp_choices(m pvp_matches, p_side text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with cand as (
    select c from jsonb_array_elements(coalesce(case when p_side = 'a' then m.cand_a else m.cand_b end, '[]')) c
  ),
  mine as (select (p ->> 'dex')::int dex from jsonb_array_elements(m.picks) p where p ->> 'side' = p_side),
  theirs as (select (p ->> 'dex')::int dex from jsonb_array_elements(m.picks) p where p ->> 'side' <> p_side),
  free_c as (select c from cand where (c ->> 'dex')::int not in (select dex from mine)),
  open_c as (select c from free_c where (c ->> 'dex')::int not in (select dex from theirs))
  select coalesce(
    (select jsonb_agg(c) from open_c),
    (select jsonb_agg(c) from free_c),
    '[]'::jsonb)
$$;

-- Draft: one pick into the match; the sixth opens the order step.
create or replace function pvp_add_pick(p_id bigint, p_side text, p_mon jsonb)
returns pvp_matches
language plpgsql volatile security definer set search_path = public as $$
declare
  m pvp_matches;
  v_picks jsonb;
begin
  select * into m from pvp_matches x where x.id = p_id for update;
  v_picks := m.picks || jsonb_build_array(jsonb_build_object('side', p_side) || p_mon);
  if jsonb_array_length(v_picks) >= 6 then
    update pvp_matches x
       set picks = v_picks,
           team_a = (select jsonb_agg(p - 'side' order by o) from jsonb_array_elements(v_picks) with ordinality t(p, o) where p ->> 'side' = 'a'),
           team_b = (select jsonb_agg(p - 'side' order by o) from jsonb_array_elements(v_picks) with ordinality t(p, o) where p ->> 'side' = 'b'),
           state = 'order', deadline = now() + pvp_secs('order')
     where x.id = p_id returning * into m;
  else
    update pvp_matches x set picks = v_picks, deadline = now() + pvp_secs('pick') where x.id = p_id returning * into m;
  end if;
  return m;
end
$$;

-- Order: a side is ready (its team in this order, a permutation of its three); both ready, the battle starts.
create or replace function pvp_set_order(p_id bigint, p_side text, p_order int[])
returns pvp_matches
language plpgsql volatile security definer set search_path = public as $$
declare
  m pvp_matches;
  team jsonb;
  n int;
begin
  select * into m from pvp_matches x where x.id = p_id for update;
  team := case when p_side = 'a' then m.team_a else m.team_b end;
  n := jsonb_array_length(team);
  if p_order is not null then
    if coalesce(array_length(p_order, 1), 0) <> n
       or (select count(distinct x) from unnest(p_order) x where x between 0 and n - 1) <> n then
      raise exception 'pvp_bad_order';
    end if;
    team := (select jsonb_agg(team -> x order by o) from unnest(p_order) with ordinality t(x, o));
  end if;
  if p_side = 'a' then
    update pvp_matches x set team_a = team, ready_a = true where x.id = p_id returning * into m;
  else
    update pvp_matches x set team_b = team, ready_b = true where x.id = p_id returning * into m;
  end if;
  if m.ready_a and m.ready_b then
    update pvp_matches x set state = 'battle', seq = 0, started_at = now(), deadline = now() + pvp_secs('turn')
     where x.id = p_id returning * into m;
  end if;
  return m;
end
$$;

-- ---------------------------------------------------------------- 5. what the game calls

-- I'm in the game: friends see "Online now" for 2 minutes. Called every minute while the feature is open.
create or replace function pvp_here()
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null or not friend_battles_open() then return; end if;
  insert into pvp_here (user_id, at) values (auth.uid(), now()) on conflict (user_id) do update set at = excluded.at;
end
$$;

-- The caller's friends in the game in the last 2 minutes.
create or replace function pvp_online()
returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(f.id), '{}')
  from friend_ids_of(auth.uid()) f
  join pvp_here h on h.user_id = f.id
  where friend_battles_open() and h.at > now() - interval '2 minutes'
$$;

create or replace function pvp_challenge(p_friend uuid, p_mode text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := friend_battles_cfg();
  m pvp_matches;
begin
  if me is null then raise exception 'pvp_signed_out'; end if;
  if not friend_battles_open() then raise exception 'pvp_off'; end if;
  if p_mode not in ('classic', 'draft') or coalesce((cfg ->> p_mode)::boolean, true) = false then
    raise exception 'pvp_mode_off';
  end if;
  if p_friend is null or p_friend = me or not pvp_friends(me, p_friend) then raise exception 'pvp_not_friends'; end if;
  if pvp_busy(me) then raise exception 'pvp_busy'; end if;
  if pvp_busy(p_friend) then raise exception 'pvp_friend_busy'; end if;
  if coalesce(pvp_online_at(p_friend), '-infinity') < now() - interval '2 minutes' then raise exception 'pvp_offline'; end if;
  if p_mode = 'classic' then
    if pvp_versus_team(me) is null then raise exception 'pvp_no_team'; end if;
    if pvp_versus_team(p_friend) is null then raise exception 'pvp_friend_no_team'; end if;
  else
    if jsonb_array_length(pvp_candidates(me)) < 3 then raise exception 'pvp_no_team'; end if;
    if jsonb_array_length(pvp_candidates(p_friend)) < 3 then raise exception 'pvp_friend_no_team'; end if;
  end if;
  insert into pvp_matches (a, b, mode, deadline, seen_a)
    values (me, p_friend, p_mode, now() + pvp_secs('expiry'), now())
  returning * into m;
  perform pvp_send('pvp-inbox:' || p_friend, 'challenge', jsonb_build_object('id', m.id, 'mode', m.mode));
  return pvp_public(m, 'a');
end
$$;

create or replace function pvp_answer(p_match bigint, p_accept boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  ta jsonb;
  tb jsonb;
begin
  select * into r from pvp_mine(p_match);
  m := r.m;
  if r.side <> 'b' then raise exception 'pvp_not_yours'; end if;
  if m.state = 'expired' then raise exception 'pvp_expired'; end if;
  if m.state <> 'invited' then raise exception 'pvp_gone'; end if;
  if not p_accept then
    update pvp_matches x set state = 'declined', ended_at = now() where x.id = p_match returning * into m;
    perform pvp_notify(m);
    return pvp_public(m, 'b');
  end if;
  if exists (select 1 from pvp_matches x where (x.a = m.b or x.b = m.b) and x.id <> m.id and x.state in ('draft', 'order', 'battle')) then
    raise exception 'pvp_busy';
  end if;
  if m.mode = 'classic' then
    ta := pvp_versus_team(m.a);
    tb := pvp_versus_team(m.b);
    if ta is null then raise exception 'pvp_friend_no_team'; end if;
    if tb is null then raise exception 'pvp_no_team'; end if;
    update pvp_matches x
       set state = 'order', team_a = ta, team_b = tb, deadline = now() + pvp_secs('order'), seen_b = now()
     where x.id = p_match returning * into m;
  else
    ta := pvp_candidates(m.a);
    tb := pvp_candidates(m.b);
    if jsonb_array_length(ta) < 3 then raise exception 'pvp_friend_no_team'; end if;
    if jsonb_array_length(tb) < 3 then raise exception 'pvp_no_team'; end if;
    -- The coin, tossed here; the games give it 4 seconds on screen before the first pick's time runs.
    update pvp_matches x
       set state = 'draft', cand_a = ta, cand_b = tb, first_picker = case when random() < 0.5 then 'a' else 'b' end,
           deadline = now() + pvp_secs('pick') + interval '4 seconds', seen_b = now()
     where x.id = p_match returning * into m;
  end if;
  -- Any other challenge to either of them is off.
  update pvp_matches x set state = 'cancelled', ended_at = now()
   where x.id <> m.id and x.state = 'invited' and (x.a in (m.a, m.b) or x.b in (m.a, m.b));
  perform pvp_notify(m);
  return pvp_public(m, 'b');
end
$$;

create or replace function pvp_cancel(p_match bigint)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
begin
  select * into r from pvp_mine(p_match);
  m := r.m;
  if r.side <> 'a' then raise exception 'pvp_not_yours'; end if;
  if m.state = 'invited' then
    update pvp_matches x set state = 'cancelled', ended_at = now() where x.id = p_match returning * into m;
    perform pvp_notify(m);
  end if;
  return pvp_public(m, 'a');
end
$$;

create or replace function pvp_pick(p_match bigint, p_dex int, p_shiny boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  mon jsonb;
begin
  select * into r from pvp_mine(p_match);
  m := r.m;
  if m.state <> 'draft' then raise exception 'pvp_not_drafting'; end if;
  if pvp_draft_turn(m.first_picker, jsonb_array_length(m.picks)) <> r.side then raise exception 'pvp_not_your_pick'; end if;
  select c into mon from jsonb_array_elements(pvp_choices(m, r.side)) c
   where (c ->> 'dex')::int = p_dex and coalesce((c ->> 'shiny')::boolean, false) = coalesce(p_shiny, false)
   limit 1;
  if mon is null then raise exception 'pvp_bad_pick'; end if;
  m := pvp_add_pick(p_match, r.side, mon);
  perform pvp_notify(m);
  return pvp_public(m, r.side);
end
$$;

create or replace function pvp_order(p_match bigint, p_order int[])
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
begin
  select * into r from pvp_mine(p_match);
  m := r.m;
  if m.state <> 'order' then raise exception 'pvp_not_ordering'; end if;
  m := pvp_set_order(p_match, r.side, p_order);
  perform pvp_notify(m);
  return pvp_public(m, r.side);
end
$$;

-- One move of the fight. `p_seq`: the move's number, the one after the last (a gap or a replay is refused with the
-- number expected). Returns the move's seed. Whose turn it is the games' engine decides, the same on both: a move out of
-- turn changes nothing there.
create or replace function pvp_move(p_match bigint, p_seq int, p_move jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  k text := p_move ->> 'k';
  mv jsonb;
  seed int;
begin
  select * into r from pvp_mine(p_match);
  select * into m from pvp_matches x where x.id = p_match for update;
  if m.state <> 'battle' then raise exception 'pvp_not_fighting'; end if;
  if p_seq is distinct from m.seq + 1 then raise exception 'pvp_seq %', m.seq; end if;
  if k = 'reroll' then
    if jsonb_typeof(p_move -> 'mask') <> 'array' or jsonb_array_length(p_move -> 'mask') > 16
       or exists (select 1 from jsonb_array_elements(p_move -> 'mask') x where jsonb_typeof(x) <> 'boolean') then
      raise exception 'pvp_bad_move';
    end if;
    mv := jsonb_build_object('k', 'reroll', 'mask', p_move -> 'mask');
  elsif k in ('attack', 'forfeit') then
    mv := jsonb_build_object('k', k);
  else
    raise exception 'pvp_bad_move';
  end if;
  seed := pvp_seed(m.secret, p_seq);
  insert into pvp_moves (match_id, seq, side, move, seed) values (p_match, p_seq, r.side, mv, seed);
  update pvp_matches x set seq = p_seq, deadline = now() + pvp_secs('turn') where x.id = p_match;
  perform pvp_send('pvp:' || p_match, 'move', jsonb_build_object('seq', p_seq, 'side', r.side, 'move', mv, 'seed', seed));
  -- A forfeit is final at once: the other side has won.
  if k = 'forfeit' then
    perform pvp_settle(p_match, case when r.side = 'a' then 'b' else 'a' end, 'forfeit');
  end if;
  return jsonb_build_object('seq', p_seq, 'seed', seed);
end
$$;

-- A deadline passed (called by either game, with the move number it last saw): the server acts for the side that
-- didn't. A challenge expires; a draft pick goes to the highest level left; an order is kept as it stands; in battle, a
-- time-out move (the turn's side attacks with the dice in hand). Returns the match.
create or replace function pvp_timeout(p_match bigint, p_seq int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  turn text;
  mon jsonb;
  seed int;
  mv jsonb := '{"k": "timeout"}'::jsonb;
begin
  select * into r from pvp_mine(p_match);
  select * into m from pvp_matches x where x.id = p_match for update;
  if m.deadline is null or m.deadline > now() then return pvp_public(m, r.side); end if;
  if m.state = 'draft' then
    turn := pvp_draft_turn(m.first_picker, jsonb_array_length(m.picks));
    select c into mon from jsonb_array_elements(pvp_choices(m, turn)) c order by (c ->> 'level')::int desc limit 1;
    if mon is not null then
      m := pvp_add_pick(p_match, turn, mon);
      perform pvp_notify(m);
    end if;
  elsif m.state = 'order' then
    if not m.ready_a then m := pvp_set_order(p_match, 'a', null); end if;
    if not m.ready_b then m := pvp_set_order(p_match, 'b', null); end if;
    perform pvp_notify(m);
  elsif m.state = 'battle' and (p_seq is null or p_seq = m.seq) then
    seed := pvp_seed(m.secret, m.seq + 1);
    insert into pvp_moves (match_id, seq, side, move, seed)
      values (p_match, m.seq + 1, case when r.side = 'a' then 'b' else 'a' end, mv, seed);
    update pvp_matches x set seq = m.seq + 1, deadline = now() + pvp_secs('turn') where x.id = p_match returning * into m;
    perform pvp_send('pvp:' || p_match, 'move',
      jsonb_build_object('seq', m.seq, 'side', case when r.side = 'a' then 'b' else 'a' end, 'move', mv, 'seed', seed));
  end if;
  select * into m from pvp_matches x where x.id = p_match;
  return pvp_public(m, r.side);
end
$$;

create or replace function pvp_ping(p_match bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform pvp_mine(p_match);
end
$$;

-- The other player has been gone longer than the grace: the caller wins.
create or replace function pvp_claim(p_match bigint)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  their timestamptz;
begin
  select * into r from pvp_mine(p_match);
  m := r.m;
  if m.state not in ('draft', 'order', 'battle') then return pvp_public(m, r.side); end if;
  their := case when r.side = 'a' then m.seen_b else m.seen_a end;
  if coalesce(their, m.created_at) < now() - pvp_secs('grace') then
    perform pvp_settle(p_match, r.side, 'left');
  end if;
  select * into m from pvp_matches x where x.id = p_match;
  return pvp_public(m, r.side);
end
$$;

-- The fight is over on the caller's game: who won and its fingerprint (pvpHash). Two equal claims settle it, two
-- different void it, and one alone settles it once 30 seconds have passed without the other.
create or replace function pvp_finish(p_match bigint, p_winner text, p_hash text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  mine jsonb;
  theirs jsonb;
begin
  if p_winner not in ('a', 'b', 'draw') then raise exception 'pvp_bad_result'; end if;
  select * into r from pvp_mine(p_match);
  select * into m from pvp_matches x where x.id = p_match for update;
  if m.state <> 'battle' then return pvp_public(m, r.side); end if;
  mine := coalesce(m.claims -> r.side, jsonb_build_object('winner', p_winner, 'hash', left(coalesce(p_hash, ''), 32), 'at', pvp_ms(now())));
  update pvp_matches x set claims = x.claims || jsonb_build_object(r.side, mine) where x.id = p_match returning * into m;
  theirs := m.claims -> (case when r.side = 'a' then 'b' else 'a' end);
  if theirs is not null then
    if theirs ->> 'winner' = mine ->> 'winner' and theirs ->> 'hash' = mine ->> 'hash' then
      perform pvp_settle(p_match, mine ->> 'winner', 'ko');
    else
      perform pvp_settle(p_match, null, 'mismatch', true);
    end if;
  elsif (mine ->> 'at')::bigint < pvp_ms(now() - interval '30 seconds') then
    perform pvp_settle(p_match, mine ->> 'winner', 'ko');
  end if;
  select * into m from pvp_matches x where x.id = p_match;
  return pvp_public(m, r.side);
end
$$;

-- The match as the caller sees it, and the moves after `p_after` (a game catching up after a reload or a drop).
create or replace function pvp_state(p_match bigint, p_after int default 0)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
begin
  select * into r from pvp_mine(p_match);
  select * into m from pvp_matches x where x.id = p_match;
  return jsonb_build_object(
    'match', pvp_public(m, r.side),
    'moves', coalesce((
      select jsonb_agg(jsonb_build_object('seq', v.seq, 'side', v.side, 'move', v.move, 'seed', v.seed) order by v.seq)
      from pvp_moves v where v.match_id = p_match and v.seq > coalesce(p_after, 0)
    ), '[]'::jsonb)
  );
end
$$;

-- The page: a challenge waiting for the caller, the match they're in, each friend's head to head, the last battles.
create or replace function pvp_home()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cur pvp_matches;
begin
  if me is null or not friend_battles_open() then return null; end if;
  update pvp_matches x set state = 'expired', ended_at = now()
   where x.state = 'invited' and x.deadline < now() and (x.a = me or x.b = me);
  select * into cur from pvp_matches x
   where (x.a = me or x.b = me) and x.state in ('invited', 'draft', 'order', 'battle')
   order by x.created_at desc limit 1;
  return jsonb_build_object(
    'current', case when cur.id is not null then pvp_public(cur, case when cur.a = me then 'a' else 'b' end) end,
    'records', coalesce((
      select jsonb_agg(pvp_who(case when r.user_a = me then r.user_b else r.user_a end) || jsonb_build_object(
        'wins', case when r.user_a = me then r.wins_a else r.wins_b end,
        'losses', case when r.user_a = me then r.wins_b else r.wins_a end,
        'draws', r.draws) order by r.last_at desc)
      from pvp_records r where r.user_a = me or r.user_b = me
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h.j order by h.at desc) from (
        select x.ended_at at, jsonb_build_object(
          'id', x.id, 'mode', x.mode, 'at', pvp_ms(x.ended_at), 'reason', x.reason,
          'foe', pvp_who(case when x.a = me then x.b else x.a end),
          'result', case when x.winner = 'draw' then 'draw'
                         when x.winner = (case when x.a = me then 'a' else 'b' end) then 'win' else 'loss' end) j
        from pvp_matches x
        where (x.a = me or x.b = me) and x.state = 'done'
        order by x.ended_at desc limit 20
      ) h
    ), '[]'::jsonb)
  );
end
$$;

-- ---------------------------------------------------------------- 6. a battle is a friendship interaction

alter table friendship_streaks drop constraint if exists friendship_streaks_last_kind_check;
alter table friendship_streaks add constraint friendship_streaks_last_kind_check
  check (last_kind in ('raid', 'trade', 'egg', 'battle'));

-- 0107's, with 'battle' among the kinds.
create or replace function friendship_touch(p_one uuid, p_two uuid, p_kind text)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  a uuid := least(p_one, p_two);
  b uuid := greatest(p_one, p_two);
  d date := friendship_day();
  s friendship_streaks;
  n int;
begin
  if a is null or b is null or a = b or p_kind not in ('raid', 'trade', 'egg', 'battle') or not friendship_open() then
    return 0;
  end if;
  if not exists (select 1 from friendships f where f.user_a = a and f.user_b = b) then
    return 0;
  end if;
  insert into friendship_streaks (user_a, user_b, streak, best, last_day, last_kind)
    values (a, b, 0, 0, d - 2, p_kind) on conflict (user_a, user_b) do nothing;
  select * into s from friendship_streaks x where x.user_a = a and x.user_b = b for update;
  if s.last_day >= d then
    return 0;
  end if;
  n := case when s.last_day = d - 1 then s.streak + 1 else 1 end;
  update friendship_streaks x set streak = n, best = greatest(x.best, n), last_day = d, last_kind = p_kind
    where x.user_a = a and x.user_b = b;
  perform friendship_pay(a, b, p_kind, n);
  perform friendship_pay(b, a, p_kind, n);
  return n;
end
$$;

-- ---------------------------------------------------------------- 7. the sweep (pg_cron)

create or replace function pvp_sweep()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  x record;
begin
  update pvp_matches m set state = 'expired', ended_at = now() where m.state = 'invited' and m.deadline < now();
  -- A match nobody moved for 10 minutes past its deadline was left by both: void.
  for x in select m.id from pvp_matches m where m.state in ('draft', 'order', 'battle') and m.deadline < now() - interval '10 minutes'
  loop
    perform pvp_settle(x.id, null, 'abandoned', true);
  end loop;
  delete from pvp_moves v using pvp_matches m
   where v.match_id = m.id and m.ended_at < now() - interval '30 days';
  delete from pvp_here h where h.at < now() - interval '1 day';
end
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'pvp-sweep';
    perform cron.schedule('pvp-sweep', '*/10 * * * *', 'select pvp_sweep()');
  else
    raise notice 'pg_cron is off: Friend Battles tidy themselves as players call (old moves stay until it is on).';
  end if;
end $$;

-- ---------------------------------------------------------------- 8. Realtime: who may listen

-- A topic the caller may listen on: their own inbox, or a match they play.
create or replace function pvp_can_listen(p_topic text)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_topic = 'pvp-inbox:' || auth.uid()::text
    or (p_topic ~ '^pvp:[0-9]+$' and exists (
      select 1 from pvp_matches m where m.id = substr(p_topic, 5)::bigint and auth.uid() in (m.a, m.b)))
  )
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    drop policy if exists pvp_channel_listen on realtime.messages;
    create policy pvp_channel_listen on realtime.messages for select to authenticated
      using (extension = 'broadcast' and public.pvp_can_listen((select realtime.topic())));
  end if;
end $$;

-- ---------------------------------------------------------------- grants

revoke all on function is_beta_tester(), access_open(text), pvp_who(uuid), friend_battles_defaults(), friend_battles_cfg(),
  friend_battles_open(), pvp_secs(text), pvp_seed(text, int), pvp_friends(uuid, uuid), pvp_candidates(uuid),
  pvp_versus_team(uuid), pvp_busy(uuid), pvp_online_at(uuid), pvp_send(text, text, jsonb), pvp_ms(timestamptz),
  pvp_public(pvp_matches, text), pvp_notify(pvp_matches), pvp_settle(bigint, text, text, boolean), pvp_tidy(bigint),
  pvp_mine(bigint), pvp_draft_turn(text, int), pvp_choices(pvp_matches, text), pvp_add_pick(bigint, text, jsonb),
  pvp_set_order(bigint, text, int[]), pvp_sweep(), friendship_touch(uuid, uuid, text)
  from public, anon, authenticated;
-- The Realtime policy calls it as the listener.
revoke all on function pvp_can_listen(text) from public, anon;
grant execute on function pvp_can_listen(text) to authenticated;

revoke all on function beta_testers_list(), beta_tester_add(text), beta_tester_remove(uuid), friend_status(text),
  pvp_here(), pvp_online(), pvp_challenge(uuid, text), pvp_answer(bigint, boolean), pvp_cancel(bigint),
  pvp_pick(bigint, int, boolean), pvp_order(bigint, int[]), pvp_move(bigint, int, jsonb), pvp_timeout(bigint, int),
  pvp_ping(bigint), pvp_claim(bigint), pvp_finish(bigint, text, text), pvp_state(bigint, int), pvp_home()
  from public, anon;
grant execute on function beta_testers_list(), beta_tester_add(text), beta_tester_remove(uuid), friend_status(text),
  pvp_here(), pvp_online(), pvp_challenge(uuid, text), pvp_answer(bigint, boolean), pvp_cancel(bigint),
  pvp_pick(bigint, int, boolean), pvp_order(bigint, int[]), pvp_move(bigint, int, jsonb), pvp_timeout(bigint, int),
  pvp_ping(bigint), pvp_claim(bigint), pvp_finish(bigint, text, text), pvp_state(bigint, int), pvp_home()
  to authenticated;

commit;
