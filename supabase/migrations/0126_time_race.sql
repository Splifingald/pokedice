-- The race of time and space (docs/64 §4.4): Spear Pillar's time trial in Snowglobe Valley. Run after 0060 (it
-- extends 0060's raid_progress_special_locked) and after 0122 when Snowglobe Valley is on the database; safe to run
-- again. It patches only what this feature changes, over the admin's later edits:
--  1. Spear Pillar gets its race (when it has no mode yet: 0122 writes it too; without Snowglobe Valley, nothing).
--  2. game_config `timeRace`: the switch, Off (left alone when there).
--  3. The server's checks: a race area's raids take teams and close (raid_progress_set_team, raid_progress_close,
--     through raid_progress_special_locked) only once the player's cloud save says the race was won at that raid's
--     legend's gate, while the switch is on for them. The portal run's (0057) and the nightmare's (0060) checks stay.
--  4. configVersion + 1, so players fetch the new content.
begin;

alter table areas add column if not exists mode jsonb;

update areas set mode = '{"kind":"timeRace","forks":[["fire","grass"],["dark","psychic"],["dragon","ice"],["electric","ground"]],"legends":[{"type":"water","dex":484},{"type":"steel","dex":483}],"perFork":3,"seconds":720,"shard":{"chance":35,"seconds":30},"items":[{"key":"hyper-potion","qty":2,"weight":40},{"key":"revive","qty":1,"weight":35},{"key":"max-revive","qty":1,"weight":10}],"speed":1.5,"replay":{"forks":[["normal","fairy"],["rock","flying"],["bug","dragon"],["ice","dark"]],"levelBonus":4,"seconds":600},"raid":{"level":70,"upgradeLevel":8,"bars":3,"teamCap":70}}'::jsonb
where id = '4ec17080-5cb8-59c6-b862-45b620296d5d' and mode is null;

insert into game_config (key, value) values ('timeRace', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The switch, as nightmare_open reads its own: on for everyone, or for the admin only. Never null: an odd value is off.
create or replace function time_race_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'timeRace'), 'off') a) x
$$;

-- A raid key's area mode when it is a race and the switch is on for the caller (else null: the raid is as before).
create or replace function raid_progress_time_race(p_key text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select a.mode from areas a
  where a.id::text = split_part(p_key, ':', 1) and a.mode ->> 'kind' = 'timeRace' and time_race_open()
$$;

-- The caller's cloud save says the race of this raid's area was won at this raid's legend's gate: the legend's dex is
-- in its `timeRace.won` (the live block, or the parked one). Each of the area's two raids opens on its own.
create or replace function raid_progress_time_race_won(p_key text, p_realm text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  p_dex text := split_part(p_key, ':', 2);
begin
  if p_dex !~ '^[0-9]+$' then return false; end if;
  return coalesce((
    select coalesce(case when coalesce(d ->> 'region', 'kanto') = a.region_id then d -> 'areaProgress'
                         else d -> 'parked' -> a.region_id -> 'areaProgress' end
                    -> a.id::text -> 'timeRace' -> 'won', '[]'::jsonb) @> to_jsonb(p_dex::int)
    from areas a, (select s.data || '{}'::jsonb d from saves s where s.user_id = auth.uid() and s.realm = p_realm) x
    where a.id::text = split_part(p_key, ':', 1)), false);
end $$;

-- 0060's, with a race area's raids too: a special area's raid (a portal run's, a nightmare's, a race's) the caller
-- can't use yet: its mode is on for them and the cloud save doesn't say it's won (for a race: at that legend's gate).
-- False for every other raid.
create or replace function raid_progress_special_locked(p_key text, p_realm text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if raid_progress_portal(p_key) is not null then return not raid_progress_portal_won(p_key, p_realm); end if;
  if raid_progress_nightmare(p_key) is not null then return not raid_progress_nightmare_won(p_key, p_realm); end if;
  if raid_progress_time_race(p_key) is not null then return not raid_progress_time_race_won(p_key, p_realm); end if;
  return false;
end $$;

revoke all on function time_race_open() from public, anon, authenticated;
revoke all on function raid_progress_time_race(text) from public, anon, authenticated;
revoke all on function raid_progress_time_race_won(text, text) from public, anon, authenticated;
revoke all on function raid_progress_special_locked(text, text) from public, anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
