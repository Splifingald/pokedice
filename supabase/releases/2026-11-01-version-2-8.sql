-- Version 2.8's database changes in one go: migrations 0097 to 0107, in order, in one transaction (all or nothing).
-- Supabase → the pokedice project → SQL Editor → New query → paste all of this → Run. Each migration is safe to run
-- again, so this file is too. The migrations stay the source (supabase/migrations/); this file only strings them
-- together, each one's own begin/commit taken out so the whole runs as one transaction. Every new feature in it
-- arrives Off (Admin → its switch).
begin;

-- ======================================================================== ↓ supabase/migrations/0097_versus_best_trophies.sql
-- The most trophies a player has ever held in the Versus league (docs/44 §10), on the trainer card in place of the old
-- board's wins: theirs, and a friend's on the friend's card.
--
-- The league starts again from 0 every Monday, and a week's row keeps only where its trophies stand now. So each row
-- gets its high mark (`best`), raised by a trigger whenever the trophies go past it, whichever function moved them (a
-- match's start and its result, the bots' climb): none of 0082's functions is written again. The weeks fought before
-- this ran get theirs from their matches (the trophies before each one, and after each one finished).
--
-- Run after 0082 (and 0033, for the friends); safe to run again. supabase/seed.sql doesn't inline it.

alter table versus_league_members add column if not exists best int not null default 0;

create or replace function versus_league_members_best()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.best := greatest(coalesce(new.best, 0), new.trophies);
  return new;
end
$$;

drop trigger if exists versus_league_members_best on versus_league_members;
create trigger versus_league_members_best
  before insert or update of trophies, best on versus_league_members
  for each row execute function versus_league_members_best();

-- The weeks already fought: the trophies now, before every match, and right after every finished one.
update versus_league_members m
set best = h.best
from (
  select m2.id,
         greatest(m2.trophies, coalesce(max(greatest(
           x.trophies_before,
           case when x.finished_at is not null then x.trophies_before + x.delta else 0 end
         )), 0)) as best
  from versus_league_members m2
  left join versus_league_matches x on x.week = m2.week and x.user_id = m2.user_id
  group by m2.id, m2.trophies
) h
where h.id = m.id and h.best > m.best;

-- The caller's high mark across every week of the league, this one included, or a friend's (`p_user`). Null while the
-- league is closed to the caller, signed out, or for someone who isn't their friend; 0 for a player who never fought.
create or replace function versus_league_best(p_user uuid default null)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who uuid := coalesce(p_user, auth.uid());
begin
  if me is null or not versus_league_open() then return null; end if;
  if who <> me and not exists (select 1 from friend_ids_of(me) f where f.id = who) then return null; end if;
  return coalesce((select max(m.best) from versus_league_members m where m.user_id = who), 0);
end
$$;

revoke all on function versus_league_best(uuid) from public;
grant execute on function versus_league_best(uuid) to authenticated;

