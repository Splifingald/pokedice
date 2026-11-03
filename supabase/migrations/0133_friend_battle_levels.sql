-- Friend Battles at Lv.50 or Lv.100 (docs/65 §16): the challenger picks the level beside the mode. Versus's rule at
-- either level: every Pokémon shows the fight's level and has its HP and Speed, and keeps the dice and rerolls of its own
-- level (the game's engine/friendBattle.ts, pvpBattler). Who may play is the same at both: Lv.50 or more.
--
-- 1. game_config `friendBattles`: `lv100` (Lv.100 offered, on by default) in friend_battles_defaults().
-- 2. pvp_matches.level (50 or 100; a match from before is 50).
-- 3. pvp_challenge(friend, mode, level): the level checked (pvp_level_off); the 2-argument one goes, its callers reach
--    this one with Lv.50. pvp_public and pvp_home say the level.
--
-- Run after 0132; safe to run again.
begin;

create or replace function friend_battles_defaults()
returns jsonb
language sql immutable as $$
  select '{
    "access": "off", "expiry": 120, "pick": 30, "order": 20, "turn": 45, "grace": 90, "shield": 50,
    "classic": true, "draft": true, "ticketDaily": 1, "ticketCap": 3, "ticketPrice": 10, "ticketWeekly": 10,
    "lv100": true
  }'::jsonb
$$;

alter table pvp_matches add column if not exists level int not null default 50;
alter table pvp_matches drop constraint if exists pvp_matches_level_check;
alter table pvp_matches add constraint pvp_matches_level_check check (level in (50, 100));

drop function if exists pvp_challenge(uuid, text);

create or replace function pvp_challenge(p_friend uuid, p_mode text, p_level int default 50)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := friend_battles_cfg();
  m pvp_matches;
begin
  if me is null then raise exception 'pvp_signed_out'; end if;
  if not friend_battles_open() then raise exception 'pvp_off'; end if;
  if p_mode not in ('classic', 'draft') or coalesce((cfg ->> p_mode)::boolean, true) = false then
    raise exception 'pvp_mode_off';
  end if;
  if coalesce(p_level, 50) not in (50, 100) or (p_level = 100 and coalesce((cfg ->> 'lv100')::boolean, true) = false) then
    raise exception 'pvp_level_off';
  end if;
  if p_friend is null or p_friend = me or not pvp_friends(me, p_friend) then raise exception 'pvp_not_friends'; end if;
  if pvp_busy(me) then raise exception 'pvp_busy'; end if;
  if pvp_busy(p_friend) then raise exception 'pvp_friend_busy'; end if;
  if coalesce(pvp_online_at(p_friend), '-infinity') < now() - interval '2 minutes' then raise exception 'pvp_offline'; end if;
  if p_mode = 'classic' then
    if pvp_versus_team(me) is null then raise exception 'pvp_no_team'; end if;
    if pvp_versus_team(p_friend) is null then raise exception 'pvp_friend_no_team'; end if;
  else
    if jsonb_array_length(pvp_candidates(me)) < 3 then raise exception 'pvp_no_team'; end if;
    if jsonb_array_length(pvp_candidates(p_friend)) < 3 then raise exception 'pvp_friend_no_team'; end if;
  end if;
  -- A fight costs each a battle ticket (taken as it starts): both must hold one now.
  if pvp_ticket_balance(me) < 1 then raise exception 'pvp_no_ticket'; end if;
  if pvp_ticket_balance(p_friend) < 1 then raise exception 'pvp_friend_no_ticket'; end if;
  insert into pvp_matches (a, b, mode, level, deadline, seen_a)
    values (me, p_friend, p_mode, coalesce(p_level, 50), now() + pvp_secs('expiry'), now())
  returning * into m;
  perform pvp_send('pvp-inbox:' || p_friend, 'challenge', jsonb_build_object('id', m.id, 'mode', m.mode));
  return pvp_public(m, 'a');
end
$$;

create or replace function pvp_public(m pvp_matches, p_side text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'mode', m.mode,
    'level', m.level,
    'state', m.state,
    'side', p_side,
    'a', pvp_who(m.a),
    'b', pvp_who(m.b),
    'firstPicker', m.first_picker,
    'picks', m.picks,
    'cand', case when p_side = 'a' then m.cand_a else m.cand_b end,
    'team', case when p_side = 'a' then m.team_a else m.team_b end,
    'foeTeam', case when m.state in ('battle', 'done', 'void') then (case when p_side = 'a' then m.team_b else m.team_a end) end,
    'readyA', m.ready_a,
    'readyB', m.ready_b,
    'seq', m.seq,
    'seed', case when m.state in ('battle', 'done', 'void') then pvp_seed(m.secret, 0) end,
    'deadline', pvp_ms(m.deadline),
    -- When the other player's game last called: past a while, this game says they lost connection.
    'foeSeen', pvp_ms(coalesce(case when p_side = 'a' then m.seen_b else m.seen_a end, m.created_at)),
    'now', pvp_ms(now()),
    'winner', m.winner,
    'reason', m.reason,
    'createdAt', pvp_ms(m.created_at),
    'cfg', friend_battles_cfg()
  )
$$;

create or replace function pvp_home()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cur pvp_matches;
begin
  if me is null or not friend_battles_open() then return null; end if;
  update pvp_matches x set state = 'expired', ended_at = now()
   where x.state = 'invited' and x.deadline < now() and (x.a = me or x.b = me);
  select * into cur from pvp_matches x
   where (x.a = me or x.b = me) and x.state in ('invited', 'draft', 'order', 'battle')
   order by x.created_at desc limit 1;
  return jsonb_build_object(
    'tickets', pvp_ticket_status(me),
    'current', case when cur.id is not null then pvp_public(cur, case when cur.a = me then 'a' else 'b' end) end,
    'records', coalesce((
      select jsonb_agg(pvp_who(case when r.user_a = me then r.user_b else r.user_a end) || jsonb_build_object(
        'wins', case when r.user_a = me then r.wins_a else r.wins_b end,
        'losses', case when r.user_a = me then r.wins_b else r.wins_a end,
        'draws', r.draws) order by r.last_at desc)
      from pvp_records r where r.user_a = me or r.user_b = me
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h.j order by h.at desc) from (
        select x.ended_at at, jsonb_build_object(
          'id', x.id, 'mode', x.mode, 'level', x.level, 'at', pvp_ms(x.ended_at), 'reason', x.reason,
          'foe', pvp_who(case when x.a = me then x.b else x.a end),
          'result', case when x.winner = 'draw' then 'draw'
                         when x.winner = (case when x.a = me then 'a' else 'b' end) then 'win' else 'loss' end) j
        from pvp_matches x
        where (x.a = me or x.b = me) and x.state = 'done'
        order by x.ended_at desc limit 20
      ) h
    ), '[]'::jsonb)
  );
end
$$;

revoke all on function pvp_challenge(uuid, text, int), pvp_home() from public, anon;
grant execute on function pvp_challenge(uuid, text, int), pvp_home() to authenticated;
revoke all on function pvp_public(pvp_matches, text) from public, anon, authenticated;

commit;
