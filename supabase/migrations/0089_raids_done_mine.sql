-- A player's progression raids won, read back from the server (2026-10-29).
--
-- raid_progress_done (0045) records each raid a player wins, keyed as the save keys it (`events.raidsDone`, area id and
-- Pokédex number). No page can write over it, unlike the save: pages left open from a build before 2026-10-22 wrote
-- saves back without every part their build never knew, `raidsDone` among them (0088 refuses those writes now), and
-- the raids they had won opened again. The game reads this list at sign-in and adds back any raid its save lost
-- (engine/progressRaid.ts keepRaidsDone); it only ever adds.
--
-- raid_progress_mine(p_realm): the caller's own raid keys in that realm, oldest first; none when signed out.
--
-- Run after 0045. Safe to run again. seed.sql inlines it (scripts/seed.ts).

begin;

create or replace function raid_progress_mine(p_realm text default 'main')
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.raid_key order by d.done_at, d.raid_key), '{}')
  from raid_progress_done d
  where d.user_id = auth.uid() and d.realm = p_realm
$$;

revoke all on function raid_progress_mine(text) from public, anon;
grant execute on function raid_progress_mine(text) to authenticated;

commit;
