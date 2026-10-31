-- Real-player battles in areas (docs/53): a card of the area's deck that brings a real player's team, as it was when
-- that area was their newest one. Behind its own switch (docs/15 §20), Off.
--
-- 1. game_config `areaVersus` (the switch and the numbers) and area_versus_open(), the switch as the server reads it.
-- 2. The cards: `versus` in the encounter weights of the areas after their region's first gym that have trainers and
--    no gym leader, 2 in each Victory Road (`tsx scripts/area-versus-cards.ts --sql` writes the block below). An area
--    that has a number already keeps it.
-- 3. area_versus_teams: one team per player and area, written from the save by a trigger on `saves` while the save
--    stands in that area as its newest one (a main-chain area not cleared yet, or a secret area) in the main game.
--    Nothing the page sends: the team, the upgrades, the name and the look are the save's.
-- 4. area_versus_offer(area, skip): one team for the area, the least met first; area_versus_met(): the meets.
-- 5. Friend requests: friend_request_send(), friend_requests(), friend_request_answer().
-- 6. area_versus_fill(): every save of the last days through the writer. The end of this file runs it once, so the
--    cards come from the first day; the admin's "Fill from recent saves" runs it again.
-- 7. delete_my_data (0082's) deletes these rows too.
--
-- Run after 0033, 0039, 0040 and 0082. Safe to run again. seed.sql doesn't inline it.

begin;

-- ---------------------------------------------------------------- 1. the switch

insert into game_config (key, value)
values ('areaVersus', '{"access":"off","prizeMultiplier":1.5,"recentDays":14,"requestDays":30,"lastCards":3}'::jsonb)
on conflict (key) do nothing;

-- The numbers over their defaults (the engine's AREA_VERSUS_DEFAULTS).
create or replace function area_versus_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{"access":"off","prizeMultiplier":1.5,"recentDays":14,"requestDays":30,"lastCards":3}'::jsonb
    || coalesce((select value from game_config where key = 'areaVersus' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- The switch for the caller: on for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function area_versus_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false) from (select area_versus_cfg() ->> 'access' a) x
$$;

-- Whole days from the config, at least 1.
create or replace function area_versus_days(p_key text)
returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, coalesce(round((area_versus_cfg() ->> p_key)::numeric)::int, 1))
$$;

-- ---------------------------------------------------------------- 2. the cards

-- GENERATED CARDS BEGIN (tsx scripts/area-versus-cards.ts --sql)
update areas a set encounter_weights = coalesce(a.encounter_weights, '{}'::jsonb) || jsonb_build_object('versus', v.n)
from (values
  ('4af1e90d-318f-5fda-802f-531ebcdbf0a0', 1),
  ('0c90a15f-5054-5e52-ba55-e310e78d4a49', 1),
  ('eb01f9bc-a3e2-5fdb-ade9-343b5c0c04b9', 1),
  ('84e74f22-b8fc-5658-8f2d-c2cf1751b4f8', 1),
  ('6c54a30a-d5cc-5311-ae07-d9b0dfac5db2', 1),
  ('132bb05f-9768-59fb-89de-b25ecb1acc45', 1),
  ('110c8267-ee16-5a44-960f-620d6055d6ca', 1),
  ('dd760e2c-72d3-5597-8de3-f42318e46551', 1),
  ('ffd172b1-9ee2-54a8-bc39-a66661a7e0b8', 1),
  ('8e755a0e-8270-5685-857c-629ea1b7d9c5', 1),
  ('463df9e2-3191-591e-889c-f3a8c82e6c0a', 2),
  ('87abcf50-112f-54af-bfe1-5ff516c00b58', 1),
  ('ad471a2a-c699-586e-9108-65f5b557fa95', 1),
  ('ae5875f0-198e-58a6-bd22-7418d51270e3', 1),
  ('18c36b75-2a63-5861-803e-176c1afd1f05', 1),
  ('8ced3bb7-e9ea-59b5-9515-aed7d2ced0d7', 1),
  ('35ba43d5-ed6e-5add-a1ce-4f1d20e34cf4', 1),
  ('aa7c054d-8c55-5640-b3d5-2731ca24a00c', 1),
  ('57a87398-8ee0-5924-b794-bb1ca29ed358', 1),
  ('88858f3b-8429-567d-90ea-fd319448d274', 1),
  ('0935501c-7f1e-5cf5-a84f-0b04fc538632', 1),
  ('b4cfbd96-a745-5dbb-9187-d225cf3b6059', 1),
  ('707bb825-6657-5025-b3b2-422458b071d9', 1),
  ('c3397515-cd10-59d4-b70a-949ef766c59d', 2),
  ('1a6ff054-0850-54a9-8471-e828a46154b4', 1),
  ('49426aac-676d-55e9-94b7-e26f2162510b', 1),
  ('6f00f916-60e4-5daa-9906-c2204de369a1', 1),
  ('5fba87f3-6e88-5d47-8f6c-549021a0c04e', 1),
  ('30af3925-076e-5c88-a6c7-fba28a4ed035', 1),
  ('61bfb445-9bdc-5e47-9c3a-f379bd33a06b', 1),
  ('3aa36df1-1d3e-533b-8f85-32ca0b970b16', 1),
  ('464335aa-aa23-5f1b-907f-62440757a77b', 1),
  ('f4f7c889-a1bb-5903-b75b-c62dd683c6ec', 1),
  ('bcb0a995-0b15-59b4-baad-07e16f5d19b6', 1),
  ('ca2e6708-ff90-579a-b978-f769f97c6dff', 1),
  ('28453b26-704e-599c-b5ab-7763047b0cf7', 2),
  ('829a4b14-5248-5410-8b66-60d96d873160', 1),
  ('665e8d04-8cda-5960-9a8a-0e843c5a095e', 1),
  ('1df761a4-cf28-58ca-88f5-17f794f27b79', 1),
  ('1ef28784-b335-528e-afea-f89700680d7e', 1),
  ('f319e2ef-f0d1-5f2d-a7cb-cf92aeb8bca7', 1),
  ('1e08b1b8-cda6-5046-a40f-5041361f6736', 1),
  ('ff3f0086-1b99-559e-a646-e88006eec749', 1),
  ('e7d8c094-5b1f-51d5-b205-3951e8be98ab', 1),
  ('6be7fc24-0db6-59e6-b9f0-81cbefc90ab4', 1),
  ('6ce5603a-9b36-52df-b8bc-3e9efb0686c3', 2),
  ('a5d11263-453f-5181-9a73-2c30df79d3fc', 1),
  ('b64f2ae7-b9ae-5707-b904-f1e31aa66253', 1),
  ('2be87c2d-54b0-5ab8-888a-43f7bfc5da5e', 1),
  ('45a1953c-7b1e-5408-9205-00d75f9dc980', 1),
  ('bdfbef78-d8fc-5fca-a7c6-1d1a60ab2653', 1),
  ('77afa3c1-7785-5e6f-a3cc-f249ec9af432', 1),
  ('dd2c1bae-80b9-5100-9e1e-554927bca8d3', 1),
  ('539298c8-926d-56a3-bf8e-e8635db096da', 1),
  ('0f04ef44-9fa0-57a3-b121-3b883b80e4b3', 1),
  ('05803fd7-2ba3-5891-81b7-368dc894de79', 1),
  ('b882b6d6-bf43-51e2-9320-acd5a9852333', 1),
  ('e2e8a0d9-9b0a-564b-9f4a-cead9f3ff959', 1),
  ('cebf8471-cd94-534a-a781-98297581743e', 2),
  ('cb642e3e-986b-5430-b507-7baf6cc0567b', 1),
  ('02d13ccb-081f-5e58-9fff-ec6dc0947235', 1),
  ('54da008e-5400-5829-8024-4b6589e0e959', 1),
  ('db0475ed-7547-5350-a42a-7d25d3ea324b', 1),
  ('c442130a-bc84-533f-88c9-05d2bfd35e1c', 1),
  ('ddf0658d-99fb-5fef-ab31-90dab5f39fb6', 1),
  ('2f688337-989f-54f8-a724-4b7acb8958f8', 1),
  ('9c6c6d9c-030c-55ba-9294-e9125e8ef539', 2),
  ('a79ba3e6-ec33-5480-8a4e-d7175eb8fb9a', 1),
  ('ef57b168-56a6-55c7-ad15-a09d319e487b', 1),
  ('a3fa05ff-904e-5994-98aa-134ee66e5f80', 1),
  ('87cba513-0bc5-55df-a781-9de73048528c', 1),
  ('0e1ccc24-1c60-56e1-9f03-4b3deda34951', 1),
  ('7d3ee2f7-3442-5738-b2c6-d3037e514fec', 1),
  ('d6ba26d1-3dd2-51fc-b559-74c01d2ddba2', 1),
  ('3463beea-946a-5c99-89d1-19dc707896e8', 1),
  ('db4e5701-dfdf-54dd-bfee-002c1fdcc391', 1),
  ('e22d5bee-8d04-5f99-ab7f-157785f0a30b', 1),
  ('e7f76d12-ae38-5958-a173-c17897d81a5e', 1),
  ('3b798c52-789e-5e63-a333-102f529ad855', 1),
  ('754c266f-20b0-5367-a889-82c082de70f3', 1),
  ('e8a36a96-5c86-5e7d-a5f5-0c845ab2dbe8', 1),
  ('890cb77d-0fe5-5576-9b92-2ab68f0be295', 1),
  ('0c17194f-f7be-5221-91d0-68fcee8da9d9', 1),
  ('d8f06e4c-6ffd-5b94-9149-43231e89927f', 1),
  ('7d1a416a-9b25-5028-b602-c59fee3c07f9', 1),
  ('2157b46b-a121-543b-9cca-b18fdc85d65e', 1),
  ('cd6e3688-d7e8-509f-a438-abf66eea0692', 1),
  ('bda155ba-8676-5610-a304-3aa1a309a8f5', 1)
) v(id, n)
where a.id::text = v.id and not (coalesce(a.encounter_weights, '{}'::jsonb) ? 'versus');
-- GENERATED CARDS END

-- ---------------------------------------------------------------- 3. the teams

create table if not exists area_versus_teams (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id text not null,
  region text not null,
  name text not null,
  avatar text not null,
  rich boolean not null default false,
  team jsonb not null,                 -- [{dex, level, shiny, talent}], the save's team in its order
  levels jsonb not null,               -- {combo: {key: level}, dice: {type: level}}: the save's upgrades
  played_at timestamptz not null,      -- the save's: "Played here 2 days ago", and the recent days' rule
  primary key (user_id, area_id),
  constraint area_versus_teams_small check (pg_column_size(team) + pg_column_size(levels) < 8000)
);
create index if not exists area_versus_teams_area on area_versus_teams (area_id, played_at desc);

create table if not exists area_versus_meets (
  user_id uuid not null references auth.users(id) on delete cascade,
  foe_id uuid not null references auth.users(id) on delete cascade,
  area_id text not null,
  outcome text not null check (outcome in ('won', 'lost', 'skipped')),
  at timestamptz not null default now(),
  primary key (user_id, foe_id, area_id)
);
create index if not exists area_versus_meets_foe on area_versus_meets (foe_id);

create table if not exists friend_requests (
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  area_id text,                        -- where they met: "Fought you in Route 4"
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index if not exists friend_requests_to on friend_requests (to_id, created_at desc);

alter table area_versus_teams enable row level security;
alter table area_versus_meets enable row level security;
alter table friend_requests enable row level security;
revoke all on area_versus_teams, area_versus_meets, friend_requests from anon, authenticated;
drop policy if exists area_versus_teams_admin on area_versus_teams;
create policy area_versus_teams_admin on area_versus_teams for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists area_versus_meets_admin on area_versus_meets;
create policy area_versus_meets_admin on area_versus_meets for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friend_requests_admin on friend_requests;
create policy friend_requests_admin on friend_requests for all using ((select is_admin())) with check ((select is_admin()));

-- A save's team for the area it stands in, when that area is its newest one: a main-chain area isn't cleared before the
-- next one opens, so "not cleared" is "the newest"; a secret area counts while it isn't cleared either (most never
-- are). Only the main game, the region being played, an area that deals the card, a team the game knows.
create or replace function area_versus_write(p_user uuid, p_data jsonb, p_at timestamptz, p_realm text default 'main')
returns void
language plpgsql security definer set search_path = public as $$
declare
  -- The save, unpacked once (0040): a trigger's argument is the stored value, compressed and kept out of line.
  d jsonb;
  here text;
  live text;
  region_of text;
  weights jsonb;
  t jsonb;
begin
  if p_user is null or coalesce(p_realm, 'main') <> 'main' then return; end if;
  d := p_data || '{}'::jsonb;
  if d ->> 'mode' = 'extreme' then return; end if;
  here := d ->> 'currentAreaId';
  if here is null then return; end if;
  select a.region_id, a.encounter_weights into region_of, weights from areas a where a.id::text = here;
  if not found or coalesce(round((weights ->> 'versus')::numeric), 0) <= 0 then return; end if;
  live := coalesce(nullif(d ->> 'region', ''), 'kanto');
  if region_of <> live then return; end if;
  if coalesce((d -> 'areaProgress' -> here ->> 'cleared')::boolean, false) then return; end if;
  select jsonb_agg(jsonb_build_object(
      'dex', (m ->> 'dex')::int,
      'level', least(100, greatest(1, (m ->> 'level')::int)),
      'shiny', coalesce((m -> 'shiny') = 'true'::jsonb, false),
      'talent', coalesce((m -> 'talent') = 'true'::jsonb, false)
    ) order by tm.ord)
    into t
  from jsonb_array_elements_text(coalesce(d -> 'team', '[]')) with ordinality tm(id, ord)
  join jsonb_array_elements(coalesce(d -> 'box', '[]')) m on m ->> 'id' = tm.id
  where m ->> 'revivesAt' is null and (m ->> 'dex') ~ '^[0-9]+$' and (m ->> 'level') ~ '^[0-9]+$';
  if t is null or jsonb_array_length(t) = 0 then return; end if;
  insert into area_versus_teams as v (user_id, area_id, region, name, avatar, rich, team, levels, played_at)
  values (
    p_user,
    here,
    live,
    left(coalesce(nullif(trim(d -> 'player' ->> 'name'), ''), 'Trainer'), 12),
    left(coalesce(d -> 'player' ->> 'avatar', d -> 'player' ->> 'character', 'red'), 40),
    coalesce((d -> 'general' -> 'rich') = 'true'::jsonb, false),
    t,
    jsonb_build_object(
      'combo', case when jsonb_typeof(d -> 'comboLevels') = 'object' then d -> 'comboLevels' else '{}'::jsonb end,
      'dice', case when jsonb_typeof(d -> 'dieLevels') = 'object' then d -> 'dieLevels' else '{}'::jsonb end
    ),
    p_at
  )
  on conflict (user_id, area_id) do update set
    region = excluded.region,
    name = excluded.name,
    avatar = excluded.avatar,
    rich = excluded.rich,
    team = excluded.team,
    levels = excluded.levels,
    played_at = excluded.played_at
  -- An older save (another device's, a fill after a newer push) never takes a newer team's place.
  where v.played_at <= excluded.played_at;
end
$$;
revoke all on function area_versus_write(uuid, jsonb, timestamptz, text) from public, anon, authenticated;

create or replace function saves_area_versus()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform area_versus_write(new.user_id, new.data, new.updated_at, coalesce(new.realm, 'main'));
  exception when others then
    -- Never the upload's failure: the team waits for the next one.
    raise warning 'area versus team for %: %', new.user_id, sqlerrm;
  end;
  return null;
end
$$;
revoke all on function saves_area_versus() from public, anon, authenticated;
drop trigger if exists saves_area_versus on saves;
create trigger saves_area_versus after insert or update of data, updated_at on saves
  for each row execute function saves_area_versus();

-- ---------------------------------------------------------------- 4. the offer and the meets

-- One team for the area: not the caller's, not a banned player's, played there in the recent days; the players the
-- caller met least lately first (never met: first of all), those in `p_skip` (just met, a guest's memory) last. With
-- nobody else, the same one again. Readable signed out: a guest meets real players too.
create or replace function area_versus_offer(p_area text, p_skip uuid[] default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r record;
begin
  if not area_versus_open() then return null; end if;
  select t.*, (select max(m.at) from area_versus_meets m where m.user_id = me and m.foe_id = t.user_id) last_met
    into r
  from area_versus_teams t
  where t.area_id = p_area
    and t.played_at > now() - make_interval(days => area_versus_days('recentDays'))
    and t.user_id is distinct from me
    and not exists (select 1 from leaderboard_bans b where b.user_id = t.user_id)
  order by t.user_id = any(coalesce(p_skip, '{}')), last_met nulls first, random()
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', r.user_id,
    'name', r.name,
    'avatar', r.avatar,
    'rich', r.rich,
    'friend', me is not null and exists (
      select 1 from friendships f where f.user_a = least(me, r.user_id) and f.user_b = greatest(me, r.user_id)
    ),
    'playedAt', r.played_at,
    'team', r.team,
    'levels', r.levels
  );
end
$$;

-- The caller met this player's team here: fought it (won or lost) or skipped it. The latest meet per area is kept.
create or replace function area_versus_met(p_foe uuid, p_area text, p_outcome text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'friends_signed_out' using errcode = '42501'; end if;
  if not area_versus_open() then raise exception 'area_versus_off' using errcode = 'P0001'; end if;
  if p_outcome not in ('won', 'lost', 'skipped') then raise exception 'area_versus_bad_outcome' using errcode = '22023'; end if;
  if p_foe = me or not exists (select 1 from area_versus_teams t where t.user_id = p_foe and t.area_id = p_area) then
    return;
  end if;
  insert into area_versus_meets (user_id, foe_id, area_id, outcome, at)
  values (me, p_foe, p_area, p_outcome, now())
  on conflict (user_id, foe_id, area_id) do update set outcome = excluded.outcome, at = excluded.at;
  delete from area_versus_meets where user_id = me and at < now() - interval '90 days';
end
$$;

-- ---------------------------------------------------------------- 5. friend requests

-- To a player whose team the caller met in the request days. 'sent', 'pending' (sent already), 'added' (they had asked
-- the caller: friends at once), 'already', 'self', 'not_met', 'full' (the caller's list), 'friend_full' (theirs).
create or replace function friend_request_send(p_to uuid, p_area text default null)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  days int := area_versus_days('requestDays');
  cap int;
begin
  if me is null then raise exception 'friends_signed_out' using errcode = '42501'; end if;
  if not area_versus_open() then raise exception 'area_versus_off' using errcode = 'P0001'; end if;
  perform friend_attempt(me::text);
  if p_to is null or p_to = me then return 'self'; end if;
  delete from friend_requests where created_at < now() - make_interval(days => days);
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || least(me, p_to)::text));
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || greatest(me, p_to)::text));
  if exists (select 1 from friendships f where f.user_a = least(me, p_to) and f.user_b = greatest(me, p_to)) then
    return 'already';
  end if;
  if not exists (
    select 1 from area_versus_meets m
    where m.user_id = me and m.foe_id = p_to and m.at > now() - make_interval(days => days)
  ) then
    return 'not_met';
  end if;
  if exists (select 1 from friend_requests r where r.from_id = me and r.to_id = p_to) then return 'pending'; end if;
  cap := coalesce((select (g.value #>> '{}')::int from game_config g where g.key = 'maxFriends'), 100);
  if (select count(*) from friendships f where f.user_a = me or f.user_b = me) >= cap then return 'full'; end if;
  -- They asked the caller already: both want it.
  if exists (select 1 from friend_requests r where r.from_id = p_to and r.to_id = me) then
    if (select count(*) from friendships f where f.user_a = p_to or f.user_b = p_to) >= cap then return 'friend_full'; end if;
    delete from friend_requests where (from_id = p_to and to_id = me) or (from_id = me and to_id = p_to);
    insert into friendships (user_a, user_b, added_by, a_seen, b_seen)
    values (least(me, p_to), greatest(me, p_to), me, least(me, p_to) = me, greatest(me, p_to) = me);
    return 'added';
  end if;
  insert into friend_requests (from_id, to_id, area_id) values (me, p_to, left(p_area, 64));
  return 'sent';
end
$$;

-- The caller's requests to answer, the newest first: who (their main card's name and look), where they met, when.
create or replace function friend_requests()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.from_id,
      'name', coalesce(c.name, 'Trainer'),
      'avatar', coalesce(c.avatar, 'red'),
      'rich', coalesce(c.rich, false),
      'area', r.area_id,
      'at', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
  from friend_requests r
  left join player_cards c on c.user_id = r.from_id and c.realm = 'main'
  where auth.uid() is not null
    and r.to_id = auth.uid()
    and area_versus_open()
    and r.created_at > now() - make_interval(days => area_versus_days('requestDays'))
$$;

-- ACCEPT (friends, the cap as for an ID) or NO: 'added', 'declined', 'already', 'gone' (expired, or never sent),
-- 'full' (the caller's list), 'friend_full' (theirs). The request goes either way; the asker is told as for a new friend.
create or replace function friend_request_answer(p_from uuid, p_accept boolean)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  found_at timestamptz;
  cap int;
begin
  if me is null then raise exception 'friends_signed_out' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || least(me, p_from)::text));
  perform pg_advisory_xact_lock(hashtext('pokedice.friends:' || greatest(me, p_from)::text));
  delete from friend_requests where from_id = p_from and to_id = me returning created_at into found_at;
  if found_at is null or found_at < now() - make_interval(days => area_versus_days('requestDays')) then return 'gone'; end if;
  if not coalesce(p_accept, false) then return 'declined'; end if;
  if exists (select 1 from friendships f where f.user_a = least(me, p_from) and f.user_b = greatest(me, p_from)) then
    return 'already';
  end if;
  cap := coalesce((select (g.value #>> '{}')::int from game_config g where g.key = 'maxFriends'), 100);
  if (select count(*) from friendships f where f.user_a = me or f.user_b = me) >= cap then return 'full'; end if;
  if (select count(*) from friendships f where f.user_a = p_from or f.user_b = p_from) >= cap then return 'friend_full'; end if;
  delete from friend_requests where from_id = me and to_id = p_from;
  -- The caller has seen it (they accepted it); the asker hasn't: their dot and toast, as for any new friend.
  insert into friendships (user_a, user_b, added_by, a_seen, b_seen)
  values (least(me, p_from), greatest(me, p_from), p_from, least(me, p_from) = me, greatest(me, p_from) = me);
  return 'added';
end
$$;

-- ---------------------------------------------------------------- 6. the fill

-- Every main-game save written in the recent days, through the writer: what a player standing in their newest area
-- would have written there. Returns the teams the pool holds after it.
create or replace function area_versus_fill_all()
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  s record;
begin
  for s in
    select user_id, data, updated_at from saves
    where coalesce(realm, 'main') = 'main' and updated_at > now() - make_interval(days => area_versus_days('recentDays'))
  loop
    begin
      perform area_versus_write(s.user_id, s.data, s.updated_at, 'main');
    exception when others then
      raise warning 'area versus fill for %: %', s.user_id, sqlerrm;
    end;
  end loop;
  return (select count(*)::int from area_versus_teams);
end
$$;
revoke all on function area_versus_fill_all() from public, anon, authenticated;

-- The admin's "Fill from recent saves".
create or replace function area_versus_fill()
returns int
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  return area_versus_fill_all();
end
$$;

-- ---------------------------------------------------------------- 7. deleting your data (0082's, with these rows)

create or replace function delete_my_data(p_realm text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if p_realm is not null and p_realm not in ('main', 'extreme') then
    raise exception 'bad_realm' using errcode = '22023';
  end if;
  delete from saves where user_id = me and (p_realm is null or realm = p_realm);
  delete from player_cards where user_id = me and (p_realm is null or realm = p_realm); -- and their regions
  delete from versus_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from versus_battles where (attacker_id = me or defender_id = me) and (p_realm is null or realm = p_realm);
  delete from event_state where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_teams where user_id = me and (p_realm is null or realm = p_realm);
  delete from raid_gifts where (helper_id = me or raider_id = me) and (p_realm is null or realm = p_realm);
  if to_regclass('public.raid_progress_teams') is not null then
    delete from raid_progress_teams where user_id = me and (p_realm is null or realm = p_realm);
    delete from raid_progress_done where user_id = me and (p_realm is null or realm = p_realm);
  end if;
  -- Trades (0044): your open listings go; trades still owed to the other player stay for them, without your name.
  if to_regclass('public.trade_listings') is not null and (p_realm is null or p_realm = 'main') then
    delete from trade_listings where owner = me and (status = 'open' or taker is null or taker_applied);
    delete from trade_listings where taker = me and owner_applied;
    update trade_listings set owner = null, owner_name = null, owner_applied = true where owner = me;
    update trade_listings set taker = null, taker_name = null, taker_applied = true where taker = me;
  end if;
  -- The Underground (0063): your seat (an emptied team goes), your invitations, the orbs owed to you.
  if to_regclass('public.ug_members') is not null and (p_realm is null or p_realm = 'main') then
    delete from ug_invites where from_user = me or to_user = me;
    delete from ug_orbs where to_user = me;
    delete from ug_members where user_id = me;
    delete from ug_teams t where not exists (select 1 from ug_members m where m.team_id = t.id);
  end if;
  -- The Versus league (0082): your places, offers and matches; others' offers of you go too.
  if to_regclass('public.versus_league_members') is not null and (p_realm is null or p_realm = 'main') then
    delete from versus_league_choices where user_id = me or foe_user = me;
    delete from versus_league_matches where user_id = me;
    update versus_league_matches set foe_user = null where foe_user = me;
    delete from versus_league_members where user_id = me;
  end if;
  -- Real-player battles (0098): your teams in areas and your meets, both ways.
  if p_realm is null or p_realm = 'main' then
    delete from area_versus_teams where user_id = me;
    delete from area_versus_meets where user_id = me or foe_id = me;
  end if;
  if p_realm is null then
    delete from friend_codes where user_id = me;
    delete from friendships where user_a = me or user_b = me;
    delete from friend_requests where from_id = me or to_id = me;
    delete from friend_attempts where actor = me::text;
    delete from push_subscriptions where owner = 'u:' || me::text;
    delete from push_notices where owner = 'u:' || me::text;
  end if;
end
$$;

-- ---------------------------------------------------------------- grants

revoke all on function area_versus_cfg() from public;
revoke all on function area_versus_days(text) from public;
grant execute on function area_versus_open() to anon, authenticated;
grant execute on function area_versus_offer(text, uuid[]) to anon, authenticated;
revoke all on function area_versus_met(uuid, text, text) from public, anon;
grant execute on function area_versus_met(uuid, text, text) to authenticated;
revoke all on function friend_request_send(uuid, text) from public, anon;
grant execute on function friend_request_send(uuid, text) to authenticated;
revoke all on function friend_requests() from public, anon;
grant execute on function friend_requests() to authenticated;
revoke all on function friend_request_answer(uuid, boolean) from public, anon;
grant execute on function friend_request_answer(uuid, boolean) to authenticated;
revoke all on function area_versus_fill() from public, anon;
grant execute on function area_versus_fill() to authenticated;

-- ---------------------------------------------------------------- the first fill, and the new content

select area_versus_fill_all();

insert into game_config (key, value) values ('configVersion', '1'::jsonb)
on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