-- ======================================================================== ↓ supabase/migrations/0098_legend_cinema.sql
-- The legends' own cinematics (docs/53): Mewtwo's lab, Articuno's ice cavern, Zapdos's power plant, Moltres's
-- volcano, Mew's forest… instead of the shared entrance, and no warning tapes on a legend's raid.
-- 1. game_config `legendCinema`: the switch, Off (left alone when there). It only changes how an entrance looks and
--    sounds on the player's device (the engine has decided the fight first), so no server function acts for it and
--    none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
insert into game_config (key, value) values ('legendCinema', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0099_area_versus.sql
-- Real-player battles in areas (docs/54): a card of the area's deck that brings a real player's team, as it was when
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
  -- Real-player battles (0099): your teams in areas and your meets, both ways.
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

-- ======================================================================== ↓ supabase/migrations/0100_gift_calendar.sql
-- The gift calendar (docs/55): a live event of type `calendar`, a door a day with one reward each (an item, Pokédollars
-- or a Pokémon, in a quantity), opened on its day or the next.
-- 1. game_config `giftCalendar`: its switch, Off (left alone when there). The calendar itself is a live event in the
--    `liveEvents` row the admin already writes. The doors a player opened are in their own save, on the server's clock
--    (event_time), like the Special Shop's limits, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
insert into game_config (key, value) values ('giftCalendar', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0101_champion_cinema.sql
-- The champions' own cinematics (docs/56): Red on Mt. Silver's summit, Lance's dragons over the Indigo Plateau, Leon's
-- stadium… instead of the trainer stepping onto the field, before every League Champion's fight.
-- 1. game_config `championCinema`: the switch, Off (left alone when there). It only changes how an entrance looks and
--    sounds on the player's device (the engine has decided the fight first), so no server function acts for it and
--    none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
insert into game_config (key, value) values ('championCinema', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0102_analytics_retention.sql
-- Admin → Analytics, sharper (docs/57): day-3, day-7 and day-30 retention next to day-1, a guest who signs in no longer
-- counted as a new player, and churn by area on demand.
--
-- 1. players.last_area: the area the player was in the last time the game reported, refreshed by the daily ping's
--    snapshot and now by the hourly player_seen too, so it is where they were in the last hour they played, not where
--    they started their last day.
-- 2. analytics_merge_player(): moves one player's days, hours and missing details into another key, then deletes the
--    first. Internal: only the functions below call it.
-- 3. player_ping() (0028, 0042), same signature: signed in, it first merges this device's guest row
--    ('device:<id>') into the account, so a guest who signs in keeps their first day instead of counting twice.
-- 4. player_seen(device, area): the hourly call carries the area (an Extreme save sends none). player_seen(device),
--    the deployed builds' call, keeps working.
-- 5. Once: the pairs already there (a signed-in row whose latest device has a guest row) are merged.
-- 6. analytics_retention(): {first day: [new players, back on day 1, day 3, day 7, day 30]}. analytics_d1 (0028) stays
--    as it is for the build still calling it.
-- 7. analytics_churn(days, since): per area, the players gone that many days and the ones still playing.
--
-- Run it before deploying the build that calls analytics_retention. Safe to run again.

alter table players add column if not exists last_area text;

-- Where every player was as of their latest snapshot, until the game reports again.
update players set last_area = snapshot ->> 'areaId'
where last_area is null and length(snapshot ->> 'areaId') between 1 and 64;

-- ---------------------------------------------------------------- one player's history into another's
-- The days and hours are a union (a day both keys played counts once); the target keeps its own name, email, snapshot
-- and area and takes the source's only where it has none; first and last day span both; days is recounted. The target
-- row is created from the source when it doesn't exist yet (a first sign-in). False when there is no source row.
create or replace function analytics_merge_player(p_from text, p_into text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  g players%rowtype;
begin
  if p_from is null or p_into is null or p_from = p_into then
    return false;
  end if;
  -- Locked, so two tabs signing in at once can't both move it.
  select * into g from players where player = p_from for update;
  if not found then
    return false;
  end if;
  insert into player_days (player, day) select p_into, day from player_days where player = p_from on conflict do nothing;
  delete from player_days where player = p_from;
  insert into player_hours (hour, player) select hour, p_into from player_hours where player = p_from
  on conflict do nothing;
  delete from player_hours where player = p_from;
  delete from players where player = p_from;
  insert into players as x (player, user_id, device_id, name, email, first_day, last_day, days, snapshot, last_area,
                            updated_at)
  values (p_into, null, g.device_id, g.name, g.email, g.first_day, g.last_day, g.days, g.snapshot, g.last_area,
          g.updated_at)
  on conflict (player) do update set
    device_id = coalesce(x.device_id, excluded.device_id),
    name = coalesce(x.name, excluded.name),
    email = coalesce(x.email, excluded.email),
    first_day = least(x.first_day, excluded.first_day),
    last_day = greatest(x.last_day, excluded.last_day),
    snapshot = coalesce(x.snapshot, excluded.snapshot),
    last_area = coalesce(x.last_area, excluded.last_area),
    updated_at = greatest(x.updated_at, excluded.updated_at);
  update players set days = (select count(*) from player_days d where d.player = p_into) where player = p_into;
  return true;
end
$$;
revoke all on function analytics_merge_player(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the game's one call a day (0028, 0042)
create or replace function player_ping(p_device_id text, p_day date, p_name text default null, p_snapshot jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'UTC')::date;
  p text;
  area text;
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  -- The player's local day is within a day of UTC's, wherever they are.
  if p_day is null or p_day < today - 1 or p_day > today + 1 then
    raise exception 'bad day' using errcode = '22023';
  end if;
  if p_snapshot is not null and pg_column_size(p_snapshot) >= 32000 then
    p_snapshot := null;
  end if;
  area := p_snapshot ->> 'areaId';
  if length(area) not between 1 and 64 then
    area := null;
  end if;
  p := coalesce(uid::text, 'device:' || p_device_id);

  -- A guest who signs in on this device is the same player: their days so far become the account's, and their first
  -- day stays their first (else they'd count once as a guest who never came back and once as a new player).
  if uid is not null then
    perform analytics_merge_player('device:' || p_device_id, p);
  end if;

  insert into player_days (player, day) values (p, p_day) on conflict do nothing;
  insert into player_hours (hour, player) values (date_trunc('hour', now(), 'UTC'), p) on conflict do nothing;
  insert into players as x (player, user_id, device_id, name, email, first_day, last_day, days, snapshot, last_area,
                            updated_at)
  values (p, uid, p_device_id, left(nullif(trim(p_name), ''), 40), auth.jwt() ->> 'email', p_day, p_day,
          (select count(*) from player_days d where d.player = p), p_snapshot, area, now())
  on conflict (player) do update set
    user_id = coalesce(excluded.user_id, x.user_id),
    device_id = excluded.device_id,
    name = coalesce(excluded.name, x.name),
    email = coalesce(excluded.email, x.email),
    first_day = least(x.first_day, excluded.first_day),
    last_day = greatest(x.last_day, excluded.last_day),
    days = excluded.days,
    snapshot = coalesce(excluded.snapshot, x.snapshot),
    last_area = coalesce(excluded.last_area, x.last_area),
    updated_at = now();
end
$$;
revoke all on function player_ping(text, date, text, jsonb) from public;
grant execute on function player_ping(text, date, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- the game's call, once per player per hour (0042)
-- An overload rather than a defaulted parameter: the deployed build's call (device only) and the new one (device and
-- area) each match exactly one function, for PostgREST and for SQL alike.
create or replace function player_seen(p_device_id text, p_area_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p text;
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  p := coalesce(auth.uid()::text, 'device:' || p_device_id);
  insert into player_hours (hour, player) values (date_trunc('hour', now(), 'UTC'), p) on conflict do nothing;
  -- No area (an Extreme save, or an old build) leaves the main save's where it was.
  if length(p_area_id) between 1 and 64 then
    update players set last_area = p_area_id where player = p and last_area is distinct from p_area_id;
  end if;
  -- Nothing reads past a day; a week is kept to look back by hand. The key starts with the hour, so this is one
  -- index probe when there is nothing to delete.
  delete from player_hours where hour < now() - interval '8 days';
end
$$;
revoke all on function player_seen(text, text) from public;
grant execute on function player_seen(text, text) to anon, authenticated;

create or replace function player_seen(p_device_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform player_seen(p_device_id, null::text);
end
$$;
revoke all on function player_seen(text) from public;
grant execute on function player_seen(text) to anon, authenticated;

-- ---------------------------------------------------------------- once: the guests who already signed in
-- players.device_id only holds each account's latest device, so a guest row from an older device can't be matched.
-- A guest row matched by two accounts (a shared device) goes to the one that started first, as player_ping would have
-- given it to the first to sign in there.
do $$
declare
  r record;
begin
  for r in
    select distinct on (g.player) g.player as guest, u.player as owner
    from players u
    join players g on g.player = 'device:' || u.device_id
    where u.user_id is not null and u.device_id is not null and u.player not like 'device:%'
    order by g.player, u.first_day, u.player
  loop
    perform analytics_merge_player(r.guest, r.owner);
  end loop;
end
$$;

-- ---------------------------------------------------------------- retention, for the admin
-- {first day: [new players, of them back on day 1, day 3, day 7, day 30]}, day 0 being the first day. The page sums the
-- days of its time frame, each rate over the first days whose day N is over. Each check is one probe of player_days'
-- primary key.
create or replace function analytics_retention()
returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    select json_object_agg(first_day, json_build_array(n, d1, d3, d7, d30) order by first_day)
    from (
      select p.first_day, count(*)::int as n,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 1))::int as d1,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 3))::int as d3,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 7))::int as d7,
             count(*) filter (where exists (
               select 1 from player_days d where d.player = p.player and d.day = p.first_day + 30))::int as d30
      from players p
      group by p.first_day
    ) x
  ), '{}'::json);
end
$$;
revoke all on function analytics_retention() from public, anon;
grant execute on function analytics_retention() to authenticated;

