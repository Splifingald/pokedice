-- Players online, the list (docs/70 §2): VIEW beside the side menu's count opens the players online, up to 30, the
-- closest to the caller in badges when there are more.
--
-- 1. online_here gets each player's card, sent with the ping: their name (12 characters, as the leaderboard's), their
--    look (an avatar id, the game draws it; an unknown one is Red) and their badges, every region's together (the main
--    save's, as global messages count them, docs/69). On the game's word, as a guest's badges are for those messages:
--    a card says no more than the leaderboard already shows.
-- 2. online_ping(device id, name, look, badges): the same call, now with the card. The old one-argument function goes,
--    so an older build's call (the device id alone) lands on this one and stamps a row with no card.
-- 3. online_players(device id): up to 30 rows heard from in the last 6 minutes with a card, the closest to the
--    caller's badges first (then the most recent), returned most badges first: {name, look, badges, me}. No id,
--    account or device leaves the server. A caller with no card yet (an older build) is taken as 0 badges.
--
-- Run after 0144. Safe to run again. supabase/seed.sql doesn't inline it.

begin;

-- ---------------------------------------------------------------- 1. the card

alter table online_here add column if not exists name text;
alter table online_here add column if not exists look text;
alter table online_here add column if not exists badges int;

-- ---------------------------------------------------------------- 2. the ping, with the card

drop function if exists online_ping(text);

create or replace function online_ping(
  p_device_id text,
  p_name text default null,
  p_look text default null,
  p_badges int default null
)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me text := coalesce(auth.uid()::text, 'device:' || nullif(trim(p_device_id), ''));
  nm text := left(coalesce(nullif(trim(p_name), ''), 'Trainer'), 12);
  lk text := case when p_look ~ '^[a-z0-9/_-]{1,60}$' then p_look end;
  bd int := case when p_badges between 0 and 999 then p_badges end;
begin
  -- A device id is the game's own (a UUID); anything longer is a hand-made call, counted as nobody.
  if me is not null and length(me) <= 80 then
    insert into online_here (who, at, name, look, badges)
    values (me, now(), case when bd is not null then nm end, lk, bd)
    on conflict (who) do update
      set at = excluded.at, name = excluded.name, look = excluded.look, badges = excluded.badges;
  end if;
  -- The ones gone a while, now and then rather than on every call (a few hundred rows at most either way).
  if random() < 0.05 then delete from online_here h where h.at < now() - interval '1 hour'; end if;
  return (select count(*)::int from online_here h where h.at > now() - interval '6 minutes');
end
$$;

-- ---------------------------------------------------------------- 3. the list

create or replace function online_players(p_device_id text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select coalesce(auth.uid()::text, 'device:' || nullif(trim(p_device_id), '')) as who
  ), my_badges as (
    select coalesce((select h.badges from online_here h, mine where h.who = mine.who), 0) as n
  ), picked as (
    select h.name, h.look, h.badges, h.who = (select who from mine) as me
    from online_here h, my_badges
    where h.at > now() - interval '6 minutes' and h.badges is not null
    order by abs(h.badges - my_badges.n), h.at desc
    limit 30
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('name', name, 'look', look, 'badges', badges, 'me', me) order by badges desc, me desc, name),
    '[]'::jsonb
  )
  from picked
$$;

revoke all on function online_ping(text, text, text, int), online_players(text) from public;
grant execute on function online_ping(text, text, text, int), online_players(text) to anon, authenticated;

commit;
