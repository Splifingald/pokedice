-- Crown Shrine's whiteout (docs/61 §4.3): weather survival in Snowglobe Valley's third secret area, three waves of
-- fixed foes in the blizzard, a bonfire after each, then shiny Abomasnow. Run after 0120; safe to run again.
--  1. Crown Shrine gets its whiteout when it has no mode yet (0120 writes it too, when generated with it; an admin's
--     own mode stays). A no-op where Snowglobe Valley isn't loaded.
--  2. game_config `whiteout`: the switch, Off (left alone when there).
--  3. whiteout_open(): the switch as the server reads it, as nightmare_open() (0060) does. The run itself lives in the
--     player's save (its waves, its bonfires, the boss caught there), so no server function acts on it yet; this is
--     the check any later one goes through.
--  4. configVersion + 1, so players fetch the new content.
begin;

alter table areas add column if not exists mode jsonb;

update areas set mode = '{"kind":"whiteout","waves":[[{"dex":362,"level":47},{"dex":437,"level":47}],[{"dex":614,"level":48},{"dex":586,"level":48},{"dex":359,"level":49}],[{"dex":365,"level":49},{"dex":740,"level":49},{"dex":171,"level":50},{"dex":901,"level":50}]],"weather":"snow","bonfirePercent":40}'::jsonb
 where id = 'd22c8323-edb5-5a4a-8004-a49d833ee24e' and mode is null;

insert into game_config (key, value) values ('whiteout', '{"access": "off"}'::jsonb) on conflict (key) do nothing;

-- The switch: on for everyone, or for the admin only. Never null: an odd value is off.
create or replace function whiteout_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a = 'all' or (a = 'admin' and is_admin()), false)
  from (select coalesce((select value ->> 'access' from game_config where key = 'whiteout'), 'off') a) x
$$;

revoke all on function whiteout_open() from public, anon, authenticated;

insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
