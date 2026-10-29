-- The admin's view of the weekly Versus league (docs/44 §5): every group of this week (or last week), each one's members
-- ranked as their group's board ranks them, players and bots told apart, with the matches each player has fought this
-- week and how often each member was fought. Admin → Config → Versus league → "Fetch the groups" calls it when pressed,
-- never by itself. It only reads, and only for the admin (is_admin()); players never see bots for what they are.
-- Run after 0082; safe to run again.

create or replace function versus_league_admin_board(p_last boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  wk date := versus_league_week() - case when p_last then 7 else 0 end;
  groups jsonb;
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  with played as (
    -- A match counts as a leave from its start until its result is in: `open` are those not finished yet.
    select x.user_id,
           count(*) as matches,
           count(*) filter (where x.finished_at is not null and x.outcome = 'won') as won,
           count(*) filter (where x.finished_at is not null and x.outcome = 'lost') as lost,
           count(*) filter (where x.finished_at is not null and x.outcome = 'left') as leaves,
           count(*) filter (where x.finished_at is null) as open,
           max(x.started_at) as last_at
    from versus_league_matches x
    where x.week = wk
    group by x.user_id
  ),
  faced_player as (
    select x.foe_user as id, count(*) as n from versus_league_matches x
    where x.week = wk and x.foe_user is not null group by x.foe_user
  ),
  faced_bot as (
    select x.foe_bot as id, count(*) as n from versus_league_matches x
    where x.week = wk and x.foe_bot is not null group by x.foe_bot
  ),
  members as (
    select m.group_id,
           rank() over (partition by m.group_id order by m.trophies desc) as rk,
           coalesce(case when m.bot_id is not null then b.name else c.name end, 'Trainer') as name,
           m.trophies,
           jsonb_build_object(
             'userId', m.user_id,
             'botId', m.bot_id,
             'name', coalesce(case when m.bot_id is not null then b.name else c.name end, 'Trainer'),
             'avatar', coalesce(case when m.bot_id is not null then b.avatar else c.avatar end, 'red'),
             'team', coalesce(case when m.bot_id is not null then t.team else v.team end, '[]'::jsonb),
             'trophies', m.trophies,
             'botTarget', m.bot_target,
             'joinedAt', m.joined_at,
             'matches', coalesce(p.matches, 0),
             'won', coalesce(p.won, 0),
             'lost', coalesce(p.lost, 0),
             'leaves', coalesce(p.leaves, 0),
             'open', coalesce(p.open, 0),
             'lastMatchAt', p.last_at,
             'faced', coalesce(fp.n, fb.n, 0)
           ) as r
    from versus_league_members m
    left join versus_league_bots b on b.id = m.bot_id
    left join versus_league_bot_teams t on t.id = m.bot_team
    left join player_cards c on c.user_id = m.user_id and c.realm = 'main'
    left join versus_teams v on v.user_id = m.user_id and v.realm = 'main'
    left join played p on p.user_id = m.user_id
    left join faced_player fp on fp.id = m.user_id
    left join faced_bot fb on fb.id = m.bot_id
    where m.week = wk
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'n', g.n,
             'members', coalesce((
               select jsonb_agg(x.r || jsonb_build_object('rank', x.rk) order by x.rk, x.name)
               from members x where x.group_id = g.id
             ), '[]'::jsonb)
           ) order by g.n), '[]'::jsonb)
    into groups
  from versus_league_groups g
  where g.week = wk;
  return jsonb_build_object(
    'week', wk,
    'endsAt', (wk + 7)::timestamp at time zone 'UTC',
    'opened', (select w.groups from versus_league_weeks w where w.week = wk),
    'closed', exists (select 1 from versus_league_weeks w where w.week = wk and w.closed_at is not null),
    'groups', groups
  );
end
$$;

revoke all on function versus_league_admin_board(boolean) from public;
grant execute on function versus_league_admin_board(boolean) to authenticated;
