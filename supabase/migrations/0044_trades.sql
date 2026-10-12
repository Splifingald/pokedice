-- Trades (docs/23-TRADING-PLAN.md): players trade Pokémon through listings, like the games' GTS. A save is written only
-- by its owner, so a trade is a server inbox, like raid gifts: the server holds each listing and decides who got there
-- first, and each player's game applies its own half (src/engine/trade.ts), records the trade's id in its save, pushes
-- it, then says so here (trade_applied). A tab that dies in between gets the trade again on its next check, and the
-- save already says it's done: a trade is applied exactly once.
--
-- 1. game_config `trade`: the switch (Off / On for admin / On for everyone, off by default: docs/15 §20) and the
--    numbers, inserted only if missing so seeding never clobbers the admin's.
-- 2. trade_listings: one row per listing, from posted to applied on both sides. No direct access; the functions below.
-- 3. trade_post / trade_take read the Pokémon from the player's own cloud save (pushed just before, as Versus does:
--    what the page sends isn't trusted), check every rule, and write the listing. trade_take takes it with one locked
--    update, so two takers can't both win.
-- 4. trade_cancel, trade_board (public + friends' listings, guests: the four newest public ones), trade_view (one
--    listing by its link, guests too, rate-limited like friend_lookup), trade_mine (the check on load / return: open
--    listings and trades still to apply), trade_applied, trade_remove (the admin).
-- 5. delete_my_data: open listings go; a taken trade still owed to the other player keeps their Pokémon, without your
--    name. Rows done on both sides go 30 days later (trade_mine tidies its caller's).
--
-- The main save only: Extreme mode stays a solo challenge (p_realm must be 'main'). No trades reach a small world
-- (docs/21): a player inside one can't post or take, and nothing in a world's Box is ever listed or given
-- (trade_world). Run after 0043; safe to run again.
-- seed.sql inlines it (scripts/seed.ts), after 0040.

-- ---------------------------------------------------------------- 1. the switch and the numbers

-- The game's defaults (engine/defaults.ts; tests/trades-sql.test.ts keeps the two the same).
insert into game_config (key, value) values ('trade', '{
  "access": "off", "maxListings": 4, "listingDays": 3, "tradesPerDay": 5, "levelCap": 50, "minBadges": 2,
  "evolveOnTrade": [[64,65],[67,68],[75,76],[10110,10111],[93,94],[525,526],[533,534],[588,589],[616,617],[708,709],[710,711]],
  "exclude": [793,794,795,796,797,798,799,803,804,805,806]
}'::jsonb)
on conflict (key) do nothing;

-- The admin's row over the defaults: a key the row lacks keeps its default.
create or replace function trade_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{"access": "off", "maxListings": 4, "listingDays": 3, "tradesPerDay": 5, "levelCap": 50, "minBadges": 2,
           "exclude": [793,794,795,796,797,798,799,803,804,805,806]}'::jsonb
         || coalesce((select value from game_config where key = 'trade' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- The switch, as wheel_spin reads its own: on for everyone, or for the admin only.
create or replace function trade_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(trade_cfg() ->> 'access', 'off') = 'all' or (trade_cfg() ->> 'access' = 'admin' and is_admin())
$$;

-- Never traded: legendaries and mythicals (src/data/egg-groups.json's `l: 1`; the test keeps the two the same), the
-- admin's list (the Ultra Beasts), and every form but a regional one.
create or replace function trade_untradable(p_dex int)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_dex = any ('{
    144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,480,481,482,483,484,485,
    486,487,488,489,490,491,492,493,494,638,639,640,641,642,643,644,645,646,647,648,649,716,717,718,719,720,721,
    772,773,785,786,787,788,789,790,791,792,800,801,802,807,808,809,888,889,890,891,892,893,894,895,896,897,898,
    905,1001,1002,1003,1004,1007,1008,1014,1015,1016,1017,1024,1025,10007,10043,10044,10062,10063,10075,10077,
    10078,10079,10120,10157,10169,10170,10171,10208,10226,10273,10274,10275,10311,10312,10317,10319,20001,20002,
    20003,20004,20005,20006,20007,20008,20009,20010,20011,20012,20013,20014,20015,20016,20017,20101,20102,20103,
    20104,20105,20106,20107,20108,20109,20110,20111,20112,20113,20114,20115,20116,20117
  }'::int[])
  or exists (select 1 from jsonb_array_elements_text(coalesce(trade_cfg() -> 'exclude', '[]')) e where e = p_dex::text)
  or exists (select 1 from pokemon p where p.dex = p_dex and p.form is not null and coalesce(p.form ->> 'kind', '') <> 'regional')
$$;

-- The region a species belongs to, where a traded Pokémon lands (engine/regions.ts regionOfSpecies): a form's own
-- region, else its species'; else the region whose dex range covers it.
create or replace function trade_home_region(p_dex int, p_depth int default 0)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb;
begin
  select p.form into f from pokemon p where p.dex = p_dex;
  if f is not null and jsonb_typeof(f) = 'object' then
    if coalesce(f ->> 'region', '') <> '' then return f ->> 'region'; end if;
    if (f ->> 'of')::int is distinct from p_dex and p_depth < 3 then
      return trade_home_region((f ->> 'of')::int, p_depth + 1);
    end if;
    return null;
  end if;
  return (select r.id from regions r
          where p_dex between (r.dex_range ->> 0)::int and (r.dex_range ->> 1)::int
          order by r.order_index limit 1);
end
$$;

-- Badges held in the main save, every region's together (the cards keep them: 0033).
create or replace function trade_badges(p_user uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cardinality(r.badges)), 0)::int from player_card_regions r where r.user_id = p_user and r.realm = 'main'
$$;

-- The regions a save has started: the one being played and the parked ones.
-- A small world's region (docs/21): the one this save holds (its own record), or any on the admin's list. No trades
-- reach a world: nothing in one can be listed or given, and a player inside one can't trade at all.
create or replace function trade_world(p_save jsonb, p_region text)
returns boolean
language sql stable as $$
  -- coalesce: a save holding no world gives null here, and `not null` would hide every region.
  select coalesce(p_save -> 'events' -> 'world' ->> 'regionId' = p_region
                  and coalesce((p_save -> 'events' -> 'world' ->> 'closed')::boolean, false) = false, false)
      or exists (
        select 1 from jsonb_array_elements(coalesce((select value -> 'list' from game_config where key = 'smallWorlds'), '[]')) w
        where w ->> 'regionId' = p_region)
$$;

-- The player is in a small world now (its region is the one being played).
create or replace function trade_in_world(p_save jsonb)
returns boolean
language sql stable as $$
  select trade_world(p_save, coalesce(nullif(p_save ->> 'region', ''), 'kanto'))
$$;

-- The regions a save has started, live or parked, small worlds left out.
create or replace function trade_started(p_save jsonb)
returns text[]
language sql stable as $$
  select array_agg(distinct x) from (
    select coalesce(nullif(p_save ->> 'region', ''), 'kanto') x
    union all
    select k from jsonb_each(coalesce(p_save -> 'parked', '{}')) p(k, v) where jsonb_typeof(v) = 'object'
  ) t
  where not trade_world(p_save, x)
$$;

-- One Pokémon of a save, from any region's Box: the instance, its region, and how many others can play there.
create or replace function trade_find(p_save jsonb, p_inst text)
returns table (region text, inst jsonb, others int)
language plpgsql immutable as $$
declare
  live text := coalesce(nullif(p_save ->> 'region', ''), 'kanto');
  b record;
begin
  for b in
    select live as r, coalesce(p_save -> 'box', '[]') as box
    union all
    select k, coalesce(v -> 'box', '[]') from jsonb_each(coalesce(p_save -> 'parked', '{}')) p(k, v)
    where jsonb_typeof(v) = 'object' and k <> live
  loop
    select m into inst from jsonb_array_elements(b.box) m where m ->> 'id' = p_inst limit 1;
    if inst is not null then
      region := b.r;
      select count(*)::int into others from jsonb_array_elements(b.box) m
        where m ->> 'id' <> p_inst and m ->> 'revivesAt' is null;
      return next;
      return;
    end if;
  end loop;
end
$$;

-- Does a poster's snapshot (engine/trade.ts TradeSnapshot) hold this species? `has` is a base64 bitset of the dex
-- numbers under 2048 (bit n = byte n / 8, bit n % 8 from the lowest: get_bit's order); regional forms are listed.
create or replace function trade_has(p_snap jsonb, p_dex int)
returns boolean
language plpgsql immutable as $$
declare
  b bytea;
begin
  if p_dex >= 2048 then
    return coalesce(p_snap -> 'forms', '[]') @> to_jsonb(p_dex);
  end if;
  b := decode(coalesce(p_snap ->> 'has', ''), 'base64');
  if length(b) * 8 <= p_dex then return false; end if;
  return get_bit(b, p_dex) = 1;
exception when others then
  return false;
end
$$;

-- The name and look the player has on their card (main save), for the board and the other side of a trade.
create or replace function trade_name(p_user uuid)
returns text
language sql stable security definer set search_path = public as $$
  select nullif(c.name, '') from player_cards c where c.user_id = p_user and c.realm = 'main'
$$;

-- ---------------------------------------------------------------- 2. the listings

create table if not exists trade_listings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                     -- the link's (Crockford base32, like friend IDs)
  realm text not null default 'main' check (realm = 'main'),
  owner uuid references auth.users(id) on delete set null,
  owner_name text,
  from_region text not null,                     -- the Box it left: it goes back there
  home_region text not null,                     -- where it lands for the taker
  mon jsonb not null,                            -- the instance as listed
  dex int not null,
  level int not null,
  shiny boolean not null default false,
  want jsonb not null,                           -- {kind: 'species', dex} | {kind: 'notOwned'} | {kind: 'any'}
  poster jsonb not null,                         -- the poster's snapshot: {has, forms, shiny, regions}
  visibility text not null check (visibility in ('public', 'friends', 'private')),
  created_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'taken', 'cancelled', 'expired', 'removed')),
  taker uuid references auth.users(id) on delete set null,
  taker_name text,
  taker_mon jsonb,                               -- the instance given, as it was in the taker's cloud save
  taker_from text,
  taken_at timestamptz,
  owner_applied boolean not null default false,
  taker_applied boolean not null default false
);
create index if not exists trade_listings_board on trade_listings (realm, status, visibility, ends_at);
create index if not exists trade_listings_owner on trade_listings (owner);
create index if not exists trade_listings_taker on trade_listings (taker, taken_at);

alter table trade_listings enable row level security;
revoke all on trade_listings from anon, authenticated;
drop policy if exists trade_listings_admin on trade_listings;
create policy trade_listings_admin on trade_listings for all using ((select is_admin())) with check ((select is_admin()));

-- One listing as the board, a link and the poster's own list read it.
create or replace function trade_row(l trade_listings, p_me uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'owner', l.owner,
    'name', coalesce(trade_name(l.owner), l.owner_name, ''),
    'avatar', (select c.avatar from player_cards c where c.user_id = l.owner and c.realm = 'main'),
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

-- ---------------------------------------------------------------- 3. posting and taking

create or replace function trade_post(p_inst text, p_want jsonb, p_visibility text, p_poster jsonb, p_realm text default 'main')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := trade_cfg();
  save jsonb;
  hit record;
  wdex int;
  l trade_listings;
  started text[];
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' then raise exception 'trades_realm'; end if;
  if not trade_open() then raise exception 'trades_off'; end if;
  if trade_badges(me) < coalesce((cfg ->> 'minBadges')::int, 0) then raise exception 'trades_badges'; end if;
  if (select count(*) from trade_listings t where t.owner = me and t.status = 'open' and t.ends_at > now())
     >= coalesce((cfg ->> 'maxListings')::int, 4) then
    raise exception 'trades_full';
  end if;
  if p_visibility is null or p_visibility not in ('public', 'friends', 'private') then raise exception 'trades_bad_want'; end if;

  select s.data into save from saves s where s.user_id = me and s.realm = 'main';
  if save is null then raise exception 'trades_no_save'; end if;
  if trade_in_world(save) then raise exception 'trades_world'; end if;
  select * into hit from trade_find(save, p_inst);
  if hit.inst is null then raise exception 'trades_not_found'; end if;
  if trade_world(save, hit.region) then raise exception 'trades_world'; end if;
  if hit.inst ->> 'revivesAt' is not null then raise exception 'trades_reviving'; end if;
  if hit.others < 1 then raise exception 'trades_last'; end if;
  if trade_untradable((hit.inst ->> 'dex')::int) then raise exception 'trades_untradable'; end if;
  -- Already on the board, or given in a trade not applied yet.
  if exists (select 1 from trade_listings t where t.owner = me and t.status = 'open' and t.mon ->> 'id' = p_inst)
     or exists (select 1 from trade_listings t where t.taker = me and not t.taker_applied and t.taker_mon ->> 'id' = p_inst) then
    raise exception 'trades_listed';
  end if;

  started := trade_started(save);
  case coalesce(p_want ->> 'kind', '')
    when 'species' then
      wdex := (p_want ->> 'dex')::int;
      if wdex is null or trade_untradable(wdex) or not (trade_home_region(wdex) = any (started)) then
        raise exception 'trades_bad_want';
      end if;
      p_want := jsonb_build_object('kind', 'species', 'dex', wdex);
    when 'notOwned' then p_want := '{"kind": "notOwned"}';
    when 'any' then p_want := '{"kind": "any"}';
    else raise exception 'trades_bad_want';
  end case;

  insert into trade_listings (code, owner, owner_name, from_region, home_region, mon, dex, level, shiny, want, poster,
                              visibility, ends_at)
  values (
    friend_new_code(), me, trade_name(me), hit.region,
    coalesce(trade_home_region((hit.inst ->> 'dex')::int), hit.region),
    hit.inst, (hit.inst ->> 'dex')::int, (hit.inst ->> 'level')::int, coalesce((hit.inst ->> 'shiny')::boolean, false),
    p_want,
    -- The snapshot is the poster's own say: it only decides what they accept. The regions are read from the save.
    jsonb_build_object(
      'has', left(coalesce(p_poster ->> 'has', ''), 400),
      'forms', case when jsonb_typeof(p_poster -> 'forms') = 'array' then p_poster -> 'forms' else '[]' end,
      'shiny', case when jsonb_typeof(p_poster -> 'shiny') = 'array' then p_poster -> 'shiny' else '[]' end,
      'regions', to_jsonb(started)),
    p_visibility,
    now() + make_interval(days => greatest(1, coalesce((cfg ->> 'listingDays')::int, 3))))
  returning * into l;
  return jsonb_build_object('id', l.id, 'code', l.code, 'ends_at', l.ends_at, 'region', l.from_region);
exception when unique_violation then
  -- A code drawn twice (one in a trillion): try once more.
  return trade_post(p_inst, p_want, p_visibility, p_poster, p_realm);
end
$$;

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
  return jsonb_build_object('id', l.id, 'listed', l.mon, 'given', l.taker_mon, 'with', coalesce(trade_name(l.owner), l.owner_name, ''));
end
$$;

-- ---------------------------------------------------------------- 4. the rest of a listing's life

-- Cancel an open listing of yours. Too late (someone took it a moment before): 'taken', and the check applies it.
create or replace function trade_cancel(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  st text;
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  update trade_listings t set status = 'cancelled' where t.id = p_id and t.owner = me and t.status = 'open'
  returning t.status into st;
  if st is not null then return st; end if;
  select t.status into st from trade_listings t where t.id = p_id and t.owner = me;
  return coalesce(st, 'gone');
end
$$;

-- The trade board: open listings, public and your friends' (yours among them, but never a private one), ending soonest
-- or newest first, 50 at a time. `p_dex`: a search's species (the game reads names in the player's language), with
-- `p_query` for a trainer's name. Guests get the four newest public listings. Listing rows only, never a save.
create or replace function trade_board(
  p_friends boolean default false, p_sort text default 'soon', p_dex int[] default null, p_query text default null,
  p_offset int default 0, p_realm text default 'main', p_owner uuid default null)
returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if p_realm is distinct from 'main' or not trade_open() then return; end if;
  return query
    select trade_row(t, me) from trade_listings t
    where t.realm = 'main' and t.status = 'open' and t.ends_at > now()
      and (t.visibility = 'public'
           or (me is not null and t.visibility = 'friends'
               and (t.owner = me or exists (select 1 from friend_ids_of(me) f where f.id = t.owner))))
      and (me is not null or t.visibility = 'public')
      and (not coalesce(p_friends, false) or exists (select 1 from friend_ids_of(me) f where f.id = t.owner))
      -- One trainer's (a friend's card).
      and (p_owner is null or t.owner = p_owner)
      and (p_dex is null and coalesce(p_query, '') = ''
           or t.dex = any (coalesce(p_dex, '{}'))
           or (t.want ->> 'dex')::int = any (coalesce(p_dex, '{}'))
           or (coalesce(p_query, '') <> '' and coalesce(trade_name(t.owner), t.owner_name, '') ilike '%' || p_query || '%'))
    order by case when me is null or p_sort = 'newest' then extract(epoch from t.created_at) * -1
                  else extract(epoch from t.ends_at) end, t.id
    limit case when me is null then 4 else 50 end
    offset case when me is null then 0 else greatest(0, coalesce(p_offset, 0)) end;
end
$$;

-- One listing by its link's code: guests too (the sheet asks them to connect), rate-limited like friend_lookup.
create or replace function trade_view(p_code text, p_device_id text default null, p_realm text default 'main')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  l trade_listings;
begin
  if p_realm is distinct from 'main' or not trade_open() then return null; end if;
  perform friend_attempt(coalesce(me::text, 'trade:' || left(coalesce(p_device_id, 'anon'), 64)));
  select * into l from trade_listings t where t.code = friend_norm(p_code);
  if not found then return null; end if;
  if l.status <> 'open' or l.ends_at <= now() then
    return jsonb_build_object('code', l.code, 'status', case when l.status = 'open' then 'expired' else l.status end);
  end if;
  return trade_row(l, me);
end
$$;

-- The check on load and on return to the tab: your listings (open, and ended ones not applied yet) and the trades you
-- took that your save doesn't hold yet. It works with the switch off too, so nothing listed is ever stranded. Listings
-- past their end are marked expired here; your rows done on both sides over 30 days ago go.
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
                   else coalesce(trade_name(t.owner), t.owner_name, '') end)
    from trade_listings t
    where (t.owner = me and (t.status = 'open' or not t.owner_applied))
       or (t.taker = me and not t.taker_applied)
    order by t.created_at;
