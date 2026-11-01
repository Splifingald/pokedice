-- Anti-cheat (docs/63-ANTI-CHEAT.md). A player's save is their own JSON, so the server can't stop them editing their
-- own game. What it can stop is an edited save reaching other players (trades, boards, Versus, raids, area versus)
-- and a claim nobody could have earned. Nothing here changes what an honest player sees or does. The limits are set
-- from the live data of 2026-11-01, well above what any honest player reached.
--
--  1. Internal Versus League functions are taken back from players: 0082 revoked them from `public` only, and
--     Supabase grants every new function to anon and authenticated directly.
--  2. Trades:
--     - a species the game doesn't have is untradable (it froze the other player's trades: their game can't make it);
--     - the Pokémon a listing keeps is a clean copy (known fields, level 1–100);
--     - trade_gone remembers every Pokémon that left a player in a trade, for good, so a save rolled back to before the
--       trade can't trade it again;
--     - a trigger on trade_listings re-checks "already in a trade" under a per-player lock (two tabs at once), and keeps
--       banned players out.
--  3. Boards:
--     - player_cards: the name loses invisible characters and stacked accents; `updated_at` is never later than the
--       server's clock (a save dated 2099 stayed on every board for good);
--     - player_card_regions: only the game's regions, levels up to 100, a Pokédex up to what the region can hold, a
--       team of at most 6 known Pokémon, progress only on the game's areas and never more gyms than an area has.
--  4. Extreme speedrun: the run's clock is the server's own (`now()`, not the save's stamp); a run first seen already
--     won gets no time; a time under 30 minutes (or the admin's `extreme.minRunMs`, if ever set) isn't kept.
--  5. Raids: a raid is counted won only with a team registered for it at least 30 s before (the game registers it when
--     the fight starts), and at most 20 progression raids a UTC day.
--  6. Versus League: starting a match ends the player's unfinished one as the leave it was recorded as (one match at a
--     time); a win needs an attack in its log; `minWinSeconds` goes from 5 to 30 where the admin kept the old 5.
--  7. Teams others meet (versus_teams, raid_teams, raid_progress_teams, area_versus_teams): only Pokémon the game
--     has (no unknown or battle-only forms), levels 1–100, and no banned player's. Area versus quietly skips a bad
--     team (it is written while the save uploads, which must never fail). A Versus team changes at most 30 times a
--     UTC day, so a second account can't hand out endless new teams to beat.
--  8. A ban from the leaderboard (leaderboard_bans) is a ban from everything shared: the player's Versus, raid and
--     area versus teams go, their open listings are cancelled, their League trophies this week go to 0, and the
--     triggers above refuse new ones until the ban is lifted.
--  9. Versus fights recorded: at most 200 an hour per player.
-- 10. saves: players can no longer delete their row directly (the game uses delete_my_data); a save over 8 MB is
--     refused (the largest honest one is about 1 MB).
-- 11. Push (still Off): only the browsers' push services as endpoints; a notice already overdue isn't kept.
-- 12. Guests: at most 20 messages to the admin every 10 minutes between them all, and at most 3,000 new guests a day
--     in the analytics (the record is 361).
-- 13. admin_suspicious(): the admin's list of saves that look edited, on demand (Admin → Analytics → Suspicious).
--
-- Run after 0108 (2.9's trade picks; 0109–0113 touch nothing here). Safe to run again. Not in seed.sql: it needs the
-- optional features' tables (0044, 0045, 0053, 0082, 0099), which seed.sql leaves out.
begin;

-- ---------------------------------------------------------------- 1. internal League functions

revoke execute on function versus_league_close_week(date) from public, anon, authenticated;
revoke execute on function versus_league_ensure_week(date) from public, anon, authenticated;
revoke execute on function versus_league_join(uuid, date) from public, anon, authenticated;
revoke execute on function versus_league_offer(uuid, date, int) from public, anon, authenticated;
revoke execute on function versus_league_seat_bots(date) from public, anon, authenticated;
revoke execute on function versus_league_tick() from public, anon, authenticated;
revoke execute on function versus_league_tick_if_due() from public, anon, authenticated;
revoke execute on function player_powers(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers

-- Banned from the leaderboard, and so from everything shared (§8).
create or replace function is_banned(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from leaderboard_bans b where b.user_id = p_user)
$$;
revoke all on function is_banned(uuid) from public, anon, authenticated;

-- A Pokémon others may meet: one the game has, its base form or a regional one (battle forms only exist in a fight).
create or replace function mon_known(p_dex jsonb)
returns boolean
language sql stable security definer set search_path = public as $$
  select jsonb_typeof(p_dex) = 'number' and (p_dex #>> '{}') ~ '^[0-9]{1,6}$' and exists (
    select 1 from pokemon p
    where p.dex = (p_dex #>> '{}')::int and (p.form is null or coalesce(p.form ->> 'kind', '') = 'regional')
  )
$$;
revoke all on function mon_known(jsonb) from public, anon, authenticated;

-- A trainer's name as others see it: control and invisible characters out (as engine/nickname.ts cleanNickname),
-- no more than one accent stacked on a letter, spaces collapsed, cut to 12. Nothing left is "Trainer".
create or replace function name_clean(p text)
returns text
language sql immutable as $$
  select coalesce(nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(
    normalize(coalesce(p, ''), NFC),
    '[\u0001-\u001F\u007F-\u009F­؜᠎​-‏ -‮⁠-⁯﻿￹-￻]', '', 'g'),
    '([̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃿︠-︯])[̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃿︠-︯]+',
    '\1', 'g'),
    '\s+', ' ', 'g')), 12), ''), 'Trainer')
