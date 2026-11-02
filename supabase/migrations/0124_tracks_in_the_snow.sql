-- Tracks in the Snow (docs/64 §4.1): Moonlit Glade's hide and seek, an area special mode (`areas.mode`, kind
-- 'tracks', written on the area by 0122's content). Run after 0122; safe to run again.
-- 1. game_config `tracks`: the switch, Off (left alone when there).
-- 2. tracks_open(): the switch as the server reads it for the caller, as portal_run_open() (0057) and nightmare_open()
--    (0060) read theirs: on for everyone, or for the admin only. The game asks it before a signed-in player enters the
--    glade, so an old build or a hand-made call can't search it while it's off.
-- 3. configVersion + 1, so players fetch the new content.
begin;
insert into game_config (key, value) values ('tracks', '{"access": "off"}'::jsonb) on conflict (key) do nothing;
-- An odd value is off; never null.
create or replace function tracks_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'tracks' and jsonb_typeof(value) = 'object'), 'off') a) x
$$;
revoke all on function tracks_open() from public;
grant execute on function tracks_open() to anon, authenticated;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
