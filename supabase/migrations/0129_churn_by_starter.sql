-- Admin → Analytics, churn by starter (docs/57 §3.1): next to churn by area, the same players counted by the Pokémon
-- they picked at the very start of the game (Kanto's starter, the first region's).
--
-- 1. players.starter: that Pokémon's dex number. The daily ping's snapshot now carries it (`starter`), and a trigger
--    copies it into the column whenever a snapshot arrives, so player_ping and the guest merge (0102) stay as they are.
--    A snapshot without it (a build from before this one, an Extreme save sends none) leaves the column as it was.
-- 2. Once, for the players already there:
--    - signed in: from their main cloud save, exactly (Kanto's Pokédex's first entry, live or parked);
--    - the others (guests): from their latest snapshot, when it was taken in Kanto and its Pokédex holds exactly one of
--      Kanto's starters. Every Kanto Pokédex holds its own starter, so one alone is theirs; with two or more (one
--      given later) the player stays with no known starter.
-- 3. analytics_churn(days, since) (0102), same signature: `starters` {dex: [churned, active, churned's average days
--    played, active's]} and `noStarter` [churned, active] next to the areas. The deployed build ignores both.
--
-- Run after 0102 (and 0016, 0039: regions, areas.region_id and saves.realm). Safe to run again: the backfill only
-- fills a starter still missing. Not in seed.sql, as no analytics migration is.
begin;

alter table players add column if not exists starter int;

-- ---------------------------------------------------------------- 1. the snapshot's starter into the column
-- A dex number from 1 to 2000, else nothing: the snapshot is the player's own JSON.
create or replace function players_starter_from_snapshot()
returns trigger
language plpgsql set search_path = public as $$
declare
  s jsonb := new.snapshot -> 'starter';
begin
  if jsonb_typeof(s) = 'number' and s::text ~ '^[0-9]{1,4}$' and s::text::int between 1 and 2000 then
    new.starter := s::text::int;
  end if;
  return new;
end
$$;
revoke all on function players_starter_from_snapshot() from public, anon, authenticated;

drop trigger if exists players_starter on players;
create trigger players_starter before insert or update of snapshot on players
for each row execute function players_starter_from_snapshot();

-- ---------------------------------------------------------------- 2. once: the players already there
-- Signed in: the main save's Kanto block, the live one or the parked one.
update players p set starter = x.dex::int
from (
  select s.user_id::text as player,
         case when coalesce(s.data ->> 'region', 'kanto') = 'kanto' then s.data #>> '{pokedex,0}'
              else s.data #>> '{parked,kanto,pokedex,0}' end as dex
  from saves s
  where s.realm = 'main'
) x
where p.player = x.player and p.starter is null and x.dex ~ '^[0-9]{1,4}$' and x.dex::int between 1 and 2000;

-- The rest: a snapshot taken in Kanto whose Pokédex holds exactly one of Kanto's starters.
update players p set starter = x.dex
from (
  select q.player, min(k.dex) as dex
  from players q
  join areas a on a.id::text = q.snapshot ->> 'areaId' and a.region_id = 'kanto'
  cross join lateral (
    select (v #>> '{}')::int as dex
    from regions r, jsonb_array_elements(r.starters) v
    where r.id = 'kanto' and jsonb_typeof(v) = 'number'
  ) k
  where q.starter is null and jsonb_typeof(q.snapshot -> 'dex') = 'array' and q.snapshot -> 'dex' @> to_jsonb(k.dex)
  group by q.player
  having count(*) = 1
) x
where p.player = x.player and p.starter is null;

-- ---------------------------------------------------------------- 3. churn by area and by starter, for the admin
-- As in 0102, with the starters next to the areas: a player is churned when their last day is p_days or more before
-- today (UTC), else active; only players whose first day is on or after p_since (null: everyone). {today, cutoff,
-- areas: {area id: [churned, active, churned's average days played, active's]}, unknown: [churned, active] with no
-- area, starters: {dex: [the same four]}, noStarter: [churned, active] with no starter known}.
create or replace function analytics_churn(p_days int, p_since date default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'UTC')::date;
  cutoff date;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'bad days' using errcode = '22023';
  end if;
  cutoff := today - p_days;
  return (
    with x as (
      select coalesce(nullif(last_area, ''), nullif(snapshot ->> 'areaId', '')) as area, starter,
             last_day <= cutoff as gone, days
      from players
      where p_since is null or first_day >= p_since
    )
    select json_build_object(
      'today', today,
      'cutoff', cutoff,
      'areas', coalesce((
        select json_object_agg(area, json_build_array(churned, active, churned_days, active_days))
        from (
          select area,
                 count(*) filter (where gone)::int as churned,
                 count(*) filter (where not gone)::int as active,
                 round(avg(days) filter (where gone), 1) as churned_days,
                 round(avg(days) filter (where not gone), 1) as active_days
          from x
          where area is not null
          group by area
        ) a
      ), '{}'::json),
      'unknown', (
        select json_build_array(count(*) filter (where gone)::int, count(*) filter (where not gone)::int)
        from x
        where area is null
      ),
      'starters', coalesce((
        select json_object_agg(starter, json_build_array(churned, active, churned_days, active_days))
        from (
          select starter,
                 count(*) filter (where gone)::int as churned,
                 count(*) filter (where not gone)::int as active,
                 round(avg(days) filter (where gone), 1) as churned_days,
                 round(avg(days) filter (where not gone), 1) as active_days
          from x
          where starter is not null
          group by starter
        ) s
      ), '{}'::json),
      'noStarter', (
        select json_build_array(count(*) filter (where gone)::int, count(*) filter (where not gone)::int)
        from x
        where starter is null
      )
    )
  );
end
$$;
revoke all on function analytics_churn(int, date) from public, anon;
grant execute on function analytics_churn(int, date) to authenticated;

commit;
