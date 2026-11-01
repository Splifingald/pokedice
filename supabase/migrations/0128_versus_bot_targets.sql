-- The Versus league's bots stop following the players of their group (docs/44 §11, the user's rule, 2026-11-01: "bots
-- shouldn't adapt to the group difficulty, they should be consistent no matter what the real players do"). Until now a
-- bot seated on Wednesday to Friday headed for a random player's trophies, projected to Sunday, ×0.6 to ×1.25: a group
-- with one player far ahead filled with bots far ahead too (and stronger teams, the tier following the trophies). Now
-- every bot's trophies by Sunday night are drawn from `botTargets` (Admin, [20, 250] by default) and nothing else: the
-- roll squared, so most sit low and few high (engine/versusLeague.ts botTargetOf, the same sum), and each day's bots of
-- a group spread over the whole range (bot i of k rolls within the i-th k-th), so no group gets five strong ones by
-- luck. Bots already seated keep where they were headed.
--
-- Run after 0082 and 0092; safe to run again. Running 0082 or 0092 again after it undoes it: run this again then.

-- The game's defaults, with `botTargets` (engine/versusLeague.ts VERSUS_LEAGUE_DEFAULTS; tests/versus-league-sql.test.ts
-- keeps them the same).
create or replace function versus_league_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{"access": "off", "trophies": [3, 6, 10], "safeBelow": 100, "groupSize": 20, "groupFill": 16,
           "botsPerDay": 5, "botDays": [3, 4, 5], "range": 0.15, "rangeMin": 30, "minWinSeconds": 5,
           "secondsPerMove": 0.2, "botTiers": [0, 100, 250, 500], "botTargets": [20, 250], "goldPerTrophy": 1,
           "rewards": [{"upTo": 1, "raidBalls": 5, "rareCandies": 10}, {"upTo": 2, "raidBalls": 2, "rareCandies": 5},
                       {"upTo": 3, "raidBalls": 1, "rareCandies": 3}, {"upTo": 5, "raidBalls": 0, "rareCandies": 3},
                       {"upTo": 10, "raidBalls": 0, "rareCandies": 1}]}'::jsonb
         || coalesce((select value from game_config where key = 'versusLeague' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- Where a bot's trophies are headed for a roll in [0, 1) (engine botTargetOf): between the two ends, the roll squared.
create or replace function versus_league_bot_target(p_roll double precision, cfg jsonb)
returns int
language sql immutable set search_path = public as $$
  with e as (
    select greatest(0, least((cfg -> 'botTargets' ->> 0)::numeric, (cfg -> 'botTargets' ->> 1)::numeric)) lo,
           greatest((cfg -> 'botTargets' ->> 0)::numeric, (cfg -> 'botTargets' ->> 1)::numeric) hi,
           least(1, greatest(0, p_roll))::numeric r
  )
  -- Half away from zero, as the engine's Math.round for these (never negative) values.
  select round(lo + (hi - lo) * r * r)::int from e
$$;

-- Bots take the empty places of the week's groups: up to `botsPerDay` a group with room. Each one's trophies are headed
-- for a place drawn from `botTargets` alone, whoever the group's players are; its team of the tier for that, from the
-- week's set. (0092's, but for where the bot is headed.)
create or replace function versus_league_seat_bots(p_week date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := versus_league_cfg();
  g record;
  k int;
  i int;
  target int;
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
      target := versus_league_bot_target((i - 1 + random()) / k, cfg);
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

-- ---------------------------------------------------------------- grants

-- Supabase grants every new function to anon and authenticated by default: the sum is the server's own.
revoke all on function versus_league_bot_target(double precision, jsonb) from public, anon, authenticated;
