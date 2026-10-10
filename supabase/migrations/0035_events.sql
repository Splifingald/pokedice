-- Special events (docs/18-SPECIAL-EVENTS-PLAN.md, docs/19-SPECIAL-EVENTS-BUILD.md): the Fortune Wheel, Raid Battles and
-- the Elite Rebattle. Built in phases; this file grows with them and stays safe to run again.
--
-- Phase 1, the framework:
-- 1. event_time(): the server's clock. The daily spin and the day's raid turn over at midnight UTC as the server sees
--    it, never the device's: anyone can call it, guests included (it reveals nothing but the time).
-- 2. event_state: one row per signed-in player, what the events have recorded about them (the later phases fill it).
--
-- Phase 2, the Fortune Wheel:
-- 3. wheel_spin(): one spin per UTC day. The server draws the prize from game_config `events` → wheel.prizes (each
--    prize's slices × their odds; the defaults below when the admin hasn't saved the row), so reloading can't re-roll
--    it. A second call the same day gives the same prize back, `fresh` false: a spin whose answer got lost isn't lost.
--
-- Phase 4, the day's raid:
-- 4. raid_today(p_candidates): one raid per player and UTC day, the same on every device. The first call of the day
--    picks one of the candidates the game sends (its rules: the raid pool, then shinies, then the fallback species,
--    without the last days' raids) and keeps it; every later call that day returns it.

-- Phase 5, the raid fight:
-- 5. raid_close(p_helpers): today's raid Pokémon is caught. The raid closes for the day and raids_won (the Raids
--    leaderboard) goes up by one, once: a second call the same day changes nothing and returns the same count.
--
-- Phase 6, raiding with friends:
-- 6. raid_teams + raid_set_team(p_ids): your raid team, built here from your cloud save (any region's Box, cloned at
--    the raid team cap), for friends to bring beside them.
-- 7. raid_friend_teams(): your friends' raid teams, and how many times each has helped you.
-- 8. raid_gifts: the friends who fought beside you get a gift when you catch the raid Pokémon (raid_close), at most
--    `helperDailyCap` a UTC day each; raid_gifts_claim() hands a helper theirs on their next visit.
-- 9. leaderboard() gains raids_won (the Raids tab): one count per player, the same on every region's board.
--
-- seed.sql inlines this file after 0034, so a database that only re-runs seed.sql gets it too.

-- ---------------------------------------------------------------- the clock

create or replace function event_time()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'day', to_char(now() at time zone 'UTC', 'YYYY-MM-DD')
  )
$$;
revoke all on function event_time() from public;
grant execute on function event_time() to anon, authenticated;

-- ---------------------------------------------------------------- each player's events

create table if not exists event_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table event_state enable row level security;
revoke all on event_state from anon, authenticated;
drop policy if exists event_state_admin on event_state;
create policy event_state_admin on event_state for all using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- the Fortune Wheel

alter table event_state add column if not exists wheel_day date;
alter table event_state add column if not exists wheel_prize int;

-- The wheel's prizes: the admin's, or the game's defaults (engine/defaults.ts; tests/events-sql.test.ts keeps the two
-- the same).
create or replace function wheel_prizes()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value #> '{wheel,prizes}' from game_config
      where key = 'events' and jsonb_typeof(value #> '{wheel,prizes}') = 'array' and jsonb_array_length(value #> '{wheel,prizes}') > 0),
    '[
      {"reward": {"kind": "gold", "amount": 10}, "count": 4, "odds": 12.5},
      {"reward": {"kind": "item", "key": "poke-ball", "qty": 1}, "count": 2, "odds": 12.5},
      {"reward": {"kind": "item", "key": "great-ball", "qty": 1}, "count": 1, "odds": 12.5},
      {"reward": {"kind": "item", "key": "ultra-ball", "qty": 1}, "count": 1, "odds": 10},
      {"reward": {"kind": "item", "key": "master-ball", "qty": 1}, "count": 1, "odds": 2.5}
    ]'::jsonb)
$$;
revoke all on function wheel_prizes() from public;