$$;

-- ---------------------------------------------------------------- 2. trades

-- 0044's, and a species the game doesn't have.
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
  -- Unknown (an edited save): the other player's game couldn't make it, and every trade of theirs would wait on it.
  or p_dex is null or not exists (select 1 from pokemon p where p.dex = p_dex)
$$;

-- What a listing keeps of a Pokémon: the fields a Pokémon has, each small, the level a whole number from 1 to 100.
create or replace function trade_clean(p jsonb)
returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(p) is distinct from 'object' then p else
    coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(p) e(k, v)
      where k in ('id', 'dex', 'level', 'xp', 'currentHp', 'caughtAt', 'shiny', 'revivesAt', 'fossil', 'koAt', 'buff',
                  'nickname', 'letter', 'outfit', 'talent')
        and octet_length(v::text) <= 200
    ), '{}'::jsonb)
    || case when jsonb_typeof(p -> 'level') = 'number'
         then jsonb_build_object('level', least(100, greatest(1, floor((p ->> 'level')::numeric)))::int)
         else '{}'::jsonb end
  end
$$;

-- 0044's, handing back the clean copy.
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
      inst := trade_clean(inst);
      region := b.r;
      select count(*)::int into others from jsonb_array_elements(b.box) m
        where m ->> 'id' <> p_inst and m ->> 'revivesAt' is null;
      return next;
      return;
    end if;
  end loop;
end
$$;

-- Every Pokémon that left a player in a trade: its instance id never trades again from that player (a save rolled back
-- to before the trade still holds it). Kept when the trade's row goes (30 days on) and through Delete my data.
create table if not exists trade_gone (
  user_id uuid not null,
  inst_id text not null,
  listing uuid,
  gone_at timestamptz not null default now(),
  primary key (user_id, inst_id)
);
alter table trade_gone enable row level security;
revoke all on trade_gone from anon, authenticated;
grant select on trade_gone to authenticated;
drop policy if exists trade_gone_admin on trade_gone;
create policy trade_gone_admin on trade_gone for select using ((select is_admin()));

insert into trade_gone (user_id, inst_id, listing, gone_at)
select owner, mon ->> 'id', id, coalesce(taken_at, now()) from trade_listings
where status = 'taken' and owner is not null and mon ->> 'id' is not null
union all
select taker, taker_mon ->> 'id', id, coalesce(taken_at, now()) from trade_listings
where status = 'taken' and taker is not null and taker_mon ->> 'id' is not null
on conflict do nothing;

