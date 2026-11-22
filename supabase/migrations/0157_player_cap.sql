-- The player cap (docs/74-PLAYER-CAP.md): at most `cap` players in the game at once, the rest in a first-come waiting
-- line that lets them in by itself as places free up. The admin and the whitelist (beta_testers, signed in) always
-- get in, and count, but never take a waiting player's turn. Nobody is ever sent out by a change of the cap.
--
-- 1. The settings: game_config 'ccu' (read through ccu_cfg(), every number clamped). `access` is the feature's switch
--    (docs/15 §20): 'off' (the default) lets everyone in and only counts them; 'admin' puts the admin's own game in the
--    line as a regular player (to try it in production; everyone else gets in); 'all' is the cap for everyone.
--    `enforceWrites` turns the server gate on (section 6).
-- 2. ccu_sessions: one row per player (`who`: the account, else 'device:' and the guest's device, as online_here),
--    shared by all their tabs and devices, with a random token. UNLOGGED, as online_here: a restart empties it and
--    every game joins again on its next call.
-- 3. What the game calls: ccu_join(device, previous token) at start, ccu_heartbeat(token, had input, card) every
--    30 s while in (15 s while waiting), ccu_leave(token) as the page closes. The players-online ping (0146) rides on
--    the heartbeat (`card`), so the game needs no second timer.
-- 4. Freeing places, lazily inside those calls (no cron): a session not heard from in `staleSeconds` is gone; one
--    whose page said it was leaving keeps its place `reconnectGraceSeconds` (a reload). A regular player idle for
--    `idleMinutes` goes to the back of the line, but only when someone is waiting for the place.
-- 5. The admin: ccu_admin_stats(), ccu_admin_config(), the whitelist (ccu_whitelist*, over beta_testers, with its
--    note) and the signed-in players to pick from (ccu_admin_players()).
-- 6. The gate: ccu_check_request(), PostgREST's pre-request function. With `enforceWrites` on, every RPC but the few
--    listed in ccu_ungated(), every table write and every read of `saves` needs the header `x-ccu-token` carrying an
--    active session's token; without one the answer is HTTP 428 `ccu_required`. Content reads, the admin and the
--    service role are never gated. Undo it with:
--      alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';
--
-- Run after 0146 (the heartbeat stamps online_here through online_ping) and 0131 (beta_testers). Safe to run again.
-- supabase/seed.sql doesn't inline it.

begin;

-- ---------------------------------------------------------------- 1. the settings

create or replace function ccu_defaults()
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'access', 'off',
    'cap', 30,
    'enforceWrites', false,
    'idleMinutes', 10,
    'heartbeatSeconds', 30,
    'queueHeartbeatSeconds', 15,
    'staleSeconds', 90,
    'reconnectGraceSeconds', 60
  )
$$;

insert into game_config (key, value) values ('ccu', ccu_defaults()) on conflict (key) do nothing;

-- A whole number from the row, else its default, kept between lo and hi.
create or replace function ccu_int(p_cfg jsonb, p_key text, p_lo int, p_hi int)
returns int
language sql immutable as $$
  select greatest(p_lo, least(p_hi, coalesce(
    case when jsonb_typeof(p_cfg -> p_key) = 'number' then round((p_cfg ->> p_key)::numeric)::int end,
    (ccu_defaults() ->> p_key)::int
  )))
$$;

-- The settings as the server uses them: the row over the defaults, every number in its range. A heartbeat must come
-- well inside `staleSeconds`, or every player would go stale between two of them.
create or replace function ccu_cfg()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  raw jsonb := coalesce((select g.value from game_config g where g.key = 'ccu' and jsonb_typeof(g.value) = 'object'), '{}');
  hb int := ccu_int(raw, 'heartbeatSeconds', 10, 120);
  qhb int := ccu_int(raw, 'queueHeartbeatSeconds', 5, 120);
