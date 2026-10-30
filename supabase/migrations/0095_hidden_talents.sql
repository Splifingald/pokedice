-- Hidden talents (docs/51-HIDDEN-TALENTS.md).
-- 1. game_config `hiddenTalents`: the switch, Off, the odds (a wild Pokémon carries its talent 5 %, a locked family finds
--    it on an evolution 30 %) and the admin's picks per family (none: the game's own). Left alone when there.
-- 2. talents_open(): the switch, as trade_open reads Trades'.
-- 3. The team snapshots carry `talent` while the switch is open, read from the cloud save as before: Versus
--    (versus_set_team, 0090's), raids (raid_set_team and raid_progress_set_team, 0065's). A team registered before has
--    none until its owner saves it again.
-- 4. Trades: a listing says whether its Pokémon carries its talent (trade_row, 0049's); a listing asking for a species
--    may ask for it "with its hidden talent" (trade_post, 0044's, only while the switch is open), and only such a
--    Pokémon is then taken (trade_take, 0049's). A traded Pokémon keeps its talent: the instance travels whole, as it
--    always did.
-- 5. configVersion + 1, so players fetch the new content. Safe to run again. seed.sql inlines it (scripts/seed.ts).
begin;

insert into game_config (key, value)
values ('hiddenTalents', '{"access": "off", "wildChance": 0.05, "evolveChance": 0.3, "families": {}}'::jsonb)
on conflict (key) do nothing;

create or replace function talents_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select (select value ->> 'access' from game_config where key = 'hiddenTalents') as a) s
$$;

-- 0090's, with the talent.
create or replace function versus_set_team(ids text[], p_realm text default 'main')
returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  save jsonb;
  new_team jsonb;
  new_ids jsonb := to_jsonb(versus_set_team.ids);
  cur versus_teams%rowtype;
  v int;
begin
  if me is null then raise exception 'versus_signed_out'; end if;
  if versus_set_team.ids is null or coalesce(array_length(versus_set_team.ids, 1), 0) <> 3
     or (select count(distinct x) from unnest(versus_set_team.ids) x) <> 3 then
    raise exception 'versus_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'versus_no_save'; end if;

  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least(100, (m ->> 'level')::int),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) || case when talents_open() and m ->> 'talent' = 'true' then '{"talent": true}'::jsonb else '{}'::jsonb end
  order by t.ord)
  into new_team
  from unnest(versus_set_team.ids) with ordinality t(id, ord)
  join (
    select b from jsonb_array_elements(coalesce(save -> 'box', '[]')) b
    union all
    select b from jsonb_each(coalesce(save -> 'parked', '{}')) p(k, v), jsonb_array_elements(coalesce(p.v -> 'box', '[]')) b
  ) boxes(m) on m ->> 'id' = t.id
  where (m ->> 'level')::int >= 50 and m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> 3 then raise exception 'versus_not_eligible'; end if;

  select * into cur from versus_teams vt where vt.user_id = me and vt.realm = p_realm;
  if not found then
    insert into versus_teams (user_id, realm, version, team, ids) values (me, p_realm, 1, new_team, new_ids);
    return 1;
  end if;
  if cur.team = new_team then
    update versus_teams vt set ids = new_ids where vt.user_id = me and vt.realm = p_realm;
    return cur.version;
  end if;
  update versus_teams vt
     set team = new_team, ids = new_ids, version = cur.version + 1, updated_at = now()
   where vt.user_id = me and vt.realm = p_realm
  returning vt.version into v;
  return v;
end
$$;

revoke all on function versus_set_team(text[], text) from public;
grant execute on function versus_set_team(text[], text) to authenticated;

