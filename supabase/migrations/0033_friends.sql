-- Friends, and the leaderboard on player cards (docs/16-FRIENDS-PLAN.md).
--
-- 1. Player cards: what other players may see of you — one row per player (name, look, where they are, when they last
--    played) and one per region played (team, Pokédex, best level, shinies, progress, the badges won, the crown). A
--    trigger on `saves` keeps them up to date, once per cloud push, and the end of this file fills them from every save.
-- 2. The leaderboard reads the cards. The cache, its rebuild and the 5-minute pg_cron job of 0026–0032 are retired:
--    that rebuild re-read every active save 12 times an hour and was 65% of the database's time (measured 10 Oct 2026).
--    Same rules as before: played in the last 72 hours, a badge in the region, not banned, plus the caller's own rows.
--    Each row also says whether its player is the caller's friend (`is_friend`), and for friends only, who they are
--    (`friend_id`, so a friend's row can open their card; nobody else's id is ever returned).
-- 3. Friends: a friend ID per player (8 characters of Crockford base32), friendships (mutual, at most game_config
--    `maxFriends` each, 100 by default), and the functions the game calls. Players never touch these tables: only the
--    security definer functions below do.
-- 4. versus_board() takes each owner's name and look from their card instead of reading their whole save.
--
-- seed.sql inlines this file after 0016, so a database that only re-runs seed.sql gets it too. Safe to run again: a
-- re-run only writes the cards that are older than their save.

-- ---------------------------------------------------------------- player cards

create table if not exists player_cards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar text not null,               -- the look (0022): an id from src/lib/avatars, checked by the game
  region text not null,               -- the region being played
  area_id text,                       -- the area they are on
  updated_at timestamptz not null     -- the save's: "played 2 h ago", and the board's 72-hour rule
);
create index if not exists player_cards_updated_at on player_cards (updated_at desc);

create table if not exists player_card_regions (
  user_id uuid not null references player_cards(user_id) on delete cascade,
  region text not null,
  team jsonb not null,                -- [{dex, level, shiny}], that region's team in order
  pokedex int not null,
  max_level int not null,             -- Box and Day Care
  shinies int not null,               -- shiny Pokémon owned there (Box and Day Care): a shiny is never released
  progress jsonb not null,            -- {areaId: {cleared, gyms}}, as leaderboard() has always returned it
  badges text[] not null,             -- the gym leaders beaten there whose `badge` is set
  endgame boolean not null,           -- the region's league area cleared: the crown
  primary key (user_id, region),
  constraint player_card_regions_small check (pg_column_size(progress) < 16000)
);

alter table player_cards enable row level security;
alter table player_card_regions enable row level security;
revoke all on player_cards, player_card_regions from anon, authenticated;
drop policy if exists player_cards_admin on player_cards;
create policy player_cards_admin on player_cards for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists player_card_regions_admin on player_card_regions;
create policy player_card_regions_admin on player_card_regions for all using ((select is_admin())) with check ((select is_admin()));

