-- General upgrades (docs/25): the Upgrades screen's third tab (Capture Luck, offline earnings, "I am just rich"), and
-- two new items, the Link Cable and the Bait. The game decides all of it and keeps it in the save
-- (src/engine/general.ts); the server holds the admin's switches and shows other players one thing: a trainer who
-- bought "I am just rich" (`save.general.rich`) has a golden name wherever others see it.
--
-- 1. game_config `itemSwitches` (each item Off / On for admin / On for everyone) and `general` (the switch and the
--    numbers), off by default (docs/15 §20) and inserted only if missing, so seeding never clobbers the admin's. The two
--    items, for a database that hasn't run seed.sql since they were added.
-- 2. general_cfg() and general_open(): the switch as the server reads it, like trade_open (0044).
-- 3. player_cards.rich: the card writer (0040's) also keeps the flag, from the save. A card takes it on the player's
--    next upload: nobody holds it before this runs (the switch is off).
-- 4. player_rich(user): a trainer's golden name as the caller may see it. While the switch is off for the caller, every
--    name is plain.
-- 5. Every list of other trainers says so: a last `rich` column on leaderboard, versus_board, friend_list,
--    friend_profile, friend_day_cares, raid_friend_teams and raid_progress_friend_teams (last, so a client reading by
--    position keeps working; the game reads it by name). A new return type can't be `create or replace`d: each is
--    dropped and made again, with the grants it had.
-- 6. The jsonb ones: `rich` in friend_status's new friends and in trade_row, `withRich` next to trade_mine's and
--    trade_take's `with`.
--
-- Run after 0047; safe to run again. seed.sql inlines it last (scripts/seed.ts), after the files whose functions it
-- redefines (0039, 0040, 0044, 0045); those drop the seven functions above before making them, so a seed re-run over
-- this file's versions works.

-- ---------------------------------------------------------------- 1. the switches and the items

-- The game's defaults (engine/defaults.ts; tests/general-sql.test.ts keeps the two the same).
insert into game_config (key, value) values
  ('itemSwitches', '{"link-cable": "off", "bait": "off"}'::jsonb),
  ('general', '{
    "access": "off",
    "luck": [{"chance": 10, "cost": 1000}, {"chance": 20, "cost": 1800}, {"chance": 30, "cost": 2800},
             {"chance": 40, "cost": 4000}, {"chance": 50, "cost": 5500}, {"chance": 60, "cost": 7200},
             {"chance": 70, "cost": 9200}, {"chance": 80, "cost": 11500}, {"chance": 90, "cost": 14000},
             {"chance": 100, "cost": 17000}],
    "offline": [{"perHour": 2, "cost": 800}, {"perHour": 4, "cost": 1400}, {"perHour": 6, "cost": 2100},
                {"perHour": 8, "cost": 3000}, {"perHour": 10, "cost": 4000}, {"perHour": 12, "cost": 5200},
                {"perHour": 14, "cost": 6600}, {"perHour": 16, "cost": 8200}, {"perHour": 18, "cost": 10000},
                {"perHour": 20, "cost": 12000}],
    "offlineMaxHours": 24, "richCost": 99999
  }'::jsonb)
on conflict (key) do nothing;

-- As src/data/items.json has them (the test keeps the two the same). Left alone if there: seed.sql writes them too.
insert into items (key, name, description, sprite_url, price, effect, in_shop, shop_badges) values
  ('link-cable', 'Link Cable', 'Evolves a Pokémon that only evolves by trade, with no trade needed. Use it from the Team screen.',
   '/items/link-cable.png', 1000, '{"kind":"link"}'::jsonb, false, 0),
  ('bait', 'Bait', 'When a ball falls just short, throw it: its die (1, 1, 1, 2, 2 or 3) adds to the catch.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/razz-berry.png', 150,
   '{"kind":"bait","faces":[1,1,1,2,2,3]}'::jsonb, true, 7)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- 2. the switch

-- The admin's row over the defaults. The server reads only the switch: the numbers are the game's.
create or replace function general_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{"access": "off"}'::jsonb
         || coalesce((select value from game_config where key = 'general' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- The switch, as trade_open reads its own: on for everyone, or for the admin only. The row read once, and never null:
-- an odd `access` is off.
create or replace function general_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce(general_cfg() ->> 'access', 'off') a) x
$$;

-- ---------------------------------------------------------------- 3. the card keeps the flag

alter table player_cards add column if not exists rich boolean not null default false;

-- 0040's card, and "I am just rich".
create or replace function player_card_write(p_user uuid, p_data jsonb, p_at timestamptz, p_realm text default 'main')
returns void
language plpgsql security definer set search_path = public as $$
declare
  -- The save, unpacked: `|| '{}'` hands back the decompressed value (an empty object adds nothing), so the reads below
  -- don't each fetch and decompress the stored one.
  d jsonb := p_data || '{}'::jsonb;
  live text := coalesce(nullif(d ->> 'region', ''), 'kanto');
  badge_ids text[];
  slots int;
begin
  select coalesce(array_agg(t.id::text), '{}') into badge_ids from trainers t where coalesce(t.badge, '') <> '';
  select coalesce((select greatest(0, (value ->> 'slots')::int) from game_config where key = 'dayCare'), 2) into slots;

  insert into player_cards as c (user_id, realm, name, avatar, region, area_id, updated_at, day_care, rich)
  values (
    p_user,
    p_realm,
    left(coalesce(nullif(trim(d -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    left(coalesce(d -> 'player' ->> 'avatar', d -> 'player' ->> 'character', 'red'), 40),
    live,
    d ->> 'currentAreaId',
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
        from jsonb_array_elements(coalesce(d -> 'dayCare' -> 'residents', '[]')) with ordinality dc(r, ord)
        order by coalesce((r ->> 'since')::numeric, 0), ord
        limit slots
      ) oldest
    ), '[]'),
    -- Only a JSON true: a cast of whatever else a save might hold could fail, and the trigger would lose the whole card.
    coalesce((d -> 'general' -> 'rich') = 'true'::jsonb, false)
  )
  on conflict (user_id, realm) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    region = excluded.region,
    area_id = excluded.area_id,
    updated_at = excluded.updated_at,
    day_care = excluded.day_care,
    rich = excluded.rich;

  -- Regions the save no longer holds; the others are written below only where they changed.
  delete from player_card_regions r
  where r.user_id = p_user and r.realm = p_realm
    and r.region <> live and not (coalesce(d -> 'parked', '{}') ? r.region);

  with dc as (
    select coalesce(nullif(r ->> 'region', ''), live) as region, r
    from jsonb_array_elements(coalesce(d -> 'dayCare' -> 'residents', '[]')) r
    union all
    select k.key, r
    from jsonb_each(coalesce(d -> 'parked', '{}')) k(key, value),
      jsonb_array_elements(coalesce(k.value -> 'dayCare' -> 'residents', '[]')) r
    where k.key <> live
  )
  insert into player_card_regions as c (user_id, realm, region, team, pokedex, max_level, shinies, progress, badges, endgame)
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
      coalesce((select max((dc.r -> 'inst' ->> 'level')::int) from dc where dc.region = b.region), 0)
    ),
    (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m
      where coalesce((m ->> 'shiny')::boolean, false))
    + (select count(*)::int from dc where dc.region = b.region and coalesce((dc.r -> 'inst' ->> 'shiny')::boolean, false)),
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
    select live as region, d as block
    union all
    select k.key, k.value from jsonb_each(coalesce(d -> 'parked', '{}')) k(key, value) where k.key <> live
  ) b
  on conflict (user_id, realm, region) do update set
    team = excluded.team,
    pokedex = excluded.pokedex,
    max_level = excluded.max_level,
    shinies = excluded.shinies,
    progress = excluded.progress,
    badges = excluded.badges,
    endgame = excluded.endgame
  where (c.team, c.pokedex, c.max_level, c.shinies, c.progress, c.badges, c.endgame)
    is distinct from (excluded.team, excluded.pokedex, excluded.max_level, excluded.shinies, excluded.progress, excluded.badges, excluded.endgame);
end
$$;
revoke all on function player_card_write(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. the golden name

-- Bought in any of the trainer's saves (each save buys its own), shown only while the switch is on for the caller: off,
-- or on for the admin alone, everyone else sees every name plain. The card first: it runs for every row of a board, and
-- the switch's two nested calls on each of 3,000 leaderboard rows made it 18 times slower (12 ms to 220 ms, measured on
-- Postgres 16); asked only for the few golden trainers, it adds about 14 ms.
create or replace function player_rich(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from player_cards c where c.user_id = p_user and c.rich) and general_open()
$$;

-- ---------------------------------------------------------------- 5. the boards and lists, with a last `rich` column

-- 0039's, each row's trainer from their card.
drop function if exists leaderboard(text);
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
  raids_won int,
  rich boolean
)
language sql stable security definer set search_path = public as $$
  select r.region, r.user_id = auth.uid(), c.name, c.avatar, r.team, r.pokedex, r.max_level, r.shinies, r.progress,
         m.id is not null, m.id, coalesce(e.raids_won, 0), player_rich(c.user_id)
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