begin
  return jsonb_build_object(
    'access', case when raw ->> 'access' in ('off', 'admin', 'all') then raw ->> 'access' else 'off' end,
    'cap', ccu_int(raw, 'cap', 0, 100000),
    'enforceWrites', coalesce(raw ->> 'enforceWrites' = 'true', false),
    'idleMinutes', ccu_int(raw, 'idleMinutes', 1, 1440),
    'heartbeatSeconds', hb,
    'queueHeartbeatSeconds', qhb,
    'staleSeconds', greatest(ccu_int(raw, 'staleSeconds', 30, 900), 2 * greatest(hb, qhb) + 10),
    'reconnectGraceSeconds', ccu_int(raw, 'reconnectGraceSeconds', 0, 600)
  );
end
$$;

-- ---------------------------------------------------------------- 2. the sessions

create unlogged table if not exists ccu_sessions (
  token text primary key,                   -- random, 64 hex characters: what the game sends back
  who text not null unique,                 -- the account's id, else 'device:' and the guest's device id
  user_id uuid,
  device_id text,
  kind text not null default 'regular' check (kind in ('regular', 'admin', 'whitelist')),
  status text not null check (status in ('active', 'queued')),
  joined_at timestamptz,                    -- let in at (null while waiting)
  queued_at timestamptz,                    -- in line since (null while in)
  queue_seq bigint,                         -- first come first served among the same instant
  last_seen timestamptz not null default now(),
  last_input timestamptz not null default now(),
  left_at timestamptz,                      -- the page said it was closing: the place is kept for a reload
  reason text,                              -- 'idle': sent to the back of the line for it (until let in again)
  created_at timestamptz not null default now()
);
create index if not exists ccu_sessions_line on ccu_sessions (status, queued_at, queue_seq);
create index if not exists ccu_sessions_seen on ccu_sessions (last_seen);
create index if not exists ccu_sessions_user on ccu_sessions (user_id);

create sequence if not exists ccu_queue_seq;

-- When the admitting work last ran (section 4): heartbeats run it at most every 2 seconds between them.
create unlogged table if not exists ccu_state (
  id int primary key check (id = 1),
  ticked_at timestamptz not null default now()
);
insert into ccu_state (id) values (1) on conflict (id) do nothing;

alter table ccu_sessions enable row level security;
alter table ccu_state enable row level security;
revoke all on ccu_sessions, ccu_state from anon, authenticated;
revoke all on sequence ccu_queue_seq from anon, authenticated;
drop policy if exists ccu_sessions_admin on ccu_sessions;
create policy ccu_sessions_admin on ccu_sessions for select using ((select is_admin()));
drop policy if exists ccu_state_admin on ccu_state;
create policy ccu_state_admin on ccu_state for select using ((select is_admin()));

-- The caller's kind: the admin, a whitelisted account (beta_testers), or a regular player.
create or replace function ccu_kind()
returns text
language sql stable security definer set search_path = public as $$
  select case
    when is_admin() then 'admin'
    when auth.uid() is not null and exists (select 1 from beta_testers b where b.user_id = auth.uid()) then 'whitelist'
    else 'regular'
  end
$$;

-- Whether the cap and the idle rule apply to a session of this kind under this switch.
create or replace function ccu_capped(p_kind text, p_access text)
returns boolean
language sql immutable as $$
  select (p_access = 'all' and p_kind = 'regular') or (p_access = 'admin' and p_kind = 'admin')
$$;

-- A session still holding its place: heard from lately, and not past the grace of a page that said it was closing.
create or replace function ccu_live(s ccu_sessions, p_cfg jsonb)
returns boolean
language sql stable as $$
  select s.last_seen > now() - make_interval(secs => (p_cfg ->> 'staleSeconds')::int)
     and (s.left_at is null or s.left_at > now() - make_interval(secs => (p_cfg ->> 'reconnectGraceSeconds')::int))
$$;

-- ---------------------------------------------------------------- 4. freeing places and letting players in

-- The sessions gone (closed, lost, past the grace) are deleted.
create or replace function ccu_reap(p_cfg jsonb)
returns void
language sql volatile security definer set search_path = public as $$
  delete from ccu_sessions s
  where s.last_seen <= now() - make_interval(secs => (p_cfg ->> 'staleSeconds')::int)
     or s.left_at <= now() - make_interval(secs => (p_cfg ->> 'reconnectGraceSeconds')::int)
