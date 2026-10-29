-- The Versus league's global board (docs/44 §8): this week's trophies of every player in every group, ranked together.
-- Players only: the bots that fill the groups are left out, and so are the players banned from the leaderboard (0011),
-- but the caller's own row. It gives nothing at the week's end: the groups' rewards stay as they were (0082). Its own
-- switch, game_config versusLeague.globalAccess (Off by default), read here as the league's own is, and only with the
-- league open. It only reads. Run after 0082; safe to run again.

-- On for everyone, or for the admin only, and the league open for the caller.
create or replace function versus_league_global_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select versus_league_open()
     and (coalesce(versus_league_cfg() ->> 'globalAccess', 'off') = 'all'
          or (versus_league_cfg() ->> 'globalAccess' = 'admin' and is_admin()))
$$;

-- Every player of this week's league, ranked by trophies (ties share a rank, as the groups' boards do).
create or replace function versus_league_global()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := versus_league_week();
  board jsonb;
begin
  if not versus_league_global_open() then raise exception 'versus_league_off'; end if;
  select coalesce(jsonb_agg(x.r order by (x.r ->> 'rank')::int, x.r ->> 'name'), '[]'::jsonb) into board
  from (
    select jsonb_build_object(
      'id', m.user_id,
      'isMe', m.user_id is not distinct from me,
      'name', coalesce(c.name, 'Trainer'),
      'avatar', coalesce(c.avatar, 'red'),
      'team', coalesce(v.team, '[]'::jsonb),
      'trophies', m.trophies,
      'rank', rank() over (order by m.trophies desc),
      'rich', coalesce(player_rich(m.user_id), false)
    ) as r
    from versus_league_members m
    left join player_cards c on c.user_id = m.user_id and c.realm = 'main'
    left join versus_teams v on v.user_id = m.user_id and v.realm = 'main'
    where m.week = wk
      and m.user_id is not null
      and (m.user_id is not distinct from me or not exists (select 1 from leaderboard_bans b where b.user_id = m.user_id))
  ) x;
  return jsonb_build_object(
    'week', wk,
    'endsAt', (wk + 7)::timestamp at time zone 'UTC',
    'rows', board
  );
end
$$;

revoke all on function versus_league_global_open() from public;
revoke all on function versus_league_global() from public;
grant execute on function versus_league_global_open() to anon, authenticated;
grant execute on function versus_league_global() to anon, authenticated;
