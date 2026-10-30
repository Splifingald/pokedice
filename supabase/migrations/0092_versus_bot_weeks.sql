-- The Versus league's bots get new teams every week (docs/44 §9, the user's ask, 2026-10-30). Each week has a set of
-- its own, drawn by the engine on that week's seeds (engine/versusLeague.ts weekBotTeams: 40 teams a tier, 80 from 500
-- trophies) and stored here by the hourly job (netlify/functions/versus-bots.mts) or the admin's button. A week whose
-- set isn't made yet takes its bots' teams from the latest set made before it, else from the built-in set, written at
-- the end of this file (`pnpm versus-bots` writes it here now, in place of 0082's, with the last tier's 80).
--
-- A seated bot keeps the team it was seated with: a week's set is stored once and never replaced, and an old set goes
-- only once no seated bot of it is left.
--
-- Run after 0082 (and 0086, 0091); safe to run again.

-- ---------------------------------------------------------------- the sets

alter table versus_league_bot_teams add column if not exists week date;  -- null: the built-in set
alter table versus_league_bot_teams add column if not exists made_at timestamptz not null default now();
-- A week's teams take their ids from here, past the built-in set's (1 to 3080).
create sequence if not exists versus_league_bot_teams_id_seq start with 1000001 owned by versus_league_bot_teams.id;
alter table versus_league_bot_teams alter column id set default nextval('versus_league_bot_teams_id_seq');
create index if not exists versus_league_bot_teams_week on versus_league_bot_teams (week, tier);

-- The set a week's bots take their teams from: its own, else the latest made before it; null for the built-in set.
create or replace function versus_league_team_set(p_week date)
returns date
language sql stable security definer set search_path = public as $$
  select max(week) from versus_league_bot_teams where week <= p_week
$$;

-- A random team of this tier from the week's set (from the built-in set if that set has none of the tier).
create or replace function versus_league_bot_team(p_week date, p_tier int)
returns int
language sql security definer set search_path = public as $$
  with s as (select versus_league_team_set(p_week) as w)
  select t.id from versus_league_bot_teams t, s
  where t.tier = p_tier and (t.week is not distinct from s.w or t.week is null)
  order by (t.week is not distinct from s.w) desc, random()
  limit 1
$$;

-- ---------------------------------------------------------------- the bots take their teams from it

-- One opponent for a free slot: a player with a Versus team, or a seated bot, whose trophies this week are within range
-- and who isn't offered already nor among the last 10 fought; else a bot made for the player's level, its team from
-- the week's set. (0082's, but for where that team comes from.)
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
  pick int;
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
  -- Drawn once, before the read: a random pick inside its where would be drawn again for every row.
  pick := versus_league_bot_team(p_week, versus_league_tier(mine, cfg));
  select * into bt from versus_league_bot_teams where id = pick;
  if fb is null or bt is null then return; end if;
  insert into versus_league_choices (user_id, slot, week, foe_bot, foe_name, foe_avatar, foe_team, foe_powers,
                                     foe_trophies)
  select p_user, p_slot, p_week, fb, b.name, b.avatar, bt.team, bt.powers, greatest(lo, mine - r + floor(random() * (2 * r + 1))::int)
  from versus_league_bots b where b.id = fb;
end
$$;

-- Bots take the empty places of the week's groups: up to `botsPerDay` a group with room. Each one's trophies are headed
-- for a believable place among the group's players (a player's, projected to Sunday, from ×0.6 to ×1.25), its team of
-- the tier for that, from the week's set. (0082's, but for where that team comes from.)
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
      team := versus_league_bot_team(p_week, versus_league_tier(target, cfg));
      exit when bot is null or team is null;
      insert into versus_league_members (week, group_id, bot_id, bot_team, bot_target) values (p_week, g.id, bot, team, target);
      seated := seated + 1;
    end loop;
  end loop;
  return seated;
end
$$;

-- ---------------------------------------------------------------- making a week's set