-- ---------------------------------------------------------------- churn by area, for the admin, on demand
-- A player is churned when their last day is p_days or more before today (UTC: a player's own day is within one of
-- it), else active. Only players whose first day is on or after p_since (null: everyone). {today, cutoff (the latest
-- last day that counts as churned), areas: {area id: [churned, active, churned's average days played, active's]},
-- unknown: [churned, active] with no area recorded}.
create or replace function analytics_churn(p_days int, p_since date default null)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'UTC')::date;
  cutoff date;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'bad days' using errcode = '22023';
  end if;
  cutoff := today - p_days;
  return (
    with x as (
      select coalesce(nullif(last_area, ''), nullif(snapshot ->> 'areaId', '')) as area, last_day <= cutoff as gone,
             days
      from players
      where p_since is null or first_day >= p_since
    )
    select json_build_object(
      'today', today,
      'cutoff', cutoff,
      'areas', coalesce((
        select json_object_agg(area, json_build_array(churned, active, churned_days, active_days))
        from (
          select area,
                 count(*) filter (where gone)::int as churned,
                 count(*) filter (where not gone)::int as active,
                 round(avg(days) filter (where gone), 1) as churned_days,
                 round(avg(days) filter (where not gone), 1) as active_days
          from x
          where area is not null
          group by area
        ) a
      ), '{}'::json),
      'unknown', (
        select json_build_array(count(*) filter (where gone)::int, count(*) filter (where not gone)::int)
        from x
        where area is null
      )
    )
  );
end
$$;
revoke all on function analytics_churn(int, date) from public, anon;
grant execute on function analytics_churn(int, date) to authenticated;