-- 0039's. Versus (0018) is optional on a database that only ran seed.sql: made only when its tables are there.
drop function if exists versus_board(text);
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
      beaten boolean,
      rich boolean
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
        ),
        player_rich(v.user_id)
      from versus_teams v
      left join player_cards c on c.user_id = v.user_id and c.realm = v.realm
      where v.realm = p_realm
      order by v.updated_at desc
      limit 1000
    $body$
  $ddl$;
end
$do$;

-- 0039's Friends page.
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
  in_realm boolean,
  rich boolean
)
language sql stable security definer set search_path = public as $$
  select m.id, coalesce(c.name, cm.name, 'Trainer'), coalesce(c.avatar, cm.avatar, 'red'), c.region, c.area_id,
         coalesce(r.max_level, 0), coalesce(r.team, '[]'), m.since, c.updated_at, not m.seen, c.user_id is not null,
         player_rich(m.id)
  from friend_ids_of(auth.uid()) m
  left join player_cards c on c.user_id = m.id and c.realm = p_realm
  left join player_cards cm on cm.user_id = m.id and cm.realm = 'main'
  left join player_card_regions r on r.user_id = m.id and r.realm = p_realm and r.region = c.region
  order by (not m.seen) desc, (c.user_id is not null) desc, c.updated_at desc nulls last