-- A listing posted, or taken: the giver isn't banned, and the Pokémon isn't in another trade or gone in one. Checked
-- again under a lock on the giver, so two tabs posting the same Pokémon at once can't both pass trade_post's check.
-- A trade done: both Pokémon are gone for good from their trainers.
create or replace function trade_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid;
  inst text;
begin
  if tg_op = 'INSERT' then
    who := new.owner;
    inst := new.mon ->> 'id';
  elsif new.status = 'taken' and old.status is distinct from 'taken' then
    who := new.taker;
    inst := new.taker_mon ->> 'id';
  else
    return new;
  end if;
  if who is null or inst is null then return new; end if;
  if is_banned(who) then raise exception 'trades_off'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trade_guard:' || who::text, 0));
  if exists (select 1 from trade_gone g where g.user_id = who and g.inst_id = inst)
     or exists (select 1 from trade_listings t
                where t.id <> new.id and t.owner = who and t.status = 'open' and t.mon ->> 'id' = inst)
     or exists (select 1 from trade_listings t
                where t.id <> new.id and t.taker = who and not t.taker_applied and t.taker_mon ->> 'id' = inst) then
    raise exception 'trades_listed';
  end if;
  if tg_op = 'UPDATE' then
    insert into trade_gone (user_id, inst_id, listing)
    select x.u, x.i, new.id from (values (new.owner, new.mon ->> 'id'), (new.taker, inst)) x(u, i)
    where x.u is not null and x.i is not null
    on conflict do nothing;
  end if;
  return new;
end
$$;
revoke all on function trade_guard() from public, anon, authenticated;
drop trigger if exists trade_listings_guard on trade_listings;
create trigger trade_listings_guard before insert or update of status on trade_listings
  for each row execute function trade_guard();

-- ---------------------------------------------------------------- 3. boards

create or replace function player_cards_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := name_clean(new.name);
  new.updated_at := least(new.updated_at, now());
  return new;
end
$$;
revoke all on function player_cards_guard() from public, anon, authenticated;
drop trigger if exists player_cards_guard on player_cards;
create trigger player_cards_guard before insert or update on player_cards
  for each row execute function player_cards_guard();

-- The most species a region's Pokédex can hold: its national numbers up to its last one (a region's Pokédex counts
-- the earlier regions' species too), and every form. A small world declares no range: every species.
create or replace function region_dex_cap(p_region text)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (select count(*)::int from pokemon p where p.dex <= (r.dex_range ->> 1)::int or p.form is not null)
    from regions r
    where r.id = p_region and (r.dex_range ->> 1) ~ '^[0-9]{1,4}$' and (r.dex_range ->> 1)::int < 10000
  ), (select count(*)::int from pokemon))
$$;
revoke all on function region_dex_cap(text) from public, anon, authenticated;

create or replace function card_regions_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A region the game doesn't have (an edited save's `parked`): no row.
  if not exists (select 1 from regions r where r.id = new.region) then return null; end if;
  new.max_level := least(greatest(coalesce(new.max_level, 0), 0), 100);
  new.pokedex := least(greatest(coalesce(new.pokedex, 0), 0), region_dex_cap(new.region));
  new.shinies := greatest(coalesce(new.shinies, 0), 0);
  new.team := coalesce((
    select jsonb_agg(jsonb_build_object(
      'dex', (m ->> 'dex')::int,
      'level', least(100, greatest(1, coalesce((m ->> 'level')::int, 1))),
      'shiny', coalesce((m -> 'shiny') = 'true'::jsonb, false)
    ) order by o)
    from jsonb_array_elements(case when jsonb_typeof(new.team) = 'array' then new.team else '[]' end)
      with ordinality t(m, o)
    where o <= 6 and mon_known(m -> 'dex') and (m ->> 'level') ~ '^[0-9]{1,6}$'
  ), '[]');
  -- Progress on the game's areas only (the board sums those alone), never more gyms than the area has.
  new.progress := coalesce((
    select jsonb_object_agg(e.k, e.v || jsonb_build_object('gyms', least(
      greatest(coalesce(case when jsonb_typeof(e.v -> 'gyms') = 'number' then (e.v ->> 'gyms')::int end, 0), 0),
      case when jsonb_typeof(a.gyms) = 'array' then jsonb_array_length(a.gyms) else 0 end)))
    from jsonb_each(case when jsonb_typeof(new.progress) = 'object' then new.progress else '{}' end) e(k, v)
    join areas a on a.id::text = e.k
    where jsonb_typeof(e.v) = 'object'
  ), '{}');
  return new;