end
$$;

-- Your save holds these trades now (pushed): they won't come back from trade_mine.
create or replace function trade_applied(p_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  update trade_listings t set owner_applied = true where t.id = any (p_ids) and t.owner = me and t.status <> 'open';
  update trade_listings t set taker_applied = true where t.id = any (p_ids) and t.taker = me;
end
$$;

-- The admin takes a listing off the board: its Pokémon goes back to its owner (their game applies it on its next check).
create or replace function trade_remove(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'trades_admin_only' using errcode = '42501'; end if;
  update trade_listings t set status = 'removed' where t.id = p_id and t.status = 'open';
  return found;
end
$$;

-- ---------------------------------------------------------------- 5. deleting

-- 0039's delete_my_data, and trades: your open listings go; trades still owed to the other player stay for them,
-- without your name; your side counts as applied.
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
  if p_realm is null or p_realm = 'main' then
    delete from trade_listings where owner = me and (status = 'open' or taker is null or taker_applied);
    delete from trade_listings where taker = me and owner_applied;
    update trade_listings set owner = null, owner_name = null, owner_applied = true where owner = me;
    update trade_listings set taker = null, taker_name = null, taker_applied = true where taker = me;
  end if;
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_attempts where actor = me::text;
  end if;
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function trade_cfg(), trade_open(), trade_untradable(int), trade_home_region(int, int), trade_badges(uuid),
  trade_world(jsonb, text), trade_in_world(jsonb), trade_started(jsonb), trade_find(jsonb, text), trade_has(jsonb, int), trade_name(uuid), trade_row(trade_listings, uuid)
  from public, anon, authenticated;
revoke all on function trade_post(text, jsonb, text, jsonb, text), trade_take(text, text, text), trade_cancel(uuid),
  trade_board(boolean, text, int[], text, int, text, uuid), trade_view(text, text, text), trade_mine(text),
  trade_applied(uuid[]), trade_remove(uuid), delete_my_data(text) from public, anon;
grant execute on function trade_board(boolean, text, int[], text, int, text, uuid), trade_view(text, text, text) to anon, authenticated;
grant execute on function trade_post(text, jsonb, text, jsonb, text), trade_take(text, text, text), trade_cancel(uuid),
  trade_mine(text), trade_applied(uuid[]), trade_remove(uuid), delete_my_data(text) to authenticated;