$$;

-- Lets in who can come in. Callers hold the advisory lock (ccu_lock), so two of these never count at once.
-- 1. Whoever the cap doesn't apply to (the switch Off, the admin, the whitelist) is let in at once.
-- 2. Regular players idle for idleMinutes go to the back of the line, as many as there are waiting players the free
--    places don't cover, the longest idle first. Nobody waiting: nobody is sent back.
-- 3. The free places (cap minus everyone in, whatever their kind) go to the line, first come first served.
-- Lowering the cap only stops step 3 until enough players have left: nobody in is ever sent out for it.
create or replace function ccu_admit(p_cfg jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  acc text := p_cfg ->> 'access';
  cap int := (p_cfg ->> 'cap')::int;
  inside int;
  waiting int;
  idle int;
begin
  update ccu_sessions s
     set status = 'active', joined_at = now(), queued_at = null, queue_seq = null, last_input = now(), reason = null
   where s.status = 'queued' and not ccu_capped(s.kind, acc);

  select count(*) into inside from ccu_sessions s where s.status = 'active';
  select count(*) into waiting from ccu_sessions s where s.status = 'queued';

  idle := waiting - greatest(cap - inside, 0);
  if idle > 0 then
    with gone as (
      select s.token from ccu_sessions s
      where s.status = 'active' and ccu_capped(s.kind, acc)
        and s.last_input < now() - make_interval(mins => (p_cfg ->> 'idleMinutes')::int)
      order by s.last_input
      limit idle
    )
    update ccu_sessions s
       set status = 'queued', joined_at = null, queued_at = now(), queue_seq = nextval('ccu_queue_seq'), reason = 'idle'
      from gone where s.token = gone.token;
    get diagnostics idle = row_count;
    inside := inside - idle;
  end if;

  if inside < cap then
    with next_in as (
      select s.token from ccu_sessions s
      where s.status = 'queued'
      order by s.queued_at, s.queue_seq
      limit cap - inside
    )
    update ccu_sessions s
       set status = 'active', joined_at = now(), queued_at = null, queue_seq = null, last_input = now(), reason = null
      from next_in where s.token = next_in.token;
  end if;

  update ccu_state set ticked_at = now() where id = 1;
end
$$;

create or replace function ccu_lock()
returns void
language sql volatile as $$
  select pg_advisory_xact_lock(hashtext('pokedice.ccu'))
$$;

-- What the game is told: in (with the token), or waiting (its place in line, the line's length, why it is there).
create or replace function ccu_answer(p_token text, p_cfg jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r ccu_sessions;
begin
  select * into r from ccu_sessions s where s.token = p_token;
  if r.token is null then return jsonb_build_object('status', 'gone'); end if;
  return jsonb_build_object(
    'status', r.status,
    'token', r.token,
    'kind', r.kind,
    'heartbeatSeconds', (p_cfg ->> 'heartbeatSeconds')::int,
    'queueHeartbeatSeconds', (p_cfg ->> 'queueHeartbeatSeconds')::int,
    'idleMinutes', (p_cfg ->> 'idleMinutes')::int,
    'cap', (p_cfg ->> 'cap')::int
  ) || case when r.status = 'queued' then jsonb_build_object(
    'position', 1 + (
      select count(*) from ccu_sessions s
      where s.status = 'queued' and (s.queued_at, s.queue_seq) < (r.queued_at, r.queue_seq) and ccu_live(s, p_cfg)
    ),
    'queueLength', (select count(*) from ccu_sessions s where s.status = 'queued' and ccu_live(s, p_cfg)),
    'reason', r.reason
  ) else '{}'::jsonb end;
end
$$;

-- ---------------------------------------------------------------- 3. what the game calls

-- At start, before anything else asks the server for anything. `p_previous_token`: the one this browser kept, so a
-- reload within the grace keeps its place (in the game or in line), and a guest who signs in carries theirs over to
-- the account. Every tab and device of the same player shares one session.
create or replace function ccu_join(p_device_id text, p_previous_token text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  cfg jsonb := ccu_cfg();
  uid uuid := auth.uid();
  dev text := nullif(trim(p_device_id), '');
  me text := coalesce(uid::text, 'device:' || dev);
  k text := ccu_kind();
  prev text := nullif(trim(p_previous_token), '');
  tok text;
begin
  -- A device id is the game's own (a UUID); anything longer is a hand-made call.
  if me is null or length(me) > 80 then raise exception 'ccu_no_device' using errcode = '22023'; end if;
  perform ccu_lock();
  perform ccu_reap(cfg);

  select s.token into tok from ccu_sessions s where s.who = me;
  -- A guest's place goes with them when they sign in. Never an account's the other way (signing out on one device):
  -- its other devices still play on it, so the guest gets a place of their own.
  if prev is not null and prev is distinct from tok then
    if tok is null then
      update ccu_sessions s set who = me where s.token = prev and s.who like 'device:%' returning s.token into tok;
    else
      -- The account has a place already (another tab, another device): the guest's goes.
      delete from ccu_sessions s where s.token = prev and s.who like 'device:%';
    end if;
  end if;

  if tok is null then
    tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into ccu_sessions (token, who, user_id, device_id, kind, status, queued_at, queue_seq)
    values (tok, me, uid, dev, k, 'queued', now(), nextval('ccu_queue_seq'));
  else
    update ccu_sessions s
       set user_id = uid, device_id = coalesce(dev, s.device_id), kind = k, last_seen = now(), left_at = null
     where s.token = tok;
  end if;

  perform ccu_admit(cfg);
  return ccu_answer(tok, cfg);
end
$$;

-- Every 30 s while in the game (15 s while waiting). `p_had_input`: the player touched, clicked or typed since the
-- last one (Idle mode playing by itself is no input). `p_card`: now and then, the players-online card (0146's
-- online_ping: {name, look, badges, team}); the answer then carries `online`, the players online count.
-- 'gone': the session is no more (lost, or another name took it over): the game joins again.
create or replace function ccu_heartbeat(p_token text, p_had_input boolean default false, p_card jsonb default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  cfg jsonb := ccu_cfg();
  r ccu_sessions;
  answer jsonb;
  online int;
begin
  select * into r from ccu_sessions s where s.token = p_token;
  -- Signed in or out since the token was given: join again, under the new name.
  if r.token is null or not ccu_live(r, cfg) or r.user_id is distinct from auth.uid() then
    return jsonb_build_object('status', 'gone');
  end if;
  update ccu_sessions s
     set last_seen = now(), left_at = null,
         last_input = case when p_had_input then now() else s.last_input end,
         kind = ccu_kind()
   where s.token = p_token
   returning * into r;
  -- Whitelisted while waiting: in at once (the cap doesn't apply, so no count is needed).
  if r.status = 'queued' and not ccu_capped(r.kind, cfg ->> 'access') then
    update ccu_sessions s
       set status = 'active', joined_at = now(), queued_at = null, queue_seq = null, reason = null
     where s.token = p_token;
  end if;
  -- The line moves at most every 2 seconds, by whichever heartbeat gets there first; none waits for another.
  -- (Two ifs: SQL doesn't promise to skip the lock when the first test is false.)
  if (select st.ticked_at from ccu_state st where st.id = 1) < now() - interval '2 seconds' then
    if pg_try_advisory_xact_lock(hashtext('pokedice.ccu')) then
      perform ccu_reap(cfg);
      perform ccu_admit(cfg);
    end if;
  end if;
  if p_card is not null and jsonb_typeof(p_card) = 'object' and r.device_id is not null then
    online := online_ping(
      r.device_id,
      p_card ->> 'name',
      p_card ->> 'look',
      case when p_card ->> 'badges' ~ '^[0-9]{1,6}$' then (p_card ->> 'badges')::int end,
      p_card -> 'team'
    );
  end if;
  answer := ccu_answer(p_token, cfg);
  return case when online is not null then answer || jsonb_build_object('online', online) else answer end;
end
$$;

-- The page is closing (sent with keepalive, best effort): the place is kept reconnectGraceSeconds for a reload, then
-- freed. Another tab of the same player still beating keeps it.
create or replace function ccu_leave(p_token text)
returns void
language sql volatile security definer set search_path = public as $$
  update ccu_sessions s set left_at = now() where s.token = p_token
$$;

-- Whether a token is an active session's: for the gate, and for any policy or function that wants it.
create or replace function ccu_is_active(p_token text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_token, '') <> '' and exists (
    select 1 from ccu_sessions s where s.token = p_token and s.status = 'active' and ccu_live(s, ccu_cfg())
  )
$$;

-- ---------------------------------------------------------------- 5. the admin

create or replace function ccu_admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb := ccu_cfg();
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'active', count(*) filter (where s.status = 'active'),
      'regular', count(*) filter (where s.status = 'active' and s.kind = 'regular'),
      'admin', count(*) filter (where s.status = 'active' and s.kind = 'admin'),
      'whitelist', count(*) filter (where s.status = 'active' and s.kind = 'whitelist'),
      'queued', count(*) filter (where s.status = 'queued'),
      'idleQueued', count(*) filter (where s.status = 'queued' and s.reason = 'idle'),
      'longestWaitSeconds', coalesce(extract(epoch from now() - min(s.queued_at) filter (where s.status = 'queued'))::int, 0),
      'config', cfg,
      'at', now()
    )
    from ccu_sessions s
    where ccu_live(s, cfg)
  );
end
$$;

-- Saves the settings (only the keys given change) and lets in whoever a higher cap now has room for. Live at once:
-- no Publish, no content version, no reload.
create or replace function ccu_admin_config(p_cfg jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  cfg jsonb;
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if jsonb_typeof(p_cfg) is distinct from 'object' then raise exception 'ccu_bad_config' using errcode = '22023'; end if;
  insert into game_config (key, value)
  values ('ccu', ccu_defaults() || p_cfg)
  on conflict (key) do update
    set value = (case when jsonb_typeof(game_config.value) = 'object' then game_config.value else ccu_defaults() end) || p_cfg;
  -- Stored as used: the clamped numbers, so what the admin reads back is what the server does.
  cfg := ccu_cfg();
  update game_config set value = cfg where key = 'ccu';
  perform ccu_lock();
  perform ccu_reap(cfg);
  perform ccu_admit(cfg);
  return cfg;
end
$$;

-- The signed-in players to pick from: each account once, its name and e-mail as the analytics last saw them, the most
-- recent first.
create or replace function ccu_admin_players()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.user_id, 'name', p.name, 'email', p.email, 'lastDay', p.last_day)
                     order by p.last_day desc, p.name)
    from (
      select distinct on (pl.user_id) pl.user_id, pl.name, pl.email, pl.last_day
      from players pl
      where pl.user_id is not null
      order by pl.user_id, pl.last_day desc
    ) p
  ), '[]'::jsonb);
end
$$;

-- The whitelist: beta_testers (0131) with each one's name, e-mail and the admin's note.
create or replace function ccu_whitelist()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.user_id,
        'name', (select pl.name from players pl where pl.user_id = b.user_id order by pl.last_day desc limit 1),
        'email', (select pl.email from players pl where pl.user_id = b.user_id order by pl.last_day desc limit 1),
        'note', b.note,
        'addedAt', b.added_at
      ) order by b.added_at desc)
    from beta_testers b
  ), '[]'::jsonb);
