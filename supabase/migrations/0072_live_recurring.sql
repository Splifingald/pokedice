-- Live events that come back, and live events that overlap (docs/20 §9). A live event runs once (its `start` and
-- `end`) or comes back by itself (`repeat`): every year on a date, or on a weekday, every week or on some weeks of the
-- month, at a time (UTC) for some hours. Each run is an event of its own, `<id>@<YYYY-MM-DD>` (the UTC date it starts),
-- so the Underground's teams, kits and orbs start afresh each time, as they do between two one-off events. "End now"
-- on a recurring event ends one run only (`stops`: the run's date → when it ended).
--
-- 1. live_run_at(e, t): the run of one event that is on at `t` (its id and start), the engine's liveRuns
--    (src/engine/liveEvents.ts; tests/live-recurring-sql.test.ts keeps the two the same).
-- 2. ug_live(): 0063's, through it. Events may overlap now, except two Undergrounds (the admin refuses them); should
--    two be on anyway, the earliest started is the one, as in the game.
--
-- Run after 0063; safe to run again. seed.sql inlines it (scripts/seed.ts), after 0070.

-- ---------------------------------------------------------------- 1. a run on at a moment

create or replace function live_run_at(e jsonb, t timestamptz)
returns table (run text, starts timestamptz)
language plpgsql stable set search_path = public as $$
declare
  r jsonb := e -> 'repeat';
  kind text := r ->> 'kind';
  hours numeric;
  len interval;
  tod interval;
  d date;
  key text;
  s timestamptz;
  en timestamptz;
  stop timestamptz;
  ok boolean;
begin
  -- Once: between its start (included) and its end (excluded).
  if jsonb_typeof(r) is distinct from 'object' or kind is null or kind not in ('yearly', 'weekly') then
    if (e ->> 'start')::timestamptz <= t and t < (e ->> 'end')::timestamptz then
      run := e ->> 'id';
      starts := (e ->> 'start')::timestamptz;
      return next;
    end if;
    return;
  end if;
  -- At least an hour; a weekly run never reaches the next week's, a yearly one lasts a month at most.
  hours := case when coalesce(r ->> 'hours', '') ~ '^[0-9]+(\.[0-9]+)?$' and (r ->> 'hours')::numeric > 0 then (r ->> 'hours')::numeric else 24 end;
  len := interval '1 hour' * least(case kind when 'weekly' then 168 else 744 end, greatest(1, hours));
  tod := case when coalesce(r ->> 'time', '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then (r ->> 'time')::interval else interval '0' end;
  -- A run that started up to its length before `t` may still be on.
  for d in
    select g::date from generate_series(((t - len - tod) at time zone 'UTC')::date, (t at time zone 'UTC')::date, interval '1 day') g
  loop
    if kind = 'yearly' then
      ok := extract(month from d) = (r ->> 'month')::int and extract(day from d) = (r ->> 'day')::int;
    else
      ok := extract(dow from d) = (r ->> 'weekday')::int and (
        jsonb_typeof(r -> 'weeks') is distinct from 'array'
        or jsonb_array_length(r -> 'weeks') = 0
        or (r -> 'weeks') @> to_jsonb(ceil(extract(day from d) / 7.0)::int)
        or ((r -> 'weeks') @> '"last"'::jsonb and extract(month from d + 7) <> extract(month from d))
      );
    end if;
    if coalesce(ok, false) then
      key := to_char(d, 'YYYY-MM-DD');
      s := (d::timestamp + tod) at time zone 'UTC';
      en := s + len;
      stop := nullif(e -> 'stops' ->> key, '')::timestamptz;
      if stop is not null then
        en := greatest(s, least(en, stop));
      end if;
      if s <= t and t < en then
        run := (e ->> 'id') || '@' || key;
        starts := s;
        return next;
        return;
      end if;
    end if;
  end loop;
  return;
end $$;

-- ---------------------------------------------------------------- 2. the Underground running now

-- The id of the Underground live event's run on now (start included, end excluded), while the live events' switch and
-- the Underground's are on for the caller; null otherwise.
create or replace function ug_live()
returns text
language sql stable security definer set search_path = public as $$
  select x.run
  from game_config g,
    jsonb_array_elements(case when jsonb_typeof(g.value -> 'list') = 'array' then g.value -> 'list' else '[]'::jsonb end) e,
    lateral live_run_at(e, now()) x
  where g.key = 'liveEvents'
    and (g.value ->> 'access' = 'all' or (g.value ->> 'access' = 'admin' and is_admin()))
    and e ->> 'type' = 'underground'
    and ug_open()
  order by x.starts, x.run
  limit 1
$$;

revoke all on function live_run_at(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function ug_live() from public, anon, authenticated;