-- Writes a player's card from their save: the live region at the top level of the save, the others under `parked`.
create or replace function player_card_write(p_user uuid, p_data jsonb, p_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  live text := coalesce(nullif(p_data ->> 'region', ''), 'kanto');
  badge_ids text[];
begin
  select coalesce(array_agg(t.id::text), '{}') into badge_ids from trainers t where coalesce(t.badge, '') <> '';

  insert into player_cards as c (user_id, name, avatar, region, area_id, updated_at)
  values (
    p_user,
    left(coalesce(nullif(trim(p_data -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    left(coalesce(p_data -> 'player' ->> 'avatar', p_data -> 'player' ->> 'character', 'red'), 40),
    live,
    p_data ->> 'currentAreaId',
    p_at
  )
  on conflict (user_id) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    region = excluded.region,
    area_id = excluded.area_id,
    updated_at = excluded.updated_at;

  delete from player_card_regions where user_id = p_user;
  insert into player_card_regions (user_id, region, team, pokedex, max_level, shinies, progress, badges, endgame)
  select
    p_user,
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
      coalesce((
        select max((r -> 'inst' ->> 'level')::int)
        from jsonb_array_elements(coalesce(b.block -> 'dayCare' -> 'residents', '[]')) r
      ), 0)
    ),
    (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'box', '[]')) m
      where coalesce((m ->> 'shiny')::boolean, false))
    + (select count(*)::int from jsonb_array_elements(coalesce(b.block -> 'dayCare' -> 'residents', '[]')) r
      where coalesce((r -> 'inst' ->> 'shiny')::boolean, false)),
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

-- Once per cloud push. A save that can't be read as a card is still saved: the card just keeps its last version.
create or replace function saves_card()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform player_card_write(new.user_id, new.data, new.updated_at);
  exception when others then
    raise warning 'player card for %: %', new.user_id, sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists saves_card on saves;
create trigger saves_card after insert or update of data, updated_at on saves
  for each row execute function saves_card();

revoke all on function player_card_write(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function saves_card() from public, anon, authenticated;

-- ---------------------------------------------------------------- friends

create table if not exists friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  created_at timestamptz not null default now()
);

-- One row per pair, the smaller id first. A friendship is mutual: removing it removes it for both.
create table if not exists friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null,
  created_at timestamptz not null default now(),
  a_seen boolean not null default false,   -- user_a has opened their friend list since (the adder's is set at once)
  b_seen boolean not null default false,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b on friendships (user_b);

-- Lookups and adds, for the rate limit. Pruned to the last hour as it goes.
create table if not exists friend_attempts (
  actor text not null,                     -- user id, or 'device:<id>' for a signed-out lookup
  at timestamptz not null default now()
);
create index if not exists friend_attempts_actor on friend_attempts (actor, at desc);

alter table friend_codes enable row level security;
alter table friendships enable row level security;
alter table friend_attempts enable row level security;
revoke all on friend_codes, friendships, friend_attempts from anon, authenticated;
drop policy if exists friend_codes_admin on friend_codes;
create policy friend_codes_admin on friend_codes for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friendships_admin on friendships;
create policy friendships_admin on friendships for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friend_attempts_admin on friend_attempts;
create policy friend_attempts_admin on friend_attempts for all using ((select is_admin())) with check ((select is_admin()));

-- A typed code, read the forgiving way: any case, spaces and dashes ignored, O read as 0, I and L as 1.
create or replace function friend_norm(p_code text)
returns text
language sql immutable as $$
  select translate(regexp_replace(upper(coalesce(p_code, '')), '[^0-9A-Z]', '', 'g'), 'OIL', '011')
$$;

-- 8 random characters of Crockford base32: 40 bits, from the random part of a v4 UUID (no extension needed).
create or replace function friend_new_code()
returns text
language plpgsql volatile as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := decode(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'hex');
  n bigint := 0;
  s text := '';
begin
  for i in 0..4 loop
    n := (n << 8) | get_byte(b, i);
  end loop;
  for i in 1..8 loop
    s := substr(alphabet, (n & 31)::int + 1, 1) || s;
    n := n >> 5;
  end loop;
  return s;
end
$$;

-- At most 20 lookups and adds per 10 minutes per player (per browser for a signed-out lookup).
create or replace function friend_attempt(p_actor text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from friend_attempts where at < now() - interval '1 hour';
  if (select count(*) from friend_attempts where actor = p_actor and at > now() - interval '10 minutes') >= 20 then
    raise exception 'friends_rate_limited' using errcode = 'P0001';
  end if;
  insert into friend_attempts (actor) values (p_actor);
end
$$;

-- The caller's friends, with whether the caller has seen each one yet.
create or replace function friend_ids_of(p_user uuid)
returns table (id uuid, seen boolean, since timestamptz)
language sql stable security definer set search_path = public as $$
  select case when f.user_a = p_user then f.user_b else f.user_a end,
         case when f.user_a = p_user then f.a_seen else f.b_seen end,
         f.created_at
  from friendships f
  where p_user is not null and (f.user_a = p_user or f.user_b = p_user)
$$;

-- The caller's friend ID, made the first time it is asked for.
create or replace function friend_code()
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if uid is null then
    raise exception 'friends_signed_out' using errcode = '42501';
  end if;
  loop
    select code into c from friend_codes where user_id = uid;
    if c is not null then
      return c;
    end if;
    begin
      insert into friend_codes (user_id, code) values (uid, friend_new_code()) returning code into c;
      return c;
    exception when unique_violation then
      -- Another tab made it at the same moment, or the code was taken: read again, or draw again.
    end;
  end loop;
end
$$;

-- A new friend ID; links and the old ID stop working. Friends stay. At most once an hour.
create or replace function friend_code_reset()
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if uid is null then
    raise exception 'friends_signed_out' using errcode = '42501';
  end if;
  if exists (select 1 from friend_codes where user_id = uid and created_at > now() - interval '1 hour') then
    raise exception 'friends_reset_too_soon' using errcode = 'P0001';
  end if;
  loop
    begin
      insert into friend_codes as f (user_id, code, created_at) values (uid, friend_new_code(), now())
      on conflict (user_id) do update set code = excluded.code, created_at = excluded.created_at
      returning f.code into c;
      return c;
    exception when unique_violation then
      -- The new code was taken: draw again.
    end;
  end loop;
end
$$;

-- Who a code belongs to, for the invite pop-up and the ADD preview: name, look, region and best level only.
create or replace function friend_lookup(p_code text, p_device_id text default null)
returns table (name text, avatar text, region text, max_level int)
language plpgsql volatile security definer set search_path = public as $$
begin
  perform friend_attempt(coalesce(auth.uid()::text, 'device:' || left(coalesce(p_device_id, '?'), 64)));
  return query
    select coalesce(c.name, 'Trainer'), coalesce(c.avatar, 'red'), c.region, coalesce(r.max_level, 0)
    from friend_codes f
    left join player_cards c on c.user_id = f.user_id
    left join player_card_regions r on r.user_id = f.user_id and r.region = c.region
    where f.code = friend_norm(p_code);
end
$$;

-- Adds the owner of a code as a friend, at once: having someone's code means they gave it out. Statuses: added,
-- already, self, not_found, full (the caller has maxFriends), friend_full (they do).
create or replace function friend_add(p_code text)
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
  -- Both players locked, always in the same order, so two adds at once can't both get past the cap.
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
    select status, other, coalesce(c.name, 'Trainer'), coalesce(c.avatar, 'red')
    from (select 1) one left join player_cards c on c.user_id = other;
end
$$;

-- Ends a friendship, from either side: gone for both. The other player isn't told.
create or replace function friend_remove(p_friend uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'friends_signed_out' using errcode = '42501';
  end if;
  delete from friendships f where f.user_a = least(uid, p_friend) and f.user_b = greatest(uid, p_friend);
end
$$;

-- The one friends call when the game loads and when the player comes back to its tab: every friend's id (for the
-- Versus highlight) and the friends not seen yet (for the toast and the dots). A few hundred bytes.
create or replace function friend_status()
returns table (ids uuid[], unseen jsonb)
language sql stable security definer set search_path = public as $$
  select
    coalesce(array_agg(m.id), '{}'),
    coalesce(
      jsonb_agg(jsonb_build_object('id', m.id, 'name', coalesce(c.name, 'Trainer'), 'avatar', coalesce(c.avatar, 'red'))
        order by m.since desc) filter (where not m.seen),
      '[]'
    )
  from friend_ids_of(auth.uid()) m
  left join player_cards c on c.user_id = m.id
$$;

-- The Friends page: one row per friend, from the cards. New friends first, then the last played.
create or replace function friend_list()
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
  is_new boolean
)
language sql stable security definer set search_path = public as $$
  select m.id, coalesce(c.name, 'Trainer'), coalesce(c.avatar, 'red'), c.region, c.area_id,
         coalesce(r.max_level, 0), coalesce(r.team, '[]'), m.since, c.updated_at, not m.seen
  from friend_ids_of(auth.uid()) m
  left join player_cards c on c.user_id = m.id
  left join player_card_regions r on r.user_id = m.id and r.region = c.region
  order by (not m.seen) desc, c.updated_at desc nulls last
$$;

-- The caller has looked at their friend list: every friend stops being new.
create or replace function friend_seen()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  update friendships set a_seen = true where user_a = uid and not a_seen;
  update friendships set b_seen = true where user_b = uid and not b_seen;
end
$$;

-- A friend's trainer card: their card, every region's row, and their Versus team and record. Friends only: for
-- anyone else it returns nothing.
create or replace function friend_profile(p_friend uuid)
returns table (
  user_id uuid,
  name text,
  avatar text,
  region text,
  area_id text,
  updated_at timestamptz,
  since timestamptz,
  regions jsonb,
  versus jsonb
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
  -- Versus (0018) is optional on a database.
  if to_regclass('public.versus_teams') is not null then
    select jsonb_build_object(
      'team', v.team,
      'attackWins', (select count(*) from versus_battles b where b.attacker_id = v.user_id and b.won),
      'defenseWins', (
        select count(*) from (
          select distinct b.attacker_id, b.defender_version from versus_battles b
          where b.defender_id = v.user_id and not b.won
        ) held
      )
    ) into vs
    from versus_teams v where v.user_id = p_friend;
  end if;
  return query
    select p_friend, coalesce(c.name, 'Trainer'), coalesce(c.avatar, 'red'), c.region, c.area_id, c.updated_at,
      friends_since,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'region', r.region, 'team', r.team, 'pokedex', r.pokedex, 'maxLevel', r.max_level, 'shinies', r.shinies,
          'progress', r.progress, 'badges', to_jsonb(r.badges), 'endgame', r.endgame
        ))
        from player_card_regions r where r.user_id = p_friend
      ), '[]'),
      vs
    from (select 1) one left join player_cards c on c.user_id = p_friend;