end
$$;

-- Adds an account to the whitelist, or changes its note. Its game in line, if any, gets in at its next heartbeat.
create or replace function ccu_whitelist_set(p_user uuid, p_note text default null)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'ccu_no_account' using errcode = '22023';
  end if;
  insert into beta_testers (user_id, note) values (p_user, nullif(left(trim(p_note), 200), ''))
  on conflict (user_id) do update set note = excluded.note;
  update ccu_sessions s set kind = 'whitelist' where s.user_id = p_user and s.kind = 'regular';
  return true;
end
$$;

-- Off the whitelist: a regular player again from now on. Never sent out for it: the cap only applies to who comes in.
create or replace function ccu_whitelist_remove(p_user uuid)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  delete from beta_testers b where b.user_id = p_user;
  update ccu_sessions s set kind = 'regular' where s.user_id = p_user and s.kind = 'whitelist';
  return found;
end
$$;

-- ---------------------------------------------------------------- 6. the gate

-- The calls a game without a token may still make: the cap's own, the admin check the setup page makes, the server's
-- clock, and what a player must always be able to do (delete their data, stop notifications).
create or replace function ccu_ungated()
returns text[]
language sql immutable as $$
  select array[
    'ccu_join', 'ccu_heartbeat', 'ccu_leave', 'ccu_is_active', 'ccu_check_request',
    'is_admin', 'event_time', 'delete_my_data', 'push_unsubscribe'
  ]