-- ======================================================================== ↓ supabase/migrations/0103_welcome_back.sql
-- Welcome-back gifts (docs/58-WELCOME-BACK.md): a player who comes back after days away finds a message from the
-- developer carrying a gift, bigger the longer they were gone — by default ₽300 and a few items after 3 days, more after
-- 7, more again after 14 — at most once every 14 days. It is a developer's message with gifts like the admin's own
-- (0048: the same pop-up, wrapped gift, opening and My messages), written here by the server.
--
-- 1. game_config `welcomeBack`: the switch (Off / On for admin / On for everyone, Off: docs/15 §20), `cooldownDays` and
--    the tiers, inserted only if missing so seeding never clobbers the admin's. The engine has the same defaults
--    (src/engine/defaults.ts; tests/welcome-back-sql.test.ts keeps the two the same).
-- 2. welcome_back_claims: one row per player — their account (auth.uid()) or, for a guest, 'device:<id>', the keys
--    player_days uses — with the last welcome back sent: its day, the days away, the tier, its message.
-- 3. feedback_system() (0082's): a message written by a server function during a player's own call is let through as
--    the admin's is; a player's insert never is. 0082's two feedback triggers are restated unchanged, so this file
--    stands on 0048 alone.
-- 4. welcome_back_claim(device id, local day): the game asks once a day. Days away = that day − the last day the
--    server recorded the player playing before it (player_days, 0028: back the next day = 1), never the device's clock;
--    the day is checked within a day of UTC, as player_ping's. A signed-in player's days are their account's and this
--    device's from before they signed in here (0102 moves those into the account at the sign-in's ping; read both, in
--    case this call comes first), and a guest's claim moves into their account the same way (the later one kept, its
--    message with it), so a guest who signs in neither loses their history nor gets a second gift for the same return,
--    on this device or another. Nothing for a player with no earlier day, while the cooldown runs, below the
--    first tier, or with a day played after the one asked (the clock moved back). Otherwise it writes the message with
--    the highest tier's gifts and records the claim. Asked again the same day: the same answer, no second message.
--    Off (or On for admin and not the admin), or with the gifts off for the caller (a message's gift wouldn't show):
--    refused.
-- 5. configVersion + 1, so players fetch the new content.
--
-- Run after 0028, 0048 and 0082 (and 0102 where it ran; it isn't needed). Safe to run again. seed.sql doesn't inline it
-- (player_days isn't in its prelude).


-- ---------------------------------------------------------------- 1. the switch and the tiers

insert into game_config (key, value) values ('welcomeBack', '{
  "access": "off",
  "cooldownDays": 14,
  "tiers": [
    {"minDays": 3, "gifts": [
      {"kind": "gold", "amount": 300, "region": "latest"},
      {"kind": "item", "key": "great-ball", "qty": 5, "region": "latest"},
      {"kind": "item", "key": "super-potion", "qty": 3, "region": "latest"},
      {"kind": "item", "key": "rare-candy", "qty": 1, "region": "latest"}
    ]},
    {"minDays": 7, "gifts": [
      {"kind": "gold", "amount": 1000, "region": "latest"},
      {"kind": "item", "key": "ultra-ball", "qty": 5, "region": "latest"},
      {"kind": "item", "key": "hyper-potion", "qty": 3, "region": "latest"},
      {"kind": "item", "key": "revive", "qty": 2, "region": "latest"},
      {"kind": "item", "key": "rare-candy", "qty": 2, "region": "latest"}
    ]},
    {"minDays": 14, "gifts": [
      {"kind": "gold", "amount": 2500, "region": "latest"},
      {"kind": "item", "key": "ultra-ball", "qty": 10, "region": "latest"},
      {"kind": "item", "key": "max-revive", "qty": 3, "region": "latest"},
      {"kind": "item", "key": "max-ether", "qty": 2, "region": "latest"},
      {"kind": "item", "key": "rare-candy", "qty": 5, "region": "latest"}
    ]}
  ]
}'::jsonb)
on conflict (key) do nothing;

-- The admin's row over the defaults: a key the row lacks keeps its default (the tiers as a whole), as the game merges
-- it (engine/data.ts mergeConfig).
create or replace function welcome_back_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select '{
    "access": "off",
    "cooldownDays": 14,
    "tiers": [
      {"minDays": 3, "gifts": [
        {"kind": "gold", "amount": 300, "region": "latest"},
        {"kind": "item", "key": "great-ball", "qty": 5, "region": "latest"},
        {"kind": "item", "key": "super-potion", "qty": 3, "region": "latest"},
        {"kind": "item", "key": "rare-candy", "qty": 1, "region": "latest"}
      ]},
      {"minDays": 7, "gifts": [
        {"kind": "gold", "amount": 1000, "region": "latest"},
        {"kind": "item", "key": "ultra-ball", "qty": 5, "region": "latest"},
        {"kind": "item", "key": "hyper-potion", "qty": 3, "region": "latest"},
        {"kind": "item", "key": "revive", "qty": 2, "region": "latest"},
        {"kind": "item", "key": "rare-candy", "qty": 2, "region": "latest"}
      ]},
      {"minDays": 14, "gifts": [
        {"kind": "gold", "amount": 2500, "region": "latest"},
        {"kind": "item", "key": "ultra-ball", "qty": 10, "region": "latest"},
        {"kind": "item", "key": "max-revive", "qty": 3, "region": "latest"},
        {"kind": "item", "key": "max-ether", "qty": 2, "region": "latest"},
        {"kind": "item", "key": "rare-candy", "qty": 5, "region": "latest"}
      ]}
    ]
  }'::jsonb
    || coalesce((select value from game_config where key = 'welcomeBack' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

-- On for everyone, or for the admin only (their JWT). An odd value is off.
create or replace function welcome_back_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false) from (select welcome_back_cfg() ->> 'access' a) x
$$;

-- Whole days between two welcome backs, 1–365 (14 when unset or not a number): engine/welcomeBack.ts's.
create or replace function welcome_back_cooldown()
returns int
language sql stable security definer set search_path = public as $$
  select case when jsonb_typeof(welcome_back_cfg() -> 'cooldownDays') = 'number'
    then greatest(1, least(365, round((welcome_back_cfg() ->> 'cooldownDays')::numeric)::int))
    else 14 end
$$;

-- The tiers as the server reads them: a whole number of days 1–365, each once (the first kept), and a gift list the
-- gifts' check accepts (0048); fewest days first, six at most. Anything else is left out, never the rest.
create or replace function welcome_back_tiers()
returns table (min_days int, gifts jsonb)
language sql stable security definer set search_path = public as $$
  select x.min_days, x.gifts
  from (
    select distinct on (t.min_days) t.min_days, t.gifts
    from (
      select case when e ->> 'minDays' ~ '^[0-9]{1,3}$' and jsonb_typeof(e -> 'minDays') = 'number'
               then (e ->> 'minDays')::int end as min_days,
             e -> 'gifts' as gifts, o
      from jsonb_array_elements(
        case when jsonb_typeof(welcome_back_cfg() -> 'tiers') = 'array' then welcome_back_cfg() -> 'tiers' else '[]'::jsonb end
      ) with ordinality as w(e, o)
      where jsonb_typeof(e) = 'object'
    ) t
    where t.min_days between 1 and 365 and jsonb_typeof(t.gifts) = 'array' and feedback_gifts_ok(t.gifts)
    order by t.min_days, t.o
  ) x
  order by x.min_days
  limit 6
$$;

-- ---------------------------------------------------------------- 2. the claims

-- One row per player: the last welcome back sent. Only the admin reads it (the game asks welcome_back_claim()).
create table if not exists welcome_back_claims (
  player text primary key,                    -- user id, or 'device:<id>' for guests (player_days' keys)
  day date not null,                          -- the player's own day it was sent
  days int not null check (days >= 1),        -- days away then
  min_days int not null check (min_days >= 1),-- the tier given
  feedback_id bigint references feedback(id) on delete set null,  -- the message that carries it
  claimed_at timestamptz not null default now()
);

alter table welcome_back_claims enable row level security;
revoke all on welcome_back_claims from anon, authenticated;
drop policy if exists welcome_back_claims_admin on welcome_back_claims;
create policy welcome_back_claims_admin on welcome_back_claims for all
  using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- 3. a server function's message

-- A message written by the server itself, not by a player: the league's rewards (0082, from the scheduler's own
-- session) and now a welcome back (during the player's own call, from welcome_back_claim). The function says so with
-- `pokedice.system_message`; a player can't set it, and their own inserts run as anon or authenticated, so the
-- triggers' first check (feedback_reply_stamp, which runs as the caller) never lets one of theirs through even if they
-- could. Only inside a security definer function, owned by the database, is the current role neither.
create or replace function feedback_system()
returns boolean
language sql stable as $$
  select coalesce(current_setting('pokedice.system_message', true), '') = 'on'
     and (session_user not in ('authenticator', 'anon', 'authenticated')
          or current_user not in ('authenticator', 'anon', 'authenticated'))
$$;

-- 0082's triggers, unchanged: restated so a database that took 0048 and not 0082 lets the welcome back through too.
create or replace function feedback_reply_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.from_admin and (is_admin() or feedback_system()) then
      -- The admin writes to a player first: the words are already there, shown to the player as an answer.
      new.reply := nullif(trim(new.reply), '');
      new.replied_at := now();
      new.reply_seen := false;
    else
      new.from_admin := false;
      new.reply := null;
      new.replied_at := null;
      new.reply_seen := false;
      new.gifts := null;
    end if;
    new.gifts_claimed_at := null;
    return new;
  end if;
  -- Who wrote first never changes, and a gift once opened stays as it was opened.
  new.from_admin := old.from_admin;
  if old.gifts_claimed_at is not null then
    new.gifts := old.gifts;
    new.gifts_claimed_at := old.gifts_claimed_at;
  end if;
  if new.reply is distinct from old.reply then
    new.reply := nullif(trim(new.reply), '');
    new.replied_at := case when new.reply is null then null else now() end;
    new.reply_seen := false;
    if new.reply is not null then
      new.read := true;
    end if;
  end if;
  -- A gift added or changed shows the message again.
  if new.gifts is distinct from old.gifts then
    new.reply_seen := false;
  end if;
  return new;
end
$$;

create or replace function feedback_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if new.from_admin and (is_admin() or feedback_system()) then
    if new.user_id is null and coalesce(new.device_id, '') = '' then
      raise exception 'feedback_no_player' using errcode = '22023';
    end if;
    new.read := true;
    return new;
  end if;
  new.from_admin := false;
  new.gifts := null;
  new.user_id := auth.uid();
  new.email := case when auth.uid() is null then null else auth.jwt() ->> 'email' end;
  new.read := false;
  if (
    select count(*) from feedback f
    where f.created_at > now() - interval '10 minutes'
      and not f.from_admin
      and (f.device_id = new.device_id or (new.user_id is not null and f.user_id = new.user_id))
  ) >= 3 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------- 4. the claim

-- The game asks once a day (src/store/welcomeBack.ts), with the player's own day. Returns null, or
-- {day, days, minDays, messageId, fresh}: `fresh` when the message was written just now (the game loads its messages
-- again), false when it was today's already. The message's words are the game's, in the player's language, from the
-- numbers in `reply` (engine/welcomeBack.ts welcomeBackNote).
create or replace function welcome_back_claim(p_device_id text, p_day date)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  utc_today date := (now() at time zone 'UTC')::date;
  dev text;
  me text;
  keys text[];
  cool int;
  prev welcome_back_claims%rowtype;
  last_day date;
  away int;
  tier_days int;
  tier_gifts jsonb;
  msg bigint;
begin
  if p_device_id is null or length(p_device_id) = 0 or length(p_device_id) > 64 then
    raise exception 'bad device id' using errcode = '22023';
  end if;
  -- The player's day is within a day of UTC's, wherever they are (player_ping's check).
  if p_day is null or p_day < utc_today - 1 or p_day > utc_today + 1 then
    raise exception 'bad day' using errcode = '22023';
  end if;
  if not welcome_back_open() then
    raise exception 'welcome_back_off' using errcode = 'P0001';
  end if;
  -- The gift rides on a message, whose gifts are hidden while the gifts are off: no message then.
  if not gifts_open() then
    raise exception 'gifts_off' using errcode = 'P0001';
  end if;
  dev := 'device:' || p_device_id;
  me := coalesce(uid::text, dev);
  -- A signed-in player is their account and, before they signed in here, this device.
  keys := case when uid is null then array[dev] else array[uid::text, dev] end;
  -- Two tabs at once: one at a time per key, always in the same order.
  perform pg_advisory_xact_lock(hashtext('welcome_back:' || k)) from unnest(keys) k;
  cool := welcome_back_cooldown();

  -- A guest who signed in here: their last welcome back becomes their account's (the later of the two kept), as 0102's
  -- analytics_merge_player folds their days into it, so another device of the account can't send a second gift for
  -- the same return; and its message follows the account to every device.
  if uid is not null then
    select * into prev from welcome_back_claims c where c.player = dev;
    if found then
      insert into welcome_back_claims as c (player, day, days, min_days, feedback_id, claimed_at)
      values (uid::text, prev.day, prev.days, prev.min_days, prev.feedback_id, prev.claimed_at)
      on conflict (player) do update set
        day = excluded.day, days = excluded.days, min_days = excluded.min_days,
        feedback_id = excluded.feedback_id, claimed_at = excluded.claimed_at
      where excluded.day > c.day;
      delete from welcome_back_claims c where c.player = dev;
      update feedback f set user_id = uid
      where f.user_id is null and f.device_id = p_device_id and f.from_admin and f.title = 'welcome_back';
    end if;
  end if;

  select * into prev from welcome_back_claims c
  where c.player = any(keys)
  order by c.day desc, (c.player = me) desc
  limit 1;
  if found then
    -- Today's already: the same answer, never a second message.
    if prev.day = p_day then
      return jsonb_build_object('day', prev.day, 'days', prev.days, 'minDays', prev.min_days,
                                'messageId', prev.feedback_id, 'fresh', false);
    end if;
    -- The cooldown runs (or the last one is dated after today: the clock moved back).
    if p_day < prev.day + cool then
      return null;
    end if;
  end if;
  -- A day played after today: the device's clock or zone moved back, so it can't be an absence.
  if exists (select 1 from player_days d where d.player = any(keys) and d.day > p_day) then
    return null;
  end if;
  select max(d.day) into last_day from player_days d where d.player = any(keys) and d.day < p_day;
  -- A brand-new player has nothing to come back from.
  if last_day is null then
    return null;
  end if;
  away := p_day - last_day;
  select t.min_days, t.gifts into tier_days, tier_gifts
  from welcome_back_tiers() t
  where t.min_days <= away
  order by t.min_days desc
  limit 1;
  if tier_days is null then
    return null;
  end if;

  perform set_config('pokedice.system_message', 'on', true);
  insert into feedback (user_id, device_id, player_name, title, message, from_admin, reply, gifts)
  values (
    uid, p_device_id,
    (select left(p.name, 40) from players p where p.player = any(keys) and p.name is not null
     order by (p.player = me) desc limit 1),
    'welcome_back', '', true,
    '@welcome_back:' || jsonb_build_object(
      'days', away, 'minDays', tier_days, 'from', (select min(t.min_days) from welcome_back_tiers() t), 'cooldown', cool
    )::text,
    tier_gifts
  )
  returning id into msg;
  perform set_config('pokedice.system_message', '', true);

  insert into welcome_back_claims as c (player, day, days, min_days, feedback_id, claimed_at)
  values (me, p_day, away, tier_days, msg, now())
  on conflict (player) do update set
    day = excluded.day, days = excluded.days, min_days = excluded.min_days,
    feedback_id = excluded.feedback_id, claimed_at = excluded.claimed_at;
  return jsonb_build_object('day', p_day, 'days', away, 'minDays', tier_days, 'messageId', msg, 'fresh', true);
end
$$;

-- ---------------------------------------------------------------- who may call what

revoke all on function welcome_back_cfg() from public, anon, authenticated;
revoke all on function welcome_back_open() from public, anon, authenticated;
revoke all on function welcome_back_cooldown() from public, anon, authenticated;
revoke all on function welcome_back_tiers() from public, anon, authenticated;
revoke all on function welcome_back_claim(text, date) from public;
grant execute on function welcome_back_claim(text, date) to anon, authenticated;

-- ---------------------------------------------------------------- 5. the content version

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0104_day_care_10_offline_base.sql
-- Two tuning changes for players' first days (2026-10-31):
-- 1. The Day Care opens at 10 species caught instead of 20 (game_config `dayCare.unlockPokedex`), so a new player meets
--    it sooner. Set to 10 on every run: the admin's value from then on is changed in Admin → Config.
-- 2. Offline earnings pay ₽1 an hour before any level is bought (game_config `general.offlineBase`), so every player
--    finds a little waiting when they come back. Added when missing, left alone when the admin has set it.
-- 3. configVersion + 1, so players fetch the new content. Safe to run again.
-- Both are read on the player's device; no server function reads them.
update game_config set value = jsonb_set(value, '{unlockPokedex}', '10'::jsonb) where key = 'dayCare';
update game_config set value = value || '{"offlineBase": 1}'::jsonb where key = 'general' and not (value ? 'offlineBase');
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0105_outfits.sql
-- Outfits (docs/59): Pokémon dressed up, Santa Pikachu first, given as the gift calendar's or the developer's gifts.
-- 1. game_config `outfits`: the switch, Off (left alone when there). An outfit only changes how a Pokémon looks and
--    which species it may evolve into, in the player's own save, so no server function acts for it and none reads it.
-- 2. configVersion + 1, so players fetch the new content. Safe to run again.
insert into game_config (key, value) values ('outfits', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

-- ======================================================================== ↓ supabase/migrations/0106_discord_live_posts.sql
-- The live events' posts in Discord's #events (docs/50 §2): which ones went out. The Netlify job
-- (netlify/functions/discord-live.mts) runs every minute and takes a post's key here before sending it, so each event's
-- start, and each Monday's calendar, is posted once. Keys: `start:<run id>:<start>` and `week:<Monday, YYYY-MM-DD>`.
-- The job alone reads and writes it, with the service role: no policy, nothing for players.
-- Safe to run again.

create table if not exists discord_live_posts (
  key text primary key,
  posted_at timestamptz not null default now()
);
alter table discord_live_posts enable row level security;
revoke all on discord_live_posts from anon, authenticated;

-- Today's Special Shop start went out from the GitHub workflow (2026-10-31): the job must not post it again.
insert into discord_live_posts (key)
values ('start:58af3405-c865-4961-a8eb-3264a34ddcfe:2026-10-31T11:00:00.000Z')
on conflict (key) do nothing;

-- ======================================================================== ↓ supabase/migrations/0107_friendship.sql
-- Friendship streaks and the Friend Market (docs/60). Two friends who interact on a UTC day keep a streak going: a
-- raid fought beside the other's team (either way round), a trade between them, or an Egg the Day Care made with the
-- other's Pokémon. Each new day of a streak pays both of them Heart Scales, more the longer it runs (3 a day on days
-- 1–3, 4 on 4–7, 5 on 8–14, 6 on 15–30, 7 from day 31), at most 50 a player a UTC day across every friend. A day with
-- no interaction ends the streak. The coins buy from the Friend Market, a weekly shop (Monday 00:00 UTC): Friend Balls,
-- Rare Candies, Talent Candies and one shiny Pokémon of the week, each with its weekly limit.
--
-- 1. game_config `friendship`: the switch (Off / On for admin / On for everyone, Off by default: docs/15 §20) and its
--    numbers, inserted only if missing. friendship_cfg() lays the admin's row over the game's defaults
--    (engine/defaults.ts; tests/friendship-sql.test.ts keeps the two the same).
-- 2. friendship_streaks (one row per pair, the smaller id first, as friendships), friendship_wallets (the coins, and
--    what was earned on the wallet's day), friendship_log (who paid what, kept 8 days: the Friends page's "today").
-- 3. friendship_touch(): the one place a streak moves and coins are paid. Called by
--    - the trade trigger (a listing taken between two friends),
--    - friendship_raid(p_helpers, p_key): the raider, after a raid fight beside friends' teams (won or lost),
--    - friendship_egg(p_friend): the game, after the Day Care made an Egg with a friend's Pokémon (the Day Care runs in
--      the game; the server checks the two are friends and the friend has a Pokémon at their Day Care).
-- 4. friendship_status(): the caller's wallet, streaks, today and this week's purchases; null while the switch is off
--    for them. friend_market_buy(): a purchase, priced and limited by the server, handed back as gifts the game puts
--    in its save (engine/gifts.ts); friend_market_applied(): the game has them. A purchase not marked applied comes
--    back in the status until it is (a tab closed mid-way loses nothing; the save remembers the ids it applied).
-- 5. Removing a friend ends your streak; Delete my data (the main save) takes the wallet and the purchases.
-- 6. The Friend Ball in items, as src/data/items.json has it: +3 on the catch die as an Ultra Ball, and more chances
--    of the hidden talent on its catch by the player's best streak (the game's: engine/friendship.ts friendBallTalent).
--
-- Run after 0106; safe to run again.

-- ---------------------------------------------------------------- 1. the switch and the numbers

insert into game_config (key, value) values ('friendship', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

create or replace function friendship_defaults()
returns jsonb
language sql immutable as $$
  select '{
    "access": "off",
    "tiers": [
      {"from": 1, "coins": 3}, {"from": 4, "coins": 4}, {"from": 8, "coins": 5}, {"from": 15, "coins": 6},
      {"from": 31, "coins": 7}
    ],
    "dailyCap": 50,
    "market": [
      {"key": "friend-ball", "price": 5, "limit": 20},
      {"key": "rare-candy", "price": 15, "limit": 10},
      {"key": "talent-candy", "price": 60, "limit": 2}
    ],
    "shiny": {"price": 150, "level": 15, "pool": [175, 133, 172, 173, 174, 447, 440, 446, 427, 298, 433, 527]},
    "ballBoost": [1, 2, 3, 4, 5]
  }'::jsonb
$$;

create or replace function friendship_cfg()
returns jsonb
language sql stable security definer set search_path = public as $$
  select friendship_defaults()
  || coalesce((select value from game_config where key = 'friendship' and jsonb_typeof(value) = 'object'), '{}'::jsonb)
$$;

create or replace function friendship_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(friendship_cfg() ->> 'access', 'off') = 'all'
      or (friendship_cfg() ->> 'access' = 'admin' and is_admin())
$$;

create or replace function friendship_day()
returns date
language sql stable as $$ select (now() at time zone 'UTC')::date $$;

-- The market's week: its Monday.
create or replace function friendship_week(p_day date default null)
returns date
language sql stable as $$
  select d - (extract(isodow from d)::int - 1) from (select coalesce(p_day, friendship_day()) d) s
$$;

-- What a streak's day pays: the tier with the highest `from` it has reached (engine/friendship.ts streakCoins).
create or replace function friendship_coins_for(p_streak int)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select greatest(0, least(99, (t ->> 'coins')::int))
    from jsonb_array_elements(case when jsonb_typeof(friendship_cfg() -> 'tiers') = 'array'
                                   then friendship_cfg() -> 'tiers' else '[]'::jsonb end) t
    where t ->> 'from' ~ '^[0-9]{1,4}$' and t ->> 'coins' ~ '^[0-9]{1,2}$' and (t ->> 'from')::int <= p_streak
    order by (t ->> 'from')::int desc
    limit 1
  ), 0)
