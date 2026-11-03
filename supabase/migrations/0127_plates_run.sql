-- The Stairway of Plates' own switch (docs/64 §4.5, the user's call of 2026-11-01): the Hall of Origin's portal run
-- (an area whose mode says `"skin": "plates"`) opens apart from Distortion World's. Run after 0057; safe to run again.
-- It patches only what this feature changes, over the admin's later edits:
--  1. game_config `platesRun`: the switch, Off (left alone when there).
--  2. plates_run_open(): the switch as the server reads it for the caller, as portal_run_open() (0057).
--  3. 0057's raid_progress_portal, the one place every raid check (raid_progress_special_locked, the team writers'
--     caps) asks whether a raid's area is a portal run on for the caller: a 'plates' area now answers to `platesRun`,
--     every other portal area still to `portalRun`.
--  4. configVersion + 1, so players fetch the new content.
begin;

alter table areas add column if not exists mode jsonb;

insert into game_config (key, value) values ('platesRun', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The switch, as portal_run_open reads its own: on for everyone, or for the admin only. Never null: an odd value is off.
create or replace function plates_run_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'platesRun'), 'off') a) x
$$;

-- 0057's, each portal area on its own switch: a raid key's area mode when it is a portal run and that run's switch is
-- on for the caller (else null: the raid is as before).
create or replace function raid_progress_portal(p_key text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select a.mode from areas a
  where a.id::text = split_part(p_key, ':', 1) and a.mode ->> 'kind' = 'portal'
    and case when a.mode ->> 'skin' = 'plates' then plates_run_open() else portal_run_open() end
$$;

revoke all on function plates_run_open() from public, anon, authenticated;
revoke all on function raid_progress_portal(text) from public, anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