$$;

-- PostgREST runs this before every request (pgrst.db_pre_request, below), as the caller. Cheap: the path first, then
-- the switch, and only then one lookup by primary key. Any fault in here lets the request through: the gate must
-- never be what takes the game down.
create or replace function ccu_check_request()
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  blocked boolean := false;
  path text;
  method text;
begin
  begin
    path := ltrim(coalesce(current_setting('request.path', true), ''), '/');
    method := upper(coalesce(current_setting('request.method', true), 'GET'));
    if path = '' then
      return;
    elsif path like 'rpc/%' then
      if substr(path, 5) = any (ccu_ungated()) then return; end if;
    elsif method in ('GET', 'HEAD') and path <> 'saves' then
      -- The content, the switches, the reload signal: reads every game makes, the line's too.
      return;
    end if;
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' or is_admin() then return; end if;
    if not coalesce((ccu_cfg() ->> 'enforceWrites')::boolean, false) then return; end if;
    blocked := not ccu_is_active(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-ccu-token');
  exception when others then
    blocked := false;
  end;
  if blocked then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'ccu_required',
        'message', 'ccu_required',
        'details', 'This call needs an active place in the game (ccu_join).',
        'hint', null)::text,
      detail = json_build_object('status', 428, 'status_text', 'Precondition Required')::text;
  end if;