$$;

-- 0039's friend card.
drop function if exists friend_profile(uuid, text);
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
  in_realm boolean,
  rich boolean
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
      c.user_id is not null,
      player_rich(p_friend)
    from (select 1) one
    left join player_cards c on c.user_id = p_friend and c.realm = p_realm
    left join player_cards cm on cm.user_id = p_friend and cm.realm = 'main';
end
$$;

-- 0039's Day Care visitors.
drop function if exists friend_day_cares(text);
create or replace function friend_day_cares(p_realm text default 'main')
returns table (owner uuid, name text, avatar text, day_care jsonb, rich boolean)
language sql stable security definer set search_path = public as $$
  select c.user_id, c.name, c.avatar, c.day_care, player_rich(c.user_id)
  from friend_ids_of(auth.uid()) f
  join player_cards c on c.user_id = f.id and c.realm = p_realm
  where jsonb_array_length(c.day_care) > 0
$$;

-- 0039's friends with a team on the day's raid.
drop function if exists raid_friend_teams(text);
create or replace function raid_friend_teams(p_realm text default 'main')
returns table (user_id uuid, name text, avatar text, team jsonb, helped int, rich boolean)
language sql stable security definer set search_path = public as $$
  select t.user_id,
         left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
         coalesce(s.data -> 'player' ->> 'avatar', s.data -> 'player' ->> 'character', 'red'),
         t.team,
         (select count(*)::int from raid_gifts g
           where g.realm = p_realm and g.helper_id = t.user_id and g.raider_id = auth.uid()),
         player_rich(t.user_id)
  from friend_ids_of(auth.uid()) f
  join raid_teams t on t.user_id = f.id and t.realm = p_realm
  left join saves s on s.user_id = t.user_id and s.realm = p_realm
  order by t.updated_at desc
$$;

-- 0045's friends with a team left on a progression raid.
drop function if exists raid_progress_friend_teams(text, text);
create or replace function raid_progress_friend_teams(p_key text, p_realm text default 'main')
returns table (user_id uuid, name text, avatar text, team jsonb, helped int, rich boolean)
language sql stable security definer set search_path = public as $$
  select t.user_id,
         left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
         coalesce(s.data -> 'player' ->> 'avatar', s.data -> 'player' ->> 'character', 'red'),
         t.team,
         (select count(*)::int from raid_gifts g
           where g.realm = p_realm and g.helper_id = t.user_id and g.raider_id = auth.uid()),
         player_rich(t.user_id)
  from friend_ids_of(auth.uid()) f
  join raid_progress_teams t on t.user_id = f.id and t.realm = p_realm and t.raid_key = p_key
  left join saves s on s.user_id = t.user_id and s.realm = p_realm
  order by t.updated_at desc