-- 0065's, with the talent.
create or replace function raid_set_team(p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  save jsonb;
  new_team jsonb;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) not between 1 and 3
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1) then
    raise exception 'events_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'events_no_save'; end if;
  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least(100, greatest(1, (m ->> 'level')::int)),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) || case when talents_open() and m ->> 'talent' = 'true' then '{"talent": true}'::jsonb else '{}'::jsonb end
  order by t.ord)
  into new_team
  from unnest(p_ids) with ordinality t(id, ord)
  join (
    select b from jsonb_array_elements(coalesce(save -> 'box', '[]')) b
    union all
    select b from jsonb_each(coalesce(save -> 'parked', '{}')) p(k, v), jsonb_array_elements(coalesce(p.v -> 'box', '[]')) b
  ) boxes(m) on m ->> 'id' = t.id
  where m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> array_length(p_ids, 1) then raise exception 'events_not_eligible'; end if;
  insert into raid_teams (user_id, realm, team, ids, updated_at) values (me, p_realm, new_team, to_jsonb(p_ids), now())
  on conflict (user_id, realm) do update set team = excluded.team, ids = excluded.ids, updated_at = now();
  return new_team;
end $$;

-- 0065's, with the talent.
create or replace function raid_progress_set_team(p_key text, p_region text, p_ids text[], p_realm text default 'main')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dex int := raid_progress_dex(p_key);
  region text := (select a.region_id from areas a where a.id::text = split_part(p_key, ':', 1));
  save jsonb;
  box jsonb;
  new_team jsonb;
begin
  if me is null then raise exception 'events_signed_out'; end if;
  if dex is null or region is null then raise exception 'events_bad_raid'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) not between 1 and 3
     or (select count(distinct x) from unnest(p_ids) x) <> array_length(p_ids, 1) then
    raise exception 'events_team_size';
  end if;
  select s.data into save from saves s where s.user_id = me and s.realm = p_realm;
  if save is null then raise exception 'events_no_save'; end if;
  if raid_progress_special_locked(p_key, p_realm) then raise exception 'events_raid_locked'; end if;
  -- The Box being played is the save's top-level one (a small world's while inside it); the others are parked.
  box := case when coalesce(save ->> 'region', 'kanto') = region then save -> 'box' else save -> 'parked' -> region -> 'box' end;
  select jsonb_agg(jsonb_build_object(
    'dex', (m ->> 'dex')::int,
    'level', least(100, greatest(1, (m ->> 'level')::int)),
    'shiny', coalesce((m ->> 'shiny')::boolean, false)
  ) || case when talents_open() and m ->> 'talent' = 'true' then '{"talent": true}'::jsonb else '{}'::jsonb end
  order by t.ord)
  into new_team
  from unnest(p_ids) with ordinality t(id, ord)
  join jsonb_array_elements(coalesce(box, '[]')) m on m ->> 'id' = t.id
  where m ->> 'revivesAt' is null;
  if new_team is null or jsonb_array_length(new_team) <> array_length(p_ids, 1) then raise exception 'events_not_eligible'; end if;
  insert into raid_progress_teams (user_id, realm, raid_key, region, team, ids, updated_at)
  values (me, p_realm, p_key, region, new_team, to_jsonb(p_ids), now())
  on conflict (user_id, realm, raid_key) do update
    set region = excluded.region, team = excluded.team, ids = excluded.ids, updated_at = now();
  return new_team;
end $$;

-- 0049's, with the talent.
create or replace function trade_row(l trade_listings, p_me uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.code, 'owner', l.owner,
    'name', coalesce(trade_name(l.owner), l.owner_name, ''),
    'avatar', (select c.avatar from player_cards c where c.user_id = l.owner and c.realm = 'main'),
    'rich', player_rich(l.owner),
    'is_me', p_me is not null and l.owner = p_me,
    'is_friend', p_me is not null and exists (select 1 from friend_ids_of(p_me) f where f.id = l.owner),
    'dex', l.dex, 'level', l.level, 'shiny', l.shiny, 'home_region', l.home_region,
    'talent', l.mon ->> 'talent' = 'true',
    'want', l.want, 'visibility', l.visibility, 'created_at', l.created_at, 'ends_at', l.ends_at, 'status', l.status,
    -- What "any I don't own" is checked against, and the regions the poster can receive from.
    'poster', jsonb_build_object(
      'regions', coalesce(l.poster -> 'regions', '[]'),
      'has', case when l.want ->> 'kind' = 'notOwned' then l.poster -> 'has' end,
      'forms', case when l.want ->> 'kind' = 'notOwned' then l.poster -> 'forms' end,
      'shiny', case when l.want ->> 'kind' = 'notOwned' then l.poster -> 'shiny' end))