end
$$;
revoke all on function card_regions_guard() from public, anon, authenticated;
drop trigger if exists card_regions_guard on player_card_regions;
create trigger card_regions_guard before insert or update on player_card_regions
  for each row execute function card_regions_guard();

delete from player_card_regions c where not exists (select 1 from regions r where r.id = c.region);
-- The cards written before, through the guard: a no-op update runs it once on every row.
update player_card_regions set max_level = max_level;
update player_cards set name = name;

-- ---------------------------------------------------------------- 4. Extreme speedrun

-- 0087's, on the server's clock: `p_at` (the save's own stamp) is no longer read.
create or replace function extreme_runs_write(p_user uuid, d jsonb, p_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
  rid text;
  started numeric;
  finished numeric;
  claimed bigint;
  cur record;
  seen timestamptz;
  watched bigint;
  took bigint;
  floor_ms bigint := coalesce((
    select (value ->> 'minRunMs')::bigint from game_config
    where key = 'extreme' and jsonb_typeof(value -> 'minRunMs') = 'number'), 1800000);
begin
  if jsonb_typeof(d -> 'extreme' -> 'runs') <> 'object' then return; end if;
  for k, v in select * from jsonb_each(d -> 'extreme' -> 'runs') loop
    if jsonb_typeof(v) <> 'object' or jsonb_typeof(v -> 'id') <> 'string' or jsonb_typeof(v -> 'startedAt') <> 'number' then
      continue;
    end if;
    rid := left(v ->> 'id', 80);
    started := (v ->> 'startedAt')::numeric;
    finished := case when jsonb_typeof(v -> 'finishedAt') = 'number' then (v ->> 'finishedAt')::numeric end;
    select * into cur from player_card_regions r where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    if not found then continue; end if;
    -- A new run (a start or a restart): the server's clock for it starts now.
    seen := case when cur.run_id is distinct from rid then now() else coalesce(cur.run_seen, now()) end;
    if finished is not null and (cur.run_id is distinct from rid or cur.run_won is null) then
      -- Its League, first seen won now.
      claimed := greatest(0, least(finished - started, 9e15))::bigint;
      watched := greatest(0, floor(extract(epoch from (now() - seen)) * 1000))::bigint;
      took := greatest(claimed, watched);
      update player_card_regions r set
        run_id = rid, run_seen = seen, run_claimed = started::bigint, run_won = now(),
        best_ms = case
          when coalesce((v -> 'untimed') = 'true'::jsonb, false) then r.best_ms
          -- First seen already won: the server watched none of it.
          when cur.run_id is distinct from rid then r.best_ms
          when took < floor_ms then r.best_ms
          else least(coalesce(r.best_ms, took), took)
        end
      where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    elsif cur.run_id is distinct from rid or (finished is null and cur.run_won is not null) then
      update player_card_regions r set run_id = rid, run_seen = seen, run_claimed = started::bigint, run_won = null
      where r.user_id = p_user and r.realm = 'extreme' and r.region = k;
    end if;
  end loop;
end
$$;
revoke all on function extreme_runs_write(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- 5. raids

-- 0045's: and a team registered for it at least 30 s before (the game registers it as the fight starts).
create or replace function raid_close(p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  st event_state;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  select * into st from event_state es where es.user_id = me and es.realm = p_realm for update;
  if st.raid is null or st.raid ->> 'day' <> today then raise exception 'events_no_raid'; end if;
  if coalesce((st.raid ->> 'caught')::boolean, false) then
    return jsonb_build_object('raidsWon', st.raids_won, 'gifts', 0);
  end if;
  if not exists (
    select 1 from raid_teams t where t.user_id = me and t.realm = p_realm and t.updated_at <= now() - interval '30 seconds'
  ) then
    raise exception 'events_no_fight';
  end if;
  update event_state es
    set raid = jsonb_set(st.raid, '{caught}', 'true'), raids_won = st.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning * into st;
  return jsonb_build_object('raidsWon', st.raids_won,
    'gifts', raid_give_gifts(me, p_helpers, (st.raid ->> 'dex')::int, p_realm));
end $$;

-- 0060's: and a team registered on it at least 30 s before, and at most 20 a UTC day (the record is 13).
create or replace function raid_progress_close(p_key text, p_helpers uuid[] default '{}', p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  won int;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null then raise exception 'events_bad_raid'; end if;
  if raid_progress_special_locked(p_key, p_realm) then raise exception 'events_raid_locked'; end if;
  if not exists (select 1 from raid_progress_done d where d.user_id = me and d.realm = p_realm and d.raid_key = p_key) then
    if not exists (
      select 1 from raid_progress_teams t
      where t.user_id = me and t.realm = p_realm and t.raid_key = p_key and t.updated_at <= now() - interval '30 seconds'
    ) then
      raise exception 'events_no_fight';
    end if;
    if (select count(*) from raid_progress_done d
        where d.user_id = me and d.done_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= 20 then
      raise exception 'events_too_many';
    end if;
  end if;
  insert into event_state (user_id, realm) values (me, p_realm) on conflict (user_id, realm) do nothing;
  insert into raid_progress_done (user_id, realm, raid_key, dex) values (me, p_realm, p_key, dex)
  on conflict (user_id, realm, raid_key) do nothing;
  if not found then
    select es.raids_won into won from event_state es where es.user_id = me and es.realm = p_realm;
    return jsonb_build_object('raidsWon', won, 'gifts', 0);
  end if;
  update event_state es set raids_won = es.raids_won + 1, updated_at = now()
    where es.user_id = me and es.realm = p_realm
    returning es.raids_won into won;
  return jsonb_build_object('raidsWon', won, 'gifts', raid_give_gifts(me, p_helpers, dex, p_realm, p_key));
end $$;

-- ---------------------------------------------------------------- 6. Versus League

update game_config set value = jsonb_set(value, '{minWinSeconds}', '30')
where key = 'versusLeague' and jsonb_typeof(value) = 'object'
  and (not value ? 'minWinSeconds' or (jsonb_typeof(value -> 'minWinSeconds') = 'number'
       and (value ->> 'minWinSeconds')::numeric < 30));

-- 0082's: a banned player can't start; the player's unfinished match ends as the leave it was recorded as, so there is
-- only ever one match under way.
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
  if is_banned(me) then raise exception 'versus_no_team'; end if;
  select v.team into mine from versus_teams v where v.user_id = me and v.realm = 'main';
  if mine is null then raise exception 'versus_no_team'; end if;
  select * into ch from versus_league_choices c where c.user_id = me and c.slot = p_slot and c.week = wk;
  if not found then raise exception 'versus_league_no_choice'; end if;
  perform versus_league_join(me, wk);
  select m.trophies into before from versus_league_members m where m.week = wk and m.user_id = me for update;
  -- Its trophies were already taken as a leave when it started: it only ends.
  update versus_league_matches x set finished_at = now(), outcome = 'left'
  where x.user_id = me and x.finished_at is null;
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

-- 0082's: and a win has at least one attack in its log.
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
  if p_outcome = 'won' and not exists (select 1 from jsonb_array_elements(p_moves) e where e ->> 't' = 'ATTACK') then
    raise exception 'versus_league_bad_result';
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

-- ---------------------------------------------------------------- 7. teams others meet

-- Every member a Pokémon the game has, its level 1–100.
create or replace function team_known(p_team jsonb)
returns boolean
language sql stable security definer set search_path = public as $$
  select jsonb_typeof(p_team) = 'array' and not exists (
    select 1 from jsonb_array_elements(p_team) m
    where not mon_known(m -> 'dex') or jsonb_typeof(m -> 'level') <> 'number'
       or (m ->> 'level')::numeric not between 1 and 100
  )
$$;
revoke all on function team_known(jsonb) from public, anon, authenticated;

-- Versus and raid teams: set through the players' own calls, so a bad one is refused with the call's own error.
create or replace function team_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  code text := case when tg_table_name = 'versus_teams' then 'versus_not_eligible' else 'events_not_eligible' end;
begin
  if is_banned(new.user_id) or not team_known(new.team) then raise exception '%', code; end if;
  return new;
end
$$;
revoke all on function team_guard() from public, anon, authenticated;
drop trigger if exists versus_teams_guard on versus_teams;
create trigger versus_teams_guard before insert or update of team on versus_teams
  for each row execute function team_guard();
drop trigger if exists raid_teams_guard on raid_teams;
create trigger raid_teams_guard before insert or update of team on raid_teams
  for each row execute function team_guard();
drop trigger if exists raid_progress_teams_guard on raid_progress_teams;
create trigger raid_progress_teams_guard before insert or update of team on raid_progress_teams
  for each row execute function team_guard();

-- Area versus: written while the save uploads, which must never fail, so a bad team is skipped, not refused.
create or replace function area_versus_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_banned(new.user_id) or not team_known(new.team) then return null; end if;
  new.name := name_clean(new.name);
  new.played_at := least(new.played_at, now());
  return new;
end
$$;
revoke all on function area_versus_guard() from public, anon, authenticated;
drop trigger if exists area_versus_teams_guard on area_versus_teams;
create trigger area_versus_teams_guard before insert or update on area_versus_teams
  for each row execute function area_versus_guard();

-- At most 30 new Versus teams a player a UTC day: each is a new team to beat, so a second account can't hand out
-- endless ones. Honest players change theirs a few times at most.
create table if not exists versus_team_bumps (
  user_id uuid not null,
  realm text not null,
  day date not null,
  n int not null default 0,
  primary key (user_id, realm, day)
);
alter table versus_team_bumps enable row level security;
revoke all on versus_team_bumps from anon, authenticated;

create or replace function versus_teams_bump()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'UTC')::date;
  k int;
begin
  if new.version is not distinct from old.version then return new; end if;
  insert into versus_team_bumps as b (user_id, realm, day, n) values (new.user_id, new.realm, today, 1)
  on conflict (user_id, realm, day) do update set n = b.n + 1
  returning b.n into k;
  delete from versus_team_bumps b where b.day < today - 1;
  if k > 30 then raise exception 'versus_too_many'; end if;
  return new;
end
$$;
revoke all on function versus_teams_bump() from public, anon, authenticated;
drop trigger if exists versus_teams_bump on versus_teams;
create trigger versus_teams_bump before update of version on versus_teams
  for each row execute function versus_teams_bump();

-- ---------------------------------------------------------------- 8. a ban is a ban from everything shared

create or replace function bans_apply()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from versus_teams where user_id = new.user_id;
  delete from raid_teams where user_id = new.user_id;
  delete from raid_progress_teams where user_id = new.user_id;
  delete from area_versus_teams where user_id = new.user_id;
  -- Their open listings end: each Pokémon goes back to its owner, as a cancel does.
  update trade_listings set status = 'cancelled' where owner = new.user_id and status = 'open';
  update versus_league_members set trophies = 0 where user_id = new.user_id and week = versus_league_week();
  delete from versus_league_choices where foe_user = new.user_id;
  return null;
end
$$;
revoke all on function bans_apply() from public, anon, authenticated;
drop trigger if exists leaderboard_bans_apply on leaderboard_bans;
create trigger leaderboard_bans_apply after insert on leaderboard_bans
  for each row execute function bans_apply();

-- The players banned already.
delete from versus_teams v where is_banned(v.user_id);
delete from raid_teams v where is_banned(v.user_id);
delete from raid_progress_teams v where is_banned(v.user_id);
delete from area_versus_teams v where is_banned(v.user_id);
update trade_listings t set status = 'cancelled' where t.status = 'open' and is_banned(t.owner);
delete from versus_league_choices c where is_banned(c.foe_user);

-- ---------------------------------------------------------------- 9. Versus fights recorded

create or replace function versus_battles_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_banned(new.attacker_id) then raise exception 'versus_no_team'; end if;
  if (select count(*) from versus_battles b
      where b.attacker_id = new.attacker_id and b.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'versus_too_many';
  end if;
  return new;
end
$$;
revoke all on function versus_battles_guard() from public, anon, authenticated;
create index if not exists versus_battles_attacker_at on versus_battles (attacker_id, created_at);
drop trigger if exists versus_battles_guard on versus_battles;
create trigger versus_battles_guard before insert on versus_battles
  for each row execute function versus_battles_guard();

-- ---------------------------------------------------------------- 10. saves

revoke delete on saves from authenticated;
alter table saves drop constraint if exists saves_small;
alter table saves add constraint saves_small check (pg_column_size(data) < 8000000) not valid;

-- ---------------------------------------------------------------- 11. push (still Off)

create or replace function push_subscriptions_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- The browsers' push services only: Chrome, Edge and Android (FCM), Firefox, Safari, Windows.
  if substring(new.endpoint from '^https://([^/:]+)') !~
     '^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$' then
    raise exception 'push_bad_subscription' using errcode = '22023';
  end if;
  return new;
end
$$;
revoke all on function push_subscriptions_guard() from public, anon, authenticated;
drop trigger if exists push_subscriptions_guard on push_subscriptions;
create trigger push_subscriptions_guard before insert or update of endpoint on push_subscriptions
  for each row execute function push_subscriptions_guard();

create or replace function push_notices_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Already overdue: old news, and one due hours ago would jump the queue ahead of the real ones.
  if new.sent_at is null and new.due_at < now() - interval '10 minutes' then return null; end if;
  return new;
end
$$;
revoke all on function push_notices_guard() from public, anon, authenticated;
drop trigger if exists push_notices_guard on push_notices;
create trigger push_notices_guard before insert or update of due_at on push_notices
  for each row execute function push_notices_guard();

-- ---------------------------------------------------------------- 12. guests

-- A guest's device id is the guest's own word, so feedback_stamp's limit per device can't hold them: at most 20 guest
-- messages every 10 minutes between them all (the record is 1).
create or replace function feedback_guest_cap()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- The game's own messages (feedback_system) are the server's; a guest's `from_admin` is their own word.
  if auth.uid() is null and not (coalesce(new.from_admin, false) and feedback_system()) and (
    select count(*) from feedback f
    where f.user_id is null and not f.from_admin and f.created_at > now() - interval '10 minutes'
  ) >= 20 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function feedback_guest_cap() from public, anon, authenticated;
drop trigger if exists feedback_guest_cap on feedback;
create trigger feedback_guest_cap before insert on feedback
  for each row execute function feedback_guest_cap();

-- A new guest in the analytics: past 3,000 new ones in a UTC day (the record is 361), the day's further new guests are
-- left out (made-up device ids). Guests already known, and signed-in players, always count.
create or replace function analytics_guest_full(p_player text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_player not like 'device:%' then return false; end if;
  if exists (select 1 from players x where x.player = p_player) then return false; end if;
  return (select count(*) from players x
          where x.user_id is null and x.first_day >= (now() at time zone 'UTC')::date - 1) >= 3000;
end
$$;
revoke all on function analytics_guest_full(text) from public, anon, authenticated;

create or replace function analytics_guest_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if analytics_guest_full(new.player) then return null; end if;
  return new;
end
$$;
revoke all on function analytics_guest_guard() from public, anon, authenticated;
drop trigger if exists players_guest_guard on players;
create trigger players_guest_guard before insert on players
  for each row execute function analytics_guest_guard();
drop trigger if exists player_days_guest_guard on player_days;
create trigger player_days_guest_guard before insert on player_days
  for each row execute function analytics_guest_guard();
drop trigger if exists player_hours_guest_guard on player_hours;
create trigger player_hours_guest_guard before insert on player_hours
  for each row execute function analytics_guest_guard();

-- ---------------------------------------------------------------- 13. the admin's suspicious list

-- Every save (both realms) with something no honest game has reached, and why: on demand only (about a second), the
-- admin's button. The numbers are 2026-11-01's records, well above any honest player's.
create or replace function admin_suspicious()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    with caps as materialized (select r.id, region_dex_cap(r.id) as cap from regions r)
    select jsonb_agg(to_jsonb(x) order by jsonb_array_length(x.reasons) desc, x.box desc)
    from (
      select s.user_id, s.realm,
        coalesce(c.name, 'Trainer') as name,
        st.box, st.shinies, st.lv100,
        st.gold, st.candies, st.masters, st.top_stack,
        coalesce(pl.days, 0) as days,
        pl.first_day,
        st.dupes,
        st.dex_over,
        st.future,
        is_banned(s.user_id) as banned,
        to_jsonb(array_remove(array[
          case when st.box > 300 and st.box > 150 * greatest(coalesce(pl.days, 1), 1) then 'box' end,
          case when st.shinies > 300 or (st.shinies >= 30 and st.shinies > 0.2 * st.box) then 'shinies' end,
          case when st.lv100 > 300 then 'levels' end,
          case when st.gold > 5000000 then 'gold' end,
          case when st.candies > 1000 or st.masters > 100 or st.top_stack > 9999 then 'items' end,
          case when st.dupes > 0 then 'trade' end,
          case when st.dex_over then 'dex' end,
          case when st.future then 'future' end
        ], null)) as reasons
      from saves s
      left join player_cards c on c.user_id = s.user_id and c.realm = s.realm
      left join players pl on pl.player = s.user_id::text
      cross join lateral (
        with mons as (
          select m from jsonb_array_elements(coalesce(s.data -> 'box', '[]')) m
          union all
          select m from jsonb_each(coalesce(s.data -> 'parked', '{}')) p(k, v),
            jsonb_array_elements(case when jsonb_typeof(v -> 'box') = 'array' then v -> 'box' else '[]' end) m
          where jsonb_typeof(v) = 'object'
        ), inv as (
          select k, case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric else 0 end as n
          from jsonb_each(case when jsonb_typeof(s.data -> 'inventory') = 'object' then s.data -> 'inventory' else '{}' end) i(k, v)
        )
        select
          (select count(*)::int from mons) as box,
          (select count(*)::int from mons where m -> 'shiny' = 'true'::jsonb) as shinies,
          (select count(*)::int from mons where (m ->> 'level') ~ '^[0-9]+$' and (m ->> 'level')::numeric >= 100) as lv100,
          case when jsonb_typeof(s.data -> 'gold') = 'number' then (s.data ->> 'gold')::numeric else 0 end as gold,
          coalesce((select n from inv where k = 'rare-candy'), 0) as candies,
          coalesce((select n from inv where k = 'master-ball'), 0) as masters,
          coalesce((select max(n) from inv), 0) as top_stack,
          -- Pokémon given in a trade and still held.
          (select count(*)::int from trade_gone g
            where g.user_id = s.user_id and s.realm = 'main' and exists (select 1 from mons where m ->> 'id' = g.inst_id)) as dupes,
          exists (select 1 from player_card_regions r join caps cp on cp.id = r.region
                  where r.user_id = s.user_id and r.realm = s.realm and r.pokedex >= cp.cap) as dex_over,
          s.updated_at > now() + interval '1 hour'
            or exists (select 1 from mons where jsonb_typeof(m -> 'caughtAt') = 'number'
                       and (m ->> 'caughtAt')::numeric > extract(epoch from now() + interval '1 day') * 1000) as future
      ) st
    ) x
    where jsonb_array_length(x.reasons) > 0
  ), '[]'::jsonb);
end
$$;
revoke all on function admin_suspicious() from public, anon;
grant execute on function admin_suspicious() to authenticated;

commit;
