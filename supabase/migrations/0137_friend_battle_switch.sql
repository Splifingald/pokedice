-- Friend Battles, version 2.9.2 (docs/65 §17, the user's ask of 2026-11-03):
-- 1. Switching: on your turn, another of your able Pokémon can come in, and the turn is spent (as in every fight).
--    pvp_move takes the move {"k": "switch", "uid": "a1"}; whether it can be made (the side's turn, an able Pokémon of
--    its own team, not the one out) is the engines', as for every move: one that can't changes nothing on either game.
-- 2. The Bonus Shield blocks a quarter of the opponent's first attack, no longer half: game_config `friendBattles`
--    `shield` (the share of the hit still taken) 50 → 75, left alone when the admin set another value; and its default.
-- 3. configVersion + 1, so players fetch the new content.
--
-- Run after 0133; safe to run again.
begin;

create or replace function friend_battles_defaults()
returns jsonb
language sql immutable as $$
  select '{
    "access": "off", "expiry": 120, "pick": 30, "order": 20, "turn": 45, "grace": 90, "shield": 75,
    "classic": true, "draft": true, "ticketDaily": 1, "ticketCap": 3, "ticketPrice": 10, "ticketWeekly": 10,
    "lv100": true
  }'::jsonb
$$;

update game_config set value = jsonb_set(value, '{shield}', '75'::jsonb)
  where key = 'friendBattles' and (value -> 'shield' is null or value -> 'shield' = '50'::jsonb);

create or replace function pvp_move(p_match bigint, p_seq int, p_move jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  m pvp_matches;
  k text := p_move ->> 'k';
  mv jsonb;
  seed int;
begin
  select * into r from pvp_mine(p_match);
  select * into m from pvp_matches x where x.id = p_match for update;
  if m.state <> 'battle' then raise exception 'pvp_not_fighting'; end if;
  if p_seq is distinct from m.seq + 1 then raise exception 'pvp_seq %', m.seq; end if;
  if k = 'reroll' then
    if jsonb_typeof(p_move -> 'mask') <> 'array' or jsonb_array_length(p_move -> 'mask') > 16
       or exists (select 1 from jsonb_array_elements(p_move -> 'mask') x where jsonb_typeof(x) <> 'boolean') then
      raise exception 'pvp_bad_move';
    end if;
    mv := jsonb_build_object('k', 'reroll', 'mask', p_move -> 'mask');
  elsif k = 'switch' then
    -- One of the mover's own team (a0…a5 for side a): anything else is no Pokémon of theirs.
    if jsonb_typeof(p_move -> 'uid') <> 'string' or (p_move ->> 'uid') !~ ('^' || r.side || '[0-5]$') then
      raise exception 'pvp_bad_move';
    end if;
    mv := jsonb_build_object('k', 'switch', 'uid', p_move ->> 'uid');
  elsif k in ('attack', 'forfeit') then
    mv := jsonb_build_object('k', k);
  else
    raise exception 'pvp_bad_move';
  end if;
  seed := pvp_seed(m.secret, p_seq);
  insert into pvp_moves (match_id, seq, side, move, seed) values (p_match, p_seq, r.side, mv, seed);
  update pvp_matches x set seq = p_seq, deadline = now() + pvp_secs('turn') where x.id = p_match;
  perform pvp_send('pvp:' || p_match, 'move', jsonb_build_object('seq', p_seq, 'side', r.side, 'move', mv, 'seed', seed));
  -- A forfeit is final at once: the other side has won.
  if k = 'forfeit' then
    perform pvp_settle(p_match, case when r.side = 'a' then 'b' else 'a' end, 'forfeit');
  end if;
  return jsonb_build_object('seq', p_seq, 'seed', seed);
end
$$;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