$$;

create or replace function friendship_cap()
returns int
language sql stable security definer set search_path = public as $$
  select case when friendship_cfg() ->> 'dailyCap' ~ '^[0-9]{1,4}$' then (friendship_cfg() ->> 'dailyCap')::int else 50 end
$$;

-- The shiny of the week: the pool's entry for the week's number (weeks counted from Monday 5 January 1970).
create or replace function friendship_shiny(p_week date default null)
returns int
language sql stable security definer set search_path = public as $$
  select (p -> ((((coalesce(p_week, friendship_week()) - date '1970-01-05') / 7) % jsonb_array_length(p))::int)) ::int
  from (select friendship_cfg() -> 'shiny' -> 'pool' p) s
  where jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0
$$;

-- ---------------------------------------------------------------- 2. the tables

create table if not exists friendship_streaks (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  streak int not null default 0,
  best int not null default 0,
  last_day date not null,
  last_kind text not null check (last_kind in ('raid', 'trade', 'egg')),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendship_streaks_b on friendship_streaks (user_b);

create table if not exists friendship_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  day date not null default (now() at time zone 'UTC')::date,
  earned int not null default 0,          -- earned on `day`: the daily cap counts it
  total int not null default 0             -- earned ever
);

create table if not exists friendship_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  friend uuid not null,
  day date not null,
  kind text not null,
  streak int not null,
  coins int not null,                      -- 0 once the day's cap is reached
  at timestamptz not null default now()
);
create index if not exists friendship_log_user on friendship_log (user_id, day);