end
$$;

revoke all on function friend_norm(text) from public, anon, authenticated;
revoke all on function friend_new_code() from public, anon, authenticated;
revoke all on function friend_attempt(text) from public, anon, authenticated;
revoke all on function friend_ids_of(uuid) from public, anon, authenticated;
revoke all on function friend_code() from public, anon;
revoke all on function friend_code_reset() from public, anon;
revoke all on function friend_lookup(text, text) from public;
revoke all on function friend_add(text) from public, anon;
revoke all on function friend_remove(uuid) from public, anon;
revoke all on function friend_status() from public, anon;
revoke all on function friend_list() from public, anon;
revoke all on function friend_seen() from public, anon;
revoke all on function friend_profile(uuid) from public, anon;
grant execute on function friend_lookup(text, text) to anon, authenticated;
grant execute on function friend_code(), friend_code_reset(), friend_add(text), friend_remove(uuid), friend_status(),
  friend_list(), friend_seen(), friend_profile(uuid) to authenticated;

-- ---------------------------------------------------------------- the leaderboard, from the cards

-- 0011's ban list, here too so that this file stands alone in seed.sql.
create table if not exists leaderboard_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  banned_at timestamptz not null default now()
);
alter table leaderboard_bans enable row level security;

-- Its columns grew (is_friend, friend_id); a function's return type can't change in place.
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
  friend_id uuid
)
language sql stable security definer set search_path = public as $$
  select r.region, r.user_id = auth.uid(), c.name, c.avatar, r.team, r.pokedex, r.max_level, r.shinies, r.progress,
         m.id is not null, m.id
  from player_card_regions r
  join player_cards c on c.user_id = r.user_id
  left join friend_ids_of(auth.uid()) m on m.id = r.user_id
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