$$;

-- 0044's, with "with its hidden talent".
create or replace function trade_post(p_inst text, p_want jsonb, p_visibility text, p_poster jsonb, p_realm text default 'main')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := trade_cfg();
  save jsonb;
  hit record;
  wdex int;
  l trade_listings;
  started text[];
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' then raise exception 'trades_realm'; end if;
  if not trade_open() then raise exception 'trades_off'; end if;
  if trade_badges(me) < coalesce((cfg ->> 'minBadges')::int, 0) then raise exception 'trades_badges'; end if;
  if (select count(*) from trade_listings t where t.owner = me and t.status = 'open' and t.ends_at > now())
     >= coalesce((cfg ->> 'maxListings')::int, 4) then
    raise exception 'trades_full';
  end if;
  if p_visibility is null or p_visibility not in ('public', 'friends', 'private') then raise exception 'trades_bad_want'; end if;

  select s.data into save from saves s where s.user_id = me and s.realm = 'main';
  if save is null then raise exception 'trades_no_save'; end if;
  if trade_in_world(save) then raise exception 'trades_world'; end if;
  select * into hit from trade_find(save, p_inst);
  if hit.inst is null then raise exception 'trades_not_found'; end if;
  if trade_world(save, hit.region) then raise exception 'trades_world'; end if;
  if hit.inst ->> 'revivesAt' is not null then raise exception 'trades_reviving'; end if;
  if hit.others < 1 then raise exception 'trades_last'; end if;
  if trade_untradable((hit.inst ->> 'dex')::int) then raise exception 'trades_untradable'; end if;
  -- Already on the board, or given in a trade not applied yet.
  if exists (select 1 from trade_listings t where t.owner = me and t.status = 'open' and t.mon ->> 'id' = p_inst)
     or exists (select 1 from trade_listings t where t.taker = me and not t.taker_applied and t.taker_mon ->> 'id' = p_inst) then
    raise exception 'trades_listed';
  end if;

  started := trade_started(save);
  case coalesce(p_want ->> 'kind', '')
    when 'species' then
      wdex := (p_want ->> 'dex')::int;
      if wdex is null or trade_untradable(wdex) or not (trade_home_region(wdex) = any (started)) then
        raise exception 'trades_bad_want';
      end if;
      -- "With its hidden talent" (docs/51): only while talents are open to the poster.
      if p_want ->> 'talent' = 'true' and not talents_open() then raise exception 'trades_bad_want'; end if;
      p_want := jsonb_build_object('kind', 'species', 'dex', wdex)
        || case when p_want ->> 'talent' = 'true' then '{"talent": true}'::jsonb else '{}'::jsonb end;
    when 'notOwned' then p_want := '{"kind": "notOwned"}';
    when 'any' then p_want := '{"kind": "any"}';
    else raise exception 'trades_bad_want';
  end case;

  insert into trade_listings (code, owner, owner_name, from_region, home_region, mon, dex, level, shiny, want, poster,
                              visibility, ends_at)
  values (
    friend_new_code(), me, trade_name(me), hit.region,
    coalesce(trade_home_region((hit.inst ->> 'dex')::int), hit.region),
    hit.inst, (hit.inst ->> 'dex')::int, (hit.inst ->> 'level')::int, coalesce((hit.inst ->> 'shiny')::boolean, false),
    p_want,
    -- The snapshot is the poster's own say: it only decides what they accept. The regions are read from the save.
    jsonb_build_object(
      'has', left(coalesce(p_poster ->> 'has', ''), 400),
      'forms', case when jsonb_typeof(p_poster -> 'forms') = 'array' then p_poster -> 'forms' else '[]' end,
      'shiny', case when jsonb_typeof(p_poster -> 'shiny') = 'array' then p_poster -> 'shiny' else '[]' end,
      'regions', to_jsonb(started)),
    p_visibility,
    now() + make_interval(days => greatest(1, coalesce((cfg ->> 'listingDays')::int, 3))))
  returning * into l;
  return jsonb_build_object('id', l.id, 'code', l.code, 'ends_at', l.ends_at, 'region', l.from_region);