create table if not exists friend_market_buys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  key text not null,                       -- an item's key, or 'shiny'
  qty int not null check (qty between 1 and 99),
  cost int not null,
  gifts jsonb not null,
  applied boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists friend_market_buys_user on friend_market_buys (user_id, week);

alter table friendship_streaks enable row level security;
alter table friendship_wallets enable row level security;
alter table friendship_log enable row level security;
alter table friend_market_buys enable row level security;
revoke all on friendship_streaks, friendship_wallets, friendship_log, friend_market_buys from anon, authenticated;
drop policy if exists friendship_streaks_admin on friendship_streaks;
create policy friendship_streaks_admin on friendship_streaks for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friendship_wallets_admin on friendship_wallets;
create policy friendship_wallets_admin on friendship_wallets for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friendship_log_admin on friendship_log;
create policy friendship_log_admin on friendship_log for all using ((select is_admin())) with check ((select is_admin()));
drop policy if exists friend_market_buys_admin on friend_market_buys;
create policy friend_market_buys_admin on friend_market_buys for all using ((select is_admin())) with check ((select is_admin()));

-- ---------------------------------------------------------------- 3. a streak moves

-- Pays one player for one friend's streak day, within the day's cap. Returns what was paid.
create or replace function friendship_pay(p_user uuid, p_friend uuid, p_kind text, p_streak int)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  d date := friendship_day();
  w friendship_wallets;
  pay int;
