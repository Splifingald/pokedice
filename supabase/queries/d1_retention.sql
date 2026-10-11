-- D1 retention over the last 3 days: of the players whose first day is one of the 3 most recent days with a finished
-- day 1, and who were active that day (≥ 3 events), the share who came back the next calendar day (≥ 1 event).
-- Same rules as src/analytics/retention.ts (Admin → Analytics), so the numbers line up with the dashboard.
--
-- With today = T, the cohorts are T-4, T-3 and T-2: their day 1 (T-3, T-2, T-1) is over. Yesterday's new players are
-- left out because their day 1 is today and still running — counting it early would understate the rate.
--
-- Reads the running totals (0021), not analytics_events: they keep every player's whole history, so a player's first
-- day is right even after analytics_prune() has deleted their old events. Run it in the Supabase SQL editor (the totals
-- are closed to anon / authenticated). One row per cohort day, then the pooled total (first_day = null).
with params as (
  select 'UTC'::text as tz,             -- calendar days in this zone (the dashboard uses the viewer's own)
         3 as cohort_days,              -- how many first days to measure
         3 as min_first_day_events      -- RETENTION_MIN_FIRST_DAY_EVENTS
),
player_days as (
  select h.player, (h.hour at time zone p.tz)::date as day, sum(h.events)::int as events
  from analytics_player_hours h
  cross join params p
  group by 1, 2
),
firsts as (
  select player, min(day) as first_day
  from player_days
  group by player
),
cohort as (
  select f.player, f.first_day, fd.events >= p.min_first_day_events as active, d1.player is not null as returned
  from firsts f
  cross join params p
  join player_days fd on fd.player = f.player and fd.day = f.first_day
  left join player_days d1 on d1.player = f.player and d1.day = f.first_day + 1
  where f.first_day between (now() at time zone p.tz)::date - 1 - p.cohort_days
                        and (now() at time zone p.tz)::date - 2
)
select first_day,
       count(*) filter (where active) as cohort,
       count(*) filter (where active and returned) as returned,
       round(100.0 * count(*) filter (where active and returned) / nullif(count(*) filter (where active), 0), 1)
         as d1_retention_pct,
       count(*) filter (where not active) as too_few_events
from cohort
group by rollup (first_day)
order by first_day nulls last;