-- Who makes the sets: the hourly job, signed in with the service role key, or the admin.
create or replace function versus_league_bot_maker()
returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- Where a week's bot teams stand (this week's by default), for the job and the admin's box: the set its bots take
-- teams from (null: the built-in one), when it was made, its teams a tier, and whether the week still needs its own
-- (the league not Off, and no set of the week's yet).
create or replace function versus_league_bot_set(p_week date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  wk date := coalesce(p_week, versus_league_week());
  s date;
begin
  if not versus_league_bot_maker() then raise exception 'not_admin' using errcode = '42501'; end if;
  s := versus_league_team_set(wk);
  return jsonb_build_object(
    'week', wk,
    'set', s,
    'madeAt', (select min(made_at) from versus_league_bot_teams where week is not distinct from s),
    'tiers', (select coalesce(jsonb_agg(x.n order by x.tier), '[]'::jsonb)
              from (select tier, count(*) n from versus_league_bot_teams where week is not distinct from s group by tier) x),
    'due', coalesce(versus_league_cfg() ->> 'access', 'off') <> 'off' and s is distinct from wk
  );
end
$$;

-- A week's set, as the engine drew it ([{tier, team, powers}], every tier): stored once. A week that has its set
-- already keeps it (its seated bots never change team) and the answer is 0; else the teams stored. Sets over 4 weeks
-- older than this one go, but for the teams bots were seated with (their week's board still shows them).
create or replace function versus_league_put_bot_teams(p_week date, p_teams jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not versus_league_bot_maker() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_week is null or extract(isodow from p_week) <> 1 then raise exception 'bad_week' using errcode = '22023'; end if;
  if coalesce(jsonb_typeof(p_teams), '') <> 'array'
     or exists (select 1 from jsonb_array_elements(p_teams) t
                where coalesce(t ->> 'tier', '') !~ '^[0-3]$'
                   or (case when jsonb_typeof(t -> 'team') = 'array' then jsonb_array_length(t -> 'team') end)
                      is distinct from 3
                   or coalesce(jsonb_typeof(t -> 'powers'), '') <> 'object')
     or (select count(distinct t ->> 'tier') from jsonb_array_elements(p_teams) t) <> 4 then
    raise exception 'bad_teams' using errcode = '22023';
  end if;
  -- Two makers at once (the job and the admin's button) store one set.
  perform pg_advisory_xact_lock(hashtext('pokedice.versus_league_bot_teams'));
  if exists (select 1 from versus_league_bot_teams where week = p_week) then return 0; end if;
  insert into versus_league_bot_teams (tier, team, powers, week)
  select (t ->> 'tier')::int, t -> 'team', t -> 'powers', p_week from jsonb_array_elements(p_teams) t;
  get diagnostics n = row_count;
  delete from versus_league_bot_teams b
  where b.week < p_week - 28 and not exists (select 1 from versus_league_members m where m.bot_team = b.id);
  return n;
end
$$;

-- ---------------------------------------------------------------- grants

-- Supabase grants every new function to anon and authenticated by default: taken back here, then given as needed.
revoke all on function versus_league_team_set(date), versus_league_bot_team(date, int), versus_league_bot_maker(),
  versus_league_bot_set(date), versus_league_put_bot_teams(date, jsonb)
  from public, anon, authenticated;
grant execute on function versus_league_bot_set(date), versus_league_put_bot_teams(date, jsonb) to authenticated;
-- The job signs in with the service role key (Supabase has the role; a bare Postgres in the tests may not).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function versus_league_bot_set(date), versus_league_put_bot_teams(date, jsonb) to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------- the built-in set, and the bots' names
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
  (3040, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":791,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3041, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3042, 3, '[{"dex":1003,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3043, 3, '[{"dex":500,"level":50,"shiny":true},{"dex":842,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3044, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3045, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3046, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false},{"dex":975,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3047, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3048, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":760,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3049, 3, '[{"dex":389,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3050, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false},{"dex":792,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3051, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3052, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":464,"level":50,"shiny":true}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3053, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3054, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3055, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":297,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3056, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":true},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3057, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false},{"dex":791,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3058, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":297,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3059, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":340,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3060, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":717,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3061, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":423,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3062, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3063, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3064, 3, '[{"dex":553,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3065, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false},{"dex":426,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3066, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":340,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3067, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3068, 3, '[{"dex":553,"level":50,"shiny":false},{"dex":384,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3069, 3, '[{"dex":430,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3070, 3, '[{"dex":248,"level":50,"shiny":false},{"dex":500,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3071, 3, '[{"dex":500,"level":50,"shiny":false},{"dex":171,"level":50,"shiny":true},{"dex":809,"level":50,"shiny":false}]', '{"gems":["emboarite"],"gmax":true,"z":true}'),
  (3072, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":630,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3073, 3, '[{"dex":334,"level":50,"shiny":false},{"dex":760,"level":50,"shiny":true},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3074, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":979,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3075, 3, '[{"dex":530,"level":50,"shiny":false},{"dex":809,"level":50,"shiny":false},{"dex":975,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}'),
  (3076, 3, '[{"dex":675,"level":50,"shiny":false},{"dex":334,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["altarianite"],"gmax":true,"z":true}'),
  (3077, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false},{"dex":131,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3078, 3, '[{"dex":384,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false},{"dex":992,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3079, 3, '[{"dex":675,"level":50,"shiny":false},{"dex":384,"level":50,"shiny":true},{"dex":842,"level":50,"shiny":false}]', '{"gems":["meteorite"],"gmax":true,"z":true}'),
  (3080, 3, '[{"dex":911,"level":50,"shiny":false},{"dex":530,"level":50,"shiny":false},{"dex":842,"level":50,"shiny":false}]', '{"gems":["excadrite"],"gmax":true,"z":true}')
on conflict (id) do update set tier = excluded.tier, team = excluded.team, powers = excluded.powers;
-- END GENERATED BOTS