begin
  insert into friendship_wallets (user_id, day) values (p_user, d) on conflict (user_id) do nothing;
  select * into w from friendship_wallets x where x.user_id = p_user for update;
  if w.day <> d then
    w.earned := 0;
  end if;
  pay := greatest(0, least(friendship_coins_for(p_streak), friendship_cap() - w.earned));
  update friendship_wallets x
    set balance = x.balance + pay, day = d, earned = w.earned + pay, total = x.total + pay
    where x.user_id = p_user;
  delete from friendship_log l where l.user_id = p_user and l.day < d - 7;
  insert into friendship_log (user_id, friend, day, kind, streak, coins) values (p_user, p_friend, d, p_kind, p_streak, pay);
  return pay;
end
$$;

-- Two players interacted: if they are friends and it's the pair's first interaction of the UTC day, the streak goes on
-- (or starts again at 1 after a day without one) and both are paid. Returns the streak, or 0 when nothing moved (not
-- friends, the switch off, or already counted today). Gated as the switch reads for whoever called: the admin's
-- try-out counts the admin's own interactions.
create or replace function friendship_touch(p_one uuid, p_two uuid, p_kind text)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  a uuid := least(p_one, p_two);
  b uuid := greatest(p_one, p_two);
  d date := friendship_day();
  s friendship_streaks;
  n int;
begin
  if a is null or b is null or a = b or p_kind not in ('raid', 'trade', 'egg') or not friendship_open() then
    return 0;
  end if;
  if not exists (select 1 from friendships f where f.user_a = a and f.user_b = b) then
    return 0;
  end if;
  insert into friendship_streaks (user_a, user_b, streak, best, last_day, last_kind)
    values (a, b, 0, 0, d - 2, p_kind) on conflict (user_a, user_b) do nothing;
  select * into s from friendship_streaks x where x.user_a = a and x.user_b = b for update;
  if s.last_day >= d then
    return 0;
  end if;
  n := case when s.last_day = d - 1 then s.streak + 1 else 1 end;
  update friendship_streaks x set streak = n, best = greatest(x.best, n), last_day = d, last_kind = p_kind
    where x.user_a = a and x.user_b = b;
  perform friendship_pay(a, b, p_kind, n);
  perform friendship_pay(b, a, p_kind, n);
  return n;
end
$$;

-- A listing taken between two friends is a trade between them.
create or replace function trade_listings_friendship()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform friendship_touch(new.owner, new.taker, 'trade');
  exception when others then
    -- The trade goes through either way.
    raise warning 'friendship trade %: %', new.id, sqlerrm;
  end;
  return null;
end
$$;
drop trigger if exists trade_listings_friendship on trade_listings;
create trigger trade_listings_friendship after update of status on trade_listings
  for each row when (new.status = 'taken' and old.status is distinct from 'taken' and new.owner is not null and new.taker is not null)
  execute function trade_listings_friendship();

-- The raider fought a raid beside friends' teams (won or lost): each friend whose team was there counts, the day's
-- raid's team (p_key null) or the one left on that progression raid. Returns how many streaks moved.
create or replace function friendship_raid(p_helpers uuid[], p_key text default null, p_realm text default 'main')
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  helper uuid;
  moved int := 0;
begin
  if me is null then
    raise exception 'friendship_signed_out' using errcode = '42501';
  end if;
  if not friendship_open() then
    return 0;
  end if;
  for helper in select distinct h from unnest(coalesce(p_helpers, '{}')) h limit 6 loop
    continue when helper is null or helper = me;
    continue when p_key is null and not exists (select 1 from raid_teams t where t.user_id = helper and t.realm = p_realm);
    continue when p_key is not null and not exists (
      select 1 from raid_progress_teams t where t.user_id = helper and t.realm = p_realm and t.raid_key = p_key);
    if friendship_touch(me, helper, 'raid') > 0 then
      moved := moved + 1;
    end if;
  end loop;
  return moved;
end
$$;

-- The Day Care made an Egg with a friend's Pokémon: they count while that friend has a Pokémon at their Day Care (the
-- one visiting comes from there). Returns the streak, 0 when nothing moved.
create or replace function friendship_egg(p_friend uuid)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'friendship_signed_out' using errcode = '42501';
  end if;
  if not exists (select 1 from player_cards c where c.user_id = p_friend and jsonb_array_length(c.day_care) > 0) then
    return 0;
  end if;
  return friendship_touch(me, p_friend, 'egg');
end
$$;

-- ---------------------------------------------------------------- 4. the status and the market

create or replace function friendship_status()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null or not friendship_open() then null else jsonb_build_object(
    'day', friendship_day(),
    'week', friendship_week(),
    'shiny', friendship_shiny(),
    'balance', coalesce((select w.balance from friendship_wallets w where w.user_id = auth.uid()), 0),
    'earned', coalesce((select w.earned from friendship_wallets w where w.user_id = auth.uid() and w.day = friendship_day()), 0),
    'total', coalesce((select w.total from friendship_wallets w where w.user_id = auth.uid()), 0),
    'streaks', coalesce((
      select jsonb_agg(jsonb_build_object('friend', f.id, 'streak', s.streak, 'best', s.best, 'lastDay', s.last_day,
                                          'lastKind', s.last_kind) order by s.streak desc)
      from friend_ids_of(auth.uid()) f
      join friendship_streaks s on s.user_a = least(auth.uid(), f.id) and s.user_b = greatest(auth.uid(), f.id)
      where s.streak > 0
    ), '[]'::jsonb),
    'today', coalesce((
      select jsonb_agg(jsonb_build_object('friend', l.friend, 'kind', l.kind, 'streak', l.streak, 'coins', l.coins) order by l.at)
      from friendship_log l where l.user_id = auth.uid() and l.day = friendship_day()
    ), '[]'::jsonb),
    'bought', coalesce((
      select jsonb_object_agg(k.key, k.qty) from (
        select b.key, sum(b.qty)::int qty from friend_market_buys b
        where b.user_id = auth.uid() and b.week = friendship_week() group by b.key
      ) k
    ), '{}'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'key', b.key, 'gifts', b.gifts) order by b.at)
      from friend_market_buys b where b.user_id = auth.uid() and not b.applied
    ), '[]'::jsonb)
  ) end