create or replace function wheel_spin()
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
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if not coalesce((select (value #>> '{wheel,enabled}')::boolean from game_config where key = 'events'), true) then
    raise exception 'events_wheel_off';
  end if;
  insert into event_state (user_id) values (me) on conflict (user_id) do nothing;
  select * into st from event_state where user_id = me for update;
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
  update event_state set wheel_day = today, wheel_prize = pick, updated_at = now() where user_id = me;
  return jsonb_build_object('day', to_char(today, 'YYYY-MM-DD'), 'prize', pick, 'reward', prizes -> pick -> 'reward', 'fresh', true);
end $$;
revoke all on function wheel_spin() from public;
grant execute on function wheel_spin() to authenticated;

-- ---------------------------------------------------------------- the day's raid

alter table event_state add column if not exists raid jsonb;

create or replace function raid_today(p_candidates jsonb)
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
  insert into event_state (user_id) values (me) on conflict (user_id) do nothing;
  select * into st from event_state where user_id = me for update;
  if st.raid is not null and st.raid ->> 'day' = today then return st.raid; end if;
  n := coalesce(jsonb_array_length(p_candidates -> 'list'), 0);
  if n = 0 then raise exception 'events_no_raid'; end if;
  c := p_candidates -> 'list' -> floor(random() * n)::int;
  shiny := coalesce((c ->> 'shiny')::boolean, false)
    or (p_candidates ->> 'kind' = 'fallback' and random() < coalesce((p_candidates ->> 'fallbackShiny')::numeric, 0));
  pick := jsonb_build_object('day', today, 'dex', (c ->> 'dex')::int, 'shiny', shiny, 'areaId', c ->> 'areaId', 'caught', false);
  update event_state set raid = pick, updated_at = now() where user_id = me;
  return pick;
end $$;
revoke all on function raid_today(jsonb) from public;
grant execute on function raid_today(jsonb) to authenticated;

-- ---------------------------------------------------------------- the raid fight

alter table event_state add column if not exists raids_won int not null default 0;

-- raid_close() is defined with the helpers below (phase 6).

-- ---------------------------------------------------------------- raid teams (phase 6)
--
-- Each player's raid team: up to three Pokémon from any region's Box, cloned at the raid team cap (game_config
-- `events` → raid.teamCap, 50 by default). Built here from the cloud save, never from what the page sends, like a
-- Versus team; friends fight beside you with it.
create table if not exists raid_teams (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team jsonb not null,               -- [{dex, level, shiny}] × 1–3, in order, level ≤ the cap
  ids jsonb,                         -- the Box ids it was cloned from (only their owner sees them)
  updated_at timestamptz not null default now()
);
alter table raid_teams enable row level security;
drop policy if exists raid_teams_admin on raid_teams;
create policy raid_teams_admin on raid_teams for all using (is_admin()) with check (is_admin());
revoke all on raid_teams from anon, authenticated;

-- The raid team cap: the admin's, or the game's default.
create or replace function raid_team_cap()
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (value -> 'raid' ->> 'teamCap')::int from game_config where key = 'events'),
    50
  )
$$;

create or replace function raid_set_team(p_ids text[])
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
  select s.data into save from saves s where s.user_id = me;
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
  insert into raid_teams (user_id, team, ids, updated_at) values (me, new_team, to_jsonb(p_ids), now())
  on conflict (user_id) do update set team = excluded.team, ids = excluded.ids, updated_at = now();
  return new_team;
end $$;

-- ---------------------------------------------------------------- helpers' gifts (phase 6)
--
-- A friend whose raid team fought beside you gets a gift when you catch the raid Pokémon: one row here, claimed on
-- their next visit. A helper gets `helperDailyCap` gifts a UTC day at most, however many friends they help.
create table if not exists raid_gifts (
  id bigint generated always as identity primary key,
  helper_id uuid not null references auth.users(id) on delete cascade,
  raider_id uuid not null references auth.users(id) on delete cascade,
  raider_name text not null,
  dex int not null,
  item_key text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists raid_gifts_helper_idx on raid_gifts (helper_id, created_at);
alter table raid_gifts enable row level security;
drop policy if exists raid_gifts_admin on raid_gifts;
create policy raid_gifts_admin on raid_gifts for all using (is_admin()) with check (is_admin());
revoke all on raid_gifts from anon, authenticated;

-- Your friends' raid teams, with how many times each has helped you catch a raid Pokémon.
create or replace function raid_friend_teams()
returns table (user_id uuid, name text, avatar text, team jsonb, helped int)
language sql stable security definer set search_path = public as $$
  select t.user_id,
         left(coalesce(nullif(trim(s.data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
         coalesce(s.data -> 'player' ->> 'avatar', s.data -> 'player' ->> 'character', 'red'),
         t.team,
         (select count(*)::int from raid_gifts g where g.helper_id = t.user_id and g.raider_id = auth.uid())
  from friend_ids_of(auth.uid()) f
  join raid_teams t on t.user_id = f.id
  left join saves s on s.user_id = t.user_id
  order by t.updated_at desc
$$;

-- Your unclaimed gifts, claimed now: the game puts each item in the bag.
create or replace function raid_gifts_claim()
returns table (id bigint, raider_name text, dex int, item_key text)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'events_signed_out'; end if;
  return query
    update raid_gifts g set claimed_at = now()
    where g.helper_id = me and g.claimed_at is null
    returning g.id, g.raider_name, g.dex, g.item_key;
end $$;

-- Today's raid Pokémon is caught: the raid closes, raids_won + 1, and each friend whose raid team fought beside you
-- (`p_helpers`) gets a gift, drawn from game_config `events` → raid.gifts, while they have had fewer than
-- raid.helperDailyCap today. Only once a day: a second call changes nothing.
drop function if exists raid_close();
create or replace function raid_close(p_helpers uuid[] default '{}')
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
  select * into st from event_state where user_id = me for update;
  if st.raid is null or st.raid ->> 'day' <> today then raise exception 'events_no_raid'; end if;
  if coalesce((st.raid ->> 'caught')::boolean, false) then
    return jsonb_build_object('raidsWon', st.raids_won, 'gifts', 0);
  end if;
  update event_state
    set raid = jsonb_set(st.raid, '{caught}', 'true'), raids_won = st.raids_won + 1, updated_at = now()
    where user_id = me
    returning * into st;

  cap := coalesce((cfg ->> 'helperDailyCap')::int, 5);
  gifts := coalesce(cfg -> 'gifts', '[{"key":"ultra-ball","weight":40},{"key":"hyper-potion","weight":25},{"key":"revive","weight":20},{"key":"rare-candy","weight":15}]');
  select sum(greatest(0, coalesce((x ->> 'weight')::numeric, 0))) into total from jsonb_array_elements(gifts) x;
  raider := left(coalesce(nullif(trim((select s.data -> 'player' ->> 'name' from saves s where s.user_id = me)), ''), 'Trainer'), 12);
  for helper in select distinct h from unnest(coalesce(p_helpers, '{}')) h loop
    -- A friend, with a raid team, under today's cap.
    continue when helper is null or helper = me or coalesce(total, 0) <= 0;
    continue when not exists (select 1 from friend_ids_of(me) f where f.id = helper);
    continue when not exists (select 1 from raid_teams t where t.user_id = helper);
    continue when (select count(*) from raid_gifts x where x.helper_id = helper and x.created_at >= midnight) >= cap;
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
    insert into raid_gifts (helper_id, raider_id, raider_name, dex, item_key)
    values (helper, me, raider, (st.raid ->> 'dex')::int, pick);
    given := given + 1;
  end loop;
  return jsonb_build_object('raidsWon', st.raids_won, 'gifts', given);
end $$;

revoke all on function raid_team_cap() from public, anon, authenticated;
revoke all on function raid_set_team(text[]) from public;
revoke all on function raid_friend_teams() from public;
revoke all on function raid_gifts_claim() from public;
revoke all on function raid_close(uuid[]) from public;
grant execute on function raid_set_team(text[]), raid_friend_teams(), raid_gifts_claim(), raid_close(uuid[]) to authenticated;

-- ---------------------------------------------------------------- the Raids tab
--
-- leaderboard() as 0033 made it, plus raids_won: the player's raids won (their raid Pokémon caught), the same on every
-- region's board (D4). A player who has never raided has 0.
drop function if exists leaderboard();
create or replace function leaderboard()
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
  join player_cards c on c.user_id = r.user_id
  left join friend_ids_of(auth.uid()) m on m.id = r.user_id
  left join event_state e on e.user_id = r.user_id
  -- At least one badge in the region (0024); played in the last 72 hours (0023), except the caller, who always sees
  -- their own rows; banned players left out (0011).
  where cardinality(r.badges) > 0
    and (c.updated_at > now() - interval '72 hours' or r.user_id = auth.uid())
    and not exists (select 1 from leaderboard_bans x where x.user_id = r.user_id)
  order by c.updated_at desc
  limit 3000
$$;
revoke all on function leaderboard() from public;
grant execute on function leaderboard() to anon, authenticated;