exception when unique_violation then
  -- A code drawn twice (one in a trillion): try once more.
  return trade_post(p_inst, p_want, p_visibility, p_poster, p_realm);
end
$$;

-- 0049's, a talent asked for is checked.
create or replace function trade_take(p_code text, p_inst text, p_realm text default 'main')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cfg jsonb := trade_cfg();
  l trade_listings;
  save jsonb;
  hit record;
  gdex int;
  gshiny boolean;
  today timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if me is null then raise exception 'trades_signed_out' using errcode = '42501'; end if;
  if p_realm is distinct from 'main' then raise exception 'trades_realm'; end if;
  if not trade_open() then raise exception 'trades_off'; end if;
  if trade_badges(me) < coalesce((cfg ->> 'minBadges')::int, 0) then raise exception 'trades_badges'; end if;

  select * into l from trade_listings t where t.code = friend_norm(p_code) for update;
  if not found or l.status <> 'open' or l.ends_at <= now() then raise exception 'trades_gone'; end if;
  if l.owner = me then raise exception 'trades_own'; end if;
  if l.visibility = 'friends' and not exists (select 1 from friend_ids_of(me) f where f.id = l.owner) then
    raise exception 'trades_friends_only';
  end if;
  if (select count(*) from trade_listings t where t.taker = me and t.taken_at >= today)
     >= coalesce((cfg ->> 'tradesPerDay')::int, 5) then
    raise exception 'trades_daily_cap';
  end if;

  select s.data into save from saves s where s.user_id = me and s.realm = 'main';
  if save is null then raise exception 'trades_no_save'; end if;
  if trade_in_world(save) then raise exception 'trades_world'; end if;
  if not (l.home_region = any (trade_started(save))) then raise exception 'trades_region'; end if;
  select * into hit from trade_find(save, p_inst);
  if hit.inst is null then raise exception 'trades_not_found'; end if;
  if trade_world(save, hit.region) then raise exception 'trades_world'; end if;
  if hit.inst ->> 'revivesAt' is not null then raise exception 'trades_reviving'; end if;
  if hit.others < 1 then raise exception 'trades_last'; end if;
  gdex := (hit.inst ->> 'dex')::int;
  gshiny := coalesce((hit.inst ->> 'shiny')::boolean, false);
  if trade_untradable(gdex) then raise exception 'trades_untradable'; end if;
  if exists (select 1 from trade_listings t where t.owner = me and t.status = 'open' and t.mon ->> 'id' = p_inst)
     or exists (select 1 from trade_listings t where t.taker = me and not t.taker_applied and t.taker_mon ->> 'id' = p_inst) then
    raise exception 'trades_listed';
  end if;
  -- The poster must be able to receive it: its home region started on their side.
  if not (coalesce(l.poster -> 'regions', '[]') ? coalesce(trade_home_region(gdex), hit.region)) then
    raise exception 'trades_poster_region';
  end if;
  -- In parentheses: an IF's condition ends at its first THEN otherwise.
  if not (case l.want ->> 'kind'
    when 'species' then gdex = (l.want ->> 'dex')::int
                        and (l.want ->> 'talent' is distinct from 'true' or coalesce(hit.inst ->> 'talent', '') = 'true')
    when 'notOwned' then not trade_has(l.poster, gdex)
                         or (gshiny and not coalesce(l.poster -> 'shiny', '[]') @> to_jsonb(gdex))
    else true
  end) then
    raise exception 'trades_no_match';
  end if;

  update trade_listings t
     set status = 'taken', taker = me, taker_name = trade_name(me), taker_mon = hit.inst, taker_from = hit.region,
         taken_at = now()
   where t.id = l.id and t.status = 'open'
  returning * into l;
  return jsonb_build_object('id', l.id, 'listed', l.mon, 'given', l.taker_mon, 'with', coalesce(trade_name(l.owner), l.owner_name, ''),
    'withRich', player_rich(l.owner));
end
$$;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