end
$$;

-- Internal pieces: not callable over the API.
revoke all on function ccu_defaults(), ccu_int(jsonb, text, int, int), ccu_cfg(), ccu_kind(), ccu_capped(text, text),
  ccu_live(ccu_sessions, jsonb), ccu_reap(jsonb), ccu_admit(jsonb), ccu_lock(), ccu_answer(text, jsonb), ccu_ungated()
  from public, anon, authenticated;
-- The game's.
revoke all on function ccu_join(text, text), ccu_heartbeat(text, boolean, jsonb), ccu_leave(text), ccu_is_active(text)
  from public;
grant execute on function ccu_join(text, text), ccu_heartbeat(text, boolean, jsonb), ccu_leave(text), ccu_is_active(text)
  to anon, authenticated;
-- PostgREST calls the gate as the request's own role: it needs EXECUTE (calling it directly does nothing).
revoke all on function ccu_check_request() from public;
grant execute on function ccu_check_request() to anon, authenticated, service_role;
-- The admin's (each checks is_admin()).
revoke all on function ccu_admin_stats(), ccu_admin_config(jsonb), ccu_admin_players(), ccu_whitelist(),
  ccu_whitelist_set(uuid, text), ccu_whitelist_remove(uuid) from public, anon;
grant execute on function ccu_admin_stats(), ccu_admin_config(jsonb), ccu_admin_players(), ccu_whitelist(),
  ccu_whitelist_set(uuid, text), ccu_whitelist_remove(uuid) to authenticated;

commit;

-- The gate in place (it does nothing until the admin turns enforceWrites on). Outside the transaction: PostgREST reads
-- its settings again on the notify. A database without PostgREST's authenticator role (the tests) skips it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.ccu_check_request''';
    notify pgrst, 'reload config';
  end if;
end
$$;
