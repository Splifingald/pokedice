-- The weekly Versus league (docs/44-VERSUS-LEAGUE.md): trophies won and lost in matches the player fights themselves,
-- groups of 20 ranked from Monday to Sunday (UTC), the week's rewards sent as gift messages, and bots that fill the empty
-- places and the opponents' list. Players never touch these tables: the functions below read and write them as the owner
-- (security definer) and check everything they're given.
--
-- 1. game_config `versusLeague`: the switch (Off / On for admin / On for everyone, off by default: docs/15 §20) and the
--    numbers, inserted only if missing so seeding never clobbers the admin's. Every function acting for a player checks
--    the switch (versus_league_open).
-- 2. The tables: weeks, their groups, members (players and bots, with their trophies), the 3 opponents offered to each
--    player (kept until one is fought), matches, and the bots (names and looks; teams by tier, written by
--    `pnpm versus-bots` from the engine's buildBotTeam, at the end of this file).
-- 3. versus_league_start records a match as a full loss (a leave) before the fight; versus_league_finish replaces it
--    with the result, checked: the trophies are worked out here from the outcome, never taken from the page; a win
--    faster than the config allows, or a fight with an item used, is refused.
-- 4. versus_league_tick (hourly, pg_cron; the players' calls run it too when it's late): closes the weeks that have
--    ended (each player's ₽, Raid Balls and Rare Candies as a gift message), seats bots on the bot days, and moves
--    the seated bots' trophies along.
-- 5. Gift messages written by the server: the feedback triggers (0048) accept a message from the server itself
--    (feedback_system), not only the admin's.
-- 6. delete_my_data (0063) also deletes the player's league rows.
--
-- The main game only (Extreme mode keeps Versus as it was). Run after 0081; safe to run again.

-- ---------------------------------------------------------------- 1. the switch and the numbers

-- The game's defaults (engine/versusLeague.ts VERSUS_LEAGUE_DEFAULTS; tests/versus-league-sql.test.ts keeps them the same).
insert into game_config (key, value) values ('versusLeague', '{"access": "off"}'::jsonb)
on conflict (key) do nothing;

create or replace function versus_league_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{"access": "off", "trophies": [3, 6, 10], "safeBelow": 100, "groupSize": 20, "groupFill": 16,
           "botsPerDay": 5, "botDays": [3, 4, 5], "range": 0.15, "rangeMin": 30, "minWinSeconds": 5,
           "secondsPerMove": 0.2, "botTiers": [0, 100, 250, 500], "goldPerTrophy": 1,
           "rewards": [{"upTo": 1, "raidBalls": 5, "rareCandies": 10}, {"upTo": 2, "raidBalls": 2, "rareCandies": 5},
                       {"upTo": 3, "raidBalls": 1, "rareCandies": 3}, {"upTo": 5, "raidBalls": 0, "rareCandies": 3},
                       {"upTo": 10, "raidBalls": 0, "rareCandies": 1}]}'::jsonb
         || coalesce((select value from game_config where key = 'versusLeague' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- On for everyone, or for the admin only (as trade_open reads its own).
create or replace function versus_league_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(versus_league_cfg() ->> 'access', 'off') = 'all'
      or (versus_league_cfg() ->> 'access' = 'admin' and is_admin())
$$;

-- ---------------------------------------------------------------- 2. the tables

create table if not exists versus_league_weeks (
  week date primary key,                         -- its Monday (UTC)
  groups int not null,                           -- the groups it opened with
  stats jsonb not null default '{}',             -- the numbers that count came from
  bot_days date[] not null default '{}',         -- the bot days already seated
  closed_at timestamptz                          -- the rewards are sent
);

create table if not exists versus_league_groups (
  id bigserial primary key,
  week date not null references versus_league_weeks(week) on delete cascade,
  n int not null,                                -- 1, 2, 3… within the week
  unique (week, n)
);

-- The bots: a name and a look each (written at the end of this file).
create table if not exists versus_league_bots (
  id int primary key,
  name text not null,
  avatar text not null
);

-- The bots' teams, by tier (0–3: engine/versusLeague.ts buildBotTeam). Written at the end of this file.
create table if not exists versus_league_bot_teams (
  id int primary key,
  tier int not null check (tier between 0 and 3),
  team jsonb not null,                           -- [{dex, level, shiny}] × 3, Lv.50
  powers jsonb not null                          -- {gems, gmax, z}
);
create index if not exists versus_league_bot_teams_tier on versus_league_bot_teams (tier);

create table if not exists versus_league_members (
  id bigserial primary key,
  week date not null,
  group_id bigint not null references versus_league_groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  bot_id int references versus_league_bots(id),
  bot_team int references versus_league_bot_teams(id),
  bot_target int,                                -- where a bot's trophies are headed by Sunday night
  trophies int not null default 0,
  joined_at timestamptz not null default now(),
  constraint versus_league_member_kind check ((user_id is null) <> (bot_id is null))
);
create unique index if not exists versus_league_members_user on versus_league_members (week, user_id) where user_id is not null;
create unique index if not exists versus_league_members_bot on versus_league_members (week, bot_id) where bot_id is not null;
create index if not exists versus_league_members_group on versus_league_members (group_id);
create index if not exists versus_league_members_week_trophies on versus_league_members (week, trophies);

-- The 3 opponents offered to a player, as they were offered: kept until one is fought, whatever happens to them since.
create table if not exists versus_league_choices (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot int not null check (slot between 1 and 3),
  week date not null,
  foe_user uuid references auth.users(id) on delete cascade,
  foe_bot int references versus_league_bots(id),
  foe_name text not null,
  foe_avatar text not null,
  foe_team jsonb not null,
  foe_powers jsonb not null,
  foe_trophies int not null,
  foe_rich boolean not null default false,
  primary key (user_id, slot)
);

create table if not exists versus_league_matches (
  id bigserial primary key,
  week date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  team jsonb not null,                           -- the player's team as it fought
  foe_user uuid references auth.users(id) on delete set null,
  foe_bot int references versus_league_bots(id),
  foe_name text not null,
  foe_team jsonb not null,
  foe_powers jsonb not null,
  seed bigint not null,
  trophies_before int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null default 'left' check (outcome in ('won', 'lost', 'left')),
  pokemon_left int,
  foe_left int,
  delta int not null,                            -- what it did to the trophies (a leave until it's finished)
  moves int,
  log jsonb,                                     -- the player's moves, for the admin to look at
  constraint versus_league_matches_log_small check (log is null or pg_column_size(log) < 400000)
);
create index if not exists versus_league_matches_user on versus_league_matches (user_id, started_at desc);
create index if not exists versus_league_matches_week on versus_league_matches (week);

create table if not exists versus_league_tick_state (
  id boolean primary key default true check (id),
  ticked_at timestamptz not null
);

do $$
declare
  t text;
begin
  foreach t in array array['versus_league_weeks', 'versus_league_groups', 'versus_league_bots', 'versus_league_bot_teams',
                           'versus_league_members', 'versus_league_choices', 'versus_league_matches',
                           'versus_league_tick_state'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t || '_admin', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------- the rules (engine/versusLeague.ts has the same)

-- The league's week holding a moment: its Monday, UTC.
create or replace function versus_league_week(p_at timestamptz default now())
returns date
language sql stable as $$
  select date_trunc('week', p_at at time zone 'UTC')::date
$$;

-- Trophies for a win with this many Pokémon left standing (winTrophies).
create or replace function versus_league_win(p_left int, cfg jsonb)
returns int
language sql immutable as $$
  select case when p_left >= 1
    then coalesce((cfg -> 'trophies' ->> (least(p_left, jsonb_array_length(cfg -> 'trophies')) - 1))::int, 0)
    else 0 end
$$;

-- What a match does to the trophies (trophyChange): a win by your Pokémon left, a loss by the opponent's, a leave the
-- most; nothing is taken under `safeBelow`, counted before the match.
create or replace function versus_league_change(p_outcome text, p_left int, p_foe_left int, p_before int, cfg jsonb)
returns int
language sql immutable as $$
  select case
    when p_outcome = 'won' then versus_league_win(p_left, cfg)
    when p_before < (cfg ->> 'safeBelow')::int then 0
    when p_outcome = 'left' then -versus_league_win(3, cfg)
    else -versus_league_win(p_foe_left, cfg)
  end
$$;

-- A bot's tier for these trophies (botTierOf).
create or replace function versus_league_tier(p_trophies int, cfg jsonb)
returns int
language sql immutable as $$
  select least(3, greatest(0, coalesce(max(i - 1), 0)))::int
  from jsonb_array_elements_text(cfg -> 'botTiers') with ordinality t(v, i)
  where p_trophies >= v::int
$$;

-- What a bot shows as its id to everyone but the admin: a uuid like a player's, the same every time.
create or replace function versus_league_bot_uuid(p_bot int)
returns uuid
language sql immutable as $$
  select (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-8' || substr(h, 18, 3) || '-'
          || substr(h, 21, 12))::uuid
  from (select md5('pokedice.versus.bot.' || p_bot) as h) x
$$;

-- ---------------------------------------------------------------- the week and its groups

-- The week's row and its groups, made by the first player to fight in it: last week's players, grown or shrunk as last
-- Sunday's daily players compare to the Sunday before, `groupFill` to a group (leagueGroupCount). No league last week:
-- everyone with a Versus team.
create or replace function versus_league_ensure_week(p_week date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := versus_league_cfg();
  last_players int;
  sun int := 0;
  sun_before int := 0;
  teams int;
  trend numeric;
  expected numeric;
  n int;
begin
  if exists (select 1 from versus_league_weeks where week = p_week) then return; end if;
  perform pg_advisory_xact_lock(hashtext('pokedice.versus_league_week'));
  if exists (select 1 from versus_league_weeks where week = p_week) then return; end if;
  select count(*) into last_players from versus_league_members where week = p_week - 7 and user_id is not null;
  if to_regclass('public.player_days') is not null then
    execute 'select count(*) from player_days where day = $1' into sun using p_week - 1;
    execute 'select count(*) from player_days where day = $1' into sun_before using p_week - 8;
  end if;
  select count(*) into teams from versus_teams where realm = 'main';
  trend := case when sun > 0 and sun_before > 0 then sun::numeric / sun_before else 1 end;
  expected := case when last_players > 0 then last_players * trend else teams end;
  n := greatest(1, ceil(expected / greatest(1, (cfg ->> 'groupFill')::int)))::int;
  insert into versus_league_weeks (week, groups, stats)
  values (p_week, n, jsonb_build_object('lastWeekPlayers', last_players, 'lastSunday', sun, 'sundayBefore', sun_before,
                                        'teams', teams));
  insert into versus_league_groups (week, n) select p_week, g from generate_series(1, n) g;
end
$$;

-- The player's place this week: their group, or the emptiest one with room (a group made when all are full). Players
-- spread over the groups whenever they come, friends or not.
create or replace function versus_league_join(p_user uuid, p_week date)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := versus_league_cfg();
  gid bigint;
begin
  select group_id into gid from versus_league_members where week = p_week and user_id = p_user;
  if gid is not null then return gid; end if;
  perform versus_league_ensure_week(p_week);
  perform pg_advisory_xact_lock(hashtext('pokedice.versus_league_join'));
  select group_id into gid from versus_league_members where week = p_week and user_id = p_user;
  if gid is not null then return gid; end if;
  select g.id into gid
  from versus_league_groups g
  left join versus_league_members m on m.group_id = g.id
  where g.week = p_week
  group by g.id
  having count(m.id) < (cfg ->> 'groupSize')::int
  order by count(m.id), random()
  limit 1;
  if gid is null then
    insert into versus_league_groups (week, n)
    values (p_week, (select coalesce(max(n), 0) + 1 from versus_league_groups where week = p_week))
    returning id into gid;
  end if;
  insert into versus_league_members (week, group_id, user_id) values (p_week, gid, p_user);
  return gid;
end
$$;

-- ---------------------------------------------------------------- the opponents

-- One opponent for a free slot: a player with a Versus team, or a seated bot, whose trophies this week are within range
-- and who isn't offered already nor among the last 10 fought; else a bot made for the player's level.
create or replace function versus_league_offer(p_user uuid, p_week date, p_slot int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := versus_league_cfg();
  mine int := coalesce((select trophies from versus_league_members where week = p_week and user_id = p_user), 0);
  r int;
  lo int;
  hi int;
  fu uuid;
  fb int;
  ft int;
  bt record;
  out_u uuid[];
  out_b int[];
begin
  r := greatest((cfg ->> 'rangeMin')::int, round(mine * (cfg ->> 'range')::numeric)::int);
  lo := greatest(0, mine - r);
  hi := mine + r;
  -- Who's out: the ones offered already, and the last 10 fought.
  select coalesce(array_agg(x.foe_user) filter (where x.foe_user is not null), '{}'),
         coalesce(array_agg(x.foe_bot) filter (where x.foe_bot is not null), '{}')
  into out_u, out_b
  from (
    select c.foe_user, c.foe_bot from versus_league_choices c where c.user_id = p_user
    union all
    select y.foe_user, y.foe_bot
    from (select z.foe_user, z.foe_bot from versus_league_matches z where z.user_id = p_user
          order by z.started_at desc limit 10) y
  ) x;

  select x.u, x.b, x.t into fu, fb, ft
  from (
    select v.user_id as u, null::int as b, coalesce(m.trophies, 0) as t
    from versus_teams v
    left join versus_league_members m on m.week = p_week and m.user_id = v.user_id
    where v.realm = 'main' and v.user_id <> p_user and coalesce(m.trophies, 0) between lo and hi
      and not (v.user_id = any (out_u))
    union all
    select null, m.bot_id, m.trophies
    from versus_league_members m
    where m.week = p_week and m.bot_id is not null and m.trophies between lo and hi
      and not (m.bot_id = any (out_b))
  ) x
  order by random()
  limit 1;

  if fu is not null then
    insert into versus_league_choices (user_id, slot, week, foe_user, foe_name, foe_avatar, foe_team, foe_powers,
                                       foe_trophies, foe_rich)
    select p_user, p_slot, p_week, fu, coalesce(c.name, 'Trainer'), coalesce(c.avatar, 'red'), v.team,
           player_powers(fu, 'main'), ft, coalesce(player_rich(fu), false)
    from versus_teams v
    left join player_cards c on c.user_id = v.user_id and c.realm = 'main'
    where v.user_id = fu and v.realm = 'main';
    return;
  end if;
  if fb is not null then
    insert into versus_league_choices (user_id, slot, week, foe_bot, foe_name, foe_avatar, foe_team, foe_powers,
                                       foe_trophies)
    select p_user, p_slot, p_week, fb, b.name, b.avatar, t.team, t.powers, ft
    from versus_league_members m
    join versus_league_bots b on b.id = m.bot_id
    join versus_league_bot_teams t on t.id = m.bot_team
    where m.week = p_week and m.bot_id = fb;
    return;
  end if;
  -- Nobody fits: a bot of the player's level, not seated this week, with trophies around theirs.
  select b.id into fb
  from versus_league_bots b
  where not exists (select 1 from versus_league_members m where m.week = p_week and m.bot_id = b.id)
    and not (b.id = any (out_b))
  order by random()
  limit 1;
  select * into bt from versus_league_bot_teams where tier = versus_league_tier(mine, cfg) order by random() limit 1;
  if fb is null or bt is null then return; end if;
  insert into versus_league_choices (user_id, slot, week, foe_bot, foe_name, foe_avatar, foe_team, foe_powers,
                                     foe_trophies)
  select p_user, p_slot, p_week, fb, b.name, b.avatar, bt.team, bt.powers, greatest(lo, mine - r + floor(random() * (2 * r + 1))::int)
  from versus_league_bots b where b.id = fb;
end
$$;

-- The player's 3 opponents: the ones offered already, topped up to 3 (offered on a former week, they're offered anew).
-- `is_bot` is the admin's alone (null for everyone else).
create or replace function versus_league_choices()
returns table (slot int, name text, avatar text, team jsonb, powers jsonb, trophies int, rich boolean, is_bot boolean)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := versus_league_week();
  s int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if not versus_league_open() then raise exception 'versus_league_off'; end if;
  perform versus_league_tick_if_due();
  delete from versus_league_choices c where c.user_id = me and c.week <> wk;
  for s in 1..3 loop
    if not exists (select 1 from versus_league_choices c where c.user_id = me and c.slot = s) then
      perform versus_league_offer(me, wk, s);
    end if;
  end loop;
  return query
    select c.slot, c.foe_name, c.foe_avatar, c.foe_team, c.foe_powers, c.foe_trophies, c.foe_rich,
           case when is_admin() then c.foe_bot is not null end
    from versus_league_choices c where c.user_id = me order by c.slot;
end
$$;

-- ---------------------------------------------------------------- a match

-- A match against offer `p_slot`: the player joins the week's league if they haven't, the match is recorded as a leave
-- (the full loss) before it's fought, and the 3 offers go (3 new ones next time). Returns what the fight needs.
create or replace function versus_league_start(p_slot int)
returns table (match_id bigint, seed bigint, name text, avatar text, team jsonb, powers jsonb, trophies int, rich boolean)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := versus_league_week();
  cfg jsonb := versus_league_cfg();
  mine jsonb;
  ch versus_league_choices%rowtype;
  before int;
  prov int;
  mid bigint;
  sd bigint := floor(random() * 2147483647)::bigint;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if not versus_league_open() then raise exception 'versus_league_off'; end if;
  select v.team into mine from versus_teams v where v.user_id = me and v.realm = 'main';
  if mine is null then raise exception 'versus_no_team'; end if;
  select * into ch from versus_league_choices c where c.user_id = me and c.slot = p_slot and c.week = wk;
  if not found then raise exception 'versus_league_no_choice'; end if;
  perform versus_league_join(me, wk);
  select m.trophies into before from versus_league_members m where m.week = wk and m.user_id = me for update;
  prov := versus_league_change('left', 0, 0, before, cfg);
  insert into versus_league_matches (week, user_id, team, foe_user, foe_bot, foe_name, foe_team, foe_powers, seed,
                                     trophies_before, delta)
  values (wk, me, mine, ch.foe_user, ch.foe_bot, ch.foe_name, ch.foe_team, ch.foe_powers, sd, before, prov)
  returning id into mid;
  update versus_league_members m set trophies = m.trophies + prov where m.week = wk and m.user_id = me;
  delete from versus_league_choices c where c.user_id = me;
  return query select mid, sd, ch.foe_name, ch.foe_avatar, ch.foe_team, ch.foe_powers, ch.foe_trophies, ch.foe_rich;
end
$$;

-- The match's result, checked, in place of the leave it was recorded as. The trophies are worked out here: a win by the
-- player's Pokémon left (1–3), a loss by the opponent's (1–3), a leave the most. Refused: a match already finished, of a
-- week already closed, a result that can't be, a win faster than the config allows, a fight with an item used.
create or replace function versus_league_finish(p_match bigint, p_outcome text, p_left int, p_foe_left int, p_moves jsonb)
returns table (delta int, trophies int)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := versus_league_cfg();
  m versus_league_matches%rowtype;
  secs numeric;
  n int;
  d int;
  top int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if not versus_league_open() then raise exception 'versus_league_off'; end if;
  select * into m from versus_league_matches x where x.id = p_match and x.user_id = me for update;
  if not found then raise exception 'versus_league_no_match'; end if;
  if m.finished_at is not null then raise exception 'versus_league_done'; end if;
  if exists (select 1 from versus_league_weeks w where w.week = m.week and w.closed_at is not null) then
    raise exception 'versus_league_week_over';
  end if;
  if p_outcome is null or p_outcome not in ('won', 'lost', 'left')
     or (p_outcome = 'won' and not (p_left between 1 and 3 and coalesce(p_foe_left, 0) = 0))
     or (p_outcome = 'lost' and not (coalesce(p_left, 0) = 0 and p_foe_left between 1 and 3)) then
    raise exception 'versus_league_bad_result';
  end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) > 5000
     or pg_column_size(p_moves) >= 400000 then
    raise exception 'versus_league_bad_result';
  end if;
  if exists (select 1 from jsonb_array_elements(p_moves) e where jsonb_typeof(e) <> 'object' or e ->> 't' = 'USE_ITEM') then
    raise exception 'versus_league_item';
  end if;
  n := jsonb_array_length(p_moves);
  secs := extract(epoch from now() - m.started_at);
  if p_outcome = 'won'
     and secs < greatest((cfg ->> 'minWinSeconds')::numeric, n * (cfg ->> 'secondsPerMove')::numeric) then
    raise exception 'versus_league_too_fast';
  end if;
  d := versus_league_change(p_outcome, coalesce(p_left, 0), coalesce(p_foe_left, 0), m.trophies_before, cfg);
  select max(v::int) into top from jsonb_array_elements_text(cfg -> 'trophies') v;
  if abs(d) > top then raise exception 'versus_league_bad_result'; end if;
  update versus_league_matches x
  set finished_at = now(), outcome = p_outcome, pokemon_left = coalesce(p_left, 0), foe_left = coalesce(p_foe_left, 0),
      delta = d, moves = n, log = p_moves
  where x.id = m.id;
  return query
    update versus_league_members x set trophies = x.trophies + (d - m.delta)
    where x.week = m.week and x.user_id = me
    returning d, x.trophies;
end
$$;

-- ---------------------------------------------------------------- the board

-- The player's league this week (or last week, `p_last`): when it ends, their trophies, whether they've joined, and
-- their group, ranked (tied trophies share a rank). Bots look like players to everyone but the admin (`bot`).
create or replace function versus_league_home(p_last boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := versus_league_week() - case when p_last then 7 else 0 end;
  gid bigint;
  mine int;
  board jsonb;
  pending bigint;
begin
  if not versus_league_open() then raise exception 'versus_league_off'; end if;
  perform versus_league_tick_if_due();
  if me is not null then
    select m.group_id, m.trophies into gid, mine from versus_league_members m where m.week = wk and m.user_id = me;
  end if;
  if gid is not null then
    select coalesce(jsonb_agg(x.r order by (x.r ->> 'rank')::int, x.r ->> 'name'), '[]'::jsonb) into board
    from (
      select jsonb_build_object(
        'id', coalesce(m.user_id, versus_league_bot_uuid(m.bot_id)),
        'isMe', m.user_id is not distinct from me,
        'name', coalesce(case when m.bot_id is not null then b.name else c.name end, 'Trainer'),
        'avatar', coalesce(case when m.bot_id is not null then b.avatar else c.avatar end, 'red'),
        'team', coalesce(case when m.bot_id is not null then t.team else v.team end, '[]'::jsonb),
        'trophies', m.trophies,
        'rank', rank() over (order by m.trophies desc),
        'rich', case when m.user_id is not null then coalesce(player_rich(m.user_id), false) else false end,
        'bot', case when is_admin() then m.bot_id is not null end
      ) as r
      from versus_league_members m
      left join versus_league_bots b on b.id = m.bot_id
      left join versus_league_bot_teams t on t.id = m.bot_team
      left join player_cards c on c.user_id = m.user_id and c.realm = 'main'
      left join versus_teams v on v.user_id = m.user_id and v.realm = 'main'
      where m.group_id = gid
    ) x;
  end if;
  if me is not null and not p_last then
    select x.id into pending from versus_league_matches x
    where x.user_id = me and x.week = wk and x.finished_at is null order by x.started_at desc limit 1;
  end if;
  return jsonb_build_object(
    'week', wk,
    'endsAt', (wk + 7)::timestamp at time zone 'UTC',
    'joined', gid is not null,
    'trophies', coalesce(mine, 0),
    'rows', coalesce(board, '[]'::jsonb),
    'closed', exists (select 1 from versus_league_weeks w where w.week = wk and w.closed_at is not null),
    'pending', pending
  );
end
$$;

-- ---------------------------------------------------------------- the week's end, the bots, the hourly tick

-- A message written by the server itself (the league's rewards), not by a player: the feedback triggers let it through
-- as they do the admin's. A player can't set this: their calls come in through the API's own login.
create or replace function feedback_system()
returns boolean
language sql stable as $$
  select coalesce(current_setting('pokedice.system_message', true), '') = 'on'
     and session_user not in ('authenticator', 'anon', 'authenticated')
$$;

-- 0048's triggers, the same but for feedback_system().
create or replace function feedback_reply_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.from_admin and (is_admin() or feedback_system()) then
      -- The admin writes to a player first: the words are already there, shown to the player as an answer.
      new.reply := nullif(trim(new.reply), '');
      new.replied_at := now();
      new.reply_seen := false;
    else
      new.from_admin := false;
      new.reply := null;
      new.replied_at := null;
      new.reply_seen := false;
      new.gifts := null;
    end if;
    new.gifts_claimed_at := null;
    return new;
  end if;
  -- Who wrote first never changes, and a gift once opened stays as it was opened.
  new.from_admin := old.from_admin;
  if old.gifts_claimed_at is not null then
    new.gifts := old.gifts;
    new.gifts_claimed_at := old.gifts_claimed_at;
  end if;
  if new.reply is distinct from old.reply then
    new.reply := nullif(trim(new.reply), '');
    new.replied_at := case when new.reply is null then null else now() end;
    new.reply_seen := false;
    if new.reply is not null then
      new.read := true;
    end if;
  end if;
  -- A gift added or changed shows the message again.
  if new.gifts is distinct from old.gifts then
    new.reply_seen := false;
  end if;
  return new;
end
$$;

create or replace function feedback_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if new.from_admin and (is_admin() or feedback_system()) then
    if new.user_id is null and coalesce(new.device_id, '') = '' then
      raise exception 'feedback_no_player' using errcode = '22023';
    end if;
    new.read := true;
    return new;
  end if;
  new.from_admin := false;
  new.gifts := null;
  new.user_id := auth.uid();
  new.email := case when auth.uid() is null then null else auth.jwt() ->> 'email' end;
  new.read := false;
  if (
    select count(*) from feedback f
    where f.created_at > now() - interval '10 minutes'
      and not f.from_admin
      and (f.device_id = new.device_id or (new.user_id is not null and f.user_id = new.user_id))
  ) >= 3 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- The week's rewards (leagueGifts), each player's as a gift message: ₽ for each trophy, and their rank's Raid Balls and
-- Rare Candies, to the region they play when they open it. Bots get nothing; a player with nothing to get gets no
-- message. The game words it in the player's language from `reply` (src/lib/versusLeague.ts).
create or replace function versus_league_close_week(p_week date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := versus_league_cfg();
  r record;
  band jsonb;
  gifts jsonb;
  gold int;
begin
  if exists (select 1 from versus_league_weeks where week = p_week and closed_at is not null) then return; end if;
  perform set_config('pokedice.system_message', 'on', true);
  for r in
    select m.user_id, m.trophies, m.group_id,
           rank() over (partition by m.group_id order by m.trophies desc) as rk,
           count(*) over (partition by m.group_id) as size
    from versus_league_members m where m.week = p_week
  loop
    continue when r.user_id is null;
    select b into band from jsonb_array_elements(cfg -> 'rewards') b
    where r.rk <= (b ->> 'upTo')::int order by (b ->> 'upTo')::int limit 1;
    gold := least(999999, greatest(0, round(r.trophies * (cfg ->> 'goldPerTrophy')::numeric)))::int;
    gifts := '[]'::jsonb;
    if gold > 0 then
      gifts := gifts || jsonb_build_object('kind', 'gold', 'amount', gold, 'region', 'current');
    end if;
    if coalesce((band ->> 'raidBalls')::int, 0) > 0 then
      gifts := gifts || jsonb_build_object('kind', 'item', 'key', 'raid-ball', 'qty', (band ->> 'raidBalls')::int, 'region', 'current');
    end if;
    if coalesce((band ->> 'rareCandies')::int, 0) > 0 then
      gifts := gifts || jsonb_build_object('kind', 'item', 'key', 'rare-candy', 'qty', (band ->> 'rareCandies')::int, 'region', 'current');
    end if;
    continue when jsonb_array_length(gifts) = 0;
    insert into feedback (user_id, device_id, player_name, title, message, from_admin, reply, gifts)
    values (
      r.user_id, '',
      left((select c.name from player_cards c where c.user_id = r.user_id and c.realm = 'main'), 40),
      'versus_league', '', true,
      '@versus_league:' || jsonb_build_object('week', p_week, 'rank', r.rk, 'trophies', r.trophies, 'size', r.size)::text,
      gifts
    );
  end loop;
  perform set_config('pokedice.system_message', '', true);
  update versus_league_weeks set closed_at = now() where week = p_week;
end
$$;

-- Bots take the empty places of the week's groups: up to `botsPerDay` a group with room. Each one's trophies are headed
-- for a believable place among the group's players (a player's, projected to Sunday, from ×0.6 to ×1.25), its team of
-- the tier for that.
create or replace function versus_league_seat_bots(p_week date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := versus_league_cfg();
  g record;
  k int;
  i int;
  t int;
  target int;
  days numeric := greatest(1, extract(epoch from now() - (p_week::timestamp at time zone 'UTC')) / 86400);
  bot int;
  team int;
  seated int := 0;
begin
  for g in
    select gr.id, count(m.id) as n
    from versus_league_groups gr left join versus_league_members m on m.group_id = gr.id
    where gr.week = p_week group by gr.id
  loop
    k := least((cfg ->> 'botsPerDay')::int, (cfg ->> 'groupSize')::int - g.n::int);
    for i in 1..greatest(k, 0) loop
      select m.trophies into t from versus_league_members m
      where m.group_id = g.id and m.user_id is not null order by random() limit 1;
      target := case when coalesce(t, 0) <= 0 then 20 + floor(random() * 120)::int
                     else round(t * 7 / days * (0.6 + random() * 0.65))::int end;
      target := greatest(10, target);
      select b.id into bot from versus_league_bots b
      where not exists (select 1 from versus_league_members m where m.week = p_week and m.bot_id = b.id)
      order by random() limit 1;
      select bt.id into team from versus_league_bot_teams bt
      where bt.tier = versus_league_tier(target, cfg) order by random() limit 1;
      exit when bot is null or team is null;
      insert into versus_league_members (week, group_id, bot_id, bot_team, bot_target) values (p_week, g.id, bot, team, target);
      seated := seated + 1;
    end loop;
  end loop;
  return seated;
end
$$;

-- Every hour: the weeks that have ended close (their rewards go out), bots are seated on the bot days, and the seated
-- bots' trophies move toward where they're headed, to arrive by Sunday 22:00. Nothing while the switch is off.
create or replace function versus_league_tick()
returns void
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := versus_league_cfg();
  wk date := versus_league_week();
  today date := (now() at time zone 'UTC')::date;
  ends timestamptz := ((wk + 7)::timestamp at time zone 'UTC') - interval '2 hours';
  w date;
begin
  if coalesce(cfg ->> 'access', 'off') = 'off' then return; end if;
  if not pg_try_advisory_xact_lock(hashtext('pokedice.versus_league_tick')) then return; end if;
  for w in select x.week from versus_league_weeks x where x.closed_at is null and x.week < wk order by x.week loop
    perform versus_league_close_week(w);
  end loop;
  if exists (select 1 from versus_league_weeks x where x.week = wk and not (today = any (x.bot_days)))
     and extract(isodow from now() at time zone 'UTC')::int in (select v::int from jsonb_array_elements_text(cfg -> 'botDays') v) then
    perform versus_league_seat_bots(wk);
    update versus_league_weeks set bot_days = bot_days || today where week = wk;
  end if;
  update versus_league_members m
  set trophies = greatest(m.trophies, round(m.bot_target * least(1.0, greatest(0.0,
        extract(epoch from now() - m.joined_at) / greatest(1.0, extract(epoch from ends - m.joined_at)))))::int)
  where m.week = wk and m.bot_id is not null;
  insert into versus_league_tick_state (id, ticked_at) values (true, now())
  on conflict (id) do update set ticked_at = excluded.ticked_at;
end
$$;

-- The players' calls run the tick themselves when it's over 20 minutes late (pg_cron off, or its job not running).
create or replace function versus_league_tick_if_due()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from versus_league_tick_state where ticked_at > now() - interval '20 minutes') then return; end if;
  perform versus_league_tick();
end
$$;

-- The admin's buttons (Admin → Versus): run the tick now, or seat bots in this week's groups now, whatever the day.
create or replace function versus_league_admin(p_action text)
returns int
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_action = 'tick' then
    perform versus_league_tick();
    return 0;
  end if;
  if p_action = 'seat_bots' then
    perform versus_league_ensure_week(versus_league_week());
    return versus_league_seat_bots(versus_league_week());
  end if;
  raise exception 'bad_action' using errcode = '22023';
end
$$;

-- ---------------------------------------------------------------- 6. delete my data (0063, plus the league)

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
  if to_regclass('public.raid_progress_teams') is not null then
    delete from raid_progress_teams where user_id = me and (p_realm is null or realm = p_realm);
    delete from raid_progress_done where user_id = me and (p_realm is null or realm = p_realm);
  end if;
  -- Trades (0044): your open listings go; trades still owed to the other player stay for them, without your name.
  if to_regclass('public.trade_listings') is not null and (p_realm is null or p_realm = 'main') then
    delete from trade_listings where owner = me and (status = 'open' or taker is null or taker_applied);
    delete from trade_listings where taker = me and owner_applied;
    update trade_listings set owner = null, owner_name = null, owner_applied = true where owner = me;
    update trade_listings set taker = null, taker_name = null, taker_applied = true where taker = me;
  end if;
  -- The Underground (0063): your seat (an emptied team goes), your invitations, the orbs owed to you.
  if to_regclass('public.ug_members') is not null and (p_realm is null or p_realm = 'main') then
    delete from ug_invites where from_user = me or to_user = me;
    delete from ug_orbs where to_user = me;
    delete from ug_members where user_id = me;
    delete from ug_teams t where not exists (select 1 from ug_members m where m.team_id = t.id);
  end if;
  -- The Versus league (0082): your places, offers and matches; others' offers of you go too.
  if to_regclass('public.versus_league_members') is not null and (p_realm is null or p_realm = 'main') then
    delete from versus_league_choices where user_id = me or foe_user = me;
    delete from versus_league_matches where user_id = me;
    update versus_league_matches set foe_user = null where foe_user = me;
    delete from versus_league_members where user_id = me;
  end if;
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_attempts where actor = me::text;
    delete from push_subscriptions where owner = 'u:' || me::text;
    delete from push_notices where owner = 'u:' || me::text;
  end if;
end
$$;

-- ---------------------------------------------------------------- grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'versus_league_cfg()', 'versus_league_open()', 'versus_league_ensure_week(date)', 'versus_league_join(uuid, date)',
    'versus_league_offer(uuid, date, int)', 'versus_league_choices()', 'versus_league_start(int)',
    'versus_league_finish(bigint, text, int, int, jsonb)', 'versus_league_home(boolean)',
    'versus_league_close_week(date)', 'versus_league_seat_bots(date)', 'versus_league_tick()',
    'versus_league_tick_if_due()', 'versus_league_admin(text)', 'feedback_system()'
  ] loop
    execute format('revoke all on function %s from public', f);
  end loop;
end
$$;
grant execute on function versus_league_open() to anon, authenticated;
grant execute on function versus_league_choices() to authenticated;
grant execute on function versus_league_start(int) to authenticated;
grant execute on function versus_league_finish(bigint, text, int, int, jsonb) to authenticated;
grant execute on function versus_league_home(boolean) to anon, authenticated;
grant execute on function versus_league_admin(text) to authenticated;
grant execute on function feedback_system() to anon, authenticated;

-- ---------------------------------------------------------------- the hourly tick
-- Needs the pg_cron extension (Database → Extensions → pg_cron). Without it this says so, and the players' own calls
-- run the tick when it's over 20 minutes late.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'versus-league-tick';
    perform cron.schedule('versus-league-tick', '7 * * * *', 'select versus_league_tick()');
  else
    raise notice 'pg_cron is off: the Versus league is ticked by its players instead, when over 20 minutes late.';
  end if;
end
$$;

-- ---------------------------------------------------------------- the Raid Ball (src/data/items.json has it too)

insert into items (key, name, description, sprite_url, price, effect, in_shop, shop_badges) values
  ('raid-ball', 'Raid Ball', 'A ball made for raids: adds 5 to the catch die. It can only be thrown in a raid.',
   '/items/raid-ball.png', 500, '{"kind":"ball","bonus":5,"raidOnly":true}'::jsonb, false, 0)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, sprite_url = excluded.sprite_url, price = excluded.price,
  effect = excluded.effect, in_shop = excluded.in_shop, shop_badges = excluded.shop_badges;

-- ---------------------------------------------------------------- the bots
-- BEGIN GENERATED BOTS (pnpm versus-bots: scripts/versus-bots.ts; don't edit by hand)
insert into versus_league_bots (id, name, avatar) values
  (1, 'Sora', 'green'),
  (2, 'Haeun36', 'red'),
  (3, 'Lina21', 'johto/hiker'),
  (4, 'ShinyHunter4', 'kanto/beauty'),
  (5, 'Haruto', 'kanto/sis-and-bro'),
  (6, 'Jack', 'johto/psychic-m'),
  (7, 'Kaito88', 'green'),
  (8, 'KALOS', 'kanto/swimmers'),
  (9, 'dragontamer', 'kanto/channeler'),
  (10, 'Mewtwo', 'kanto/aroma-lady'),
  (11, 'Nathan8', 'kanto/crush-kin'),
  (12, 'Johto', 'johto/biker'),
  (13, 'Mei', 'johto/super-nerd'),
  (14, 'Pedro43', 'kanto/cooltrainer-m'),
  (15, 'Rayquaza32', 'red'),
  (16, 'Trainer14', 'red'),
  (17, 'Louise16', 'green'),
  (18, 'Umbreon', 'red'),
  (19, 'Yuki', 'kanto/rocker'),
  (20, 'ShinyHunter', 'red'),
  (21, 'Nora', 'kanto/youngster'),
  (22, 'Elena', 'red'),
  (23, 'Giulia34', 'johto/camper'),
  (24, 'Haruto80', 'kanto/ranger-m'),
  (25, 'tim', 'johto/schoolboy'),
  (26, 'Lou', 'kanto/little-swimmer'),
  (27, 'Rocket', 'kanto/cooltrainer-m'),
  (28, 'Martina39', 'red'),
  (29, 'Ava98', 'johto/lady'),
  (30, 'Rafael8', 'johto/sage'),
  (31, 'DiceMaster39', 'johto/guitarist'),
  (32, 'BEN', 'kanto/pokemaniac'),
  (33, 'Lucia13', 'johto/scientist'),
  (34, 'Max', 'kanto/pokemaniac'),
  (35, 'Larissa', 'johto/gentleman'),
  (36, 'HAEUN', 'kanto/tamer'),
  (37, 'umbreon', 'johto/lady'),
  (38, 'Aoi', 'kanto/burglar'),
  (39, 'Luca14', 'green'),
  (40, 'Diego', 'red'),
  (41, 'Clara', 'red'),
  (42, 'Ben', 'red'),
  (43, 'Lucario2010', 'kanto/sis-and-bro'),
  (44, 'Tom75', 'johto/lady'),
  (45, 'Matteo2000', 'kanto/channeler'),
  (46, 'Kenji85', 'green'),
  (47, 'Iris', 'red'),
  (48, 'Julia21', 'johto/schoolgirl'),
  (49, 'TOGEPI', 'kanto/camper'),
  (50, 'gabriel', 'johto/black-belt'),
  (51, 'Jack64', 'green'),
  (52, 'Haeun', 'red'),
  (53, 'Ren', 'red'),
  (54, 'Garchomp72', 'kanto/tamer'),
  (55, 'Paul', 'johto/skier'),
  (56, 'Mewtwo2010', 'green'),
  (57, 'PikaFan', 'green'),
  (58, 'emma', 'red'),
  (59, 'Nina17', 'kanto/fisherman'),
  (60, 'Trainer41', 'green'),
  (61, 'Minjun61', 'green'),
  (62, 'Sinnoh', 'johto/schoolgirl'),
  (63, 'mia', 'johto/skier'),
  (64, 'Sakura12', 'kanto/bird-keeper'),
  (65, 'Greninja49', 'kanto/youngster'),
  (66, 'Oscar', 'red'),
  (67, 'Ethan94', 'johto/kimono-girl'),
  (68, 'Iris96', 'kanto/beauty'),
  (69, 'LUCARIO', 'green'),
  (70, 'Gengar91', 'johto/swimmer-f'),
  (71, 'Liv44', 'johto/swimmer-f'),
  (72, 'Mei44', 'red'),
  (73, 'Lena', 'johto/youngster'),
  (74, 'Snorlax09', 'kanto/little-swimmer'),
  (75, 'Kalos', 'red'),
  (76, 'Kaito44', 'red'),
  (77, 'Pablo', 'green'),
  (78, 'ShinyHunter5', 'kanto/juggler'),
  (79, 'Lily', 'green'),
  (80, 'Pichu', 'green'),
  (81, 'Mia51', 'johto/lass'),
  (82, 'ELLA', 'johto/swimmer-m'),
  (83, 'Giulia96', 'kanto/aroma-lady'),
  (84, 'lukas', 'johto/guitarist'),
  (85, 'Champion', 'johto/biker'),
  (86, 'Rafael', 'red'),
  (87, 'Eevee', 'green'),
  (88, 'Tom', 'kanto/sis-and-bro'),
  (89, 'Mateo', 'red'),
  (90, 'Sofia', 'kanto/youngster'),
  (91, 'Marco74', 'green'),
  (92, 'Tim', 'kanto/super-nerd'),
  (93, 'Sylveon15', 'johto/black-belt'),
  (94, 'Blaziken50', 'johto/cyclist'),
  (95, 'DiceMaster', 'kanto/lass'),
  (96, 'Hannah8', 'kanto/youngster'),
  (97, 'ana', 'red'),
  (98, 'TOM', 'red'),
  (99, 'Yuki19', 'kanto/sis-and-bro'),
  (100, 'Lucas', 'green'),
  (101, 'Lucia34', 'johto/bug-catcher'),
  (102, 'Tom12', 'kanto/bug-catcher'),
  (103, 'haeun', 'kanto/psychic-f'),
  (104, 'Ruby62', 'johto/sage'),
  (105, 'Eva74', 'green'),
  (106, 'Joao', 'johto/gentleman'),
  (107, 'Hannah', 'johto/psychic-f'),
  (108, 'Mimikyu24', 'red'),
  (109, 'Mia', 'green'),
  (110, 'Lina2000', 'kanto/beauty'),
  (111, 'Wei2010', 'kanto/super-nerd'),
  (112, 'Lukas', 'kanto/ruin-maniac'),
  (113, 'nina', 'red'),
  (114, 'Hina90', 'green'),
  (115, 'Kai', 'kanto/karateka'),
  (116, 'Pichu2010', 'johto/skier'),
  (117, 'Minjun', 'red'),
  (118, 'Blaziken', 'green'),
  (119, 'Joao43', 'kanto/scientist'),
  (120, 'Emma26', 'kanto/swimmers'),
  (121, 'Kanto73', 'kanto/super-nerd'),
  (122, 'Zoroark', 'red'),
  (123, 'LIN', 'johto/swimmer-f'),
  (124, 'Leo73', 'green'),
  (125, 'MIA', 'red'),
  (126, 'NORA', 'johto/super-nerd'),
  (127, 'Theo46', 'red'),
  (128, 'PEDRO', 'red'),
  (129, 'Rayquaza14', 'johto/gentleman'),
  (130, 'Hoenn', 'red'),
  (131, 'Liv', 'red'),
  (132, 'Sakura7', 'green'),
  (133, 'REN', 'green'),
  (134, 'Ana37', 'johto/gentleman'),
  (135, 'Greninja54', 'kanto/youngster'),
  (136, 'Gengar', 'red'),
  (137, 'Julia45', 'kanto/pokemaniac'),
  (138, 'Beatriz', 'green'),
  (139, 'Sinnoh19', 'johto/lady'),
  (140, 'Ines73', 'green'),
  (141, 'Pedro', 'kanto/cooltrainer-f'),
  (142, 'Kanto3', 'green'),
  (143, 'Kalos78', 'johto/fisherman'),
  (144, 'Jules', 'kanto/black-belt'),
  (145, 'Yui', 'red'),
  (146, 'Martina45', 'red'),
  (147, 'Axel42', 'red'),
  (148, 'Noah', 'kanto/little-swimmer'),
  (149, 'DiceMaster84', 'johto/schoolgirl'),
  (150, 'Rafael1', 'johto/hiker'),
  (151, 'Ethan57', 'kanto/biker'),
  (152, 'Martina27', 'kanto/painter'),
  (153, 'Lou21', 'red'),
  (154, 'Togepi', 'kanto/fisherman'),
  (155, 'Eevee51', 'green'),
  (156, 'Greninja21', 'red'),
  (157, 'Nina', 'johto/biker'),
  (158, 'Lina74', 'kanto/little-swimmer'),
  (159, 'Sylveon', 'johto/schoolgirl'),
  (160, 'pablo', 'green'),
  (161, 'JOAO', 'green'),
  (162, 'Lucario', 'green'),
  (163, 'Seoyeon', 'kanto/channeler'),
  (164, 'Trainer', 'kanto/pokemon-breeder'),
  (165, 'Sam53', 'green'),
  (166, 'nora', 'kanto/juggler'),
  (167, 'Lucario40', 'red'),
  (168, 'Zoe12', 'johto/swimmer-f'),
  (169, 'Sakura20', 'johto/super-nerd'),
  (170, 'Pichu63', 'kanto/sailor'),
  (171, 'Chloe99', 'kanto/lass'),
  (172, 'Elio', 'kanto/ranger-m'),
  (173, 'Oscar2010', 'kanto/picnicker'),
  (174, 'Louise5', 'johto/bug-catcher'),
  (175, 'Mia80', 'red'),
  (176, 'Giulia60', 'kanto/aroma-lady'),
  (177, 'Martina', 'red'),
  (178, 'Kanto', 'green'),
  (179, 'Ella7', 'johto/fisherman'),
  (180, 'Gabriel', 'kanto/rocker'),
  (181, 'Sylveon43', 'kanto/biker'),
  (182, 'Sylveon66', 'kanto/gentleman'),
  (183, 'Gengar99', 'kanto/engineer'),
  (184, 'Nico', 'johto/silver'),
  (185, 'LUKAS', 'green'),
  (186, 'sakura', 'johto/gentleman'),
  (187, 'AceTrainer', 'johto/hiker'),
  (188, 'Hao71', 'johto/guitarist'),
  (189, 'Togepi72', 'johto/schoolgirl'),
  (190, 'Ella58', 'red'),
  (191, 'Gengar12', 'johto/fisherman'),
  (192, 'Sakura', 'green'),
  (193, 'Xin07', 'johto/super-nerd'),
  (194, 'Tom98', 'red'),
  (195, 'Hugo', 'kanto/rocker'),
  (196, 'Snorlax65', 'red'),
  (197, 'Gengar64', 'johto/fisherman'),
  (198, 'Ana1', 'johto/skier'),
  (199, 'Champion67', 'red'),
  (200, 'snorlax', 'johto/schoolgirl'),
  (201, 'Luca99', 'johto/kimono-girl'),
  (202, 'Ethan', 'kanto/twins'),
  (203, 'Mila', 'kanto/pokemaniac'),
  (204, 'Nathan44', 'kanto/ranger-m'),
  (205, 'Wei', 'kanto/youngster'),
  (206, 'kanto', 'green'),
  (207, 'Max39', 'johto/super-nerd'),
  (208, 'MEI', 'green'),
  (209, 'Kaito', 'red'),
  (210, 'Chiara', 'johto/swimmer-m'),
  (211, 'Liv2010', 'kanto/lady'),
  (212, 'Ines', 'kanto/camper'),
  (213, 'DragonTamer', 'green'),
  (214, 'Ava12', 'kanto/crush-kin'),
  (215, 'Lucia', 'green'),
  (216, 'Ana', 'red'),
  (217, 'Sylveon85', 'red'),
  (218, 'trainer', 'green'),
  (219, 'Alice', 'green'),
  (220, 'Lin', 'green'),
  (221, 'Charizard', 'red'),
  (222, 'Elena36', 'red'),
  (223, 'lena', 'red'),
  (224, 'Giulia', 'kanto/aroma-lady'),
  (225, 'Sylveon07', 'kanto/little-swimmer'),
  (226, 'Ruby', 'kanto/bug-catcher'),
  (227, 'riku', 'green'),
  (228, 'Sakura97', 'johto/biker'),
  (229, 'Luca10', 'green'),
  (230, 'Clara87', 'johto/pokefan'),
  (231, 'Adam', 'johto/gentleman'),
  (232, 'Lucas76', 'johto/firebreather'),
  (233, 'Greninja', 'johto/cyclist'),
  (234, 'Oscar16', 'red'),
  (235, 'ethan', 'red'),
  (236, 'Eva', 'kanto/biker'),
  (237, 'DRAGONTAMER', 'johto/firebreather'),
  (238, 'Ella09', 'red'),
  (239, 'Paul09', 'red'),
  (240, 'Chloe63', 'red'),
  (241, 'Maya', 'red'),
  (242, 'Tim25', 'kanto/twins'),
  (243, 'Gengar50', 'johto/skier'),
  (244, 'johto', 'kanto/biker'),
  (245, 'champion', 'kanto/aroma-lady'),
  (246, 'Hao', 'johto/lass'),
  (247, 'Gabriel1', 'kanto/hiker'),
  (248, 'kenji', 'red'),
  (249, 'Iris32', 'green'),
  (250, 'Alex37', 'johto/sage'),
  (251, 'GARCHOMP', 'johto/biker'),
  (252, 'Julia', 'green'),
  (253, 'Chiara92', 'johto/psychic-m'),
  (254, 'unova', 'johto/sage'),
  (255, 'greninja', 'kanto/psychic-m'),
  (256, 'AXEL', 'green'),
  (257, 'leo', 'red'),
  (258, 'LENA', 'red'),
  (259, 'Hina46', 'johto/picnicker'),
  (260, 'MAX', 'green'),
  (261, 'Sota', 'johto/scientist'),
  (262, 'Rocket41', 'green'),
  (263, 'Haeun95', 'red'),
  (264, 'Sinnoh13', 'red'),
  (265, 'Julia92', 'kanto/cooltrainer-m'),
  (266, 'Mewtwo71', 'kanto/picnicker'),
  (267, 'KAI', 'johto/lady'),
  (268, 'Jun2010', 'red'),
  (269, 'CLARA', 'kanto/painter'),
  (270, 'Chiara4', 'kanto/swimmer-m'),
  (271, 'Xin79', 'red'),
  (272, 'Kenji', 'red'),
  (273, 'Sam12', 'kanto/bug-catcher'),
  (274, 'Chloe94', 'kanto/aroma-lady'),
  (275, 'Jules07', 'johto/lass'),
  (276, 'Haeun47', 'red'),
  (277, 'eva', 'johto/lass'),
  (278, 'MEWTWO', 'johto/sage'),
  (279, 'Alice53', 'johto/swimmer-f'),
  (280, 'Jonas', 'red'),
  (281, 'Tim88', 'kanto/channeler'),
  (282, 'DragonTamer0', 'johto/picnicker'),
  (283, 'Chiara18', 'kanto/picnicker'),
  (284, 'Adam09', 'red'),
  (285, 'beatriz', 'red'),
  (286, 'Aoi38', 'johto/silver'),
  (287, 'Ana89', 'kanto/painter'),
  (288, 'Giulia70', 'kanto/scientist'),
  (289, 'mila', 'johto/scientist'),
  (290, 'Garchomp', 'red'),
  (291, 'julia', 'green'),
  (292, 'Hannah58', 'red'),
  (293, 'Mewtwo78', 'johto/bug-catcher'),
  (294, 'Nora11', 'red'),
  (295, 'Sakura9', 'johto/swimmer-m'),
  (296, 'hao', 'red'),
  (297, 'Ava28', 'green'),
  (298, 'Finn', 'green'),
  (299, 'Sam', 'johto/lady'),
  (300, 'Unova', 'kanto/hiker'),
  (301, 'Zoe', 'johto/schoolboy'),
  (302, 'ACETRAINER', 'kanto/lady'),
  (303, 'Eva95', 'green'),
  (304, 'Champion07', 'kanto/swimmers'),
  (305, 'lucia', 'kanto/super-nerd'),
  (306, 'Nathan', 'kanto/hiker'),
  (307, 'Lucas54', 'green'),
  (308, 'Gengar36', 'kanto/lady'),
  (309, 'Garchomp44', 'green'),
  (310, 'Adam2010', 'red'),
  (311, 'Mimikyu', 'green'),
  (312, 'Tim65', 'johto/bird-keeper'),
  (313, 'Kai27', 'johto/youngster'),
  (314, 'sora', 'green'),
  (315, 'Snorlax66', 'johto/kimono-girl'),
  (316, 'LOUISE', 'johto/bug-catcher'),
  (317, 'Matteo', 'red'),
  (318, 'Snorlax21', 'kanto/scientist'),
  (319, 'ANA', 'johto/guitarist'),
  (320, 'Louise67', 'johto/bird-keeper'),
  (321, 'Hugo18', 'johto/biker'),
  (322, 'Lina', 'red'),
  (323, 'Paul57', 'kanto/bug-catcher'),
  (324, 'Hoenn40', 'red'),
  (325, 'Axel', 'kanto/burglar'),
  (326, 'Jack60', 'johto/hiker'),
  (327, 'yui', 'kanto/psychic-m'),
  (328, 'Luca61', 'johto/black-belt'),
  (329, 'pichu', 'kanto/hiker'),
  (330, 'Lena17', 'kanto/cooltrainer-f'),
  (331, 'Lena12', 'red'),
  (332, 'DiceMaster20', 'johto/kimono-girl'),
  (333, 'Rocket95', 'johto/biker'),
  (334, 'CHLOE', 'johto/psychic-m'),
  (335, 'DiceMaster99', 'johto/kimono-girl'),
  (336, 'Blaziken09', 'johto/camper'),
  (337, 'Beatriz37', 'kanto/camper'),
  (338, 'Ines24', 'red'),
  (339, 'Hina', 'red'),
  (340, 'Gabriel2000', 'red'),
  (341, 'Mewtwo42', 'red'),
  (342, 'Diego18', 'green'),
  (343, 'Riku', 'kanto/youngster'),
  (344, 'AceTrainer6', 'johto/cyclist'),
  (345, 'Nora29', 'johto/silver'),
  (346, 'hoenn', 'kanto/super-nerd'),
  (347, 'Beatriz46', 'johto/hiker'),
  (348, 'Snorlax', 'red'),
  (349, 'Matteo25', 'green'),
  (350, 'Alex77', 'red'),
  (351, 'Garchomp7', 'green'),
  (352, 'luca', 'johto/twins'),
  (353, 'DiceMaster57', 'green'),
  (354, 'Jade24', 'johto/super-nerd'),
  (355, 'Trainer64', 'kanto/crush-kin'),
  (356, 'Javi12', 'johto/schoolgirl'),
  (357, 'MILA', 'red'),
  (358, 'Tim92', 'johto/sage'),
  (359, 'Lukas96', 'johto/bird-keeper'),
  (360, 'Ella', 'green'),
  (361, 'charizard', 'green'),
  (362, 'Mila47', 'johto/officer'),
  (363, 'GIULIA', 'kanto/cool-couple'),
  (364, 'ines', 'kanto/sis-and-bro'),
  (365, 'Leo12', 'kanto/lass'),
  (366, 'Rayquaza', 'green'),
  (367, 'UMBREON', 'green'),
  (368, 'sofia', 'johto/pokefan'),
  (369, 'Adam62', 'johto/silver'),
  (370, 'Lou19', 'johto/youngster'),
  (371, 'Iris56', 'red'),
  (372, 'Kalos20', 'red'),
  (373, 'finn', 'red'),
  (374, 'Mimikyu69', 'kanto/picnicker'),
  (375, 'Rafael2', 'kanto/pokemon-breeder'),
  (376, 'Kaito92', 'green'),
  (377, 'GABRIEL', 'green'),
  (378, 'liv', 'johto/super-nerd'),
  (379, 'Jules31', 'red'),
  (380, 'Garchomp93', 'kanto/ruin-maniac'),
  (381, 'Emma44', 'kanto/channeler'),
  (382, 'Marco4', 'johto/schoolgirl'),
  (383, 'AceTrainer20', 'kanto/youngster'),
  (384, 'Clara31', 'kanto/cooltrainer-m'),
  (385, 'Sora46', 'kanto/swimmers'),
  (386, 'Mimikyu79', 'red'),
  (387, 'Marco80', 'kanto/lady'),
  (388, 'Max10', 'red'),
  (389, 'Sota2000', 'kanto/ruin-maniac'),
  (390, 'Sinnoh65', 'red'),
  (391, 'Ethan56', 'green'),
  (392, 'Iris99', 'kanto/sis-and-bro'),
  (393, 'Garchomp34', 'kanto/rocker'),
  (394, 'Larissa90', 'red'),
  (395, 'pikafan', 'johto/gentleman'),
  (396, 'Lina10', 'kanto/lass'),
  (397, 'Theo', 'kanto/ruin-maniac'),
  (398, 'Tim09', 'green'),
  (399, 'Greninja2010', 'green'),
  (400, 'Theo12', 'johto/schoolgirl')
on conflict (id) do update set name = excluded.name, avatar = excluded.avatar;
insert into versus_league_bot_teams (id, tier, team, powers) values
  (1, 0, '[{"dex":631,"level":50,"shiny":false},{"dex":990,"level":50,"shiny":false},{"dex":593,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (2, 0, '[{"dex":567,"level":50,"shiny":false},{"dex":768,"level":50,"shiny":false},{"dex":1021,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (3, 0, '[{"dex":10251,"level":50,"shiny":false},{"dex":596,"level":50,"shiny":false},{"dex":964,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (4, 0, '[{"dex":561,"level":50,"shiny":false},{"dex":411,"level":50,"shiny":false},{"dex":841,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (5, 0, '[{"dex":254,"level":50,"shiny":false},{"dex":745,"level":50,"shiny":false},{"dex":853,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (6, 0, '[{"dex":232,"level":50,"shiny":false},{"dex":478,"level":50,"shiny":false},{"dex":586,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (7, 0, '[{"dex":623,"level":50,"shiny":false},{"dex":306,"level":50,"shiny":false},{"dex":10172,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (8, 0, '[{"dex":512,"level":50,"shiny":false},{"dex":157,"level":50,"shiny":false},{"dex":988,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (9, 0, '[{"dex":883,"level":50,"shiny":false},{"dex":923,"level":50,"shiny":false},{"dex":671,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (10, 0, '[{"dex":701,"level":50,"shiny":false},{"dex":770,"level":50,"shiny":false},{"dex":841,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (11, 0, '[{"dex":306,"level":50,"shiny":false},{"dex":1013,"level":50,"shiny":false},{"dex":954,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (12, 0, '[{"dex":539,"level":50,"shiny":false},{"dex":989,"level":50,"shiny":false},{"dex":130,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (13, 0, '[{"dex":461,"level":50,"shiny":false},{"dex":993,"level":50,"shiny":false},{"dex":567,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (14, 0, '[{"dex":68,"level":50,"shiny":false},{"dex":663,"level":50,"shiny":false},{"dex":330,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (15, 0, '[{"dex":681,"level":50,"shiny":false},{"dex":794,"level":50,"shiny":false},{"dex":103,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (16, 0, '[{"dex":576,"level":50,"shiny":false},{"dex":853,"level":50,"shiny":false},{"dex":589,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (17, 0, '[{"dex":192,"level":50,"shiny":false},{"dex":658,"level":50,"shiny":false},{"dex":683,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (18, 0, '[{"dex":10236,"level":50,"shiny":false},{"dex":900,"level":50,"shiny":false},{"dex":954,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (19, 0, '[{"dex":286,"level":50,"shiny":false},{"dex":752,"level":50,"shiny":false},{"dex":954,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (20, 0, '[{"dex":745,"level":50,"shiny":false},{"dex":31,"level":50,"shiny":false},{"dex":658,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (21, 0, '[{"dex":1020,"level":50,"shiny":false},{"dex":342,"level":50,"shiny":true},{"dex":770,"level":50,"shiny":true}]', '{"gems":[],"gmax":false,"z":false}'),
  (22, 0, '[{"dex":68,"level":50,"shiny":false},{"dex":199,"level":50,"shiny":false},{"dex":663,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (23, 0, '[{"dex":357,"level":50,"shiny":false},{"dex":478,"level":50,"shiny":false},{"dex":134,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (24, 0, '[{"dex":976,"level":50,"shiny":false},{"dex":448,"level":50,"shiny":false},{"dex":655,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (25, 0, '[{"dex":549,"level":50,"shiny":false},{"dex":306,"level":50,"shiny":false},{"dex":448,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (26, 0, '[{"dex":357,"level":50,"shiny":false},{"dex":332,"level":50,"shiny":false},{"dex":614,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (27, 0, '[{"dex":373,"level":50,"shiny":false},{"dex":883,"level":50,"shiny":false},{"dex":596,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (28, 0, '[{"dex":797,"level":50,"shiny":false},{"dex":990,"level":50,"shiny":false},{"dex":272,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (29, 0, '[{"dex":94,"level":50,"shiny":false},{"dex":362,"level":50,"shiny":false},{"dex":542,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (30, 0, '[{"dex":336,"level":50,"shiny":false},{"dex":858,"level":50,"shiny":false},{"dex":973,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (31, 0, '[{"dex":157,"level":50,"shiny":false},{"dex":466,"level":50,"shiny":false},{"dex":908,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (32, 0, '[{"dex":952,"level":50,"shiny":false},{"dex":10243,"level":50,"shiny":false},{"dex":143,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (33, 0, '[{"dex":828,"level":50,"shiny":false},{"dex":858,"level":50,"shiny":false},{"dex":730,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (34, 0, '[{"dex":10251,"level":50,"shiny":false},{"dex":934,"level":50,"shiny":false},{"dex":376,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (35, 0, '[{"dex":9,"level":50,"shiny":false},{"dex":1013,"level":50,"shiny":false},{"dex":874,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (36, 0, '[{"dex":10230,"level":50,"shiny":false},{"dex":241,"level":50,"shiny":false},{"dex":937,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (37, 0, '[{"dex":514,"level":50,"shiny":false},{"dex":841,"level":50,"shiny":false},{"dex":900,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (38, 0, '[{"dex":881,"level":50,"shiny":false},{"dex":448,"level":50,"shiny":false},{"dex":472,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (39, 0, '[{"dex":598,"level":50,"shiny":false},{"dex":362,"level":50,"shiny":false},{"dex":631,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (40, 0, '[{"dex":539,"level":50,"shiny":false},{"dex":405,"level":50,"shiny":false},{"dex":80,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":false}'),
  (1001, 1, '[{"dex":553,"level":50,"shiny":false},{"dex":430,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1002, 1, '[{"dex":461,"level":50,"shiny":false},{"dex":970,"level":50,"shiny":false},{"dex":537,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1003, 1, '[{"dex":655,"level":50,"shiny":true},{"dex":87,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1004, 1, '[{"dex":663,"level":50,"shiny":false},{"dex":740,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1005, 1, '[{"dex":873,"level":50,"shiny":false},{"dex":398,"level":50,"shiny":false},{"dex":260,"level":50,"shiny":false}]', '{"gems":["staraptite"],"gmax":false,"z":false}'),
  (1006, 1, '[{"dex":655,"level":50,"shiny":false},{"dex":76,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1007, 1, '[{"dex":567,"level":50,"shiny":false},{"dex":3,"level":50,"shiny":false},{"dex":709,"level":50,"shiny":false}]', '{"gems":["venusaurite"],"gmax":false,"z":false}'),
  (1008, 1, '[{"dex":713,"level":50,"shiny":false},{"dex":450,"level":50,"shiny":false},{"dex":675,"level":50,"shiny":true}]', '{"gems":[],"gmax":false,"z":true}'),
  (1009, 1, '[{"dex":841,"level":50,"shiny":false},{"dex":76,"level":50,"shiny":false},{"dex":834,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1010, 1, '[{"dex":873,"level":50,"shiny":false},{"dex":518,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":false,"z":false}'),
  (1011, 1, '[{"dex":472,"level":50,"shiny":false},{"dex":986,"level":50,"shiny":true},{"dex":334,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":false,"z":false}'),
  (1012, 1, '[{"dex":914,"level":50,"shiny":false},{"dex":984,"level":50,"shiny":false},{"dex":851,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1013, 1, '[{"dex":567,"level":50,"shiny":false},{"dex":983,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1014, 1, '[{"dex":970,"level":50,"shiny":false},{"dex":10180,"level":50,"shiny":false},{"dex":675,"level":50,"shiny":false}]', '{"gems":["glimmoranite"],"gmax":false,"z":false}'),
  (1015, 1, '[{"dex":553,"level":50,"shiny":false},{"dex":879,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1016, 1, '[{"dex":849,"level":50,"shiny":false},{"dex":257,"level":50,"shiny":false},{"dex":861,"level":50,"shiny":false}]', '{"gems":["blazikenite"],"gmax":false,"z":false}'),
  (1017, 1, '[{"dex":466,"level":50,"shiny":false},{"dex":346,"level":50,"shiny":false},{"dex":861,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1018, 1, '[{"dex":930,"level":50,"shiny":false},{"dex":740,"level":50,"shiny":true},{"dex":537,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1019, 1, '[{"dex":208,"level":50,"shiny":false},{"dex":10244,"level":50,"shiny":true},{"dex":460,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1020, 1, '[{"dex":866,"level":50,"shiny":false},{"dex":668,"level":50,"shiny":false},{"dex":435,"level":50,"shiny":false}]', '{"gems":["pyroarite"],"gmax":false,"z":false}'),
  (1021, 1, '[{"dex":581,"level":50,"shiny":false},{"dex":76,"level":50,"shiny":false},{"dex":248,"level":50,"shiny":false}]', '{"gems":["tyranitarite"],"gmax":false,"z":false}'),
  (1022, 1, '[{"dex":655,"level":50,"shiny":false},{"dex":986,"level":50,"shiny":false},{"dex":861,"level":50,"shiny":false}]', '{"gems":["delphoxite"],"gmax":false,"z":false}'),
  (1023, 1, '[{"dex":663,"level":50,"shiny":false},{"dex":330,"level":50,"shiny":false},{"dex":861,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1024, 1, '[{"dex":593,"level":50,"shiny":false},{"dex":10111,"level":50,"shiny":false},{"dex":398,"level":50,"shiny":false}]', '{"gems":["staraptite"],"gmax":false,"z":false}'),
  (1025, 1, '[{"dex":317,"level":50,"shiny":false},{"dex":6,"level":50,"shiny":false},{"dex":275,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1026, 1, '[{"dex":229,"level":50,"shiny":false},{"dex":652,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":false,"z":false}'),
  (1027, 1, '[{"dex":376,"level":50,"shiny":false},{"dex":914,"level":50,"shiny":false},{"dex":851,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1028, 1, '[{"dex":637,"level":50,"shiny":false},{"dex":834,"level":50,"shiny":false},{"dex":460,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1029, 1, '[{"dex":462,"level":50,"shiny":false},{"dex":389,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":true}]', '{"gems":["altarianite"],"gmax":false,"z":false}'),
  (1030, 1, '[{"dex":478,"level":50,"shiny":false},{"dex":959,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":false,"z":false}'),
  (1031, 1, '[{"dex":205,"level":50,"shiny":false},{"dex":469,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1032, 1, '[{"dex":920,"level":50,"shiny":false},{"dex":369,"level":50,"shiny":true},{"dex":398,"level":50,"shiny":false}]', '{"gems":["staraptite"],"gmax":false,"z":false}'),
  (1033, 1, '[{"dex":914,"level":50,"shiny":false},{"dex":823,"level":50,"shiny":false},{"dex":260,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1034, 1, '[{"dex":555,"level":50,"shiny":false},{"dex":687,"level":50,"shiny":false},{"dex":1018,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1035, 1, '[{"dex":208,"level":50,"shiny":false},{"dex":10244,"level":50,"shiny":false},{"dex":628,"level":50,"shiny":false}]', '{"gems":[],"gmax":false,"z":true}'),
  (1036, 1, '[{"dex":6,"level":50,"shiny":false},{"dex":687,"level":50,"shiny":false},{"dex":984,"level":50,"shiny":false}]', '{"gems":["charizardite-x"],"gmax":false,"z":false}'),
  (1037, 1, '[{"dex":1000,"level":50,"shiny":false},{"dex":460,"level":50,"shiny":false},{"dex":537,"level":50,"shiny":true}]', '{"gems":["abomasite"],"gmax":false,"z":false}'),
  (1038, 1, '[{"dex":542,"level":50,"shiny":false},{"dex":6,"level":50,"shiny":false},{"dex":903,"level":50,"shiny":false}]', '{"gems":["charizardite-x"],"gmax":false,"z":false}'),
  (1039, 1, '[{"dex":461,"level":50,"shiny":false},{"dex":903,"level":50,"shiny":false},{"dex":839,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":false}'),
  (1040, 1, '[{"dex":461,"level":50,"shiny":false},{"dex":6,"level":50,"shiny":false},{"dex":879,"level":50,"shiny":false}]', '{"gems":["charizardite-x"],"gmax":false,"z":false}'),
  (2001, 2, '[{"dex":460,"level":50,"shiny":false},{"dex":740,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["abomasite"],"gmax":false,"z":true}'),
  (2002, 2, '[{"dex":740,"level":50,"shiny":false},{"dex":823,"level":50,"shiny":false},{"dex":901,"level":50,"shiny":false}]', '{"gems":["crabominite"],"gmax":false,"z":true}'),
  (2003, 2, '[{"dex":553,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2004, 2, '[{"dex":10244,"level":50,"shiny":false},{"dex":553,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2005, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["chesnaughtite"],"gmax":false,"z":true}'),
  (2006, 2, '[{"dex":389,"level":50,"shiny":false},{"dex":248,"level":50,"shiny":false},{"dex":10240,"level":50,"shiny":false}]', '{"gems":["tyranitarite"],"gmax":false,"z":true}'),
  (2007, 2, '[{"dex":10244,"level":50,"shiny":false},{"dex":430,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2008, 2, '[{"dex":675,"level":50,"shiny":false},{"dex":1019,"level":50,"shiny":false},{"dex":839,"level":50,"shiny":true}]', '{"gems":[],"gmax":true,"z":true}'),
  (2009, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":553,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["chesnaughtite"],"gmax":true,"z":false}'),
  (2010, 2, '[{"dex":984,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":false,"z":true}'),
  (2011, 2, '[{"dex":10244,"level":50,"shiny":false},{"dex":839,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2012, 2, '[{"dex":652,"level":50,"shiny":true},{"dex":861,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["chesnaughtite"],"gmax":true,"z":false}'),
  (2013, 2, '[{"dex":500,"level":50,"shiny":false},{"dex":340,"level":50,"shiny":false},{"dex":975,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":false,"z":true}'),
  (2014, 2, '[{"dex":687,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":false}'),
  (2015, 2, '[{"dex":260,"level":50,"shiny":false},{"dex":435,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":false,"z":true}'),
  (2016, 2, '[{"dex":460,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":true},{"dex":426,"level":50,"shiny":false}]', '{"gems":["abomasite"],"gmax":false,"z":true}'),
  (2017, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":911,"level":50,"shiny":false},{"dex":699,"level":50,"shiny":false}]', '{"gems":["chesnaughtite"],"gmax":false,"z":true}'),
  (2018, 2, '[{"dex":985,"level":50,"shiny":false},{"dex":727,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2019, 2, '[{"dex":334,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":false}'),
  (2020, 2, '[{"dex":435,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2021, 2, '[{"dex":652,"level":50,"shiny":true},{"dex":839,"level":50,"shiny":false},{"dex":473,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2022, 2, '[{"dex":460,"level":50,"shiny":false},{"dex":248,"level":50,"shiny":false},{"dex":473,"level":50,"shiny":false}]', '{"gems":["abomasite"],"gmax":false,"z":true}'),
  (2023, 2, '[{"dex":430,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":false}'),
  (2024, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":false},{"dex":464,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":false,"z":true}'),
  (2025, 2, '[{"dex":984,"level":50,"shiny":false},{"dex":248,"level":50,"shiny":false},{"dex":839,"level":50,"shiny":false}]', '{"gems":["tyranitarite"],"gmax":true,"z":false}'),
  (2026, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":248,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["chesnaughtite"],"gmax":true,"z":false}'),
  (2027, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":248,"level":50,"shiny":false},{"dex":839,"level":50,"shiny":false}]', '{"gems":["tyranitarite"],"gmax":true,"z":false}'),
  (2028, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":10240,"level":50,"shiny":false},{"dex":473,"level":50,"shiny":false}]', '{"gems":["chesnaughtite"],"gmax":false,"z":true}'),
  (2029, 2, '[{"dex":460,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":true}]', '{"gems":["abomasite"],"gmax":false,"z":true}'),
  (2030, 2, '[{"dex":460,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":902,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":false,"z":true}'),
  (2031, 2, '[{"dex":460,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["abomasite"],"gmax":true,"z":false}'),
  (2032, 2, '[{"dex":652,"level":50,"shiny":false},{"dex":260,"level":50,"shiny":true},{"dex":334,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":false,"z":true}'),
  (2033, 2, '[{"dex":260,"level":50,"shiny":false},{"dex":699,"level":50,"shiny":true},{"dex":992,"level":50,"shiny":false}]', '{"gems":["swampertite"],"gmax":false,"z":true}'),
  (2034, 2, '[{"dex":389,"level":50,"shiny":false},{"dex":740,"level":50,"shiny":false},{"dex":248,"level":50,"shiny":false}]', '{"gems":["crabominite"],"gmax":false,"z":true}'),
  (2035, 2, '[{"dex":553,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2036, 2, '[{"dex":986,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":839,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":false}'),
  (2037, 2, '[{"dex":500,"level":50,"shiny":true},{"dex":131,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":false}'),
  (2038, 2, '[{"dex":727,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":901,"level":50,"shiny":false}]', '{"gems":[],"gmax":true,"z":true}'),
  (2039, 2, '[{"dex":740,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":630,"level":50,"shiny":false}]', '{"gems":["crabominite"],"gmax":true,"z":false}'),
  (2040, 2, '[{"dex":1000,"level":50,"shiny":false},{"dex":740,"level":50,"shiny":false},{"dex":423,"level":50,"shiny":false}]', '{"gems":["crabominite"],"gmax":false,"z":true}'),
  (3001, 3, '[{"dex":430,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3002, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":464,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3003, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3004, 3, '[{"dex":1003,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3005, 3, '[{"dex":861,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3006, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":340,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3007, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3008, 3, '[{"dex":675,"level":50,"shiny":false},{"dex":384,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3009, 3, '[{"dex":530,"level":50,"shiny":true},{"dex":842,"level":50,"shiny":false},{"dex":717,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3010, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":473,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3011, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3012, 3, '[{"dex":248,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3013, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3014, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3015, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":699,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3016, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3017, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":717,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3018, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false},{"dex":792,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3019, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":717,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3020, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":171,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3021, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":791,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3022, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":340,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3023, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":true},{"dex":975,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3024, 3, '[{"dex":675,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3025, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3026, 3, '[{"dex":553,"level":50,"shiny":false},{"dex":384,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3027, 3, '[{"dex":248,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3028, 3, '[{"dex":1003,"level":50,"shiny":false},{"dex":384,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3029, 3, '[{"dex":500,"level":50,"shiny":true},{"dex":131,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3030, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3031, 3, '[{"dex":334,"level":50,"shiny":true},{"dex":842,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3032, 3, '[{"dex":248,"level":50,"shiny":false},{"dex":384,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3033, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3034, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":473,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3035, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":473,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3036, 3, '[{"dex":530,"level":50,"shiny":true},{"dex":979,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3037, 3, '[{"dex":389,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3038, 3, '[{"dex":1003,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3039, 3, '[{"dex":1003,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3040, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":791,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}')
on conflict (id) do update set tier = excluded.tier, team = excluded.team, powers = excluded.powers;
-- END GENERATED BOTS