$$;

-- A purchase: `p_key` is a market item's key or 'shiny', `p_qty` how many. Priced and limited here, paid from the
-- wallet, kept unapplied until the game says it has the gifts. Errors: friendship_off, friendship_not_sold,
-- friendship_limit, friendship_too_poor.
create or replace function friend_market_buy(p_key text, p_qty int default 1)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  wk date := friendship_week();
  cfg jsonb := friendship_cfg();
  offer jsonb;
  price int;
  lim int;
  had int;
  cost int;
  dex int;
  lvl int;
  gifts jsonb;
  w friendship_wallets;
  bid uuid;
begin
  if me is null then
    raise exception 'friendship_signed_out' using errcode = '42501';
  end if;
  if not friendship_open() then
    raise exception 'friendship_off' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'friendship_bad_qty' using errcode = '22023';
  end if;
  if p_key = 'shiny' then
    dex := friendship_shiny(wk);
    if dex is null then
      raise exception 'friendship_not_sold' using errcode = 'P0001';
    end if;
    offer := cfg -> 'shiny';
    lim := 1;
    lvl := case when offer ->> 'level' ~ '^[0-9]{1,3}$' then greatest(1, least(100, (offer ->> 'level')::int)) else 15 end;
    gifts := jsonb_build_array(jsonb_build_object('kind', 'pokemon', 'dex', dex, 'level', lvl, 'shiny', true, 'region', 'latest'));
  else
    select e into offer from jsonb_array_elements(case when jsonb_typeof(cfg -> 'market') = 'array' then cfg -> 'market' else '[]'::jsonb end) e
      where e ->> 'key' = p_key limit 1;
    if offer is null then
      raise exception 'friendship_not_sold' using errcode = 'P0001';
    end if;
    lim := case when offer ->> 'limit' ~ '^[0-9]{1,2}$' then (offer ->> 'limit')::int else 0 end;
    gifts := jsonb_build_array(jsonb_build_object('kind', 'item', 'key', p_key, 'qty', p_qty, 'region', 'latest'));
  end if;
  price := case when offer ->> 'price' ~ '^[0-9]{1,5}$' then (offer ->> 'price')::int else null end;
  if price is null or price < 1 then
    raise exception 'friendship_not_sold' using errcode = 'P0001';
  end if;
  -- One purchase at a time per player: the wallet's lock.
  insert into friendship_wallets (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from friendship_wallets x where x.user_id = me for update;
  select coalesce(sum(b.qty), 0) into had from friend_market_buys b where b.user_id = me and b.week = wk and b.key = p_key;
  if had + p_qty > lim then
    raise exception 'friendship_limit' using errcode = 'P0001';
  end if;
  cost := price * p_qty;
  if w.balance < cost then
    raise exception 'friendship_too_poor' using errcode = 'P0001';
  end if;
  update friendship_wallets x set balance = x.balance - cost where x.user_id = me;
  insert into friend_market_buys (user_id, week, key, qty, cost, gifts) values (me, wk, p_key, p_qty, cost, gifts)
    returning friend_market_buys.id into bid;
  return jsonb_build_object('id', bid, 'key', p_key, 'gifts', gifts, 'balance', w.balance - cost);
end
$$;

-- The game has put these purchases in its save.
create or replace function friend_market_applied(p_ids uuid[])
returns void
language sql volatile security definer set search_path = public as $$
  update friend_market_buys b set applied = true where b.user_id = auth.uid() and b.id = any(coalesce(p_ids, '{}'))
$$;

-- ---------------------------------------------------------------- 5. friends removed, data deleted

create or replace function friendships_streak_gone()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendship_streaks s where s.user_a = old.user_a and s.user_b = old.user_b;
  return null;
end
$$;
drop trigger if exists friendships_streak_gone on friendships;
create trigger friendships_streak_gone after delete on friendships for each row execute function friendships_streak_gone();

create or replace function saves_friendship_gone()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendship_wallets where user_id = old.user_id;
  delete from friendship_log where user_id = old.user_id;
  delete from friend_market_buys where user_id = old.user_id;
  return null;
end
$$;
drop trigger if exists saves_friendship_gone on saves;
create trigger saves_friendship_gone after delete on saves
  for each row when (old.realm = 'main') execute function saves_friendship_gone();

-- ---------------------------------------------------------------- 6. the Friend Ball

insert into items (key, name, description, sprite_url, price, effect, in_shop, shop_badges) values
  ('friend-ball', 'Friend Ball', 'More chances to discover hidden talents on catch depending on your best streak, current: ×{x}.',
   'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/friend-ball.png', 100,
   '{"kind":"ball","bonus":3,"talentBoost":true}'::jsonb, false, 0)
on conflict (key) do update set description = excluded.description, effect = excluded.effect;

-- ---------------------------------------------------------------- who may call what

revoke all on function friendship_defaults() from public, anon, authenticated;
revoke all on function friendship_cfg() from public, anon, authenticated;
revoke all on function friendship_open() from public, anon, authenticated;
revoke all on function friendship_coins_for(int) from public, anon, authenticated;
revoke all on function friendship_cap() from public, anon, authenticated;
revoke all on function friendship_shiny(date) from public, anon, authenticated;
revoke all on function friendship_pay(uuid, uuid, text, int) from public, anon, authenticated;
revoke all on function friendship_touch(uuid, uuid, text) from public, anon, authenticated;
revoke all on function trade_listings_friendship() from public, anon, authenticated;
revoke all on function friendships_streak_gone() from public, anon, authenticated;
revoke all on function saves_friendship_gone() from public, anon, authenticated;
revoke all on function friendship_raid(uuid[], text, text) from public, anon;
revoke all on function friendship_egg(uuid) from public, anon;
revoke all on function friendship_status() from public, anon;
revoke all on function friend_market_buy(text, int) from public, anon;
revoke all on function friend_market_applied(uuid[]) from public, anon;
grant execute on function friendship_raid(uuid[], text, text), friendship_egg(uuid), friendship_status(),
  friend_market_buy(text, int), friend_market_applied(uuid[]) to authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);

commit;