$$;

-- ---------------------------------------------------------------- 6. the jsonb ones, same signatures

-- 0039's: the new friends' toast and dots.
create or replace function friend_status(p_realm text default 'main')
returns table (ids uuid[], unseen jsonb)
language sql stable security definer set search_path = public as $$
  select
    coalesce(array_agg(m.id), '{}'),
    coalesce(
      jsonb_agg(jsonb_build_object('id', m.id, 'name', coalesce(c.name, cm.name, 'Trainer'), 'avatar', coalesce(c.avatar, cm.avatar, 'red'),
                                   'rich', player_rich(m.id)))
        filter (where not m.seen),
      '[]'
    )
  from friend_ids_of(auth.uid()) m
  left join player_cards c on c.user_id = m.id and c.realm = p_realm
  left join player_cards cm on cm.user_id = m.id and cm.realm = 'main'
$$;

-- 0044's: one listing as the board, a link and the poster's own list read it.
create or replace function trade_row(l trade_listings, p_me uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'owner', l.owner,
    'name', coalesce(trade_name(l.owner), l.owner_name, ''),
    'avatar', (select c.avatar from player_cards c where c.user_id = l.owner and c.realm = 'main'),
    'rich', player_rich(l.owner),
    'is_me', p_me is not null and l.owner = p_me,
    'is_friend', p_me is not null and exists (select 1 from friend_ids_of(p_me) f where f.id = l.owner),
    'dex', l.dex, 'level', l.level, 'shiny', l.shiny, 'home_region', l.home_region,
    'want', l.want, 'visibility', l.visibility, 'created_at', l.created_at, 'ends_at', l.ends_at, 'status', l.status,
    -- What "any I don't own" is checked against, and the regions the poster can receive from.
    'poster', jsonb_build_object(
      'regions', coalesce(l.poster -> 'regions', '[]'),
      'has', case when l.want ->> 'kind' = 'notOwned' then l.poster -> 'has' end,
      'forms', case when l.want ->> 'kind' = 'notOwned' then l.poster -> 'forms' end,
      'shiny', case when l.want ->> 'kind' = 'notOwned' then l.poster -> 'shiny' end))
$$;