-- The cache, its rebuild and its schedule (0026, 0031, 0032) are no longer needed.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'leaderboard-rebuild';
  end if;
end
$$;
drop function if exists leaderboard_refresh();
drop function if exists leaderboard_rebuild();
drop function if exists leaderboard_rows(timestamptz, uuid);
drop table if exists leaderboard_cache_state;
drop table if exists leaderboard_cache;

-- ---------------------------------------------------------------- Versus names from the cards

-- Same columns and rules as 0022's; only the owner's name and look now come from their card.
do $do$
begin
  if to_regclass('public.versus_teams') is null then
    return;
  end if;
  execute $ddl$
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
    language sql stable security definer set search_path = public as $body$
      select
        v.user_id,
        v.user_id = auth.uid(),
        coalesce(c.name, 'Trainer'),
        coalesce(c.avatar, 'red'),
        v.team,
        case when v.user_id = auth.uid() then v.ids end,
        v.version,
        (select count(*)::int from versus_battles b where b.attacker_id = v.user_id and b.won),
        (
          select count(*)::int from (
            select distinct b.attacker_id, b.defender_version from versus_battles b
            where b.defender_id = v.user_id and not b.won
          ) held
        ),
        exists (
          select 1 from versus_battles b
          where b.attacker_id = auth.uid() and b.defender_id = v.user_id and b.defender_version = v.version and b.won
        )
      from versus_teams v
      left join player_cards c on c.user_id = v.user_id
      order by v.updated_at desc
      limit 1000
    $body$
  $ddl$;
end
$do$;

-- ---------------------------------------------------------------- the cards, from every save

-- Only the cards older than their save (or missing): a re-run of this file costs one quick pass.
do $$
declare
  s record;
begin
  for s in
    select x.user_id, x.data, x.updated_at from saves x
    where not exists (select 1 from player_cards c where c.user_id = x.user_id and c.updated_at >= x.updated_at)
  loop
    begin
      perform player_card_write(s.user_id, s.data, s.updated_at);
    exception when others then
      raise warning 'player card for %: %', s.user_id, sqlerrm;
    end;
  end loop;
end
$$;