-- 0044's: the poster's name comes back golden too.
create or replace function trade_take(p_code text, p_inst text, p_realm text default 'main')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := trade_cfg();
  l trade_listings;
  save jsonb;
  hit record;
  gdex int;
  gshiny boolean;
  today timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' then raise exception 'trades_realm'; end if;
  if not trade_open() then raise exception 'trades_off'; end if;
  if trade_badges(me) < coalesce((cfg ->> 'minBadges')::int, 0) then raise exception 'trades_badges'; end if;

  select * into l from trade_listings t where t.code = friend_norm(p_code) for update;
  if not found or l.status <> 'open' or l.ends_at <= now() then raise exception 'trades_gone'; end if;
  if l.owner = me then raise exception 'trades_own'; end if;
  if l.visibility = 'friends' and not exists (select 1 from friend_ids_of(me) f where f.id = l.owner) then
    raise exception 'trades_friends_only';
  end if;
  if (select count(*) from trade_listings t where t.taker = me and t.taken_at >= today)
     >= coalesce((cfg ->> 'tradesPerDay')::int, 5) then
    raise exception 'trades_daily_cap';
  end if;

  select s.data into save from saves s where s.user_id = me and s.realm = 'main';
  if save is null then raise exception 'trades_no_save'; end if;
  if trade_in_world(save) then raise exception 'trades_world'; end if;
  if not (l.home_region = any (trade_started(save))) then raise exception 'trades_region'; end if;
  select * into hit from trade_find(save, p_inst);
  if hit.inst is null then raise exception 'trades_not_found'; end if;
  if trade_world(save, hit.region) then raise exception 'trades_world'; end if;
  if hit.inst ->> 'revivesAt' is not null then raise exception 'trades_reviving'; end if;
  if hit.others < 1 then raise exception 'trades_last'; end if;
  gdex := (hit.inst ->> 'dex')::int;
  gshiny := coalesce((hit.inst ->> 'shiny')::boolean, false);
  if trade_untradable(gdex) then raise exception 'trades_untradable'; end if;
  if exists (select 1 from trade_listings t where t.owner = me and t.status = 'open' and t.mon ->> 'id' = p_inst)
     or exists (select 1 from trade_listings t where t.taker = me and not t.taker_applied and t.taker_mon ->> 'id' = p_inst) then
    raise exception 'trades_listed';
  end if;
  -- The poster must be able to receive it: its home region started on their side.
  if not (coalesce(l.poster -> 'regions', '[]') ? coalesce(trade_home_region(gdex), hit.region)) then
    raise exception 'trades_poster_region';
  end if;
  -- In parentheses: an IF's condition ends at its first THEN otherwise.
  if not (case l.want ->> 'kind'
    when 'species' then gdex = (l.want ->> 'dex')::int
    when 'notOwned' then not trade_has(l.poster, gdex)
                         or (gshiny and not coalesce(l.poster -> 'shiny', '[]') @> to_jsonb(gdex))
    else true
  end) then
    raise exception 'trades_no_match';
  end if;

  update trade_listings t
     set status = 'taken', taker = me, taker_name = trade_name(me), taker_mon = hit.inst, taker_from = hit.region,
         taken_at = now()
   where t.id = l.id and t.status = 'open'
  returning * into l;
  return jsonb_build_object('id', l.id, 'listed', l.mon, 'given', l.taker_mon, 'with', coalesce(trade_name(l.owner), l.owner_name, ''),
    'withRich', player_rich(l.owner));
end
$$;

-- 0044's check on load: the other trainer's name golden too.
create or replace function trade_mine(p_realm text default 'main')
returns setof jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' then return; end if;
  update trade_listings t set status = 'expired' where t.owner = me and t.status = 'open' and t.ends_at <= now();
  delete from trade_listings t
   where (t.owner = me or t.taker = me) and t.status <> 'open' and t.owner_applied
     and (t.taker is null or t.taker_applied) and coalesce(t.taken_at, t.ends_at) < now() - interval '30 days';
  return query
    select jsonb_build_object(
      'id', t.id, 'code', t.code, 'role', case when t.owner = me then 'owner' else 'taker' end, 'status', t.status,
      'mon', t.mon, 'from_region', t.from_region, 'want', t.want, 'visibility', t.visibility,
      'created_at', t.created_at, 'ends_at', t.ends_at, 'taker_mon', t.taker_mon,
      'with', case when t.owner = me then coalesce(trade_name(t.taker), t.taker_name, '')
                   else coalesce(trade_name(t.owner), t.owner_name, '') end,
      'withRich', player_rich(case when t.owner = me then t.taker else t.owner end))
    from trade_listings t
    where (t.owner = me and (t.status = 'open' or not t.owner_applied))
       or (t.taker = me and not t.taker_applied)
    order by t.created_at;
end
$$;

-- ---------------------------------------------------------------- who may call what

-- The helpers are the server's own (as 0044's trade_cfg): the game reads the switch from game_config.
revoke all on function general_cfg(), general_open(), player_rich(uuid) from public, anon, authenticated;
-- The seven made again, with the grants they had (0039, 0045). create or replace kept the others'.
revoke all on function leaderboard(text) from public;
revoke all on function friend_list(text) from public, anon;
revoke all on function friend_profile(uuid, text) from public, anon;
revoke all on function friend_day_cares(text) from public, anon;
revoke all on function raid_friend_teams(text) from public;
revoke all on function raid_progress_friend_teams(text, text) from public;
grant execute on function leaderboard(text) to anon, authenticated;
do $$
begin
  if to_regprocedure('public.versus_board(text)') is not null then
    revoke all on function versus_board(text) from public;
    grant execute on function versus_board(text) to anon, authenticated;
  end if;
end
$$;
grant execute on function friend_list(text), friend_profile(uuid, text), friend_day_cares(text), raid_friend_teams(text),
  raid_progress_friend_teams(text, text) to authenticated;
